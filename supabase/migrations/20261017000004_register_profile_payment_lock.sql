-- ============================================================
-- register_profile:Step 2 資料寫入與付款完成序列化
-- ============================================================
--
-- 為什麼:`POST /auth/register` 必須拒絕「註冊已完成」(effective_registration_step
-- = 3)的會員——身分證字號是經營權與提領身分核對的唯一鍵、推薦人送出前已確認
-- 「永久綁定」、姓名是提領人工核對的依據。
--
-- 只在 Edge Function 裡「先讀進度、再 UPDATE」擋不住付款同時完成:
-- process_successful_payment 對該使用者的 profiles 列 for update、持有到 commit
-- (20260802000001 的 user 層級鎖)。守衛讀到 step 2 之後,UPDATE 被這把鎖擋住,
-- 付款 commit 後照樣寫進去——訂單已 completed、資料卻被改寫(本機重現:付款交易
-- 持鎖期間送出 register,回 200 並改寫姓名與身分證)。被改的 referred_by_* 會在
-- 下一次 extend 續約時由 apply_referral_side_effects rewire 推薦邊,等於繞過
-- fresh 換線的帳本規則(§6.2)。用腳本在付款期間連續送出即可命中,不需精準時序。
--
-- 修法:檢查與寫入搬進同一個交易,先取得**同一把** profiles 列鎖,再查進度、
-- 再寫。付款進行中時本函式等鎖;拿到鎖時付款已 commit,下一個敘述(VOLATILE
-- 函式在 READ COMMITTED 下每個敘述取新 snapshot)看得到 completed 訂單 → 拒絕。
--
-- 鎖序:本函式只鎖 profiles、讀 payment_orders 不加鎖;付款是 payment_orders →
-- profiles。沒有環,不會死結。
--
-- 推薦碼解析、欄位格式驗證留在 Edge Function(呼叫端傳入已解析的推薦人)。
--
-- 回傳:'ok' 已寫入|'completed' 註冊已完成,未寫入|'not_found' 無 profile。
-- ============================================================

create or replace function public.register_profile(
  p_user_id             uuid,
  p_name                text,
  p_phone               text,
  p_birth_date          date,
  p_national_id         text,
  p_referred_by_code    text,
  p_referred_by_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 與 process_successful_payment 的 0b 同一把鎖
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    return 'not_found';
  end if;

  if public.effective_registration_step(p_user_id) = 3 then
    return 'completed';
  end if;

  -- registration_step 已棄用(20260719000005),照舊寫 1 只為維持既有行為。
  update public.profiles
  set name                = p_name,
      phone               = p_phone,
      birth_date          = p_birth_date,
      national_id         = p_national_id,
      registration_step   = 1,
      referred_by_code    = p_referred_by_code,
      referred_by_user_id = p_referred_by_user_id
  where id = p_user_id;

  return 'ok';
end;
$$;

-- security definer 且以參數指定 user_id:任何角色能執行就能改寫任何人的
-- 身分資料。只給 Edge Function 的 service_role。
revoke execute on function public.register_profile(uuid, text, text, date, text, text, uuid)
  from anon, authenticated, public;
grant execute on function public.register_profile(uuid, text, text, date, text, text, uuid)
  to service_role;
