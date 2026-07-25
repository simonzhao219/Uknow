# 推薦網絡排序器邏輯修正 規劃書

<!-- 由 /plan-feature 從 docs/_templates/plan.md 實例化 -->
<!-- v2:依 review.md(1 P0 / 6 P1 / 15 P2 / 5 需人工裁決)與人審裁決修訂 -->

分支對應:本規劃於 `claude/recommendation-network-sorter-logic-ap6yza`
(web session 自動分支)產出;若要走守衛版三段式流程,實作時切
`feature/referral-network-sort-logic`(目錄名 = 該 slug)。

> **行號基準(2026-07-25 rebase 到 `origin/develop` = `5d5e7ed` 後重新核對)**
>
> develop 進了 23 個 commit,`index.ts` +1006 行、`api-contract.ts` +342 行、
> `ReferralTreeView.tsx` +27 行(頭像配色改綁世代,與排序無關)。
> **排序器邏輯本身一字未改**,規劃書全部前提仍成立;下文行號多為 rebase 前的
> 基準,實作時以下列重新核對過的錨點為準:
>
> | 錨點 | 舊行號 | **新行號** |
> |---|---|---|
> | `sortNodeIds()`(內容完全相同) | 2395 | **2553** |
> | `updatedAsc` 吃 `subtreeMs` | 2407 | **2565–2566** |
> | `tie()` | 2397 | **2555–2559** |
> | `parseSortMode()` 回落 | 2393 | **2548–2551** |
> | `subtreeMs` bottom-up 計算 | 2342–2350 | **2488–2494** |
> | `buildFlatNode` 輸出該欄位 | 2381 | **2539** |
> | `SEARCH_LIMIT = 50` / `.slice()` | 2414 / 2530 | **2573 / 2695** |
> | `NetworkNodeSchema.subtreeLatestJoinedAt` | 268 | **302** |
> | `ReferralTreeView` 指示點 `sort !== 'updated_desc'` | 534 | **531** |
>
> 未變動的檔案(行號仍有效):`src/utils/referralNetwork.ts`(L10/L54/L67/L73/L77/L87)、
> `src/hooks/useReferralData.ts`、`src/components/ReferralManagement.tsx`。
> 已複驗:`obj()`(L90–98)仍只檢查已宣告的 key、放行多餘欄位 → P1-2 的推理成立;
> `@contract` 尚無 `DEFAULT_NETWORK_SORT`,由 Phase 2 新增。

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
相反(僅同名時可見)。

> **人審裁決(2026-07-25,採納建議)**:`tie()` 的時間比較**改為升冪**。
> 理由:讓「升冪排完 `reverse()` 得降冪」的機制在**所有鍵上語意一致**——
> 升冪模式下每一個比較鍵都是升冪,降冪就是整體反轉,不再有一個鍵偷偷反向。
> 影響面僅限**真名完全相同**的兩人在 `name_*` 下的先後,且**無任何既有測試
> 釘死**(`network-endpoints.test.ts` L129–143 的姓名測試用的是相異姓名
> 王大明/Alice/Zoe)。Phase 1 須補一組同名 fixture 把新行為釘死。

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

  > **人審裁決(2026-07-25,開放問題 #8 = 是)**:在 `@contract` 匯出
  > `DEFAULT_NETWORK_SORT`,四處改讀它,消滅跨 runtime 的四份複本。
  > 前後端共用同一個常數,日後改預設只需動一處。

- **回應形狀變更(Phase 5)**:移除 `subtreeLatestJoinedAt` 欄位與 `subtreeMs` 計算。

  > **理由更正**〔P1-2 / P2-2〕:先前寫「後端 schema 是 exact」——**不成立**。
  > `api-contract.ts` L84–92 的 `obj()` 只走 `Object.entries(shape)`,未宣告的
  > 多餘欄位一律放行,`assertShape` **抓不到**「schema 刪了、後端還在吐」。
  > 真正逼同一 commit 的是 `buildFlatNode`(L2367)宣告了回傳型別 `NetworkNode`,
  > 物件字面量吃 TS excess-property check。結論(同一 commit)不變,但這也暴露
  > 「payload 多餘欄位無任何 runtime 防線」→ Phase 5 必須補執行期斷言(見 §5)。

### 2.3 搜尋不得靜默截斷(人審裁決,開放問題 #2)

**需求方原則(2026-07-25)**:「搜尋一定要搜得到人,而且**符合條件的都應該可以
搜得到**」——並要求此原則推廣到其他篩選器(首頁、獎勵明細)。

**釐清**:推薦網絡搜尋**已經是後端搜尋**(伺服器用未遮罩真名比對,`index.ts`
L2516–2517;前端只有遮罩名,本來就搜不了)。破口不在前後端分工,而在
**`SEARCH_LIMIT = 50` 的應用層截斷 + 前端不顯示總數**——伺服器其實已經回傳
`total`(`NetworkSearchResponseSchema` L302),但 `ReferralTreeView.tsx` L569–571
只 map `matches`,`total` 從未被渲染,**截斷完全無感**。

**專案已有正確範例,照抄即可**:

| 位置 | 是否符合原則 | 做法 |
|---|---|---|
| `/rewards/history`(獎勵明細)L2183–2208 | ✅ **符合** | DB 端 `.in()` 篩選 + `count:'exact'` + `.range(offset,…)`;UI `RewardHistory.tsx` L281–288 顯示「已顯示 X / Y 筆記錄」+ 載入更多。程式碼註解已明寫此原則 |
| 推薦網絡 `attention` L2455 | ✅ 符合 | 回傳 `total` + `items`,`AttentionBanner` L279–285 顯示總數與 overflow |
| 推薦網絡 `search` L2529–2531 | ❌ **違反** | 排序後 `.slice(0, 50)`,`total` 有回傳但 UI 不顯示 |
| 首頁 `HomePage.tsx` L147–160 | ❌ **違反(潛在)** | 見下 |

**設計(本次採用)**:`/referrals/network/search` 沿用 `/rewards/history` 的既有
模式,不發明新東西——
- 端點加 `offset`/`limit` query param(`limit` 上限沿用 200 的既有慣例),
  回應維持既有的 `total`(全部命中數,**不受 limit 影響**)
- 前端顯示「已顯示 X / Y 筆」+ 「載入更多」,與 `RewardHistory` 同一模式
- 排序鍵與方向照本次新規則;因為 `total` 與載入更多都在,**排序方向不再決定
  「誰搜得到」**,靜默截斷消滅

**首頁的同類破口(不併入本次,獨立 feature)**:`HomePage.tsx` L147–160
**繞過 Edge Function**,直接以 supabase-js 查 `public_listings`,
`.select('*')` **無 `limit`、無 `count`**,僅靠 PostgREST 的 `db-max-rows`
(Supabase 預設 1000)硬截;隨後在**瀏覽器端**做關鍵字/分類/性別/縣市篩選與
距離排序(L168–240)。刊登數超過該上限後,「符合條件的搜不到」必然發生且無感。
→ 需改為伺服器端篩選 + 分頁 + total,範圍遠超本次排序器 → 開獨立 feature
(見開放問題 #12)。

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
- **手機端狀態可見性**〔P1-6 + P2-11,人審裁決 2026-07-25:採納建議 (b)+(c)〕:
  排序晶片文字層是 `hidden sm:grid`(L520),手機為純 icon,狀態補償只有
  「非預設才亮」的琥珀點——這是**刻意的空間決策**(L510–511 註解:短標籤才不會
  撐爆窄螢幕的搜尋列),不推翻。處置:
  - **(b) 維持 icon-only**,驗收 A1 **明文限縮為 sm+**(見 §1)
  - **(c) 修 `aria-label`**:`aria-label="排序方式"`(L514)永不含目前排序值,
    改成 ``排序方式:${當前選項 label}``——**零視覺變更**,償還既有 a11y 債,
    讓螢幕閱讀器使用者在手機上也知道目前順序。納入 Phase 5 斷言。
- **切排序無載入回饋**〔P2-12,人審裁決:**本次處理,不留既有債**〕:
  `setSort`(L123–134)在已有資料時走 `isValidating` 而非 `loading`,而
  `ReferralManagement.tsx` L16 **根本沒解構 `isValidating`**——晶片文字立刻變、
  已展開分支立刻收合,但清單原地維持舊順序直到回應才默默重排。改預設後
  「老使用者上線第一件事就是切回最新加入」會大量觸發這段空窗(LINE 內建瀏覽器
  更慢)。處置:`ReferralManagement.tsx` 解構並下傳 `isValidating`,
  `ReferralTreeView` 於 revalidate 期間降透明度 + `aria-busy`(沿用既有
  children skeleton L233–243 的視覺語彙,不發明新模式)。
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
| 1 | 排序鍵 → 自身 `joinedAt` ＋ `tie()` 改升冪 ＋ 種子加開多子節點分支/同名組 | `supabase/functions/api/network-endpoints.test.ts`(Deno) | B1/B2/B4/B5:各層依自身加入時間排、子樹新血不推升上層、同分全序;同名者在 `name_*` 下依升冪時間 |
| 2 | 伺服器預設 → `updated_asc`,改讀 `@contract` 的 `DEFAULT_NETWORK_SORT` | 同上 | 無 `sort` 與非法 `sort` 皆回落並回聲 `updated_asc`(不影響前端可見行為) |
| 3 | **search 不再靜默截斷**:`offset`/`limit` 分頁,`total` 為全部命中數 | 同上 | 命中 >50 時可分頁取回**全部**;`total` 不受 `limit` 影響;越界 offset 回空陣列不報錯 |
| 4 | 前端預設 + `SORT_OPTIONS` 重排 + 改讀 `DEFAULT_NETWORK_SORT` + e2e mock `sort` 回聲 | `src/utils/referralNetwork.test.ts`(**jsdom**) | 三種回落路徑一致;`SORT_OPTIONS` 首項為 `updated_asc`/「最舊加入」,四項文字不變 |
| 5 | 指示點基準 + A1 可見層 + 選單順序 + `aria-label` 含當前排序 | `src/components/referral/ReferralTreeView.test.tsx`(jsdom) | 預設不亮點;`sort-label` 顯示「最舊加入」;選單順序 最舊/最新/A→Z/Z→A;可及名稱含當前排序值 |
| 6 | search 結果 UI:「已顯示 X / Y 筆」+ 載入更多 | 同上 | 命中 >limit 時顯示總數與載入更多;載完後按鈕消失(比照 `RewardHistory` L281–288) |
| 7 | 切排序載入回饋(`isValidating` 下傳並呈現) | 同上 | revalidate 期間清單降透明度 + `aria-busy`;回應後恢復 |
| 8 | 型別收斂 `@contract` re-export ＋ 移除死欄位 | 兩側測試 + e2e mock + `npm run check` | 回應不得再含該 key(**執行期斷言**);契約與註解不再描述已不存在的語意 |
| 9 | 規格書回填(以 code 為準) | 無測試落點(文件) | §3.2.3 補排序器規格;`supabase/README.md` L18/L39 更正 |

實作要點:

- **Phase 1 的順序斷言一律顯式帶 `?sort=updated_asc` / `?sort=updated_desc`**〔P2-3〕
  ——既有 L99/L109 與 L162/L164 都是「不帶 `sort`」的呼叫,若沿用,Phase 1 改鍵後
  期望值變 `[Zoe, Alice, 王]`、Phase 2 改預設後又變回 `[王, Alice, Zoe]`,同一批
  斷言連翻兩次。改為顯式參數後,「排序鍵」與「預設值」各自只被一個測試釘住,
  Phase 2 只需驗 `sort` 回聲。
- **Phase 4 落點是 jsdom 不是 node**〔P2-9〕:`referralNetwork.test.ts` L1 已有
  `// @vitest-environment jsdom` pragma(`readStoredSort` 用 localStorage)。
- **Phase 8 的紅燈是執行期斷言**〔P1-2〕:`assert(!('subtreeLatestJoinedAt' in node))`
  加在既有 overview 測試內。純刪欄位只得到 typecheck 紅,而
  `tdd-implement/SKILL.md` L30/L34 明訂「typecheck 紅不叫紅燈」;這條斷言同時是
  唯一能證明欄位真的離開 payload 的 runtime 防線。
- **e2e mock 的 `sort` 回聲屬 Phase 4**(L306/L312/L640),欄位移除才屬 Phase 8
  〔P2-10〕。實測既有 e2e 不會紅:`referral_steps.py` L24 種下的 `updated_desc`
  快取會被判為 miss,但情境斷言的是「新成員文字出現」,重新請求後照樣通過。
- Phase 8 須在 Phase 1 之後(換鍵後 `sortNodeIds` 才與 `subtreeMs` 解耦),
  且可獨立 revert 而不會把排序鍵拉回舊語意。
- **Phase 3 與 6 是一組**(後端分頁 + 前端呈現),但刻意分成兩個紅綠循環:
  Phase 3 證明「取得得到全部」,Phase 6 證明「使用者知道還有多少」。
- Phase 9 是文件,無測試落點——**不得**與程式碼階段合併 commit,以免規格書
  變更混在行為變更的 diff 裡看不出來。

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

- [x] **#1 規格書回填** → **要,且「以 code 為準」回填**:§3.2.3 補排序器規格
      (四模式、預設 `updated_asc`、逐代各自依自身 `joinedAt` 排序、降冪 = 升冪反轉、
      姓名混排規則、`joinedAt` 的定義見 #10);併入 `supabase/README.md` L18/L39
      對 `referral_tree()` 的過時描述更正〔P2-17〕。→ Phase 9。
- [x] **#2 search 靜默截斷**〔P1-1〕→ **原則:符合條件的都必須搜得到**。
      設計沿用專案既有的 `/rewards/history` 模式(伺服器端篩選 + `total` +
      offset 分頁 + UI「已顯示 X / Y」+ 載入更多),詳見 **§2.3**。→ Phase 3 + 6。
- [x] **#4 失去的「分支有新血」提示** → **本次不補**,替代管道見 §4。
- [x] **#5 移除死欄位是否併入本次** → **併入**(Phase 8),可獨立 revert。
- [x] **#6 手機端排序狀態可見性**〔P1-6 + P2-11〕→ 採納建議 **(b)+(c)**:
      維持 icon-only(空間是刻意決策)、A1 驗收限縮 sm+、`aria-label` 改為含
      當前排序值。詳見 §4。→ Phase 5。
- [x] **#7 `tie()` 的方向殘留**〔P2-16〕→ 採納建議:**`tie()` 改升冪**,
      讓所有比較鍵在升冪模式下方向一致。詳見 §2.1 發現 5。→ Phase 1。
- [x] **#8 預設值收斂為單一來源**〔P2-7〕→ **是**:`@contract` 匯出
      `DEFAULT_NETWORK_SORT`,四處改讀它。→ Phase 2 + 4 + 5。
- [x] **#9 切排序的無回饋空窗**〔P2-12〕→ **本次處理,不留既有債**:
      下傳 `isValidating`,revalidate 期間降透明度 + `aria-busy`。→ Phase 7。
- [x] **#10 `joinedAt` 的語意**〔系統視角〕→ **接受現況**:`joinedAt` 即
      `referral_edges.referred_at`(推薦邊建立時間),換推薦人 rewire 時
      **不更新**該時間戳(`20260724000004_…sql` L87–92),因此被 rewire 過來的
      下線會帶著較早的時間、排在該上線清單前段。此語意於 Phase 9 明文寫進規格書,
      不另訂 rewire 時間語意。

**仍待回覆(不阻擋開工,但 Phase 9 需要)**:

- [ ] **#11a 「最舊加入」當預設的理由**〔需求方確認〕:目前無任何地方記錄理由,
      日後極可能被當成 bug 改回「最新在上」(一般清單慣例)。
      **待確認的推測**:「舊→新 ≈ 續約到期的先後」——會籍多為一年期,越早加入越早
      到期,而本頁核心用途偏「維護既有下線」(AttentionBanner 置頂、列右側優先顯示
      到期倒數)。需求方確認後即照此寫入規格書(Phase 9);若理由不同請提供。
- [x] **#11b 長清單無虛擬化** → **本次不做虛擬化**:一代 roots 由 overview 一次
      全回、`roots.map` 全數渲染,新加入者在新預設下永遠沉在最底。緩解來自 #2
      ——搜尋修好後「找特定的人」本就該用搜尋而非滑清單。明文記錄門檻:
      **一代下線 > 100 人**時另開效能 feature 處理(分頁或虛擬化)。
- [ ] **#12 首頁篩選器的同類破口**(§2.3)〔獨立 feature,不併入本次〕:
      `HomePage.tsx` L147–160 繞過 Edge Function 直接查 `public_listings`,
      `.select('*')` 無 `limit`/`count`,僅靠 PostgREST `db-max-rows`(Supabase
      預設 1000)硬截,再於**瀏覽器端**篩選——刊登數超過上限後「符合條件的搜不到」
      必然發生且無感。需改為伺服器端篩選 + 分頁 + total。
      → 建議另開 `feature/homepage-server-side-filter`。
      (獎勵明細 `/rewards/history` **已符合原則**,無須變更。)

## 7. 風險與回滾

- **最壞情況**:排序順序不如需求方預期。影響僅止於清單呈現順序——不涉及金流、
  獎勵計算、權限或資料寫入,**無資料面不可逆風險**。
- **範圍已擴大**(相對於 v1 的 5 階段):新增 search 分頁(Phase 3+6)、載入回饋
  (Phase 7)、預設值收斂(貫穿)、規格書回填(Phase 9)。其中 **Phase 3+6 是唯一
  改變 API 契約的部分**(`search` 新增 `offset`/`limit` param)——純加法、
  舊呼叫不帶參數時行為等同現狀的第一頁,向後相容。
- **回滾**:純程式碼變更,無 migration、無資料轉換、無 localStorage 格式變更 →
  `git revert` 即完全復原。已存 `updated_asc` 的使用者在回滾後仍是合法值。
- **部署偏移**〔P2-2 理由更正〕:前端(Cloudflare Pages)與 Edge Function 分開部署。
  排序鍵不一致只造成順序暫時不同(自癒);`subtreeLatestJoinedAt` 的安全性來自
  **前端無 runtime 形狀驗證**(`assertShape` 只在 Deno 測試用),故少一個欄位不會
  炸前端——不是因為「schema 是 exact」(該說法不成立)。
- **驗證管道**:develop 有 persistent Supabase project,push 後 Edge Function 自動
  部署,可用真後端驗證三個端點的實際順序。
