-- ============================================================
-- Uknow 後端重構 — 0007 業務規則修訂（依使用者最終確認）
-- ============================================================
--
-- 變更摘要：
--  Q1. 取消自動續扣：付一次 = 一年；到期前一個月寄信通知；
--      未續約則帳號失效（PayUni 改一次性付款，屬 Edge Function 範疇）。
--  Q1. 推薦獎勵改「即時一次發清」：使用者一付款，上線三代立即拿到
--      該拿的全部獎金（10 點 × 12 個月 = 120 點/代），不再分 12 個月排程。
--      → reward_schedules 整張移除、cron 發獎排程不再需要。
--  Q1. 移除「連續推薦達人」任務（連續 12 個月有推薦人）。
--      → task_progress 的 consecutive_* 欄位移除；
--        reward_transactions 的 task_consecutive 類型移除。
--  Q3. 身分證字號不可廢棄 → profiles 新增 national_id。
--      （手寫簽名沿用既有 referral_signature_url，加入推薦計畫者才需要。）
-- ============================================================

-- ------------------------------------------------------------
-- Q3：profiles 新增身分證字號
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists national_id text;

-- ------------------------------------------------------------
-- Q1：移除每月獎勵排程機制（改即時一次發清）
-- 先拆掉依賴，再丟資料表
-- ------------------------------------------------------------
drop view if exists public.reward_balances;

alter table public.reward_transactions
  drop column if exists schedule_id,
  drop column if exists month_number;

drop table if exists public.reward_schedules cascade;

-- ------------------------------------------------------------
-- Q1：reward_transactions 類型移除 task_consecutive
-- ------------------------------------------------------------
alter table public.reward_transactions
  drop constraint if exists reward_transactions_type_check;
alter table public.reward_transactions
  add constraint reward_transactions_type_check
  check (type in ('referral_reward', 'task_monthly_king', 'withdrawal', 'adjustment'));

-- ------------------------------------------------------------
-- Q1：reward_balances 重建 —— 不再有 pending（即時發清，沒有待發排程）
--   total_earned ：歷史總入帳（正數加總）
--   available    ：可提領（流水帳淨額，已扣提領）
--   withdrawn    ：已提領
-- ------------------------------------------------------------
create view public.reward_balances
with (security_invoker = on) as
select
  p.id as user_id,
  coalesce(t.total_earned, 0) as total_earned,
  coalesce(t.available, 0)    as available,
  coalesce(t.withdrawn, 0)    as withdrawn
from public.profiles p
left join (
  select
    user_id,
    sum(amount) filter (where amount > 0)                        as total_earned,
    sum(amount)                                                  as available,
    -coalesce(sum(amount) filter (where type = 'withdrawal'), 0) as withdrawn
  from public.reward_transactions
  group by user_id
) t on t.user_id = p.id;

-- ------------------------------------------------------------
-- Q1：移除「連續推薦達人」任務的計數欄位
-- 只保留「推薦王」（單月推薦 10 人）所需的 monthly_referrals / total_referrals
-- ------------------------------------------------------------
alter table public.task_progress
  drop column if exists consecutive_referral_count,
  drop column if exists consecutive_last_referred_at;
