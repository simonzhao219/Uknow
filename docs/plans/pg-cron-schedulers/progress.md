# 對帳與照片清理改由 pg_cron 觸發 實作進度

分支：`feature/pg-cron-schedulers`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | spike：pg_net 安裝、Vault 讀取、cron.job 讀取、net／vault 權限、net.http_post 斷言法、TradeStatus 碼表 | 🟡 ①②③⑤ ✅；④ 依 W5-31 接受平台預設；⑥ 待業主放行 docs.payuni.com.tw（W5-32 (a)），階段 2 等它 | — | — |
| 1 | 帳本表＋begin/finish_scheduled_run＋scheduled-runs.ts | ⬜ 未開始 | | |
| 2 | pay P1-3：unknownStatus、移除 ?? list[0]、不標 expired、視窗排序 | ⬜ 未開始 | | |
| 3 | ops P1-3：計數拆分、全滅 502、過半告警 | ⬜ 未開始 | | |
| 4 | 對帳 handler 接 withScheduledRun | ⬜ 未開始 | | |
| 5 | 照片清理 trigger 分流＋帳本＋失敗告警 | ⬜ 未開始 | | |
| 6 | scheduler_health RPC＋GET /internal/scheduler-health | ⬜ 未開始 | | |
| 7 | scripts/scheduler-watchdog.py | ⬜ 未開始 | | |
| 8 | invoke_internal_endpoint＋cron 排程（最後才掛） | ⬜ 未開始 | | |
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
