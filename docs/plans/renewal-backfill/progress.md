# 補繳式續約(renewal-backfill)實作進度

分支:`feature/renewal-backfill`(base:`origin/develop` @ `0bc3edf`)
規劃書:`./plan.md`(**第 7 版**)|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | user 層級鎖 —— **獨立先行 PR `fix/payment-user-lock`**(基準 = `20260720000001`) | ✅ PR #189 已合併(develop `041b674`) | `28ba947` | `730e7fa` |
| 2 | **A13 fresh 清空帳本**(migration,基準 = 先行 PR 合併後版;含 `ledger_reset` + `repair_orphaned_forfeitures`) | ✅ CI 已確認(run 30757239157) | `df8ae96` | `fc55057` |
| 3 | `backfillPlan()` 純函式 + 共用案例表 | ✅ CI 已確認(本地紅綠 + 同 run) | `22f1f87` | `dd27448` |
| 4 | 後端拆守衛(移除「過期超過一年拒絕 extend」) | ✅ CI 佐證(run 30758187758 中 renewal-modes 全綠) | `26c6a12` | `968c66d` |
| 5 | A10/A11 fresh 未填碼套用預設推薦碼 | ✅ CI 佐證(run 30758481955 中該檔全綠) | `84a7caa` | `ece0448` |
| 6 | **A16 待審提領擋 fresh** | ✅ CI 佐證(run 30758760566 中該檔全綠) | `61a88b4` | `8561cd7` |
| 7 | A12 `/health` 回報 `defaultReferrer` 三態 | ✅ CI 佐證(run 30759124724 中該檔全綠) | `47ea089` | `a724293` |
| 8 | 兩支端點回傳 `renewal`(含 forfeit/withdrawal 欄位) | ✅ CI 已確認(run 30760274082;夾具修正 `674fe54`) | `8a8f4a6` | `778a97f` |
| 9 | `PaymentResult.tsx` 區分補繳中間筆 | ✅ CI 已確認(同 run;e2e 分類修正 `3668888`) | `f92c02a` | `d66cb99` |
| 10 | 前端接線 + 揭露卡片 + 新約文案 + **A14 清空揭露** | ✅ CI 已確認(run 30761232004 全綠) | `51bbbe6` | `636a145` |
| 11 | 補繳進度 + 錯誤態 + **A15 二次確認** | 🟢 綠燈(本地 vitest 14/14 + e2e checkout 13/13) | `c968b22` | `6e9d3fa` |
| 12 | 四契約回歸測試(`renewal_backfill_recovery.feature`) | ✅ 逃生口 1(一寫就綠,見 Blockers) | — | `3d2dc13` |
| 13 | journey 三檔反轉 + 規格書(§5.1/§6.2/§7.4/§8 + R8 過渡行為)+ 註解 | ✅ 完成(`abe5b25`;spec-drift/doc-naming 綠;§6.2/§7.4 舊散文已人工核對刪除) | (文件階段無紅燈) | `abe5b25` |

> 階段 1 先行是刻意的:它是金錢正確性防線且獨立於其他階段,先補好洞,
> 後面拆守衛時才不會有一段「規則已放寬但防線未到位」的窗口。
> 階段 13 **不能只看 CI 綠燈**——`check-spec-drift.py` 不比對自由散文,
> §6.2 表格下方那段舊敘述必須人工核對。

## 收尾:實作審查與 P1/P2 處置(2026-08-02)

四視角 `/review-implementation` 已完成,彙整於 `./implementation-review.md`:
**P0×0、P1×6(全數為未記錄偏離,已全數修復)、P2×5(修 4 記 1)**。

- **P1-A** 四狀態表第 4 列:`useSubscription` 曝露 `lastFetchFailed`,
  結帳頁區分載入中(skeleton)/初次失敗(AC-17)/背景失敗+已付補繳
  (「進度暫時無法讀取」+重試),+3 條 vitest。
- **P1-B** AC-15 數字:契約加 `paidBackfillCount/paidBackfillAmount`
  (定義:從最新訂閱往回走、連續帶補繳簽名的筆數),`/subscriptions/status`
  計算,對話框唸出「付款 N 筆(NT$X,已補至日期)」,Deno + vitest 斷言數字。
- **P1-C** AC-2:fresh 卡片顯示具體效期迄日(`subscriptionLastDay(今天)`)。
- **P1-D** 退化分支:未付過且只差 1 筆不出現「補繳」字樣,判準用
  `hasPaidAnyBackfill`(plan §4:用數值判斷會與進度卡打架)。
- **P1-E** Q11 文案改回 plan 逐字(「選擇新約會重新建立推薦關係…」),
  測試補正向斷言。
- **P1-F** fresh 停用時 `aria-describedby` 錨定提領審核說明。
- **P2**:`PayuniResultRenewalSchema` 兩端接線(後端標型別、前端
  `import type`)並加 `extendAnchorDate`;「已補至」改錨點−1 天
  (迄日反推一年在 02-29 迄日會少一天;Result 端保留反推為部署交錯後備)
  並統一 `formatTwDate`;零值子句不唸。
- **P2-4(記錄,不修)**:W3 第五分支 `profile_update_failed`(profiles
  update 本身失敗)**刻意不測**——觸發它需要讓 update 失敗的注入點,
  現有測試架構(真 DB)做不到不侵入;分支行為與其他四種失效相同
  (告警+繼續建單),由同檔其他四情境覆蓋語意。
- e2e mock 夾具同步補契約欄位;截圖重跑(scratchpad/shots-v2)確認
  對話框數字、fresh 具體日期、Q11 警語、零值不唸皆正確。
- 本地驗證:`npm run check` 綠(473 tests)、affected e2e 30/30 綠、
  deno check(shim)綠、spec-drift/test-names 綠。paid 欄位的 DB 斷言
  由 CI api-tests 佐證(subscriptions-status / payuni-result-renewal)。

## 目前位置與下一步

**🔨 實作中(人已親自啟動 /tdd-implement)。階段 1 已綠,PR #189 待合併。**

- 階段 1 走獨立先行 PR **#189**(`fix/payment-user-lock` → develop):
  紅燈 `28ba947`(只含測試,**單獨推送**,CI api-tests 紅 = 紅燈證據,
  run 30755346723:162 個既有測試綠、僅新測試斷言紅
  `expected 3 subscriptions, got 2`——race 真實重現);
  綠燈 `730e7fa`(migration `20260802000001_payment_user_lock.sql`,
  api-tests 轉綠,run 30755575179)。
- 紅燈 hash 記錄於該 fix 分支之外的這裡,因為 fix 分支不帶規劃檔。

PR #189 已合併(develop merge commit `041b674`),本分支已 rebase。
階段 2 紅燈 CI run 30756662557:165 既有測試綠、新檔 6/8 條斷言紅
(另 2 條是「首購 fresh 無沖銷列」「extend 不清空」現狀回歸守衛,
紅燈期即綠屬預期,非逃生口情境)。綠燈 = migration
`20260802000002_fresh_ledger_forfeit.sql` + 契約/前端連動 + `/auth/profile`
接線。

**下一步**:階段 12(e2e 四契約回歸 `renewal_backfill_recovery.feature`,
本地可紅綠)→ 階段 13(journey 三檔反轉 + 規格書升級 + 收尾:
check:full、UI 截圖、/review-implementation、plan 清理、PR 描述)。

### 實作時特別要記住的六條

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
   `subscription_id`;清空 migration 的基準 = **先行 PR 合併後版**,不要從
   wave4 抄。
6. **自癒補沖讀快照,不讀當下餘額**(第 7 版新增)。沖銷失敗時金額快照
   已寫進告警 payload;補沖若改用當下餘額,會沒收延遲期間下線新繳的
   合法點數。快照遺失 → 沖 0 + 升級告警,寧少沖交人工。

## Blockers(逃生口紀錄)

- **階段 8 綠燈後 CI 抓到測試夾具錯**(run 30759382976 兩條紅):夾具把
  end_date 搬到過去但沒動 completed_at,人工製造出補繳簽名
  (`hasPaidAnyBackfill` 誤判 true)。實作忠實執行裁決定義,修的是夾具
  (`674fe54`:setLastEnd 一併回填付款時點維持自然時序)。**教訓:凡是
  操弄時間欄位的夾具,必須整組時間關係一起搬,不能只搬單一欄位**。
- **前端階段(9-11)的紅綠 oracle 是本地 vitest**,紅燈 commit 不單獨
  推送——推上去只會弄紅 unit-tests 軌,證據就是 commit 歷史(test(red)
  → feat)加 commit message 裡的本地紅綠紀錄。

- **環境限制(階段 1 起適用全案)**:web session 沙箱無法起本機
  supabase(docker registry 的 blob CDN 被閘道擋,`supabase start` 拉不到
  image;jsr.io 也 403)。SOP 的「本機 `deno task test` 確認紅/綠」改為
  **CI api-tests 軌當紅綠燈 oracle**:紅燈 commit 單獨推送讓 CI 跑紅
  (= 紅燈證據,run 連結記在階段表),綠燈 commit 隨後推、看同軌轉綠。
  代價是每輪紅綠各等一次 CI(約 3-4 分鐘),換到的是與 SOP 等價的證據鏈。

- **階段 12 觸發逃生口 1(一寫就綠)**:四契約回歸 feature 驗的是階段
  9-11 已實作的行為,本質是回歸固定而非新行為驅動——無紅燈相位,直接
  以 `test:` commit(`3d2dc13`)落地;本地 4/4 綠、全套 e2e 172/172 綠。
- 預期可能觸發「逃生口 1(紅燈測試一寫就綠)」的地方:plan.md 的 AC-5
  (補繳每筆都發三代獎金、任務不 +1)是既有行為,**階段 4**(後端拆守衛)
  的相關斷言很可能直接綠。屆時記錄於此並跳過,**不要為了製造紅燈去改動
  `pay_referral_generations`**。

## 框架摩擦

- **CI 有 concurrency cancel-in-progress**:同分支新 push 會取消進行中的
  run(階段 4 綠燈 head `454028e` 的 `ci-ok` 紅就是取消殘影——RESULTS 裡
  兩個 `cancelled`,非真失敗)。應對:每階段的紅燈 push 前先等上一個 run
  收斂;或接受「下一個 run 的 log 同時佐證前一階段」的讀法(紅燈 run 裡
  前一階段的測試全綠即為佐證),本包從階段 4 起採後者並記於階段表。
- 階段 2 綠燈後 CI 的 framework-check 紅:plan 把規格書 §8.4 分類表
  加列排在階段 13,但 `check-spec-drift.py` 在**每次 CI** 比對
  `REWARD_SOURCE_CATEGORIES` 與 §8.4——契約加了 `ledger_reset`、規格書
  沒加就紅。已把 §8.4 那一列(含 docstring「帳本事件」軸措辭)**提前到
  階段 2** 完成;階段 13 清單裡的「§8.4 加一列」項目視為已完成。
  **可複用的教訓:凡是被機械閘門(spec-drift)盯住的規格書段落,必須跟
  觸發它的程式碼改動放在同一個 commit,不能排到後面的收尾階段**——
  規劃時「文件統一收尾」的直覺與逐 commit 機械把關互斥,以後切階段時
  把這類項目直接併進對應的程式碼階段。

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
