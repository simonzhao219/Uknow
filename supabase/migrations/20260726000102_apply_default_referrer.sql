-- ============================================================
-- Uknow — 0726 (102) 預設推薦人接進 apply_referral_side_effects
-- ============================================================
--
-- 基準 = 20260724000004（pair-history 版）。唯一差異：3a 之後新增
-- 3a-bis 區塊——v_referrer1 為 null 時呼叫 resolve_default_referrer
--（0726 0101），解析成功則回寫 profiles 三欄位並繼續走 3b–3d。
-- 其餘（讀 config、鎖、3a 建碼、3b rewire、3c 三代、3d task/king、
-- 例外隔離）一字不動。
--
-- 為什麼要回寫而不是只設區域變數：pay_referral_generations
--（20260724000003:38-42）自己重讀 profiles.referred_by_user_id，
-- 不吃呼叫端變數——不回寫則 gen1 早退，一毛都不會發。回寫落在
-- 函數頂端既有的 for update 鎖內，與 repair_orphaned_payments 序列化。
--
-- 新欄位 referred_by_is_default：供前端契約（isAutoReferral）分辨
-- 「這是自動綁定」。不採「拿 code 比對 config」——營運換碼後該比對
-- 會把歷史綁定全部誤判。清除時機在 /payuni/prepare 的 fresh 換線
--（Edge Function 側，階段 3），該處是 referred_by_* 的第二個寫入點。
--
-- 3a-bis 自包一層 exception：主函數沒有頂層例外處理，未捕捉的例外
-- 會展開到 process_successful_payment 的 savepoint，把已成功的 3a
-- 建碼一併回滾（v2 審查 P1-1）。任何例外一律告警 + 視同無推薦人。
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles.referred_by_is_default
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists referred_by_is_default boolean not null default false;

comment on column public.profiles.referred_by_is_default is
  'referred_by_* 是否由預設推薦人機制自動寫入（true）而非使用者輸入。'
  '寫入於 apply_referral_side_effects 套用預設時；fresh 換線到真推薦人時'
  '由 /payuni/prepare 重置為 false。稽核查詢走 SQL，不建 admin UI。';

comment on column public.profiles.referred_by_code is
  '註冊當下使用的推薦碼字串（稽核用）。referred_by_is_default = true 時'
  '為預設推薦人機制自動寫入，非使用者輸入。';

-- ------------------------------------------------------------
-- 2. apply_referral_side_effects：基準 20260724000004 + 3a-bis
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
