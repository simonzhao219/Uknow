// ============================================================
// Email 邀請（R2）的前後端共用定義 —— 零依賴，Deno 與前端同吃這一份
// ============================================================
//
// 與 @recruitment-copy 同一個模式：檔案物理放在 Deno 側，前端經 alias
// `@referral-invite-payload` 讀入。這裡只放「兩邊都要讀」的東西：token 的
// payload 形狀與純解碼（**不驗簽**——簽／驗只在 api/referral-invite-token.ts，
// 金鑰不出後端）、效期常數、`app_metadata.referral_invite` 的形狀。
//
// 效期放這裡而非 index.ts：四個消費者（簽發、信件文案、卡片文案、前端解碼）
// 有三個在前端；規格書對照由 scripts/check-spec-drift.py 讀本檔。
// ============================================================

/** 邀請連結 token 的 payload。不含推薦人 id（推薦人由 c 經 referral_codes 解回）。 */
export interface ReferralInvitePayload {
  v: 1;
  /** 被邀請人 email（正規化後）。 */
  e: string;
  /** 推薦碼。 */
  c: string;
  /** 到期 Unix 秒數。 */
  x: number;
}

/** 邀請連結效期。命名刻意避開 `_WINDOW_SECONDS`（那是限流窗口的守衛抓取式）。 */
export const REFERRAL_INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * 邀請 email 的文法：一個 @、網域至少一個點；拒顯示名稱、引號、角括號、括號、
 * 逗號、分號、冒號、反斜線與空白。前端送出前與後端受理時用同一條。
 */
export const REFERRAL_INVITE_EMAIL_RE =
  /^[^\s@",<>()[\]\\;:]+@[^\s@",<>()[\]\\;:]+\.[^\s@",<>()[\]\\;:]+$/;
export const REFERRAL_INVITE_EMAIL_MAX_LENGTH = 254;

/**
 * trim＋小寫後合文法就回正規化結果，否則 null。GoTrue 存入的就是小寫後的字串，
 * 所以正規化結果同時是 find_auth_user_by_email 與 target 限流鍵（雜湊）的輸入。
 * 不做 +tag／Gmail 點號的別名正規化（會讓 lookup 與 GoTrue 存入值不一致）。
 */
export function normalizeReferralInviteEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > REFERRAL_INVITE_EMAIL_MAX_LENGTH) return null;
  return REFERRAL_INVITE_EMAIL_RE.test(email) ? email : null;
}

/**
 * `auth.users.raw_app_meta_data.referral_invite`：寄出邀請時由後端蓋章（只有 service role
 * 寫得了 app_metadata，本人不可改寫）。時間一律 ISO-8601 UTC。不存推薦人 uuid——推薦人由
 * `code` 經 referral_codes 解回（app_metadata 會進被邀請人的 JWT）。寫入端是 invites，
 * 讀取端是 purge（以 issued_at 計齡）與完善資料頁的推薦碼後備預填。
 */
export interface ReferralInviteStamp {
  code: string;
  consent_at: string;
  consent_version: string;
  issued_at: string;
}

/**
 * 同意聲明（鏡射參加契約第 22 條三要件；`{名}` 換成推薦人姓名）。只在填了 email 時出現、
 * 必勾；伺服器蓋的是 REFERRAL_INVITE_CONSENT_VERSION，client 只送 `consent: true`。
 * **文案一改就升版號**（裁決 P）。
 */
export const REFERRAL_INVITE_CONSENT_TEMPLATE =
  '我已取得對方同意，由優識生活有限公司蒐集其電子郵件信箱以寄送本邀請，並於其註冊後用於推薦關係歸戶；此信箱為對方本人所有且正確。信中會顯示我的姓名「{名}」';
export const REFERRAL_INVITE_CONSENT_VERSION = '2026-10-26';

export function referralInviteConsentText(name: string): string {
  return REFERRAL_INVITE_CONSENT_TEMPLATE.replace('{名}', name.trim());
}

/** base64url（無填充）→ 位元組；字元不合法時 atob 會拋。 */
export function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.length % 4 === 0
    ? normalized
    : normalized + '='.repeat(4 - (normalized.length % 4));
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * 解碼 token 的 payload 段；**不驗簽**。形狀不對（缺段、壞 base64、壞 JSON、
 * 缺欄、版本不是 1）一律回 null。不看 `x`：過期與否由伺服器判（前端不以
 * 裝置時鐘分流）。
 */
export function decodeReferralInvitePayload(token: string): ReferralInvitePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(parts[0])));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { v, e, c, x } = raw as Record<string, unknown>;
  if (v !== 1) return null;
  if (typeof e !== 'string' || !e || typeof c !== 'string' || !c) return null;
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  return { v, e, c, x };
}
