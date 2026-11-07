# listing-swipe-nav 實作審查報告

四視角（系統／架構／UIUX／需求）對 `origin/develop...HEAD` 的實作 diff 審查；只彙整不改判。

## 審查結論

| 視角 | P0 | P1 | P2 |
|---|---|---|---|
| 系統 | 0 | 3 | 3 |
| 架構 | 0 | 1 | 8 |
| UIUX | 0 | 2 | 4 |
| 需求 | 0 | 2 | 4 |

**P0：無。**

## 處置

已修（本 PR）：
- 〔系統 P1〕座標在離開首頁後才到、或返回時 `getCurrentPosition` 回新座標，會讓返回順序與離開前不同 → `applyGeo` 已有座標或首頁已卸載時不再採用新座標；補兩條測試（`HomePage.geoOrder.test.tsx`）。
- 〔UIUX P2／系統 P2〕讀取失敗被定位等待蓋住最多 1.5 秒、焦點不補 → 失敗時不等待。
- 〔架構／UIUX／系統 P1-P2〕座標表預載在模組頂層讓所有入口付 14 kB → 只在從 `/` 進站時模組載入預載，其餘入口掛載首頁才載。
- 〔多視角〕progress 階段表未更新、未記錄的偏離 → 已補記（見 progress.md）。

記為偏離（progress.md「階段 9 審查處置」）、不修：
- `ListingLink` 攔截點擊後自行 `navigate`（plan 寫 `<Link onClick + state>`；state 須在點擊當下才有版本）。
- 詳情頁頂列未抽 `DetailTopBar`（內聯 `topBar`；notFound 另一列右對齊）。
- 手勢載入檔為 `BrowseGestures` 元件而非 `useBrowseNav` hook。
- `state.dir` 未於讀取後清除，改由 `navigationType === 'REPLACE'` 與 `neighbors` 把關。
- LINE 內建瀏覽器 32px 邊緣保護尚未實作（Q6 待手機實測；`edgeGuardPx` 已可參數化）。
- `scrollToListing` 非減少動態時用 smooth（待手機實機確認是否改 auto）。

列入後續（P2，不阻擋）：`prefersReducedMotion` 在 `PhotoCarousel`／`HomePage.scrollToListing` 仍各有一份可併入 `motionPreference`；`HomePage` 的定位等待與 FLIP 可抽成 `useHomeGeoOrder` hook；`BrowseGestures` chunk 載入失敗時缺 error boundary；slide-in 動畫在手機可能短暫橫向捲動（待實機）；照片區外手勢起點在橫向捲動祖先內不略過；規格書補「動畫期間擋點擊／錨點維持」一句。

需人工裁決：bundle entry 實測 raw 1011.6／gzip 315.2 高於 W5-30 原寫的 1010／315，但在已核准的疊加預算（entry 1015／316、總 1950）內。
