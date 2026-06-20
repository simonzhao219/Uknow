-- ============================================================
-- Uknow 後端重構 — 0009 Auth / Profile 自助更新安全化
-- ============================================================
--
-- 背景：採「混合模式」— 簡單讀寫由前端 supabase-js 直連 + RLS。
-- 因此「完善個人資料」會是前端直接 update profiles。但 RLS 的
-- profiles_update_own 只管「列」（是不是自己），不管「欄」。若不限制，
-- 使用者能改自己的 referred_by_user_id、自設 referral_program_joined。
--
-- 解法：用 column-level GRANT 把 authenticated 能改的欄位鎖到「安全自助欄」。
--   敏感欄位（推薦來源、推薦計畫、is_admin、registration_step）一律
--   由 trigger(definer) 或 Edge Function(service_role) 寫，前端碰不到。
--
-- 另：強化 handle_new_user() — 註冊時從 metadata 帶入 referred_by_code，
--     並解析出 referred_by_user_id（推薦來源在「註冊當下」就記錄；
--     真正的 referral_edges 與發獎仍等到付款成功才建立）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 欄位級更新權限：authenticated 只能改這些「自助欄」
--    （admin 改他人/敏感欄位走 service_role，會繞過欄位權限與 RLS）
-- ------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (name, phone, birth_date, national_id, bank_code, bank_account)
  on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 2. handle_new_user：記錄推薦來源
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_code text := nullif(new.raw_user_meta_data ->> 'referred_by_code', '');
  v_referrer uuid;
begin
  -- 註冊時若帶推薦碼，解析出推薦人（只認目前 active 的推薦碼）
  if v_ref_code is not null then
    select rc.user_id into v_referrer
    from public.referral_codes rc
    where rc.code = v_ref_code and rc.status = 'active'
    limit 1;
  end if;

  insert into public.profiles (
    id, name, phone, national_id, referred_by_code, referred_by_user_id
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'national_id',
    v_ref_code,
    v_referrer
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;
