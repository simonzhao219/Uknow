# 補繳式續約(renewal-backfill)實作進度

分支:`feature/renewal-backfill`(base:`origin/develop` @ `0bc3edf`)
規劃書:`./plan.md`(**第 5 版**)|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | user 層級鎖(migration,基準 = `20260720000001`) | ⬜ 未開始 | | |
| 2 | **A13 fresh 清空帳本**(migration,基準 = 階段 1 產出版) | ⬜ 未開始 | | |
| 3 | `backfillPlan()` 純函式 + 共用案例表 | ⬜ 未開始 | | |
| 4 | 後端拆守衛(移除「過期超過一年拒絕 extend」) | ⬜ 未開始 | | |
| 5 | A10/A11 fresh 未填碼套用預設推薦碼 | ⬜ 未開始 | | |
| 6 | **A16 待審提領擋 fresh** | ⬜ 未開始 | | |
| 7 | A12 `/health` 回報 `defaultReferrer` 三態 | ⬜ 未開始 | | |
| 8 | 兩支端點回傳 `renewal`(含 forfeit/withdrawal 欄位) | ⬜ 未開始 | | |
| 9 | `PaymentResult.tsx` 區分補繳中間筆 | ⬜ 未開始 | | |
| 10 | 前端接線 + 揭露卡片 + 新約文案 + **A14 清空揭露** | ⬜ 未開始 | | |
| 11 | 補繳進度 + 錯誤態 + **A15 二次確認** | ⬜ 未開始 | | |
| 12 | 四契約回歸測試(`renewal_backfill_recovery.feature`) | ⬜ 未開始 | | |
| 13 | journey 三檔反轉 + 規格書(§5.1/§6.2/§7.4/§8 + R8 過渡行為)+ 註解 | ⬜ 未開始 | | |

> 階段 1 先行是刻意的:它是金錢正確性防線且獨立於其他階段,先補好洞,
> 後面拆守衛時才不會有一段「規則已放寬但防線未到位」的窗口。
> 階段 13 **不能只看 CI 綠燈**——`check-spec-drift.py` 不比對自由散文,
> §6.2 表格下方那段舊敘述必須人工核對。

## 目前位置與下一步

**規劃書已整併為第 5 版,Q1-Q14 全數裁決完畢、開放問題清空。**
機制規則單一事實來源:`../upline-pairing-lines/rules.md`(M1-M8)。
「阿凱的七年」完整例子經人逐點確認(2026-08-02「確認沒錯」)。

**下一步:第 3 輪 `/review-plan` 已派出 → 彙整 review.md → 停,等人審。**
無 P0 或 P0 處置完畢後,實作由人親自打 `/tdd-implement renewal-backfill` 啟動。

### 實作時特別要記住的五條

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
5. **清空絕不在建單時做**(第 5 版新增)。A13 的沖銷必須在付款**成功**
   當下(`process_successful_payment`),建單後可能棄單;沖銷列冪等綁
   `subscription_id`;清空 migration 的基準 = 階段 1 產出版,不要從 wave4 抄。

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
