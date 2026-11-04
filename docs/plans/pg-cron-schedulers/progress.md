# 對帳與照片清理改由 pg_cron 觸發 實作進度

分支：`feature/pg-cron-schedulers`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | spike：pg_net 安裝、Vault 讀取、cron.job 讀取、net／vault 權限、net.http_post 斷言法、TradeStatus 碼表 | 🟡 ①②③⑤ ✅；④ 依 W5-31 接受平台預設；⑥ 待業主放行 docs.payuni.com.tw（W5-32 (a)），階段 2 等它 | — | — |
| 1 | 帳本表＋begin/finish_scheduled_run＋scheduled-runs.ts | ✅ 綠 | 29a5adec | （本 commit） |
| 2 | pay P1-3：unknownStatus、移除 ?? list[0]、不標 expired、視窗排序 | ⬜ 未開始 | | |
| 3 | ops P1-3：計數拆分、全滅 502、過半告警 | ✅ 綠（先做，見偏離） | 9385e16c | 725b3c8c |
| 4 | 對帳 handler 接 withScheduledRun | ✅ 綠 | e4b39c5f | （本 commit） |
| 5 | 照片清理 trigger 分流＋帳本＋失敗告警 | ✅ 綠 | 840df1d4 | （本 commit） |
| 6 | scheduler_health RPC＋GET /internal/scheduler-health | ✅ 綠 | d40c1f73 | （本 commit） |
| 7 | scripts/scheduler-watchdog.py | ✅ 綠 | a74b0c68 | （本 commit） |
| 8 | invoke_internal_endpoint＋cron 排程（最後才掛） | ✅ 綠 | 5c749608 | （本 commit） |
| 9 | 兩支 workflow 改寫＋文件同步 | ⬜ 未開始 | | |

（紅綠燈 hash 以 PR 內文為準，rebase 後更新 PR 內文的表。）

## 目前位置與下一步

規劃第 2 版（處置第 1 輪審查、W5-15～19 裁決）已完成並重跑 /review-plan；等主 session 親審後，業主在本 session 親打 `/tdd-implement pg-cron-schedulers`。開工先做階段 0 spike。

## 階段 0 spike 結果（2026-11-05 台北凌晨）

環境：本機 `supabase start` 拉不到 ECR 上的 gotrue 映像（CDN 被代理擋）。改用 `docker run supabase/postgres:17.11.0.011`，與 CI 同一版映像，以 `postgres` 角色測試（migration 的執行角色）。

| # | 項目 | 結果 |
|---|---|---|
| ① | migration 內安裝 pg_net | ✅ `create extension if not exists pg_net with schema extensions` 以 postgres 角色成功；函式在 `net` schema；重跑會 skip。不加 `with schema` 時，extension 物件會落在 public，所以要寫明 |
| ② | definer 讀 `vault.decrypted_secrets` | ✅ definer 函式讀得到；anon／authenticated 對 vault schema 沒有 USAGE |
| ③ | `cron.job` 讀寫、`cron.schedule`、`cron.alter_job` | ✅ postgres 可讀寫；definer 函式內呼叫 `alter_job(active)` 可行 |
| ④ | anon／authenticated 對 net 的權限 | ❌ **與 plan §2.2 假設不符**：裝完後 anon、authenticated 都有 `net` 的 USAGE、`net.http_post` 的 EXECUTE、`net._http_response` 的 SELECT。postgres 角色 revoke 無效（net 的擁有者與授權者都是 supabase_admin）。`supabase/config.toml` 沒有設 `[api] schemas`，PostgREST 預設只開 public、graphql_public，所以**經 REST 碰不到 net**；只有 SQL 層的直連角色才有這些權限 |
| ⑤ | `net.http_post` 的斷言法 | ✅ 呼叫後回傳 request id，同一 session 內 `net.http_request_queue` 立刻看得到 url；worker 送出後 `net._http_response` 有一列（打不存在的 port → `error_msg='Could not connect to server'`）。測試斷言回傳 id 非 null，並查 queue 或 response 的 url 即可，不必 stub |
| ⑥ | PayUni 官方 TradeStatus 碼表 | ❌ **查不到**：`docs.payuni.com.tw` 不在本 session 的網路白名單（DNS 解析失敗）。目前只有第三方整理（0／1／2／3／6） |

## migration 各階段追加的段落（`20261111000001_scheduled_job_runs.sql`）

- 階段 1：`scheduled_job_runs` 表與索引、RLS＋revoke、`begin_scheduled_run`、`finish_scheduled_run`
- 階段 6：`scheduler_health()`（net 表用動態查詢；pg_net 未裝時 pgNet6h 為 0／空陣列）
- 階段 8：`create extension pg_net with schema extensions`、`invoke_internal_endpoint`、`prune_scheduled_job_runs`、`pause／resume_scheduled_jobs`（`cron.alter_job`）、三個 `cron.schedule`。`supabase db reset` 從頭套用已驗證

## 偏離規劃（PR 內文要列）

- **階段 3 早於階段 2**：plan §5 寫 2 → 3。階段 2 在等官方碼表（W5-32），主 session 指示 3～9 先做。階段 3 的全滅判斷本來就不計 `unknownStatus`，所以可以先做。「全部 unknown → 不全滅」那條案例移到階段 2 補。
- **階段 3 的 handler 層測試放在 `reconcile-outcome.unit.test.ts`**，用注入的假 deps；plan 原寫在 `reconcile-pending-payments.test.ts`（D）。迴圈計數也用假 client，才能做出「標 expired 的 update 失敗」。真 DB 的迴圈測試照舊全綠。
- **紅燈 commit 9385e16c 的測試名有兩條超過 72 字**：commit 前的命名檢查被 `| tail` 吞掉 exit code，沒擋下來。紅燈期測試檔被鎖，所以綠燈後另開一個 commit 只改名稱、不改斷言。

## 實作決定（plan 未明定，PR 內文要列）

- `withScheduledRun`：帳本本身壞掉（begin 或 finish 擲錯）時只記 log，照樣執行 fn、照樣回應，不讓觀測故障停掉金流安全網。這種情況沒有完成列，看門狗會補跑並告警，所以不會靜默。

## 本機全套 Deno 測試的已知環境失敗（與本案無關）

- 本機 `supabase start` 用 CLI 3.0.0，並排除了 mailpit 等服務。全套 631 條中有 33 條失敗：
  - 邀請信類約 28 條（`inviteUserByEmail`／`unavailable`），因為沒有 mailpit；
  - `rls-policies` 兩條 GRANT 斷言，CLI 版本的預設權限不同；
  - 其餘是邀請衍生的錯誤。
- 本案的測試檔全部綠。以 CI 的 api-tests 軌為準。

- 照片清理在 pg_cron 路徑也忽略 body 的 `include_names`（plan §2.3 只列了 dry_run／force_ratio）：排程不需要 name，回應與帳本都不帶 uid。
- 清理的 `notRemoved > 0` 告警用 dedupe `{reason:'not_removed', day}`，severity 為 warning（plan §2.4）。

- 看門狗 R2（health 查詢失敗）與 R3（排程不存在）的 6 小時節流沒有 L 可算，改用「上次 run 與現在是否落在不同的 UTC 6 小時格」。plan §2.5 寫的是「以 lastCompletedAt 代替或以距上次 run 計算」，這裡取後者，免得 L 很新時永遠不推。
- 階段 6 的綠燈 commit 80f79edb 是在鎖仍存在時提交的：tdd-unlock 第一次撞到已知偶發的 `PhotoPicker.test.tsx`〈取消與 Esc 都只取消當張〉（plan §3），我沒看清輸出就 commit。內容不受影響，重跑 unlock 就綠了。

## Blockers（逃生口紀錄）

- 2026-11-05：階段 0 的 ④⑥ 不過，依主 session 指示停下回報，沒有自行改設計。
  - ④ → W5-31（業主 2026-11-05 04:00 互動選項：「接受平台預設 (Recommended)」）。plan §2.2 與階段 8 的權限斷言已照改。
  - ⑥ → W5-32：走 (a)，業主放行 `docs.payuni.com.tw` 後由本 session 查官方碼表；仍查不到就回報主 session。主 session 指示階段 1、3～9 先做，階段 2 等碼表。

## 框架摩擦

- 雲端容器的 `supabase start` 拉不到 `public.ecr.aws`（CloudFront blob 被代理擋），但 Docker Hub 拉得到。做法：
  1. 先 `nohup dockerd &` 起 daemon；
  2. 逐一 `docker pull supabase/<img>`（postgrest 要從 `postgrest/postgrest` 拉）；
  3. `docker tag` 成 `public.ecr.aws/supabase/<img>`；
  4. 再 `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,mailpit`；
  5. 跑測試前 export `supabase status -o env` 的 URL 與兩把 key（同 ci.yml）。
- 這段該進 friction-log，收尾時搬過去。
