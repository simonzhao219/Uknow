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
| 5 | scheduler_health streak | ✅ 綠 | b04414a5、d46469d5（改名） | （見下一個 commit） |
| 6 | invoke_internal_endpoint(p_job, p_trigger) | ⬜ 未開始 | | |
| 7 | 收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

業主 2026-11-08 在本 session 親打 `/tdd-implement batch-heal-lock-split` 開工（主 session 已親審 r3 通過）。階段 1～5 綠；下一步階段 6（invoke_internal_endpoint p_trigger）。
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

## 框架摩擦

- 驗證指令接 `| tail` 後再 `&&`：管線的 exit code 是 tail 的，檢查失敗照樣往下走（本次 check-test-names 就這樣漏到 commit）。
