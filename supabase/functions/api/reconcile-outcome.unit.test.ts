// ============================================================
// ops P1-3：對帳查詢全滅／過半失敗要告警（W5-19）。
//
// 舊行為：每張單的查詢例外只記 warning 並 queryErrors++，端點照樣回
// success——PayUni 查詢 API 改版、403、憑證缺漏時，50 張單每小時全部失敗，
// 卻是綠 run、沒有 LINE，付了錢的人一直卡在待開通。
//
// 判準（plan §2.5、§2.8）：
//   * 只計「擲錯」（queryErrors：HTTP／網路／解密失敗）。查詢層非 SUCCESS
//     （queryFailures）另計、不算全滅——棄付單「查無此單」就走這條，算進去
//     會讓只剩一兩張棄付單時每小時 502；它已有自己的 payuni-query 告警
//   * 標 expired 的 update 失敗另計 expireErrors，不混進 queryErrors
//   * 全滅：checked >= 2 且全部擲錯 → 502＋error 告警（checked=1 是單張偶發，
//     #460 刻意維持 warning）
//   * 過半：checked >= 3 且擲錯過半 → 200＋error 告警＋degraded
//   * 告警去重鍵帶 UTC 小時桶：沒人 resolve 時下一小時再推
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  classifyReconcileOutcome,
  handleReconcile,
  type ReconcileHandlerDeps,
  type ReconcileSummary,
} from './reconcile-handler.ts';
import { reconcilePendingOrders } from './index.ts';

function summary(over: Partial<ReconcileSummary>): ReconcileSummary {
  return {
    checked: 0,
    resolved: 0,
    stillPending: 0,
    expired: 0,
    queryErrors: 0,
    queryFailures: 0,
    expireErrors: 0,
    ...over,
  };
}

Deno.test('classifyReconcileOutcome：只看擲錯數，全滅要 checked>=2、過半要 checked>=3', () => {
  const cases: Array<[number, number, number, string]> = [
    // checked, queryErrors, queryFailures, 預期
    [0, 0, 0, 'ok'],
    [1, 1, 0, 'ok'], // 單張偶發，#460 維持 warning
    [2, 2, 0, 'all_failed'],
    [2, 1, 0, 'ok'], // 1/2 是一半，不算過半
    [3, 2, 0, 'majority_failed'],
    [3, 1, 0, 'ok'],
    [3, 3, 0, 'all_failed'],
    [3, 0, 3, 'ok'], // 全部查詢層非 SUCCESS（棄付單）不算全滅
    [4, 2, 2, 'ok'], // 擲錯恰好一半
    [5, 3, 2, 'majority_failed'],
  ];
  for (const [checked, queryErrors, queryFailures, want] of cases) {
    assertEquals(
      classifyReconcileOutcome(summary({ checked, queryErrors, queryFailures })),
      want,
      `checked=${checked} queryErrors=${queryErrors} queryFailures=${queryFailures}`,
    );
  }
});

type AlertCall = {
  source: string;
  dedupe: Record<string, string>;
  message: string;
  severity: string;
};

function handlerDeps(s: ReconcileSummary) {
  const alerts: AlertCall[] = [];
  const deps: ReconcileHandlerDeps = {
    heal: () => Promise.resolve({ data: { completed: 0 }, error: null }),
    reconcile: () => Promise.resolve(s),
    alertOnce: (source, dedupe, _context, message, severity) => {
      alerts.push({ source, dedupe, message, severity });
      return Promise.resolve();
    },
    now: () => new Date('2026-11-20T01:07:41Z'),
    logError: () => {},
  };
  return { deps, alerts };
}

Deno.test('handleReconcile：查詢全部擲錯 → 502 query_all_failed、帳本 failed、一筆小時桶 error', async () => {
  const s = summary({ checked: 2, queryErrors: 2 });
  const { deps, alerts } = handlerDeps(s);
  const out = await handleReconcile(deps);
  assertEquals(out.status, 'failed');
  assertEquals(out.errorCode, 'query_all_failed');
  assertEquals(out.response.httpStatus, 502);
  const body = out.response.body as {
    success: boolean;
    error: { code: string };
    data: ReconcileSummary;
  };
  assertEquals(body.success, false);
  assertEquals(body.error.code, 'query_all_failed');
  assertEquals(body.data.checked, 2);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].source, 'reconcile-pending-payments');
  assertEquals(alerts[0].dedupe, { reason: 'query_all_failed', hour: '2026-11-20T01' });
  assertEquals(alerts[0].severity, 'error');
  assert(alerts[0].message.startsWith('【對帳】'), alerts[0].message);
  assert(alerts[0].message.includes('2/2'), alerts[0].message);
});

Deno.test('handleReconcile：擲錯過半 → 200、succeeded＋degraded、一筆 query_majority_failed', async () => {
  const { deps, alerts } = handlerDeps(summary({ checked: 3, queryErrors: 2, resolved: 1 }));
  const out = await handleReconcile(deps);
  assertEquals(out.status, 'succeeded');
  assertEquals(out.response.httpStatus, 200);
  assertEquals(out.summary.degraded, true);
  const body = out.response.body as { success: boolean; data: Record<string, unknown> };
  assertEquals(body.success, true);
  assertEquals(body.data.degraded, true);
  assertEquals(alerts.map((a) => a.dedupe.reason), ['query_majority_failed']);
  assert(alerts[0].message.includes('2/3'), alerts[0].message);
});

Deno.test('handleReconcile：少數擲錯或全部是查詢層非 SUCCESS → 200、不告警、不標 degraded', async () => {
  for (
    const s of [summary({ checked: 3, queryErrors: 1 }), summary({ checked: 3, queryFailures: 3 })]
  ) {
    const { deps, alerts } = handlerDeps(s);
    const out = await handleReconcile(deps);
    assertEquals(out.response.httpStatus, 200);
    assertEquals(out.status, 'succeeded');
    assertEquals(out.summary.degraded, undefined);
    assertEquals(alerts, []);
  }
});

// ------------------------------------------------------------
// reconcilePendingOrders 的計數拆分：用假 client，才能讓標 expired 的
// update 失敗（真 DB 上做不出來）。
// ------------------------------------------------------------
type FakeOrder = { id: string; transaction_id: string; user_id: string; created_at: string };

function fakeClient(orders: FakeOrder[], opts: { updateError?: boolean } = {}) {
  // deno-lint-ignore no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: orders, error: null }),
    update: () => ({
      eq: () => ({
        eq: () =>
          Promise.resolve({ error: opts.updateError ? { message: 'update failed' } : null }),
      }),
    }),
  };
  return { from: () => chain };
}

const OLD = new Date(Date.now() - 5 * 86_400_000).toISOString();
const RECENT = new Date(Date.now() - 60 * 60_000).toISOString();

function orders(n: number, createdAt: string): FakeOrder[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `o${i}`,
    transaction_id: `T${i}`,
    user_id: `u${i}`,
    created_at: createdAt,
  }));
}

const resolveNever = () => Promise.resolve({ ok: true }) as never;
const opts = { thresholdMinutes: 20, limit: 50 };

Deno.test('reconcilePendingOrders：查詢全部擲錯 → queryErrors＝checked', async () => {
  const s = await reconcilePendingOrders(
    fakeClient(orders(3, RECENT)),
    () => Promise.reject(new Error('PayUni 查詢 HTTP 403')),
    resolveNever,
    opts,
  );
  assertEquals(s.checked, 3);
  assertEquals(s.queryErrors, 3);
  assertEquals(s.queryFailures, 0);
});

Deno.test('reconcilePendingOrders：全部查詢層非 SUCCESS → 計入 queryFailures、不計 queryErrors', async () => {
  const s = await reconcilePendingOrders(
    fakeClient(orders(2, RECENT)),
    () =>
      Promise.resolve({
        stillProcessing: true as const,
        queryFailure: { status: 'ERROR', message: '查無此單' },
      }),
    resolveNever,
    opts,
  );
  assertEquals(s.checked, 2);
  assertEquals(s.queryFailures, 2);
  assertEquals(s.queryErrors, 0);
});

Deno.test('reconcilePendingOrders：標 expired 失敗 → 計入 expireErrors 而非 queryErrors', async () => {
  const s = await reconcilePendingOrders(
    fakeClient(orders(2, OLD), { updateError: true }),
    () => Promise.resolve({ stillProcessing: true as const }),
    resolveNever,
    opts,
  );
  assertEquals(s.checked, 2);
  assertEquals(s.expireErrors, 2);
  assertEquals(s.queryErrors, 0);
  assertEquals(s.expired, 0);
});
