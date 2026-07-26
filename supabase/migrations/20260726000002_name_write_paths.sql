-- ============================================================
-- 姓名寫入路徑收斂:撤銷自助 GRANT + trigger 不再從 metadata 帶入 name
-- ============================================================
--
-- 為什麼:`profiles.name` 是提領撥款時 admin 人工核對身分的依據
-- (`WithdrawalManagement` 的身分證檢視對話框把它與證件照並列)。
-- Edge Function 已加姓名格式驗證,但有兩條路徑完全繞過它:
--
--   (a) 0009 對 authenticated 開了 `grant update (name, ...)`,任何登入
--       使用者可直接打 `PATCH /rest/v1/profiles` 寫入任意姓名。
--   (b) `handle_new_user()` 把 `raw_user_meta_data ->> 'name'` 直接寫進
--       profiles。該 metadata 是**任何人**呼叫公開的 Auth `/signup` 端點時
--       可任意帶入的 `data` 參數(只需 anon key、免登入 token、免通過 OTP),
--       且函式是 `security definer`——以擁有者權限執行 INSERT,不受
--       authenticated 的欄位 GRANT 影響。
--
-- (b) 不堵的話 (a) 等於白堵,所以兩條一起收。收斂後 `profiles.name` 只能
-- 由 Edge Function(service_role)寫入,格式規則才真的有強制力。
--
-- 對正式使用者是**行為不變更**:`AuthPage.tsx` 的
-- `supabase.auth.signUp({ email, password })` 從未帶 `data.name`,該欄位在
-- 正式註冊流程本就恆為 undefined;姓名一律由 Step 2 的 `/auth/register` 寫入。
-- 受影響的只有刻意利用此機制的測試 helper(已同步改為 service_role 直寫)。
--
-- 不回溯校驗既有資料:既有的非中文姓名紀錄維持現狀(刻意的產品決策),
-- 本 migration 只改「今後能不能寫進來」。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 撤銷 name 的自助更新權限
--    0009 開放的理由是「混合模式——完善個人資料會是前端直接 update
--    profiles」,該前提已不成立:前端 supabase-js 直連只碰 listings /
--    public_listings,profiles 的寫入全部走 Edge Function。
--    其餘欄位(phone / birth_date / national_id / bank_code / bank_account)
--    的同類自助 GRANT **本次不動**,留待另案評估。
-- ------------------------------------------------------------
revoke update (name) on public.profiles from authenticated;

-- ------------------------------------------------------------
-- 2. handle_new_user:不再從 metadata 帶入 name
--
--    基準版本:20260620000009_auth_profile_hardening.sql
--    唯一差異:INSERT 的 name 欄位由
--               `coalesce(new.raw_user_meta_data ->> 'name', '')`
--             改為 `''`。
--    其餘(v_ref_code / v_referrer 的推薦碼解析、phone / national_id /
--    referred_by_code / referred_by_user_id 四個欄位、on conflict do
--    nothing、security definer、set search_path)**逐字照抄**——
--    `create or replace function` 是整段覆蓋,漏抄推薦碼解析會靜默清空
--    日後所有新註冊使用者的 referred_by_user_id。
--
--    註:phone / national_id 仍從 metadata 帶入。它們與 name 屬同一條
--    對外可達的注入路徑,但本次範圍只收 name,留待另案。
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
    -- 刻意不讀 raw_user_meta_data ->> 'name'：見檔頭 (b)。姓名一律由
    -- Step 2 的 /auth/register 以「已通過格式驗證」的值寫入。
    '',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'national_id',
    v_ref_code,
    v_referrer
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- `create or replace function` 保留既有權限,故此行嚴格說並非必要;
-- 照抄 0009 是為了讓本 migration 自成完整敘述(讀這一份就知道最終狀態)。
revoke execute on function public.handle_new_user() from anon, authenticated, public;
