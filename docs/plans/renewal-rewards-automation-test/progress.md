# renewal-rewards-automation-test 實作進度

分支:`claude/renewal-rewards-automation-test-jwjgwu`(web session 平台
分支;人工另開時用 `feature/renewal-rewards-automation-test`,見 plan
開放問題 #6)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | CI 前置:renewal_saga marker + pytest_expr dispatch 輸入 | ⬜ 未開始 | | |
| 1 | 時光機三原語(純函式離線紅綠) | ⬜ 未開始 | | |
| 2 | saga cast+小型載入器+feature 第 1–2 章 | ⬜ 未開始 | | |
| 3 | 第 3–4 章(補繳 extend、fresh 清空+A14/A15+U2 首次配對) | ⬜ 未開始 | | |
| 4 | 第 5–7 章(B 樹+X1 gen3、Q9+admin 駁回、S9+Q14a) | ⬜ 未開始 | | |
| 5 | 第 8–10 章(credit/A8 雙發獎、A10-fresh、終章對帳) | ⬜ 未開始 | | |
| 6 | 收尾:nightly 全綠+文件同步+命名/收集檢查 | ⬜ 未開始 | | |

journey 階段的紅綠取證是 workflow_dispatch run 連結(journey 絕不本機
跑),請把 run URL 記在對應列或下方。

## 目前位置與下一步

規劃書第 2 版已處置第 1 輪審查(P0×1 已修:新增階段 0 落地
`pytest_expr` dispatch 輸入)。第 2 輪審查進行中;之後停等人審裁決
(開放問題 #1、#2a/#2b、#3–#6)。未開工。

## Blockers(逃生口紀錄)

(無)

## 框架摩擦

(無)
