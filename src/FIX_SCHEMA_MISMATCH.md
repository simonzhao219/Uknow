# 🔧 資料庫 Schema 欄位名稱不匹配修復指南

## ❌ 問題

錯誤訊息：`column users_1.real_name does not exist`

## 🔍 根本原因

代碼使用了 Prisma schema 的欄位名稱，但資料庫實際使用的是簡化的 V2 schema：

| 代碼中使用 | 資料庫實際欄位 | 狀態 |
|-----------|--------------|------|
| `real_name` | `name` | ❌ 不匹配 |
| `id_number` | （可能不存在） | ❌ 不匹配 |
| `phone_number` | `phone` | ❌ 不匹配 |

## ✅ 解決方案

需要統一修改所有 V2 API 文件中的欄位名稱，或者重新創建資料庫使用完整的 Prisma schema。

### 選項 A：修改代碼適配現有資料庫（推薦）⭐

修改所有 V2 API 文件，將欄位名稱改為簡化 schema：
- `real_name` → `name`
- `phone_number` → `phone`
- 移除 `id_number`（如果資料庫中不存在）

**影響文件：**
1. `/supabase/functions/server/auth_v2.ts` (5 處)
2. `/supabase/functions/server/listings_v2.ts` (2 處) ✅ 已修復
3. `/supabase/functions/server/cron_v2.ts` (6 處)
4. `/supabase/functions/server/referrals_v2.ts` (8 處)
5. `/supabase/functions/server/rewards_v2.ts` (1 處)
6. `/supabase/functions/server/profile_v2.ts` (1 處)

---

### 選項 B：重新創建資料庫使用完整 Schema

執行 Prisma migration 創建完整的 `users` 表結構。

**優點：**
- 保留所有欄位（real_name, id_number, phone_number）
- 符合新註冊流程需求
- 不需要修改代碼

**缺點：**
- 需要清空現有資料
- 需要執行 migration

---

## 🚀 立即修復（選項 A）

由於已經部署了 API，我建議先檢查資料庫實際 schema，然後決定修改方向。

### 步驟 1：檢查資料庫 Schema

訪問 Supabase Dashboard：
```
https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/editor
```

執行 SQL 查詢：
```sql
-- 查看 users 表結構
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users';
```

### 步驟 2：根據結果決定修復方向

**如果資料庫有 `real_name`, `id_number`, `phone_number`：**
→ 代碼沒問題，可能是其他原因

**如果資料庫只有 `name`, `phone`：**
→ 需要修改代碼（選項 A）

**如果資料庫是空的或可以重建：**
→ 執行 Prisma migration（選項 B）

---

## 📝 選項 B 詳細步驟（重新創建資料庫）

### 1. 清空現有資料

```sql
-- ⚠️ 警告：這將刪除所有資料！
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

### 2. 執行 Prisma Migration

在本地終端執行：
```bash
cd /path/to/Uknow
npx prisma db push
```

或者手動執行 migration SQL：
```bash
# 複製 /prisma/migrations/init.sql 的內容
# 到 Supabase Dashboard → SQL Editor → 執行
```

### 3. 驗證 Schema

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users';
```

**應該看到：**
- id
- email
- real_name ✅
- id_number ✅
- phone ✅ (注意：Prisma 是 `phone` 不是 `phone_number`)
- birth_date
- account_status
- point_balance
- active_referral_code_id
- registration_step
- email_verified
- created_at
- updated_at

### 4. 重新部署 Edge Function

```bash
supabase functions deploy make-server-5c6718b9 \
  --no-verify-jwt \
  --project-ref uhtwwxtazwqnlbejhprl
```

### 5. 測試

```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

---

## 🔍 Prisma Schema vs 簡化 Schema 對照表

### Prisma Schema (`/prisma/migrations/init.sql`)

```sql
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "real_name" TEXT NOT NULL,          ← 完整姓名
    "id_number" TEXT NOT NULL,          ← 身分證字號
    "birth_date" DATE NOT NULL,         ← 生日
    "phone" TEXT NOT NULL,              ← 手機（注意：不是 phone_number）
    "account_status" TEXT NOT NULL DEFAULT 'Pending',
    "point_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active_referral_code_id" TEXT,
    "registration_step" INTEGER NOT NULL DEFAULT 0,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
```

### 簡化 V2 Schema (`/CREATE_DATABASE.sql`)

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,                  ← 只有名字（沒有 real_name）
  phone TEXT UNIQUE,                   ← 手機
  referral_code TEXT UNIQUE NOT NULL,  ← 推薦碼（不同的設計）
  referred_by_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**關鍵差異：**
1. ID 類型：TEXT (Prisma) vs UUID (簡化)
2. 姓名欄位：real_name (Prisma) vs name (簡化)
3. 沒有：id_number, birth_date, account_status, point_balance, registration_step（簡化版缺少）
4. 推薦碼設計：active_referral_code_id (Prisma) vs referral_code (簡化)

---

## 🎯 推薦做法

### 如果是全新專案：

✅ **使用 Prisma Schema**（選項 B）
- 執行 `/prisma/migrations/init.sql`
- 保留所有功能完整性
- 符合新註冊流程設計

### 如果已有生產資料：

⚠️ **修改代碼適配資料庫**（選項 A）
- 批量替換欄位名稱
- 避免資料遺失
- 需要額外測試

---

## 📞 下一步

請告訴我：

1. **資料庫中是否有重要資料？**
   - 是 → 使用選項 A（修改代碼）
   - 否 → 使用選項 B（重新創建資料庫）

2. **想使用哪個 schema？**
   - Prisma（完整功能） → 執行 migration
   - 簡化（最小化） → 修改代碼

我會立即提供相應的修復方案！

---

**創建時間：** 2024-12-21  
**問題：** 資料庫欄位名稱不匹配  
**影響：** 所有 V2 API 端點
