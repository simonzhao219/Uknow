# AI Coding 規範前期研究：官方最佳實踐 × EP實作 × 差距與建議

> **這份文件是什麼**：為「制定組織級 AI coding 規範」做的前期研究。依序涵蓋 (1) Anthropic 官方文件的人機協作最佳實踐、(2) 我們的範例專案（下稱「**EP實作**」）的實際做法、(3) 兩者逐項比較、(4) 初擬優化建議。Guideline 本體的形式與內容待人工決定後另行撰寫。
>
> **組織現況補充**：EP實作是單人＋AI 的範例專案；組織**其他專案的 PR 已有固定兩位 reviewer 的人審制度**。因此本文建議的重點不是「從零建立人審」，而是讓既有的兩位 reviewer **審得動 AI 產出**（PR 附上 AI 審查結論與測試證據），並確認人審是機械強制而非慣例。
>
> **要解的三個痛點**（來自需求方主管的觀察）：
> 1. 沒有人在 review code
> 2. 寫一大坨就想上 PR
> 3. 聲稱 test 都沒問題，但 unit test 跑的項目根本不夠
>
> **鷹架聲明**：本檔屬 `docs/plans/` 鷹架（D 級），Guideline 定稿後應升級／刪除。
>
> **給第一次接觸這些概念的讀者**：本文件的推廣對象可能不熟 AI Native Engineering 或 Claude 的官方作法，所以 §0 提供全部專有名詞的一句話速查（附延伸閱讀連結），正文首次出現重要名詞時也會補行內說明。

---

## 0. 名詞速查（給第一次接觸的讀者）

每個名詞一句話講清楚它是什麼、為什麼在這份文件裡重要；想深入再點連結。

| 名詞 | 一句話說明 | 延伸閱讀 |
|---|---|---|
| **AI Native Engineering** | 把 AI agent 當成主要的寫碼勞動力、人類轉為負責「決策、審查、驗證」的工程方法論（業界通稱，尚無單一官方定義） | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Claude Code** | Anthropic 官方的 AI 開發代理：在終端機／網頁裡讀你的程式碼、跑指令、改檔案、自己迭代到任務完成 | [官方總覽](https://code.claude.com/docs/en/overview) |
| **Agentic coding / agent** | AI 不只「回答問題」，而是自主連續行動（讀檔→改碼→跑測試→修正）直到完成任務的工作型態 | [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works) |
| **Harness** | 圍繞 AI 搭起來的整套工作環境（工具、權限、守衛腳本、CI），決定 AI 能做什麼、不能做什麼——EP實作的 `.claude/` 目錄就是一套 harness | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Context window** | 模型單次能「記在腦中」的內容上限（對話＋讀過的檔案），塞太滿表現會下降——官方多數最佳實踐都源自這個限制 | [Context window](https://code.claude.com/docs/en/context-window) |
| **CLAUDE.md** | 放在 repo 裡、AI 每次開工都自動讀的「專案說明書」，寫團隊慣例與指令；屬於「建議」層級，AI 可能忽略 | [Memory](https://code.claude.com/docs/en/memory) |
| **Plan Mode** | Claude Code 的唯讀模式：AI 只能讀檔和提出計畫、不能改任何東西，人核准計畫後才放行實作 | [Permission modes](https://code.claude.com/docs/en/permission-modes) |
| **Hook** | 掛在 AI 工作流程固定節點（如「執行指令前」「回合結束時」）自動跑的腳本——保證執行、不靠 AI 自覺，是「必守規則」的承載處 | [Hooks guide](https://code.claude.com/docs/en/hooks-guide) |
| **Subagent** | 派出去的「分身」AI：在獨立的乾淨腦袋（context）裡做探查或審查、只回報結論——「寫碼者與審查者分離」的機制基礎 | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| **Skill / slash command** | 打包成檔案、可用 `/名字` 呼叫的可重複工作流程（如EP實作的 `/plan-feature`），可設定成「只有人能觸發」 | [Skills](https://code.claude.com/docs/en/skills) |
| **Permission / allowlist / deny** | Claude Code 的權限系統：預設唯讀、有動作要人核准；可用白名單放行安全指令、用 deny 封鎖敏感檔案 | [Permissions](https://code.claude.com/docs/en/permissions) |
| **Headless mode（`claude -p`）** | 不開互動介面、下一條指令就執行完的模式，用來把 AI 塞進 CI 或自動化腳本 | [Non-interactive mode](https://code.claude.com/docs/en/headless) |
| **Code Review（官方功能）** | Anthropic 的 PR 自動審查服務：多個特化 AI 並行找碴、驗證後在 PR 上留言，但從不核准也不擋合併——裁決留給人 | [Code Review](https://code.claude.com/docs/en/code-review) |
| **REVIEW.md** | 放在 repo 根目錄、專門指揮上述審查 AI 的最高優先指示檔（調整嚴重度定義、略過範圍等） | [Code Review › REVIEW.md](https://code.claude.com/docs/en/code-review#review-md) |
| **MCP** | Model Context Protocol：讓 AI 連接外部工具（GitHub、資料庫、Figma…）的開放標準 | [MCP](https://code.claude.com/docs/en/mcp) |
| **TDD（測試驅動開發）** | 先寫「會失敗的測試」定義正確行為，再寫實作讓它變綠；對 AI 特別有效——紅綠燈給了 AI 明確的自我驗證訊號 | [Claude Code Best Practices（部落格）](https://www.anthropic.com/engineering/claude-code-best-practices) |
| **覆蓋率棘輪（coverage ratchet）** | 測試覆蓋率門檻「只准調高、不准調低」的機制（棘輪＝只朝一個方向轉的齒輪），防止測試量無聲退步 | EP實作 `vitest.config.ts` 的做法（§2.6） |
| **pre-commit hook（git）** | git 原生機制：每次 commit 前自動跑檢查、紅燈就擋下 commit（注意：與上面 Claude Code 的 hook 是兩套東西） | [Git Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks) |
| **CI / required check / ruleset** | CI＝每次 push 自動跑的檢查流水線；required check 與 ruleset 是 GitHub 上「哪些檢查必須綠、要幾個人 approve 才准合併」的強制設定 | [GitHub: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) |
| **Loop Engineering** | 2026 年興起的觀念：與其一句句提示 AI，不如設計「什麼觸發 AI、誰驗證產出、何時停止」的自動迴路 | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Evaluation / Observability（對 agent）** | 對 AI 行為本身的量測（它多常做對？）與觀測（它實際做了什麼？）——想放手自動化之前的前提建設 | 同上（§1.9） |
| **P0 / P1 / P2** | EP實作審查發現的嚴重度分級：P0＝阻擋（不修不准前進）、P1＝應改、P2＝建議 | EP實作 `docs/_templates/review.md`（§2.4） |

---

## 1. Anthropic 官方最佳實踐整理

### 1.0 資訊信度說明（引句已逐一回查原文）

- **已直接抓取、逐字核對**的一手來源（以下英文引句均為原文複製）：[Best practices](https://code.claude.com/docs/en/best-practices)、[Hooks guide](https://code.claude.com/docs/en/hooks-guide)、[Memory / CLAUDE.md](https://code.claude.com/docs/en/memory)、[Security](https://code.claude.com/docs/en/security)、[Code Review](https://code.claude.com/docs/en/code-review)、[Common workflows](https://code.claude.com/docs/en/common-workflows)。
- **本環境網路無法直達**（egress proxy 封鎖 `www.anthropic.com` 與 `claude.com`）：工程部落格文章（[Claude Code Best Practices 部落格版](https://www.anthropic.com/engineering/claude-code-best-practices)、[Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)、How Anthropic teams use Claude Code）的引句以搜尋結果的原文片段交叉確認，下文標注〔搜尋交叉確認〕；寫進正式 Guideline 前建議再點開連結核對一次。
- 先前二手轉述流傳的**具體成效數字**（如「84% 的千行 PR 被找出問題」「實質審查評論 16%→54%」）在官方文件頁**查無此文**，本文件已剔除、不作為規範依據。官方文件中可引用的量化事實只有:「Each review averages \$15-25 in cost」與「completing in 20 minutes on average」（Code Review 頁）。

### 1.1 核心哲學：人做決策，AI 做執行，機器做把關

官方各文件反覆出現的三層結構：

| 層 | 負責 | 官方機制 |
|---|---|---|
| **決策**（做什麼、對不對、能不能上線） | 人 | Plan Mode 停等核可、PR 簽核、permission prompt |
| **執行**（怎麼做、寫碼、跑測試、自我迭代） | AI | agentic loop + 回饋迴圈（測試、lint、build） |
| **把關**（絕不允許的事） | 確定性程式 | hooks、permission deny、CI required checks |

官方對「靠叮嚀 vs 靠機制」的表態非常明確——提示層規則是建議性的，必守規則要用確定性程式承載：

> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."
> — [Best practices › Set up hooks](https://code.claude.com/docs/en/best-practices)

> "Hooks are user-defined shell commands. Claude Code runs them at specific points in its lifecycle, which gives you deterministic control: certain actions always happen rather than relying on the LLM to choose to run them."
> — [Hooks guide](https://code.claude.com/docs/en/hooks-guide)

> "Both are loaded at the start of every conversation. Claude treats them as context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook instead."
> — [Memory](https://code.claude.com/docs/en/memory)（指 CLAUDE.md 與 auto memory）

> "Use hooks for actions that must happen every time with zero exceptions."
> — [Best practices › Set up hooks](https://code.claude.com/docs/en/best-practices)

### 1.2 Explore → Plan → Code → Commit：計畫先行

官方推薦的四階段工作流（[Best practices › Explore first, then plan, then code](https://code.claude.com/docs/en/best-practices)：Explore → Plan → Implement → Commit，Plan Mode 下模型只能讀不能改）。病因診斷原文：

> "Letting Claude jump straight to coding can produce code that solves the wrong problem. Use plan mode to separate exploration from execution."

> "Separate research and planning from implementation to avoid solving the wrong problem."

這正是「寫一大坨就上 PR」的官方病因：不是 AI 寫太多，是沒有在便宜的階段（計畫）設人審點——改計畫比改一坨程式碼便宜得多。人在 Plan 階段可直接編輯計畫（"Press `Ctrl+G` to open the plan in your text editor for direct editing before Claude proceeds."）。何時可跳過計畫，官方也給了判準：

> "Planning is most useful when you're uncertain about the approach, when the change modifies multiple files, or when you're unfamiliar with the code being modified. If you could describe the diff in one sentence, skip the plan."

規格先行的大功能，官方建議先訪談出 spec、再開乾淨 session 實作：

> "Once the spec is complete, start a fresh session to execute it. ... The most useful specs are self-contained: they name the files and interfaces involved, state what is out of scope, and end with an end-to-end verification step that proves the feature works."
> — [Best practices › Let Claude interview you](https://code.claude.com/docs/en/best-practices)

任務切分層面，[Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) 給出可組合的分解模式（prompt chaining 步驟間插驗證閘、orchestrator-workers 動態拆子任務、parallelization 並行／多視角投票），總原則〔搜尋交叉確認〕：

> "Consistently, the most successful implementations use simple, composable patterns rather than complex frameworks."

### 1.3 TDD 與驗證紀律：證據，不是聲稱

**驗證迴圈是官方最佳實踐的第一原則**。[Best practices › Give Claude a way to verify its work](https://code.claude.com/docs/en/best-practices) 的原文，直接解釋了「聲稱 test 都沒問題」為什麼會發生：

> "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop: every mistake waits for you to notice it. Give Claude something that produces a pass or fail, and the loop closes on its own."

> "Give Claude a check it can run: tests, a build, a screenshot to compare. It's the difference between a session you watch and one you walk away from."

而且判準是**證據，不是聲稱**：

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching."

驗證的強度分級（同頁）：同一 prompt 內自驗 → 整個 session 的 `/goal` 條件 → Stop hook 確定性閘門 → 獨立 subagent 二次意見：

> "**By a second opinion**: a verification subagent or a dynamic workflow that checks its own findings has a fresh model try to refute the result, so the agent doing the work isn't the one grading it."

TDD 的具體操作出自 [Claude Code Best Practices 部落格版](https://www.anthropic.com/engineering/claude-code-best-practices)〔搜尋交叉確認；本環境無法直達原頁〕：

> "Ask Claude to write tests based on expected input/output pairs. Be explicit about the fact that you're doing test-driven development so that it avoids creating mock implementations, even for functionality that doesn't exist yet in the codebase."

> "Ask Claude to commit the tests when it's satisfied with them."

流程重點（同源）：先寫會失敗的測試 → **確認真的紅**（防「本來就會過」的假測試）→ **紅燈測試先 commit 當檢查點**（之後 AI 若改測試遷就實作，diff 會揭露）→ 實作到綠、不准動測試 → 人審時核對測試未被竄改。

對應痛點 3 的官方結論（[Best practices › Avoid common failure patterns](https://code.claude.com/docs/en/best-practices)）：

> "**The trust-then-verify gap.** Claude produces a plausible-looking implementation that doesn't handle edge cases. **Fix**: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."

### 1.4 Review：獨立視角、自動找碴、人做裁決

官方 [Code Review](https://code.claude.com/docs/en/code-review) 功能的設計，原文：

> "A fleet of specialized agents examine the code changes in the context of your full codebase, looking for logic errors, security vulnerabilities, broken edge cases, and subtle regressions."

> "Each agent looks for a different class of issue, then a verification step checks candidates against actual code behavior to filter out false positives. The results are deduplicated, ranked by severity, and posted as inline comments on the specific lines where issues were found."

**AI 找問題、人做裁決**——findings 從不核准也從不阻擋 PR：

> "Findings are tagged by severity and don't approve or block your PR, so existing review workflows stay intact."

> "The check run always completes with a neutral conclusion so it never blocks merging through branch protection rules. If you want to gate merges on Code Review findings, read the severity breakdown from the check run output in your own CI."

嚴重度定義（原文）：🔴 Important = "A bug that should be fixed before merging"；🟡 Nit = "A minor issue, worth fixing but not blocking"；🟣 Pre-existing = "A bug that exists in the codebase but was not introduced by this PR"。可用 `REVIEW.md` 客製（"Its contents are injected into the system prompt of every agent in the review pipeline as the highest-priority instruction block"）。

**審查者要用乾淨 context**（[Best practices › Run multiple Claude sessions](https://code.claude.com/docs/en/best-practices)）：

> "A fresh context improves code review since Claude won't be biased toward code it just wrote."

> "The longer Claude works unattended, the more an independent check matters before you count the work as done. A reviewer running in a fresh subagent context sees only the diff and the criteria you give it, not the reasoning that produced the change, so it evaluates the result on its own terms."
> — [Best practices › Add an adversarial review step](https://code.claude.com/docs/en/best-practices)

官方也警告 AI 審查的過度工程風險（規範裡值得原样引用）：

> "A reviewer prompted to find gaps will usually report some, even when the work is sound, because that is what it was asked to do. Chasing every finding leads to over-engineering. ... Tell the reviewer to flag only gaps that affect correctness or the stated requirements, and treat the rest as optional."

### 1.5 Context 管理：CLAUDE.md 是憲法，不是百科

整份 Best practices 的前提是 context 是稀缺資源：

> "Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills."
> — [Best practices](https://code.claude.com/docs/en/best-practices)

CLAUDE.md 應精簡，判準與行數上限都有原文：

> "Keep it concise. For each line, ask: *'Would removing this cause Claude to make mistakes?'* If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"
> — [Best practices › Write an effective CLAUDE.md](https://code.claude.com/docs/en/best-practices)

> "**Size**: target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."
> — [Memory › Write effective instructions](https://code.claude.com/docs/en/memory)

何時該加一條進 CLAUDE.md（[Memory](https://code.claude.com/docs/en/memory)）："Claude makes the same mistake a second time"、"A code review catches something Claude should have known about this codebase"、"You type the same correction or clarification into chat that you typed last session"。

階層式載入：managed policy（全組織）→ `~/.claude/CLAUDE.md`（個人）→ 專案根（進 git 與團隊共享）→ 子目錄（讀到該目錄檔案才載入）；另有 `.claude/rules/` 可用 `paths:` frontmatter 做 path-scoped 規則。

Context 衛生與糾偏（[Best practices › Course-correct early and often](https://code.claude.com/docs/en/best-practices)）：

> "If you've corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches. Run `/clear` and start fresh with a more specific prompt that incorporates what you learned. A clean session with a better prompt almost always outperforms a long session with accumulated corrections."

### 1.6 權限與安全邊界

預設從嚴（[Security](https://code.claude.com/docs/en/security)）：

> "Claude Code uses strict read-only permissions by default. When additional actions are needed (editing files, running tests, executing commands), Claude Code requests explicit permission."

責任歸屬在人——這條對「沒人 review」的痛點是直接引據：

> "Claude Code only has the permissions you grant it. You're responsible for reviewing proposed code and commands for safety before approval."

官方同時承認「逐一點核可」會退化成橡皮圖章，所以要用 allowlist／sandbox／auto mode 降噪、把人的注意力留給真正要緊的核可（[Best practices › Configure permissions](https://code.claude.com/docs/en/best-practices)）：

> "This is safe but tedious. After the tenth approval you're not really reviewing anymore, you're just clicking through."

自動化程度越高越要有兜底層，且沒有任何一層是萬靈丹：

> "While these protections significantly reduce risk, no system is completely immune to all attacks. Always maintain good security practices when working with any AI tool."
> — [Security](https://code.claude.com/docs/en/security)

權限模式是一條信任光譜（plan / default / acceptEdits / auto / dontAsk / bypassPermissions，見 [Permission modes](https://code.claude.com/docs/en/permission-modes)）；auto mode 的機制與邊界（[Best practices](https://code.claude.com/docs/en/best-practices)）："a separate classifier model reviews commands and blocks only what looks risky: scope escalation, unknown infrastructure, or hostile-content-driven actions."。敏感路徑用 `permissions.deny` 保護、危險指令用 PreToolUse hook 硬擋——settings 與 CLAUDE.md 的分工有明文（[Memory](https://code.claude.com/docs/en/memory)）：

> "Settings rules are enforced by the client regardless of what Claude decides to do. CLAUDE.md instructions shape Claude's behavior but are not a hard enforcement layer."

### 1.7 團隊層面採用

- 組織標準的機械承載與共享（[Security › Team security](https://code.claude.com/docs/en/security)，原文條列）：
> "Use managed settings to enforce organizational standards / Share approved permission configurations through version control / Train team members on security best practices / Monitor Claude Code usage through OpenTelemetry metrics"
- 共享資產進 git：團隊共用的 skills / agents / hooks / rules 放進 repo 的 `.claude/`，讓「流程」跟著 checkout 走。有副作用的流程 skill 官方明講要鎖成只有人能觸發——與EP實作 `/tdd-implement` 的鎖完全同款：
> "Use `disable-model-invocation: true` for workflows with side effects that you want to trigger manually."
> — [Best practices › Create skills](https://code.claude.com/docs/en/best-practices)
- 全組織強制的instructions可放 managed policy CLAUDE.md（`/etc/claude-code/ CLAUDE.md` 等路徑，個人設定無法排除；見 [Memory › Manage CLAUDE.md for large teams](https://code.claude.com/docs/en/memory)）。
- CI 整合走 headless（[Best practices](https://code.claude.com/docs/en/best-practices)）：
> "Non-interactive mode is how you integrate Claude into CI pipelines, pre-commit hooks, or any automated workflow."
- 指定 DRI（Directly Responsible Individual，明確指定一位對配置負責的人）管 CLAUDE.md／權限／hooks 的演進、用黑客松／種子使用者模式推行——出自 How Anthropic teams use Claude Code 與企業採用文章〔本環境無法直達原頁核對，發布前請點連結確認措辭〕。

### 1.8 官方點名的反模式

| 反模式 | 症狀 | 官方修法 |
|---|---|---|
| Kitchen-sink session | 一個 session 混多個無關任務，context 全是雜訊 | 換任務就 `/clear` |
| 反覆糾正迴圈 | 同一錯誤糾正 ≥2 次還在錯 | 停止拉鋸，`/clear` ＋ 帶著學到的東西重寫初始提示 |
| CLAUDE.md 過肥 | 幾百行規則，AI 開始忽略一半 | 當程式碼一樣審與剪枝 |
| 信任-驗證落差 | 看起來合理的實作、沒有邊界測試，上線才爆 | 沒有可驗證的檢查就不算完成 |
| 無界限探索 | 「幫我看看整個 codebase」→ 讀兩百個檔 | 用 subagent 隔離、縮小範圍 |
| AI 改測試遷就實作 | 測試「都過了」但斷言被動過 | 紅燈測試先 commit，diff 揭露竄改 |

前五項出自 [Best practices › Avoid common failure patterns](https://code.claude.com/docs/en/best-practices)，關鍵修法原文：

> "**Fix**: After two failed corrections, `/clear` and write a better initial prompt incorporating what you learned."（反覆糾正迴圈）

> "If your CLAUDE.md is too long, Claude ignores half of it because important rules get lost in the noise. **Fix**: Ruthlessly prune. If Claude already does something correctly without the instruction, delete it or convert it to a hook."（CLAUDE.md 過肥——注意官方的修法之一是「轉成 hook」）

### 1.9 2026 概念地圖：從 Prompt 到 Loop（社群前沿，官方文件之外）

（此節屬**業界前沿共識**而非官方文件，寫進規範時應標注來源層級。主要出處：Addy Osmani, "Loop Engineering", 2026-06 發表於 [addyo.substack.com](https://addyo.substack.com/p/loop-engineering)、[O'Reilly Radar 轉載](https://www.oreilly.com/radar/loop-engineering/)；同期論述來自 Peter Steinberger 與 Anthropic 的 Boris Cherny。核心主張〔搜尋交叉確認〕："Loop engineering is replacing yourself as the person who prompts the agent. You design the system that does it instead."）

世代遞進：**Prompt**（語言）→ **Context**（資訊）→ **Harness**（環境）→ **Loop**（控制）。2026 年 6 月的分水嶺論述：「不要再 prompt agent，要設計 prompt agent 的迴路」。完整分層：

| 層 | 學科 |
|---|---|
| 0 方法論 | AI-Native Engineering |
| 1 輸入 | Prompt / Context / Spec / Memory Engineering |
| 2 環境 | Harness（傘狀）/ Tool / Skills / Permission / Sandbox |
| 3 控制 | **Loop Engineering**——觸發器、拓撲、驗證器、停止規則 |
| 4 回饋 | **Evaluation**（outcome / process / trajectory）/ **Observability** |

對制定規範最有用的三個觀念：

1. **「瓶頸是驗證器，不是模型」**——模型產碼能力已超過組織驗證它的能力；規範的重心應放在驗證器（測試、審查、閘門、感測器）的建設，而非限制模型怎麼寫。這句話直接回應三個痛點的共同根源。
2. **生產環境的四個必要控制**：迭代上限、預算上限、agent 自己能評估的成功條件、失敗升級路徑。任何「放手讓 AI 自動跑」的流程缺一不可。
3. **Loop / Eval / Observability 有依賴關係**：你不能自動化一個你量不到的東西——先有觀測（Observability）才有基準（Evaluation），有量測才敢放手（Loop）。組織導入自動化時的順序約束。

---

## 2. EP實作（範例專案）的實際做法

（完整盤點含檔案路徑見附錄 A；此節按機制濃縮，並標注**機械強制**（hook 或 CI 會實際擋下）或**約定**（寫在文件裡、靠人與 AI 自覺）。hook、skill、subagent 等名詞的白話說明見 §0。）

### 2.1 三段式流程：規劃 → 審查 → 停等人審 → 實作 → 終審

```
/plan-feature <slug>          四面向（需求/系統/架構/UIUX）規劃、階段切分
      ↓ 自動接
/review-plan                  四個 fresh-context subagent 平行審規劃
                              （fresh context＝審查者是全新乾淨腦袋的分身
                              AI，不帶寫碼過程的偏見）
      ↓                       主 session 只彙整不改判，產出 P0/P1/P2
   【停：等人審】              P0 未處置不得進實作
      ↓ 人親自打
/tdd-implement <slug>         逐階段紅→綠 TDD，紅燈期上鎖
      ↓ 收尾自動接
/review-implementation        同四視角審 diff，必答「實作是否偏離規劃」
```

支撐這條流程的兩道**機械**鎖：

- `feature-plan-guard.py`（PreToolUse hook——掛在「AI 執行任何工具動作前」的攔截點）：`feature/*` 分支上不曾存在 `docs/plans/<slug>/plan.md` 就 **擋掉** `src/**`、`supabase/functions/**` 寫入——「規劃先行」不是叮嚀，是寫不進去。
- `/tdd-implement` 的 frontmatter 設 `disable-model-invocation: true`：AI **無法自己觸發實作階段**，只有人打得動——「人審通過才實作」的保證來自這一行，而非流程圖上的箭頭。

### 2.2 Hook 層：確定性守衛（全部機械）

- `bash-guard.py`：擋六類後門——覆寫 `core.hooksPath`、`git commit --no-verify`、`--force` push（只准 `--force-with-lease`）、直推 main/develop、本機跑 journey、開分支不指定 base 或以 main 為 base。
- `tdd-test-guard.py`：紅燈期（`.claude/tdd-lock` 存在）**禁改測試檔**—— 官方靠「commit 測試後看 diff」事後揭露竄改，EP實作直接事前擋掉。
- `pre-push-rebase.sh`：push／開 PR 前自動 rebase 到 origin/develop；會改寫遠端歷史時停下來要求人明確下令。
- `check-output-filter.py`：驗證指令綠燈輸出折疊成一行、紅燈原樣——降低「綠燈刷屏淹沒紅燈」的 context 污染。
- `decision_log.py`：每次 hook 決策記錄成 metrics（誤擋率、命中率），由 pre-commit 落檔進 git——**守衛本身被量測**。
- `permissions.deny` 擋讀 `.env*` 等敏感檔。

### 2.3 TDD 相位鎖與 pre-commit 閘門（機械）

- 紅燈：commit `test(red)` 為證據 ＋ `touch .claude/tdd-lock` 上鎖；pre-commit 紅燈通道只跑 biome/tsc/knip（紅燈定義：編譯過、斷言失敗）。
- 綠燈：`scripts/tdd-unlock.sh` 是**唯一合法解鎖**，`npm run check` 全綠才刪鎖。
- pre-commit 由 `npm ci` 的 prepare 自動掛載，跑統一閘門 `npm run check`（biome＝lint 與格式檢查、typecheck＝TypeScript 型別檢查、vitest＝單元測試、knip＝偵測沒人用的死程式碼）；`--no-verify` 繞過手段被 bash-guard 擋。

### 2.4 審查層：做事者不自評（結構機械、內容 AI）

- 四個 `plan-reviewer-*` subagent（系統／架構／UIUX／需求），唯讀工具、fresh context、不自動觸發、由 skill 顯式派工。
- 需求視角有硬規則：「需求對不到規格書章節又沒列開放問題＝一律 P0」—— 把「做了規格外的東西」變成阻擋級發現。
- 審查輸出契約單一定義於 `docs/_templates/review.md`：P0 阻擋／P1 應改／P2 建議；明訂「無缺口要明講，禁止為交差發明問題」「不確定標『需人工裁決』」。主 session 彙整時**明文禁止改判**。
- `/review-implementation` 專攔「規劃審過、實作走偏」：每個 reviewer 必答「實作有沒有偏離 plan」，並核對「新增行為有對應測試、紅→綠而非事後補寫」。

### 2.5 CI 軌道與部署（機械）

- 分層閘門：guards（秒級：框架健檢＋linear history 檢查（分支歷史須保持一直線、不含 merge commit）＋migration 守衛）→ static / unit / build / api / e2e / journey-offline 並行 → 匯總到唯一 required check `ci-ok`。
- 晉升 develop→main 的 PR 自動跑 `journey-full`（30–90 分鐘、真後端拋棄式分支），且對它單獨要求 success（skipped 不算過）——上線前必過全鏈路。
- journey 套件「不可能假綠」：連線失敗即硬失敗、情境數低於下限即硬失敗（源自 2026-07-21「27 個情境全 skip 卻顯示全綠」真實事故）。
- 正式站部署綁 GitHub production environment，**人工核准**才動線上；部署後打 `/api/health` 比對 sha 確認線上跑的就是這個 commit。

### 2.6 覆蓋率棘輪（半機械）

- vitest coverage thresholds 設在最近實測值下方一點點，**用途是擋退步**，不是目標值；不過門檻＝check 紅＝commit 被擋（機械）。
- 「只准往上、調低必須在 PR 寫明理由」這條規則本身**沒有機械檢查**，目前是註解裡的社會契約＋人工 review 把關（已知縫隙，見 §4.1）。

### 2.7 框架自檢與長期記憶（EP實作特色）

- `framework-check.sh` 統籌十餘支檢查器：hook 行為表格測試（`test-hooks.py` ——**守衛自己也有紅綠燈**）、workflow 命名結構、測試命名分層、規格書漂移（`check-spec-drift.py`：業務常數／路由／狀態機與規格書逐條比對，**抽不到值視為失敗**，防閘門靜默變 no-op）、migration 版本唯一、context 預算（CLAUDE.md／rules 的啟動成本上限——官方「保持精簡」的機械化）、e2e 必留情境、bundle 預算棘輪。所有檢查器**先跑自己的 self-test 再實掃**。
- `fix-bug` skill 的**防線回填**：每個 bug 修完必答「為什麼既有的 CI／hook／測試沒攔到」，把漏網變成新防線；**同類掃描**：grep 全庫找同病灶。
- `friction-log.md`：框架自身的誤擋／漏網／重複糾正單一彙整點，每 2 個 feature 或雙週整併成框架修訂 PR——**流程本身有迭代迴圈**。
- 文件四級權威分級（規範／現況／長期記憶／鷹架）；規格書與程式碼衝突時以程式碼為準、同 PR 回修規格書（spec-drift 機械把關）。

### 2.8 已知的自我診斷：閘門強、迴路弱（前次 session 的架構檢視結論）

前次 session 用 §1.9 的概念地圖對EP實作評分：AI-Native / Context / Harness 9 分（頂尖——框架自己像 code 一樣走 PR＋CI 演進），Spec / Permission / Prompt 8，Sandbox 6（無 [worktree](https://code.claude.com/docs/en/worktrees) ——同一 repo 的多份獨立工作副本，讓多個 AI 並行改碼不互撞），**Loop Engineering 4（內迴路一流、外迴路不存在）、Evaluation 3（驗軟體、驗設定，唯獨不驗 agent 行為）、Observability 2**（三者的白話說明見 §0）。核心診斷：

> **這是一套全部由閘門構成、（當時）沒有任何感測器的 harness。**

據此已完成 **Step 1 感測器**（PR #161／#165 已合併）：`decision_log.py` 記錄每次 hook 決策、pre-commit 落檔、`harness-metrics.py` 彙總誤擋率與 skill 命中率。過程中沉澱了三條可複用通則（已入 friction-log）：

1. **感測器的失效是靜默的**——閘門壞了會擋住人，感測器壞了只是不再記錄，少報的讀數看起來跟「真的沒事」一樣；量測設施需要的機械驗證比閘門更多。
2. **hook 的並行是預設，不是例外**——唯讀 hook 沒踩到只是運氣。
3. **歸納出一條原則的那一刻，就是該拿它掃一遍全庫的時刻**——根因愈清楚、原則抽得愈漂亮，愈容易把「講清楚了」當成「修完了」。

另一條實證教訓：Step 1 落地過程抓到三個 bug，**沒有一個是既有閘門抓到的**（分別靠端到端手動驗證、突變測試、下一輪自己撞上）；12 條突變有 2 條一度存活——「檢查看起來在跑，對那個突變卻空轉」。因此本 repo 對自撰閘門的既有要求是**突變驗證**：新增任何檢查都要證明「改壞它會紅」。

待辦路線（依序，不可跳）：等感測器累積約一週資料 → **Step 2** skill 觸發 eval（量「該觸發的 skill 沒觸發」的機率）→ **Step 3** friction-log 整併排程化 → **Step 4** 第一條真外迴路（用 claude-code-action——把 Claude 跑在 GitHub CI 裡的[官方整合](https://code.claude.com/docs/en/github-actions)——讀 triage issue 產唯讀診斷），且必須先補齊四個生產控制中缺的兩個（迭代上限、預算上限）。

---

## 3. 官方 × EP實作逐項比較

### 3.1 對照總表

| 官方原則 | 官方建議的做法 | EP實作的落地 | 評註 |
|---|---|---|---|
| 計畫先行，人審計畫 | Plan Mode＋人核可後實作（自律） | 三段式 skill＋`feature-plan-guard` 機械擋無規劃寫碼＋`disable-model-invocation` 鎖實作入口 | **超越**：官方的自律約定被升級為機械前提 |
| TDD、防改測試遷就實作 | 紅燈測試先 commit，靠 diff 事後揭露 | `test(red)` commit 為證據＋紅燈期 hook **事前禁改**測試檔＋唯一解鎖腳本 | **超越**：事後揭露 → 事前不可能 |
| 給 AI 可自跑的驗證迴圈 | 測試／lint／build 讓 AI 自我迭代 | `npm run check` 統一閘門＋pre-commit 強制＋綠燈輸出折疊 | **等同＋**：多了 context 衛生優化 |
| 獨立 context 審查 | subagent／第二個 Claude 做 review | 四視角 fresh-context reviewer＋輸出契約＋主 session 禁改判＋P0 阻擋語義 | **超越**：視角分工、嚴重度契約、改判禁令都比官方通則具體 |
| 必守規則用 hooks 承載 | PreToolUse 擋危險指令 | 9 支 hook 覆蓋 git 後門／TDD 相位／規劃前提，且 hook 行為**有測試**、決策**有量測** | **超越**：官方沒有「測 hook」「量 hook」的實踐 |
| CLAUDE.md 精簡、定期剪枝 | 人工判斷、定期回訪 | `check-context-budget.py` 把啟動成本變 CI 檢查 | **超越**：剪枝紀律機械化 |
| 驗證是證據不是聲稱 | 要求貼測試輸出、截圖 | 覆蓋率棘輪＋journey 假綠防禦＋部署後 sha 比對＋PR 範本要求附審查結論 | **等同＋**：多層外部 oracle |
| 反模式：糾正迴圈、context 污染 | `/clear`、重寫初始提示 | CLAUDE.md 糾偏 SOP（Esc→/rewind→/clear、先 /context 再決定） | 等同 |
| 任務切分（小到可獨立驗證） | 分解模式、每 PR 一個邏輯功能 | 規劃書「階段切分」＋一階段一紅綠循環；**但無 PR 規模的機械檢查** | **部分缺口**（見 3.3） |
| 人是最終裁決者 | AI 找問題不核准，人簽核 PR | AI 四視角審查完備；**但 repo 是否要求人工 approve 未機械化**，required check 只有 `ci-ok` | **缺口**（見 3.3） |
| 組織採用：DRI、共享配置、種子推行 | 全組織 `.claude/` 資產、黑客松 | 單 repo 內完整，**未抽出可跨 repo 複用的組織層** | **缺口**＝這次要做的事 |

### 3.2 EP實作超越官方基線的五個做法（值得寫進組織規範的「輸出品」）

1. **「advisory 會被忽略」當作設計公理**：官方說重要規則用 hooks；EP實作進一步把「哪些規則值得機械化」做成方法論——被違反過的約定就升級成 hook／CI 檢查（防線回填），並用 friction-log 追蹤誤擋率。
2. **做事者不自評的結構化**：審查者 fresh context＋唯讀＋輸出契約＋「主彙整者禁改判」＋「對不到規格書＝P0」。這比官方「用 subagent review」的一句話具體得多，是可直接移植的資產。
3. **閘門自己也要有紅綠燈，且要突變驗證**：hook 有行為測試、檢查器有 self-test、規格書抽取失配即紅（防閘門靜默失效）、journey 假綠防禦；新增任何檢查都要證明「改壞它會紅」（突變驗證），並在寫測試前先問「它空轉時看起來像什麼」。官方文件沒有涵蓋「守衛的守衛」這一層。
4. **證據鏈貫穿全程**：`test(red)` commit hash 是 TDD 的證據、PR 範本要求附審查結論、部署後 sha 比對是上線的證據——每個「聲稱」都有對應的可查驗物。
5. **流程有自己的迭代迴圈**：harness metrics＋friction-log＋雙週框架修訂 PR。規範不是寫完就完，跟程式碼一樣有 bug、要量測、要修。

### 3.3 EP實作相對官方（或相對痛點）的缺口

1. **人審 PR 沒有機械保證**（EP實作特有——它是單人＋AI 的範例專案）：唯一 required check 是 `ci-ok`（CI）；AI 四視角審查很強，但「至少一個人類 approve 才能合併」不在 ruleset 裡強制。對照痛點 1，官方立場明確：AI 找問題、**人做裁決**——人的裁決點應該被機械要求，而不只是文化。**組織其他專案已有兩位 reviewer 的人審制度**，所以對組織而言這個缺口反過來：人審制度已存在，缺的是 (a) 兩位 reviewer 拿到的 PR 未必附 AI 審查結論與測試證據（面對一大坨 diff 只能橡皮圖章）、(b) 需確認「2 個 approve」是 ruleset 機械強制還是靠慣例。
2. **PR／階段規模沒有機械上限**：階段切分是 skill 裡的約定，diff 行數、單 PR 檔案數沒有檢查。官方也只有原則（一句話描述不了就拆）沒有機制，兩邊在此都停在約定層。
3. **覆蓋率棘輪的「只准往上」未機械化**：門檻值本身可被調低，只靠註解與人工 review 守著——這正是痛點 3 的縫隙型態（測試閘門存在，但閘門的參數可被寫碼方悄悄放鬆）。
4. **官方 Code Review 功能（`/code-review`／REVIEW.md）未整合**：EP實作的四視角審查發生在 merge 前的 session 內；PR 開啟後的自動 inline 審查（官方新功能）可作為第二道獨立防線，兩者互補不重複。
5. **組織層抽象不存在**：一切都在單 repo。要給其他團隊用，需要抽出「與 EP實作業務無關的可複用層」（見 4.2 的分層建議）。
6. **外迴路（Loop / Eval / Observability）仍在建設初期**（§2.8 的自我診斷）：感測器（Step 1）剛上線、資料還不足以當訊號；skill 觸發命中率沒被量過（`feature-plan-guard` 自承啟發式觸發「不保證每次都中」）；排程 workflow 失敗開的 triage issue 沒有任何東西會去讀。依賴順序是 Observability → Evaluation → Loop，不能跳著補。這一條同時是對官方文件的補充：官方內容集中在層 0–2（方法論／輸入／環境），層 3–4 目前主要靠社群前沿（§1.9）與EP實作自己的實證。

### 3.4 三個痛點的官方解法 × EP實作解法對照

**痛點 1：沒人 review code**

| 官方 | EP實作 |
|---|---|
| 多 agent 自動審查 PR、人做最終裁決；審查用獨立 context | 規劃審（4 subagent）＋實作審（同 4 視角對 diff）＋P0 阻擋＋停等人審的機械鎖 |

→ 共同結論：**review 要拆成「AI 找碴（可以很多、很便宜）」與「人裁決（不能省、要機械要求）」兩件事**。組織規範應同時規定兩者，只推其一都會失敗（只有 AI 審＝沒人負責；只要求人審＝回到人力瓶頸，然後大家開始橡皮圖章）。對我們組織的具體含義：其他專案**已有兩位 reviewer**，「人裁決」的制度面不缺——缺的是**餵給人審的輸入品質**。「有 reviewer」和「review 得動」是兩回事：一大坨 diff＋一句「測試都過」會把任何 reviewer 推向橡皮圖章。規範的重心應是：reviewer 收到的 PR 必須已附 AI 審查結論、測試證據、且規模可審（審不動就退回要求拆分），讓兩位 reviewer 的時間花在裁決、不是在巨型 diff 裡自己找蟲。

**痛點 2：寫一大坨就想上 PR**

| 官方 | EP實作 |
|---|---|
| Explore→Plan 先行，人審計畫；子任務小到可獨立驗證；一 PR 一邏輯功能 | 規劃未過人審寫不了碼（hook 擋）；階段切分＋一階段一紅綠；linear history |

→ 共同結論：巨型 PR 是**流程上游的病**（沒有計畫審查點），下游用「PR 行數上限」硬擋只治標。規範應把攔截點放在計畫階段，輔以 PR 規模的軟性警戒。

**痛點 3：聲稱測試都過，但涵蓋不夠**

| 官方 | EP實作 |
|---|---|
| TDD（測試先紅、commit 為證）；驗證外部化；要求出示證據 | 紅燈證據 commit＋紅燈期禁改測試＋覆蓋率棘輪＋假綠防禦＋review 核對「行為有對應測試」 |

→ 共同結論：**「測試都過」永遠不足採信，除非 (a) 判準在寫碼方控制之外（CI、覆蓋率門檻、必留情境清單），且 (b) 有紅→綠的證據鏈**。規範的措辭應該是「出示證據」而不是「要誠實」。

---

## 4. 初擬優化建議

### 4.1 對 EP實作本身（回填 §3.3 的縫隙）

| 優先 | 建議 | 對應縫隙 |
|---|---|---|
| P1 | Ruleset 加「至少 1 個人類 approval」為合併條件（AI 審查結論附在 PR 供人裁決） | 人審無機械保證 |
| P1 | 新增 `check-coverage-ratchet.py`：比對本 PR 與 base 的 thresholds，調低即紅、除非 commit message／PR 帶豁免標記與理由（接進 framework-check 軌） | 棘輪可被靜默調低 |
| P2 | guards 軌加 PR diff 規模**軟警戒**（如 >800 行非鎖檔變更時留言提示拆分，不硬擋——硬擋會逼出湊行數的壞行為） | PR 規模無檢查 |
| P2 | 試點官方 `/code-review`＋`REVIEW.md`（把 review.md 契約的 P0/P1/P2 語義翻譯過去），作為 PR 開啟後的第二道獨立防線。注意官方 check run 永遠是 neutral、從不擋合併——要 gate 需自行在 CI 解析 check run 的 severity 輸出（官方文件提供機械可讀格式） | 官方新功能未整合 |
| P3 | 把「同類掃描／防線回填」從 fix-bug skill 的內文抽成 checklist，供無框架的 repo 也能人工執行 | 組織化前置 |
| （已排程） | 外迴路建設照前次 session 的 Step 2→3→4 依序走：等感測器資料約一週 → skill 觸發 eval（CI 上、只在 `.claude/**` 變更時跑、軟警戒不硬擋）→ friction-log 整併排程化 → 第一條唯讀外迴路（claude-code-action 讀 triage issue），Step 4 前先補迭代與預算上限 | Loop/Eval/Observability |

（注：外迴路路線已有明確順序與前置條件，本次 Guideline 工作不應與其搶跑，只需在規範中引用其原則。）

### 4.2 對組織規範的方向建議（給主管的初步框架）

**核心主張：規範的單位不是「條文」，是「機制」。** EP實作的經驗與官方文件一致指向：寫在文件裡的約定（advisory）在 AI 高速產碼的環境下衰減極快，存活下來的規則全是有 hook／CI／ruleset 承載的。因此建議 Guideline 採 **成熟度階梯**，讓不同團隊按能力分級採用，但每一級都以「機械承載」為達標判準，而不是「已宣導」：

- **L0 起步（一天內可完成）**：repo 有精簡 CLAUDE.md（≤200 行，見 §0）；PR 範本要求附「測試證據」（輸出貼文或 CI 連結）；沿用組織既有的 **兩位 reviewer** 制度，並確認它寫進 GitHub ruleset（合併強制規則，見 §0：required approvals＋CI 綠才可合併）而非靠慣例。→ 直接處理三個痛點的最低配。
- **L1 閘門（一週）**：pre-commit 統一閘門（lint＋型別＋測試）且擋 `--no-verify`；CI 單一 required 匯總 check；覆蓋率門檻（先有，再談棘輪）。
- **L2 流程（一個月）**：計畫先行（Plan Mode 或 plan 檔）＋人審計畫才實作；TDD 紅燈證據 commit；AI 多視角審查（subagent 或官方 Code Review）＋嚴重度契約（P0 阻擋語義）。
- **L3 自癒（持續）**：防線回填（每個漏網 bug 問「為什麼閘門沒攔到」並新增檢查）；friction-log；閘門自檢（檢查器要有 self-test＋突變驗證）；棘輪類指標（覆蓋率／bundle 只准向好）。
- **L4 迴路（前沿，選配）**：先觀測（量閘門出手率、誤擋率、AI 產出的返工率）→ 建 eval 基準 → 才談自動化外迴路（如 AI 自動讀 CI 失敗開診斷）。任何無人值守的 AI 迴路必備四控制：**迭代上限、預算上限、agent 可自評的成功條件、失敗升級路徑**——缺一不放手。

貫穿各級的三條元原則（值得放在 Guideline 開頭）：

1. **瓶頸是驗證器，不是模型**——規範的每一條都應該回答「這讓驗證變強了嗎」，而不是「這限制了 AI 什麼」。
2. **證據不是聲稱**——「做完了」「測試都過」不可採信，採信的是外部 oracle（＝獨立於作者之外、能客觀判定對錯的檢驗來源，如測試套件或 CI）的輸出與可查驗的證據鏈（紅燈 commit、CI 連結、覆蓋率數字、部署 sha）。
3. **advisory 會衰減，重要規則要機械承載**——且承載規則的閘門與感測器自己也要被驗證（突變驗證；感測器的失效是靜默的，需要比閘門更多的機械檢查）。

**三個痛點在規範中的對應條目（最小集）**：

1. 沒人 review → 「AI 找碴＋人裁決」雙軌都是合併的機械前提（ruleset）。人裁決沿用既有兩位 reviewer 制度；AI 審查結論必須附在 PR 上供 reviewer 裁決，人不對 AI 沒看過的 diff 簽名；未附 AI 審查結論與測試證據、或規模審不動的 PR，reviewer 有權直接退回——這條要寫明，橡皮圖章的根源就是「退回沒有正當性」。
2. 一大坨上 PR → 計畫審查點前置（L2）；PR 一句話描述不了就拆；規模軟警戒。
3. 測試聲稱 → 「證據不是聲稱」入規範：PR 必附測試輸出／CI 連結；測試先紅後綠（紅燈 commit 為證）；覆蓋率門檻由 CI 持有、調低需書面理由。

**推行方式**（官方經驗）：不要全組織分階段強制；找 1–2 個種子團隊照 L0→L1 跑出成功案例（黑客松形式），種子成員當導師擴散；指定 DRI 維護組織層 `.claude/` 資產；每季回訪剪枝（規則太多會互相稀釋——這點對規範文件本身同樣成立）。

---

## 5. 下一步

以上為研究與比較的完整內容。待決定（人工裁決）：

1. Guideline 的**受眾與形式**：給主管參考的組織級文件？單頁原則＋附錄機制？還是可直接發給工程師的操作規範？
2. Guideline 的**語言與長度**、是否包含 EP實作的具體檔案作為範例附錄。
3. §4.1 的 EP實作自身優化是否另開 issue／feature 處理（與 Guideline 分開；外迴路的 Step 2–4 已有既定順序，不在本次範圍）。

> 注：前次 session（AI-Native 架構檢視 → Step 1 感測器）的交接內容已整合進 §1.9、§2.8、§3.3-6 與 §4；其評分、診斷與三條通則是本文件「層 3–4」素材的主要來源。

---

## 附錄 A：EP實作機制的關鍵檔案索引（路徑為 EP實作 repo 內的相對路徑）

- 流程總覽：`CLAUDE.md`；hook 掛載：`.claude/settings.json`
- Hooks：`.claude/hooks/{bash-guard,tdd-test-guard,feature-plan-guard,check-output-filter,deletion-residue-check,model-effort-advisor,decision_log}.py`、`{pre-push-rebase,session-bootstrap}.sh`
- Skills：`.claude/skills/{plan-feature,review-plan,tdd-implement,fix-bug,review-implementation}/SKILL.md`
- Reviewer agents：`.claude/agents/plan-reviewer-{system,architecture,uiux,requirements}.md`；審查契約：`docs/_templates/review.md`
- 治理腳本：`scripts/framework-check.sh` 及其統籌的 `check-*.py`、`test-hooks.py`、`tdd-unlock.sh`、`harness-metrics.py`；pre-commit：`scripts/git-hooks/pre-commit`
- CI／部署：`.github/workflows/{ci,deploy-supabase,journey,deployment-queue-audit}.yml`；規則：`.claude/rules/github-actions.md`
- 覆蓋率棘輪：`vitest.config.ts`；文件分級：`docs/README.md`；摩擦紀錄：`docs/plans/friction-log.md`

## 附錄 B：來源清單（含驗證狀態）

**一手・已逐字核對**（本文所有未標注的英文引句均複製自這些頁面）：
- Best practices：https://code.claude.com/docs/en/best-practices
- Hooks guide：https://code.claude.com/docs/en/hooks-guide
- Memory / CLAUDE.md：https://code.claude.com/docs/en/memory
- Security：https://code.claude.com/docs/en/security
- Code Review：https://code.claude.com/docs/en/code-review
- Common workflows：https://code.claude.com/docs/en/common-workflows
- Permission modes：https://code.claude.com/docs/en/permission-modes（僅引用連結，未逐字抓取）

**一手・搜尋交叉確認**（原頁被本環境 egress proxy 封鎖，引句經搜尋結果比對；發布前建議人工點開核對）：
- Claude Code Best Practices（工程部落格）：https://www.anthropic.com/engineering/claude-code-best-practices（TDD 段引句）
- Building Effective Agents：https://www.anthropic.com/engineering/building-effective-agents（"simple, composable patterns" 引句）

**一手・未能核對**（僅作方向性摘要，本文已標注）：
- How Anthropic teams use Claude Code、企業採用（DRI／黑客松）相關文章
- Effective harnesses for long-running agents：https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

**社群前沿**（非官方，§1.9 的來源層級）：
- Addy Osmani, "Loop Engineering"：https://addyo.substack.com/p/loop-engineering ・ O'Reilly Radar 轉載：https://www.oreilly.com/radar/loop-engineering/

**已剔除**：devops.com、tembo.io 等第三方整理，及無法在官方頁面回查的成效數字（84%、<1% 誤判、16%→54% 等）——不作為規範依據。
