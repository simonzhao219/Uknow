# 對帳與照片清理改由 pg_cron 觸發 規劃書

<!-- 第 5 波 S1（launch-wave-5/plan.md §2；裁決 W4-25、W5-4、W5-15～19）。行號以 develop 3a7f506 為準，施工時現算。
     第 2 版：處置第 1 輪 /review-plan 的 P0／P1，對照表見 §8。
     第 3 版：處置第 2 輪（review.md）的 P0／P1，對照表見 §9；3.1 版處置第 3 輪覆核，見 §10。 -->

## 0. 一句話

讓**付了錢卻卡在 pending 的會員**在一小時內被對帳撿回，讓刊登照片按時下架。做法是把觸發從 GitHub 排程搬到 Supabase pg_cron。
GitHub 排程大量跳過：對帳 24 小時只跑 3 次（應 24 次）；照片清理晚 6 小時 20 分，首輪整次沒跑。

**為什麼是 pg_cron**：主 session 11/04 查了正式站 48 小時。同一個 DB 上既有的 `prune-rate-limits` 48/48 成功，啟動延遲最大 0.23 秒；`purge-stale-referral-invites` 2/2。
兩環境都已裝 pg_cron 1.6.4 與 supabase_vault 0.3.1，**pg_net 沒裝**（見階段 0）。

### 0.1 裁決（2026-11-04；業主以互動選項裁決，編號由主 session 發）

| # | 裁決 |
|---|---|
| W5-15 | ① Vault 存 `RECONCILE_SECRET` 副本；② 對帳每小時；③ 未知狀態的單排到掃描視窗後段，永不標 expired；④ health 端點、pg_net 診斷、開關不一致檢查本波做；⑤ 門檻由執行 session 寫明依據（§2.8）；⑥ 兩環境暫不分密鑰 |
| W5-16 | GitHub 兩支 workflow 改當看門狗兼後備觸發 |
| W5-17 | 實刪開關本波兩個並存，不一致就推 LINE；統一成單一開關留第 6 波 |
| W5-18 | heal pass 失敗（pay P2-14）不收，留第 6 波 |
| W5-19 | 「全滅或過半失敗要告警」的出處是派工 S1 段原文；第 1 輪審查的 P0 #1 豁免。`checked >= 3` 的理由見 §2.8 |

## 1. 使用者需求

- **依據**
  - `launch-wave-4/plan.md` §8 的 11/02 04:50、11/03 18:40 兩列，以及 `review.md` §5-6。
  - 派工 S1 段（`launch-wave-5/dispatch-prompts.md`）。
  - 規格書 §11「照片檔清理」：三十日下架、安全閘。
  - `supabase/README.md`〈告警 severity〉。
- **驗收情境**
  1. 正式站任一 24 小時內，**只量 pg_cron 路徑**：pg_cron 觸發且完成的對帳 ≥ 23 次，相鄰兩次的間隔 ≤ 70 分鐘。
     出現 GitHub 補跑列就判未達標，並作為 pg_cron 失準的證據。「完成」的定義見 §2.5。量法與執行者見 §2.6。
  2. 照片清理每日一次，由 pg_cron 在 UTC 19:17（台北 03:17）觸發。正式站實刪（帳本 `dryRun=false`），develop 只列候選。
  3. pg_cron 停擺、Vault 沒設、密鑰不一致（401）、Edge 回錯時，GitHub 看門狗在下一次實際執行時：
     - 補跑對帳；
     - 推**一則** LINE P1，內文說明原因。
     名目最壞約 2.5 小時，GitHub 跳過排程時會再延後（§2.8）。這段期間的對帳延遲上限等同現況，不會更糟。
  4. **ops P1-3**：`checked >= 2` 且 PayUni 查詢在一輪中全部擲錯（HTTP／網路／解密失敗）時：
     - 端點回 502，寫一筆 error 告警；
     - 下一次看門狗的 system_alerts 推送把它送到 LINE。
     `checked >= 3` 且過半擲錯時，回 200，但寫 error 告警。判準與計數定義見 §2.5、§2.8。
  5. **pay P1-3**：以下三種情況的訂單**永不**被自動標 expired，寫 error 告警，並移到掃描視窗後段：
     - PayUni 回了碼表（§2.5，階段 0 定案）裡「未付款／已付款／失敗／取消」以外的 `TradeStatus`，或缺欄位；
     - `Result` 陣列裡找不到同號交易；
     - 平鋪欄位帶的 `MerTradeNo` 和請求不符。
  6. 正式站排程清理的實刪狀態與 repo var `PHOTO_PURGE_LIVE` 不一致時，每日推一則 LINE P2。
- **不做什麼**
  - LINE 推播搬進 Edge Function（第 6 波候選）。
  - heal pass 失敗（W5-18）。
  - 兩個實刪開關統一（W5-17）。
  - 兩環境分開密鑰（W5-15⑥）。
  - 對帳與清理的業務規則不改：門檻 20 分、批次 50、expire 4 天、寬限期 168 小時、斷路器。
  - 使用者端「付款處理中」文案不改：`PaymentResult` 既有的 pending 畫面不受影響。本案縮短的是等待時間，不是畫面。
  - ops P2-6／P2-8 的 workflow 枝節，除非改寫時順帶消失。P2-7（誤報）、P2-9（照片清理無 LINE）會順帶消失。

## 2. 系統設計

### 2.1 資料流

```
pg_cron（每個環境的 DB 各自跑）
  ├─ 'reconcile-pending-payments'  '7 * * * *'   → select public.invoke_internal_endpoint('reconcile')
  ├─ 'purge-orphan-listing-photos' '17 19 * * *' → select public.invoke_internal_endpoint('purge-photos')
  └─ 'prune-scheduled-job-runs'    '41 4 * * *'  → delete 90 天前的帳本列
        │ 讀 Vault：uknow_api_base_url、uknow_internal_secret
        │ 缺任一 → 寫帳本 status='skipped' error_code='vault_missing'，不送請求
        ▼
  net.http_post（pg_net，非同步；timeout_milliseconds => 150000；不重試）
        ▼
  Edge Function 既有端點（x-internal-secret 驗證不變；verify_jwt=false，所以不用帶 Authorization）
    POST /internal/reconcile-pending-payments   body {"trigger":"pg_cron"}
    POST /internal/purge-orphan-listing-photos  body {"trigger":"pg_cron"}
        │ 驗證通過後：begin_scheduled_run(job, trigger) 取租約；同 job 在跑 → 寫 skipped 列、回 200 {skipped:'concurrent'}
        │ try … finally：finish_scheduled_run(id, status, summary, error_code)，任何擲錯路徑都寫 failed
        ▼
  public.scheduled_job_runs（帳本；看門狗與準時度量測都讀它）

GitHub（只打正式站）
  reconcile-payments.yml   每小時（第 37 分）：看門狗（同一個 job 的 step）＋ system_alerts 推 LINE ＋ 對帳逾期時補跑
  purge-listing-photos.yml 每日：清理逾期時補跑 ＋ 開關一致性檢查；workflow_dispatch 與 B1～B4 不變
```

- **沿用既有端點路徑，不新增 `/internal/scheduled/*`。** 晉升時 migration 由 Supabase 整合**立即**套用，Edge 部署要等業主核准 `production`。
  這段空窗內 pg_cron 打的是舊版端點：
  - 舊對帳忽略 body，照常跑；
  - 舊清理只在 body 帶 `dry_run:false` 時才實刪，`{"trigger":"pg_cron"}` 會當 dry-run，不會誤刪；
  - 舊版沒有帳本 → health 404 → GitHub 每小時補跑。對帳在這段期間一小時被打兩次、沒有租約，只多查幾次 PayUni（§2.4、§7）。
- **為什麼要自建帳本，不直接看 `cron.job_run_details`**（第 1 輪 #14）：
  - pg_net 是非同步的，`cron.job_run_details` 只記「SQL 把請求排進佇列成功」，看不到端點是否回 200、對帳有沒有做完。
  - `net._http_response` 只保留約 6 小時。
  - `logSystemAlertOnce` 只能記「發生了什麼」，偵測不到「該發生卻沒發生」（停擺）。
  - 看門狗需要的是「最近一次真正做完的時間」，只有端點自己寫的帳本有。

### 2.2 憑證（必答 1；W5-15①⑥）

- **Vault 存兩筆**，由人在各環境 SQL Editor 各執行一次，**不寫進 migration**。SOP 照 §2.9 的順序。
  - `uknow_api_base_url`：`https://<ref>.supabase.co/functions/v1/api`
  - `uknow_internal_secret`：與該環境 Edge 的 `RECONCILE_SECRET` 同值
- **逐環境設定**：正式站、develop 各一組。兩環境密鑰同值是現行規則（`docs/supabase-setup-checklist.md`：GitHub 只有一份 `secrets.RECONCILE_SECRET`，dispatch 到 develop 要靠同值），本波不分（W5-15⑥）。
  - 代價：develop 洩漏等於正式站洩漏。這是既有風險，本案沒有新增。
- **`invoke_internal_endpoint(p_job text)`**
  - `security definer`、`set search_path = public`，revoke anon／authenticated／public（照〈慣例〉）。
  - `p_job` 只接受白名單 `reconcile`、`purge-photos`，對應固定路徑；不接受任意 URL。
  - 回傳 pg_net 的 request id；Vault 缺值時回 null。
- **密鑰落點**
  - 會短暫進 `net.http_request_queue`，送出即刪。
  - `cron.job` 的 command 只有 `select public.invoke_internal_endpoint('reconcile')`，不含密鑰，所以 `cron.job_run_details` 也不會有。
  - 階段 0 確認 net／vault 兩個 schema 對 anon／authenticated 的權限，階段 8 以測試釘住。
- **輪替**：先改 Edge secret，再改 Vault，再手動執行一次 `invoke_internal_endpoint('reconcile')` 驗證帳本出現 `succeeded`。
  兩步之間的空檔是 401。若超過 90 分鐘，看門狗會接手並推 LINE，可接受。

### 2.3 環境（必答 2）

- **正式站與 develop 都跑。** develop 是可安全驗證的真後端（CLAUDE.md）：對帳打 PayUni sandbox，兩邊資料各自獨立。
- **拋棄式 journey 分支**：Vault 沒值，每輪只寫一列 `skipped/vault_missing`，不送請求。journey 的對帳劇本照舊直接打端點，不受影響。
- **照片清理的實刪開關**（W5-17）：依 `trigger` 分流，寫成明確分支。

| body 的 `trigger` | 實刪條件 | 誰會送 |
|---|---|---|
| `pg_cron` | Edge secret `PHOTO_PURGE_LIVE === 'true'`；body 的 `dry_run` **一律忽略** | pg_cron |
| `github` | 照現行：body `dry_run === false` 才實刪（`purge-listing-photos-request.py` 的 B1／B4 組 body） | GitHub 補跑 |
| 缺漏或其他值 | 同 `github`，帳本記成 `manual` | 人工 dispatch、本機 curl |

  - 正式站 Edge 設 `true`、develop 不設 → 維持「正式站實刪、develop dry-run」。沒設就不刪（fail-safe）。
  - 一致性檢查見 §2.5。「正式站 Edge Secrets 有 `PHOTO_PURGE_LIVE=true`」列為晉升清單的硬性驗收項（§2.9）。
- **develop 的比例閘**常被觸發（規格書 §11）：pg_cron 每日 dry-run 會在 develop 寫 `failed/circuit_open`。develop 的告警不推 LINE（看門狗只打正式站），可接受。

### 2.4 冪等、租約與重疊（必答 3）

**租約**

- `scheduled_job_runs` 有 partial unique index：`(job) where status = 'running'`。
- `begin_scheduled_run(job, trigger)` 在**一個函式交易**內做三件事：
  1. 把同 job `started_at` 早於 15 分鐘前的 `running` 列改成 `abandoned`；
  2. insert 一列 `running`；
  3. 撞 unique 時以 `exception when unique_violation` 改 insert 一列 `skipped`（`error_code='concurrent'`），回傳 `{id, acquired:false}`。
- 兩個並行呼叫會在步驟 1 的 update 上互相等鎖，之後其一撞 unique。階段 1 用兩個並行交易測。
- `finish_scheduled_run(id, status, summary, error_code)` 只更新**仍為 `running`** 的列（`where id = $1 and status = 'running'`），回傳是否更新。
  晚到的舊 run 在被改成 abandoned 之後不會覆寫結果。
- **崩潰恢復上限 15 分鐘**：Edge 被 wall clock 砍掉時，finally 也不會執行，那一列卡 `running`。
  - 15 分鐘大於 Edge 最大執行時間（paid 400 秒），且小於對帳間隔，所以下一輪一定拿得到租約。
  - `abandoned` 會進 health（§2.5），連續出現代表 Edge 逾時，看門狗告警文案會帶出來。

**skipped 也寫帳本**：每次至多一列，量很小，health 的 24 小時計數由此而來。看門狗與補跑判斷「完成」時**排除** skipped。

**`withScheduledRun(deps, job, trigger, fn)` 的契約**（第 2 輪架構 P1）

- `fn` 回傳 `{ status: 'succeeded' | 'failed', errorCode?: string, summary: object, response: { httpStatus: number, body: object } }`。
- 業務上的失敗是**正常回傳**，不是擲錯。例如 `query_all_failed` 的 502、清理的 `circuit_open`。
- `fn` 擲錯時，wrapper 寫 `failed`、`error_code='exception'`，再把錯誤往上丟給 handler 既有的 catch→500。
- 沒拿到租約時，wrapper 不呼叫 `fn`，直接回 `200 {success:true, data:{skipped:'concurrent'}}`。
- 階段 1 的 unit 測試涵蓋三種情況：回傳失敗結果但不擲錯、擲錯、沒拿到租約。

**沒有租約時的冪等底線**（租約失效、或空窗內的舊版端點）

- 對帳：
  - 收斂走 `process_successful_payment`，有 profiles 列鎖，已收斂的單會離開 pending；
  - 標 expired 帶 `.eq('status','pending')`；
  - 告警用 `logSystemAlertOnce`；
  - 所以重疊只會多查幾次 PayUni，不會重複開通。
- 清理：Storage `remove()` 只回傳實際刪掉的物件，同一物件被兩輪刪時，第二輪會算進 `notRemoved`（`listing-photos.ts` 的 `batch.length - removed.length`）。
  - 有租約時不會發生。
  - pg_cron 路徑把 `notRemoved > 0` 記為 **warning**、帳本 `succeeded`（第 1 輪 #22）。
  - GitHub 路徑的 J3 判紅不變。

**skipped 回應與 GitHub 判讀**（第 2 輪架構 P1）

- 對帳補跑：回應帶 `data.skipped` 時，step 判「中性」，不紅、不算成功。帳本會有另一個來源正在跑。
- 清理：`purge-listing-photos-request.py` 的 `judge` 新增規則 J5——200 且 `data.skipped === 'concurrent'` 判中性，exit 0，step summary 註明。
  不走 `bad_shape`，不開 issue。

### 2.5 可觀測（必答 4；W5-15④、W5-16、W5-17）

**「完成」與「存活」**（第 2 輪系統 P1-1）

- **完成列**：`status in ('succeeded','failed')` 且 `error_code` 不屬於傳輸／設定類（`vault_missing`、`exception`）。
  `query_all_failed`、`circuit_open` 這類業務失敗也算完成，代表 pg_cron 與 Edge 都正常、是下游有問題。
- **看門狗只用 pg_cron 的完成列判斷存活**：`lastPgCronCompletedAt`（第 3 輪系統 P1-A）。GitHub 補跑寫的完成列不刷新它，所以停擺期間每小時都會補跑，逾期分鐘數 `m` 也會一直累加。`lastCompletedAt` 只供診斷與每日清理的補跑判斷。
  - 業務失敗走端點自己的 system_alerts 告警，看門狗**不補跑、不推「停擺」**。補跑只會重打 PayUni、再開一張 issue。

**`GET /internal/scheduler-health`**

- 驗證：`x-internal-secret`。
- 資料來源：一支 definer RPC `scheduler_health()`，因為 PostgREST 讀不到 cron／net schema。
- 回應 schema 是 Deno 端點與 Python 看門狗之間的契約。fixture 放在 `scripts/fixtures/scheduler-health/`（第 2 輪架構 P2）：
  - `shape.json`：完整鍵集合，Deno 測試做雙向鍵集合比對；
  - `scenario-*.json`：情境，Python self-test 逐份驗證鍵都屬於 `shape.json`，再跑判準；
  - Deno 端用 `new URL('../../../scripts/fixtures/…', import.meta.url)` 讀，不依賴 cwd；`deno.json` 的 task 已是 `--allow-read`。

```json
{ "success": true, "data": {
  "generatedAt": "2026-11-20T01:37:03Z",
  "jobs": {
    "reconcile": {
      "cronJobPresent": true, "cronJobActive": true,
      "lastCompletedAt": "2026-11-20T01:07:41Z", "lastCompletedStatus": "succeeded", "lastCompletedTrigger": "pg_cron",
      "lastPgCronCompletedAt": "2026-11-20T01:07:41Z",
      "lastPgCronRowAt": "2026-11-20T01:07:41Z", "lastPgCronErrorCode": null,
      "counts24h": { "succeeded": 24, "failed": 0, "skipped": 0, "abandoned": 0 },
      "lastPurgeDryRun": null
    },
    "purge-photos": {
      "cronJobPresent": true, "cronJobActive": true,
      "lastCompletedAt": "2026-11-19T19:17:20Z", "lastCompletedStatus": "succeeded", "lastCompletedTrigger": "pg_cron",
      "lastPgCronCompletedAt": "2026-11-19T19:17:20Z",
      "lastPgCronRowAt": "2026-11-19T19:17:20Z", "lastPgCronErrorCode": null,
      "counts24h": { "succeeded": 1, "failed": 0, "skipped": 0, "abandoned": 0 },
      "lastPurgeDryRun": false
    }
  },
  "pgNet6h": { "non2xx": 0, "timedOut": 0, "lastStatusCodes": [] }
} }
```

- `cronJobPresent`：`cron.job` 裡有沒有該 jobname（第 2 輪需求 P2、系統 P2-3）；`cronJobActive`：該列的 `active`。人為停用用 `cron.alter_job(active := false)`，排程列還在，所以只有 `cronJobActive` 會變 false（第 3 輪 P1-B）。
  - health 回 200，代表新版 Edge 已部署；migration 一定先於 Edge 套用，所以這時 `false` 就是排程不見了，不是過渡期。
- `lastPurgeDryRun`：取最近一筆 pg_cron 清理列中 `summary.dryRun` 非 null 的那筆（第 2 輪系統 P2-4）。reconcile 恆為 null。
- `pgNet6h`：`net._http_response` 只保留約 6 小時，只當診斷用，不當觸發條件。
- 不回 summary 明細、uid、name。

**看門狗判準**

- 決策全在 `scripts/scheduler-watchdog.py` 的純函式；yml 只負責 curl 和呼叫腳本。
- 兩支 workflow 仍各是**單一 job**，看門狗是那個 job 裡的 step（規則 8a）。
- 每次執行**最多推一則**看門狗 LINE，同一根因合併成一則。

| 狀況（正式站） | 補跑對帳 | 看門狗 LINE |
|---|---|---|
判準由上往下取第一個命中的列：

| # | 狀況（正式站） | 補跑對帳 | 看門狗 LINE |
|---|---|---|---|
| 1 | health 404（Edge 尚未部署，或仍在空窗） | 補 | 無，只在 step summary 標出 |
| 2 | health 查詢失敗（非 200、非 404） | 補 | P1「看門狗查不到排程狀態」（套 6 小時節流） |
| 3 | 200 且 `cronJobPresent=false` | 補 | P1「pg_cron 對帳排程不存在」（套 6 小時節流） |
| 4 | 200 且 `cronJobActive=false` | 補 | P2「pg_cron 人為停用中，GitHub 代跑」，只在 UTC 01 時那一輪推（台北 09:37），等於每日一則 |
| 5 | 200 且 `lastPgCronCompletedAt` ≤ 90 分鐘 | 不補 | 無 |
| 6 | 200 且 > 90 分鐘（或 `lastPgCronCompletedAt` 為 null） | 補 | P1「pg_cron 對帳停擺」（套 6 小時節流），附診斷：`lastPgCronErrorCode`、abandoned 數、`pgNet6h.lastStatusCodes` |

- 停用狀態由 `cronJobActive` 判斷，不靠帳本標記。所以 resume 之後不會殘留 `manually_disabled`：resume 之後若是 401，會正確落在第 6 列。
- 第 2、3 列沒有 `lastPgCronCompletedAt` 可用時，`m` 以 `lastCompletedAt` 代替，或以「距上次成功的看門狗 run」計算。

- 補跑回 skipped 算中性。
- **持續中的推播節流**（第 2 輪 UI/UX P1、需求 P2）。看門狗本身不存狀態，靠時間桶判斷要不要推：
  - 公式（第 3 輪 P1-C）：
    - `L` = `lastPgCronCompletedAt`；
    - `P` = 上一次成功的看門狗 run 的建立時間，用現有的 `gh api …runs?status=success` 取得；
    - `m_now = now − L`；
    - `bucket(m) = floor((m − 90) / 360)`，`m < 90` 時桶號為負，代表未逾期。
    - `L > P` 時（上次 run 之後 pg_cron 恢復過），`m_prev` 視為 0；否則 `m_prev = P − L`。
    - `bucket(m_now) ≠ bucket(m_prev)` 才推。
  - `L` 為 null（從來沒有完成列）時，以 `P` 到現在是否跨過整 6 小時的邊界判斷。
  - 查不到 `P` 就推（寧可多推）。
  - 效果：首次發現推一則，持續中每 6 小時再推一則；GitHub 跳過 run 也不會漏掉首推。
  - **推播失敗要讓 run 判紅**，沿用現行「推送步驟放最後、不加 continue-on-error」的作法。紅 run 不算「上一次成功」，下一輪會重推，不會被當成已通知。
- **purge-photos 逾期**（> 26 小時）只在 purge-listing-photos.yml 的每日 run 檢查，天然每日最多一則。不併進每小時的看門狗。
- **LINE 內文前 200 字必須先寫結論與動作**（第 2 輪 UI/UX P1）：`notify/action.yml` 會把 body 截在 200 字。
  - 診斷細節放 step summary，由 `run_url` 連過去。
  - self-test 斷言：每種 body 前 200 字都含「下一步」。

**purge-listing-photos.yml**（每日一次）

- 清理 `lastCompletedAt` > 26 小時才補跑。
- 開關一致性（W5-17）：`lastPurgeDryRun` 與 repo var `PHOTO_PURGE_LIVE` 不一致時推 LINE P2。兩個方向都算：
  - Edge 沒開、repo var 開了；
  - Edge 開了、repo var 沒開。
- 每日一次，天然每日最多一則。
- 「失敗時開 issue」保留，改用 `steps.<id>.outcome` 分開「補跑失敗」與「看門狗查詢失敗」兩種文案。

**reconcile-payments.yml 的 issue 與 LINE**

- 用 `steps.<id>.outcome` 分開「對帳補跑失敗」與「告警查詢失敗」兩種文案（順帶修 ops P2-7）。
- 補跑的 curl 不帶 `--retry`。curl 的 `--retry` 預設也會重打 5xx，而 502 是業務結果，重打只會多查 PayUni（第 2 輪系統 P2-1、第 3 輪 P2）。連線層失敗（curl exit 6／7／28）由 shell 迴圈重試 3 次，間隔 10 秒，對應 #458 的 DNS 故障。

**端點側告警**（pg_cron 路徑沒有 GitHub issue，失敗要寫進 system_alerts）

- **對帳 ops P1-3**（W5-19；第 2 輪系統 P1-1 修正第 1 輪 #3 的處置）
  - 計數：
    - `queryErrors`：queryFn **擲錯**，即 HTTP 非 2xx、網路、回應不是 JSON、解密失敗；
    - `queryFailures`：查詢層非 SUCCESS。**另計，不算進全滅**。這類已經有 `payuni-query` 去重 error 告警（依 Status＋Message），而棄付單「查無此單」也走這條；算進全滅的話，只剩一兩張棄付單時每小時都會 502；
    - `unknownStatus`：另計，不算進全滅，每張單都有自己的告警；
    - `expireErrors`：標 expired 的 update 失敗，原本混在 `queryErrors` 裡。
  - 全滅：`checked >= 2 && queryErrors === checked` → error 告警 `reason:'query_all_failed'`；
    回 `502 {success:false, error:{code:'query_all_failed', message}, data:summary}`；帳本 `failed`，`error_code='query_all_failed'`。
  - 過半：`checked >= 3 && queryErrors * 2 > checked` → error 告警 `reason:'query_majority_failed'`；回 200；帳本 `succeeded`，summary 標 `degraded:true`。
  - 兩者的去重鍵都加 UTC 小時桶（同既有 `payuni-failure-burst`）：沒人 resolve 時，下一小時再推。
  - 既有 catch→500 的 `error: String(e)` 形狀不動。下游 workflow 只看 HTTP 狀態與 `success`，不依賴 `error` 的型別（第 2 輪系統 P2-1）。
- **對帳 pay P1-3**（W5-15③）
  - **碼表**（第 2 輪系統 P0）：目前只有第三方整理，見下方來源，沒有 PayUni 官方文件。階段 0 ⑥ 是**硬閘門**：逐碼寫進 progress.md 後才進階段 2。

| 碼 | 意義（暫定） | 對帳處理 |
|---|---|---|
| `0` | 未付款 | 照舊：`stillProcessing`，4 天後標 expired |
| `1` | 已付款 | 照舊：`resolveOrderFromPayUni` 收斂 |
| `2`、`3` | 付款失敗、已取消 | 照舊：標 failed |
| `6` | 已退款 | `unknownStatus`：不自動處理，交人工 |
| 其他、缺欄位 | 未知 | `unknownStatus` |

  - 暫定碼表的來源：第三方 skill 頁 [payuni-query](https://smithery.ai/skills/paid-tw/payuni-query)、[skills.sh](https://skills.sh/paid-tw/skills/payuni-query)。
  - 官方文件若另有「未付款／逾期」類的碼（例如 4、9），一律併入 `0` 的路徑，不算 unknown，避免棄付單永遠卡住。
  - `queryPayUniTradeStatus` 多一種回傳：`{stillProcessing:true, unknownStatus:{tradeStatus, reason}}`。`reason` 是以下之一：
    - `unknown_code`：碼不在上表的已知處理裡；
    - `missing_field`：沒有 TradeStatus；
    - `no_matching_trade`：見下一條。
  - **同號比對**（第 2 輪系統 P1-2）。比對一律 `String(v).trim()`，數字型的 MerTradeNo 也能對上。
    - `Result` 陣列有同號項 → 取那一項；
    - 只有一項、且該項**沒有** `MerTradeNo` 鍵 → 照舊接受，避免已付款單因欄位缺漏永遠收斂不了；
    - 有 `MerTradeNo` 鍵但沒有一項相符，或多項且都不符 → `no_matching_trade`（**移除 `?? list[0]`**）；
    - 平鋪欄位帶 `MerTradeNo` 但不符 → `no_matching_trade`；沒帶 → 照舊接受。
  - 迴圈遇到 `unknownStatus`：
    - 不論天數都不標 expired，另計 `unknownStatus`；
    - 寫 `logSystemAlertOnce('reconcile-pending-payments', {reason:'unknown_trade_status', tradeNo}, …, 'error')`。去重到 resolve 為止，單子在視窗後段輪流時不會重複告警；
    - 更新 `payment_orders.reconcile_unknown_at = now()`。更新失敗只記 warning，不中斷迴圈。
  - 查詢得到**非** unknown 的結果時，把 `reconcile_unknown_at` 清回 null（第 2 輪系統 P1-4）。
- **掃描視窗**（W5-15③；第 2 輪系統 P1-4）
  - 寫法一定要是 `.order('reconcile_unknown_at', { ascending: true, nullsFirst: true }).order('created_at', { ascending: true })`。
    Postgres 升冪預設 NULLS LAST，漏寫 `nullsFirst` 會靜默反過來。
  - 和既有 `.or(...)` 過濾互不干擾，`.or` 只影響 where。
  - 效果：
    - 沒被標過的單永遠先掃；
    - 被標過的單在後段輪流，最久沒看的先；
    - 一輪 50 張被未知單塞滿時，真卡單仍排在前面。
  - 測試必須在真 DB 上跑（`reconcile-expire.test.ts`）。
- **清理**
  - pg_cron 觸發且失敗時寫 error 告警，去重鍵為 `error_code` 加 UTC 日期桶。失敗包含斷路器、`sweep_failed`，以及任何 catch 到的錯誤。
  - `notRemoved > 0` 為 warning。

**告警 message 範本**

- 每則都寫出發生什麼、影響誰、下一步，前綴分類。
- 訂單號與數量寫進本文。
- LINE 的看門狗文案前 200 字先寫結論與動作。

| reason | message |
|---|---|
| `query_all_failed` | 【對帳】PayUni 查詢本輪全部失敗（{failed}/{checked}），付款狀態無法確認，訂單不會被標過期。請確認 PayUni 查詢 API 與正式站 Edge Secrets 的 PAYUNI_* 憑證；恢復後下一輪自動重試。持續中會每小時再告警。 |
| `query_majority_failed` | 【對帳】PayUni 查詢本輪過半失敗（{failed}/{checked}），部分付款可能延後開通。請確認 PayUni 狀態；持續中會每小時再告警。 |
| `unknown_trade_status` | 【對帳】訂單 {tradeNo} 的 PayUni 狀態無法判讀（{reason}：{tradeStatus}），已停止自動處理、不會標過期。請到 PayUni 商店後台確認是否已付款，人工處理後標記已處理。 |
| 清理失敗 | 【照片清理】排程清理失敗（{error_code}{／reason}），本輪一檔未刪。到後台「系統告警」與 Supabase 的 scheduled_job_runs 查原因，處理方式見規格書 §11；三十日下架期限扣掉寬限期約剩兩週。 |
| 看門狗：停擺 | 【排程】正式站 pg_cron 對帳停擺 {N} 分鐘，GitHub 已補跑（{結果}）。下一步：查 Supabase Vault 的 uknow_* 兩筆、Edge Secrets 的 RECONCILE_SECRET、cron.job。診斷見連結。 |
| 看門狗：排程不存在 | 【排程】正式站 cron.job 沒有對帳排程，GitHub 已補跑。下一步：重跑 supabase/README.md 的 cron.schedule SQL。 |
| 看門狗：人為停用 | 【排程】正式站 pg_cron 對帳人為停用中，由 GitHub 每小時代跑。下一步：要恢復就執行 select public.resume_scheduled_jobs();（supabase/README.md）。 |
| 開關不一致 | 【照片清理】正式站排程清理{是／不是}實刪，但 repo var PHOTO_PURGE_LIVE={值}。下一步：到 Supabase Edge Secrets 設 PHOTO_PURGE_LIVE，或改 GitHub repo variable，讓兩邊一致；否則三十日下架不成立。 |

### 2.6 準時度量測（W4-26；晉升後 24～48 小時由主 session 跑）

`<T0>` 填 Edge 部署核准後的第一個整點，用來排除 §2.9 第 6 步那筆手動驗證列（第 2 輪需求 P1）。

```sql
-- ① pg_cron 有沒有準時把請求排進佇列
select j.jobname, d.status, d.start_time, d.return_message
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname in ('reconcile-pending-payments','purge-orphan-listing-photos')
  and d.start_time >= '<T0>' and d.start_time < '<T0>'::timestamptz + interval '24 hours' order by d.start_time;
-- ② 端點有沒有真的做完（帳本；判準以這張為準）
select job, trigger, status, started_at, finished_at, error_code, summary
from public.scheduled_job_runs
where started_at >= '<T0>' and started_at < '<T0>'::timestamptz + interval '24 hours' order by started_at;
-- ③ pg_net 傳輸層（只保留約 6 小時，能看到多少算多少）
select status_code, timed_out, error_msg, count(*) from net._http_response group by 1,2,3;
```

**達標判準**：只有這一份，驗收 1、2 都引用這裡。

- **對帳**
  - ② 的 `trigger='pg_cron'` 完成列 ≥ 23，相鄰間隔最大 ≤ 70 分鐘；
  - `abandoned` 為 0；
  - `trigger='github'` 為 0；
  - ① 的 `start_time` 與排程分鐘差 ≤ 1 分鐘。
- **清理**：② 有 1 列 `pg_cron` 完成列，且正式站 `summary->>'dryRun' = 'false'`。
- **pg_net**：③ 非 200 為 0。
- **develop**：只確認 ② 有 pg_cron 列、清理 `dryRun = true`，不量準時度。

### 2.7 資料庫變更（一支 migration，版本號 rebase 後現算）

- **pg_net**：`create extension if not exists pg_net`。
  - schema、以及 Supabase 允不允許在 migration 內開，由階段 0 確認。
  - 若不允許：改由業主在 Dashboard 開啟，migration 只斷言存在，不存在就 `raise exception`，讓問題在部署當下就出現。
- **表 `public.scheduled_job_runs`**
  - 欄位：
    - `id bigint generated always as identity`
    - `job text check (job in ('reconcile','purge-photos'))`
    - `trigger text check (trigger in ('pg_cron','github','manual'))`
    - `status text check (status in ('running','succeeded','failed','skipped','abandoned'))`
    - `started_at timestamptz default now()`、`finished_at`、`error_code text`、`summary jsonb`
  - 開 RLS、無 policy，另 `revoke all ... from anon, authenticated, public`。
  - 索引：`(job, started_at desc)`；partial unique `(job) where status='running'`。
- **欄位** `payment_orders.reconcile_unknown_at timestamptz null`：正式站既有約 15 筆訂單全為 null，不影響既有排序。
- **函式**：全部 definer＋revoke，只 grant service_role。
  - `begin_scheduled_run`、`finish_scheduled_run`
  - `invoke_internal_endpoint`
  - `scheduler_health`
  - `prune_scheduled_job_runs(p_older_than_days int default 90)`：抽成函式，好測（第 2 輪架構 P2）
  - `pause_scheduled_jobs()`／`resume_scheduled_jobs()`：一鍵停與恢復，用 `cron.alter_job(jobid, active := false／true)`，只改 active、不刪排程列，所以排程字串與指令不會在 migration 之外再寫一份。見 §7
- **排程**：三個 `cron.schedule`，以 job 名稱 upsert。**放在 migration 最後，施工順序也最後**（階段 8）：端點都備妥之後才掛排程。
- **本機與 CI 的 `supabase start` 也會跑這些排程**（第 2 輪架構 P1；第 3 輪 P2-3 擴及 `cron.job`）：
  - 測試若自己造或改 `cron.job` 的列（階段 6、8），測完要還原。
  - 每小時第 7 分會寫一列 `pg_cron/skipped/vault_missing`。
  - 帳本相關測試一律在 setup 清表，並以測試自建的列、時間範圍斷言，不斷言「最新一列」。
  - 階段 8 之前排程還沒掛，這個問題從階段 8 起才會出現。
- **正式站既有資料**：只新增物件，加一個 nullable 欄位。`cron.job` 從 2 列變 5 列。
- 這支 migration 會跨階段累加（1、2、6、8）。progress.md 記錄每個階段追加了哪一段。

### 2.8 可調參數與依據（W5-15⑤）

| 參數 | 值 | 依據 |
|---|---|---|
| 對帳排程 | `7 * * * *` | W5-15②每小時。第 7 分避開整點尖峰，也與 `prune-rate-limits`（第 17 分）錯開 |
| 看門狗排程 | `37 * * * *` | 與 pg_cron 相差半小時：看門狗執行時，最近一次 pg_cron 對帳已結束約 30 分鐘 |
| 補跑門檻 | 90 分鐘 | 一個間隔（60 分）＋30 分緩衝。pg_cron 準時時，看門狗看到的距今最多約 30＋60 分，不會誤補；漏一輪就會超過 |
| 停擺 LINE 的最壞延遲 | 名目約 2.5 小時 | 最後一次完成後 90 分才算逾期，再等最多 60 分到下一次看門狗。GitHub 跳過看門狗時會再延後（實測最大間隔 6.3 小時）：這是 W5-16 把看門狗留在 GitHub 的已知代價，對帳本身已不受影響 |
| 持續推播間隔 | 6 小時 | 首推之後再提醒，又不至於夜間每小時響 |
| 清理補跑門檻 | 26 小時 | 每日一次＋2 小時緩衝 |
| 全滅門檻 | `checked >= 2` 且全部擲錯 | `checked=1` 時只是一張單的單次例外，正是 #460 刻意維持 warning 的情境，不升級；從 2 起，「全部」才代表系統性故障 |
| 過半門檻 | `checked >= 3` 且擲錯過半 | `checked=2` 時過半就是 2/2，已由全滅涵蓋；1/2 是「一半」，不算過半，不告警（刻意取捨：兩張單裡一張偶發仍屬 #460 的範圍）。從 3 起才有「部分但多數」的失敗。派工原文只寫「過半」，沒有指定樣本下限，下限由 W5-19 授權本 session 訂 |
| 租約逾時 | 15 分鐘 | 大於 Edge 最大 wall clock（paid 400 秒），小於對帳間隔 |
| pg_net 逾時 | `timeout_milliseconds => 150000` | 等於 Edge free 方案的 wall clock 150 秒；逾時只代表 pg_net 不等了，結果以帳本為準 |
| 帳本保留 | 90 天 | 涵蓋一波施工加審查（約 1 個月）的回查需要；量約每日 25 列 |
| 驗收間隔 | 70 分鐘 | 60 分加 10 分容忍度（Edge 冷啟動、PayUni 回應時間） |

### 2.9 人要做的事（SOP 寫進 `docs/supabase-setup-checklist.md`）

順序依晉升機制拆成兩段（第 2 輪系統 P1-3）：migration 在晉升時就套用，Edge 要等核准後才部署。

**甲段：migration 套用後、Edge 部署前**，正式站與 develop 各做一次：

1. 確認 Edge Secrets 有 `RECONCILE_SECRET`。正式站另加 `PHOTO_PURGE_LIVE=true`，develop 不設。
   Edge secret 立即生效，舊版 Edge 不讀這個值，所以先設不會有影響。
2. 若階段 0 的結論是 pg_net 要從 Dashboard 開，在這一步開。
3. 在 SQL Editor 執行：
   - `select vault.create_secret('<url>', 'uknow_api_base_url');`
   - `select vault.create_secret('<secret>', 'uknow_internal_secret');`
   - 同名 secret 已存在時會失敗，改用 `vault.update_secret(<id>, '<值>')`。id 用 `select id, name from vault.secrets` 查。
4. 這段期間每小時第 7 分，舊版端點照常對帳，但不寫帳本。health 回 404，看門狗會補跑，不推 LINE。
   在步驟 3 之前若有排程觸發過，帳本會有 `skipped/vault_missing` 列，這是預期的。

**乙段：Edge 部署後**：

5. 確認 health 不再回 404：看門狗下一次 run 的 step summary 會顯示 `cronJobPresent`。
6. **立即驗證**：
   - 執行 `select public.invoke_internal_endpoint('reconcile');`，應回傳 request id。
   - 1 分鐘後執行 `select status, error_code, trigger from public.scheduled_job_runs order by id desc limit 1;`。
   - 結果判讀：

| 看到 | 代表 |
|---|---|
| `succeeded`（trigger 是 `pg_cron`） | 完成。這一列不在 §2.6 的 `<T0>` 之後，量測時不會算進去 |
| `skipped/vault_missing` | Vault 沒設好，回步驟 3 |
| 沒有新列 | 去查 `select status_code, content from net._http_response order by id desc limit 1;`：401 是密鑰不一致；404 是 Edge 還沒部署；沒有列是 pg_net 沒開 |

7. 輪替時照 §2.2 的順序。

**晉升清單**（主 session 寫進 `launch-wave-5/plan.md` §4，屬硬性驗收）：

- 甲段：正式站完成 1～3；`cron.job` 有 5 列。
- 乙段：正式站完成 6；Edge 部署核准後的第一個整點 +7 分，帳本出現 `pg_cron` 完成列。

## 3. 架構影響

- **新模組 `supabase/functions/api/scheduled-runs.ts`**
  - `withScheduledRun(deps, job, trigger, fn)`：契約見 §2.4。
  - deps 注入 rpc，測試寫成 `.unit.test.ts`，不得用 `adminClient`，否則依 T4 要改名。
- **對帳 handler 抽成 `handleReconcile(deps)`**，放在新檔 `supabase/functions/api/reconcile-handler.ts`（第 2 輪架構 P1 補測試縫；第 3 輪 P2-1 定落點）
  - `reconcilePendingOrders` 留在 `index.ts`，維持匯出，既有測試的 import 路徑不變。新增縫在端點層：驗證後的 heal pass、502 映射、租約；迴圈層本來就能注入 queryFn。
  - deps 含 `queryFn`、`resolveFn`、`scheduledRun`、`healRpc`。
  - `index.ts` 只接線，把 `queryPayUniTradeStatus`、`resolveOrderFromPayUni` 傳進去。
  - 端點層的 502、並行、帳本測試直接打 handler、注入假 queryFn，不必 stub `globalThis.fetch`。
- **`index.ts` 第 7 區段**
  - `queryPayUniTradeStatus`：未知狀態、同號比對。
  - `reconcilePendingOrders`：計數拆分、視窗排序、`reconcile_unknown_at` 的寫入與清除。
  - 新增 `GET /internal/scheduler-health`，放在 `/internal/system-alerts/recent` 旁邊。
  - 全滅／過半判斷抽成純函式 `classifyReconcileOutcome(summary)`，測試放 `.unit.test.ts`。
  - 和 S2 改的 prepare／register／cancel-signup 不同區，撞檔只在 rebase 時處理。
- **`listing-photos.ts`**：`purgeOrphans` 依 §2.3 的 trigger 分流；deps 加 `env('PHOTO_PURGE_LIVE')` 與 `scheduledRun`。
- **`_shared/api-contract.ts`**：這幾支是 internal 端點，現在不在契約裡，維持不加。health 的契約由 fixture 釘住。
- **workflow**
  - 兩支都保留 `schedule:`，各自仍是單一 job（規則 8a）。
  - reconcile 的 cron 由 `0 * * * *` 改成 `37 * * * *`。
  - 8b 的 `頻率依據:` 改寫成看門狗兼後備觸發的理由。成本落點：GitHub 牆鐘（public repo 免費）；補跑時的 PayUni 查詢；LINE 訊號疲勞，靠 6 小時節流控制。
  - 決策邏輯放在 `scripts/scheduler-watchdog.py`（純函式＋`--self-test`）。
  - `framework-check.sh` 照既有的 `if [ -f scripts/… ]` 範式加 self-test 區塊。
- **安全**
  - Vault 只有 definer 函式讀。
  - invoke 只打白名單路徑。
  - 帳本 `summary` 不放 uid 或 name，清理不送 `include_names`。
  - health 不回明細。
- **效能**：pg_net 在背景 worker 送出，不佔 cron 連線。對帳 50 張的 PayUni 查詢通常在 30 秒內。

## 4. UI/UX

- **無前端變更。**
- 後台「系統告警」頁會多出幾種 error。message 照 §2.5 範本，以前綴【對帳】【照片清理】區分。
  手機版完整顯示 message（`SystemAlerts.tsx` 用 `break-words`），所以訂單號與數量都寫進本文。
- 「標記已處理」的語意不變。小時桶告警在故障持續時，下一小時會再出現一筆；message 寫明「持續中會每小時再告警」，值班者不會誤以為標記了就結案。
- `unknown_trade_status` 是每張單一筆，去重到 resolve 為止，輪流掃描不會重複。
  一次湧入很多筆時，既有的 system_alerts 推送最多列 5 筆，並註明「另有 N 筆」。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

依賴關係（第 2 輪架構 P1 修正）：

- 0 → 全部；
- 1 → 3 的端點部分、4、5、6、8；
- 2 → 3：共用迴圈與 summary 型別，`unknownStatus` 要先存在；
- 3 → 4：`handleReconcile` 在階段 3 出現；
- 2 不依賴 1，最貼近錢，可以最先做；
- 6 → 7：共用 fixture；
- 8 掛排程，放最後；
- 9 收尾。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 0 | **spike**（不進產品碼） | 本機 `supabase start` 與 CI api-tests 軌 | 確認並寫進 progress.md：① migration 內 `create extension pg_net` 是否可行、裝在哪個 schema；② definer 能否讀 `vault.decrypted_secrets`；③ 測試連線能讀也能寫 `cron.job`，`cron.schedule`／`unschedule`／`alter_job` 在 definer 函式內可呼叫；④ anon／authenticated 對 net／vault 的權限；⑤ `net.http_post` 的斷言法（stub 或回傳 request id）；⑥ **硬閘門**：PayUni 官方 TradeStatus 碼表逐碼定案（§2.5 表）。任一項不行就停下回報主 session，修 plan |
| 1 | 帳本表＋`begin/finish_scheduled_run`＋`scheduled-runs.ts` | `scheduled-job-runs.test.ts`（D）、`scheduled-runs.unit.test.ts`（D unit） | 第二個 begin → skipped 列且 `acquired:false`；**兩條獨立連線**的並行交易只有一個拿到；15 分前的 running 改 abandoned；finish 對非 running 列不生效；wrapper 三種情況（回傳失敗、擲錯、沒租約）；權限 |
| 2 | pay P1-3：碼表、`unknownStatus`、同號比對、不標 expired、告警、`reconcile_unknown_at` 寫入／清除與視窗排序 | `payuni-query-alert.unit.test.ts`（D unit，**擴充既有檔**）、`reconcile-expire.test.ts`（D，真 DB） | 碼 `6`／`'8'`／缺欄位；Result 同號在第二位 → 取第二筆；Result 無同號；單項缺 MerTradeNo 的已付款單照舊收斂；數字型 MerTradeNo 收斂；平鋪 MerTradeNo 不符；建單 5 天仍 pending、一筆 error、第二輪不重複；51 張未知＋1 張新卡單 → 新卡單本輪被查到；恢復正常後欄位清回 null；`'0'` 的既有 expire 案例不變。先列出依賴 `?? list[0]` 的既有案例並逐一更新 |
| 3 | ops P1-3：計數拆分、`classifyReconcileOutcome`、`handleReconcile` 全滅 502、過半告警 | `reconcile-outcome.unit.test.ts`（D unit）、`reconcile-pending-payments.test.ts`（D） | **先在綠燈下抽出 `handleReconcile`**，既有測試不改且全綠，才寫新紅燈。summary 加欄位前，先列出斷言 `queryErrors` 等舊形狀的既有測試並逐一更新。純函式表格：0/0、1/1（不告警）、2/2、1/2（不告警）、2/3、1/3、3/3，混入 queryFailures 與 unknownStatus 不計入；handler：全部擲錯 → 502＋一筆 `query_all_failed`；**全部 queryFailure（棄付單）→ 200、不全滅**；全部 unknown → 200、不全滅；expire update 失敗不計入 |
| 4 | `handleReconcile` 接 `withScheduledRun` | `reconcile-pending-payments.test.ts`（D） | 兩個並行請求只有一個 `checked > 0`，另一個 `skipped:'concurrent'`；成功／502／擲錯三種結局的帳本 status 與 error_code 都對；trigger 落帳（未知值記 manual） |
| 5 | 照片清理：§2.3 分流表、接 `withScheduledRun`、失敗告警、J5 skipped 判讀 | `listing-photos.unit.test.ts`（D unit）、`listing-photo-orphans.test.ts`（D）、`purge-listing-photos-request.py --self-test` | 分流表每一列；dispatch 路徑回應與現行相同；斷路器與 sweep_failed → failed＋一筆 error；notRemoved>0 → warning、succeeded；J5 判斷放在 `bad_shape` 檢查之前：skipped 回應沒有 `dryRun` 與統計欄位，照樣 exit 0，輸出不帶 body 原文；檔頭 docstring 由 J1–J4 改成 J1–J5 |
| 6 | `scheduler_health()` RPC＋`GET /internal/scheduler-health` | `scheduler-health.test.ts`（D，留在 api-tests 軌，只改 fixture 的 PR 也會跑到） | 401；與 `shape.json` 雙向鍵集合一致；完成列的定義（業務失敗算、vault_missing／exception 不算）；`cronJobPresent`；`lastPurgeDryRun` 取非 null 的 pg_cron 列；不回明細 |
| 7 | `scripts/scheduler-watchdog.py` | `--self-test`（framework-check），讀 `scenario-*.json` | §2.5 判準表每一列與優先序（`cronJobActive=false` 時不得落到第 6 列）；停擺時最近一筆是 github 完成列仍判逾期；resume 後 401 → 第 6 列；6 小時節流（首推、桶內不推、跨桶推、查不到上次 run 就推）；purge 26h 與開關一致性兩個方向；補跑回 skipped 為中性；一次最多一則 LINE；body 前 200 字含「下一步」 |
| 8 | `invoke_internal_endpoint`＋`prune_scheduled_job_runs`＋`pause/resume_scheduled_jobs`＋三個 cron 排程（最後才掛） | `scheduled-job-runs.test.ts`（D） | Vault 沒值 → 回 null 並寫 `skipped/vault_missing`；有值 → 送出請求（照階段 0 的方法斷言）；`cron.job` 有三個預期排程（紅燈：沒排程時這條測試紅）；白名單外的 job 名擲錯；prune 只刪 90 天前；pause 後 `cron.job` 仍有兩列、`active=false`，resume 後恢復 `true`；測後還原 `cron.job`；權限 |
| 9 | 兩支 workflow 改寫＋文件 | `check-workflows.py`、`check-spec-drift.py`、`check-migration-versions.py`、`check-plans-scaffold.py`、`check-test-names.py` | 8b 註記改寫；B1～B4 與新 J5 案例綠；同步清單見下 |

**階段 9 文件同步清單**（第 2 輪架構 P2）

- `supabase/README.md`：排程、告警 severity、Migrations 表、函式表、一鍵停／恢復 SQL。
- `docs/supabase-setup-checklist.md`：§2.9 SOP、Edge secret 表加 `PHOTO_PURGE_LIVE` 一列。
- 規格書：§11 安全閘段；第 802 行，改寫「error 級由誰推 LINE」。
- `.claude/rules/supabase-functions.md` 的區段導航表：新增 `/internal/scheduler-health` 與 `scheduled-runs.ts`。
- `framework-check.sh`：加 self-test 區塊。
- 晉升清單：交主 session 寫進 `launch-wave-5/plan.md` §4，PR 內文附原文。
- 規格書若寫進 90 分、26 小時等常數，確認 `check-spec-drift.py` 不會失配。

**不加的測試**

- e2e 不受影響：全 mock，不碰 internal 端點。
- journey 不加章節：拋棄式分支上 pg_cron 只會寫 `vault_missing`。

## 6. 開放問題

- 第 1 輪的 Q1～Q6 與新增三題已由 W5-15～19 裁決（§0.1）。
- 第 2 輪的 P0（碼表）以階段 0 ⑥ 硬閘門處置（§2.5）：官方文件若與暫定表不符，停下回報主 session。
- 目前沒有待業主裁決的題目。

## 7. 風險與回滾（必答 5）

**最壞情況**

1. **租約失效、或空窗內舊版端點同時被 pg_cron 與 GitHub 打**：只多查幾次 PayUni（§2.4），不會重複開通。
   - 空窗通常只有數小時（等業主核准 production）。
   - 每輪最多 50 張，正式站 pending 量接近 0，PayUni 查詢額度不構成問題。
   - 額度若出事，症狀是查詢層錯誤，會被 `query_all_failed` 告警抓到。
2. **Vault 密鑰設錯**：每輪 401，端點不寫帳本 → 看門狗補跑，推一則 LINE P1，之後每 6 小時一則。對帳延遲上限等同現況。
   - 限制：401 只留在 `net._http_response`，保留約 6 小時。超過之後 LINE 的診斷只剩「停擺」，看不出是 401，要由人查 Vault 與 Edge secret。
3. **正式站忘了設 Edge `PHOTO_PURGE_LIVE`**：pg_cron 清理每天 dry-run，dry-run 也算成功，不會補跑。防線有兩道：
   - 每日開關一致性 LINE P2（§2.5）；
   - 晉升清單的硬性驗收項（§2.9）。
4. **未知 TradeStatus 大量出現**（例如 PayUni 新增一種等待碼）：
   - 單子移到視窗後段，不會餓死真卡單；
   - 不計入全滅，不會 502；
   - 每張一筆 error，去重到 resolve 為止，會擠壓值班注意力；
   - 處置：確認碼表後把新碼補進 `queryPayUniTradeStatus` 的已知處理，再批次 resolve 告警。
   - 階段 0 的硬閘門就是為了在上線前排除最常見的一種（官方的未付款／逾期碼）。

**一鍵停**（正式站 SQL Editor）

```sql
select public.pause_scheduled_jobs();   -- cron.alter_job(active := false)：對帳與清理兩個排程
select public.resume_scheduled_jobs();  -- cron.alter_job(active := true)
```

- 不用改 workflow。停了以後沒有新的完成列，看門狗在 90 分鐘／26 小時後自動由 GitHub 接手（也就是現況）。
- 看門狗看到 `cronJobActive=false`，每日推一則 P2「人為停用中」，不推「停擺」（第 2 輪 UI/UX P1；第 3 輪 P1-B）。
- 要立即接手，就 dispatch 兩支 workflow。
- 函式壞掉時的備援 SQL 寫進 `supabase/README.md`：`cron.alter_job` 直接下，或 `cron.unschedule`／`cron.schedule`。注意：直接 unschedule 會落到看門狗判準第 3 列，推「排程不存在」。

**migration 回滾**：只新增物件與一個 nullable 欄位，不需要 down migration；停排程即等於回到現況。

## 8. 第 1 輪審查處置（編號見 `git show 8d148aa:docs/plans/pg-cron-schedulers/review.md`）

| # | 處置 |
|---|---|
| 1 P0 | W5-19 豁免；門檻理由見 §2.8 |
| 2 | §2.1、§2.3：Vault 缺值寫 `skipped/vault_missing`；判準表 §2.5 區分過渡期與停擺；驗收 3 改寫 |
| 3 | §2.5：計數拆成 queryErrors／queryFailures／expireErrors |
| 4 | §2.5：移除 `?? list[0]`、平鋪 MerTradeNo 不符視為 no_matching_trade、缺 MerTradeNo 照舊；碼表進階段 0 |
| 5 | §2.5、§2.7：`reconcile_unknown_at` 視窗排序（W5-15③） |
| 6 | §2.5 每日 LINE P2；§2.9 晉升硬性項 |
| 7 | §2.4：skipped 落帳、15 分上限依據、finish 只更新 running、abandoned 進 health |
| 8 | §3 `withScheduledRun` try/finally；階段 1、4 驗所有擲錯路徑 |
| 9 | §2.1 毫秒、不重試；§2.5 pgNet6h 只當診斷 |
| 10 | 階段 0 spike；階段 8 斷言方式依 spike |
| 11 | §5 拆成 0～9 並寫依賴，排程最後掛 |
| 12 | §2.5 schema＋共用 fixture |
| 13 | §2.8 參數表 |
| 14 | §2.1「為什麼要自建帳本」；W5-15④本波做 |
| 15 | W5-18 不收 |
| 16 | §2.5 每次最多一則看門狗 LINE、同根因合併；pg_net 不再獨立觸發 |
| 17 | §2.5 message 範本表 |
| 18 | §7 最壞 1 |
| 19 | §2.7、階段 0 ① |
| 20 | §2.4 `exception when unique_violation` |
| 21 | §2.5 補跑 skipped 不算成功 |
| 22 | §2.4 notRemoved 在 pg_cron 路徑為 warning |
| 23 | §2.7 revoke all |
| 24 | §3 `scheduled-runs.ts` |
| 25 | 階段 3 `reconcile-outcome.unit.test.ts`；新檔名施工時跑 `check-test-names.py` |
| 26 | §2.3 分流表 |
| 27 | 階段 9 同步清單 |
| 28 | §2.2 輪替順序；W5-15⑥不分密鑰 |
| 29 | §2.9 有序 SOP 與立即驗證 |
| 30 | 驗收 4 改寫 |
| 31 | §2.6 唯一判準 |
| 32 | §1 不做什麼 |
| 33 | §2.5 前綴 |

## 9. 第 2 輪審查處置（review.md「第 2 輪」節）

| 第 2 輪發現 | 處置 |
|---|---|
| 系統 P0：碼表前提 | §2.5 暫定碼表（`6`＝退款 → unknown），附第三方來源；階段 0 ⑥ 改為硬閘門；官方若有未付款／逾期類的碼，併入 `0` 的路徑 |
| 系統 P1-1：queryFailure 算進全滅，會造成假 502 與假停擺 | §2.5 全滅只計擲錯；`checked >= 2`；「完成列」與「存活」的定義，業務失敗不補跑、不推停擺 |
| 系統 P1-2：同號比對的回歸 | §2.5 同號比對規則（單項缺鍵照舊接受、`String().trim()`），階段 2 案例 |
| 系統 P1-3：SOP 時序 | §2.9 拆成甲、乙兩段，晉升清單對應兩個時點 |
| 系統 P1-4：nullsFirst、欄位不清除 | §2.5 明寫 `nullsFirst: true`、在真 DB 測、非 unknown 時清回 null、更新失敗只記 warning |
| 系統 P2-1～4 | §2.5：error 形狀不動、補跑 curl 不重打 502；§2.4 並行測試用兩條連線；`cronJobPresent` 取代 `cronDispatches24h`；`lastPurgeDryRun` 取非 null 列 |
| 架構 P1：2、3 的依賴 | §5 改成 2 → 3；unknown 不計入全滅，補「全部 unknown」案例 |
| 架構 P1：fn 回傳契約 | §2.4 `withScheduledRun` 契約 |
| 架構 P1：測試縫 | §3 抽出 `handleReconcile(deps)` |
| 架構 P1：清理的 skipped 判讀 | §2.4 J5 |
| 架構 P1：本機 cron 污染測試 | §2.7 測試清表、自建列、時間範圍 |
| 架構 P2：migration 跨階段、prune 無測試、fixture 未定案、workflow job 數、文件漏項、擴充既有檔 | §2.7 progress 記錄；prune 抽成函式並由階段 8 測；`shape.json`＋`scenario-*.json` 雙向比對；單一 job；§5 同步清單；階段 2 註明擴充既有檔 |
| UI/UX P1：200 字截斷 | §2.5 前 200 字寫結論與動作，self-test 斷言 |
| UI/UX P1：人為停用後持續推 LINE | §7 `pause_scheduled_jobs()` 寫 `manually_disabled`；看門狗每 24 小時推一則 P2 |
| UI/UX P2：unknown 洗版、操作入口、SOP 細節 | §4 去重到 resolve；§2.5 範本補入口；§2.9 補 `update_secret`、結果判讀表、驗證列以 `<T0>` 排除 |
| 需求 P1：驗收 1 與補跑的關係、驗證列扣除 | §1 驗收 1 只量 pg_cron 路徑；§2.6 加 `<T0>` 下界 |
| 需求 P1：過半門檻的依據 | §2.8 補 1/2 的取捨，並註明派工沒有下限、由 W5-19 授權 |
| 需求 P2：排程沒掛上被吞、purge 每小時重推、prune 無測試 | `cronJobPresent=false` 推 P1；purge 逾期只在每日 run 檢查；prune 由階段 8 測 |

## 10. 第 3 輪覆核處置（review.md「第 3 輪」節）

| 第 3 輪發現 | 處置 |
|---|---|
| 系統 P1-A：`lastCompletedAt` 被 GitHub 補跑刷新 | health 加 `lastPgCronCompletedAt`；存活判斷與 `m` 都以它為準；停擺期間每小時補跑 |
| 系統 P1-B＝架構 P1：pause 用 unschedule，與「排程不存在」列衝突 | 改用 `cron.alter_job(active)`；health 加 `cronJobActive`；判準表寫明優先序（§2.5） |
| 系統 P1-C：`manually_disabled` 殘留、節流公式未定 | 停用狀態改看 `cronJobActive`，不靠帳本標記；節流公式寫死；推播失敗讓 run 判紅 |
| 系統 P2：24 小時節流沒有機制 | 只在 UTC 01 時那一輪推 |
| 系統 P2：curl `--retry` 也會重打 5xx | 不帶 `--retry`，連線層失敗由 shell 迴圈重試 |
| 架構 P2-1：`handleReconcile` 落點、3 → 4 | 新檔 `reconcile-handler.ts`；`reconcilePendingOrders` 留在 `index.ts`；階段 3 先綠燈下抽出；補上 3 → 4 依賴 |
| 架構 P2-2：J5 的順序 | 放在 `bad_shape` 之前，docstring 一併更新 |
| 架構 P2-3：`cron.job` 的測試隔離 | 階段 0 ③ 擴成能讀也能寫；測試自己改過的 `cron.job` 要還原 |
