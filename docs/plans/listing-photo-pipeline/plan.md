# 刊登照片上傳管線（P1a）規劃書

<!-- 落檔理由：階段數 ≥3、跨 session（第 1 波執行 session 只規劃，實作由業主親打 /tdd-implement）。
     上位規劃：docs/plans/platform-growth-and-trust/plan.md §3.1／§3.2A／§3.2C／§3.4（未改動前以其為準）；
     第 1 波排程：docs/plans/launch-wave-1/plan.md §3.2。PR 前依 CLAUDE.md 收尾刪除。 -->

## 0. 一句話

刊登者（服務提供者）在 Create／Edit 選照片後，每張先進 1:1 裁切畫面確認取景框，再自動壓縮成 JPEG 逐張上傳；
移除或換掉的照片會從 Storage 清掉——因為原圖直傳含 EXIF（可能含 GPS）、常因過大或格式失敗、錯誤訊息顯示不出來，
且條款十之一承諾撤除後三十日內下架卻從不清 Storage。

## 1. 使用者需求

- 對照規格書：`docs/uknow-software-specification.md` §11（照片：最多 3 張、單張 ≤5 MB、jpeg/png/webp；:613）；
  條款十之一（`termsOfService.ts:48-49` 已授權技術性裁切／壓縮／格式轉換，**法務文件不可改**）。
- 已裁決（不重問）：**Q3-1 維持恰好 3 張**；**Q3-3 每張強制進裁切**（總綱 §13，2026-10-19，取代 §3.2A 舊稿「自動置中＋選用調整」之處以裁決為準）。
- 驗收情境（可驗證）：
  1. 選一張 4000×3000、6 MB 的 JPEG → 出現 1:1 裁切框（預設置中）→ 按「完成」→ 上傳的檔 ≤ 1600px、通常 < 600 KB、不含 EXIF（無 APP1）。
  2. 三張中一張上傳失敗 → 另兩張保留；失敗那張顯示「重試第 N 張／移除第 N 張」，重試成功後才能送出。
  3. 後端回 `{error:'檔案不得超過 5MB'}` 時，畫面顯示該句而非通用 fallback。
  4. 選 HEIC／無法解碼的檔 → 該張顯示「這張照片的格式無法讀取，請換一張，或截圖後再試」，不上傳、其餘照常。
  5. Edit 移除一張並存檔成功後，被移除的檔從 bucket 消失；存檔失敗則不刪（舊刊登不壞）。
  6. 刪除刊登後，該刊登的照片檔被清；仍被任何 `listings.photos` 引用的檔絕不被刪。
- **不做**：封面指定／拖曳排序、草稿持久化、舊圖重裁、配額與 janitor（總綱 §3.2B 選配，各自獨立小 PR）；
  P1b（七容器改 1:1、滑動切圖）；「大頭照」（Q3-4）；改張數規則；改上傳端點契約；migration；EXIF 以外的內容審核。
- **階段 0（HEIC 成因真機確認）降為業主真機待辦**，不擋規劃與實作；結果由業主回填 PR 描述。

## 2. 系統設計

**資料流**：`<input accept="image/*">` → 解碼（`createImageBitmap(file,{imageOrientation:'from-image'})`，限邊解碼避免 48MP OOM）
→ 裁切對話框（`react-easy-crop`）→ canvas 輸出 1:1 → `toBlob('image/jpeg',0.82)` 最長邊 1600、目標 <600 KB（超過就降品質重編，三次為限）
→ `POST /listings/upload-photo`（**端點不動**，multipart、單張一次）→ 回 `photoUrl` → 收進表單 `photos`。
最終仍由既有路徑寫 `listings.photos`（Create 的 insert、Edit 的 `supabase.from('listings').update`，皆不動）。

**編碼失敗不退回原檔上傳**：重新編碼＝剝 EXIF 是需求（總綱 §3.2A-3 重審 P-02）。解碼成功但編碼失敗 → 該張標「無法處理」、不上傳。
透明 PNG 轉 JPEG 先鋪白底。5 MB 上限留在後端與 bucket 作安全網。

**新增唯一後端端點 `DELETE /listings/photos`**（`index.ts` 僅在 `POST /listings/upload-photo` 區段之後加自己的一段，不碰他區；撞檔矩陣總綱 §8.2）：
- 認證：`requireAuth`；body `{ paths: string[] }`，單次 ≤ 10 筆。
- 路徑只收 `^<自己的 uid>/\d+_[a-z0-9]+\.(jpg|png|webp)$`（用 `user.id` 組 regex，不信 client 的 uid）；任一筆不合 → 整個請求 403（不部分刪）。
- **引用檢查**：以 service_role 查 `listings.photos` 是否仍含該檔的 public URL（`.contains` 或 `cs`），仍被引用的**不刪**並列在回應 `skipped`——
  這使「client 在存檔前就呼叫」也不會誤刪；呼叫順序仍規定為「**先存 listings 成功，再 diff 刪 Storage**」。
- 冪等：不存在的檔視為已刪（Storage `remove` 對不存在不報錯）；回 `{success:true, removed:n, skipped:m}`。
- 失敗不影響使用者流程：client 呼叫為 best-effort（失敗只 `console.warn`，孤兒留待日後 janitor——選配項）。

**刪刊登的清理（偏離總綱 §3.2C 的決策，待業主確認，見 §6 Q-A）**：總綱寫「刪刊登改走 Edge」，但那要改 `ServiceProviderManagement` 的刪除路徑並新增 Edge 刪除端點，
與 S7a 同檔、且 `listings` 刪除目前靠 RLS＋前端 `.eq('user_id')`。**本案改採最小版**：維持前端 `supabase.from('listings').delete()`，
**刪除成功後**由前端以刪前讀到的 `listing.photos` 呼叫 `DELETE /listings/photos`（引用檢查保證安全）。如此 `ServiceProviderManagement.tsx` 只多約 5 行，
不新增刪刊登端點、不改授權模型。代價：client 在刪除成功後、清理前關頁 → 留下孤兒（同樣歸 janitor 選配項）。

**資料庫**：無 migration（`listings.photos text[]` 與 `public_listings` 12 欄契約不動，`listings.test.ts`、`rls-policies.test.ts` 的契約測試須維持綠）。

**錯誤信封**：上傳端點回 `{error:'字串'}`、前端原讀 `.error?.message` 永遠落 fallback（bug 在前端）。改用 `apiClient.extractApiErrorMessage`（已吃字串與巢狀兩種）。
注意該上傳是 `fetch` + multipart，不走 `apiClient` 的 JSON 路徑；是否抽 `uploadListingPhoto()` 到 `apiClient.ts`（附 token、session 過期處理）列 Q-C，預設**是**，因為 CLAUDE.md 規定 API 呼叫一律走 `apiClient.ts`。

## 3. 架構影響

- 新檔：`src/utils/imageGeometry.ts`（純數學：裁切矩形換算、縮放比）、`src/utils/imagePipeline.ts`（注入 `ImageIO` 介面：decode／crop／encode，便於 node 測試）、
  `src/hooks/useListingPhotos.ts`（每張狀態機）、`src/components/listing/PhotoPicker.tsx`（Create／Edit 共用，先例 `CategorySelectField`）、
  `src/components/listing/PhotoCropDialog.tsx`（lazy 載入 `react-easy-crop`）。
- 改檔：`CreateServiceProvider.tsx`、`EditServiceProvider.tsx`（換成 `PhotoPicker`；七處硬編 3 改 `MAX_PHOTO_COUNT`；Edit 補大小檢查）、
  `ServiceProviderManagement.tsx`（刪除後清理，約 5 行；與 S7a 先合併者定）、`index.ts`（新增一段）、`constants.ts`（壓縮常數、`MAX_PHOTO_SIZE` 的 Edit 副本刪除，至少 Edit 那份）、
  規格書 §11（寫行為不寫數字，維持 `check-spec-drift.py:124-135` 的 regex 釘住 `最多 N 張／單張 ≤N MB`）、`ui-ux-guidelines.md` §7 補「照片裁切」。
- 新依賴 `react-easy-crop`（只在 Create／Edit 的 lazy chunk 內動態載入；Create／Edit 本身已是 lazy 路由）。**PR 前手動 `node scripts/check-bundle-budget.mjs`**（CI 才跑、基準是 2026-07 值），
  且 `knip` 要認得新依賴與新匯出。
- 多步驟契約（`docs/multi-step-flow-recovery.md` 四契約）：Create 是多步表單——裁切對話框是疊層，須遵守「上傳中輸入不被倒回」
  （`listing_management.feature:74-81` 既有情境必須仍綠）；疊層用 `useBodyScrollLock`、`useBackNavigation`（Android 返回鍵關疊層而非離頁）、`dvh`。
- 效能／安全：解碼限邊；canvas 逐張處理、完成即 `revokeObjectURL`；DELETE 端點路徑白名單＋引用檢查＋uid 前綴三道；不新增匿名端點。

## 4. UI/UX

對照 `docs/ui-ux-guidelines.md`（觸控目標 ≥44px、焦點環、live region）。
- 格列表 `ul/li`，每格按鈕命名「重試第 N 張／移除第 N 張／調整第 N 張範圍」；常駐 `aria-live=polite` 播報各張狀態。
- 狀態：準備中／待裁切／上傳中／失敗（可重試）／無法處理（只能移除）／完成。選完立刻 objectURL 預覽。
- 裁切對話框：取景框預設置中、縮放滑桿＋拖曳（`react-easy-crop` 提供）、方向鍵微調、重設／完成／取消（44px）；chunk 載入中與載入失敗兩態——
  **失敗則改用自動置中裁結果並提示，不擋上傳**（與 Q3-3「強制進裁切」不衝突：強制的是流程，不是在套件掛掉時卡死使用者，見 Q-D）。
- 送出鈕：上傳中 `aria-disabled` 並說明原因；仍要求恰好 3 張。Create 標籤維持「必須上傳 3 張，第一張為封面照」；Edit 補同句（與 Create 一致）。
- 太大檔案不再被前端 5 MB 擋掉（原檔可大，壓縮後才上傳）；只在原檔 >5 MB 且壓縮後才可上傳時顯示「已自動縮小」。
- 行動版優先（375px）；裁切疊層佔滿 `dvh`；LINE 內建瀏覽器的檔案選取與手勢列為真機矩陣。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `imageGeometry.ts`＋`imagePipeline.ts`：解碼限邊、方向、裁切矩形、縮放、JPEG 編碼迴圈、錯誤分類（OOM／格式無法讀取／編碼失敗）；白底補透明 | vitest node（`ImageIO` 替身） | 矩形換算正確；OOM 與格式錯誤分流；編碼失敗回 `unprocessable` 而非原檔 |
| 2 | `useListingPhotos` 狀態機＋`uploadListingPhoto`（apiClient）＋錯誤信封 | vitest jsdom（`// @vitest-environment jsdom`） | 一張失敗其餘保留；可重試；後端 `{error:'字串'}` 顯示原句；上傳中旗標 |
| 3 | `PhotoPicker`＋`PhotoCropDialog` 接進 Create／Edit；七處硬編 3 常數化；Edit 補大小檢查；Create 標籤同步 | vitest jsdom＋e2e（真 JPEG、2×2 色塊 fixture 驗輸出主色與無 EXIF） | 每張進裁切；取消不上傳；`listing_management.feature:74-81` 仍綠；既有 22-byte 假 JPEG fixture 換成真小 JPEG（`create_service_provider_page.py:15`，journey 共用 `f40_listing_steps.py`、`f60_time_scenarios_steps.py`） |
| 4 | 後端 `DELETE /listings/photos`（白名單、uid 前綴、引用檢查、冪等、批次上限） | `supabase/functions/api/*.test.ts`（deno test，風格同 `listings.test.ts`） | 非法路徑／他人前綴 403；仍引用者 `skipped`；不存在者視為已刪；未登入 401 |
| 5 | 清理接線：Edit 存檔成功後 diff 刪、Create 取消／離頁刪暫存、`ServiceProviderManagement` 刪除成功後清 | vitest jsdom | 存檔失敗不呼叫刪除；刪除失敗不影響成功 toast；順序＝先存後刪 |
| 6 | 文件與閘門：規格書 §11、ui-ux §7、bundle 預算手動量測、knip、spec-drift | `npm run check:full`、`check-spec-drift.py` | 全綠；規格書不寫數字以外的新漂移 |

階段 4 與 1–3 互不依賴，可由同一 session 先後做；`index.ts` 只在階段 4 動，rebase 衝突面最小。

## 6. 開放問題（等業主裁決；不阻擋審查）

- [ ] **Q-A 刪刊登清理方式**：A（建議）維持前端刪列、成功後呼叫 `DELETE /listings/photos`；B 依總綱 §3.2C 把刪刊登改走新 Edge 端點（動 `ServiceProviderManagement` 授權路徑，與 S7a 撞檔、`index.ts` 多一支）。
- [ ] **Q-B 條款十之一「三十日內下架」是否要求歷史已移除照片回溯清理**（現存孤兒）：建議本案不回溯，另開一次性腳本（業主清資料後正式站為空，風險近零）。
- [ ] **Q-C 上傳走 `apiClient`**：建議是（新增 `uploadListingPhoto`，附 token／過期處理）；否則維持裸 `fetch`。
- [ ] **Q-D 裁切元件載入失敗時的退路**：建議改用自動置中裁結果、不擋上傳（見 §4）；若業主要求「必須人工確認」則改為提示重試、不得送出。
- [ ] **Q-E 時程**：總綱把 P1a 列「最大的一項」；10/28 24:00 前未合進 develop 的部分順延 11/3。建議**切兩個 PR**：PR1＝階段 4＋5 的後端與清理（合規項，風險低、共檔小）；PR2＝階段 1–3 前端管線。若只趕得上一個，先上 PR1。業主同意？
- [ ] 業主真機待辦（不擋）：iPhone Safari／LINE、Android Chrome／LINE 選 HEIC、48MP、EXIF 方向 6、透明 PNG、極大檔，回填「HEIC 被哪句擋下」與裁切手勢可用性。

## 7. 風險與回滾

- 最壞：裁切／壓縮管線在某機型解碼失敗，使用者無法上傳 → 錯誤訊息引導「截圖後再試」；上傳端點與 5 MB 後端安全網未變，**回滾＝revert 前端 PR，後端相容**。
- `DELETE` 誤刪：三道防線（uid 前綴 regex、`listings.photos` 引用檢查、先存後刪）＋ best-effort；最壞情況是刪到「剛上傳、尚未存檔」的檔（使用者在同一表單反覆操作時，client 只對**已確認移除且非當前表單引用**的檔呼叫）→ 表單內 URL 失效，使用者重傳即可。
- 孤兒累積（取消／離頁／刪除後關頁）：不阻擋功能，janitor 為選配；`DELETE` 端點可由維運手動呼叫補清。
- 無 migration → 10/29–31 凍結期不受影響；本案全部須在 10/28 24:00 前進 develop，否則整案順延 11/3 第 2 波。
- bundle 預算：`react-easy-crop` 若使 lazy chunk 超預算，改為自刻簡化拖曳（縮放滑桿＋平移）並重列此項。
