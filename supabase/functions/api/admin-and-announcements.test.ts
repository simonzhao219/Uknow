// ============================================================
// Admin 後台（migration 0718 0102 + /admin/** 端點群）：
//   * requireAdmin 統一守門（非管理員 403）
//   * 會員管理：admin_list_members（含 email）+ 停權（刊登下架）
//   * 全站公告：admin CRUD + 公開的 /announcements/active
//   * AdminSetup：首位管理員自助宣告（有管理員後鎖死）
// ============================================================
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
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

function authed(token: string, init: RequestInit = {}) {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  };
}

Deno.test('admin 守門：非管理員一律 403', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Normal User' });

  try {
    const token = await getUserAccessToken(client, user.email);
    for (const [method, path] of [
      ['GET', '/api/admin/withdrawals'],
      ['GET', '/api/admin/members'],
      ['GET', '/api/admin/announcements'],
      ['POST', '/api/admin/announcements'],
    ] as const) {
      const res = await app.request(path, authed(token, { method }));
      assertEquals(res.status, 403, `${method} ${path} 非管理員應 403`);
      await res.body?.cancel();
    }
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('會員管理：列表含 email 與會籍；停權讓刊登從 public_listings 消失', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'List Admin' });
  const member = await createTestUser(client, { name: 'Listed Member' });

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    assertEquals((await payForUser(client, member.id)).error, null);

    // 給會員一個刊登
    const { error: insertErr } = await client.from('listings').insert({
      user_id: member.id, name: '測試刊登', category: '按摩', city: '台北市',
      districts: ['中山區'], gender: 'female', photos: [], contacts: {}, description: 'x',
    });
    assertEquals(insertErr, null);

    const adminToken = await getUserAccessToken(client, admin.email);

    // 列表（搜尋鎖定這位會員，避免撈到其他測試的資料）
    const res = await app.request(
      `/api/admin/members?search=${encodeURIComponent(member.email)}`,
      authed(adminToken),
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.data.members.length, 1);
    assertEquals(body.data.members[0].email, member.email);
    assertEquals(body.data.members[0].accountStatus, 'active');
    assertEquals(body.data.members[0].listingCount, 1);
    assertEquals(body.data.members[0].suspended, false);

    // 停權前刊登可見
    const before = await client.from('public_listings').select('id').eq('user_id', member.id);
    assertEquals(before.data?.length, 1);

    // 停權
    const suspendRes = await app.request(
      `/api/admin/members/${member.id}/suspend`,
      authed(adminToken, { method: 'POST', body: JSON.stringify({ suspend: true }) }),
    );
    assertEquals((await suspendRes.json()).success, true);

    // 刊登消失（has_active_subscription 同時守 RLS 與 view）
    const after = await client.from('public_listings').select('id').eq('user_id', member.id);
    assertEquals(after.data?.length, 0);

    // profile 回應帶停權旗標
    const memberToken = await getUserAccessToken(client, member.email);
    const profileRes = await app.request('/api/profile', authed(memberToken));
    assertEquals((await profileRes.json()).suspended, true);

    // 不能停權自己
    const selfRes = await app.request(
      `/api/admin/members/${admin.id}/suspend`,
      authed(adminToken, { method: 'POST', body: JSON.stringify({ suspend: true }) }),
    );
    assertEquals(selfRes.status, 400);
    await selfRes.body?.cancel();

    // 恢復
    const resumeRes = await app.request(
      `/api/admin/members/${member.id}/suspend`,
      authed(adminToken, { method: 'POST', body: JSON.stringify({ suspend: false }) }),
    );
    assertEquals((await resumeRes.json()).success, true);
    const restored = await client.from('public_listings').select('id').eq('user_id', member.id);
    assertEquals(restored.data?.length, 1);
  } finally {
    await deleteTestUsers(client, [admin.id, member.id]);
  }
});

Deno.test('全站公告：admin 建立/刪除；/announcements/active 只回生效中', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'Ann Admin' });

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    const token = await getUserAccessToken(client, admin.email);

    // 建立一則生效中 + 一則未來生效
    const create = await app.request('/api/admin/announcements', authed(token, {
      method: 'POST',
      body: JSON.stringify({ title: '系統維護預告', message: '今晚維護', type: 'warning' }),
    }));
    const created = await create.json();
    assertEquals(created.success, true, JSON.stringify(created));

    const future = await app.request('/api/admin/announcements', authed(token, {
      method: 'POST',
      body: JSON.stringify({
        title: '未來公告', message: '還沒開始', type: 'info',
        startsAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      }),
    }));
    const futureBody = await future.json();
    assertEquals(futureBody.success, true);

    // 公開端點（無 token）只回生效中的那則
    const active = await app.request('/api/announcements/active');
    const activeBody = await active.json();
    assertEquals(active.status, 200);
    const titles = activeBody.data.announcements.map((a: any) => a.title);
    assert(titles.includes('系統維護預告'), JSON.stringify(titles));
    assert(!titles.includes('未來公告'), '未生效的公告不應出現');

    // admin 列表兩則都看得到
    const all = await app.request('/api/admin/announcements', authed(token));
    const allBody = await all.json();
    const allTitles = allBody.data.announcements.map((a: any) => a.title);
    assert(allTitles.includes('未來公告'));

    // 刪除後從 active 消失
    const del = await app.request(`/api/admin/announcements/${created.data.id}`, authed(token, { method: 'DELETE' }));
    assertEquals((await del.json()).success, true);
    const active2 = await app.request('/api/announcements/active');
    const active2Body = await active2.json();
    assert(!active2Body.data.announcements.map((a: any) => a.title).includes('系統維護預告'));

    // 清理未來公告
    const cleanup = await app.request(
      `/api/admin/announcements/${futureBody.data.id}`,
      authed(token, { method: 'DELETE' }),
    );
    await cleanup.body?.cancel();
  } finally {
    await deleteTestUsers(client, [admin.id]);
  }
});

Deno.test('AdminSetup：無管理員時可自助宣告；已有管理員後鎖死', async () => {
  const client = adminClient();
  const first = await createTestUser(client, { name: 'First Admin' });
  const second = await createTestUser(client, { name: 'Second User' });

  try {
    // 清場：把其他測試留下的管理員全部降級，模擬「全新系統」
    await client.from('profiles').update({ is_admin: false }).eq('is_admin', true);

    const firstToken = await getUserAccessToken(client, first.email);
    const check1 = await app.request('/api/admin-setup/check', authed(firstToken));
    const check1Body = await check1.json();
    assertEquals(check1Body.canBecomeAdmin, true);

    const claim = await app.request('/api/admin-setup/set-self-admin', authed(firstToken, { method: 'POST' }));
    assertEquals((await claim.json()).success, true);

    // 第二人不能再宣告
    const secondToken = await getUserAccessToken(client, second.email);
    const check2 = await app.request('/api/admin-setup/check', authed(secondToken));
    const check2Body = await check2.json();
    assertEquals(check2Body.hasExistingAdmin, true);
    assertEquals(check2Body.canBecomeAdmin, false);

    const claim2 = await app.request('/api/admin-setup/set-self-admin', authed(secondToken, { method: 'POST' }));
    assertEquals(claim2.status, 403);
    await claim2.body?.cancel();
  } finally {
    await deleteTestUsers(client, [first.id, second.id]);
  }
});
