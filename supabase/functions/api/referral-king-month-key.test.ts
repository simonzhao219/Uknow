// ============================================================
// 推薦王月份歸屬必須錨定「付款時間」而非「執行時間」：
// webhook 失敗、跨月後才由自癒/補跑執行 side effects 時，這筆推薦
// 必須記在付款當月——否則 1/31 付款、2/1 自癒，推薦數落到二月，
// 推薦王（單月門檻）的達標判定就漂移了。0718 已把訂閱效期錨定到
// payuni_paid_at，month key 卻仍用 now()，這裡補上對稱的錨定。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';

Deno.test('apply_referral_side_effects：p_paid_at 決定 task_progress 的月份 key', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'King Referrer' });
  let referee: { id: string } | null = null;

  try {
    const { error } = await payForUser(client, referrer.id);
    assertEquals(error, null);
    const code = await getActiveReferralCode(client, referrer.id);

    const newReferee = await createTestUser(client, { name: 'Late Healed Referee', referredByCode: code });
    referee = newReferee;
    // 模擬跨月自癒：付款發生在 2026-01（台北時間 1/15 中午），side effects
    // 卻在「現在」才補跑。直接以第三參數傳付款時點。
    const { error: payErr } = await payForUser(client, newReferee.id);
    assertEquals(payErr, null);

    // 取 referee 的 subscription id 供冪等鍵
    const { data: sub } = await client
      .from('subscriptions').select('id').eq('user_id', newReferee.id)
      .order('end_date', { ascending: false }).limit(1).single();
    assert(sub, 'referee 應已有訂閱');

    // 清掉 payForUser 當下已寫入的本月 task_progress，重新以指定付款月補跑
    await client.from('task_progress').delete().eq('user_id', referrer.id);
    await client.from('reward_transactions')
      .delete().eq('referee_user_id', newReferee.id).eq('type', 'referral_reward');

    const { data: applied, error: applyErr } = await client.rpc('apply_referral_side_effects', {
      p_user_id: newReferee.id,
      p_subscription_id: sub.id,
      p_paid_at: '2026-01-15T04:00:00Z', // 台北 2026-01-15 12:00
    });
    assertEquals(applyErr, null, JSON.stringify(applyErr));
    assertEquals(applied?.success, true, JSON.stringify(applied));

    const { data: progress } = await client
      .from('task_progress').select('monthly_referrals').eq('user_id', referrer.id).single();
    const keys = Object.keys(progress?.monthly_referrals ?? {});
    assertEquals(keys, ['2026-01'], `月份 key 必須是付款月，實際：${JSON.stringify(keys)}`);
  } finally {
    await deleteTestUsers(client, [referrer.id, ...(referee ? [referee.id] : [])]);
  }
});

Deno.test('process_successful_payment：付款月由 PayUni AuthDay 錨定並傳導到 month key', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Anchor Referrer' });
  let referee: { id: string } | null = null;

  try {
    const { error } = await payForUser(client, referrer.id);
    assertEquals(error, null);
    const code = await getActiveReferralCode(client, referrer.id);

    const newReferee = await createTestUser(client, { name: 'Anchor Referee', referredByCode: code });
    referee = newReferee;

    // 清掉推薦人既有的 task_progress，讓斷言只看這筆付款
    await client.from('task_progress').delete().eq('user_id', referrer.id);

    // 真實情境建模：訂單建於 2026-03、webhook 遺失、事後才補開通。
    // payuni_paid_at 有防呆窗（paid_at 不得早於訂單 created_at 一天以上，
    // 否則視為垃圾資料退回 fallback），所以訂單的 created_at 必須跟
    // AuthDay 同期——這正是「事故重演」的正確形狀。
    const tradeNo = `ANCHOR-${newReferee.id}`;
    const { error: seedErr } = await client.from('payment_orders').insert({
      user_id: newReferee.id, amount: 1200, status: 'pending', payment_method: 'payuni',
      transaction_id: tradeNo, created_at: '2026-03-10T03:00:00Z',
    });
    assertEquals(seedErr, null);
    const { data: processed, error: payErr } = await client.rpc('process_successful_payment', {
      p_user_id: newReferee.id,
      p_trade_no: tradeNo,
      p_transaction_id: tradeNo,
      p_payuni_response: { Status: 'SUCCESS', AuthDay: '20260310', AuthTime: '120000' },
    });
    assertEquals(payErr, null, JSON.stringify(payErr));
    assertEquals(processed?.success, true, JSON.stringify(processed));

    const { data: progress } = await client
      .from('task_progress').select('monthly_referrals').eq('user_id', referrer.id).single();
    const keys = Object.keys(progress?.monthly_referrals ?? {});
    assertEquals(keys, ['2026-03'], `月份 key 必須跟著付款時點，實際：${JSON.stringify(keys)}`);
  } finally {
    await deleteTestUsers(client, [referrer.id, ...(referee ? [referee.id] : [])]);
  }
});
