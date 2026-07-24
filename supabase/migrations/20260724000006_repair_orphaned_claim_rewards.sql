-- ============================================================
-- Uknow — 0724 (6) 任務續約發獎的自癒補償 repair_orphaned_claim_rewards
-- ============================================================
-- 0724_5 讓 claim（任務成功續約）對上線鏈發三代 100P，但發獎是 warning-only
-- 隔離：當下失敗只留 system_alert、不回滾「訂閱已延展 + credit 已領」。付款
-- 路徑有 repair_orphaned_payments 補這種漏，claim 路徑卻沒有——本函數補上
-- 對稱的自癒。
--
-- 偵測：已 claimed 的 credit、其領取者有推薦來源、卻查無對應
-- source_claim_id 的第 1 代獎勵 → 視為 cascade 沒跑成，冪等重發
-- （pay_referral_generations 內部各代冪等，重跑安全）。
--
-- 註：與 repair_orphaned_payments 同樣以「第 1 代缺漏」為主偵測條件；
-- 「gen1 有、gen2/3 缺」的部分失敗極罕見（各代獨立 begin/exception），
-- 不在此另行偵測，可接受的殘量風險。
--
-- 觸發：掛在既有的懶惰按使用者自癒點（edge repairOrphanedPaymentsBestEffort），
-- 領取者下次經過自己的請求時機就會補齊，無需全域排程。
-- ============================================================

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
