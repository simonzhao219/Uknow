// ============================================================
// security definer 函式的 EXECUTE 授權白名單
//
// 為什麼:security definer 函式以 owner 身分執行、繞過 RLS,而 anon key 隨
// bundle 公開出貨——anon/authenticated 只要拿到 EXECUTE,就能直接打
// PostgREST `rpc/<函式>`,完全不經 Edge Function 的遮罩與授權。
// 事故:referral_tree 對 authenticated 開放(20260620000005),會員可直接
// 取得三代內所有人的真名;effective_registration_step 從未 revoke public,
// anon 可查任意 uid 的註冊/付款進度(稽核 ref P0-3、ops P2-1、pay P2-1)。
//
// Postgres 對新函式預設把 EXECUTE 授給 PUBLIC,所以「新增函式忘了 revoke」
// 會讓它出現在下面的查詢結果裡 → 與白名單不符 → 紅燈。
// 白名單新增一列時,必須寫明為什麼這個角色非得能直接呼叫。
//
// 只比對 public schema、排除 extension 自帶函式;用 has_function_privilege
// 問實際有效權限(含 PUBLIC 繼承),環境無關。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** 角色 → 允許直接執行的 security definer 函式(含參數簽名)與理由。 */
const ALLOWED: Record<'anon' | 'authenticated', Record<string, string>> = {
  anon: {
    'has_active_subscription(p_user_id uuid)':
      '公開刊登的 RLS policy(listings select)以呼叫者身分評估,匿名瀏覽者也要能通過',
  },
  authenticated: {
    'has_active_subscription(p_user_id uuid)': '同上:會員瀏覽刊登時 RLS policy 以其身分評估',
    'is_admin()': 'profiles 等表的 own policy 為 (user_id = auth.uid() OR is_admin()),缺了會 42501',
  },
};

async function executable(role: 'anon' | 'authenticated'): Promise<string[]> {
  const sql = postgres(DB_URL);
  try {
    const rows = await sql<{ sig: string }[]>`
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and has_function_privilege(${role}, p.oid, 'EXECUTE')
        and not exists (
          select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
        )
      order by 1
    `;
    return rows.map((r) => r.sig);
  } finally {
    await sql.end();
  }
}

for (const role of ['anon', 'authenticated'] as const) {
  Deno.test(`security definer 函式：${role} 可直接執行的集合恰為白名單`, async () => {
    assertEquals(
      await executable(role),
      Object.keys(ALLOWED[role]).sort(),
      `${role} 能執行的 security definer 函式與白名單不符:新函式請在 migration ` +
        `revoke execute ... from anon, authenticated, public(只給 service_role),` +
        `真的需要直接開放才加進 ALLOWED 並寫理由`,
    );
  });
}
