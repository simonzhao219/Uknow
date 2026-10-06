# admin 資料快取（S5／工項 A4）規劃書

> 母計畫：`docs/plans/platform-uiux-redesign/`（plan.md §2.5 根因、§3 A4 四條硬約束；
> construction-plan §3 S5 九條；progress 遺留「S3 審查遺留 → S5」「S4 遺留」）。
> 分支 `feature/admin-data-cache`。施工鷹架，`/tdd-implement` 收尾時整個目錄刪除。
> 行號以 develop `828ad4f` 為準。
>
> - **第二版**：依 `review.md` 第一輪（去重後 P0×1／P1×13／P2×32）與業主裁決 D1–D8 修訂（§8）。
> - **第三版（2026-10-06）**：依第二輪（P0×0／P1×8／P2×27）與業主裁決 E1–E8 修訂（§9）。

**九條對照**：①四條硬約束 → §2.3–§2.7、§3.1、§3.5；②生命週期 → §2.4；③分頁掛載 → §3.2；
④骨架與刷新 → §4.1–§4.3；⑤遺留裁決 → §1.4；⑥測試 → §5；⑦定位器 → §4.5；
⑧文件 → §5 階段 9；⑨風險 → §7。

## 0. 一句話

讓管理員在後台分頁間來回切換時，切回的分頁立刻回到切走前的篩選、顯示上次的資料並在背景
更新，不再每切一次就重等骨架——提領↔會員來回切是 P4 的日常動線（plan.md §2.5）。前提是
快取只在記憶體，而且**快取不讓任何寫入依據比沒有快取時更舊**。

## 1. 使用者需求

### 1.1 依據

- 規格書 §13（後台四模組、導覽列待處理 badge）；plan.md §1 P4（需要即時：系統告警、待審佇列；
  需要快：切換分頁不重新等待）、§2.5、§3 A4。
- `ui-ux-guidelines.md` §5（列表骨架＋`aria-busy`；**重新驗證中的清單降透明度＋`aria-busy`、
  保留舊資料，不要清空**）、§6（三態）、§12.11（重試是唯一出路時用流程鈕、同頁有其他主要動作時
  區塊內重試用次要；兩顆並排次要左主要右、手機等寬；卡片尾靠右）、§13 第 4 條（不先閃 0、
  區塊讀取失敗用中性字）。

### 1.2 驗收情境

1. 首次進 `/admin`：提領的統計、列表（桌機另有匯款作業面板）都是同形骨架，資料到位前不先閃
   「$0／0 筆」。
2. 提領篩「待處理」→ 切到會員 → 切回提領：回到「待處理」，列表與件數**立即**出現、沒有骨架；
   更新中列表 `aria-busy`（慢網路下降透明度）、筆數行接「更新中，暫停操作」，寫入入口、勾選、
   複製、CSV、查看證件／歷史全部停用並說明原因，待匯款總額與匯款作業面板顯示骨架；完成後恢復。
   會員分頁（含「會員列表／證件審核」子分頁）、公告分頁同理。
3. 背景更新失敗：**保留變淡的舊列**，上方寫「更新失敗，以下是 N 分鐘前的資料」並附重試；列上的
   收款銀行／帳號／匯款金額、作業面板、待匯款總額改成骨架，寫入維持停用。沒有任何資料時才是
   中性錯誤字＋重試。
4. 背景更新超過 15 秒仍未回來：同上，提示改成「更新較久，以下是 N 分鐘前的資料」，重新整理恢復可按
   （不自動重送）；沒有任何資料時骨架內寫「更新較久，仍在等待伺服器回應」。
5. 證件審核與系統告警：切回時照舊出骨架（排除清單，§2.5）。
6. 手動「重新整理」：焦點留在鈕上、圖示轉動、報讀「正在更新」→「已更新」（失敗念「更新失敗」）。
7. 退件／標記已匯款／代為完成／批次匯款之後：列表背景重讀、不換骨架。成功回報出現在工具列下方
   （不捲動、播報一次、文字在畫面上只出現一次），焦點落在該筆的列；那一列因重讀離開清單時移到下一列。
   動作失敗也出現在工具列下方、捲進視線（不被導覽列蓋住）並取得焦點，列表自動背景重讀一次；
   網路中斷等結果不明的失敗改說「網路中斷，結果不明，請待列表更新後確認該筆狀態」。
8. 匯款作業面板與四個確認框寫「資料更新於 N 分鐘前」（不到 1 分鐘寫「剛剛更新」）；超過 10 分鐘改成
   提示「建議先重新整理」。
9. CSV 匯出只在資料確認後可按；匯出中其他三個分頁停用、工具列下方寫「匯出中（已收集 N / M 筆），
   完成前無法切換分頁，離開此頁會中止」；匯出失敗或超過上限時列表照常顯示；離開 `/admin` 就停止、
   不下載。
10. 離開 `/admin`、登出、session 過期、任何後台讀取回 403 之後：快取清空，再進來重新出骨架。
11. `sessionStorage`／`localStorage` 從未寫入任何 admin 資料。

### 1.3 不做

- 不動 API、資料庫、`supabase/functions/`、`src/utils/apiClient.ts`、`AdminRoute.tsx`、`App.tsx`。
- 請求時序：每次掛載照舊各打一次，不預載、不輪詢、不加視窗 focus 重抓、更新慢也不自動重送。
  例外四處，都只在失敗或競態時多一次讀取：(1) 單筆提領動作失敗後背景重讀（D5）；(2) 證件審核動作
  失敗後背景重讀（E4）；(3) 會員詳情「重開在途」補讀（prompt 第 5 條）；(4) 列表讀取落地時發現已被
  寫入失效，補讀一次（E3）。
- 不快取：會員詳情、證件審核佇列、系統告警、導覽列 badge、空結果、會員搜尋結果、帶日期或搜尋
  條件的提領查詢（§2.5）。切回時會員搜尋字不保留。
- 不碰 `DataCacheContext` 與會員區 hook（S7 範圍，§2.4）。
- 不把 `SystemNotifications`／`SystemAlerts` 的取數搬進 `AdminDashboard`（§3.1，登記遺留）。
- 不加匯出「取消」鈕（E6：離開此頁即中止，進度字寫明）；不改導覽列 badge 的取數時機（登記遺留）。
- 讀取失敗的錯誤字維持現況的原文（讀取沒有「結果不明」的問題）；固定文案只用在寫入結果不明時。

### 1.4 承接遺留逐條裁決（第 5 條）

「來源」：**點名**＝S5 開工 prompt 或母計畫遺留點名給 S5；**同類**＝S5 規劃時同類掃描併入；
**審查**＝審查追加；**業主**＝業主裁決。

| 來源 | 遺留／追加 | 裁決 | 落點 |
|---|---|---|---|
| 點名（S3 #9） | 匯出中切分頁雙下載 | **做**：匯出期間其他分頁停用＋進度說明（D4、E6），卸載後收集停止不下載 | §2.10、階段 4c、7 |
| 點名（S3 #10） | 會員頁「載入更多」中送出搜尋的競態 | **做**：請求序號（兩個方向都擋，§2.9） | 階段 1a、5 |
| 同類 | 提領頁載入更多中換篩選、快速連換篩選的晚到覆蓋（`WithdrawalManagement.tsx:199-242` 同樣沒有序號） | **做** | 階段 1a、4a |
| 審查 | 寫入 await 之後才呼叫的 `reload` 用的是點擊當下的舊閉包（`:299-316`、`:265-284`、`MemberManagement.tsx:331,348`） | **做**：`reload` 一律讀當下的身分與取數函式 | §2.2、階段 1a |
| 點名（S3） | CSV 匯出失敗／超上限走 `setLoadError`，整張列表被換成錯誤區 | **做**：動作錯誤改獨立狀態 | §4.3、階段 4c |
| 同類 | 單筆動作失敗（`:311-312`）、批次部分失敗（`:274-276`）同一個病 | **做** | §4.3、階段 4c |
| 審查 | 載入更多失敗與首頁讀取失敗共用 error，已顯示的列被整片換掉 | **做**：`loadMoreError` 獨立 | §2.2、階段 1a |
| 點名（S3） | `AdminToolbar` 重新整理焦點掉 body、沒有狀態宣告 | **做** | §4.2、階段 3 |
| 點名（S3 #15） | `SystemAlerts` 自刻的重新整理鈕（`SystemAlerts.tsx:87-90`） | **做**：改用 `AdminToolbar`（`filter` 選填） | 階段 6 |
| 點名（S3） | 「已匯出 N 筆」在工具列上方造成位移 | **做**：回報移到工具列下方 | §4.3、階段 4c |
| 點名（S3） | 驗收站 2 目視項（放大鏡焦點環、`type="search"` 清除鈕） | **不做**：留在驗收站 2 | — |
| 點名（S4） | `detailSeq` 收斂成一個 hook，含「重開在途」補讀窗口 | **做**：`createLatestRequest`／`useLatestRequest` | §2.9、階段 1a、5 |
| 點名（S4） | `list.reload()` 期間關面板焦點掉 body | **自然消失**（背景重讀不卸載「查看」）；把 S4 TDD 期收窄掉的斷言補回來當證據 | 階段 5 |
| 點名（S4） | `IdReviewQueue` 三處 `name ?? …`（`:116,166,186`） | **做**：退場條件「證件審核下次改動時」成立，改用 `memberLabel` | 階段 5 |
| 審查＋業主（E4） | `IdReviewQueue.act` 沒有 catch，失敗無訊息（`:55-63`） | **做**：錯誤區＋背景重讀一次 | §4.4、階段 5 |
| 業主（D7，原 S2e→S3 孤兒遺留） | 證件審核卡「退回在左、通過在右」，手機等寬、桌機靠右 | **做** | §4.4、階段 5 |
| 審查 | 會員頁取詳情失敗的錯誤框捲動後被 sticky 導覽列蓋住（`MemberManagement.tsx:200`、`Navbar.tsx:94-95`） | **做**：與提領頁同一個修法（`scroll-mt`） | §4.3、階段 5 |
| 同類＋審查 | 公告讀取失敗只彈 toast、列表顯示「尚無公告」（把失敗讀成空） | **做**：補錯誤態（與母計畫 S7 的 F3 三態巡檢重疊，S7 列註記已處理） | §4.1、階段 6 |
| 點名（S4） | 近期提領只有 10 筆、無總筆數 | 不做（後端工項） | — |
| 點名（S4） | `apiClient` 沒有逾時 | 不做（全站工項）；本工項以 15 秒慢更新提示緩解**列表讀取**，會員「查看」鈕的無限轉圈不在其內 | §2.3 |
| 點名（S4） | `ui/dialog.tsx` 關閉鈕名稱是英文「Close」 | 不做（與快取無關） | — |
| 點名（S4） | 停權端點非冪等 | 不做（後端 `/fix-bug`）；它是「會員詳情不快取」的反例之一（§7） | — |

## 2. 系統設計

### 2.1 資料流

- 現況：`AdminDashboard` 定義取數函式、以 props 注入提領與會員兩頁（`AdminDashboard.tsx:19-97`）；
  公告、告警在元件內直接打 `apiClient`。Radix Tabs 只掛 active 分頁，切換＝卸載→重掛→state 歸零→
  重抓→骨架。
- 之後（§3.3）：
  - `usePagedList`（`src/hooks/`，通用）：請求序號、背景重讀、`meta`、確認旗標、`initial` 種子與
    `onLanded` 落地驗證——不知道快取存在。
  - `useAdminList`（`src/components/admin/`）：組合 `usePagedList` 與快取 store——查詢身分與快取槽、
    從 store 讀種子、落地驗證（fence）與寫回、資料時間、資料版本、慢更新、403 整體清空。
  - `createAdminCache()`（`admin/adminCache.ts`）：記憶體 store。
  - `AdminConsole`（`admin/AdminConsole.tsx`，新）：以 `user.id` 為 key 掛的分頁區——建立 store、
    匯出鎖分頁；`AdminDashboard` 只剩頁首、取數函式與 `<AdminConsole key={user.id} …/>`。
  - store 以 `cache` prop 注入提領、會員、公告、告警與 `IdReviewQueue` 五處；告警與證件審核不快取
    （槽恆為 `null`），拿 store 只為了讀取回 403 時能整體清空（§2.3）。
- 取數函式與請求參數不變。

### 2.2 `usePagedList` 契約（通用；型別相容，`reload` 的呈現改變）

- **身分**：呼叫端給的 `deps` 序列化成身分字串（`useAdminList` 傳 `deps: [queryId]`）。`load` 存在 ref，
  **不當 dep**；`reload()`／`loadMore()` 一律讀當下的身分與 `load`——寫入 await 之後才呼叫的舊閉包
  `reload` 也讀新身分、寫新身分。
- **ticket**：每次重讀（掛載、換身分、`reload()`）`begin()` 取新 ticket，記下身分與送出時的戳記
  （§2.3 的整數戳）；`loadMore` 帶當下 ticket。非最新 ticket 的結算**不改任何 state 與旗標**，不呼叫
  `onLanded`。
- **`isConfirmed`**：本身分最新一次**重讀**已成功落地且被 `onLanded` 接受、其後沒有在途的重讀、沒有
  重讀錯誤。載入更多在途、成功、失敗或被作廢都不改它。
- **`isLoadingMore`／`loadMoreError`**：由 ticket 導出——重讀或換身分開始即歸零；以 ref 擋載入更多重入。
- **`canLoadMore`**＝`hasMore && isConfirmed && !isLoadingMore`；`hasMore` 照舊輸出。

| 時機 | 畫面上有**本身分**資料（`initial` 種子或本次已載入） | 沒有 |
|---|---|---|
| 掛載／換身分 | **同一個 render** 換上本身分的種子、`isRevalidating`；立即重讀 | 骨架（`isLoading`）＋讀 |
| `reload()`（手動、寫入後） | 保留列表、`isRevalidating` | 骨架 |
| 重讀成功 | 呼叫 `onLanded`：接受→換新資料、`isConfirmed`；回 `false`（落地前已被失效）→不改確認狀態、**自動再讀一次**（每個 ticket 至多一次） | 同左 |
| 重讀失敗 | **保留舊列**、`error`、`isConfirmed=false`（E2）；`reload()` 仍是背景重讀 | 錯誤態（`error`） |
| `loadMore()` | 只在 `canLoadMore` 時接受；成功接在後面（不呼叫 `onLanded`、不動 `meta`）；失敗寫 `loadMoreError`、列表保留 | — |

- 輸出：`items`、`total`、`meta`、`hasMore`、`canLoadMore`、`isLoading`、`isRevalidating`、`isConfirmed`、
  `error`、`loadMoreError`、`isLoadingMore`、`reload`、`loadMore`。
- `initial`：本身分的種子快照；`onLanded(snapshot, { stamp })`：最新 ticket 的重讀成功落地時呼叫，可回
  `false` 表示不接受。
- 單頁清單（公告、告警）以 `total = items.length` 使用，不會出現「載入更多」。
- 資料時間、資料版本、慢更新不在這一層（E8，§2.3）。

### 2.3 `useAdminList` 與快取 store（約束 a、c）

**查詢身分與快取槽**：型別化 builder 回 `{ id, slot }`——`id` 恆非空（完整查詢序列化），決定何時重讀；
`slot` 是快取鍵，可為 `null`（不讀不寫）。頁面不手組字串。

| builder | `id` | `slot` |
|---|---|---|
| `adminQuery.withdrawals({ status, from, to, search })` | 完整查詢 | 只有 `status`（五種）時有；帶日期或搜尋回 `null` |
| `adminQuery.members({ search })` | 完整查詢 | 只有空白搜尋時有 |
| `adminQuery.announcements()` | 固定 | 固定 |
| `adminQuery.alerts()`／`adminQuery.idReviews()` | 固定 | 恆為 `null` |

**store**（`createAdminCache()`，純記憶體）：

```ts
read(slot): Snapshot | undefined                   // Snapshot = { items, total, meta, fetchedAt }
write(slot, snapshot, stamp): void                 // 空結果＝刪除該槽；戳記早於現有條目或該資源 fence 者丟棄
invalidate(event: AdminMutationEvent): void        // 依對照表（§2.7）刪槽並把該資源的 fence 設為新戳記
fenceOf(resource): number                          // 落地驗證用
readView() / writeView(partial)                    // 切回位置（D3）
open() / dispose()                                 // 成對：dispose 清空資料與 view 並拒絕寫入；open 重新啟用
```

- **整數戳**：模組層單調遞增的整數（`nextStamp()`），請求送出（`begin()` 同刻）與失效都取號——不用
  `performance.now()`（會被粗化、相等是常態、假時鐘下凍結）。規則：寫入呼叫端**先 `invalidate` 再
  `reload`**；比較一律「嚴格小於即較舊」。
- **沒有逐槽刪除的公開介面**：失效只能經對照表，從結構上杜絕手動散清。
- **空結果不留**：落地為空時刪掉該槽原有的非空條目（仍受戳記與 fence 約束）——「目前沒有提領申請」
  不能拿快取當真，舊列也不該殘留。

**`useAdminList({ cache, query, load, pageSize })`**：
- 有 `cache` 且 `slot` 非空時讀種子、落地寫回；`onLanded` 回 `false` 的條件＝請求戳記早於該資源的
  fence（落地前已被寫入失效，E3）——`usePagedList` 隨即自動再讀一次。
- **資料時間**：`fetchedAt` 以 `Date.now()` 記（牆鐘；種子帶原始時間），文字在 render 時計算，並在
  `visibilitychange`／`focus` 時立即重算——裝置休眠時單調時鐘不前進，正好是「切去網銀 App 再回來」。
- **資料版本**：每次接受的落地 +1（提領清勾選用）。
- **慢更新**：`isLoading` 或 `isRevalidating` 持續 `SLOW_UPDATE_MS`（15 秒，具名常數）→ `isSlow`；
  重新整理恢復可按（新 ticket 作廢舊的）。退場條件寫在常數旁：全站 `apiClient` 逾時上線後拿掉。
- **403**：任何後台列表讀取（含槽為 `null` 的告警、證件審核、非空白搜尋）與會員詳情讀取回 403 →
  `cache.invalidate('accessLost')`，清空全部快取與 view。判斷用 duck-typing（錯誤物件帶數值
  `status === 403`），不 import `apiClient`。後端 `isAdminUser` 吞掉資料庫錯誤時真管理員也可能偶發
  403（`index.ts:252-255`）——清空是安全方向，畫面照後端訊息顯示，不寫「權限已撤銷」。
- `usePagedList` 不 import 任何 admin 模組：`src/appShell.test.ts:58-86` 的「admin/ 組裝邊界契約」
  禁止 `components/admin/` 以外的檔案（含測試）匯入它。

### 2.4 生命週期（第 2 條）

- 建立：`AdminDashboard` 讀 `UserContext`，渲染 `<AdminConsole key={user.id} …/>`；`AdminConsole` 用
  `useState` 建立 store，effect 內 `open()`、cleanup `dispose()`（成對，開發模式的雙重 effect 也安全；
  repo 目前未啟用 StrictMode，`src/main.tsx:13`）。使用者 id 一變，分頁區連同 store、匯出狀態與各分頁
  state 整個重掛。
- 清除：
  - 離開 `/admin`：卸載 → `dispose`。
  - 登出：`setUser(null)` → `AdminRoute` 導去 `/login`（`AdminRoute.tsx:20-22`）→ 卸載。
  - session 過期：401 → `apiClient` 登出＋`emitSessionExpired` → `/login`（`App.tsx:222`）→ 卸載。
  - 管理員權限被撤：最早在視窗 focus 重抓 `/profile` 後 `isAdmin` 變 false → 導去 `/dashboard` → 卸載；
    在那之前任何後台讀取回 403 → `accessLost`（§2.3）。
  - 直接換成另一位管理員（`SIGNED_IN` 不同 id，`App.tsx:193`）：`AdminConsole` 的 key 一變即重掛。
- 測試（階段 7）：
  - `src/components/admin/AdminConsole.test.tsx`：注入可觀察的 store 工廠（prop），驗卸載時 `dispose`、
    重掛時新 store、五處拿到同一個 store、匯出鎖分頁。
  - `src/components/AdminDashboard.test.tsx`（不在 `admin/` 內，**不得靜態 import admin 模組**）：
    `UserContext` 替身沿用 repo 慣例 `vi.mock('../App')`（例：`MyQrPage.test.tsx:18-21`）；以行為驗證——
    切走再切回不出骨架、登出／`isAdmin→false` 導走後再回來出骨架、換使用者不顯示前一位的資料。
- **為何不沿用 `DataCacheContext`**（只沿用它的模式：讀取時水合、`MUTATION_GROUPS` 式對照表）：
  1. 它把整份快取寫進 `sessionStorage`（`DataCacheContext.tsx:166-172`）——直接違反約束 (a)；
  2. 它掛在 App 根（`App.tsx:464`），只在 `SIGNED_OUT` 清（`App.tsx:201-202`），離開 `/admin` 不清、
     同分頁直接換帳號也不清；
  3. `CacheKey` 是固定聯集（`:31-50`），後台要依篩選參數化的鍵。
  兩套快取的收斂條件登記為遺留（§3.6）。

### 2.5 快取範圍與排除清單（約束 b）

| 資料 | 快取 | 切回時（未確認） | 失敗或逾 15 秒（有舊資料，E2） | 理由 |
|---|---|---|---|---|
| 提領列表第一頁（狀態篩選五種，不含日期與搜尋） | ✅ | 先顯示、變淡、閘門關 | 保留變淡的舊列＋提示 | 主要動線 |
| 提領列上的收款銀行／帳號／匯款金額 | 隨列表 | 照常顯示（變淡；15 秒內不遮，避免每次切回都閃） | **骨架** | 匯款依據 |
| 提領件數（待處理／待查收／已完成） | ✅ 隨列表 | 先顯示、變淡 | 舊值變淡 | D2 |
| 提領**待匯款總額** | ✅ 隨列表 | **骨架** | **骨架** | 對網銀轉出總額用的金額（`20260802000006_withdrawal_stats.sql:5-7`），D2 |
| 匯款作業面板五欄（桌機面板、手機展開卡） | 隨列表 | **骨架** | **骨架** | 匯款的指定介面 |
| 會員列表第一頁＋統計（只限空白搜尋） | ✅ | 先顯示、變淡 | 保留變淡的舊列＋提示 | 列上只有讀取；搜尋結果不快取，不在記憶體累積被查詢者 |
| 公告列表 | ✅ | 先顯示、變淡、刪除停用 | 同上 | |
| 切回位置（提領狀態篩選、會員子分頁） | ✅ view | 回到原處 | — | D3；搜尋字不保留 |
| 會員詳情 | ❌ | — | — | 停權／授予確認框的依據（`MemberManagement.tsx:373-403`）；每次「查看」現讀 |
| 證件審核佇列（清單與待審筆數） | ❌ | 骨架 | 本次掛載的舊列＋提示 | 即時資料（plan.md §1 P4），也是通過／退回的依據 |
| 系統告警 | ❌ | 骨架 | 同上 | 即時資料 |
| 導覽列待處理 badge | ❌ | — | — | `Navbar.tsx:42-51` 只在 `isAdmin` 變化時抓一次，是**載入當下的快照**（既有），不經後台快取 |
| 空結果 | ❌（且刪除舊條目） | 骨架 | — | §2.3 |
| 確認框內容（標記已匯款的金額與帳號末五碼 `:430-431`、退件含手續費點數 `:469`、批次姓名與合計 `:552-562`、代為完成對象） | 不另存 | — | — | 取自點擊當下那一列；批次框開啟時凍結勾選快照（§2.6）；開框的鈕只在 `isConfirmed` 時可按 |

### 2.6 確認閘門（約束 b 的執行方式）

- **停用的入口（`!isConfirmed` 時，原生 `disabled`）**：提領——標記已匯款、退件、代為完成、勾選與批次
  匯款、複製帳號、CSV 匯出、查看證件、查看歷史、載入更多、手機卡片的 ⋯ 觸發鈕；證件審核——通過、
  退回、載入更多；公告——刪除；告警——標記已處理；會員——載入更多（「查看」是讀取，不停用）。CSV、
  批次與重新整理另照現況在載入更多中停用。
- **原因說明**：每個列表都有一行狀態（提領／會員／證件審核沿用「已顯示 X / Y 筆」，公告加「共 N 則」、
  告警加「共 N 筆未處理」）；未確認時接「・更新中，暫停操作」，失敗時接「・更新失敗，暫停操作」。所有
  停用的入口以 `aria-describedby` 指向它：列上的鈕與勾選直接指；CSV 經 `AdminToolbar` 的
  `exportDescribedBy`；手機 ⋯ 觸發鈕直接停用並指向它（不開出兩個灰項——停用的 menuitem 會被 roving
  focus 跳過）；匯出中被停用的三個分頁指向進度行（id 由 `AdminConsole` 以 `useId` 產生、往下傳）。
- **遮蔽**：作業面板五欄與待匯款總額在 `!isConfirmed` 時一律骨架；列上的收款銀行／帳號／匯款金額只在
  失敗或 `isSlow` 時骨架（E2）。
- **勾選**（原 `fetchWithdrawals` `:210-214` 的不變式）：資料版本一變（接受的落地、換身分）與批次完成時清空。
  **批次確認框開啟時凍結勾選快照**——框內姓名與合計、送出的 id 都用快照；開框期間資料版本若變了，關框並
  在回報區寫「列表已更新，請重新勾選」。
- **資料時間（D1、E5）**：作業面板與四個確認框（標記已匯款、退件、代為完成、批次）顯示「資料更新於 N 分鐘前」
  （＜1 分鐘「剛剛更新」）；≥ `STALE_HINT_MINUTES`（10 分鐘，具名常數）改成提示「建議先重新整理」。
- **保證的範圍**：閘門保證「快取不讓寫入依據比沒有快取時更舊」——本次掛載的最新讀取確認前，任何寫入、
  匯出、作業面板都拿不到快取值。它**不**保證按下當下的資料是新的：同一頁停太久（切去網銀再回來）、
  同帳號開兩個分頁，資料一樣會過期，這與現況相同；資料時間提示是緩解，根治列遺留（§7）。

### 2.7 mutation → invalidation 對照表（約束 c）

`ADMIN_MUTATION_GROUPS`（`adminCache.ts`；`invalidate` 的型別只收表內事件）：

| 事件 | 呼叫點 | 失效 | 理由 |
|---|---|---|---|
| `withdrawalStatus`（標記已匯款／退件／代為完成） | `WithdrawalManagement` 單筆動作 | 全部提領槽＋提領 fence | 該筆在狀態篩選之間移動、件數與金額改變 |
| `withdrawalBatchPaid`（批次匯款） | `runBatch` | 同上 | 同上 |
| `memberSuspend`（暫停／恢復） | `MemberManagement.runAction` | 會員槽＋會員 fence | 列上停權徽章、統計「暫停」 |
| `memberAdmin`（授予／撤銷） | 同上 | 同上 | 列上角色徽章、統計「管理員」 |
| `announcementCreate`／`announcementDelete` | `SystemNotifications` | 公告槽＋公告 fence | |
| `accessLost`（任何後台讀取回 403） | `useAdminList`、會員詳情讀取 | 全部槽、全部 fence、view | 權限可能已失，PII 不再可達 |

不入表、但逐一確認過的寫入：

| 寫入 | 為什麼不影響任何快取槽 |
|---|---|
| 證件審核通過／退回 | 佇列不快取；`idVerificationStatus` 雖在會員列資料裡，列上不顯示（只在詳情，詳情不快取）；`admin_review_id` 只改審核狀態與理由欄，證件照路徑不變，提領列不受影響（`20260802000003_admin_id_review.sql:72-78`） |
| 告警標記已處理 | 告警不快取 |

規則：
- **寫入結果分類**（共用純函式 `classifyWriteFailure`，node 測試）：錯誤物件帶數值 `status` 且為 4xx →
  「未提交」；其餘（網路錯誤 `status` 為 `undefined`、5xx、2xx 但回應解析失敗丟出的原生錯誤——
  `apiClient.ts:189`）→「結果不明」。
- 寫入**成功**與**結果不明**：失效（先 `invalidate` 再 `reload`）並對該對象 `markChanged`；「未提交」不失效。
  批次有任一筆成功就失效；整批 4xx（含後端整批失敗回 403，`index.ts:1307-1308`）不失效。
- `invalidate`／`markChanged` 不包在「元件仍掛載」的檢查裡：寫入在途時切走分頁，完成時照樣失效；重掛那次
  讀取若早於失效送出，落地時被 fence 判定未確認並自動補讀（E3）。
- **失敗後背景重讀一次**：單筆提領（D5）、證件審核（E4）——現況是列表被換成錯誤字、要手按「重試」，請求數
  相同；失敗多半代表那一列已被別人改過，不重讀就讓過期的那列繼續可按。會員動作沿用 S4 的既有行為（面板已關
  才重讀列表）。
- 表上沒有的：其他管理員或會員造成的變更——看不到，由「每次掛載都重讀」涵蓋。

### 2.8 切回位置（D3）

- store 的 view 存：提領狀態篩選（預設「全部」）、會員子分頁（預設「會員列表」）。分頁重掛時以它們為初始
  state，變更時寫回。會員搜尋字不存。
- 回到原篩選時，若該槽有快取就立即顯示（§2.2），否則出骨架。

### 2.9 請求序號收斂成一個 hook（第 5 條）

`src/hooks/useLatestRequest.ts`：純核心 `createLatestRequest()`（node 可測）＋`useLatestRequest()` 薄殼
（`useRef` 持有一份核心）。

- `begin(entityId?)` → ticket：遞增序號、作廢之前的；帶 `entityId` 時記下該對象的變更版本。
- `peek()`：取目前序號不遞增；`isLatest(ticket)`。
- `markChanged(entityId)`：該對象版本 +1；`changedSince(ticket)`：ticket 發出後該對象是否變過。

使用者：
- `usePagedList`：重讀與換身分 `begin()`；`loadMore` 只在 `canLoadMore` 時接受並帶 `peek()`；兩個方向都擋：
  重讀在途時不能開始載入更多（`isConfirmed` 為 false），載入更多在途時重讀開始即作廢它並歸零
  `isLoadingMore`。
- `MemberManagement`：`detailSeq`／`bumpSeq`／`isLatest`（`MemberManagement.tsx:159-175`）換成它；動作成功或
  結果不明時 `markChanged(target.id)`；`openDetail` 的讀取落地時若 `changedSince` 就再讀一次——關掉 S4 遺留
  D 的窗口（動作在途時關面板、重開同一位、讀取還在途時動作才完成）。

### 2.10 匯出（D4、E6）

- 只在 `isConfirmed` 時可按；收集範圍一律以確認過的 `total` 為準。
- 收集迴圈抽成 `admin/withdrawalExport.ts` 的純函式：每個 `await` 之後（含最後一頁）、建 Blob 前都檢查
  「仍掛載」；卸載就停止、不下載。進度以回呼回報。
- `WithdrawalManagement` 加 `onExportingChange?(busy)`；`AdminConsole` 在匯出期間把其他三個分頁 `disabled`，
  並以 `aria-describedby` 指向進度行（Radix 鍵盤導覽跳過停用的分頁）。
- 進度行是**可見文字、不是 live region**：「匯出中（已收集 N / M 筆），完成前無法切換分頁，離開此頁會中止」
  （`AdminToolbar` 的 `exportProgress`）；工具列既有的 `role="status"` 匯出宣告區照舊只說「匯出中」，不每頁念。

### 2.11 API／資料庫

零變更（端點、參數、回應形狀、migration 全不動）。

## 3. 架構影響

### 3.1 DI 裁決（約束 d）：注入式 fetcher 的快取 hook

`AdminDashboard.tsx:19-20` 的慣例：「取數／送出走這裡、畫面只吃 props——元件測試才不用替身掉整個網路層」。
裁決：**hook 不 import `apiClient`**，只接受呼叫端給的 `load`；快取 store 由 `AdminConsole` 建立、以 `cache`
prop 注入。取數函式仍定義在 `AdminDashboard`，經 `AdminConsole` 往下傳。

| | 注入式（採用） | hook 內含 fetch（不採用） |
|---|---|---|
| 取數位置 | 維持在 `AdminDashboard` | 移進 hook，檔頭慣例變成假的 |
| 元件測試替身 | 照舊傳 `vi.fn()` 取數函式；要驗快取就傳真的 `createAdminCache()`（純記憶體，不需替身） | 每支元件測試都要 mock `apiClient` |
| 既有測試 | 不傳 `cache`＝不跨卸載保留 | 替身方式全面改寫 |

- 殼層測試（`AdminDashboard.test.tsx`）照舊替身 `apiClient`——殼層本來就擁有真的取數函式。
- `SystemNotifications`／`SystemAlerts` 現況在元件內呼叫 `apiClient`（與慣例不一致是既有狀態）。本 PR 不搬，
  真實理由：兩支既有測試全以 `vi.mock(apiClient)` 替身（`SystemNotifications.test.tsx:13`、
  `SystemAlerts.test.tsx:19`），改成 props 注入要改寫全部替身，而快取不需要它——它們把模組層的取數函式交給
  `useAdminList`，hook 仍是注入式。登記遺留：兩支改走 props 注入，退場條件＝下次改這兩頁的資料層時。

### 3.2 分頁掛載裁決（第 3 條）：維持「非 active 不掛載」＋快取水合，不用 forceMount

| | 不掛載＋水合（採用） | forceMount 全掛 | 首次造訪後常駐 |
|---|---|---|---|
| 首進請求數 | 1（同現況） | 4（等於預載，違反 §1.3） | 1 |
| 切回請求數 | 1（同現況） | 0，要另接「切回時刷新」 | 0，同左 |
| 記憶體 | 提領 ≤ 5 槽×50 列、會員 50 列、公告全量的純資料 | 四棵元件樹＋DOM 常駐 | 造訪過的元件樹＋DOM（含載入更多的頁）常駐 |
| PII 位置 | 非 active 分頁只在 JS heap | 未遮罩身分證與帳號常駐隱藏 DOM | 同左 |
| 測試 | DOM 與現況相同 | 隱藏節點讓 `getByText`／e2e 文字定位器多出重複 | 同左 |

結論不靠「DOM 與 JS heap 可見性不同」那條（只算深度防禦）：請求數、記憶體、測試三欄已足夠。代價：匯出中切
分頁要另外處理（§2.10）。

**背景刷新的觸發：每次掛載（切回）都刷新，不設 stale 時間**。(1) 請求數與時序與現況完全相同；(2) 提領列是
匯款依據，TTL 內不刷新＝寫入依據未經確認；(3) 提領列裡的證件照是 1 小時的簽名網址（`api/index.ts:1144`），
不刷新會留著過期連結。會員區的 `SOFT_TTL` 30 秒（`DataCacheContext.tsx:81`）是為了 F5 與快速切頁的請求風暴，
後台切分頁是人的節奏，不適用。

### 3.3 hook 分層與 friction-log 的 `usePagedList` 教訓（E8）

`docs/plans/friction-log.md:746-749`：「SWR 式背景重抓硬併進 `usePagedList` 只會讓 hook 長出只有它用的選項……
判準是『守的是同一條規則』」。本工項的切法：

- 進 `usePagedList` 的，只有**所有清單都該守的規則**：不靜默截斷（既有）、載入更多失敗不清空已顯示的資料
  （既有，本次補上 `loadMoreError` 讓畫面真的做到）、最後意圖勝出（序號，含舊閉包）、重新驗證中與失敗時保留
  舊資料（ui-ux §5 的通則）、確認前不得當依據（`isConfirmed`）。`initial`／`onLanded` 是不帶語意的擴充點。
- 只有後台需要的——記憶體快取、身分與槽、對照表、fence、view、403 清空、資料時間、資料版本、慢更新——全部放在
  `admin/` 的 `useAdminList`／`adminCache.ts`。
- 單頁清單（公告、告警）用 `usePagedList` 時 `total = items.length`，檔頭註明。

### 3.4 動到的模組

- 新增（`src/hooks/`）：`useLatestRequest.ts`
- 新增（`src/components/admin/`）：
  - `adminCache.ts`（store、builder、對照表、整數戳）、`useAdminList.ts`、`writeOutcome.ts`（`classifyWriteFailure`）
  - `AdminConsole.tsx`（以 `user.id` 為 key 的分頁區、store、匯出鎖分頁）
  - `AdminListSkeleton.tsx`、`AdminListError.tsx`（沒有資料時的讀取錯誤）、`AdminStaleNotice.tsx`（有舊資料時的
    「更新失敗／更新較久」提示）、`AdminActionReport.tsx`（提領頁的成功／失敗回報區）、`DataAgeNote.tsx`（資料時間）
  - `withdrawalExport.ts`（CSV 收集迴圈）
- 修改：`src/hooks/usePagedList.ts`、`src/components/AdminDashboard.tsx`；`src/components/admin/` 的
  `WithdrawalManagement`（改走 `useAdminList`；寫入閘門收成單一 `writesDisabled` 往下傳）、`WithdrawalFundingFields`、
  `WithdrawalCardList`、`CardOverflowMenu`、`MemberManagement`、`IdReviewQueue`、`SystemNotifications`、`SystemAlerts`、
  `AdminToolbar`
- `WithdrawalManagement` 要保留在檔內的字串：`ACTION_DONE`、「載入提領申請中」「目前沒有提領申請」「重試」（以 props
  傳給共用元件）——journey 離線檢查讀這支檔（`test_admin_row_targeting.py` 的 `WITHDRAWAL_UI`）。
- e2e：`features/admin_dashboard.feature`、`steps/admin_steps.py`、`mocks/backend_api_mock.py`、
  `pages/admin_dashboard_page.py`、`test_overflow_sweep.py`、`journey/tools/test_admin_row_targeting.py`
- 不動：`supabase/**`、`DataCacheContext.tsx`、`apiClient.ts`、`App.tsx`、`AdminRoute.tsx`、`Navbar.tsx`、
  `ui/skeleton.tsx`（S6 可能動它）
- 與 S6／S7：S6 只動前台詳情頁與首頁，產品碼不撞；文件層 `ui-ux-guidelines.md` §5「已套用」那一行與母
  `progress.md` 兩邊都會改，後合併者 rebase。S7 改成等 S5、S6 都合併才開工（D8）。

### 3.5 PII 守衛（約束 a）

- **主防線：行為測試**（`adminCache.test.ts`、`AdminConsole.test.tsx`、`AdminDashboard.test.tsx`）：以含身分證與
  帳號的測資走完寫入→讀取→失效→dispose 與「切走再切回」，`Storage.prototype.setItem` 零呼叫。
- **輔助：靜態守衛**（`src/utils/repoHygiene.test.ts` 新開 `describe('後台 PII 不得落地')`）：掃
  `src/components/AdminDashboard.tsx`、`src/components/admin/**`、`src/hooks/usePagedList.ts`、
  `src/hooks/useLatestRequest.ts`，**先剝除註解、排除 `*.test.*`**（沿用同檔的 `isSource`），不得出現
  `sessionStorage`、`localStorage`、`indexedDB`、`caches.`、`document.cookie`，也不得 import 會落地的模組
  （`DataCacheContext`、`formDraft`）；自測案例含「只在註解提到不算違規」。限制寫在註解裡：路徑列舉之外的新檔
  掃不到，所以行為測試才是主防線。

### 3.6 設計理由的長期落腳處

規劃目錄收尾會刪，「為什麼」要留在程式碼裡：
- `adminCache.ts` 檔頭：記憶體內與不落地的理由、為何不沿用 `DataCacheContext`（§2.4 的 1–3）、為何不設 TTL、排除
  清單與空結果不快取、整數戳與 fence、§7 重複匯款反例一句。
- `useAdminList.ts` 檔頭：為何不 forceMount（§3.2）、確認閘門的保證範圍（§2.6）、`SLOW_UPDATE_MS` 的退場條件、
  403 的語意（清空是安全方向，不代表撤權）。
- `AdminConsole.tsx` 建立 store 處：`open`／`dispose` 成對的理由（StrictMode 雙重 effect）。
- `usePagedList.ts` 檔頭：§3.3 的分層判準。
- 母 progress 遺留：兩套快取的收斂條件（S7 之後評估 `DataCacheProvider` 能否支援不落地與參數化鍵）。

## 4. UI/UX

### 4.1 骨架

`AdminListSkeleton`：props `label`（必填，由頁面傳入，保留各頁既有名稱）、`variant: 'rows' | 'cards'`、`count`、
`message`（選填，放在 `role="status"` 內，用於「更新較久，仍在等待伺服器回應」）；外層 `role="status"`＋
`aria-label`＋`aria-busy`；內部只用 `div`（**不得**用 table／row role，否則 page object 會把骨架當成終態表格）。
只有列表骨架帶 `role="status"`；統計、作業面板、列上欄位的骨架 `aria-hidden`。

| 分頁 | 現況 | 之後 |
|---|---|---|
| 提領 | 列表 3 條 `h-10`（`WithdrawalManagement.tsx:792-797`，手機內容是卡片卻用列形）；統計先顯示 `$0`／`0`（`:139-142,613-686`）；「已顯示 0 / 0 筆」（`:762-764`）；桌機作業面板到資料來才出現（`:690`） | 手機 cards、桌機 rows；統計骨架（手機摘要列取兩行高、桌機四卡）；狀態行保留高度的佔位；桌機作業面板佔位（結果為空時收掉）；名稱「載入提領申請中」不變 |
| 會員 | 列表同上（`MemberManagement.tsx:556-561`）；統計先閃 0（`:56,420-483`），手機是一行摘要 `dl`（`:425-439`） | 手機 cards＋一行摘要的骨架（兩行高）、桌機 rows＋三卡骨架；名稱「載入會員列表中」不變 |
| 公告 | 置中 spinner（`SystemNotifications.tsx:233-236`） | cards（名稱「載入公告中」） |
| 告警 | 已是骨架（`SystemAlerts.tsx:93-103`），沒有 role 與名稱 | 手機 cards、桌機 rows（名稱「載入告警中」） |
| 證件審核 | 已是同形骨架（`IdReviewQueue.tsx:65-72`） | 不動 |

狀態行的四種內容：載入中（沒有資料）＝佔位；已確認＝「已顯示 X / Y 筆」（公告「共 N 則」、告警「共 N 筆未處理」）；
更新中＝後接「・更新中，暫停操作」；失敗（有舊資料）＝後接「・更新失敗，暫停操作」；沒有資料的錯誤＝不顯示。

### 4.2 更新中的呈現與工具列

- 列表區包成 `<section aria-label="提領申請列表">`（會員「會員列表」、公告「公告列表」、告警「告警列表」）：更新中
  `aria-busy="true"`；降透明度延遲約 300ms 才出現（設計決定：快網路下不閃；ui-ux §5 本身沒有這個數字，階段 9
  寫進去）。統計區同樣處理。取捨：停用的寫入鈕是立即灰化（安全優先），快網路下會比列表早一點點變灰——接受。
- `AdminToolbar` 新契約（取代 `isRefreshing`）：
  - `isUpdating`：首次載入或背景更新中（`isSlow` 時為 false）——重新整理鈕 `aria-disabled`（**不用 `disabled`**：
    被按的鈕變停用正是焦點掉到 body 的原因）、點了不重送、圖示轉動（`motion-safe`）；`aria-disabled` 的灰化與游標
    樣式寫在 `AdminToolbar` 內（`Button` 基底只有 `disabled:` 樣式，`button.tsx:24`）。
  - `refreshDisabled`：真停用——只用在載入更多中（焦點不在這顆鈕上）。
  - `updateError`：手動重新整理的結果，決定宣告「已更新」或「更新失敗」。
  - `exportProgress`、`exportDescribedBy`：匯出進度行與 CSV 停用原因（§2.6、§2.10）。
  - `filter` 改選填：告警頁沒有篩選，只放重新整理鈕。
- 宣告：新增常駐 `aria-live="polite"` 區，**放在工具列 flex 行之外**（同既有匯出 `role="status"` 區的理由：
  sr-only 是絕對定位，留在行內會被 `test_admin_mobile_layout.py` 的列數量測算成第二列）。只有手動重新整理時說
  「正在更新」→「已更新」或「更新失敗」；更新途中再按（`aria-disabled`）也設「正在更新」；切回與寫入後的自動
  更新不宣告。不用 `role="status"`——那是骨架的定位器（§4.5），會員頁既有的詳情讀取宣告也是同一個理由
  （`MemberManagement.tsx:495-502`）。

### 4.3 錯誤與回報

- **沒有資料時的讀取失敗**：`AdminListError`——props `message`、`retryLabel`、`tone`、`onRetry`（頁面傳入，錯誤字
  沿用各頁現況）；中性字（`text-muted-foreground`，§13 第 4 條）＋`role="alert"`。重試鈕依 §12.11：整區失敗時
  重試是唯一出路→流程鈕（提領、會員、告警、證件審核）；公告頁同頁有流程鈕「發布公告」→次要。
- **有舊資料時的失敗或逾時**：`AdminStaleNotice`（列表上方）——失敗「更新失敗，以下是 N 分鐘前的資料」＋次要重試鈕、
  `role="alert"`；逾時「更新較久，以下是 N 分鐘前的資料」、不帶 role（不打斷）。
- **載入更多失敗**：`loadMoreError` 顯示在載入更多鈕旁，已顯示的列保留。
- **提領頁的動作回報**（`AdminActionReport`，工具列正下方）：
  - 成功（「已退件：王小明」「已匯出 N 筆」「列表已更新，請重新勾選」）：常駐、空時不佔高的容器帶 `role="status"`，
    `StatusCallout` success 以 `role={undefined}` 放在裡面——**可見字與播報字是同一個節點**，文字在 DOM 中只出現一次；
    「知道了」（現況）收起時容器清空；換篩選時一併清空。不捲動。
  - 失敗（單筆失敗、批次「X 筆成功、Y 筆失敗」、匯出失敗、超過上限）：`StatusCallout` destructive、`role="alert"`；
    **剛按下的動作**失敗時捲進視線並取得焦點，晚到的不搶焦點（比照 `MemberManagement.tsx:176-178,195-202`）。
    容器帶 `scroll-mt-20`——導覽列是 `sticky top-0`、高 64px（`Navbar.tsx:94-95`），不加就會被蓋住；會員頁的
    錯誤框同步加。
  - 單筆動作結果不明（§2.7）時改說「網路中斷，結果不明，請待列表更新後確認該筆狀態」；4xx 照後端原文。
  - 收起時機：按「知道了」、下一個動作開始、換篩選、手動重新整理。
- **焦點規則**（焦點元素消失時的後備）：
  - 單筆確認後焦點落在該筆的列或卡片容器（`tabIndex=-1`；觸發鈕此時停用，Radix 還給它會掉到 body）；該列因重讀
    離開清單時移到下一列，沒有就上一列，再沒有就移到列表區（`tabIndex=-1`）。
  - 批次確認後、按「知道了」後：移到列表區。
  - 證件審核通過／退回後：同單筆規則，對象是卡片。

### 4.4 證件審核卡（D7、E4）

- 按鈕：「退回」在左、「通過」在右（§12.11 次要左主要右）；手機 `grid grid-cols-2` 兩顆等寬，桌機卡片尾靠右
  （`sm:justify-end`）。目前是 `IdReviewQueue.tsx:198-215` 的 `flex gap-2`、通過在左、內容寬。
- 動作失敗：佇列上方的錯誤區（`role="alert"`、`scroll-mt-20`、剛按的失敗取得焦點），並背景重讀一次（E4）。

### 4.5 定位器契約（第 7 條）

| 定位器 | 位置 | S5 之後 | 處置 |
|---|---|---|---|
| `get_by_role("status", name="載入提領申請中")` | `e2e/pages/admin_dashboard_page.py:74,100`（journey f50、f70 共用） | 只在首次載入、換到沒快取的槽、慢更新且無資料時出現；寫入後與切回改背景更新 | `_wait_list_settled` 另等「提領申請列表」的 `aria-busy` 消失；階段 4c 釘「成功回報出現的同一個 commit 內 `aria-busy` 已為 true」 |
| 字串「載入提領申請中」「目前沒有提領申請」「重試」 | `e2e/journey/tools/test_admin_row_targeting.py:126-135` | 三個字串仍寫在 `WithdrawalManagement.tsx`（以 props 傳給共用元件） | 加一條：`_wait_list_settled` 有等 `aria-busy`；區塊名稱同時出現在產品與 page object |
| 動作回報文字（`get_by_text("已退件：王小明")` 等） | `admin_dashboard_page.py:144-147`（無 `.first`）、`WithdrawalManagement.test.tsx:340,421,613,632,708,733,741,746` | **在 DOM 中只出現一次**（§4.3 容器包住 callout，不複製文字） | 階段 4c 加一條斷言釘住單一匹配 |
| `getByRole('status', { name: '載入提領申請中' })` | `WithdrawalManagement.test.tsx:106,110` | 不變（首次載入） | 不動 |
| `queryByRole('status')` 為 null | `MemberManagement.test.tsx:121`、`IdReviewQueue.test.tsx:61` | 不變——會員與證件審核沒有新的 `role="status"` | 不動 |
| `getByRole('status')`（匯出宣告） | `AdminToolbar.test.tsx:76-98` | 不變；進度行不是 live region | 見下方改寫清單 |
| 重新整理 `hasAttribute('disabled')`（載入更多中、匯出中） | `WithdrawalManagement.test.tsx:618-693`、`MemberManagement.test.tsx:313-328` | 不變（`refreshDisabled`／`disabled` 仍是真停用） | 不動 |
| 錯誤字與「重新載入」 | `SystemAlerts.test.tsx:75,77,86,93,96` | 不變（`AdminListError` 的 `message`／`retryLabel` 由頁面傳入，沿用現況文字） | 不動 |
| 工具列直接子元素的列數與間距量測 | `e2e/test_admin_mobile_layout.py:443-474` | 宣告區與進度行在 flex 行之外，列數不變 | 不動；階段 8 跑一次 |
| `/admin` 各狀態 375px 溢版 | `e2e/test_overflow_sweep.py`（只量載入完成後的畫面，`:752-757`） | 新增兩條 after_load：提領切回後扣住 GET（更新中狀態行）、讀取失敗保留舊列（失敗提示） | 階段 8 新增 |
| `get_by_role("button", name="標記已處理").first` | `e2e/steps/admin_steps.py` | 首次載入完成後可按 | 不動 |
| `get_by_role("tab", name=…)` | e2e、journey、`AdminDashboard.test.tsx` | 匯出中其他分頁 `disabled`，名稱不變 | 不動 |

**紅燈期改寫清單**（清單外的既有測試一字不改；清單內的在該階段紅燈期改寫，不刪）：

| 階段 | 測試 | 改什麼、為什麼 |
|---|---|---|
| 1a | `usePagedList.test.tsx`「載入更多失敗時保留已顯示的資料」（`:32-45`） | 斷言 `error` → `loadMoreError`（`error` 只管重讀） |
| 3 | `AdminToolbar.test.tsx`「重新整理中按不下去」（`:66-69`） | `disabled` → `aria-disabled`、點了不呼叫 `onRefresh`、焦點不動 |
| 3 | `AdminToolbar.test.tsx`「沒有匯出能力的頁面不放狀態宣告區」（`:96-99`） | 改名為「…不放匯出狀態宣告區」，斷言不變 |
| 4c | `WithdrawalManagement.test.tsx`「狀態更新失敗時把原因說出來」（`:370-380`） | 丟出的錯誤改帶 `status: 409`（4xx 才照原文；結果不明的固定文案另補新測試） |
| 5 | `MemberManagement.test.tsx`「面板已關時動作失敗，錯誤框不搶焦點也不捲動」 | 補回「焦點仍在『查看』」的斷言（S4 收窄的部分，S5 後成立） |
| 7 | `AdminDashboard.test.tsx` 檔頭 | 補 `vi.mock('../App')`（`AdminDashboard` 新讀 `UserContext`，repo 慣例） |

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）＋測試（第 6 條）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1a | `createLatestRequest`／`useLatestRequest`；`usePagedList` 序號（兩個方向、ticket 帶身分、`load` 走 ref、舊閉包 `reload` 讀新身分）、旗標綁 ticket、背景重讀、失敗保留舊列（E2）、`loadMoreError`、`isLoadingMore` 歸零、`hasMore`／`canLoadMore` | `src/hooks/useLatestRequest.test.ts`（node，測核心）、`src/hooks/usePagedList.test.tsx` | 連換身分 A→B→C 時 B 的結算不改旗標；換身分後呼叫舊閉包 `reload` 讀的是新身分；重讀在途時載入更多被拒、載入更多在途時重讀作廢它且 `isLoadingMore` 立即為 false；有資料時 `reload` 不回骨架；重讀失敗保留舊列；載入更多失敗後可重試；`changedSince` 只對被標記的對象成立；改寫清單 1a 那條 |
| 1b | `usePagedList` 的 `initial`（換身分同一個 render 換種子）、`onLanded`（帶戳記、可回 `false` 觸發一次補讀）、`meta`、`isConfirmed`（只看重讀） | `usePagedList.test.tsx` | 有種子的第一個 render 即未確認；換到有種子的身分時該 render 顯示新種子而非舊列；`onLanded` 回 `false` 時不確認並只補讀一次；載入更多成功不呼叫 `onLanded`、不改 `isConfirmed`；載入更多失敗 `isConfirmed` 仍為真 |
| 2 | `createAdminCache`（builder、整數戳、fence、空結果刪槽、view、`accessLost`、`open`／`dispose`）＋`useAdminList`（身分與槽、落地驗證、`fetchedAt`、資料版本、`isSlow`、403）＋`classifyWriteFailure`＋PII 守衛 | `src/components/admin/adminCache.test.ts`（jsdom，要 `Storage`）、`useAdminList.test.tsx`、`writeOutcome.test.ts`（node）、`src/utils/repoHygiene.test.ts` | 非空白搜尋 A→B 各自重讀且帶對參數、`null` 槽重新整理讀最新搜尋字；失效前送出的讀取不寫回、落地被判未確認並補讀；同戳記邊界（先失效再重讀能寫回）；空結果刪掉舊條目；帶日期／搜尋回 `null` 槽；403 清空全部與 view（含 `null` 槽讀取）；dispose 後寫入無效、open 後恢復；`fetchedAt` 用牆鐘、`visibilitychange` 重算（假時鐘）；15 秒進 `isSlow`；分類函式涵蓋 4xx／5xx／無 status／原生錯誤；`setItem` 零呼叫；靜態守衛；`appShell.test.ts` 仍綠 |
| 3 | `AdminToolbar` 新契約，兩個呼叫端同步改接（`refreshDisabled={isLoading \|\| isLoadingMore}`，`isUpdating` 先恆為 false，行為不變） | `AdminToolbar.test.tsx` | `isUpdating` 時 `aria-disabled`、焦點不動、點了不呼叫；手動重新整理宣告「正在更新」→「已更新」，`updateError` 時「更新失敗」，更新途中再按也宣告；宣告區在 flex 行之外；不帶 `filter` 也能渲染；`exportProgress` 顯示且不在 live region、`exportDescribedBy` 掛上；改寫清單 3 那兩條；提領與會員既有測試一字不改 |
| 4a | 提領頁純遷移到 `usePagedList`（不加快取）：舊防線以等價旗標對應（舊 `isLoading` → `isLoading \|\| isRevalidating`）；清勾選搬到「重讀成功」時 | `WithdrawalManagement.test.tsx`：既有測試一字不改；遷移前先補特徵測試「重新整理成功後已選取歸零」（舊碼上即綠） | 綠到綠（比照 S4「重構綠到綠→行為」） |
| 4b | 提領頁讀取側：`useAdminList` 快取、確認閘門與原因說明（含 CSV、查看證件／歷史、複製、勾選、載入更多、⋯ 觸發鈕）、勾選清除、件數變淡與金額骨架（D2）、作業面板骨架與 `DataAgeNote`（D1、E5）、骨架統一、`AdminListError`、失敗或逾時保留舊列＋`AdminStaleNotice`＋列上匯款欄位遮蔽（E2）、篩選保留（D3） | `WithdrawalManagement.test.tsx`、`AdminListSkeleton.test.tsx`、`AdminListError.test.tsx`、`AdminStaleNotice.test.tsx`、`DataAgeNote.test.tsx` | 帶快取重掛無骨架、首個 render 寫入入口與 CSV 即停用且有 `aria-describedby`、確認後啟用；更新中 CSV 不以快取 `total` 收集；勾選在重讀成功與換篩選後歸零；待匯款總額與作業面板未確認時是骨架、件數變淡；失敗保留舊列且列上匯款欄位遮蔽、重試是背景重讀；逾 15 秒同上並放行重新整理；資料時間「剛剛更新」與 10 分鐘提示（假時鐘）；篩選經 view 保留 |
| 4c | 提領頁動作側：`AdminActionReport`（單一節點、`scroll-mt`、焦點）、結果分類與文案、失敗自動重讀（D5）、失效＋fence＋卸載後仍失效、批次快照、焦點後備規則、`withdrawalExport.ts`（每個 await 後檢查掛載、進度）、`loadMoreError` 顯示 | `WithdrawalManagement.test.tsx`、`AdminActionReport.test.tsx`、`withdrawalExport.test.ts` | 成功回報文字只出現一次、出現時 `aria-busy` 已為 true；剛按的失敗取得焦點並捲動、晚到的不搶；結果不明改固定文案、4xx 照原文（改寫清單 4c）；成功與結果不明失效、4xx 不失效、批次部分失敗失效、全 4xx 不失效；寫入在途時卸載、完成後仍失效、重掛不顯示舊列；單筆失敗自動重讀一次；批次框用快照、開框期間資料版本變了就關框並提示；確認後焦點落在該列、該列離開清單時移到下一列；換篩選時在途的載入更多不接舊尾；寫入在途時換篩選，畫面不會以新篩選的標籤顯示舊列；卸在最後一頁在途不下載 |
| 5 | 會員頁＋證件審核 | `MemberManagement.test.tsx`、`IdReviewQueue.test.tsx` | 帶快取重掛無骨架（空白搜尋）；非空白搜尋不讀不寫快取、連續兩次不同搜尋各自重讀；子分頁經 view 保留；動作後重讀不換骨架、關面板焦點回到「查看」（改寫清單 5）；停權／授予成功與結果不明失效、4xx 不失效；會員詳情每次「查看」都現讀，回 403 時清空；重開在途時動作才完成→面板補讀到新狀態；取詳情失敗的錯誤框有 `scroll-mt`；兩頁 `loadMoreError` 顯示且列保留；證件審核：重掛仍出骨架、重讀中通過／退回停用並有原因說明、失敗有錯誤區並重讀一次、讀取回 403 時清空、以 `memberLabel` 稱呼、退回在左通過在右（手機等寬、桌機靠右）、確認後焦點規則 |
| 6 | 公告＋告警 | `SystemNotifications.test.tsx`、`SystemAlerts.test.tsx` | 公告：骨架取代 spinner、讀取失敗顯示 `AdminListError`（次要重試）而非「尚無公告」、帶快取重掛無骨架、狀態行「共 N 則」與更新中原因、更新中刪除停用、建立／刪除成功與結果不明失效；告警：改用 `AdminToolbar`、重掛仍出骨架、狀態行「共 N 筆未處理」、標記後背景重讀期間按鈕停用並有原因、讀取回 403 時清空 |
| 7 | 殼層：`AdminConsole`（`user.id` key、store `open`／`dispose`、五處注入同一個 store、匯出鎖分頁與 `aria-describedby`）、`AdminDashboard` 讀 `UserContext` | `src/components/admin/AdminConsole.test.tsx`、`src/components/AdminDashboard.test.tsx` | 卸載時 dispose、重掛時新 store、五處同一個 store、匯出中其他分頁停用且指向進度行；切走再切回不出骨架且照舊打一次 API；登出、`isAdmin→false` 導走後再回來出骨架（整合 `AdminRoute`）；換使用者不顯示前一位的資料；全流程 `setItem` 零呼叫；改寫清單 7 |
| 8 | e2e＋journey page object＋溢版巡檢 | `e2e/features/admin_dashboard.feature`、`e2e/steps/admin_steps.py`、`e2e/mocks/backend_api_mock.py`、`e2e/pages/admin_dashboard_page.py`、`e2e/test_overflow_sweep.py`、`e2e/journey/tools/test_admin_row_targeting.py` | 三個新情境綠；巡檢兩條新 after_load 綠；`test_admin_mobile_layout.py` 照綠；`cd e2e/journey && pytest tools/ -q` 綠 |
| 9 | 文件（第 8 條） | — | `check-spec-drift.py`、`check-plans-scaffold.py`、`framework-check.sh` 綠 |

**階段 8 的 e2e 情境**（`e2e/` 是英文 Gherkin；扣住回應比照 `set_upload_photo_deferred`，不用 `sleep`；**只扣 GET**，
同前綴的 POST `/admin/withdrawals/{id}/status` 照常回應）：

```gherkin
Scenario: Returning to a visited tab shows the previous list at once while it refreshes
  Given I am logged in as an admin
  And there is a pending withdrawal from "王小明"
  And the platform has a member named "陳大文"
  When I visit "/admin"
  Then I should see the text "王小明"
  When I open the "會員管理" tab
  Then I should see the text "陳大文"
  When the withdrawal list stops responding
  And I open the "獎金提領管理" tab
  Then the withdrawal list shows "王小明" without a loading skeleton
  And the withdrawal list is refreshing
  When the withdrawal list responds again
  Then the withdrawal list is no longer refreshing

Scenario: On a phone, returning to a visited tab shows the previous list at once while it refreshes
  Given I am on a 375px-wide phone screen
  （其餘同上）

Scenario: Rejecting a withdrawal keeps the list on screen while it refreshes
  Given I am logged in as an admin
  And there is a pending withdrawal from "王小明"
  When I visit "/admin"
  Then I should see the text "王小明"
  When the withdrawal list stops responding
  And I reject the withdrawal from "王小明"
  Then I should see the text "已退件：王小明"
  And the withdrawal list shows "王小明" without a loading skeleton
  And the withdrawal list is refreshing
  When the withdrawal list responds again
  Then the withdrawal list is no longer refreshing
```

- 第三個情境走 journey 共用的 `AdminDashboardPage.reject_withdrawal`——`_wait_list_settled` 的改動原本只有晉升 PR 的
  journey 跑得到，這條讓每個 PR 都走一次同一條路徑；扣住前先看到「王小明」，保證首次載入已落地。
- 手機情境的 viewport 步驟沿用 `common_steps.py` 的「I am on a 375px-wide phone screen」。

**階段 9 的文件**：
- 規格書 §13（D6）：在後台模組表後新增一段，草稿：
  > **後台資料快取**：提領（依狀態篩選）、會員（未輸入搜尋時）與公告三個列表，切回分頁時先顯示上次讀到的資料並在
  > 背景重讀；空結果、會員搜尋結果與帶日期或搜尋條件的提領查詢不快取。會員詳情、證件審核佇列與系統告警不快取，
  > 每次都現讀；導覽列的待處理數是載入當下的快照。快取只存在記憶體，離開 `/admin`、登出、換帳號或任何後台讀取回 403
  > 即清空，從不寫入 `sessionStorage`／`localStorage`（提領資料含未遮罩的身分證字號與收款帳號）。列表的最新一次讀取
  > 確認前，該列表上的寫入入口與 CSV 匯出停用（提領的標記已匯款、退件、代為完成、批次匯款，證件審核，公告刪除，
  > 告警處理），匯款作業面板與待匯款總額不顯示；讀取失敗或逾 15 秒未回時保留舊列並標示資料時間，但收款銀行、
  > 帳號與匯款金額改為遮蔽。停權與管理員授予在會員詳情面板操作，詳情每次開啟都現讀，不受列表閘門影響。快取保證的是
  > 「不讓寫入依據比沒有快取時更舊」——同一頁停留過久的資料仍會過期，介面以「資料更新於 N 分鐘前」提示，超過
  > 10 分鐘建議先重新整理。
- 規格書 §14（E7）：新增三列（修好時刪列）——提領狀態更新與批次對「已是該狀態」回成功（`idempotent`）但 API 不透傳，
  前端無法分辨重複標記已匯款（`index.ts:1265-1272`、`20260802000004_withdrawal_events.sql:108-109`）；
  `/admin/withdrawals` 忽略統計的錯誤，失敗時件數與待匯款總額回 0（`index.ts:1202-1224`）；`/admin/announcements`
  不檢查查詢錯誤，失敗時回空清單（`:1671-1689`）。
- `ui-ux-guidelines.md` §5：「已套用」補「後台列表」；補一句**機制**（業務規則留 §13，不重複）：後台列表背景重讀時
  `aria-busy`＋延遲約 300ms 才降透明度；停用的寫入入口以 `aria-describedby` 指向列表狀態行的原因；失敗時保留舊列
  並標示資料時間。
- 程式碼檔頭：§3.6 各處；`AdminDashboard.tsx` 的 DI 註解補「快取 store 由 `AdminConsole` 建立、以 props 注入」；
  `admin_dashboard_page.py` 檔頭 docstring 同步。
- 母計畫：
  - construction-plan §1：S7 開工條件改成「S5、S6 皆合併」（D8）；§2 的 S5 重量由「中」調成「重」，註明可能需要兩次
    對話（狀態在本目錄 `progress.md`）；§4.3 驗收 3 換成下方清單；§6.2 達標驗證表（`construction-plan.md:643`）的
    「抽查一筆提領資料確認顯示值未過期」改成與驗收 3 一致的證偽做法。
  - progress：S5 列；S7 列改寫成「等 S5、S6 都合併後開工」並註記「公告錯誤態已由 S5 處理」「`usePagedList` 的
    `reload` 已改背景重讀」；遺留結案（「S3 審查遺留 → S5」整條、「S4 遺留」中的序號收斂、焦點掉 body、
    `IdReviewQueue` 姓名三條、S2e 的證件審核鈕順序）；新增遺留——三個後端缺口（同規格書 §14 那三列）、導覽列 badge
    寫入後不更新、`SystemNotifications`／`SystemAlerts` 改 props 注入、兩套快取收斂條件、`SLOW_UPDATE_MS` 的退場條件。
- 收尾 `git rm -r docs/plans/admin-data-cache`，跑 `check-plans-scaffold.py`。

**驗收 3 清單草稿**（寫進 construction-plan §4.3）：

前置：admin 帳號；develop 上至少一筆待處理、一筆待查收提領、幾位會員、**至少一則公告**（提領總數 > 50 筆才驗得到
匯出進度，不足就跳過那一項）；第二個瀏覽器（或無痕視窗）登入同一個 admin，用來製造無害的變更；手機項目用桌機
devtools 的裝置模擬（375px）——LINE 內建瀏覽器沒有 devtools，只用一般網速驗一次切回手感；標「載入前節流」的項目，
先在 devtools 設好「Slow 3G」再從別頁進 `/admin`；確認框只看、按「取消」（develop 是共用的真後端；斷網時按確認不會
送出任何資料）。

- 手機（375px）：
  - [ ] （載入前節流）首次進 `/admin`：統計摘要與卡片列表是骨架，沒有先閃 $0／0 筆
  - [ ] 提領篩「待處理」→ 會員 → 提領：回到「待處理」，卡片立即出現、沒有骨架
  - [ ] （Slow 3G）切回提領：卡片變淡、狀態行寫「更新中，暫停操作」、退件與代為完成按不下去、⋯ 按不下去；更新完
        自動恢復，展開一張卡寫「資料更新於…」
  - [ ] 會員 → 證件審核 → 提領 → 會員：回到「證件審核」，證件審核照舊出骨架；切到「會員列表」立即出現
  - [ ] （Offline）切回提領：卡片保留（變淡）、上方寫「更新失敗，以下是 N 分鐘前的資料」、卡片上的匯款金額是骨架；
        恢復網路按重試，卡片不消失、更新完恢復
  - [ ] （Offline）展開一筆待處理、按「退件」填理由後按確認：失敗回報完整出現在導覽列下方、焦點在上面
  - [ ] （提領 > 50 筆）按 CSV：其他三個分頁按不到，進度行寫「匯出中（已收集 N / M 筆）…離開此頁會中止」（窄螢幕
        折行可接受）；完成後恢復
- 桌機：
  - [ ] （載入前節流）首次進 `/admin`：統計四卡、匯款作業面板、表格都是骨架
  - [ ] （Slow 3G）切回提領：表格變淡；標記已匯款／退件／代為完成、勾選、CSV、查看證件、查看歷史按不下去；待匯款總額
        與匯款作業面板是骨架，待處理等件數照常顯示（變淡）
  - [ ] 證偽「顯示值未過期」：在公告分頁載完後切到會員；第二個瀏覽器發布一則測試公告；切回公告時先看到舊列表（變淡），
        更新完那則公告出現；最後用第二個瀏覽器刪掉它
  - [ ] 作業面板寫「資料更新於 N 分鐘前」；停在頁面 10 分鐘以上，改成提示先重新整理；開「標記已匯款」確認框也看得到
        同一句（按取消）
  - [ ] 按重新整理：鍵盤焦點留在鈕上（再按 Tab 不從頁首開始），列表不換骨架
  - [ ] （提領 > 50 筆）按 CSV：其他三個分頁按不到、進度行顯示；完成後恢復，「已匯出 N 筆」在工具列下方、工具列沒有
        被往下推
  - [ ] 登出再登入、進 `/admin`：重新出骨架；devtools → Application → Session Storage／Local Storage 沒有任何**他人**的
        姓名、身分證字號、收款帳號或 Email（自己的登入資料 `user`、`sb-*` 是既有的，不算）
  - [ ] （選驗，需報讀器）手動重新整理念「正在更新」「已更新」；沒有報讀器時用 devtools Elements 看工具列旁宣告區的
        文字變化

以 vitest／e2e 為準、不列人工項：寫入後的失效與 fence、請求序號與舊閉包、重開在途補讀、卸載後停止匯出、403 清空、
15 秒慢更新、批次框快照。

## 6. 開放問題

無未決。兩輪審查的待裁決題已由業主裁決 D1–D8（第一輪）與 E1–E8（第二輪）處理，紀錄在 `review.md` 處置節；其餘
技術題由規劃者裁決（§8、§9），業主可在第三輪審查時推翻。

## 7. 風險與回滾（第 9 條）

- **PII 在記憶體**：曝險面與現況相同——同一個 JS heap、DevTools／React DevTools 讀得到的是同一批欄位。差在兩點：
  存活時間由「分頁掛著時」延長為「待在 `/admin` 期間」，上限由離開 `/admin`、登出、換帳號、403 界定（§2.4）；資料量
  最多提領 5 槽×50 列、會員 50 列與公告。不新增儲存媒介：不落 storage、非 active 分頁不常駐 DOM（§3.2）；會員搜尋
  結果不快取；空結果會刪掉舊條目。證件照簽名網址（1 小時）隨提領列在記憶體——現況分頁掛著時也在，且每次切回都換新。
- **過期資料成為寫入依據——反例（為什麼提領狀態與作業面板不能從快取直接當真）**：管理員 A 在提領頁看到王小明
  1,000 P「待處理」，切到會員頁接客服電話 15 分鐘；這段期間管理員 B 已在網銀匯款，並把這筆標記已匯款。A 切回提領頁，
  若快取直接當真、按鈕可按：作業面板仍把王小明排在第一筆、狀態仍是待處理，A 照面板帳號在網銀再匯一次，回來按
  「標記已匯款」——後端 `admin_update_withdrawal_status` 對「已是待查收 → 待查收」回 `success: true, idempotent: true`
  （`20260802000004_withdrawal_events.sql:108-109`；批次逐筆呼叫同一函式，也算成功），畫面照樣顯示「已標記匯款完成：
  王小明」。**重複匯款在系統裡沒有任何錯誤訊號。** 後端狀態機擋得住不合法的轉換，擋不住合法但重複的轉換，所以快取
  造成的過期只能由前端擋：確認閘門、作業面板與金額確認前不顯示、失敗或逾時時列上匯款欄位遮蔽（§2.6）、落地前已被
  失效就補讀（E3）。同理，會員詳情若從快取顯示「未停權」而實際已被別人停權，A 按「暫停」會改寫真正的停權時間（停權
  端點每次覆寫 `suspended_at`，S4 遺留）——所以詳情不快取。
- **殘餘風險：同一頁停太久、同帳號雙分頁**：與現況相同，快取不讓它更糟；以資料時間提示緩解（D1、E5）。根治需要後端：
  狀態更新與批次把 RPC 的 `idempotent` 吃掉了（`index.ts:1265-1272`，前端 `updateWithdrawalStatus` 也丟棄回應），應透傳
  或比對 `expectedStatus`——登記規格書 §14 與後端 `/fix-bug` 遺留（E7；金流，建議獨立 session）。
- **殘餘風險：既有端點把失敗讀成 200**：`/admin/withdrawals` 忽略統計的錯誤（失敗時件數與金額全 0）、
  `/admin/announcements` 不檢查錯誤（失敗回空清單）。快取會把這個假值當成一次成功的讀取；公告的假空清單因「空結果
  不快取」不會被存起來，提領的 0 會。登記規格書 §14 與遺留（E7）。
- **殘餘風險：導覽列 badge**：載入當下的快照，寫入後不更新（既有）；本 PR 不動 `Navbar`，登記遺留。
- **殘餘風險：偶發 403**：後端 `isAdminUser` 吞掉資料庫錯誤時，真管理員也可能收到 403；本工項會因此清空快取（安全
  方向，最壞是多看一次骨架），畫面照後端訊息顯示。
- **背景更新卡住**（`apiClient` 沒有逾時，S4 遺留）：寫入維持停用、作業面板與金額維持骨架；15 秒後保留的舊列連列上匯款
  欄位也遮蔽、重新整理恢復可按（§2.3）。會員「查看」的無限轉圈不在其內。根治是全站逾時（既有遺留）。
- **共用 hook 改動**：`usePagedList` 的 `reload` 改成背景重讀、失敗保留舊列，`MemberManagement`、`IdReviewQueue` 的重讀
  呈現隨之改變——受影響的既有斷言已列在 §4.5 改寫清單；S7 改成等 S5 合併後才開工（D8）。
- **journey 晚發現**：page object 的改動只有晉升 PR 的 journey 跑得到 → 階段 8 的退件情境讓每個 PR 走同一條路徑，
  journey-offline 另有字串與結構檢查。
- **重量**：範圍比開工 prompt 預估大很多（十二個階段），很可能需要兩到三次對話；狀態全在本目錄 `progress.md`。
- **回滾**：純前端、無資料遷移——revert PR 即回到「每次切回重抓＋骨架」。

## 8. 第一輪審查回填對照（第二版）

業主裁決（2026-10-06，session 內互動選項，全選推薦）：

| 代號 | 題目 | 裁決 | 落點 |
|---|---|---|---|
| D1 | 寫入依據的新鮮度保證 | 收窄說法＋顯示資料時間，後端根治列遺留 | §0、§2.6、§7 |
| D2 | 統計區（原 Q1） | 件數隨列表快取、待匯款總額確認前骨架；badge 改稱快照 | §2.5 |
| D3 | 切回位置 | 保留狀態篩選與會員子分頁，搜尋字不保留 | §2.8 |
| D4 | 匯出中切分頁（原 Q2） | 停用其他分頁＋進度說明 | §2.10 |
| D5 | 單筆失敗後自動重讀 | 採用 | §2.7 |
| D6 | 規格書 §13 新段 | 新增，草稿附在階段 9 | §5 |
| D7 | 證件審核鈕順序（原 Q3） | 順手做，手機等寬 | §4.4 |
| D8 | S7 開工條件 | 等 S5、S6 都合併 | §3.4、§5 階段 9 |

規劃者技術裁決（業主可推翻）：T1「查看證件／歷史」納入閘門；T2 空結果不快取（第三版補「並刪除舊條目」）；
T3 殼層卸載顯式 `dispose`＋登出整合測試（第三版改成 `open`／`dispose` 成對）；T4 背景更新 15 秒慢提示（第三版依 E2
改成保留舊列）；T5 hook 分層（§3.3，第三版依 E8 收窄）；T6 階段 4 拆分（第三版再拆成 4a／4b／4c、1a／1b）；
T7 讀取回 403 時整體清空（第三版明定範圍與語意）；T8 列表讀取錯誤區共用（第三版改成依 §12.11 條件決定重試鈕）。

第一輪發現的落點（第二版）：P0-1 → §2.6、§2.10；P1-1 → §2.2、§2.6、§2.5；P1-2 → §2.2；P1-3 → §2.2、§2.9；
P1-4 → §2.6；P1-5 → §0、§2.6、§7；P1-6 → §2.3、§3.3；P1-7 → §4.2；P1-8 → 驗收清單；P1-9 → §2.4；P1-10 → §4.3；
P1-11 → §2.6、§4.2；P1-12 → §4.2、§4.3；P1-13 → §4.1；P2-1～P2-32 的落點見第二版（`aeb5c97`）的 §8。

## 9. 第二輪審查回填對照（第三版）

業主裁決（2026-10-06，session 內互動選項，全選推薦）：

| 代號 | 題目 | 裁決 | 落點 |
|---|---|---|---|
| E1 | 第三版之後是否再審 | 補第三版，跑完整第三輪四視角 | — |
| E2 | 失敗與逾時時的舊資料（原 T4） | 保留變淡的舊列＋提示；列上收款銀行／帳號／匯款金額、作業面板、待匯款總額遮蔽；一般更新中（15 秒內）不遮 | §1.2、§2.2、§2.5、§2.6、§4.3 |
| E3 | 落地前已被寫入失效的讀取 | 判未確認並自動補讀一次 | §1.3、§2.2、§2.3、§2.7 |
| E4 | 證件審核失敗後自動重讀 | 採用（第三處時序例外） | §1.3、§2.7、§4.4 |
| E5 | 資料時間提示門檻 | 10 分鐘，具名常數 | §2.6 |
| E6 | 匯出卡住 | 進度字加「離開此頁會中止」，不加取消 | §2.10 |
| E7 | 三個金流類後端缺口 | 同時登規格書 §14 與母 progress 遺留 | §5 階段 9、§7 |
| E8 | 資料時間、資料版本、慢更新放哪一層 | 移到 `useAdminList`，`SLOW_UPDATE_MS` 登記退場條件 | §2.2、§2.3、§3.3 |

規劃者技術裁決（第三版新增，業主可推翻）：T9 抽出 `AdminConsole`（以 `user.id` 為 key 的分頁區）讓 store 的測試留在
`admin/` 內；T10 讀取失敗的錯誤字維持原文，「結果不明」固定文案只用在寫入（R2-P2-6 的 `AdminListError` 部分不採）；
T11 `AdminListError` 的 `message`／`retryLabel` 由頁面傳入（保住告警測試與 journey 離線檢查的字串）。

| 發現 | 落點 |
|---|---|
| R2-P1-1 身分與快取槽 | §2.2、§2.3、階段 2、5 |
| R2-P1-2 舊閉包 `reload` | §2.2、階段 1a、4c |
| R2-P1-3 `isConfirmed` 與載入更多 | §2.2、§2.9、階段 1a、1b |
| R2-P1-4 回報文字只出現一次 | §4.3、§4.5、階段 4c |
| R2-P1-5 紅燈期改寫清單 | §4.5 |
| R2-P1-6 導覽列遮住錯誤框 | §4.3、§4.4、§1.4、驗收清單 |
| R2-P1-7 e2e 情境 3 時序 | §5 階段 8 |
| R2-P1-8 停用原因未接齊 | §2.6、§4.1、§4.2 |
| R2-P2-1 失敗與逾時保留舊列 | E2 |
| R2-P2-2 10 分鐘門檻 | E5 |
| R2-P2-3 首次載入的慢更新 | §2.3、§4.1（`message`）、§4.2（`isUpdating`） |
| R2-P2-4 資料時間的時鐘 | §2.3、§2.6 |
| R2-P2-5 焦點後備 | §4.3、§4.4 |
| R2-P2-6 結果不明的判斷與文案 | §2.7、§4.3（T10） |
| R2-P2-7 公告頁重試鈕 | §4.3 |
| R2-P2-8 匯出進度語意 | §2.10（E6） |
| R2-P2-9 證件審核排列與錯誤區 | §4.4 |
| R2-P2-10 骨架契約 | §4.1 |
| R2-P2-11 「重試」字串、巡檢涵蓋 | §3.4、§4.5（T11）、階段 8 |
| R2-P2-12 驗收清單可勾性 | §5 驗收清單 |
| R2-P2-13 空結果刪舊條目 | §2.3 |
| R2-P2-14 整數戳 | §2.3 |
| R2-P2-15 最後一頁後的掛載檢查 | §2.10 |
| R2-P2-16 列上匯款欄位 | E2、§2.5 |
| R2-P2-17 fence 不擋顯示 | E3 |
| R2-P2-18 批次框快照 | §2.6 |
| R2-P2-19 第三處時序例外 | E4、§1.3 |
| R2-P2-20 規格書草稿措辭 | §5 階段 9 |
| R2-P2-21 母計畫同步漏項 | §5 階段 9 |
| R2-P2-22 後端缺口登規格書 | E7 |
| R2-P2-23 測試與 403 範圍 | §2.1、§2.3、階段 5、6、7 |
| R2-P2-24 `dispose` 觀測接縫與 StrictMode | §2.4（T9）、§3.6 |
| R2-P2-25 後台專用輸出 | E8 |
| R2-P2-26 `WithdrawalManagement` 職責 | §3.4 |
| R2-P2-27 階段拆分 | §5（1a／1b、4a／4b／4c） |
