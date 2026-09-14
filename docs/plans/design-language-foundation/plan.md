# 設計語言地基（D1 色彩系統重建 + D2 色彩守門腳本）規劃書

> 上游：`docs/plans/platform-uiux-redesign/`（`plan.md` 工項定義、
> `construction-plan.md` 工序、`progress.md` 看板）。本檔是該工程 **S1** 的規劃書。
> 施工鷹架，S1 收尾（`/tdd-implement` 最後一步）刪除；值得保存的規則
> 已**寫在** `docs/ui-ux-guidelines.md` 新章節裡，不靠本檔存活。
>
> **修訂 2**（2026-09-14）：四視角審查（`./review.md`，P0×0 / P1×9 / P2×10）
> 全數回填，業主四項裁決已併入。修訂點在各節以「〔審查回填 P?-?〕」標記。

## 0. 一句話

這個 feature 讓**後續每個施工 session** 能照一份「有機器把關」的色彩規範改色，
因為上游 §2.4 的診斷是「方向本來就對（`--primary: #030213` 與 logo 相符），
但沒人守門」——沒有 token 與守門腳本，D3（S2）收斂完必然再漂。

## 1. 使用者需求

### 1.1 溯源

本工程不改任何業務規則（上游 plan.md §2.6），規格書 §7–§10 無對應章節。
需求的溯源對象是 **上游 `plan.md` §4（設計語言規範方向，六點）與 §3 的 D1/D2 定義**。

〔審查回填 P2-8〕**對上游字面的一處刻意偏離**：上游 D2 的定義字面是
「對 Tailwind 調色盤 class 建立**白名單機制**」，本規劃改為
「**棘輪 baseline ＋ 不設行內豁免**」。理由見 §2.4；記在這裡是為了讓日後拿
上游字面對照的人知道這是刻意決定，不是漏項。

### 1.2 四種使用者（persona 羅盤，上游 §1）

D1/D2 對 P1–P4 全是**間接**服務：S1 交付完，畫面一個像素都不會變。
直接使用者是**開發者與後續施工 session**——這是刻意的分界，見 §3.2。

| persona | 本階段怎麼服務他 |
|---|---|
| P1 訪客 / P2 刊登 / P3 推薦 / P4 管理者 | 間接：S2 起的每一次改色都有依據可對、有閘門擋回歸 |
| 開發者 / 後續 session | 直接：規範（讀什麼）＋ token（寫什麼）＋ 閘門（錯了會紅） |

### 1.3 驗收情境（可驗證的行為）

1. 開發者在任一 `src/**` 檔新寫下 `text-blue-600`，`bash scripts/framework-check.sh`
   紅，訊息指出檔名行號與「改用哪個 token」。
2. 〔審查回填 P1-1〕同樣地寫下 `bg-[#16a34a]`（任意值語法）或在 `.ts` 裡寫
   `const c = '#16a34a'` 也紅——**色值的表達形式換一種就繞過閘門，等於沒有閘門**。
3. 現況手刻色全數在 baseline 內，framework-check 綠——S1 不做任何收斂（那是 S2/D3）。
4. 任一檔的手刻色數量比 baseline 多 1 處 → 紅；少 1 處 → 也紅（要求收緊 baseline）。
5. `python3 scripts/check-color-usage.py --self-test` 通過表格案例
   （比照既有 checker 的雙軌慣例：先驗檢查器自己，再掃 repo）。
6. `docs/ui-ux-guidelines.md` 新章節能逐條回答 S2 會遇到的判準問題：
   狀態 vs 非狀態、**灰階收斂到哪個 token**、漸層怎麼辦、統計數字上不上色、
   身分標記（性別）算不算語義、**世代色這種多值分類色**怎麼辦。
7. 深色模式：每個新語義 token 都有 `.dark` 版，**且對比度由自動測試驗證**
   （文字 4.5:1、邊框等非文字元素 3:1）；devtools 目視 checklist
   （含**色盲模擬**）落在新章節裡。

### 1.4 不做什麼（scope out）

- **不改任何元件**、不替換任何一處現有手刻色——那是 S2（D3）整包的工作。
- 不新增 `StatusCallout` 元件、不擴充 `ui/badge.tsx` variant——上游 §3 明列在 D3。
- 不做深色模式切換入口（上游 §5 已 scope out，另案）。
- 不動 `--primary` / 根字級 / 觸控目標 / 表單規範（上游 §4 第 1 點：基底不變）。
- 不動 `supabase/functions/`、不改 API 契約、不改業務規則。
- 不動 `--chart-*`（圖表色階與語義色是兩件事，本工程沒有圖表工項）。
  〔審查回填 P1-5〕**但這條的邊界要講清楚**：`--chart-*` 的用途是「同一量綱的
  多個資料序列」，不是「任何需要多個顏色的地方」——世代色的裁決見 §4.2 第 5 點。

## 2. 系統設計

本階段沒有 API/DB/資料流。這節講兩件事的設計：**token 的分層**與**守門腳本的判定流**。

### 2.1 Token 分層：由現況用法反推，不憑空發明

掃描實證顯示彩色語義色只有三種形狀，每一種都要有 token，少一個 S2 就會再手刻：

| # | 形狀 | token | 收斂現況 | 對比門檻 |
|---|---|---|---|---|
| A | 實心底 | `--success` | `bg-green-600`（41 處） | — |
| A | 實心底上的字 | `--success-foreground` | `text-white` | 對 A **4.5:1** |
| B | 淺底提示框 | `--success-subtle` | `bg-green-50`（19 處） | — |
| B | 淺底上的字/圖示 | `--success-subtle-foreground` | `text-green-800`（16 處） | 對 B **4.5:1** |
| B | 淺底的框 | `--success-border` | `border-green-200`（13 處） | 對 B **3:1** |
| C | **裸字/裸圖示**（無 bg 包裹） | 用 `--success-subtle-foreground` | `text-red-600` 等 | 對 `--background` **與** `--card` 各 **4.5:1** |

`--warning` 同構（收斂 yellow/orange/amber）。
**`--destructive` 補齊 B、C 兩組**（業主裁決 Q1）——現況紅色淺底提示框 49 處
（`red-50` 18、`red-200` 14、`red-800` 17），不補 S2 就無 token 可用。
`--info` **不發**（上游 §4 第 3 點，業主裁決 Q4）：資訊/進行中走灰階或 `--primary`。

〔審查回填 P1-3〕**形狀 C 是本次新增的**。原規劃只想到 A、B 兩組配對，
但現況大量存在「文字直接疊在頁面或卡片底色上」（`TaskDashboard.tsx:103`、
`ThreeStepDialog.tsx:308,333`、`MemberVerifyQrTab.tsx:46`）。
裁決：**裸字走 `-subtle-foreground`**，理由是它本來就是為「淺底上的文字」設計、
對比度已驗證；而 `--success`（實心底用的飽和色）對白底的對比不保證達標。
代價是多一組對比度斷言（對 `--background` 與 `--card` 兩個底色各驗一次）。

〔審查回填 P1-2〕**門檻分兩種，不是一律 4.5:1**：
文字走 WCAG 1.4.3（4.5:1），**邊框/圖示等非文字元素走 WCAG 1.4.11（3:1）**。
原規劃把 border token 一律套 4.5:1，實際上 border 根本沒被排進驗證矩陣——
一個「宣稱驗過但沒驗到」的閘門比沒有閘門更糟。

〔審查回填 P1-6〕**灰階也要有對照表**（業主裁決）。§7 說「C1 用 Tailwind 官方
22 色全表、不挑選」，而 22 色含灰階家族——實測 **39 處 / 15 個檔案**
（`PaymentResult.tsx` 17 處最多）會落入掃描並算進 baseline。
但灰階不是發新 token，是**對照到既有 token**，且**不是 1:1 替換**：
`--muted-foreground: #717182` 未必與各處 `gray-400` / `gray-500` 視覺吻合。
交付物是一張表（S1 階段 5 產出，不在此處填內容），欄位固定為：

| 現況 class | 對照 token | 色差（ΔE 或目視） | 不確定時怎麼辦 |
|---|---|---|---|

最後一欄是重點：色差明顯時**不強迫替換**，在表裡標「S2 逐案目視，
必要時提報新增灰階 token」——留退路，不留詮釋空間。

### 2.2 三處同步，漏一處或指錯一處都會靜默失效

Tailwind v4 的 `bg-success` **只有在 `@theme inline` 有 `--color-success` 時才存在**；
沒有的話那個 class 不會報錯，只是不產生任何 CSS。
`ui-ux-guidelines.md` §2 已經記過這個坑（Figma 靜態編譯 CSS 年代，OTP 樣式靜默失效）。

〔審查回填 P1-7〕所以階段 1 的測試要驗**兩件事**，不是一件：

1. token 在 `:root`、`.dark`、`@theme inline` **三處齊備**（漏一處 → 紅）
2. `@theme inline` 每一行的**值字面**等於預期的 `var(--token名)`（指錯 → 紅）

只驗 (1) 的話，複製貼上打錯一個字
（`--color-success-subtle: var(--success);` 漏改成兩個 mapping 互指）
完全抓不到——而那正是本節自己點名的「靜默失效」同一類問題。

### 2.3 色彩表示法用 hex，不用 oklch

同檔既有 token 本來就是混用（`--primary: #030213`、`--destructive: #d4183d` 是 hex，
灰階是 oklch）。新語義色選 hex，理由不是偏好而是**閘門要算得出對比度**：
hex → sRGB → 相對亮度是十行純函式；oklch → sRGB 要寫整套色彩空間轉換，
那條路上的 bug 會讓閘門**說謊**（宣稱過了但實際對比不足），比沒有閘門更糟。

〔審查回填 P1-8〕**既有 `.dark { --destructive: oklch(0.396 0.141 25.723) }`
（`globals.css:64`）一併改成等價 hex**（業主裁決 Q1）。
不改的話，Q1 採納後 destructive 全家族進對比度測試會立刻撞上 §7 自陳的
「讀不到可解析色值就直接紅，不靜默跳過」，階段 2 一開局就卡。
執行要求：**轉換用工具產出**（devtools 取色或 `color()` 計算），
**原 oklch 值保留在同行註解**供回溯，並在 commit message 記下轉換前後值。
這是 S1 唯一一處「改既有 token」而非純新增——但它是**表示法的改變、不是值的改變**，
且 `.dark` 目前沒有任何執行路徑（見 §3.2），所以「畫面零變化」的性質仍然成立。

### 2.4 守門腳本的判定流

形狀比照 `scripts/check-ime-safe-inputs.py`：決策邏輯放純函式、表格案例驗行為、
零第三方依賴（framework-check 的契約是免依賴安裝）。

**掃描對象**：`src/**/*.ts` 與 `src/**/*.tsx`，**含 `.test.*`**（業主裁決 Q3）。
理由：`src/utils/gender.test.ts:20` 直接斷言 `'border-blue-500 text-blue-600'`，
`src/utils/userReferralFormatter.ts:60-86` 是回傳 class string 的純函式——
色不只住在 JSX 裡。漏掃測試檔等於留一條後門。

**規則**

- **C1 具名調色盤 class**：`(text|bg|border|from|via|to|ring|fill|stroke|divide|shadow|outline|decoration|accent|caret)-<22 個 Tailwind 色相>-<階>`，
  變體前綴（`hover:` `dark:` `md:` `focus-visible:`）一律照抓——
  現況 `dark:` 變體有 **19 處**〔審查回填 P2-10，原寫 18〕，不抓就是留白名單。
- **C2 裝飾性漸層**：`bg-gradient-to-*` / `bg-linear-to-*`。
  現況 **13 處 / 6 個檔案**〔審查回填 P2-1，原寫 9 處 / 5 檔——漏掉的 4 處在
  `src/utils/userReferralFormatter.ts` 的 `getProgressBarStyle()`，
  諷刺的是那正是本節上一段引用來說明「色不只住在 JSX 裡」的同一個檔案〕。
- **C3 原始色值**〔審查回填 P1-1，本次新增〕：
  (a) JS/TS 內的 hex 字面值（`'#16a34a'`）——現況 **14 處 / 5 個檔案**
  （`ReferralTreeView.tsx` 的 `GEN_AVATAR`、`inviteCardImage.ts` 的 canvas `fillStyle`、
  `SignaturePad.tsx`、`InviteFriendPanelContent.tsx`、`MemberVerifyQrTab.tsx`）；
  (b) Tailwind 任意值色彩語法（`bg-[#16a34a]`、`text-[rgb(...)]`）——現況 0 處。
  **(b) 現況是零，正是它必須被守的理由**：規劃刻意不給行內豁免、baseline 也不收新項，
  任意值語法就會成為壓力下最方便、且完全不被監視的逃逸路徑。
  D2 存在的理由是守住未來，不是描述現在。

**棘輪 baseline**：`scripts/color-usage-baseline.json`。

〔審查回填 P2-7〕**依規則類型分列**：`{相對路徑: {c1: n, c2: m, c3: k}}`，
不是單一純量。合併計數會讓「同檔拿掉一個 C1、換成一個 C2」淨數不變而靜默通過
（例：`bg-blue-600` 改成 `bg-gradient-to-r from-blue-500 to-purple-500`）。

〔審查回填 P2-6〕**選址**：放 `scripts/` 與 checker 同層。這是本 repo checker
家族第一個外部資料檔（其餘九支的判準常數全部內嵌），所以要交代理由——
baseline 是**逐 commit 變動的狀態**，不是判準；判準內嵌在腳本裡（C1/C2/C3 的
規則與表格案例），會變的那部分才外掛，兩者分開才不會每次收緊 baseline 都在改
判定邏輯所在的檔案。

**判定**（四條，第四條是審查新增）：

| 情況 | 判定 | 為什麼 |
|---|---|---|
| 不在 baseline 的檔出現命中 | 🔴 | 新債 |
| 某規則的命中數 > baseline | 🔴 | 舊檔變更糟 |
| 某規則的命中數 < baseline | 🔴（訊息印出可貼上的 JSON） | 棘輪的牙齒（業主裁決 Q2） |
| 〔P2-2〕baseline 有 key 但檔案不存在 | 🔴（孤兒條目） | 檔案刪除後條目殘留；日後新檔重用同一路徑會被誤判為「已在 baseline 內」而放行 |

第三條是刻意的：本 repo 對棘輪已有明文立場——「棘輪的價值全在貼著實測值，
落後的棘輪等於沒有」（`vitest.config.ts:63`）、「這是棘輪不是目標：擋住無聲長大」
（`check-bundle-budget.mjs:5`）。失敗訊息直接印出可貼上的 JSON 行，
把收緊的成本壓到一次貼上。

〔審查回填 P2-3〕**檔案 rename 會全紅**（舊 key 失聯、新路徑視為新檔）。
這是刻意的嚴格（逼 rename 與 baseline 更新同一個 PR），不是 bug——
但要寫進 §12 的「怎麼用」，否則第一次撞到的 session 會去 debug 半天。

**刻意不提供 `--update-baseline` 旗標**：自動更新是棘輪腐爛的標準路徑
（跑一下就綠，沒有人再看那個數字）。

**刻意不提供行內豁免標記**：全 repo 無品牌色（無 LINE `#06C755`）、無第三方 embed。
C3 抓到的 14 處原始 hex 全部是自家調色（世代色、canvas 繪圖），都能 token 化或去色。
baseline 就是 S2 期間唯一的通道。真的出現例外再加（見 §7）。

### 2.5 接進 framework-check 軌

插在 `scripts/framework-check.sh` 第 12 項（IME）之後、第 13 項（harness-metrics）之前，
形狀與前面九支完全一致：先 `--self-test` 再掃 repo，兩段各自的 FAIL 訊息分開。
本軌無路徑過濾、秒級、免 secrets——`src/**` 的檢查放這裡是對的
（`check-ime-safe-inputs.py` 已立此先例）。

## 3. 架構影響

### 3.1 動到的檔案

| 檔案 | 動作 |
|---|---|
| `src/styles/globals.css` | 加 token（三處）；改 `.dark --destructive` 表示法為 hex |
| `src/styles/globals.test.ts` | **新增**（vitest node，解析 CSS 文字 + 對比度純函式） |
| `docs/ui-ux-guidelines.md` | 新增 §12（含灰階對照表） |
| `scripts/check-color-usage.py` | **新增** |
| `scripts/color-usage-baseline.json` | **新增**（由腳本掃出，不手寫） |
| `scripts/framework-check.sh` | 加一段 |
| `docs/plans/design-language-foundation/` | 本鷹架（S1 收尾刪） |

### 3.2 S1/S2 分界：S1 全綠但畫面零變化

沒有任何元件引用新 token，所以 S1 合併後 develop 環境**看起來完全一樣**。
唯一的非加法改動是 `.dark --destructive` 的表示法（§2.3），而 `.dark`
**目前沒有任何執行路徑**（無切換入口、無 import、`ui-ux-guidelines.md` §2 已載明），
所以零視覺變化的性質仍然成立。

這是設計而非疏漏——上游 construction-plan §4.3 的驗收站 1 排在 S2 之後，正是這個道理。
業主在 S1 合併後不需要（也看不出來要）驗收什麼。

### 3.3 其他

- 與 lazy 路由 / appShell / `multi-step-flow-recovery.md` 四契約**無關**。
- **效能**：globals.css 增約 45 行；Tailwind JIT 只為**實際用到**的 class 產出 utility，
  S1 沒有任何使用者 → bundle 幾乎不變（`check-bundle-budget.mjs` 應無感）。
- **vitest**：`src/styles/globals.test.ts` 落在既有 `include` 內，`environment: 'node'`
  對純文字解析與純函式足夠；`coverage.exclude` 已排除 `*.test.ts`，
  且 `globals.css` 不在 `coverage.include` 的 `.ts/.tsx` 範圍，不影響覆蓋率棘輪。
- **安全**：無。不碰權限、不碰 PII。
- **context 成本**：`ui-ux-guidelines.md` 現 ≈14.9KB，新章節約 +5KB（含灰階對照表），
  離 `check-context-budget.py` 的 20,000 token 單檔警戒線仍有餘裕。

## 4. UI/UX

**本階段不改任何畫面。** UI/UX 的交付物是**規範本身**——所以這節寫「規範長什麼樣」。

### 4.1 新章節的位置：追加為 §12，不插隊

新章節在內容上是 §2「樣式基礎」的展開，理應排在 §3。但 repo 內有
**約 34 處 `§n` 交叉引用散在 20 個檔案**（`CLAUDE.md`、四個 plan-reviewer agent、
`MemberManagement.tsx`、`WithdrawalManagement.tsx`、`usePagedList.ts`、多個測試檔…），
其中 `§11`（動作位階）就被引用 9 次。插隊要全部改，且**改漏不會紅**（沒有機械把關）。

→ **追加為 §12「色彩與設計語言」**，並在 §2 末尾加一行指路（`→ §12`）。
風險為零、成本為零。

### 4.2 章節內容

〔審查回填 P2-5〕**前六點逐條落地上游 §4 的六點；第 7、8 點是本規劃新增。**

1. **基底不變**：`--primary: #030213` 與 logo 相符，保留；根字級/觸控/表單規範不動。
2. **層次靠灰階不靠顏色**：字重、字級、`--muted-foreground`、留白——這是 logo 的語言。
   **附灰階對照表**（§2.1 的表格骨架），S2 收斂灰階時有表可查。
3. **語義色是唯一的彩色**，三類 + token 對照表（§2.1 那張表）：
   成功 → `--success`；警示 → `--warning`；危險 → `--destructive`；
   資訊/進行中 → **灰階或 `--primary`，不再用藍**。
4. **漸層退場**，分三類判準〔審查回填 P2-1、P2-4〕：
   - **功能性遮罩**（讓疊在上面的字看得見）→ **可留**。例：`MobilePhotoWallCard.tsx:35`
     照片上的文字遮罩。
   - **裝飾性漸層** → 退場，改單色或灰階。
   - **狀態驅動的連續漸層** → 退場，改為**離散的語義 token 分段對應**。
     例：`userReferralFormatter.ts` 的 `getProgressBarStyle()` 依進度百分比切換漸層，
     改成依同一組門檻對應到 `--success` / `--warning` / 灰階。
   **可操作的檢驗步驟**（不靠語感）：把漸層換成等亮度純色，
   疊在上面的文字對比度是否仍達 4.5:1？**仍達標 = 裝飾，可退場；不達標 = 功能性，保留。**
5. **統計數字去色 + 非狀態判準**（上游 §4 第 5 點指名這是「給 S2 機械替換的裁決依據，
   不留各自詮釋空間」）。四類明確歸「非狀態 → 純黑/灰」：
   - (a) **計數與量值**：總會員數、管理員人數、累積獎勵金額
   - (b) **身分／分類標記**：性別（現況 `gender.ts` 藍/粉）、方案別、角色
   - (c) **多值分類色**〔審查回填 P1-5，本次新增並裁決〕：
     `ReferralTreeView.tsx` 的世代色（一代綠/二代紫/三代橘，含 `GEN_BADGE`
     `GEN_LINE` `GEN_AVATAR` 三處）→ **歸此類，去色走灰階三階**。
     **不走 `--chart-*`**，理由：`--chart-*` 的用途是「同一量綱的多個資料序列」
     （圖表），世代是**結構屬性**；而且辨識負擔已經由既有的文字標籤
     （`GEN_LABEL` 的「一代/二代/三代」）承擔，不需要色相再承擔一次。
     *S2 驗收站 1 時業主可推翻此裁決——它是本規劃裡視覺影響僅次於藍色退場的一項。*
   - (d) **純裝飾**：icon 底色、卡片點綴
   只有明確落在三類語義的**狀態呈現**才上色。
6. **深色模式**：token 必成對；對比度門檻由測試驗；devtools checklist（見 §4.3）。
7. 〔本規劃新增〕**對比門檻分兩種**：
   文字 WCAG 1.4.3 **4.5:1**；邊框、圖示等非文字元素 WCAG 1.4.11 **3:1**。
   並附 WCAG 1.4.1（Use of Color）原則：**狀態不可只靠色相傳遞**，
   必須同時有文字或圖示——這條是藍色退場後的安全網，見 §4.3。
8. 〔本規劃新增〕**守門腳本怎麼用**：怎麼讀失敗訊息、baseline 怎麼收緊、
   **rename 檔案時 key 要一併改名**、為什麼沒有豁免旗標與 `--update-baseline`。

### 4.3 深色模式與色盲的驗證 checklist（章節內容之一）

現況 `.dark` 從未被實際套用（無切換入口、無任何 import），所以深色 token
**沒有執行期驗證管道**。兩層補救：

- **機械層**：對比度單元測試（階段 2）——這是本規劃相對上游 §4 第 6 點的**加強**，
  上游只要求手動 checklist。
- **人工層 checklist**，三段：
  1. **深色**：devtools 的 Elements 面板給 `<html>` 加 `class="dark"`，逐頁目視。
     頁面清單：首頁、服務詳情、會員中心、獎勵、後台四分頁。
     看什麼：卡片與背景是否有層次、提示框的字是否讀得到、badge 是否還分得出語義。
  2. 〔審查回填 P1-4，本次新增〕**色盲**：devtools 的
     Rendering → Emulate vision deficiencies，逐一套用
     protanopia / deuteranopia / tritanopia，走同一份頁面清單。
     **這是藍色退場的直接代價**：拿掉藍之後只剩紅/綠/黃橙，
     而紅綠正是紅綠色盲（約占男性 8%）最難區分的組合。
     驗收標準不是「顏色還分得出來」——那不可能——而是
     **「即使完全分不出顏色，狀態仍然讀得懂」**（靠文字標籤與圖示）。
  3. **對比**：抽查幾處實際渲染色，確認與測試算出的值一致
     （防止 token 被某處 `opacity` 或疊層稀釋）。
- **S1 本身不執行這份 checklist**（沒有元件用新 token，無可目視）——它是 S2 的驗收工具。

### 4.4 三態

不適用（無畫面）。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 語義色 token 進 `globals.css`：success / warning / destructive 各補齊 A·B·C 三形狀，淺深兩版 + `@theme inline` 映射 | `src/styles/globals.test.ts`（vitest node） | 紅→綠：(a) 每個 token 在 `:root`、`.dark`、`@theme inline` **三處齊備**；(b) `@theme inline` 每行的**值字面**等於預期的 `var(--token名)`——缺一或指錯即紅〔P1-7〕 |
| 2 | 對比度門檻 + `.dark --destructive` 改 hex〔P1-8〕 | 同檔，新增對比度案例（hex→相對亮度→WCAG 比值，純函式） | 淺色與深色**各自**：文字配對（A、B）≥ **4.5:1**；`*-border` 對其 `*-subtle` ≥ **3:1**〔P1-2〕；裸字 token 對 `--background` 與 `--card` 各 ≥ 4.5:1〔P1-3〕。讀到不可解析的色值**直接紅**，不靜默跳過 |
| 3 | `check-color-usage.py` 判定邏輯（C1 具名 class／C2 漸層／C3 原始色值）+ baseline 四條判定 | `--self-test` 表格案例 | 表格至少覆蓋：純 token 通過／`text-blue-600` 違規／`hover:`·`dark:`·`md:` 變體被抓／裝飾漸層違規／功能性漸層在 baseline 內不報／**`bg-[#16a34a]` 任意值違規**〔P1-1〕／**`.ts` 內 `'#16a34a'` 字面值違規**〔P1-1〕／baseline 內不報／超出報／低於報「請收緊」／**孤兒條目報**〔P2-2〕／**C1 減一 C2 加一淨數不變仍報**〔P2-7〕 |
| 4 | baseline 產生 + 掃 repo 綠 + 接進 framework-check | `bash scripts/framework-check.sh` 實跑 | framework-check 全綠；手動在任一檔加一個 `text-blue-600` → 紅，移除 → 綠；baseline 由腳本輸出產生，**不手抄規劃書裡的數字**〔P2-10〕 |
| 5 | `ui-ux-guidelines.md` §12（八點 + 灰階對照表 + 三段 checklist） | `check-document-naming.py`、`check-context-budget.py`（framework-check 內） | framework-check 綠；章節逐條對得上上游 §4 六點＋本規劃新增兩點；灰階對照表涵蓋實測 39 處所用到的每一個 `gray-N`〔P1-6〕 |

階段 1–2 是標準紅綠循環。階段 3 的紅燈是「表格案例先寫、判定函式還沒寫」
（與 `check-ime-safe-inputs.py` 的建立方式同構）。階段 4–5 是接線與文件，
驗證靠既有閘門，不另造測試。

`npm run check` 每階段收尾必跑；送 PR 前 `npm run check:full`。

## 6. 開放問題

〔審查回填 P2-9〕分兩層：**需裁決**的已由業主於 2026-09-14 裁決完畢；
**僅知會**的是規劃書本文已依 repo 既有立場定案、列出供業主否決用的項目。

### 6.1 需裁決（已裁決）

| # | 問題 | 裁決 | 落點 |
|---|---|---|---|
| Q1 | `--destructive` 補不補 subtle 三件組？既有 `.dark` oklch 怎麼辦？ | **補，且 `.dark --destructive` 一併改 hex** | §2.1、§2.3、階段 1–2 |
| Q4 | 藍色是否全面退場？ | **照上游退場，並補色盲驗證與 WCAG 1.4.1 防線** | §2.1、§4.2 第 7 點、§4.3 |
| P1-9 | `plans-keep` 與 friction-log 2026-09-02 判定衝突 | **保留標記讓 CI 綠，但明文記錄衝突並排入下次框架整併** | `progress.md`、friction-log |
| P1-6 | 灰階算不算守門對象？ | **留在 C1 掃描範圍，S1 額外交付灰階對照表** | §2.1、§4.2 第 2 點、階段 5 |

### 6.2 僅知會（已定案，業主可否決）

| # | 事項 | 定案 | 依據 |
|---|---|---|---|
| Q2 | baseline 低於實測值要不要紅 | **紅**，訊息印出可貼上的 JSON 行 | `vitest.config.ts:63`、`check-bundle-budget.mjs:5` 的既有棘輪立場 |
| Q3 | 測試檔納入掃描範圍 | **納入** | `gender.test.ts:20` 直接斷言 class string，不掃就留後門 |
| Q5 | 新章節編號 | **追加 §12**，不插隊 | 約 34 處交叉引用、改漏不會紅（§4.1） |
| P1-5 | 世代色（多值分類色）怎麼辦 | **去色走灰階三階**，不走 `--chart-*` | §4.2 第 5 點 (c) 的理由；S2 驗收站 1 可推翻 |

## 7. 風險與回滾

| 風險 | 緩解 |
|---|---|
| 新 token 名與 Tailwind 內建 utility 撞名 | 階段 1 的 `@theme inline` 測試會抓到；真撞了改名成本只在 S1 內（還沒有使用者） |
| `.dark --destructive` 轉 hex 轉錯（色偏） | 用工具轉換而非手算；原 oklch 值保留在同行註解；階段 2 的對比度測試會抓到離譜的偏差 |
| baseline 抓得比實際寬（漏掉某個表達形式），S2 收斂完留漏網 | C1/C2/C3 三條規則涵蓋具名 class、漸層、原始色值與任意值〔P1-1〕；baseline **由腳本掃出**而非手寫；C1 色相清單用 Tailwind 官方 22 色全表，不挑選 |
| 藍色退場後紅綠色盲難以辨識狀態 | §4.2 第 7 點的 WCAG 1.4.1 原則（狀態不可只靠色相）＋ §4.3 第 2 段的色盲模擬 checklist〔P1-4〕 |
| 灰階硬換造成視覺回歸 | 灰階對照表的「不確定時怎麼辦」欄留退路，色差明顯者標「S2 逐案目視」，不強迫替換〔P1-6〕 |
| 守門腳本誤擋 | baseline 是逃生口；真誤擋記 `docs/plans/friction-log.md`（框架摩擦） |
| 目前沒有行內豁免機制，日後出現真例外 | 屆時再加標記（比照 `plans-keep` 的「機器可讀標記＋寫得出退場條件」慣例）——現況 C3 掃到的 14 處原始 hex 全是自家調色，可 token 化或去色，先加是 YAGNI |
| 對比度測試用 hex 算，若日後 token 改 oklch 會失效 | 測試在讀不到可解析的色值時**直接紅**（不靜默跳過）——閘門不容許靜默失效 |

**回滾**：S1 的改動除 `.dark --destructive` 的表示法外全是加法，沒有任何元件依賴新 token，
`git revert` 單一 PR 即可，不留半套狀態。最壞情況是回到現況（有手刻色、無閘門），
沒有比現在更糟的可能。
