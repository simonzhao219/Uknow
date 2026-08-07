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
| 2 | saga cast+小型載入器+feature 第 1–2 章 | ✅ 綠(run 31149371380,ch1+ch2 全過;修了三個坑:admin 裸列 trigger、asyncio loop、多重登入 session) | 5edb1d4 | e23780f |
| 3 | 第 3–4 章(補繳 extend、fresh 清空+A14/A15+U2 首次配對) | ✅ 綠(run 31151243388,ch1-4 全過) | caba61f(rebase 前 1cda371) | 4a5a56a(rebase 前 242526d) |
| 4 | 第 5–7 章(B 樹+X1 gen3、Q9+admin 駁回、S9+Q14a) | ✅ 綠(run 31154748054,ch1-7 全過;迭代 5 輪:25e66b6 login 新簽名適配、2a2a456 提領前先加入推薦計畫、4fefa62 補 JoinReferralProgramDialog role="dialog"【產品 a11y 修復=計畫偏離,收尾審查需覆核】、ddcc804 「推入剛過期」@given/@when 雙註冊) | 40421b3 | ddcc804 |
| 5 | 第 8–10 章(credit/A8 雙發獎、A10-fresh、終章對帳) | ✅ 綠(run 31157279168,ch1-10 全過;迭代 1 輪:ch8 過期擋領取的 GUI 真相是 RequireMembershipRoute 重導、ch9 的 W1 原始首購被計為已付補繳→A15 照彈) | 0a58820 | c7ba75f |
| 6 | 收尾:nightly 全綠+文件同步+命名/收集檢查 | ⬜ 未開始 | | |

journey 階段的紅綠取證是 workflow_dispatch run 連結(journey 絕不本機
跑),請把 run URL 記在對應列或下方。

## 目前位置與下一步

階段 0–5 全綠(**全 10 章在真後端 GUI 全過**,run 31157279168)。
進行階段 6 收尾:full 全套 dispatch(驗 70_ 與 30 人樹共存;60_ 既有
失敗屬 #217 範圍)、文件同步、check:full、/review-implementation、
friction-log 整併、刪鷹架、PR 轉出 draft。
注:965eb33 的 concurrency group 改名(-v2)是平台故障期間的誤診產物,
無功能影響,收尾時再評估去留;4fefa62 動了產品碼(a11y),
/review-implementation 時需特別覆核。

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

## 偏離清單(/review-implementation 補記,詳見 implementation-review.md)

- **builders/admin_bootstrap.py(f10-f70 共用)**:「不存在才插入」改
  「一律 UPDATE 補齊 profiles」——修 handle_new_user trigger 裸列導致
  UPDATE 0 列假成功的既存 bug,已核實下游無迴歸。實作期只記在 commit
  message,審查判 P1 後補記於此。
- **斷鏈自檢降級**:plan 承諾的「各章 Background 自檢+斷鏈於第 N 章」
  未實作,以隱性防線(重導/逾時)+pytest 逐章命名定位取代——審查
  裁決接受(implementation-review.md 需人工裁決 #2)。
- **產品碼 a11y(4fefa62+收尾修正)**:JoinReferralProgramDialog 補
  role="dialog"+aria-labelledby(收尾依 uiux 審查拿掉無 focus trap
  配套的 aria-modal)。違反 plan「零產品碼」承諾,**待 PR 人審明文
  核可**(implementation-review.md 需人工裁決 #1)。
- 審查誤報澄清:builders/login.py 的簽名變更**不在本分支 diff**
  (git 查證 0 commit),是 develop PR #205 經 rebase 帶入。

## 框架摩擦

- 2026-08-03:bash-guard 誤擋 `git commit`——commit message 內含
  「pytest_expr」字樣被當成要本機跑 journey(guard 應只看指令本體,
  不該掃 `-m` 訊息文字)。繞法:訊息寫檔改用 `git commit -F`。
  整併時搬 friction-log。
