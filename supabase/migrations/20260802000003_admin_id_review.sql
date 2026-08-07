-- ============================================================
-- admin 證件審核端點的資料層（規劃書階段 1.3）
-- ============================================================
--
-- 合法轉換表（規劃書 §2.1）：
--
--   pending  → approved   核可
--   pending  → rejected   退回，理由必填
--   approved → rejected   事後發現造假可改判
--   rejected → approved   **拒絕**——需會員重新上傳。admin 直接翻回等於
--                         繞過「重看一次新照片」，而重新上傳本身就會把
--                         狀態帶回 pending（見 /rewards/upload-id-photos）
--   none     → *          拒絕：還沒交齊照片的人不在審核範圍
--
-- **不連動既往提領**是刻意設計：提領守衛只在申請當下檢查，錢的狀態由提領
-- 狀態機管，不由證件狀態回溯翻案。事後發現造假要追已匯出的款，走人工程序。
-- ============================================================

create or replace function public.admin_review_id(
  p_admin_id uuid,
  p_user_id  uuid,
  p_approve  boolean,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_status   text;
  v_target   text;
begin
  select is_admin into v_is_admin from public.profiles where id = p_admin_id;
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '僅限管理員');
  end if;

  -- 鎖住該列：兩位 admin 同時審同一筆時序列化，避免後手覆寫前手的判定。
  select id_verification_status into v_status
  from public.profiles
  where id = p_user_id
  for update;

  if v_status is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到使用者');
  end if;

  v_target := case when p_approve then 'approved' else 'rejected' end;

  -- 退回必須說得出原因。只寫「被退回」會讓會員重送一模一樣的照片再被退一次
  -- ——那是這條規則要防的浪費。trim 後為空也算沒填。
  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('success', false, 'error_code', 'reason_required',
      'message', '退回時必須填寫理由，會員需要知道要改什麼');
  end if;

  if v_status = v_target then
    return jsonb_build_object('success', true, 'idempotent', true, 'status', v_status);
  end if;

  -- 合法轉換：pending 可去兩邊；approved 可改判 rejected；其餘一律拒絕。
  if not (
    v_status = 'pending'
    or (v_status = 'approved' and v_target = 'rejected')
  ) then
    return jsonb_build_object('success', false, 'error_code', 'invalid_transition',
      'message', format('狀態 %s 不能由管理員轉為 %s', v_status, v_target));
  end if;

  update public.profiles
  set id_verification_status = v_target,
      id_verified_by         = p_admin_id,
      id_verified_at         = now(),
      -- 核可時清掉上一輪的退回理由，否則會員在「已通過」狀態下還看得到舊說明。
      id_reject_reason       = case when p_approve then null else btrim(p_reason) end
  where id = p_user_id;

  return jsonb_build_object('success', true, 'status', v_target);
end;
$$;

-- ------------------------------------------------------------
-- 審核佇列。join auth.users 拿 email——auth schema 沒有暴露給 PostgREST，
-- security definer SQL 函數是唯一乾淨的路（同 admin_list_members）。
--
-- 排序用 created_at（註冊時間）而非送審時間:schema 沒有「何時送審」的欄位
-- （見 progress.md B2）。佇列量大到先進先出會失準時再議。
--
-- 證件照只回**路徑**,簽名網址由 API 層批次產生——與 /admin/withdrawals 同
-- 模式,SQL 不碰 storage。
-- ------------------------------------------------------------
create or replace function public.admin_list_id_reviews(
  p_status text default 'pending',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      p.id,
      p.name,
      p.phone,
      p.id_verification_status,
      p.id_reject_reason,
      p.id_verified_at,
      p.id_card_front_path,
      p.id_card_back_path,
      p.created_at,
      u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    -- none = 沒交齊照片,不在審核範圍,不該佔用 admin 的佇列
    where p.id_verification_status <> 'none'
      and (p_status is null or p_status = 'all' or p.id_verification_status = p_status)
  )
  select jsonb_build_object(
    'total',   (select count(*) from filtered),
    'reviews', coalesce(
      (select jsonb_agg(to_jsonb(m))
       from (
         select * from filtered
         order by created_at
         limit least(coalesce(p_limit, 50), 200)
         offset greatest(coalesce(p_offset, 0), 0)
       ) m),
      '[]'::jsonb
    )
  );
$$;

-- Postgres 對函數 EXECUTE 預設授予 PUBLIC，而 PostgREST 的 rpc 端點
-- **不經過** Edge Function 的 /admin/* middleware。漏了這兩行，任何已登入
-- 會員都能直呼 rpc/admin_review_id 自行核可證件（規劃書 §2.5、審查 P0-2）。
revoke execute on function public.admin_review_id(uuid, uuid, boolean, text)
  from anon, authenticated, public;
revoke execute on function public.admin_list_id_reviews(text, int, int)
  from anon, authenticated, public;
