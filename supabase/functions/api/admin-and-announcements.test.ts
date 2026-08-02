// ============================================================
// Admin 後台（migration 0718 0102 + /admin/** 端點群）的**業務行為**。
// 守門本身（匿名 401 / 非管理員 403）不在這裡——見 admin-gate.test.ts
// 的 ADMIN_ROUTES 單一清單。
//   * 會員管理：admin_list_members（含 email）+ 停權（刊登下架）
//   * 全站公告：admin CRUD + 公開的 /announcements/active
//   * AdminSetup：首位管理員自助宣告（有管理員後鎖死）
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
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

// 守門（401/403）已收攏到 admin-gate.test.ts 的 ADMIN_ROUTES 單一清單，
// 本檔只負責 admin 端點的業務行為。

Deno.test('會員管理：列表含 email 與會籍；停權讓刊登從 public_listings 消失', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'List Admin' });
  const member = await createTestUser(client, { name: 'Listed Member' });

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    assertEquals((await payForUser(client, member.id)).error, null);

    // 給會員一個刊登
    const { error: insertErr } = await client.from('listings').insert({
      user_id: member.id,
      name: '測試刊登',
      category: '按摩',
      city: '台北市',
      districts: ['中山區'],
      gender: 'female',
      photos: [],
      contacts: {},
      description: 'x',
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
    const create = await app.request(
      '/api/admin/announcements',
      authed(token, {
        method: 'POST',
        body: JSON.stringify({ title: '系統維護預告', message: '今晚維護', type: 'warning' }),
      }),
    );
    const created = await create.json();
    assertEquals(created.success, true, JSON.stringify(created));

    const future = await app.request(
      '/api/admin/announcements',
      authed(token, {
        method: 'POST',
        body: JSON.stringify({
          title: '未來公告',
          message: '還沒開始',
          type: 'info',
          startsAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        }),
      }),
    );
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
    const del = await app.request(
      `/api/admin/announcements/${created.data.id}`,
      authed(token, { method: 'DELETE' }),
    );
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

    const claim = await app.request(
      '/api/admin-setup/set-self-admin',
      authed(firstToken, { method: 'POST' }),
    );
    assertEquals((await claim.json()).success, true);

    // 第二人不能再宣告
    const secondToken = await getUserAccessToken(client, second.email);
    const check2 = await app.request('/api/admin-setup/check', authed(secondToken));
    const check2Body = await check2.json();
    assertEquals(check2Body.hasExistingAdmin, true);
    assertEquals(check2Body.canBecomeAdmin, false);

    const claim2 = await app.request(
      '/api/admin-setup/set-self-admin',
      authed(secondToken, { method: 'POST' }),
    );
    assertEquals(claim2.status, 403);
    await claim2.body?.cancel();
  } finally {
    await deleteTestUsers(client, [first.id, second.id]);
  }
});

// ============================================================
// CI 沒有設 SUPABASE_DB_URL，本地 supabase 的 DB 在 54322——所以全庫其他
// 五個測試檔都是「env 優先、否則落到這個 fallback」。少了 fallback 會連到
// 預設的 5432 而 ECONNREFUSED，斷言根本跑不到，等於一條沒有訊號的測試。
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// 會員查詢台（規劃書階段 3.1 / 驗收情境 M2、M3）
//
// **統計卡說的是全站，不是當前頁。** 這是 M2 的核心：admin 看到「停權 3 人」
// 就會據此判斷要不要處理，而如果那個 3 只是「這一頁裡的 3」，數字就在說謊
// ——第 2 頁還有 5 個停權的他永遠不知道。所以 stats 必須在 filtered CTE 上算，
// 不受 limit 影響。這條測試刻意造 51 筆（> 預設 limit 50）來釘住這件事。
// ============================================================

Deno.test('admin_list_members：stats 算全站，不受 limit=50 截斷', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'Stats Admin' });
  const created: string[] = [admin.id];

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    // 51 筆 > 預設 limit 50：第 51 筆落在第二頁，若 stats 在分頁後才算就會漏掉。
    for (let i = 0; i < 51; i++) {
      const u = await createTestUser(client, { name: `Bulk Member ${i}` });
      created.push(u.id);
    }
    // 把最後兩筆停權——它們一定在「第一頁」之外或邊界上。
    await client
      .from('profiles')
      .update({ suspended_at: new Date().toISOString() })
      .in('id', created.slice(-2));

    const token = await getUserAccessToken(client, admin.email);
    const res = await app.request('/api/admin/members?search=Bulk Member&limit=50', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.data.members.length, 50, '一頁只回 50 筆');
    assertEquals(body.data.total, 51, 'total 是篩選後的全部筆數');
    assertEquals(body.data.stats.suspended, 2, 'stats.suspended 必須算全站而非當前頁');
  } finally {
    await deleteTestUsers(client, created);
  }
});

Deno.test('admin_list_members：status 篩選只回該狀態的會員', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'Filter Admin' });
  const active = await createTestUser(client, { name: 'Filter Active' });
  const suspended = await createTestUser(client, { name: 'Filter Suspended' });

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    await payForUser(client, active.id);
    await client
      .from('profiles')
      .update({ suspended_at: new Date().toISOString() })
      .eq('id', suspended.id);

    const token = await getUserAccessToken(client, admin.email);
    const res = await app.request('/api/admin/members?search=Filter&status=suspended', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();

    const names = body.data.members.map((m: { name: string }) => m.name);
    assert(names.includes('Filter Suspended'), `停權者應在結果內：${JSON.stringify(names)}`);
    assert(!names.includes('Filter Active'), '未停權者不該出現在 status=suspended');
  } finally {
    await deleteTestUsers(client, [admin.id, active.id, suspended.id]);
  }
});

Deno.test('admin_list_members：sort=created_asc 與 created_desc 排序相反', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'Sort Admin' });
  const first = await createTestUser(client, { name: 'Sort Alpha' });
  const second = await createTestUser(client, { name: 'Sort Beta' });

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    // 明確拉開註冊時間，避免同一毫秒造成排序不穩定。
    await client
      .from('profiles')
      .update({ created_at: '2026-01-01T00:00:00Z' })
      .eq('id', first.id);
    await client
      .from('profiles')
      .update({ created_at: '2026-06-01T00:00:00Z' })
      .eq('id', second.id);

    const token = await getUserAccessToken(client, admin.email);
    const ask = async (sort: string) => {
      const res = await app.request(`/api/admin/members?search=Sort&sort=${sort}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      return body.data.members.map((m: { name: string }) => m.name);
    };

    const asc = await ask('created_asc');
    const desc = await ask('created_desc');
    assertEquals(asc[0], 'Sort Alpha', 'created_asc 最早註冊的在前');
    assertEquals(desc[0], 'Sort Beta', 'created_desc 最晚註冊的在前');
  } finally {
    await deleteTestUsers(client, [admin.id, first.id, second.id]);
  }
});

Deno.test('admin_list_members：回應帶 endDate 與 idVerificationStatus', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'Field Admin' });
  const member = await createTestUser(client, { name: 'Field Member' });

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    await payForUser(client, member.id);
    await client
      .from('profiles')
      .update({ id_verification_status: 'pending' })
      .eq('id', member.id);

    const token = await getUserAccessToken(client, admin.email);
    const res = await app.request('/api/admin/members?search=Field Member', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const row = body.data.members[0];

    assertEquals(row.idVerificationStatus, 'pending');
    assert(row.endDate, `付費會員應有會籍到期日：${JSON.stringify(row)}`);
  } finally {
    await deleteTestUsers(client, [admin.id, member.id]);
  }
});

Deno.test('GRANT：authenticated 不得 EXECUTE 改寫後的 admin_list_members', async () => {
  const sql = postgres(DB_URL);
  try {
    // 直接問 Postgres 而非「打 rpc 看它被拒」——後者的 403 可能來自不相干的
    // 權限，即使 REVOKE 沒生效也照樣「被拒」，斷言會失去辨別力。
    const [row] = await sql`
      select has_function_privilege(
        'authenticated',
        'public.admin_list_members(text, text, text, int, int)',
        'EXECUTE'
      ) as can_execute
    `;
    assertEquals(row.can_execute, false);
  } finally {
    await sql.end();
  }
});
