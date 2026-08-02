// ============================================================
// /admin/** 的統一守門：requireAuth + profiles.is_admin 必須以
// middleware 強制涵蓋整個命名空間，而不是逐路由手貼——手貼漏一次
// 就是權限漏洞，GET /admin/features 正是漏網之魚（掛在 /admin 下
// 卻無任何驗證，與檔內「所有 /admin/** 統一守門」的註解矛盾）。
//
// 本檔是「守門」這件事的**單一權威測試**：底下的 ADMIN_ROUTES 要涵蓋
// 每一個 /admin/** 命名空間。原本 announcements 的守門測在
// admin-and-announcements.test.ts、system-alerts 的在 system-alerts-api
// .test.ts，各自建使用者、各自簽 token——同一條契約散在三個檔案，
// 新增端點時三處都要記得補，等於三處都可能漏。收攏到這裡之後，
// 那兩個檔案只負責各自的業務行為。
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

// 新增 /admin/** 端點時把它加進這裡——這份清單就是「哪些路徑受守門
// 保護」的規格。漏加一條，這裡不會紅，所以 code review 要盯的是
// 「新端點有沒有進清單」。
const ADMIN_ROUTES = [
  ['GET', '/api/admin/features'],
  ['GET', '/api/admin/withdrawals'],
  ['GET', '/api/admin/members'],
  ['GET', '/api/admin/announcements'],
  ['POST', '/api/admin/announcements'],
  ['GET', '/api/admin/system-alerts'],
  ['POST', '/api/admin/members/verify'],
  ['GET', '/api/admin/members/00000000-0000-0000-0000-000000000000'],
  ['POST', '/api/admin/members/00000000-0000-0000-0000-000000000000/admin'],
  ['GET', '/api/admin/id-reviews'],
  ['POST', '/api/admin/withdrawals/batch-mark-paid'],
  // 帶路徑參數的端點也要進來：守門在讀 param 之前就該擋下，
  // 所以隨便一個合法形狀的 uuid 就足以驗證 401/403。
  ['POST', '/api/admin/id-reviews/00000000-0000-0000-0000-000000000000/review'],
] as const;

Deno.test('admin 守門：匿名請求一律 401', async () => {
  for (const [method, path] of ADMIN_ROUTES) {
    const res = await app.request(path, { method });
    assertEquals(res.status, 401, `${method} ${path} 匿名應 401，實際 ${res.status}`);
    await res.body?.cancel();
  }
});

Deno.test('admin 守門：一般會員一律 403', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: 'Regular Member' });

  try {
    const token = await getUserAccessToken(client, member.email);
    for (const [method, path] of ADMIN_ROUTES) {
      const res = await app.request(path, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      assertEquals(res.status, 403, `${method} ${path} 應拒絕非管理員，實際 ${res.status}`);
      await res.body?.cancel();
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
