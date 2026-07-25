-- ============================================================
-- Uknow — 0725 (1) 獎勵明細來源分類 source_category（衍生單一真相）
-- ============================================================
--
-- 背景：GET /rewards/history 過去只能靠 reward_transactions.type（3 值）
-- 粗分，且前端還在切 description 字串反推分類——正是 reward_config 檔頭
-- 痛斥的「語意散在多處、少同步一字就無聲回退」反模式。使用者實際想分辨
-- 的來源更細：
--   * 推薦獎勵是「下線付款」還是「下線用任務免費續約」帶來的；
--   * adjustment 是「退件退款」還是（未來的）人工調整。
-- 這些差異其實都已存在於欄位裡（source_claim_id / withdrawal_id），只是
-- 沒被收斂成單一可讀、可篩的分類。
--
-- 根治：把分類邏輯收斂成 view 內一個 CASE 衍生欄 source_category，SQL
-- 產出、edge 直接 .in() 下推篩選（計數才正確、分頁才不漏頁）、前端讀
-- enum 不再切字串。判定鍵：
--   referral_reward + source_claim_id IS NOT NULL → referral_task_renewal
--   referral_reward（其餘，含歷史 null）          → referral_payment
--   withdrawal                                     → withdrawal
--   adjustment + withdrawal_id IS NOT NULL         → withdrawal_refund
--   adjustment（其餘）                             → adjustment_manual（目前不會發生，防禦性）
--   其他（未來新 type）                            → 原樣透出 type，永不為 null
--
-- ⚠️ 為何一定要 drop + recreate view：view 的 `select t.*` 在建立當下就
-- 展開凍結欄位清單（見 20260719000001:38-43 的血淚警語）。source_claim_id
-- 是 20260724000001 才加、晚於 view 上次重建（0719），故現行 view 的凍結
-- 清單裡「沒有」source_claim_id——不重建就取不到、CASE 也判不了。重建後
-- t.* 會重新展開含 source_claim_id / withdrawal_id 的最新欄位。
-- ============================================================

drop view if exists public.reward_transactions_with_balance;

create view public.reward_transactions_with_balance
with (security_invoker = on) as
select
  t.*,
  case
    when t.type = 'referral_reward' and t.source_claim_id is not null then 'referral_task_renewal'
    when t.type = 'referral_reward'                                   then 'referral_payment'
    when t.type = 'withdrawal'                                        then 'withdrawal'
    when t.type = 'adjustment' and t.withdrawal_id is not null        then 'withdrawal_refund'
    when t.type = 'adjustment'                                        then 'adjustment_manual'
    else t.type
  end as source_category,
  sum(t.amount) over (
    partition by t.user_id
    order by t.created_at, t.id
  ) as balance_after
from public.reward_transactions t;

-- edge function 走 service_role（default privileges 已涵蓋）；
-- 不開放 anon/authenticated 直查（與前一版一致）。
revoke all on public.reward_transactions_with_balance from anon, authenticated;
