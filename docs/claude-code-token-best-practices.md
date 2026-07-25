# Claude Code Token 效率 Best Practice 與 Uknow 專案實踐分析

> 研究來源：Anthropic 官方 Claude Code 文件（`Manage costs effectively`、`Best practices`、
> `How Claude remembers your project`、`Explore the context window`）。
> 專案量測時間：2026-07-25，量測基準為 `git ff55440`（token 數以 `bytes / 4` 估算，屬同數量級估計而非精確計數）。

---

## 一、核心原理：為什麼 token 會失控

所有 best practice 都源自同一個約束——**context window 是最稀缺的資源，而不是錢**。

| 機制 | 後果 |
| --- | --- |
| 每一次送出訊息，**整段對話都會重送一次** | 開了一整天的 session 裡問一句話，付的是整段對話的 input token |
| Context 越滿，模型表現越差 | Claude 會開始「忘記」前面的指令、犯更多錯 |
| Prompt cache 有存活期（訂閱制 1 小時、API key 5 分鐘） | 中斷超過存活期後的第一句話會 **完整重算** 全部 context |
| `/compact` 本身是一次大請求 | 壓縮一個很大的 context，代價就是讀完它；`/clear` 才是零成本 |
| Auto-compact 會摘要掉細節 | 被摘要掉的檔案內容，之後要用時得重讀 |

推論出的第一原則：**不是「省著用」，而是「別讓不相關的東西進來」**。

---

## 二、官方 Best Practice 整理

### A. Session 操作層（零設定，立刻可用）

| 做法 | 說明 |
| --- | --- |
| `/clear` 切換任務 | 不相關的任務之間一定要清。`/rename` 命名後再清，之後 `/resume` 找回 |
| `/compact <指示>` | 例：`/compact 只保留 API 契約變更與測試輸出`。比讓它自動摘要精準得多 |
| `/context`、`/usage` | 前者看誰吃掉 context（memory files / MCP / 工具），後者看 token 花在哪 |
| statusline 顯示 context 用量 | 把「還剩多少」變成隨時看得到的儀表 |
| Plan mode（Shift+Tab） | 多檔案、不熟的區域先規劃再動手，避免走錯方向後整段重做 |
| Esc / `/rewind` | 一發現方向錯就立刻停。**同一個問題糾正兩次以上就該 `/clear` 重開**，而不是繼續糾正 |
| `/btw` | 臨時小問題，答案顯示在浮層、不進對話歷史 |
| 具體的 prompt | 「improve this codebase」會觸發全庫掃描；「在 `src/utils/twid.ts` 的 checksum 加上空字串防護」只讀一個檔 |
| 給可驗證的目標 | 附上測試案例、預期輸出、截圖，讓 Claude 自己收斂，不用你當驗證迴圈 |

### B. 專案配置層（一次設定、長期複利）

| 機制 | 何時載入 | 用途 |
| --- | --- | --- |
| `CLAUDE.md` | **每個 session 全量載入** | 只放「每次都需要」的事實：build/test 指令、慣例、架構。目標 **200 行以內** |
| `.claude/rules/*.md` + `paths:` frontmatter | 只在 Claude 讀到符合 glob 的檔案時載入 | 分區慣例（前端 / edge function / migration / e2e） |
| `.claude/skills/*/SKILL.md` | **按需載入**（被呼叫或判定相關時） | 多步驟流程、領域知識。把 CLAUDE.md 裡的長流程搬到這裡 |
| Hooks | 決定性地在生命週期點執行 | **前置處理輸出**：把 10,000 行 log grep 成 20 行才給 Claude 看 |
| Subagents | 獨立 context | 隔離高輸出量操作（跑測試、查文件、掃 log），只回摘要 |
| CLI > MCP | — | `gh`、`supabase` CLI 不佔工具清單；MCP server 每台都有列表開銷。`/mcp` 關掉沒在用的 |
| Code intelligence plugin | — | typed language 用 symbol 導航取代 grep + 讀多個候選檔 |

官方對 `CLAUDE.md` 的取捨判準（逐行自問「刪掉它 Claude 會不會犯錯？」）：

| ✅ 該寫 | ❌ 不該寫 |
| --- | --- |
| 猜不到的 bash 指令 | 讀 code 就能得到的資訊 |
| 與預設不同的風格規則 | 語言的標準慣例 |
| 測試指令與偏好的 runner | 詳細 API 文件（改成連結） |
| repo 禮儀（分支命名、PR 慣例） | 經常變動的資訊 |
| 專案特有的架構決策 | 逐檔案的目錄說明 |
| 環境怪癖（必要的 env var） | 「寫乾淨的程式碼」這類廢話 |

### C. 模型與推理層

- **模型分級**：Sonnet 處理多數 coding 任務且更便宜，Opus 留給架構決策與多步推理；subagent 用 `model: haiku`。
- **Extended thinking**：thinking token 以 output token 計價，預設預算可達數萬。簡單任務用 `/effort` 降級；固定預算的模型可設 `MAX_THINKING_TOKENS=8000`。
- **Agent teams**：teammate 各有自己的 context window，plan mode 下約為單 session 的 **7 倍**。teammate 用 Sonnet、團隊要小、用完就關。

---

## 三、Uknow 專案診斷

### 量測結果

| 項目 | 數字 | 意義 |
| --- | --- | --- |
| 可分析原始碼總量（src/supabase/e2e/docs） | **≈ 505,000 tokens** | 是 200k context window 的 **2.5 倍**——全庫探索在物理上不可能，只能精準取用 |
| `supabase/functions/api/index.ts` | 2,877 行、49 條路由、**≈ 30,500 tokens** | **單一檔案一次讀取就吃掉 15% 的 context** |
| `docs/` 9 份文件 | ≈ 151 KB ≈ **38,000 tokens** | 整包讀進來就是 19% |
| `package-lock.json` | **≈ 60,900 tokens** | 絕對不能被讀（≈ 30% context） |
| `src/components/HomePage.tsx` | 1,066 行 ≈ 10,100 tokens | 前端最大單體 |
| migrations | 45 個 `.sql` | 找「某個欄位何時加的」很容易變成掃 45 個檔 |
| 測試檔 | 62 個 `*.test.ts`、27 個 `.feature`、75 個 `.py` | |
| 已連線 MCP server | **8 台**（GitHub、Supabase、Figma、Cloudflare、Atlassian、Gmail、Calendar、Drive） | 對本 repo 而言，多數與任務無關 |

### 已經做對的事

- **CI 已做 token/資源治理**：`paths-ignore` 讓純文件 PR 不燒 CI、`concurrency` + `cancel-in-progress` 淘汰舊 run、job 有 `timeout-minutes`、pip/npm/Playwright 都有 cache。這套思路與 context 治理同源。
- **`.gitignore` 乾淨**：`node_modules/`、`dist/`、`export/`、`test-results/` 都排除了，Claude 不會誤讀傾印資料。
- **CI 註解寫明了「為什麼」**（例如「vite build 用 SWC 只轉譯不檢查型別」），這正是該進 `CLAUDE.md` 的知識類型。

### 缺口（依影響排序）

1. **完全沒有 `CLAUDE.md`，也沒有 `.claude/` 目錄。** 這是最大的浪費源。
2. **`README.md` 只有 6 行 Figma 樣板**，等於零方向指引。每個新 session 都得從零重新發現：
   - `npm run typecheck` 是獨立步驟（因為 `vite build` 用 SWC 不檢查型別）——**猜不到**
   - edge function 測試在 `supabase/functions` 下用 `deno task check` / `deno task test`——**猜不到**
   - e2e 是 Python（pytest-bdd + Playwright）且完全 mock 網路——**猜不到**
   - `npx knip --include files,dependencies` 是 CI 的死碼閘門——**猜不到**
   
   四套獨立 toolchain（npm/vite/vitest、Deno、pytest、Supabase migrations），每次重新摸索都是數千 token 的探索成本。
3. **`api/index.ts` 是 30k token 的單體。** 任何後端任務只要碰到它，就先付掉 15% 的 context。
4. **測試輸出未經過濾。** CI 用 `pytest -v` + screenshot/video/tracing；`vitest run`、`deno test` 也是全量輸出。互動 session 裡直接跑，成功的雜訊會佔滿 context。
5. **8 台 MCP server 全開。** 雖然 schema 預設 deferred（只有名稱進 context），工具清單本身仍是固定開銷，且擴大了誤用面。

---

## 四、實踐方案

### P0 —— 建立 `CLAUDE.md`（成本最低、回報最高）

放在專案根目錄。以下是依本專案實況擬的草稿（約 55 行，遠低於 200 行上限）：

```markdown
# Uknow

React 18 + Vite 前端、Supabase Edge Function（Deno + Hono）後端、Postgres migrations、
Python（pytest-bdd + Playwright）e2e。四套 toolchain 各自獨立。

## 指令（每套 toolchain 不同，別互相套用）

前端（repo root）：
- `npm run typecheck` —— **必跑**。`npm run build` 用 SWC 只轉譯不檢查型別
- `npm test` —— vitest，node 環境，純函式單元測試
- `npx knip --include files,dependencies` —— CI 的死碼閘門，未引用檔案/未用依賴會被擋

Edge Function（`cd supabase/functions`）：
- `deno task check` —— 型別檢查
- `deno task test` —— 需要本機 Supabase（`supabase start`）

e2e（`cd e2e`）：
- `pytest -q` —— 完全 mock Supabase/PayUni，不需 secrets，會自己起 `npm run dev`
- 除錯單一情境用 `pytest -q -k <keyword>`，**不要**整套跑

journey 離線測試（`cd e2e/journey`）：`pytest tools/ -q`

## 架構

- `src/components/` —— 依領域分子目錄（admin/referral/reward/task/subscription/notifications）
- `src/components/ui/` —— vendored shadcn，屬設計系統表面，不要當成死碼刪
- `supabase/functions/api/index.ts` —— **單一 Hono app，2,877 行 49 條路由**。
  先用 `grep -n "app\.\(get\|post\|put\|delete\)" ` 定位，再用 Read 的 offset/limit 讀該段，**不要整檔讀**
- `supabase/functions/_shared/api-contract.ts` —— 前後端共用契約，改動需同步兩側
- `supabase/migrations/` —— 45 個檔，命名為 `YYYYMMDDHHMMSS_描述.sql`，只增不改

## 慣例

- 註解與 commit message 用繁體中文；TDD 流程以 `test(red):` / `feat(green):` 標記
- 個資（身分證、銀行帳號）一律遮罩後才回傳，見 `api/index.ts` 的 `maskNationalId` / `maskBankAccount`
- 資料傾印/匯出目錄（`export/`、`src/imports/`）不進版本庫，見 `src/utils/repoHygiene.test.ts`

## 別讀這些

`package-lock.json`（≈ 60k tokens）、`supabase/functions/deno.lock`、`e2e/test-results/`

## Compact instructions

壓縮時保留：改動過的檔案清單、API 契約變更、測試指令與最後一次測試輸出。
```

**預期效果**：省掉每個 session 開頭的「發現指令與架構」探索（保守估 3,000–8,000 token/session），並且避免「跑錯 test runner → 失敗 → 重試」這種最貴的浪費。

> 建議先跑 `/init` 產生基準版，再用上面的內容補上 Claude 無法自行發現的部分（特別是「為什麼 typecheck 是獨立步驟」這類 rationale）。

### P0 —— 用 `.claude/rules/` 分區，避免慣例擠進全域 context

四套 toolchain 的細節不該每個 session 都載入。用 `paths:` frontmatter 讓它只在相關時出現：

```
.claude/rules/
├── edge-function.md   paths: ["supabase/functions/**/*.ts"]
├── migrations.md      paths: ["supabase/migrations/**/*.sql"]
├── e2e.md             paths: ["e2e/**/*.py", "e2e/**/*.feature"]
└── frontend.md        paths: ["src/**/*.{ts,tsx}"]
```

例如 `.claude/rules/migrations.md`：

```markdown
---
paths:
  - "supabase/migrations/**/*.sql"
---
# Migration 規則
- 檔名 `YYYYMMDDHHMMSS_描述.sql`，時間戳必須大於現有最大值
- 既有 migration **不可修改**，一律新增
- 要查某欄位的歷史，用 `grep -rn "<column>" supabase/migrations/` 定位後只讀命中的檔案，
  不要逐一讀完 45 個檔
```

**預期效果**：SQL 慣例只在改 SQL 時出現。相較於把四區慣例全塞進 `CLAUDE.md`，既省 context 也提升遵循率（官方明確指出檔案越長遵循率越低）。

### P1 —— 給 `api/index.ts` 一張路由地圖（比重構便宜得多）

30k token 的單體是本專案最大的 context 陷阱。有兩條路：

**（a）低成本、立刻可做**——建一個 skill 放路由 → 行號對照表，讓 Claude 直接用 `Read` 的 `offset`/`limit` 跳到目標段落：

```markdown
.claude/skills/api-route-map/SKILL.md
---
name: api-route-map
description: Uknow Edge Function 的路由 → 行號地圖。要改或查 supabase/functions/api/index.ts 的任一端點時使用，避免整檔讀取。
---
# api/index.ts 路由地圖（2,877 行，49 條路由）

用 Read 的 offset/limit 只讀需要的段落。若行號已飄移，用
`grep -n "app\.\(get\|post\|put\|patch\|delete\)(" supabase/functions/api/index.ts` 重新定位。

| 區段 | 行號 | 內容 |
| --- | --- | --- |
| CORS / 快取 | 33–117 | `app.use('*', cors(...))`、`READ_PATHS`、`CORS_304_HEADERS` |
| 共用工具 | 118–195 | `sb()`、`getRewardConfig`、`requireAuth`、`isAdminUser`、`verifyNationalId`、遮罩函式 |
| PayUni 設定 | 274–357 | `payuniConfig()` |
| Auth 路由 | 358–622 | profile / check-email / register / complete-registration / reset-registration |
| Referrals | 623–… | `/referrals/validate/:code` 起 |
（其餘依實際 grep 結果補齊）
```

**（b）根本解**——把 49 條路由按領域拆成 `routes/auth.ts`、`routes/referrals.ts`、`routes/payments.ts`、`routes/tasks.ts`、`routes/withdrawals.ts`、`routes/admin.ts`，`index.ts` 只留組裝。之後單一領域任務讀 2,000–5,000 token 就夠。

代價要說清楚：這是有風險的重構，需 `deno task check` + `deno task test` + e2e 全綠才能收。**建議先做 (a)**——它幾乎零風險，且能立刻拿到大部分收益；(b) 等有其他理由要動這個檔案時再一併做。

### P1 —— 用 hook 過濾測試輸出

本專案的測試輸出量在互動 session 裡是實質負擔（CI 用 `pytest -v` + screenshot/video/tracing）。官方建議用 `PreToolUse` hook 前置過濾。針對本專案四種 runner：

```bash
# .claude/hooks/filter-test-output.sh
#!/bin/bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command')

case "$cmd" in
  # vitest / deno test / pytest：只留失敗與錯誤
  npm\ test*|*deno\ task\ test*|*pytest*)
    filtered="$cmd 2>&1 | grep -A 5 -E '(FAIL|FAILED|ERROR|error:|✗|assert)' | head -100"
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"updatedInput\":{\"command\":\"$filtered\"}}}"
    ;;
  *) echo "{}" ;;
esac
```

搭配 `.claude/settings.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": ".claude/hooks/filter-test-output.sh" }] }
    ]
  }
}
```

**預期效果**：全綠的 62 個 `*.test.ts` 加上 27 個 `.feature` 情境，成功輸出從數千 token 壓到數十 token。**注意**：過濾器會吃掉成功時的證據，需要看完整輸出時得繞過它——所以建議只在成功路徑上過濾（如上，只保留 FAIL/ERROR 段落），並在 `CLAUDE.md` 註明這個 hook 存在，否則 Claude 會困惑於「為什麼測試沒有輸出」。

### P1 —— 精簡 MCP，改用 CLI

本 session 連了 8 台 MCP server。對本 repo 的日常開發：

| Server | 建議 | 理由 |
| --- | --- | --- |
| GitHub | 保留（web 環境無 `gh` CLI） | PR/issue 操作必需 |
| Supabase | 保留 | migration、log、advisor 查詢 |
| Figma | 按需開 | README 指向 Figma 設計稿，但只在做 UI 時需要 |
| Cloudflare | 按需開 | `wrangler.toml` 存在，僅部署時需要 |
| Atlassian / Gmail / Calendar / Drive | 關掉 | 與本 repo 無關 |

本機開發時另有更省的做法：用 `supabase` CLI 取代 Supabase MCP（CLI 不佔工具清單）。跑 `/context` 可以看到工具清單實際佔了多少。

### P2 —— 把長流程搬進 skills

`docs/` 有 38k token。它們是資產，但不該被整包讀進來。把「查文件才知道」的流程包成 skill：

| Skill | 取代的探索行為 |
| --- | --- |
| `e2e-journey` | 目前要理解 journey 套件得讀 `docs/e2e-journey-test-design.md`（23 KB）+ `e2e/journey/README.md`（8.7 KB）≈ 8,000 token。skill 裡寫清楚 orgchart/builders/run_state 的關係 + 怎麼跑單一情境即可 |
| `reward-rules` | `docs/online-rewards-referral-rule-update.md`（20 KB）的推薦獎金規則，改獎勵邏輯時才載入 |
| `blackbox-testing` | `docs/blackbox/*.md`（56 KB）的測試計畫與對帳流程 |

同時建議加一份 `docs/README.md` 當索引（每份文件一行說明它回答什麼問題），讓 Claude 能挑檔而不是逐份試讀。

### P2 —— 委派給 subagent

以下操作在本專案輸出量特別大，適合丟給 subagent 隔離：

- 「45 個 migration 裡 `subscriptions` 表的 schema 演進」→ 掃 45 個檔，只回演進摘要
- 「27 個 `.feature` 有哪些情境涵蓋了 withdrawal」→ 只回情境清單
- e2e 失敗診斷 → 讓 subagent 讀 trace/screenshot，只回根因

Prompt 形式：`用 subagent 調查 …`。

### P2 —— 權限與模型

- **權限 allowlist**：把 `npm run typecheck`、`npm test`、`deno task check`、`pytest`、`git commit` 等放進 `.claude/settings.json` 的 allowlist，減少確認往返。本專案可直接跑 `/fewer-permission-prompts` skill 自動生成。
- **模型分級**：日常改動用 Sonnet；`api/index.ts` 的路由拆分、獎勵規則這類跨檔案推理才用 Opus。Subagent（掃 migration、查文件）指定 `model: haiku`。
- **Effort**：改一行、加 log 這種任務用 `/effort` 降級，thinking token 是以 output 計價的。

---

## 五、優先順序總結

| 優先 | 動作 | 成本 | 預期效果 |
| --- | --- | --- | --- |
| **P0** | 建 `CLAUDE.md`（≤ 200 行，四套 toolchain 指令 + 架構 + 別讀清單 + compact 指示） | 30 分鐘 | 消除每 session 的重新發現成本；避免跑錯 runner |
| **P0** | 建 4 份 `.claude/rules/*.md`（`paths:` 分區） | 1 小時 | 慣例按需載入，提升遵循率 |
| **P1** | `api-route-map` skill（路由 → 行號） | 30 分鐘 | 後端任務省下約 15% context |
| **P1** | 測試輸出過濾 hook | 30 分鐘 | 成功測試輸出從數千壓到數十 token |
| **P1** | 關掉 4 台無關 MCP server | 5 分鐘 | 縮小工具清單與誤用面 |
| **P2** | 3 個文件型 skill + `docs/README.md` 索引 | 2 小時 | 38k token 的文件變成按需取用 |
| **P2** | 權限 allowlist + 模型分級 | 30 分鐘 | 減少往返與 thinking token |
| **P2** | 拆分 `api/index.ts` 為領域路由模組 | 半天 + 完整測試 | 根本解，但有重構風險——建議與其他改動搭車 |

日常操作習慣（不需設定，但影響最大）：**任務之間 `/clear`**、**同一問題糾正兩次就重開**、**prompt 指名檔案**、**多檔案改動先進 plan mode**。官方把「kitchen sink session」和「反覆糾正」列為最常見的兩個浪費模式，兩者的解法都是 `/clear`。

---

## 參考來源

- [Manage costs effectively — Claude Code Docs](https://code.claude.com/docs/en/costs)
- [Best practices for Claude Code — Claude Code Docs](https://code.claude.com/docs/en/best-practices)
- [How Claude remembers your project (CLAUDE.md / rules / auto memory)](https://code.claude.com/docs/en/memory)
- [Explore the context window](https://code.claude.com/docs/en/context-window)
- [Effective context engineering for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
