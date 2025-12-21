# 🔧 修復步驟 3.1 資料庫錯誤

## ❌ 錯誤訊息

```
ERROR: 42710: constraint "subscriptions_user_id_fkey" for relation "subscriptions" already exists
```

## 🔍 問題原因

您的資料庫中已經有部分表結構存在，可能是：
1. 之前執行過建表 SQL
2. 刪除資料時只刪了數據，沒有刪除表結構
3. 執行了多次建表 SQL

## ✅ 解決方案（2 步驟）

---

## 步驟 1：完全清空資料庫

### 1.1 打開 SQL Editor

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/sql
2. 點擊 **New Query**

### 1.2 複製清理腳本

**複製以下 SQL 並貼到編輯器：**

```sql
-- ========================================
-- Uknow 平台資料庫完全清理腳本
-- ========================================
-- ⚠️ 警告：此腳本會刪除所有現有的表和數據！
-- ⚠️ 請確認您真的要清空資料庫再執行！
-- ========================================

-- 1. 刪除所有表（如果存在）
DROP TABLE IF EXISTS public.reward_schedules CASCADE;
DROP TABLE IF EXISTS public.withdrawals CASCADE;
DROP TABLE IF EXISTS public.rewards CASCADE;
DROP TABLE IF EXISTS public.listings CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. 確認清理完成
SELECT 'All tables dropped successfully!' as status;
```

### 1.3 執行清理

1. 點擊右下角綠色的 **Run** 按鈕
2. 等待 2-3 秒

**✅ 期望結果：**
```
status
─────────────────────────────────
All tables dropped successfully!

Rows: 1  Time: 123ms
```

---

## 步驟 2：重新創建資料庫表

### 2.1 創建新查詢

1. 在 SQL Editor 點擊 **New Query**（創建新的查詢）
2. 或者清空當前編輯器

### 2.2 複製建表腳本

**複製以下完整的 SQL：**

```sql
-- ========================================
-- Uknow 平台資料庫結構創建腳本（V2）
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
```

### 2.3 執行建表

1. 點擊 **Run** 按鈕
2. 等待 5-10 秒

**✅ 期望結果：**
```
status
─────────────────────────────────
Database schema created successfully!

Rows: 1  Time: 234ms
```

---

## 步驟 3：驗證表已創建

### 3.1 查詢所有表

在 SQL Editor 輸入：

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

點擊 **Run**

**✅ 期望結果（應該看到 6 個表）：**

| table_name |
|------------|
| listings |
| reward_schedules |
| rewards |
| subscriptions |
| users |
| withdrawals |

### 3.2 檢查表結構

查看 users 表結構：

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
ORDER BY ordinal_position;
```

**✅ 期望結果：**

| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| id | uuid | NO |
| email | text | NO |
| name | text | NO |
| phone | text | YES |
| referral_code | text | NO |
| referred_by_code | text | YES |
| created_at | timestamp with time zone | YES |
| updated_at | timestamp with time zone | YES |

---

## ✅ 完成！現在繼續步驟 4

資料庫已完全清空並重建，您現在可以繼續 `/COMPLETE_DEPLOYMENT_GUIDE.md` 的**步驟 4：安裝 Supabase CLI**

---

## 🔧 如果仍然遇到錯誤

### 錯誤 1：權限不足

```
ERROR: permission denied for schema public
```

**解決方案：**
1. 確認您是專案的 Owner
2. Dashboard → Project Settings → Team 檢查角色

### 錯誤 2：語法錯誤

```
ERROR: syntax error at or near "..."
```

**解決方案：**
1. 確認複製了**完整的 SQL**（從開頭到結尾）
2. 確認沒有遺漏任何分號 `;`
3. 重新複製 SQL 並貼上

### 錯誤 3：表已存在（重複執行）

```
ERROR: relation "users" already exists
```

**解決方案：**
1. 這表示您已經成功創建了表
2. 直接繼續步驟 4（不需要重複執行）
3. 或者先執行步驟 1 的清理腳本再重新創建

---

## 📝 為什麼要分兩步執行？

**優點：**
1. ✅ 更安全：清理和創建分開，容易排查錯誤
2. ✅ 更清晰：知道每一步在做什麼
3. ✅ 可重複：如果創建失敗，可以重複執行步驟 2

**一次執行的風險：**
- ❌ 如果中途失敗，不知道哪裡出錯
- ❌ 部分表可能已創建，部分未創建
- ❌ 需要手動檢查並清理

---

## 🎯 檢查清單

在繼續步驟 4 之前，請確認：

- [ ] ✅ 步驟 1 看到 "All tables dropped successfully!"
- [ ] ✅ 步驟 2 看到 "Database schema created successfully!"
- [ ] ✅ 步驟 3 查詢到 6 個表
- [ ] ✅ 步驟 3.2 看到 users 表的 8 個欄位

**如果所有項目都打勾 → 完美！繼續步驟 4！** 🎉

---

**創建時間：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl
