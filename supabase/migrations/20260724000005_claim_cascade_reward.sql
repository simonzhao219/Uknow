-- ============================================================
-- Uknow — 0724 (5) claim_referral_king_reward：任務續約也對上線發三代 100P
-- ============================================================
-- 規則更新：任務成功續約（領取「免費續約 1 年」credit）現在也算「下線
-- 續約」，要對領取者的上線鏈發三代 100P。這推翻 0006「用任務領的續約
-- 不是真的付款、不該觸發推薦鏈」的原設計。
--
-- 基準 = 20260721000005（claim_blocks_suspended）。唯一差異：在「延展
-- 訂閱 + 標記 claimed」之後，warning-only 包一層呼叫共用發獎函數
-- pay_referral_generations（冪等鍵綁這次 claim = p_reward_id），發獎失敗
-- 不回滾「訂閱已延展」的事實。不 +1 task（續約不計）。
--
-- 冪等：已 claimed 的 credit 在守衛前就 idempotent 回傳，發獎區塊只在
-- 首次 claim 成功分支跑；再加 source_claim_id 冪等鍵雙保險。
-- 其餘（鎖定、擁有權、停權/到期守衛、延展計算）與基準逐字相同。
-- ============================================================

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
  v_suspended      timestamptz;
  v_sub_id         uuid;
  v_old_end        timestamptz;
  v_new_last_day   date;
  v_new_end        timestamptz;
  v_new_grace      timestamptz;
  v_reward_amount  int;
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
    -- 已領取：冪等回傳成功，不重複延展、不重複發獎。刻意放在守衛之前。
    return jsonb_build_object('success', true, 'idempotent', true, 'status', 'claimed');
  end if;

  -- 鎖定該用戶「目前」訂閱（依 end_date 排序取最新一筆）。
  select id, end_date into v_sub_id, v_old_end
  from public.subscriptions
  where user_id = p_user_id
  order by end_date desc
  limit 1
  for update;

  if v_sub_id is null then
    return jsonb_build_object('success', false, 'error_code', 'no_subscription', 'message', '找不到可延展的訂閱紀錄，請聯繫客服');
  end if;

  -- 停權優先擋（與 request_withdrawal 一致）。
  select suspended_at into v_suspended from public.profiles where id = p_user_id;
  if v_suspended is not null then
    return jsonb_build_object(
      'success', false,
      'error_code', 'suspended',
      'message', '帳號已停權，無法領取免費續約，請聯繫客服'
    );
  end if;

  -- 到期不得領取（不允許到期會員用 credit 免費復活）。
  if v_old_end is null or now() > v_old_end then
    return jsonb_build_object(
      'success', false,
      'error_code', 'subscription_invalid',
      'message', '會員資格已失效，請先續訂會員後再領取免費續約'
    );
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

  -- ★ 規則更新：任務續約＝下線續約，對領取者（p_user_id）的上線鏈發三代
  --   100P。warning-only 隔離：發獎失敗不回滾「訂閱已延展 + credit 已領」。
  --   不 +1 task（續約不計）。冪等鍵綁這次 claim（source_claim_id）。
  begin
    select referral_reward_amount into v_reward_amount from public.reward_config where id = true;
    perform public.pay_referral_generations(
      p_user_id,
      coalesce(v_reward_amount, 100),
      null,          -- p_subscription_id：續約無新訂閱事件
      p_reward_id,   -- p_claim_id：冪等鍵綁這次 claim
      '・任務續約'
    );
  exception when others then
    perform public.log_system_alert('claim_referral_king_reward', 'warning', sqlerrm,
      jsonb_build_object('user_id', p_user_id, 'reward_id', p_reward_id, 'step', 'referral_cascade'));
    raise warning 'claim_referral_king_reward：續約推薦獎勵處理失敗（續約已完成，reward_id=%）: %', p_reward_id, sqlerrm;
  end;

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
