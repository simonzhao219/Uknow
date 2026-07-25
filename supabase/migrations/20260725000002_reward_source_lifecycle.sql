-- ============================================================
-- Uknow — 0725 (2) 獎勵來源分類改用「拉新／續約」軸 + 分類 facet
-- ============================================================
--
-- 背景：0725 (1) 把分類收斂進 view 是對的方向，但那一版切的軸是**冪等鍵**
-- （綁 subscription_id vs 綁 source_claim_id）——那是實作細節，不是使用者
-- 想分辨的事。使用者（與 online-rewards-referral-rule-update.md 的規則語彙）
-- 想的是「招募新人」vs「留存續約」：我這筆 100P 是因為有人**加入**，還是
-- 因為下線**留下來續約**。舊分類把「下線付款續約」和「下線首購」混在同一
-- 個 referral_payment，UI 叫它什麼名字都會有落差。
--
-- 新分類軸（拉新／續約），與明細 badge 用語一一對應：
--   referral_signup   獎勵-推薦新人：這位被推薦人第一次替我帶來獎勵
--   referral_renewal  獎勵-子代續約：同一位被推薦人的後續獎勵（付款續約或
--                     用推薦王免費續約券續約，兩者都是「留存」）
--   withdrawal        提領 Point
--   withdrawal_refund 退還 Point（adjustment 且綁 withdrawal_id）
--   adjustment_manual 其他調整（目前無端點產生；facet 有才會出現在篩選器）
--   其他（未來新 type）→ 原樣透出 type，永不為 null
--
-- 「新人」的判定採**配對視角**（該收獎者 × 該被推薦人的第一筆推薦獎勵），
-- 不採 subscriptions.is_renewal。理由與 0724 (4) 的 pair-history 規則同源：
-- is_renewal 是付款人的全域屬性，在「換線」情形會對新上線給錯答案（那個人
-- 對新上線而言確實是第一次帶來獎勵）。配對視角也讓歷史資料零缺口——不必
-- 依賴 2026-07-16 才加的 subscription_id 關聯。
--
-- 唯一的例外規則：帶 source_claim_id（免費續約券）者一律是續約。券要能用，
-- 該下線必定已經付過一次錢，不可能是「新人」；此規則同時擋掉換線後第一筆
-- 就是任務續約的極端情形被誤標成新人。
--
-- 判定順序（先特例後通則）：
--   1. referral_reward + source_claim_id 非 null            → referral_renewal
--   2. referral_reward + 該配對的第一筆（rn = 1）            → referral_signup
--   3. referral_reward 其餘                                  → referral_renewal
--
-- ⚠️ 重建 view 的老規矩：`select t.*` 在建立當下就凍結欄位清單
-- （見 20260719000001:38-43 的血淚警語）。這次沒有新增欄位，但仍走
-- drop + recreate，因為 CASE 本身要換。
--
-- ⚠️ 視窗函數與述詞下推：新增的 row_number() 以 (user_id, referee_user_id,
-- type) 分割，user_id 仍是分割鍵，故 edge 的 .eq('user_id', …) 一樣能推進
-- 視窗（與既有 balance_after 的 partition by user_id 同一個道理）；且分割
-- 到單一 user 不會改變同一配對內的名次。referee_user_id 為 null（被推薦人
-- 帳號已刪，on delete set null）的列會落在同一個 null 分割，只有最早一筆
-- 算新人——這是無從還原配對時可接受的退化行為。
-- ============================================================

drop view if exists public.reward_transactions_with_balance;

create view public.reward_transactions_with_balance
with (security_invoker = on) as
select
  t.*,
  case
    when t.type = 'referral_reward' and t.source_claim_id is not null then 'referral_renewal'
    when t.type = 'referral_reward'
      and row_number() over (
        partition by t.user_id, t.referee_user_id, t.type
        order by t.created_at, t.id
      ) = 1                                                          then 'referral_signup'
    when t.type = 'referral_reward'                                  then 'referral_renewal'
    when t.type = 'withdrawal'                                       then 'withdrawal'
    when t.type = 'adjustment' and t.withdrawal_id is not null       then 'withdrawal_refund'
    when t.type = 'adjustment'                                       then 'adjustment_manual'
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

-- ============================================================
-- 分類 facet：這位使用者「實際存在」的來源分類與筆數。
--
-- 為什麼要它：篩選器若寫死分類清單，任何 schema 允許、但清單沒列的分類
-- （例如人工調整 adjustment_manual，DB 約束允許、目前無端點產生）就會變成
-- 「四個篩選的筆數加總 ≠ 全部」——計數對不上是最傷信任的那種 bug。改由
-- 後端回報實際有的分類，篩選器照它渲染：空分類不出現、真的出現了就自動
-- 長出來，加總永遠守恆。
--
-- facet 恆為「未篩選」的全集（不隨 ?source= 變動），否則選了一個分類就會
-- 把其他 chip 弄不見，使用者將無法切回去。
-- ============================================================
create or replace function public.reward_source_facets(p_user_id uuid)
returns table (source_category text, tx_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select v.source_category, count(*)::bigint
  from public.reward_transactions_with_balance v
  where v.user_id = p_user_id
  group by v.source_category
$$;

revoke execute on function public.reward_source_facets(uuid) from anon, authenticated, public;
