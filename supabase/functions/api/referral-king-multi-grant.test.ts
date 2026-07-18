// ============================================================
// 推薦王多次發放（H3）＋不重複人數計（L2）
//   * 單月每滿 8 位不重複被推薦者發一批「免費續約 1 年」credit，可多次。
//   * 續約/重複付款事件不灌大推薦王人數（以不重複人數計）。
// ============================================================
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  payForUser,
  getActiveReferralCode,
  expireSubscriptions,
} from './test-helpers.ts';

Deno.test('單月 16 位不重複下線 → 發 2 批推薦王 credit（每滿 8 位一批）', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Multi King' });
  const refereeIds: string[] = [];

  try {
    assertEquals((await payForUser(client, referrer.id)).error, null);
    const refCode = await getActiveReferralCode(client, referrer.id);

    for (let i = 0; i < 16; i++) {
      const referee = await createTestUser(client, { name: `Referee ${i}`, referredByCode: refCode });
      refereeIds.push(referee.id);
      assertEquals((await payForUser(client, referee.id)).error, null, `referee ${i} 付款失敗`);
    }

    const { data: credits } = await client
      .from('referral_king_rewards')
      .select('batch_index, status')
      .eq('user_id', referrer.id)
      .order('batch_index', { ascending: true });

    assertEquals(credits?.length, 2, `16 位應發 2 批 credit，實際 ${credits?.length}`);
    assertEquals(credits?.map((c: any) => c.batch_index), [1, 2]);
    assertEquals(credits?.every((c: any) => c.status === 'unclaimed'), true);
  } finally {
    await deleteTestUsers(client, [referrer.id, ...refereeIds]);
  }
});

Deno.test('L2：同一下線續約（重複付款）不會灌大推薦王人數', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Dedup King' });
  const refereeIds: string[] = [];

  try {
    assertEquals((await payForUser(client, referrer.id)).error, null);
    const refCode = await getActiveReferralCode(client, referrer.id);

    // 8 位不重複下線 → 恰好 1 批
    for (let i = 0; i < 8; i++) {
      const referee = await createTestUser(client, { name: `Referee ${i}`, referredByCode: refCode });
      refereeIds.push(referee.id);
      assertEquals((await payForUser(client, referee.id)).error, null);
    }

    // 讓其中一位下線在同月續約（第 2 次付款事件）——不重複人數仍為 8
    await expireSubscriptions(client, refereeIds[0], 90);
    assertEquals((await payForUser(client, refereeIds[0])).error, null);

    const { data: credits } = await client
      .from('referral_king_rewards')
      .select('batch_index')
      .eq('user_id', referrer.id);
    assertEquals(credits?.length, 1, `續約不應讓人數達 16；仍應只有 1 批，實際 ${credits?.length}`);
  } finally {
    await deleteTestUsers(client, [referrer.id, ...refereeIds]);
  }
});

Deno.test('M5：已過期時領取免費續約，效期改從今日起算一年（可用，不落在過去）', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Expired Claimer' });
  const refereeIds: string[] = [];

  try {
    assertEquals((await payForUser(client, referrer.id)).error, null);
    const refCode = await getActiveReferralCode(client, referrer.id);
    for (let i = 0; i < 8; i++) {
      const referee = await createTestUser(client, { name: `Referee ${i}`, referredByCode: refCode });
      refereeIds.push(referee.id);
      assertEquals((await payForUser(client, referee.id)).error, null);
    }

    // referrer 會籍過期超過一年（原效期最後一天遠在過去）
    await expireSubscriptions(client, referrer.id, 400);

    const { data: credit } = await client
      .from('referral_king_rewards')
      .select('id')
      .eq('user_id', referrer.id)
      .eq('status', 'unclaimed')
      .order('batch_index', { ascending: true })
      .limit(1)
      .single();

    const { data: res, error } = await client.rpc('claim_referral_king_reward', {
      p_user_id: referrer.id,
      p_reward_id: credit!.id,
    });
    assertEquals(error, null, `claim 失敗: ${error?.message}`);
    assertEquals(res?.success, true);
    assert(new Date(res!.activeUntil).getTime() > Date.now(),
      `免費續約後效期應在未來，實際 ${res?.activeUntil}`);
  } finally {
    await deleteTestUsers(client, [referrer.id, ...refereeIds]);
  }
});
