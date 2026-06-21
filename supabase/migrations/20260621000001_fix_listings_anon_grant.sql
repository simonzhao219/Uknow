-- ============================================================
-- Uknow 後端修補 — 0011 修正訪客瀏覽刊登 403
-- ============================================================
--
-- 問題：
--   0004 將 public_listings view 改為 security_invoker = on，
--   代表查詢以「呼叫者」身分讀底層 listings 表。
--   但 listings 表從未對 anon / authenticated 下過 table 層級的
--   grant select，RLS policy 只負責過濾 row、不等於存取權限。
--   結果未登入訪客查 public_listings 時，Postgres 直接回
--   42501 permission denied for table listings。
--
-- 修法：
--   對 listings 補上 grant select。可見範圍仍由既有 RLS policy
--   控制（anon 只看得到 listings_select_public：有效會員的刊登；
--   authenticated 另有 listings_select_own）。listings 的欄位與
--   public_listings view 揭露的欄位一致，不會多洩漏資料。
-- ============================================================

grant select on public.listings to anon, authenticated;
