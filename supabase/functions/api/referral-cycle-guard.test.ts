// ============================================================
// L1：推薦循環防護 referral_would_create_cycle
//   自己 / 自己的下線 → true（會成環）；無關的人 → false。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  payForUser,
  getActiveReferralCode,
} from './test-helpers.ts';

Deno.test('referral_would_create_cycle：自己與下線回 true、無關者回 false', async () => {
  const client = adminClient();
  const a = await createTestUser(client, { name: 'Cycle A' });
  const downline = await createTestUser(client, { name: 'Cycle Downline' });
  const outsider = await createTestUser(client, { name: 'Cycle Outsider' });

  try {
    // a 成為會員 → 有推薦碼；downline 由 a 推薦並付款 → 建立邊 downline→a
    assertEquals((await payForUser(client, a.id)).error, null);
    const codeA = await getActiveReferralCode(client, a.id);

    await client.from('profiles').update({ referred_by_user_id: a.id, referred_by_code: codeA }).eq('id', downline.id);
    assertEquals((await payForUser(client, downline.id)).error, null);

    // 自我推薦
    const { data: selfCycle } = await client.rpc('referral_would_create_cycle', {
      p_user: a.id, p_new_referrer: a.id,
    });
    assertEquals(selfCycle, true, '把推薦人設成自己應判定成環');

    // a 想把推薦人設成自己的下線 → 成環
    const { data: downCycle } = await client.rpc('referral_would_create_cycle', {
      p_user: a.id, p_new_referrer: downline.id,
    });
    assertEquals(downCycle, true, '把推薦人設成自己的下線應判定成環');

    // 無關第三人 → 不成環
    const { data: noCycle } = await client.rpc('referral_would_create_cycle', {
      p_user: a.id, p_new_referrer: outsider.id,
    });
    assertEquals(noCycle, false, '無推薦關係的人不應判定成環');
  } finally {
    await deleteTestUsers(client, [a.id, downline.id, outsider.id]);
  }
});
