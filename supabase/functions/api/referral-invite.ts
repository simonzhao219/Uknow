// ============================================================
// Email 邀請（R2）：POST /referrals/invites 與 POST /auth/invite/accept 的處理函式。
//
// 依賴方向：本檔**不得 import ./index.ts**（反向匯入會把整個 Hono app 拖進測試，
// 也是循環匯入；referral-invite.test.ts 讀原文把關）。限流常數留在 index.ts（兩支
// regex 守衛讀那裡），由路由註冊處組一次 deps 傳進 createReferralInviteHandlers。
//
// 錯誤形狀 `{ success: false, error: { code, message } }`：前端依 code 分流
// （extractApiErrorCode），message 只是後備。規則本體見規格書 §7.1「Email 邀請」。
// ============================================================

import type { Context } from 'npm:hono@4';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type {
  ReferralInviteAccepted,
  ReferralInviteErrorCode,
  ReferralInviteErrorResponse,
} from '../_shared/api-contract.ts';
import { findForbiddenWord } from '../_shared/recruitment-copy.ts';
import {
  normalizeReferralInviteEmail,
  REFERRAL_INVITE_CONSENT_VERSION,
  type ReferralInviteStamp,
} from '../_shared/referral-invite-payload.ts';
import { rateLimitStrict, refundRateLimit } from './rate-limit-strict.ts';
import { signReferralInviteToken } from './referral-invite-token.ts';

export interface RateWindow {
  max: number;
  windowSeconds: number;
}

export interface ReferralInviteLimits {
  /** 同一推薦人短窗（fail-open）。 */
  perUserHour: RateWindow;
  /** 同一推薦人日窗（fail-open；短窗擋下不扣）。 */
  perUserDay: RateWindow;
  /** 同一信箱（strict；超額 202 不寄）。 */
  target: RateWindow;
  /** 全站兩窗（strict；超額 503，一律不退）。 */
  globalHour: RateWindow;
  globalDay: RateWindow;
}

export interface ReferralInviteDeps {
  sb: () => SupabaseClient;
  requireAuth: (c: Context) => Promise<{ id: string; email?: string } | null>;
  rateLimit: (key: string, max: number, windowSeconds: number) => Promise<boolean>;
  logSystemAlertOnce: (
    source: string,
    dedupe: Record<string, string>,
    context: Record<string, unknown>,
    message?: string,
    severity?: 'info' | 'warning' | 'error',
  ) => Promise<void>;
  read: (key: string) => string | undefined;
  now: () => number;
  /** GoTrue 單次呼叫的逾時；逾時視為「不確定結果」，先對帳再決定。 */
  gotrueTimeoutMs: number;
  limits: ReferralInviteLimits;
}

export type InviteEligibility =
  | { ok: true; code: string; name: string }
  | { ok: false; reason: 'not_joined' | 'restricted' | 'unavailable' };

/**
 * 推薦人能不能寄邀請（業主 Q2-13：已加入推薦計畫且未停權即可，不另查會籍）。
 * 停權先判：停權者不該被引導去「加入推薦計畫」。有效推薦碼是寄信的前提（連結
 * 帶碼），沒有 active 碼視同受限。任一讀取失敗 fail-closed 回 unavailable——
 * 讀不到不是「沒資格」。停權判準同 validate_referral_code（suspended_at is null）。
 */
export async function checkInviteEligibility(
  sb: SupabaseClient,
  userId: string,
): Promise<InviteEligibility> {
  try {
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('name, referral_program_joined, suspended_at')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr || !profile) return { ok: false, reason: 'unavailable' };
    if (profile.suspended_at) return { ok: false, reason: 'restricted' };
    if (!profile.referral_program_joined) return { ok: false, reason: 'not_joined' };

    const { data: codes, error: codeErr } = await sb
      .from('referral_codes')
      .select('code')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);
    if (codeErr) return { ok: false, reason: 'unavailable' };
    const code = codes?.[0]?.code;
    if (!code) return { ok: false, reason: 'restricted' };
    return { ok: true, code, name: profile.name ?? '' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

// ------------------------------------------------------------
// 帳號查詢與 GoTrue 呼叫
// ------------------------------------------------------------

interface AuthUserLookup {
  id: string;
  email_confirmed_at: string | null;
  confirmation_sent_at: string | null;
  referral_invite: unknown;
}

/** find_auth_user_by_email；查詢失敗回 'error'（呼叫端 fail-closed）。 */
async function findAuthUser(
  sb: SupabaseClient,
  email: string,
): Promise<AuthUserLookup | null | 'error'> {
  try {
    const { data, error } = await sb.rpc('find_auth_user_by_email', { p_email: email });
    if (error) return 'error';
    return (data as AuthUserLookup[] | null)?.[0] ?? null;
  } catch {
    return 'error';
  }
}

/**
 * R2 建的空殼：未驗證且 app_metadata.referral_invite 是物件（invites、accept、purge
 * 三處同一判準）。只有 service role 寫得了 app_metadata，章本身就證明是 R2 建的；
 * 不看 invited_at（先蓋章、寄信失敗的帳號沒有它）。
 */
function isShell(u: AuthUserLookup): boolean {
  const stamp = u.referral_invite;
  return !u.email_confirmed_at && typeof stamp === 'object' && stamp !== null &&
    !Array.isArray(stamp);
}

interface GoTrueError {
  status?: number;
  code?: string;
}
type GoTrueResult<R extends { error: GoTrueError | null }> = R | 'timeout';

/** GoTrue 呼叫加逾時；例外與逾時一律當「不確定結果」（可能已提交，先對帳）。 */
async function callGoTrue<R extends { error: GoTrueError | null }>(
  run: () => Promise<R>,
  timeoutMs: number,
): Promise<GoTrueResult<R>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
  } catch {
    return 'timeout';
  } finally {
    clearTimeout(timer);
  }
}

type AnyGoTrueResult = GoTrueResult<{ error: GoTrueError | null }>;

function goTrueFailed(result: AnyGoTrueResult): boolean {
  return result === 'timeout' || result.error !== null;
}

/**
 * GoTrue 寄送結果依 error_code 分類（業主裁決 B；不靠狀態碼猜）：
 * - email_exists：lookup 之後被驗證的競態 → 202＋退
 * - over_email_send_rate_limit → 503＋退＋告警
 * - email_address_invalid／validation_failed：輸入錯不是寄送失敗（Q2-19 的明示例外）→ 400＋退
 * - 其餘 4xx（寄件授權、金鑰）→ 503＋告警、不退
 * - 5xx、逾時、網路例外 → 不確定，先對帳
 */
type SendOutcome =
  | 'sent'
  | 'email_exists'
  | 'send_rate_limited'
  | 'invalid_email'
  | 'rejected'
  | 'uncertain';

function classifySend(result: AnyGoTrueResult): SendOutcome {
  if (result === 'timeout') return 'uncertain';
  const err = result.error;
  if (!err) return 'sent';
  if (err.code === 'email_exists') return 'email_exists';
  if (err.code === 'over_email_send_rate_limit') return 'send_rate_limited';
  if (err.code === 'email_address_invalid' || err.code === 'validation_failed') {
    return 'invalid_email';
  }
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 500) return 'rejected';
  return 'uncertain';
}

function rejectedKind(result: AnyGoTrueResult): string {
  if (result === 'timeout' || !result.error) return 'rejected';
  return result.error.code ?? `status_${result.error.status ?? 'unknown'}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 寄不了的錯誤句都講到「快速分享」（裁決 J：按鈕改名對讀報器無聲）。
const INVITE_MESSAGES: Record<ReferralInviteErrorCode, string> = {
  invalid_email: 'Email 格式不正確',
  self_invite: '不能邀請自己',
  consent_required: '請先勾選同意聲明',
  not_joined: '暫時無法寄送，可改按下方「快速分享」',
  restricted: '暫時無法寄送，可改按下方「快速分享」',
  rate_limited_hour: '已達每小時寄送上限，請稍後再試，或改按下方「快速分享」',
  rate_limited_day: '今天的邀請額度已用完，請明天再試或改按下方「快速分享」',
  unavailable: '暫時無法寄送，可改按下方「快速分享」',
  disabled: 'Email 邀請暫停中，可改按下方「快速分享」',
};

function inviteError(c: Context, status: 400 | 403 | 429 | 503, code: ReferralInviteErrorCode) {
  return c.json(
    {
      success: false,
      error: { code, message: INVITE_MESSAGES[code] },
    } satisfies ReferralInviteErrorResponse,
    status,
  );
}

function accepted(c: Context) {
  return c.json({ accepted: true } satisfies ReferralInviteAccepted, 202);
}

export function createReferralInviteHandlers(deps: ReferralInviteDeps) {
  const invites = async (c: Context): Promise<Response> => {
    const user = await deps.requireAuth(c);
    if (!user) return c.json({ error: '未授權' }, 401);

    // 1. kill switch 與必要設定：缺 secret 簽不出連結、缺 FRONTEND_URL 組不出連結
    if (
      deps.read('REFERRAL_EMAIL_INVITE_ENABLED') !== 'true' ||
      !deps.read('REFERRAL_INVITE_SECRET') ||
      !deps.read('FRONTEND_URL')
    ) {
      return inviteError(c, 503, 'disabled');
    }

    // 2. 資格；推薦人姓名會進信，命中招募禁用字樣就不寄（手冊 4-1-2）
    const client = deps.sb();
    const eligibility = await checkInviteEligibility(client, user.id);
    if (!eligibility.ok) {
      return eligibility.reason === 'unavailable'
        ? inviteError(c, 503, 'unavailable')
        : inviteError(c, 403, eligibility.reason);
    }
    const forbidden = findForbiddenWord(eligibility.name);
    if (forbidden) {
      await deps.logSystemAlertOnce(
        'referral-invite',
        { kind: 'forbidden_name', user_id: user.id },
        { word: forbidden },
        '推薦人姓名含招募禁用字樣，Email 邀請未寄出',
        'warning',
      );
      return inviteError(c, 400, 'restricted');
    }

    // 3. body：正規化結果就是 GoTrue 存入的字串（lookup 與 target 鍵才對得上）。
    //    檢查都在扣額度之前：輸入錯不吃推薦人的額度。
    let body: { email?: unknown; consent?: unknown } | null;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const email = normalizeReferralInviteEmail(body?.email);
    if (!email) return inviteError(c, 400, 'invalid_email');
    if (email === (user.email ?? '').trim().toLowerCase()) {
      return inviteError(c, 400, 'self_invite');
    }
    if (body?.consent !== true) return inviteError(c, 400, 'consent_required');

    // 4. per-user 兩窗，依序計數：短窗擋下不扣日窗；日窗擋下退回短窗那一格
    //    （裁決 A：只退本請求 bump 回 allowed 的鍵）。fail-open 同既有 rateLimit()。
    const { perUserHour, perUserDay } = deps.limits;
    const hourKey = `referral-invite:${user.id}`;
    if (!(await deps.rateLimit(hourKey, perUserHour.max, perUserHour.windowSeconds))) {
      return inviteError(c, 429, 'rate_limited_hour');
    }
    const dayKey = `referral-invite-day:${user.id}`;
    if (!(await deps.rateLimit(dayKey, perUserDay.max, perUserDay.windowSeconds))) {
      await refundRateLimit(client, hourKey);
      return inviteError(c, 429, 'rate_limited_day');
    }

    const admin = client.auth.admin;
    const timeoutMs = deps.gotrueTimeoutMs;
    const emailHash = await sha256Hex(email);
    const refund = async (...keys: string[]) => {
      for (const key of keys) await refundRateLimit(client, key);
    };
    // 告警只放 email 雜湊前 8 碼（system_alerts 不存個資），以 kind 去重
    const alert = (kind: string, context: Record<string, unknown> = {}) =>
      deps.logSystemAlertOnce(
        'referral-invite',
        { kind },
        { email_hash: emailHash.slice(0, 8), ...context },
        `Email 邀請寄送失敗：${kind}`,
        'error',
      );

    // 5. 先查後扣：查帳號狀態，決定要寄才扣 target／全站窗
    const lookup = await findAuthUser(client, email);
    if (lookup === 'error') {
      await refund(hourKey, dayKey);
      return inviteError(c, 503, 'unavailable');
    }
    // 已驗證、自助註冊中（不覆寫對方的驗證碼）、Dashboard 手動 Invite：不寄，回應同形。
    // per-user 額度不退：它是枚舉與濫用的上限。
    if (lookup && !isShell(lookup)) return accepted(c);

    // 6. target（同一信箱 24 小時一封，先到者生效）→ 全站兩窗；strict：出錯不寄
    const { target, globalHour, globalDay } = deps.limits;
    const targetKey = `referral-invite-target:${emailHash}`;
    const targetResult = await rateLimitStrict(client, targetKey, target.max, target.windowSeconds);
    // limited 不退：退了會清掉先到者佔住的名額
    if (targetResult === 'limited') return accepted(c);
    if (targetResult === 'error') {
      await refund(hourKey, dayKey);
      return inviteError(c, 503, 'unavailable');
    }
    for (
      const [key, window] of [
        ['referral-invite-global-hour', globalHour],
        ['referral-invite-global-day', globalDay],
      ] as const
    ) {
      const result = await rateLimitStrict(client, key, window.max, window.windowSeconds);
      if (result !== 'allowed') {
        // 全站鍵一律不退：它是 GoTrue 寄信上限，滿了本來就該收緊
        await refund(targetKey, hourKey, dayKey);
        if (result === 'limited') await alert(`${key}-limited`);
        return inviteError(c, 503, 'unavailable');
      }
    }
    const refundAll = () => refund(targetKey, hourKey, dayKey);

    // 7. 信件資料：連結由後端組好放進 user_metadata（模板只讀得到它）；證據類欄位只放
    //    app_metadata（本人改不動）。推薦人 uuid 不進任何一邊——兩種 metadata 都進對方 JWT。
    const nowMs = deps.now();
    const token = await signReferralInviteToken(email, eligibility.code, nowMs, deps.read);
    const frontendUrl = (deps.read('FRONTEND_URL') ?? '').replace(/\/$/, '');
    const userMetadata = {
      referral_invite_name: eligibility.name,
      referral_invite_url: `${frontendUrl}/register?invite=${encodeURIComponent(token)}`,
    };
    const issuedAt = new Date(nowMs).toISOString();
    const stamp: ReferralInviteStamp = {
      code: eligibility.code,
      consent_at: issuedAt,
      consent_version: REFERRAL_INVITE_CONSENT_VERSION,
      issued_at: issuedAt,
    };

    // GoTrue 確定失敗（非「不確定」）的回應與退額度：對映表的其餘各列
    const respondToFailure = async (outcome: SendOutcome, result: AnyGoTrueResult) => {
      if (outcome === 'email_exists') {
        await refundAll();
        return accepted(c);
      }
      if (outcome === 'send_rate_limited') {
        await refundAll();
        await alert('over_email_send_rate_limit');
        return inviteError(c, 503, 'unavailable');
      }
      if (outcome === 'invalid_email') {
        await refundAll();
        return inviteError(c, 400, 'invalid_email');
      }
      await alert(rejectedKind(result));
      return inviteError(c, 503, 'unavailable');
    };

    // 8a. 新建：inviteUserByEmail 建帳與寄信同一交易（寄失敗不留帳號）→ 再蓋章
    const stampNewUser = async (userId: string): Promise<Response> => {
      const stamped = await callGoTrue(
        () => admin.updateUserById(userId, { app_metadata: { referral_invite: stamp } }),
        timeoutMs,
      );
      if (!goTrueFailed(stamped)) return accepted(c);
      // 補償：沒蓋章的帳號不是 R2 空殼（purge 清不到、重寄也不認），刪掉並清它的稽核列
      // （GoTrue 的 deleteUser 自己會再寫一筆含 email 的事件，所以在它之後清）
      const deleted = await callGoTrue(() => admin.deleteUser(userId), timeoutMs);
      if (goTrueFailed(deleted)) {
        await alert('compensate_delete_failed', { user_id: userId });
      } else {
        await client.rpc('delete_auth_audit_for_users', { p_user_ids: [userId] });
      }
      await refund(targetKey); // 信多半已寄出：per-user 不退
      await alert('stamp_failed');
      return inviteError(c, 503, 'unavailable');
    };

    if (!lookup) {
      const sent = await callGoTrue(
        () => admin.inviteUserByEmail(email, { data: userMetadata }),
        timeoutMs,
      );
      const outcome = classifySend(sent);
      if (outcome === 'sent' && sent !== 'timeout' && sent.data.user) {
        return stampNewUser(sent.data.user.id);
      }
      if (outcome !== 'sent' && outcome !== 'uncertain') return respondToFailure(outcome, sent);
      // 不確定：GoTrue 的建帳與寄信同一交易，查得到帳號＝已提交、信已寄
      const after = await findAuthUser(client, email);
      if (after === 'error') {
        await alert('reconcile_failed');
        return inviteError(c, 503, 'unavailable');
      }
      if (!after) {
        await refundAll();
        await alert('send_failed');
        return inviteError(c, 503, 'unavailable');
      }
      if (after.email_confirmed_at || isShell(after)) return accepted(c);
      return stampNewUser(after.id);
    }

    // 8b. 空殼重寄（＝新邀請，裁決 C）：先合併 metadata（模板讀寄送當下的 user_metadata，
    //     GoTrue 對既存帳號不套用 invite 的 data），再 invite。
    const previous = lookup.referral_invite;
    const updated = await callGoTrue(
      () =>
        admin.updateUserById(lookup.id, {
          user_metadata: userMetadata,
          app_metadata: { referral_invite: stamp },
        }),
      timeoutMs,
    );
    if (goTrueFailed(updated)) {
      await refundAll();
      await alert('resend_update_failed');
      return inviteError(c, 503, 'unavailable');
    }
    const resent = await callGoTrue(() => admin.inviteUserByEmail(email), timeoutMs);
    let outcome = classifySend(resent);
    if (outcome === 'uncertain') {
      // GoTrue 寄成功才更新 confirmation_sent_at（與寄信同一交易）：比寄送前新＝已寄
      const after = await findAuthUser(client, email);
      if (after === 'error') {
        await alert('reconcile_failed');
        return inviteError(c, 503, 'unavailable');
      }
      const sentAt = Date.parse(after?.confirmation_sent_at ?? '');
      const sentBefore = Date.parse(lookup.confirmation_sent_at ?? '');
      if (sentAt > sentBefore || (!Number.isNaN(sentAt) && Number.isNaN(sentBefore))) {
        outcome = 'sent';
      }
    }
    if (outcome === 'sent') return accepted(c);

    // 沒寄出：歸屬與完善資料頁的後備預填不能指向一封沒送達的信 → 以舊章回寫
    const restored = await callGoTrue(
      () => admin.updateUserById(lookup.id, { app_metadata: { referral_invite: previous } }),
      timeoutMs,
    );
    if (goTrueFailed(restored)) await alert('resend_restore_failed');
    if (outcome === 'uncertain') {
      await refundAll();
      await alert('send_failed');
      return inviteError(c, 503, 'unavailable');
    }
    return respondToFailure(outcome, resent);
  };

  return { invites };
}
