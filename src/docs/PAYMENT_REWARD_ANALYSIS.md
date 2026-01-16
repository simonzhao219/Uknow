# 付款成功後獎勵系統完整性分析報告

## 📋 執行日期
2024-12-23

## 🎯 分析目標
根據 Uknow_Software_Specification.md 的規格，確認付款成功時的以下邏輯：

1. ✅ 推薦者的：推薦關係、任務狀態
2. ❌ **該推薦者回推前三代的：當下首月的Point獎勵入帳和之後11個月的Point獎勵入帳排程**
3. ✅ 該使用者的：訂閱狀態

---

## ⚠️ 關鍵問題發現

### 問題 1：付款成功後**完全沒有發放獎勵和創建排程**

**現狀：** `payment.ts` 的 `processPaymentCallback` 函數中：
- ✅ 已處理推薦關係（`referred_by`, `referral_tree`, `referral_stats`）
- ✅ 已更新訂閱狀態（`subscription`, `account_status`）
- ❌ **完全沒有發放首月獎勵**
- ❌ **完全沒有創建 11 個月的獎勵排程**
- ❌ **完全沒有更新任務狀態**

**規格要求：**
```
5.2 年費月領技術實作 (核心規範)
1. 觸發：下線付款 $1,200 成功
2. 當下執行：發放第 1 個月獎勵 (10 P)  ← ❌ 未實作
3. 排程寫入：系統在資料表寫入未來 11 筆待發放紀錄 (Status=Pending)  ← ❌ 未實作
```

---

### 問題 2：獎勵明細格式不符合規格

**規格要求（用戶提供）：**
```
該被推薦者的上三代，能在獎勵管理中要能看到該筆入帳。
明細的內容格式範例：一代推薦-被推薦者姓名-被推薦者推薦碼-第幾個月
```

**現狀（cron.ts 第 260 行）：**
```typescript
description: `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第${monthNumber}個月`
```

**問題：**
- ✅ 包含被推薦者姓名
- ❌ **缺少被推薦者推薦碼**
- ✅ 包含代數
- ✅ 包含月數
- ❌ **格式不符合「一代推薦-姓名-推薦碼-第X個月」**

---

### 問題 3：任務更新邏輯缺失

**規格要求：**
```
7.1 連續推薦達人
- 條件：連續 12 個月，每月至少直推 1 人
- 中斷：任一月沒推薦，進度歸零
- 獎勵：1,000 P

7.2 推薦王
- 條件：單月累積直推 10 人
- 溢出處理機制 (Overflow Logic)：採扣除制計算
```

**現狀：**
- ✅ `task_helpers.ts` 中有 `updateTaskProgress` 函數
- ❌ **付款成功後沒有調用此函數更新推薦者的任務狀態**

---

## 📊 當前流程 vs 規格要求

### 當前流程（payment.ts - processPaymentCallback）

```
付款成功
  ↓
1. 生成推薦碼（綁定到用戶）✅
2. 創建訂閱記錄 ✅
3. 更新用戶資料（registrationStep = 3）✅
4. 記錄推薦來源（user:{userId}:referred_by）✅
5. 更新推薦樹（三代）✅
6. 更新推薦統計（referral_stats）✅
  ↓
❌ 缺少以下步驟：
7. 發放首月獎勵（一代 10P + 二代 10P + 三代 10P）
8. 創建後續 11 個月的獎勵排程
9. 更新推薦者的任務進度（連續推薦達人 + 推薦王）
```

### 規格要求流程

```
付款成功
  ↓
1. 生成推薦碼 ✅
2. 創建訂閱記錄 ✅
3. 更新用戶資料 ✅
4. 記錄推薦來源 ✅
5. 更新推薦樹 ✅
6. 更新推薦統計 ✅
  ↓
7. 🔴 發放上三代的首月獎勵：
   - 一代推薦人：立即發放 10P
   - 二代推薦人：立即發放 10P
   - 三代推薦人：立即發放 10P
  ↓
8. 🔴 為上三代各創建 11 筆獎勵排程：
   - reward_schedule:schedule_{id}
   - reward_schedules_by_date:{date}
   - 第 2~12 個月，每月 10P
  ↓
9. 🔴 更新推薦者的任務進度：
   - 連續推薦達人：檢查連續月數
   - 推薦王：檢查單月推薦數（+1），檢查是否達成 10 人
```

---

## 🛠️ 需要修正的文件

### 1. `/supabase/functions/server/payment.ts`

**需要在 `processPaymentCallback` 函數中添加：**

#### A. 發放首月獎勵（緊接在更新推薦樹之後）
```typescript
// ✅ 7. 發放上三代的首月獎勵
if (referralCode && referralCode !== 'DEFAULTRCM01') {
  console.log(`========== 💰 開始發放首月獎勵 ==========`);
  
  // 發放一代獎勵
  await issueImmediateReward(
    referrerUserId,  // 推薦人用戶ID
    userId,          // 被推薦人用戶ID
    userProfile.name,  // 被推薦人姓名
    newReferralCode,   // 被推薦人推薦碼
    1,  // 第1代
    1,  // 第1個月
    10  // 10 Points
  );
  
  // 發放二代獎勵（如果存在）
  if (referrerReferredBy && referrerReferredBy.referrerUserId) {
    await issueImmediateReward(
      referrerReferredBy.referrerUserId,
      userId,
      userProfile.name,
      newReferralCode,
      2,
      1,
      10
    );
  }
  
  // 發放三代獎勵（如果存在）
  if (gen2ReferredBy && gen2ReferredBy.referrerUserId) {
    await issueImmediateReward(
      gen2ReferredBy.referrerUserId,
      userId,
      userProfile.name,
      newReferralCode,
      3,
      1,
      10
    );
  }
}
```

#### B. 創建後續 11 個月的獎勵排程
```typescript
// ✅ 8. 創建上三代的後續 11 個月獎勵排程
if (referralCode && referralCode !== 'DEFAULTRCM01') {
  console.log(`========== 📅 開始創建獎勵排程 ==========`);
  
  // 為一代創建排程
  await createRewardSchedules(
    referrerUserId,
    userId,
    userProfile.name,
    newReferralCode,
    1,  // 第1代
    endDate  // 訂閱結束日期
  );
  
  // 為二代創建排程
  if (referrerReferredBy && referrerReferredBy.referrerUserId) {
    await createRewardSchedules(
      referrerReferredBy.referrerUserId,
      userId,
      userProfile.name,
      newReferralCode,
      2,
      endDate
    );
  }
  
  // 為三代創建排程
  if (gen2ReferredBy && gen2ReferredBy.referrerUserId) {
    await createRewardSchedules(
      gen2ReferredBy.referrerUserId,
      userId,
      userProfile.name,
      newReferralCode,
      3,
      endDate
    );
  }
}
```

#### C. 更新推薦者的任務進度
```typescript
// ✅ 9. 更新推薦者的任務進度（僅一代）
if (referralCode && referralCode !== 'DEFAULTRCM01') {
  console.log(`========== 🎯 開始更新任務進度 ==========`);
  
  // 只有一代推薦才計入任務（連續推薦達人 + 推薦王）
  await updateTaskProgress(
    referrerUserId,
    userId,
    userProfile.name,
    createdAt
  );
}
```

---

### 2. `/supabase/functions/server/payment.ts` - 新增輔助函數

#### A. 立即發放獎勵函數
```typescript
/**
 * 立即發放首月獎勵
 * 
 * @param receiverUserId - 接收獎勵的用戶ID（推薦人）
 * @param refereeUserId - 被推薦人用戶ID
 * @param refereeName - 被推薦人姓名
 * @param refereeCode - 被推薦人推薦碼
 * @param generation - 第幾代（1/2/3）
 * @param monthNumber - 第幾個月（始終為 1）
 * @param amount - 獎勵金額（10P）
 */
async function issueImmediateReward(
  receiverUserId: string,
  refereeUserId: string,
  refereeName: string,
  refereeCode: string,
  generation: number,
  monthNumber: number,
  amount: number
) {
  console.log(`💰 發放獎勵: 用戶=${receiverUserId}, 第${generation}代, ${amount}P`);
  
  // 1. 更新用戶點數餘額
  const accountStatus = await kv.get(`user:${receiverUserId}:account_status`);
  if (accountStatus) {
    accountStatus.pointBalance = (accountStatus.pointBalance || 0) + amount;
    await kv.set(`user:${receiverUserId}:account_status`, accountStatus);
  }
  
  // 2. 記錄到獎勵歷史
  const historyKey = `user:${receiverUserId}:reward_history`;
  const history = await kv.get(historyKey) || [];
  
  // ✅ 修正格式：一代推薦-被推薦者姓名-被推薦者推薦碼-第1個月
  const generationText = generation === 1 ? '一代推薦' : generation === 2 ? '二代推薦' : '三代推薦';
  const description = `${generationText}-${refereeName}-${refereeCode}-第${monthNumber}個月`;
  
  history.unshift({
    id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: `referral_gen${generation}_month${monthNumber}`,
    amount,
    referee: {
      userId: refereeUserId,
      userName: refereeName,
      userReferralCode: refereeCode
    },
    generation,
    monthNumber,
    issuedAt: toTaiwanISOString(getTaiwanNow()),
    description
  });
  
  // 只保留最近 200 筆
  if (history.length > 200) {
    history.length = 200;
  }
  
  await kv.set(historyKey, history);
  
  console.log(`   ✅ 獎勵已發放: ${description}, 餘額增加 ${amount}P`);
}
```

#### B. 創建獎勵排程函數
```typescript
/**
 * 創建後續 11 個月的獎勵排程
 * 
 * @param receiverUserId - 接收獎勵的用戶ID
 * @param refereeUserId - 被推薦人用戶ID
 * @param refereeName - 被推薦人姓名
 * @param refereeCode - 被推薦人推薦碼
 * @param generation - 第幾代（1/2/3）
 * @param subscriptionEndDate - 訂閱結束日期
 */
async function createRewardSchedules(
  receiverUserId: string,
  refereeUserId: string,
  refereeName: string,
  refereeCode: string,
  generation: number,
  subscriptionEndDate: Date
) {
  console.log(`📅 創建獎勵排程: 用戶=${receiverUserId}, 第${generation}代, 共11筆`);
  
  const startDate = new Date(subscriptionEndDate);
  startDate.setDate(startDate.getDate() - 364);  // 回推到付款日
  
  // 創建第 2~12 個月的排程
  for (let month = 2; month <= 12; month++) {
    // 計算發放日期：付款日 + (month-1) 個月
    const scheduledDate = new Date(startDate);
    scheduledDate.setMonth(scheduledDate.getMonth() + (month - 1));
    const scheduledDateStr = toTaiwanDateString(scheduledDate);  // YYYY-MM-DD
    
    // 生成排程 ID
    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // 創建排程記錄
    const schedule = {
      id: scheduleId,
      userId: receiverUserId,  // 接收獎勵的用戶ID
      referee: {
        userId: refereeUserId,
        userName: refereeName,
        userReferralCode: refereeCode
      },
      generation,
      monthNumber: month,
      amount: 10,
      scheduledDate: scheduledDateStr,
      status: 'pending',  // pending | completed | cancelled
      createdAt: toTaiwanISOString(getTaiwanNow()),
      completedAt: null,
      cancellationReason: null
    };
    
    // 存儲排程記錄
    await kv.set(`reward_schedule:${scheduleId}`, schedule);
    
    // 添加到日期索引
    const dateIndexKey = `reward_schedules_by_date:${scheduledDateStr}`;
    const dateIndex = await kv.get(dateIndexKey) || [];
    dateIndex.push(scheduleId);
    await kv.set(dateIndexKey, dateIndex);
    
    console.log(`   ✅ 排程已創建: 第${month}個月, 發放日=${scheduledDateStr}`);
  }
}
```

---

### 3. `/supabase/functions/server/cron.ts` - 修正獎勵明細格式

**修改位置：** `issueScheduledReward` 函數（第 224-272 行）

```typescript
// ❌ 舊格式
const description = `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第${monthNumber}個月`;

// ✅ 新格式（符合規格）
const generationText = generation === 1 ? '一代推薦' : generation === 2 ? '二代推薦' : '三代推薦';
const description = `${generationText}-${referee.userName}-${referee.userReferralCode}-第${monthNumber}個月`;
```

---

### 4. TypeScript Interface 更新

**位置：** `/supabase/functions/server/types.ts` 或在 payment.ts 文件頂部定義

```typescript
/**
 * 獎勵排程記錄
 */
interface RewardSchedule {
  id: string;
  userId: string;  // 接收獎勵的用戶ID
  
  // ✅ 被推薦人完整信息
  referee: {
    userId: string;
    userName: string;
    userReferralCode: string;  // ✅ 新增：被推薦人推薦碼
  };
  
  generation: number;  // 1, 2, 或 3
  monthNumber: number;  // 2~12
  amount: number;  // 10
  scheduledDate: string;  // YYYY-MM-DD
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt: string | null;
  cancellationReason: string | null;
}

/**
 * 獎勵歷史記錄
 */
interface RewardHistoryItem {
  id: string;
  type: string;  // "referral_gen1_month1", etc.
  amount: number;
  
  // ✅ 被推薦人完整信息
  referee: {
    userId: string;
    userName: string;
    userReferralCode: string;  // ✅ 新增：被推薦人推薦碼
  };
  
  generation: number;
  monthNumber: number;
  issuedAt: string;
  description: string;  // "一代推薦-Admin-abc123456-第1個月"
}
```

---

## 📋 完整的付款成功處理清單

### ✅ 已實作
1. 生成推薦碼（綁定到用戶）
2. 創建訂閱記錄（subscription）
3. 創建帳號狀態（account_status）
4. 更新用戶資料（registrationStep = 3）
5. 記錄推薦來源（referred_by）
6. 更新推薦樹（三代：firstGeneration, secondGeneration, thirdGeneration）
7. 更新推薦統計（referral_stats）

### ❌ 缺失的實作
8. **發放上三代的首月獎勵**（10P × 3 = 最多 30P）
9. **創建上三代的後續 11 個月獎勵排程**（11筆 × 3代 = 最多 33筆排程）
10. **更新推薦者的任務進度**（連續推薦達人 + 推薦王）

---

## 🔧 修正步驟建議

### Phase 1: 添加立即獎勵發放（高優先級）
1. 在 `payment.ts` 中添加 `issueImmediateReward` 函數
2. 在 `processPaymentCallback` 的推薦關係處理後調用
3. 測試：付款成功 → 查看推薦人的獎勵歷史和點數餘額

### Phase 2: 添加獎勵排程創建（高優先級）
1. 在 `payment.ts` 中添加 `createRewardSchedules` 函數
2. 在 `processPaymentCallback` 的立即獎勵發放後調用
3. 測試：付款成功 → 查看 `reward_schedule:*` 和 `reward_schedules_by_date:*`

### Phase 3: 修正獎勵明細格式（中優先級）
1. 修改 `cron.ts` 的 `issueScheduledReward` 函數
2. 修改描述生成邏輯
3. 更新 TypeScript interface
4. 測試：觸發每日排程 → 查看獎勵歷史的格式

### Phase 4: 添加任務更新（中優先級）
1. 在 `processPaymentCallback` 中調用 `updateTaskProgress`
2. 僅對一代推薦人更新任務
3. 測試：付款成功 → 查看推薦人的任務進度（consecutive_referral, monthly_king）

---

## 🧪 測試場景

### 測試 1: 一代推薦
```
步驟：
1. User A 註冊並付款（無推薦碼）
2. User B 使用 User A 的推薦碼註冊
3. User B 付款成功

預期結果：
✅ User A 的訂閱狀態：Active
✅ User A 的推薦樹：firstGeneration 包含 User B
✅ User A 的點數餘額：+10P（立即發放）
✅ User A 的獎勵歷史：新增「一代推薦-UserB-xyz123456-第1個月」
✅ 系統中有 11 筆排程：User A 的第 2~12 個月
✅ User A 的任務進度：
   - consecutive_referral：當月推薦數 +1
   - monthly_king：當月推薦數 +1（如達 10 人，發放 1000P）
```

### 測試 2: 三代推薦
```
步驟：
1. User A → User B → User C 推薦鏈
2. User C 使用 User B 的推薦碼註冊
3. User C 付款成功

預期結果：
✅ User B 的點數餘額：+10P（一代獎勵）
✅ User A 的點數餘額：+10P（二代獎勵）
✅ User B 的獎勵歷史：「一代推薦-UserC-abc123456-第1個月」
✅ User A 的獎勵歷史：「二代推薦-UserC-abc123456-第1個月」
✅ 系統中有 22 筆排程：
   - User B: 11筆（第2~12個月，一代）
   - User A: 11筆（第2~12個月，二代）
✅ User B 的任務進度更新（User A 不更新，因為是二代）
```

---

## 📌 總結

### 當前狀態
- **推薦關係處理：** ✅ 完整
- **訂閱狀態處理：** ✅ 完整
- **獎勵發放：** ❌ 完全缺失
- **任務更新：** ❌ 完全缺失

### 核心問題
付款成功後，系統能正確建立推薦關係和訂閱狀態，但**完全沒有發放任何獎勵和創建排程**，導致推薦人無法獲得應得的推薦獎勵。

### 影響範圍
1. **推薦人無法獲得獎勵：** 首月和後續 11 個月的獎勵都無法入帳
2. **任務系統失效：** 連續推薦達人和推薦王任務無法正確計數
3. **用戶體驗受損：** 推薦人看不到任何獎勵記錄

### 建議優先級
1. **P0（緊急）：** 添加立即獎勵發放和排程創建
2. **P1（高）：** 修正獎勵明細格式
3. **P2（中）：** 添加任務更新邏輯

---

## 📎 相關文件
- `/supabase/functions/server/payment.ts` - 付款處理（需要大幅修改）
- `/supabase/functions/server/cron.ts` - 排程處理（需要小幅修改格式）
- `/supabase/functions/server/task_helpers.ts` - 任務更新（已存在，需調用）
- `/Uknow_Software_Specification.md` - 系統規格文檔

---

## ✅ 驗收標準

### 功能完整性
- [ ] 付款成功後，上三代推薦人立即獲得首月 10P 獎勵
- [ ] 付款成功後，系統創建上三代各 11 筆獎勵排程
- [ ] 獎勵明細格式符合規格：「一代推薦-姓名-推薦碼-第X個月」
- [ ] 推薦人的任務進度正確更新（僅一代）
- [ ] 獎勵歷史中包含被推薦人的推薦碼

### 資料完整性
- [ ] `user:{userId}:account_status` 中的 `pointBalance` 正確增加
- [ ] `user:{userId}:reward_history` 中正確記錄獎勵
- [ ] `reward_schedule:{scheduleId}` 正確創建
- [ ] `reward_schedules_by_date:{date}` 索引正確建立

### 日誌完整性
- [ ] 付款成功的日誌中包含「發放首月獎勵」訊息
- [ ] 付款成功的日誌中包含「創建獎勵排程」訊息
- [ ] 付款成功的日誌中包含「更新任務進度」訊息
- [ ] 每個步驟都有清晰的成功/失敗日誌

---

**報告結束**
