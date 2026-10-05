# 後台資訊架構重構（S3）實作進度

<!-- plans-keep: S3 施工中的三段式鷹架（規劃待人審、實作未開始）；退場條件＝/tdd-implement 收尾、PR 合併前整個 docs/plans/admin-ia-refactor/ 刪除 -->

分支:`feature/admin-ia-refactor`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 四分頁＋二字標籤＋AdminSetup 退場 | ✅ 綠 | 2d97039 | 1e0e1f7 |
| 2 | AdminToolbar 元件 | ✅ 綠 | e2d7bbd | 92b834b |
| 3 | 套用兩頁＋CSV 忙碌態＋會員頁重新整理 | ✅ 綠 | a1e486a | 70460f0 |
| 4 | 文件與註解人工同步 | ✅ 完成（純文件，無紅燈） | — | （本 commit） |

## 目前位置與下一步

四階段全綠。下一步：收尾——`npm run check:full`、視覺自查、`/review-implementation admin-ia-refactor`、升級決策後清理規劃檔。

## Blockers(逃生口紀錄)

**偏離規劃（實作中發現，記錄供 PR「偏離規劃說明」）**：
1. 階段 1｜分頁完整名稱的承載方式：規劃寫「拆段 sr-only 補字」（`<sr-only>獎金</sr-only>提領<sr-only>管理</sr-only>`）。
   真瀏覽器實測 Chromium 把 position:absolute 的 sr-only 當區塊、名稱算成「會員 管理」（中間多空白），
   `get_by_role(name="會員管理")` 找不到（jsdom 不排版，vitest 抓不到）。改走規劃 §7 已列的退路：
   完整名稱整串放一個 sr-only 節點、TabsTrigger `aria-labelledby` 指向它。可見字仍是名稱子字串（WCAG 2.5.3），
   沒有用 aria-label；鎖住的紅燈測試一行未改。
2. 階段 1｜`SystemAlerts.tsx` 加 `res.data?.alerts ?? []`：告警變成最後一個分頁後，`AdminDashboard.test` 的通用
   apiClient 替身（回 `{items,total}`）讓 SystemAlerts 讀 `undefined.length` 擲錯——舊順序下切到管理員設置就卸載了，
   所以一直沒浮出。比照 `WithdrawalManagement.tsx:221-224` 既有原則（一個面板形狀不合不該弄壞整個後台），屬規劃外的一行防禦。
3. 階段 3｜`AdminToolbar` 加 `canExport`（規劃 §2 列的 `exportLabel?` 沒加）：空清單時 CSV 鈕維持在、但 disabled（同改版前
   `disabled={!withdrawals.length}`），不讓版面跳；匯出名稱只有提領一處用，不需要可配。`role="status"` 改為只在匯出中掛上——
   常駐的空 status 會撞到既有「載入完成後畫面不再有 status」的測試，語意上也會被當成整頁在載入。
4. 階段 3｜會員頁搜尋框加 `aria-label="搜尋姓名、Email 或電話"`：placeholder 縮成「搜尋會員」後，能搜哪些欄位改由名稱說（報讀念得到）。

## 框架摩擦
