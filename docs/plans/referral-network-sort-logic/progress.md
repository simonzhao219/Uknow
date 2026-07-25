# 推薦網絡排序器邏輯修正 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看。 -->

分支:`claude/recommendation-network-sorter-logic-ap6yza`
(web session 自動分支;走守衛版流程時改用 `feature/referral-network-sort-logic`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 排序鍵:子樹最新 → 自身 joinedAt(`sortNodeIds`)＋測試種子加開多子節點分支 | ⬜ 未開始 | | |
| 2 | 伺服器預設 → `updated_asc`(`parseSortMode`) | ⬜ 未開始 | | |
| 3 | 前端預設 → `updated_asc`＋`SORT_OPTIONS` 重排(預設項置頂)＋e2e mock sort 回聲 | ⬜ 未開始 | | |
| 4 | 指示點基準 ＋ A1 可見層斷言 ＋ 選單順序(`ReferralTreeView`) | ⬜ 未開始 | | |
| 5 | 型別收斂 `@contract` re-export ＋移除死欄位(紅燈=執行期斷言) | ⬜ 未開始 | | |

## 目前位置與下一步

規劃書(**v2,已依審查修訂**)與四視角審查報告(`./review.md`)皆已完成,
**尚未寫任何產品程式碼**。

審查結果:1 個 P0、6 個 P1、15 個 P2,另 5 項需人工裁決。

**P0 已解除**(2026-07-25 需求方裁決):需求 B 指的是**僅換排序鍵**,維持現行
巢狀懶載入樹呈現;已排除「世代分組呈現」的替代解讀。

其餘人審裁決:列上**不**露出加入日期;回訪使用者的 localStorage **不動**、
**不**做一次性告知;下拉選單**重排**成預設項置頂(最舊/最新/A→Z/Z→A,文字不動)。

**開工前仍須清的待裁決 8 項**(見 `review.md`「待裁決」節),其中 1 個 P1:
`search` 命中 >50 時排序後才 `slice(0,50)`,排序方向一改就換一批人搜得到,
且 UI 不顯示 total、截斷是靜默的。

下一步:人在 `review.md` 清完「待裁決」→ 由人親自打
`/tdd-implement referral-network-sort-logic` 開工。

## Blockers(逃生口紀錄)

尚無。

注意:階段 1–2 的 deno 測試需要 `supabase start`(本地 Postgres),
本機無 deno/supabase CLI 時靠 CI 的 api-tests 軌兜底(見 SessionStart 提示)。

## 框架摩擦

尚無。
