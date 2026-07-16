-- ============================================================
-- Uknow 後端重構 — 0005 (0716) 推薦王：免費續約一年 credit
-- ============================================================
--
-- 背景：推薦王（單月推薦 10 人）過去從未真正發放過獎勵。新規則：
-- 達標即發放一筆「可領取的免費續約 1 年」credit；使用者需主動呼叫
-- claim_referral_king_reward（見下一個 migration）才會真的延展訂閱
-- 到期日。這不是點數，不進 reward_transactions 這張點數流水帳。
--
-- unique(user_id, month_key) 是結構性防呆——不管 app 邏輯怎麼重放
-- （並發、orphan-repair 重跑…），同一人同一個月最多只會有一筆 credit。
-- ============================================================

create table public.referral_king_rewards (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  month_key                 text not null,   -- 'YYYY-MM'（Asia/Taipei），對應 task_progress.monthly_referrals 的 key
  status                    text not null default 'unclaimed'
                              check (status in ('unclaimed', 'claimed')),
  granted_at                timestamptz not null default now(),
  claimed_at                timestamptz,
  resulting_subscription_id uuid references public.subscriptions(id) on delete set null,
  updated_at                timestamptz not null default now(),

  constraint uq_referral_king_rewards_user_month unique (user_id, month_key),
  constraint chk_referral_king_rewards_claimed_fields check (
    (status = 'unclaimed' and claimed_at is null and resulting_subscription_id is null)
    or
    (status = 'claimed' and claimed_at is not null and resulting_subscription_id is not null)
  )
);

create index idx_referral_king_rewards_user on public.referral_king_rewards(user_id);

create trigger trg_referral_king_rewards_updated
  before update on public.referral_king_rewards
  for each row execute function public.set_updated_at();

alter table public.referral_king_rewards enable row level security;

create policy referral_king_rewards_select_own on public.referral_king_rewards
  for select using (user_id = auth.uid() or public.is_admin());

-- 寫入只透過 SECURITY DEFINER 函數（process_successful_payment /
-- apply_referral_side_effects / claim_referral_king_reward），
-- 不需要 insert/update policy。
revoke all on public.referral_king_rewards from anon, authenticated;
