# Uknow 新規格架構分析與實施計畫

**日期**: 2024-12-22  
**版本**: v2.1  
**作者**: 系統架構師

---

## 📋 目錄

1. [核心變更分析](#1-核心變更分析)
2. [現有註冊流程深度分析](#2-現有註冊流程深度分析)
3. [新舊系統對比](#3-新舊系統對比)
4. [資料架構設計](#4-資料架構設計)
5. [後端修改計畫](#5-後端修改計畫-phase-by-phase)
6. [前端修改計畫](#6-前端修改計畫-phase-by-phase)
7. [風險評估與緩解策略](#7-風險評估與緩解策略)

---

## 1. 核心變更分析

### 1.1 新規格重點變更摘要

根據最新確認，有以下三個關鍵變更：

#### 🔴 變更 1：移除身分證字號收集

**現狀**: 
- 註冊時要求填寫身分證字號
- 身分證字號有唯一性檢核
- 數據庫有 `id_number` 字段（NOT NULL 約束導致錯誤）

**新規格**:
- ✅ **註冊時不需要填寫身分證字號**
- ✅ 移除 `id_number` 字段的 NOT NULL 約束（設為可選或移除）

**影響範圍**:
- 🟡 中等影響
- 需要修改：後端驗證邏輯、前端表單、資料庫約束

---

#### 🔴 變更 2：一個帳號只能有一個刊登

**現狀**:
- 一個用戶可以創建多個刊登
- 用戶資料料中有 `listings` 陣列
- 前端顯示多個刊登的列表

**新規格**:
- ✅ **一個帳號只能有一個刊登**
- ✅ 用戶與刊登是 1:1 關係
- ✅ 簡化刊登管理邏輯

**影響範圍**:
- 🟡 中等影響
- 需要修改：資料結構、創建刊登邏輯、前端UI

---

#### 🟢 變更 3：現有註冊流程已實現（需確認）

**現狀分析**（見第2節詳細分析）:
- ✅ 已實現：Email 檢核 → 註冊/登入分流
- ✅ 已實現：創建 Email + 密碼 → 發送驗證郵件
- ✅ 已實現：驗證後重新登入 → 完成基本資訊
- ⚠️ **需要確認**：是否需要在 Step 2 加入推薦碼和付款流程

**新規格需求**:
- Email 檢核 → 分流
- 註冊：創建 Email + 密碼 → 驗證 Email
- 驗證後登入 → 完成基本資訊（姓名、手機、生日、推薦碼）
- 付款年費 $1,200（藍新金流）
- 付款成功 → 生成推薦碼 → 更新推薦人組織圖

---

### 1.2 架構層面的根本性變化

#### ⭐ **最大變化：推薦碼綁定對象變更**

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|----------|--------|----------|
| **綁定對象** | Listing（刊登） | User（會員） | 🔴 **極高** |
| **推薦碼數量** | 一個用戶多個刊登 = 多個推薦碼 | **一個用戶一個推薦碼**（一個用戶只能有一個刊登） | 🔴 **極高** |
| **推薦樹存儲** | `listing:${listingId}:referral_tree` | `user:${userId}:referral_tree` | 🔴 **極高** |
| **失效處理** | 刊登失效 = 推薦碼失效 | 用戶失效 = 推薦碼失效，生成新碼 | 🔴 **極高** |

**架構影響**:
- ✅ **極大簡化系統複雜度**（一個用戶 = 一個刊登 = 一個推薦碼）
- ✅ **符合業務邏輯**（推薦的是「人」，人只有一個刊登）
- ⚠️ **需要完全重寫推薦系統**（資料結構、API、前端）

---

#### ⭐ **新增：帳號狀態機系統**

現有系統沒有完整的狀態機，新規格需要4個狀態：

```
┌─────────────┐
│   Active    │ ◄─── 付款成功
│  (訂閱中)    │
└──────┬──────┘
       │
       ├─手動取消────► ┌──────────┐
       │              │ Canceled │ ──到期──► ┌──────┐
       │              │ (已取消)  │            │ Fail │
       │              └──────────┘            │(永久) │
       │                                      └───▲──┘
       └─逾期未繳────► ┌──────────┐               │
                       │  Grace   │ ─補繳─► Active│
                       │(即將失效) │               │
                       └────┬─────┘               │
                            │                     │
                            └──>60天──────────────┘
```

**狀態轉換規則**:

| 從狀態 | 到狀態 | 觸發條件 | 系統動作 |
|--------|--------|----------|----------|
| Active | Canceled | 用戶手動取消 | 標記取消，到期日不變 |
| Active | Grace | 逾期0-60天 | 隱藏刊登，鎖定提領功能，**保留推薦功能** |
| Canceled | Fail | 到期 | 推薦碼 Fail，點數歸零，任務歸零 |
| Grace | Fail | 逾期>60天 | 推薦碼 Fail，點數歸零，任務歸零 |
| Grace | Active | 60天內補繳 | 恢復顯示，周期接續原到期日 |
| Fail | Active | 重新訂閱 | 生成新推薦碼，一切重新計算 |

**重點說明**:
- ✅ **Grace 狀態下，推薦功能仍可使用**（重要！）
- ✅ Grace 狀態下產生的獎勵照常計算，但無法提領
- ✅ 補繳後立即恢復，獎勵可提領

---

## 2. 現有註冊流程深度分析

### 2.1 現有流程架構

#### **入口：AuthPage（統一的登入/註冊入口）**

**檔案**: `/components/AuthPage.tsx`

**流程圖**:
```
用戶訪問 /login
    │
    ▼
Step 1: 輸入 Email
    │
    ├─► API: POST /auth/check-email
    │       └─► 檢查 Supabase Auth 中是否有此用戶
    │
    ├─► exists = true  ────► Step 2A: 輸入密碼登入
    │                             │
    │                             ├─► Supabase Auth: signInWithPassword()
    │                             │
    │                             ├─► API: GET /auth/profile
    │                             │       └─► 獲取 KV Store 中的用戶資料
    │                             │
    │                             ├─► profile.needsOnboarding = true?
    │                             │       └─► YES: 導向 /auth/complete-profile
    │                             │       └─► NO:  導向 /dashboard
    │                             │
    │                             └─► 登入完成
    │
    └─► exists = false ────► Step 2B: 設定密碼註冊
                                  │
                                  ├─► Supabase Auth: signUp()
                                  │       └─► 創建 Auth 用戶
                                  │       └─► 發送 Email 驗證信
                                  │
                                  └─► 導向 /auth/verify-email（等待驗證）
```

---

#### **驗證階段：EmailVerificationPending**

**檔案**: `/components/EmailVerificationPending.tsx`

**流程**:
```
用戶點擊 Email 中的驗證連結
    │
    ▼
導向 /auth/callback?token=xxx
    │
    ▼
AuthCallback 處理
    │
    ├─► Supabase Auth: exchangeCodeForSession()
    │       └─► 獲取 access_token
    │
    ├─► API: GET /auth/profile
    │       └─► 檢查 KV Store 是否有資料
    │       └─► profile.needsOnboarding = true
    │
    └─► 導向 /auth/complete-profile
```

---

#### **完成資料：CompleteProfile**

**檔案**: `/components/CompleteProfile.tsx`

**流程**:
```
用戶填寫基本資料
    ├─► 真實姓名
    ├─► 手機號碼
    ├─► 出生年月日
    └─► 同意服務條款
        │
        ▼
    提交表單
        │
        ├─► API: POST /auth/register
        │       └─► 存入 KV Store: user:${userId}:profile
        │       └─► 創建索引: email:${email} → userId
        │
        └─► 導向 /dashboard
```

---

### 2.2 後端 API 流程

#### **API 1: POST /auth/check-email**

**檔案**: `/supabase/functions/server/auth.ts` - `checkEmail()`

**邏輯**:
```typescript
1. 檢查 Supabase Auth 中是否有此 Email
2. 如果不存在 → return { exists: false }
3. 如果存在：
   a. 檢查 email_confirmed_at 是否存在
   b. 檢查 KV Store 是否有 profile
   
   情況 1: email_confirmed_at = true + profile 存在
      → return { exists: true } // 完整用戶，可登入
   
   情況 2: email_confirmed_at = true + profile 不存在
      → return { exists: true } // 正在註冊中，允許登入後完成資料
   
   情況 3: email_confirmed_at = false
      → 刪除 Supabase Auth 用戶 + 刪除 KV Store
      → return { exists: false } // 允許重新註冊
```

**重點邏輯**:
- ✅ Email 未驗證的用戶會被自動刪除，允許重新註冊
- ✅ Email 已驗證但資料未完成的用戶，可以登入後繼續完成資料

---

#### **API 2: GET /auth/profile**

**檔案**: `/supabase/functions/server/auth.ts`

**邏輯**:
```typescript
1. 從 JWT token 獲取 userId
2. 檢查 KV Store: user:${userId}:profile
3. 如果不存在 → return { needsOnboarding: true }
4. 如果存在 → return profile
```

---

#### **API 3: POST /auth/register**

**檔案**: `/supabase/functions/server/auth.ts`

**邏輯**:
```typescript
1. 驗證 JWT token，獲取 userId
2. 驗證表單資料（姓名、手機、生日）
3. 存入 KV Store:
   - user:${userId}:profile
   - email:${email} → userId
   - phone:${phone} → userId
4. 返回完整 profile
```

---

### 2.3 現有流程的優點與問題

#### ✅ **優點**:

1. **統一入口**
   - AuthPage 同時處理登入和註冊，UX 流暢
   - Email 檢核自動分流，減少用戶困惑

2. **Email 驗證機制完善**
   - 使用 Supabase 內建的 Email 驗證
   - 自動清理未驗證的用戶

3. **資料填寫分離**
   - 先創建帳號，再填寫資料
   - 避免 Email 驗證失敗後資料丟失

---

#### ⚠️ **需要補充的部分**:

1. **缺少推薦碼流程**
   - CompleteProfile 沒有推薦碼輸入欄位
   - 沒有推薦碼驗證 API

2. **缺少付款流程**
   - 註冊完成後沒有導向付款頁面
   - 沒有藍新金流整合

3. **缺少推薦關係建立**
   - 付款成功後沒有創建推薦關係
   - 沒有更新推薦人的組織圖和任務

4. **缺少推薦碼生成**
   - 付款成功後沒有生成推薦碼
   - 沒有推薦碼綁定到用戶

---

## 3. 新舊系統對比

### 3.1 資料綁定關係

#### **現有系統**:
```
User (會員)
  ├── Profile (基本資料)
  │     ├── name
  │     ├── phone
  │     ├── birthDate
  │     └── idNumber ❌ 新規格移除
  │
  └── Listings[] (多個刊登)
        ├── Listing A (推薦碼: abc123456)
        │     └── Referral Tree A
        └── Listing B (推薦碼: def789012)
              └── Referral Tree B
```

**問題**:
- ❌ 一個用戶多個推薦碼，組織結構複雜
- ❌ 訂閱綁定到刊登，不符合年費邏輯
- ❌ 需要收集身分證字號

---

#### **新規格**:
```
User (會員)
  ├── Profile (基本資料)
  │     ├── name (真實姓名)
  │     ├── phone
  │     ├── birthDate
  │     └── ❌ 移除 idNumber
  │
  ├── Account Status (Active/Canceled/Grace/Fail)
  │
  ├── Subscription (年費 $1,200)
  │     └── 訂閱週期 (startDate → endDate)
  │
  ├── Referral Code (唯一，abc123456)
  │     └── Referral Tree (3代推薦)
  │
  └── Listing (唯一，一個用戶只能有一個刊登) ✅
        └── 跟隨用戶狀態顯示/隱藏
```

**優勢**:
- ✅ 一個用戶 = 一個刊登 = 一個推薦碼，結構清晰
- ✅ 訂閱綁定到用戶，符合年費邏輯
- ✅ 不收集身分證字號，降低隱私風險

---

### 3.2 註冊流程對比

| 步驟 | 現有系統 | 新規格 | 變化 |
|------|----------|--------|------|
| **Step 1** | Email 檢核 → 分流 | Email 檢核 → 分流 | ✅ 相同 |
| **Step 2** | 設定密碼 → 發送驗證信 | 設定密碼 → 發送驗證信 | ✅ 相同 |
| **Step 3** | 驗證 Email → 重新登入 | 驗證 Email → 重新登入 | ✅ 相同 |
| **Step 4** | 填寫基本資料（姓名、手機、生日、❌身分證） | 填寫基本資料（姓名、手機、生日、**推薦碼**） | 🔴 **變化** |
| **Step 5** | ❌ 無 | **付款年費 $1,200** | 🟢 **新增** |
| **Step 6** | 註冊完成 → Dashboard | 付款成功 → **生成推薦碼** → **更新推薦人組織圖** → Dashboard | 🟢 **新增** |

**關鍵差異**:
1. ✅ **移除身分證字號**收集
2. ✅ **新增推薦碼輸入**（選填，即時驗證並顯示推薦人姓名）
3. ✅ **新增付款流程**（藍新金流，$1,200）
4. ✅ **新增推薦關係建立**（付款成功後立即執行）

---

### 3.3 API 端點變化

| 功能 | 現有 API | 新 API | 變化 |
|------|----------|--------|------|
| Email 檢核 | `/auth/check-email` | `/auth/check-email` | ✅ 保持 |
| 註冊 | `/auth/register` | `/auth/register` | 🔴 修改（加入推薦碼） |
| 推薦碼驗證 | ❌ 無 | `/auth/verify-referral-code` | 🟢 新增 |
| 付款處理 | ❌ 無 | `/payment/create-order` | 🟢 新增 |
| 付款回調 | ❌ 無 | `/payment/callback` | 🟢 新增 |
| 獲取訂閱 | ❌ 無 | `/user/subscription` | 🟢 新增 |
| 推薦樹 | `/referrals/my-tree` | `/user/referral-tree` | 🔴 改為用戶級別 |
| 帳號狀態 | ❌ 無 | `/user/account-status` | 🟢 新增 |

---

## 4. 資料架構設計

### 4.1 設計原則

1. **SSOT (Single Source of Truth)**:
   - 用戶狀態: `user:${userId}:account_status`
   - 推薦碼: `user:${userId}:active_referral_code`
   - 推薦關��: `referral_code:${codeId}:relationships`

2. **No Data Redundancy**:
   - 避免在多處存儲相同資料
   - 使用引用 (ID) 而非複製完整對象

3. **Performance Optimization**:
   - 推薦樹預計算緩存
   - 用戶狀態緩存
   - 索引鍵快速查找

4. **Simplicity (簡化)**:
   - ✅ 一個用戶 = 一個刊登 = 一個推薦碼
   - ✅ 移除不必要的陣列和巢狀結構

---

### 4.2 KV Store 表格設計

#### **Table 1: User Profile（用戶基本資料）**

```typescript
// Key: user:${userId}:profile
interface UserProfile {
  id: string;
  email: string;
  realName: string;          // 真實姓名（可修改，需同步到推薦樹）
  phone: string;
  birthDate: string;         // YYYY-MM-DD
  
  // ❌ 移除 idNumber
  
  // 銀行資訊（提領時填寫）
  bankCode?: string;
  bankAccount?: string;
  
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
}
```

**索引鍵**:
- `email:${email}` → `userId` (Email 唯一性)
- `phone:${phone}` → `userId` (手機唯一性)
- ❌ 移除 `id_number:${idNumber}` 索引

**變更說明**:
- ✅ 移除 `idNumber` 欄位
- ✅ 簡化結構，銀行資訊設為可選

---

#### **Table 2: User Account Status（用戶帳號狀態）- SSOT**

```typescript
// Key: user:${userId}:account_status
interface UserAccountStatus {
  status: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  currentSubscriptionId: string | null;    // 當前有效訂閱 ID
  activeReferralCodeId: string | null;     // 當前有效推薦碼 ID
  activeListing��d: string | null;         // ✅ 當前有效刊登 ID（唯一）
  pointBalance: number;                    // 點數餘額
  lastStatusUpdate: string;                // 最後狀態更新時間
  lastSubscriptionEndDate: string | null;  // 最後訂閱結束日期
  gracePeriodEndDate: string | null;       // 寬限期結束日期（僅 Grace 狀態）
}
```

**變更說明**:
- ✅ 新增 `activeListingId` 欄位（取代 listings[] 陣列）
- ✅ 一個用戶只有一個活躍刊登

---

#### **Table 3: Subscriptions（訂閱記錄）**

```typescript
// Key: subscription:${subscriptionId}
interface Subscription {
  id: string;
  userId: string;
  status: 'Active' | 'Canceled' | 'Expired' | 'Grace';
  startDate: string;           // 訂閱開始日期
  endDate: string;             // 訂閱結束日期
  gracePeriodEnd: string;      // 寬限期結束日期 (endDate + 60天)
  amount: number;              // 1200
  paymentMethod: string;       // 'newebpay' | 'manual'
  paymentTransactionId: string;
  newebpayTradeNo?: string;    // 藍新金流訂單編號
  isCanceled: boolean;         // 用戶是否手動取消
  canceledAt: string | null;
  isRenewal: boolean;          // 是否為補繳（true = 周期接續）
  createdAt: string;
  updatedAt: string;
}

// Key: user:${userId}:subscriptions
// Value: string[] (subscription IDs，按時間倒序)
```

**補繳邏輯**:
```typescript
if (isRenewal && gracePeriodEnd >= today) {
  // 補繳：周期接續原到期日
  newStartDate = oldEndDate;
  newEndDate = oldEndDate + 1年;
} else {
  // 新訂閱：從付款日重新計算
  newStartDate = today;
  newEndDate = today + 1年;
}
```

---

#### **Table 4: Referral Codes（推薦碼）- 綁定到 User**

```typescript
// Key: referral_code:${codeId}
interface ReferralCode {
  id: string;
  userId: string;              // 所屬用戶
  code: string;                // abc123456 (3小寫英文+6數字)
  status: 'Active' | 'Inactive' | 'Fail';
  // Active: 使用中
  // Inactive: 已被新碼替換（補繳/重新訂閱）
  // Fail: 永久失效（>60天或取消後到期）
  
  isActive: boolean;           // 快速查詢
  activatedAt: string;         // 激活時間（付款成功）
  inactivatedAt: string | null;
  subscriptionId: string;      // 關聯的訂閱 ID
  createdAt: string;
}

// Key: code:${code} → referral_code:${codeId}
// 用於快速查找推薦人

// Key: user:${userId}:referral_codes
// Value: string[] (referral code IDs，歷史記錄)

// Key: user:${userId}:active_referral_code
// Value: string | null (當前有效推薦碼 ID - SSOT)
```

**推薦碼生成規則**:
```typescript
function generateReferralCode(): string {
  // 3個小寫英文字母 + 6個數字
  const letters = randomString(3, 'abcdefghijklmnopqrstuvwxyz');
  const numbers = randomString(6, '0123456789');
  return letters + numbers; // 例: abc123456
}
```

---

#### **Table 5: Referral Relationships（推薦關係）- SSOT**

```typescript
// Key: referral_code:${codeId}:relationships
interface ReferralRelationships {
  generation1: Array<{
    userId: string;              // 被推薦人用戶 ID
    referredAt: string;          // 推薦時間
    referralCodeUsed: string;    // 被推薦人使用的推薦碼 ID
  }>;
  generation2: Array<{...}>;     // 孫代
  generation3: Array<{...}>;     // 曾孫代
  lastUpdated: string;
}

// Key: user:${userId}:referred_by
// Value: { referrerUserId, referralCodeId, referredAt } | null
```

**推薦關係建立流程** (Step 5 付款成功後):
```typescript
1. 獲取推薦人的 activeReferralCode
2. 在 referral_code:${codeId}:relationships 中添加到 generation1
3. 遞歸查找推薦人的 referred_by，添加到 generation2
4. 再次遞歸，添加到 generation3
5. 更新所有涉及用戶的 referral_tree 緩存
6. 發放獎勵（第1個月）
```

---

#### **Table 6: Referral Tree（推薦樹���- Cached**

```typescript
// Key: user:${userId}:referral_tree
interface ReferralTree {
  firstGeneration: Array<{
    userId: string;
    userName: string;            // ⚠️ 緩存，需定期同步
    accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail';
    referredAt: string;
    activeReferralCodeId: string | null;
  }>;
  secondGeneration: Array<{...}>;
  thirdGeneration: Array<{...}>;
  lastUpdated: string;
}
```

**同步策略**:
- 用戶修改姓名時，觸發更新所有推薦人的 referral_tree
- Cron job 每日同步狀態（Active/Grace/Fail）

---

#### **Table 7: Listings（刊登）- 簡化為 1:1 關係**

```typescript
// Key: listing:${listingId}
interface Listing {
  id: string;
  userId: string;              // ✅ 所屬用戶（1:1 關係）
  publicListingId: string;     // 公開刊登 ID
  name: string;
  category: string;
  city: string;
  district: string;
  gender: string;
  photos: string[];
  contactMethods: ContactMethod[];
  serviceAreas: string[];
  description: string;
  
  // ❌ 移除 referralCode（改為用戶級別）
  // ❌ 移除 referrerUserId（改為用戶級別）
  // ❌ 移除 referrerListingId
  
  activeUntil: string;         // ✅ 跟隨用戶訂閱狀態
  isActive: boolean;           // ✅ 跟隨用戶帳號狀態
  createdAt: string;
  updatedAt: string;
}

// Key: user:${userId}:listing
// Value: string (listing ID，唯一) ✅ 不再是陣列

// ❌ 移除 user:${userId}:listings 陣列
```

**刊登顯示邏輯**:
```typescript
// 刊登是否顯示 = 用戶帳號狀態是否允許
const userStatus = await kv.get(`user:${userId}:account_status`);

if (userStatus.status === 'Active' || userStatus.status === 'Canceled') {
  // 顯示刊登
  listing.isActive = true;
} else if (userStatus.status === 'Grace' || userStatus.status === 'Fail') {
  // 隱藏刊登
  listing.isActive = false;
}
```

**重要約束**:
- ✅ 一個用戶最多只能有一個刊登
- ✅ 如果已有刊登，創建新刊登時返回錯誤
- ✅ 前端 UI 不顯示「創建新刊登」按鈕（如果已有刊登）

---

### 4.3 索引鍵設計

| 索引鍵 | 目的 | 值 |
|--------|------|-----|
| `email:${email}` | Email 唯一性檢核 | `userId` |
| `phone:${phone}` | 手機唯一性檢核 | `userId` |
| ~~`id_number:${idNumber}`~~ | ~~身分證唯一性檢核~~ | ~~`userId`~~ ❌ 移除 |
| `code:${code}` | 推薦碼快速查找 | `referralCodeId` |
| `payment:${transactionId}` | 防止重複付款 | `subscriptionId` |

---

## 5. 後端修改計畫 (Phase by Phase)

### Phase 1: 移除身分證字號約束（1天）

#### 5.1.1 修改數據驗證邏輯

**檔案**: `/supabase/functions/server/auth.ts`

**修改點**:
```typescript
// ❌ 移除身分證驗證
export const registerUser = async (c: Context) => {
  const { name, phone, birthDate, referralCode } = await c.req.json();
  
  // ❌ 移除 idNumber 的必填驗證
  // if (!idNumber) {
  //   return c.json({ error: '請輸入身分證字號' }, 400);
  // }
  
  // ❌ 移除身分證格式驗證
  // if (!/^[A-Z][12]\d{8}$/.test(idNumber)) {
  //   return c.json({ error: '身分證格式不正確' }, 400);
  // }
  
  // ❌ 移除身分證唯一性檢核
  // const existingUserId = await kv.get(`id_number:${idNumber}`);
  // if (existingUserId) {
  //   return c.json({ error: '此身分證已被註冊' }, 400);
  // }
  
  // ... 其他邏輯
};
```

---

#### 5.1.2 修改數據存儲

**檔案**: `/supabase/functions/server/auth.ts`

**修改點**:
```typescript
// ❌ 移除 idNumber 存儲
await kv.set(`user:${userId}:profile`, {
  id: userId,
  email: user.email,
  realName: name,
  // idNumber, ❌ 移除
  birthDate,
  phone,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

// ❌ 移除 idNumber 索引
// await kv.set(`id_number:${idNumber}`, userId);
```

---

### Phase 2: 限制一個帳號一個刊登（2-3天）

#### 5.2.1 修改刊登創建邏輯

**檔案**: `/supabase/functions/server/listings.ts`

**修改點**:
```typescript
/**
 * POST /listings
 * 創建刊登（限制一個用戶只能有一個）
 */
listings.post('/', async (c) => {
  try {
    // 1. 驗證用戶
    const { user, error: authError } = await verifyToken(token);
    if (authError || !user) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    // ✅ 2. 檢查用戶是否已有刊登
    const existingListingId = await kv.get(`user:${user.id}:listing`);
    if (existingListingId) {
      return c.json({
        success: false,
        error: { 
          message: '您已經有一個刊登，每個帳號只能建立一個刊登',
          existingListingId 
        }
      }, 400);
    }
    
    // 3. 創建刊登
    const listingId = `listing_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // ... 創建邏輯
    
    // 4. ✅ 存儲為單一值（不是陣列）
    await kv.set(`user:${user.id}:listing`, listingId);
    
    // ✅ 5. 更新用戶帳號狀態
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    await kv.set(`user:${user.id}:account_status`, {
      ...accountStatus,
      activeListingId: listingId
    });
    
    return c.json({
      success: true,
      data: { listing }
    });
  } catch (error) {
    console.error('[Create Listing] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});
```

---

#### 5.2.2 修改刊登獲取邏輯

**檔案**: `/supabase/functions/server/listings.ts`

**修改點**:
```typescript
/**
 * GET /listings
 * 獲取用戶的刊登（單一刊登）
 */
listings.get('/', async (c) => {
  try {
    const { user, error: authError } = await verifyToken(token);
    if (authError || !user) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    // ✅ 獲取單一刊登 ID
    const listingId = await kv.get(`user:${user.id}:listing`);
    
    if (!listingId) {
      return c.json({
        success: true,
        data: { listing: null }
      });
    }
    
    // 獲取刊登詳情
    const listing = await kv.get(`listing:${listingId}`);
    
    return c.json({
      success: true,
      data: { listing }
    });
  } catch (error) {
    console.error('[Get Listing] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});
```

---

### Phase 3: 註冊流程改造（3-4天）

#### 5.3.1 新增推薦碼驗證 API

**檔案**: `/supabase/functions/server/auth.ts`（新增）

```typescript
/**
 * POST /auth/verify-referral-code
 * 驗證推薦碼並返回推薦人姓名
 */
export const verifyReferralCode = async (c: Context) => {
  try {
    const { code } = await c.req.json();
    
    if (!code) {
      return c.json({
        success: false,
        error: { message: '推薦碼是必填欄位' }
      }, 400);
    }
    
    // 驗證格式（3小寫英文+6數字）
    if (!/^[a-z]{3}\d{6}$/.test(code)) {
      return c.json({
        success: true,
        data: {
          valid: false,
          error: '推薦碼格式不正確（應為3個小寫英文字母+6個數字）'
        }
      });
    }
    
    // 查找推薦碼
    const codeId = await kv.get(`code:${code}`);
    if (!codeId) {
      return c.json({
        success: true,
        data: {
          valid: false,
          error: '推薦碼不存在'
        }
      });
    }
    
    const referralCode = await kv.get(`referral_code:${codeId}`);
    
    // 檢查狀態
    if (referralCode.status === 'Fail') {
      return c.json({
        success: true,
        data: {
          valid: false,
          error: '推薦碼已永久失效'
        }
      });
    }
    
    // 獲取推薦人資料
    const referrerProfile = await kv.get(`user:${referralCode.userId}:profile`);
    
    return c.json({
      success: true,
      data: {
        valid: true,
        referrerName: referrerProfile.realName,
        referrerUserId: referralCode.userId,
        referralCodeId: codeId,
        message: '推薦碼驗證成功'
      }
    });
  } catch (error) {
    console.error('[Verify Referral Code] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
};
```

---

#### 5.3.2 修改註冊 API（加入推薦碼）

**檔案**: `/supabase/functions/server/auth.ts`

**修改點**:
```typescript
/**
 * POST /auth/register
 * 註冊新用戶（加入推薦碼）
 */
export const registerUser = async (c: Context) => {
  try {
    const { name, phone, birthDate, referralCode } = await c.req.json();
    
    // 1. 驗證用戶
    const { user, error: authError } = await verifyToken(token);
    if (authError || !user) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    // 2. 驗證必填欄位
    if (!name || !phone || !birthDate) {
      return c.json({
        error: { message: '真實姓名、手機號碼和出生日期都是必填欄位' }
      }, 400);
    }
    
    // 3. 驗證手機格式
    if (!/^09\d{8}$/.test(phone)) {
      return c.json({
        error: { message: '手機號碼格式不正確' }
      }, 400);
    }
    
    // 4. 驗證年齡 >= 18
    const birthDateObj = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = today.getMonth() - birthDateObj.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
      age--;
    }
    if (age < 18) {
      return c.json({
        error: { message: '註冊用戶需年滿 18 歲' }
      }, 400);
    }
    
    // ✅ 5. 驗證推薦碼（如果提供）
    let referrerInfo = null;
    if (referralCode) {
      const codeId = await kv.get(`code:${referralCode}`);
      if (!codeId) {
        return c.json({
          error: { message: '推薦碼不存在' }
        }, 400);
      }
      
      const code = await kv.get(`referral_code:${codeId}`);
      if (code.status === 'Fail') {
        return c.json({
          error: { message: '推薦碼已失效' }
        }, 400);
      }
      
      const referrerProfile = await kv.get(`user:${code.userId}:profile`);
      referrerInfo = {
        userId: code.userId,
        userName: referrerProfile.realName,
        referralCodeId: codeId
      };
    }
    
    // 6. 儲存用戶資料
    await kv.set(`user:${user.id}:profile`, {
      id: user.id,
      email: user.email,
      realName: name,
      birthDate,
      phone,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // 7. 建立索引
    await kv.set(`email:${user.email}`, user.id);
    await kv.set(`phone:${phone}`, user.id);
    
    // ✅ 8. 暫存推薦碼（付款後才建立關係）
    if (referrerInfo) {
      await kv.set(`user:${user.id}:pending_referral`, referrerInfo);
    }
    
    // ✅ 9. 初始化帳號狀態（Fail，付款後才改為 Active）
    await kv.set(`user:${user.id}:account_status`, {
      status: 'Fail', // 尚未付款
      currentSubscriptionId: null,
      activeReferralCodeId: null,
      activeListingId: null,
      pointBalance: 0,
      lastStatusUpdate: new Date().toISOString(),
      lastSubscriptionEndDate: null,
      gracePeriodEndDate: null
    });
    
    return c.json({
      success: true,
      data: {
        message: '資料填寫完成，請繼續付款以完成註冊',
        referrerName: referrerInfo?.userName || null,
        needsPayment: true // ✅ 前端據此導向付款頁面
      }
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    return c.json({
      error: { message: 'Internal server error' }
    }, 500);
  }
};
```

---

### Phase 4: 付款流程整合（3-4天）

#### 5.4.1 創建付款訂單 API

**檔案**: `/supabase/functions/server/payment.ts`（新增）

```typescript
import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { YEARLY_PRICE } from './constants.ts';

const payment = new Hono();

/**
 * POST /payment/create-order
 * 創建付款訂單（藍新金流）
 */
payment.post('/create-order', async (c) => {
  try {
    // 1. 驗證用戶
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    // 2. 檢查是否已有有效訂閱
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    if (accountStatus?.status === 'Active') {
      return c.json({
        success: false,
        error: { message: '您已經有有效的訂閱' }
      }, 400);
    }
    
    // 3. 生成訂單編號
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // 4. TODO: 整合藍新金流
    // 生成藍新金流付款參數
    const newebpayData = {
      MerchantID: Deno.env.get('NEWEBPAY_MERCHANT_ID'),
      TradeInfo: {
        MerchantOrderNo: orderId,
        Amt: YEARLY_PRICE, // 1200
        ItemDesc: 'Uknow 年費會員訂閱',
        Email: user.email,
        LoginType: 0,
        NotifyURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-5c6718b9/payment/callback`,
        ReturnURL: `${Deno.env.get('FRONTEND_URL')}/payment/success`,
        ClientBackURL: `${Deno.env.get('FRONTEND_URL')}/payment/cancel`
      }
    };
    
    // 5. 暫存訂單資訊
    await kv.set(`payment_order:${orderId}`, {
      orderId,
      userId: user.id,
      amount: YEARLY_PRICE,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    
    return c.json({
      success: true,
      data: {
        orderId,
        amount: YEARLY_PRICE,
        paymentUrl: 'https://ccore.newebpay.com/MPG/mpg_gateway', // TODO: 實際藍新金流 URL
        paymentData: newebpayData
      }
    });
  } catch (error) {
    console.error('[Create Payment Order] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

export default payment;
```

---

#### 5.4.2 付款回調處理 API

**檔案**: `/supabase/functions/server/payment.ts`（新增）

```typescript
/**
 * POST /payment/callback
 * 藍新金流付款回調（付款成功後的處理）
 */
payment.post('/callback', async (c) => {
  try {
    // 1. TODO: 驗證藍新金流回調簽名
    const { Status, MerchantOrderNo, TradeNo, Amt } = await c.req.json();
    
    if (Status !== 'SUCCESS') {
      console.log('[Payment Callback] Payment failed:', MerchantOrderNo);
      return c.json({ success: false, message: 'Payment failed' });
    }
    
    // 2. 獲取訂單資訊
    const paymentOrder = await kv.get(`payment_order:${MerchantOrderNo}`);
    if (!paymentOrder) {
      console.error('[Payment Callback] Order not found:', MerchantOrderNo);
      return c.json({ success: false, message: 'Order not found' }, 404);
    }
    
    const userId = paymentOrder.userId;
    
    // ========== 開始交易 ==========
    
    const now = new Date();
    const startDate = now.toISOString();
    const endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
    const gracePeriodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate() + 60).toISOString();
    
    // 3. 創建訂閱
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await kv.set(`subscription:${subscriptionId}`, {
      id: subscriptionId,
      userId,
      status: 'Active',
      startDate,
      endDate,
      gracePeriodEnd,
      amount: YEARLY_PRICE,
      paymentMethod: 'newebpay',
      paymentTransactionId: MerchantOrderNo,
      newebpayTradeNo: TradeNo,
      isCanceled: false,
      canceledAt: null,
      isRenewal: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    
    // 4. 更新用戶訂閱列��
    const subscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
    await kv.set(`user:${userId}:subscriptions`, [subscriptionId, ...subscriptions]);
    
    // 5. 生成推薦碼
    let newReferralCode: string;
    let codeExists = true;
    while (codeExists) {
      newReferralCode = generateReferralCode();
      const existing = await kv.get(`code:${newReferralCode}`);
      codeExists = !!existing;
    }
    
    const referralCodeId = `rc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await kv.set(`referral_code:${referralCodeId}`, {
      id: referralCodeId,
      userId,
      code: newReferralCode,
      status: 'Active',
      isActive: true,
      activatedAt: now.toISOString(),
      inactivatedAt: null,
      subscriptionId,
      createdAt: now.toISOString()
    });
    
    // 建立索引
    await kv.set(`code:${newReferralCode}`, referralCodeId);
    
    // 更新用戶的推薦碼列表
    const referralCodes = await kv.get(`user:${userId}:referral_codes`) || [];
    await kv.set(`user:${userId}:referral_codes`, [referralCodeId, ...referralCodes]);
    await kv.set(`user:${userId}:active_referral_code`, referralCodeId);
    
    // 6. 更新帳號狀態
    const accountStatus = await kv.get(`user:${userId}:account_status`);
    await kv.set(`user:${userId}:account_status`, {
      ...accountStatus,
      status: 'Active',
      currentSubscriptionId: subscriptionId,
      activeReferralCodeId: referralCodeId,
      lastStatusUpdate: now.toISOString(),
      lastSubscriptionEndDate: endDate,
      gracePeriodEndDate: null
    });
    
    // 7. 處理推薦關係（如果有推薦碼）
    const pendingReferral = await kv.get(`user:${userId}:pending_referral`);
    if (pendingReferral) {
      await createReferralRelationships(userId, pendingReferral);
      await kv.del(`user:${userId}:pending_referral`);
    }
    
    // 8. 更新付款訂單狀態
    await kv.set(`payment_order:${MerchantOrderNo}`, {
      ...paymentOrder,
      status: 'completed',
      completedAt: now.toISOString()
    });
    
    console.log('[Payment Callback] ✅ 付款處理完成');
    
    return c.json({
      success: true,
      message: 'Payment processed successfully'
    });
  } catch (error) {
    console.error('[Payment Callback] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * 生成推薦碼
 */
function generateReferralCode(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  for (let i = 0; i < 6; i++) {
    code += numbers[Math.floor(Math.random() * numbers.length)];
  }
  
  return code;
}

/**
 * 創建推薦關係（遞歸3代）
 */
async function createReferralRelationships(
  newUserId: string,
  referrerInfo: { userId: string; referralCodeId: string }
): Promise<void> {
  const referredAt = new Date().toISOString();
  
  // === 第1代：直接推薦人 ===
  const gen1Relationships = await kv.get(`referral_code:${referrerInfo.referralCodeId}:relationships`) || {
    generation1: [],
    generation2: [],
    generation3: []
  };
  
  gen1Relationships.generation1.push({
    userId: newUserId,
    referredAt,
    referralCodeUsed: referrerInfo.referralCodeId
  });
  gen1Relationships.lastUpdated = referredAt;
  
  await kv.set(`referral_code:${referrerInfo.referralCodeId}:relationships`, gen1Relationships);
  
  // 記錄被推薦人的推薦來源
  await kv.set(`user:${newUserId}:referred_by`, {
    referrerUserId: referrerInfo.userId,
    referralCodeId: referrerInfo.referralCodeId,
    referredAt
  });
  
  // 重建推薦樹
  await rebuildReferralTree(referrerInfo.userId);
  
  // 發放獎勵（第1個月）
  await issueReferralReward(referrerInfo.userId, newUserId, 1, 1, 10);
  
  // 更新任務
  await updateTaskProgress(referrerInfo.userId, newUserId);
  
  // === 第2代 & 第3代（遞歸處理）===
  // TODO: 完整實作（見 Phase 1 文檔）
}
```

---

### Phase 5: 推薦系統重構（見 Phase 1 文檔）

此階段與原文檔相同，不再重複。

---

## 6. 前端修改計畫 (Phase by Phase)

### Phase 6.1: 移除身分證字號欄位（1天）

#### 6.1.1 CompleteProfile 組件

**檔案**: `/components/CompleteProfile.tsx`

**修改點**:
```typescript
// ❌ 移除身分證相關代碼

const [formData, setFormData] = useState({
  name: '',
  phone: '',
  birthDate: '',
  // idNumber: '', ❌ 移除
  agreedToTerms: false,
});

// ❌ 移除身分證驗證邏輯
// if (!formData.idNumber.trim()) {
//   newErrors.idNumber = '請輸入身分證字號';
// }

// ❌ 移除身分證輸入欄位
// <div className="space-y-2">
//   <Label htmlFor="idNumber">身分證字號 *</Label>
//   <Input id="idNumber" ... />
// </div>
```

---

### Phase 6.2: 新增推薦碼輸入與即時驗證（2-3天）

#### 6.2.1 CompleteProfile 組件（加入推薦碼）

**檔案**: `/components/CompleteProfile.tsx`

**修改點**:
```typescript
import { Check, X, Loader2 } from 'lucide-react';

const [formData, setFormData] = useState({
  name: '',
  phone: '',
  birthDate: '',
  referralCode: '', // ✅ 新增
  agreedToTerms: false,
});

const [referralStatus, setReferralStatus] = useState<{
  checking: boolean;
  valid: boolean | null;
  referrerName: string | null;
  error: string | null;
}>({
  checking: false,
  valid: null,
  referrerName: null,
  error: null
});

// ✅ 推薦碼即時驗證
useEffect(() => {
  const verifyReferralCode = async () => {
    if (formData.referralCode.length === 9) {
      setReferralStatus({ checking: true, valid: null, referrerName: null, error: null });
      
      try {
        const result = await apiRequestJson<{
          success: boolean;
          data: {
            valid: boolean;
            referrerName?: string;
            error?: string;
          };
        }>(buildApiUrl('/auth/verify-referral-code'), {
          method: 'POST',
          body: JSON.stringify({ code: formData.referralCode })
        });
        
        if (result.success && result.data.valid) {
          setReferralStatus({
            checking: false,
            valid: true,
            referrerName: result.data.referrerName || null,
            error: null
          });
        } else {
          setReferralStatus({
            checking: false,
            valid: false,
            referrerName: null,
            error: result.data.error || '推薦碼無效'
          });
        }
      } catch (error) {
        setReferralStatus({
          checking: false,
          valid: false,
          referrerName: null,
          error: '驗證失敗'
        });
      }
    } else if (formData.referralCode.length === 0) {
      setReferralStatus({ checking: false, valid: null, referrerName: null, error: null });
    }
  };
  
  const debounce = setTimeout(verifyReferralCode, 500);
  return () => clearTimeout(debounce);
}, [formData.referralCode]);

// ✅ JSX：新增推薦碼輸入欄位
<div className="space-y-2">
  <Label htmlFor="referralCode">推薦碼（選填）</Label>
  <div className="relative">
    <Input
      id="referralCode"
      value={formData.referralCode}
      onChange={(e) => setFormData({ ...formData, referralCode: e.target.value.toLowerCase() })}
      placeholder="abc123456"
      maxLength={9}
      className={referralStatus.valid === true ? 'border-green-500' : referralStatus.valid === false ? 'border-red-500' : ''}
    />
    
    {/* 即時驗證狀態 */}
    {referralStatus.checking && (
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )}
    
    {referralStatus.valid === true && (
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <Check className="h-5 w-5 text-green-600" />
      </div>
    )}
    
    {referralStatus.valid === false && (
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <X className="h-5 w-5 text-red-600" />
      </div>
    )}
  </div>
  
  {/* 推薦人名稱顯示 */}
  {referralStatus.valid === true && referralStatus.referrerName && (
    <p className="text-sm text-green-600 flex items-center gap-1">
      <Check className="h-4 w-4" />
      推薦人：{referralStatus.referrerName}
    </p>
  )}
  
  {referralStatus.valid === false && referralStatus.error && (
    <p className="text-sm text-red-600 flex items-center gap-1">
      <X className="h-4 w-4" />
      {referralStatus.error}
    </p>
  )}
  
  <p className="text-sm text-muted-foreground">
    格式：3個小寫英文字母 + 6個數字
  </p>
</div>
```

---

### Phase 6.3: 新增付款流程頁面（2-3天）

#### 6.3.1 PaymentPage 組件

**檔案**: `/components/PaymentPage.tsx`（新增）

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
import { getAccessToken } from '../utils/auth';
import { useNotification } from './notifications/NotificationContext';

export function PaymentPage() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useNotification();

  const handlePayment = async () => {
    setIsLoading(true);

    try {
      const token = await getAccessToken();
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          orderId: string;
          amount: number;
          paymentUrl: string;
          paymentData: any;
        };
      }>(buildApiUrl('/payment/create-order'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (result.success) {
        // TODO: 跳轉到藍新金流付款頁面
        // window.location.href = result.data.paymentUrl;
        
        // 暫時模擬付款成功
        showToast('正在處理付款...', 'info');
        
        setTimeout(() => {
          navigate('/payment/success');
        }, 2000);
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">付款年費</CardTitle>
          <CardDescription>完成最後一步，開始使用 Uknow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-6 rounded-lg text-center">
            <p className="text-sm text-muted-foreground mb-2">年費金額</p>
            <p className="text-4xl font-bold text-primary">NT$ 1,200</p>
            <p className="text-sm text-muted-foreground mt-2">訂閱期限：1 年</p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>✅ 建立您的專屬刊登</p>
            <p>✅ 獲得專屬推薦碼</p>
            <p>✅ 享有推薦獎勵</p>
            <p>✅ 參與任務活動</p>
          </div>

          <Button
            onClick={handlePayment}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                處理中...
              </>
            ) : (
              '前往付款'
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            付款成功後，將自動生成您的推薦碼
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

#### 6.3.2 PaymentSuccessPage 組件

**檔案**: `/components/PaymentSuccessPage.tsx`（新增）

```typescript
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle } from 'lucide-react';

export function PaymentSuccessPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
          <CardTitle className="text-2xl">付款成功！</CardTitle>
          <CardDescription>歡迎加入 Uknow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <div className="space-y-2">
            <p className="text-muted-foreground">您的帳號已成功激活</p>
            <p className="text-muted-foreground">推薦碼已自動生成</p>
          </div>

          <Button
            onClick={() => navigate('/dashboard')}
            className="w-full"
          >
            前往會員中心
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### Phase 6.4: 修改刊登管理 UI（限制一個刊登）（1-2天）

#### 6.4.1 ServiceProviderManagement 組件

**檔案**: `/components/ServiceProviderManagement.tsx`

**修改點**:
```typescript
// ✅ 移除「我的刊登列表」概念
// ✅ 改為單一刊登的顯示/編輯

const [listing, setListing] = useState<Listing | null>(null); // 單一刊登
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  fetchListing();
}, []);

const fetchListing = async () => {
  try {
    const token = await getAccessToken();
    const result = await apiRequestJson<{
      success: boolean;
      data: { listing: Listing | null };
    }>(buildApiUrl('/listings'), {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (result.success) {
      setListing(result.data.listing);
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setIsLoading(false);
  }
};

// ✅ JSX: 單一刊登顯示
{listing ? (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle>我的刊登</CardTitle>
        <Button onClick={() => navigate(`/edit-service-provider/${listing.id}`)}>
          編輯
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      {/* 顯示刊登詳情 */}
    </CardContent>
  </Card>
) : (
  <Card>
    <CardHeader>
      <CardTitle>建立刊登</CardTitle>
      <CardDescription>您尚未建立刊登，立即開始吧！</CardDescription>
    </CardHeader>
    <CardContent>
      <Button onClick={() => navigate('/create-service-provider')}>
        建立我的刊登
      </Button>
    </CardContent>
  </Card>
)}

// ❌ 移除「新增刊登」按鈕（如果已有刊登）
```

---

## 7. 風險評估與緩解策略

### 7.1 高風險項目

| 風險 | 影響 | 機率 | 緩解策略 |
|------|------|------|----------|
| **推薦碼綁定改變導致歷史資料錯亂** | 🔴 極高 | 🟡 中 | 服務尚未上線，無歷史資料問題 ✅ |
| **限制一個刊登導致用戶困惑** | 🟡 中 | 🟢 高 | 前端清楚提示，API 返回友好錯誤 |
| **付款流程整合失敗** | 🔴 高 | 🟡 中 | 先實作模擬付款，再整合藍新金流 |
| **移除身分證導致提領驗證問題** | 🟡 中 | 🟢 低 | 提領時再要求填寫身分證 |
| **補繳邏輯計算錯誤** | 🔴 高 | 🟡 中 | 充分測試邊界條件（60天、跨年） |

### 7.2 測試策略

1. **單元測試**:
   - 推薦碼生成（唯一性、格式）
   - 推薦碼驗證（格式、狀態）
   - 補繳計算（接續原到期日）
   - 一個刊登限制（創建時檢查）

2. **整合測試**:
   - 完整註冊流程（Step 1 → Step 5）
   - 推薦關係建立（3代遞歸）
   - 付款成功後的自動化流程

3. **用戶測試**:
   - 推薦碼即時驗證體驗
   - 付款流程流暢性
   - 一個刊登限制的理解度

---

## 總結

### 核心變化

1. ✅ **移除身分證字號收集**（降低隱私風險）
2. ✅ **限制一個帳號一個刊登**（極大簡化系統）
3. ✅ **推薦碼綁定從 Listing 改為 User**（最大變化）
4. ✅ **新增4狀態帳號狀態機**（Active, Canceled, Grace, Fail）
5. ✅ **新增推薦碼即時驗證**（顯示推薦人姓名）
6. ✅ **新增付款流程**（藍新金流，$1,200）
7. ✅ **付款成功後立即建立推薦關係**

### 實施時程估計

| Phase | 內容 | 時間 |
|-------|------|------|
| Phase 1 | 移除身分證字號約束 | 1天 |
| Phase 2 | 限制一個帳號一個刊登 | 2-3天 |
| Phase 3 | 註冊流程改造（推薦碼） | 3-4天 |
| Phase 4 | 付款流程整合（藍新金流） | 3-4天 |
| Phase 5 | 推薦系統重構（狀態機） | 3-4天 |
| Phase 6 | 前端UI改造 | 4-5天 |
| **測試 & Debug** | **整合測試** | **3-4天** |
| **總計** | | **19-26天** |

### 架構優勢

**簡化後的系統**:
```
1 User = 1 Subscription = 1 Referral Code = 1 Listing
```

**優點**:
- ✅ 資料結構極度簡化
- ✅ 推薦關係清晰明確
- ✅ 訂閱管理邏輯一致
- ✅ 無需維護多個刊登的狀態同步
