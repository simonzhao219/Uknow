-- ============================================================
-- Uknow 後端重構 — 0008 (0716) 過期會員續約雙模式：續約(extend)/新約(fresh)
-- ============================================================
--
-- 業務決策：會籍過期（超過寬限期）的舊會員導向結帳頁續費時，有兩個選擇：
--   1. 續約 (extend)：保留原帳號脈絡，新效期「接續前一筆訂閱效期的最後
--      一天」起算（start = 前一筆最新 end_date，end = start + 1 年）。
--   2. 新約 (fresh)：帳號密碼不變，但可以換新的推薦人，效期從付款日
--      起算（維持現行 now() 語意）。
--
-- 實作：
--   * payment_orders 加 renewal_mode 欄位，由 /payuni/prepare 在建單時
--     依使用者的選擇寫入；首次付款為 null（語意同 fresh）。
--   * process_successful_payment 讀取訂單上的 renewal_mode 決定效期錨點
--     ——付款當下才決定效期，不信任前端傳入的日期。
--   * 換推薦人：/payuni/prepare 在 fresh 模式驗證新推薦碼後更新
--     profiles.referred_by_user_id；apply_referral_side_effects 的推薦邊
--     insert 從 do nothing 改為「推薦人真的變了才 update」——舊推薦人的
--     歷史獎勵/任務計數保留（獎勵本來就是 per-payment-event），未來付款
--     的獎勵歸新推薦人，推薦樹即時反映換線。
--
-- 邊界：過期超過一年的人選 extend 會「付了錢效期仍在過去」——
-- /payuni/prepare 直接拒絕這種 extend（前端也不顯示該選項），這裡的
-- SQL 依訂單上的 renewal_mode 字面執行，不做 greatest(now(),...) 補救
-- （與 claim_referral_king_reward 的字面語意一致）。
-- ============================================================

alter table public.payment_orders
  add column renewal_mode text check (renewal_mode in ('extend', 'fresh'));

comment on column public.payment_orders.renewal_mode is
  '過期會員續費模式：extend=接續前一筆效期；fresh/null=效期從付款日起算（首次付款為 null）';

-- ------------------------------------------------------------
-- 1. apply_referral_side_effects：推薦邊改為「推薦人變更時 rewire」。
--    其餘邏輯與 0006 完全相同。
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
-- 2. process_successful_payment：依訂單上的 renewal_mode 決定效期錨點。
--    其餘邏輯（鎖、冪等、關鍵路徑先行、周邊隔離）與 0006 完全相同。
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
  v_renewal_mode text;
  v_prev_end     timestamptz;
  v_start        timestamptz;
  v_sub_id       uuid;
  v_is_renewal   boolean;
  v_side_effects jsonb;
begin
  -- 0. 鎖住這筆訂單，序列化同一筆 p_trade_no 的並行呼叫（notify webhook
  --    與 return 導回幾乎同時到達、或 PayUni 對 notify 重試時）。
  --    /payuni/prepare 一定先把訂單以 'pending' 寫入，使用者才會被導去
  --    PayUni，所以走到這裡這筆列必定存在。拿到鎖之後才檢查冪等，確保
  --    並行呼叫一定排隊而不是同時通過檢查。
  select id, status, renewal_mode
    into v_order_id, v_order_status, v_renewal_mode
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

  -- 效期錨點：extend（續約）接續前一筆訂閱的最後一天；fresh / null
  -- （新約、首次付款）從付款當下起算。extend 的合理性（前 end_date +
  -- 1 年 > now）由 /payuni/prepare 在建單時把關，這裡字面執行。
  v_start := now();
  if v_renewal_mode = 'extend' then
    select max(end_date) into v_prev_end
    from public.subscriptions
    where user_id = p_user_id;
    if v_prev_end is not null then
      v_start := v_prev_end;
    end if;
  end if;

  -- 1. 建立訂閱
  insert into public.subscriptions (
    user_id, start_date, end_date, grace_period_end,
    amount, payment_method, payment_transaction_id, is_renewal,
    source_payment_order_id
  )
  values (
    p_user_id,
    v_start,
    v_start + interval '1 year',
    v_start + interval '1 year' + interval '60 days',
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
