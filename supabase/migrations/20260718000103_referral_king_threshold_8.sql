-- ============================================================
-- Uknow — 0718 0103 推薦王門檻由 10 人調整為 8 人
-- ============================================================
--
-- 業務變更：推薦王月任務的達標門檻從「單月推薦滿 10 人」下修為
-- 「單月推薦滿 8 人」，達標即發放一筆可領取的「免費續約 1 年」credit
-- （未領取狀態，需使用者主動 claim 才延展會員效期）。
--
-- 只重定義 apply_referral_side_effects 這一個函數，且唯一實質差異是
-- 3c 區塊的門檻常數 10 → 8。其餘邏輯（推薦碼、推薦邊 rewire、三代
-- 推薦獎金、鎖與冪等、周邊隔離）與 0008 (renewal_modes) 完全相同。
--
-- 冪等與防重仍靠 referral_king_rewards 的 unique(user_id, month_key)：
-- 用 >= 8 而不是 = 8，讓補跑/批次重放時就算一次跳過 8 這個整數也不會
-- 漏發或重發。既有已在 10 人門檻發出的 credit 不受影響。
-- ============================================================

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

      -- 推薦王：本月累積推薦數達 8 人門檻即發放「免費續約一年」credit
      -- （未領取狀態）。用 >=8 而不是 =8，加上 unique(user_id,
      -- month_key) 雙重保險：就算這段邏輯被 repair_orphaned_payments
      -- 重放、或補跑時一次跳過 8 這個整數，也不會重複發放。
      if v_month_count >= 8 then
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
