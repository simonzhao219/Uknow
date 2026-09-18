# Uknow UI/UX 準則

> **文件定位**：本文件是**前端互動與版面慣例的參照對象**。`/plan-feature` 的
> UI 章節、`plan-reviewer-uiux` 的模式一致性審查都對照這裡——規劃要發明新模式，
> 得先說明為什麼既有模式不適用。
>
> **前提**：規格明訂「以手機瀏覽器為主要優化目標」，使用者幾乎都在手機上
> （LINE 內建瀏覽器佔比高，見 `src/utils/browserDetection.ts`）。
> **桌面思維的設計是缺口，不是風格差異。**
>
> 本文件寫「規則」；規則的執行期真相在元件與測試裡，衝突時以程式碼為準
> 並回頭修本文件。

---

## 1. 尺寸與觸控

| 規則 | 值 | 依據 |
|---|---|---|
| 根字級 | **16px**（`--font-size`，`globals.css`） | 曾是 14px，使全站 rem 尺寸比 Tailwind 設計原意小 12.5% |
| 表單輸入字級 | 手機**明確 16px**、桌機 `md:text-sm` | <16px 時 iOS Safari 聚焦會自動放大整頁 |
| 觸控目標 | 觸控裝置（`pointer-coarse`）**≥ 44px** | Apple HIG 44px / Material 48dp；滑鼠維持精簡密度 |

〔實作〕`src/components/ui/{button,input,select,textarea}.tsx` 以
`pointer-coarse:min-h-[44px]` 達成，**不是**把桌面尺寸一起放大。
新增互動元件比照辦理。

## 2. 樣式基礎

- **Tailwind JIT 已啟用**（`tailwindcss` + `@tailwindcss/vite`）。
  `src/styles/globals.css` 是 design token 的**單一來源**。
- ⚠️ **不要引入預先編譯的 CSS**。專案初期用的是 Figma 匯出的靜態編譯
  `index.css`，任何未預先產生的 class 會**靜默失效**——曾為了一個 OTP 樣式
  手動補 CSS 才發現。token 改動應即時生效，做不到就是有人繞過了 JIT。
- **深色模式**：`.dark` 的 `--card`/`--popover` 需比 `--background` 亮一階
  （0.145→0.205），否則卡片與背景同色、完全沒有層次。
  目前無使用者切換入口（`next-themes` 已具備底層，要開放需補切換 UI）。
- **色彩與設計語言**（語義色 token、灰階對照表、對比度門檻、深色/色盲驗證
  checklist）→ 見 §12。

## 3. 導覽與資訊架構

**底部導覽（`BottomNav`）契約**——這是釘死在測試裡的 UI/UX 決策，不是實作細節：

1. **只有五格**——超過就開始壓縮拇指熱區。
2. 順序固定 **首頁 → 任務 → 推薦 → 獎勵 → 會員**
   （發現 → 做事賺 → 拉人賺 → 收錢 → 我）。
3. feature flag 只會讓**中間**的格子消失，**絕不改變剩下項目的相對順序**
   ——導覽列在不同帳號狀態下漂移，使用者的位置記憶就失效了。
4. **刊登不在導覽列裡**（主入口在會員中心）。

〔實作/契約〕`src/components/BottomNav.test.tsx` 檔頭。新增會員區入口前
先讀那份契約，再決定放哪。

其他：`Navbar` 為 `sticky`；`Footer` 保留快速連結；
已登入的功能入口不應只藏在右上頭像下拉裡。

## 4. 表單

- **密碼欄一律用 `PasswordInput`**（眼睛切換，`aria-label`/`aria-pressed`）
  ——手機盲打易錯。
- 補 `autocomplete`（`email` / `current-password` / `new-password`）。
- 送出型表單用 `<form>` 包起來（Enter 送出、瀏覽器行為一致）。
- 錯誤顯示用 `aria-invalid` + `FieldError`。

**表單內的法遵連結一律用就地彈窗**（`LegalDialog` + `LegalMarkdown`），
不換頁、不開新分頁：換頁會卸載整個表單、連同 `useState` 一起蒸發，回來只剩
空白表單；`target=_blank` 在 LINE 等內建瀏覽器會被擋。長表單另以可持久化
來源存草稿（`src/utils/formDraft.ts`）。完整理由見
[`multi-step-flow-recovery.md`](multi-step-flow-recovery.md)。

## 5. 列表與感知效能

- **列表載入用骨架屏**（與卡片同形 + `aria-busy`），不要單一置中 spinner
  ——spinner 等待感強，且資料到位時版面會跳動。`Skeleton` 元件已存在。
  已套用：首頁。可延伸：`MemberDashboard`、獎勵/推薦/後台列表。
- **重新驗證中的清單**（例如切換伺服器端排序）以降透明度 + `aria-busy` 標示，
  保留舊資料，不要清空——避免看似無回應的空窗。
- **不得靜默截斷**：分頁或搜尋只回前 N 筆而不揭露總數，會讓使用者以為
  「找不到」等於「不存在」。要顯示「已顯示 X / Y 筆」並提供載入更多。

## 6. 三態完備

每個新畫面都要規劃**空態 / 錯誤態 / 載入態**——缺態是上線後最常見的 UX 事故。
既有的空狀態與 Toast（手機底部定位 `bottom-4 md:top-4`）可直接沿用。

## 7. 響應式版面策略

- 雙套版面（`md:hidden` / `hidden md:*`）+ Sheet 抽屜，是本專案的成熟模式。
- **重列表改用 `useMediaQuery` 擇一渲染，而不是 CSS 雙套版面**——判準兩條，
  兩條都成立才換：
  1. **DOM 成本不對稱**：雙套版面把兩棵樹同時掛上。輕卡片無所謂（`HomePage`
     就是這樣），但 6～11 欄 × 數十列的表格再加上幾個 Dialog，兩份都在
     DOM 裡是實打實的浪費。
  2. **可測試性**：jsdom 不套用 Tailwind，CSS 雙套版面下兩棵樹同時存在，
     `getByText` 立刻變成 "found multiple elements"，既有元件測試會整批
     誤紅——而那個紅燈不代表任何真實缺陷。
  代價要一起接受：`window.matchMedia` 成為必要相依，測試側一律在
  `beforeEach` 掛 `src/test-utils/stubMediaQuery`；跨越斷點時元件會即時
  重渲染成另一套，**只在其中一套渲染的控制項，它的 state 要一併處置**
  （否則會留下看得到、動不了的殭屍狀態）。
  〔實作〕`src/components/admin/WithdrawalManagement.tsx`、`MemberManagement.tsx`、
  `SystemAlerts.tsx` 與其測試。
- **手機卡片資訊量不得低於桌面到「只剩照片+名字」的程度**。
  首頁手機版為兩欄資訊卡（照片/性別/名稱/類別/地區）。
- 依賴定位的功能（如距離排序）**只在取得真實定位後才啟用**，
  不要用寫死的座標當預設——對非該地區使用者是誤導。
- **滿版橫條的內容必須對齊版面中軸**（`container` 的中線），不是貼齊視窗
  邊緣。橫條鋪滿視窗、內容卻用 `flex-1` 撐開推到兩端時，手機上看起來正常
  （窄螢幕文字本來就填滿整列），桌機寬版卻把訊息丟在視線動線之外——版面
  主體全在中軸上，使用者不會往邊緣看。做法：`sm:` 以上 `justify-center`
  ＋不讓文字 `flex-1`，關閉／動作鈕改絕對定位釘住邊緣（留在流排版裡會把
  訊息擠離中軸），並給文字 `max-w-*` 行長上限。手機維持流式左對齊。
  〔實作〕`src/components/MaintenanceBanner.tsx` 與其測試。
- **即時取景頁（相機）的結果不與取景框搶垂直高度**，改疊在取景框上。
  取景框只給 `w-full` 時，高度＝螢幕寬 × 相機串流原生比例（手機直向多半
  3:4 或 9:16，390px 寬即 520～693px 高），結果必然被擠出第一屏——而看結果
  正是這種頁面存在的理由。作法：取景框固定比例＋`max-h-[*dvh]`＋
  `object-cover`，結果與後續動作鈕用 `absolute inset-x-0 bottom-0` 疊上去。
  遮住取景框下半部是可接受的：出結果時解碼本來就該是暫停的，那一刻不需要
  看見取景框。面板釘在**取景框內**而非視窗底部——手機底部已被 `BottomNav`
  佔用（`App.tsx` 的 `main` 有 `pb-24`）。
  兩個容易踩的細節：`dvh` 而非 `vh`（同 §附錄的網址列收合問題）；面板所在的
  容器**不要** `overflow-hidden`，視窗極矮時寧可讓它溢出多捲一點，也不要
  被裁掉——看不到結果就是原本要修的症狀。
  〔實作〕`src/components/referral/MemberVerifyScanner.tsx` 與其測試（掃描開放給
  會籍有效的會員後，它從 admin 區搬到 `referral/`，成為「我的 QR」頁的一個分頁）。

**推論**：mobile-first 不等於「桌機不必驗收」。上面這條的失效模式正是
「手機對、桌機錯」；滿版元素（橫幅、sticky bar、footer 條）新增時，
寬版要當成獨立的驗收情境看過一次。

## 8. 可測試性（Design for Testing）

互動元件一律採「能產生 role」的語意化寫法，與 Playwright（pytest-bdd）的
`get_by_role` 慣例一致：

- 導覽 → `role=navigation` + `NavLink` 的 `aria-current`
- 搜尋框 → `type="search"`（`role=searchbox`）
- 切換鈕 → `role=button`，`name` 隨狀態切換（如「顯示/隱藏密碼」）

只有在 text/role 真的有歧義或依狀態變動時，才在來源元件加 `data-testid`。

## 9. a11y

本 repo 有既有 a11y 債（biome 的 `noSvgWithoutTitle` / `useSemanticElements`
等規則降為 warn，見 [`plans/friction-log.md`](plans/friction-log.md)）。
**不要再添新債**：新互動元件的語意與鍵盤可達性要一起想；碰到的檔案順手
還債（童子軍原則）。
- **色彩對比度／色盲驗證** → 見 §12（WCAG 1.4.1/1.4.3/1.4.11 與深色/色盲
  驗證 checklist）。

## 10. 溢字/溢版

全站文案是中文，所有溢出行為都建立在中文字寬上。
`e2e/test_overflow_sweep.py` 在 **375px** 下巡檢各路由，目前為 **report-only**
（結果寫進 `test-results/overflow-report.{md,json}`）。新增路由時記得加進
該檔的 `ROUTES`；**tab 介面要另外帶 `after_load`**——Radix Tabs 只掛載 active
面板，不切過去的 tab 從來沒被畫出來過，量不到不等於沒問題。

**表格裡的長內容**：`TableCell` 基底帶 `whitespace-nowrap`
（`ui/table.tsx`）。長度無上限的欄位（jsonb 原文、使用者貼上的網址、
後端寫入的訊息）必須把**換行、限寬、`block` 三者放在同一個內層元素上**：

```tsx
<TableCell>
  <code className="block max-w-xs whitespace-normal break-all">{…}</code>
</TableCell>
```

三者缺一都會靜默失效，而且失效方式不是「沒生效」而是「畫到隔壁欄位上」：

- `white-space: nowrap` 會取消所有換行機會，**`break-all` 在它之下完全無效**
  ——不是優先序問題。內層自己宣告 `whitespace-normal` 即可（`white-space`
  是繼承屬性，顯式宣告就勝出，不必和 td 比 specificity）
- `max-width` 加在 `<td>` 上，auto table layout 只當提示
  （CSS 2.1 §17.5.2 明訂 table cell 的 min/max-width 效果 undefined），
  既不約束也不裁切
- `max-width` 對 inline 元素無效，`<code>`/`<span>` 要補 `block`

反向：識別字與時間戳（`2026/07/25 09:56:03`）維持 nowrap，折行更難讀。

## 11. 動作位階：先分類，再談位置

列表每一列的動作**不是平權的**。把它們排成一排等寬按鈕，等於宣告它們同等
重要——而實際使用頻率往往差好幾個數量級。

### 11.1 先問這個動作在改什麼

**分類看的是動作的對象，不是它的頻率或危險程度：**

| 動作在改什麼 | 放哪 |
|---|---|
| **一筆資料**（一筆提領、一則公告、一張證件） | 可以留在列上——該看的欄位整列都在，看不看詳情不影響判斷品質 |
| **一個人的狀態**（停權、授予後台權限、刪除帳號） | **一律移進詳情面板**——這是對人做的判斷，做之前本來就該先看清楚他是誰 |

「必須先開詳情」不是人工加的關卡，是流程本身。

**同一類的動作必須用同一套邏輯與設計**——同一個位置、同一種確認框、同一處
錯誤顯示。反例就在本專案：`MemberManagement` 曾經把停權留在列上、管理員切換
放進面板，兩套流程並存。當時的理由是停權有時效性（援引
`WithdrawalManagement.tsx:167-169`「退件與代為完成不鎖——那是客服接到電話當下
就該能處理的事」），**但那個先例不轉移**：提領台改的是一筆交易，會員管理改的
是一個人。分類不同，先例就不適用。

實作上這條要落到**程式結構**，不只是視覺：同類動作共用一個 action type、
一個確認框、一個執行器（見 `MemberManagement.tsx` 的 `MemberAction`）。兩份
分開的實作各自演化的那天，就會有一個忘了把後果講清楚。

### 11.2 剩下的動作看視覺權重

**視覺權重要跟著使用頻率走，不是跟著危險程度走。** 反例：`MemberManagement`
改版前每天要按的「查看」是最輕的 `ghost`，偶爾才用的「暫停」卻是滿版紅底
`destructive`，在掃描時最搶眼——權重和頻率完全相反。危險動作用**紅字**
（`text-destructive`）就足以讀出危險，真正的防線是確認框，不是把它做成
視線磁鐵。

**溢出選單（`⋯`）要放得下兩個以上的項目才值得。** 只裝一項的選單是把一次
點擊變兩次而沒換到任何東西。

### 11.3 確認框

**逐方向看破壞力，不是逐動作。** 一個切換鍵的兩個方向代價常常不對稱，判準
要落在方向上：

| 方向 | 確認框 | 為什麼 |
|---|---|---|
| 暫停 | 要 | 立刻凍結對方的刊登可見性與提領 |
| 恢復 | **不要** | 破壞力 ~0，把凍結的東西還回去 |
| 授予管理員 | 要 | 見下：資料層不可逆 |
| 撤銷管理員 | 要 | 對方瞬間失去全部管理能力——還原方向不等於無害 |

可逆又無傷的動作也收確認框，只會把確認框訓練成無腦點掉的一步，真正危險的
那次就攔不住了。

**文案一律說出後果，不是「確定嗎」**——要判斷的是這件事會對那個人造成什麼，
不是重複一次自己剛按了什麼。

**可逆性要看資料層，不只看權限層。** 授予管理員在權限層可逆（隨時撤回），
在資料層不可逆（他已經讀過全站身分證與收款帳號）——判斷時取兩者中較嚴的那個。

〔實作〕`src/components/admin/MemberManagement.tsx` 與其測試。

---

## 12. 色彩與設計語言

> 本節是 design-language-foundation（S1）的交付物：token 定義在
> `src/styles/globals.css`，用法由 `scripts/check-color-usage.py` 機械把關
> （`npm run check` 之外，framework-check 軌每次 CI 都會跑）。**S1 本身
> 不改任何元件、畫面零變化**——這節寫的是 S2（實際把手刻色收斂進 token）
> 動工時要照哪份規範，以及守門腳本怎麼讀、怎麼用。

### 12.1 基底不變

`--primary: #030213` 與 logo 相符，保留；根字級/觸控目標/表單規範（§1）
不動。這節談的是**彩色語義色**的收斂，不是重新設計。

### 12.2 層次靠灰階不靠顏色

字重、字級、`--muted-foreground`、留白——這是 logo 的語言。灰階本身也在
`check-color-usage.py` 的 C1 掃描範圍內（Tailwind 官方 22 色全表含
slate/gray/zinc/neutral/stone 五個灰階家族，不挑選）。但灰階**不是**發新
token，是**對照到既有 token**，而且不是 1:1 替換：

| 現況 class | 對照 token | 色差（目視） | 不確定時怎麼辦 |
|---|---|---|---|
| `gray-50` | `--background`（`#ffffff`）或 `--muted`（`#ececf0`） | `gray-50`（`#f9fafb`）介於兩者之間 | S2 逐案判斷：大面積底色用 `--background`，卡片內分隔區塊用 `--muted` |
| `gray-100` | `--muted`（`#ececf0`） | 接近，`gray-100`（`#f3f4f6`）略淺 | 可視為等效替換 |
| `gray-200` | `--muted` 或 `--border`（`rgba(0,0,0,0.1)`） | `gray-200`（`#e5e7eb`）界於兩者之間 | 依用途（底色 vs 邊框）擇一 |
| `gray-300` | `--border` | `gray-300`（`#d1d5db`）比現行 `--border` 實色明顯深 | S2 逐案目視，色差過大時提報新增灰階 token |
| `gray-400` | `--muted-foreground`（`#717182`），偏淺一階 | `gray-400`（`#9ca3af`）較淺 | 多用於次要圖示/停用態，S2 逐案判斷 |
| `gray-500` | `--muted-foreground` | 非常接近 | 可視為等效替換 |
| `gray-600` | `--muted-foreground`，偏深一階 | `gray-600`（`#4b5563`）較深 | S2 逐案目視 |
| `gray-700` | `--foreground`，偏淺一階 | `gray-700`（`#374151`）明顯比 `--foreground`（近黑）淺 | S2 逐案目視，色差過大時提報新增灰階 token（例如 `--foreground-muted`） |
| `gray-800` | `--foreground` | 接近但仍偏淺 | 多用於次要標題文字，S2 逐案判斷 |
| `gray-900` | `--foreground` | 非常接近 | 可視為等效替換 |

最後一欄是重點：色差明顯時**不強迫替換**——S2 逐案目視，必要時提報新增
灰階 token，不留各自詮釋空間，也不假裝「反正都是灰的」。

### 12.3 語義色是唯一的彩色

三類語義各有 token，每一類最多三種形狀（A 實心底、B 淺底提示框、C 裸字）：

| # | 形狀 | token | 對比門檻 |
|---|---|---|---|
| A | 實心底 | `--success` / `--warning` / `--destructive` | — |
| A | 實心底上的字 | `--success-foreground` / `--warning-foreground` / `--destructive-foreground` | 對 A **4.5:1** |
| B | 淺底提示框 | `--success-subtle` / `--warning-subtle` / `--destructive-subtle` | — |
| B | 淺底上的字/圖示 | `--success-subtle-foreground` / `--warning-subtle-foreground` / `--destructive-subtle-foreground` | 對 B **4.5:1** |
| B | 淺底的框 | `--success-border` / `--warning-border` / `--destructive-border` | 對 B **3:1** |
| C | 裸字/裸圖示（無 bg 包裹） | 重用 B 的 `*-subtle-foreground`——本來就是為「淺底上的文字」設計、對比已驗證 | 對 `--background` **與** `--card` 各 **4.5:1** |

對照：成功 → `--success`；警示 → `--warning`；危險 → `--destructive`；
**資訊/進行中 → 灰階或 `--primary`，不再用藍**（見 12.7 色盲防線）。

**B 形狀不手刻三件組，走元件**（S2 收斂時建立，之後新寫的一律照用）：
整塊提示框用 `StatusCallout`（`src/components/ui/status-callout.tsx`，
`variant` = `success`/`warning`/`destructive`/`neutral`；原本是真標題的
傳 `titleAs`，互動元素放 `action` slot）；狀態 pill 用 `Badge` 的
`success`/`warning`（A 形狀）與 `success-subtle`/`warning-subtle`/
`destructive-subtle`（B 形狀）variant。手刻 `bg-*-subtle border-*-border
text-*-subtle-foreground` 三件組守門腳本抓不到（都是 token class），
只能靠這條規則與 code review。

### 12.4 漸層退場

三類判準，不靠語感：

- **功能性遮罩**（讓疊在上面的字看得見）→ **可留**。例：照片上的文字遮罩。
- **裝飾性漸層** → 退場，改單色或灰階。
- **狀態驅動的連續漸層**（依進度/百分比切換）→ 退場，改為**離散的語義
  token 分段對應**（例：依同一組門檻對應到 `--success` / `--warning` / 灰階，
  不再連續漸變）。

**可操作的檢驗步驟**：把漸層換成等亮度純色，疊在上面的文字對比度是否仍達
4.5:1？**仍達標 = 裝飾，可退場；不達標 = 功能性，保留。**

### 12.5 統計數字去色 + 非狀態判準

只有明確落在語義色三類的**狀態呈現**才上色，其餘四類歸「非狀態 → 純黑/灰」：

- **(a) 計數與量值**：總會員數、管理員人數、累積獎勵金額。
- **(b) 身分／分類標記**：性別、方案別、角色。
- **(c) 多值分類色**（結構屬性，不是狀態）：例如推薦樹的世代色（一代/二代/
  三代）→ 去色走灰階三階，**不走 `--chart-*`**（`--chart-*` 用途是「同一
  量綱的多個資料序列」，是圖表工項，世代是結構屬性；辨識負擔已由文字標籤
  承擔，不需要色相再承擔一次）。⚠️ **碰撞防呆**：若同一畫面已有「已失效」
  類的專屬灰（例：狀態點用 `gray-400` 表示已失效），多階去色的世代灰**必須
  與那個既有的狀態灰保持可辨識的亮度差距**，否則會被稀釋成分不出語意的
  一片灰。
- **(d) 純裝飾**：icon 底色、卡片點綴。

S2 全站收斂時規則字面沒說死、逐案裁決過的情境，沉澱成判準（之後遇到
同型情境直接套，不重新裁決）：

- **金額正負保留語義**：收入 `--success`、支出 `--destructive`（裸字走
  `*-subtle-foreground`），不受 (a)「計數與量值去色」約束——正負是狀態，
  不是量值。
- **CTA／連結可用 `--primary`**：資訊/進行中類去色走灰階之後，需要視覺
  焦點的動作入口用 `--primary`（近黑），不另找強調色；跨檔案的紫色/藍色
  強調一律收斂到這裡。
- **第四種狀態沒有第四種顏色**：語義色只有三類，多出來的狀態（例：掃碼
  驗證的「錯誤但可重試」）併入最接近的一類（通常是 `warning`），靠文案
  區隔，不引入新色相。
- **`destructive` 留給破壞性動作與失敗**：正常流程裡「不可逆」的提醒
  （例：領獎前的確認事項）走 `warning`，不用紅——紅在這裡會稀釋掉真正
  失敗態的訊號。
- **進度/度量類去色**：進度條、統計卡走 `--foreground`/`--muted-foreground`；
  只有「達標／將達標」這種狀態分段才對應到 `--success`/`--warning`
  （見 12.4 離散分段）。
- **品牌 icon 色是唯一的色相例外**（FB/IG/LINE 這類第三方品牌色），
  留在 baseline 並附行內註解說明；除此之外沒有「品牌色」——本平台的
  品牌語言就是黑白灰。

### 12.6 深色模式

每個新語義 token 都有 `.dark` 版（三處齊備：`:root`、`.dark`、
`@theme inline`），對比度門檻由自動測試驗證（`src/styles/globals.test.ts`）。
devtools checklist 見 12.8。

### 12.7 對比門檻分兩種 + 色盲防線

**文字**走 WCAG 1.4.3，門檻 **4.5:1**；**邊框、圖示等非文字元素**走
WCAG 1.4.11，門檻 **3:1**——不是一律套 4.5:1，border 只驗過存在、沒排進
對比矩陣等於沒驗。

**WCAG 1.4.1（Use of Color）**：狀態不可只靠色相傳遞，必須同時有文字或
圖示搭配。這是藍色退場後的安全網——拿掉藍之後只剩紅/綠/黃橙，而紅綠正是
紅綠色盲（約占男性 8%）最難區分的組合。

### 12.8 深色模式與色盲驗證 checklist（常設規範）

現況 `.dark` 從未被實際套用（無切換入口、無任何 import），深色 token 沒有
執行期驗證管道，機械層只能驗對比度數字（12.6），**語意層（這個 badge 是否
只靠顏色傳遞語意）抓不到**——`check-color-usage.py` 的 C1–C3 是語法層規則，
判斷不了這件事，這是技術限制，不是規劃疏漏。所以還有一層人工 checklist：

1. **深色**：devtools 的 Elements 面板給 `<html>` 加 `class="dark"`，逐頁
   目視。頁面清單：首頁、服務詳情、會員中心、獎勵、後台四分頁。看什麼：
   卡片與背景是否有層次、提示框的字是否讀得到、badge 是否還分得出語義。
2. **色盲**：devtools 的 Rendering → Emulate vision deficiencies，逐一套用
   protanopia / deuteranopia / tritanopia，走同一份頁面清單。驗收標準不是
   「顏色還分得出來」——那不可能——而是**「即使完全分不出顏色，狀態仍然
   讀得懂」**（靠文字標籤與圖示）。
3. **對比**：抽查幾處實際渲染色，確認與測試算出的值一致（防止 token 被
   某處 `opacity` 或疊層稀釋）。

**這份 checklist 是常設規範，不是一次性驗收工具**：任何新增或修改狀態
視覺呈現時都要跑，不是只在某次收斂完就結束——WCAG 1.4.1 這條防線抓不到
機械把關，只能靠人記得，所以規則本身必須不會過期。

**窄版（375px，比照 §10 既有慣例）下重複跑第 1、2 步**——本專案使用者
幾乎都在手機（§前言），桌面寬版看得懂的狀態，換行或被截斷後不一定看得懂：
狀態文字/圖示是這條防線唯一的依靠（WCAG 1.4.1），窄版下擠壓、換行、截斷
都可能讓這個依靠本身失效，只在桌面 devtools 檢查抓不到這類交互。

### 12.9 守門腳本怎麼用

`python3 scripts/check-color-usage.py` 掃 `src/**/*.ts(x)`（含 `.test.*`，
色不只住在 JSX 裡；唯一例外是腳本內 `EXCLUDED_PATHS` 列出、附了理由的檔——
目前只有對比度公式的錨定測試，那裡的 hex 是 WCAG 參考值不是手刻色）三條規則：

- **C1** 具名 Tailwind 調色盤 class（`text-blue-600` 這類，含 `hover:`/
  `dark:`/`md:` 等變體前綴）。
- **C2** 裝飾性漸層（`bg-gradient-to-*` / `bg-linear-to-*`）。
- **C3** 原始色值：(a) JS/TS 字串裡的 hex 字面值（含 3 位簡寫如 `'#000'`）；
  (b) Tailwind 任意值色彩語法（`bg-[#16a34a]`）。

棘輪 baseline 在 `scripts/color-usage-baseline.json`，`{相對路徑: {c1, c2,
c3}}`，依規則類型分列（同一檔案 C1 減一、C2 加一，淨數不變也會各自被抓到）。
四條判定：不在 baseline 的檔出現命中 → 紅（新債）；命中數比 baseline
多 → 紅；**命中數比 baseline 少也紅**（棘輪只准收緊，訊息會印出可貼上的
JSON 行）；baseline 有紀錄但檔案已不存在 → 紅（孤兒條目，多半是刪除或
rename 後 baseline 沒跟著更新——**rename 時舊 key 要一併改名**）。

**刻意不提供 `--update-baseline` 旗標，也不提供行內豁免標記**——自動更新
是棘輪腐爛的標準路徑，豁免會變成壓力下最方便的逃逸路徑。真的出現例外
（品牌色、第三方 embed）再加標記，比照 `docs/plans/` 的 `plans-keep`
慣例：機器可讀、寫得出退場條件。

**兩個已知的掃描盲點**（技術限制，非規劃疏漏，目前 repo 現況都不會踩到）：

- **C3(a) 的 href 誤報防呆是固定 20 字元視窗**：多行 JSX（`href={` 換行
  後才接縮排與字串字面值）超過視窗長度時防呆會失效，該字串會被誤判為
  色彩債，因為沒有行內豁免，唯一逃生口是塞進 baseline——遇到請先確認
  是否真為色彩用途，不要照樣收進去。
- **動態拼接色相的 class 字面上抓不到**（例如 `` `bg-${hue}-600` ``）：
  C1/C3 都是靜態正則掃描，不會執行程式碼，這類寫法完全不受任何一條規則
  保護，不要用模板字串插值拼出色相/階數。

### 12.10 灰階對照表完整性（機械把關）

12.2 的灰階對照表必須涵蓋 `check-color-usage.py` 掃到的**每一個**灰階
class（`gray-N` / `slate-N` / `zinc-N` / `neutral-N` / `stone-N`）——
缺一列，`check-color-usage.py` 就紅。這是 C1–C3 之外的第二類檢查（驗
文件與程式碼一致，不進 baseline），存在理由：「對照表涵蓋掃到的 class」
是可數、可枚舉的宣稱，沒有測試落點的宣稱等於沒驗過。

---

## 附錄：本準則的來源

各條規則來自一次全面的 UI/UX 盤點（PR #30），當時修掉的問題：

| 嚴重度 | 問題 |
|---|---|
| 🔴 基礎 | 無 Tailwind 建置，跑靜態編譯 CSS，新 class 靜默失效 |
| 🔴 高 | 根字級 14px 使全站 rem 尺寸縮小 12.5% |
| 🔴 高 | 表單輸入 <16px，iOS 聚焦自動縮放 |
| 🔴 高 | 觸控目標過小（按鈕/輸入 ~32–36px） |
| 🔴 高 | 手機無底部導覽；訪客導覽死角 |
| 🔴 高 | 首頁手機卡片資訊過少（僅照片+名字） |
| 🟡 中 | 無關鍵字搜尋 |
| 🟡 中 | 距離排序用寫死台北座標，誤導 |
| 🟡 中 | 深色模式卡片與背景同色、無層次 |
| 🟡 中 | 密碼欄無顯示切換、缺 autocomplete |
| 🟡 中 | 列表載入用單一 spinner，無骨架屏 |
| 🟢 低 | 桌面卡片描述硬截斷 20 字；Navbar 非 sticky |

全數已修。保留此表是為了說明「為什麼這些準則長這樣」——每一條都對應一次
實際踩過的坑，不是憑空的風格偏好。
