-- ============================================================
-- Uknow — 刊登照片 bucket 改名：make-5c6718b9-listings-photos → listings-photos
-- ============================================================
-- 業主裁決 38：bucket 名改成乾淨的 listings-photos。Supabase bucket 的
-- id 不可改名，所以做法是建新 bucket + 程式碼常數（LISTING_PHOTOS_BUCKET，
-- 前後端各一份）換名。
--
-- 刻意不做的事：
--   - 不刪舊 bucket：由業主事後在 Dashboard → Storage 整個刪除
--     （storage.objects 不能用 SQL 刪，直接刪列只會留下孤兒實體）。
--   - 不搬舊照片：第 1 波上線前正式站刊登資料全清，舊 URL 清資料後不存在。
--   - 不改 20260805000001（已套用的 migration 不可改）。
--
-- 設定沿用舊 bucket（public、5MB——刊登照片以 getPublicUrl 直出）。
-- on conflict do nothing，冪等安全。
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('listings-photos', 'listings-photos', true, 5242880)
on conflict (id) do nothing;
