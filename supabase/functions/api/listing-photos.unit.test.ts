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
const BASE = 'https://proj.supabase.co/storage/v1/object/public/listings-photos/';
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
  const calls = { find: [] as string[][], owners: [] as string[], remove: [] as string[][] };
  const deps: PhotoCleanupDeps = {
    publicUrlOf: urlOf,
    findReferencedUrls: (urls, ownerId) => {
      calls.find.push(urls);
      calls.owners.push(ownerId);
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
  assertEquals(await removeUnreferencedPhotos(deps, [a, b], ME), { removed: 2, skipped: [] });
  assertEquals(calls.find, [[urlOf(a), urlOf(b)]]); // 一次批次查詢，不是逐檔
  assertEquals(calls.remove, [[a, b]]);
});

Deno.test('removeUnreferencedPhotos：引用檢查只問檔案前綴本人的刊登 → 帶 ownerId 查詢', async () => {
  const { deps, calls } = fakeDeps();
  await removeUnreferencedPhotos(deps, [mine('1_a')], ME);
  assertEquals(calls.owners, [ME]);
});

Deno.test('removeUnreferencedPhotos：仍被引用者列 skipped 且不送去刪', async () => {
  const a = mine('1_a');
  const b = mine('2_b');
  const { deps, calls } = fakeDeps({
    findReferencedUrls: () => Promise.resolve([urlOf(b)]),
  });
  assertEquals(await removeUnreferencedPhotos(deps, [a, b], ME), { removed: 1, skipped: [b] });
  assertEquals(calls.remove, [[a]]);
});

Deno.test('removeUnreferencedPhotos：全部被引用 → 不呼叫 remove', async () => {
  const a = mine('1_a');
  const { deps, calls } = fakeDeps({ findReferencedUrls: () => Promise.resolve([urlOf(a)]) });
  assertEquals(await removeUnreferencedPhotos(deps, [a], ME), { removed: 0, skipped: [a] });
  assertEquals(calls.remove, []);
});

Deno.test('removeUnreferencedPhotos：removed 取 Storage 實際回傳（不存在的檔不算、冪等）', async () => {
  const a = mine('1_a');
  const b = mine('2_b');
  const { deps } = fakeDeps({ removeObjects: () => Promise.resolve([a]) });
  assertEquals((await removeUnreferencedPhotos(deps, [a, b], ME)).removed, 1);
});

Deno.test('removeUnreferencedPhotos：引用查詢出錯 → throw 且一檔不刪（fail-closed）', async () => {
  const { deps, calls } = fakeDeps({
    findReferencedUrls: () => Promise.reject(new Error('db down')),
  });
  await assertRejects(() => removeUnreferencedPhotos(deps, [mine()], ME), Error, 'db down');
  assertEquals(calls.remove, []);
});

Deno.test('removeUnreferencedPhotos：Storage remove 出錯 → throw（不回報 removed）', async () => {
  const { deps } = fakeDeps({ removeObjects: () => Promise.reject(new Error('storage down')) });
  await assertRejects(() => removeUnreferencedPhotos(deps, [mine()], ME), Error, 'storage down');
});

Deno.test('removeUnreferencedPhotos：空清單不碰 DB 與 Storage', async () => {
  const { deps, calls } = fakeDeps();
  assertEquals(await removeUnreferencedPhotos(deps, [], ME), { removed: 0, skipped: [] });
  assertEquals(calls, { find: [], owners: [], remove: [] });
});

// ---------- 孤兒排程清理 sweepOrphanPhotos ----------
import {
  type OrphanReport,
  type OrphanSweepDeps,
  SweepError,
  type SweepOptions,
  sweepOrphanPhotos,
} from './listing-photos.ts';

const orphanNames = (count: number) =>
  Array.from({ length: count }, (_, i) => `${OTHER}/${1700000000000 + i}_orph.jpg`);

function report(over: Partial<OrphanReport> = {}): OrphanReport {
  const candidates = over.candidates ?? orphanNames(3);
  return {
    candidates,
    orphanTotal: candidates.length,
    totalObjects: 100,
    referencedUrls: 50,
    matchedUrls: 50,
    ...over,
  };
}

function sweepHarness(over: Partial<OrphanSweepDeps> = {}, rep: OrphanReport = report()) {
  const log = { list: [] as unknown[][], filter: [] as string[][], remove: [] as string[][] };
  const deps: OrphanSweepDeps = {
    listOrphans: (...args) => {
      log.list.push(args);
      return Promise.resolve(rep);
    },
    filterUnreferenced: (_base, names) => {
      log.filter.push(names);
      return Promise.resolve(names);
    },
    removeObjects: (paths) => {
      log.remove.push(paths);
      return Promise.resolve(paths);
    },
    warn: () => {},
    ...over,
  };
  return { deps, log };
}

const LIVE: SweepOptions = {
  publicBase: BASE,
  graceHours: 168,
  limit: 500,
  dryRun: false,
  forceRatio: false,
};

async function sweepFails(p: Promise<unknown>): Promise<SweepError> {
  const err = await assertRejects(() => p);
  assert(err instanceof SweepError, `應為 SweepError：${err}`);
  return err;
}

Deno.test('sweepOrphanPhotos：實刪 → 以 base／寬限期／上限查候選，複查後刪除並回統計', async () => {
  const rep = report();
  const { deps, log } = sweepHarness({}, rep);
  const result = await sweepOrphanPhotos(deps, LIVE);
  assertEquals(log.list, [[BASE, 168, 500]]);
  assertEquals(log.filter, [rep.candidates]);
  assertEquals(log.remove, [rep.candidates]);
  assertEquals(result, {
    dryRun: false,
    candidates: rep.candidates,
    removed: 3,
    notRemoved: 0,
    totalObjects: 100,
    referencedUrls: 50,
    matchedUrls: 50,
  });
});

Deno.test('sweepOrphanPhotos：列孤兒 RPC 出錯 → sweep_failed，不複查不刪', async () => {
  const { deps, log } = sweepHarness({ listOrphans: () => Promise.reject(new Error('db down')) });
  const err = await sweepFails(sweepOrphanPhotos(deps, LIVE));
  assertEquals([err.code, err.removedSoFar], ['sweep_failed', 0]);
  assertEquals([log.filter, log.remove], [[], []]);
});

Deno.test('sweepOrphanPhotos：錨點失效（有引用卻一個都對不到物件）→ circuit_open，force_ratio 也不放行', async () => {
  for (const forceRatio of [false, true]) {
    const { deps, log } = sweepHarness({}, report({ matchedUrls: 0 }));
    const err = await sweepFails(sweepOrphanPhotos(deps, { ...LIVE, forceRatio }));
    assertEquals(err.code, 'circuit_open');
    assertEquals(log.remove, []);
  }
});

Deno.test('sweepOrphanPhotos：沒有任何引用或 bucket 為空時錨點不判失效', async () => {
  for (const over of [{ referencedUrls: 0, matchedUrls: 0 }, { totalObjects: 0, matchedUrls: 0 }]) {
    const { deps } = sweepHarness({}, report({ ...over, candidates: [], orphanTotal: 0 }));
    assertEquals((await sweepOrphanPhotos(deps, LIVE)).removed, 0);
  }
});

Deno.test('sweepOrphanPhotos：比例閘看截斷前 orphan_total（物件逾千、候選被截斷）→ circuit_open', async () => {
  const rep = report({ candidates: orphanNames(500), orphanTotal: 600, totalObjects: 1001 });
  const { deps, log } = sweepHarness({}, rep);
  const err = await sweepFails(sweepOrphanPhotos(deps, LIVE));
  assertEquals(err.code, 'circuit_open');
  assertEquals([log.filter, log.remove], [[], []]);
});

Deno.test('sweepOrphanPhotos：比例恰為一半或物件數 ≤ 20 時比例閘不開', async () => {
  const cases = [
    report({ candidates: orphanNames(50), totalObjects: 100 }),
    report({ candidates: orphanNames(20), totalObjects: 20, referencedUrls: 0, matchedUrls: 0 }),
  ];
  for (const rep of cases) {
    const { deps } = sweepHarness({}, rep);
    assertEquals((await sweepOrphanPhotos(deps, LIVE)).removed, rep.candidates.length);
  }
});

Deno.test('sweepOrphanPhotos：force_ratio 放行比例閘，照常複查與刪除', async () => {
  const rep = report({ candidates: orphanNames(80), totalObjects: 100 });
  const { deps, log } = sweepHarness({}, rep);
  const result = await sweepOrphanPhotos(deps, { ...LIVE, forceRatio: true });
  assertEquals(result.removed, 80);
  assertEquals(log.filter.length, 1);
});

Deno.test('sweepOrphanPhotos：dry-run 回候選與統計，不呼叫 remove', async () => {
  const rep = report();
  const { deps, log } = sweepHarness({}, rep);
  const result = await sweepOrphanPhotos(deps, { ...LIVE, dryRun: true });
  assertEquals(log.remove, []);
  assertEquals(result.dryRun, true);
  assertEquals(result.candidates, rep.candidates);
  assertEquals([result.removed, result.notRemoved], [0, 0]);
});

Deno.test('sweepOrphanPhotos：dry-run 照樣受斷路器約束', async () => {
  const { deps } = sweepHarness({}, report({ matchedUrls: 0 }));
  const err = await sweepFails(sweepOrphanPhotos(deps, { ...LIVE, dryRun: true }));
  assertEquals(err.code, 'circuit_open');
});

Deno.test('sweepOrphanPhotos：複查剔除的檔（期間被重新引用）不送去刪', async () => {
  const rep = report();
  const { deps, log } = sweepHarness({
    filterUnreferenced: (_b, names) => Promise.resolve(names.slice(1)),
  }, rep);
  const result = await sweepOrphanPhotos(deps, LIVE);
  assertEquals(log.remove, [rep.candidates.slice(1)]);
  assertEquals(result.removed, 2);
});

Deno.test('sweepOrphanPhotos：複查 RPC 出錯 → sweep_failed 且一檔不刪', async () => {
  const { deps, log } = sweepHarness({
    filterUnreferenced: () => Promise.reject(new Error('db down')),
  });
  const err = await sweepFails(sweepOrphanPhotos(deps, LIVE));
  assertEquals([err.code, err.removedSoFar], ['sweep_failed', 0]);
  assertEquals(log.remove, []);
});

Deno.test('sweepOrphanPhotos：沒有候選時不呼叫複查與 remove', async () => {
  const { deps, log } = sweepHarness({}, report({ candidates: [] }));
  assertEquals((await sweepOrphanPhotos(deps, LIVE)).removed, 0);
  assertEquals([log.filter, log.remove], [[], []]);
});

Deno.test('sweepOrphanPhotos：250 個候選切成 100／100／50 三批', async () => {
  const rep = report({ candidates: orphanNames(250), totalObjects: 1000 });
  const { deps, log } = sweepHarness({}, rep);
  const result = await sweepOrphanPhotos(deps, LIVE);
  assertEquals(log.remove.map((b) => b.length), [100, 100, 50]);
  assertEquals(log.remove.flat(), rep.candidates);
  assertEquals(result.removed, 250);
});

Deno.test('sweepOrphanPhotos：第二批 remove 失敗 → sweep_failed 帶 removedSoFar，不送第三批', async () => {
  let batch = 0;
  const { deps, log } = sweepHarness(
    {
      removeObjects: (paths) => {
        log.remove.push(paths);
        return ++batch === 2 ? Promise.reject(new Error('storage down')) : Promise.resolve(paths);
      },
    },
    report({ candidates: orphanNames(250), totalObjects: 1000 }),
  );
  const err = await sweepFails(sweepOrphanPhotos(deps, LIVE));
  assertEquals([err.code, err.removedSoFar], ['sweep_failed', 100]);
  assertEquals(log.remove.length, 2);
});

Deno.test('sweepOrphanPhotos：Storage 實刪數少於送出數 → 差額記為 notRemoved', async () => {
  const rep = report();
  const { deps } = sweepHarness({
    removeObjects: (paths) => Promise.resolve(paths.slice(0, 1)),
  }, rep);
  const result = await sweepOrphanPhotos(deps, LIVE);
  assertEquals([result.removed, result.notRemoved], [1, 2]);
});

// ---------- 路由處理函式 ----------
import { Hono } from 'npm:hono@4';
import { createListingPhotoHandlers, type ListingPhotoHandlerDeps } from './listing-photos.ts';

const LISTING_ID = '99999999-8888-7777-6666-555555555555';

function harness(over: Partial<ListingPhotoHandlerDeps> = {}) {
  const log = {
    rate: [] as string[],
    removed: [] as string[][],
    deletedRows: [] as string[],
    warns: [] as string[],
    owners: [] as string[],
  };
  const { deps: cleanup } = fakeDeps({
    findReferencedUrls: (_urls, ownerId) => {
      log.owners.push(ownerId);
      return Promise.resolve([]);
    },
    removeObjects: (paths) => {
      log.removed.push(paths);
      return Promise.resolve(paths);
    },
  });
  const deps: ListingPhotoHandlerDeps = {
    requireAuth: () => Promise.resolve({ id: ME }),
    rateLimit: (key) => {
      log.rate.push(key);
      return Promise.resolve(true);
    },
    cleanup,
    deleteListingRow: (id, userId) => {
      log.deletedRows.push(`${id}:${userId}`);
      return Promise.resolve({ photos: [urlOf(mine('1_a')), urlOf(mine('2_b'))] });
    },
    warn: (m) => log.warns.push(m),
    ...over,
  };
  const h = createListingPhotoHandlers(deps);
  // 註冊順序與 index.ts 相同：/listings/photos 必須先於 /listings/:id
  const app = new Hono();
  app.delete('/listings/photos', h.deletePhotos);
  app.delete('/listings/:id', h.deleteListing);
  return { app, log };
}
const del = (app: Hono, path: string, body?: unknown) =>
  app.request(path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

Deno.test('DELETE /listings/photos：未登入 401；不碰限流與 Storage', async () => {
  const { app, log } = harness({ requireAuth: () => Promise.resolve(null) });
  const res = await del(app, '/listings/photos', { paths: [mine()] });
  assertEquals(res.status, 401);
  assertEquals(log.rate, []);
  assertEquals(log.removed, []);
});

Deno.test('DELETE /listings/photos：超過限流 429', async () => {
  const { app } = harness({ rateLimit: () => Promise.resolve(false) });
  assertEquals((await del(app, '/listings/photos', { paths: [mine()] })).status, 429);
});

Deno.test('DELETE /listings/photos：路徑不合 400、他人前綴 403、body 非 JSON 400；都不刪', async () => {
  const { app, log } = harness();
  assertEquals((await del(app, '/listings/photos', { paths: ['../x'] })).status, 400);
  assertEquals(
    (await del(app, '/listings/photos', { paths: [`${OTHER}/1700000000000_abc123.jpg`] })).status,
    403,
  );
  const bad = await app.request('/listings/photos', { method: 'DELETE', body: 'not json' });
  assertEquals(bad.status, 400);
  assertEquals(log.removed, []);
});

Deno.test('DELETE /listings/photos：合法 → 200 回 removed／skipped；路由不被 /:id 吞掉', async () => {
  const { app, log } = harness();
  const res = await del(app, '/listings/photos', { paths: [mine('1_a')] });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true, removed: 1, skipped: [] });
  assertEquals(log.deletedRows, []); // 沒有誤走到刪刊登
  assertEquals(log.rate, [`listing-photos-del:${ME}`]);
});

Deno.test('DELETE /listings/photos 與 /listings/:id：引用檢查以 token 本人為 ownerId', async () => {
  const { app, log } = harness();
  assertEquals((await del(app, '/listings/photos', { paths: [mine('1_a')] })).status, 200);
  assertEquals((await del(app, `/listings/${LISTING_ID}`)).status, 200);
  assertEquals(log.owners, [ME, ME]);
});

Deno.test('DELETE /listings/photos：引用查詢出錯 → 500 且一檔不刪（fail-closed）', async () => {
  const { app, log } = harness({
    cleanup: {
      publicUrlOf: urlOf,
      findReferencedUrls: () => Promise.reject(new Error('db down')),
      removeObjects: (paths) => {
        log.removed.push(paths);
        return Promise.resolve(paths);
      },
    },
  });
  const res = await del(app, '/listings/photos', { paths: [mine()] });
  assertEquals(res.status, 500);
  assertEquals(log.removed, []);
});

Deno.test('DELETE /listings/:id：未登入 401；超限 429；非 UUID 404（無 not_found 標記）', async () => {
  assertEquals(
    (await del(
      harness({ requireAuth: () => Promise.resolve(null) }).app,
      `/listings/${LISTING_ID}`,
    ))
      .status,
    401,
  );
  assertEquals(
    (await del(harness({ rateLimit: () => Promise.resolve(false) }).app, `/listings/${LISTING_ID}`))
      .status,
    429,
  );
  const { app, log } = harness();
  const res = await del(app, '/listings/not-a-uuid');
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error.code !== 'not_found', true);
  assertEquals(log.deletedRows, []);
});

Deno.test('DELETE /listings/:id：列不存在或非本人 → 404 帶 not_found 標記；不清 Storage', async () => {
  const { app, log } = harness({ deleteListingRow: () => Promise.resolve(null) });
  const res = await del(app, `/listings/${LISTING_ID}`);
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error.code, 'not_found');
  assertEquals(log.removed, []);
});

Deno.test('DELETE /listings/:id：成功 → 刪列後清 Storage，200 success', async () => {
  const { app, log } = harness();
  const res = await del(app, `/listings/${LISTING_ID}`);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).success, true);
  assertEquals(log.deletedRows, [`${LISTING_ID}:${ME}`]);
  assertEquals(log.removed, [[mine('1_a'), mine('2_b')]]);
  assertEquals(log.rate, [`listing-del:${ME}`]);
});

Deno.test('DELETE /listings/:id：photos 含他人前綴／外部 URL → 忽略並 warn，只清自己的檔', async () => {
  const { app, log } = harness({
    deleteListingRow: () =>
      Promise.resolve({
        photos: [
          urlOf(mine('1_a')),
          urlOf(`${OTHER}/1700000000000_abc123.jpg`),
          'https://evil/x.jpg',
        ],
      }),
  });
  const res = await del(app, `/listings/${LISTING_ID}`);
  assertEquals(res.status, 200);
  assertEquals(log.removed, [[mine('1_a')]]);
  assert(log.warns.length >= 2);
});

Deno.test('DELETE /listings/:id：Storage 清理失敗不使刪除回報失敗（列已刪）', async () => {
  const { app, log } = harness({
    cleanup: {
      publicUrlOf: urlOf,
      findReferencedUrls: () => Promise.resolve([]),
      removeObjects: () => Promise.reject(new Error('storage down')),
    },
  });
  const res = await del(app, `/listings/${LISTING_ID}`);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).success, true);
  assert(log.warns.length >= 1);
});

Deno.test('DELETE /listings/:id：刪列 DB 錯誤 → 500，不清 Storage', async () => {
  const { app, log } = harness({ deleteListingRow: () => Promise.reject(new Error('db')) });
  assertEquals((await del(app, `/listings/${LISTING_ID}`)).status, 500);
  assertEquals(log.removed, []);
});

Deno.test('DELETE /listings/:id：base 由 publicUrlOf("x") 推導，不依賴空 path 的函式庫行為', async () => {
  const removed: string[][] = [];
  const { app } = harness({
    cleanup: {
      // 模擬 storage-js 對空 path 的處理不可靠：只有非空 path 才給正確 URL
      publicUrlOf: (path) => (path === '' ? 'https://broken.invalid/' : urlOf(path)),
      findReferencedUrls: () => Promise.resolve([]),
      removeObjects: (paths) => {
        removed.push(paths);
        return Promise.resolve(paths);
      },
    },
  });
  const res = await del(app, `/listings/${LISTING_ID}`);
  assertEquals(res.status, 200);
  assertEquals(removed, [[mine('1_a'), mine('2_b')]]);
});

Deno.test('index.ts 註冊順序：/listings/photos 先於 /listings/:id', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const photos = src.indexOf("app.delete('/listings/photos'");
  const byId = src.indexOf("app.delete('/listings/:id'");
  assert(photos >= 0 && byId >= 0, '兩條路由都要註冊');
  assert(photos < byId, '/listings/photos 必須先註冊，否則 "photos" 會被當成 :id');
});
