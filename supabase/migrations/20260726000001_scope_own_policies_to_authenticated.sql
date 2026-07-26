-- ============================================================
-- 訪客瀏覽不該碰到 is_admin()：把「自己的資料」policy 收斂到 authenticated
--
-- 症狀（2026-07-26，develop 站台首頁）：未登入開啟站台，
--   GET /rest/v1/public_listings → 401
--   {"code":"42501","message":"permission denied for function is_admin"}
--
-- 根因是兩個既有 migration 互相矛盾：
--   * 20260620000002_rls_policies：listings / profiles / … 的「自己的資料」
--     policy 沒有指定適用角色，等於套用到 PUBLIC（含 anon），而條件裡
--     呼叫 public.is_admin()。
--   * 20260620000004_security_hardening:79：
--       revoke execute on function public.is_admin() from anon, public;
--     這一行原本是跟 trigger 函數一起撤權的，但 is_admin() 不是 trigger 函數。
--
--   public_listings 是 security_invoker view，底層 listings 的 RLS 以呼叫者
--   （anon）的身分評估；而 Postgres 會把所有 permissive SELECT policy 用 OR
--   串起來評估，所以 anon 的查詢**一定**會踩到 own-policy 裡的 is_admin()
--   ——即使它最終要靠的是另一條 listings_select_public。
--
-- 為什麼拖到現在才發現：正式站在某個時間點被手動下過
--   `grant execute on function public.is_admin() to anon;`（不在任何 migration
--   裡，git 查不到），把這個矛盾蓋住了。凡是從 migration 乾淨重播出來的環境
--   ——develop 分支、journey 的拋棄式分支——訪客瀏覽一律是壞的。這正是
--   「儀表板上的手動修改」最貴的一種代價：它讓錯誤的設定看起來是對的。
--
-- 修法：把這些 policy 的適用角色收斂到 authenticated。
--   未登入者本來就沒有「自己的資料」（auth.uid() 為 null，永遠比不中），
--   讓 policy 套用到 anon 只是徒然把 is_admin() 拉進訪客的查詢路徑。
--
--   行為不變：
--     * anon 讀 listings → 仍由 listings_select_public 決定可見範圍
--       （用 has_active_subscription，anon 有執行權限，不受本次改動影響）
--     * anon 讀其他表 → 本來就是 0 列（比不中自己），現在仍是 0 列，
--       差別只在不再拋權限錯誤
--     * authenticated / service_role → 完全不受影響
--
--   刻意**不**採用「grant is_admin to anon」那條路：那會把 0004 收緊的東西
--   放回去，而且治標不治本——真正的問題是 policy 的適用角色開太寬，
--   不是授權太嚴。Supabase 的 security advisor 也把「anon 可執行
--   security definer 函數」列為 WARN，往放寬的方向修等於逆著它走。
--
-- 一併收斂 referral_king_rewards 與 system_alerts：anon 對這兩張表沒有
-- SELECT 權限、目前不會踩到，但它們同樣是 PUBLIC 範圍且呼叫 is_admin()。
-- 一起改才能把不變式訂成「public schema 內沒有任何 PUBLIC 範圍的 policy
-- 呼叫 is_admin()」，檔尾的自我驗證才守得住。
-- ============================================================

alter policy listings_select_own              on public.listings              to authenticated;
alter policy listings_update_own              on public.listings              to authenticated;
alter policy listings_delete_own              on public.listings              to authenticated;
alter policy profiles_select_own              on public.profiles              to authenticated;
alter policy profiles_update_own              on public.profiles              to authenticated;
alter policy payment_orders_select_own        on public.payment_orders        to authenticated;
alter policy referral_codes_select_own        on public.referral_codes        to authenticated;
alter policy referral_edges_select_related    on public.referral_edges        to authenticated;
alter policy referral_king_rewards_select_own on public.referral_king_rewards to authenticated;
alter policy reward_transactions_select_own   on public.reward_transactions   to authenticated;
alter policy subscriptions_select_own         on public.subscriptions         to authenticated;
alter policy task_progress_select_own         on public.task_progress         to authenticated;
alter policy withdrawals_select_own           on public.withdrawals           to authenticated;
alter policy system_alerts_select_admin       on public.system_alerts         to authenticated;

-- ------------------------------------------------------------
-- 收掉正式站那個手動補上的 anon 授權，讓 git 重新成為真相。
--
-- 0004 早就 revoke 過，但正式站被手動 grant 回去；上面的 policy 收斂之後
-- 已經沒有任何東西需要 anon 執行 is_admin()，留著只是多一條
-- /rest/v1/rpc/is_admin 的對外攻擊面（Supabase security advisor 的
-- anon_security_definer_function_executable 正是在講這件事）。
--
-- 對 develop / journey 這類乾淨環境是 no-op（本來就沒有這個授權）；
-- 只有正式站會真的被收回，收回後兩邊才真正一致。
-- ------------------------------------------------------------
revoke execute on function public.is_admin() from anon;

-- ------------------------------------------------------------
-- 收尾自我驗證：套用後不得再有「PUBLIC 範圍卻呼叫 is_admin()」的 policy。
--
-- 這道斷言在**每一個套用此 migration 的環境**都會跑（正式站、develop 分支、
-- 每個 journey 拋棄式分支），漏改一條就當場讓 migration 失敗——比等到訪客
-- 開首頁才收到 42501 早得多。本地 `supabase start` 缺 hosted 的 anon grant，
-- 這個 bug 用 Deno 整合測試重現不了（見 api/listings.test.ts 檔頭），所以
-- 防線放在 migration 自身。
-- ------------------------------------------------------------
do $$
declare
  v_left text;
begin
  select string_agg(c.relname || '.' || p.polname, '、' order by c.relname, p.polname)
    into v_left
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and p.polroles = '{0}'  -- {0} = PUBLIC（未指定角色的 policy 就是這個值）
    and (
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%is_admin%'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%is_admin%'
    );

  if v_left is not null then
    raise exception
      '仍有 PUBLIC 範圍卻呼叫 is_admin() 的 policy：%。未登入者查詢這些表會得到 42501（anon 無 is_admin 執行權），請一併收斂到 authenticated。',
      v_left;
  end if;
end $$;
