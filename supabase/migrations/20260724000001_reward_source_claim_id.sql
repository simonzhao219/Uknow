-- ============================================================
-- Uknow — 0724 (1) reward_transactions 增加 source_claim_id
-- ============================================================
-- 規則更新：任務成功續約（領取推薦王「免費續約 1 年」credit）現在也算
-- 「下線續約」，要對領取者的上線鏈發三代 100P。但 claim 是 UPDATE 既有
-- 訂閱、沒有新的 subscription_id，沿用付款路徑的冪等鍵會撞到那筆訂閱
-- 當初付款時發過的 gen1。故新增一個指向「這次 claim 事件」的事件鍵。
--
--   * 付款觸發的獎勵：subscription_id 有值、source_claim_id 為 null，
--     冪等鍵 = (referee, generation, subscription_id)。
--   * 任務續約觸發的獎勵：subscription_id 為 null、source_claim_id 有值，
--     冪等鍵 = (referee, generation, source_claim_id)。
-- ============================================================

alter table public.reward_transactions
  add column source_claim_id uuid
    references public.referral_king_rewards(id) on delete set null;

comment on column public.reward_transactions.source_claim_id is
  '任務成功續約（claim 免費續約 credit）觸發的推薦獎勵，指向 referral_king_rewards.id；'
  '付款觸發的獎勵此欄為 null，改用 subscription_id 當冪等鍵。';

create index idx_reward_transactions_source_claim
  on public.reward_transactions(source_claim_id)
  where source_claim_id is not null;
