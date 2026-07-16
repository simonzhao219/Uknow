// ============================================================
// 防禦性約束：就算 process_successful_payment 的鎖被繞過，資料庫也要
// 擋下同一個 payment_transaction_id 被寫進兩筆 subscriptions。
// 約束目前不存在，預期 FAIL。
// ============================================================
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';

Deno.test('subscriptions.payment_transaction_id has a defense-in-depth unique constraint', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Dup Sub Test' });

  try {
    const txId = `DUP-TX-${user.id}`;
    const base = {
      user_id: user.id,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 365 * 86400_000).toISOString(),
      grace_period_end: new Date(Date.now() + 425 * 86400_000).toISOString(),
      amount: 1200,
      payment_method: 'payuni',
      payment_transaction_id: txId,
    };

    const first = await client.from('subscriptions').insert(base);
    assertEquals(first.error, null);

    const second = await client.from('subscriptions').insert(base);
    assertNotEquals(second.error, null, '第二筆重複 payment_transaction_id 應該被唯一約束擋下');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
