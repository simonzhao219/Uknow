# 批次自癒與線上付款互鎖 實作進度

<!-- plans-keep: 第 6 波 S1 施工鷹架；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

分支：`feature/batch-heal-lock-split`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 死鎖重現 → 單筆交易 heal | ✅ 綠 | 56dce8c6 | （見下一個 commit） |
| 2 | per-user 逐筆（W6-13） | ✅ 綠（逃生口 1） | —（一寫就綠） | （見下一個 commit） |
| 3 | 發獎失敗改 error（W6-10、W6-12） | ⬜ 未開始 | | |
| 4 | 帳本 summary：unknownByReason、heal | ⬜ 未開始 | | |
| 5 | scheduler_health streak | ⬜ 未開始 | | |
| 6 | invoke_internal_endpoint(p_job, p_trigger) | ⬜ 未開始 | | |
| 7 | 收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

業主 2026-11-08 在本 session 親打 `/tdd-implement batch-heal-lock-split` 開工（主 session 已親審 r3 通過）。階段 1、2 綠；下一步階段 3（發獎失敗改 error）。
本機環境：dockerd 背景起、`npm i -g supabase@2.109.1`、`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start -x studio,logflare,vector,supavisor,imgproxy,edge-runtime`；新 migration 以 psql 直接套。

## Blockers（逃生口紀錄）

- 階段 1：`complete_paid_pending_orders：多筆時第 2 筆仍走 try` 一寫就綠——它是重構護欄（舊版本來就在迴圈前設旗標），不是紅燈證據；紅燈證據是 heal-lock-split（實測 X 對 U1 的第 1 代被 40P01 吞掉）、0b 預取（函式不存在）與 unit 四條。

- 階段 2：per-user 驗收一寫就綠——逐筆化已在階段 1 接上（plan 階段 1 寫明 index.ts 兩處），且「一張不符不拖累另一張」舊版也成立；本測試是 W6-13 的驗收護欄，不是紅燈證據。

## 框架摩擦
