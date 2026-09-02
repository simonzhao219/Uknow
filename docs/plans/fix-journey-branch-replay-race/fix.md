# journey-full 建分支後 db push 撞 schema_migrations_pkey 修復紀錄

分支:`fix/journey-branch-replay-race` | 重現測試(紅燈 commit):不適用——bug 只存在於
`.github/workflows/journey.yml` 的 bash 邏輯,與一個真實、非同步的外部 Supabase API
競態,無法用 vitest/pytest 合成測試重現(mock 掉時序等於 mock 掉 bug 本身)。
`.claude/hooks/tdd-test-guard.py` 的鎖只掃 `*.test.ts(x)`,對 `.github/workflows/**`
從未生效,機制上也不要求。改採本專案對這一類 bug 的既有先例
(見 §1 friction-log 2026-08-02 條目):以真實 CI run 當紅燈證據,下一次真實 run 綠燈
當驗證。紅燈證據見 §1;綠燈驗證見 §5(邏輯以本機模擬三情境替代,見 §5)。

## 1. 症狀與重現

晉升 PR #302(develop→main)上,`journey-full / journey-suite` 連續失敗兩次:

- 第一次:run 33677688439, job 100406471790。建立拋棄式分支後,`supabase db push
  --db-url ...` 撞 `ERROR: duplicate key value violates unique constraint
  "schema_migrations_pkey" ... Key (version)=(20260620000006) already exists`。
- 重跑(用掉 CI-red SOP 允許的唯一一次盲目重跑):run 33677688439, job
  100410979051,約 13 分鐘後。撞號版本變成 `20260620000008`——往後推進了兩支。

兩次都死在 `db push` 開始的前幾秒,journey 測試本體從未執行(`找不到 junit.xml`)。

## 2. 根因

`journey.yml` 的「建立拋棄式 Supabase 分支」step 呼叫 `supabase branches create` 後,
輪詢 Supabase Management API(`GET /v1/projects/$PARENT_PROJECT_REF/branches`)等
STATUS 變成 `MIGRATIONS_PASSED` 等終態才視為分支就緒——這段邏輯是 2026-08-02 那次
「journey 排程 7 晚全紅」修復加的(friction-log 同日條目),原意正是「連得上不等於
schema 是全的」。

但這次的證據顯示:STATUS API 回報終態的時間點,早於分支背景 replay(把母專案既有
70 支 migration 套進新分支)真正寫完全部歷史列的時間點。兩次撞號版本不同
(6 → 8),證明背景 replay 在兩次嘗試之間持續推進,只是永遠追不上 `db push`
開跑的時間點——這是 STATUS 語意與資料庫實際完成度之間的競態,不是隨機抖動。

換句話說:2026-08-02 的修復解決了「完全不驗證」的問題,但驗證訊號本身
(STATUS API)相對於它要證明的目標(schema_migrations 的實際內容)存在滯後,
是同一個「connectable ≠ complete」原則在更深一層的重演——第一次沒被發現,是因為
當時 production 的 migration 數量少、背景 replay 跑得夠快,STATUS 終態與資料庫
實際完成幾乎同時發生,競態窗口小到没被撞到過;隨 production 累積到 70 支
migration,replay 耗時變長,窗口隨之放大,直到這次才第一次被撞見。

## 3. 同類掃描

- pattern:「輪詢一個外部非同步流程的 STATUS 端點,STATUS 端點回報終態的時間點
  假設等於它描述的底層狀態(資料庫內容)真正就緒的時間點」。
- 掃描方式:`grep -rn "branches create|MIGRATIONS_PASSED|api.supabase.com/v1/projects"
  .github/workflows/`。
- 結果:□ 無同病灶——`supabase branches create` + STATUS 輪詢只出現在 journey.yml
  這一處,repo 內沒有第二個 workflow 做同類的分支建立與非同步等待。
  `deploy-supabase.yml` 的部署後驗證(比對 `/health` 的 `sha`)雖然也是輪詢,
  但它直接探測「目標事實」本身(線上跑的 commit)而非一個轉譯過的 STATUS 欄位,
  不屬於同一個 pattern。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 只影響 journey.yml 這條 CI 測試腳手架路徑。`deploy-supabase.yml` 檔頭明寫正式 migration 套用走 Supabase 原生 GitHub 整合,是完全不同的機制,不共用這段輪詢邏輯,不受影響。 |
| 架構 | 點狀 bug(單一等待邏輯的驗證訊號選得不夠直接),不是架構缺陷——不需要 `/plan-feature` 等級的結構修正。 |
| UIUX | 不適用,純 CI 基礎設施。 |
| 需求 | 「journey-full 必須驗證真實 migration 套用」的需求本身有清楚規格(`.claude/rules/github-actions.md` 規則 10、journey.yml 自身註解),沒有開放問題;這次是實作細節(等待訊號)沒跟上規格意圖。 |

## 5. 修法與驗證

- 修了什麼:把 `supabase db push --db-url ...` 包進重試迴圈——失敗時檢查輸出是否
  命中 `schema_migrations_pkey`,命中就視為「背景 replay 尚未追上」,等待 15 秒後
  重新呼叫 `db push`(它會用資料庫當下的真實狀態重新判斷「本地有、分支沒有」,
  自然收斂到只剩真正新增的版本);非此錯誤模式的失敗維持原樣立即紅燈,不吞掉
  真正的 migration 內容問題。上限 10 次(額外最多 150 秒),搭配既有 job
  `timeout-minutes: 90` 綽綽有餘。
- 為什麼這樣修是對的:不是去猜「該多等幾秒」或另外接一個 API 去查 production
  的實際 migration 數(那只是把同一種「訊號可能滯後」的風險換一個地方),而是直接
  拿 `db push` 自己撞到的主鍵重複——這是資料庫當下真實狀態最新鮮的第一手證據——
  當重試訊號。`db push` 本身對「已套用 vs 未套用」的判斷每次呼叫都重新查詢真實
  資料庫,天然冪等、可安全重試。
- 驗證:三情境本機模擬(見下),邏輯正確;無法本機驗證against 真實 Supabase
  API,待這個修復合進 develop、晉升 PR #302 的 head 自動帶到後,重新觸發
  journey-full 的真實 run 作為最終綠燈證據。
  1. 撞兩次 pkey 錯誤後第三次成功 → 迴圈重試兩次後正常結束,exit 0(模擬本次
     實際遇到的情境)。
  2. 第一次就是非 pkey 錯誤(例如連線失敗)→ 不重試,立即 exit 1。
  3. 持續撞 pkey 錯誤到底 → 重試滿 10 次後 exit 1,附清楚錯誤訊息,不會無限掛著。

## 6. 防線回填

- 為什麼既有閘門沒攔到:這段邏輯是 bash-in-YAML,對外部真實非同步 API 的行為,
  `check-workflows.py`(結構/命名檢查)與 `actionlint`(本機未安裝,CI 上跑)都
  只驗證 YAML 結構與 shell 語法,不驗證跨 process 的時序語意——這類 bug
  只有在真的打中競態窗口時才會出現,而窗口大小隨 production migration 數量
  增長才逐漸放大,2026-08-02 那次修復當下窗口太小沒撞到過。
- 處置:☑ 攔不到,記 friction-log(見同次 commit 補上的條目,銜接
  2026-08-02 的原始條目,標記為同一個原則的第二層重演,方便下次搜尋時串起來)。
  沒有新增機械閘門——這類「驗證訊號相對目標本身有多滯後」的競態沒有通用的
  靜態檢查法,追加閘門的成本(專門為這一處寫一個時序模擬測試)不成比例;
  重試迴圈本身就是防線:即使未來 production migration 數再增長、競態窗口再
  放大,重試機制會自然吸收,而不是重演「等固定秒數」這種一樣會過期的假設。
