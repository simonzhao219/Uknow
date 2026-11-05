-- ============================================================
-- 新約換線意圖改存訂單（第 5 波 S6 階段 2；稽核 ref P0-1＝pay P0-1、pay P1-1、pay P1-4；
-- 見 renewal-referrer-intent.test.ts）
-- ============================================================
-- 紅燈 stub：欄位與六參數版建單 RPC 先到位（行為同舊版），綠燈階段補實作。
-- ============================================================

alter table public.payment_orders
  add column if not exists fresh_referrer_user_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists fresh_referrer_code text,
  add column if not exists fresh_referrer_source text
    check (fresh_referrer_source in ('code', 'default', 'keep'));

create or replace function public.prepare_payment_order(
  p_user_id          uuid,
  p_trade_no         text,
  p_renewal_mode     text,
  p_referrer_user_id uuid,
  p_referrer_code    text,
  p_referrer_source  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suspended timestamptz;
begin
  select suspended_at into v_suspended
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_suspended is not null then
    return jsonb_build_object('outcome', 'suspended');
  end if;
  if exists (
    select 1 from public.user_account_status
    where user_id = p_user_id and status = 'active'
  ) then
    return jsonb_build_object('outcome', 'active');
  end if;
  begin
    insert into public.payment_orders
      (user_id, amount, status, payment_method, transaction_id, renewal_mode,
       fresh_referrer_user_id, fresh_referrer_code, fresh_referrer_source)
    values
      (p_user_id, 1200, 'pending', 'payuni', p_trade_no, p_renewal_mode,
       p_referrer_user_id, p_referrer_code, p_referrer_source);
  exception when unique_violation then
    return jsonb_build_object('outcome', 'duplicate_trade_no');
  end;
  return jsonb_build_object('outcome', 'ok');
end;
$$;

revoke execute on function public.prepare_payment_order(uuid, text, text, uuid, text, text)
  from anon, authenticated, public;
grant execute on function public.prepare_payment_order(uuid, text, text, uuid, text, text)
  to service_role;
