# renewal-rewards-automation-test 規劃書(第 3 版)

第 1→2 版:處置第 1 輪審查 P0×1(階段驗證引用不存在的 CI 輸入)與事實性
P1×12/P2×7。第 2→3 版:處置第 2 輪審查 P0×1(階段 0 需連動修 journey.yml
的 MARKER 與最低情境數防線)、P1×6(ch1 active 真實 GUI 訊號、任務斷言
機制、P 身分解析、ch7 U2 gen2、M1 失效上線收獎、#2c B 樹永屬)與 P2×6。
詳 `./review.md`。規模取捨與開放問題仍留人審。

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
  已涵蓋該層 UI 切片)。M1「active 期間不能付款」的負向路徑**納入**
  第 1 章廉價斷言(一格),不另立章節。

### 擺放位置(本規劃的第二個問題)

| 候選 | GUI? | 真連動? | 判定 |
|---|---|---|---|
| `e2e/`(mocked) | ✅ | ❌ mock 後端,驗不到帳本/樹/任務真連動 | 不合 |
| Deno `api/*.test.ts` | ❌ | ✅ | 不合(需求明言 GUI) |
| **`e2e/journey/`** | ✅ | ✅ 真 Supabase 分支+時光機既有 | **採用** |

落點:`e2e/journey/features/70_renewal_saga.feature`(+`steps/f70_renewal_saga_steps.py`、
`orgchart-saga.yaml`)。編號 70 接在 60 之後(journey 實際排序 = 檔名
字母序,70 天然落在 60 與 90 之間):saga 會反覆改自己 cast 的效期與
帳本,依「§6 先跑、§7 後跑」同一理由殿後。feature 檔從此成為「阿凱的
七年」的**永久編碼**(程式碼與測試才是真相);rules.md 的跨包存活義務
不因此解除(M4/M6/M7「另一包」節仍只落腳該檔)。

## 2. 系統設計

### 2.1 演員(獨立 cast,絕不碰 30 人主樹)

`orgchart-saga.yaml`:U1(上線甲/A 樹)、U2(上線乙/B 樹)、K0(主角
阿凱)、W1(A 樹時期下線)、W2(B 樹時期下線)、X1(W2 的下線,
**第 5 章才加入**——用途:讓 fresh 改樹**之後**存在一條鏈深 3 的首購,
gen3 落在 saga 自有演員 U2 身上,補「M6×M4/M5 組合」)——6 人全走 GUI
建置,RUN_ID 圈定。

- **P**(平台預設推薦人):harness 健檢確認存在(A12,見附錄),不另建。
  ⚠️ P 是跨 feature 共用 fixture(10_org 的主樹也往 P 疊資料),對 P 的
  獎勵斷言一律用 **delta**(事件前後差額,service-role 讀取),不斷言
  絕對值。
- **admin**:沿用既有 `管理員帳號已完成 bootstrap` Given
  (`steps/conftest.py` 的 `ensure_admin`,冪等),於第 6 章走 **GUI**
  駁回提領。嚴禁 service-role 直改 `withdrawals.status` 抄捷徑——那會
  繞過退點邏輯與 admin 授權路徑,喪失該格斷言的意義。
- **雙根注意**:U1、U2 皆「不填碼首購」= 兩個根,`tools/orgchart.py::load_nodes()`
  的單根不變量會 `ValueError`——saga **不走** `load_nodes()`/`org_builder`
  整條管線,cast 由 f70 steps 自帶的小型載入器依 `orgchart-saga.yaml`
  順序建置,只共用 registration/payment builder 層與 page objects。

### 2.2 時間軸章節表(重建版;【】內為斷言引用的規則編號)

原則沿用 §7 時光機:**資料是種的,行為斷言是真的**——GUI 動作永遠發生
在「現在」,章節間的歲月流逝用 service-role 把 RUN_ID 資料往回平移。
標【DB】的子句走 service-role 直查(無 GUI 落點),其餘皆 GUI 斷言。
**斷言通道約定**:「任務 X/8」「任務不 +1」一律由**該演員本人登入**
任務頁斷言(admin 查詢台無任務欄位;演員各自登入本就是 journey 常態,
登入切換成本已計入 §3 預算);他人的**獎勵金額**子句走 admin 查詢台
(會員詳情)或【DB】delta;「上代=P」的名稱比對用 §2.3 的 P 身分解析
helper 取得預期值。

| 章 | 佈置(時光機) | GUI 動作 | 斷言 |
|---|---|---|---|
| 1 首購 | — | U1、U2 不填碼首購;K0 填 U1 碼首購;K0(active)再開 `/payment/checkout` | U1/U2 上代=P(admin 查詢台)、`is_default`【DB】【A10 首購】;K0 訂閱中;U1 +100(gen1)、任務 1/8;P 對 U1/U2/K0 事件的 delta 合計 +300(gen1×2+gen2×1)【DB】【M3/M6/M7】;active 開付款頁 → **被自動導回 `/dashboard`、顯示「訂閱中」徽章**(付款頁不渲染;`resolveCheckoutPageRedirect` 現況)【M1】 |
| 2 A 樹下線 | — | W1 填 K0 碼首購 | K0 +100、任務 1/8;U1 +100(gen2);P delta +100(gen3)【DB】【M6/M7】 |
| 3 補繳 extend | K0 推入過期超過一年(-400 天);**U1 推入剛過期** | K0 開付款頁:extend 卡揭露 2 筆/2,400;**逐筆付 2 次**(補繳進度頁) | 迄日=原迄日+2 年(接續非付款日)【M2】;上代仍 U1【M3】;U1 續約獎 +200(每筆各發)——**且 U1 此刻 expired,獎照入帳**(失效上線不擋獎)【M1/M6/A9】;U1 任務不 +1【M7 pair-history】 |
| 4 fresh 換樹清空 | K0 推入剛過期(-30 天) | K0 選 fresh 填 U2 碼:A14 揭露具體 forfeit 數字、A15 二次確認、付款 | 上代=U2;K0 帳本歸零、明細現「新約重置」列(`ledger_reset`)【M5/§8.4】;K0 任務進度 0;迄日=付款日+1 年;**U2 +100(gen1,首次配對)、U2 任務 1/8**【M6/M7】;(現況)W1 隨遷——標記「另一包」反轉點【M4,開放問題 #2a】 |
| 5 B 樹下線 | — | W2 填 K0 碼首購;**X1 填 W2 碼首購** | W2 事件:K0 +100、任務 1/8(W2 首見);U2 +100(gen2)。X1 事件:W2 +100、任務 1/8;K0 +100(gen2);**U2 +100(gen3)——fresh 改樹後三代走訪正確**【M6×M4/M5 組合/M7】 |
| 6 Q9 擋 fresh | 種 K0 點數至 ≥1,015(RUN_ID 標記) | K0(active)完成身分驗證+證件照、申請提領 1,000 → pending;時光機推 K0 剛過期;**開付款頁(駁回前)**;admin 走 GUI 駁回該筆提領;**K0 再開付款頁(駁回後複驗)** | 駁回前:fresh 被擋,文案「請等待審核完成,或聯繫客服」【M5/Q9/§10.3】;駁回(點數退回)後:fresh 恢復可選 |
| 7 S9+Q14a | K0 當月桶 key 平移至上月(讀現有 key 平移,見 §2.3);W2 推入剛過期。**前提:K0 仍處第 6 章推入的過期狀態(Q9 擋下未消耗)——勿「順手」復原** | K0 選 fresh **填現任上代 U2 的碼**+二次確認+付款;W2 補繳一筆 | 樹不變、K0 帳本第二次歸零【S9/M5】;**K0 的 S9 付款:U2 +100(gen1,每筆事件都發;任務不 +1,已配對)**【M6/M7】;W2 續約:K0 +100(獎照發)**但任務不 +1**(歷史桶跨清空保留)、**U2 +100(gen2,W2→K0→U2 鏈)**【M6/M8/Q14a】 |
| 8 credit 與 A8 | 種一張 unclaimed 推薦王 credit 給 K0;K0 推入剛過期 | K0 嘗試領取 → 被擋;補繳一筆恢復 active;領取 credit | 過期不能領【A8】;領取後迄日=現迄日+1 年(GUI)且訂閱**列數不變**(改現有列)【DB】【M2 第三路徑】;**U2 +200——補繳(`subscription_id` 鍵)與 claim(`source_claim_id` 鍵)是兩個事件、各發一輪**;U2 任務不 +1(免費續約)【M6/M7】 |
| 9 A10 fresh 版 | W1 推入剛過期 | W1 選 fresh **不填碼**付款 | W1 上代=P(admin 查詢台)、`is_default`【DB】;W1 帳本清空【A10/M5】 |
| 10 終章對帳 | — | K0 開獎勵頁/明細/任務頁 | 明細分類軸對帳:`referral_signup`/`referral_renewal`(含「任務免費續約」註記)/「新約重置」各就各位;餘額與任務進度等於章節推導值【§8.4】 |

各章的具名預期數字(帳本推導表)由 steps 依 run state 推導、feature 檔
寫死並附推導註解——與 `orgchart.yaml` 的 `expected_rewards` 同一模式。
章節是長鏈:各章 Background 以 run state 快照自檢前置條件(含第 7 章的
「K0 仍過期」),fail-fast 並標明「斷鏈於第 N 章」。

### 2.3 時光機擴充(`tools/seed_time_machine.py`)

既有原語只平移「單一使用者最新一筆訂閱的 end_date」。新增:

- `age_monthly_bucket(user, months_back)`:平移 `monthly_referrals` 的
  月桶 key。**實作準則:直接讀該使用者現有的 key 逐一平移,不自行推算
  「現在的月份」**——production 月鍵一律 `Asia/Taipei` 的 'YYYY-MM'
  (`tw-dates.ts`),Python 側自算時區月份若與 DB 不一致,對不存在的 key
  平移是靜默 no-op,Q14a 斷言會假綠(第 7 章存在的理由就是防這個)。
  **目的地 key 已有資料時 append 合併、不整把覆寫**——run 恰好跨真實
  月界時整把覆寫會靜默吃掉歷史桶,打穿 M8 這個本章要驗的保證;
- `seed_reward_points(user, amount)`:種 RUN_ID 標記的獎勵列(第 6 章
  提領門檻用,取捨見開放問題 #4);
- `seed_unclaimed_king_credit(user)`:種 unclaimed 推薦王 credit(第 8
  章;發放路徑已由 `30_tasks.feature` 以真 8 人覆蓋,取捨見開放問題 #3);
- `resolve_default_referrer_identity()`:讀 `reward_config.default_referrer_code`
  → `referral_codes`/`profiles` 解析 P 的 user_id 與顯示名——「上代=P」
  的 admin 查詢台名稱比對需要預期值,A12 `/health` 只回三態 enum 不含
  身分,此 helper 目前不存在,須新增。

月鍵/日期計算的純函式部分拆離,離線測試(`cd e2e/journey && pytest tools/`);
DB 寫入行為只能由階段 2+ 的 dispatch 驗證(見 §5)。

### 2.4 產品碼/基礎設施變更

產品碼(`src/**`、`supabase/functions/**`、migrations)**零變更**。
測試基礎設施兩處小改(階段 0):

- `e2e/journey/pytest.ini`:登記 `renewal_saga` marker;
- `.github/workflows/journey.yml` + `journey-scheduled.yml`:新增可選
  `pytest_expr` 輸入(傳給 `-m`/`-k`),**並連動兩段既有邏輯**:
  (a) `MARKER` 計算目前只認 `SCOPE=skeleton`,須讓 `pytest_expr` 有值時
  取代/併入;(b)「斷言 journey 真的跑了」的最低情境數 floor 目前只有
  `MIN_SKELETON=1`/`MIN_FULL=20` 兩態,窄選 dispatch 必被判「未執行」
  而紅——須加第三態(`pytest_expr` 非空時用低 floor,實作取捨:
  `MIN_FILTERED` 或 `floor=1`,階段 0 內定案)。**不動這兩段,階段 0
  自己的驗收標準就不可能達成**(2026-07-21 假綠事故後加的防線會誤殺
  合法窄選)。改動遵循 `.claude/rules/github-actions.md`,
  `python3 scripts/check-workflows.py` 把關(注意它不查此語意,靠階段 0
  的 60_ 實測驗收)。施工提醒(第 3 輪覆核):(i) CLI 的 `-m` 整段蓋掉
  ini 的 `-m "not seed"`——窄選表達式須確認與 `@seed` 互斥(或明寫
  `... and not seed`);(ii) 階段 0 驗收時記錄 narrow dispatch 該搭配
  哪個 `scope` 值,避免搭 `full` 白付 30 人建置成本;(iii) `pytest_expr`
  input 型別為自由字串,非 choice。

## 3. 架構影響

- journey 套件內純加法:一個 feature、一個 steps、一個 cast 宣告、時光機
  四個新原語;共用 registration/payment builder 與 page objects——但
  **A14/A15 揭露、二次確認、補繳逐筆循環的 page object 方法是新寫**
  (全套件零 GUI 先例,f60 只切換過 extend/fresh 單選),非既有共用;
  **不走** `org_builder`/`load_nodes()` 管線(見 §2.1 雙根注意;f60 的
  scratch 使用者已有同型先例)。正式站封鎖安全網在 conftest 的全域
  `guarded_page` fixture,與 org_builder 無關,saga 沿用即可,不需自建。
  cleanup 靠 RUN_ID email 前綴天然涵蓋(`RESIDUE_TABLES` 已含
  `referral_king_rewards`)。
- 執行順序:檔名字母序,70 落在 60 與 90 之間,無需額外排序設施。
- CI:nightly 全套自動涵蓋(估 **+10–15 分**:7 人 GUI 建置+10 章+4 次
  補繳/續約付款+各章演員登入切換,見開放問題 #5);晉升 PR 的 journey
  全套同樣自動涵蓋。**目前沒有 PR 層級的 journey 軌**(ci.yml 只有
  journey-offline 與 base=main 的 journey-full;設計文件 §11 的
  journey-smoke 未落地),本包不新增。階段迭代用
  `workflow_dispatch(pytest_expr='-m renewal_saga')` 單獨跑本 feature。
- 文件同步(收尾階段):`docs/e2e-journey-test-design.md` **§6/§7(時光機
  原語)/§10/§11(CI 預算)/§13** 補 70_ 條目,**並訂正 §11.5 的過時
  敘述**(`feature_filter`/`reuse_tree`/`journey-nightly.yml` 從未落地,
  正是第 1 輪 P0 的誤導源——改寫為實際的 `pytest_expr` 機制與
  `journey.yml`/`journey-scheduled.yml` 檔名);`e2e/journey/README.md`。

## 4. UI/UX

不動任何 UI。測試消費既有頁面:PaymentCheckout 雙模式卡(A14 揭露
`fresh-forfeit-disclosure`、A15 二次確認 `fresh-confirm-dialog`)、
PaymentResult 補繳進度(`payment-result-backfill-progress`)、RewardHistory
分類軸(畫面字樣「新約重置」/「任務免費續約」,對照 `REWARD_SOURCE_LABELS`)、
任務卡 `X / 8` 進度、提領三步驟流程、admin 提領管理「退件」(不受
isDesktop 鎖,journey 桌面 viewport 可用)與 admin 會員查詢台「推薦人」
欄。若斷言過程發現 UI 與規格不符,回報走 `/fix-bug`,不在本包夾帶修改。

## 5. 階段切分(每階段 = 一個紅綠循環)

journey 絕不本機跑:紅 = collect 錯或 dispatch 紅;綠 = `workflow_dispatch`
(`pytest_expr='-m renewal_saga'`,webhook 付款模式)綠,run 連結記入
progress.md。離線可驗的(tools 純函式、collect-only)照常本機紅綠。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 0 | CI 前置:`renewal_saga` marker + `pytest_expr` dispatch 輸入 + **MARKER/floor 連動修改**(§2.4) | `check-workflows.py`、journey-offline 軌 | dispatch 帶表達式可只跑指定 feature 且不被最低情境數防線誤殺(以既有 60_ 的 `-m timemachine` 實測驗證);全套/skeleton 兩軌行為不變 |
| 1 | 時光機四原語(§2.3)——月鍵/日期**純函式**離線紅綠;DB 寫入部分行為留待階段 2+ | `e2e/journey/tools/` 離線測試 | `pytest tools/ -q` 綠;collect-only 綠 |
| 2 | saga cast 宣告+小型載入器+P/admin 健檢;feature 第 1–2 章 | `70_renewal_saga.feature` ch1–2 | dispatch 綠:6 人建置與首購/下線/gen3-delta 斷言 |
| 3 | 第 3–4 章(補繳 extend、fresh 清空+A14/A15+U2 首次配對) | 同上 ch3–4 | dispatch 綠:接續迄日、每筆發獎、「新約重置」明細 |
| 4 | 第 5–7 章(B 樹+X1 gen3、Q9 擋 fresh+admin 駁回、S9+Q14a) | 同上 ch5–7 | dispatch 綠:含月桶平移生效驗證(平移後 key 存在性自檢) |
| 5 | 第 8–10 章(credit/A8 雙事件雙發獎、A10-fresh、終章對帳) | 同上 ch8–10 | dispatch 全 70_ 綠 |
| 6 | 收尾:nightly 全套一次綠、文件同步(§3 清單)、命名/收集檢查 | framework-check、check-test-names、journey-offline | nightly dispatch 全綠;`npm run check` 綠 |

## 6. 開放問題(逃生口)

- [ ] **#1 重建時間軸 vs 原始「阿凱的七年」**:原對話不在 git,無從機械
  比對。§2.2 已逐條引 M1–M8 驗算;請人核對章節表是否等價於當初確認的
  例子(不一致時以 rules.md 驗算為準——例子本就是規則的核對工具)。
  **核對範圍請含:第 1 輪補上的 U2 側斷言(ch4/ch7/ch8)、X1/gen3、
  A11 的排除是否可接受、#2c「B 樹永屬」的缺位是否可接受。**
- [ ] **#2a W1 隨遷(M4 現況)**:(a) 不斷言留 TODO;(b) 斷言**現況**
  並在情境名與註解標記「另一包上線時反轉」——循 abe5b25「journey 三檔
  反轉」先例(聚合時已以 `git show` 核實該 commit 存在)。**建議 (b)**。
- [ ] **#2b「換回歸位」「發獎跳過空缺不遞補」**:十章內**沒有情境可掛載**
  (K0 只單向 U1→U2,從未換回;現況架構無「空缺」可觀察)。(a) 誠實
  留 TODO,隨另一包的 plan 補章節(**建議**——這兩點的目標行為本就
  屬另一包);(b) 本包加「K0 fresh 填回 U1」章節,先掛現況斷言。
- [ ] **#2c「B 樹時期招的下線永屬 B 樹」**(rules.md 核對點之一):驗證
  它需要 K0 **第二次換線**(換回 U1 或第三樹)後觀察 W2/X1 歸屬,且
  「永屬」的目標語意依賴 M4(另一包);現況(edges 走訪)下 W2/X1 會
  跟著 K0 搬。與 #2b 同性質:**建議留 TODO 隨另一包補**,裁決同 #2b。
- [ ] **#3 推薦王 credit 取得方式**:種 credit vs 再建 8 名直推(+8 GUI
  使用者、約 +4 分)。**講白取捨**:選「種」= 本測試**不再重演**「這張
  credit 是當月滿 8 人賺來的」這段 GUI 起源,只驗 claim 之後的下游連動
  (發放路徑由 `30_tasks` 真 8 人覆蓋)。**建議種**,但請在完整資訊下裁決。
- [ ] **#4 Q9 章的點數來源**:種點數列 vs 建 11+ 名下線湊 1,015P。同上
  講白:選「種」= 「這 1,015 點怎麼賺來的」不在本測試重演範圍(累積
  路徑由 20_referral_rewards 覆蓋),只驗提領 pending 對 fresh 的封鎖。
  **建議種**(11 人成本過高)。
- [ ] **#5 nightly 預算**:+10–15 分(7 人建置+10 章+4 次付款事件+各章
  演員登入切換)是否可接受?不可接受的降級選項:70_ 僅在週日全套與
  晉升 PR 跑(以 marker 排除於平日 nightly)。
- [ ] **#6 slug 與分支**:實作若沿用本 web session 的 `claude/*` 分支則
  守衛不查規劃檔;若人工另開分支,依約用 `feature/renewal-rewards-automation-test`
  (= 本目錄名)。

## 7. 風險與回滾

- 純測試碼+兩處測試基礎設施小改,零產品碼——最壞情況是 nightly 變慢或
  saga flaky。回滾 = dispatch/nightly 以 `-m 'not seed and not renewal_saga'`
  排除(CLI 的 `-m` 會**整個取代** ini 的 `-m "not seed"` 預設,漏寫
  `not seed` 會把 90_ 的 seed 情境放進來白燒 CI;`@quarantine` 機制尚未
  落地,全庫零命中,不作為依賴),或 revert PR。
- 時光機新原語只在拋棄式分支執行,正式環境無任何路徑觸及(沿用既有
  模組的防線與敘述);月桶平移以「讀現有 key」為準則,自帶存在性自檢,
  防靜默 no-op。
- 章節劇本是長鏈,前章紅會連坐後章:各章 Background 以 run state 快照
  自檢前置條件,fail-fast 並在報告標明「斷鏈於第 N 章」,避免一紅十紅
  的誤導。

## 附錄:A 系列標籤索引(rules.md 只定義到 A11,以下補查閱路徑)

原始定義在 `git show f1fa08c^:docs/plans/renewal-backfill/plan.md`;
現行落點:

- **A12**:`/health` 回報預設推薦人三態(`supabase/functions/api/index.ts`
  的 health 端點、`health-default-referrer.test.ts`)。
- **A14**:fresh 清空前揭露具體數字(`freshForfeitPoints`/`freshForfeitReferrals`,
  PaymentCheckout `fresh-forfeit-disclosure`;規格書 §6.2)。
- **A15**:補繳中途改選 fresh 的二次確認(PaymentCheckout
  `fresh-confirm-dialog`;規格書 §6.2)。
