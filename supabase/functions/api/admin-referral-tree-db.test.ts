// ============================================================
// 後台推薦樹查帳 RPC（第 6 波 S3a 階段 2～4）。
//
// 階段 3：admin_referral_member_audit（會員查帳詳情：欄位、往上鏈、換線紀錄、不一致、成環）。
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

// ------------------------------------------------------------
// 階段 3：admin_referral_member_audit（會員查帳詳情）
// ------------------------------------------------------------

type Audit = {
  node: Node;
  upline: { id: string; name: string; referral_code: string | null }[];
  upline_status: string;
  rewards: {
    by_generation: Record<string, number>;
    available: number;
    total_earned: number;
  };
  tasks: {
    month_key: string;
    monthly_count: number;
    threshold: number;
    credits_unclaimed: number;
    credits_claimed: number;
  };
  withdrawals: {
    pending_amount: number;
    awaiting_collection_amount: number;
    completed_amount: number;
  };
  referrer_history: {
    past_referrers: { id: string }[];
    fresh_events: { completed_at: string; new_referrer_id: string; effective: string }[];
  };
  referrer_mismatch: boolean;
  anomalies: string[];
} & Record<string, unknown>;

async function audit(sql: postgres.Sql, userId: string): Promise<Audit | null> {
  const [row] = await sql`select public.admin_referral_member_audit(${userId}::uuid) as r`;
  return row.r as Audit | null;
}

async function freshOrder(
  sql: postgres.Sql,
  userId: string,
  opts: { referrer: string | null; source: string; completedAt: string },
) {
  await sql`
    insert into public.payment_orders
      (user_id, amount, status, transaction_id, renewal_mode,
       fresh_referrer_user_id, fresh_referrer_source, completed_at)
    values (${userId}, 1200, 'completed', ${'TREE-' + crypto.randomUUID()}, 'fresh',
            ${opts.referrer}, ${opts.source}, ${opts.completedAt}::timestamptz)`;
}

Deno.test('admin_referral_member_audit：獎金、點數、提領與推薦計畫欄位 → 依帳本與提領單彙總', async () => {
  await withSql(async (sql, track) => {
    const [u, payer1, payer2] = await insertUsers(sql, [
      '查帳 本人',
      '查帳 付款人一',
      '查帳 付款人二',
    ]);
    track([u, payer1, payer2]);
    await subscribe(sql, u);
    await sql`update public.profiles set referral_program_joined = true,
              referral_program_joined_at = '2026-10-01T00:00:00Z' where id = ${u}`;
    await sql`
      insert into public.reward_transactions (user_id, type, amount, generation, referee_user_id, description)
      values (${u}, 'referral_reward', 100, 1, ${payer1}, 't'),
             (${u}, 'referral_reward', 100, 1, ${payer2}, 't'),
             (${u}, 'referral_reward', 100, 2, ${payer1}, 't')`;
    await sql`
      insert into public.withdrawals (user_id, amount, status, fee)
      values (${u}, 1000, 'pending', 15), (${u}, 2000, 'awaiting_collection', 15),
             (${u}, 3000, 'completed', 15), (${u}, 4000, 'rejected', 15)`;

    const a = (await audit(sql, u))!;
    assertEquals(a.rewards.by_generation, { '1': 200, '2': 100, '3': 0 });
    assertEquals(a.rewards.total_earned, 300);
    assertEquals(a.withdrawals, {
      pending_amount: 1000,
      awaiting_collection_amount: 2000,
      completed_amount: 3000,
    });
    assertEquals(a.node.referral_program_joined, true);
    assert(String(a.node.referral_program_joined_at).startsWith('2026-10-01'));
  });
});

Deno.test('admin_referral_member_audit：推薦王本月進度與 credit → 依 task_progress 與 credit 表', async () => {
  await withSql(async (sql, track) => {
    const [u, r1, r2] = await insertUsers(sql, ['查帳 任務', '查帳 任務 推1', '查帳 任務 推2']);
    track([u, r1, r2]);
    await subscribe(sql, u);
    const [{ k }] = await sql`select to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM') as k`;
    await sql`
      insert into public.task_progress (user_id, monthly_referrals, total_referrals)
      values (${u}, jsonb_build_object(${k}::text, jsonb_build_array(${r1}::text, ${r2}::text)), 2)
      on conflict (user_id) do update set monthly_referrals = excluded.monthly_referrals`;
    await sql`
      insert into public.referral_king_rewards (user_id, month_key, round_ordinal, status)
      values (${u}, '2026-01', 1, 'unclaimed'), (${u}, '2026-02', 1, 'unclaimed')`;

    const a = (await audit(sql, u))!;
    assertEquals(a.tasks.month_key, k);
    assertEquals(a.tasks.monthly_count, 2);
    assert(a.tasks.threshold > 0, '門檻取自 reward_config');
    assertEquals([a.tasks.credits_unclaimed, a.tasks.credits_claimed], [2, 0]);
  });
});

Deno.test('admin_referral_member_audit：往上鏈 → 由近到遠列出推薦人並標 root', async () => {
  await withSql(async (sql, track) => {
    const [r, a, b] = await insertUsers(sql, ['查帳鏈 頂', '查帳鏈 一', '查帳鏈 本人']);
    track([r, a, b]);
    await subscribe(sql, r);
    await link(sql, a, r);
    await link(sql, b, a);

    const res = (await audit(sql, b))!;
    assertEquals(res.upline.map((u) => u.id), [a, r]);
    assertEquals(res.upline[0].name, '查帳鏈 一');
    assertEquals(res.upline_status, 'root');
    assertEquals(res.anomalies, []);
  });
});

Deno.test('admin_referral_member_audit：成環與自己推薦自己 → anomalies 與節點都標出', async () => {
  await withSql(async (sql, track) => {
    const [p, q, self] = await insertUsers(sql, ['查帳環 P', '查帳環 Q', '查帳 自推']);
    track([p, q, self]);
    for (const u of [p, q, self]) await subscribe(sql, u);
    await link(sql, p, q);
    await link(sql, q, p);
    await sql`update public.profiles set referred_by_user_id = ${self} where id = ${self}`;

    const cyc = (await audit(sql, p))!;
    assertEquals(cyc.upline_status, 'cycle');
    assert(cyc.anomalies.includes('cycle'));
    const groupNode = located(await nodes(sql, { group: 'unplaceable', ensure: p }), p)!;
    assert((groupNode.anomaly_kinds as string[]).includes('cycle'));

    const s = (await audit(sql, self))!;
    assert(s.anomalies.includes('self_referral'));
    const topNode = located(await nodes(sql, { ensure: self }), self)!;
    assert((topNode.anomaly_kinds as string[]).includes('self_referral'));
  });
});

Deno.test('admin_referral_member_audit：往上超過 50 層 → 只列 50 位並標 truncated', async () => {
  await withSql(async (sql, track) => {
    const chain = await insertBulkUsers(sql, 52, '查帳深 ');
    track(chain);
    await subscribe(sql, chain[0]);
    for (let i = 1; i < chain.length; i++) await link(sql, chain[i], chain[i - 1]);

    const res = (await audit(sql, chain[51]))!;
    assertEquals(res.upline.length, 50);
    assertEquals(res.upline_status, 'truncated');
    assertEquals(res.anomalies.includes('cycle'), false);
  });
});

Deno.test('admin_referral_member_audit：換線紀錄 → 推薦人集合無序、新約事件排除 keep、只有最新一筆可確認', async () => {
  await withSql(async (sql, track) => {
    const [x, b, c, d] = await insertUsers(sql, ['換線 本人', '換線 B', '換線 C', '換線 D']);
    track([x, b, c, d]);
    await subscribe(sql, x);
    // 回填形態：pair-history 的 created_at 全部相同，不能當順序。
    await sql`
      insert into public.referral_pair_history (referrer_user_id, referee_user_id, first_month_key, created_at)
      values (${b}, ${x}, '2026-01', '2026-11-01T00:00:00Z'),
             (${c}, ${x}, '2026-01', '2026-11-01T00:00:00Z')`;
    await link(sql, x, d);
    await freshOrder(sql, x, { referrer: c, source: 'code', completedAt: '2026-09-01T00:00:00Z' });
    await freshOrder(sql, x, {
      referrer: null,
      source: 'keep',
      completedAt: '2026-10-01T00:00:00Z',
    });
    await freshOrder(sql, x, {
      referrer: d,
      source: 'default',
      completedAt: '2026-10-15T00:00:00Z',
    });
    await sql`update public.profiles set referred_by_changed_at = '2026-10-15T00:00:00Z' where id = ${x}`;

    const res = (await audit(sql, x))!;
    assertEquals(res.referrer_history.past_referrers.map((r) => r.id).sort(), [b, c, d].sort());
    assertEquals(
      res.referrer_history.fresh_events.map((e) => [e.new_referrer_id, e.effective]),
      [[d, 'confirmed'], [c, 'unknown']],
      '新到舊；keep 不列；只有最新一筆能確認',
    );
  });
});

Deno.test('admin_referral_member_audit：profiles 與 edges 推薦人不一致 → referrer_mismatch', async () => {
  await withSql(async (sql, track) => {
    const [x, y, ok, a, z] = await insertUsers(sql, [
      '不一致 X',
      '不一致 Y',
      '一致',
      '不一致 A',
      '不一致 Z',
    ]);
    track([x, y, ok, a, z]);
    for (const u of [x, y, ok]) await subscribe(sql, u);
    await link(sql, x, z);
    await sql`update public.profiles set referred_by_user_id = ${a} where id = ${x}`;
    // profiles 有推薦人、edge 不存在。
    await sql`update public.profiles set referred_by_user_id = ${a} where id = ${y}`;
    await link(sql, ok, a);

    assertEquals((await audit(sql, x))!.referrer_mismatch, true, 'profiles 與 edge 指向不同人');
    assertEquals((await audit(sql, y))!.referrer_mismatch, true, 'profiles 有、edge 沒有');
    assertEquals((await audit(sql, ok))!.referrer_mismatch, false);
  });
});

Deno.test('admin_referral_member_audit：查無此人 → null；回應不含敏感欄位', async () => {
  await withSql(async (sql, track) => {
    assertEquals(await audit(sql, crypto.randomUUID()), null);
    const [u] = await insertUsers(sql, ['查帳 個資']);
    track([u]);
    await subscribe(sql, u);
    const json = JSON.stringify(await audit(sql, u));
    for (const key of SENSITIVE_KEYS) assertEquals(json.includes(`"${key}"`), false, key);
  });
});

Deno.test('admin_referral_member_audit：authenticated 與 anon 不得 EXECUTE', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const fn = 'public.admin_referral_member_audit(uuid)';
    const [row] = await sql`
      select has_function_privilege('authenticated', ${fn}, 'execute') as auth,
             has_function_privilege('anon', ${fn}, 'execute') as anon`;
    assertEquals([row.auth, row.anon], [false, false]);
  } finally {
    await sql.end();
  }
});
