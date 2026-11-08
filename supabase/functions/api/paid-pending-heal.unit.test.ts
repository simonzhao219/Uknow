// healPaidPendingOrders：逐筆呼叫單筆 RPC 的彙總（第 6 波 S1）。假 rpc，不碰資料庫。
import { assertEquals } from 'jsr:@std/assert@1';
import { HEAL_TIME_BUDGET_MS, healPaidPendingOrders, type HealRpc } from './paid-pending-heal.ts';

type Call = { fn: string; args: Record<string, unknown> };

function fakeRpc(
  ids: unknown,
  outcomes: Record<
    string,
    { data?: unknown; error?: { message: string } | null; throws?: boolean }
  >,
  calls: Call[] = [],
  listError: { message: string } | null = null,
): HealRpc {
  return (fn, args) => {
    calls.push({ fn, args });
    if (fn === 'list_paid_pending_order_ids') {
      return Promise.resolve({ data: listError ? null : ids, error: listError });
    }
    const o = outcomes[args.p_order_id as string];
    if (o?.throws) return Promise.reject(new Error('network down'));
    return Promise.resolve({ data: o?.data ?? null, error: o?.error ?? null });
  };
}

Deno.test('healPaidPendingOrders：各 outcome 彙總成舊回傳形狀', async () => {
  const calls: Call[] = [];
  const rpc = fakeRpc(['a', 'b', 'c', 'd', 'e'], {
    a: { data: { outcome: 'completed' } },
    b: { data: { outcome: 'amount_mismatch' } },
    c: { data: { outcome: 'skipped_locked' } },
    d: { data: { outcome: 'failed', error: 'boom' } },
    e: { data: { outcome: 'skipped' } },
  }, calls);
  const { data, error } = await healPaidPendingOrders(rpc);
  assertEquals(error, null);
  assertEquals(data, {
    candidates_found: 5,
    completed_count: 1,
    completed_order_ids: ['a'],
    amount_mismatch: 1,
    skipped_locked: 2,
    failed: [{ order_id: 'd', error: 'boom' }],
    truncated: false,
  });
  assertEquals(calls[0], { fn: 'list_paid_pending_order_ids', args: { p_user_id: null } });
  assertEquals(calls.slice(1).map((c) => c.args.p_order_id), ['a', 'b', 'c', 'd', 'e']);
});

Deno.test('healPaidPendingOrders：單筆 RPC 回錯或擲錯 → 記 failed、繼續下一筆', async () => {
  const rpc = fakeRpc(['a', 'b', 'c'], {
    a: { error: { message: 'timeout' } },
    b: { throws: true },
    c: { data: { outcome: 'completed' } },
  });
  const { data } = await healPaidPendingOrders(rpc, { userId: 'u1' });
  assertEquals(data?.completed_order_ids, ['c']);
  assertEquals(data?.failed.map((f) => f.order_id), ['a', 'b']);
});

Deno.test('healPaidPendingOrders：list 回錯或非陣列 → data null 帶 error，不當成 0 筆', async () => {
  const listErr = await healPaidPendingOrders(fakeRpc(null, {}, [], { message: 'missing fn' }));
  assertEquals(listErr, { data: null, error: { message: 'missing fn' } });
  const shape = await healPaidPendingOrders(fakeRpc({ not: 'array' }, {}));
  assertEquals(shape, { data: null, error: { message: 'list 回傳形狀不符' } });
});

Deno.test('healPaidPendingOrders：超過時間預算 → 停在檢查點、truncated', async () => {
  let t = 0;
  const calls: Call[] = [];
  const rpc: HealRpc = (fn, args) => {
    calls.push({ fn, args });
    if (fn === 'list_paid_pending_order_ids') {
      return Promise.resolve({ data: ['a', 'b', 'c'], error: null });
    }
    t += 6_000; // 每筆 6 秒
    return Promise.resolve({ data: { outcome: 'completed' }, error: null });
  };
  const { data } = await healPaidPendingOrders(rpc, { userId: 'u1', now: () => t });
  assertEquals(HEAL_TIME_BUDGET_MS.perUser, 10_000);
  assertEquals(
    data?.completed_order_ids,
    ['a', 'b'],
    'per-user 預算 10 秒：第 2 筆後超過，第 3 筆不跑',
  );
  assertEquals(data?.truncated, true);
  assertEquals(data?.candidates_found, 3);
  assertEquals(calls[0].args, { p_user_id: 'u1' });
});
