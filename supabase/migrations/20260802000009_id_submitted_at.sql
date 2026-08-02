-- ============================================================
-- 證件送審時間戳（B2 的人工裁決結果）
-- ============================================================
--
-- 規劃 §2.1 的四個欄位是 `id_verification_status` / `id_verified_at` /
-- `id_verified_by` / `id_reject_reason`——**沒有「何時送審」**。
-- `id_verified_at` 是「何時被審」，對 `pending` 的列一律是 null。
--
-- 後果：審核佇列排不出「等最久的」，而那正是佇列最自然的處理順序。階段 1.5
-- 先以 `profiles.created_at`（註冊時間）代替——穩定，但講的是另一件事：一個
-- 2024 年註冊、昨天才上傳證件的人會排在今天註冊、今天上傳的人前面，明明後者
-- 等的時間一樣短。佇列一長，先進先出就開始說謊。
--
-- 需求方裁決：加欄位。
--
-- backfill 用 `id_verified_at`（已審過的）或 `created_at`（還沒審的）當近似值
-- ——兩者都不是真的送審時間，但**已存在的列本來就沒有那個資訊**，任何值都是
-- 近似。選這兩個是因為它們保證非 null 且單調，佇列排序不會出現空洞。
-- ============================================================

alter table public.profiles
  add column if not exists id_submitted_at timestamptz;

comment on column public.profiles.id_submitted_at is
  '證件送審時間（上傳雙面照片、狀態轉 pending 的那一刻）。審核佇列依它排「等最久的」。'
  '2026-08-02 之前的列是 backfill 的近似值，見 migration 20260802000009。';

update public.profiles
set id_submitted_at = coalesce(id_verified_at, created_at)
where id_submitted_at is null
  and coalesce(id_verification_status, 'none') <> 'none';

-- 佇列改依送審時間排序。等最久的在最前面——那是佇列唯一說得通的順序。
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
      p.id_submitted_at,
      p.created_at,
      p.id_card_front_path,
      p.id_card_back_path,
      u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where coalesce(p.id_verification_status, 'none') <> 'none'
      and (p_status is null or p_status = 'all' or p.id_verification_status = p_status)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'reviews', coalesce(
      (select jsonb_agg(to_jsonb(r))
       from (
         select * from filtered
         -- coalesce 保底：backfill 之後理論上不會有 null，但新欄位加上去的
         -- 那一刻若有並行寫入仍可能漏一列，排序不該因此把它甩到最後面。
         order by coalesce(id_submitted_at, created_at)
         limit least(coalesce(p_limit, 50), 200)
         offset greatest(coalesce(p_offset, 0), 0)
       ) r),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function public.admin_list_id_reviews(text, int, int)
  from anon, authenticated, public;
