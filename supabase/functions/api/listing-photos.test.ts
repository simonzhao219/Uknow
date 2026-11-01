// ============================================================
// DELETE /listings/photos、DELETE /listings/:id 整合測試（需要 supabase start）：
// 純邏輯與 handler 分支在 listing-photos.unit.test.ts；這裡驗「真 Postgres＋真路由」才成立的事——
// 路由註冊順序、跨使用者擁有權（不洩漏他人刊登）、刪列後真的消失。
// Storage 實際移除需要 bucket，不在此層測（同 listings.test.ts 對 upload-photo 的處理）。
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
const { app, listingPhotoPublicUrl, listingPhotoDeps } = await import('./index.ts');

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

Deno.test('upload-photo 回傳的 URL 格式必能被清理的引用檢查命中（同一函式產生）', () => {
  const path = '11111111-2222-3333-4444-555555555555/1700000000000_abc123.jpg';
  const url = listingPhotoPublicUrl(path);
  assertEquals(
    url,
    `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/listings-photos/${path}`,
  );
  assertEquals(listingPhotoDeps().cleanup.publicUrlOf(path), url);
});

async function uploadAll(
  bucket: ReturnType<ReturnType<typeof adminClient>['storage']['from']>,
  paths: string[],
) {
  for (const path of paths) {
    const { error } = await bucket.upload(path, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      contentType: 'image/jpeg',
    });
    assertEquals(error, null, `上傳 ${path} 失敗`);
  }
}

Deno.test('DELETE /listings/photos：真 Storage——他人引用不擋清理，本人刊登仍引用的檔才保留', async () => {
  const client = adminClient();
  const owner = await createTestUser(client, { name: '照片擁有者' });
  const other = await createTestUser(client, { name: '另一位刊登者' });
  const bucket = client.storage.from('listings-photos');
  const foreignRef = `${owner.id}/1700000000001_keep01.jpg`;
  const gone = `${owner.id}/1700000000002_gone02.jpg`;
  const ownRef = `${owner.id}/1700000000003_mine03.jpg`;
  try {
    await uploadAll(bucket, [foreignRef, gone, ownRef]);
    // 他人的 photos 引用 owner 的檔（違規引用）；owner 自己的刊登引用 ownRef。
    const { error: otherErr } = await client.from('listings').insert({
      ...listingRow(other.id),
      photos: [listingPhotoPublicUrl(foreignRef)],
    });
    assertEquals(otherErr, null);
    const { error: ownErr } = await client.from('listings').insert({
      ...listingRow(owner.id),
      photos: [listingPhotoPublicUrl(ownRef)],
    });
    assertEquals(ownErr, null);

    const token = await getUserAccessToken(client, owner.email);
    const res = await app.request('/api/listings/photos', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: [foreignRef, gone, ownRef] }),
    });
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { success: true, removed: 2, skipped: [ownRef] });

    const { data: remaining } = await bucket.list(owner.id);
    assertEquals((remaining ?? []).map((o) => o.name).sort(), ['1700000000003_mine03.jpg']);
  } finally {
    await bucket.remove([foreignRef, gone, ownRef]);
    await deleteTestUsers(client, [owner.id, other.id]);
  }
});

Deno.test('DELETE /listings/:id：真 Storage——刪刊登後即使他人引用該照片，檔仍被清掉', async () => {
  const client = adminClient();
  const owner = await createTestUser(client, { name: '刪刊登者' });
  const other = await createTestUser(client, { name: '違規引用者' });
  const bucket = client.storage.from('listings-photos');
  const photo = `${owner.id}/1700000000004_list04.jpg`;
  try {
    await uploadAll(bucket, [photo]);
    const url = listingPhotoPublicUrl(photo);
    const { data: inserted, error } = await client.from('listings')
      .insert({ ...listingRow(owner.id), photos: [url] }).select('id').single();
    assertEquals(error, null);
    const { error: otherErr } = await client.from('listings').insert({
      ...listingRow(other.id),
      photos: [url],
    });
    assertEquals(otherErr, null);

    const token = await getUserAccessToken(client, owner.email);
    const res = await app.request(`/api/listings/${inserted!.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200);
    await res.body?.cancel();

    const { data: remaining } = await bucket.list(owner.id);
    assertEquals(remaining ?? [], []);
  } finally {
    await bucket.remove([photo]);
    await deleteTestUsers(client, [owner.id, other.id]);
  }
});
