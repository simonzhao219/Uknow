// ============================================================
// 推薦王「當月可多張」（3-B）收尾：/tasks 端點要回傳 details.totalCredits
// （累計免費續約張數，含當月、含已領），讓主任務卡片能誠實顯示「累計獲得
// N 張」——completedMonths 只數達標月份且排除當月，多輪之下會低估。
// 這個欄位修復前不存在，本測試預期 FAIL。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
const { app } = await import('./index.ts');

Deno.test('GET /tasks：details.totalCredits 反映累計免費續約張數（含當月）', async () => {
  const client = adminClient();
  const king = await createTestUser(client, { name: 'King' });
  const created: string[] = [king.id];

  try {
    assertEquals((await payForUser(client, king.id)).error, null);
    const code = await getActiveReferralCode(client, king.id);

    // 當月推薦 8 位新人 → 1 張 credit
    for (let i = 0; i < 8; i++) {
      const u = await createTestUser(client, { name: `d${i}`, referredByCode: code });
      created.push(u.id);
      assertEquals((await payForUser(client, u.id)).error, null);
    }

    const token = await getUserAccessToken(client, king.email);
    const res = await app.request('/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200);

    const body = await res.json();
    const task = body?.data?.tasks?.[0];
    assertEquals(task?.current, 8, '當月 distinct 新推薦數應為 8');
    assertEquals(task?.details?.totalCredits, 1, 'totalCredits 應含當月的 1 張');
    // completedMonths 排除當月，故當月唯一達標時為 0——凸顯與 totalCredits 的差異。
    assertEquals(task?.details?.completedMonths, 0);
  } finally {
    await deleteTestUsers(client, created);
  }
});
