-- ============================================================
-- Uknow 後端重構 — 0008 撤銷 event trigger 函數的對外執行權限
-- ============================================================
--
-- rls_auto_enable() 是一個 event trigger 函數（新建 public 資料表時
-- 自動開啟 RLS 的安全網），不應該、也不需要被 anon/authenticated
-- 透過 /rest/v1/rpc 直接呼叫。撤銷 EXECUTE 以消除 advisor 警告。
--
-- 註：has_active_subscription / validate_referral_code / referral_tree
-- 的 advisor 警告是「刻意對外暴露」的設計（公開瀏覽、註冊驗證、查自己的
-- 推薦樹），本身有最小回傳面與內部存取控制，故保留不動。
-- ============================================================

revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
