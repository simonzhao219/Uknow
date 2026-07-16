// ============================================================
// 已確認的商業規則：推薦人每次下線付款（含續約）都要再拿一次獎金，
// 金額是 100 點/代（不是舊的 120）。冪等鍵要綁在「這一次付款事件」
// （reward_transactions.subscription_id），不是「這個下線史上有沒有
// 拿過」。這張表跟這個欄位在這次修復前都不存在，所以這個測試現在
// 預期會直接因為欄位不存在而 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers, payForUser, getActiveReferralCode } from './test-helpers.ts';

Deno.test('a referrer is rewarded 100 points again on the referee renewal, keyed per payment event', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Referrer' });

  try {
    const refCode = await (async () => {
      const { error } = await payForUser(client, referrer.id);
      assertEquals(error, null);
      return getActiveReferralCode(client, referrer.id);
    })();

    const payer = await createTestUser(client, { name: 'Payer', referredByCode: refCode });
    try {
      const first = await payForUser(client, payer.id);
      assertEquals(first.error, null);
      const second = await payForUser(client, payer.id);
      assertEquals(second.error, null);

      const { data: subs } = await client
        .from('subscriptions')
        .select('id, is_renewal')
        .eq('user_id', payer.id)
        .order('created_at', { ascending: true });
      assertEquals(subs?.length, 2);
      assertEquals(subs?.map((s: any) => s.is_renewal), [false, true]);

      const { data: rewards } = await client
        .from('reward_transactions')
        .select('amount, generation, subscription_id')
        .eq('referee_user_id', payer.id)
        .eq('generation', 1)
        .order('created_at', { ascending: true });

      assertEquals(rewards?.length, 2, `每次付款都要各發一次 gen1 獎勵，實際 ${rewards?.length} 筆`);
      assertEquals(rewards?.every((r: any) => r.amount === 100), true, '每代獎金金額應為 100 點');
      assertEquals(rewards?.[0].subscription_id, subs?.[0].id);
      assertEquals(rewards?.[1].subscription_id, subs?.[1].id);
      assertEquals(rewards?.[0].subscription_id !== rewards?.[1].subscription_id, true);
    } finally {
      await deleteTestUsers(client, [payer.id]);
    }
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});
