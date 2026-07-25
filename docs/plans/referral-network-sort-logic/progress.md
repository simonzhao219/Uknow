# 推薦網絡排序器邏輯修正 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看。 -->

分支:`claude/recommendation-network-sorter-logic-ap6yza`
(web session 自動分支;走守衛版流程時改用 `feature/referral-network-sort-logic`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 排序鍵 → 自身 joinedAt ＋ `tie()` 改升冪 ＋ 種子加開(多子節點/同名組) | ⬜ 未開始 | | |
| 2 | 伺服器預設 → `updated_asc`,改讀 `@contract` 的 `DEFAULT_NETWORK_SORT` | ⬜ 未開始 | | |
| 3 | search 不再靜默截斷:`offset`/`limit` 分頁,`total` = 全部命中數 | ⬜ 未開始 | | |
| 4 | 前端預設 ＋ `SORT_OPTIONS` 重排(預設項置頂)＋ e2e mock sort 回聲 | ⬜ 未開始 | | |
| 5 | 指示點基準 ＋ A1 可見層 ＋ 選單順序 ＋ `aria-label` 含當前排序 | ⬜ 未開始 | | |
| 6 | search 結果 UI:「已顯示 X / Y 筆」＋ 載入更多 | ⬜ 未開始 | | |
| 7 | 切排序載入回饋(`isValidating` 下傳並呈現) | ⬜ 未開始 | | |
| 8 | 型別收斂 `@contract` re-export ＋ 移除死欄位(紅燈 = 執行期斷言) | ⬜ 未開始 | | |
| 9 | 規格書回填(以 code 為準)——文件階段,無測試落點 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃書(**v3**)與四視角審查報告(`./review.md`)皆已完成,**尚未寫任何產品程式碼**。

審查結果 1 個 P0 / 6 個 P1 / 15 個 P2 / 5 項需人工裁決,**已全數處置**
(`review.md`「總裁決」= 修訂後通過)。

**需求方裁決摘要**(共兩輪,2026-07-25):

1. 需求 B = **僅換排序鍵**,維持現行巢狀懶載入樹呈現(P0 解除)
2. 列上**不**露出加入日期;老使用者 localStorage **不動**、**不**告知
3. 下拉選單**重排**成預設項置頂(最舊/最新/A→Z/Z→A,文字一字不動)
4. **搜尋原則:符合條件的都必須搜得到** → 沿用 `/rewards/history` 既有模式
   (伺服器端篩選 + total + offset 分頁 + 「已顯示 X / Y」+ 載入更多)
5. 手機端維持 icon-only、A1 限縮 sm+、修 `aria-label`
6. 預設值收斂為 `@contract` 的 `DEFAULT_NETWORK_SORT`
7. 切排序的無回饋空窗**本次處理,不留既有債**
8. `tie()` 改升冪;`joinedAt` 語意接受現況(= `referred_at`,rewire 不更新)
9. 規格書**以 code 為準**回填

**唯一未回覆項**:#11a「最舊加入」當預設的**理由**(待確認的推測是「舊→新 ≈
續約到期先後」)——只影響 Phase 9 的規格書文字,**不阻擋 Phase 1–8 開工**。

**衍生的獨立 feature(不併入本次)**:#12 首頁篩選器改伺服器端
(`HomePage.tsx` 直查 `public_listings`、無 limit/count、瀏覽器端篩選,
刊登數超過 PostgREST `db-max-rows` 後「符合條件的搜不到」必然發生)。

下一步:由人親自打 `/tdd-implement referral-network-sort-logic` 開工。
(v3 新增的 Phase 3/6/7/9 未經四視角審查,想再保險可對修訂後的 plan.md
重跑 `/review-plan`——非流程強制。)

## Blockers(逃生口紀錄)

尚無。

注意:階段 1–2 的 deno 測試需要 `supabase start`(本地 Postgres),
本機無 deno/supabase CLI 時靠 CI 的 api-tests 軌兜底(見 SessionStart 提示)。

## 框架摩擦

尚無。
