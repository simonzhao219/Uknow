// ============================================================
// reward_config 是「可變業務常數」的單一真相（見 migration 0719 0002）。
// 這支證明：改 reward_config 一列，apply_referral_side_effects 的發獎額度
// 與推薦王門檻就跟著變——常數確實收斂到單一來源，不再散在函數字面。
//
// ⚠️ 本測試會改動全域單列 reward_config，務必在 finally 還原原值，避免
// 污染其他測試檔（deno test 預設循序執行，還原後即互不影響）。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers, payForUser, getActiveReferralCode } from './test-helpers.ts';

Deno.test('reward_config：改表即改發獎額度與推薦王門檻（單一真相）', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Config Referrer' });
  const refereeIds: string[] = [];

  // 保存原設定，測試後還原（不硬編 100/8，還原成當下實際值）
  const { data: original } = await client
    .from('reward_config')
    .select('referral_reward_amount, referral_king_monthly_threshold')
    .eq('id', true)
    .single();

  try {
    // 改成與現值不同的獎金 55 與低門檻 2
    const upd = await client
      .from('reward_config')
      .update({ referral_reward_amount: 55, referral_king_monthly_threshold: 2 })
      .eq('id', true);
    assertEquals(upd.error, null, `更新 reward_config 失敗: ${upd.error?.message}`);

    const { error } = await payForUser(client, referrer.id);
    assertEquals(error, null);
    const refCode = await getActiveReferralCode(client, referrer.id);

    // 付 2 個下線（= 新門檻）
    for (let i = 0; i < 2; i++) {
      const referee = await createTestUser(client, { name: `Config Referee ${i}`, referredByCode: refCode });
      refereeIds.push(referee.id);
      const { error: payErr } = await payForUser(client, referee.id);
      assertEquals(payErr, null, `referee ${i} 付款失敗: ${payErr?.message}`);
    }

    // 獎金額度取自 config：每筆 gen1 推薦獎勵 = 55（不是預設 100）
    const { data: rewards } = await client
      .from('reward_transactions')
      .select('amount')
      .eq('user_id', referrer.id)
      .eq('type', 'referral_reward');
    assertEquals(rewards?.length, 2, `應有 2 筆推薦獎勵，實際 ${rewards?.length}`);
    assertEquals(
      rewards?.every((r: any) => r.amount === 55),
      true,
      '推薦獎金額度應取自 reward_config（55）',
    );

    // 門檻取自 config：滿 2 人即發 1 筆 credit（不是預設 8）
    const { data: credits } = await client
      .from('referral_king_rewards')
      .select('id')
      .eq('user_id', referrer.id);
    assertEquals(credits?.length, 1, `門檻 2 應發 1 筆推薦王 credit，實際 ${credits?.length}`);
  } finally {
    // 還原設定（先於刪使用者），避免污染其他測試檔
    if (original) {
      await client
        .from('reward_config')
        .update({
          referral_reward_amount: original.referral_reward_amount,
          referral_king_monthly_threshold: original.referral_king_monthly_threshold,
        })
        .eq('id', true);
    }
    await deleteTestUsers(client, [referrer.id, ...refereeIds]);
  }
});
