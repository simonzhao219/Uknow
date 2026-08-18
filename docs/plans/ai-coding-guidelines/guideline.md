# AI Coding Guideline（草案 v0.2・Q&A 版）

> 本規範針對「用 AI（如 Claude Code）產出程式碼」的開發流程，解決三個實際痛點：**沒人 review code、寫一大坨就上 PR、聲稱測試都過但涵蓋不夠**。
>
> 全文採 Q&A：每個問題都是團隊裡真實會出現的疑問，先想一下你的答案，再看規範怎麼回答。結構分三部分：Part 1 原則 Q&A＋單頁速查表（給所有人）、Part 2 官方文件怎麼說（規範依據，附英文原文）、Part 3 我們的範例專案「EP實作」怎麼做到（落地參考、未來優化，以及各階段對應哪一種 Engineering 學科——見 Q19）。
>
> 不熟的名詞（hook、subagent、Plan Mode…）見文末〈附錄：名詞速查〉。

---

## Part 1：原則 Q&A

### 起點：為什麼需要這份規範？

**Q1. AI 寫碼又快又多，問題到底出在哪？**

不在 AI 寫太多，在**我們驗證它的速度跟不上它產出的速度**。所以這份規範的每一條都在回答同一個問題：「這讓驗證變強了嗎」——而不是「這限制了 AI 什麼」。記住一句話：**瓶頸是 verifier，不是模型**。

**Q2. 訂了規範、宣導過了，為什麼還是沒人遵守？**

因為寫在文件裡的約定，對 AI 和對人一樣**會衰減**。官方的語彙把規則分成兩個層級：**advisory**（建議——寫在文件裡，AI 可能忽略）與 **enforced**（強制——由程式執行，違規做不到；見 Part 2 Q11'）。所以本規範的達標判準是「**enforced**」——重要規則要放進 hook／CI／合併規則（ruleset）。同一條約定被違反第二次，就該從 advisory 升級成 enforced，不再靠提醒（**準則 7**）。

---

### 給寫碼的人（人＋AI）

**Q3. 我可以直接叫 AI 開寫嗎？什麼時候要先出計畫？**

判準抄官方的：**「如果你能用一句話描述這個 diff，就不用計畫」**。反過來，範圍不確定、要動多個檔案、或你不熟那段程式碼——先讓 AI 用 Plan Mode（唯讀模式）出計畫、**人審過計畫才實作**（**準則 1**）。理由：攔截點放在最便宜的階段——改一份計畫，比改一坨已經寫出來的程式碼便宜得多。「寫一大坨就上 PR」的病因通常不是下游沒擋，是上游沒有這個計畫審查點。

**Q4. 我怎麼知道 spec／計畫寫得夠清楚？**

官方對「好的 spec」給過結構判準：自足（點名涉及的檔案與介面）、寫明 **out of scope**、並以一個端到端的驗證步驟收尾（原文見 Part 2 Q4'）。落到日常，用這四個測試自檢：

1. **可驗證性測試（最硬的一條）**：spec 的每句話，能不能翻成一個「現在會紅、做完會綠」的測試？寫不出失敗案例的句子（「體驗要流暢」「要安全」）就是不清楚的句子。TDD 的紅燈其實就是 spec 清楚度的試金石—— 紅燈寫不出來，先回去改 spec，不是開始寫碼。
2. **Fresh context 測試**：開一個全新 session（或找一個沒參與討論的人），只給 spec，請它複述要做什麼、列出測試案例清單。複述和你的意圖一致就夠清楚。EP實作把這件事制度化了：三段式流程的每一段都能在全新 session 執行，狀態全在 `docs/plans/<slug>/` 檔案裡，plan.md 因此天生必須通過這個測試。
3. **訪談窮盡測試（事前）**：讓 AI 先訪談你再寫 spec（官方作法，見 Part 2 Q4'）。**AI 問到你答不出來的問題，就是 spec 的洞**；連續幾輪問不出新問題，才算收斂。
4. **審查殘留測試（事後指標）**：AI 審查產出裡「需人工裁決」與「需求對不到規格書」的條目數量，以及實作終審的「偏離規劃說明」常常不是「無」——這兩個都是 spec 不清的落後指標，可以持續追蹤。

補一個最常漏的維度：spec 除了說「要做什麼」，還要明寫 **out of scope** 與錯誤／邊界路徑（EP實作的 UIUX 審查硬規則「三態完備：空／錯誤／載入」就是這個的落地）。範圍沒寫清楚時 AI 不會停下來問，它會自己補——那是「寫一大坨」的另一個來源。

**Q5. 那 PR 應該多大？**

同一個判準：**一句話描述不了，就拆**。一個 PR 一個邏輯功能（**準則 2**）。審得動的 PR 才會有真審查；巨型 PR 得到的只會是橡皮圖章——你其實是在懲罰認真審你 code 的同事。

**Q6. AI 會不會為了讓測試變綠，偷偷去改測試？**

會，這是官方點名的已知行為。防法不是叮嚀它，是走 TDD 的順序（**準則 3**）：先讓 AI 寫**會失敗**的測試 → **確認真的紅**（防「本來就會過」的假測試）→ **把紅燈測試 commit 起來** → 再實作到綠。紅燈 commit 是證據：之後 AI 若動了測試，diff 一眼就看得出來。

**Q7. 我跑過測試都綠了，PR 描述寫「測試都過」可以嗎？**

不夠。「測試都過」是**聲稱**，規範採信的是**證據**：測試輸出或 CI 連結、覆蓋率變化、（UI 改動）截圖（**準則 4**）。這不是刁難——審查者看證據比自己重跑驗證快，而且證據會留在 PR 上成為紀錄。官方的說法：「Have Claude show evidence rather than asserting success」（見 Part 2 Q8'）。

---

### 給 reviewer（我們每個專案有兩位）

**Q8. AI 都會自我審查了，人還需要 review 嗎？**

需要，但角色變了：**AI 找碴，人裁決**（**準則 5**）。AI 審查便宜、可以大量做、不會累——但它從不核准（官方連自家 Code Review 產品都設計成「從不 approve、從不擋合併」，見 Part 2 Q9'）。人的裁決不能省，而且 **人不對 AI 沒看過的 diff 簽名**：每個 PR 都應先過 AI 審查、結論附在 PR 上，reviewer 拿著 AI 的發現做判斷，而不是空手在巨型 diff 裡找蟲。

**Q9. 我收到一個沒附證據、或大到審不動的 PR，怎麼辦？**

你有兩個正當動作，都不是硬著頭皮審（**準則 6**）：

- **缺證據** → 先請作者補上（或直接請 AI 補跑審查與測試——通常幾分鐘），補齊再開始審。
- **審不動** → 要求拆分後再送。

橡皮圖章的根源是「暫停審查沒有正當性」；這條就是給你的正當性。

**Q10. AI 審查報了一堆問題，每條都要修嗎？**

不用，而且官方明確警告過：被要求找問題的 AI**一定找得出問題**，照單全收會走向過度工程（多餘的抽象層、防禦不可能發生的情況）。只處理影響 **正確性與明訂需求**的發現，其餘視為可選建議（見 Part 2 Q9' 的原文）。

---

### 給維護流程的人

**Q11. 覆蓋率有門檻了，為什麼測試還是越來越少？**

因為門檻的**參數**可能被悄悄調低——閘門還在，門變寬了。規範：品質指標（覆蓋率、bundle 大小…）**只准向好**，門檻由 CI 持有；要調低必須在 PR 寫明理由給人裁決（**準則 9**，這種機制叫 ratchet——像棘輪齒只朝一個方向轉）。

**Q12. 我們加了一堆自動檢查，這樣就安全了吧？**

先問一個問題：**你的檢查空轉時，看起來像什麼？** 大多數時候答案是「像全部通過」。所以新增任何檢查都要做 **mutation testing**：故意把它該擋的東西弄壞一次，證明它真的會紅（**準則 8**）。EP實作有過實證：12 條 mutation 測試抓出 2 條「看起來在跑、實際空轉」的檢查——這層若不存在，那兩個假檢查會永遠綠著（見 Part 3）。

**Q13. 又有 bug 漏到線上了。修完就結案？**

不行，還差兩步（**準則 11**）：(a) **同類掃描**——同一個病灶通常不只一處，grep 全庫找兄弟；(b) **防線回填**——回答「為什麼既有的測試／CI／hook 沒攔到它」，把答案變成新防線。這讓每次漏網自動強化系統，而不是只修這一次。

**Q14. AI 越用越笨、同一個錯講了三次還在犯，怎麼辦？**

這通常不是模型問題，是 **context（AI 的工作記憶）塞滿了失敗嘗試**。規範（**準則 10**）：換任務就清空（`/clear`）；同一錯誤糾正兩次還錯，停止拉鋸——重開 session、把學到的東西寫進更好的初始提示；CLAUDE.md（AI 每次開工自動讀的專案說明書）保持 200 行內，太肥 AI 會整份忽略。

---

### 單頁速查表（Q&A 的濃縮版，可單獨列印）

**三條元原則**：① 瓶頸是 verifier，不是模型 ② 證據不是聲稱 ③ advisory 會衰減，必守規則要 enforced——且閘門自己也要被驗證。

| # | 準則 | 出處 Q |
|---|---|---|
| 1 | 計畫先行：範圍不確定／跨多檔／不熟的改動，先出計畫給人審；一句話能描述的 diff 直接做。Spec 清楚度用四個測試自檢 | Q3、Q4 |
| 2 | 小步交付：PR 一句話描述不了就拆 | Q5 |
| 3 | 測試先紅後綠：紅燈測試先 commit 當證據 | Q6 |
| 4 | PR 必附證據：測試輸出／CI 連結；只寫「測試都過」＝未完成 | Q7 |
| 5 | AI 找碴＋人裁決：AI 審查結論附在 PR，兩位 reviewer 裁決；人不對 AI 沒看過的 diff 簽名 | Q8 |
| 6 | 補證據再審：缺證據先請 AI 補、審不動要求拆分——不硬審 | Q9 |
| 7 | 必守規則機械化：被違反第二次就升級成 hook／CI 檢查 | Q2 |
| 8 | 閘門也要驗證：新檢查要證明「改壞它會紅」 | Q12 |
| 9 | 指標只准向好：門檻由 CI 持有，調低要書面理由 | Q11 |
| 10 | Context 衛生：換任務就清空；糾正兩次就重開；CLAUDE.md ≤200 行 | Q14 |
| 11 | 防線回填：漏網 bug 必答「為什麼沒攔到」並補防線＋同類掃描 | Q13 |

| 痛點 | 對應準則 |
|---|---|
| 沒人 review code | #5、#6、#4 |
| 寫一大坨就上 PR | #1、#2、#6 |
| 聲稱測試都過但涵蓋不夠 | #3、#4、#9 |

---

## Part 2：官方文件怎麼說？

（引句均逐字核對自 [code.claude.com 官方文件](https://code.claude.com/docs/en/best-practices)；標〔部落格〕者出自 Anthropic 工程部落格，經搜尋交叉確認。）

**Q7'. AI 怎麼知道自己「做完了」？**（支撐準則 3、4）

預設依據是「看起來完成」——這正是「聲稱測試都過」的來源。官方的解法是給它一個會回報紅綠的檢查，讓迴圈自己閉合：

> "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop: every mistake waits for you to notice it. Give Claude something that produces a pass or fail, and the loop closes on its own."
> — [Best practices › Give Claude a way to verify its work](https://code.claude.com/docs/en/best-practices)

**Q8'. 官方怎麼看「聲稱 vs 證據」？**（支撐準則 4）

> "Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result."
> — 同上

> "**The trust-then-verify gap.** ... **Fix**: Always provide verification (tests, scripts, screenshots). If you can't verify it, don't ship it."
> — [Best practices › Avoid common failure patterns](https://code.claude.com/docs/en/best-practices)

**Q3'. 官方推薦的工作流長怎樣？什麼時候可以跳過計畫？**（支撐準則 1、2）

Explore → Plan → Implement → Commit，用 Plan Mode 把探索與實作分開：

> "Letting Claude jump straight to coding can produce code that solves the wrong problem. Use plan mode to separate exploration from execution."
> — [Best practices › Explore first, then plan, then code](https://code.claude.com/docs/en/best-practices)

> "Planning is most useful when you're uncertain about the approach, when the change modifies multiple files, or when you're unfamiliar with the code being modified. If you could describe the diff in one sentence, skip the plan." — 同上

**Q4'. 一份好的 spec 長什麼樣？**（支撐準則 1、Q4）

> "The most useful specs are self-contained: they name the files and interfaces involved, state what is out of scope, and end with an end-to-end verification step that proves the feature works. Time spent making the spec precise pays off more than time spent watching the implementation."
> — [Best practices › Let Claude interview you](https://code.claude.com/docs/en/best-practices)

官方也建議「讓 AI 先訪談你」再寫 spec，且寫完換乾淨 session 執行：

> "Claude asks about things you might not have considered yet, including technical implementation, UI/UX, edge cases, and tradeoffs." ... "Once the spec is complete, start a fresh session to execute it. The new session has clean context focused entirely on implementation, and you have a written spec to reference." — 同上

**Q5'. 官方的 TDD 怎麼做？**（支撐準則 3）〔部落格〕

> "Ask Claude to write tests based on expected input/output pairs. Be explicit about the fact that you're doing test-driven development so that it avoids creating mock implementations, even for functionality that doesn't exist yet in the codebase."
> — [Claude Code Best Practices（部落格）](https://www.anthropic.com/engineering/claude-code-best-practices)

> "Ask Claude to commit the tests when it's satisfied with them." — 同上

**Q9'. AI 可以核准 PR 嗎？審查者需要什麼條件？**（支撐準則 5、6、Q10）

不行——官方自家的 [Code Review](https://code.claude.com/docs/en/code-review) 產品（多個特化 AI 並行審 PR）把這條寫死在設計裡：

> "Findings are tagged by severity and don't approve or block your PR, so existing review workflows stay intact."

> "The check run always completes with a neutral conclusion so it never blocks merging through branch protection rules."

審查者必須帶著 **fresh context**，不能讓寫碼的那個 AI 自己審自己：

> "A fresh context improves code review since Claude won't be biased toward code it just wrote."
> — [Best practices › Run multiple Claude sessions](https://code.claude.com/docs/en/best-practices)

實作這種 fresh-context 審查者的官方機制就是 **custom subagent**（在 `.claude/agents/` 放定義檔，指定它的專長、可用工具與模型——EP實作的四視角 reviewer 正是這樣做的，見 Part 3 Q15）：

> "Subagents run in their own context with their own set of allowed tools. They're useful for tasks that read many files or need specialized focus without cluttering your main conversation."
> — [Best practices › Create custom subagents](https://code.claude.com/docs/en/best-practices)

subagent 同時也是探查工具——大量讀檔隔離在分身的 context 裡、只回摘要：

> "Subagents run in separate context windows and report back summaries."
> — [Best practices › Use subagents for investigation](https://code.claude.com/docs/en/best-practices)

以及對「照單全收 AI 發現」的警告：

> "A reviewer prompted to find gaps will usually report some, even when the work is sound, because that is what it was asked to do. Chasing every finding leads to over-engineering."
> — [Best practices › Add an adversarial review step](https://code.claude.com/docs/en/best-practices)

**Q11'. 哪些規則放 CLAUDE.md，哪些要用 hook？**（支撐準則 7）

官方的分界線就是「建議 vs 保證」：

> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."
> — [Best practices › Set up hooks](https://code.claude.com/docs/en/best-practices)

> "Settings rules are enforced by the client regardless of what Claude decides to do. CLAUDE.md instructions shape Claude's behavior but are not a hard enforcement layer."
> — [Memory › Manage CLAUDE.md for large teams](https://code.claude.com/docs/en/memory)

有副作用的自動化流程要鎖成只有人能觸發；核可的責任在人：

> "Use `disable-model-invocation: true` for workflows with side effects that you want to trigger manually."
> — [Best practices › Create skills](https://code.claude.com/docs/en/best-practices)

> "Claude Code only has the permissions you grant it. You're responsible for reviewing proposed code and commands for safety before approval."
> — [Security](https://code.claude.com/docs/en/security)

**Q13'. Context 管理有什麼鐵則？**（支撐準則 10）

> "Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills."
> — [Best practices](https://code.claude.com/docs/en/best-practices)

> "Keep it concise. For each line, ask: *'Would removing this cause Claude to make mistakes?'* If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" — 同上（行數判準 "target under 200 lines" 出自 [Memory](https://code.claude.com/docs/en/memory)）

> "If you've corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches. Run `/clear` and start fresh with a more specific prompt that incorporates what you learned."
> — 同上

**Q14'. 業界前沿還在談什麼？**（準則 8、11 的延伸）

（社群觀點，非官方：Addy Osmani "[Loop Engineering](https://www.oreilly.com/radar/loop-engineering/)"，2026-06。）與其一句句提示 AI，不如設計「什麼觸發 AI、誰驗證產出、何時停止」的迴路。三個可直接入規範的觀念：

1. Unattended（無人在場看管）的 AI 自動化必備四控制：**迭代上限、預算上限、agent 可自評的成功條件、失敗升級路徑**——缺一不放手。
2. 依賴順序：**先觀測 → 再評估 → 才自動化**；量不到的東西不能自動化。
3. **感測器的失效是靜默的**——閘門壞了會擋住人，感測器壞了只是不再記錄；量測設施需要的機械驗證比閘門更多。

---

## Part 3：EP實作怎麼做到？

EP實作是我們的範例專案（單人＋AI 開發），Part 1 的準則在那裡全部落了地。檔案路徑為 EP實作 repo 內的相對路徑。

**Q15. 這些原則聽起來很理想，真的做得到嗎？**

做得到——每條準則在 EP實作都是 enforced（有對應的機械把關）：

| 準則 | EP實作的落地 | 關鍵檔案 |
|---|---|---|
| 1 計畫先行 | 三段式流程：`/plan-feature` 規劃 → `/review-plan` AI 四視角審 → **停等人審** → 人親自啟動實作；實作完成後 `/review-implementation` 用同四視角審 diff，專攔「規劃審過、實作走偏」。hook 機械擋「沒有規劃書就寫產品碼」 | `.claude/skills/plan-feature/`、`.claude/skills/review-implementation/`、`.claude/hooks/feature-plan-guard.py` |
| 2 小步交付 | 規劃書強制「階段切分」，一階段對應一次紅綠循環；CI 檢查分支歷史保持一直線（linear history），鼓勵小步 rebase 而非堆積 | `.claude/skills/plan-feature/`、`.github/workflows/ci.yml`（guards） |
| 3 先紅後綠 | 紅燈測試 commit（`test(red)`）後建立鎖檔，紅燈期 hook **禁止編輯測試檔**；唯一解鎖路徑是檢查全綠 | `.claude/hooks/tdd-test-guard.py`、`scripts/tdd-unlock.sh` |
| 4 必附證據 | PR 範本要求附規劃／審查結論與紅燈 commit hash；部署後打 `/api/health` 比對版本 sha；正式站部署另需**人工核准**（GitHub production environment） | `.github/pull_request_template.md`、`deploy-supabase.yml` |
| 5 AI 找碴 | 用 Claude Code 的 **custom subagent** 功能實作審查分身：`.claude/agents/` 下每個 agent 一個定義檔，frontmatter 限定**唯讀工具**（Read/Grep/Glob）與模型，確保審查者「只能看、不能改、fresh context」。四個 reviewer（系統／架構／UIUX／需求）輸出統一 P0／P1／P2 契約、彙整者明文禁止改判；另有第五個探查用 agent `codebase-scout`，把大量讀檔隔離在自己的 context、只回結論，不污染主對話 | `.claude/agents/plan-reviewer-*.md`、`.claude/agents/codebase-scout.md`、`docs/_templates/review.md` |
| 6 補證據再審 | PR 範本的「流程證據」欄位（規劃／審查結論、紅燈 commit、CI）就是 reviewer 開審前的檢核清單——缺哪項一目瞭然，請 AI 補或退回都有依據 | `.github/pull_request_template.md` |
| 7 機械化 | 9 支 hook 擋 git 後門（`--no-verify`、force push、直推主幹）、TDD 違規、無規劃寫碼；實作 skill 設 `disable-model-invocation: true`——AI 無法自己啟動實作；命名／CI 結構等守則放 `.claude/rules/`（動到對應路徑才自動載入），且各有對應機械檢查 | `.claude/hooks/bash-guard.py`、`.claude/skills/tdd-implement/SKILL.md`、`.claude/rules/` |
| 8 閘門驗證 | 所有自撰檢查器先跑自己的測試案例再實掃；hook 行為有表格化測試；新檢查要求 mutation testing | `scripts/test-hooks.py`、`scripts/framework-check.sh` |
| 9 Ratchet | 覆蓋率門檻設在實測值下緣、紅了擋 commit；bundle 大小同樣走 ratchet | `vitest.config.ts`、`scripts/check-bundle-budget.mjs` |
| 10 Context | CLAUDE.md 維持 200 行內，「啟動固定成本上限」做成 CI 檢查；探查交給 codebase-scout subagent 隔離（見準則 5 列） | `scripts/check-context-budget.py` |
| 11 回填 | 修 bug 流程強制含根因分析＋同類掃描＋防線回填；hook 決策有量測（誤擋率、命中率） | `.claude/skills/fix-bug/`、`scripts/harness-metrics.py` |

**Q16. EP實作哪些做法超出官方基線，值得直接抄？**

1. **「約定會被忽略」當設計公理**：被違反過的約定就升級成機械檢查（防線回填），並用 friction log 追蹤誤擋與漏網、定期整併成框架修訂。範例：`git commit --no-verify` 曾是繞過檢查的口子 → 現在被 hook 直接擋。
2. **審查獨立性的結構化**：官方只說「用乾淨 context 審」；EP實作加上視角分工、嚴重度契約（P0 未處置不得進實作）、「彙整者禁止改判」、「需求對不到規格書＝一律 P0」等硬規則。
3. **閘門的閘門**：mutation testing 抓出過「12 條突變中 2 條檢查空轉」的實證——寫檢查前先問「它空轉時看起來像什麼」。
4. **不可能假綠的測試設計**：全鏈路測試連不上就硬失敗、情境數低於下限就硬失敗——源自一次「27 個情境全 skip 卻顯示全綠」的真實事故。
5. **流程自身有迭代迴圈**：hook 決策量測＋friction log＋定期框架修訂 PR ——規範跟程式碼一樣有 bug、要量測、要修。
6. **規格書防漂移的機械比對**：業務常數、路由、狀態機列舉與規格書逐條機械比對，不同步就 CI 紅；連「比對規則抽取不到值」也算失敗——防止閘門靜默變空轉。規格書因此能一直當 single source of truth 用，AI 審查的需求視角（「對不到規格書＝P0」）也才有可靠的溯源對象（`scripts/check-spec-drift.py`）。

**Q17. EP實作還缺什麼？接下來要導入什麼？**

| 優先 | 項目 | 補什麼縫 |
|---|---|---|
| P1 | coverage ratchet 的「只准調高」目前是註解約定——新增 CI 檢查：門檻被調低即紅，除非附豁免理由 | 閘門參數可被悄悄放鬆（痛點 3 的縫隙型態） |
| P1 | 合併規則加入人類 approve 要求（EP實作目前唯一 required check 是 CI；組織其他專案已有兩位 reviewer，應對齊） | 人的裁決點要機械要求 |
| P2 | PR 規模軟警戒：diff 超標時 CI 留言建議拆分（不硬擋——硬擋會逼出湊行數的壞行為） | 「小步交付」目前只是約定 |
| P2 | 試點官方 [Code Review](https://code.claude.com/docs/en/code-review)＋`REVIEW.md` 作為 PR 開啟後的第二道獨立防線（注意其 check run 永遠中性，要 gate 需自行解析） | 官方新功能未整合 |
| P3 | Outer loop 依序建設：感測器資料累積 → skill 觸發命中率評估 → friction log 整併排程化 → 第一條唯讀自動迴路（先補迭代與預算上限） | Loop/Eval/Observability 仍在初期（Q14' 的依賴順序） |

**Q18. 其他專案想開始，第一步做什麼？**

按成熟度分級導入，每級的達標判準是「enforced」，不是「已宣導」：

- **L0（一天）**：精簡 CLAUDE.md（≤200 行）＋PR 範本要求測試證據＋既有兩位 reviewer 制度寫進 ruleset（required approvals＋CI 綠才可合併）——三個痛點的最低配。
- **L1（一週）**：pre-commit 統一閘門（lint＋型別＋測試）且擋繞過手段；CI 單一匯總 required check；覆蓋率門檻。
- **L2（一個月）**：計畫先行（Plan Mode 或 plan 檔＋人審）；TDD 紅燈證據 commit；AI 多視角審查＋嚴重度契約。
- **L3（持續）**：防線回填；friction log；閘門自檢＋mutation testing；ratchet 指標。
- **L4（前沿，選配）**：先觀測、再評估、才自動化；unattended 迴路必備四控制。

推行方式：找 1–2 個種子團隊照 L0→L1 跑出成功案例再擴散；指定 DRI（明確負責人）維護組織層共用資產；每季回訪剪枝——規則太多會互相稀釋，這點對本規範自身同樣成立。

**Q19. 我們每個階段做的到底是哪一種 Engineering？**

2026 的概念地圖把 AI 開發拆成五層（層 0 方法論／層 1 輸入／層 2 環境／層 3 控制／層 4 回饋）。對照我們實際在做的事：

| 我們做的事 | 學科 | 層 |
|---|---|---|
| 訪談需求、寫 plan.md、對齊規格書、階段切分 | **Spec Engineering** | 1 輸入 |
| 寫 CLAUDE.md、rules、skill 與 reviewer agent 的指示措辭 | **Prompt Engineering**（措辭）＋**Context Engineering**（何時載入什麼：path-scoped rules、context budget、探查隔離、輸出折疊） | 1 |
| friction log、auto-memory 紀律、「決策寫進 git」 | **Memory Engineering** | 1 |
| hooks、permissions、pre-commit、CI 軌道、TDD 鎖、`disable-model-invocation` | **Harness Engineering**（Tool／Permission／Sandbox 都是其子項） | 2 環境 |
| TDD 紅→綠、統一檢查閘門、四視角審查、coverage ratchet、spec drift 檢查、mutation testing | **Evaluation Engineering** 的 verifier 建設；紅綠循環同時是 **inner loop** | 3＋4 |
| hook 決策記錄、誤擋率／命中率彙總 | **Observability Engineering** | 4 回饋 |
| PR 事件訂閱、排程自查、未來的自動診斷迴路 | **Loop Engineering**（outer loop：觸發器、停止規則、升級路徑） | 3 控制 |

一句話：**規劃＝Spec Engineering，日常指示＝Prompt／Context Engineering，守衛體系＝Harness Engineering，紅綠與審查＝Evaluation＋inner loop，metrics＝Observability，自動觸發＝outer loop 的 Loop Engineering。**

實務含義：多數團隊（包含 EP實作）在層 1–2 最成熟，層 3–4 的外迴路最弱。**這不是缺點，是順序**——Q14' 的依賴關係說得很清楚：沒有 Observability 就沒有 Evaluation 基準，沒有基準就不該放手做 Loop。想知道自己該補哪一層，先問「這一層我量得到嗎」。

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
| **Advisory / Enforced** | 規則的兩個強制層級：advisory＝寫在文件裡的建議（AI 與人都可能忽略）；enforced＝由 hook／CI／ruleset 強制、違規做不到 | [Best practices › Set up hooks](https://code.claude.com/docs/en/best-practices) |
| **Mutation testing** | 故意把程式或檢查「改壞」一次，驗證測試／閘門真的會變紅——證明防線不是空轉的標準手法 | [Wikipedia: Mutation testing](https://en.wikipedia.org/wiki/Mutation_testing) |
| **Subagent** | 派出去的「分身」AI：在獨立的 fresh context 裡做探查或審查、只回報結論 | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| **Skill / slash command** | 打包成檔案、可用 `/名字` 呼叫的可重複工作流程，可設定成「只有人能觸發」 | [Skills](https://code.claude.com/docs/en/skills) |
| **Permission / allowlist / deny** | Claude Code 的權限系統：預設唯讀、有動作要人核准；白名單放行安全指令、deny 封鎖敏感檔案 | [Permissions](https://code.claude.com/docs/en/permissions) |
| **Headless mode（`claude -p`）** | 不開互動介面、一條指令執行完的模式，用來把 AI 塞進 CI 或腳本 | [Non-interactive mode](https://code.claude.com/docs/en/headless) |
| **Code Review（官方功能）** | Anthropic 的 PR 自動審查服務：多個特化 AI 並行找碴、驗證後留言，但從不核准也不擋合併 | [Code Review](https://code.claude.com/docs/en/code-review) |
| **REVIEW.md** | 放在 repo 根目錄、專門指揮審查 AI 的最高優先指示檔 | [Code Review › REVIEW.md](https://code.claude.com/docs/en/code-review#review-md) |
| **MCP** | 讓 AI 連接外部工具（GitHub、資料庫…）的開放標準 | [MCP](https://code.claude.com/docs/en/mcp) |
| **TDD（測試驅動開發）** | 先寫「會失敗的測試」定義正確行為，再寫實作讓它變綠——紅綠燈給 AI 明確的自我驗證訊號 | [Best Practices（部落格）](https://www.anthropic.com/engineering/claude-code-best-practices) |
| **Coverage ratchet** | 測試覆蓋率門檻「只准調高、不准調低」的機制（ratchet＝棘輪，只朝一個方向轉的齒輪） | EP實作 `vitest.config.ts` 的做法 |
| **pre-commit hook（git）** | git 原生機制：commit 前自動跑檢查、紅燈就擋（與 Claude Code 的 hook 是兩套東西） | [Git Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks) |
| **CI / required check / ruleset** | CI＝每次 push 自動跑的檢查流水線；ruleset＝GitHub 上「哪些檢查必須綠、要幾個 approve 才准合併」的強制設定 | [GitHub: About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) |
| **Loop Engineering** | 與其一句句提示 AI，不如設計「什麼觸發 AI、誰驗證產出、何時停止」的自動迴路（2026 興起） | [O'Reilly: Loop Engineering](https://www.oreilly.com/radar/loop-engineering/) |
| **Evaluation / Observability（對 agent）** | 對 AI 行為本身的量測（多常做對？）與觀測（實際做了什麼？）——自動化放手前的前提 | 同上 |
| **P0 / P1 / P2** | 審查發現的嚴重度分級：P0＝阻擋（不修不准前進）、P1＝應改、P2＝建議 | EP實作 `docs/_templates/review.md` |

---

*依據與完整比較分析見同目錄 `research.md`（官方引句逐字核對紀錄、EP實作全機制盤點、逐項差距分析）。*
