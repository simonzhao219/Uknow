-- ============================================================
-- Uknow — 歷史 referral_reward 名字快照留白
-- ============================================================
--
-- 背景：migration 0719 0001 曾用 profiles「現名」回填歷史 referral_reward
-- 列的 referee_name / referee_referrer_name。但那些是「發獎當下不可考、
-- 拿現名近似」的值，與這兩欄「發獎當下快照」的語意矛盾——若使用者事後
-- 改過名，顯示的名字並非發獎當時的名字，卻假裝是快照。
--
-- 決策（業主確認）：歷史列一律留白顯示「—」，只有 0719 快照函數上線後
-- 產生的「真快照」才顯示名字。
--
-- 界線（業主確認）：0719 尚未在正式環境上線 / 上線後尚無任何真實的新
-- 推薦獎勵，故此刻資料庫中所有 referral_reward 的名字都是回填近似，可
-- 安全地全部清為 NULL。往後 apply_referral_side_effects 會為新獎寫入真
-- 快照，不受本次清空影響。
--
-- 前端對 NULL 已自動 fallback 成「—」（RewardHistory 第二行），無需前端改。
-- 一次性資料 migration：在全新資料庫（CI / 新環境）此刻無 reward_transactions
-- 資料 → 影響 0 列，等同 no-op，不影響測試（測試在 migration 之後才建立
-- 真快照列）。
-- ============================================================

update public.reward_transactions
set    referee_name          = null,
       referee_referrer_name = null
where  type = 'referral_reward'
  and  (referee_name is not null or referee_referrer_name is not null);
