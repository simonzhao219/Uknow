# 續約路徑潛伏組（renewal-path-hardening）實作進度

<!-- plans-keep: 第 5 波 S6 進度鷹架；退場條件＝/tdd-implement 收尾刪除；未實作完則隨主 session PR 先合併，第 6 波接手後刪 -->

分支：`feature/renewal-path-hardening`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
紅綠燈 hash 以 PR 內文為準（W5-10）；本表只在 rebase 前暫記。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 環偵測函式＋自領停發 | ✅ 綠（本機 PG16 驗；CI 待推） | c07b790c | （本 commit） |
| 2 | 訂單換線意圖＋prepare RPC 新 outcome＋付款端 0d＋changed_at | ✅ 綠（本機 PG16 驗 11 案＋併發 3 案；CI 待推） | d661f92a | （本 commit） |
| 3 | Edge prepare 改寫 | ✅ 綠（deno check；CI 待推） | fd1da6d1 | （本 commit） |
| 4 | `/profile` 續費卡單旗標＋heal | ✅ 綠（deno check；CI 待推） | 34976ec7 | （本 commit） |
| 5 | pair-history 表＋回填＋king_round_base | ✅ 綠（本機 PG16 驗 4 案；CI 待推） | def43188 | （本 commit） |
| 6 | 結帳頁 server profile＋新約確認框 | ✅ 綠（vitest 70／70） | 1c70eb1b | （本 commit） |
| 7 | e2e mocked＋journey f70＋規格書同步 | ⬜ 未開始 | | |

## 目前位置與下一步

業主 11/05 22:37 開工（review.md 處置節）。階段 1～6 綠；下一步階段 7（e2e mocked＋journey f70）。階段 2 與 3 須同一 PR 合併（plan §2.3）。
本機驗證環境：scratchpad 的 `apply.sh`（PG16＋shim，套全部 migration）；deno 測試的正式紅綠以 CI api-tests 為準。
舊敘述：規劃完成、/review-plan 完成（P0 0／P1 16／P2 13，見 review.md）。下一步：業主裁決 plan §6 Q1–Q6 與審查 P0 → 在本 session 親打 `/tdd-implement renewal-path-hardening`。
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

- 階段 2 的 2 支併發測試在 CI 綠不了：持鎖交易內輪詢 pg_stat_activity 只會看到第一次的快照。業主 2026-11-06 00:34（台北）於本 session 互動選項：「允許修輪詢寫法」。只在 `waitForAdvisoryWaiters` 每輪先呼叫 `pg_stat_clear_snapshot()`，斷言不動。

- 階段 6 綠燈期：2 支既有測試釘住被裁決改掉的行為（〈fresh 選中展開清空揭露…〉的舊文案「不填則不會有推薦人」，W5-51；
  〈暫時無法驗證後按付款會重驗…〉假設無資產新約第二次按即送單，W5-7）。業主 2026-11-06 00:03（台北）於本 session 互動選項：
  「授權改這 2 支測試」。暫移 tdd-lock 改兩處斷言（文案改斷言「維持原本的推薦人」、第二次按付款後先點確認鈕），其餘斷言不動，隨即恢復鎖。

## 框架摩擦

- **推送守衛 rebase 後要求 force-with-lease，分類器卻擋 force 推送**（誤擋，死循環；2026-11-05）：develop 前進後，每次推送前的
  PreToolUse 守衛先把本地 `feature/*` rebase 到 origin/develop，再要求 `--force-with-lease`；auto mode 分類器把 force 推送判成
  Git Destructive 擋下。develop 動到同一檔（friction-log.md）時守衛的 rebase 直接衝突、整個指令不執行；守衛以指令字串比對，
  指令內任何位置出現推送字樣（含 heredoc 內文）都會觸發。S6 規劃期改走派工 prompt 備案：`read-tree origin/<分支>` →
  `update-index --cacheinfo` 只放改動檔 → `commit-tree -p origin/<分支>` → 以 `<sha>:refs/heads/<分支>` 快轉推送（遠端歷史不改寫），
  再 `checkout -B` 對回遠端。本條因此不直接寫 friction-log.md（避免分支與 develop 衝突），由第 5 波審查整併時搬過去。
  候選：守衛在「本地只領先、未落後遠端分支」時不 rebase；rebase 要求只在開 PR／合併前檢查；比對指令時只看實際的 git 子命令。
