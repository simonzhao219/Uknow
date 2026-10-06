# admin 資料快取（S5／工項 A4）規劃書

> 母計畫：`docs/plans/platform-uiux-redesign/`（plan.md §2.5 根因、§3 A4 四條硬約束；
> construction-plan §3 S5 九條；progress 遺留「S3 審查遺留 → S5」「S4 遺留」）。
> 分支 `feature/admin-data-cache`。施工鷹架，`/tdd-implement` 收尾時整個目錄刪除。
> 行號以 develop `828ad4f` 為準。

**九條對照**：①四條硬約束 → §2.3–§2.6、§3.1、§3.4；②生命週期 → §2.3；③分頁掛載 → §3.2；
④骨架與刷新 → §4.1–§4.3；⑤遺留裁決 → §1.4；⑥測試 → §5；⑦定位器 → §4.4；
⑧文件 → §5 階段 9；⑨風險 → §7。

## 0. 一句話

讓管理員在後台分頁間來回切換時，切回的分頁立刻顯示上次的資料並在背景更新，不再每切一次
就重等骨架——提領↔會員來回切是 P4 的日常動線（plan.md §2.5）；前提是快取只在記憶體，
且過期資料永遠不會成為寫入的依據。

## 1. 使用者需求

### 1.1 依據

- 規格書 §13（後台四模組、導覽列待處理 badge）；plan.md §1 P4（需要即時：系統告警、待審佇列；
  需要快：切換分頁不重新等待）、§2.5、§3 A4。
- `ui-ux-guidelines.md` §5（列表骨架＋`aria-busy`；**重新驗證中的清單降透明度＋`aria-busy`、
  保留舊資料**——本工項就是把這句落到後台）、§13 第 4 條（不先閃 0、區塊各自三態）。

### 1.2 驗收情境

1. 首次進 `/admin`：提領分頁的統計與列表都是同形骨架，資料到位前不先閃「$0／0 筆」。
2. 切到「會員」再切回「提領」：統計與列表**立即**出現、沒有骨架；列表標示更新中
   （`aria-busy`，慢網路下降透明度），完成後恢復。更新完成前寫入鈕全部停用、匯款作業面板
   顯示骨架。會員、公告分頁同理。
3. 切回時的背景更新失敗：與現況相同進錯誤態（錯誤字＋重試），舊資料不留在畫面上當真。
4. 證件審核（會員分頁的次分頁）與系統告警：切回時照舊出骨架（排除清單，§2.4）。
5. 手動「重新整理」：焦點留在鈕上、圖示轉動、報讀「正在更新」→「已更新」，列表不換骨架。
6. 退件／標記已匯款／代為完成／批次匯款之後：列表背景重讀、不換骨架；成功回報與動作失敗
   都出現在工具列下方，列表不會被錯誤區取代。
7. 匯出 CSV 進行中，其他三個分頁按不到（Q2 的推薦值）；匯出失敗或超過上限時列表照常顯示。
8. 離開 `/admin`（含登出、session 過期、管理員權限被撤）再回來：重新出骨架。
9. `sessionStorage`／`localStorage` 從未寫入任何 admin 資料。

### 1.3 不做

- 不動 API、資料庫、`supabase/functions/`、`src/utils/apiClient.ts`。
- 不動請求時序：每次掛載照舊各打一次，不預載、不輪詢、不加視窗 focus 重抓（例外兩處，
  都只在錯誤或競態路徑上，見 §2.6、§2.7）。
- 不快取：會員詳情、證件審核佇列、系統告警、導覽列 badge（§2.4）。
- 切回時不保留切走前的篩選、搜尋字、已載入的頁（與現況相同：重新掛載回到預設）。
- 不碰 `DataCacheContext` 與會員區 hook（S7 範圍，§2.3）。
- 不把 `SystemNotifications`／`SystemAlerts` 的取數搬進 `AdminDashboard`（§3.1）。

### 1.4 承接遺留逐條裁決（第 5 條）

| 來源 | 遺留 | 裁決 | 落點 |
|---|---|---|---|
| S3 #9 | 匯出中切分頁雙下載 | **本 PR 做**：匯出期間其他分頁停用；卸載後收集迴圈停止、不下載（Q2 可改成提升到殼層） | §2.8、階段 7 |
| S3 #10 | 會員頁「載入更多」中送出搜尋的競態 | **本 PR 做**：`usePagedList` 請求序號。同類一併：提領頁載入更多中換篩選、快速連換篩選時晚到的回應蓋掉新結果（`WithdrawalManagement.tsx:199-242` 一樣沒有序號） | §2.7、階段 1、4、5 |
| S3 | CSV 匯出失敗／超上限走 `setLoadError`，整張列表被換成錯誤區 | **本 PR 做**：動作錯誤改獨立狀態。同類一併：單筆動作失敗（`:311-312`）與批次部分失敗（`:274-276`）是同一個病——一個 state 兩種意思 | §4.3、階段 4 |
| S3 | `AdminToolbar` 重新整理按下後焦點掉 body、沒有狀態宣告 | **本 PR 做** | §4.2、階段 3 |
| S3 #15 | `SystemAlerts` 自刻的重新整理鈕（`SystemAlerts.tsx:87-90`） | **本 PR 做**：改用 `AdminToolbar`（`filter` 改選填） | §4.2、階段 6 |
| S3 | 「已匯出 N 筆」出現在工具列上方造成位移 | **本 PR 做**：成功回報與動作錯誤移到工具列下方 | §4.3、階段 4 |
| S3 | 驗收站 2 目視項（放大鏡焦點環、`type="search"` 清除鈕） | **不做**：留在驗收站 2 人工目視 | — |
| S4 | `detailSeq` 收斂成一個 hook，含「重開在途」補讀窗口 | **本 PR 做**：`useLatestRequest`（序號＋逐會員變更版本） | §2.7、階段 1、5 |
| S4 | `list.reload()` 期間關面板，焦點掉 body | **本 PR 自然消失**（背景重讀不卸載「查看」鈕）；把 S4 TDD 期收窄掉的斷言「焦點回到查看鈕」補回來當證據 | 階段 5 |
| S4 | `IdReviewQueue` 三處 `name ?? …`（`IdReviewQueue.tsx:116,166,186`） | **本 PR 做**：該條退場條件是「證件審核下次改動時」，S5 會改這支（寫入閘門）→ 改用 `memberLabel` | 階段 5 |
| S4 | 近期提領只有 10 筆、無總筆數 | 不做（後端工項，與快取無關） | — |
| S4 | `apiClient` 沒有逾時 | 不做（全站工項）；與本工項的交互見 §7 | — |
| S4 | `ui/dialog.tsx` 關閉鈕名稱是英文「Close」 | 不做（與快取無關） | — |
| S4 | 停權端點非冪等 | 不做（後端 `/fix-bug`）；它是「會員詳情不快取」的反例之一（§7） | — |
| S2e→S3 | 證件審核卡「退回在左、通過在右」（現為通過在左） | **開放問題 Q3**：指給 S3 但 S3 已合併、看板未結案的孤兒遺留，S5 會改同一檔 | §6 |

## 2. 系統設計

### 2.1 資料流

- 現況：`AdminDashboard` 定義取數函式、以 props 注入提領與會員兩頁（`AdminDashboard.tsx:19-97`）；
  公告、告警在元件內直接打 `apiClient`。Radix Tabs 只掛 active 分頁，切換＝卸載→重掛→state 歸零
  →重抓→骨架。
- 之後：`AdminDashboard` 另建一份記憶體快取 store（§2.3），以 `cache` prop 注入提領、會員、公告三頁。
  四個分頁的列表都走擴充後的 `usePagedList`（§2.2）：掛載時同步讀快取當初始 state（第一個 render
  就有資料），同時照舊打一次 API 背景重讀，回來後寫回 state 與快取；寫入成功後依對照表失效（§2.6）。
  取數函式與請求參數不變。

### 2.2 hook 契約：`usePagedList` 擴充（向下相容）

現有呼叫端只有 `MemberManagement`、`IdReviewQueue`；本 PR 再接提領、公告、告警（後兩者回單頁：
`total = items.length`，不會出現「載入更多」）——四個分頁一個 hook。

- 新輸入：`cache?: { store, key }`（不傳＝不跨卸載保留，其餘行為相同）；`load` 可多回 `meta`
  （隨第一頁回來的統計），hook 原樣保存、一起快取。
- 新輸出：`meta`、`isRefreshing`、`isFromCache`（畫面上的資料還沒在本次掛載確認過）。

| 時機 | 畫面上有**本鍵**的資料（快取或本次已載入） | 沒有 |
|---|---|---|
| 掛載／換鍵（換篩選、搜尋） | 先顯示（`isFromCache`、`isRefreshing`），立即重讀 | 骨架（`isLoading`）＋讀 |
| `reload()`（手動、寫入後） | 保留列表、`isRefreshing` | 骨架 |
| 重讀成功 | 換新資料、寫回快取、`isFromCache=false` | 同左 |
| 重讀失敗 | 錯誤態（現況）；快取條目留著——下次掛載仍是「先顯示＋重讀」，不會跳過確認 | 錯誤態 |
| `loadMore()` | 帶目前序號，回來時已非最新就丟棄；快取只存第一頁，不寫 | — |

- **本鍵**：換篩選後新鍵沒有快取就出骨架——畫面上的資料必須屬於目前的篩選，不拿「全部」的舊列
  冒充「待處理」的結果。
- 快取寫入帶 store 層遞增的請求戳記：較早送出的回應不得覆蓋較新的條目（卸載前在途的請求晚到時，
  不蓋掉重掛後已寫入的新資料）。

### 2.3 快取 store 與生命週期（約束 a、第 2 條）

- `createAdminCache()`（新檔 `src/components/admin/adminCache.ts`）：純記憶體 `Map`。介面只有
  `read`、`write`、`invalidate(event)`——**沒有逐鍵刪除**，失效只能經對照表（§2.6），從結構上
  杜絕手動散清。
- 鍵：`withdrawals?status=<all|pending|awaiting_collection|completed|rejected>`、`members?search=`
  （只限空白搜尋，§2.4）、`announcements`。上限 7 個鍵；每鍵是第一頁（≤ 50 列），公告全量。
- 建立：`AdminDashboard` 內以 `user.id` 當 key 掛分頁區，分頁區以 `useState` 初始化建立 store——
  使用者換了，分頁區連同 store 與各分頁 state 整個重掛。
- 清除＝不再被任何元件引用（不另寫 effect cleanup：開發模式的雙重 effect 會把還要用的 store 清掉）：
  - 離開 `/admin`：`AdminDashboard` 卸載。
  - 登出：`setUser(null)` → `AdminRoute` 導去 `/login`（`AdminRoute.tsx:21-23`）→ 卸載。
  - session 過期：`onSessionExpired` 導去 `/login`（`App.tsx:222`）→ 卸載。
  - 管理員權限被撤：`isAdmin` 變 false → 導去 `/dashboard` → 卸載。
  - 切換帳號：通常是 `SIGNED_OUT` 再 `SIGNED_IN`（同登出）；直接換成另一位管理員時
    （`SIGNED_IN` 不同 id，`App.tsx:193`）`AdminDashboard` 不卸載 → 靠上面的 `user.id` key 重掛。
  - 測試以「卸載再掛載必出骨架」「換使用者後不顯示前一位的資料」驗證。
- **為何不沿用 `DataCacheContext`**（只沿用它的模式：讀取時水合、`MUTATION_GROUPS` 式對照表、
  寫入同步更新）：
  1. 它把整份快取寫進 `sessionStorage`（`DataCacheContext.tsx:166-172`）——直接違反約束 (a)；
  2. 它掛在 App 根（`App.tsx:464`），只在 `SIGNED_OUT` 清（`App.tsx:201-202`）：離開 `/admin` 不清、
     同分頁直接換帳號也不清；
  3. `CacheKey` 是固定聯集（`:31-50`），後台要依篩選參數化的鍵；
  4. S7 要改 `DataCacheProvider`（單一 commit＋provider 測試）——S5 不碰它，S5／S6／S7 的平行
     關係維持（construction-plan §1）。

### 2.4 快取範圍與排除清單（約束 b）

| 資料 | 快取 | 理由 |
|---|---|---|
| 提領列表第一頁＋`total`＋`stats`（五種狀態篩選各一鍵） | ✅ | 主要動線；寫入依據由閘門保護（§2.5） |
| 會員列表第一頁＋`total`＋`stats`（**只限空白搜尋**） | ✅ | 切回時搜尋框重設為空白，只有這個鍵用得到；搜尋結果不快取——急救查人是一次性的，也不在記憶體裡累積被查過的人 |
| 公告列表 | ✅ | |
| 會員詳情 | ❌ | 停權／授予確認框的依據（`MemberManagement.tsx:373-403` 讀 `detailFor`）；每次「查看」現讀（現況） |
| 證件審核佇列（清單與待審筆數） | ❌ | 待審佇列＝即時資料（plan.md §1 P4），也是通過／退回的依據 |
| 系統告警 | ❌ | 即時資料 |
| 導覽列待處理提領 badge | ❌ | 即時資料；`Navbar.tsx:41-51` 自取，不經後台快取 |
| 確認框內容：標記已匯款的金額與帳號末五碼（`WithdrawalManagement.tsx:430-431`）、退件的含手續費點數（`:469`）、批次的姓名與合計（`:552-562`）、代為完成的對象 | 不另存 | 取自點擊當下那一列；列上的鈕只在本次掛載確認過資料後才可按（§2.5）→ 確認框不可能從快取開出 |
| 匯款作業面板五欄（桌機 `:690-710`、手機展開卡） | 隨列表，但**未確認前不顯示** | 它是匯款的指定介面（「照這五欄打進網銀」，§2.5） |

「待審佇列數」的範圍是開放問題 Q1：推薦值＝導覽列 badge 與證件審核佇列；提領統計卡的「待處理 N」
隨列表快取，只在更新窗口內以降透明度出現。

### 2.5 更新中的寫入閘門（約束 b 的執行方式）

- **閘門**：`isLoading || isRefreshing` 時停用該分頁所有寫入入口——提領：標記已匯款、退件、代為完成、
  勾選與批次匯款、複製帳號；證件審核：通過、退回；公告：刪除；告警：標記已處理。讀取入口不停用
  （會員「查看」、提領「查看證件」「查看歷史」）。
- **匯款作業面板**：`isFromCache` 時五欄顯示同形骨架（`WithdrawalFundingFields` 加 `pending`），
  桌機面板與手機展開卡共用。
- **失敗**：進錯誤態（現況）——快取資料只出現在「更新中」的窗口裡，確認失敗就不再顯示。
- 這等於「開確認框時強制同步 revalidate」，而且更早：確認框只能從啟用的鈕開，鈕只在本次掛載確認過
  資料後才啟用。不另打單筆查詢——沒有單筆提領端點，本工項不動 API。
- 閘門為什麼不能省（後端狀態機擋不住的那一種）：見 §7 反例。

### 2.6 mutation → invalidation 對照表（約束 c）

`ADMIN_MUTATION_GROUPS`（`adminCache.ts`；`invalidate` 的型別只收表內事件）：

| 事件 | 呼叫點 | 失效 | 理由 |
|---|---|---|---|
| `withdrawalStatus`（標記已匯款／退件／代為完成） | `WithdrawalManagement` 單筆動作 | `withdrawals?*` | 該筆在狀態篩選之間移動、統計改變 |
| `withdrawalBatchPaid`（批次匯款） | `runBatch` | `withdrawals?*` | 同上 |
| `memberSuspend`（暫停／恢復） | `MemberManagement.runAction` | `members?*` | 列上停權徽章、統計「暫停」 |
| `memberAdmin`（授予／撤銷） | 同上 | `members?*` | 列上角色徽章、統計「管理員」 |
| `idReview`（通過／退回） | `IdReviewQueue.act` | 無 | 佇列不快取；`idVerificationStatus` 雖在會員列資料裡，列上不顯示（只在詳情，詳情不快取）；提領列不讀證件狀態，`admin_review_id` 只改 `id_verification_status`、證件照路徑不變 |
| `announcementCreate`／`announcementDelete` | `SystemNotifications` | `announcements` | |
| `alertResolve` | `SystemAlerts.resolveAlert` | 無 | 告警不快取 |

- 失效＝刪鍵（與 `MUTATION_GROUPS` 同語意）：被刪的鍵下次掛載出骨架；目前掛著的列表由寫入後的
  背景重讀寫回。寫入**成功**才失效；批次有任一筆成功就失效。
- 表上沒有的：其他管理員或會員造成的變更——看不到，由「每次掛載都重讀」涵蓋。
- 請求時序變動之一（錯誤路徑）：單筆提領動作**失敗**時列表自動背景重讀一次。現況是列表被換成錯誤字、
  要按「重試」才重讀——請求數相同、只是不必手按；失敗多半代表那一列已被別人改過，不重讀就讓過期的
  那列繼續可按。

### 2.7 請求序號收斂成一個 hook（第 5 條）

`useLatestRequest`（新檔 `src/hooks/useLatestRequest.ts`）：

- `begin(entityId?)` → ticket：遞增序號、作廢之前的；帶 `entityId` 時一併記下該對象的變更版本。
- `peek()`：取目前序號不遞增（動作後的重讀沿用）；`isLatest(ticket)`。
- `markChanged(entityId)`：該對象版本 +1；`changedSince(ticket)`：ticket 發出後該對象有沒有變過。

使用者：
- `usePagedList`：`reload`／換鍵時 `begin()`，`loadMore` 帶 `peek()`；非最新的回應不寫 state、不寫快取
  → 修 S3 #10 與提領頁的同類競態。
- `MemberManagement`：`detailSeq`／`bumpSeq`／`isLatest`（`MemberManagement.tsx:159-175`）換成它；
  動作成功時 `markChanged(target.id)`；`openDetail` 的讀取落地時若 `changedSince` 就再讀一次——關掉
  S4 遺留 D 的窗口（動作在途時關面板、重開同一位、讀取還在途時動作才成功）。請求時序變動之二：
  只在這個競態窗口內多一次讀取。

### 2.8 匯出與分頁切換（第 5 條）

- `WithdrawalManagement` 加 `onExportingChange?(busy)`；`AdminDashboard` 在匯出期間把其他三個分頁
  `disabled`（Radix 鍵盤導覽會跳過停用的分頁）。
- 收集迴圈每頁之間檢查元件仍掛載；卸載（例如點「會員驗證」離開 `/admin`）就停止、不下載——一次匯出
  綁定一個掛載中的頁面，不會在別的頁面突然落檔，也不會和重新進來後的第二次匯出疊成兩份。
- 替代案（Q2）：匯出狀態提升到殼層 store，匯出中可以自由切分頁、回來看到忙碌鈕；代價是成功／失敗
  回報與焦點歸還也要跟著搬到殼層。

### 2.9 API／資料庫

零變更（端點、參數、回應形狀、migration 全不動）。

## 3. 架構影響

### 3.1 DI 裁決（約束 d）：注入式 fetcher 的快取 hook

`AdminDashboard.tsx:19-20` 的慣例：「取數／送出走這裡、畫面只吃 props——元件測試才不用替身掉整個
網路層」。裁決：**hook 不 import `apiClient`**，只接受呼叫端給的 `load`；快取 store 也由
`AdminDashboard` 建立、以 `cache` prop 注入。

| | 注入式（採用） | hook 內含 fetch（不採用） |
|---|---|---|
| 取數位置 | 維持在 `AdminDashboard` | 移進 hook，檔頭慣例變成假的 |
| 元件測試替身 | 照舊傳 `vi.fn()` 取數函式；要驗快取就傳真的 `createAdminCache()`（純記憶體，不需替身） | 每支元件測試都要 mock `apiClient` |
| 既有測試 | 不傳 `cache`＝不跨卸載保留，其餘照舊 | 替身方式全面改寫 |

- 殼層測試（`AdminDashboard.test.tsx`）照舊替身 `apiClient`——殼層本來就擁有真的取數函式。
- `SystemNotifications`／`SystemAlerts` 現況在元件內呼叫 `apiClient`（與慣例不一致是既有狀態）。
  本 PR 不搬：快取不需要，搬遷要改寫兩支既有測試的替身方式。它們把模組層的取數函式交給 hook——
  hook 本身仍是注入式。

### 3.2 分頁掛載裁決（第 3 條）：維持「非 active 不掛載」＋快取水合，不用 forceMount

| | 不掛載＋水合（採用） | forceMount 全掛 | 首次造訪後常駐 |
|---|---|---|---|
| 首進請求數 | 1（同現況） | 4（等於預載，違反 §1.3） | 1 |
| 切回請求數 | 1（同現況） | 0，要另接「切回時刷新」 | 0，同左 |
| 記憶體 | 每鍵第一頁的純資料，≤ 7 鍵 | 四棵元件樹＋DOM 常駐 | 造訪過的元件樹＋DOM（含載入更多的頁）常駐 |
| PII 位置 | 非 active 分頁只在 JS heap | 未遮罩身分證與帳號常駐隱藏 DOM | 同左 |
| 測試 | DOM 與現況相同 | 隱藏節點讓 `getByText`／e2e 文字定位器多出重複 | 同左 |

不採用常駐的關鍵是 PII：隱藏 DOM 對任何讀得到頁面 DOM 的擴充套件 content script 都可見，頁面 JS
變數則不是——那是新增的曝險面。代價：匯出中切分頁要另外處理（§2.8）；切回時篩選、搜尋、已載入的
頁重設（同現況）。

**背景刷新的觸發：每次掛載（切回）都刷新，不設 stale 時間**。(1) 請求數與時序與現況完全相同；
(2) 提領列是匯款依據，TTL 內不刷新＝寫入依據未經確認；(3) 提領列裡的證件照是 1 小時的簽名網址
（`api/index.ts:1144`），不刷新會留著過期連結。會員區的 `SOFT_TTL` 30 秒（`DataCacheContext.tsx:81`）
是為了 F5 與快速切頁的請求風暴，後台切分頁是人的節奏，不適用。

### 3.3 動到的模組

- 新增：`src/components/admin/adminCache.ts`、`src/hooks/useLatestRequest.ts`、
  `src/components/admin/AdminListSkeleton.tsx`
- 修改：`src/hooks/usePagedList.ts`、`src/components/AdminDashboard.tsx`；`src/components/admin/` 的
  `WithdrawalManagement`（改走 `usePagedList`）、`WithdrawalFundingFields`、`WithdrawalCardList`、
  `MemberManagement`、`IdReviewQueue`、`SystemNotifications`、`SystemAlerts`、`AdminToolbar`
- e2e：`features/admin_dashboard.feature`、`steps/admin_steps.py`、`mocks/backend_api_mock.py`、
  `pages/admin_dashboard_page.py`、`journey/tools/test_admin_row_targeting.py`
- 不動：`supabase/**`、`DataCacheContext.tsx`、`apiClient.ts`、`App.tsx`、`ui/skeleton.tsx`
  （S6 可能動它；S5 用 admin 自己的 `AdminListSkeleton` 包一層，不撞檔）
- `usePagedList` 是共用 hook：現有呼叫端只有後台兩支；S7 的「全部 N 位 ›」預定使用它（progress 遺留），
  擴充向下相容，S7 直接得到序號守衛。

### 3.4 PII 守衛（約束 a）

- **靜態守衛**（`src/utils/repoHygiene.test.ts`，接在「個資傾印不得進版本庫」那一節）：掃
  `src/components/AdminDashboard.tsx`、`src/components/admin/**`、`src/hooks/usePagedList.ts`、
  `src/hooks/useLatestRequest.ts`，不得出現 `sessionStorage`、`localStorage`、`indexedDB`、`caches.`、
  `document.cookie`，也不得 import 會落地的模組（`DataCacheContext`、`formDraft`）。
- **行為測試**（`adminCache.test.ts`、`AdminDashboard.test.tsx`）：以含身分證與帳號的測資走完
  寫入→讀取→失效與「切走再切回」，`Storage.prototype.setItem` 零呼叫。

## 4. UI/UX

### 4.1 骨架統一（第 4 條）

新 `AdminListSkeleton`：`role="status"`＋`aria-label`（沿用各頁既有名稱）＋`aria-busy`；手機卡片形、
桌機表格列形（同 `isDesktop` 判準）。只在首次載入、換到沒快取的鍵、錯誤後重試時出現；切回有本鍵
資料就不換骨架。

| 分頁 | 現況 | 之後 |
|---|---|---|
| 提領 | 列表 3 條 `h-10`（`WithdrawalManagement.tsx:792-797`，手機內容是卡片卻用表格列形）；統計先顯示 `$0`／`0` 再跳成真值（`:139-142,613-686`）；載入中顯示「已顯示 0 / 0 筆」（`:762-764`） | 統計區同形骨架（手機一行摘要、桌機四卡）；列表依斷點；載入中不顯示筆數行；名稱「載入提領申請中」不變 |
| 會員 | 列表同上（`MemberManagement.tsx:556-561`）；統計先閃 0（`:56,420-483`） | 統計三卡骨架；列表依斷點；名稱「載入會員列表中」不變 |
| 公告 | 置中 spinner（`SystemNotifications.tsx:233-236`）；讀取失敗只彈 toast、列表顯示「尚無公告」（把失敗讀成空） | 公告卡形骨架（名稱「載入公告中」）；補錯誤態（中性字＋重試，§13 第 4 條） |
| 告警 | 已是骨架（`SystemAlerts.tsx:93-103`），沒有 role 與名稱 | 改用 `AdminListSkeleton`（名稱「載入告警中」） |
| 證件審核 | 已是同形骨架（`IdReviewQueue.tsx:65-72`） | 不動 |

### 4.2 背景更新的呈現與工具列（第 4 條）

- 列表區包成 `<section aria-label="提領申請列表">`（會員、公告、告警同形）：更新中 `aria-busy="true"`，
  降透明度延遲約 300ms 才出現——快網路下不閃（§5「重新驗證中的清單」）。統計區同樣處理。
- `AdminToolbar`：
  - 更新中：重新整理鈕 `aria-disabled`（**不用 `disabled`**——被按的鈕變成停用，正是焦點掉到 body
    的原因）、點了不動作、圖示轉動（`motion-safe`）。
  - 真停用維持 `disabled`：匯出中（整列）、載入更多中（焦點不在這顆鈕上）。
  - 新增常駐 `aria-live="polite"` 宣告區：**只有手動重新整理**時說「正在更新」→「已更新」；切回與寫入
    後的自動更新不宣告（每切一次分頁念一次很吵；寫入另有成功回報）。不用 `role="status"`——那是骨架
    的定位器（§4.4），會員頁既有的詳情讀取宣告也是同一個理由（`MemberManagement.tsx:495-502`）。
  - `filter` 改選填：告警頁沒有篩選，只放重新整理鈕，取代 `SystemAlerts.tsx:87-90` 自刻那顆。

### 4.3 錯誤與回報的位置（提領頁）

- 列表讀取失敗（`list.error`）：整區錯誤字＋重試（現況），只給讀取。
- 成功回報（「已退件：王小明」「已匯出 N 筆」）與動作錯誤（單筆失敗、批次「X 筆成功、Y 筆失敗」、匯出
  失敗、超過上限）：顯示在工具列正下方，列表照常顯示。成功走 `StatusCallout` success＋「知道了」（現況）；
  錯誤走 `variant="destructive"`＋`role="alert"`（同會員頁 `MemberManagement.tsx:485-494`）。放工具列下方，
  按 CSV 之後工具列不會被往下推（S3 位移遺留）。

### 4.4 定位器契約（第 7 條）

| 定位器 | 位置 | S5 之後 | 處置 |
|---|---|---|---|
| `get_by_role("status", name="載入提領申請中")` | `e2e/pages/admin_dashboard_page.py:74,100`（journey f50、f70 共用） | 只在首次載入出現；寫入後與切回改背景更新、不出骨架 | `_wait_list_settled` 另等「提領申請列表」的 `aria-busy` 消失——否則寫入後的下一個動作會在背景更新途中數列 |
| 字串「載入提領申請中」「目前沒有提領申請」「重試」 | `e2e/journey/tools/test_admin_row_targeting.py:126-135` | 不變 | 加一條：`_wait_list_settled` 有等 `aria-busy`；區塊名稱同時出現在產品與 page object |
| `getByRole('status', { name: '載入提領申請中' })` | `WithdrawalManagement.test.tsx:106,110` | 不變（首次載入） | 不動 |
| `queryByRole('status')` 為 null | `MemberManagement.test.tsx:121`、`IdReviewQueue.test.tsx:61` | 不變——新宣告區刻意不用 `role="status"` | 不動 |
| `getByRole('status')`（匯出宣告） | `AdminToolbar.test.tsx:76-98` | 不變（匯出宣告區保留） | 「沒有匯出能力的頁面不放狀態宣告區」改名為「…不放匯出狀態宣告區」 |
| 重新整理 `hasAttribute('disabled')` | `AdminToolbar.test.tsx:66-69`「重新整理中按不下去」 | 改為 `aria-disabled`、點了不呼叫 `onRefresh`、焦點不動 | 改寫斷言（不刪） |
| 重新整理 `hasAttribute('disabled')`（載入更多中） | `WithdrawalManagement.test.tsx:670-693`、`MemberManagement.test.tsx:313-328` | 不變（載入更多中仍真停用） | 不動 |
| 「重新整理」按鈕名稱 | 告警頁（e2e 不點它） | 名稱不變（`AdminToolbar` 同名） | 不動 |
| 「載入中…」（載入更多鈕） | `WithdrawalManagement.tsx:941`、`MemberManagement.tsx:646` | 不變 | 無測試依賴 |
| `get_by_role("button", name="標記已處理").first` | `e2e/steps/admin_steps.py` | 首次載入完成後可按 | 不動 |
| `get_by_role("tab", name=…)` | e2e、journey、`AdminDashboard.test.tsx` | 匯出中其他分頁 `disabled`，名稱不變 | 不動 |

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `useLatestRequest`；`usePagedList` 序號守衛、背景重讀、`meta`、`isRefreshing` | `src/hooks/useLatestRequest.test.ts`（node）、`src/hooks/usePagedList.test.tsx` | 換鍵或 reload 作廢在途的 loadMore／reload；有本鍵資料時 reload 不回骨架；失敗進錯誤態；`changedSince` 只對被標記的對象成立 |
| 2 | `createAdminCache`＋對照表；`usePagedList` 快取水合 | `src/components/admin/adminCache.test.ts`（jsdom，要 `Storage`）、`usePagedList.test.tsx`、`src/utils/repoHygiene.test.ts` | 掛載第一個 render 就有資料且立即重讀；換到沒快取的鍵出骨架；較舊回應不覆蓋較新條目；失效依表刪鍵；`setItem` 零呼叫；靜態守衛 |
| 3 | `AdminToolbar` 背景更新語意 | `AdminToolbar.test.tsx` | 更新中 `aria-disabled`、焦點不動、點了不呼叫；手動重新整理宣告「正在更新」→「已更新」；不帶 `filter` 也能渲染 |
| 4 | 提領頁改走 `usePagedList`＋閘門＋骨架＋錯誤拆分 | `WithdrawalManagement.test.tsx` | 帶快取重掛無骨架；寫入鈕、勾選、複製停用到更新完成；作業面板與手機展開卡在未確認時是骨架；統計不閃 0；換篩選時在途的載入更多不接舊尾；匯出／單筆／批次錯誤不取代列表、出現在工具列下方；寫入成功失效、單筆失敗自動重讀；既有測試全綠 |
| 5 | 會員頁＋證件審核 | `MemberManagement.test.tsx`、`IdReviewQueue.test.tsx` | 帶快取重掛無骨架；搜尋時在途的載入更多不接舊尾；動作後重讀不換骨架、關面板焦點回到「查看」；重開在途時動作才成功→面板補讀到新狀態；證件審核重讀中通過／退回停用、以 `memberLabel` 稱呼；證件審核重掛仍出骨架 |
| 6 | 公告＋告警 | `SystemNotifications.test.tsx`、`SystemAlerts.test.tsx` | 公告骨架取代 spinner、讀取失敗不再顯示「尚無公告」、帶快取重掛無骨架、更新中刪除停用、建立／刪除會失效；告警改用 `AdminToolbar`、重掛仍出骨架、標記後背景重讀期間按鈕停用 |
| 7 | 殼層：建立與注入 store、使用者 key、匯出鎖分頁、卸載停止匯出 | `src/components/AdminDashboard.test.tsx`、`WithdrawalManagement.test.tsx` | 切走再切回不出骨架、照舊打一次 API；卸載再掛載出骨架；換使用者不顯示前一位的資料；匯出中其他分頁停用；卸載後收集迴圈停止、不呼叫 `link.click()`；全流程 `setItem` 零呼叫 |
| 8 | e2e＋journey page object | `e2e/features/admin_dashboard.feature`、`e2e/journey/tools/test_admin_row_targeting.py` | 兩個新情境（下）綠；`cd e2e/journey && pytest tools/ -q` 綠 |
| 9 | 文件（第 8 條） | — | `check-spec-drift.py`、`check-plans-scaffold.py`、`framework-check.sh` 綠 |

**階段 8 的 e2e 情境**（`e2e/` 是英文 Gherkin）：

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

Scenario: Rejecting a withdrawal keeps the list on screen while it refreshes
  Given I am logged in as an admin
  And there is a pending withdrawal from "王小明"
  When I visit "/admin"
  And I reject the withdrawal from "王小明"
  Then I should see the text "已退件：王小明"
```

- 第一個是驗收 3 的機械版：mock 把下一次 `GET /admin/withdrawals` 扣住不回（比照
  `set_upload_photo_deferred` 的作法，不用 `sleep`），在扣住的窗口裡斷言沒有骨架、有 `aria-busy`。
- 第二個走 journey 共用的 `AdminDashboardPage.reject_withdrawal`——`_wait_list_settled` 的改動原本只有
  晉升 PR 的 journey 跑得到，這條讓每個 PR 都走一次同一條路徑。

**階段 9 的文件**：
- 規格書 §13：§13 沒有描述 loading，不需同步；但在後台模組表後加一段「後台資料快取」——記憶體內、
  離開 `/admin` 即清、切回先顯示再背景重讀、更新完成前寫入停用、排除清單。理由：「PII 不落地」與
  「過期資料不當寫入依據」是安全不變式，要有 `plan-reviewer-requirements` 溯源得到的需求錨點。
- `ui-ux-guidelines.md` §5：「已套用」補「後台列表」；補一句後台規則（切回先顯示＋背景重讀、更新完成前
  寫入鈕停用、匯款作業面板不顯示未確認資料），不重複 §13 第 4 條。
- `AdminDashboard.tsx` 檔頭 DI 註解補「快取 store 也在這裡建立、以 props 注入」；
  `admin_dashboard_page.py` 檔頭 docstring 同步。
- 母計畫：construction-plan §4.3 驗收 3 換成可勾清單（草稿見下）；progress S5 列與遺留事項結案。
- 收尾 `git rm -r docs/plans/admin-data-cache`，跑 `check-plans-scaffold.py`。

**驗收 3 清單草稿**（寫進 construction-plan §4.3）：

前置：admin 帳號；develop 上至少一筆待處理提領與幾位會員；devtools Network 可切「Slow 3G」；
確認框只看、按「取消」（develop 是共用的真後端）。手機（375px）與桌機各一次：

- [ ] 首次進 `/admin`：統計與列表是骨架，沒有先閃 $0／0 筆
- [ ] 提領→會員→提領：第二次進提領沒有骨架，列表立即出現
- [ ] （Slow 3G）切回提領的瞬間：列表變淡、重新整理圖示轉動；這段期間標記已匯款／退件／代為完成與勾選
      按不下去，桌機匯款作業面板是骨架；更新完自動恢復
- [ ] 抽查一筆：更新完成後，那筆的金額與狀態和按「重新整理」後看到的一致
- [ ] 按重新整理：鍵盤焦點留在鈕上（再按 Tab 不從頁首開始），列表不換骨架；報讀器念「正在更新」「已更新」
- [ ] 公告分頁切回同樣不出骨架；證件審核、系統告警切回照舊出骨架（即時資料，刻意不快取）
- [ ] 按 CSV：匯出中其他分頁按不到，完成後恢復；「已匯出 N 筆」出現在工具列下方，工具列沒有被往下推
- [ ] 點「會員驗證」離開再回到 `/admin`：重新出骨架
- [ ] devtools → Application → Session Storage／Local Storage：沒有任何提領或會員資料

以 vitest 為準、不列人工項：寫入後的失效、請求序號、重開在途補讀、卸載後停止匯出。

## 6. 開放問題

- [ ] **Q1「待審佇列數」不快取的範圍**：推薦＝導覽列 badge＋證件審核佇列（提領統計卡隨列表快取、
      只在更新窗口內降透明度）。另案＝提領統計卡也不快取（切回時統計區出骨架、列表照常快取）。
- [ ] **Q2 匯出中切分頁**：推薦＝匯出期間停用其他分頁＋卸載後停止匯出（§2.8）。另案＝匯出狀態提升到
      殼層，可自由切換。
- [ ] **Q3 孤兒遺留**：證件審核卡按鈕順序改成「退回在左、通過在右」（§12.11 次要左主要右；S2e 指給 S3，
      未處理）。推薦＝S5 順手做（同檔、兩顆鈕對調，測試都以名稱定位，無定位器影響）。另案＝不做，
      留給驗收站 2 目視後再修。

## 7. 風險與回滾（第 9 條）

- **PII 在記憶體**：曝險面與現況相同——同一個 JS heap、DevTools／React DevTools 讀得到的是同一批欄位；
  差在存活時間，由「分頁掛著時」延長為「待在 `/admin` 期間」，上限由離開 `/admin`、登出、換帳號界定
  （§2.3）。不新增儲存媒介：不落 storage、非 active 分頁不常駐 DOM（§3.2）。會員搜尋結果不快取，
  不累積被查詢者的資料。證件照簽名網址（1 小時）隨提領列在記憶體——現況分頁掛著時也在，且每次切回
  都換新。
- **過期資料成為寫入依據——反例（為什麼提領狀態與作業面板不能從快取直接當真）**：管理員 A 在提領頁看到
  王小明 1,000 P「待處理」，切到會員頁接客服電話 15 分鐘；這段期間管理員 B 已在網銀匯款，並把這筆
  標記已匯款。A 切回提領頁，若快取直接當真、按鈕可按：作業面板仍把王小明排在第一筆、狀態仍是待處理，
  A 照面板帳號在網銀再匯一次，回來按「標記已匯款」——後端 `admin_update_withdrawal_status` 對
  「已是待查收 → 待查收」回 `success: true, idempotent: true`（`20260802000004_withdrawal_events.sql:108-109`；
  批次逐筆呼叫同一函式），畫面照樣顯示「已標記匯款完成：王小明」。**重複匯款在系統裡沒有任何錯誤訊號。**
  後端狀態機擋得住不合法的轉換，擋不住合法但重複的轉換——所以寫入依據的新鮮度只能由前端保證：閘門
  （更新完成前停用）＋作業面板未確認不顯示（§2.5）。
  同理，會員詳情若從快取顯示「未停權」而實際已被別人停權，A 按「暫停」會改寫真正的停權時間（停權端點
  每次覆寫 `suspended_at`，S4 遺留）——所以詳情不快取。
- **殘餘風險：背景更新卡住**（`apiClient` 沒有逾時，S4 遺留）：列表停在「更新中」，寫入維持停用、
  作業面板維持骨架——不會因卡住而放行寫入（fail-safe）。但淡化的舊列仍看得到，在列上自己抄帳號的人
  仍可能依過期狀態匯款；指定的作業面板與複製鈕不會給他。根治是全站逾時（既有遺留）。
- **共用 hook 改動**：`usePagedList` 改成背景重讀，會改變 `MemberManagement`、`IdReviewQueue` 的重讀呈現
  （不再換骨架）——受影響的既有斷言已盤在 §4.4。
- **journey 晚發現**：page object 的改動只有晉升 PR 的 journey 跑得到 → 階段 8 的「退件」情境讓每個 PR
  走同一條路徑，journey-offline 另有字串與結構檢查。
- **與 S6 平行**：不撞檔（§3.3）；母 progress.md 兩邊都會改，衝突在表格不同列，後合併者 rebase。
- **回滾**：純前端、無資料遷移——revert PR 即回到「每次切回重抓＋骨架」。
