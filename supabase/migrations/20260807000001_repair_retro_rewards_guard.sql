-- ============================================================
-- issue #167：自癒函數不得回溯補發「關係建立前」的歷史事件獎金
-- ============================================================
--
-- 根因：repair_orphaned_payments / repair_orphaned_claim_rewards 的候選
-- 判準用 profiles.referred_by_user_id 的**當下值**回答「這筆歷史事件當時
-- 該不該發獎」。fresh 換線（/payuni/prepare 在付款前就 UPDATE 該欄位）把
-- null 換成真人後，換線前的所有訂閱 / claim 都成為候選，三代獎金被回溯
-- 補發給一位「事件當時不存在」的推薦人。時間軸資訊在資料模型裡不存在
--（referral_edges 會被 rewire 原地覆寫），候選查詢想寫對也寫不出來——
-- 先補時間軸，再加閘門。
--
-- 修法（fix.md：docs/plans/fix-repair-retro-rewards/）：
--   1. profiles.referred_by_changed_at：由觸發器維護（INSERT 帶推薦人、
--      UPDATE 實質變動時寫 now()）。所有寫入點自動涵蓋——含
--      complete-registration、/payuni/prepare 的兩個分支、
--      apply_referral_side_effects 的預設推薦人回寫，以及未來新增者。
--   2. 兩支 repair 候選查詢加「關係變更時間 ≤ 事件時間」閘門。
--      legacy 列（changed_at 為 null）沿用現行為——不誤殺既有真孤兒；
--      變更晚於事件 → 整列排除，寧漏發交人工（比照 forfeitures 快照的
--      「寧少沖」取向）。同交易內 now() 一致，付款交易中套用預設推薦碼
--      的 changed_at == completed_at，閘門放行。
--
-- 基準紀律：
--   repair_orphaned_payments 基準 = 20260720000001_wave4_guards.sql（
--   最新版），唯一差異 = 候選查詢頂層閘門（頂層而非只加在 referred_by
--   分支：缺碼分支 (a) 的候選同樣會被 apply 補發獎金）。
--   repair_orphaned_claim_rewards 基準 = 20260724000006（最新版），唯一
--   差異 = 候選查詢加 claimed_at 閘門。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 時間軸：profiles.referred_by_changed_at + 觸發器
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists referred_by_changed_at timestamptz;

comment on column public.profiles.referred_by_changed_at is
  '推薦人欄位最近一次實質變動的時點（觸發器維護）。自癒函數以此判斷'
  '「這筆歷史事件發生時，現任推薦關係是否已存在」；null = 遷移前的'
  'legacy 列，自癒沿用舊行為。';

create or replace function public.track_referred_by_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.referred_by_user_id is not null then
      new.referred_by_changed_at := now();
    end if;
  elsif new.referred_by_user_id is distinct from old.referred_by_user_id then
    new.referred_by_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_referred_by_changed on public.profiles;
create trigger trg_profiles_referred_by_changed
  before insert or update on public.profiles
  for each row execute function public.track_referred_by_change();

-- ------------------------------------------------------------
-- 2. repair_orphaned_payments：基準 = 20260720000001，唯一差異：
--    候選查詢頂層加 referred_by_changed_at ≤ po.completed_at 閘門。
-- ------------------------------------------------------------
create or replace function public.repair_orphaned_payments(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate       record;
  v_repaired_ids    uuid[] := '{}';
  v_failed          jsonb  := '[]'::jsonb;
  v_candidate_count int    := 0;
begin
  for v_candidate in
    select distinct po.user_id, s.id as subscription_id, po.completed_at as paid_at
    from public.payment_orders po
    join public.subscriptions s on s.source_payment_order_id = po.id
    join public.profiles pr on pr.id = po.user_id
    where po.status = 'completed'
      and (p_user_id is null or po.user_id = p_user_id)
      -- #167 閘門：現任推薦關係若晚於這筆付款才建立，這筆事件不歸它。
      -- legacy（null）沿用舊行為；同交易寫入（換線那筆付款本身）now()
      -- 相等，照常放行。
      and (pr.referred_by_changed_at is null
           or pr.referred_by_changed_at <= po.completed_at)
      and (
        -- (a) 已付款完成卻沒有 active 推薦碼——每個付款成功的人都該有一個
        not exists (
          select 1 from public.referral_codes rc
          where rc.user_id = po.user_id and rc.status = 'active'
        )
        or (
          -- 有記錄推薦來源，但推薦鏈上該領獎勵的某一代還沒領到
          -- （用這一次付款事件的 subscription_id 當冪等鍵，跟
          -- apply_referral_side_effects 的判斷條件一致）
          pr.referred_by_user_id is not null
          and (
            not exists (
              select 1 from public.reward_transactions rt
              where rt.referee_user_id = po.user_id and rt.generation = 1 and rt.subscription_id = s.id
            )
            or exists (
              select 1
              from public.referral_edges e1
              join public.referral_edges e2 on e2.referee_user_id = e1.referrer_user_id
              where e1.referee_user_id = po.user_id
                and not exists (
                  select 1 from public.reward_transactions rt
                  where rt.referee_user_id = po.user_id and rt.generation = 2 and rt.subscription_id = s.id
                )
            )
            or exists (
              select 1
              from public.referral_edges e1
              join public.referral_edges e2 on e2.referee_user_id = e1.referrer_user_id
              join public.referral_edges e3 on e3.referee_user_id = e2.referrer_user_id
              where e1.referee_user_id = po.user_id
                and not exists (
                  select 1 from public.reward_transactions rt
                  where rt.referee_user_id = po.user_id and rt.generation = 3 and rt.subscription_id = s.id
                )
            )
          )
        )
      )
  loop
    v_candidate_count := v_candidate_count + 1;
    begin
      perform public.apply_referral_side_effects(
        v_candidate.user_id, v_candidate.subscription_id, v_candidate.paid_at);
      v_repaired_ids := array_append(v_repaired_ids, v_candidate.user_id);
    exception when others then
      v_failed := v_failed || jsonb_build_object('user_id', v_candidate.user_id, 'error', sqlerrm);
      perform public.log_system_alert('repair_orphaned_payments', 'error', sqlerrm,
        jsonb_build_object('user_id', v_candidate.user_id, 'subscription_id', v_candidate.subscription_id));
      raise warning 'repair_orphaned_payments：修復 user_id=% 失敗: %', v_candidate.user_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'candidates_found',  v_candidate_count,
    'repaired_count',    coalesce(array_length(v_repaired_ids, 1), 0),
    'repaired_user_ids', to_jsonb(v_repaired_ids),
    'failed',            v_failed
  );
end;
$$;

revoke execute on function public.repair_orphaned_payments(uuid) from anon, authenticated, public;

-- ------------------------------------------------------------
-- 3. repair_orphaned_claim_rewards：基準 = 20260724000006，唯一差異：
--    候選查詢加 referred_by_changed_at ≤ rkr.claimed_at 閘門。
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
  loop
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
