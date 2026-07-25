---
name: plan-feature
description: 產出新功能的四面向規劃書（系統/架構/UIUX/需求），是所有新功能的第一步
argument-hint: [feature-slug 或功能描述]
disable-model-invocation: true
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
3. **填寫四面向與階段切分**。階段切分是給 TDD 用的:每階段一個紅綠循環、
   有明確測試落點與驗證標準——切不出測試落點的階段代表設計還沒想清楚。
4. **開放問題是逃生口**:規格書模糊、兩案難決、需要商業判斷的,列入
   「開放問題」等人裁決。**禁止腦補需求**——規劃書裡的每個斷言都要能
   指出依據(規格書章節或 codebase 現況)。
5. **收尾**:同時從 `docs/_templates/progress.md` 實例化
   `docs/plans/<feature>/progress.md` 並預填階段清單(狀態全部「未開始」)
   ——下一階段的 rehydrate 鏈從這裡開始,現在不建,鏈就是斷的。
6. **停**。輸出規劃書路徑與一段摘要,提示使用者:下一步是
   `/review-plan <feature>`。本 skill 到此為止,不進入審查、不寫任何實作。
