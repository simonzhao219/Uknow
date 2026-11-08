# 刊登詳情頁換篇過場動畫 規劃書

## 0. 一句話

這個 feature 讓瀏覽刊登的會員在詳情頁左右滑／點「‹ ›」換篇時，看到有方向感、手指跟手的過場（而不是內容瞬間換掉），因為業主正式站實測「順但突然」（W5-69、W6-1、W6-20）；並順手還清 #509 留下的 P2 五項。

## 1. 使用者需求

- 對照規格書「刊登詳情頁的換篇」段（`docs/uknow-software-specification.md` 約 118 行）與 `docs/ui-ux-guidelines.md` 約 117 行（換篇控制）。
- 現況（已讀程式，行號現算）：`ServiceProviderDetailRoute` 以 `key={id}` 重掛 `ServiceProviderDetail`；換篇後新實例靠 `enterClass`（tailwind `animate-in fade-in slide-in-from-*-6`，位移只有 24px、200ms）進場；**舊內容沒有退場、手指滑動時內容不動**，放開後整頁瞬間換掉——這就是「突然」的來源。頭尾再換篇有 24px 回彈（`bounceContent`）。
- 驗收情境（可驗證）：
  1. 手機在照片區以外往左／右拖：內容跟著手指水平位移（不超過約 1/3 視窗寬，帶阻尼），放開且達 `swipeIntent` 門檻 → 換篇，新內容從手指去向的相反側滑入；未達門檻 → 彈回原位。
  2. 點「‹ ›」、按 ←／→：沒有手指跟手，但新內容同樣依方向滑入（同一段進場動畫）。
  3. 動畫進行中可以立刻再滑／再點，不等動畫結束（新一次換篇取消上一段進場）。
  4. 作業系統「減少動態」：不跟手位移、不滑入、不回彈；換篇結果與文字播報不變（動作以外的行為完全等同現況）。
  5. 頭尾再換篇：沿用現有回彈與「已是最後一篇／第一篇」播報（頭尾拖曳時阻尼更大、放開彈回）。
  6. 照片輪播內的左右滑仍是換照片，滑到盡頭續滑才換篇（現況不變）；輪播內的拖曳不觸發整頁跟手。輪播續滑換篇與按鈕、鍵盤同為「無跟手、有進場」。
  7. 邊緣保護區（左右 24px，`swipeIntent` 的 `edgeGuardPx`）、起點在 `button`／`a`／`input`／`textarea`／`select`／`[contenteditable]`、長按選字後的拖曳、起點在橫向可捲動祖先內：都不啟動跟手，也不換篇。
  8. 手勢 chunk 載入失敗：頁面其餘功能與「‹ ›」按鈕照常，只是少了滑動與鍵盤（靜默降級，刻意不提示）。
  9. 換篇動畫期間頁面不得出現橫向捲動：`document.documentElement.scrollWidth <= window.innerWidth`。
- 併入 #509 的 P2 五項（以 #509 PR 內文「後續 P2」為準）：
  - P2-a：reduced-motion 判斷尚有兩處未併入 `motionPreference`（`PhotoCarousel.tsx` 本地 `prefersReducedMotion`、`HomePage.tsx` 返回捲動內聯 matchMedia）。
  - P2-b：換篇邏輯（`goBrowse`、`bounceContent`、`enterClass`、焦點還原、捲到頂）內聯在 `ServiceProviderDetail`，抽 hook（#509 原規劃為 `useBrowseNav`）。
  - P2-c：`BrowseGestures` 動態 chunk 載入失敗沒有 error boundary（目前 lazy 拒絕會往上拋到路由層錯誤頁，整個詳情頁壞掉）。
  - P2-d：slide-in 在手機可能短暫橫向捲動（位移的內容超出視窗寬，產生橫向 scrollbar／整頁抖動）。
  - P2-e：照片區外手勢起點在「橫向可捲動祖先」內時不略過（例如表格、程式碼區；目前只排除 `[data-carousel-scroller]`）。
- 不做：不改換篇順序／脈絡凍結（`browseContext`）；不改 `swipeIntent` 門檻數值（LINE 內建瀏覽器 32px 邊緣保護仍待實機，屬 W5-66）；不做舊內容快照的雙頁並排轉場；不改首頁 FLIP 重排與返回捲動行為（只還 P2-a 的 reduced-motion 判斷來源）；不動後端。

## 2. 系統設計

純前端，無 API、無 migration。裁決 W6-20（主 session）：Q1 WAAPI＋inline transform；Q2 數值照建議起步；Q3 減少動態不保留淡入；Q4 bundle 授權 entry raw +2／gzip +0.5；Q5 手機實測列 PR 內文。

- **動畫層級（固定 wrapper）**：`ServiceProviderDetail` 的四個分支（ready／loading／error／notFound）改為**單一 return**：`gestureRef` 外層（只負責 `overflow-x: clip`、`touch-pan-y`）→ `topBar`（不位移）→ `<div ref={motionRef} data-browse-motion>`（transform／進場動畫只作用在這層）→ 依 status 切換的內容。wrapper 在同一實例內是同一個 DOM 節點，所以骨架換成內容時**不再動第二次**；`contentRef`／`data-browse-content` 保留在 ready 內容上不動（既有 e2e 探針依賴）。transform 與 `overflow-x: clip` 分屬兩層，clip 不會被自己的 transform 失效。骨架／錯誤態期間可以跟手（wrapper 恆在），換篇至「上一篇／下一篇」有效即可。
- **`key={id}` 重掛不動**（S7 P0 教訓）：舊 DOM 在 navigate 的同一 commit 消失，**沒有退場動畫**。方向感來自 (a) 拖曳期間內容已跟手位移、commit 時**保留位移到卸載**（不同步清 transform，避免舊內容彈回 0 再被換掉），(b) 新實例從去向對側固定起點進場。
- **連續性決策（回應審查 P1-2，W6-20）**：**不傳放開位移 `dx` 給新實例**（舊稿的「帶 dx 接續」會從 −dx 跳到 +dx，不連續）。新內容一律從對側固定偏移 32px、opacity 0→1、220ms `ease-out` 進場；舊內容在放開瞬間的位置到消失只有一次無動畫的替換，由新內容的淡入遮蔽。副作用：`location.state` 仍只帶 `dir`／`via`，**沒有 `dx` 殘留問題**（審查 P1-3 以刪除解決）；`goBrowse` 簽名不變。若實機仍覺得跳接，退路是「放開後舊內容滑出」：navigate 前以 `cloneNode` 疊一層絕對定位的舊內容快照滑出 ≤120ms 再移除（不阻擋 navigate，不等動畫）——列為 PR 內文的備案，不在本規劃預先實作。
- **進場時機**：新實例在 `useLayoutEffect` 內呼叫 `motionRef.current.animate(...)`（繪製前套上起點，避免首幀以 translate=0／opacity=1 閃一下）；只在 `navigationType==='REPLACE'` 且 `state.via` 存在時進場（首次進入、重整、分享連結都不動）。`animate` 不存在（jsdom／舊瀏覽器）或減少動態時直接跳過。動畫物件存 ref，unmount 與下一次 touchstart 時 `cancel()`；結束後 `fill` 不留、不留 inline transform。
- **跟手（`BrowseGestures` chunk）**：新增 props：`dragTargetRef`（= `motionRef`）、`hasPrev`、`hasNext`（頭尾判斷來源，取自 `neighbors.prevId/nextId`）。`onNavigate(direction, via)` 簽名不變。
  - touchstart：單指；起點不在邊緣保護區、不在輪播 `[data-carousel-scroller]`、不在互動元素（`closest('button,a,input,textarea,select,[contenteditable],[role="button"]')`）、不在橫向可捲動祖先（純函式 `startsInsideHorizontalScroller(target, boundary)`，只走到 `gestureRef` 為止，避免整棵樹 layout）；先 `cancel()` 進行中的進場／彈回動畫，再開始以 0 為基準。
  - touchmove：前 ~10px 判軸向（垂直為主→放棄，交給瀏覽器捲動）；水平鎖定後才跟手。有文字選取（`getSelection` 非空）不跟手。位移經 `dragOffset` 阻尼（0.5、上限視窗寬 1/3；該方向無鄰居時阻尼加重、上限 24px），以 rAF 合併寫 `style.transform`；因為 `touch-pan-y` 已讓瀏覽器不處理水平 pan，**不呼叫 `preventDefault`**，`touchmove` 維持 passive（省掉 `passive:false` 與對 iOS 邊緣返回的額外風險；階段 4 實測若水平滑動時垂直捲動漏出再議，列為 Q 之一）。
  - touchend：`settle` 以既有 `swipeIntent` 判定（門檻不重複定義）→ commit：呼叫 `onNavigate`，保留 transform 到卸載；cancel：WAAPI 彈回 0（180ms）後清 inline transform。頭尾放開＝cancel，並**取代**既有 `bounceContent`（單一彈回實作，不疊加；`goBrowse` 頭尾分支改走同一個 `springBack()`）。
  - touchcancel／`visibilitychange`(hidden)／unmount：取消待寫入的 rAF、清 inline transform。減少動態：全程不寫 transform。
- **橫向溢出（P2-d）**：外層 `gestureRef` 加 `overflow-x: clip`（不用 `hidden`，不形成捲動容器）。風險：貼邊 focus ring／Card 陰影被裁——階段 5 e2e 加探針，且 wrapper 內側保留與現況相同的 padding；舊 LINE WebView 對 `clip` 的支援度（不支援時退化為不裁切＝維持現況行為）列手機實測。
- **error boundary（P2-c）**：極小的 class boundary（`fallback=null`、`console.error`）包 `BrowseGestures` 的 `Suspense`，**必在 entry**（包在 chunk 之外）；與既有 `ErrorBoundary`（整頁 fallback）職責不同，不參數化重用。`React.lazy` 會快取 rejection：失敗後同一 session 內不再嘗試，鍵盤與滑動降級到重整為止——可接受（按鈕換篇仍可用）。
- **減少動態**：所有動畫入口先問同一個 `prefersReducedMotion()`；`PhotoCarousel`、`HomePage` 改用它（P2-a）。

## 3. 架構影響

- 動到：`ServiceProviderDetail.tsx`（單一 return＋wrapper、抽出換篇邏輯）、新 `src/hooks/useBrowseNav.ts`（管 navigate、進場、springBack、焦點還原、捲到頂）、`listing/BrowseGestures.tsx`（新 props、touchmove 跟手、起點判斷）、新 `src/utils/browseDrag.ts`、`motionPreference.ts`（收口）、`listing/PhotoCarousel.tsx`、`HomePage.tsx`（只換判斷來源）、新 boundary 元件。
- lazy 結構：`BrowseGestures`、`browseDrag`、`startsInsideHorizontalScroller` 在動態 chunk；hook、boundary、wrapper 在 entry。
- **Bundle（W5-43；W6-20 授權超標時 entry raw +2／gzip +0.5，須在 PR 內文附階段 3、6 實測數字）**：#509 實測 entry 1012.0／315.4、總 raw 1946.8，餘約 3 kB／0.6 kB。**階段 1 先量基線；階段 3 與階段 6 各跑一次 `npm run build && node scripts/check-bundle-budget.mjs`**，超標立即停手回報，不等階段 7。
- PostHog 錄影遮罩不受影響：不新增含個資的節點、不改 `privateClass`／`maskTextSelector`；wrapper 只加一層無文字 div。
- 與多步驟流程四契約：無關。

## 4. UI/UX

- 動態規範寫進 `ui-ux-guidelines.md`（換篇控制段擴寫）與規格書「刊登詳情頁的換篇」段；只寫實作事實（跟手、進場、減少動態時不動），不寫「不提供 X」旁白（`document-writing.md`）。階段 7 列預計新增句子：①「手指在詳情頁內容區左右拖動時內容跟手位移，放開達門檻才換篇，否則彈回」②「換篇後新內容從去向對側滑入；偏好減少動態時不位移、不淡入」③〔實作〕清單補 `src/hooks/useBrowseNav.ts`、`src/utils/browseDrag.ts`。改前確認 `check-spec-drift.py` 是否抽取該段（若抽取常數，措辭須與抽取規則一致）。
- 手機：拖曳跟手（上限視窗寬 1/3、阻尼 0.5）；未達門檻 ~180ms 彈回；換篇後 ~220ms 淡入滑入（對側 32px）。桌機按鈕／鍵盤：同一段進場動畫，無跟手（業主原話為「依方向 slide-in／淡入」，桌機一併做，Q2 已確認）。輪播盡頭續滑同。
- 載入／錯誤／找不到：wrapper 恆在，進場動畫只在掛載時跑一次，骨架換內容不重播。
- 焦點／播報不變；觸控目標與 `touch-pan-y` 不變。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | reduced-motion 收口（P2-a）；**量 bundle 基線** | vitest：沿用現有 `src/test-utils/stubMediaQuery.ts` 的 matchMedia stub（不另立 mock 模組手法）：`PhotoCarousel.test.tsx` 加「減少動態時 scrollTo 用 auto」、`HomePage` 返回捲動同理；`rg "prefers-reduced-motion" src` 只剩 `motionPreference.ts` | 紅：兩處現用本地判斷但測試經由 `motionPreference` 注入點斷言（先在 `motionPreference` 提供可被 stub 的單一入口）；綠後 grep 只剩一處；記基線數字進 progress.md |
| 2 | 純函式 `browseDrag.ts`：`lockAxis`、`dragOffset`（阻尼、頭尾加重、上限）、`settle`（呼叫 `swipeIntent`）、`startsInsideHorizontalScroller` | vitest node：表格案例（垂直為主放棄、斜向、邊緣保護、頭尾、上限）；`settle` 與 `swipeIntent` 同輸入同結論的交叉測試；`startsInsideHorizontalScroller` 以 jsdom 模擬 `scrollWidth`／`overflow-x` | 全綠 |
| 3 | 抽 hook `useBrowseNav`＋固定 wrapper＋WAAPI 進場（P2-b）；**量 bundle** | vitest jsdom `ServiceProviderDetailRoute.test.tsx`：測試檔頭以 `Element.prototype.animate = vi.fn()` stub（現有 363 行起的 describe 已有此做法，沿用）；**只置換 enterClass 相關斷言**（`slide-in` class 那幾條）為 animate spy 斷言，其餘既有測試（焦點、播報、頭尾、脈絡）零修改通過；新斷言：進場在 layout effect 呼叫（render 後立即有呼叫，起點方向正確：next→正、prev→負）、連續兩次換篇第二次前先 `cancel` 上一段、減少動態不呼叫、首次進入／重整不呼叫、骨架→內容 wrapper 為同一 DOM 節點且只進場一次、`state` 不含 `dx` | 紅：新斷言；綠：全綠；`check-bundle-budget` 數字記進 progress.md |
| 4 | 跟手與放開（`BrowseGestures`） | vitest jsdom `BrowseGestures.test.tsx`：以 `new Event('touchstart'/'touchmove'/…)` 手動掛 `touches`／`changedTouches`（jsdom 無完整 Touch）：跟手時 `dragTargetRef.style.transform` 變化；垂直為主不動；放開達門檻呼叫 `onNavigate` 且 transform 保留；未達門檻彈回後清空；touchcancel／visibilitychange／unmount 後 transform 為空且 rAF 已取消；邊緣保護、互動元素、輪播、橫向捲動祖先、有選取、減少動態：全不啟動；頭尾阻尼 < 非頭尾；touchstart 會 cancel 進行中動畫；touchmove 監聽器為 passive | 紅綠各一輪 |
| 5 | 橫向溢出（P2-d）、頭尾彈回併入 `springBack`（取代 `bounceContent`） | vitest jsdom：外層含 `overflow-x: clip`、頭尾放開只呼叫一次 `animate`（不疊加）；e2e 階段 7 實測 `scrollWidth<=innerWidth` 與 focus ring 不被裁 | 單測綠 |
| 6 | 手勢 chunk error boundary（P2-c）；**量 bundle** | vitest jsdom：`vi.mock` 讓動態 import 拒絕 → 詳情頁內容與「‹ ›」仍渲染、`console.error` 被呼叫、按鈕換篇照常、boundary 在 chunk 之外（entry） | 紅：現況整頁掉到路由層錯誤頁；`check-bundle-budget` 數字記進 progress.md |
| 7 | e2e、文件、最終 bundle | mock e2e `service_provider_detail.feature` 加：手勢（CDP touch 或 `dispatchEvent` 序列）換篇時 wrapper 的 inline transform 非空、放開後換到下一篇；`reduced_motion='reduce'` 下 transform 恆空；`scrollWidth<=innerWidth`；版面位移探針（≤2px）仍綠；規格書＋準則同步；`check-spec-drift.py`、`check-test-names.py`、`npm run check:full` | CI e2e 綠 |

測試落點誠實聲明：動畫順不順自動化測不到，只能量到「有跟手、有方向、不橫向溢出、減少動態時不動」；順暢度靠業主手機實測（PR 內文附三項步驟，見 §6）。

## 6. 開放問題

已裁決（W6-20，主 session）：Q1 WAAPI＋inline transform；Q2 數值起步＝位移上限視窗寬 1/3、阻尼 0.5、進場 220ms、彈回 180ms、對側偏移 32px、桌機按鈕同一段進場；Q3 減少動態不保留任何淡入；Q4 bundle 超標授權 entry raw +2／gzip +0.5，PR 內附階段 3、6 實測；Q5 手機實測三項列進 PR 內文。

- [ ] Q6（實作期觀察，非阻擋）：階段 4 實機若水平拖曳時垂直捲動漏出，是否改為鎖定後 `preventDefault`（touchmove 改 `passive:false`）。預設不加。
- [ ] Q7（手機實測，業主）：(1) 放開後的舊→新跳接是否可接受，不行啟用 §2 的快照滑出備案；(2) 手機滑入是否仍有橫向閃動、`overflow-x: clip` 是否裁掉 focus ring（舊 LINE WebView 支援度）；(3) LINE／iOS 邊緣系統返回手勢是否與跟手打架（`edgeGuardPx` 放寬屬 W5-66，不在本 PR 改）。

## 7. 風險與回滾

- 最壞：跟手與原生捲動／iOS 邊緣返回衝突。緩解：軸向鎖定、邊緣保護區不啟動、passive 監聽不攔截原生行為；階段 4 測試釘住。
- 次要：低階機卡頓。緩解：只用 transform／opacity；常數集中，時長歸零即關閉。
- 回滾：純前端，revert 該 PR 即回到 #509 現況，零遷移。
