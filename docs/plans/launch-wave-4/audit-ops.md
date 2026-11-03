# 第 4 波稽核：後台、排程與資料安全（AU-ops）
<!-- plans-keep: 第 4 波稽核報告；退場條件＝第 5 波審查 session 依第 5 波 plan 處置後刪除 -->

- 裁決：plan.md W4-30。唯讀稽核，不改產品碼。
- 審查對象：`origin/main`＝`f88bae5`（正式站）。下文所有行號都以 main 為準，路徑相對於 repo 根目錄。
- 範圍：規格書 §13（後台、掃碼驗證、公告）、§3 功能旗標、§11 照片清理、告警與排程、全站資料安全（越權、RLS、security definer、Storage、PII、CORS、限流）。
- 已排除：
  - §14 已列的落差（#4、#8–#13）不重報。
  - H1 的推薦碼暫存不重報。
  - GitHub 排程被跳過由 W4-25 處理。
  - 本機 storage 鍵的跨使用者殘留屬 auth 組（`withdrawalBankData`／`pendingUser` 已由 `clearAccountLocalState` 在登出與換帳號時清除，`src/App.tsx:190-198`）。
- 方法：
  - 核心端點由我本人逐行讀過。
  - 「migration 最終權限狀態」與「workflow 失敗路徑」各派一個子 agent 全掃。
  - 子 agent 的每條發現，我都回原始碼核過才收錄。

## §1 發現

### P0

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P0-1 | `.github/workflows/deploy-supabase.yml:22-25,51,66-78,262` | Edge Function 部署 workflow 的觸發信任邊界有缺口：不夠嚴格的條件下，非本 repo 的程式碼可能在帶部署憑證的 job 裡執行。**是否真能被利用，取決於兩項 repo 設定**：fork PR 的 workflow 核准政策、`develop` 環境的 required reviewer。利用細節已私下回報主 session（repo 為 public，修好前不在此展開）。 | job 加觸發來源條件；把部署憑證從 job 層 env 收到只有需要它的 step；失敗通知不要取用被部署 ref 裡的本地 action。修法屬 workflow，合進 develop 即生效。 | 無（`check-workflows.py` 沒有這條規則） |

### P1

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P1-1 | `src/utils/csv.ts:24-33`、`src/components/admin/WithdrawalManagement.tsx:682` | 提領 CSV 的銀行帳號以純數字字串寫出，Excel 開檔時會當成數字：<br>• `0081234567890` 變成 `81234567890`，前導 0 被吃掉<br>• 超過 15 位的帳號尾數歸零，或顯示為 `1.23457E+15`<br>規格 §13 寫明這份匯出是匯款清單，照它匯款會打錯帳號。多半是被銀行退回，最壞是匯進別人的帳號。 | 銀行帳號（與代號）以 `="0081234567890"` 形式輸出，或改成 Excel 會保留文字的格式；也可以在匯出說明加警語。`escapeCsvField` 要能區分「文字型數字欄」。 | 無（`src/utils/csv.test.ts` 沒有前導 0 或長數字的案例） |
| P1-2 | `supabase/functions/api/index.ts:4476-4510` | `POST /listings/upload-photo` 只做 `requireAuth`：<br>• 沒有限流，沒有每人配額<br>• 不要求會籍：未付款註冊者、停權者、會籍過期者都能傳<br>• 寫入的是**公開** bucket `listings-photos`<br>• MIME 只看用戶端宣告的 `file.type`<br>任何人用 OTP 開帳號後，就能無限上傳 5MB 的任意位元組，換得一個公開 URL（免費圖床、違法內容掛在本站 Supabase 網域、Storage 費用）。排程清理要等 7 日寬限期，而且 `PHOTO_PURGE_LIVE` 沒開時不實刪。 | 加 per-user 限流（例如 30 張／小時）、每人未引用檔數上限；考慮要求「已付款或註冊中且已付款」；用 magic bytes 驗格式。 | `listings.test.ts:60,69,87,107` 只測未驗證、無檔、類型、大小；限流與會籍皆無 |
| P1-3 | `supabase/functions/api/index.ts:2804-2814,2933`、`.github/workflows/reconcile-payments.yml:95-112` | 對帳查詢 PayUni 時，每張單的例外只記 `warning` 並 `queryErrors++`，端點仍回 `success:true`。workflow 只斷言 `checked/resolved/stillPending`，不看 `queryErrors`；`/internal/system-alerts/recent` 只推 `error`。<br>系統性故障時（PayUni 查詢 API 改版或 403、查詢憑證缺漏），50 張單每小時全部失敗，卻是綠 run、沒有 issue、沒有 LINE。已付款的會員一直卡在待開通。<br>單張降級成 warning 是刻意的（註解 #460 P1-3），但「整批失敗」從來沒有被升級。 | 端點在 `queryErrors === checked && checked > 0` 時，寫一筆 `logSystemAlertOnce(..., 'error')`，或回非 2xx；workflow 加 `queryErrors` 斷言。 | 無（`reconcile-pending-payments.test.ts` 沒有全滅案例；workflow 無測試） |

### P2

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P2-1 | `supabase/migrations/20260719000004_registration_step_zero_when_profile_incomplete.sql:41-72`（首建於 `20260620000011:29-49`） | `effective_registration_step(uuid)` 是 `security definer`，從未 `revoke ... from anon, public`。持 anon key 的任何人打 `POST /rest/v1/rpc/effective_registration_step`，就能查到任意 uid 的註冊／付款進度（0–3）。uid 會經 `public_listings.user_id` 外流。只有 Edge Function 以 service_role 呼叫它（`index.ts:560,4630`）。 | 新 migration：`revoke execute ... from anon, authenticated, public`，保留 service_role。 | 無 |
| P2-2 | 全部 security definer 函式 | 有近 20 支 definer 函式只靠 revoke 擋 API 角色，而且函式內不驗 `p_admin_id`／`p_user_id`，例如 `admin_setup_claim`、`admin_update_withdrawal_status`、`process_successful_payment`、`complete_paid_pending_orders`、`log_system_alert`、`claim_referral_king_reward`。這些 revoke 目前都正確，但沒有測試守著。哪天有人 `create or replace` 後漏寫 revoke（P2-1 就是實例），一般會員就能直呼 RPC 給自己發錢或升管理員。 | 加一支全域掃描測試：`pg_proc` 裡 `prosecdef` 且在 `public` 的函式，anon／authenticated 的 EXECUTE 必須落在白名單（`is_admin`→authenticated、`has_active_subscription`→anon+authenticated、`referral_tree`→authenticated）。 | 只有個別函式的 GRANT 測試（見 §2），沒有全域掃描 |
| P2-3 | `supabase/functions/api/index.ts:322-325,1756-1786`、`src/components/RequireMembershipRoute.tsx:52` | `isAdminUser` 只看 `is_admin`，不看 `suspended_at`，前端也明確對管理員豁免停權。停權一位管理員沒有任何效果，他還能對自己打 `POST /admin/members/<自己>/suspend {suspend:false}` 解除（handler 只擋「停權自己」，不擋「解除自己」）。另外停權／解除沒有稽核紀錄（誰、何時）。 | 二擇一：規格寫明「管理員用撤銷而非停權」並在 UI 對管理員隱藏停權鈕；或讓 admin 守門也擋停權者。另補停權事件紀錄。 | 無 |
| P2-4 | `supabase/functions/api/admin-gate.test.ts:36-50` | 守門的權威清單 `ADMIN_ROUTES` 漏了 4 條寫入端點：`POST /admin/withdrawals/:id/status`、`POST /admin/members/:id/suspend`、`DELETE /admin/announcements/:id`、`POST /admin/system-alerts/:id/resolve`。目前有 `app.use('/admin/*')` 的 middleware 罩著（`index.ts:1244-1249`），實際沒有漏洞；但清單是手抄的，檔頭自己也承認「漏加一條這裡不會紅」。 | 改成從 `app.routes` 自動列出所有 `/api/admin/` 路由去打。 | 本條就是測試本身的缺口 |
| P2-5 | `supabase/functions/api/index.ts:2388-2398,2451-2453` | `logSystemAlert`／`logSystemAlertOnce` 沒檢查 `insert` 回傳的 `{ error }`。supabase-js 不擲例外，所以 catch 永遠接不到：告警寫失敗時連 `console.error` 都沒有，靜默遺失。 | 檢查 `error` 並 `console.error`。 | 無 |
| P2-6 | `.github/workflows/reconcile-payments.yml:127-131,143-148` | 告警推播的時間窗有兩處會漏推：<br>• 查「上次成功 run」的 `gh api` 失敗時，窗口退回固定 70 分鐘，run 仍是綠的。檔內自承排程的中位間隔約 1.7 小時，所以幾乎必漏。<br>• 端點回 404 時 `exit 0`，綠 run，窗口照樣往前推。<br>另外對帳步驟紅著時窗口不前進，同一批告警會每小時重推。 | `gh api` 失敗時改用上限 1440 分鐘（寧可重推）；404 只在明確的部署空窗內放行。 | `system-alerts-recent.test.ts` 只測端點本身；窗口計算無測試 |
| P2-7 | `.github/workflows/reconcile-payments.yml:118,176-218` | 告警查詢步驟失敗（401／5xx）也會觸發 `if: failure()`，開出「付款對帳排程失敗」issue，推「卡在 pending 的訂單不會被自動撿回」。但對帳本身其實成功，訊息誤導值班的人。 | 用 `steps.<id>.outcome` 區分是哪一步失敗。 | 無 |
| P2-8 | `.github/workflows/reconcile-payments.yml:183-186`、`deployment-queue-audit.yml:70`、`security.yml:57` | issue 去重用 `listForRepo`，沒帶 `per_page`，預設只取 30 筆，而且含 PR。open 的 issue／PR 超過 30 時找不到既有 issue，每小時開一張新的。reconcile 恢復後不會自動關 issue；一張舊的 open issue 會讓之後所有失敗都只留言（只剩 LINE 會響）。 | `per_page: 100` 並過濾 PR；恢復時留言或關閉。 | 無 |
| P2-9 | `purge-listing-photos.yml`、`deployment-queue-audit.yml`、`security.yml`、`journey.yml` | 這四條排程失敗只開 issue，不推 LINE。LINE token 過期也只在「有告警要推」時才會被發現，沒有定期健康檢查。`security.yml` 的 `deno audit --ignore-registry-errors`（`:79`）會把 registry 故障變成綠燈。 | 照片清理（條款三十日期限）失敗至少推 P2 LINE；加每週一次 LINE 測試推播。 | 無 |
| P2-10 | `.github/actions/notify/action.yml:74` | LINE 內文截在 200 字，對帳告警的明細與「另有 N 筆」常被截掉。總數在標題裡，不會遺失。 | 放寬到 LINE 上限或精簡內文。 | 無 |
| P2-11 | `supabase/functions/api/index.ts:4683-4691` | `/health` 的 `reward_config` 查詢錯誤在 `{ error }` 裡、不會擲出，結果回 `unset` 而不是註解要求的 `invalid`。 | 檢查 `error`。 | 無 |
| P2-12 | `supabase/migrations/20260620000002_rls_policies.sql:67-72`、`20260914000002_listings_role_grants.sql:36` | 會員可經 PostgREST 直接寫自己的 `listings`，不受欄位上限約束：DB 沒有名稱、介紹、照片張數的上限（只有類別 20 字 trigger），`photos` 可放任意外部 URL（首頁 `<img>` 會載入，可當追蹤像素），`created_at` 可改（影響依時間的排序）。只影響本人那一列，而且要會籍有效才看得到。 | DB 加 `check (char_length(name) <= …)`、`cardinality(photos) <= 3`，再加一條 trigger：`photos` 只允許本站 bucket 前綴、`created_at` 不可改。 | journey `45_listing_rls.feature` 守擁有權；欄位約束無 |
| P2-13 | `supabase/functions/api/index.ts:3047,3113` | PayUni notify／return 失敗時 `JSON.stringify(decrypted.data)` 整包寫進 Edge Function log，內容可能有卡號前六後四等交易欄位。log 只有專案成員看得到。 | 只記 `MerTradeNo`、`Status`、`TradeAmt`。 | 無 |
| P2-14 | `supabase/functions/api/index.ts:1325-1332` | `/admin/withdrawals` 的姓名搜尋查 `profiles` 失敗時，錯誤被忽略，變成「查無此人」空清單。這是 §14 #11 的同類，但 #11 沒列到搜尋這一支。 | 檢查 `error` 回 500。 | 無 |

## §2 覆蓋對照表

| 規格條目 | 實作位置（main） | 測試層與測試名 |
|---|---|---|
| §13 所有 `/admin/**` 統一守門 `requireAuth + is_admin` | `index.ts:1244-1249`（middleware）＋各 handler 重複檢查 | Deno `admin-gate.test.ts`「admin 守門：匿名請求一律 401」「一般會員一律 403」「管理員可正常存取」（清單漏 4 條，見 P2-4）；e2e `admin_dashboard.feature`「A logged-in non-admin is redirected away from /admin」 |
| §13 admin definer 函式 revoke anon/authenticated | `20260802000010:71`、`20260718000102:166`、`20261104000001:90,164`、`20260802000003:141`、`20260802000009:79`、`20260802000004:216`、`20260802000005:77`、`20260802000006:46` | Deno「GRANT：authenticated 不得 EXECUTE admin_set_member_admin」「…admin_list_members」「…admin_member_detail」（三支都只驗 authenticated，沒驗 anon）；`id-verification.test.ts`「GRANT：authenticated 不得 EXECUTE 證件審核相關函數」；`withdrawals.test.ts:706,845`；`admin_setup_claim`、`admin_update_withdrawal_status`：**無** |
| §13 `cannot_demote_self`／`last_admin` | `20260802000010` | Deno `admin-and-announcements.test.ts`「不能撤銷自己 → cannot_demote_self」「撤到系統零管理員 → last_admin」 |
| §13 第一位管理員 `/admin-setup/*`，已有管理員時拒絕 | `index.ts:1978-2017`、`admin_setup_claim` | Deno「AdminSetup：無管理員時可自助宣告；已有管理員後鎖死」；並發兩人同時宣告：**無** |
| §13 會員詳情的身分證與帳號遮罩 | `index.ts:1648-1706`（`maskNationalId`／`maskBankAccount`） | Deno「admin_member_detail：身分證與銀行帳號一律遮罩」 |
| §13 停權（§5.2） | `index.ts:1756-1786` | Deno「會員管理：列表含 email 與會籍；停權讓刊登從 public_listings 消失」、`suspension-guards.test.ts`；停權管理員：**無**（P2-3） |
| §13 提領 CSV 匯出（含公式注入） | `src/utils/csv.ts`、`WithdrawalManagement.tsx:640-700` | vitest `csv.test.ts`「以等號開頭時加前導單引號擋公式注入」等 15 支；前導 0：**無**（P1-1）；`withdrawalExport.test.ts` 守分頁核對 |
| §13 後台快取只在記憶體 | `src/components/admin/adminCache.ts` | vitest `adminCache.test.ts`；e2e `admin_dashboard.feature`「Returning to a visited tab shows the previous list at once while it refreshes」 |
| §13 系統告警檢視／處理 | `index.ts:1259-1291` | Deno `system-alerts-api.test.ts` 兩支；e2e「The system alerts tab lists unresolved alerts and resolving clears them」 |
| §13 公告 CRUD、前台只回生效中 | `index.ts:1881-1976` | Deno「全站公告：admin 建立/刪除；/announcements/active 只回生效中」；前台 XSS：React 跳脫，全 `src` 無 `dangerouslySetInnerHTML`（以 grep 確認） |
| §13.1 掃碼驗證：資格、限流、遮罩、稽核 fail-closed | `index.ts:3258-3383` | Deno `member-verify.test.ts` 10 支（掃描者過期／停權 403、429、遮罩、管理員全名、token 過期不留稽核、匿名 401）；稽核寫入失敗→500：**無** |
| §13.1 缺 `MEMBER_TOKEN_SECRET` fail-closed | `member-token.ts`、`index.ts:3268-3272,3325-3329` | Deno `member-token.unit.test.ts` |
| §3 功能旗標 `/admin/features` | `index.ts:1297-1306`（硬編，§14 #4） | Deno `admin-gate.test.ts`（守門） |
| §11 即時清理：只刪本人、引用 fail-closed | `listing-photos.ts:45-112,326-405` | Deno `listing-photos.test.ts` 6 支；`listing-photos.unit.test.ts` |
| §11 `listings` 不開放直刪 | `20261110000001:146` | Deno `listing-photo-orphans.test.ts`「撤 listings_delete_own 後本人直刪影響零列、列仍在」；journey `45_listing_rls.feature`「會員刪除他人刊登影響零列且該列仍在」 |
| §11 排程清理：寬限期、斷路器、dry-run 預設、uid 不進 log | `listing-photos.ts:197-268,346-382`、`purge-listing-photos.yml` | Deno `listing-photo-orphans.test.ts` 8 支；`scripts/purge-listing-photos-request.py --self-test`（framework-check）；失敗推 LINE：**無**（P2-9） |
| §11 照片上傳格式與大小 | `index.ts:4476-4510` | Deno `listings.test.ts:60-130` 四支；限流、會籍、magic bytes：**無**（P1-2） |
| §11 刊登可見性＝`has_active_subscription` | `0004:30`、`public_listings`（security_invoker） | Deno `listings.test.ts`「public_listings：有效會員的刊登可見、未付款會員的不可見」「停權後該會員的刊登消失」「對外可見欄位是白名單」；`rls-policies.test.ts` 9 支；journey `45_listing_rls.feature` 11 個情境 |
| §2.2 `authenticated` 對 `profiles` 無 UPDATE | `0009:23`、`20261017000003:33` | Deno `registration-completion-guard.test.ts`「GRANT：authenticated 對 profiles 沒有任何欄位的 UPDATE 權限」 |
| 全表 RLS 與 policy（listings 以外） | `0002`、`20260726000001` | **無**（只有 `withdrawal_events` 有 GRANT 測試，`withdrawals.test.ts:548`） |
| definer 函式不開放 anon（全域） | — | **無**（P2-1、P2-2） |
| 私有 bucket（id-cards、referral-signatures） | `20260716000003:9`、`20260718000101:58` | Deno `storage-buckets-private.test.ts` 兩支；正式站 Dashboard 手設的 `storage.objects` policy 無法從 repo 驗證 |
| CORS | `index.ts:93-129` | Deno `cors-origin.unit.test.ts` 8 支、`hardening.unit.test.ts:54` |
| `/internal/*` 密鑰 fail-closed | `index.ts:2910-2913,2954-2957`、`listing-photos.ts:347` | Deno `hardening.unit.test.ts`「internal reconcile：錯誤密鑰 401、未設密鑰 fail-closed」、`system-alerts-recent.test.ts`「缺密鑰或密鑰錯誤回 401」、`listing-photo-orphans.test.ts:281` |
| 限流（check-email、verify、invite、delete） | `index.ts:260-337`、`listing-photos.ts:288-289` | Deno `check-email-rate-limit.test.ts`、`rate-limit.unit.test.ts`、`member-verify.test.ts:251`、`refund-rate-limit.test.ts`；upload-photo：**無** |
| 告警：error 由對帳排程推 LINE | `reconcile-payments.yml:118-248`、`.github/actions/notify` | Deno `system-alerts-recent.test.ts` 三支；workflow 的窗口、404、LINE 前置檢查：**無** |
| 部署 workflow 的觸發信任邊界 | `deploy-supabase.yml` | **無**（P0-1） |

## §3 建議補的測試（依風險排序）

1. **workflow 規則**：`check-workflows.py` 加兩條規則：
   - 凡是 `workflow_run` 觸發又帶 secrets 的 job，必須檢查觸發事件與來源 repo；
   - 帶部署憑證的 job 不得 `uses: ./`（被部署 ref 的本地 action）。

   守 P0-1。
2. **Deno：definer 函式 EXECUTE 全域掃描**（白名單制），同時驗 anon 與 authenticated。守 P2-1 與 P2-2，也一次補齊 §2 列為「無」的 18 支函式。
3. **vitest：`csv.test.ts` 加銀行帳號案例**：前導 0、16 位帳號在匯出後仍是文字。守 P1-1。
4. **Deno：對帳查詢全滅**：注入一個一律擲錯的 `queryPayUniTradeStatus`，斷言會寫一筆 error 告警，或回非 2xx。守 P1-3。
5. **Deno：upload-photo 限流與會籍**，等修法定案後補。守 P1-2。
6. **Deno：`admin-gate.test.ts` 改為從 `app.routes` 自動列舉**。守 P2-4。
7. **Deno：全表 RLS 快照**：每張表的 `relrowsecurity` 與 policy 集合做 golden 比對，比照 listings 現有的做法。
8. **Deno：`logSystemAlert` 寫入失敗會留 log**；`/members/verify` 稽核寫入失敗回 500。
9. **pytest 或 shell self-test：reconcile workflow 的窗口計算**，以及 404／`gh api` 失敗時的分支。

## §4 被反駁推翻或降級的

| 原假設 | 結論 | 理由 |
|---|---|---|
| definer 函式 `search_path = public` 沒有尾隨 `pg_temp`，可被劫持 | 推翻 | API 角色經 PostgREST 不能建 temp 物件或做 DDL，函式內也有 schema 限定 |
| `admin_set_member_admin` 等函式不驗呼叫者，一般會員可直呼 | 推翻（現況） | 最終權限已 revoke anon、authenticated、public；降為 P2-2 的「缺測試守著」 |
| `referral_tree` 對 anon 的 `auth.uid()` 是 NULL，權限檢查會被略過 | 推翻（現況） | anon 沒有 EXECUTE（`20260620000005:45`）；屬潛在風險 |
| `has_active_subscription(uuid)` 開給 anon 是會籍查詢 oracle | 降為資訊 | `listings_select_public` 與 `public_listings` 需要它；對外可見的刊登本來就代表有效會員 |
| anon 保留 profiles 等表的預設寫入權 | 推翻 | 沒有任何 permissive policy 適用於 anon，RLS 擋下 |
| 用戶 A 可寫或刪用戶 B 的 Storage 物件 | 推翻 | `storage.objects` 沒有任何 policy，上傳一律經 Edge Function 以 service_role 寫 `${user.id}/…`；刪除有前綴驗證（`listing-photos.ts:45-70`） |
| bucket 沒設 `allowed_mime_types` | 降級，併入 P1-2 | 上傳只經 Edge Function 的 MIME 檢查 |
| 對帳回應印進公開 Actions log，洩漏會員 uid（`reconcile-payments.yml:91`） | 降級（不列） | 會印出訂單 UUID 與 `sqlerrm`；唯一含 user_id 的錯誤訊息在 heal 路徑到不了（該列已鎖定且同一使用者） |
| `handle_new_user` 從 signup metadata 寫 phone、national_id | 降為資訊 | 只影響註冊者本人那一列，之後 `register_profile` 會覆寫；`national_id` 無唯一約束，搶佔不了他人 |
| `ServiceProviderDetail` 聯絡方式可組出外站或 `javascript:` 連結 | 推翻 | 一律前綴 `https://facebook.com/`、`instagram.com/`、`line.me/R/ti/p/`，值只落在 path |
| 公告內容 XSS | 推翻 | React 預設跳脫，全 `src` 無 `dangerouslySetInnerHTML` |
| 後台快取把未遮罩 PII 落到瀏覽器儲存 | 推翻 | `adminCache.ts` 只在記憶體，隨 `AdminConsole` 卸載 |
| `/admin/*` 大小寫或結尾斜線可繞過 middleware | 推翻 | Hono 大小寫敏感：大小寫不同的路徑本來就不會命中路由（404）；結尾斜線一樣命中 `/admin/*` middleware |
| 排程逾時會跳過 `if: failure()` 的告警步驟（`reconcile-payments.yml:38`） | 未驗證，不列 | 需要確認 GitHub 對 job timeout 的 `failure()` 語意；最壞情況 run 仍是紅的 |
| deploy-smoke 從 `deployment_status` 觸發時，把正式站失敗標成 develop | 不列 | 每 6 小時的排程 run 會以 P1 正確覆蓋正式站，影響只在告警分級 |
