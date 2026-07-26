// member-token 簽/驗純函式的行為契約（不碰資料庫，*.unit.test.ts 走 CI 最快軌）。
// 核身 token 是身分邊界：簽發可驗、竄改必拒、逾時必拒、缺金鑰必拒（fail-closed）——
// 任何一條破功都等於「拿別人的碼或過期的碼也能被認成本人」。
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { signMemberToken, verifyMemberToken } from './member-token.ts';

const SECRET = 'test-member-token-secret-0123456789';
const read = (k: string) => (k === 'MEMBER_TOKEN_SECRET' ? SECRET : undefined);
const MEMBER = '11111111-2222-3333-4444-555555555555';
const T0 = 1_700_000_000_000; // 固定毫秒基準，測試決定性

Deno.test('signMemberToken/verifyMemberToken：有效期內簽發可驗回同一 member_id', async () => {
  const token = await signMemberToken(MEMBER, 90, T0, read);
  const result = await verifyMemberToken(token, T0 + 10_000, read);
  assert(result.ok);
  if (result.ok) assertEquals(result.memberId, MEMBER);
});

Deno.test('verifyMemberToken：逾期 token → expired', async () => {
  const token = await signMemberToken(MEMBER, 90, T0, read);
  const result = await verifyMemberToken(token, T0 + 91_000, read);
  assertEquals(result, { ok: false, reason: 'expired' });
});

Deno.test('verifyMemberToken：竄改 payload → bad_signature', async () => {
  const token = await signMemberToken(MEMBER, 90, T0, read);
  const [, sig] = token.split('.');
  // 換一個「別的 member」的 payload、沿用原簽章 → 簽章對不上
  const forgedPayload = btoa(JSON.stringify({ sub: 'attacker', exp: Math.floor(T0 / 1000) + 90 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const forged = `${forgedPayload}.${sig}`;
  const result = await verifyMemberToken(forged, T0 + 10_000, read);
  assertEquals(result, { ok: false, reason: 'bad_signature' });
});

Deno.test('verifyMemberToken：用別把金鑰簽的 token → bad_signature', async () => {
  const otherRead = (k: string) => (k === 'MEMBER_TOKEN_SECRET' ? 'a-different-secret' : undefined);
  const token = await signMemberToken(MEMBER, 90, T0, otherRead);
  const result = await verifyMemberToken(token, T0 + 10_000, read);
  assertEquals(result, { ok: false, reason: 'bad_signature' });
});

Deno.test('verifyMemberToken：格式不對（缺分隔/空字串）→ malformed', async () => {
  assertEquals(await verifyMemberToken('', T0, read), { ok: false, reason: 'malformed' });
  assertEquals(await verifyMemberToken('onlyonepart', T0, read), {
    ok: false,
    reason: 'malformed',
  });
  assertEquals(await verifyMemberToken('a.b.c', T0, read), { ok: false, reason: 'malformed' });
});

Deno.test('缺 MEMBER_TOKEN_SECRET → 簽發與驗證都拋錯（fail-closed，絕不用空金鑰）', async () => {
  const emptyRead = (_k: string) => undefined;
  await assertRejects(
    () => signMemberToken(MEMBER, 90, T0, emptyRead),
    Error,
    'MEMBER_TOKEN_SECRET',
  );
  await assertRejects(() => verifyMemberToken('x.y', T0, emptyRead), Error, 'MEMBER_TOKEN_SECRET');
});
