# 刊登照片上傳管線（P1a）規劃書

<!-- plans-keep: 施工鷹架，規劃待業主審；退場條件＝/tdd-implement 收尾（PR 前）刪除本目錄，值得保留的決策升級進規格書 §11／ui-ux-guidelines／friction-log；若波次順延 11/3 則隨順延 -->
<!-- 落檔理由：階段數 ≥3、跨 session（第 1 波執行 session 只規劃，實作由業主親打 /tdd-implement）。
     上位規劃：docs/plans/platform-growth-and-trust/plan.md §3.1／§3.2A／§3.2C／§3.4（未改動前以其為準）；
     第 1 波排程：docs/plans/launch-wave-1/plan.md §3.2。PR 前依 CLAUDE.md 收尾刪除。 -->

## 0. 一句話

刊登者（服務提供者）選照片後，每張先進 1:1 裁切確認取景框，再自動壓縮成 JPEG 逐張上傳；移除、換掉或刪除刊登的照片會從 Storage 清掉——
因為原圖直傳含 EXIF（可能含 GPS）、常因過大或格式失敗、錯誤訊息顯示不出來，且條款十之一承諾撤除後三十日內下架卻從不清 Storage。

**拆兩個 PR（業主裁決 2026-10-27 14:35，Q-E）**：
- **PR 1＝後端清理（合規項，先上）**：`DELETE /listings/photos`＋`DELETE /listings/:id`（刪刊登改走 Edge，後端刪列並刪 Storage 物件，總綱 §3.2C 原案，Q-A）＋前端最小接線。不加 migration。
- **PR 2＝前端裁切管線**：`apiRequest` 支援 FormData、壓縮／裁切／狀態機／Picker。趕不上 10/28 24:00 就整個留 11/3 第 2 波（PR 1 不依賴 PR 2）。

## 1. 使用者需求

- 對照規格書：`docs/uknow-software-specification.md` §11（照片：最多 3 張、單張 ≤5 MB、jpeg/png/webp）；條款十之一（`termsOfService.ts:48-49` 已授權技術性裁切／壓縮／格式轉換，**法務文件不可改**；撤除後三十日內完成下架）。
- 已裁決（不重問）：**Q3-1 維持恰好 3 張**；**Q3-3 每張強制進裁切**（總綱 §13，2026-10-19）；**Q-A 刪刊登走後端**、**Q-C 上傳走 apiClient**（P0 選 (a)）、**Q-E 拆兩 PR**（業主 2026-10-27）。
- 主 session 裁決（2026-10-27，待業主在 #404 審閱時確認）：Q-B 孤兒回溯清理留第 2 波；Q-D 裁切元件載入失敗退回「自動置中裁、無法調整」並可送出（降級模式，見 §4）；雙分頁過期表單風險接受不加樂觀鎖（見 §7）。

**驗收情境（可證偽）**

PR 1（後端清理）
1. Edit 移除一張並存檔成功 → 被移除的檔從 bucket 消失；存檔失敗 → 不呼叫刪除、檔仍在。
2. 刪除刊登（管理頁）→ 後端刪列後，該刊登照片檔被清；Storage 清理失敗**不**使刪除回報失敗（列已刪，回 success 並 `console.warn`）。
3. `DELETE /listings/photos` 帶他人 uid 前綴路徑 → 403 且一檔不刪；帶格式不合路徑／非陣列／空陣列／>10 筆／重複項 → 400；未登入 → 401；超過限流 → 429。
4. 仍被**任何**刊登（跨使用者全表）的 `photos` 引用的檔 → 不刪，列入回應 `skipped`；引用查詢出錯 → 5xx 且一檔不刪（fail-closed）。
5. `upload-photo` 實際回傳的 URL 必能被引用檢查命中（以同一 bucket 常數 `getPublicUrl` 重組比對）。
6. `DELETE /listings/:id` 對他人刊登 → 404（不洩漏存在與否），列不被刪。

PR 2（前端管線）
7. 選 4000×3000、6 MB JPEG → 出現 1:1 裁切框（預設置中）→「完成」→ 上傳檔最長邊 ≤1600px、**不含 EXIF（無 APP1）**；編碼器依品質階梯 0.82→0.72→0.62→0.5 重編，直到 ≤600 KB 或到達下限；最終檔 >5 MB 一律視為「無法處理」不上傳。
8. **取消裁切＝該張不進列表、不上傳**；無任何路徑能跳過裁切直接上傳（降級模式除外，見 §4）。
9. 三張中一張上傳失敗 → 另兩張保留；失敗張顯示「重試第 N 張／移除第 N 張」；失敗張被移除後，須補足到 3 張才能送出。
10. 後端回 `{error:'檔案不得超過 5MB'}` 時，畫面顯示該句而非通用 fallback。
11. HEIC／無法解碼的檔 → 該張顯示「這張照片的格式無法讀取，請換一張，或截圖後再試」，不上傳、其餘照常。瀏覽器缺 `createImageBitmap`／`toBlob` → 顯示「此瀏覽器無法處理照片，請改用其他瀏覽器開啟」（內建瀏覽器沿用既有提示），不是「換一張」。
12. Edit：**既有（已上傳）照片不重裁，只有「移除」鈕**；新選的照片才進裁切並有「調整第 N 張範圍」。
13. 一次選多張：依序逐張進裁切（佇列）；取消只影響當張，剩餘接續；已有 N 張再選超量時，超出部分提示並忽略。

- **不做**：封面指定／拖曳排序、草稿持久化、舊圖重裁、配額與 janitor、Create 離頁／關頁時暫存檔的保證清理（`beforeunload` 不能 await，不用 `sendBeacon`，接受孤兒，見 §7）、歷史照片 EXIF 回溯剝除與孤兒回溯清理（Q-B，第 2 波）、帳號刪除（`profiles` cascade）路徑的 Storage 清理（同 Q-B）、P1b（七容器 1:1、滑動切圖）、「大頭照」（Q3-4）、改張數規則、migration。
- **可砍項**（10/28 緊迫時先砍，不影響核心）：Edit 標籤補「第一張為封面照」一句、硬編 3 的常數化（Create 3 處、Edit 4–5 處，實作時現算）。
- **階段 0（HEIC 成因真機確認）＝業主真機待辦**，不擋規劃與實作；結果回填 PR 描述。

## 2. 系統設計

### 2.1 後端（PR 1）

新檔 `supabase/functions/api/listing-photos.ts`：純函式與注入式 handler（先例 `referral-invite.ts`），`index.ts` 只在 `POST /listings/upload-photo` 區段之後加路由註冊與必要的 wiring（撞檔矩陣總綱 §8.2；不碰他區）。bucket 名 `make-5c6718b9-listings-photos` 抽成**單一常數**由 `listing-photos.ts` 匯出，新程式碼不複製字串（`index.ts` 既有兩處註解寫「listings」與實際不符，順手更正註解，不改行為）。

**`DELETE /listings/photos`**
- `requireAuth`；body `{ paths: string[] }`。輸入驗證：非陣列／空／非字串／重複項／>10 筆 → 400。沿用 `rateLimit()`（`index.ts:309`）防當 Storage 探測或刪除放大器，超限 429。
- 路徑格式：`^<user.id>/\d+_[a-z0-9]+\.(jpg|png|webp)$`（用 `user.id` 組 regex，不信 client）。格式不合 → 400；格式合法但屬他人前綴 → 403；任一筆不合整個請求拒絕，不部分刪。
- **引用檢查（跨使用者全表）**：對每個 path 以 `client.storage.from(BUCKET).getPublicUrl(path)` 重組 URL，一次批次查 `listings` 的 `photos && ARRAY[...]`（overlaps），命中者列 `skipped` 不刪。RLS 允許使用者把 `photos` 寫成任意字串，故必須查全表；代價是惡意者可在自己刊登放他人照片 URL 使對方清理被 `skipped`——屬已知可規避缺口，不危及資料，接受（`photos` 無索引，一人一筆刊登，量級小）。
- **fail-closed**：引用查詢出錯 → 5xx，一檔不刪。
- 回 `{success:true, removed:n, skipped:[...]}`；`removed` 取 Storage `remove` **實際回傳的物件數**，不是輸入長度；不存在的檔視為已刪（冪等）。

**`DELETE /listings/:id`（刪刊登改走後端，Q-A）**
- `requireAuth`；以 `eq('id', id).eq('user_id', user.id)` 讀取該列（取得 `photos`），不存在或非本人 → 404。
- 刪列成功後，對該列 `photos` 解析出 path，走**同一個**內部清理函式（同樣引用檢查）刪 Storage；清理失敗只 `console.warn`，回應仍 `{success:true}`（列已刪，不可回報刪除失敗）。
- 既有 RLS 與 migration 不動（前端改走本端點後不再直刪，但舊 RLS 政策維持，不是本案範圍）。`public_listings` 12 欄契約不動。

**資料庫**：無 migration。

### 2.2 前端清理接線（PR 1，最小）

- 新增 `src/utils/listingPhotosApi.ts`：`deleteListingPhotos(paths)`（走 `apiClient`，JSON，無 FormData 問題）與 `deleteListing(id)`；由 Edit 存檔與管理頁使用，因此 knip 在 PR 1 內即有消費者。
- `EditServiceProvider`：存檔 `update` **成功後**，以「載入時的 photos − 存檔的 photos」算出被移除的 path，best-effort 呼叫 `deleteListingPhotos`（失敗只 `console.warn`，不影響成功 toast）。**先存後刪**。
- `ServiceProviderManagement.handleDeleteListing`：改呼叫 `deleteListing(listing.id)`（後端刪列＋清 Storage），**成功後**才 `refetchListing()`；因 photos 由後端自讀，不需在前端擷取。錯誤處理沿用既有 toast；移除原 `supabase.from('listings').delete()` 與其「0 列不是 error」的長註解（機制已換）。
- Create 取消／離頁的暫存檔清理：**不在 PR 1**（歸 PR 2 的 Picker 持有狀態處）。

### 2.3 前端管線（PR 2）

**資料流**：`<input accept="image/*" multiple>` → 能力偵測 → 解碼（`createImageBitmap(file,{imageOrientation:'from-image'})`，限邊解碼防 48MP OOM）→ 佇列逐張開裁切對話框（`react-easy-crop`）→ canvas 輸出 1:1（透明鋪白底）→ `toBlob('image/jpeg')` 最長邊 1600、品質階梯重編（驗收 7）→ `uploadListingPhoto`（`apiClient`）→ 回 `photoUrl` → 收進表單 `photos`。端點不變；最終寫 `listings.photos` 的既有路徑不動。

**P0 處置：`apiRequest` 支援 FormData（選 (a)）**：`apiClient.ts:63-67` 預設 `Content-Type: application/json` 會讓 multipart 缺 boundary。改法：`body instanceof FormData` 時不設 `Content-Type`（讓瀏覽器自帶 boundary），其餘不變；補 `apiClient.test.ts` 單元測試（FormData 無 Content-Type、JSON 仍有、`options.headers` 仍可覆寫、401 refresh 重試對 FormData 仍成立——body 需可重送，FormData 本身可重用）。這改到共用核心，列入 §3 改檔與 PR 2 的第一個紅綠循環。`uploadListingPhoto` 放 `listingPhotosApi.ts`，錯誤用 `extractApiErrorMessage`（吃字串與巢狀兩種信封）。

**編碼失敗不退回原檔**：重新編碼＝剝 EXIF 是需求（重審 P-02）；解碼成功但編碼失敗 → 該張標「無法處理」，其餘照常。5 MB 上限留後端與 bucket 當安全網。

**能力偵測**：缺 `createImageBitmap`／`HTMLCanvasElement.toBlob` → 顯示專屬文案與出路（見驗收 11），與「解碼失敗」文案區分，避免舊 WebView 使用者陷入「換一張也不會成功」的死路。

## 3. 架構影響

- 新檔：`src/utils/imageGeometry.ts`（純數學）、`src/utils/imagePipeline.ts`（注入 `ImageIO`：decode／crop／encode）、`src/utils/listingPhotosApi.ts`（PR 1 建立，PR 2 加 `uploadListingPhoto`）、`src/hooks/useListingPhotos.ts`（每張狀態機與佇列）、`src/components/listing/PhotoPicker.tsx`、`PhotoCropDialog.tsx`；後端 `supabase/functions/api/listing-photos.ts`。
- 改檔：PR 1＝`index.ts`（路由註冊）、`EditServiceProvider.tsx`、`ServiceProviderManagement.tsx`（與 S7a 同檔，先合併者定；目前為單檔）、規格書 §11、`ui-ux-guidelines.md`；PR 2＝`apiClient.ts`＋測試、`CreateServiceProvider.tsx`、`EditServiceProvider.tsx`、`constants.ts`（壓縮常數）、`package.json`（`react-easy-crop`）。
- **knip**：每階段內就接上使用處，不留懸空匯出（主 session 裁決）；階段 1、2 的純模組若在接線前提交，以 `@public` 標記並於階段 3 移除標記。
- **bundle 預算**：`scripts/check-bundle-budget.mjs` 只看首屏，抓不到 lazy chunk。PR 2 前以 `npm run build` 比對 Create／Edit chunk 前後 gzip 大小，**判準：增量 ≤ 40 kB gzip**，超過即改自刻簡化拖曳（縮放滑桿＋平移）；數字記入 PR 描述。
- 多步驟契約（`docs/multi-step-flow-recovery.md`）：裁切對話框是疊層，`listing_management.feature:74-81`「上傳中輸入不被倒回」必須仍綠；Create 更新用 functional `setFormData`（現況 `:207-214`）。
- 效能／安全：解碼限邊；canvas 逐張處理、完成即 `revokeObjectURL`；DELETE 三道防線（uid 前綴、全表引用檢查、先存後刪）＋限流＋fail-closed。

## 4. UI/UX（PR 2）

對照 `docs/ui-ux-guidelines.md`（觸控目標 ≥44px、焦點環、live region、§9 焦點後備）。
- **裁切疊層用 Radix `Dialog`**（先例 `LegalDialog`）：焦點陷阱、Esc 關閉（＝取消當張）、關閉後焦點回觸發鈕；`useBodyScrollLock`、`useBackNavigation`（Android 返回鍵關疊層而非離頁）、`dvh`；底部動作列吃 `safe-area-inset-bottom` 且 z-index 高於 BottomNav；手勢區 `touch-action:none`，擋 iOS overscroll／LINE 下拉位移（列真機矩陣）。
- `react-easy-crop` 無鍵盤操作：**微調由本案自刻**——縮放滑桿＋上下左右四顆 44px 按鈕（附測試），不靠方向鍵監聽。
- **格列表** `ul/li`；每格按鈕命名「重試第 N 張／移除第 N 張／調整第 N 張範圍」。各狀態可用按鈕：準備中／上傳中＝無（顯示文字＋spinner，非只靠顏色，WCAG 1.4.1）；待裁切＝調整、移除；失敗＝重試、移除；無法處理＝移除；完成（本次新增）＝調整、移除；完成（既有舊圖，僅 Edit）＝移除。
- **焦點後備**（§9）：按鈕卸載時，焦點依序落到下一格、上一格、格列表容器（`tabIndex=-1`，`scroll-mt-20`）。
- 單一常駐 `aria-live=polite` 節點播報各張狀態（不另放隱藏播報節點）。「已自動縮小」為**格內常駐文字**，不用會消失的 toast。
- 佇列：選多張依序進裁切；中途取消／返回鍵只影響當張，其餘接續；超量提示後忽略超出部分（驗收 13）。
- **降級模式（Q-D，主 session 裁決）**：裁切 chunk 載入失敗 → 該張改用自動置中裁，格內標「無法調整」，可送出；e2e 需覆蓋此路徑。此為載入失敗的降級，非日常流程。
- 送出鈕：上傳中或不足 3 張 `aria-disabled` 並說明原因。Create 標籤維持「必須上傳 3 張，第一張為封面照」；Edit 補同句屬可砍項。
- 行動版優先（375px）；LINE 內建瀏覽器的檔案選取與手勢列真機矩陣。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環；PR 1、PR 2 各自獨立可合併）

### PR 1：後端清理

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1-1 | `listing-photos.ts` 純函式：路徑 regex／輸入驗證／diff／URL 重組／清理函式（注入 storage 與 db 替身） | `supabase/functions/api/listing-photos.unit.test.ts`（deno，風格同其他 `*.unit.test.ts`） | 驗收 3、4（含 fail-closed）、5 的純邏輯；`removed` 取實際回傳數 |
| 1-2 | 路由 `DELETE /listings/photos`、`DELETE /listings/:id` 接進 `index.ts`（`rateLimit`、`requireAuth`、404/403/400 碼） | `supabase/functions/api/listing-photos.test.ts`（整合，風格同 `listings.test.ts`） | 驗收 2、3、4、6；upload-photo 回傳 URL 必被命中（驗收 5） |
| 1-3 | `listingPhotosApi.ts`＋Edit 存檔 diff 刪＋管理頁改走 `deleteListing` | vitest jsdom（`ServiceProviderManagement.test.tsx`、Edit 測試） | 驗收 1、2：存檔失敗不呼叫刪除；清理失敗不顯示「刪除失敗」；先存後刪 |
| 1-4 | 文件：規格書 §11（寫行為不寫數字）、`ui-ux-guidelines.md` §7 補清理行為 | `check-spec-drift.py` | 全綠；`npm run check:full` |

### PR 2：前端管線

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 2-1 | `apiRequest` 支援 FormData | `apiClient.test.ts` | FormData 無 Content-Type；JSON 路徑不變；401 重試仍成立 |
| 2-2 | `imageGeometry.ts`＋`imagePipeline.ts`：解碼限邊、方向、裁切矩形、品質階梯編碼、白底、能力偵測、錯誤分類（OOM／格式／編碼失敗） | vitest node（`ImageIO` 替身） | 驗收 7、11 的純邏輯；編碼失敗回 `unprocessable` 而非原檔 |
| 2-3 | `useListingPhotos` 狀態機＋佇列＋`uploadListingPhoto`＋錯誤信封 | vitest jsdom | 驗收 9、10、13；一張失敗其餘保留、可重試 |
| 2-4 | `PhotoPicker`＋`PhotoCropDialog` 接進 Create／Edit；Radix Dialog、微調按鈕、焦點後備、降級模式、舊圖僅移除；Create／Edit 暫存檔移除時呼叫 `deleteListingPhotos` | vitest jsdom＋e2e（真 JPEG、2×2 色塊驗輸出主色與無 EXIF） | 驗收 7、8、12；`listing_management.feature:74-81` 仍綠 |
| 2-5 | **e2e／journey 同步**：page object 新增動作「選檔→裁切→完成」（`create_service_provider_page.py:15` 的 22-byte 假 JPEG 換真小 JPEG fixture；`listing_management.feature:98,105-113`、`f40_listing_steps.py`、`f60_time_scenarios_steps.py`；「photo uploads are captured until released」改為按「完成」後才進入捕捉）；375px 下對話框按鈕可見；mock 補上傳失敗與降級路徑 | e2e（CI 驗證）、`cd e2e/journey && pytest tools/` | 既有情境在新流程下仍綠 |
| 2-6 | 文件與閘門：規格書 §11／`ui-ux-guidelines.md` §7 補「照片裁切」；bundle 增量量測（判準 §3）；`npm run check:full` | check-spec-drift、build | 增量 ≤40 kB gzip；全綠 |

## 6. 開放問題

已全數裁決，無待決項：

- [x] Q-A 刪刊登清理：**走後端 `DELETE /listings/:id`**（業主 2026-10-27）。
- [x] Q-B 孤兒回溯清理與歷史 EXIF：**留第 2 波**（主 session）。
- [x] Q-C 上傳走 `apiClient`：**是，P0 選 (a)**（業主）。
- [x] Q-D 裁切載入失敗：**降級為自動置中裁、無法調整、可送出**（主 session；待業主在 #404 確認——此裁決把 Q3-3 的「強制進裁切」在元件載入失敗時降級，與總綱 §3.2A 舊稿措辭一致）。
- [x] Q-E 拆兩個 PR、後端先上：**是**（業主）。PR 2 趕不上 10/28 24:00 就留 11/3。
- [x] 雙分頁過期表單：**接受，記入 §7**（主 session）。
- 業主真機待辦（不擋）：iPhone Safari／LINE、Android Chrome／LINE 選 HEIC、48MP、EXIF 方向 6、透明 PNG、極大檔；回填「HEIC 被哪句擋下」與裁切手勢可用性。

## 7. 風險與回滾

- **回滾**：PR 1 revert 後，前端回到 `supabase.from('listings').delete()`（RLS 未動，相容）；PR 2 revert 後上傳端點與 5 MB 後端安全網未變，相容。無 migration。
- **誤刪**：三道防線（uid 前綴 regex、全表引用檢查且 fail-closed、先存後刪）＋限流。最壞情況是刪到「剛上傳、尚未存檔」的檔：client 只對「已確認移除且不在當前表單 photos 內」的 path 呼叫，且引用檢查不認未存檔者——使用者重傳即可。
- **雙分頁過期表單（接受）**：分頁 A 存檔移除 X 並刪檔，分頁 B 的舊表單仍持有 X 再存檔，把 X 寫回 `listings.photos`，公開頁破圖。引用檢查只管刪除當下。發生條件極窄（同一使用者、同一刊登、兩個分頁、其一刪檔後另一個存檔），不加 `updated_at` 樂觀鎖；使用者重新編輯重傳即可復原。
- **孤兒累積**（Create 離頁／關頁、刪除後清理失敗、帳號刪除 cascade、歷史檔）：不阻擋功能，`DELETE /listings/photos` 可由維運手動補清；janitor 與回溯清理第 2 波（Q-B）。
- **管線在某機型失敗**：能力偵測＋專屬文案＋降級模式；上傳端點未變。
- **bundle**：`react-easy-crop` 增量超判準即改自刻拖曳。
- **時程**：全案 10/28 24:00 前沒合進 develop 的部分順延 11/3；PR 1 是底線。
