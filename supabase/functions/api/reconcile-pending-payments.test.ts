// ============================================================
// reconcilePendingOrders()：對帳核心迴圈（不含真正打 PayUni 的部分—
// 那段被 queryPayUniTradeStatus 卡住，等 PayUni 查詢 API 合約確認才能
// 實作，見 index.ts 內的說明）。這裡用注入的假 queryFn/resolveFn 驗證
// 「找出卡住的 pending 訂單 → 依查詢結果分流 → 統計」這段邏輯本身。
//
// index.ts 目前還沒有匯出 reconcilePendingOrders，也沒有掛
// POST /internal/reconcile-pending-payments，預期 FAIL。
// ============================================================
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';
import { reconcilePendingOrders } from './index.ts';
import {
  type ReconcileHandlerDeps,
  type ReconcileSummary,
  runScheduledReconcile,
} from './reconcile-handler.ts';
import { scheduledRunDeps } from './scheduled-runs.ts';

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  ageMinutes: number,
) {
  const tradeNo = `RECONCILE-${userId}`;
  const createdAt = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    created_at: createdAt,
  });
  if (error) throw new Error(`seed pending order failed: ${error.message}`);
  return tradeNo;
}

Deno.test('reconcilePendingOrders：透過注入的查詢／解析函式收斂卡單', async () => {
  const client = adminClient();
  const successUser = await createTestUser(client, { name: 'Stuck Success' });
  const stillPendingUser = await createTestUser(client, { name: 'Still Pending' });
  const freshUser = await createTestUser(client, { name: 'Too Fresh To Reconcile' });

  try {
    const successTradeNo = await seedPendingOrder(client, successUser.id, 30);
    const stillPendingTradeNo = await seedPendingOrder(client, stillPendingUser.id, 30);
    await seedPendingOrder(client, freshUser.id, 1); // 太新，不該被對帳掃到

    const resolvedCalls: string[] = [];
    const summary = await reconcilePendingOrders(
      client,
      // deno-lint-ignore require-await -- 注入的 test double 要符合 async 契約
      async (merTradeNo: string) => {
        if (merTradeNo === successTradeNo) {
          return {
            stillProcessing: false,
            data: { MerTradeNo: merTradeNo, TradeNo: merTradeNo, Status: 'SUCCESS' },
          };
        }
        if (merTradeNo === stillPendingTradeNo) {
          return { stillProcessing: true };
        }
        throw new Error(`unexpected query for ${merTradeNo}`);
      },
      async (data: Record<string, string>) => {
        resolvedCalls.push(data.MerTradeNo);
        await client.from('payment_orders')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('transaction_id', data.MerTradeNo).eq('status', 'pending');
        return { ok: true as const, status: 'SUCCESS' as const };
      },
      { thresholdMinutes: 20, limit: 50 },
    );

    assertEquals(
      summary.checked,
      2,
      `應該只掃到 2 筆超過門檻的 pending 訂單，實際 ${summary.checked}`,
    );
    assertEquals(summary.resolved, 1);
    assertEquals(summary.stillPending, 1);
    assertEquals(resolvedCalls, [successTradeNo]);

    const { data: successOrder } = await client
      .from('payment_orders').select('status').eq('transaction_id', successTradeNo).single();
    assertEquals(successOrder?.status, 'completed');

    const { data: freshOrder } = await client
      .from('payment_orders').select('status').eq('user_id', freshUser.id).single();
    assertEquals(freshOrder?.status, 'pending', '太新的訂單不該被對帳處理');
  } finally {
    await deleteTestUsers(client, [successUser.id, stillPendingUser.id, freshUser.id]);
  }
});

// ============================================================
// 掃描過濾：已存有 SUCCESS 回應的卡單走 complete_paid_pending_orders
// 自癒，不該進 queryPayUniTradeStatus 的查詢迴圈（金額不符的卡單已有
// 自己的去重告警，不能每輪對帳都再被佔位錯誤重複告警一次）。
// ============================================================
Deno.test('reconcilePendingOrders 只掃「沒有存檔判決」的 pending 訂單', async () => {
  const client = adminClient();
  const noVerdictUser = await createTestUser(client, { name: 'No Verdict' });
  const storedSuccessUser = await createTestUser(client, { name: 'Stored Success' });

  try {
    const noVerdictTradeNo = await seedPendingOrder(client, noVerdictUser.id, 30);
    const storedTradeNo = await seedPendingOrder(client, storedSuccessUser.id, 30);
    // 這筆已存 SUCCESS（金額不符所以自癒收斂不了）——不該被掃到。
    await client.from('payment_orders')
      .update({ payuni_response: { Status: 'SUCCESS', TradeAmt: '9999' } })
      .eq('transaction_id', storedTradeNo);

    const queried: string[] = [];
    const summary = await reconcilePendingOrders(
      client,
      // deno-lint-ignore require-await
      async (merTradeNo: string) => {
        queried.push(merTradeNo);
        return { stillProcessing: true };
      },
      // deno-lint-ignore require-await
      async () => ({ ok: true as const, status: 'SUCCESS' as const }),
      { thresholdMinutes: 20, limit: 50 },
    );

    assertEquals(queried.includes(noVerdictTradeNo), true, '無判決的訂單應該進查詢迴圈');
    assertEquals(queried.includes(storedTradeNo), false, '已存 SUCCESS 的訂單不該進查詢迴圈');
    assertEquals(summary.stillPending >= 1, true);
  } finally {
    await deleteTestUsers(client, [noVerdictUser.id, storedSuccessUser.id]);
  }
});

// ------------------------------------------------------------
// 階段 4（pg-cron-schedulers）：對帳端點接上帳本與租約。
// pg_cron、GitHub 補跑、人工 dispatch 可能同時打進來；租約讓只有一個真的
// 做事，帳本記下每一輪的結局，看門狗據此判斷 pg_cron 是否存活。
// 帳本用真 DB（begin／finish_scheduled_run），對帳迴圈用注入的假結果。
// ------------------------------------------------------------
async function resetLedger() {
  await adminClient().from('scheduled_job_runs').delete().gte('id', 0);
}

async function ledgerRows() {
  const { data } = await adminClient().from('scheduled_job_runs')
    .select('trigger, status, error_code, summary').eq('job', 'reconcile').order('id');
  return data ?? [];
}

function fakeHandlerDeps(
  summary: Partial<ReconcileSummary>,
  opts: { delayMs?: number; throws?: boolean } = {},
): ReconcileHandlerDeps {
  return {
    heal: () => Promise.resolve({ data: null, error: null }),
    reconcile: async () => {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.throws) throw new Error('查詢 pending 訂單失敗');
      return {
        checked: 0,
        resolved: 0,
        stillPending: 0,
        expired: 0,
        queryErrors: 0,
        queryFailures: 0,
        expireErrors: 0,
        unknownStatus: 0,
        incomplete: 0,
        ...summary,
      };
    },
    alertOnce: () => Promise.resolve(),
    now: () => new Date(),
    logError: () => {},
  };
}

Deno.test('對帳端點：兩個請求並行 → 只有一個真的對帳，另一個回 skipped:concurrent', async () => {
  await resetLedger();
  const run = scheduledRunDeps(adminClient());
  const [a, b] = await Promise.all([
    runScheduledReconcile(run, 'pg_cron', fakeHandlerDeps({ checked: 1 }, { delayMs: 400 })),
    new Promise((r) => setTimeout(r, 100)).then(() =>
      runScheduledReconcile(run, 'github', fakeHandlerDeps({ checked: 1 }))
    ),
  ]);
  const bodies = [a.body, b.body] as Array<{ data: Record<string, unknown> }>;
  assertEquals(bodies.filter((x) => x.data.checked === 1).length, 1);
  assertEquals(bodies.filter((x) => x.data.skipped === 'concurrent').length, 1);
  const rows = await ledgerRows();
  assertEquals(
    rows.map((r) => [r.trigger, r.status]).sort(),
    [['github', 'skipped'], ['pg_cron', 'succeeded']],
  );
  await resetLedger();
});

Deno.test('對帳端點：全滅 502 → 帳本 failed／query_all_failed，summary 落帳', async () => {
  await resetLedger();
  const res = await runScheduledReconcile(
    scheduledRunDeps(adminClient()),
    'pg_cron',
    fakeHandlerDeps({ checked: 2, queryErrors: 2 }),
  );
  assertEquals(res.httpStatus, 502);
  const [row] = await ledgerRows();
  assertEquals(row.status, 'failed');
  assertEquals(row.error_code, 'query_all_failed');
  assertEquals((row.summary as Record<string, number>).queryErrors, 2);
  await resetLedger();
});

Deno.test('對帳端點：對帳迴圈擲錯 → 帳本 failed／exception，錯誤照樣往上丟', async () => {
  await resetLedger();
  await assertRejects(() =>
    runScheduledReconcile(
      scheduledRunDeps(adminClient()),
      'manual',
      fakeHandlerDeps({}, { throws: true }),
    )
  );
  const [row] = await ledgerRows();
  assertEquals([row.trigger, row.status, row.error_code], ['manual', 'failed', 'exception']);
  await resetLedger();
});
