-- ============================================================
-- 刊登照片孤兒判準（條款十之一：撤除內容或帳號刪除後三十日內下架）
-- ＋ 撤 listings_delete_own（見 listing-photo-orphans.test.ts）。
--
-- bucket listings-photos 是 public、以 getPublicUrl 直出，所以「下架」＝刪
-- Storage 物件。SQL 刪不了實體檔（20261028000001 檔頭），實際刪除由 Edge
-- POST /internal/purge-orphan-listing-photos 走 Storage API；本檔只提供判準。
--
-- 孤兒＝bucket 內、超過寬限期、name 符合 upload-photo 產生的格式，且沒有被
-- **檔案前綴本人**的刊登以 `p_public_base || name` 精確字串引用：
--   * 他人把你的 URL 寫進自己的 photos 不擋清理
--   * 帶 query、transform 路徑或尾斜線的變體 URL 視為未引用（前端只存
--     upload-photo 回傳的原樣 URL；手寫變體由 Edge 的比例閘兜底）
--   * 帳號已刪（profiles cascade 刪 listings）的檔自然沒有引用
-- p_public_base 由 Edge 以 listingPhotoPublicUrl 推導，SQL 不寫死網域。
--
-- 寬限期起算點是物件的 created_at（上傳時間）：刊登存檔前上傳的檔在寬限期內
-- 不會被清。filter_unreferenced_listing_photos 是刪除前的最後一道閘，不信任
-- 輸入，重新驗證 bucket／name／寬限期／引用；它的寬限期寫在下方
-- c_min_grace，與 Edge ORPHAN_GRACE_HOURS（listing-photos.ts）必須相等
-- （listing-photos.unit.test.ts 讀本檔把關；改寬限期要新 migration 覆寫本函式）。
--
-- 只授 service_role。三個函式都在 public schema，不 revoke 的話 PostgREST
-- 會把它們暴露成 /rpc 給 anon key 呼叫。
--
-- 撤 listings_delete_own（含 admin 分支）：前後端都沒有呼叫者，刪刊登一律走
-- DELETE /listings/:id（會連帶清 Storage）。FK cascade 不受 RLS 影響，帳號
-- 刪除路徑不變。回滾以新 migration 補回 create policy。
-- ============================================================

-- 單一物件的引用判準（不含寬限期與格式，兩支 RPC 各自先篩）。
-- 刻意不加 set search_path／security definer：那會讓 planner 無法內聯，
-- 每個物件都變成一次函式呼叫；內部一律 schema-qualified。
create or replace function public._listing_photo_is_orphan(p_public_base text, p_name text)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from public.listings l
    where l.user_id::text = split_part(p_name, '/', 1)
      and p_public_base || p_name = any(l.photos)
  )
$$;

revoke execute on function public._listing_photo_is_orphan(text, text)
  from anon, authenticated, public;
grant execute on function public._listing_photo_is_orphan(text, text) to service_role;

create or replace function public.list_orphan_listing_photos(
  p_public_base text,
  p_grace interval,
  p_limit int
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with objs as (
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'listings-photos'
  ),
  orphans as (
    select name, created_at
    from objs
    where created_at < now() - p_grace
      and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]+_[a-z0-9]+\.(jpg|png|webp)$'
      and public._listing_photo_is_orphan(p_public_base, name)
  ),
  refs as (
    select u
    from public.listings l, unnest(l.photos) u
    where left(u, length(p_public_base)) = p_public_base
  )
  select jsonb_build_object(
    'candidates', coalesce(
      (select jsonb_agg(c.name order by c.created_at, c.name)
       from (select name, created_at from orphans order by created_at, name limit p_limit) c),
      '[]'::jsonb
    ),
    -- 截斷前的總數：Edge 的比例閘用它，不用被 limit 截斷的 candidates 長度。
    'orphan_total', (select count(*) from orphans),
    'total_objects', (select count(*) from objs),
    'referenced_urls', (select count(*) from refs),
    'matched_urls', (
      select count(*)
      from refs r
      where exists (
        select 1 from storage.objects o
        where o.bucket_id = 'listings-photos'
          and o.name = substr(r.u, length(p_public_base) + 1)
      )
    )
  )
$$;

revoke execute on function public.list_orphan_listing_photos(text, interval, int)
  from anon, authenticated, public;
grant execute on function public.list_orphan_listing_photos(text, interval, int) to service_role;

create or replace function public.filter_unreferenced_listing_photos(
  p_public_base text,
  p_names text[]
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(o.name order by o.name), '{}'::text[])
  from storage.objects o
  where o.bucket_id = 'listings-photos'
    and o.name = any(p_names)
    -- c_min_grace：與 ORPHAN_GRACE_HOURS 相等（見檔頭）
    and o.created_at < now() - interval '168 hours'
    and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]+_[a-z0-9]+\.(jpg|png|webp)$'
    and public._listing_photo_is_orphan(p_public_base, o.name)
$$;

revoke execute on function public.filter_unreferenced_listing_photos(text, text[])
  from anon, authenticated, public;
grant execute on function public.filter_unreferenced_listing_photos(text, text[]) to service_role;

drop policy if exists listings_delete_own on public.listings;
