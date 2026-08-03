# renewal-rewards-automation-test 規劃書

## 0. 一句話

把 renewal-backfill 機制核對用的「阿凱的七年」時間軸例子,固化成 journey
層的 GUI 自動化測試(全程像使用者一樣在 web 上點選、打真後端),讓
M1–M8 規則的**組合行為**有一道跑真資料連動的回歸防線——單元層
(`backfill-cases.ts`、Deno api tests)驗的是單條規則,這裡驗的是規則
交織後的長程劇本。

## 1. 使用者需求

- 規則依據:`docs/plans/upline-pairing-lines/rules.md` M1–M8(單一事實
  來源,已含 2026-08-02 全部裁決);規格書 §5.1/§6.2/§7.4/§8.4/§9.2/§10.3
  (abe5b25 已同步)。原始例子只存在於當時的對話,repo 內僅 rules.md 留有
  核對點清單——本規劃書依 rules.md **逐條引規則編號重建**時間軸(§2 章節
  表),重建版與原始版的一致性列為開放問題 #1 請人裁決。
- 故事:nightly(與晉升 PR)自動重演七年劇本;任何動到續約/獎勵/任務
  規則的改動若破壞組合行為,隔天紅燈。
- 不做:不動任何產品碼(`src/**`、`supabase/functions/**` 零改動;若測出
  bug 走 `/fix-bug` 另開分支);不測「另一包」尚未實作的目標行為(M4 樹
  結構、M6 走訪、M7 樹檢查——現況與目標相反,見開放問題 #2);不重測
  A11(P 失效 fallback 已由 `fresh-default-referrer.test.ts` 在 DB 層覆蓋,
  且「告警」無 GUI 落點);不做 mocked e2e 薄片(`renewal_backfill_recovery.feature`
  已涵蓋該層 UI 切片)。

### 擺放位置(本規劃的第二個問題)

| 候選 | GUI? | 真連動? | 判定 |
|---|---|---|---|
| `e2e/`(mocked) | ✅ | ❌ mock 後端,驗不到帳本/樹/任務真連動 | 不合 |
| Deno `api/*.test.ts` | ❌ | ✅ | 不合(需求明言 GUI) |
| **`e2e/journey/`** | ✅ | ✅ 真 Supabase 分支+時光機既有 | **採用** |

落點:`e2e/journey/features/70_renewal_saga.feature`(+`steps/f70_renewal_saga_steps.py`、
`orgchart-saga.yaml`)。編號 70 接在 60 之後:saga 會反覆改自己 cast 的
效期與帳本,依「§6 先跑、§7 後跑」同一理由排最後。feature 檔從此成為
「阿凱的七年」的**永久編碼**(程式碼與測試才是真相);rules.md 的跨包
存活義務不因此解除(M4/M6/M7「另一包」節仍只落腳該檔)。

## 2. 系統設計

### 2.1 演員(獨立 cast,絕不碰 30 人主樹)

`orgchart-saga.yaml`:U1(上線甲/A 樹)、U2(上線乙/B 樹)、K0(主角
阿凱)、W1(A 樹時期下線)、W2(B 樹時期下線)——5 人全走 GUI 建置,
RUN_ID 圈定。P = 平台預設推薦人,由 harness 健檢確認存在(A12 `/health`
已回報此態),不另建。

### 2.2 時間軸章節表(重建版;【】內為斷言引用的規則編號)

原則沿用 §7 時光機:**資料是種的,行為斷言是真的**——GUI 動作永遠發生
在「現在」,章節間的歲月流逝用 service-role 把 RUN_ID 資料往回平移。

| 章 | 佈置(時光機) | GUI 動作 | 斷言 |
|---|---|---|---|
| 1 首購 | — | U1、U2 不填碼首購;K0 填 U1 碼首購 | U1/U2 上代=P 且 `is_default`【A10 首購】;K0 訂閱中;U1 +100(gen1)、任務 1/8【M3/M6/M7】 |
| 2 A 樹下線 | — | W1 填 K0 碼首購 | K0 +100、任務 1/8;U1 +100(gen2)【M6/M7】 |
| 3 補繳 extend | K0 推入過期超過一年(-400 天) | K0 開付款頁:extend 卡揭露 2 筆/2,400;**逐筆付 2 次**(補繳進度頁) | 迄日=原迄日+2 年(接續非付款日)【M2】;上代仍 U1【M3】;U1 續約獎 +200(每筆各發)【M6/A9】;U1 任務不 +1【M7 pair-history】 |
| 4 fresh 換樹清空 | K0 推入剛過期(-30 天) | K0 選 fresh 填 U2 碼:A14 揭露具體 forfeit 數字、A15 二次確認、付款 | 上代=U2;帳本歸零、明細現 `ledger_reset` 沖銷列【M5/§8.4】;任務進度 0;迄日=付款日+1 年;(現況)W1 隨遷——標記「另一包」反轉點【M4,開放問題 #2】 |
| 5 B 樹下線 | — | W2 填 K0 碼首購 | K0 +100、任務 1/8(W2 首見);U2 +100(gen2)【M6/M7】 |
| 6 Q9 擋 fresh | 種 K0 點數至 ≥1,015(RUN_ID 標記) | K0(active)完成身分驗證+證件照、申請提領 1,000 → pending;時光機推 K0 剛過期;開付款頁 | fresh 被擋,文案「請等待審核完成,或聯繫客服」【M5/Q9/§10.3】;admin 駁回提領(點數退回)後 fresh 恢復可選 |
| 7 S9+Q14a | K0 當月桶平移至上月;W2 推入剛過期 | K0 選 fresh **填現任上代 U2 的碼**+二次確認+付款;W2 補繳一筆 | 樹不變、帳本第二次歸零【S9/M5】;W2 續約:K0 +100(獎照發)**但任務不 +1**(歷史桶跨清空保留)【M6/M8/Q14a】 |
| 8 credit 與 A8 | 種一張 unclaimed 推薦王 credit 給 K0;K0 推入剛過期 | K0 嘗試領取 → 被擋;補繳一筆恢復 active;領取 credit | 過期不能領【A8】;領取後訂閱**列數不變**、迄日=現迄日+1 年(改現有列)【M2 第三路徑】;U2 +100(任務續約也發)、U2 任務不 +1(免費續約)【M6/M7】 |
| 9 A10 fresh 版 | W1 推入剛過期 | W1 選 fresh **不填碼**付款 | W1 上代=P、`is_default`;W1 帳本清空【A10/M5】 |
| 10 終章對帳 | — | K0 開獎勵頁/明細/任務頁 | 明細分類軸對帳:`referral_signup`/`referral_renewal`(含「任務免費續約」註記)/`ledger_reset` 各就各位;餘額與任務進度等於章節推導值【§8.4】 |

各章的具名預期數字(帳本推導表)由 steps 依 run state 推導、feature 檔
寫死並附推導註解——與 `orgchart.yaml` 的 `expected_rewards` 同一模式。

### 2.3 時光機擴充(`tools/seed_time_machine.py`)

既有原語只平移「單一使用者最新一筆訂閱的 end_date」。新增:

- `age_monthly_bucket(user, months_back)`:把 `monthly_referrals` 當月桶的
  month_key 往回平移——沒有它,第 7 章的 Q14a 斷言會被「同月去重」假綠
  掩蓋,證不到「跨清空」;
- `seed_reward_points(user, amount)`:種 RUN_ID 標記的獎勵列(第 6 章
  提領門檻用,來源見開放問題 #4);
- `seed_unclaimed_king_credit(user)`:種 unclaimed 推薦王 credit(第 8 章,
  發放路徑已由 `30_tasks.feature` 以真 8 人覆蓋,saga 只驗 claim 連動,
  見開放問題 #3)。

純日期/月鍵計算拆成可離線測的函式(`cd e2e/journey && pytest tools/`)。

### 2.4 API/資料庫變更

無。全部是測試碼與 service-role 種子,僅作用於拋棄式 journey 分支。

## 3. 架構影響

- journey 套件內純加法:一個 feature、一個 steps、一個 cast 宣告、時光機
  三個新原語;共用既有 page objects、builder、付款雙模式、cleanup(RUN_ID
  圈定天然涵蓋 saga cast;`referral_king_rewards` 已在刪除序中)。
- 執行順序:pytest order 排在 60 之後;saga cast 與主樹零交集,§6 帳本
  斷言不受污染。
- CI:nightly 全套自動涵蓋(估 +8–12 分,見開放問題 #5);晉升 PR 的
  journey 全套同樣自動涵蓋;journey-smoke 維持 1 人骨架不納入。
- 文件同步(收尾階段):`docs/e2e-journey-test-design.md` §6/§10/§13 補
  70_ 條目、`e2e/journey/README.md`。

## 4. UI/UX

不動任何 UI。測試消費既有頁面:PaymentCheckout 雙模式卡(A14 揭露、
A15 二次確認)、PaymentResult 補繳進度、RewardHistory 分類軸、任務頁、
提領/證件流程、admin 提領管理。若斷言過程發現 UI 與規格不符,回報走
`/fix-bug`,不在本包夾帶修改。

## 5. 階段切分(每階段 = 一個紅綠循環)

journey 絕不本機跑:紅 = collect 錯或 dispatch 紅;綠 = `workflow_dispatch`
(`feature_filter=70`,webhook 付款模式)綠,run 連結記入 progress.md。
離線可驗的(tools 純函式、collect-only)照常本機紅綠。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 時光機三原語(月桶平移/點數種子/credit 種子),純函式拆離 | `e2e/journey/tools/` 離線測試 | `pytest tools/ -q` 綠;collect-only 綠 |
| 2 | saga cast 宣告+builder 接線+P 健檢;feature 第 1–2 章 | `70_renewal_saga.feature` ch1–2 | dispatch 綠:5 人建樹+首購/下線斷言 |
| 3 | 第 3–4 章(補繳 extend、fresh 清空+A14/A15) | 同上 ch3–4 | dispatch 綠:接續迄日、每筆發獎、`ledger_reset` 明細 |
| 4 | 第 5–7 章(B 樹、Q9 擋 fresh、S9+Q14a) | 同上 ch5–7 | dispatch 綠:含 admin 駁回支線與月桶平移 |
| 5 | 第 8–10 章(credit/A8、A10-fresh、終章對帳) | 同上 ch8–10 | dispatch 全 70_ 綠 |
| 6 | 收尾:nightly 全套一次綠、設計文件同步、命名/收集檢查 | framework-check、check-test-names、journey-offline | nightly dispatch 全綠;`npm run check` 綠 |

## 6. 開放問題(逃生口)

- [ ] **#1 重建時間軸 vs 原始「阿凱的七年」**:原對話不在 git,無從機械
  比對。§2.2 已逐條引 M1–M8 驗算;請人核對章節表是否等價於當初確認的
  例子(不一致時以 rules.md 驗算為準——例子本就是規則的核對工具)。
- [ ] **#2「另一包」相關核對點**(B 樹下線永屬 B 樹/發獎跳過空缺/換回
  歸位):現況行為相反。(a) 完全不斷言,留 TODO;(b) 斷言**現況**
  (W1 隨遷)並在情境名與註解標記「另一包上線時反轉」——循 abe5b25
  「journey 三檔反轉」先例。**建議 (b)**:現況也值得防守,反轉點有明確
  清單。
- [ ] **#3 推薦王 credit 取得方式**:種 credit(建議——發放已由
  `30_tasks` 以真 8 人覆蓋,saga 補的是 claim 的獎勵/任務連動與 A8)
  vs 再建 8 名直推(+8 GUI 使用者、約 +4 分)。
- [ ] **#4 Q9 章的點數來源**:種點數列(建議,RUN_ID 標記、終章對帳把
  種子額列入推導)vs 建 11+ 名下線湊 1,015P(成本過高)。
- [ ] **#5 nightly 預算**:+8–12 分(5 人建置+10 章+3 次補繳付款)是否
  可接受?不可接受的降級選項:70_ 僅在週日全套與晉升 PR 跑。
- [ ] **#6 slug 與分支**:實作若沿用本 web session 的 `claude/*` 分支則
  守衛不查規劃檔;若人工另開分支,依約用 `feature/renewal-rewards-automation-test`
  (= 本目錄名)。

## 7. 風險與回滾

- 純測試碼,零產品碼——最壞情況是 nightly 變慢或 saga flaky。回滾 =
  `feature_filter` 排除 70_(一行),或 revert PR;flaky 個案走既有
  `@quarantine` 機制。
- 時光機新原語只在拋棄式分支執行,正式環境無任何路徑觸及(沿用既有
  模組的防線與敘述)。
- 章節劇本是長鏈,前章紅會連坐後章:各章 Background 以 run state 快照
  自檢前置條件,fail-fast 並在報告標明「斷鏈於第 N 章」,避免一紅十紅
  的誤導。
