// ============================================================
// 刊登照片孤兒判準（migration 20261110000001）：list_orphan_listing_photos、
// filter_unreferenced_listing_photos、_listing_photo_is_orphan，以及撤
// listings_delete_own。
//
// 判準是不可逆刪除的唯一依據（Storage 沒有備份），這支測試釘住「只回該刪的」：
//   * 孤兒＝bucket 內、超過寬限期、name 合格式、且沒有被**檔案前綴本人**的
//     刊登以 `p_public_base || name` 精確字串引用
//   * 他人引用不擋清理；帶 query 的變體 URL 視為未引用
//   * 第二支 RPC 不信任輸入，重新驗證 bucket／正則／寬限期／引用
//
// storage.objects 以 postgres 直連種列（不經 Storage API，不需要實體檔）；
// created_at 刻意設在 2000 年，排序與截斷才不受其他測試留下的物件影響。
// 每支測試用隨機 public base，referenced／matched 統計因此只算到本測試的刊登。
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

type Report = {
  candidates: string[];
  orphan_total: number;
  total_objects: number;
  referenced_urls: number;
  matched_urls: number;
};

function randomBase(): string {
  return `https://t-${crypto.randomUUID()}.example/storage/v1/object/public/listings-photos/`;
}

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

async function listOrphans(base: string, limit = 1000): Promise<Report> {
  const { data, error } = await adminClient().rpc('list_orphan_listing_photos', {
    p_public_base: base,
    p_grace: GRACE,
    p_limit: limit,
  });
  assertEquals(error, null);
  return data as Report;
}

Deno.test('list_orphan_listing_photos：六種情境與變體 URL 只回該刪的檔', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const owner = await createTestUser(client, { name: '孤兒擁有者' });
  const other = await createTestUser(client, { name: '他人刊登者' });
  const goneUser = crypto.randomUUID(); // 帳號已刪：沒有任何刊登
  const base = randomBase();
  const n = {
    orphan: `${owner.id}/946684800001_orph01.jpg`,
    fresh: `${owner.id}/946684800002_fresh2.png`,
    ownRef: `${owner.id}/946684800003_ownref.webp`,
    foreignRef: `${owner.id}/946684800004_frgn04.jpg`,
    badName: `${owner.id}/sub/946684800005_bad05.jpg`,
    badExt: `${owner.id}/946684800006_bad06.gif`,
    gone: `${goneUser}/946684800007_gone07.jpg`,
    variant: `${owner.id}/946684800008_vari08.jpg`,
  };
  try {
    await seedObjects(sql, [
      { name: n.orphan, createdAt: OLD },
      { name: n.fresh, createdAt: new Date().toISOString() },
      { name: n.ownRef, createdAt: OLD },
      { name: n.foreignRef, createdAt: OLD },
      { name: n.badName, createdAt: OLD },
      { name: n.badExt, createdAt: OLD },
      { name: n.gone, createdAt: OLD },
      { name: n.variant, createdAt: OLD },
    ]);
    const { error: e1 } = await client.from('listings').insert(
      listingRow(owner.id, [base + n.ownRef, `${base}${n.variant}?width=100`]),
    );
    assertEquals(e1, null);
    const { error: e2 } = await client.from('listings').insert(
      listingRow(other.id, [base + n.foreignRef]),
    );
    assertEquals(e2, null);

    const report = await listOrphans(base);
    const mine = new Set(Object.values(n));
    const got = report.candidates.filter((c) => mine.has(c)).sort();
    assertEquals(got, [n.orphan, n.foreignRef, n.gone, n.variant].sort());
    // 本測試的 base 只出現在上面兩筆刊登：3 個 URL，其中 ownRef 與 foreignRef 對得到物件。
    assertEquals(report.referenced_urls, 3);
    assertEquals(report.matched_urls, 2);
    assert(report.total_objects >= Object.keys(n).length);
    assert(report.orphan_total >= 4);
  } finally {
    await removeObjects(sql, Object.values(n));
    await deleteTestUsers(client, [owner.id, other.id]);
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
    const first = await listOrphans(randomBase(), 2);
    assertEquals(first.candidates, [names[0], names[1]]);
    assert(first.orphan_total >= 3, `orphan_total=${first.orphan_total} 應不受 limit 截斷`);
    const again = await listOrphans(randomBase(), 2);
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
  const base = randomBase();
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
    const { error } = await client.from('listings').insert(
      listingRow(owner.id, [base + n.ownRef]),
    );
    assertEquals(error, null);

    const { data, error: rpcErr } = await client.rpc('filter_unreferenced_listing_photos', {
      p_public_base: base,
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
        'public._listing_photo_is_orphan(text, text)',
        'public.list_orphan_listing_photos(text, interval, int)',
        'public.filter_unreferenced_listing_photos(text, text[])',
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

Deno.test('purge-orphan-listing-photos：真路由＋真 RPC 的 dry-run 回候選，錯密鑰 401', async () => {
  ensureEdgeFunctionEnv();
  // 同一個 deno test 行程的其他檔（system-alerts-recent）在載入時設了自己的值，用完要還原。
  const prevSecret = Deno.env.get('RECONCILE_SECRET');
  Deno.env.set('RECONCILE_SECRET', 'test-reconcile-secret');
  const { app, listingPhotoPublicUrl } = await import('./index.ts');
  const sql = postgres(DB_URL);
  const orphan = `${crypto.randomUUID()}/946684800021_orph21.jpg`;
  try {
    await seedObjects(sql, [{ name: orphan, createdAt: OLD }]);
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
    assertEquals(res.status, 200);
    const { data } = await res.json();
    assertEquals(data.dryRun, true);
    assertEquals(data.removed, 0);
    assert(data.names.includes(orphan), '種下的孤兒應在候選內');
    assert(data.totalObjects >= 1);
    // publicBase 與 upload-photo 的 URL 同源：本 bucket 的 URL 去掉 path 就是 base。
    assert(listingPhotoPublicUrl(orphan).endsWith(orphan));
  } finally {
    await removeObjects(sql, [orphan]);
    await sql.end();
    if (prevSecret === undefined) Deno.env.delete('RECONCILE_SECRET');
    else Deno.env.set('RECONCILE_SECRET', prevSecret);
  }
});
