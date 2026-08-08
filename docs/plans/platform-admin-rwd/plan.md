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
| U4 | 管理員在手機上查會員、停權／恢復、授予／撤銷管理員 | 每位會員一張卡，**只有一顆**操作鍵（查看）在拇指可及處且 ≥44px；停權／恢復與授予／撤銷管理員**都在詳情面板內**（見 §4.1 的註記） |
| U5 | 管理員在手機上看得懂系統告警並標記已處理 | 告警訊息完整可讀、`context` JSON 不撐爆版面 |
| U6 | 管理員在手機上發布／刪除公告 | 表單欄位單欄堆疊，公告列表的標題與 badge 不互相擠壓；**公告內文含長網址時不撐破版面（P15）** |
| U7 | 管理員在手機上看得懂「管理員設置」分頁的帳號資訊 | 長 Email 不撐破版面（P16 實測 +119px）——規格書 §13 的五個模組裡，只有這個模組原本沒有任何故事覆蓋 |

### 不做什麼（明確排除）

- **不動任何後端**：無 API 變更、無 migration、無 RLS 調整。這是純前端版面工作。
- **不動 `/admin/verify`**（掃碼核身）：它本來就是為全螢幕相機設計的獨立路由。
- **預設維持 W8 的行動端權限邊界**（手機隱藏「標記已匯款」）——**這條與清單其他項不同，它是 Q1 的預設值不是定案**，見 §6 Q1。
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
| `src/components/AdminDashboard.tsx` | 頂層 TabsList 手機版排法 |
| `src/components/admin/WithdrawalManagement.tsx` | 表格→手機卡片、工具列換行、作業面板、`IdCardDialog` 寬度 |
| `src/components/admin/MemberManagement.tsx` | 表格→手機卡片、搜尋列換行、詳情 Sheet 的 `dl` 欄數 |
| `src/components/admin/SystemAlerts.tsx` | 表格→手機卡片、CardHeader 換行 |
| `src/components/admin/SystemNotifications.tsx` | 公告列表項目的標題／badge 換行、公告內文 `break-words`（P15） |
| `src/components/admin/AdminSetup.tsx` | 帳號資訊列（label/value）長 Email 換行（P16，**實測 +119px**） |
| `src/components/ui/checkbox.tsx` | 新增 **opt-in 的 `touchTarget="expanded"` variant**（預設行為不變，見 §4.1「觸控」） |
| `src/components/admin/WithdrawalCardList.tsx` | **新檔**：手機卡片列表抽成子元件（審查 F10）——`WithdrawalManagement.tsx` 已 849 行，再疊一整套卡片會身兼「業務邏輯＋兩套完整 UI」。props 接住 record 與既有 handler，型別強制「共用同一組 handler」 |
| `src/hooks/__tests__` 或 `src/test-utils` | **新檔**：抽出共用的 `stubMediaQuery`（審查 F9）——否則階段 2–4 的測試檔各自重貼一份，正是 `useMediaQuery.ts` 檔頭註解點名要避免的模式 |
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

> **人審已裁決:接受這個偏離（Q3(a)）。** `ui-ux-guidelines.md` §7 要在同一個
> PR 補上判準——準則失真等於 `plan-reviewer-uiux` 在對照錯的規則。
>
> ⚠️ **判準只能用理由 2（DOM 成本）與理由 3（可測試性）立論，不要照抄理由 1**
> （審查 F8）:「同一檔案裡一半 CSS 一半 JS 是兩套真相」**只在
> `WithdrawalManagement` 成立**（它已有 W8 的 `isDesktop`）;
> `MemberManagement` / `SystemAlerts` 目前完全沒有既有 JS media 邏輯，
> 對這兩檔套用理由 1，等於用另一個檔案的既存包袱正當化「無中生有」引入
> `useMediaQuery`。判準寫成通則時若照抄理由 1，未來會被套用到不成立的地方。

> **N3 的處置紀錄**（人審裁決:刪）:原本 §3 與階段 1 都列了「標題區字級」，
> 但 §4.0 沒有對應證據項。實測三條證據一致指向「沒壞」——`AdminDashboard.tsx:102`
> 的標題列已經是 `flex flex-wrap`（按鈕在 375px 自己掉行）、「平台管理」四字在
> `text-3xl` 下約 120px、`/admin` 巡檢路由的 `known_overflow` 列的是工具列與
> 統計卡而**標題區不在發現裡**。已從 §3 與階段 1 移除，不留一個沒有問題可修的承諾。

### 效能／安全

- 效能：**相對於 CSS 雙套版面**（`md:hidden` / `hidden md:*` 同時掛兩棵樹），
  JS 擇一渲染在手機端少掛一棵樹。**這是與另一個方案比較，不是與現況比較**
  ——相對現況，卡片把每個欄位拆成 label + value 兩個節點，一張提領卡的節點數
  很可能**多於**一列 `<tr>`，本規劃未量測，不做宣稱。
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
| P5 | 同上 `:68` `IdCardDialog` | `DialogContent className="max-w-3xl"` | twMerge 讓 `max-w-3xl` **蓋掉** dialog 原語的行動端護欄 `max-w-[calc(100%-2rem)]`（`dialog.tsx:41`）→ **失去左右各 1rem 的安全邊距、對話框貼齊螢幕邊緣**。⚠️ 初版寫的「寬 768px、左右溢出視窗」**經實測不成立**——`w-full` 在 `fixed` 元素上已依視窗定寬 375px，`max-w-3xl`（768px）比它大所以不生效。診斷與修法不變，錯的只有後果描述（審查 F7，M1 量測證實）|
| P6 | 同上 `:82` 身分證雙圖 | `grid grid-cols-2` 無斷點 | 每張約 160px 寬，證件上的字**看不清**——而看清楚正是審核的實質工作 |
| P7 | `MemberManagement.tsx:378` 會員表格 | 8 欄 + 末欄一顆操作鍵（原為三顆，見 §4.1 註記） | 同 P2；操作鍵要捲到最右才點得到 |
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
  操作鍵（退件、代為完成；「標記已匯款」依 Q1 決定）/ 身分證照片 / 歷史。
  **勾選 checkbox：依 Q2 決定，預設不渲染**（Q2 裁決為「只在 `isDesktop` 下渲染」，
  所以手機卡片沒有這一項）——比照 Q1 明標，不要用「清單裡沒列」來默認裁決（審查 R9）
- 會員卡：姓名 / Email / 電話 / 會籍 badge / 角色 badge / 狀態 badge /
  刊登數 / **一顆**操作鍵（查看）

  > ⚠️ **前提已變更（本規劃書開工前）**：原本寫的是「三顆操作鍵」。停權／恢復
  > 與設為／撤銷管理員**都已移出列表**，改放進詳情 Sheet 底部的「管理」區，
  > 共用同一條路徑（同一個 `MemberAction`、同一個確認框、同一個執行器）；
  > 除「恢復」外一律走確認框。
  >
  > 判準不是頻率而是**動作在改什麼**：改一筆資料的動作可以留在列上（該看的
  > 欄位整列都在），改一個人狀態的動作一律進詳情面板（做這種判斷之前該先看
  > 清楚他是誰）。停權與授予管理員同屬後者。⚠️ **`WithdrawalManagement` 的
  > 「退件與代為完成不鎖」先例不轉移到這裡**——提領台改的是一筆交易，不是
  > 一個人。準則全文見 `ui-ux-guidelines.md` §11。
  >
  > 對本規劃的影響：
  > - 卡片只剩一顆鍵，密度與熱區問題大幅簡化
  > - 詳情 Sheet 底部多一個「管理」區（兩列切換鍵＋錯誤訊息位）
  >   ——**P9 的 `dl` 單欄改動要把它一起算進面板高度**
  > - 手機卡片的資訊量不得因此退化：`suspended` 與 `isAdmin` 現在只剩 badge
  >   在傳達，§7「不得退化到只剩照片+名字」在這裡要特別留意
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

**欄寬與標籤寬皆為實測**（375px、真瀏覽器、與 app 同一份字型堆疊）：

| | 實測 |
|---|---|
| `main` 內容寬（`App.tsx:294` 的 `container px-4`，兩側 32px） | **343px** |
| 三欄 track（再扣 `TabsList` 的 `p-[3px]` 6px） | **112.3px** |
| 扣 `TabsTrigger` 的 `px-2`＋border（18px）後可放文字 | **94.3px** |
| 「獎金提領管理」`text-sm` / `font-medium` | **84px** |

`84 < 94.3` → **塞得下，餘裕 10.3px（12%）**，五個分頁 3+2 兩列全部可見，P1 消失。

同一份量測也解釋了 `AdminDashboard.tsx:118-121` 註解當初為何退回橫向捲動：
五欄的 track 是 **67.4px**、可放文字僅 **49.4px**，遠小於 84px。（該註解寫的
「約 69px」正是這個 track；它估的「需要約 100px」則是高估，真值 84px——結論
不受影響。）**兩列的可放文字空間是五欄的 1.9 倍。**

⚠️ 餘裕只有 10.3px，而字型在不同環境會變。所以驗收不能只數列數——見下方警語。

⚠️ 連帶檢查：`TabsTrigger` 帶 `h-[calc(100%-1px)]`（`tabs.tsx:53`），
在 `h-auto` 容器下百分比高度的解析**只有真瀏覽器確認得了**——所以階段 1
的驗收要量 `count_rows`，不是斷言 class 字串。

⚠️ **但 `count_rows` 還不夠**：`grid-cols-3` 底層是 `repeat(3, minmax(0, 1fr))`，
格子寬度被鎖在 track 寬、不會被內容撐開，所以標籤放不下時是 **ink overflow**
（疊到隔壁分頁），**不改變元素自己的 `getBoundingClientRect()`**——`count_rows`
只按 `top` 座標分群，照樣回報 `rows == 2`；溢版巡檢也抓不到「畫到隔壁欄位
而非畫出頁面外」。§7 寫的備案「擠不下就退回 2 欄三列」因此**沒有任何機制
偵測什麼時候該退**。階段 1 要另補一支「逐 `TabsTrigger` 的 `scrollWidth`
是否超出自身 `clientWidth`」的量測。

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

**觸發方式：`Collapsible` 的顯式 trigger，不做整卡可點**（審查 R5）。
卡片內放一顆「匯款資訊」展開鍵，`setActiveId` 寫在它的 `onClick`。
三個理由：

1. `Collapsible` 的 trigger 是真正的 `<button>`，**語意與鍵盤可達性自帶**
   （`role`／`tabIndex`／Enter・Space 都不用自己刻）。桌面既有的
   `<TableRow onClick>`（`:768`）沒有任何鍵盤語意，是**既有 a11y 債**——
   既有債務不是把同一個反模式複製進一個全新檔案的理由
   （`ui-ux-guidelines.md` §9「不要再添新債」）。
2. 同目錄的 `IdReviewQueue.tsx`（已是卡片式、本規劃明文不需改動）
   **一律用顯式 `<Button>`，全 admin 沒有整卡可點的先例**。
3. 卡片內還有退件／代為完成／查看歷史三顆鍵，整卡可點容易誤觸。

active 狀態指示：展開態本身就是指示（`Collapsible` 的 open state），
不需要另做桌面那套 `data-[state=selected]:bg-muted`。

**五欄的 markup 要與桌面作業面板共用一份 render**（審查 R6）：
「會員≈戶名、匯款金額、收款銀行＋帳號」三欄與提領卡的基礎欄位字面重複，
各自手刻會在同一個檔案裡長出兩份會各自演化的 JSX——這正是
`useMediaQuery.ts:7-9` 檔頭註解點名要避免的模式。§7 原本的共用承諾只涵蓋
handler 與 record，這裡把 markup 也納入。

**對話框**：`IdCardDialog` 改 `max-w-[calc(100%-2rem)] sm:max-w-3xl`（P5）、
雙圖改 `grid-cols-1 sm:grid-cols-2`（P6）。

**公告內文（P15）**：`SystemNotifications.tsx:263` 的 `<p>` 補 `break-words`
——長 token（實務上是網址）不斷行，實測撐破 +153px。

**管理員設置的帳號資訊列（P16）**：`AdminSetup.tsx:147-163` 的三列
`flex items-center justify-between` 在手機改為標籤在上、值在下（或讓值
`break-all` 並允許換行）。Email 來自 Supabase Auth、長度無上限，實測 +119px。

**觸控**：`checkbox.tsx` 加一個 **opt-in 的 variant**
（`<Checkbox touchTarget="expanded">`），**預設行為完全不變**；只有 admin 的
提領勾選用它。variant 的內容是「擴大可點區、不改可見尺寸」——透明的 `before:`
偽元素撐到 44×44，可見方框維持 `size-4`：

```
pointer-coarse:relative
pointer-coarse:before:content-['']
pointer-coarse:before:absolute
pointer-coarse:before:-inset-[14px]
```

⚠️ **`content-['']` 缺不得**（審查 R1）。CSS 規範下 `::before` 的 `content`
初始值是 `normal`（計算值等同 `none`），不生成渲染盒，`absolute` 與 `inset`
全部無效。本專案 Tailwind **v4.1.3** 的 `preflight.css:7-16` 對
`*, ::after, ::before` 只重置 `box-sizing/margin/padding/border`，**沒有設
`content`**（v3 的 preflight 有 `--tw-content: ''`，v4 拿掉了）；全站
`before:` / `content-[` 用量目前是 **0**，沒有樣板可抄。這與 F2 漏掉 `grid`
是同一種失敗模式——**照字面實作會是完全無聲的 no-op**。

**為什麼是 opt-in 而不是改預設**（審查 R2，這條推翻了初版的裁決理由）：
`checkbox.tsx` 被 5 個會員端頁面共用，其中
`CreateServiceProvider.tsx:413` 與 `EditServiceProvider.tsx` 的服務區域選擇器是
`grid grid-cols-2 gap-2` 逐一渲染（`TAIWAN_REGIONS`：台北市 12 區、新北市更多，
常態 6–15 列）。每列高度由 `text-sm` 的 line-height 決定 ≈ 20px、`gap-2` = 8px，
**相鄰列中心距約 28px**；44px 熱區上下各延伸 22px，**重疊 16px**。使用者想勾
第 5 區、手指落在交界帶會勾到第 4 或第 6 區，**沒有錯誤訊息、兩個方框看起來
都正常**，而它寫進的是 `districts`——決定這個服務者在哪些地區被搜尋到。
**這是資料正確性問題，不是外觀問題。**

初版的裁決理由（「可見方框不變 → 視覺零變化 → blast radius 歸零 → 不需回歸
驗證」）**只證明了看起來沒事，沒有證明點起來沒事**，而後者正是本節宣稱要達到
的目標。降低 inset 也救不了：28px 列距下不重疊的上限是每邊 6px，熱區只有 28px，
**達不到 44px**。改成 opt-in 之後，那 5 頁**一行都不改**，blast radius 才是
真的歸零，而不是靠一個站不住的論證宣稱歸零。

原語層的觸控債務（那 5 頁的 checkbox 仍是 16px）屬**既有問題**，不在本 feature
範圍內，記進 `docs/plans/friction-log.md`。

**驗收改用點擊命中測試，不是量盒子**（審查 R1 第二點）：
`layout_probe.viewport_fit` 是 `document.querySelector(sel).getBoundingClientRect()`
——偽元素不在 DOM 裡選不到，且 `position:absolute` 的偽元素不會撐大宿主的
border box，所以它量到的永遠是那個 16px 方框。改成在 -14px 偏移的四個角落
`elementFromPoint`，確認仍命中 checkbox。命中測試優於讀
`getComputedStyle(el, '::before')`——後者仍是在檢查「有沒有寫對」，
前者檢查「按得到嗎」，對這一整類錯誤免疫。

**外加「相鄰熱區不相交」的量測**（審查 R12）：目前 body row 之所以不重疊，
是因為每列都有兩顆 `size="sm"` 按鈕（`button.tsx:28` 的
`pointer-coarse:min-h-[44px]`）把列高撐到約 60px——這是**其他元件的副作用，
不是被釘住的不變量**；表頭列 `TableHead` 是固定 `h-10`（40px），44px 熱區會
上下各溢出 2–4px。日後任一顆按鈕改小，安全邊界會在沒有任何 CI 訊號的情況下
消失，而下游是 P13 點名的「不可回退的批次匯款」。`layout_probe` 補一支比對
兩個 selector 矩形是否相交的函式。

連帶：checkbox 所在的 `<TableCell>` 位在整列可點的 `<TableRow onClick>` 裡
且沒有 `stopPropagation`——擴張後的熱區命中誰，實作時要一併處理。

**Q2 的交互（必讀）**：Q2 裁決為「勾選只在 `isDesktop` 下渲染」，
所以**手機根本不會渲染這個 checkbox**——P13 的動機在手機上落空，
本項實際適用的是 **≥768px 的觸控平板**（`isDesktop` 是寬度判準不是輸入判準，
見 Q4）。仍然值得做（平板上批次匯款一樣不可回退），但範圍要講清楚。

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
| 1 | 殼層與觸控原語：TabsList 兩列（P1）、`checkbox` 的 opt-in 觸控 variant（P13）、抽出共用 `stubMediaQuery`（F9） | `src/components/AdminDashboard.test.tsx`（新檔，jsdom）＋ `e2e/test_admin_mobile_layout.py`（既有，需擴充 `layout_probe`:命中測試＋熱區相交） | 五個 TabsTrigger 皆在文件中且可點（jsdom）；**TabsList 在 375px 下實測分兩列**（`count_rows`，刪掉 `test_admin_tabs_wrap_to_two_rows_at_375px` 的 xfail marker）；**逐 `TabsTrigger` 的 `scrollWidth` 不超出自身 `clientWidth`**（審查 R4:`grid` 的 ink overflow 疊到隔壁分頁時 `count_rows` 照樣回報兩列，餘裕只有 10.3px）；**checkbox 的可點區以點擊命中測試驗證**（-14px 四角 `elementFromPoint` 仍命中 checkbox——**不是** `viewport_fit`，那量不到偽元素）；**相鄰互動元件熱區不相交**（審查 R12）；**`ui/checkbox.tsx` 的預設渲染一個位元組都沒變**（5 個會員端頁面零回歸，由 opt-in variant 保證）；`npm run test:coverage` 四項門檻不降 |
| 2 | 提領管理手機版：卡片列表（P2）、工具列換行（P3）、作業面板摺疊（P4）、Dialog 寬度與雙圖（P5/P6） | `WithdrawalManagement.test.tsx`（既有檔擴充，`stubMediaQuery(false)`）＋ `e2e/test_admin_mobile_layout.py` | 手機：無 `<table>`、每筆有會員＋金額＋狀態＋操作；桌面：**既有測試全綠、一行都不准改**（不寫條數——這個數字已經漂過兩次，而真正的閘門是「不准改」，不是條數）；**IdCardDialog 左右安全邊距實測 ≥8px、雙圖實測垂直堆疊**（刪掉那兩條 xfail marker）；**巡檢的 `/admin`、`#id-card-dialog`、`#history-dialog` 三條 `known_overflow` 刪除**；手機點 `Collapsible` trigger 能切換就地展開的那一筆（釘住 F1 的修法：`setActiveId` 在手機仍有寫入路徑），且該 trigger 可鍵盤操作（審查 R5）；**`isDesktop` 由 true 轉 false 時 `selected` 被清空**（審查 R7:否則「已選取 N 筆」橫幅還在，但看不到是哪幾筆、也無法逐筆取消）；`test:coverage` 四項門檻不降 |
| 3 | 會員管理手機版：卡片列表（P7）、搜尋列換行（P8）、詳情 `dl` 單欄（P9，**含面板底部的「管理」區**） | `MemberManagement.test.tsx`（既有檔擴充，**已有 25 條，其中 11 條是動作位階改版時補的——擴充不得改動它們**） | 手機：每位會員一張卡且**唯一**的操作鍵（查看）可達；停權與管理員切換在面板內（見 §4.1 註記）。**驗收明確切分**（審查 F12）:「存在性與 ≥44px」由測試機械把關；**「拇指可及處」是人因判準、jsdom 與探針都量不出，屬人工目視驗收**——U4 的複合驗收標準不假裝全部可自動驗證；桌面測試不動；**巡檢的 `#members`、`#member-sheet` 兩條 `known_overflow` 刪除**；`test:coverage` 四項門檻不降 |
| 4 | 系統告警與公告手機版：告警卡片（P10）、header 換行（P11）、公告列表項（P12）、**公告內文長網址斷行（P15）**、**管理員設置的 Email 列（P16）** | `src/components/admin/SystemAlerts.test.tsx`（**develop 已補 8 條，改為擴充**）＋ `SystemNotifications.test.tsx`（新檔）＋ `AdminSetup.test.tsx`（新檔） | 手機：告警訊息全文可讀、`context` 以 `Collapsible` 預設收合；標記已處理可點；**U7 的驗收（長 Email 不撐破）由 `AdminSetup.test.tsx` ＋巡檢共同釘住**；**`SystemAlerts` 的載入態順手從置中 spinner 換成 `Skeleton`**（審查 F14，童子軍原則——該檔本來就在本階段）；**巡檢的 `#system-alerts`、`#announcements`、`#admin-setup` 三條 `known_overflow` 刪除**；`test:coverage` 四項門檻不降 |
| 5 | 收尾：確認棘輪真的往少的方向走了 | `e2e/test_overflow_sweep.py`、`e2e/test_admin_mobile_layout.py` | **admin 相關的 8 條 `known_overflow` 全數刪除**、**3 條 xfail marker 全數刪除**，且 `cd e2e && pytest` 全綠——任何一條沒清掉就代表該階段沒做完；`npm run check:full` 全綠 |

**階段 5 已經不是「補巡檢能力」了**（那是 M1 做掉的），而是**驗收棘輪歸零**。
原規劃寫的 `post_nav` 掛鉤在合併 develop 時改用了他們的命名 `after_load`
（同一個想法被獨立實作了兩次），路由也從 20 條擴到 27 條。

**分頁定址的取捨（原樣保留）**：另一條路是讓分頁變成 URL 可定址
（`/admin?tab=members`），巡檢就能直接導頁。那確實更好（可深連結、重整不掉
分頁），但它改的是產品行為而非版面，**超出本規劃的 RWD 範圍**，故走
`after_load`。若人審認為值得，應另開一個 feature，不要塞進這裡。

---

## 6. 開放問題（**已全數裁決**）

<!-- 這一節原本是逃生口。四題都已由人審裁決,保留原始選項與理由是刻意的
     ——日後回頭看要知道「當初有哪些選擇、為什麼選這個」,而不只是結論。 -->

- [x] **Q1：W8 的行動端邊界要不要動？→ 裁決 (a) 維持現況**
  現況 `WithdrawalManagement.tsx:167-169` 刻意在手機隱藏「標記已匯款」與
  「批次標記已匯款」，理由是「要同時開著網銀」；同一段註解下一句寫的是
  「退件與代為完成不鎖——那是客服接到電話當下就該能處理的事」。
  也就是說「手機上一筆 `pending` 提領唯一可執行的操作是退件（destructive）」
  **是原作者權衡過的設計，不是意外的疏漏**。
  選項是 (a) 維持現況／(b) 解鎖單筆「標記已匯款」／(c) 全部解鎖。
  **裁決 (a)**——RWD 不順手改金流操作的權限邊界；要改應該是獨立的需求決策，
  且要同步改規格書 §13 與 W8 的原始理由。

- [x] **Q2：手機卡片要不要保留「勾選」？→ 裁決：留著，但只在 `isDesktop` 下渲染**
  勾選唯一的下游是批次匯款，而批次在手機是鎖住的（Q1(a) 下）。與批次按鈕同進退。
  **配套處置規則（審查 R7）**：`useMediaQuery` 是即時訂閱 `change` 事件
  （`useMediaQuery.ts:16-23`），桌面勾選幾筆後縮小視窗會讓勾選框消失、
  但 `selected` 不會被清空（唯一清空點是 `fetchWithdrawals` 成功後，`:210`），
  「已選取 N 筆」橫幅（`:699-711`）依然顯示卻無法逐筆取消。
  → **`isDesktop` 由 true 轉 false 時清空 `selected`。**

- [x] **Q3：§7 的偏離（JS 判定取代 CSS 雙套版面）是否接受？→ 裁決：接受**
  `ui-ux-guidelines.md` §7 要在同一個 PR 補上判準，**且只用理由 2／3 立論**
  （見 §3 的警語與審查 F8）。
  **若當初否決的成本**（審查 R10 要求記錄）：§3 的版面切換方式、§4.1 的三個
  列表→卡片骨架、§5 全部五個階段的測試計畫都建立在 `useMediaQuery` 擇一渲染
  上，否決等於這三節幾乎整份重寫——這與 Q1／Q2 那種「否決了只要局部調整」
  的風險量級不同，所以它是必答題而不是可以擱置的開放問題。

- [x] **Q4：「手機」的裝置判準要不要從寬度改成觸控偵測？→ 裁決：本次不改**
  切版判準是 `useMediaQuery('(min-width: 768px)')`——**寬度，不是輸入方式**，
  所以 768px 寬的觸控平板會被判為 `isDesktop`、看得到「標記已匯款」，而那顆
  按鈕背後「同時開著網銀」的假設在單一觸控平板上未必成立。
  **這不是本次 RWD 引入的問題**（W8 本來就用同一個判準），改判準會動到既有
  的權限邊界行為——與 Q1(a)「RWD 不改行為邊界」一致，**本次不動**，
  記進 `docs/plans/friction-log.md`；要改另開 feature。
  ⚠️ 連帶影響已寫進 §4.1「觸控」：`pointer-coarse` 的觸控 variant 實際適用的
  正是這批 ≥768px 的觸控平板。

---

## 7. 風險與回滾

| 風險 | 最壞情況 | 對策 |
|---|---|---|
| 雙套版面 = 兩份真相 | 日後新增一個欄位只加到桌面表格，手機卡片悄悄缺資訊 | 手機卡片與桌面列**共用同一組 handler 與同一個 record 物件**，欄位差異靠測試釘住（每階段的驗證標準都要求手機版含關鍵欄位） |
| `useMediaQuery` 相依 | 測試環境缺 `matchMedia` → 整檔炸掉 | `stubMediaQuery` 已是現成樣板（`WithdrawalManagement.test.tsx:24`），新測試檔一律在 `beforeEach` 掛上 |
| 既有 975 行 admin 測試誤紅 | 改版把桌面行為也改掉了卻沒發現 | 桌面既有測試**一行都不准改**；要改代表改到了桌面行為，那就不是 RWD 而是改需求，退回人審 |
| `checkbox` 觸控改動影響其他頁 | 5 個會員端頁面（`WithdrawalProcess`／`JoinReferralProgramDialog`／`CompleteProfile`／`CreateServiceProvider`／`EditServiceProvider`）的 checkbox 誤觸或外觀走樣，而它們不在 U1–U7 任何一條故事裡 | **改成 opt-in variant，預設渲染一個位元組都不變**（審查 R2 推翻了初版「視覺零變化即安全」的理由——`CreateServiceProvider.tsx:413` 的服務區域選擇器列距僅 28px，44px 熱區會重疊 16px，誤觸寫進 `districts` 是資料正確性問題）。那 5 頁一行都不改，blast radius 才是真的歸零。驗收量的是**點擊命中**（`elementFromPoint`），不是盒子、更不是 class 字串 |
| 相鄰熱區重疊 | 表頭全選與第一列的 checkbox 熱區相交，點錯了沒有任何訊號，下游是不可回退的批次匯款 | 目前不重疊是**其他按鈕高度的副作用**（每列兩顆 `size="sm"` 帶 `pointer-coarse:min-h-[44px]` 把列高撐到約 60px），不是被釘住的不變量；表頭 `TableHead` 固定 `h-10` 只有 40px。階段 1 補「相鄰互動元件熱區不相交」的量測，把這個隱性依賴變成會擋 CI 的斷言（審查 R12）|
| 分頁兩列擠不下 | 中文標籤在 3 欄下仍溢出 | jsdom 測試只驗結構、量不出真實版面，但**不再是唯一防線**：`test_admin_mobile_layout.py` 在真瀏覽器量 TabsList 的列數、溢版巡檢量 `/admin` 是否畫到框外，兩者都會擋 CI。擠不下就退回 2 欄三列（仍優於現況的橫向捲動） |
| 巡檢量出「假的乾淨」 | 一條路由被誤標成上鎖，實際上要守的東西從未進 DOM，退化了也沒人知道 | 已發生過三次（系統告警的測資太弱、管理員設置的 mock 少回 `userName`、公告管理給空清單），三條都已補測資並標為債務。上鎖前的兩層自檢寫在 `e2e/README.md`：**mock 形狀要與後端一致**、**清單不能是空的** |

**回滾**：純前端版面改動，`git revert` 該次 merge commit 即可，
無 migration、無資料遷移、無不可逆步驟。每階段獨立成 commit，可單階段回退。
