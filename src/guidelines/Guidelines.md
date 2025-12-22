# General guidelines

- 每次都要考慮UI/UX、可維護性、效能做設計。

## 功能實作完成驗證清單 ⭐

**在提交任何功能前，必須通過以下所有檢查項：**

### ✅ 後端實作檢查

- [ ] API 端點已實施並測試
- [ ] 數據結構包含所有必要字段
- [ ] 錯誤處理完整（401 未登入、500 伺服器錯誤）
- [ ] 日誌記錄清晰（成功、警告、錯誤）
- [ ] **路由定義順序正確（具體路由在動態路由之前）** ⚠️ 重要

### ✅ 前端實作檢查

- [ ] TypeScript interface 定義完整
- [ ] API 請求邏輯已實作（使用 `apiRequestJson`）
- [ ] **UI 組件已渲染**（按鈕、列表、展開區域等）
- [ ] 格式化工具使用正確
- [ ] 錯誤處理完整（顯示錯誤提示）

### ✅ 用戶體驗檢查

- [ ] **用戶能看到預期的信息**
- [ ] **用戶能執行預期的操作**（點擊按鈕、查看詳情）
- [ ] 錯誤信息清晰友好
- [ ] 載入狀態有提示（Loader、禁用按鈕）

### ✅ 用戶操作流程檢查

**列出完整的用戶操作步驟：**

1. [ ] 用戶打開頁面 → 能看到主要內容
2. [ ] 用戶看到提示 → 能理解功能
3. [ ] 用戶點擊按鈕 → 觸發預期操作
4. [ ] 用戶等待載入 → 看到載入狀態
5. [ ] 用戶查看結果 → 看到完整數據
6. [ ] 用戶關閉閉/返回 → 正常收起或返回

**⚠️ 如果任何一個步驟無法執行，功能未完成！**

### ✅ 文檔一致性檢查

- [ ] Guidelines.md 描述與實作一致
- [ ] 範例代碼正確且可執行
- [ ] 檢查清單完整

---

# 目錄說明

## Hooks 目錄文件說明

`/hooks` 目錄包含可重用的自定義 React Hooks，遵循 DRY (Don't Repeat Yourself) 原則。

### 目錄結構
```
/hooks/
└── useBackNavigation.ts     # 智能返回導航 Hook
```

### 文件詳細說明

#### 1. useBackNavigation.ts - 智能返回導航 Hook
提供統一的返回導航邏輯：
- 如果有瀏覽歷史，返回上一頁
- 如果沒有瀏覽歷史（直接訪問URL），導航到首頁

**使用範例：**
```tsx
import { useBackNavigation } from '../hooks/useBackNavigation';

export function MyComponent() {
  const handleBack = useBackNavigation();
  
  return (
    <Button onClick={handleBack}>
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );
}
```

### 使用建議

在未來如果需要新增自定義 Hooks，建議：
1. **導航相關** → 放入 `/hooks` 目錄
2. **Hook 命名** → 使用 `use` 前綴（React 慣例）
3. **單一職責** → 每個 Hook 只負責一個功能
4. **可重用性** → 確保 Hook 可以在多個組件中使用
5. **文檔註解** → 在 Hook 文件中添加 JSDoc 註解說明使用方法

---

## Utils 目錄文件說明

`/utils` 目錄包含共用功能常數配置，避免代碼重複並統一維護。

### 目錄結構
```
/utils/
├── constants.ts              # 全局常數配置
├── contactValidation.ts      # 聯絡方式驗證工具
├── districtSelection.ts      # 區域選擇邏輯
├── formHelpers.tsx           # 表單輔助工具
├── generateIds.ts            # ID 生成器與 Mock 數據
├── auth.ts                   # 統一認證工具 ✅
├── apiClient.ts              # 統一 API 請求工具 ✅
└── supabase/
    ├── client.ts             # Supabase Client 單例
    └── info.tsx              # Supabase 配置（受保護文件）
```

### 文件詳細說明

#### 1. constants.ts - 全局常數配置
存放整個應用程式中的數字常數和配置值

#### 2. contactValidation.ts - 聯絡方式驗證工具
提供社交平台聯絡方式的格式驗證

#### 3. districtSelection.ts - 區域選擇邏輯
處理服務範圍選擇的核心邏輯（台北市各區域勾選）

#### 4. formHelpers.tsx - 表單輔助工具
提供統一的表單錯誤顯示樣式

#### 5. generateIds.ts - ID 生成器與 Mock 數據
處理用戶和刊登的唯一識別碼生成

#### 6. auth.ts - 統一認證工具 ✅
**所有組件必須使用這個工具來處理認證**
- `getAccessToken()` - 獲取當前用戶的 access token
- `isAuthenticated()` - 檢查戶是否已登入
- `getSession()` - 獲取完整 session 對象

#### 7. apiClient.ts - 統一 API 請求工具 ✅
**所有 API 請求必須使用這個工具**
- `apiRequest()` - 發送 API 請求（自動附加認證 token）
- `apiRequestJson()` - 發送 API 請求並解析 JSON
- `buildApiUrl()` - 構建後端 API URL
- `ApiError` - API 錯誤類別（包含 status 和 code）

#### 8. supabase/client.ts - Supabase Client 單例
提供統一的 Supabase Client 實例
- `createClient()` - 獲取 Supabase Client 單例

#### 9. supabase/info.tsx - Supabase 配置（受保護）
**這是自動生成的受保護文件，請勿手動編輯**
- 存放 Supabase 專案的連接資訊
- `projectId` - 專案 ID
- `publicAnonKey` - 公開匿名金鑰

### 使用建議

在未來如果需要新增其他常數或工具函數，建議：
1. **數字常數** → 放入 `constants.ts`
2. **驗證邏輯** → 放入 `contactValidation.ts` 或創建新的驗證文件
3. **表單相關** → 放入 `formHelpers.tsx`
4. **ID/隨機生成** → 放入 `generateIds.ts`
5. **認證相關** → 使用 `auth.ts` 的統一方法
6. **API 請求** → 使用 `apiClient.ts` 的統一方法
7. **複雜業務邏輯** → 創建專門的工具文件（如 `districtSelection.ts`）

---

## 後端路由定義規範 ⚠️⚠️⚠️

**所有後端路由的定義順序都必須遵循以下規範，否則可能導致路由無法訪問！**

### 🚨 黃金規則

**具體路由必須放在動態路由之前！**

```
✅ 正確順序：固定路徑 → 動態路由
❌ 錯誤順序：動態路由 → 固定路徑（固定路徑永遠不會被執行！）
```

### 📋 路由順序原則

路由匹配規則（Hono、Express、Koa 等框架通用）：
1. **按定義順序匹配**：從上到下逐一檢查
2. **第一個匹配的路由生效**：找到匹配的路由後，立即執行，不再繼續檢查
3. **動態路由匹配任何值**：`/:param` 會匹配任何路徑段

### ✅ 正確的路由定義順序

```typescript
// ✅ 正確順序（從具體到動態）
const router = new Hono();

// 1. 根路由
router.get('/', ...)                    // GET /tasks/

// 2. 完全固定路徑（最具體）
router.get('/monthly-summary', ...)     // GET /tasks/monthly-summary
router.get('/current-month-top', ...)   // GET /tasks/current-month-top

// 3. 部分固定路徑（次具體）
router.get('/details/:month', ...)      // GET /tasks/details/2024-12

// 4. 動態路由（必須放在最後！）
router.get('/:taskId', ...)             // GET /tasks/:taskId（匹配任何值）
```

### ❌ 錯誤的路由定義順序

```typescript
// ❌ 錯誤順序（動態路由在前）
const router = new Hono();

router.get('/', ...)                    // GET /tasks/
router.get('/:taskId', ...)             // ❌ 動態路由放在前面
router.get('/monthly-summary', ...)     // ❌ 永遠不會執行！被 /:taskId 攔截
router.get('/current-month-top', ...)   // ❌ 永遠不會執行！被 /:taskId 攔截
router.get('/details/:month', ...)      // ❌ 永遠不會執行！被 /:taskId 攔截

// 當訪問 GET /tasks/monthly-summary 時：
// 1. 匹配 /:taskId → ✅ 匹配成功（taskId = "monthly-summary"）
// 2. 停止匹配，執行 /:taskId 的處理函數
// 3. /monthly-summary 永遠不會被執行
```

### 🔍 為什麼會這樣？

**動態路由的匹配範圍：**
```typescript
// 動態路由 /:taskId 會匹配以下所有路徑：
GET /tasks/consecutive_referral   ✅ 匹配（taskId = "consecutive_referral"）
GET /tasks/monthly_king            ✅ 匹配（taskId = "monthly_king"）
GET /tasks/monthly-summary         ✅ 匹配（taskId = "monthly-summary"）← 問題！
GET /tasks/current-month-top       ✅ 匹配（taskId = "current-month-top"）← 問題！
GET /tasks/any-random-string       ✅ 匹配（taskId = "any-random-string"）
```

### 📊 路由順序決策樹

```
路由類型分類：
├── 根路由（/）              → 優先級 1（最高）
├── 完全固定路徑             → 優先級 2
│   └── /monthly-summary
│   └── /current-month-top
├── 部分固定路徑             → 優先級 3
│   └── /details/:month
└── 動態路由                 → 優先級 4（最低，必須放最後！）
    └── /:taskId
```

### 🛠️ 實戰範例

#### **tasks.ts 路由定義（正確）**

```typescript
import { Hono } from 'npm:hono@4.3.11';

const tasks = new Hono();

// ========================================
// 路由定義順序規範：
// 1. 根路由 (/)
// 2. 具體路由 (/fixed-path, /fixed/:param)
// 3. 動態路由 (/:dynamic) - 必須放在最後！
// ========================================

// 1. 根路由
tasks.get('/', async (c) => {
  // GET /tasks/
});

// 2. 具體路由 - 月度詳情
tasks.get('/details/:month', async (c) => {
  // GET /tasks/details/2024-12
});

// 3. 具體路由 - 月度摘要
tasks.get('/monthly-summary', async (c) => {
  // GET /tasks/monthly-summary
});

// 4. 具體路由 - 本月前N筆
tasks.get('/current-month-top', async (c) => {
  // GET /tasks/current-month-top
});

// 5. 動態路由 - 獲取單個任務（必須放最後！）
tasks.get('/:taskId', async (c) => {
  // GET /tasks/:taskId
  // ⚠️ 此路由必須放在最後，否則會攔截所有上面的請求！
});

export default tasks;
```

### 🧪 測試驗證方法

**新增路由後，立即測試所有端點：**

```bash
# 測試固定路徑路由
curl -H "Authorization: Bearer {token}" \
  https://{projectId}.supabase.co/functions/v1/make-server-5c6718b9/tasks/monthly-summary

# 測試動態路由
curl -H "Authorization: Bearer {token}" \
  https://{projectId}.supabase.co/functions/v1/make-server-5c6718b9/tasks/consecutive_referral

# 如果固定路徑返回「無效的任務 ID」→ 路由順序錯誤！
```

### ✅ 代碼審查檢查清單

**在提交任何新增路由的代碼前，請確認：**

**路由順序檢查：**
- [ ] 是否有動態路由（如 `/:id`、`/:taskId`）？
- [ ] 動態路由是否放在文件最後？
- [ ] 所有具體路由是否都在動態路由之前？
- [ ] 路由文件是否有註釋說明順序規則？

**測試驗證：**
- [ ] 是否測試了新增的 API 端點？
- [ ] 是否確認返回數據正確？
- [ ] 是否確認不會返回「無效的 ID」錯誤？
- [ ] 是否測試了動態路由仍然正常工作？

**文檔記錄：**
- [ ] 是否在路由文件頂部添加順序規範註釋？
- [ ] 是否在動態路由前添加警告註釋？

### 🚨 常見錯誤案例

#### **案例 1：動態路由攔截具體路由**

**錯誤代碼：**
```typescript
tasks.get('/:taskId', ...)          // 動態路由
tasks.get('/monthly-summary', ...)  // 永遠不會執行
```

**錯誤表現：**
```
GET /tasks/monthly-summary
→ 返回：{ error: { message: '無效的任務 ID' } }
→ 原因：/:taskId 把 "monthly-summary" 當作 taskId 處理
```

**正確修復：**
```typescript
tasks.get('/monthly-summary', ...)  // 具體路由（先）
tasks.get('/:taskId', ...)          // 動態路由（後）
```

#### **案例 2：忘記調整新增路由的順序**

**場景：** 在已有動態路由的文件中新增固定路徑路由

**錯誤做法：**
```typescript
// 現有代碼
tasks.get('/', ...)
tasks.get('/:taskId', ...)  // 已存在的動態路由

// ❌ 直接在文件末尾新增（錯誤！）
tasks.get('/monthly-summary', ...)  // 新增的路由
```

**正確做法：**
```typescript
// 1. 識別出動態路由的位置
tasks.get('/', ...)
tasks.get('/:taskId', ...)  // ← 動態路由

// 2. 把動態路由移到最後
tasks.get('/', ...)
tasks.get('/monthly-summary', ...)  // ← 新增的路由放在動態路由前
tasks.get('/:taskId', ...)          // ← 動態路由移到最後
```

### 📝 路由註釋規範

**在動態路由前添加警告註釋：**

```typescript
/**
 * GET /tasks/:taskId - 獲取單個任務
 * 
 * ⚠️ 注意：此動態路由必須放在所有具體路由之後，否則會攔截所有請求！
 * 
 * Parameters:
 * - taskId: 任務 ID (consecutive_referral | monthly_king)
 */
tasks.get('/:taskId', async (c) => {
  // ...
});
```

### 🎯 總結

| 規則 | 說明 |
|------|------|
| **定義順序** | 根路由 → 具體路由 → 動態路由 |
| **動態路由位置** | **必須放在最後** |
| **新增路由** | 檢查是否已有動態路由，如有則插入其前面 |
| **測試驗證** | 新增路由後立即測試所有端點 |
| **註釋說明** | 在動態路由前添加警告註釋 |

**⚠️ 違反此規範的後果：**
- 具體路由無法訪問（返回錯誤）
- 難以調試（表面上看代碼沒問題）
- 浪費大量時間排查問題

**✅ 遵循此規範的好處：**
- 所有路由正常工作
- 代碼易於維護
- 團隊協作更順暢

---

## 認證與 API 請求規範 ⚠️

**所有涉及用戶認證和 API 請求的代碼都必須遵循以下規範，避免「未登入」錯誤。**

### ✅ 正確的認證方式

#### **1. 獲取 Access Token**
```typescript
import { getAccessToken } from '../utils/auth';

const token = await getAccessToken();

if (!token) {
  showToast('請先登入', 'error');
  navigate('/login');
  return;
}
```

#### **2. 檢查登入狀態**
```typescript
import { isAuthenticated } from '../utils/auth';

if (!(await isAuthenticated())) {
  showToast('請先登入', 'error');
  navigate('/login');
  return;
}
```

#### **3. 獲取完整 Session**
```typescript
import { getSession } from '../utils/auth';

const session = await getSession();

if (!session) {
  showToast('請先登入', 'error');
  return;
}

console.log('User ID:', session.user.id);
```

### ✅ 正確的 API 請求方式

#### **1. 使用 apiRequestJson（推薦）**
```typescript
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';

try {
  const result = await apiRequestJson<RewardsData>(
    buildApiUrl('/rewards')
  );
  
  console.log('獎勵資料:', result);
} catch (err) {
  if (err instanceof ApiError && err.status === 401) {
    showToast('登入已過期，請重新登入', 'error');
    navigate('/login');
  } else {
    showToast(err.message, 'error');
  }
}
```

#### **2. 使用 apiRequest（需要自訂處理）**
```typescript
import { apiRequest, buildApiUrl } from '../utils/apiClient';

try {
  const response = await apiRequest(buildApiUrl('/profile'), {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  
  const result = await response.json();
} catch (err) {
  // 錯誤處理...
}
```

#### **3. 構建 API URL**
```typescript
import { buildApiUrl } from '../utils/apiClient';

const url = buildApiUrl('/rewards');
// 返回: https://{projectId}.supabase.co/functions/v1/make-server-5c6718b9/rewards

const urlWithParams = buildApiUrl('/rewards/history?limit=50');
// 返回: https://{projectId}.supabase.co/functions/v1/make-server-5c6718b9/rewards/history?limit=50
```

### ❌ 禁止的做法

#### **❌ 錯誤 1：直接從 localStorage 獲取 token**
```typescript
// ❌ 錯誤
const token = localStorage.getItem('token');
const token = localStorage.getItem('supabase.auth.token');
```

#### **❌ 錯誤 2：創建多個 Supabase Client 實例**
```typescript
// ❌ 錯誤
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
const supabase = createSupabaseClient(projectId, publicAnonKey);

// ✅ 正確
import { createClient } from '../utils/supabase/client';
const supabase = createClient(); // 使用單例
```

#### **❌ 錯誤 3：手動設置 Authorization header**
```typescript
// ❌ 錯誤（容易忘記處理 token 過期）
const token = await getAccessToken();
const response = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// ✅ 正確（自動處理 token）
const response = await apiRequest(url);
```

#### **❌ 錯誤 4：不檢查 session 是否存在**
```typescript
// ❌ 錯誤
const { data: { session } } = await supabase.auth.getSession();
const token = session.access_token; // 可能是 undefined

// ✅ 正確
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  showToast('請先登入', 'error');
  return;
}
const token = session.access_token;
```

### 🔍 代碼審查檢查清單

在提交任何涉及認證和 API 請求的代碼前，請確認：

- [ ] 是否使用 `auth.ts` 的統一方法獲取 token？
- [ ] 是否使用 `apiClient.ts` 的統一方法發送 API 請求？
- [ ] 是否檢查 session 是否存在？
- [ ] 是否正確處理 401 未登入錯誤？
- [ ] 是否避免使用 `localStorage.getItem('token')`？
- [ ] 是否避免創建多個 Supabase Client 實例？
- [ ] 是否使用 `createClient()` 而非 `createClient(projectId, publicAnonKey)`？

### 📝 錯誤處理模式

```typescript
try {
  const result = await apiRequestJson<DataType>(buildApiUrl('/endpoint'));
  
  if (result.success) {
    // 處理成功情況
    setData(result.data);
  } else {
    throw new Error(result.error?.message || '操作失敗');
  }
} catch (err) {
  console.error('錯誤:', err);
  
  // 處理認證錯誤
  if (err instanceof ApiError && err.status === 401) {
    showToast('登入已過期，請重新登入', 'error');
    navigate('/login');
    return;
  }
  
  // 處理其他錯誤
  showToast(err instanceof Error ? err.message : '操作失敗', 'error');
}
```

---

# Design system guidelines

## Toast / Notification Card 使用原則

Uknow 平台使用自定義的通知系統，完全替代了瀏覽器的 `alert()`、`confirm()` 等原生彈窗。通知系統分為兩種類型：

### 1. Toast 通知（輕量級、自動消失）

#### 使用場景
用於**僅告知狀態**的輕量級訊息，不需要用戶確認：
- 表單驗證即時反饋（email 格式錯誤、手機號碼格式錯誤）
- 資料載入狀態（載入中、載入成功）
- 簡單的操作反饋（複製成功、儲存中）
- **不適用**於需要用戶確認的重要操作

#### 使用方法
```tsx
import { useNotification } from './components/notifications/NotificationContext';

const { showToast } = useNotification();

// 基本用法
showToast('訊息內容', 'success');  // 成功
showToast('訊息內容', 'error');    // 錯誤
showToast('訊息內容', 'warning');  // 警告
showToast('訊息內容', 'info');     // 資訊（預設）

// 自訂持續時間
showToast('訊息內容', 'success', { duration: 2000 });
```

#### 實際範例
```tsx
// 良好實踐 - 表單驗證反饋
if (!emailPattern.test(email)) {
  showToast('請輸入有效的電子郵件格式', 'error');
  return;
}

// 良好實踐 - 操作成功反饋
showToast('電子郵件驗證成功', 'success');
```

---

### 2. Notification Card（需要確認）

#### 使用場景
用於**需要用戶確認**的重要訊息或操作結果：
- 完成重要流程（付款成功、刊登建立完成）
- 嚴重錯誤提示（付款失敗、資料提交失敗）
- 需要展示詳細資訊（錯誤原因清單、操作結果詳情）

#### 使用方法

**方法 1：使用快捷方法（推薦）**
```tsx
import { useNotification } from './components/notifications/NotificationContext';

const { showSuccess, showError, showWarning, showInfo } = useNotification();

// 成功通知
showSuccess(
  '付款成功！',                    // 標題
  '服務者刊登已建立',               // 訊息
  ['刊登 ID: aB3xY7k', '推薦碼已生成'] // 可選的詳細列表
);

// 錯誤通知
showError(
  '付款處理失敗',                  // 標題
  '請稍後再試，或聯繫客服協助處理。' // 訊息
);
```

**方法 2：完整配置**
```tsx
const { showNotification } = useNotification();

showNotification({
  type: 'success',
  title: '操作成功',
  message: '您的資料已成功儲存',
  details: ['詳細資訊 1', '詳細資訊 2'],
  confirmText: '我知道了',  // 可選，預設為「確認」
  onConfirm: () => {         // 可選，確認後的回調
    console.log('用戶已確認');
  }
});
```

### **⚡ 最佳實踐**

#### 應該這樣做
```tsx
// 1. 表單驗證 → Toast
showToast('請輸入有效的電子郵件格式', 'error');

// 2. 重要操作完成 → Notification Card
showSuccess('註冊成功！', '歡迎加入 Uknow 平台', ['您的帳號已建立']);

// 3. 簡單狀態反饋 → Toast
showToast('複製成功', 'success');

// 4. 嚴重錯誤 → Notification Card
showError('付款處理失敗', '請稍後再試，或聯繫客服協助處理。');
```

#### 不應該這樣做
```tsx
// 禁止使用瀏覽器原生彈窗
alert('這是錯誤的方式');
confirm('確定要刪除嗎？');

// 不要用 Notification Card 處理簡單反饋
showSuccess('複製成功', '');  // 應該用 Toast

// 不要用 Toast 處理重要確認
showToast('付款已完成', 'success');  // 應該用 Notification Card
```

---

### 架構說明

通知系統位於 `/components/notifications/` 目錄：

```
/components/notifications/
├── NotificationContext.tsx  # Context Provider（統一管理）
├── ToastCard.tsx            # Toast 卡片組件
├── ToastContainer.tsx       # Toast 容器（處理位置和堆疊）
└── NotificationCard.tsx     # Notification 卡片組件
```

---

## 橫向滾動卡片設計原則（推薦管理統計卡片）

### 使用場景
當需要在手機版展示多張並列的統計卡片時，應使用橫向滾動設計以節省垂直空間。

### 響應式設計規範

#### 斷點定義
- **手機版**：`< md`（< 768px）
- **平板版**：`md - lg`（768px - 1023px）
- **桌面版**：`≥ lg`（≥ 1024px）

#### 佈局配置

**手機版（< md）：**
- 水平滾動佈局
  - 每張卡片最小寬度 `168px`
  - 卡片不收縮 `shrink-0`
  - 使用 `snap-x snap-mandatory` + `snap-start` 實現卡片對齊
  - 使用 `overflow-x-auto` 允許水平滾動
  - 添加 `pb-2` 避免滾動條遮擋卡片陰影

**平板版（md - lg）：**
- 2x2 網格佈局 `grid-cols-2`
- 移除滾動和最小寬度限制

**桌面版（≥ lg）：**
- 1x4 網格佈局 `grid-cols-4`

#### 實作範例
```tsx
<div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory 
               md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-x-visible">
  <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-lg">
        <Icon className="h-5 w-5 text-blue-600 shrink-0" />
        <span>標題</span>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold text-blue-600">123</div>
      <p className="text-sm text-muted-foreground mt-1">
        說明文字
      </p>
    </CardContent>
  </Card>
</div>
```

#### 設計要點
1. **手機版**優化垂直空間，使用橫向滾動
2. **平板和桌面版**保持標準網格佈局，充分利用水平空間
3. 確保卡片內容在所有版本都完整可讀
4. 使用 snap points 提升手機版滾動體驗

---

## 複雜卡片手機版佈局優化（推薦管理 Root 卡片）

### 使用場景
當卡片內包含多層級信息（標題、元數據、統計數字、標籤列表）時，手機版應該垂直堆疊，平板和桌面版保持水平佈局。

### 設計原則

**手機版（< md）：**
- ✅ 垂直堆疊所有信息層級
- ✅ 使用左側縮排（`pl-7` 約 28px）對齊展開圖標後的內容
- ✅ 長文字使用 `break-all` 避免溢出
- ✅ 簡化統計文字（使用 `·` 分隔符）
- ✅ 標籤表允許換行（`flex-wrap`）

**平板版和桌面版（≥ md）：**
- ✅ 保持水平佈局（`justify-between`）
- ✅ 左右兩側分別放置不同層級的信息
- ✅ 充分利用���平空間

### 實作範例
```tsx
{/* 手機版：垂直堆疊 */}
<div className="md:hidden space-y-3">
  <div className="flex items-start gap-3">
    <Icon />
    <div className="flex-1 min-w-0">
      <h3>標題</h3>
      <p className="text-sm break-all">長文字內容</p>
    </div>
  </div>
  <div className="flex justify-between pl-7">
    <span>統計信息</span>
  </div>
  <div className="flex gap-1 flex-wrap pl-7">
    {badges}
  </div>
</div>

{/* 平板和桌面版：水平佈局 */}
<div className="hidden md:flex md:items-center md:justify-between">
  {/* 保持原有設計 */}
</div>
```

### 設計要點
1. 使用 `md:hidden` 和 `hidden md:flex` 分離兩種佈局
2. 手機版避免橫向擠壓，提升可讀性
3. 平板和桌面版保持緊湊高效的佈局
4. 確保所有信息在各版本都能完整展示

---

## 列表高度限制與滾動設計（推薦管理代別展開區域）

### 使用場景
當展開的列表項目數量可能很多時（如推薦樹狀圖的各代列表），應該限制顯示高度並提供獨立滾動功能。

### 設計規範

#### 高度限制原則
- **最多顯示 4 個項目的高度**
- 過 4 個項目時，啟用垂直滾動
- 避免單一列表過長影響整體佈局

#### 高度計算方法
1. **單一項目高度估算：**
   - 卡片內邊距：`p-3`（12px * 2 = 24px）
   - 內容高度：約 32px（圖片 + 文字）
   - 單張卡片總高度：約 `80px`

2. **4 張卡片總高度：**
   - 卡片高度：`80px * 4 = 320px`
   - 間距（space-y-2）：`8px * 3 = 24px`
   - 總計：`320 + 24 = 344px`
   - 設定值：`max-h-[352px]`（預留緩衝）

#### 實作範例
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  {/* 每一代的列表 */}
  <div>
    <h4 className="font-medium mb-3 flex items-center gap-2">
      <Badge className="bg-green-600 text-white text-xs">1代</Badge>
      ({firstGeneration.length})
    </h4>
    
    {/* 限制高度並可滾動的容器 */}
    <div className="space-y-2 max-h-[352px] overflow-y-auto pr-1">
      {firstGeneration.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          尚未有1代推薦
        </p>
      ) : (
        firstGeneration.map(listing => renderCard(listing))
      )}
    </div>
  </div>
</div>
```

#### 設計要點
1. **高度限制：** 使用 `max-h-[352px]` 限制最大高度（約 4 個項目）
2. **滾動啟用：** 使用 `overflow-y-auto` 在內容超出時顯示滾動條
3. **間距預留：** 添加 `pr-1` 為滾動條預留空間，避免內容被遮擋
4. **視覺一致：** 多欄佈局時，各欄高度一致，視覺更整齊
5. **體驗優化：** 
   - 項目 ≤ 4 個：正常顯示，無滾動條
   - 項目 > 4 個：顯示滾動條，可獨立滾動

#### 適用場景
- ✅ 多欄並列的列表（如推薦樹的 1代/2代/3代）
- ✅ 可能有大量項目的展開區域
- ✅ 需要保持整體佈局整齊的情況

#### 不適用場景
- ❌ 主要內容列表（應該允許自然延伸）
- ❌ 項目數量固定且較少的列表（< 5 個）
- ❌ 需要一次性查看所有項目的列表

---

## 推薦管理卡片設計規範 ⭐

### 使用場景
推薦管理頁面中展示被推薦人刊登的卡片組件，需要清晰展示推薦關係並保持簡潔。

### 設計規格

#### **佈局原則**
- ✅ 使用相對定位（`relative`）作為容器
- ✅ **不顯示照片**（保持簡潔）
- ✅ 左側色條標示代數（一代：綠色、二代：紫色、三代：橙色）
- ✅ **預覽眼睛圖標使用絕對定位，垂直對齊卡片水平中線**
- ✅ 右側預留空間（`pr-10`）給預覽按鈕

#### **文字內容格式**

**第 1 行：被推薦人資訊**
- 格式：`{ownerName}-{listingName}`（**無空格**）
- 字體：`font-medium truncate mb-1`
- 範例：`張三-台北按摩服務`
- ❌ 錯誤：`張三 - 台北按摩服務`（有空格）

**第 2 行：理位置 + 服務類別**
- 格式：`{city} · {serviceType}`
- 字體：`text-sm truncate mb-1 text-muted-foreground`
- 範例：`台北市 · 按��服務`

**第 3 行：推薦人資訊（僅二代、三代顯示）**
- 格式：`{referrerOwnerName}-{referrerListingName}`（**無「推薦人：」前綴，無空格**）
- 字體：`text-sm truncate text-muted-foreground`
- 範例：`李四-新北SPA`
- ❌ 錯誤：`推薦人：李四 - 新北SPA`（有前綴和空格）
- **注意：直推（一代）不顯示此行**

#### **預覽按鈕（眼睛圖標）** ⭐ 重點

**位置與對齊：**
- ✅ 卡片右側，**垂直對齊卡片水平中線**
- ✅ CSS：`absolute right-3 top-1/2 -translate-y-1/2`
- ✅ 說明：不管卡片有幾行文字（直推 2 行、二代/三代 3 行），眼睛都在同一視覺高度
- ✅ 父容器必須有 `relative` 定位
- ✅ 父容器右內邊距：`pr-10` 預留空間

**垂直居中原理：**
```css
.top-1/2            /* 眼睛頂部從卡片 50% 位置開始 */
.-translate-y-1/2   /* 眼睛向上移動自身高度的 50% */
/* 結果：眼睛的中心點 = 卡片的水平中線 */
```

**視覺一致性：**
- ✅ 直推（2 行）：眼睛在卡片中線
- ✅ 二代/三代（3 行）：眼睛在卡片中線
- ✅ 所有卡片的眼睛在同一視覺水平線上

#### **已失效狀態**
- 整體 `opacity-50`
- 右顯示「已失效」標籤取代預覽眼睛
- 「已失效」標籤同樣使用絕對定位垂直居中（`absolute right-3 top-1/2 -translate-y-1/2`）
- 文字顏色改為 `text-gray-400`

### 完整實作範例

```typescript
const renderReferralCard = (listing: ReferralListing, level: 1 | 2 | 3) => {
  const levelColors = {
    1: 'border-l-green-600 bg-green-50',
    2: 'border-l-purple-600 bg-purple-50',
    3: 'border-l-orange-600 bg-orange-50'
  };
  
  return (
    <div 
      key={listing.id}
      className={`relative p-3 pr-10 border-l-4 border rounded-lg transition-all duration-200 ${levelColors[level]} ${!listing.isActive ? 'opacity-50' : ''}`}
    >
      {/* 文字內容區 */}
      <div>
        {/* 第 1 行：被推薦人名稱 */}
        <p className={`font-medium truncate mb-1 ${!listing.isActive ? 'text-gray-400' : ''}`}>
          {listing.ownerName}-{listing.name}
        </p>
        
        {/* 第 2 行：城市·服務類別 */}
        <p className={`text-sm truncate mb-1 ${!listing.isActive ? 'text-gray-400' : 'text-muted-foreground'}`}>
          {listing.city} · {listing.serviceType}
        </p>
        
        {/* 第 3 行：推薦人資訊（僅二代和三代顯示）*/}
        {level > 1 && listing.referrer && (
          <p className={`text-sm truncate ${!listing.isActive ? 'text-gray-400' : 'text-muted-foreground'}`}>
            {listing.referrer.ownerName}-{listing.referrer.listingName}
          </p>
        )}
      </div>
      
      {/* 預覽按鈕 - 絕對定位，垂直居中對齊卡片中線 */}
      {!listing.isActive ? (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded shrink-0">
          已失效
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/service-providers/${listing.id}`);
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
          title="預覽刊登詳細內容"
        >
          <Eye className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
```

### 代碼審查檢查清單

在提交推薦管理相關組件代碼前，請確認：

**卡片佈局：**
- [ ] 是否移除了不必要的照片？
- [ ] 卡片容器是否使用 `relative` 定位？
- [ ] 卡片容器是否有 `pr-10` 預留右側空間？
- [ ] 名稱格式是否為 `{name}-{listing}` 無空格？
- [ ] **預覽眼睛是否使用 `absolute right-3 top-1/2 -translate-y-1/2` 對齊卡片水平中線？** ⭐
- [ ] 第三行推薦人是否無「推薦人：」前綴？
- [ ] 第三行推薦人格式是否為 `{name}-{listing}` 無空格？
- [ ] 直推（一代）是否不顯示第三行？

**狀態處理：**
- [ ] 已失效項目是否有 `opacity-50`？
- [ ] 已失效項目是否顯示「已失效」標籤？
- [ ] **「已失效」標籤是否同樣使用絕對定位對齊卡片水平中線？** ⭐
- [ ] 顏色是否符合代數標準（一代：綠、二代：紫、三代：橙）？

**響應式與文字截斷：**
- [ ] 手機版是否正確截斷長文字（使用 `truncate`）？
- [ ] 眼睛按鈕是否在所有尺寸都正確對齊？
- [ ] 文字是否避免覆蓋眼睛按鈕？

### 常見錯誤與修正

| 錯誤類型 | 錯誤實作 | 正確實作 | 說明 |
|---------|---------|---------|------|
| **顯示照片** | `<img src={photos[0]} />` | 移除照片 | 保持簡潔 |
| **名稱格式** | `{name} - {listing}` | `{name}-{listing}` | 無空格 |
| **眼睛位置** | `<div className="flex items-center">` | `absolute right-3 top-1/2 -translate-y-1/2` | 對齊中線 |
| **推薦人前綴** | `推薦人：{name}-{listing}` | `{name}-{listing}` | 無前綴 |
| **推薦人格式** | `{name} - {listing}` | `{name}-{listing}` | 無空格 |
| **缺少 relative** | `<div className="p-3">` | `<div className="relative p-3 pr-10">` | 定位上下文 |

### TypeScript Interface 參考

```typescript
/**
 * 推薦樹中的被推薦人刊登資訊
 */
interface ReferralListing {
  id: string;
  name: string;              // 刊登名稱（服務者名稱）
  serviceType: string;       // 服務類別
  city: string;              // 城市
  ownerName: string;         // 使用者名稱（刊登擁有者）
  userId: string;
  activeUntil: string;
  isActive: boolean;
  photos: string[];          // 照片（UI 不顯示，僅後端需要）
  
  /**
   * 推薦人資訊（僅二代、三代有值）
   * 直推（一代）此欄位為 undefined
   */
  referrer?: {
    ownerName: string;       // 推薦人使用者名稱
    listingName: string;     // 推薦人刊登名稱
  };
}
```

---

## 獎勵溯源與數據展示架構 ⭐⭐⭐

### 設計原則

本系統採用「預計算完整信息 + 統一格式化工具」架構，確保所有推薦關係數據都可以完整追溯並統一展示。

#### 核心設計理念

1. **單一數據源（Single Source of Truth）**
   - 所有推薦關係信息在創建時一次性獲取並存儲
   - 數據結構統一，無歷史包袱

2. **預計算優化（Pre-computed Data）**
   - 創建刊登時預先計算所有需要的用戶名、刊登名稱
   - 後續查詢無需額外 KV Store 讀取，保持 O(1) 查詢複雜度

3. **統一格式化（Consistent Formatting）**
   - 前端使用統一的格式化工具 `/utils/referralFormatter.ts`
   - 時間格式統一為 `YYYY/MM/DD HH:mm:ss`
   - 人員信息統一為 `{userName}-{listingName}`

---

### 數據結構設計

#### 1. Reward History（獎勵歷史）- `user:${userId}:reward_history`

```typescript
interface RewardHistoryItem {
  id: string;
  type: string;  // "referral_gen1_month1", "referral_gen2_month3", etc.
  amount: number;
  
  // ✅ 被推薦人完整信息
  referee: {
    userId: string;
    userName: string;        // "Admin"
    listingId: string;
    listingName: string;     // "台北按摩服務"
  };
  
  // ✅ 推薦人完整信息（可選，二代/三代有值）
  referrer?: {
    userId: string;
    userName: string;        // "張三"
    listingId: string;
    listingName: string;     // "新北SPA"
  };
  
  generation: number;        // 1, 2, 或 3
  monthNumber: number;       // 1~12
  issuedAt: string;         // ISO 8601: "2024-12-15T12:34:56.789Z"
  description: string;      // "推薦獎勵 - Admin-台北按摩服務（第2代）- 第1個月"
}
```

**示例數據：**
```json
{
  "id": "reward_1734267896_abc123",
  "type": "referral_gen2_month1",
  "amount": 10,
  "referee": {
    "userId": "user_xxx",
    "userName": "Admin",
    "listingId": "listing_yyy",
    "listingName": "台北按摩服務"
  },
  "referrer": {
    "userId": "user_zzz",
    "userName": "張三",
    "listingId": "listing_www",
    "listingName": "新北SPA"
  },
  "generation": 2,
  "monthNumber": 1,
  "issuedAt": "2024-12-15T12:34:56.789Z",
  "description": "推薦獎勵 - Admin-台北按摩服務（第2代）- 第1個月"
}
```

---

#### 2. Referral Tree（推薦樹）- `listing:${listingId}:referral_tree`

```typescript
interface ReferralTreeListing {
  listingId: string;
  publicListingId: string;
  userId: string;
  userPublicId: string;
  
  // ✅ 被推薦人信息
  userName: string;          // "Admin"
  listingName: string;       // "台北按摩服務"
  
  category: string;
  city: string;
  gender: string;
  
  // ✅ 推薦人信息（僅二代、三代有此字段）
  referrer?: {
    ownerName: string;       // "張三"（前端 interface 使用 ownerName）
    listingName: string;     // "新北SPA"
  };
  
  createdAt: string;
  activeUntil: string;
}

interface ReferralTree {
  firstGeneration: ReferralTreeListing[];
  secondGeneration: ReferralTreeListing[];
  thirdGeneration: ReferralTreeListing[];
  lastUpdated: string;
}
```

---

#### 3. Monthly Log（月度日誌）- `user:${userId}:referral_monthly_log`

```typescript
interface MonthlyLogItem {
  listingId: string;
  userId: string;
  userName: string;          // ✅ 被推薦人用戶名
  listingName: string;       // ✅ 被推薦人刊登名稱
  
  // ✅ 推薦人信息（如果被推薦人還有上級推薦人）
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  
  createdAt: string;
}

interface MonthlyLog {
  [monthKey: string]: MonthlyLogItem[];  // "2024-12": [...]
}
```

---

#### 4. Reward Schedule（獎勵排程）- `reward_schedule:${scheduleId}`

```typescript
interface RewardSchedule {
  id: string;
  userId: string;            // 接收獎勵的用戶ID
  
  // ✅ 被推薦人完整信息
  referee: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  
  // ✅ 推薦人完整信息（可選）
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  
  generation: number;
  monthNumber: number;
  amount: number;
  scheduledDate: string;     // "2025-01-15"
  status: string;            // "pending" | "completed" | "cancelled"
  createdAt: string;
  completedAt: string | null;
  cancellationReason?: string;
}
```

---

### 統一格式化工具

**文件路徑：** `/utils/referralFormatter.ts`

所有涉及推薦關係展示的地方都必須使用此工具。

```typescript
/**
 * 格式化被推薦人信息
 * @example formatReferee('張三', '台北按摩服務')  '張三-台北按摩服務'
 */
export function formatReferee(userName: string, listingName: string): string {
  return `${userName}-${listingName}`;
}

/**
 * 格式化推薦人信息
 * @example formatReferrer('李四', '新北SPA') → '李四-新北SPA'
 */
export function formatReferrer(userName: string, listingName: string): string {
  return `${userName}-${listingName}`;
}

/**
 * 格式化時間戳（完整版）
 * @example formatTimestamp('2024-12-15T12:34:56.789Z') → '2024/12/15 12:34:56'
 */
export function formatTimestamp(isoString: string): string;

/**
 * 格式化日期（不含時間）
 * @example formatDate('2024-12-15T12:34:56.789Z') → '2024/12/15'
 */
export function formatDate(isoString: string): string;

/**
 * 生成完整的獎勵描述
 * @example 
 * generateRewardDescription('Admin', '台北按摩服務', 2, 1)
 * → '推薦獎勵 - Admin-台北按摩服務（第2代）- 第1個月'
 */
export function generateRewardDescription(
  userName: string,
  listingName: string,
  generation: number,
  monthNumber: number
): string;
```

---

### 後端實施指南

#### 關鍵修改點

**1. listings.ts - `issueImmediateReward`**
```typescript
// ✅ 獲取完整信息
const newUserProfile = await kv.get(`user:${newListing.userId}:profile`);
const referee = {
  userId: newListing.userId,
  userName: newUserProfile?.name || '未知用戶',
  listingId: newListing.id,
  listingName: newListing.name
};

let referrer = null;
if (newListing.referrerUserId && newListing.referrerListingId) {
  const referrerProfile = await kv.get(`user:${newListing.referrerUserId}:profile`);
  const referrerListing = await kv.get(`listing:${newListing.referrerListingId}`);
  
  if (referrerProfile && referrerListing) {
    referrer = {
      userId: newListing.referrerUserId,
      userName: referrerProfile.name,
      listingId: newListing.referrerListingId,
      listingName: referrerListing.name
    };
  }
}

// ✅ 存儲完整信息到獎勵歷史
history.unshift({
  id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  type: `referral_gen${generation}_month1`,
  amount,
  referee,           // ✅ 完整信息
  referrer,          // ✅ 完整信息
  generation,
  monthNumber: 1,
  issuedAt: createdAt.toISOString(),
  description: `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第1個月`
});
```

**2. cron.ts - `issueScheduledReward`**
```typescript
// ✅ 直接使用排程中的完整信息（無需額外查詢）
const { userId, amount, referee, referrer, generation, monthNumber } = schedule;

const description = `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第${monthNumber}個月`;

history.unshift({
  id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  type: `referral_gen${generation}_month${monthNumber}`,
  amount,
  referee,           // ✅ 直接使用
  referrer,          // ✅ 直接使用
  generation,
  monthNumber,
  issuedAt: new Date().toISOString(),
  description
});
```

**3. tasks.ts - 新增 `GET /tasks/details/:month` 端點**
```typescript
/**
 * 獲取指定月份的推薦詳情
 * 
 * Parameters:
 * - month: 月份字串（格式：YYYY-MM，例如：2024-12）
 * 
 * 返回：
 * - data: 該月份的推薦記錄陣列（包含完整的推薦關係信息）
 */
tasks.get('/details/:month', async (c) => {
  // ... 驗證邏輯 ...
  
  const userLogKey = `user:${user.id}:referral_monthly_log`;
  const userLog = await kv.get(userLogKey) || {};
  
  const monthData = userLog[month] || [];
  
  // ✅ 直接返回（數據已經包含完整信息，無需額外處理）
  return c.json({
    success: true,
    data: monthData
  });
});
```

**4. referrals.ts - 修正數據映射**
```typescript
const formatTreeListing = (listing: any) => {
  return {
    id: listing.listingId,
    name: listing.listingName,      // ✅ 修正：刊登名稱
    serviceType: listing.category,
    city: listing.city,
    ownerName: listing.userName,    // ✅ 修正：用戶名
    userId: listing.userId,
    activeUntil: listing.activeUntil,
    isActive: listing.activeUntil >= today,
    referrer: listing.referrer,     // ✅ 新增：推薦人信息
    photos: []
  };
};
```

---

### 前端實施指南

#### 獎勵歷史展示

**文件：** `/components/reward/RewardHistory.tsx`

```typescript
import { formatReferee, formatReferrer, formatTimestamp } from '../../utils/referralFormatter';

interface RewardRecord {
  id: string;
  type: string;
  amount: number;
  description: string;
  issuedAt: string;
  
  // ✅ 推薦獎勵的完整信息
  referee?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  generation?: number;
  monthNumber?: number;
}

// ✅ 顯示時使用統一格式化
<p className="font-medium truncate mb-1">{record.description}</p>
<div className="flex items-center gap-2 text-sm text-muted-foreground">
  <Calendar className="h-3 w-3" />
  <span>{formatTimestamp(record.issuedAt)}</span>
</div>
```

#### 任務詳情展示

**文件：** `/components/TaskDashboard.tsx`

```typescript
import { formatReferee, formatReferrer, formatTimestamp } from '../utils/referralFormatter';

interface MonthlyReferralRecord {
  listingId: string;
  userId: string;
  userName: string;
  listingName: string;
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  createdAt: string;
}

// ✅ 獲取月度詳情
const fetchMonthDetails = async (month: string) => {
  const result = await apiRequestJson<{ success: boolean; data: MonthlyReferralRecord[] }>(
    buildApiUrl(`/tasks/details/${month}`)
  );
  
  if (result.success) {
    setMonthDetails(result.data);
    setExpandedMonth(month);
  }
};

// ✅ 展示詳情列表
monthDetails.map((record) => (
  <div key={record.listingId} className="p-3 border rounded-lg bg-background">
    <div className="flex-1 min-w-0">
      {/* 被推薦人 */}
      <p className="font-medium truncate mb-1">
        {formatReferee(record.userName, record.listingName)}
      </p>
      
      {/* 推薦人（如果存在）*/}
      {record.referrer && (
        <p className="text-sm text-muted-foreground truncate mb-1">
          推薦人：{formatReferrer(record.referrer.userName, record.referrer.listingName)}
        </p>
      )}
      
      {/* 時間戳 */}
      <p className="text-xs text-muted-foreground">
        {formatTimestamp(record.createdAt)}
      </p>
    </div>
  </div>
))
```

---

### 代碼審查檢查清單

在提交獎勵溯源相關代碼前，請確認：

**後端數據存儲：**
- [ ] 是否在創建刊登時一次性獲取所有需要的用戶名、刊登名稱？
- [ ] 獎勵歷史是否包含 `referee` 和 `referrer` 完整信息？
- [ ] 獎勵排程是否包含 `referee` 和 `referrer` 完整信息？
- [ ] 月度日���是否包含 `userName`、`listingName` 和 `referrer` 信息？
- [ ] 推薦樹是否包含 `userName`、`listingName` 和 `referrer` 信息？

**API 端點：**
- [ ] `GET /rewards/history` 是否直接返回完整數據？
- [ ] `GET /tasks/details/:month` 是否已實施？
- [ ] `GET /referrals/my-tree` 的數據映射是否正確？

**前端展示：**
- [ ] 是否導入並使用 `referralFormatter.ts` 的格式化函數？
- [ ] 時間顯示是否使用 `formatTimestamp()` 或 `formatDate()`？
- [ ] 被推薦人顯示是否使用 `formatReferee()`？
- [ ] 推薦人顯示是否使用 `formatReferrer()`？
- [ ] TypeScript interface 是否包含新的完整信息字段？

**一致性檢查：**
- [ ] 所有中文都使用繁體中文？
- [ ] 格式化結果是否為 `{name}-{listing}` 無空格？
- [ ] 時間格式是否為 `YYYY/MM/DD HH:mm:ss` 或 `YYYY/MM/DD`？
- [ ] 是否避免重複實現格式化邏輯？

---

### 常見錯誤與修正

| 錯誤類型 | 錯誤實作 | 正確實作 | 說明 |
|---------|---------|---------|------|
| **缺少完整信息** | 只存儲 `sourceUserName` | 存儲 `referee{...}`, `referrer{...}` | 需要完整追溯 |
| **未使用格式化工具** | `${userName} - ${listingName}` | `formatReferee(userName, listingName)` | 統一格式 |
| **時間格式不一致** | `new Date().toLocaleString()` | `formatTimestamp(isoString)` | 統一格式 |
| **額外查詢** | `await kv.get(\`user:${userId}\`)` | 直接使用預存的 `referee.userName` | 性能優化 |
| **前端重複格式化** | 在多個組件重複寫格式化邏輯 | `import { formatReferee } from ...` | DRY 原則 |

---