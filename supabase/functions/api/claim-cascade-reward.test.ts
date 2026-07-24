// ============================================================
// TDD（red-first）：規則更新——任務成功續約（領取推薦王「免費續約 1 年」
// credit）現在也算「下線續約」，要對『領取者的上線鏈』發三代 100P，
// 冪等鍵綁這次 claim（reward_transactions.source_claim_id），且**不** +1 task。
//
// 現行 claim_referral_king_reward 刻意完全不碰推薦鏈，且無 source_claim_id
// 欄位，故本測試在實作前預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  payForUser,
  getActiveReferralCode,
} from './test-helpers.ts';

Deno.test('claim 免費續約 credit → 上線得三代 100P（source_claim_id 冪等），不 +1 task', async () => {
  const client = adminClient();
  const upline = await createTestUser(client, { name: 'Upline-of-claimer' });
  const created: string[] = [upline.id];

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    const codeUpline = await getActiveReferralCode(client, upline.id);

    // A（claimer）在 upline 底下
    const a = await createTestUser(client, { name: 'Claimer', referredByCode: codeUpline });
    created.push(a.id);
    assertEquals((await payForUser(client, a.id)).error, null);
    const codeA = await getActiveReferralCode(client, a.id);

    // A 招募 8 位新人 → A 取得一張未領 credit
    for (let i = 0; i < 8; i++) {
      const u = await createTestUser(client, { name: `sub${i}`, referredByCode: codeA });
      created.push(u.id);
      assertEquals((await payForUser(client, u.id)).error, null);
    }
    const { data: credit } = await client
      .from('referral_king_rewards')
      .select('id')
      .eq('user_id', a.id)
      .eq('status', 'unclaimed')
      .limit(1)
      .single();

    // A 的 task 進度快照（claim 不得改變它）
    const { data: taskBefore } = await client
      .from('task_progress')
      .select('total_referrals')
      .eq('user_id', a.id)
      .single();

    // 領取 credit（＝任務成功續約）
    const { error: claimErr } = await client.rpc('claim_referral_king_reward', {
      p_user_id: a.id,
      p_reward_id: credit!.id,
    });
    assertEquals(claimErr, null, `claim 失敗: ${claimErr?.message}`);

    // upline 應收到一筆由這次 claim 觸發的 gen1 100P
    const { data: cascade } = await client
      .from('reward_transactions')
      .select('amount, generation, source_claim_id')
      .eq('user_id', upline.id)
      .eq('referee_user_id', a.id)
      .eq('source_claim_id', credit!.id);
    assertEquals(cascade?.length, 1, 'claim 應讓上線得到一筆續約推薦獎勵');
    assertEquals(cascade?.[0]?.amount, 100);
    assertEquals(cascade?.[0]?.generation, 1);

    // 冪等：重複 claim 不得重複發
    await client.rpc('claim_referral_king_reward', { p_user_id: a.id, p_reward_id: credit!.id });
    const { data: cascade2 } = await client
      .from('reward_transactions')
      .select('id')
      .eq('user_id', upline.id)
      .eq('referee_user_id', a.id)
      .eq('source_claim_id', credit!.id);
    assertEquals(cascade2?.length, 1, '重複 claim 不得重複發獎');

    // claim 不得改變 A 的 task 進度
    const { data: taskAfter } = await client
      .from('task_progress')
      .select('total_referrals')
      .eq('user_id', a.id)
      .single();
    assertEquals(taskAfter?.total_referrals, taskBefore?.total_referrals, 'claim 不得 +1 task');
  } finally {
    await deleteTestUsers(client, created);
  }
});
