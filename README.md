# Uknow

**專業服務媒合平台。** 訪客可公開瀏覽、搜尋服務提供者；使用者付年費成為會員後，
可刊登服務、參與三代推薦獎勵、完成任務累積點數並申請提領。

## 技術棧

| 層 | 技術 |
|---|---|
| 前端 | React 18 + Vite + TypeScript、Tailwind v4、shadcn/ui（Radix）、React Router |
| 後端 API | 單一 Supabase Edge Function（Deno + Hono）`supabase/functions/api/index.ts` |
| 資料庫 / 認證 / 儲存 | Supabase（PostgreSQL + Auth + Storage） |
| 金流 | PayUni（統一金流） |
| 部署 | 前端 Cloudflare Pages、後端 Supabase Edge Functions |

## 快速開始

```bash
npm ci          # 安裝相依（同時掛上 pre-commit hook）
npm run dev     # 開發伺服器，port 3000
```

**環境前置**：node ≥ 22 + npm（必要）；deno + supabase CLI（動後端才要）；
python 3.12 + pip（動 e2e 才要）。缺件時 SessionStart hook 會提示。

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器（port 3000） |
| `npm run check` | **統一閘門**：biome + typecheck + vitest + knip（改完必跑） |
| `npm run check:full` | check + build + Deno 型別/格式檢查（送 PR 前跑） |
| `npm run test:watch` | vitest 監看模式 |
| `npm run test:coverage` | vitest + 覆蓋率（門檻是棘輪，只准往上） |
| `bash scripts/framework-check.sh` | 框架健康檢查（含 hook 行為測試） |

pre-commit hook 會跑 `npm run check`。commit 被擋時修到綠，不要用
`--no-verify` 繞（hook 也會擋）。

## 儲存庫結構

```
src/                    前端（React + TS）
  components/           頁面與元件（含 ui/ 的 shadcn 元件）
  utils/                純函式與共用邏輯（apiClient、constants、各流程狀態機）
  contexts/ hooks/      Context 與自訂 hooks
supabase/
  functions/api/        後端 API（單一 Edge Function，Deno + Hono）
  functions/_shared/    前後端共享契約（api-contract.ts）
  migrations/           資料庫 migrations（檔頭記錄「為什麼這樣改」）
e2e/                    Playwright + pytest-bdd（全 mock）
e2e/journey/            Journey 測試（打真後端拋棄式分支，絕不在本機跑）
docs/                   文件（見 docs/README.md）
scripts/                git hooks 與框架自檢腳本
```

## 測試分層

| 層 | 位置 | 何時跑 |
|---|---|---|
| 前端單元/元件 | `src/**/*.test.ts(x)`（vitest） | 每次 PR |
| 後端純函式 | `supabase/functions/api/*.unit.test.ts`（Deno） | 每次 PR |
| 後端整合 | `supabase/functions/api/*.test.ts`（Deno，需 Postgres） | 每次 PR |
| UI 行為（全 mock） | `e2e/features/*`（pytest-bdd + Playwright） | 每次 PR |
| Journey（真後端） | `e2e/journey/*` | nightly + 晉升 PR |

## 分支與部署

- Git-flow（簡化版）：`feature/*`、`fix/*` 從 `develop` 切出，PR 回 `develop`；
  **絕不直接 push `main`/`develop`**（hook 會擋）。
- `develop` 有自己的 persistent Supabase project；`main` 是正式站。
  Edge Function 在**該分支 CI 綠之後**才部署（`workflow_run` 觸發）。
- **正式站部署需人工核准**（GitHub `production` 環境的 required reviewer）。

## 文件

從 **[`docs/README.md`](docs/README.md)** 進入——那裡列出每份文件的權威性與適用時機。

最常用的兩份：

- [`docs/Uknow_Software_Specification.md`](docs/Uknow_Software_Specification.md)
  —— 需求與業務規則的單一事實來源
- [`CLAUDE.md`](CLAUDE.md) —— AI 助理的操作手冊（開發流程、閘門、慣例）
