# 刊登照片上傳管線（P1a）規劃書

<!-- plans-keep: 施工鷹架，規劃待業主審（Q-D／Q-F／Q-G 已裁決）；退場條件＝/tdd-implement 收尾（PR 前）刪除本目錄，值得保留的決策升級進規格書 §11／ui-ux-guidelines／friction-log；若波次順延 11/3 則隨順延 -->
<!-- 落檔理由：階段數 ≥3、跨 session（第 1 波執行 session 只規劃，實作由業主親打 /tdd-implement）。
     上位規劃：docs/plans/platform-growth-and-trust/plan.md §3.1／§3.2A／§3.2C／§3.4（未改動前以其為準）；
     第 1 波排程：docs/plans/launch-wave-1/plan.md §3.2。PR 前依 CLAUDE.md 收尾刪除。 -->

## 0. 一句話

刊登者（服務提供者）選照片後，每張先進 1:1 裁切確認取景框，再自動壓縮成 JPEG 逐張上傳；移除、換掉或刪除刊登的照片會從 Storage 清掉——
因為原圖直傳含 EXIF（可能含 GPS）、常因過大或格式失敗、錯誤訊息顯示不出來，且條款十之一承諾撤除後三十日內下架卻從不清 Storage。

**拆兩個 PR（業主裁決 2026-10-27 14:35，Q-E）**：
- **PR 1＝後端清理（部分履行條款十之一，先上）**：`DELETE /listings/photos`＋`DELETE /listings/:id`（刪刊登改走 Edge，後端刪列並刪 Storage 物件，總綱 §3.2C 原案，Q-A）＋前端最小接線。不加 migration。
- **PR 2＝前端裁切管線**：`apiRequest` 支援 FormData、壓縮／裁切／狀態機／Picker。趕不上 10/28 24:00 就整個留 11/3 第 2 波。**依賴方向單向：PR 2 依賴 PR 1 合併**（2-4b 呼叫 PR 1 建立的 `deleteListingPhotos`，且 Edit 存檔的 diff 刪邏輯由 PR 2 的 hook 承接、保留 PR 1 的測試）；PR 1 不依賴 PR 2。
- **合規敘述（誠實版）**：條款十之一承諾「撤除後三十日內完成下架」。PR 1 只覆蓋「Edit 移除照片」與「刪除刊登」兩條成功路徑；清理失敗（僅 warn、無重試）、帳號刪除 cascade、`/auth/cancel-signup`、歷史孤兒都未覆蓋，屬**部分履行**。**Q-G 裁決（業主 2026-10-27）**：殘留缺口記入規格書已知落差（§14，PR 1 的 1-5 文件階段處理），第 2 波須在 30 日窗口內補齊三條路徑（刪刊登／移除照片的清理失敗補償、帳號刪除與 `/auth/cancel-signup` 的 Storage 清理、歷史孤兒回溯），**列為第 2 波必做**。

## 1. 使用者需求

- 對照規格書：`docs/uknow-software-specification.md` §11（照片：最多 3 張、單張 ≤5 MB、jpeg/png/webp）；條款十之一（`termsOfService.ts:48-49` 已授權技術性裁切／壓縮／格式轉換，**法務文件不可改**；撤除後三十日內完成下架）。
- 已裁決（不重問）：**Q3-1 維持恰好 3 張**；**Q3-3 每張強制進裁切**（總綱 §13，2026-10-19）；**Q-A 刪刊登走後端**、**Q-C 上傳走 apiClient**（P0 選 (a)）、**Q-E 拆兩 PR**（業主 2026-10-27）。
- 主 session 裁決（2026-10-27，待業主在 #404 審閱時確認）：Q-B 孤兒回溯清理留第 2 波；雙分頁過期表單風險接受不加樂觀鎖（見 §7）。
- **Q-D 裁決（業主 2026-10-27）**：裁切元件載入失敗＝**保守版**——顯示「重新載入裁切工具」、該張不可送出，**不批准降級**；Q3-3「強制進裁切」不留例外。

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
8. **取消裁切＝該張不進列表、不上傳**；無任何路徑能跳過裁切直接上傳（含元件載入失敗時，見驗收 14）。
9. 三張中一張上傳失敗 → 另兩張保留；失敗張顯示「重試第 N 張／移除第 N 張」；失敗張被移除後，須補足到 3 張才能送出。
10. 後端回 `{error:'檔案不得超過 5MB'}` 時，畫面顯示該句而非通用 fallback。
11. HEIC／無法解碼的檔 → 該張顯示「這張照片的格式無法讀取，請換一張，或截圖後再試」，不上傳、其餘照常。瀏覽器缺 `createImageBitmap`／`toBlob` → 顯示「此瀏覽器無法處理照片，請改用其他瀏覽器開啟」（內建瀏覽器沿用既有提示），不是「換一張」。
12. Edit：**既有（已上傳）照片不重裁，只有「移除」鈕**；新選的照片才進裁切並有「調整第 N 張範圍」。
13. 一次選多張：依序逐張進裁切（佇列）；取消只影響當張，剩餘接續；已有 N 張再選超量時，超出部分提示並忽略。
14. **裁切 chunk 載入失敗**（e2e 以 mock 動態 import reject 觸發）：該張顯示「重新載入裁切工具」、**不可送出**；重新載入成功後可繼續；任何情況不得跳過裁切上傳。
15. Create／Edit 中移除一張**本次新上傳、尚未存檔**的照片 → 呼叫 `DELETE /listings/photos`（best-effort）；失敗不影響表單。
16. 原檔大小（Q-F 裁決）：原檔 ≤20 MB 可選，超過 20 MB 顯示「檔案過大，請換一張」且不處理；5 MB 約束的是**壓縮後實際上傳的檔**，原檔不因 5 MB 被前端擋下。

- **不做**：封面指定／拖曳排序、草稿持久化、舊圖重裁、配額與 janitor、Create 離頁／關頁時暫存檔的保證清理（`beforeunload` 不能 await，不用 `sendBeacon`，接受孤兒，見 §7）、歷史照片 EXIF 回溯剝除與孤兒回溯清理（Q-B，第 2 波）、帳號刪除（`profiles` cascade）路徑的 Storage 清理（同 Q-B）、P1b（七容器 1:1、滑動切圖）、「大頭照」（Q3-4）、改張數規則、migration。
- **可砍項**（10/28 緊迫時先砍，不影響核心）：硬編 3 的常數化（Create 3 處、Edit 4–5 處，實作時現算）。
- **階段 0（HEIC 成因真機確認）＝業主真機待辦**，不擋規劃與實作；結果回填 PR 描述。

## 2. 系統設計

### 2.1 後端（PR 1）

新檔 `supabase/functions/api/listing-photos.ts`：純函式與注入式 handler（先例 `referral-invite.ts`），`index.ts` 只在 `POST /listings/upload-photo` 區段之後加路由註冊與必要的 wiring（撞檔矩陣總綱 §8.2；不碰他區）。bucket 名 `make-5c6718b9-listings-photos` 抽成**單一常數**由 `listing-photos.ts` 匯出，新程式碼不複製字串（`index.ts` 既有兩處註解寫「listings」與實際不符，順手更正註解，不改行為）。

**`DELETE /listings/photos`**
- `requireAuth`；body `{ paths: string[] }`。輸入驗證：非陣列／空／非字串／重複項／>10 筆 → 400。沿用 `rateLimit()`（`index.ts:309`）防當 Storage 探測或刪除放大器，超限 429。
- 路徑格式：`^<user.id>/\d+_[a-z0-9]+\.(jpg|png|webp)$`（用 `user.id` 組 regex，不信 client）。格式不合 → 400；格式合法但屬他人前綴 → 403；任一筆不合整個請求拒絕，不部分刪。
- **引用檢查（跨使用者全表）**：對每個 path 以 `client.storage.from(BUCKET).getPublicUrl(path)` 重組 URL，一次批次查 `listings` 的 `photos && ARRAY[...]`（overlaps），命中者列 `skipped` 不刪。RLS 允許使用者把 `photos` 寫成任意字串，故必須查全表；代價是惡意者可在自己刊登放他人照片 URL 使對方清理被 `skipped`——屬已知可規避缺口，不危及資料，接受（`photos` 無索引，一人一筆刊登，量級小）。
- **fail-closed**：引用查詢出錯 → 5xx，一檔不刪。
- 回 `{success:true, removed:n, skipped:[...]}`；`removed` 取 Storage `remove` **實際回傳的物件數**，不是輸入長度；不存在的檔視為已刪（冪等）。Storage `remove` 回 error：整批失敗 → 5xx 且不報 `removed`；部分成功 → 200 並依實際回傳數列出未刪項（1-1 加測試）。

**`DELETE /listings/:id`（刪刊登改走後端，Q-A）**
- `requireAuth`；以 `eq('id', id).eq('user_id', user.id)` 讀取該列（取得 `photos`），不存在或非本人 → 404。
- 刪列成功後，對該列 `photos` 解析出 path，走**同一個**內部清理函式（同樣引用檢查）刪 Storage；清理失敗只 `console.warn`，回應仍 `{success:true}`（列已刪，不可回報刪除失敗）。
- 一步取回被刪列：`delete().eq('id',id).eq('user_id',user.id).select('photos')`（省一次查詢並避免讀與刪之間不一致）；`:id` 先驗 UUID 格式，不合 → 404。
- **冪等／重送**：第二次因列已不存在回 404（維持不洩漏）；後端「列不存在或非本人」回帶標記的 JSON（`{error:'刊登不存在', code:'not_found'}`）；前端 `deleteListing` **只在帶此標記的 404** 視為「已刪除」並 `refetchListing()`；裸 404（Edge 尚未部署新路由、非 UUID id）與其他錯誤一律走失敗 toast——前端（Cloudflare）可能先於 Edge 上線，不可把「路由不存在」當成已刪。
- **內部清理函式本體**（`listing-photos.ts`，兩個端點共用）必須自行驗證，不依賴路由層：只接受以本 bucket publicUrl base 開頭的 URL 才解析為 path；解析後 path 必須符合「刊登者 `user.id` 前綴」regex，否則**忽略並 `console.warn`**——防止攻擊者在自己的 `photos` 塞入受害者 URL 再呼叫刪刊登，借 service_role 刪掉受害者尚未存檔的檔。1-1 單元測試加：photos 含他人前綴 URL、外部網址、path traversal 字樣。
- **路由註冊順序**：`DELETE /listings/photos` 必須**先於** `DELETE /listings/:id`（Hono 依註冊順序比對，否則 `photos` 被當成 id）；1-2 整合測試加「`/listings/photos` 不被 `:id` 吞掉」；`.claude/rules/supabase-functions.md` 區段表第 12 列補新路由。
- **限流**：沿用 `rateLimit()`（`index.ts:309`；注意其 fail-open），兩端點各自 key（`listing-photos-del:<uid>`、`listing-del:<uid>`）與額度（建議 20 次／60 秒）；fail-open 時放大風險由 10 筆上限與前綴約束托底。
- 既有 RLS 與 migration 不動（前端改走本端點後不再直刪，但舊 RLS 政策維持，不是本案範圍）。`public_listings` 12 欄契約不動。

**資料庫**：無 migration。

### 2.2 前端清理接線（PR 1，最小）

- 新增 `src/utils/listingPhotosApi.ts`：`deleteListingPhotos(paths)`、`deleteListing(id)`（走 `apiClient`，JSON，無 FormData 問題），以及前端純函式 `photoUrlToPath(url)`（非本 bucket 的 URL 一律回 null）與 `removedPaths(before, after)`；解析結果送出前以與後端相同的 regex 過濾，只送合法 path（歷史／手寫怪項不得使整批被 400 拒絕）。單測以 `upload-photo` 實際回傳的 URL 樣本釘住解析；bucket 名在前端單一常數。由 Edit 存檔與管理頁使用，因此 knip 在 PR 1 內即有消費者。
- `EditServiceProvider`：存檔 `update` **成功後**，以「載入時的 photos − 存檔的 photos」算出被移除的 path，best-effort 呼叫 `deleteListingPhotos`（失敗只 `console.warn`，不影響成功 toast）。**先存後刪**。
- `ServiceProviderManagement.handleDeleteListing`：改呼叫 `deleteListing(listing.id)`（後端刪列＋清 Storage），**成功後**才 `refetchListing()`；刪除鈕 pending／disabled 並防連點（延遲比直連 REST 長）；因 photos 由後端自讀，不需在前端擷取。錯誤處理沿用既有 toast；移除原 `supabase.from('listings').delete()` 與其「0 列不是 error」的長註解（機制已換）。
- Create 取消／離頁的暫存檔清理：**不在 PR 1**（歸 PR 2 的 Picker 持有狀態處）。

### 2.3 前端管線（PR 2）

**資料流**：`<input accept="image/*" multiple>` → 能力偵測 → 解碼（`createImageBitmap(file,{imageOrientation:'from-image'})`，限邊解碼防 48MP OOM）→ 佇列逐張開裁切對話框（`react-easy-crop`）→ canvas 輸出 1:1（透明鋪白底）→ `toBlob('image/jpeg')` 最長邊 1600、品質階梯重編（驗收 7）→ `uploadListingPhoto`（`apiClient`）→ 回 `photoUrl` → 收進表單 `photos`。端點不變；最終寫 `listings.photos` 的既有路徑不動。

**P0 處置：`apiRequest` 支援 FormData（選 (a)）**：`apiClient.ts:63-67` 預設 `Content-Type: application/json` 會讓 multipart 缺 boundary。改法：`body instanceof FormData` 時不設 `Content-Type`（讓瀏覽器自帶 boundary），其餘不變；補 `apiClient.test.ts` 單元測試（FormData 無 Content-Type、JSON 仍有、`options.headers` 仍可覆寫、401 refresh 重試對 FormData 仍成立——body 需可重送，FormData 本身可重用）。這改到共用核心，列入 §3 改檔與 PR 2 的第一個紅綠循環。`uploadListingPhoto` 放 `listingPhotosApi.ts`，錯誤用 `extractApiErrorMessage`（吃字串與巢狀兩種信封）。

**編碼失敗不退回原檔**：重新編碼＝剝 EXIF 是需求（重審 P-02）；解碼成功但編碼失敗 → 該張標「無法處理」，其餘照常。5 MB 上限留後端與 bucket 當安全網。

**裁切工具的載入邊界**：`PhotoCropDialog` 與 `react-easy-crop` 以 `React.lazy` 動態 import，包在 `Suspense` 與錯誤邊界內（位於 Picker）；測試注入點＝mock 該動態 import reject（驗收 14）。不是靜態 import，否則重新載入路徑不可能發生，增量也全算進 Create／Edit chunk。

**來源保留**：每格只保留原始 `File` 引用，**不保留解碼後 bitmap**（三張 48MP 常駐會 OOM）；「調整」時重新解碼，重新解碼失敗 → 該格回「無法處理」；格完成上傳後立即 `revokeObjectURL` 預覽並釋放 bitmap；`File` 引用保留到送出或移除為止。

**能力偵測**：缺 `createImageBitmap`／`HTMLCanvasElement.toBlob` → 顯示專屬文案與出路（見驗收 11），與「解碼失敗」文案區分，避免舊 WebView 使用者陷入「換一張也不會成功」的死路。

## 3. 架構影響

- 新檔：`src/utils/imageGeometry.ts`（純數學）、`src/utils/imagePipeline.ts`（注入 `ImageIO`：decode／crop／encode）、`src/utils/listingPhotosApi.ts`（PR 1 建立，PR 2 加 `uploadListingPhoto`）、`src/hooks/useListingPhotos.ts`（每張狀態機與佇列）、`src/components/listing/PhotoPicker.tsx`、`PhotoCropDialog.tsx`；後端 `supabase/functions/api/listing-photos.ts`。
- **撞檔**：PR 2 改 `apiClient.ts` 共用核心，而 `launch-wave-1/plan.md` §3.2 把它列為 T1（登入狀態信任）的觸及檔；T1 在 R2 前端合併後才開、且 10/28 24:00 前沒綠就不上，**合併順序：先合者定，後者由主 session rebase**；PR 2 的改動僅限 FormData 分支，衝突面小。
- 改檔：PR 1＝`index.ts`（路由註冊）、`.claude/rules/supabase-functions.md`（區段表）、e2e（`listing_management.feature`、journey `40_listing.feature`、step 檔，1-4）、`EditServiceProvider.tsx`、`ServiceProviderManagement.tsx`（與 S7a 同檔，先合併者定；目前為單檔）、規格書 §11、`ui-ux-guidelines.md`；PR 2＝e2e／journey（page object、fixture、step 檔，2-5）、`check-spec-drift.py`＋規格書（2-6）、`apiClient.ts`＋測試、`CreateServiceProvider.tsx`、`EditServiceProvider.tsx`、`constants.ts`（壓縮常數）、`package.json`（`react-easy-crop`）。
- **knip**：每階段內就接上使用處，不留懸空匯出（主 session 裁決）；PR 2 的 2-2、2-3 匯出在 2-4a 才被消費，**先標 `@public`，2-4a 移除**；2-4a 驗證標準含「無殘留 `@public`」。
- **bundle 預算**：`scripts/check-bundle-budget.mjs` 只看首屏，抓不到 lazy chunk。PR 2 前以 `npm run build` 比對 Create／Edit chunk 前後 gzip 大小，**判準：增量 ≤ 40 kB gzip**，超過即改自刻簡化拖曳（縮放滑桿＋平移）；數字記入 PR 描述。
- 多步驟契約（`docs/multi-step-flow-recovery.md`）：裁切對話框是疊層，`listing_management.feature:74-81`「上傳中輸入不被倒回」必須仍綠；Create 更新用 functional `setFormData`（現況 `:207-214`）。
- 效能／安全：解碼限邊；canvas 逐張處理、完成即 `revokeObjectURL`；DELETE 三道防線（uid 前綴、全表引用檢查、先存後刪）＋限流＋fail-closed。

## 4. UI/UX（PR 2）

對照 `docs/ui-ux-guidelines.md`（觸控目標 ≥44px、焦點環、live region、§9 焦點後備）。
- **裁切疊層用 Radix `Dialog`**（先例 `LegalDialog`）：焦點陷阱、Esc 關閉（＝取消當張）、關閉後焦點回觸發鈕；`useBodyScrollLock`、`useBackNavigation`（Android 返回鍵關疊層而非離頁）、`dvh`；底部動作列吃 `safe-area-inset-bottom` 且 z-index 高於 BottomNav；手勢區 `touch-action:none`，擋 iOS overscroll／LINE 下拉位移（列真機矩陣）。
- `react-easy-crop` 無鍵盤操作：**微調由本案自刻**——縮放滑桿＋上下左右四顆 44px 按鈕（附測試），不靠方向鍵監聽。
- **格列表** `ul/li`；每格按鈕命名「重試第 N 張／移除第 N 張／調整第 N 張範圍」。各狀態可用按鈕：準備中／上傳中＝無（顯示文字＋spinner，非只靠顏色，WCAG 1.4.1）；待裁切＝調整、移除；失敗＝重試、移除；無法處理＝移除；完成（本次新增）＝調整、移除；載入失敗（裁切工具未載入）＝重新載入、移除；完成（既有舊圖，僅 Edit）＝移除。
- **焦點後備**（§9）：按鈕卸載時，焦點依序落到下一格、上一格、格列表容器（`tabIndex=-1`，`scroll-mt-20`）。
- 單一常駐 `aria-live=polite` 節點播報各張狀態（不另放隱藏播報節點）。「已自動縮小」為**格內常駐文字**，不用會消失的 toast。
- **忙碌／防重入**：「完成」按下後對話框立即關閉、該格進「準備中」（編碼中不可再次點擊同一張）；解碼與 lazy chunk 載入期間，佇列層級顯示載入指示；佇列中連續開關 Dialog 時，焦點不得閃回觸發鈕、返回鍵不得多退一層離頁（測試列入 2-4a 並入真機矩陣）。
- 移除第一張且仍有其他照片時，live region 播報「封面已改為原第 N 張」；因此 Edit 補「第一張為封面照」說明不再列可砍項。
- **「重新載入裁切工具」鈕三態**：按下後 pending（`aria-disabled`＋文字，防連點）；再失敗時格內常駐文字並由常駐 live region 播報；`React.lazy` 會快取 rejected promise，重試必須重建 lazy 元件／重新 import（2-4a 測試：連續兩次失敗再成功，驗收 14）。
- **入口按鈕邊界**：0 張顯示空態提示；滿 3 張（含處理中與載入失敗格）入口 `aria-disabled` 並以文字說明；佇列處理中不可再選。
- 佇列：選多張依序進裁切；中途取消／返回鍵只影響當張，其餘接續；超量提示後忽略超出部分（驗收 13）。
- **載入失敗（Q-D 裁決＝保守）**：裁切工具 chunk 載入失敗時，該張顯示「重新載入裁切工具」與「移除」，不可送出（送出鈕 `aria-disabled` 並以 `aria-describedby` 說明）；重新載入成功即回到待裁切。不提供自動置中裁的降級路徑。LINE 內建瀏覽器網路不穩時，使用者靠重新載入或移除恢復。
- 送出鈕：上傳中或不足 3 張 `aria-disabled`，原因文字以 `aria-describedby` 連結。Create 標籤維持「必須上傳 3 張，第一張為封面照」；Edit 補同句（見上，已升為必做）。
- 行動版優先（375px）；LINE 內建瀏覽器的檔案選取與手勢列真機矩陣。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環；PR 1、PR 2 各自獨立可合併）

### PR 1：後端清理

兩個 PR 的依賴為單向（PR 2 依賴 PR 1），PR 1 可獨立合併。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1-1 | `listing-photos.ts` 純函式：路徑 regex／輸入驗證／diff／URL 重組／清理函式（注入 storage 與 db 替身） | `supabase/functions/api/listing-photos.unit.test.ts`（deno，風格同其他 `*.unit.test.ts`） | 驗收 3、4（含 fail-closed）、5 的純邏輯；`removed` 取實際回傳數 |
| 1-2 | 路由 `DELETE /listings/photos`、`DELETE /listings/:id` 接進 `index.ts`（`rateLimit`、`requireAuth`、404/403/400 碼） | `supabase/functions/api/listing-photos.test.ts`（整合，風格同 `listings.test.ts`） | 驗收 2、3、4、6；upload-photo 回傳 URL 必被命中（驗收 5） |
| 1-3 | `listingPhotosApi.ts`（含「裸 404 顯示失敗、帶 `not_found` 標記才視為已刪」測試）＋Edit 存檔 diff 刪＋管理頁改走 `deleteListing` | vitest jsdom（`ServiceProviderManagement.test.tsx`、Edit 測試） | 驗收 1、2：存檔失敗不呼叫刪除；清理失敗不顯示「刪除失敗」；先存後刪 |
| 1-4 | **e2e 同步**：`listing_management.feature:80-83`（「刊登已成功刪除」toast）與 journey `40_listing.feature:27` 的刪除路徑改 mock／打 `DELETE /listings/:id`；驗成功 toast、`not_found` 標記視為已刪、後端失敗與裸 404 的錯誤 toast | e2e（CI 驗證） | 既有刪除情境仍綠 |
| 1-5 | 文件：規格書 §11（**保留「單張 ≤ 5 MB」「最多 3 張」字樣使 `check-spec-drift.py:124-135` 的 regex 仍匹配**，僅加註「（壓縮後實際上傳的檔）」；原檔 20 MB 的列與常數留 PR 2 的 2-6，見 Q-F）、**§14 已知落差新增一列：條款十之一殘留缺口，須涵蓋三條路徑（清理失敗補償、帳號刪除與 `/auth/cancel-signup`、歷史孤兒），註明由第 2 波在 30 日窗口內補齊、補齊後刪列（Q-G；依 `.claude/rules/document-writing.md` 只寫最小事實）**、`ui-ux-guidelines.md` §7 補清理行為；另更新 `.claude/rules/supabase-functions.md` 區段表 | `check-spec-drift.py` | 全綠；§14 新列涵蓋三條路徑；`npm run check:full` |

### PR 2：前端管線（依賴 PR 1 已合併）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 2-1 | `apiRequest` 支援 FormData | `apiClient.test.ts` | FormData 無 Content-Type；JSON 路徑不變；401 重試仍成立 |
| 2-2 | `imageGeometry.ts`＋`imagePipeline.ts`：解碼限邊、方向、裁切矩形、品質階梯編碼、白底、能力偵測、原檔 >20 MB 拒絕、錯誤分類（OOM／格式／編碼失敗） | vitest node（`ImageIO` 替身） | 驗收 7、11、16 的純邏輯；編碼失敗回 `unprocessable` 而非原檔 |
| 2-3 | `useListingPhotos` 狀態機＋佇列＋`uploadListingPhoto`＋錯誤信封 | vitest jsdom | 驗收 9、10、13；一張失敗其餘保留、可重試 |
| 2-4a | `PhotoPicker`＋`PhotoCropDialog` 元件：lazy＋錯誤邊界、Radix Dialog、微調按鈕、焦點後備、佇列焦點／返回鍵、忙碌防重入、載入失敗＝重新載入且不可送出（Q-D 保守版）、舊圖僅移除；移除 `@public` | vitest jsdom | 驗收 8、12、13、14；無殘留 `@public` |
| 2-4b | Create／Edit 接線；**移除 `CreateServiceProvider.tsx:156` 的原檔 5 MB 擋檢，改用原檔上限常數 `MAX_PHOTO_SOURCE_SIZE`（20 MB，新增於 `constants.ts`）**；暫存檔移除呼叫 `deleteListingPhotos`；Edit 存檔 diff 刪由 hook 承接並保留 PR 1 測試 | vitest jsdom | 驗收 7（單元層）、15、16（原檔 5–20 MB 不被擋）；`constants.test.ts` 斷言仍成立；PR 1 的 Edit 存檔測試仍綠 |
| 2-5 | **e2e／journey 同步**（強制裁切使 2-4b 結束時 e2e 必紅，故 e2e 驗收放在本階段；建議 2-4b 與 2-5 同一 push 批次）：page object 新增動作「選檔→裁切→完成」（`create_service_provider_page.py:15` 的 22-byte 假 JPEG 換真小 JPEG fixture；`listing_management.feature:98,105-113`、`f40_listing_steps.py`、`f60_time_scenarios_steps.py`；「photo uploads are captured until released」改為按「完成」後才進入捕捉）；375px 下對話框按鈕可見；mock 補上傳失敗，以及裁切 chunk 載入失敗（動態 import reject）→ 重新載入 → 成功後可繼續 | e2e（CI 驗證）、`cd e2e/journey && pytest tools/` | 驗收 7（2×2 色塊驗輸出主色與無 EXIF，真瀏覽器）；`listing_management.feature:74-81` 仍綠；既有情境在新流程下仍綠 |
| 2-6 | 文件與閘門：規格書 §11 補「原檔 ≤ 20 MB」列並在 `check-spec-drift.py` 新增對應 `MAX_PHOTO_SOURCE_SIZE` 的 ConstantRule（或明寫不納入閘門）、`ui-ux-guidelines.md` §7 補「照片裁切」；bundle 增量量測（判準 §3）；`npm run check:full` | check-spec-drift、build | 增量 ≤40 kB gzip；全綠 |

## 6. 開放問題

已裁決：

- [x] Q-A 刪刊登清理：**走後端 `DELETE /listings/:id`**（業主 2026-10-27）。
- [x] Q-B 孤兒回溯清理與歷史 EXIF：**留第 2 波**（主 session）。
- [x] Q-C 上傳走 `apiClient`：**是，P0 選 (a)**（業主）。
- [x] Q-E 拆兩個 PR、後端先上：**是**（業主）。PR 2 趕不上 10/28 24:00 就留 11/3。
- [x] 雙分頁過期表單：**接受，記入 §7**（主 session）。

**業主裁決（2026-10-27）**：

- [x] **Q-D 裁切元件載入失敗**：保守版——顯示重試、不可送出，不批准降級，Q3-3 不留例外。
- [x] **Q-F 原檔大小**：原檔 ≤20 MB、上傳檔 ≤5 MB；規格書 §11 改措辭界定 5 MB 是上傳檔。
- [x] **Q-G 條款十之一殘留缺口**：記入規格書已知落差；第 2 波在 30 日窗口內補齊三條路徑，列為必做。
- 業主真機待辦（不擋）：iPhone Safari／LINE、Android Chrome／LINE 選 HEIC、48MP、EXIF 方向 6、透明 PNG、極大檔；回填「HEIC 被哪句擋下」與裁切手勢可用性。
- 無待決項。

## 7. 風險與回滾

- **回滾**：PR 1 revert 後，前端回到 `supabase.from('listings').delete()`（RLS 未動，相容）；PR 2 revert 後上傳端點與 5 MB 後端安全網未變，相容。無 migration。
- **誤刪**：三道防線（uid 前綴 regex、全表引用檢查且 fail-closed、先存後刪）＋限流。最壞情況是刪到「剛上傳、尚未存檔」的檔：client 只對「已確認移除且不在當前表單 photos 內」的 path 呼叫，且引用檢查不認未存檔者——使用者重傳即可。
- **雙分頁過期表單（接受）**：分頁 A 存檔移除 X 並刪檔，分頁 B 的舊表單仍持有 X 再存檔，把 X 寫回 `listings.photos`，公開頁破圖。引用檢查只管刪除當下。發生條件極窄（同一使用者、同一刊登、兩個分頁、其一刪檔後另一個存檔），不加 `updated_at` 樂觀鎖；使用者重新編輯重傳即可復原。
- **Storage 清理只覆蓋本端點**：RLS 直刪政策仍在，舊前端快取或其他刪除入口（含 admin）直刪列不會清 Storage；歸 Q-B／Q-G（第 2 波必做）。Edit 存檔與刪刊登同時發生時，後端讀到舊 photos、新存的檔成孤兒（不會誤刪），同歸 Q-B。
- **孤兒累積**（Create 離頁／關頁、刪除後清理失敗、帳號刪除 cascade、歷史檔、上傳逾時後重試——伺服器端其實成功而 client 判失敗，重試產生第二個檔，無冪等鍵）：不阻擋功能，`DELETE /listings/photos` 可由維運手動補清；janitor 與回溯清理第 2 波（Q-B）。
- **管線在某機型失敗**：能力偵測＋專屬文案；裁切工具載入失敗可重新載入或移除；上傳端點未變。
- **bundle**：`react-easy-crop` 增量超判準即改自刻拖曳。
- **時程**：全案 10/28 24:00 前沒合進 develop 的部分順延 11/3；PR 1 是底線。
