-- ============================================================
-- 後台推薦樹查帳（第 6 波 S3a 階段 1）：referral_award_chain
--
-- 回傳某位付款人「第 1～3 代該拿的人」與停止原因，給後台查帳判定
-- 「該拿」用。讀法與停止條件必須和 pay_referral_generations
-- （20261113000001_referral_cycle_guard.sql）逐字相同：
--   * 第 1 代＝付款人的 profiles.referred_by_user_id
--   * 第 2、3 代＝上一代在 referral_edges 的 referrer_user_id
--   * 收獎者＝付款人本人 → 成環，該代與其後各代都不發（stop_reason='cycle'）
--   * 某代沒有人 → 該代與其後各代 stop_reason='no_referrer'
-- 不看收獎者的停權、到期、推薦計畫（發獎本來就不看，W6-15）。
--
-- 口徑由 api/referral-award-chain.test.ts 的等價測試釘住：同一拓撲下
-- pay_referral_generations 實際寫入的收獎者必須逐代等於本函式。
-- 第 7 波再讓 pay_referral_generations 改呼叫本函式，從結構上收斂（W6-19）。
--
-- 一律回 3 列（generation 1..3）；stop_reason <> 'none' 時 recipient_id 為 null。
-- 只授權 service_role（後台 RPC 與測試用）。
-- ============================================================

create or replace function public.referral_award_chain(p_referee uuid)
returns table (generation int, recipient_id uuid, stop_reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current uuid;
  v_next    uuid;
  v_reason  text := 'none';
begin
  for g in 1..3 loop
    if v_reason = 'none' then
      if g = 1 then
        select p.referred_by_user_id into v_next
        from public.profiles p where p.id = p_referee;
      else
        v_next := null;
        select e.referrer_user_id into v_next
        from public.referral_edges e where e.referee_user_id = v_current;
      end if;

      if v_next is null then
        v_reason := 'no_referrer';
      elsif v_next = p_referee then
        v_reason := 'cycle';
      end if;
    end if;

    generation := g;
    if v_reason = 'none' then
      recipient_id := v_next;
      v_current := v_next;
    else
      recipient_id := null;
    end if;
    stop_reason := v_reason;
    return next;
  end loop;
end;
$$;

revoke execute on function public.referral_award_chain(uuid) from public, anon, authenticated;
grant execute on function public.referral_award_chain(uuid) to service_role;

comment on function public.referral_award_chain(uuid) is
  '後台查帳：付款人第 1～3 代該拿的人與停止原因（none/no_referrer/cycle）；口徑與 pay_referral_generations 相同，由 referral-award-chain.test.ts 等價測試釘住';
