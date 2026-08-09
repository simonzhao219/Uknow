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

Deno.test('verify-referral-code：空推薦碼被拒', async () => {
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

Deno.test('verify-referral-code：不存在的推薦碼判為無效', async () => {
  const res = await app.request('/api/listings/verify-referral-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'definitely-not-a-real-code' }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.valid, false);
});

Deno.test('verify-referral-code：有效會員的推薦碼通過驗證', async () => {
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

Deno.test('upload-photo：未驗證的請求被拒', async () => {
  const res = await app.request('/api/listings/upload-photo', {
    method: 'POST',
    body: new FormData(),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('upload-photo：沒帶檔案時被拒', async () => {
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

Deno.test('upload-photo：不允許的檔案類型被拒', async () => {
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

Deno.test('upload-photo：超過 5MB 的檔案被拒', async () => {
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

Deno.test('public_listings：有效會員的刊登可見、未付款會員的不可見', async () => {
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

Deno.test('public_listings：停權後該會員的刊登消失', async () => {
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

// public_listings 現在是顯式欄位清單，但只要有人把它改成 select l.*，
// listings 之後新增的任何欄位都會立刻對全世界可見——而那種 diff 在 review
// 時看起來只是「簡化」。這條把可見欄位釘成白名單。
//
// ⚠️ public_listings **不是**唯一對 anon 開放 select 的資料表面。0620000004
// 把它改成 security_invoker view 之後，底層 listings 需要一條可見性 policy
// （listings_select_public）才回得了資料，而那條 policy 的範圍是 PUBLIC——
// 也就是 anon 直打 /rest/v1/listings 一樣讀得到有效會員的刊登，由該 policy
// 決定可見範圍（20260726000001 明文重申這是刻意設計）。兩者欄位集合相同，
// 所以直連不會多洩欄位；那個對稱關係由 rls-policies.test.ts 釘住，本檔只護
// 得住 view 這一側。
//
// ⚠️ 這條也不等於「RLS 已被驗證」：本地 supabase 的 anon/authenticated 缺
// table GRANT（見檔頭），policy 的**行為**在這個環境測不到。結構由
// rls-policies.test.ts 釘（同一軌），行為驗證在 journey 的 hosted 分支
// （45_listing_rls.feature）。
Deno.test('public_listings: 對外可見欄位是白名單，不得無聲增加', async () => {
  const admin = adminClient();
  const user = await createTestUser(admin, { name: '欄位白名單' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, { name: '欄位檢查' }));

    const { data } = await admin
      .from('public_listings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const expected = [
      'id',
      'user_id',
      'name',
      'category',
      'city',
      'districts',
      'gender',
      'photos',
      'contacts',
      'description',
      'created_at',
      'updated_at',
    ].sort();

    assertEquals(
      Object.keys(data ?? {}).sort(),
      expected,
      'public_listings 的欄位變了。新增欄位＝對未登入訪客公開，' +
        '請確認那是刻意的（例如絕不可出現 national_id / bank_account / phone）',
    );
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});
