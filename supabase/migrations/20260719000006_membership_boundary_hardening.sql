-- ============================================================
-- Uknow — 0719 0006 會籍/續約邊界硬化（M5、M6）
-- ============================================================
--
-- M5：claim_referral_king_reward 的免費續約一年，原本字面地把「原最後
--     一天 + 1 年」寫回 end_date；若在已過期的訂閱上領取，新效期可能整段
--     落在過去，credit 被消耗卻延展不到可用的一年。改為錨定
--     greatest(原最後一天, 今日)：訂閱仍有效時維持接續（與舊語意相同、
--     測試不變）；已過期時從今日起算一整年，讓免費續約真的可用。
--
-- M6：process_successful_payment 的 extend 分支原本完全信任 /payuni/prepare
--     的預檢字面執行。補一道伺服器端縱深防禦：若 extend 算出的效期已在
--     過去（理論上 prepare 應已擋），退回 fresh（付款日錨定）並記告警，
--     避免使用者付了錢效期仍在過去。維持現行「約 1 年內可 extend」界線。
-- ============================================================

-- ------------------------------------------------------------
-- 1. process_successful_payment（基準 0718 0001，僅加 M6 縱深防禦）
-- ------------------------------------------------------------
create or replace function public.process_successful_payment(
  p_user_id         uuid,
  p_trade_no        text,
  p_transaction_id  text,
  p_payuni_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id         uuid;
  v_order_status     text;
  v_renewal_mode     text;
  v_order_created_at timestamptz;
  v_paid_at          timestamptz;
  v_anchor_day       date;
  v_prev_end         timestamptz;
  v_start            timestamptz;
  v_end              timestamptz;
  v_grace            timestamptz;
  v_sub_id           uuid;
  v_is_renewal       boolean;
  v_side_effects     jsonb;
begin
  select id, status, renewal_mode, created_at
    into v_order_id, v_order_status, v_renewal_mode, v_order_created_at
  from public.payment_orders
  where transaction_id = p_trade_no
    and user_id = p_user_id
  for update;

  if v_order_id is null then
    raise exception '找不到對應的 payment_orders（trade_no=%, user_id=%）', p_trade_no, p_user_id;
  end if;

  if v_order_status = 'completed' then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  v_is_renewal := exists (select 1 from public.subscriptions where user_id = p_user_id);

  v_paid_at    := public.payuni_paid_at(p_payuni_response, coalesce(v_order_created_at, now()));
  v_anchor_day := public.tw_day(v_paid_at);
  if v_renewal_mode = 'extend' then
    select max(end_date) into v_prev_end
    from public.subscriptions
    where user_id = p_user_id;
    if v_prev_end is not null then
      v_anchor_day := public.tw_day(v_prev_end) + 1;
    end if;
  end if;

  select * into v_start, v_end, v_grace
  from public.compute_subscription_period(v_anchor_day);

  -- M6 縱深防禦：extend 若算出效期已在過去（prepare 預檢理應已擋），退回
  -- fresh（付款日錨定）並記告警，不讓使用者付了錢卻拿到過去的效期。
  if v_renewal_mode = 'extend' and v_end <= now() then
    perform public.log_system_alert('process_successful_payment', 'warning',
      'extend 算出的效期落在過去，改以付款日錨定（fresh）',
      jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                         'prev_end', v_prev_end, 'computed_end', v_end));
    v_anchor_day := public.tw_day(v_paid_at);
    select * into v_start, v_end, v_grace
    from public.compute_subscription_period(v_anchor_day);
  end if;

  insert into public.subscriptions (
    user_id, start_date, end_date, grace_period_end,
    amount, payment_method, payment_transaction_id, is_renewal,
    source_payment_order_id
  )
  values (
    p_user_id, v_start, v_end, v_grace,
    1200, 'payuni', p_transaction_id, v_is_renewal, v_order_id
  )
  returning id into v_sub_id;

  update public.payment_orders
  set status          = 'completed',
      payment_method  = 'payuni',
      payuni_response = p_payuni_response,
      completed_at    = v_paid_at
  where id = v_order_id;

  update public.profiles
  set registration_step = 3
  where id = p_user_id;

  begin
    select public.apply_referral_side_effects(p_user_id, v_sub_id) into v_side_effects;
  exception when others then
    perform public.log_system_alert('process_successful_payment', 'warning', sqlerrm,
      jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id, 'subscription_id', v_sub_id));
    raise warning 'process_successful_payment：推薦碼/獎勵處理失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
  end;

  return jsonb_build_object(
    'success',          true,
    'subscription_id',  v_sub_id,
    'referral_code_id', v_side_effects ->> 'referral_code_id'
  );

exception when others then
  raise exception 'process_successful_payment 失敗: %', sqlerrm;
end;
$$;

revoke execute on function public.process_successful_payment(uuid, text, text, jsonb) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 2. claim_referral_king_reward（基準 0718 0001，僅加 M5 future-date 保護）
-- ------------------------------------------------------------
create or replace function public.claim_referral_king_reward(
  p_user_id   uuid,
  p_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_user_id uuid;
  v_reward_status  text;
  v_sub_id         uuid;
  v_old_end        timestamptz;
  v_base_day       date;
  v_new_last_day   date;
  v_new_end        timestamptz;
  v_new_grace      timestamptz;
begin
  select user_id, status into v_reward_user_id, v_reward_status
  from public.referral_king_rewards
  where id = p_reward_id
  for update;

  if v_reward_user_id is null then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到這筆獎勵紀錄');
  end if;

  if v_reward_user_id <> p_user_id then
    return jsonb_build_object('success', false, 'error_code', 'forbidden', 'message', '這筆獎勵不屬於你');
  end if;

  if v_reward_status = 'claimed' then
    return jsonb_build_object('success', true, 'idempotent', true, 'status', 'claimed');
  end if;

  select id, end_date into v_sub_id, v_old_end
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1
  for update;

  if v_sub_id is null then
    return jsonb_build_object('success', false, 'error_code', 'no_subscription', 'message', '找不到可延展的訂閱紀錄，請聯繫客服');
  end if;

  -- M5：錨定 greatest(原最後一天, 今日)。訂閱仍有效時 = 原最後一天（接續，
  -- 與舊語意/測試相同）；已過期時 = 今日，讓免費續約一年從今日起可用，
  -- 不再字面延展一段落在過去的效期。
  v_base_day     := greatest(public.tw_day(v_old_end), public.tw_day(now()));
  v_new_last_day := (v_base_day + interval '1 year')::date;
  v_new_end      := public.tw_end_of_day(v_new_last_day);
  v_new_grace    := public.tw_end_of_day(v_new_last_day + 60);

  update public.subscriptions
  set end_date = v_new_end, grace_period_end = v_new_grace
  where id = v_sub_id;

  update public.referral_king_rewards
  set status = 'claimed', claimed_at = now(), resulting_subscription_id = v_sub_id
  where id = p_reward_id;

  return jsonb_build_object(
    'success',        true,
    'subscriptionId', v_sub_id,
    'activeUntil',    v_new_end,
    'gracePeriodEnd', v_new_grace
  );

exception when others then
  raise exception 'claim_referral_king_reward 失敗: %', sqlerrm;
end;
$$;

revoke execute on function public.claim_referral_king_reward(uuid, uuid) from anon, authenticated, public;
