# 補繳式續約(renewal-backfill)實作進度

分支:`feature/renewal-backfill`(base:`origin/develop` @ `0bc3edf`)
規劃書:`./plan.md`(**第 4 版**)|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `process_successful_payment` 加 user 層級鎖(migration,**基準 = `20260720000001`**) | ⬜ 未開始 | | |
| 2 | `backfillPlan()` 純函式 + `_shared/backfill-cases.ts` 共用案例表 | ⬜ 未開始 | | |
| 3 | 後端拆守衛(`/payuni/prepare` 移除「過期超過一年拒絕 extend」) | ⬜ 未開始 | | |
| 4 | **A10/A11:fresh 未填碼套用預設推薦碼**(改法 B,只動 W3) | ⬜ 未開始 | | |
| 5 | **A12:`/health` 回報 `defaultReferrer` 三態** | ⬜ 未開始 | | |
| 6 | 兩支端點回傳 `renewal`(`/subscriptions/status` + `/payuni/result/:tradeNo`) | ⬜ 未開始 | | |
| 7 | `PaymentResult.tsx` 區分補繳中間筆與開通收斂延遲 | ⬜ 未開始 | | |
| 8 | 前端接 `useSubscription()` + 拆 `canExtend` + 揭露卡片 + 新約文案 | ⬜ 未開始 | | |
| 9 | 補繳進度顯示 + 付款後錯誤態重試 | ⬜ 未開始 | | |
| 10 | 四契約回歸測試(`renewal_backfill_recovery.feature`) | ⬜ 未開始 | | |
| 11 | journey 三檔反轉 + 規格書 §5.1/§6.2/**§7.4** + 過時註解同步 | ⬜ 未開始 | | |

> 階段 1 先行是刻意的:它是金錢正確性防線且獨立於其他階段,先補好洞,
> 後面拆守衛時才不會有一段「規則已放寬但防線未到位」的窗口。
> 階段 11 **不能只看 CI 綠燈**——`check-spec-drift.py` 不比對自由散文,
> §6.2 表格下方那段舊敘述必須人工核對。

## 目前位置與下一步

**規劃書已改寫為第 4 版**。第 3 版之後,人裁決 Q10(保證預設推薦碼永遠存在)
與 Q11(文案不解釋機制),並要求把「選新約不填碼 → 套用預設推薦碼」納入設計,
指定用**改法 B**(只動 `/payuni/prepare` 的 fresh 分支,不新增 migration)。

本版新增 A10-A12 三條規則、AC-9~AC-11 三個驗收情境、兩個階段(4 = A10/A11、
5 = A12),階段總數 9 → 11。**feature 範圍因此擴大。**

**下一步:重跑 `/review-plan renewal-backfill` 產生第 3 輪審查 → 停,等人審。**

待裁決:Q8(「fresh 清空帳本」的上線時序)、Q9(清空揭露與兩個邊界)、
**Q12**(預設推薦人 P 要不要排除在推薦王計數之外)、**Q13**(原上代失去下線
要不要通知)。

實作只能由人親自打 `/tdd-implement renewal-backfill` 啟動。

### 實作時特別要記住的四條

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
4. **A10 的 `referred_by_is_default` 必須設 `true`**(第 4 版新增)。
   `/payuni/prepare` 現在寫死 `false`(`index.ts:1432`),因為原本只在
   「使用者親自填碼」時才走那條。未填碼那一支若沿用 `false`,`/profile` 的
   `isAutoReferral` 就是 false,前端會把使用者不該知道的預設推薦碼顯示在
   placeholder 上(`PaymentCheckout.tsx:672`)——直接違反 Q11 裁決。

## Blockers(逃生口紀錄)

<!-- 尚無 -->

- 預期可能觸發「逃生口 1(紅燈測試一寫就綠)」的地方:plan.md 的 AC-5
  (補繳每筆都發三代獎金、任務不 +1)是既有行為,階段 3 的相關斷言很可能
  直接綠。屆時記錄於此並跳過,**不要為了製造紅燈去改動
  `pay_referral_generations`**。

## 框架摩擦

- 第 1 版把「付款後回到結帳頁」寫進 AC-3,實際上 PayUni 導回落在
  `/payment/result`。規劃時只讀了 `/payuni/prepare` 與 `process_successful_payment`,
  沒有往下追導回的落地頁,四視角審查才抓到(第 1 輪 P0-1)。
  **可複用的教訓:動金流流程時,「錢進去」與「人回來」是兩條要分別追的路徑,
  只追前者會漏掉使用者實際看到的畫面。**

- **同一類缺口在同一個 feature 裡犯了兩次**:第 1 輪 P0-2 指出「規劃寫了新的
  目標行為,但沒設計資料怎麼送到那個畫面」(PaymentCheckout);第 2 版修好它
  之後,第 2 輪 P0 在 `PaymentResult.tsx` 上抓到**完全一樣**的缺口,三個視角
  獨立發現。**教訓:被指正一類錯誤後,要對同一份產出做同類掃描,不能只修
  被點名的那一處**(這正是 `/fix-bug` 的「同類掃描」該推廣到規劃階段)。
  已犯兩次——**若第三輪再出現同型缺口,整併進 `docs/plans/friction-log.md`**。
