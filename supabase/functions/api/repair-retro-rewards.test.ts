// ============================================================
// issue #167：自癒函數不得用「現在的推薦人」回答「歷史事件當時該不該
// 發獎」。fresh 換線把 profiles.referred_by_user_id 從 null 換成真人後，
// repair_orphaned_payments / repair_orphaned_claim_rewards 會把換線前的
// 歷史訂閱 / 歷史 claim 回溯補發三代獎金給新推薦人——付款當時根本沒有
// 推薦關係。修法：profiles.referred_by_changed_at（觸發器維護）+ 候選
// 查詢加「關係變更時間 ≤ 事件時間」閘門；legacy（null）沿用現行為。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';

/** 種一筆 completed 付款＋訂閱；completed_at 可指定（預設現在）。 */
async function seedCompletedPayment(
  client: ReturnType<typeof adminClient>,
  userId: string,
  completedAt: Date = new Date(),
  tag = 'RETRO',
) {
  const tradeNo = `${tag}-${userId}-${completedAt.getTime()}`;
  const { data: order, error: orderErr } = await client
    .from('payment_orders')
    .insert({
      user_id: userId,
      amount: 1200,
      status: 'completed',
      payment_method: 'payuni',
      transaction_id: tradeNo,
      completed_at: completedAt.toISOString(),
    })
    .select('id')
    .single();
  if (orderErr) throw new Error(`seed payment_orders failed: ${orderErr.message}`);

  const { data: sub, error: subErr } = await client
    .from('subscriptions')
    .insert({
      user_id: userId,
      start_date: completedAt.toISOString(),
      end_date: new Date(completedAt.getTime() + 365 * 86400_000).toISOString(),
      grace_period_end: new Date(completedAt.getTime() + 365 * 86400_000).toISOString(),
      amount: 1200,
      payment_method: 'payuni',
      payment_transaction_id: tradeNo,
      source_payment_order_id: order!.id,
    })
    .select('id')
    .single();
  if (subErr) throw new Error(`seed subscriptions failed: ${subErr.message}`);
  return { orderId: order!.id, subscriptionId: sub!.id };
}

Deno.test('repair_orphaned_payments：換線前的歷史訂閱不得回溯補發（#167）', async () => {
  const client = adminClient();
  const newReferrer = await createTestUser(client, { name: 'Retro NewRef' });
  const member = await createTestUser(client, { name: 'Retro Member' });

  try {
    // 歷史事實：member 付款當時「沒有推薦人」（completed_at 在 100 天前）。
    await seedCompletedPayment(client, member.id, new Date(Date.now() - 100 * 86400_000));

    // 之後才換線（模擬 /payuni/prepare fresh 填碼——同一個 UPDATE 寫入點）。
    const { error: rewireErr } = await client
      .from('profiles')
      .update({ referred_by_user_id: newReferrer.id })
      .eq('id', member.id);
    assertEquals(rewireErr, null);

    const { error: repairErr } = await client.rpc('repair_orphaned_payments', {
      p_user_id: member.id,
    });
    assertEquals(repairErr, null, `repair 呼叫失敗: ${repairErr?.message}`);

    // 核心斷言：不得憑「現在的推薦人」為歷史訂閱補發任何一代獎勵。
    const { data: rewards } = await client
      .from('reward_transactions')
      .select('id, generation')
      .eq('referee_user_id', member.id);
    assertEquals(rewards?.length, 0, '換線前的歷史訂閱被回溯補發了獎勵');
  } finally {
    await deleteTestUsers(client, [newReferrer.id, member.id]);
  }
});

Deno.test('repair_orphaned_payments：換線後的新付款孤兒仍可自癒（閘門不誤殺）', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Retro PostRef' });
  const member = await createTestUser(client, { name: 'Retro PostMember' });

  try {
    // 先換線、後付款（completed_at 晚於關係變更）→ 是合法孤兒，該補。
    const { error: rewireErr } = await client
      .from('profiles')
      .update({ referred_by_user_id: referrer.id })
      .eq('id', member.id);
    assertEquals(rewireErr, null);

    const { subscriptionId } = await seedCompletedPayment(client, member.id, new Date());

    const { error: repairErr } = await client.rpc('repair_orphaned_payments', {
      p_user_id: member.id,
    });
    assertEquals(repairErr, null);

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('subscription_id')
      .eq('referee_user_id', member.id)
      .eq('generation', 1);
    assertEquals(rewards?.length, 1, '關係先於付款的孤兒應照常補發');
    assertEquals(rewards?.[0].subscription_id, subscriptionId);
  } finally {
    await deleteTestUsers(client, [referrer.id, member.id]);
  }
});

Deno.test('repair_orphaned_claim_rewards：換線前的歷史 claim 不得回溯補發', async () => {
  const client = adminClient();
  const newReferrer = await createTestUser(client, { name: 'Retro ClaimRef' });
  const member = await createTestUser(client, { name: 'Retro Claimer' });

  try {
    // 歷史事實：member 在無推薦人時 claim 過 King reward（claimed_at 過去）。
    const past = new Date(Date.now() - 100 * 86400_000);
    const { subscriptionId } = await seedCompletedPayment(client, member.id, past, 'RETRO-K');
    // claim 需要 gen1 冪等鍵缺列 → 先確認 seed 沒發過獎（無推薦人本來就不會發）。
    const { error: kingErr } = await client.from('referral_king_rewards').insert({
      user_id: member.id,
      month_key: '2025-01',
      status: 'claimed',
      claimed_at: past.toISOString(),
      resulting_subscription_id: subscriptionId,
    });
    assertEquals(kingErr, null, `seed king reward failed: ${kingErr?.message}`);

    const { error: rewireErr } = await client
      .from('profiles')
      .update({ referred_by_user_id: newReferrer.id })
      .eq('id', member.id);
    assertEquals(rewireErr, null);

    const { error: repairErr } = await client.rpc('repair_orphaned_claim_rewards', {
      p_user_id: member.id,
    });
    assertEquals(repairErr, null, `claim repair 呼叫失敗: ${repairErr?.message}`);

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('id')
      .eq('referee_user_id', member.id);
    assertEquals(rewards?.length, 0, '換線前的歷史 claim 被回溯補發了獎勵');
  } finally {
    await deleteTestUsers(client, [newReferrer.id, member.id]);
  }
});

Deno.test('profiles：referred_by_user_id 變動時 referred_by_changed_at 由觸發器寫入', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Retro TrigRef' });
  const member = await createTestUser(client, { name: 'Retro TrigMember' });

  try {
    const { data: before } = await client
      .from('profiles')
      .select('referred_by_changed_at')
      .eq('id', member.id)
      .single();
    // createTestUser 不帶推薦人 → 尚未變動過。
    assertEquals(before?.referred_by_changed_at ?? null, null);

    await client
      .from('profiles')
      .update({ referred_by_user_id: referrer.id })
      .eq('id', member.id);
    const { data: after } = await client
      .from('profiles')
      .select('referred_by_changed_at')
      .eq('id', member.id)
      .single();
    assertEquals(!!after?.referred_by_changed_at, true, '變動後 changed_at 應被觸發器寫入');

    // 無實質變動（同值重寫）不得推進時間戳。
    const stamp = after!.referred_by_changed_at;
    await client
      .from('profiles')
      .update({ referred_by_user_id: referrer.id })
      .eq('id', member.id);
    const { data: rewrite } = await client
      .from('profiles')
      .select('referred_by_changed_at')
      .eq('id', member.id)
      .single();
    assertEquals(rewrite?.referred_by_changed_at, stamp, '同值重寫不得推進 changed_at');
  } finally {
    await deleteTestUsers(client, [referrer.id, member.id]);
  }
});
