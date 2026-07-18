// PayUni AES-256-GCM + SHA-256 crypto utilities
// Uses Web Crypto API (native Deno/browser) — no node:crypto dependency

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export async function encryptPayUni(
  data: Record<string, string | number>,
  key: string,
  iv: string
): Promise<string> {
  const plaintext = new URLSearchParams(
    Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
  ).toString();

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'AES-GCM' }, false, ['encrypt']
  );
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: enc.encode(iv), tagLength: 128 },
    cryptoKey,
    enc.encode(plaintext)
  );

  // Web Crypto appends the 16-byte auth tag at the end of the ciphertext
  const encArray = new Uint8Array(encryptedBuf);
  const ct  = toBase64(encArray.slice(0, -16));
  const tag = toBase64(encArray.slice(-16));

  return toHex(new TextEncoder().encode(`${ct}:::${tag}`)).trim();
}

export async function decryptPayUni(
  encryptStr: string,
  key: string,
  iv: string
): Promise<string> {
  const hexBytes = new Uint8Array(encryptStr.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const combined = new TextDecoder().decode(hexBytes);
  const [encData, tagB64] = combined.split(':::');

  const ctBytes  = fromBase64(encData);
  const tagBytes = fromBase64(tagB64);

  // Web Crypto AES-GCM expects ciphertext || tag concatenated
  const ciphertextWithTag = new Uint8Array(ctBytes.length + tagBytes.length);
  ciphertextWithTag.set(ctBytes);
  ciphertextWithTag.set(tagBytes, ctBytes.length);

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'AES-GCM' }, false, ['decrypt']
  );
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: enc.encode(iv), tagLength: 128 },
    cryptoKey,
    ciphertextWithTag
  );

  return new TextDecoder().decode(decryptedBuf);
}

export async function generatePayUniHash(
  encryptStr: string,
  key: string,
  iv: string
): Promise<string> {
  const data = new TextEncoder().encode(`${key}${encryptStr}${iv}`);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(hashBuf)).toUpperCase();
}

// 常數時間字串比較（避免驗簽時的計時側信道）。長度不同直接 false，
// 相同長度則不提早退出，逐字元 XOR 累積差異。
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
