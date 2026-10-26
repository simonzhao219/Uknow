// ============================================================
// Email 邀請(R2)的前後端共用定義 —— 零依賴,Deno 與前端同吃這一份
// ============================================================

/** 邀請連結 token 的 payload。不含推薦人 id(推薦人由 c 經 referral_codes 解回)。 */
export interface ReferralInvitePayload {
  v: 1;
  /** 被邀請人 email(正規化後)。 */
  e: string;
  /** 推薦碼。 */
  c: string;
  /** 到期 Unix 秒數。 */
  x: number;
}

/** 邀請連結效期。 */
export const REFERRAL_INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** 解碼 token 的 payload 段;**不驗簽**。壞了回 null。 */
export function decodeReferralInvitePayload(_token: string): ReferralInvitePayload | null {
  return null;
}
