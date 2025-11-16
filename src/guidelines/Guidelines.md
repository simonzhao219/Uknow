# 目錄說明
## Utils 目錄文件說明

`/utils` 目錄包含共用功能和常數配置，避免代碼重複並統一維護。

### 目錄結構
```
/utils/
├── constants.ts              # 全局常數配置
├── contactValidation.ts      # 聯絡方式驗證工具
├── districtSelection.ts      # 區域選擇邏輯
├── formHelpers.tsx           # 表單輔助工具
├── generateIds.ts            # ID 生成器與 Mock 數據
└── supabase/
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

#### 6. supabase/info.tsx - Supabase 配置（受保護）
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
5. **複雜業務邏輯** → 創建專門的工具文件（如 `districtSelection.ts`）

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

<!--

System Guidelines

Use this file to provide the AI with rules and guidelines you want it to follow.
This template outlines a few examples of things you can add. You can add your own sections and format it to suit your needs

TIP: More context isn't always better. It can confuse the LLM. Try and add the most important rules you need

# General guidelines

Any general rules you want the AI to follow.
For example:

* Only use absolute positioning when necessary. Opt for responsive and well structured layouts that use flexbox and grid by default
* Refactor code as you go to keep code clean
* Keep file sizes small and put helper functions and components in their own files.

--------------

# Design system guidelines
Rules for how the AI should make generations look like your company's design system

Additionally, if you select a design system to use in the prompt box, you can reference
your design system's components, tokens, variables and components.
For example:

* Use a base font-size of 14px
* Date formats should always be in the format "Jun 10"
* The bottom toolbar should only ever have a maximum of 4 items
* Never use the floating action button with the bottom toolbar
* Chips should always come in sets of 3 or more
* Don't use a dropdown if there are 2 or fewer options

You can also create sub sections and add more specific details
For example:


## Button
The Button component is a fundamental interactive element in our design system, designed to trigger actions or navigate
users through the application. It provides visual feedback and clear affordances to enhance user experience.

### Usage
Buttons should be used for important actions that users need to take, such as form submissions, confirming choices,
or initiating processes. They communicate interactivity and should have clear, action-oriented labels.

### Variants
* Primary Button
  * Purpose : Used for the main action in a section or page
  * Visual Style : Bold, filled with the primary brand color
  * Usage : One primary button per section to guide users toward the most important action
* Secondary Button
  * Purpose : Used for alternative or supporting actions
  * Visual Style : Outlined with the primary color, transparent background
  * Usage : Can appear alongside a primary button for less important actions
* Tertiary Button
  * Purpose : Used for the least important actions
  * Visual Style : Text-only with no border, using primary color
  * Usage : For actions that should be available but not emphasized

-->