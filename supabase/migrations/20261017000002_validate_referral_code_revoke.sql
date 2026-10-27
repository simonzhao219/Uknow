-- ============================================================
-- validate_referral_code 收回 anon／authenticated 的 EXECUTE
-- （見 referral-validate.test.ts）。
--
-- 20260620000003 把它 grant 給 anon、authenticated，20260620000008 也註明
-- 是「註冊驗證」用的刻意對外暴露——當時前端直接打 RPC。現在唯一呼叫者是
-- Edge Function（service_role）：GET /referrals/validate/:code 已改成需登入
-- ＋per 使用者限流＋回應不帶推薦人 id。這個 grant 留著，等於在 PostgREST
-- 上保留一條繞道：拿前端公開的 anon key 打 /rest/v1/rpc/validate_referral_code，
-- 就能匿名、無限流地逐號（推薦碼是流水號）枚舉推薦人真名與 referrer_user_id。
--
-- 函式本體不動；觸發器與其他 security definer 函式以 owner 身分呼叫，不受影響。
-- ============================================================

revoke execute on function public.validate_referral_code(text) from anon, authenticated, public;
