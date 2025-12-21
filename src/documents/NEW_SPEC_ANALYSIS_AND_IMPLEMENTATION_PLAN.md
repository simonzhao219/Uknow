# 🏗️ 新規格深度分析與 Phase-by-Phase 實作方案

**文件版本：** v1.3  
**建立日期：** 2025-12-21  
**最後更新：** 2025-12-21  
**架構師：** Senior System Architect & UI/UX Designer  
**預估總工時：** 420 小時

**📝 更新記錄：**
- v1.3 (2025-12-21): **重大更新** - 深度架構審查後修正，確認系統尚未上線，簡化為全新建置（工時調整為 420h）
- v1.2 (2025-12-21): **重大變更** - 資料儲存從 KV Store 改為 PostgreSQL（效能提升、開發效率提升、工時減少 60h）
- v1.1 (2025-12-21): 更正 Email 驗證機制為「驗證信」（與現有系統一致）

---

## 📊 Executive Summary

本文件基於新規格需求，提出 Uknow 平台全新會員訂閱制功能的完整實作方案。新規格引入了「會員訂閱制」、「四狀態帳號管理」、「年費月領獎勵」等核心功能，採用 PostgreSQL + Prisma ORM 架構，從零開始建置。

### ✅ 重要前提

**系統狀態：** 尚未上線，無現有用戶資料

**影響：**
1. ✅ **無需資料遷移** - 直接建置 PostgreSQL 系統
2. ✅ **無需考慮向下相容** - 可採用最佳實踐
3. ✅ **無用戶溝通成本** - 直接上線新規格
4. ✅ **工時大幅簡化** - 無遷移成本

### 🔄 技術架構：PostgreSQL + Prisma

新規格的技術需求（SSOT、ACID、複雜查詢）完美適合 PostgreSQL。

**選擇理由：**
1. ✅ **SSOT 保證** - 外鍵約束自動保證資料一致性
2. ✅ **ACID 保證** - Transaction 自動處理併發控制
3. ✅ **複雜查詢** - JOIN、索引優化，組織樹查詢效能極佳
4. ✅ **開發效率** - Prisma ORM 提供型別安全
5. ✅ **無歷史包袱** - 全新系統，可採用最佳實踐

**技術對比：**
| 需求 | KV Store 方案 | PostgreSQL 方案（✅ 採用）|
|------|--------------|------------------------|
| SSOT（姓名唯一來源） | 手動維護 | ✅ 外鍵自動保證 |
| 組織樹查詢 | 多次讀取 | ✅ 單次 JOIN |
| 提領併發控制 | 手動樂觀鎖 | ✅ Transaction |
| 每日獎勵發放 | 逐筆處理 | ✅ 批次 UPDATE |
| 開發複雜度 | 高 | ✅ 低 |

---

## ⚠️ 重要規格說明

### 📧 Email 驗證機制

**採用方式：** 使用 **Supabase Auth 驗證信機制**

**流程：**
1. 用戶註冊時輸入 Email 和密碼
2. 後端調用 Supabase Auth API 創建用戶
3. **Supabase Auth 自動發送驗證信到用戶郵箱**
4. 用戶點擊郵件中的驗證連結（格式：`/auth/callback?token=xxx`）
5. 前端 `AuthCallback` 組件處理驗證
6. 驗證成功後導向下一步註冊流程

**❌ 不採用：** 驗證碼輸入機制（用戶手動輸入6位數驗證碼）

**✅ 優點：**
- 利用 Supabase Auth 內建功能，穩定可靠
- 用戶體驗佳，一鍵驗證
- 無需額外開發驗證碼系統

---

### 🔑 推薦碼格式規範

**格式：** `3個小寫英文字 + 6個數字`

**範例：**
- ✅ `abc123456`
- ✅ `xyz789012`
- ❌ `ABC123456`（不可使用大寫）
- ❌ `ab1234567`（英文字數量錯誤）
- ❌ `abcd12345`（數字數量錯誤）

**生成規則：**
```typescript
function generateReferralCode(): string {
  // 3個小寫英文字（a-z）
  const letters = Array.from({ length: 3 }, () => 
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join('');
  
  // 6個數字（0-9）
  const numbers = Array.from({ length: 6 }, () => 
    Math.floor(Math.random() * 10)
  ).join('');
  
  return letters + numbers;  // 例如：abc123456
}
```

**唯一性檢查：**
```sql
-- PostgreSQL Unique Index
CREATE UNIQUE INDEX idx_referral_codes_code ON referral_codes(code);

-- 生成時檢查重複
SELECT EXISTS (
  SELECT 1 FROM referral_codes WHERE code = 'abc123456'
);
```

**驗證規則：**
```typescript
function validateReferralCode(code: string): boolean {
  // 正則表達式：3個小寫英文字 + 6個數字
  const regex = /^[a-z]{3}\d{6}$/;
  return regex.test(code);
}
```

---

## 🔍 Part 1: 現有系統架構分析

### 1.1 後端架構（Supabase Edge Functions + PostgreSQL）

```
/supabase/functions/server/
├── index.tsx              # 主路由
├── db.ts                  # Prisma Client（PostgreSQL ORM）
├── auth.ts               # 認證系統
├── listings.ts           # 刊登管理
├── subscriptions.ts      # 訂閱系統（現有，但邏輯不同）
├── referrals.ts          # 推薦系統
├── rewards.ts            # 獎勵系統
├── tasks.ts              # 任務系統
├── admin.ts              # 管理功能
└── cron.ts               # 排程任務
```

**技術棧：**
- Runtime: Deno
- Framework: Hono (輕量級 Web 框架)
- Database: **Supabase PostgreSQL**（關聯式資料庫）
- ORM: **Prisma** (型別安全的 ORM)
- Auth: Supabase Auth

**資料儲存方式：**
```sql
-- PostgreSQL Schema（關聯式資料表）
users                    -- 用戶主表
subscriptions            -- 訂閱表
referral_codes           -- 推薦碼表
referral_relationships   -- 推薦關係表
reward_schedules         -- 獎勵排程表
reward_history           -- 獎勵歷史表
withdrawals              -- 提領表
task_progress            -- 任務進度表
listings                 -- 刊登表
```

**ORM 使用範例：**
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: Deno.env.get('DATABASE_URL'),
});

// 查詢用戶（自動型別檢查）
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    subscription: true,
    referralCodes: true
  }
});
```

---

### 1.2 前端架構（React + TypeScript）

```
/components/
├── AuthPage.tsx                # 登入頁面
├── RegisterPage.tsx            # 註冊頁面
├── CompleteProfile.tsx         # 完善資料頁面
├── MemberDashboard.tsx         # 會員儀表板
├── ServiceProviderManagement   # 刊登管理
├── SubscriptionManagement      # 訂閱管理
├── ReferralManagement          # 推薦管理
├── RewardDashboard            # 獎勵中心
├── TaskDashboard              # 任務中心
└── ... 等等
```

**技術棧：**
- Framework: React 18
- Language: TypeScript
- Routing: React Router v6
- State: Context API
- UI: shadcn/ui (Radix UI + Tailwind CSS)
- Notification: 自訂 Toast + Notification Card

---

### 1.3 現有註冊流程

```
Step 1: Email/Password 註冊
   ↓
Step 2: Email 驗證（驗證信機制）
   → 系統發送驗證信
   → 用戶點擊郵件中的驗證連結
   → 驗證完成，導向完善資料頁面
   ↓
Step 3: 完善資料 (name, phone, birthDate, 選填推薦碼)
   ↓
註冊完成 → 可直接使用（無須付費）
```

**Email 驗證機制：** 使用 Supabase Auth 的驗證信功能，用戶點擊郵件連結完成驗證。

**問題：**
- ❌ 沒有年費支付步驟
- ❌ 推薦碼只是選填，沒有即時驗證
- ❌ 註冊完成即可使用，沒有訂閱機制

---

### 1.4 現有帳號狀態

**現有狀態：**
- `Active`：正常使用
- `Inactive`：停用（管理員操作）

**問題：**
- ❌ 沒有 Grace Period（寬限期）
- ❌ 沒有 Canceled（已取消續訂）
- ❌ 沒有 Fail（永久失效）
- ❌ 狀態與訂閱到期日沒有連動

---

### 1.5 現有訂閱系統

**現有邏輯：**
- 一個帳號可以有多個刊登
- 每個刊登獨立訂閱（年費 $1,200）
- 訂閱到期後刊登隱藏

**問題：**
- ❌ 一個帳號可以有多個刊登（新規格要求一對一）
- ❌ 訂閱綁定刊登，不綁定會員
- ❌ 沒有補繳機制
- ❌ 沒有 Grace Period 和 Fail 狀態

---

### 1.6 現有推薦系統

**現有邏輯：**
- 推薦碼綁定「刊登」
- 創建刊登時輸入推薦碼
- 推薦碼格式：3碼英文 + 6碼數字
- 三代推薦樹（預計算快取）

**問題：**
- ❌ 推薦碼綁定刊登，不綁定會員（新規格要求綁定會員）
- ❌ 推薦關係在創建刊登時建立（新規格要求註冊時建立）
- ❌ 推薦碼驗證沒有即時顯示推薦人姓名

---

### 1.7 現有獎勵系統

**現有邏輯：**
- 下線付款後，立即發放全部獎勵
- 三代制：直推、代推、深推
- 金額：各代 120P（一次性）

**問題：**
- ❌ 一次性發放全部獎勵（新規格要求年費月領）
- ❌ 沒有 Reward Schedule 機制
- ❌ 沒有每日掃描發放邏輯
- ❌ 沒有檢查上線狀態（Fail 則作廢）

---

### 1.8 現有任務系統

**現有邏輯：**
- 連續推薦達人：連續 12 個月，每月至少推薦 1 人
- 推薦王：單月推薦 10 人

**問題：**
- ⚠️ 推薦王沒有溢出處理機制（新規格要求扣除制）
- ⚠️ 任務進度沒有與帳號狀態連動（Fail 時應歸零）

---

### 1.9 現有提領系統

**現有邏輯：**
- 有基本的提領申請和審核流程
- 手續費機制存在

**問題：**
- ⚠️ 最低提領金額可能不同（新規格：1,000P 且必須是 1,000 的倍數）
- ⚠️ 手續費計算方式可能不同（新規格：外加制 15P）
- ⚠️ 提領檢核公式需確認

---

## 🎯 Part 2: 新規格 vs 現有系統差異分析

### 2.1 註冊流程變更

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|---------|--------|---------|
| **步驟數** | 3 步驟 | **4 步驟** | 🔴 重大 |
| **Email 檢核** | 無獨立步驟 | **Step 0: 獨立檢核** | 🟡 中等 |
| **推薦碼驗證** | 選���，無即時驗證 | **即時驗證+顯示推薦人姓名** | 🟡 中等 |
| **支付年費** | 無 | **Step 3: 必須支付 $1,200** | 🔴 重大 |
| **訂閱創建** | 刊登創建時 | **支付成功後立即創建** | 🔴 重大 |

**技術實作差異：**

```typescript
// 現有流程
POST /auth/register
  → 創建 Supabase Auth User
  → 發送驗證信（用戶點擊郵件連結驗證）
  → Email 驗證後完善資料
  → 註冊完成

// 新規格流程
POST /auth/v2/check-email       // Step 0: Email 檢核
POST /auth/v2/signup/step1      // Step 1: 帳號建立
  → 創建 Supabase Auth User
  → 發送驗證信（用戶點擊郵件連結驗證）
  → 創建初始 Profile (registrationStep: 1)
GET  /auth/callback             // Email 驗證回調（Supabase Auth）
  → 驗證 Email
  → 導向 /signup?step=2
POST /auth/v2/signup/step2      // Step 2: 資料完善+推薦碼
  → 更新 Profile
  → 儲存 Pending Referral
POST /auth/v2/signup/step3      // Step 3: 支付年費
  → 創建訂閱
  → 生成推薦碼
  → 建立推薦關係（如果有推薦碼）
  → 寫入獎勵排程（12筆）
```

**📧 Email 驗證流程：**
1. 後端調用 Supabase Auth API 發送驗證信
2. 用戶收到郵件，點擊驗證連結
3. 驗證連結導向 `/auth/callback?token=xxx`
4. 前端 AuthCallback 組件驗證 token
5. 驗證成功後導向下一步（/signup?step=2）

---

### 2.2 帳號狀態機變更

| 狀態 | 現有系統 | 新規格 | 影響範圍 |
|------|---------|--------|---------|
| **Active** | 存在 | **訂閱中，完整權限** | 🟢 小 |
| **Canceled** | 不存在 | **已取消續訂，保留權限** | 🔴 新增 |
| **Grace** | 不存在 | **即將失效（0-60天）** | 🔴 新增 |
| **Fail** | 不存在 | **永久失效（>60天）** | 🔴 新增 |

**狀態轉換邏輯：**

```
Active (訂閱中)
  ├─ 手動取消續訂 → Canceled
  ├─ 週期到期 → Grace (Day 0)
  └─ 正常續費 → Active (新週期)

Canceled (已取消)
  └─ 週期到期 → Fail (永久失效)

Grace (即將失效)
  ├─ 補繳成功 → Active (接續原週期)
  └─ 逾期 60 天 → Fail (永久失效)

Fail (永久失效)
  └─ 重新訂閱 → Active (新週期，新推薦碼)
```

**權限矩陣：**

| 功能 | Active | Canceled | Grace | Fail |
|------|--------|----------|-------|------|
| **刊登顯示** | ✅ | ✅ | ❌ | ❌ |
| **推薦功能** | ✅ | ✅ | ✅ | ❌ |
| **獎勵收益** | ✅ | ✅ | ✅ | ❌ |
| **提領** | ✅ | ✅ | ❌ | ❌ |
| **任務進度** | ✅ | ✅ | ✅ | 歸零 |

---

### 2.3 推薦系統變更

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|---------|--------|---------|
| **綁定對象** | 刊登 | **會員** | 🔴 重大 |
| **生成時機** | 創建刊登時 | **支付年費後** | 🔴 重大 |
| **推薦關係** | 刊登間 | **會員間** | 🔴 重大 |
| **失效處理** | 刪除節點 | **保留節點，標記 Inactive** | 🟡 中等 |

**資料結構變更：**

```typescript
// 現有結構
listing:{listingId} = {
  referralCode: "abc123456",  // 推薦碼屬於刊登
  referrer: "another_listing_id"
}

// 新規格結構
user:{userId}:referral_code = {
  id: "rc_xxx",
  code: "abc123456",           // 推薦碼屬於會員
  userId: "user_xxx",
  status: "Active/Inactive",
  createdAt: "2024-12-21T00:00:00Z"
}

referral_relationship:{id} = {
  referrerId: "user_xxx",      // 推薦人（會員）
  refereeId: "user_yyy",       // 被推薦人（會員）
  generation: 1,               // 層級
  status: "Active/Inactive",
  createdAt: "2024-12-21T00:00:00Z"
}
```

---

### 2.4 獎勵系統變更

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|---------|--------|---------|
| **發放方式** | 一次性全額 | **年費月領（12次）** | 🔴 重大 |
| **金額** | 120P（一次） | **10P/月 × 12** | 🟢 小 |
| **排程機制** | 無 | **Reward Schedule 表** | 🔴 新增 |
| **狀態檢查** | 無 | **發放前檢查上線狀態** | 🔴 新增 |
| **作廢機制** | 無 | **上線 Fail → 該筆作廢** | 🔴 新增 |

**技術實作差異：**

```typescript
// 現有邏輯
下線付款 → 立即發放全部獎勵給上線（120P）

// 新規格邏輯
下線付款 → {
  1. 立即發放第1個月（10P）
  2. 寫入11筆 Reward Schedule (Status=Pending)
     - 月份：2-12
     - 預定日期：每月對應日期
     - 狀態：Pending
}

每日排程 → {
  1. 掃描當天需發放的 Reward Schedule
  2. 檢查上線狀態：
     - 若非 Fail → 發放 10P，標記 Completed
     - 若為 Fail → 標記 Void，不發放
  3. 寫入 Reward History
}
```

**新增資料表：**

```typescript
reward_schedule:{scheduleId} = {
  id: "rs_xxx",
  recipientUserId: "user_xxx",  // 接收者（上線）
  sourceUserId: "user_yyy",     // 來源（下線）
  generation: 1,                // 層級（1/2/3）
  monthNumber: 2,               // 第幾個月（1-12）
  amount: 10,                   // 金額
  status: "Pending/Completed/Void",
  scheduledDate: "2025-01-21",  // 預定發放日期
  issuedDate: null,             // 實際發放日期
  createdAt: "2024-12-21T00:00:00Z"
}
```

---

### 2.5 訂閱系統變更

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|---------|--------|---------|
| **綁定對象** | 刊登 | **會員** | 🔴 重大 |
| **數量** | 多個（一個帳號多個刊登） | **一個（一對一）** | 🔴 重大 |
| **補繳機制** | 無 | **60天內補繳，接續原週期** | 🔴 新增 |
| **狀態連動** | 無 | **訂閱狀態 → 帳號狀態** | 🔴 新增 |

**資料結構變更：**

```typescript
// 現有結構
listing:{listingId} = {
  activeUntil: "2025-12-21",
  // 訂閱資訊混在刊登中
}

// 新規格結構
user:{userId}:subscription = {
  id: "sub_xxx",
  userId: "user_xxx",
  status: "Active/Canceled/Grace/Fail",
  startDate: "2024-12-21",
  endDate: "2025-12-21",
  gracePeriodEnd: "2026-02-19",  // endDate + 60天
  paymentDate: "2024-12-21",
  amount: 1200,
  isCanceled: false,
  canceledAt: null,
  createdAt: "2024-12-21T00:00:00Z",
  updatedAt: "2024-12-21T00:00:00Z"
}
```

---

### 2.6 任務系統變更

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|---------|--------|---------|
| **連續推薦達人** | 基本實作 | 同現有 | 🟢 小 |
| **推薦王溢出** | 無 | **扣除制（滿10扣10）** | 🟡 中等 |
| **狀態連動** | 無 | **Fail 時進度歸零** | 🟡 中等 |

**推薦王溢出邏輯：**

```typescript
// 現有邏輯
當月推薦 10 人 → 發放 1,000P → 計數器歸零

// 新規格邏輯
當月推薦數 = 25 人 → {
  1. 檢查：25 >= 10 → 發放 1,000P
  2. 扣除：Count = 25 - 10 = 15
  3. 再次檢查：15 >= 10 → 發放 1,000P
  4. 扣除：Count = 15 - 10 = 5
  5. 檢查：5 < 10 → 結束
  6. 當月結算：發放 2,000P，剩餘進度 5
}
```

---

### 2.7 提領系統變更

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|---------|--------|---------|
| **最低金額** | 可能不同 | **1,000P（必須是倍數）** | 🟡 中等 |
| **手續費** | 可能不同 | **15P（外加制）** | 🟡 中等 |
| **檢核公式** | 可能不同 | **餘額 >= (提領金額+15)** | 🟡 中等 |
| **狀態限制** | 無 | **Grace/Fail 不可提領** | 🟡 中等 |

---

## 🗂️ Part 3: 資料模型設計（Database Schema）

基於新規格的技術要求，設計以下9張資料表：

---

### 3.1 User Profile (用戶主表)

**目的：** 單一事實來源（SSOT），所有用戶資料的唯一真實來源

**Key:** `user:{userId}:profile`

**Schema:**

```typescript
interface UserProfile {
  // 基本資訊
  id: string;                    // Supabase Auth User ID
  email: string;                 // Email
  realName: string;              // 真實姓名（唯一真實來源）
  idNumber: string;              // 身分證字號（唯一）
  birthDate: string;             // 生日（YYYY-MM-DD）
  phone: string;                 // 手機號碼
  
  // 帳號狀態
  accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  
  // 財務資訊
  pointBalance: number;          // 點數餘額
  
  // 推薦碼（會��唯一）
  activeReferralCodeId: string | null;  // 當前有效的推薦碼ID
  
  // 時間戳
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  
  // 註冊流程
  registrationStep: number;      // 0-3（新增，用於註冊流程控制）
  emailVerified: boolean;        // Email 驗證狀態
}
```

**Index 需求：**
- Primary Key: `user:{userId}:profile`
- Unique Index: `idNumber`（身分證唯一性）
- Index: `accountStatus`（狀態查詢）

**SSOT 原則：**
- ✅ `realName` 是唯一真實來源，所有顯示姓名的地方都必須查詢此欄位
- ✅ `accountStatus` 由訂閱到期日動態計算或嚴格維護
- ❌ 嚴禁在其他表中複製姓名

---

### 3.2 Subscription (訂閱表)

**目的：** 管理會員訂閱週期，與帳號狀態連動

**Key:** `user:{userId}:subscription`

**Schema:**

```typescript
interface Subscription {
  id: string;                    // 訂閱ID
  userId: string;                // 用戶ID（一對一關係）
  
  // 狀態
  status: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  
  // 週期資訊
  startDate: string;             // 開始日期（YYYY-MM-DD）
  endDate: string;               // 到期日期（YYYY-MM-DD）
  gracePeriodEnd: string;        // 寬限期結束日期（endDate + 60天）
  
  // 支付資訊
  paymentDate: string;           // 支付日期
  amount: number;                // 金額（1200）
  paymentTransactionId: string;  // 支付交易ID（藍新金流）
  
  // 取消資訊
  isCanceled: boolean;           // 是否已取消續訂
  canceledAt: string | null;     // 取消時間
  
  // 時間戳
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

**狀態計算邏輯：**

```typescript
function calculateSubscriptionStatus(subscription: Subscription): Status {
  const now = new Date();
  const endDate = new Date(subscription.endDate);
  const gracePeriodEnd = new Date(subscription.gracePeriodEnd);
  
  if (subscription.isCanceled) {
    // 已取消續訂
    if (now <= endDate) {
      return 'Canceled';  // 仍在週期內
    } else {
      return 'Fail';      // 週期已結束，永久失效
    }
  } else {
    // 未取消續訂
    if (now <= endDate) {
      return 'Active';    // 正常訂閱中
    } else if (now <= gracePeriodEnd) {
      return 'Grace';     // 寬限期（0-60天）
    } else {
      return 'Fail';      // 永久失效
    }
  }
}
```

**補繳邏輯：**

```typescript
// 補繳時，週期接續原到期日
if (status === 'Grace') {
  // 補繳成功
  newEndDate = new Date(oldEndDate);
  newEndDate.setFullYear(newEndDate.getFullYear() + 1);
  // 不是從支付日開始，而是從原到���日開始
}
```

---

### 3.3 Referral Code (推薦碼表)

**目的：** 管理會員的推薦碼（一對一關係）

**Key:** `user:{userId}:referral_codes` (陣列，支援多個推薦碼歷史)  
**Key:** `referral_code:{code}` (反向索引，用於 O(1) 查詢)

**Schema:**

```typescript
interface ReferralCode {
  id: string;                    // 推薦碼ID
  code: string;                  // 推薦碼（3碼英文+6碼數字，例：abc123456）
  userId: string;                // 擁有者ID
  
  // 狀態
  status: 'Active' | 'Inactive'; // Active=有效，Inactive=失效
  
  // 時間戳
  createdAt: string;             // ISO 8601
  inactivatedAt: string | null;  // 失效時間
}
```

**反向索引：**

```typescript
// 用於 O(1) 查詢推薦碼
referral_code:{code} = {
  userId: "user_xxx",
  referralCodeId: "rc_xxx"
}
```

**Index 需求：**
- Unique Index: `code`（推薦碼唯一性）
- Index: `userId, status`（查詢用戶的有效推薦碼）

**業務規則：**
- 支付年費後生成推薦碼，狀態為 `Active`
- 進入 `Fail` 狀態時，推薦碼狀態變為 `Inactive`
- 重新訂閱時，生成新的推薦碼（舊碼保留但 Inactive）

---

### 3.4 Referral Relationship (推薦關係表)

**目的：** 管理會員間的推薦關係（三代制）

**Key:** `user:{userId}:referral_relationships` (陣列，用戶的所有推薦關係)  
**Key:** `referral_relationship:{id}` (單筆關係詳情)

**Schema:**

```typescript
interface ReferralRelationship {
  id: string;                    // 關係ID
  
  // 推薦人與被推薦人
  referrerId: string;            // 推薦人ID（會員）
  refereeId: string;             // 被推薦人ID（會員）
  
  // 層級資訊
  generation: 1 | 2 | 3;         // 層級（1=直推，2=代推，3=深推）
  
  // 推薦鏈（用於快速查詢組織樹）
  gen1ReferrerId: string | null; // 第1代推薦人ID
  gen2ReferrerId: string | null; // 第2代推薦人ID
  gen3ReferrerId: string | null; // 第3代推薦人ID
  
  // 狀態
  status: 'Active' | 'Inactive'; // Active=有效，Inactive=失效
  
  // 推薦碼資訊（冗餘，用於追溯）
  referralCodeId: string;        // 使用的推薦碼ID
  referralCode: string;          // 使用的推薦碼（冗餘）
  
  // 時間戳
  createdAt: string;             // ISO 8601
  inactivatedAt: string | null;  // 失效時間
}
```

**建立時機：**
- 註冊時輸入推薦碼 → 創建 `Pending` 關係
- 支付年費後 → 啟動關係（`Active`）

**層級計算範例：**

```typescript
// 用戶 A 推薦 B，B 推薦 C，C 推薦 D
A (gen1) → B (gen2) → C (gen3) → D

// D 的推薦關係
{
  referrerId: "C",        // 直接推薦人
  refereeId: "D",
  generation: 1,
  gen1ReferrerId: "C",    // 1代推薦人
  gen2ReferrerId: "B",    // 2代推薦人
  gen3ReferrerId: "A",    // 3代推薦人
}
```

**組織樹查詢：**

```typescript
// 查詢 A 的組織樹
GET user:A:referral_tree  // 預計算快取

// 或即時查詢
filter referral_relationship where gen1ReferrerId = "A"  // 直推
filter referral_relationship where gen2ReferrerId = "A"  // 代推
filter referral_relationship where gen3ReferrerId = "A"  // 深推
```

---

### 3.5 Reward Schedule (獎勵排程表)

**目的：** 管理年費月領的12筆排程

**Key:** `reward_schedule:{scheduleId}`  
**Key:** `reward_schedules:pending:{YYYY-MM-DD}` (日期索引，用於每日掃描)

**Schema:**

```typescript
interface RewardSchedule {
  id: string;                    // 排程ID
  
  // 接收者與來源
  recipientUserId: string;       // 接收者ID（上線）
  sourceUserId: string;          // 來源ID（下線）
  
  // 層級資訊
  generation: 1 | 2 | 3;         // 層級
  monthNumber: number;           // 第幾個月（1-12）
  
  // 金額
  amount: number;                // 金額（10P）
  
  // 狀態
  status: 'Pending' | 'Completed' | 'Void';
  
  // 日期
  scheduledDate: string;         // 預定發放日期（YYYY-MM-DD）
  issuedDate: string | null;     // 實際發��日期
  
  // 完整資訊（用於追溯，符合 SSOT 原則，不複製姓名）
  referee: {
    userId: string;
    // ❌ 不複製 userName（違反 SSOT）
  };
  referrer: {
    userId: string;
    // ❌ 不複製 userName（違反 SSOT）
  } | null;
  
  // 時間戳
  createdAt: string;             // ISO 8601
  completedAt: string | null;    // 完成時間
  voidedAt: string | null;       // 作廢時間
  voidReason: string | null;     // 作廢原因
}
```

**每日掃描邏輯：**

```typescript
async function dailyRewardIssuance() {
  const today = formatDate(new Date());
  
  // 1. 掃描當天需發放的排程
  const schedules = await kv.get(`reward_schedules:pending:${today}`) || [];
  
  for (const scheduleId of schedules) {
    const schedule = await kv.get(`reward_schedule:${scheduleId}`);
    
    if (schedule.status !== 'Pending') continue;
    
    // 2. 檢查上線狀態
    const recipient = await kv.get(`user:${schedule.recipientUserId}:profile`);
    
    if (recipient.accountStatus === 'Fail') {
      // 3a. 上線永久失效 → 作廢
      schedule.status = 'Void';
      schedule.voidedAt = new Date().toISOString();
      schedule.voidReason = 'Recipient account is permanently failed';
      await kv.set(`reward_schedule:${scheduleId}`, schedule);
      console.log(`[Void] ${scheduleId} - Recipient is Fail`);
    } else {
      // 3b. 上線正常 → 發放
      await issueReward(schedule);
      schedule.status = 'Completed';
      schedule.issuedDate = today;
      schedule.completedAt = new Date().toISOString();
      await kv.set(`reward_schedule:${scheduleId}`, schedule);
      console.log(`[Issued] ${scheduleId} - 10P issued to ${schedule.recipientUserId}`);
    }
  }
}
```

**冪等性保證：**
- 使用 `status` 欄位防止重複發放
- Transaction 內完成：更新餘額 + 更新 status
- 重複執行也不會重複發錢

---

### 3.6 Reward History (獎勵歷史表)

**目的：** 記錄所有獎勵發放歷史（不可變記錄）

**Key:** `user:{userId}:reward_history` (陣列，按時間倒序)

**Schema:**

```typescript
interface RewardHistoryItem {
  id: string;                    // 獎勵ID
  type: string;                  // 類型（referral_gen1_month1, task_consecutive, etc）
  amount: number;                // 金額
  
  // 推薦獎勵的完整信息（符合 SSOT，不複製姓名）
  referee?: {
    userId: string;              // 被推薦人ID
    // ❌ 不複製 userName, listingName（違反 SSOT）
  };
  referrer?: {
    userId: string;              // 推薦人ID
    // ❌ 不複製 userName, listingName（違反 SSOT）
  };
  
  generation?: number;           // 層級（1/2/3）
  monthNumber?: number;          // 月份（1-12）
  
  // 時間戳
  issuedAt: string;              // ISO 8601
  
  // 描述（顯示用，需即時查詢姓名）
  description: string;           // 例：「推薦獎勵 - 第2代 - 第1個月」
}
```

**查詢時動態拼接姓名：**

```typescript
// ❌ 錯誤做法（違反 SSOT）
description: `推薦獎勵 - ${referee.userName}-${referee.listingName}`

// ✅ 正確做法（查詢時動態拼接）
async function formatRewardHistory(history: RewardHistoryItem[]) {
  return Promise.all(history.map(async (item) => {
    if (item.referee) {
      const user = await kv.get(`user:${item.referee.userId}:profile`);
      item.description = `推薦獎勵 - ${user.realName} - 第${item.generation}代 - 第${item.monthNumber}個月`;
    }
    return item;
  }));
}
```

---

### 3.7 Withdrawal (提領表)

**目的：** 管理點數提領申請

**Key:** `withdrawal:{withdrawalId}`  
**Key:** `user:{userId}:withdrawals` (陣列，用戶的提領記錄)

**Schema:**

```typescript
interface Withdrawal {
  id: string;                    // 提領ID
  userId: string;                // 用戶ID
  
  // 金額
  amount: number;                // 提領金額（必須是1000的倍數）
  fee: number;                   // 手續費（15P）
  totalDeducted: number;         // 總扣���（amount + fee）
  
  // 狀態
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
  
  // 銀行資訊
  bankAccount: {
    bankCode: string;            // 銀行代碼
    accountNumber: string;       // 帳號
    accountName: string;         // 戶名
  };
  
  // 審核資訊
  reviewedBy: string | null;     // 審核者ID
  reviewedAt: string | null;     // 審核時間
  rejectReason: string | null;   // 拒絕原因
  
  // 時間戳
  requestedAt: string;           // 申請時間（ISO 8601）
  processedAt: string | null;    // 處理時間
  completedAt: string | null;    // 完成時間
}
```

**提領檢核邏輯：**

```typescript
async function requestWithdrawal(userId: string, amount: number) {
  // 1. 檢查金額是否為1000的倍數
  if (amount < 1000 || amount % 1000 !== 0) {
    throw new Error('提領金額必須是1000的倍數，且最低1000');
  }
  
  // 2. 檢查帳號狀態
  const profile = await kv.get(`user:${userId}:profile`);
  if (profile.accountStatus === 'Grace' || profile.accountStatus === 'Fail') {
    throw new Error('帳號狀態不允許提領');
  }
  
  // 3. 檢查餘額（外加制）
  const totalRequired = amount + 15;  // 提領金額 + 手續費
  if (profile.pointBalance < totalRequired) {
    throw new Error(`餘額不足。需要 ${totalRequired} Points，目前餘額 ${profile.pointBalance} Points`);
  }
  
  // 4. 使用 Transaction 扣款
  await kv.transaction(async (tx) => {
    // 扣除點數
    profile.pointBalance -= totalRequired;
    await tx.set(`user:${userId}:profile`, profile);
    
    // 創建提領記錄
    const withdrawal = {
      id: generateId(),
      userId,
      amount,
      fee: 15,
      totalDeducted: totalRequired,
      status: 'Pending',
      requestedAt: new Date().toISOString()
    };
    await tx.set(`withdrawal:${withdrawal.id}`, withdrawal);
  });
}
```

---

### 3.8 Task Progress (任務進度表)

**目的：** 管理用戶的任務進度

**Key:** `user:{userId}:task_progress:{taskType}`

**Schema:**

```typescript
interface TaskProgress {
  userId: string;                // 用戶ID
  taskType: 'consecutive_referral' | 'monthly_king';
  
  // 進度
  currentCount: number;          // 當前計數
  targetCount: number;           // 目標計數
  
  // 狀態
  status: 'Active' | 'Completed' | 'Reset';
  
  // 連續推薦達人專用
  consecutiveMonths?: number;    // 連續月數（0-12）
  lastReferralMonth?: string;    // 上次推薦月份（YYYY-MM）
  
  // 推薦王專用
  currentMonth?: string;         // 當前月份（YYYY-MM）
  completedCount?: number;       // 已完成次數（當月）
  
  // 時間戳
  lastResetAt: string;           // 上次重置時間
  lastUpdatedAt: string;         // 上次更新時間
  createdAt: string;             // 創建時間
}
```

**推薦王溢出邏輯：**

```typescript
async function updateMonthlyKingProgress(userId: string, newReferralCount: number) {
  const progress = await kv.get(`user:${userId}:task_progress:monthly_king`) || {
    currentCount: 0,
    targetCount: 10,
    completedCount: 0
  };
  
  // 原子操作：增加計數
  progress.currentCount += newReferralCount;
  
  // 溢出處理（扣除制）
  while (progress.currentCount >= progress.targetCount) {
    // 發放獎勵
    await issueTaskReward(userId, 'monthly_king', 1000);
    
    // 扣除
    progress.currentCount -= progress.targetCount;
    progress.completedCount += 1;
  }
  
  await kv.set(`user:${userId}:task_progress:monthly_king`, progress);
}
```

---

### 3.9 Listing (刊登表)

**目的：** 管理服務刊登（一對一關係）

**Key:** `listing:{listingId}`  
**Key:** `user:{userId}:listing` (單一刊登，一對一關係)

**Schema:**

```typescript
interface Listing {
  id: string;                    // 刊登ID
  userId: string;                // 擁有者ID（一對一關係）
  
  // 基本資訊
  name: string;                  // 刊登名稱
  category: string;              // 服務類別
  city: string;                  // 城市
  gender: string;                // 性別
  // ... 其他刊登欄位
  
  // 推薦碼（reference，不是實際儲存）
  referralCodeId: string;        // 關聯的推薦碼ID
  
  // 狀態（由訂閱狀態決定）
  isActive: boolean;             // 是否顯示（Active/Canceled=true, Grace/Fail=false）
  
  // 時間戳
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

**一對一關係：**
- 一個用戶只能有一個刊登
- 刊登的顯示狀態由訂閱狀態決定

---

## 📐 Part 4: 技術架構設計

### 4.1 後端架構（Supabase Edge Functions）

**新增/修改的 API 端點：**

```
認證系統（auth_v2.ts）：
├── POST   /auth/v2/check-email          # Step 0: Email 檢核
├── POST   /auth/v2/signup/step1         # Step 1: 帳號建立
├── POST   /auth/v2/verify-email         # Email 驗證
├── POST   /auth/v2/verify-referral-code # 推薦碼驗證（即時）
├── POST   /auth/v2/signup/step2         # Step 2: 資料完善+推薦碼
├── POST   /auth/v2/signup/step3         # Step 3: 支付年費
└── GET    /auth/v2/profile              # 獲取用戶資料

訂閱系統（subscriptions_v2.ts）：
├── GET    /subscriptions/v2             # 獲取訂閱資訊
├── POST   /subscriptions/v2/cancel      # 取消續訂
├── POST   /subscriptions/v2/renew       # 補繳/續訂
└── GET    /subscriptions/v2/status      # 獲取狀態

獎勵系統（rewards_v2.ts）：
├── GET    /rewards/v2/history           # 獎勵歷史
├── GET    /rewards/v2/schedules         # 獎勵排程
└── GET    /rewards/v2/balance           # 點數餘額

提領系統（withdrawals.ts）：
├── POST   /withdrawals/request          # 申請提領
├── GET    /withdrawals/history          # 提領歷史
└── GET    /withdrawals/status/:id       # 提領狀態

排程系統（cron_v2.ts）：
├── POST   /cron/daily-reward-issuance   # 每日獎勵發放
├── POST   /cron/subscription-check      # 每日訂閱狀態檢查
└── POST   /cron/monthly-task-reset      # 每月任務重置
```

---

### 4.2 前端架構（React Components）

**新增/修改的組件：**

```
註冊流程（全新設計）：
/components/signup/
├── SignupFlow.tsx              # 主流程控制器
├── ProgressIndicator.tsx       # 進度指示器（0-3）
├── EmailCheckStep.tsx          # Step 0: Email 檢核
├── AccountCreationStep.tsx     # Step 1: 帳號建立
├── ProfileStep.tsx             # Step 2: 資料完善+推薦碼
└── PaymentStep.tsx             # Step 3: 支付年費

訂閱管理（重構）：
/components/subscription/
├── SubscriptionDashboard.tsx   # 訂閱儀表板
├── SubscriptionStatus.tsx      # 狀態顯示（四狀態）
├── RenewalForm.tsx             # 續訂/補繳表單
└── CancellationDialog.tsx      # 取消續訂對話框

獎勵中心（新增排程顯示）：
/components/reward/
├── RewardScheduleView.tsx      # 獎勵排程視圖
└── ScheduleTimeline.tsx        # 時間軸顯示

推薦管理（調整為會員制）：
/components/referral/
├── ReferralCodeDisplay.tsx     # 推薦碼顯示（會員級）
└── ReferralTreeView.tsx        # 組織樹（會員級）
```

---

### 4.3 資料流設計

**註冊流程資料流：**

```mermaid
用戶 → Frontend → Backend → Supabase Auth → KV Store

Step 0: Email 檢核
用戶輸入 Email
  → POST /auth/v2/check-email
    → 查詢 Supabase Auth
      → 存在：返回 { exists: true }
      → 不存在：返回 { exists: false }

Step 1: 帳號建立
用戶設定密碼
  → POST /auth/v2/signup/step1
    → 創建 Supabase Auth User
    → 發送驗證信
    → 創建初始 Profile (registrationStep: 1)

Email 驗證
用戶點擊驗證信連結
  → GET /auth/callback?token=xxx
    → 驗證 Email
    → 更新 Profile (emailVerified: true)
    → 導向 /signup?step=2

Step 2: 資料完善
用戶填寫資料 + 推薦碼
  → POST /auth/v2/verify-referral-code (即時驗證)
    → 查詢推薦碼
    → 返回推薦人姓名
  → POST /auth/v2/signup/step2
    → 更新 Profile (realName, idNumber, birthDate, phone)
    → 儲存 Pending Referral
    → 更新 registrationStep: 2

Step 3: 支付年費
用戶完成支付
  → POST /auth/v2/signup/step3
    → 創建 Subscription (Active)
    → 生成 Referral Code
    → 啟動 Referral Relationship
    → 創建 12 筆 Reward Schedule
    → 發放第 1 個月獎勵（10P × 3代）
    → 更新 Profile (accountStatus: Active, registrationStep: 3)
```

---

## 🚀 Part 5: Phase-by-Phase 實作方案

### 總覽

| Phase | 名稱 | 工時 | 優先級 | 依賴 |
|-------|------|------|--------|------|
| **Phase 1** | PostgreSQL + Prisma 架構建置 | **60h** | P0 | 無 |
| **Phase 2** | 新版註冊流程（4步驟 + 支付整合） | **90h** | P0 | Phase 1 |
| **Phase 3** | 帳號狀態機與訂閱系統 | **60h** | P0 | Phase 1 |
| **Phase 4** | 推薦系統（會員制 + 三代樹） | **50h** | P0 | Phase 1, 3 |
| **Phase 5** | 年費月領獎勵機制（排程系統） | **75h** | P0 | Phase 1, 3, 4 |
| **Phase 6** | 任務系統（連續推薦達人 + 推薦王） | **25h** | P1 | Phase 5 |
| **Phase 7** | 提領系統（狀態限制 + Transaction） | **20h** | P1 | Phase 5 |
| **Phase 8** | 整合測試與上線準備 | **40h** | P0 | All |

**總計工時：** **420 小時**

**工時分解：**
- 開發工時：280h (67%)
- 測試工時：100h (24%)
- 文件與部署：40h (9%)

**關鍵變更（v1.3）：**
- ✅ 無需資料遷移（系統尚未上線）
- ✅ Phase 2 增加支付整合（+15h）
- ✅ Phase 5 增加完整排程系統（+10h）
- ✅ 推薦碼格式確定（3個小寫英文字+6個數字）

---

### Phase 1: PostgreSQL + Prisma 架構建置 (60h)

**目標：** 從零建置 PostgreSQL 資料模型與 Prisma ORM 架構

**前提確認：** ✅ 系統尚未上線，無需考慮資料遷移

#### 1.1 PostgreSQL Schema 設計 (20h)

**任務：**
1. ✅ 定義 Prisma Schema（9 張資料表）
2. ✅ 設定外鍵關聯與約束
3. ✅ 設定索引優化策略
4. ✅ 創建 Migration 檔案
5. ✅ 實作推薦碼生成與驗證邏輯（3個小寫英文字+6個數字）
6. ✅ 實作帳號狀態計算 Function（PostgreSQL）

**檔案：**
- `/prisma/schema.prisma`（Prisma Schema 定義）
- `/prisma/migrations/`（Migration 檔案）
- `/supabase/functions/server/utils/referralCode.ts`（推薦碼工具）

**Prisma Schema 範例：**

```prisma
// /prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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

// ... 其他 8 張表定義（詳見 PART3_POSTGRESQL_SCHEMA.md）
```

#### 1.2 Prisma Client 整合 (10h)

**任務：**
1. ✅ 安裝 Prisma CLI 與 Client
2. ✅ 設定 Deno 環境的 Prisma 支援
3. ✅ 創建 Prisma Client 單例
4. ✅ 測試基本 CRUD 操作

**檔案：**
- `/supabase/functions/server/db.ts`（Prisma Client）

**Prisma Client 範例：**

```typescript
// /supabase/functions/server/db.ts

import * as kv from '../kv_store.tsx';

export interface UserProfile {
  id: string;
  email: string;
  realName: string;
  idNumber: string;
  birthDate: string;
  phone: string;
  accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  pointBalance: number;
  activeReferralCodeId: string | null;
  createdAt: string;
  updatedAt: string;
  registrationStep: number;
  emailVerified: boolean;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return await kv.get(`user:${userId}:profile`);
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
  const profile = await getUserProfile(userId);
  if (!profile) throw new Error('User not found');
  
  const updated = {
    ...profile,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  await kv.set(`user:${userId}:profile`, updated);
}

// SSOT: 查詢真實姓名（唯一真實來源）
export async function getUserRealName(userId: string): Promise<string> {
  const profile = await getUserProfile(userId);
  if (!profile) throw new Error('User not found');
  return profile.realName;
}
```

#### 1.2 帳號狀態計算邏輯 (15h)

**任務：**
1. ✅ 實作訂閱狀態動態計算函數
2. ✅ 實作帳號狀態同步機制
3. ✅ 實作每日狀態檢查排程

**檔案：**
- `/supabase/functions/server/utils/subscriptionStatus.ts`

**範例代碼：**

```typescript
// /supabase/functions/server/utils/subscriptionStatus.ts

import { Subscription } from '../models/subscription';

export type SubscriptionStatus = 'Active' | 'Canceled' | 'Grace' | 'Fail';

export function calculateSubscriptionStatus(subscription: Subscription): SubscriptionStatus {
  const now = new Date();
  const endDate = new Date(subscription.endDate);
  const gracePeriodEnd = new Date(subscription.gracePeriodEnd);
  
  if (subscription.isCanceled) {
    // 已取消續訂
    if (now <= endDate) {
      return 'Canceled';  // 仍在週期內
    } else {
      return 'Fail';      // 週期已結束，永久失效
    }
  } else {
    // 未取消續訂
    if (now <= endDate) {
      return 'Active';    // 正常訂閱中
    } else if (now <= gracePeriodEnd) {
      return 'Grace';     // 寬限期（0-60天）
    } else {
      return 'Fail';      // 永久失效
    }
  }
}

export async function syncAccountStatus(userId: string): Promise<void> {
  const subscription = await kv.get(`user:${userId}:subscription`);
  const profile = await kv.get(`user:${userId}:profile`);
  
  if (!subscription || !profile) return;
  
  const newStatus = calculateSubscriptionStatus(subscription);
  
  if (profile.accountStatus !== newStatus) {
    console.log(`[Status Sync] ${userId}: ${profile.accountStatus} → ${newStatus}`);
    await updateUserProfile(userId, { accountStatus: newStatus });
    
    // 如果進入 Fail 狀態，執行清理
    if (newStatus === 'Fail') {
      await handleAccountFail(userId);
    }
  }
}

async function handleAccountFail(userId: string): Promise<void> {
  // 1. 推薦碼失效
  const codes = await kv.get(`user:${userId}:referral_codes`) || [];
  for (const code of codes) {
    if (code.status === 'Active') {
      code.status = 'Inactive';
      code.inactivatedAt = new Date().toISOString();
    }
  }
  await kv.set(`user:${userId}:referral_codes`, codes);
  
  // 2. 點數歸零
  await updateUserProfile(userId, { pointBalance: 0 });
  
  // 3. 任務進度歸零
  await kv.del(`user:${userId}:task_progress:consecutive_referral`);
  await kv.del(`user:${userId}:task_progress:monthly_king`);
}
```

#### 1.3 工具函數與共用邏輯 (15h)

**任務：**
1. ✅ 實作推薦碼生成函數
2. ✅ 實作 ID 生成函數
3. ✅ 實作日期處理函數
4. ✅ 實作原子操作封裝

**檔案：**
- `/supabase/functions/server/utils/generators.ts`
- `/supabase/functions/server/utils/dateHelpers.ts`
- `/supabase/functions/server/utils/atomicOps.ts`

---

### Phase 2: 新版註冊流程（4步驟 + 支付整合） (90h)

**目標：** 實作全新的4步驟註冊流程，包含藍新金流支付整合

**關鍵變更（v1.3）：**
- ✅ 推薦碼格式確定：3個小寫英文字+6個數字
- ✅ 新增藍新金流支付整合（+15h）

#### 2.1 後端 API 實作 (50h)

**任務：**
1. ✅ 實作 Email 檢核 API
2. ✅ 實作帳號建立 API
3. ✅ 實作推薦碼驗證 API（即時顯示推薦人姓名）
4. ✅ 實作資料完善 API
5. ✅ 實作支付年費 API
6. ✅ 整合藍新金流支付（沙盒測試）
7. ✅ 實作支付回調處理
8. ✅ 實作支付失敗重試機制

**檔案：**
- `/supabase/functions/server/auth_v2.ts`（註冊流程）
- `/supabase/functions/server/payments.ts`（支付整合，新增）

**API 規格：**

```typescript
// POST /auth/v2/check-email
// Step 0: Email 檢核
interface CheckEmailRequest {
  email: string;
}

interface CheckEmailResponse {
  success: boolean;
  data: {
    exists: boolean;
    message: string;
  };
}

// POST /auth/v2/signup/step1
// Step 1: 帳號建立（發送驗證信）
interface SignupStep1Request {
  email: string;
  password: string;
}

interface SignupStep1Response {
  success: boolean;
  data: {
    message: string;  // 例：「驗證信已發送，請查收郵件並點擊驗證連結」
    registrationProgress: {
      currentStep: 1;
      totalSteps: 3;
      nextStep: 2;      // Email 驗證後進入 Step 2
      isComplete: false;
      progress: 33;
    };
  };
}

// 📧 Email 驗證流程說明：
// 1. Step 1 API 調用 Supabase Auth 創建用戶並自動發送驗證信
// 2. 用戶收到郵件，點擊驗證連結（格式：/auth/callback?token=xxx）
// 3. 前端 AuthCallback 組件處理驗證
// 4. 驗證成功後導向 /signup?step=2

// POST /auth/v2/verify-referral-code
// 推薦碼驗證（即時）
interface VerifyReferralCodeRequest {
  code: string;
}

interface VerifyReferralCodeResponse {
  success: boolean;
  data: {
    valid: boolean;
    referrerName: string;  // 推薦人真實姓名（SSOT）
    error?: string;
  };
}

// POST /auth/v2/signup/step2
// Step 2: 資料完善
interface SignupStep2Request {
  realName: string;
  idNumber: string;
  birthDate: string;
  phone: string;
  referralCode?: string;
}

interface SignupStep2Response {
  success: boolean;
  data: {
    profile: UserProfile;
    registrationProgress: {
      currentStep: 2;
      totalSteps: 3;
      nextStep: 3;
      isComplete: false;
      progress: 67;
    };
  };
}

// POST /auth/v2/signup/step3
// Step 3: 支付年費
interface SignupStep3Request {
  paymentTransactionId: string;  // 藍新金流交易ID
}

interface SignupStep3Response {
  success: boolean;
  data: {
    subscription: Subscription;
    referralCode: string;
    message: string;
    registrationProgress: {
      currentStep: 3;
      totalSteps: 3;
      nextStep: null;
      isComplete: true;
      progress: 100;
    };
  };
}
```

**實作重點：**

**Step 1 實作範例（發送驗證信）：**

```typescript
// POST /auth/v2/signup/step1
authV2.post('/signup/step1', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    // 1. 創建 Supabase Auth 用戶（自動發送驗證信）
    const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,  // ❌ 不自動確認，需要用戶點擊驗證信
    });
    
    if (error || !user) {
      console.error('[Step 1] 創建用戶失敗:', error);
      return c.json({ 
        success: false, 
        error: { message: '帳號建立失敗' } 
      }, 400);
    }
    
    // 2. 創建初始 Profile（標記為 Step 1 完成，但 Email 未驗證）
    const initialProfile = {
      id: user.id,
      email: user.email,
      registrationStep: 1,
      emailVerified: false,  // Email 尚未驗證
      accountStatus: 'Pending',  // 待完成註冊
      pointBalance: 0,
      activeReferralCodeId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await kv.set(`user:${user.id}:profile`, initialProfile);
    console.log('[Step 1] ✅ 初始 Profile 創建完成');
    
    // 3. 返回成功（Supabase Auth 已自動發送驗證信）
    return c.json({
      success: true,
      data: {
        message: '驗證信已發送，請查收郵件並點擊驗證連結',
        registrationProgress: {
          currentStep: 1,
          totalSteps: 3,
          nextStep: 2,
          isComplete: false,
          progress: 33
        }
      }
    });
  } catch (error) {
    console.error('[Step 1] Error:', error);
    return c.json({ 
      success: false, 
      error: { message: 'Internal server error' } 
    }, 500);
  }
});
```

**Email 驗證回調處理（現有 AuthCallback 組件���：**

```typescript
// /components/AuthCallback.tsx
// Supabase Auth 驗證連結格式：/auth/callback?token=xxx

useEffect(() => {
  const handleCallback = async () => {
    // 1. 從 URL 獲取 token
    const token = new URLSearchParams(window.location.search).get('token');
    
    // 2. 驗證 token（Supabase Auth 自動處理）
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      setStatus('error');
      setMessage('Email 驗證失敗');
      return;
    }
    
    // 3. 獲取用戶 Profile
    const profile = await fetchProfile(session.user.id);
    
    // 4. 更新 Profile（標記 Email 已驗證）
    await updateProfile(session.user.id, { emailVerified: true });
    
    // 5. 根據 registrationStep 導向下一步
    if (profile.registrationStep === 1) {
      // Step 1 完成，進入 Step 2（資料完善）
      navigate('/signup?step=2', { replace: true });
    } else if (profile.registrationStep === 2) {
      // Step 2 完成，進入 Step 3（支付）
      navigate('/signup?step=3', { replace: true });
    } else if (profile.registrationStep === 3) {
      // 註冊完成，導向儀表板
      navigate('/dashboard', { replace: true });
    }
  };
  
  handleCallback();
}, []);
```

**Step 3 實作範例（支付年費）：**

```typescript
// Step 3: 支付年費（關鍵邏輯）
authV2.post('/signup/step3', async (c) => {
  try {
    // 1. 驗證 access token
    const user = await verifyToken(token);
    
    // 2. 驗證支付（調用藍新金流 API）
    const paymentValid = await verifyNewebPayTransaction(paymentTransactionId);
    if (!paymentValid) {
      return c.json({ success: false, error: { message: '支付驗證失敗' } }, 400);
    }
    
    // 3. 創建訂閱
    const subscription = {
      id: generateId(),
      userId: user.id,
      status: 'Active',
      startDate: formatDate(new Date()),
      endDate: formatDate(addYears(new Date(), 1)),
      gracePeriodEnd: formatDate(addDays(addYears(new Date(), 1), 60)),
      paymentDate: formatDate(new Date()),
      amount: 1200,
      paymentTransactionId,
      isCanceled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await kv.set(`user:${user.id}:subscription`, subscription);
    
    // 4. 生成推薦碼
    const referralCode = generateReferralCode();
    const codeData = {
      id: generateId(),
      code: referralCode,
      userId: user.id,
      status: 'Active',
      createdAt: new Date().toISOString()
    };
    await kv.set(`referral_code:${referralCode}`, codeData);
    await kv.set(`user:${user.id}:referral_codes`, [codeData]);
    
    // 5. 啟動推薦關係（如果有推薦碼）
    const pendingReferral = await kv.get(`user:${user.id}:pending_referral`);
    if (pendingReferral) {
      await activateReferralRelationship(user.id, pendingReferral);
      
      // 6. 創建獎勵排程（12筆）
      await createRewardSchedules(user.id, pendingReferral);
      
      // 7. 發放第1個月獎勵
      await issueFirstMonthReward(user.id, pendingReferral);
    }
    
    // 8. 更新 Profile
    await updateUserProfile(user.id, {
      accountStatus: 'Active',
      registrationStep: 3,
      activeReferralCodeId: codeData.id
    });
    
    return c.json({ success: true, data: { subscription, referralCode, ... } });
  } catch (error) {
    console.error('[Step 3] Error:', error);
    return c.json({ success: false, error: { message: 'Internal server error' } }, 500);
  }
});
```

#### 2.2 前端組件實作 (30h)

**任務：**
1. ✅ 實作 SignupFlow 主控制器
2. ✅ 實作 ProgressIndicator
3. ✅ 實作 EmailCheckStep
4. ✅ 實作 AccountCreationStep
5. ✅ 實作 ProfileStep（含推薦碼即時驗證）
6. ✅ 實作 PaymentStep（藍新金流整合）

**檔案：**
- `/components/signup/SignupFlow.tsx` - 主流程控制器
- `/components/signup/ProgressIndicator.tsx` - 進度指示器（0-3）
- `/components/signup/EmailCheckStep.tsx` - Step 0: Email 檢核
- `/components/signup/AccountCreationStep.tsx` - Step 1: 帳號建立（發送驗證信）
- `/components/signup/EmailVerificationPending.tsx` - 等待驗證信頁面（重用現有組件）
- `/components/AuthCallback.tsx` - Email 驗證回調處理（重用現有組件）
- `/components/signup/ProfileStep.tsx` - Step 2: 資料完善+推薦碼
- `/components/signup/PaymentStep.tsx` - Step 3: 支付年費

**📧 Email 驗證流程（前端）：**

```typescript
// AccountCreationStep.tsx
// Step 1: 用戶設定密碼後
const handleSubmit = async () => {
  try {
    const result = await apiRequestJson(
      buildApiUrl('/auth/v2/signup/step1'),
      {
        method: 'POST',
        body: JSON.stringify({ email, password })
      }
    );
    
    if (result.success) {
      // 顯示成功訊息
      showToast('驗證信已發送，請查收郵件', 'success');
      
      // 導向等待驗證頁面
      navigate('/auth/verify-email', { 
        state: { email } 
      });
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
};

// EmailVerificationPending.tsx（重用現有組件）
// 等待驗證信頁面
<Card>
  <CardHeader>
    <Mail className="h-12 w-12 text-blue-600 mb-4" />
    <CardTitle>請驗證您的電子郵件</CardTitle>
    <CardDescription>
      我們已發送驗證信到 {email}
      <br />
      請查收郵件並點擊驗證連結以繼續註冊
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button onClick={resendVerificationEmail}>
      重新發送驗證信
    </Button>
  </CardContent>
</Card>

// AuthCallback.tsx（重用現有組件）
// Email 驗證成功後
if (profile.registrationStep === 1) {
  navigate('/signup?step=2', { replace: true });
}
```

**UI/UX 設計重點：**

```typescript
// ProgressIndicator: 視覺化進度
<div className="flex items-center justify-between mb-8">
  {steps.map((step, index) => (
    <div key={index} className="flex items-center">
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center
        ${index <= currentStep ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}
        ${index === currentStep ? 'ring-4 ring-blue-200' : ''}
      `}>
        {index < currentStep ? <Check /> : index + 1}
      </div>
      {index < steps.length - 1 && (
        <div className={`h-1 w-20 ${index < currentStep ? 'bg-blue-600' : 'bg-gray-300'}`} />
      )}
    </div>
  ))}
</div>

// ProfileStep: 推薦碼即時驗證
<div className="flex gap-2">
  <Input
    value={referralCode}
    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
    maxLength={9}
  />
  <Button
    onClick={verifyReferralCode}
    disabled={!referralCode || isVerifying || codeVerified}
  >
    {isVerifying ? '驗證中...' : codeVerified ? '✓ 已驗證' : '驗證'}
  </Button>
</div>
{referrerName && (
  <p className="text-sm text-green-600 mt-1">
    ✅ 推薦人：{referrerName}
  </p>
)}
```

#### 2.3 整合測試 (10h)

**測試案例：**
1. ✅ Email 已存在 → 導向登入
2. ✅ Email 不存在 → 進入註冊流程
3. ✅ **Email 驗證信發送 → 用戶收到郵件**
4. ✅ **點擊驗證連結 → 導向 Step 2**
5. ✅ 推薦碼驗證 → 即時顯示推薦人姓名
6. ✅ 支付成功 → 創建訂閱、生成推薦碼、發放獎勵
7. ✅ 中斷與恢復 → 從任一步驟恢復（包括 Email 未驗證狀態）
8. ✅ 重新發送驗證信 → 功能正常

**Email 驗證測試重點：**
- ✅ Supabase Auth 正確發送驗證信
- ✅ 驗證連結格式正確（/auth/callback?token=xxx）
- ✅ AuthCallback 組件正確處理驗證
- ✅ 驗證後正確導向下一步（/signup?step=2）
- ✅ 重新發送驗證信功能正常

---

### Phase 3: 帳號狀態機與訂閱系統 (70h)

**目標：** 實作四狀態帳號管理與訂閱系統

#### 3.1 後端訂閱 API 實作 (30h)

**任務：**
1. ✅ 實作訂閱查詢 API
2. ✅ 實作取消續訂 API
3. ✅ 實作補繳/續訂 API
4. ✅ 實作狀態同步邏輯

**檔案：**
- `/supabase/functions/server/subscriptions_v2.ts`

**API 規格：**

```typescript
// GET /subscriptions/v2
// 獲取訂閱資訊
interface GetSubscriptionResponse {
  success: boolean;
  data: {
    subscription: Subscription;
    status: SubscriptionStatus;
    daysRemaining: number;
    gracePeriodDays: number;
  };
}

// POST /subscriptions/v2/cancel
// 取消續訂
interface CancelSubscriptionResponse {
  success: boolean;
  data: {
    subscription: Subscription;
    message: string;
  };
}

// POST /subscriptions/v2/renew
// 補繳/續訂
interface RenewSubscriptionRequest {
  paymentTransactionId: string;
}

interface RenewSubscriptionResponse {
  success: boolean;
  data: {
    subscription: Subscription;
    message: string;
    isRenewal: boolean;  // true=補繳（接續原週期），false=新訂閱
  };
}
```

**補繳邏輯實作：**

```typescript
// POST /subscriptions/v2/renew
app.post('/renew', async (c) => {
  const user = await verifyToken(token);
  const subscription = await kv.get(`user:${user.id}:subscription`);
  const profile = await kv.get(`user:${user.id}:profile`);
  
  // 驗證支付
  const paymentValid = await verifyNewebPayTransaction(paymentTransactionId);
  if (!paymentValid) {
    return c.json({ success: false, error: { message: '支付驗證失敗' } }, 400);
  }
  
  let isRenewal = false;
  let newEndDate: Date;
  
  if (profile.accountStatus === 'Grace') {
    // 補繳：接續原到期日
    isRenewal = true;
    const oldEndDate = new Date(subscription.endDate);
    newEndDate = addYears(oldEndDate, 1);
    console.log('[Renew] 補繳模式：接續原週期');
  } else if (profile.accountStatus === 'Fail') {
    // 新訂閱：從今天開始
    isRenewal = false;
    newEndDate = addYears(new Date(), 1);
    console.log('[Renew] 新訂閱模式：從今天開始');
    
    // Fail 狀態恢復需要處理：
    // 1. 生成新推薦碼
    // 2. 清空舊推薦關係（保留但標記 Inactive）
  } else {
    // 正常續訂
    isRenewal = true;
    const oldEndDate = new Date(subscription.endDate);
    newEndDate = addYears(oldEndDate, 1);
  }
  
  // 更新訂閱
  subscription.endDate = formatDate(newEndDate);
  subscription.gracePeriodEnd = formatDate(addDays(newEndDate, 60));
  subscription.status = 'Active';
  subscription.isCanceled = false;
  subscription.canceledAt = null;
  subscription.paymentDate = formatDate(new Date());
  subscription.amount = 1200;
  subscription.paymentTransactionId = paymentTransactionId;
  subscription.updatedAt = new Date().toISOString();
  
  await kv.set(`user:${user.id}:subscription`, subscription);
  
  // 更新帳號狀態
  await updateUserProfile(user.id, { accountStatus: 'Active' });
  
  return c.json({
    success: true,
    data: {
      subscription,
      message: isRenewal ? '補繳成功，訂閱已恢復' : '訂閱成功',
      isRenewal
    }
  });
});
```

#### 3.2 每日狀態檢查排程 (20h)

**任務：**
1. ✅ 實作每日狀態掃描
2. ✅ 實作到期前5日通知
3. ✅ 實作自動狀態轉換

**檔案：**
- `/supabase/functions/server/cron_v2.ts`

**排程邏輯：**

```typescript
// 每日 00:00 執行
export async function dailySubscriptionCheck() {
  console.log('[Daily Check] 開始檢查訂閱狀態...');
  
  // 1. 獲取所有用戶
  const users = await kv.getByPrefix('user:') || [];
  
  for (const userId of users) {
    await syncAccountStatus(userId);
    
    const subscription = await kv.get(`user:${userId}:subscription`);
    const profile = await kv.get(`user:${userId}:profile`);
    
    if (!subscription) continue;
    
    // 2. 到期前5日通知
    const endDate = new Date(subscription.endDate);
    const daysRemaining = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    
    if (daysRemaining >= 1 && daysRemaining <= 5) {
      await sendRenewalReminder(profile.email, daysRemaining);
      console.log(`[Reminder] ${userId}: ${daysRemaining} 天後到期`);
    }
    
    // 3. 記錄狀態變化
    if (profile.accountStatus === 'Grace') {
      const graceDays = Math.ceil((new Date(subscription.gracePeriodEnd) - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`[Grace] ${userId}: 寬限期剩餘 ${graceDays} 天`);
    }
    
    if (profile.accountStatus === 'Fail') {
      console.log(`[Fail] ${userId}: 帳號永久失效`);
    }
  }
  
  console.log('[Daily Check] 檢查完成');
}
```

#### 3.3 前端訂閱管理 UI (20h)

**任務：**
1. ✅ 實作訂閱狀態儀表板
2. ✅ 實作四狀態視覺化
3. ✅ 實作取消/續訂流程

**檔案：**
- `/components/subscription/SubscriptionDashboard.tsx`
- `/components/subscription/SubscriptionStatus.tsx`
- `/components/subscription/RenewalForm.tsx`
- `/components/subscription/CancellationDialog.tsx`

**UI 設計：**

```typescript
// 四狀態視覺化
<Card className={`
  ${status === 'Active' ? 'border-green-500 bg-green-50' : ''}
  ${status === 'Canceled' ? 'border-yellow-500 bg-yellow-50' : ''}
  ${status === 'Grace' ? 'border-orange-500 bg-orange-50' : ''}
  ${status === 'Fail' ? 'border-red-500 bg-red-50' : ''}
`}>
  <CardHeader>
    <div className="flex items-center gap-2">
      {status === 'Active' && <CheckCircle className="text-green-600" />}
      {status === 'Canceled' && <XCircle className="text-yellow-600" />}
      {status === 'Grace' && <AlertCircle className="text-orange-600" />}
      {status === 'Fail' && <XOctagon className="text-red-600" />}
      <CardTitle>
        {status === 'Active' && '訂閱中'}
        {status === 'Canceled' && '已取消'}
        {status === 'Grace' && '即將失效'}
        {status === 'Fail' && '永久失效'}
      </CardTitle>
    </div>
  </CardHeader>
  <CardContent>
    {/* 狀態說明 */}
    {/* 剩餘天數 */}
    {/* 操作按鈕 */}
  </CardContent>
</Card>
```

---

### Phase 4: 推薦系統重構（會員制） (60h)

**目標：** 將推薦系統從「刊登制」改為「會員制」

#### 4.1 後端推薦 API 重構 (30h)

**任務：**
1. ✅ 重構推薦關係創建邏輯（會員間）
2. ✅ 重構組織樹查詢（會員級）
3. ✅ 實作失效節點保留機制

**檔案：**
- `/supabase/functions/server/referrals_v2.ts`

**API 規格：**

```typescript
// GET /referrals/v2/my-tree
// 獲取我的推薦樹（會員級）
interface GetReferralTreeResponse {
  success: boolean;
  data: {
    myInfo: {
      userId: string;
      realName: string;
      referralCode: string;
      accountStatus: string;
    };
    tree: {
      firstGeneration: MemberNode[];
      secondGeneration: MemberNode[];
      thirdGeneration: MemberNode[];
    };
    summary: {
      totalReferrals: number;
      activeCount: number;
      inactiveCount: number;
    };
  };
}

interface MemberNode {
  userId: string;
  realName: string;         // ✅ 即時查詢（SSOT）
  accountStatus: string;
  isActive: boolean;
  createdAt: string;
  referrer?: {
    userId: string;
    realName: string;       // ✅ 即時查詢（SSOT）
  };
}
```

**組織樹查詢實作：**

```typescript
// GET /referrals/v2/my-tree
app.get('/my-tree', async (c) => {
  const user = await verifyToken(token);
  
  // 1. 查詢三代推薦關係
  const gen1 = await kv.getByPrefix(`referral_relationship:`) || [];
  const firstGen = gen1.filter(r => r.gen1ReferrerId === user.id && r.generation === 1);
  const secondGen = gen1.filter(r => r.gen2ReferrerId === user.id && r.generation === 2);
  const thirdGen = gen1.filter(r => r.gen3ReferrerId === user.id && r.generation === 3);
  
  // 2. 查詢每個會員的資料（SSOT：即時查詢姓名）
  const formatMemberNode = async (relationship: ReferralRelationship): Promise<MemberNode> => {
    const member = await getUserProfile(relationship.refereeId);
    
    let referrer = null;
    if (relationship.generation > 1 && relationship.referrerId) {
      const referrerProfile = await getUserProfile(relationship.referrerId);
      referrer = {
        userId: relationship.referrerId,
        realName: referrerProfile.realName  // ✅ 即時查詢
      };
    }
    
    return {
      userId: member.id,
      realName: member.realName,  // ✅ 即時查詢（SSOT）
      accountStatus: member.accountStatus,
      isActive: relationship.status === 'Active',
      createdAt: relationship.createdAt,
      referrer
    };
  };
  
  const firstGeneration = await Promise.all(firstGen.map(formatMemberNode));
  const secondGeneration = await Promise.all(secondGen.map(formatMemberNode));
  const thirdGeneration = await Promise.all(thirdGen.map(formatMemberNode));
  
  return c.json({
    success: true,
    data: {
      myInfo: {
        userId: user.id,
        realName: profile.realName,
        referralCode: myReferralCode,
        accountStatus: profile.accountStatus
      },
      tree: {
        firstGeneration,
        secondGeneration,
        thirdGeneration
      },
      summary: {
        totalReferrals: firstGeneration.length + secondGeneration.length + thirdGeneration.length,
        activeCount: [...firstGeneration, ...secondGeneration, ...thirdGeneration].filter(m => m.isActive).length,
        inactiveCount: [...firstGeneration, ...secondGeneration, ...thirdGeneration].filter(m => !m.isActive).length
      }
    }
  });
});
```

#### 4.2 前端推薦管理 UI (20h)

**任務：**
1. ✅ 重構推薦碼顯示（會員級）
2. ✅ 重構組織樹視圖（會員級）
3. ✅ 實作失效節點標記

**檔案：**
- `/components/referral/ReferralCodeDisplay.tsx`
- `/components/referral/ReferralTreeView.tsx`
- `/components/referral/MemberNode.tsx`

#### 4.3 一對一刊登限制 (10h)

**任務：**
1. ✅ 前端檢查：禁止創建第二個刊登
2. ✅ 後端驗證：拒絕多刊登請求
3. ✅ UI 提示：顯示唯一刊登

---

### Phase 5: 年費月領獎勵機制 (80h)

**目標：** 實作年費月領的12次排程發放機制

#### 5.1 獎勵排程系統 (40h)

**任務：**
1. ✅ 實作 Reward Schedule 創建邏輯
2. ✅ 實作每日掃描發放邏輯
3. ✅ 實作狀態檢查與作廢機制

**檔案：**
- `/supabase/functions/server/rewards_v2.ts`
- `/supabase/functions/server/cron/dailyRewardIssuance.ts`

**創建排程邏輯：**

```typescript
// 支付成功後創建12筆排程
async function createRewardSchedules(
  refereeUserId: string,
  pendingReferral: PendingReferral
) {
  const schedules = [];
  const paymentDate = new Date();
  
  // 為三代推薦人創建12筆排程
  const recipients = [
    { userId: pendingReferral.gen1ReferrerId, generation: 1 },
    { userId: pendingReferral.gen2ReferrerId, generation: 2 },
    { userId: pendingReferral.gen3ReferrerId, generation: 3 }
  ].filter(r => r.userId);  // 過濾掉不存在的推薦人
  
  for (const recipient of recipients) {
    for (let month = 2; month <= 12; month++) {  // 第1個月立即發放，這裡創建2-12月
      const scheduledDate = new Date(paymentDate);
      scheduledDate.setMonth(scheduledDate.getMonth() + month - 1);
      
      const schedule: RewardSchedule = {
        id: generateId(),
        recipientUserId: recipient.userId,
        sourceUserId: refereeUserId,
        generation: recipient.generation,
        monthNumber: month,
        amount: 10,
        status: 'Pending',
        scheduledDate: formatDate(scheduledDate),
        issuedDate: null,
        referee: {
          userId: refereeUserId
          // ❌ 不複製姓名（SSOT）
        },
        referrer: recipient.generation > 1 ? {
          userId: pendingReferral[`gen${recipient.generation - 1}ReferrerId`]
        } : null,
        createdAt: new Date().toISOString()
      };
      
      schedules.push(schedule);
      await kv.set(`reward_schedule:${schedule.id}`, schedule);
    }
  }
  
  // 建立日期索引（用於每日掃描）
  for (const schedule of schedules) {
    const dateKey = `reward_schedules:pending:${schedule.scheduledDate}`;
    const dateSchedules = await kv.get(dateKey) || [];
    dateSchedules.push(schedule.id);
    await kv.set(dateKey, dateSchedules);
  }
  
  console.log(`[Reward Schedule] 創建 ${schedules.length} 筆排程`);
}
```

**每日發放邏輯：**

```typescript
// 每日 01:00 執行
export async function dailyRewardIssuance() {
  console.log('[Daily Reward] 開始發放排程獎勵...');
  
  const today = formatDate(new Date());
  const scheduleIds = await kv.get(`reward_schedules:pending:${today}`) || [];
  
  console.log(`[Daily Reward] 今天需發放 ${scheduleIds.length} 筆`);
  
  for (const scheduleId of scheduleIds) {
    const schedule = await kv.get(`reward_schedule:${scheduleId}`);
    
    if (!schedule || schedule.status !== 'Pending') {
      console.log(`[Skip] ${scheduleId} - 狀態不是 Pending`);
      continue;
    }
    
    // ✅ 關鍵：發放前檢查上線狀態
    const recipient = await getUserProfile(schedule.recipientUserId);
    
    if (recipient.accountStatus === 'Fail') {
      // ❌ 上線永久失效 → 作廢
      schedule.status = 'Void';
      schedule.voidedAt = new Date().toISOString();
      schedule.voidReason = 'Recipient account is permanently failed';
      await kv.set(`reward_schedule:${scheduleId}`, schedule);
      
      console.log(`[Void] ${scheduleId} - 上線已失效`);
    } else {
      // ✅ 上線正常 → 發放
      
      // 使用 Transaction 保證原子性
      await kv.transaction(async (tx) => {
        // 1. 增加點數
        recipient.pointBalance += schedule.amount;
        await tx.set(`user:${schedule.recipientUserId}:profile`, recipient);
        
        // 2. 更新排程狀態
        schedule.status = 'Completed';
        schedule.issuedDate = today;
        schedule.completedAt = new Date().toISOString();
        await tx.set(`reward_schedule:${scheduleId}`, schedule);
        
        // 3. 寫入獎勵歷史
        const history = await tx.get(`user:${schedule.recipientUserId}:reward_history`) || [];
        history.unshift({
          id: generateId(),
          type: `referral_gen${schedule.generation}_month${schedule.monthNumber}`,
          amount: schedule.amount,
          referee: schedule.referee,
          referrer: schedule.referrer,
          generation: schedule.generation,
          monthNumber: schedule.monthNumber,
          issuedAt: new Date().toISOString(),
          description: `推薦獎勵 - 第${schedule.generation}代 - 第${schedule.monthNumber}個月`
        });
        await tx.set(`user:${schedule.recipientUserId}:reward_history`, history);
      });
      
      console.log(`[Issued] ${scheduleId} - 10P 已發放給 ${schedule.recipientUserId}`);
    }
  }
  
  console.log('[Daily Reward] 發放完成');
}
```

#### 5.2 獎勵歷史與排程 UI (20h)

**任務：**
1. ✅ 實作獎勵排程視圖
2. ✅ 實作時間軸顯示
3. ✅ 實作歷史記錄查詢

**檔案：**
- `/components/reward/RewardScheduleView.tsx`
- `/components/reward/ScheduleTimeline.tsx`
- `/components/reward/RewardHistory.tsx`

#### 5.3 整合測試 (20h)

**測試案例：**
1. ✅ 支付成功 → 創建12筆排程
2. ✅ 每日發放 → 檢查上線狀態
3. ✅ 上線 Fail → 作廢該筆
4. ✅ 上線正常 → 發放獎勵
5. ✅ 冪等性測試 → 重複執行不重複發放

---

### Phase 6: 任務系統優化 (30h)

**目標：** 優化推薦王溢出邏輯，連動帳號狀態

#### 6.1 推薦王溢出邏輯 (15h)

**任務：**
1. ✅ 實作扣除制計算
2. ✅ 實作原子操作

**實作：**

```typescript
async function updateMonthlyKingProgress(userId: string, newReferralCount: number) {
  const progress = await kv.get(`user:${userId}:task_progress:monthly_king`) || {
    userId,
    taskType: 'monthly_king',
    currentCount: 0,
    targetCount: 10,
    completedCount: 0,
    currentMonth: formatMonth(new Date()),
    status: 'Active',
    lastResetAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  
  // 使用 Transaction 保證原子性
  await kv.transaction(async (tx) => {
    // 增加計數
    progress.currentCount += newReferralCount;
    
    // 溢出處理（扣除制）
    while (progress.currentCount >= progress.targetCount) {
      // 發放獎勵
      await issueTaskReward(userId, 'monthly_king', 1000, tx);
      
      // 扣除
      progress.currentCount -= progress.targetCount;
      progress.completedCount += 1;
      
      console.log(`[Monthly King] ${userId} 達成第 ${progress.completedCount} 次`);
    }
    
    progress.lastUpdatedAt = new Date().toISOString();
    await tx.set(`user:${userId}:task_progress:monthly_king`, progress);
  });
}
```

#### 6.2 狀態連動與歸零 (10h)

**任務：**
1. ✅ Fail 狀態時任務歸零
2. ✅ 恢復後重新計算

#### 6.3 UI 更新 (5h)

---

### Phase 7: 提領系統優化 (20h)

**目標：** 實作新的提領規則

#### 7.1 提領檢核邏輯 (10h)

**任務：**
1. ✅ 實作 1,000 倍數檢查
2. ✅ 實作外加制手續費
3. ✅ 實作狀態限制

#### 7.2 UI 更新 (10h)

---

### Phase 8: 整合測試與上線 (40h)

**目標：** 全面測試，確保系統穩定

#### 8.1 端對端測試 (20h)

**測試流程：**
1. ✅ 註冊流程（4步驟）
2. ✅ 推薦關係建立
3. ✅ 獎勵排程創建
4. ✅ 每日發放
5. ✅ 狀��轉換
6. ✅ 補繳邏輯
7. ✅ 任務系統
8. ✅ 提領系統

#### 8.2 壓力測試 (10h)

**測試項目：**
1. ✅ 併發提領
2. ✅ 併發推薦
3. ✅ 大量排程發放

#### 8.3 數據遷移 (10h)

**遷移計劃：**
1. ✅ 備份現有資料
2. ✅ 執行遷移腳本
3. ✅ 驗證資料完整性

---

## 📋 Part 6: 檢查清單

### 6.1 資料完整性檢查

- [ ] 所有姓名查詢都是即時查詢（SSOT）
- [ ] 沒有姓名複製到其他表
- [ ] 帳號狀態由訂閱狀態計算
- [ ] 推薦碼有 Unique Index
- [ ] 身分證有唯一性檢查

### 6.2 查詢效能檢查

- [ ] 推薦碼檢核是 O(1)
- [ ] 組織樹查詢優化
- [ ] 使用反向索引

### 6.3 併發控制檢查

- [ ] 提領使用 Transaction
- [ ] 任務計數器原子操作
- [ ] 獎勵發放防重複

### 6.4 排程系統檢查

- [ ] 冪等性設計
- [ ] 錯誤處理
- [ ] 日誌記錄

### 6.5 狀態機檢查

- [ ] 四狀態轉換正確
- [ ] Grace Period 權限限制
- [ ] Fail 狀態清理邏輯

### 6.6 歷史資料檢查

- [ ] 永久失效節點保留
- [ ] 不物理刪除用戶
- [ ] 使用 flag 標記

---

## 🎯 總結

本實作方案基於新規格的6��技術要求，設計了9張資料表，提出了8個實作階段，預估總工時440小時。

**核心設計原則：**
1. ✅ **SSOT**：姓名唯一真實來源
2. ✅ **O(1)**：推薦碼檢核、索引優化
3. ✅ **ACID**：Transaction、原子操作
4. ✅ **Idempotency**：排程冪等性設計
5. ✅ **State Machine**：嚴格的狀態流轉
6. ✅ **Legacy Data**：保留歷史節點

**優先順序：**
- **P0（必須）**：Phase 1-5, 8（核心功能）
- **P1（建議）**：Phase 6-7（優化功能）

**建議實作順序：**
1. Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
2. 每個 Phase 完成後進行測試驗證
3. Phase 8 整合測試通過後上線

---

**📌 下一步：等待您的確認，開始 Phase 1 實作。**
