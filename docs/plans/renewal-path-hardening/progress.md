# 續約路徑潛伏組（renewal-path-hardening）實作進度

<!-- plans-keep: 第 5 波 S6 進度鷹架；退場條件＝/tdd-implement 收尾刪除；未實作完則隨主 session PR 先合併，第 6 波接手後刪 -->

分支：`feature/renewal-path-hardening`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
紅綠燈 hash 以 PR 內文為準（W5-10）；本表只在 rebase 前暫記。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 環偵測函式＋自領停發 | ⬜ 未開始 | | |
| 2 | 訂單換線意圖＋prepare RPC 新 outcome＋付款端 0d＋changed_at | ⬜ 未開始 | | |
| 3 | Edge prepare 改寫 | ⬜ 未開始 | | |
| 4 | `/profile` 續費卡單旗標＋heal | ⬜ 未開始 | | |
| 5 | pair-history 表＋回填＋king_round_base | ⬜ 未開始 | | |
| 6 | 結帳頁 server profile＋新約確認框 | ⬜ 未開始 | | |
| 7 | e2e mocked＋journey f70＋規格書同步 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃完成、/review-plan 完成（P0 0／P1 16／P2 13，見 review.md）。下一步：業主裁決 plan §6 Q1–Q6 與審查 P0 → 在本 session 親打 `/tdd-implement renewal-path-hardening`。
施工前先請主 session 代跑 plan §7 的唯讀查詢 1–7，結果記在下方。

## 正式站唯讀查詢結果

主 session 2026-11-05 代跑（plan §7 編號）：

| # | 查詢 | 正式站 | develop |
|---|---|---|---|
| 1 | profiles 與 edges 不一致 | 1（已註冊未首購，edge 付款時才建，正常；查詢應排除無 completed 訂單者） | 0 |
| 2 | 環 | 0 | 0 |
| 3 | 自領列 | 0 | 0 |
| 4 | ledger_reset／referral_king_rewards | 0／1 | 0／1 |
| 5 | 回填預覽：月桶（`task_progress.monthly_referrals`）／gen1（`source_claim_id is null`）配對、差集 | 15／15，差集 0／0，聯集 15 | 10／10，差集 0／0 |
| 6 | pending 的 fresh 單 | 0 | 0 |
| 7 | changed_at > completed_at | **3**（延遲 2～38 秒；三人獎金與 edge 都已正常發放，潛伏、無損失） | 1 |

結論：migration B 回填正式站新增 15 列 pair、不改既有 21 列 reward_transactions；king_round_base 無 fresh 歷史可補（ledger_reset 0）；1 張既有 credit 不受影響；q7 佐證 changed_at 閘門 bug 成立。

## Blockers（逃生口紀錄）

## 框架摩擦
