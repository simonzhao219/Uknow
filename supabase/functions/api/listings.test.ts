// ============================================================
// 刊登（listings）測試：
//   (A) 兩支 HTTP 路由 —— /listings/verify-referral-code、/listings/upload-photo
//   (B) public_listings 檢視表能見度 —— 以 has_active_subscription() gating：
//       只有「有效訂閱且未停權」的擁有者，其刊登才對外可見。
//
// 為什麼不在這裡用 per-user（authenticated）client 直接測 listings 的 RLS
// insert/update/delete？本專案刻意只把 table 權限 GRANT 給 service_role
// （見 migration 20260717000001），authenticated/anon 依賴 hosted Supabase 的
// 預設授權；本地 `supabase start` 不會補這層 grant，所以 authenticated 直連
// listings 會在「權限（GRANT）」層就被擋（42501），測不到 RLS policy 本身。
// 既有測試套件也因此一律用 service-role 播種、透過 public_listings 檢視表
// （其 WHERE 對所有角色生效）驗證對外能見度——本檔沿用同一套可靠模式。
// 擁有權寫入保護由 RLS 的 listings_insert/update/delete_own 負責（hosted 端
// 生效），此處不重複以行為測試涵蓋。
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
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

function listingRow(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    name: '測試刊登',
    category: '美髮',
    city: '台北市',
    districts: ['全區'],
    gender: '女',
    photos: [],
    contacts: { instagram: 'ig' },
    description: 'x',
    ...overrides,
  };
}

// ============================================================
// (A1) POST /listings/verify-referral-code
// ============================================================

Deno.test('verify-referral-code: empty code is rejected', async () => {
  const res = await app.request('/api/listings/verify-referral-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '' }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.valid, false);
  assertEquals(body.error?.message, '推薦碼不能為空');
});

Deno.test('verify-referral-code: unknown code is invalid', async () => {
  const res = await app.request('/api/listings/verify-referral-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'definitely-not-a-real-code' }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.valid, false);
});

Deno.test('verify-referral-code: an active member\'s code validates', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: '推薦人' });
  try {
    await payForUser(client, referrer.id); // 產生 active 訂閱 + referral code
    const code = await getActiveReferralCode(client, referrer.id);

    const res = await app.request('/api/listings/verify-referral-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.valid, true);
    assertEquals(body.referrer?.userId, referrer.id);
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

// ============================================================
// (A2) POST /listings/upload-photo — 驗證分支（成功路徑需要 storage bucket，
//      不在此層測試）
// ============================================================

Deno.test('upload-photo: rejects an unauthenticated request', async () => {
  const res = await app.request('/api/listings/upload-photo', {
    method: 'POST',
    body: new FormData(),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('upload-photo: rejects when no file is provided', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '上傳者' });
  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/listings/upload-photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: new FormData(),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, '未提供檔案');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('upload-photo: rejects a disallowed file type', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '上傳者' });
  try {
    const token = await getUserAccessToken(client, user.email);
    const form = new FormData();
    form.append('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
    const res = await app.request('/api/listings/upload-photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, '只支援 JPG、PNG、WEBP 格式');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('upload-photo: rejects a file larger than 5MB', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '上傳者' });
  try {
    const token = await getUserAccessToken(client, user.email);
    const tooBig = new Uint8Array(5 * 1024 * 1024 + 1);
    const form = new FormData();
    form.append('file', new File([tooBig], 'big.jpg', { type: 'image/jpeg' }));
    const res = await app.request('/api/listings/upload-photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, '檔案不得超過 5MB');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

// ============================================================
// (B) public_listings：只有 active 且未停權的擁有者，其刊登才對外可見
//     （檢視表 WHERE has_active_subscription() 對所有角色生效，含 service-role）
// ============================================================

Deno.test('public_listings: an active member\'s listing is visible, an unpaid member\'s is not', async () => {
  const admin = adminClient();
  const activeUser = await createTestUser(admin, { name: '有效會員' });
  const unpaidUser = await createTestUser(admin, { name: '未付款會員' });
  try {
    await payForUser(admin, activeUser.id); // → active 訂閱
    await admin.from('listings').insert(listingRow(activeUser.id, { name: '可見刊登' }));
    await admin.from('listings').insert(listingRow(unpaidUser.id, { name: '隱藏刊登' }));

    const activeView = await admin
      .from('public_listings').select('id').eq('user_id', activeUser.id);
    assertEquals(activeView.data?.length, 1);

    const unpaidView = await admin
      .from('public_listings').select('id').eq('user_id', unpaidUser.id);
    assertEquals(unpaidView.data?.length, 0);
  } finally {
    await deleteTestUsers(admin, [activeUser.id, unpaidUser.id]);
  }
});

Deno.test('public_listings: suspending an active member hides their listing', async () => {
  const admin = adminClient();
  const user = await createTestUser(admin, { name: '被停權會員' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, { name: '停權前可見' }));

    const before = await admin.from('public_listings').select('id').eq('user_id', user.id);
    assertEquals(before.data?.length, 1);

    // 停權（profiles.suspended_at）→ has_active_subscription() 轉為 false
    await admin.from('profiles').update({ suspended_at: '2020-01-01T00:00:00Z' }).eq('id', user.id);

    const after = await admin.from('public_listings').select('id').eq('user_id', user.id);
    assertEquals(after.data?.length, 0);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});
