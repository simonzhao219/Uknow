---
name: review-implementation
description: 對已完成的實作 diff 做四視角第三方審查（系統/架構/UIUX/需求），重點是「實作有沒有偏離規劃」。/tdd-implement 收尾時跑，也可對任何分支的 diff 單獨跑
argument-hint: [feature-slug]
---

# /review-implementation — 實作後審查

對 `feature/$ARGUMENTS`(或當前分支)相對 develop 的 diff 做四視角審查,
產出 `docs/plans/$ARGUMENTS/implementation-review.md`。

存在理由:**規劃審過、實作走偏是最常見的失敗模式**。CI 只能證明「測試綠、
型別對」,證明不了「做的是當初審核通過的那個東西」。這一關專門攔它。

## 步驟

1. 準備審查材料(自己先讀,不要讓 reviewer 從零摸索):
   - `git diff origin/develop...HEAD --stat` 與完整 diff
   - `docs/plans/$ARGUMENTS/plan.md`(當初審核通過的設計)
   - `docs/plans/$ARGUMENTS/review.md`(規劃期的發現與處置)
   - `docs/plans/$ARGUMENTS/progress.md`(實作期的 blockers 與偏離紀錄)
2. **同一則訊息平行派出**四個 subagent(同步等待結果):
   `plan-reviewer-system`、`plan-reviewer-architecture`、
   `plan-reviewer-uiux`、`plan-reviewer-requirements`。給每個:
   - 審查對象**是實作 diff**(明講,契約裡有對應規則)
   - diff 內容或取得方式、plan.md 路徑、progress.md 已記錄的偏離
   - 明確要求:除自身視角外必答「實作有沒有偏離 plan?未記錄的偏離至少 P1」
3. 彙整成 `implementation-review.md`(沿用 `docs/_templates/review.md` 的
   輸出契約與聚合規則):**只彙整不改判**,降級任何發現須列「需人工裁決」。
4. 處置:
   - **P0**:修掉再 push(或人工明文豁免並記錄)。P0 未清就開 PR 等於把
     問題丟給未來的自己
   - **P1/P2**:能小修就修,不修的寫進 PR「偏離規劃說明」或 friction-log
   - 審查報告路徑附進 PR 描述,讓證據跟著程式碼走
5. UI 有改動時,額外附 Playwright 截圖(視覺迴路的證據,見 CLAUDE.md)

單獨使用:任何時候想審一份既有 diff,直接打 `/review-implementation <slug>`
——它不改任何程式碼,只讀與寫報告,跑了不會有副作用。
