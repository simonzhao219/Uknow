---
name: review-plan
description: 對規劃書做四視角第三方審查（系統/架構/UIUX/需求），彙整報告後停待人審。規劃書一寫完就該跑
argument-hint: [feature-slug]
---

# /review-plan — 審查階段

對 `docs/plans/$ARGUMENTS/plan.md` 做獨立審查,產出同目錄 `review.md`。

審查者是四個 **fresh-context subagent**(系統/架構/UIUX/需求),不是主
session 自己——做事者不自評:主 session 若參與過規劃,對自己的產物有
確認偏誤;subagent 沒有對話包袱,只看檔案說話。

**本階段可在全新 session 執行**:所需狀態只有 plan.md 與 codebase。

## 步驟

1. 確認 `docs/plans/$ARGUMENTS/plan.md` 存在;不存在就停,提示先跑
   `/plan-feature`。
2. **同一則訊息平行派出**四個 subagent(用 Agent tool,同步等待結果):
   `plan-reviewer-system`、`plan-reviewer-architecture`、
   `plan-reviewer-uiux`、`plan-reviewer-requirements`,各給規劃書路徑
   與其視角任務(系統管資料/API 正確性,架構管結構與慣例——分工在各
   agent 定義檔內)。
3. **彙整為 review.md**(從 `docs/_templates/review.md` 實例化——輸出
   契約與聚合規則都定義在模板裡,照做):只彙整、去重、排序,**不改判**;
   要降級/剔除任何發現必須列入「需人工裁決」附理由。這條規則存在是因為
   聚合者往往就是規劃者,改判權留給人,才守住「做事者不自評」的最後一哩。
4. **停,等人審**。輸出 review.md 路徑+結論摘要(P0/P1/P2 計數與最重要
   的 2-3 項),明示:
   - 有 P0 → 修訂 plan 後**重跑本 skill**,或由人在 review.md「處置」節
     明文豁免——二選一,不能默默帶著 P0 進實作
   - 無 P0 或已處置 → 人在「處置」節勾選裁決,然後 `/tdd-implement $ARGUMENTS`

本 skill 絕不自行進入實作,也不代替人勾「處置」。
