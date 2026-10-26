// Email 邀請連結的簽章 token —— accept 端點唯一的身分證明（持有簽章＝收到信的人）。
//
// 比照 member-token.ts：HMAC-SHA256、專用 secret（REFERRAL_INVITE_SECRET）、缺失即拋
// （fail-closed，絕不以空金鑰簽發）、驗章走 crypto.subtle.verify（常數時間）。
// 輸出 `base64url(JSON payload).base64url(sig)`；payload 型別與純解碼在
// `_shared/referral-invite-payload.ts` 給前端共用，簽／驗只在這裡。
//
// 防偽不防讀：payload 是被邀請人自己的 email、推薦碼與到期秒數，不含推薦人 id；
// 連結只到我們的頁，前端讀到即從網址清掉。

import {
  base64UrlToBytes,
  decodeReferralInvitePayload,
  REFERRAL_INVITE_TOKEN_TTL_SECONDS,
  type ReferralInvitePayload,
} from '../_shared/referral-invite-payload.ts';

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 讀密鑰；缺失即拋（fail-closed）。read 可注入以利測試。 */
function readSecret(read: (key: string) => string | undefined): string {
  const secret = read('REFERRAL_INVITE_SECRET');
  if (!secret) {
    throw new Error('REFERRAL_INVITE_SECRET 未設定：拒絕以空金鑰簽發／驗章邀請連結');
  }
  return secret;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export type VerifyReferralInviteTokenResult =
  | { ok: true; payload: ReferralInvitePayload }
  | { ok: false; reason: 'invalid' | 'expired' };

/**
 * 簽發邀請連結 token，效期 REFERRAL_INVITE_TOKEN_TTL_SECONDS。
 * @param nowMs 現在時間（毫秒）——由呼叫端傳入以利測試決定性。
 */
export async function signReferralInviteToken(
  email: string,
  code: string,
  nowMs: number,
  read: (key: string) => string | undefined = (k) => Deno.env.get(k),
): Promise<string> {
  const secret = readSecret(read);
  const payload: ReferralInvitePayload = {
    v: 1,
    e: email,
    c: code,
    x: Math.floor(nowMs / 1000) + REFERRAL_INVITE_TOKEN_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)));
  return `${payloadB64}.${base64UrlEncode(sig)}`;
}

/**
 * 驗章邀請連結 token。先驗簽再看形狀與到期：竄改過的 payload 在簽章這關就被擋。
 * 格式壞、簽章不符、形狀不對都回 `invalid`（accept 對外是同一個 code）。
 */
export async function verifyReferralInviteToken(
  token: string,
  nowMs: number,
  read: (key: string) => string | undefined = (k) => Deno.env.get(k),
): Promise<VerifyReferralInviteTokenResult> {
  const secret = readSecret(read);
  const parts = (token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' };
  const [payloadB64, sigB64] = parts;

  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = base64UrlToBytes(sigB64);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(payloadB64));
  if (!valid) return { ok: false, reason: 'invalid' };

  const payload = decodeReferralInvitePayload(token);
  if (!payload) return { ok: false, reason: 'invalid' };
  if (Math.floor(nowMs / 1000) >= payload.x) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
