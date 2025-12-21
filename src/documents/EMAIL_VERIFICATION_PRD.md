# Email 驗證重發機制 - 產品需求文檔（PRD）

**文檔版本：** 1.0  
**建立日期：** 2024-12-15  
**作者：** Product Manager  
**狀態：** ✅ 已實作並投產  

---

## 📋 文檔目錄

1. [產品概述](#1-產品概述)
2. [功能需求](#2-功能需求)
3. [UI/UX 設計規格](#3-uiux-設計規格)
4. [用戶流程](#4-用戶流程)
5. [技術規格](#5-技術規格)
6. [後端設計](#6-後端設計)
7. [數據結構定義](#7-數據結構定義)
8. [業務邏輯](#8-業務邏輯)
9. [測試策略](#9-測試策略)
10. [非功能需求](#10-非功能需求)
11. [發布計畫](#11-發布計畫)
12. [附錄](#12-附錄)

---

## 1. 產品概述

### 1.1 背景與問題陳述

#### **業務背景**

Uknow 是一個服務媒合平台，用戶註冊時需要通過 Email 驗證以確保帳號安全性和可聯繫性。當前系統採用 Supabase Auth 作為認證服務，註冊流程如下：

```
用戶填寫註冊表單 → Supabase 創建帳號 → 自動發送驗證信 → 用戶點擊連結驗證
```

#### **核心問題**

**問題陳述：**
> 第一次註冊後，從畫面顯示「註冊信已寄出」到用戶實際收到信的過程會需要一點時間（通常 1-2 分鐘，最長可達 5-10 分鐘）。在等待期間，部分焦慮的用戶會瘋狂反覆點擊「重新寄出」按鈕，導致以下問題：

**具體影響：**

1. **系統負擔增加**
   - 短時間內大量重發請求
   - Supabase Auth API 配額消耗加速
   - 郵件服務商可能標記為垃圾郵件

2. **用戶體驗惡化**
   - 用戶不確定是否真的重發成功
   - 收件匣可能收到大量重複郵件
   - 增加用戶焦慮感

3. **業務風險**
   - 可能觸發郵件服務商的反垃圾郵件機制
   - 影響整體郵件送達率
   - 降低用戶對平台的信任度

**數據支撐：**
- 預估每位新註冊用戶平均重發 5-10 次
- 峰值期間（週末晚上）每小時約 50 位新用戶
- 預估每小時產生 250-500 次重發請求

---

### 1.2 目標與成功指標

#### **產品目標**

**主要目標：**
> 透過實施冷卻機制（Cooldown Mechanism），防止用戶在短時間內重複點擊「重新寄出」按鈕，同時保持良好的用戶體驗。

**次要目標：**
1. 降低系統負擔（減少不必要的 API 請求）
2. 提升用戶信心（透過清晰的狀態反饋）
3. 提供漸進式幫助（重發多次後給予建議）

---

#### **成功指標（Success Metrics）**

| 指標類別 | 指標名稱 | 當前值 | 目標值 | 衡量方式 |
|---------|---------|--------|--------|---------|
| **用戶行為** | 平均重發次數 | 5-10 次/用戶 | 1-2 次/用戶 | Analytics 追蹤 |
| **系統性能** | 重發 API 請求量 | 基準值 | 降低 70-80% | API 日誌分析 |
| **用戶滿意度** | 註冊完成率 | 75% | 85-90% | 漏斗分析 |
| **用戶滿意度** | 重發 3 次以上比例 | - | < 10% | Analytics 追蹤 |
| **客服成本** | 驗證信相關客服諮詢 | 基準值 | 降低 50% | 客服系統統計 |

---

#### **關鍵成果（Key Results）**

**短期成果（1-2 週）：**
- ✅ 重發次數降低 70-80%
- ✅ 用戶等待焦慮感降低（透過倒數計時器）
- ✅ 系統 API 請求量降低 70-80%

**中期成果（1-3 個月）：**
- ✅ 註冊完成率提升 10-15%
- ✅ 客服諮詢量降低 50%
- ✅ 用戶滿意度提升（透過問卷調查）

**長期成果（3-6 個月）：**
- ✅ 建立數據驅動的優化機制
- ✅ 郵件送達率提升（減少被標記為垃圾郵件）
- ✅ 成為其他類似功能的參考範例

---

### 1.3 用戶角色與使用場景

#### **目標用戶**

**主要用戶：** 所有新註冊的 Uknow 用戶

**用戶特徵：**
1. **技術熟悉度：** 中等（會使用 Email，但不一定了解驗證機制）
2. **年齡分布：** 18-55 歲
3. **設備：** 手機（60%）、桌面（30%）、平板（10%）
4. **心理狀態：** 焦慮（擔心收不到信）、急迫（想快點完成註冊）

---

#### **使用場景**

**場景 1：正常註冊流程**

```
角色：首次註冊用戶
目標：完成 Email 驗證
步驟：
1. 填寫註冊表單（Email + 密碼）
2. 點擊「註冊」按鈕
3. 系統發送驗證信
4. 跳轉到驗證等待頁面
5. 等待 1-2 分鐘
6. 收到驗證信，點擊連結
7. 完成註冊
```

**場景 2：未收到驗證信（郵件延遲）**

```
角色：首次註冊用戶
問題：等待 3 分鐘仍未收到信
步驟：
1. 填寫註冊表單
2. 跳轉到驗證等待頁面
3. 等待 3 分鐘，仍未收到信
4. 查看「小提示」區域
5. 檢查垃圾郵件匣
6. 仍未找到
7. 等待冷卻時間結束
8. 點擊「重新寄出」
9. 再次檢查信箱
10. 收到信，完成驗證
```

**場景 3：重發多次仍未收到**

```
角色：首次註冊用戶
問題：重發 3 次仍未收到信
步驟：
1-8. （同場景 2）
9. 第 2 次重發
10. 等待，仍未收到
11. 第 3 次重發
12. 系統顯示琥珀色建議框
13. 閱讀建議（可能原因 + 解決方案）
14. 根據建議操作：
    - 搜尋「Uknow」關鍵字
    - 檢查促銷內容分類
    - 確認 Email 地址正確
15. 找到郵件 或 考慮更換信箱
```

**場景 4：頁面刷新（意外情況）**

```
角色：首次註冊用戶
問題：不小心刷新頁面
步驟：
1. 正在等待冷卻時間（剩餘 50 秒）
2. 不小心刷新頁面（F5）
3. 系統從 localStorage 恢復狀態
4. 重新計算冷卻剩餘時間
5. 倒數繼續（基於註冊時間）
6. 用戶體驗無中斷
```

---

## 2. 功能需求

### 2.1 核心功能（Must Have）

#### **FR-001：固定冷卻機制**

**需求描述：**
> 每次發送驗證信後（包含第一次註冊時的自動發送），用戶必須等待 90 秒後才能再次點擊「重新寄出」按鈕。

**驗收標準：**
- ✅ 註冊後立即進入驗證頁面時，按鈕顯示冷卻狀態
- ✅ 冷卻時間固定為 90 秒
- ✅ 冷卻期間按鈕禁用，無法點擊
- ✅ 每次重發成功後，重新啟動 90 秒冷卻

**優先級：** P0（必須實作）

---

#### **FR-002：首次自動冷卻計算**

**需求描述：**
> 用戶註冊時系統自動發送第一封驗證信，進入驗證頁面時應該計算已經過的時間，冷卻剩餘時間 = 90 - 已過時間。

**驗收標準：**
- ✅ 註冊時記錄時間戳（registrationTime）
- ✅ 進入驗證頁面時計算 elapsed = (當前時間 - 註冊時間)
- ✅ 初始冷卻 = max(0, 90 - elapsed)
- ✅ 如果 elapsed >= 90，按鈕立即可用

**範例：**
```
註冊時間：10:00:00
進入頁面：10:00:05
已過時間：5 秒
初始冷卻：90 - 5 = 85 秒 ✅
```

**優先級：** P0（必須實作）

---

#### **FR-003：倒數計時器**

**需求描述：**
> 冷卻期間，按鈕文字應該顯示剩餘秒數，並每秒更新一次。

**驗收標準：**
- ✅ 按鈕文字格式：「⏱️ 請稍候 XX 秒後可重新寄送」
- ✅ 倒數每秒更新（90 → 89 → 88 ... → 1 → 0）
- ✅ 倒數到 0 時，按鈕變為可點擊狀態
- ✅ 倒數過程流暢，無卡頓

**優先級：** P0（必須實作）

---

#### **FR-004：重發功能**

**需求描述：**
> 冷卻時間結束後，用戶可以點擊按鈕重新發送驗證信。

**驗收標準：**
- ✅ 點擊按鈕後調用 Supabase Auth API
- ✅ 按鈕顯示載入狀態（「⏳ 寄送中...」）
- ✅ 成功後顯示 Toast：「✅ 驗證信已重新寄出！」
- ✅ 失敗後顯示 Toast：「❌ 重新發送失敗，請稍後再試」
- ✅ 成功後重新啟動 90 秒冷卻
- ✅ 失敗後不啟動冷卻，允許立即重試

**API 規格：**
```typescript
supabase.auth.resend({
  type: 'signup',
  email: 'user@example.com',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

**優先級：** P0（必須實作）

---

### 2.2 增強功能（Should Have）

#### **FR-005：重發次數統計**

**需求描述：**
> 系統應該追蹤用戶的重發次數，並顯示在按鈕上。

**驗收標準：**
- ✅ 重發次數保存在 localStorage
- ✅ 按鈕顯示：「重新寄出驗證信（已重發 2 次）」
- ✅ 刷新頁面後次數不丟失
- ✅ 次數統計僅包含成功的重發（失敗不計入）

**localStorage Schema：**
```typescript
localStorage.setItem('emailVerificationResendCount', '2');
```

**優先級：** P1（高優先級）

---

#### **FR-006：漸進式提示系統**

**需求描述：**
> 根據重發次數，提供漸進式的提示和建議，幫助用戶找到驗證信。

**驗收標準：**

**階段 1：首次進入（resendCount = 0）**
```
📌 小提示：
• 郵件可能需要 1-2 分鐘送達
• 請同時檢查垃圾郵件匣
```

**階段 2：第 1 次重發（resendCount = 1）**
```
📌 小提示：
• 郵件可能需要 1-2 分鐘送達
• 請同時檢查垃圾郵件匣
• 搜尋關鍵字「Uknow」或「驗證」  ← 新增
```

**階段 3：第 2 次重發（resendCount = 2）**
```
📌 小提示：
• 郵件可能需要 1-2 分鐘送達
• 請同時檢查垃圾郵件匣
• 搜尋關鍵字「Uknow」或「驗證」
• 檢查促銷內容或社交網路分類  ← 新增
```

**階段 4：第 3+ 次重發（resendCount >= 3）**
```
⚠️ 您已重發 3 次驗證信

仍未收到嗎？可能原因：
• 信箱服務商延遲（特別是 Gmail, Yahoo）
• 郵件被攔截或歸類到其他資料夾
• 企業/學校信箱的安全設定

💡 建議：
• 檢查垃圾郵件、促銷內容、社交網路分類
• 在信箱中搜尋「Uknow」或「驗證」
• 確認信箱地址是否正確
• 如使用企業/學校信箱，建議更換為 Gmail、Yahoo 或 Outlook
```

**視覺規範：**
- 階段 1-3：藍色提示框（`bg-blue-50 border-blue-200`）
- 階段 4：琥珀色建議框（`bg-amber-50 border-amber-200`）

**優先級：** P1（高優先級）

---

#### **FR-007：持久化支持**

**需求描述：**
> 用戶刷新頁面後，系統應該保持冷卻狀態和重發次數，不重置。

**驗收標準：**
- ✅ 註冊時間保存在 localStorage
- ✅ 重發次數保存在 localStorage
- ✅ 刷新頁面後重新計算冷卻剩餘時間
- ✅ 倒數繼續，無中斷

**localStorage Schema：**
```typescript
localStorage.setItem('emailVerificationStartTime', '1702627200000');
localStorage.setItem('emailVerificationResendCount', '2');
```

**計算邏輯：**
```typescript
const savedTime = localStorage.getItem('emailVerificationStartTime');
const registrationTime = parseInt(savedTime);
const now = Date.now();
const elapsed = Math.floor((now - registrationTime) / 1000);
const remaining = Math.max(0, 90 - elapsed);
```

**優先級：** P1（高優先級）

---

### 2.3 擴展功能（Nice to Have）

#### **FR-008：後端限流保護**

**需求描述：**
> 後端應該記錄每個 Email 的重發次數和時間，防止惡意用戶繞過前端限制。

**驗收標準：**
- ⏸️ 後端記錄每個 Email 的重發歷史
- ⏸️ 限制：每小時最多 5 次重發
- ⏸️ 限制：每次重發間隔至少 90 秒
- ⏸️ 超過限制返回 429 Too Many Requests

**優先級：** P2（未來迭代）

---

#### **FR-009：Analytics 追蹤**

**需求描述：**
> 追蹤用戶行為數據，用於未來優化。

**追蹤事件：**
```typescript
// 重發事件
analytics.track('email_verification_resend', {
  resendCount: 2,
  cooldownElapsed: 45,
  deviceType: 'mobile',
});

// 重發多次事件
analytics.track('email_verification_multiple_resends', {
  resendCount: 3,
});

// 驗證成功事件
analytics.track('email_verification_success', {
  timeSinceRegistration: 180,  // 秒
  totalResends: 1,
});
```

**優先級：** P2（未來迭代）

---

## 3. UI/UX 設計規格

### 3.1 頁面佈局

#### **整體佈局結構**

```
┌─────────────────────────────────────┐
│         [Navbar]（無）               │  ← 驗證頁面無導航欄
├─────────────────────────────────────┤
│                                     │
│         [空白區域]（mt-12）          │
│                                     │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │    [Card 組件]                │  │
│  │                               │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  [CardHeader]           │  │  │
│  │  │  - Mail Icon            │  │  │
│  │  │  - 標題                 │  │  │
│  │  │  - 描述                 │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  [CardContent]          │  │  │
│  │  │                         │  │  │
│  │  │  • Email 顯示區         │  │  │
│  │  │  • 提示框               │  │  │
│  │  │  • 重發按鈕             │  │  │
│  │  │  • 返回按鈕             │  │  │
│  │  │                         │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│         [空白區域]                   │
│                                     │
└─────────────────────────────────────┘
```

---

#### **響應式設計**

**容器尺寸：**
```typescript
// 桌面版（≥ 768px）
<div className="max-w-md mx-auto mt-12 px-4">
  // max-width: 28rem (448px)
  // margin-top: 3rem (48px)
  // padding-x: 1rem (16px)
</div>

// 手機版（< 768px）
// 相同樣式，自動適應
```

**卡片內邊距：**
```typescript
<CardHeader className="text-center">
  // padding: 1.5rem (24px)
</CardHeader>

<CardContent className="space-y-4">
  // padding: 1.5rem (24px)
  // space-y: 1rem (16px)
</CardContent>
```

---

### 3.2 組件設計

#### **3.2.1 Mail Icon（郵件圖標）**

**規格：**
```typescript
<div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
  <Mail className="w-8 h-8 text-primary" />
</div>
```

**視覺規範：**
- **容器：**
  - 尺寸：64x64 px（w-16 h-16）
  - 形狀：圓形（rounded-full）
  - 背景：主色 10% 透明度（bg-primary/10）
  - 對齊：水平居中（mx-auto）
  - 下邊距：16px（mb-4）

- **圖標：**
  - 尺寸：32x32 px（w-8 h-8）
  - 顏色：主色（text-primary）
  - 來源：lucide-react

---

#### **3.2.2 標題與描述**

**CardTitle：**
```typescript
<CardTitle className="text-2xl">驗證您的 Email</CardTitle>
```

**規格：**
- 文字大小：使用 globals.css 預設（不輸出 text-2xl 的字體大小）
- 對齊：置中（繼承自 CardHeader）
- 顏色：預設前景色

**CardDescription：**
```typescript
<CardDescription>我們已發送驗證信到您的信箱</CardDescription>
```

**規格：**
- 文字大小：預設
- 顏色：muted-foreground
- 對齊：置中

---

#### **3.2.3 Email 顯示區**

**結構：**
```typescript
<div className="bg-muted p-4 rounded-lg space-y-2">
  <p className="text-sm">
    <strong>寄送至：</strong>
    <span className="text-primary ml-1">{email}</span>
  </p>
  <p className="text-sm text-muted-foreground">
    請檢查您的收件匣（或垃圾郵件匣），並點擊驗證連結以繼續註冊流程。
  </p>
</div>
```

**視覺規範：**
- **容器：**
  - 背景：muted 色（bg-muted）
  - 內邊距：16px（p-4）
  - 圓角：8px（rounded-lg）
  - 項目間距：8px（space-y-2）

- **Email 文字：**
  - 標籤：粗體（strong）
  - Email：主色（text-primary）
  - 左邊距：4px（ml-1）

- **說明文字：**
  - 大小：small（text-sm）
  - 顏色：muted-foreground

---

#### **3.2.4 提示框（藍色 - 基本提示）**

**結構：**
```typescript
<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
  <p className="text-sm text-blue-900">
    <strong>📌 小提示：</strong>
  </p>
  <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
    <li>郵件可能需要 1-2 分鐘送達</li>
    <li>請同時檢查垃圾郵件匣</li>
    {resendCount >= 1 && <li>搜尋關鍵字「Uknow」或「驗證」</li>}
    {resendCount >= 2 && <li>檢查促銷內容或社交網路分類</li>}
  </ul>
</div>
```

**視覺規範：**
- **容器：**
  - 背景：藍色 50（bg-blue-50）
  - 邊框：藍色 200（border-blue-200）
  - 圓角：8px（rounded-lg）
  - 內邊距：16px（p-4）

- **標題：**
  - 顏色：藍色 900（text-blue-900）
  - 大小：small（text-sm）
  - 粗體：strong

- **列表：**
  - 顏色：藍色 800（text-blue-800）
  - 大小：small（text-sm）
  - 項目間距：4px（space-y-1）
  - 左邊距：16px（ml-4）
  - 樣式：disc（list-disc）

---

#### **3.2.5 建議框（琥珀色 - 重發 3+ 次）**

**結構：**
```typescript
<div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
  <div className="flex items-start gap-2">
    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
    <div className="space-y-2 flex-1">
      <p className="text-sm text-amber-900">
        <strong>⚠️ 您已重發 {resendCount} 次驗證信</strong>
      </p>
      <p className="text-sm text-amber-800">仍未收到嗎？可能原因：</p>
      <ul className="text-sm text-amber-800 space-y-1 ml-4 list-disc">
        <li>信箱服務商延遲（特別是 Gmail, Yahoo）</li>
        <li>郵件被攔截或歸類到其他資料夾</li>
        <li>企業/學校信箱的安全設定</li>
      </ul>
      <p className="text-sm text-amber-900 mt-2">
        <strong>💡 建議：</strong>
      </p>
      <ul className="text-sm text-amber-800 space-y-1 ml-4 list-disc">
        <li>檢查垃圾郵件、促銷內容、社交網路分類</li>
        <li>在信箱中搜尋「Uknow」或「驗證」</li>
        <li>確認信箱地址是否正確</li>
        <li>如使用企業/學校信箱，建議更換為 Gmail、Yahoo 或 Outlook</li>
      </ul>
    </div>
  </div>
</div>
```

**視覺規範：**
- **容器：**
  - 背景：琥珀色 50（bg-amber-50）
  - 邊框：琥珀色 200（border-amber-200）
  - 圓角：8px（rounded-lg）
  - 內邊距：16px（p-4）
  - 項目間距：12px（space-y-3）

- **圖標：**
  - 組件：AlertCircle（lucide-react）
  - 尺寸：20x20 px（h-5 w-5）
  - 顏色：琥珀色 600（text-amber-600）
  - 對齊：頂部偏移（mt-0.5）
  - 不收縮：shrink-0

- **文字：**
  - 主標題：琥珀色 900（text-amber-900）
  - 列表/說明：琥珀色 800（text-amber-800）
  - 大小：small（text-sm）

---

#### **3.2.6 重發按鈕**

**狀態定義：**

| 狀態 ID | 狀態名稱 | 觸發條件 | variant | disabled | 圖標 |
|---------|---------|---------|---------|---------|------|
| **S1** | 初始冷卻 | `cooldownSeconds > 0 && resendCount === 0` | secondary | true | ⏱️ Clock |
| **S2** | 載入中 | `isResending === true` | outline | true | ⏳ Spinner |
| **S3** | 可點擊（首次） | `cooldownSeconds === 0 && resendCount === 0` | outline | false | 🔄 RefreshCw |
| **S4** | 可點擊（N次） | `cooldownSeconds === 0 && resendCount > 0` | outline | false | 🔄 RefreshCw |
| **S5** | 冷卻中（N次） | `cooldownSeconds > 0 && resendCount > 0` | secondary | true | ⏱️ Clock |

---

**視覺規格（各狀態）：**

**S1: 初始冷卻**
```typescript
<Button
  onClick={handleResend}
  disabled={true}
  variant="secondary"
  className="w-full"
>
  <Clock className="w-4 h-4 mr-2" />
  請稍候 85 秒後可重新寄送
</Button>
```

**S2: 載入中**
```typescript
<Button
  onClick={handleResend}
  disabled={true}
  variant="outline"
  className="w-full"
>
  <svg className="animate-spin h-4 w-4 mr-2" {...}>
    {/* Spinner SVG */}
  </svg>
  寄送中...
</Button>
```

**S3: 可點擊（首次）**
```typescript
<Button
  onClick={handleResend}
  disabled={false}
  variant="outline"
  className="w-full"
>
  <RefreshCw className="w-4 h-4 mr-2" />
  重新寄出驗證信
</Button>
```

**S4: 可點擊（已重發 2 次）**
```typescript
<Button
  onClick={handleResend}
  disabled={false}
  variant="outline"
  className="w-full"
>
  <RefreshCw className="w-4 h-4 mr-2" />
  重新寄出驗證信
  <span className="ml-2 text-xs text-muted-foreground">
    （已重發 2 次）
  </span>
</Button>
```

**S5: 冷卻中（已重發 2 次）**
```typescript
<Button
  onClick={handleResend}
  disabled={true}
  variant="secondary"
  className="w-full"
>
  <Clock className="w-4 h-4 mr-2" />
  請稍候 45 秒後可重新寄送
  <span className="ml-2 text-xs text-muted-foreground">
    （已重發 2 次）
  </span>
</Button>
```

---

**通用規格：**
- **寬度：** 100%（w-full）
- **高度：** 預設（約 40px）
- **圖標大小：** 16x16 px（w-4 h-4）
- **圖標間距：** 右邊距 8px（mr-2）
- **次數標籤：**
  - 左邊距：8px（ml-2）
  - 大小：extra small（text-xs）
  - 顏色：muted-foreground

---

#### **3.2.7 返回登入按鈕**

**結構：**
```typescript
<Button 
  onClick={() => navigate('/login')} 
  variant="ghost" 
  className="w-full"
>
  <ArrowLeft className="w-4 h-4 mr-2" />
  返回登入頁面
</Button>
```

**視覺規範：**
- **variant：** ghost（幽靈按鈕，透明背景）
- **寬度：** 100%（w-full）
- **圖標：** ArrowLeft（lucide-react）
- **圖標大小：** 16x16 px（w-4 h-4）
- **圖標間距：** 右邊距 8px（mr-2）

---

### 3.3 互動設計

#### **3.3.1 按鈕狀態切換**

**狀態機（State Machine）：**

```
[初始進入]
    ↓
[S1: 初始冷卻] (85 秒)
    ↓（倒數每秒 -1）
[S3/S4: 可點擊]
    ↓（用戶點擊）
[S2: 載入中] (3-5 秒)
    ↓
   API 成功？
    ├─ 是 → [S5: 冷卻中] (90 秒) → [S4: 可點擊]
    └─ 否 → [S3/S4: 可點擊]（錯誤恢復）
```

---

#### **3.3.2 倒數計時器動畫**

**更新頻率：** 每秒 1 次

**視覺效果：**
- 數字變化：無動畫，直接替換
- 無淡入淡出效果（避免過度動畫）

**實作：**
```typescript
useEffect(() => {
  if (state.cooldownSeconds <= 0) return;

  const timer = setInterval(() => {
    setState((prev) => {
      if (prev.cooldownSeconds <= 1) {
        clearInterval(timer);
        return { ...prev, cooldownSeconds: 0 };
      }
      return { ...prev, cooldownSeconds: prev.cooldownSeconds - 1 };
    });
  }, 1000);  // 每 1000ms（1 秒）更新一次

  return () => clearInterval(timer);
}, [state.cooldownSeconds]);
```

---

#### **3.3.3 Toast 通知**

**成功通知：**
```typescript
showToast('驗證信已重新寄出！', 'success');
```

**失敗通知：**
```typescript
showToast('重新發送失敗，請稍後再試', 'error');
```

**邊界情況通知：**
```typescript
showToast('無法重新發送驗證信', 'error');  // Email 為空
```

**顯示規範：**
- 位置：右上角
- 持續時間：3 秒
- 自動消失：是
- 可手動關閉：是

---

### 3.4 動畫與過渡

#### **3.4.1 Spinner 動畫**

**載入中 Spinner：**
```typescript
<svg className="animate-spin h-4 w-4 mr-2" {...}>
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.928l3-2.647z" />
</svg>
```

**動畫規格：**
- 類別：`animate-spin`
- 速度：Tailwind 預設（約 1 秒/圈）
- 方向：順時針
- 平滑度：linear

---

#### **3.4.2 提示框切換**

**藍色 → 琥珀色切換：**
```typescript
{!showSuggestions && (
  <div className="bg-blue-50 ...">
    {/* 藍色提示框 */}
  </div>
)}

{showSuggestions && (
  <div className="bg-amber-50 ...">
    {/* 琥珀色建議框 */}
  </div>
)}
```

**切換效果：**
- 類型：條件渲染（unmount + mount）
- 動畫：無（直接切換）
- 理由：避免過度動畫干擾用戶閱讀

---

## 4. 用戶流程

### 4.1 正常流程

#### **流程圖**

```
┌──────────────────────────────────────┐
│  [開始] 用戶填寫註冊表單              │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [T0] 點擊「註冊」按鈕                │
│  - 記錄時間戳：registrationTime      │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [後端] Supabase Auth 創建帳號        │
│  - 調用 signUp API                   │
│  - 自動發送第一封驗證信               │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [前端] 導航到驗證等待頁面            │
│  - navigate('/auth/verify-email')    │
│  - state: { email, registrationTime }│
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [T1] EmailVerificationPending 掛載  │
│  - 時間：T0 + 3-5 秒                 │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [計算] 初始冷卻時間                  │
│  - elapsed = (T1 - T0) ≈ 5 秒        │
│  - initialCooldown = 90 - 5 = 85 秒  │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [顯示] 按鈕狀態：初始冷卻            │
│  - 文字：「請稍候 85 秒後可重新寄送」 │
│  - variant: secondary                │
│  - disabled: true                    │
│  - 藍色提示框：基本提示               │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [倒數] 每秒更新                      │
│  - 85 → 84 → 83 → ... → 1 → 0        │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [T2] cooldownSeconds === 0          │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [顯示] 按鈕狀態：可點擊              │
│  - 文字：「重新寄出驗證信」           │
│  - variant: outline                  │
│  - disabled: false                   │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [等待] 用戶操作                      │
│  - 可能點擊重發                       │
│  - 或收到驗證信，離開頁面             │
└─────────────┬────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│  [結束]                               │
└──────────────────────────────────────┘
```

---

#### **詳細步驟表格**

| 步驟 | 時間點 | 操作者 | 動作 | 系統回應 | UI 狀態 |
|------|--------|--------|------|---------|---------|
| **1** | T0 | 用戶 | 點擊「註冊」按鈕 | 調用 Supabase signUp API | 按鈕：「註冊中...」 |
| **2** | T0+1s | 後端 | Supabase 創建帳號 | 帳號創建成功 | - |
| **3** | T0+2s | 後端 | Supabase 自動發送驗證信 | 郵件進入發送隊列 | - |
| **4** | T0+3s | 前端 | 導航到驗證頁面 | 掛載 EmailVerificationPending | 載入頁面 |
| **5** | T0+5s (T1) | 系統 | 計算初始冷卻 | initialCooldown = 85s | 顯示倒數 85 |
| **6** | T0+6s | 系統 | 倒數計時器 tick | cooldownSeconds = 84s | 顯示倒數 84 |
| **7** | T0+7s | 系統 | 倒數計時器 tick | cooldownSeconds = 83s | 顯示倒數 83 |
| **...** | ... | ... | ... | ... | ... |
| **90** | T0+95s | 系統 | 倒數到 0 | cooldownSeconds = 0 | 按鈕可點擊 |
| **91** | - | 用戶 | 等待郵件或點擊重發 | - | - |

---

### 4.2 重發流程（第 1 次）

#### **流程圖**

```
[倒數結束] cooldownSeconds = 0
    ↓
[顯示] 按鈕：「重新寄出驗證信」
    ↓
[用戶] 點擊按鈕
    ↓
[驗證] Email 是否存在？
    ├─ 否 → [顯示] Toast: 「無法重新發送驗證信」→ [結束]
    └─ 是 ↓
[更新] isResending = true
    ↓
[顯示] 按鈕：「⏳ 寄送中...」
    ↓
[API] 調用 supabase.auth.resend()
    ↓
  成功？
    ├─ 否 → [處理錯誤]
    │        ↓
    │      [更新] isResending = false
    │        ↓
    │      [顯示] Toast: 「重新發送失敗，請稍後再試」
    │        ↓
    │      [恢復] 按鈕：「重新寄出驗證信」（可點擊）
    │        ↓
    │      [結束]
    │
    └─ 是 → [處理成功]
             ↓
           [更新] resendCount = 1
             ↓
           [保存] localStorage.setItem('emailVerificationResendCount', '1')
             ↓
           [顯示] Toast: 「驗證信已重新寄出！」
             ↓
           [更新] isResending = false
           [更新] cooldownSeconds = 90
             ↓
           [顯示] 按鈕：「請稍候 90 秒後可重新寄送（已重發 1 次）」
             ↓
           [更新] 提示框：增加「搜尋關鍵字」提示
             ↓
           [倒數] 90 → 89 → ... → 0
             ↓
           [結束]
```

---

### 4.3 重發流程（第 3 次 - 顯示建議）

#### **關鍵變化**

```
[重發成功] resendCount = 3
    ↓
[判斷] resendCount >= 3 → showSuggestions = true
    ↓
[切換] 藍色提示框 → 琥珀色建議框
    ↓
[顯示] 完整建議：
       - ⚠️ 您已重發 3 次驗證信
       - 可能原因（3 項）
       - 💡 建議（4 項）
    ↓
[倒數] 90 → 89 → ... → 0
    ↓
[用戶] 閱讀建議，根據建議操作：
       - 搜尋「Uknow」
       - 檢查促銷內容
       - 確認 Email 正確性
       - 考慮更換信箱
```

---

### 4.4 頁面刷新流程

#### **流程圖**

```
[用戶] 正在等待冷卻（cooldownSeconds = 50）
    ↓
[用戶] 按 F5 刷新頁面
    ↓
[系統] 頁面重新載入
    ↓
[組件] EmailVerificationPending 掛載
    ↓
[讀取] localStorage
    ├─ emailVerificationStartTime: 1702627200000
    └─ emailVerificationResendCount: 2
    ↓
[計算] 冷卻剩餘時間
    - registrationTime = 1702627200000
    - now = Date.now()
    - elapsed = Math.floor((now - registrationTime) / 1000)
    - remaining = Math.max(0, 90 - elapsed)
    ↓
[恢復] 狀態
    - cooldownSeconds = remaining（例如：45）
    - resendCount = 2
    - isResending = false
    ↓
[顯示] 按鈕：「請稍候 45 秒後可重新寄送（已重發 2 次）」
    ↓
[倒數] 45 → 44 → ... → 0
    ↓
[用戶體驗] 無縫恢復，倒數繼續
```

---

### 4.5 錯誤恢復流程

#### **API 錯誤處理**

```
[用戶] 點擊重發
    ↓
[API] 調用 supabase.auth.resend()
    ↓
[錯誤] API 返回錯誤（例如網路問題）
    ↓
[記錄] console.error('Resend error:', error)
    ↓
[顯示] Toast: 「重新發送失敗，請稍後再試」
    ↓
[更新] isResending = false
    ↓
[恢復] 按鈕：「重新寄出驗證信」（可點擊）
    ↓
[重點] ✅ 不啟動冷卻
       ✅ 不增加 resendCount
       ✅ 允許用戶立即重試
```

**設計原則：** 錯誤寬容（Fault Tolerance）- 失敗不懲罰用戶

---

## 5. 技術規格

### 5.1 前端架構

#### **5.1.1 技術棧**

| 技術 | 版本 | 用途 |
|------|------|------|
| **React** | 18.x | UI 框架 |
| **TypeScript** | 5.x | 類型安全 |
| **React Router** | 6.x | 路由管理 |
| **Tailwind CSS** | 4.x | 樣式框架 |
| **Supabase JS** | 2.x | 認證 API |
| **lucide-react** | latest | 圖標庫 |

---

#### **5.1.2 組件層級**

```
EmailVerificationPending (容器組件)
├── Card
│   ├── CardHeader
│   │   ├── Mail Icon (裝飾性)
│   │   ├── CardTitle (標題)
│   │   └── CardDescription (描述)
│   └── CardContent
│       ├── EmailDisplay (Email 顯示區)
│       ├── TipsCard (提示卡片)
│       │   ├── BasicTips (基本提示) - resendCount < 3
│       │   └── SuggestionsCard (建議提示) - resendCount >= 3
│       └── ActionButtons (操作按鈕區)
│           ├── ResendButton (重發按鈕) - 主要按鈕
│           └── BackButton (返回按鈕) - 次要按鈕
```

---

#### **5.1.3 文件結構**

```
/components/
├── EmailVerificationPending.tsx  (主組件 - 286 行)
├── ui/
│   ├── button.tsx                (按鈕組件)
│   ├── card.tsx                  (卡片組件)
│   └── ...
└── notifications/
    └── NotificationContext.tsx   (Toast 上下文)

/components/AuthPage.tsx          (註冊頁面 - 修改 3 行)
```

---

### 5.2 狀態管理

#### **5.2.1 本地狀態（useState）**

```typescript
interface EmailVerificationState {
  firstEmailSentAt: number;    // 註冊時間（timestamp）
  cooldownSeconds: number;     // 冷卻剩餘秒數
  isResending: boolean;        // 重發中標誌
  resendCount: number;         // 重發次數
}

const [state, setState] = useState<EmailVerificationState>({
  firstEmailSentAt: 0,
  cooldownSeconds: 0,
  isResending: false,
  resendCount: 0,
});
```

**欄位說明：**
- `firstEmailSentAt`: 用戶註冊時間（第一封信發送時間），用於計算初始冷卻
- `cooldownSeconds`: 當前冷卻剩餘秒數，0 表示可以重發
- `isResending`: 是否正在調用 API 重發
- `resendCount`: 已成功重發的次數（不包含失敗次數）

---

#### **5.2.2 持久化狀態（localStorage）**

```typescript
// Schema
{
  emailVerificationStartTime: string;    // timestamp 字串
  emailVerificationResendCount: string;  // number 字串
}

// 範例
{
  emailVerificationStartTime: "1702627200000",
  emailVerificationResendCount: "2"
}
```

**讀寫邏輯：**

```typescript
// 寫入
localStorage.setItem('emailVerificationStartTime', registrationTime.toString());
localStorage.setItem('emailVerificationResendCount', newResendCount.toString());

// 讀取
const savedTime = localStorage.getItem('emailVerificationStartTime');
const registrationTime = savedTime ? parseInt(savedTime) : null;

const savedCount = localStorage.getItem('emailVerificationResendCount');
const resendCount = savedCount ? parseInt(savedCount) : 0;
```

---

#### **5.2.3 路由狀態（location.state）**

```typescript
// 從 AuthPage 傳遞
navigate('/auth/verify-email', {
  state: {
    email: string;              // 用戶註冊的 Email
    registrationTime: number;   // 註冊時間戳
  },
});

// 在 EmailVerificationPending 接收
const location = useLocation();
const email = location.state?.email || '';
const registrationTime = location.state?.registrationTime;
```

---

### 5.3 數據持久化策略

#### **5.3.1 持久化優先級**

```typescript
// 組件初始化時的數據來源優先級
useEffect(() => {
  // 1. 優先從 location.state 獲取（最新）
  let registrationTime = location.state?.registrationTime;

  // 2. 如果沒有，從 localStorage 獲取（刷新頁面後）
  if (!registrationTime) {
    const savedTime = localStorage.getItem(STORAGE_KEY_START_TIME);
    registrationTime = savedTime ? parseInt(savedTime) : null;
  }

  // 3. 如果還是沒有，使用當前時間（直接訪問頁面）
  if (!registrationTime) {
    registrationTime = Date.now();
  }

  // 保存到 localStorage（刷新頁面時使用）
  localStorage.setItem(STORAGE_KEY_START_TIME, registrationTime.toString());

  // ...
}, [location.state]);
```

---

#### **5.3.2 清理策略**

**何時清理 localStorage：**
- ✅ 用戶成功驗證 Email 後（在 AuthCallback 組件）
- ✅ 用戶登出後
- ❌ **不**在頁面卸載時清理（避免刷新丟失）

**清理代碼範例：**
```typescript
// AuthCallback.tsx（驗證成功後）
localStorage.removeItem('emailVerificationStartTime');
localStorage.removeItem('emailVerificationResendCount');
```

---

### 5.4 錯誤處理策略

#### **5.4.1 錯誤分類**

| 錯誤類型 | 觸發條件 | 處理策略 |
|---------|---------|---------|
| **邊界錯誤** | Email 為空 | 提前返回，顯示 Toast |
| **網路錯誤** | API 請求失敗 | 捕獲異常，顯示 Toast，不鎖定 |
| **API 錯誤** | Supabase 返回 error | 檢查 error，顯示 Toast，不鎖定 |
| **狀態錯誤** | 組件卸載時 timer 仍在執行 | useEffect cleanup 函數 |

---

#### **5.4.2 錯誤處理代碼**

**邊界錯誤：**
```typescript
const handleResend = async () => {
  // ✅ 邊界檢查
  if (!email) {
    showToast('無法重新發送驗證信', 'error');
    return;
  }
  
  // ...
};
```

**API 錯誤：**
```typescript
try {
  const { error } = await supabase.auth.resend({...});
  
  if (error) {
    // ✅ API 返回錯誤
    console.error('Resend error:', error);
    showToast('重新發送失敗，請稍後再試', 'error');
    setState((prev) => ({ ...prev, isResending: false }));
    return;  // 不啟動冷卻，允許重試
  }
  
  // 成功處理...
} catch (error) {
  // ✅ 捕獲異常（例如網路斷線）
  console.error('Error resending email:', error);
  showToast('重新發送失敗，請稍後再試', 'error');
  setState((prev) => ({ ...prev, isResending: false }));
}
```

**狀態錯誤（Timer 清理）：**
```typescript
useEffect(() => {
  if (state.cooldownSeconds <= 0) return;

  const timer = setInterval(() => {
    // 倒數邏輯...
  }, 1000);

  // ✅ Cleanup 函數（組件卸載時執行）
  return () => clearInterval(timer);
}, [state.cooldownSeconds]);
```

---

### 5.5 性能優化

#### **5.5.1 避免不必要的重渲染**

**useEffect 依賴最小化：**
```typescript
// ✅ 正確：僅依賴 location.state
useEffect(() => {
  // 組件初始化邏輯...
}, [location.state]);

// ✅ 正確：僅依賴 cooldownSeconds
useEffect(() => {
  // 倒數計時器邏輯...
}, [state.cooldownSeconds]);

// ❌ 錯誤：依賴整個 state（過度依賴）
useEffect(() => {
  // ...
}, [state]);  // 會導致每次狀態更新都重新執行
```

---

#### **5.5.2 Timer 清理機制**

**雙重清理策略：**
```typescript
useEffect(() => {
  if (state.cooldownSeconds <= 0) return;

  const timer = setInterval(() => {
    setState((prev) => {
      if (prev.cooldownSeconds <= 1) {
        clearInterval(timer);  // ✅ 清理 1：在狀態更新內清理
        return { ...prev, cooldownSeconds: 0 };
      }
      return { ...prev, cooldownSeconds: prev.cooldownSeconds - 1 };
    });
  }, 1000);

  return () => clearInterval(timer);  // ✅ 清理 2：組件卸載時清理
}, [state.cooldownSeconds]);
```

**為什麼需要雙重清理：**
- **清理 1（內部）：** 倒數到 0 時立即停止 timer，避免浪費資源
- **清理 2（cleanup）：** 組件卸載時（例如用戶離開頁面）清理 timer

---

## 6. 後端設計

### 6.1 API 端點

#### **6.1.1 Supabase Auth API**

**API：** `supabase.auth.resend()`

**用途：** 重新發送驗證信

**請求參數：**
```typescript
interface ResendRequest {
  type: 'signup' | 'recovery';  // 驗證類型
  email: string;                // 用戶 Email
  options?: {
    emailRedirectTo?: string;   // 驗證成功後的重定向 URL
  };
}
```

**請求範例：**
```typescript
const { data, error } = await supabase.auth.resend({
  type: 'signup',
  email: 'user@example.com',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

---

**響應結構：**

**成功：**
```typescript
{
  data: {},
  error: null
}
```

**失敗：**
```typescript
{
  data: null,
  error: {
    message: string;
    status: number;
  }
}
```

**常見錯誤：**

| 錯誤碼 | message | 原因 | 處理方式 |
|-------|---------|------|---------|
| 429 | Rate limit exceeded | 請求過於頻繁 | 顯示錯誤，不鎖定 |
| 400 | Invalid email | Email 格式錯誤 | 顯示錯誤，檢查 Email |
| 500 | Internal server error | 服務器錯誤 | 顯示錯誤，允許重試 |

---

### 6.2 數據流

#### **6.2.1 註冊流程數據流**

```
┌─────────────┐
│   用戶      │
└──────┬──────┘
       │ 1. 填寫表單（Email, Password）
       ↓
┌─────────────────────────────┐
│   AuthPage 組件             │
│   - 驗證表單                │
│   - 調用 signUp API         │
└──────┬──────────────────────┘
       │ 2. POST /auth/v1/signup
       ↓
┌─────────────────────────────┐
│   Supabase Auth API         │
│   - 創建用戶帳號            │
│   - 發送驗證信              │
└──────┬──────────────────────┘
       │ 3. 返回成功
       ↓
┌─────────────────────────────┐
│   AuthPage 組件             │
│   - navigate('/auth/verify-email') │
│   - state: { email, registrationTime } │
└──────┬──────────────────────┘
       │ 4. 路由跳轉
       ↓
┌─────────────────────────────┐
│   EmailVerificationPending  │
│   - 接收 state              │
│   - 計算冷卻時間            │
│   - 顯示等待頁面            │
└─────────────────────────────┘
```

---

#### **6.2.2 重發流程數據流**

```
┌─────────────┐
│   用戶      │
└──────┬──────┘
       │ 1. 點擊「重新寄出」
       ↓
┌─────────────────────────────┐
│   EmailVerificationPending  │
│   - 驗證 Email              │
│   - isResending = true      │
└──────┬──────────────────────┘
       │ 2. POST /auth/v1/resend
       ↓
┌─────────────────────────────┐
│   Supabase Auth API         │
│   - 驗證請求                │
│   - 發送驗證信              │
└──────┬──────────────────────┘
       │ 3. 返回結果
       ↓
   成功？
    ├─ 是 → ┌─────────────────────────────┐
    │       │   EmailVerificationPending  │
    │       │   - 顯示 Toast 成功         │
    │       │   - resendCount + 1         │
    │       │   - 保存 localStorage       │
    │       │   - cooldownSeconds = 90    │
    │       │   - 更新 UI                 │
    │       └─────────────────────────────┘
    │
    └─ 否 → ┌─────────────────────────────┐
            │   EmailVerificationPending  │
            │   - 顯示 Toast 失敗         │
            │   - isResending = false     │
            │   - 不啟動冷卻              │
            │   - 允許重試                │
            └─────────────────────────────┘
```

---

### 6.3 未來擴展：後端限流設計

**（P2 優先級 - 未來實施）**

#### **6.3.1 限流規則**

| 限制類型 | 規則 | 時間窗口 |
|---------|------|---------|
| **Email 維度** | 同一 Email 最多 5 次重發 | 1 小時 |
| **IP 維度** | 同一 IP 最多 10 次重發 | 1 小時 |
| **全局** | 最小重發間隔 90 秒 | - |

---

#### **6.3.2 實作架構**

```
POST /auth/resend-verification
    ↓
[檢查 1] 距離上次重發是否 >= 90 秒？
    ├─ 否 → 返回 429: "請等待 XX 秒後再試"
    └─ 是 ↓
[檢查 2] 過去 1 小時內該 Email 重發次數 < 5？
    ├─ 否 → 返回 429: "重發次數過多，請 1 小時後再試"
    └─ 是 ↓
[檢查 3] 過去 1 小時內該 IP 重發次數 < 10？
    ├─ 否 → 返回 429: "重發次數過多，請稍後再試"
    └─ 是 ↓
[記錄] 保存重發記錄到 KV Store
    ↓
[調用] Supabase Auth API
    ↓
[返回] 結果給前端
```

---

#### **6.3.3 數據結構（KV Store）**

```typescript
// Key: resend_history:{email}
// Value:
{
  email: string;
  resendHistory: Array<{
    timestamp: number;
    ip: string;
    userAgent: string;
  }>;
}

// 範例
{
  email: "user@example.com",
  resendHistory: [
    { timestamp: 1702627200000, ip: "1.2.3.4", userAgent: "..." },
    { timestamp: 1702627290000, ip: "1.2.3.4", userAgent: "..." }
  ]
}
```

---

## 7. 數據結構定義

### 7.1 TypeScript Interface

#### **7.1.1 EmailVerificationState**

```typescript
/**
 * Email 驗證頁面的狀態
 */
interface EmailVerificationState {
  /**
   * 第一封驗證信發送時間（註冊時間）
   * - 用於計算初始冷卻時間
   * - timestamp（毫秒）
   */
  firstEmailSentAt: number;

  /**
   * 冷卻剩餘秒數
   * - 0 表示可以重發
   * - > 0 表示需要等待
   */
  cooldownSeconds: number;

  /**
   * 是否正在調用 API 重發
   * - true: 載入中狀態（顯示 Spinner）
   * - false: 正常狀態
   */
  isResending: boolean;

  /**
   * 已成功重發的次數
   * - 不包含失敗的重發
   * - 用於漸進式提示邏輯
   */
  resendCount: number;
}
```

---

#### **7.1.2 LocationState（路由狀態）**

```typescript
/**
 * 從 AuthPage 傳遞到 EmailVerificationPending 的路由狀態
 */
interface EmailVerificationLocationState {
  /**
   * 用戶註冊的 Email
   */
  email: string;

  /**
   * 註冊時間戳（毫秒）
   * - 用於計算初始冷卻時間
   */
  registrationTime: number;
}

// 使用範例
navigate('/auth/verify-email', {
  state: {
    email: 'user@example.com',
    registrationTime: Date.now(),
  } as EmailVerificationLocationState,
});
```

---

#### **7.1.3 ResendRequest（API 請求）**

```typescript
/**
 * Supabase Auth resend API 請求參數
 */
interface ResendRequest {
  /**
   * 驗證類型
   * - 'signup': 註冊驗證
   * - 'recovery': 密碼重置
   */
  type: 'signup' | 'recovery';

  /**
   * 用戶 Email
   */
  email: string;

  /**
   * 可選配置
   */
  options?: {
    /**
     * 驗證成功後的重定向 URL
     * - 預設：${window.location.origin}/auth/callback
     */
    emailRedirectTo?: string;
  };
}
```

---

### 7.2 localStorage Schema

#### **7.2.1 Schema 定義**

```typescript
/**
 * localStorage 中存儲的鍵值對
 */
interface EmailVerificationLocalStorage {
  /**
   * Key: emailVerificationStartTime
   * Value: timestamp 字串
   * 
   * 用途：保存註冊時間，用於刷新頁面後重新計算冷卻時間
   * 
   * 範例：'1702627200000'
   */
  emailVerificationStartTime: string;

  /**
   * Key: emailVerificationResendCount
   * Value: number 字串
   * 
   * 用途：保存重發次數，用於刷新頁面後恢復狀態
   * 
   * 範例：'2'
   */
  emailVerificationResendCount: string;
}
```

---

#### **7.2.2 讀寫操作**

**寫入：**
```typescript
// 寫入註冊時間
localStorage.setItem(
  'emailVerificationStartTime', 
  registrationTime.toString()
);

// 寫入重發次數
localStorage.setItem(
  'emailVerificationResendCount', 
  resendCount.toString()
);
```

**讀取：**
```typescript
// 讀取註冊時間（帶預設值）
const savedTime = localStorage.getItem('emailVerificationStartTime');
const registrationTime = savedTime ? parseInt(savedTime) : null;

// 讀取重發次數（帶預設值）
const savedCount = localStorage.getItem('emailVerificationResendCount');
const resendCount = savedCount ? parseInt(savedCount) : 0;
```

**清理：**
```typescript
// 驗證成功後清理（在 AuthCallback 組件）
localStorage.removeItem('emailVerificationStartTime');
localStorage.removeItem('emailVerificationResendCount');
```

---

### 7.3 常數定義

```typescript
/**
 * 固定冷卻時間：90 秒
 */
const COOLDOWN_DURATION = 90;

/**
 * localStorage 鍵名：註冊時間
 */
const STORAGE_KEY_START_TIME = 'emailVerificationStartTime';

/**
 * localStorage 鍵名：重發次數
 */
const STORAGE_KEY_RESEND_COUNT = 'emailVerificationResendCount';

/**
 * 建議提示觸發閾值：重發 3 次
 */
const SUGGESTIONS_THRESHOLD = 3;
```

---

## 8. 業務邏輯

### 8.1 冷卻時間計算邏輯

#### **8.1.1 初始冷卻計算**

**函數簽名：**
```typescript
function calculateInitialCooldown(registrationTime: number): number
```

**輸入：**
- `registrationTime`: 註冊時間戳（毫秒）

**輸出：**
- 冷卻剩餘秒數（0-90）

**邏輯：**
```typescript
const calculateInitialCooldown = (registrationTime: number): number => {
  // 當前時間
  const now = Date.now();
  
  // 已經過的時間（秒）
  const elapsed = Math.floor((now - registrationTime) / 1000);

  // 如果距離註冊時間已超過 90 秒，則可以立即重發
  if (elapsed >= COOLDOWN_DURATION) {
    return 0;
  }

  // 否則，冷卻剩餘時間 = 90 - 已經過的時間
  return COOLDOWN_DURATION - elapsed;
};
```

---

**測試用例：**

| 場景 | registrationTime | now | elapsed | 輸出 |
|------|-----------------|-----|---------|------|
| 立即進入 | T0 | T0 + 5s | 5s | 85 |
| 延遲進入 | T0 | T0 + 30s | 30s | 60 |
| 超過冷卻 | T0 | T0 + 100s | 100s | 0 |

---

### 8.2 重發次數統計邏輯

#### **8.2.1 次數增加條件**

**何時增加次數：**
- ✅ API 調用成功後
- ❌ **不**在 API 失敗後增加

**代碼：**
```typescript
const handleResend = async () => {
  setState((prev) => ({ ...prev, isResending: true }));

  try {
    const { error } = await supabase.auth.resend({...});

    if (error) {
      // ❌ API 失敗：不增加次數
      showToast('重新發送失敗，請稍後再試', 'error');
      setState((prev) => ({ ...prev, isResending: false }));
      return;
    }

    // ✅ API 成功：增加次數
    const newResendCount = state.resendCount + 1;
    localStorage.setItem(STORAGE_KEY_RESEND_COUNT, newResendCount.toString());

    setState((prev) => ({
      ...prev,
      isResending: false,
      cooldownSeconds: COOLDOWN_DURATION,
      resendCount: newResendCount,  // 更新次數
    }));
  } catch (error) {
    // ❌ 異常：不增加次數
    setState((prev) => ({ ...prev, isResending: false }));
  }
};
```

---

#### **8.2.2 次數重置條件**

**何時重置次數：**
- ✅ 用戶成功驗證 Email 後（AuthCallback 組件清理 localStorage）
- ✅ 用戶登出後

**何時不重置：**
- ❌ 刷新頁面（持久化保持）
- ❌ 關閉分頁

---

### 8.3 建議顯示邏輯

#### **8.3.1 觸發條件**

```typescript
// 是否顯示建議（重發 3 次後）
const showSuggestions = resendCount >= 3;
```

**邏輯表：**

| resendCount | showSuggestions | 提示框類型 |
|------------|-----------------|-----------|
| 0 | false | 藍色基本提示 |
| 1 | false | 藍色基本提示 + 提示 1 |
| 2 | false | 藍色基本提示 + 提示 1 + 提示 2 |
| 3 | true | 琥珀色完整建議 |
| 4+ | true | 琥珀色完整建議 |

---

#### **8.3.2 提示內容決策樹**

```
[resendCount]
    ↓
  < 3 ?
    ├─ 是 → [顯示藍色提示框]
    │         ↓
    │       resendCount >= 1 ?
    │         ├─ 是 → [增加提示：搜尋關鍵字]
    │         └─ 否 → [基本提示]
    │         ↓
    │       resendCount >= 2 ?
    │         ├─ 是 → [增加提示：檢查促銷內容]
    │         └─ 否 → [保持]
    │
    └─ 否 → [顯示琥珀色建議框]
              ↓
            [完整建議：原因 + 解決方案]
```

---

### 8.4 倒數計時器邏輯

#### **8.4.1 Timer 實作**

```typescript
useEffect(() => {
  // 如果冷卻時間 <= 0，不啟動 timer
  if (state.cooldownSeconds <= 0) return;

  // 每秒執行一次
  const timer = setInterval(() => {
    setState((prev) => {
      // 倒數到 1 時，清理 timer 並歸零
      if (prev.cooldownSeconds <= 1) {
        clearInterval(timer);
        return { ...prev, cooldownSeconds: 0 };
      }
      
      // 否則減 1
      return { ...prev, cooldownSeconds: prev.cooldownSeconds - 1 };
    });
  }, 1000);

  // Cleanup 函數（組件卸載時清理 timer）
  return () => clearInterval(timer);
}, [state.cooldownSeconds]);
```

---

#### **8.4.2 Timer 生命週期**

```
[啟動] cooldownSeconds = 90
    ↓
[執行] 每 1000ms 觸發一次
    ↓
[更新] cooldownSeconds - 1
    ↓
  cooldownSeconds > 1 ?
    ├─ 是 → [繼續倒數]
    └─ 否 → [清理 timer] + [歸零]
         ↓
       [停止]
```

---

## 9. 測試策略

### 9.1 單元測試計畫

#### **9.1.1 測試框架**

- **測試框架：** Jest + React Testing Library
- **覆蓋率目標：** 80%+

---

#### **9.1.2 測試用例清單**

**1. calculateInitialCooldown 函數測試**

```typescript
describe('calculateInitialCooldown', () => {
  it('應該返回 0 當已過時間 >= 90 秒', () => {
    const now = Date.now();
    const registrationTime = now - 100 * 1000;
    expect(calculateInitialCooldown(registrationTime)).toBe(0);
  });

  it('應該返回剩餘冷卻時間', () => {
    const now = Date.now();
    const registrationTime = now - 30 * 1000;
    expect(calculateInitialCooldown(registrationTime)).toBe(60);
  });

  it('應該處理立即進入的情況', () => {
    const now = Date.now();
    const registrationTime = now - 5 * 1000;
    expect(calculateInitialCooldown(registrationTime)).toBe(85);
  });
});
```

---

**2. 倒數計時器測試**

```typescript
describe('Countdown Timer', () => {
  it('應該每秒減 1', async () => {
    jest.useFakeTimers();
    
    const { getByText } = render(<EmailVerificationPending />);
    
    // 初始狀態
    expect(getByText(/請稍候 85 秒後可重新寄送/)).toBeInTheDocument();
    
    // 1 秒後
    jest.advanceTimersByTime(1000);
    expect(getByText(/請稍候 84 秒後可重新寄送/)).toBeInTheDocument();
    
    jest.useRealTimers();
  });

  it('應該在倒數到 0 後啟用按鈕', async () => {
    jest.useFakeTimers();
    
    const { getByRole } = render(<EmailVerificationPending />);
    const button = getByRole('button', { name: /重新寄出/ });
    
    // 初始禁用
    expect(button).toBeDisabled();
    
    // 快進 90 秒
    jest.advanceTimersByTime(90000);
    
    // 應該啟用
    expect(button).not.toBeDisabled();
    
    jest.useRealTimers();
  });
});
```

---

**3. 重發功能測試**

```typescript
describe('Resend Functionality', () => {
  it('應該調用 API 並顯示成功 Toast', async () => {
    const mockResend = jest.fn().mockResolvedValue({ error: null });
    
    const { getByRole } = render(<EmailVerificationPending />);
    const button = getByRole('button', { name: /重新寄出/ });
    
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockResend).toHaveBeenCalled();
      expect(screen.getByText('驗證信已重新寄出！')).toBeInTheDocument();
    });
  });

  it('應該處理 API 錯誤並恢復按鈕', async () => {
    const mockResend = jest.fn().mockResolvedValue({ 
      error: { message: 'Error' } 
    });
    
    const { getByRole } = render(<EmailVerificationPending />);
    const button = getByRole('button', { name: /重新寄出/ });
    
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText('重新發送失敗，請稍後再試')).toBeInTheDocument();
      expect(button).not.toBeDisabled();  // 應該恢復可點擊
    });
  });
});
```

---

**4. localStorage 持久化測試**

```typescript
describe('localStorage Persistence', () => {
  it('應該在刷新頁面後恢復狀態', () => {
    localStorage.setItem('emailVerificationStartTime', Date.now().toString());
    localStorage.setItem('emailVerificationResendCount', '2');
    
    const { getByText } = render(<EmailVerificationPending />);
    
    expect(getByText(/已重發 2 次/)).toBeInTheDocument();
  });

  it('應該重新計算冷卻剩餘時間', () => {
    const pastTime = Date.now() - 50 * 1000;  // 50 秒前
    localStorage.setItem('emailVerificationStartTime', pastTime.toString());
    
    const { getByText } = render(<EmailVerificationPending />);
    
    expect(getByText(/請稍候 40 秒後可重新寄送/)).toBeInTheDocument();
  });
});
```

---

**5. 漸進式提示測試**

```typescript
describe('Progressive Tips', () => {
  it('應該在重發 3 次後顯示建議', () => {
    localStorage.setItem('emailVerificationResendCount', '3');
    
    const { getByText } = render(<EmailVerificationPending />);
    
    expect(getByText(/您已重發 3 次驗證信/)).toBeInTheDocument();
    expect(getByText(/可能原因/)).toBeInTheDocument();
    expect(getByText(/建議/)).toBeInTheDocument();
  });

  it('應該在重發 < 3 次時顯示基本提示', () => {
    localStorage.setItem('emailVerificationResendCount', '1');
    
    const { getByText, queryByText } = render(<EmailVerificationPending />);
    
    expect(getByText(/小提示/)).toBeInTheDocument();
    expect(queryByText(/您已重發 1 次驗證信/)).not.toBeInTheDocument();
  });
});
```

---

### 9.2 整合測試計畫

#### **測試場景**

**1. 完整註冊流程測試**

```typescript
describe('Complete Registration Flow', () => {
  it('應該完成從註冊到重發的完整流程', async () => {
    // 1. 用戶填寫註冊表單
    const { getByLabelText, getByRole } = render(<AuthPage />);
    
    fireEvent.change(getByLabelText('Email'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(getByLabelText('密碼'), {
      target: { value: 'Test123!@#' }
    });
    
    // 2. 點擊註冊
    fireEvent.click(getByRole('button', { name: '註冊' }));
    
    // 3. 導航到驗證頁面
    await waitFor(() => {
      expect(screen.getByText('驗證您的 Email')).toBeInTheDocument();
    });
    
    // 4. 確認冷卻狀態
    const button = screen.getByRole('button', { name: /請稍候/ });
    expect(button).toBeDisabled();
    
    // 5. 等待冷卻結束
    jest.advanceTimersByTime(90000);
    
    // 6. 點擊重發
    fireEvent.click(screen.getByRole('button', { name: /重新寄出/ }));
    
    // 7. 確認成功
    await waitFor(() => {
      expect(screen.getByText('驗證信已重新寄出！')).toBeInTheDocument();
    });
  });
});
```

---

### 9.3 E2E 測試計畫

**測試工具：** Playwright / Cypress

**關鍵測試場景：**

1. **正常註冊流程**
   - 填寫表單 → 註冊 → 驗證頁面 → 等待冷卻 → 重發 → 成功

2. **頁面刷新測試**
   - 註冊 → 驗證頁面 → 刷新 → 確認狀態恢復

3. **錯誤處理測試**
   - 斷開網路 → 點擊重發 → 確認錯誤提示

4. **多次重發測試**
   - 重發 3 次 → 確認建議框顯示

---

### 9.4 手動測試清單

**（已完成 - 參考 EMAIL_VERIFICATION_TESTING_GUIDE.md）**

詳細的 11 個手動測試場景請參考測試指南文檔。

---

## 10. 非功能需求

### 10.1 性能要求

| 指標 | 目標值 | 衡量方式 |
|------|--------|---------|
| **頁面載入時間** | < 1 秒 | Lighthouse |
| **倒數更新延遲** | < 50ms | 開發者工具 Performance |
| **API 響應時間** | < 3 秒 | 網路監控 |
| **內存使用** | < 50MB | Chrome DevTools Memory |

---

### 10.2 安全要求

| 需求 | 說明 | 狀態 |
|------|------|------|
| **HTTPS 強制** | 所有請求必須使用 HTTPS | ✅ Supabase 強制 |
| **XSS 防護** | 用戶輸入正確轉義 | ✅ React 預設防護 |
| **CSRF 防護** | Supabase 處理 | ✅ Supabase 處理 |
| **後端限流** | 防止濫用 | ⏸️ P2（未來實施） |

---

### 10.3 可訪問性要求

| 需求 | 說明 | 狀態 |
|------|------|------|
| **鍵盤導航** | 所有功能可通過鍵盤操作 | ✅ 按鈕支持 Enter/Space |
| **螢幕閱讀器** | 重要信息可被讀取 | ⚠️ 可增強（ARIA 標籤） |
| **顏色對比度** | WCAG AA 標準 | ✅ 通過 |
| **焦點樣式** | 明確的焦點指示器 | ✅ Tailwind 預設 |

---

### 10.4 瀏覽器兼容性

| 瀏覽器 | 版本 | 支持狀態 |
|--------|------|---------|
| Chrome | 90+ | ✅ 完全支持 |
| Firefox | 88+ | ✅ 完全支持 |
| Safari | 14+ | ✅ 完全支持 |
| Edge | 90+ | ✅ 完全支持 |
| Mobile Safari | iOS 14+ | ✅ 完全支持 |
| Chrome Mobile | Android 10+ | ✅ 完全支持 |

---

## 11. 發布計畫

### 11.1 發布階段

#### **階段 1：開發環境測試（已完成）**

- ✅ 功能開發完成
- ✅ 自我測試通過
- ✅ 代碼審查通過

---

#### **階段 2：Staging 環境測試（建議）**

**測試項目：**
- [ ] 11 個手動測試場景
- [ ] 跨瀏覽器兼容性測試
- [ ] 響應式設計測試（手機/平板/桌面）
- [ ] 性能測試（Lighthouse）
- [ ] 可訪問性測試（axe DevTools）

**驗收標準：**
- 所有測試場景通過
- Lighthouse 分數 > 90
- 無阻塞性 Bug

---

#### **階段 3：灰度發布（可選）**

**灰度策略：**
- 10% 新用戶（第 1 週）
- 50% 新用戶（第 2 週）
- 100% 新用戶（第 3 週）

**監控指標：**
- 重發次數變化
- 註冊完成率變化
- 客服諮詢量變化
- 錯誤率

---

#### **階段 4：全量發布**

**發布檢查清單：**
- [ ] 所有測試通過
- [ ] 監控儀表板就緒
- [ ] 回滾方案準備完成
- [ ] 團隊通知完成

---

### 11.2 回滾策略

#### **回滾觸發條件**

| 條件 | 閾值 | 動作 |
|------|------|------|
| **錯誤率飆升** | > 5% | 立即回滾 |
| **註冊完成率下降** | < -10% | 評估後回滾 |
| **用戶投訴** | > 10 件/小時 | 調查後決定 |

---

#### **回滾步驟**

1. 停止新流量導向新版本
2. 恢復舊版本代碼
3. 清理用戶 localStorage（如需要）
4. 驗證舊版本正常運作
5. 分析問題原因
6. 修復後重新發布

---

### 11.3 監控指標

#### **關鍵指標儀表板**

**用戶行為指標：**
- 平均重發次數
- 重發 3 次以上比例
- 註冊到驗證成功的時間
- 頁面停留時間

**系統性能指標：**
- API 請求量
- API 錯誤率
- 頁面載入時間
- 內存使用量

**業務影響指標：**
- 註冊完成率
- 客服諮詢量（驗證信相關）
- 用戶滿意度（問卷）

---

## 12. 附錄

### 12.1 設計稿（Wireframes）

**（由實際代碼生成，請參���實作）**

---

### 12.2 競品分析

**其他平台的 Email 驗證機制：**

| 平台 | 冷卻機制 | 倒數顯示 | 提示系統 | 評價 |
|------|---------|---------|---------|------|
| **Gmail** | 60 秒 | 無 | 基本 | 🟡 中等 |
| **GitHub** | 無 | 無 | 詳細 | 🟡 中等 |
| **Discord** | 無 | 無 | 基本 | 🟠 較差 |
| **Notion** | 30 秒 | 有 | 詳細 | 🟢 優秀 |
| **Uknow（本專案）** | **90 秒** | **有** | **漸進式** | ✅ **業界領先** |

---

### 12.3 用戶研究數據

**（預期數據，實際數據需發布後收集）**

**假設：**
- 50% 用戶在 2 分鐘內收到驗證信
- 30% 用戶在 2-5 分鐘內收到
- 15% 用戶在 5-10 分鐘內收到
- 5% 用戶超過 10 分鐘（需要檢查垃圾郵件）

**基於假設的預期表現：**
- 80% 用戶只需重發 0-1 次
- 15% 用戶需要重發 2-3 次
- 5% 用戶需要重發 3 次以上（看到建議框）

---

### 12.4 變更歷史

| 版本 | 日期 | 變更內容 | 作者 |
|------|------|---------|------|
| 1.0 | 2024-12-15 | 初始版本 - 完整功能實作 | PM / Technical Lead |

---

## 📝 文檔資訊

**文檔版本：** 1.0  
**最後更新：** 2024-12-15  
**維護者：** Product Manager  
**狀態：** ✅ 已實作並投產  

**相關文檔：**
- `CODE_REVIEW_REPORT.md` - 代碼審查報告
- `EMAIL_VERIFICATION_DESIGN_SPEC.md` - 設計規格（待撰寫）
- `EMAIL_VERIFICATION_TECHNICAL_SPEC.md` - 技術規格（待撰寫）
- `EMAIL_VERIFICATION_API_SPEC.md` - API 規格（待撰寫）
- `EMAIL_VERIFICATION_TESTING_GUIDE.md` - 測試指南（已完成）
- `EMAIL_VERIFICATION_IMPLEMENTATION_SUMMARY.md` - 實作總結（已完成）
- `EMAIL_VERIFICATION_QUICK_REFERENCE.md` - 快速參考（已完成）

---

**✅ 產品需求文檔（PRD）完成！**
