// ============================================================
// DELETE /listings/photos、DELETE /listings/:id 整合測試（需要 supabase start）：
// 純邏輯與 handler 分支在 listing-photos.unit.test.ts；這裡驗「真 Postgres＋真路由」才成立的事——
// 路由註冊順序、跨使用者擁有權（不洩漏他人刊登）、刪列後真的消失。
// Storage 實際移除需要 bucket，不在此層測（同 listings.test.ts 對 upload-photo 的處理）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
const { app } = await import('./index.ts');

function listingRow(userId: string) {
  return {
    user_id: userId,
    name: '清理測試刊登',
    category: '美髮',
    city: '台北市',
    districts: ['全區'],
    gender: '女',
    photos: [],
    contacts: { instagram: 'ig' },
    description: 'x',
  };
}

Deno.test('DELETE /listings/photos 與 /listings/:id：未驗證皆 401（photos 沒被 :id 吞掉）', async () => {
  for (
    const path of ['/api/listings/photos', '/api/listings/99999999-8888-7777-6666-555555555555']
  ) {
    const res = await app.request(path, { method: 'DELETE' });
    assertEquals(res.status, 401, path);
    await res.body?.cancel();
  }
});

Deno.test('DELETE /listings/photos：他人前綴路徑 403、格式不合 400', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '清理者' });
  try {
    const token = await getUserAccessToken(client, user.email);
    const call = (paths: string[]) =>
      app.request('/api/listings/photos', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
    const foreign = await call(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/1700000000000_abc123.jpg']);
    assertEquals(foreign.status, 403);
    await foreign.body?.cancel();
    const bad = await call(['../etc/passwd']);
    assertEquals(bad.status, 400);
    await bad.body?.cancel();
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('DELETE /listings/:id：刪自己的刊登成功、再刪一次 404 帶 not_found；不能刪他人的', async () => {
  const client = adminClient();
  const owner = await createTestUser(client, { name: '擁有者' });
  const stranger = await createTestUser(client, { name: '陌生人' });
  try {
    const { data: inserted } = await client.from('listings').insert(listingRow(owner.id))
      .select('id').single();
    const id = inserted!.id as string;
    const ownerToken = await getUserAccessToken(client, owner.email);
    const strangerToken = await getUserAccessToken(client, stranger.email);
    const del = (token: string) =>
      app.request(`/api/listings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

    const byStranger = await del(strangerToken);
    assertEquals(byStranger.status, 404);
    assertEquals((await byStranger.json()).error.code, 'not_found');
    const stillThere = await client.from('listings').select('id').eq('id', id);
    assertEquals(stillThere.data?.length, 1, '他人呼叫不可刪到列');

    const ok = await del(ownerToken);
    assertEquals(ok.status, 200);
    assertEquals((await ok.json()).success, true);
    const gone = await client.from('listings').select('id').eq('id', id);
    assertEquals(gone.data?.length, 0);

    const again = await del(ownerToken);
    assertEquals(again.status, 404);
    assertEquals((await again.json()).error.code, 'not_found');
  } finally {
    await deleteTestUsers(client, [owner.id, stranger.id]);
  }
});

Deno.test('index.ts 註冊順序：/listings/photos 先於 /listings/:id', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const photos = src.indexOf("app.delete('/listings/photos'");
  const byId = src.indexOf("app.delete('/listings/:id'");
  assert(photos >= 0 && byId >= 0, '兩條路由都要註冊');
  assert(photos < byId, '/listings/photos 必須先註冊，否則 "photos" 會被當成 :id');
});
