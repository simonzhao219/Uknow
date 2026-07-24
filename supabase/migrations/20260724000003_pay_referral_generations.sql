-- ============================================================
-- Uknow — 0724 (3) 共用發獎函數 pay_referral_generations + reconcile_king_credits
-- ============================================================
-- reward_config migration 的檔頭自述：這支金流函數被全量覆寫五版、
-- 「少同步一個字面就是一次無聲回退——本專案已踩過三次」。規則更新後
-- 付款路徑與任務續約路徑都要發三代獎金，若各留一份複製就是重種同一個
-- 病。故把「沿推薦鏈發最多三代 referral_reward」收斂成單一真相函數，
-- 付款（apply_referral_side_effects）與續約（claim_referral_king_reward）
-- 皆呼叫它。
--
-- 兩個事件鍵二選一：付款帶 p_subscription_id、續約帶 p_claim_id；冪等鍵
-- 各自綁該欄（用 is not distinct from 同時涵蓋另一欄為 null 的情形）。
-- 每一代各包一層 begin…exception（warning-only），gen3 失敗不拖累 gen1/2
-- ——與現行 apply_referral_side_effects 的 per-gen 隔離一致。
-- ============================================================

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
    exception when others then
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
      exception when others then
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
        exception when others then
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
-- reconcile_king_credits：對某使用者某月的推薦王 credit 做冪等對帳。
-- 目標張數 = floor(當月新人數 / 門檻)，補足與現有張數的差額。用 max
-- 推導下一個 round_ordinal（防空號），on conflict do nothing 保重放安全。
--
-- 進來先 for update 鎖 task_progress(U)：新增下線路徑本來就靠這列的
-- UPDATE 鎖排隊，續約路徑也會呼叫本函數卻不動這列——加鎖讓兩條路徑
-- 一致序列化，避免併發下讀到較舊 count 而少發一張。
-- ------------------------------------------------------------
create or replace function public.reconcile_king_credits(
  p_user_id   uuid,
  p_month_key text,
  p_threshold int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count  int;
  v_target int;
  v_next   int;
begin
  select coalesce(jsonb_array_length(monthly_referrals -> p_month_key), 0)
    into v_count
  from public.task_progress
  where user_id = p_user_id
  for update;

  if v_count is null then
    return;  -- 該使用者尚無 task_progress 列（無下線），無需對帳
  end if;

  v_target := v_count / p_threshold;   -- 整數除法 = floor

  select coalesce(max(round_ordinal), 0) into v_next
  from public.referral_king_rewards
  where user_id = p_user_id and month_key = p_month_key;

  while v_next < v_target loop
    v_next := v_next + 1;
    insert into public.referral_king_rewards (user_id, month_key, round_ordinal, status, granted_at)
    values (p_user_id, p_month_key, v_next, 'unclaimed', now())
    on conflict (user_id, month_key, round_ordinal) do nothing;
  end loop;
end;
$$;

revoke execute on function public.reconcile_king_credits(uuid, text, int)
  from anon, authenticated, public;
