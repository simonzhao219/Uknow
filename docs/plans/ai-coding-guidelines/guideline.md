# AI Coding Guideline（草案 v0.1）

> 本規範針對「用 AI（如 Claude Code）產出程式碼」的開發流程，解決三個
> 實際痛點：**沒人 review code、寫一大坨就上 PR、聲稱測試都過但涵蓋不夠**。
> 結構分三部分：Part 1 單頁原則（給所有人）、Part 2 官方文件與相關文獻的
> 最佳機制（規範依據）、Part 3 我們的範例專案「EP實作」的對應範例與未來
> 優化（落地參考）。
>
> 不熟的名詞（hook、subagent、Plan Mode…）見文末〈附錄：名詞速查〉，
> 每個都有一句話說明與延伸閱讀連結。

---

## Part 1：單頁原則

### 三條元原則

1. **瓶頸是驗證器，不是模型**——AI 產碼速度已超過我們驗證它的速度。
   規範的每一條都應該回答「這讓驗證變強了嗎」，而不是「這限制了 AI 什麼」。
2. **證據不是聲稱**——「做完了」「測試都過」一律不可採信；可採信的是
   獨立於作者之外的檢驗來源（測試套件、CI、覆蓋率數字）的輸出，與可查驗
   的證據鏈（紅燈 commit、CI 連結、部署版本比對）。
3. **寫在文件裡的約定會衰減，必守規則要機械承載**——重要規則放進
   hook／CI／合併規則（ruleset），讓它「做不到」而不是「不該做」；
   而且承載規則的閘門自己也要被驗證（改壞它要會紅）。

### 十一條行為準則

| # | 準則 | 一句話理由 |
|---|---|---|
| 1 | **計畫先行**：範圍不確定、跨多檔、或不熟的程式碼，先讓 AI 出計畫、人審過才實作（用 Plan Mode）；一句話能描述的 diff 可直接做 | 攔截點放在最便宜的階段——改計畫比改一坨程式碼便宜 |
| 2 | **小步交付**：PR 一句話描述不了就拆；一個 PR 一個邏輯功能 | 審得動的 PR 才有真審查；巨型 PR 只會得到橡皮圖章 |
| 3 | **測試先紅後綠**：AI 實作走 TDD——先寫會失敗的測試、確認真的紅、把紅燈測試 commit 起來，再實作到綠 | 紅燈 commit 是證據：AI 若改測試遷就實作，diff 會揭露 |
| 4 | **PR 必附證據**：測試輸出或 CI 連結、覆蓋率變化；只寫「測試都過」＝未完成 | 元原則 2 的落地；審查者看證據比重跑驗證快 |
| 5 | **AI 找碴＋人裁決**：每個 PR 先過 AI 審查（結論附在 PR 上），再由兩位 reviewer 裁決；人不對 AI 沒看過的 diff 簽名 | AI 審查便宜可大量做，但從不核准——裁決永遠是人的事 |
| 6 | **退回有正當性**：未附 AI 審查結論與測試證據、或規模審不動的 PR，reviewer 應直接退回，不是硬著頭皮審 | 橡皮圖章的根源是「退回沒有正當性」；這條給 reviewer 撐腰 |
| 7 | **必守規則機械化**：同一條約定被違反第二次，就升級成 hook／CI 檢查／ruleset，不再靠提醒 | AI 與人都會忽略提示層規則；機器不會 |
| 8 | **閘門也要驗證**：新增任何自動檢查，要證明「故意改壞它會紅」（突變驗證）；寫檢查前先問「它空轉時看起來像什麼」 | 看起來在跑、實際空轉的檢查比沒有檢查更危險 |
| 9 | **品質指標只准向好**：測試覆蓋率門檻由 CI 持有、只准調高；要調低必須在 PR 寫明理由給人裁決 | 防止測試量在「都有過 CI」的表象下無聲退步 |
| 10 | **Context 衛生**：換任務就清空對話（`/clear`）；同一錯誤糾正兩次還錯就重開並改寫初始提示；CLAUDE.md 保持 200 行內 | AI 的腦容量（context）塞滿會變笨——官方多數最佳實踐都源自這個限制 |
| 11 | **防線回填**：每個漏到線上的 bug，修復時必答「為什麼既有的測試／CI／hook 沒攔到」，並把答案變成新防線 | 讓每次漏網自動強化系統，而不是只修這一次 |

### 三個痛點 → 準則對照

| 痛點 | 對應準則 |
|---|---|
| 沒人 review code | #5 AI 找碴＋人裁決、#6 退回有正當性、#4 必附證據 |
| 寫一大坨就上 PR | #1 計畫先行、#2 小步交付、#6 退回有正當性 |
| 聲稱測試都過但涵蓋不夠 | #3 先紅後綠、#4 必附證據、#9 指標只准向好 |

---

## Part 2：官方文件與相關文獻的最佳機制

以下每個機制附官方英文原文與出處，是 Part 1 各準則的依據。
（引句均逐字核對自 [code.claude.com 官方文件](https://code.claude.com/docs/en/best-practices)；
標〔部落格〕者出自 Anthropic 工程部落格，經搜尋交叉確認。）

### 2.1 給 AI 一個能自己跑的驗證迴圈（→ 準則 3、4）

AI 判斷「做完了」的預設依據是「看起來完成」；給它一個會回報紅綠的檢查
（測試、build、lint、截圖比對），它才能自我迭代、人才不用當人肉驗證器：

> "Claude stops when the work looks done. Without a check it can run, 'looks
> done' is the only signal available, and you become the verification loop:
> every mistake waits for you to notice it. Give Claude something that
> produces a pass or fail, and the loop closes on its own."
> — [Best practices › Give Claude a way to verify its work](https://code.claude.com/docs/en/best-practices)

成果要求出示證據而非宣稱成功：

> "Have Claude show evidence rather than asserting success: the test output,
> the command it ran and what it returned, or a screenshot of the result."
> — 同上

官方也點名了不驗證就出貨的反模式：

> "**The trust-then-verify gap.** Claude produces a plausible-looking
> implementation that doesn't handle edge cases. **Fix**: Always provide
> verification (tests, scripts, screenshots). If you can't verify it, don't
> ship it." — [Best practices › Avoid common failure patterns](https://code.claude.com/docs/en/best-practices)

### 2.2 計畫先行、探索與實作分離（→ 準則 1、2）

Plan Mode（AI 唯讀、只能提計畫，人核准才放行實作）是官方推薦工作流
Explore → Plan → Implement → Commit 的支點：

> "Letting Claude jump straight to coding can produce code that solves the
> wrong problem. Use plan mode to separate exploration from execution."
> — [Best practices › Explore first, then plan, then code](https://code.claude.com/docs/en/best-practices)

何時可以跳過計畫，官方給了清楚的判準（同時也是「PR 該多小」的判準）：

> "Planning is most useful when you're uncertain about the approach, when the
> change modifies multiple files, or when you're unfamiliar with the code
> being modified. If you could describe the diff in one sentence, skip the
> plan." — 同上

### 2.3 TDD：先紅、commit、再綠（→ 準則 3）

〔部落格〕官方把 TDD 列為 agentic coding 的最強模式之一，關鍵動作是
**把紅燈測試先 commit 起來**，讓「AI 改測試遷就實作」無所遁形：

> "Ask Claude to write tests based on expected input/output pairs. Be
> explicit about the fact that you're doing test-driven development so that
> it avoids creating mock implementations, even for functionality that
> doesn't exist yet in the codebase."
> — [Claude Code Best Practices（部落格）](https://www.anthropic.com/engineering/claude-code-best-practices)

> "Ask Claude to commit the tests when it's satisfied with them." — 同上

### 2.4 獨立審查：AI 找碴、人裁決（→ 準則 5、6）

審查者必須是**乾淨腦袋**（fresh context 的 subagent 或另一個 session），
不能讓寫碼的那個 AI 自己審自己：

> "A fresh context improves code review since Claude won't be biased toward
> code it just wrote."
> — [Best practices › Run multiple Claude sessions](https://code.claude.com/docs/en/best-practices)

> "...a verification subagent ... has a fresh model try to refute the result,
> so the agent doing the work isn't the one grading it." — 同上

官方的 [Code Review](https://code.claude.com/docs/en/code-review) 產品
（多個特化 AI 並行審 PR、驗證後才留言）把「AI 不做裁決」寫死在設計裡：

> "Findings are tagged by severity and don't approve or block your PR, so
> existing review workflows stay intact."

> "The check run always completes with a neutral conclusion so it never
> blocks merging through branch protection rules."

同時官方警告：被要求找問題的 AI 審查者一定找得出問題，別把每條發現都
當聖旨（過度工程的來源）：

> "A reviewer prompted to find gaps will usually report some, even when the
> work is sound, because that is what it was asked to do. Chasing every
> finding leads to over-engineering."
> — [Best practices › Add an adversarial review step](https://code.claude.com/docs/en/best-practices)

### 2.5 機械守衛：必守規則不靠提示（→ 準則 7）

hook（掛在 AI 工作流程固定節點自動跑的腳本）與提示層規則的本質差異：

> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic
> and guarantee the action happens."
> — [Best practices › Set up hooks](https://code.claude.com/docs/en/best-practices)

> "Settings rules are enforced by the client regardless of what Claude
> decides to do. CLAUDE.md instructions shape Claude's behavior but are not a
> hard enforcement layer."
> — [Memory › Manage CLAUDE.md for large teams](https://code.claude.com/docs/en/memory)

權限預設從嚴、責任在人（→ 準則 5 的「人不對沒看過的 diff 簽名」）：

> "Claude Code only has the permissions you grant it. You're responsible for
> reviewing proposed code and commands for safety before approval."
> — [Security](https://code.claude.com/docs/en/security)

有副作用的自動化工作流程，官方明講要鎖成「只有人能觸發」：

> "Use `disable-model-invocation: true` for workflows with side effects that
> you want to trigger manually."
> — [Best practices › Create skills](https://code.claude.com/docs/en/best-practices)

### 2.6 Context 衛生（→ 準則 10）

> "Most best practices are based on one constraint: Claude's context window
> fills up fast, and performance degrades as it fills."
> — [Best practices](https://code.claude.com/docs/en/best-practices)

> "Keep it concise. For each line, ask: *'Would removing this cause Claude to
> make mistakes?'* If not, cut it. Bloated CLAUDE.md files cause Claude to
> ignore your actual instructions!" — 同上（CLAUDE.md 的行數判準：
> "target under 200 lines"，出自 [Memory](https://code.claude.com/docs/en/memory)）

> "If you've corrected Claude more than twice on the same issue in one
> session, the context is cluttered with failed approaches. Run `/clear` and
> start fresh with a more specific prompt that incorporates what you learned."
> — 同上

### 2.7 前沿：Loop / Evaluation / Observability（→ 準則 8、11 的延伸）

（社群前沿，非官方文件：Addy Osmani "[Loop
Engineering](https://www.oreilly.com/radar/loop-engineering/)"，2026-06。）
核心主張：與其一句句提示 AI，不如設計「什麼觸發 AI、誰驗證產出、何時
停止」的迴路。對規範最有用的三點：

1. 任何**無人值守**的 AI 自動化，必備四個控制：迭代上限、預算上限、
   agent 自己能評估的成功條件、失敗升級路徑——缺一不放手。
2. 依賴順序：**先觀測（量得到）→ 再評估（有基準）→ 才自動化**；
   你不能自動化一個你量不到的東西。
3. 感測器（量測設施）的失效是靜默的——閘門壞了會擋住人，感測器壞了
   只是不再記錄；量測設施需要的機械驗證比閘門更多。

---

## Part 3：EP實作的對應範例、更仔細之處、未來優化

EP實作是我們的範例專案（單人＋AI 開發），把 Part 2 的機制全部落了地，
並在幾處走得比官方基線更遠。以下對應供各專案導入時參考；檔案路徑為
EP實作 repo 內的相對路徑。

### 3.1 官方機制 → EP實作落地對照

| 官方機制（Part 2） | EP實作的落地 | 關鍵檔案／範例 |
|---|---|---|
| 驗證迴圈（2.1） | 統一閘門 `npm run check`（lint＋型別＋測試＋死碼偵測），pre-commit 強制紅燈擋 commit | `package.json`、`scripts/git-hooks/pre-commit` |
| 計畫先行（2.2） | 三段式流程：`/plan-feature` 規劃 → `/review-plan` AI 四視角審 → **停等人審** → 人親自啟動實作；且 hook 機械擋「沒有規劃書就寫產品碼」 | `.claude/skills/plan-feature/`、`.claude/hooks/feature-plan-guard.py` |
| TDD 先紅後綠（2.3） | 紅燈期上鎖：紅燈測試 commit（`test(red)`）後建立鎖檔，期間 hook **禁止編輯測試檔**；唯一解鎖路徑是 check 全綠 | `.claude/hooks/tdd-test-guard.py`、`scripts/tdd-unlock.sh` |
| 獨立審查（2.4） | 四個唯讀、乾淨腦袋的 reviewer subagent（系統／架構／UIUX／需求視角），輸出契約統一 P0（阻擋）／P1（應改）／P2（建議）；彙整者明文禁止改判 | `.claude/agents/plan-reviewer-*.md`、`docs/_templates/review.md` |
| 機械守衛（2.5） | 9 支 hook 擋 git 後門（`--no-verify`、force push、直推主幹）、TDD 相位違規、無規劃寫碼；實作 skill 設 `disable-model-invocation: true`——AI 無法自己啟動實作 | `.claude/hooks/bash-guard.py`、`.claude/skills/tdd-implement/SKILL.md` |
| Context 衛生（2.6） | CLAUDE.md 維持 200 行內，且用腳本把「啟動固定成本上限」變成 CI 檢查 | `scripts/check-context-budget.py` |
| 部署驗證（2.1 延伸） | 部署後打 `/api/health` 比對 git commit sha，確認線上跑的就是這個版本；正式站部署需人工核准 | `.github/workflows/deploy-supabase.yml` |
| 觀測／評估（2.7） | 每次 hook 決策記錄成 metrics（誤擋率、命中率），隨 commit 進 git 可彙總 | `.claude/hooks/decision_log.py`、`scripts/harness-metrics.py` |

### 3.2 EP實作走得比官方基線更仔細的五件事

1. **「約定會被忽略」當設計公理**：官方說必守規則用 hook 承載；EP實作
   進一步形成方法論——**被違反過的約定就升級成機械檢查**（防線回填），
   並用 friction-log（摩擦日誌）追蹤誤擋與漏網、每雙週整併成框架修訂。
   範例：`git commit --no-verify` 曾是繞過檢查的口子 → 現在被 hook 直接擋。
2. **審查獨立性的結構化**：官方說「用乾淨 context 審」；EP實作加上
   視角分工（四視角各查各的）、嚴重度契約（P0 未處置不得進實作）、
   「主彙整者禁止改判」、「需求對不到規格書＝一律 P0」等硬規則。
3. **閘門的閘門**：所有自撰檢查器都先跑自己的測試案例再實掃；hook 行為
   有表格化測試（`scripts/test-hooks.py`）；新增檢查要求**突變驗證**
   （證明改壞它會紅）。實證：某次改版抓到 12 條突變中 2 條「檢查看起來
   在跑、實際空轉」——這層若不存在，兩個假檢查會永遠綠著。
4. **全程證據鏈**：紅燈 commit hash 是 TDD 的證據；PR 範本要求附規劃／
   審查結論；覆蓋率門檻是「棘輪」（只准向上）；journey 測試套件設計成
   「不可能假綠」（連不上就硬失敗、情境數低於下限就硬失敗——源自一次
   「27 個情境全 skip 卻顯示全綠」的真實事故）。
5. **流程自身有迭代迴圈**：hook 決策量測＋friction-log＋定期框架修訂 PR
   ——規範跟程式碼一樣有 bug、要量測、要修，不是寫完就完。

### 3.3 未來要導入的優化

**EP實作自身**（依優先序）：

| 優先 | 項目 | 補什麼縫 |
|---|---|---|
| P1 | 覆蓋率棘輪的「只准調高」目前是註解裡的約定——新增 CI 檢查：門檻被調低即紅，除非 PR 附豁免理由 | 測試閘門的參數可被寫碼方悄悄放鬆（正是痛點 3 的縫隙型態） |
| P1 | 合併規則（ruleset）加入人類 approve 要求（EP實作目前唯一 required check 是 CI） | AI 審查再強，人的裁決點也要機械要求——組織其他專案已有兩位 reviewer，EP實作應對齊 |
| P2 | PR 規模軟警戒：diff 超標時 CI 留言建議拆分（不硬擋——硬擋會逼出湊行數的壞行為） | 「小步交付」目前只是約定 |
| P2 | 試點官方 [Code Review](https://code.claude.com/docs/en/code-review)＋`REVIEW.md`（把 P0/P1/P2 語義翻譯過去），作為 PR 開啟後的第二道獨立防線 | 官方新功能未整合；注意其 check run 永遠中性、要 gate 需自行解析 |
| P3 | 外迴路建設依既定順序：感測器資料累積 → skill 觸發命中率評估 → 摩擦日誌整併排程化 → 第一條唯讀自動迴路（先補迭代與預算上限） | Loop/Eval/Observability 仍在初期（見 2.7 的依賴順序） |

**組織導入路徑建議**（各專案按成熟度分級採用；每級的達標判準是
「有機械承載」，不是「已宣導」）：

- **L0（一天）**：精簡 CLAUDE.md（≤200 行）＋PR 範本要求測試證據＋
  既有兩位 reviewer 制度寫進 ruleset（required approvals＋CI 綠才可合併）
  ——三個痛點的最低配。
- **L1（一週）**：pre-commit 統一閘門（lint＋型別＋測試）且擋繞過手段；
  CI 單一匯總 required check；覆蓋率門檻。
- **L2（一個月）**：計畫先行（Plan Mode 或 plan 檔＋人審）；TDD 紅燈
  證據 commit；AI 多視角審查＋嚴重度契約（P0 阻擋語義）。
- **L3（持續）**：防線回填；friction-log；閘門自檢＋突變驗證；棘輪指標。
- **L4（前沿，選配）**：先觀測、再評估、才自動化；無人值守迴路必備
  四控制（迭代上限、預算上限、可自評的成功條件、失敗升級路徑）。

推行方式：找 1–2 個種子團隊照 L0→L1 跑出成功案例再擴散；指定 DRI
（明確負責人）維護組織層 `.claude/` 共用資產；每季回訪剪枝——規則太多
會互相稀釋，這點對本規範自身同樣成立。

---

## 附錄：名詞速查

| 名詞 | 一句話說明 | 延伸閱讀 |
|---|---|---|
| **AI Native Engineering** | 把 AI agent 當成主要的寫碼勞動力、人類轉為負責「決策、審查、驗證」的工程方法論（業界通稱，尚無單一官方定義） | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Claude Code** | Anthropic 官方的 AI 開發代理：在終端機／網頁裡讀你的程式碼、跑指令、改檔案、自己迭代到任務完成 | [官方總覽](https://code.claude.com/docs/en/overview) |
| **Agentic coding / agent** | AI 不只「回答問題」，而是自主連續行動（讀檔→改碼→跑測試→修正）直到完成任務的工作型態 | [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works) |
| **Harness** | 圍繞 AI 搭起來的整套工作環境（工具、權限、守衛腳本、CI），決定 AI 能做什麼、不能做什麼 | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Context window** | 模型單次能「記在腦中」的內容上限（對話＋讀過的檔案），塞太滿表現會下降 | [Context window](https://code.claude.com/docs/en/context-window) |
| **CLAUDE.md** | 放在 repo 裡、AI 每次開工都自動讀的「專案說明書」；屬於「建議」層級，AI 可能忽略 | [Memory](https://code.claude.com/docs/en/memory) |
| **Plan Mode** | Claude Code 的唯讀模式：AI 只能讀檔和提出計畫，人核准後才放行實作 | [Permission modes](https://code.claude.com/docs/en/permission-modes) |
| **Hook** | 掛在 AI 工作流程固定節點（如「執行指令前」）自動跑的腳本——保證執行、不靠 AI 自覺 | [Hooks guide](https://code.claude.com/docs/en/hooks-guide) |
| **Subagent** | 派出去的「分身」AI：在獨立乾淨腦袋裡做探查或審查、只回報結論 | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| **Skill / slash command** | 打包成檔案、可用 `/名字` 呼叫的可重複工作流程，可設定成「只有人能觸發」 | [Skills](https://code.claude.com/docs/en/skills) |
| **Permission / allowlist / deny** | Claude Code 的權限系統：預設唯讀、有動作要人核准；白名單放行安全指令、deny 封鎖敏感檔案 | [Permissions](https://code.claude.com/docs/en/permissions) |
| **Headless mode（`claude -p`）** | 不開互動介面、一條指令執行完的模式，用來把 AI 塞進 CI 或腳本 | [Non-interactive mode](https://code.claude.com/docs/en/headless) |
| **Code Review（官方功能）** | Anthropic 的 PR 自動審查服務：多個特化 AI 並行找碴、驗證後留言，但從不核准也不擋合併 | [Code Review](https://code.claude.com/docs/en/code-review) |
| **REVIEW.md** | 放在 repo 根目錄、專門指揮審查 AI 的最高優先指示檔 | [Code Review › REVIEW.md](https://code.claude.com/docs/en/code-review#review-md) |
| **MCP** | 讓 AI 連接外部工具（GitHub、資料庫…）的開放標準 | [MCP](https://code.claude.com/docs/en/mcp) |
| **TDD（測試驅動開發）** | 先寫「會失敗的測試」定義正確行為，再寫實作讓它變綠——紅綠燈給 AI 明確的自我驗證訊號 | [Best Practices（部落格）](https://www.anthropic.com/engineering/claude-code-best-practices) |
| **覆蓋率棘輪（coverage ratchet）** | 測試覆蓋率門檻「只准調高、不准調低」的機制（棘輪＝只朝一個方向轉的齒輪） | EP實作 `vitest.config.ts` 的做法 |
| **pre-commit hook（git）** | git 原生機制：commit 前自動跑檢查、紅燈就擋（與 Claude Code 的 hook 是兩套東西） | [Git Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks) |
| **CI / required check / ruleset** | CI＝每次 push 自動跑的檢查流水線；ruleset＝GitHub 上「哪些檢查必須綠、要幾個 approve 才准合併」的強制設定 | [GitHub: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) |
| **Loop Engineering** | 與其一句句提示 AI，不如設計「什麼觸發 AI、誰驗證產出、何時停止」的自動迴路（2026 興起） | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Evaluation / Observability（對 agent）** | 對 AI 行為本身的量測（多常做對？）與觀測（實際做了什麼？）——自動化放手前的前提 | 同上 |
| **P0 / P1 / P2** | 審查發現的嚴重度分級：P0＝阻擋（不修不准前進）、P1＝應改、P2＝建議 | EP實作 `docs/_templates/review.md` |

---

*依據與完整比較分析見同目錄 `research.md`（官方引句逐字核對紀錄、
EP實作全機制盤點、逐項差距分析）。*
