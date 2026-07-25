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
