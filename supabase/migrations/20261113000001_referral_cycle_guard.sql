-- ============================================================
-- 推薦成環防線（第 5 波 S6 階段 1；稽核 ref P0-2；見 referral-cycle.test.ts）
-- ============================================================
--
-- 為什麼：referral_edges 只擋「自己推自己」，fresh 驗碼也只擋自己——過期會員 M 以
-- 自己一代 D 的碼做新約並付款 → 邊 M→D、D→M；M 付款時 gen2＝D 的推薦人＝M，
-- 付款人領到自己這筆付款的獎金，D 再拿 gen3。三角環同理。
--
-- 修法：
--   1. referral_would_cycle(p_referee, p_new_referrer)：p_new_referrer 在 p_referee 的
--      推薦樹內（任何深度，W5-49③）或就是本人 → true。自 p_new_referrer 沿
--      referral_edges 往上爬；遞迴用 union（非 union all）去重，資料已有環時也保證終止。
--      prepare（Edge 預檢＋建單 RPC）與付款換線（process_successful_payment 0d）共用。
--   2. pay_referral_generations：基準 = 20261111000001，唯一差異 = 三代各自在發獎前
--      檢查收獎者是否為付款人本人；是 → 寫 error 告警 referral_cycle_detected、
--      本代與其後各代不發（縱深：正常情況前兩道防線已擋下，只有資料已成環才會走到）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. referral_would_cycle
-- ------------------------------------------------------------
create or replace function public.referral_would_cycle(
  p_referee      uuid,
  p_new_referrer uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_new_referrer = p_referee
    or exists (
      with recursive up(uid) as (
        select p_new_referrer
        union
        select e.referrer_user_id
        from public.referral_edges e
        join up on e.referee_user_id = up.uid
      )
      select 1 from up where up.uid = p_referee
    );
$$;

-- security definer 且以參數指定任意人：只給 Edge Function 的 service_role。
revoke execute on function public.referral_would_cycle(uuid, uuid)
  from anon, authenticated, public;
grant execute on function public.referral_would_cycle(uuid, uuid)
  to service_role;

-- ------------------------------------------------------------
-- 2. pay_referral_generations（基準 20261111000001）
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
      perform public.log_system_alert('pay_referral_generations', 'warning', sqlerrm,
        jsonb_build_object('referee', p_referee, 'generation', 1,
          'subscription_id', p_subscription_id, 'claim_id', p_claim_id));
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
        perform public.log_system_alert('pay_referral_generations', 'warning', sqlerrm,
          jsonb_build_object('referee', p_referee, 'generation', 2,
            'subscription_id', p_subscription_id, 'claim_id', p_claim_id));
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
          perform public.log_system_alert('pay_referral_generations', 'warning', sqlerrm,
            jsonb_build_object('referee', p_referee, 'generation', 3,
              'subscription_id', p_subscription_id, 'claim_id', p_claim_id));
        end;
      end if;
    end if;
  end if;

  return v_applied;
end;
$$;

revoke execute on function public.pay_referral_generations(uuid, int, uuid, uuid, text)
  from anon, authenticated, public;
