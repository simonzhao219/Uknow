// 刊登照片清理的純邏輯契約（不碰資料庫）：路徑白名單、輸入驗證、URL→path 解析、
// 引用檢查（fail-closed）。任何一條破功都可能讓清理誤刪仍在使用的照片或他人的檔。
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  listingPhotoPathPattern,
  MAX_DELETE_PATHS,
  type PhotoCleanupDeps,
  photoUrlToOwnedPath,
  removeUnreferencedPhotos,
  validateDeletePathsBody,
} from './listing-photos.ts';

const ME = '11111111-2222-3333-4444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const BASE = 'https://proj.supabase.co/storage/v1/object/public/make-5c6718b9-listings-photos/';
const mine = (n = '1700000000000_abc123', ext = 'jpg') => `${ME}/${n}.${ext}`;
const urlOf = (path: string) => `${BASE}${path}`;

Deno.test('listingPhotoPathPattern：接受自己前綴的 upload-photo 路徑格式', () => {
  const re = listingPhotoPathPattern(ME);
  for (const ext of ['jpg', 'png', 'webp']) assert(re.test(mine('1700000000000_abc123', ext)));
});

Deno.test('listingPhotoPathPattern：拒絕他人前綴、路徑穿越、錯誤副檔名、多層路徑', () => {
  const re = listingPhotoPathPattern(ME);
  const bad = [
    `${OTHER}/1700000000000_abc123.jpg`,
    `${ME}/../${OTHER}/1700000000000_abc123.jpg`,
    `${ME}/1700000000000_abc123.gif`,
    `${ME}/sub/1700000000000_abc123.jpg`,
    `${ME}/1700000000000_ABC.jpg`,
    `/${ME}/1700000000000_abc123.jpg`,
    `${ME}/1700000000000_abc123.jpg\n`,
    '',
  ];
  for (const p of bad) assert(!re.test(p), `不該通過：${JSON.stringify(p)}`);
});

Deno.test('validateDeletePathsBody：合法 body 回 ok 與原順序 paths', () => {
  const paths = [mine('1_a'), mine('2_b')];
  assertEquals(validateDeletePathsBody({ paths }, ME), { ok: true, paths });
});

Deno.test('validateDeletePathsBody：非物件／非陣列／空陣列／非字串／重複／超量 → 400', () => {
  const tooMany = Array.from({ length: MAX_DELETE_PATHS + 1 }, (_, i) => mine(`${i}_a`));
  const cases: unknown[] = [
    null,
    'x',
    {},
    { paths: 'x' },
    { paths: [] },
    { paths: [1] },
    { paths: [mine('1_a'), mine('1_a')] },
    { paths: tooMany },
  ];
  for (const body of cases) {
    const r = validateDeletePathsBody(body, ME);
    assert(!r.ok, JSON.stringify(body));
    if (!r.ok) assertEquals(r.status, 400);
  }
});

Deno.test('validateDeletePathsBody：恰好上限筆數仍合法', () => {
  const paths = Array.from({ length: MAX_DELETE_PATHS }, (_, i) => mine(`${i}_a`));
  assertEquals(validateDeletePathsBody({ paths }, ME), { ok: true, paths });
});

Deno.test('validateDeletePathsBody：格式不合 → 400；格式合法但屬他人前綴 → 403；任一筆不合整批拒', () => {
  const garbage = validateDeletePathsBody({ paths: [mine(), '../etc/passwd'] }, ME);
  assert(!garbage.ok);
  if (!garbage.ok) assertEquals(garbage.status, 400);

  const foreign = validateDeletePathsBody(
    { paths: [mine(), `${OTHER}/1700000000000_abc123.jpg`] },
    ME,
  );
  assert(!foreign.ok);
  if (!foreign.ok) assertEquals(foreign.status, 403);
});

Deno.test('photoUrlToOwnedPath：自己的 public URL → path', () => {
  const p = mine();
  assertEquals(photoUrlToOwnedPath(urlOf(p), BASE, ME), p);
});

Deno.test('photoUrlToOwnedPath：他人前綴／外部網址／穿越／非字串 → null', () => {
  const cases: unknown[] = [
    urlOf(`${OTHER}/1700000000000_abc123.jpg`),
    'https://evil.example.com/' + mine(),
    urlOf(`${ME}/../${OTHER}/1700000000000_abc123.jpg`),
    urlOf(`${ME}/1700000000000_abc123.jpg?x=1`),
    urlOf(mine()) + '/extra',
    BASE,
    '',
    null,
    42,
  ];
  for (const u of cases) assertEquals(photoUrlToOwnedPath(u, BASE, ME), null, String(u));
});

function fakeDeps(over: Partial<PhotoCleanupDeps> = {}) {
  const calls = { find: [] as string[][], remove: [] as string[][] };
  const deps: PhotoCleanupDeps = {
    publicUrlOf: urlOf,
    findReferencedUrls: (urls) => {
      calls.find.push(urls);
      return Promise.resolve([]);
    },
    removeObjects: (paths) => {
      calls.remove.push(paths);
      return Promise.resolve(paths);
    },
    ...over,
  };
  return { deps, calls };
}

Deno.test('removeUnreferencedPhotos：無人引用 → 全刪，removed 取實際回傳數', async () => {
  const a = mine('1_a');
  const b = mine('2_b');
  const { deps, calls } = fakeDeps();
  assertEquals(await removeUnreferencedPhotos(deps, [a, b]), { removed: 2, skipped: [] });
  assertEquals(calls.find, [[urlOf(a), urlOf(b)]]); // 一次批次查詢，不是逐檔
  assertEquals(calls.remove, [[a, b]]);
});

Deno.test('removeUnreferencedPhotos：仍被引用者列 skipped 且不送去刪', async () => {
  const a = mine('1_a');
  const b = mine('2_b');
  const { deps, calls } = fakeDeps({
    findReferencedUrls: () => Promise.resolve([urlOf(b)]),
  });
  assertEquals(await removeUnreferencedPhotos(deps, [a, b]), { removed: 1, skipped: [b] });
  assertEquals(calls.remove, [[a]]);
});

Deno.test('removeUnreferencedPhotos：全部被引用 → 不呼叫 remove', async () => {
  const a = mine('1_a');
  const { deps, calls } = fakeDeps({ findReferencedUrls: () => Promise.resolve([urlOf(a)]) });
  assertEquals(await removeUnreferencedPhotos(deps, [a]), { removed: 0, skipped: [a] });
  assertEquals(calls.remove, []);
});

Deno.test('removeUnreferencedPhotos：removed 取 Storage 實際回傳（不存在的檔不算、冪等）', async () => {
  const a = mine('1_a');
  const b = mine('2_b');
  const { deps } = fakeDeps({ removeObjects: () => Promise.resolve([a]) });
  assertEquals((await removeUnreferencedPhotos(deps, [a, b])).removed, 1);
});

Deno.test('removeUnreferencedPhotos：引用查詢出錯 → throw 且一檔不刪（fail-closed）', async () => {
  const { deps, calls } = fakeDeps({
    findReferencedUrls: () => Promise.reject(new Error('db down')),
  });
  await assertRejects(() => removeUnreferencedPhotos(deps, [mine()]), Error, 'db down');
  assertEquals(calls.remove, []);
});

Deno.test('removeUnreferencedPhotos：Storage remove 出錯 → throw（不回報 removed）', async () => {
  const { deps } = fakeDeps({ removeObjects: () => Promise.reject(new Error('storage down')) });
  await assertRejects(() => removeUnreferencedPhotos(deps, [mine()]), Error, 'storage down');
});

Deno.test('removeUnreferencedPhotos：空清單不碰 DB 與 Storage', async () => {
  const { deps, calls } = fakeDeps();
  assertEquals(await removeUnreferencedPhotos(deps, []), { removed: 0, skipped: [] });
  assertEquals(calls, { find: [], remove: [] });
});
