-- ============================================================
-- process_successful_payment：重複付款偵測＋付款途中停權告警
-- （第 5 波 S2 階段 7；稽核 pay P1-2、裁決 W5-11、W5-13、W5-14；見 duplicate-payment.test.ts）
-- ============================================================
--
-- 為什麼：同一人兩分頁各建一張單、兩邊都付成功（Apple／Google Pay 一鍵即可）時，
-- 第二筆 null／fresh 從付款日再起算一年、與第一筆幾乎完全重疊——付 2,400 只得一年，
-- fresh×2 還會再清一次帳本，全程沒有告警。prepare 不作廢舊單（舊單的 PayUni 頁在
-- ExpireDate 前仍可付，作廢只會讓對帳不再追它），防線放在付款時點。
--
-- 基準 = 20260802000002_fresh_ledger_forfeit.sql（現行權威版），差異：
--   0c. 新增：付款當下（v_paid_at）已有 end_date ≥ v_paid_at 的訂閱 → v_duplicate。
--       錨點改用 extend 算法（接續 max(end_date)）——錢已收，給足效期。
--   3-0. fresh 清帳本加 `and not v_duplicate`：重複的新約不再清一次帳本。
--   4. 新增告警（皆在獎金之後、各自 begin…exception 隔離，失敗不回滾付款）：
--      duplicate_payment——null／fresh 為 error、extend（一次付多年，預付語意正確）為
--      warning；context 帶兩筆 trade_no、新效期與本筆 subscription 的獎金列（W5-13：
--      獎金照發，客服退款時人工沖銷）。
--      payment_while_suspended（W5-14）——建單後才被停權者照開通，寫 error。
--   鎖：不新增任何鎖（0／0b 的 order → profiles 不變）。
-- ============================================================

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
  v_forfeit_amount   integer;
  v_reset_month_key  text;
  v_duplicate        boolean;
  v_prev_trade_no    text;
  v_suspended_at     timestamptz;
begin
  -- 0. 鎖住這筆訂單，序列化同一筆 p_trade_no 的並行呼叫（notify webhook
  --    與 return 導回幾乎同時到達、或 PayUni 對 notify 重試時）。
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

  -- 0b. user 層級鎖：序列化「同一使用者」的所有付款完成流程。上面的訂單
  --     鎖只擋同一筆 trade_no 的重複呼叫，擋不住同一人「兩筆不同訂單」
  --     併發完成——那會讓下面的 max(end_date) 被讀到同一個值、算出相同
  --     效期。鎖序：先 payment_orders（各筆不同）→ 後 profiles（同一列），
  --     與 apply_referral_side_effects 內的 profiles 鎖同列可重入。
  perform 1 from public.profiles where id = p_user_id for update;

  v_is_renewal := exists (select 1 from public.subscriptions where user_id = p_user_id);

  -- 效期錨點：付款成功時點是 SSOT。extend（續約）接續前一筆訂閱最後
  -- 一天的隔天；fresh / null（新約、首次付款）從付款日（台灣日曆日）
  -- 起算。
  v_paid_at    := public.payuni_paid_at(p_payuni_response, coalesce(v_order_created_at, now()));
  v_anchor_day := public.tw_day(v_paid_at);

  -- 0c. 重複付款偵測（pay P1-2）：付款當下此人已在效期內 = 這張單是在變成 active
  --     之前建的、現在又付了一次（prepare 對 active 者回 400）。用付款時點而非 now()：
  --     對帳延遲開通時要問的是「付款那一刻是否已有效」。純讀＋算術，在 0b 的鎖內。
  v_duplicate := exists (
    select 1 from public.subscriptions
    where user_id = p_user_id and end_date >= v_paid_at
  );

  if v_renewal_mode = 'extend' or v_duplicate then
    select max(end_date) into v_prev_end
    from public.subscriptions
    where user_id = p_user_id;
    if v_prev_end is not null then
      v_anchor_day := public.tw_day(v_prev_end) + 1;
    end if;
  end if;

  select * into v_start, v_end, v_grace
  from public.compute_subscription_period(v_anchor_day);

  -- 1. 建立訂閱
  insert into public.subscriptions (
    user_id, start_date, end_date, grace_period_end,
    amount, payment_method, payment_transaction_id, is_renewal,
    source_payment_order_id
  )
  values (
    p_user_id,
    v_start,
    v_end,
    v_grace,
    1200,
    'payuni',
    p_transaction_id,
    v_is_renewal,
    v_order_id
  )
  returning id into v_sub_id;

  -- 2. 關鍵路徑：立刻標記付款完成，不等周邊業務邏輯跑完。
  update public.payment_orders
  set status          = 'completed',
      payment_method  = 'payuni',
      payuni_response = p_payuni_response,
      completed_at    = v_paid_at
  where id = v_order_id;

  update public.profiles
  set registration_step = 3
  where id = p_user_id;

  -- 3-0. fresh 清空帳本（A13）：選新約且非首購 → 付款成功當下清空。
  --      周邊隔離：這裡失敗只留 warning + system_alerts（context 帶失敗
  --      當下的金額快照，是 repair_orphaned_forfeitures 唯一的補沖依據），
  --      絕不回滾上面已寫入的付款完成事實。
  if v_renewal_mode = 'fresh' and v_is_renewal and not v_duplicate then
    begin
      select greatest(coalesce(sum(amount), 0), 0) into v_forfeit_amount
      from public.reward_transactions
      where user_id = p_user_id;

      -- 冪等：本次 subscription_id 已有沖銷列就不再插（重放保險；正常
      -- 路徑靠訂單 completed 短路就進不來）。
      if not exists (
        select 1 from public.reward_transactions
        where user_id = p_user_id and type = 'ledger_reset' and subscription_id = v_sub_id
      ) then
        insert into public.reward_transactions
          (user_id, type, amount, subscription_id, description)
        values
          (p_user_id, 'ledger_reset', -v_forfeit_amount, v_sub_id, '新約重置：帳本清空');
      end if;

      -- 任務：total 歸 0、刪「當月」桶（key 沿用 apply_referral_side_effects
      -- 的同一運算式）；其餘月份桶原樣保留（歷史桶 = pair-history）。
      v_reset_month_key := to_char(v_paid_at at time zone 'Asia/Taipei', 'YYYY-MM');
      update public.task_progress
      set total_referrals   = 0,
          monthly_referrals = monthly_referrals - v_reset_month_key,
          updated_at        = now()
      where user_id = p_user_id;
    exception when others then
      perform public.log_system_alert('fresh_ledger_forfeit', 'warning', sqlerrm,
        jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                           'subscription_id', v_sub_id,
                           'forfeit_amount', v_forfeit_amount));
      raise warning 'process_successful_payment：fresh 清空帳本失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
    end;
  end if;

  -- 3. 周邊業務邏輯：這裡出錯只留 warning + system_alerts，不會讓上面
  --    已經寫入的付款完成事實被回滾。月份 key 錨定付款時點。
  begin
    select public.apply_referral_side_effects(p_user_id, v_sub_id, v_paid_at) into v_side_effects;
  exception when others then
    perform public.log_system_alert('process_successful_payment', 'warning', sqlerrm,
      jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id, 'subscription_id', v_sub_id));
    raise warning 'process_successful_payment：推薦碼/獎勵處理失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
  end;

  -- 4. 告警（W5-13、W5-14）：每段自己隔離，任何失敗都不回滾已完成的付款。
  if v_duplicate then
    begin
      select po.transaction_id into v_prev_trade_no
      from public.payment_orders po
      where po.user_id = p_user_id and po.status = 'completed' and po.id <> v_order_id
      order by po.completed_at desc nulls last
      limit 1;

      perform public.log_system_alert(
        'duplicate_payment',
        case when v_renewal_mode = 'extend' then 'warning' else 'error' end,
        case when v_renewal_mode = 'extend'
          then '付款當下已在效期內的續約付款：已串接效期（一次付了多年），請確認是否為誤付'
          else '重複付款：付款當下已在效期內，已改以續約錨點接續並略過新約清帳本，請客服確認是否退款（退款時人工沖銷 rewards）'
        end,
        jsonb_build_object(
          'trade_no', p_trade_no,
          'user_id', p_user_id,
          'renewal_mode', v_renewal_mode,
          'previous_trade_no', v_prev_trade_no,
          'subscription_id', v_sub_id,
          'start_date', v_start,
          'end_date', v_end,
          'rewards', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', rt.id, 'user_id', rt.user_id, 'generation', rt.generation, 'amount', rt.amount
            ) order by rt.generation)
            from public.reward_transactions rt
            where rt.subscription_id = v_sub_id and rt.type = 'referral_reward'
          ), '[]'::jsonb)
        ));
    exception when others then
      raise warning 'process_successful_payment：重複付款告警失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
    end;
  end if;

  begin
    select suspended_at into v_suspended_at from public.profiles where id = p_user_id;
    if v_suspended_at is not null then
      perform public.log_system_alert('payment_while_suspended', 'error',
        '停權者的付款已開通（建單後才被停權）：請客服確認處理方式',
        jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                           'suspended_at', v_suspended_at, 'subscription_id', v_sub_id));
    end if;
  exception when others then
    raise warning 'process_successful_payment：停權付款告警失敗（付款本身已完成，trade_no=%）: %', p_trade_no, sqlerrm;
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
