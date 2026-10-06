# admin 資料快取（S5／工項 A4）規劃書

> 母計畫：`docs/plans/platform-uiux-redesign/`（plan.md §2.5 根因、§3 A4 四條硬約束；
> construction-plan §3 S5 九條；progress 遺留「S3 審查遺留 → S5」「S4 遺留」）。
> 分支 `feature/admin-data-cache`。施工鷹架，`/tdd-implement` 收尾時整個目錄刪除。
> 行號以 develop `828ad4f` 為準。
>
> **第二版（2026-10-06）**：依 `review.md` 第一輪（去重後 P0×1／P1×13／P2×32）與業主裁決
> D1–D8 修訂；每條發現的落點見 §8 回填對照。

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
  保留舊資料**）、§6（三態）、§12.11（「重試」是唯一出路時用流程鈕；兩顆並排時次要左主要右、
  手機等寬）、§13 第 4 條（不先閃 0、區塊讀取失敗用中性字）。

### 1.2 驗收情境

1. 首次進 `/admin`：提領的統計、列表（桌機另有匯款作業面板）都是同形骨架，資料到位前不先閃
   「$0／0 筆」。
2. 提領篩「待處理」→ 切到會員 → 切回提領：回到「待處理」，列表與件數**立即**出現、沒有骨架；
   更新中列表 `aria-busy`（慢網路下降透明度）、筆數行接「更新中，暫停操作」，寫入入口、勾選、
   複製、CSV、查看證件／歷史全部停用，待匯款總額與匯款作業面板顯示骨架；完成後恢復。會員分頁
   （含「會員列表／證件審核」子分頁）、公告分頁同理。
3. 背景更新失敗：列表換成中性錯誤字＋「重試」（`role="alert"`），統計顯示「—」、作業面板不顯示；
   按重試先出骨架。
4. 背景更新超過 15 秒仍未回來：舊資料改回骨架並寫「更新較久，仍在等待伺服器回應」，重新整理鈕
   恢復可按（不自動重送）。
5. 證件審核與系統告警：切回時照舊出骨架（排除清單，§2.5）。
6. 手動「重新整理」：焦點留在鈕上、圖示轉動、報讀「正在更新」→「已更新」（失敗念「更新失敗」）。
7. 退件／標記已匯款／代為完成／批次匯款之後：列表背景重讀、不換骨架。成功回報出現在工具列下方
   （不捲動，由常駐宣告區播報），焦點落在該筆的列或卡片上；動作失敗也出現在工具列下方，捲進視線
   並取得焦點，列表自動背景重讀一次。
8. 匯款作業面板與四個確認框寫「資料更新於 N 分鐘前」；超過 10 分鐘改成提示「建議先重新整理」。
9. CSV 匯出只在資料確認後可按；匯出中其他三個分頁停用、工具列下方顯示「匯出中（已收集 N / M 筆），
   完成前無法切換分頁」；匯出失敗或超過上限時列表照常顯示；離開 `/admin` 就停止、不下載。
10. 離開 `/admin`、登出、session 過期、管理員權限被撤（最遲在下一次讀取回 403 時）之後：快取清空，
    再進來重新出骨架。
11. `sessionStorage`／`localStorage` 從未寫入任何 admin 資料。

### 1.3 不做

- 不動 API、資料庫、`supabase/functions/`、`src/utils/apiClient.ts`、`AdminRoute.tsx`。
- 請求時序：每次掛載照舊各打一次，不預載、不輪詢、不加視窗 focus 重抓、更新慢也不自動重送。
  只有兩處例外：單筆提領動作失敗後自動背景重讀一次（業主裁決 D5）、「重開在途」補讀一次
  （prompt 第 5 條）。
- 不快取：會員詳情、證件審核佇列、系統告警、導覽列 badge、空結果、會員搜尋結果、帶日期或搜尋
  條件的提領查詢（§2.5）。切回時會員搜尋字不保留。
- 不碰 `DataCacheContext` 與會員區 hook（S7 範圍，§2.4）。
- 不把 `SystemNotifications`／`SystemAlerts` 的取數搬進 `AdminDashboard`（§3.1，登記遺留）。
- 不加匯出「取消」鈕（離開 `/admin` 即停止）；不改導覽列 badge 的取數時機（登記遺留，§7）。

### 1.4 承接遺留逐條裁決（第 5 條）

「來源」：**點名**＝S5 開工 prompt 或母計畫遺留點名給 S5；**同類**＝S5 規劃時同類掃描併入；
**審查**＝第一輪審查追加；**業主**＝業主裁決。

| 來源 | 遺留／追加 | 裁決 | 落點 |
|---|---|---|---|
| 點名（S3 #9） | 匯出中切分頁雙下載 | **做**：匯出期間其他分頁停用＋進度說明（D4），卸載後收集迴圈停止不下載 | §2.10、階段 7 |
| 點名（S3 #10） | 會員頁「載入更多」中送出搜尋的競態 | **做**：請求序號（兩個方向都擋，§2.9） | 階段 1、5 |
| 同類 | 提領頁載入更多中換篩選、快速連換篩選的晚到覆蓋（`WithdrawalManagement.tsx:199-242` 同樣沒有序號） | **做** | 階段 1、4b |
| 點名（S3） | CSV 匯出失敗／超上限走 `setLoadError`，整張列表被換成錯誤區 | **做**：動作錯誤改獨立狀態 | §4.3、階段 4b |
| 同類 | 單筆動作失敗（`:311-312`）、批次部分失敗（`:274-276`）同一個病 | **做** | §4.3、階段 4b |
| 審查 | 載入更多失敗與首頁讀取失敗共用 error，已顯示的列被整片換掉 | **做**：`loadMoreError` 獨立 | §2.2、階段 1 |
| 點名（S3） | `AdminToolbar` 重新整理焦點掉 body、沒有狀態宣告 | **做** | §4.2、階段 3 |
| 點名（S3 #15） | `SystemAlerts` 自刻的重新整理鈕（`SystemAlerts.tsx:87-90`） | **做**：改用 `AdminToolbar`（`filter` 選填） | 階段 6 |
| 點名（S3） | 「已匯出 N 筆」在工具列上方造成位移 | **做**：回報移到工具列下方 | §4.3、階段 4b |
| 點名（S3） | 驗收站 2 目視項（放大鏡焦點環、`type="search"` 清除鈕） | **不做**：留在驗收站 2 | — |
| 點名（S4） | `detailSeq` 收斂成一個 hook，含「重開在途」補讀窗口 | **做**：`createLatestRequest`／`useLatestRequest` | §2.9、階段 1、5 |
| 點名（S4） | `list.reload()` 期間關面板焦點掉 body | **自然消失**（背景重讀不卸載「查看」）；補回 S4 TDD 期收窄掉的斷言當證據 | 階段 5 |
| 點名（S4） | `IdReviewQueue` 三處 `name ?? …`（`:116,166,186`） | **做**：退場條件「證件審核下次改動時」成立，改用 `memberLabel` | 階段 5 |
| 審查 | `IdReviewQueue.act` 沒有 catch，失敗無訊息（`:55-63`） | **做**：錯誤區＋背景重讀 | 階段 5 |
| 業主（D7，原 S2e→S3 孤兒遺留） | 證件審核卡「退回在左、通過在右」，手機等寬 | **做** | §4.4、階段 5 |
| 同類＋審查 | 公告讀取失敗只彈 toast、列表顯示「尚無公告」（把失敗讀成空） | **做**：補錯誤態（與母計畫 S7 的 F3 三態巡檢重疊，S7 列註記已處理） | §4.1、階段 6 |
| 點名（S4） | 近期提領只有 10 筆、無總筆數 | 不做（後端工項） | — |
| 點名（S4） | `apiClient` 沒有逾時 | 不做（全站工項）；本工項以 15 秒慢更新提示緩解（§2.6） | — |
| 點名（S4） | `ui/dialog.tsx` 關閉鈕名稱是英文「Close」 | 不做（與快取無關） | — |
| 點名（S4） | 停權端點非冪等 | 不做（後端 `/fix-bug`）；它是「會員詳情不快取」的反例之一（§7） | — |

## 2. 系統設計

### 2.1 資料流

- 現況：`AdminDashboard` 定義取數函式、以 props 注入提領與會員兩頁（`AdminDashboard.tsx:19-97`）；
  公告、告警在元件內直接打 `apiClient`。Radix Tabs 只掛 active 分頁，切換＝卸載→重掛→state 歸零→
  重抓→骨架。
- 之後（三層，§3.3）：
  - `usePagedList`（`src/hooks/`，通用）：請求序號、背景重讀、`meta`、確認旗標、`initial` 種子與
    `onLanded` 回呼——不知道快取存在。
  - `useAdminList`（`src/components/admin/`，新）：組合 `usePagedList` 與快取 store——從 store 讀種子、
    落地時寫回、403 時整體失效。
  - `createAdminCache()`（`src/components/admin/adminCache.ts`，新）：記憶體 store，由 `AdminDashboard`
    建立、以 `cache` prop 注入四個分頁與 `IdReviewQueue`。
- 取數函式與請求參數不變。

### 2.2 `usePagedList` 契約（通用；型別相容，`reload` 的呈現改變）

| 時機 | 畫面上有**本鍵**資料（`initial` 種子或本次已載入） | 沒有 |
|---|---|---|
| 掛載／換鍵 | 先顯示、未確認，**同一個 render** 就 `isRevalidating`；立即重讀 | 骨架（`isLoading`）＋讀 |
| `reload()`（手動、寫入後） | 保留列表、`isRevalidating` | 骨架 |
| 重讀成功（最新 ticket） | 換新資料、`isConfirmed`、`dataVersion+1`、`fetchedAt` 更新、呼叫 `onLanded` | 同左 |
| 重讀失敗（最新 ticket） | 錯誤態：不再顯示舊列（之後的 `reload` 出骨架） | 錯誤態 |
| 被作廢的 ticket 結算 | **不改任何 state 與旗標**（含 `isLoadingMore`），不呼叫 `onLanded` | 同左 |
| 重讀超過 15 秒 | `isSlow`：改回骨架＋「更新較久」；`reload` 可再按（新 ticket，舊的作廢） | — |
| `loadMore()` | 只在 `isConfirmed` 時接受（UI 以 `canLoadMore` 控制鈕）；帶當下 ticket，回來時已非最新就丟棄；失敗寫 `loadMoreError`、列表保留 | — |

- 輸出：`items`、`total`、`meta`、`isLoading`、`isRevalidating`、`isConfirmed`、`isSlow`、`error`、
  `loadMoreError`、`isLoadingMore`、`canLoadMore`、`dataVersion`、`fetchedAt`、`reload`、`loadMore`。
- `isConfirmed`＝本鍵最新一次請求已成功落地、其後沒有在途請求、沒有錯誤。**所有寫入依據只看它**
  （§2.6），不准各頁自組 `isLoading || isRevalidating`。
- 旗標由 ticket 導出：第一個 render 與換鍵那個 render 同步算出，不等 effect。
- `initial`：本鍵的種子（items／total／meta／fetchedAt）；`onLanded(snapshot, { requestedAt })`：
  最新 ticket 成功落地時呼叫，`requestedAt` 取請求送出時的 `performance.now()`（單調時鐘）。
- 有種子時以 `key` 為唯一身分（`useAdminList` 傳 `deps: [key]`），不再由呼叫端另組 deps。
- 單頁清單（公告、告警）以 `total = items.length` 使用，不會出現「載入更多」。

### 2.3 `useAdminList` 與快取 store（約束 a、c）

`createAdminCache()`：純記憶體，介面：

```ts
read(key): Snapshot | undefined
write(key, snapshot, requestedAt): void   // 較舊的 requestedAt、或早於該資源最後一次失效者，丟棄
invalidate(event: AdminMutationEvent): void // 只能依對照表（§2.7）刪鍵；同時記失效時間（fence）
readView() / writeView(partial)             // 切回位置：提領狀態篩選、會員子分頁（D3）
dispose(): void                             // 清空資料與 view，之後的 write 一律忽略
```

- **沒有逐鍵刪除**：失效只能經對照表，從結構上杜絕手動散清。
- **鍵由型別化 builder 產生**，頁面不手組字串：`adminCacheKey.withdrawals({ status, from, to, search })`
  在帶日期或搜尋時回 `null`（不快取，避免日後接上「提領依會員搜尋」時鍵碰撞）；
  `adminCacheKey.members({ search })` 只在空白搜尋時有鍵；`adminCacheKey.announcements()`。
  鍵上限：提領 5、會員 1、公告 1。
- **空結果不寫入**（視同未命中）：「目前沒有提領申請」這種肯定句不能拿快取當真。
- `useAdminList({ cache, key, load, pageSize })`：`key` 為 `null` 或沒有 `cache` 時不讀不寫，其餘行為
  同 `usePagedList`；讀取回 403（錯誤物件帶 `status`，見 `apiClient.ts` 的 `ApiError`）時
  `cache.invalidate('accessLost')`——清空全部快取與 view。401 已由 `apiClient` 登出並導去 `/login`。
- `usePagedList` 不 import 任何 admin 模組：`src/appShell.test.ts:58-86` 的「admin/ 組裝邊界契約」
  禁止 `components/admin/` 以外的檔案（含測試）匯入它。hook 測試用假的種子與回呼；真 store 只出現在
  `admin/` 內的測試。

### 2.4 生命週期（第 2 條）

- 建立：`AdminDashboard` 讀 `UserContext`，以 `user.id` 當 key 掛分頁區；分頁區用 `useState` 初始化
  建立 store。使用者 id 一變，分頁區連同 store、匯出狀態與各分頁 state 整個重掛。
- 清除：分頁區卸載時 effect cleanup 呼叫 `dispose()`（repo 未啟用 StrictMode，`src/main.tsx:13`；
  日後若啟用，改成在 effect 內建立 store）。
  - 離開 `/admin`：卸載。
  - 登出：`setUser(null)` → `AdminRoute` 導去 `/login`（`AdminRoute.tsx:20-22`）→ 卸載。
  - session 過期：401 → `apiClient` 登出＋`emitSessionExpired` → `/login`（`App.tsx:222`）→ 卸載。
  - 管理員權限被撤：最早在視窗 focus 重抓 `/profile` 後 `isAdmin` 變 false → 導去 `/dashboard` → 卸載；
    在那之前任何後台讀取回 403 → `accessLost` 清空（§2.3）。
  - 直接換成另一位管理員（`SIGNED_IN` 不同 id，`App.tsx:193`）：靠上面的 `user.id` key 重掛。
- 測試（階段 7）：`UserContext`＋`AdminRoute`＋`AdminDashboard` 整合測試——登出、`isAdmin→false` 後
  `dispose` 被呼叫、重進出骨架；換使用者不顯示前一位的資料。`UserContext` 的替身沿用 repo 慣例
  （`vi.mock('../App')`，例：`MyQrPage.test.tsx:18-21`）。
- **為何不沿用 `DataCacheContext`**（只沿用它的模式：讀取時水合、`MUTATION_GROUPS` 式對照表）：
  1. 它把整份快取寫進 `sessionStorage`（`DataCacheContext.tsx:166-172`）——直接違反約束 (a)；
  2. 它掛在 App 根（`App.tsx:464`），只在 `SIGNED_OUT` 清（`App.tsx:201-202`），離開 `/admin` 不清、
     同分頁直接換帳號也不清；
  3. `CacheKey` 是固定聯集（`:31-50`），後台要依篩選參數化的鍵。
  兩套快取的收斂條件登記為遺留（§3.6）。

### 2.5 快取範圍與排除清單（約束 b）

| 資料 | 快取 | 切回時 | 理由 |
|---|---|---|---|
| 提領列表第一頁（狀態篩選五種各一鍵，不含日期與搜尋） | ✅ | 先顯示、未確認、閘門關 | 主要動線 |
| 提領件數（待處理／待查收／已完成） | ✅ 隨列表 | 先顯示、降透明度 | D2 |
| 提領**待匯款總額** | ✅ 隨列表 | **未確認前骨架** | 對網銀轉出總額用的金額（`20260802000006_withdrawal_stats.sql:5-7`、`WithdrawalManagement.tsx:643-644`），D2 |
| 匯款作業面板五欄（桌機面板、手機展開卡） | 隨列表 | **未確認前骨架** | 匯款的指定介面 |
| 會員列表第一頁＋統計（只限空白搜尋） | ✅ | 先顯示、降透明度 | 列上只有讀取（「查看」）；搜尋結果不快取，不在記憶體累積被查詢者 |
| 公告列表 | ✅ | 先顯示、未確認、刪除停用 | |
| 切回位置（提領狀態篩選、會員子分頁） | ✅ view | 回到原處 | D3；搜尋字不保留 |
| 會員詳情 | ❌ | — | 停權／授予確認框的依據（`MemberManagement.tsx:373-403` 讀 `detailFor`）；每次「查看」現讀 |
| 證件審核佇列（清單與待審筆數） | ❌ | 骨架 | 即時資料（plan.md §1 P4），也是通過／退回的依據 |
| 系統告警 | ❌ | 骨架 | 即時資料 |
| 導覽列待處理 badge | ❌ | — | `Navbar.tsx:42-51` 只在 `isAdmin` 變化時抓一次，是**載入當下的快照**（既有），不經後台快取；寫入後不更新列遺留（§7） |
| 空結果 | ❌ | 骨架 | §2.3 |
| 確認框內容（標記已匯款的金額與帳號末五碼 `:430-431`、退件含手續費點數 `:469`、批次姓名與合計 `:552-562`、代為完成對象） | 不另存 | — | 取自點擊當下那一列；開框的鈕只在 `isConfirmed` 時可按 |

### 2.6 確認閘門（約束 b 的執行方式）

- **停用的入口（`!isConfirmed` 時，原生 `disabled`）**：提領——標記已匯款、退件、代為完成、勾選與
  批次匯款、複製帳號、CSV 匯出、查看證件、查看歷史、載入更多；證件審核——通過、退回、載入更多；
  公告——刪除；告警——標記已處理；會員——載入更多（「查看」是讀取，不停用）。
- **原因說明**：既有「已顯示 X / Y 筆」行在未確認時接「・更新中，暫停操作」（不增列高），停用的入口以
  `aria-describedby` 指向它（`IdReviewQueue.test.tsx:6-8` 記載的標準：只灰不說原因是 a11y 反模式）。
- **骨架而非舊值**：匯款作業面板五欄（`WithdrawalFundingFields` 加 `pending`）與待匯款總額。
- **勾選清除**（原 `fetchWithdrawals` `:210-214` 的不變式搬到新家）：`dataVersion` 一變（重讀成功、
  換鍵）與批次完成時清空勾選。
- **失敗**：錯誤態只留錯誤字與重試——統計顯示「—」、作業面板與勾選列不顯示。
- **慢更新**：15 秒仍在途 → `isSlow`，舊資料改回骨架（§2.2）。
- **資料時間（D1）**：作業面板與四個確認框（標記已匯款、退件、代為完成、批次）顯示「資料更新於 N 分鐘前」
  （`fetchedAt`；面板每分鐘本地更新一次文字，不發請求）；≥ 10 分鐘改成提示「建議先重新整理」。
- **保證的範圍**：閘門保證「快取不讓寫入依據比沒有快取時更舊」——本次掛載的最新讀取落地前，任何寫入、
  匯出、作業面板都拿不到快取值。它**不**保證按下當下的資料是新的：同一頁停太久（切去網銀再回來）、
  同帳號開兩個分頁，資料一樣會過期，這與現況相同；資料時間提示是緩解，根治列遺留（§7）。

### 2.7 mutation → invalidation 對照表（約束 c）

`ADMIN_MUTATION_GROUPS`（`adminCache.ts`；`invalidate` 的型別只收表內事件）：

| 事件 | 呼叫點 | 失效 | 理由 |
|---|---|---|---|
| `withdrawalStatus`（標記已匯款／退件／代為完成） | `WithdrawalManagement` 單筆動作 | 全部 `withdrawals` 鍵 | 該筆在狀態篩選之間移動、件數與金額改變 |
| `withdrawalBatchPaid`（批次匯款） | `runBatch` | 全部 `withdrawals` 鍵 | 同上 |
| `memberSuspend`（暫停／恢復） | `MemberManagement.runAction` | `members` 鍵 | 列上停權徽章、統計「暫停」 |
| `memberAdmin`（授予／撤銷） | 同上 | `members` 鍵 | 列上角色徽章、統計「管理員」 |
| `announcementCreate`／`announcementDelete` | `SystemNotifications` | `announcements` 鍵 | |
| `accessLost`（任何後台讀取回 403） | `useAdminList` | 全部鍵＋view | 權限已失，PII 不再可達 |

不入表、但逐一確認過的寫入：

| 寫入 | 為什麼不影響任何快取鍵 |
|---|---|
| 證件審核通過／退回 | 佇列不快取；`idVerificationStatus` 雖在會員列資料裡，列上不顯示（只在詳情，詳情不快取）；`admin_review_id` 只改審核狀態與理由欄，證件照路徑不變，提領列不受影響（`20260802000003_admin_id_review.sql:72-78`） |
| 告警標記已處理 | 告警不快取 |

規則：
- 失效＝刪鍵並記 fence：fence 之前送出的讀取晚到時不得寫回（擋「失效前送出、失效後才落地」把舊列
  復活）。
- 寫入成功就失效；**結果不明的失敗**（網路錯誤、5xx——可能已提交）同樣失效並 `markChanged`；4xx
  驗證錯誤不失效。批次有任一筆成功就失效。
- `invalidate`／`markChanged` 不包在「元件仍掛載」的檢查裡：寫入在途時切走分頁，仍要失效。
- 單筆提領動作失敗後，列表自動背景重讀一次（D5）——現況是列表被換成錯誤字、要手按「重試」，請求數
  相同；失敗多半代表那一列已被別人改過，不重讀就讓過期的那列繼續可按。
- 表上沒有的：其他管理員或會員造成的變更——看不到，由「每次掛載都重讀」涵蓋。

### 2.8 切回位置（D3）

- store 的 view 存：提領狀態篩選（預設「全部」）、會員子分頁（預設「會員列表」）。分頁重掛時以它們為
  初始 state，變更時寫回。會員搜尋字不存。
- 回到原篩選時，若該鍵有快取就立即顯示（§2.2），否則出骨架。

### 2.9 請求序號收斂成一個 hook（第 5 條）

`src/hooks/useLatestRequest.ts`：純核心 `createLatestRequest()`（node 可測）＋`useLatestRequest()`
薄殼（`useRef` 持有一份核心）。

- `begin(entityId?)` → ticket：遞增序號、作廢之前的；帶 `entityId` 時記下該對象的變更版本。
- `peek()`：取目前序號不遞增；`isLatest(ticket)`。
- `markChanged(entityId)`：該對象版本 +1；`changedSince(ticket)`：ticket 發出後該對象是否變過。

使用者：
- `usePagedList`：`reload`／換鍵 `begin()`；`loadMore` 只在已確認時接受並帶 `peek()`；非最新的回應
  不寫 state、不改旗標、不呼叫 `onLanded`。兩個方向都擋：reload 在途時不能開始 loadMore；loadMore
  在途時 reload 開始即作廢它。
- `MemberManagement`：`detailSeq`／`bumpSeq`／`isLatest`（`MemberManagement.tsx:159-175`）換成它；
  動作成功或結果不明時 `markChanged(target.id)`；`openDetail` 的讀取落地時若 `changedSince` 就再讀
  一次——關掉 S4 遺留 D 的窗口（動作在途時關面板、重開同一位、讀取還在途時動作才成功）。

### 2.10 匯出（D4）

- 只在 `isConfirmed` 時可按；收集範圍一律以確認過的 `total` 為準。
- `WithdrawalManagement` 加 `onExportingChange?(busy)`；`AdminDashboard` 在匯出期間把其他三個分頁
  `disabled`（Radix 鍵盤導覽跳過停用的分頁）；匯出狀態放在以 `user.id` 為 key 的分頁區內。
- 工具列下方顯示「匯出中（已收集 N / M 筆），完成前無法切換分頁」（`AdminToolbar` 加
  `exportProgress`）。
- 收集迴圈每頁之間檢查元件仍掛載；卸載就停止、不下載。

### 2.11 API／資料庫

零變更（端點、參數、回應形狀、migration 全不動）。

## 3. 架構影響

### 3.1 DI 裁決（約束 d）：注入式 fetcher 的快取 hook

`AdminDashboard.tsx:19-20` 的慣例：「取數／送出走這裡、畫面只吃 props——元件測試才不用替身掉整個
網路層」。裁決：**hook 不 import `apiClient`**，只接受呼叫端給的 `load`；快取 store 由
`AdminDashboard` 建立、以 `cache` prop 注入。

| | 注入式（採用） | hook 內含 fetch（不採用） |
|---|---|---|
| 取數位置 | 維持在 `AdminDashboard` | 移進 hook，檔頭慣例變成假的 |
| 元件測試替身 | 照舊傳 `vi.fn()` 取數函式；要驗快取就傳真的 `createAdminCache()`（純記憶體，不需替身） | 每支元件測試都要 mock `apiClient` |
| 既有測試 | 不傳 `cache`＝不跨卸載保留 | 替身方式全面改寫 |

- 殼層測試（`AdminDashboard.test.tsx`）照舊替身 `apiClient`——殼層本來就擁有真的取數函式。
- `SystemNotifications`／`SystemAlerts` 現況在元件內呼叫 `apiClient`（與慣例不一致是既有狀態）。
  本 PR 不搬，真實理由：兩支既有測試全以 `vi.mock(apiClient)` 替身（`SystemNotifications.test.tsx:13`、
  `SystemAlerts.test.tsx:19`），改成 props 注入要改寫全部替身，而快取不需要它——它們把模組層的取數
  函式交給 `useAdminList`，hook 仍是注入式。登記遺留：兩支改走 props 注入，退場條件＝下次改這兩頁的
  資料層時。

### 3.2 分頁掛載裁決（第 3 條）：維持「非 active 不掛載」＋快取水合，不用 forceMount

| | 不掛載＋水合（採用） | forceMount 全掛 | 首次造訪後常駐 |
|---|---|---|---|
| 首進請求數 | 1（同現況） | 4（等於預載，違反 §1.3） | 1 |
| 切回請求數 | 1（同現況） | 0，要另接「切回時刷新」 | 0，同左 |
| 記憶體 | 提領 ≤ 5 鍵×50 列、會員 50 列、公告全量的純資料 | 四棵元件樹＋DOM 常駐 | 造訪過的元件樹＋DOM（含載入更多的頁）常駐 |
| PII 位置 | 非 active 分頁只在 JS heap | 未遮罩身分證與帳號常駐隱藏 DOM | 同左 |
| 測試 | DOM 與現況相同 | 隱藏節點讓 `getByText`／e2e 文字定位器多出重複 | 同左 |

結論不靠「DOM 與 JS heap 可見性不同」那條（那條只算深度防禦）：請求數、記憶體、測試三欄已足夠。
代價：匯出中切分頁要另外處理（§2.10）。

**背景刷新的觸發：每次掛載（切回）都刷新，不設 stale 時間**。(1) 請求數與時序與現況完全相同；
(2) 提領列是匯款依據，TTL 內不刷新＝寫入依據未經確認；(3) 提領列裡的證件照是 1 小時的簽名網址
（`api/index.ts:1144`），不刷新會留著過期連結。會員區的 `SOFT_TTL` 30 秒（`DataCacheContext.tsx:81`）
是為了 F5 與快速切頁的請求風暴，後台切分頁是人的節奏，不適用。

### 3.3 hook 分層與 friction-log 的 `usePagedList` 教訓

`docs/plans/friction-log.md:746-749`：「SWR 式背景重抓硬併進 `usePagedList` 只會讓 hook 長出只有它用
的選項……判準是『守的是同一條規則』」。本工項的切法：

- 進 `usePagedList` 的，是**所有清單都該守的規則**：不靜默截斷（既有）、載入更多失敗不清空已顯示的
  資料（既有，本次補上 `loadMoreError` 讓畫面真的做到）、最後意圖勝出（序號）、重新驗證中保留舊資料
  （ui-ux §5 的通則，不是後台專用）、確認前不得當依據。`initial`／`onLanded` 是不帶語意的擴充點。
- 只有後台需要的——記憶體快取、鍵、對照表、fence、view、403 清空——全部放在 `admin/` 的
  `useAdminList`／`adminCache.ts`，`usePagedList` 不知道它們存在。
- 單頁清單（公告、告警）用 `usePagedList` 時 `total = items.length`，檔頭註明。

### 3.4 動到的模組

- 新增：`src/hooks/useLatestRequest.ts`、`src/components/admin/adminCache.ts`、
  `src/components/admin/useAdminList.ts`、`src/components/admin/AdminListSkeleton.tsx`、
  `src/components/admin/AdminListError.tsx`（共用的列表讀取錯誤區，§4.3）
- 修改：`src/hooks/usePagedList.ts`、`src/components/AdminDashboard.tsx`；`src/components/admin/` 的
  `WithdrawalManagement`（改走 `useAdminList`）、`WithdrawalFundingFields`、`WithdrawalCardList`、
  `MemberManagement`、`IdReviewQueue`、`SystemNotifications`、`SystemAlerts`、`AdminToolbar`
- e2e：`features/admin_dashboard.feature`、`steps/admin_steps.py`、`mocks/backend_api_mock.py`、
  `pages/admin_dashboard_page.py`、`journey/tools/test_admin_row_targeting.py`
- 不動：`supabase/**`、`DataCacheContext.tsx`、`apiClient.ts`、`App.tsx`、`AdminRoute.tsx`、
  `ui/skeleton.tsx`（S6 可能動它）
- 與 S6／S7：S6 只動前台詳情頁與首頁，產品碼不撞；文件層 `ui-ux-guidelines.md` §5「已套用」那一行與母
  `progress.md` 兩邊都會改，後合併者 rebase。S7 改成等 S5、S6 都合併才開工（D8，階段 9 同步母計畫）。

### 3.5 PII 守衛（約束 a）

- **主防線：行為測試**（`adminCache.test.ts`、`AdminDashboard.test.tsx`）：以含身分證與帳號的測資走完
  寫入→讀取→失效→dispose 與「切走再切回」，`Storage.prototype.setItem` 零呼叫。
- **輔助：靜態守衛**（`src/utils/repoHygiene.test.ts` 新開 `describe('後台 PII 不得落地')`）：掃
  `src/components/AdminDashboard.tsx`、`src/components/admin/**`、`src/hooks/usePagedList.ts`、
  `src/hooks/useLatestRequest.ts`，**先剝除註解、排除 `*.test.*`**（沿用同檔的 `isSource`），不得出現
  `sessionStorage`、`localStorage`、`indexedDB`、`caches.`、`document.cookie`，也不得 import 會落地的
  模組（`DataCacheContext`、`formDraft`）；自測案例含「只在註解提到不算違規」。限制寫在註解裡：路徑
  列舉之外的新檔掃不到，所以行為測試才是主防線。

### 3.6 設計理由的長期落腳處

規劃目錄收尾會刪，「為什麼」要留在程式碼裡，日後有人想加 TTL 或常駐分頁時才有東西擋：
- `adminCache.ts` 檔頭：記憶體內與不落地的理由、為何不沿用 `DataCacheContext`（§2.4 的 1–3）、為何
  不設 TTL、排除清單與空結果不快取、§7 重複匯款反例一句。
- `useAdminList.ts` 檔頭：為何不 forceMount（§3.2 的請求數與記憶體）、確認閘門的保證範圍（§2.6）。
- `usePagedList.ts` 檔頭：§3.3 的分層判準。
- 母 progress 遺留：兩套快取的收斂條件（S7 之後評估 `DataCacheProvider` 能否支援不落地與參數化鍵）。

## 4. UI/UX

### 4.1 骨架

`AdminListSkeleton`：props `label`（必填，由頁面傳入，保留各頁既有名稱）、`variant: 'rows' | 'cards'`、
`count`；外層 `role="status"`＋`aria-label`＋`aria-busy`；內部只用 `div`（**不得**用 table／row role，
否則 page object 會把骨架當成終態表格）。只有列表骨架帶 `role="status"`；統計、作業面板的骨架
`aria-hidden`（避免與 page object 以子字串比對的 `get_by_role("status", name=…)` 撞名）。

| 分頁 | 現況 | 之後 |
|---|---|---|
| 提領 | 列表 3 條 `h-10`（`WithdrawalManagement.tsx:792-797`，手機內容是卡片卻用列形）；統計先顯示 `$0`／`0`（`:139-142,613-686`）；「已顯示 0 / 0 筆」（`:762-764`）；桌機作業面板到資料來才出現（`:690`） | 手機 cards、桌機 rows；統計骨架（手機摘要列取兩行高、桌機四卡）；筆數行保留高度的佔位；桌機作業面板佔位（結果為空時收掉）；名稱「載入提領申請中」不變 |
| 會員 | 列表同上（`MemberManagement.tsx:556-561`）；統計先閃 0（`:56,420-483`） | 手機 cards、桌機 rows；統計三卡骨架；名稱「載入會員列表中」不變 |
| 公告 | 置中 spinner（`SystemNotifications.tsx:233-236`） | cards（名稱「載入公告中」） |
| 告警 | 已是骨架（`SystemAlerts.tsx:93-103`），沒有 role 與名稱 | 手機 cards、桌機 rows（名稱「載入告警中」） |
| 證件審核 | 已是同形骨架（`IdReviewQueue.tsx:65-72`） | 不動 |

### 4.2 更新中的呈現與工具列

- 列表區包成 `<section aria-label="提領申請列表">`（會員「會員列表」、公告「公告列表」、告警「告警列表」）：
  更新中 `aria-busy="true"`；降透明度延遲約 300ms 才出現（設計決定：快網路下不閃；ui-ux §5 本身沒有
  這個數字，階段 9 寫進去）。統計區同樣處理。取捨：停用的寫入鈕是立即灰化（安全優先），快網路下會
  比列表早一點點變灰——接受。
- 「已顯示 X / Y 筆」行在未確認時接「・更新中，暫停操作」（§2.6）。
- `AdminToolbar` 新契約（取代 `isRefreshing`）：
  - `isUpdating`：背景更新中——重新整理鈕 `aria-disabled`（**不用 `disabled`**：被按的鈕變停用正是
    焦點掉到 body 的原因）、點了不重送、圖示轉動（`motion-safe`）；`aria-disabled` 的灰化與游標樣式
    寫在 `AdminToolbar` 內（`Button` 基底只有 `disabled:` 樣式，`button.tsx:24`）。
  - `refreshDisabled`：真停用（載入更多中，焦點不在這顆鈕上）。
  - `updateError`：手動重新整理的結果，用來決定宣告「已更新」或「更新失敗」。
  - `exportProgress`：匯出進度（§2.10）。
  - `filter` 改選填：告警頁沒有篩選，只放重新整理鈕。
- 宣告：新增常駐 `aria-live="polite"` 區，**放在工具列 flex 行之外**（同既有匯出 `role="status"` 區的
  理由：sr-only 是絕對定位，留在行內會被 `test_admin_mobile_layout.py` 的列數量測算成第二列）。只有
  手動重新整理時說「正在更新」→「已更新」或「更新失敗」；更新途中再按（`aria-disabled`）也設「正在
  更新」；切回與寫入後的自動更新不宣告（每切一次分頁念一次很吵；寫入另有回報，§4.3）。不用
  `role="status"`——那是骨架的定位器（§4.5），會員頁既有的詳情讀取宣告也是同一個理由
  （`MemberManagement.tsx:495-502`）。

### 4.3 錯誤與回報

- **列表讀取失敗**：共用 `AdminListError`——中性字（`text-muted-foreground`，§13 第 4 條）＋流程鈕「重試」
  （§12.11：整區讀取失敗時重試是唯一出路，與提領台、證件審核既有一致）＋`role="alert"`。提領、會員、
  公告、告警四處共用；會員頁原本的次要重試鈕隨之改成流程鈕。
- **載入更多失敗**：`loadMoreError` 顯示在載入更多鈕旁，已顯示的列保留。
- **提領頁的動作回報**放在工具列正下方：
  - 成功（「已退件：王小明」「已匯出 N 筆」）：`StatusCallout` success＋「知道了」（現況）；由常駐的宣告區
    播報（先掛後填——隨文字插入的 live region 報讀器不保證播報，`AdminToolbar.tsx:99-101`）；不捲動。
  - 失敗（單筆失敗、批次「X 筆成功、Y 筆失敗」、匯出失敗、超過上限）：`variant="destructive"`＋
    `role="alert"`；**剛按下的動作**失敗時捲進視線並取得焦點，晚到的不搶焦點（比照
    `MemberManagement.tsx:176-178,195-202` 的 `errorRef`＋`focusErrorOnShow`）。
  - 收起時機：按「知道了」、下一個動作開始、換篩選、手動重新整理。
  - 確認框確認後，焦點落在該筆的列或卡片容器（`tabIndex=-1`）——觸發鈕此時是停用的，Radix 還給它
    會掉到 body；落在列上不會把手機畫面捲到頁首。

### 4.4 證件審核卡的按鈕（D7）

「退回」在左、「通過」在右（§12.11 次要左主要右），手機兩顆等寬（目前 `IdReviewQueue.tsx:198-215` 是
內容寬）。測試都以名稱定位，不影響定位器。

### 4.5 定位器契約（第 7 條）

| 定位器 | 位置 | S5 之後 | 處置 |
|---|---|---|---|
| `get_by_role("status", name="載入提領申請中")` | `e2e/pages/admin_dashboard_page.py:74,100`（journey f50、f70 共用） | 只在首次載入、換到沒快取的鍵、錯誤後重試、慢更新時出現；寫入後與切回改背景更新 | `_wait_list_settled` 另等「提領申請列表」的 `aria-busy` 消失；階段 4b 釘「成功回報出現的同一個 commit 內 `aria-busy` 已為 true」 |
| 字串「載入提領申請中」「目前沒有提領申請」「重試」 | `e2e/journey/tools/test_admin_row_targeting.py:126-135` | 字串仍在 `WithdrawalManagement.tsx`（`label` 由頁面傳入） | 加一條：`_wait_list_settled` 有等 `aria-busy`；區塊名稱同時出現在產品與 page object |
| `getByRole('status', { name: '載入提領申請中' })` | `WithdrawalManagement.test.tsx:106,110` | 不變（首次載入） | 不動 |
| `queryByRole('status')` 為 null | `MemberManagement.test.tsx:121`、`IdReviewQueue.test.tsx:61` | 不變——新宣告區刻意不用 `role="status"`、統計骨架 `aria-hidden` | 不動 |
| `getByRole('status')`（匯出宣告） | `AdminToolbar.test.tsx:76-98` | 不變 | 「沒有匯出能力的頁面不放狀態宣告區」改名為「…不放匯出狀態宣告區」 |
| 重新整理 `hasAttribute('disabled')` | `AdminToolbar.test.tsx:66-69`「重新整理中按不下去」 | 背景更新中改 `aria-disabled`、點了不呼叫 `onRefresh`、焦點不動 | 改寫斷言（不刪） |
| 重新整理 `hasAttribute('disabled')`（載入更多中、匯出中） | `WithdrawalManagement.test.tsx:618-693`、`MemberManagement.test.tsx:313-328` | 不變（`refreshDisabled`／`disabled` 仍是真停用） | 不動 |
| 工具列直接子元素的列數與間距量測 | `e2e/test_admin_mobile_layout.py:443-474`（`[data-slot="admin-toolbar"]`） | 新宣告區放在 flex 行之外，列數不變 | 不動；階段 8 跑一次確認 |
| `/admin` 各路由 375px 溢版 | `e2e/test_overflow_sweep.py` | 告警改用 `AdminToolbar`、新骨架與說明行 | 不動；階段 8 跑一次確認 |
| 「重新整理」按鈕名稱 | 告警頁（e2e 不點它） | 名稱不變 | 不動 |
| `get_by_role("button", name="標記已處理").first` | `e2e/steps/admin_steps.py` | 首次載入完成後可按 | 不動 |
| `get_by_role("tab", name=…)` | e2e、journey、`AdminDashboard.test.tsx` | 匯出中其他分頁 `disabled`，名稱不變 | 不動 |

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）＋測試（第 6 條）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `createLatestRequest`／`useLatestRequest`；`usePagedList` 序號（兩個方向）、旗標綁 ticket、背景重讀、`meta`、`isConfirmed`、`dataVersion`、`fetchedAt`、`loadMoreError`、`initial`／`onLanded`、15 秒慢更新 | `src/hooks/useLatestRequest.test.ts`（node，測核心）、`src/hooks/usePagedList.test.tsx` | 連換鍵 A→B→C 時 B 的結算不解開閘門；有種子的第一個 render 就未確認；reload 在途時 loadMore 被拒、loadMore 在途時 reload 作廢它；有本鍵資料時 reload 不回骨架；失敗後 reload 出骨架；`loadMoreError` 不清列表；15 秒進 `isSlow`；`changedSince` 只對被標記的對象成立；既有 5 條全綠 |
| 2 | `createAdminCache`（鍵 builder、fence、view、空結果不寫、`accessLost`、dispose）＋`useAdminList`（組合、403）＋PII 守衛 | `src/components/admin/adminCache.test.ts`（jsdom，要 `Storage`）、`src/components/admin/useAdminList.test.tsx`、`src/utils/repoHygiene.test.ts` | 失效前送出的讀取不得寫回；較舊回應不覆蓋較新條目；帶日期／搜尋與非空白會員搜尋回 `null` 鍵；空結果不寫；403 清空全部與 view；dispose 後寫入無效；`setItem` 零呼叫；靜態守衛剝註解後掃描、自測案例；`appShell.test.ts` 邊界契約仍綠 |
| 3 | `AdminToolbar` 新契約，兩個呼叫端同步改接（`refreshDisabled={isLoading \|\| isLoadingMore}`，`isUpdating` 先恆為 false，行為不變） | `AdminToolbar.test.tsx` | `isUpdating` 時 `aria-disabled`、焦點不動、點了不呼叫；手動重新整理宣告「正在更新」→「已更新」，`updateError` 時「更新失敗」，更新途中再按也宣告；宣告區在 flex 行之外；不帶 `filter` 也能渲染；`exportProgress` 顯示；提領與會員頁既有測試一字不改全綠 |
| 4a | 提領頁純遷移到 `usePagedList`（不加快取）：舊防線以等價旗標對應（舊 `isLoading` → `isLoading \|\| isRevalidating`，`canExport`、篩選、載入更多照舊擋）；`fetchWithdrawals` 的清勾選搬到 `dataVersion` 變化時；重讀呈現改為背景是階段 1 的通則 | `WithdrawalManagement.test.tsx`：既有測試**一字不改**；遷移前先補一條特徵測試「重新整理成功後已選取歸零」（舊碼上即綠） | 綠到綠，沒有紅燈（比照 S4「重構綠到綠→行為」）；特徵測試遷移前後皆綠 |
| 4b | 提領頁行為：`useAdminList` 快取、確認閘門（含 CSV、查看證件／歷史、複製、勾選、載入更多）、勾選清除、件數降透明度與金額骨架（D2）、作業面板骨架與資料時間（D1）、骨架統一、`AdminListError`、動作回報位置與焦點、失敗自動重讀（D5）、失效＋fence＋結果不明、`loadMoreError`、篩選保留（D3） | `WithdrawalManagement.test.tsx`、`AdminListSkeleton.test.tsx`、`AdminListError.test.tsx` | 帶快取重掛無骨架、首個 render 寫入入口與 CSV 即停用、確認後啟用；更新中 CSV 不以快取 `total` 收集；勾選在重讀成功、換篩選、批次完成後歸零；待匯款總額與作業面板未確認時是骨架、件數降透明度；資料時間文字與 10 分鐘提示；錯誤態統計「—」、作業面板不顯示、重試出骨架；匯出／單筆／批次錯誤不取代列表、在工具列下方、剛按的失敗取得焦點；確認後焦點落在該列；寫入成功與結果不明失效、4xx 不失效、批次全失敗不失效；單筆失敗自動重讀一次；成功回報出現時 `aria-busy` 已為 true；換篩選時在途的載入更多不接舊尾；篩選經 view 保留 |
| 5 | 會員頁＋證件審核 | `MemberManagement.test.tsx`、`IdReviewQueue.test.tsx` | 帶快取重掛無骨架（空白搜尋）；非空白搜尋不讀不寫快取；子分頁經 view 保留；搜尋時在途的載入更多不接舊尾；動作後重讀不換骨架、關面板焦點回到「查看」；停權／授予成功失效 `members`、4xx 失敗不失效；會員詳情每次「查看」都現讀；重開在途時動作才成功→面板補讀到新狀態；證件審核：重掛仍出骨架、重讀中通過／退回停用並有原因說明、失敗有錯誤區並重讀、以 `memberLabel` 稱呼、退回在左通過在右且手機等寬 |
| 6 | 公告＋告警 | `SystemNotifications.test.tsx`、`SystemAlerts.test.tsx` | 公告骨架取代 spinner、讀取失敗顯示 `AdminListError` 而非「尚無公告」、帶快取重掛無骨架、更新中刪除停用、建立／刪除會失效；告警改用 `AdminToolbar`、重掛仍出骨架、標記後背景重讀期間按鈕停用 |
| 7 | 殼層：讀 `UserContext`、以 `user.id` key 掛分頁區、建立與注入 store、卸載 dispose、匯出鎖分頁與進度、卸載後停止匯出 | `src/components/AdminDashboard.test.tsx`、`WithdrawalManagement.test.tsx` | 切走再切回不出骨架且照舊打一次 API；卸載再掛載出骨架；登出、`isAdmin→false` 後 dispose 被呼叫（整合 `AdminRoute`）；換使用者不顯示前一位的資料；匯出中其他分頁停用；卸載後收集停止、不呼叫 `link.click()`；全流程 `setItem` 零呼叫 |
| 8 | e2e＋journey page object | `e2e/features/admin_dashboard.feature`、`e2e/steps/admin_steps.py`、`e2e/mocks/backend_api_mock.py`、`e2e/pages/admin_dashboard_page.py`、`e2e/journey/tools/test_admin_row_targeting.py` | 三個新情境綠；`test_admin_mobile_layout.py`、`test_overflow_sweep.py` 照綠；`cd e2e/journey && pytest tools/ -q` 綠 |
| 9 | 文件（第 8 條） | — | `check-spec-drift.py`、`check-plans-scaffold.py`、`framework-check.sh` 綠 |

**階段 8 的 e2e 情境**（`e2e/` 是英文 Gherkin；扣住回應比照 `set_upload_photo_deferred`，不用 `sleep`）：

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
  And the withdrawal list stops responding
  And I reject the withdrawal from "王小明"
  Then I should see the text "已退件：王小明"
  And the withdrawal list shows "王小明" without a loading skeleton
  And the withdrawal list is refreshing
  When the withdrawal list responds again
  Then the withdrawal list is no longer refreshing
```

- 第三個情境走 journey 共用的 `AdminDashboardPage.reject_withdrawal`——`_wait_list_settled` 的改動原本只有
  晉升 PR 的 journey 跑得到，這條讓每個 PR 都走一次同一條路徑；「扣住」只影響之後的 GET（退件前的列表
  已落地）。
- 手機情境的 viewport 步驟沿用 `common_steps.py` 的「I am on a 375px-wide phone screen」。

**階段 9 的文件**：
- 規格書 §13（D6）：在後台模組表後新增一段，草稿：
  > **後台資料快取**：後台各分頁切回時，先顯示上次讀到的列表並在背景重讀；快取只存在記憶體，離開
  > `/admin`、登出、換帳號或讀取回 403 即清空，從不寫入 `sessionStorage`／`localStorage`（提領資料含
  > 未遮罩的身分證字號與收款帳號）。最新一次讀取完成前，所有寫入入口與 CSV 匯出停用，匯款作業面板與
  > 待匯款總額不顯示未確認的值。會員詳情、證件審核佇列、系統告警不快取，每次都現讀；導覽列的待處理數
  > 是載入當下的快照。快取保證的是「不讓寫入依據比沒有快取時更舊」——同一頁停留過久的資料仍會過期，
  > 介面以「資料更新於 N 分鐘前」提示。
- `ui-ux-guidelines.md` §5：「已套用」補「後台列表」；補一句後台規則（切回先顯示＋背景重讀、確認前寫入
  停用並說明原因、與匯款金額相關的值確認前用骨架、降透明度延遲 300ms 出現），不重複 §13 第 4 條。
- 程式碼檔頭：§3.6 三處；`AdminDashboard.tsx` 的 DI 註解補「快取 store 也在這裡建立、以 props 注入」；
  `admin_dashboard_page.py` 檔頭 docstring 同步。
- 母計畫：
  - construction-plan §1：S7 開工條件改成「S5、S6 皆合併」（D8）；§2 的 S5 重量由「中」調成「中偏重」，
    註明可能需要兩次對話（狀態在本目錄 `progress.md`）；§4.3 驗收 3 換成下方清單。
  - progress：S5 列；遺留結案（「S3 審查遺留 → S5」整條、「S4 遺留」中的序號收斂、焦點掉 body、
    `IdReviewQueue` 姓名三條、S2e 的證件審核鈕順序）；S7 列註記「公告錯誤態已由 S5 處理」與「`usePagedList`
    的 `reload` 已改背景重讀」；新增遺留——後端回傳 `idempotent`（§7）、兩個「失敗讀成零／空」的端點
    （§7）、導覽列 badge 寫入後不更新、`SystemNotifications`／`SystemAlerts` 改 props 注入（§3.1）、兩套
    快取收斂條件（§3.6）。
- 收尾 `git rm -r docs/plans/admin-data-cache`，跑 `check-plans-scaffold.py`。

**驗收 3 清單草稿**（寫進 construction-plan §4.3）：

前置：admin 帳號；develop 上至少一筆待處理、一筆待查收提領與幾位會員（提領總數 > 50 筆才驗得到匯出
進度，不足就跳過那一項）；第二個瀏覽器（或無痕視窗）登入同一個 admin，用來製造無害的變更；devtools
Network 先在一般網速載完，再切「Slow 3G」或「Offline」；確認框只看、按「取消」（develop 是共用的真後端）。

- 手機（375px，建議 LINE 內建瀏覽器）：
  - [ ] 首次進 `/admin`：統計摘要與卡片列表是骨架，沒有先閃 $0／0 筆
  - [ ] 提領篩「待處理」→ 會員 → 提領：回到「待處理」，卡片立即出現、沒有骨架
  - [ ] （Slow 3G）切回提領：卡片變淡、筆數行寫「更新中，暫停操作」、退件與代為完成按不下去；展開一張卡，
        匯款資訊是骨架；更新完自動恢復，展開卡寫「資料更新於…」
  - [ ] 會員 → 證件審核 → 提領 → 會員：回到「證件審核」，證件審核照舊出骨架；切到「會員列表」立即出現
  - [ ] （Offline）切回提領：列表換成錯誤字與「重試」、統計顯示「—」；恢復網路按重試，先出骨架再出資料
- 桌機：
  - [ ] 首次進 `/admin`：統計四卡、匯款作業面板、表格都是骨架
  - [ ] （Slow 3G）切回提領：表格變淡；標記已匯款／退件／代為完成、勾選、CSV、查看證件、查看歷史按不下去；
        待匯款總額與匯款作業面板是骨架，待處理等件數照常顯示（變淡）
  - [ ] 證偽「顯示值未過期」：在公告分頁載完後切到會員；第二個瀏覽器發布一則測試公告；切回公告時先看到
        舊列表（變淡），更新完那則公告出現；最後用第二個瀏覽器刪掉它
  - [ ] 作業面板寫「資料更新於 N 分鐘前」；停在頁面 10 分鐘以上，改成提示先重新整理；開「標記已匯款」確認框
        也看得到同一句（按取消）
  - [ ] 按重新整理：鍵盤焦點留在鈕上（再按 Tab 不從頁首開始），列表不換骨架
  - [ ] （提領 > 50 筆）按 CSV：其他三個分頁按不到，工具列下方顯示「匯出中（已收集 N / M 筆）」；完成後恢復，
        「已匯出 N 筆」在工具列下方、工具列沒有被往下推
  - [ ] 登出再登入、進 `/admin`：重新出骨架；devtools → Application → Session Storage／Local Storage 沒有
        任何提領或會員資料
  - [ ] （選驗，需報讀器）手動重新整理念「正在更新」「已更新」；沒有報讀器時用 devtools Elements 看工具列
        旁宣告區的文字變化

以 vitest／e2e 為準、不列人工項：寫入後的失效與 fence、請求序號、重開在途補讀、卸載後停止匯出、403 清空、
15 秒慢更新。

## 6. 開放問題

無未決。第一輪的 Q1–Q3 與審查新增題已由業主裁決 D1–D8（`review.md` 處置節），其餘技術題由規劃者
裁決 T1–T8（§8），業主可在第二輪審查時推翻。

## 7. 風險與回滾（第 9 條）

- **PII 在記憶體**：曝險面與現況相同——同一個 JS heap、DevTools／React DevTools 讀得到的是同一批欄位。
  差在兩點：存活時間由「分頁掛著時」延長為「待在 `/admin` 期間」，上限由離開 `/admin`、登出、換帳號、
  403 界定（§2.4）；資料量最多提領 5 鍵×50 列、會員 50 列與公告。不新增儲存媒介：不落 storage、非 active
  分頁不常駐 DOM（§3.2）；會員搜尋結果不快取。證件照簽名網址（1 小時）隨提領列在記憶體——現況分頁掛著
  時也在，且每次切回都換新。
- **過期資料成為寫入依據——反例（為什麼提領狀態與作業面板不能從快取直接當真）**：管理員 A 在提領頁看到
  王小明 1,000 P「待處理」，切到會員頁接客服電話 15 分鐘；這段期間管理員 B 已在網銀匯款，並把這筆標記
  已匯款。A 切回提領頁，若快取直接當真、按鈕可按：作業面板仍把王小明排在第一筆、狀態仍是待處理，A 照
  面板帳號在網銀再匯一次，回來按「標記已匯款」——後端 `admin_update_withdrawal_status` 對「已是待查收 →
  待查收」回 `success: true, idempotent: true`（`20260802000004_withdrawal_events.sql:108-109`；批次逐筆
  呼叫同一函式，也算成功），畫面照樣顯示「已標記匯款完成：王小明」。**重複匯款在系統裡沒有任何錯誤
  訊號。** 後端狀態機擋得住不合法的轉換，擋不住合法但重複的轉換，所以快取造成的過期只能由前端擋：
  確認閘門＋作業面板與金額確認前不顯示（§2.6）。同理，會員詳情若從快取顯示「未停權」而實際已被別人
  停權，A 按「暫停」會改寫真正的停權時間（停權端點每次覆寫 `suspended_at`，S4 遺留）——所以詳情不快取。
- **殘餘風險：同一頁停太久、同帳號雙分頁**：與現況相同，快取不讓它更糟；以資料時間提示緩解（D1）。根治
  需要後端：`/admin/withdrawals/:id/status` 與批次把 RPC 的 `idempotent` 吃掉了（`index.ts:1265-1272`，
  前端 `updateWithdrawalStatus` 也丟棄回應），應透傳或比對 `expectedStatus`——登記為後端 `/fix-bug` 遺留
  （金流，建議獨立 session）。
- **殘餘風險：既有端點把失敗讀成 200**：`/admin/withdrawals` 忽略統計的錯誤（`index.ts:1202-1224`，失敗時
  件數與金額全 0）、`/admin/announcements` 不檢查錯誤（:1671-1689，失敗回空清單）。快取會把這個假值當成
  一次成功的讀取。登記兩條後端 `/fix-bug` 遺留（比照 `/admin/system-alerts` 回 500）。
- **殘餘風險：導覽列 badge**：載入當下的快照，寫入後不更新（既有）；本 PR 不動 `Navbar`，登記遺留。
- **背景更新卡住**（`apiClient` 沒有逾時，S4 遺留）：寫入維持停用、作業面板與金額維持骨架；15 秒後舊資料
  也改回骨架、重新整理恢復可按（§2.2）。根治是全站逾時（既有遺留）。
- **共用 hook 改動**：`usePagedList` 的 `reload` 改成背景重讀，`MemberManagement`、`IdReviewQueue` 的重讀
  呈現隨之改變（不再換骨架）——受影響的既有斷言已盤在 §4.5；S7 改成等 S5 合併後才開工（D8）。
- **journey 晚發現**：page object 的改動只有晉升 PR 的 journey 跑得到 → 階段 8 的退件情境讓每個 PR 走同一條
  路徑，journey-offline 另有字串與結構檢查。
- **重量**：範圍比開工 prompt 預估大（十個階段），可能需要兩次對話；狀態全在本目錄 `progress.md`。
- **回滾**：純前端、無資料遷移——revert PR 即回到「每次切回重抓＋骨架」。

## 8. 第一輪審查回填對照

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

規劃者技術裁決（業主可推翻）：T1「查看證件／歷史」納入閘門；T2 空結果不快取；T3 殼層卸載顯式
`dispose`＋登出整合測試；T4 背景更新 15 秒慢提示（不另發請求）；T5 hook 分層（§3.3）；T6 階段 4 拆成
4a／4b；T7 讀取回 403 時整體清空；T8 列表讀取錯誤區四頁共用、重試一律流程鈕。

| 發現 | 落點 |
|---|---|
| P0-1 CSV 匯出不在閘門 | §2.6、§2.10、階段 4b |
| P1-1 單一確認旗標 | §2.2、§2.6、§2.5（D2） |
| P1-2 旗標綁 ticket | §2.2、階段 1 |
| P1-3 更新中載入更多 | §2.2、§2.9、階段 1 |
| P1-4 勾選清除 | §2.6、階段 4b |
| P1-5 保證範圍 | §0、§2.6、§7（D1） |
| P1-6 appShell 邊界 | §2.3、§3.3、階段 2 |
| P1-7 工具列契約 | §4.2、階段 3 |
| P1-8 驗收證偽 | §5 驗收清單（第二個瀏覽器） |
| P1-9 登出清空測試 | §2.4、階段 7（T3） |
| P1-10 手機失敗回報 | §4.3 |
| P1-11 停用原因 | §2.6、§4.2 |
| P1-12 宣告契約 | §4.2、§4.3、階段 3 |
| P1-13 骨架 role | §4.1 |
| P2-1 fence／卸載後失效／結果不明 | §2.7 |
| P2-2 403 | §2.3、§2.4（T7） |
| P2-3 查看證件／歷史 | §2.6（T1） |
| P2-4 空結果 | §2.3、§2.5（T2） |
| P2-5 證件審核無 catch | §1.4、階段 5 |
| P2-6 後端失敗讀成零／空 | §7、階段 9 遺留 |
| P2-7 badge | §2.5、§7（D2） |
| P2-8 卡住與匯出進度 | §2.2（T4）、§2.10（D4）；取消鈕不做（§1.3） |
| P2-9 靜態守衛 | §3.5 |
| P2-10 S7 相依、措辭 | §2.2 標題、§3.4、階段 9（D8） |
| P2-11 鍵 builder、空群組事件 | §2.3、§2.7 |
| P2-12 單一身分、戳記 | §2.2、§2.3 |
| P2-13 UserContext 替身 | §2.4 |
| P2-14 兩頁不搬的理由 | §3.1 |
| P2-15 理由落腳處 | §3.6 |
| P2-16 node 測試形態 | §2.9、階段 1 |
| P2-17 骨架契約與同形 | §4.1、階段 4b |
| P2-18 hook 職責 | §3.3（T5） |
| P2-19 階段 4 拆分 | 階段 4a／4b（T6） |
| P2-20 e2e 名稱與手機 | §5 階段 8 |
| P2-21 aria-disabled 視覺、閃灰取捨 | §4.2 |
| P2-22 成功回報播報、確認後焦點 | §4.3 |
| P2-23 漏列的 e2e 與時序前提 | §4.2、§4.5 |
| P2-24 loadMoreError | §2.2、§4.3 |
| P2-25 錯誤態一致、統計失敗 | §2.6、§4.3（T8） |
| P2-26 驗收清單其餘缺口 | §5 驗收清單 |
| P2-27 切回位置 | §2.8（D3）、§7 資料量 |
| P2-28 失敗自動重讀 | §2.7（D5） |
| P2-29 規格書草稿 | §5 階段 9（D6） |
| P2-30 追加範圍來源 | §1.4「來源」欄 |
| P2-31 呼叫點接線測試 | 階段 4b、5 驗證標準 |
| P2-32 300ms、報讀器選驗 | §4.2、§5 驗收清單 |
