// Email 邀請連結 token 的簽／驗純函式契約（不碰資料庫，*.unit.test.ts 走 CI 最快軌）。
// 這個 token 是 accept 端點唯一的身分證明（持有簽章＝收到信的人）：簽發可驗、
// 竄改必拒、逾時必拒、缺金鑰必拒——任何一條破功，拿到別人連結或自造 payload
// 的人就能替別人的信箱設密碼。前端只經 `_shared` 解碼、不驗簽，所以也釘住
// 「簽出來的 token 前端解得回同一組 e／c／x」。
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  decodeReferralInvitePayload,
  REFERRAL_INVITE_CONSENT_TEMPLATE,
  REFERRAL_INVITE_CONSENT_VERSION,
  REFERRAL_INVITE_TOKEN_TTL_SECONDS,
} from '../_shared/referral-invite-payload.ts';
import { signReferralInviteToken, verifyReferralInviteToken } from './referral-invite-token.ts';

const SECRET = 'test-referral-invite-secret-0123456789';
const read = (k: string) => (k === 'REFERRAL_INVITE_SECRET' ? SECRET : undefined);
const EMAIL = 'invitee@example.com';
const CODE = '8048876';
const T0 = 1_700_000_000_000; // 固定毫秒基準，測試決定性
const X0 = Math.floor(T0 / 1000) + REFERRAL_INVITE_TOKEN_TTL_SECONDS;

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.test('signReferralInviteToken／verify：效期內簽發可驗回同一 e／c，x 為 7 天後', async () => {
  const token = await signReferralInviteToken(EMAIL, CODE, T0, read);
  const result = await verifyReferralInviteToken(token, T0 + 60_000, read);
  assertEquals(result, { ok: true, payload: { v: 1, e: EMAIL, c: CODE, x: X0 } });
});

Deno.test('verifyReferralInviteToken：到達 x 的那一秒起 → expired', async () => {
  const token = await signReferralInviteToken(EMAIL, CODE, T0, read);
  assert((await verifyReferralInviteToken(token, X0 * 1000 - 1, read)).ok);
  assertEquals(await verifyReferralInviteToken(token, X0 * 1000, read), {
    ok: false,
    reason: 'expired',
  });
});

Deno.test('verifyReferralInviteToken：換掉 payload 段、沿用原簽章 → invalid', async () => {
  const token = await signReferralInviteToken(EMAIL, CODE, T0, read);
  const [, sig] = token.split('.');
  const forged = `${
    b64url(JSON.stringify({ v: 1, e: 'attacker@example.com', c: CODE, x: X0 }))
  }.${sig}`;
  assertEquals(await verifyReferralInviteToken(forged, T0, read), {
    ok: false,
    reason: 'invalid',
  });
});

Deno.test('verifyReferralInviteToken：簽章段改一碼 → invalid', async () => {
  const token = await signReferralInviteToken(EMAIL, CODE, T0, read);
  const parts = token.split('.');
  assertEquals(parts.length, 2);
  const [payload, sig] = parts;
  // 改第一碼：最後一碼的低位元是 base64 填充，改了可能解出同一組位元組
  const flipped = `${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`;
  assertEquals(await verifyReferralInviteToken(`${payload}.${flipped}`, T0, read), {
    ok: false,
    reason: 'invalid',
  });
});

Deno.test('verifyReferralInviteToken：別把金鑰簽的 token → invalid', async () => {
  const otherRead = (k: string) => (k === 'REFERRAL_INVITE_SECRET' ? 'another-secret' : undefined);
  const token = await signReferralInviteToken(EMAIL, CODE, T0, otherRead);
  assertEquals(await verifyReferralInviteToken(token, T0, read), { ok: false, reason: 'invalid' });
});

Deno.test('verifyReferralInviteToken：格式不對（空字串、缺段、多段、非 base64）→ invalid', async () => {
  for (const bad of ['', 'onlyonepart', 'a.b.c', '.sig', 'payload.', '%%%.%%%']) {
    assertEquals(
      await verifyReferralInviteToken(bad, T0, read),
      { ok: false, reason: 'invalid' },
      `token=${JSON.stringify(bad)}`,
    );
  }
});

Deno.test('verifyReferralInviteToken：簽章正確但 payload 版本不是 1 → invalid', async () => {
  // 簽章只證明「我們簽過」；payload 形狀仍要守，否則日後改版的 token 會被舊碼誤讀
  const token = await signReferralInviteToken(EMAIL, CODE, T0, read);
  const [payload] = token.split('.');
  const v2 = b64url(JSON.stringify({ v: 2, e: EMAIL, c: CODE, x: X0 }));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(v2)));
  let binary = '';
  for (const b of sig) binary += String.fromCharCode(b);
  const sigB64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert(payload !== v2);
  assertEquals(await verifyReferralInviteToken(`${v2}.${sigB64}`, T0, read), {
    ok: false,
    reason: 'invalid',
  });
});

Deno.test('缺 REFERRAL_INVITE_SECRET → 簽發與驗證都拋錯（fail-closed，絕不用空金鑰）', async () => {
  const emptyRead = (_k: string) => undefined;
  await assertRejects(
    () => signReferralInviteToken(EMAIL, CODE, T0, emptyRead),
    Error,
    'REFERRAL_INVITE_SECRET',
  );
  await assertRejects(
    () => verifyReferralInviteToken('x.y', T0, emptyRead),
    Error,
    'REFERRAL_INVITE_SECRET',
  );
});

Deno.test('verifyReferralInviteToken：驗章走 crypto.subtle.verify（常數時間）', async () => {
  const token = await signReferralInviteToken(EMAIL, CODE, T0, read);
  const subtle = crypto.subtle as SubtleCrypto & { verify: SubtleCrypto['verify'] };
  const original = subtle.verify;
  let calls = 0;
  subtle.verify = function (...args: Parameters<SubtleCrypto['verify']>) {
    calls++;
    return original.apply(subtle, args);
  };
  try {
    await verifyReferralInviteToken(token, T0, read);
  } finally {
    subtle.verify = original;
  }
  assertEquals(calls, 1);
});

Deno.test('decodeReferralInvitePayload：簽出的 token 前端不驗簽也解得回 v／e／c／x', async () => {
  const token = await signReferralInviteToken(EMAIL, CODE, T0, read);
  assertEquals(decodeReferralInvitePayload(token), { v: 1, e: EMAIL, c: CODE, x: X0 });
});

Deno.test('decodeReferralInvitePayload：非 ASCII 的 email 也原樣解回（UTF-8）', async () => {
  const token = await signReferralInviteToken('用戶@例子.台灣', CODE, T0, read);
  assertEquals(decodeReferralInvitePayload(token)?.e, '用戶@例子.台灣');
});

Deno.test('decodeReferralInvitePayload：壞 base64、壞 JSON、缺欄、版本不符 → null', () => {
  const sig = 'c2ln';
  const cases: Record<string, string> = {
    '沒有分隔點': b64url(JSON.stringify({ v: 1, e: EMAIL, c: CODE, x: X0 })),
    '壞 base64': `%%%.${sig}`,
    '壞 JSON': `${b64url('{not json')}.${sig}`,
    '缺 e': `${b64url(JSON.stringify({ v: 1, c: CODE, x: X0 }))}.${sig}`,
    '空 c': `${b64url(JSON.stringify({ v: 1, e: EMAIL, c: '', x: X0 }))}.${sig}`,
    'x 不是數字': `${b64url(JSON.stringify({ v: 1, e: EMAIL, c: CODE, x: 'soon' }))}.${sig}`,
    'v 是 2': `${b64url(JSON.stringify({ v: 2, e: EMAIL, c: CODE, x: X0 }))}.${sig}`,
    'payload 是陣列': `${b64url('[1,2]')}.${sig}`,
  };
  for (const [label, token] of Object.entries(cases)) {
    assertEquals(decodeReferralInvitePayload(token), null, label);
  }
});

Deno.test('decodeReferralInvitePayload：x 已過也照樣解出（前端不以裝置時鐘判過期）', () => {
  const token = `${b64url(JSON.stringify({ v: 1, e: EMAIL, c: CODE, x: 1 }))}.c2ln`;
  assertEquals(decodeReferralInvitePayload(token), { v: 1, e: EMAIL, c: CODE, x: 1 });
});

// 同意證據（app_metadata.referral_invite.consent_version）指向「當時那一版文案」：
// 文案改了版號沒升，舊證據就會被讀成新文案（裁決 P）。新增版號時在下表補一列。
const CONSENT_TEMPLATE_SHA256: Record<string, string> = {
  '2026-10-26': 'b4e0993b61b34423407c1825e1f21807954d540b8807f7dd6b3b68ccfeaab564',
};

Deno.test('同意聲明：文案的雜湊對得上當前版號（改文案必須升版）', async () => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(REFERRAL_INVITE_CONSENT_TEMPLATE),
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  assertEquals(
    hex,
    CONSENT_TEMPLATE_SHA256[REFERRAL_INVITE_CONSENT_VERSION],
    `文案已變：把 REFERRAL_INVITE_CONSENT_VERSION 升到新日期，並在上表補 '${hex}'`,
  );
});
