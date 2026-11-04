# 刊登詳情頁左右滑換篇 規劃書審查報告

<!-- plans-keep: 施工鷹架；/tdd-implement 收尾與 plan.md、progress.md 一併刪除 -->

由 /review-plan 彙整四個 reviewer 發現（只去重、排序，不改判；重複項註明來源視角，severity 取原判最高者）。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1 | 3 | 4 | API／DB／金流、useLatestRequest、replace 歷史語意、重整雙條件檢查 |
| 架構 | 0 | 2 | 3 | appShell／路由 lazy、模組邊界、onEdgeSwipe 不改輪播本體、測試命名與檔位 |
| UI/UX | 0 | 6 | 3 | BottomNav、三態、返回行為、輪播不退化、垂直捲動門檻 |
| 需求 | 0 | 3 | 2 | 七項業主需求皆有對應、與規格書 §3 不衝突、「不做」清單明確 |

## 發現清單（依嚴重度排序）

### P0
- [P0]〔系統・§2 換篇／§3〕換篇是同一個 `ServiceProviderDetail` 實例換 `:id`（App.tsx:305 無 key），`useState(() => getCachedListing(id))` 只在掛載時跑 → 換篇後仍顯示上一篇內容直到重驗回來（重驗失敗則永久停在舊內容、notFound 殘留），與「無閃白」相反；快速連按時 n / N 與內容對不上。→ `id` 變動時同步重設，或外層對內層加 `key={id}` 重掛（連 PhotoCarousel index／scrollLeft 一併重置）；補測試：A→B 第一個 render 即 B 的內容、B 重驗失敗仍是 B。（架構視角同項列為 P1；UI/UX P2「key={id} 重掛輪播」同方向）

### P1
- [P1]〔系統／架構・§2 清單脈絡來源〕詳情頁以模組快取現算 ids，會與點擊當下所見漂移：`getCurrentPosition` callback 在元件卸載後仍寫 `setCachedCoords`（HomePage.tsx:203-208），點進詳情後座標才到則順序重排；`useMemo` 依賴非 reactive 的模組讀值；`getCachedFilters` 靠 effect 寫入。→ 點卡片時凍結脈絡（有序 id 陣列）存起來，詳情頁只讀凍結值（存放處見「需人工裁決」）；並以整合式測試釘住「點卡當下順序＝詳情 ids」。
- [P1]〔架構・§2 抽函式〕`cityCoordinates`、`calculateDistance`（HomePage.tsx:59、74）須隨 `filterAndSortListings` 一併移入 utils，否則 utils 反向依賴元件。→ 階段 1 一併搬。
- [P1]〔系統／架構／UIUX・§2 鍵盤、§6 Q3〕輪播 scroller 是原生可捲動容器，←→ 為瀏覽器原生捲動、不 `preventDefault`，`defaultPrevented` 無法區分，會同時換照片又換篇；另未排除 `[role=dialog]`／aria-modal、role=slider/tab/menu 等。→ `target.closest('[data-carousel-scroller]')` 與開啟中的對話框一律略過，補測試。
- [P1]〔系統／UIUX・§2 `touch-action: pan-y`〕`pan-y` 關掉 pinch-zoom（WCAG 1.4.4），多指 touchend 可能誤判換篇；未處理 `touchcancel`、長按選字拖曳。→ 改 `pan-y pinch-zoom`；僅 `touches.length===1` 全程單指成立；處理 touchcancel。（架構 P2：祖先 touch-action 與輪播橫向 pan 為交集語意，需實機驗證）
- [P1]〔UIUX・§4 無障礙／桌機〕手機沒有任何非手勢換篇入口（箭頭鈕僅 lg 起），VoiceOver／TalkBack 攔截水平滑動，違反 WCAG 2.5.1。→ 手機也要有可聚焦的上一篇／下一篇控制項（至少 sr-only 可聚焦；視覺是否常駐見「需人工裁決」）。
- [P1]〔UIUX・§4 焦點管理〕換篇一律移焦點到標題＋scrollTo(0,0)：鍵盤連按「下一篇」焦點被拉走；頭尾 disabled 時焦點掉 body。→ 鈕／鍵盤觸發保留焦點在原鈕，頭尾改交對側鈕或用 `aria-disabled`，只有手勢換篇才移標題；寫明與 `focusAfterLoad` 慣例的關係。
- [P1]〔UIUX・§4 n / N／Q4〕與輪播右上角既有 `aria-live` 的「1/3」撞車，報讀連播兩次；位置未定。→ 新計數 accessible name 要區別（「第 2 篇，共 12 篇」），`aria-live` 只留一處；位置在階段 4 測試前拍板。
- [P1]〔UIUX・§4 骨架同形〕「骨架同步放等高空白」與「無脈絡不渲染」矛盾，`test_public_skeleton_layout.py`（≤2px）會紅。→ 骨架是否預留由與詳情頁同一個「脈絡有效」純函式決定；放標題列右側內嵌、不新增列；補「有脈絡」探針案例。
- [P1]〔需求・§1／§2 返回定位〕規格書語意是還原 scrollY，規劃改為優先 scrollIntoView 置中該卡，但未列哪些情況算可還原；「進詳情但沒換篇」是否也置中未講。→ 補明確規則並同步規格書；未換篇情境見「需人工裁決」。
- [P1]〔需求・§2 手勢數值／邊緣 24px〕邊緣 24px 不處理屬對外行為、業主需求未有，§6 未列。→ 列入開放問題或寫進驗收情境；數值本身可留常數。
- [P1]〔需求・§5 階段 5〕e2e 只驗「下一篇→返回」與無脈絡；業主痛點（剩 3 篇）的 n / N、頭尾 disabled 沒有 e2e。→ 加「剩 3 篇：1 / 3、上一篇 disabled、下一篇變 2 / 3、返回一次回首頁且捲到該卡」。

### P2
- [P2]〔系統・§2〕`lastViewedId` 進詳情時也設，未限定帶旗標入口；未換篇時置中會蓋掉精確 scrollY（W2-10）；HomePage 三種版型與兩個 `<Link>`（1067、1104）須全覆蓋。→ 只在帶旗標時設、僅 lastViewedId≠點擊進入那篇時用 scrollIntoView，各 viewMode 補測。
- [P2]〔系統・§2〕旗標不帶脈絡版本，重整／返回後 Forward 回詳情時快取已換條件，n / N 錯位。→ 旗標附凍結脈絡版本號（隨凍結方案處理）。
- [P2]〔系統・§2 與輪播合併〕touchstart 的 index 取自 rAF 去抖的 state，動量捲動中可能誤判邊緣。→ touchstart 以 `scrollLeft/clientWidth` 現算。
- [P2]〔系統・§4〕換到已下架（notFound）刊登時早退畫面無換篇 UI，卡在換篇鏈。→ notFound／error 態也渲染換篇控制，或明文接受並記入規劃。
- [P2]〔架構・§5 階段 1〕新純函式暫無呼叫者，knip 在階段 1 報未使用 export、pre-commit 紅。→ 階段 1 同時讓 HomePage 呼叫 `filterAndSortListings`，`getNeighbors`／`swipeIntent` 與使用者同階段落地。
- [P2]〔UIUX・§4 回彈〕沒說回彈動誰、與 `overscroll-x-contain`／iOS 邊緣返回關係；reduced-motion 才有文字提示，一般使用者到底只有回彈。→ 指定只動內容區塊；一律以文字提示告知。
- [P2]〔UIUX・§2 邊緣 24px〕LINE 內建瀏覽器返回手勢區寬度未對照（browserDetection.ts L49）。→ 對照後必要時 LINE 加大到 ~32px，swipeIntent 測試參數化。
- [P2]〔UIUX・§2 預載〕行動網路預載流量未評估。→ `saveData` 不預載或只預載滑動方向那篇。
- [P2]〔需求・§2 預載／§4 淡入／aria-live 提示〕預載、淡入 150ms、頭尾提示不在業主需求內。→ 刪除或標選配並列 Q。
- [P2]〔需求・§1「不做」〕「首頁無分頁、一次載入全部」缺程式碼出處。→ 補 HomePage 載入處（`fetchAllListings`）。

## 需人工裁決

1. **凍結脈絡存放位置**（系統）：模組層（與快取同生命週期，重整即消失＝與「無脈絡不顯示」一致）或 history.state（隨 entry 持久、體積大）。推翻規劃書「不另存有序 id」的原決策，需業主／規劃者裁。**建議：模組層**（Sonnet 規劃者立場，僅建議）。
2. **手機是否常駐可見上一篇／下一篇鈕**（UIUX）：加則 UI 密度增加，不加則違反 WCAG 2.5.1。至少 sr-only 可聚焦；視覺由業主裁。
3. **進詳情但沒換篇、直接返回時**：置中該卡或維持原 scrollY（需求）。
4. Q1～Q4（plan.md §6）仍待裁；Q3 須併入鍵盤攔截規則才完整。

---

# 第二輪審查（規劃書 v2，2026-11-05）

納入裁決 W5-24～28 後重審。第一輪 P0／P1 處置經四視角逐項驗證：**成立**（key wrapper、cityCoordinates 搬遷、knip 階段落地、手機常駐控制、pinch-zoom、鍵盤略過、返回定位規則、e2e 剩 3 篇）。以下為第二輪新發現（只彙整、去重，不改判）。

| 視角 | P0 | P1 | P2 |
|---|---|---|---|
| 系統 | 0 | 3 | 4 |
| 架構 | 0 | 2 | 3 |
| UI/UX | 0 | 3 | 3 |
| 需求 | 0 | 2 | 2 |

**P0：無。** P1 共 10 項，已於 plan v2.1 處置如下（處置＝規劃修訂，非豁免）：

| 發現（視角） | 處置（plan v2.1） |
|---|---|
| P1 有快取清單＋無快取座標＋granted 會把可即時渲染的清單蓋成骨架 1.5 秒，破壞「返回不可閃」（系統） | §2.2：等待只在冷載入＋無快取座標＋granted；有快取清單一律立即顯示；階段 3 補測試 |
| P1 狀態機漏算「表是否到位」「permissions.query 延遲」（系統） | §2.2：掛載並行四件事、截止從掛載起算、`ready` 含表已載入；表失敗＝最新排序 |
| P1 FLIP 競態：重驗／篩選／打斷／卸載（系統） | §2.2：只有座標晚到那一次做 FLIP；其餘直接換；量測前 `cancel()`；階段 3 補測試 |
| P1 entry 預算：ServiceProviderDetail 也在 entry，≤0.5 kB 必超（架構） | §2.1：承認 +1.5–2.5 kB；`useBrowseNav` 僅有脈絡時動態載入；階段 2 實測後決定預算上調並寫理由 |
| P1 階段 1 的表與 `nearestDistrict` 無使用者、動態 import 驗證空轉（架構） | §5：階段重排，表＋排序＋HomePage 接入合併為階段 2，驗證改為「出現獨立 chunk 且 entry 不含」 |
| P1 live 區在被重掛的實例內，報讀器不播報（UI/UX） | §2.5：live 區放 `ServiceProviderDetailRoute`（key 之外），測同一 DOM 元素 |
| P1 座標晚到時 FLIP 讓卡片在手指下移位（UI/UX＋系統〔需人工裁決〕） | §2.2 建議值＋開放問題 **Q8**（待業主裁決） |
| P1 「既有 backButton 列」不存在，notFound 無返回鈕（UI/UX） | §4.1：抽共用 `DetailTopBar`，四態皆渲染 |
| P1 規格書無首頁排序規則段，規則落在最後階段（需求） | 階段 1 第一個 commit 先補規格書草案，階段 9 校對 |
| P1 `city` 比對與多區行為為規劃者自訂、未引資料模型（需求） | §2.1：引 `listing.ts` 單一 city＋districts[]、空陣列視同全區、跨縣市不存在 |

P2 處置：ctx 改隨機 nonce（系統 P2-a）；districts 空陣列／部分未知／台臺字串（P2-b）、預算分數預算化（P2-c）、雙分頁／修飾鍵（P2-d）、`src/data/` 改 `src/utils/`、chunk 載入失敗降級與預載、腳本非 CI 工具與檔頭資訊、骨架期控制可點、`dir` 只讀一次、等待不加文案列為有意識決定、置中落空退回 scrollY——皆已入 plan v2.1。

## 第二輪仍待人工裁決

1. **Q8**（座標晚到且使用者已捲動／操作時是否重排）：建議＝scrollY≤120px、無觸控、未改篩選才重排，否則不重排並以 `orderMode` 維持該次造訪順序。
2. **Q5**（區中心座標來源與授權，阻擋階段 1–2）：需網路可達處先確認內政部國土測繪中心資料授權與可下載；雲端容器未驗。建議進實作前由有網路的環境確認，或授權我在階段 2 開頭確認、不成立即停下回報。
3. 規劃書 v2.1 因修訂量大，建議主 session 親審時重點看 §2.2、§2.1 預算段、§4.1。

## 處置(人審後填寫)

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
