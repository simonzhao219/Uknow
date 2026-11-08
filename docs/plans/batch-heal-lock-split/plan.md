# 批次自癒與線上付款互鎖 規劃書（第 6 波 S1）

<!-- plans-keep: 第 6 波 S1 施工鷹架（跨 session：規劃 session → 業主審 → /tdd-implement）；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

上游：第 6 波 `plan.md` §2 S1（W5-72、W6-8）；R5 `docs/plans/launch-wave-5/review.md` §1.3 P2-5、P2-7、P2-8、P2-9。
行號以 `origin/develop`（本分支起點）現算。

## 0. 一句話

讓排程自癒（heal pass）一筆訂單一個交易處理，不再跟線上付款互鎖、害獎金漏發；漏發時改推 LINE；
對帳帳本記下 heal 結果與未知狀態的原因，人工觸發的對帳不再冒充 pg_cron。

## 1. 使用者需求

- 規格書 §8.2～§8.3（三代獎金每筆付款都發、每代例外隔離、自癒補償）、§9（任務／推薦王）；
  `supabase/README.md`〈排程〉。
- 驗收情境：
  1. **P2-5**：U1 是 X 的推薦人、X 是 U2 的推薦人；U1、U2 各有一張「已付款待開通」單，排程 heal 跑的同時
     X 線上付款 → 三筆都開通，**X 付款給 U1 的第 1 代、U2 付款給 X 的第 1 代都在**，沒有 deadlock 告警。
  2. 任何原因（死鎖、序列化失敗、其他非預期錯誤）讓某一代獎金沒寫進去 → `system_alerts` 一筆 **error**
     （推得到 LINE），context 看得出：哪筆付款（trade_no／subscription_id 或 claim_id）、第幾代、該拿的人、SQLSTATE。
  3. **P2-7**：對帳帳本 `scheduled_job_runs.summary` 有 `unknownByReason`，四種原因各自計數。
  4. **P2-8**：帳本 summary 有 `heal`（候選數、完成數、failed、skippedLocked、amountMismatch、heal 本身是否出錯）；
     `scheduler_health()` 回 reconcile 的「heal 連續出問題輪數」，看門狗看得到。
  5. **P2-9**：在 SQL Editor 跑 `select invoke_internal_endpoint('reconcile', 'manual')` → 帳本記 `trigger=manual`，
     不刷新 `lastPgCronCompletedAt`；pg_cron 排程指令不變，照樣記 `pg_cron`。
- 不做：改 `process_successful_payment`（S6 要動 0d，避免撞檔）；改 profiles 鎖的模式（見 §2.3）；
  `repair_orphaned_*` 三支的同類問題（§2.5，列第 7 波候選）；drop 舊的 `complete_paid_pending_orders`（§2.4）。

## 2. 系統設計

### 2.1 為什麼會互鎖（現況，`20261113000003` 批次段 `complete_paid_pending_orders`）

- 單一函式＝單一交易，迴圈依序處理多筆。每筆在 `process_successful_payment` 0b 與 `apply_referral_side_effects`
  對**付款人本人** `profiles` 取 `for update`，發獎 `insert reward_transactions` 的 FK 檢查對**收獎者** `profiles`
  取 `KEY SHARE`（與 `for update` 互斥）。
- 每筆包在 `begin … exception` 子交易內。**子交易正常結束時，它拿到的列鎖與 advisory 鎖移交給上層交易，
  直到整個交易 commit 才放**；只有子交易回滾時才釋放。所以「DB 內每筆一個子交易」放不掉鎖。
- plpgsql **函式**不能 commit；**procedure** 可以在迴圈內 `commit`，但只限以頂層 `CALL` 呼叫、不在外層交易區塊內
  ——PostgREST `rpc()` 不能呼叫 procedure，heal pass 又必須跑在 Edge 端的租約與帳本內（`reconcile-handler.ts`
  `handleReconcile`，W5 帳本設計），改成 pg_cron 直接 `CALL` 會脫離租約。

### 2.2 選案：Edge 端迴圈，每筆一個交易（推薦）

| 案 | 鎖何時放 | 代價 |
|---|---|---|
| A. Edge 迴圈呼叫單筆 RPC | 每筆 RPC 是一次 PostgREST 請求＝一個交易，**該筆 commit 就放**；任何時刻 heal 只持有一位付款人的鎖，與一筆線上付款等價 | 每筆一次 HTTP 往返（一輪上限 50，平常 0～2） |
| B. DB procedure + 迴圈內 commit | 每筆 commit 就放 | 不能經 PostgREST 呼叫；要嘛脫離 Edge 租約／帳本，要嘛另開 dblink——都比 A 大 |
| C. 子交易（現況形態） | 整批結束才放 | 不解決問題 |

新增兩支 RPC（新 migration，`service_role` 限定）：

- `list_paid_pending_order_ids(p_user_id uuid default null, p_limit int default 50) returns uuid[]`
  ——候選謂詞（`status='pending' and payuni_response->>'Status'='SUCCESS'`、依 `created_at`）的唯一出處，不上鎖。
- `complete_paid_pending_order(p_order_id uuid) returns jsonb`——現行迴圈體原樣搬進來：`for update skip locked` 重讀重驗、
  金額重驗與去重告警、設 `uknow.rewire_try_lock` 後委派 `process_successful_payment`、U6R01 → `skipped_locked`、
  其他例外 → `failed`＋error 告警。回 `{outcome: completed|skipped|skipped_locked|amount_mismatch|failed, error?}`。
- `complete_paid_pending_orders(uuid, int)` 改寫成「呼叫上面兩支」的薄 wrapper，回傳形狀不變（相容舊 Edge，§2.4）。

Edge：新檔 `supabase/functions/api/paid-pending-heal.ts` 匯出 `healPaidPendingOrders(rpc, userId?)`：
先 list，再逐筆 `await` 單筆 RPC，彙總成與舊回傳**同形**的 `{candidates_found, completed_count, completed_order_ids,
amount_mismatch, skipped_locked, failed}`（回應 `data.heal` 契約不變）。單筆 RPC 本身擲錯（網路）記進 `failed`、繼續下一筆。
`index.ts` 的 reconcile `heal` dep 與 `healPaidPendingOrdersBestEffort(userId)`（`/payuni/result`、`/profile`）都改用它
——per-user 那條也有同類風險：同一人兩張待開通單時，第 1 張已鎖住推薦人 R 的 `task_progress`（推薦王對帳），
第 2 張發獎要 KEY SHARE `profiles(R)`，R 自己正好付新約（持 `profiles(R)`、3-0 要 `task_progress(R)`）→ 成環。

`uknow.rewire_try_lock` 保留：單筆交易內雖然已沒有「前幾筆的鎖」，但維持 W5-61 已核實的 `skipped_locked` 語意
（R5 §1.1），heal 不必在 HTTP 請求裡乾等換線鎖。

### 2.3 鎖序（不得新增死鎖）

- 單筆 heal 交易的取鎖順序與線上 `/payuni/notify` 完全相同（同一支 `process_successful_payment`）：
  訂單列 → [換線 advisory，try] → `profiles(本人) for update` → 發獎 KEY SHARE `profiles(上線)` → `task_progress(上線)`。
  `20261113000003` 檔頭「不成環」的論證（他人對 `task_progress(本人)` 的鎖一定在其對 `profiles(本人)` 取 KEY SHARE 之後）
  對「兩筆線上付款」成立，heal 變成單筆後同樣成立。
- prepare 的 `for no key update`（`20261113000002`）與 `for update` 互斥、與 KEY SHARE 相容——本案不動它，序列化不變。
- **刻意不把 0b 的 `for update` 降成 `for no key update`**：表面上能讓 FK 的 KEY SHARE 不被擋、直接拆掉 P2-5，
  但上面那條「不成環」論證正是靠 `for update` 擋住 KEY SHARE；降級會打開 `task_progress` 那條環。
- 本案新增的鎖：無（list 不上鎖；單筆函式的鎖都是既有的）。

### 2.4 部署相容（正式站 migration 安全）

- main push → Supabase 原生整合先套 migration；deploy-supabase 在 CI 綠後才部署 Edge。期間舊 Edge 仍呼叫
  `complete_paid_pending_orders`——wrapper 保住它，行為與現況相同（含舊的互鎖風險，只到新 Edge 上線為止）。
- 反向（Edge 先於 migration，W5-62 尚未自動擋）：新 Edge 呼叫不存在的 RPC → list 回錯 → 計為 heal error，
  寫進帳本 summary（§2.6），不擲到路由；下一輪 migration 套上就好。
- migration 全部 `create or replace`／`drop function if exists`，可重跑；不動資料。舊 wrapper 的 drop 留給 S6 或第 7 波
  （與三參數 `prepare_payment_order` 同一套路）。

### 2.5 發獎失敗改推 LINE（`pay_referral_generations`，基準 `20261113000001`）

- 三代各自的 `when others`：`warning` → **`error`**，告警訊息開頭寫明「第 N 代推薦獎金沒有發出」；context 加
  `beneficiary`（該代收獎者）、`sqlstate`、`trade_no`（由 `subscriptions.source_payment_order_id` 反查，claim 路徑為 null）。
  40P01／40001 另在訊息註明「資料庫互鎖／序列化衝突，會員下次載入個人頁會自動補發」。
  `unique_violation` 維持靜默（冪等）。**範圍＝所有非預期錯誤**（建議；開放問題 Q1）：任何一種都是漏發錢。
- `apply_referral_side_effects` 3c（整支 `pay_referral_generations` 擲錯）同理改 error（同一筆錢）。這是本案唯一碰
  `apply_referral_side_effects` 的地方——S6 若也要改它，以本案為基準。
- 同類掃描結果（不在本案修）：`repair_orphaned_payments`／`_claim_rewards`／`_forfeitures` 也是單交易迴圈，但只由 Edge
  以 `p_user_id` 呼叫（同一人），互鎖要「同一人 ≥2 筆待補」＋推薦人同時付新約，機率極低，且漏發時上面的 error 告警會響。
  列第 7 波候選。規格書 §8.3「warning-only」一句要同步改。

### 2.6 帳本 summary 與看門狗（W6-8：P2-7、P2-8）

- `reconcilePendingOrders` summary 加 `unknownByReason: {unknown_code, missing_field, no_matching_trade,
  incomplete_too_long}`（`UNKNOWN_STATUS_LABEL` 的四個 key；R5 只列三個，`no_matching_trade` 也是同一條路）。
  `unknownStatus` 總數保留（＝四者和）。
- `handleReconcile` 把 heal 摘要併進 outcome.summary：`heal: {candidates, completed, failed, skippedLocked,
  amountMismatch, error: boolean}`——只放計數，不放訂單 id（帳本 comment：summary 不放 uid）。
- `scheduler_health()`：reconcile 加 `healIssueStreak`（最近連續幾輪 pg_cron 完成列的 `summary.heal` 有
  `failed>0` 或 `error=true`）與 `healSkippedStreak`（連續 `skippedLocked>0`）。`scripts/fixtures/scheduler-health/shape.json`
  與 `scheduler-watchdog.py` 同步；看門狗是否推 LINE 見 Q2。
- heal 整支失敗（list 回錯）目前只 `console.error`（`reconcile-handler.ts` 那段「已知缺口」註解）：本案改成寫進
  summary `heal.error=true`，並 `alertOnce` error（小時桶，同 `query_all_failed`），註解刪掉。見 Q2。

### 2.7 `invoke_internal_endpoint` 加 trigger（P2-9）

- `drop function if exists public.invoke_internal_endpoint(text)` 後建 `invoke_internal_endpoint(p_job text,
  p_trigger text default 'pg_cron')`；`p_trigger` 只收 `pg_cron`／`manual`，其他擲錯。body 與 vault_missing 列都用它。
- 一定要 drop 舊版：兩支並存時 `invoke_internal_endpoint('reconcile')` 會多載歧義，**pg_cron 排程直接壞掉**。
  cron.job 的指令字串在執行時才解析，同一 migration 交易內 drop＋create，指令不必改；測試釘住指令仍可執行。
- revoke／grant 照原樣補在新簽章上；`scheduled-job-runs.test.ts` 的權限斷言簽章改成 `(text, text)`。
- Edge 的 `parseScheduledTrigger` 已把 `'manual'` 記為 manual，不必改。`docs/supabase-setup-checklist.md` 的人工驗證
  步驟改帶 `'manual'`。

## 3. 架構影響

- 動到：新 migration `20261114000001_batch_heal_lock_split.sql`（版本號實作時以 check-migration-versions.py 為準）、
  新檔 `paid-pending-heal.ts`、`reconcile-handler.ts`、`index.ts`（heal dep、`healPaidPendingOrdersBestEffort`、
  `reconcilePendingOrders` summary）、`scheduler-watchdog.py`＋fixture、`supabase/README.md`、規格書 §8.3。
- 不動：`process_successful_payment`、prepare、前端、`_shared/api-contract.ts`（`data.heal` 形狀不變）。
- 與 S6 的介面：S6 改 `process_successful_payment` 0d 與 drop 三參數 prepare，本案都不碰；S6 若要動
  `pay_referral_generations`／`apply_referral_side_effects`／`complete_paid_pending_orders`，以本案 migration 為基準
  （「基準＝本案，唯一差異＝…」的檔頭慣例）。S6 可順手 drop 舊 wrapper。
- 效能：heal 每輪多 N 次 RPC（N≤50，正常 0～2），遠低於 pg_net 150 秒逾時。

## 4. UI/UX

無畫面變更。LINE 告警文字照 W5-53 用語（「推薦人」「第 N 代」，不用禁用詞）。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | **死鎖重現 → 單筆交易 heal**：新 RPC 兩支、wrapper、`paid-pending-heal.ts`、index.ts 兩處改用 | `api/heal-lock-split.test.ts`（兩條 `postgres` 原生連線，見下）；`api/paid-pending-heal.unit.test.ts`（彙總、單筆擲錯繼續）；既有 `complete-paid-pending-orders.test.ts` 全綠（wrapper 相容） | 紅：對現行 heal 跑 U1/X/U2 拓撲 → 缺一筆第 1 代＋一筆 40P01 告警。綠：兩筆第 1 代都在、無 40P01 |
| 2 | 發獎失敗改 error | `api/referral-reward-failure-alert.test.ts`：(a) 用舊 wrapper 重現同拓撲（wrapper 仍是單交易）→ 告警 severity=error、context 有 generation／beneficiary／sqlstate=40P01／trade_no；(b) 非死鎖錯誤（以觸發器讓 reward 插入擲錯）→ 同為 error | 現況 warning → 紅；改後綠 |
| 3 | 帳本 summary：`unknownByReason`、`heal` | `reconcile-outcome.unit.test.ts`／`reconcile-pending-payments.test.ts` 增列 | summary 鍵與計數正確；heal error 時 `heal.error=true` 且告警一次 |
| 4 | `scheduler_health` streak＋看門狗 | `scheduled-job-runs.test.ts`；`scheduler-watchdog.py --self-test` 情境；shape.json | 連續三輪 failed → streak=3；中間一輪乾淨 → 歸零 |
| 5 | `invoke_internal_endpoint(p_job, p_trigger)` | `scheduled-job-runs.test.ts` | `'manual'` → 帳本 manual；預設 → pg_cron；非法值擲錯；cron.job 指令照樣可執行、無多載歧義；權限斷言新簽章 |
| 6 | 收尾 | `npm run check:full`、check-spec-drift／migration-versions、README 同步 | 全綠 |

**死鎖重現測試的編排**（階段 1 紅燈要真的紅，不靠機率）：
1. 建 U1←X←U2（`referredByCode`），U1、U2 先各付一次成為曾訂閱者後，各塞一張 extend 的「待開通」單
   （U1 的 `created_at` 較早）；X 一張 pending 單（線上付款用）。
2. 連線 B：`begin; select 1 from profiles where id=X for update;`（模擬 X 的付款已過 0b）。
3. 連線 A：非同步啟動 heal（階段 1 紅燈對「現行實作」＝`complete_paid_pending_orders(null)`；綠燈對新 Edge 迴圈）。
   輪詢 `pg_stat_activity`／`pg_locks` 直到 A 在等 `profiles(X)`（處理 U2、發獎給 X 時）。現行實作此時已持有 `profiles(U1)`。
4. 連線 B：同交易內 `select process_successful_payment(X, …)` → 發第 1 代給 U1 要 KEY SHARE `profiles(U1)`。
   現行：互等 → `deadlock_timeout`（1s）後一方被選中，該代被 `when others` 吞掉。新版：A 處理 U1 的交易早已 commit，B 不等；
   B commit 後 A 繼續。
5. 斷言：`reward_transactions` 有 (referee=X, gen1, user=U1) 與 (referee=U2, gen1, user=X)；`system_alerts` 無 40P01。
   測試結束 `statement_timeout` 兜底，不會卡死 CI。

## 6. 開放問題

- [ ] **Q1 改 error 的範圍**：只有 40P01／40001，還是 `pay_referral_generations` 所有非預期錯誤？
  建議：**所有非預期錯誤**（`unique_violation` 除外）——每一種都是漏發錢；平常量是 0，不會洗版。
- [ ] **Q2 heal 出問題要不要推 LINE**：(a) 只記帳本＋`scheduler_health` 看得到；(b) 另加：heal 整支失敗 `alertOnce` error
  （小時桶）＋看門狗在 `healIssueStreak≥3` 推 P2 LINE；(c) 只做 heal 整支失敗的 alertOnce。
  建議：**(b)**。單筆失敗本來就有 error 告警（推 LINE），缺的是「整支沒跑」與「連續被跳過」；`skippedLocked` 連續只進
  step summary、不推 LINE（換線鎖忙是正常現象）。注意這推翻 W5-18「heal 失敗不收」的決定，需業主確認。
- [ ] **Q3 舊 wrapper 何時 drop**：建議**交給 S6**（S6 本來就要 drop 三參數 prepare、做部署前 migration 確認，同一套路）。

## 7. 風險與回滾

- 最壞：新 Edge 的迴圈有錯 → heal 不收斂，卡單留到下一輪／使用者載入 `/profile`；`data.heal` 與帳本看得到。
  回滾＝revert Edge（wrapper 還在，舊 Edge 直接可用）；migration 不需回滾（新函式閒置無害，error 告警是純加強）。
- `invoke_internal_endpoint` 簽章改錯會讓 pg_cron 每輪失敗 → 看門狗 90 分內補跑＋推 LINE（既有）；測試釘住 cron 指令可執行。
- 正式站需要的資料（業主審規劃時可決定要不要查）：目前 pending＋SUCCESS 單數、近 30 天
  `pay_referral_generations` warning 樣本——用來確認 P2-5 是否已實際發生過、要不要人工補發。
