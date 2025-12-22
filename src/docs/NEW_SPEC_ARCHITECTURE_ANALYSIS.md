# Uknow 新規格架構分析與實施計畫

**日期**: 2024-12-22  
**版本**: v2.0  
**作者**: 系統架構師

---

## 📋 目錄

1. [核心變更分析](#1-核心變更分析)
2. [現有系統 vs 新規格對比](#2-現有系統-vs-新規格對比)
3. [資料架構設計](#3-資料架構設計)
4. [後端修改計畫](#4-後端修改計畫-phase-by-phase)
5. [前端修改計畫](#5-前端修改計畫-phase-by-phase)
6. [風險評估與緩解策略](#6-風險評估與緩解策略)

---

## 1. 核心變更分析

### 1.1 架構層面的根本性變化

#### ⭐ **最大變化：推薦碼綁定對象變更**

| 項目 | 現有系統 | 新規格 | 影響範圍 |
|------|----------|--------|----------|
| **綁定對象** | Listing（刊登） | User（會員） | 🔴 **極高** |
| **推薦碼數量** | 一個用戶多個刊登 = 多個推薦碼 | 一個用戶一個推薦碼 | 🔴 **極高** |
| **推薦樹存儲** | `listing:${listingId}:referral_tree` | `user:${userId}:referral_tree` | 🔴 **極高** |
| **失效處理** | 刊登失效 = 推薦碼失效 | 用戶失效 = 推薦碼失效，生成新碼 | 🔴 **極高** |

**架構影響**:
- ✅ **簡化系統複雜度**（一個用戶只需維護一個推薦關係）
- ✅ **符合業務邏輯**（推薦的是「人」而非「刊登」）
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
       │              │ Canceled │ ──60天後──► ┌──────┐
       │              │ (已取消)  │              │ Fail │
       │              └──────────┘              │(永久) │
       │                                        └───▲──┘
       └─逾期未繳────► ┌──────────┐                 │
                       │  Grace   │ ─補繳─► Active  │
                       │(即將失效) │                 │
                       └────┬─────┘                 │
                            │                       │
                            └──>60天────────────────┘
```

**狀態轉換規則**:

| 從狀態 | 到狀態 | 觸發條件 | 系統動作 |
|--------|--------|----------|----------|
| Active | Canceled | 用戶手動取消 | 標記取消，到期日不變 |
| Active | Grace | 逾期0-60天 | 隱藏刊登，鎖定提領功能，保留推薦功能 |
| Canceled | Fail | 到期 | 推薦碼 Fail，點數歸零，任務歸零 |
| Grace | Fail | 逾期>60天 | 推薦碼 Fail，點數歸零，任務歸零 |
| Grace | Active | 60天內補繳 | 恢復顯示，周期接續原到期日 |
| Fail | Active | 重新訂閱 | 生成新推薦碼，一切重新計算 |

---

### 1.2 訂閱系統變化

| 項目 | 現有系統 | 新規格 | 備註 |
|------|----------|--------|------|
| **訂閱綁定** | Listing | User | 用戶級別年費 |
| **補繳機制** | ❌ 無 | ✅ 60天內補繳 | 周期接續原到期日 |
| **新訂閱** | ❌ 不明確 | ✅ >60天或 Fail 後 | 周期從付款日重新計算 |
| **續約通知** | ❌ 無 | ✅ 到期前5日每日Email | 防止意外失效 |

---

### 1.3 註冊流程變化

| 步驟 | 現有系統 | 新規格 | 變化 |
|------|----------|--------|------|
| Step 0 | ❌ 無 | ✅ Email 檢核 | 新增 |
| Step 1 | Email + 密碼 | Email + 密碼 + Email 驗證 | 相同 |
| Step 2 | 基本資料 | 新增推薦碼即時驗證 | 🔴 變化 |
| Step 3 | 付款 | 付款 + **立即更新推薦人組織圖/任務/獎勵** | 🔴 變化 |

**Step 2 新增欄位**:
- 推薦碼即時驗證：輸入後 API 查詢並顯示推薦人「當下真實姓名」

**Step 3 完成後立即觸發**:
1. 更新推薦人的組織圖
2. 更新推薦人的任務進度
3. 發放推薦人的獎勵（第1個月）

---

### 1.4 組織圖持久性

| 項目 | 現有系統 | 新規格 |
|------|----------|--------|
| **失效節點** | 可能被刪除 | ✅ 保留（標記 Inactive） |
| **姓名顯示** | 可能缓存舊名稱 | ✅ 通過 User ID 查詢最新姓名 |
| **下線關係** | 不明確 | ✅ 即使上線失效，下線不斷開 |

---

## 2. 現有系統 vs 新規格對比

### 2.1 資料綁定關係

#### **現有系統**:
```
User (會員)
  ├── Listing A (推薦碼: abc123456)
  │     └── Referral Tree A
  ├── Listing B (推薦碼: def789012)
  │     └── Referral Tree B
  └── Subscription A (綁定到 Listing A)
      Subscription B (綁定到 Listing B)
```

**問題**:
- ❌ 一個用戶多個推薦碼，組織結構複雜
- ❌ 訂閱綁定到刊登，不符合年費邏輯
- ❌ 刊登失效 = 推薦碼失效，但用戶可能還有其他刊登

---

#### **新規格**:
```
User (會員)
  ├── Account Status (Active/Canceled/Grace/Fail)
  ├── Subscription (年費 $1,200)
  │     └── 訂閱週期 (startDate → endDate)
  ├── Referral Code (唯一，abc123456)
  │     └── Referral Tree (3代推薦)
  └── Listings (一個刊登)
        ├── Listing (跟隨用戶狀態)
```

**優勢**:
- ✅ 一個用戶一個推薦碼，結構清晰
- ✅ 訂閱綁定到用戶，符合年費邏輯
- ✅ 刊登跟隨用戶狀態，邏輯一致

---

### 2.2 API 端點變化

| 功能 | 現有 API | 新 API | 變化 |
|------|----------|--------|------|
| 註冊 | `/auth/register` | `/auth/signup/step0-3` | 🔴 拆分為4步驟 |
| 推薦碼驗證 | ❌ 無 | `/auth/verify-referral-code` | 🟢 新增 |
| 獲取訂閱 | `/subscriptions` | `/user/subscription` | 🔴 改為用戶級別 |
| 推薦樹 | `/referrals/my-tree` | `/user/referral-tree` | 🔴 綁定到用戶 |
| 帳號狀態 | ❌ 無 | `/user/account-status` | 🟢 新增 |
| 補繳訂閱 | ❌ 無 | `/user/subscription/renew` | 🟢 新增 |

---

## 3. 資料架構設計

### 3.1 設計原則

1. **SSOT (Single Source of Truth)**:
   - 用戶狀態: `user:${userId}:account_status`
   - 推薦碼: `user:${userId}:active_referral_code`
   - 推薦關係: `referral_code:${codeId}:relationships`

2. **No Data Redundancy**:
   - 避免在多處存儲相同資料
   - 使用引用 (ID) 而非複製完整對象

3. **Performance Optimization**:
   - 推薦樹預計算緩存
   - 用戶狀態緩存
   - 索引鍵快速查找

4. **Idempotency (冪等性)**:
   - Cron job 檢查最後處理時間
   - 使用訂閱 ID + 狀態時間戳防止重複

---

### 3.2 KV Store 表格設計

#### **Table 1: User Profile（用戶基本資料）**

```typescript
// Key: user:${userId}:profile
interface UserProfile {
  id: string;
  email: string;             // 唯一性
  realName: string;          // 可修改，需同步到所有顯示處
  birthDate: string;         // YYYY-MM-DD
  phone: string;
  bankCode: string;
  bankAccount: string;
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
}
```

**索引鍵**:
- `id_number:${idNumber}` → `userId` (唯一性檢核)
- `email:${email}` → `userId` (Email 檢核)

---

#### **Table 2: User Account Status（用戶帳號狀態）- SSOT**

```typescript
// Key: user:${userId}:account_status
interface UserAccountStatus {
  status: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  currentSubscriptionId: string | null;    // 當前有效訂閱 ID
  activeReferralCodeId: string | null;     // 當前有效推薦碼 ID
  pointBalance: number;                    // 點數餘額
  lastStatusUpdate: string;                // 最後狀態更新時間
  lastSubscriptionEndDate: string | null;  // 最後訂閱結束日期
  gracePeriodEndDate: string | null;       // 寬限期結束日期（僅 Grace 狀態）
}
```

**狀態轉換 Hooks**:
- `Active → Canceled`: 設置 `isCanceled = true`，到期日不變
- `Active/Canceled → Grace`: `gracePeriodEndDate = endDate + 60天`
- `Grace → Fail`: `pointBalance = 0`, `activeReferralCodeId = null`
- `Fail → Active`: 生成新推薦碼，重置所有計數

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

**推薦關係建立流程** (Step 3 付款成功後):
```typescript
1. 獲取推薦人的 activeReferralCode
2. 在 referral_code:${codeId}:relationships 中添加到 generation1
3. 遞歸查找推薦人的 referred_by，添加到 generation2
4. 再次遞歸，添加到 generation3
5. 更新所有涉及用戶的 referral_tree 緩存
6. 發放獎勵（第1個月）
```

---

#### **Table 6: Referral Tree（推薦樹）- Cached**

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

#### **Table 7: Listings（刊登）- 移除推薦碼**

```typescript
// Key: listing:${listingId}
interface Listing {
  id: string;
  userId: string;              // ✅ 所屬用戶
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

// Key: user:${userId}:listings
// Value: string[] (listing IDs)
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

---

### 3.3 索引鍵設計

| 索引鍵 | 目的 | 值 |
|--------|------|-----|
| `email:${email}` | Email 唯一性檢核 | `userId` |
| `id_number:${idNumber}` | 身分證唯一性檢核 | `userId` |
| `code:${code}` | 推薦碼快速查找 | `referralCodeId` |
| `payment:${transactionId}` | 防止重複付款 | `subscriptionId` |

---

## 4. 後端修改計畫 (Phase by Phase)

### Phase 1: 基礎架構準備（2-3天）

#### 4.1.1 資料結構定義

**檔案**: `/supabase/functions/server/types.ts`（新增）

```typescript
// User Types
export interface UserProfile {
  id: string;
  email: string;
  realName: string;
  idNumber: string;
  birthDate: string;
  phone: string;
  bankCode: string;
  bankAccount: string;
  createdAt: string;
  updatedAt: string;
}

export type AccountStatus = 'Active' | 'Canceled' | 'Grace' | 'Fail';

export interface UserAccountStatus {
  status: AccountStatus;
  currentSubscriptionId: string | null;
  activeReferralCodeId: string | null;
  pointBalance: number;
  lastStatusUpdate: string;
  lastSubscriptionEndDate: string | null;
  gracePeriodEndDate: string | null;
}

// Subscription Types
export type SubscriptionStatus = 'Active' | 'Canceled' | 'Expired' | 'Grace';

export interface Subscription {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  gracePeriodEnd: string;
  amount: number;
  paymentMethod: string;
  paymentTransactionId: string;
  isCanceled: boolean;
  canceledAt: string | null;
  isRenewal: boolean;
  createdAt: string;
  updatedAt: string;
}

// Referral Code Types
export type ReferralCodeStatus = 'Active' | 'Inactive' | 'Fail';

export interface ReferralCode {
  id: string;
  userId: string;
  code: string;
  status: ReferralCodeStatus;
  isActive: boolean;
  activatedAt: string;
  inactivatedAt: string | null;
  subscriptionId: string;
  createdAt: string;
}

// Referral Relationship Types
export interface ReferralRelationship {
  userId: string;
  referredAt: string;
  referralCodeUsed: string;
}

export interface ReferralRelationships {
  generation1: ReferralRelationship[];
  generation2: ReferralRelationship[];
  generation3: ReferralRelationship[];
  lastUpdated: string;
}

// Listing Types (簡化)
export interface Listing {
  id: string;
  userId: string;
  publicListingId: string;
  name: string;
  category: string;
  city: string;
  // ... 其他欄位
  activeUntil: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

#### 4.1.2 工具函數

**檔案**: `/supabase/functions/server/utils/referralCode.ts`（新增）

```typescript
/**
 * 生成推薦碼: 3小寫英文 + 6數字
 */
export function generateReferralCode(): string {
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
 * 驗證推薦碼格式
 */
export function validateReferralCode(code: string): boolean {
  const pattern = /^[a-z]{3}\d{6}$/;
  return pattern.test(code);
}
```

**檔案**: `/supabase/functions/server/utils/accountStatus.ts`（新增）

```typescript
import * as kv from '../kv_store.tsx';
import { UserAccountStatus, AccountStatus } from '../types.ts';

/**
 * 計算帳號狀態
 */
export async function calculateAccountStatus(
  userId: string
): Promise<AccountStatus> {
  const subscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
  
  if (subscriptions.length === 0) {
    return 'Fail'; // 從未訂閱
  }
  
  // 獲取最新訂閱
  const latestSubId = subscriptions[0];
  const subscription = await kv.get(`subscription:${latestSubId}`);
  
  if (!subscription) {
    return 'Fail';
  }
  
  const today = new Date().toISOString().split('T')[0];
  const endDate = subscription.endDate.split('T')[0];
  const gracePeriodEnd = subscription.gracePeriodEnd.split('T')[0];
  
  if (subscription.status === 'Canceled') {
    if (endDate >= today) {
      return 'Canceled'; // 已取消但仍在有效期內
    } else {
      return 'Fail'; // 取消後到期
    }
  }
  
  if (endDate >= today) {
    return 'Active'; // 訂閱中
  } else if (gracePeriodEnd >= today) {
    return 'Grace'; // 即將失效 (0-60天)
  } else {
    return 'Fail'; // 永久失效 (>60天)
  }
}

/**
 * 同步用戶帳號狀態
 */
export async function syncAccountStatus(userId: string): Promise<void> {
  const newStatus = await calculateAccountStatus(userId);
  const currentStatus = await kv.get(`user:${userId}:account_status`);
  
  if (!currentStatus || currentStatus.status !== newStatus) {
    // 狀態變化，執行轉換 Hooks
    await handleStatusTransition(
      userId,
      currentStatus?.status || 'Fail',
      newStatus
    );
    
    // 更新狀態
    await kv.set(`user:${userId}:account_status`, {
      ...currentStatus,
      status: newStatus,
      lastStatusUpdate: new Date().toISOString()
    });
  }
}

/**
 * 處理狀態轉換
 */
async function handleStatusTransition(
  userId: string,
  oldStatus: AccountStatus,
  newStatus: AccountStatus
): Promise<void> {
  console.log(`[狀態轉換] ${userId}: ${oldStatus} → ${newStatus}`);
  
  if (newStatus === 'Fail' && oldStatus !== 'Fail') {
    // 進入永久失效狀態
    await handleEnterFailStatus(userId);
  }
  
  if (newStatus === 'Active' && oldStatus === 'Fail') {
    // 從失效恢復（重新訂閱）
    await handleRecoverFromFailStatus(userId);
  }
}

/**
 * 處理進入 Fail 狀態
 */
async function handleEnterFailStatus(userId: string): Promise<void> {
  // 1. 推薦碼標記為 Fail
  const activeCodeId = await kv.get(`user:${userId}:active_referral_code`);
  if (activeCodeId) {
    const code = await kv.get(`referral_code:${activeCodeId}`);
    await kv.set(`referral_code:${activeCodeId}`, {
      ...code,
      status: 'Fail',
      isActive: false,
      inactivatedAt: new Date().toISOString()
    });
    await kv.set(`user:${userId}:active_referral_code`, null);
  }
  
  // 2. 點數歸零
  const accountStatus = await kv.get(`user:${userId}:account_status`);
  await kv.set(`user:${userId}:account_status`, {
    ...accountStatus,
    pointBalance: 0
  });
  
  // 3. 任務歸零
  await kv.set(`user:${userId}:task_progress`, {
    consecutiveReferral: { count: 0, lastReferredAt: null },
    monthlyKing: { monthlyReferrals: {}, totalReferrals: 0 }
  });
  
  // 4. 更新所有推薦人的推薦樹（標記為 Inactive）
  await updateReferrersTree(userId);
}

/**
 * 處理從 Fail 恢復（重新訂閱）
 */
async function handleRecoverFromFailStatus(userId: string): Promise<void> {
  // 生成新推薦碼會在訂閱創建時處理
  // 這裡只需要重置任務
  await kv.set(`user:${userId}:task_progress`, {
    consecutiveReferral: { count: 0, lastReferredAt: null },
    monthlyKing: { monthlyReferrals: {}, totalReferrals: 0 }
  });
}

/**
 * 更新推薦人的推薦樹
 */
async function updateReferrersTree(userId: string): Promise<void> {
  const referredBy = await kv.get(`user:${userId}:referred_by`);
  if (!referredBy) return;
  
  // 更新直接推薦人
  await rebuildReferralTree(referredBy.referrerUserId);
  
  // 遞歸更新上級推薦人
  const referredBy2 = await kv.get(`user:${referredBy.referrerUserId}:referred_by`);
  if (referredBy2) {
    await rebuildReferralTree(referredBy2.referrerUserId);
    
    const referredBy3 = await kv.get(`user:${referredBy2.referrerUserId}:referred_by`);
    if (referredBy3) {
      await rebuildReferralTree(referredBy3.referrerUserId);
    }
  }
}

/**
 * 重建推薦樹
 */
async function rebuildReferralTree(userId: string): Promise<void> {
  // 獲取用戶的活躍推薦碼
  const activeCodeId = await kv.get(`user:${userId}:active_referral_code`);
  if (!activeCodeId) return;
  
  const relationships = await kv.get(`referral_code:${activeCodeId}:relationships`) || {
    generation1: [],
    generation2: [],
    generation3: []
  };
  
  // 為每一代添加用戶詳細信息
  const buildGeneration = async (generation: any[]) => {
    return Promise.all(generation.map(async (rel) => {
      const profile = await kv.get(`user:${rel.userId}:profile`);
      const accountStatus = await kv.get(`user:${rel.userId}:account_status`);
      const activeCode = await kv.get(`user:${rel.userId}:active_referral_code`);
      
      return {
        userId: rel.userId,
        userName: profile?.realName || '未知',
        accountStatus: accountStatus?.status || 'Fail',
        referredAt: rel.referredAt,
        activeReferralCodeId: activeCode
      };
    }));
  };
  
  const tree = {
    firstGeneration: await buildGeneration(relationships.generation1),
    secondGeneration: await buildGeneration(relationships.generation2),
    thirdGeneration: await buildGeneration(relationships.generation3),
    lastUpdated: new Date().toISOString()
  };
  
  await kv.set(`user:${userId}:referral_tree`, tree);
}
```

---

#### 4.1.3 Cron Job: 每日狀態同步

**檔案**: `/supabase/functions/server/cron_status_sync.ts`（新增）

```typescript
import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { syncAccountStatus } from './utils/accountStatus.ts';

const cronStatusSync = new Hono();

/**
 * POST /cron/sync-account-status
 * 每日同步所有用戶帳號狀態
 */
cronStatusSync.post('/sync-account-status', async (c) => {
  try {
    console.log('========== 開始同步帳號狀態 ==========');
    
    // 獲取所有用戶
    const userKeys = await kv.getByPrefix('user:');
    const userIds = userKeys
      .filter(key => key.endsWith(':profile'))
      .map(key => key.split(':')[1]);
    
    console.log(`找到 ${userIds.length} 個用戶`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const userId of userIds) {
      try {
        await syncAccountStatus(userId);
        successCount++;
      } catch (error) {
        console.error(`同步用戶 ${userId} 失敗:`, error);
        failCount++;
      }
    }
    
    console.log(`========== 同步完成: 成功=${successCount}, 失敗=${failCount} ==========`);
    
    return c.json({
      success: true,
      data: {
        totalUsers: userIds.length,
        successCount,
        failCount
      }
    });
  } catch (error) {
    console.error('========== 同步失敗 ==========', error);
    return c.json({
      success: false,
      error: { message: error.message }
    }, 500);
  }
});

export default cronStatusSync;
```

**設定 GitHub Actions** (每日凌晨 2:00 執行):

檔案: `/workflows/daily-status-sync.yml`（新增）

```yaml
name: Daily Account Status Sync

on:
  schedule:
    - cron: '0 18 * * *' # UTC 18:00 = 台北 02:00
  workflow_dispatch: # 允許手動觸發

jobs:
  sync-status:
    runs-on: ubuntu-latest
    steps:
      - name: Sync Account Status
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            https://${{ secrets.SUPABASE_PROJECT_ID }}.supabase.co/functions/v1/make-server-5c6718b9/cron/sync-account-status
```

---

### Phase 2: 註冊流程改造（3-4天）

#### 4.2.1 Step 0: Email 檢核

**檔案**: `/supabase/functions/server/auth_v2.ts`（修改）

```typescript
/**
 * POST /auth-v2/check-email
 * 檢查 Email 是否已註冊
 */
authV2.post('/check-email', async (c) => {
  try {
    const { email } = await c.req.json();
    
    if (!email) {
      return c.json({
        success: false,
        error: { message: 'Email 是必填欄位' }
      }, 400);
    }
    
    // 檢查 Email 索引
    const existingUserId = await kv.get(`email:${email}`);
    
    if (existingUserId) {
      return c.json({
        success: true,
        data: {
          exists: true,
          message: '此 Email 已被註冊，請直接登入或使用其他 Email'
        }
      });
    }
    
    return c.json({
      success: true,
      data: {
        exists: false,
        message: 'Email 可以使用'
      }
    });
  } catch (error) {
    console.error('[Check Email] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});
```

---

#### 4.2.2 Step 2: 資料完善（新增身分證檢核）

**檔案**: `/supabase/functions/server/auth_v2.ts`（修改）

```typescript
/**
 * POST /auth-v2/signup/step2
 * 資料完善
 */
authV2.post('/signup/step2', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({
        success: false,
        error: { message: 'Invalid token' }
      }, 401);
    }
    
    const { realName, idNumber, birthDate, phone, referralCode } = await c.req.json();
    
    // ✅ 驗證必填欄位
    if (!realName || !idNumber || !birthDate || !phone) {
      return c.json({
        success: false,
        error: { message: '真實姓名、身分證字號、出生日期和手機號碼都是必填欄位' }
      }, 400);
    }
    
    // ✅ 驗證身分證格式
    const idNumberPattern = /^[A-Z][12]\d{8}$/;
    if (!idNumberPattern.test(idNumber)) {
      return c.json({
        success: false,
        error: { message: '身分證字號格式不正確' }
      }, 400);
    }
    
    // ✅ 檢查身分證唯一性
    const existingUserId = await kv.get(`id_number:${idNumber}`);
    if (existingUserId && existingUserId !== user.id) {
      return c.json({
        success: false,
        error: { message: '此身分證字號已被註冊' }
      }, 400);
    }
    
    // ✅ 驗證年齡 >= 18
    const birthDateObj = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = today.getMonth() - birthDateObj.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
      age--;
    }
    if (age < 18) {
      return c.json({
        success: false,
        error: { message: '註冊用戶需年滿 18 歲' }
      }, 400);
    }
    
    // ✅ 驗證推薦碼（如果提供）
    let referrerInfo = null;
    if (referralCode) {
      const codeId = await kv.get(`code:${referralCode}`);
      if (!codeId) {
        return c.json({
          success: false,
          error: { message: '推薦碼不存在' }
        }, 400);
      }
      
      const code = await kv.get(`referral_code:${codeId}`);
      if (code.status === 'Fail') {
        return c.json({
          success: false,
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
    
    // ✅ 儲存用戶資料
    await kv.set(`user:${user.id}:profile`, {
      id: user.id,
      email: user.email,
      realName,
      idNumber,
      birthDate,
      phone,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // ✅ 建立索引
    await kv.set(`email:${user.email}`, user.id);
    await kv.set(`id_number:${idNumber}`, user.id);
    
    // ✅ 暫存推薦碼（Step 3 付款後才建立關係）
    if (referrerInfo) {
      await kv.set(`user:${user.id}:pending_referral`, referrerInfo);
    }
    
    return c.json({
      success: true,
      data: {
        message: '資料填寫完成',
        referrerName: referrerInfo?.userName || null,
        nextStep: 3
      }
    });
  } catch (error) {
    console.error('[Step 2] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});
```

---

#### 4.2.3 推薦碼即時驗證 API

**檔案**: `/supabase/functions/server/auth_v2.ts`（新增）

```typescript
/**
 * POST /auth-v2/verify-referral-code
 * 驗證推薦碼並返回推薦人姓名
 */
authV2.post('/verify-referral-code', async (c) => {
  try {
    const { code } = await c.req.json();
    
    if (!code) {
      return c.json({
        success: false,
        error: { message: '推薦碼是必填欄位' }
      }, 400);
    }
    
    // 驗證格式
    if (!validateReferralCode(code)) {
      return c.json({
        success: false,
        error: { message: '推薦碼格式不正確（應為3個小寫英文字母+6個數字）' }
      }, 400);
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
});
```

---

#### 4.2.4 Step 3: 付款與激活（核心邏輯）

**檔案**: `/supabase/functions/server/auth_v2.ts`（修改）

```typescript
/**
 * POST /auth-v2/signup/step3
 * 處理付款並激活帳號
 */
authV2.post('/signup/step3', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({
        success: false,
        error: { message: 'Invalid token' }
      }, 401);
    }
    
    const { paymentTransactionId } = await c.req.json();
    
    if (!paymentTransactionId) {
      return c.json({
        success: false,
        error: { message: '缺少支付交易ID' }
      }, 400);
    }
    
    // TODO: 驗證藍新金流付款
    console.log('[Step 3] Payment verification (mock):', paymentTransactionId);
    
    // ========== 開始交易 ==========
    
    const now = new Date();
    const startDate = now.toISOString();
    const endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
    const gracePeriodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate() + 60).toISOString();
    
    // 1. 創建訂閱
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await kv.set(`subscription:${subscriptionId}`, {
      id: subscriptionId,
      userId: user.id,
      status: 'Active',
      startDate,
      endDate,
      gracePeriodEnd,
      amount: 1200,
      paymentMethod: 'newebpay',
      paymentTransactionId,
      isCanceled: false,
      canceledAt: null,
      isRenewal: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    
    // 2. 更新用戶訂閱列表
    const subscriptions = await kv.get(`user:${user.id}:subscriptions`) || [];
    await kv.set(`user:${user.id}:subscriptions`, [subscriptionId, ...subscriptions]);
    
    // 3. 生成推薦碼
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
      userId: user.id,
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
    const referralCodes = await kv.get(`user:${user.id}:referral_codes`) || [];
    await kv.set(`user:${user.id}:referral_codes`, [referralCodeId, ...referralCodes]);
    await kv.set(`user:${user.id}:active_referral_code`, referralCodeId);
    
    // 4. 更新帳號狀態
    await kv.set(`user:${user.id}:account_status`, {
      status: 'Active',
      currentSubscriptionId: subscriptionId,
      activeReferralCodeId: referralCodeId,
      pointBalance: 0,
      lastStatusUpdate: now.toISOString(),
      lastSubscriptionEndDate: endDate,
      gracePeriodEndDate: null
    });
    
    // 5. 處理推薦關係（如果有推薦碼）
    const pendingReferral = await kv.get(`user:${user.id}:pending_referral`);
    if (pendingReferral) {
      await createReferralRelationships(user.id, pendingReferral);
      await kv.del(`user:${user.id}:pending_referral`);
    }
    
    console.log('[Step 3] ✅ 註冊完成');
    
    return c.json({
      success: true,
      data: {
        message: '註冊完成！歡迎加入 Uknow',
        referralCode: newReferralCode,
        accountStatus: 'Active'
      }
    });
  } catch (error) {
    console.error('[Step 3] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * 創建推薦關係（遞歸3代）
 */
async function createReferralRelationships(
  newUserId: string,
  referrerInfo: { userId: string; referralCodeId: string }
): Promise<void> {
  const referredAt = new Date().toISOString();
  
  // === 第1代：直接推薦人 ===
  
  // 1.1 添加到推薦關係
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
  
  // 1.2 記錄被推薦人的推薦來源
  await kv.set(`user:${newUserId}:referred_by`, {
    referrerUserId: referrerInfo.userId,
    referralCodeId: referrerInfo.referralCodeId,
    referredAt
  });
  
  // 1.3 重建推薦樹
  await rebuildReferralTree(referrerInfo.userId);
  
  // 1.4 發放獎勵（第1個月）
  await issueReferralReward(referrerInfo.userId, newUserId, 1, 1, 10);
  
  // 1.5 更新任務
  await updateTaskProgress(referrerInfo.userId, newUserId);
  
  // === 第2代：推薦人的推薦人 ===
  
  const gen1ReferredBy = await kv.get(`user:${referrerInfo.userId}:referred_by`);
  if (gen1ReferredBy) {
    const gen2Relationships = await kv.get(`referral_code:${gen1ReferredBy.referralCodeId}:relationships`) || {
      generation1: [],
      generation2: [],
      generation3: []
    };
    
    gen2Relationships.generation2.push({
      userId: newUserId,
      referredAt,
      referralCodeUsed: referrerInfo.referralCodeId
    });
    gen2Relationships.lastUpdated = referredAt;
    
    await kv.set(`referral_code:${gen1ReferredBy.referralCodeId}:relationships`, gen2Relationships);
    await rebuildReferralTree(gen1ReferredBy.referrerUserId);
    await issueReferralReward(gen1ReferredBy.referrerUserId, newUserId, 2, 1, 5);
    
    // === 第3代：推薦人的推薦人的推薦人 ===
    
    const gen2ReferredBy = await kv.get(`user:${gen1ReferredBy.referrerUserId}:referred_by`);
    if (gen2ReferredBy) {
      const gen3Relationships = await kv.get(`referral_code:${gen2ReferredBy.referralCodeId}:relationships`) || {
        generation1: [],
        generation2: [],
        generation3: []
      };
      
      gen3Relationships.generation3.push({
        userId: newUserId,
        referredAt,
        referralCodeUsed: referrerInfo.referralCodeId
      });
      gen3Relationships.lastUpdated = referredAt;
      
      await kv.set(`referral_code:${gen2ReferredBy.referralCodeId}:relationships`, gen3Relationships);
      await rebuildReferralTree(gen2ReferredBy.referrerUserId);
      await issueReferralReward(gen2ReferredBy.referrerUserId, newUserId, 3, 1, 2);
    }
  }
}

/**
 * 發放推薦獎勵
 */
async function issueReferralReward(
  userId: string,
  refereeId: string,
  generation: number,
  month: number,
  amount: number
): Promise<void> {
  // 更新點數餘額
  const accountStatus = await kv.get(`user:${userId}:account_status`);
  await kv.set(`user:${userId}:account_status`, {
    ...accountStatus,
    pointBalance: accountStatus.pointBalance + amount
  });
  
  // 記錄獎勵歷史
  const refereeProfile = await kv.get(`user:${refereeId}:profile`);
  const history = await kv.get(`user:${userId}:reward_history`) || [];
  
  history.unshift({
    id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: `referral_gen${generation}_month${month}`,
    amount,
    referee: {
      userId: refereeId,
      userName: refereeProfile.realName
    },
    generation,
    monthNumber: month,
    issuedAt: new Date().toISOString(),
    description: `推薦獎勵 - ${refereeProfile.realName}（第${generation}代）- 第${month}個月`
  });
  
  await kv.set(`user:${userId}:reward_history`, history);
  
  // TODO: 創建後續11個月的獎勵排程
}

/**
 * 更新任務進度
 */
async function updateTaskProgress(userId: string, refereeId: string): Promise<void> {
  const taskProgress = await kv.get(`user:${userId}:task_progress`) || {
    consecutiveReferral: { count: 0, lastReferredAt: null },
    monthlyKing: { monthlyReferrals: {}, totalReferrals: 0 }
  };
  
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // 更新連續推薦達人
  const lastDate = taskProgress.consecutiveReferral.lastReferredAt;
  const isConsecutive = lastDate && 
    new Date(lastDate).getMonth() === now.getMonth() - 1;
  
  taskProgress.consecutiveReferral = {
    count: isConsecutive ? taskProgress.consecutiveReferral.count + 1 : 1,
    lastReferredAt: now.toISOString()
  };
  
  // 更新推薦王
  if (!taskProgress.monthlyKing.monthlyReferrals[currentMonth]) {
    taskProgress.monthlyKing.monthlyReferrals[currentMonth] = [];
  }
  taskProgress.monthlyKing.monthlyReferrals[currentMonth].push({
    userId: refereeId,
    referredAt: now.toISOString()
  });
  taskProgress.monthlyKing.totalReferrals++;
  
  await kv.set(`user:${userId}:task_progress`, taskProgress);
}
```

---

### Phase 3: 訂閱系統重構（2-3天）

#### 4.3.1 獲取訂閱狀態

**檔案**: `/supabase/functions/server/user.ts`（新增）

```typescript
import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';

const user = new Hono();

/**
 * GET /user/subscription
 * 獲取用戶訂閱狀態
 */
user.get('/subscription', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user: authUser, error: authError } = await verifyToken(token);
    
    if (authError || !authUser) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const accountStatus = await kv.get(`user:${authUser.id}:account_status`);
    
    if (!accountStatus || !accountStatus.currentSubscriptionId) {
      return c.json({
        success: true,
        data: {
          hasSubscription: false,
          status: 'Fail',
          message: '尚未訂閱'
        }
      });
    }
    
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    return c.json({
      success: true,
      data: {
        hasSubscription: true,
        status: accountStatus.status,
        subscription: {
          id: subscription.id,
          startDate: subscription.startDate.split('T')[0],
          endDate: subscription.endDate.split('T')[0],
          gracePeriodEnd: subscription.gracePeriodEnd.split('T')[0],
          isCanceled: subscription.isCanceled,
          canceledAt: subscription.canceledAt
        }
      }
    });
  } catch (error) {
    console.error('[Get Subscription] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

export default user;
```

---

#### 4.3.2 取消訂閱

**檔案**: `/supabase/functions/server/user.ts`（新增）

```typescript
/**
 * POST /user/subscription/cancel
 * 取消訂閱（狀態轉為 Canceled，到期後轉 Fail）
 */
user.post('/subscription/cancel', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user: authUser, error: authError } = await verifyToken(token);
    
    if (authError || !authUser) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const accountStatus = await kv.get(`user:${authUser.id}:account_status`);
    
    if (!accountStatus || accountStatus.status !== 'Active') {
      return c.json({
        success: false,
        error: { message: '無法取消：帳號狀態不是訂閱中' }
      }, 400);
    }
    
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    // 更新訂閱狀態
    await kv.set(`subscription:${subscription.id}`, {
      ...subscription,
      status: 'Canceled',
      isCanceled: true,
      canceledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // 更新帳號狀態
    await kv.set(`user:${authUser.id}:account_status`, {
      ...accountStatus,
      status: 'Canceled',
      lastStatusUpdate: new Date().toISOString()
    });
    
    return c.json({
      success: true,
      data: {
        message: '訂閱已取消，權益將持續到到期日',
        endDate: subscription.endDate.split('T')[0]
      }
    });
  } catch (error) {
    console.error('[Cancel Subscription] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});
```

---

#### 4.3.3 補繳訂閱（Grace → Active）

**檔案**: `/supabase/functions/server/user.ts`（新增）

```typescript
/**
 * POST /user/subscription/renew
 * 補繳訂閱（60天內，周期接續原到期日）
 */
user.post('/subscription/renew', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user: authUser, error: authError } = await verifyToken(token);
    
    if (authError || !authUser) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const { paymentTransactionId } = await c.req.json();
    
    if (!paymentTransactionId) {
      return c.json({
        success: false,
        error: { message: '缺少支付交易ID' }
      }, 400);
    }
    
    const accountStatus = await kv.get(`user:${authUser.id}:account_status`);
    
    if (!accountStatus || accountStatus.status !== 'Grace') {
      return c.json({
        success: false,
        error: { message: '無法補繳：帳號不在即將失效狀態' }
      }, 400);
    }
    
    // 檢查是否在60天寬限期內
    const gracePeriodEnd = new Date(accountStatus.gracePeriodEndDate);
    const today = new Date();
    
    if (today > gracePeriodEnd) {
      return c.json({
        success: false,
        error: { message: '已超過補繳期限（60天），請重新訂閱' }
      }, 400);
    }
    
    // TODO: 驗證藍新金流付款
    console.log('[Renew] Payment verification (mock):', paymentTransactionId);
    
    // 計算新的訂閱周期（接續原到期日）
    const oldEndDate = new Date(accountStatus.lastSubscriptionEndDate);
    const newEndDate = new Date(oldEndDate);
    newEndDate.setFullYear(newEndDate.getFullYear() + 1);
    
    const newGracePeriodEnd = new Date(newEndDate);
    newGracePeriodEnd.setDate(newGracePeriodEnd.getDate() + 60);
    
    // 創建新訂閱
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await kv.set(`subscription:${subscriptionId}`, {
      id: subscriptionId,
      userId: authUser.id,
      status: 'Active',
      startDate: oldEndDate.toISOString(), // ✅ 接續原到期日
      endDate: newEndDate.toISOString(),
      gracePeriodEnd: newGracePeriodEnd.toISOString(),
      amount: 1200,
      paymentMethod: 'newebpay',
      paymentTransactionId,
      isCanceled: false,
      canceledAt: null,
      isRenewal: true, // ✅ 標記為補繳
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // 更新用戶訂閱列表
    const subscriptions = await kv.get(`user:${authUser.id}:subscriptions`) || [];
    await kv.set(`user:${authUser.id}:subscriptions`, [subscriptionId, ...subscriptions]);
    
    // 更新帳號狀態
    await kv.set(`user:${authUser.id}:account_status`, {
      ...accountStatus,
      status: 'Active',
      currentSubscriptionId: subscriptionId,
      lastStatusUpdate: new Date().toISOString(),
      lastSubscriptionEndDate: newEndDate.toISOString(),
      gracePeriodEndDate: null
    });
    
    // 恢復推薦碼狀態
    if (accountStatus.activeReferralCodeId) {
      const code = await kv.get(`referral_code:${accountStatus.activeReferralCodeId}`);
      await kv.set(`referral_code:${accountStatus.activeReferralCodeId}`, {
        ...code,
        status: 'Active',
        isActive: true
      });
    }
    
    return c.json({
      success: true,
      data: {
        message: '補繳成功！訂閱已恢復',
        endDate: newEndDate.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('[Renew Subscription] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});
```

---

### Phase 4: 推薦系統重構（3-4天）

#### 4.4.1 獲取推薦樹（改為用戶級別）

**檔案**: `/supabase/functions/server/user.ts`（新增）

```typescript
/**
 * GET /user/referral-tree
 * 獲取用戶的推薦樹
 */
user.get('/referral-tree', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user: authUser, error: authError } = await verifyToken(token);
    
    if (authError || !authUser) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    // 獲取推薦樹緩存
    const tree = await kv.get(`user:${authUser.id}:referral_tree`) || {
      firstGeneration: [],
      secondGeneration: [],
      thirdGeneration: [],
      lastUpdated: new Date().toISOString()
    };
    
    // 計算統計
    const summary = {
      totalReferrals: tree.firstGeneration.length + tree.secondGeneration.length + tree.thirdGeneration.length,
      firstGenCount: tree.firstGeneration.length,
      secondGenCount: tree.secondGeneration.length,
      thirdGenCount: tree.thirdGeneration.length,
      activeCount: [
        ...tree.firstGeneration,
        ...tree.secondGeneration,
        ...tree.thirdGeneration
      ].filter(r => r.accountStatus === 'Active' || r.accountStatus === 'Canceled').length
    };
    
    return c.json({
      success: true,
      data: {
        tree,
        summary
      }
    });
  } catch (error) {
    console.error('[Get Referral Tree] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});
```

---

### Phase 5: 前端重構計畫（見下一節）

---

## 5. 前端修改計畫 (Phase by Phase)

### Phase 5.1: 註冊流程UI改造（2-3天）

#### 5.1.1 Step 0: Email 檢核頁面

**檔案**: `/components/signup/EmailCheckStep.tsx`（新增）

```typescript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';

export function EmailCheckStep() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          exists: boolean;
          message: string;
        };
      }>(buildApiUrl('/auth-v2/check-email'), {
        method: 'POST',
        body: JSON.stringify({ email })
      });

      if (result.success) {
        if (result.data.exists) {
          showToast('此 Email 已被註冊，請直接登入', 'warning');
          navigate('/login', { state: { email } });
        } else {
          showToast('Email 可以使用', 'success');
          navigate('/signup/step1', { state: { email } });
        }
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>註冊 Uknow 帳號</CardTitle>
          <CardDescription>請先輸入您的 Email 地址</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email 地址</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? '檢查中...' : '繼續'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

#### 5.1.2 Step 2: 資料完善（新增身分證 + 推薦碼即時驗證）

**檔案**: `/components/signup/ProfileStep.tsx`（修改）

```typescript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import { Check, X, Loader2 } from 'lucide-react';

export function ProfileStep({ token, onComplete }: { token: string; onComplete: () => void }) {
  const [formData, setFormData] = useState({
    realName: '',
    idNumber: '',
    birthDate: '',
    phone: '',
    referralCode: ''
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
  
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useNotification();

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
          }>(buildApiUrl('/auth-v2/verify-referral-code'), {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await apiRequestJson<{
        success: boolean;
        data?: {
          message: string;
          referrerName: string | null;
          nextStep: number;
        };
        error?: { message: string };
      }>(buildApiUrl('/auth-v2/signup/step2'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (result.success) {
        showToast('資料填寫完成', 'success');
        onComplete();
      } else {
        showToast(result.error?.message || '儲存失敗', 'error');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>資料完善</CardTitle>
        <CardDescription>請填寫您的個人資料</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 真實姓名 */}
          <div>
            <Label htmlFor="realName">真實姓名 *</Label>
            <Input
              id="realName"
              value={formData.realName}
              onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
              required
            />
            <p className="text-sm text-muted-foreground mt-1">
              用於提領驗證，修改後將同步到所有顯示處
            </p>
          </div>

          {/* 身分證字號 */}
          <div>
            <Label htmlFor="idNumber">身分證字號 *</Label>
            <Input
              id="idNumber"
              value={formData.idNumber}
              onChange={(e) => setFormData({ ...formData, idNumber: e.target.value.toUpperCase() })}
              placeholder="A123456789"
              maxLength={10}
              required
            />
            <p className="text-sm text-muted-foreground mt-1">
              格式：1個大寫英文字母 + 9個數字
            </p>
          </div>

          {/* 出生日期 */}
          <div>
            <Label htmlFor="birthDate">出生日期 *</Label>
            <Input
              id="birthDate"
              type="date"
              value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
              required
            />
            <p className="text-sm text-muted-foreground mt-1">
              限制 18 歲以上
            </p>
          </div>

          {/* 手機號碼 */}
          <div>
            <Label htmlFor="phone">手機號碼 *</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0912345678"
              maxLength={10}
              required
            />
          </div>

          {/* 推薦碼（選填） */}
          <div>
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
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                <Check className="h-4 w-4" />
                推薦人：{referralStatus.referrerName}
              </p>
            )}
            
            {referralStatus.valid === false && referralStatus.error && (
              <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                <X className="h-4 w-4" />
                {referralStatus.error}
              </p>
            )}
            
            <p className="text-sm text-muted-foreground mt-1">
              格式：3個小寫英文字母 + 6個數字
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '儲存中...' : '儲存並繼續'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

---

### Phase 5.2: 會員中心UI改造（2-3天）

#### 5.2.1 帳號狀態顯示

**檔案**: `/components/dashboard/AccountStatusCard.tsx`（新增）

```typescript
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

type AccountStatus = 'Active' | 'Canceled' | 'Grace' | 'Fail';

interface AccountStatusCardProps {
  status: AccountStatus;
  subscription: {
    endDate: string;
    gracePeriodEnd?: string;
  } | null;
  onRenew?: () => void;
  onCancel?: () => void;
}

export function AccountStatusCard({ status, subscription, onRenew, onCancel }: AccountStatusCardProps) {
  const statusConfig = {
    Active: {
      icon: <CheckCircle className="h-5 w-5 text-green-600" />,
      badge: <Badge className="bg-green-600 text-white">訂閱中</Badge>,
      description: '您的帳號運作正常，可以正常使用所有功能。',
      color: 'border-green-200 bg-green-50'
    },
    Canceled: {
      icon: <Clock className="h-5 w-5 text-orange-600" />,
      badge: <Badge className="bg-orange-600 text-white">已取消</Badge>,
      description: '訂閱已取消，權益將持續到到期日。',
      color: 'border-orange-200 bg-orange-50'
    },
    Grace: {
      icon: <AlertCircle className="h-5 w-5 text-yellow-600" />,
      badge: <Badge className="bg-yellow-600 text-white">即將失效</Badge>,
      description: '訂閱已逾期，刊登已隱藏。請於60天內補繳以恢復權益。',
      color: 'border-yellow-200 bg-yellow-50'
    },
    Fail: {
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      badge: <Badge className="bg-red-600 text-white">永久失效</Badge>,
      description: '帳號已失效，推薦碼已作廢，點數已歸零。請重新訂閱以恢復使用。',
      color: 'border-red-200 bg-red-50'
    }
  };

  const config = statusConfig[status];

  return (
    <Card className={`${config.color} border-2`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {config.icon}
            <CardTitle>帳號狀態</CardTitle>
          </div>
          {config.badge}
        </div>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {subscription && (
          <div className="text-sm space-y-1">
            <p>訂閱到期日：<span className="font-medium">{subscription.endDate}</span></p>
            {status === 'Grace' && subscription.gracePeriodEnd && (
              <p className="text-yellow-600">
                補繳期限：<span className="font-medium">{subscription.gracePeriodEnd}</span>
              </p>
            )}
          </div>
        )}
        
        <div className="flex gap-2">
          {status === 'Grace' && onRenew && (
            <Button onClick={onRenew} className="flex-1 bg-green-600 hover:bg-green-700">
              立即補繳
            </Button>
          )}
          
          {status === 'Fail' && onRenew && (
            <Button onClick={onRenew} className="flex-1 bg-blue-600 hover:bg-blue-700">
              重新訂閱
            </Button>
          )}
          
          {status === 'Active' && onCancel && (
            <Button onClick={onCancel} variant="outline" className="flex-1">
              取消訂閱
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

#### 5.2.2 推薦樹顯示（改為用戶級別）

**檔案**: `/components/referral/ReferralTreeView.tsx`（修改）

```typescript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface ReferralMember {
  userId: string;
  userName: string;
  accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  referredAt: string;
  activeReferralCodeId: string | null;
}

interface ReferralTree {
  firstGeneration: ReferralMember[];
  secondGeneration: ReferralMember[];
  thirdGeneration: ReferralMember[];
  lastUpdated: string;
}

export function ReferralTreeView() {
  const [tree, setTree] = useState<ReferralTree | null>(null);
  const [summary, setSummary] = useState({
    totalReferrals: 0,
    firstGenCount: 0,
    secondGenCount: 0,
    thirdGenCount: 0,
    activeCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [expandedGen, setExpandedGen] = useState<number[]>([1]); // 預設展開第1代

  useEffect(() => {
    fetchReferralTree();
  }, []);

  const fetchReferralTree = async () => {
    try {
      const token = await getAccessToken();
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          tree: ReferralTree;
          summary: typeof summary;
        };
      }>(buildApiUrl('/user/referral-tree'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (result.success) {
        setTree(result.data.tree);
        setSummary(result.data.summary);
      }
    } catch (error) {
      console.error('獲取推薦樹失敗:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGeneration = (gen: number) => {
    setExpandedGen(prev =>
      prev.includes(gen) ? prev.filter(g => g !== gen) : [...prev, gen]
    );
  };

  const renderMember = (member: ReferralMember, generation: number) => {
    const statusColors = {
      Active: 'bg-green-600 text-white',
      Canceled: 'bg-orange-600 text-white',
      Grace: 'bg-yellow-600 text-white',
      Fail: 'bg-red-600 text-white'
    };
    
    const statusLabels = {
      Active: '訂閱中',
      Canceled: '已取消',
      Grace: '即將失效',
      Fail: '永久失效'
    };

    return (
      <Card key={member.userId} className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{member.userName}</p>
            <p className="text-sm text-muted-foreground truncate">
              {new Date(member.referredAt).toLocaleDateString()}
            </p>
          </div>
          
          <Badge className={`${statusColors[member.accountStatus]} text-xs ml-2 shrink-0`}>
            {statusLabels[member.accountStatus]}
          </Badge>
        </div>
      </Card>
    );
  };

  const renderGeneration = (
    members: ReferralMember[],
    generation: number,
    label: string,
    badgeColor: string
  ) => {
    const isExpanded = expandedGen.includes(generation);

    return (
      <div>
        <Button
          variant="ghost"
          className="w-full justify-between p-3 h-auto"
          onClick={() => toggleGeneration(generation)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">{label}</span>
            <Badge className={badgeColor}>{members.length}</Badge>
          </div>
        </Button>

        {isExpanded && (
          <div className="mt-2 space-y-2 pl-4">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                尚無{label}推薦
              </p>
            ) : (
              members.map(member => renderMember(member, generation))
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">載入中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 統計摘要 */}
      <Card>
        <CardHeader>
          <CardTitle>推薦統計</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{summary.totalReferrals}</p>
              <p className="text-sm text-muted-foreground">總推薦數</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{summary.activeCount}</p>
              <p className="text-sm text-muted-foreground">活躍會員</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{summary.firstGenCount}</p>
              <p className="text-sm text-muted-foreground">第1代</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{summary.secondGenCount}</p>
              <p className="text-sm text-muted-foreground">第2代</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{summary.thirdGenCount}</p>
              <p className="text-sm text-muted-foreground">第3代</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 推薦樹 */}
      <Card>
        <CardHeader>
          <CardTitle>我的推薦組織</CardTitle>
          <CardDescription>
            最後更新：{tree ? new Date(tree.lastUpdated).toLocaleString() : '-'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderGeneration(tree?.firstGeneration || [], 1, '第1代', 'bg-green-600 text-white')}
          {renderGeneration(tree?.secondGeneration || [], 2, '第2代', 'bg-purple-600 text-white')}
          {renderGeneration(tree?.thirdGeneration || [], 3, '第3代', 'bg-orange-600 text-white')}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 6. 風險評估與緩解策略

### 6.1 高風險項目

| 風險 | 影響 | 機率 | 緩解策略 |
|------|------|------|----------|
| **推薦碼綁定改變導致歷史資料錯亂** | 🔴 極高 | 🟡 中 | 分階段遷移，保留舊資料作為備份 |
| **狀態機邏輯複雜導致 Bug** | 🔴 高 | 🟢 高 | 詳細的單元測試，狀態轉換表驗證 |
| **補繳邏輯計算錯誤** | 🔴 高 | 🟡 中 | 充分測試邊界條件（60天、跨年） |
| **推薦關係遞歸深度過深** | 🟡 中 | 🟢 低 | 限制3代，時間複雜度 O(1) |
| **身分證唯一性檢核漏洞** | 🔴 高 | 🟢 低 | 雙重驗證（格式+唯一性） |

### 6.2 測試策略

1. **單元測試**:
   - 推薦碼生成（唯一性、格式）
   - 狀態機轉換（所有路徑）
   - 補繳計算（接續原到期日）
   - 推薦關係建立（3代遞歸）

2. **整合測試**:
   - 完整註冊流程（Step 0 → Step 3）
   - 狀態轉換流程（Active → Grace → Fail）
   - 補繳流程（Grace → Active）
   - 重新訂閱流程（Fail → Active）

3. **壓力測試**:
   - Cron job 處理大量用戶
   - 推薦樹重建效能
   - 並發付款請求

---

## 總結

### 核心變化

1. **推薦碼綁定從 Listing 改為 User**（最大變化）
2. **新增4狀態帳號狀態機**（Active, Canceled, Grace, Fail）
3. **訂閱綁定從 Listing 改為 User**
4. **新增身分證字號唯一性檢核**
5. **推薦碼即時驗證與推薦人姓名顯示**
6. **補繳機制：60天內，周期接續原到期日**

### 實施時程估計

| Phase | 內容 | 時間 |
|-------|------|------|
| Phase 1 | 基礎架構準備 | 2-3天 |
| Phase 2 | 註冊流程改造 | 3-4天 |
| Phase 3 | 訂閱系統重構 | 2-3天 |
| Phase 4 | 推薦系統重構 | 3-4天 |
| Phase 5 | 前端UI改造 | 4-5天 |
| **測試 & Debug** | **整合測試** | **3-4天** |
| **總計** | | **17-23天** |

### 下一步行動

1. ✅ **確認新規格細節**（與 PM 對齊）
2. ✅ **審查本架構文檔**（技術團隊 Review）
3. ⏳ **開始 Phase 1 實施**（資料結構定義）

---

**✅ 文檔完成，等待實施指示！**
