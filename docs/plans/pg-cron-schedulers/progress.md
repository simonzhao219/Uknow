# 對帳與照片清理改由 pg_cron 觸發 實作進度

分支：`feature/pg-cron-schedulers`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | spike：pg_net 安裝、Vault 讀取、cron.job 讀取、net／vault 權限、net.http_post 斷言法、TradeStatus 碼表 | ⬜ 未開始 | — | — |
| 1 | 帳本表＋begin/finish_scheduled_run＋scheduled-runs.ts | ⬜ 未開始 | | |
| 2 | pay P1-3：unknownStatus、移除 ?? list[0]、不標 expired、視窗排序 | ⬜ 未開始 | | |
| 3 | ops P1-3：計數拆分、全滅 502、過半告警 | ⬜ 未開始 | | |
| 4 | 對帳 handler 接 withScheduledRun | ⬜ 未開始 | | |
| 5 | 照片清理 trigger 分流＋帳本＋失敗告警 | ⬜ 未開始 | | |
| 6 | scheduler_health RPC＋GET /internal/scheduler-health | ⬜ 未開始 | | |
| 7 | scripts/scheduler-watchdog.py | ⬜ 未開始 | | |
| 8 | invoke_internal_endpoint＋cron 排程（最後才掛） | ⬜ 未開始 | | |
| 9 | 兩支 workflow 改寫＋文件同步 | ⬜ 未開始 | | |

（紅綠燈 hash 以 PR 內文為準，rebase 後更新 PR 內文的表。）

## 目前位置與下一步

規劃第 2 版（處置第 1 輪審查、W5-15～19 裁決）已完成並重跑 /review-plan；等主 session 親審後，業主在本 session 親打 `/tdd-implement pg-cron-schedulers`。開工先做階段 0 spike。

## Blockers（逃生口紀錄）

## 框架摩擦
