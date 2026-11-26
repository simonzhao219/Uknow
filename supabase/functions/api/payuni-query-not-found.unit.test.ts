// ============================================================
// W7-2：QUERY03001 改判由程式把關——只有「最近一次正控成功且在 36 小時內」
// （notFoundConfirmed=true）才判「確認查無」；否則與改判前逐項相同。
//
// 「現行行為」的基準（改判前）：QUERY03001 與其他查詢層非 SUCCESS 同路徑——
// queryFailures +1、payuni-query 去重 error、滿 4 天標 expired 前寫
// expired_query_failed error；reconcile_unknown_at 有值的單永不標 expired。
//
// 純單元：client 與 alertOnce 都注入，不碰資料庫（T4）。logSystemAlert（非去重）
// 仍走 index.ts 的 sb()，呼叫期間拿掉 SUPABASE_URL 讓它吞掉（同 reconcile-outcome）。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();
const { reconcilePendingOrders } = await import('./index.ts');

type Order = {
  id: string;
  transaction_id: string;
  user_id: string;
  created_at: string;
  reconcile_unknown_at?: string | null;
  payuni_response?: Record<string, unknown> | null;
};

const OLD = new Date(Date.now() - 5 * 86_400_000).toISOString();
const RECENT = new Date(Date.now() - 60 * 60_000).toISOString();

function fakeClient(orders: Order[]) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  // deno-lint-ignore no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: orders, error: null }),
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => {
        updates.push({ id, patch });
        const done = Promise.resolve({ error: null });
        return Object.assign(done, { eq: () => Promise.resolve({ error: null }) });
      },
    }),
  };
  return { client: { from: () => chain }, updates };
}

type Alert = { source: string; dedupe: Record<string, string>; severity: string };

async function run(
  order: Partial<Order>,
  status: string,
  notFoundConfirmed: boolean | undefined,
) {
  const o: Order = { id: 'o1', transaction_id: 'T1', user_id: 'u1', created_at: OLD, ...order };
  const { client, updates } = fakeClient([o]);
  const alerts: Alert[] = [];
  const url = Deno.env.get('SUPABASE_URL');
  Deno.env.delete('SUPABASE_URL');
  try {
    const summary = await reconcilePendingOrders(
      client,
      () =>
        Promise.resolve({
          stillProcessing: true as const,
          queryFailure: { status, message: '' },
        }),
      () => Promise.resolve({ ok: true }) as never,
      {
        thresholdMinutes: 20,
        limit: 50,
        ...(notFoundConfirmed === undefined ? {} : { notFoundConfirmed }),
        alertOnce: (source, dedupe, _ctx, _msg, severity) => {
          alerts.push({ source, dedupe, severity: severity ?? 'warning' });
          return Promise.resolve();
        },
      },
    );
    return { summary, alerts, updates };
  } finally {
    if (url !== undefined) Deno.env.set('SUPABASE_URL', url);
  }
}

const reasons = (alerts: Alert[]) => alerts.map((a) => `${a.source}:${a.dedupe.reason}`).sort();
const expiredIds = (u: { id: string; patch: Record<string, unknown> }[]) =>
  u.filter((x) => x.patch.status === 'expired').map((x) => x.id);

const CURRENT_OLD_ALERTS = [
  'payuni-query:query_not_success',
  'reconcile-pending-payments:expired_query_failed',
];

// ------------------------------------------------------------
// 正控有效 → 改判
// ------------------------------------------------------------

Deno.test('03001 改判：正控有效、滿 4 天 → 直接 expired、不寫任何告警、計 notFound', async () => {
  const { summary, alerts, updates } = await run({}, 'QUERY03001', true);
  assertEquals(alerts, []);
  assertEquals(expiredIds(updates), ['o1']);
  assertEquals(summary.expired, 1);
  assertEquals(summary.notFound, 1);
  assertEquals(summary.queryFailures, 0);
});

Deno.test('03001 改判：正控有效、未滿 4 天 → 留 pending、不告警、計 notFound', async () => {
  const { summary, alerts, updates } = await run({ created_at: RECENT }, 'QUERY03001', true);
  assertEquals(alerts, []);
  assertEquals(expiredIds(updates), []);
  assertEquals(summary.stillPending, 1);
  assertEquals(summary.notFound, 1);
  assertEquals(summary.queryFailures, 0);
});

// ------------------------------------------------------------
// 正控無效（失敗／過期／無樣本）→ 與現行逐項相同
// ------------------------------------------------------------

for (
  const [label, flag] of [['正控無效', false], ['未傳 notFoundConfirmed', undefined]] as const
) {
  Deno.test(`03001 現行：${label}、滿 4 天 → payuni-query＋expired_query_failed、expired`, async () => {
    const { summary, alerts, updates } = await run({}, 'QUERY03001', flag);
    assertEquals(reasons(alerts), CURRENT_OLD_ALERTS);
    assertEquals(alerts.every((a) => a.severity === 'error'), true);
    assertEquals(expiredIds(updates), ['o1']);
    assertEquals(summary.queryFailures, 1);
    assertEquals(summary.notFound, 0);
  });

  Deno.test(`03001 現行：${label}、未滿 4 天 → 只寫 payuni-query、留 pending`, async () => {
    const { summary, alerts, updates } = await run({ created_at: RECENT }, 'QUERY03001', flag);
    assertEquals(reasons(alerts), ['payuni-query:query_not_success']);
    assertEquals(expiredIds(updates), []);
    assertEquals(summary.stillPending, 1);
    assertEquals(summary.notFound, 0);
  });
}

// ------------------------------------------------------------
// 護欄
// ------------------------------------------------------------

Deno.test('03001 護欄：已存 payuni_response 的單 → 不改判、另寫按單號 error、其餘照現行', async () => {
  const { summary, alerts, updates } = await run(
    { payuni_response: { Status: 'UNKNOWN', MerTradeNo: 'T1' } },
    'QUERY03001',
    true,
  );
  assertEquals(
    reasons(alerts),
    [
      ...CURRENT_OLD_ALERTS,
      'reconcile-pending-payments:not_found_with_response',
    ].sort(),
  );
  const guard = alerts.find((a) => a.dedupe.reason === 'not_found_with_response')!;
  assertEquals(guard.severity, 'error');
  assertEquals(guard.dedupe.tradeNo, 'T1');
  assertEquals(expiredIds(updates), ['o1']);
  assertEquals(summary.notFound, 0);
  assertEquals(summary.queryFailures, 1);
});

Deno.test('03001 護欄：正控無效時已存 payuni_response 的單 → 與現行逐項相同（不加寫護欄告警）', async () => {
  const { alerts } = await run({ payuni_response: { Status: 'UNKNOWN' } }, 'QUERY03001', false);
  assertEquals(reasons(alerts), CURRENT_OLD_ALERTS);
});

Deno.test('03001 護欄：標過 reconcile_unknown_at 的單 → 不改判、不標 expired（PayUni 曾回過這張單）', async () => {
  const { summary, alerts, updates } = await run(
    { reconcile_unknown_at: RECENT },
    'QUERY03001',
    true,
  );
  assertEquals(reasons(alerts), ['payuni-query:query_not_success']);
  assertEquals(updates, []);
  assertEquals(summary.notFound, 0);
  assertEquals(summary.stillPending, 1);
});

// ------------------------------------------------------------
// 其他 QUERY 碼 → 現行
// ------------------------------------------------------------

Deno.test('其他 QUERY 碼：正控有效也不改判（01／02／04 類與 03 類其他碼）', async () => {
  for (const status of ['QUERY01001', 'QUERY02003', 'QUERY03002', 'QUERY04001', 'query03001']) {
    const { summary, alerts, updates } = await run({}, status, true);
    assertEquals(reasons(alerts), CURRENT_OLD_ALERTS, status);
    assertEquals(expiredIds(updates), ['o1'], status);
    assertEquals(summary.notFound, 0, status);
    assertEquals(summary.queryFailures, 1, status);
  }
});
