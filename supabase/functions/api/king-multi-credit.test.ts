// ============================================================
// TDD（red-first）：規則更新 3-B——推薦王當月每滿 8 位『新人』發一張
// 「免費續約 1 年」credit，且可多張（floor(新人數/8)），以 round_ordinal
// 區分。現行 referral_king_rewards 有 unique(user_id, month_key)＝每月一張、
// 且無 round_ordinal 欄位，故本測試在實作前預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  payForUser,
  getActiveReferralCode,
} from './test-helpers.ts';

Deno.test('推薦王：當月滿 8 / 16 位新人 → 1 / 2 張 credit（round_ordinal 遞增）', async () => {
  const client = adminClient();
  const king = await createTestUser(client, { name: 'King' });
  const created: string[] = [king.id];

  try {
    assertEquals((await payForUser(client, king.id)).error, null);
    const code = await getActiveReferralCode(client, king.id);

    // 前 8 位新人各付款一次
    for (let i = 0; i < 8; i++) {
      const u = await createTestUser(client, { name: `d${i}`, referredByCode: code });
      created.push(u.id);
      assertEquals((await payForUser(client, u.id)).error, null);
    }

    let { data: credits } = await client
      .from('referral_king_rewards')
      .select('round_ordinal, status')
      .eq('user_id', king.id)
      .order('round_ordinal', { ascending: true });
    assertEquals(credits?.length, 1, '滿 8 位應恰有 1 張 credit');
    assertEquals(credits?.[0]?.round_ordinal, 1);

    // 再 8 位（共 16）→ 第 2 張
    for (let i = 8; i < 16; i++) {
      const u = await createTestUser(client, { name: `d${i}`, referredByCode: code });
      created.push(u.id);
      assertEquals((await payForUser(client, u.id)).error, null);
    }

    ({ data: credits } = await client
      .from('referral_king_rewards')
      .select('round_ordinal, status')
      .eq('user_id', king.id)
      .order('round_ordinal', { ascending: true }));
    assertEquals(credits?.length, 2, '滿 16 位應有 2 張 credit');
    assertEquals(credits?.map((c: { round_ordinal: number }) => c.round_ordinal), [1, 2]);
  } finally {
    await deleteTestUsers(client, created);
  }
});
