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
import { normalizeReferralInviteEmail } from '../_shared/referral-invite-payload.ts';
import { refundRateLimit } from './rate-limit-strict.ts';

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

    return accepted(c);
  };

  return { invites };
}
