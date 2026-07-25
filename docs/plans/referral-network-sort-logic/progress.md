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

規劃書與四視角審查報告(`./review.md`)皆已完成,**尚未實作**。
審查結果:**1 個 P0、6 個 P1、15 個 P2**,另 5 項需人工裁決。

**卡在 P0-1**:使用者需求「第一代先自己排好、其第二代自己排自己的」有兩種
解讀未被排除——(a) 僅換排序鍵(規劃書現行方案);(b) 世代分組呈現(現行巢狀
懶載入樹會讓展開的二代插進一代之間,一代節點不連續)。(b) 成立的話 §2/§4/§5
要重寫。需求方確認前不得開工。

下一步:人在 `review.md`「處置」節逐項裁決 → 有 P0 未豁免則修訂 plan 後
重跑 `/review-plan` → 通過後由人親自打 `/tdd-implement referral-network-sort-logic`。

## Blockers(逃生口紀錄)

尚無。

注意:階段 1–2 的 deno 測試需要 `supabase start`(本地 Postgres),
本機無 deno/supabase CLI 時靠 CI 的 api-tests 軌兜底(見 SessionStart 提示)。

## 框架摩擦

尚無。
