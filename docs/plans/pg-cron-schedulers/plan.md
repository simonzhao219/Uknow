# 對帳與照片清理改由 pg_cron 觸發 規劃書

<!-- 第 5 波 S1（plan.md §2；裁決 W4-25、W5-4）。行號以 develop 3a7f506 為準，施工時現算。 -->

## 0. 一句話

讓**付了錢卻卡在 pending 的會員**在一小時內被對帳撿回、讓刊登照片按時下架。
做法是把觸發從 GitHub 排程改到 Supabase pg_cron：GitHub 排程會大量跳過，24 小時只跑了 3 次（應 24 次），照片清理晚了 6 小時 20 分，首輪整次沒跑。

## 1. 使用者需求

- 依據：`launch-wave-4/plan.md` §8 的 11/02 04:50、11/03 18:40 兩列；`review.md` §5-6；`reconcile-payments.yml` 檔頭自承「152 次實測間隔中位數 1.7h、最大 6.3h」。
  規格書 §11「照片檔清理」（三十日下架、安全閘）；`supabase/README.md`〈告警 severity〉。
- 驗收情境：
  1. 正式站 24 小時內，對帳由 pg_cron 觸發且成功 ≥ 23 次，相鄰兩次成功的間隔都 ≤ 70 分鐘（量法見 §2.6）。
  2. 照片清理每日一次，由 pg_cron 在 UTC 19:17（台北 03:17）觸發；正式站實刪、develop 只列候選。
  3. pg_cron 停擺、Vault 沒設、Edge Function 回錯時，2 小時內有 LINE 告警；GitHub 排程會自動補跑對帳，不需要人改 workflow。
  4. **ops P1-3**：PayUni 查詢在一輪中全部失敗時，排程要紅（端點非 2xx）並推 LINE；超過一半失敗時也要推 LINE。
  5. **pay P1-3**：PayUni 回了碼表外的 `TradeStatus`（不是 0／1／2／3）或缺欄位、或 `Result` 陣列裡找不到同號交易時，訂單**永不**被自動標 expired，且寫 error 告警（會推 LINE）。
- 不做什麼：
  - 不把 LINE 推播搬進 Edge Function（見 §6 Q2 的丙案，列第 6 波候選）。
  - 不改對帳與清理本身的業務規則（門檻 20 分鐘、批次 50、expire 4 天、寬限期 168 小時、斷路器）。
  - 不修 ops P2-6～P2-9 的 workflow 枝節，除非改寫時順帶消失（P2-7 誤報、P2-9 照片清理無 LINE 會順帶消失，見 §2.5）。
  - heal pass 失敗只寫 console（pay P2-14，已記債）：列 §6 Q4，預設不收。

## 2. 系統設計

### 2.1 資料流（改後）

```
pg_cron（每個環境的 DB 各自跑）
  ├─ 'reconcile-pending-payments'   '7 * * * *'  → public.invoke_internal_endpoint('reconcile')
  └─ 'purge-orphan-listing-photos'  '17 19 * * *' → public.invoke_internal_endpoint('purge-photos')
         │  讀 Vault：uknow_api_base_url、uknow_internal_secret；缺任一 → 直接 return（不送請求）
         ▼
  net.http_post（pg_net，非同步；timeout 150 秒）
         ▼
  Edge Function 既有端點（x-internal-secret 驗證不變）
    POST /internal/reconcile-pending-payments   body {"trigger":"pg_cron"}
    POST /internal/purge-orphan-listing-photos  body {"trigger":"pg_cron"}
         │  開頭：begin_scheduled_run(job, trigger) 取租約（同 job 已在跑 → 回 200 skipped）
         │  結尾：finish_scheduled_run(id, status, summary, error_code)
         ▼
  public.scheduled_job_runs（帳本；看門狗與準時度量測都讀這張）

GitHub（只打正式站）
  reconcile-payments.yml  每小時：看門狗＋system_alerts 推 LINE＋必要時補跑對帳（§2.5）
  purge-listing-photos.yml 每日：看門狗＋必要時補跑清理；workflow_dispatch 行為不變
```

**沿用既有端點路徑**（不新增 `/internal/scheduled/*`）：晉升時 migration 由 Supabase 整合**立即**套用，Edge Function 部署要等業主核准 `production`。
這段空窗內 pg_cron 打到的是舊版端點：舊對帳忽略 body，照常跑；舊清理把沒有 `dry_run:false` 的 body 當 dry-run，不會誤刪。新路徑會在空窗內 404。

### 2.2 憑證（必答 1）

| 案 | 做法 | 取捨 |
|---|---|---|
| **甲（建議）** | Vault 存兩筆：`uknow_api_base_url`（`https://<ref>.supabase.co/functions/v1/api`）、`uknow_internal_secret`（＝該環境 Edge 的 `RECONCILE_SECRET`）。沿用 `x-internal-secret` 驗證 | 端點零改動；代價是同一把密鑰存兩處，輪替時要兩處一起改（不一致 → 401 → 看門狗 2 小時內告警） |
| 乙 | 新密鑰 `CRON_SECRET`，端點同時接受兩把 | 能和 GitHub 那把分開輪替；多一把要管，現在沒有分開輪替的需求 |
| 丙 | Vault 存 service_role key，端點驗 JWT role | 外洩後果最大（能繞過全部 RLS），端點也要新寫驗證；不採 |

- **不寫進 migration**：migration 只建 `invoke_internal_endpoint()` 與排程；Vault 值由人在各環境的 SQL Editor 執行一次
  `select vault.create_secret('<值>', 'uknow_internal_secret');`（SOP 寫進 `docs/supabase-setup-checklist.md`）。
- **逐環境**：正式站、develop 各設一次，值不同（URL 不同；密鑰照現行規則與正式站同值）。拋棄式 journey 分支不設 → 排程空轉（§2.4）。
- `invoke_internal_endpoint`：`security definer`、`set search_path = public`，revoke anon／authenticated／public（照 `supabase/README.md`〈慣例〉）。
  job 名稱只接受白名單（`reconcile`、`purge-photos`）對應到固定路徑，不接受任意 URL。
- 密鑰會進 `net.http_request_queue`（送出前暫存）；`net._http_response` 只存回應。兩者在 Supabase 預設只有 postgres／service_role 讀得到，施工時以測試釘住 anon／authenticated 讀不到（§5 階段 1）。

### 2.3 環境（必答 2）

- 正式站與 develop **都跑**，這是對的：develop 是可安全驗證的真後端（CLAUDE.md），對帳打 PayUni sandbox，兩邊的資料各自獨立。
- 照片清理的實刪開關：pg_cron 觸發（`trigger:"pg_cron"`）時，端點**只看 Edge secret `PHOTO_PURGE_LIVE`**，`=== 'true'` 才實刪，缺了就 dry-run。
  正式站設 `true`、develop 不設 → 維持「正式站實刪、develop dry-run」。fail-safe：沒設就不刪。
  - repo variable `PHOTO_PURGE_LIVE` 繼續管 GitHub 路徑（dispatch 與補跑），B1～B4 不變。兩個開關的不一致由看門狗檢查：
    正式站帳本最近一輪 `dryRun=true`，而 repo var 為 `true` → warning（LINE 不推，step summary 標出來）。→ §6 Q3
  - **新的業主待辦**：正式站 Supabase Secrets 加 `PHOTO_PURGE_LIVE=true`；正式站與 develop 各在 SQL Editor 建兩筆 Vault secret。
- develop 照片清理的比例閘常被觸發（規格書 §11）：pg_cron 每日 dry-run 會在 develop 寫 `circuit_open` 失敗列；develop 的告警不推 LINE（看門狗只打正式站），可接受。

### 2.4 冪等與重疊（必答 3）

- **租約**：新表 `scheduled_job_runs` 加 partial unique index `(job) where status = 'running'`。
  `begin_scheduled_run(job, trigger)` 先把同 job 超過 15 分鐘的 `running` 列改成 `abandoned`，再 insert；撞 unique → 回 null，端點回 `200 {success:true, data:{skipped:'concurrent'}}`。
  pg_cron、GitHub 補跑、人工 dispatch 同時打進來，只有一個真的做事。
- 沒有租約時的冪等（租約失效時的底線）：
  - 對帳：收斂走 `process_successful_payment`（profiles 列鎖、已收斂的單離開 pending），標 expired 帶 `.eq('status','pending')` 條件，告警用 `logSystemAlertOnce` → 重疊只多查幾次 PayUni，不重複開通。
  - 清理：同一物件被兩輪刪，第二輪刪不到。**施工時要確認** Storage `remove()` 對不存在的物件是回成功還是算進 `notRemoved`（會讓 J3 誤紅）——租約就是為了不依賴這一點。
- 拋棄式 journey 分支：Vault 沒值 → `invoke_internal_endpoint` 直接 return，不送請求、不寫帳本。journey 的對帳劇本照舊由測試直接打端點。

### 2.5 可觀測（必答 4）與 GitHub workflow 的角色

GitHub workflow 的角色比較了三案：

| 案 | GitHub workflow 做什麼 | 結論 |
|---|---|---|
| 甲 | 拿掉 schedule，只留 dispatch | **不行**：system_alerts → LINE 推播現在只掛在 reconcile 排程上，拿掉就沒人推；pg_cron 壞了也沒人知道 |
| **乙（建議）** | 保留 schedule，改當**看門狗＋後備觸發**：每小時查 `GET /internal/scheduler-health`；pg_cron 最近一次成功對帳距今 > 90 分鐘（或端點 404、帳本查不到）時，自己打對帳端點補跑，並推 LINE。system_alerts 推 LINE 照舊 | GitHub 跳過只會延後告警，不再延後對帳。過渡期（S1 合進 develop 到晉升之間）正式站還沒有 pg_cron → 每小時都會補跑，行為等同現在 |
| 丙 | LINE 推播搬進 Edge（pg_cron 每小時呼叫），GitHub 只當死人開關 | 告警路徑不靠 GitHub；但 LINE token 要進每個環境的 Supabase Secrets、要加 `notified_at` 欄。範圍大，列第 6 波候選 |

**為什麼過渡期不能直接拿掉 schedule**：GitHub 的排程跑的是**預設分支（develop）**上的 workflow，而正式站的 pg_cron 要等晉升才有。
S1 合進 develop 那一刻拿掉 schedule，正式站會有好幾天沒有任何對帳。乙案的「> 90 分鐘就補跑」讓這段空窗自動被 GitHub 接住。

`GET /internal/scheduler-health`（`x-internal-secret` 驗證）回傳每個 job 的：最近一次成功的時間與 trigger、24 小時內成功／失敗／skipped 次數、
最近一次失敗的 `error_code`，以及 pg_net 最近 24 小時非 2xx／逾時的請求數（`net._http_response` 由一支 definer RPC 彙總，PostgREST 讀不到 net schema）。

**看門狗判準**（reconcile-payments.yml，正式站）：

| 狀況 | 動作 |
|---|---|
| reconcile 最近成功 ≤ 90 分鐘 | 不補跑 |
| > 90 分鐘、或 health 404（Edge 尚未部署）、或帳本沒有任何 pg_cron 列 | 補跑對帳（`trigger:"github"`）；**有 pg_cron 列卻停了**才推 LINE P1「pg_cron 對帳停擺，已由 GitHub 補跑」 |
| purge-photos 最近成功 > 26 小時 | 推 LINE P2（照片清理的看門狗併在這支，每小時檢查一次，不靠每日排程準時） |
| pg_net 24 小時內有非 2xx | 推 LINE P1，附數量與最近的 status code |
| 對帳步驟失敗 vs 告警步驟失敗 | issue 與 LINE 文案用 `steps.<id>.outcome` 分開（順帶修 ops P2-7） |

purge-listing-photos.yml：每日排程改成「帳本最近一次成功 > 26 小時才補跑」，dispatch 行為與 B1～B4 完全不變。

**端點側告警**（pg_cron 路徑沒有 GitHub issue，所以失敗要寫進 system_alerts）：

- 對帳（ops P1-3）：`checked > 0 && queryErrors === checked` → `logSystemAlertOnce('reconcile-pending-payments', {reason:'query_all_failed', hour:<UTC 小時桶>}, …, 'error')`，
  回 `502 {success:false, error:{code:'query_all_failed'}, data:summary}`，帳本 `failed`。
  `checked >= 2 && queryErrors * 2 > checked` → 同樣的 error 告警（`reason:'query_majority_failed'`），仍回 200，帳本 `succeeded` 並在 summary 標 `degraded:true`。
  小時桶的理由同既有的 burst 告警：沒人 resolve 時，下一小時會再推一次。
- 對帳（pay P1-3）：`queryPayUniTradeStatus` 的回傳多一種 `{stillProcessing:true, unknownStatus:{tradeStatus, reason}}`，
  reason 是 `unknown_code`、`missing_field`、`no_matching_trade` 之一。只有 `TradeStatus === '0'` 才算「確認未付款」。
  迴圈遇到 `unknownStatus`：**不論天數都不標 expired**、不計入 `stillPending`（另計 `unknownStatus` 計數），並寫
  `logSystemAlertOnce('reconcile-pending-payments', {reason:'unknown_trade_status', tradeNo}, …, 'error')`，訊息寫「請人工向 PayUni 確認」。
- 清理：pg_cron 觸發且失敗（斷路器、`sweep_failed`、`notRemoved > 0`）→ error 告警，按 `error_code` 加 UTC 日期桶去重。正式站才推 LINE（看門狗只撈正式站）。

### 2.6 準時度量測（W4-26，晉升後 24～48 小時由主 session 跑）

```sql
-- ① pg_cron 有沒有準時啟動
select j.jobname, d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname in ('reconcile-pending-payments','purge-orphan-listing-photos')
  and d.start_time > now() - interval '24 hours' order by d.start_time;
-- ② 端點有沒有真的做完（帳本）
select job, trigger, status, started_at, finished_at, error_code, summary
from public.scheduled_job_runs where started_at > now() - interval '24 hours' order by started_at;
-- ③ pg_net 傳輸層
select status_code, timed_out, error_msg, count(*) from net._http_response
where created > now() - interval '24 hours' group by 1,2,3;
```

**達標**：① reconcile 24 列且全 `succeeded`，`start_time` 與排程分鐘差 ≤ 1 分鐘；purge 1 列。
② reconcile 的 pg_cron 列 `succeeded` ≥ 23，相鄰成功間隔最大 ≤ 70 分鐘；GitHub 補跑 0 次（`trigger='github'`）。正式站 purge `summary->>'dryRun' = 'false'`。
③ 非 200 為 0、`timed_out` 為 0。

### 2.7 資料庫變更（一支 migration）

- `create extension if not exists pg_net with schema extensions;`（pg_cron 已由 `20261017000001` 啟用；`supabase_vault` 是 Supabase 預設擴充，施工時在 CI 的 `supabase start` 確認）
- 表 `public.scheduled_job_runs(id bigint identity, job text check in (...), trigger text check in ('pg_cron','github','manual'), status text check in ('running','succeeded','failed','skipped','abandoned'), started_at, finished_at, error_code text, summary jsonb)`；
  RLS 開、無 policy（只給 service_role）；`(job, started_at desc)` 索引；partial unique `(job) where status='running'`。
  帳本會無限長：90 天前的列由既有 `prune-rate-limits` 那類 pg_cron 清掉（同一支 migration 加一個 `prune-scheduled-job-runs` 排程，每日）。
- 函式：`invoke_internal_endpoint(text)`、`begin_scheduled_run(text, text)`、`finish_scheduled_run(bigint, text, jsonb, text)`、`scheduler_health()`；全部 definer＋revoke。
- `cron.schedule('reconcile-pending-payments', '7 * * * *', …)`、`cron.schedule('purge-orphan-listing-photos', '17 19 * * *', …)`：以 job 名稱 upsert，重跑 migration 不會重複。
  對帳取第 7 分避開整點尖峰，也和 `prune-rate-limits` 的第 17 分錯開。
- 正式站既有資料：只新增物件，不動既有表。`cron.job` 多三列。

## 3. 架構影響

- `index.ts` 第 7 區段（金流）：對帳 handler 包帳本與租約、全滅／過半判斷；`queryPayUniTradeStatus` 的未知狀態；新 `GET /internal/scheduler-health` 放在 `/internal/system-alerts/recent` 旁邊。
  和 S2 改的 prepare／register／cancel-signup 不同區，撞檔只在 rebase 時處理。
- `listing-photos.ts`：`purgeOrphans` 接 `trigger`，pg_cron 觸發時讀 `PHOTO_PURGE_LIVE`；租約與帳本由 deps 注入（維持現行可測的 deps 形狀）。
- `_shared/api-contract.ts`：這幾支是 internal 端點，現在不在契約裡，維持不加。
- workflow：兩支都還有 `schedule:`，8b 的 `頻率依據:` 改寫成「看門狗＋後備觸發」的理由；決策邏輯抽到 `scripts/scheduler-watchdog.py`（純函式＋`--self-test`，照 `purge-listing-photos-request.py` 的慣例，接進 framework-check）。
- 安全：Vault 只有 definer 函式讀；`invoke_internal_endpoint` 只能打白名單路徑；帳本 `summary` 不放 uid 或 name（清理不送 `include_names`）。
- 效能：pg_net 的請求在背景 worker 送，不佔 cron 連線。Edge Function wall clock 上限 150 秒（free）／400 秒（paid）；對帳 50 張 × PayUni 查詢通常在 30 秒內。pg_net 逾時設 150 秒，逾時只代表 pg_net 不等了，Edge 端的執行結果以帳本為準。

## 4. UI/UX

無前端變更。後台「系統告警」頁會多出 `query_all_failed`／`query_majority_failed`／`unknown_trade_status`／照片清理失敗幾種 error，訊息照既有寫法說明「要人做什麼」。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | migration：帳本表、租約 RPC、`invoke_internal_endpoint`、`scheduler_health`、三個 cron 排程 | `supabase/functions/api/scheduled-job-runs.test.ts`（D，真 Postgres） | 租約：同 job 第二次 begin 回 null、15 分鐘前的 running 改 abandoned；Vault 沒值時 invoke 不送請求（`net.http_request_queue` 沒有新列）、有值時送一列且路徑對；`cron.job` 有三個預期排程；anon／authenticated 不能 EXECUTE 四支函式、讀不到帳本、`vault.decrypted_secrets` 與 net 兩張表 |
| 2 | pay P1-3：未知 `TradeStatus`／缺欄位／`Result` 不含同號交易 → `unknownStatus`，永不標 expired，error 告警 | `payuni-query-alert.unit.test.ts`（D unit）、`reconcile-expire.test.ts`（D） | 建單 5 天、TradeStatus `'8'` → 訂單仍 pending、`system_alerts` 一筆 `unknown_trade_status` error；同一單第二輪不再寫第二筆；TradeStatus `'0'` 的既有 expire 案例不變 |
| 3 | ops P1-3：全滅 → 502＋error 告警；過半 → 200＋error 告警＋`degraded` | `reconcile-pending-payments.test.ts`（D，注入一律擲錯／半數擲錯的 queryFn） | 全滅：回應 502、`error.code='query_all_failed'`、一筆 error；過半：200、一筆 `query_majority_failed`；1/3 失敗：不告警（維持 #460 的 warning 決策） |
| 4 | 對帳 handler 接帳本與租約：`trigger` 寫入、併發第二個請求回 skipped、成功／失敗都 finish | `reconcile-pending-payments.test.ts`（D） | 兩個並行請求只有一個 `checked > 0`、另一個 `skipped:'concurrent'`；帳本兩種結局都有 finished_at；502 時帳本 `failed`＋`error_code` |
| 5 | 照片清理：`trigger:'pg_cron'` 時依 `PHOTO_PURGE_LIVE` 決定實刪、接帳本與租約、失敗寫 error 告警 | `listing-photos.unit.test.ts`（D unit，deps 注入）、`listing-photo-orphans.test.ts`（D） | env 未設＋pg_cron → dry-run 且 body 帶 `dry_run:false` 也不實刪；env `true`＋pg_cron → 實刪；dispatch 路徑（沒有 trigger）行為與現行完全相同；斷路器失敗 → 一筆 error |
| 6 | `GET /internal/scheduler-health` | `scheduler-health.test.ts`（D） | 401（無密鑰）；回應含兩個 job 的最近成功時間、24h 計數、pg_net 非 2xx 數；不回 summary 的明細 |
| 7 | 看門狗決策（純函式）：補跑、LINE、purge 26h、pg_net、開關不一致 | `scripts/scheduler-watchdog.py --self-test`（framework-check 跑） | 表格案例涵蓋 §2.5 每一列，含 404、帳本空、`gh`／health 查詢失敗時一律補跑（寧可多跑） |
| 8 | 兩支 workflow 改寫＋文件 | `check-workflows.py`、`check-spec-drift.py`、`check-migration-versions.py` | 8b 註記改寫；dispatch 的 B1～B4 案例照舊綠；`supabase/README.md`（排程表、告警 severity）、`supabase-setup-checklist.md`（Vault SOP、`PHOTO_PURGE_LIVE` secret）、規格書 §11 安全閘段同步 |

階段 2、3 不依賴 1，可先做（最貼近錢）。e2e 不受影響（全 mock，不碰 internal 端點）。journey 不加章節：pg_cron 在拋棄式分支上空轉，對帳劇本照舊直接打端點。

## 6. 開放問題（需要裁決）

- [ ] **Q1 憑證**：甲（Vault 存 URL＋現有 `RECONCILE_SECRET` 的副本）／乙（新密鑰 `CRON_SECRET`）。**建議甲**：端點零改動，輪替不一致時看門狗兩小時內會叫。
- [ ] **Q2 GitHub workflow 角色**：乙（看門狗＋後備觸發，保留每小時排程）／甲（只留 dispatch）／丙（LINE 推播搬進 Edge）。**建議乙**，丙列第 6 波候選。
- [ ] **Q3 照片清理實刪開關放哪**：Edge secret `PHOTO_PURGE_LIVE`（pg_cron 路徑）＋ repo var（GitHub 路徑），看門狗查兩者是否一致／統一改成只看 Edge secret（dispatch 的 B4 也改讀後端，repo var 退場）。
  **建議前者**：本波不動已審過的 B1～B4 與 W2-8／W3-8 的閘門；統一列第 6 波。
- [ ] **Q4 heal pass 失敗（pay P2-14，已記債）要不要一起收**：帳本已經有 `failed`／`degraded` 可以表達，改動是把 `healError` 寫進 summary＋error 告警，不改回應狀態碼。
  **建議收**（同屬「排程說謊」；測試可用注入的 rpc 失敗，不需要 DDL 級 fault injection）。不收就維持記債。
- [ ] **Q5 未知 TradeStatus 永不 expire 的副作用**：這類單會一直留在掃描視窗最前端（created_at 升冪、每輪 50 張）。
  **建議接受**：每張都有 error 告警要人處理，正式站至今 0 例；累積到 10 張以上再改成「排在視窗最後」。另一案：14 天後改標新狀態 `needs_review`——要動 `payment_orders.status` 的 check 與前端，不建議本波做。
- [ ] **Q6 對帳頻率**：維持名目每小時（第 7 分）／改每 30 分鐘。pg_cron 準時，每小時已經比現在實際的中位 1.7 小時快很多；
  每 30 分鐘會讓 PayUni 查詢量加倍（每輪最多 50 張）。**建議維持每小時**，上線量過準時度再說。

## 7. 風險與回滾（必答 5）

- **最壞情況**：
  1. pg_cron 與 GitHub 同時打、租約失效 → 只多查幾次 PayUni（§2.4 的底線冪等），不重複開通。
  2. Vault 密鑰設錯 → 每輪 401 → 帳本沒有成功列 → 看門狗 90 分鐘後由 GitHub 補跑並推 LINE。對帳延遲上限＝GitHub 實際間隔，等同現況。
  3. 正式站忘了設 Edge `PHOTO_PURGE_LIVE` → pg_cron 清理每天 dry-run；GitHub 每日補跑條件是「> 26 小時沒有**成功**」，dry-run 算成功不會補跑 → 三十日下架不成立。
     防線：看門狗的開關不一致檢查（§2.3）；晉升清單加一項「正式站 Secrets 有 `PHOTO_PURGE_LIVE=true`」。→ 這是本案最需要人記得的一步。
- **一鍵停**（正式站 SQL Editor）：
  ```sql
  select cron.unschedule('reconcile-pending-payments');
  select cron.unschedule('purge-orphan-listing-photos');
  ```
  不用改 workflow：停了以後帳本不再有新的成功列，看門狗在 90 分鐘／26 小時後自動由 GitHub 接手（那就是現在的行為）。
  要立即接手就 dispatch 兩支 workflow。恢復：重跑 migration 裡的兩段 `cron.schedule`（SQL 會寫進 `supabase/README.md`）。
- **migration 回滾**：只新增物件，不需要 down migration；停排程即等於回到現況。帳本表留著無害。
