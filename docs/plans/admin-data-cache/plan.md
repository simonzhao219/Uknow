# admin 資料快取（S5／工項 A4）規劃書

> 母計畫：`docs/plans/platform-uiux-redesign/`（plan.md §2.5 根因、§3 A4 四條硬約束；
> construction-plan §3 S5 九條；progress 遺留「S3 審查遺留 → S5」「S4 遺留」）。
> 分支 `feature/admin-data-cache`。施工鷹架，`/tdd-implement` 收尾時整個目錄刪除。
> 行號以 develop `828ad4f` 為準。
>
> - **第二版**：依 `review.md` 第一輪（去重後 P0×1／P1×13／P2×32）與業主裁決 D1–D8 修訂（§8）。
> - **第三版**：依第二輪（P0×0／P1×8／P2×27）與業主裁決 E1–E8 修訂（§9）。
> - **第四版（2026-10-07）**：依第三輪（P0×0／P1×4／P2×30）與第三輪裁決 K1–K8（PR #371 留言 6027245062）修訂，
>   並補上第二、三版漏對照的主 session 規劃審查（留言 6020037480，以下記「主 #1–#45」）與業主裁決 A–J
>   （留言 6024121702）——其中 D（閘門範圍）、F（寫入在途鎖分頁）、H（告警不走共用 hook）是第四版才套用的（§10）。
> - **第四版之一（2026-10-07）**：依第三輪複核（四個視角確認 4 條 P1 全數解決；另指出 B、K5 兩項裁決只落實一半、T14 缺
>   資料通路，共 3 條 P1）修訂，並順手收掉複核附帶的 P2（§10.6）。業主同日於 session 內確認：A 取代 D2 的件數部分、
>   F 在寫入卡住時維持鎖定、T13–T17 全部照第四版。
> - **第四版之二（2026-10-07）**：依 UI/UX 對第四版之一的複核補 2 條 P1——對話框的資料時間在開框時凍結、更新途中按重新
>   整理仍交給頁面決定（§10.6）。

**九條對照**：①四條硬約束 → §2.3–§2.7、§3.1、§3.5；②生命週期 → §2.4；③分頁掛載 → §3.2；
④骨架與刷新 → §4.1–§4.3；⑤遺留裁決 → §1.4；⑥測試 → §5；⑦定位器 → §4.5；
⑧文件 → §5 階段 9；⑨風險 → §7。

## 0. 一句話

讓管理員在後台分頁間來回切換時，切回的分頁立刻回到切走前的篩選、顯示上次的列表並在背景更新，不再每切一次就
重等骨架——提領↔會員來回切是 P4 的日常動線（plan.md §2.5）。前提是快取只在記憶體，而且**快取不讓任何寫入依據比
沒有快取時更舊**：提領的匯款類操作在本次讀取確認前暫停，統計與匯款作業面板確認前不顯示。

## 1. 使用者需求

### 1.1 依據

- 規格書 §13（後台四模組、導覽列待處理 badge）、§10.4（隱私取捨）；plan.md §1 P4（需要即時：系統告警、待審佇列；
  需要快：切換分頁不重新等待）、§2.5、§3 A4。
- `ui-ux-guidelines.md` §5（列表骨架＋`aria-busy`；**重新驗證中的清單降透明度＋`aria-busy`、保留舊資料，不要
  清空**；不得靜默截斷）、§6（三態）、§12.11（重試是唯一出路時用流程鈕、同頁有其他主要動作時區塊內重試用次要；
  兩顆並排次要左主要右、手機等寬；卡片尾靠右）、§13 第 4 條（不先閃 0、區塊讀取失敗用中性字）。

### 1.2 驗收情境

1. 首次進 `/admin`：提領的統計、列表（桌機另有匯款作業面板）都是同形骨架，資料到位前不先閃「$0／0 筆」。
2. 提領篩「待處理」→ 切到會員 → 切回提領：回到「待處理」，**列表立即出現、沒有骨架**；統計區（三種件數與待匯款
   總額）與匯款作業面板是骨架，本次讀取確認後才出數字（A）。更新中列表 `aria-busy`，約 0.3 秒後才變淡（快網路
   不閃）；同一時刻狀態行接「・更新中，暫停匯款相關操作」，標記已匯款、勾選與批次、CSV、查看證件呈停用；**退件、
   代為完成、查看歷史照常可用**（D、K5）。更新完自動恢復。換到沒讀過的篩選則出骨架。
3. 會員分頁（未輸入搜尋時）與公告分頁：切回時列表立即出現並在背景更新；這兩頁沒有被暫停的操作。會員區的子分頁
   選擇（會員列表／證件審核）也保留，但證件審核的內容不快取，照舊出骨架。
4. 背景更新失敗：保留舊列（固定的「過期」樣式），上方寫「更新失敗，以下是 N 分鐘前的資料」＋失敗原因＋重試；提領
   列上的收款銀行／帳號／匯款金額改為不脈動的「已隱藏」遮罩（扣點照常，K6），統計區顯示「—」，作業面板改成
   「資料未確認，暫停顯示」；匯款相關操作維持暫停。沒有任何資料時是中性錯誤字＋重試（公告不再顯示「尚無公告」）。
   讀取回 403 時不保留舊列，直接顯示錯誤（K2）。
5. 背景更新超過 15 秒仍未回來：同 4 的呈現，提示改成「更新較久，以下是 N 分鐘前的資料」，重新整理恢復可按（不自動
   重送）；沒有任何資料時骨架旁寫「更新較久，仍在等待伺服器回應」。
6. 證件審核與系統告警：切回時照舊出骨架（不快取，§2.5）。
7. 手動「重新整理」：焦點留在鈕上、圖示轉動；工具列下方寫並報讀「正在更新」→「已更新 HH:mm」或「更新失敗」，
   更新途中再按改寫「仍在更新」。
8. 退件／標記已匯款／代為完成之後：列表背景重讀、不換骨架。成功回報出現在工具列下方（不捲動、播報一次、文字在畫面上
   只出現一次），焦點落在該筆的列；那一列因重讀離開清單時移到下一列。批次匯款之後焦點移到列表區。動作失敗也出現在
   工具列下方、捲進視線（不被導覽列蓋住）並取得焦點，列表自動背景重讀一次；沒收到伺服器確認的失敗寫「〈姓名〉：
   未收到伺服器確認，結果不明，列表更新後請確認該筆狀態」。
9. 任何後台寫入送出後、回應前（含會員停權與授予、證件審核、公告、告警）：其他分頁與會員區的子分頁暫時不能切換；
   超過約 0.3 秒時分頁列下方寫「處理中，完成前無法切換分頁」（F）。
10. 證件審核按「通過」失敗：佇列上方出現錯誤（捲進視線、取得焦點），佇列背景重讀一次；成功時佇列上方寫「已通過：
    〈姓名〉」並播報一次。
11. 匯款作業面板、手機展開卡、四個確認框與「查看歷史」對話框寫「資料更新於 N 分鐘前」（不到 1 分鐘寫「剛剛更新」），
    停在頁面上時每分鐘更新一次；超過 10 分鐘改成提示「建議先重新整理」。
12. CSV 匯出只在資料確認後可按；匯出中其他三個分頁停用，分頁列下方寫「匯出中（已收集 N / M 筆），完成前無法切換分頁，
    離開此頁會中止」；收集完的筆數與開始時不符或有重複時不下載、提示重新匯出（K7）；匯出失敗或超過上限時列表照常
    顯示；離開 `/admin` 就停止、不下載。
13. 離開 `/admin`、登出、session 過期、換成另一位管理員、任何後台讀取回 403 之後：快取清空，再進來重新出骨架，不顯示
    前一位的資料。
14. `sessionStorage`／`localStorage` 從未寫入任何 admin 資料。

E3（讀取落地前已被寫入失效→補讀）在 F 之後一般操作到不了（寫入在途時不能切分頁），保留當第二道防線，以 hook 與
元件測試驗證，不列 UI 情境。

### 1.3 不做

- 不動 API、資料庫、`supabase/functions/`、`src/utils/apiClient.ts`、`AdminRoute.tsx`、`App.tsx`。
- 請求時序：每次掛載照舊各打一次，不預載、不輪詢、不加視窗 focus 重抓、更新慢也不自動重送。例外六類，都只在失敗
  或競態時多一次讀取（PR 描述要逐條揭露，A–J E）：
  1. 提領單筆動作失敗後背景重讀列表（D5）；
  2. 證件審核動作失敗後背景重讀佇列（E4）；
  3. 會員停權／授予、公告建立／刪除、告警標記已處理「結果不明」時重讀一次列表，會員詳情面板開著時一併重讀詳情（K3）；
  4. 會員詳情「重開在途」補讀（prompt 第 5 條）；
  5. 讀取落地時發現已被寫入失效，補讀一次（E3）；
  6. 載入更多落地時總數變了（第一頁之後有人新增或移出、offset 已位移），不接尾頁、改重讀一次（業主 2026-10-07 對中途
     對照的裁決 D，`usePagedList` 層，三個使用者都適用）。

  另：會員區子分頁還原為「證件審核」時，掛載當下會同時發出會員列表與證件審核兩支讀取（會員列表的 hook 在
  `MemberManagement` 頂層）——總請求數與現況相同，只是同時發出，不是預載；PR 描述一併揭露。
- 不快取：會員詳情、證件審核佇列、系統告警、導覽列 badge、空結果、會員搜尋結果。提領統計隨列表存，但不從快取顯示（A）。
- 切回只保留提領狀態篩選與會員子分頁；勾選、展開中的卡、捲動位置、會員搜尋字不保留（J、D3）。
- 不碰 `DataCacheContext` 與會員區 hook（S7 範圍，§2.4）。
- 告警不改走 `usePagedList`／`useAdminList`、不快取（H，§2.12）；公告與告警不把取數搬進 `AdminDashboard`（H，檔頭寫
  例外與退場條件）。
- 不加匯出「取消」鈕（E6）；匯出「提升到殼層、切分頁不中斷」另案（B）；不改導覽列 badge 的取數時機（登記遺留）。
- 讀取失敗的錯誤字維持現況原文；固定文案只用在寫入結果不明（T10）。
- 公告與告警列表的 100 筆上限（既有，未揭露總數）不在本工項，登記遺留（R3-P1-3、主 #33；退場條件：告警 UI 讀回應的
  `total`、公告端點回總數時）。

### 1.4 承接遺留逐條裁決（第 5 條）

「來源」：**點名**＝S5 開工 prompt 或母計畫遺留點名給 S5；**同類**＝S5 規劃時同類掃描併入；
**審查**＝審查追加；**業主**＝業主裁決。

| 來源 | 遺留／追加 | 裁決 | 落點 |
|---|---|---|---|
| 點名（S3 #9） | 匯出中切分頁雙下載 | **做**：匯出期間其他分頁停用＋分頁列下方說明（D4、E6、B），卸載後收集停止不下載 | §2.10、§2.11、階段 4c、7 |
| 業主（F） | 寫入在途時切分頁再切回，新掛載讀到寫入前的狀態（主 #7） | **做**：寫入在途期間鎖分頁（含會員區子分頁），與匯出共用同一機制與說明行 | §2.11、階段 7 |
| 點名（S3 #10） | 會員頁「載入更多」中送出搜尋的競態 | **做**：請求序號（兩個方向都擋，§2.9） | 階段 1a、5a |
| 同類 | 提領頁載入更多中換篩選、快速連換篩選的晚到覆蓋（`WithdrawalManagement.tsx:199-242` 同樣沒有序號） | **做** | 階段 1a、4a |
| 審查 | 寫入 await 之後才呼叫的 `reload` 用的是點擊當下的舊閉包（`:299-316`、`:265-284`、`MemberManagement.tsx:331,348`） | **做**：`reload` 一律讀當下的身分與取數函式 | §2.2、階段 1a、4c、5a |
| 點名（S3） | CSV 匯出失敗／超上限走 `setLoadError`，整張列表被換成錯誤區 | **做**：動作錯誤改獨立狀態 | §4.3、階段 4c |
| 同類 | 單筆動作失敗（`:311-312`）、批次部分失敗（`:274-276`）同一個病 | **做** | §4.3、階段 4c |
| 審查 | 載入更多失敗與首頁讀取失敗共用 error，已顯示的列被整片換掉 | **做**：`loadMoreError` 獨立 | §2.2、階段 1a |
| 點名（S3） | `AdminToolbar` 重新整理焦點掉 body、沒有狀態宣告 | **做** | §4.2、階段 3 |
| 點名（S3 #15） | `SystemAlerts` 自刻的重新整理鈕（`SystemAlerts.tsx:87-90`） | **做**：改用 `AdminToolbar`（`filter` 選填、鈕靠右，H） | §2.12、階段 6 |
| 點名（S3） | 「已匯出 N 筆」在工具列上方造成位移 | **做**：回報移到工具列下方 | §4.3、階段 4c |
| 點名（S3） | 驗收站 2 目視項（放大鏡焦點環、`type="search"` 清除鈕） | **不做**：留在驗收站 2 | — |
| 點名（S4） | `detailSeq` 收斂成一個 hook，含「重開在途」補讀窗口 | **做**：`createLatestRequest`／`useLatestRequest` | §2.9、階段 1a、5a |
| 點名（S4） | `list.reload()` 期間關面板焦點掉 body | **自然消失**（背景重讀不卸載「查看」）；把 S4 TDD 期收窄掉的斷言補回來當證據 | 階段 5a |
| 點名（S4） | `IdReviewQueue` 三處 `name ?? …`（`:116,166,186`） | **做**：退場條件「證件審核下次改動時」成立，改用 `memberLabel` | 階段 5b |
| 審查＋業主（E4、K3） | `IdReviewQueue.act` 沒有 catch，失敗無訊息（`:55-63`） | **做**：錯誤區＋背景重讀一次；結果不明用固定文案 | §4.4、階段 5b |
| 業主（D7、C，原 S2e→S3 孤兒遺留） | 證件審核卡「退回在左、通過在右」，手機等寬、桌機靠右 | **做**；PR 描述註明誤觸風險（通過沒有確認框），驗收 2 清單加一項 | §4.4、階段 5b、9 |
| 審查 | 會員頁取詳情失敗的錯誤框捲動後被 sticky 導覽列蓋住（`MemberManagement.tsx:200`、`Navbar.tsx:94-95`） | **做**：與提領頁同一個修法（`scroll-mt`） | §4.3、階段 5a |
| 同類＋審查 | 公告讀取失敗只彈 toast、列表顯示「尚無公告」（把失敗讀成空） | **做**：補錯誤態（與母計畫 S7 的 F3 三態巡檢重疊，S7 列註記已處理） | §4.1、階段 6 |
| 點名（S4） | 近期提領只有 10 筆、無總筆數 | 不做（後端工項） | — |
| 點名（S4） | `apiClient` 沒有逾時 | 不做（全站工項）；列表讀取以 15 秒慢更新提示緩解；寫入卡住時分頁維持鎖定並提示（§2.11、§7） | §2.3、§2.11 |
| 點名（S4） | `ui/dialog.tsx` 關閉鈕名稱是英文「Close」 | 不做（與快取無關） | — |
| 點名（S4） | 停權端點非冪等 | 不做（後端 `/fix-bug`）；它是「會員詳情不快取」的反例之一（§7） | — |
| 審查（主 #38） | 母計畫「待審佇列數即時」沒有工項承接（導覽列 badge 只在 `isAdmin` 變化時抓一次） | 不做：登記遺留 | 階段 9 |
| 審查（R3-P1-3、主 #33） | 告警與公告列表上限 100 筆、未揭露總數（告警回應帶 `total` 但 UI 沒讀） | 不做（既有）：登記遺留 | 階段 9 |

## 2. 系統設計

### 2.1 資料流

- 現況：`AdminDashboard` 定義取數函式、以 props 注入提領與會員兩頁（`AdminDashboard.tsx:19-97`）；
  公告、告警在元件內直接打 `apiClient`。Radix Tabs 只掛 active 分頁，切換＝卸載→重掛→state 歸零→
  重抓→骨架。
- 之後（§3.3）：
  - `useLatestRequest`（`src/hooks/`）：請求序號與**全 repo 唯一的整數戳** `nextStamp()`。
  - `usePagedList`（`src/hooks/`，通用）：請求序號、背景重讀、`meta`、確認旗標、`initial` 種子、`onLanded` 落地驗證與
    「被拒補讀一次」、`clearOnError`——不知道快取存在。
  - `useAdminList`（`src/components/admin/`）：組合 `usePagedList` 與快取 store——查詢身分與快取槽、種子、落地驗證
    （fence）與寫回、資料時間、資料版本、慢更新、403 整體清空。
  - `createAdminCache()`（`admin/adminCache.ts`）：記憶體 store；`invalidate` 取號用 hooks 層的 `nextStamp()`。
  - `AdminConsole`（`admin/AdminConsole.tsx`，新）：以 `user.id` 為 key 掛的分頁區——建立 store、匯出與寫入在途時
    鎖分頁（§2.11）；`AdminDashboard` 只剩頁首、取數函式與 `<AdminConsole key={user.id} …/>`。
  - store 以 `cache` prop 注入提領、會員、公告與 `IdReviewQueue` 四處（證件審核槽恆為 `null`，拿 store 只為了讀取回
    403 時整體清空）；告警不經 `useAdminList`（H），只拿 `onAccessLost` 回呼。五處都拿 `busy`（§2.11）。
- 取數函式與請求參數不變。

### 2.2 `usePagedList` 契約（通用；型別相容，`reload` 的呈現改變）

- **身分**：呼叫端給的 `deps` 序列化成身分字串（`useAdminList` 傳 `deps: [query.id]`）。`load` 存在 ref，**不當 dep**；
  `reload()`／`loadMore()` 一律讀當下的身分與 `load`——寫入 await 之後才呼叫的舊閉包 `reload` 也讀新身分、寫新身分。
- **ticket**：每次重讀（掛載、換身分、`reload()`、被拒補讀）以 `useLatestRequest` 的 `begin()` 取 `{ seq, stamp }`，
  再記上身分；`loadMore` 帶當下 ticket。非最新 ticket 的結算**不改任何 state 與旗標**，不呼叫 `onLanded`。
- **被拒補讀的上限與終態**（R3-P1-1）：一次掛載、換身分或 `reload()` 發起的重讀，落地被 `onLanded` 拒絕時**最多補讀
  一次**；補讀落地又被拒→視同重讀失敗：保留舊列、`error`（「資料在更新途中又有變動，請重新整理」）、可重試。所以
  「未確認」永遠對應「有重讀在途」或「有錯誤可重試」，不會停在「沒有請求、也沒有錯誤」。補讀的 `begin()` 與拒絕在
  同一個同步段內完成——沒有種子的首次讀取被拒時 `isLoading` 連續為真，不出現「沒資料也不在載入」的 render（否則會
  閃出「目前沒有提領申請」，違反 T2「空態不得由過期資料說出」）。
- **卸載後**不補讀、不重讀、不發任何請求（含 D5、E4、K3 的失敗後重讀）。
- **`isConfirmed`**：本身分最新一次**重讀**已成功落地且被 `onLanded` 接受、其後沒有在途的重讀、沒有重讀錯誤。載入更多
  在途、成功、失敗或被作廢都不改它。
- **`isLoadingMore`／`loadMoreError`**：由 ticket 導出——重讀或換身分開始即歸零，擋重入的 ref 一併歸零（可再按）。
- **`canLoadMore`**＝`hasMore && isConfirmed && !isLoadingMore`（主 #3：更新中不接舊尾）；`hasMore` 照舊輸出。
- **`reload()` 回傳 `Promise<'done' | 'failed'>`**：在本身分最新一次重讀（含被拒補讀）結算時兌現——宣告據此，不從旗標
  的邊緣推斷（R3-P1-4）。**一定會兌現**：被較新的重讀取代時跟著新的那次結算；換身分時跟著新身分的結算；卸載時兌現
  `'failed'`——呼叫端常是 `await reload()` 之後才解除處理中（`MemberManagement.tsx:331,348`、`IdReviewQueue.tsx:59`），永懸
  會讓按鈕卡住。
- **`settled()`**：回傳目前這條重讀的結算 promise（沒有在途時立即以上次的結果兌現）——自動更新途中按了重新整理（鈕是
  `aria-disabled`、不重送）時，宣告接在這條上（§4.2）。
- **`clearOnError(err)`**（選填）：回 true 時列表讀取失敗不保留舊列——重讀與載入更多都適用（`useAdminList` 用於 403，K2）。

| 時機 | 畫面上有**本身分**資料（`initial` 種子或本次已載入） | 沒有 |
|---|---|---|
| 掛載／換身分 | **同一個 render** 換上本身分的種子、`isRevalidating`；立即重讀 | 骨架（`isLoading`）＋讀 |
| `reload()`（手動、寫入後） | 保留列表、`isRevalidating` | 骨架 |
| 重讀成功 | 呼叫 `onLanded`：接受→換新資料、`isConfirmed`；拒絕→補讀一次（同一個同步段）；補讀又被拒→同「重讀失敗」 | 同左 |
| 重讀失敗 | **保留舊列**、`error`、`isConfirmed=false`（E2）；`clearOnError` 為真時丟掉列；`reload()` 仍是背景重讀 | 錯誤態（`error`） |
| `loadMore()` | 只在 `canLoadMore` 時接受；成功接在後面（不呼叫 `onLanded`、不動 `meta`）；失敗寫 `loadMoreError`、列表保留（`clearOnError` 為真時同「重讀失敗」丟列） | — |

- 輸出：`items`、`total`、`meta`、`hasMore`、`canLoadMore`、`isLoading`、`isRevalidating`、`isConfirmed`、`error`、
  `loadMoreError`、`isLoadingMore`、`reload`、`settled`、`loadMore`。
- `initial`：本身分的種子快照，**只在身分改變時讀一次**（之後 store 的變化不影響已掛載的清單——失效不會把顯示中的
  種子列抽掉，R3-P2-2(c)）；`onLanded(snapshot, { stamp })`：最新 ticket 的重讀成功落地時呼叫，可回 `false` 表示不接受。
- 單頁清單（公告）以 `total = items.length` 使用，不會出現「載入更多」。
- 資料時間、資料版本、慢更新不在這一層（E8，§2.3）。
- 分層邊界（T12）：檔頭寫明「`initial`／`onLanded`／被拒補讀／`clearOnError` 目前只有 `useAdminList` 一個使用者，第二個
  使用者出現前不再加選項」，`docs/plans/friction-log.md:746-749` 同步一句。

### 2.3 `useAdminList` 與快取 store（約束 a、c）

**查詢身分與快取槽**：型別化 builder 回 `{ id, slot, resource, params }`——`id` 恆非空（完整查詢序列化），決定何時重讀；
`slot` 是快取鍵，可為 `null`（不讀不寫）；`resource` 決定比對哪一個 fence（`slot` 為 `null` 也照樣比對，R3-P1-2）；
`params` 原樣交給 `load(params, { limit, offset })`——頁面只組一次查詢物件，身分、槽與實際送出的參數同源（R3-P2-5）。

| builder | `id` | `slot` | `resource` |
|---|---|---|---|
| `adminQuery.withdrawals({ status, from, to, search })` | 完整查詢 | 只有 `status`（五種）時有；帶日期或搜尋回 `null`（前端目前沒接，母 `progress.md:132`；builder 先處理，免得日後接上時漏） | `withdrawals` |
| `adminQuery.members({ search })` | 完整查詢 | 只有空白搜尋時有 | `members` |
| `adminQuery.announcements()` | 固定 | 固定 | `announcements` |
| `adminQuery.idReviews()` | 固定 | 恆為 `null` | 無（不在對照表） |

**store**（`createAdminCache()`，純記憶體）：

```ts
read(slot): Snapshot | undefined                   // Snapshot = { items, total, meta, fetchedAt }
write(slot, snapshot, stamp): void                 // 空結果＝刪除該槽；戳記早於現有條目或該資源 fence 者丟棄
invalidate(event: AdminMutationEvent): void        // 依對照表（§2.7）刪槽，並以 nextStamp() 取新號設為該資源的 fence
fenceOf(resource): number                          // 落地驗證用
readView() / writeView(partial)                    // 切回位置（D3、J）
open() / dispose()                                 // 成對：dispose 清空資料與 view 並拒絕寫入；open 重新啟用
```

- **整數戳**（R3-P1-2）：`nextStamp()` 住 `src/hooks/useLatestRequest.ts`，**全 repo 只有這一個計數器**；`begin()`（請求送出
  同刻）與 `invalidate` 都從它取號，`adminCache.ts` 由 hooks 匯入（admin→hooks 合法；反向被 `src/appShell.test.ts:58-86`
  禁止）。兩個計數器各自從 0 起算時「嚴格小於即較舊」就失去意義。不用 `performance.now()`（會被粗化、相等是常態、
  假時鐘下凍結）。規則：寫入呼叫端**先 `invalidate` 再 `reload`**；比較一律「嚴格小於即較舊」；`accessLost` 把每個資源
  的 fence 設成新號（不是歸零——歸零會讓在途的舊讀取把 PII 寫回剛清空的 store）。
- **沒有逐槽刪除的公開介面**：失效只能經對照表，從結構上杜絕手動散清。
- **空結果不留**：落地為空時刪掉該槽原有的非空條目（仍受戳記與 fence 約束）——「目前沒有提領申請」不能拿快取當真，
  舊列也不該殘留（主 #13）。

**`useAdminList({ cache, query, load, pageSize })`**：
- 有 `cache` 且 `slot` 非空時讀種子、落地寫回；落地驗證：請求戳記早於 `fenceOf(query.resource)` → `onLanded` 回 `false`
  （E3）。`slot` 為 `null` 而 `resource` 有值時（會員非空白搜尋）同樣比對。
- **資料時間**：`fetchedAt` 以 `Date.now()` 記（牆鐘；種子帶原始時間），文字在 render 時計算；`visibilitychange`／`focus`
  時立即重算，頁面可見時每 `DATA_AGE_TICK_MS`（60 秒，具名常數）重算一次——停在頁面上沒有 re-render 時「剛剛更新」
  才會變老（R3-P2-14）。裝置休眠時單調時鐘不前進，牆鐘正好對應「切去網銀 App 再回來」。
- **資料版本**：每次接受的落地 +1（提領清勾選用）。
- **慢更新**（R3-P2-6）：以**最新 ticket** 為鍵計時——同一個 ticket 的重讀持續 `SLOW_UPDATE_MS`（15 秒，具名常數）→
  `isSlow`；新 ticket（手動重新整理、被拒補讀）重新計時、`isSlow` 立即歸零。重新整理恢復可按。退場條件寫在常數旁：
  全站 `apiClient` 逾時上線後拿掉。
- **403**（K2、T7）：列表讀取（重讀與載入更多，含槽為 `null` 的證件審核、會員非空白搜尋）、會員詳情讀取、匯出收集的讀取
  回 403 → `cache.invalidate('accessLost')`，清空全部快取與 view。列表讀取本身回 403 時經 `clearOnError` 丟掉舊列、顯示後端
  訊息（不寫「權限已撤銷」——偶發 403 見 §7）；會員詳情與匯出收集回 403 時只清 store，畫面上已掛載的列表在它下一次讀取時
  丟列（不為此多發一次讀取；現況 403 也不清已顯示的列）。判斷用 duck-typing（錯誤物件帶數值 `status === 403`），不 import `apiClient`。
  告警的 403 由 `SystemAlerts` 自己呼叫 `onAccessLost`（H、T16）。
- **匯出用的取數**（R3-P2-7(b)）：回傳已包 403 偵測的 `loadPage`，`withdrawalExport` 用它收集。
- `usePagedList` 不 import 任何 admin 模組：`src/appShell.test.ts:58-86` 的「admin/ 組裝邊界契約」禁止
  `components/admin/` 以外的檔案（含測試）匯入它。

### 2.4 生命週期（第 2 條）

- 建立：`AdminDashboard` 讀 `UserContext`，渲染 `<AdminConsole key={user?.id ?? ''} …/>`（`AdminRoute` 保證有 user；
  測試替身的預設 context 帶 `user.id`，R3-P2-22）；`AdminConsole` 用 `useState` 建立 store，effect 內 `open()`、cleanup
  `dispose()`——成對，不依賴 cleanup 的執行次數（repo 目前沒啟用 StrictMode，`src/main.tsx:13`；成對寫法日後啟用也安全，
  主 #34）。使用者 id 一變，分頁區連同 store、busy 狀態與各分頁 state 整個重掛。
- 清除：
  - 離開 `/admin`：卸載 → `dispose`。
  - 登出：`setUser(null)` → `AdminRoute` 導去 `/login`（`AdminRoute.tsx:20-22`）→ 卸載。
  - session 過期：401 → `apiClient` 登出＋`emitSessionExpired` → `/login`（`App.tsx:222`）→ 卸載。
  - 管理員權限被撤：最早在視窗 focus 重抓 `/profile` 後 `isAdmin` 變 false → 導去 `/dashboard` → 卸載；在那之前任何
    後台讀取回 403 → `accessLost`（§2.3）。
  - 直接換成另一位管理員（`SIGNED_IN` 不同 id，`App.tsx:193`）：`AdminConsole` 的 key 一變即重掛。
- 測試（階段 7）：
  - `src/components/admin/AdminConsole.test.tsx`：注入可觀察的 store 工廠（prop），驗卸載時 `dispose`、重掛時新 store、
    四處拿到同一個 store、告警的 `onAccessLost` 清的是同一個 store、匯出與寫入在途鎖分頁。
  - `src/components/AdminDashboard.test.tsx`（不在 `admin/` 內，**不得靜態 import admin 模組**）：`UserContext` 替身沿用
    repo 慣例 `vi.mock('../App')`（例：`MyQrPage.test.tsx:17-21`），預設 context 帶 `user.id`；以行為驗證——切走再切回
    不出骨架、登出／`isAdmin→false` 導走後再回來出骨架、換使用者不顯示前一位的資料、`user` 為 null 時不崩（主 #26）。
- **為何不沿用 `DataCacheContext`**（只沿用它的模式：讀取時水合、`MUTATION_GROUPS` 式對照表）：
  1. 它把整份快取寫進 `sessionStorage`（`src/contexts/DataCacheContext.tsx:166-172`）——直接違反約束 (a)；
  2. 它掛在 App 根（`App.tsx:464`），只在 `SIGNED_OUT` 清（`App.tsx:201-202`），離開 `/admin` 不清、同分頁直接換帳號
     也不清；
  3. `CacheKey` 是固定聯集（`:31-50`），後台要依篩選參數化的鍵。

  兩套快取的收斂條件登記為遺留（§3.6）。

### 2.5 快取範圍與排除清單（約束 b）

| 資料 | 快取 | 切回時（更新中） | 失敗或逾 15 秒（有舊資料，E2） | 理由 |
|---|---|---|---|---|
| 提領列表第一頁（狀態篩選五種） | ✅ | 先顯示；約 0.3 秒後變淡；匯款類閘門關 | 保留舊列（過期樣式）＋提示 | 主要動線 |
| 提領列上的收款銀行／帳號／匯款金額 | 隨列表 | 照常顯示（15 秒內不遮，避免每次切回都閃） | 不脈動的「已隱藏」遮罩 | 匯款依據 |
| 扣點（匯款金額＋手續費） | 隨列表 | 照常 | **照常**（K6） | 遮蔽只擋「照舊資料去網銀匯款」，帳號已遮就匯不出去；扣點是客服回答「為什麼扣我點數」用的 |
| 提領統計（待處理／待查收／已完成件數、待匯款總額） | 隨列表存，**不從快取顯示** | 骨架 | 「—」 | A：P4「待審佇列數即時」；待匯款總額是對網銀轉出總額的依據（`20260802000006_withdrawal_stats.sql:5-7`） |
| 匯款作業面板五欄（含複製帳號）、手機展開卡五欄 | 隨列表 | 骨架 | 「資料未確認，暫停顯示」（不脈動） | 匯款的指定介面（G） |
| 會員列表第一頁＋統計（只限空白搜尋） | ✅ | 先顯示、變淡（沒有被暫停的操作） | 保留舊列＋提示 | 列上只有讀取；搜尋結果不快取，不在記憶體累積被查詢者 |
| 公告列表 | ✅ | 先顯示、變淡（刪除照常，D） | 同上 | |
| 切回位置（提領狀態篩選、會員子分頁） | ✅ view | 回到原處 | — | J、D3；搜尋字、勾選、展開中的卡、捲動不保留 |
| 會員詳情 | ❌ | — | — | 停權／授予確認框的依據（`MemberManagement.tsx:373-403`）；每次「查看」現讀 |
| 證件審核佇列（清單與待審筆數） | ❌ | 骨架 | 本次掛載的舊列＋提示 | 即時資料（plan.md §1 P4），也是通過／退回的依據 |
| 系統告警 | ❌（不走 `useAdminList`，H） | 骨架 | 本次掛載的舊列＋提示（§2.12） | 即時資料 |
| 導覽列待處理 badge | ❌ | — | — | `Navbar.tsx:42-51` 只在 `isAdmin` 變化時抓一次，是**載入當下的快照**（既有），不經後台快取 |
| 空結果 | ❌（且刪除舊條目） | 骨架 | — | §2.3 |
| 確認框內容（標記已匯款的金額與帳號末五碼 `:430-431`、退件含手續費點數 `:469`、批次姓名與合計 `:552-562`、代為完成對象） | 不另存 | — | — | 取自點擊當下那一列；批次框開啟時凍結勾選快照（§2.6）；標記已匯款與批次的鈕只在確認後可按，退件與代為完成依 D 不閘（後端狀態機擋不合法的轉換） |

### 2.6 確認閘門（約束 b 的執行方式）

- **閘門範圍（D）**：只有提領頁的匯款類操作與 CSV——標記已匯款、勾選與批次匯款、CSV 匯出，加上**查看證件**（K5：
  唯一被閘的閱讀入口——簽名網址 1 小時、也是退件判斷的依據）。匯款作業面板五欄（含複製帳號）與手機展開卡五欄在
  未確認時以骨架／「暫停顯示」取代，複製鈕根本不渲染（R3-P2-15(c)）。**不閘**：退件、代為完成、查看歷史、證件審核
  通過／退回、公告建立／刪除、告警標記已處理、會員詳情的停權與授予——後端狀態機擋不合法的轉換，失敗照常顯示；手機
  急救的退件不被鎖。
- **載入更多**不是寫入，但 `canLoadMore` 在重讀未確認時為 false（主 #3），各頁一致。
- **時序（D、主 #12）**：閘門在 `!isConfirmed` 的第一個 render 就生效（點擊不送出），但**外觀**（停用樣式）與原因說明
  跟列表淡化走同一個 `REVALIDATE_DIM_DELAY_MS`（300ms，具名常數）判準——更新在 0.3 秒內結束時不閃灰。300ms 只延遲進入、
  離開立即（主 #28）；失敗、逾時、匯出這類靜態狀態立即顯示。實作（T17）：被閘的鈕、勾選與 ⋯ 選單項用
  `aria-disabled`＋處理函式內擋（焦點不會因停用掉到 body），延遲旗標成立後才套停用樣式。匯出期間的停用照舊是原生
  `disabled`（既有行為與測試，`WithdrawalManagement.test.tsx:618-631`）。
- **原因說明**（R3-P2-19：抽成 `AdminListStatus`）：提領狀態行「已顯示 X / Y 筆」後接——匯出中「・匯出中，暫停其他操作」；
  未確認（延遲後）「・更新中，暫停匯款相關操作」；失敗「・更新失敗，暫停匯款相關操作」。被閘的入口以 `aria-describedby`
  指向它：列上的鈕與勾選直接指；CSV 經 `AdminToolbar` 的 `exportDescribedBy`，沒有資料（錯誤態）時改指錯誤區
  （R3-P2-15(d)）；手機 ⋯ 觸發鈕**不停用**，選單裡只有「查看證件」一項 `aria-disabled`＋說明（K5；不用 Radix 的
  `disabled`——roving focus 會跳過它，報讀器使用者聽不到原因）。會員與證件審核的狀態行只在更新中接「・更新中」（載入
  更多的原因）；公告與告警沒有被閘的入口，不加狀態行（R3-P1-3 隨之消失）。
- **遮蔽**（E2、K6、R3-P2-11）：失敗或 `isSlow` 時列上的收款銀行／帳號／匯款金額改成不脈動的遮罩，格內 sr-only「已隱藏」；
  扣點照常；`AdminStaleNotice` 另加「收款資訊已隱藏，重試後顯示」。
- **勾選**（原 `fetchWithdrawals` `:210-214` 的不變式，主 #2）：資料版本一變（接受的落地、換身分）與批次完成時清空。
  **批次確認框開啟時凍結勾選快照**——框內姓名與合計、送出的 id 都用快照；開框期間閘門一關（例如另一筆單筆寫入完成後
  開始重讀）就關框，回報區以 warning 寫「列表已更新，請重新勾選」（R3-P2-2(b)：不等資料版本變，`reload()` 一開始就關）。
- **資料時間（D1、E5、K5）**：作業面板、手機展開卡、四個確認框（標記已匯款、退件、代為完成、批次）與「查看歷史」對話框
  顯示「資料更新於 N 分鐘前」（不到 1 分鐘「剛剛更新」）——歷史讀的是點擊當下那一列內嵌的 `events`
  （`WithdrawalManagement.tsx:572-599`），與列表同齡。對話框內放在 `AlertDialogDescription`／`DialogDescription` 裡，開框時
  報讀器會念（R3-P2-14(b)）；≥ `STALE_HINT_MINUTES`（10 分鐘）改成提示「建議先重新整理」。
- **對話框的資料時間在開框時凍結**：四個確認框與查看歷史的內容取自點擊當下那一列（歷史是 `historyRecord`，
  `WithdrawalManagement.tsx:176,814,893`），所以開框時把當下的 `fetchedAt` 與內容存在同一個 state，之後不跟著列表變；
  文字照樣每分鐘從這個時間戳重算。K5 的情境正是「更新途中打開歷史」——若綁列表即時的 `fetchedAt`，更新落地後標示會變
  「剛剛更新」，內容卻仍是舊的，比不標更糟。作業面板與手機展開卡顯示的是列表當下的資料，綁即時的 `fetchedAt`。
- **具名常數的位置**：`SLOW_UPDATE_MS`、`DATA_AGE_TICK_MS`、`STALE_HINT_MINUTES`、`REVALIDATE_DIM_DELAY_MS` 都由
  `src/components/admin/useAdminList.ts` 匯出（規格書 §13 草稿的指標指向這支）。
- **保證的範圍**：閘門保證「快取不讓匯款依據比沒有快取時更舊」——本次掛載的最新讀取確認前，標記已匯款、批次、匯出、
  作業面板都拿不到快取值。它**不**保證按下當下的資料是新的：同一頁停太久（切去網銀再回來）、同帳號開兩個分頁，資料
  一樣會過期，這與現況相同；資料時間提示是緩解，根治列遺留（§7）。退件與代為完成在過期資料上按下時由後端狀態機擋
  （§7）。

### 2.7 mutation → invalidation 對照表（約束 c）

`ADMIN_MUTATION_GROUPS`（`adminCache.ts`；`invalidate` 的型別只收表內事件）：

| 事件 | 呼叫點 | 失效 | 理由 |
|---|---|---|---|
| `withdrawalStatus`（標記已匯款／退件／代為完成） | `WithdrawalManagement` 單筆動作 | 全部提領槽＋提領 fence | 該筆在狀態篩選之間移動、件數與金額改變 |
| `withdrawalBatchPaid`（批次匯款） | `runBatch` | 同上 | 同上 |
| `memberSuspend`（暫停／恢復） | `MemberManagement.runAction` | 會員槽＋會員 fence | 列上停權徽章、統計「暫停」 |
| `memberAdmin`（授予／撤銷） | 同上 | 同上 | 列上角色徽章、統計「管理員」 |
| `announcementCreate`／`announcementDelete` | `SystemNotifications` | 公告槽＋公告 fence | |
| `accessLost`（任何後台讀取回 403） | `useAdminList`、會員詳情讀取、匯出收集、`SystemAlerts`（經 `onAccessLost`） | 全部槽、每個資源的 fence 取新號、view | 權限可能已失，PII 不再可達 |

不入表、但逐一確認過的寫入（表驅動測試斷言每個事件的失效集合，不留無人呼叫的事件，主 #25）：

| 寫入 | 為什麼不影響任何快取槽 |
|---|---|
| 證件審核通過／退回 | 佇列不快取；`idVerificationStatus` 雖在會員列資料裡，列上不顯示（只在詳情，詳情不快取）；`admin_review_id` 只改審核狀態與理由欄，證件照路徑不變，提領列不受影響（`20260802000003_admin_id_review.sql:72-78`） |
| 告警標記已處理 | 告警不快取 |

**寫入結果分類**（共用純函式 `classifyWriteFailure`，`writeOutcome.ts`，node 測試）：錯誤物件帶數值 `status` 且為 4xx →
「未提交」；其餘（網路錯誤 `status` 為 `undefined`、5xx、2xx 但回應解析失敗丟出的原生錯誤——`apiClient.ts:189`）→
「結果不明」。5xx 多半代表交易沒提交，但歸「結果不明」是安全方向——錯的只會是描述，所以固定文案不斷言斷線
（R3-P2-1）。

**各寫入站點的處置**（R3-P2-1、K3）——每個站點都以 `busy.startWrite()` 包住請求（§2.11）：

| 寫入 | 成功 | 未提交（4xx） | 結果不明 |
|---|---|---|---|
| 提領單筆（標記已匯款／退件／代為完成） | 失效＋重讀；「已…：〈姓名〉」 | 不失效；後端原文；重讀一次（D5） | 失效＋重讀（D5）；「〈姓名〉：未收到伺服器確認，結果不明，列表更新後請確認該筆狀態」 |
| 提領批次 | 有任一筆成功就失效；重讀（既有）；「X 筆成功、Y 筆失敗」或全數成功 | 整批 4xx（含後端整批回 403，`index.ts:1307-1308`）不失效；重讀（既有） | 失效＋重讀；「批次匯款未收到伺服器確認，結果不明，請逐筆確認列表」 |
| 會員停權／恢復、授予／撤銷 | 失效＋`markChanged`；面板仍顯示該人時重讀詳情；重讀列表（既有，`MemberManagement.tsx:336-350`） | 不失效；面板顯示該人時印在管理區、否則印在列表上方並重讀列表（既有，`:317-334`） | 失效＋`markChanged`＋重讀列表；面板仍顯示該人時一併重讀詳情（K3）；「〈姓名〉：未收到伺服器確認，結果不明，詳情更新後請確認」 |
| 證件審核通過／退回 | 重讀佇列；「已通過／已退回：〈姓名〉」 | 錯誤區印原文；重讀一次（E4） | 錯誤區「〈姓名〉：未收到伺服器確認，結果不明，佇列更新後請確認」；重讀一次（E4） |
| 公告建立／刪除 | 失效＋重讀；toast（既有） | 不失效；toast 原文（既有） | 失效＋重讀（K3）；toast「未收到伺服器確認，結果不明，請確認公告列表後再決定是否重發」 |
| 告警標記已處理 | 背景重讀；toast「已標記處理」（既有） | toast「標記失敗，請重試」（既有） | 背景重讀（K3）；toast「未收到伺服器確認，結果不明，請確認告警列表」 |

規則：
- 寫入呼叫端**先 `invalidate` 再 `reload`**（§2.3）。
- `invalidate`／`markChanged` 不包在「元件仍掛載」的檢查裡；失敗後的重讀則只在仍掛載時發（§2.2）。
- 表上沒有的：其他管理員或會員造成的變更——看不到，由「每次掛載都重讀」涵蓋。

### 2.8 切回位置（D3、J）

- store 的 view 存：提領狀態篩選（預設「全部」）、會員子分頁（預設「會員列表」）。分頁重掛時以它們為初始 state，變更時寫回。
  會員搜尋字、勾選、展開中的卡（`activeId`）、捲動位置不存。
- 回到原篩選時，若該槽有快取就立即顯示列表（§2.2），否則出骨架。

### 2.9 請求序號收斂成一個 hook（第 5 條）

`src/hooks/useLatestRequest.ts`：

```ts
export function nextStamp(): number;              // 全 repo 唯一的單調整數戳（§2.3）
export interface Ticket { seq: number; stamp: number; entityId?: string; entityVersion?: number }
export interface LatestRequest {
  begin(entityId?: string): Ticket;               // 遞增序號、作廢之前的；同刻以 nextStamp() 取戳
  peek(): Ticket;                                 // 目前序號，不遞增
  isLatest(t: Ticket): boolean;
  markChanged(entityId: string): void;            // 該對象版本 +1
  changedSince(t: Ticket): boolean;               // t 發出後該對象是否變過
}
export function createLatestRequest(): LatestRequest;   // 純核心，node 可測
export function useLatestRequest(): LatestRequest;      // useRef 持有一份核心
```

使用者（各自一個實例，互不相干，主 #35）：
- `usePagedList`：重讀與換身分 `begin()`；`loadMore` 只在 `canLoadMore` 時接受並帶 `peek()`；兩個方向都擋：重讀在途時不能
  開始載入更多（`isConfirmed` 為 false），載入更多在途時重讀開始即作廢它並歸零 `isLoadingMore` 與重入 ref。
- `MemberManagement` 的詳情：`detailSeq`／`bumpSeq`／`isLatest`（`MemberManagement.tsx:159-175`）換成它；`markChanged`／
  `changedSince` 只有詳情用。動作成功或結果不明時 `markChanged(target.id)`；`openDetail` 的讀取落地時若 `changedSince`
  成立就**丟棄該次結果**（不 `showDetail`）並再讀一次，補讀落地才顯示——否則會閃一次舊狀態，期間「暫停」可按（R3-P2-1）。
  關掉 S4 遺留 D 的窗口（動作在途時關面板、重開同一位、讀取還在途時動作才完成）。

### 2.10 匯出（D4、E6、B、K7）

- 只在 `isConfirmed` 時可按；收集範圍一律以確認過的 `total` 為準。
- 收集迴圈抽成 `admin/withdrawalExport.ts` 的純函式，用 `useAdminList` 回傳的 `loadPage`（帶 403 偵測，R3-P2-7(b)）：每個
  `await` 之後（含最後一頁）、建 Blob 前都檢查「仍掛載」，卸載就停止、不下載；進度以回呼回報。
- **核對**（K7）：每一頁回應自帶的 `total` 都要等於起始 `total`（起始值本身可能已過期，只比最後筆數會漏掉「開始前就新增」
  的列），收完後筆數等於起始 `total`、id 沒有重複；任一不符就視為匯出失敗、不下載，回報「匯出途中資料有變動，請重新匯出」
  ——offset 分頁遇到他人變更或在途寫入提交而位移時，既有迴圈會靜默少列或重複（`WithdrawalManagement.tsx:338-348`），違反 W6
  「不給半份」。缺 `total` 的回應沿用起始總數（同載入更多的後備），筆數與重複照樣核對。
- **殘餘風險（業主 2026-10-07 裁決 C 接受）**：補償式變動——收集途中一筆新申請排進已收過的範圍前面、同時一筆已收過的離開
  篩選——總數不變、筆數相符、id 不重複，所有核對都過，檔案卻留著已離開的那筆、漏掉新進的那筆。offset 分頁在前端無法根治；
  根治（keyset 分頁或匯出快照）登規格書 §14 當後端遺留（階段 9）。核對是「擋下大多數位移」，不宣稱保證「不給半份」；
  `withdrawalExport.ts` 檔頭與 PR 描述照此寫。
- 鎖分頁與說明行走 §2.11 的 `busy.startExport()`。工具列既有的 `role="status"` 匯出宣告區改念「匯出中，完成前無法切換分頁」
  （B 的「匯出宣告區文字同步」；單次，不逐頁念；非匯出時仍為空）——停用的分頁會被 Radix 鍵盤導覽跳過、說明行又不是
  live region，不念這句，報讀器與鍵盤使用者就不知道分頁為何切不了。

### 2.11 鎖分頁：匯出與寫入在途（B、F）

- `AdminConsole` 持有 busy 狀態，往下傳給五處（`MemberManagement` 再把它連同 `cache` 轉給 `IdReviewQueue`）：

  ```ts
  interface AdminBusy {
    locked: boolean;                                                    // 有寫入在途或匯出中
    noteId: string;                                                     // 說明行的 id，給停用的分頁 aria-describedby
    startWrite(): () => void;                                           // 回傳 release（冪等）；以計數處理重疊
    startExport(): { progress(collected: number, total: number): void; end(): void };
  }
  ```

  各元件以選填 prop 接（預設模組常數 `NOOP_BUSY`：`locked: false`、方法皆 no-op）；型別在階段 4c 一次定案（含讀取側），
  階段 7 只把 `AdminConsole` 接上。`AdminConsole` 以 `useMemo` 維持 busy 的身分，只在 `locked`／`noteId` 變化時換新。
- 範圍取廣義：§2.7 表上的全部後台寫入（F 原文是「列表寫入 POST」；會員停權與授予、證件審核、公告、告警也會卸載在途的元件）。
  寫入站點一律 `const release = busy.startWrite(); try { await 送出 } finally { release(); }`——**只包住寫入請求**，結算後立即
  釋放、不等後續的重讀（否則重讀卡住時說明行會謊稱「等待伺服器回應」）；`release` 冪等（重複呼叫不會讓計數變負）。
- 有寫入在途或匯出中時：外層其他分頁 `disabled`（Radix 鍵盤導覽會跳過；外層 Tabs 改受控 `value`／`onValueChange`，才知道
  誰是「其他分頁」），**會員區子分頁也停用**（T14：證件審核在子分頁裡，切子分頁同樣會卸載在途的元件——K4 的前提「寫入在途
  不能切分頁」要連它一起成立；內層 Tabs 已因 D3 的 view 改成受控，非 active 的子分頁 `disabled={busy.locked}`＋
  `aria-describedby={busy.noteId}`）。邏輯立即生效；停用樣式與說明行在 `REVALIDATE_DIM_DELAY_MS` 後出現——一般寫入 0.3 秒內
  結束時不閃。
- **說明行在分頁列正下方**（T13：F 讓沒有工具列的公告與證件審核也會鎖分頁，B 原訂的「工具列下方」放不下共用的一行）：
  匯出中「匯出中（已收集 N / M 筆），完成前無法切換分頁，離開此頁會中止」；寫入在途「處理中，完成前無法切換分頁」，
  同一筆寫入持續超過 `SLOW_UPDATE_MS` 時接「・仍在等待伺服器回應，離開此頁不會取消已送出的操作」。停用的分頁以
  `aria-describedby` 指向它（id 由 `AdminConsole` 以 `useId` 產生）。說明行是可見文字、不是 live region。
- 寫入卡住（`apiClient` 沒有逾時）時分頁維持鎖定到結算——與匯出卡住（E6）同一個取捨，出口是離開此頁（§7）。

### 2.12 告警（H）

- 不快取、不經 `usePagedList`／`useAdminList`；保留 `SystemAlerts` 自己的取數與 state，只做三件事：
  1. 改用 `AdminToolbar`（無 `filter`、重新整理鈕靠右）：手動重新整理與標記後的重讀改成背景更新——保留列表、`isUpdating`、
     `onRefresh` 回傳結算；失敗且有列時保留舊列＋`AdminStaleNotice`，沒有列時照舊錯誤態（`AdminListError` 帶現況文字
     「載入告警失敗，請檢查網路後再試」「重新載入」）；首次載入照舊骨架（改用 `AdminListSkeleton`）。
  2. 標記已處理：`busy.startWrite()`；結果分類與文案依 §2.7；結果不明時重讀一次（K3）。
  3. 讀取回 403：清空列表、顯示錯誤，並呼叫 `onAccessLost`（K2、T16）。
- 沒有 15 秒慢更新（那在 `useAdminList`）：重新整理卡住時鈕維持更新中，切走再切回就是新的一次讀取（與現況相同）。
- T15：上述 1 的呈現（骨架、錯誤區、陳舊提示）用共用元件——H 限制的是資料層；「四頁統一骨架」（主 #30、#42）與共用
  錯誤區塊（I 的後半，E2 只取代了「清掉舊資料」的前半）照做。

### 2.13 API／資料庫

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
| 既有測試 | 不傳 `cache`＝不跨卸載保留；不傳 `busy`＝不鎖分頁（預設 no-op） | 替身方式全面改寫 |

- 殼層測試（`AdminDashboard.test.tsx`）照舊替身 `apiClient`——殼層本來就擁有真的取數函式。
- `SystemNotifications`／`SystemAlerts`：**不搬**（H）。兩支檔頭寫「與 `AdminDashboard` DI 慣例的例外：取數在元件內；下次改
  這兩支的資料層時搬進 `AdminDashboard`」。理由：兩支既有測試全以 `vi.mock(apiClient)` 替身（`SystemNotifications.test.tsx:13`、
  `SystemAlerts.test.tsx:19`），改成 props 注入要改寫全部替身，而快取不需要它。公告把模組層的取數函式交給 `useAdminList`
  （hook 仍是注入式）；告警不經共用 hook（§2.12）。

### 3.2 分頁掛載裁決（第 3 條）：維持「非 active 不掛載」＋快取水合，不用 forceMount

| | 不掛載＋水合（採用） | forceMount 全掛 | 首次造訪後常駐 |
|---|---|---|---|
| 首進請求數 | 1（同現況） | 4（等於預載，違反 §1.3） | 1 |
| 切回請求數 | 1（同現況） | 0，要另接「切回時刷新」 | 0，同左 |
| 記憶體 | 提領 ≤ 5 槽×50 列、會員 50 列、公告 ≤ 100 則的純資料 | 四棵元件樹＋DOM 常駐 | 造訪過的元件樹＋DOM（含載入更多的頁）常駐 |
| PII 位置 | 非 active 分頁只在 JS heap | 未遮罩身分證與帳號常駐隱藏 DOM | 同左 |
| 測試 | DOM 與現況相同 | 隱藏節點讓 `getByText`／e2e 文字定位器多出重複 | 同左 |

結論不靠「DOM 與 JS heap 可見性不同」那條（只算深度防禦）：請求數、記憶體、測試三欄已足夠。代價：匯出與寫入在途時
切分頁要另外處理（§2.11）。

**背景刷新的觸發：每次掛載（切回）都刷新，不設 stale 時間**。(1) 請求數與時序與現況完全相同；(2) 提領列是匯款依據，
TTL 內不刷新＝寫入依據未經確認；(3) 提領列裡的證件照是 1 小時的簽名網址（`api/index.ts:1144`），不刷新會留著過期連結。
會員區的 `SOFT_TTL` 30 秒（`DataCacheContext.tsx:81`）是為了 F5 與快速切頁的請求風暴，後台切分頁是人的節奏，不適用。

### 3.3 hook 分層與 friction-log 的 `usePagedList` 教訓（E8、T12）

`docs/plans/friction-log.md:746-749`：「SWR 式背景重抓硬併進 `usePagedList` 只會讓 hook 長出只有它用的選項……判準是
『守的是同一條規則』」。本工項的切法：

- 進 `usePagedList` 的規則，是**所有清單都該守的**：不靜默截斷（既有）、載入更多失敗不清空已顯示的資料（既有，本次補上
  `loadMoreError` 讓畫面真的做到）、最後意圖勝出（序號，含舊閉包）、重新驗證中與失敗時保留舊資料（ui-ux §5 的通則）、
  確認前不得當依據（`isConfirmed`）。
- 擴充點 `initial`／`onLanded`（含「被拒補讀一次」的上限與終態）／`clearOnError` 目前只有 `useAdminList` 一個使用者。
  T12（業主 K 留言確認不推翻）：補讀的狀態機留在 `usePagedList`——「未確認＝有請求在跑或有錯誤可重試」這條不變式要在
  同一個 hook 裡才守得住；分到兩層就會出現 R3-P1-1 那種「沒請求也沒錯誤」的卡死態。代價由檔頭與 friction-log 的一句話
  承擔：「第二個使用者出現前不再加選項」。
- 只有後台需要的——記憶體快取、身分與槽、對照表、fence、view、403 清空、資料時間、資料版本、慢更新——全部放在 `admin/`
  的 `useAdminList`／`adminCache.ts`。
- 整數戳 `nextStamp()` 在 hooks 層（`useLatestRequest.ts`），admin 匯入它（R3-P1-2）。
- 單頁清單只剩公告用 `usePagedList`（`total = items.length`，檔頭註明）；告警不用（H）。

### 3.4 動到的模組

- 新增（`src/hooks/`）：`useLatestRequest.ts`（含 `nextStamp`）
- 新增（`src/components/admin/`）：
  - `adminCache.ts`（store、builder、對照表）、`useAdminList.ts`、`writeOutcome.ts`（`classifyWriteFailure` 與結果不明文案）
  - `AdminConsole.tsx`（以 `user.id` 為 key 的分頁區、store、busy 鎖與說明行）
  - `AdminListSkeleton.tsx`、`AdminListError.tsx`（沒有資料時的讀取錯誤）、`AdminStaleNotice.tsx`（有舊資料時的「更新失敗／
    更新較久」提示）、`AdminListStatus.tsx`（狀態行與停用原因，R3-P2-19）、`AdminActionReport.tsx`（提領頁的回報區）、
    `DataAgeNote.tsx`（資料時間，含共用的 `formatDataAge`）
  - `withdrawalExport.ts`（CSV 收集迴圈與核對）
  - `useRefreshAnnouncer.ts`（手動重新整理與重試的狀態文字，§4.2）
- 修改：`src/hooks/usePagedList.ts`、`src/components/AdminDashboard.tsx`；`src/components/admin/` 的
  `WithdrawalManagement`（改走 `useAdminList`；匯款類閘門收成單一 `remittanceGate` 往下傳）、`WithdrawalFundingFields`、
  `WithdrawalCardList`、`CardOverflowMenu`（選單項可 `aria-disabled`＋說明）、`MemberManagement`、`IdReviewQueue`、
  `SystemNotifications`、`SystemAlerts`、`AdminToolbar`
- `WithdrawalManagement` 要保留在檔內的字串：`ACTION_DONE`、「載入提領申請中」「目前沒有提領申請」「重試」（以 props
  傳給共用元件）——journey 離線檢查讀這支檔（`test_admin_row_targeting.py` 的 `WITHDRAWAL_UI`）。
- e2e：`features/admin_dashboard.feature`、`steps/admin_steps.py`、`mocks/backend_api_mock.py`、
  `pages/admin_dashboard_page.py`、`test_overflow_sweep.py`、`journey/tools/test_admin_row_targeting.py`
- 不動：`supabase/**`、`DataCacheContext.tsx`、`apiClient.ts`、`App.tsx`、`AdminRoute.tsx`、`Navbar.tsx`、
  `ui/skeleton.tsx`（S6 可能動它）
- 與 S6／S7（主 #30）：S6 只動前台詳情頁與首頁，產品碼不撞；共用檔是 `docs/ui-ux-guidelines.md`、
  `docs/plans/platform-uiux-redesign/{construction-plan,progress}.md`、`src/utils/repoHygiene.test.ts`、
  `e2e/mocks/backend_api_mock.py`——後合併者 rebase。S7 等 S5、S6 都合併才開工（D8），開工前 rebase 到含 S5 的 develop
  （`usePagedList` 的 `reload` 呈現改了）。

### 3.5 PII 守衛（約束 a）

- **主防線：行為測試**（`adminCache.test.ts`、`AdminConsole.test.tsx`、`AdminDashboard.test.tsx`）：以含身分證與帳號的測資
  走完寫入→讀取→失效→dispose 與「切走再切回」，`Storage.prototype.setItem` 零呼叫。盲點寫在測試註解：spy 看不到屬性
  賦值（`sessionStorage.k = v`），那條路由靜態守衛擋。
- **輔助：靜態守衛**（`src/utils/repoHygiene.test.ts` 新開 `describe('後台 PII 不得落地')`，R3-P2-8）：以
  `ts.createSourceFile` 解析後掃識別字與 import（註解與字串天然排除——regex 剝註解會把字串裡的 `//` 當成註解起點，吃掉
  同一行後面的識別字而假綠）；範圍 `src/components/AdminDashboard.tsx`、`src/components/admin/**`、
  `src/hooks/usePagedList.ts`、`src/hooks/useLatestRequest.ts`，排除 `*.test.*`（沿用同檔的 `isSource`）。全範圍禁用
  `sessionStorage`、`localStorage`、`indexedDB`、`caches`、`document.cookie`，以及 import `DataCacheContext`、`formDraft`；
  `adminCache.ts`／`useAdminList.ts`／`AdminConsole.tsx` 另禁 `history.pushState`／`replaceState`、`useSearchParams`／
  `setSearchParams`、`BroadcastChannel`、`navigator.storage`、`window.name`。自測含正反例：只在註解或字串提到不算違規、
  真的呼叫算違規（主 #30）。限制寫在註解裡：路徑列舉之外的新檔掃不到，所以行為測試才是主防線。現況全 repo 沒有
  service worker、`indexedDB`、`BroadcastChannel`、`history.pushState`——這些是防未來退化。

### 3.6 設計理由的長期落腳處

規劃目錄收尾會刪，「為什麼」要留在程式碼裡：
- `adminCache.ts` 檔頭：記憶體內與不落地的理由、為何不沿用 `DataCacheContext`（§2.4 的 1–3）、為何不設 TTL、排除
  清單與空結果不快取、整數戳與 fence、§7 重複匯款反例一句。
- `useAdminList.ts` 檔頭：為何不 forceMount（§3.2）、確認閘門的保證範圍（§2.6）、`SLOW_UPDATE_MS` 的退場條件、
  403 的語意（清空是安全方向，不代表撤權）。
- `usePagedList.ts` 檔頭：§3.3 的分層判準與 T12 的邊界；`docs/plans/friction-log.md:746-749` 同步一句。
- `AdminConsole.tsx`：`open`／`dispose` 成對的理由、為何寫入在途也鎖分頁（F 與 K4）、說明行為何在分頁列下方（T13）。
- `SystemNotifications.tsx`／`SystemAlerts.tsx` 檔頭：DI 慣例的例外與退場條件（H）。
- 母 progress 遺留：兩套快取的收斂條件（S7 之後評估 `DataCacheProvider` 能否支援不落地與參數化鍵）。

## 4. UI/UX

### 4.1 骨架

`AdminListSkeleton`：外層用 `<output>`（隱含 `role="status"`；biome `useSemanticElements` 不接受 `div role="status"`，
沿用 `IdReviewQueue.tsx:67`，主 #42）＋`aria-label`＋`aria-busy`；props `label`（必填，由頁面傳入，保留各頁既有名稱）、
`variant: 'rows' | 'cards'`、`count`、`message`（選填——放在 `<output>` 之外的獨立段落：busy 的 live region 暫不播報新增
文字，R3-P2-18(a)）。內部只用 `div`（**不得**用 table／row role，否則 page object 會把骨架當成終態表格）。只有列表骨架
是 status；統計、作業面板、列上欄位的骨架 `aria-hidden`。

| 分頁 | 現況 | 之後 |
|---|---|---|
| 提領 | 列表 3 條 `h-10`（`WithdrawalManagement.tsx:792-797`，手機內容是卡片卻用列形）；統計先顯示 `$0`／`0`（`:139-142,613-686`）；「已顯示 0 / 0 筆」（`:762-764`）；桌機作業面板到資料來才出現（`:690`） | 手機 cards、桌機 rows；統計骨架（手機摘要列取兩行高、桌機四卡），切回時也是骨架（A）；狀態行保留高度的佔位；桌機作業面板佔位（結果為空時收掉）；名稱「載入提領申請中」不變 |
| 會員 | 列表同上（`MemberManagement.tsx:556-561`）；統計先閃 0（`:56,420-483`），手機是一行摘要 `dl`（`:425-439`） | 手機 cards＋一行摘要的骨架（兩行高）、桌機 rows＋三卡骨架；名稱「載入會員列表中」不變 |
| 公告 | 置中 spinner（`SystemNotifications.tsx:233-236`） | cards（名稱「載入公告中」） |
| 告警 | 已是骨架（`SystemAlerts.tsx:93-103`），沒有 role 與名稱 | `AdminListSkeleton`：手機 cards、桌機 rows（名稱「載入告警中」，T15） |
| 證件審核 | 已是同形骨架（`IdReviewQueue.tsx:65-72`） | 形狀不動；接 `message`（慢更新提示，R3-P2-18(b)） |

`AdminListStatus` 的內容（只在提領、會員、證件審核三頁）：載入中（沒有資料）＝保留高度的佔位；已確認＝「已顯示 X / Y 筆」；
其後依狀態接後綴（§2.6）；沒有資料的錯誤＝不顯示。

### 4.2 更新中的呈現與工具列

- 列表區包成 `<section aria-label="提領申請列表">`（會員「會員列表」、公告「公告列表」、告警「告警列表」）：更新中
  `aria-busy="true"`；降透明度在 `REVALIDATE_DIM_DELAY_MS` 後才出現、結束立即恢復（快網路下不閃；ui-ux §5 沒有這個數字，
  階段 9 寫進去）。匯款類閘門的停用樣式與它同一個旗標（§2.6）。統計區切回時是骨架（A），不變淡。
- **過期樣式**（R3-P2-12）：失敗與逾時態立即套用、固定不變（不是 `aria-busy` 的延遲淡化）。數值以 `globals.test.ts` 同一條
  WCAG 公式驗——`text-muted-foreground` 疊上去仍 ≥ 4.5:1（淺色與深色兩種主題），做不到就改成不靠透明度的框線＋圖示。
- `AdminToolbar` 新契約（取代 `isRefreshing`；R3-P1-4、主 #16、#28）：
  - `onRefresh(): void` 與 `statusText: string`——宣告邏輯不在工具列裡，而在頁面層的 `useRefreshAnnouncer(list)`（見下方
    「狀態文字」）；工具列只畫出 `statusText`。這樣錯誤區與陳舊提示的「重試」也走同一條宣告（§4.3）。
  - `isUpdating`：首次載入或背景更新中（`isSlow` 時為 false）——重新整理鈕 `aria-disabled`（**不用 `disabled`**：被按的鈕
    變停用正是焦點掉到 body 的原因）、點擊照樣交給 `onRefresh`（由 `useRefreshAnnouncer` 決定不重送請求、只改寫狀態文字）、
    圖示轉動（`motion-safe`）；`aria-disabled` 的灰化與游標樣式寫在
    `AdminToolbar` 內（`Button` 基底只有 `disabled:` 樣式，`button.tsx:24`；`loading` 會設 `disabled`，不能用，`:180`）。
  - `refreshDisabled`：真停用、點了不呼叫 `onRefresh`——只用在載入更多中（焦點不在這顆鈕上）；匯出中的 `disabled` 同。
  - `exportDescribedBy`：CSV 停用原因（§2.6）。
  - `filter` 改選填：告警頁沒有篩選，重新整理鈕靠右（H、主 #43）。
  - 第三版的 `updateError` 由 `useRefreshAnnouncer` 的結算取代；`exportProgress` 移到 `AdminConsole` 的說明行（§2.11）。
- **狀態文字**（可見字即播報字，同一個節點）：常駐 `aria-live="polite"` 的小字段落，**放在工具列 flex 行之外**（同既有
  匯出 `role="status"` 區的理由：留在行內會被 `test_admin_mobile_layout.py` 的列數量測算成第二列）。內容由
  `useRefreshAnnouncer(list)` 產生（`list` 只要有 `isUpdating`、`reload()`、`settled()`——告警以元件內 state 提供同樣三個）：
  - 手動按下（工具列的重新整理、錯誤區或陳舊提示的重試）時寫「正在更新」；更新途中再按交替成「仍在更新」（同一串字不會被
    再播一次，R3-P1-4(b)）。
  - 沒有更新在途時呼叫 `reload()`；自動更新途中（鈕是 `aria-disabled`、不重送）則接在 `settled()` 上。
  - 依**最後一次按下**所接的那條結算寫「已更新 HH:mm」或「更新失敗」——**不從 `isUpdating` 的邊緣推斷**（15 秒放行時
    `isUpdating` 會先掉下去，邊緣推斷會在真正落地前誤報「已更新」）。
  - 它是可見的——快網路與 reduced-motion 下按了也看得到回饋（主 #28）。切回與寫入後的自動更新不寫、不播。沒有工具列的頁面
    （公告、證件審核）由陳舊提示或錯誤區本身顯示這段文字。
  - 不用 `role="status"`——那是骨架的定位器（§4.5），會員頁既有的詳情讀取宣告也是同一個理由（`MemberManagement.tsx:495-502`）。

### 4.3 錯誤與回報

- **沒有資料時的讀取失敗**：`AdminListError`——props `message`、`retryLabel`、`tone`、`onRetry`（頁面傳入，錯誤字沿用各頁
  現況，T11）；中性字（`text-muted-foreground`，§13 第 4 條）＋`role="alert"`。重試鈕依 §12.11：整區失敗時重試是唯一出路→
  流程鈕（提領、會員、告警、證件審核）；公告頁同頁有流程鈕「發布公告」→次要。
- **有舊資料時的失敗或逾時**：`AdminStaleNotice`（列表上方，`StatusCallout variant="warning"`——§13.4 讀取失敗不上紅、
  §12.5 第四種狀態併入 warning，R3-P2-13(c)）：
  - 失敗：「更新失敗，以下是 N 分鐘前的資料」＋一行原因（現況原文；403 時不走這裡，K2）＋次要重試、`role="alert"`；同一輪
    已有動作失敗的 alert 時改不帶 role，不打斷「結果不明」那句（R3-P2-17(c)）；由手動重新整理或重試觸發的失敗也不帶 role——
    狀態文字已經播過「更新失敗」，不再念第二次。
  - 逾時：「更新較久，以下是 N 分鐘前的資料」、不帶 role（不打斷）；公告與證件審核沒有工具列，提示附次要「重試」
    （R3-P2-18(b)）。
  - 提領頁另加「收款資訊已隱藏，重試後顯示」（E2）。
  - N 用與 `DataAgeNote` 共用的 `formatDataAge`：不到 1 分鐘寫「剛剛」（R3-P2-13(b)）。
- **載入更多失敗**：`loadMoreError` 顯示在載入更多鈕旁，已顯示的列保留。
- **提領頁的動作回報**（`AdminActionReport`，工具列正下方，手機整寬，主 #15）——兩個**兄弟節點**，不巢狀（R3-P2-17(a)）：
  - 狀態容器：常駐、空時不佔高、帶 `role="status"`；`StatusCallout` 以 `role={undefined}` 放在裡面——**可見字與播報字是
    同一個節點**，文字在 DOM 中只出現一次（`status-callout.tsx:73-77` 的 `{...props}` 在 `role="status"` 之後，覆寫成立）。
    成功（「已退件：王小明」「已匯出 N 筆」）用 success；「列表已更新，請重新勾選」是批次被取消的警示，用 warning
    （§12.5，R3-P2-17(b)）。
  - 失敗容器：只在有失敗時渲染，`StatusCallout` destructive、`role="alert"`（單筆失敗、批次「X 筆成功、Y 筆失敗」、
    匯出失敗與核對不符、超過上限）；**剛按下的動作**失敗時捲進視線並取得焦點，晚到的不搶焦點（比照
    `MemberManagement.tsx:176-178,195-202`）。
  - 兩個容器都帶 `scroll-mt-20`——導覽列是 `sticky top-0`、高 64px（`Navbar.tsx:94-95`），不加就會被蓋住；會員頁的錯誤框
    同步加。
  - 收起時機：按「知道了」、下一個動作開始、換篩選、手動重新整理。
- **證件審核的回報**（R3-P2-16(d)）：同一套兩個兄弟節點放在佇列上方——成功「已通過：〈姓名〉」「已退回：〈姓名〉」；失敗
  見 §4.4。只在有內容時渲染（`IdReviewQueue.test.tsx:117` 的 `getByRole('alert')` 要求單一匹配）。
- **焦點後備**（R3-P2-16）——焦點元素消失或停用時落在哪：

| 觸發 | 焦點落點 | 宣告 |
|---|---|---|
| 單筆確認（標記已匯款／退件／代為完成） | 該列或卡片容器（`tabIndex=-1`）；該列因重讀離開清單→下一列→上一列→列表區 | 成功回報（status） |
| 確認框「取消」或 Esc（提領四個確認框、查看證件、查看歷史） | 開框的觸發鈕（比照 `MemberManagement.tsx:182-184,283-292` 的 `confirmReturnFocus`——這些框沒有 Trigger，Radix 的 `onCloseAutoFocus` 只還給 Trigger）；鈕已不在→該列容器 | — |
| 批次確認、按「知道了」、「清除選取」 | 列表區（`tabIndex=-1`） | 批次結果（status／alert） |
| 「載入更多」 | 鈕維持在原位：載入中改 `aria-disabled`（不用原生 `disabled`），完成後焦點仍在鈕上；沒有更多時→列表區 | — |
| `AdminListError`／`AdminStaleNotice` 的「重試」 | 重讀期間錯誤區或提示保留在原位（只換成「正在更新」），焦點留在鈕上；被列表取代時→列表區 | 走 `useRefreshAnnouncer`，與工具列同一套狀態文字（「正在更新」→「已更新 HH:mm」／「更新失敗」） |
| 公告刪除、告警標記已處理（列重讀後消失） | 下一則→上一則→列表區 | toast（既有） |
| 證件審核通過／退回 | 下一張卡→上一張→佇列區 | 「已通過／已退回：〈姓名〉」（status） |
| 動作失敗（剛按下的） | 錯誤框 | alert |

  所有程式化聚焦目標（列、卡、列表區、佇列區、錯誤框）一律帶 `scroll-mt-20`（R3-P2-16(e)）。

### 4.4 證件審核卡（D7、C、E4、K3）

- 按鈕：「退回」在左、「通過」在右（§12.11 次要左主要右）；手機 `grid grid-cols-2` 兩顆等寬，桌機卡片尾靠右
  （`sm:justify-end`）。目前是 `IdReviewQueue.tsx:198-215` 的 `flex gap-2`、通過在左、內容寬。兩顆都不受閘門約束（D）。
- 動作失敗：佇列上方的錯誤區（`role="alert"`、`scroll-mt-20`、剛按的失敗取得焦點），並背景重讀一次（E4）；結果不明用 §2.7 的
  固定文案。成功回報見 §4.3。
- PR 描述註明誤觸風險（C）：通過沒有確認框、退回有；憑舊位置操作的人可能一觸誤通過。驗收 2 清單加一項（階段 9）。

### 4.5 定位器契約（第 7 條）

| 定位器 | 位置 | S5 之後 | 處置 |
|---|---|---|---|
| `get_by_role("status", name="載入提領申請中")` | `e2e/pages/admin_dashboard_page.py:74,100`（journey f50、f70 共用） | 只在首次載入、換到沒快取的槽、慢更新且無資料時出現；寫入後與切回改背景更新 | `_wait_list_settled` 另等「提領申請列表」的 `aria-busy` 消失；階段 4c 釘「成功回報出現的那次 commit 裡 `aria-busy` 已為 true」 |
| `skeleton.or_(table).or_(empty).or_(retry)` | `admin_dashboard_page.py:80-82` | 保留舊列＋提示的重試鈕時 table 與 retry 同時可見，`expect` 會 strict mode violation、吃掉「載入失敗」診斷（R3-P2-25） | 先判 `retry.count()`：有重試且沒有表格→載入失敗診斷；有表格時 retry 不進 `or_` 鏈 |
| 字串「載入提領申請中」「目前沒有提領申請」「重試」 | `e2e/journey/tools/test_admin_row_targeting.py:126-135` | 三個字串仍寫在 `WithdrawalManagement.tsx`（以 props 傳給共用元件） | 加一條：`_wait_list_settled` 有等 `aria-busy`；區塊名稱同時出現在產品與 page object |
| 動作回報文字（`get_by_text("已退件：王小明")` 等） | `admin_dashboard_page.py:144-147`（無 `.first`）、`WithdrawalManagement.test.tsx:340,421,613,632,708,733,741,746` | **在 DOM 中只出現一次**（§4.3 容器包住 callout，不複製文字） | 階段 4c 加一條斷言釘住單一匹配 |
| `getByRole('status', { name: '載入提領申請中' })` | `WithdrawalManagement.test.tsx:106,110` | 不變（首次載入；`<output>` 的隱含 role 照樣命中） | 不動 |
| `queryByRole('status')` 為 null | `MemberManagement.test.tsx:121` | 不變——會員沒有新的 `role="status"` | 不動 |
| `queryByRole('status')` 為 null | `IdReviewQueue.test.tsx:61` | `AdminActionReport` 的狀態容器常駐 `role="status"`（live region 要先在才念得出來），證件審核也用同一套（§4.3） | 改寫清單 5b（業主 2026-10-07 裁決 B：改測試、保留常駐，不加開關） |
| `getByRole('status')`（匯出宣告） | `AdminToolbar.test.tsx:76-98` | 匯出中改念「匯出中，完成前無法切換分頁」——既有斷言是 `toContain('匯出中')`、非匯出時為空（`:82`），照綠；說明行不是 live region | 階段 3 補一條斷言；另見下方改寫清單 |
| 重新整理 `hasAttribute('disabled')`（載入更多中、匯出中） | `WithdrawalManagement.test.tsx:618-693`、`MemberManagement.test.tsx:313-328` | 不變（`refreshDisabled`／`disabled` 仍是真停用；匯出期間照舊原生 `disabled`） | 不動 |
| 錯誤字與「重新載入」 | `SystemAlerts.test.tsx:75,77,86,93,96` | 不變（`AdminListError` 的 `message`／`retryLabel` 由頁面傳入，沿用現況文字） | 不動 |
| 工具列直接子元素的列數與間距量測 | `e2e/test_admin_mobile_layout.py:443-474` | 狀態文字與匯出宣告區在 flex 行之外，列數不變 | 不動；階段 8 跑一次 |
| `/admin` 各狀態 375px 溢版 | `e2e/test_overflow_sweep.py`（只量載入完成後的畫面，`:752-757`） | 新增 after_load：提領切回後扣住 GET（更新中狀態行）、讀取失敗保留舊列（失敗提示）、匯出與寫入在途的分頁說明行、告警新工具列（主 #43） | 階段 8 新增 |
| `get_by_role("button", name="標記已處理").first` | `e2e/steps/admin_steps.py` | 首次載入完成後可按 | 不動 |
| `get_by_role("tab", name=…)` | e2e、journey、`AdminDashboard.test.tsx` | 匯出與寫入在途時其他分頁 `disabled`，名稱不變 | 不動 |

**紅燈期改寫清單**（清單外的既有測試一字不改；清單內的在該階段紅燈期改寫，不刪）：

| 階段 | 測試 | 改什麼、為什麼 |
|---|---|---|
| 1a | `usePagedList.test.tsx`「載入更多失敗時保留已顯示的資料」（`:32-45`） | 斷言 `error` → `loadMoreError`（`error` 只管重讀） |
| 3 | `AdminToolbar.test.tsx` 的 `renderToolbar` helper（`:18`）與 `:87`、`:102`、`:112` | `isRefreshing` → `isUpdating`（機械改名；`:18`、`:87` 是顯式屬性，不改紅燈 commit 的 tsc 就過不了，R3-P2-22） |
| 3 | `AdminToolbar.test.tsx`「重新整理中按不下去」（`:66-69`） | 改名為「重新整理中鈕標成停用、焦點不動，點擊交給頁面決定」：`disabled` → `aria-disabled`、焦點不動、點擊**仍呼叫** `onRefresh`（更新途中不重送請求、只改寫「仍在更新」，由 `useRefreshAnnouncer` 決定）；只有 `refreshDisabled`／`disabled` 時不呼叫 |
| 3 | `AdminToolbar.test.tsx`「沒有匯出能力的頁面不放狀態宣告區」（`:96-99`） | 改名為「…不放匯出狀態宣告區」，斷言不變 |
| 4c | `WithdrawalManagement.test.tsx`「狀態更新失敗時把原因說出來」（`:370-380`） | 丟出的錯誤改帶 `status: 409`（4xx 才照原文；結果不明的固定文案另補新測試） |
| 5a | `MemberManagement.test.tsx`「停權失敗時把哪一種失敗印在詳情面板裡」（`:241-251`）、「撤銷管理員失敗時把哪一種失敗印在詳情面板裡」（`:491`）、「動作送出後關掉面板、動作失敗時，錯誤印在列表上方並重讀列表」（`:783`）、helper `failAAfterSwitchingToB`（`:1135`，供 `:1168`、`:1176`） | 丟出的錯誤改帶 `status: 409`——這些測試都斷言後端原文，不帶 status 的錯誤現在歸「結果不明」；結果不明另補新測試 |
| 5a | `MemberManagement.test.tsx`「面板已關時動作失敗，錯誤框不搶焦點也不捲動」（`:1139`） | 錯誤帶 `status: 409`；補回「焦點仍在『查看』」的斷言（S4 收窄的部分，S5 後成立） |
| 5b | `IdReviewQueue.test.tsx`「取資料期間顯示載入態」（`:61`） | `queryByRole('status')` 為 null → 「名稱為『載入審核佇列中』的 status 消失」：回報容器常駐 `role="status"`（裁決 B） |
| 6 | `SystemAlerts.test.tsx`「標記失敗時說出來,不靜默吞掉」（`:154-163`） | 丟出的錯誤改帶 `status: 409`（4xx 維持「標記失敗，請重試」；結果不明另補新測試） |
| 7 | `AdminDashboard.test.tsx` 檔頭 | 補 `vi.mock('../App')`，預設 context 帶 `user.id`（`AdminDashboard` 新讀 `UserContext`，repo 慣例；不帶的話既有六條 `renderDashboard()` 在 `key` 取值時就壞） |

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）＋測試（第 6 條）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1a | `useLatestRequest`（`nextStamp`、`begin` 回 `{ seq, stamp }`）；`usePagedList` 序號（兩個方向、ticket 帶身分與戳、`load` 走 ref、舊閉包 `reload` 讀新身分）、旗標綁 ticket、背景重讀、失敗保留舊列（E2）、`clearOnError`、`loadMoreError`、`isLoadingMore` 與重入 ref 歸零、`hasMore`／`canLoadMore`、`reload` 回傳結算、`settled()` | `src/hooks/useLatestRequest.test.ts`（node，測核心）、`src/hooks/usePagedList.test.tsx` | 連換身分 A→B→C 時 B 的結算不改旗標；換身分後呼叫舊閉包 `reload` 讀的是新身分；重讀在途時載入更多被拒、載入更多在途時重讀作廢它且 `isLoadingMore` 立即為 false、之後可再按；有資料時 `reload` 不回骨架；重讀失敗保留舊列、`clearOnError` 為真時丟列；`reload` 的 promise 在最新重讀結算時以 `done`／`failed` 兌現；載入更多失敗後可重試；`nextStamp` 在兩個核心實例之間仍單調遞增；`changedSince` 只對被標記的對象成立；卸載後不發請求；`reload()` 的 promise 在被取代、換身分、卸載時都會兌現（卸載為 `failed`），`settled()` 沒有在途時立即兌現；改寫清單 1a |
| 1b | `usePagedList` 的 `initial`（換身分時讀一次後凍結）、`onLanded`（帶戳記；被拒補讀一次；補讀又被拒→錯誤態）、`meta`、`isConfirmed`（只看重讀） | `usePagedList.test.tsx` | 有種子的第一個 render 即未確認；換到有種子的身分時該 render 顯示新種子而非舊列；`onLanded` 回 `false` 時補讀一次；連續兩次被拒進錯誤態且可重試；沒有種子的首讀被拒時沒有「不在載入也沒資料」的 render；卸載後被拒不補讀；`onLanded` 收到的 stamp 單調遞增；載入更多成功不呼叫 `onLanded`、不改 `isConfirmed`；載入更多失敗 `isConfirmed` 仍為真 |
| 2 | `createAdminCache`（builder `{ id, slot, resource, params }`、fence 用 hooks 的 `nextStamp`、空結果刪槽、view、`accessLost` 取新號、`open`／`dispose`）＋`useAdminList`（身分與槽、落地驗證、`fetchedAt` 與 60 秒重算、資料版本、`isSlow` 以 ticket 為鍵、403→`accessLost`＋`clearOnError`、匯出用 `loadPage`）＋`writeOutcome`＋PII 守衛 | `src/components/admin/adminCache.test.ts`（jsdom，要 `Storage`）、`useAdminList.test.tsx`、`writeOutcome.test.ts`（node）、`src/utils/repoHygiene.test.ts` | 非空白搜尋 A→B 各自重讀且 `load` 收到對應的 `params`、`null` 槽重新整理讀最新搜尋字；**失效戳與請求戳同源**（真 hook＋真 store）：失效前送出的讀取不寫回、落地被判未確認並補讀；`slot` 為 `null` 的非空白搜尋也受 fence；同戳記邊界（先失效再重讀能寫回）；`accessLost` 後在途舊讀不寫回；空結果刪掉舊條目；帶日期／搜尋回 `null` 槽；403 清空全部與 view（含 `null` 槽讀取）且列表丟掉舊列；表驅動斷言每個事件的失效集合；dispose 後寫入無效、open 後恢復；`fetchedAt` 用牆鐘、`visibilitychange` 與 60 秒重算（假時鐘、只在可見時）；15 秒進 `isSlow`、手動重試後歸零、再 15 秒才重進；分類函式涵蓋 4xx／5xx／無 status／原生錯誤；`setItem` 零呼叫；靜態守衛正反例；`appShell.test.ts` 仍綠 |
| 3 | `AdminToolbar` 新契約（`onRefresh`、`statusText`、`isUpdating`、`refreshDisabled`、`exportDescribedBy`、`filter` 選填）與匯出宣告文字同步（B）；`useRefreshAnnouncer`；兩個呼叫端同步改接，行為不變——過渡期對應：提領頁 `onRefresh={fetchWithdrawals}`、會員頁 `onRefresh={list.reload}`，兩頁都 `isUpdating={false}`、`statusText=""`、`refreshDisabled` 沿用舊 `isRefreshing` 的整個運算式（含首次載入中，不只載入更多；否則會悄悄放開首載期間的重新整理而測試照綠），`useRefreshAnnouncer` 到 4b／5a 才接 | `AdminToolbar.test.tsx`、`src/components/admin/useRefreshAnnouncer.test.tsx` | `isUpdating` 時 `aria-disabled`、焦點不動、點擊仍呼叫 `onRefresh`，`refreshDisabled`／`disabled` 時不呼叫；`useRefreshAnnouncer`（假 list）：手動按下寫「正在更新」、途中再按改「仍在更新」、結算時「已更新 HH:mm」或「更新失敗」，`isUpdating` 先下降（15 秒放行）時不寫「已更新」、結算才寫，自動更新途中按下接在 `settled()` 上而不重送；狀態文字在 flex 行之外；匯出中宣告區念「匯出中，完成前無法切換分頁」；不帶 `filter` 時鈕靠右；`exportDescribedBy` 掛上；改寫清單 3 的四列；提領與會員既有測試一字不改 |
| 4a | 提領頁純遷移到 `usePagedList`（不加快取）：舊防線以等價旗標對應（舊 `isLoading` → `isLoading \|\| isRevalidating`）；清勾選搬到「重讀成功」時 | `WithdrawalManagement.test.tsx`：既有測試一字不改；遷移前先補特徵測試「重新整理成功後已選取歸零」（舊碼上即綠） | 綠到綠（比照 S4「重構綠到綠→行為」）；要保留的耦合：舊 `fetchWithdrawals` 開頭的 `setLoadError(null)`、`runBatch` 的「先重抓、再報告」（`:270-283`，既有 `:370-395` 會抓到） |
| 4b | 提領頁讀取側：`useAdminList` 快取、匯款類閘門（D、K5、T17）與 `AdminListStatus`、統計區骨架與「—」（A）、作業面板與手機展開卡骨架／暫停顯示（G）與 `DataAgeNote`、骨架統一、`AdminListError`、失敗或逾時保留舊列＋`AdminStaleNotice`＋遮罩（E2、K6）、過期樣式、篩選保留（J） | `WithdrawalManagement.test.tsx`、`AdminListSkeleton.test.tsx`、`AdminListError.test.tsx`、`AdminStaleNotice.test.tsx`、`AdminListStatus.test.tsx`、`DataAgeNote.test.tsx` | 帶快取重掛無骨架；首個 render 起標記已匯款、勾選、批次、CSV、查看證件即 `aria-disabled` 且點擊不送出，300ms 內不套停用樣式、之後套並出原因（假時鐘）；**退件、代為完成、查看歷史在未確認時照常可按**；CSV 不以快取 `total` 收集；勾選在重讀成功與換篩選後歸零；統計區未確認時是骨架、失敗時「—」；作業面板未確認時骨架、失敗時「暫停顯示」、複製鈕不渲染；失敗保留舊列、列上匯款欄位「已隱藏」、扣點照常、重試是背景重讀；逾 15 秒同上並放行重新整理；N 不到 1 分鐘寫「剛剛」；資料時間 60 秒重算與 10 分鐘提示；過期樣式的對比 ≥ 4.5:1；篩選經 view 保留；手機 ⋯ 選單只有「查看證件」停用且帶原因；查看歷史在未確認時可開、對話框寫資料時間（K5）；**對話框開著時更新落地，對話框的資料時間不變**（不變成「剛剛更新」）；**自動更新途中按工具列的重新整理：請求數不增、文字「正在更新」，再按「仍在更新」，結算後「已更新 HH:mm」**；錯誤區與陳舊提示的重試同理 |
| 4c | 提領頁動作側：`AdminActionReport`（兩個兄弟節點、warning 變體、`scroll-mt`、焦點）、結果分類與文案、失敗自動重讀（D5）、失效＋fence、批次快照與「閘門一關就關框」、焦點後備、`withdrawalExport.ts`（掛載檢查、進度、完成核對、403 偵測）、`loadMoreError` 顯示、`busy`（`AdminBusy` 型別含讀取側一次定案，預設 `NOOP_BUSY`） | `WithdrawalManagement.test.tsx`、`AdminActionReport.test.tsx`、`withdrawalExport.test.ts` | 成功回報文字只出現一次；以 `MutationObserver`（`attributeOldValue`）記錄 commit 序，證明「回報出現的那次 commit 裡 `aria-busy` 已為 true」（R3-P2-23）；剛按的失敗取得焦點並捲動、晚到的不搶；結果不明改固定文案並前綴姓名、4xx 照原文（改寫清單 4c）；批次網路失敗的固定文案；成功與結果不明失效、4xx 不失效、批次部分失敗失效、全 4xx 不失效；單筆失敗自動重讀一次、卸載後不重讀；批次框用快照、開框期間閘門一關就關框並以 warning 提示；確認後焦點落在該列、該列離開清單時移到下一列、取消或 Esc 回到觸發鈕；換篩選時在途的載入更多不接舊尾；寫入在途時換篩選，畫面不會以新篩選的標籤顯示舊列；匯出：卸在最後一頁在途不下載、筆數不符或重複時不下載並回報、途中 403 清空快取；寫入期間呼叫 busy、寫入請求一結算就釋放（不等重讀）、`release` 重複呼叫無害；匯出期間呼叫 busy；匯出途中任一頁的 `total` 與起始值不同時失敗、不下載 |
| ★ | **中途對照（K8）**：4c 綠燈後先通知主 session 對照 hooks＋快取＋提領頁（金流部分）的 diff，通過才開 5a；最後對照只看 5–9 | — | 主 session 對照通過 |
| 5a | 會員頁 | `MemberManagement.test.tsx` | 帶快取重掛無骨架（空白搜尋）；非空白搜尋不讀不寫快取、連續兩次不同搜尋各自重讀；**搜尋 A 下按暫停、動作在途時改搜 B，完成後列表是 B 的結果且重讀帶 B 的關鍵字**（R3-P2-21）；子分頁經 view 保留；動作後重讀不換骨架、關面板焦點回到「查看」；統計改由 `meta` 帶出、`load` 不再 `setStats`（主 #23）；停權／授予成功與結果不明失效、4xx 不失效；結果不明時重讀列表、面板顯示該人時一併重讀詳情（K3）；`openDetail` 落地時 `changedSince` 成立則丟棄結果、補讀落地才顯示；會員詳情每次「查看」都現讀，回 403 時清空；取詳情失敗的錯誤框有 `scroll-mt`；`loadMoreError` 顯示且列保留；寫入期間呼叫 busy；`busy.locked` 時非 active 的子分頁停用並指向說明行（假 busy，T14）；`cache` 與 `busy` 轉給 `IdReviewQueue`；改寫清單 5a 的兩列；重新整理改由 `useRefreshAnnouncer` 接手、更新途中再按不重送（取代過渡的 `refreshDisabled`，中途對照 P2-22）；寫入走 `runAdminWrite`（裁決 G） |
| 5b | 證件審核 | `IdReviewQueue.test.tsx`（轉接由 `MemberManagement.test.tsx` 驗——5a 就要綠，用 `vi.mock('./IdReviewQueue')` 記錄收到的 props，不靠 5b 才有的行為） | 重掛仍出骨架、慢更新時骨架旁有 `message`；通過／退回不受閘門約束；失敗有錯誤區並重讀一次（E4），結果不明用固定文案；成功回報「已通過／已退回：〈姓名〉」只出現一次；錯誤區與回報只在有內容時渲染；讀取回 403 時清空；以 `memberLabel` 稱呼；退回在左通過在右（手機等寬、桌機靠右）；焦點後備；寫入期間呼叫 busy；**渲染 `loadMoreError`＋測試**（中途對照 P1-1：1a 把載入更多失敗拆到 `loadMoreError`，現況不渲染＝靜默）；寫入走 `runAdminWrite`（`event: null`，裁決 G）；改寫清單 5b（裁決 B） |
| 6 | 公告＋告警 | `SystemNotifications.test.tsx`、`SystemAlerts.test.tsx` | 公告：骨架取代 spinner、讀取失敗顯示 `AdminListError`（次要重試）而非「尚無公告」、帶快取重掛無骨架、刪除不受閘門約束、建立／刪除成功與結果不明失效並重讀（K3）、結果不明的 toast 文案、刪除鈕 44px（主 #43）、逾時提示附次要重試、檔頭 DI 例外；告警：改用 `AdminToolbar`（無 `filter`、鈕靠右）、手動重新整理與標記後背景重讀（保留列表）、失敗有列時 `AdminStaleNotice`、首次載入 `AdminListSkeleton`、標記不受閘門約束、結果不明重讀一次（K3）、讀取回 403 時清空並呼叫 `onAccessLost`、寫入期間呼叫 busy、檔頭 DI 例外；改寫清單 6 |
| 7 | 殼層：`AdminConsole`（`user.id` key、store `open`／`dispose`、四處注入同一個 store＋告警 `onAccessLost`、busy 鎖外層分頁與會員子分頁、說明行與 `aria-describedby`、300ms 外觀、慢寫入提示）、`AdminDashboard` 讀 `UserContext` | `src/components/admin/AdminConsole.test.tsx`、`src/components/AdminDashboard.test.tsx` | 卸載時 dispose、重掛時新 store、四處同一個 store、告警 403 清的是同一個 store；匯出中與寫入在途時其他分頁與會員子分頁停用、說明行文字與 describedby 正確；寫入 0.3 秒內結束時不出說明行（假時鐘）；寫入超過 15 秒時說明行接等候提示；切走再切回不出骨架且照舊打一次 API；登出、`isAdmin→false` 導走後再回來出骨架（整合 `AdminRoute`）；換使用者不顯示前一位的資料；`user` 為 null 不崩；全流程 `setItem` 零呼叫；改寫清單 7；busy 的 `release` 呼叫兩次計數仍正確、busy 物件換新後舊閉包的 `release` 仍正確減計數（計數放 ref，中途對照 P1-3）；子分頁的 `aria-describedby` 寫 `busy.locked ? busy.noteId : undefined`（P2-22）；PII 守衛清單的缺席預期由 `[AdminConsole.tsx]` 改為 `[]`（建立它的紅燈 commit 一併改，P2-17） |
| 8 | e2e＋journey page object＋溢版巡檢 | `e2e/features/admin_dashboard.feature`、`e2e/steps/admin_steps.py`、`e2e/mocks/backend_api_mock.py`、`e2e/pages/admin_dashboard_page.py`、`e2e/test_overflow_sweep.py`、`e2e/journey/tools/test_admin_row_targeting.py` | 三個新情境綠；巡檢新 after_load 綠；`test_admin_mobile_layout.py` 照綠；`cd e2e/journey && pytest tools/ -q` 綠；page object 的 `_wait_list_settled` 等 `aria-busy`、有表格時 retry 不進 `or_` 鏈（中途對照 P2-23）；手機統計骨架實測後釘 `min-h`（P2-20）；e2e／journey 的回報文字比對同步「4xx 前綴姓名」與結果不明的新文案（偏離 #4、裁決 E） |
| 9 | 文件（第 8 條） | — | `check-spec-drift.py`、`check-plans-scaffold.py`、`framework-check.sh` 綠；§2.5「標記已匯款與批次的鈕只在確認後可按」釐清不含確認框內的鈕（中途對照 P2-22）；規格書 §14 加「匯出 keyset／快照」一列（裁決 C）；PR 描述揭露時序例外第 6 類（裁決 D） |

**階段 8 的 e2e 情境**（`e2e/` 是英文 Gherkin；扣住回應比照 `set_upload_photo_deferred`，不用 `sleep`；**只扣
`GET /admin/withdrawals`**——路徑完全相符、query 不限；`/summary`、`/{id}/status` 與所有非 GET 照常回應，主 #36）：

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
  journey 跑得到，這條讓每個 PR 都走一次同一條路徑；扣住前先看到「王小明」，保證首次載入已落地。退件依 D 不受閘門
  約束，扣住列表時照樣可按。
- 手機情境的 viewport 步驟沿用 `common_steps.py:130-136` 的「I am on a 375px-wide phone screen」。

**階段 9 的文件**：
- 規格書 §13（D6）：在後台模組表後新增一段（正面寫法、不寫會變的數字、不寫 UI 到不了的條件，R3-P2-27、主 #29），草稿：
  > **後台資料快取**：提領（依狀態篩選）、會員（未輸入搜尋時）與公告三個列表，切回分頁時先顯示上次讀到的列表，並在
  > 背景重讀。下列資料每次現讀、不從快取顯示：會員詳情、會員搜尋結果、證件審核佇列、系統告警，以及提領的件數與待匯款
  > 總額（讀到前顯示骨架）；導覽列的待處理數是載入當下的快照。快取只存在記憶體，離開 `/admin`、登出、換帳號或任何後台
  > 讀取回 403 即清空，從不寫入 `sessionStorage`／`localStorage`（提領資料含未遮罩的身分證字號與收款帳號，見 §10.4）。
  > 提領列表的最新一次讀取確認前，匯款類操作暫停：標記已匯款、批次標記已匯款、CSV 匯出與查看證件停用，匯款作業面板
  > 不顯示；退件、代為結案、證件審核、公告與告警的操作不受影響（後端狀態機擋不合法的轉換）。讀取失敗或等候過久時保留
  > 舊列並標示資料時間（讀取回 403 時不保留），收款銀行、帳號與匯款金額改為遮蔽。任何後台寫入送出到回應之間不能切換分頁。快取保證的是「不讓
  > 匯款依據比沒有快取時更舊」——同一頁停留過久的資料仍會過期，介面以資料時間提示，停留過久時建議先重新整理（門檻見
  > `src/components/admin/useAdminList.ts` 的具名常數）。
- 規格書 §14（E7，修好時刪列；依第 8 列的寫法標章節、寫完整路徑 `supabase/functions/api/index.ts`、以端點與函式名稱描述，
  不用行號，R3-P2-27(c)）：新增三列——
  1. 提領狀態更新與批次（§10、§13）：`admin_update_withdrawal_status` 對「已是該狀態」回成功並帶 `idempotent`，但
     `/admin/withdrawals/:id/status` 與批次端點不透傳，前端無法分辨重複標記已匯款。
  2. 提領管理讀取失敗被讀成 200（§13）：`/admin/withdrawals` 忽略統計查詢的錯誤（件數與待匯款總額回 0），附屬查詢（姓名、
     證件簽名網址、事件歷史）也不檢查錯誤（回空姓名、「未設定」身分證、空歷史、證件顯示未上傳）。
  3. 公告與證件審核讀取失敗被讀成 200（§13）：`/admin/announcements` 不檢查查詢錯誤（回空清單）；`/admin/id-reviews` 的
     證件簽名網址不檢查錯誤（證件顯示未上傳，審核者可能因此誤退件）。
- `ui-ux-guidelines.md`（R3-P2-28、主 #29）：
  - §5：「已套用」補「後台列表」，**同時拿掉**同一行「可延伸：…後台列表」的後台部分；補一句**機制**（業務規則留 §13，不重複）：
    後台列表背景重讀時 `aria-busy`＋延遲約 300ms 才降透明度，失敗與逾時改用固定的過期樣式。
  - §9（a11y）補四條本工項新立、S7 會直接重踩的互動慣例：被按下後要停用的鈕用 `aria-disabled` 而非原生 `disabled`（焦點
    不掉到 body）；焦點元素消失時的後備落點（§4.3 的表收成一句判準）；回報區「可見字即播報字」的單一節點 live region；
    sticky 導覽列下的程式化聚焦目標帶 `scroll-mt-20`。
  - §3 後台段的〔實作〕指標（`ui-ux-guidelines.md:62-63`）與 §9 的 `AdminTabLabel`（`:168`，實為 `AdminTab`）改指
    `src/components/admin/AdminConsole.tsx` 的 `AdminTab`（Tabs 搬過去了）。
- 程式碼檔頭：§3.6 各處；`AdminDashboard.tsx` 的 DI 註解補「快取 store 由 `AdminConsole` 建立、以 props 注入」；
  `admin_dashboard_page.py` 檔頭 docstring 同步。
- 母計畫：
  - construction-plan §1：S7 開工條件改成「S5、S6 皆合併」（D8）；§2 的 S5 重量由「中」調成「重」，註明兩到三次對話、單一 PR、
    4c 後中途對照（K8；狀態在本目錄 `progress.md`）；§4.3 驗收 3 換成下方清單；驗收 2 的清單加一項：「（S5 追加）證件審核卡
    『退回』在左、『通過』在右，手機兩顆等寬；通過沒有確認框——留意誤觸」（C）；§6.2 達標驗證表（`construction-plan.md:643`）
    的「抽查一筆提領資料確認顯示值未過期」改成與驗收 3 一致的證偽做法。
  - progress：S5 列；S7 列改寫成「等 S5、S6 都合併後開工」並註記「公告錯誤態已由 S5 處理」「`usePagedList` 的 `reload` 已改
    背景重讀」；**計畫異動記錄**加一行（construction-plan §4.4 `:587-589` 的要求，R3-P2-29）：D8 的 S7 開工條件、S5 重量、單一 PR
    不拆（K8）、驗收 3 清單改寫、驗收 2 追加證件審核鈕一項（C）、§6.2 的證偽做法改寫；遺留結案（「S3 審查遺留 → S5」整條、「S4 遺留」中的序號收斂、焦點掉 body、`IdReviewQueue`
    姓名三條、S2e 的證件審核鈕順序）；新增遺留——三個後端缺口（同規格書 §14 那三列）、導覽列 badge 寫入後不更新與「待審佇列數
    即時」未承接（主 #38）、告警與公告 100 筆上限未揭露總數（R3-P1-3；退場條件同 §1.3）、`SystemNotifications`／`SystemAlerts` 改 props 注入、
    兩套快取收斂條件、`SLOW_UPDATE_MS` 的退場條件、匯出提升到殼層（B 另案）。
- PR 描述（`/tdd-implement` 收尾時）：逐條揭露 §1.3 的五類時序例外與子分頁還原時的兩支同時讀取（A–J E）；證件審核鈕對調的誤觸風險（C）；單一 PR 與
  4c 中途對照的紀錄（K8）。
- 收尾 `git rm -r docs/plans/admin-data-cache`，跑 `check-plans-scaffold.py`。

**驗收 3 清單草稿**（寫進 construction-plan §4.3）：

前置：admin 帳號；develop 上至少一筆待處理、一筆待查收提領、幾位會員、**至少一則公告**（提領總數 > 50 筆才驗得到匯出進度，
不足就跳過那一項）；第二個瀏覽器（或無痕視窗）登入同一個 admin，用來製造無害的變更；手機項目用桌機 devtools 的裝置模擬
（375px）——LINE 內建瀏覽器沒有 devtools，只用一般網速驗一次切回手感；標「Slow 3G」的項目先在 devtools 設好節流再操作，
標「載入前節流」的項目設好後從別頁進 `/admin`；確認框只看、按「取消」（develop 是共用的真後端；斷網時按確認不會送出任何資料）
——唯一例外是選驗的報讀器項要真的退件一筆，先備一筆可犧牲的待處理測試提領。

- 手機（375px）：
  - [ ] （載入前節流）首次進 `/admin`：統計摘要與卡片列表是骨架，沒有先閃 $0／0 筆
  - [ ] 提領篩「待處理」→ 會員 → 提領：回到「待處理」，卡片立即出現、沒有骨架；統計摘要是骨架，更新完才出數字
  - [ ] （Slow 3G）切回提領：約 0.3 秒後卡片變淡、狀態行寫「更新中，暫停匯款相關操作」；**退件與代為完成照樣可按**；⋯ 選單裡
        只有「查看證件」是灰的；更新完自動恢復，展開一張卡寫「資料更新於…」
  - [ ] 會員 → 證件審核 → 提領 → 會員：回到「證件審核」，證件審核照舊出骨架；切到「會員列表」立即出現
  - [ ] （Offline）切回提領：卡片保留（過期樣式）、上方寫「更新失敗，以下是 N 分鐘前的資料」與原因、卡片上的匯款金額是
        「已隱藏」、展開卡寫「資料未確認，暫停顯示」、扣點照常；恢復網路按重試，卡片不消失、更新完恢復
  - [ ] （Offline，本次登入還沒開過公告分頁）切到公告：顯示錯誤與重試，不是「尚無公告」
  - [ ] 告警分頁：工具列的重新整理鈕靠右、好點（≥44px），按下後列表不換骨架
  - [ ] （Offline）展開一筆待處理、按「退件」填理由後按確認：失敗回報完整出現在導覽列下方、焦點在上面
  - [ ] （提領 > 50 筆、Slow 3G）按 CSV：其他三個分頁按不到，分頁列下方寫「匯出中（已收集 N / M 筆）…離開此頁會中止」（窄螢幕折行
        可接受）；完成後恢復
- 桌機：
  - [ ] （載入前節流）首次進 `/admin`：統計四卡、匯款作業面板、表格都是骨架
  - [ ] （Slow 3G）切回提領：表格約 0.3 秒後變淡；標記已匯款、勾選、CSV、查看證件按不下去並看得到原因；退件、代為完成、
        查看歷史照常可按；統計四卡與匯款作業面板是骨架
  - [ ] （Slow 3G）切回提領、更新完成前打開一筆的「查看歷史」：可以開，對話框寫「資料更新於…」
  - [ ] （Slow 3G）證偽「顯示值未過期」：在公告分頁載完後切到會員；第二個瀏覽器發布一則測試公告；切回公告時先看到舊列表
        （變淡），更新完那則公告才出現；最後用第二個瀏覽器刪掉它
  - [ ] （Slow 3G）發布一則測試公告：送出到回應之間其他分頁按不動，超過約 0.3 秒時分頁列下方寫「處理中，完成前無法切換
        分頁」；完成後刪掉它
  - [ ] 作業面板寫「資料更新於 N 分鐘前」，停在頁面上會自己更新；超過 10 分鐘改成提示先重新整理；開「標記已匯款」確認框
        也看得到同一句（按取消）
  - [ ] （Slow 3G）按重新整理：鍵盤焦點留在鈕上（再按 Tab 不從頁首開始），列表不換骨架，工具列下方寫「正在更新」→
        「已更新 HH:mm」
  - [ ] （提領 > 50 筆、Slow 3G）按 CSV：其他三個分頁按不到、說明行顯示；完成後恢復，「已匯出 N 筆」在工具列下方、工具列沒有被往下推
  - [ ] （Slow 3G）登出再登入、進 `/admin`：重新出骨架；devtools → Application → Session Storage／Local Storage 沒有任何
        **他人**的姓名、身分證字號、收款帳號或 Email（自己的登入資料 `user`、`sb-*` 是既有的，不算）
  - [ ] （選驗，需報讀器）手動重新整理念「正在更新」「已更新」；退件後念得出「已退件：王小明」（焦點移到下一列的播報沒有
        把它吃掉）。沒有報讀器時用 devtools Elements 看狀態文字的變化

以 vitest／e2e 為準、不列人工項：寫入後的失效與 fence、被拒補讀的上限、請求序號與舊閉包、重開在途補讀、卸載後停止匯出、
匯出完成核對、403 清空、15 秒慢更新、批次框快照、寫入在途鎖分頁的時序。

## 6. 開放問題

無未決。三輪審查的待裁決題已由業主裁決 D1–D8、E1–E8、K1–K8 與 A–J 處理，紀錄在 `review.md` 處置節。第四版的解讀——A 取代
D2 的件數部分、D 的 15 秒逾時依 E2、F 在寫入卡住時維持鎖定——與技術裁決 T13–T17，業主已於 2026-10-07 在 session 內確認；
F 的範圍取廣義（§2.11）與主 #1 的不同做法（§10.3），交主 session 對照時一併過目。

## 7. 風險與回滾（第 9 條）

- **PII 在記憶體**：曝險面與現況相同——同一個 JS heap、DevTools／React DevTools 讀得到的是同一批欄位。差在兩點：存活時間由
  「分頁掛著時」延長為「待在 `/admin` 期間」，上限由離開 `/admin`、登出、換帳號、403 界定（§2.4；403 時畫面上的舊列也一併
  丟掉，K2）；資料量最多提領 5 槽×50 列、會員 50 列與公告。不新增儲存媒介：不落 storage、非 active 分頁不常駐 DOM（§3.2）；
  會員搜尋結果不快取；空結果會刪掉舊條目。證件照簽名網址（1 小時）隨提領列在記憶體——現況分頁掛著時也在，且每次切回都換新。
- **過期資料成為寫入依據——反例（為什麼提領狀態與作業面板不能從快取直接當真）**：管理員 A 在提領頁看到王小明 1,000 P
  「待處理」，切到會員頁接客服電話 15 分鐘；這段期間管理員 B 已在網銀匯款，並把這筆標記已匯款。A 切回提領頁，若快取直接
  當真、按鈕可按：作業面板仍把王小明排在第一筆、狀態仍是待處理，A 照面板帳號在網銀再匯一次，回來按「標記已匯款」——後端
  `admin_update_withdrawal_status` 對「已是待查收 → 待查收」回 `success: true, idempotent: true`
  （`20260802000004_withdrawal_events.sql:108-109`；批次逐筆呼叫同一函式，也算成功），畫面照樣顯示「已標記匯款完成：
  王小明」。**重複匯款在系統裡沒有任何錯誤訊號。** 後端狀態機擋得住不合法的轉換，擋不住合法但重複的轉換，所以快取造成的
  過期只能由前端擋：匯款類閘門、作業面板與統計確認前不顯示、失敗或逾時時列上匯款欄位遮蔽（§2.6）、落地前已被失效就補讀
  （E3）。反過來，退件與代為完成依 D 不閘：退件一筆其實已匯款的申請，後端回 `invalid_transition`、畫面照實顯示錯誤；代為
  完成一筆其實已完成的申請，後端回 idempotent 成功、不動錢。同理，會員詳情若從快取顯示「未停權」而實際已被別人停權，A 按
  「暫停」會改寫真正的停權時間（停權端點每次覆寫 `suspended_at`，S4 遺留）——所以詳情不快取。
- **殘餘風險：同一頁停太久、同帳號雙分頁**：與現況相同，快取不讓它更糟；以資料時間提示緩解（D1、E5）。根治需要後端：狀態
  更新與批次把 RPC 的 `idempotent` 吃掉了，應透傳或比對 `expectedStatus`——登記規格書 §14 與後端 `/fix-bug` 遺留（E7；金流，
  建議獨立 session）。
- **殘餘風險：寫入在途時離開 `/admin` 再回來**（K4）：新掛載的讀取可能早於寫入提交，那一列顯示寫入前的狀態、按鈕可按；與
  現況相同，不加通知機制——F 已讓分頁內的切換到不了這個窗口。
- **殘餘風險：寫入卡住**：`apiClient` 沒有逾時，寫入卡住時分頁維持鎖定到結算（F）；15 秒後說明行提示「離開此頁不會取消已送出
  的操作」，出口是離開此頁——與匯出卡住（E6）同一個取捨。
- **殘餘風險：既有端點把失敗讀成 200**：`/admin/withdrawals` 的統計與附屬查詢、`/admin/announcements`、`/admin/id-reviews` 的
  簽名網址不檢查錯誤（§5 階段 9 的 §14 三列，R3-P2-9）。確認閘門會把這種讀取當成已確認，快取也會存下；公告的假空清單因「空
  結果不快取」不會被存起來，提領的 0 與空欄位會。登記規格書 §14 與遺留（E7）。
- **殘餘風險：導覽列 badge**：載入當下的快照，寫入後不更新（既有）；母計畫「待審佇列數即時」沒有工項承接（主 #38）——本 PR 不動
  `Navbar`，登記遺留。
- **殘餘風險：偶發 403**：後端 `isAdminUser` 吞掉資料庫錯誤時，真管理員也可能收到 403（`index.ts:252-255`）；本工項會因此清空
  快取與畫面上的列（安全方向，最壞是多看一次錯誤畫面、按重試），畫面照後端訊息顯示。
- **背景更新卡住**（`apiClient` 沒有逾時，S4 遺留）：匯款類操作維持暫停、作業面板與統計維持骨架；15 秒後保留的舊列連列上匯款
  欄位也遮蔽、作業面板改「暫停顯示」、統計改「—」、重新整理恢復可按（§2.3）。會員「查看」的無限轉圈不在其內。根治是全站逾時（既有遺留）。
- **共用 hook 改動**：`usePagedList` 的 `reload` 改成背景重讀、失敗保留舊列，`MemberManagement`、`IdReviewQueue` 的重讀呈現
  隨之改變——受影響的既有斷言已列在 §4.5 改寫清單；S7 改成等 S5 合併後才開工（D8）並在開工前 rebase。
- **journey 晚發現**：page object 的改動只有晉升 PR 的 journey 跑得到 → 階段 8 的退件情境讓每個 PR 走同一條路徑，journey-offline
  另有字串與結構檢查。
- **重量**：範圍比開工 prompt 預估大很多（十三個階段），需要兩到三次對話；狀態全在本目錄 `progress.md`。單一 PR，4c 綠燈後
  先請主 session 中途對照金流部分，最後對照只看 5–9（K8）。
- **回滾**：純前端、無資料遷移——revert PR 即回到「每次切回重抓＋骨架」。

## 8. 第一輪審查回填對照（第二版）

業主裁決（2026-10-06，session 內互動選項，全選推薦）：

| 代號 | 題目 | 裁決 | 落點 |
|---|---|---|---|
| D1 | 寫入依據的新鮮度保證 | 收窄說法＋顯示資料時間，後端根治列遺留 | §0、§2.6、§7 |
| D2 | 統計區（原 Q1） | 件數隨列表快取、待匯款總額確認前骨架；badge 改稱快照（**件數部分第四版改依 A**，§10） | §2.5 |
| D3 | 切回位置 | 保留狀態篩選與會員子分頁，搜尋字不保留 | §2.8 |
| D4 | 匯出中切分頁（原 Q2） | 停用其他分頁＋進度說明 | §2.10、§2.11 |
| D5 | 單筆失敗後自動重讀 | 採用 | §2.7 |
| D6 | 規格書 §13 新段 | 新增，草稿附在階段 9 | §5 |
| D7 | 證件審核鈕順序（原 Q3） | 順手做，手機等寬 | §4.4 |
| D8 | S7 開工條件 | 等 S5、S6 都合併 | §3.4、§5 階段 9 |

規劃者技術裁決（業主可推翻）：T1「查看證件／歷史」納入閘門（**第四版依 K5 只留查看證件**）；T2 空結果不快取（第三版補
「並刪除舊條目」）；T3 殼層卸載顯式 `dispose`＋登出整合測試（第三版改成 `open`／`dispose` 成對）；T4 背景更新 15 秒慢提示
（第三版依 E2 改成保留舊列）；T5 hook 分層（§3.3，第三版依 E8 收窄，第四版 T12）；T6 階段 4 拆分（第三版再拆成 4a／4b／4c、
1a／1b，第四版再拆 5a／5b）；T7 讀取回 403 時整體清空（第三版明定範圍與語意，第四版依 K2 連畫面上的列一起丟）；T8 列表讀取
錯誤區共用（第三版改成依 §12.11 條件決定重試鈕）。

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
| E4 | 證件審核失敗後自動重讀 | 採用（時序例外） | §1.3、§2.7、§4.4 |
| E5 | 資料時間提示門檻 | 10 分鐘，具名常數 | §2.6 |
| E6 | 匯出卡住 | 進度字加「離開此頁會中止」，不加取消 | §2.10、§2.11 |
| E7 | 三個金流類後端缺口 | 同時登規格書 §14 與母 progress 遺留 | §5 階段 9、§7 |
| E8 | 資料時間、資料版本、慢更新放哪一層 | 移到 `useAdminList`，`SLOW_UPDATE_MS` 登記退場條件 | §2.2、§2.3、§3.3 |

規劃者技術裁決（第三版新增，業主可推翻）：T9 抽出 `AdminConsole`（以 `user.id` 為 key 的分頁區）讓 store 的測試留在
`admin/` 內；T10 讀取失敗的錯誤字維持原文，「結果不明」固定文案只用在寫入；T11 `AdminListError` 的 `message`／`retryLabel`
由頁面傳入（保住告警測試與 journey 離線檢查的字串）。

第二輪發現 R2-P1-1～R2-P1-8、R2-P2-1～R2-P2-27 的落點見第三版（`e48d2be`）的 §9；第三輪四個視角逐條確認，沒有任何一條
「未解決」，部分解決的殘餘已併入第三輪（`review.md`「第三輪」節）。

## 10. 第三輪審查回填對照（第四版）

### 10.1 第三輪裁決（PR #371 留言 6027245062，記為 K1–K8）

| 代號 | 題目 | 裁決 | 落點 |
|---|---|---|---|
| K1 | 第四版之後怎麼審 | 四位審查員只複核 4 條 P1 與裁決落實；推上後通知主 session 對照 A–J、D／F／H 與 K 題，通過才開工 | `review.md` 處置 |
| K2 | 讀取回 403 時畫面上的舊列 | 清掉，改顯示錯誤（與 `accessLost` 一致） | §2.2 `clearOnError`、§2.3、§2.12 |
| K3 | 結果不明時是否重讀 | 會員（含開著的詳情面板）、公告、告警一律重讀一次；4xx 不重讀 | §1.3、§2.7、§2.12 |
| K4 | E3 的另一半 | 列為殘餘風險，不加通知機制 | §7 |
| K5 | 查看歷史 | 可開並標資料時間；只停用查看證件；手機 ⋯ 只灰「查看證件」 | §2.6、§4.3 |
| K6 | 扣點 | 不遮 | §2.5、§2.6 |
| K7 | 匯出筆數核對 | 納入 S5 | §2.10、階段 4c |
| K8 | PR 拆分 | 單一 PR；4c 綠燈後中途對照；母 progress 記「不拆」 | §5、§7、階段 9 |

T12（補讀的狀態機留在通用 `usePagedList`）業主確認不推翻（§3.3）。

### 10.2 業主裁決 A–J（留言 6024121702）的落點

| 代號 | 裁決 | 落點 | 註 |
|---|---|---|---|
| A | 統計區切回出骨架、列表照快取；錯誤態「—」 | §1.2-2／4、§2.5、§4.1、階段 4b、驗收清單 | **與第一輪 D2「件數隨列表快取」衝突，第四版照 A**（較新；依據 P4「待審佇列數即時」）——業主 2026-10-07 確認 |
| B | 匯出鎖分頁＋可見說明；離開即停止並提示；最後一頁後、建 Blob 前檢查；殼層案另案 | §2.10、§2.11、§1.3、階段 3、4c、7 | 說明行改在分頁列下方（T13）；匯出宣告區文字同步為「匯出中，完成前無法切換分頁」（第四版之一補上） |
| C | 證件審核鈕對調、手機等寬；PR 描述註明誤觸；驗收 2 加一項 | §4.4、階段 5b、9 | |
| D | 只閘匯款類＋CSV；300ms 外觀與說明；鎖住時的出口 | §2.6、§2.5、§4.2、階段 4b | 原文的「15 秒逾時進錯誤態、丟棄晚到」已由 T4→E2 改成「保留舊列＋放行重新整理、晚到仍接受」（K 留言：失敗與逾時以 E2 為準）；查看證件依 K5 也在閘門內 |
| E | 單筆失敗自動重讀；PR 摘要揭露時序例外 | §1.3、§2.7、階段 9 | 例外現為五類（加上 E4、K3、重開補讀、E3） |
| F | 寫入在途鎖分頁，與匯出共用機制 | §2.11、階段 4c、5a、7 | 範圍取廣義（§2.7 表上的全部後台寫入，原文是「列表寫入 POST」）；會員子分頁一併鎖（T14）；寫入卡住時維持鎖定（業主 2026-10-07 確認）；E3 保留為第二道防線 |
| G | 作業面板與複製鈕的骨架條件＝未確認 | §2.5、§2.6 | 失敗態改「暫停顯示」（R3-P2-11） |
| H | 公告／告警不搬取數；告警不走共用 hook | §2.12、§3.1、§3.3、階段 6 | 告警的呈現仍用共用元件（T15）；403 經 `onAccessLost`（T16） |
| I | （已由 E2 取代） | §2.2、§4.3 | 「清掉舊資料」改保留；共用錯誤區塊照做 |
| J | 保留狀態篩選，其餘不保 | §2.8、§1.3 | 會員子分頁依 D3 保留 |

### 10.3 主 session 規劃審查（主 #1–#45）的落點

| 主 # | 落點 | 主 # | 落點 | 主 # | 落點 |
|---|---|---|---|---|---|
| 1 | §2.1、§2.3（做法與建議不同：hook 完全不知道 store、只有通用擴充點；戳記在 hooks 層——請主 session 確認） | 16 | §4.2（`onRefresh` 結算） | 31 | §4.4、階段 5b |
| 2 | §2.6 勾選、階段 4a 特徵測試 | 17 | 驗收清單 | 32 | §2.7、K3 |
| 3 | §2.2 `canLoadMore`、ticket | 18 | §0、§2.6 保證的範圍、§7 | 33 | §1.3、遺留 |
| 4 | §2.2（I→E2）、`loadMoreError` | 19 | B | 34 | §2.4 |
| 5 | §2.2 身分與同 render 換種子 | 20 | E | 35 | §2.9 |
| 6 | §2.3 fence | 21 | 階段 5a、7 | 36 | 階段 8 |
| 7 | F（§2.11） | 22 | §2.2 標題 | 37 | K5 |
| 8 | §2.6、§2.10 | 23 | §2.9 簽名、階段 5a（`meta`）、§2.3 | 38 | §2.5、遺留 |
| 9 | G | 24 | H | 39 | §2.10 |
| 10 | D | 25 | §2.7、階段 2 表驅動測試 | 40 | J |
| 11 | E2／`isSlow`（§2.3、§4.3） | 26 | §2.4、改寫清單 7 | 41 | §4.3（I→E2） |
| 12 | D 的 300ms（§2.6、§4.2） | 27 | 階段 4a／4b／4c；「先重抓再報告」在 4c 改成回報與重讀同一個 commit | 42 | §4.1 |
| 13 | §2.3 空結果、§2.2 沒資料時骨架 | 28 | §4.2 | 43 | §4.2 `filter`、階段 6（44px）、階段 8（巡檢） |
| 14 | A | 29 | 階段 9（§14 因 E7 有新列，「§14 無需同步」不再成立） | 44 | C |
| 15 | §4.3 | 30 | §3.4、§3.5 | 45 | §1.2 |

### 10.4 第四版的技術裁決（業主可推翻）

- **T13** 鎖分頁的說明行放在分頁列正下方（不是 B 原訂的工具列下方）：F 讓沒有工具列的公告與證件審核也會鎖分頁。
- **T14** 寫入在途時連會員區子分頁一起鎖：證件審核在子分頁裡，不鎖的話 K4 的前提不成立。
- **T15** 告警的骨架、錯誤區、陳舊提示用共用元件，資料層維持元件內：H 限制的是資料層。
- **T16** 告警讀取回 403 時經 `onAccessLost` 清空 store：告警不經 `useAdminList`，K2 仍要成立。
- **T17** 匯款類閘門用 `aria-disabled`＋處理函式擋、300ms 後才套停用樣式；匯出期間照舊原生 `disabled`（既有行為與測試）。

業主 2026-10-07 在 session 內確認 T13–T17 全部照第四版。

### 10.5 第三輪發現的落點

| 發現 | 落點 |
|---|---|
| R3-P1-1 被拒補讀的上限與終態 | §2.2、階段 1a、1b |
| R3-P1-2 整數戳計數器歸屬 | §2.1、§2.3、§2.9、§3.3、階段 1a、2 |
| R3-P1-3 公告／告警「共 N」 | §2.6（D 之後兩頁沒有狀態行）、§1.3 與遺留（既有的 100 筆上限） |
| R3-P1-4 工具列「已更新」的宣告 | §2.2 `reload` 回傳結算、§4.2、階段 3 |
| R3-P2-1 各寫入站點的結果不明 | §2.7 站點表、§2.9、K3 |
| R3-P2-2 store 沒有通知通道 | (a) K4 殘餘風險；(b) §2.6 閘門一關就關框；(c) §2.2 `initial` 凍結 |
| R3-P2-3 403 與 E2 | K2 |
| R3-P2-4 補讀策略放哪層（T5） | T12 |
| R3-P2-5 查詢參數兩個來源 | §2.3 `params` |
| R3-P2-6 `isSlow` 的計時鍵 | §2.3 |
| R3-P2-7 匯出核對與 403 | K7、§2.10 |
| R3-P2-8 PII 守衛 | §3.5 |
| R3-P2-9 讀成 200 的清單 | §7、階段 9 的 §14 三列 |
| R3-P2-10 查看歷史 | K5 |
| R3-P2-11 遮蔽的呈現與扣點 | §2.5、§2.6、§4.3、K6 |
| R3-P2-12 過期樣式 | §4.2 |
| R3-P2-13 `AdminStaleNotice` | §4.3 |
| R3-P2-14 資料時間的重算與位置 | §2.3、§2.6 |
| R3-P2-15 停用原因的覆蓋 | §2.6（(b) 在 D 之後不適用：證件審核不閘） |
| R3-P2-16 焦點後備 | §4.3 表 |
| R3-P2-17 `AdminActionReport` | §4.3 |
| R3-P2-18 骨架的 `message` 與重新整理入口 | §4.1、§4.3 |
| R3-P2-19 狀態行元件 | §2.6、§3.4 `AdminListStatus` |
| R3-P2-20 驗收情境 | §1.2（E3 的 UI 路徑在 F 之後不可達，改以測試驗證） |
| R3-P2-21 會員頁換搜尋的整合測試 | 階段 5a |
| R3-P2-22 改寫清單漏列與 `user.id` | §4.5 改寫清單 3、7，§2.4 |
| R3-P2-23 `aria-busy` 的 commit 驗證 | 階段 4c（`MutationObserver`） |
| R3-P2-24 階段 5 過大 | 5a／5b |
| R3-P2-25 `_wait_list_settled` strict mode | §4.5 |
| R3-P2-26 驗收清單的節流與報讀器 | 驗收清單 |
| R3-P2-27 規格書草稿與 §14 寫法 | 階段 9 |
| R3-P2-28 ui-ux 補寫 | 階段 9 |
| R3-P2-29 計畫異動記錄與對話次數 | 階段 9、§7 |
| R3-P2-30 單一 PR | K8 |

### 10.6 第三輪複核的回填（第四版之一）

複核結果見 `review.md`「第三輪複核」：4 條 P1 四個視角一致判定解決；另指出 3 條 P1，全數補上：

| 發現 | 落點 |
|---|---|
| 複核 P1-1 B 的「匯出宣告區文字同步」沒落實（UI/UX、需求） | §2.10、§4.5、階段 3 |
| 複核 P1-2 K5 的「查看歷史標示資料時間」只落實一半（UI/UX、需求） | §1.2-11、§2.6、階段 4b、驗收清單 |
| 複核 P1-3 T14 沒有資料通路（架構） | §2.11（`AdminBusy` 加 `locked`／`noteId`、外層與內層 Tabs 受控、轉給 `IdReviewQueue`）、階段 4c、5a、5b |

順手收掉的 P2：`reload()` 一定兌現與 `settled()`（系統、UI/UX）；重試走同一條宣告（`useRefreshAnnouncer`，架構）；K2 的範圍
寫明、載入更多也適用 `clearOnError`（系統）；匯出每頁 `total` 比對（系統）；`release` 冪等且只包寫入請求（系統）；具名常數
的位置、規格書草稿的 403 例外、計畫異動記錄的兩項、PR 揭露子分頁同時讀取、100 筆上限的退場條件、K8 的「最後對照只看 5–9」、
驗收清單的用語、節流與三項補充（需求、UI/UX）；F 的範圍與主 #1 的不同做法標出，交主 session 對照（需求、架構）。

第四版之一再經 UI/UX 複核（`review.md`「第三輪複核」末段）：複核 P1-1、P1-3 解決，P1-2 部分解決；另補 2 條 P1（第四版之二）：

| 發現 | 落點 |
|---|---|
| 複核二 P1-A 對話框的資料時間沒指定綁開框當下還是列表即時——綁即時會在更新落地後翻成「剛剛更新」 | §2.6「對話框的資料時間在開框時凍結」、階段 4b |
| 複核二 P1-B 改寫清單要工具列在更新途中吞掉點擊，與「仍在更新」、`settled()` 矛盾 | §4.2、§4.5 改寫清單 3、階段 3、4b（整合斷言） |

順手收掉的 P2：手動重新整理或重試觸發的失敗，陳舊提示不帶 role（狀態文字已播過「更新失敗」）。

### 10.7 中途對照（K8）的回填（4c 回填，紅燈 `79bd971`、綠燈 `c2b47fa`、守衛 `3c133d5`）

主 session 中途對照（PR #371 留言 6033343045，P0 0／P1 6／P2 17）與業主裁決（留言 6033724251）的落點：

| 項目 | 裁決或處置 | 落點 |
|---|---|---|
| P1-1 5b 漏 `loadMoreError` | 照報告 | 階段 5b 驗證標準 |
| P1-2／B `AdminActionReport` 常駐 vs 證件審核測試 | 改測試、保留常駐 | §4.5 定位器表與改寫清單 5b |
| P1-3 `runBatch` 釋放兩次 | 由 G 解 | `adminWrite.ts`；階段 7 補 busy 計數測試 |
| P1-4 載入更多無停用外觀與原因 | 照報告（不動 ui/） | 提領頁載入更多鈕 |
| P1-5 缺統計桌機永遠骨架 | 照報告 | 提領頁統計區、偏離說明 |
| P1-6／A 重試期間遮罩解除 | 遮到本次讀取確認為止 | 提領頁 `masked`、`AdminStaleNotice` 的 `updating`、`AdminListError` 的 `retrying` |
| P2-7／C 匯出補償式變動 | 接受、寫明殘餘風險 | §2.10、`withdrawalExport.ts` 檔頭、階段 9（§14） |
| P2-8／D 載入更多總數漂移 | 納入 S5 | `usePagedList` 載入更多、§1.3 時序例外 6 |
| P2-9／E 結果不明文案 | 加「若款項已匯出請勿重匯」 | `writeOutcome.ts`：標記已匯款與批次；退件與代為完成沒有轉帳，維持原文案 |
| P2-10／F 每次重讀都骨架 | 接受現狀 | — |
| P2-11／G 抽共用 | 只抽 `runAdminWrite` | `adminWrite.ts`；焦點後備與 `WithdrawalTable` 知情不抽（PR 描述明寫） |
| P2-12 閘門形狀三種 | 照報告 | `remittanceGate.ts`（工具列改收 `exportGate`、⋯ 選單收 `gate`） |
| P2-13 `fetchedAt` 是落地時間 | 檔頭註明 | `useAdminList.ts` 檔頭 |
| P2-14 `processingId` 單值、批次無處理中 | 照報告 | 提領頁 `processing`（Set）、批次在途比照未確認 |
| P2-15 匯出回報蓋掉寫入失敗 | 回報合併不互蓋 | 提領頁 `reportStatus`／`reportFailure` |
| P2-16 Storage 監看只在 store 層 | 照報告 | `useAdminList.test.tsx`（另加提領頁層一條） |
| P2-17 AST 守衛三洞 | 照報告 | `repoHygiene.test.ts`；階段 7 改缺席預期 |
| P2-18 勾選清空的一格空窗 | 照報告 | `useBatchSelection.ts` |
| P2-19 狀態文字殘留 | 照報告 | `useRefreshAnnouncer.reset()` |
| P2-20 ⋯ 選單、對話框焦點、統計骨架高度 | 前兩項照報告；高度階段 8 | `CardOverflowMenu`、`WithdrawalCardList`；階段 8 |
| P2-21 stale 透明度 | 檔頭說明 | `globals.css` |
| P2-22 文案、K2 頁面層、匯出後備、5a、7、9 | 照報告 | 提領頁、`withdrawalExport.ts`；階段 5a、7、9 |
| P2-23 e2e page object | 階段 8 | 階段 8 驗證標準 |

