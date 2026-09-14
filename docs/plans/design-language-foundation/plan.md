# 設計語言地基（D1 色彩系統重建 + D2 色彩守門腳本）規劃書

> 上游：`docs/plans/platform-uiux-redesign/`（`plan.md` 工項定義、
> `construction-plan.md` 工序、`progress.md` 看板）。本檔是該工程 **S1** 的規劃書。
> 施工鷹架，S1 收尾（`/tdd-implement` 最後一步）刪除；值得保存的規則
> 已**寫在** `docs/ui-ux-guidelines.md` 新章節裡，不靠本檔存活。

## 0. 一句話

這個 feature 讓**後續每個施工 session** 能照一份「有機器把關」的色彩規範改色，
因為上游 §2.4 的診斷是「方向本來就對（`--primary: #030213` 與 logo 相符），
但沒人守門」——沒有 token 與守門腳本，D3（S2）收斂完必然再漂。

## 1. 使用者需求

### 1.1 溯源

本工程不改任何業務規則（上游 plan.md §2.6），規格書 §7–§10 無對應章節。
需求的溯源對象是 **上游 `plan.md` §4（設計語言規範方向，七點）與 §3 的 D1/D2 定義**。
每個斷言下方都標了依據，沒有腦補的規則。

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
2. 現況 **51 檔、625 處**手刻調色盤 class 全數在 baseline 內，framework-check 綠
   ——S1 不做任何收斂（那是 S2/D3）。
3. 任一檔的手刻色數量比 baseline 多 1 處 → 紅。
4. `python3 scripts/check-color-usage.py --self-test` 通過表格案例
   （比照既有 checker 的雙軌慣例：先驗檢查器自己，再掃 repo）。
5. `docs/ui-ux-guidelines.md` 新章節能逐條回答 S2 會遇到的判準問題：
   狀態 vs 非狀態、漸層怎麼辦、統計數字上不上色、身分標記（性別）算不算語義。
6. 深色模式：每個新語義 token 都有 `.dark` 版，**且對比度由自動測試驗證**
   ≥ 4.5:1；devtools 目視 checklist 落在新章節裡（上游 §4 第 6 點）。

### 1.4 不做什麼（scope out）

- **不改任何元件**、不替換任何一處現有手刻色——那是 S2（D3）整包的工作。
- 不新增 `StatusCallout` 元件、不擴充 `ui/badge.tsx` variant——上游 §3 明列在 D3。
- 不做深色模式切換入口（上游 §5 已 scope out，另案）。
- 不動 `--primary` / 根字級 / 觸控目標 / 表單規範（上游 §4 第 1 點：基底不變）。
- 不動 `supabase/functions/`、不改 API 契約、不改業務規則。
- 不動 `--chart-*`（圖表色階與語義色是兩件事，本工程沒有圖表工項）。

## 2. 系統設計

本階段沒有 API/DB/資料流。這節講兩件事的設計：**token 的分層**與**守門腳本的判定流**。

### 2.1 Token 分層：由現況用法反推，不憑空發明

掃描實證（`src/**` 的色相×階分佈）顯示主流用法只有兩種形狀：
**實心**（`bg-green-600` + 白字，badge/進度條）與
**淺底提示框三件組**（`bg-green-50` 底 / `border-green-200` 框 / `text-green-800` 字）。
所以每個語義色需要 **5 個 token**，少一個 S2 就會為了淺底提示框再度手刻：

| token | 用途 | 收斂現況 |
|---|---|---|
| `--success` | 實心底 | `bg-green-600`（41 處） |
| `--success-foreground` | 實心底上的字 | `text-white` |
| `--success-subtle` | 淺底提示框 | `bg-green-50`（19 處） |
| `--success-subtle-foreground` | 淺底上的字／圖示 | `text-green-800`（16 處）、`text-green-600` |
| `--success-border` | 淺底的框 | `border-green-200`（13 處） |

`--warning` 同構（收斂 yellow/orange/amber：`yellow-600` 20、`orange-600` 16、
`yellow-50` 14、`orange-500` 14、`amber-*` 若干）。
`--destructive` 已有前兩個，缺後三個 → **開放問題 Q1**。
`--info` **不發**（上游 §4 第 3 點：資訊/進行中走灰階或 `--primary`，不再用藍）→ **Q4**。

### 2.2 三處同步，漏一處會靜默失效

Tailwind v4 的 `bg-success` **只有在 `@theme inline` 有 `--color-success` 時才存在**；
沒有的話那個 class 不會報錯，只是不產生任何 CSS。
`ui-ux-guidelines.md` §2 已經記過這個坑（Figma 靜態編譯 CSS 年代，OTP 樣式靜默失效）。
所以階段 1 的測試驗的是**三處齊備**：`:root`、`.dark`、`@theme inline`。

### 2.3 色彩表示法用 hex，不用 oklch

同檔既有 token 本來就是混用（`--primary: #030213`、`--destructive: #d4183d` 是 hex，
灰階是 oklch）。新語義色選 hex，理由不是偏好而是**閘門要算得出對比度**：
hex → sRGB → 相對亮度是十行純函式；oklch → sRGB 要寫整套色彩空間轉換，
那條路上的 bug 會讓閘門**說謊**（宣稱過了但實際對比不足），比沒有閘門更糟。

### 2.4 守門腳本的判定流

形狀比照 `scripts/check-ime-safe-inputs.py`：決策邏輯放純函式、表格案例驗行為、
零第三方依賴（framework-check 的契約是免依賴安裝）。

**掃描對象**：`src/**/*.ts` 與 `src/**/*.tsx`，**含 `.test.*`**。
理由：`src/utils/gender.test.ts:20` 直接斷言 `'border-blue-500 text-blue-600'`，
`src/utils/userReferralFormatter.ts:60-86` 是回傳 class string 的純函式——
色不只住在 JSX 裡。漏掃測試檔等於留一條後門（**Q3** 確認）。

**規則**

- **C1 調色盤 class**：`(text|bg|border|from|via|to|ring|fill|stroke|divide|shadow|outline|decoration|accent|caret)-<22 個 Tailwind 色相>-<階>`，
  變體前綴（`hover:` `dark:` `md:` `focus-visible:`）一律照抓——
  現況 `dark:` 變體有 18 處（`ReferralTreeView.tsx` 14、`RewardHistory.tsx` 3…），
  不抓就是留白名單。
- **C2 裝飾性漸層**：`bg-gradient-to-*` / `bg-linear-to-*`（上游 §4 第 4 點漸層退場）。
  現況 9 處：`task/ProgressBar.tsx` 2、`task/PendingRewardsSection.tsx` 3、
  `home/MobilePhotoWallCard.tsx` 1、`PaymentResult.tsx:540`、`TaskDashboard.tsx` 2。
  ⚠️ `MobilePhotoWallCard.tsx:35` 的 `bg-gradient-to-t` 是**照片上的文字遮罩**
  （功能性，不是裝飾）——它會是 baseline 的長期居民，S2 不該硬拆；判準寫進新章節。

**棘輪 baseline**：`scripts/color-usage-baseline.json`，`{相對路徑: 允許筆數}`。三條判定：

| 情況 | 判定 | 為什麼 |
|---|---|---|
| 不在 baseline 的檔出現命中 | 🔴 | 新債 |
| 命中數 > baseline | 🔴 | 舊檔變更糟 |
| 命中數 < baseline | 🔴（訊息要求收緊） | 棘輪的牙齒 → **Q2** |

第三條是刻意的：本 repo 對棘輪已有明文立場——「棘輪的價值全在貼著實測值，
落後的棘輪等於沒有」（`vitest.config.ts:63`）、「這是棘輪不是目標：擋住無聲長大」
（`check-bundle-budget.mjs:5`）。失敗訊息會直接印出可貼上的 JSON 行，
把收緊的成本壓到一次貼上。

**刻意不提供 `--update-baseline` 旗標**：自動更新是棘輪腐爛的標準路徑
（跑一下就綠，沒有人再看那個數字）。

**刻意不提供行內豁免標記**：全 repo 掃不到任何品牌色（無 LINE `#06C755`）、
無第三方 embed、無 `bg-[#...]` 任意值色——目前**沒有**任何一處是真的不能 token 化的。
baseline 就是 S2 期間唯一的通道。真的出現例外再加（見 §7）。

### 2.5 接進 framework-check 軌

插在 `scripts/framework-check.sh` 第 12 項（IME）之後、第 13 項（harness-metrics）之前，
形狀與前面九支完全一致：先 `--self-test` 再掃 repo，兩段各自的 FAIL 訊息分開。
本軌無路徑過濾、秒級、免 secrets——`src/**` 的檢查放這裡是對的
（`check-ime-safe-inputs.py` 已立此先例）。

## 3. 架構影響

### 3.1 動到的檔案（全部是加法）

| 檔案 | 動作 |
|---|---|
| `src/styles/globals.css` | 加 token（`:root` / `.dark` / `@theme inline` 三處） |
| `src/styles/globals.test.ts` | **新增**（vitest node，解析 CSS 文字） |
| `docs/ui-ux-guidelines.md` | 新增一章 |
| `scripts/check-color-usage.py` | **新增** |
| `scripts/color-usage-baseline.json` | **新增**（由腳本掃出，不手寫） |
| `scripts/framework-check.sh` | 加一段 |
| `docs/plans/design-language-foundation/` | 本鷹架（S1 收尾刪） |

### 3.2 S1/S2 分界的意義：S1 全綠但畫面零變化

沒有任何元件引用新 token，所以 S1 合併後 develop 環境**看起來完全一樣**。
這是設計而非疏漏——上游 construction-plan §4.3 的驗收站 1 排在 S2 之後，正是這個道理。
業主在 S1 合併後不需要（也看不出來要）驗收什麼。

### 3.3 其他

- 與 lazy 路由 / appShell / `multi-step-flow-recovery.md` 四契約**無關**。
- **效能**：globals.css 增約 30 行；Tailwind JIT 只為**實際用到**的 class 產出 utility，
  S1 沒有任何使用者 → bundle 幾乎不變（`check-bundle-budget.mjs` 應無感）。
- **安全**：無。不碰權限、不碰 PII。
- **context 成本**：`ui-ux-guidelines.md` 現 ≈14.9KB，新章節約 +3KB，
  離 `check-context-budget.py` 的 20,000 token 單檔警戒線還很遠。

## 4. UI/UX

**本階段不改任何畫面。** UI/UX 的交付物是**規範本身**——所以這節寫「規範長什麼樣」。

### 4.1 新章節的位置：追加為 §12，不插隊

新章節在內容上是 §2「樣式基礎」的展開，理應排在 §3。但 repo 內有
**約 34 處 `§n` 交叉引用散在 20 個檔案**（`CLAUDE.md`、四個 plan-reviewer agent、
`MemberManagement.tsx`、`WithdrawalManagement.tsx`、`usePagedList.ts`、多個測試檔…），
其中 `§11`（動作位階）就被引用 9 次。插隊要全部改，且**改漏不會紅**（沒有機械把關）。

→ **追加為 §12「色彩與設計語言」**，並在 §2 末尾加一行指路（`→ §12`）。
風險為零、成本為零。（**Q5** 請業主確認。）

### 4.2 章節內容（依上游 §4 七點逐條落地）

1. **基底不變**：`--primary: #030213` 與 logo 相符，保留；根字級/觸控/表單規範不動。
2. **層次靠灰階不靠顏色**：字重、字級、`--muted-foreground`、留白——這是 logo 的語言。
3. **語義色是唯一的彩色**，四類 + token 對照表（§2.1 那張表）：
   成功 → `--success`；警示 → `--warning`；危險 → `--destructive`；
   資訊/進行中 → **灰階或 `--primary`，不再用藍**。
4. **漸層退場**：裝飾性漸層改單色/灰階；例外是**功能性遮罩**
   （照片上的文字可讀性遮罩，`MobilePhotoWallCard`）——判準寫明：
   「漸層是為了讓上面的字看得見」＝功能性，可留；「漸層是為了好看」＝裝飾，退場。
5. **統計數字去色 + 非狀態判準**（上游 §4 第 5 點指名這是「給 S2 機械替換的裁決依據，
   不留各自詮釋空間」）。三類明確歸「非狀態 → 純黑/灰」：
   - (a) **計數與量值**：總會員數、管理員人數、累積獎勵金額
   - (b) **身分／分類標記**：性別（現況 `gender.ts` 藍/粉）、方案別、角色
   - (c) **純裝飾**：icon 底色、卡片點綴
   只有明確落在四類語義的**狀態呈現**才上色。
6. **深色模式**：token 必成對；對比度門檻 ≥ 4.5:1 由測試驗；
   **devtools 目視 checklist**（上游 §4 第 6 點指定的交付物）——
   放在這裡而不是 plan.md，因為 plan.md 會被刪。
7. **守門腳本怎麼用**：怎麼讀失敗訊息、baseline 怎麼收緊、為什麼沒有豁免旗標。

### 4.3 深色模式 devtools 驗證 checklist（章節內容之一）

現況 `.dark` 從未被實際套用（無切換入口、無任何 import），所以深色 token
**沒有執行期驗證管道**。兩層補救：

- **機械層**：對比度單元測試（階段 2）——這是本規劃相對上游 §4 第 6 點的**加強**，
  上游只要求手動 checklist。
- **人工層**：checklist 明列「在 devtools 的 Elements 面板給 `<html>` 加上 `class="dark"`，
  逐頁目視」＋要看的頁面清單（首頁、服務詳情、會員中心、獎勵、後台四分頁）
  ＋要看什麼（卡片與背景是否有層次、提示框的字是否讀得到、badge 是否還分得出語義）。
  **S1 本身不執行這份 checklist**（沒有元件用新 token，無可目視）——它是 S2 的驗收工具。

### 4.4 三態

不適用（無畫面）。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 語義色 token 進 `globals.css`（success/warning 各 5 個，淺深兩版 + `@theme inline` 映射） | `src/styles/globals.test.ts`（vitest node，讀檔解析） | 紅→綠：斷言每個新 token 在 `:root`、`.dark`、`@theme inline` **三處齊備**，缺一即紅 |
| 2 | 對比度門檻 | 同檔，新增案例（hex→相對亮度→WCAG 比值，純函式） | 每組 (`subtle`, `subtle-foreground`) 與 (solid, `foreground`) 在淺色與深色**各自** ≥ 4.5:1 |
| 3 | `check-color-usage.py` 判定邏輯 | `--self-test` 表格案例 | 表格至少覆蓋：純 token 通過／`text-blue-600` 違規／`hover:`·`dark:`·`md:` 變體被抓／裝飾漸層違規／功能性漸層在 baseline 內不報／baseline 內不報／超出 baseline 報／低於 baseline 報「請收緊」 |
| 4 | baseline 產生 + 掃 repo 綠 + 接進 framework-check | `bash scripts/framework-check.sh` 實跑 | framework-check 全綠；手動在任一檔加一個 `text-blue-600` → 紅，移除 → 綠 |
| 5 | `ui-ux-guidelines.md` §12 + devtools checklist | `check-document-naming.py`、`check-context-budget.py`（framework-check 內） | framework-check 綠；章節逐條對得上上游 §4 的七點 |

階段 1–2 是標準紅綠循環。階段 3 的紅燈是「表格案例先寫、判定函式還沒寫」
（與 `check-ime-safe-inputs.py` 的建立方式同構）。階段 4–5 是接線與文件，
驗證靠既有閘門，不另造測試。

`npm run check` 每階段收尾必跑；送 PR 前 `npm run check:full`。

## 6. 開放問題（逃生口——等人裁決，禁止腦補）

- [ ] **Q1 `--destructive` 要不要一併補 `-subtle` / `-subtle-foreground` / `-border`？**
  現況 red 的淺底提示框有 49 處（`red-50` 18、`red-200` 14、`red-800` 17）。
  不補的話 S2 收斂到紅色提示框時**無 token 可用**，只能再手刻。
  〔建議〕**補**。S1 多三個 token 的成本接近零；S2 缺了就卡住。
  （超出開工 prompt 字面的「success/warning」，所以列出來讓您裁決。）

- [ ] **Q2 baseline 低於實測值要不要紅？**
  紅＝棘輪貼著實測值（本 repo 既有立場，見 `vitest.config.ts:63`），代價是
  S2 每改好一批就要同步改 baseline 數字。不紅＝S2 順手，但棘輪會落後、
  改好的空間會被下一個 session 用回去。
  〔建議〕**紅**，並讓失敗訊息直接印出可貼上的 JSON 行。

- [ ] **Q3 測試檔（`src/**/*.test.*`）納入掃描？**
  納入＝`gender.test.ts` 那種直接斷言 class string 的地方也被守住（無後門），
  代價是 S2 改元件時測試也會紅（本來就該一起改）。
  〔建議〕**納入**。

- [ ] **Q4 確認「不發 `--info`、藍色全面退場」。**
  上游 §4 第 3 點寫明「資訊/進行中 → 灰階或 `--primary`，不再用藍」。
  照做的話 S2 要把 **≈128 處藍色**（`blue-600` 45、`blue-200` 26、`blue-50` 22、
  `blue-800` 16、`blue-500` 10、`blue-900` 9）全部改成灰階/黑——
  這會是整個工程**視覺上最劇烈**的單一改動。請確認這正是您要的黑白極簡。
  〔建議〕**照上游執行**（這正是「黑白極簡」的具體內容），但先讓您知道規模。

- [ ] **Q5 新章節編號：追加為 §12，還是插隊為 §3？**
  〔建議〕**追加 §12**（§4.1 的理由：約 34 處交叉引用、改漏不會紅）。

## 7. 風險與回滾

| 風險 | 緩解 |
|---|---|
| 新 token 名與 Tailwind 內建 utility 撞名 | 階段 1 的 `@theme inline` 測試會抓到；真撞了改名成本只在 S1 內（還沒有使用者） |
| baseline 抓得比實際寬（漏掉某個色相），S2 收斂完留漏網 | 階段 4 的 baseline **由腳本掃出**而非手寫；C1 的色相清單用 Tailwind 官方 22 色全表，不挑選 |
| 守門腳本誤擋 | baseline 是逃生口；真誤擋記 `docs/plans/friction-log.md`（框架摩擦） |
| 目前沒有行內豁免機制，日後出現真例外 | 屆時再加標記（比照 `plans-keep` 的「機器可讀標記＋寫得出退場條件」慣例）——現況掃不到任何品牌色/第三方 embed/任意值色，先加是 YAGNI |
| 對比度測試用 hex 算，若日後 token 改 oklch 會失效 | 測試在讀不到可解析的色值時**直接紅**（不靜默跳過）——閘門不容許靜默失效 |

**回滾**：S1 全部是加法，沒有任何元件依賴新 token，`git revert` 單一 PR 即可，
不留半套狀態。最壞情況是回到現況（有手刻色、無閘門），沒有比現在更糟的可能。
