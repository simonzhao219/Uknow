-- ============================================================
-- Wave 4 後端守衛（見 suspension-guards / reconcile-expire /
-- referral-king-month-key 測試檔）：
--   1. payment_orders.status 增加 'expired' 終態——棄付殭屍單的歸宿，
--      由 reconcilePendingOrders 的 expire pass 標記（index.ts）。
--   2. request_withdrawal：被停權（profiles.suspended_at）會員不得提領。
--   3. validate_referral_code：停權會員的推薦碼不得通過驗證。
--   4. apply_referral_side_effects 增加 p_paid_at：推薦王月份 key 錨定
--      付款時間而非執行時間（與 0718 訂閱效期錨定 payuni_paid_at 對稱）；
--      process_successful_payment 傳入 v_paid_at、repair_orphaned_payments
--      傳入訂單 completed_at（該欄位即付款時點，見 0718000001）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. payment_orders.status 擴充 'expired'
-- ------------------------------------------------------------
alter table public.payment_orders
  drop constraint if exists payment_orders_status_check;
alter table public.payment_orders
  add constraint payment_orders_status_check
  check (status in ('pending', 'completed', 'failed', 'cancelled', 'expired'));

-- ------------------------------------------------------------
-- 2. request_withdrawal：基準 = 0718000101，唯一差異：
--    首查多取 suspended_at，not_joined 檢查前先擋停權。
-- ------------------------------------------------------------
create or replace function public.request_withdrawal(
  p_user_id      uuid,
  p_amount       int,
  p_bank_code    text,
  p_bank_account text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee        constant int := 15;
  v_min        constant int := 1000;
  v_daily_cap  constant int := 8000;
  v_joined     boolean;
  v_suspended  timestamptz;
  v_front      text;
  v_back       text;
  v_end_date   timestamptz;
  v_available  int;
  v_id         uuid;
  v_requested  timestamptz;
begin
  select referral_program_joined, suspended_at, id_card_front_path, id_card_back_path
    into v_joined, v_suspended, v_front, v_back
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error_code', 'not_found', 'message', '找不到使用者');
  end if;

  -- 停權會員不得提領：停權的意義是凍結濫用者，提領是資金流出的
  -- 最後一道門，必須第一個擋。
  if v_suspended is not null then
    return jsonb_build_object('success', false, 'error_code', 'suspended',
      'message', '帳號已停權，無法申請提領，請聯繫客服');
  end if;

  if not coalesce(v_joined, false) then
    return jsonb_build_object('success', false, 'error_code', 'not_joined', 'message', '尚未加入推薦計畫，無法提領');
  end if;

  if p_amount < v_min or p_amount % v_min <> 0 or p_amount > v_daily_cap then
    return jsonb_build_object('success', false, 'error_code', 'invalid_amount',
      'message', format('提領金額需為 %s 的倍數，且單日不超過 %s', v_min, v_daily_cap));
  end if;

  -- 會籍需在效期內（寬限期/失效都不能提領）
  select end_date into v_end_date
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1;

  if v_end_date is null or now() > v_end_date then
    return jsonb_build_object('success', false, 'error_code', 'subscription_invalid',
      'message', '會籍已到期，續訂後才能提領');
  end if;

  if v_front is null or v_back is null then
    return jsonb_build_object('success', false, 'error_code', 'missing_id_photos',
      'message', '請先上傳身分證正反面照片');
  end if;

  -- 一天一次（台灣日曆日；含被退件的申請——隔天才能重新申請）
  if exists (
    select 1 from public.withdrawals
    where user_id = p_user_id
      and public.tw_day(requested_at) = public.tw_day(now())
  ) then
    return jsonb_build_object('success', false, 'error_code', 'already_withdrawn_today',
      'message', '今日已申請過提領，請明天再試');
  end if;

  select coalesce(sum(amount), 0) into v_available
  from public.reward_transactions
  where user_id = p_user_id;

  if v_available < p_amount + v_fee then
    return jsonb_build_object('success', false, 'error_code', 'insufficient_balance',
      'message', format('可提領點數不足（需 %s P，含手續費 %s P）', p_amount + v_fee, v_fee));
  end if;

  -- 原子寫入：提領單（快照銀行資訊）+ 帳本即扣 amount+fee
  insert into public.withdrawals (user_id, amount, fee, status, bank_code, bank_account)
  values (p_user_id, p_amount, v_fee, 'pending', p_bank_code, p_bank_account)
  returning id, requested_at into v_id, v_requested;

  insert into public.reward_transactions (user_id, type, amount, withdrawal_id, description)
  values (p_user_id, 'withdrawal', -(p_amount + v_fee), v_id,
          format('提領申請（%s P + 手續費 %s P）', p_amount, v_fee));

  -- 順手把最新銀行資訊留在 profiles（下次提領自動帶入）
  update public.profiles
  set bank_code = p_bank_code, bank_account = p_bank_account
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', v_id,
    'status', 'pending',
    'amount', p_amount,
    'fee', v_fee,
    'requested_at', v_requested
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. validate_referral_code：基準 = 0620000003，唯一差異：
--    排除停權推薦人——被停權仍繼續拉下線賺獎金是權限模型的洞。
-- ------------------------------------------------------------
create or replace function public.validate_referral_code(p_code text)
returns table (
  referrer_user_id uuid,
  referrer_name    text,
  listing_name     text
)
language sql
security definer
set search_path = public
stable
as $$
  select rc.user_id, p.name, l.name
  from public.referral_codes rc
  join public.profiles p on p.id = rc.user_id
  left join public.listings l on l.user_id = rc.user_id
  where rc.code = p_code
    and rc.status = 'active'
    and p.suspended_at is null
  limit 1;
$$;

-- ------------------------------------------------------------
-- 4a. apply_referral_side_effects：改簽名（增加 p_paid_at，預設 null =
--     維持既有 now() 行為）。必須先 drop 舊的 2 參數版，否則兩參數
--     呼叫會因 default 參數產生 overload 歧義。
--     基準 = 0719000002，唯一差異：v_month_key 由
--     coalesce(p_paid_at, now()) 計算。
-- ------------------------------------------------------------
drop function if exists public.apply_referral_side_effects(uuid, uuid);

create or replace function public.apply_referral_side_effects(
  p_user_id         uuid,
  p_subscription_id uuid,
  p_paid_at         timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer1        uuid;
  v_referrer2        uuid;
  v_referrer3        uuid;
  v_code_id          uuid;
  v_ref_code         text;
  v_month_key        text;
  v_month_count      int;
  v_applied          text[] := '{}';
  v_referee_name     text;   -- 被推薦人（p_user_id）當下名，快照
  v_referrer1_name   text;   -- 被推薦人的直接推薦人（v_referrer1）當下名，快照
  v_reward_amount    int;    -- 每代獎金，取自 reward_config
  v_king_threshold   int;    -- 推薦王月門檻，取自 reward_config
begin
  -- 可變常數單一真相：讀 reward_config；讀不到就 fallback 回現值。
  select referral_reward_amount, referral_king_monthly_threshold
    into v_reward_amount, v_king_threshold
  from public.reward_config
  where id = true;
  v_reward_amount  := coalesce(v_reward_amount, 100);
  v_king_threshold := coalesce(v_king_threshold, 8);

  -- 鎖住這位使用者的 profiles 列，序列化「同一人」的周邊業務邏輯全程
  -- ——process_successful_payment 的付款流程跟 repair_orphaned_payments
  -- 的補償掃描可能同時呼叫到同一個 user_id，這個鎖讓兩者排隊而不是
  -- 同時搶著建推薦碼/發獎勵。順手取被推薦人的名字快照。
  select referred_by_user_id, name into v_referrer1, v_referee_name
  from public.profiles
  where id = p_user_id
  for update;

  -- 3a. 推薦碼：續約 / 補償都沿用既有 active 碼，只有完全沒有時才產生
  --     新碼。跟哪一次付款事件無關，獨立包一層 exception。
  begin
    select id into v_code_id
    from public.referral_codes
    where user_id = p_user_id and status = 'active'
    limit 1;

    if v_code_id is null then
      v_ref_code := public.generate_referral_code();
      insert into public.referral_codes (user_id, code, status, subscription_id)
      values (p_user_id, v_ref_code, 'active', p_subscription_id)
      returning id into v_code_id;
      v_applied := array_append(v_applied, 'referral_code');
    end if;
  exception when others then
    v_code_id := null;
    perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
      jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id, 'step', 'referral_code'));
    raise warning 'apply_referral_side_effects：建立推薦碼失敗（user_id=%): %', p_user_id, sqlerrm;
  end;

  if v_referrer1 is null then
    return jsonb_build_object(
      'success', true, 'user_id', p_user_id,
      'referral_code_id', v_code_id, 'applied', to_jsonb(v_applied)
    );
  end if;

  -- 被推薦人的直接推薦人 = v_referrer1，取其當下名做第 2/3 代的括號快照
  select name into v_referrer1_name from public.profiles where id = v_referrer1;

  -- 3b. 推薦關係邊（referee_user_id 是 PK）。0008 起：新約(fresh)換了
  --     推薦人時，profiles.referred_by_user_id 已在 /payuni/prepare 更新，
  --     這裡把既有的邊 rewire 到新推薦人；推薦人沒變時維持 no-op，
  --     不會每次付款都空轉 update。
  begin
    insert into public.referral_edges (referee_user_id, referrer_user_id, referral_code_id)
    values (p_user_id, v_referrer1, v_code_id)
    on conflict (referee_user_id) do update
      set referrer_user_id = excluded.referrer_user_id,
          referral_code_id = excluded.referral_code_id
      where referral_edges.referrer_user_id is distinct from excluded.referrer_user_id;
  exception when others then
    perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
      jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id, 'step', 'referral_edge'));
    raise warning 'apply_referral_side_effects：建立推薦邊失敗（user_id=%): %', p_user_id, sqlerrm;
  end;

  -- 3c. 第 1 代獎勵 + task_progress + 推薦王門檻：綁在同一個判斷區塊，
  --     冪等鍵是「這個下線的這一次付款事件」（subscription_id）。
  --     月份 key 錨定付款時點（p_paid_at）——webhook 失敗跨月後才自癒/
  --     補跑時，推薦必須記在付款當月，否則推薦王達標判定漂移。
  if not exists (
    select 1 from public.reward_transactions
    where referee_user_id = p_user_id and generation = 1 and subscription_id = p_subscription_id
  ) then
    begin
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, subscription_id,
         description, referee_name, referee_referrer_name)
      values
        (v_referrer1, 'referral_reward', v_reward_amount, 1, p_user_id, p_subscription_id,
         '推薦獎勵（第 1 代）', v_referee_name, null);

      v_month_key := to_char(coalesce(p_paid_at, now()) at time zone 'Asia/Taipei', 'YYYY-MM');
      insert into public.task_progress (user_id, total_referrals, monthly_referrals)
      values (
        v_referrer1, 1,
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
        updated_at = now()
      returning jsonb_array_length(monthly_referrals -> v_month_key) into v_month_count;

      -- 推薦王：本月累積推薦數達門檻（reward_config）即發放「免費續約一年」
      -- credit（未領取狀態）。用 >= 而不是 =，加上 unique(user_id, month_key)
      -- 雙重保險：就算被 repair_orphaned_payments 重放、或補跑時一次跳過門檻
      -- 整數，也不會重複發放。
      if v_month_count >= v_king_threshold then
        insert into public.referral_king_rewards (user_id, month_key, status, granted_at)
        values (v_referrer1, v_month_key, 'unclaimed', now())
        on conflict (user_id, month_key) do nothing;
      end if;

      v_applied := array_append(v_applied, 'gen1_reward');
    exception when others then
      perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
        jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id,
                            'referrer_id', v_referrer1, 'step', 'gen1'));
      raise warning 'apply_referral_side_effects：第 1 代獎勵處理失敗（referee=%): %', p_user_id, sqlerrm;
    end;
  end if;

  -- 3d. 第 2 代（被推薦人的直接推薦人 = v_referrer1，帶入括號快照）
  select referrer_user_id into v_referrer2
  from public.referral_edges
  where referee_user_id = v_referrer1;

  if v_referrer2 is not null then
    if not exists (
      select 1 from public.reward_transactions
      where referee_user_id = p_user_id and generation = 2 and subscription_id = p_subscription_id
    ) then
      begin
        insert into public.reward_transactions
          (user_id, type, amount, generation, referee_user_id, subscription_id,
           description, referee_name, referee_referrer_name)
        values
          (v_referrer2, 'referral_reward', v_reward_amount, 2, p_user_id, p_subscription_id,
           '推薦獎勵（第 2 代）', v_referee_name, v_referrer1_name);
        v_applied := array_append(v_applied, 'gen2_reward');
      exception when others then
        perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
          jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id,
                              'referrer_id', v_referrer2, 'step', 'gen2'));
        raise warning 'apply_referral_side_effects：第 2 代獎勵處理失敗（referee=%): %', p_user_id, sqlerrm;
      end;
    end if;

    -- 3e. 第 3 代
    select referrer_user_id into v_referrer3
    from public.referral_edges
    where referee_user_id = v_referrer2;

    if v_referrer3 is not null then
      if not exists (
        select 1 from public.reward_transactions
        where referee_user_id = p_user_id and generation = 3 and subscription_id = p_subscription_id
      ) then
        begin
          insert into public.reward_transactions
            (user_id, type, amount, generation, referee_user_id, subscription_id,
             description, referee_name, referee_referrer_name)
          values
            (v_referrer3, 'referral_reward', v_reward_amount, 3, p_user_id, p_subscription_id,
             '推薦獎勵（第 3 代）', v_referee_name, v_referrer1_name);
          v_applied := array_append(v_applied, 'gen3_reward');
        exception when others then
          perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
            jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id,
                                'referrer_id', v_referrer3, 'step', 'gen3'));
          raise warning 'apply_referral_side_effects：第 3 代獎勵處理失敗（referee=%): %', p_user_id, sqlerrm;
        end;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'success',          true,
    'user_id',          p_user_id,
    'referral_code_id', v_code_id,
    'applied',          to_jsonb(v_applied)
  );
end;
$$;

revoke execute on function public.apply_referral_side_effects(uuid, uuid, timestamptz) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4b. process_successful_payment：基準 = 0718000001，唯一差異：
--     side effects 傳入 v_paid_at（付款時點 SSOT）。
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
  -- 起算。
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
  --    已經寫入的付款完成事實被回滾。月份 key 錨定付款時點。
  begin
    select public.apply_referral_side_effects(p_user_id, v_sub_id, v_paid_at) into v_side_effects;
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
-- 4c. repair_orphaned_payments：基準 = 0716000006，唯一差異：
--     候選查詢多取 po.completed_at（= 付款時點，0718000001 起）
--     傳給 side effects，補跑的月份 key 落在付款當月。
-- ------------------------------------------------------------
create or replace function public.repair_orphaned_payments(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate       record;
  v_repaired_ids    uuid[] := '{}';
  v_failed          jsonb  := '[]'::jsonb;
  v_candidate_count int    := 0;
begin
  for v_candidate in
    select distinct po.user_id, s.id as subscription_id, po.completed_at as paid_at
    from public.payment_orders po
    join public.subscriptions s on s.source_payment_order_id = po.id
    join public.profiles pr on pr.id = po.user_id
    where po.status = 'completed'
      and (p_user_id is null or po.user_id = p_user_id)
      and (
        -- (a) 已付款完成卻沒有 active 推薦碼——每個付款成功的人都該有一個
        not exists (
          select 1 from public.referral_codes rc
          where rc.user_id = po.user_id and rc.status = 'active'
        )
        or (
          -- 有記錄推薦來源，但推薦鏈上該領獎勵的某一代還沒領到
          -- （用這一次付款事件的 subscription_id 當冪等鍵，跟
          -- apply_referral_side_effects 的判斷條件一致）
          pr.referred_by_user_id is not null
          and (
            not exists (
              select 1 from public.reward_transactions rt
              where rt.referee_user_id = po.user_id and rt.generation = 1 and rt.subscription_id = s.id
            )
            or exists (
              select 1
              from public.referral_edges e1
              join public.referral_edges e2 on e2.referee_user_id = e1.referrer_user_id
              where e1.referee_user_id = po.user_id
                and not exists (
                  select 1 from public.reward_transactions rt
                  where rt.referee_user_id = po.user_id and rt.generation = 2 and rt.subscription_id = s.id
                )
            )
            or exists (
              select 1
              from public.referral_edges e1
              join public.referral_edges e2 on e2.referee_user_id = e1.referrer_user_id
              join public.referral_edges e3 on e3.referee_user_id = e2.referrer_user_id
              where e1.referee_user_id = po.user_id
                and not exists (
                  select 1 from public.reward_transactions rt
                  where rt.referee_user_id = po.user_id and rt.generation = 3 and rt.subscription_id = s.id
                )
            )
          )
        )
      )
  loop
    v_candidate_count := v_candidate_count + 1;
    begin
      perform public.apply_referral_side_effects(
        v_candidate.user_id, v_candidate.subscription_id, v_candidate.paid_at);
      v_repaired_ids := array_append(v_repaired_ids, v_candidate.user_id);
    exception when others then
      v_failed := v_failed || jsonb_build_object('user_id', v_candidate.user_id, 'error', sqlerrm);
      perform public.log_system_alert('repair_orphaned_payments', 'error', sqlerrm,
        jsonb_build_object('user_id', v_candidate.user_id, 'subscription_id', v_candidate.subscription_id));
      raise warning 'repair_orphaned_payments：修復 user_id=% 失敗: %', v_candidate.user_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'candidates_found',  v_candidate_count,
    'repaired_count',    coalesce(array_length(v_repaired_ids, 1), 0),
    'repaired_user_ids', to_jsonb(v_repaired_ids),
    'failed',            v_failed
  );
end;
$$;

revoke execute on function public.repair_orphaned_payments(uuid) from anon, authenticated, public;
