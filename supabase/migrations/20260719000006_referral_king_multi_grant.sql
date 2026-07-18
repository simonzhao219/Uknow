-- ============================================================
-- Uknow — 0719 0006 推薦王：單月可多次發放（H3）+ 不重複人數計（L2）
-- ============================================================
--
-- 業務決策（使用者拍板）：推薦王改為「單月每滿門檻位不重複被推薦者發一批
-- 免費續約 1 年」，可於同月多次達成（前端 MonthlyKingProgress 早已顯示
-- 「第 N 次完成」，此前後端卻只發 1 筆/月——本 migration 把後端補齊）。
--
--   H3：referral_king_rewards 由「每人每月一筆」改為「每人每月每批一筆」。
--       新增 batch_index，唯一鍵改為 (user_id, month_key, batch_index)。
--       發放時 batches = floor(不重複人數 / 門檻)，補齊 1..batches 各一筆。
--   L2：門檻改以「不重複被推薦者」計（monthly_referrals 陣列去重長度），
--       續約/重複付款事件不會灌大推薦王人數（推薦王＝推薦「人」數）。
--   H2：referred_by_user_id 指向自己時視為無上線（不建邊、不發任何一代
--       獎勵，也不計推薦王）。
--
-- 基準 = live 版 20260719000002（reward_config，config-driven 獎金/門檻 +
-- 名字快照 + rewire）。本檔沿用其「讀 reward_config」的取值方式（獎金
-- 額度、推薦王門檻皆來自 reward_config，讀不到 fallback 100/8），只在其上
-- 疊加 H2 自付防禦、L2 去重、H3 多批發放。其餘（鎖、冪等、例外隔離、
-- 名字快照）一字不動。
-- ============================================================

-- ------------------------------------------------------------
-- 1. schema：batch_index + 唯一鍵
-- ------------------------------------------------------------
alter table public.referral_king_rewards
  add column if not exists batch_index int not null default 1;

alter table public.referral_king_rewards
  drop constraint if exists uq_referral_king_rewards_user_month;
alter table public.referral_king_rewards
  add constraint uq_referral_king_rewards_user_month_batch
  unique (user_id, month_key, batch_index);

-- ------------------------------------------------------------
-- 2. apply_referral_side_effects（最終版：config-driven + H2/L2/H3）
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
  v_referrer1        uuid;
  v_referrer2        uuid;
  v_referrer3        uuid;
  v_code_id          uuid;
  v_ref_code         text;
  v_month_key        text;
  v_distinct_count   int;
  v_batches          int;
  v_applied          text[] := '{}';
  v_referee_name     text;
  v_referrer1_name   text;
  v_reward_amount    int;    -- 每代獎金，取自 reward_config
  v_king_threshold   int;    -- 推薦王月門檻，取自 reward_config
begin
  -- 可變常數單一真相：讀 reward_config；讀不到就 fallback 回現值。
  select referral_reward_amount, referral_king_monthly_threshold
    into v_reward_amount, v_king_threshold
  from public.reward_config
  where id = true;
  v_reward_amount  := coalesce(v_reward_amount, 100);
  v_king_threshold := coalesce(v_king_threshold, 8);

  select referred_by_user_id, name into v_referrer1, v_referee_name
  from public.profiles
  where id = p_user_id
  for update;

  -- H2 自我推薦縱深防禦：referred_by_user_id 指向自己 → 視為無上線。
  if v_referrer1 = p_user_id then
    v_referrer1 := null;
  end if;

  -- 3a. 推薦碼：沿用既有 active 碼，沒有才產生。
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

  select name into v_referrer1_name from public.profiles where id = v_referrer1;

  -- 3b. 推薦邊 rewire（0008 起）
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

  -- 3c. 第 1 代獎勵 + task_progress + 推薦王（多批發放）
  if not exists (
    select 1 from public.reward_transactions
    where referee_user_id = p_user_id and generation = 1 and subscription_id = p_subscription_id
  ) then
    begin
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, subscription_id,
         description, referee_name, referee_referrer_name)
      values
        (v_referrer1, 'referral_reward', v_reward_amount, 1, p_user_id, p_subscription_id,
         '推薦獎勵（第 1 代）', v_referee_name, null);

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
        updated_at = now();

      -- L2：以「不重複被推薦者」數量計推薦王門檻（續約/重複付款不灌數）。
      select count(distinct elem) into v_distinct_count
      from public.task_progress tp,
           lateral jsonb_array_elements_text(coalesce(tp.monthly_referrals -> v_month_key, '[]'::jsonb)) as elem
      where tp.user_id = v_referrer1;

      -- H3：每滿門檻位不重複被推薦者發一批 credit；補齊 1..batches 各一筆。
      -- unique(user_id, month_key, batch_index) + on conflict do nothing：
      -- 補跑/重放天然冪等，已領取的批次不會被重建（列已存在）。
      v_batches := floor(coalesce(v_distinct_count, 0)::numeric / v_king_threshold);
      if v_batches >= 1 then
        insert into public.referral_king_rewards (user_id, month_key, batch_index, status, granted_at)
        select v_referrer1, v_month_key, gs, 'unclaimed', now()
        from generate_series(1, v_batches) as gs
        on conflict (user_id, month_key, batch_index) do nothing;
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
          (user_id, type, amount, generation, referee_user_id, subscription_id,
           description, referee_name, referee_referrer_name)
        values
          (v_referrer2, 'referral_reward', v_reward_amount, 2, p_user_id, p_subscription_id,
           '推薦獎勵（第 2 代）', v_referee_name, v_referrer1_name);
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
            (user_id, type, amount, generation, referee_user_id, subscription_id,
             description, referee_name, referee_referrer_name)
          values
            (v_referrer3, 'referral_reward', v_reward_amount, 3, p_user_id, p_subscription_id,
             '推薦獎勵（第 3 代）', v_referee_name, v_referrer1_name);
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
