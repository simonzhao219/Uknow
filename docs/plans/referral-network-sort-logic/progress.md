# 推薦網絡排序器邏輯修正 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看。 -->

分支:`claude/recommendation-network-sorter-logic-ap6yza`
(web session 自動分支;走守衛版流程時改用 `feature/referral-network-sort-logic`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 排序鍵 → 自身 joinedAt ＋ `tie()` 改升冪 ＋ 種子加開(多子節點/同名組) | ✅ 綠 | `4027c2f` | `d1601d0` |
| 2 | 伺服器預設 → `updated_asc`,改讀 `@contract` 的 `DEFAULT_NETWORK_SORT` | ✅ 綠 | `372662d` | `09044fe` |
| 3 | search 不再靜默截斷:`offset`/`limit` 分頁,`total` = 全部命中數 | ✅ 綠 | `19b9e55` | `a05e8b6` |
| 4+5 | 前端預設 ＋ `SORT_OPTIONS` 重排 ＋ e2e mock ＋ 指示點基準 ＋ A1 可見層 ＋ `aria-label`(**合併,見 B-3**) | ✅ 綠 | `c6d473f` / `592bb9b` | `PENDING` |
| 6 | search 結果 UI:「已顯示 X / Y 筆」＋ 載入更多 | ⬜ 未開始 | | |
| 7 | 切排序載入回饋(`isValidating` 下傳並呈現) | ⬜ 未開始 | | |
| 8 | 型別收斂 `@contract` re-export ＋ 移除死欄位(紅燈 = 執行期斷言) | ⬜ 未開始 | | |
| 9 | 規格書回填(以 code 為準)——文件階段,無測試落點 | ⬜ 未開始 | | |

## 目前位置與下一步

**實作進行中**:9 階段已完成 5 個(1、2、3、4+5 合併)。

已完成的行為變更:

1. **排序鍵**改為節點自身 `joinedAt`——每一代各自排序,下線加入不再把上線
   推到列表頂端;`tie()` 一併改升冪,升冪模式下所有比較鍵方向一致
2. **預設排序**改為 `updated_asc`(最舊加入),收斂為 `@contract` 的
   `DEFAULT_NETWORK_SORT` 單一來源(原本散落兩個 runtime 共四處)
3. **search 不再靜默截斷**:`offset`/`limit` 分頁,`total` 恆為全部命中數
4. **選單重排**成預設項置頂(最舊/最新/A→Z/Z→A,文案一字未動)、
   指示點基準跟隨新預設、`aria-label` 補上目前排序值(償還既有 a11y 債)

**下一步:Phase 6**——search 結果 UI 顯示「已顯示 X / Y 筆」+ 載入更多
(比照 `RewardHistory.tsx` L281–288 的既有模式),讓 Phase 3 的分頁能被使用者
實際用到。接著 Phase 7(切排序載入回饋)、Phase 8(移除死欄位)、
Phase 9(規格書回填)。

**未回覆項**(不阻擋):#11a「最舊加入」當預設的**理由**,只影響 Phase 9 的
規格書文字。

**衍生的獨立 feature(不併入本次)**:#12 首頁篩選器改伺服器端
(`HomePage.tsx` 直查 `public_listings`、無 limit/count、瀏覽器端篩選,
刊登數超過 PostgREST `db-max-rows` 後「符合條件的搜不到」必然發生)。

## Blockers(逃生口紀錄)

### B-3 【逃生口 2:plan 階段切分有誤】SORT_OPTIONS 重排跨兩個階段的測試落點

**狀態:✅ 已裁決並處置(2026-07-25)** — 需求方選 **(a) 合併 Phase 4/5 的重排部分**,
由人授權解鎖後一併更新 `ReferralTreeView.test.tsx` 的順序斷言。合併後的紅綠循環:
紅燈 `592bb9b`(2 failed | 13 passed,biome/tsc 綠)→ 綠燈見下表。
plan §5 的 Phase 4/5 欄位已標註「重排跨 4/5,實作時合併」。

plan §5 把「`SORT_OPTIONS` 重排(預設項置頂)」放在 Phase 3/4,但把
「選單順序斷言」放在 Phase 5 的驗證標準。實作後發現這個切分不成立:

| 測試檔 | plan 指定階段 | 目前期望 |
|---|---|---|
| `src/utils/referralNetwork.test.ts` | Phase 4 | `[最舊, 最新, A→Z, Z→A]`(已改) |
| `src/components/referral/ReferralTreeView.test.tsx` L187–192 / L215–220 | Phase 5 | `[最新, 最舊, A→Z, Z→A]`(未改) |

元件以 `SORT_OPTIONS.map(...)` 渲染,兩份期望**必然同進退**——不存在能同時
滿足兩者的實作(除非刻意讓顯示順序與資料順序脫鉤,那是為過測試而扭曲設計)。
因此 `npm run check` 現在紅在 `ReferralTreeView.test.tsx` 的 2 條斷言,
`scripts/tdd-unlock.sh` 不放行,而紅燈期守衛(正確地)禁止我改測試檔。

註:plan §5「既有測試受影響清單」**已預先列出這兩處**,review.md 的處置節
也已由需求方核可重排——所以這不是「測試寫錯」,是階段切分把一個不可分割的
變更切成兩半。

**建議處置(擇一,需人裁決)**:

- **(a) 合併 Phase 4/5 的重排部分**〔建議〕:視為同一個紅綠循環,由人解鎖後
  一併更新 `ReferralTreeView.test.tsx` 那兩條順序斷言(文案不動、只動順序),
  再跑 unlock 收綠。plan §5 對應欄位標註「重排跨 4/5,實作時合併」。
- (b) 把重排整個移到 Phase 5:需回退 Phase 4 紅燈中的 `SORT_OPTIONS` 斷言,
  等於重做 Phase 4 的紅燈 commit,歷史較亂。
- (c) 放棄重排(推翻需求方裁決)——不建議。

其餘 Phase 4 內容(預設值改讀 `DEFAULT_NETWORK_SORT`)**本身已綠**:
`npx vitest run src/utils/referralNetwork.test.ts` → 12 passed。

### B-1 環境限制:後端階段的紅綠燈只能從 CI 讀(2026-07-25)

本 session 環境無法在本機驗證任何 Deno 側變更:

| 嘗試 | 結果 |
|---|---|
| 安裝 deno | ✅ 成功(改走 npm `deno@2.9.4`;官方 `deno.land` 安裝腳本被 proxy 擋,403) |
| `deno task check`(型別) | ❌ **失敗**——`jsr:@supabase/supabase-js` 的 `jsr.io` 直連與走 proxy **都是 403**,相依拉不下來 |
| `deno task test` | ❌ **不可能**——需 `supabase start` 起本地 Postgres,而 **docker daemon 不可用** |

→ **處置**:Phase 1/2/3/8 的後端部分改為「commit 紅燈 → push → 讀 CI
`api-tests` 軌的紅 → 實作 → push → 讀 CI 綠」,紅燈證據為 CI run URL 而非
本機輸出。此為 CLAUDE.md 既有的兜底路徑(「完整測試由 CI 的 api-tests 軌兜底」),
非違規;但每個後端階段多一次 CI round-trip。
前端階段(4–7)不受影響,vitest 本機可完整跑紅綠。

⚠️ **重要操作紀律(踩過一次)**:CI 有 concurrency group,**推新 commit 會取消
正在跑的那輪**——`4027c2f` 那輪就是被緊接著的 progress.md commit 取消掉的
(`conclusion: cancelled`)。所以後端階段的紅燈實作**寫好後不要立刻 push**,
必須等紅燈那輪 `api-tests` 跑完、讀到紅,才推綠燈。

**Phase 1 紅燈證據**:CI run
[30151398394](https://github.com/simonzhao219/Uknow/actions/runs/30151398394/job/89662298360)
(head `3c40d05`,內容等同紅燈 commit `4027c2f`)——
`FAILED | 134 passed | 5 failed`,失敗的正是 5 條排序斷言
(overview updated_asc/updated_desc、children 二代層內、同名 tie-break、
children self),其餘 134 條全綠 → 種子改寫未誤傷既有行為。

### B-2 分支未依 skill 切 `feature/*`(2026-07-25)

`/tdd-implement` 的 rehydrate 第 4 步要求切 `feature/referral-network-sort-logic`,
但本 session 被指定只能在 `claude/recommendation-network-sorter-logic-ap6yza`
開發與推送(PR #106 已開在此分支)。依 CLAUDE.md 的已知例外(web session 的
`claude/*` 分支不符 `feature/*` 命名但可正常運作,守衛只認 `feature/*`),
不切分支,PreToolUse 守衛因此不生效——**規劃書仍在,流程證據不受影響**。

## 框架摩擦

尚無。
