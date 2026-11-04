// ============================================================
// DELETE /auth/cancel-signup 退場（業主裁決 W5-12，第 5 波 S2；稽核 auth P1-4）。
//
// 「稍後註冊」原本會自助刪帳號；守衛讀取與刪除不在付款共用的 profiles 列鎖下，
// 分頁 A 刷卡中、分頁 B 按稍後註冊 → 錢收了、帳號沒了。裁決：稍後註冊改為
// 登出（不刪帳號），註冊中要刪帳號找客服，端點連同它的守衛一起移除。
// 本測試釘住「端點已不存在」，且已付款會員的帳號與訂單照舊保留。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

Deno.test('DELETE /auth/cancel-signup：端點已退場 → 404，帳號保留', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '註冊中' });
  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/auth/cancel-signup', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 404, await res.clone().text());
    const { data } = await client.auth.admin.getUserById(user.id);
    assertEquals(data.user?.id, user.id, '帳號不得被刪除');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
