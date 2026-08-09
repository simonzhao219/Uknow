// 會員身分「驗證」用的短效簽章 token —— 與推薦碼、PayUni 全部分離的獨立原語。
//
// 為什麼獨立成檔：crypto.ts 是 PayUni 專屬（AES-GCM），沒有可共用的 HMAC/簽章
// 抽象；全專案在此之前沒有 signToken/verifyToken 慣例。這是全新原語，獨立成檔
// 避免污染 PayUni 邏輯。
//
// 設計：HMAC-SHA256 簽 `{sub: member_id, exp}`，輸出 `base64url(payload).base64url(sig)`。
//   * 防偽不防讀：payload 只有隨機 UUID(member_id) + 到期秒數，無姓名/電話/身分證，
//     被 base64 解出來也不構成個資外洩，所以用「簽章」而非「加密」即足夠。
//   * 短效：由呼叫端給 ttl（現場出示情境用 ~90 秒），逾時即失效，降低截圖轉發風險。
//   * fail-closed：MEMBER_TOKEN_SECRET 缺失一律拋錯，**絕不**靜默用空字串當金鑰
//     （否則簽發端與驗證端同缺會用同一把空鑰互相驗過，形同零防偽——比明確報錯危險）。
//   * 常數時間：驗章走 crypto.subtle.verify（Web Crypto HMAC 驗證本即常數時間），
//     不做 `sig !== expected` 的字串比對（本專案已知並修過的 timing side-channel）。

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.length % 4 === 0
    ? normalized
    : normalized + '='.repeat(4 - (normalized.length % 4));
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** 讀密鑰；缺失即拋（fail-closed）。read 可注入以利測試。 */
function readSecret(read: (key: string) => string | undefined): string {
  const secret = read('MEMBER_TOKEN_SECRET');
  if (!secret) {
    throw new Error('MEMBER_TOKEN_SECRET 未設定：拒絕以空金鑰簽發／驗章會員驗證碼');
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

export interface MemberTokenPayload {
  /** 會員 id（= profiles.id = auth.users.id，隨機 UUID，不可枚舉）。 */
  sub: string;
  /** 到期 Unix 秒數。 */
  exp: number;
}

export type VerifyMemberTokenResult =
  | { ok: true; memberId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/**
 * 簽發會員驗證 token。
 * @param nowMs 現在時間（毫秒）——由呼叫端傳入以利測試決定性；端點傳 Date.now()。
 */
export async function signMemberToken(
  memberId: string,
  ttlSeconds: number,
  nowMs: number,
  read: (key: string) => string | undefined = (k) => Deno.env.get(k),
): Promise<string> {
  const secret = readSecret(read);
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const payloadJson = JSON.stringify({ sub: memberId, exp } satisfies MemberTokenPayload);
  const payloadB64 = base64UrlEncode(encoder.encode(payloadJson));
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)));
  return `${payloadB64}.${base64UrlEncode(sig)}`;
}

/**
 * 驗章會員驗證 token。回傳判別式結果；到期／竄改／格式錯各有明確 reason。
 * 先驗簽再驗到期：竄改過的 payload 會在簽章這關就被擋（回 bad_signature）。
 */
export async function verifyMemberToken(
  token: string,
  nowMs: number,
  read: (key: string) => string | undefined = (k) => Deno.env.get(k),
): Promise<VerifyMemberTokenResult> {
  const secret = readSecret(read);
  const parts = (token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [payloadB64, sigB64] = parts;

  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = base64UrlDecode(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(payloadB64));
  if (!valid) return { ok: false, reason: 'bad_signature' };

  let payload: MemberTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    !payload || typeof payload.sub !== 'string' || !payload.sub ||
    typeof payload.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.floor(nowMs / 1000) >= payload.exp) return { ok: false, reason: 'expired' };

  return { ok: true, memberId: payload.sub };
}
