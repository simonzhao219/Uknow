-- ============================================================
-- Uknow — effective_registration_step：資料未填齊時回 0（修復空白結帳頁）
-- ============================================================
--
-- 背景 / bug：
--   使用者「建立帳號 + 通過 Email 驗證」後，尚未填寫姓名/生日/身分證/手機
--   （完善個人資料那一步），卻被直接帶到「完成付款」頁，且「註冊資訊確認」
--   區塊除了 Email 之外全是空白。
--
-- 根因：
--   前端漏斗（AuthPage / OTPVerificationPage / CompleteProfile / PaymentCheckout）
--   是以「4 態」設計的——
--     0 = 帳號已建立、基本資料未填
--     1 = 基本資料已填、待付款
--     2 = 付款中
--     3 = 完成
--   並在 registrationFlow.ts 用 step 0 決定「該回完善資料頁」。
--
--   但後端 effective_registration_step()（migration 0011）在「沒有任何
--   payment_orders」時一律回 1，從不回 0——它的註解說要「沿用
--   profiles.registration_step 的『基本資料已填』語意」，實作卻沒有真的去讀
--   profiles 的欄位。加上 profiles.registration_step 本身 default 1、
--   check in (1,2,3)（初始 schema），系統裡「資料未填」這個狀態根本無法被表達。
--
--   結果：剛註冊、資料全空的使用者 effective step = 1 →
--   resolvePostLoginAction(1) → /payment/checkout，而結帳頁守衛
--   resolveCheckoutPageRedirect 看到 step=1（truthy）不會把他導回填資料頁，
--   於是卡在空白的結帳頁。CompleteProfile 頁守衛同理，看到 step 1 也會把
--   他再彈去結帳頁，形成死巷。
--
-- 修法：
--   讓 effective_registration_step 的「沒有訂單」分支，真正依照 profiles 的
--   基本資料是否填齊來回傳——填齊 → 1、未填齊 → 0。與前端
--   isProfileComplete()（name && phone && birthDate）採同一套定義，讓「基本
--   資料是否填完」在前後端只有一個真相來源。
--
--   注意：本函式回傳的是「即時計算值」，不寫回 profiles.registration_step
--   欄位，因此不受該欄位 check (1,2,3) 限制，可安全回傳 0。
-- ============================================================

create or replace function public.effective_registration_step(p_user_id uuid)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.payment_orders
      where user_id = p_user_id and status = 'completed'
    ) then 3
    when exists (
      select 1 from public.payment_orders
      where user_id = p_user_id and status = 'pending'
    ) then 2
    -- 沒有任何訂單：依「基本資料是否填齊」決定 1 或 0。
    -- 與前端 isProfileComplete 同義：name / phone / birth_date 三者皆有值。
    -- handle_new_user 會把 name 塞成空字串 ''、phone 塞 null，故要同時排除
    -- null 與空字串，否則剛註冊的使用者仍會被當成「已填」。
    when exists (
      select 1 from public.profiles
      where id = p_user_id
        and coalesce(name, '')       <> ''
        and coalesce(phone, '')      <> ''
        and birth_date is not null
    ) then 1
    else 0
  end;
$$;

grant execute on function public.effective_registration_step(uuid) to authenticated, service_role;
