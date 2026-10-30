# 刊登照片保存期限：條款十之一的照片下架補齊（listing-photo-retention）

<!-- 由 /plan-feature 實例化。第 2 波工項 C（只規劃）；實作第 3 波，業主親打 /tdd-implement。行號一律現算。 -->
<!-- plans-keep: 跨波鷹架（第 2 波規劃審查、第 3 波實作，跨 session）；退場條件＝第 3 波 /tdd-implement 收尾時決策升級進規格書 §11、刪 §14 第 14 列，本目錄隨該 PR 刪除 -->

**v2（2026-10-31）**：依業主裁決 W2-5～9（`docs/plans/launch-wave-2/plan.md` §0）與第一輪審查的工程類 P1 修訂。
v1 與第一輪報告可用 `git show 5ae44cba:docs/plans/listing-photo-retention/review.md` 取回。

## 0. 一句話

讓「使用者撤除的照片、帳號已刪除的會員留下的照片」都在三十日內真的從公開 bucket 消失。條款十之一是律師定案的承諾，
目前只有兩條成功路徑做到（規格書 §14 第 14 列）。

## 1. 使用者需求

- 依據：服務條款十之一（`src/content/termsOfService.ts`，grep「十之一」，**原文不可改**）：「本服務終止或您撤除內容後，
  UKNOW 應於三十日內完成下架，但因技術快取所生之殘留不在此限」。規格書 §11「照片檔清理」、§14 第 14 列；第 1 波裁決 20；
  總綱 §3.2B「排程 janitor」與 §3.2C（`git show <hash>:docs/plans/platform-growth-and-trust/plan.md`）。
- **「下架」＝刪除 Storage 物件**：bucket `listings-photos` 是 public，以 `getPublicUrl` 直出（`20261028000001`）。刊登隱藏後，
  知道 URL 的人仍拿得到檔。CDN 快取殘留屬條款但書，這個解讀與 W2-5 一起送律師確認。
- **「本服務終止」的範圍（W2-5）**：會籍到期不算，等律師確認。若律師判定「算」，在 RPC 加一個條件即可（§2）。
  依條款六「隨時通知終止」、條款十二「請求刪除視同終止」提出的終止，**由業主人工處理**，作法見下一點。
- **終止／刪除請求的 SOP（W2-5 要求寫進 SOP，落點與作法見 §6 Q9）**：業主收到請求後 30 日內，在 Dashboard SQL Editor
  刪除該會員的 `listings` 列，照片交由排程清除。規則寫在規格書 §11「照片檔清理」段，只寫這一處。
- **規格書所說的三條路徑**：①帳號刪除（`profiles` cascade 刪 `listings`，包含業主在 Dashboard 刪除）；②`/auth/cancel-signup`；
  ③歷史孤兒。另外還有九種孤兒來源：Create 離頁、Edit 取消與清理失敗、逾時重試的第二個檔、存檔與刪刊登並發、
  RLS 直刪、他人引用。
- **期限推算**：P1a 在 10/27–28 上線，最早的撤除約在 10/28，期限約 **11/27**。
  - 第 3 波 11/10 晉升時，排程預設 dry-run（W2-8）。
  - 業主在晉升後 3 日內（11/13 前）核對候選清單，再開實刪。
  - 寬限期 7 日（W2-7），最長下架延遲＝7 日＋1 輪。
  - 11/13 開實刪後，第一輪會清掉所有超過寬限期的孤兒，期限前還有約兩週可以處理失敗。
  - **已知風險**：P1a 之前的孤兒查不到撤除日。但第 1 波上線前，正式站資料已全清，舊 bucket 也已在 10/28 刪除（W2-9），
    所以新 bucket 裡不會有 10/28 之前的撤除。
- **寬限期的起算點是物件的 `created_at`（上傳時間），不是撤除時間**。這不影響合規，理由如下：
  - 撤除舊照片（上傳超過 7 日）時，檔案早已過了寬限期，下一輪就會清掉。
  - 撤除新照片時，延遲最多是「上傳後 7 日」，仍在 30 日內。
- 驗收情境（都在「寬限期＋1 輪」內成立）：
  1. 帳號被刪（`/auth/cancel-signup`、Dashboard 刪除、cascade）→ 該使用者 `<uid>/` 底下的檔全數刪除。
  2. 歷史孤兒 → 開實刪後的第一輪清掉。
  3. Create 離頁、Edit 取消或清理失敗、逾時重試、並發、RLS 直刪（Q2 撤除後已不存在）→ 沒被本人刊登引用的檔都會清掉。
  4. 他人把你的 URL 寫進自己的 `photos` → 不會擋住清理（引用只認「刊登者＝檔案前綴本人」）。
  5. 本人刊登 `photos` 裡還在用的檔，任何情況都不刪（不變式）。
- 不做：
  - 不改條款文字。
  - 不把 bucket 改成 private／signed URL。
  - 不做前端離頁清理。
  - 不加存檔前的檔案存在驗證（W2-7）。
  - 不在 `/auth/cancel-signup` 加即時清理（W2-9）。
  - 不處理會籍到期（W2-5）。

## 2. 系統設計

**主軸：一支每日排程的孤兒清理（janitor）兜住所有來源。** 九種來源都可化約成同一個判準：「物件存在，但沒有被它前綴本人的
刊登引用」。cascade 刪除沒有程式碼掛鉤點，SQL 也不能刪 Storage 物件（`20261028000001` 檔頭），所以只能由排程來清。

### 2.1 判準 RPC（migration `20261102000001_listing_photo_orphans.sql`）

- 簽章：`public.list_orphan_listing_photos(p_public_base text, p_grace interval, p_limit int)`。
- 權限：
  - `security definer`，`set search_path = ''`，函式內一律 schema-qualified（`storage.objects`、`public.listings`）。
  - `revoke execute … from public, anon, authenticated`；`grant execute … to service_role`（同 `purge_stale_referral_invites`）。
- 回傳一列 jsonb：
  - `candidates`：`name` 陣列，依 `order by created_at, name limit p_limit`，分輪處理有決定性。
  - `total_objects`：bucket 內物件總數。
  - `referenced_urls`：`listings.photos` 中以 `p_public_base` 開頭的 URL 數。
  - `matched_urls`：上述 URL 中對得到物件的數量。
- 孤兒條件：以下全部成立。
  - `bucket_id = 'listings-photos'`。
  - `created_at < now() - p_grace`。
  - `name ~ '^[0-9a-f]{8}-…-[0-9a-f]{12}/\d+_[a-z0-9]+\.(jpg|png|webp)$'`。
  - `not exists (select 1 from public.listings l where l.user_id::text = split_part(name,'/',1) and p_public_base || name = any(l.photos))`。
- `p_public_base` 由 Edge 以 `listingPhotoPublicUrl('x')` 去掉尾字推導，URL 格式只有一個來源，SQL 不寫死網域。
- 律師若判定會籍到期也算終止：在 `not exists` 的子查詢加上「且該使用者會籍有效或失效未滿 30 日」，其餘不動。
- **同一支 migration 撤 `listings_delete_own`**（W2-6，含 admin 分支）。
  - 現況：前後端都沒有呼叫者。驗證指令：`grep -rn "from('listings')" src supabase/functions e2e | grep -i delete` 只應命中 service_role 用法
  （`index.ts` 的 `deleteListingRow`、`listing-categories.test.ts` 的清理，都不受 RLS 影響；2026-10-31 實查）。
  - FK cascade 不受 RLS 影響，帳號刪除路徑不變。
  - 要連動修改：`api/rls-policies.test.ts` 對該 policy 的三處斷言（grep `listings_delete_own`）、`supabase/README.md` 的 RLS 表、
    規格書 RLS 描述（grep 確認）。
  - 放同一支 migration：撤 policy 只有一行，回滾時用新 migration 補回 `create policy` 即可，不需要單獨 revert。

### 2.2 清理邏輯（`listing-photos.ts` 新增純函式 `sweepOrphanPhotos(deps, opts)`）

```ts
interface OrphanSweepDeps {
  listOrphans: (publicBase: string, graceHours: number, limit: number) => Promise<OrphanReport>; // RPC；出錯 throw
  cleanup: PhotoCleanupDeps; // 既有：publicUrlOf / findReferencedUrls(urls, ownerId) / removeObjects
  warn: (message: string, ...detail: unknown[]) => void;
}
interface SweepOptions { publicBase: string; graceHours: number; limit: number; dryRun: boolean }
```

1. 呼叫 `listOrphans`，出錯就 throw，一檔不刪（fail-closed）。
2. **斷路器**（任一條成立就 throw `circuit_open`，不刪）：
   - 錨點失效：`matched_urls = 0`，而 `referenced_urls > 0` 且 `total_objects > 0`。代表 base 推導錯誤，所有活照片都會被當成孤兒。
   - 比例閘：`candidates / total_objects > 0.5` 且 `total_objects > 20`。用來擋部分誤判（例如前綴比對失效）。
   - 誤中止時的處置：業主先用 dry-run 看清單，確認無誤後以 `workflow_dispatch`，帶 `force_ratio=true` 放行**單輪**。
     只放行比例閘，錨點失效的那一條不可放行。
3. **刪前逐 owner 二次引用檢查**：候選依前綴分組，每組呼叫既有的 `removeUnreferencedPhotos(deps.cleanup, paths, ownerId)`。
   RPC 判定與刪除之間，同帳號的另一個分頁可能把檔重新存回 `photos`（TOCTOU），二次檢查就是擋這個；也讓排程與即時路徑走
   同一段刪除程式。
4. 刪除時以 Storage `remove` 一次 ≤100 個切批。中途失敗就 throw，錯誤帶 `removedSoFar`；冪等，重跑安全。
5. `dryRun` 時只回候選與統計，不呼叫 `removeObjects`。

### 2.3 端點 `POST /internal/purge-orphan-listing-photos`

- 位置：`index.ts` 第 12 區段，`DELETE /listings/:id` 之後。照片相關路由集中在同一區段；內部維運端點雖然多在第 7 區段，
  但那裡是 P 的金流段。同步更新 `.claude/rules/supabase-functions.md` 的區段表。
- handler 放在 `listing-photos.ts` 的 `createListingPhotoHandlers`。`ListingPhotoHandlerDeps` 新增以下欄位：
  - `verifyInternalSecret(c): Promise<boolean>`：由 `index.ts` 以 `RECONCILE_SECRET`＋`timingSafeEqual` 組成（W2-9）。
  - `sweep: OrphanSweepDeps`。
  - `publicBase: () => string`。
- body `{ dry_run?: unknown, force_ratio?: unknown }`：
  - **只有 `dry_run === false`（JSON boolean）才實刪**。缺漏、解析失敗、字串 `"false"` 一律當 dry-run。
  - `force_ratio === true` 才放行比例閘。
- 回應：
  - 成功：`{ success: true, data: { dryRun, candidates: string[], removed, totalObjects, referencedUrls, matchedUrls } }`。
    dry-run 回完整候選清單（≤ limit）供核對。
  - 失敗：`{ success: false, error: { code, message }, removedSoFar }`，HTTP 500；`code` 是 `circuit_open`／`sweep_failed`；
    無密鑰或錯密鑰回 401。
- 常數：
  - `ORPHAN_GRACE_HOURS = 168`（W2-7）。
  - `ORPHAN_SWEEP_LIMIT = 500`。
  - 兩者都寫死，改動要發 PR。它們是維運參數，不是 `reward_config` 那類業務參數。
- 隱私：`candidates` 的 name 含 uid，只出現在 HTTP 回應與 Actions 的 step summary（私有 log），**不寫進 issue**。

### 2.4 即時路徑的引用語意收窄

- `PhotoCleanupDeps.findReferencedUrls(urls, ownerId)` 加 `ownerId`，查詢加 `.eq('user_id', ownerId)`。
- 連動三處呼叫：`removeUnreferencedPhotos`（加 `ownerId` 參數）、`cleanupListingPhotos`、`deletePhotos`（`user.id`）。
- 他人引用不再擋住清理。1:1 刊登下，等於只在本人刊登仍引用時保留。

### 2.5 排程 `.github/workflows/purge-listing-photos.yml`

- 觸發：
  - `schedule` 每日一次，**只打正式站**（W2-9：develop 只做 dispatch）。
  - `workflow_dispatch` 輸入：`target`（`production`／`develop`，choice）、`dry_run`（boolean，預設 true）、
    `force_ratio`（boolean，預設 false）。
- 實刪開關（W2-8）：
  - 排程觸發時，只有 repo variable `vars.PHOTO_PURGE_LIVE == 'true'` 才送 `dry_run: false`，否則送 `true`。
  - dispatch 觸發時，依輸入值決定。
  - body 由 `jq -n --argjson dry "$DRY" …` 組成，`$DRY` 只能是字面量 `true`／`false`，確保送出的是 JSON boolean。
- 確認目標（照 `reconcile-payments.yml` 的硬檢查）：
  - production 讀 `src/utils/supabase/info.tsx` 並比對 `vars.SUPABASE_PROJECT_REF`。
  - develop 讀 `config/supabaseTarget.ts`（`deploy-supabase.yml` 的寫法）。
- 回應處理：
  - 404 照 reconcile 告警段落降為 `::warning::` 略過，處理晉升前到部署核准前的空窗。
  - 其餘非 200，或回應形狀不符，就讓 job 失敗。
- 失敗時開 issue：標題含環境（`[production] 刊登照片孤兒清理失敗`），內文只放 run 連結、`code`、統計數字，不放 name。
- 檔頭寫 `頻率依據:`（規則 8b）：條款窗口三十日、寬限期 7 日，所以每日一次足夠，GitHub 排程漂移數小時不影響。
  runner 免費，成本只有牆鐘。
- 依規則 3、5、6：permissions 逐 job 宣告，`timeout-minutes`，step 用中文 name。

### 2.6 不動的部分

不改 `_shared/api-contract.ts`（internal 端點不進契約，同 reconcile），不動前端，不新增 `storage.objects` policy。

## 3. 架構影響

- 動到的檔：
  - `listing-photos.ts`
  - `index.ts` 第 12 區段（deps 與路由）
  - 新 migration
  - 新 workflow
  - `api/rls-policies.test.ts`
  - `supabase/README.md`
  - `.claude/rules/supabase-functions.md` 區段表
  - 規格書 §11／§14
- **`index.ts` 第 4 區段（`/auth/cancel-signup`）不動。**
- 安全：
  - RPC 只授 `service_role`，端點用共用密鑰。
  - 刪除範圍有四重限制：bucket 固定、name 正則、本人刊登引用、刪前二次檢查。
- **不可逆**：Supabase 的資料庫備份不含 Storage 物件。防線是斷路器、預設 dry-run、業主核對（§7）。
- 營運前提（業主待辦）：Supabase 的 Secrets 逐分支獨立、不繼承。GitHub 只有一份 `RECONCILE_SECRET`，所以 develop 的
  Supabase `RECONCILE_SECRET` 必須與正式站同值，develop 的 dispatch 才打得通。實作 session 開工時先用 dispatch 驗證，
  401 就請業主同步。
- 與第 2 波其他工項的撞檔（實作在第 3 波，開工先 rebase）：
  - P 改 `index.ts` 第 7 區段，本案改第 12 區段。
  - A 的 migration 從 `20261101000001` 起，本案用 `20261102000001`，rebase 後跑 `check-migration-versions.py`。
  - S 的「bucket 不公開」斷言已排除 `listings-photos`。
  - B、D 無交集。

## 4. UI/UX

沒有新畫面，也沒有新互動。設計會造成以下可見結果，依裁決接受：

- **寬限期過後才送出的刊登會破圖（W2-7 接受）**：例如 Create 頁開著放超過 7 日才送出，刊登會引用已刪的檔。公開頁由
  `ImageWithFallback` 顯示灰底破圖圖示，Edit 頁的 `PhotoPicker` 用裸 `<img>`，會顯示空白，而且仍可再存一次。
  7 日的寬限期已涵蓋「LINE 背景化、隔天才回來送出」這類常見路徑，剩下的是放超過一週的極端情況。
- **Edit 頁的死連結處理不在本案範圍**。只有兩種情況會遇到死連結：上述極端情況，以及他人違規引用的 URL。會籍到期不清照片
  （W2-5），所以續約者不會遇到。若律師日後判定「會籍到期算終止」，這項就是那次改動的前置條件，屆時另案規劃：
  `PhotoPicker` 既有格掛 `onError` 轉成 failed 態，文案「這張照片已失效，請移除後重新上傳」，擋住送出並播報。
- **他人違規引用你的 URL**：你的檔被清掉後，對方的刊登會破圖。這是預期結果。

## 5. 階段切分（每階段＝一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 即時路徑引用語意收窄（`findReferencedUrls(urls, ownerId)`） | `api/listing-photos.unit.test.ts`（既有 `removeUnreferencedPhotos`、`DELETE /listings/*` 案例改簽章）＋`api/listing-photos.test.ts`（DB；`removeObjects` 覆寫為 spy） | B 的刊登引用 A 的 URL，A 刪刊登或移除照片時，spy 收到 A 的 path；A 自己仍在引用的檔不在 spy 裡 |
| 2 | 判準 RPC＋撤 `listings_delete_own` | 新 `api/listing-photo-orphans.test.ts`（DB：種 `storage.objects` 列照 `referral-invite-purge.test.ts` 的 `postgres` 直連；**呼叫 RPC 以 service_role 經 `adminClient.rpc`**）＋`api/rls-policies.test.ts` 改斷言 | 孤兒、寬限期內、本人引用、他人引用、非法 name、無刊登（帳號已刪）六種情境；`order by` 加 `limit` 結果穩定；統計欄位正確；anon／authenticated 呼叫被拒；authenticated 刪 `listings` 被 RLS 擋 |
| 3 | `sweepOrphanPhotos` 純函式 | `api/listing-photos.unit.test.ts` | RPC 出錯不刪；錨點失效與比例閘各自中止；`force_ratio` 只放行比例閘；dry-run 不呼叫 remove；二次檢查剔除新引用；切批 ≤100；中途失敗帶 `removedSoFar` |
| 4 | 端點 handler | `api/listing-photos.unit.test.ts`（注入 `verifyInternalSecret`／`sweep`／`publicBase`）＋讀 `index.ts` 原文斷言路由有註冊 | 無密鑰或錯密鑰 401；`dry_run` 缺漏、`"false"`、非 boolean 都當 dry-run；只有 `false` 才實刪；500 形狀與 `removedSoFar` |
| 5 | 排程 workflow | `python3 scripts/check-workflows.py`＋實作 session 用 `actions_run_trigger` 對 develop dispatch 一次 dry-run（真環境的 RPC 權限與密鑰驗證） | check 綠；dispatch 回 200 且形狀斷言通過；未設 `PHOTO_PURGE_LIVE` 時排程送出的是 `dry_run: true`（step log 可見） |
| 6 | 規格書 §11 改寫清理段（含終止請求 SOP）、刪 §14 第 14 列、`supabase/README.md` RLS 表 | `python3 scripts/check-spec-drift.py`（先跑一次，看措辭是否觸發抽取失配，必要時新增規則） | 綠；沒有「沒有 X」之類的旁白（document-writing.md） |

## 6. 開放問題

- [x] Q1 會籍到期 → W2-5：先不算，請律師確認。
- [x] Q2 撤 `listings_delete_own` → W2-6：撤，含 admin 分支。
- [x] Q3 密鑰 → W2-9：沿用 `RECONCILE_SECRET`。
- [x] Q4 cancel-signup 即時清理 → W2-9：不加。
- [x] Q5 寬限期 → W2-7：7 日，不加存檔前驗證。
- [x] Q6 舊 bucket → W2-9：10/28 業主已刪。
- [x] Q7 上線閘門 → W2-8：預設 dry-run，晉升後 3 日內核對，再開 `PHOTO_PURGE_LIVE`。
- [x] Q8 develop 排程 → W2-9：只做 dispatch。
- [ ] **Q9 終止／刪除請求的 SOP：刪「帳號」還是刪「刊登」？**（v2 新增，修正 W2-5 的作法）W2-5 寫「30 日內刪帳號」，
  但刪 auth user 會 cascade 抹除 `payment_orders`／`withdrawals`／`referral_edges`。`/auth/cancel-signup` 的守衛正是為了
  不讓已付款會員刪帳號而存在（`index.ts` grep `cancel-signup` 的註解）。條款十二也寫個資「保存至您終止本服務後一年止」。
  - (a) SOP＝30 日內在 Dashboard SQL Editor 執行 `delete from public.listings where user_id = '<uid>'`，照片由排程在
    「寬限期＋1 輪」內清掉；帳號與金流紀錄依條款十二保存一年後另行處理（不在本案範圍）。
  - (b) 照 W2-5 字面，30 日內刪帳號，接受金流稽核紀錄一併消失。
  - **建議 (a)**：條款十之一只要求內容下架，(a) 就滿足，而且不破壞帳務與推薦樹對帳。SOP 寫在規格書 §11「照片檔清理」段，
    只寫這一處；不寫進 `supabase-setup-checklist.md`，那份是環境設定清單，不是營運程序。

## 7. 風險與回滾

- **最壞情況是誤刪活照片**，而且 Storage 沒有備份可以還原。防線如下：
  1. 判準用 SQL 一次算完，有六種情境的 DB 測試。
  2. 雙斷路器：錨點失效、比例閘。
  3. 刪前逐 owner 二次引用檢查。
  4. 預設 dry-run：`dry_run` 只認 boolean `false`，排程另需 `PHOTO_PURGE_LIVE`。
  5. **上線程序**：
     1. 第 3 波合進 develop 後，在 develop dispatch 一次 dry-run，再 dispatch 實刪一次。
     2. 11/10 晉升、正式站部署核准後，排程每日跑 dry-run，結果在 Actions step summary。
     3. **業主在 11/13 前**核對最近一輪的候選清單（抽查幾個 path 確認對應的帳號已刪或刊登已改），再設
        `PHOTO_PURGE_LIVE=true`。
     4. 若 11/13 前業主無法核對，主 session 要在 11/20 前升級處理：直接問業主「開實刪」還是「延後」，並附上剩餘天數。
        最早的期限是 11/27。
- 次壞是排程靜默不跑，條款窗口過期。防線：形狀斷言＋失敗開 issue；三十日窗口扣掉寬限期，還能容許約兩週的連續失敗。
- 回滾：
  - 把 `PHOTO_PURGE_LIVE` 設為空，立即回到 dry-run（不用改程式）。
  - 停用 workflow，就完全停止。
  - revert PR 可撤端點與 RPC。撤掉的 policy 要用新 migration 補回。
  - 已刪的檔無法回滾，所以實際的回滾手段是「先 dry-run」。
