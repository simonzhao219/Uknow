-- ========================================
-- Uknow 平台資料庫結構創建腳本（V2）
-- ========================================
-- 執行前請確認已執行 CLEAN_DATABASE.sql
-- ========================================

-- 1. Users 表（使用者基本資料）
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Subscriptions 表（訂閱紀錄）
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  payment_id TEXT,
  amount INTEGER NOT NULL DEFAULT 1200,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Listings 表（服務者刊登）
CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  city TEXT NOT NULL,
  district TEXT,
  gender TEXT NOT NULL,
  service_areas JSONB DEFAULT '[]',
  contact_methods JSONB DEFAULT '[]',
  photos JSONB DEFAULT '[]',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  active_until TIMESTAMPTZ,
  referrer_user_id UUID REFERENCES public.users(id),
  referrer_listing_id UUID REFERENCES public.listings(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Rewards 表（獎勵紀錄）
CREATE TABLE public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  source_listing_id UUID REFERENCES public.listings(id),
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Withdrawals 表（提領紀錄）
CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bank_info JSONB NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  notes TEXT
);

-- 6. Reward Schedules 表（獎勵排程）
CREATE TABLE public.reward_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referee_user_id UUID NOT NULL REFERENCES public.users(id),
  referee_listing_id UUID NOT NULL REFERENCES public.listings(id),
  referrer_user_id UUID REFERENCES public.users(id),
  referrer_listing_id UUID REFERENCES public.listings(id),
  generation INTEGER NOT NULL,
  month_number INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancellation_reason TEXT
);

-- ========================================
-- 創建索引以提升查詢效能
-- ========================================

CREATE INDEX idx_users_referral_code ON public.users(referral_code);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_listings_user_id ON public.listings(user_id);
CREATE INDEX idx_listings_is_active ON public.listings(is_active);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_rewards_user_id ON public.rewards(user_id);
CREATE INDEX idx_reward_schedules_user_id ON public.reward_schedules(user_id);
CREATE INDEX idx_reward_schedules_scheduled_date ON public.reward_schedules(scheduled_date);
CREATE INDEX idx_withdrawals_user_id ON public.withdrawals(user_id);

-- ========================================
-- 啟用 Row Level Security（RLS）
-- ========================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_schedules ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 創建 RLS 策略（允許 service_role 訪問所有數據）
-- ========================================

-- Users 策略
CREATE POLICY "Enable all access for service role" ON public.users
  FOR ALL USING (true);

-- Subscriptions 策略
CREATE POLICY "Enable all access for service role" ON public.subscriptions
  FOR ALL USING (true);

-- Listings 策略
CREATE POLICY "Enable all access for service role" ON public.listings
  FOR ALL USING (true);

-- Rewards 策略
CREATE POLICY "Enable all access for service role" ON public.rewards
  FOR ALL USING (true);

-- Withdrawals 策略
CREATE POLICY "Enable all access for service role" ON public.withdrawals
  FOR ALL USING (true);

-- Reward Schedules 策略
CREATE POLICY "Enable all access for service role" ON public.reward_schedules
  FOR ALL USING (true);

-- ========================================
-- 完成
-- ========================================

SELECT 'Database schema created successfully!' as status;
