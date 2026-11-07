-- ============================================================
-- prepare_payment_order：/payuni/prepare 的建單 RPC
-- （第 5 波 S2 階段 5；稽核 pay P1-2、W5-5，見 prepare-payment-order.test.ts）
-- ============================================================
--
-- 為什麼：Edge 先讀「是否 active」再 INSERT 訂單，兩步之間沒有鎖——付款完成
-- （process_successful_payment）落在中間時，已 active 的人又多一張可付的單；
-- 停權也只能在 Edge 讀一次，讀完到建單之間被停權照樣建單。
--
-- 修法：停權與 active 的重查和 INSERT 收進同一個交易、同一把 profiles 列鎖
-- （與 process_successful_payment 的 0b、register_profile 同一把）。付款交易持鎖
-- 期間本函式等鎖；拿到鎖時付款已 commit，下一個敘述讀到 active → 拒絕。
--
-- 鎖序：本函式只鎖 profiles，之後只 INSERT 新訂單（不等任何既有訂單列鎖）；
-- 付款是 payment_orders → profiles。沒有環，不會死結。
--
-- 不作廢舊 pending 單：舊單的 PayUni 頁在 ExpireDate 前仍可付，DB 作廢擋不住
-- 付款，反而讓對帳（只追 pending）不再追它 → 付了錢卻永不開通。重複付款的
-- 防線在付款時點（process_successful_payment，見 20261111000003）。
--
-- 回傳：'ok' 已建單｜'not_found' 無 profile｜'suspended' 停權（先於 active，
-- 規格書 §5.3 停權優先擋）｜'active' 會籍有效｜'duplicate_trade_no' tradeNo 撞號
-- （由 Edge 重產再試）。active 判準讀 user_account_status，與 Edge readAccountStatus
-- 同一個 view。
-- ============================================================

create or replace function public.prepare_payment_order(
  p_user_id      uuid,
  p_trade_no     text,
  p_renewal_mode text
)
returns text
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
    return 'not_found';
  end if;

  if v_suspended is not null then
    return 'suspended';
  end if;

  if exists (
    select 1 from public.user_account_status
    where user_id = p_user_id and status = 'active'
  ) then
    return 'active';
  end if;

  begin
    insert into public.payment_orders
      (user_id, amount, status, payment_method, transaction_id, renewal_mode)
    values
      (p_user_id, 1200, 'pending', 'payuni', p_trade_no, p_renewal_mode);
  exception when unique_violation then
    return 'duplicate_trade_no';
  end;

  return 'ok';
end;
$$;

-- security definer 且以參數指定 user_id：任何角色能執行就能替任何人建單。
-- 只給 Edge Function 的 service_role（security-definer-grants.test.ts 動態掃描守住）。
revoke execute on function public.prepare_payment_order(uuid, text, text)
  from anon, authenticated, public;
grant execute on function public.prepare_payment_order(uuid, text, text)
  to service_role;
