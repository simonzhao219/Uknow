// ============================================================
// 推薦王（單月推薦 8 人）：達標即發放可領取的「免費續約 1 年」
// credit；使用者需主動呼叫 claim_referral_king_reward 才會真的延展
// 訂閱到期日。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers, payForUser, getActiveReferralCode } from './test-helpers.ts';
import { twDayOf, twDayPlusDays, twDayPlusYears, twEndOfDayInstant } from './tw-dates.ts';

Deno.test('hitting 8 referrals in a month grants exactly one unclaimed free-renewal credit, even past 8', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'King Referrer' });
  const refereeIds: string[] = [];

  try {
    const { error } = await payForUser(client, referrer.id);
    assertEquals(error, null);
    const refCode = await getActiveReferralCode(client, referrer.id);

    // 付 12 個下線（超過門檻 8），驗證只會有 1 筆 credit，不會每超過
    // 1 個就再開一筆。
    for (let i = 0; i < 12; i++) {
      const referee = await createTestUser(client, { name: `Referee ${i}`, referredByCode: refCode });
      refereeIds.push(referee.id);
      const { error: payErr } = await payForUser(client, referee.id);
      assertEquals(payErr, null, `referee ${i} 付款失敗: ${payErr?.message}`);
    }

    const { data: credits } = await client
      .from('referral_king_rewards')
      .select('id, status, month_key')
      .eq('user_id', referrer.id);
    assertEquals(credits?.length, 1, `應該只有 1 筆推薦王 credit，實際 ${credits?.length}`);
    assertEquals(credits?.[0].status, 'unclaimed');
  } finally {
    await deleteTestUsers(client, [referrer.id, ...refereeIds]);
  }
});

Deno.test('claiming a free-renewal-year credit extends the current subscription by 1 year, idempotently, without touching referral rewards', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Claiming Referrer' });
  const refereeIds: string[] = [];

  try {
    const { error } = await payForUser(client, referrer.id);
    assertEquals(error, null);
    const refCode = await getActiveReferralCode(client, referrer.id);

    for (let i = 0; i < 10; i++) {
      const referee = await createTestUser(client, { name: `Referee ${i}`, referredByCode: refCode });
      refereeIds.push(referee.id);
      const { error: payErr } = await payForUser(client, referee.id);
      assertEquals(payErr, null);
    }

    const { data: creditRow } = await client
      .from('referral_king_rewards')
      .select('id')
      .eq('user_id', referrer.id)
      .eq('status', 'unclaimed')
      .single();

    const { data: subBefore } = await client
      .from('subscriptions')
      .select('id, end_date, grace_period_end')
      .eq('user_id', referrer.id)
      .order('end_date', { ascending: false })
      .limit(1)
      .single();

    const rewardsBefore = await client
      .from('reward_transactions')
      .select('id')
      .eq('user_id', referrer.id);
    const edgesBefore = await client
      .from('referral_edges')
      .select('referee_user_id')
      .eq('referrer_user_id', referrer.id);

    const { data: claimResult, error: claimErr } = await client.rpc('claim_referral_king_reward', {
      p_user_id: referrer.id,
      p_reward_id: creditRow!.id,
    });
    assertEquals(claimErr, null, `claim 失敗: ${claimErr?.message}`);
    assertEquals(claimResult?.success, true);

    const { data: subAfter } = await client
      .from('subscriptions')
      .select('end_date, grace_period_end')
      .eq('id', subBefore!.id)
      .single();

    // 日領域語意（0718 0001）：新最後一天 = 原最後一天（台灣日）+ 1 年，
    // end/grace 都是台灣日終。
    const newLastDay = twDayPlusYears(twDayOf(subBefore!.end_date), 1);
    const expectedEnd = twEndOfDayInstant(newLastDay);
    assertEquals(new Date(subAfter!.end_date).getTime(), expectedEnd.getTime());
    assertEquals(
      new Date(subAfter!.grace_period_end).getTime(),
      twEndOfDayInstant(twDayPlusDays(newLastDay, 60)).getTime(),
      'grace 應為新最後一天 + 60 天的台灣日終',
    );

    const { data: creditAfter } = await client
      .from('referral_king_rewards')
      .select('status, resulting_subscription_id')
      .eq('id', creditRow!.id)
      .single();
    assertEquals(creditAfter?.status, 'claimed');
    assertEquals(creditAfter?.resulting_subscription_id, subBefore!.id);

    // claim 不該動到任何推薦獎金/推薦邊——這是「用任務領的免費續約」，
    // 不是真的付款，不該再觸發一輪推薦鏈。
    const rewardsAfter = await client.from('reward_transactions').select('id').eq('user_id', referrer.id);
    assertEquals(rewardsAfter.data?.length, rewardsBefore.data?.length);
    const edgesAfter = await client.from('referral_edges').select('referee_user_id').eq('referrer_user_id', referrer.id);
    assertEquals(edgesAfter.data?.length, edgesBefore.data?.length);

    // 重複 claim：冪等成功，不會再延展一次。
    const { data: secondClaim, error: secondErr } = await client.rpc('claim_referral_king_reward', {
      p_user_id: referrer.id,
      p_reward_id: creditRow!.id,
    });
    assertEquals(secondErr, null);
    assertEquals(secondClaim?.success, true);

    const { data: subAfterSecondClaim } = await client
      .from('subscriptions')
      .select('end_date')
      .eq('id', subBefore!.id)
      .single();
    assertEquals(new Date(subAfterSecondClaim!.end_date).getTime(), expectedEnd.getTime(), '重複領取不該再延展一次');
  } finally {
    await deleteTestUsers(client, [referrer.id, ...refereeIds]);
  }
});
