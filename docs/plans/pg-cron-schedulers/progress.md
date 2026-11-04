# 對帳與照片清理改由 pg_cron 觸發 實作進度

分支：`feature/pg-cron-schedulers`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | migration：帳本、租約、invoke、health RPC、cron 排程 | ⬜ 未開始 | | |
| 2 | pay P1-3：未知 TradeStatus 不標 expired＋告警 | ⬜ 未開始 | | |
| 3 | ops P1-3：查詢全滅 502／過半告警 | ⬜ 未開始 | | |
| 4 | 對帳 handler 接帳本與租約 | ⬜ 未開始 | | |
| 5 | 照片清理 pg_cron 路徑與 `PHOTO_PURGE_LIVE` | ⬜ 未開始 | | |
| 6 | `GET /internal/scheduler-health` | ⬜ 未開始 | | |
| 7 | 看門狗決策純函式（scheduler-watchdog.py） | ⬜ 未開始 | | |
| 8 | 兩支 workflow 改寫＋文件同步 | ⬜ 未開始 | | |

（紅綠燈 hash 以 PR 內文為準，rebase 後更新 PR 內文的表。）

## 目前位置與下一步

規劃與 /review-plan 完成，等業主裁決 §6 Q1～Q6，並在本 session 親打 `/tdd-implement pg-cron-schedulers`。

## Blockers（逃生口紀錄）

## 框架摩擦
