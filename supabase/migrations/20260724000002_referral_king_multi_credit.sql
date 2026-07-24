-- ============================================================
-- Uknow — 0724 (2) 推薦王 credit 改為「當月可多張」（3-B）
-- ============================================================
-- 規則更新：當月每滿 8 位新人發一張「免費續約 1 年」credit，可累積多張
-- （張數 = floor(當月新人數 / 門檻)）。這讓後端追上前端 MonthlyKingProgress
-- 早就假設的多輪 UI（completedCount = floor(total/8)）。
--
-- 移除原本 unique(user_id, month_key)「每人每月一張」的結構限制，改用
-- round_ordinal（當月第幾張）＋ unique(user_id, month_key, round_ordinal)
-- 維持冪等（同一輪不會重複發）。
--
-- 不回溯：既有列 round_ordinal 由 default 補 1（符合舊制每月至多一張的
-- 歷史事實），不重算歷史 credit。
-- ============================================================

alter table public.referral_king_rewards
  add column round_ordinal int not null default 1 check (round_ordinal >= 1);

comment on column public.referral_king_rewards.round_ordinal is
  '當月第幾張免費續約 credit（每滿門檻人數一張）。取代 unique(user_id, month_key) 的每月一張限制。';

alter table public.referral_king_rewards
  drop constraint uq_referral_king_rewards_user_month;

alter table public.referral_king_rewards
  add constraint uq_referral_king_rewards_user_month_round
    unique (user_id, month_key, round_ordinal);
