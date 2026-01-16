# 訂閱架構問題分析與修正方案

**日期**: 2024-12-23  
**分析者**: 專業架構師 & UI/UX 設計師

---

## 🔴 發現的問題

### 1. **數據存儲不一致（Critical）**

#### 問題描述：
`payment.ts` 和 `subscriptions.ts` 使用了不同的數據存儲方式。

**payment.ts（行291-305）- 付款成功後創建訂閱**：
```typescript
// ❌ 錯誤：存儲到 user:${userId}:subscription（單數）
const subscription = {
  userId: userId,
  plan: 'yearly',
  startDate: createdAt,
  lastPaymentDate: createdAt,
  nextPaymentDate: nextPaymentDate.toISOString(),
  activeUntil: activeUntil.toISOString(),
  status: 'active',
  createdAt: createdAt,
  updatedAt: createdAt
};

await kv.set(`user:${userId}:subscription`, subscription);
```

**subscriptions.ts（行62）- 獲取訂閱狀態**：
```typescript
// ✅ 正確：從 account_status 獲取 currentSubscriptionId
const accountStatus = await kv.get(`user:${userId}:account_status`);
const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
```

**問題**：
- ❌ `payment.ts` 存儲到 `user:${userId}:subscription`
- ✅ `subscriptions.ts` 從 `subscription:${subscriptionId}` 讀取
- ❌ `payment.ts` 沒有創建 `account_status` 記錄
- ❌ 數據格式不一致

---

### 2. **缺少訂閱 ID（Critical）**

**NEW_SPEC_ARCHITECTURE_ANALYSIS.md（行503-524）定義**：
```typescript
interface Subscription {
  id: string;                      // ❌ payment.ts 缺少
  userId: string;
  status: 'Active' | 'Canceled' | 'Expired' | 'Grace';
  startDate: string;
  endDate: string;                 // ❌ payment.ts 使用 activeUntil
  gracePeriodEnd: string;          // ❌ payment.ts 缺少
  amount: number;                  // ❌ payment.ts 缺少
  paymentMethod: string;           // ❌ payment.ts 缺少
  paymentTransactionId: string;    // ❌ payment.ts 缺少
  isCanceled: boolean;             // ❌ payment.ts 缺少
  canceledAt: string | null;
  isRenewal: boolean;              // ❌ payment.ts 缺少
  createdAt: string;
  updatedAt: string;
}
```

**payment.ts 實際創建的結構**：
```typescript
{
  userId: string;
  plan: 'yearly';                  // ✅ 多餘字段
  startDate: string;
  lastPaymentDate: string;         // ✅ 多餘字段
  nextPaymentDate: string;         // ✅ 多餘字段
  activeUntil: string;             // ❌ 應為 endDate
  status: 'active';
  createdAt: string;
  updatedAt: string;
}
```

---

### 3. **缺少 Account Status 表（Critical）**

**NEW_SPEC_ARCHITECTURE_ANALYSIS.md（行481-491）定義**：
```typescript
// Key: user:${userId}:account_status
interface UserAccountStatus {
  status: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  currentSubscriptionId: string | null;
  activeReferralCodeId: string | null;
  activeListingId: string | null;
  pointBalance: number;
  lastStatusUpdate: string;
  lastSubscriptionEndDate: string | null;
  gracePeriodEndDate: string | null;
}
```

**問題**：
- ❌ `payment.ts` 沒有創建 `account_status`
- ❌ `subscriptions.ts` 依賴 `account_status.currentSubscriptionId`，但該值從未被設置
- ❌ 這導致會員中心無法獲取訂閱狀態（返回「刊登資料不存在」錯誤）

---

### 4. **前端顯示需求缺失**

**用戶需求**：
- ✅ 本週期起訖日：`startDate` - `endDate`
- ✅ 下週期起訖日：`endDate + 1天` - `endDate + 1年`（僅 active 狀態）
- ✅ 下次扣款日期：`endDate + 1天`（僅 active 狀態）
- ✅ 狀態：active, cancelled, grace, expired

**目前 subscriptions.ts 返回的數據**：
```typescript
{
  status, message, activeUntil, nextPaymentDate, 
  lastPaymentDate, daysRemaining, canRenew, 
  canMakeup, isCancelled, cancelledAt
}
```

**缺少**：
- ❌ `startDate`（本期開始日）
- ❌ `endDate`（本期結束日）
- ❌ 下期起訖日的計算

---

## ✅ 修正方案

### 修正 1：統一訂閱數據結構

**修正 `payment.ts` 的訂閱創建邏輯（行265-305）**：

```typescript
// ===== 計算訂閱日期 =====
const now = new Date();
const createdAt = now.toISOString();

// 開始日期：當天
const startDate = new Date(now);
startDate.setHours(0, 0, 0, 0);

// 結束日期：一年後的前一天 23:59:59
const endDate = new Date(startDate);
endDate.setFullYear(endDate.getFullYear() + 1);
endDate.setDate(endDate.getDate() - 1);
endDate.setHours(23, 59, 59, 999);

// 寬限期結束日期：結束日期 + 60天
const gracePeriodEnd = new Date(endDate);
gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 60);
gracePeriodEnd.setHours(23, 59, 59, 999);

// ✅ 生成訂閱 ID
const subscriptionId = `subscription_${Date.now()}_${Math.random().toString(36).substring(7)}`;

// ✅ 創建訂閱記錄（符合新規格）
const subscription = {
  id: subscriptionId,
  userId: userId,
  status: 'Active',  // 使用首字母大寫（符合規格）
  startDate: startDate.toISOString(),
  endDate: endDate.toISOString(),
  gracePeriodEnd: gracePeriodEnd.toISOString(),
  amount: YEARLY_PRICE,  // 1200
  paymentMethod: 'newebpay',  // 或 'simulated'
  paymentTransactionId: tradeNo,
  newebpayTradeNo: tradeNo,
  isCanceled: false,
  canceledAt: null,
  isRenewal: false,
  createdAt: createdAt,
  updatedAt: createdAt
};

// ✅ 存儲到正確的鍵
await kv.set(`subscription:${subscriptionId}`, subscription);

// ✅ 添加到用戶的訂閱列表
const userSubscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
userSubscriptions.unshift(subscriptionId);  // 最新的在前面
await kv.set(`user:${userId}:subscriptions`, userSubscriptions);

// ✅ 創建/更新用戶帳號狀態
const accountStatus = {
  status: 'Active',
  currentSubscriptionId: subscriptionId,
  activeReferralCodeId: null,  // 稍後設置
  activeListingId: null,  // 用戶創建刊登時設置
  pointBalance: 0,
  lastStatusUpdate: createdAt,
  lastSubscriptionEndDate: endDate.toISOString(),
  gracePeriodEndDate: null  // 僅在 Grace 狀態時有值
};

await kv.set(`user:${userId}:account_status`, accountStatus);

console.log(`[Process Payment] ✅ 訂閱資訊創建成功: ${subscriptionId}`);
```

---

### 修正 2：修正 subscriptions.ts 的狀態計算

**修正 `calculateSubscriptionStatus()` 函數（行392-457）**：

```typescript
function calculateSubscriptionStatus(subscription: any) {
  const now = new Date();
  const endDate = new Date(subscription.endDate);  // ✅ 使用 endDate
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  let status: SubscriptionStatus;
  let message: string;
  let canRenew: boolean;
  let canMakeup: boolean;
  
  // ✅ 計算下期起訖日（僅 active 狀態）
  let nextPeriodStart: string | null = null;
  let nextPeriodEnd: string | null = null;
  let nextPaymentDate: string | null = null;
  
  // 1. 檢查是否已取消
  if (subscription.canceledAt) {
    if (daysRemaining > 0) {
      // 已取消但仍在有效期內
      status = SubscriptionStatus.CANCELLED;
      message = `訂閱已取消，將在 ${subscription.endDate} 到期`;
      canRenew = true;
      canMakeup = false;
    } else {
      // 已取消且已到期
      status = SubscriptionStatus.EXPIRED;
      message = '訂閱已失效（已取消並到期）';
      canRenew = false;
      canMakeup = false;
    }
  } else {
    // 2. 檢查是否在有效期內
    if (daysRemaining > 0) {
      // 訂閱中
      status = SubscriptionStatus.ACTIVE;
      message = `訂閱有效，剩餘 ${daysRemaining} 天`;
      canRenew = true;
      canMakeup = false;
      
      // ✅ 計算下期起訖日
      const nextStart = new Date(endDate);
      nextStart.setDate(nextStart.getDate() + 1);
      nextStart.setHours(0, 0, 0, 0);
      
      const nextEnd = new Date(nextStart);
      nextEnd.setFullYear(nextEnd.getFullYear() + 1);
      nextEnd.setDate(nextEnd.getDate() - 1);
      nextEnd.setHours(23, 59, 59, 999);
      
      nextPeriodStart = nextStart.toISOString();
      nextPeriodEnd = nextEnd.toISOString();
      nextPaymentDate = nextStart.toISOString();
    } else {
      // 已過期
      const daysOverdue = Math.abs(daysRemaining);
      const gracePeriodEnd = new Date(subscription.gracePeriodEnd);
      
      if (now <= gracePeriodEnd) {
        // 即將失效（寬限期內）
        status = SubscriptionStatus.GRACE;
        message = `訂閱已逾期 ${daysOverdue} 天，可補繳恢復`;
        canRenew = false;
        canMakeup = true;
      } else {
        // 永久失效（超過寬限期）
        status = SubscriptionStatus.EXPIRED;
        message = `訂閱已永久失效（逾期超過 ${GRACE_PERIOD_DAYS} 天）`;
        canRenew = false;
        canMakeup = false;
      }
    }
  }
  
  return {
    status,
    message,
    // ✅ 本期起訖日
    currentPeriodStart: subscription.startDate,
    currentPeriodEnd: subscription.endDate,
    // ✅ 下期起訖日（僅 active 狀態）
    nextPeriodStart,
    nextPeriodEnd,
    nextPaymentDate,
    // 其他信息
    daysRemaining,
    canRenew,
    canMakeup,
    isCancelled: !!subscription.canceledAt,
    cancelledAt: subscription.canceledAt || null
  };
}
```

---

### 修正 3：前端顯示邏輯

**會員中心訂閱狀態卡片**：

```typescript
{subscriptionData?.currentPeriodStart && subscriptionData?.currentPeriodEnd && (
  <div className="space-y-2 text-sm">
    {/* 本週期 */}
    <div className="flex items-start gap-2">
      <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <p className="font-medium text-foreground">本週期</p>
        <p className="text-muted-foreground">
          {formatDate(subscriptionData.currentPeriodStart)} - {formatDate(subscriptionData.currentPeriodEnd)}
        </p>
      </div>
    </div>
    
    {/* 下週期（僅 active 狀態顯示）*/}
    {subscriptionData.status === 'active' && subscriptionData.nextPeriodStart && subscriptionData.nextPeriodEnd && (
      <div className="flex items-start gap-2">
        <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="font-medium text-foreground">下週期</p>
          <p className="text-muted-foreground">
            {formatDate(subscriptionData.nextPeriodStart)} - {formatDate(subscriptionData.nextPeriodEnd)}
          </p>
        </div>
      </div>
    )}
    
    {/* 下次扣款日（僅 active 狀態顯示）*/}
    {subscriptionData.status === 'active' && subscriptionData.nextPaymentDate && (
      <div className="flex items-start gap-2">
        <CreditCard className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="font-medium text-foreground">下次扣款日</p>
          <p className="text-muted-foreground">
            {formatDate(subscriptionData.nextPaymentDate)}
          </p>
        </div>
      </div>
    )}
    
    {/* 剩餘天數 */}
    {subscriptionData.daysRemaining > 0 && (
      <div className="text-muted-foreground">
        剩餘 {subscriptionData.daysRemaining} 天
      </div>
    )}
  </div>
)}
```

---

## 📊 數據架構總結

### 正確的數據流：

```
1. 用戶付款成功
   ↓
2. 創建訂閱記錄
   - Key: subscription:${subscriptionId}
   - 包含: id, userId, status, startDate, endDate, gracePeriodEnd, etc.
   ↓
3. 創建帳號狀態記錄
   - Key: user:${userId}:account_status
   - 包含: status, currentSubscriptionId, pointBalance, etc.
   ↓
4. 添加到用戶訂閱列表
   - Key: user:${userId}:subscriptions
   - Value: [subscriptionId1, subscriptionId2, ...]
   ↓
5. 前端獲取訂閱狀態
   - 從 account_status 獲取 currentSubscriptionId
   - 從 subscription:${subscriptionId} 獲取訂閱詳情
   - 計算並返回完整信息
```

---

## ✅ 需要修改的文件清單

1. **`/supabase/functions/server/payment.ts`**
   - 修正訂閱創建邏輯（行265-320）
   - 使用正確的數據結構和鍵名

2. **`/supabase/functions/server/subscriptions.ts`**
   - 修正 `calculateSubscriptionStatus()` 函數
   - 添加下期起訖日和下次扣款日的計算

3. **`/components/MemberDashboard.tsx`**
   - 更新前端顯示邏輯
   - 添加本週期、下週期、下次扣款日的顯示

4. **`/utils/dateFormatter.ts`** (新建)
   - 創建統一的日期格式化工具
   - 格式：YYYY/MM/DD

---

## 🎯 實施優先級

**P0（立即修正）**：
1. ✅ 修正 `payment.ts` 的訂閱創建邏輯
2. ✅ 創建 `account_status` 記錄
3. ✅ 使用正確的鍵名存儲訂閱

**P1（同步修正）**：
4. ✅ 修正 `subscriptions.ts` 的狀態計算
5. ✅ 添加下期起訖日計算

**P2（UI 優化）**：
6. ✅ 更新前端顯示邏輯
7. ✅ 創建日期格式化工具

---

## ⚠️ 向後兼容性

**現有用戶的處理**：
- 如果用戶已有 `user:${userId}:subscription` 記錄，需要遷移腳本
- 遷移腳本應：
  1. 讀取舊的訂閱記錄
  2. 生成新的 `subscriptionId`
  3. 創建新的 `subscription:${subscriptionId}` 記錄
  4. 創建 `account_status` 記錄
  5. 刪除舊的 `user:${userId}:subscription` 記錄

**或者（簡單方案）**：
- 在 `subscriptions.ts` 中添加回退邏輯
- 如果 `account_status` 不存在，嘗試從舊的 `user:${userId}:subscription` 讀取
- 自動遷移並創建新的結構

---

## 📝 總結

目前的問題主要是：
1. **數據存儲不一致**：使用了不同的鍵名和數據結構
2. **缺少關鍵字段**：訂閱 ID、寬限期結束日、帳號狀態表
3. **前端顯示不完整**：缺少本週期、下週期、下次扣款日

修正後將實現：
- ✅ 統一的數據架構（符合規格文檔）
- ✅ 完整的訂閱信息顯示
- ✅ 正確的狀態管理（Active, Canceled, Grace, Fail）
- ✅ 清晰的日期顯示（本期、下期、扣款日）
