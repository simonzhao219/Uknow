# Part 3: PostgreSQL 資料模型設計（完整版）

## 🗂️ Part 3: 資料模型設計（PostgreSQL Schema）

基於新規格的技術要求，設計以下 9 張 PostgreSQL 資料表。

**設計原則：**
1. ✅ **SSOT（單一事實來源）** - 姓名只存在 users 表，使用外鍵關聯
2. ✅ **ACID 保證** - 使用 Transaction 確保資料一致性
3. ✅ **查詢效能** - 索引優化，支援複雜 JOIN
4. ✅ **參照完整性** - 外鍵約束自動檢查
5. ✅ **型別安全** - 使用 Prisma ORM

---

### 3.1 Users Table（用戶主表）

**目的：** 單一事實來源（SSOT），所有用戶資料的唯一真實來源

**SQL Schema:**

```sql
CREATE TABLE users (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本資訊
  email VARCHAR(255) UNIQUE NOT NULL,
  real_name VARCHAR(100) NOT NULL,           -- SSOT：真實姓名唯一來源
  id_number VARCHAR(20) UNIQUE NOT NULL,     -- 身分證字號
  birth_date DATE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  
  -- 帳號狀態
  account_status VARCHAR(20) DEFAULT 'Pending' 
    CHECK (account_status IN ('Active', 'Canceled', 'Grace', 'Fail', 'Pending')),
  
  -- 財務資訊
  point_balance DECIMAL(10, 2) DEFAULT 0 CHECK (point_balance >= 0),
  
  -- 推薦碼
  active_referral_code_id UUID,  -- 外鍵關聯到 referral_codes.id
  
  -- 註冊流程
  registration_step INTEGER DEFAULT 0 CHECK (registration_step BETWEEN 0 AND 3),
  email_verified BOOLEAN DEFAULT FALSE,
  
  -- 時間戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引優化
CREATE INDEX idx_users_account_status ON users(account_status);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_point_balance ON users(point_balance);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Trigger: 自動更新 updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Prisma Schema:**

```prisma
model User {
  id                    String    @id @default(uuid())
  email                 String    @unique
  realName              String    @map("real_name")
  idNumber              String    @unique @map("id_number")
  birthDate             DateTime  @map("birth_date") @db.Date
  phone                 String
  
  accountStatus         String    @default("Pending") @map("account_status")
  pointBalance          Decimal   @default(0) @map("point_balance") @db.Decimal(10, 2)
  
  activeReferralCodeId  String?   @map("active_referral_code_id")
  
  registrationStep      Int       @default(0) @map("registration_step")
  emailVerified         Boolean   @default(false) @map("email_verified")
  
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  
  // Relations
  subscription          Subscription?
  referralCodes         ReferralCode[]
  referralsAsReferrer   ReferralRelationship[] @relation("Referrer")
  referralsAsReferee    ReferralRelationship[] @relation("Referee")
  rewardSchedules       RewardSchedule[]
  rewardHistory         RewardHistory[]
  withdrawals           Withdrawal[]
  taskProgress          TaskProgress[]
  listing               Listing?
  
  @@map("users")
}
```

**SSOT 原則：**
- ✅ `real_name` 是唯一真實來源，所有顯示姓名的地方都必須 JOIN 此表
- ✅ `account_status` 由訂閱到期日動態計算或嚴格維護
- ❌ 嚴禁在其他表中複製姓名

---

### 3.2 Subscriptions Table（訂閱表）

**目的：** 管理會員訂閱週期，與帳號狀態連動

**SQL Schema:**

```sql
CREATE TABLE subscriptions (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 外鍵（一對一）
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 狀態
  status VARCHAR(20) DEFAULT 'Active' 
    CHECK (status IN ('Active', 'Canceled', 'Grace', 'Fail')),
  
  -- 週期資訊
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  grace_period_end DATE NOT NULL,
  
  -- 支付資訊
  payment_date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_transaction_id VARCHAR(255),
  
  -- 取消資訊
  is_canceled BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  
  -- 時間戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraint: grace_period_end 必須是 end_date + 60天
  CONSTRAINT valid_grace_period 
    CHECK (grace_period_end = end_date + INTERVAL '60 days')
);

-- 索引
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_subscriptions_grace_period_end ON subscriptions(grace_period_end);
```

**Prisma Schema:**

```prisma
model Subscription {
  id                    String    @id @default(uuid())
  userId                String    @unique @map("user_id")
  
  status                String    @default("Active")
  
  startDate             DateTime  @map("start_date") @db.Date
  endDate               DateTime  @map("end_date") @db.Date
  gracePeriodEnd        DateTime  @map("grace_period_end") @db.Date
  
  paymentDate           DateTime  @map("payment_date") @db.Date
  amount                Decimal   @db.Decimal(10, 2)
  paymentTransactionId  String?   @map("payment_transaction_id")
  
  isCanceled            Boolean   @default(false) @map("is_canceled")
  canceledAt            DateTime? @map("canceled_at")
  
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  
  // Relations
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("subscriptions")
}
```

**狀態計算邏輯（PostgreSQL Function）:**

```sql
CREATE OR REPLACE FUNCTION calculate_subscription_status(
  p_subscription_id UUID
) RETURNS VARCHAR(20) AS $$
DECLARE
  v_status VARCHAR(20);
  v_is_canceled BOOLEAN;
  v_end_date DATE;
  v_grace_period_end DATE;
BEGIN
  SELECT is_canceled, end_date, grace_period_end
  INTO v_is_canceled, v_end_date, v_grace_period_end
  FROM subscriptions
  WHERE id = p_subscription_id;
  
  IF v_is_canceled THEN
    IF CURRENT_DATE <= v_end_date THEN
      v_status := 'Canceled';  -- 取消但未到期
    ELSIF CURRENT_DATE <= v_grace_period_end THEN
      v_status := 'Grace';     -- 寬限期
    ELSE
      v_status := 'Fail';      -- 已失效
    END IF;
  ELSE
    IF CURRENT_DATE <= v_end_date THEN
      v_status := 'Active';    -- 正常
    ELSIF CURRENT_DATE <= v_grace_period_end THEN
      v_status := 'Grace';     -- 寬限期
    ELSE
      v_status := 'Fail';      -- 已失效
    END IF;
  END IF;
  
  RETURN v_status;
END;
$$ LANGUAGE plpgsql;
```

---

### 3.3 Referral Codes Table（推薦碼表）

**目的：** 管理推薦碼，支援 O(log N) 查詢

**SQL Schema:**

```sql
CREATE TABLE referral_codes (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 推薦碼（9碼，唯一）
  code VARCHAR(9) UNIQUE NOT NULL,
  
  -- 外鍵
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 狀態
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  
  -- 時間戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  inactivated_at TIMESTAMP
);

-- 索引（O(log N) 查詢）
CREATE UNIQUE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX idx_referral_codes_status ON referral_codes(status);
```

**Prisma Schema:**

```prisma
model ReferralCode {
  id              String    @id @default(uuid())
  code            String    @unique
  userId          String    @map("user_id")
  status          String    @default("Active")
  createdAt       DateTime  @default(now()) @map("created_at")
  inactivatedAt   DateTime? @map("inactivated_at")
  
  // Relations
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("referral_codes")
}
```

---

### 3.4 Referral Relationships Table（推薦關係表）

**目的：** 記錄三代推薦關係，支援組織樹查詢

**SQL Schema:**

```sql
CREATE TABLE referral_relationships (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 外鍵（推薦人 → 被推薦人）
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 代數
  generation INTEGER NOT NULL CHECK (generation IN (1, 2, 3)),
  
  -- 組織樹索引（預計算，支援快速查詢）
  gen1_referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gen2_referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gen3_referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- 狀態
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  
  -- 推薦碼資訊
  referral_code_id UUID REFERENCES referral_codes(id),
  referral_code VARCHAR(9),
  
  -- 時間戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  inactivated_at TIMESTAMP,
  
  -- 防止自己推薦自己
  CONSTRAINT no_self_referral CHECK (referrer_id != referee_id),
  
  -- 防止重複推薦
  UNIQUE(referee_id)
);

-- 索引（組織樹查詢優化）
CREATE INDEX idx_referral_gen1 ON referral_relationships(gen1_referrer_id) WHERE generation = 1;
CREATE INDEX idx_referral_gen2 ON referral_relationships(gen2_referrer_id) WHERE generation = 2;
CREATE INDEX idx_referral_gen3 ON referral_relationships(gen3_referrer_id) WHERE generation = 3;
CREATE INDEX idx_referral_referrer ON referral_relationships(referrer_id);
CREATE INDEX idx_referral_referee ON referral_relationships(referee_id);
CREATE INDEX idx_referral_status ON referral_relationships(status);
```

**Prisma Schema:**

```prisma
model ReferralRelationship {
  id                String    @id @default(uuid())
  
  referrerId        String    @map("referrer_id")
  refereeId         String    @unique @map("referee_id")
  
  generation        Int
  
  gen1ReferrerId    String?   @map("gen1_referrer_id")
  gen2ReferrerId    String?   @map("gen2_referrer_id")
  gen3ReferrerId    String?   @map("gen3_referrer_id")
  
  status            String    @default("Active")
  
  referralCodeId    String?   @map("referral_code_id")
  referralCode      String?   @map("referral_code")
  
  createdAt         DateTime  @default(now()) @map("created_at")
  inactivatedAt     DateTime? @map("inactivated_at")
  
  // Relations
  referrer          User      @relation("Referrer", fields: [referrerId], references: [id], onDelete: Cascade)
  referee           User      @relation("Referee", fields: [refereeId], references: [id], onDelete: Cascade)
  
  @@map("referral_relationships")
}
```

**組織樹查詢範例（SQL）:**

```sql
-- 查詢某用戶的組織樹（單次 JOIN，效能極佳）
SELECT 
  rr.id,
  rr.generation,
  rr.status,
  rr.created_at,
  -- 被推薦人資訊（SSOT）
  u_referee.id AS referee_id,
  u_referee.real_name AS referee_name,
  u_referee.account_status AS referee_status,
  -- 推薦人資訊（SSOT）
  u_referrer.id AS referrer_id,
  u_referrer.real_name AS referrer_name,
  u_referrer.account_status AS referrer_status
FROM referral_relationships rr
JOIN users u_referee ON rr.referee_id = u_referee.id
LEFT JOIN users u_referrer ON rr.referrer_id = u_referrer.id
WHERE rr.gen1_referrer_id = $1  -- 參數：用戶ID
ORDER BY rr.generation, rr.created_at;
```

---

### 3.5 Reward Schedules Table（獎勵排程表）

**目的：** 管理年費月領獎勵排程

**SQL Schema:**

```sql
CREATE TABLE reward_schedules (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 外鍵（接收者）
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 外鍵（來源）
  source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 代數與月份
  generation INTEGER NOT NULL CHECK (generation IN (1, 2, 3)),
  month_number INTEGER NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  
  -- 金額
  amount DECIMAL(10, 2) NOT NULL,
  
  -- 狀態
  status VARCHAR(20) DEFAULT 'Pending' 
    CHECK (status IN ('Pending', 'Completed', 'Void')),
  
  -- 排程日期
  scheduled_date DATE NOT NULL,
  issued_date DATE,
  
  -- 時間戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  voided_at TIMESTAMP,
  void_reason TEXT
);

-- 索引（每日掃描優化）
CREATE INDEX idx_reward_schedules_scheduled_date 
  ON reward_schedules(scheduled_date) WHERE status = 'Pending';
CREATE INDEX idx_reward_schedules_recipient ON reward_schedules(recipient_user_id);
CREATE INDEX idx_reward_schedules_source ON reward_schedules(source_user_id);
CREATE INDEX idx_reward_schedules_status ON reward_schedules(status);
```

**Prisma Schema:**

```prisma
model RewardSchedule {
  id              String    @id @default(uuid())
  
  recipientUserId String    @map("recipient_user_id")
  sourceUserId    String    @map("source_user_id")
  
  generation      Int
  monthNumber     Int       @map("month_number")
  
  amount          Decimal   @db.Decimal(10, 2)
  
  status          String    @default("Pending")
  
  scheduledDate   DateTime  @map("scheduled_date") @db.Date
  issuedDate      DateTime? @map("issued_date") @db.Date
  
  createdAt       DateTime  @default(now()) @map("created_at")
  completedAt     DateTime? @map("completed_at")
  voidedAt        DateTime? @map("voided_at")
  voidReason      String?   @map("void_reason")
  
  // Relations
  recipient       User      @relation(fields: [recipientUserId], references: [id], onDelete: Cascade)
  
  @@map("reward_schedules")
}
```

**每日發放查詢（批次處理）:**

```sql
-- 查詢今日待發放的獎勵（單次查詢）
SELECT 
  rs.*,
  u.account_status,
  u.point_balance
FROM reward_schedules rs
JOIN users u ON rs.recipient_user_id = u.id
WHERE rs.scheduled_date = CURRENT_DATE
  AND rs.status = 'Pending'
ORDER BY rs.created_at;

-- 批次發放（Transaction 保證）
BEGIN;

-- 1. 更新獎勵排程狀態
UPDATE reward_schedules
SET 
  status = CASE 
    WHEN (SELECT account_status FROM users WHERE id = recipient_user_id) = 'Fail' 
    THEN 'Void'
    ELSE 'Completed'
  END,
  issued_date = CURRENT_DATE,
  completed_at = CURRENT_TIMESTAMP,
  void_reason = CASE
    WHEN (SELECT account_status FROM users WHERE id = recipient_user_id) = 'Fail'
    THEN '帳號已失效'
    ELSE NULL
  END
WHERE scheduled_date = CURRENT_DATE
  AND status = 'Pending';

-- 2. 增加用戶點數（批次更新）
UPDATE users
SET point_balance = point_balance + (
  SELECT SUM(amount)
  FROM reward_schedules
  WHERE recipient_user_id = users.id
    AND scheduled_date = CURRENT_DATE
    AND status = 'Completed'
)
WHERE id IN (
  SELECT recipient_user_id
  FROM reward_schedules
  WHERE scheduled_date = CURRENT_DATE
    AND status = 'Completed'
);

COMMIT;
```

---

### 3.6 Reward History Table（獎勵歷史表）

**目的：** 記錄所有獎勵發放歷史，支援溯源

**SQL Schema:**

```sql
CREATE TABLE reward_history (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 外鍵（接收者）
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 類型與金額
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  
  -- 推薦關係（可選，用於溯源）
  referee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referrer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  generation INTEGER CHECK (generation IN (1, 2, 3)),
  month_number INTEGER CHECK (month_number BETWEEN 1 AND 12),
  
  -- 描述
  description TEXT,
  
  -- 時間戳
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_reward_history_user_id ON reward_history(user_id);
CREATE INDEX idx_reward_history_issued_at ON reward_history(issued_at DESC);
CREATE INDEX idx_reward_history_type ON reward_history(type);
```

**Prisma Schema:**

```prisma
model RewardHistory {
  id              String    @id @default(uuid())
  
  userId          String    @map("user_id")
  
  type            String
  amount          Decimal   @db.Decimal(10, 2)
  
  refereeUserId   String?   @map("referee_user_id")
  referrerUserId  String?   @map("referrer_user_id")
  
  generation      Int?
  monthNumber     Int?      @map("month_number")
  
  description     String?
  
  issuedAt        DateTime  @default(now()) @map("issued_at")
  
  // Relations
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("reward_history")
}
```

---

### 3.7 Withdrawals Table（提領表）

**目的：** 管理點數提領申請與審核

**SQL Schema:**

```sql
CREATE TABLE withdrawals (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 外鍵
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 金額
  amount DECIMAL(10, 2) NOT NULL 
    CHECK (amount >= 1000 AND amount % 1000 = 0),
  fee DECIMAL(10, 2) DEFAULT 15,
  total_deducted DECIMAL(10, 2) NOT NULL,
  
  -- 狀態
  status VARCHAR(20) DEFAULT 'Pending' 
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
  
  -- 銀行資訊
  bank_code VARCHAR(10),
  account_number VARCHAR(50),
  account_name VARCHAR(100),
  
  -- 審核資訊
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  reject_reason TEXT,
  
  -- 時間戳
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- 索引
CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_withdrawals_requested_at ON withdrawals(requested_at DESC);
```

**Prisma Schema:**

```prisma
model Withdrawal {
  id              String    @id @default(uuid())
  
  userId          String    @map("user_id")
  
  amount          Decimal   @db.Decimal(10, 2)
  fee             Decimal   @default(15) @db.Decimal(10, 2)
  totalDeducted   Decimal   @map("total_deducted") @db.Decimal(10, 2)
  
  status          String    @default("Pending")
  
  bankCode        String?   @map("bank_code")
  accountNumber   String?   @map("account_number")
  accountName     String?   @map("account_name")
  
  reviewedBy      String?   @map("reviewed_by")
  reviewedAt      DateTime? @map("reviewed_at")
  rejectReason    String?   @map("reject_reason")
  
  requestedAt     DateTime  @default(now()) @map("requested_at")
  processedAt     DateTime? @map("processed_at")
  completedAt     DateTime? @map("completed_at")
  
  // Relations
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("withdrawals")
}
```

**提領操作（PostgreSQL Function，ACID 保證）:**

```sql
CREATE OR REPLACE FUNCTION process_withdrawal_request(
  p_user_id UUID,
  p_amount DECIMAL,
  p_bank_code VARCHAR,
  p_account_number VARCHAR,
  p_account_name VARCHAR
) RETURNS JSON AS $$
DECLARE
  v_balance DECIMAL;
  v_total_required DECIMAL;
  v_account_status VARCHAR(20);
  v_withdrawal_id UUID;
BEGIN
  -- 鎖定用戶記錄（防止競態條件）
  SELECT point_balance, account_status
  INTO v_balance, v_account_status
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;
  
  -- 計算總需求
  v_total_required := p_amount + 15;
  
  -- 檢查餘額
  IF v_balance < v_total_required THEN
    RAISE EXCEPTION '餘額不足。需要 % Points，目前餘額 % Points', 
      v_total_required, v_balance;
  END IF;
  
  -- 檢查金額
  IF p_amount < 1000 OR p_amount % 1000 != 0 THEN
    RAISE EXCEPTION '提領金額必須是1000的倍數，且最低1000';
  END IF;
  
  -- 檢查帳號狀態
  IF v_account_status IN ('Grace', 'Fail') THEN
    RAISE EXCEPTION '帳號狀態不允許提領（Grace/Fail）';
  END IF;
  
  -- 扣除點數
  UPDATE users 
  SET point_balance = point_balance - v_total_required
  WHERE id = p_user_id;
  
  -- 創建提領記錄
  INSERT INTO withdrawals (
    user_id, amount, fee, total_deducted, 
    status, bank_code, account_number, account_name
  )
  VALUES (
    p_user_id, p_amount, 15, v_total_required, 
    'Pending', p_bank_code, p_account_number, p_account_name
  )
  RETURNING id INTO v_withdrawal_id;
  
  -- 返回結果
  RETURN json_build_object(
    'success', true,
    'withdrawalId', v_withdrawal_id,
    'amount', p_amount,
    'fee', 15,
    'totalDeducted', v_total_required,
    'newBalance', v_balance - v_total_required
  );
END;
$$ LANGUAGE plpgsql;
```

---

### 3.8 Task Progress Table（任務進度表）

**目的：** 記錄任務進度（連續推薦達人、推薦王）

**SQL Schema:**

```sql
CREATE TABLE task_progress (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 外鍵
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 任務類型
  task_type VARCHAR(50) NOT NULL 
    CHECK (task_type IN ('consecutive_referral', 'monthly_king')),
  
  -- 進度
  current_count INTEGER DEFAULT 0,
  target_count INTEGER NOT NULL,
  
  -- 狀態
  status VARCHAR(20) DEFAULT 'Active' 
    CHECK (status IN ('Active', 'Completed', 'Reset')),
  
  -- 連續推薦達人專用
  consecutive_months INTEGER,
  last_referral_month VARCHAR(7),  -- YYYY-MM
  
  -- 推薦王專用
  current_month VARCHAR(7),        -- YYYY-MM
  completed_count INTEGER DEFAULT 0,
  
  -- 時間戳
  last_reset_at TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 防止重複任務
  UNIQUE(user_id, task_type)
);

-- 索引
CREATE INDEX idx_task_progress_user_task ON task_progress(user_id, task_type);
CREATE INDEX idx_task_progress_status ON task_progress(status);
```

**Prisma Schema:**

```prisma
model TaskProgress {
  id                  String    @id @default(uuid())
  
  userId              String    @map("user_id")
  
  taskType            String    @map("task_type")
  
  currentCount        Int       @default(0) @map("current_count")
  targetCount         Int       @map("target_count")
  
  status              String    @default("Active")
  
  consecutiveMonths   Int?      @map("consecutive_months")
  lastReferralMonth   String?   @map("last_referral_month")
  
  currentMonth        String?   @map("current_month")
  completedCount      Int       @default(0) @map("completed_count")
  
  lastResetAt         DateTime? @map("last_reset_at")
  lastUpdatedAt       DateTime  @default(now()) @map("last_updated_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  
  // Relations
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([userId, taskType])
  @@map("task_progress")
}
```

---

### 3.9 Listings Table（刊登表）

**目的：** 管理服務者刊登

**SQL Schema:**

```sql
CREATE TABLE listings (
  -- 主鍵
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 外鍵（一對一）
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 基本資訊
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  gender VARCHAR(20),
  
  -- 推薦碼
  referral_code_id UUID REFERENCES referral_codes(id),
  
  -- 狀態
  is_active BOOLEAN DEFAULT TRUE,
  
  -- 時間戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_listings_user_id ON listings(user_id);
CREATE INDEX idx_listings_is_active ON listings(is_active);
CREATE INDEX idx_listings_category ON listings(category);
CREATE INDEX idx_listings_city ON listings(city);
```

**Prisma Schema:**

```prisma
model Listing {
  id                String    @id @default(uuid())
  
  userId            String    @unique @map("user_id")
  
  name              String
  category          String
  city              String
  gender            String?
  
  referralCodeId    String?   @map("referral_code_id")
  
  isActive          Boolean   @default(true) @map("is_active")
  
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  
  // Relations
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("listings")
}
```

---

## 📊 資料表關聯圖（ER Diagram）

```
users (1) ─────────── (1) subscriptions
  │
  ├── (1) ────────── (0..N) referral_codes
  │
  ├── (1:Referrer) ── (0..N) referral_relationships
  ├── (1:Referee) ─── (0..1) referral_relationships
  │
  ├── (1) ────────── (0..N) reward_schedules
  ├── (1) ────────── (0..N) reward_history
  ├── (1) ────────── (0..N) withdrawals
  ├── (1) ────────── (0..N) task_progress
  │
  └── (1) ────────── (0..1) listings
```

---

## 🎯 PostgreSQL 優勢總結

### 1. SSOT 保證

**KV Store：** 需要手動維護姓名一致性
```typescript
// ❌ 容易出錯
const referee = await kv.get(`user:${refereeId}:profile`);
history.push({
  refereeName: referee.name  // 複製姓名，未來可能不一致
});
```

**PostgreSQL：** 外鍵自動保證
```sql
-- ✅ 自動保證一致性
SELECT 
  rh.*,
  u.real_name AS referee_name  -- 即時查詢，永遠正確
FROM reward_history rh
JOIN users u ON rh.referee_user_id = u.id;
```

### 2. 查詢效能

**KV Store：** 組織樹需要多次讀取
```typescript
// ❌ N+1 查詢問題
const gen1Ids = await kv.get(`user:${userId}:gen1`);  // 1次
for (const id of gen1Ids) {
  const listing = await kv.get(`listing:${id}`);      // N次
  const user = await kv.get(`user:${listing.userId}:profile`);  // N次
}
// 總計：1 + 2N 次讀取
```

**PostgreSQL：** 單次 JOIN 查詢
```sql
-- ✅ 單次查詢
SELECT 
  rr.*,
  u_referee.real_name,
  u_referrer.real_name
FROM referral_relationships rr
JOIN users u_referee ON rr.referee_id = u_referee.id
LEFT JOIN users u_referrer ON rr.referrer_id = u_referrer.id
WHERE rr.gen1_referrer_id = $1;
-- 總計：1 次查詢
```

### 3. ACID 保證

**KV Store：** 需手動實作樂觀鎖
```typescript
// ❌ 複雜且容易出錯
let retries = 3;
while (retries > 0) {
  const profile = await kv.get(`user:${userId}:profile`);
  const updated = await kv.compareAndSwap(
    `user:${userId}:profile`,
    profile.version,
    newProfile
  );
  if (updated) break;
  retries--;
}
```

**PostgreSQL：** Transaction 自動處理
```sql
-- ✅ 簡單且可靠
BEGIN;
SELECT * FROM users WHERE id = $1 FOR UPDATE;
UPDATE users SET point_balance = point_balance - 1015 WHERE id = $1;
INSERT INTO withdrawals (...) VALUES (...);
COMMIT;
```

### 4. 開發效率

**KV Store：** 需手動實作很多邏輯
- 手動維護索引
- 手動實作 JOIN
- 手動檢查參照完整性
- 手動實作併發控制

**PostgreSQL：** 資料庫自動處理
- ✅ 索引自動優化
- ✅ JOIN 內建支援
- ✅ 外鍵自動檢查
- ✅ Transaction 自動處理

---

## ✅ 結論

**PostgreSQL 完美符合新規格需求：**
1. ✅ SSOT - 外鍵保證
2. ✅ ACID - Transaction 保證
3. ✅ 查詢效能 - 索引 + JOIN 優化
4. ✅ 開發效率 - 標準 SQL + ORM
5. ✅ 工時減少 - 440h → 380h（減少 60h）
