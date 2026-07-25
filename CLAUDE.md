# Uknow

外送/服務媒合平台。React 18 + Vite + TS(前端)、Supabase Edge Functions
(Deno,後端 API)、Supabase Postgres、Cloudflare Pages 部署、PayUni 金流。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器(port 3000) |
| `npm run check` | **統一閘門**:biome + typecheck + vitest + knip(改完必跑) |
| `npm run check:full` | check + build + Deno 型別檢查(送 PR 前跑) |
| `npm run test:watch` | vitest 監看模式 |
| `bash scripts/framework-check.sh` | 框架檔案健康檢查 |
| `scripts/tdd-unlock.sh` | TDD 紅燈期唯一合法解鎖(check 綠才刪鎖) |

pre-commit hook 會跑 `npm run check`(由 `npm ci` 的 prepare 自動掛載)。
commit 被擋時修到綠,不要用 `--no-verify` 繞(hook 也會擋)。

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

| 何時 | 讀什麼 |
|---|---|
| 動任何功能前 | `docs/Uknow_Software_Specification.md` 對應章節 |
| 動 UI | `docs/UI_UX_Analysis.md` |
| 動多步驟表單/金流頁 | `docs/multi-step-flow-recovery.md`(四契約) |
| 動 e2e/journey | `docs/e2e-journey-test-design.md` |
| 動推薦/獎勵規則 | `docs/online-rewards-referral-rule-update.md` |
| Supabase 環境問題 | `docs/SUPABASE_SETUP_CHECKLIST.md` |

⚠️ `docs/blackbox/` 是未讀碼的黑箱練習產物,內容與本專案實際功能**無關**,
禁止當成規格來源。

## 開發流程(摘要;完整 SOP 在各 skill 內)

新功能一律三段式,每段可在全新 session 執行(狀態都在 `docs/plans/<feature>/`):

1. `/plan-feature <名稱>` — 探索+產規劃書(系統/架構/UIUX/需求四面向)
2. `/review-plan <feature>` — 4 個獨立視角 subagent(系統/架構/UIUX/需求)
   審查,彙整 review.md,停待人審
3. `/tdd-implement <feature>` — 人審通過後才可執行;TDD 紅→綠,相位鎖防改測試

修 bug 一律走 `/fix-bug`(根因分析+同類掃描+四面向審視+防線回填,
禁止就地貼補丁;表層 typo 有簡版分級)。

- Git-flow(簡化版):`feature/<slug>`、`fix/<slug>` 從 develop 切出,PR 回
  develop;絕不直接 push main/develop(hook 會擋)。
- 環境對應:develop 有自己的 persistent Supabase project
  (`vars.SUPABASE_DEVELOP_PROJECT_REF`),main 是正式站
  (`vars.SUPABASE_PROJECT_REF`)。push 到任一分支且動了
  `supabase/functions/**`,就會部署 Edge Function 到**該分支對應的**
  project(見 deploy-supabase.yml)——develop 是可安全驗證的真後端。
- 晉升 SOP(develop→main):(a) develop 上 CI 四軌綠;(b) 手動
  workflow_dispatch 跑一次 journey(至少 skeleton)綠;(c) 開晉升 PR
  (develop→main),用 merge commit 保留歷史。**main 收到 push =
  正式站部署**(Edge Function 自動部署、migration 由 Supabase 原生整合
  套用),晉升即上線,不可逆的東西都在這一步。
- Commit:Conventional Commits(`feat:` `fix:` `test:` `docs:` `refactor:`
  `style:` `chore:` `ci:`),**advisory**——但 TDD 相位的 `test(red)` /
  綠燈 commit 標記是流程必要(PR 以紅燈 hash 為證據)。
- Push 後自查 CI:`gh pr checks <pr> --watch`,紅了同 session 修到綠。
- 糾偏 SOP:方向錯了 Esc 中斷 → `/rewind` 回檢查點;同一錯誤糾正兩次
  仍錯 → `/clear` 換乾淨 context 重述問題。
- 記憶紀律:專案決策一律寫進 `docs/plans/`(git 是單一事實來源);
  auto-memory 只放個人操作性學習,不放專案決策。
- 框架自身的摩擦(誤擋/漏網/重複糾正)記入 `docs/plans/friction-log.md`,
  每 2 個 feature 或雙週整併成框架修訂 PR。

## 環境前置

node ≥22 + npm(必要);deno + supabase CLI(動後端才要);
python3.12 + pip(動 e2e 才要)。缺件時 SessionStart hook 會提示。
