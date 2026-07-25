// ============================================================
// TDD（red-first）：任務續約（claim 免費續約 credit）對上線鏈的三代發獎
// 是 warning-only 隔離——若當下失敗，付款路徑有 repair_orphaned_payments
// 補償，claim 路徑卻沒有任何自癒。補上 repair_orphaned_claim_rewards：
// 找「已 claimed 但缺對應 source_claim_id 獎勵」的 credit，冪等補發。
//
// 這支函數修復前不存在，本測試預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';

Deno.test('repair_orphaned_claim_rewards：補回任務續約缺漏的上線三代獎勵，冪等', async () => {
  const client = adminClient();
  const upline = await createTestUser(client, { name: 'Upline' });
  const created: string[] = [upline.id];

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    const codeUpline = await getActiveReferralCode(client, upline.id);

    // A（claimer）在 upline 底下
    const a = await createTestUser(client, { name: 'Claimer', referredByCode: codeUpline });
    created.push(a.id);
    assertEquals((await payForUser(client, a.id)).error, null);
    const codeA = await getActiveReferralCode(client, a.id);

    // A 招募 8 位新人 → 取得一張未領 credit
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

    // A 領取 credit → 正常情況會 cascade 發 upline 一筆 gen1
    assertEquals(
      (await client.rpc('claim_referral_king_reward', { p_user_id: a.id, p_reward_id: credit!.id }))
        .error,
      null,
    );

    // 模擬 cascade 當下失敗（warning-only 沒寫成）：直接刪掉那筆續約獎勵。
    await client
      .from('reward_transactions')
      .delete()
      .eq('source_claim_id', credit!.id);

    const gone = await client
      .from('reward_transactions')
      .select('id')
      .eq('source_claim_id', credit!.id);
    assertEquals(gone.data?.length ?? 0, 0, '前置：cascade 獎勵應已被刪');

    // 自癒：repair 應把缺漏的續約獎勵補回。
    const { error: repairErr } = await client.rpc('repair_orphaned_claim_rewards', {
      p_user_id: a.id,
    });
    assertEquals(repairErr, null, `repair 呼叫失敗: ${repairErr?.message}`);

    const after = await client
      .from('reward_transactions')
      .select('amount, generation, source_claim_id')
      .eq('user_id', upline.id)
      .eq('referee_user_id', a.id)
      .eq('source_claim_id', credit!.id);
    assertEquals(after.data?.length, 1, 'repair 應補回 upline 的續約 gen1 獎勵');
    assertEquals(after.data?.[0]?.amount, 100);
    assertEquals(after.data?.[0]?.generation, 1);

    // 冪等：重跑不重複發。
    assertEquals(
      (await client.rpc('repair_orphaned_claim_rewards', { p_user_id: a.id })).error,
      null,
    );
    const after2 = await client
      .from('reward_transactions')
      .select('id')
      .eq('source_claim_id', credit!.id);
    assertEquals(after2.data?.length, 1, '重跑 repair 不得重複發獎');
  } finally {
    await deleteTestUsers(client, created);
  }
});
