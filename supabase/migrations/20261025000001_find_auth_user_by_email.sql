-- ============================================================
-- find_auth_user_by_email：以 email 精確查 auth.users，只給 service_role
-- （見 check-email-lookup.test.ts）。/auth/check-email 與之後的 Email 邀請
-- 端點共用。
--
-- 為什麼不再用 GoTrue admin API：
-- 1. /auth/check-email 原本打 `admin/users?page=1&per_page=50&search=<email>`，
--    但 GoTrue 的 list users 從沒讀過 `search`：未知參數被忽略，回的是預設排序
--    （created_at desc）的第一頁，也就是最新建立的 50 位。比對只在這一頁裡做，
--    第 51 位以前註冊的會員一律被判不存在、被前端送去「設定密碼」重跑 signUp。
--    本機 gotrue v2.197.0 實測：帶 `search=<email>` 與不帶任何參數回的是同一頁。
-- 2. GoTrue 讀的是 `filter`，那是子字串比對＋分頁（實測 `filter=probe-` 回滿
--    一頁 50 筆），沒有「以 email 精確查一位」的 admin 端點——要查對就得自己
--    翻頁，每次請求的成本隨會員數成長。
-- 3. Email 邀請要判斷帳號狀態（設過密碼沒有、邀請／驗證信寄過沒有）。admin API
--    的使用者物件不帶任何「是否設過密碼」的資訊，invited_at 等欄位為空時直接
--    省略，而且要先找到人才查得到（又回到第 2 點）。直接讀 auth.users 一次命中。
--
-- 只回下列欄位，不回其他個資。只給 service_role：對 anon／authenticated 開放，
-- 等於在 PostgREST 上開一個無限流的帳號枚舉入口。
--
-- 更正：20260720000002_rate_limits.sql 檔頭說 check-email「每次呼叫以 service
-- role 打一次 auth admin API」——自本 migration 起改為一次 RPC 查詢。
-- ============================================================

create or replace function public.find_auth_user_by_email(p_email text)
returns table (
  id uuid,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_sent_at timestamptz,
  last_sign_in_at timestamptz,
  has_password boolean,
  referral_invite jsonb
)
language sql security definer set search_path = public stable
as $$
  select u.id, u.email_confirmed_at, u.invited_at, u.confirmation_sent_at, u.last_sign_in_at,
         coalesce(u.encrypted_password, '') <> '' as has_password,
         u.raw_app_meta_data -> 'referral_invite' as referral_invite
  from auth.users u
  where lower(u.email) = lower(p_email)
    and u.deleted_at is null
$$;

revoke execute on function public.find_auth_user_by_email(text) from anon, authenticated, public;
grant execute on function public.find_auth_user_by_email(text) to service_role;
