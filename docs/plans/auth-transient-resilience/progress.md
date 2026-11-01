# 暫時性故障不登出（T1-B）實作進度

<!-- 外部記憶：每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支：`feature/auth-transient-resilience`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| B0 | 開工前置（F1 合併、rebase、讀差異） | ⬜ 未開始 | — | — |
| B1 | 後端 authenticate／ProfileReadError 503／?retry=1 | ⬜ 未開始 | | |
| B2 | fetchProfile 8 秒逾時＋retry | ⬜ 未開始 | | |
| B3 | useAuthBootstrap degraded＋自動／事件重試＋404 統一 | ⬜ 未開始 | | |
| B4 | endInvalidSession＋apiClient 兩層確認＋AuthPage | ⬜ 未開始 | | |
| B5 | 守衛 degraded 外框＋StatusCallout＋e2e | ⬜ 未開始 | | |
| B6 | 規格書 §5.3、§14 #8 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃完成、等 `/review-plan` 與業主人審；實作須等 F1（`fix/signout-cleanup`）合進 develop 後 rebase。

## Blockers（逃生口紀錄）

## 框架摩擦
