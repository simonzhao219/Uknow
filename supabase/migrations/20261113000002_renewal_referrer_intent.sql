-- ============================================================
-- 新約換線意圖改存訂單（第 5 波 S6 階段 2；稽核 ref P0-1＝pay P0-1、ref P0-2、pay P1-1、
-- pay P1-4；裁決 W5-49、W5-50、W5-52、W5-56；見 renewal-referrer-intent.test.ts）
-- ============================================================
--
-- 為什麼：/payuni/prepare 在建單時就把新約的新推薦人寫進 profiles，付款時
-- apply_referral_side_effects 不看訂單模式、一律依 profiles rewire——新約棄單後改付
-- 續約，照樣換線並把三代獎金發給新推薦人那條線（不清帳本也能換推薦人）。
--
-- 修法（每支函式的基準與唯一差異）：
--   1. payment_orders 加換線意圖三欄（被選推薦人、碼、source＝code／default／keep）。
--      非 fresh、首購單皆 null；續費 fresh 單 source 為 null＝本檔套用後、新 Edge 部署前
--      由舊 Edge 經三參數版建的單（舊 Edge 已直接寫過 profiles），付款時不動 profiles。
--   2. prepare_payment_order 六參數版（新，回 jsonb）：鎖序與 20261111000002 相同但改
--      for no key update；新增 paid_pending（pay P1-4，W5-50②）、mode_required
--      （pay P1-1）、cycle（ref P0-2）。三參數版改為委派六參數版的 wrapper。
--   3. process_successful_payment：基準 = 20261111000003，唯一差異 = 0a′ 換線序列化鎖、
--      0d 付款當下換線（重驗碼 W5-56、成環 W5-49②、例外隔離）、重複付款告警帶意圖
--      （W5-49①）、曾訂閱者無模式告警 renewal_without_mode（W5-50①）。
--      鎖序：payment_orders(本單) →（曾訂閱者的 fresh）advisory → profiles(本人) → 周邊。
--   4. apply_referral_side_effects：基準 = 20260726000102，唯一差異 = 3a-bis 回寫預設
--      推薦人前設 uknow.referred_by_changed_at = p_paid_at（W5-52）。
--   5. track_referred_by_change：基準 = 20260807000001，唯一差異 = 改記交易層設定
--      uknow.referred_by_changed_at（沒設則 now()）。#167 閘門比 changed_at ≤ completed_at，
--      而 completed_at 是 PayUni 授權時點、早於付款交易的 now()——付款交易內寫推薦人時
--      閘門原本必然排除該筆（正式站已有 3 筆，獎金皆已正常發放）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 換線意圖欄
-- ------------------------------------------------------------
alter table public.payment_orders
  add column if not exists fresh_referrer_user_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists fresh_referrer_code text,
  add column if not exists fresh_referrer_source text
    check (fresh_referrer_source in ('code', 'default', 'keep'));

comment on column public.payment_orders.fresh_referrer_source is
  '新約換線意圖：code＝使用者填碼、default＝未填碼套預設推薦人、keep＝預設推薦人不可用而維持原推薦人。'
  '只在續費者的 fresh 單付款成功時（process_successful_payment 0d）才寫入 profiles。';

-- ------------------------------------------------------------
-- 2. prepare_payment_order（六參數版＋三參數 wrapper）
-- ------------------------------------------------------------
create or replace function public.prepare_payment_order(
  p_user_id          uuid,
  p_trade_no         text,
  p_renewal_mode     text,
  p_referrer_user_id uuid,
  p_referrer_code    text,
  p_referrer_source  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suspended timestamptz;
  v_paid_no   text;
  v_source    text := p_referrer_source;
begin
  -- for no key update（S6）：仍與付款的 for update 互斥（S2 的序列化不變），但不擋
  -- 別人的 KEY SHARE——付款交易發獎時要對收獎者（可能就是本人）取 KEY SHARE。
  select suspended_at into v_suspended
  from public.profiles
  where id = p_user_id
  for no key update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_suspended is not null then
    return jsonb_build_object('outcome', 'suspended');
  end if;

  if exists (
    select 1 from public.user_account_status
    where user_id = p_user_id and status = 'active'
  ) then
    return jsonb_build_object('outcome', 'active');
  end if;

  -- 已付款待開通（pay P1-4、W5-50②）：不再建單，交前端導結果頁；修不好的單由客服人工開通。
  select transaction_id into v_paid_no
  from public.payment_orders
  where user_id = p_user_id and status = 'pending'
    and payuni_response ->> 'Status' = 'SUCCESS'
  order by created_at desc
  limit 1;
  if v_paid_no is not null then
    begin
      if not exists (
        select 1 from public.system_alerts
        where source = 'checkout_blocked_paid_pending'
          and context ->> 'trade_no' = v_paid_no
          and created_at > now() - interval '24 hours'
      ) then
        perform public.log_system_alert('checkout_blocked_paid_pending', 'error',
          '已付款待開通的會員又要建單，已擋下；若開通一直失敗請人工處理',
          jsonb_build_object('user_id', p_user_id, 'trade_no', v_paid_no));
      end if;
    exception when others then
      null;  -- 告警失敗不影響擋單
    end;
    return jsonb_build_object('outcome', 'paid_pending', 'trade_no', v_paid_no);
  end if;

  -- 曾訂閱者必須選續約或新約（pay P1-1）：null 只對首購有意義。
  if p_renewal_mode is null
     and exists (select 1 from public.subscriptions where user_id = p_user_id) then
    return jsonb_build_object('outcome', 'mode_required');
  end if;

  -- 推薦成環（ref P0-2、W5-49③）：使用者填的碼 → 拒絕；預設推薦人成環 → 改記 keep
  -- （§7.4 A11：預設推薦人不可用時維持原推薦人、不阻斷金流）。
  if p_referrer_user_id is not null and v_source in ('code', 'default')
     and public.referral_would_cycle(p_user_id, p_referrer_user_id) then
    if v_source = 'code' then
      return jsonb_build_object('outcome', 'cycle');
    end if;
    perform public.log_system_alert('payuni-prepare', 'warning', 'default_referrer_unavailable_on_fresh',
      jsonb_build_object('user_id', p_user_id, 'reason', 'cycle'));
    v_source := 'keep';
  end if;

  begin
    insert into public.payment_orders
      (user_id, amount, status, payment_method, transaction_id, renewal_mode,
       fresh_referrer_user_id, fresh_referrer_code, fresh_referrer_source)
    values
      (p_user_id, 1200, 'pending', 'payuni', p_trade_no, p_renewal_mode,
       case when v_source = 'keep' then null else p_referrer_user_id end,
       case when v_source = 'keep' then null else p_referrer_code end,
       v_source);
  exception when unique_violation then
    return jsonb_build_object('outcome', 'duplicate_trade_no');
  end;

  return jsonb_build_object('outcome', 'ok');
end;
$$;

-- 六參數版刻意沒有 default：舊 Edge 以三個具名參數呼叫時才不會與三參數版多載歧義（PGRST203）。
revoke execute on function public.prepare_payment_order(uuid, text, text, uuid, text, text)
  from anon, authenticated, public;
grant execute on function public.prepare_payment_order(uuid, text, text, uuid, text, text)
  to service_role;

-- 三參數版：保留給部署空窗內的舊 Edge（下一波 drop）。委派六參數版（意圖欄 null），
-- 新 outcome（paid_pending、mode_required）對舊 Edge 是未預期值 → 500（fail-closed）。
create or replace function public.prepare_payment_order(
  p_user_id      uuid,
  p_trade_no     text,
  p_renewal_mode text
)
returns text
language sql
security definer
set search_path = public
as $$
  select public.prepare_payment_order(
    p_user_id, p_trade_no, p_renewal_mode, null::uuid, null::text, null::text) ->> 'outcome';
$$;

revoke execute on function public.prepare_payment_order(uuid, text, text)
  from anon, authenticated, public;
grant execute on function public.prepare_payment_order(uuid, text, text)
  to service_role;

-- ------------------------------------------------------------
-- 3. process_successful_payment（基準 20261111000003）
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
  v_own_code_id      uuid;
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
  if v_renewal_mode = 'fresh'
     and exists (select 1 from public.subscriptions where user_id = p_user_id) then
    perform pg_advisory_xact_lock(hashtext('referral_rewire'));
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
      v_check_code := case
        when v_ref_source = 'default' then (
          select nullif(lower(trim(default_referrer_code)), '')
          from public.reward_config where id = true)
        else v_ref_code
      end;
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
        perform public.log_system_alert('fresh_referrer_invalid', 'error',
          '新約換線：被選的推薦碼在付款當下已停權或失效，維持原推薦人（帳本照清）',
          jsonb_build_object('trade_no', p_trade_no, 'user_id', p_user_id,
                             'fresh_referrer_user_id', v_ref_user, 'fresh_referrer_code', v_ref_code,
                             'fresh_referrer_source', v_ref_source));
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

exception when others then
  raise exception 'process_successful_payment 失敗: %', sqlerrm;
end;
$$;

revoke execute on function public.process_successful_payment(uuid, text, text, jsonb) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4. apply_referral_side_effects（基準 20260726000102）
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
    perform public.log_system_alert('apply_referral_side_effects', 'warning', sqlerrm,
      jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id, 'step', 'gen_rewards'));
    raise warning 'apply_referral_side_effects：三代發獎失敗（referee=%): %', p_user_id, sqlerrm;
  end;

  -- 3d. Block B：task +1（pair-history）＋推薦王對帳（可自癒、可多張）。
  --     月份 key 錨定付款時點（p_paid_at）。
  begin
    v_month_key := to_char(coalesce(p_paid_at, now()) at time zone 'Asia/Taipei', 'YYYY-MM');

    -- pair-history：R 從未被 U 計過才算「新下線」。掃 U 的整份 monthly_referrals。
    if not exists (
      select 1
      from public.task_progress tp,
           lateral jsonb_each(tp.monthly_referrals) as m(k, v)
      where tp.user_id = v_referrer1
        and m.v @> to_jsonb(p_user_id::text)
    ) then
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
-- 5. track_referred_by_change（基準 20260807000001；觸發器本身不變）
-- ------------------------------------------------------------
create or replace function public.track_referred_by_change()
returns trigger
language plpgsql
as $$
declare
  -- S6（W5-52）：付款交易內寫推薦人時，呼叫端以交易層設定帶入付款時點；其餘寫入點
  -- 沒設 → now()。設定值以 set_config(..., true) 寫入，交易結束即失效。
  v_at timestamptz := coalesce(
    nullif(current_setting('uknow.referred_by_changed_at', true), '')::timestamptz, now());
begin
  if tg_op = 'INSERT' then
    if new.referred_by_user_id is not null then
      new.referred_by_changed_at := v_at;
    end if;
  elsif new.referred_by_user_id is distinct from old.referred_by_user_id then
    new.referred_by_changed_at := v_at;
  end if;
  return new;
end;
$$;
