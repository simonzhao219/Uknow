-- ============================================================
-- 批次自癒與線上付款互鎖（第 6 波 S1；R5 P2-5、P2-7～9；W5-72、W6-8、W6-10～14；
-- 見 heal-lock-split.test.ts）
-- ============================================================
--
-- 為什麼：complete_paid_pending_orders 是單一交易，迴圈處理多位付款人。子交易正常結束時
--   列鎖併入上層交易、到整批 commit 才放，所以前一筆的 profiles(本人) for update 一路留著。
--   U1 是 X 的推薦人、X 是 U2 的推薦人：heal 持 profiles(U1)、處理 U2 發第 1 代給 X 要
--   KEY SHARE profiles(X)；線上 X 付款持 profiles(X)、發第 1 代給 U1 要 KEY SHARE profiles(U1)
--   → 40P01，被選中的一方該代獎金被 when others 吞掉。
--   plpgsql 函式不能 commit；procedure 可以但 PostgREST rpc() 叫不到，而 heal 必須跑在 Edge 的
--   租約與帳本內 → 改由 Edge 逐筆呼叫單筆函式（paid-pending-heal.ts），一筆一個交易。
--
-- 修法（基準與唯一差異）：
--   1. list_paid_pending_order_ids（新）：基準＝20261113000003 complete_paid_pending_orders 的候選
--      查詢。候選謂詞的唯一出處；不上鎖。
--   2. complete_paid_pending_order（新）：基準＝同上的迴圈體。唯一差異：
--      a. 開頭設 uknow.rewire_try_lock＝on、結尾不清（交易層設定，RPC 交易結束自然失效）；
--      b. 0b 鎖預取：委派前在自己的子交易內以 lock_timeout 3s 取付款人 profiles for update，
--         55P03 → skipped_locked。lock_timeout 只包這一步——整筆設的話也會套到發獎子交易的
--         FK 等待，55P03 會被那裡的 when others 吞成漏發。預取後還原成預取前的值。
--         順序因此變成「訂單列 → profiles(本人) → 換線 advisory」，與 0a′ 註解要求的相反；
--         成立的前提是 heal 路徑的換線鎖一律 try（a），拿不到就 U6R01 回滾、放掉 profiles。
--   3. complete_paid_pending_orders：基準＝20261113000003。改成 list → 逐筆呼叫 2 的 wrapper，
--      回傳形狀不變（skipped_locked＝單筆的 skipped＋skipped_locked，與舊版混計同義）；
--      迴圈結束後清旗標。仍是單一交易、互鎖風險同舊版——只給新 migration 已套、舊 Edge 未換的
--      空窗用。退場：S6 drop（W6-14）。
--   4. log_referral_reward_failure（新）：三代獎金沒發出的 error 告警（W6-10、W6-12）。LINE 只帶
--      message，所以前 200 字放完結論、單號（或任務續約）、第幾代、點數、推薦碼、下一步；不放
--      姓名、uid 與原始錯誤文字（LINE 是外部通道；sqlerrm 只進 context）。三代整批（generation
--      null）寫第 1 代推薦人推薦碼與每代點數，下一步改「核對三代」。下一步指向「開一個 Claude Code session 依 README〈補發漏發獎金〉處理」（W6-23）。反查單號／推薦碼各自包子交易，查不到就寫「查無」，告警一定寫入。
--   5. pay_referral_generations：基準＝20261113000001。唯一差異＝三代各自的 when others 由 warning
--      改呼叫 4（error）；unique_violation 照舊靜默（冪等）。
--   6. apply_referral_side_effects：基準＝20261113000003。唯一差異＝3c（整支發獎擲錯）改 error，
--      訊息同 4 的格式。
--   7. scheduler_health：基準＝20261112000001。唯一差異＝reconcile 多 healFailedStreak、
--      healSkippedStreak（purge-photos 為 null，鍵不省略——scheduler-health.test.ts 雙向比對鍵集合）。
--   8. invoke_internal_endpoint：基準＝20261112000001。唯一差異＝加 p_trigger（default 'pg_cron'，只收
--      pg_cron／manual），body 與 vault_missing 列都用它（R5 P2-9）。先 drop 舊的單參數版：兩支並存時
--      cron 的 invoke_internal_endpoint('reconcile') 會多載歧義、每輪失敗。cron.job 的指令字串在執行時
--      才解析，同一 migration 交易內 drop＋create，指令不必改。
-- ============================================================

-- ------------------------------------------------------------
-- 1. list_paid_pending_order_ids
-- ------------------------------------------------------------
create or replace function public.list_paid_pending_order_ids(
  p_user_id uuid default null,  -- 限定單一使用者（即時自癒）；null = 全量（排程對帳）
  p_limit   int  default 50
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  -- 固定依 created_at 排序，讓「單人自癒」與「全量對帳」處理順序一致。
  select coalesce(array_agg(id order by created_at), '{}'::uuid[])
  from (
    select id, created_at
    from public.payment_orders
    where status = 'pending'
      and payuni_response->>'Status' = 'SUCCESS'
      and (p_user_id is null or user_id = p_user_id)
    order by created_at
    limit p_limit
  ) c;
$$;

revoke execute on function public.list_paid_pending_order_ids(uuid, int) from anon, authenticated, public;
grant execute on function public.list_paid_pending_order_ids(uuid, int) to service_role;

-- ------------------------------------------------------------
-- 2. complete_paid_pending_order
-- ------------------------------------------------------------
create or replace function public.complete_paid_pending_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       record;
  v_trade_amt numeric;
  v_prev_lt   text;
begin
  -- 本交易內的付款完成改用 try 取換線鎖（見 process_successful_payment 0a′、W5-61）。
  -- 在任何子交易之外設：子交易回滾會還原 GUC。結尾不清（交易層設定，交易結束自然失效）。
  perform set_config('uknow.rewire_try_lock', 'on', true);

  begin
    -- 拿鎖後重讀重驗謂詞（TOCTOU 防禦）：已被 notify／另一次自癒處理完 → 謂詞不成立；
    -- 對方還握著訂單列 → skip locked 拿不到。兩者分不出來，一律記 skipped（同舊版）。
    -- 失敗回應（Status != 'SUCCESS'）永遠過不了這個謂詞，不可能被誤補成 completed。
    select id, user_id, transaction_id, payuni_response
      into v_row
    from public.payment_orders
    where id = p_order_id
      and status = 'pending'
      and payuni_response->>'Status' = 'SUCCESS'
    for update skip locked;

    if v_row.id is null then
      return jsonb_build_object('outcome', 'skipped');
    end if;

    -- 金額重驗（鏡射 resolveOrderFromPayUni：TradeAmt 存在且 != 1200 才算不符；缺欄位寬容）。
    v_trade_amt := null;
    begin
      if coalesce(v_row.payuni_response->>'TradeAmt', '') <> '' then
        v_trade_amt := (v_row.payuni_response->>'TradeAmt')::numeric;
      end if;
    exception when others then
      v_trade_amt := -1;  -- 無法解析一律視同金額不符
    end;

    if v_trade_amt is not null and v_trade_amt <> 1200 then
      -- 錢可能已刷：絕不自動補完、也絕不自動標失敗，維持 pending 交人工。
      -- 告警去重：同一筆訂單已有未解決的告警就不重寫。
      if not exists (
        select 1 from public.system_alerts
        where source = 'complete_paid_pending_orders'
          and resolved_at is null
          and context->>'order_id' = v_row.id::text
      ) then
        perform public.log_system_alert(
          'complete_paid_pending_orders', 'error',
          'PayUni 回應金額與方案價不符，訂單維持 pending 待人工裁決',
          jsonb_build_object(
            'order_id',  v_row.id,
            'trade_no',  v_row.transaction_id,
            'user_id',   v_row.user_id,
            'trade_amt', v_row.payuni_response->>'TradeAmt'
          )
        );
      end if;
      return jsonb_build_object('outcome', 'amount_mismatch');
    end if;

    -- 0b 鎖預取：只有這一步帶 lock_timeout（見檔頭 2b）。
    v_prev_lt := current_setting('lock_timeout');
    begin
      perform set_config('lock_timeout', '3s', true);
      perform 1 from public.profiles where id = v_row.user_id for update;
      perform set_config('lock_timeout', v_prev_lt, true);
    exception when lock_not_available then
      perform set_config('lock_timeout', v_prev_lt, true);
      return jsonb_build_object('outcome', 'skipped_locked');
    end;

    -- 委派既有的付款處理函數（profiles 已在手上，0b 重入不等）。
    -- TradeNo 空值時退回 MerTradeNo，與 resolveOrderFromPayUni 一致。
    perform public.process_successful_payment(
      v_row.user_id,
      v_row.transaction_id,
      coalesce(nullif(v_row.payuni_response->>'TradeNo', ''), v_row.transaction_id),
      v_row.payuni_response
    );
    return jsonb_build_object('outcome', 'completed');

  exception
    when sqlstate 'U6R01' then
      -- 換線鎖被線上付款持有 → 跳過，下一輪再補；不是錯誤（W5-61）。
      return jsonb_build_object('outcome', 'skipped_locked');
    when others then
      perform public.log_system_alert('complete_paid_pending_orders', 'error', sqlerrm,
        jsonb_build_object('order_id', p_order_id));
      raise warning 'complete_paid_pending_order：補完訂單 % 失敗: %', p_order_id, sqlerrm;
      return jsonb_build_object('outcome', 'failed', 'error', sqlerrm);
  end;
end;
$$;

revoke execute on function public.complete_paid_pending_order(uuid) from anon, authenticated, public;
grant execute on function public.complete_paid_pending_order(uuid) to service_role;

-- ------------------------------------------------------------
-- 3. complete_paid_pending_orders（舊 Edge 相容 wrapper；S6 drop）
-- ------------------------------------------------------------
create or replace function public.complete_paid_pending_orders(
  p_user_id uuid default null,
  p_limit   int  default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_ids       uuid[];
  v_r         jsonb;
  v_completed uuid[] := '{}';
  v_failed    jsonb  := '[]'::jsonb;
  v_mismatch  int := 0;
  v_skipped   int := 0;
begin
  v_ids := public.list_paid_pending_order_ids(p_user_id, p_limit);
  foreach v_id in array v_ids loop
    v_r := public.complete_paid_pending_order(v_id);
    case v_r->>'outcome'
      when 'completed' then v_completed := array_append(v_completed, v_id);
      when 'amount_mismatch' then v_mismatch := v_mismatch + 1;
      when 'failed' then
        v_failed := v_failed || jsonb_build_object('order_id', v_id, 'error', v_r->>'error');
      else v_skipped := v_skipped + 1;
    end case;
  end loop;

  -- 單筆函式不清旗標；同一交易後續若還有線上付款，不能被誤改成 try。
  perform set_config('uknow.rewire_try_lock', '', true);
  return jsonb_build_object(
    'candidates_found',    coalesce(array_length(v_ids, 1), 0),
    'completed_count',     coalesce(array_length(v_completed, 1), 0),
    'completed_order_ids', to_jsonb(v_completed),
    'amount_mismatch',     v_mismatch,
    'skipped_locked',      v_skipped,
    'failed',              v_failed
  );
end;
$$;

revoke execute on function public.complete_paid_pending_orders(uuid, int) from anon, authenticated, public;
grant execute on function public.complete_paid_pending_orders(uuid, int) to service_role;

-- ------------------------------------------------------------
-- 4. log_referral_reward_failure
-- ------------------------------------------------------------
create or replace function public.log_referral_reward_failure(
  p_source          text,
  p_referee         uuid,
  p_generation      int,   -- null＝三代整批
  p_beneficiary     uuid,
  p_amount          int,
  p_subscription_id uuid,
  p_claim_id        uuid,
  p_sqlstate        text,
  p_sqlerrm         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade_no text;
  v_code     text;
  v_doc      text;
  v_what     text;
  v_reason   text;
begin
  if p_subscription_id is not null then
    begin
      select po.transaction_id into v_trade_no
      from public.subscriptions s
      join public.payment_orders po on po.id = s.source_payment_order_id
      where s.id = p_subscription_id;
    exception when others then
      v_trade_no := null;
    end;
  end if;
  if p_beneficiary is not null then
    begin
      select code into v_code
      from public.referral_codes
      where user_id = p_beneficiary and status = 'active'
      limit 1;
    exception when others then
      v_code := null;
    end;
  end if;

  v_doc := case
    when p_claim_id is not null then '任務續約 ' || left(p_claim_id::text, 8)
    else '付款單' || coalesce(' ' || v_trade_no, '（查無單號）')
  end;
  v_what := case
    when p_generation is null then '三代推薦獎金整批'
    else '第 ' || p_generation || ' 代推薦獎金 ' || coalesce(p_amount::text, '?') || ' 點'
  end;
  v_reason := case p_sqlstate
    when '40P01' then '資料庫互鎖'
    when '40001' then '序列化衝突'
    else '系統錯誤'
  end;

  -- 原始錯誤（sqlerrm）只放 context：LINE 是外部通道，PG 原文可能帶約束名或識別碼。
  perform public.log_system_alert(p_source, 'error',
    '【獎金未發】' || v_doc || ' 的' || v_what || '沒有發出'
      || case when p_generation is null
              then '（第 1 代推薦人推薦碼 ' || coalesce(v_code, '（無有效推薦碼）')
                   || '，每代 ' || coalesce(p_amount::text, '?') || ' 點）'
              else '（應發給推薦人，推薦碼 ' || coalesce(v_code, '（無有效推薦碼）') || '）' end
      || '。下一步：開一個 Claude Code session，請它依 supabase/README〈補發漏發獎金〉核對'
      || case when p_generation is null then '三代' else '' end
      || '並補發。'
      || '原因：' || v_reason || '（' || coalesce(p_sqlstate, '?') || '）',
    jsonb_build_object(
      'referee', p_referee, 'generation', p_generation, 'beneficiary', p_beneficiary,
      'amount', p_amount, 'subscription_id', p_subscription_id, 'claim_id', p_claim_id,
      'trade_no', v_trade_no, 'sqlstate', p_sqlstate, 'sqlerrm', p_sqlerrm));
end;
$$;

revoke execute on function public.log_referral_reward_failure(text, uuid, int, uuid, int, uuid, uuid, text, text)
  from anon, authenticated, public;

-- ------------------------------------------------------------
-- 5. pay_referral_generations（基準 20261113000001）
-- ------------------------------------------------------------
create or replace function public.pay_referral_generations(
  p_referee         uuid,
  p_amount          int,
  p_subscription_id uuid  default null,
  p_claim_id        uuid  default null,
  p_description_tag text  default ''
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref1         uuid;
  v_ref2         uuid;
  v_ref3         uuid;
  v_referee_name text;
  v_ref1_name    text;
  v_applied      text[] := '{}';
begin
  -- gen1 收獎者 = 被推薦人（p_referee）的直接上線；名字快照供獎勵明細顯示。
  select referred_by_user_id, name into v_ref1, v_referee_name
  from public.profiles where id = p_referee;
  if v_ref1 is null then
    return v_applied;
  end if;
  -- S6：收獎者＝付款人本人＝資料已成環（不應發生），本代與其後各代都不發。
  if v_ref1 = p_referee then
    perform public.log_system_alert('referral_cycle_detected', 'error',
      '推薦關係成環：付款人出現在自己的推薦鏈上，本代與其後各代不發獎',
      jsonb_build_object('referee', p_referee, 'generation', 1,
        'subscription_id', p_subscription_id, 'claim_id', p_claim_id));
    return v_applied;
  end if;
  select name into v_ref1_name from public.profiles where id = v_ref1;

  -- gen1（被推薦人的推薦人即收獎者本人，故 referee_referrer_name 留 NULL）
  if not exists (
    select 1 from public.reward_transactions
    where referee_user_id = p_referee and generation = 1
      and subscription_id is not distinct from p_subscription_id
      and source_claim_id  is not distinct from p_claim_id
  ) then
    begin
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, subscription_id, source_claim_id,
         description, referee_name, referee_referrer_name)
      values
        (v_ref1, 'referral_reward', p_amount, 1, p_referee, p_subscription_id, p_claim_id,
         '推薦獎勵（第 1 代' || p_description_tag || '）', v_referee_name, null);
      v_applied := array_append(v_applied, 'gen1');
    exception when unique_violation then
      -- 冪等撞唯一索引＝這一代已發過（並行路徑先寫成），不告警。
      null;
    when others then
      perform public.log_referral_reward_failure('pay_referral_generations', p_referee, 1, v_ref1,
        p_amount, p_subscription_id, p_claim_id, sqlstate, sqlerrm);
    end;
  end if;

  -- gen2（被推薦人的直接上線 = v_ref1，帶入括號名字快照）
  select referrer_user_id into v_ref2
  from public.referral_edges where referee_user_id = v_ref1;

  if v_ref2 = p_referee then
    perform public.log_system_alert('referral_cycle_detected', 'error',
      '推薦關係成環：付款人出現在自己的推薦鏈上，本代與其後各代不發獎',
      jsonb_build_object('referee', p_referee, 'generation', 2,
        'subscription_id', p_subscription_id, 'claim_id', p_claim_id));
    return v_applied;
  end if;

  if v_ref2 is not null then
    if not exists (
      select 1 from public.reward_transactions
      where referee_user_id = p_referee and generation = 2
        and subscription_id is not distinct from p_subscription_id
        and source_claim_id  is not distinct from p_claim_id
    ) then
      begin
        insert into public.reward_transactions
          (user_id, type, amount, generation, referee_user_id, subscription_id, source_claim_id,
           description, referee_name, referee_referrer_name)
        values
          (v_ref2, 'referral_reward', p_amount, 2, p_referee, p_subscription_id, p_claim_id,
           '推薦獎勵（第 2 代' || p_description_tag || '）', v_referee_name, v_ref1_name);
        v_applied := array_append(v_applied, 'gen2');
      exception when unique_violation then
        -- 冪等撞唯一索引＝這一代已發過（並行路徑先寫成），不告警。
        null;
      when others then
        perform public.log_referral_reward_failure('pay_referral_generations', p_referee, 2, v_ref2,
        p_amount, p_subscription_id, p_claim_id, sqlstate, sqlerrm);
      end;
    end if;

    -- gen3
    select referrer_user_id into v_ref3
    from public.referral_edges where referee_user_id = v_ref2;

    if v_ref3 = p_referee then
      perform public.log_system_alert('referral_cycle_detected', 'error',
        '推薦關係成環：付款人出現在自己的推薦鏈上，本代與其後各代不發獎',
        jsonb_build_object('referee', p_referee, 'generation', 3,
          'subscription_id', p_subscription_id, 'claim_id', p_claim_id));
      return v_applied;
    end if;

    if v_ref3 is not null then
      if not exists (
        select 1 from public.reward_transactions
        where referee_user_id = p_referee and generation = 3
          and subscription_id is not distinct from p_subscription_id
          and source_claim_id  is not distinct from p_claim_id
      ) then
        begin
          insert into public.reward_transactions
            (user_id, type, amount, generation, referee_user_id, subscription_id, source_claim_id,
             description, referee_name, referee_referrer_name)
          values
            (v_ref3, 'referral_reward', p_amount, 3, p_referee, p_subscription_id, p_claim_id,
             '推薦獎勵（第 3 代' || p_description_tag || '）', v_referee_name, v_ref1_name);
          v_applied := array_append(v_applied, 'gen3');
        exception when unique_violation then
          -- 冪等撞唯一索引＝這一代已發過（並行路徑先寫成），不告警。
          null;
        when others then
          perform public.log_referral_reward_failure('pay_referral_generations', p_referee, 3, v_ref3,
        p_amount, p_subscription_id, p_claim_id, sqlstate, sqlerrm);
        end;
      end if;
    end if;
  end if;

  return v_applied;
end;
$$;

revoke execute on function public.pay_referral_generations(uuid, int, uuid, uuid, text)
  from anon, authenticated, public;

-- ------------------------------------------------------------
-- 6. apply_referral_side_effects（基準 20261113000003）
-- ------------------------------------------------------------
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
  v_referrer1      uuid;
  v_code_id        uuid;
  v_ref_code       text;
  v_month_key      text;
  v_applied        text[] := '{}';
  v_referee_name   text;   -- 被推薦人（p_user_id）當下名，快照（保留鎖時取得）
  v_reward_amount  int;    -- 每代獎金，取自 reward_config
  v_king_threshold int;    -- 推薦王月門檻，取自 reward_config
begin
  -- 可變常數單一真相：讀 reward_config；讀不到就 fallback 回現值。
  select referral_reward_amount, referral_king_monthly_threshold
    into v_reward_amount, v_king_threshold
  from public.reward_config
  where id = true;
  v_reward_amount  := coalesce(v_reward_amount, 100);
  v_king_threshold := coalesce(v_king_threshold, 8);

  -- 鎖住這位使用者的 profiles 列，序列化「同一人」的周邊業務邏輯全程。
  select referred_by_user_id, name into v_referrer1, v_referee_name
  from public.profiles
  where id = p_user_id
  for update;

  -- 3a. 推薦碼：續約 / 補償都沿用既有 active 碼，只有完全沒有時才產生新碼。
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

  -- 3a-bis. 預設推薦人（0726 0101）：無推薦人的「首購」自動綁定。
  --   解析內含首購判準（subscriptions.is_renewal）、碼合法性
  --  （validate_referral_code：active + 未停權）、自我推薦護欄與
  --   解析失敗告警；此處只負責回寫。回寫在同一把 for update 鎖內。
  if v_referrer1 is null then
    begin
      v_referrer1 := public.resolve_default_referrer(p_user_id, p_subscription_id);
      if v_referrer1 is not null then
        -- S6（W5-52）：changed_at 記付款時點，#167 自癒閘門才放行這筆付款。
        perform set_config('uknow.referred_by_changed_at', coalesce(p_paid_at, now())::text, true);
        update public.profiles
        set referred_by_user_id    = v_referrer1,
            referred_by_code       = (
              select nullif(lower(trim(default_referrer_code)), '')
              from public.reward_config where id = true
            ),
            referred_by_is_default = true
        where id = p_user_id;
        v_applied := array_append(v_applied, 'default_referrer');
      end if;
    exception when others then
      v_referrer1 := null;  -- 任何例外一律視同無推薦人，不阻斷金流
      perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
        jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id, 'step', 'default_referrer'));
      raise warning 'apply_referral_side_effects：預設推薦人套用失敗（user_id=%): %', p_user_id, sqlerrm;
    end;
  end if;

  if v_referrer1 is null then
    return jsonb_build_object(
      'success', true, 'user_id', p_user_id,
      'referral_code_id', v_code_id, 'applied', to_jsonb(v_applied)
    );
  end if;

  -- 3b. 推薦關係邊：新約(fresh)換了推薦人時 rewire 到新推薦人；沒變則 no-op。
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

  -- 3c. Block A：三代 100P，每筆付款都發（首購＋續約）。共用函數在
  --     rewire 之後才呼叫，確保換線那筆歸新上線。冪等鍵綁 subscription_id。
  begin
    v_applied := v_applied || public.pay_referral_generations(
      p_user_id, v_reward_amount, p_subscription_id, null, '');
  exception when others then
    -- 第 6 波 S1（W6-10）：整批沒發出＝漏發錢，error（推 LINE）。
    perform public.log_referral_reward_failure('apply_referral_side_effects', p_user_id, null,
      v_referrer1, v_reward_amount, p_subscription_id, null, sqlstate, sqlerrm);
    raise warning 'apply_referral_side_effects：三代發獎失敗（referee=%): %', p_user_id, sqlerrm;
  end;

  -- 3d. Block B：task +1（pair-history）＋推薦王對帳（可自癒、可多張）。
  --     月份 key 錨定付款時點（p_paid_at）。
  begin
    v_month_key := to_char(coalesce(p_paid_at, now()) at time zone 'Asia/Taipei', 'YYYY-MM');

    -- pair-history：R 從未被 U 計過才算「新下線」。S6（W5-8）：名單另存在
    -- referral_pair_history（新約清當月桶不會刪到它）；插得進去＝第一次配對。
    insert into public.referral_pair_history (referrer_user_id, referee_user_id, first_month_key)
    values (v_referrer1, p_user_id, v_month_key)
    on conflict (referrer_user_id, referee_user_id) do nothing;
    if found then
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
        updated_at = now();
      v_applied := array_append(v_applied, 'task');
    end if;

    -- 推薦王：獨立於上面的 if 做當月冪等對帳——即使某次 append 成功而
    -- 這裡失敗，下一次任何付款都會把漏發的 credit 補上（自癒）。
    perform public.reconcile_king_credits(v_referrer1, v_month_key, v_king_threshold);
  exception when others then
    perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
      jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id,
                          'referrer_id', v_referrer1, 'step', 'task_king'));
    raise warning 'apply_referral_side_effects：任務/推薦王處理失敗（referee=%): %', p_user_id, sqlerrm;
  end;

  return jsonb_build_object(
    'success',          true,
    'user_id',          p_user_id,
    'referral_code_id', v_code_id,
    'applied',          to_jsonb(v_applied)
  );
end;
$$;

revoke execute on function public.apply_referral_side_effects(uuid, uuid, timestamptz)
  from anon, authenticated, public;

-- ------------------------------------------------------------
-- 7. scheduler_health（基準 20261112000001）
-- ------------------------------------------------------------
create or replace function public.scheduler_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs jsonb := '{}'::jsonb;
  v_job text;
  v_cron_name text;
  v_present boolean;
  v_active boolean;
  v_completed record;
  v_pg_completed timestamptz;
  v_pg_row record;
  v_counts jsonb;
  v_dry_run boolean;
  v_net jsonb := null;
  v_heal jsonb;
  v_fail_streak int;
  v_skip_streak int;
  v_fail_open boolean;
  v_skip_open boolean;
begin
  foreach v_job in array array['reconcile', 'purge-photos'] loop
    v_cron_name := case v_job
      when 'reconcile' then 'reconcile-pending-payments'
      else 'purge-orphan-listing-photos'
    end;

    select true, j.active into v_present, v_active from cron.job j where j.jobname = v_cron_name;
    v_present := coalesce(v_present, false);
    v_active := coalesce(v_active, false);

    select r.finished_at, r.status, r.trigger into v_completed
      from public.scheduled_job_runs r
     where r.job = v_job and r.status in ('succeeded', 'failed')
       and coalesce(r.error_code, '') not in ('vault_missing', 'exception')
     order by r.finished_at desc nulls last, r.id desc limit 1;

    select max(r.finished_at) into v_pg_completed
      from public.scheduled_job_runs r
     where r.job = v_job and r.trigger = 'pg_cron' and r.status in ('succeeded', 'failed')
       and coalesce(r.error_code, '') not in ('vault_missing', 'exception');

    select r.started_at, r.error_code into v_pg_row
      from public.scheduled_job_runs r
     where r.job = v_job and r.trigger = 'pg_cron'
     order by r.started_at desc, r.id desc limit 1;

    select jsonb_build_object(
             'succeeded', count(*) filter (where r.status = 'succeeded'),
             'failed', count(*) filter (where r.status = 'failed'),
             'skipped', count(*) filter (where r.status = 'skipped'),
             'abandoned', count(*) filter (where r.status = 'abandoned'))
      into v_counts
      from public.scheduled_job_runs r
     where r.job = v_job and r.started_at > now() - interval '24 hours';

    v_dry_run := null;
    if v_job = 'purge-photos' then
      select (r.summary ->> 'dryRun')::boolean into v_dry_run
        from public.scheduled_job_runs r
       where r.job = v_job and r.trigger = 'pg_cron' and r.summary ? 'dryRun'
       order by r.started_at desc, r.id desc limit 1;
    end if;

    -- 第 6 波 S1（R5 P2-8；W6-11 只供人看、不推 LINE）：heal 連續出問題的輪數。
    -- 只看 pg_cron 完成列（同 lastPgCronCompletedAt 的條件）；往回最多 24 列（一天）；
    -- 遇到沒有 heal 鍵的列（本案上線前）就停；amountMismatch 不計（金額不符的單會永遠 pending）。
    v_fail_streak := null;
    v_skip_streak := null;
    if v_job = 'reconcile' then
      v_fail_streak := 0;
      v_skip_streak := 0;
      v_fail_open := true;
      v_skip_open := true;
      for v_heal in
        select r.summary -> 'heal'
          from public.scheduled_job_runs r
         where r.job = v_job and r.trigger = 'pg_cron' and r.status in ('succeeded', 'failed')
           and coalesce(r.error_code, '') not in ('vault_missing', 'exception')
         order by r.finished_at desc nulls last, r.id desc
         limit 24
      loop
        exit when v_heal is null or jsonb_typeof(v_heal) <> 'object';
        if v_fail_open then
          if coalesce((v_heal ->> 'failed')::numeric, 0) > 0
             or coalesce((v_heal ->> 'error')::boolean, false)
             or coalesce((v_heal ->> 'truncated')::boolean, false) then
            v_fail_streak := v_fail_streak + 1;
          else
            v_fail_open := false;
          end if;
        end if;
        if v_skip_open then
          if coalesce((v_heal ->> 'skippedLocked')::numeric, 0) > 0 then
            v_skip_streak := v_skip_streak + 1;
          else
            v_skip_open := false;
          end if;
        end if;
        exit when not v_fail_open and not v_skip_open;
      end loop;
    end if;

    v_jobs := v_jobs || jsonb_build_object(v_job, jsonb_build_object(
      'cronJobPresent', v_present,
      'cronJobActive', v_active,
      'lastCompletedAt', v_completed.finished_at,
      'lastCompletedStatus', v_completed.status,
      'lastCompletedTrigger', v_completed.trigger,
      'lastPgCronCompletedAt', v_pg_completed,
      'lastPgCronRowAt', v_pg_row.started_at,
      'lastPgCronErrorCode', v_pg_row.error_code,
      'counts24h', v_counts,
      'lastPurgeDryRun', v_dry_run,
      'healFailedStreak', v_fail_streak,
      'healSkippedStreak', v_skip_streak
    ));
    v_completed := null;
    v_pg_row := null;
    v_present := null;
    v_active := null;
  end loop;

  if to_regclass('net._http_response') is not null then
    execute $q$
      select jsonb_build_object(
        'non2xx', count(*) filter (where status_code is null or status_code not between 200 and 299),
        'timedOut', count(*) filter (where timed_out),
        'lastStatusCodes', coalesce(
          (select jsonb_agg(coalesce(x.status_code, 0) order by x.id desc)
             from (select id, status_code from net._http_response
                    where created > now() - interval '6 hours'
                    order by id desc limit 5) x),
          '[]'::jsonb))
      from net._http_response where created > now() - interval '6 hours'
    $q$ into v_net;
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'jobs', v_jobs,
    'pgNet6h', coalesce(v_net, jsonb_build_object('non2xx', 0, 'timedOut', 0, 'lastStatusCodes', '[]'::jsonb))
  );
end;
$$;

revoke execute on function public.scheduler_health() from anon, authenticated, public;
grant execute on function public.scheduler_health() to service_role;

-- ------------------------------------------------------------
-- 8. invoke_internal_endpoint（基準 20261112000001）
-- ------------------------------------------------------------
drop function if exists public.invoke_internal_endpoint(text);

create or replace function public.invoke_internal_endpoint(
  p_job     text,
  p_trigger text default 'pg_cron'  -- 人工在 SQL Editor 驗證時帶 'manual'（R5 P2-9）
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
  v_url text;
  v_secret text;
  v_id bigint;
begin
  -- 白名單：只打這兩支端點，不接受任意 URL。
  v_path := case p_job
    when 'reconcile' then '/internal/reconcile-pending-payments'
    when 'purge-photos' then '/internal/purge-orphan-listing-photos'
  end;
  if v_path is null then
    raise exception 'invoke_internal_endpoint: 未知的 job %', p_job;
  end if;
  -- github 補跑走 GitHub Actions、不經這支函式；只收這兩種，帳本才不會冒充。
  if p_trigger is null or p_trigger not in ('pg_cron', 'manual') then
    raise exception 'invoke_internal_endpoint: 未知的 trigger %', p_trigger;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'uknow_api_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'uknow_internal_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    insert into public.scheduled_job_runs (job, trigger, status, finished_at, error_code)
    values (p_job, p_trigger, 'skipped', now(), 'vault_missing');
    return null;
  end if;

  -- pg_net 非同步、不重試；逾時只代表 pg_net 不等了，結果以端點寫的帳本為準。
  select net.http_post(
    url := rtrim(v_url, '/') || v_path,
    body := jsonb_build_object('trigger', p_trigger),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    timeout_milliseconds := 150000
  ) into v_id;
  return v_id;
end;
$$;

revoke execute on function public.invoke_internal_endpoint(text, text) from anon, authenticated, public;
