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
| 5 | 後台文案（W7-9 Q5） | ✅ 綠 | 5ec077fd | （本 commit） |
| 6 | 文件 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃 r3 完成，Q1～Q7 已裁（W7-9、W7-10、W7-12）；等業主親打 `/tdd-implement payment-closeout` 才開工。

## Blockers（逃生口紀錄）

## 本機驗證紀錄

- 本機 `supabase start`（CLI 3.4）全套 `deno task test`：890 passed／3 failed——3 支皆是 grant 檢查（name-write-paths、rls-policies listings、scheduled-job-runs net schema），與本 diff 無關，疑本機 CLI 預設權限與 CI 不同；以 CI api-tests 為準。
- 階段 2 突變驗證：拿掉 3b 呼叫端的雙保險 → 「告警函式本身擲錯」測試轉紅。

## 框架摩擦

## 偏離規劃（PR 內文要寫）

- 階段 3：plan 列的「重讀訂單 select 就擲錯」注入測試沒寫——security definer 擁有者讀表無法以觸發器／RLS 讓 select 擲錯。改以程式結構保證：handler 不參照 v_row、一律以 p_order_id 回查（審查時逐行核）。
- 階段 4：plan 列的「Edge guard 單元測試」沒寫——`repairOrphanedPaymentsBestEffort` 是 index.ts 內部函式（不 export）；guard 只有一行 `if (!userId) return;`，DB 端 U6R02 已由測試釘住。
