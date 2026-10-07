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
| 1a | `useLatestRequest`（`nextStamp`）；`usePagedList` 序號（兩個方向、ticket 帶身分與戳、`load` 走 ref）、旗標綁 ticket、背景重讀、失敗保留舊列、`clearOnError`、`loadMoreError`、`canLoadMore`、`reload` 回傳結算 | ✅ 綠燈 | `835b2e5` | `dbd0f29` |
| 1b | `usePagedList` 的 `initial`（換身分時凍結）、`onLanded`（被拒補讀一次、再被拒進錯誤態）、`meta`、`isConfirmed` | ✅ 綠燈 | `9e7edf7` | `6f14c49` |
| 2 | `createAdminCache`（builder `{id, slot, resource, params}`、fence 用 hooks 的 `nextStamp`、空結果刪槽、view、`accessLost`、`open`／`dispose`）＋`useAdminList`＋`writeOutcome`＋PII 守衛（AST） | ✅ 綠燈 | `14dfabf` | `f0e2b7f` |
| 3 | `AdminToolbar` 新契約（`onRefresh`、`statusText`、`isUpdating`、`refreshDisabled`、`exportDescribedBy`、`filter` 選填）、匯出宣告文字同步、`useRefreshAnnouncer`，兩個呼叫端同步改接 | ✅ 綠燈 | `439601b` | `53273b3` |
| 4a | 提領頁純遷移到 `usePagedList`（綠到綠，既有測試一字不改；先補特徵測試） | ✅ 綠到綠（特徵測試 `b079c63`） | — | `ac08b01` |
| 4b | 提領頁讀取側：快取、匯款類閘門（D、K5）與 `AdminListStatus`、統計骨架（A）、作業面板、資料時間、骨架、錯誤區、失敗保留舊列與遮罩、篩選保留 | ✅ 綠燈 | `c460654` | `bc762e9` |
| 4c | 提領頁動作側：`AdminActionReport`、結果分類、失敗重讀、失效與 fence、批次快照、焦點後備、`withdrawalExport.ts`（含完成核對 K7）、busy | ✅ 綠燈 | `9a35ecb` | `47bb6b0` |
| ★ | **中途對照（K8）**：4c 綠燈後通知主 session 對照 hooks＋快取＋提領頁的 diff，通過才開 5a（最後對照只看 5–9） | ✅ 通過（PR #371 留言 6033343045；業主裁決 6033724251） | — | — |
| ★′ | 4c 回填：中途對照 P1、業主裁決 A–G、P2 #12–#22（`plan.md` §10.7） | ✅ 綠燈（守衛 `3c133d5`） | `79bd971` | `c2b47fa` |
| 5a | 會員頁（快取、子分頁保留、`useLatestRequest`、補讀、結果不明重讀詳情、換搜尋整合測試） | ⬜ 未開始 | | |
| 5b | 證件審核（錯誤區與重讀、成功回報、`memberLabel`、按鈕順序；不受閘門約束） | ⬜ 未開始 | | |
| 6 | 公告（快取、骨架、錯誤態、刪除鈕 44px）＋告警（`AdminToolbar`、背景重讀、`onAccessLost`；不走共用 hook） | ⬜ 未開始 | | |
| 7 | 殼層：`AdminConsole`（`user.id` key、store `open`／`dispose`、注入、busy 鎖外層分頁與會員子分頁、說明行）、`AdminDashboard` 讀 `UserContext` | ⬜ 未開始 | | |
| 8 | e2e 三個情境＋journey page object 與 offline 檢查＋溢版巡檢 | ⬜ 未開始 | | |
| 9 | 文件（規格書 §13 新段與 §14 三列、ui-ux §3／§5／§9、檔頭理由、母計畫 §1／§2／§4.3 驗收 2 與 3／§6.2／progress 與計畫異動記錄）＋PR 描述揭露＋清理本目錄 | ⬜ 未開始 | | |

## 目前位置與下一步

中途對照（K8）通過，4c 回填綠燈（★′）。**下一步：5a 會員頁**——依業主裁決「4c 回填綠燈後直接開 5a，不必再通知」。5–9 做完
跑 `/review-implementation`、PR 改實作版描述後通知主 session 最後對照（只看 5–9）。十三個階段，需要兩到三次對話——中途
`/clear` 續作屬預期內，從本表找回位置。

## Blockers（逃生口紀錄）

- 1b 驗證標準「載入更多失敗 `isConfirmed` 仍為真」已由 1a 的「載入更多失敗後可以再按一次，且不改變確認狀態」覆蓋，1b 不重複寫（逃生口 1 的子項，不影響階段）。
- 4c 回填（紅燈 `79bd971`）：P2-17 的兩條守衛自測（帶副檔名的匯入、`require()`）綠不了——AST 守衛的**實作**
  （`storageUses` 與規則表）就寫在 `src/utils/repoHygiene.test.ts` 裡，紅燈鎖擋 `*.test.*` 編輯，改實作等於改
  測試檔。兩條案例的期望不需要動，要動的是同檔裡的守衛實作。依逃生口 3 求人工裁決（2026-10-07）。
  **已處置**：業主在 session 內選「授權解鎖改守衛」——其餘實作先綠（`c2b47fa`，測試檔零 diff），再手動移除鎖、只改
  `storageUses` 與規則表（期望一字未動），`npm run check` 全綠後另成 `3c133d5`。框架摩擦記入 friction-log。

## 框架摩擦
