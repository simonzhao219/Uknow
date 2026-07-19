// ============================================================
// expire_abandoned_pending_orders（migration 0007）：收尾「開了 PayUni 卻
// 從未付款」的孤兒 pending 訂單。
//
// 系統性缺口背景：/payuni/prepare 先把訂單寫成 pending 再導去 PayUni，若使用者
// 從未完成付款，reconcile 的 queryPayUniTradeStatus 對「查無/未付款」一律回
// stillProcessing（刻意不誤標），該訂單因此永遠停在 pending。此函式在超過
// PayUni 連結有效期（+3 天）後，把「從未收到 SUCCESS 回應」的 pending 標為
// cancelled；已存 SUCCESS 的自癒卡單必須被排除、絕不能誤標。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';

let seq = 0;

// 直接塞一筆指定 created_at / payuni_response 的 pending 訂單。
async function seedPending(
  client: ReturnType<typeof adminClient>,
  userId: string,
  opts: { ageDays: number; payuniResponse?: Record<string, unknown> | null },
): Promise<string> {
  const tradeNo = `EXP-${userId}-${seq++}`;
  const createdAt = new Date(Date.now() - opts.ageDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    created_at: createdAt,
    payuni_response: opts.payuniResponse ?? null,
  });
  if (error) throw new Error(`seedPending failed: ${error.message}`);
  return tradeNo;
}

async function statusOf(client: ReturnType<typeof adminClient>, tradeNo: string) {
  const { data } = await client
    .from('payment_orders')
    .select('status, payuni_response')
    .eq('transaction_id', tradeNo)
    .single();
  return data;
}

Deno.test('expire_abandoned_pending_orders：只取消「夠舊 + 從未 SUCCESS」的 pending', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Expiry Payer' });

  try {
    // (1) 夠舊、無任何回應 → 應被取消
    const abandoned = await seedPending(client, user.id, { ageDays: 10, payuniResponse: null });
    // (2) 才剛建立（未過期）→ 應維持 pending
    const recent = await seedPending(client, user.id, { ageDays: 0, payuniResponse: null });
    // (3) 夠舊、但已存 SUCCESS 回應（付了錢待自癒）→ 絕不能被取消
    const paidStuck = await seedPending(client, user.id, {
      ageDays: 10,
      payuniResponse: { Status: 'SUCCESS', MerTradeNo: 'x', TradeAmt: '1200' },
    });

    const { data: expiredCount, error } = await client
      .rpc('expire_abandoned_pending_orders', { p_expiry_days: 4 });
    assertEquals(error, null, `RPC 不該報錯: ${error?.message}`);
    assertEquals(expiredCount, 1); // 只有 (1) 符合

    const a = await statusOf(client, abandoned);
    assertEquals(a?.status, 'cancelled');
    assertEquals((a?.payuni_response as Record<string, unknown>)?.Status, 'EXPIRED');

    const r = await statusOf(client, recent);
    assertEquals(r?.status, 'pending');

    const p = await statusOf(client, paidStuck);
    assertEquals(p?.status, 'pending'); // 自癒卡單受保護
    assertEquals((p?.payuni_response as Record<string, unknown>)?.Status, 'SUCCESS');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('expire_abandoned_pending_orders：門檻邊界（預設較保守）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Expiry Boundary' });

  try {
    // 3 天：仍在 PayUni 連結有效期內，用預設 4 天門檻不應取消
    const justUnder = await seedPending(client, user.id, { ageDays: 3, payuniResponse: null });
    const { data: count } = await client
      .rpc('expire_abandoned_pending_orders', { p_expiry_days: 4 });
    assertEquals(count, 0);
    assertEquals((await statusOf(client, justUnder))?.status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
