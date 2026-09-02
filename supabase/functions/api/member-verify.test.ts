// 會員身分驗證端點的整合行為（需真 Postgres，走 CI api-tests 軌）。
//   * GET  /members/verify-token：登入會員自取短效碼（不變）。
//   * POST /members/verify：**會籍有效的會員或管理員**掃碼 → 回身分＋會籍四態、
//     寫稽核。此端點不在 /admin/* 命名空間下，授權是 handler 自己的責任，
//     所以授權矩陣（401／403／429）在這裡逐格釘住，不能再指望 admin-gate.test。
//
// 掃描者與被掃者是兩個獨立的資格判斷，兩邊都用 deriveNodeStatus：
//   - 掃描者：會籍過期或停權 → 403（前端擋得住，但邊界在後端）。
//   - 被掃者：四態原樣回報（active/expiring/expired/suspended），那正是掃碼要問的事。
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

/** 掃碼請求：scannerToken 是掃描者的 access token，token 是被掃者出示的短效碼。 */
function verifyReq(scannerToken: string | null, token: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (scannerToken) headers.Authorization = `Bearer ${scannerToken}`;
  return app.request('/api/members/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });
}

async function cleanup(
  client: ReturnType<typeof adminClient>,
  ids: string[],
  memberId?: string,
) {
  if (memberId) await client.from('member_verify_logs').delete().eq('member_id', memberId);
  for (const id of ids) await client.from('rate_limits').delete().eq('key', `verify:${id}`);
  await deleteTestUsers(client, ids);
}

Deno.test('POST /members/verify：會籍有效的會員掃碼 → 遮罩姓名＋稽核記到掃描者', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '驗證測試員' });
  const scanner = await createTestUser(client, { name: '掃描測試員' });
  try {
    await payForUser(client, member.id);
    await payForUser(client, scanner.id); // 掃描者自己也要會籍有效

    // 會員自取短效碼
    const memberToken = await getUserAccessToken(client, member.email);
    const selfRes = await app.request('/api/members/verify-token', {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assertEquals(selfRes.status, 200);
    const selfBody = await selfRes.json();
    assertShape(MemberVerifyTokenResponseSchema, selfBody, 'GET /members/verify-token');
    assert(selfBody.data.token.length > 0);

    const scannerToken = await getUserAccessToken(client, scanner.email);
    const res = await verifyReq(scannerToken, selfBody.data.token);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertShape(MemberVerifyResponseSchema, body, 'POST /members/verify');
    // 一般會員只拿得到遮罩名：確認「是不是有效會員」不需要真實全名，
    // 而開放互掃之後，未遮罩等於任何人都能收集他人姓名。
    assertEquals(body.data.displayName, '驗○○○員');
    assertEquals(body.data.nameMasked, true);
    assertEquals(body.data.status, 'active');

    const { data: logs } = await client
      .from('member_verify_logs')
      .select('verifier_id, member_id, result')
      .eq('member_id', member.id);
    assertEquals(logs?.length, 1);
    assertEquals(logs?.[0].verifier_id, scanner.id);
    assertEquals(logs?.[0].result, 'ok');
  } finally {
    await cleanup(client, [member.id, scanner.id], member.id);
  }
});

Deno.test('POST /members/verify：管理員掃碼 → 姓名不遮罩且 nameMasked=false', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '驗證測試員' });
  const admin = await makeAdmin(client);
  try {
    await payForUser(client, member.id);
    // admin 刻意不付款：管理員無會籍也能掃（與 RequireMembershipRoute 的 isAdmin 放行一致）。
    const token = await signMemberToken(member.id, 90, Date.now());
    const adminToken = await getUserAccessToken(client, admin.email);
    const res = await verifyReq(adminToken, token);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data.displayName, '驗證測試員');
    assertEquals(body.data.nameMasked, false);
  } finally {
    await cleanup(client, [member.id, admin.id], member.id);
  }
});

Deno.test('POST /members/verify：被掃者停權 → status=suspended（不因效期內誤判 active）', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '停權員' });
  const scanner = await createTestUser(client, { name: '掃描測試員' });
  try {
    await payForUser(client, member.id);
    await payForUser(client, scanner.id);
    await client.from('profiles').update({ suspended_at: new Date().toISOString() }).eq(
      'id',
      member.id,
    );

    const token = await signMemberToken(member.id, 90, Date.now());
    const scannerToken = await getUserAccessToken(client, scanner.email);
    const res = await verifyReq(scannerToken, token);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.data.status, 'suspended');
  } finally {
    await cleanup(client, [member.id, scanner.id], member.id);
  }
});

Deno.test('POST /members/verify：過期驗證碼 → 400 token_expired 且不留稽核', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '過期碼員' });
  const scanner = await createTestUser(client, { name: '掃描測試員' });
  try {
    await payForUser(client, scanner.id);
    const expired = await signMemberToken(member.id, -10, Date.now());
    const scannerToken = await getUserAccessToken(client, scanner.email);
    const res = await verifyReq(scannerToken, expired);
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.success, false);
    // 「驗證碼過期」與「會籍過期」是不同語意，前端分別呈現。
    assertEquals(body.error.code, 'token_expired');

    const { data: logs } = await client
      .from('member_verify_logs')
      .select('id')
      .eq('member_id', member.id);
    assertEquals(logs?.length ?? 0, 0);
  } finally {
    await cleanup(client, [member.id, scanner.id], member.id);
  }
});

Deno.test('POST /members/verify：掃描者會籍過期 → 403 verifier_not_eligible', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '驗證測試員' });
  const scanner = await createTestUser(client, { name: '過期掃描者' }); // 從未付款＝會籍 expired
  try {
    await payForUser(client, member.id);
    const token = await signMemberToken(member.id, 90, Date.now());
    const scannerToken = await getUserAccessToken(client, scanner.email);
    const res = await verifyReq(scannerToken, token);
    assertEquals(res.status, 403);
    const body = await res.json();
    // 錯誤信封與同一支 handler 的其他分支一致，前端才吃得到 code。
    assertEquals(body.success, false);
    assertEquals(body.error.code, 'verifier_not_eligible');
  } finally {
    await cleanup(client, [member.id, scanner.id], member.id);
  }
});

Deno.test('POST /members/verify：掃描者停權但效期內 → 403（停權與會籍是兩個欄位）', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '驗證測試員' });
  const scanner = await createTestUser(client, { name: '停權掃描者' });
  try {
    await payForUser(client, member.id);
    await payForUser(client, scanner.id); // 效期內
    await client.from('profiles').update({ suspended_at: new Date().toISOString() }).eq(
      'id',
      scanner.id,
    );

    const token = await signMemberToken(member.id, 90, Date.now());
    const scannerToken = await getUserAccessToken(client, scanner.email);
    const res = await verifyReq(scannerToken, token);
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error.code, 'verifier_not_eligible');
  } finally {
    await cleanup(client, [member.id, scanner.id], member.id);
  }
});

Deno.test('POST /members/verify：匿名請求 → 401（端點已不在 /admin/* 守門之下）', async () => {
  const res = await verifyReq(null, 'whatever');
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('POST /members/verify：同一掃描者一分鐘內超過 30 次 → 429 rate_limited', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '驗證測試員' });
  const scanner = await createTestUser(client, { name: '批次掃描者' });
  try {
    await payForUser(client, member.id);
    await payForUser(client, scanner.id);

    // 直接把該掃描者的配額用掉 30 次，下一次請求就是第 31 次。
    // 這同時釘住限流鍵的形狀 `verify:<掃描者 id>`——換成別的鍵（例如 per-IP）
    // 就擋不住「一個人側錄一批他人短效碼後批次驗證」這個開放互掃才有的濫用面。
    for (let i = 0; i < 30; i++) {
      await client.rpc('bump_rate_limit', {
        p_key: `verify:${scanner.id}`,
        p_max: 30,
        p_window_seconds: 60,
      });
    }

    const token = await signMemberToken(member.id, 90, Date.now());
    const scannerToken = await getUserAccessToken(client, scanner.email);
    const res = await verifyReq(scannerToken, token);
    assertEquals(res.status, 429);
    const body = await res.json();
    assertEquals(body.error.code, 'rate_limited');
  } finally {
    await cleanup(client, [member.id, scanner.id], member.id);
  }
});

Deno.test('POST /admin/members/verify：舊路徑已移除 → 404', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  try {
    const adminToken = await getUserAccessToken(client, admin.email);
    const res = await app.request('/api/admin/members/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'whatever' }),
    });
    assertEquals(res.status, 404);
    await res.body?.cancel();
  } finally {
    await cleanup(client, [admin.id]);
  }
});
