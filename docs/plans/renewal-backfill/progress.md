# 補繳式續約(renewal-backfill)實作進度

分支:`feature/renewal-backfill`(base:`origin/develop` @ `0bc3edf`)
規劃書:`./plan.md`(**第 2 版**)|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `process_successful_payment` 加 user 層級鎖(migration) | ⬜ 未開始 | | |
| 2 | `backfillPlan()` 純函式 + `_shared/backfill-cases.ts` 共用案例表 | ⬜ 未開始 | | |
| 3 | 後端拆守衛(`/payuni/prepare` 移除「過期超過一年拒絕 extend」) | ⬜ 未開始 | | |
| 4 | `/subscriptions/status` 回傳 `renewal` 區塊 | ⬜ 未開始 | | |
| 5 | `PaymentResult.tsx` 區分補繳中間筆與開通收斂延遲 | ⬜ 未開始 | | |
| 6 | 前端接 `useSubscription()` + 拆 `canExtend` + 揭露卡片 | ⬜ 未開始 | | |
| 7 | 補繳進度顯示 + 付款後錯誤態重試 | ⬜ 未開始 | | |
| 8 | 四契約回歸測試(`renewal_backfill_recovery.feature`) | ⬜ 未開始 | | |
| 9 | 規格書 §5.1 / §6.2 + `useSubscription.ts` 過時註解同步 | ⬜ 未開始 | | |

> 階段 1 先行是刻意的:它是金錢正確性防線且獨立於其他階段,先補好洞,
> 後面拆守衛時才不會有一段「規則已放寬但防線未到位」的窗口。
> 階段 9 **不能只看 CI 綠燈**——`check-spec-drift.py` 不比對自由散文,
> §6.2 表格下方那段舊敘述必須人工核對。

## 目前位置與下一步

第 1 輪審查(`review.md`)得 P0×3、P1×9、P2×4;人已裁決
**Q1=(a) 納入併發鎖、Q2=不設筆數上限(依 A1 收斂結案)、Q3=維持逐筆付款**。
plan.md 已依裁決改寫為第 2 版,三個 P0 與九個 P1 全數修訂、無豁免;
P2 三項納入,雙副本收斂改列為新開放問題 Q4。

**下一步:重跑 `/review-plan renewal-backfill` 產生第 2 輪審查結果 → 停,等人審。**
第 2 版新增的開放問題 Q4(twDate 雙副本要不要收斂)、Q5(揭露文案要不要
說明「為什麼值得補繳」)需要人裁決。

實作只能由人親自打 `/tdd-implement renewal-backfill` 啟動。

## Blockers(逃生口紀錄)

<!-- 尚無 -->

- 預期可能觸發「逃生口 1(紅燈測試一寫就綠)」的地方:plan.md 的 AC-5
  (補繳每筆都發三代獎金、任務不 +1)是既有行為,階段 3 的相關斷言很可能
  直接綠。屆時記錄於此並跳過,**不要為了製造紅燈去改動
  `pay_referral_generations`**。

## 框架摩擦

- 第 1 版規劃書把「付款後回到結帳頁」寫進 AC-3,實際上 PayUni 導回落在
  `/payment/result`。規劃時只讀了 `/payuni/prepare` 與 `process_successful_payment`,
  沒有往下追導回的落地頁,四視角審查才抓到(P0-1)。
  **可複用的教訓:動金流流程時,「錢進去」與「人回來」是兩條要分別追的路徑,
  只追前者會漏掉使用者實際看到的畫面。** 若再犯第二次就整併進 friction-log。
