# 提領申請管理系統實作報告

**實作日期**: 2024-12-24  
**功能**: 完整的提領申請流程（申請 → Admin 處理 → 用戶確認查收）  

---

## 🎯 功能需求

### 規格總覽

提領申請系統包含三個角色和三個狀態：

**角色：**
1. **User（用戶）** - 申請提領、確認查收
2. **Admin（管理員）** - 審核申請、切換狀態、查看所有記錄
3. **System（系統）** - SSOT（單一真理來源）

**狀態流轉：**
```
pending（處理中）
    ↓ Admin 匯款完成
awaiting_collection（待查收）
    ↓ User 確認查收（身分證驗證）
completed（已完成）
```

### 詳細規格

| 狀態 | 觸發條件 | User 可見 | Admin 可見 | 顯示內容 |
|------|---------|-----------|-----------|---------|
| **處理中** | 用戶送出申請 | ✅ | ✅ | 申請日期 |
| **待查收** | Admin 完成匯款 | ✅ | ✅ | 申請日期、處理日期、「查收」按鈕 |
| **已完成** | 用戶確認查收 | ❌ | ✅ | 申請日期、處理日期、完成日期 |

**重要規則：**
- ✅ 用戶申請記錄中**不顯示**已完成的提領
- ✅ Admin 管理頁面中顯示所有狀態的提領
- ✅ 所有資料以 Backend 為 SSOT（單一真理來源）
- ✅ 查收流程需身分證驗證（與註冊時一致）
- ✅ 查收完成後自動新增兩筆獎勵明細（提領 + 手續費）

---

## 🏗️ 架構設計

### 數據流

```
┌─────────────────────────────────────────────────────────────┐
│                         申請提領                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Backend 創建提領記錄                                        │
│  - 狀態: pending                                            │
│  - 扣除可提領 → 轉入處理中                                   │
│  - 記錄申請日期（台灣時區）                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Admin 匯款並切換狀態                                        │
│  - 狀態: awaiting_collection                                │
│  - 記錄處理日期（台灣時區）                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  User 點擊「查收」                                           │
│  → 第一步：確認提示（警告、客服資訊）                        │
│  → 第二步：輸入身分證字號驗證                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Backend 確認查收                                            │
│  1. 驗證身分證字號                                           │
│  2. 狀態: completed                                         │
│  3. 記錄完成日期                                             │
│  4. 處理中 → 已提領                                         │
│  5. 新增兩筆獎勵明細                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 數據結構

### 提領記錄（withdrawal）

**KV Store Key:** `withdrawal:${withdrawalId}`

```typescript
interface WithdrawalRecord {
  id: string;                  // withdrawal_1703423456_abc123
  userId: string;              // user_xxx
  amount: number;              // 提領金額（例如 1000）
  fee: number;                 // 手續費（15P）
  status: WithdrawalStatus;    // pending | awaiting_collection | completed | rejected
  requestedAt: string;         // 申請日期（台灣時區 ISO）
  processedAt: string | null;  // 處理日期（Admin 切換時，台灣時區 ISO）
  completedAt: string | null;  // 完成日期（User 確認查收時，台灣時區 ISO）
}

type WithdrawalStatus = 
  | 'pending'              // 處理中
  | 'awaiting_collection'  // 待查收
  | 'completed'            // 已完成
  | 'rejected';            // 已拒絕（可選）
```

### 用戶提領列表

**KV Store Key:** `user:${userId}:withdrawals`

```typescript
string[]  // [withdrawalId1, withdrawalId2, ...]
```

### 獎勵明細（查收後新增）

```typescript
// 明細 1：提領扣款
{
  id: string,
  type: 'withdrawal',
  amount: -1000,  // 負數表示扣款
  issuedAt: string,
  description: '提領點數'
}

// 明細 2：手續費扣款
{
  id: string,
  type: 'withdrawal_fee',
  amount: -15,  // 負數表示扣款
  issuedAt: string,
  description: '提領手續費'
}
```

---

## 📝 實作清單

### ✅ 後端修改

#### 1. `/supabase/functions/server/rewards.ts`

**修改 1：POST /rewards/withdraw - 創建提領申請**
```typescript
// ✅ 新增功能
- 驗證提領金額（最低 1000P）
- 計算總需求（提領 + 手續費 = 1015P）
- 檢查今日是否已提領過
- 創建完整的提領記錄（包含 fee、processedAt、completedAt 字段）
- 扣除可提領點數 → 轉入處理中
- 記錄申請日期（台灣時區）
```

**修改 2：GET /rewards/withdrawals - 獲取提領記錄**
```typescript
// ✅ 返回完整數據
- 批量讀取所有提領記錄
- 返回包含 fee、processedAt、completedAt 的完整數據
```

**新增 3：POST /rewards/withdrawals/:id/confirm - 用戶確認查收**
```typescript
// ✅ 完整流程
1. 驗證用戶身分證字號（必須與註冊時一致）
2. 檢查提領狀態（必須是 awaiting_collection）
3. 更新狀態為 completed
4. 記錄完成日期（台灣時區）
5. 扣除處理中點數 → 增加已提領點數
6. 新增兩筆獎勵明細（提領 + 手續費）
```

---

### ✅ 前端修改

#### 1. `/components/RewardDashboard.tsx`

**新增功能：**
- ✅ 並行獲取獎勵資料和提領記錄
- ✅ 定義 `WithdrawalRecord` interface
- ✅ 新增 `fetchData()` 刷新函數
- ✅ 傳遞 `withdrawals` 和 `onRefresh` 給 WithdrawalSection

**新增 Interface：**
```typescript
interface WithdrawalRecord {
  id: string;
  userId: string;
  amount: number;
  fee: number;
  status: 'pending' | 'awaiting_collection' | 'completed' | 'rejected';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
}
```

---

#### 2. `/components/reward/WithdrawalSection.tsx`

**完整重寫：**
- ❌ 移除 mock 數據依賴
- ✅ 使用真實 API 數據
- ✅ 整合查收確認流程
- ✅ 過濾已完成的提領記錄（用戶不可見）
- ✅ 顯示申請日期和處理日期（台灣時區）
- ✅ 「查收」按鈕僅在 `awaiting_collection` 狀態顯示

**查收流程狀態管理：**
```typescript
type CollectionStep = null | 'confirm' | 'verify';

// null → 'confirm' → 'verify' → null
```

---

#### 3. `/components/reward/CollectionConfirmDialog.tsx` ✨ 新建

**查收確認對話框 - 第一步**

**功能：**
- ⚠️ 顯示警告訊息（操作不可逆）
- 📋 顯示提領資訊（點數、申請日期、處理日期）
- 📞 顯示客服聯絡資訊（LINE、查詢所需資訊）
- 🔘 「取消」和「下一步」按鈕

**UI 設計：**
- 黃色警告區塊
- 灰色提領資訊區塊
- 藍色客服資訊區塊
- 明確的 CTA 按鈕

---

#### 4. `/components/reward/CollectionVerifyDialog.tsx` ✨ 新建

**查收驗證對話框 - 第二步**

**功能：**
- 🛡️ 身分證字號輸入（格式驗證）
- ✅ 前端格式驗證（1個英文字母 + 9個數字）
- 🔘 「取消」和「確認查收」按鈕
- ⏳ 載入狀態顯示

**驗證邏輯：**
```typescript
const idPattern = /^[A-Z][12]\d{8}$/;
// 例如：A123456789
```

---

## 🔍 實現細節

### 後端關鍵邏輯

#### **1. 申請提領（POST /rewards/withdraw）**

```typescript
// 檢查餘額（提領 + 手續費）
const MIN_WITHDRAWAL = 1000;
const WITHDRAWAL_FEE = 15;
const totalRequired = amount + WITHDRAWAL_FEE;  // 1015P

if (totalRequired > rewards.availableRewards) {
  return 400 "餘額不足";
}

// 檢查今日是否已提領過
const todayStr = toTaiwanDateString(getTaiwanNow());  // "2024-12-24"
const lastWithdrawalDate = await kv.get(`user:${userId}:last_withdrawal_date`);

if (lastWithdrawalDate === todayStr) {
  return 400 "今日已提領過一次";
}

// 創建提領記錄
const withdrawal = {
  id: withdrawalId,
  userId: user.id,
  amount,
  fee: WITHDRAWAL_FEE,
  status: 'pending',
  requestedAt: toTaiwanISOString(getTaiwanNow()),
  processedAt: null,
  completedAt: null
};

// 扣除點數
rewards.availableRewards -= totalRequired;
rewards.pendingRewards += totalRequired;

// 記錄今日提領日期
await kv.set(`user:${userId}:last_withdrawal_date`, todayStr);
```

---

#### **2. 確認查收（POST /rewards/withdrawals/:id/confirm）**

```typescript
// 1. 驗證身分證字號
const profile = await kv.get(`user:${userId}:profile`);
if (profile.idNumber !== requestBody.idNumber) {
  return 400 "身分證字號不正確";
}

// 2. 檢查狀態
if (withdrawal.status !== 'awaiting_collection') {
  return 400 "無法確認查收，當前狀態：${withdrawal.status}";
}

// 3. 更新狀態
withdrawal.status = 'completed';
withdrawal.completedAt = toTaiwanISOString(getTaiwanNow());

// 4. 更新獎勵資料
const totalAmount = withdrawal.amount + withdrawal.fee;
rewards.pendingRewards -= totalAmount;
rewards.withdrawnRewards += totalAmount;

// 5. 新增兩筆獎勵明細
history.unshift({
  type: 'withdrawal',
  amount: -withdrawal.amount,
  description: '提領點數',
  issuedAt: toTaiwanISOString(now)
});

history.unshift({
  type: 'withdrawal_fee',
  amount: -withdrawal.fee,
  description: '提領手續費',
  issuedAt: toTaiwanISOString(now)
});
```

---

### 前端關鍵邏輯

#### **1. 查收流程狀態機**

```typescript
// 狀態定義
type CollectionStep = null | 'confirm' | 'verify';

// 點擊「查收」按鈕
const handleClickCollection = (withdrawal) => {
  setSelectedWithdrawal(withdrawal);
  setCollectionStep('confirm');  // 顯示第一步
};

// 第一步：下一步
const handleConfirmNext = () => {
  setCollectionStep('verify');  // 顯示第二步
};

// 第二步：確認查收
const handleVerifyConfirm = async (idNumber) => {
  await apiRequestJson(
    `/rewards/withdrawals/${withdrawalId}/confirm`,
    { method: 'POST', body: JSON.stringify({ idNumber }) }
  );
  
  // 成功後刷新數據
  onRefresh();
  setCollectionStep(null);
};

// 取消
const handleCancelCollection = () => {
  setCollectionStep(null);
};
```

---

#### **2. 過濾已完成的提領記錄**

```typescript
// ✅ 用戶視圖：過濾掉已完成的
const activeWithdrawals = withdrawals.filter(w => w.status !== 'completed');

// ✅ Admin 視圖：顯示所有狀態
const allWithdrawals = withdrawals;  // 不過濾
```

---

## 📊 UI/UX 設計

### 申請記錄卡片設計

```
┌────────────────────────────────────────────────────────┐
│ 🕒 1,000P          [處理中]                            │
│ 申請日期：2024/12/24 10:30:15                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 👁️ 1,000P          [待查收]                  [查收]   │
│ 申請日期：2024/12/24 10:30:15                          │
│ 處理日期：2024/12/24 14:20:00                          │
└────────────────────────────────────────────────────────┘
```

### 查收流程 UI

**第一步：確認提示**
```
┌───────────────────────────────────────────────┐
│  ⚠️ 確認查收提醒                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                               │
│  ⚠️ 請務必確認已收到款項                      │
│  一旦確認查收，操作不可逆轉                    │
│                                               │
│  ━━ 提領資訊 ━━                               │
│  提領點數：1,000P                             │
│  申請日期：2024/12/24 10:30:15                │
│  處理日期：2024/12/24 14:20:00                │
│                                               │
│  ━━ 如有問題請聯絡客服 ━━                      │
│  📞 LINE 客服：@uknow                         │
│  請提供：帳號、申請日期、點數、處理日期         │
│                                               │
│  [取消]              [下一步]                 │
└───────────────────────────────────────────────┘
```

**第二步：身分證驗證**
```
┌───────────────────────────────────────────────┐
│  🛡️ 身分證驗證                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                               │
│  為確保帳戶安全，請輸入身分證字號               │
│                                               │
│  身分證字號                                    │
│  ┌─────────────────────────────────────┐     │
│  │ A123456789                          │     │
│  └─────────────────────────────────────┘     │
│  格式：1個英文字母 + 9個數字                   │
│                                               │
│  [取消]              [確認查收]               │
└───────────────────────────────────────────────┘
```

---

## 🧪 測試場景

### 場景 1：用戶申請提領

**前置條件：**
- 可提領 Point ≥ 1,015P
- 今日未提領過

**操作流程：**
1. 用戶點擊「申請Point提領」
2. 輸入提領金額（1,000P）
3. 確認申請

**預期結果：**
- ✅ 申請記錄新增一筆「處理中」
- ✅ 可提領 Point 減少 1,015P
- ✅ 處理中 Point 增加 1,015P
- ✅ 顯示申請日期（台灣時區）

---

### 場景 2：Admin 切換為待查收

**前置條件：**
- 存在「處理中」的提領申請

**操作流程：**
1. Admin 進入管理頁面
2. 查看提領申請
3. 匯款完成
4. 切換狀態為「待查收」

**預期結果：**
- ✅ 狀態更新為「待查收」
- ✅ 記錄處理日期（台灣時區）
- ✅ 用戶看到「查收」按鈕

---

### 場景 3：用戶確認查收（成功）

**前置條件：**
- 存在「待查收」的提領申請

**操作流程：**
1. 用戶點擊「查收」按鈕
2. 閱讀警告訊息，點擊「下一步」
3. 輸入正確的身分證字號
4. 點擊「確認查收」

**預期結果：**
- ✅ 狀態更新為「已完成」
- ✅ 記錄完成日期
- ✅ 處理中 Point 減少 1,015P
- ✅ 已提領 Point 增加 1,015P
- ✅ 獎勵明細新增兩筆記錄：
  - 提領點數：-1,000P
  - 提領手續費：-15P
- ✅ 申請記錄中移除該筆（用戶不可見）
- ✅ Admin 仍可查看該筆記錄

---

### 場景 4：用戶確認查收（身分證錯誤）

**操作流程：**
1. 用戶點擊「查收」按鈕
2. 點擊「下一步」
3. 輸入錯誤的身分證字號
4. 點擊「確認查收」

**預期結果：**
- ❌ 顯示錯誤：「身分證字號不正確」
- ❌ 對話框保持打開
- ❌ 狀態不變（仍為「待查收」）

---

### 場景 5：用戶取消查收

**操作流程：**
1. 用戶點擊「查收」按鈕
2. 在第一步或第二步點擊「取消」

**預期結果：**
- ✅ 對話框關閉
- ✅ 狀態不變（仍為「待查收」）

---

## 📋 代碼審查檢查清單

### 後端檢查
- [x] POST /rewards/withdraw - 創建完整的提領記錄
- [x] GET /rewards/withdrawals - 返回完整數據
- [x] POST /rewards/withdrawals/:id/confirm - 確認查收邏輯
- [x] 身分證字號驗證
- [x] 提領狀態檢查
- [x] 獎勵資料更新（處理中 → 已提領）
- [x] 新增兩筆獎勵明細
- [x] 日期使用台灣時區

### 前端檢查
- [x] RewardDashboard - 獲取提領記錄
- [x] WithdrawalSection - 顯示真實數據
- [x] 過濾已完成的提領記錄
- [x] CollectionConfirmDialog - 第一步確認提示
- [x] CollectionVerifyDialog - 第二步身分證驗證
- [x] 查收流程狀態管理
- [x] 錯誤處理和顯示
- [x] 成功後刷新數據

### UI/UX 檢查
- [x] 申請記錄顯示申請日期
- [x] 待查收顯示處理日期
- [x] 「查收」按鈕僅在待查收狀態顯示
- [x] 警告訊息清楚明確
- [x] 客服聯絡資訊完整
- [x] 身分證輸入格式提示
- [x] 載入狀態顯示
- [x] 錯誤訊息友好

---

## 🔄 修改文件清單

### 後端
1. ✅ `/supabase/functions/server/rewards.ts`
   - 修改 POST /rewards/withdraw
   - 修改 GET /rewards/withdrawals
   - 新增 POST /rewards/withdrawals/:id/confirm

### 前端
2. ✅ `/components/RewardDashboard.tsx`
   - 新增獲取提領記錄
   - 新增 `WithdrawalRecord` interface
   - 新增 `fetchData()` 刷新函數

3. ✅ `/components/reward/WithdrawalSection.tsx`
   - 完整重寫
   - 移除 mock 數據
   - 整合查收流程

4. ✅ `/components/reward/CollectionConfirmDialog.tsx` - 新建
5. ✅ `/components/reward/CollectionVerifyDialog.tsx` - 新建

---

## 🚀 下一步（Admin 管理頁面）

**未來功能：**
1. **Admin 管理頁面** - 查看所有提領申請
2. **切換狀態功能** - Admin 將「處理中」切換為「待查收」
3. **匯款記錄** - 記錄 Admin 匯款資訊
4. **拒絕功能** - Admin 可拒絕提領申請並說明原因

**需要新增：**
- `/components/admin/WithdrawalManagement.tsx` - Admin 管理頁面
- `POST /admin/withdrawals/:id/process` - Admin 切換狀態
- `POST /admin/withdrawals/:id/reject` - Admin 拒絕申請

---

## ✅ 總結

**已完成：**
- ✅ 完整的提領申請流程（申請 → 待查收 → 已完成）
- ✅ 雙步驟查收確認（警告 → 身分證驗證）
- ✅ SSOT 數據架構（所有數據來自後端）
- ✅ 台灣時區日期處理
- ✅ 獎勵明細自動新增
- ✅ 用戶/Admin 不同視圖（用戶看不到已完成的）
- ✅ 完整的錯誤處理

**測試狀態**: 待測試

**下一步**: Admin 管理頁面開發

---

**實作完成日期**: 2024-12-24  
**實作者**: AI Assistant (Claude)  
**驗證狀態**: 待測試
