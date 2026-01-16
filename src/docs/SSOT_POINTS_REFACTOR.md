# SSOT 點數架構重構文檔

**重構日期**: 2024-12-24  
**重構原因**: 消除數據重複，確保 SSOT (Single Source of Truth) 原則  
**影響範圍**: 點數管理系統

---

## 🚨 問題背景

### 發現的問題

在現有系統中，用戶點數存在**兩個數據源**：

```json
// 位置 1: account_status
{
  "key": "user:${userId}:account_status",
  "value": {
    "pointBalance": 40000  // ❌ 重複數據
  }
}

// 位置 2: rewards
{
  "key": "user:${userId}:rewards",
  "value": {
    "availableRewards": 40000,  // ❌ 重複數據
    "pendingRewards": 0,
    "withdrawnRewards": 0,
    "totalEarned": 40000
  }
}
```

### 違反 SSOT 的風險

| 風險 | 說明 | 影響 |
|------|------|------|
| **數據不一致** | 更新時只修改一邊 | 用戶看到不同的點數 |
| **維護困難** | 每次更新要記得兩邊 | 容易遺漏，產生 Bug |
| **查詢混亂** | 不知道信任哪個數據 | 邏輯混亂 |
| **併發問題** | 同時更新可能衝突 | 數據損壞 |

### 實際案例

**場景：發放獎勵時（cron.ts）**
```typescript
// ✅ 兩邊都更新
accountStatus.pointBalance += amount;
rewards.availableRewards += amount;
```

**場景：提領時（rewards.ts）**
```typescript
// ✅ 只更新 rewards
rewards.availableRewards -= totalRequired;
rewards.pendingRewards += totalRequired;

// ❌ 但沒有更新 account_status.pointBalance！
// → 數據不一致！
```

---

## ✅ 解決方案

### 採用方案：移除 `pointBalance`（SSOT）

**原則：`user:${userId}:rewards` 是點數的唯一真理來源**

#### 為什麼選擇 `rewards` 而非 `account_status`？

| 特性 | `rewards` | `account_status` |
|------|-----------|------------------|
| **詳細分類** | ✅ 可提領/處理中/已提領 | ❌ 只有總數 |
| **功能定位** | ✅ 專門管理點數 | ❌ 管理帳號狀態 |
| **擴展性** | ✅ 易於新增統計 | ❌ 混雜其他欄位 |
| **維護性** | ✅ 職責單一 | ❌ 職責混合 |

---

## 📋 修改清單

### 1. TypeScript 定義修改

**文件**: `/supabase/functions/server/types.ts`

```typescript
export interface AccountStatus {
  status: AccountStatusType;
  currentSubscriptionId: string | null;
  activeReferralCodeId: string | null;
  activeListingId: string | null;
  // ❌ 移除：pointBalance: number;
  lastStatusUpdate: string;
  lastSubscriptionEndDate: string | null;
  gracePeriodEndDate: string | null;
}
```

**原因**: 
- 移除重複欄位定義
- 明確 `account_status` 只管理帳號狀態，不管理點數

---

### 2. Cron 定時任務修改

**文件**: `/supabase/functions/server/cron.ts`

#### **修改 1: `issueScheduledReward` 函數**

```typescript
async function issueScheduledReward(schedule: any) {
  const { userId, amount, referee, referrer, generation, monthNumber } = schedule;
  
  // ❌ 移除：不再更新 account_status.pointBalance
  // const accountStatusKey = `user:${userId}:account_status`;
  // const accountStatus = await kv.get(accountStatusKey);
  // accountStatus.pointBalance = (accountStatus.pointBalance || 0) + amount;
  // await kv.set(accountStatusKey, accountStatus);
  
  // ✅ 保留：只更新 rewards（SSOT）
  const rewardsKey = `user:${userId}:rewards`;
  const rewards = await kv.get(rewardsKey) || {
    availableRewards: 0,
    pendingRewards: 0,
    withdrawnRewards: 0,
    totalEarned: 0
  };
  
  rewards.availableRewards += amount;
  rewards.totalEarned += amount;
  rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
  
  await kv.set(rewardsKey, rewards);
  
  console.log(`✅ 獎勵統計已更新: 可提領=${rewards.availableRewards}P, 總累積=${rewards.totalEarned}P`);
}
```

**影響**: 
- 每月定時發放獎勵時，只更新 `rewards`
- 移除重複更新邏輯

---

### 3. Payment 付款處理修改

**文件**: `/supabase/functions/server/payment.ts`

#### **修改 1: `processPaymentCallback` - 初始化帳號狀態**

```typescript
// ✅ 創建用戶帳號狀態
const accountStatus = {
  status: 'Active',
  currentSubscriptionId: subscriptionId,
  activeReferralCodeId: null,
  activeListingId: null,
  // ❌ 移除：pointBalance: 0,
  lastStatusUpdate: createdAt,
  lastSubscriptionEndDate: endDate.toISOString(),
  gracePeriodEndDate: null
};

await kv.set(`user:${userId}:account_status`, accountStatus);
```

**影響**: 
- 付款成功後初始化帳號狀態時，不再設置 `pointBalance`

---

#### **修改 2: `issueImmediateReward` - 發放首月獎勵**

```typescript
async function issueImmediateReward(
  receiverUserId: string,
  refereeUserId: string,
  refereeName: string,
  refereeCode: string,
  generation: number,
  monthNumber: number,
  amount: number
) {
  console.log(`💰 發放首月獎勵: 用戶=${receiverUserId}, 第${generation}代, ${amount}P`);
  
  try {
    // ❌ 移除：不再更新 account_status.pointBalance
    // const accountStatusKey = `user:${receiverUserId}:account_status`;
    // const accountStatus = await kv.get(accountStatusKey);
    // accountStatus.pointBalance = (accountStatus.pointBalance || 0) + amount;
    // await kv.set(accountStatusKey, accountStatus);
    
    // ✅ 保留：只更新 rewards（SSOT）
    const rewardsKey = `user:${receiverUserId}:rewards`;
    const rewards = await kv.get(rewardsKey) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0
    };
    
    rewards.availableRewards += amount;
    rewards.totalEarned += amount;
    rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
    
    await kv.set(rewardsKey, rewards);
    
    console.log(`✅ 獎勵統計已更新: 可提領=${rewards.availableRewards}P, 總累積=${rewards.totalEarned}P`);
    
    // ... 記錄獎勵歷史 ...
  } catch (error) {
    console.error(`❌ 發放獎勵失敗: ${error.message}`);
    throw error;
  }
}
```

**影響**: 
- 首月獎勵發放時，只更新 `rewards`
- 移除重複更新邏輯

---

## 📊 修改前後對照

### 修改前（違反 SSOT）

```
發放獎勵流程：
┌─────────────────────┐
│ 獲取 account_status │
│ pointBalance += 10  │ ← 更新 1
│ 保存 account_status │
└─────────────────────┘
          ↓
┌─────────────────────┐
│ 獲取 rewards        │
│ availableRewards+=10│ ← 更新 2
│ 保存 rewards        │
└─────────────────────┘

❌ 問題：兩個地方都要更新
❌ 風險：容易遺漏其中一個
```

### 修改後（符合 SSOT）

```
發放獎勵流程：
┌─────────────────────┐
│ 獲取 rewards        │
│ availableRewards+=10│ ← 唯一更新點
│ 保存 rewards        │
└─────────────────────┘

✅ 優點：只有一個更新點
✅ 優點：不會產生不一致
```

---

## 🎯 SSOT 架構設計

### 點數查詢的唯一來源

```typescript
// ✅ 正確：從 rewards 查詢
const rewards = await kv.get(`user:${userId}:rewards`);
const totalPoints = rewards.availableRewards + rewards.pendingRewards;
```

```typescript
// ❌ 錯誤：從 account_status 查詢
const accountStatus = await kv.get(`user:${userId}:account_status`);
const totalPoints = accountStatus.pointBalance; // ← 已移除此欄位
```

### 點數更新的唯一方法

**所有點數變動都必須通過 `rewards` 進行：**

| 操作 | 更新方法 |
|------|----------|
| 發放獎勵 | `rewards.availableRewards += amount` |
| 提領申請 | `rewards.availableRewards -= amount`<br>`rewards.pendingRewards += amount` |
| 確認查收 | `rewards.pendingRewards -= amount`<br>`rewards.withdrawnRewards += amount` |
| 任務獎勵 | `rewards.availableRewards += amount` |

---

## ✅ 驗證清單

### 代碼檢查

- [x] 移除 `types.ts` 中的 `pointBalance` 定義
- [x] 移除 `cron.ts` 中更新 `pointBalance` 的代碼（1處）
- [x] 移除 `payment.ts` 中初始化 `pointBalance` 的代碼（1處）
- [x] 移除 `payment.ts` 中更新 `pointBalance` 的代碼（1處）
- [x] 確認 `rewards.ts` 不讀取或寫入 `pointBalance`

### 功能驗證

- [ ] 測試：付款成功後點數正確（應為 0）
- [ ] 測試：推薦獎勵發放後點數增加（應只更新 rewards）
- [ ] 測試：定時獎勵發放後點數增加（應只更新 rewards）
- [ ] 測試：提領後點數正確扣除（應只更新 rewards）
- [ ] 測試：確認查收後點數狀態正確（應只更新 rewards）

### 數據完整性

- [ ] 檢查：現有用戶的 `account_status` 仍有 `pointBalance` 欄位（可保留，不讀取）
- [ ] 確認：新用戶的 `account_status` 不再有 `pointBalance` 欄位
- [ ] 確認：所有點數查詢都從 `rewards` 進行

---

## 📝 數據遷移說明

### 是否需要遷移現有數據？

**答案：不需要**

**原因：**
1. ✅ 現有數據中的 `pointBalance` 可以保留（不會造成問題）
2. ✅ 新代碼不再讀取 `pointBalance`，只讀取 `rewards`
3. ✅ `rewards` 數據已經存在且完整
4. ✅ 向後兼容，不影響現有用戶

**如果需要清理（可選）：**

```typescript
// 可選的清理腳本（不必要）
const userIds = await kv.get('user_list') || [];

for (const userId of userIds) {
  const accountStatus = await kv.get(`user:${userId}:account_status`);
  
  if (accountStatus && 'pointBalance' in accountStatus) {
    delete accountStatus.pointBalance;
    await kv.set(`user:${userId}:account_status`, accountStatus);
    console.log(`已清理 ${userId} 的 pointBalance`);
  }
}
```

---

## 🚀 部署注意事項

### 1. 部署順序

```
1. ✅ 部署後端代碼（移除 pointBalance 更新邏輯）
2. ✅ 驗證功能正常
3. ✅ （可選）清理現有數據中的 pointBalance
```

### 2. 回滾方案

如果需要回滾（極低可能性）：

```
1. 恢復 types.ts 中的 pointBalance 定義
2. 恢復 cron.ts 和 payment.ts 中的更新邏輯
3. 重新部署
```

### 3. 監控要點

- ✅ 監控 `rewards` 數據是否正常更新
- ✅ 監控提領功能是否正常
- ✅ 監控獎勵發放是否正常
- ✅ 監控用戶點數顯示是否正確

---

## 📊 受影響的 API 端點

| 端點 | 影響 | 說明 |
|------|------|------|
| `GET /rewards` | ✅ 無影響 | 本來就只讀取 `rewards` |
| `POST /rewards/withdraw` | ✅ 無影響 | 本來就只更新 `rewards` |
| `POST /payment/simulate-success` | ✅ 輕微 | 不再初始化 `pointBalance` |
| `POST /cron/process-daily-rewards` | ✅ 輕微 | 不再更新 `pointBalance` |

---

## 🎉 重構效益

### 代碼質量

- ✅ 移除重複代碼（-3 處更新邏輯）
- ✅ 降低維護成本
- ✅ 提升代碼可讀性
- ✅ 減少 Bug 風險

### 架構改善

- ✅ 符合 SSOT 原則
- ✅ 數據一致性保證
- ✅ 清晰的職責劃分：
  - `account_status` → 管理帳號狀態
  - `rewards` → 管理點數

### 性能優化

- ✅ 減少 KV Store 寫入次數（每次獎勵發放少 1 次寫入）
- ✅ 減少數據同步開銷

---

## 📚 相關文檔

- [提領規則更新文檔](/docs/WITHDRAWAL_RULE_UPDATE.md)
- [Guidelines.md](/Guidelines.md)

---

**重構完成日期**: 2024-12-24  
**重構者**: AI Assistant (Claude)  
**驗證狀態**: 待測試  
**SSOT 狀態**: ✅ 已實現
