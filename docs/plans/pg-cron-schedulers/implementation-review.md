# 對帳與照片清理改由 pg_cron 觸發 實作審查報告

<!-- /review-implementation：四個 fresh-context reviewer 審 `git diff origin/develop...HEAD`（不含 docs/plans），
     對照 plan.md v3.1、review.md、progress.md。只彙整、去重、排序，不改判。 -->

審查時的分支 tip：6d26c0a2。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 1 | 5 | 租約與晚到覆寫、完成列定義、Vault 缺值路徑、invoke 白名單、purge 分流與預設安全、空窗期、全滅／過半判準、502 契約、curl 不重打 5xx、J5、LINE 推送 at-least-once、看門狗判準與節流、冪等底線 |
| 架構 | 0 | 1 | 3 | 模組邊界（無 import index.ts、無循環）、T4 分層、fixture 雙端契約與 framework-check 接線、workflow 單一 job／8b／規則 3、5、6、文件同步、migration 其餘項 |
| UI/UX | 0 | 2 | 6 | 後台手機全文顯示、看門狗 LINE 前 200 字含下一步、單一根因一則 LINE 與 6 小時節流 |
| 需求 | 0 | 1 | 4 | 驗收情境 1～6 皆有實作與測試、裁決 W5-15～19／31／32 落實、無範圍蔓延、規格書同步 |

**必答「有沒有偏離 plan」**：主要設計沒有偏離。已記錄的偏離見 progress.md。未記錄的偏離已在審查後補記（下表「處置」欄）。

## 發現清單（依嚴重度排序，同一缺口合併並標來源）

| # | 嚴重度 | 發現 | 來源 | 處置 |
|---|---|---|---|---|
| 1 | P1 | `invoke_internal_endpoint`／`pause`／`resume` 沒有 grant service_role，與 plan §2.7 字面不同且未記錄 | 系統、需求、架構（P2） | 刻意只給 postgres，已補記 progress.md |
| 2 | P1 | `handleReconcile` 的 deps 形狀與 plan §3 不同，未記錄 | 架構、系統（P2） | 已補記 progress.md |
| 3 | P1 | 告警與 LINE 文案偏離 §2.5 範本：開關不一致少了後果、停擺寫「已補跑」但結果未知、清理失敗措辭；診斷被 200 字截斷且印出 None；R3 指向 README 中不存在的 SQL；開關不一致的「或」方向不明 | UI/UX（F1、F3～F5）、需求 | 文案已改（aacc4602 之後的 commit）：方向分句、「本輪補跑（失敗會另行通知）」、診斷移到 step summary、R3 指向 migration 檔尾、None → 無。差異已補記 progress.md |
| 4 | P1 | checklist 乙段的驗證查詢只看最新一列，會被甲段的舊 vault_missing 列誤導；缺 running、failed、skipped/concurrent 三種狀態；plan 的「確認 health 不再 404」被刪 | UI/UX（F2） | 已修：查詢加 5 分鐘時間條件、判讀表補三種狀態、補回 health 步驟 |
| 5 | P1 | 照片清理看門狗查不到 health 時每日推 P2，plan 沒有這種告警 | 需求 | 保留，已補記 progress.md |
| 6 | P2 | `reconcile_unknown_at` 在查詢層一時失敗（queryFailure）時被清回 null | 系統 | 已修：TDD 紅 ebb14adc → 綠 aacc4602 |
| 7 | P2 | 看門狗 step 自身失敗時補跑被跳過，也沒有 issue 或 LINE | 系統 | 已修：腳本失敗時保底 `backfill=true`，step 不紅 |
| 8 | P2 | `supabase/README.md` 引用〈pg_cron 排程〉，但 checklist 的實際標題是「步驟 8」 | 架構、需求 | 已修 |
| 9 | P2 | 輪替 RECONCILE_SECRET 時會有假警報（R2 P1、「對帳失敗」issue），SOP 只寫「超過 90 分鐘」 | UI/UX（F8） | 已修：SOP 寫明預期的假警報與處置 |
| 10 | P2 | unknown 告警的訊息直接印 `unknown_code` 等工程代碼 | UI/UX（F7） | 已改成白話原因；代碼留在 context |
| 11 | P2 | system_alerts 推 LINE 只帶 message 前 60 字，新告警的動作在 60 字之後 | UI/UX（F6） | 接受既有行為，已補記 progress.md |
| 12 | P2 | DataSource＝B 沒有上限：持續回 B 的單永遠不收斂、不告警，也不會排到後段 | 系統、需求 | **需人工裁決**（延伸 W5-42） |
| 13 | P2 | 棄付單若回 SUCCESS 但缺 TradeStatus，會落到 `missing_field`：每張都告警、永不 expire，需要實測確認 | 系統 | **需人工裁決**；上線後第一輪看 `unknownStatus` 計數 |
| 14 | P2 | unknown 單人工確認之後，系統沒有手動補開通的入口 | UI/UX（F7） | **需人工裁決** |
| 15 | P2 | 規劃檔仍在 diff 內 | 架構 | 收尾 commit 清理 |
| 16 | P2 | trigger 分流沒有 e2e／journey 層測試 | 需求 | 依 plan §5，不加 |

## 需人工裁決

- #12：DataSource＝B 要不要設上限。建議：持續 B 超過 expire 天數（4 天）就轉成 unknown 路徑告警交人工。不做的話記進第 6 波候選。
- #13：上線後第一輪由主 session 看帳本 summary 的 `unknownStatus` 與 system_alerts。若棄付單大量落到 `missing_field`，再補終態路徑。
- #14：unknown 單人工確認為已付款之後怎麼開通（目前只能請工程以 SQL 處理）。列第 6 波候選。

## 處置（人審後填寫）

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回
