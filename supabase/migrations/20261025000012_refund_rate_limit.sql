-- ============================================================
-- refund_rate_limit：把 bump_rate_limit 扣過的計數退回一格
-- （見 refund-rate-limit.test.ts）。
--
-- Email 邀請在「信沒寄出」時要把推薦人自己的額度（target 與 per-user 兩窗）
-- 退回，只退本請求 bump 回 allowed 的鍵；全站兩窗一律不退（業主裁決 A）。
-- 不用 delete 整列：全站鍵的列記著所有人的計數，刪列等於歸零。
--
-- 原子的 count - 1，count > 0 守住不為負。窗口已在 bump 與退回之間翻轉時，
-- 會退到新窗口的計數（少算一次），接受。key 不存在時什麼都不做。
-- ============================================================

create or replace function public.refund_rate_limit(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rate_limits set count = count - 1 where key = p_key and count > 0;
$$;

revoke execute on function public.refund_rate_limit(text) from anon, authenticated, public;
grant execute on function public.refund_rate_limit(text) to service_role;
