// ============================================================
// 刊登（listings）測試：
//   (A) 兩支 HTTP 路由 —— /listings/verify-referral-code、/listings/upload-photo
//   (B) 直連 PostgREST 的 RLS/檢視表行為 —— 擁有權隔離、public_listings
//       以 has_active_subscription() 做能見度 gating
//
// 前端的刊登 CRUD 是直連 supabase-js（RLS 保護），不走 HTTP 層，所以這裡用
// per-user client（verifyOtp 後受 RLS 限制）驗證擁有權，用 service-role client
// 播種、並透過 public_listings 檢視表驗證能見度（檢視表 WHERE 會對所有角色生效）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

// 取得一個「受 RLS 限制」的 per-user client：用 magiclink→verifyOtp 換 session，
// 之後這個 client 的 PostgREST 請求都以該使用者身分（role=authenticated）發出。
async function userClient(admin: SupabaseClient, email: string): Promise<SupabaseClient> {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`userClient generateLink failed: ${linkError?.message ?? 'no token'}`);
  }
  const client = adminClient();
  const { error: otpError } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });
  if (otpError) throw new Error(`userClient verifyOtp failed: ${otpError.message}`);
  return client;
}

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
//      不在單元層測試）
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
// (B1) RLS 擁有權：insert 只能替自己建立
// ============================================================

Deno.test('RLS: a user can insert their own listing but not one for someone else', async () => {
  const admin = adminClient();
  const a = await createTestUser(admin, { name: 'A' });
  const b = await createTestUser(admin, { name: 'B' });
  try {
    const clientA = await userClient(admin, a.email);

    // 替別人（B）建立 → WITH CHECK (user_id = auth.uid()) 擋下
    const forOther = await clientA.from('listings').insert(listingRow(b.id));
    assert(forOther.error, '應禁止替其他使用者建立刊登');

    // 替自己建立 → 允許
    const forSelf = await clientA.from('listings').insert(listingRow(a.id));
    assertEquals(forSelf.error, null);
  } finally {
    await deleteTestUsers(admin, [a.id, b.id]);
  }
});

// ============================================================
// (B2) RLS 擁有權：不能更新/刪除他人的刊登
// ============================================================

Deno.test('RLS: a user cannot update or delete another user\'s listing', async () => {
  const admin = adminClient();
  const owner = await createTestUser(admin, { name: '擁有者' });
  const intruder = await createTestUser(admin, { name: '入侵者' });
  try {
    // 用 service-role 播種擁有者的刊登（繞過 RLS，只是要有一列存在）
    const seed = await admin.from('listings').insert(listingRow(owner.id, { name: '原始名稱' }));
    assertEquals(seed.error, null);
    const { data: seeded } = await admin
      .from('listings').select('id').eq('user_id', owner.id).single();
    const listingId = seeded!.id;

    const clientB = await userClient(admin, intruder.email);

    // 更新他人刊登 → update_own 的 USING 不符 → 0 列受影響、名稱不變
    await clientB.from('listings').update({ name: '被竄改' }).eq('id', listingId);
    const afterUpdate = await admin.from('listings').select('name').eq('id', listingId).single();
    assertEquals(afterUpdate.data!.name, '原始名稱');

    // 刪除他人刊登 → delete_own 的 USING 不符 → 該列仍存在
    await clientB.from('listings').delete().eq('id', listingId);
    const afterDelete = await admin.from('listings').select('id').eq('id', listingId).maybeSingle();
    assert(afterDelete.data, '入侵者不應能刪除他人的刊登');
  } finally {
    await deleteTestUsers(admin, [owner.id, intruder.id]);
  }
});

// ============================================================
// (B3) public_listings：只有 active 會員的刊登對外可見
// ============================================================

Deno.test('public_listings: only an active member\'s listing is visible', async () => {
  const admin = adminClient();
  const activeUser = await createTestUser(admin, { name: '有效會員' });
  const inactiveUser = await createTestUser(admin, { name: '未付款會員' });
  try {
    await payForUser(admin, activeUser.id); // → active 訂閱
    await admin.from('listings').insert(listingRow(activeUser.id, { name: '可見刊登' }));
    await admin.from('listings').insert(listingRow(inactiveUser.id, { name: '隱藏刊登' }));

    // 檢視表 WHERE has_active_subscription() 對所有角色生效（含 service-role）
    const activeView = await admin
      .from('public_listings').select('id').eq('user_id', activeUser.id);
    assertEquals(activeView.data?.length, 1);

    const inactiveView = await admin
      .from('public_listings').select('id').eq('user_id', inactiveUser.id);
    assertEquals(inactiveView.data?.length, 0);
  } finally {
    await deleteTestUsers(admin, [activeUser.id, inactiveUser.id]);
  }
});
