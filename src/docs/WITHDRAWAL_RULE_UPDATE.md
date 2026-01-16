# 提領規則更新文檔

**更新日期**: 2024-12-24  
**更新原因**: 移除「預留費用」概念，簡化提領計算邏輯  

---

## 📊 規則變更對照

### 舊規則（已廢除）

```
可提領Point = 可用Point - 預留費用(273P)
實際可提領 = 可提領Point - 手續費(15P)
最大提領Point = floor(實際可提領 / 1000) * 1000
```

**問題：**
- ❌ 需要預留 273P 費用（複雜度高）
- ❌ 用戶需理解「預留費用」概念（認知負擔大）
- ❌ 計算步驟繁瑣（三步計算）

---

### 新規則（當前）

```
可以提領Point = 可提領Point - 提領手續費(15P)
最大提領Point = min(floor(可以提領Point / 1000) * 1000, 8000P)
```

**改進：**
- ✅ 移除預留費用概念（簡化邏輯）
- ✅ 直接從可提領Point扣除手續費（直觀易懂）
- ✅ 新增每日提領上限 8000P（風險控制）
- ✅ 計算步驟簡化（兩步計算）

---

## 🎯 新規則詳細說明

### 1. 可以提領Point計算

```typescript
const WITHDRAWAL_FEE = 15;  // 提領手續費

// 可以提領Point = 可提領Point - 手續費
const withdrawablePoints = availableRewards - WITHDRAWAL_FEE;
```

**範例：**
- 可提領Point = 5500P
- 可以提領Point = 5500 - 15 = 5485P ✅

---

### 2. 最大提領Point計算

```typescript
const DAILY_WITHDRAWAL_LIMIT = 8000;  // 每日提領上限

// 最大提領Point = min(floor(可以提領Point / 1000) * 1000, 8000P)
const maxWithdrawal = Math.min(
  Math.floor(withdrawablePoints / 1000) * 1000,
  DAILY_WITHDRAWAL_LIMIT
);
```

**範例 1：餘額 < 8000P**
- 可以提領Point = 5485P
- floor(5485 / 1000) * 1000 = 5000P
- min(5000P, 8000P) = **5000P** ✅

**範例 2：餘額 > 8000P**
- 可以提領Point = 10000P - 15P = 9985P
- floor(9985 / 1000) * 1000 = 9000P
- min(9000P, 8000P) = **8000P** ✅（受每日上限限制）

---

### 3. 提領限制規則

| 規則 | 數值 | 說明 |
|------|------|------|
| **最低提領金額** | 1,000P | 必須為 1000 的倍數 |
| **提領手續費** | 15P | 從可提領Point扣除 |
| **每日提領次數** | 1 次 | 一天只能提領一次 |
| **每日提領上限** | 8,000P | 單筆、單日最多提領 8000P |

---

## 🔄 修改文件清單

### 前端修改

#### 1. `/components/reward/WithdrawalProcess.tsx`

**新增常量：**
```typescript
const WITHDRAWAL_FEE = 15;              // 提領手續費
const DAILY_WITHDRAWAL_LIMIT = 8000;    // 每日提領上限
const MIN_WITHDRAWAL = 1000;            // 最低提領金額
```

**移除變量：**
```typescript
// ❌ 移除
const reservedAmount = 273;  // 預留費用
```

**新增計算邏輯：**
```typescript
// ✅ 可以提領Point = 可提領Point - 手續費
const withdrawablePoints = Math.max(0, availableRewards - WITHDRAWAL_FEE);

// ✅ 最大提領Point = min(floor(可以提領Point / 1000) * 1000, 8000P)
const maxWithdrawal = Math.min(
  Math.floor(withdrawablePoints / 1000) * 1000,
  DAILY_WITHDRAWAL_LIMIT
);
```

**UI 顯示更新：**
```jsx
<div className="space-y-2 text-sm">
  <div className="flex justify-between">
    <span>可提領Point</span>
    <span>{availableRewards.toLocaleString()}P</span>
  </div>
  <div className="flex justify-between">
    <span>提領手續費</span>
    <span className="text-muted-foreground">-{WITHDRAWAL_FEE}P</span>
  </div>
  <div className="border-t pt-2 flex justify-between font-medium">
    <span>可以提領Point</span>
    <span>{withdrawablePoints.toLocaleString()}P</span>
  </div>
  <div className="flex justify-between text-muted-foreground">
    <span>最大提領Point (1000倍數)</span>
    <span>{maxWithdrawal.toLocaleString()}P</span>
  </div>
  <div className="flex justify-between text-blue-600">
    <span>每日提領上限</span>
    <span>{DAILY_WITHDRAWAL_LIMIT.toLocaleString()}P</span>
  </div>
</div>
```

**提領說明更新：**
```jsx
<div className="space-y-1 text-sm text-blue-800">
  <p>• 最低提領Point為 {MIN_WITHDRAWAL.toLocaleString()}P（必須為1000的倍數）</p>
  <p>• 一天只限提領 1 次</p>
  <p>• 每次、每日最多提領 {DAILY_WITHDRAWAL_LIMIT.toLocaleString()}P</p>
  <p>• 需完成身分驗證流程</p>
  <p>• 處理時間約 3-5 個工作天</p>
  <p>• 提領申請送出後無法修改</p>
</div>
```

---

### 後端修改

#### 2. `/supabase/functions/server/rewards.ts`

**POST /rewards/withdraw - 新增驗證：**

```typescript
// ✅ 驗證是否為 1000 的倍數
if (amount % 1000 !== 0) {
  return c.json({
    error: { message: '提領金額必須為 1000 的倍數' }
  }, 400);
}

// ✅ 驗證每日提領上限
const DAILY_WITHDRAWAL_LIMIT = 8000;
if (amount > DAILY_WITHDRAWAL_LIMIT) {
  return c.json({
    error: { message: `每日最多提領 ${DAILY_WITHDRAWAL_LIMIT}P` }
  }, 400);
}
```

---

## 📋 測試場景

### 場景 1：正常提領（餘額充足）

**前置條件：**
- 可提領Point = 5500P

**操作：**
1. 用戶進入提領頁面
2. 查看可以提領Point = 5500 - 15 = 5485P
3. 查看最大提領Point = 5000P
4. 輸入 5000P
5. 提交申請

**預期結果：**
- ✅ 申請成功
- ✅ 可提領Point = 5500 - 5000 - 15 = 485P
- ✅ 處理中Point = 5015P

---

### 場景 2：超過每日上限

**前置條件：**
- 可提領Point = 10000P

**操作：**
1. 用戶進入提領頁面
2. 查看可以提領Point = 10000 - 15 = 9985P
3. 查看��大提領Point = 8000P（受上限限制）
4. 輸入 8000P
5. 提交申請

**預期結果：**
- ✅ 申請成功（最多只能提領 8000P）
- ✅ 可提領Point = 10000 - 8000 - 15 = 1985P
- ✅ 處理中Point = 8015P

---

### 場景 3：輸入超過上限

**前置條件：**
- 可提領Point = 10000P

**操作：**
1. 用戶輸入 9000P
2. 提交申請

**預期結果：**
- ❌ 後端返回錯誤：「每日最多提領 8000P」
- ❌ 前端顯示錯誤提示

---

### 場景 4：不是 1000 倍數

**操作：**
1. 用戶輸入 1500P（但 input 已限制 step="1000"）
2. 或直接修改 HTML 輸入 1500
3. 提交申請

**預期結果：**
- ❌ 前端驗證：「提領Point必須為 1000 的倍數」
- ❌ 如果繞過前端，後端也會驗證並返回錯誤

---

### 場景 5：餘額不足（含手續費）

**前置條件：**
- 可提領Point = 1010P

**操作：**
1. 用戶輸入 1000P
2. 提交申請

**預期結果：**
- ❌ 後端檢查：1000 + 15 = 1015P > 1010P
- ❌ 返回錯誤：「餘額不足」

---

## 🎨 UI 展示對照

### 舊版 UI（已廢除）

```
┌──────────────────────────────────┐
│ 可提領計算                        │
├──────────────────────────────────┤
│ 可用Point          5500P         │
│ 預留費用           -273P         │
│ 提領手續費         -15P          │
│ ────────────────────────────     │
│ 實際可提領         4212P         │
│ 最大提領Point      4000P         │
└──────────────────────────────────┘
```

### 新版 UI（當前）

```
┌──────────────────────────────────┐
│ 可提領計算                        │
├──────────────────────────────────┤
│ 可提領Point        5500P         │
│ 提領手續費         -15P          │
│ ────────────────────────────     │
│ 可以提領Point      5485P         │
│ 最大提領Point      5000P         │
│ 每日提領上限       8000P         │
└──────────────────────────────────┘
```

**改進點：**
- ✅ 移除「預留費用」行（簡化）
- ✅ 新增「每日提領上限」提示（透明化規則）
- ✅ 術語更清晰（「可以提領Point」vs「實際可提領」）

---

## ✅ 驗證檢查清單

### 前端檢查
- [x] 移除預留費用相關變量
- [x] 新增每日提領上限常量
- [x] 更新可提領計算邏輯
- [x] 更新最大提領Point計算
- [x] 更新 UI 顯示（移除預留費用、新增上限）
- [x] 更新提領說明（新增每日限制）
- [x] 更新驗證邏輯（檢查 1000 倍數）
- [x] 更新錯誤提示文字

### 後端檢查
- [x] 新增 1000 倍數驗證
- [x] 新增每日上限驗證（8000P）
- [x] 餘額檢查邏輯保持正確（提領 + 手續費）
- [x] 錯誤訊息清晰明確

---

## 📊 數據流對照

### 舊流程（已廢除）

```
用戶輸入提領金額（例如 4000P）
    ↓
檢查: 4000P ≤ 實際可提領(4212P) ✅
    ↓
扣除: 可提領 - 4000 - 15 = 1485P
    ↓
申請成功
```

### 新流程（當前）

```
用戶輸入提領金額（例如 5000P）
    ↓
檢查: 5000P ≤ 最大提領Point(5000P) ✅
    ↓
檢查: 5000P ≤ 每日上限(8000P) ✅
    ↓
檢查: 5000P % 1000 === 0 ✅
    ↓
檢查: 5000 + 15 ≤ 可提領(5500P) ✅
    ↓
扣除: 可提領 - 5000 - 15 = 485P
    ↓
申請成功
```

**差異：**
- ✅ 不再檢查「預留費用」
- ✅ 新增「每日上限」檢查
- ✅ 新增「1000 倍數」檢查

---

## 🚀 部署注意事項

### 1. 數據遷移
- ✅ 無需數據遷移（新規則不影響現有數據結構）
- ✅ 現有提領記錄保持不變

### 2. 向後兼容性
- ✅ 完全向後兼容
- ✅ 舊的提領記錄仍可正常查看和處理

### 3. 用戶通知
- ⚠️ 建議在系統公告通知用戶新規則：
  - 移除預留費用概念
  - 新增每日提領上限 8000P
  - 一天只能提領一次

---

## 📝 總結

### 主要變更
1. ✅ 移除「預留費用」概念（簡化計算）
2. ✅ 新增「每日提領上限」8000P（風險控制）
3. ✅ 強制「1000 倍數」驗證（前後端雙重檢查）
4. ✅ 更新 UI 文字和計算顯示（提升用戶體驗）

### 用戶受益
- ✅ 計算邏輯更簡單易懂
- ✅ 可提領金額更多（移除 273P 預留）
- ✅ 規則更透明（明確顯示每日上限）

### 系統受益
- ✅ 代碼邏輯更簡潔
- ✅ 維護成本更低
- ✅ 風險控制更好（每日上限）

---

**更新完成日期**: 2024-12-24  
**更新者**: AI Assistant (Claude)  
**驗證狀態**: 待測試
