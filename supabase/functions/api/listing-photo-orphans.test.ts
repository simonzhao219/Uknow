// ============================================================
// 刊登照片孤兒判準（migration 20261110000001）：list_orphan_listing_photos、
// filter_unreferenced_listing_photos、_listing_photo_is_orphan、
// _listing_photo_name_from_url，以及撤 listings_delete_own。
//
// 判準是不可逆刪除的唯一依據（Storage 沒有備份），這支測試釘住「只回該刪的」：
//   * 孤兒＝bucket 內、超過寬限期、name 合格式、且**檔案前綴本人**的刊登沒有引用它
//   * 引用以 URL 裡 `/listings-photos/<uuid>/<檔名>` 取出的 object name 判斷，忽略
//     host、query 與路徑前段——public base 漂移（網域、/render/image/、?v=）不得讓
//     活照片變孤兒；取不出 name 的 URL 一律當作引用該刊登者全部的檔（偏保留）
//   * 他人引用不擋清理；第二支 RPC 不信任輸入，重新驗證 bucket／正則／寬限期／引用
//
// storage.objects 以 postgres 直連種列（不經 Storage API，不需要實體檔）；
// created_at 刻意設在 2000 年，排序與截斷才不受其他測試留下的物件影響。
// referenced／matched 統計是全庫數字，以「插入刊登前後的差值」斷言本測試的貢獻。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
} from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const GRACE = '168 hours';
const OLD = '2000-01-01T00:00:00Z';
const BASE = 'http://127.0.0.1:54321/storage/v1/object/public/listings-photos/';

type Report = {
  candidates: string[];
  orphan_total: number;
  total_objects: number;
  referenced_urls: number;
  matched_urls: number;
  referenced_owners: number;
  matched_owners: number;
};

async function seedObjects(
  sql: ReturnType<typeof postgres>,
  rows: { name: string; createdAt: string; bucket?: string }[],
): Promise<void> {
  for (const r of rows) {
    await sql`
      insert into storage.objects (bucket_id, name, created_at)
      values (${r.bucket ?? 'listings-photos'}, ${r.name}, ${r.createdAt})
    `;
  }
}

async function removeObjects(sql: ReturnType<typeof postgres>, names: string[]): Promise<void> {
  await sql.begin(async (tx) => {
    // 本機 storage 有 protect_delete trigger 擋直接 DELETE；測試種的列沒有實體檔，可直接刪。
    await tx`select set_config('storage.allow_delete_query', 'true', true)`;
    await tx`delete from storage.objects where name = any(${names})`;
  });
}

function listingRow(userId: string, photos: string[]) {
  return {
    user_id: userId,
    name: '孤兒判準測試刊登',
    category: '美髮',
    city: '台北市',
    districts: ['全區'],
    gender: '女',
    photos,
    contacts: { instagram: 'ig' },
    description: 'x',
  };
}

async function listOrphans(limit = 1000): Promise<Report> {
  const { data, error } = await adminClient().rpc('list_orphan_listing_photos', {
    p_grace: GRACE,
    p_limit: limit,
  });
  assertEquals(error, null);
  return data as Report;
}

Deno.test('list_orphan_listing_photos：引用與 base 脫鉤，各情境只回該刪的檔', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const owner = await createTestUser(client, { name: '孤兒擁有者' });
  const other = await createTestUser(client, { name: '他人刊登者' });
  const odd = await createTestUser(client, { name: '怪 URL 刊登者' });
  const goneUser = crypto.randomUUID(); // 帳號已刪：沒有任何刊登
  const n = {
    orphan: `${owner.id}/946684800001_orph01.jpg`,
    fresh: `${owner.id}/946684800002_fresh2.png`,
    ownRef: `${owner.id}/946684800003_ownref.webp`,
    foreignRef: `${owner.id}/946684800004_frgn04.jpg`,
    badName: `${owner.id}/sub/946684800005_bad05.jpg`,
    badExt: `${owner.id}/946684800006_bad06.gif`,
    gone: `${goneUser}/946684800007_gone07.jpg`,
    variant: `${owner.id}/946684800008_vari08.jpg`,
    render: `${owner.id}/946684800009_rend09.jpg`,
    otherHost: `${owner.id}/946684800010_host10.jpg`,
    oddKept: `${odd.id}/946684800011_oddk11.jpg`,
  };
  try {
    await seedObjects(
      sql,
      [
        ...Object.values(n).map((name) => ({ name, createdAt: OLD })),
      ].map((r) => (r.name === n.fresh ? { ...r, createdAt: new Date().toISOString() } : r)),
    );
    const before = await listOrphans();
    const inserts = [
      listingRow(owner.id, [
        BASE + n.ownRef,
        `${BASE}${n.variant}?width=100`,
        `http://127.0.0.1:54321/storage/v1/render/image/public/listings-photos/${n.render}?w=1`,
        `https://old-domain.example/storage/v1/object/public/listings-photos/${n.otherHost}`,
      ]),
      listingRow(other.id, [BASE + n.foreignRef]),
      // 取不出 object name 的 URL：該刊登者的檔一律保留
      listingRow(odd.id, ['https://evil.example/not-a-photo']),
    ];
    for (const row of inserts) {
      const { error } = await client.from('listings').insert(row);
      assertEquals(error, null);
    }

    const report = await listOrphans();
    const mine = new Set(Object.values(n));
    const got = report.candidates.filter((c) => mine.has(c)).sort();
    assertEquals(got, [n.orphan, n.foreignRef, n.gone].sort());
    // 本測試貢獻：3 位刊登者、6 條 URL；owner 與 other 對得到物件，odd 對不到。
    assertEquals(report.referenced_owners - before.referenced_owners, 3);
    assertEquals(report.matched_owners - before.matched_owners, 2);
    assertEquals(report.referenced_urls - before.referenced_urls, 6);
    assertEquals(report.matched_urls - before.matched_urls, 5);
    assert(report.total_objects >= Object.keys(n).length);
  } finally {
    await removeObjects(sql, Object.values(n));
    await deleteTestUsers(client, [owner.id, other.id, odd.id]);
    await sql.end();
  }
});

Deno.test('_listing_photo_name_from_url：忽略 host、query、render 路徑取 name，取不出回 null', async () => {
  const sql = postgres(DB_URL);
  const name = '11111111-2222-3333-4444-555555555555/1700000000000_abc123.jpg';
  try {
    const cases: [string, string | null][] = [
      [BASE + name, name],
      [`${BASE}${name}?v=2`, name],
      [`https://cdn.example/storage/v1/render/image/public/listings-photos/${name}`, name],
      ['https://evil.example/x.jpg', null],
      [`${BASE}${name.toUpperCase()}`, null],
      ['', null],
    ];
    for (const [url, want] of cases) {
      const [row] = await sql`select public._listing_photo_name_from_url(${url}) as n`;
      assertEquals(row.n, want, url);
    }
  } finally {
    await sql.end();
  }
});

Deno.test('list_orphan_listing_photos：依 created_at、name 排序截斷，orphan_total 為截斷前總數', async () => {
  const sql = postgres(DB_URL);
  const owner = crypto.randomUUID();
  const names = [
    `${owner}/1_aaaaaa.jpg`,
    `${owner}/2_bbbbbb.jpg`,
    `${owner}/3_cccccc.jpg`,
  ];
  try {
    await seedObjects(sql, [
      { name: names[2], createdAt: '1999-01-03T00:00:00Z' },
      { name: names[1], createdAt: '1999-01-01T00:00:00Z' },
      { name: names[0], createdAt: '1999-01-01T00:00:00Z' },
    ]);
    const first = await listOrphans(2);
    assertEquals(first.candidates, [names[0], names[1]]);
    assert(first.orphan_total >= 3, `orphan_total=${first.orphan_total} 應不受 limit 截斷`);
    const again = await listOrphans(2);
    assertEquals(again.candidates, first.candidates);
  } finally {
    await removeObjects(sql, names);
    await sql.end();
  }
});

Deno.test('filter_unreferenced_listing_photos：重驗寬限期、正則、存在與引用，只留孤兒', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const owner = await createTestUser(client, { name: '複查擁有者' });
  const n = {
    orphan: `${owner.id}/946684800011_orph11.jpg`,
    fresh: `${owner.id}/946684800012_fres12.jpg`,
    ownRef: `${owner.id}/946684800013_ownr13.jpg`,
    badName: `${owner.id}/946684800014_BAD14.jpg`,
    otherBucket: `${owner.id}/946684800015_othr15.jpg`,
  };
  const missing = `${owner.id}/946684800016_miss16.jpg`;
  try {
    await seedObjects(sql, [
      { name: n.orphan, createdAt: OLD },
      { name: n.fresh, createdAt: new Date().toISOString() },
      { name: n.ownRef, createdAt: OLD },
      { name: n.badName, createdAt: OLD },
      { name: n.otherBucket, createdAt: OLD, bucket: 'id-cards' },
    ]);
    // 引用存成另一個網域：base 不符也算引用
    const { error } = await client.from('listings').insert(
      listingRow(owner.id, [
        `https://old.example/storage/v1/object/public/listings-photos/${n.ownRef}`,
      ]),
    );
    assertEquals(error, null);

    const { data, error: rpcErr } = await client.rpc('filter_unreferenced_listing_photos', {
      p_names: [...Object.values(n), missing],
    });
    assertEquals(rpcErr, null);
    assertEquals(data, [n.orphan]);
  } finally {
    await removeObjects(sql, Object.values(n));
    await deleteTestUsers(client, [owner.id]);
    await sql.end();
  }
});

Deno.test('孤兒判準函式：anon、authenticated 不能執行，只給 service_role', async () => {
  const sql = postgres(DB_URL);
  try {
    for (
      const fn of [
        'public._listing_photo_name_from_url(text)',
        'public._listing_photo_is_orphan(text)',
        'public.list_orphan_listing_photos(interval, int)',
        'public.filter_unreferenced_listing_photos(text[])',
      ]
    ) {
      const [row] = await sql<{ anon: boolean; authed: boolean; service: boolean }[]>`
        select
          has_function_privilege('anon', ${fn}, 'EXECUTE') as anon,
          has_function_privilege('authenticated', ${fn}, 'EXECUTE') as authed,
          has_function_privilege('service_role', ${fn}, 'EXECUTE') as service
      `;
      assertEquals(row, { anon: false, authed: false, service: true }, fn);
    }
  } finally {
    await sql.end();
  }
});

Deno.test('listings：撤 listings_delete_own 後本人直刪影響零列、列仍在', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const owner = await createTestUser(client, { name: '直刪者' });
  try {
    const { data: inserted, error } = await client.from('listings')
      .insert(listingRow(owner.id, [])).select('id').single();
    assertEquals(error, null);
    const id = inserted!.id as string;
    const deleted = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${
        JSON.stringify({ sub: owner.id, role: 'authenticated' })
      }, true)`;
      await tx`set local role authenticated`;
      return await tx`delete from public.listings where id = ${id} returning id`;
    });
    assertEquals(deleted.length, 0);
    const { data: still } = await client.from('listings').select('id').eq('id', id);
    assertEquals(still?.length, 1);
  } finally {
    await deleteTestUsers(client, [owner.id]);
    await sql.end();
  }
});

Deno.test('purge-orphan-listing-photos：真路由 dry-run 回孤兒、不回本人引用的檔，錯密鑰 401', async () => {
  ensureEdgeFunctionEnv();
  // 同一個 deno test 行程的其他檔（system-alerts-recent）在載入時設了自己的值，用完要還原。
  const prevSecret = Deno.env.get('RECONCILE_SECRET');
  Deno.env.set('RECONCILE_SECRET', 'test-reconcile-secret');
  const { app, listingPhotoPublicUrl } = await import('./index.ts');
  const client = adminClient();
  const sql = postgres(DB_URL);
  const owner = await createTestUser(client, { name: '真路由刊登者' });
  const orphan = `${crypto.randomUUID()}/946684800021_orph21.jpg`;
  const kept = `${owner.id}/946684800022_kept22.jpg`;
  try {
    await seedObjects(sql, [{ name: orphan, createdAt: OLD }, { name: kept, createdAt: OLD }]);
    // 以 upload-photo 產生 URL 的同一個函式（真 base）引用 kept
    const { error } = await client.from('listings').insert(
      listingRow(owner.id, [listingPhotoPublicUrl(kept)]),
    );
    assertEquals(error, null);
    const call = (secret: string) =>
      app.request('/api/internal/purge-orphan-listing-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({ dry_run: true, include_names: true, force_ratio: true }),
      });
    const denied = await call('wrong');
    assertEquals(denied.status, 401);
    await denied.body?.cancel();

    const res = await call('test-reconcile-secret');
    assertEquals(res.status, 200, await res.clone().text());
    const { data } = await res.json();
    assertEquals(data.dryRun, true);
    assertEquals(data.removed, 0);
    const names = data.names as string[];
    assertEquals(names.filter((x) => x === orphan || x === kept), [orphan]);
    assertEquals(
      listingPhotoPublicUrl(kept),
      `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/listings-photos/${kept}`,
    );
  } finally {
    await removeObjects(sql, [orphan, kept]);
    await deleteTestUsers(client, [owner.id]);
    await sql.end();
    if (prevSecret === undefined) Deno.env.delete('RECONCILE_SECRET');
    else Deno.env.set('RECONCILE_SECRET', prevSecret);
  }
});
