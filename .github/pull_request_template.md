## 摘要

<!-- 一段話:這個 PR 做了什麼、為什麼 -->

## 流程證據

<!-- 三段式流程的 PR 填前三項;docs/框架修訂/純重構等流程外 PR
     勾「不適用」並一句話說明——誠實的不適用勝過捏造的引用 -->

- 規劃書:`docs/plans/<feature>/plan.md` / □ 不適用:
- 規劃審查:`docs/plans/<feature>/review.md`(人審裁決已勾)/ □ 不適用:
- 實作審查:`docs/plans/<feature>/implementation-review.md`(四視角審 diff,
  P0 已清)/ □ 不適用:
- 紅燈 commit(s):<hash> / □ 不適用:
- CI:等本 PR 的 checks 全綠(車尾燈就是證據,不必貼輸出)

## 偏離規劃說明

<!-- 實作與 plan.md 不一致之處＋原因;完全一致就寫「無」 -->

## 檢查清單

- [ ] `npm run check:full` 本機全綠
- [ ] 新增/變更行為有對應測試(紅→綠,不是事後補寫)
- [ ] 碰過的檔案順手償還了該檔 biome warning(童子軍原則,見 friction-log)
