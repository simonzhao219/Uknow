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

四視角審查已完成,結果在 `./review.md`:**P0 × 3、P1 × 9、P2 × 4**。
三個 P0 都不是「規則錯了」,是「規劃沒把設計做完」:

1. `PaymentResult.tsx` 未列入受影響模組——其 45 秒開通輪詢會把每一筆
   非最終補繳付款誤判成系統故障
2. `PaymentCheckout.tsx` 根本不呼叫 `/subscriptions/status`,§3 宣稱的
   「後端成為事實來源」只有結論、沒有接線設計
3. 併發缺口(Q1)留白、無決議無階段,而它是金錢正確性問題

**卡在等人裁決 Q1**——它決定 §2「無 migration」是否成立、要不要新增
一個加鎖階段,所以要先答它才能一次把規劃改齊。

下一步(需人在 `review.md`「處置」節勾選後才動):
修訂 plan.md(含 P0-1、P0-2 與全部 P1)→ 重跑 `/review-plan` → 再等人審。

實作只能由人親自打 `/tdd-implement renewal-backfill` 啟動。

## Blockers(逃生口紀錄)

<!-- 尚無 -->

- 預期可能觸發「逃生口 1(紅燈測試一寫就綠)」的地方:plan.md 的 AC-5
  (補繳每筆都發三代獎金、任務不 +1)是既有行為,斷言很可能直接綠。
  屆時記錄於此並跳過,不要為了製造紅燈去改動 `pay_referral_generations`。

## 框架摩擦

<!-- 尚無 -->
