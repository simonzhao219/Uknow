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
