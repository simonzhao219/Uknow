# 推薦網絡排序器邏輯修正 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看。 -->

分支:`claude/recommendation-network-sorter-logic-ap6yza`
(web session 自動分支;走守衛版流程時改用 `feature/referral-network-sort-logic`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 排序鍵:子樹最新 → 自身 joinedAt(`sortNodeIds`) | ⬜ 未開始 | | |
| 2 | 伺服器預設 → `updated_asc`(`parseSortMode`) | ⬜ 未開始 | | |
| 3 | 前端預設 → `updated_asc`(`parseSortMode` / `readStoredSort`) | ⬜ 未開始 | | |
| 4 | 排序指示點基準跟隨新預設(`ReferralTreeView` L534) | ⬜ 未開始 | | |
| 5 | 移除死欄位 `subtreeLatestJoinedAt` / `subtreeMs` | ⬜ 未開始 | | |

## 目前位置與下一步

規劃書已完成,尚未實作(本專案規定:規劃未經人審通過不得寫產品程式碼)。
下一步:跑 `/review-plan referral-network-sort-logic` 取得四視角審查報告,
連同 plan.md §6 的五個開放問題一起等人裁決;裁決後由人親自打
`/tdd-implement referral-network-sort-logic` 才開工。

## Blockers(逃生口紀錄)

尚無。

注意:階段 1–2 的 deno 測試需要 `supabase start`(本地 Postgres),
本機無 deno/supabase CLI 時靠 CI 的 api-tests 軌兜底(見 SessionStart 提示)。

## 框架摩擦

尚無。
