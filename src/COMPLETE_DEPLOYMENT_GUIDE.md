# 🎯 Uknow 平台完整部署指南（從零開始）

## 📋 前置準備

### 您需要準備：
- ✅ Supabase 帳號（已有）
- ✅ 專案 ID：`uhtwwxtazwqnlbejhprl`
- ✅ 終端機（Terminal / Command Prompt / PowerShell）
- ✅ Node.js（用於安裝 CLI）

---

## 🚀 完整部署流程（30 分鐘）

---

## 步驟 1：確認 Supabase 專案狀態

### 1.1 登入 Supabase Dashboard

1. 訪問：https://supabase.com/dashboard
2. 選擇專案：`uhtwwxtazwqnlbejhprl`

### 1.2 確認資料庫運行正常

1. 左側選單 → **SQL Editor**
2. 點擊 **New Query**
3. 輸入測試查詢：
   ```sql
   SELECT NOW();
   ```
4. 點擊 **Run**
5. **期望結果：** 看到當前時間

✅ **如果看到時間 → 資料庫正常運行**

---

## 步驟 2：設置環境變量

### 2.1 獲取必要的金鑰

1. 在 Supabase Dashboard
2. 左側選單 → **Project Settings** → **API**
3. 複製以下資訊：
   - **Project URL**（例如：https://uhtwwxtazwqnlbejhprl.supabase.co）
   - **anon public key**（以 `eyJ` 開頭的長字串）
   - **service_role key**（以 `eyJ` 開頭的長字串，**保密！**）

### 2.2 獲取資料庫連接字串

1. 左側選單 → **Project Settings** → **Database**
2. 找到 **Connection string** → **URI**
3. 選擇 **Pooler** 模式
4. 複製連接字串（會包含密碼）
   ```
   postgresql://postgres.uhtwwxtazwqnlbejhprl:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```

### 2.3 設置 Edge Function 環境變量

1. 左側選單 → **Edge Functions**
2. 點擊右上角 **Settings** 或 **Manage secrets**
3. 添加以下 4 個變量：

**變量 1：SUPABASE_URL**
```
https://uhtwwxtazwqnlbejhprl.supabase.co
```

**變量 2：SUPABASE_ANON_KEY**
```
（貼上您在步驟 2.1 複製的 anon public key）
```

**變量 3：SUPABASE_SERVICE_ROLE_KEY**
```
（貼上您在步驟 2.1 複製的 service_role key）
```

**變量 4：DATABASE_URL**
```
（貼上您在步驟 2.2 複製的連接字串）
```

4. 點擊 **Save** 或 **Add secret**

✅ **確認所有 4 個變量都已保存**

---

## 步驟 3：創建資料庫表結構

### 3.1 執行建表 SQL

1. 回到 **SQL Editor**
2. 創建新查詢
3. 複製以下 SQL（完整版）：

```sql
-- ========================================
-- Uknow 平台資料庫結構（V2 完整版）
-- ========================================

-- 1. Users 表（使用者基本資料）
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_phone_key UNIQUE (phone),
  CONSTRAINT users_referral_code_key UNIQUE (referral_code)
);

-- 2. Subscriptions 表（訂閱紀錄）
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  payment_id TEXT,
  amount INTEGER NOT NULL DEFAULT 1200,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- 3. Listings 表（服務者刊登）
CREATE TABLE IF NOT EXISTS public.listings (
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT listings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT listings_public_id_key UNIQUE (public_id)
);

-- 4. Rewards 表（獎勵紀錄）
CREATE TABLE IF NOT EXISTS public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  source_listing_id UUID REFERENCES public.listings(id),
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- 5. Withdrawals 表（提領紀錄）
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bank_info JSONB NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  notes TEXT,
  
  -- 索引
  CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- 6. Reward Schedules 表（獎勵排程）
CREATE TABLE IF NOT EXISTS public.reward_schedules (
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
  cancellation_reason TEXT,
  
  -- 索引
  CONSTRAINT reward_schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- 創建索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON public.listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_is_active ON public.listings(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_user_id ON public.rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_schedules_user_id ON public.reward_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_schedules_scheduled_date ON public.reward_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id);

-- 啟用 Row Level Security（RLS）
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_schedules ENABLE ROW LEVEL SECURITY;

-- 創建 RLS 策略（允許 service_role 訪問所有數據）
CREATE POLICY "Enable all access for service role" ON public.users
  FOR ALL USING (true);
  
CREATE POLICY "Enable all access for service role" ON public.subscriptions
  FOR ALL USING (true);
  
CREATE POLICY "Enable all access for service role" ON public.listings
  FOR ALL USING (true);
  
CREATE POLICY "Enable all access for service role" ON public.rewards
  FOR ALL USING (true);
  
CREATE POLICY "Enable all access for service role" ON public.withdrawals
  FOR ALL USING (true);
  
CREATE POLICY "Enable all access for service role" ON public.reward_schedules
  FOR ALL USING (true);

-- 完成
SELECT 'Database schema created successfully!' as status;
```

4. 點擊 **Run**
5. **期望結果：** 看到 "Database schema created successfully!"

✅ **如果看到成功訊息 → 資料庫表結構已創建**

---

## 步驟 4：安裝 Supabase CLI

### Windows 用戶：

**選項 A：使用 npm（推薦）**
```bash
npm install -g supabase
```

**選項 B：使用 Scoop**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Mac 用戶：

**使用 Homebrew**
```bash
brew install supabase/tap/supabase
```

### Linux 用戶：

```bash
npm install -g supabase
```

### 驗證安裝：

```bash
supabase --version
```

**期望看到：** `supabase 1.x.x`

✅ **如果看到版本號 → CLI 安裝成功**

---

## 步驟 5：登入 Supabase CLI

### 5.1 執行登入命令

```bash
supabase login
```

### 5.2 完成登入

1. **會自動打開瀏覽器**
2. **登入您的 Supabase 帳號**
3. **授權 CLI 訪問**
4. **回到終端機**

**期望看到：**
```
✔ Logged in as your-email@example.com
```

✅ **如果看到登入成功訊息 → CLI 已連接到您的帳號**

---

## 步驟 6：連接到專案

### 6.1 執行連接命令

```bash
supabase link --project-ref uhtwwxtazwqnlbejhprl
```

### 6.2 輸入資料庫密碼

系統會提示輸入資料庫密碼：
```
Enter your database password:
```

**密碼在哪？**
1. Dashboard → **Project Settings** → **Database**
2. 找到 **Database password**
3. 如果忘記，點擊 **Reset database password**

### 6.3 確認連接成功

**期望看到：**
```
✔ Linked project uhtwwxtazwqnlbejhprl
```

✅ **如果看到連接成功訊息 → CLI 已連接到專案**

---

## 步驟 7：部署 Edge Function

### 7.1 部署主函數

```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

**這個命令會：**
1. 打包 `/supabase/functions/server/` 目錄中的所有代碼
2. 上傳到 Supabase
3. 部署為 Edge Function
4. 使用之前設置的環境變量

**期望看到：**
```
Deploying Function make-server-5c6718b9
✔ Function deployed successfully
```

### 7.2 等待函數啟動（重要！）

**部署後需要等待 1-2 分鐘讓函數完全啟動。**

✅ **如果看到部署成功 → Edge Function 已部署**

---

## 步驟 8：驗證部署

### 8.1 查看函數日誌

```bash
supabase functions logs make-server-5c6718b9
```

**期望看到：**
```
✅ [Database] ✅ Supabase Client initialized
✅ [Database] ✅ Postgres Client initialized
✅ PostgreSQL connection successful
✅ Storage Bucket 已存在: make-5c6718b9-listings-photos
```

### 8.2 測試 Health Check

**在瀏覽器訪問：**
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望看到：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

### 8.3 測試 Listings API

**在瀏覽器訪問：**
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

**期望看到：**
```json
{
  "success": true,
  "listings": [],
  "total": 0
}
```

✅ **如果所有測試都通過 → 部署完全成功！**

---

## 步驟 9：測試前端連接

### 9.1 訪問 Figma Make 前端

在 Figma Make 中打開您的應用首頁。

### 9.2 預期行為

**首次訪問（未登入）：**
- ✅ 看到「探索服務」頁面
- ✅ 顯示「目前沒有可用的服務者刊登」（因為資料庫是空的）
- ✅ 右上角有「登入/註冊」按鈕

**如果看到錯誤：**
- 打開瀏覽器開發者控制台（F12）
- 查看 Console 標籤的錯誤訊息
- 複製錯誤告訴我

✅ **如果首頁正常顯示 → 前端已成功連接到後端！**

---

## 🎉 部署完成檢查清單

請確認以下所有項目：

- [ ] ✅ 資料庫測試查詢成功（步驟 1.2）
- [ ] ✅ 4 個環境變量已設置（步驟 2.3）
- [ ] ✅ 資料庫表結構已創建（步驟 3.1）
- [ ] ✅ Supabase CLI 已安裝（步驟 4）
- [ ] ✅ CLI 登入成功（步驟 5）
- [ ] ✅ CLI 連接專案成功（步驟 6）
- [ ] ✅ Edge Function 部署成功（步驟 7）
- [ ] ✅ Health Check 返回 "ok"（步驟 8.2）
- [ ] ✅ Listings API 返回 JSON（步驟 8.3）
- [ ] ✅ 前端首頁正常顯示（步驟 9）

---

## 🔧 常見問題排查

### 問題 1：CLI 登入失敗

**解決方案 A：使用 Access Token**
```bash
supabase login --token YOUR_ACCESS_TOKEN
```

**Access Token 在哪？**
1. Dashboard → 右上角帳號圖標 → **Account**
2. 左側 → **Access Tokens**
3. 點擊 **Generate new token**
4. 複製 token

### 問題 2：部署時提示權限錯誤

**確認：**
1. 您是專案的 Owner 或 Admin
2. Dashboard → **Project Settings** → **Team** 查看角色

### 問題 3：Health Check 返回 500 錯誤

**排查步驟：**
1. 查看函數日誌：
   ```bash
   supabase functions logs make-server-5c6718b9
   ```
2. 檢查環境變量是否正確設置（步驟 2.3）
3. 重新部署：
   ```bash
   supabase functions deploy make-server-5c6718b9 --no-verify-jwt
   ```

### 問題 4：前端顯示「未登入」錯誤

**這是正常的！**
- 新的資料庫沒���用戶資料
- 需要先完成註冊流程
- 訪問首頁應該可以正常瀏覽（無需登入）

### 問題 5：資料庫連接失敗

**確認 DATABASE_URL 格式：**
```
postgresql://postgres.uhtwwxtazwqnlbejhprl:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

**注意：**
- 必須是 **Pooler** 模式（不是 Direct）
- 必須包含正確的密碼
- 使用 IPv4 連接

---

## 📞 需要幫助？

如果遇到任何問題，請提供：

1. **當前步驟編號**（例如：步驟 7.1）
2. **完整的錯誤訊息**（從終端機或瀏覽器 Console 複製）
3. **函數日誌**（如果已部署）：
   ```bash
   supabase functions logs make-server-5c6718b9
   ```

---

## 🎊 部署成功後的下一步

1. **創建管理員帳號**
   - 訪問前端首頁
   - 點擊「註冊」
   - 完成 4 步驟註冊流程
   - 使用推薦碼：`admin888888`（測試用）

2. **創建第一個服務者刊登**
   - 登入後訪問「我的帳戶」
   - 點擊「建立服務者刊登」
   - 填寫資料並付款

3. **測試推薦系統**
   - 複製您的推薦碼
   - 用另一個瀏覽器/無痕模式註冊新用戶
   - 使用您的推薦碼完成註冊
   - 查看推薦樹和獎勵

---

**創建時間：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl  
**預計完成時間：** 30 分鐘  
**難度：** ⭐⭐☆☆☆（中等）
