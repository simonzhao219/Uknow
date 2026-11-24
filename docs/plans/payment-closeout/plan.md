# 金流收尾（payment-closeout）規劃書 r2

<!-- plans-keep: 第 7 波 S4 施工鷹架（跨 session：規劃 session → 業主審 → /tdd-implement）；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

上游：派工正本 `origin/claude/uknow-wave-7-lead:docs/plans/launch-wave-7/dispatch-prompts.md` 的 S4 段、同分支 `plan.md` §2 S4；W6-14→W6-30；
`docs/plans/launch-wave-6/review.md`（R6）§1.1、§1.3 P2-7～P2-9、§4.1（#524 列）。行號以本分支起點 develop `3e76edd` 為準，實作時以函式名／測試名重新定位。
r2＝依 `review.md` 第 1 輪（P0 1、P1 11）修訂；r3＝再收第 2 輪 P1 6 條（未重跑審查，見 review.md 第 2 輪處置）。

## 0. 一句話

這個工項把第 6 波 S1 留下的金流尾巴收掉：撤掉舊的整批自癒 wrapper、讓「推薦連結沒寫成」這類會靜默漏發二代三代獎金的失敗推得到 LINE、
並關掉自癒函式沒人用卻會互鎖的整批路徑，因為這些都是「錯了不會有人知道」的錢。

## 1. 使用者需求

對照：規格書 §8.2、§8.3（發獎與自癒）、§9.1～9.2（任務／推薦王）、§7.4（預設推薦人）；`supabase/README.md`〈告警 severity〉、〈補發漏發獎金〉。

| # | 出處 | 驗收情境（可驗證的行為） |
|---|---|---|
| 1 | W6-14→W6-30 | `complete_paid_pending_orders(uuid,int)` 在 DB 不存在；Edge、pg_cron、Deno 測試都不再呼叫；原本靠它驗的情境改由單筆函式／逐筆呼叫驗，覆蓋度不降 |
| 2 | 第 6 波 plan §5、R6 §4.1 | `apply_referral_side_effects` 3b（寫推薦連結）或 3d（任務 +1／推薦王對帳）擲錯 → 一筆 **error** 告警（推 LINE）；`message.slice(0,60)` 含行動與單號；**整則** message 不含姓名、uid、sqlerrm；**付款開通與 3c 三代獎金照常完成**——即使告警函式本身出錯也一樣；同一筆持續失敗不重複推 |
| 3 | 第 6 波 plan §5 | `repair_orphaned_payments`／`_claim_rewards`／`_forfeitures` 不再有「一個交易跨多位會員」的路徑（Q1） |
| 4 | R6 §4.1、#524 審查 | `complete_paid_pending_order` 單筆開通失敗：message 是固定行動句（含單號），sqlerrm／sqlstate 只進 context；同一筆持續失敗不重複推；回給 Edge 的 `failed[].error` 不變 |
| 5 | R6 P2-7、P2-8 | 新 migration 檔頭記下正確基準（`referral_award_chain` 對照的發獎函式最新定義是 `20261115000001`）與「drop 後已無批次自癒期間的清空」；已套用的兩支不改 |
| 6 | R6 P2-9 | README〈補發漏發獎金〉第 2 步改以 `referral_award_chain` 回的收獎人為準，並先確認後台該筆不是「不可判定」 |
| 7 | P2-8 同源（review 12） | 規格書「含批次自癒期間」一句改掉；後台 `LedgerAuditSection` 同句與其測試依 **Q5** 處理 |

**不做**：S5 的換線寫入時點（R6 P2-4）；`QUERY03001`（S2）；`process_successful_payment` 本體；3a（推薦碼，有自癒）的 severity；Q5 以外的前端。
3a-bis（預設推薦人）是同類掃描的追加，依 **Q3**。

## 2. 系統設計

一支新 migration，版號暫定 `20261125000001_payment_closeout.sql`；S2 若也新增 migration，經主 session 約定版號（建議 S2 用 `20261124*`、S4 用 `20261125*`），
rebase 後仍跑 `check-migration-versions.py`。**實作第一步**：`rg -n "function public\.(apply_referral_side_effects|complete_paid_pending_order|repair_orphaned_)" supabase/migrations/` 確認基準之後無重定義（develop `3e76edd` 時已確認）。檔頭逐支寫「基準＝X，唯一差異＝Y」；每支 `create or replace` 照抄基準的 `security definer`、`set search_path = public`、revoke／grant。

### 2.1 drop wrapper

- `drop function if exists public.complete_paid_pending_orders(uuid, int);`
- **gate（PR 內文附證據，任一缺就延到下一次晉升）**：
  ①兩環境 `/api/health` 的 sha 都含 #524（README:72 的退場條件）——由主 session 代查（雲端容器連不到 `*.supabase.co`）；
  ②全庫 grep 只剩註解／測試；`cron.job.command` 與其他函式本體（`pg_proc.prosrc`）都不含此名——plpgsql 本體不登記 `pg_depend`，`pg_depend` 只當補強（§6 Q4 SQL）；
  ③`pg_stat_user_functions` 的呼叫數只當補強——`track_functions` 未開會回空，回空不算證據。
- 告警 `source='complete_paid_pending_orders'` 由單筆函式沿用（去重、後台、Q4 歷史都靠它）——**不改名**；檔頭與 README 函式表都寫「source 是歷史名，函式已 drop」。
- 測試改寫（以測試名定位；實作開工先 `rg -n "complete_paid_pending_orders"` 重算，分三類）：
  - **呼叫**：`complete-paid-pending-orders.test.ts`（整檔約 9 處，改呼叫 `list_paid_pending_order_ids`＋逐筆 `complete_paid_pending_order`）；
    `renewal-referrer-intent.test.ts`「換線鎖被占用 → 該筆跳過不報錯…（W5-61）」「多筆時第 2 筆仍走 try…」（改單筆；第二條改成「兩筆各自一次單筆呼叫都 skipped_locked」）；
    `subscription-period.test.ts`「延遲自癒：…效期也錨定付款日」；
    `referral-reward-failure-alert.test.ts`「舊 wrapper 與線上付款互鎖 → 受害那代寫 error 帶 40P01」——釘的是被 drop 的舊風險，逐筆版不互鎖已由 `heal-lock-split.test.ts` 釘住 → 刪除，PR 內文記理由。
  - **source 字串**（保留）：`profile-self-heal.test.ts`、`complete-paid-pending-orders.test.ts` 的 `.eq('source', …)`、`renewal-referrer-intent.test.ts` 的 where。
  - **註解**（改過去式或指向單筆函式）：`index.ts` 三處、`paid-pending-heal.ts` 兩處、`test-helpers.ts`、`payuni-notify-alerts.test.ts`、`payment-user-lock.test.ts`、`heal-lock-split.test.ts`、`reconcile-pending-payments.test.ts` 檔頭。
  - 新增守門：`to_regprocedure('public.complete_paid_pending_orders(uuid,int)') is null`。

### 2.2 3b／3d 升 error

基準＝`20261115000001` 的 `apply_referral_side_effects`。唯一差異＝3b、3d 的 `when others` 由 `log_system_alert(…,'warning', sqlerrm, …)` 改為：

```sql
exception when others then
  begin  -- 呼叫端雙保險：告警路徑任何錯誤都不得讓外層子交易回滾（review P0、P1-7）
    perform public.log_referral_side_effect_failure('referral_edge', p_user_id, v_referrer1, p_subscription_id, sqlstate, sqlerrm);
  exception when others then
    raise warning 'apply_referral_side_effects：告警寫入失敗（step=referral_edge）: %', sqlerrm;
  end;
  raise warning …（照舊）;
```

**為什麼要雙保險（P0）**：`process_successful_payment` 把 `apply_referral_side_effects` 整支包在自己的 `when others`（`20261117000001:333-339`）。
3b／3d 的 handler 內若擲錯，回滾的不是付款，而是**整個 `apply_referral_side_effects` 子交易**——3a 推薦碼、3b、**3c 三代獎金**、3d 一起靜默消失，只剩一筆 warning。
所以「handler 內永不擲錯」必須由結構保證：①呼叫端包一層 ②新函式本體整段 `begin … exception when others then raise warning` ③所有拼接片段 `coalesce`（`||` 遇 null 會讓 message 變 null、違反 `system_alerts.message not null`，被 `log_system_alert` 吞掉＝告警靜默遺失）。

新函式 `log_referral_side_effect_failure(p_step, p_referee, p_referrer, p_subscription_id, p_sqlstate, p_sqlerrm)`（error）：

- **source**＝`apply_referral_side_effects`（不變），**step**＝`referral_edge`／`task_king`（不變；`system-alerts.test.ts` 釘 `task_king`、Q4 step 分佈與後台都靠它）。context 鍵只加不減：
  `step`、`user_id`、`subscription_id`、`referrer_id`、`trade_no`、`sqlstate`、`sqlerrm`。
- **去重**：同 source＋step＋`subscription_id`（`is not distinct from`；null 時退回以 `user_id` 比）、`resolved_at is null` 已有 error 就不再寫（`/profile` 自癒每次載入都可能重跑同一筆）。持續失敗只留第一次的 sqlerrm，手冊寫明「要當下錯誤就再跑一次單筆／repair 看 warning」。
- **權限**：`revoke execute … from anon, authenticated, public`（security definer 預設 EXECUTE 給 PUBLIC，不 revoke 等於讓任何人灌 error 推 LINE）；測試斷言 anon rpc 被拒。
- **單號**：`subscriptions.source_payment_order_id → payment_orders.transaction_id`（抄 `log_referral_reward_failure`），反查包子交易，取不到寫「（查無單號）」。單號是 20 碼 MerTradeNo（`index.ts` `generateTradeNo`）。
- **推薦碼**：以 `p_referrer`（＝`v_referrer1`，付款人的推薦人）反查 active 碼，**不是**付款人自己的 `v_code_id`。
- **原因**（與 §2.4 共用小函式 `classify_alert_sqlstate(text)`，免兩處分類漂移）：固定分類字串（`40P01`→資料庫互鎖、`40001`→序列化衝突、其他→系統錯誤）＋sqlstate；**整則** message 不含 sqlerrm。
- 文案（W6-24 前 60 字＝行動＋單號＋後果；用語 W5-53）：
  - 3b：`【推薦連結未寫入・請開 Claude 補寫】單號 <20碼>：之後二代三代獎金會漏發。推薦人推薦碼 <code>。下一步：開一個 Claude Code session，請它依 supabase/README〈補寫推薦連結〉處理。原因：<分類>（<sqlstate>）`
    （前 60 字到「漏發。」為止，第 58 字）
  - 3d：`【任務進度未計・請開 Claude 核對】單號 <20碼>：推薦人任務少計一位。推薦人推薦碼 <code>。下一步：…依 supabase/README〈補計任務進度〉核對。原因：…`
    （前 60 字到「一位。」為止）
- **付款語意不變**：3b、3d 仍在各自子交易內被吞，函式照常 return；3b 失敗時 3c 仍照跑（第 1 代讀 profiles；本筆第 2、3 代讀的是付款人推薦人的 edge，不受付款人自己的 edge 影響；受影響的是之後以付款人為第 1 代推薦人的付款）。
- **3d 的自癒程度（review P1-10）**：3d 子交易回滾時 pair-history、任務 +1、推薦王對帳一起回滾。推薦王由同一推薦人下次任何付款的 `reconcile_king_credits` 補上；
  任務 +1 會在**這位會員下次付款時**以當時的月份補計（pair-history 仍無此配對＝被當成第一次）——不會漏，但月份可能晚。手冊據此寫。
- **README 補救手冊**（接在〈補發漏發獎金〉後；三節同一格式：何時看到（附前 60 字範例）、先讀哪些 context 鍵、步驟、完成後怎麼確認、**哪些步驟動資料須先回報業主**）：
  - 〈補寫推薦連結〉：①確認 `profiles.referred_by_user_id` 仍等於告警的 `referrer_id`（付款後又換線就停、回報業主）②upsert `referral_edges`（同 3b 的 SQL）③列出之後以這位會員為第 1 代推薦人的付款，
    用 `referral_award_chain` 比 `reward_transactions` 找缺的第 2、3 代（或看後台推薦樹「付款未發獎」）④缺的照〈補發漏發獎金〉第 3 步補 ⑤標告警處理。
  - 〈補計任務進度〉：「何時看到」寫明**多數情況核對後只需標處理、不動資料**。①查 `referral_pair_history` 有沒有（推薦人, 會員）這對、當月 `task_progress.monthly_referrals` 有沒有這位——**已有就不補**（下次付款已補計）
    ②都沒有才補一列 pair-history（月份＝付款時點台北月）並 +1 ③呼叫 `reconcile_king_credits(推薦人, 月份, 門檻)` 對帳推薦王（門檻讀 `reward_config.referral_king_monthly_threshold`，不寫字面量） ④標告警處理。
  - 〈補發漏發獎金〉第 1 步的撈取加 `and message like '【獎金未發%'`，不讓 3b／3d 的 error 混進來。
- 規格書：§8.3 後新增一段「推薦連結／任務進度寫入失敗」（error、文案開頭、自癒程度）；§9.1「計數自癒」補一句「3d 整段失敗時任務 +1 於該會員下次付款補計」。

### 2.3 `repair_orphaned_*` 的整批路徑

現況：最新定義 `repair_orphaned_payments`＝`20260807000001`、`_claim_rewards`＝`20261111000001`、`_forfeitures`＝`20260802000002`（之後無重定義）；
簽名都是 `(p_user_id uuid default null)`。生產呼叫端只有 Edge `repairOrphanedPaymentsBestEffort(userId)`（`/profile` 自癒、notify／return 收斂後），一律帶 id；
null 全量路徑沒有 pg_cron／SQL／Edge 呼叫者。現算既有測試 0 支以 null 呼叫（`rpc('…', { p_user_id: … })` 與 `sql` 版都帶 id；實作開工 `rg` 複核）。

鎖序分析：

- **全量（null）**：迴圈跨多位會員，子交易列鎖併入外層到整批結束——與 `20261115000001` 檔頭的互鎖環同構，是真風險，只是目前沒人觸發。
- **單人（X）**：迴圈只碰 X 自己的列。持 `profiles(X)` for update、對推薦人方向取 KEY SHARE、`task_progress(第 1 代推薦人)` for update。
  等 `profiles(X)` 的是「以 X 為推薦人的會員」的付款，它持有的 `profiles(該會員)`、`task_progress(X)` 都不是 X 需要的；X 的推薦人付款要的是更上一層，不碰 X。
  **前提**：推薦資料本身無環（profiles／edges 不互為推薦人）。成環守衛只在發獎時擋、不防資料成環——資料成環時才可能互鎖，那已是 `referral_cycle_detected` error 的範圍。
  同一人多筆在同一交易只是持 `profiles(X)` 較久，不成環。

規劃預設 **A（Q1）**：三支在**迴圈之前**加 `if p_user_id is null then raise exception using errcode = 'U6R02', message = '必須逐人呼叫（帶 p_user_id）'`；
簽名不改（`default null` 保留，部署雙向相容）、迴圈體不動。`repair_orphaned_claim_rewards` 的「依 claimer 排序避免全域互鎖」註解改寫為「全量路徑已關，排序僅保留處理順序」。
Edge `repairOrphanedPaymentsBestEffort`：`userId` 為空直接 return（supabase-js 會省略 undefined 參數＝null）。
A 不改變「單人多筆在同一交易」（上段已論證不成環）；這是對派工字面「改逐筆」的解讀偏離，PR 內文明講。

### 2.4 單筆開通失敗的告警

基準＝`20261115000001` 的 `complete_paid_pending_order`。差異（檔頭編號逐條列，對應下列 1～4）：

1. `when others` 的告警改為（整段包 `begin…exception when others then raise warning`，理由同 §2.2）：
   message＝`【已付款未開通・請開 Claude 處理】單號 <20碼>：會員已付款但自動開通失敗。下一步：開一個 Claude Code session，請它依 supabase/README〈已付款未開通〉處理。原因：<分類>（<sqlstate>）`；
   context＝`kind:'open_failed'`、`order_id`、`trade_no`、`sqlstate`、`sqlerrm`。單號：handler 內**一律以 `p_order_id` 回查** `payment_orders.transaction_id`（包子交易、coalesce「（查無單號）」），不碰 `v_row`——select 本身擲錯時 `v_row` 未指派，參照會擲 55000 被吞＝告警遺失。
2. 去重：同 source、`context->>'order_id'`、`kind='open_failed'`、`resolved_at is null` 已有就不寫。
3. 金額不符的去重查詢加 `(context->>'kind' = 'amount_mismatch' or context ? 'trade_amt')`（舊金額不符列帶 `trade_amt`、舊開通失敗列沒有）、寫入時 context 加 `kind:'amount_mismatch'`——兩種告警共用 source，互不遮蔽，且認得舊格式。
4. `outcome='completed'` 時順手把同單未處理的 `open_failed` 告警標 `resolved_at=now()`（暫時性失敗如 40P01 下一輪就好，不該留著叫業主開 Claude；依 **Q7**）。

回傳 `{'outcome':'failed','error':sqlerrm}` 不變（Edge `failed[]` 與帳本 summary，非外部通道）。heal 下一輪自動重試；連續失敗看 `scheduler_health` 的 `healFailedStreak`。
README 新增〈已付款未開通〉（同 §2.2 手冊格式：第 1 步先確認訂單是否仍 pending，已 completed 只標處理；讀 context 的 sqlstate／sqlerrm 判斷原因 → 修因 → 等下一輪或以 SQL 呼叫單筆函式 → 確認訂單 completed、訂閱生效 → 標處理）。

### 2.5 文件

- `supabase/README.md`：函式表刪 wrapper 列、`complete_paid_pending_order` 列註明「告警 source 沿用歷史名」；`repair_orphaned_*` 註明「必須帶 p_user_id」；
  告警 severity 的 error 清單加 3b／3d；〈補發漏發獎金〉第 1、2 步（P2-9）；新增〈補寫推薦連結〉〈補計任務進度〉〈已付款未開通〉。
- 新 migration 檔頭寫 P2-7／P2-8 的正確基準與說明（docs/README.md「歷史 migration 的檔頭註解」：不改已套用檔）。
- 規格書：§8.3 自癒句補「只逐人呼叫」；§8.3 後新增「推薦連結／任務進度寫入失敗」段（內容見本檔 §2.2）；§9.1；後台點數來源段「含批次自癒期間」刪去（P2-8 同源）。實作時 `grep -n "warning\|批次自癒\|complete_paid_pending" docs/uknow-software-specification.md` 並把結果記進 PR。跑 `check-spec-drift.py`。

## 3. 架構影響

- SQL 函式＋README＋規格書；Edge 只改註解與一行 guard；前端依 Q5（後台 lazy chunk，不動 entry）。
- 部署相容（main push 時 migration 先於 Edge）：新 DB × 舊 Edge（#524 版不叫 wrapper、repair 帶 id）→ 無 500；舊 DB × 新 Edge → 無差。
- 鎖：新告警只做無鎖 select＋insert；不新增鎖。
- 回滾：`create or replace` 回基準定義；wrapper 必要時從 `20261115000001` §3 原文重建。

## 4. UI/UX

- LINE：三則新文案的前 60 字（§2.2、§2.4；以 20 碼單號實算：3b 58、3d 55、開通失敗 58、Q3 59 字，後果句都完整）＝「【結論・請開 Claude 動作】單號 20 碼：後果」。
- 後台系統告警頁：120～170 字 message 照現有元件顯示，實作時用一則測試資料目視確認不截斷（階段 2 的手動驗證項）。
- Q5 選順修時：後台點數來源段刪「批次自癒期間的清空同樣可能有差」半句，其餘不動。

## 5. 階段切分

測試在 `supabase/functions/api/payment-closeout.test.ts`（Deno，需資料庫；CI api-tests 軌）。紅燈＝新測試對舊 migration 失敗。

| # | 階段 | 依賴 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | drop wrapper＋改測試 | — | 守門測試＋§2.1 清單 | wrapper 不存在；改寫後原情境全覆蓋（換線鎖跳過、多筆仍 try、效期錨定付款日、TOCTOU） |
| 2 | 3b／3d 升 error（Q3 採升則含 3a-bis） | Q2、Q3 | 觸發器注入 `referral_edges` insert 擲錯；`reconcile_king_credits` 擲錯；暫時把 `log_referral_side_effect_failure` 換成擲錯版 | 一筆 error；`slice(0,60)` 含 20 碼單號與「請開 Claude」（含「查無單號」分支）；整則無 sqlerrm／uid；context 有 sqlerrm、step 值不變；**告警函式擲錯時訂單 completed 且第 1 代獎金在**；同筆重跑不重複（含 subscription_id null）；anon 呼叫新函式被拒；W5-53 禁詞掃描 |
| 3 | 單筆開通失敗 | Q7 | 注入 `process_successful_payment` 擲錯；注入「重讀訂單 select 就擲錯」 | `slice(0,60)` 含 20 碼單號、「請開 Claude」、「自動開通失敗」（含查無單號分支）；整則無 sqlerrm；`failed.error`＝sqlerrm；重跑不重複；舊格式（無 kind）金額不符告警仍被去重認得、不被開通失敗遮蔽；之後成功開通 → 該告警自動標處理 |
| 4 | repair 關全量 | Q1 | 三支 null → U6R02；Edge guard 單元測試 | 帶 id 的既有 repair 測試全綠 |
| 5 | 後台文案（Q5 不採就整段刪） | Q5 | `ReferralAuditSheet.test.tsx` 改字與測試名 | 舊半句消失、無標點殘留；與階段 6 的規格書同句放同一 commit（免 spec-drift 中途紅） |
| 6 | 文件 | — | 獨立 `payment-closeout-runbook.unit.test.ts`（不連 DB；`new URL('../../README.md', import.meta.url)`），以「## 標題」整行比對文案引用的〈…〉都存在；`check-spec-drift.py`、`check-migration-versions.py`、`check-plans-scaffold.py` | README／規格書／檔頭齊 |

## 6. 開放問題（括號內為預設值：人審通過即視為採用）

- [ ] **Q1（業主；預設 A）**：`repair_orphaned_*`「改逐筆」怎麼做？
  **A（建議）**：關掉沒人用的全量路徑（null 擲錯），單人路徑不動——互鎖只在全量；改動小、部署雙向相容、不留要日後 drop 的 wrapper。A 不改「單人多筆同交易」（已論證不成環）。
  B：比照 S1 拆 `list_*`＋單筆＋Edge 迴圈——三支 × 兩函式、Edge 要改、舊函式得留 wrapper 到下一波（重演 W6-14），換來「全量可安全使用」，但目前沒有排程要用。
- [ ] **Q2（業主；預設推）**：3d 失敗也推 LINE？推薦王會自癒；任務 +1 要等這位會員下次付款才補計，月份可能晚一個月以上、推薦王門檻因此晚到。建議推；嫌吵可只推 3b、3d 維持 warning。
- [ ] **Q3（業主；未明確回覆則不升——這是範圍決定；我的建議是升）**：同類掃描——3a-bis（首購套用預設推薦人）失敗也只 warning；之後要到這位會員**下一次選新約續約**才可能再套（規格書 §7.4），一般續約不會，期間三代獎金都不發。
  建議一起升 error（同函式、同模式；派工範圍外的追加，PR 內文寫明）。文案：`【預設推薦人未套用・請開 Claude 補綁】單號 <20碼>：會員無推薦人、不發獎金。…〈補綁預設推薦人〉`，README 加一節；3a（推薦碼）有自癒，維持 warning。
  採升時一併：§1 加驗收列、階段 2 加 3a-bis 注入測試與前 60 字斷言、§2.5 加 README〈補綁預設推薦人〉與規格書 §8.3 文案、Q4 的 step 分佈已涵蓋 `default_referrer`。
- [ ] **Q4（主 session 代跑唯讀 SQL，正式站＋develop）**：
  ```sql
  -- drop gate 補強：誰依賴 wrapper、排程指令有沒有提到
  select count(*) from pg_depend d join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass where p.proname = 'complete_paid_pending_orders';
  select jobname from cron.job where command ilike '%complete_paid_pending_orders%';
  select proname from pg_proc where prosrc ilike '%complete_paid_pending_orders(%' and proname <> 'complete_paid_pending_orders';
  select funcname, calls from pg_stat_user_functions
   where funcname in ('complete_paid_pending_orders','complete_paid_pending_order','repair_orphaned_payments','repair_orphaned_claim_rewards','repair_orphaned_forfeitures');
  -- 3a～3d warning 歷史
  select context->>'step' as step, severity, count(*), max(created_at)
    from public.system_alerts where source = 'apply_referral_side_effects' group by 1, 2 order by 1;
  -- 已存在的推薦連結缺漏／不一致
  select count(*) filter (where e.referee_user_id is null) as missing_edge,
         count(*) filter (where e.referee_user_id is not null and e.referrer_user_id is distinct from p.referred_by_user_id) as mismatched
    from public.profiles p left join public.referral_edges e on e.referee_user_id = p.id
   where p.referred_by_user_id is not null;
  -- 單筆開通失敗告警的歷史樣本
  select created_at, severity, left(message, 80) from public.system_alerts
   where source = 'complete_paid_pending_orders' order by created_at desc limit 5;
  ```
  另請代查兩環境 `/api/health` 的 sha（drop gate ①）。
  **結果（主 session 11/25 04:40 台北代跑，正式站＋develop）**：cron.job／其他函式本體提到 wrapper 皆 0；pg_depend（補 refclassid 後）0；pg_stat_user_functions 空（track_functions 未開，不算證據）；`apply_referral_side_effects` 告警兩邊 0 列；單筆開通失敗告警兩邊 0 列；develop missing_edge 0、正式站 3（皆有推薦人但從未付款，edge 本就在首次付款 3b 才寫＝預期狀態，不需補寫）、mismatched 皆 0；gate ① 以部署紀錄為準已滿足（正式站 deploy-supabase run 42534091645，main 653e31e 含 #524，sha 比對通過；develop 自 11/08 起皆含 #524）。`missing_edge` > 0 時 PR 內文附補寫建議（不在 migration 自動補資料——動資料要人審）。
- [ ] **Q5（業主；預設順修）**：後台點數來源段「批次自癒期間的清空同樣可能有差」在 wrapper drop 後失真，本 PR 順修（後台 lazy chunk、一句字＋一條測試），或留第 8 波？
- [ ] **Q6（業主；預設照規劃）**：三則（Q3 選升則四則）新 LINE 文案的前 60 字措辭，見 §2.2、§2.4。
- [ ] **Q7（業主；預設自動標處理）**：單筆開通失敗告警在同單之後成功開通時自動標處理（§2.4-4），或每筆都留給人看？建議自動——暫時性失敗下一輪就好，留著會讓業主去查一筆已開通的單。

## 7. 風險與回滾

- 最壞（P0 已處理）：3b／3d 告警路徑擲錯 → 整個 `apply_referral_side_effects` 子交易回滾、三代獎金靜默消失。防線三層（呼叫端包、函式本體包、coalesce），階段 2 以「告警函式換成擲錯版」實測 3c 仍在。已知殘餘：`when others` 不捕 57014（statement_timeout）與 assert_failure——既有 handler 同樣如此，非新增。
- 告警洗版：去重鍵含實體（subscription_id／order_id）＋`resolved_at is null`；標處理後若仍失敗會再推一次（預期行為）。
- drop 後有未知呼叫者 → 42883。gate ①②為證；回滾＝重建。
- A 案：日後若有人以 null 呼叫 repair → U6R02 明確擲錯，訊息指出要逐人呼叫。
- 回滾：一支新 migration 以基準定義 `create or replace` 回去；README／規格書 revert。
