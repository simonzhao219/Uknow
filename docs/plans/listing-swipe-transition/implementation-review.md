# 刊登詳情頁換篇過場動畫 實作審查報告

<!-- 四視角（系統／架構／UI/UX／需求）fresh-context subagent 審實作 diff。只彙整、去重、排序，不改判。 -->

## 審查結論

| 視角 | P0 | P1 | P2 |
|---|---|---|---|
| 系統 | 0 | 1 | 3 |
| 架構 | 0 | 2 | 4 |
| UI/UX | 0 | 1 | 3 |
| 需求 | 0 | 0 | 3 |

**P0＝0。** 需求視角結論：驗收情境 1～8 都有對應實作、無遺漏；情境 9 只驗拖曳當下。

## 發現清單（去重後，依嚴重度）

### P1

1. **輪播盡頭續滑在頭尾再換篇時沒有回彈**（系統）`useBrowseNav.goBrowse` 對 `via==='swipe'` 一律不輕推，但 `PhotoCarousel.onEdgeSwipe` 也以 `'swipe'` 呼叫，且輪播起點被 BrowseGestures 排除 → 那條路徑沒有任何回彈（develop 原本的 `bounceContent` 對所有來源都生效，屬回歸）。〔處置：修〕
2. **`browseDrag.ts` 整包被拉進 entry**（架構）plan §3 寫手勢純函式在動態 chunk；但 entry 的 `useBrowseNav` import `ENTER_*`／`springTo`，連帶 `lockAxis`／`settle`／`startsInsideHorizontalScroller` 等只有手勢 chunk 用的函式也進了 entry，很可能是 entry gzip 超標的部分原因；且檔頭稱「純函式」而 `springTo` 有 DOM 副作用。〔處置：修——拆出 `browseMotion.ts`，重量 bundle〕
3. **焦點還原沒有進 `useBrowseNav`**（架構 P1、UI/UX P1、系統 P2）plan 寫 hook 管焦點還原，實作中手勢換篇後的焦點移動（`focusedAfterBrowse` effect）與 `autoFocusDir` 接線留在元件，未記錄。〔處置：記為偏離——該邏輯綁定頁面的 `errorRef`／`headingRef`／`notFoundRef` 與 `status`，搬進 hook 要把四個 ref 與狀態都傳入，收益低於風險；寫進 progress.md 與 PR「偏離規劃說明」。需人工裁決是否仍要搬〕

### P2

- 放開後進場 220ms 內沒有再量 `scrollWidth <= innerWidth`（需求、UI/UX）。〔修：e2e 於換篇後再量一次〕
- 快速甩動時最後一個 rAF 尚未執行就 touchend，`springBack` 拿到空字串而不補完動畫（需求、架構、系統）。〔修：彈回前先同步寫入最後一次 pendingOffset〕
- touchstart 沒清殘留 transform（系統）。〔修：順手清掉〕
- plan 階段 3 承諾的「state 不含 dx」測試未落地（需求、架構）。〔不補：state 由構造決定、`goBrowse` 沒有任何 dx 欄位可寫，且 location.state 在 MemoryRouter 測試中沒有現成讀取點；記為省略〕
- 頭尾輕推 24px 寫死在 hook（架構）。〔修：抽具名常數，隨 browseMotion 拆分一併處理〕
- `springTo` 以 transform 字串為參數（架構）。〔不改：呼叫端一處讀 `style.transform`、一處帶固定字串，目前沒有格式漂移跡象〕
- 鎖定當幀的 ~5px 起步跳動（UI/UX）。〔不改：納入手機實測，PR 內文註明〕
- `overflow-clip-margin` 在 iOS Safari／LINE WebView 的支援度、聚焦環是否被裁（UI/UX、系統）只能實機（plan Q7(2)，列進 PR 實測清單）。
- `isInteractiveStart` 把 `[contenteditable="false"]` 排除（系統）：合理收斂，補記於 progress.md。
- 預算只剩 gzip 0.2 kB／總量 0.8 kB 餘量（架構）：拆分後重量，若回到原預算內則還原預算調整。

## 需人工裁決

1. 總 raw 預算 1950→1951：W6-20 只授權 entry raw +2／gzip +0.5，總量未明寫；拆分 `browseMotion.ts` 後若不再需要就還原，否則 PR 內明述請主 session 追認。
2. 焦點還原是否仍要搬進 hook（上列 P1-3）。
3. 放開換篇後舊→新的視覺跳接（舊內容停在拖曳位移處、新內容淡入）、passive touchmove 下斜向拖曳是否漏出垂直捲動：只能手機實測（plan Q6、Q7）。

## 處置（人審後填寫）

- 2026-11-08 實作者處置：P0 無；P1-1、P1-2 與列「修」的 P2 於後續 commit 修正（見 progress.md）；其餘記為偏離或手機實測項，寫進 PR 內文。
- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過 □ 退回
