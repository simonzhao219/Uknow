-- ============================================================
-- Uknow — hotfix:收回 referral_tree / effective_registration_step 的對外執行權
-- ============================================================
--
-- 根因:兩支 security definer 函式的 EXECUTE 對 PostgREST `rpc/` 開放。
--   * referral_tree(uuid):20260620000005 末尾 grant 給 authenticated,之後沒有
--     migration 收回。任何會員用 bundle 內的 anon key + 自己的 JWT 打
--     rpc/referral_tree,拿到三代內所有人的**真實全名**與會籍狀態;
--     /referrals 頁面上二、三代顯示的是遮罩名(§7.2)。Edge Function 與前端
--     都不呼叫它,只剩暴露面 → 直接 drop。
--   * effective_registration_step(uuid):20260620000011 / 20260719000004 只
--     grant authenticated、service_role,從未 revoke PUBLIC,所以 anon 也能
--     執行,可查任意 uid 的註冊/付款進度。唯一呼叫者是 Edge Function
--     (sb() = service_role)與 register_profile(security definer,以 owner
--     執行);沒有 RLS policy 使用它 → 收回 anon/authenticated/public,
--     保留 service_role。
--
-- drop 不加 cascade:若有未知相依(函式/view),migration 會失敗而非靜默連帶刪除。
-- ============================================================

drop function if exists public.referral_tree(uuid);

revoke execute on function public.effective_registration_step(uuid)
  from anon, authenticated, public;
grant execute on function public.effective_registration_step(uuid) to service_role;
