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
    unknownStatus: 0,
    unknownByReason: {
      unknown_code: 0,
      missing_field: 0,
      no_matching_trade: 0,
      incomplete_too_long: 0,
    },
    incomplete: 0,
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
  // 全部是碼表外狀態（unknownStatus）也不算全滅：每張單已有自己的 error 告警
  assertEquals(classifyReconcileOutcome(summary({ checked: 3, unknownStatus: 3 })), 'ok');
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

/**
 * 單元測試不得碰資料庫（T4）：迴圈內的 logSystemAlert／logSystemAlertOnce 走
 * index.ts 的 sb()，本機有 SUPABASE_URL 時會真的寫進 system_alerts，污染同一個
 * DB 上其他測試的時間窗（system-alerts-recent 只回 20 筆）。呼叫期間暫時拿掉
 * SUPABASE_URL：sb() 建 client 時直接擲錯，兩支告警函式都會吞掉，計數邏輯不受影響。
 */
async function offline<T>(fn: () => Promise<T>): Promise<T> {
  const url = Deno.env.get('SUPABASE_URL');
  Deno.env.delete('SUPABASE_URL');
  try {
    return await fn();
  } finally {
    if (url !== undefined) Deno.env.set('SUPABASE_URL', url);
  }
}

Deno.test('reconcilePendingOrders：查詢全部擲錯 → queryErrors＝checked', async () => {
  const s = await offline(() =>
    reconcilePendingOrders(
      fakeClient(orders(3, RECENT)),
      () => Promise.reject(new Error('PayUni 查詢 HTTP 403')),
      resolveNever,
      opts,
    )
  );
  assertEquals(s.checked, 3);
  assertEquals(s.queryErrors, 3);
  assertEquals(s.queryFailures, 0);
});

Deno.test('reconcilePendingOrders：全部查詢層非 SUCCESS → 計入 queryFailures、不計 queryErrors', async () => {
  const s = await offline(() =>
    reconcilePendingOrders(
      fakeClient(orders(2, RECENT)),
      () =>
        Promise.resolve({
          stillProcessing: true as const,
          queryFailure: { status: 'ERROR', message: '查無此單' },
        }),
      resolveNever,
      opts,
    )
  );
  assertEquals(s.checked, 2);
  assertEquals(s.queryFailures, 2);
  assertEquals(s.queryErrors, 0);
});

Deno.test('reconcilePendingOrders：標 expired 失敗 → 計入 expireErrors 而非 queryErrors', async () => {
  const s = await offline(() =>
    reconcilePendingOrders(
      fakeClient(orders(2, OLD), { updateError: true }),
      () => Promise.resolve({ stillProcessing: true as const }),
      resolveNever,
      opts,
    )
  );
  assertEquals(s.checked, 2);
  assertEquals(s.expireErrors, 2);
  assertEquals(s.queryErrors, 0);
  assertEquals(s.expired, 0);
});

// ------------------------------------------------------------
// 第 6 波 S1（R5 P2-7）：unknownStatus 依原因分計，四者和＝unknownStatus。
// ------------------------------------------------------------
Deno.test('reconcilePendingOrders：無法判讀的狀態依原因分計 unknownByReason', async () => {
  const list: FakeOrder[] = [
    ...orders(3, RECENT),
    { id: 'o9', transaction_id: 'T9', user_id: 'u9', created_at: OLD },
  ];
  const byTrade: Record<string, unknown> = {
    T0: { stillProcessing: true, unknownStatus: { tradeStatus: '8', reason: 'unknown_code' } },
    T1: { stillProcessing: true, unknownStatus: { tradeStatus: '', reason: 'missing_field' } },
    T2: { stillProcessing: true, unknownStatus: { tradeStatus: '', reason: 'no_matching_trade' } },
    T9: { stillProcessing: true, incomplete: true }, // 超過 expire 天數仍是 B → incomplete_too_long
  };
  const s = await offline(() =>
    reconcilePendingOrders(
      fakeClient(list),
      (t: string) => Promise.resolve(byTrade[t]) as never,
      resolveNever,
      opts,
    )
  );
  assertEquals(s.unknownStatus, 4);
  assertEquals(s.unknownByReason, {
    unknown_code: 1,
    missing_field: 1,
    no_matching_trade: 1,
    incomplete_too_long: 1,
  });
});

// ------------------------------------------------------------
// 第 6 波 S1（R5 P2-8；W6-11）：heal 結果寫進帳本 summary（計數），回應 body 保留原樣；
// heal 失敗只記帳本、不告警。
// ------------------------------------------------------------
const HEAL = {
  candidates_found: 4,
  completed_count: 1,
  completed_order_ids: ['a'],
  amount_mismatch: 1,
  skipped_locked: 1,
  failed: [{ order_id: 'd', error: 'boom' }],
  truncated: false,
};

Deno.test('handleReconcile：三種分支的帳本 summary 都帶 heal 計數、body 帶原樣 heal', async () => {
  for (
    const s of [
      summary({ checked: 2, queryErrors: 2 }),
      summary({ checked: 3, queryErrors: 2 }),
      summary({ checked: 1 }),
    ]
  ) {
    const { deps } = handlerDeps(s);
    deps.heal = () => Promise.resolve({ data: HEAL, error: null });
    const out = await handleReconcile(deps);
    assertEquals(out.summary.heal, {
      candidates: 4,
      completed: 1,
      failed: 1,
      skippedLocked: 1,
      amountMismatch: 1,
      truncated: false,
      error: false,
    });
    const body = out.response.body as { data: { heal: unknown } };
    assertEquals(body.data.heal, HEAL, 'body 的 failed 是陣列、帳本的是數字');
  }
});

Deno.test('handleReconcile：heal 失敗 → 帳本 heal.error=true、照常對帳、不告警', async () => {
  const { deps, alerts } = handlerDeps(summary({ checked: 1 }));
  deps.heal = () => Promise.resolve({ data: null, error: { message: 'missing fn' } });
  const out = await handleReconcile(deps);
  assertEquals(out.status, 'succeeded');
  assertEquals(out.summary.heal, {
    candidates: 0,
    completed: 0,
    failed: 0,
    skippedLocked: 0,
    amountMismatch: 0,
    truncated: false,
    error: true,
  });
  assertEquals(alerts, []);
});
