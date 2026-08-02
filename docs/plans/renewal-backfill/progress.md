# 補繳式續約(renewal-backfill)實作進度

分支:`feature/renewal-backfill`(base:`origin/develop` @ `0bc3edf`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `backfillPlan()` 純函式 + `_shared/backfill-cases.ts` 共用案例表 | ⬜ 未開始 | | |
| 2 | 後端拆守衛(`/payuni/prepare` 移除「過期超過一年拒絕 extend」) | ⬜ 未開始 | | |
| 3 | `/subscriptions/status` 回傳 `renewal` 區塊 | ⬜ 未開始 | | |
| 4 | 前端拆 `canExtend` + 事前揭露卡片 | ⬜ 未開始 | | |
| 5 | 補繳進度顯示(「已補至 X,還差 N 筆」) | ⬜ 未開始 | | |
| 6 | 規格書 §5.1 / §6.2 同步 | ⬜ 未開始 | | |

> 若 §6 開放問題 Q1 裁決為 (a),需在階段 2 之前插入一個階段:
> `process_successful_payment` 加 user 層級鎖(含並發整合測試)。

## 目前位置與下一步

規劃書已寫完,尚未跑 `/review-plan`。下一步:跑四視角審查 → 產出
`./review.md` → **停,等人裁決**。§6 的三個開放問題(尤其 Q1 併發缺口)
必須在開工前有答案。

實作只能由人親自打 `/tdd-implement renewal-backfill` 啟動。

## Blockers(逃生口紀錄)

<!-- 尚無 -->

- 預期可能觸發「逃生口 1(紅燈測試一寫就綠)」的地方:plan.md 的 AC-5
  (補繳每筆都發三代獎金、任務不 +1)是既有行為,斷言很可能直接綠。
  屆時記錄於此並跳過,不要為了製造紅燈去改動 `pay_referral_generations`。

## 框架摩擦

<!-- 尚無 -->
