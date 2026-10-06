# admin 資料快取（S5／A4）實作進度

<!-- plans-keep: S5 施工中的跨 session 鷹架（規劃→人審→TDD 可能分在不同 session）；退場條件＝/tdd-implement 收尾時 git rm -r docs/plans/admin-data-cache -->

<!-- 外部記憶：每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看。 -->

分支：`feature/admin-data-cache`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
母計畫：`docs/plans/platform-uiux-redesign/`（S5 列；收尾時同步 progress 與 construction-plan §4.3 驗收 3）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1a | `createLatestRequest`／`useLatestRequest`；`usePagedList` 序號（兩個方向、ticket 帶身分、`load` 走 ref）、旗標綁 ticket、背景重讀、失敗保留舊列、`loadMoreError`、`canLoadMore` | ⬜ 未開始 | | |
| 1b | `usePagedList` 的 `initial`、`onLanded`（帶戳記、可回 `false` 補讀一次）、`meta`、`isConfirmed` | ⬜ 未開始 | | |
| 2 | `createAdminCache`（builder、整數戳、fence、空結果刪槽、view、`accessLost`、`open`／`dispose`）＋`useAdminList`＋`classifyWriteFailure`＋PII 守衛 | ⬜ 未開始 | | |
| 3 | `AdminToolbar` 新契約（`isUpdating`／`refreshDisabled`／`updateError`／`exportProgress`／`exportDescribedBy`、宣告區、`filter` 選填），兩個呼叫端同步改接 | ⬜ 未開始 | | |
| 4a | 提領頁純遷移到 `usePagedList`（綠到綠，既有測試一字不改；先補特徵測試） | ⬜ 未開始 | — | |
| 4b | 提領頁讀取側：快取、確認閘門與原因說明、勾選清除、統計與作業面板、資料時間、骨架、錯誤區、失敗保留舊列與遮蔽、篩選保留 | ⬜ 未開始 | | |
| 4c | 提領頁動作側：`AdminActionReport`、結果分類、失敗重讀、失效與 fence、批次快照、焦點後備、`withdrawalExport.ts` | ⬜ 未開始 | | |
| 5 | 會員頁（快取、子分頁保留、`useLatestRequest`、補讀）＋證件審核（閘門、錯誤區與重讀、`memberLabel`、按鈕順序） | ⬜ 未開始 | | |
| 6 | 公告（快取、骨架、錯誤態）＋告警（`AdminToolbar`、閘門） | ⬜ 未開始 | | |
| 7 | 殼層：`AdminConsole`（`user.id` key、store `open`／`dispose`、注入、匯出鎖分頁）、`AdminDashboard` 讀 `UserContext` | ⬜ 未開始 | | |
| 8 | e2e 三個情境＋journey page object 與 offline 檢查＋溢版巡檢 | ⬜ 未開始 | | |
| 9 | 文件（規格書 §13 新段與 §14 三列、ui-ux §5、檔頭理由、母計畫 §1／§2／§4.3 驗收 3／§6.2／progress）＋清理本目錄 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃第三版（依第二輪審查與業主裁決 E1–E8 修訂；第一輪的 D1–D8 不變）已完成，第三輪四視角審查進行中／待業主審。
核准後由業主親自打 `/tdd-implement admin-data-cache`，從階段 1a 開始。範圍比開工 prompt 預估大
（十二個階段），可能需要兩到三次對話——中途 `/clear` 續作屬預期內，從本表找回位置。

## Blockers（逃生口紀錄）

## 框架摩擦
