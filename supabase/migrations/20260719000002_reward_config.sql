-- ============================================================
-- Uknow — 獎勵可變常數收斂到單一真相：reward_config
-- ============================================================
--
-- 背景：apply_referral_side_effects 這支金流關鍵函數短期內被
-- CREATE OR REPLACE 全量覆蓋改了五版（0005→0006→0008→0103→0719），
-- 每次業務調整（獎金 120→100、推薦王門檻 10→8）都得重寫整支函數，且
-- 少同步一個字面就是一次無聲回退——本專案已踩過三次。門檻 8 更同時
-- 散在 SQL 函數、edge function（index.ts KING_TARGET）、前端
-- （MonthlyKingProgress）三處，改一個地方就漏兩個。
--
-- 根治：把「會變的業務數字」收斂到單一真相 reward_config，SQL 讀它、
-- edge 讀它並帶進前端本來就在讀的 task payload，前端不再硬編。這次只
-- 外抽兩個真正會變的數字（獎金額度、推薦王月門檻）；type/代數/description
-- 等結構常數維持字面（改動它們等於改資料模型，不屬「調參數」）。
--
-- 相容：seed 值 = 現值（100 / 8），故所有既有測試與行為不變。
-- ============================================================

-- ------------------------------------------------------------
-- 1. reward_config：單列設定表（singleton）
--    id boolean pk default true check(id) 保證永遠只有一列。
-- ------------------------------------------------------------
create table if not exists public.reward_config (
  id                               boolean primary key default true check (id),
  referral_reward_amount           integer not null default 100 check (referral_reward_amount >= 0),
  referral_king_monthly_threshold  integer not null default 8   check (referral_king_monthly_threshold >= 1),
  updated_at                       timestamptz not null default now()
);

comment on table public.reward_config is
  '獎勵可變業務常數單一真相（單列）。SQL 函數 / edge / 前端皆以此為準。';
comment on column public.reward_config.referral_reward_amount is
  '每一代推薦獎金點數（1 點 = 1 元）。';
comment on column public.reward_config.referral_king_monthly_threshold is
  '推薦王月任務達標門檻（單月推薦人數）。';

insert into public.reward_config (id) values (true) on conflict (id) do nothing;

-- edge function 走 service_role（default privileges 已涵蓋）；SQL 函數
-- 是 security definer（以 owner 身分讀）。啟用 RLS 但不建 policy = 一般
-- 使用者一律讀不到（與 announcements 同一鎖法），不開放直查。
alter table public.reward_config enable row level security;
revoke all on public.reward_config from anon, authenticated;

-- ------------------------------------------------------------
-- 2. apply_referral_side_effects：改讀 reward_config 的兩個常數。
--    基準 = live 版 20260719000001，唯一差異：函式頂端讀 config，三處
--    insert 的獎金額度與門檻判斷改用變數。其餘（rewire、名字快照、鎖、
--    冪等、例外隔離）一字不動。config 讀不到時 fallback 回現值，永不因
--    設定缺失而少發/錯發。
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
  v_month_count      int;
  v_applied          text[] := '{}';
  v_referee_name     text;   -- 被推薦人（p_user_id）當下名，快照
  v_referrer1_name   text;   -- 被推薦人的直接推薦人（v_referrer1）當下名，快照
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

  -- 鎖住這位使用者的 profiles 列，序列化「同一人」的周邊業務邏輯全程
  -- ——process_successful_payment 的付款流程跟 repair_orphaned_payments
  -- 的補償掃描可能同時呼叫到同一個 user_id，這個鎖讓兩者排隊而不是
  -- 同時搶著建推薦碼/發獎勵。順手取被推薦人的名字快照。
  select referred_by_user_id, name into v_referrer1, v_referee_name
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

  -- 被推薦人的直接推薦人 = v_referrer1，取其當下名做第 2/3 代的括號快照
  select name into v_referrer1_name from public.profiles where id = v_referrer1;

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
  --     （含續約）都要再拿一次獎金。第 1 代：被推薦人的推薦人就是收獎者
  --     本人，故 referee_referrer_name 留 NULL。獎金額度取自 reward_config。
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
        updated_at = now()
      returning jsonb_array_length(monthly_referrals -> v_month_key) into v_month_count;

      -- 推薦王：本月累積推薦數達門檻（reward_config）即發放「免費續約一年」
      -- credit（未領取狀態）。用 >= 而不是 =，加上 unique(user_id, month_key)
      -- 雙重保險：就算被 repair_orphaned_payments 重放、或補跑時一次跳過門檻
      -- 整數，也不會重複發放。
      if v_month_count >= v_king_threshold then
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

  -- 3d. 第 2 代（被推薦人的直接推薦人 = v_referrer1，帶入括號快照）
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
