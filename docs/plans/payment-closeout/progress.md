# 金流收尾（payment-closeout）實作進度

<!-- plans-keep: 第 7 波 S4 施工鷹架；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

分支：`feature/payment-closeout`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | drop wrapper＋改測試 | ✅ 綠 | 4c94b3a0 | 270a7030 |
| 2 | 3a-bis／3b／3d 升 error | ✅ 綠 | a7fbb4d6 | ae03a171 |
| 3 | 單筆開通失敗 message | ✅ 綠 | 10e5ea0e | 62362ac4 |
| 4 | repair 關全量（W7-9 Q1＝A） | ✅ 綠 | f1c2dfb7 | bd27c817 |
| 5 | 後台文案（W7-9 Q5） | ✅ 綠 | 5ec077fd | ad6d77a9 |
| 6 | 文件 | ✅ 綠 | 903592d2 | 5bf5769a |

## 目前位置與下一步

階段 1～6 全綠；`check:full` 綠；/review-implementation P0 0、P1 2 已處置（見 implementation-review.md）。下一步：刪規劃檔、push、開 PR。

## Blockers（逃生口紀錄）

## 本機驗證紀錄

- 本機 `supabase start`（CLI 3.4）全套 `deno task test`：890 passed／3 failed——3 支皆是 grant 檢查（name-write-paths、rls-policies listings、scheduled-job-runs net schema），與本 diff 無關，疑本機 CLI 預設權限與 CI 不同；以 CI api-tests 為準。
- 階段 2 突變驗證：拿掉 3b 呼叫端的雙保險 → 「告警函式本身擲錯」測試轉紅。

## 框架摩擦

## 偏離規劃（PR 內文要寫）

- 階段 3：plan 列的「重讀訂單 select 就擲錯」注入測試沒寫——security definer 擁有者讀表無法以觸發器／RLS 讓 select 擲錯。改以程式結構保證：handler 不參照 v_row、一律以 p_order_id 回查（審查時逐行核）。
- 覆蓋缺口（實作審查 2、12，接受）：open_failed 的「查無單號」分支只有結構保證；3a-bis 重跑去重、40P01／40001 分類字串、3d／3a-bis 的「告警函式擲錯」路徑沒有獨立測試（與已測的 3b 結構對稱）。
- 階段 4：plan 列的「Edge guard 單元測試」沒寫——`repairOrphanedPaymentsBestEffort` 是 index.ts 內部函式（不 export）；guard 只有一行 `if (!userId) return;`，DB 端 U6R02 已由測試釘住。
