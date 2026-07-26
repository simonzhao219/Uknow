-- ============================================================
-- Uknow — 0726 (101) 預設推薦人：設定欄位 + resolve_default_referrer
-- ============================================================
--
-- 規劃：docs/plans/default-referral-code/plan.md（三輪四視角審查後的 v4）。
-- 未填推薦碼的「首購」會員自動綁定平台指定的預設推薦人，讓自然流量
-- 進入三代分潤組織。本檔只建「設定 + 解析」；接進
-- apply_referral_side_effects 在下一個 migration（分階段 = 分紅綠循環）。
--
-- 設計要點（每一條都對應一輪審查的發現，勿在後續覆寫時省略）：
-- * 設定放 reward_config（可變業務常數單一真相，0719 0002 慣例）。
--   null = 停用。刻意不給 column default——啟用必須是一個可追溯的人工
--   UPDATE，不是藏在 DDL 裡的字面量。部署步驟見
--   docs/supabase-setup-checklist.md（營運動作，每環境各一次）。
-- * 碼合法性一律重用 validate_referral_code()——它同時檢查
--   status='active' 與 profiles.suspended_at is null。兩欄位之間沒有任何
--   trigger 連動，自行只查 status 會把 0720 關掉的「停權仍賺獎金」洞
--   重開一次（v1 審查 P0-1）。
-- * 首購判準讀 subscriptions.is_renewal（payer-level「史上第一筆付款」）。
--   與 0725 (2) 拒絕 is_renewal 的理由不衝突——該處拒絕的是拿它回答
--   relationship-level「對此上線是否新下線」；語意軸不同（v2 審查 V2-9）。
-- * 「設定非 null 但解析失敗」必須告警——那是正常查詢回零列、不是例外，
--   呼叫端的 exception 隔離接不到（v3 審查 V3-1）。且 F（碼無效）與
--   H（推薦人停權）對 validate_referral_code 是同一個零列訊號，須用
--   只做診斷分類、不參與權限判定的輔助查詢分開 reason。
-- ============================================================

-- ------------------------------------------------------------
-- 1. reward_config.default_referrer_code
-- ------------------------------------------------------------
alter table public.reward_config
  add column if not exists default_referrer_code text;

comment on column public.reward_config.default_referrer_code is
  '未填推薦碼的首購會員自動綁定的推薦碼；null = 停用此機制。'
  '啟用/停用一律以人工 UPDATE 操作（可追溯），不由 migration 寫入。';

-- ------------------------------------------------------------
-- 2. resolve_default_referrer(p_user_id, p_subscription_id) → uuid
--    回 null = 不套用（涵蓋：停用、非首購、碼無效、推薦人停權、
--    自我推薦）。只有「設定非 null 但解析失敗」的兩種情形告警；
--    停用/非首購/自我推薦是正常業務分支，不告警。
-- ------------------------------------------------------------
create or replace function public.resolve_default_referrer(
  p_user_id         uuid,
  p_subscription_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code       text;
  v_is_renewal boolean;
  v_referrer   uuid;
begin
  -- 停用（null / 空字串都算）。lower(trim()) 與其他寫入點的正規化一致，
  -- 營運手動 UPDATE 成混合大小寫不會安靜失效。
  select nullif(lower(trim(default_referrer_code)), '') into v_code
  from public.reward_config
  where id = true;
  if v_code is null then
    return null;
  end if;

  -- 首購判準：讀這筆付款事件對應的 subscription 列。is_renewal 在
  -- process_successful_payment 建列前就算好並凍結（0720:425-426），
  -- 單調、可重放。找不到列（防禦性）視同不套用。
  select is_renewal into v_is_renewal
  from public.subscriptions
  where id = p_subscription_id;
  if v_is_renewal is distinct from false then
    return null;
  end if;

  -- 碼合法性單一真相：active 且推薦人未停權。
  select referrer_user_id into v_referrer
  from public.validate_referral_code(v_code)
  limit 1;

  if v_referrer is null then
    -- 解析失敗 = 機制靜默失效，營運必須知道。輔助查詢只影響告警
    -- reason 的分類，不參與「套不套用」的判定（判定已由上面的
    -- validate_referral_code 給出）。
    if exists (
      select 1 from public.referral_codes rc
      where rc.code = v_code and rc.status = 'active'
    ) then
      perform public.log_system_alert('resolve_default_referrer', 'warning',
        'default_referrer_suspended',
        jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id,
                           'code', v_code));
    else
      perform public.log_system_alert('resolve_default_referrer', 'warning',
        'default_referrer_code_invalid',
        jsonb_build_object('user_id', p_user_id, 'subscription_id', p_subscription_id,
                           'code', v_code));
    end if;
    return null;
  end if;

  -- 自我推薦護欄：預設推薦人自己的首購會解析出他本人。
  if v_referrer = p_user_id then
    return null;
  end if;

  return v_referrer;
end;
$$;

revoke execute on function public.resolve_default_referrer(uuid, uuid)
  from anon, authenticated, public;
