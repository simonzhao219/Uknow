# 刊登詳情頁左右滑換篇＋首頁區級距離排序 規劃書

<!-- plans-keep: 施工鷹架；/tdd-implement 收尾刪除 -->

> 版本 2（2026-11-05）：納入裁決 W5-24～28（業主 2026-11-05 互動選項，主 session 代收）與 review.md 第一輪 P0／P1 處置。

## 0. 一句話

讓瀏覽首頁清單的人，(a) 首頁遠近排序顯示的真的是離自己近的、重排有動畫不閃；(b) 在刊登詳情頁左右滑／點「‹ 3/12 ›」就換上一篇／下一篇——因為現況要看下一篇得「點進→返回→再點」，且定位回來時整份清單 6 秒後突然換順序（業主兩支手機錄影，W5-20～27）。

## 1. 使用者需求

- 對照規格書：路由表後〈首頁的返回與重新進入〉（§3，第 111 行）；`docs/ui-ux-guidelines.md` §5 照片輪播段、第 173 行（依賴定位的功能只在取得真實定位後啟用）。
- 驗收情境：
  1. **區級距離（W5-24）**：使用者定位反查出所在區；服務區含該區的刊登排最前；其餘依各刊登「最近的服務區中心」距離由近到遠；刊登「全區」＝該縣市每一區都服務；同分者維持 created_at 倒序。無定位時維持最新排序。
  2. **等一下再重排（W5-25）**：已授權定位（Permissions API 可查且為 granted）者，最多等 1.5 秒拿座標再顯示；拿不到／太慢／首次詢問權限／API 不可查 → 先顯示最新，座標回來後方格以動畫移位重排；`prefers-reduced-motion` 時直接換、不動畫。返回時有快取座標就直接用，不重排（維持現行）。
  3. **換篇範圍（W5-20、W5-26）**：詳情頁換篇順序＝使用者**點擊卡片當下**畫面上的順序（點擊時凍結，座標晚到、背景重驗都不影響進行中的瀏覽）。
  4. **手勢（W5-21）**：照片區內左右滑＝換照片；最後一張起手再往左＝下一篇、第一張起手再往右＝上一篇；照片以外區域左右滑直接換篇；垂直捲動不誤判。
  5. **常駐控制（W5-27）**：手機標題列右側常駐可點「‹ 3/12 ›」（桌機同位置同控制）；滑動達門檻後新一篇由側邊滑入；**不做跟手拖曳**。
  6. **桌機（W5-22）**：同一組「‹ n/N ›」鈕＋鍵盤 ←→（焦點在輸入欄／輪播／對話框內不攔截）。
  7. 到頭尾回彈不循環；「‹」「›」於頭尾 `aria-disabled`。
  8. **返回（W5-22、W5-28）**：返回一次回首頁；**沒換過篇**維持原 scrollY；**換過篇**才把最後看的那張卡置中；篩選還原（W2-10）不變。
  9. **無脈絡（W5-28）**：直接開連結、重新整理、從推薦網絡／後台進來＝不顯示換篇控制與 n/N。
- 不做：循環；跟手拖曳；首頁分頁續載（`fetchAllListings` 一次 `select('*')` 全載入，HomePage.tsx:222-229，無分頁）；以「路程／交通時間」排序；把使用者座標送後端或存 storage（座標屬個資，只留記憶體，沿用 homeListingsCache 邊界）。

## 2. 系統設計

純前端，無 API／DB／migration 變更。

### 2.1 區級距離（W5-24）
- **資料表** `src/data/districtCentroids.ts`：`Record<'縣市|區', [lat, lng]>`，鍵取自 `constants.ts` `TAIWAN_REGIONS`（目前 22 縣市、368 個區；**同名區跨縣市存在，例：台北市中正區／基隆市中正區，鍵必含縣市**）。座標取小數 3 位（約 110 公尺，遠大於區的排序需求）。
- **大小**：368 列 × 約 28 B ≈ 10 kB raw、約 4–5 kB gzip。entry gzip 預算現貼線（`check-bundle-budget.mjs` 312 kB，貼 #494 的 310→312），**所以此表走動態 import 成獨立 chunk，不進 entry**；載入完成後存於模組變數，之後（含返回首頁）同步可用，首頁冷載入時先顯示最新排序、表到位再依 2.2 處理。HomePage 本身在 entry（App.tsx:15 靜態 import），故純函式與表都不得從 entry 靜態引用該表。
- **資料來源與授權**：內政部國土測繪中心「鄉鎮市區界線」（政府資料開放平臺），適用政府資料開放授權條款第 1 版（可商用，須標示出處）；以一次性離線腳本（`scripts/` 下，不進 bundle、不進 CI）取各區面積加權質心（內陸點外延區如狹長／離島區改取界內代表點），輸出靜態表並在檔頭註明來源、授權、取得日期、演算法。**授權文字與可下載性在實作階段於網路可達處再確認一次——取不到就停下回報主 session，不自行改用來路不明的座標來源。**（本規劃階段雲端容器未驗；列為開放問題 Q5。）
- **測試**：表鍵集合＝`TAIWAN_REGIONS` 全部「縣市|區」（少一個就紅，防日後新增區漏座標）；座標在台灣含離島框內（lat 21.8–26.5、lng 118.0–122.1）；每區中心距該縣市既有 `cityCoordinates` 不超過合理上限（花蓮／南投等大縣需例外表，測試內列明）。
- **使用者所在區**：`nearestDistrict(coords)`＝對 368 個區中心取 haversine 最小者。邊界誤差（區中心反查在大區邊界會偏）可接受：排序用途，非行政判定；規格書寫明「以最近的區中心近似」。
- **排序純函式** `utils/listingDistanceOrder.ts: sortByDistance(rows, userCoords, table)`：
  - `userDistrict = nearestDistrict(userCoords)`；
  - 每筆分數：`servesUserDistrict`（刊登 `city === userDistrict.city` 且 districts 含「全區」或含該區）→ 分數 −1；否則 `min` over 刊登服務區（「全區」展開為該縣市全部區）的區中心距離；查不到任何中心（資料異常）→ `Infinity` 排最後；
  - 穩定排序：同分維持輸入（created_at 倒序）順序。
  - `cityCoordinates` 與舊 `calculateDistance` 搬進 utils（`distance.ts`）；縣市層表整個移除（不留兩套）。
- 抽出 `filterAndSortListings(listings, filters, coords, table)` 供 HomePage 呼叫；`HomePage` 內聯篩選邏輯改呼叫它（行為不變，既有測試為護欄）。

### 2.2 等一下＋動畫重排（W5-25）
- 狀態：`geoPhase: 'idle' | 'waiting' | 'ready'`。HomePage 掛載時：
  1. 快取座標存在 → 直接用（返回路徑，不動畫、不等）。
  2. 否則若 `navigator.permissions?.query({name:'geolocation'})` 回 `granted` → `waiting`：`getCurrentPosition` 照常發（timeout 8 秒，maximumAge 5 分鐘不變），**列表顯示延後到「清單已載入且（座標到或 1.5 秒到）」**；清單載入本身要幾百毫秒，實際額外等待＝`max(0, 1.5s − 載入時間)`，等待期間沿用既有骨架。
  3. `prompt`／`denied`／API 不可查／不支援定位 → 不等，立即顯示最新；座標若後來取得（使用者按允許）→ 動畫重排。
- **重排動畫**：手刻 FLIP 小工具 `utils/flipReorder.ts`（WAAPI `element.animate`，transform translate，220ms ease-out）：重排前以 `data-listing-id` 量當前可見卡片 rect（視窗上下各多 1 屏、最多 40 張，其餘直接換），`useLayoutEffect` 套用新順序後算 delta 播放；`prefers-reduced-motion: reduce` 直接跳過。**不採用 `motion` 的 `layout` prop**：它要求每張卡長期掛 layout、數百張卡的投影量測成本在手機上不值得，而重排一生一次；`motion` 目前只在通知元件使用，HomePage 在 entry 內引入會吃預算。純計算（算 delta、挑要動的元素）抽純函式在 node 測，DOM 播放部分在 jsdom 驗「有／無 reduced-motion 是否呼叫 animate」。
- 重排進行中使用者若已點卡：點擊時凍結的是**當下畫面順序**（見 2.3），不受之後重排影響。

### 2.3 換篇脈絡（W5-26、W5-28）
- **凍結（模組層，與 homeListingsCache 同生命週期）**：HomePage 兩張卡的 `<Link>`（HomePage.tsx 1067、1104 附近；三種版型 map 全數覆蓋）加 `onClick={() => freezeBrowseContext(orderedIds, id)}`＋`state={{ browseFrom: 'home', ctx }}`。`freezeBrowseContext` 存 `{ ids, entryId, version }`，version 遞增；`ctx` 即 version。`resetHomeListingsCache`（登出）清除。
- **有效性**：`resolveBrowseContext(state, currentId)` 純函式：`state?.browseFrom==='home'` 且 `state.ctx === frozen.version` 且 `currentId ∈ frozen.ids` 才回傳 `{index,total,prevId,nextId}`，否則 `null`（＝不顯示任何換篇 UI）。重整後模組消失→null；返回首頁後 Forward 回詳情時 ctx 與新凍結版本不同→null（review P2「旗標不帶版本」處置）。
- **導航**：`navigate(`/service-providers/${targetId}`, { replace: true, state: { ...state, dir } })`；歷史只留一筆，返回一次回首頁。
- **P0 處置（換篇＝同一實例換 :id）**：`App.tsx` 的 `/service-providers/:id` element 改為薄 wrapper `<ServiceProviderDetailRoute />`，`const { id } = useParams(); return <ServiceProviderDetail key={id} />`。換篇＝重掛，沿用既有「`getCachedListing(id)` 初始化、不閃骨架、背景重驗」邏輯，PhotoCarousel 的 index／scrollLeft 一併歸零，`useLatestRequest` 自然隔離前一筆。測試：A→B 第一個 render 即 B 的內容；B 重驗失敗仍是 B；B 404 顯示 notFound 且**仍有換篇控制**（見 4.4）。
- **返回定位（W5-28）**：`homeListingsCache` 新增 `lastViewedId`（換篇時設，僅有效脈絡下）。HomePage POP 還原：`lastViewedId` 存在且 ≠ `entryId`（點擊進入的那篇）且在清單內 → `scrollIntoView({block:'center'})`（reduced-motion 用 auto）；否則走既有 `scrollY`。三種版型的卡片根節點都加 `data-listing-id`。`resetHomeView`／`resetHomeListingsCache` 一併清 `lastViewedId`。

### 2.4 手勢與鍵盤
- **手勢判定**（純函式 `swipeIntent`）：單指、水平位移 ≥ 60px 且 ≥ 1.5×垂直位移且垂直位移 < 80px；起點在左右 24px 邊緣不處理（避開 iOS／Android 系統返回手勢；LINE 內建瀏覽器的返回區寬度見 Q6，必要時 LINE 下加大到 32px，`swipeIntent` 邊緣寬度參數化並用表格測試）；`touchcancel`、多指（`touches.length>1`）、選字拖曳（起點在文字選取範圍內）一律略過。數值集中常數，實機可調。
- **照片區外**：內容容器綁 passive `touchstart/touchend`，起點在 `[data-carousel-scroller]` 內者忽略；容器 CSS `touch-action: pan-y pinch-zoom`（**保留雙指縮放，WCAG 1.4.4**）；輪播 scroller 自設 `touch-action: pan-x pan-y pinch-zoom`，祖先 `pan-y` 與之交集的影響以手機實測驗（jsdom 測不出，列為人工驗證項）。
- **輪播邊緣續滑**：`PhotoCarousel` 新增可選 `onEdgeSwipe?(dir)`。`touchstart` 以 `scrollLeft/clientWidth` **現算**起點 index（不取 rAF 去抖的 state，避免動量捲動中誤判）；`touchend` 時若起點在最後一張且判定向左（或第一張向右）→ 觸發。倒數第二張滑到最後一張的同一下手勢不觸發；單張照片兩向皆算邊緣。不傳 prop 行為完全不變。
- **鍵盤**：`window keydown` ←→；略過條件：`target` 為 input／textarea／select／contentEditable；`target.closest('[data-carousel-scroller]')`（輪播聚焦時 ←→ 換照片，W5-28）；有開啟中的 `[role=dialog]`／`aria-modal`；`role=slider|tab|menu`；帶修飾鍵；已 `defaultPrevented`。
- **預載**：不做（review P2：非業主需求、行動流量成本）。換篇後資料已在快取，首張照片由瀏覽器自行載入。

### 2.5 焦點與播報
- 「‹」「›」鈕或鍵盤觸發的換篇：重掛後**焦點回到同一顆鈕**（以 `data-nav-dir` 在新實例 mount 時還原焦點）；頭尾時鈕為 `aria-disabled="true"`（不用 `disabled`，焦點不掉 body）。手勢觸發的換篇：焦點移到新頁標題、`scrollTo(0,0)`。
- 單一 `aria-live="polite"` 區（sr-only）：「第 3 篇，共 12 篇」；視覺的「3/12」`aria-hidden`；與輪播右上角既有「1/3」計數的 accessible name 明確區分。到頭尾：同一 live 區播「已是最後一篇／第一篇」（一般使用者與 reduced-motion 使用者一致，且回彈動畫只作輔助）。

## 3. 架構影響

- 動到：`HomePage.tsx`（抽排序、Link onClick／state、`data-listing-id`、等待／重排、返回定位）、`ServiceProviderDetail.tsx`（換篇控制、手勢、鍵盤、焦點）、`App.tsx`（key wrapper 路由元素）、`listing/PhotoCarousel.tsx`（可選 `onEdgeSwipe`、scroller touch-action）、`utils/homeListingsCache.ts`（凍結脈絡、`lastViewedId`、entryId）、新增：`utils/distance.ts`、`utils/listingDistanceOrder.ts`、`utils/homeListingOrder.ts`、`utils/browseContext.ts`、`utils/swipeIntent.ts`、`utils/flipReorder.ts`、`data/districtCentroids.ts`（動態 chunk）、`scripts/` 一次性座標產生腳本。
- **bundle**：座標表走動態 chunk；其餘純函式小；每階段收尾跑 `node scripts/check-bundle-budget.mjs`（需先 `npm run build`），entry gzip 增量須 ≤ 0.5 kB，否則依腳本檔頭規定在 PR 說明理由才調預算。
- 各階段新純函式與其使用者**同階段落地**（knip 不得報未使用 export）。
- 與 multi-step-flow 四契約無涉。與 S4（PostHog）同碰頁面元件——S4 後開。

## 4. UI/UX

1. **控制位置**：既有 `backButton` 那一列（左：返回；右：「‹ 3/12 ›」）。**不新增列**，列高不變，骨架與載入後頂緣不位移。骨架是否預留右側控制由**同一個 `resolveBrowseContext`** 決定（兩態同源）；無脈絡進入時骨架與內容都無該控制。需補一個「有脈絡」的骨架探針案例（`e2e/test_public_skeleton_layout.py` 現有案例為無脈絡）。
2. **觸控**：兩顆鈕 `pointer-coarse` 下各 ≥44×44px（§1）；滑鼠 ≥24px。
3. **換篇動畫**：新一篇內容由側邊滑入（translateX ±24px→0＋淡入，200ms）；方向由 `state.dir` 決定；`prefers-reduced-motion` 關閉。到頭尾手勢：內容區塊輕微橫向回彈（只動內容區塊、不動頁首），reduced-motion 時不動，皆有 live 播報。
4. **非 ready 狀態**：換到已下架（notFound）或載入失敗時，仍渲染「‹ n/N ›」控制（讓使用者能繼續換篇，不卡死在換篇鏈）。
5. 規格書與 ui-ux-guidelines 同步（見階段 9）。

## 5. 階段切分（每階段＝一個 TDD 紅綠循環；新函式與使用者同階段落地）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 座標表＋距離與所在區：`districtCentroids`（動態 chunk）、`distance.ts`、`nearestDistrict` | vitest node：`data/districtCentroids.test.ts`、`utils/distance.test.ts` | 表鍵＝`TAIWAN_REGIONS` 全集；座標範圍；同名區跨縣市區分；`nearestDistrict` 對代表性座標（台北車站→中正區等）正確；entry bundle 不增（build 後預算腳本綠） |
| 2 | 區級排序＋抽 `filterAndSortListings`，HomePage 改呼叫 | vitest node：`listingDistanceOrder.test.ts`、`homeListingOrder.test.ts`；HomePage 既有測試為護欄 | 含使用者所在區者排最前；全區展開；最近服務區距離排序；同分維持 created_at；無定位維持最新；資料異常排最後；抽離前後篩選結果一致 |
| 3 | 等待＋FLIP 重排：Permissions 分支、`geoPhase`、`flipReorder` | vitest node（delta 計算）＋jsdom：`HomePage.test.tsx`、`flipReorder.test.ts` | granted 時 ≤1.5s 內座標到＝直接顯示距離排序、無動畫；1.5s 後才到＝先最新再動畫；prompt／denied／API 缺＝不等；reduced-motion 不呼叫 animate；有快取座標不重排 |
| 4 | 凍結脈絡＋`lastViewedId`＋Link onClick／state＋`data-listing-id`＋返回定位 | vitest jsdom：`browseContext.test.ts`、`homeListingsCache.test.ts`、`HomePage.backNavigation.test.tsx` | 點卡當下順序＝凍結 ids（含座標點擊後才到仍不變）；三種版型皆帶 state／data；POP：未換篇走 scrollY、換過篇置中；reset 清除；重整／Forward ctx 不符＝null |
| 5 | `PhotoCarousel.onEdgeSwipe`＋`swipeIntent`（邊緣寬度參數化）＋scroller touch-action | vitest node：`swipeIntent.test.ts`；jsdom：`PhotoCarousel.test.tsx`（既有全綠＋新增） | 最後一張起手左滑→next、第一張右滑→prev；倒數第二→最後不觸發；單張兩向；touchcancel／多指忽略；未傳 prop 行為不變 |
| 6 | 詳情頁換篇：`ServiceProviderDetailRoute` key wrapper、控制列「‹ n/N ›」、鍵盤、照片外手勢、replace、焦點、live 區、notFound／error 仍有控制 | vitest jsdom：`ServiceProviderDetail.test.tsx`、`App` 路由測試 | **A→B 首個 render 即 B；B 重驗失敗仍 B；B 404 仍有控制**；無脈絡不渲染；頭尾 `aria-disabled` 焦點不掉；輪播／輸入欄／dialog 內 ← 不換篇；鈕觸發保留焦點、手勢觸發移標題 |
| 7 | 換篇滑入動畫與頭尾回彈 | jsdom：reduced-motion 開關 | 有／無 reduced-motion 的 class／呼叫差異；live 播「已是最後一篇」 |
| 8 | e2e mocked Gherkin（含骨架探針案例） | `e2e/features/home_listings.feature`、`service_provider_detail.feature`＋steps；`test_public_skeleton_layout.py` 增「有脈絡」案例（CI 驗；本機可跑全 mock） | 場景（英文名照 test-naming）：剩 3 篇→顯示 1/3、上一篇 aria-disabled→下一篇變 2/3→返回一次回首頁且篩選仍在；直接開連結無換篇控制；定位已授權時首頁依距離排序（stub geolocation）；骨架同形（有／無脈絡）≤2px |
| 9 | 文件同步與收尾 | `check-spec-drift.py`、`check-plans-scaffold.py`、`check-test-names.py`、`check-bundle-budget.mjs` | 規格書 §3〈首頁的返回與重新進入〉補：換篇、返回定位規則；規格書新增首頁排序規則（區級距離、全區展開、最近區中心近似、等待 1.5 秒、重排動畫）；ui-ux-guidelines §5 補換篇控制與重排、第 173 行與表（第 843 行「距離排序用寫死台北座標」）同步；刪規劃檔 |

## 6. 開放問題（已裁決者留存記錄，未決者仍待）

已裁決（業主 2026-11-05，主 session 代收）：Q1 無脈絡不顯示；Q2 不做跟手拖曳；Q3 輪播聚焦時 ←→ 換照片；Q4 手機標題列右側常駐「‹ 3/12 ›」；凍結脈絡存模組層；沒換篇返回維持 scrollY、換過篇才置中；P0 必處置（見 2.3）；距離改區級（W5-24）；等待＋動畫重排（W5-25）；併入 S7 必上（W5-26）；換篇手感（W5-27）。

- [ ] **Q5 區中心座標來源與授權**：規劃採內政部國土測繪中心鄉鎮市區界線（政府資料開放授權條款第 1 版，可商用須標示出處）。授權文字與下載可行性實作階段於網路可達處確認；若不成立，退路＝請業主指定替代來源（例如 GeoNames CC-BY）。建議：維持現案。
- [ ] **Q6 LINE 內建瀏覽器邊緣返回區寬度**：規劃預設 24px、LINE 下 32px；需手機實測確認。實作階段由業主以手機驗證，數值不阻擋進實作。
- [ ] **Q7 「最近的區中心」反查在大區邊界的誤差**：接受近似，規格書明寫；若業主要求精確行政區判定需另接反地理編碼服務（不建議，個資外送）。建議：接受近似。

## 7. 風險與回滾

- 手勢誤判／與輪播衝突：常數集中、元件測試釘住；紅線＝輪播既有測試全綠；實機驗證項列入 PR 內文。
- 等待 1.5 秒使首頁首屏變慢：只在「已授權且座標未快取」才等，且與清單載入並行；最壞增加 1.5 秒骨架（與業主已選之 W5-25 一致）；`geoPhase` 單一旗標可一行關閉等待。
- 座標表資料錯誤造成排序錯：測試釘表全集與範圍；排序無定位時完全不受影響。
- bundle 預算：座標表動態 chunk；預算腳本每階段檢。
- 回滾：純前端，單一 PR revert；無資料、無 migration。
