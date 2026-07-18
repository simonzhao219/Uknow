-- ============================================================
-- Uknow 後端重構 — 0001 (0718) 時間領域重設計：付款日 SSOT + 台灣日曆日
-- ============================================================
--
-- 業務規則（使用者拍板）：
--   1. 成功付款日 = 訂閱起始日。付款的「日」以台灣日曆日為準，來源是
--      PayUni 回應中的授權時間（AuthDay/AuthTime，台灣時區）——不管
--      開通（process_successful_payment）實際在哪一天執行。修正：
--      webhook 失敗、多日後登入自癒補開通的用戶，效期被錯誤地從
--      「開通日」起算。
--   2. 效期 = 起始日起「一年整」含頭尾：start 2026/7/16 → end 2027/7/15
--      （start + 1 年 − 1 天）。修正原本 start + 1 年的 off-by-one。
--   3. 所有訂閱邊界正規化到台灣日界：start = 台灣 00:00:00、
--      end/grace = 台灣 23:59:59.999999。任何時區的瀏覽器看到的日曆日
--      都一致，且 user_account_status 的 now() <= end_date 語意自然變成
--      「效期到最後一天整天（台灣時間）」——view 不需要改。
--
-- 本檔內容：
--   * tw_day / tw_start_of_day / tw_end_of_day —— SQL 端台灣日界 helpers
--   * compute_subscription_period —— 效期計算的唯一事實來源
--   * payuni_paid_at —— 從 PayUni 回應解析授權時點（含 fallback 鏈）
--   * process_successful_payment —— 改用付款日錨定（其餘逐字保留 0008）
--   * claim_referral_king_reward —— 免費續約一年改為日領域計算
--
-- 既有資料的修正在下一個 migration（backfill_time_domain）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 台灣日界 helpers。
--    注意一律用「timestamp AT TIME ZONE 'Asia/Taipei'」的形式，
--    不依賴 session timezone，也不用 +8 小時的手工偏移。
-- ------------------------------------------------------------

-- 某個時點落在台灣的哪個日曆日
create or replace function public.tw_day(p_at timestamptz)
returns date
language sql
immutable
as $$
  select (p_at at time zone 'Asia/Taipei')::date
$$;

-- 台灣某日的 00:00:00（回傳 timestamptz）
create or replace function public.tw_start_of_day(p_day date)
returns timestamptz
language sql
immutable
as $$
  select p_day::timestamp at time zone 'Asia/Taipei'
$$;

-- 台灣某日的 23:59:59.999999（回傳 timestamptz）
create or replace function public.tw_end_of_day(p_day date)
returns timestamptz
language sql
immutable
as $$
  select ((p_day + 1)::timestamp at time zone 'Asia/Taipei') - interval '1 microsecond'
$$;

-- ------------------------------------------------------------
-- 2. 效期計算的唯一事實來源。
--    錨定日 D → 最後一天 L = greatest((D + 1yr)::date − 1,
--    ((D−1) + 1yr)::date)。兩個分支平常相等（= D + 1 年 − 1 天）；
--    只有 2/29 起算時 Postgres 會把 +1yr 夾到 2/28，第一分支少一天，
--    greatest 取對用戶有利的那個（永遠不短於整年）。
--    grace = L + 60 天（從日領域重算，不是在 instant 上加 60 天）。
-- ------------------------------------------------------------
create or replace function public.compute_subscription_period(p_anchor_day date)
returns table (start_date timestamptz, end_date timestamptz, grace_period_end timestamptz)
language sql
immutable
as $$
  with last_day as (
    select greatest(
      (p_anchor_day + interval '1 year')::date - 1,
      ((p_anchor_day - 1) + interval '1 year')::date
    ) as d
  )
  select
    public.tw_start_of_day(p_anchor_day),
    public.tw_end_of_day(last_day.d),
    public.tw_end_of_day(last_day.d + 60)
  from last_day;
$$;

-- ------------------------------------------------------------
-- 3. 從 PayUni 回應解析「付款成功的時點」。
--    fallback 鏈：AuthDay+AuthTime（台灣時間）→ PayTime → p_fallback
--    （呼叫端傳訂單 created_at）→ now()。
--    合理性防呆：解析結果早於 fallback − 1 天、或晚於 now() + 2 天，
--    視為垃圾資料，改用 fallback——付款授權不可能早於建單、也不可能
--    在未來。
-- ------------------------------------------------------------
create or replace function public.payuni_paid_at(
  p_response jsonb,
  p_fallback timestamptz
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_day  text := nullif(trim(coalesce(p_response ->> 'AuthDay', '')), '');
  v_time text := nullif(trim(coalesce(p_response ->> 'AuthTime', '')), '');
  v_pay  text := nullif(trim(coalesce(p_response ->> 'PayTime', '')), '');
  v_ts   timestamptz;
begin
  begin
    if v_day ~ '^\d{8}$' then
      v_time := coalesce(v_time, '000000');
      if v_time ~ '^\d{6}$' then
        v_ts := make_timestamp(
          substr(v_day, 1, 4)::int, substr(v_day, 5, 2)::int, substr(v_day, 7, 2)::int,
          substr(v_time, 1, 2)::int, substr(v_time, 3, 2)::int, substr(v_time, 5, 2)::int
        ) at time zone 'Asia/Taipei';
      end if;
    elsif v_pay ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then
      v_ts := v_pay::timestamp at time zone 'Asia/Taipei';
    end if;
  exception when others then
    -- 例如 AuthDay='20261399'：格式對但數值非法，make_timestamp 會炸。
    v_ts := null;
  end;

  if v_ts is null
     or v_ts > now() + interval '2 days'
     or (p_fallback is not null and v_ts < p_fallback - interval '1 day') then
    return coalesce(p_fallback, now());
  end if;
  return v_ts;
end;
$$;

-- ------------------------------------------------------------
-- 4. process_successful_payment：效期錨定改為付款日（台灣日曆日）。
--    與 0008 的差異只有：
--      * 鎖定查詢多抓 created_at（payuni_paid_at 的 fallback）
--      * 錨點：fresh/null = tw_day(付款時點)；extend = 前一期最後一天
--        的「隔天」（前期迄 2027/7/14 → 新期 2027/7/15 ~ 2028/7/14）
--      * 三個效期欄位改用 compute_subscription_period
--      * completed_at = 付款時點（不再是 now()）——付款資訊是 SSOT
--    其餘（鎖、冪等、關鍵路徑先行、周邊隔離）逐字保留。
--    complete_paid_pending_orders（自癒）不需要改：它本來就把存好的
--    payuni_response 原封傳進來，延遲開通自動落在正確的付款日。
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

  update public.profiles
  set registration_step = 3
  where id = p_user_id;

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
-- 5. claim_referral_king_reward：免費續約一年改為日領域計算。
--    新最後一天 = 原最後一天 + 1 年（同日下一年），end/grace 從日領域
--    重算——同時順手把任何殘留的非正規化邊界自癒為台灣日終。
--    其餘（鎖、擁有權、冪等）逐字保留 0006。
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
  v_new_last_day   date;
  v_new_end        timestamptz;
  v_new_grace      timestamptz;
begin
  -- 鎖定這筆 reward，防止雙擊/併發請求同時處理同一筆。
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
    -- 已領取：冪等回傳成功，不重複延展。
    return jsonb_build_object('success', true, 'idempotent', true, 'status', 'claimed');
  end if;

  -- 鎖定該用戶「目前」訂閱：跟 user_account_status 一樣的判斷邏輯
  -- （依 end_date 排序取最新一筆，不管該筆現在是否仍在 active/grace 內）。
  select id, end_date into v_sub_id, v_old_end
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1
  for update;

  if v_sub_id is null then
    return jsonb_build_object('success', false, 'error_code', 'no_subscription', 'message', '找不到可延展的訂閱紀錄，請聯繫客服');
  end if;

  v_new_last_day := (public.tw_day(v_old_end) + interval '1 year')::date;
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

-- ------------------------------------------------------------
-- 6. 權限：維持既有慣例——業務函數只給 service_role（default
--    privileges，見 20260717000001），對 anon/authenticated 全面 revoke。
-- ------------------------------------------------------------
revoke execute on function public.tw_day(timestamptz) from anon, authenticated, public;
revoke execute on function public.tw_start_of_day(date) from anon, authenticated, public;
revoke execute on function public.tw_end_of_day(date) from anon, authenticated, public;
revoke execute on function public.compute_subscription_period(date) from anon, authenticated, public;
revoke execute on function public.payuni_paid_at(jsonb, timestamptz) from anon, authenticated, public;
revoke execute on function public.process_successful_payment(uuid, text, text, jsonb) from anon, authenticated, public;
revoke execute on function public.claim_referral_king_reward(uuid, uuid) from anon, authenticated, public;
