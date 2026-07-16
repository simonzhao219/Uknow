-- ============================================================
-- Uknow 後端重構 — 0006 (0716) 付款並發鎖 + 推薦周邊邏輯抽出/補修
-- ============================================================
--
-- 這個 migration 解決三個問題：
--
-- 1. 並發 race condition：process_successful_payment 的冪等檢查是
--    「先 select 再動作」，沒有鎖。NotifyURL webhook 跟 return 導回
--    幾乎同時到達時，兩個呼叫都可能在對方 commit 前通過檢查，各自
--    建立一筆 subscriptions + 各自發一次獎勵。改成一開頭就
--    `select ... for update` 鎖住對應的 payment_orders 列，讓並發呼叫
--    序列化。/payuni/prepare 保證這筆列一定先以 'pending' 存在，
--    所以這個鎖一定鎖得到東西。
--
-- 2. 推薦獎勵的冪等鍵，從「這個下線史上有沒有拿過」改成「這個下線的
--    這一次付款事件有沒有拿過」（reward_transactions.subscription_id）
--    —— 因為已確認：推薦人每次下線付款（含續約）都要再拿一次獎金，
--    金額改成 100 點/代。task_progress 的單月推薦計數也跟著每次付款
--    （含續約）同步 +1，達到 10 人即發放推薦王「免費續約 1 年」
--    credit（>= 10 而不是 = 10，是為了讓補跑/批次重放時就算一次跳過
--    10 這個整數也不會漏發；真正防重靠 referral_king_rewards 的
--    unique(user_id, month_key)，不是靠這個等式）。
--
-- 3. 周邊業務邏輯（推薦碼/推薦邊/獎勵/任務進度）從
--    process_successful_payment 抽成獨立函數 apply_referral_side_effects，
--    repair_orphaned_payments 共用同一份實作，兩邊邏輯不會長期漂移。
--    新增 subscriptions.source_payment_order_id，讓「這筆訂閱是哪一次
--    付款事件建立的」有明確外鍵，repair 掃描才有辦法 join。
--
-- claim_referral_king_reward：使用者領取推薦王免費續約 credit 時，
-- 把對應訂閱的 end_date/grace_period_end 各自往後加一年（字面意思，
-- 不做 greatest(now(),...) 保護）。這是免費續約，不是點數，不進
-- reward_transactions，也絕對不呼叫 apply_referral_side_effects——
-- 用任務領到的續約不是真的付款，不該再觸發一輪推薦鏈。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 新欄位
-- ------------------------------------------------------------
alter table public.subscriptions
  add column source_payment_order_id uuid references public.payment_orders(id) on delete set null;

alter table public.reward_transactions
  add column subscription_id uuid references public.subscriptions(id) on delete set null;

-- ------------------------------------------------------------
-- 2. 防禦性唯一約束 + 索引
--    部署前請先確認沒有既存重複值：
--      select payment_transaction_id, count(*)
--      from subscriptions
--      where payment_transaction_id is not null
--      group by payment_transaction_id having count(*) > 1;
-- ------------------------------------------------------------
create unique index if not exists subscriptions_payment_transaction_id_unique
  on public.subscriptions (payment_transaction_id)
  where payment_transaction_id is not null;

create index if not exists idx_reward_transactions_referee_gen_sub
  on public.reward_transactions (referee_user_id, generation, subscription_id);

-- ------------------------------------------------------------
-- 3. apply_referral_side_effects：周邊業務邏輯，process_successful_payment
--    與 repair_orphaned_payments 共用同一份實作。
-- ------------------------------------------------------------
create or replace function public.apply_referral_side_effects(
  p_user_id         uuid,
  p_subscription_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer1   uuid;
  v_referrer2   uuid;
  v_referrer3   uuid;
  v_code_id     uuid;
  v_ref_code    text;
  v_month_key   text;
  v_month_count int;
  v_applied     text[] := '{}';
begin
  -- 鎖住這位使用者的 profiles 列，序列化「同一人」的周邊業務邏輯全程
  -- ——process_successful_payment 的付款流程跟 repair_orphaned_payments
  -- 的補償掃描可能同時呼叫到同一個 user_id，這個鎖讓兩者排隊而不是
  -- 同時搶著建推薦碼/發獎勵。
  select referred_by_user_id into v_referrer1
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

  -- 3b. 推薦關係邊（referee_user_id 是 PK，天然冪等）
  begin
    insert into public.referral_edges (referee_user_id, referrer_user_id, referral_code_id)
    values (p_user_id, v_referrer1, v_code_id)
    on conflict (referee_user_id) do nothing;
  exception when others then
    perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
      jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id, 'step', 'referral_edge'));
    raise warning 'apply_referral_side_effects：建立推薦邊失敗（user_id=%): %', p_user_id, sqlerrm;
  end;

  -- 3c. 第 1 代獎勵 + task_progress + 推薦王門檻：綁在同一個判斷區塊，
  --     冪等鍵是「這個下線的這一次付款事件」（subscription_id），
  --     不是「這個下線史上有沒有拿過」——確認過推薦人每次下線付款
  --     （含續約）都要再拿一次獎金。
  if not exists (
    select 1 from public.reward_transactions
    where referee_user_id = p_user_id and generation = 1 and subscription_id = p_subscription_id
  ) then
    begin
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, subscription_id, description)
      values
        (v_referrer1, 'referral_reward', 100, 1, p_user_id, p_subscription_id, '推薦獎勵（第 1 代）');

      v_month_key := to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM');
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

      -- 推薦王：本月累積推薦數達 10 人門檻即發放「免費續約一年」credit
      -- （未領取狀態）。用 >=10 而不是 =10，加上 unique(user_id,
      -- month_key) 雙重保險：就算這段邏輯被 repair_orphaned_payments
      -- 重放、或補跑時一次跳過 10 這個整數，也不會重複發放。
      if v_month_count >= 10 then
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

  -- 3d. 第 2 代
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
          (user_id, type, amount, generation, referee_user_id, subscription_id, description)
        values
          (v_referrer2, 'referral_reward', 100, 2, p_user_id, p_subscription_id, '推薦獎勵（第 2 代）');
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
            (user_id, type, amount, generation, referee_user_id, subscription_id, description)
          values
            (v_referrer3, 'referral_reward', 100, 3, p_user_id, p_subscription_id, '推薦獎勵（第 3 代）');
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

revoke execute on function public.apply_referral_side_effects(uuid, uuid) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4. process_successful_payment：改成一開頭就鎖住訂單列，並呼叫
--    apply_referral_side_effects 取代原本內嵌的周邊邏輯。
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
  v_order_id     uuid;
  v_order_status text;
  v_sub_id       uuid;
  v_is_renewal   boolean;
  v_side_effects jsonb;
begin
  -- 0. 鎖住這筆訂單，序列化同一筆 p_trade_no 的並行呼叫（notify webhook
  --    與 return 導回幾乎同時到達、或 PayUni 對 notify 重試時）。
  --    /payuni/prepare 一定先把訂單以 'pending' 寫入，使用者才會被導去
  --    PayUni，所以走到這裡這筆列必定存在。拿到鎖之後才檢查冪等，確保
  --    並行呼叫一定排隊而不是同時通過檢查。
  select id, status
    into v_order_id, v_order_status
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

  -- 1. 建立訂閱
  insert into public.subscriptions (
    user_id, start_date, end_date, grace_period_end,
    amount, payment_method, payment_transaction_id, is_renewal,
    source_payment_order_id
  )
  values (
    p_user_id,
    now(),
    now() + interval '1 year',
    now() + interval '1 year' + interval '60 days',
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
      completed_at    = now()
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

revoke execute on function public.process_successful_payment(uuid, text, text, jsonb) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 5. repair_orphaned_payments：掃描「已完成付款但周邊邏輯沒跑完」的
--    孤兒使用者，逐筆呼叫 apply_referral_side_effects 補上。
--    不帶參數 = 全量掃描（給手動一次性 backfill / 未來排程用）；
--    帶 p_user_id = 單人補跑（給 edge function 即時呼叫用）。
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
    select distinct po.user_id, s.id as subscription_id
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
      perform public.apply_referral_side_effects(v_candidate.user_id, v_candidate.subscription_id);
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

-- ------------------------------------------------------------
-- 6. claim_referral_king_reward：領取「免費續約 1 年」credit。
--    明確不呼叫 apply_referral_side_effects、不寫 reward_transactions
--    ——這是免費續約，不是點數，也不是真的付款，不該再觸發推薦鏈。
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
  v_old_grace      timestamptz;
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
  select id, end_date, grace_period_end into v_sub_id, v_old_end, v_old_grace
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1
  for update;

  if v_sub_id is null then
    return jsonb_build_object('success', false, 'error_code', 'no_subscription', 'message', '找不到可延展的訂閱紀錄，請聯繫客服');
  end if;

  v_new_end   := v_old_end   + interval '1 year';
  v_new_grace := v_old_grace + interval '1 year';

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
