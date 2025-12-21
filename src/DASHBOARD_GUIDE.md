# 📱 Supabase Dashboard 操作指南（圖文版）

## 🎯 快速導航

| 任務 | 直達連結 |
|------|---------|
| 設置環境變量 | [點擊前往](#步驟-1設置環境變量) |
| 創建資料庫表 | [點擊前往](#步驟-2創建資料庫表) |
| 查看函數日誌 | [點擊前往](#步驟-3查看函數日誌) |
| 測試 API | [點擊前往](#步驟-4測試-api) |

---

## 步驟 1：設置環境變量

### 1.1 獲取 API 金鑰

**路徑：** Dashboard → Project Settings → API

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/settings/api
2. 找到以下資訊：

```
┌─────────────────────────────────────────┐
│  Project URL                             │
│  https://uhtwwxtazwqnlbejhprl.supabase.co│
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  anon public                             │
│  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... │
│  [複製] ← 點擊這裡                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  service_role                            │
│  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... │
│  [複製] ← 點擊這裡（⚠️ 保密）            │
└─────────────────────────────────────────┘
```

### 1.2 獲取資料庫連接字串

**路徑：** Dashboard → Project Settings → Database

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/settings/database
2. 滾動到 **Connection string** 區塊
3. 選擇 **URI** 標籤
4. **重要：** 選擇 **Transaction pooler** 或 **Session pooler**（不是 Direct connection）
5. 點擊 [複製] 按鈕

```
┌─────────────────────────────────────────┐
│  Connection string                       │
│  ┌─────┬─────┬────────┐                 │
│  │ URI │ JDBC│ .NET   │                 │
│  └─────┴─────┴────────┘                 │
│                                          │
│  ⚪ Direct connection                    │
│  🔘 Transaction pooler ← 選擇這個        │
│  ⚪ Session pooler                       │
│                                          │
│  postgresql://postgres.uhtww...         │
│  [複製] ← 點擊這裡                        │
└─────────────────────────────────────────┘
```

### 1.3 設置環境變量

**路徑：** Dashboard → Edge Functions → Settings

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions
2. 點擊右上角 **Settings** 或 **Manage secrets**
3. 添加 4 個變量：

```
┌─────────────────────────────────────────┐
│  Edge Function Secrets                   │
│                                          │
│  [Add new secret]                        │
│                                          │
│  Name: SUPABASE_URL                      │
│  Value: https://uhtwwxtazwqnlbejhprl... │
│  [Save]                                  │
│                                          │
│  Name: SUPABASE_ANON_KEY                 │
│  Value: eyJhbGciOiJIUzI1NiIsInR5cCI6... │
│  [Save]                                  │
│                                          │
│  Name: SUPABASE_SERVICE_ROLE_KEY         │
│  Value: eyJhbGciOiJIUzI1NiIsInR5cCI6... │
│  [Save]                                  │
│                                          │
│  Name: DATABASE_URL                      │
│  Value: postgresql://postgres.uhtww...  │
│  [Save]                                  │
└─────────────────────────────────────────┘
```

**✅ 完成後應該看到 4 個變量：**

| Name | Value (preview) |
|------|-----------------|
| DATABASE_URL | postgresql://postgres.u... |
| SUPABASE_ANON_KEY | eyJhbGciOiJIUzI1NiIsI... |
| SUPABASE_SERVICE_ROLE_KEY | eyJhbGciOiJIUzI1NiIsI... |
| SUPABASE_URL | https://uhtwwxtazwqnlb... |

---

## 步驟 2：創建資料庫表

### 2.1 打開 SQL Editor

**路徑：** Dashboard → SQL Editor

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/sql
2. 點擊 **New Query** 按鈕

```
┌─────────────────────────────────────────┐
│  SQL Editor                              │
│                                          │
│  [New Query] [Templates ▼] [History]    │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │ Untitled Query                   │   │
│  │                                  │   │
│  │ -- 在這裡貼上 SQL                │   │
│  │                                  │   │
│  └─────────────────────────────────┘   │
│                                          │
│  [Run]                                   │
└─────────────────────────────────────────┘
```

### 2.2 貼上建表 SQL

複製完整的 SQL 語句（從 `/COMPLETE_DEPLOYMENT_GUIDE.md` 的步驟 3.1）並貼到編輯器中。

### 2.3 執行 SQL

1. 點擊右下角綠色的 **Run** 按鈕
2. 等待 5-10 秒
3. 查看結果

**✅ 成功的結果：**

```
┌─────────────────────────────────────────┐
│  Results                                 │
│                                          │
│  ✓ Query executed successfully           │
│                                          │
│  status                                  │
│  ────────────────────────────────────   │
│  Database schema created successfully!   │
│                                          │
│  Rows: 1  Time: 234ms                    │
└─────────────────────────────────────────┘
```

### 2.4 驗證表已創建

1. 在 SQL Editor 輸入：
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```
2. 點擊 **Run**

**✅ 應該看到 6 個表：**

| table_name |
|------------|
| users |
| subscriptions |
| listings |
| rewards |
| withdrawals |
| reward_schedules |

---

## 步驟 3：查看函數日誌

### 3.1 打開 Edge Functions

**路徑：** Dashboard → Edge Functions

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions
2. 找到 `make-server-5c6718b9` 函數
3. 點擊函數名稱

```
┌─────────────────────────────────────────┐
│  Edge Functions                          │
│                                          │
│  [New Function]                          │
│                                          │
│  Name                Status    Updated   │
│  ────────────────────────────────────   │
│  make-server-5c6718b9                    │
│  🟢 Active           2m ago              │
│  ↑ 點擊這裡查看詳情                       │
└─────────────────────────────────────────┘
```

### 3.2 查看日誌

點擊 **Logs** 標籤

```
┌─────────────────────────────────────────┐
│  make-server-5c6718b9                    │
│                                          │
│  [Details] [Logs] [Metrics] [Settings]  │
│           ↑ 點擊這裡                      │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │ 2024-12-21 10:30:15              │   │
│  │ ✅ PostgreSQL connection...      │   │
│  │                                  │   │
│  │ 2024-12-21 10:30:14              │   │
│  │ ✅ Supabase Client initialized   │   │
│  │                                  │   │
│  │ 2024-12-21 10:30:13              │   │
│  │ Starting server...               │   │
│  └─────────────────────────────────┘   │
│                                          │
│  [Refresh] [Filter ▼] [Export]          │
└─────────────────────────────────────────┘
```

**✅ 正常的日誌應該包含：**
- ✅ Supabase Client initialized
- ✅ Postgres Client initialized
- ✅ PostgreSQL connection successful
- ✅ Storage Bucket 已存在

**❌ 錯誤日誌示例：**
- ❌ Database connection failed
- ❌ Environment variable not found
- ❌ Module not found

---

## 步驟 4：測試 API

### 4.1 使用 Dashboard 測試

**路徑：** Dashboard → API Docs

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/api
2. 雖然這裡是自動生成的 API 文檔（針對資料庫表）
3. 我們的 Edge Function 需要手動測試

### 4.2 使用瀏覽器測試

**直接訪問以下 URL：**

#### Health Check
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**✅ 正確響應：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

#### Listings API
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

**✅ 正確響應：**
```json
{
  "success": true,
  "listings": [],
  "total": 0
}
```

### 4.3 使用 curl 測試（終端機）

```bash
# Health Check
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health

# Listings API
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

### 4.4 使用 Postman/Insomnia 測試

1. 創建新請求
2. 方法：GET
3. URL：`https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health`
4. Headers：無需添加（Health Check 不需要認證）
5. 發送請求

---

## 🔧 常見問題排查（Dashboard 版）

### 問題 1：找不到環境變量設置

**解決方案：**
1. Dashboard → Edge Functions
2. 如果沒有任何函數，點擊 **New Function** 創建一個佔位函數
3. 然後就能看到 **Settings** 選項

### 問題 2：SQL 執行失敗

**檢查：**
1. SQL Editor → History 標籤
2. 查看之前的執行記錄
3. 確認是否有語法錯誤

**常見錯誤：**
- `relation "users" already exists` → 表已存在，可以忽略
- `syntax error` → 檢查 SQL 語法

### 問題 3：資料庫密碼忘記

**解決方案：**
1. Dashboard → Project Settings → Database
2. 找到 **Database password** 區塊
3. 點擊 **Reset database password**
4. **⚠️ 警告：** 重置密碼會導致正在運行的連接斷開
5. 複製新密碼並更新 `DATABASE_URL` 環境變量

### 問題 4：函數顯示「Failed」狀態

**排查步驟：**
1. 點擊函數名稱 → **Logs** 標籤
2. 查看最新的錯誤訊息
3. 常見原因：
   - 環境變量未設置
   - 資料庫連接失敗
   - 代碼語法錯誤

**解決方案：**
- 重新部署函數（使用 CLI）
- 檢查並更新環境變量
- 查看詳細錯誤日誌

---

## 📊 Dashboard 功能地圖

```
Supabase Dashboard
│
├── 🏠 Home
│   └── 專案總覽
│
├── 🔌 Edge Functions
│   ├── Functions 列表
│   ├── Logs（日誌）
│   ├── Metrics（效能指標）
│   └── Settings（環境變量）
│
├── 🗄️ Database
│   ├── Tables（表管理）
│   ├── SQL Editor（執行查詢）
│   ├── Extensions（擴展功能）
│   └── Backups（備份）
│
├── 🔐 Authentication
│   ├── Users（用戶管理）
│   ├── Policies（RLS 策略）
│   └── Providers（登入提供商）
│
├── 📦 Storage
│   └── Buckets（檔案儲存）
│
├── 📈 Logs
│   ├── Postgres Logs
│   ├── PostgREST Logs
│   └── Edge Function Logs
│
└── ⚙️ Project Settings
    ├── General（一般設定）
    ├── Database（資料庫設定）
    ├── API（API 金鑰）
    └── Billing（帳單）
```

---

## 🎯 快速操作清單

**每次部署後必做：**

- [ ] 1. 設置 4 個環境變量
- [ ] 2. 執行建表 SQL
- [ ] 3. 部署 Edge Function（使用 CLI）
- [ ] 4. 查看函數日誌確認啟動成功
- [ ] 5. 測試 Health Check
- [ ] 6. 測試 Listings API
- [ ] 7. 訪問前端首頁驗證連接

---

## 📱 手機版 Dashboard 提示

如果您使用手機訪問 Dashboard：

1. **環境變量設置**
   - 可能需要橫向滾動查看完整內容
   - 建議使用電腦或平板操作

2. **SQL Editor**
   - 手機鍵盤不太方便輸入 SQL
   - 建議複製完整 SQL 後貼上

3. **日誌查看**
   - 可能需要放大才能看清錯誤訊息
   - 建議使用「複製」功能複製到筆記本查看

---

**最後更新：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl  
**難度：** ⭐⭐☆☆☆（中等）
