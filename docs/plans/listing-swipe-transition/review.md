# 刊登詳情頁換篇過場動畫 規劃書審查報告

<!-- 四視角（系統／架構／UI/UX／需求）fresh-context subagent 的彙整。只彙整、去重、排序，不改判。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 6 | 5 | API／DB／RLS／金流不適用；`key={id}` 重掛與 `useLatestRequest` 競態未被破壞 |
| 架構 | 0 | 6 | 4 | lazy 切分、apiClient、UserContext、appShell 相容；回滾清楚 |
| UI/UX | 0 | 4 | 3 | 資訊架構／BottomNav、a11y（焦點／live 區／aria-disabled）、觸控目標 |
| 需求 | 0 | 4 | 4 | 業務規則不涉及；未腦補需求（數值全進開放問題） |

**P0＝0。** 去重後 P1 共 11 組（下列 1～11；各視角原判合計 20 項），P2 共 9 組。

## 發現清單（依嚴重度排序；括號為提出的視角）

### P1

1. **動畫目標元素矛盾**（系統、架構、UI/UX 皆提）〔§2 動畫層級 vs §4 載入態〕§2 說做在 `contentRef`，§4 說骨架／錯誤／找不到態同一動畫；但 `contentRef`／`data-browse-content` 只存在於 ready 分支（`ServiceProviderDetail.tsx` 約 304 行），loading／error／notFound 各自回傳不同外層。後果：無快取時骨架先無動畫出現、載完內容再滑入一次；`gestureRef` 含頁首列，直接位移會違反「頁首不動」與版面位移探針；`overflow-x: clip` 與 transform 設在同一元素時 clip 可能失效。→ 明定單一目標：`gestureRef` 內、`topBar` 之外的固定 wrapper（跨四個分支存活），transform 與 `overflow-x: clip` 分屬兩層；並決定骨架／錯誤態期間是否允許跟手。
2. **「接續滑入」方向與連續性不成立**（系統、架構、需求、UI/UX 皆涉及）〔§1 情境 1、§2 動畫引擎(b)〕舊內容拖到 −dx，新內容卻從對側 `±max(24,|dx|)` 起滑，視覺是跳變而非接續；舊 DOM 在 navigate 的同一 commit 就消失，必有一次位置跳接。階段 3 紅燈斷言也釘在這個符號上。→ 一句話釘死符號與是否與放開位置銜接；系統另指出 commit 時不可同步清 transform（舊內容會彈回 0 再被換掉）——commit 保留到卸載，只有 cancel 才彈回。〔需人工裁決：是否符合業主要的「有方向感」，須手機實測〕
3. **`dx` 殘留與取值未定**（系統、架構）〔§2 `location.state`〕`goBrowse` 以 `...location.state` 展開舊 state，手勢寫入的 `dx` 會被下一次按鈕／鍵盤換篇帶入；`onNavigate` 簽名要加 `dx`，另兩個呼叫者（`BrowseNav.onGo`、`PhotoCarousel.onEdgeSwipe`）沒有 dx；dx 是「阻尼後畫面位移」還是「手指原始位移」未定。→ `goBrowse` 每次顯式設 `dx`（手勢給值，其餘 undefined）；寫明 dx 定義與可選參數；階段 3 加「先手勢、再按鈕，起點為 24px」測試。
4. **進場動畫掛載時機**（系統）〔§2 動畫引擎、§5 階段 3〕改 WAAPI 後若在 `useEffect` 才 `animate()`，新實例會先以 translate=0／opacity=1 繪出一幀再跳起點（現況以 class 隨首次 render 套上，無此閃爍）。→ 規定 `useLayoutEffect`，並以測試釘住。
5. **跟手 vs 進行中的 WAAPI／rAF 順序**（系統、UI/UX）〔§2 跟手、情境 3〕WAAPI 動畫優先於 inline style，動畫中再觸碰時 touchmove 寫的 transform 看不見；cancel 掛在「新一次換篇」而非「新一次 touchstart」；touchend／touchcancel／unmount／`visibilitychange` 時待寫入的 rAF 與殘留 transform 未定義，WAAPI 結束後不得留 inline transform。→ touchstart 先 cancel／finish 進行中動畫並定基準；取消 rAF、cleanup 清 style；階段 4 補測試。
6. **跟手未套邊緣保護、選字與互動元素起點、頭尾資訊來源**（系統、UI/UX、需求）〔§2 水平鎖定、§1 情境〕`swipeIntent` 的邊緣保護（24px；需求視角寫 32px，以程式碼 24px 為準）只擋換篇，跟手若在邊緣起點仍位移，會與 iOS／LINE 系統返回手勢打架，且「動了卻沒換」；長按選字後的拖曳不應跟手；起點在 `button`／`a`／`input` 上是否跟手與頁首列起手未定；`BrowseGestures` 現只有 `containerRef`、`onNavigate`，沒有「上一篇／下一篇是否存在」的資料，「頭尾加重阻尼」無來源，且頭尾放開彈回與既有 `bounceContent`（180ms）可能疊加。→ 邊緣／選字／互動元素起點不啟動跟手；新增 `dragTargetRef`、`hasPrev`／`hasNext` props 並寫成介面契約；合併頭尾彈回與 `bounceContent`；LINE／iOS 實機列為階段 7 必驗項。
7. **輪播續滑換篇路徑的過場**（需求、UI/UX）〔§1 情境 6〕輪播內不跟手但盡頭續滑會換篇，這條路徑有沒有跟手、`dx` 取值、如何進場，沒有定義。→ 補一條情境（建議：無跟手、有進場，dx 取固定 24px 級）。
8. **P2-c／d／e 未進編號驗收情境**（需求）〔§1〕error boundary 失敗時使用者可見行為、橫向溢出的判準（`scrollWidth ≤ innerWidth`）、橫向捲動祖先內起手不換篇，只散在階段測試。→ 補成編號情境。
9. **階段 3 驗證標準自相矛盾，jsdom 無 `Element.prototype.animate`**（系統、架構）〔§5 階段 3〕同格寫「slide-in class 斷言改為 animate spy」又寫「既有測試零修改通過」；`typeof el.animate !== 'function'` 守衛會讓未 stub 的測試空過。→ 改寫為「僅 enterClass 相關斷言置換，其餘零修改」，並寫明 stub 方式。

以下兩組同為 P1（架構）：
10. **階段 4 的 jsdom 觸控事件構造**〔§5 階段 4〕jsdom 的 Touch／TouchEvent 支援有限，須說明用 `new Event` 加手動掛 `touches`；且 `touch-pan-y` 已讓瀏覽器不處理水平 pan，「鎖定水平後才 `preventDefault`（`passive:false`）」是否必要需先確認，不必要則省掉。
11. **Bundle 估算缺依據**〔§3〕entry 只剩約 3 kB raw／0.6 kB gzip；hook 搬移、WAAPI、取消邏輯、class boundary 全在 entry，「淨增 < 0.5 kB」無根據。→ 階段 1 量基線，階段 3、6 各跑一次 `check-bundle-budget`，不等階段 7；並明講 boundary 必在 entry（已有 `src/components/ErrorBoundary.tsx` 但為整頁 fallback，不適合直接重用）。


### P2

- 階段 1 mock 手法：現有測試用 `src/test-utils/stubMediaQuery.ts` stub matchMedia，規劃寫「mock `motionPreference` 模組」，擇一避免兩套並存（架構）。
- `startsInsideHorizontalScroller` 逐祖先 `getComputedStyle`＋`scrollWidth` 會觸發 layout，寫明只走到 `gestureRef` 為止（架構）。
- 新 class boundary 與既有 `ErrorBoundary` 並存，註記為何不參數化重用（架構）。
- 動態規範寫進 `ui-ux-guidelines.md`／規格書時，確認 `check-spec-drift.py` 是否抽取該段常數，避免措辭失配變紅；並依 `document-writing.md` 不寫「不提供 X」旁白，列出預計新增的規格書句子與〔實作〕檔案清單（架構、需求）。
- `React.lazy` 在模組層級快取 rejection：chunk 載入失敗後整個 session 鍵盤與滑動都消失，註明可接受的降級或重建 lazy（系統）；fallback 為靜默亦註明是刻意（UI/UX）。
- 長按選字：touchmove 階段也要檢查選取（系統，已併入 P1-6 處理）。
- `overflow-x: clip` 可能裁掉貼邊的 focus ring／Card 陰影，階段 5 e2e 加探針；舊版 LINE WebView 對 `clip` 的支援度待實機（系統、UI/UX）。
- §4 「骨架／錯誤態同一動畫」超出業主原話，視為範圍擴張，刪除或列為開放問題（需求；與 P1-1 同源）。
- 開放問題品質：Q6（hook 命名）、Q5 後半（`edgeGuardPx`）不需人裁決；Q1 規劃已採用；桌機按鈕／鍵盤換篇是否要動畫（業主原文只提依方向 slide-in／淡入）未列為問題，補進 Q2（需求）。

## 需人工裁決

1. **視覺連續性**（P1-2）：放開後舊內容在同一 commit 消失、新內容從對側滑入，是否符合「有方向感」——須手機實測；請決定符號（新內容從手指去向的對側、起點不依賴 dx，或與放開位置銜接）。
2. **Q3 減少動態是否保留極短淡入**（UI/UX 標記）：建議不保留，但視覺使用者將看到整頁瞬間替換。
3. **Q4 bundle 額度**：階段 3／6 實測後若超標，是否授權調高（建議 raw +2、gzip +0.5）。
4. **`overflow-x: clip`** 的 focus ring 裁切與舊 LINE WebView 支援度：僅能實機確認。
5. **#509 的 P2 五項原文**與規劃書所列是否一致（需求視角無法驗證；本 session 已讀 #509 PR 內文「後續 P2」段，五項一字對得上）。
6. **P1 處置方式**——建議「修訂規劃後通過」：將 P1-1～11 併入 plan.md（§2 介面契約、§5 各階段驗證標準），不需重跑完整審查；若業主偏好重跑請告知。

## 處置（人審後填寫）

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。 -->

- 2026-11-08 主 session 裁決 W6-20：修訂後通過；P1-1～11 已併入 plan.md（固定 wrapper、不傳 dx、useLayoutEffect、touchstart cancel、邊緣／互動元素／選字起點、hasPrev/hasNext、階段 3/6 量 bundle 等）。待業主親審並親打 /tdd-implement。
- [ ] 人審完成,裁決:□ 通過 ☑ 修訂後通過(豁免理由:P0=0，P1 全數併入規劃，不重跑完整審查) □ 退回重規劃
