-- ============================================================
-- Uknow 後端重構 — 0001 真相表（Source-of-Truth Tables）
-- ============================================================
--
-- 設計原則：每個事實只存一次。能算出來的（會員狀態、推薦樹、
-- 點數餘額）一律用 View / 函數即時計算，絕不另存第二份，
-- 從根本消除舊系統「副本對不上 → 需要 data_repair」的問題。
--
-- 認證：使用 Supabase Auth（auth.users）管理 email + 密碼。
-- 業務資料以 profiles 表為唯一真相來源，用 auth.users.id 當外鍵。
-- ============================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ------------------------------------------------------------
-- profiles：用戶資料（1 筆 / 人）
-- email 不存這裡，由 auth.users 管理（避免重複）
-- ------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  name                     text not null default '',
  phone                    text,
  birth_date               date,

  -- 提領用銀行資訊
  bank_code                text,
  bank_account             text,

  -- 系統欄位
  is_admin                 boolean not null default false,
  registration_step        smallint not null default 1
                             check (registration_step in (1, 2, 3)),
  -- 1 = 基本資訊完成, 2 = 付款中, 3 = 註冊完成
  referral_signature_url   text,

  -- 推薦來源（只記直接上線一層；二/三代由 referral_edges 往上爬算出）
  referred_by_user_id      uuid references public.profiles(id) on delete set null,
  referred_by_code         text,                 -- 註冊當下使用的推薦碼字串（稽核用）

  referral_program_joined  boolean not null default false,
  referral_program_joined_at timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_profiles_referred_by on public.profiles(referred_by_user_id);

-- ------------------------------------------------------------
-- subscriptions：訂閱歷史（N 筆 / 人）
-- ⚠️ 不存 status 欄位 — 現在狀態由日期即時算（見 0003 的 View）
-- ------------------------------------------------------------
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,

  start_date             timestamptz not null,
  end_date               timestamptz not null,
  grace_period_end       timestamptz not null,   -- 一般為 end_date + 60 天
  amount                 integer not null default 1200,

  payment_method         text,
  payment_transaction_id text,
  is_canceled            boolean not null default false,  -- 用戶是否手動取消（仍用到 end_date）
  canceled_at            timestamptz,
  is_renewal             boolean not null default false,  -- 是否為周期接續

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_subscriptions_user on public.subscriptions(user_id);
create index idx_subscriptions_end_date on public.subscriptions(end_date desc);

-- ------------------------------------------------------------
-- referral_codes：推薦碼歷史（N 筆 / 人，但同時只有 1 個 active）
-- ------------------------------------------------------------
create table public.referral_codes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  code            text not null unique,         -- 格式：abc123456（3 小寫 + 6 數字）
  status          text not null default 'active'
                    check (status in ('active', 'inactive', 'fail')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  activated_at    timestamptz not null default now(),
  inactivated_at  timestamptz,
  created_at      timestamptz not null default now()
);

-- 一個用戶同時只能有一個 active 推薦碼
create unique index uq_referral_codes_one_active
  on public.referral_codes(user_id) where status = 'active';
create index idx_referral_codes_code on public.referral_codes(code);

-- ------------------------------------------------------------
-- listings：刊登（一人一個廣告，1:1）
-- ⚠️ 不存 is_active / active_until — 可見性由訂閱即時算
-- ------------------------------------------------------------
create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles(id) on delete cascade,

  name        text not null,
  category    text not null,
  city        text not null,
  districts   text[] not null default '{}',
  gender      text,
  photos      text[] not null default '{}',
  contacts    jsonb not null default '{}'::jsonb,  -- { line, facebook, instagram, ... }
  description text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_listings_city on public.listings(city);
create index idx_listings_category on public.listings(category);

-- ------------------------------------------------------------
-- payment_orders：付款訂單歷史（N 筆 / 人）
-- ------------------------------------------------------------
create table public.payment_orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  amount         integer not null,
  status         text not null default 'pending'
                   check (status in ('pending', 'completed', 'failed', 'cancelled')),
  payment_method text,
  transaction_id text,
  referral_code  text,                  -- 購買當下使用的推薦碼
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index idx_payment_orders_user on public.payment_orders(user_id);
create index idx_payment_orders_status on public.payment_orders(status);

-- ------------------------------------------------------------
-- referral_edges：推薦關係（只記直接上線一層 = 推薦樹的唯一真相）
-- 二/三代由此表往上遞迴算出，不另存
-- ------------------------------------------------------------
create table public.referral_edges (
  referee_user_id  uuid primary key references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  referred_at      timestamptz not null default now(),
  check (referee_user_id <> referrer_user_id)
);

create index idx_referral_edges_referrer on public.referral_edges(referrer_user_id);

-- ------------------------------------------------------------
-- reward_schedules：每月獎勵排程（歷史事實，建立後即凍結 generation）
-- ------------------------------------------------------------
create table public.reward_schedules (
  id                  uuid primary key default gen_random_uuid(),
  beneficiary_user_id uuid not null references public.profiles(id) on delete cascade,  -- 收獎勵的人
  referee_user_id     uuid not null references public.profiles(id) on delete cascade,  -- 因誰的訂閱而產生
  generation          smallint not null check (generation in (1, 2, 3)),
  month_number        smallint not null check (month_number between 1 and 12),
  amount              integer not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'completed', 'cancelled')),
  scheduled_date      date not null,
  completed_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz not null default now()
);

create index idx_reward_schedules_beneficiary on public.reward_schedules(beneficiary_user_id);
create index idx_reward_schedules_due on public.reward_schedules(status, scheduled_date);

-- ------------------------------------------------------------
-- reward_transactions：點數流水帳（只進不改 = 點數餘額的唯一真相）
-- 正數 = 入帳，負數 = 提領/扣除。餘額一律由此表加總算出
-- ------------------------------------------------------------
create table public.reward_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  type            text not null
                    check (type in ('referral_reward', 'task_consecutive',
                                    'task_monthly_king', 'withdrawal', 'adjustment')),
  amount          integer not null,    -- 1 點 = 1 元
  generation      smallint,
  month_number    smallint,
  referee_user_id uuid references public.profiles(id) on delete set null,
  schedule_id     uuid references public.reward_schedules(id) on delete set null,
  description     text not null default '',
  created_at      timestamptz not null default now()
);

create index idx_reward_transactions_user on public.reward_transactions(user_id, created_at desc);

-- ------------------------------------------------------------
-- withdrawals：提領申請（每日限一次由應用層 / 函數檢查）
-- ------------------------------------------------------------
create table public.withdrawals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  amount       integer not null check (amount > 0),
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'paid')),
  bank_code    text,                  -- 申請當下的銀行資訊快照
  bank_account text,
  note         text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_withdrawals_user on public.withdrawals(user_id);
create index idx_withdrawals_status on public.withdrawals(status);

-- ------------------------------------------------------------
-- task_progress：任務計數器（1 筆 / 人）
-- ------------------------------------------------------------
create table public.task_progress (
  user_id                      uuid primary key references public.profiles(id) on delete cascade,
  consecutive_referral_count   integer not null default 0,
  consecutive_last_referred_at timestamptz,
  monthly_referrals            jsonb not null default '{}'::jsonb,  -- { "2026-02": [userId, ...] }
  total_referrals              integer not null default 0,
  updated_at                   timestamptz not null default now()
);
