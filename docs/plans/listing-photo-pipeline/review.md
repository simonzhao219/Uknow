# 刊登照片上傳管線（P1a）規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent 的發現。只彙整、去重、排序，不改判。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 3 | 4 | 認證與前綴授權、DB／RLS（無 migration）、既有上傳端點契約 |
| 架構 | 1 | 4 | 2 | 模組邊界、lazy 路由、無 migration、spec-drift 方向、階段 4 與 1–3 切分 |
| UI/UX | 0 | 6 | 3 | 觸控目標 44px、移除鈕樣式、BottomNav |
| 需求 | 0 | 3 | 2 | 規格書 §11 溯源、Q3-1 落實、無腦補業務規則 |

合計 **P0=1、P1=16、P2=11**。

## 發現清單（依嚴重度排序）

### P0
1. [P0]〔架構｜§2 錯誤信封／Q-C／階段 2〕`apiRequest` 預設寫死 `Content-Type: application/json`（`apiClient.ts:63-67`），傳 FormData 會缺 multipart boundary，後端 `formData()` 解析失敗；設成 undefined 會被轉成字串 "undefined" → 規劃要明定：(a) `apiRequest` 遇 `body instanceof FormData` 不設 Content-Type 並補單元測試（要列入 §3 改檔），或 (b) 另寫 multipart 路徑並自行重做 401 refresh-retry；Q-C 的「預設是」建立在錯誤現況，需改寫。

### P1
2. [P1]〔系統＋架構｜§2 引用檢查〕URL 由誰組未定義；實際 bucket 為 `make-5c6718b9-listings-photos`（`index.ts` 註解寫 listings 與實際不符），比對差一點就靜默變成「永遠沒被引用」而誤刪 → server 端用同一 bucket 常數 `getPublicUrl(path)` 重組、批次 `overlaps` 一次查，階段 4 加「`upload-photo` 回傳的 URL 必能命中」測試；bucket 字串抽常數。
3. [P1]〔系統｜§2 引用檢查〕查詢出錯時行為未定義，best-effort＋service_role 可能 fail-open 誤刪 → 查詢出錯回 5xx 且一檔不刪（fail-closed），階段 4 加測試。
4. [P1]〔系統｜§2 呼叫順序／§7〕雙分頁過期表單：A 移除 X 並存檔、X 被刪，B 仍持 X 的 URL 再存檔寫回，刊登指向不存在的檔 → 寫進風險表並說明接受理由，或 Edit 存檔加 `updated_at` 樂觀鎖〔需人工裁決〕。
5. [P1]〔架構｜§2 刪刊登最小版／階段 5〕`handleDeleteListing` 會先 `refetchListing()`，須在 refetch 前擷取 `listing.photos`，且清理失敗不得進 catch 觸發「刪除失敗」 → 階段 5 驗證補「清理失敗不顯示刪除失敗」，沿用 `ServiceProviderManagement.test.tsx`。
6. [P1]〔架構｜§3／§2〕現況描述不準：Create 硬編 3 只剩 3 處（99、498、592）且已 import `MAX_PHOTO_COUNT`／`MAX_PHOTO_SIZE`；Edit 沒有 `MAX_PHOTO_SIZE` 副本可刪 → 更正現況。
7. [P1]〔架構｜§3 新依賴／§7〕`check-bundle-budget.mjs` 只看首屏，lazy chunk 超預算抓不到，§7 觸發條件不客觀；且階段 1、2 的新匯出在接線前會被 knip 擋在 pre-commit → 寫明量測對象與判準；調序或合併階段使每階段有消費者，或暫時 ignore 並於階段 3 移除。
8. [P1]〔UI/UX｜§4〕裁切疊層容器與焦點管理未指定（Radix Dialog？焦點陷阱、Esc、關閉後焦點回觸發鈕）；`react-easy-crop` 不提供鍵盤操作，「方向鍵微調」無人負責 → 明定沿用 Radix Dialog；方向鍵自刻並附測試，或改縮放滑桿＋上下左右按鈕。
9. [P1]〔UI/UX｜§4 格列表〕移除／重試後按鈕卸載，焦點後備落點未規劃（§9 契約） → 依序落到下一格、上一格、列表容器（`tabIndex=-1`）。
10. [P1]〔UI/UX｜§1／§4〕一次選多張的佇列流程未定義（連開幾次對話框、中途取消／返回鍵、已有 2 張再選 3 張超量） → 補佇列狀態機；取消只影響當張。
11. [P1]〔UI/UX＋需求｜§4／§1〕「調整第 N 張範圍」與「不做舊圖重裁」矛盾；Edit「換掉」照片的 UI 與是否只有新選的進裁切未定；失敗張被移除後只剩 2 張如何補足未定 → 寫明各狀態格的按鈕；舊圖只有「移除」；須補足 3 張才能送出，納入驗收情境。
12. [P1]〔UI/UX｜§3／階段 3〕強制裁切改變所有既有 e2e／journey 上傳步驟（`listing_management.feature:98,105-113`、`f40_listing_steps.py`、`f60_time_scenarios_steps.py`，「photo uploads are captured until released」語意），規劃只提換 fixture → 階段 3 列出 page object 新動作（選檔→裁切→完成）與 375px 按鈕可見。
13. [P1]〔UI/UX｜§2／§7〕`createImageBitmap` 選項／`toBlob`／`OffscreenCanvas` 在舊 WebView 可能整個不存在，統一導向「換一張」會成死路 → 做能力偵測，缺 API 時給不同文案與出路（改用其他瀏覽器開啟）。
14. [P1]〔需求｜§4／§6 Q-D〕裁切載入失敗改「自動置中裁、不擋上傳」是對已裁決 Q3-3 的實質例外，規劃自稱不衝突卻已把建議寫成設計 → 明文標註為 Q3-3 例外，Q-D 裁決前不得實作；或預設採保守版（提示重試、不得送出）。
15. [P1]〔需求｜§1 驗收〕缺「取消裁切＝該張不上傳」情境；「通常 < 600 KB」不可證偽 → 補情境；改明確門檻（或「超過 600 KB 時有降品質重編」）。

### P2
16. [P2]〔系統｜§2 授權〕引用檢查須查全表（RLS 允許寫任意 photos 字串）；惡意者可讓他人清理被 `skipped`，屬可規避缺口 → 明寫查全表並接受理由。
17. [P2]〔系統｜§2 端點契約〕缺輸入驗證定義（非陣列／空／重複／超 10 筆／非字串）；不合規格回碼既有慣例為 400 而規劃選 403；未用既有 `rateLimit()` → 補契約與限流。
18. [P2]〔系統｜§2 冪等〕`removed:n` 應取 Storage 實際回傳長度並測試固定。
19. [P2]〔系統｜§2〕孤兒來源多於所列：`profiles` 刪除 cascade 刪 `listings`、`/auth/cancel-signup` 皆不清 Storage → 列入 Q-B 或 janitor 範圍。
20. [P2]〔架構｜§5 階段 4〕路徑 regex／批次上限／403 等純邏輯可抽純函式放 `*.unit.test.ts`，只有引用檢查需 DB。
21. [P2]〔UI/UX｜§4〕觸控手勢（`touch-action:none`、iOS overscroll、LINE 下拉）、底部按鈕列 `safe-area-inset-bottom` 與 z-index 高於 BottomNav → 補並列真機矩陣。
22. [P2]〔UI/UX｜§4〕「準備中」與「上傳中」需文字＋spinner 可見差異（WCAG 1.4.1）；aria-live 維持單一常駐節點。
23. [P2]〔UI/UX｜§4〕「已自動縮小」應為格內常駐文字，非會消失的 toast。
24. [P2]〔需求｜§6 Q-B〕缺歷史照片 EXIF 回溯剝除的處置 → 加進 Q-B 或列入不做。
25. [P2]〔需求｜§2／§5〕順手項（七處常數化、Edit 標籤同步、Edit 大小檢查）非已裁決需求 → 標為可砍項，10/28 緊迫時先砍。
26. [P2]〔架構｜§2 撞檔〕reviewer 無法驗證 `ServiceProviderManagement` 是否被 S7a 目錄化；目前為單檔 → 若 S7a 有此計畫請指出合併順序〔需人工裁決，可忽略〕。

## 需人工裁決

1. Q-D：裁切元件載入失敗的退路是否視為違反 Q3-3（#14）。
2. #4 雙分頁過期表單：接受風險或加樂觀鎖。
3. Create 離頁／關頁時暫存檔無法保證清理（`beforeunload` 不能 await）：接受孤兒，或用 `sendBeacon`／`keepalive`（UI/UX reviewer 提出）。
4. 時程：10/28 24:00 前階段 1–3＋新依賴＋e2e fixture 是否趕得上，兩個 PR（Q-E）哪個是底線（需求 reviewer 提出）。
5. Q-C 依 P0 #1 重寫後是否維持「走 apiClient」。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。 -->

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
