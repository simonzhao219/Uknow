# 平台管理後台 RWD 規劃書

## 0. 一句話

這個 feature 讓**管理員在手機上完成後台日常作業**（查會員、審證件、看告警、
處理提領的非匯款環節），因為規格明訂「以手機瀏覽器為主要優化目標」
（`ui-ux-guidelines.md` 前言），而 `/admin` 是全站唯一**整片以桌面思維寫成**
的區域——五個分頁裡有三個是 6～11 欄的寬表格，在 375px 下只能靠橫向捲動閱讀。

---

## 1. 使用者需求

### 對照規格書

- `docs/uknow-software-specification.md` §13 管理後台（五個模組的職責）
- 同 §13.1 掃碼核身（`/admin/verify` 獨立路由，**本次不動**）
- `docs/ui-ux-guidelines.md` §1 尺寸與觸控、§5 列表、§7 響應式版面策略、§10 溢版

### 使用者故事（可驗證的行為）

| # | 故事 | 驗收 |
|---|---|---|
| U1 | 客服在外面接到「我的提領怎麼還沒到」，用手機開 `/admin` 查得到該筆的狀態與轉換歷史 | 375px 下不需橫向捲動即可讀完一筆提領的會員／金額／狀態，並開得了「查看歷史」 |
| U2 | 管理員在手機上找得到並切得動全部五個分頁 | 375px 下五個分頁標籤**同時可見**，不需橫向捲動探索 |
| U3 | 管理員用手機審證件（`/admin` → 會員管理 → 證件審核） | 身分證照片以單欄大圖呈現，寬度貼齊螢幕 |
| U4 | 管理員在手機上查會員、停權／恢復、授予／撤銷管理員 | 每位會員一張卡，三顆操作鍵都在拇指可及處且 ≥44px |
| U5 | 管理員在手機上看得懂系統告警並標記已處理 | 告警訊息完整可讀、`context` JSON 不撐爆版面 |
| U6 | 管理員在手機上發布／刪除公告 | 表單欄位單欄堆疊，公告列表的標題與 badge 不互相擠壓 |

### 不做什麼（明確排除）

- **不動任何後端**：無 API 變更、無 migration、無 RLS 調整。這是純前端版面工作。
- **不動 `/admin/verify`**（掃碼核身）：它本來就是為全螢幕相機設計的獨立路由。
- **不改 W8 的行動端權限邊界**（手機隱藏「標記已匯款」）——見開放問題 Q1。
- **不重畫桌面版**：桌面現況（表格密度、同屏作業面板）是刻意設計，維持原樣。
- **不做深色模式、不做新功能**。

---

## 2. 系統設計

**沒有資料流變更。** 所有既有 props 契約、`apiClient` 呼叫、`usePagedList`
分頁行為原封不動；本次只改「同一份資料怎麼排版」。

唯一的新共用邏輯是版面切換判定，沿用既有的
`src/hooks/useMediaQuery.ts`（`WithdrawalManagement` 已在用它做 W8）。

- API 變更：無
- 資料庫變更：無
- 端點／權限：無

---

## 3. 架構影響

### 動到的模組

| 檔案 | 動什麼 |
|---|---|
| `src/components/AdminDashboard.tsx` | 頂層 TabsList 手機版排法、標題區字級 |
| `src/components/admin/WithdrawalManagement.tsx` | 表格→手機卡片、工具列換行、作業面板、`IdCardDialog` 寬度 |
| `src/components/admin/MemberManagement.tsx` | 表格→手機卡片、搜尋列換行、詳情 Sheet 的 `dl` 欄數 |
| `src/components/admin/SystemAlerts.tsx` | 表格→手機卡片、CardHeader 換行 |
| `src/components/admin/SystemNotifications.tsx` | 公告列表項目的標題／badge 換行、公告內文 `break-words`（P15） |
| `src/components/admin/AdminSetup.tsx` | 帳號資訊列（label/value）長 Email 換行（P16，**實測 +119px**） |
| `src/components/ui/checkbox.tsx` | `pointer-coarse` 熱區擴張（**不改可見尺寸**，見 §4.1「觸控」） |
| `e2e/test_overflow_sweep.py` | 逐階段刪掉已清償的 `known_overflow`（巡檢能力本身已於 PR #242 完成） |

`IdReviewQueue.tsx` 已是卡片式 + `sm:grid-cols-2`，**不需改動**——列出來是為了
說明它為什麼不在清單裡，不是漏掉。

### 與 appShell／路由 lazy 結構的關係

無。`AdminDashboard` 維持 lazy（`src/appShell.test.ts` 已有測試釘住），
不新增路由、不新增頂層 Tab（§13 的「五欄 grid」判準不受影響）。

### 版面切換方式：JS 判定，不是純 CSS 雙套版面（**刻意偏離 §7，理由如下**）

`ui-ux-guidelines.md` §7 寫的成熟模式是 `md:hidden` / `hidden md:*`（`HomePage`
的作法）。三個表格元件這次改用 `useMediaQuery('(min-width: 768px)')` 擇一渲染，
理由三條：

1. **`WithdrawalManagement` 的媒體狀態本來就是 JS 關切點**——W8 的按鈕顯隱已經
   讀 `isDesktop`。同一個檔案裡一半靠 CSS、一半靠 JS 決定手機行為，是兩套真相。
2. **成本不對稱**：`HomePage` 雙渲染的是輕卡片；這裡是 11 欄 × 50 列的表格
   加上五個 Dialog，兩套都掛在 DOM 上是實打實的浪費。
3. **測試可辨識**：jsdom 不套用 Tailwind，純 CSS 雙套版面會讓兩棵樹同時存在，
   `getByText` 立刻變成 "found multiple elements"——既有 975 行 admin 測試會
   整批誤紅，而那個紅燈不代表任何真實缺陷。

代價：`window.matchMedia` 是必要相依。`useMediaQuery` 已對 SSR 與缺 API 做保護，
且初值在 `useState` initializer 讀取，**首次繪製就正確、不會閃版**；測試側
`WithdrawalManagement.test.tsx:25` 的 `stubMediaQuery` 已是現成樣板。

> 若人審通過這個偏離，`ui-ux-guidelines.md` §7 應在同一個 PR 補一句
> 「重列表／已有 JS 媒體判定的元件改用 `useMediaQuery` 擇一渲染」——
> 準則失真等於 `plan-reviewer-uiux` 在對照錯的規則。

### 效能／安全

- 效能：手機端 DOM 節點數**下降**（單套版面 + 卡片欄位少於表格）。
- 安全：匯款作業面板在手機上曝露身分證字號與完整銀行帳號。本次**不改變曝露
  範圍**（維持與桌面一致），但手機版把它收成預設摺疊（見 §4），順帶降低
  公共場合的肩窺面積。這是版面決定，不是權限變更。

---

## 4. UI/UX

### 4.0 現況盤點（375px，證據導向）

| # | 位置 | 現況 | 後果 |
|---|---|---|---|
| P1 | `AdminDashboard.tsx:122` TabsList | 手機退回 flex + 橫向捲動 | 五個分頁只看得到前二～三個，**沒有捲動提示**，第 4、5 個分頁形同隱藏 |
| P2 | `WithdrawalManagement.tsx:741` 提領表格 | 11 欄，`Table` 原語自帶 `overflow-x-auto` + 儲存格 `whitespace-nowrap` | 版面不破，但讀一筆要左右捲三趟；「操作」在最右欄，離視線最遠 |
| P3 | 同上 `:664` 工具列 | `flex items-center justify-between` 未換行 | Select(w-36) + 兩顆按鈕 + 「已顯示 N / M 筆」在 375px 擠成一列 |
| P4 | 同上 `:624` 匯款作業面板 | `grid gap-3 md:grid-cols-5` | 手機直向堆成五段，把整份提領列表推到第一屏之外 |
| P5 | 同上 `:68` `IdCardDialog` | `DialogContent className="max-w-3xl"` | twMerge 讓 `max-w-3xl` **蓋掉** dialog 原語的行動端護欄 `max-w-[calc(100%-2rem)]`（`dialog.tsx:41`）→ 375px 下對話框寬 768px，左右溢出視窗 |
| P6 | 同上 `:82` 身分證雙圖 | `grid grid-cols-2` 無斷點 | 每張約 160px 寬，證件上的字**看不清**——而看清楚正是審核的實質工作 |
| P7 | `MemberManagement.tsx:378` 會員表格 | 8 欄 + 末欄三顆操作鍵 | 同 P2；操作鍵要捲到最右才點得到 |
| P8 | 同上 `:334` 標題／搜尋列 | `flex items-center justify-between` + `Input w-56` | 375px 下標題與搜尋框互相擠壓 |
| P9 | 同上 `:208` 詳情 Sheet 的 `dl` | `grid-cols-2` 無斷點 | 「收款帳號」`銀行代號 / 帳號` 在半寬欄裡折行破碎 |
| P10 | `SystemAlerts.tsx` 告警表格 | 6 欄，其中 `context` 是 `JSON.stringify` 塞進 `max-w-xs` | 訊息與 JSON 都被推到捲動區右側，手機上等於看不到 |
| P11 | 同上 CardHeader | `flex flex-row items-center justify-between` | 長 CardDescription 與「重新整理」鍵在手機上對撞 |
| P12 | `SystemNotifications.tsx:243` 公告列表項 | `flex items-start justify-between`，右側塞兩個 badge + 刪除鍵 | 標題被擠成單字換行 |
| P13 | `ui/checkbox.tsx:18` | `size-4`（16px），**無 `pointer-coarse` 規則** | 違反 §1「觸控 ≥44px」。提領批次全選／單選在手機上點不準——而它的下一步是**不可回退**的批次匯款 |
| P14 | 全域 | `BottomNav` 是 `md:hidden fixed bottom-0 z-40`，main 有 `pb-24 md:pb-6` | 手機底部已被佔用：admin **不得**新增底部固定工具列 |
| P15 | `SystemNotifications.tsx:263` 公告內文 | `<p className="text-sm text-muted-foreground mb-2">`，無 `break-words` | 公告內文貼一條網址就撐破——**實測 +153px**。長 token 不斷行，這是 §4.0 唯一由量測而非閱讀發現的一條 |
| P16 | `AdminSetup.tsx:152-155` 帳號資訊的 Email 列 | `flex items-center justify-between`，標籤與值同列不換行 | Email 來自 Supabase Auth、長度無上限——**實測 +119px**。這條原本只在 §3 出現而沒有證據項（審查的 F5），量測後補上 |

### 4.1 手機版設計（對照 §7 既有模式）

**列表 → 卡片（三處，同一套骨架）**

一筆記錄一張卡，`min-h` 由內容決定；**資訊量不得低於桌面表格的關鍵欄位**
（§7 明文：手機卡片不得退化到「只剩照片+名字」）：

- 提領卡：會員 / 匯款金額 / 扣點 / 狀態 badge / 申請時間 / 收款銀行＋帳號 /
  操作鍵（退件、代為完成；「標記已匯款」依 Q1 決定）/ 身分證照片 / 歷史
- 會員卡：姓名 / Email / 電話 / 會籍 badge / 角色 badge / 狀態 badge /
  刊登數 / 三顆操作鍵
- 告警卡：等級 badge / 來源 / 訊息全文 / 發生時間 / 「標記已處理」；
  `context` JSON 收進 `Collapsible`（預設收合、`break-all`）

操作鍵一律在卡片內、`flex flex-wrap gap-2`，不做底部固定列（P14）。

**頂層 Tabs**：`w-full grid grid-cols-3 md:grid-cols-5 h-auto`。
**四個 class 缺一不可**——`TabsList` 原語的 base 是
`inline-flex h-9 w-fit ... flex overflow-x-auto`（`ui/tabs.tsx:32`）：
少了無前綴的 `grid`，`grid-cols-3` 對 `display:flex` 容器毫無作用；
少了 `w-full`，容器會縮成 `w-fit` 的內容寬度、三欄等分不會發生；
少了 `h-auto`，釘死的 `h-9` 放不下兩列。現況碼 `AdminDashboard.tsx:122`
的 `w-full md:grid md:grid-cols-5` 已自證前兩點——作者刻意在 `md:` 明寫
`grid` 才能覆寫 base 的 `flex`。（審查 F2 ＋「補 F2」）

375px ÷ 3 ≈ 119px，最長標籤「獎金提領管理」在 `text-sm` 下約 100px
——**塞得下**，五個分頁 3+2 兩列全部可見，P1 消失。這也正面解決了
`AdminDashboard.tsx:118-121` 註解記錄的問題（`grid-cols-5` 在 375px 下每格
僅約 69px，所以當初退回橫向捲動）：**兩列的每格比五欄寬 72%**，不是推翻
那個判斷，是解決它當初繞開的成因。

⚠️ 連帶檢查：`TabsTrigger` 帶 `h-[calc(100%-1px)]`（`tabs.tsx:53`），
在 `h-auto` 容器下百分比高度的解析**只有真瀏覽器確認得了**——所以階段 1
的驗收要量 `count_rows`，不是斷言 class 字串。

**匯款作業面板（手機不另立面板）**：手機版**不保留獨立的作業面板卡**，
改成點卡片就地展開該筆的五欄（戶名／身分證字號／銀行代號／收款帳號＋
複製鍵／匯款金額）。桌面維持現況（面板在列表上方，W1 的同屏理由在桌面
仍然成立）。

這條同時解掉審查 F1：`activeId` 的**唯一寫入點**是
`TableRow onClick`（`WithdrawalManagement.tsx:768`），表格在手機被拿掉後
就沒有任何寫入路徑，`activeRecord` 會永遠落回 `withdrawals[0]`（`:242`）
——作業面板釘死第一筆、展開也切不動。三個候選裡選「就地展開」而不是
「卡片點擊仍寫 `activeId`、面板留在列表上方」，理由是**後者在 375px 單欄下
必然把面板與該筆記錄分離**，使用者點完要捲回頁首才看得到結果，`:616` 那條
W1「admin 開著網銀打字，五欄必須同時在眼前」的註解在手機上就名存實亡。
就地展開讓同屏契約在手機重新成立，順帶把寫入路徑補回去。

實作上手機版仍寫 `setActiveId`（同一個狀態、同一組 handler，不另開一套），
只是渲染位置從獨立卡片變成該卡內的展開區——**避免出現「桌面一套狀態、
手機另一套」的兩份真相**。

**對話框**：`IdCardDialog` 改 `max-w-[calc(100%-2rem)] sm:max-w-3xl`（P5）、
雙圖改 `grid-cols-1 sm:grid-cols-2`（P6）。

**公告內文（P15）**：`SystemNotifications.tsx:263` 的 `<p>` 補 `break-words`
——長 token（實務上是網址）不斷行，實測撐破 +153px。

**管理員設置的帳號資訊列（P16）**：`AdminSetup.tsx:147-163` 的三列
`flex items-center justify-between` 在手機改為標籤在上、值在下（或讓值
`break-all` 並允許換行）。Email 來自 Supabase Auth、長度無上限，實測 +119px。

**觸控**：`checkbox.tsx` **擴大可點區、不改可見尺寸**——用透明的
`before:` 偽元素把熱區撐到 44×44（`pointer-coarse:before:absolute`
`pointer-coarse:before:-inset-[14px]`，配 `relative`），可見方框維持
`size-4`。

不照 `button.tsx:27-30` 的先例直接放大可見尺寸，是因為**兩者的性質不同**：
`button`／`input`／`select` 放大的是本來就有版面高度的控制項
（`min-h-[44px]`，視覺變化小）；checkbox 的可見方框是 16px 的**符號**，
放到 44px 會明顯改變外觀，而它被 5 個**不在本次範圍內**的會員端頁面共用
（`WithdrawalProcess`、`JoinReferralProgramDialog`、`CompleteProfile`、
`CreateServiceProvider`、`EditServiceProvider`——審查 F4）。熱區擴張讓那 5 頁的
視覺**零變化**，blast radius 歸零，也就不需要為它們補回歸驗證。

代價講明：這在本 repo **沒有先例**，等於開第二種觸控目標寫法（正是 N2 在
擋的「另起爐灶」）。所以配套是**在 `checkbox.tsx` 就地寫明為什麼不能照
button 放大**，並且驗收改量**實際可點區**（`layout_probe.viewport_fit`，
真瀏覽器量盒子）——WCAG 2.5.8 算的本來就是可點區而非可見尺寸。

### 4.2 空態／錯誤態／載入態

三態**全部已存在且已有測試**（提領／會員／證件審核／告警各有）。本次要求：
手機版與桌面版**共用同一組三態節點**（三態不進雙套分支），避免出現
「手機看得到空態、桌面看不到」這種只會在改版後才發現的不對稱。

### 4.3 可測試性

卡片沿用既有 `aria-label` 慣例（`選取 ${userName} 的提領記錄`、
`查看 ${name} 的詳情`），Playwright 的 `get_by_role` 查詢在兩套版面下皆可用。

**jsdom 量不出版面**，所以凡是「使用者看得到的幾何」都不能只靠元件測試釘住
——斷言一個剛打進去的 class 字串是套套邏輯，不可能為了正確的理由失敗。
真實幾何由 `e2e/layout_probe.py` 量（`count_rows` 數列數、`viewport_fit`
量盒子與視窗邊界的間距），與溢出探針刻意分家：**兩者的失效方式相反**。
溢出探針問「有沒有畫到框外」，對 `overflow-x: auto` 的容器刻意不報；
`layout_probe` 問「有沒有長成該有的樣子」。只靠前者，「沒壞但也沒對」的
版面（例如擠成單行捲動的 TabsList）永遠不會被發現。

---

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

先修殼層再修內容：手機上連分頁都切不動時，後面四個分頁的改動無從人工驗證。

**驗證能力已經先補齊**（人審裁決「先補 M1」，PR #242 已合入這條分支）：
375px 的真實幾何量測、逐路由溢版棘輪、Dialog/Sheet/分頁的點開掛鉤都已存在，
**而且會擋 CI**。所以下表的驗證標準不再只是 jsdom 的 class 斷言——凡是
「使用者看得到的版面」都由真瀏覽器量盒子把關。兩支工具的分工：

- `e2e/test_overflow_sweep.py`：問「**有沒有畫到框外**」。沒標
  `known_overflow` 的路由一律硬失敗；清乾淨一條就刪掉那行，只准往少走。
- `e2e/test_admin_mobile_layout.py` ＋ `e2e/layout_probe.py`：問「**有沒有
  長成該有的樣子**」。U2/U3 的終局已寫成 `xfail(strict=True)`——今天 xfail，
  改版做完會 XPASS 讓 CI 紅，**逼實作者回來刪 marker**。刪 marker 是每個
  相關階段的收尾動作，不是可選項。

⚠️ **每個階段都要跑 `npm run test:coverage`，四項門檻一項都不准降**（審查 N1）。
理由是 `npm run check`（＝ pre-commit 跑的那個）**不含覆蓋率**——它是
`biome && tsc && vitest && knip`；覆蓋率由 CI 另外跑 `test:coverage` 把關
（`ci.yml`）。**所以本機全綠不等於 CI 綠。**

具體風險不是抽象的：本次要加的正是 `isDesktop ? 卡片 : 表格` 這種三元運算子，
**每一個都是新的 branch**，兩側沒被測到就往下掉——而 `branches` 是四項裡
餘裕最小的一項（2026-08-07 已收緊兩次，門檻 80 / 實測 81.75）。

連帶前置條件：`AdminSetup.tsx` 與 `SystemNotifications.tsx` 目前**零測試檔**，
而階段 4 要在這兩個元件上加新 JSX。它們的測試檔是**前置條件不是可選項**，
已列進階段 4 的測試落點。（`SystemAlerts.tsx` 不在此列——develop 已補 8 條。）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 殼層與觸控原語：TabsList 兩列（P1）、標題字級、`checkbox` 熱區（P13） | `src/components/AdminDashboard.test.tsx`（新檔，jsdom）＋ `e2e/test_admin_mobile_layout.py`（既有） | 五個 TabsTrigger 皆在文件中且可點（jsdom）；**TabsList 在 375px 下實測分兩列**（`count_rows`，刪掉 `test_admin_tabs_wrap_to_two_rows_at_375px` 的 xfail marker）；**checkbox 的實際可點區實測 ≥44px**（`viewport_fit` 量盒子，不是斷言剛打進去的 class 字串）；**可見方框仍是 16px**（5 個會員端頁面視覺零變化）；`npm run test:coverage` 四項門檻不降 |
| 2 | 提領管理手機版：卡片列表（P2）、工具列換行（P3）、作業面板摺疊（P4）、Dialog 寬度與雙圖（P5/P6） | `WithdrawalManagement.test.tsx`（既有檔擴充，`stubMediaQuery(false)`）＋ `e2e/test_admin_mobile_layout.py` | 手機：無 `<table>`、每筆有會員＋金額＋狀態＋操作；桌面：既有 26 條測試全綠不改；**IdCardDialog 左右安全邊距實測 ≥8px、雙圖實測垂直堆疊**（刪掉那兩條 xfail marker）；**巡檢的 `/admin`、`#id-card-dialog`、`#history-dialog` 三條 `known_overflow` 刪除**；手機點卡片能切換就地展開的那一筆（釘住 F1 的修法：`setActiveId` 在手機仍有寫入路徑）；`test:coverage` 四項門檻不降 |
| 3 | 會員管理手機版：卡片列表（P7）、搜尋列換行（P8）、詳情 `dl` 單欄（P9） | `MemberManagement.test.tsx`（既有檔擴充） | 手機：每位會員一張卡且三顆操作鍵可達（≥44px 由量測釘住，**拇指熱區位置屬人工目視驗收**——見 review.md 的 F12）；桌面測試不動；**巡檢的 `#members`、`#member-sheet` 兩條 `known_overflow` 刪除**；`test:coverage` 四項門檻不降 |
| 4 | 系統告警與公告手機版：告警卡片（P10）、header 換行（P11）、公告列表項（P12）、**公告內文長網址斷行（P15）**、**管理員設置的 Email 列（P16）** | `src/components/admin/SystemAlerts.test.tsx`（**develop 已補 8 條，改為擴充**）＋ `SystemNotifications.test.tsx`（新檔）＋ `AdminSetup.test.tsx`（新檔） | 手機：告警訊息全文可讀、`context` 預設收合；標記已處理可點；**巡檢的 `#system-alerts`、`#announcements`、`#admin-setup` 三條 `known_overflow` 刪除**；`test:coverage` 四項門檻不降 |
| 5 | 收尾：確認棘輪真的往少的方向走了 | `e2e/test_overflow_sweep.py`、`e2e/test_admin_mobile_layout.py` | **admin 相關的 8 條 `known_overflow` 全數刪除**、**3 條 xfail marker 全數刪除**，且 `cd e2e && pytest` 全綠——任何一條沒清掉就代表該階段沒做完；`npm run check:full` 全綠 |

**階段 5 已經不是「補巡檢能力」了**（那是 M1 做掉的），而是**驗收棘輪歸零**。
原規劃寫的 `post_nav` 掛鉤在合併 develop 時改用了他們的命名 `after_load`
（同一個想法被獨立實作了兩次），路由也從 20 條擴到 27 條。

**分頁定址的取捨（原樣保留）**：另一條路是讓分頁變成 URL 可定址
（`/admin?tab=members`），巡檢就能直接導頁。那確實更好（可深連結、重整不掉
分頁），但它改的是產品行為而非版面，**超出本規劃的 RWD 範圍**，故走
`after_load`。若人審認為值得，應另開一個 feature，不要塞進這裡。

---

## 6. 開放問題（等人裁決，禁止腦補）

- [ ] **Q1（必答）：W8 的行動端邊界要不要動？**
  現況 `WithdrawalManagement.tsx:167-169` 刻意在手機隱藏「標記已匯款」與
  「批次標記已匯款」，理由是「要同時開著網銀」；同一段註解下一句寫的是
  「退件與代為完成不鎖——那是客服接到電話當下就該能處理的事」。
  也就是說「手機上一筆 `pending` 提領唯一可執行的操作是退件（destructive）」
  **是原作者權衡過的設計，不是意外的疏漏**。需求說「讓 ADMIN 在手機上很好
  操作」，可能是也可能不是指要重新評估這個既有設計。
  三個選項：(a) 維持現況（本規劃的預設假設，RWD 不改行為邊界）；
  (b) 解鎖單筆「標記已匯款」、批次仍鎖桌面；(c) 全部解鎖。
  **未裁決前一律走 (a)。** 選 (b)/(c) 要同步改規格書 §13 與 W8 的原始理由。

- [ ] **Q2：手機卡片要不要保留「勾選」？**
  勾選唯一的下游是批次匯款，而批次在手機是鎖住的（Q1(a) 下）。留著＝畫面上
  有一個按了沒有用的控制項；拿掉＝Q1 改判時要再加回來。傾向**留著但只在
  `isDesktop` 下渲染**，與批次按鈕同進退。

- [ ] **Q3：§7 的偏離（JS 判定取代 CSS 雙套版面）是否接受？**
  接受的話，`ui-ux-guidelines.md` §7 要在同一個 PR 補上判準（見 §3）。

---

## 7. 風險與回滾

| 風險 | 最壞情況 | 對策 |
|---|---|---|
| 雙套版面 = 兩份真相 | 日後新增一個欄位只加到桌面表格，手機卡片悄悄缺資訊 | 手機卡片與桌面列**共用同一組 handler 與同一個 record 物件**，欄位差異靠測試釘住（每階段的驗證標準都要求手機版含關鍵欄位） |
| `useMediaQuery` 相依 | 測試環境缺 `matchMedia` → 整檔炸掉 | `stubMediaQuery` 已是現成樣板（`WithdrawalManagement.test.tsx:24`），新測試檔一律在 `beforeEach` 掛上 |
| 既有 975 行 admin 測試誤紅 | 改版把桌面行為也改掉了卻沒發現 | 桌面既有測試**一行都不准改**；要改代表改到了桌面行為，那就不是 RWD 而是改需求，退回人審 |
| `checkbox` 觸控改動影響其他頁 | 5 個會員端頁面（`WithdrawalProcess`／`JoinReferralProgramDialog`／`CompleteProfile`／`CreateServiceProvider`／`EditServiceProvider`）的 checkbox 外觀走樣，而它們不在 U1–U6 任何一條故事裡 | **改熱區、不改可見尺寸**——`pointer-coarse:` 的透明 `before:` 偽元素撐出 44×44，可見方框維持 `size-4`。這 5 頁的**視覺零變化**，blast radius 歸零，因此不需為它們補回歸驗證（審查 F4／Q5 因此消解）。驗收量的是**實際可點區**（`layout_probe.viewport_fit`，真瀏覽器量盒子），不是 class 字串 |
| 分頁兩列擠不下 | 中文標籤在 3 欄下仍溢出 | jsdom 測試只驗結構、量不出真實版面，但**不再是唯一防線**：`test_admin_mobile_layout.py` 在真瀏覽器量 TabsList 的列數、溢版巡檢量 `/admin` 是否畫到框外，兩者都會擋 CI。擠不下就退回 2 欄三列（仍優於現況的橫向捲動） |
| 巡檢量出「假的乾淨」 | 一條路由被誤標成上鎖，實際上要守的東西從未進 DOM，退化了也沒人知道 | 已發生過三次（系統告警的測資太弱、管理員設置的 mock 少回 `userName`、公告管理給空清單），三條都已補測資並標為債務。上鎖前的兩層自檢寫在 `e2e/README.md`：**mock 形狀要與後端一致**、**清單不能是空的** |

**回滾**：純前端版面改動，`git revert` 該次 merge commit 即可，
無 migration、無資料遷移、無不可逆步驟。每階段獨立成 commit，可單階段回退。
