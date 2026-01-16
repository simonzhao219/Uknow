# 提領流程確認步驟新增文檔

**修改日期**: 2024-12-24  
**修改原因**: 在身分驗證前新增確認步驟，讓用戶確認提領金額和統計數據變化  
**影響範圍**: 前端提領流程

---

## 📋 修改摘要

### 修改前（2步驟流程）

```
步驟1: 設定提領Point
  ↓
步驟2: 填寫身分驗證資料 → 提交
```

**問題：**
- ❌ 用戶直接進入身分驗證，無法確認金額
- ❌ 看不到提領後的數據變化
- ❌ 填寫身分證等敏感資料前沒有機會再次確認

---

### 修改後（3步驟流程）

```
步驟1: 設定提領Point
  ↓
步驟2: 確認資訊 ⭐ 新增
  ├── 提領明細
  ├── 統計數據變化預覽（可提領、處理中）
  └── 重要提醒
  ↓
步驟3: 填寫身分驗證資料 → 提交
```

**優點：**
- ✅ 用戶在填寫敏感資料前可以確認金額
- ✅ 清晰看到統計數據的變化（當前 → 提領後）
- ✅ 減少錯誤提領的機會
- ✅ 提升用戶體驗和信任度

---

## 🎨 步驟2 UI 設計

### **1. 提領明細區塊**

```
┌─────────────────────────────┐
│ 提領明細                    │
├─────────────────────────────┤
│ 提領Point       1,000P      │
│ 提領手續費         -15P     │
├─────────────────────────────┤
│ 總計需扣除     -1,015P      │ ← 紅色顯示
└─────────────────────────────┘
```

### **2. 統計數據變化預覽區塊**（重點⭐）

```
┌──────────────────────────────────────────────┐
│ 統計數據變化預覽                             │
├──────────────────────────────────────────────┤
│ 可提領Point                                  │
│ ┌─────────┐  →  ┌─────────┐                 │
│ │  當前   │     │ 提領後  │                 │
│ │ 40,000P │  →  │ 38,985P │                 │
│ └─────────┘     └─────────┘                 │
│                                              │
│ 處理中Point                                  │
│ ┌─────────┐  →  ┌─────────┐                 │
│ │  當前   │     │ 提領後  │                 │
│ │     0P  │  →  │  1,015P │                 │
│ └─────────┘     └─────────┘                 │
└──────────────────────────────────────────────┘
```

### **3. 重要提醒區塊**

```
┌─────────────────────────────┐
│ ⓘ 請確認以上資訊：          │
│ • 提領申請送出後無法修改     │
│ • Point立即轉為「處理中」    │
│ • 處理時間約 3-5 個工作天    │
│ • 請確保銀行帳號正確         │
└─────────────────────────────┘
```

---

## 💻 前端修改詳情

### 文件：`/components/reward/WithdrawalProcess.tsx`

#### **1. 步驟總數修改**

```typescript
// ❌ 修改前
const [currentStep, setCurrentStep] = useState(1);  // 1: 設定Point, 2: 身分驗證

// ✅ 修改後
const [currentStep, setCurrentStep] = useState(1);  // 1: 設定Point, 2: 確認資訊, 3: 身分驗證
```

#### **2. 步驟指示器修改**

```tsx
// ✅ 新增步驟2
<div className="flex items-center">
  <div className={`w-8 h-8 rounded-full ... ${currentStep >= 2 ? '...' : '...'}`}>
    2
  </div>
  <span>確認資訊</span>
</div>
<ArrowRight />
<div className="flex items-center">
  <div className={`w-8 h-8 rounded-full ... ${currentStep >= 3 ? '...' : '...'}`}>
    3
  </div>
  <span>身分驗證</span>
</div>
```

#### **3. 新增步驟2內容**

```tsx
{currentStep === 2 && (
  <div className="space-y-6">
    {/* 提領明細 */}
    <div className="bg-muted p-4 rounded-lg space-y-3">
      <h3>提領明細</h3>
      <div>
        <div>提領Point: {amountNum.toLocaleString()}P</div>
        <div>提領手續費: -{WITHDRAWAL_FEE}P</div>
        <div className="text-red-600">總計需扣除: -{(amountNum + WITHDRAWAL_FEE).toLocaleString()}P</div>
      </div>
    </div>

    {/* 統計數據變化預覽 */}
    <div className="border-2 border-blue-200 bg-blue-50 p-4 rounded-lg space-y-3">
      <h3>統計數據變化預覽</h3>
      
      {/* 可提領Point變化 */}
      <div>
        <div>可提領Point</div>
        <div className="flex items-center gap-3">
          <div>當前: {availableRewards.toLocaleString()}P</div>
          <ArrowRight />
          <div>提領後: {(availableRewards - amountNum - WITHDRAWAL_FEE).toLocaleString()}P</div>
        </div>
      </div>

      {/* 處理中Point變化 */}
      <div>
        <div>處理中Point</div>
        <div className="flex items-center gap-3">
          <div>當前: {pendingRewards.toLocaleString()}P</div>
          <ArrowRight />
          <div>提領後: {(pendingRewards + amountNum + WITHDRAWAL_FEE).toLocaleString()}P</div>
        </div>
      </div>
    </div>

    {/* 重要提醒 */}
    <Alert>
      <AlertDescription>
        <strong>請確認以上資訊：</strong>
        <ul>
          <li>提領申請送出後無法修改或取消</li>
          <li>Point將立即從「可提領」轉為「處理中」</li>
          <li>處理時間約 3-5 個工作天</li>
          <li>請確保提供的銀行帳號正確無誤</li>
        </ul>
      </AlertDescription>
    </Alert>

    <div className="flex gap-4">
      <Button onClick={handleBack}>上一步</Button>
      <Button onClick={() => setCurrentStep(3)}>確認並繼續</Button>
    </div>
  </div>
)}
```

#### **4. 原步驟2改為步驟3**

```tsx
// ✅ 條件改為 currentStep === 3
{currentStep === 3 && (
  <div className="space-y-6">
    {/* 身分驗證表單內容 */}
  </div>
)}
```

---

## 📊 統計數據計算邏輯

### 前端計算（步驟2預覽）

```typescript
// 提領後的可提領Point
const newAvailableRewards = availableRewards - amountNum - WITHDRAWAL_FEE;

// 提領後的處理中Point
const newPendingRewards = pendingRewards + amountNum + WITHDRAWAL_FEE;
```

### 後端更新（提交後）

```typescript
// /supabase/functions/server/rewards.ts

// Line 221: 計算總計需扣除
const totalRequired = amount + WITHDRAWAL_FEE;

// Line 256-257: 更新獎勵資料
rewards.availableRewards -= totalRequired;  // 扣除（提領 + 手續費）
rewards.pendingRewards += totalRequired;     // 增加（提領 + 手續費）
```

### ✅ 前後端一致性確認

| 項目 | 前端計算 | 後端更新 | 一致性 |
|------|---------|---------|--------|
| 可提領扣除 | `- amountNum - WITHDRAWAL_FEE` | `- totalRequired` | ✅ 一致 |
| 處理中增加 | `+ amountNum + WITHDRAWAL_FEE` | `+ totalRequired` | ✅ 一致 |

---

## 🧪 測試場景

### **場景1：正常提領流程**

**測試步驟：**
1. 步驟1：輸入提領 1,000P
2. 點擊「下一步」
3. 步驟2：確認資訊
   - ✅ 提領明細顯示：1,000P - 15P = 1,015P
   - ✅ 可提領變化：40,000P → 38,985P
   - ✅ 處理中變化：0P → 1,015P
4. 點擊「確認並繼續」
5. 步驟3：填寫身分驗證
6. 提交申請
7. ✅ 後端更新：availableRewards -= 1015, pendingRewards += 1015

### **場景2：返回修改金額**

**測試步驟：**
1. 步驟1：輸入 1,000P → 下一步
2. 步驟2：看到預覽 → 點擊「上一步」
3. 步驟1：修改為 2,000P → 下一步
4. 步驟2：確認資訊
   - ✅ 提領明細更新為：2,000P - 15P = 2,015P
   - ✅ 可提領變化更新為：40,000P → 37,985P
   - ✅ 處理中變化更新為：0P → 2,015P

### **場景3：提領後餘額不足**

**前提：** 可提領 = 1,014P

**測試步驟：**
1. 步驟1：輸入 1,000P → 下一步
2. 步驟2：確認資訊
   - ✅ 提領明細：1,000P - 15P = 1,015P
   - ✅ 可提領變化：1,014P → -1P ❌ **顯示負數警告**

**預期：** 步驟1應該阻止輸入（maxWithdrawal 計算正確）

---

## 🎯 用戶體驗提升

### **修改前的用戶困惑**

1. ❌ "我輸入1000P，為什麼扣了1015P？"
2. ❌ "我的可提領怎麼少了這麼多？"
3. ❌ "處理中怎麼突然增加了？"
4. ❌ "我還沒確認就要填身分證？"

### **修改後的清晰流程**

1. ✅ 步驟1：設定金額（心理預期：我要提領1000P）
2. ✅ 步驟2：看到明細（理解：原來要扣15P手續費，總共1015P）
3. ✅ 步驟2：看到變化（確認：可提領會減少1015P，處理中會增加1015P）
4. ✅ 步驟3：填寫資料（信任：我已經確認過金額了，現在填資料）

---

## 📝 UI 文案設計

### **步驟指示器**

```
步驟 1/3: 設定提領Point
步驟 2/3: 確認資訊  ← 新增
步驟 3/3: 填寫身分驗證資料
```

### **步驟2標題**

```
CardDescription: "確認資訊"
```

### **統計數據變化區塊**

```
標題: "統計數據變化預覽"
子標題1: "可提領Point"
子標題2: "處理中Point"
```

### **按鈕文案**

```
步驟1 → 步驟2: "下一步"
步驟2 → 步驟1: "上一步"
步驟2 → 步驟3: "確認並繼續"  ← 明確表達用戶的操作意圖
```

---

## ✅ 完成的修改

### 前端修改

- [x] 步驟總數從 2 改為 3
- [x] 新增步驟2：確認資訊
- [x] 顯示提領明細（提領 + 手續費 = 總計）
- [x] 顯示可提領Point變化（當前 → 提領後）
- [x] 顯示處理中Point變化（當前 → 提領後）
- [x] 新增重要提醒區塊
- [x] 更新步驟指示器UI
- [x] 更新按鈕文案

### 後端確認

- [x] 確認後端計算邏輯與前端一致
- [x] 確認 `rewards.availableRewards -= totalRequired`
- [x] 確認 `rewards.pendingRewards += totalRequired`

---

## 🚀 部署清單

### 部署前檢查

- [ ] 測試場景1：正常提領流程
- [ ] 測試場景2：返回修改金額
- [ ] 測試場景3：邊界值測試（最小/最大提領）
- [ ] 測試場景4：餘額不足情況
- [ ] 檢查前後端計算一致性

### 部署後驗證

- [ ] 確認步驟指示器正確顯示（1/3, 2/3, 3/3）
- [ ] 確認步驟2預覽數據準確
- [ ] 確認統計數據變化正確
- [ ] 確認提交後數據庫更新正確

---

## 📚 相關文檔

- [提領規則更新文檔](/docs/WITHDRAWAL_RULE_UPDATE.md)
- [SSOT 點數架構重構文檔](/docs/SSOT_POINTS_REFACTOR.md)
- [Guidelines.md](/Guidelines.md)

---

**修改完成日期**: 2024-12-24  
**修改者**: AI Assistant (Claude)  
**驗證狀態**: 待測試  
**用戶體驗**: ✅ 已優化
