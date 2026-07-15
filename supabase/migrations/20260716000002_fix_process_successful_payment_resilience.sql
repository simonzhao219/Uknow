-- ============================================================
-- Uknow 後端重構 — 0002 (0716) 修正 process_successful_payment
-- 卡單問題：付款完成永遠被周邊業務邏輯的例外拖累回滾
-- ============================================================
--
-- 背景：
-- 1. referral_codes 有 partial unique index（同一 user_id 同時只能有一筆
--    status='active'，見 0001）。但本函數過去每次成功付款都無條件
--    insert 一筆新的 active 推薦碼，從不檢查/停用舊碼，also 從不把
--    is_renewal 設成 true。只要使用者不是第一次付款（已有一筆 active
--    推薦碼），這個 insert 就會違反唯一性限制丟出例外。
-- 2. 函數尾端 `exception when others then raise exception` 會把整個
--    交易（包含把 payment_orders 標記為 completed 的那一步）全部回滾。
--    也就是說，只要「推薦碼/獎勵」這些周邊邏輯任何一步出錯（不管是
--    上述已知的續約衝突，還是未來任何新 bug），核心的「付款已完成」
--    事實就永遠寫不進去，使用者會卡在「款項確認中」，即使 PayUni
--    那邊已經授權成功。
--
-- 修正方向：
-- 1. 續約付款沿用既有的 active 推薦碼，不再無條件新增。
-- 2. 把「建立訂閱 + 標記付款完成」這段關鍵路徑，和「推薦碼/獎勵」這些
--    周邊業務邏輯拆開——周邊邏輯包在獨立的 exception 子區塊內，出錯只
--    留 warning log，不會讓已經成立的付款事實被回滾。
-- ============================================================

create or replace function public.process_successful_payment(
  p_user_id         uuid,
  p_trade_no        text,   -- 我們的 MerTradeNo（用來找 payment_orders）
  p_transaction_id  text,   -- PayUni 的 TradeNo（記錄於 subscriptions）
  p_payuni_response jsonb   -- PayUni webhook 完整解密後原始資料
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
  v_is_renewal  boolean;
begin
  -- 冪等性保護：訂單已完成就直接回傳
  select count(*) into v_rows
  from public.payment_orders
  where transaction_id = p_trade_no and user_id = p_user_id and status = 'completed';
  if v_rows > 0 then
    return jsonb_build_object('success', true, 'idempotent', true);
  end if;

  v_is_renewal := exists (select 1 from public.subscriptions where user_id = p_user_id);

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
    v_is_renewal
  )
  returning id into v_sub_id;

  -- 2. 關鍵路徑：立刻標記付款完成，不等周邊業務邏輯跑完。
  --    這行做完，付款這件事就算數，不會再被下面的推薦碼/獎勵邏輯拖累。
  update public.payment_orders
  set status          = 'completed',
      payment_method  = 'payuni',
      payuni_response = p_payuni_response,
      completed_at    = now()
  where transaction_id = p_trade_no
    and user_id = p_user_id;

  update public.profiles
  set registration_step = 3
  where id = p_user_id;

  -- 3. 周邊業務邏輯（推薦碼、推薦獎勵、任務進度）獨立包一層 exception，
  --    這裡出錯只留 warning，不會讓上面已經寫入的付款完成事實被回滾。
  begin
    -- 3a. 推薦碼：續約沿用既有的 active 碼，只有完全沒有時才產生新碼
    select id into v_code_id
    from public.referral_codes
    where user_id = p_user_id and status = 'active'
    limit 1;

    if v_code_id is null then
      v_ref_code := public.generate_referral_code();
      insert into public.referral_codes (user_id, code, status, subscription_id)
      values (p_user_id, v_ref_code, 'active', v_sub_id)
      returning id into v_code_id;
    end if;

    -- 3b. 取得推薦來源（在 0009 的 handle_new_user trigger 中已記錄）
    select referred_by_user_id into v_referrer1
    from public.profiles
    where id = p_user_id;

    if v_referrer1 is not null then

      -- 建立推薦關係邊
      insert into public.referral_edges (referee_user_id, referrer_user_id, referral_code_id)
      values (p_user_id, v_referrer1, v_code_id)
      on conflict (referee_user_id) do nothing;

      -- 發第 1 代獎勵 120 點
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, description)
      values
        (v_referrer1, 'referral_reward', 120, 1, p_user_id, '推薦獎勵（第 1 代）');

      -- 更新直接上線的 task_progress（推薦王：單月推薦數）
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

      -- 找第 2 代
      select referrer_user_id into v_referrer2
      from public.referral_edges
      where referee_user_id = v_referrer1;

      if v_referrer2 is not null then
        insert into public.reward_transactions
          (user_id, type, amount, generation, referee_user_id, description)
        values
          (v_referrer2, 'referral_reward', 120, 2, p_user_id, '推薦獎勵（第 2 代）');

        -- 找第 3 代
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

  exception when others then
    raise warning 'process_successful_payment：推薦碼/獎勵處理失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
  end;

  return jsonb_build_object(
    'success',          true,
    'subscription_id',  v_sub_id,
    'referral_code_id', v_code_id
  );

exception when others then
  raise exception 'process_successful_payment 失敗: %', sqlerrm;
end;
$$;

-- 只有 service_role / postgres 可呼叫（不對前端暴露）
revoke execute on function public.process_successful_payment(uuid, text, text, jsonb) from anon, authenticated, public;
