# 刊登詳情頁換篇過場動畫 規劃書

## 0. 一句話

這個 feature 讓瀏覽刊登的會員在詳情頁左右滑／點「‹ ›」換篇時，看到有方向感、手指跟手的過場（而不是內容瞬間換掉），因為業主正式站實測「順但突然」（W5-69、W6-1）；並順手還清 #509 留下的 P2 五項。

## 1. 使用者需求

- 對照規格書「刊登詳情頁的換篇」段（`docs/uknow-software-specification.md` 約 118 行）與 `docs/ui-ux-guidelines.md` 約 117 行（換篇控制）。
- 現況（已讀程式，行號現算）：`ServiceProviderDetailRoute` 以 `key={id}` 重掛 `ServiceProviderDetail`；換篇後新實例靠 `enterClass`（tailwind `animate-in fade-in slide-in-from-*-6`，位移只有 24px、200ms）進場；**舊內容沒有退場、手指滑動時內容不動**，放開後整頁瞬間換掉——這就是「突然」的來源。頭尾再換篇有 24px 回彈（`bounceContent`）。
- 驗收情境（可驗證）：
  1. 手機在照片區以外往左／右拖：內容跟著手指水平位移（不超過約 1/3 視窗寬，帶阻尼），放開且達 `swipeIntent` 門檻 → 換篇，新內容從手指去向的相反側滑入；未達門檻 → 彈回原位。
  2. 點「‹ ›」、按 ←／→：沒有手指跟手，但新內容同樣依方向滑入（同一段進場動畫）。
  3. 動畫進行中可以立刻再滑／再點，不等動畫結束（新一次換篇取消上一段進場）。
  4. 作業系統「減少動態」：不跟手位移、不滑入、不回彈；換篇結果與文字播報不變（動作以外的行為完全等同現況）。
  5. 頭尾再換篇：沿用現有回彈與「已是最後一篇／第一篇」播報（頭尾拖曳時阻尼更大、放開彈回）。
  6. 照片輪播內的左右滑仍是換照片，滑到盡頭續滑才換篇（現況不變）；輪播內的拖曳不觸發整頁跟手。
- 併入 #509 的 P2 五項（以 #509 PR 內文「後續 P2」為準）：
  - P2-a：reduced-motion 判斷尚有兩處未併入 `motionPreference`（`PhotoCarousel.tsx` 本地 `prefersReducedMotion`、`HomePage.tsx` 返回捲動內聯 matchMedia）。
  - P2-b：換篇邏輯（`goBrowse`、`bounceContent`、`enterClass`、焦點還原、捲到頂）內聯在 `ServiceProviderDetail`，抽 hook（#509 原規劃為 `useBrowseNav`）。
  - P2-c：`BrowseGestures` 動態 chunk 載入失敗沒有 error boundary（目前 lazy 拒絕會往上拋到路由層錯誤頁，整個詳情頁壞掉）。
  - P2-d：slide-in 在手機可能短暫橫向捲動（位移的內容超出視窗寬，產生橫向 scrollbar／整頁抖動）。
  - P2-e：照片區外手勢起點在「橫向可捲動祖先」內時不略過（例如表格、程式碼區；目前只排除 `[data-carousel-scroller]`）。
- 不做：不改換篇順序／脈絡凍結（`browseContext`）；不改 `swipeIntent` 門檻數值（LINE 內建瀏覽器 32px 邊緣保護仍待實機，屬 W5-66）；不做舊內容快照的雙頁並排轉場；不改首頁 FLIP 重排與返回捲動行為（只還 P2-a 的 reduced-motion 判斷來源）；不動後端。

## 2. 系統設計

純前端，無 API、無 migration。

- **動畫層級**：做在 `ServiceProviderDetail` 的 `contentRef` 那層（`data-browse-content` 區塊），不動頁首列（返回／換篇控制不位移，也守住 #509 的「版面位移探針」）。
- **S7 P0 教訓（`key={id}` 重掛）**：換篇＝同路由換 `:id`，新實例重掛、狀態歸零，這個機制**不動**。因此舊 DOM 在 navigate 的同一個 commit 就消失，沒有「退場動畫」可做；方向感靠兩件事補足：(a) 手指拖曳期間內容已經跟著位移（放開前就有動），(b) 新實例從「手指去向的對側」帶著**放開當下的位移量**接續滑入（連續感）。位移量經 `location.state`（既有 `dir`／`via` 旁多一個 `dx`）傳給新實例，只在 `navigationType==='REPLACE'` 且有 `via` 時讀。
- **動畫引擎**：Web Animations API（`element.animate`，頭尾回彈已在用），不用 React state 驅動每一幀。拖曳中由 `touchmove` 直接寫 `contentRef.style.transform`（rAF 合併），放開／取消時清掉；進場用 `animate()` 並在新一次換篇、unmount 時 `cancel()`。位移用 `transform`＋`opacity`，不觸發 layout。
- **橫向溢出（P2-d）**：給 `gestureRef` 外層容器加 `overflow-x: clip`（不用 `hidden`，避免變成捲動容器影響 `position: sticky`／焦點捲動），位移內容不再撐出橫向捲動。
- **手勢起點（P2-e）**：`BrowseGestures.onTouchStart` 除 `[data-carousel-scroller]` 外，沿 `e.target` 往上找「`scrollWidth > clientWidth` 且 `overflow-x` 為 auto／scroll」的祖先，找到就不啟動換篇手勢（純函式 `startsInsideHorizontalScroller(target, boundary)`，jsdom 可測 scrollWidth 以 defineProperty 模擬）。
- **水平鎖定**：拖曳初期（前 ~10px）判定軸向：垂直位移較大 → 放棄（交給瀏覽器捲動，與 `touch-pan-y` 一致）；水平較大 → 鎖定並開始跟手。判定與阻尼、放開是否換篇，集中成純函式 `browseDrag.ts`（`lockAxis`、`dragOffset`（阻尼＋頭尾加重阻尼）、`settle` → `'commit' | 'cancel'`，commit 條件**直接呼叫既有 `swipeIntent`**，門檻不重複定義）。
- **減少動態**：所有動畫入口先問同一個 `prefersReducedMotion()`（`motionPreference.ts`）。

## 3. 架構影響

- 動到：`ServiceProviderDetail.tsx`（抽出換篇邏輯）、新 `src/hooks/useBrowseNav.ts`（或 `useBrowseTransition`，命名實作時定）、`listing/BrowseGestures.tsx`（加 touchmove 跟手、起點判斷）、新 `src/utils/browseDrag.ts`、`motionPreference.ts`（P2-a 收口，必要時加 `subscribe` 版本）、`listing/PhotoCarousel.tsx`、`HomePage.tsx`（只換判斷來源）。
- 與 lazy 結構：`BrowseGestures` 仍是有脈絡才載入的動態 chunk，跟手與起點判斷的新程式碼放這個 chunk（不進 entry）。進場動畫的 hook 在 `ServiceProviderDetail`（entry）內，量要小。
- **Bundle 預算（W5-43，`scripts/check-bundle-budget.mjs`：entry raw 1015／gzip 316／總 raw 1950）**：#509 合併時實測 entry 1012.0／315.4、總 1946.8，只剩約 3 kB／0.6 kB。`useBrowseNav` 把原本內聯的 `enterClass`／`bounceContent` 搬出、換成 WAAPI，預估淨增 < 0.5 kB；新增的 `browseDrag.ts`、跟手與起點判斷放動態 chunk，不吃 entry，但吃**總 raw**。實測不夠就需主 session／業主核准調額度（見開放問題 Q4），不得無說明調高。
- **error boundary（P2-c）**：在 `ServiceProviderDetail` 內為手勢 chunk 包一個極小的 class boundary（`fallback=null`、`console.error`），失敗時換篇按鈕與頁面其餘功能照常，只是少了滑動與鍵盤。同時沿用 `importWithRetry`（已含重試）。
- PostHog 錄影遮罩：不受影響——不新增含個資的節點、不改 `privateClass`／`maskTextSelector`；跟手只改 inline transform，不改 DOM 結構。
- 與多步驟流程四契約：無關（非表單／金流頁）。

## 4. UI/UX

- 對照 `ui-ux-guidelines.md` 換篇控制段與「滑入與回彈動畫尊重減少動態偏好」：本 feature 把這句擴成完整的「動態」規範並寫進準則（Q2 的時間／位移數值定案後寫）。
- 手機（主要）：拖曳內容跟手（位移 ≤ 視窗寬 1/3，阻尼 ~0.5）；放開換篇時新內容從側邊 ≈ 放開位移處滑到 0，時長 ~220ms `ease-out`，並從 opacity 0.6 淡到 1；放開未換篇 ~180ms 彈回。桌機：只有按鈕／鍵盤，新內容 ~200ms、位移 24px 級淡入滑入（維持現況量級，不誇張）。
- 載入態：新篇若無快取，先顯示骨架——進場動畫套在外層容器，骨架與內容同一動畫，骨架換內容時不再動。錯誤態、找不到態同理（容器層）。
- 焦點／播報：不變（手勢換篇焦點移到標題、按鈕換篇留在原鈕；單一 live 區）。
- 觸控目標、`touch-pan-y` 容器屬性不變。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | reduced-motion 收口（P2-a）：`PhotoCarousel`、`HomePage` 改用 `motionPreference` | vitest：`PhotoCarousel.test.tsx` 既有 + 新增「偏好減少動態時 scrollTo 用 auto」（mock matchMedia）；`HomePage` 返回捲動同理；`rg "prefers-reduced-motion" src` 只剩 `motionPreference.ts` | 紅：兩處測試改以 mock `motionPreference` 模組斷言，現況用本地實作 → 失敗 |
| 2 | 純函式 `browseDrag.ts`：`lockAxis`、`dragOffset`（阻尼、頭尾加重）、`settle`（呼叫 `swipeIntent`）、`startsInsideHorizontalScroller`（P2-e 部分） | vitest node `browseDrag.test.ts`（邊界：垂直為主放棄、斜向、起點在邊緣保護區、頭尾、位移上限） | 表格式案例全綠；`settle` 與 `swipeIntent` 對同組輸入結論一致（交叉測試防門檻漂移） |
| 3 | 抽 hook `useBrowseNav`（P2-b）：行為不變重構，外加新契約——`goBrowse` 把 `dx` 放進 `location.state`、進場動畫改 WAAPI＋可取消 | vitest jsdom `ServiceProviderDetailRoute.test.tsx`：現有「slide-in class」斷言改為 `animate` spy 斷言（方向、取消上一段、reduced-motion 不呼叫、第一次進來／重整不呼叫）；既有焦點／播報／頭尾測試全程保持綠 | 紅：新斷言（`animate` 帶 `translateX` 起點 = 方向 × max(24, |dx|)；連續兩次換篇第二次先 cancel 第一次）；綠後既有測試零修改通過 |
| 4 | 跟手與放開（`BrowseGestures`：touchmove、軸向鎖定、放開 commit／彈回、touchcancel 歸零、起點在橫向捲動祖先內不啟動 P2-e） | vitest jsdom `BrowseGestures.test.tsx`（模擬 touch 事件序列：跟手時 `style.transform` 變化、垂直為主不動、放開達門檻呼叫 `onNavigate` 並帶 dx、未達門檻彈回、輪播內起點略過、橫向捲動祖先內起點略過、reduced-motion 全程不寫 transform） | 紅綠各一輪；與階段 2 純函式分工清楚（元件只接事件與寫 style） |
| 5 | 橫向溢出（P2-d）與頭尾回彈併入同一套（頭尾拖曳加重阻尼、放開彈回；`bounceContent` 改走 hook） | vitest jsdom：容器 className 含 `overflow-x-clip`；頭尾拖曳位移 < 非頭尾；e2e 階段 7 實測無 `document.documentElement.scrollWidth > innerWidth` | 單測綠；實機驗項見 Q5 |
| 6 | error boundary（P2-c） | vitest jsdom：`vi.mock` 讓動態 import 拒絕 → 詳情頁仍渲染內容與換篇按鈕、`console.error` 被呼叫、按鈕換篇照常 | 紅：現況整頁掉到錯誤邊界 |
| 7 | e2e 與文件：mock e2e 加場景「手勢換篇時內容隨手指位移、放開後換到下一篇、`prefers-reduced-motion: reduce` 下不位移」；規格書＋ui-ux-guidelines 同步；bundle 預算實測 | `e2e/features/service_provider_detail.feature`（Playwright `emulate_media(reduced_motion=...)`、`page.touchscreen` 或 CDP touch 事件；以 `getAnimations()`／inline style 當探針，不靠截圖）；`npm run check:full`、`check-spec-drift.py`、`check-bundle-budget` | CI e2e 綠；`ServiceProviderDetail` 版面位移探針（≤2px）仍綠；文件改動通過 spec-drift |

測試落點誠實聲明：動畫「看起來順不順」自動化測不到，只能量到「有跟手、有方向、不橫向溢出、減少動態時不動」；順暢度靠業主手機實測（PR 內文附步驟）。

## 6. 開放問題

- [ ] Q1 動畫引擎：**A（建議）WAAPI＋inline transform**（本規劃採用；可控、可取消、單測可斷言、不依賴瀏覽器新功能）vs B View Transitions API（react-router v7 的 `navigate(..., { viewTransition: true })`，程式最少；但 LINE 內建瀏覽器支援度未知、無法與手指跟手銜接、整頁快照會連頁首一起淡入，且難以單測）。
- [ ] Q2 數值（可實機調，常數集中在 `browseDrag.ts`）：跟手位移上限＝視窗寬 1/3、阻尼 0.5、進場 220ms、彈回 180ms、桌機按鈕換篇 24px／200ms。建議先採此組，業主手機實測後再調。
- [ ] Q3 減少動態時是否保留「極短淡入（≈80ms、無位移）」作為換篇回饋？**建議不保留**（準則已寫「尊重減少動態」；視覺回饋已有標題列 n/N 與 live 區）。
- [ ] Q4 bundle：預算只剩約 3 kB raw／0.6 kB gzip（#509 實測）。若階段 7 實測超標，是否授權在 PR 內說明後調高（建議 raw +2、gzip +0.5）？裁決請走主 session。
- [ ] Q5 兩項實機驗證（W5-66，業主手機）：手機滑入是否仍有橫向閃動（P2-d 驗收）；LINE 內建瀏覽器邊緣保護 32px 是否要放寬（`edgeGuardPx`，與本 feature 無關，不在本 PR 改，只在 PR 內文提醒）。
- [ ] Q6 P2-b 命名：hook 取名 `useBrowseNav`（#509 原案）或 `useBrowseTransition`（較貼近本次職責）。建議 `useBrowseNav`，一個 hook 管 navigate＋進場＋回彈＋焦點，避免再分裂。

## 7. 風險與回滾

- 最壞：跟手與瀏覽器原生捲動／iOS 邊緣返回衝突，導致誤換篇或捲不動。緩解：軸向鎖定後才 `preventDefault`（touchmove 需 `passive:false`，只在鎖定水平後呼叫）；`swipeIntent` 邊緣保護不變；階段 4 測試釘住「垂直為主不動」。
- 次要：進場動畫在低階機卡頓。緩解：只用 transform／opacity；可用單一常數把時長歸零關掉。
- 回滾：純前端，revert 該 PR 即回到 #509 現況（行為與資料零遷移）。
