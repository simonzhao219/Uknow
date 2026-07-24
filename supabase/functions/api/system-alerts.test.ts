// ============================================================
// 周邊邏輯失敗時，除了 raise warning，也要在 system_alerts 留一筆可查詢
// 的紀錄——不然只有 Postgres log 知道發生過這件事。表格目前不存在，
// 預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers, payForUser } from './test-helpers.ts';

Deno.test('a peripheral failure inside process_successful_payment writes a system_alerts row', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Referrer' });

  try {
    // 同一招 fault injection：讓 jsonb_set 在周邊邏輯裡炸掉。
    const { error: seedErr } = await client
      .from('task_progress')
      .insert({ user_id: referrer.id, monthly_referrals: [] });
    assertEquals(seedErr, null);

    const payer = await createTestUser(client, { name: 'Payer' });
    await client.from('profiles').update({ referred_by_user_id: referrer.id }).eq('id', payer.id);

    try {
      const before = await client.from('system_alerts').select('id');

      const { error } = await payForUser(client, payer.id);
      assertEquals(error, null);

      const after = await client
        .from('system_alerts')
        .select('id, source, severity, context')
        .order('created_at', { ascending: false });

      assertEquals((after.data?.length ?? 0) > (before.data?.length ?? 0), true, '應該多出至少一筆告警紀錄');
      // 規則更新後 task/推薦王已從發獎（Block A）拆出成獨立的 Block B：
      // monthly_referrals 被灌成陣列 [] 會讓 Block B 的 pair-history 查詢
      // （jsonb_each 於非物件）爆炸。apply_referral_side_effects 自己的
      // exception 分支會攔下來記錄（step=task_king），不會冒泡到
      // process_successful_payment。
      const newest = after.data?.[0];
      assertEquals(newest?.source, 'apply_referral_side_effects');
      assertEquals((newest?.context as any)?.step, 'task_king');
    } finally {
      await deleteTestUsers(client, [payer.id]);
    }
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});
