# 暫時性故障不登出（T1-B）實作進度

<!-- 外部記憶：每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支：`feature/auth-transient-resilience`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| B0 | 開工前置（F1 合併、rebase、結構快照、deno） | ⬜ 未開始 | — | — |
| B1 | 後端 authenticate／ProfileReadError 503／register post-write／?retry=1 | ⬜ 未開始 | | |
| B2 | apiUrl 抽出、fetchProfile missing／retry／逾時常數 | ⬜ 未開始 | | |
| B3 | endInvalidSession＋appShell 等價改寫 | ⬜ 未開始 | | |
| B4 | useAuthBootstrap degraded／重試／getSession 錯誤／anomaly | ⬜ 未開始 | | |
| B5 | 入口與漏斗頁：routeAfterVerifiedSession、AuthPage、PaymentCheckout、CompleteProfile | ⬜ 未開始 | | |
| B6 | 呈現：AuthDegradedNotice、守衛、authView、e2e | ⬜ 未開始 | | |
| B7 | apiClient 兩層確認（可降級） | ⬜ 未開始 | | |
| B8 | 規格書 §5.3、§14 #8、§2.1 已知限制 | ⬜ 未開始 | | |

## 目前位置與下一步

v2 規劃（W4-11～17 裁決＋v1 審查 P1 修訂）完成、重跑 `/review-plan`、等業主人審；實作須等 F1（`fix/signout-cleanup`）合進 develop 後 rebase。

## Blockers（逃生口紀錄）

## 框架摩擦
