// ============================================================
// 後台推薦樹端點經真 app 與真資料庫的契約（第 6 波 S3a 階段 5c）。
//
// 401／403 的守門由 admin-gate.test.ts 統一負責；本檔只驗管理員打得到四支端點、
// 回應通過 api-contract 的 runtime schema，以及查無此人 → 404。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { assertShape } from '../_shared/api-contract.ts';
import {
  AdminReferralLedgerResponseSchema,
  AdminReferralMemberAuditResponseSchema,
  AdminReferralNodesResponseSchema,
  AdminReferralPaymentsResponseSchema,
  AdminReferralSearchResponseSchema,
} from '../_shared/admin-referral-contract.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

Deno.test('GET /admin/referral-tree/*：管理員取得節點、搜尋、查帳詳情與付款查帳 → 契約形狀', async () => {
  const client = adminClient();
  const tag = crypto.randomUUID().slice(0, 6);
  const admin = await createTestUser(client, { name: `樹端點 管理員 ${tag}` });
  const referrer = await createTestUser(client, { name: `樹端點 推薦人 ${tag}` });
  const payer = await createTestUser(client, { name: `樹端點 付款人 ${tag}` });
  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    await client.from('profiles').update({ referred_by_user_id: referrer.id }).eq('id', payer.id);
    assertEquals((await payForUser(client, referrer.id)).error, null);
    assertEquals((await payForUser(client, payer.id)).error, null);
    const token = await getUserAccessToken(client, admin.email);
    const get = (path: string) =>
      app.request(`/api/admin/referral-tree${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

    const top = await get(`/nodes?ensureId=${referrer.id}`);
    assertEquals(top.status, 200);
    assertShape(AdminReferralNodesResponseSchema, await top.json(), 'nodes 頂層');

    const children = await get(`/nodes?parentId=${referrer.id}`);
    const childBody = assertShape(
      AdminReferralNodesResponseSchema,
      await children.json(),
      'nodes 子層',
    );
    assertEquals(childBody.data.nodes.map((n) => n.id), [payer.id]);

    const found = await get(`/search?q=${encodeURIComponent(`樹端點 付款人 ${tag}`)}`);
    const foundBody = assertShape(AdminReferralSearchResponseSchema, await found.json(), 'search');
    assertEquals(foundBody.data.matches[0].ancestorIds, [referrer.id]);

    const member = await get(`/members/${payer.id}`);
    assertEquals(member.status, 200);
    assertShape(AdminReferralMemberAuditResponseSchema, await member.json(), 'member');

    const payments = await get(`/members/${payer.id}/payments`);
    const payBody = assertShape(
      AdminReferralPaymentsResponseSchema,
      await payments.json(),
      'payments',
    );
    assertEquals(payBody.data.items[0].generations[0].result, 'paid');

    const missing = await get(`/members/${crypto.randomUUID()}`);
    assertEquals(missing.status, 404);
    await missing.body?.cancel();
  } finally {
    await deleteTestUsers(client, [admin.id, referrer.id, payer.id]);
  }
});

Deno.test('GET /admin/referral-tree/members/:id/ledger：管理員取得點數來源 → 契約形狀、推薦獎勵帶付款人', async () => {
  const client = adminClient();
  const tag = crypto.randomUUID().slice(0, 6);
  const admin = await createTestUser(client, { name: `帳端點 管理員 ${tag}` });
  const referrer = await createTestUser(client, { name: `帳端點 推薦人 ${tag}` });
  const payer = await createTestUser(client, { name: `帳端點 付款人 ${tag}` });
  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    await client.from('profiles').update({ referred_by_user_id: referrer.id }).eq('id', payer.id);
    assertEquals((await payForUser(client, referrer.id)).error, null);
    assertEquals((await payForUser(client, payer.id)).error, null);
    const token = await getUserAccessToken(client, admin.email);

    const res = await app.request(`/api/admin/referral-tree/members/${referrer.id}/ledger`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200);
    const body = assertShape(AdminReferralLedgerResponseSchema, await res.json(), 'ledger');
    const reward = body.data.items.find((i) => i.type === 'referral_reward')!;
    assertEquals(reward.refereeId, payer.id);
    assert(reward.eventAt !== null, '推薦獎勵帶付款時點');
    assertEquals(body.data.findings, []);
  } finally {
    await deleteTestUsers(client, [admin.id, referrer.id, payer.id]);
  }
});
