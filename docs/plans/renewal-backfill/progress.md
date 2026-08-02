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

**第 2 輪審查已完成**(`review.md` 後半段):P0×1、P1×11、P2×4。

第 1 輪三個 P0 的修訂**全數被確認有效**。第 2 輪唯一的 P0 是**同一類缺口
換一個檔案復發**:`PaymentResult.tsx` 需要的 `renewal` 沒有任何資料流送達
(系統/架構/需求三個視角獨立發現)。架構視角另補一個更隱蔽的陷阱——若直接
掛 `useSubscription()`,它的 stale-while-revalidate 會在**最後一筆**補繳時
用付款前的舊快取,把剛付完、已經 active 的使用者導向「還差 1 筆」。

**卡在等人裁決第 2 輪處置**,其中 P0 有兩個方案要選:
- (a) 掛 `useSubscription()` + 強制 `refresh()` 繞過 SWR 快取
- (b) 擴充 `GET /payuni/result/:tradeNo` 回傳精簡版 `renewal`

另有 Q4(twDate 雙副本)、Q5(揭露文案)、Q6(中途放棄者召回)待裁決。

下一步(需人在 `review.md`「第 2 輪處置」節勾選後才動):
修訂 plan.md 第 3 版 → 重跑 `/review-plan` → 再等人審。

實作只能由人親自打 `/tdd-implement renewal-backfill` 啟動。

### 第 2 輪特別要記住的三條(修訂時容易漏)

1. **migration 基準版本是 `20260720000001_wave4_guards.sql:383-495`,不是
   `20260718000001`**。兩版差在 `apply_referral_side_effects` 的第三個參數
   `v_paid_at`。抄錯基準會靜默回退一個影響所有付款路徑的 bug。
2. **併發測試必須用兩條原生 postgres 連線**(比照
   `process-payment-concurrency.test.ts:23-29,51-61`)。走 `.rpc()` 測不出
   race window,會寫出「綠燈但沒測到鎖」的假測試。
3. **journey 測試改動要在規劃階段就決定**。
   `e2e/journey/features/60_time_scenarios.feature:50-55` 等三個檔案斷言了
   舊行為,而 journey **只在 develop→main 晉升 PR 才跑**——漏改的話會在
   那 30-90 分鐘跑到一半才紅,是所有落點裡發現最晚的一個。

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
