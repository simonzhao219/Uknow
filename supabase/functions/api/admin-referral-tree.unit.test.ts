// ============================================================
// 後台推薦樹端點的參數與錯誤路徑（第 6 波 S3a 階段 5b，不碰資料庫）。
//
// deps.rpc 以假函式注入：驗證 400（uuid／空 q／group）、404（查無此人）、
// RPC 錯誤一律 500 而不是空清單（第 4 波 ref P1-5 同類）、推薦碼正規化、
// 會籍四態由 Edge 推導、第二道守門，以及本檔不反向 import ./index.ts。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { Hono } from 'npm:hono@4';
import { assertShape } from '../_shared/api-contract.ts';
import {
  AdminReferralMemberAuditResponseSchema,
  AdminReferralNodesResponseSchema,
  AdminReferralPaymentsResponseSchema,
  AdminReferralSearchResponseSchema,
} from '../_shared/admin-referral-contract.ts';
import {
  type AdminReferralTreeDeps,
  createAdminReferralTreeHandlers,
} from './admin-referral-tree.ts';

const ID = '11111111-2222-3333-4444-555555555555';

type Call = { fn: string; args: Record<string, unknown> };

function rawNode(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    name: '王大明',
    referral_code: '8048876',
    layer: 1,
    direct_count: 2,
    account_status: 'active',
    end_date: new Date(Date.now() + 200 * 86_400_000).toISOString(),
    suspended_at: null,
    referral_program_joined: true,
    referral_program_joined_at: '2026-10-01T00:00:00Z',
    anomaly_kinds: [],
    anomaly_scan_truncated: false,
    ...over,
  };
}

function setup(opts: {
  data?: unknown;
  error?: unknown;
  authorize?: 401 | 403 | null;
} = {}) {
  const calls: Call[] = [];
  const deps: AdminReferralTreeDeps = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: opts.data ?? null, error: opts.error ?? null });
    },
    authorize: () => Promise.resolve(opts.authorize ?? null),
  };
  const h = createAdminReferralTreeHandlers(deps);
  const app = new Hono();
  app.get('/nodes', h.nodes);
  app.get('/search', h.search);
  app.get('/members/:id', h.member);
  app.get('/members/:id/payments', h.payments);
  return { app, calls };
}

Deno.test('referral-tree nodes：parentId／ensureId 不是 uuid、group 不支援 → 400 且不打 RPC', async () => {
  const { app, calls } = setup();
  for (
    const q of ['parentId=abc', 'ensureId=abc', 'group=all', `group=unplaceable&parentId=${ID}`]
  ) {
    const res = await app.request(`/nodes?${q}`);
    assertEquals(res.status, 400, q);
    await res.body?.cancel();
  }
  assertEquals(calls.length, 0);
});

Deno.test('referral-tree nodes：RPC 錯誤 → 500，不回空清單', async () => {
  const { app } = setup({ error: { message: 'boom' } });
  const res = await app.request('/nodes');
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals('data' in body, false);
});

Deno.test('referral-tree nodes：limit 超過 200 → 夾到 200，並把參數轉成 RPC 參數', async () => {
  const { app, calls } = setup({
    data: { total: 0, nodes: [], pinned: null, unplaceable_count: 0 },
  });
  const res = await app.request(`/nodes?parentId=${ID}&ensureId=${ID}&limit=999&offset=-3`);
  assertEquals(res.status, 200);
  await res.body?.cancel();
  assertEquals(calls[0], {
    fn: 'admin_referral_tree_nodes',
    args: { p_parent: ID, p_group: null, p_ensure_id: ID, p_limit: 200, p_offset: 0 },
  });
});

Deno.test('referral-tree nodes：節點轉成契約形狀，停權者的四態為 suspended', async () => {
  const { app } = setup({
    data: {
      total: 1,
      nodes: [rawNode({ suspended_at: '2026-11-01T00:00:00Z', anomaly_kinds: ['missing_reward'] })],
      pinned: null,
      unplaceable_count: 3,
    },
  });
  const res = await app.request('/nodes');
  const body = await res.json();
  assertShape(AdminReferralNodesResponseSchema, body, 'nodes');
  assertEquals(body.data.nodes[0].status, 'suspended');
  assertEquals(body.data.nodes[0].anomalyKinds, ['missing_reward']);
  assertEquals(body.data.unplaceableCount, 3);
});

Deno.test('referral-tree search：q 只有空白 → 400', async () => {
  const { app, calls } = setup();
  const res = await app.request('/search?q=%20%20');
  assertEquals(res.status, 400);
  await res.body?.cancel();
  assertEquals(calls.length, 0);
});

Deno.test('referral-tree search：全形推薦碼 → p_code 正規化、p_name 保留原字', async () => {
  const { app, calls } = setup({ data: { total: 0, matches: [] } });
  const res = await app.request(`/search?q=${encodeURIComponent('８０４８８７６')}`);
  const body = await res.json();
  assertShape(AdminReferralSearchResponseSchema, body, 'search');
  assertEquals(calls[0].args.p_code, '8048876');
  assertEquals(calls[0].args.p_name, '８０４８８７６');
});

Deno.test('referral-tree search：命中帶 ancestorIds 與無法定位原因', async () => {
  const { app } = setup({
    data: {
      total: 2,
      matches: [
        { ...rawNode(), ancestor_ids: [ID], unplaceable_reason: null },
        { ...rawNode({ layer: null }), ancestor_ids: null, unplaceable_reason: 'cycle' },
      ],
    },
  });
  const body = await (await app.request('/search?q=王')).json();
  assertShape(AdminReferralSearchResponseSchema, body, 'search');
  assertEquals(
    body.data.matches.map((m: { unplaceableReason: string | null }) => m.unplaceableReason),
    [
      null,
      'cycle',
    ],
  );
});

Deno.test('referral-tree members/:id：id 不是 uuid → 400；RPC 回 null → 404；錯誤 → 500', async () => {
  const bad = await setup().app.request('/members/abc');
  assertEquals(bad.status, 400);
  await bad.body?.cancel();

  const missing = await setup({ data: null }).app.request(`/members/${ID}`);
  assertEquals(missing.status, 404);
  await missing.body?.cancel();

  const broken = await setup({ error: { message: 'boom' } }).app.request(`/members/${ID}`);
  assertEquals(broken.status, 500);
  await broken.body?.cancel();
});

Deno.test('referral-tree members/:id：查帳詳情轉成契約形狀', async () => {
  const { app } = setup({
    data: {
      node: rawNode(),
      upline: [{ id: ID, name: '推薦人', referral_code: null }],
      upline_status: 'root',
      rewards: { by_generation: { '1': 200, '2': 100, '3': 0 }, available: 300, total_earned: 300 },
      tasks: {
        month_key: '2026-11',
        monthly_count: 2,
        threshold: 8,
        credits_unclaimed: 1,
        credits_claimed: 0,
      },
      withdrawals: { pending_amount: 1000, awaiting_collection_amount: 0, completed_amount: 2000 },
      referrer_history: {
        past_referrers: [{ id: ID, name: '前推薦人', referral_code: '8048877' }],
        fresh_events: [{
          completed_at: '2026-10-15T00:00:00Z',
          new_referrer_id: ID,
          new_referrer_name: '前推薦人',
          effective: 'confirmed',
        }],
      },
      referrer_mismatch: false,
      anomalies: [],
      payment_summary: { missing_count: 0, mismatch_count: 0 },
    },
  });
  const body = await (await app.request(`/members/${ID}`)).json();
  assertShape(AdminReferralMemberAuditResponseSchema, body, 'member');
  assertEquals(body.data.rewards.byGeneration, { g1: 200, g2: 100, g3: 0 });
});

Deno.test('referral-tree members/:id/payments：轉成契約形狀；查無此人 → 404', async () => {
  const { app, calls } = setup({
    data: {
      total: 1,
      items: [{
        kind: 'payment',
        event_id: ID,
        at: '2026-11-01T00:00:00Z',
        subscription_id: ID,
        claim_id: null,
        generations: [{
          generation: 1,
          result: 'missing',
          reason: null,
          expected_id: ID,
          expected_name: '推薦人',
          actual_id: null,
          actual_name: null,
          actual_amount: null,
        }],
      }],
    },
  });
  const body = await (await app.request(`/members/${ID}/payments?limit=20`)).json();
  assertShape(AdminReferralPaymentsResponseSchema, body, 'payments');
  assertEquals(calls[0], {
    fn: 'admin_referral_payment_audit',
    args: { p_user: ID, p_limit: 20, p_offset: 0 },
  });

  const missing = await setup({ data: null }).app.request(`/members/${ID}/payments`);
  assertEquals(missing.status, 404);
  await missing.body?.cancel();
});

Deno.test('referral-tree：第二道守門拒絕 → 依回傳狀態 401／403 且不打 RPC', async () => {
  for (const status of [401, 403] as const) {
    const { app, calls } = setup({ authorize: status });
    for (const path of ['/nodes', '/search?q=x', `/members/${ID}`, `/members/${ID}/payments`]) {
      const res = await app.request(path);
      assertEquals(res.status, status, path);
      await res.body?.cancel();
    }
    assertEquals(calls.length, 0);
  }
});

Deno.test('admin-referral-tree.ts：不 import ./index.ts（依賴只經 deps 注入）', async () => {
  const source = await Deno.readTextFile(new URL('./admin-referral-tree.ts', import.meta.url));
  assert(!/from\s+['"]\.\/index\.ts['"]/.test(source), '不得反向 import index.ts');
  assert(source.includes('createAdminReferralTreeHandlers'));
  assert(source.includes("from './node-status.ts'"), '四態必須與推薦網絡共用 node-status.ts');
});
