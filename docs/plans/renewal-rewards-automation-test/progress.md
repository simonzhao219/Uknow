# renewal-rewards-automation-test 實作進度

分支:`claude/renewal-rewards-automation-test-jwjgwu`(web session 平台
分支;人工另開時用 `feature/renewal-rewards-automation-test`,見 plan
開放問題 #6)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | CI 前置:renewal_saga marker + pytest_expr dispatch 輸入 | ✅ 綠(run 31147330315:`expr='orgbuild or timemachine' collected=10 ran=10 floor=1`,54 deselected,floor 未誤殺;run 本身紅是 60_ 既有情境失敗——fix/journey-scenario-failures 在修的那批,與窄選機制無關) | (無——CI 設定無測試落點) | af75999 |
| 1 | 時光機四原語(純函式離線紅綠) | ✅ 綠 | e430c43 | 53978af |
| 2 | saga cast+小型載入器+feature 第 1–2 章 | 🟡 程式碼完成,等 dispatch 取證 | 5edb1d4 | 9fa5877(code) |
| 3 | 第 3–4 章(補繳 extend、fresh 清空+A14/A15+U2 首次配對) | ⬜ 未開始 | | |
| 4 | 第 5–7 章(B 樹+X1 gen3、Q9+admin 駁回、S9+Q14a) | ⬜ 未開始 | | |
| 5 | 第 8–10 章(credit/A8 雙發獎、A10-fresh、終章對帳) | ⬜ 未開始 | | |
| 6 | 收尾:nightly 全綠+文件同步+命名/收集檢查 | ⬜ 未開始 | | |

journey 階段的紅綠取證是 workflow_dispatch run 連結(journey 絕不本機
跑),請把 run URL 記在對應列或下方。

## 目前位置與下一步

人審通過已開工。階段 0/2 程式碼完成、等窄選 dispatch 取證;階段 1 全綠。
**GitHub Actions 平台故障中**(2026-08-07 01:48 起所有 run 3 秒零步驟
failure、無 log,含從未紅過的 changes/linear-check——與我方改動無關,
actionlint/check-workflows 本機全綠);已排自動恢復檢查,恢復後:
(a) rerun 最新 head 的 ci 失敗 jobs;(b) dispatch `orgbuild or
timemachine` 驗收階段 0;(c) dispatch `renewal_saga` 驗收階段 2;
(d) 續作階段 3(第 3–4 章)。另:65eb33 的 concurrency group 改名
(-v2)是故障期間的誤診產物,無功能影響,收尾時再評估去留。

## Blockers(逃生口紀錄)

- **2026-08-07 階段 2(逃生口 2:plan 有誤,停手求裁決)**:plan §2.1
  假設「P 由 harness 健檢確認存在、不另建」。實況:journey 拋棄式分支
  只 replay migrations(schema),`reward_config.default_referrer_code`
  是正式站資料層設定 → 分支上為 NULL,平台帳號/碼皆不存在(grep 全部
  migrations 無 seed;既有 30 人樹的 A0 不填碼正是走「無上代」路徑)。
  ch1/ch9 的 A10 斷言與 P 的 delta 斷言無從成立。
  建議修法:saga 自備 P——名冊加 P0 演員(GUI 首購,~+2 分),再以
  service-role 將其推薦碼寫入 `reward_config.default_referrer_code`
  (冪等、僅拋棄式分支,與限流調參同一「seed 調整不動產品碼」原則);
  其餘章節表全數不變。
  **人審裁決(2026-08-07):「同意,照建議自備 P0 繼續」——已解除,
  依此實作。**

## 框架摩擦

- 2026-08-03:bash-guard 誤擋 `git commit`——commit message 內含
  「pytest_expr」字樣被當成要本機跑 journey(guard 應只看指令本體,
  不該掃 `-m` 訊息文字)。繞法:訊息寫檔改用 `git commit -F`。
  整併時搬 friction-log。
