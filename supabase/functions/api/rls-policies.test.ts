// ============================================================
// L1:`public.listings` 的 RLS policy 結構守衛(規劃 rls-listings-policies §5 階段 1)
//
// 為什麼需要這一層,以及它「不」證明什麼:
//
// RLS 是前端直連 PostgREST 那條路徑上**唯一**的授權機制——Edge Function 的
// sb()(index.ts)一律用 SERVICE_ROLE 繞過 RLS,而前端直接以 anon/authenticated
// 身分讀寫 listings(CreateServiceProvider / EditServiceProvider /
// ServiceProviderManagement),anon key 又隨 bundle 公開出貨。
//
// 但**本地測不到 policy 的行為**:本專案刻意只把 table 權限 GRANT 給
// service_role(20260717000001),authenticated/anon 依賴 hosted Supabase 的預設
// 授權;本地 `supabase start` 不補那層 grant,所以 authenticated 直連 listings
// 會在 GRANT 層就被擋(42501),根本走不到 RLS(詳見 listings.test.ts 檔頭)。
// 行為驗證因此放在 journey 的 hosted 分支(L2,45_listing_rls.feature)。
//
// 這個檔案是另一道防線:**釘住 policy 的結構**。它抓不到「policy 寫錯」,
// 但抓得到「被刪掉、角色被放寬、條件被改寬、多出第 6 條 permissive、
// 或整張表的 RLS 被關掉」——那才是實際會發生的迴歸,而且每個 PR 都跑得到。
//
// ⚠️ 只斷言**環境無關**的事實。policy 的存在/角色/表達式/欄位集合全部來自
// migration,每個環境相同;而 has_table_privilege('anon', ...) 這種 GRANT 事實
// 本地是 false、hosted 是 true,在這一軌斷言它等於把錯的環境寫進測試——就是
// 「先 GRANT 再測」那個假綠陷阱換件衣服。GRANT 要釘就釘在 L2。
//
// 做法沿用 name-write-paths.test.ts 的原則:直接問 Postgres,中間不隔 PostgREST。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** pg_get_expr 反編譯運算式樹時,不同 Postgres 大版本的間距可能有微幅差異。
 *
 * 本地 `supabase start` 的大版本**沒有被 pin**(supabase/config.toml 沒有
 * [db] major_version),而 golden 值取自 hosted develop(PostgreSQL 17.6)
 * ——setup-cli 版本一升,本地大版本就可能靜默改變。正規化空白讓格式差異不會
 * 造成假紅;而「條件被改寬」必然改變 token(例如多一個 OR true),不會只停在
 * 空白層級,所以這個放寬**不會**產生假陰性。
 */
function normalize(expr: string | null): string | null {
  return expr === null ? null : expr.replace(/\s+/g, ' ').trim();
}

type PolicyRow = {
  polname: string;
  cmd: string;
  permissive: boolean;
  roles: string;
  using_expr: string | null;
  check_expr: string | null;
};

async function listingsPolicies(sql: ReturnType<typeof postgres>): Promise<PolicyRow[]> {
  return await sql<PolicyRow[]>`
    select
      p.polname,
      case p.polcmd
        when 'r' then 'SELECT' when 'a' then 'INSERT'
        when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL'
      end as cmd,
      p.polpermissive as permissive,
      -- polroles = {0} 代表 PUBLIC;pg_roles 沒有 oid 0,子查詢會是 null
      coalesce(
        (select string_agg(r.rolname, ',' order by r.rolname)
           from pg_roles r where r.oid = any(p.polroles)),
        'PUBLIC'
      ) as roles,
      pg_get_expr(p.polqual, p.polrelid)      as using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'listings'
    order by p.polname
  `;
}

const OWN_EXPR = '((user_id = auth.uid()) OR is_admin())';

// golden 值取自 develop 分支(hosted,從 migration 乾淨重播)實測。
const EXPECTED: Record<string, Omit<PolicyRow, 'polname'>> = {
  listings_delete_own: {
    cmd: 'DELETE',
    permissive: true,
    roles: 'authenticated',
    using_expr: OWN_EXPR,
    check_expr: null,
  },
  listings_insert_own: {
    cmd: 'INSERT',
    permissive: true,
    // 五條裡唯一沒被 20260726000001 收斂到 authenticated 的——它不呼叫
    // is_admin(),所以當時沒有 anon 42501 的症狀。現況釘成 characterization:
    // anon 的 auth.uid() 為 null,比不中 with check,本來就過不了。
    roles: 'PUBLIC',
    using_expr: null,
    check_expr: '(user_id = auth.uid())',
  },
  listings_select_own: {
    cmd: 'SELECT',
    permissive: true,
    roles: 'authenticated',
    using_expr: OWN_EXPR,
    check_expr: null,
  },
  listings_select_public: {
    cmd: 'SELECT',
    permissive: true,
    // 依設計必須對 anon 開放:訪客瀏覽走 public_listings(security_invoker),
    // 底層 listings 需要這條才回得了資料(20260620000004 / 20260726000001)。
    roles: 'PUBLIC',
    using_expr: 'has_active_subscription(user_id)',
    check_expr: null,
  },
  listings_update_own: {
    cmd: 'UPDATE',
    permissive: true,
    roles: 'authenticated',
    using_expr: OWN_EXPR,
    // WITH CHECK 缺了的話,擁有者可以把 user_id 改成別人(把擁有權送出去)
    check_expr: OWN_EXPR,
  },
};

// ============================================================
// 1. RLS 本身有沒有開——其餘每一條都預設它是開的
// ============================================================

Deno.test('listings RLS：資料表已啟用 row level security', async () => {
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql`
      select relrowsecurity as rls_enabled
      from pg_class where oid = 'public.listings'::regclass
    `;
    // ALTER TABLE ... DISABLE ROW LEVEL SECURITY **不會刪除任何一條 policy**:
    // 下面 2-6 條全部讀 pg_policy / information_schema,會照樣回報「5 條齊全、
    // 角色與表達式完全正確」,但 RLS 一點都沒生效。而 anon/authenticated 對
    // listings 的 table GRANT 在 hosted 是全開的,所以那等於任何人都能讀寫
    // 任意會員的刊登。這條是唯一抓得到該退化的斷言。
    assertEquals(row.rls_enabled, true, 'listings 必須啟用 RLS');
  } finally {
    await sql.end();
  }
});

// ============================================================
// 2-5. policy 集合、角色範圍、permissive、條件表達式
// ============================================================

Deno.test('listings RLS：policy 集合恰好是這五條,不多不少', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await listingsPolicies(sql);
    // 「多一條 permissive」是 RLS 最典型的破口:permissive policy 之間是 OR,
    // 任何人新增一條 using (true) 就整張表對外開放,而既有五條完全不受影響。
    assertEquals(
      rows.map((r) => r.polname),
      Object.keys(EXPECTED).sort(),
      'listings 的 policy 集合與期望不符(多一條、少一條或改名)',
    );
  } finally {
    await sql.end();
  }
});

Deno.test('listings RLS：三條 own policy 只適用 authenticated', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await listingsPolicies(sql);
    const scoped = rows
      .filter((r) =>
        ['listings_select_own', 'listings_update_own', 'listings_delete_own'].includes(r.polname)
      )
      .map((r) => `${r.polname}=${r.roles}`);
    // 放寬回 PUBLIC 會讓未登入者的查詢也踩到 own-policy 裡的 is_admin(),
    // 而 anon 沒有該函式的 EXECUTE —— 訪客瀏覽首頁直接 42501
    // (20260726000001 修的就是這個,它的收尾自我驗證也守著同一個不變式)。
    assertEquals(
      scoped,
      [
        'listings_select_own=authenticated',
        'listings_update_own=authenticated',
        'listings_delete_own=authenticated',
      ].sort(),
    );
  } finally {
    await sql.end();
  }
});

Deno.test('listings RLS：insert_own 與 select_public 維持 PUBLIC 範圍', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await listingsPolicies(sql);
    const publicScoped = rows.filter((r) => r.roles === 'PUBLIC').map((r) => r.polname);
    assertEquals(publicScoped, ['listings_insert_own', 'listings_select_public']);
  } finally {
    await sql.end();
  }
});

Deno.test('listings RLS：五條全是 permissive,沒有 restrictive', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await listingsPolicies(sql);
    // restrictive 與 permissive 的合成方式相反(AND vs OR),把任一條改成
    // restrictive 會靜默改變整體授權語意,而集合/角色/表達式三項都看不出來。
    assertEquals(rows.filter((r) => !r.permissive).map((r) => r.polname), []);
  } finally {
    await sql.end();
  }
});

Deno.test('listings RLS：USING 與 WITH CHECK 表達式與 golden 相符', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await listingsPolicies(sql);
    const [{ version }] = await sql<{ version: string }[]>`
      select current_setting('server_version') as version
    `;
    for (const row of rows) {
      const want = EXPECTED[row.polname];
      assertEquals(
        { using: normalize(row.using_expr), check: normalize(row.check_expr), cmd: row.cmd },
        { using: normalize(want.using_expr), check: normalize(want.check_expr), cmd: want.cmd },
        `${row.polname} 的條件與 golden 不符(本機 PostgreSQL ${version};` +
          'golden 取自 develop 的 17.6。若只是版本間的反編譯格式差異,' +
          '調整 normalize();若條件真的被改了,那正是這條要抓的東西)',
      );
    }
  } finally {
    await sql.end();
  }
});

// ============================================================
// 6. 欄位集合不變式
// ============================================================

Deno.test('listings：對外欄位集合與 public_listings 完全相同', async () => {
  const sql = postgres(DB_URL);
  try {
    // 用排序後的集合比對,不用 ordinal_position 逐列對應——後者在單純重排
    // view 的 select list(不增減欄位、無安全意涵)時會假紅。
    const [row] = await sql<{ only_in_table: string[] | null; only_in_view: string[] | null }[]>`
      with t as (
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'listings'
      ), v as (
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'public_listings'
      )
      select
        (select array_agg(column_name order by column_name) from (select * from t except select * from v) x)
          as only_in_table,
        (select array_agg(column_name order by column_name) from (select * from v except select * from t) y)
          as only_in_view
    `;
    // public_listings 是 security_invoker view,底層 listings 由
    // listings_select_public 決定可見範圍——兩者欄位集合相同,代表訪客直連
    // raw table 不會比走 view 多看到任何欄位。日後有人幫 listings 加欄位卻
    // 忘了同步 view 的白名單,這條會紅;既有的 view 白名單測試
    // (listings.test.ts)只護得住 view 那一側,護不到這個對稱關係。
    assertEquals(row.only_in_table, null, 'listings 有 public_listings 沒有的欄位');
    assertEquals(row.only_in_view, null, 'public_listings 有 listings 沒有的欄位');
  } finally {
    await sql.end();
  }
});
