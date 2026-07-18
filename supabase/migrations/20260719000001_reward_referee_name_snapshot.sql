-- ============================================================
-- Uknow — 獎勵明細「被推薦人（其推薦人）」快照欄位
-- ============================================================
--
-- 問題：/rewards 獎勵明細卡片第二行永遠是「—」。前端是靠切 description
-- 這串 prose（「推薦獎勵（第 N 代）」）反推細節，而這串裡根本沒有名字，
-- 切出來是空字串 → 畫成「—」。真正該顯示的是：因誰的訂閱而發這筆獎勵
-- （被推薦人）＋那位被推薦人的直接推薦人。這些關係資料庫其實都有
-- （reward_transactions.referee_user_id、referral_edges），只是從沒帶到
-- 明細裡。
--
-- 設計取捨（依業主指示）：名字用「當下快照」，事後改名不連動。這與
-- reward_transactions 本來的設計語言一致——它是「只進不改」的點數流水帳
-- （帳本 = 歷史事實）。名字是發獎當下的事實，凍在該列，不隨 profiles.name
-- 事後變動。因此把名字「寫死」在交易列，而不是查詢時 join profiles 即時算。
--
--   referee_name          = 被推薦人（因其訂閱而發此獎，= referee_user_id）
--                           發獎當下的顯示名。
--   referee_referrer_name = 被推薦人的直接推薦人發獎當下的顯示名。
--                           第 1 代時這個人就是收獎者本人（多餘），故存 NULL，
--                           前端也只在第 2/3 代顯示括號。
--
-- 兩欄皆可為 NULL：非推薦獎勵（提領/任務/校正）用不到；舊資料回填不到時
-- 也保持 NULL，前端 fallback 回原本的 description 解析，不會爆。
-- ============================================================

alter table public.reward_transactions
  add column if not exists referee_name          text,
  add column if not exists referee_referrer_name text;

comment on column public.reward_transactions.referee_name is
  '被推薦人（referee_user_id）發獎當下的顯示名快照；事後改名不連動。';
comment on column public.reward_transactions.referee_referrer_name is
  '被推薦人之直接推薦人發獎當下的顯示名快照；第 1 代為 NULL（即收獎者本人）。';

-- ------------------------------------------------------------
-- 重建 reward_transactions_with_balance
--   ⚠️ view 的 `select t.*` 是在建立當下就展開並凍結成當時的欄位清單，
--   ALTER TABLE ADD COLUMN 不會自動補進 view。因此新增欄位後必須重建
--   view，否則 GET /rewards/history 選到新欄位會直接查詢失敗（PostgREST
--   回錯 → rows/count 皆 null → total 變 0，整張明細空白）。
--   新欄位排在 subscription_id 之後、balance_after 之前，欄位順序變了，
--   create or replace view 只允許在尾端追加，故改用 drop + create。
-- ------------------------------------------------------------
drop view if exists public.reward_transactions_with_balance;

create view public.reward_transactions_with_balance
with (security_invoker = on) as
select
  t.*,
  sum(t.amount) over (
    partition by t.user_id
    order by t.created_at, t.id
  ) as balance_after
from public.reward_transactions t;

-- edge function 走 service_role（default privileges 已涵蓋）；
-- 不開放 anon/authenticated 直查。
revoke all on public.reward_transactions_with_balance from anon, authenticated;

-- ------------------------------------------------------------
-- 回填既有 referral_reward 列
--   歷史列沒有「當下」的名字可考，只能用 profiles 目前的名字近似。
--   這是一次性回填；此刻之後由 apply_referral_side_effects 寫入真快照。
-- ------------------------------------------------------------

-- 被推薦人名（所有 referral_reward 列）
update public.reward_transactions t
set    referee_name = p.name
from   public.profiles p
where  t.referee_user_id = p.id
  and  t.type = 'referral_reward'
  and  t.referee_name is null;

-- 被推薦人的直接推薦人名（僅第 2/3 代；第 1 代留 NULL）
update public.reward_transactions t
set    referee_referrer_name = rp.name
from   public.referral_edges e
join   public.profiles rp on rp.id = e.referrer_user_id
where  t.referee_user_id = e.referee_user_id
  and  t.type = 'referral_reward'
  and  coalesce(t.generation, 0) > 1
  and  t.referee_referrer_name is null;

-- ------------------------------------------------------------
-- apply_referral_side_effects：發獎當下寫入名字快照。
--   基準是 0008（含「換推薦人時 rewire 推薦邊」的 do update），
--   只加了名字查詢與 insert 欄位，其餘冪等/鎖/rewire/例外邏輯原封不動。
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
begin
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
  --     本人，故 referee_referrer_name 留 NULL。
  if not exists (
    select 1 from public.reward_transactions
    where referee_user_id = p_user_id and generation = 1 and subscription_id = p_subscription_id
  ) then
    begin
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, subscription_id,
         description, referee_name, referee_referrer_name)
      values
        (v_referrer1, 'referral_reward', 100, 1, p_user_id, p_subscription_id,
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

      -- 推薦王：本月累積推薦數達 10 人門檻即發放「免費續約一年」credit
      -- （未領取狀態）。用 >=10 而不是 =10，加上 unique(user_id,
      -- month_key) 雙重保險：就算這段邏輯被 repair_orphaned_payments
      -- 重放、或補跑時一次跳過 10 這個整數，也不會重複發放。
      if v_month_count >= 10 then
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
          (v_referrer2, 'referral_reward', 100, 2, p_user_id, p_subscription_id,
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
            (v_referrer3, 'referral_reward', 100, 3, p_user_id, p_subscription_id,
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
