-- ============================================================
-- 新約換線驗單上的碼（第 6 波 S6；R5 P2-6；裁決 W6-27；見 renewal-referrer-intent.test.ts）
-- ============================================================
--
-- 為什麼：0d 對 source＝default 的單重讀付款當下的 reward_config.default_referrer_code，卻拿建單時
--   解析的推薦人（fresh_referrer_user_id）比。建單到付款之間（最長 3 天）後台換了預設碼 → 兩者
--   必不相等 → 寫「已停權或失效」（原因錯）並維持原推薦人（與確認框「將改變」不符）。
-- 裁決（W6-27）：綁建單時單上記的舊預設推薦人；舊碼失效才維持原推薦人，告警分句。
--
-- 修法（基準與唯一差異）：
--   process_successful_payment：基準＝20261113000003（之後 20261114000001～20261116000005 皆未重定義）。
--   唯一差異（皆在 0d）：
--     a. v_check_code 一律取單上的 fresh_referrer_code；單上為 null 的 default 單退回付款當下的
--        預設碼（舊語意，只剩本檔套用前建的單）。referred_by_code 因此寫單上的碼。
--     b. fresh_referrer_invalid：default 單在自己的子交易內讀付款當下的預設碼——已停用（null）／
--        已更換／未換三種 message；context 加 current_default_code，讀失敗另帶
--        current_default_code_read_failed＝true 並退回原句。
--   鎖序、0a′、例外隔離、v_duplicate 不換線皆不動。
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
  v_ref_user         uuid;
  v_ref_code         text;
  v_ref_source       text;
  v_valid_user       uuid;
  v_check_code       text;
  v_cur_default      text;
  v_cur_read_ok      boolean;
  v_own_code_id      uuid;
  v_king_threshold   integer;
  v_bucket_len       integer;
  v_old_base         integer;
  v_max_round        integer;
  v_new_base         integer;
begin
  -- 0. 鎖住這筆訂單，序列化同一筆 p_trade_no 的並行呼叫（notify webhook
  --    與 return 導回幾乎同時到達、或 PayUni 對 notify 重試時）。
  select id, status, renewal_mode, created_at,
         fresh_referrer_user_id, fresh_referrer_code, fresh_referrer_source
    into v_order_id, v_order_status, v_renewal_mode, v_order_created_at,
         v_ref_user, v_ref_code, v_ref_source
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

  -- 0a′. 換線序列化鎖（S6）：曾訂閱者的 fresh 付款在「鎖 profiles 之前」先取全域
  --     advisory。放在 0b 之後會死鎖：持鎖者發獎時要對收獎者 profiles 取 KEY SHARE，
  --     收獎者若同時付 fresh（已持自己的 profiles、正在等這把鎖）就互等。放在這裡，
  --     等鎖的一方手上只有自己的訂單列鎖（沒有別人會等它）。不在 0d 的子交易內：
  --     錯誤不被局部吞掉，由最外層改寫後整筆回滾、notify／對帳重試。
  --     W5-61：批次自癒（complete_paid_pending_orders 單一交易跑多筆）時改用 try——前幾筆的
  --     profiles 列鎖留到整個批次結束，在這裡等鎖會與持鎖的線上付款（發獎要 KEY SHARE 該
  --     profiles）成環。拿不到就以 SQLSTATE U6R01 退出，批次把該筆記為跳過、下一輪再補。
  if v_renewal_mode = 'fresh'
     and exists (select 1 from public.subscriptions where user_id = p_user_id) then
    if coalesce(current_setting('uknow.rewire_try_lock', true), '') = 'on' then
      if not pg_try_advisory_xact_lock(hashtext('referral_rewire')) then
        raise exception '換線鎖忙碌，批次自癒跳過（trade_no=%）', p_trade_no
          using errcode = 'U6R01';
      end if;
    else
      perform pg_advisory_xact_lock(hashtext('referral_rewire'));
    end if;
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

  -- 0d. 新約換線（S6；ref P0-1）：意圖存在訂單上，只有「續費者的 fresh、非重複付款
  --     （W5-49①）、source 為 code／default」才在付款當下寫 profiles 與推薦邊——建單、
  --     棄單、extend 都不動推薦人。換線前重驗碼（W5-56：停權／失效）與成環（W5-49②）；
  --     任一不過或例外 → 不換線、帳本照清（使用者確認的是新約）、error 告警。
  --     changed_at 記付款時點（track_referred_by_change 讀交易層設定），#167 自癒閘門
  --     才會放行這筆付款。profiles 與 edge 同一子交易寫，同生同滅。
  if v_renewal_mode = 'fresh' and v_is_renewal and not v_duplicate
     and v_ref_source in ('code', 'default') then
    begin
      v_valid_user := null;
      -- 第 6 波 S6（R5 P2-6、W6-27）：一律驗單上記的碼（default＝建單時的預設碼）。單上沒有碼的
      -- default 單（本檔前、舊 Edge 建的）退回付款當下的預設碼（舊語意）。
      v_check_code := coalesce(v_ref_code, case
        when v_ref_source = 'default' then (
          select nullif(lower(trim(default_referrer_code)), '')
          from public.reward_config where id = true)
      end);
      if v_check_code is not null then
        select referrer_user_id into v_valid_user
        from public.validate_referral_code(v_check_code);
      end if;

      if v_ref_user is null then
        perform public.log_system_alert('fresh_referrer_missing', 'error',
          '新約換線：被選的推薦人帳號已不存在，維持原推薦人（帳本照清）',
          jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                             'fresh_referrer_code', v_ref_code, 'fresh_referrer_source', v_ref_source));
      elsif v_valid_user is distinct from v_ref_user then
        -- 告警分句（W6-27）：default 單另讀付款當下的預設碼，分「已更換」「機制已停用」「未換」。
        -- 讀取包在自己的子交易：失敗只退回原句，不把整段 0d 打成 fresh_rewire_failed。
        v_cur_default := null;
        v_cur_read_ok := false;
        if v_ref_source = 'default' then
          begin
            select nullif(lower(trim(default_referrer_code)), '') into v_cur_default
            from public.reward_config where id = true;
            v_cur_read_ok := true;
          exception when others then
            v_cur_default := null;
          end;
        end if;
        perform public.log_system_alert('fresh_referrer_invalid', 'error',
          case
            when v_ref_source = 'default' and v_cur_read_ok and v_cur_default is null then
              '新約換線：預設推薦人機制已停用，且建單時的預設推薦碼在付款當下已停權或失效，維持原推薦人（帳本照清）'
            when v_ref_source = 'default' and v_cur_read_ok and v_cur_default is distinct from lower(trim(v_check_code)) then
              '新約換線：建單時的預設推薦碼已被更換，且原碼在付款當下已停權或失效，維持原推薦人（帳本照清）'
            else '新約換線：被選的推薦碼在付款當下已停權或失效，維持原推薦人（帳本照清）'
          end,
          jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                             'fresh_referrer_user_id', v_ref_user, 'fresh_referrer_code', v_ref_code,
                             'fresh_referrer_source', v_ref_source)
            || case when v_ref_source = 'default' then
                 jsonb_build_object('current_default_code', v_cur_default)
                   || case when v_cur_read_ok then '{}'::jsonb
                           else jsonb_build_object('current_default_code_read_failed', true) end
               else '{}'::jsonb end);
      elsif public.referral_would_cycle(p_user_id, v_ref_user) then
        perform public.log_system_alert('fresh_referrer_cycle', 'error',
          '新約換線：被選的推薦人在付款當下已在本人推薦樹內，維持原推薦人（帳本照清）',
          jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                             'fresh_referrer_user_id', v_ref_user, 'fresh_referrer_source', v_ref_source));
      else
        perform set_config('uknow.referred_by_changed_at', v_paid_at::text, true);
        update public.profiles
        set referred_by_user_id    = v_ref_user,
            referred_by_code       = v_check_code,
            referred_by_is_default = (v_ref_source = 'default')
        where id = p_user_id;

        select id into v_own_code_id
        from public.referral_codes
        where user_id = p_user_id and status = 'active'
        limit 1;
        insert into public.referral_edges (referee_user_id, referrer_user_id, referral_code_id)
        values (p_user_id, v_ref_user, v_own_code_id)
        on conflict (referee_user_id) do update
          set referrer_user_id = excluded.referrer_user_id,
              referral_code_id = excluded.referral_code_id
          where referral_edges.referrer_user_id is distinct from excluded.referrer_user_id;
      end if;
    exception when others then
      perform public.log_system_alert('fresh_rewire_failed', 'error', sqlerrm,
        jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                           'fresh_referrer_user_id', v_ref_user, 'fresh_referrer_code', v_ref_code,
                           'fresh_referrer_source', v_ref_source));
    end;
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
      -- S6（W5-8）：清當月計數前記下該月「已應發」的推薦王張數（king_round_base），新約後
      -- 當月從 0 計門檻、round_ordinal 接續；已發的 credit 不動。取 greatest 保住「已達門檻
      -- 但對帳尚未補發」的張數，且多次新約不丟前一次的 base。先鎖 task_progress，擋住併發的
      -- 「新下線 +1」插在讀桶與清桶之間。配對名單另存在 referral_pair_history，不受清桶影響。
      -- W5-58：base 的計算與寫入自成子交易——失敗只寫 error 告警（context 帶應寫的 base，
      -- 供客服人工補），付款、ledger_reset 與下面的清桶照常。
      v_new_base := null;
      begin
        select referral_king_monthly_threshold into v_king_threshold
        from public.reward_config where id = true;
        v_king_threshold := coalesce(v_king_threshold, 8);
        select coalesce(jsonb_array_length(monthly_referrals -> v_reset_month_key), 0),
               coalesce((king_round_base ->> v_reset_month_key)::int, 0)
          into v_bucket_len, v_old_base
        from public.task_progress
        where user_id = p_user_id
        for update;
        select coalesce(max(round_ordinal), 0) into v_max_round
        from public.referral_king_rewards
        where user_id = p_user_id and month_key = v_reset_month_key;
        v_new_base := greatest(
          v_max_round,
          coalesce(v_old_base, 0) + coalesce(v_bucket_len, 0) / v_king_threshold);
        if v_new_base > 0 then
          update public.task_progress
          set king_round_base = jsonb_set(king_round_base, array[v_reset_month_key], to_jsonb(v_new_base))
          where user_id = p_user_id;
        end if;
      exception when others then
        perform public.log_system_alert('king_round_base', 'error', sqlerrm,
          jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                             'month_key', v_reset_month_key, 'base', v_new_base));
      end;
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
          'fresh_referrer_user_id', v_ref_user,
          'fresh_referrer_code', v_ref_code,
          'fresh_referrer_source', v_ref_source,
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

  -- S6（W5-50①）：曾訂閱者的單沒有續費模式＝prepare 以外的建單路徑漏網。照常開通
  -- （效期、帳本、推薦人行為不變），寫 error 交人工。
  if v_is_renewal and v_renewal_mode is null then
    begin
      perform public.log_system_alert('renewal_without_mode', 'error',
        '曾訂閱者的付款沒有續費模式（未選續約／新約），已依首購語意開通，請人工確認',
        jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id, 'subscription_id', v_sub_id));
    exception when others then
      raise warning 'process_successful_payment：無模式告警失敗（trade_no=%）: %', p_trade_no, sqlerrm;
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

exception
  when sqlstate 'U6R01' then
    raise;  -- W5-61：保留 SQLSTATE，批次自癒據此判定「跳過」而非失敗。
  when others then
    raise exception 'process_successful_payment 失敗: %', sqlerrm;
end;
$$;

revoke execute on function public.process_successful_payment(uuid, text, text, jsonb) from anon, authenticated, public;

