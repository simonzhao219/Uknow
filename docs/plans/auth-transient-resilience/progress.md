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

plan v2.1（1985a0b）主 session 親審通過；業主 11/01 親打 `/tdd-implement`，review.md 處置已填。
**卡在 B0**：F1（`fix/signout-cleanup`）尚未合進 develop（11/01 develop＝1525913，#485）。B1 的 Logs Explorer 查詢已先送主 session。
等主 session 通知 F1 合併 → rebase → B0 結構快照 → B1。

### 實作時處理（主 session 審查 P2，不改 plan）

1. **B4**：§2.3 `retry()` 偽碼漏了 dispatch `retry` action——手動／事件重試進入時先設 `isRetrying=true`（callout 不卸載、鈕 `aria-disabled`）；
   `profile`／`transient`／`missing`／`signedOut`／`unauthorized` 每個出口都清 `isRetrying`。B4 補一案「重試後再 transient → `isRetrying` 回 false、`failedAgain` 為真」。
2. **B1 前**：把 Logs Explorer 唯讀查詢（24 小時 `/profile` 5xx 與 `effective_registration_step` 等 rpc 錯誤）send_message 給主 session 代跑兩站，結果記這裡。

## Blockers（逃生口紀錄）

## 框架摩擦
