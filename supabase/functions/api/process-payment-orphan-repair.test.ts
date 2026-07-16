// ============================================================
// repair_orphaned_payments()：補救「已付款完成，但周邊邏輯（推薦碼/
// 推薦邊/獎勵/任務進度）沒跑完」的孤兒使用者。這個函數、
// subscriptions.source_payment_order_id 這個修復前都不存在，
// 預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';

async function seedOrphanedCompletedPayment(client: ReturnType<typeof adminClient>, userId: string) {
  const tradeNo = `ORPHAN-${userId}`;
  const { data: order, error: orderErr } = await client
    .from('payment_orders')
    .insert({
      user_id: userId, amount: 1200, status: 'completed',
      payment_method: 'payuni', transaction_id: tradeNo, completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (orderErr) throw new Error(`seed payment_orders failed: ${orderErr.message}`);

  const { data: sub, error: subErr } = await client
    .from('subscriptions')
    .insert({
      user_id: userId,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 365 * 86400_000).toISOString(),
      grace_period_end: new Date(Date.now() + 425 * 86400_000).toISOString(),
      amount: 1200, payment_method: 'payuni', payment_transaction_id: tradeNo,
      source_payment_order_id: order!.id,
    })
    .select('id')
    .single();
  if (subErr) throw new Error(`seed subscriptions failed: ${subErr.message}`);

  return { orderId: order!.id, subscriptionId: sub!.id };
}

Deno.test('repair_orphaned_payments backfills missing referral code/reward/task-progress, idempotently', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Referrer' });
  const payer = await createTestUser(client, { name: 'Payer' });

  try {
    // payer 已完成付款（模擬周邊邏輯當時整段失敗），且推薦來源已在
    // 註冊當下記錄好（跟 handle_new_user 的真實行為一致）。
    await client.from('profiles').update({ referred_by_user_id: referrer.id }).eq('id', payer.id);
    const { subscriptionId } = await seedOrphanedCompletedPayment(client, payer.id);

    const { data: repairResult, error: repairErr } = await client.rpc('repair_orphaned_payments', {
      p_user_id: payer.id,
    });
    assertEquals(repairErr, null, `repair_orphaned_payments 呼叫失敗: ${repairErr?.message}`);
    assertEquals(repairResult?.repaired_count >= 1, true);

    const { data: activeCode } = await client
      .from('referral_codes')
      .select('id')
      .eq('user_id', payer.id)
      .eq('status', 'active')
      .maybeSingle();
    assertEquals(activeCode !== null, true, '補完後 payer 應該有一個 active 推薦碼');

    const { data: edge } = await client
      .from('referral_edges')
      .select('referrer_user_id')
      .eq('referee_user_id', payer.id)
      .maybeSingle();
    assertEquals(edge?.referrer_user_id, referrer.id);

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('amount, generation, subscription_id')
      .eq('referee_user_id', payer.id)
      .eq('generation', 1);
    assertEquals(rewards?.length, 1);
    assertEquals(rewards?.[0].amount, 100);
    assertEquals(rewards?.[0].subscription_id, subscriptionId);

    const { data: progress } = await client
      .from('task_progress')
      .select('total_referrals')
      .eq('user_id', referrer.id)
      .maybeSingle();
    assertEquals(progress?.total_referrals, 1);

    // 重跑一次：不該重複發獎、不該重複建邊。
    const { error: secondRunErr } = await client.rpc('repair_orphaned_payments', { p_user_id: payer.id });
    assertEquals(secondRunErr, null);

    const { data: rewardsAfterRerun } = await client
      .from('reward_transactions')
      .select('id')
      .eq('referee_user_id', payer.id)
      .eq('generation', 1);
    assertEquals(rewardsAfterRerun?.length, 1, '重跑 repair 不該重複發獎');
  } finally {
    await deleteTestUsers(client, [referrer.id, payer.id]);
  }
});
