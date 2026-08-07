# renewal-rewards-automation-test 實作進度

分支:`claude/renewal-rewards-automation-test-jwjgwu`(web session 平台
分支;人工另開時用 `feature/renewal-rewards-automation-test`,見 plan
開放問題 #6)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | CI 前置:renewal_saga marker + pytest_expr dispatch 輸入 | 🟡 已實作,等窄選 dispatch 取證 | (無——CI 設定無測試落點) | af75999 |
| 1 | 時光機四原語(純函式離線紅綠) | ✅ 綠 | e430c43 | 53978af |
| 2 | saga cast+小型載入器+feature 第 1–2 章 | ⬜ 未開始 | | |
| 3 | 第 3–4 章(補繳 extend、fresh 清空+A14/A15+U2 首次配對) | ⬜ 未開始 | | |
| 4 | 第 5–7 章(B 樹+X1 gen3、Q9+admin 駁回、S9+Q14a) | ⬜ 未開始 | | |
| 5 | 第 8–10 章(credit/A8 雙發獎、A10-fresh、終章對帳) | ⬜ 未開始 | | |
| 6 | 收尾:nightly 全綠+文件同步+命名/收集檢查 | ⬜ 未開始 | | |

journey 階段的紅綠取證是 workflow_dispatch run 連結(journey 絕不本機
跑),請把 run URL 記在對應列或下方。

## 目前位置與下一步

規劃書第 3 版已處置兩輪審查(第 2 輪 P0:階段 0 擴充為連動修改
journey.yml 的 MARKER/floor 邏輯)。第 3 輪針對性覆核(架構視角驗證
P0 處置)後停等人審裁決(開放問題 #1、#2a/#2b/#2c、#3–#6)。未開工。

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
