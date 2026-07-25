# 推薦網絡排序器邏輯修正 規劃書

<!-- 由 /plan-feature 從 docs/_templates/plan.md 實例化 -->
<!-- v2:依 review.md(1 P0 / 6 P1 / 15 P2 / 5 需人工裁決)與人審裁決修訂 -->

分支對應:本規劃於 `claude/recommendation-network-sorter-logic-ap6yza`
(web session 自動分支)產出;若要走守衛版三段式流程,實作時切
`feature/referral-network-sort-logic`(目錄名 = 該 slug)。

## 0. 一句話

依需求方指定的兩條排序規則調整「我的推薦網絡」:預設由舊到新,且每一代
依**自身加入時間**排序、世代之間互不影響。

> 動機註記:現行以「子樹最新加入時間」為鍵,下線一加入就把上線推到頂端。
> 「使用者看不懂順序」是規劃者的**推論**,需求方原話只給了兩條規則、未描述症狀
> ——凡從此推論長出的支線(如「分支有新血」提示)一律不得當成需求。〔P2-15〕

## 1. 使用者需求

- 規格書對照:`docs/Uknow_Software_Specification.md` §3.2.3 推薦系統
  (`/referrals`)——僅有「推薦關係樹狀圖」一句,**排序器無明文規格**(開放問題 #1)。
- **需求 A(預設)**:預設排序為「最舊加入」(`updated_asc`),取代現行
  「最新加入」(`updated_desc`)。
- **需求 B(排序語意)**:一代自己排自己的、二代在其父節點下自己排自己的、
  三代同理;世代之間互不影響——排序鍵改用節點**自身** `joinedAt`。

  > **人審裁決(P0-1,2026-07-25)**:需求 B 指的是**僅換排序鍵**,維持現行
  > 巢狀懶載入樹的呈現(展開的下線顯示在該上線底下,一代節點因此不連續)。
  > 已排除的替代解讀:世代分組呈現(整批一代排在一起、二三代各自成區)。

驗收情境(種子見 §5「測試種子調整」;加入時間遞增:王大明 < Alice < 陳小華
< 𠮷 < Zoe,王大明 → 陳小華 → 𠮷 為同一分支):

| # | 操作 | 期望 |
|---|---|---|
| A1 | 首次進頁面(未曾選過排序),**sm+ 螢幕** | 排序晶片顯示「最舊加入」(手機為 icon-only,見開放問題 #6) |
| A2 | 回訪使用者(localStorage 已存 `updated_desc`) | **維持其選擇**,仍是新到舊;不清除、不告知〔人審裁決〕 |
| B1 | 預設(最舊加入)看一代 | 王大明、Alice、Zoe(各自加入時間由舊到新) |
| B2 | 同上,`𠮷`(三代)是全網最新血之一 | **不影響**王大明的位置——王大明仍在最前 |
| B3 | 切「最新加入」 | Zoe、Alice、王大明(B1 的完全反轉) |
| B4 | 展開王大明(**多個二代**)、再展開陳小華(**多個三代**) | 各層只依該層自身加入時間排,升冪降冪兩方向皆可證偽 |
| B5 | 兩節點 `joinedAt` 完全相同 | 升冪 `userId` 升序、降冪(reverse 後)`userId` 降序——全序、不漂移 |

不做(明確排除,防範圍蔓延):

- 姓名排序(`name_asc`/`name_desc`)的混排規則——維持核定行為,一字不動
- 「需要關注」清單排序——自有緊急度規則,不共用 `sortNodeIds`
- 排序選項**文字**(核定文案,一字不動;但**顯示順序**依人審裁決調整,見 §4)
- 新增排序模式、樹狀渲染方式
- **列上露出加入日期**〔人審裁決,2026-07-25〕:排序鍵改對後,使用者在列上
  仍看不到任何佐證順序的資訊(加入日期只在展開的詳情裡),需求方裁決本次不做
  ——明文記錄,不讓它靜默落空〔P1-5〕
- **一次性告知(toast)**〔人審裁決〕:順序改變不主動提示

## 2. 系統設計

### 2.1 現況 Review(排序器全鏈路)

排序是**伺服器權威**,唯一實作:`supabase/functions/api/index.ts`
`sortNodeIds()` L2395–2411。三個呼叫點與其傳入的 id 集合:

| 端點 | 傳入 `sortNodeIds` 的集合 | 世代組成 |
|---|---|---|
| `/referrals/network/overview` L2436 | `net.gen1Ids` | **同一層**(全為一代) |
| `/referrals/network/children` L2487 | `childrenOf[parentId]` | **同一層同一父** |
| `/referrals/network/search` L2529 | `hitIds`(全網命中) | **跨世代**(唯一混層處) |

**發現 1(結構已對,鍵才是問題)**:overview / children 傳入的一律是同層兄弟
集合,樹由前端依 `childCount` 逐層懶載入組裝,不存在跨代合併排序——需求 B 的
偏差**只**來自排序鍵。

**發現 2(偏差來源)**:`updatedAsc` 用 `net.subtreeMs.get(uid)`(L2407)——
`loadNetwork()` L2340–2350 bottom-up 算出的「自身與可見子樹最新加入時間」。
既有測試 L98 的標題「子樹新血勝過自身較晚加入」正是在釘死這個行為。

**發現 3(欄位性質)**:`subtreeLatestJoinedAt` 全 codebase **無 runtime 讀取端**
(僅存在於 `index.ts` L2381、`api-contract.ts` L268、`referralNetwork.ts` L25、
兩側 fixture、`e2e/mocks/backend_api_mock.py` L629)。但它**不是無主的死欄位**:
`api-contract.ts` L258–259 註解明寫「供『更新順序』排序**與前端本地重排**」,
是被文件化的**預留位**。移除的正當理由是「換鍵後 `joinedAt` 已完全取代其用途」,
不是「沒人用」〔P2-8〕。

**發現 4(降冪機制健全)**:降冪一律「升冪排完 `reverse()`」(L2409),
兩方向永不漂移——不動,換鍵後自動繼續成立。

**發現 5(tie-break 全序,但有方向殘留)**:`tie()` L2397–2400 為
「`joinedAt` 降冪 → `userId` 字典序」。換鍵後主鍵與 tie 都是 `joinedAt`,
主鍵相等時 tie 的時間比較恆為 0、必落到 `userId`,是**全序**。
殘留:`name_*` 仍吃 `tie()`,同名者次序仍是「新的在前」,與新預設的心智模型
相反(僅同名時可見)→ 開放問題 #7〔P2-16〕。

**發現 6(伺服器權威在換鍵後變成可選)**:`joinedAt` 未遮罩、每個節點都有,
換鍵後 `updated_*` 前端完全排得出來,`referralNetwork.ts` L6–7 的分工註解自此
只對 `name_*` 成立。**仍維持伺服器排序**,理由:`name_*` 必須留在伺服器,
下放 `updated_*` 會變成兩套排序 = 兩份真相。已知代價:`useReferralData.ts`
L129 每次切排序都清 children 快取 + 重打 overview,使用者只是想倒轉列表,
整棵已展開的樹要重新一支支懶載入回來〔P2-8〕。

**發現 7(休眠面)**:DB 仍有已 grant 給 authenticated 的
`public.referral_tree()`,回傳 `order by t.generation, t.referred_at`
(`20260620000003_functions_and_views.sql` L259),且 `supabase/README.md`
L18/L39 仍記載它是「三代推薦樹」的資料來源。**三個端點與前端都未使用它**
(前端無任何 `.rpc(` 呼叫),不構成第二條排序路徑 → 過時文件併入開放問題 #1〔P2-17〕。

### 2.2 變更

- **無端點/參數變更**;無資料庫 migration、無 RLS 變更。
- **排序鍵**:`updatedAsc` 的鍵 `net.subtreeMs.get(uid)` → 節點自身加入時間,
  **沿用既有 `msOf()`(L2343)的防護寫法** `(Date.parse(x ?? '') || 0)`
  ——直接寫 `Date.parse(net.joinedAtOf.get(uid))` 型別不過(`string | undefined`),
  只補 `?? ''` 又會讓 NaN 進比較器〔P2-4〕。其餘結構、`reverse()`、`nameAsc`、
  `tie()` 全不動。
- **預設值** `'updated_desc'` → `'updated_asc'`,共**四處**(前三處為回落值,
  第四處是視覺基準,同一事實不要切成兩章描述)〔P2-7〕:
  1. `supabase/functions/api/index.ts` `parseSortMode()` L2393
  2. `src/utils/referralNetwork.ts` `parseSortMode()` L77(含 L73 docstring)
  3. `src/utils/referralNetwork.ts` `readStoredSort()` catch L87
  4. `src/components/referral/ReferralTreeView.tsx` L534 指示點基準

  > **理由更正**〔P2-1〕:先前寫「否則回聲與快取判斷會漂」——**不成立**。
  > 前端三個呼叫一律顯式帶 `sort`(`useReferralData.ts` L72/L146/L165),
  > 伺服器 `parseSortMode` 的回落分支對前端**不可達**,回聲值恆等於請求值。
  > 正確理由:維持 API 對外一致性(直接打 API、e2e mock 才觸得到),
  > **Phase 2 不影響前端可見行為**——實作/回滾時勿誤判階段依賴。

  > 建議收斂〔P2-7,見開放問題 #8〕:在 `@contract` 匯出
  > `DEFAULT_NETWORK_SORT`,四處改讀它,消滅跨 runtime 的四份複本。

- **回應形狀變更(Phase 5)**:移除 `subtreeLatestJoinedAt` 欄位與 `subtreeMs` 計算。

  > **理由更正**〔P1-2 / P2-2〕:先前寫「後端 schema 是 exact」——**不成立**。
  > `api-contract.ts` L84–92 的 `obj()` 只走 `Object.entries(shape)`,未宣告的
  > 多餘欄位一律放行,`assertShape` **抓不到**「schema 刪了、後端還在吐」。
  > 真正逼同一 commit 的是 `buildFlatNode`(L2367)宣告了回傳型別 `NetworkNode`,
  > 物件字面量吃 TS excess-property check。結論(同一 commit)不變,但這也暴露
  > 「payload 多餘欄位無任何 runtime 防線」→ Phase 5 必須補執行期斷言(見 §5)。

## 3. 架構影響

| 檔案 | 變更 |
|---|---|
| `supabase/functions/api/index.ts` | `sortNodeIds` 排序鍵、`parseSortMode` 預設、`loadNetwork` 移除 `subtreeMs`、`buildFlatNode` 移除欄位、L2340/L2385–2387 註解 |
| `supabase/functions/_shared/api-contract.ts` | `NetworkNodeSchema` 移除欄位、L254–259 註解、(建議)新增 `DEFAULT_NETWORK_SORT` |
| `src/utils/referralNetwork.ts` | 兩處預設 + L73 docstring、型別改 re-export `@contract` |
| `src/components/referral/ReferralTreeView.tsx` | L534 指示點基準 |
| `e2e/mocks/backend_api_mock.py` | L306/L312/L640 `sort` 回聲(Phase 3)、L629 移除欄位(Phase 5) |

- 不新增模組/路由/頁面;不繞過 `apiClient`;不動 UserContext;與 appShell 契約
  無交集(`appShell.test.ts` 釘的四件事都不碰);multi-step-flow 四契約**不適用**
  (適用範圍是「新增的連續多步流程」,對列表排序偏好無一適用)。
- 效能:淨**減少**——少一輪 O(N) bottom-up 迴圈與一個 Map,payload 每節點少一個
  ISO 字串。查詢次數與索引使用不變。
- 安全:不動姓名遮罩、不動 children 子樹授權、不動 search 真名比對邊界。
- **契約雙寫風險**〔P2-6〕:`src/utils/referralNetwork.ts` 手抄契約型別,繞過本專案
  既有的 `@contract` 慣例(`rewardHistory.ts`、`useRewardData.ts`、
  `MemberManagement.tsx`、`RewardHistory.tsx` 都是 `import type { X } from '@contract'`,
  只有推薦網絡這組手抄)。實測:**只刪 `api-contract.ts` 而忘了前端那份,
  `npm run check` 與 `deno task check` 全部照綠**——防線是單向的。
  → Phase 5 先改 re-export,刪欄位收斂成一處。
  (e2e mock 是第三份手抄鏡像,fixture-only、不具契約驗證能力。)
- **localStorage 無需 migration**〔人審裁決 A2〕:明示選擇優先,曾選過的人保留其
  選擇(即使選的是 `updated_desc`);沒選過的吃新預設。不清除、不告知。
- **SWR 快取**〔P2-5 更正〕:「不會閃舊順序」**只對「沒選過排序」的使用者成立**。
  `DataCacheProvider` 用 sessionStorage,F5 後快取仍在;明示選過 `updated_desc`/
  `updated_asc` 的使用者 `cached.sort === sortRef.current` 會命中
  (`useReferralData` L105),**會先畫一次舊鍵排出的順序**,待背景 revalidate 才更正。
  接受此一 round-trip 的重排,不特別處理。

## 4. UI/UX

- **排序指示點基準必須同步**(`ReferralTreeView.tsx` L534):寫死
  `sort !== 'updated_desc'`,不改則語意**完全反轉**(預設亮點、選「最新加入」反而
  不亮)。全 repo 吃 `'updated_desc'` 字面值做視覺判斷的**只有這一處**。
- **文案不動**(核定文案,測試釘死)。附帶效果:「最新加入」在換鍵後更名符其實。
- **下拉選項重排,預設項置頂**〔人審裁決,2026-07-25〕:`SORT_OPTIONS` 順序改為
  **最舊加入 → 最新加入 → 姓名 A→Z → 姓名 Z→A**,讓預設選項出現在清單首位、
  單選圓點落在第一項。**文字一字不動**,只動陣列順序。
  連帶影響(同一份陣列同時驅動三處呈現,改一處全動):
  - 下拉選單項目順序(`DropdownMenuRadioItem` 迭代 `SORT_OPTIONS`)
  - 觸發器晶片內四個疊放標籤的 DOM 順序(L520–533,`hidden sm:grid` 同格疊放)
  - 晶片寬度不受影響(仍為最寬標籤之寬,四個標籤全數佔位)
- **手機端狀態可見性缺口**〔P1-6,開放問題 #6〕:排序晶片文字層是 `hidden sm:grid`
  (L520),手機為純 icon,狀態補償只有「非預設才亮」的琥珀點。新預設「最舊加入」
  又是反直覺方向(一般清單慣例是新→舊),手機使用者會看到一串最早的人、畫面零線索。
  A1 驗收因此**明文限縮為 sm+**,手機端解法待裁決。
- **a11y 既有債會被放大**〔P2-11,開放問題 #6〕:觸發器 `aria-label="排序方式"`
  (L514)永不含目前排序值;舊預設符合慣例時影響小,改成非慣例預設後,螢幕閱讀器
  使用者在手機上完全無從得知目前順序。
- **切排序無載入回饋**〔P2-12,開放問題 #9〕:`setSort`(L123–134)在已有資料時走
  `isValidating` 而非 `loading`,而 `ReferralManagement.tsx` L16 根本沒解構
  `isValidating`——晶片文字立刻變、已展開分支立刻收合,但清單原地維持舊順序直到
  回應才默默重排。既有行為,但改預設後「老使用者上線第一件事就是切回最新加入」
  會大量觸發這段空窗(LINE 內建瀏覽器更慢)。
- 空態、載入態、錯誤態、搜尋列、行動版佈局:**全不變**(三態皆不依賴 sort 值;
  首次載入走全頁 loading,不會先閃舊順序)。
- 已知取捨:舊排序鍵順帶提供了「某分支有新成員」的隱性提示,改後消失。既有替代
  管道:獎勵頁的推薦獎勵紀錄帶被推薦人姓名(含二/三代)、任務頁有當月新推薦計數。
  本頁核心使用情境偏「維護既有下線」(AttentionBanner 置頂、列右側到期倒數優先於
  分支數),「看誰新加入」不是主線 → 本次不補(開放問題 #4)。

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

**測試種子調整(Phase 1 前置)**〔P1-3〕:既有種子每個父節點只有 1 個子節點
(王大明→陳小華→𠮷),**單子節點分支無法證偽任何層內排序**,需求 B 只在一代被驗到。
Phase 1 須加開:王大明下再加一個加入時間早於陳小華的二代、陳小華下再加一個三代,
讓 children 端點在升冪與降冪兩方向都有可證偽的期望值(驗收 B4)。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 排序鍵:子樹最新 → 自身 `joinedAt`(含種子加開) | `supabase/functions/api/network-endpoints.test.ts`(Deno) | B1/B2/B4/B5:各層依自身加入時間排、子樹新血不推升上層、同分全序 |
| 2 | 伺服器預設 → `updated_asc` | 同上 | 無 `sort` 與非法 `sort` 皆回落並回聲 `updated_asc`(不影響前端可見行為) |
| 3 | 前端預設 → `updated_asc`(兩處回落 + docstring + e2e mock `sort` 回聲)＋ `SORT_OPTIONS` 重排 | `src/utils/referralNetwork.test.ts`(**jsdom**) | 三種回落路徑一致;`SORT_OPTIONS` 首項為 `updated_asc`/「最舊加入」,四項文字不變 |
| 4 | 指示點基準 + A1 使用者可見層 + 選單順序 | `src/components/referral/ReferralTreeView.test.tsx`(jsdom) | 預設不亮點;`sort=updated_asc` 時 `sort-label` 顯示「最舊加入」;選單四項順序為 最舊/最新/A→Z/Z→A |
| 5 | 移除死欄位(先收斂型別為 `@contract` re-export) | 兩側測試 + e2e mock + `npm run check` | 回應不得再含該 key(執行期斷言);契約與註解不再描述已不存在的語意 |

實作要點:

- **Phase 1 的順序斷言一律顯式帶 `?sort=updated_asc` / `?sort=updated_desc`**〔P2-3〕
  ——既有 L99/L109 與 L162/L164 都是「不帶 `sort`」的呼叫,若沿用,Phase 1 改鍵後
  期望值變 `[Zoe, Alice, 王]`、Phase 2 改預設後又變回 `[王, Alice, Zoe]`,同一批
  斷言連翻兩次。改為顯式參數後,「排序鍵」與「預設值」各自只被一個測試釘住,
  Phase 2 只需驗 `sort` 回聲。
- **Phase 3 落點是 jsdom 不是 node**〔P2-9〕:`referralNetwork.test.ts` L1 已有
  `// @vitest-environment jsdom` pragma(`readStoredSort` 用 localStorage)。
- **Phase 5 的紅燈是執行期斷言**〔P1-2〕:`assert(!('subtreeLatestJoinedAt' in node))`
  加在既有 overview 測試內。純刪欄位只得到 typecheck 紅,而
  `tdd-implement/SKILL.md` L30/L34 明訂「typecheck 紅不叫紅燈」;這條斷言同時是
  唯一能證明欄位真的離開 payload 的 runtime 防線。
- **e2e mock 的 `sort` 回聲屬 Phase 3**(L306/L312/L640),欄位移除才屬 Phase 5
  〔P2-10〕。實測既有 e2e 不會紅:`referral_steps.py` L24 種下的 `updated_desc`
  快取會被判為 miss,但情境斷言的是「新成員文字出現」,重新請求後照樣通過。
- Phase 5 須在 Phase 1 之後(換鍵後 `sortNodeIds` 才與 `subtreeMs` 解耦),
  且可獨立 revert 而不會把排序鍵拉回舊語意。

**既有測試受影響清單**(需求變更導致的預期值變更,須連同測試標題/註解一起改寫,
禁止改測試遷就實作):

- `network-endpoints.test.ts` L98–120(標題含「子樹新血勝過自身較晚加入」,premise
  整個反轉)、L122–127、L144–148、L161–164、檔頭註解 L6/L14
- `ReferralTreeView.test.tsx` L57(fixture 欄位)、L65(fixture 預設)、L229–235(指示點)、
  **L187–192 與 L215–220(晶片疊放標籤順序、選單項目順序——`SORT_OPTIONS` 重排後
  兩處期望陣列都要改成 最舊/最新/A→Z/Z→A;文字本身不得更動)**
- `referralNetwork.test.ts` L5/L28–32/L50–51/L60–62(回落預設)、
  **L36–45(`SORT_OPTIONS` 完整陣列斷言,重排後首項變 `updated_asc`)**
- 姓名排序測試(`network-endpoints.test.ts` L129–143)**不受影響**,不得順手改動
  ——選單順序與伺服器排序邏輯無關,`SORT_OPTIONS` 只是前端呈現清單

## 6. 開放問題(逃生口)

**已裁決(2026-07-25 人審)**:

- [x] **需求 B 的解讀**〔P0-1〕→ **僅換排序鍵**,維持現行巢狀樹呈現(見 §1)
- [x] **列上是否露出加入日期**〔P1-5〕→ **不做**,已入 §1「不做」清單
- [x] **回訪使用者的 localStorage**〔P1-4〕→ **不動**,尊重明示選擇;亦不做一次性告知
- [x] **#3 下拉選項是否重排**〔原建議「不重排」被推翻〕→ **重排,預設項置頂**:
      順序改為 最舊加入 / 最新加入 / 姓名 A→Z / 姓名 Z→A(見 §4)

**待裁決**:

- [ ] **#1 規格書回填**:§3.2.3 對排序器無任何描述,本次改的是使用者可見行為。
      要不要一併把排序器規格(四模式、預設、逐代自排語意、`joinedAt` 的定義)寫進
      規格書?併入範圍建議含 `supabase/README.md` L18/L39 對 `referral_tree()` 的
      過時描述〔P2-17〕。(建議:要。)
- [ ] **#2 search 命中 >50 時保留哪一批**〔**P1-1,本次最實質的行為缺口**〕:
      search 在**排序後**才 `slice(0, SEARCH_LIMIT=50)`(L2529–2531),排序鍵與
      預設方向一改,「哪 50 個人搜得到」就跟著換——預設轉 asc 後回傳的是**最舊的
      50 位**,大網絡中最新加入的下線會直接搜不到,而 UI 只 render `matches`、
      不顯示 `total`(L569–571),**截斷是靜默的**。
      → 需裁決:(a) search 固定用「最新在前」;(b) 先取前 50 再排序;(c) 維持現狀
      並顯示 total/截斷提示。並在測試補一個 >50 的命中集把決定釘死。
- [ ] **#4 失去的「分支有新血」提示**要不要補?(建議:**本次不補**,替代管道見 §4。)
- [ ] **#5 Phase 5(移除死欄位)是否併入本次**?(建議:**併入**——留著會讓契約
      註解說著已不存在的語意。若要拆,Phase 1–4 可獨立出貨。)
- [ ] **#6 手機端排序狀態可見性**〔P1-6 + P2-11〕:(a) 手機也顯示當前排序短標籤
      (晶片已用 grid 疊放取得固定寬,不會抖動);(b) 維持 icon-only,A1 驗收限縮
      sm+;(c) 至少把 `aria-label` 改成含當前排序值(零視覺變更、償還既有 a11y 債)。
      (依需求方「這次只改排序」的範圍偏好,傾向 (b)+(c)。)
- [ ] **#7 `tie()` 的方向殘留**〔P2-16〕:`name_*` 仍吃「`joinedAt` 降冪」的 tie,
      同名者次序仍是「新的在前」,與新預設心智模型相反(僅同名時可見)。
      → 動核定行為 vs 明記為刻意不動。
- [ ] **#8 預設值是否收斂為單一來源**〔P2-7〕:在 `@contract` 匯出
      `DEFAULT_NETWORK_SORT`,四處改讀它。(建議:要,順手償還跨 runtime 複本。)
- [ ] **#9 切排序的無回饋空窗**〔P2-12〕:本次以既有 `isValidating` 補骨架/降透明度,
      或判定為既有債另案處理(**要明文記錄,不留白**)。
- [ ] **#10 `joinedAt` 的語意**〔需人工裁決,系統視角〕:`joinedAt` 取自
      `referral_edges.referred_at`,而換推薦人續約時 rewire **只改
      `referrer_user_id`、不更新 `referred_at`**
      (`20260724000004_apply_referral_side_effects_pair_history.sql` L87–92)——
      被 rewire 過來的下線帶著更早的時間戳,在新預設下會直接坐上該上線清單的第一位,
      語意像「最早加入我的網絡」但事實不是。
      → 接受(並在 #1 回填時寫明 `joinedAt` = 推薦邊建立時間)或另訂 rewire 時間語意。
- [ ] **#11 「最舊加入」當預設的理由**〔需人工裁決,UI/UX 視角〕:規劃書未記錄理由,
      也未檢驗長清單情境——一代 roots 由 overview 一次全回、前端 `roots.map` 全數
      渲染(**無分頁/虛擬化**),下線多的人新加入者永遠沉在最底,手機要滑到底。
      → 回填需求方的真實理由(合理推測:「舊→新 ≈ 續約到期先後」,若屬實則此預設
      站得住腳),並確認下線數量大時的預期行為。**理由不入檔,下一個人會當 bug 改回去。**

## 7. 風險與回滾

- **最壞情況**:排序順序不如需求方預期(尤其 #2 的 search 截斷決策)。影響僅止於
  清單呈現順序——不涉及金流、獎勵計算、權限或資料寫入,**無資料面不可逆風險**。
- **回滾**:純程式碼變更,無 migration、無資料轉換、無 localStorage 格式變更 →
  `git revert` 即完全復原。已存 `updated_asc` 的使用者在回滾後仍是合法值。
- **部署偏移**〔P2-2 理由更正〕:前端(Cloudflare Pages)與 Edge Function 分開部署。
  排序鍵不一致只造成順序暫時不同(自癒);`subtreeLatestJoinedAt` 的安全性來自
  **前端無 runtime 形狀驗證**(`assertShape` 只在 Deno 測試用),故少一個欄位不會
  炸前端——不是因為「schema 是 exact」(該說法不成立)。
- **驗證管道**:develop 有 persistent Supabase project,push 後 Edge Function 自動
  部署,可用真後端驗證三個端點的實際順序。
