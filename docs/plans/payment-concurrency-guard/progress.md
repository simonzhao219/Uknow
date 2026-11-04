# 金流與推薦的並行防線 實作進度

分支:`feature/payment-concurrency-guard`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)
第 5 波工項 S2;主 session `session_01MQovbBpvF5cMi5BqUrAH86`。紅綠燈 hash 以 PR 內文為準。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | C:唯一索引+repair 鎖 | ⬜ 未開始 | | |
| 2 | B:register 走 validate(後端) | ⬜ 未開始 | | |
| 3 | B:register 503 前端 | ⬜ 未開始 | | |
| 4 | D:稍後註冊改登出、cancel-signup 退場 | ⬜ 未開始 | | |
| 5 | E:prepare 停權 403+prepare_payment_order(後端) | ⬜ 未開始 | | |
| 6 | E:結帳頁停權卡(前端) | ⬜ 未開始 | | |
| 7 | A+W5-14:重複付款偵測、付款途中停權告警 | ⬜ 未開始 | | |
| 8 | 收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃 r2 已納入 W5-11～14 與審查 P1;等主 session 親審後由業主親打 `/tdd-implement payment-concurrency-guard`。
開工第一步:S3(#508)合併後 rebase origin/develop。§2.7 唯讀 SQL 11/04 23:00 兩邊皆 0 列。

## Blockers(逃生口紀錄)

## 框架摩擦
