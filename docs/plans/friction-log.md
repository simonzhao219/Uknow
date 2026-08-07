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

## 2026-07-25｜自造漏網｜照抄 workflow 時抄到已被修掉的舊版寫法

新增 `seed-develop-data.yml` 時,分支連線資訊的解析是從 session 早期讀到的
`journey-nightly.yml` 複製的。但那支檔案在此期間已被重構成
`journey.yml` + `journey-scheduled.yml`,而且**正好修掉了我抄的那一段**:
`grep '^ANON_KEY='` 撈不到欄位時會靜默傳空字串,journey.yml 的註解白紙黑字
寫著「2026-07 那次假綠就是這個」。首跑(run 30174097721)於是以完全相同的
方式失敗——ref 解析成功、兩把 key 空白、套件在 `JOURNEY_REQUIRE_ENV=1`
下 1 秒內硬失敗。

代價很小(硬斷言讓它當場紅燈,不是假綠),但根因值得記:**context 裡的
檔案內容會過期**。同一個 session 內讀過的檔案,隔幾十輪之後可能已經被
上游改掉,而模型不會自己感覺到。

處置:抄任何既有檔案的做法之前,先確認手上的版本是最新的
(`git log --oneline -3 -- <path>` 或重讀一次),尤其是「這段看起來解決過
某個坑」的段落——那種段落最可能已經被改進過。這次也順手補上 journey.yml
的 `::add-mask::`:原本的寫法會讓兩把密鑰出現在每個 step 的 env 傾印裡,
而這是公開 repo。

## 2026-07-26｜自造漏網｜「反向定義白名單」把要保護的資料悄悄毀掉

姓名格式防呆要擋標點、放行漢字與英文,實作把分隔符號判定寫成
「非漢字、非英文字母、非數字、非半形空格就當標點」——反向定義,讀起來
完全合理,四輪審查(三輪規劃 + 一輪實作)都沒有人指出它。

真正的問題是 `HAN_RANGE`(`㐀-鿿豈-﫿`)**不含**擴充 B 區
以上與造字區,也就是戶政「缺字」姓名用的那些字。那些字元不在白名單裡,
於是被判為標點——而表單會**主動把標點換成半形空格**,所以缺字姓名會被
整串換成空格、靜默毀掉,比被拒還糟。

抓到它的是「缺字該走客服出口」那條新測試,不是 code review。

**原則**:白名單反向定義(`[^允許的]`)的語意是「凡我沒列舉的都是壞東西」,
而列舉必然不完整——不完整的代價會落在最邊緣、最沒人測的那群人身上。
要判定「是標點」就直接判定標點(Unicode 類別 `\p{P}`/`\p{Z}`),不要用
「不是我認識的好東西」代替。

## 2026-07-26｜自造漏網｜測試樣本不像真實輸入,等於沒有測

同一個 feature 的 journey 姓名產生器把 `run_id + node` 串接後整體截到 10 字。
測試斷言「不同節點不撞名」,綠燈。但測試用的 `run_id="a1b2"` 只有 4 字元,
而真實 CI 用 `gh${{ github.run_id }}`——GitHub run id 是 10 位以上數字,加前綴
超過上限,截斷後 `node` 整段被切掉,**同一次 run 的 30 個節點全部同名**。

測試永遠踩不進截斷區間,所以永遠是綠的。實測對照:真實 run_id 下舊實作
6 個節點相異數 1/6。

**原則**:寫邊界測試時,樣本的**形狀**要取自真實來源(workflow 的環境變數、
實際資料庫值),不要用手邊順手的短字串。「有測到」與「測到會發生的那個
情況」是兩件事——後者才有保護力,前者只提供假的安全感。
## 2026-07-26｜漏網(已修)｜新裝的感測器自己會靜默掉資料——並行的 hook 互相覆蓋

`.claude/hooks/decision_log.py` 上線後的第一次端到端驗證(做一次真 commit,
看落檔內容)就發現:committed 的那一行是個**全新 session、只有 1 筆計數**,
而幾分鐘前 buffer 裡明明累積了 46 筆的那個 session 整包不見了。

根因:`bash-guard` 與 `check-output-filter` 掛在 `.claude/settings.json` 的
**同一個 Bash matcher** 上,Claude Code 會並行執行它們。兩個行程同時對 buffer
做 read-modify-write,而寫入不是原子的——其中一方讀到對方寫到一半的檔案,
JSON 解析失敗,被 `_read_buffer()` 的 `except` 當成「還沒有 buffer」,於是
開一個新 session id 覆蓋掉既有那筆。

處置:`fcntl.flock` 互斥 + 先寫暫存檔再 `os.replace` 的原子寫入,兩層都要
(鎖擋得住有參與鎖的行程,擋不住 `harness-metrics.py` 這個不上鎖的讀取器)。
兩條行為案例接進 `scripts/test-hooks.py`,突變驗證過。

**通則一(比這個 bug 本身重要):感測器的失效是靜默的。** 閘門壞了會擋住人,
第一時間就有人喊;感測器壞了只是不再記錄,而少報的讀數看起來跟「真的沒事」
一模一樣。所以量測設施需要的機械驗證**不比閘門少,而是更多**——這也是
`framework-check` 第 12 項存在的理由。

**通則二:hook 的並行是預設,不是例外。** 掛在同一個 matcher 上的 hook 會
同時跑。任何 hook 要碰共用狀態(檔案、鎖、計數),都得先假設有另一個自己
正在碰同一份東西。既有的五個 guard 之所以沒踩到,只是因為它們全都唯讀。

**通則三:競速 bug 不要用競速測試抓。** 第一版寫的是「一邊狂寫一邊讀,看會
不會讀到半截」——它在有 bug 的版本上照樣通過(賭不中那個極窄的時間窗),而且
在 CI 上必然 flaky。改用確定性的代理性質:rename-into-place 必然換 inode,
就地覆寫必然保留 inode。一條只有機率會說話的測試,跟不會說話的差別不大。

## 2026-07-26｜設計自我修正｜感測器在「沒有下游落檔機會」的時機寫檔,只會製造髒工作區

承上則。`decision_log` 的落檔設計刻意把 pre-commit 當唯一落檔點,但實作時
還是在 Stop hook(`deletion-residue-check.py`)順手加了一次 flush,理由寫的是
「session 最後一次能寫東西的時機,補漏」。

上線當天就看出那是負收益:Stop hook 跑在**最後一次 commit 之後**,所以
- **收益為零**——後面不會再有 commit 把它帶進 git,寫了也是白寫
- **成本固定**——它改動一個受版控的檔案,於是每一輪結束時工作區都是髒的

處置:拿掉 Stop hook 的 flush,只留 `record()`(那只碰 gitignored 的 buffer)。
殘留的 buffer 由 SessionStart 的 `--rotate` 回收,不會遺失。

**通則:寫入點的價值不看「這裡方便寫」,要看「寫出去的東西有沒有下游能把它
帶到終點」。** 沒有下游的寫入不是備援,是純粹的副作用——而副作用會被誤讀成
「有東西沒處理完」,持續消耗每一個之後路過的人的注意力。本則與上一則同源:
第一版都是憑「這個時機看起來很合理」下的判斷,而不是追著資料的完整路徑走
一遍。

## 2026-07-26｜自造漏網｜歸納出通則卻沒拿它掃一遍,同一個病灶留在第二個位置

前一則（Stop hook 落檔）修完時，commit message 已經把通則寫得很清楚：

> 寫入點的價值不看「這裡方便寫」，要看「寫出去的東西有沒有下游能把它帶到終點」。

但那次**只修了觸發它的那一個位置**。`decision_log.py` 的 `rotate()` 內部同樣
呼叫 `flush()`，而 `session-bootstrap.sh` 在 SessionStart 跑 `--rotate`——所以
SessionStart 一樣在寫受版控的 `sessions.jsonl`。症狀完全沒消失：下一輪的
工作區照樣是髒的，環境的 Stop hook 照樣在喊。

為什麼第一次沒抓到：Stop hook 那個位置是**零收益**（後面不可能再有 commit），
一眼就能判死。SessionStart 這個位置**通常有收益**——後面多半會有 commit 把它
帶走——所以看起來不同類。但「通常」不是「總是」：唯讀 session（問答、review、
plan mode）沒有下游 commit，此時它退化成與 Stop hook 完全相同的純成本。
**同類掃描要比對的是機制，不是症狀的嚴重程度。**

處置：`sessions.jsonl` 的寫入點收斂成一個（只有 pre-commit）。`rotate()` 改成
把殘留 buffer 搬進 gitignored 的 `.pending.jsonl`，`flush()` 落檔時一併帶走。
資料不遺失，受版控的檔案只在真的要 commit 時才被動到。四條突變驗證過。

**通則（比這個 bug 本身重要）：歸納出一條原則的那一刻，就是該拿它掃一遍
codebase 的時刻。** `/fix-bug` 第 3 步的「同類掃描」正是為此存在，但前一則走的
是輕量路徑（表層錯、根因自明）所以跳過了它——而分級的判準是「根因明不明顯」，
不是「這條原則能套用到幾個地方」。這兩件事會分岔：根因愈清楚、抽象出的原則
愈漂亮，就愈容易以為「講清楚了」等於「修完了」。**寫下通則的動作本身，應該
就是觸發同類掃描的訊號**，與分級無關。

## 2026-07-26 web session:平台自動 rebase 在指令執行「中途」發生,吃掉一次 heredoc append

default-referral-code feature 施工期間,claude.ai/code 平台的自動 rebase
（分支跟 develop 同步）兩度在 Bash 指令執行中途發生:一次讓 `curl` 的輸出
被 rebase 訊息整個替換,一次讓「append 測試 + commit」的複合指令只執行到
一半——檔案 append 沒落地、commit 沒發生,但 shell 沒有報 append 失敗,
是靠事後 `grep -c "Deno.test"` 對帳才發現。

**症狀特徵**:工具回傳「Rebased ... which rewrote local history」這段
git 訊息出現在**與 git 無關的指令**輸出裡,即是撞上了。

**處置慣例**(本次驗證有效):
1. 任何複合指令執行後看到該訊息,先 `git log --oneline -3` + `git status -sb`
   對帳,**不要相信該次指令已完成**;
2. 檔案內容用可數的錨點對帳(`grep -c`),不要用「指令沒報錯」當證據;
3. rebase 後本地未推送的 commit 仍在(rebase 只換 hash),
   `git push --force-with-lease` 同步即可,不需要也不可以照 stop-hook 的
   建議對 develop 上既有 commit 跑 `--reset-author` 改寫。

框架面沒有可修的鉤子(rebase 由平台觸發,早於 session 可控範圍),
這則的價值是把「撞上時怎麼判斷、怎麼恢復」沉澱下來。

## 2026-08-02｜漏網｜規劃書多版本迭代的兩類重複錯誤(renewal-backfill,已各犯 ≥3 次)

1. **內文引用不隨階段重編號平移**:§5 表格每版重寫所以是對的,但 §1/§7
   散落的「階段 N」裸引用連續三版漂移。雪上加霜:用 python `str.replace`
   修正時目標字串已不存在 → **靜默 no-op**,前兩版的「修正」實際沒生效,
   直到第 3 輪審查機械核對才發現。
2. **新版加規則時,舊版分支決議未重新檢視**:第 2 輪定的「renewal 缺漏時
   兩選項照常可選」在第 5 版加入 A14(清空前強制揭露)後變成直接違規,
   但沒人回頭看它——成為第 3 輪唯一的 P0。

處置:(a) plan 內文引用階段時必須帶階段名稱(「階段 9(PaymentResult)」),
裸數字禁用;(b) 版本改寫收尾必跑 `grep -n "階段 [0-9]" plan.md` 逐一核對;
(c) 文件編修的 replace 一律加唯一性斷言(count==1),禁止靜默 no-op;
(d) 新增規則時對既有分支決議做同類掃描(這是 /fix-bug 同類掃描的規劃版,
第 1 輪 P0-2 → 第 2 輪 P0 的「資料流缺口」復發也是同一根因)。
整併框架修訂 PR 時,考慮把 (b)(c) 做成 check-plan-refs 小腳本。

## 2026-08-02｜待裁決→已裁決｜rules.md 的跨包存活義務

`docs/plans/upline-pairing-lines/rules.md` 是 M4/M6/M7(樹結構規則)在另一包
plan 誕生前的唯一落腳處。renewal-backfill 收尾清理與任何 `docs/plans/`
一般性整理都**不得刪除它**(第 4 輪架構視角 P1;檔頭已加自我保留註記)。
另一包 `/plan-feature upline-pairing-lines` 跑完、M4/M6/M7 升級進其 plan.md
後,此檔即可依一般鷹架生命週期處理。

同輪並記:「宣稱 P2 全數修訂,實際一條放錯位置未落實」——與 replace 靜默
no-op 同族(修正動作本身沒有被驗證)。處置沿用上一條:文件修訂後逐條
grep 驗證,不以「改過了」的記憶為準。

## 2026-08-02｜實作期整併｜renewal-backfill 施工摩擦（plan 清理前升級）

原文脈絡在 `git show 2427e13:docs/plans/renewal-backfill/progress.md`。

1. **被 spec-drift 盯住的規格書段落必須與觸發它的程式碼同 commit**：
   plan 把 §8.4 加列排在收尾階段，但 check-spec-drift 每次 CI 都比對，
   階段 2 的契約改動一落地 CI 就紅。「文件統一收尾」的直覺與逐 commit
   機械把關互斥——切階段時把這類項目直接併進對應的程式碼階段。
2. **操弄時間欄位的測試夾具必須整組時間關係一起搬**：夾具把 end_date
   搬到過去但沒動 completed_at，人工製造出補繳簽名（hasPaidAnyBackfill
   誤判）。時間欄位之間有業務不變量（付款恆在效期起算前），只搬單一
   欄位等於偽造資料。
3. **CI concurrency cancel-in-progress 的殘影會偽裝成紅燈**：同分支新
   push 取消進行中 run，ci-ok 顯示紅但 RESULTS 裡是 `cancelled`。應對：
   接受「下一個 run 的 log 同時佐證前一階段」的讀法，不必每階段等收斂。
4. **四狀態/多分支 UI 規格要在測試裡逐列對應**：plan §4 四狀態表第 4 列
   （背景重整失敗）三個 reviewer 視角獨立發現未實作——根因是 hook 沒
   曝露該訊號，而測試只寫了「有資料」與「無資料」兩態。規格表格的每一
   列都該有一條測試，缺訊號時會在寫測試那一刻暴露，而不是審查才抓到。

## 2026-08-02 admin-dashboard feature:三層測試都碰不到的後端契約——mock 的盲區是結構性的

四視角實作審查抓到一個 P0:提領作業台的「退件」在正式環境 100% 失敗。前端
沒有理由輸入欄、`note` 恆為 `undefined`,而後端 `admin_update_withdrawal_status`
對 `rejected`/`completed` 強制要求非空 note(`note_required`)。

**值得沉澱的不是 bug 本身,是為什麼 530+214+168 條測試全數綠燈卻沒有一條攔到:**

1. **元件測試**把後端換成注入的 mock——mock 不知道 `note_required` 存在,
   而且測試名寫「確認後才送出並帶理由」、斷言卻是 `..., undefined)`,把缺陷
   錄成了預期行為(名實不符,test-naming 檔尾反例的同族);
2. **mock e2e** 把整個網路換成替身,替身裡沒有那條檢查;
3. **journey(打真後端)**的 page object 恰好也漏填同一個欄位——寫 page
   object 的人與寫元件的人是同一人,同一個心智模型的盲點會同步複製到每一層。

三層各自「通過」,因為三層都不知道那條契約存在。**多一層測試不等於多一層
保護——當所有層都出自同一個心智模型,它們是同一層。** 攔下它的是從規劃書
出發、獨立讀 diff 的審查視角(三個 reviewer 獨立指向同一處)。

**可操作的教訓**:SQL 函數若對輸入有硬性檢核(必填、格式、狀態轉換表),
在**前端元件測試裡把那條檢核寫進 mock 的行為**(mock 收到不合格輸入就拋錯),
讓契約至少存在於兩個心智模型的交界。以及:寫完測試後把「測試名」與「斷言」
對讀一次——名字宣稱的行為就是斷言該證明的行為。

## 2026-08-02 admin-dashboard feature:同號 migration 不是排序問題,是主鍵衝突

rebase 到 develop 後出現兩支 `20260802000001_*.sql`(本分支與他人的工作)。
第一時間的分析是「Supabase 依完整檔名字典序套用,順序決定性、無影響」——
**錯**。CI 立刻回報:

    ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
    Key (version)=(20260802000001) already exists.

`supabase_migrations.schema_migrations` 以**數字版本**為主鍵,不看檔名後半段。
第二支插入直接違反 PK,整個 `db reset` 掛掉——症狀離根因很遠(看起來像
migration 內容壞了)。

**通則**:「兩個東西同名會怎樣」這種問題,猜執行順序沒有意義——要去查
**誰在記錄它們、用什麼當鍵**。第一次的分析在「檔名排序」那層自洽,但那層
不是做決定的層。

**框架缺口**:`migration-guard` 只查「既有 migration 不得被修改/刪除」,
不查同號。同號在 rebase/多人並行時很容易發生。修法很小:guard 加一步
`ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` 非空即紅。

## 2026-08-02 admin-dashboard feature:「元件/檔案內私有函式」第二個使用者出現時就該抽

同一個 feature 內三次遇到同一模式:`copyText`(規劃有點名)、`useMediaQuery`、
`createWithdrawableUser`/`requestWithdrawal`(規劃都沒點名)。規律穩定到值得
當通則:**私有 helper 在第二個使用者出現的那一刻抽出,不等第三個**——兩份
拷貝各自演化的那天,兩邊會開始守著不同的定義(「可提領」是什麼、複製走哪個
API),而且沒有任何測試會叫。

反向的邊界同樣成立(usePagedList 的教訓):**共用抽象的價值在於使用者行為
真的一樣**。`ReferralTreeView` 的分頁與 SWR 式背景重抓纏在一起,硬併進
`usePagedList` 只會讓 hook 長出只有它用的選項——為第 N 個使用者加分支的
那一刻,抽象開始變成負債。抽取的判準不是「長得像」,是「守的是同一條規則」。

## 2026-08-02 admin-dashboard feature:本機 npm run check 不含覆蓋率門檻

`npm run check` 跑 vitest 但不帶 `--coverage`;CI 的 unit-tests 軌跑的是
`test:coverage`(分支覆蓋率棘輪 80%)。結果:本機全綠、推上去紅。前端階段
在推之前值得多跑一次 `npm run test:coverage`——它是唯一「CI 會擋、本機預設
不擋」的閘門。這次補覆蓋率時順帶抓到一個真缺陷(批次部分失敗的訊息被
緊接著的重抓清掉),證明那 45 個未覆蓋分支不是「測試不勤」,是有一整片
行為從沒被看過。

## 2026-08-02｜CI 盲區｜journey 排程 7 晚全紅：分支 replay 的來源是母專案的歷史語句,不是 git 檔案

Journey Scheduled 自 2026-07-26 上線起連續 7 晚失敗,失敗集合完全相同
（`rate_limits`/`referral_king_rewards` REST 404、`set-self-admin` 500）。
根因:Supabase preview branch 的 schema 來自 replay **母專案
`supabase_migrations.schema_migrations` 裡存下來的語句**,不是 git 裡的
migration 檔案。0008（revoke_event_trigger_exec）當年以「無存在性防呆」的
舊版直接套進 production,git 檔案後來才補上 `do $$ if exists ... $$` 防呆
——歷史語句與 git 從此分岔。replay 在全新 DB 上執行舊語句
（`rls_auto_enable()` 不存在）當場炸掉,分支停在 `MIGRATIONS_FAILED`、
schema 只到 0007,journey 就打在半套 schema 上。

**為什麼 CI 沒攔**:api-tests 在本地 `supabase start` 套的是 **git 檔案**
（有防呆版）→ 永遠綠;分支 replay 用的是**歷史語句**（無防呆版）→ 永遠紅。
兩條驗證路徑覆蓋的是兩份不同的真相,而沒有任何一層在比對它們一致。
journey.yml 的等待迴圈只等連線資訊、不驗分支狀態,把 `MIGRATIONS_FAILED`
的分支當可用環境往下跑,是第二層放行。

**為什麼 7 晚沒人接**:triage issue 有開,但排程失敗的訊號沒有回流機制
以外的接手人;且 journey-full 從未在晉升 PR 上真正跑綠過
（PR #176 從開到合併 3 分鐘,30-90 分的 journey 不可能跑完——晉升閘門
形同虛設過一次）。

**處置**:
1. 母專案歷史表 0008 的 statements 更新為 git 檔案內容
   （同類掃描:51 支全比對,正規化 md5,僅 0008 漂移）;
   修復後實測建分支 → 51/51 套用、`FUNCTIONS_DEPLOYED`。
2. journey.yml 等待迴圈改為輪詢分支狀態:`MIGRATIONS_FAILED` 硬失敗並
   附修法指引;逾時硬失敗——「連得上」不等於「schema 是全的」。
3. 新增 `supabase db push --db-url` 步驟,把 checkout 獨有的 migrations
   （如 develop 尚未晉升的版本）補進分支——journey 從此測的是「該 commit
   的程式碼＋該 commit 的 schema」,同時預演晉升時 production 的
   migration 套用。

**通則:手動改過已套用的 migration 檔案,就必須同步 repair 遠端歷史表的
statements——否則炸的不是當下任何環境,而是下一個「從歷史 replay 出生」的
全新環境,而且離事發時間可以隔很多週。**「git 檔案」與「歷史語句」是
兩份會分岔的真相,只有 replay 那一刻才會對帳。

## 2026-08-02｜同場加映｜journey GUI 註冊從未通過:hosted GoTrue 拒收 .test 網域

修完 migration replay 後,journey 骨架推進到 GUI 註冊,揭出第二個獨立根因:
hosted GoTrue 用**內建 email 服務**時,(a) signup 直接拒收 example/test
保留網域(`email_address_invalid`)——journey 的 `@uknow-journey.test`
假帳號從第一天起就註冊不進去;(b) 不掛自訂寄送管道,連
`rate_limit_email_sent` 都不准調(401 Custom SMTP required)——設計書
「測試分支放寬限流」那一步其實一直在無聲失敗(`curl -sf` 吞掉了 401)。

**處置**:journey.yml 在拋棄式分支上以 psql 建 no-op 的
`journey_email_sink(jsonb)` 並啟用 pg-functions **send-email hook**——
寄信不再經內建 mailer,兩個限制一起解除;OTP 本來就由 Admin
`generate_link` 取得,信件內容無所謂。函數只存在於拋棄式分支,不進
migration、不碰正式站。另加「signup 探測健檢」:部署後先用 REST 打一發
`/auth/v1/signup`,失敗就帶著 GoTrue 真實回應當場紅燈——GUI 逾時只會說
「30 秒沒等到 OTP 框」,toast 早消失,錯誤原因蒸發;探測讓死因可讀。

**通則:對外部 SaaS 的「設定調整」步驟,失敗必須帶回應可讀,不准 `-sf`
吞掉**——這次的 401 早在第一晚就發生了,只是被靜音;若當時可讀,email
服務的限制會提早七天現形。

## 2026-08-07｜漏網｜自癒函數用「當下值」回答「歷史問題」（issue #167）

`repair_orphaned_payments` / `repair_orphaned_claim_rewards` 的候選判準
讀 `profiles.referred_by_user_id` 當下值決定「歷史事件當時該不該發獎」,
fresh 換線（null → 真人）後歷史訂閱/claim 被整批回溯補發三代獎金。三層
測試都沒攔到:repair 測試全部從「關係先存在、獎勵後補」方向寫,「關係
後補、事件先發生」的反向從未入鏡;觸發需跨兩個 feature（fresh 換線 ×
自癒重試）,單一 feature 驗收不會撞到。

**可複用的教訓:自癒/補償類函數的候選判準必須用事件當時的事實,不能用
可變欄位的當下值;資料模型沒有記「當時」,就先補時間軸（欄位＋觸發器）
再寫自癒。** `repair_orphaned_forfeitures` 的告警快照設計是正例（同次
掃描確認無病灶）;寫這類函數時自問:「這個欄位在事件發生後可能被改走
嗎?」修法與完整分析:`git show <fix commit>:docs/plans/fix-repair-retro-rewards/fix.md`、PR #215。

同場記錄:prepare 在付款前變更 `referred_by_*`（W3-at-prepare）是同根因
的更深症狀（棄單殘留）,屬 #187 人審設計範圍,已列 PR #215 開放問題
待裁決,不在 fix 私改。
## 2026-08-07｜漏網｜三層閘門都測不到 IME 組字,注音使用者打不了姓名

iPhone Safari + 內建注音在「完善資料」姓名欄位打字,注音符號整串累積殘留
(8 → 32 字)、選出來的漢字接在垃圾後面。根因是受控 input 在 IME 組字期間
被改寫值——React 把 `input.value` 蓋掉,WebKit 丟失 composition range 卻不清
IME 緩衝(完整分析:`docs/plans/fix-ime-composition-input/fix.md`)。同類掃描
另外揪出四個「拒收超長值讓輸入倒帶」的欄位,同源同症,一併修掉。

**為什麼三層閘門都沒攔**:同一個原因——**沒有任何一層走過組字生命週期**。
vitest 用 `fireEvent.change` 一次丟完整字串、e2e 用 Playwright `fill()`,
兩者模擬的都是「已經組完字」的終點狀態;biome/typecheck/knip 看不出
「這個 setState 發生在組字期間」,那是執行期的瀏覽器狀態,不是靜態性質。
中文輸入是本站**絕大多數使用者的主要輸入方式**,而它的中間狀態從來沒被
測過——這不是覆蓋率數字看得出來的洞。

**處置**:抽出 `useImeComposition` 把「組字期間別碰值」變成有名字、有測試
的原語;`useImeComposition.test.tsx` 與 `CompleteProfile.test.tsx` 直接驅動
`compositionstart → 多次 input → compositionend`。

**殘留落差(記債,不假裝補上了)**:jsdom 測得出**事件序列**的處置是否正確,
測不出 WebKit「組字中被改寫 value 就丟失 composition range」這個**瀏覽器
行為**本身。真正等價的防線是 iOS Safari 真機 e2e,本專案沒有。也就是說,
若未來有人用別的方式在組字期間改寫值,現有測試不必然會紅。

**通則:受控 input 的 `onChange` 只要沒有原樣接受 `e.target.value`——不論是
改寫(`.replace`/`.toUpperCase`)還是拒收(`if (length <= N)`)——就是 IME
不安全的。**長度上限交給 DOM 的 `maxLength` 屬性(瀏覽器不對組字中的文字
套用長度限制,不需要 React 寫回 DOM);真的需要改寫值,就走
`useImeComposition` 延後到組字結束。**「拒收」比「改寫」更糟**:它寫回的是
上一個值,等於在組字中途把欄位整個倒帶。

**這條通則由 `scripts/check-ime-safe-inputs.py` 機械把關**(framework-check 軌)。

第一輪修復曾把三處大小寫轉換判為「中文 IME 打不中,不修」——理由是
`toUpperCase()` 對注音與漢字是 identity。那個判斷有洞:**全形英數**打得中
(Ａ → ａ 是真的變了),而全形是中文輸入法的標準功能。更根本的問題是,
「這個欄位大概沒人用 IME」這種判斷**無法機械把關**;規則要守得住,就必須
綁在「有沒有原樣接受 `e.target.value`」這個靜態看得出來的形狀上,零例外。
**一條需要逐案人工判斷才知道適不適用的規則,等於沒有規則**——這也是為什麼
檢查器的 I1 用「接了任何方法呼叫」而不是窮舉方法名:窮舉一定會漏,而漏掉
的那一個正是下次出事的那一個。
## 2026-08-05｜同類第二例｜手建環境狀態未進 migration:這次是 Storage bucket

journey full 首次全情境執行(run 30944836300)揪出 f40 四連敗的首因:
`/listings/upload-photo` 寫入的 `make-5c6718b9-listings-photos` bucket
從未被任何 migration 建立——它是 make-server 時代直接在 production 手動
建的。全新環境(journey 分支、本地 supabase start)沒有它,上傳 500、
「建立刊登」永遠 disabled。與 0008(手動套用的 migration 語句與 git
漂移)同屬一類:**手動建立的環境狀態,炸的是下一個從零重建的環境**。

處置:補 `20260805000001_add_listings_photos_bucket.sql`(照抄 production
現值,冪等)。同類掃描:live 程式碼引用的 bucket 共 3 個,`id-cards`、
`referral-signatures` 已有 migration,僅此 1 個漏網;`make-5c6718b9-id-cards`
與 `make-5c6718b9-signatures` 是無程式碼引用的遺留,不動。

**通則升級(涵蓋 0008 與本例):環境裡任何「手動做過的事」——套過的
SQL、建過的 bucket、調過的設定——都必須有 git 側的對應物,否則它只
存在於「碰巧還活著的那個環境」。journey 每晚從零重建環境,正是這類
債的定期審計。**

## 2026-08-07｜事故＋框架修訂｜Actions 分鐘數用罄，所有 workflow 停擺兩小時

01:56Z–04:19Z 帳號分鐘數用罄＋spending limit 觸頂，所有 job 拿不到 runner
（秒死、runner_id=0），連付款對帳排程都停擺、PR 無法過 CI。提高 limit 解圍，
根因盤點（用 API 實測 07-25～08-07 的 330 次 CI run＋全部排程 run）：

- **錯誤前提**：ci.yml 檔頭寫著「公開 repo 的 runner 免費且無限」——repo
  實為 **private**，每個 job 各自無條件進位到整分鐘計費。整套 CI 的成本
  設計從第一天就建立在錯的事實上。
- **量化**：CI 佔月估用量 93%（≈11,850 分）；全量一次 19-20 計費分，其中
  **42% 是 8 個秒級 job 的進位損耗**；重度開發日（08-02，107 run）單日
  ≈1,900 分，一天就近乎燒掉 Free 方案整月額度。journey 每晚排程連紅 12 晚
  無人接手（訊號未被消費、照樣計費）；reconcile 名目每小時、實測中位間隔
  1.7h（GitHub 排程器高峰丟觸發）。
- **處置**（本次修訂）：四個秒級守衛合併為單一 `guards` job（全量 19→16
  分/次）；journey 排程每晚→每週（晉升 PR 的 journey-full 不動）；
  reconcile 每小時→每 2 小時（與實測行為一致化）；新增規則 8（8a 秒級
  檢查併 step、8b 排程 workflow 必須帶費用註記，check-workflows.py 機械
  把關）；CLAUDE.md 新增「CI 費用紀律」；量測方法沉澱為
  scripts/actions-usage.py。

**通則：Actions 分鐘數是有限資源。私有 repo 每 job 進位計費——秒級 job 的
「數量 × push/排程頻率」比單 job 時長更貴；排程頻率是費用決策，要帶費用
視角寫下依據；cancel-in-progress 省牆鐘不省錢，省錢的第一槓桿是減少 push
輪數（本地綠了才 push、湊批 push）。額度紅線＝帳號方案內含分鐘。**

## 2026-08-07｜待裁決｜框架檢查器的改動要不要留紅燈 commit 證據

PR #216 為 check-workflows.py 新增規則 8b 時,規則與表格案例同一個
commit 寫入、self-test 驗綠——沒有獨立的紅燈 commit。「紅燈 hash 作為
證據」是 `/tdd-implement` 對**產品程式碼**的相位要求;框架檢查器歷來的
驗證慣例是表格案例(與 `.claude/hooks` 的 `decide()` 同一套),現行規則
文本對檢查器改動沒有紅燈要求。若認為檢查器也該比照(先提交會紅的案例、
再提交讓它綠的規則),應把要求明文寫進 CLAUDE.md 或 rules,而不是留在
個案 PR 的描述裡。裁決前維持現狀(表格案例+self-test)。

## 2026-08-07｜判斷錯誤｜移除「冗餘」依賴前,要先確認被依賴者最近有沒有換過職責

PR #211 盤點 CI 時發現 `ci.yml` 的 `journey-full` 掛著 `needs: changes`,但它的
`if` 只看 `github.base_ref`、從不讀 `changes` 的任何 output——當時 `changes`
就只是一個 `dorny/paths-filter` job,所以那條 needs 是純粹的空等(讓一軌
30-90 分鐘的重活白等路徑過濾跑完才起跑)。判斷正確,於是移除。

同一天稍晚 PR #216 把四個秒級守衛(路徑過濾／框架健檢／linear／migration)
併成單一 `guards` job。rebase 上去時撞出衝突,才發現 `needs: guards` 的語意
已經**完全不同**:它現在是**便宜失敗閘門**——守衛紅了就不該再開一個拋棄式
Supabase 分支跑 30-90 分鐘(該 job 註解明訂:「不啟動＝不計費」)。原本冗餘
的依賴,在被依賴者吸收了新職責之後變成必要。最後採用上游版本,只把「為什麼
不讀它的 outputs、但仍然依賴它」寫成註解。

**通則:`needs`(以及任何依賴宣告)有兩種語意——「我要你的產出」與「你先過我
再跑」。只驗證了前者不成立,不足以判定這條依賴冗餘。移除前要問的是「被依賴
的那個 job 現在到底在做什麼」,而不是「我有沒有讀它的 output」。**

**同類風險面:** job 併軌／改名會同時讓 branch protection 的 required checks
清單失效(舊名不再回報＝PR 永遠 pending,不是紅燈)。PR #116 的 `build` →
`build-bundle`、PR #216 的 `changes`/`framework-check`/`linear-check`/
`migration-guard` → `guards` 都屬於這一類。**動 job id 的 PR,收尾要同時檢查
Settings → Rules 與 Settings → Branches 兩處的清單**(兩套系統獨立,required
checks 取聯集)——這一條已寫在 `.claude/rules/github-actions.md`,此處只記
「它今天又被觸發了一次」。
## 2026-08-07｜bash-guard 誤擋 git commit:訊息文字被當成要本機跑 journey

renewal-rewards-automation-test 實作期間,commit message 內含「pytest_expr」
字樣被 bash-guard 判成要在本機執行 journey 而擋下 `git commit`;之後多次
在指令文字含「pytest」時(即使只是 grep 文件)重演。guard 應只解析指令
本體(執行檔與參數),不該掃 heredoc/檔案路徑/`-m` 訊息文字。繞法:訊息
先寫檔再 `git commit -F`。修 guard 時注意:同一場 session 也證明 guard
該擋的它都有擋住,收窄比對範圍時別把真攔截一起放掉。

## 2026-08-07｜--collect-only 抓不到 pytest-bdd 的兩類執行期缺口

journey-offline 軌的 `--collect-only` 能證明「情境都收集得到」,但有兩類
錯誤要到執行期才炸,窄選 dispatch 是目前唯一的驗證面:
(1) **步驟關鍵字不匹配**:pytest-bdd 的步驟綁定分 Given/When/Then,同一句
在 ch3 是 Given、在 ch6 是 When 之後的 And(=When),只註冊 @given 會在
執行期 StepDefinitionNotFound(run 31154089148)。同句多關鍵字使用時
@given/@when 雙註冊。
(2) **重複引號值變成第二個 capture**:parse 式步驟同一行出現兩個相同的
引號值,第二個會被當成新參數,執行期報 fixture not found
(run 31150698317)。撰寫 feature 時同一行避免重複引號值。

## 2026-08-07｜被 e2e 斷言的 UI 文案缺 vitest 防線:A16 是唯一漏網

70_renewal_saga 斷言的 UI 文案裡,「新約重置」「任務免費續約」都耦合到
有 vitest 覆蓋的具名常數(REWARD_SOURCE_LABELS / FREE_RENEWAL_NOTE),
文案漂移本地就紅;唯獨 A16「請等待審核完成,或聯繫客服」是
PaymentCheckout.tsx 內嵌 JSX 字面字串,無常數無測試,漂移要等 30-90
分鐘的 journey dispatch 才被抓到。建議小票:抽具名常數+一則輕量
vitest。通則:**要被 e2e 拿來斷言的文案,先抽常數讓 vitest 看得到**。

## 2026-08-07｜假閘門｜文件宣稱的機械把關,要驗證它在「當前方案」下真的會被執行

`CLAUDE.md` 與 `.claude/rules/github-actions.md` 都寫著「branch protection 的
required check 只有 `ci-ok` 一個」,`ci.yml` 也為此設計了單一匯總 job。三份
文件一致、UI 上規則也確實存在(ruleset `protect-main-develop`,建於
2026-07-25 06:08,`enforcement: active`)——但整整 13 天完全沒有生效。

原因是 **ruleset／branch protection 在 private repo 上是付費功能**。免費方案
下規則可以建立、可以顯示 `active`,卻不會被執行,而且**沒有任何警告**:
API 的 `GET /rulesets` 回 `Upgrade to GitHub Pro or make this repository
public`,`GET /branches/develop` 回 `protected: false`,UI 上則只是「Merge
按鈕是綠的」。

期間三個案例,都是 CI 還在跑就合併成功:

| PR | merged | 當下狀態 |
|---|---|---|
| #109 | 07-25 08:38:40 | `api-tests` 08:40:58、`e2e-tests` 08:42:25 才完成 |
| #205 | 08-07 05:50:46 | `ci-ok` 05:51:01 才完成 |
| #199 | 08-07 11:42:45 | `e2e-tests`／`api-tests` 皆 in_progress,`ci-ok` 尚未建立 |

#109 當時被歸因為「required checks 清單漂移,`build` 一綠就滿足條件」,並據此
寫進規則文件。那個歸因**是錯的**——清單裡有什麼根本不重要,規則整個沒有被
詢問。錯誤歸因的代價是:它看起來像已經修好了(改成單一 `ci-ok` 匯總點),於是
同一個缺陷又發生了兩次。2026-08-07 repo 改為 public 後閘門才真正開始擋人。

**通則:文件宣稱「有機械把關」時,要驗證的不是「規則設了沒有」,而是「規則在
當前的可見性／方案／權限下會不會被執行」。** 付費功能在免費方案上的典型失效
模式是**靜默降級**而非報錯,所以「UI 上看得到」不構成證據。可驗證的問法是拿
API 去問生效結果,而不是問設定值:

```bash
gh api repos/:owner/:repo/rules/branches/develop        # 生效中的規則
gh api repos/:owner/:repo/branches/develop --jq .protected
```

**同類掃描:** 同一個「付費功能靜默失效」風險面還有 **GitHub Environments 的
required reviewer**——`CLAUDE.md` 宣稱「正式站部署需人工核准:main 的部署綁
`production` 環境」,而 environment protection rules 同樣是 private repo 的
付費功能。轉 public 後應已生效,但**未經驗證**,待人到 Settings → Environments
確認(`main` 收到 push = 正式站部署,這是不可逆的一步)。

**連帶效果:** 轉 public 也讓「CI 費用紀律」與 `github-actions.md` 規則 8 的
成本論證失去前提(標準 runner 對 public repo 免費)。兩處已標註前提變更、
規則力度待裁決,未擅自鬆綁——8b 有 `check-workflows.py` 的表格自測綁著。

## 2026-08-07｜漏網｜「文字在視線之外」沒有任何閘門攔得到

公告橫幅（`MaintenanceBanner`）的訊息被 `flex-1` 推到滿版橫條的邊緣，
桌機寬版上落在使用者視線動線之外。CI 全綠、biome 全綠、e2e 全綠——
使用者自己看到才回報。

**攔得到嗎：攔不到。** 這是視覺判斷，不是可斷言的行為。最接近的閘門
`e2e/test_overflow_sweep.py` 只在 **375px** 巡溢版且為 report-only，
而這個缺陷恰好**只在桌機寬版成立**（手機上文字填滿整列，排版是對的）。
補一條「元素必須置中」的機械檢查沒有意義——置中不是普世正確，
是這個情境（滿版橫條 + 中軸版面）才正確。

**處置**：升級成準則而非閘門——`ui-ux-guidelines.md` §7 新增「滿版橫條的
內容必須對齊版面中軸」，`plan-reviewer-uiux` 以該檔為參照對象，下次規劃
新增滿版元素時會在審查時被問到。同時記下推論：**mobile-first 不等於
「桌機不必驗收」**，本例的失效模式正是「手機對、桌機錯」。

**同類掃描（兩件事）**

1. *滿版貼邊*：全站只有 `MaintenanceBanner` 一個滿版橫條，已修。其餘
   `border-b` 都在卡片／表格／dialog 內部，不適用。
2. *關閉鈕熱區 < 44px（準則 §1）*：同病灶還有兩處，**未修**——
   `notifications/ToastCard.tsx`（16px icon、無 padding）與
   `notifications/NotificationCard.tsx`（20px icon、無 padding）。
   兩者都不在本次 diff 的責任範圍，且直接放大會改變 toast／彈窗高度，
   需要各自決定用 `-m` 抵銷或接受變高。**待償還**，碰到該檔時順手修
   （童子軍原則）。作法可參考本次的 `-my-3` 抵銷法：熱區長大、容器不變高。
