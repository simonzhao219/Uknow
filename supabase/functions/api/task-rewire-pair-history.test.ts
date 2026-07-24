// ============================================================
// TDD（red-first）：規則更新——「新下線」的判斷是 pair-history（對『這個
// 上線』是不是第一次）。對應決策⑥與使用者的 B→C→B 例子：
//   A 首購上線 B → B +1
//   A 換線給全新上線 C → C +1（A 對 C 是新的）
//   A 換回舊上線 B → B 不再 +1（B 早已計過 A）
//
// 現行程式對每筆付款都 append，故「換回 B」會讓 B 計到 A 第二次——本測試
// 在實作前預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  payForUser,
  getActiveReferralCode,
} from './test-helpers.ts';

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

Deno.test('pair-history：B 首購 +1、換線給 C +1、換回 B 不再 +1', async () => {
  const client = adminClient();
  const b = await createTestUser(client, { name: 'B-upline' });
  const c = await createTestUser(client, { name: 'C-upline' });
  const created: string[] = [b.id, c.id];

  try {
    assertEquals((await payForUser(client, b.id)).error, null);
    assertEquals((await payForUser(client, c.id)).error, null);
    const codeB = await getActiveReferralCode(client, b.id);

    const a = await createTestUser(client, { name: 'A', referredByCode: codeB });
    created.push(a.id);

    // 首購（上線 B）
    assertEquals((await payForUser(client, a.id)).error, null);
    assertEquals(await countReferee(client, b.id, a.id), 1, 'B 首購 A 應計 1 次');
    assertEquals(await countReferee(client, c.id, a.id), 0);

    // 換線給 C（模擬 /payuni/prepare fresh 換上線：更新 referred_by_user_id）→ 付款
    await client.from('profiles').update({ referred_by_user_id: c.id }).eq('id', a.id);
    assertEquals((await payForUser(client, a.id)).error, null);
    assertEquals(await countReferee(client, c.id, a.id), 1, '換到全新上線 C 應 +1');
    assertEquals(await countReferee(client, b.id, a.id), 1, 'B 不受影響仍為 1');

    // 換回 B → 付款 → B 不得再計 A
    await client.from('profiles').update({ referred_by_user_id: b.id }).eq('id', a.id);
    assertEquals((await payForUser(client, a.id)).error, null);
    assertEquals(await countReferee(client, b.id, a.id), 1, '換回舊上線 B 不得再計 A');
    assertEquals(await countReferee(client, c.id, a.id), 1);
  } finally {
    await deleteTestUsers(client, created);
  }
});
