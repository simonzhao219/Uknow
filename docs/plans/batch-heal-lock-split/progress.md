# 批次自癒與線上付款互鎖 實作進度

<!-- plans-keep: 第 6 波 S1 施工鷹架；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

分支：`feature/batch-heal-lock-split`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 死鎖重現 → 單筆交易 heal | ✅ 綠 | 56dce8c6 | 17052c4a |
| 2 | per-user 逐筆（W6-13） | ✅ 綠（逃生口 1） | —（一寫就綠） | 9abf8017 |
| 3 | 發獎失敗改 error（W6-10、W6-12） | ✅ 綠 | 1d2ea7ba | d7dcb0fc |
| 4 | 帳本 summary：unknownByReason、heal | ✅ 綠 | 4cdb2ba7 | cec602fa |
| 5 | scheduler_health streak | ✅ 綠 | b04414a5、d46469d5（改名） | c8435b97 |
| 6 | invoke_internal_endpoint(p_job, p_trigger) | ✅ 綠 | 89026f22 | 844cae81 |
| 7 | 收尾（文件同步＋實作審查修正） | ✅ 綠 | d5ca6f57（審查修正紅燈） | （見下一個 commit） |

## 目前位置與下一步

業主 2026-11-08 在本 session 親打 `/tdd-implement batch-heal-lock-split` 開工（主 session 已親審 r3 通過）。階段 1～6 綠；下一步階段 7（收尾：文件同步、check:full、review-implementation、清規劃檔、開 PR）。
本機環境：dockerd 背景起、`npm i -g supabase@2.109.1`、`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start -x studio,logflare,vector,supavisor,imgproxy,edge-runtime`；新 migration 以 psql 直接套。

## Blockers（逃生口紀錄）

- 階段 1：`complete_paid_pending_orders：多筆時第 2 筆仍走 try` 一寫就綠——它是重構護欄（舊版本來就在迴圈前設旗標），不是紅燈證據；紅燈證據是 heal-lock-split（實測 X 對 U1 的第 1 代被 40P01 吞掉）、0b 預取（函式不存在）與 unit 四條。

- 階段 2：per-user 驗收一寫就綠——逐筆化已在階段 1 接上（plan 階段 1 寫明 index.ts 兩處），且「一張不符不拖累另一張」舊版也成立；本測試是 W6-13 的驗收護欄，不是紅燈證據。
- 階段 3：紅燈期改測試一處——`referral-reward-failure-alert.test.ts` 第 2 代案例把 context.generation 的期望值由字串 `'2'` 改成數字 `2`
  （實作與既有告警都存數字；斷言行為不變）。授權：業主 2026-11-08 本 session 互動選項「Fix the test (Recommended)」。
- 階段 3 發現（範圍外，未改）：舊 wrapper 重現時第一個撞鎖點是 3b 建推薦邊（`apply_referral_side_effects：建立推薦邊失敗…deadlock detected`，
  warning），比發獎更早。逐筆化後這條環已不存在；但 3b／3d 失敗仍只是 warning，漏建推薦邊會影響之後的第 2、3 代——回報主 session 列候選。
- 階段 4：`heal` dep 型別維持 `data: unknown`（plan §2.6 寫 `HealResult | null`）——紅燈期測試檔鎖住，既有 mock `{ completed: 0 }` 不合新型別；
  改由 `healLedgerSummary` 逐鍵防禦解析（形狀不符當 0）。行為與 plan 相同，PR〈偏離規劃說明〉列這條。
- 階段 5：紅燈 commit 後發現一個測試名 76 字超過 72（check-test-names 經 `| tail` 吞了 exit code，chain 照走）。只改名、斷言不動。
  授權：業主 2026-11-08 本 session 互動選項「Allow the rename (Recommended)」；解鎖→改名→重建鎖，另疊一個 test(red) commit。

### 偏離規劃說明（實作審查後彙整，PR 內文照抄）

1. migration 版本號 `20261115000001`（plan 寫 `2026111400000N`）：`20261114000001` 已被 S5 用掉；仍排在 S6 之前。
2. 告警訊息另抽成 `log_referral_reward_failure`（plan 寫 handler 內反查）：三代與 3c 共用一處，避免四份拷貝。
3. `UnknownReason` 由 `reconcile-handler.ts` 的 `UNKNOWN_REASONS` 元組推導、`UNKNOWN_STATUS_LABEL` 以 `Record<UnknownReason,string>` 約束（plan 寫 `keyof typeof UNKNOWN_STATUS_LABEL`）：避免 handler 反向依賴 index.ts；漏一個 label 編譯會擋。
4. 四種 unknown reason 的計數測試放 `reconcile-outcome.unit.test.ts`（假 client，plan 寫 `reconcile-pending-payments.test.ts`）：不需 DB 即可驗。
5. `heal` dep 型別維持 `data: unknown`、`healLedgerSummary` 逐鍵防禦（見上，階段 4）；data 為 null 時 `heal.error=true`。
6. `paid-pending-heal.ts` 對未知 outcome 記 `failed`（plan 未寫，防禦）。
7. 反查失敗的措辭統一為「（查無單號）」（plan §7 寫「（查詢失敗）」）。
8. 實作審查 P1 修正：原始錯誤（sqlerrm）不再進 LINE 訊息、只放 context；context 加 `amount`；3c 整批訊息補第 1 代推薦碼、每代點數、「核對三代」；README 補發 runbook 補完整 SQL。
9. 未補的驗收字面：階段 6「manual 完成列不刷新 lastPgCronCompletedAt」沒有新增斷言——`scheduler_health` 只看 `trigger='pg_cron'` 的既有測試已覆蓋；預設 `pg_cron` 由既有「Vault 有值 → body trigger pg_cron」測試覆蓋。

## 框架摩擦

- 驗證指令接 `| tail` 後再 `&&`：管線的 exit code 是 tail 的，檢查失敗照樣往下走（本次 check-test-names 就這樣漏到 commit）。
