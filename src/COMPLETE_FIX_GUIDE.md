# 🚀 完整修復指南：Uknow V2 API 部署

## 📋 問題總結

1. ❌ `column users_1.real_name does not exist` → 資料庫欄位名稱不匹配
2. ❌ `permission denied for table listings` → 資料庫權限問題
3. ❌ `ECONNREFUSED 127.0.0.1:5432` → DATABASE_URL 未設置

---

## ✅ 完整修復流程（30 分鐘）

### 階段 1：設置環境變數（5 分鐘）⭐ 最重要

#### 步驟 1.1：獲取 DATABASE_URL

1. **訪問 Supabase Database Settings：**
   ```
   https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/settings/database
   ```

2. **複製 Connection String（Transaction 模式）：**
   - 滾動到「Connection String」區域
   - 選擇「Transaction」模式（端口 6543，不是 5432）
   - 點擊「Copy」

3. **替換密碼：**
   ```
   postgresql://postgres.uhtwwxtazwqnlbejhprl:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
   將 `[YOUR-PASSWORD]` 替換為你的資料庫密碼。

---

#### 步驟 1.2：設置環境變數

**方法 A：使用 Supabase Dashboard**

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions
2. 點擊「Secrets」或「Settings」
3. 添加變數：
   - Name: `DATABASE_URL`
   - Value: （貼上完整的連接字串）
4. 點擊「Save」

**方法 B：使用 CLI**

```bash
supabase secrets set DATABASE_URL="postgresql://postgres.uhtwwxtazwqnlbejhprl:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  --project-ref uhtwwxtazwqnlbejhprl
```

---

### 階段 2：創建資料庫 Schema（10 分鐘）

#### 步驟 2.1：訪問 SQL Editor

```
https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/editor
```

---

#### 步驟 2.2：檢查現有表

執行以下 SQL：

```sql
-- 檢查是否有表
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- 檢查 users 表結構（如果存在）
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

**分析結果：**

- **如果沒有表** → 執行步驟 2.3（創建完整 schema）
- **如果有表但欄位錯誤**（例如只有 `name` 沒有 `real_name`）→ 執行步驟 2.4（重建 schema）
- **如果有表且欄位正確**（有 `real_name`）→ 跳到階段 3

---

#### 步驟 2.3：創建完整 Schema（如果資料庫是空的）

**複製並執行 `/EXECUTE_DATABASE_MIGRATION.md` 中的完整 SQL。**

關鍵表包括：
- `users`（包含 `real_name`、`id_number`、`phone` 等）
- `listings`
- `subscriptions`
- `referral_codes`
- `referral_relationships`
- `reward_schedules`
- `reward_history`
- `tasks`
- `task_progress`
- `withdrawals`

---

#### 步驟 2.4：重建 Schema（如果欄位不匹配）

⚠️ **警告：這將刪除所有現有資料！**

```sql
-- 清空資料庫
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

然後執行步驟 2.3 的完整 SQL。

---

### 階段 3：修復資料庫權限（5 分鐘）

執行以下 SQL（複製自 `/FIX_DATABASE_PERMISSIONS.sql`）：

```sql
-- 1. Schema 權限
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;

-- 2. 所有表的權限
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 3. 禁用 Row Level Security
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE listings DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_relationships DISABLE ROW LEVEL SECURITY;
ALTER TABLE reward_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE reward_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals DISABLE ROW LEVEL SECURITY;

-- 4. 預設權限（未來新表自動有權限）
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- 完成
SELECT 'Permissions fixed!' as status;
```

---

### 階段 4：重新部署 Edge Function（5 分鐘）

環境變數更新後，**必須**重新部署：

```bash
supabase functions deploy make-server-5c6718b9 \
  --no-verify-jwt \
  --project-ref uhtwwxtazwqnlbejhprl
```

**或者從 Dashboard：**
1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions/make-server-5c6718b9
2. 點擊「Deploy」按鈕

---

### 階段 5：測試 API（5 分鐘）

#### 測試 1：Health Check（新增的診斷端點）

```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應（成功）：**
```json
{
  "status": "ok",
  "timestamp": "2024-12-21T...",
  "responseTime": "150ms",
  "environment": {
    "variables": {
      "SUPABASE_URL": true,
      "SUPABASE_SERVICE_ROLE_KEY": true,
      "SUPABASE_ANON_KEY": true,
      "DATABASE_URL": true
    },
    "databaseUrlSource": "DATABASE_URL",
    "databaseUrlMasked": "postgresql://postgres.uhtwwxtazwqnlbejhprl:****@..."
  },
  "connections": {
    "supabase": "connected",
    "postgres": "connected"
  },
  "warnings": []
}
```

**如果有警告：**
```json
{
  "status": "warning",
  "warnings": [
    "DATABASE_URL is not set. Postgres SQL client will not work."
  ]
}
```

---

#### 測試 2：Listings API

```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

**期望響應：**
```json
{
  "success": true,
  "listings": [],
  "total": 0
}
```

---

#### 測試 3：查看 Function Logs

1. 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions/make-server-5c6718b9/logs

2. **應該看到：**
   ```
   [Database] ✅ Supabase Client initialized
   [Database] 🔗 Connecting to: postgresql://postgres.uhtwwxtazwqnlbejhprl:****@...
   [Database] ✅ Postgres Client initialized
   [Database Test] ✅ All connections successful
   ✅ PostgreSQL connection successful
   ```

3. **不應該看到：**
   ```
   ❌ ECONNREFUSED 127.0.0.1:5432
   ❌ column users_1.real_name does not exist
   ❌ permission denied for table listings
   ```

---

## 🔍 故障排除

### 問題 1：仍然顯示 `ECONNREFUSED`

**檢查：**
```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

查看 `environment.databaseUrlSource`：
- 如果是 `"none"` → DATABASE_URL 未設置
- 如果是 `"DATABASE_URL"` 但 `connections.postgres` 是 `"disconnected"` → 連接字串格式錯誤

**解決方案：**
1. 確認 DATABASE_URL 在 Dashboard → Functions → Secrets 中
2. 確認端口是 `:6543`（不是 `:5432`）
3. 確認密碼正確
4. 重新部署 Function

---

### 問題 2：仍然顯示 `permission denied`

**檢查權限：**
```sql
-- 檢查 listings 表權限
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'listings';

-- 檢查 RLS 狀態
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'listings';
```

**應該看到：**
- `service_role` 有 `SELECT`, `INSERT`, `UPDATE`, `DELETE` 權限
- `rowsecurity` = `f`（false，已禁用）

**如果沒有：**
重新執行階段 3 的權限修復 SQL。

---

### 問題 3：仍然顯示 `column does not exist`

**檢查欄位：**
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users';
```

**應該看到：**
- `real_name` ✅（不是 `name`）
- `id_number` ✅
- `phone` ✅（不是 `phone_number`）

**如果沒有 `real_name`：**
執行階段 2.4 重建 schema。

---

## 📊 驗證檢查清單

完成所有步驟後，確認以下項目：

### 環境變數 ✅
- [ ] `SUPABASE_URL` 已設置
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 已設置
- [ ] `SUPABASE_ANON_KEY` 已設置
- [ ] `DATABASE_URL` 已設置（端口 6543）

### 資料庫 Schema ✅
- [ ] `users` 表存在
- [ ] `users` 表有 `real_name` 欄位
- [ ] `users` 表有 `id_number` 欄位
- [ ] `users` 表有 `phone` 欄位
- [ ] `listings` 表存在
- [ ] 所有 10 個表都已創建

### 資料庫權限 ✅
- [ ] `service_role` 對所有表有完整權限
- [ ] 所有表的 RLS 已禁用
- [ ] `anon` 對公開表有 SELECT 權限

### Edge Function ✅
- [ ] Function 已重新部署
- [ ] `/health` 端點返回 `"status": "ok"`
- [ ] `connections.supabase` = `"connected"`
- [ ] `connections.postgres` = `"connected"`
- [ ] `/listings-v2/active` 正常返回

---

## 🎯 快速修復命令（一鍵複製）

### 1. 設置環境變數
```bash
supabase secrets set DATABASE_URL="postgresql://postgres.uhtwwxtazwqnlbejhprl:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" --project-ref uhtwwxtazwqnlbejhprl
```

### 2. 重新部署
```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt --project-ref uhtwwxtazwqnlbejhprl
```

### 3. 測試
```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

---

## 🆘 還是無法解決？

提供以下信息給我：

1. **Health Check 響應：**
   ```bash
   curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
   ```

2. **資料庫欄位列表：**
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
   ```

3. **Function Logs（最近 20 行）：**
   從 Dashboard → Functions → Logs 複製

我會立即協助診斷！

---

**立即開始修復！從階段 1 開始！** 🚀

完成每個階段後告訴我結果！
