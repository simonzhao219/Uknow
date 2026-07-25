---
name: review-plan
description: 對規劃做四視角第三方審查（系統/架構/UIUX/需求），彙整報告後停待人審。規劃一產出就該跑
argument-hint: [feature-slug，或直接給規劃內容]
---

# /review-plan — 審查階段

審查者是四個 **fresh-context subagent**(系統/架構/UIUX/需求),不是主
session 自己——做事者不自評:主 session 若參與過規劃,對自己的產物有
確認偏誤;subagent 沒有對話包袱,只看給它的東西說話。

## 兩種輸入模式(對應 /plan-feature 的分級)

- **落檔模式**:`docs/plans/<slug>/plan.md`,產出同目錄 `review.md`
- **Plan Mode(不落檔)**:規劃全文由呼叫方直接給。此時把**規劃全文放進
  每個 subagent 的 prompt**(它們是 fresh context,看不到你的對話),
  審查結果直接呈現給人看,不寫檔

## 步驟

1. 確認拿到審查對象:落檔模式檢查 `plan.md` 存在(不存在就停,提示先跑
   `/plan-feature`);Plan Mode 則確認手上有完整規劃內容。
2. **同一則訊息平行派出**四個 subagent(用 Agent tool,同步等待結果):
   `plan-reviewer-system`、`plan-reviewer-architecture`、
   `plan-reviewer-uiux`、`plan-reviewer-requirements`。每個都要給:
   - 審查對象**是規劃**(明講),以及規劃書路徑**或**規劃全文
   - 其視角任務(系統管資料/API 正確性,架構管結構與慣例——分工在各
     agent 定義檔內)
3. **彙整**(輸出契約與聚合規則定義在 `docs/_templates/review.md`,照做):
   只彙整、去重、排序,**不改判**;要降級/剔除任何發現必須列入「需人工
   裁決」附理由。這條規則存在是因為聚合者往往就是規劃者,改判權留給人,
   才守住「做事者不自評」的最後一哩。
   落檔模式寫成 `review.md`;Plan Mode 直接輸出給人看。
4. **停,等人審**。給出結論摘要(P0/P1/P2 計數與最重要的 2-3 項),明示:
   - 有 P0 → 修訂規劃後**重跑本 skill**,或由人明文豁免(落檔模式記在
     review.md「處置」節)——二選一,不能默默帶著 P0 進實作
   - 無 P0 或已處置 → 人裁決後才進實作(落檔模式:勾「處置」節,然後
     `/tdd-implement <slug>`)

本 skill 絕不自行進入實作,也不代替人做裁決。
