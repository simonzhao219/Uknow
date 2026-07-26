# Uknow

專業服務媒合平台。React 18 + Vite + TS(前端)、Supabase Edge Functions
(Deno,後端 API)、Supabase Postgres、Cloudflare Pages 部署、PayUni 金流。

## 動手之前:走哪條流程

| 情況 | 走這條 |
|---|---|
| 新功能、新頁面、改流程 | `/plan-feature <slug>` → 自動接 `/review-plan` → **停等人審** → 人親自打 `/tdd-implement <slug>` |
| 修 bug、行為不對、報錯 | `/fix-bug <描述>`(根因+同類掃描+四面向+防線回填) |
| 只想審既有 diff | `/review-implementation <slug>` |

**規劃未經人審通過,不要寫任何產品程式碼。** `feature/*` 分支上不曾有過
`docs/plans/<slug>/plan.md` 時,PreToolUse 守衛會擋掉 `src/**` 與
`supabase/functions/**` 的寫入(規劃書目錄名 = 分支 slug)。

## 規劃檔生命週期:鷹架,不是文件

`docs/plans/` 平常只該有 `friction-log.md`。規劃檔是施工鷹架:

- **預設不落檔**——輕量改動用 Plan Mode 規劃(對話內),審完直接做,
  分支用 `fix/*` 或 `claude/*`(用 `feature/*` 會觸發需要規劃檔的守衛)
- **落檔**只在:跨 session/跨天、動金流·資料·會籍、階段數 ≥3
- **落檔的在 PR 前刪除**(`/tdd-implement` 收尾負責):值得長期保存的決策
  要**升級**進規格書/架構文件/friction-log,其餘隨 commit 清掉。內容不會
  消失——`git show <hash>:docs/plans/<slug>/plan.md` 永遠取得回,PR 也是紀錄
- 理由:功能上線後,程式碼與測試才是真相。留著的舊 plan 描述的是「當初
  想做什麼」,會被誤當成規格——那比沒有文件更糟

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器(port 3000) |
| `npm run check` | **統一閘門**:biome + typecheck + vitest + knip(改完必跑) |
| `npm run test:coverage` | vitest + 覆蓋率(門檻是棘輪,只准往上) |
| `npm run check:full` | check + build + Deno 型別檢查(送 PR 前跑) |
| `npm run test:watch` | vitest 監看模式 |
| `bash scripts/framework-check.sh` | 框架健康檢查(含 hook 行為測試、命名檢查、規格書漂移) |
| `python3 scripts/test-hooks.py` | 只跑 hook 行為測試(改 hook 後必跑) |
| `python3 scripts/check-workflows.py` | workflow 設定與命名(改 `.github/workflows/` 後必跑) |
| `python3 scripts/check-test-names.py` | 測試命名(新增測試後必跑) |
| `python3 scripts/check-spec-drift.py` | 規格書漂移(改業務常數/路由/狀態機後必跑) |
| `python3 scripts/check-context-budget.py` | context 預算與讀取成本(改 CLAUDE.md/rules 後必跑) |
| `scripts/tdd-unlock.sh` | TDD 紅燈期唯一合法解鎖(check 綠才刪鎖) |
| `python3 scripts/harness-metrics.py` | hook 決策彙總(誤擋率、skill 命中率) |

pre-commit hook 會跑 `npm run check`(由 `npm ci` 的 prepare 自動掛載)。
commit 被擋時修到綠,不要用 `--no-verify` 繞(hook 也會擋)。

**hook 的每次決策都會被記錄**(`.claude/hooks/decision_log.py`):計數存在
session 內的 buffer,由 **pre-commit** 落檔成 `.claude/metrics/sessions.jsonl`
的一行並自動暫存——Stop hook 跑在最後一次 commit 之後,落在那裡進不了 git,
而 web session 的容器是拋棄式的。要關掉設 `HARNESS_METRICS=0`。

**驗證指令的綠燈輸出會被折疊成一行**(`.claude/hooks/check-output-filter.py`):
看到 `[check-filter] 綠燈（N 行輸出已折疊）` 就是全綠,**不需要重跑確認**——
那些行是 biome 的 200+ 條 advisory warning,綠燈時資訊量為零。紅燈不折疊,
失敗段落照常顯示,exit code 一律原樣傳遞。需要完整輸出時在指令後接
`| tail -80`(自帶 pipe 的指令不會被改寫)。**只影響 Claude 執行的指令**;
`git commit` 觸發的 pre-commit 輸出不在範圍內。

## 架構事實

- 狀態管理:React Context(App.tsx 的 UserContext),無 Redux/Zustand
- 路由層 lazy loading:admin/會員區/內容頁都是 lazy(見 App.tsx lazyNamed)
- API 呼叫一律走 `src/utils/apiClient.ts`(自動附 token、session 過期處理)
- 後端單一 Edge Function:`supabase/functions/api/index.ts`(Deno,獨立
  runtime——vitest 設定絕不 include `supabase/**`)
- vitest 預設 node 環境(純函式);元件測試在檔頭加 `// @vitest-environment jsdom`
- e2e/ 是 Python pytest-bdd + Playwright,全 mock 網路;e2e/journey/ 打真
  Supabase 分支——**journey 絕不在本機跑**(hook 會擋;離線單元測試
  `cd e2e/journey && pytest tools/` 可跑)
- Deno 側格式/lint 由 `supabase/functions/deno.json` 定義,勿在他處另訂

## Docs 路徑地圖(需要時才讀,勿全部預載)

完整索引與權威性分級見 `docs/README.md`。最常用的:

| 何時 | 讀什麼 |
|---|---|
| 動任何功能前 | `docs/uknow-software-specification.md` 對應章節 |
| 動推薦/獎勵/任務/提領規則 | 同上 §7–§10(規則的單一事實來源) |
| 動 UI | `docs/ui-ux-guidelines.md` |
| 動多步驟表單/金流頁 | `docs/multi-step-flow-recovery.md`(四契約) |
| 動後端 schema/函數 | `supabase/README.md` |
| 動 e2e/journey | `docs/e2e-journey-test-design.md` |
| 動 CI workflow | `.claude/rules/github-actions.md`(命名與結構,有機械把關) |
| 新增任何測試 | `.claude/rules/test-naming.md`(命名分層,有機械把關) |
| Supabase 環境問題 | `docs/supabase-setup-checklist.md` |
| 關閉 §14 落差項目/改文件措辭 | `.claude/rules/document-writing.md`(path-scoped,自動載入) |

規格書與程式碼衝突時**以程式碼為準,並在同一個 PR 回頭修規格書**——
規格書是 `plan-reviewer-requirements` 的溯源對象,它失真等於審查閘門
在把關錯誤的規則。這條由 `scripts/check-spec-drift.py` 機械把關(接在
framework-check 軌):改了業務常數、路由、狀態機列舉而沒同步規格書,
CI 會紅。**改規格書措辭導致抽取式失配也會紅**——閘門不容許靜默失效。

## 開發流程細節(完整 SOP 在各 skill 內)

三段式的每一段都可在**全新 session** 執行——狀態全在
`docs/plans/<feature>/`(plan.md / review.md / progress.md),不依賴對話歷史。
`/tdd-implement` 是唯一不能自動觸發的 skill:那道鎖就是「人審通過才實作」。
實作完成後 `/review-implementation` 會用同四個視角審 diff,專門攔「規劃審過、
實作走偏」。

- Git-flow(簡化版):`feature/<slug>`、`fix/<slug>` 從 develop 切出,PR 回
  develop;絕不直接 push main/develop(hook 會擋)。`checkout -b`/`switch -c`
  沒指定 start-point 時,bash-guard 會查 HEAD 是否等於最新 origin/develop,
  且拒絕顯式以 main 為 base(第 5 類,見 `.claude/hooks/bash-guard.py`)。
  已知例外:claude.ai/code 的 web session 由平台在 session 啟動**前**就
  開好 `claude/<描述>-<hash>` 分支,早於任何 hook——不符 `feature/*` 命名
  (守衛只認 `feature/*`),繼承的 base 是 GitHub repo Settings → Branches
  的 default branch。**default branch 已於 2026-07-25 改成 develop**
  (改之前是 main,friction-log 記了一個 web session 因此生在缺整套
  `.claude/` 框架的 main 上)。開局仍建議確認 HEAD 是否為 develop,
  不是就 `git checkout -B <branch> origin/develop`。真的要走三段式流程時,
  自己切一個 `feature/<slug>` 分支。
  連帶效果:`workflow_run` 觸發的 workflow(deploy-supabase.yml)定義取自
  default branch,所以改它**合進 develop 就生效**,不必等晉升 main。
- 合併規矩:PR **只用 rebase 更新**(`git fetch origin develop && git rebase
  origin/develop && git push --force-with-lease`),**不要按 GitHub 的
  Update branch 預設**——那塞的是 merge commit,`linear-check` 軌會紅。
  合併一律 merge commit(`--no-ff`),不 squash 不 rebase merge。
  branch protection 的 required check 只有 `ci-ok` 一個(它 needs 全部
  軌),新增 CI job 只要進它的 needs,不必去動保護規則。
- 環境對應:develop 有自己的 persistent Supabase **branch**(不是獨立
  project——由 Supabase Branching 從正式專案長出來,有自己的 DB/金鑰/
  Secrets,但掛在正式專案底下),main 是正式站。兩者的 ref 都**commit 在
  git 裡**:develop 看 `config/supabaseTarget.ts`、正式站看
  `src/utils/supabase/info.tsx`,前端建置與 deploy workflow 讀同一份
  (`vars.*` 只是可選覆蓋,與 git 不一致會硬失敗)。Edge Function 由
  deploy-supabase.yml 在**該分支 CI 綠之後**部署到對應環境(`workflow_run`
  觸發,不是 push)——develop 是可安全驗證的真後端。部署後會打
  `/api/health` 比對 `sha`,確認線上跑的就是這個 commit。
  ⚠️ Secrets 逐分支獨立、**不從母專案繼承**,所以 develop 要自己設一套:
  `PAYUNI_SANDBOX=true` + `PAYUNI_TEST_*` 三把 + `FRONTEND_URL`。漏設的
  症狀是付款直接失敗(`PayUni 環境變數未設定`);真正會打進真金流的是
  「develop 上把 `PAYUNI_SANDBOX` 設成 false 又擺著正式憑證」這種人為設錯。
- **正式站部署需人工核准**:main 的部署綁 GitHub `production` 環境,
  在 Settings → Environments 設 required reviewer。核准前不會動到線上。
- 晉升 SOP(develop→main):(a) develop 上 CI 綠;(b) 開晉升 PR
  (develop→main)——**journey 全套會自動在這個 PR 上跑**(30-90 分鐘,
  真後端拋棄式分支),不再需要手動 workflow_dispatch;(c) 綠了以
  merge commit 合併。**main 收到 push = 正式站部署**(migration 由
  Supabase 原生整合套用),不可逆的東西都在這一步。
  注:`linear-check` 在 base=main 時自動跳過(晉升 PR 帶的正是 develop
  上累積的 feature merge commit)。
- Commit:Conventional Commits(`feat:` `fix:` `test:` `docs:` `refactor:`
  `style:` `chore:` `ci:`),**advisory**——但 TDD 相位的 `test(red)` /
  綠燈 commit 標記是流程必要(PR 以紅燈 hash 為證據)。
- Push 後自查 CI:`gh pr checks <pr> --watch`,紅了同 session 修到綠。
- 糾偏 SOP:方向錯了 Esc 中斷 → `/rewind` 回檢查點;同一錯誤糾正兩次
  仍錯 → `/clear` 換乾淨 context 重述問題。覺得「變慢/變笨」時**先跑
  `/context` 看誰吃掉空間**,不要直接 `/compact`——壓縮本身就是一次大請求,
  而 `/clear` 是零成本。
- 自我糾正要掃同類、要沉澱:commit message 若出現「精簡/移除/撤回/
  修正先前」這類自我修正語氣(不論 `feat:`/`fix:`/`docs:` 哪個前綴),
  先看同一份文件其他段落、姊妹文件裡是不是還有同一個毛病(參考
  `/fix-bug` 的「同類掃描」);若因此浮現一條可複用的原則,順手寫進
  `docs/README.md` 或 friction-log,不要只留在 commit message 裡。
- 記憶紀律:專案決策一律寫進 `docs/plans/`(git 是單一事實來源);
  auto-memory 只放個人操作性學習,不放專案決策。
- 框架自身的摩擦(誤擋/漏網/重複糾正)記入 `docs/plans/friction-log.md`,
  每 2 個 feature 或雙週整併成框架修訂 PR。

## 模型與 effort 分級

流程有分級(表層錯走簡版、行為級走完整版),模型也該有——thinking token
以 output 計價,而本專案任務跨度很大:

| 任務 | 用 |
|---|---|
| 改文案、加 log、修 typo | Sonnet + `/effort` 降級 |
| 一般功能實作、修 bug | Sonnet |
| 金流·會籍·獎勵規則、跨層契約、`api/index.ts` 結構調整 | Opus |
| 四個 plan-reviewer subagent | Sonnet(已寫進各 agent 的 frontmatter) |

MCP:優先用 CLI(`supabase` / `gh`)——CLI 不佔工具清單,MCP server 每台都有
固定開銷。對本 repo 只有 GitHub 與 Supabase 是常用的,其餘按需開,用完關掉。

## Compact instructions

壓縮時務必保留:當前 feature slug 與階段編號、紅燈 commit hash、改動過的
檔案清單、最後一次 `npm run check` 的結果、`docs/plans/<slug>/` 下已寫入的
檔案路徑。細節可捨——那些都能從上述檔案重讀。

## 環境前置

node ≥22 + npm(必要);deno + supabase CLI(動後端才要);
python3.12 + pip(動 e2e 才要)。缺件時 SessionStart hook 會提示。
