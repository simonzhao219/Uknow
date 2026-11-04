# 刊登詳情頁左右滑換篇 規劃書

## 0. 一句話

這個 feature 讓瀏覽首頁篩選結果的訪客／會員，能在刊登詳情頁直接左右滑（桌機：箭頭鈕與 ←→）換上一篇／下一篇，因為現況要看下一篇得「點進 → 返回 → 再點」（業主 2026-11-04 手機錄影，裁決 W5-20～22）。

## 1. 使用者需求

- 對照規格書：路由表後〈首頁的返回與重新進入〉（§3）；`docs/ui-ux-guidelines.md` §5 照片輪播段。
- 驗收情境：
  1. 首頁篩選／搜尋／排序後剩 N 篇，點第 k 篇進詳情 → 左滑到第 k+1 篇、右滑到第 k−1 篇；順序與範圍＝首頁當下看到的清單。
  2. 照片區內左右滑＝換照片；**最後一張再往左＝下一篇、第一張再往右＝上一篇**（W5-21）；照片區以外左右滑直接換篇。
  3. 垂直捲動不被誤判成換篇。
  4. 桌機：上一篇／下一篇箭頭鈕＋鍵盤 ←→（焦點在輸入欄／可編輯元素時不攔截）（W5-22）。
  5. 顯示「n / N」；第一篇再往前、最後一篇再往後＝回彈，不循環。
  6. 換篇後按返回**一次**回首頁，篩選與捲動還原，並捲到最後看的那張卡（換篇用 replace，不堆疊）。
- 不做：循環；首頁「加載更多」續載（首頁目前無分頁，一次載入全部刊登）；從首頁以外進來時的換篇；換篇動畫的跟手拖曳（見 §6 Q2）。

## 2. 系統設計

純前端，無 API／DB／migration 變更。

- **清單脈絡來源**：把 HomePage `filteredServiceProviders` 的「篩選＋由近到遠排序」整段抽成純函式 `utils/homeListingOrder.ts: filterAndSortListings(listings, filters, coords)`（HomePage 改呼叫它，行為不變）。詳情頁以 `getCachedListings()`、`getCachedFilters()`、`getCachedCoords()` 同一純函式現算 `ids`——不另存一份「有序 id 快取」，避免兩份來源漂移。
- **脈絡有效性（Q1 建議）**：HomePage 兩張卡的 `<Link>` 加 `state={{ browseFrom: 'home' }}`。詳情頁只有 `location.state?.browseFrom === 'home'` 且目前 id 在 `ids` 內才啟用換篇；否則整組換篇 UI（n / N、箭頭、手勢）不渲染。換篇用 `navigate(next, { replace: true, state: location.state })` 保留旗標。
  - 直接開分享連結／重新整理（模組快取消失，`getCachedListings()` 為 null）／從推薦網絡、後台、站內其他入口進來＝無旗標或無快取＝不顯示換篇。history.state 在重整後仍在、但快取沒了，故兩條件都要檢查。
- **鄰篇計算**：純函式 `getNeighbors(ids, currentId) → { index, total, prevId, nextId }`。
- **返回定位**：`homeListingsCache` 新增 `lastViewedId`（模組層，與 scrollY 同生命週期；`resetHomeView`／`resetHomeListingsCache` 一併清）。詳情頁換篇時 `setLastViewedId(id)`；進詳情時也設。HomePage 的 POP 還原：若 `lastViewedId` 在清單內，卡片加 `data-listing-id`，`scrollIntoView({block:'center'})`（reduced-motion 用 auto）；否則退回既有 `scrollY`。W2-10 還原邏輯不變。
- **手勢判定**（純函式 `swipeIntent(dx, dy, dt)`）：水平位移 |dx| ≥ 60px 且 |dx| ≥ 1.5×|dy|（約 ±34° 內）且 |dy| < 80；起點在左右 24px 邊緣不處理（避免與 iOS／Android 系統返回手勢衝突）。依據：業界常見 50–80px 水平門檻；比值門檻擋掉斜向捲動。數值為常數集中一處，實作時以手機實測可調。
- **與 PhotoCarousel 合併**：輪播本體不退化——不改它的原生 scroll-snap。新增可選 props `onEdgeSwipe?(dir: 'prev'|'next')`。輪播在 `touchstart` 記錄當下 index 與起點；`touchend` 時若起點時 index＝最後一張且判定為向左滑（或第一張向右滑），觸發 `onEdgeSwipe`。判定「起點就在邊緣」而非「結束時在邊緣」，避免倒數第二張滑到最後一張的同一下手勢連跳換篇。只有一張照片時，兩個方向都算邊緣。
- **照片區外手勢**：詳情頁內容容器綁 `onTouchStart/End`（passive），事件起點在 `[data-carousel-scroller]` 內者忽略（交給輪播）。`touch-action: pan-y` 加在容器，讓垂直捲動交還瀏覽器、水平才由我們判。
- **鍵盤**：`window` `keydown`，ArrowLeft/Right；`target` 為 input／textarea／select／contentEditable 或 `e.defaultPrevented`／帶修飾鍵時略過。輪播本身（`tabIndex=0` 的 scroller）聚焦時 ←→ 的語意＝換照片還是換篇？見 §6 Q3。
- **預載**：換篇時預載鄰近（前後各一）刊登的首張照片 `new Image().src`；資料本身已在快取（`getCachedListing`）故無載入閃白，`fetchListing` 的 silent 重驗照舊。

## 3. 架構影響

- 動到：`HomePage.tsx`（抽純函式、Link state、卡片 data 屬性、返回捲動）、`ServiceProviderDetail.tsx`（換篇 UI、鍵盤、手勢）、`listing/PhotoCarousel.tsx`（可選 `onEdgeSwipe`）、`utils/homeListingsCache.ts`（`lastViewedId`）、新增 `utils/homeListingOrder.ts`、`utils/swipeIntent.ts`。
- `useLatestRequest` 已處理 id 在途切換，換篇快速連按安全；需元件測試覆蓋。
- 路由／lazy 結構不變。與 multi-step-flow 四契約無涉（非多步驟表單）。
- 效能：`filterAndSortListings` 純計算，詳情頁每次 render 現算會重複 O(N log N)，用 `useMemo`（依賴 id 與快取讀值）。清單為數十至數百筆，可忽略。
- 與 S4（PostHog）同碰頁面元件——S4 後開，無並行衝突；本 PR 先合。

## 4. UI/UX

- **手機**：無新增常駐按鈕。「n / N」放照片區下方既有圓點列旁／標題區上方一小行（不動骨架同形的固定高度——骨架探針 `test_public_skeleton_layout.py` 依區塊順序，故放在**既有區塊之外的新列且骨架同步放等高空白**，或放標題列右側；細節實作時以探針綠為準）。
- **桌機（lg 起）**：照片欄左右外側或頁首列放「上一篇／下一篇」箭頭鈕（`aria-label` 上一篇／下一篇，disabled 在頭尾），觸控裝置熱區 ≥44px（`pointer-coarse`）。
- **到頭尾**：手勢＝輕微橫向回彈（translateX 24px 約 150ms 回原位，`prefers-reduced-motion` 時不動、改以 `aria-live` 輕提示「已是最後一篇」）。
- **換篇動畫**：預設無跟手拖曳；換篇後內容淡入 150ms（reduced-motion 關閉）。
- **無障礙**：箭頭鈕即螢幕閱讀器的換篇入口（手勢不是唯一路徑）；「n / N」`aria-live="polite"`；換篇後焦點移到新頁標題 `headingRef`（`tabIndex=-1`），並 `window.scrollTo(0,0)`。
- 載入／錯誤／找不到：既有三態不變；換到的刊登若 404（已下架）顯示既有 notFound，返回仍回首頁。
- 規格書與 ui-ux-guidelines 同步（見階段 6）。

## 5. 階段切分（每階段＝一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 純函式：`getNeighbors`、`swipeIntent`、`filterAndSortListings`（抽離，HomePage 既有測試不動） | vitest node：`utils/*.test.ts` | 邊界（空清單、單筆、頭尾、id 不在清單）、水平／斜向／垂直／過短位移判定；排序與篩選結果與 HomePage 抽離前一致 |
| 2 | `homeListingsCache.lastViewedId` ＋ HomePage 抽函式、Link state、`data-listing-id`、返回捲到該卡 | vitest jsdom：`homeListingsCache.test.ts`、`HomePage.backNavigation.test.tsx` | resetHomeView／重置清 lastViewedId；POP 回首頁且 lastViewedId 在清單內時 scrollIntoView 該卡，否則走 scrollY |
| 3 | `PhotoCarousel` 可選 `onEdgeSwipe`（邊緣續滑） | vitest jsdom：`PhotoCarousel.test.tsx`（既有全綠＋新增） | 最後一張起手左滑→next、第一張起手右滑→prev；倒數第二張滑到最後一張不觸發；單張兩向皆觸發；未傳 prop 行為不變 |
| 4 | 詳情頁換篇：脈絡有效性、n / N、箭頭鈕、鍵盤、照片區外手勢、replace 導航、預載、焦點 | vitest jsdom：`ServiceProviderDetail.test.tsx` | 無旗標／無快取不渲染換篇 UI；有旗標時箭頭／←→／滑動導向正確 id 且 replace；輸入欄聚焦時 ← 不換篇；頭尾 disabled／不循環 |
| 5 | e2e mocked Gherkin | `e2e/features/home_listings.feature`／`service_provider_detail.feature`＋steps（CI 驗證；本機可跑全 mock） | 場景：首頁篩選剩 3 篇→進第 1 篇→下一篇→返回一次＝首頁、篩選仍在；直接開連結不顯示換篇 |
| 6 | 文件同步 | `check-spec-drift.py`、`check-plans-scaffold.py`、`check-test-names.py` | 規格書 §3、ui-ux-guidelines §5 補換篇；刪規劃檔 |

## 6. 開放問題

- [ ] **Q1 無首頁脈絡時怎麼辦**：建議＝不顯示換篇（含 n / N）。備選＝以全部刊登依預設序換篇。（選前者：脈絡不明時顯示「3 / 120」會誤導。）
- [ ] **Q2 換篇是否要跟手拖曳（頁面隨手指平移）**：建議＝不做，只做門檻判定＋淡入＋頭尾回彈（Sonnet 工項成本與誤觸風險低）。備選＝跟手拖曳（體感近原生 App，但與輪播／垂直捲動互動複雜、需另一輪規劃）。
- [ ] **Q3 輪播 scroller 聚焦時 ←→ 的語意**：建議＝鍵盤在輪播上＝換照片（保留輪播現有鍵盤行為），其餘位置＝換篇；換篇另有箭頭鈕。備選＝一律換篇。
- [ ] **Q4 「n / N」放哪**：手機建議放標題列右側、不動照片區結構；桌機放箭頭鈕之間。以骨架同形探針為準。

## 7. 風險與回滾

- 最壞：手勢誤判擾亂閱讀（垂直捲動變成換篇）或與輪播衝突 → 常數集中、元件測試釘住；紅線＝輪播既有測試全綠。
- 返回行為出錯（返回需按多次或回不到首頁）→ replace 導航與 POP 邏輯由階段 2、4 測試釘住；e2e 場景驗證返回一次。
- 回滾：純前端，單一 PR revert 即可；無資料、無 migration。
