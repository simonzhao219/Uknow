// ============================================================
// 兩個「今天已經修好」的行為，當成迴歸基準線：後面每一次改動都不能
// 讓這兩個測試變紅。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, createTestUser, deleteTestUsers, payForUser, getActiveReferralCode } from './test-helpers.ts';

Deno.test('a peripheral referral/reward failure does not roll back the core payment commit', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Referrer' });

  try {
    // Fault injection：预先塞一筆形狀錯誤的 task_progress（陣列而非物件）。
    // 周邊邏輯的 `jsonb_set(monthly_referrals, array[v_month_key], ...)`
    // 在 monthly_referrals 是陣列時，path 元素不是整數下標會直接報錯
    // ("path element at position 1 is not an integer")，只在 ON CONFLICT
    // DO UPDATE 分支觸發，所以要先讓這筆 task_progress 存在。
    const { error: seedErr } = await client
      .from('task_progress')
      .insert({ user_id: referrer.id, monthly_referrals: [] });
    assertEquals(seedErr, null);

    const payer = await createTestUser(client, { name: 'Payer' });
    // 手動建立推薦關係（不透過付款），確保 payer 的 referred_by_user_id
    // 指向這位故意帶壞資料的 referrer，讓周邊邏輯一定會走到會爆炸的那段。
    await client.from('profiles').update({ referred_by_user_id: referrer.id }).eq('id', payer.id);

    try {
      const { error, tradeNo } = await payForUser(client, payer.id);
      assertEquals(error, null, `RPC 呼叫本身不該報錯: ${error?.message}`);

      const { data: order } = await client
        .from('payment_orders')
        .select('status')
        .eq('transaction_id', tradeNo)
        .single();
      assertEquals(order?.status, 'completed');

      const { data: profile } = await client
        .from('profiles')
        .select('registration_step')
        .eq('id', payer.id)
        .single();
      assertEquals(profile?.registration_step, 3);

      const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', payer.id);
      assertEquals(subs?.length, 1);

      // 周邊邏輯的 task 段（Block B）確實失敗了（monthly_referrals 形狀壞掉，
      // pair-history 的 jsonb_each 於非物件爆炸），但規則更新後「發獎」已從
      // 「task」拆成獨立 subtransaction（Block A 呼叫共用函數
      // pay_referral_generations，per-gen 隔離）。故 gen1 獎勵在 task 段失敗下
      // 仍保留——比舊制「整段一起 rollback、獎勵一併消失」更耐失敗，也縮小了
      // orphan-repair 要補的缺口。核心付款（訂單 completed / step 3 / 訂閱）不受影響。
      const { data: rewards } = await client
        .from('reward_transactions')
        .select('id, generation')
        .eq('referee_user_id', payer.id);
      assertEquals(rewards?.length, 1, 'gen1 獎勵應在 task 段失敗下仍保留（Block A 與 Block B 已隔離）');
    } finally {
      await deleteTestUsers(client, [payer.id]);
    }
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('renewal payment reuses the existing active referral code (no duplicate-code rollback)', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Renewing Member' });

  try {
    const first = await payForUser(client, user.id);
    assertEquals(first.error, null);

    const codeAfterFirst = await getActiveReferralCode(client, user.id);

    const second = await payForUser(client, user.id);
    // 修復前：這裡會因為 uq_referral_codes_one_active 撞到唯一約束整筆
    // rollback，訂單永遠卡在 pending。這個測試鎖住「續約不能再犯這個」。
    assertEquals(second.error, null, `續約付款不應該報錯: ${second.error?.message}`);

    const { data: order } = await client
      .from('payment_orders')
      .select('status')
      .eq('transaction_id', second.tradeNo)
      .single();
    assertEquals(order?.status, 'completed');

    const { data: activeCodes } = await client
      .from('referral_codes')
      .select('code')
      .eq('user_id', user.id)
      .eq('status', 'active');
    assertEquals(activeCodes?.length, 1);
    assertEquals(activeCodes![0].code, codeAfterFirst);

    const { data: subs } = await client
      .from('subscriptions')
      .select('is_renewal')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    assertEquals(subs?.map((s: any) => s.is_renewal), [false, true]);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
