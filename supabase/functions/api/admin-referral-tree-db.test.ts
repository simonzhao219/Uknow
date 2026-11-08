// ============================================================
// 後台推薦樹查帳 RPC（第 6 波 S3a 階段 2～4）。
//
// 階段 2：admin_referral_tree_nodes（頂層／子層／無法接上推薦樹的會員群組、
// 分頁與 total、穩定排序、ensureId→pinned、第 N 層）與
// admin_referral_tree_search（姓名跳脫、推薦碼精確、收人口徑、ancestor_ids
// 與無法定位原因）。
//
// 收人口徑（W6-19）：曾有過訂閱，或至少有一條 edge 指向他（有推薦對象）。
// 樹的單一來源是 referral_edges（規劃 §2.2）。
// 每支 RPC 回單一 jsonb：不受 PostgREST max_rows=1000 截斷（第 4 波 ref P1-3）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Node = Record<string, unknown> & { id: string };
type NodesResponse = {
  total: number;
  nodes: Node[];
  pinned: Node | null;
  unplaceable_count?: number;
};
type SearchResponse = {
  total: number;
  matches: (Node & { ancestor_ids: string[] | null; unplaceable_reason: string | null })[];
};

const SENSITIVE_KEYS = ['national_id', 'phone', 'bank_code', 'bank_account', 'birth_date', 'email'];

// 直接以 SQL 建立 auth 使用者（handle_new_user trigger 會建 profiles）；
// 比 auth.admin.createUser 快兩個數量級，1,005 位直接推薦才跑得動。
async function insertUsers(sql: postgres.Sql, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const [row] = await sql`
      insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                              raw_app_meta_data, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'tree-' || gen_random_uuid() || '@example.invalid', '{}', '{}',
              now(), now())
      returning id`;
    ids.push(row.id as string);
    await sql`update public.profiles set name = ${name} where id = ${row.id}`;
  }
  return ids;
}

async function insertBulkUsers(sql: postgres.Sql, n: number, prefix: string): Promise<string[]> {
  const rows = await sql`
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                            raw_app_meta_data, created_at, updated_at)
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
           'authenticated', 'tree-bulk-' || gen_random_uuid() || '@example.invalid', '{}', '{}',
           now(), now()
    from generate_series(1, ${n})
    returning id`;
  const ids = rows.map((r) => r.id as string);
  await sql`update public.profiles set name = ${prefix} || substr(id::text, 1, 8)
            where id = any(${ids}::uuid[])`;
  return ids;
}

async function deleteUsers(sql: postgres.Sql, ids: string[]) {
  if (ids.length === 0) return;
  await sql`delete from public.referral_edges
            where referee_user_id = any(${ids}::uuid[]) or referrer_user_id = any(${ids}::uuid[])`;
  await sql`delete from auth.users where id = any(${ids}::uuid[])`;
}

async function subscribe(sql: postgres.Sql, userId: string) {
  await sql`
    insert into public.subscriptions (user_id, start_date, end_date, grace_period_end)
    values (${userId}, now(), now() + interval '1 year', now() + interval '1 year')`;
}

async function link(sql: postgres.Sql, child: string, parent: string) {
  await sql`
    insert into public.referral_edges (referee_user_id, referrer_user_id)
    values (${child}, ${parent})
    on conflict (referee_user_id) do update set referrer_user_id = excluded.referrer_user_id`;
  await sql`update public.profiles set referred_by_user_id = ${parent} where id = ${child}`;
}

async function nodes(
  sql: postgres.Sql,
  opts: { parent?: string; group?: string; ensure?: string; limit?: number; offset?: number },
): Promise<NodesResponse> {
  const [row] = await sql`
    select public.admin_referral_tree_nodes(
      p_parent    => ${opts.parent ?? null}::uuid,
      p_group     => ${opts.group ?? null}::text,
      p_ensure_id => ${opts.ensure ?? null}::uuid,
      p_limit     => ${opts.limit ?? 50}::int,
      p_offset    => ${opts.offset ?? 0}::int
    ) as r`;
  return row.r as NodesResponse;
}

async function search(
  sql: postgres.Sql,
  opts: { name?: string; code?: string; limit?: number; offset?: number },
): Promise<SearchResponse> {
  const [row] = await sql`
    select public.admin_referral_tree_search(
      p_name   => ${opts.name ?? null}::text,
      p_code   => ${opts.code ?? null}::text,
      p_limit  => ${opts.limit ?? 50}::int,
      p_offset => ${opts.offset ?? 0}::int
    ) as r`;
  return row.r as SearchResponse;
}

// 在「頂層／某層」裡找得到某人嗎：用 ensureId，不受共用資料庫裡其他資料影響。
function located(res: NodesResponse, id: string): Node | null {
  return res.nodes.find((n) => n.id === id) ?? (res.pinned?.id === id ? res.pinned : null);
}

async function withSql(fn: (sql: postgres.Sql, track: (ids: string[]) => void) => Promise<void>) {
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    await fn(sql, (more) => ids.push(...more));
  } finally {
    await deleteUsers(sql, ids);
    await sql.end();
  }
}

Deno.test('admin_referral_tree_nodes：1,005 位直接推薦 → total 精確且分頁不重複不漏', async () => {
  await withSql(async (sql, track) => {
    const [parent] = await insertUsers(sql, ['樹 大推薦人']);
    track([parent]);
    await subscribe(sql, parent);
    const kids = await insertBulkUsers(sql, 1005, '樹 子');
    track(kids);
    await sql`
      insert into public.referral_edges (referee_user_id, referrer_user_id)
      select k, ${parent}::uuid from unnest(${kids}::uuid[]) as k`;

    const seen = new Set<string>();
    for (let offset = 0; offset < 1005; offset += 200) {
      const page = await nodes(sql, { parent, limit: 200, offset });
      assertEquals(page.total, 1005);
      for (const n of page.nodes) seen.add(n.id);
    }
    assertEquals(seen.size, 1005, '逐頁收齊 1,005 位且不重複');

    const page21 = await nodes(sql, { parent, limit: 50, offset: 1000 });
    assertEquals(page21.nodes.length, 5, '第 21 頁（offset 1000）有剩下的 5 位');

    const capped = await nodes(sql, { parent, limit: 500 });
    assertEquals(capped.nodes.length, 200, 'limit 上限 200');
  });
});

Deno.test('admin_referral_tree_nodes：頂層收曾訂閱或有推薦對象者 → 空殼不收', async () => {
  await withSql(async (sql, track) => {
    const [paid, referrerOnly, child, shell] = await insertUsers(sql, [
      '樹 頂層 曾訂閱',
      '樹 頂層 有推薦對象',
      '樹 頂層 子',
      '樹 頂層 空殼',
    ]);
    track([paid, referrerOnly, child, shell]);
    await subscribe(sql, paid);
    await link(sql, child, referrerOnly);

    assert(located(await nodes(sql, { ensure: paid }), paid), '曾訂閱者在頂層');
    assert(located(await nodes(sql, { ensure: referrerOnly }), referrerOnly), '有推薦對象者在頂層');
    assertEquals(located(await nodes(sql, { ensure: child }), child), null, '有推薦人者不在頂層');
    assertEquals(located(await nodes(sql, { ensure: shell }), shell), null, '空殼不在頂層');
  });
});

Deno.test('admin_referral_tree_nodes：ensureId 不在本頁 → 另回 pinned、nodes 與 total 不變', async () => {
  await withSql(async (sql, track) => {
    const [p, c1, c2, c3] = await insertUsers(sql, [
      '樹 釘選 父',
      '樹 釘選 子1',
      '樹 釘選 子2',
      '樹 釘選 子3',
    ]);
    track([p, c1, c2, c3]);
    await subscribe(sql, p);
    for (const c of [c1, c2, c3]) await link(sql, c, p);

    const first = await nodes(sql, { parent: p, limit: 1 });
    const target = [c1, c2, c3].find((c) => c !== first.nodes[0].id)!;
    const res = await nodes(sql, { parent: p, limit: 1, ensure: target });
    assertEquals(res.total, 3);
    assertEquals(res.nodes.length, 1);
    assertEquals(res.pinned?.id, target);

    const onPage = await nodes(sql, { parent: p, limit: 1, ensure: first.nodes[0].id });
    assertEquals(onPage.pinned, null, '目標已在本頁 → 不另回 pinned');
  });
});

Deno.test('admin_referral_tree_nodes：第 N 層從頂層算 → 頂層 1、孫層 3', async () => {
  await withSql(async (sql, track) => {
    const [r, a, b] = await insertUsers(sql, ['樹 層 頂', '樹 層 一', '樹 層 二']);
    track([r, a, b]);
    await subscribe(sql, r);
    await link(sql, a, r);
    await link(sql, b, a);

    assertEquals(located(await nodes(sql, { ensure: r }), r)?.layer, 1);
    assertEquals(located(await nodes(sql, { parent: a }), b)?.layer, 3);
    assertEquals(located(await nodes(sql, { parent: r }), a)?.direct_count, 1);
  });
});

Deno.test('admin_referral_tree_nodes：成環與往上接進環 → 收進無法接上推薦樹的群組', async () => {
  await withSql(async (sql, track) => {
    const [p, q, tail, outsider] = await insertUsers(sql, [
      '樹 環 P',
      '樹 環 Q',
      '樹 環 尾',
      '樹 環 外人',
    ]);
    track([p, q, tail, outsider]);
    for (const u of [p, q, tail, outsider]) await subscribe(sql, u);
    await link(sql, p, q);
    await link(sql, q, p);
    await link(sql, tail, p);

    const top = await nodes(sql, { ensure: outsider });
    const group = await nodes(sql, { group: 'unplaceable', limit: 200 });
    assertEquals(top.unplaceable_count, group.total, '頂層的 unplaceable_count 與群組 total 一致');
    for (const id of [p, q, tail]) {
      assert(located(await nodes(sql, { group: 'unplaceable', ensure: id }), id), `群組收 ${id}`);
      assertEquals(located(await nodes(sql, { ensure: id }), id), null, '環上的人不在頂層');
    }
    assertEquals(
      located(await nodes(sql, { group: 'unplaceable', ensure: outsider }), outsider),
      null,
      '正常的頂層會員不收進群組',
    );
  });
});

Deno.test('admin_referral_tree_search：往上鏈 → ancestor_ids 由頂層到父且帶層級', async () => {
  await withSql(async (sql, track) => {
    const tag = crypto.randomUUID().slice(0, 6);
    const [r, a, b] = await insertUsers(sql, [`搜 頂 ${tag}`, `搜 一 ${tag}`, `搜 目標 ${tag}`]);
    track([r, a, b]);
    await subscribe(sql, r);
    await link(sql, a, r);
    await link(sql, b, a);

    const res = await search(sql, { name: `搜 目標 ${tag}` });
    assertEquals(res.total, 1);
    assertEquals(res.matches[0].id, b);
    assertEquals(res.matches[0].ancestor_ids, [r, a]);
    assertEquals(res.matches[0].unplaceable_reason, null);
    assertEquals(res.matches[0].layer, 3);
  });
});

Deno.test('admin_referral_tree_search：成環與超過 50 層 → ancestor_ids 為 null 並附原因', async () => {
  await withSql(async (sql, track) => {
    const tag = crypto.randomUUID().slice(0, 6);
    const [p, q] = await insertUsers(sql, [`搜環 P ${tag}`, `搜環 Q ${tag}`]);
    track([p, q]);
    for (const u of [p, q]) await subscribe(sql, u);
    await link(sql, p, q);
    await link(sql, q, p);

    const cyc = await search(sql, { name: `搜環 P ${tag}` });
    assertEquals([cyc.matches[0].ancestor_ids, cyc.matches[0].unplaceable_reason], [null, 'cycle']);

    // 52 位一路往下接：最深的人往上超過 50 層。
    const chain = await insertBulkUsers(sql, 52, `搜深 ${tag} `);
    track(chain);
    await subscribe(sql, chain[0]);
    for (let i = 1; i < chain.length; i++) await link(sql, chain[i], chain[i - 1]);
    await sql`update public.profiles set name = ${`搜深 底 ${tag}`} where id = ${chain[51]}`;

    const deep = await search(sql, { name: `搜深 底 ${tag}` });
    assertEquals([deep.matches[0].ancestor_ids, deep.matches[0].unplaceable_reason], [
      null,
      'truncated',
    ]);
    assertEquals(
      located(await nodes(sql, { group: 'unplaceable', ensure: chain[51] }), chain[51]),
      null,
      '超過 50 層接得上樹，不收進群組',
    );
  });
});

Deno.test('admin_referral_tree_search：姓名的 % 被跳脫、推薦碼精確比對含失效碼', async () => {
  await withSql(async (sql, track) => {
    const tag = crypto.randomUUID().slice(0, 6);
    const [pct, plain] = await insertUsers(sql, [`搜跳脫%${tag}`, `搜跳脫X${tag}`]);
    track([pct, plain]);
    for (const u of [pct, plain]) await subscribe(sql, u);

    const res = await search(sql, { name: `跳脫%${tag}` });
    assertEquals(res.matches.map((m) => m.id), [pct], '% 只當字面字元');

    const code = `9${Date.now().toString().slice(-9)}`;
    await sql`insert into public.referral_codes (user_id, code, status)
              values (${plain}, ${code}, 'inactive')`;
    const byCode = await search(sql, { code });
    assertEquals(byCode.matches.map((m) => m.id), [plain]);
  });
});

Deno.test('admin_referral_tree_search：沒訂閱也沒推薦對象 → 搜不到', async () => {
  await withSql(async (sql, track) => {
    const tag = crypto.randomUUID().slice(0, 6);
    const [shell] = await insertUsers(sql, [`搜空殼 ${tag}`]);
    track([shell]);
    const res = await search(sql, { name: `搜空殼 ${tag}` });
    assertEquals(res.total, 0);
  });
});

Deno.test('admin_referral_tree：節點不含身分證、電話、帳號、生日、email', async () => {
  await withSql(async (sql, track) => {
    const tag = crypto.randomUUID().slice(0, 6);
    const [u] = await insertUsers(sql, [`樹個資 ${tag}`]);
    track([u]);
    await subscribe(sql, u);
    const node = located(await nodes(sql, { ensure: u }), u)!;
    const match = (await search(sql, { name: `樹個資 ${tag}` })).matches[0];
    for (const key of SENSITIVE_KEYS) {
      assertEquals(key in node, false, `nodes 不得含 ${key}`);
      assertEquals(key in match, false, `search 不得含 ${key}`);
    }
  });
});

Deno.test('admin_referral_tree：authenticated 與 anon 不得 EXECUTE 節點與搜尋 RPC', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    for (
      const fn of [
        'public.admin_referral_tree_nodes(uuid, text, uuid, int, int)',
        'public.admin_referral_tree_search(text, text, int, int)',
      ]
    ) {
      const [row] = await sql`
        select has_function_privilege('authenticated', ${fn}, 'execute') as auth,
               has_function_privilege('anon', ${fn}, 'execute') as anon`;
      assertEquals([row.auth, row.anon], [false, false], fn);
    }
  } finally {
    await sql.end();
  }
});
