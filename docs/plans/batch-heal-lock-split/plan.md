# 批次自癒與線上付款互鎖 規劃書（第 6 波 S1）

<!-- plans-keep: 第 6 波 S1 施工鷹架（跨 session：規劃 session → 業主審 → /tdd-implement）；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

上游：第 6 波 `plan.md` §2 S1（W5-72、W6-8）；R5 `docs/plans/launch-wave-5/review.md` §1.3 P2-5、P2-7、P2-8、P2-9。
裁決：W6-10～W6-14（業主 2026-11-08 互動選項，主 session 轉達，見 §6）。行號以 `origin/develop`（本分支起點）現算。
修訂 r2：併入 `review.md` 的 13 條 P1 與 W6-10～14；r3：併入重審的 8 條 P1。各條處置見 `review.md`〈處置〉。
W6-10 是對第 6 波 plan S1 原文「遇 40P01／40001 改 error」的擴大（業主裁決）。

## 0. 一句話

讓排程與會員觸發的自癒一筆訂單一個交易處理，不再跟線上付款互鎖害獎金漏發；獎金沒發出時推 LINE 請人工核對；
對帳帳本記下 heal 結果與未知狀態原因；人工觸發的對帳不再冒充 pg_cron。

## 1. 使用者需求

- 規格書 §8.2～§8.3（三代獎金每筆付款都發、每代例外隔離、自癒補償）、§9（任務／推薦王）；`supabase/README.md`〈排程〉。
- 驗收情境：
  1. **P2-5**：U1 是 X 的推薦人、X 是 U2 的推薦人；U1、U2 各有一張「已付款待開通」單，排程 heal 跑的同時 X 線上付款
     → 三筆都開通，X 付款給 U1 的第 1 代、U2 付款給 X 的第 1 代都在，沒有 40P01 告警。
  2. **W6-13**：同一位會員兩張待開通單，從 `/profile`（`healPaidPendingOrdersBestEffort(userId)`）觸發 → 一筆一個交易；
     其中一張金額不符時另一張照樣開通；回傳是否補完的布林值語意不變。
  3. **W6-10／W6-12**：任何非預期錯誤（死鎖、序列化失敗、其他；`unique_violation` 除外）讓某一代獎金沒寫進去 →
     `system_alerts` 一筆 error（推 LINE），訊息前 200 字寫出結論、付款單號、第幾代、該拿的推薦人（推薦碼）、下一步；
     不承諾自動補發。
  4. **P2-7**：對帳帳本 `scheduled_job_runs.summary` 有 `unknownByReason`，四種原因各自計數，和＝`unknownStatus`。
  5. **P2-8／W6-11**：帳本 summary 有 `heal` 計數；`scheduler_health()` 的 reconcile 有 `healFailedStreak`、`healSkippedStreak`；
     不推 LINE。
  6. **P2-9**：`select invoke_internal_endpoint('reconcile', 'manual')` → 帳本 `trigger=manual`，`scheduler_health()` 的
     `lastPgCronCompletedAt` 不變；pg_cron 排程指令不變、照樣記 `pg_cron`。
- 不做：改 `process_successful_payment`（S6 要動 0d）；改 profiles 鎖模式（§2.3）；heal 問題推 LINE（W6-11，維持 W5-18）；
  `repair_orphaned_*` 三支的單交易迴圈（§2.5 同類掃描，第 7 波候選）；drop 舊 wrapper（W6-14，S6 做）；改看門狗的判準。

## 2. 系統設計

### 2.1 為什麼會互鎖（現況，`20261113000003` 的 `complete_paid_pending_orders`）

- 單一函式＝單一交易，迴圈依序處理多筆。每筆在 `process_successful_payment` 0b 與 `apply_referral_side_effects` 對
  **付款人本人** `profiles` 取 `for update`；發獎、寫推薦邊、寫 pair-history／task_progress 的 FK 檢查對**推薦人** `profiles`
  取 `KEY SHARE`（與 `for update` 互斥）。
- 每筆包在 `begin … exception` 子交易內。**子交易正常結束時，它的列鎖與 advisory 鎖併入上層交易，到整個交易 commit 才放**；
  只有子交易回滾才釋放。所以「DB 內每筆一個子交易」放不掉鎖。
- plpgsql 函式不能 commit；procedure 可在迴圈內 commit，但只限頂層 `CALL`、且不能在含 exception 的區塊內 commit；
  PostgREST `rpc()` 不能呼叫 procedure，而 heal 必須跑在 Edge 的租約與帳本內（`reconcile-handler.ts` `handleReconcile`）。

### 2.2 選案：Edge 端迴圈，每筆一個交易

| 案 | 鎖何時放 | 代價 |
|---|---|---|
| **A. Edge 迴圈呼叫單筆 RPC（採用）** | 每筆 RPC 是一次 PostgREST 請求＝一個交易，該筆 commit 就放 | 每筆一次 HTTP 往返（上限 50，平常 0～2） |
| B. DB procedure＋迴圈內 commit | 每筆 commit 就放 | 不能經 PostgREST；要嘛脫離租約／帳本，要嘛另開 dblink |
| C. 子交易（現況） | 整批結束才放 | 不解決 |

**新 migration**：一支檔 `supabase/migrations/2026111400000N_batch_heal_lock_split.sql`，隨階段增段（紅燈 commit 只加測試、綠燈 commit 增修該段）；版本號以 `check-migration-versions.py` 為準，且須排在 S6 之前（S6 以本檔為基準）。檔頭逐支寫「基準＝X，唯一差異＝Y」：

| 函式 | 基準 | 唯一差異 |
|---|---|---|
| `list_paid_pending_order_ids(p_user_id uuid default null, p_limit int default 50) returns uuid[]`（新） | `20261113000003` `complete_paid_pending_orders` 的候選查詢 | 抽出成函式；候選謂詞的唯一出處；不上鎖 |
| `complete_paid_pending_order(p_order_id uuid) returns jsonb`（新） | 同上的迴圈體 | 開頭（在任何 `begin…exception` 之外）`set_config('uknow.rewire_try_lock','on',true)`、**結尾不清**（交易層設定，RPC 交易結束自然失效；wrapper 迴圈的每一筆也都維持 on）。**0b 鎖預取**：委派前在自己的 `begin…exception` 內 `set_config('lock_timeout','3s',true)` → `select 1 from profiles where id=付款人 for update` → `set_config('lock_timeout','0',true)`；55P03 → `skipped_locked`（只在本函式接住，不會流進發獎子交易；之後 `process_successful_payment` 0b 重入同一把鎖不再等）。其餘照搬：`for update skip locked` 重讀重驗、金額重驗與去重告警、委派 `process_successful_payment`、U6R01 → `skipped_locked`、其他例外 → `failed`＋error 告警（既有行為，見 §2.6 W6-11 範圍）。回 `{outcome: 'completed'|'skipped'|'skipped_locked'|'amount_mismatch'|'failed', error?}`。`skipped`＝重讀時謂詞不成立或 `skip locked` 拿不到列（後者分不出「已被處理完」與「被鎖」，照現況混計，文件寫明）；`skipped_locked` 只計 U6R01 與 0b 預取的 55P03 |
| `complete_paid_pending_orders(uuid, int)` | `20261113000003` | 改成「list → 逐筆呼叫單筆」的 wrapper，回傳形狀不變（`skipped_locked`＝單筆的 skipped＋skipped_locked，與舊版混計同義）；註解寫明「舊 Edge 相容用；仍是單交易，互鎖風險同舊版；由 S6 drop（W6-14）」；迴圈全部結束後清旗標（`set_config('uknow.rewire_try_lock','',true)`），免得同交易後續的線上付款被誤改成 try |
| `pay_referral_generations` | `20261113000001` | §2.5 |
| `apply_referral_side_effects` | `20261113000003`（:481） | 只有 3c 的 severity、訊息與 context（§2.5） |
| `scheduler_health` | `20261112000001`（:121） | reconcile 多兩鍵（§2.6） |
| `invoke_internal_endpoint` | `20261112000001`（:243） | 加 `p_trigger`（§2.7） |

兩支新函式都 `security definer`、`revoke execute … from anon, authenticated, public`＋`grant execute … to service_role`
（Supabase 預設 ACL 會給 anon／authenticated，慣例同 `20261113000003` 檔尾）。`security-definer-grants.test.ts` 會掃到它們。

**Edge 新檔 `supabase/functions/api/paid-pending-heal.ts`**（比照 `reconcile-handler.ts` 的抽出＋注入模式）：

```ts
export type HealRpc = (fn: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;
export type HealResult = {
  candidates_found: number; completed_count: number; completed_order_ids: string[];
  amount_mismatch: number; skipped_locked: number; failed: { order_id: string; error: string }[];
  truncated: boolean;          // 超過時間預算提早停（新增鍵）
};
// 單筆之間的檢查點，不是整體硬上界：單一 RPC 內本人那把鎖由 0b 預取的 lock_timeout 3s 兜住；
// 推薦人方向的 KEY SHARE 等待受對方單筆付款長度限制（§2.3）。可調工程參數，單一出處。
export const HEAL_TIME_BUDGET_MS = { scheduled: 60_000, perUser: 10_000 };
export async function healPaidPendingOrders(
  rpc: HealRpc, opts: { userId?: string; now?: () => number } = {},
): Promise<{ data: HealResult | null; error: { message: string } | null }>;
```

- list 回錯 → `{ data: null, error }`（與現行 `sb().rpc(...)` 的回傳同形，`handleReconcile` 的判斷不必改語意）。
  list 回傳**不是陣列**（null、物件）→ 同樣回 `{ data: null, error: { message: 'list 回傳形狀不符' } }`，不當成 0 筆（會掩蓋 migration 未套）。
- 單筆 RPC 回錯不代表 DB 沒 commit（逾時、斷線）：仍記進 `failed`；下一輪重跑是冪等 no-op，`healFailedStreak` 可能偶爾多算一輪——註解寫明。
- 逐筆 `await`；單筆 RPC 回錯或擲錯 → 記進 `failed`、繼續下一筆。累計超過預算 → 停、`truncated=true`
  （剩下的下一輪處理）。排程 60 秒（pg_net 逾時 150 秒，heal 在對帳迴圈之前跑，留一半以上給對帳；工程判斷，可調）；per-user 10 秒（使用者請求路徑）。
- `index.ts`：reconcile 的 `heal` dep 改 `() => healPaidPendingOrders(rpcOf(sb()))`；`healPaidPendingOrdersBestEffort(userId)`
  改呼叫 `healPaidPendingOrders(rpcOf(sb()), { userId })`，**函式本身留在 index.ts**（只是包一層 try／布林值，搬出去不省什麼）。
  `rpcOf` 是 index.ts 內的 adapter：`(c) => async (fn, args) => await c.rpc(fn, args)`（supabase-js 回的是 thenable builder，要 `await` 包成 Promise），讓 unit test 的假物件只需實作 `HealRpc`。
- 回應 `data.heal` 多一個 `truncated` 鍵，其餘不變；`_shared/api-contract.ts` 不含這個內部端點，不必改。

**`lock_timeout` 只用在 0b 預取，不設成整筆交易**（review #2；重審 r2 系統 P1）：整筆設的話也會套到 `pay_referral_generations` 各代子交易裡的 FK 等待，
55P03 會被那裡的 `when others` 吞成漏發。所以只包住本函式自己的 0b 預取，之後歸零。推薦人方向的等待對象只會是另一筆正在跑的付款（§2.3 無環），
受它的長度限制；對方若 idle-in-transaction 則無上界——那是對方的 bug，heal 這一輪會卡到 pg_net 逾時、帳本記 abandoned，看門狗看得到（既有）。

**per-user 路徑也改逐筆（W6-13）**：理由是一致性與縮短持鎖時間（同一人多張單時，前一張的推薦人 KEY SHARE 不必留到最後一張）；
review #15 指出原稿的「成環」推導不成立，已刪。延遲：同一人通常 1 張，多一次 list 往返（數十毫秒）。

### 2.3 鎖序（不得新增死鎖）

- **不變式：所有跨人的鎖都只往推薦人方向取。** 本人先取 `profiles(本人) for update`（0b，`apply_referral_side_effects`
  重入），之後才對推薦人取 KEY SHARE——發獎 `reward_transactions`（gen1～3）、3b `referral_edges`、3d `referral_pair_history`
  與 `task_progress(推薦人)`、0d 換線的 `profiles.referred_by_user_id` 與 `referral_edges`；推薦王對帳鎖 `task_progress(推薦人)`。
  推薦鏈無環（`referral_would_cycle`、`pay_referral_generations` 三代自檢），等待邊只往上游走 → 不成環。
  S6 之後新增鎖點要守這條。
- 單筆 heal 交易的取鎖順序與線上 `/webhooks/payuni/notify` 相同（同一支 `process_successful_payment`）：
  訂單列 → [換線 advisory，try] → `profiles(本人)` → 推薦人方向的 KEY SHARE／`task_progress`。
  `20261113000003` 檔頭「不成環」論證對「兩筆線上付款」成立，heal 單筆化後同樣成立。互鎖只出在「一個交易跨多位付款人」，本案消除這種交易。
- prepare 的 `for no key update`（`20261113000002`）與 `for update` 互斥、與 KEY SHARE 相容——不動。
- **刻意不把 0b 的 `for update` 降成 `for no key update`**：那條「不成環」論證正是靠 `for update` 擋住推薦人對本人的 KEY SHARE；降級會打開 `task_progress` 那條環。
- 本案新增的鎖：無新鎖；**順序有一處變動**——單筆函式的 0b 預取讓 heal 變成「訂單列 → `profiles(本人)` → 換線 advisory」，與 0a′ 註解要求的「advisory 在 profiles 之前」相反。成立的前提是 heal 路徑的換線鎖一律 try（旗標 on）：拿不到就 U6R01 整筆回滾、放掉 profiles，不會在持有 profiles 時等 advisory。測試釘住「旗標 on 時 0b 預取之後遇換線鎖忙 → skipped_locked」。旗標若被關掉，這個順序就會死鎖——wrapper 與單筆函式都必須設旗標（§2.2）。

### 2.4 部署相容（正式站 migration 安全）

- main push → Supabase 原生整合先套 migration；deploy-supabase 在 CI 綠後才部署 Edge。期間舊 Edge 仍呼叫
  `complete_paid_pending_orders`：wrapper 保住它，行為同現況（旗標每筆都 on，W5-61 不退化）。
- 反向（Edge 先於 migration，W5-62 尚未自動擋）：新 Edge 的 list 回錯 → `heal` 為 `{data:null,error}` → 帳本 `heal.error=true`，不擲到路由；
  per-user 路徑回 false。migration 套上後下一輪恢復。
- migration 全部 `create or replace`／`drop function if exists`，可重跑；不動資料。
- 主 session 已查正式站（W6 11/08）：待開通單 0 筆、近 30 天 `system_alerts` 0 列 → 不需人工補發，上線無資料前置作業。

### 2.5 發獎失敗改 error（W6-10、W6-12）

- `pay_referral_generations`（基準 `20261113000001`）三代各自的 `when others`：`warning` → **`error`**；`unique_violation` 維持靜默（冪等）。
  範圍＝所有非預期錯誤（W6-10）。
- 訊息範本（LINE 只帶 `message`，不帶 context；前 200 字放完結論與下一步；用語 W5-53）：

  ```
  【獎金未發】付款單 {trade_no} 的第 {N} 代推薦獎金 {amount} 點沒有發出（應發給推薦人，推薦碼 {code}）。
  下一步：請通知工程人員人工核對並補發（步驟見 supabase/README〈補發漏發獎金〉）。原因：{原因}（{sqlstate}）
  ```

  - 原因對照寫成函式內常數：`40P01`→「資料庫互鎖」、`40001`→「序列化衝突」、其他→「系統錯誤」（未知 sqlstate 不會留白）。
  - 目前沒有後台補發工具，所以下一步指向工程人員；`supabase/README.md` 新增〈補發漏發獎金〉一段：用 `reward_transactions`
    的 (referee, generation, subscription_id) 查是否已補上（自癒或人工任一方先補，另一方撞冪等唯一索引，不會重複發），
    沒有就以 service_role 依同一冪等鍵插入。

  - 任務續約路徑（`p_claim_id` 有值、無訂單）：「付款單 {trade_no}」改「任務續約 {claim_id 前 8 碼}」。
  - `trade_no` 由 `subscriptions.source_payment_order_id → payment_orders.transaction_id` 反查（在 handler 內、子交易已回滾後查）；
    推薦碼取該推薦人 `status='active'` 的 `referral_codes.code`，查不到寫「（無有效推薦碼）」。不放姓名、不放 uid（LINE 是外部通道）。
    反查包在 handler 內自己的 `begin…exception`：單號查不到或查詢失敗寫「（查無單號）」，推薦碼同理；**告警一定寫入**。
  - context（給後台看）：`referee`、`generation`、`beneficiary`、`subscription_id`、`claim_id`、`trade_no`、`sqlstate`。
- 量與去重（review #23、#28）：一次死鎖只會讓一個陳述式失敗＝一代一則；每則對應一筆實際漏發的錢，不去重。
  資料問題（例如推薦人被刪）會讓之後每筆相關付款都告警——那也是每筆都漏發，正是要人處理的情況。
  知悉：`/internal/system-alerts/recent` 一次最多 20 則（`RECENT_ALERTS_LIMIT`），大量告警時會擠掉其他來源；本案不改推送端。
- `apply_referral_side_effects`（基準 `20261113000003`）3c：整支 `pay_referral_generations` 擲錯 → `warning` → `error`，
  訊息「【獎金未發】付款單 {trade_no} 的三代推薦獎金整批沒有發出。下一步：請通知工程人員人工核對三代並補發（步驟見 supabase/README〈補發漏發獎金〉）。原因：…」。
- 同類掃描（不在本案修）：`repair_orphaned_payments`／`_claim_rewards`／`_forfeitures` 也是單交易迴圈，但只由 Edge 以
  `p_user_id` 呼叫；漏發時上面的 error 會響。列第 7 波候選。

### 2.6 帳本 summary 與 `scheduler_health`（P2-7、P2-8；W6-11 不推 LINE）

- `reconcilePendingOrders` summary 加 `unknownByReason: Record<UnknownReason, number>`（`UnknownReason = keyof typeof UNKNOWN_STATUS_LABEL`，併掉 `QueryResult` 內手寫的 union；三處同步：`reconcile-handler.ts` 的 `ReconcileSummary` 型別、`index.ts` `reconcilePendingOrders` 的 summary 初始化、`reconcile-outcome.unit.test.ts` 的 `summary()` 預設值），
  key 取 `UNKNOWN_STATUS_LABEL` 的四個（`unknown_code`、`missing_field`、`no_matching_trade`、`incomplete_too_long`；
  R5 只列三個，`no_matching_trade` 走同一條路）。`unknownStatus` 保留，＝四者和。
- `handleReconcile`：`heal` dep 型別改 `() => Promise<{ data: HealResult | null; error: unknown }>`。**兩處 heal 形狀不同，刻意分開**：
  - 回應 body `data.heal`：原樣放 `HealResult`（snake_case、`failed` 是陣列，與現行同形＋`truncated`）。
  - 帳本 `summary.heal`：純函式 `healLedgerSummary(result, error)` 轉成計數 `{ candidates, completed, failed: number, skippedLocked, amountMismatch, truncated, error: boolean }`（camelCase，不放訂單 id）；SQL streak 讀的是這一份。單元測試釘住「ledger 的 failed 是 number、body 的是 array」。
  heal 失敗仍只 `logError`（W6-11 維持 W5-18），`reconcile-handler.ts` 的「已知缺口」註解改寫成「已記進帳本 summary.heal.error，
  依 W6-11 不推 LINE」。三個 switch 分支（all_failed／majority_failed／ok）都要帶 heal。
  同步改 `reconcile-outcome.unit.test.ts` 的 heal mock（:77 附近）與 `reconcile-pending-payments.test.ts`。
- `scheduler_health()`：reconcile 加兩鍵，purge-photos 兩鍵為 `null`（先例：`lastPurgeDryRun` 只有 purge 有值）：
  - `healFailedStreak`：最近的 reconcile 完成列往回數，連續幾列 `summary.heal.failed > 0 or summary.heal.error = true`。
  - `healSkippedStreak`：同法，`summary.heal.skippedLocked > 0`。
  - `truncated=true` 併入 `healFailedStreak` 的判準（長期撐爆預算也要看得到）。
  - SQL 一律用 `->`／`->>` 讀並對缺鍵 coalesce；purge-photos 兩鍵**輸出 null，不能省略**（`scheduler-health.test.ts` 雙向比對鍵路徑）。
  - 「連續」的定義（review #5）：只看 `trigger = 'pg_cron'`（github 補跑與人工列不算，避免 P2-9 同類誤讀）；
    `status in ('succeeded','failed')` 且 `error_code` 不在 `('vault_missing','exception')`（與 `lastPgCronCompletedAt` 同條件）；
    往回最多看 24 列（一天）；**遇到沒有 `heal` 鍵的舊列就停**（本案上線前的列不計）。`amountMismatch` 不計入（W6-11：
    金額不符的單會永遠 pending，計入就永遠連續）。上限 24 寫成函式內常數並註明出處。
- **W6-11「不推 LINE」的範圍**：指 heal 整支失敗與連續失敗／跳過（只進帳本與 `scheduler_health`，沒有主動通知）。單筆訂單開通失敗、金額不符本來就各寫一則 error（`complete_paid_pending_orders` 既有行為，會推 LINE），本案原樣保留、不降級。〔需主 session 確認此解讀，§6〕
- 看門狗：只同步 fixture（`shape.json` 與 9 個 `scenario-*.json` 都補兩鍵），`decide_reconcile` 判準不動（W6-11）；
  `--self-test` 須綠。數值供人看 `/internal/scheduler-health` 與 step summary。

### 2.7 `invoke_internal_endpoint` 加 trigger（P2-9）

- `drop function if exists public.invoke_internal_endpoint(text)` 後建 `invoke_internal_endpoint(p_job text, p_trigger text default 'pg_cron')`；
  `p_trigger` 只收 `pg_cron`／`manual`，其他擲錯；body 與 vault_missing 列都用它。
- 一定要 drop 舊版：並存時 `invoke_internal_endpoint('reconcile')` 多載歧義，pg_cron 每輪失敗。cron.job 的指令字串執行時才解析，
  同一 migration 交易內 drop＋create，指令不必改。
- revoke 照原樣補在新簽章上；`scheduled-job-runs.test.ts` 權限斷言改 `(text, text)`。
- Edge `parseScheduledTrigger` 已把 `'manual'` 記為 manual（`begin_scheduled_run` 亦然），不必改。
- `docs/supabase-setup-checklist.md:651` 的立即驗證改 `select public.invoke_internal_endpoint('reconcile', 'manual');`。

## 3. 架構影響

- 動到：新 migration、新檔 `paid-pending-heal.ts`、`reconcile-handler.ts`（`ReconcileSummary` 型別、heal dep、`healLedgerSummary`）、`index.ts`（heal dep、`rpcOf`、`healPaidPendingOrdersBestEffort`、`reconcilePendingOrders` summary 初始化）、`scripts/fixtures/scheduler-health/*.json`（10 檔）、
  `supabase/README.md`（函式表、〈排程〉、migration 表）、規格書 §8.3、`docs/supabase-setup-checklist.md`。
- 不動：`process_successful_payment`、prepare、前端、`_shared/api-contract.ts`、看門狗判準。
- 與 S6 的介面：S6 動 `process_successful_payment` 0d 的基準是 `20261113000003`（本案不碰）；S6 若動 `pay_referral_generations`、
  `apply_referral_side_effects`、wrapper，以本案 migration 為基準；S6 drop wrapper 時連 `renewal-referrer-intent.test.ts`、
  `complete-paid-pending-orders.test.ts` 中直接呼叫它的測試一起改成單筆函式（W6-14）。新增鎖點須守 §2.3 不變式。
  第 6 波 plan 的 S6 工作項目前沒列「drop wrapper」：回報時請主 session 補進 S6。
- 效能：heal 每輪多 N 次 RPC（N≤50，平常 0～2），上界 60 秒預算。

## 4. UI/UX

無畫面變更；會員端 `/payuni/result`、`/profile` 無可見變化（多一次 list 往返）。營運端只有 §2.5 兩則新告警文案（heal 連續失敗依 W6-11 沒有主動通知），
照 W5-53：「推薦人」「第 N 代」，不用「上線／下線／傳銷／直銷」；測試斷言訊息前 200 字含「下一步」且不含禁用詞。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | **死鎖重現 → 單筆交易 heal**：兩支新 RPC、wrapper、`paid-pending-heal.ts`、index.ts 兩處 | `api/heal-lock-split.test.ts`（DB，編排見下）；`api/paid-pending-heal.unit.test.ts`（彙總、單筆錯誤繼續、list 錯或非陣列回 `{data:null}`、超預算 truncated）；`renewal-referrer-intent.test.ts` 另加「0b 預取遇 lock_timeout → skipped_locked、不寫告警」；`renewal-referrer-intent.test.ts` 加「wrapper 兩筆時第 2 筆仍走 try」；`complete-paid-pending-orders.test.ts` 全綠（wrapper 相容）；`security-definer-grants.test.ts` 兩支新函式 anon／authenticated 無 execute | 紅：經對帳端點跑 U1/X/U2 拓撲 → 兩筆第 1 代缺一筆且出現 40P01 告警。綠：兩筆都在、無 40P01 |
| 2 | **per-user 逐筆（W6-13）** | `api/profile-self-heal.test.ts` 增列：同一人兩張待開通單、其一金額不符；`paid-pending-heal.unit.test.ts` 加 per-user 預算 10 秒 | 另一張開通、金額不符那張維持 pending＋告警一次、回 true（布林＝`completed_count > 0`，與現行同義） |
| 3 | **發獎失敗改 error（W6-10、W6-12）** | `api/referral-reward-failure-alert.test.ts`：(a) 以舊 wrapper（仍單交易）重現同拓撲 → 告警 error、訊息含單號／第 1 代／推薦碼／「下一步」、context 有 sqlstate=40P01；(b) 以暫時觸發器讓 gen2 插入擲錯 → error、gen1／gen3 照發；(c) claim 路徑訊息用「任務續約」；(d) 以 36 字元單號與最長推薦碼代入，前 200 字含「下一步」、不含禁用詞；(e) 單號反查失敗（訂單已刪）→ 告警照寫、訊息為「（查無單號）」 | 現況 warning → 紅；改後綠 |
| 4 | **帳本 summary**：`unknownByReason`、`heal` | `reconcile-outcome.unit.test.ts`（三分支都帶 heal、heal error 時 `heal.error=true`、`healLedgerSummary` 的 failed 為 number 而 body 為 array）；`reconcile-pending-payments.test.ts`（四種 reason 各一張 → 計數正確、和＝unknownStatus） | 鍵與計數正確 |
| 5 | **`scheduler_health` streak** | `api/scheduler-health.test.ts`；fixture 10 檔；`python3 scripts/scheduler-watchdog.py --self-test` | 三輪 failed → 3；中間一輪乾淨 → 歸零；github／manual 列不計；舊列（無 heal 鍵）停止；只有 amountMismatch → 0；truncated 計入 failed streak；purge 兩鍵 null |
| 6 | **`invoke_internal_endpoint(p_job, p_trigger)`** | `api/scheduled-job-runs.test.ts` | `'manual'` → 帳本 manual 且 `scheduler_health().lastPgCronCompletedAt` 不變；預設 → pg_cron；非法值擲錯；cron.job 指令照樣可執行（無多載歧義）；權限斷言新簽章 |
| 7 | **收尾** | `npm run check:full`、`check-spec-drift.py`、`check-migration-versions.py`、`check-test-names.py` | 全綠；規格書 §8.3 L549～551「warning-only／只留 system_alerts 紀錄」改寫為 W6-10 的語意（每代例外隔離、非預期錯誤寫 error 告警、unique_violation 視同已發）；`supabase/README.md` 函式表、〈排程〉、migration 表、新增〈補發漏發獎金〉；setup-checklist 同步（check-spec-drift 不涵蓋這段敘述，逐項人工核對） |

**死鎖重現測試編排**（階段 1；雙連線做法複用 `payment-user-lock.test.ts`／`process-payment-concurrency.test.ts`）：
1. 前置斷言：資料庫裡沒有本測試以外的待開通單（有就直接 fail 並列出 id——全域掃描是正式路徑，不改它來遷就測試）。
2. 建 U1←X←U2（`referredByCode`）；U1、U2 各塞一張待開通單（`payuni_response` SUCCESS，U1 的 `created_at` 較早）；X 一張 pending 單。
3. 連線 B：`begin; select 1 from profiles where id = X for update;`（模擬 X 的付款已過 0b）。`deadlock_timeout` 用預設 1 秒（superuser 參數，不在測試裡設；前置 `show deadlock_timeout` 斷言為 1s）。
   `deno task test:db` 不帶 `--parallel`（`deno.json`、`ci.yml` 已核實），前置斷言不會被並行測試誤傷。
4. 非同步呼叫對帳端點 `POST /internal/reconcile-pending-payments`（`app.request`，帶 `RECONCILE_SECRET`）——紅燈時它跑現行的
   `complete_paid_pending_orders(null)`，綠燈時跑新迴圈。X 的單是新建的、不到對帳門檻，不會被 PayUni 查詢碰到。
   輪詢 `pg_blocking_pids(pid)` 直到某個 heal 連線被 B 擋住（處理 U2、發獎給 X）。現行實作此時已持有 `profiles(U1)`。
5. 連線 B：同交易內 `select process_successful_payment(X, …)` → 發第 1 代給 U1 要 KEY SHARE `profiles(U1)`；`commit`。
   現行：互等 → 1 秒後一方被選為受害者（不固定）。新版：U1 那筆早已 commit，B 不等。
6. 斷言：(referee=X, gen1, user=U1) 與 (referee=U2, gen1, user=X) 都存在；`system_alerts` 無 `message ilike '%deadlock detected%'`（階段 1 時 context 還沒有 sqlstate，用訊息比對）。
   紅燈的失敗訊息會是「缺一筆＋有 40P01」，哪一筆不固定。整段 `statement_timeout = 20s` 兜底；輪詢上限 10 秒，逾時視為編排失敗
   （訊息寫明，不與紅燈混淆）。

## 6. 開放問題（已裁決）

- [x] Q1 → **W6-10**：所有非預期錯誤升 error，`unique_violation` 除外。
- [x] Q2 → **W6-11**：heal 問題只寫帳本＋`scheduler_health`，不推 LINE（維持 W5-18）；`amount_mismatch` 不計入 streak。
- [x] Q3 → **W6-14**：舊 wrapper 由 S6 drop；本案保留並註明退場。
- [x] Q4 → **W6-12**：文案「請人工核對並補發」，前 200 字含結論＋下一步，不承諾自動補發。
- [x] Q5 → **W6-13**：per-user 自癒也改逐筆，加驗收測試。
- [ ] 〔重審 r2 需求 P1-1，需主 session 確認〕W6-11「不推 LINE」解讀為只限 heal 整支失敗與連續失敗／跳過；單筆開通失敗與金額不符的既有 error 告警（會推 LINE）原樣保留（§2.6）。
- [ ] 〔review #2，需主 session 知悉〕不採整筆 `lock_timeout`，改為只包 0b 預取＋Edge 預算（§2.2），理由見該節。
- [ ] 〔review #19，需人工知悉〕死鎖測試依賴 1 秒 `deadlock_timeout` 與輪詢；已用前置斷言、輪詢上限與 `statement_timeout` 壓 flaky，
  CI 上若仍不穩，處置是放寬上限，不是 skip（CLAUDE.md 禁止 skip 求綠）。

## 7. 風險與回滾

- 最壞：新 Edge 迴圈有錯 → heal 不收斂，卡單留到下一輪或會員載入 `/profile`；帳本 `heal` 與 `healFailedStreak` 看得到。
  回滾＝revert Edge（wrapper 還在，舊 Edge 直接可用）；migration 不需回滾（新函式閒置無害，error 告警是純加強）。
- `invoke_internal_endpoint` 簽章改錯會讓 pg_cron 每輪失敗 → 看門狗 90 分內補跑＋推 LINE（既有）；測試釘住 cron 指令可執行。
- 告警文案的反查（trade_no、推薦碼）本身失敗：handler 內再包一層，查不到就寫「（查詢失敗）」，告警照寫，不吞掉原錯誤。
