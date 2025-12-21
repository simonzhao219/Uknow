# 🔧 立即修復：資料庫權限錯誤

## ❌ 錯誤訊息
```
permission denied for table listings
```

## 🎯 修復步驟（3 步驟）

---

### 步驟 1️⃣：檢查資料庫狀態

訪問 Supabase SQL Editor：
```
https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/editor
```

執行以下 SQL（複製 `/CHECK_DATABASE_STATUS.sql` 的內容）：

```sql
-- 檢查是否有表存在
SELECT 
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 檢查 users 表的欄位
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

**分析結果：**

#### 情況 A：沒有表（空資料庫）
→ 執行步驟 2A（創建完整 schema）

#### 情況 B：有表但欄位不對（如只有 `name` 沒有 `real_name`）
→ 執行步驟 2B（重建 schema）

#### 情況 C：有表且欄位正確（有 `real_name`）
→ 執行步驟 2C（修復權限）

---

### 步驟 2️⃣：根據情況執行對應的修復

#### 步驟 2A：創建完整 Schema（如果資料庫是空的）

執行 `/EXECUTE_DATABASE_MIGRATION.md` 中的完整 SQL 腳本。

#### 步驟 2B：重建 Schema（如果欄位不對）

```sql
-- ⚠️ 這將刪除所有現有資料！
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

然後執行 `/EXECUTE_DATABASE_MIGRATION.md` 中的完整 SQL 腳本。

#### 步驟 2C：修復權限（如果表和欄位都正確）✅ 最快

執行以下 SQL（複製 `/FIX_DATABASE_PERMISSIONS.sql` 的內容）：

```sql
-- 授予所有權限
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 禁用 RLS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_relationships DISABLE ROW LEVEL SECURITY;
ALTER TABLE reward_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE reward_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals DISABLE ROW LEVEL SECURITY;
ALTER TABLE listings DISABLE ROW LEVEL SECURITY;

-- 明確授予每個表的權限
GRANT ALL ON TABLE listings TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE listings TO authenticated;
GRANT SELECT ON TABLE listings TO anon;

-- 對其他表也執行相同操作...
```

---

### 步驟 3️⃣：測試 API

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

✅ **成功！不再有權限錯誤！**

---

## 🔍 為什麼會出現權限錯誤？

### Supabase 權限架構

```
┌─────────────────────────────────────┐
│ Supabase 權限層級                     │
├─────────────────────────────────────┤
│ 1. Schema 權限 (public)              │
│    └─ GRANT ALL ON SCHEMA public    │
│                                      │
│ 2. Table 權限                        │
│    └─ GRANT ALL ON TABLE listings   │
│                                      │
│ 3. Row Level Security (RLS)         │
│    └─ ALTER TABLE ... DISABLE RLS   │
└─────────────────────────────────────┘
```

### 角色說明

| 角色 | 用途 | 權限需求 |
|------|------|---------|
| `postgres` | 超級用戶 | 完整權限 |
| `service_role` | Edge Functions | 完整權限（繞過 RLS） |
| `authenticated` | 已登入用戶 | 讀寫自己的資料 |
| `anon` | 匿名用戶 | 只讀公開資料 |

### Edge Functions 使用的角色

```typescript
// db.ts
export const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), // ← 使用 service_role
);
```

**關鍵：** `service_role` 必須有完整權限，且 RLS 必須禁用。

---

## 🚨 常見錯誤

### 錯誤 1：RLS 啟用導致 service_role 也被阻擋

**症狀：** `permission denied for table listings`

**解決方案：**
```sql
ALTER TABLE listings DISABLE ROW LEVEL SECURITY;
```

### 錯誤 2：表權限未授予 service_role

**症狀：** `permission denied for table listings`

**解決方案：**
```sql
GRANT ALL ON TABLE listings TO service_role;
```

### 錯誤 3：Schema 權限未授予

**症狀：** `permission denied for schema public`

**解決方案：**
```sql
GRANT ALL ON SCHEMA public TO service_role;
```

---

## 📝 快速修復（一鍵執行）

如果您確定資料庫中沒有重要資料，最快的方法是重建整個資料庫：

### ⚡ 5 分鐘完整重建

1. **清空資料庫**
   ```sql
   DROP SCHEMA IF EXISTS public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   GRANT ALL ON SCHEMA public TO public;
   ```

2. **執行完整 Migration**
   - 複製 `/EXECUTE_DATABASE_MIGRATION.md` 中的 SQL
   - 在 Supabase SQL Editor 執行

3. **執行權限修復**
   - 複製 `/FIX_DATABASE_PERMISSIONS.sql` 中的 SQL
   - 在 Supabase SQL Editor 執行

4. **測試**
   ```bash
   curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
   ```

---

## ✅ 驗證權限設置成功

執行以下 SQL 確認：

```sql
-- 1. 檢查 listings 表權限
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'listings';

-- 應該看到：
-- service_role | INSERT
-- service_role | SELECT
-- service_role | UPDATE
-- service_role | DELETE
-- anon        | SELECT

-- 2. 檢查 RLS 狀態
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'listings';

-- 應該看到：
-- listings | f  (false = 已禁用)
```

---

## 🎯 下一步

權限修復完成後：

1. ✅ 測試所有 API 端點
2. ✅ 創建測試用戶
3. ✅ 測試註冊流程
4. ✅ 測試推薦系統

---

**創建時間：** 2024-12-21  
**問題：** PostgreSQL 表權限錯誤  
**估計修復時間：** 2-5 分鐘
