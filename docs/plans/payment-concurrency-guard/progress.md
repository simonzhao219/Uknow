# 金流與推薦的並行防線 實作進度

<!-- plans-keep: S2 施工期鷹架，draft PR 期間需在 CI 中存在；退場條件＝/tdd-implement 收尾以 chore(plans) commit 刪除整個目錄 -->

分支:`feature/payment-concurrency-guard`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)
第 5 波工項 S2;主 session `session_01MQovbBpvF5cMi5BqUrAH86`。紅綠燈 hash 以 PR 內文為準。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | C:唯一索引+repair 鎖 | ✅ 綠 | e905070(CI run 41899960223 紅 2 條)；並行測試修正 8f5173d | 7b98a21(CI run 41902489456 綠) |
| 2 | B:register 走 validate(後端) | ✅ 綠(待 CI) | eaec081(CI run 41902489456 紅 4 條) | dbd9c52 |
| 3 | B:register 400／503 前端 | ✅ 綠 | 7ce5d4c(本機 vitest 紅 3 條) | bcb7fa7 |
| 4 | D:稍後註冊改登出、cancel-signup 退場 | ⬜ 未開始 | | |
| 5 | E:prepare 停權 403+prepare_payment_order(後端) | ⬜ 未開始 | | |
| 6 | E:結帳頁停權卡(前端) | ⬜ 未開始 | | |
| 7 | A+W5-14:重複付款偵測、付款途中停權告警 | ⬜ 未開始 | | |
| 8 | 收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃 r2 已納入 W5-11～14 與審查 P1;等主 session 親審後由業主親打 `/tdd-implement payment-concurrency-guard`。
開工第一步:S3(#508)合併後 rebase origin/develop。§2.7 唯讀 SQL 11/04 23:00 兩邊皆 0 列。

## Blockers(逃生口紀錄)

- 環境：本機 `supabase start` 拉不到映像(Docker Hub 429、ECR／GHCR blob 被 proxy 擋)。D 層紅綠以 PR #510 的 api-tests 軌為證；
  SQL 另以本機 Postgres 16＋最小 Supabase shim 套全部 migration 驗(scratchpad 的 apply.sh)。
- 階段 1：〈兩個並行補發〉紅燈 commit 在 CI 上意外綠——postgres.js 查詢 lazy，第二條連線未真的並行(測試寫錯，非功能已存在)。
  解鎖後以 `test:` commit 8f5173d 修正(.execute())；修正前 DB 於本機重現 2 列、修正後 1 列。

## 框架摩擦
