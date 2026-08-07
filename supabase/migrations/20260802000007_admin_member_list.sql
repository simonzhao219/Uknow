-- ============================================================
-- 會員查詢台的列表（規劃書階段 3.1 / 驗收情境 M2、M3）
-- ============================================================
--
-- **統計卡說的是全站，不是當前頁。** admin 看到「停權 3 人」就會據此判斷要不要
-- 處理，而如果那個 3 只是「這一頁裡的 3」，數字就在說謊——第 2 頁還有 5 個
-- 停權的他永遠不知道。所以 stats 在 filtered CTE 上算，`limit` 只作用在
-- members 陣列。
--
-- ⚠️ 簽章從 3 參數變 5 參數：**`create or replace` 在這種情況下是多載不是取代**。
-- 舊的 (text, int, int) 版本會留著繼續生效，而 PostgREST 依參數名解析——
-- 呼叫端少帶兩個參數就會靜默打到舊版（沒有 stats、沒有排序），migration 顯示
-- 成功、測試可能還會過，但線上跑的是舊規則。這個坑階段 2.3 踩過一次
-- （admin_update_withdrawal_status），所以這裡先顯式 drop。
-- ============================================================

drop function if exists public.admin_list_members(text, int, int);

create or replace function public.admin_list_members(
  p_search text default null,
  p_status text default null,
  p_sort   text default 'created_desc',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.name,
      p.phone,
      p.is_admin,
      p.suspended_at,
      p.created_at,
      p.id_verification_status,
      u.email,
      coalesce(a.status, 'expired') as account_status,
      a.end_date,
      (select count(*) from public.listings l where l.user_id = p.id) as listing_count
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_account_status a on a.user_id = p.id
    where p_search is null or p_search = ''
       or p.name  ilike '%' || p_search || '%'
       or u.email ilike '%' || p_search || '%'
       or p.phone ilike '%' || p_search || '%'
  ),
  filtered as (
    select * from base
    where p_status is null or p_status = '' or p_status = 'all'
       -- 停權是 profiles 上的獨立軸，不是 account_status 的一個值：
       -- 一個停權的人也可能同時是「訂閱中」。分開判斷才不會互相吃掉。
       or (p_status = 'suspended' and suspended_at is not null)
       or (p_status = 'admin'     and is_admin)
       or (p_status = 'active'    and suspended_at is null and account_status = 'active')
       or (p_status = 'expired'   and suspended_at is null and account_status <> 'active')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    -- stats 在 filtered 上算，**不套 limit**——這就是 M2 的全部重點。
    'stats', jsonb_build_object(
      'total',     (select count(*) from filtered),
      'active',    (select count(*) from filtered where suspended_at is null and account_status = 'active'),
      'expired',   (select count(*) from filtered where suspended_at is null and account_status <> 'active'),
      'suspended', (select count(*) from filtered where suspended_at is not null),
      'admins',    (select count(*) from filtered where is_admin)
    ),
    'members', coalesce(
      (select jsonb_agg(to_jsonb(m))
       from (
         select * from filtered
         order by
           case when p_sort = 'created_asc'  then created_at end asc,
           case when p_sort = 'end_date_asc' then end_date  end asc nulls last,
           -- 預設 created_desc：admin 通常在找剛註冊的人（規劃 §6 開放問題 #2）。
           case when p_sort is null or p_sort not in ('created_asc', 'end_date_asc')
                then created_at end desc
         limit least(coalesce(p_limit, 50), 200)
         offset greatest(coalesce(p_offset, 0), 0)
       ) m),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function public.admin_list_members(text, text, text, int, int)
  from anon, authenticated, public;
