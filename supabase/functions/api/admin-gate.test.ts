// ============================================================
// /admin/** 的統一守門：requireAuth + profiles.is_admin 必須以
// middleware 強制涵蓋整個命名空間，而不是逐路由手貼——手貼漏一次
// 就是權限漏洞，GET /admin/features 正是漏網之魚（掛在 /admin 下
// 卻無任何驗證，與檔內「所有 /admin/** 統一守門」的註解矛盾）。
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

Deno.test('admin 守門：匿名請求 /admin/features 必須 401（原為無驗證漏網端點）', async () => {
  const res = await app.request('/api/admin/features');
  assertEquals(res.status, 401, await res.clone().text());
});

Deno.test('admin 守門：一般會員請求 /admin/** 一律 403', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: 'Regular Member' });

  try {
    const token = await getUserAccessToken(client, member.email);
    for (const path of ['/api/admin/features', '/api/admin/withdrawals', '/api/admin/members']) {
      const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } });
      assertEquals(res.status, 403, `${path} 應拒絕非管理員，實際 ${res.status}`);
    }
  } finally {
    await deleteTestUsers(client, [member.id]);
  }
});

Deno.test('admin 守門：管理員可正常存取（characterization）', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'Gate Admin' });

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    const token = await getUserAccessToken(client, admin.email);

    const features = await app.request('/api/admin/features', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(features.status, 200);

    const withdrawals = await app.request('/api/admin/withdrawals', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(withdrawals.status, 200);
  } finally {
    await deleteTestUsers(client, [admin.id]);
  }
});
