// ============================================================
// reconcilePendingOrders()：對帳核心迴圈（不含真正打 PayUni 的部分—
// 那段被 queryPayUniTradeStatus 卡住，等 PayUni 查詢 API 合約確認才能
// 實作，見 index.ts 內的說明）。這裡用注入的假 queryFn/resolveFn 驗證
// 「找出卡住的 pending 訂單 → 依查詢結果分流 → 統計」這段邏輯本身。
//
// index.ts 目前還沒有匯出 reconcilePendingOrders，也沒有掛
// POST /internal/reconcile-pending-payments，預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';
import { reconcilePendingOrders } from './index.ts';

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  ageMinutes: number,
) {
  const tradeNo = `RECONCILE-${userId}`;
  const createdAt = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  const { error } = await client.from('payment_orders').insert({
    user_id: userId, amount: 1200, status: 'pending', payment_method: 'payuni',
    transaction_id: tradeNo, created_at: createdAt,
  });
  if (error) throw new Error(`seed pending order failed: ${error.message}`);
  return tradeNo;
}

Deno.test('reconcilePendingOrders resolves stuck orders via the injected query/resolve functions', async () => {
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
      async (merTradeNo: string) => {
        if (merTradeNo === successTradeNo) {
          return { stillProcessing: false, data: { MerTradeNo: merTradeNo, TradeNo: merTradeNo, Status: 'SUCCESS' } };
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

    assertEquals(summary.checked, 2, `應該只掃到 2 筆超過門檻的 pending 訂單，實際 ${summary.checked}`);
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
