// ============================================================
// 殭屍 pending 訂單的終態：使用者建單後棄付（從未進 PayUni 完成交易）
// 的訂單，PayUni 查無此單、永遠 stillProcessing——沒有終態的話它們會
// 累積在掃描視窗最前端（created_at ascending + limit），最終把真正
// 需要對帳的卡單（webhook 沒送達的已付款訂單）餓死在 limit 之外。
//
// 規則：pending 且超過 expireAfterDays（> PayUni ExpireDate 3 天）且
// 本輪查詢仍 stillProcessing → 標成終態 'expired'。已存有 SUCCESS
// 存檔的卡單不在掃描範圍（既有 .or 過濾），永不會被誤標。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';
import { reconcilePendingOrders } from './index.ts';

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  ageMinutes: number,
  payuniResponse?: Record<string, unknown>,
) {
  const tradeNo = `EXPIRE-${userId}`;
  const createdAt = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  const { error } = await client.from('payment_orders').insert({
    user_id: userId, amount: 1200, status: 'pending', payment_method: 'payuni',
    transaction_id: tradeNo, created_at: createdAt,
    ...(payuniResponse ? { payuni_response: payuniResponse } : {}),
  });
  if (error) throw new Error(`seed pending order failed: ${error.message}`);
  return tradeNo;
}

const FIVE_DAYS_MIN = 5 * 24 * 60;

Deno.test('reconcile：超過門檻天數且查無結果的殭屍單標成 expired 終態', async () => {
  const client = adminClient();
  const zombieUser = await createTestUser(client, { name: 'Zombie Abandoned' });
  const recentUser = await createTestUser(client, { name: 'Recently Stuck' });

  try {
    // 補齊基本資料，讓 effective_registration_step 的斷言落在「已填資料、
    // 無在途訂單」的 step 1（createTestUser 只帶 name）。
    await client.from('profiles')
      .update({ phone: '0912345678', birth_date: '1990-01-01' })
      .eq('id', zombieUser.id);
    await seedPendingOrder(client, zombieUser.id, FIVE_DAYS_MIN); // 5 天前棄付
    await seedPendingOrder(client, recentUser.id, 60);            // 1 小時前，還在等 webhook

    const summary = await reconcilePendingOrders(
      client,
      async () => ({ stillProcessing: true }), // PayUni 一律查無此單
      async () => ({ ok: true as const, status: 'SUCCESS' as const }),
      { thresholdMinutes: 20, limit: 50, expireAfterDays: 4 },
    );

    assertEquals(summary.checked, 2);
    assertEquals(summary.expired, 1, `殭屍單應被標終態，summary=${JSON.stringify(summary)}`);
    assertEquals(summary.stillPending, 1, '未達天數門檻的卡單維持 pending 繼續等下一輪');

    const { data: zombie } = await client
      .from('payment_orders').select('status').eq('user_id', zombieUser.id).single();
    assertEquals(zombie?.status, 'expired');

    const { data: recent } = await client
      .from('payment_orders').select('status').eq('user_id', recentUser.id).single();
    assertEquals(recent?.status, 'pending');

    // 終態後使用者回到 step 1（有基本資料、無在途訂單）——不再被
    // buildProfileResponse 當成「付款進行中」。
    const { data: step } = await client.rpc('effective_registration_step', { p_user_id: zombieUser.id });
    assertEquals(step, 1);
  } finally {
    await deleteTestUsers(client, [zombieUser.id, recentUser.id]);
  }
});

Deno.test('reconcile：已存 SUCCESS 存檔的老卡單不在掃描範圍、絕不會被標 expired', async () => {
  const client = adminClient();
  const storedUser = await createTestUser(client, { name: 'Stored Success Old' });

  try {
    await seedPendingOrder(client, storedUser.id, FIVE_DAYS_MIN, { Status: 'SUCCESS' });

    const summary = await reconcilePendingOrders(
      client,
      async () => ({ stillProcessing: true }),
      async () => ({ ok: true as const, status: 'SUCCESS' as const }),
      { thresholdMinutes: 20, limit: 50, expireAfterDays: 4 },
    );

    assertEquals(summary.checked, 0, '已有存檔判決的訂單走 heal pre-pass，不進對帳掃描');

    const { data: order } = await client
      .from('payment_orders').select('status').eq('user_id', storedUser.id).single();
    assertEquals(order?.status, 'pending', '已付款存檔的卡單必須留給自癒流程，不得被標 expired');
  } finally {
    await deleteTestUsers(client, [storedUser.id]);
  }
});
