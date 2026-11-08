# 批次自癒與線上付款互鎖 實作進度

<!-- plans-keep: 第 6 波 S1 施工鷹架；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

分支：`feature/batch-heal-lock-split`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 死鎖重現 → 單筆交易 heal | ⬜ 未開始 | | |
| 2 | per-user 逐筆（W6-13） | ⬜ 未開始 | | |
| 3 | 發獎失敗改 error（W6-10、W6-12） | ⬜ 未開始 | | |
| 4 | 帳本 summary：unknownByReason、heal | ⬜ 未開始 | | |
| 5 | scheduler_health streak | ⬜ 未開始 | | |
| 6 | invoke_internal_endpoint(p_job, p_trigger) | ⬜ 未開始 | | |
| 7 | 收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

plan r3 已併入 W6-10～14、首審 13 條與重審 8 條 P1，等主 session 親審；業主在本 session 親打 `/tdd-implement batch-heal-lock-split` 才開工。

## Blockers（逃生口紀錄）

## 框架摩擦
