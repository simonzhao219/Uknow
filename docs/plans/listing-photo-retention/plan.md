# 刊登照片保存期限：條款十之一的照片下架補齊（listing-photo-retention）

<!-- 由 /plan-feature 實例化。第 2 波工項 C（只規劃）；實作第 3 波，業主親打 /tdd-implement。行號一律現算。 -->
<!-- plans-keep: 跨波鷹架（第 2 波規劃審查、第 3 波實作，跨 session）；退場條件＝第 3 波 /tdd-implement 收尾時決策升級進規格書 §11、刪 §14 第 14 列，本目錄隨該 PR 刪除 -->

## 0. 一句話

讓「使用者撤除的照片、終止服務的會員留下的照片」都在三十日內真的從公開 bucket 消失。條款十之一是律師定案的承諾，
目前只有兩條成功路徑做到（規格書 §14 第 14 列）。

## 1. 使用者需求

- 依據：服務條款十之一（`src/content/termsOfService.ts`，grep「十之一」，**原文不可改**）：「本服務終止或您撤除內容後，
  UKNOW 應於三十日內完成下架，但因技術快取所生之殘留不在此限」；授權「期間至本服務終止後三十日止」。
  規格書 §11「照片檔清理」、§14 第 14 列；第 1 波裁決 20（記為已知落差，第 2 波補齊）；總綱 §3.2C 與 §3.2B「排程 janitor」
  （`git show <hash>:docs/plans/platform-growth-and-trust/plan.md`）。
- **「下架」的定義**：bucket `listings-photos` 是 public，以 `getPublicUrl` 直出（`20261028000001`）。刊登隱藏後，知道 URL
  的人仍拿得到檔，所以下架＝**刪除 Storage 物件**。CDN 快取殘留屬條款但書，不另處理。
- **期限從哪天起算**：P1a 上線（10/27–28）後才有「撤除」。最早的撤除約在 10/28，期限約 **11/27**。第 3 波 11/10 晉升，
  首次排程清理在 11/11 前後，期限內還有約兩週可以處理失敗。
- 驗收情境（都在排程的下一輪後成立，最晚「寬限期＋1 日」）：
  1. 帳號被刪（`/auth/cancel-signup`、業主在 Dashboard 依條款十二刪除、`profiles` cascade 刪 `listings`）→ 該使用者
     `<uid>/` 底下的檔全數刪除。
  2. 歷史孤兒（上線至今清理失敗、未清的檔）→ 首輪清掉。
  3. Create 離頁、Edit 取消或清理失敗、上傳逾時後重試產生的第二個檔、存檔與刪刊登並發、RLS `listings_delete_own`
     直刪 → 沒有被本人刊登引用的檔都會清掉。
  4. 他人把你的 URL 寫進自己的 `photos` → **不再擋住**你的檔被清（引用只認「刊登者＝檔案前綴本人」）。
  5. 還在本人刊登 `photos` 裡的檔，任何情況都不刪（不變式，見 §7）。
- 不做：不改條款文字；不把 bucket 改 private／signed URL；不做前端離頁清理（排程兜底後，前端 best-effort 是重複投資）；
  不清舊 bucket `make-5c6718b9-listings-photos`（第 1 波業主待辦，用 Dashboard 整個刪，見 §6 Q6）；
  會籍到期是否算「本服務終止」由 §6 Q1 決定，裁決前不實作。

## 2. 系統設計

**主軸：一支每日排程的孤兒清理（janitor）兜住所有來源。** 不逐條補即時清理，理由是 §14 列出的九種孤兒來源都可以化約成
同一個判準：「物件存在，但沒有被它前綴本人的刊登引用」。帳號刪除走 cascade（包含業主在 Dashboard 手動刪），程式碼根本
沒有掛鉤點；SQL 也不能刪 Storage 物件（直接刪 `storage.objects` 的列只會留下實體孤兒，見 `20261028000001` 檔頭）。
條款給了三十日，每日一輪的延遲落在窗口內，排程失敗也還有兩週以上的重試餘裕。

- **判準 RPC**（migration `20261102000001_listing_photo_orphans.sql`）：
  `list_orphan_listing_photos(p_public_base text, p_grace interval, p_limit int)`，`security definer`，只授 `service_role`
  （同 `purge_stale_referral_invites` 的授權寫法）。回傳 `name`、`created_at`，外加統計：bucket 內物件總數、
  `listings.photos` 中以 `p_public_base` 開頭的 URL 數、其中對得到物件的數量。孤兒條件：
  `bucket_id='listings-photos'` 且 `created_at < now() - p_grace`，且 name 符合 `<uuid>/\d+_[a-z0-9]+\.(jpg|png|webp)`，
  且**不存在** `listings l` 使 `l.user_id::text = split_part(name,'/',1)` 且 `p_public_base || name = any(l.photos)`。
  `p_public_base` 由 Edge 以 `listingPhotoPublicUrl('x')` 去掉尾字推導（與 `cleanupListingPhotos` 同法），URL 格式仍只有
  `listingPhotoPublicUrl` 一個來源，SQL 裡不寫死網域。
- **清理邏輯**（`listing-photos.ts` 新增純函式 `sweepOrphanPhotos(deps, opts)`，注入式，跟既有 `removeUnreferencedPhotos` 同檔）：
  1. 呼叫 RPC。出錯就 throw，一檔不刪（fail-closed，與既有引用檢查一致）。
  2. **斷路器**：`listings.photos` 裡有本 bucket 的 URL，但一個都對不到物件，代表 base 推導錯誤，此時所有活照片都會被當成
     孤兒，所以中止並回 500。單輪上限 `p_limit`（建議 500）；超過就分輪處理，不加大單輪量。
  3. 依 Storage `remove` 一次 ≤100 個切批，回傳實際刪除數（不存在的不算，重送冪等）。
  4. `dry_run=true` 只回候選與統計，不刪。
- **端點** `POST /internal/purge-orphan-listing-photos`（`index.ts` 第 12 區段，緊接 `DELETE /listings/:id` 之後）：
  `x-internal-secret` 驗證（`timingSafeEqual`，同 `/internal/reconcile-pending-payments`，密鑰見 Q3）。body `{ dry_run?: boolean }`，
  回 `{ success, data: { dryRun, candidates, removed, totalObjects, referencedUrls, matchedUrls } }`。寬限期常數
  `ORPHAN_GRACE_HOURS = 48`（Create／Edit 開著、檔還沒存進刊登的期間；上傳逾時是 60 秒，48h 遠大於任何正常操作）。
- **即時路徑的引用語意收窄**：`listingPhotoDeps().cleanup.findReferencedUrls` 目前是跨使用者全表查，他人引用就擋住清理
  （§14 列舉的來源之一）。改成只認「刊登者＝路徑前綴本人」：介面加 `ownerId`，查詢加 `.eq('user_id', ownerId)`。
  1:1 刊登下，等於只在「本人刊登仍引用」時保留，用來擋「前端要求刪除仍在用的檔」這個競態。排程的 RPC 用同一判準。
- **排程**：新 workflow `.github/workflows/purge-listing-photos.yml`，每日一次，matrix 跑正式站與 develop。ref 讀 git
  （同 `reconcile-payments.yml` 的「確認目標」步驟），`curl -f` 加回應形狀斷言，失敗自動開 issue。`workflow_dispatch`
  帶 `dry_run` 輸入。檔內寫 `頻率依據:`（github-actions.md 規則 8b）：每日，因為條款窗口是三十日，GitHub 排程漂移數小時
  不影響；runner 免費，成本只有牆鐘。
- **RLS 直刪入口**：見 Q2（建議撤掉 `listings_delete_own`，刪刊登只剩 Edge 一個入口）。若採納，在同一支 migration
  `drop policy`；`is_admin()` 的刪除權沒有呼叫者（grep `from('listings')` 前後端都沒有 delete），一併撤。
- 不需要 API 契約變更（`_shared/api-contract.ts` 不動；internal 端點跟 reconcile 一樣不進契約）。

## 3. 架構影響

- 動到的檔：`supabase/functions/api/listing-photos.ts`（純函式＋handler）、`index.ts` 第 12 區段（deps 與新路由）、新 migration、
  新 workflow、規格書 §11／§14。**`index.ts` 第 4 區段（`/auth/cancel-signup`）不動**（Q4 建議不加即時清理）。
- 前端零改動，不碰 appShell、lazy 路由與多步驟四契約。
- 安全：RPC 只授 `service_role`；端點用共用密鑰。刪除範圍受三重限制：bucket 固定、name 正則固定、不刪本人刊登仍引用的檔。
- **不可逆**：Supabase 的資料庫備份不含 Storage 物件，刪了就救不回。所以要有斷路器、dry-run，並且正式站首輪先 dry-run
  請業主核對（§7）。
- 與第 2 波其他工項的撞檔（實作在第 3 波，屆時這些多半已合進 develop，實作 session 開工先 rebase）：
  - **P**（`index.ts` 第 7 金流段）：本案只動第 12 區段，不同區段。
  - **A**（migration `20261101000001` 起、`MemberManagement`）：本案用 `20261102000001`；rebase 後要跑 `check-migration-versions.py`。
  - **S**（Deno DB 測試斷言 `storage.buckets.public=false`、`storage.objects` 零 policy）：**`listings-photos` 是 public**，
    S 的斷言必須排除這個 bucket，否則 S 自己就會紅（請主 session 轉告 S）。本案不新增 `storage.objects` policy，與 S 的零
    policy 斷言相容。
  - **B**（`HomePage`）、**D**（`deploy-smoke.yml`）：無交集。本案的新 workflow 是新檔。

## 4. UI/UX

無使用者可見變更。§1「不做」說明了為什麼不做前端離頁清理；Edit 取消時既有的 best-effort 清理照舊保留。

## 5. 階段切分（每階段＝一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 即時路徑引用語意改成「僅本人刊登」 | `api/listing-photos.test.ts`（DB） | B 的刊登引用 A 的 URL 時，A 刪刊登或移除照片後 A 的檔被刪；A 自己仍引用的檔仍保留 |
| 2 | 判準 RPC `list_orphan_listing_photos`（＋Q2 採納時撤 `listings_delete_own`） | 新 `api/listing-photo-orphans.test.ts`（DB；以 SQL 種 `storage.objects` 列） | 孤兒／寬限期內／本人引用／他人引用／非法 name／無刊登（帳號已刪）六種情境；anon、authenticated 呼叫被拒；統計欄位正確 |
| 3 | `sweepOrphanPhotos` 純函式 | `api/listing-photos.unit.test.ts` | RPC 出錯不刪；斷路器（有 URL 但零命中）中止；dry-run 不呼叫 remove；切批 ≤100；`removed` 取實際數 |
| 4 | 端點 `POST /internal/purge-orphan-listing-photos` | `api/listing-photos.unit.test.ts`（handler，注入 deps）＋讀原文斷言路由註冊於 `/listings/:id` 之後 | 無密鑰或錯密鑰 401；成功回形狀正確；失敗 500 且 `success:false` |
| 5 | 排程 workflow | `python3 scripts/check-workflows.py`（命名、8b `頻率依據:`）＋develop 上 `workflow_dispatch` dry-run 一次 | check 綠；dry-run 回應通過形狀斷言 |
| 6 | 規格書 §11 改寫清理段、刪 §14 第 14 列 | `python3 scripts/check-spec-drift.py` | 綠；§11 描述排程與寬限期，沒有「沒有 X」之類的旁白（document-writing.md） |

## 6. 開放問題

- [ ] **Q1 會籍到期（不續約）算不算條款的「本服務終止」？**（法律解釋，需業主或律師）條款六寫「服務期間內仍得隨時通知
  終止本服務」，可見「本服務」有期間；到期後刊登已隱藏，但照片 URL 仍可公開取得。
  (a) 不算：只有帳號刪除和主動撤除才觸發；到期會員的照片保留到續約。(b) 算：到期滿 30 日刪照片（刊登列保留），續約後要
  重新上傳 3 張，Edit 要能處理「photos 指向已刪檔」。(c) 先照 (a) 實作，並請律師確認；若改判 (b)，在 RPC 加一個條件即可。
  **建議 (c)**：(b) 讓續約者的刊登開天窗，是產品上的大改，不該由工程推定。
- [ ] **Q2 撤掉 RLS `listings_delete_own`？** (a) 撤（含 admin 分支），刪刊登只剩 Edge `DELETE /listings/:id`；
  (b) 保留，靠排程兜底。**建議 (a)**：前後端都沒有直刪的呼叫者，留著只是一個繞過清理的入口；放在同一支 migration，成本一行。
- [ ] **Q3 排程端點的密鑰**：(a) 沿用 `RECONCILE_SECRET`，業主不用新增 secret；(b) 新開 `PHOTO_PURGE_SECRET`，正式站與
  develop 都要設，影響範圍隔離。**建議 (a)**：兩支都是冪等的維運排程、同一批 workflow 持有；之後若要分權再拆。
- [ ] **Q4 `/auth/cancel-signup` 要不要另加即時清理**（刪帳號後立刻清 `<uid>/`）？(a) 不加，排程在寬限期＋1 日內清掉；
  (b) 加，best-effort、失敗交給排程。**建議 (a)**：三十日窗口內排程已足夠，加了要多動 `index.ts` 第 4 區段和一組測試，
  換到的只是提早一兩天。
- [ ] **Q5 寬限期 48 小時**是否接受？(a) 48h；(b) 7 日（更保守，Create 頁開著放好幾天才送出也不會被誤刪）。
  **建議 (a)**：寬限期過後才送出的刊登會引用已刪的檔，但機率極低；7 日則讓最長下架延遲吃掉窗口的四分之一。
- [ ] **Q6 舊 bucket `make-5c6718b9-listings-photos` 是否已由業主在 Dashboard 刪除？**（第 1 波遺留，不是本案範圍）
  沒刪的話，裡面的檔一樣受條款十之一約束：請業主在晉升前確認並刪除。本案的排程只看新 bucket。

## 7. 風險與回滾

- **最壞情況是誤刪活照片**（base 推導錯、判準寫錯），而且 Storage 沒有備份可以還原。防線：①判準用 SQL 一次算完，有 DB 測試
  涵蓋六種情境；②斷路器（有 URL 但零命中就中止）；③單輪上限；④**上線程序**：第 3 波合進 develop 後，develop 先 dry-run 再實跑；
  正式站晉升後先 `workflow_dispatch dry_run=true`，候選清單交業主核對，再打開排程。
- 次壞是排程靜默不跑，條款窗口過期。防線：curl -f＋形狀斷言＋失敗開 issue（同 reconcile）；三十日窗口能容許約兩週的連續失敗。
- 回滾：停排程（disable workflow）就停止刪除；revert PR 可撤端點與 RPC。引用語意收窄可單獨 revert。已刪的檔無法回滾，
  所以實際的回滾手段是「先 dry-run」。
