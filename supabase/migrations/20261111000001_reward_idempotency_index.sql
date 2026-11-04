-- ============================================================
-- reward_transactions 冪等唯一索引＋repair_orphaned_claim_rewards 補鎖
-- （第 5 波 S2 階段 1；稽核 ref P1-2、P2-1，見 reward-transactions-unique.test.ts、
--   claim-cascade-repair.test.ts〈兩個並行補發〉）
-- ============================================================
--
-- 為什麼：三代獎金、ledger_reset、提領退件退款的冪等全靠「not exists＋鎖」。
-- repair_orphaned_claim_rewards 補發前不鎖 profiles，同一會員兩個並行的
-- /auth/profile 都會通過 not exists、各插一份 → 上線同一事件拿兩次 100P。
--
-- 修法：
--   1. 四組 partial unique index：DB 層最後一道，同一事件的第二列存不進去。
--      正式站與 develop 建立前已查無重複列（主 session 2026-11-04 23:00 代跑）。
--      本檔不做自動去重——去重＝刪帳本列，必須人審。
--   2. pay_referral_generations：基準 = 20260724000003，唯一差異 = 三代各自的
--      exception 在 when others 之前加 when unique_violation then null
--      （撞索引＝已發過，不寫 warning 告警）。
--   3. repair_orphaned_claim_rewards：基準 = 20260807000001，唯一差異 = 候選
--      依 (claimer, claim) 排序；迴圈內先 for update 鎖 claimer 的 profiles 列再
--      重查，已補過就跳過。鎖序：本函式不持任何 payment_orders 鎖，與
--      process_successful_payment（order → profiles）無環。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 冪等唯一索引
-- ------------------------------------------------------------
create unique index if not exists reward_transactions_referral_sub_uniq
  on public.reward_transactions (referee_user_id, generation, subscription_id)
  where type = 'referral_reward' and subscription_id is not null;

create unique index if not exists reward_transactions_referral_claim_uniq
  on public.reward_transactions (referee_user_id, generation, source_claim_id)
  where type = 'referral_reward' and source_claim_id is not null;

create unique index if not exists reward_transactions_withdrawal_refund_uniq
  on public.reward_transactions (withdrawal_id)
  where type = 'adjustment' and withdrawal_id is not null;

create unique index if not exists reward_transactions_ledger_reset_uniq
  on public.reward_transactions (subscription_id)
  where type = 'ledger_reset';

-- ------------------------------------------------------------
-- 2. pay_referral_generations（基準 20260724000003）
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

-- ------------------------------------------------------------
-- 3. repair_orphaned_claim_rewards（基準 20260807000001）
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
    -- 鎖序：多人時依 claimer、claim 排序取 profiles 鎖，全域執行不互鎖。
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
