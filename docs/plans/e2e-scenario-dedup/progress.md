# e2e 情境去重 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`claude/e2e-scenario-dedup-owwsip`(web session 由平台預開,非 `feature/*`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 刪 admin_dashboard 4 條 + rewards_withdrawal 4 條(10.4s) | ⬜ 未開始 | — | |
| 2 | 刪 payment_result 2 + home_listings 5 + payment_checkout 5(12.7s) | ⬜ 未開始 | — | |
| 3 | 刪 route_guards 3 + renewal_backfill 2 + listing_management 2 + line_browser 1 + forgot_password 1(8.7s) | ⬜ 未開始 | — | |
| 4 | 回填 ci.yml 檔頭量測(情境數 182→142、計費分)與 friction-log | ⬜ 未開始 | — | |
| 5 | 刪除本規劃檔,原則升級進 e2e/README.md 與 friction-log | ⬜ 未開始 | — | |

> 本任務是純刪除,沒有一般意義的紅燈相位。各階段的「紅燈等價物」是
> **刪除後下層證據測試仍全綠**——驗證標準見 plan.md §5,不是 commit hash。

## 目前位置與下一步

規劃書已寫完(含 §1 量化基準、§4 逐情境 29 刪 / 16 存疑 / 102 留)。
**下一步:跑 `/review-plan e2e-scenario-dedup`,然後停,等人審。**
人審必須先裁決 plan.md §6 的 Q1——它質疑的是任務目標本身能不能達成
(實得 ≈450–600 分/月 vs 目標 700–1,000),不先定案的話後面三個階段
做完也交不出承諾的數字。

尚未動任何 `e2e/` 檔案。

## Blockers(逃生口紀錄)

- **Q1 未裁決前不進入階段 1**:若人審選擇「(c) 重新檢視 xdist 否決」,
  整個刪除清單的優先順序會變(那是另一條更大的槓桿)。

## 框架摩擦

- ci.yml 檔頭的 e2e 數字(「~7 計費分」「182 個情境」)與 2026-08-07 實測
  不符(5–7 計費分、173 個情境)。檔頭是本任務的授權來源,授權來源自己
  帶著過期數字——階段 4 回填,並考慮是否值得為「情境數」加一條機械把關
  (`scripts/check-workflows.py` 已有先例)。
- 本機 python 是 3.11,CI 與 CLAUDE.md 前置寫 3.12;e2e 套件在 3.11 下
  173 passed 全綠,沒有版本相依問題,但兩邊不一致值得記一筆。
