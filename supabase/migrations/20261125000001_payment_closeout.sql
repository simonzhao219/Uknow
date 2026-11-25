-- ============================================================
-- 金流收尾（第 7 波 S4；W6-14→W6-30、W7-9、W7-10；見 payment-closeout.test.ts）
-- ============================================================
--
-- 1. drop complete_paid_pending_orders（20261115000001 §3 的單交易 wrapper）。
--    前提（W6-30）：正式站與 develop 的 Edge 都已是 #524 版本，只經 paid-pending-heal.ts
--    逐筆呼叫 list_paid_pending_order_ids＋complete_paid_pending_order；cron.job、其他函式本體、
--    pg_depend 皆無引用（第 7 波主 session 11/25 代查）。
--    告警 source 'complete_paid_pending_orders' 由單筆函式沿用——是歷史名，函式本身已不存在。
--
-- 2. classify_alert_sqlstate（新）：告警「原因」的固定分類字串（40P01 資料庫互鎖、40001 序列化衝突、
--    其他系統錯誤）。log_referral_reward_failure（20261115000001）內聯同一張表，本檔不重定義它；
--    本檔新增的兩處告警共用這支，免分類漂移。
-- 3. log_referral_side_effect_failure（新）：apply_referral_side_effects 周邊步驟寫入失敗的 error 告警
--    （W7-9 Q2、W7-10 Q3）。source／step 沿用現行（apply_referral_side_effects；default_referrer、
--    referral_edge、task_king），context 鍵只加不減。LINE 只看 message 前 60 字（W6-24）：開頭固定
--    「【結論・請開 Claude 動作】單號 <20 碼>：後果。」；不放姓名、uid、sqlerrm（sqlerrm 只進 context）。
--    同 step＋同訂閱（無訂閱時同會員）有未處理的 error 就不重寫——/profile 自癒每次載入都可能重跑。
--    整個本體包 exception：它在呼叫端的 exception handler 內被呼叫，擲錯會回滾整個
--    apply_referral_side_effects 子交易（含 3c 三代獎金）。
-- 4. apply_referral_side_effects：基準＝20261115000001（之後無重定義）。唯一差異＝3a-bis（預設推薦人）、
--    3b（推薦連結）、3d（任務進度／推薦王）的 when others 由 log_system_alert(warning) 改呼叫 3，
--    外面再包一層 begin…exception（呼叫端雙保險）。3a（推薦碼，repair_orphaned_payments 會自癒）維持 warning。
--    付款語意不變：各步驟仍在自己的子交易內被吞，函式照常 return。
--
-- 5. complete_paid_pending_order：基準＝20261115000001（之後無重定義）。差異：
--    1) when others 的 error 告警 message 改固定行動句「【已付款未開通・請開 Claude 處理】單號 …」，
--       sqlstate／sqlerrm 只進 context（加 kind='open_failed'、trade_no）；單號以 p_order_id 回查；
--    2) 同單未處理的 open_failed 告警已有就不重寫（heal 每輪重試）；告警段整段包 exception；
--    3) 金額不符的去重只認金額不符（kind='amount_mismatch' 或舊格式帶 trade_amt），寫入時加 kind；
--    4) 開通成功時把同單未處理的 open_failed 告警標 resolved_at（W7-9 Q7）。
--    回給 Edge 的 {'outcome':'failed','error':sqlerrm} 不變。
--
-- 6. repair_orphaned_payments（基準＝20260807000001）／repair_orphaned_claim_rewards（基準＝20261111000001）／
--    repair_orphaned_forfeitures（基準＝20260802000002），之後皆無重定義。唯一差異＝迴圈前
--    p_user_id is null 擲 U6R02（W7-9 Q1＝A）：全量路徑一個交易跨多位會員、子交易列鎖留到整批結束，
--    與線上付款互鎖；生產只由 Edge repairOrphanedPaymentsBestEffort 逐人呼叫。單人路徑不成環
--    （前提：推薦資料本身無環），迴圈體不動。claim_rewards 的「多人時排序防互鎖」註解改寫（全量已關）。
--    create or replace 保留既有 ACL；revoke 照抄基準。
--
-- 歷史檔頭更正（R6 P2-7、P2-8；已套用的 migration 不改，記在這裡）：
--   * 20261116000001_referral_award_chain 檔頭說對照的發獎函式是 20261113000001；
--     pay_referral_generations 的最新定義是 20261115000001（語意與 chain 等價，R6 §1.1 已核）。
--   * 20261116000005_admin_referral_ledger_audit 檔頭「批次自癒（complete_paid_pending_orders，
--     單一交易內處理多筆）期間的清空同理」：本檔 drop 後已無單交易批次自癒，該句不再成立；
--     其餘「別筆交易同時寫入可能差一筆」的競態說明仍成立。
-- ============================================================

-- ------------------------------------------------------------
-- 1. drop wrapper
-- ------------------------------------------------------------
drop function if exists public.complete_paid_pending_orders(uuid, int);


-- ------------------------------------------------------------
-- 2. classify_alert_sqlstate
-- ------------------------------------------------------------
create or replace function public.classify_alert_sqlstate(p_sqlstate text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_sqlstate
    when '40P01' then '資料庫互鎖'
    when '40001' then '序列化衝突'
    else '系統錯誤'
  end;
$$;

revoke execute on function public.classify_alert_sqlstate(text) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 3. log_referral_side_effect_failure
-- ------------------------------------------------------------
create or replace function public.log_referral_side_effect_failure(
  p_step            text,  -- default_referrer／referral_edge／task_king
  p_referee         uuid,
  p_referrer        uuid,  -- 付款人的推薦人（3a-bis 為 null）
  p_subscription_id uuid,
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
  v_code_txt text;
  v_message  text;
begin
  -- 去重：同 step＋同訂閱（無訂閱時同會員）已有未處理的 error。
  if exists (
    select 1 from public.system_alerts
    where source = 'apply_referral_side_effects'
      and severity = 'error'
      and resolved_at is null
      and context->>'step' = p_step
      and case
            when p_subscription_id is not null
              then context->>'subscription_id' = p_subscription_id::text
            else context->>'user_id' = p_referee::text and context->>'subscription_id' is null
          end
  ) then
    return;
  end if;

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
  -- 推薦碼取「付款人的推薦人」的 active 碼，不是付款人自己的碼。
  if p_referrer is not null then
    begin
      select code into v_code
      from public.referral_codes
      where user_id = p_referrer and status = 'active'
      limit 1;
    exception when others then
      v_code := null;
    end;
  end if;

  v_doc := '單號 ' || coalesce(v_trade_no, '（查無單號）');
  v_code_txt := '推薦人推薦碼 ' || coalesce(v_code, '（無有效推薦碼）') || '。';
  v_message := case p_step
    when 'default_referrer' then
      '【預設推薦人未套用・請開 Claude 補綁】' || v_doc || '：會員無推薦人、不發獎金。'
        || '下一步：開一個 Claude Code session，請它依 supabase/README〈補綁預設推薦人〉處理。'
    when 'referral_edge' then
      '【推薦連結未寫入・請開 Claude 補寫】' || v_doc || '：之後二代三代獎金會漏發。' || v_code_txt
        || '下一步：開一個 Claude Code session，請它依 supabase/README〈補寫推薦連結〉處理。'
    else
      '【任務進度未計・請開 Claude 核對】' || v_doc || '：推薦人任務少計一位。' || v_code_txt
        || '下一步：開一個 Claude Code session，請它依 supabase/README〈補計任務進度〉核對。'
  end || '原因：' || public.classify_alert_sqlstate(p_sqlstate) || '（' || coalesce(p_sqlstate, '?') || '）';

  perform public.log_system_alert('apply_referral_side_effects', 'error',
    coalesce(v_message, '【周邊寫入失敗・請開 Claude 核對】apply_referral_side_effects'),
    jsonb_build_object(
      'step', p_step, 'user_id', p_referee, 'subscription_id', p_subscription_id,
      'referrer_id', p_referrer, 'trade_no', v_trade_no,
      'sqlstate', p_sqlstate, 'sqlerrm', p_sqlerrm));
exception when others then
  raise warning 'log_referral_side_effect_failure：告警寫入失敗（step=%）: %', p_step, sqlerrm;
end;
$$;

revoke execute on function public.log_referral_side_effect_failure(text, uuid, uuid, uuid, text, text)
  from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4. apply_referral_side_effects（基準 20261115000001）
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
      begin  -- 呼叫端雙保險：告警路徑任何錯誤都不得讓外層子交易回滾（第 7 波 S4 review P0）
        perform public.log_referral_side_effect_failure('default_referrer', p_user_id, null,
          p_subscription_id, sqlstate, sqlerrm);
      exception when others then
        raise warning 'apply_referral_side_effects：告警寫入失敗（step=default_referrer）: %', sqlerrm;
      end;
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
    begin  -- 呼叫端雙保險：告警路徑任何錯誤都不得讓外層子交易回滾（第 7 波 S4 review P0）
      perform public.log_referral_side_effect_failure('referral_edge', p_user_id, v_referrer1,
        p_subscription_id, sqlstate, sqlerrm);
    exception when others then
      raise warning 'apply_referral_side_effects：告警寫入失敗（step=referral_edge）: %', sqlerrm;
    end;
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
    begin  -- 呼叫端雙保險：告警路徑任何錯誤都不得讓外層子交易回滾（第 7 波 S4 review P0）
      perform public.log_referral_side_effect_failure('task_king', p_user_id, v_referrer1,
        p_subscription_id, sqlstate, sqlerrm);
    exception when others then
      raise warning 'apply_referral_side_effects：告警寫入失敗（step=task_king）: %', sqlerrm;
    end;
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
-- 5. complete_paid_pending_order（基準 20261115000001）
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
  v_trade_no  text;
  v_sqlstate  text;
  v_sqlerrm   text;
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
          -- 差異 3：只認金額不符（新格式帶 kind；舊格式帶 trade_amt），不被開通失敗告警遮蔽。
          and (context->>'kind' = 'amount_mismatch' or context ? 'trade_amt')
      ) then
        perform public.log_system_alert(
          'complete_paid_pending_orders', 'error',
          'PayUni 回應金額與方案價不符，訂單維持 pending 待人工裁決',
          jsonb_build_object(
            'kind',      'amount_mismatch',
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
    -- 差異 4（W7-9 Q7）：之前的開通失敗是暫時性的（如 40P01），這一輪開通了 → 同單未處理的
    -- open_failed 告警自動標處理。包子交易：標不掉也不影響已完成的開通。
    begin
      update public.system_alerts
      set resolved_at = now()
      where source = 'complete_paid_pending_orders'
        and resolved_at is null
        and context->>'order_id' = p_order_id::text
        and context->>'kind' = 'open_failed';
    exception when others then
      raise warning 'complete_paid_pending_order：自動標處理失敗（order=%）: %', p_order_id, sqlerrm;
    end;
    return jsonb_build_object('outcome', 'completed');

  exception
    when sqlstate 'U6R01' then
      -- 換線鎖被線上付款持有 → 跳過，下一輪再補；不是錯誤（W5-61）。
      return jsonb_build_object('outcome', 'skipped_locked');
    when others then
      v_sqlstate := sqlstate;
      v_sqlerrm  := sqlerrm;
      -- 差異 1、2：message 是固定行動句（W6-24 前 60 字＝行動＋單號＋後果），sqlerrm 只進 context；
      -- 同單未處理的 open_failed 已有就不重寫。單號一律以 p_order_id 回查——select 本身擲錯時
      -- v_row 未指派，參照會擲 55000。整段包 exception：告警壞掉也要照常回 failed。
      begin
        if not exists (
          select 1 from public.system_alerts
          where source = 'complete_paid_pending_orders'
            and resolved_at is null
            and context->>'order_id' = p_order_id::text
            and context->>'kind' = 'open_failed'
        ) then
          begin
            select transaction_id into v_trade_no from public.payment_orders where id = p_order_id;
          exception when others then
            v_trade_no := null;
          end;
          perform public.log_system_alert('complete_paid_pending_orders', 'error',
            '【已付款未開通・請開 Claude 處理】單號 ' || coalesce(v_trade_no, '（查無單號）')
              || '：會員已付款但自動開通失敗。'
              || '下一步：開一個 Claude Code session，請它依 supabase/README〈已付款未開通〉處理。'
              || '原因：' || public.classify_alert_sqlstate(v_sqlstate)
              || '（' || coalesce(v_sqlstate, '?') || '）',
            jsonb_build_object(
              'kind', 'open_failed', 'order_id', p_order_id, 'trade_no', v_trade_no,
              'sqlstate', v_sqlstate, 'sqlerrm', v_sqlerrm));
        end if;
      exception when others then
        raise warning 'complete_paid_pending_order：告警寫入失敗（order=%）: %', p_order_id, sqlerrm;
      end;
      raise warning 'complete_paid_pending_order：補完訂單 % 失敗: %', p_order_id, v_sqlerrm;
      return jsonb_build_object('outcome', 'failed', 'error', v_sqlerrm);
  end;
end;
$$;

revoke execute on function public.complete_paid_pending_order(uuid) from anon, authenticated, public;
grant execute on function public.complete_paid_pending_order(uuid) to service_role;

-- ------------------------------------------------------------
-- 6. repair_orphaned_payments（基準 20260807000001）
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
  -- 第 7 波 S4（W7-9 Q1＝A）：全量路徑（null）一個交易跨多位會員，子交易列鎖留到整批結束，
  -- 與線上付款互鎖（同 20261115000001 檔頭的環）。生產只由 Edge 逐人呼叫，關掉全量。
  if p_user_id is null then
    raise exception using errcode = 'U6R02',
      message = 'repair_orphaned_payments：必須逐人呼叫（帶 p_user_id），全量路徑已關閉';
  end if;
  for v_candidate in
    select distinct po.user_id, s.id as subscription_id, po.completed_at as paid_at
    from public.payment_orders po
    join public.subscriptions s on s.source_payment_order_id = po.id
    join public.profiles pr on pr.id = po.user_id
    where po.status = 'completed'
      and (p_user_id is null or po.user_id = p_user_id)
      -- #167 閘門：現任推薦關係若晚於這筆付款才建立，這筆事件不歸它。
      -- legacy（null）沿用舊行為；同交易寫入（換線那筆付款本身）now()
      -- 相等，照常放行。
      and (pr.referred_by_changed_at is null
           or pr.referred_by_changed_at <= po.completed_at)
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

-- ------------------------------------------------------------
-- 6. repair_orphaned_claim_rewards（基準 20261111000001）
-- ------------------------------------------------------------
create or replace function public.repair_orphaned_claim_rewards(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_amount   int;
  v_candidate       record;
  v_candidate_count int := 0;
  v_repaired_count  int := 0;
begin
  -- 第 7 波 S4（W7-9 Q1＝A）：全量路徑（null）一個交易跨多位會員，子交易列鎖留到整批結束，
  -- 與線上付款互鎖（同 20261115000001 檔頭的環）。生產只由 Edge 逐人呼叫，關掉全量。
  if p_user_id is null then
    raise exception using errcode = 'U6R02',
      message = 'repair_orphaned_claim_rewards：必須逐人呼叫（帶 p_user_id），全量路徑已關閉';
  end if;
  select referral_reward_amount into v_reward_amount from public.reward_config where id = true;
  v_reward_amount := coalesce(v_reward_amount, 100);

  for v_candidate in
    select rkr.id as claim_id, rkr.user_id as claimer_id
    from public.referral_king_rewards rkr
    join public.profiles pr on pr.id = rkr.user_id
    where rkr.status = 'claimed'
      and (p_user_id is null or rkr.user_id = p_user_id)
      and pr.referred_by_user_id is not null
      -- #167 閘門：同 repair_orphaned_payments，事件時間 = claimed_at。
      and (pr.referred_by_changed_at is null
           or pr.referred_by_changed_at <= rkr.claimed_at)
      and not exists (
        select 1 from public.reward_transactions rt
        where rt.referee_user_id = rkr.user_id
          and rt.generation = 1
          and rt.source_claim_id = rkr.id
      )
    -- 排序：全量路徑已關（第 7 波 S4），只剩逐人呼叫；排序僅保留處理順序穩定。
    order by rkr.user_id, rkr.id
  loop
    -- 並行防線（ref P1-2）：與同一人另一個 repair 序列化——先鎖 claimer 的
    -- profiles 列，拿到鎖後重查；對方已補完（commit 後新 snapshot 看得到）就跳過。
    perform 1 from public.profiles where id = v_candidate.claimer_id for update;
    if exists (
      select 1 from public.reward_transactions rt
      where rt.referee_user_id = v_candidate.claimer_id
        and rt.generation = 1
        and rt.source_claim_id = v_candidate.claim_id
    ) then
      continue;
    end if;
    v_candidate_count := v_candidate_count + 1;
    begin
      perform public.pay_referral_generations(
        v_candidate.claimer_id, v_reward_amount, null, v_candidate.claim_id, '・任務續約');
      v_repaired_count := v_repaired_count + 1;
    exception when others then
      perform public.log_system_alert('repair_orphaned_claim_rewards', 'error', sqlerrm,
        jsonb_build_object('claim_id', v_candidate.claim_id, 'claimer_id', v_candidate.claimer_id));
      raise warning 'repair_orphaned_claim_rewards：補發失敗（claim_id=%）: %', v_candidate.claim_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'candidates_found', v_candidate_count,
    'repaired_count',   v_repaired_count
  );
end;
$$;

revoke execute on function public.repair_orphaned_claim_rewards(uuid) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 6. repair_orphaned_forfeitures（基準 20260802000002）
-- ------------------------------------------------------------
create or replace function public.repair_orphaned_forfeitures(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate       record;
  v_snapshot        integer;
  v_repaired_ids    uuid[] := '{}';
  v_failed          jsonb  := '[]'::jsonb;
  v_candidate_count int    := 0;
begin
  -- 第 7 波 S4（W7-9 Q1＝A）：全量路徑（null）一個交易跨多位會員，子交易列鎖留到整批結束，
  -- 與線上付款互鎖（同 20261115000001 檔頭的環）。生產只由 Edge 逐人呼叫，關掉全量。
  if p_user_id is null then
    raise exception using errcode = 'U6R02',
      message = 'repair_orphaned_forfeitures：必須逐人呼叫（帶 p_user_id），全量路徑已關閉';
  end if;
  for v_candidate in
    select s.id as subscription_id, s.user_id, po.transaction_id as trade_no
    from public.subscriptions s
    join public.payment_orders po on po.id = s.source_payment_order_id
    where po.renewal_mode = 'fresh'
      and (p_user_id is null or s.user_id = p_user_id)
      -- 非首購：同一人有更早建立的訂閱（首購 fresh 本來就無沖銷列）
      and exists (
        select 1 from public.subscriptions s2
        where s2.user_id = s.user_id and s2.id <> s.id and s2.created_at < s.created_at
      )
      and not exists (
        select 1 from public.reward_transactions rt
        where rt.user_id = s.user_id and rt.type = 'ledger_reset'
          and rt.subscription_id = s.id
      )
  loop
    v_candidate_count := v_candidate_count + 1;
    begin
      -- 與付款完成流程同一把 user 鎖，鎖內重查冪等條件——兩個並行的
      -- repair（或 repair 撞上付款）不會對同一筆訂閱各插一列。
      perform 1 from public.profiles where id = v_candidate.user_id for update;
      if exists (
        select 1 from public.reward_transactions rt
        where rt.user_id = v_candidate.user_id and rt.type = 'ledger_reset'
          and rt.subscription_id = v_candidate.subscription_id
      ) then
        continue;
      end if;

      -- 補沖依據 = 失敗當下的金額快照（fresh_ledger_forfeit 告警 payload）。
      -- 絕不用補沖當下的餘額——失敗後下線新繳的合法點數不能被追溯沒收。
      select (sa.context ->> 'forfeit_amount')::integer into v_snapshot
      from public.system_alerts sa
      where sa.source = 'fresh_ledger_forfeit'
        and sa.context ->> 'subscription_id' = v_candidate.subscription_id::text
        and sa.context ? 'forfeit_amount'
        and (sa.context ->> 'forfeit_amount') is not null
      order by sa.created_at desc
      limit 1;

      if v_snapshot is null then
        -- 快照遺失：寧可少沖交人工——沖 0（留冪等標記列）+ 升級 error 告警。
        perform public.log_system_alert('repair_orphaned_forfeitures', 'error',
          '找不到 fresh_ledger_forfeit 金額快照，補沖 0，需人工核對',
          jsonb_build_object('user_id', v_candidate.user_id,
                             'subscription_id', v_candidate.subscription_id,
                             'trade_no', v_candidate.trade_no));
        v_snapshot := 0;
      end if;

      insert into public.reward_transactions
        (user_id, type, amount, subscription_id, description)
      values
        (v_candidate.user_id, 'ledger_reset', -greatest(v_snapshot, 0),
         v_candidate.subscription_id, '新約重置：帳本清空（延遲補沖）');

      v_repaired_ids := array_append(v_repaired_ids, v_candidate.user_id);
    exception when others then
      v_failed := v_failed || jsonb_build_object('user_id', v_candidate.user_id, 'error', sqlerrm);
      perform public.log_system_alert('repair_orphaned_forfeitures', 'error', sqlerrm,
        jsonb_build_object('user_id', v_candidate.user_id,
                           'subscription_id', v_candidate.subscription_id));
      raise warning 'repair_orphaned_forfeitures：補沖 user_id=% 失敗: %', v_candidate.user_id, sqlerrm;
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

revoke execute on function public.repair_orphaned_forfeitures(uuid) from anon, authenticated, public;
