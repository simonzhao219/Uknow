---
name: plan-feature
description: 任何新功能/新需求開發的第一步——產出四面向規劃書（系統/架構/UIUX/需求）。使用者提出要加功能、做新頁面、改流程時一律先走這裡，不要直接寫程式
argument-hint: [feature-slug 或功能描述]
---

# /plan-feature — 規劃階段

產出 `docs/plans/<feature>/plan.md`。本階段**只規劃不實作**——規劃與實作
硬性分離,是因為混在一起時模型會傾向邊想邊寫、規劃淪為事後追認。

**本階段可在全新 session 執行**:所需狀態只有規格書與 codebase 本身。

## 步驟

1. **先讀再想**(順序刻意:需求 → 現況 → 才有資格設計):
   - `docs/Uknow_Software_Specification.md` 中與 $ARGUMENTS 相關的章節
   - 動 UI 就再讀 `docs/UI_UX_Analysis.md` 對應段落
   - 探索會被動到的 src/supabase 模組(用 Grep/Read,不要憑印象)
2. **實例化**:`mkdir -p docs/plans/<feature>`,從 `docs/_templates/plan.md`
   複製骨架;參考 `examples/plan-example.md` 的填寫密度(它示範的是
   「一句話講清楚」的高度,不是愈長愈好)。
   **`<feature>` 就是之後的分支 slug**(`feature/<feature>`)——目錄名與
   分支名必須一致,PreToolUse 守衛靠這個對應找規劃書。
3. **填寫四面向與階段切分**。階段切分是給 TDD 用的:每階段一個紅綠循環、
   有明確測試落點與驗證標準——切不出測試落點的階段代表設計還沒想清楚。
4. **開放問題是逃生口**:規格書模糊、兩案難決、需要商業判斷的,列入
   「開放問題」等人裁決。**禁止腦補需求**——規劃書裡的每個斷言都要能
   指出依據(規格書章節或 codebase 現況)。
5. **收尾**:同時從 `docs/_templates/progress.md` 實例化
   `docs/plans/<feature>/progress.md` 並預填階段清單(狀態全部「未開始」)
   ——下一階段的 rehydrate 鏈從這裡開始,現在不建,鏈就是斷的。
6. **接著跑 `/review-plan <feature>`**——規劃完就審查,不要等人開口。
   規劃書自己寫完自己看不出問題,這是確認偏誤,四個獨立視角才看得見。
7. **絕不寫任何實作**。審查報告出來後停,等人裁決;實作只能由人親自打
   `/tdd-implement` 啟動(那道鎖是「人審通過才實作」的唯一保證)。
