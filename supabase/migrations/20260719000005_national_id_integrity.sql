-- ============================================================
-- Uknow — 0719 0004 身分證字號完整性（M2）
-- ============================================================
--
-- 三道防護：
--   1. 唯一性：partial unique index（同一身分證字號不可綁多個帳號）。
--      ⚠️ 部署前先確認沒有既存重複：
--        select national_id, count(*) from public.profiles
--        where national_id is not null group by national_id having count(*) > 1;
--   2. 不可自改：從 authenticated 的欄位級 update 授權移除 national_id
--      （原 0009 granted）；使用者無法再用 supabase-js 直接改自己的號碼。
--   3. 一經設定即不可變：BEFORE UPDATE trigger 擋掉「已設定的 national_id
--      改成不同值（或清空）」——連 service_role 路徑（Edge Function）也擋，
--      真要更正走人工 SQL。首次由 NULL 設值不受限（註冊/完善資料）。
--   （檢查碼驗證在 Edge Function 寫入點 /auth/register 完成，見 taiwan-id.ts。）
-- ============================================================

-- 1. 唯一性
create unique index if not exists profiles_national_id_unique
  on public.profiles (national_id)
  where national_id is not null;

-- 2. 收緊欄位級更新授權：移除 national_id
revoke update on public.profiles from authenticated;
grant update (name, phone, birth_date, bank_code, bank_account)
  on public.profiles to authenticated;

-- 3. 不可變 trigger
create or replace function public.enforce_national_id_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.national_id is not null
     and new.national_id is distinct from old.national_id then
    raise exception '身分證字號一經設定不可變更（national_id immutable）'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_national_id_immutable on public.profiles;
create trigger trg_national_id_immutable
  before update on public.profiles
  for each row execute function public.enforce_national_id_immutable();

revoke execute on function public.enforce_national_id_immutable() from anon, authenticated, public;
