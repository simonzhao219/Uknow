# 🚀 立即執行：資料庫 Schema 修復

## 🎯 最快解決方案

重新創建資料庫使用完整的 Prisma schema，無需修改代碼。

---

## ✅ 執行步驟（複製貼上）

### 步驟 1：訪問 Supabase SQL Editor

```
https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/editor
```

---

### 步驟 2：執行完整的 Migration SQL

複製以下 SQL 並執行：

```sql
-- ========================================
-- 清理現有 Schema（如果需要）
-- ========================================
-- ⚠️ 注意：這將刪除所有現有資料！
-- 如果資料庫已有重要資料，請跳過此步驟

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ========================================
-- Uknow 平台完整資料庫結構（Prisma Schema）
-- ========================================

-- 1. Users 表
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "real_name" TEXT NOT NULL,
    "id_number" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "account_status" TEXT NOT NULL DEFAULT 'Pending',
    "point_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active_referral_code_id" TEXT,
    "registration_step" INTEGER NOT NULL DEFAULT 0,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- 2. Subscriptions 表
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "grace_period_end" DATE NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_transaction_id" TEXT,
    "is_canceled" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- 3. Referral Codes 表
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- 4. Referral Relationships 表
CREATE TABLE "referral_relationships" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referee_id" TEXT NOT NULL,
    "referral_code_id" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_relationships_pkey" PRIMARY KEY ("id")
);

-- 5. Reward Schedules 表
CREATE TABLE "reward_schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "referee_id" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "month_number" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "executed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_schedules_pkey" PRIMARY KEY ("id")
);

-- 6. Reward History 表
CREATE TABLE "reward_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_history_pkey" PRIMARY KEY ("id")
);

-- 7. Tasks 表
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "reward_amount" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- 8. Task Progress 表
CREATE TABLE "task_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_progress_pkey" PRIMARY KEY ("id")
);

-- 9. Withdrawals 表
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_branch" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- 10. Listings 表
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "service_description" TEXT,
    "contact_line" TEXT,
    "contact_phone" TEXT,
    "contact_wechat" TEXT,
    "gender" TEXT NOT NULL,
    "photos" JSONB DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- ========================================
-- Indexes
-- ========================================

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_id_number_key" ON "users"("id_number");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_account_status_idx" ON "users"("account_status");
CREATE INDEX "users_active_referral_code_id_idx" ON "users"("active_referral_code_id");

CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");
CREATE INDEX "referral_codes_user_id_idx" ON "referral_codes"("user_id");
CREATE INDEX "referral_codes_is_active_idx" ON "referral_codes"("is_active");

CREATE INDEX "referral_relationships_referrer_id_idx" ON "referral_relationships"("referrer_id");
CREATE INDEX "referral_relationships_referee_id_idx" ON "referral_relationships"("referee_id");
CREATE INDEX "referral_relationships_referral_code_id_idx" ON "referral_relationships"("referral_code_id");
CREATE INDEX "referral_relationships_generation_idx" ON "referral_relationships"("generation");

CREATE INDEX "reward_schedules_user_id_idx" ON "reward_schedules"("user_id");
CREATE INDEX "reward_schedules_referee_id_idx" ON "reward_schedules"("referee_id");
CREATE INDEX "reward_schedules_status_idx" ON "reward_schedules"("status");
CREATE INDEX "reward_schedules_scheduled_date_idx" ON "reward_schedules"("scheduled_date");

CREATE INDEX "reward_history_user_id_idx" ON "reward_history"("user_id");
CREATE INDEX "reward_history_type_idx" ON "reward_history"("type");

CREATE INDEX "tasks_type_idx" ON "tasks"("type");
CREATE INDEX "tasks_is_active_idx" ON "tasks"("is_active");

CREATE INDEX "task_progress_user_id_idx" ON "task_progress"("user_id");
CREATE INDEX "task_progress_task_id_idx" ON "task_progress"("task_id");
CREATE UNIQUE INDEX "task_progress_user_id_task_id_key" ON "task_progress"("user_id", "task_id");

CREATE INDEX "withdrawals_user_id_idx" ON "withdrawals"("user_id");
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

CREATE INDEX "listings_user_id_idx" ON "listings"("user_id");
CREATE INDEX "listings_category_idx" ON "listings"("category");
CREATE INDEX "listings_city_idx" ON "listings"("city");
CREATE INDEX "listings_is_active_idx" ON "listings"("is_active");

-- ========================================
-- Foreign Keys
-- ========================================

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reward_schedules" ADD CONSTRAINT "reward_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reward_schedules" ADD CONSTRAINT "reward_schedules_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reward_history" ADD CONSTRAINT "reward_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listings" ADD CONSTRAINT "listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_active_referral_code_id_fkey" FOREIGN KEY ("active_referral_code_id") REFERENCES "referral_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ========================================
-- 完成！
-- ========================================

SELECT 'Database schema created successfully!' as message;
```

---

### 步驟 3：驗證 Schema

執行以下 SQL 確認欄位正確：

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

**應該看到：**
- id (text)
- email (text)
- real_name (text) ✅
- id_number (text) ✅
- birth_date (date) ✅
- phone (text) ✅
- account_status (text)
- point_balance (numeric)
- active_referral_code_id (text)
- registration_step (integer)
- email_verified (boolean)
- created_at (timestamp)
- updated_at (timestamp)

---

### 步驟 4：測試 API

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

**不再有欄位不存在的錯誤！** ✅

---

## 🎉 完成！

資料庫現在使用完整的 Prisma schema，包含：
- ✅ 所有新註冊流程需要的欄位
- ✅ 三代推薦系統
- ✅ 獎勵排程系統
- ✅ 任務系統
- ✅ 提領系統

---

## 📝 如果遇到錯誤

### 錯誤：權限不足

**症狀：** `permission denied for schema public`

**解決方案：**
```sql
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

### 錯誤：表已存在

**症狀：** `relation "users" already exists`

**解決方案：**
執行步驟 2 中的清理語句（`DROP SCHEMA IF EXISTS public CASCADE`）

### 錯誤：外鍵約束失敗

**症狀：** `violates foreign key constraint`

**解決方案：**
確保按順序執行 SQL（創建表 → 創建索引 → 創建外鍵）

---

## 🔍 下一步

1. ✅ 資料庫 schema 已正確創建
2. ⏭️ 測試註冊流程（4 步驟）
3. ⏭️ 測試推薦系統
4. ⏭️ 集成藍新金流

---

**創建時間：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl  
**預計執行時間：** 2 分鐘  
**風險：** 低（資料庫當前無生產資料）
