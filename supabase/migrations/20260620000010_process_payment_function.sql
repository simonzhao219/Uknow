-- ============================================================
-- Uknow 後端重構 — 0010 process_successful_payment()
-- ============================================================
--
-- 付款成功後的核心邏輯（原子性 — 全部成功或全部 rollback）：
--  1. 建立訂閱（一年期，寬限 60 天，不自動續扣）
--  2. 生成並寫入推薦碼
--  3. 建立 referral_edges（若有推薦來源）
--  4. 即時發清三代推薦獎勵（各 120 點 → reward_transactions）
--  5. 更新直接上線的 task_progress（推薦王計數）
--  6. 更新 payment_orders 為 completed
--  7. 更新 profiles.registration_step = 3
--
-- 安全：只允許 service_role / postgres 呼叫（Edge Function 透過 service_role）。
-- ============================================================

create or replace function public.process_successful_payment(
  p_user_id        uuid,
  p_trade_no       text,   -- 我們的 MerTradeNo（用來找 payment_orders）
  p_transaction_id text    -- PayUni 的 TradeNo（記錄用）
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id      uuid;
  v_ref_code    text;
  v_code_id     uuid;
  v_referrer1   uuid;
  v_referrer2   uuid;
  v_referrer3   uuid;
  v_month_key   text;
  v_rows        int;
begin
  -- 冪等性保護：訂單已完成就直接回傳
  select count(*) into v_rows
  from public.payment_orders
  where transaction_id = p_trade_no and user_id = p_user_id and status = 'completed';
  if v_rows > 0 then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  -- 1. 建立訂閱
  insert into public.subscriptions (
    user_id, start_date, end_date, grace_period_end,
    amount, payment_method, payment_transaction_id, is_renewal
  )
  values (
    p_user_id,
    now(),
    now() + interval '1 year',
    now() + interval '1 year' + interval '60 days',
    1200,
    'payuni',
    p_transaction_id,
    false
  )
  returning id into v_sub_id;

  -- 2. 生成推薦碼（呼叫 0001/0006 定義的函數）
  v_ref_code := public.generate_referral_code();
  insert into public.referral_codes (user_id, code, status, subscription_id)
  values (p_user_id, v_ref_code, 'active', v_sub_id)
  returning id into v_code_id;

  -- 3. 取得推薦來源（在 0009 的 handle_new_user trigger 中已記錄）
  select referred_by_user_id into v_referrer1
  from public.profiles
  where id = p_user_id;

  if v_referrer1 is not null then

    -- 3a. 建立推薦關係邊
    insert into public.referral_edges (referee_user_id, referrer_user_id, referral_code_id)
    values (p_user_id, v_referrer1, v_code_id)
    on conflict (referee_user_id) do nothing;

    -- 4a. 發第 1 代獎勵 120 點
    insert into public.reward_transactions
      (user_id, type, amount, generation, referee_user_id, description)
    values
      (v_referrer1, 'referral_reward', 120, 1, p_user_id, '推薦獎勵（第 1 代）');

    -- 5. 更新直接上線的 task_progress（推薦王：單月推薦數）
    v_month_key := to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM');
    insert into public.task_progress (user_id, total_referrals, monthly_referrals)
    values (
      v_referrer1,
      1,
      jsonb_build_object(v_month_key, jsonb_build_array(p_user_id::text))
    )
    on conflict (user_id) do update set
      total_referrals   = task_progress.total_referrals + 1,
      monthly_referrals = jsonb_set(
        task_progress.monthly_referrals,
        array[v_month_key],
        coalesce(task_progress.monthly_referrals -> v_month_key, '[]'::jsonb)
          || to_jsonb(p_user_id::text)
      ),
      updated_at = now();

    -- 4b. 找第 2 代
    select referrer_user_id into v_referrer2
    from public.referral_edges
    where referee_user_id = v_referrer1;

    if v_referrer2 is not null then
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, description)
      values
        (v_referrer2, 'referral_reward', 120, 2, p_user_id, '推薦獎勵（第 2 代）');

      -- 4c. 找第 3 代
      select referrer_user_id into v_referrer3
      from public.referral_edges
      where referee_user_id = v_referrer2;

      if v_referrer3 is not null then
        insert into public.reward_transactions
          (user_id, type, amount, generation, referee_user_id, description)
        values
          (v_referrer3, 'referral_reward', 120, 3, p_user_id, '推薦獎勵（第 3 代）');
      end if;
    end if;

  end if;

  -- 6. 更新 payment_orders
  update public.payment_orders
  set status         = 'completed',
      payment_method = 'payuni',
      transaction_id = p_transaction_id,
      completed_at   = now()
  where transaction_id = p_trade_no
    and user_id = p_user_id;

  -- 7. 更新 registration_step = 3（完整會員）
  update public.profiles
  set registration_step = 3
  where id = p_user_id;

  return jsonb_build_object(
    'success',          true,
    'subscription_id',  v_sub_id,
    'referral_code',    v_ref_code
  );

exception when others then
  raise exception 'process_successful_payment 失敗: %', sqlerrm;
end;
$$;

-- 只有 service_role / postgres 可呼叫（不對前端暴露）
revoke execute on function public.process_successful_payment(uuid, text, text) from anon, authenticated, public;
