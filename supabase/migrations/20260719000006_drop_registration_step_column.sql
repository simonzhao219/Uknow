-- ============================================================
-- Uknow — 移除「會說謊的」profiles.registration_step 欄位
-- ============================================================
--
-- 背景（承 0005 的加註）：註冊進度的真相來源自 0011 起已是即時計算的
-- effective_registration_step()（0004 修正為「資料未填齊回 0」），前端讀到的
-- registrationStep 一律來自該函式。profiles.registration_step 這個手動維護的
-- 欄位早已沒有任何授權決策在讀，卻仍被寫入、且 check(1,2,3) 連 0 都無法表達
-- ——是一個語意與系統分歧的「會說謊的欄位」，留著就是下一次「step 與實際
-- 資料不一致」事故的種子。
--
-- 本次「真的移除」它，而不只是加註：
--   1. 先把唯一還在寫它的 SQL 函式 process_successful_payment 重建為「不再
--      寫 registration_step」（其餘邏輯逐字保留 0718 版本，只刪掉那一段
--      `update profiles set registration_step = 3`）。
--      —— 必須先於 drop column，否則下一筆付款執行到該行會因欄位不存在而
--         整筆付款失敗。
--   2. 再 drop 欄位（連帶移除 default 與 check 約束）。
--
--   TS 端（同 PR）：/auth/register 不再寫 registration_step、除錯端點不再回
--   registrationStepStored。handle_new_user 本來就沒寫這欄（靠 default），
--   移除 default 後 insert 仍正常。
-- ============================================================

-- ------------------------------------------------------------
-- 1. process_successful_payment：逐字保留 0718 版本，只移除對已移除欄位
--    registration_step 的寫入（原本的「7. 更新 registration_step = 3」）。
--    其餘（鎖、冪等、關鍵路徑先行、效期錨定、周邊隔離）完全不變。
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
  -- 0. 鎖住這筆訂單，序列化同一筆 p_trade_no 的並行呼叫（notify webhook
  --    與 return 導回幾乎同時到達、或 PayUni 對 notify 重試時）。
  --    /payuni/prepare 一定先把訂單以 'pending' 寫入，使用者才會被導去
  --    PayUni，所以走到這裡這筆列必定存在。拿到鎖之後才檢查冪等，確保
  --    並行呼叫一定排隊而不是同時通過檢查。
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

  -- 效期錨點：付款成功時點是 SSOT。extend（續約）接續前一筆訂閱最後
  -- 一天的隔天；fresh / null（新約、首次付款）從付款日（台灣日曆日）
  -- 起算。extend 的合理性（接續後效期仍在未來）由 /payuni/prepare 在
  -- 建單時把關，這裡字面執行。
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
  --    completed_at 記「付款成功的時點」，不是本函數執行的時點。
  update public.payment_orders
  set status          = 'completed',
      payment_method  = 'payuni',
      payuni_response = p_payuni_response,
      completed_at    = v_paid_at
  where id = v_order_id;

  -- （原「更新 registration_step = 3」已移除：該欄位已停用並在本 migration
  --   一併 drop。註冊完成與否一律由 effective_registration_step 即時算出。）

  -- 3. 周邊業務邏輯：這裡出錯只留 warning + system_alerts，不會讓上面
  --    已經寫入的付款完成事實被回滾。
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

-- ------------------------------------------------------------
-- 2. 移除欄位（連帶 default 與 check(1,2,3) 約束）。
--    此時已無任何 SQL 函式寫它；TS 端在同 PR 一併移除寫入/讀取。
-- ------------------------------------------------------------
alter table public.profiles drop column if exists registration_step;
