// ============================================================
// TDD（red-first）：規則更新——「任務進度 +1 只在直推成功一位『對此上線
// 而言是新的』下線時發生」。同一上線的續約不得再 +1。
//
// 現行 apply_referral_side_effects（wave4_guards.sql）對每筆付款都 append，
// 故本測試在實作前預期 FAIL：續約後該下線會被計到 2 次。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  payForUser,
  getActiveReferralCode,
} from './test-helpers.ts';

// 某 referee UUID 在某 referrer 的 monthly_referrals（跨所有月份）出現次數。
async function countReferee(
  client: ReturnType<typeof adminClient>,
  referrerId: string,
  refereeId: string,
): Promise<number> {
  const { data } = await client
    .from('task_progress')
    .select('monthly_referrals')
    .eq('user_id', referrerId)
    .maybeSingle();
  const monthly = (data?.monthly_referrals ?? {}) as Record<string, unknown>;
  let n = 0;
  for (const arr of Object.values(monthly)) {
    if (Array.isArray(arr)) {
      for (const id of arr) if (id === refereeId) n++;
    }
  }
  return n;
}

Deno.test('任務 +1 只在首購；同一上線續約不再 +1（新下線＝對此上線第一次）', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Upline' });
  const created: string[] = [referrer.id];

  try {
    assertEquals((await payForUser(client, referrer.id)).error, null);
    const code = await getActiveReferralCode(client, referrer.id);

    const a = await createTestUser(client, { name: 'A', referredByCode: code });
    created.push(a.id);

    // 首購 → 恰好計一次
    assertEquals((await payForUser(client, a.id)).error, null);
    assertEquals(await countReferee(client, referrer.id, a.id), 1, '首購後應恰好計 1 次');

    // 同一上線續約（再付一次）→ 不得再計
    assertEquals((await payForUser(client, a.id)).error, null);
    assertEquals(await countReferee(client, referrer.id, a.id), 1, '續約不得再計 A（仍應為 1 次）');
  } finally {
    await deleteTestUsers(client, created);
  }
});
