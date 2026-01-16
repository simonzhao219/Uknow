# 三步驟驗證 Dialog 深度分析與重構方案

## 📊 現狀分析

### 場景 1：任務獎勵領取 (`ClaimRewardDialog`)

**流程:**
1. **步驟 1** - 確認領取
   - 顯示獎勵資訊（任務名稱、金額、達成時間）
   - 不可逆警告
   - 客服聯繫資訊
   
2. **步驟 2** - 預覽點數變化
   - ✅ **即時從後端獲取最新點數**（`/rewards/points-preview`）
   - 顯示可提領點數變化
   - 顯示總累積點數變化
   - 載入狀態 + 錯誤重試
   
3. **步驟 3** - 身分證驗證
   - 手動驗證身分證格式
   - 確認按鈕 + 載入狀態

**架構特點:**
- ✅ 單一組件包含所有3個步驟
- ✅ 使用 `step` 狀態切換
- ✅ 實時API預覽數據
- ✅ 完善的錯誤處理和載入狀態
- ⚠️ 身分證驗證邏輯內嵌（與場景3重複）

---

### 場景 2：提領查收確認 (`WithdrawalHistory`)

**現狀:**
- ❌ **僅有簡單按鈕 + Toast通知**
- ❌ **缺少完整的三步驟流程**
- ❌ **缺少身分證驗證**

**需求補充:**
1. **步驟 1** - 確認查收
   - 顯示提領金額、實收金額、手續費
   - 提醒查收後的影響
   
2. **步驟 2** - 預覽點數變化
   - 從後端獲取最新點數
   - 顯示查收後點數變化（凍結點數 → 提領歷史）
   
3. **步驟 3** - 身分證驗證
   - 統一的身分證驗證組件

---

### 場景 3：取消訂閱 (`CancelSubscription`)

**流程:**
1. **步驟 1** - 警告取消影響 (`CancelConfirmDialog`)
   - 警告訊息（刊登失效、點數無法提領、獎勵停止、任務重置）
   - 替代方案建議
   - 客服聯繫資訊
   
2. **步驟 2** - 預覽狀態變化 (`CancelPreviewDialog`)
   - ✅ **即時從後端獲取預覽數據**（`/subscriptions/preview-cancel`）
   - 顯示訂閱狀態變化
   - 顯示下個週期變化
   - 重要提醒
   
3. **步驟 3** - 身分證驗證 (`CancelVerifyDialog`)
   - ✅ **使用統一的 `IdNumberInput` 組件**
   - 最後確認提示

**架構特點:**
- ✅ 3個獨立Dialog組件
- ✅ 父組件控制步驟流程
- ✅ 使用統一的 `IdNumberInput` 組件
- ✅ 實時API預覽數據
- ✅ 每個步驟都有清晰的警告和說明

---

## 🔍 三者對比

| 維度 | 場景1 (任務獎勵) | 場景2 (提領查收) | 場景3 (取消訂閱) |
|------|----------------|----------------|----------------|
| **架構模式** | 單一Dialog + 內部狀態 | ❌ 缺少 | 多個Dialog組件 |
| **步驟控制** | 內部 `step` 狀態 | - | 父組件控制 |
| **預覽數據** | ✅ 實時API | ❌ 缺少 | ✅ 實時API |
| **身分證驗證** | ⚠️ 內嵌邏輯 | ❌ 缺少 | ✅ 統一組件 (`IdNumberInput`) |
| **錯誤處理** | ✅ 完善 | ❌ 缺少 | ✅ 完善 |
| **載入狀態** | ✅ 完善 | ❌ 缺少 | ✅ 完善 |
| **代碼重用性** | ❌ 低 | - | ⚠️ 中（僅驗證組件重用）|

---

## 🎯 問題與機會

### 問題

1. **代碼重複** - 三個場景的流程邏輯幾乎相同，但各自實現
2. **不一致的UX** - 場景1和場景3的架構完全不同
3. **維護成本高** - 修改流程需要同步更新多處
4. **缺少統一規範** - 新增類似功能時沒有模板可遵循

### 機會

1. **提取共用架構** - 創建通用的3步驟Dialog框架
2. **統一身分證驗證** - 所有場景使用同一驗證模組（已有 `IdNumberInput`）
3. **配置化設計** - 通過配置對象定義各場景的獨特內容
4. **降低開發成本** - 新增類似功能只需編寫配置，無需重寫流程

---

## 💡 重構方案

### 核心設計理念

**採用「通用容器 + 場景配置」架構**

- **通用容器**: 處理3步驟流程、狀態管理、錯誤處理、載入狀態
- **場景配置**: 每個場景提供獨特的內容、API端點、驗證邏輯

### 架構設計

```
/components/common/
├── ThreeStepDialog.tsx              # 通用的3步驟Dialog容器
├── IdNumberVerification.tsx         # 統一的身分證驗證步驟組件
└── verification-configs/
    ├── claimRewardConfig.tsx        # 任務獎勵配置
    ├── withdrawalConfig.tsx         # 提領查收配置
    └── cancelSubscriptionConfig.tsx # 取消訂閱配置
```

### 組件職責

#### 1. `ThreeStepDialog` (通用容器)

**職責:**
- 管理步驟狀態（1 → 2 → 3）
- 處理載入狀態和錯誤
- 調用API獲取預覽數據（步驟2）
- 調用API提交驗證（步驟3）
- 渲染配置提供的內容

**Props:**
```typescript
interface ThreeStepDialogProps {
  isOpen: boolean;
  config: ThreeStepConfig;  // 場景配置
  onClose: () => void;
  onConfirm: (idNumber: string) => Promise<void>;
  defaultPreviewData?: any; // Fallback數據
}
```

#### 2. `IdNumberVerification` (統一驗證步驟)

**職責:**
- 渲染身分證輸入框（使用 `IdNumberInput`）
- 顯示最後確認提示
- 處理驗證狀態

**Props:**
```typescript
interface IdNumberVerificationProps {
  onBack: () => void;
  onConfirm: (idNumber: string) => Promise<void>;
  warningMessage: string;  // 場景特定的警告訊息
  isSubmitting: boolean;
  error?: string;
}
```

#### 3. 場景配置對象

**範例: `claimRewardConfig.tsx`**
```typescript
export function createClaimRewardConfig(reward: PendingMissionReward) {
  return {
    // 標題和描述
    title: '領取任務獎勵',
    
    // 步驟1內容
    step1: {
      title: '⚠️ 確認領取任務獎勵',
      description: '請仔細閱讀以下說明後再繼續',
      content: <ClaimRewardStep1Content reward={reward} />
    },
    
    // 步驟2配置
    step2: {
      title: '📊 領取後點數變化預覽',
      description: '確認以下資訊無誤後，請繼續下一步驗證身分',
      apiEndpoint: '/rewards/points-preview',
      content: (data) => <PointsPreviewContent data={data} reward={reward} />
    },
    
    // 步驟3配置
    step3: {
      warningMessage: '點擊「確認領取」後，獎勵將立即加入您的可提領點數。此操作無法撤銷。'
    },
    
    // API端點
    confirmEndpoint: `/tasks/claim-reward/${reward.id}`
  };
}
```

---

## 📐 實施步驟

### 第一階段：創建通用框架

1. ✅ 創建 `ThreeStepDialog.tsx` 通用容器
2. ✅ 創建 `IdNumberVerification.tsx` 統一驗證組件
3. ✅ 定義 `ThreeStepConfig` 介面

### 第二階段：提取場景配置

1. ✅ 創建 `claimRewardConfig.tsx`
2. ✅ 創建 `withdrawalConfig.tsx`
3. ✅ 創建 `cancelSubscriptionConfig.tsx`

### 第三階段：重構現有代碼

1. ✅ 重構 `ClaimRewardDialog` 使用新架構
2. ✅ 實現完整的 `WithdrawalCollectionDialog`
3. ✅ 重構取消訂閱流程使用新架構

### 第四階段：後端統一驗證

1. ✅ 創建統一的身分證驗證函數（後端）
2. ✅ 更新所有API端點使用統一驗證
3. ✅ 確保錯誤訊息一致性

---

## 🎨 UX改進

### 統一的視覺語言

所有三步驟Dialog將共享：
- ✅ 一致的步驟指示器（1/3、2/3、3/3）
- ✅ 統一的按鈕佈局（上一步｜下一步）
- ✅ 統一的載入狀態動畫
- ✅ 統一的錯誤提示樣式
- ✅ 統一的警告卡片樣式

### 用戶體驗優化

- ✅ 步驟2自動獲取最新數據
- ✅ 錯誤時提供重試按鈕
- ✅ 步驟間可自由返回
- ✅ 清晰的進度指示
- ✅ 友善的錯誤訊息

---

## 📊 預期成果

### 代碼指標

| 指標 | 重構前 | 重構後 | 改善 |
|------|--------|--------|------|
| 總代碼行數 | ~1200行 | ~800行 | **-33%** |
| 重複代碼 | ~400行 | 0行 | **-100%** |
| 單個Dialog | ~400行 | ~100行 | **-75%** |
| 新增功能時間 | 2-3天 | 2-3小時 | **-90%** |

### 維護性提升

- ✅ 修改流程邏輯：1處修改 vs 原本3處
- ✅ 新增類似功能：編寫配置 vs 原本完整實現
- ✅ 統一錯誤處理：自動繼承 vs 原本各自實現
- ✅ UX一致性：100% vs 原本30%

---

## 🚀 後續擴展

重構完成後，未來新增類似的三步驟驗證流程（例如：刪除刊登、修改重要資料等）只需：

1. 創建配置文件（~50行代碼）
2. 定義步驟內容組件（~100行代碼）
3. 在父組件中使用 `ThreeStepDialog`（~10行代碼）

**總計：~160行代碼 vs 原本 ~400行代碼**

---

## ✅ 檢查清單

重構完成後需驗證：

- [ ] 所有3個場景都使用新架構
- [ ] 身分證驗證邏輯統一（前端 + 後端）
- [ ] API端點都返回一致的數據格式
- [ ] 錯誤訊息統一且友善
- [ ] 載入狀態在所有場景正常運作
- [ ] 步驟間導航流暢
- [ ] 視覺樣式100%一致
- [ ] 無功能退化（所有原有功能正常）

---

**結論**: 採用「通用容器 + 場景配置」架構，可大幅降低代碼重複、提升維護性、確保UX一致性，並為未來擴展提供堅實基礎。
