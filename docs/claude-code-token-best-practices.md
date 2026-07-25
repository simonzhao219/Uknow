# Claude Code Token 效率 Best Practice 與 Uknow 專案實踐分析

> 研究來源：Anthropic 官方 Claude Code 文件（`Manage costs effectively`、`Best practices`、
> `How Claude remembers your project`、`Explore the context window`）。
> **量測基準：`develop`（`30d6b33`）**，2026-07-25。第一～四節的 token 數以 `bytes / 4` 估算。
> 第五節之後改用 CJK 感知估算（`scripts/check-context-budget.py`），本 repo 實測比 `bytes/4`
> 高 +6%～+16%——兩者都是估算而非真值，需要精確數字時看 `/context`。
>
> 註：本文件首版以 `main`（`ff55440`）為基準，結論已被 `develop` 推翻——`develop` 領先 main 75 個 commit，
> 其中包含完整的 `CLAUDE.md` 與 `.claude/` 框架。首版的 P0/P1 建議多數已在 `develop` 落地，本版重寫。

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

## 二、官方 Best Practice 對照表

以下逐項對照 `develop` 現況。**✅ 已落地｜⚠️ 部分｜❌ 缺**

### A. Session 操作層

| 官方做法 | develop 現況 |
| --- | --- |
| `/clear` 切換任務、同一問題糾正兩次就重開 | ✅ 已寫進 CLAUDE.md「糾偏 SOP」 |
| Esc 中斷 / `/rewind` 回檢查點 | ✅ 同上 |
| Plan mode 先規劃再實作 | ✅ 三段式流程（`/plan-feature` → `/review-plan` → 人審 → `/tdd-implement`），且 PreToolUse 守衛硬性擋住未審就寫產品碼 |
| `/compact <指示>` 自訂壓縮重點 | ✅ **已補** CLAUDE.md 的 Compact instructions（保留 slug/階段/紅燈 hash） |
| `/context`、`/usage` 監看用量 | ✅ **已補**：糾偏 SOP 加「先跑 `/context` 再決定，不要直接 `/compact`」 |
| 具體 prompt、給可驗證目標 | ✅ TDD 紅燈先行本質上就是「先給可驗證目標」 |

### B. 專案配置層

| 官方做法 | develop 現況 |
| --- | --- |
| `CLAUDE.md` ≤ 200 行、只放每次都需要的事實 | ✅ **116 行 / ≈1,646 tok** |
| `.claude/rules/` 用 `paths:` frontmatter 條件載入 | ✅ 2 條規則都有 `paths:`（`e2e/**`、`supabase/functions/**`）——條件載入設定正確 |
| 長流程搬進 skills（按需載入） | ✅ 5 個 skill；`tdd-implement` 還用 `disable-model-invocation: true` 鎖成只能人啟動 |
| Subagent 隔離高輸出量操作 | ✅ 4 個 fresh-context 審查員，`tools: Read, Grep, Glob`（無 Write/Edit）——工具面收得很緊 |
| Hooks 做決定性攔阻 | ✅ 4 個（bash-guard / feature-plan-guard / tdd-test-guard / session-bootstrap） |
| Hooks 做**輸出前置過濾** | ✅ **已補**（`check-output-filter.py`）；原本 4 個 hook 全是守衛 |
| 文件按需讀取、不全量預載 | ✅ CLAUDE.md 有「Docs 路徑地圖（需要時才讀，勿全部預載）」——正是官方的 just-in-time 取用 |
| 權限 allowlist 減少往返 | ✅ settings.json 20 條 allow + 5 條 deny（`.env` / `supabase/.temp` / 兩個 lockfile） |
| Subagent 指定較便宜的模型 | ✅ **已補** `model: sonnet` × 4 |
| CLI 取代 MCP、關掉沒用的 server | ⚠️ 規範**已補**（優先 CLI、只常用 GitHub + Supabase）；關 server 本身需使用者端 `/mcp` 操作 |

### C. 模型與推理層

| 官方做法 | develop 現況 |
| --- | --- |
| 模型分級（Sonnet 為主、Opus 留給架構決策） | ✅ **已補** CLAUDE.md 的四級對照表 |
| `/effort` 降級、`MAX_THINKING_TOKENS` | ✅ **已補**（輕量任務降 effort，同表） |
| Agent teams 用 Sonnet、團隊要小 | — 未使用 agent teams |

**結論：專案配置層（B）幾乎全部做對，而且做得比官方範例更嚴（守衛 + 相位鎖）。剩下的缺口集中在「輸出量治理」與「模型分級」——也就是 A 與 C。**

---

## 三、develop 量測結果

| 項目 | 數字 | 對照 main |
| --- | --- | --- |
| 可分析原始碼總量（src/supabase/e2e/docs/scripts/.claude） | **≈ 552,700 tokens** | 505,000（**+9%**） |
| `supabase/functions/api/index.ts` | **3,081 行、49 條路由、≈ 30,900 tok** | 2,877 行（**+204 行**） |
| `CLAUDE.md` | 116 行 / ≈ 1,646 tok | 不存在 |
| `docs/`（不含本文件） | ≈ 39,000 tok | ≈ 38,000 tok |
| `package-lock.json` | ≈ 62,100 tok | ≈ 60,900 tok |
| `src/components/HomePage.tsx` | 1,028 行 / ≈ 9,900 tok | 1,066 行 |
| migrations / `*.test.ts` / `.feature` | 46 / 64 / 27 | 45 / 62 / 27 |

總量是 200k context window 的 **2.8 倍**——全庫探索在物理上不可能，只能精準取用。而且**在成長**：兩週內 +9%。

### 已經做對、值得留著的事

- **`npm run check` 統一閘門**：`biome && tsc && vitest && knip` 收成一個指令。Claude 不用記四個 runner，也不會跑錯——這是**呼叫端**的 token 節約。
- **SessionStart bootstrap 在順利路徑上是安靜的**：只有缺 `node_modules`、git hooks 沒掛、TDD 鎖殘留、缺 deno/supabase CLI 時才輸出。SessionStart 的 stdout 會進 context，這個設計刻意不浪費它。
- **CI 的 `ci-ok` 單一匯總閘門**：required check 只認 `ci-ok`（新增 job 只要進 needs，保護規則永遠不用動）。註解還記下了 PR #109 的失敗教訓。（同一個 job 裡的路徑過濾原本**完全沒有生效**，已於 PR #113 修復——見下方該節。）
- **`linear-check` 強制線性歷史**，CLAUDE.md 明寫「不要按 GitHub 的 Update branch」——這條**必須**留在全域 context，因為刪掉它 Claude 就會踩。
- **記憶紀律**：專案決策進 `docs/plans/`（git 為單一事實來源），auto-memory 只放個人操作性學習。這正確處理了官方 auto memory 只載入前 200 行的限制。

---

## 四、剩餘缺口與實踐方案

### ~~P0~~ ✅ 已套用 —— `api/index.ts` 的導航缺口

> 已實作於 `.claude/rules/supabase-functions.md`：grep 定位指令 + 12 段區段表
> （刻意不寫死行號）。以下保留原始診斷。

3,081 行 / 49 條路由 / **≈ 30,900 tok = 單檔一次讀取吃掉 15% context**。而它在 develop 上**又長了 204 行**。

CLAUDE.md 目前只說「後端單一 Edge Function：`supabase/functions/api/index.ts`」——點名了檔案，**但沒給任何導航手段**，Claude 面對它的預設行為就是整檔讀。

**最佳落點不是新 skill，而是既有的 `.claude/rules/supabase-functions.md`**——它已經有 `paths: ["supabase/functions/**"]`，意思是這張地圖會**恰好在 Claude 碰後端時載入、其餘時候零成本**。比 skill 更省（skill 需要被判定相關才載入），也比寫進 CLAUDE.md 更省（那會變成全 session 常駐）。

追加到 `.claude/rules/supabase-functions.md`：

```markdown
## index.ts 導航（3,081 行 49 條路由——不要整檔讀）

先定位再取段，用 Read 的 offset/limit：

    grep -n "app\.\(get\|post\|put\|patch\|delete\)(" supabase/functions/api/index.ts

| 區段 | 內容 |
|---|---|
| 前段 | CORS / `READ_PATHS` / `CORS_304_HEADERS` |
| 共用工具 | `sb()`、`getRewardConfig`、`requireAuth`、`isAdminUser`、`verifyNationalId`、`maskNationalId`、`maskBankAccount` |
| PayUni | `payuniConfig()` |
| 路由 | auth → referrals → subscriptions → payments → tasks → withdrawals → admin |

行號會隨改動漂移，一律用 grep 現算，不要在文件裡寫死行號。
```

**預期效果**：後端任務省下約 15% context（≈ 25,000+ tok），且不佔前端 session 任何成本。

根本解是把 49 條路由按領域拆成 `routes/*.ts`，`index.ts` 只留組裝——之後單一領域任務讀 2,000–5,000 tok 就夠。但這是有風險的重構，需 `deno task check` + `deno task test` + e2e 全綠才能收。**建議先做地圖**（近乎零風險、拿到大部分收益），拆分等有其他理由要動這個檔案時搭車。

### ~~P0~~ ✅ 已套用 —— `npm run check` 輸出未過濾（最高頻的漏點）

> 已實作於 `.claude/hooks/check-output-filter.py`，接進 settings.json 的 Bash
> matcher，並在 CLAUDE.md 註明。實作與下方草稿有三處重要差異，見「實作與草稿的
> 差異」一節。以下保留原始診斷。

這是 develop 上**發生頻率最高**的 token 支出：

- CLAUDE.md 明訂「改完必跑」
- pre-commit hook 每次 commit 再跑一次
- 串了四個工具：biome（全庫）→ tsc → vitest（**64 個測試檔**）→ knip

現有 4 個 hook **全部是守衛**（擋 `--no-verify`、擋直推、擋本機 journey、擋未審寫碼），**沒有一個在過濾輸出**。官方明確把「用 hook 前置處理輸出」列為降低 token 的手段：與其讓 Claude 讀完 10,000 行 log，不如 hook 先 grep 出 `ERROR` 只回幾十行。

建議加一個 **PreToolUse（Bash）輸出過濾**，與現有 `bash-guard.py` 並列（settings.json 的 Bash matcher 已有 hooks 陣列，直接追加即可）：

```python
# .claude/hooks/check-output-filter.py
# PreToolUse(Bash):npm run check / vitest / deno test 綠燈時只回一行。
# 決策邏輯放純函式 decide() 裡,與 bash-guard.py 同慣例,好讓
# scripts/test-hooks.py 用表格案例驗行為。
import json, re, sys

FILTERED = re.compile(r"npm run check(:full)?\b|npx vitest run\b|deno task test\b")

def decide(cmd: str) -> str | None:
    """回傳改寫後的指令,或 None 表示不動。純函式,無 I/O。"""
    if not FILTERED.search(cmd) or "|" in cmd:   # 已有 pipe 就別亂改
        return None
    # 綠燈收成一行;紅燈保留失敗段落與前後文
    return (f"{cmd} 2>&1 | grep -E -A5 "
            r"'(FAIL|FAILED|ERROR|error( TS[0-9]+)?:|✗|✕|Unused|assert)' "
            "| head -120 || echo '[filter] 全綠(無失敗輸出)'")

payload = json.load(sys.stdin)
new = decide(payload.get("tool_input", {}).get("command", ""))
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse", "permissionDecision": "allow",
    "updatedInput": {"command": new}}} if new else {}))
```

**必要配套（否則會製造新問題）**：

1. **在 CLAUDE.md 註明這個 hook 存在**，否則 Claude 看到「全綠」卻沒有測試明細會困惑，甚至重跑一次確認——反而更貴。
2. **保留繞過方式**：需要完整輸出時用 `npm run check 2>&1 | tail -60`（含 pipe，過濾器會放行）。
3. **`npm run check:full` 要一併涵蓋**，它是送 PR 前的指令。
4. 加完務必跑 `python3 scripts/test-hooks.py`——專案已有 hook 行為測試機制，新 hook 該進去。

**預期效果**：全綠的 64 個測試檔 + biome + knip 輸出，從數千 tok 壓到數十 tok。以「改完必跑」的頻率計，這是單位時間內回報最高的一項。

#### 實作與草稿的差異（三處，都是實作時才發現的坑）

上面那份草稿**不能直接用**。實作時發現三個問題，其中第一個會造成比它省下的更嚴重的後果：

1. **草稿會吞掉 exit code。** `cmd 2>&1 | grep ... | head -120 || echo '全綠'` 的 exit
   status 是 pipeline 最後一段的，不是 `cmd` 的——**紅燈會被當成綠燈**。這比不過濾
   危險得多：省 token 的機制不該有機會謊報成功。實作改成把輸出寫進 `mktemp`、
   捕捉 `$?`、最後 `exit` 原碼，過濾只決定「顯示什麼」，不影響「成功還是失敗」。
   `scripts/test-hooks.py` 為此加了一條真的跑一次的案例（純函式測不到這個）。
2. **回報 `permissionDecision: allow` 可能蓋掉 `bash-guard` 的 deny。** 兩個 hook 掛在
   同一個 Bash matcher 上，於是 `npm run check && <危險指令>` 有機會靠本 hook 的
   allow 繞過守衛。實作先問過 `bash-guard.decide()`，它要擋的指令一律不出手。
   這條也進了表格案例——**它是安全條件，不是最佳化**。
3. **`git commit` 刻意排除。** 它不在 `permissions.allow` 內，自動 allow 等於偷偷放寬
   commit 權限；而它常以 heredoc 形式出現，包裝會破壞 heredoc。代價是
   **pre-commit 自己跑 `npm run check` 的輸出仍未折疊**——而那正是實務上最常見的
   那坨 200+ 行 biome warning。要治它得改 `scripts/git-hooks/pre-commit` 讓它在
   綠燈時自己安靜，那是獨立的一件事（見下方 P2 追加項）。

繞過方式收斂為一條：指令自帶 pipe／重導向／heredoc 時一律不改寫，所以
`npm run check | tail -80` 永遠拿得到完整輸出。

### ~~P1~~ ✅ 已套用 —— 4 個審查 subagent 沒指定模型

> 四個 `.claude/agents/plan-reviewer-*.md` 都已加 `model: sonnet`。
> 仍建議在下一個 feature 上比對審查品質。以下保留原始診斷。

`.claude/agents/plan-reviewer-*.md` 都沒有 `model:` 欄位，因此**繼承主 session 模型**。而扇出倍率不小：

- `/review-plan` → 4 個 subagent
- `/review-implementation` → 同樣 4 個
- **一個 feature 走完三段式 = 8 次 subagent 執行**，每個都有獨立 context，各自要讀 `docs/_templates/review.md` 的輸出契約 + 規劃書/diff + 自行 grep codebase

官方對此的建議很直接：subagent 指定較便宜的模型（簡單任務甚至 `model: haiku`）。對抗性審查需要判斷力，**Sonnet 是合理的落點**——四個視角的價值來自「fresh context 沒有確認偏誤」，而不是來自最高階模型。

```markdown
---
name: plan-reviewer-architecture
description: ...
tools: Read, Grep, Glob
model: sonnet          # ← 追加
---
```

四個檔案都加。**建議先在一個 feature 上試跑比對審查品質**再全面套用——如果發現某個視角（例如系統設計）確實需要更強的推理，單獨把那一個留在繼承模型即可。

同時值得記一筆：`/review-plan` 的 **Plan Mode（不落檔）模式會把規劃全文放進每個 subagent 的 prompt**，等於規劃內容 ×4。這是 fresh-context 扇出的固有代價（也是它避免確認偏誤的原因），不該取消——但它是「規劃書要寫精簡」的一個實際理由。

### ~~P1~~ ✅ 已解決（比原建議更徹底：整個目錄已刪除）—— `docs/blackbox/` 曾是 14,100 tok 的搜尋陷阱

> 本節原建議把 `docs/blackbox/` 加進 `permissions.deny`，已一度照做。但
> PR #115（2026-07-25 的文件整理）判定這個目錄與本專案零關聯，直接**整個
> 刪除**——deny 規則因此也失去存在理由，一併移除。CLAUDE.md 那句「禁止
> 當成規格來源」的警語同一個 PR 也拿掉了。以下保留原始診斷，帶引號的
> CLAUDE.md 警語現在只是歷史紀錄，不代表目前的 CLAUDE.md 內容。
>
> **一個順帶的方法論教訓**：這節分析本身在 PR #115 合併後有一段時間沒
> 更新過——deny 規則已經是 dead config、上面這段文字還在描述一個已經
> 不存在的東西，直到後續分析才發現並回頭修。這正是本文件在別處反覆強調
> 的那個模式（「宣稱有的治理若不生效，比沒有治理更貴」）換了個對象重演：
> 這次不是治理沒生效，是**文件在治理對象消失後沒有同步退場**。

CLAUDE.md 曾經寫著：

> ⚠️ `docs/blackbox/` 是未讀碼的黑箱練習產物，內容與本專案實際功能**無關**，禁止當成規格來源。

問題是這條規則只約束「**當成規格用**」，攔不住它**進 context**。三個檔案共 14,100 tok，檔名是 `01-spec.md` / `02-test-plan.md` / `03-phase3-reconciliation.md`——任何 `grep -r "reconciliation" docs/` 或 Glob `docs/**/*spec*` 都會命中，然後 Claude 讀了才發現不該用。

官方的區分很清楚：**CLAUDE.md 是建議、settings 是強制**。既然這是「絕對不該讀」而非「讀了要小心」，就該落到 settings，而不只是留在 CLAUDE.md 的警語裡。當時 `settings.json` 的 `permissions.deny` 已經在用這個模式（`.env`、`supabase/.temp`），加一行 `Read(./docs/blackbox/**)` 是成本最低的立即止血。

回頭看，**更徹底的做法**（本節原本也提到、當作「看保存意願再做」的選項）才是真正解法：deny-list 只是把噪音擋在 Claude 的搜尋範圍外，目錄本身還在，仍然是每個 clone、每次全庫掃描的常駐成本；直接刪除才是把問題連根移除，而不是持續管理它。

### ~~P1~~ ✅ 已修 —— CI 的 `changes` 路徑過濾從未生效（本 PR 意外實測出來）

> **已於 PR #113 修復並合併進 develop**（`fix/ci-paths-filter-quantifier`，走 `/fix-bug` 完整版）。
> 修法為一行 `predicate-quantifier: every`，防線回填為 `scripts/check-workflows.py`
> 接進 framework-check 軌。以下保留原始診斷紀錄。

`ci.yml` 的 `changes` job 用 `dorny/paths-filter@v3`，意圖寫在註解裡：

> 純文件變更依然不燒重的 job，省 runner 的初衷不變。

**這個初衷目前沒有兌現。** 本 PR 只動一個 `docs/*.md` 檔案，`changes` job 的 log 是：

```
predicate-quantifier: some
Detected 1 changed files
Filter code = true
Matching files:
docs/claude-code-token-best-practices.md [added]
```

`code=true` → `build`、`api-tests`、`e2e-tests`、`journey-offline` 四軌全部照跑。

**根因**：`predicate-quantifier` 沒設，取預設值 `some`——語意是「檔案符合**任一** pattern 就算命中」。
於是 `docs/....md` 命中第一條 `'**'` 就成立，後面三條負向 pattern（`!docs/**`、`!**/*.md`、
`!.claude/**`）永遠不會被考慮。dorny 官方文件對這個 exclusion 慣用法的說明很明確：**必須**
搭配 `predicate-quantifier: 'every'`（要求所有 pattern 都成立），負向排除才會作用。

換句話說 `code` 對**任何** PR 都是 `true`，這個 filter 從加入起就沒有 skip 過任何東西。

**這是從 main 退化來的**：main 上用的是 workflow 層 `paths-ignore`，那個是**有效**的（純文件 PR
根本不觸發 workflow）。develop 改成 job 層過濾的理由是正確的——workflow 層被 ignore 時
required check 永遠 pending、純文件 PR 會卡死無法合併（註解裡寫了）——但搬遷過程中把實際的
過濾能力弄丟了。

**修法是一行**：

```yaml
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          predicate-quantifier: every      # ← 缺這行,負向 pattern 全部失效
          filters: |
            code:
              - '**'
              - '!docs/**'
              - '!**/*.md'
              - '!.claude/**'
```

改完要驗證兩個方向，缺一邊就會換一種壞法：純文件 PR 應 skip 四軌而 `ci-ok` 仍綠（`skipped`
計為通過的邏輯已經寫在 `ci-ok` 裡）；動 `src/**` 的 PR 應照跑四軌。

雖然這一項省的是 CI runner 而不是 context token，但它與本文件同源——**宣稱有的治理其實沒生效，
比沒有治理更貴**，因為沒人會再去看它。這也是為什麼上面每一項建議都附了驗證方式。

### ~~P2（新增）~~ ✅ 已套用 —— 讓 pre-commit 在綠燈時自己安靜

上面那個輸出過濾 hook 只覆蓋 **Claude 執行的** 指令，`git commit` 觸發的 pre-commit 不在範圍內
（原因見「實作與草稿的差異」第 3 點）。而實務上最常見的那坨 200+ 行 biome warning 正是從這裡
來的——本次施工期間就重複出現三次，每次改的都只是 `.md` 或 `scripts/`。

**已實作**：包裝器抽成 `scripts/git-hooks/lib-quiet.sh`，由 `pre-commit` 的 `run_gate` 統一套用，
所以三個閘門（`static-gates` / `npm-run-check` / `deno-fmt`）全部受益。綠燈只印一行摘要，
紅燈原樣全印。`PRE_COMMIT_VERBOSE=1` 取回完整輸出（折疊會吃掉即時進度與顏色）。
`DRYRUN` 輸出一字未變，既有行為案例不受影響。

**為什麼抽成獨立檔案**：這是 commit 閘門的一部分，而閘門自己必須有紅綠燈（framework-check 的
既有原則）。內嵌在 `pre-commit` 裡就沒有可測的接縫——那支腳本一被 source 就會開始跑閘門。
抽出來之後可以直接餵 `true`/`false` 驗兩個方向，不必真的跑一次 `npm run check`。

**最關鍵的實作要點**：`exit code 必須原樣傳遞`。這裡是 commit 閘門，吞掉退出碼等於閘門
「看起來正常」地失效，比前面那個 hook 的同類風險更嚴重。因此包裝器顯式捕捉 `$?` 再 `return`，
而測試刻意用退出碼 **3** 與 **7** 驗（不是 1），證明傳遞的是**原始碼**而不是「某個非零值」。

順帶一提，`deno task check` 那段**原本就已經是這個模式**（捕捉進 `check_out`、只在失敗時印）——
本次只是把專案自己已經想到的做法推廣到另外三個閘門。而那 214 條 biome warning 本身是
friction-log 記錄的存量債（導入 biome 時降級為 warn）；真正清掉它們比折疊輸出更根本，
但那是償還計畫的事。

### ~~P2~~ ✅ 已套用 —— CLAUDE.md 補 compact instructions

> 已加進 `CLAUDE.md`。以下保留原始診斷。

CLAUDE.md 目前沒有壓縮指示。官方建議在 CLAUDE.md 裡指定壓縮時要保留什麼，否則 auto-compact 會按自己的判斷摘要，而本專案 TDD 流程有**特別怕丟的東西**：紅燈 hash 是 PR 的證據，`docs/plans/<slug>/` 的階段狀態是 rehydrate 的依據。

```markdown
## Compact instructions

壓縮時務必保留：當前 feature slug 與階段編號、紅燈 commit hash、
改動過的檔案清單、最後一次 `npm run check` 的結果、`docs/plans/<slug>/`
下已寫入的檔案路徑。細節可捨——它們都能從那些檔案重讀。
```

約 6 行成本，換掉「壓縮後不知道自己在第幾階段、紅燈 hash 是哪個」這種需要重新摸索的情況。

### ~~P2~~ ✅ 已套用 —— 模型分級與 effort 規範

> 已加進 `CLAUDE.md`（而非 `/fix-bug` skill——模型選擇對功能開發同樣適用，
> 只放在修 bug 的流程裡會在做功能時缺席）。以下保留原始診斷。

CLAUDE.md 有完整的流程分級（表層錯走簡版、行為級 bug 走完整版），但**沒有對應的模型/推理分級**。thinking token 以 output 計價，而本專案的任務跨度很大：

| 任務類型 | 建議 |
| --- | --- |
| 改 UI 文案、加 log、修 typo | Sonnet + `/effort` 降級 |
| 一般功能實作、修 bug | Sonnet |
| `api/index.ts` 路由拆分、獎勵/金流規則、跨層契約變更 | Opus |
| 四個審查 subagent | Sonnet（見 P1） |

`/fix-bug` skill 的「0. 分級」段落是最自然的落點——那裡已經在做比例原則的判斷。

### ~~P2~~ ⚠️ 部分套用 —— MCP 精簡與 `/context` 習慣

> `/context` 習慣與「優先用 CLI」的規範已寫進 `CLAUDE.md`。**關閉 MCP server
> 本身做不到**——那是使用者端的 client 設定（`/mcp`），不在 repo 內。
> 以下保留原始診斷。

本 session 連了 8 台 MCP server（GitHub、Supabase、Figma、Cloudflare、Atlassian、Gmail、Calendar、Drive）。schema 預設 deferred（只有名稱進 context），但工具清單本身是固定開銷，且擴大誤用面。對本 repo：保留 GitHub（web 環境無 `gh` CLI）與 Supabase；Figma / Cloudflare 按需開；Atlassian / Gmail / Calendar / Drive 關掉。

搭配習慣：**遇到「感覺變慢/變笨」時先跑 `/context`**看誰吃掉了空間，而不是直接 `/compact`（後者本身是一次大請求）。這條值得寫進 CLAUDE.md 的糾偏 SOP。

---

## 五、架構：把原則收斂成可執行的結構

前四節是診斷與逐項處置。這一節是把它們收斂成一個**控制系統**——有致動器、
有感測器、有設定點。沒有感測器的致動器會在幾個月內默默失效而無人察覺
（`changes` 路徑過濾就是活例子），所以第五層不是裝飾。

### 5.1 分層：依「相對於決策時點的位置」切

| 層 | 作用 | 本 repo 的實作 |
|---|---|---|
| **① 准入** | 能不能進 context | `permissions.deny`（`.env` / `supabase/.temp` / `docs/blackbox` / 兩個 lockfile）——成本 0，被擋的內容從未進入 |
| **② 投遞** | 什麼時候到手 | `CLAUDE.md`（每 session）、`.claude/rules` + `paths:`（條件）、skills（按需）、subagent（隔離） |
| **③ 壓縮** | 已產生的輸出如何進來 | **PreToolUse hook** `check-output-filter.py`（Claude 執行的指令）、`lib-quiet.sh`（`git commit` 觸發的 pre-commit，不在 hook 範圍內） |
| **④ 結構** | 最小理解單元多大 | `api/index.ts` 的區段地圖（緩解）；拆模組（根本解，未做） |
| **⑤ 觀測** | 上面四層還在不在運作 | `check-context-budget.py` 及既有四支 canary |

依「時點」切而不是依「功能」切，是因為**同一份知識放錯層就完全失效**：
`api/index.ts` 的區段地圖放進 `docs/` 是零效果（永遠不會在該用的那一刻被讀到），
放進 `CLAUDE.md` 是每個 session 都付費，放進 paths-scoped rule 才是恰好命中。

### 5.2 四條不變式：品質不降低的形式化保證

任何新機制進來前必須先過這四條。它們是可測的。

**I1 保真性** —— 只移除冗餘，絕不移除承重訊號。
> 判準：一則資訊是承重的，若且唯若它缺席時下一個決策會改變。
> 測法：exit code 原樣傳遞，且**用非 1 的退出碼驗**（現行測試用 3 與 7），
> 證明傳的是原始碼而不是「某個非零值」。

**I2 自證性** —— 機制失效時必須有東西變紅。
> 測法：突變測試——拿掉機制，對應閘門必須立刻紅。
> **答不出「它默默失效時什麼會變紅」就先別加。**

**I3 可繞過且已告知** —— 壓縮要有取回完整資訊的路徑，且該路徑與機制的存在
本身都要在 agent 的 context 裡。
> 少了「已告知」，Claude 會為了確認而重跑 → 機制製造它要省的成本。
> 現行：`| tail -80`（filter）、`PRE_COMMIT_VERBOSE=1`（pre-commit），兩者都寫進 CLAUDE.md。

**I4 人機同利** —— 對人不能變差，否則會在某個趕時間的下午被繞過。

### 5.3 放置演算法：新知識該落在哪裡

依序問，第一個 yes 就是答案：

1. 能從 codebase 推導出來嗎？ → **不要寫**（寫了就是重複真相來源）
2. 要管的是**行為**還是**知識**？ → 行為走下方 B 表（hook / deny），知識往下走
3. 只在特定路徑下相關嗎？ → `.claude/rules` + `paths:`
4. 是多步驟流程、只在被叫到時才需要？ → skill
5. 每個 session 都需要，且缺了 Claude 會犯錯？ → `CLAUDE.md`
6. 以上皆非 → **不要寫**

第 2 步是分岔而不是選項，因為**知識與行為的成本函數根本不同類**：知識的成本是
「每 session 付幾次」，行為攔截的成本是「觸發次數 × 輸出量」。混在同一張表裡，
hook 會沒有欄位可填而被擠掉——這份文件初版就犯了這個錯。

#### A 表・知識放置

| 落點 | 成本函數 | 適合 |
|---|---|---|
| `.claude/rules` + `paths:` | N × 相關 session | 分區慣例、單體檔導航 |
| skill | N × 被呼叫次數（frontmatter 仍每 session 付） | 多步驟 SOP |
| `CLAUDE.md` | **N × 每個 session** | 猜不到的指令、跨區慣例 |
| subagent | 獨立 window，只回摘要（frontmatter 仍每 session 付） | 高輸出量探索 |

> skill 與 agent 的 **frontmatter**（`name` + `description`）每個 session 都在
> context 裡——那是 Claude 決定「何時該叫哪一個」的依據。所以 description 要短而
> 準：太長是每 session 的固定支出，太模糊則永遠不會被正確觸發。本 repo 這部分
> 目前約 717 tokens，已納入 C1 計算。

#### B 表・行為攔截

| 落點 | 何時作用 | token 意義 |
|---|---|---|
| `permissions.deny` | 讀取發生前 | **成本 0**——被擋的內容從未進入 context。「絕不該讀」的唯一正解 |
| `PreToolUse` hook | 指令執行前 | 可 deny，也可**改寫輸入**（`updatedInput`）。`check-output-filter.py` 就是靠這個把驗證指令包裝成「綠燈只回一行」 |
| `PostToolUse` hook | 工具回傳後 | 可處理輸出。本 repo **未使用**——目前的輸出治理都在 PreToolUse 改寫指令那一側 |
| `SessionStart` hook | session 開場 | **它的 stdout 會直接進 context**，等於是可程式化的啟動成本。`session-bootstrap.sh` 因此刻意在順利路徑上完全安靜——那不是禮貌，是設計 |

**選 deny 還是 hook**：目標是「檔案不該被讀」用 `permissions.deny`（成本 0 且無法
繞過）；目標是「指令的行為要改變」才用 hook。把該用 deny 的寫成 hook 是多餘的
複雜度，把該用 deny 的寫進 `CLAUDE.md` 則是最常見的錯配——它讀起來像規則，實際
只是祈願。`docs/blackbox/` 那條原本就是這樣。

⚠️ **同一個 matcher 上有多個 hook 時**，回報 `permissionDecision: allow` 有可能
蓋掉另一個 hook 的 `deny`。`check-output-filter.py` 因此先問過 `bash-guard.decide()`，
它要擋的指令一律不出手——這是安全條件，不是最佳化。

### 5.4 預算模型（`check-context-budget.py` 的依據）

| 區塊 | 目標 | 機械把關 |
|---|---|---|
| 啟動固定成本（CLAUDE.md + 無 `paths:` 的 rules） | < 5% window（10,000 tok） | **C1 硬擋** |
| 工作集（當前任務要讀的檔案） | < 40% window | — |
| 單檔上限 | < 10% window（20,000 tok）＝工作集的 1/4 | **C2 軟警戒** |
| rule 的 `paths:` 必須匹配到檔案 | — | **C3 硬擋**（匹配不到＝死設定） |

token 數為 **CJK 感知估算**（CJK 約 1 token/字元，其餘約 4 字元/token）。
相較常見的 `bytes/4`，本 repo 實測差 +6%（程式碼）到 +16%（中文文件）——
因為 CJK 在 UTF-8 是 3 bytes，`bytes/4` 會低估。**仍是估算不是真值**
（本環境無 Anthropic API key，無法做真實 tokenizer 計數），所以閾值都留了
寬裕，需要精確數字時看 `/context`。

### 5.5 刻意不做的事

- **不做量化節流**（「最多讀 N 檔」）——違反 I4，會把 agent 逼去猜，
  那才是真正會降低品質的路。目標從來不是「讀更少」，是「讀得更準」。
- **不追求 agent 自律**——Claude 對自己的 context 用量是盲的，沒有本體感覺。
  所有設計都假設它不會、也不需要自己判斷。
- **不管 MCP server 開關**——使用者端 `/mcp` 設定，repo 內只能寫下規範。
- **不解決 compaction 失真**——只能用 compact instructions 降低代價。

## 五、優先順序總結

| 優先 | 動作 | 落點 | 成本 | 預期效果 |
| --- | --- | --- | --- | --- |
| ~~P0~~ ✅ | `api/index.ts` 路由導航（grep 定位 + 分區表） | `.claude/rules/supabase-functions.md`（已 paths-scoped） | 30 分鐘 | 後端任務省 ≈ 25,000 tok；前端 session 零成本 |
| ~~P0~~ ✅ | `npm run check` 輸出過濾 hook | 新增 `.claude/hooks/check-output-filter.py` + settings.json Bash matcher | 1 小時（含 `test-hooks.py` 案例） | 最高頻漏點：綠燈輸出從數千壓到數十 tok |
| ~~P1~~ ✅ | 4 個審查 subagent 加 `model: sonnet` | `.claude/agents/*.md` | 5 分鐘 + 一次比對試跑 | 每 feature 8 次扇出的單位成本下降 |
| ~~P1~~ ✅ | `docs/blackbox/` 曾加進 `permissions.deny`，後改為整個目錄刪除（PR #115） | 目錄已刪除，deny 規則隨之移除 | 1 分鐘（deny）+ 刪除 | 消除 14,100 tok 的搜尋陷阱，且不再需要持續管理 |
| ~~P1~~ ✅ | `changes` job 補 `predicate-quantifier: every` | `.github/workflows/ci.yml` | 1 行 + 雙向驗證 | **已修（PR #113，已合併）**：純文件 PR 不再燒四軌 runner |
| ~~P2~~ ✅ | pre-commit 綠燈安靜化（`lib-quiet.sh` + `run_gate`） | `scripts/git-hooks/` | 抽包裝器 + 9 條案例 | **已套用**：每次 commit 省下 200+ 行 biome warning |
| ~~P2~~ ✅ | CLAUDE.md 補 compact instructions | `CLAUDE.md` | 10 分鐘 | 壓縮後不再遺失階段/紅燈 hash |
| ~~P2~~ ✅ | 模型與 effort 分級 | `CLAUDE.md`（不是 `/fix-bug`——見該節） | 20 分鐘 | thinking token 對齊任務難度 |
| ~~P2~~ ⚠️ | MCP 精簡 + `/context` 習慣 | `CLAUDE.md`（關 server 需使用者端操作） | 10 分鐘 | 縮小工具清單與誤用面 |
| **P2** | 拆分 `api/index.ts` 為領域路由模組 | `supabase/functions/api/routes/` | 半天 + 全綠 | **未做**：碰金流·會籍，依 CLAUDE.md 需走 `/plan-feature` → `/review-plan` → 人審 → `/tdd-implement`；且本機無 deno/supabase 無法驗證（見下節） |

**兩個 P0 加起來約 1.5 小時，覆蓋了目前最大的單次漏點（30.9k tok 的單體檔）與最高頻的重複漏點（每次 `npm run check`）。**

值得強調的是：`develop` 上「專案配置層」的 best practice 幾乎全部做對了——CLAUDE.md 精簡、rules 有 `paths:` 條件載入、長 SOP 在 skill、subagent 工具面收緊、權限 allowlist、SessionStart 在順利路徑安靜。剩下的缺口集中在**輸出量治理**（沒有任何 hook 在過濾輸出）與**模型分級**（完全未規範）這兩處，而不是結構問題。

---

## 參考來源

- [Manage costs effectively — Claude Code Docs](https://code.claude.com/docs/en/costs)
- [Best practices for Claude Code — Claude Code Docs](https://code.claude.com/docs/en/best-practices)
- [How Claude remembers your project (CLAUDE.md / rules / auto memory)](https://code.claude.com/docs/en/memory)
- [Explore the context window](https://code.claude.com/docs/en/context-window)
- [Effective context engineering for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
