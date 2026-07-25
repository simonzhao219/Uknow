# 推薦網絡排序器邏輯修正 規劃書

<!-- 由 /plan-feature 從 docs/_templates/plan.md 實例化 -->

分支對應:本規劃於 `claude/recommendation-network-sorter-logic-ap6yza`
(web session 自動分支)產出;若要走守衛版三段式流程,實作時切
`feature/referral-network-sort-logic`(目錄名 = 該 slug)。

## 0. 一句話

讓「我的推薦網絡」每一代都依**自己的加入時間**排序、且預設由舊到新,
因為現行以「子樹最新加入時間」為排序鍵,下線一加入就把上線推到列表頂端,
使用者看不懂順序是怎麼來的。

## 1. 使用者需求

- 規格書對照:`docs/Uknow_Software_Specification.md` §3.2.3 推薦系統
  (`/referrals`)——僅有「推薦關係樹狀圖」一句,**排序器無明文規格**
  (已列開放問題 #1)。
- **需求 A(預設)**:進頁面預設排序為「最舊加入」(`updated_asc`),
  取代現行的「最新加入」(`updated_desc`)。
- **需求 B(排序語意)**:一代自己排自己的、二代在其父節點下自己排自己的、
  三代同理;世代之間互不影響——即排序鍵改用節點**自身** `joinedAt`,
  不再用「自身與子樹最新加入時間」。

驗收情境(沿用既有測試種子,加入時間遞增:王大明 < Alice < 陳小華 < 𠮷 < Zoe;
王大明 → 陳小華 → 𠮷 為同一分支):

| # | 操作 | 期望 |
|---|---|---|
| A1 | 首次進頁面(未曾選過排序) | 排序器顯示「最舊加入」 |
| B1 | 預設(最舊加入)看一代 | 王大明、Alice、Zoe(各自加入時間由舊到新) |
| B2 | 同上,`𠮷`(三代)是全網最新血之一 | **不影響**王大明的位置——王大明仍在最前 |
| B3 | 切「最新加入」 | Zoe、Alice、王大明(B1 的完全反轉) |
| B4 | 展開王大明 → 展開陳小華 | 各層只依該層自身加入時間排,與其他層無關 |

不做(明確排除,防範圍蔓延):

- 姓名排序(`name_asc`/`name_desc`)的混排規則——維持核定行為,一字不動
- 「需要關注」清單排序——自有緊急度規則(expiring→expired→suspended),不共用 `sortNodeIds`
- 排序選項文案、新增排序模式、樹狀渲染方式

## 2. 系統設計

### 2.1 現況 Review(排序器全鏈路)

排序是**伺服器權威**,前端不做任何排序(`src/utils/referralNetwork.ts` L6–7
的分工註解:前端只有遮罩後顯示名,無法做正確姓名排序)。唯一排序實作:
`supabase/functions/api/index.ts` `sortNodeIds()` L2395–2411。

三個呼叫點與其傳入的 id 集合:

| 端點 | 傳入 `sortNodeIds` 的集合 | 世代組成 |
|---|---|---|
| `/referrals/network/overview` L2436 | `net.gen1Ids` | **同一層**(全為一代) |
| `/referrals/network/children` L2487 | `childrenOf[parentId]` | **同一層同一父**(必為同一代) |
| `/referrals/network/search` L2529 | `hitIds`(全網命中) | **跨世代**(唯一混層處) |

**Review 發現 1(結構已對,鍵才是問題)**:overview / children 傳入的一律是
同一層的兄弟集合,所以「一代自己排、二代自己排、三代自己排」在**結構上
已經成立**——樹是前端依 `childCount` 逐層懶載入組裝的,不存在跨代合併排序。
需求 B 的偏差**只**來自排序鍵。

**Review 發現 2(偏差來源)**:`updatedAsc` 用的是 `net.subtreeMs.get(uid)`
(L2407)——`loadNetwork()` L2340–2350 由深到淺 bottom-up 算出的「自身與可見
子樹中最新加入時間」。因此一個很早加入的一代,只要其二/三代下線有新血,
就會被推到「最新加入」的頂端(既有測試 L98 的標題「子樹新血勝過自身較晚加入」
正是在釘死這個行為)。這就是使用者看到的「順序莫名其妙」。

**Review 發現 3(死欄位)**:`subtreeLatestJoinedAt` 全 codebase **無任何讀取端**
——`ReferralTreeView.tsx` 不讀、`useReferralData.ts` 不讀、前端無本地重排。
僅存在於:後端計算(`index.ts` L2342–2350, L2381)、契約 schema
(`api-contract.ts` L268)、前端型別宣告(`referralNetwork.ts` L25)、兩側測試
fixture、e2e mock。改掉排序鍵後,它就**完全死透**。

**Review 發現 4(降冪機制健全)**:降冪一律「升冪排完 `reverse()`」
(L2409),兩方向永不漂移——這個設計不動,換鍵後自動繼續成立。

**Review 發現 5(tie-break)**:`tie()` L2397–2400 為「`joinedAt` 降冪 → `userId`
字典序」。換鍵後主鍵與 tie 都是 `joinedAt`,主鍵相等時 tie 的時間比較必為 0、
落到 `userId`,結果仍**完全確定**(`reverse()` 使降冪的 `userId` 反向,一致)。
`name_*` 仍需要 tie 的時間比較,故 `tie()` 保留不動。

### 2.2 變更

- **無 API 端點/參數變更**;無資料庫 migration、無 RLS 變更(`referral_edges`
  只存直接推薦關係,世代是查詢時算的,不受影響)。
- **排序鍵**:`updatedAsc` 的鍵 `net.subtreeMs.get(uid)` →
  `Date.parse(net.joinedAtOf.get(uid))`。`sortNodeIds` 其餘結構、`reverse()`
  降冪機制、`nameAsc`、`tie()` 全部不動。
- **預設值**:`'updated_desc'` → `'updated_asc'`,共**三處**必須同時改,
  否則伺服器回聲與前端快取判斷會漂:
  1. `supabase/functions/api/index.ts` `parseSortMode()` L2393(伺服器回落)
  2. `src/utils/referralNetwork.ts` `parseSortMode()` L77(前端回落)
  3. `src/utils/referralNetwork.ts` `readStoredSort()` catch L87(storage 不可用時)
- **回應形狀變更(Phase 5)**:移除 `subtreeLatestJoinedAt` 欄位與
  `subtreeMs` 計算。因無 runtime 讀取端,前後端**任一部署順序都安全**
  (前端型別是編譯期產物,不做 runtime 驗證;後端 schema 是 exact,
  移除欄位與停止輸出必須同一 commit)。

## 3. 架構影響

動到的模組(全部是既有模組的局部修正,無新增模組/路由/頁面):

| 檔案 | 變更 |
|---|---|
| `supabase/functions/api/index.ts` | `sortNodeIds` 排序鍵、`parseSortMode` 預設、`loadNetwork` 移除 `subtreeMs`、`buildFlatNode` 移除欄位、L2340/L2385–2387 註解 |
| `supabase/functions/_shared/api-contract.ts` | `NetworkNodeSchema` 移除欄位、L254–259 註解 |
| `src/utils/referralNetwork.ts` | 兩處預設、`NetworkNode` 移除欄位、L24 註解 |
| `src/components/referral/ReferralTreeView.tsx` | L534 指示點基準 `sort !== 'updated_desc'` → `'updated_asc'` |
| `e2e/mocks/backend_api_mock.py` | L306/L312/L640 的 `sort` 預設回聲、L629 移除欄位 |

- 與 appShell/路由 lazy 結構無關(不新增頁面);與 multi-step-flow 四契約
  **不適用**(非多步驟表單/金流)。
- 效能:淨**減少** —— `loadNetwork` 少一輪 O(N) bottom-up 迴圈與一個 Map,
  payload 每節點少一個 ISO 字串。查詢次數不變。
- 安全:不動姓名遮罩(`maskNameByGen`)、不動 children 的子樹授權檢查、
  不動 search 的真名比對邊界。無新增資料外洩面。
- **localStorage 無需 migration**:曾主動選過排序的使用者,`referralSortMode`
  仍是其選擇(即使選的是 `updated_desc`)——明示選擇優先,正確;沒選過的
  自然吃到新預設。
- **SWR 快取無需清除**:`useReferralData` L105/L110 已用 `cached.sort ===
  sortRef.current` 做回聲比對,舊快取(`sort: 'updated_desc'`)與新預設不符
  即視同 miss、重新請求 —— **不會**先閃一次舊順序。

## 4. UI/UX

- **排序指示點基準必須同步**(`ReferralTreeView.tsx` L534):目前寫死
  `sort !== 'updated_desc'` 才顯示琥珀點(手機 icon-only 時的狀態補償)。
  預設改了而這裡沒改,結果會**完全反轉**:預設狀態亮點、選了「最新加入」
  反而不亮。這是本次最容易漏、且純視覺不會報錯的一處。
- **文案不動**(核定文案,`referralNetwork.test.ts` 釘死一字不差)。附帶效果:
  「最新加入」在換鍵後**更名符其實**——過去它其實是「最近有新血的分支」,
  改後才真的是「最新加入的成員在前」。
- 下拉選項順序不變(最新/最舊/A→Z/Z→A),因此預設選中項變成清單**第二項**
  ,單選圓點不在首位 → 是否重排見開放問題 #3。
- 空態、載入態、錯誤態、搜尋列、行動版佈局:**全不變**。
- 已知取捨(誠實記錄):舊排序鍵順帶提供了「某分支有新成員」的隱性提示
  (上線會被下線推頂)。改後此提示消失,而「需要關注」清單只涵蓋
  到期/失效/停權,不補這個缺口 → 見開放問題 #4。

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 排序鍵:子樹最新 → 自身 `joinedAt` | `supabase/functions/api/network-endpoints.test.ts` | 一代依自身加入時間排;`𠮷` 加入不再推升王大明(原 L98/L109、L122/L126、L161/L164 斷言全數改寫) |
| 2 | 伺服器預設 → `updated_asc` | 同上 | 無 `sort` 與非法 `sort` 皆回落並回聲 `updated_asc`(原 L103、L147) |
| 3 | 前端預設 → `updated_asc`(兩處回落) | `src/utils/referralNetwork.test.ts`(node) | `parseSortMode` 非法值、`readStoredSort` 未存過/壞值三種路徑一致回落 |
| 4 | 指示點基準跟隨新預設 | `src/components/referral/ReferralTreeView.test.tsx`(jsdom) | 預設 `updated_asc` 不亮點;`updated_desc`/`name_*` 亮點 |
| 5 | 移除死欄位 `subtreeLatestJoinedAt` / `subtreeMs` | 兩側測試 + e2e mock + `npm run check`(knip) | 契約、型別、註解不再描述已不存在的語意;`check` 與 `deno task check` 綠 |

階段 1–2 同檔但屬不同紅綠循環(行為 vs 預設),刻意分開以免一次改太多斷言
而看不出哪個斷言在證明什麼。階段 5 可獨立 revert,不影響 1–4 的行為修正。

**既有測試受影響清單**(TDD 時逐一處置,禁止改測試遷就實作——這些是需求
變更導致的預期值變更,須連同測試標題/註解一起改寫):

- `network-endpoints.test.ts` L98–120(標題含「子樹新血勝過自身較晚加入」,
  premise 整個反轉)、L122–127、L144–148、L161–164、檔頭註解 L6/L14
- `ReferralTreeView.test.tsx` L57(fixture 欄位)、L65(fixture 預設)、L229–235(指示點)
- `referralNetwork.test.ts` L5/L28–32/L50–51/L60–62(回落預設)
- 姓名排序測試(L129–143)**不受影響**,不得順手改動

## 6. 開放問題(逃生口)

- [ ] **#1 規格書回填**:`Uknow_Software_Specification.md` §3.2.3 對排序器
      無任何描述,本次改的是**使用者可見行為**。要不要在本次一併把排序器
      規格(四模式、預設、逐代自排語意)寫進規格書?(建議:要,否則下次
      又只能以程式碼為規格。)
- [ ] **#2 search 端點的跨世代排序**:search 是唯一混世代的呼叫點。換鍵後
      命中清單會依「各自的加入時間」跨代混排。要不要改成「先依世代、
      再依自身加入時間」?(建議:**維持扁平** —— 搜尋結果是命中清單不是樹,
      使用者要的是「找到人」,強加世代分組反而不易掃視;且 `ancestorPath`
      已提供層級脈絡。需需求方確認。)
- [ ] **#3 下拉選項是否重排**,讓預設「最舊加入」排到首位?(建議:**不重排**
      —— 文案與順序是核定且測試釘死,重排是本次需求外的額外視覺變更;
      「最新/最舊」的語意配對順序讀起來也自然。)
- [ ] **#4 失去的「分支有新血」提示**要不要補(例如節點上的 NEW 徽章
      或摘要卡「本月新增 N 人」)?(建議:**本次不補**,獨立需求另行規劃。)
- [ ] **#5 Phase 5(移除死欄位)是否併入本次**?(建議:**併入** ——
      留著會讓契約註解說著已不存在的語意,是下一個人的陷阱;且無 runtime
      讀取端,移除零風險。若要拆,Phase 1–4 可獨立出貨。)

## 7. 風險與回滾

- **最壞情況**:排序順序不如需求方預期(例如 #2 的 search 決策選錯)。
  影響僅止於清單呈現順序——不涉及金流、獎勵計算、權限或資料寫入,
  **無資料面不可逆風險**。
- **回滾**:純程式碼變更,無 migration、無資料轉換、無 localStorage 寫入
  格式變更 → `git revert` 該 PR 即完全復原。已存 `updated_asc` 的使用者
  在回滾後仍是合法值(四模式未變),不會壞。
- **部署偏移**:前端(Cloudflare Pages)與 Edge Function 分開部署,兩者
  短暫版本不一致時:排序鍵不一致只造成順序暫時不同(自癒);
  `subtreeLatestJoinedAt` 因無 runtime 讀取端,任一方向都不會出錯。
- **驗證管道**:develop 分支有 persistent Supabase project,push 後
  Edge Function 自動部署,可用真後端驗證三個端點的實際順序。
