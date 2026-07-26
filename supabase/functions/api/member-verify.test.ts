// 會員身分核身端點的整合行為（需真 Postgres，走 CI api-tests 軌）。
//   * GET /members/verify-token：登入會員自取短效碼。
//   * POST /admin/members/verify：admin 掃碼 → 回身分＋會籍四態、寫稽核。
// 守門本身（匿名 401 / 非 admin 403）由 admin-gate.test.ts 的 ADMIN_ROUTES 涵蓋，
// 這裡測「核身結果正確、會籍四態、稽核有寫、token 過期與會籍過期不同語意」。
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';
import {
  assertShape,
  MemberVerifyResponseSchema,
  MemberVerifyTokenResponseSchema,
} from '../_shared/api-contract.ts';

ensureEdgeFunctionEnv();
Deno.env.set('MEMBER_TOKEN_SECRET', 'integration-test-member-secret-abcdef');

const { app } = await import('./index.ts');
const { signMemberToken } = await import('./member-token.ts');

async function makeAdmin(
  client: ReturnType<typeof adminClient>,
): Promise<{ id: string; email: string }> {
  const admin = await createTestUser(client, { name: 'Verify Admin' });
  const { error } = await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
  if (error) throw new Error(`makeAdmin failed: ${error.message}`);
  return admin;
}

function verifyReq(adminToken: string, token: string) {
  return app.request('/api/admin/members/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

Deno.test('member 自取核身碼 → admin 掃碼回身分與 active 會籍，並寫一筆稽核', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '核身測試員' });
  const admin = await makeAdmin(client);
  try {
    await payForUser(client, member.id); // 會籍轉 active

    // 會員自取短效碼
    const memberToken = await getUserAccessToken(client, member.email);
    const selfRes = await app.request('/api/members/verify-token', {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assertEquals(selfRes.status, 200);
    const selfBody = await selfRes.json();
    assertShape(MemberVerifyTokenResponseSchema, selfBody, 'GET /members/verify-token'); // SSOT 形狀把關
    assert(selfBody.data.token.length > 0);

    // admin 掃碼核身
    const adminToken = await getUserAccessToken(client, admin.email);
    const res = await verifyReq(adminToken, selfBody.data.token);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertShape(MemberVerifyResponseSchema, body, 'POST /admin/members/verify'); // SSOT 形狀把關
    assertEquals(body.data.displayName, '核身測試員');
    assertEquals(body.data.status, 'active');

    // 稽核有寫入一筆
    const { data: logs } = await client
      .from('member_verify_logs')
      .select('admin_id, member_id, result')
      .eq('member_id', member.id);
    assertEquals(logs?.length, 1);
    assertEquals(logs?.[0].admin_id, admin.id);
    assertEquals(logs?.[0].result, 'ok');
  } finally {
    await client.from('member_verify_logs').delete().eq('member_id', member.id);
    await deleteTestUsers(client, [member.id, admin.id]);
  }
});

Deno.test('停權會員 → 核身回 status=suspended（不因效期內誤判 active）', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '停權員' });
  const admin = await makeAdmin(client);
  try {
    await payForUser(client, member.id); // 效期內
    await client.from('profiles').update({ suspended_at: new Date().toISOString() }).eq(
      'id',
      member.id,
    );

    const token = await signMemberToken(member.id, 90, Date.now());
    const adminToken = await getUserAccessToken(client, admin.email);
    const res = await verifyReq(adminToken, token);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data.status, 'suspended');
  } finally {
    await client.from('member_verify_logs').delete().eq('member_id', member.id);
    await deleteTestUsers(client, [member.id, admin.id]);
  }
});

Deno.test('過期核身碼 → 400 且 code=token_expired（與會籍 expired 不同語意）', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '過期碼員' });
  const admin = await makeAdmin(client);
  try {
    // ttl 為負 → 立即過期
    const expired = await signMemberToken(member.id, -10, Date.now());
    const adminToken = await getUserAccessToken(client, admin.email);
    const res = await verifyReq(adminToken, expired);
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.error.code, 'token_expired');

    // 過期核身不應留下稽核（沒有成功核到人）
    const { data: logs } = await client
      .from('member_verify_logs')
      .select('id')
      .eq('member_id', member.id);
    assertEquals(logs?.length ?? 0, 0);
  } finally {
    await deleteTestUsers(client, [member.id, admin.id]);
  }
});
