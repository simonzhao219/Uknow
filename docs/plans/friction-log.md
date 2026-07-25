# Friction Log — 框架 Meta 迴路的單一彙整點

框架運行中的摩擦一律記在這裡（不散在各 feature 的 progress.md）。
整併觸發：每完成 2 個 feature 或每雙週，擇先到者——整併產物是框架修訂 PR。
「CI 未攔、journey/使用者才發現」的缺陷也記在這裡：此計數連續兩期上升，
即為啟用 claude-code-action 雲端 PR review 的觸發條件（見框架設計 v2 決策表）。

格式：日期｜類別（存量債/誤擋/漏網/待裁決）｜描述｜處置

---

## 2026-07-25｜存量債｜biome 導入時降為 warn 的規則

導入 biome 時 error 歸零的手段是把「需人工判斷的存量問題」降級 warn：

| 規則 | 數量 | 風險 |
|---|---|---|
| useExhaustiveDependencies | 82 | hooks 依賴不全，可能 stale closure |
| noExplicitAny | 60 | 型別漏洞 |
| noUnusedVariables / FunctionParameters | 28 | 死碼氣味 |
| useButtonType | 13 | 按鈕在 form 內誤觸 submit |
| noArrayIndexKey | 10 | 列表重排時 state 錯位 |
| noSvgWithoutTitle / useSemanticElements | 9 | a11y |
| noNonNullAssertion | 8 | 執行期 null 風險 |

償還方式：碰到該檔案就順手修該檔案的 warning（童子軍原則），不開專案式大掃除。

## 2026-07-25｜已裁決｜ReferralCodeCard / ReferralGuide 已建未接線 → 刪除

`src/components/referral/ReferralCodeCard.tsx` 與 `ReferralGuide.tsx` 只被
`ServiceProviderDetail.tsx` 的 dead import 引用（從未渲染）。biome 清 unused
imports 後成為孤兒、knip 閘門要求處置。
**人審裁決（2026-07-25）：刪除**——已隨框架 PR 移除（git 歷史可找回）。

## 2026-07-25｜誤擋（已修）｜pre-commit 的 deno 閘門擋住 merge commit

框架 PR 合併 develop 時，上游 commit 帶進 `supabase/functions/**` 變更，
pre-commit 的「後端有改但本機無 deno → 擋」規則觸發，**無法完成合併**
（沒裝 deno 的容器等於無法解任何含後端檔案的衝突＝死鎖）。

根因：閘門的意圖是「不准在無法驗證的情況下**寫**後端」，但判斷依據是
「staged 檔案路徑」，把「合併他人已驗證的 commit」誤判成「我在寫後端」。

處置：pre-commit 偵測 `MERGE_HEAD`，合併中且無 deno 時降為警告（上游
commit 已過 CI api-tests 軌）；deno 在則照跑。**自撰閘門的第一次誤擋，
修閘門而非繞閘門**——這正是 friction-log 存在的用途。

防線回填：**已完成**（2026-07-25）。三個 guard 的判斷抽成純函式 `decide()`、
pre-commit 加 `PRE_COMMIT_DRY_RUN` 決策輸出（一律以 99 退出，不可能成為繞道），
`scripts/test-hooks.py` 以 41 條表格案例驗行為，接進 `framework-check.sh`。
測試本身用突變驗證過有效（拿掉 main/develop 防線、改壞紅燈通道，皆被抓到）。

## 2026-07-25｜設計調整（人審提出）｜規劃檔是鷹架，不是文件

使用者觀察：「寫規劃會一直增加 doc 的內容」——`docs/plans/` 會無限累積，
而功能上線後規劃書的價值急降（程式碼與測試才是真相，舊 plan 描述的是
「當初想做什麼」，會被誤當成規格，比沒有文件更糟）。

原設計把 plan 落檔是為了三件事：跨 session rehydration（web session 容器
拋棄式，git 是唯一跨 session 通道）、`feature-plan-guard` 的判斷依據、
人審留痕。這些在施工期是真需求，上線後就不是了。

處置（分級 + 生命週期）：
1. **預設不落檔**——輕量改動走 Plan Mode，四視角審查直接審 prompt 內的
   規劃全文（reviewer 契約已明訂「沒有檔案路徑不是略過審查的理由」）
2. **落檔只在**：跨 session／動金流·資料·會籍／階段數 ≥3
3. **落檔的在 PR 前刪除**（`/tdd-implement` 收尾），值得長期保存的決策
   **升級**進規格書／架構文件／本檔，其餘隨 commit 清掉
4. 配套修一個互動 bug：`feature-plan-guard` 若只看工作目錄，清理後的
   修正（例如修 CI 紅燈）會被自己的守衛擋住 → 改成看「這條分支曾經有過
   規劃書」（工作目錄現存 **或** 分支歷史出現過）。新增 3 條 hook 測試，
   並用突變驗證有效（拿掉歷史查詢即紅）

教訓：外部記憶要分「施工狀態」與「長期記憶」。前者該有生命週期，
後者才進版控長留（friction-log 屬後者，所以它不清理）。

## 2026-07-25｜設計自我修正｜/review-plan 上鎖是錯的

原設計三個 skill 全上 `disable-model-invocation`，理由是「外迴路由人啟動」。
但「防止模型跳過人審去實作」這個目的**已由 `/tdd-implement` 的前置檢查達成**
（檢查 review.md 存在、P0 已處置、人審勾選）。額外鎖住 `/plan-feature` 與
`/review-plan` 沒有增加保護，只製造了「規劃與審查可被靜默略過」的洞——使用者
說「加個功能」時模型沒有任何機制把它導向規劃流程。

處置：解鎖 `/plan-feature`（description 寫明「新功能第一步，不要直接寫程式」）
與 `/review-plan`（唯讀、產報告後停，無副作用），`/tdd-implement` 維持鎖定。
再加 `feature-plan-guard` 作為確定性後盾——自動觸發是啟發式的，不能只靠它。

教訓：上鎖要問「這道鎖擋住的具體行為是什麼」，不是「這階段感覺該由人啟動」。

## 2026-07-25｜誤擋教訓｜biome unsafe autofix 誤刪檔頭註解

`--unsafe --only=correctness/noUnusedImports` 移除 `import React` 時，把黏附
其上的整段檔頭註解塊（含 `// @vitest-environment jsdom` pragma）一併刪除，
導致 8 個測試紅。教訓：unsafe autofix 之後必須 diff 檢查「註解淨損」
（本次已用內容級比對腳本掃全 diff，僅此一檔受害，已還原）。

## 2026-07-25｜環境阻擋（已修）｜pre-commit 的 Deno 閘門在任何裝了 deno 的環境都過不了

改獎勵來源分類需要動 `supabase/functions/**`（契約 enum + 端點），
pre-commit 的 Deno 閘門因此觸發，但**兩個子閘門在這個執行環境都跑不過，
且都與本次改動無關**：

1. `deno task check`：需要從 `jsr.io` 下載 `@supabase/supabase-js`，
   本容器的 egress 政策回 403。離線無解（proxy README 明言不得繞道）。
2. `deno fmt --check`：對 **45 個檔案中的 41 個**報未格式化——其中絕大多數
   本次未動過。跨版本量測（2.2.8 / 2.9.4 各測一次，並移開 lockfile 排除
   「讀不到 lock」造成的偽陰性）結果**一致都是 41/45**，所以不是版本漂移：
   **`supabase/functions/` 從來沒有被 `deno fmt` 過**。差異類型是 import
   排序與長行斷行，全是格式，不含語意。
   之所以到今天才炸：這道閘門是 2026-07-25 的框架 PR 才加的（259940d），
   而 CI 從不跑 `deno fmt --check`（ci.yml 只有 `deno task check` +
   api-tests），於是「新閘門 × 從未格式化的舊碼」＝**任何裝了 deno 的環境
   都無法 commit 後端**。

處置（人審授權，2026-07-25）：**修閘門，不繞閘門**（與上一則 merge 誤擋同一
原則），拆成兩個獨立 commit，不混進 feature diff：

1. `style(deno)`：對 `supabase/functions/` 跑一次 `deno fmt` 正規化（41 檔，
   純空白／import 排序，無語意變動）——閘門的 fmt 這一半從此可通過。
2. `fix(hook)`：`deno task check` 失敗時分辨兩種情形——**型別真的有錯**照擋；
   **相依解析不到（registry 不可達）**降為警告並交給 CI 的 api-tests 軌
   （判別只認 deno 的相依解析／連線失敗訊息）。與 merge 例外同一種豁免：
   閘門的意圖是「不准寫沒驗證過的後端」，不是「沒有網路就不准寫後端」。

未做（留給下一次框架整併評估）：讓 CI 也跑 `deno fmt --check`。否則格式漂移
只有本機會發現，而這正是它累積到 41/45 檔都沒人察覺的原因。

---

## 2026-07-25｜漏網｜後端 TDD 的紅燈證據只能從 CI 讀,且會被 concurrency group 吃掉

`referral-network-sort-logic` 的四個後端階段,在無法本機跑 Deno 測試的環境
(沙箱擋 `jsr.io`、無 docker daemon)只能靠 CI 取得紅燈證據。這本身是
`.claude/rules/supabase-functions.md` 已預期的兜底路徑,**但它沒預期到節奏
陷阱**:CI 有 concurrency group,推新 commit 會取消正在跑的那輪——所以綠燈
實作寫好後必須壓著不推,等紅燈那輪跑完才能推。踩到才知道(`4027c2f` 那輪
就是這樣被取消的)。

**處置**:建議在 `.claude/rules/supabase-functions.md` 補一句——「無法本機跑
Deno 測試的環境,後端 TDD 階段的紅燈證據取自 CI;此時綠燈實作不得在紅燈那輪
CI 完成前推送,否則 concurrency group 會取消掉唯一的紅燈證據」。

## 2026-07-25｜誤擋(自造)｜誤把排程觸發時間當成當下時間,取消了一輪健康的 CI

自動 check-in 觸發後,未查證實際時間就假設「現在大約是 check-in 的排定時刻」,
據此算出某個 CI job「卡了 42 分鐘」並將其取消重跑。實際跑 `date -u` 才發現
該步驟只跑了 68 秒——一輪完全正常的 CI 被取消。

根因:把間接線索(排程時間、對話節奏)當成可信的時間來源。此次代價僅是多幾
分鐘 CI,但同樣的誤判用在判斷部署逾時、鎖過期、退款時效上可能造成實質破壞。

**處置**:通則——判斷任何逾時/卡住之前,先跑 `date -u` 取得真實時間再相減,
不從對話上下文推斷經過了多久。已寫進該 session 的 check-in 指示;值得考慮
寫入框架通則。

## 2026-07-25｜漏網｜階段切分把不可分割的變更切成兩半(plan 階段規劃品質)

`referral-network-sort-logic` 的 plan §5 把「`SORT_OPTIONS` 重排」放 Phase 4、
把「選單順序斷言」放 Phase 5。但元件以 `SORT_OPTIONS.map()` 渲染,資料順序
與畫面順序在結構上是同一件事——不存在能同時滿足兩個階段期望的實作。結果
Phase 4 卡在紅燈期無法收綠,且紅燈期守衛(正確地)禁止改測試檔,需人工裁決
解鎖。

**處置**:規劃階段切分時,對「同一個常數/型別被多個測試檔釘住」的情況要先
掃一次引用點。四視角審查未攔到此問題——可考慮在 review-plan 的架構視角加一
條檢查:每個階段的「既有測試受影響清單」是否跨階段重疊。

## 2026-07-25｜漏網(已修)｜CI 的 changes 路徑過濾從加入起就沒生效過

`ci.yml` 的 `changes` job 用 `dorny/paths-filter` 做路徑過濾,註解寫明意圖是
「純文件變更依然不燒重的 job,省 runner 的初衷不變」。實際上 `code` 對**任何**
PR 都回 `true`——四條 `if: needs.changes.outputs.code == 'true'` 從加入起恆為真,
沒有 skip 過任何東西。是寫 token 效率分析的純文件 PR 意外撞出來的:只動一個
`.md` 卻四軌全跑。

根因:`predicate-quantifier` 未設,取預設值 `some`——語意是「檔案符合**任一**
pattern 即命中」。於是 `- '**'` 先成立,底下三條負向排除永遠不被考慮。負向
排除要生效必須明確設 `every`(dorny 官方文件記載的 exclusion 慣用法)。

**為什麼沒被發現**:這是「設定寫了但語意不生效」的一類——CI 全綠、沒有任何
訊號。而既有閘門對 `.github/workflows/` 只有「GitHub 願不願意跑」這一層,
沒有任何一層驗設定的語意。這也是從 main 退化來的:main 用 workflow 層
`paths-ignore` 是有效的,改成 job 層的理由正確(workflow 層被 ignore 時
required check 永遠 pending、純文件 PR 卡死),但搬遷時弄丟了過濾能力。
順帶一提,`framework-check.sh` 開頭「框架檔案會被主軌路徑過濾跳過,所以需要
本軌」的前提在此期間也是假的——修好後才第一次成真。

**處置**:已補閘門。新增 `scripts/check-workflows.py`(純文字掃描、不 import
yaml,維持 framework-check 免依賴的契約),規則抽象為「paths-filter 只要用了
負向 pattern 就必須設 `predicate-quantifier: every`」,接進 framework-check 軌;
檢查器自己有 6 條表格案例。通則:**宣稱有的治理若不生效,比沒有治理更貴**
——因為沒人會再去看它。日後加任何「宣稱會 skip/擋/過濾」的設定,要同時想
「什麼東西會在它默默失效時變紅」。

**附帶發現(未處置)**:TDD 相位鎖只覆蓋 vitest 層——`.claude/tdd-lock` 的兩個
效果是 pre-commit 跳過 vitest 與擋改 `src/**/*.test.tsx`。框架軌(framework-check)
的紅燈沒有對應機制,本次紅燈期因此未建鎖(建了兩個效果都是 no-op,只留下殘留
鎖的風險)。若日後框架軌的 TDD 變頻繁,值得想清楚要不要有對應的相位機制。

## 2026-07-25｜漏網｜規格書漂移沒有任何閘門偵測,而它是審查閘門的溯源對象

文件整理時對照程式碼逐條查證,發現 `docs/uknow-software-specification.md`
有多處與實作**相反**(不是模糊,是相反):

| 規格書寫的 | 實作是 | 何時失真 |
|---|---|---|
| 藍新金流 NewebPay | PayUni | 全程沒對過 |
| 每代 10P×12 個月＝120P、寫 11 筆待發排程 | 每代 100P 一次發清,`reward_schedules` 整張已刪 | 20260620000007 |
| 推薦王:單月直推 10 人 → 1,000P | 門檻 8 人 → 「免費續約 1 年」credit,可多張 | 0718000103 / 0724000002 |
| 連續推薦達人任務 | 已移除,後端無此實作 | 20260620000007 |
| 路由 `/serviceProviders*` | `/service-providers*` | 全程沒對過 |
| 「展示完整功能,不需串接真實 backend」 | 有真後端、真金流 | 全程沒對過 |

**為什麼這比一般文件過期嚴重**:`plan-reviewer-requirements` 的契約是
「規劃書的功能斷言對不到規格書章節 → 一律 P0」。規格書失真時,這道閘門
不是失效而是**反向作用**——它會用作廢的規則去 P0 擋掉正確的規劃,或反過來
放行照著舊規則寫的實作。**宣稱有的治理若指向錯誤的真相,比沒有治理更貴**
(與 0725 那則 paths-filter 同一個教訓的另一面)。

**為什麼沒被發現**:三份文件各自**獨立記錄了同一組落差**——
`e2e/journey/README.md` 的「已知產品落差」、`docs/e2e-journey-test-design.md`
§2「與規格書文字略有出入,以程式碼為準」、`online-rewards-...md` 的規則表。
每個發現者都選擇「在自己的文件裡註記繞過」,沒有人回頭修上游。落差被記了
三次,卻一次都沒被消除——**旁註是繞道,不是修復**。

**處置**(本次已做):
1. 規格書逐條對照程式碼重寫,並新增 §14「已知落差」**集中**列未實作項,
   取代散在三處的旁註;
2. 已上線的設計草案 `online-rewards-referral-rule-update.md` 規則升級進
   規格書後刪除(符合「規劃檔是鷹架」的既定生命週期,但這份漏了收尾——
   它的檔頭到今天還寫著「設計草案(尚未實作)」,而 8 個 migration 早已上線);
3. `docs/README.md` 新增權威性分級,並寫明「規則只寫一份、旁註不算修復」;
4. CLAUDE.md 補一句:規格書與程式碼衝突時,**同一個 PR 回頭修規格書**。

**防線回填:已完成(2026-07-25,同日)**。新增 `scripts/check-spec-drift.py`,
接進 framework-check 軌(自測 + 實掃各一次),四類檢查:

| 類別 | 對照對象 |
|---|---|
| 可驗證常數 | 獎金/門檻 ↔ `reward_config` seed;費用/上下限 ↔ `request_withdrawal`;長度/張數 ↔ `constants.ts` |
| 路由 | 規格書 §3 第一欄 ↔ `App.tsx` 的 `<Route path>` 集合對照 |
| 列舉 | 提領狀態機 ↔ SQL check 約束;獎勵來源分類 ↔ `REWARD_SOURCE_CATEGORIES` |
| 引用存活 | 規格書提到的檔案路徑是否還在 |

三個設計決定值得記:

1. **兩邊都從真實檔案抽取**,不設「規格書專用的機器可讀錨點」。錨點會與它
   旁邊的散文各自漂移,那只是把問題搬個位置。
2. **抽不到 = 失敗**,不是略過。改寫規格書措辭讓抽取式失配會紅——否則這道
   閘門會靜默變成 no-op,正是上一則 paths-filter 的教訓(**宣稱有的治理若
   不生效,比沒有治理更貴**)。已用突變驗證這條:把「每筆固定 **15 P**」改成
   「每筆固定十五點」確實紅。
3. **SQL 常數取「最後定義者」**(依檔名排序)。`v_fee`/`v_min`/`v_daily_cap`
   同時存在於 0718000101 與 0720000001,`create or replace` 的語意是後者生效;
   寫死指向單一檔案的話,下次覆寫就會對到過期的值。

**突變驗證**(9 槍全中,雙向):規格側改壞常數(120P/門檻 10——正是真實發生過
的兩筆)、路由改名、列舉增刪、引用指向已刪檔案、措辭改寫;程式碼側調漲年費、
新增路由、移除路由。另外檢查器自身的 DOTALL bug(狀態機抽取跨行吃到全文)是
**實掃時才發現的**,已補一條迴歸案例並突變驗證有效。

**過程教訓(值得單獨記)**:第一輪路由突變回報「沒抓到」,追下去發現是**突變
自己無聲失敗**——`str.replace` 找不到目標時不報錯,而 `/tasks` 在 `App.tsx`
是多行 JSX,`<Route path="/tasks"` 這個搜尋字串根本不存在。差一點就據此誤判
閘門無效。通則:**突變測試必須斷言突變真的套用了**,否則「沒抓到」與「沒突變」
外觀相同——這與 paths-filter 那則同構,都是「以為做了、其實沒生效」。

## 2026-07-25｜存量債｜黑箱練習產物佔著 docs/ 且需要 CLAUDE.md 常駐警語

`docs/blackbox/` 是 1,167 行「Uknow 是線上多人 UNO 卡牌遊戲」的規格與測試
計畫——作者未讀碼、僅憑產品名諧音推定,Phase 3 對照後已自證領域完全猜錯。
它與本專案零關聯,但一直留在 `docs/` 底下,代價是 CLAUDE.md 得常駐一句
「⚠️ 禁止當成規格來源」的警語佔 context。

**處置**:整個目錄刪除(git 可取回),CLAUDE.md 的警語一併移除。

**教訓**:需要靠警語才能安全共存的文件,就是該刪的文件。留著它的成本
(每個 session 的 context + 每次搜尋的雜訊 + 誤讀風險)遠高於它的價值。
Phase 3 那份對照報告的**唯一長期價值是方法論教訓**,已濃縮如下,原文
不再保留:**只憑名稱、不觀察執行中的系統,黑箱規格可以 100% 走偏。**
真正的黑箱測試是觀察執行中的系統行為,不是猜測。

## 2026-07-25｜設計調整（人審提出）｜落差關閉後不必留「不提供」旁白

使用者觀察（PR #118、#119 各一次）：規格書 §14「已知落差」清單移除一列
時，額外在同一份文件的段落、以及 `e2e/journey/README.md` 補寫「不提供
X（已定案的產品決策，非落差）」之類的說明，重複強調某功能不存在。
使用者指出：功能不存在，安靜地不出現在文件裡就是正確狀態；逐一解釋
「為什麼沒有」等於在維護一份原則上列不完的「不提供清單」。

根因：§14 開頭雖已寫明「落差消除時請一併刪除該列」，但沒涵蓋「刪除後
要不要在別處補說明」——兩次都把刪除本身做對了，多出來的是刪除之外
另加的旁白，且同一件事在規格書與 e2e README 各寫了一次，也違反本檔
自己的「規則只寫一份」慣例。

處置：`docs/README.md`〈慣例〉新增一條「沒有的功能，不必記錄『沒有』」，
例外只留給程式碼裡仍有殘跡、容易被誤讀的情況（保留但不再讀寫的欄位、
已停用的路由），且只在該殘跡定義處寫一次最小事實說明。同時清掉
`subscriptions.is_canceled` 註記裡的「已定案的產品決策，非落差」等
自我辯護文字（保留欄位本身的事實說明），並移除 `e2e/journey/README.md`
現存的兩處「不提供自助取消訂閱」旁白，作為新規則的示範。

教訓：關閉一個清單項目時，「刪除該列」和「解釋為什麼刪除」是兩件事——
前者是清理，後者預設不必做。「已定案」「非落差」「不必再列」這類措辭
是說給流程／審查看的話，不是產品事實，不屬於 B 級現況文件該留的內容。

## 2026-07-25｜漏網｜web session 從 main(非 develop)開局,整套 .claude/ 框架不存在

使用者要求「強制新分支預設以 develop 為 base」,追查時發現這正在發生:
本次 claude.ai/code web session 的起始分支 `claude/claude-code-default-
branch-base-kfk9b6` merge-base 是 `origin/main` 的 tip,不是
`origin/develop`——本機當時完全沒有 `.claude/`、`CLAUDE.md`,連
`git branch -a` 都要先 `git fetch --prune` 才看得到 `develop`(初次 clone
顯然只抓了 main 這條)。

**根因**:GitHub repo 的 `default_branch` 設定是 `main`(GitHub API 直接
證實)。claude.ai/code 的 web session 由平台在 session 啟動前建立分支,
依據就是這個設定——早於 `.claude/hooks/` 任何 PreToolUse hook 生效。
Claude Code 治理的六層(permissions.deny/hook/paths-scoped rule/skill/
CLAUDE.md/prompt)全部管不到這一步:session 存在了它們才存在。

CLAUDE.md 原本只記錄「web session 分支不符 `feature/*` 命名」這個已知
例外,沒意識到 base 也可能是錯的。兩者是同一個平台行為的兩面,但後果差
很多:命名不影響守衛放行,base 選錯卻讓整個 session 是空的——規劃書守衛、
TDD 相位鎖、命名檢查、規格書漂移偵測……全套治理形同不存在,而且不會有
任何錯誤訊息,純粹「看起來一切正常,只是規則都不在」。

**處置**:
1. `.claude/hooks/bash-guard.py` 補第 5 類:`checkout -b`/`switch -c`
   沒有顯式 start-point 時查 HEAD 是否為最新 `origin/develop`,不是就擋
   且指路;顯式以 main 為 start-point 同樣擋。`scripts/test-hooks.py` 補
   13 條表格案例(含刪分支/列分支/純切換分支的反向驗證,避免誤擋)。這條
   覆蓋的是 **session 中途**由 Claude 自己開新分支的情形。
2. CLAUDE.md 的「已知例外」段落補上 default branch 這條根因,並標明
   GitHub repo Settings → Branches → default branch 應該改成 develop——
   這是本次事故唯一的完整解,但改 GitHub repo 設定不在任何 Claude Code
   治理層內,只能由人在 GitHub 上做,已請人工處理。

**教訓**:平台自動化(web session 建分支)發生在 Claude Code 治理層啟動
之前,那一步的正確性只能靠**上游設定**(這裡是 GitHub default branch),
沒有任何 permissions/hook/rule/skill/CLAUDE.md/prompt 能補救已經選錯的
base。治理層生效前的第一個問題永遠是「這個治理層本身是什麼時候開始
生效的」——答不出來的那段,就是它管不到的盲區。

## 2026-07-25｜漏網(已修)｜新加的 canary 自己犯了它要防的那個 bug

`scripts/check-context-budget.py` 是為了防「宣稱有的治理不生效」而寫的
(C3 專門擋 rule 的 paths 匹配不到檔案)。但它自己的 C2 掃描**掃到 0 個檔案
時仍會回報「OK,0 個大檔警告」**——壞掉與健康在輸出上完全無法區分,正是
`changes` 路徑過濾那個 bug 的同一個形態。

是作者自我審計時用突變測試(把 SCAN_GLOBS 改成不存在的路徑)撞出來的,
不是任何閘門攔到的。

**處置**:加 `MIN_SCANNED_FILES = 50` 的健全下限(抽成純函式 +4 條表格案例),
並把掃描檔數印進 OK 訊息。兩層防線的分工:**下限讓機器擋住突然歸零**,
**可見的檔數讓人看見緩慢漂移**。

**通則(比這個 bug 本身重要)**:一個回報「OK / 0 個問題」的檢查,必須能區分
「真的沒問題」與「根本沒檢查到」。設計任何 canary 時要問第二個問題——
不只是「它失效時什麼會變紅」,還有「**它空轉時看起來像什麼**」。空轉與健康
長得一樣的檢查,等於沒有檢查,而且比沒有更糟(它會讓人停止懷疑)。

**附帶修正(同一次審計)**:C1 宣稱量測「啟動固定成本」但漏算了 skill 與
agent 的 frontmatter(Claude Code 每 session 都會載入它們的 name +
description 以決定何時呼叫),低估 23%(3,150 → 3,868)。教訓同源:量測的
**名稱**若比它實際涵蓋的範圍大,讀數就會被過度信任。

## 2026-07-25｜摩擦｜PR 合併刪分支後,同名分支重用會讓 force-with-lease 卡住

`--force-with-lease` 以本機的 remote-tracking ref 為租約。PR 合併時遠端分支
被刪除,但本機 `origin/<branch>` 殘留;此時用同名分支重新開工再推,會得到
`stale info` 拒絕,而錯誤訊息不會提到「遠端分支其實已經不存在了」。

診斷方式:`git fetch origin <branch>` 回 `couldn't find remote ref` 才看得出來。
**處置**:`git fetch --prune` 清掉殘留 ref 後,一般 push 即可(分支不存在,
不需要強推)。強推前先確認殘留 ref 指向的 commit 已完全併入 develop
(`git merge-base --is-ancestor`),確保沒有未合併工作會被覆蓋。
