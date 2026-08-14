# AI Coding 規範前期研究：官方最佳實踐 × Uknow 實作 × 差距與建議

> **這份文件是什麼**：為「制定組織級 AI coding 規範」做的前期研究。依序涵蓋
> (1) Anthropic 官方文件的人機協作最佳實踐、(2) 本專案（Uknow）的實際做法、
> (3) 兩者逐項比較、(4) 初擬優化建議。Guideline 本體的形式與內容待人工決定後另行撰寫。
>
> **要解的三個痛點**（來自需求方主管的觀察）：
> 1. 沒有人在 review code
> 2. 寫一大坨就想上 PR
> 3. 聲稱 test 都沒問題，但 unit test 跑的項目根本不夠
>
> **鷹架聲明**：本檔屬 `docs/plans/` 鷹架（D 級），Guideline 定稿後應升級／刪除。

---

## 1. Anthropic 官方最佳實踐整理

### 1.0 資訊信度說明

- **一手來源**（可直接引用為規範依據）：code.claude.com/docs 官方文件（best
  practices、hooks、memory、permissions、security、code review）、anthropic.com
  的 engineering / research 文章（Building Effective Agents、How Anthropic teams
  use Claude Code、Effective harnesses for long-running agents）。
- **二手來源**（僅作旁證，寫進 Guideline 前應回查原文）：devops.com、tembo.io
  等第三方整理；本文中涉及的**具體成效數字**（如審查誤判率、評論品質提升
  百分比）出自官方部落格對自家產品的描述，屬廠商自述，引用時應標明出處而
  非當成中立實證。

### 1.1 核心哲學：人做決策，AI 做執行，機器做把關

官方各文件反覆出現的三層結構：

| 層 | 負責 | 官方機制 |
|---|---|---|
| **決策**（做什麼、對不對、能不能上線） | 人 | Plan Mode 停等核可、PR 簽核、permission prompt |
| **執行**（怎麼做、寫碼、跑測試、自我迭代） | AI | agentic loop + 回饋迴圈（測試、lint、build） |
| **把關**（絕不允許的事） | 確定性程式 | hooks、permission deny、CI required checks |

關鍵引述（Best Practices）：CLAUDE.md 這類提示層規則是**建議性**的，模型可能
在長對話中忽略；**必須遵守的規則要用 hooks（確定性程式碼）承載**，因為
hooks 保證執行、不依賴模型記得。這是官方對「靠叮嚀 vs 靠機制」最明確的表態。

### 1.2 Explore → Plan → Code → Commit：計畫先行

官方推薦的標準工作流（Best Practices）：

1. **Explore**：先讓 Claude 讀相關檔案、理解現況，**明確要求先不要寫碼**
   （Plan Mode 下模型只能讀不能改，是這一步的結構化版本）。
2. **Plan**：要求產出實作計畫；複雜任務用延伸思考。**人在這裡審計畫**——
   這是整個流程中投報率最高的人審點，因為改計畫比改一坨程式碼便宜得多。
3. **Code**：依審過的計畫實作，實作中要求邊做邊驗證。
4. **Commit / PR**：提交、開 PR、更新文件。

官方明講：跳過前兩步「直接叫 AI 寫」對簡單任務可以，但對需要前期思考的
問題，**省掉探索與規劃會讓 Claude 解決錯誤的問題**——這正是「寫一大坨就上
PR」的官方病因診斷：不是 AI 寫太多，是沒有在便宜的階段（計畫）攔截。

任務切分層面，Building Effective Agents 給出可組合的分解模式：
**prompt chaining**（步驟間插驗證閘）、**orchestrator-workers**（動態拆子任務
派工）、**parallelization**（獨立子任務並行／同一任務多視角投票）。共同原則：
**每個子單元要小到可獨立驗證**，複雜度只有在明確帶來效益時才增加。

### 1.3 TDD 與驗證紀律：證據，不是聲稱

官方把 TDD 稱為「與 agentic coding 協作最有效的模式之一」（Best Practices），
流程重點：

1. 先寫**會失敗的測試**，明確告訴 AI「先不要寫實作」。
2. **確認測試真的紅**——防「本來就會過」的假測試。
3. **把紅燈測試 commit 起來當檢查點**——之後若 AI 改測試遷就實作，diff 會揭露。
4. 再讓 AI 實作到綠，過程中 AI 以測試結果自我迭代。
5. 人審時核對「實作沒有動測試」。

背後的通用原則（Best Practices／Effective Harnesses）：**給 AI 一個它可以
自己跑的驗證迴圈**（測試、型別檢查、lint、截圖比對），成果的判準是
**外部預言（oracle）的輸出**，不是模型自己的宣稱。對應到痛點 3：
「聲稱 test 都沒問題」之所以成立，是因為驗證標準掌握在寫程式的那一方手上
——官方解法是把判準外部化（獨立測試、CI、覆蓋率門檻），並要求**出示證據**
（測試輸出、指令回傳、截圖），而非接受「已完成」三個字。

### 1.4 Review：獨立視角、自動找碴、人做裁決

- 官方 Code Review 功能的設計：PR 開啟時派**多個特化 agent 並行**檢查
  （邏輯錯誤、邊界條件、API 誤用、安全、慣例），發現先經**驗證步驟**再彙整
  去重、按嚴重度分級（Important / Nit / Pre-existing）評論到 PR 上。
  **agent 不核准 PR**——找問題是 AI 的事，處置是人的事。
- 官方部落格自述的成效（廠商自述，引用需標明）：千行級 PR 有 84% 被找出
  問題、誤判率 <1%、部署後 PR 上實質審查評論比例 16%→54%。
- Subagents 文件的通則：審查應由**乾淨 context 的獨立 agent** 執行，避免
  寫碼者的偏誤污染審查（同一 context 既寫又審，等於自己改自己的考卷）。
- 多 Claude 協作模式（Best Practices）：一個寫碼、另一個獨立 review、第三個
  依 review 修改——「分離的 context 帶來更好的結果」。

### 1.5 Context 管理：CLAUDE.md 是憲法，不是百科

- CLAUDE.md 是每個 session 唯一自動載入的檔案，應**精簡**（官方社群共識約
  ~200 行量級）：只放 AI 猜不到的指令、偏離預設的慣例、repo 禮儀、已知陷阱；
  不放 AI 讀碼就能推斷的東西。判準：「刪掉這行 AI 會出錯嗎？不會就刪」。
- 階層式載入：全域 `~/.claude/CLAUDE.md` → 專案根 → 子目錄（讀到才載入），
  組織標準與專案特化可以分層共存。
- Context 衛生：換任務就 `/clear`；同一錯誤糾正兩次仍錯就重開 session 換更好
  的初始提示，不要在髒 context 裡拉鋸；大範圍探索用 subagent 隔離，別讓
  主 context 塞滿檔案內容。

### 1.6 權限與安全邊界

- 權限模式從「每步都問」到「全自動」是一條信任光譜（plan / default /
  acceptEdits / dontAsk / bypassPermissions…），官方建議**從嚴起步、隨信任
  放寬**，且自動化程度越高越要有沙箱與 deny 清單兜底。
- 敏感路徑用 permission deny 保護（如 `.env`、金鑰檔、CI 設定），危險指令用
  PreToolUse hook 硬擋。官方安全文件明講：分類器與模型判斷都有漏接率，
  它們是**縱深防禦的其中一層**，不是沙箱或 review 的替代品。

### 1.7 團隊層面採用

- 指定 **DRI**（配置負責人）管 CLAUDE.md、permissions、hooks、skills 的演進；
  大組織用跨職能小組（工程＋資安＋治理）。
- 共享資產進 git：團隊共用的 slash commands / skills / agents / hooks 放進
  repo 的 `.claude/`，讓「流程」跟著 checkout 走，而不是留在個人腦裡。
- 推行方式：官方經驗偏好**黑客松／種子使用者**模式（先讓一小群人做出成功
  案例、變成導師，靠網路效應擴散），勝過由上而下的分階段強制。
- CI 整合：headless（`claude -p`）跑自動化任務；配置要**定期回訪剪枝**
  （規則太多會互相稀釋）。

### 1.8 官方點名的反模式

| 反模式 | 症狀 | 官方修法 |
|---|---|---|
| Kitchen-sink session | 一個 session 混多個無關任務，context 全是雜訊 | 換任務就 `/clear` |
| 反覆糾正迴圈 | 同一錯誤糾正 ≥2 次還在錯 | 停止拉鋸，`/clear` ＋ 帶著學到的東西重寫初始提示 |
| CLAUDE.md 過肥 | 幾百行規則，AI 開始忽略一半 | 當程式碼一樣審與剪枝 |
| 信任-驗證落差 | 看起來合理的實作、沒有邊界測試，上線才爆 | 沒有可驗證的檢查就不算完成 |
| 無界限探索 | 「幫我看看整個 codebase」→ 讀兩百個檔 | 用 subagent 隔離、縮小範圍 |
| AI 改測試遷就實作 | 測試「都過了」但斷言被動過 | 紅燈測試先 commit，diff 揭露竄改 |

### 1.9 2026 概念地圖：從 Prompt 到 Loop（社群前沿，官方文件之外）

（此節整理自前次 session 的統整，來源含 Anthropic 的 Boris Cherny、Peter
Steinberger、Addy Osmani 等——屬**業界前沿共識**而非官方文件，寫進規範時
應標注來源層級。）

世代遞進：**Prompt**（語言）→ **Context**（資訊）→ **Harness**（環境）→
**Loop**（控制）。2026 年 6 月的分水嶺論述：「不要再 prompt agent，要設計
prompt agent 的迴路」。完整分層：

| 層 | 學科 |
|---|---|
| 0 方法論 | AI-Native Engineering |
| 1 輸入 | Prompt / Context / Spec / Memory Engineering |
| 2 環境 | Harness（傘狀）/ Tool / Skills / Permission / Sandbox |
| 3 控制 | **Loop Engineering**——觸發器、拓撲、驗證器、停止規則 |
| 4 回饋 | **Evaluation**（outcome / process / trajectory）/ **Observability** |

對制定規範最有用的三個觀念：

1. **「瓶頸是驗證器，不是模型」**——模型產碼能力已超過組織驗證它的能力；
   規範的重心應放在驗證器（測試、審查、閘門、感測器）的建設，而非限制
   模型怎麼寫。這句話直接回應三個痛點的共同根源。
2. **生產環境的四個必要控制**：迭代上限、預算上限、agent 自己能評估的
   成功條件、失敗升級路徑。任何「放手讓 AI 自動跑」的流程缺一不可。
3. **Loop / Eval / Observability 有依賴關係**：你不能自動化一個你量不到的
   東西——先有觀測（Observability）才有基準（Evaluation），有量測才敢放手
   （Loop）。組織導入自動化時的順序約束。

---

## 2. Uknow 專案的實際做法

（完整盤點含檔案路徑見附錄 A；此節按機制濃縮，並標注**機械強制**或**約定**。）

### 2.1 三段式流程：規劃 → 審查 → 停等人審 → 實作 → 終審

```
/plan-feature <slug>          四面向（需求/系統/架構/UIUX）規劃、階段切分
      ↓ 自動接
/review-plan                  四個 fresh-context subagent 平行審規劃
      ↓                       主 session 只彙整不改判，產出 P0/P1/P2
   【停：等人審】              P0 未處置不得進實作
      ↓ 人親自打
/tdd-implement <slug>         逐階段紅→綠 TDD，紅燈期上鎖
      ↓ 收尾自動接
/review-implementation        同四視角審 diff，必答「實作是否偏離規劃」
```

支撐這條流程的兩道**機械**鎖：

- `feature-plan-guard.py`（PreToolUse hook）：`feature/*` 分支上不曾存在
  `docs/plans/<slug>/plan.md` 就**擋掉** `src/**`、`supabase/functions/**` 寫入
  ——「規劃先行」不是叮嚀，是寫不進去。
- `/tdd-implement` 的 frontmatter 設 `disable-model-invocation: true`：
  AI **無法自己觸發實作階段**，只有人打得動——「人審通過才實作」的保證
  來自這一行，而非流程圖上的箭頭。

### 2.2 Hook 層：確定性守衛（全部機械）

- `bash-guard.py`：擋六類後門——覆寫 `core.hooksPath`、`git commit
  --no-verify`、`--force` push（只准 `--force-with-lease`）、直推
  main/develop、本機跑 journey、開分支不指定 base 或以 main 為 base。
- `tdd-test-guard.py`：紅燈期（`.claude/tdd-lock` 存在）**禁改測試檔**——
  官方靠「commit 測試後看 diff」事後揭露竄改，本專案直接事前擋掉。
- `pre-push-rebase.sh`：push／開 PR 前自動 rebase 到 origin/develop；會改寫
  遠端歷史時停下來要求人明確下令。
- `check-output-filter.py`：驗證指令綠燈輸出折疊成一行、紅燈原樣——降低
  「綠燈刷屏淹沒紅燈」的 context 污染。
- `decision_log.py`：每次 hook 決策記錄成 metrics（誤擋率、命中率），
  由 pre-commit 落檔進 git——**守衛本身被量測**。
- `permissions.deny` 擋讀 `.env*` 等敏感檔。

### 2.3 TDD 相位鎖與 pre-commit 閘門（機械）

- 紅燈：commit `test(red)` 為證據 ＋ `touch .claude/tdd-lock` 上鎖；pre-commit
  紅燈通道只跑 biome/tsc/knip（紅燈定義：編譯過、斷言失敗）。
- 綠燈：`scripts/tdd-unlock.sh` 是**唯一合法解鎖**，`npm run check` 全綠才刪鎖。
- pre-commit 由 `npm ci` 的 prepare 自動掛載，跑統一閘門 `npm run check`
  （biome＋typecheck＋vitest＋knip）；`--no-verify` 被 bash-guard 擋。

### 2.4 審查層：做事者不自評（結構機械、內容 AI）

- 四個 `plan-reviewer-*` subagent（系統／架構／UIUX／需求），唯讀工具、
  fresh context、不自動觸發、由 skill 顯式派工。
- 需求視角有硬規則：「需求對不到規格書章節又沒列開放問題＝一律 P0」——
  把「做了規格外的東西」變成阻擋級發現。
- 審查輸出契約單一定義於 `docs/_templates/review.md`：P0 阻擋／P1 應改／
  P2 建議；明訂「無缺口要明講，禁止為交差發明問題」「不確定標『需人工
  裁決』」。主 session 彙整時**明文禁止改判**。
- `/review-implementation` 專攔「規劃審過、實作走偏」：每個 reviewer 必答
  「實作有沒有偏離 plan」，並核對「新增行為有對應測試、紅→綠而非事後補寫」。

### 2.5 CI 軌道與部署（機械）

- 分層閘門：guards（秒級：框架健檢＋linear history＋migration 守衛）→
  static / unit / build / api / e2e / journey-offline 並行 → 匯總到唯一
  required check `ci-ok`。
- 晉升 develop→main 的 PR 自動跑 `journey-full`（30–90 分鐘、真後端拋棄式
  分支），且對它單獨要求 success（skipped 不算過）——上線前必過全鏈路。
- journey 套件「不可能假綠」：連線失敗即硬失敗、情境數低於下限即硬失敗
  （源自 2026-07-21「27 個情境全 skip 卻顯示全綠」真實事故）。
- 正式站部署綁 GitHub production environment，**人工核准**才動線上；部署後
  打 `/api/health` 比對 sha 確認線上跑的就是這個 commit。

### 2.6 覆蓋率棘輪（半機械）

- vitest coverage thresholds 設在最近實測值下方一點點，**用途是擋退步**，
  不是目標值；不過門檻＝check 紅＝commit 被擋（機械）。
- 「只准往上、調低必須在 PR 寫明理由」這條規則本身**沒有機械檢查**，
  目前是註解裡的社會契約＋人工 review 把關（已知縫隙，見 §4.1）。

### 2.7 框架自檢與長期記憶（本專案特色）

- `framework-check.sh` 統籌十餘支檢查器：hook 行為表格測試（`test-hooks.py`
  ——**守衛自己也有紅綠燈**）、workflow 命名結構、測試命名分層、規格書漂移
  （`check-spec-drift.py`：業務常數／路由／狀態機與規格書逐條比對，**抽不到
  值視為失敗**，防閘門靜默變 no-op）、migration 版本唯一、context 預算
  （CLAUDE.md／rules 的啟動成本上限——官方「保持精簡」的機械化）、
  e2e 必留情境、bundle 預算棘輪。所有檢查器**先跑自己的 self-test 再實掃**。
- `fix-bug` skill 的**防線回填**：每個 bug 修完必答「為什麼既有的
  CI／hook／測試沒攔到」，把漏網變成新防線；**同類掃描**：grep 全庫找同病灶。
- `friction-log.md`：框架自身的誤擋／漏網／重複糾正單一彙整點，每 2 個
  feature 或雙週整併成框架修訂 PR——**流程本身有迭代迴圈**。
- 文件四級權威分級（規範／現況／長期記憶／鷹架）；規格書與程式碼衝突時
  以程式碼為準、同 PR 回修規格書（spec-drift 機械把關）。

### 2.8 已知的自我診斷：閘門強、迴路弱（前次 session 的架構檢視結論）

前次 session 用 §1.9 的概念地圖對本專案評分：AI-Native / Context / Harness
9 分（頂尖——框架自己像 code 一樣走 PR＋CI 演進），Spec / Permission /
Prompt 8，Sandbox 6（無 worktree），**Loop Engineering 4（內迴路一流、
外迴路不存在）、Evaluation 3（驗軟體、驗設定，唯獨不驗 agent 行為）、
Observability 2**。核心診斷：

> **這是一套全部由閘門構成、（當時）沒有任何感測器的 harness。**

據此已完成 **Step 1 感測器**（PR #161／#165 已合併）：`decision_log.py` 記錄
每次 hook 決策、pre-commit 落檔、`harness-metrics.py` 彙總誤擋率與 skill
命中率。過程中沉澱了三條可複用通則（已入 friction-log）：

1. **感測器的失效是靜默的**——閘門壞了會擋住人，感測器壞了只是不再記錄，
   少報的讀數看起來跟「真的沒事」一樣；量測設施需要的機械驗證比閘門更多。
2. **hook 的並行是預設，不是例外**——唯讀 hook 沒踩到只是運氣。
3. **歸納出一條原則的那一刻，就是該拿它掃一遍全庫的時刻**——根因愈清楚、
   原則抽得愈漂亮，愈容易把「講清楚了」當成「修完了」。

另一條實證教訓：Step 1 落地過程抓到三個 bug，**沒有一個是既有閘門抓到的**
（分別靠端到端手動驗證、突變測試、下一輪自己撞上）；12 條突變有 2 條一度
存活——「檢查看起來在跑，對那個突變卻空轉」。因此本 repo 對自撰閘門的
既有要求是**突變驗證**：新增任何檢查都要證明「改壞它會紅」。

待辦路線（依序，不可跳）：等感測器累積約一週資料 → **Step 2** skill 觸發
eval（量「該觸發的 skill 沒觸發」的機率）→ **Step 3** friction-log 整併排程化
→ **Step 4** 第一條真外迴路（claude-code-action 讀 triage issue 產唯讀診斷），
且必須先補齊四個生產控制中缺的兩個（迭代上限、預算上限）。

---

## 3. 官方 × Uknow 逐項比較

### 3.1 對照總表

| 官方原則 | 官方建議的做法 | Uknow 的落地 | 評註 |
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

### 3.2 Uknow 超越官方基線的五個做法（值得寫進組織規範的「輸出品」）

1. **「advisory 會被忽略」當作設計公理**：官方說重要規則用 hooks；本專案
   進一步把「哪些規則值得機械化」做成方法論——被違反過的約定就升級成
   hook／CI 檢查（防線回填），並用 friction-log 追蹤誤擋率。
2. **做事者不自評的結構化**：審查者 fresh context＋唯讀＋輸出契約＋
   「主彙整者禁改判」＋「對不到規格書＝P0」。這比官方「用 subagent review」
   的一句話具體得多，是可直接移植的資產。
3. **閘門自己也要有紅綠燈，且要突變驗證**：hook 有行為測試、檢查器有
   self-test、規格書抽取失配即紅（防閘門靜默失效）、journey 假綠防禦；
   新增任何檢查都要證明「改壞它會紅」（突變驗證），並在寫測試前先問
   「它空轉時看起來像什麼」。官方文件沒有涵蓋「守衛的守衛」這一層。
4. **證據鏈貫穿全程**：`test(red)` commit hash 是 TDD 的證據、PR 範本要求
   附審查結論、部署後 sha 比對是上線的證據——每個「聲稱」都有對應的
   可查驗物。
5. **流程有自己的迭代迴圈**：harness metrics＋friction-log＋雙週框架修訂
   PR。規範不是寫完就完，跟程式碼一樣有 bug、要量測、要修。

### 3.3 Uknow 相對官方（或相對痛點）的缺口

1. **人審 PR 沒有機械保證**：唯一 required check 是 `ci-ok`（CI）；AI 四視角
   審查很強，但「至少一個人類 approve 才能合併」目前不在 ruleset 裡強制。
   對照痛點 1（沒人 review），官方立場明確：AI 找問題、**人做裁決**——
   人的裁決點應該被機械要求，而不只是文化。
2. **PR／階段規模沒有機械上限**：階段切分是 skill 裡的約定，diff 行數、
   單 PR 檔案數沒有檢查。官方也只有原則（一句話描述不了就拆）沒有機制，
   兩邊在此都停在約定層。
3. **覆蓋率棘輪的「只准往上」未機械化**：門檻值本身可被調低，只靠註解與
   人工 review 守著——這正是痛點 3 的縫隙型態（測試閘門存在，但閘門的
   參數可被寫碼方悄悄放鬆）。
4. **官方 Code Review 功能（`/code-review`／REVIEW.md）未整合**：本專案的
   四視角審查發生在 merge 前的 session 內；PR 開啟後的自動 inline 審查
   （官方新功能）可作為第二道獨立防線，兩者互補不重複。
5. **組織層抽象不存在**：一切都在單 repo。要給其他團隊用，需要抽出
   「與 Uknow 業務無關的可複用層」（見 4.2 的分層建議）。
6. **外迴路（Loop / Eval / Observability）仍在建設初期**（§2.8 的自我診斷）：
   感測器（Step 1）剛上線、資料還不足以當訊號；skill 觸發命中率沒被量過
   （`feature-plan-guard` 自承啟發式觸發「不保證每次都中」）；排程 workflow
   失敗開的 triage issue 沒有任何東西會去讀。依賴順序是 Observability →
   Evaluation → Loop，不能跳著補。這一條同時是對官方文件的補充：官方
   內容集中在層 0–2（方法論／輸入／環境），層 3–4 目前主要靠社群前沿
   （§1.9）與本專案自己的實證。

### 3.4 三個痛點的官方解法 × Uknow 解法對照

**痛點 1：沒人 review code**

| 官方 | Uknow |
|---|---|
| 多 agent 自動審查 PR、人做最終裁決；審查用獨立 context | 規劃審（4 subagent）＋實作審（同 4 視角對 diff）＋P0 阻擋＋停等人審的機械鎖 |

→ 共同結論：**review 要拆成「AI 找碴（可以很多、很便宜）」與「人裁決
（不能省、要機械要求）」兩件事**。組織規範應同時規定兩者，只推其一都會失敗
（只有 AI 審＝沒人負責；只要求人審＝回到人力瓶頸，然後大家開始橡皮圖章）。

**痛點 2：寫一大坨就想上 PR**

| 官方 | Uknow |
|---|---|
| Explore→Plan 先行，人審計畫；子任務小到可獨立驗證；一 PR 一邏輯功能 | 規劃未過人審寫不了碼（hook 擋）；階段切分＋一階段一紅綠；linear history |

→ 共同結論：巨型 PR 是**流程上游的病**（沒有計畫審查點），下游用「PR 行數
上限」硬擋只治標。規範應把攔截點放在計畫階段，輔以 PR 規模的軟性警戒。

**痛點 3：聲稱測試都過，但涵蓋不夠**

| 官方 | Uknow |
|---|---|
| TDD（測試先紅、commit 為證）；驗證外部化；要求出示證據 | 紅燈證據 commit＋紅燈期禁改測試＋覆蓋率棘輪＋假綠防禦＋review 核對「行為有對應測試」 |

→ 共同結論：**「測試都過」永遠不足採信，除非 (a) 判準在寫碼方控制之外
（CI、覆蓋率門檻、必留情境清單），且 (b) 有紅→綠的證據鏈**。規範的措辭
應該是「出示證據」而不是「要誠實」。

---

## 4. 初擬優化建議

### 4.1 對 Uknow 本身（回填 §3.3 的縫隙）

| 優先 | 建議 | 對應縫隙 |
|---|---|---|
| P1 | Ruleset 加「至少 1 個人類 approval」為合併條件（AI 審查結論附在 PR 供人裁決） | 人審無機械保證 |
| P1 | 新增 `check-coverage-ratchet.py`：比對本 PR 與 base 的 thresholds，調低即紅、除非 commit message／PR 帶豁免標記與理由（接進 framework-check 軌） | 棘輪可被靜默調低 |
| P2 | guards 軌加 PR diff 規模**軟警戒**（如 >800 行非鎖檔變更時留言提示拆分，不硬擋——硬擋會逼出湊行數的壞行為） | PR 規模無檢查 |
| P2 | 試點官方 `/code-review`＋`REVIEW.md`（把 review.md 契約的 P0/P1/P2 語義翻譯過去），作為 PR 開啟後的第二道獨立防線 | 官方新功能未整合 |
| P3 | 把「同類掃描／防線回填」從 fix-bug skill 的內文抽成 checklist，供無框架的 repo 也能人工執行 | 組織化前置 |
| （已排程） | 外迴路建設照前次 session 的 Step 2→3→4 依序走：等感測器資料約一週 → skill 觸發 eval（CI 上、只在 `.claude/**` 變更時跑、軟警戒不硬擋）→ friction-log 整併排程化 → 第一條唯讀外迴路（claude-code-action 讀 triage issue），Step 4 前先補迭代與預算上限 | Loop/Eval/Observability |

（注：外迴路路線已有明確順序與前置條件，本次 Guideline 工作不應與其搶跑，
只需在規範中引用其原則。）

### 4.2 對組織規範的方向建議（給主管的初步框架）

**核心主張：規範的單位不是「條文」，是「機制」。** Uknow 的經驗與官方文件
一致指向：寫在文件裡的約定（advisory）在 AI 高速產碼的環境下衰減極快，
存活下來的規則全是有 hook／CI／ruleset 承載的。因此建議 Guideline 採
**成熟度階梯**，讓不同團隊按能力分級採用，但每一級都以「機械承載」為
達標判準，而不是「已宣導」：

- **L0 起步（一天內可完成）**：repo 有精簡 CLAUDE.md（≤200 行）；PR 範本
  要求附「測試證據」（輸出貼文或 CI 連結）；ruleset 要求 1 人類 approve＋
  CI 綠才可合併。→ 直接處理三個痛點的最低配。
- **L1 閘門（一週）**：pre-commit 統一閘門（lint＋型別＋測試）且擋
  `--no-verify`；CI 單一 required 匯總 check；覆蓋率門檻（先有，再談棘輪）。
- **L2 流程（一個月）**：計畫先行（Plan Mode 或 plan 檔）＋人審計畫才實作；
  TDD 紅燈證據 commit；AI 多視角審查（subagent 或官方 Code Review）＋
  嚴重度契約（P0 阻擋語義）。
- **L3 自癒（持續）**：防線回填（每個漏網 bug 問「為什麼閘門沒攔到」並
  新增檢查）；friction-log；閘門自檢（檢查器要有 self-test＋突變驗證）；
  棘輪類指標（覆蓋率／bundle 只准向好）。
- **L4 迴路（前沿，選配）**：先觀測（量閘門出手率、誤擋率、AI 產出的
  返工率）→ 建 eval 基準 → 才談自動化外迴路（如 AI 自動讀 CI 失敗開
  診斷）。任何無人值守的 AI 迴路必備四控制：**迭代上限、預算上限、
  agent 可自評的成功條件、失敗升級路徑**——缺一不放手。

貫穿各級的三條元原則（值得放在 Guideline 開頭）：

1. **瓶頸是驗證器，不是模型**——規範的每一條都應該回答「這讓驗證變強了
   嗎」，而不是「這限制了 AI 什麼」。
2. **證據不是聲稱**——「做完了」「測試都過」不可採信，採信的是外部 oracle
   的輸出與可查驗的證據鏈（紅燈 commit、CI 連結、覆蓋率數字、部署 sha）。
3. **advisory 會衰減，重要規則要機械承載**——且承載規則的閘門與感測器
   自己也要被驗證（突變驗證；感測器的失效是靜默的，需要比閘門更多的
   機械檢查）。

**三個痛點在規範中的對應條目（最小集）**：

1. 沒人 review → 「AI 找碴＋人裁決」雙軌都是合併的機械前提（ruleset），
   AI 審查結論必須附在 PR 上供人裁決，人不對 AI 沒看過的 diff 簽名。
2. 一大坨上 PR → 計畫審查點前置（L2）；PR 一句話描述不了就拆；規模軟警戒。
3. 測試聲稱 → 「證據不是聲稱」入規範：PR 必附測試輸出／CI 連結；測試
   先紅後綠（紅燈 commit 為證）；覆蓋率門檻由 CI 持有、調低需書面理由。

**推行方式**（官方經驗）：不要全組織分階段強制；找 1–2 個種子團隊照
L0→L1 跑出成功案例（黑客松形式），種子成員當導師擴散；指定 DRI 維護
組織層 `.claude/` 資產；每季回訪剪枝（規則太多會互相稀釋——這點對規範
文件本身同樣成立）。

---

## 5. 下一步

以上為研究與比較的完整內容。待決定（人工裁決）：

1. Guideline 的**受眾與形式**：給主管參考的組織級文件？單頁原則＋附錄機制？
   還是可直接發給工程師的操作規範？
2. Guideline 的**語言與長度**、是否包含 Uknow 的具體檔案作為範例附錄。
3. §4.1 的 Uknow 自身優化是否另開 issue／feature 處理（與 Guideline 分開；
   外迴路的 Step 2–4 已有既定順序，不在本次範圍）。

> 注：前次 session（AI-Native 架構檢視 → Step 1 感測器）的交接內容已整合
> 進 §1.9、§2.8、§3.3-6 與 §4；其評分、診斷與三條通則是本文件「層 3–4」
> 素材的主要來源。

---

## 附錄 A：Uknow 機制的關鍵檔案索引

- 流程總覽：`CLAUDE.md`；hook 掛載：`.claude/settings.json`
- Hooks：`.claude/hooks/{bash-guard,tdd-test-guard,feature-plan-guard,check-output-filter,deletion-residue-check,model-effort-advisor,decision_log}.py`、`{pre-push-rebase,session-bootstrap}.sh`
- Skills：`.claude/skills/{plan-feature,review-plan,tdd-implement,fix-bug,review-implementation}/SKILL.md`
- Reviewer agents：`.claude/agents/plan-reviewer-{system,architecture,uiux,requirements}.md`；審查契約：`docs/_templates/review.md`
- 治理腳本：`scripts/framework-check.sh` 及其統籌的 `check-*.py`、`test-hooks.py`、`tdd-unlock.sh`、`harness-metrics.py`；pre-commit：`scripts/git-hooks/pre-commit`
- CI／部署：`.github/workflows/{ci,deploy-supabase,journey,deployment-queue-audit}.yml`；規則：`.claude/rules/github-actions.md`
- 覆蓋率棘輪：`vitest.config.ts`；文件分級：`docs/README.md`；摩擦紀錄：`docs/plans/friction-log.md`

## 附錄 B：官方來源清單

一手（規範依據）：
- Best practices：https://code.claude.com/docs/en/best-practices
- Hooks：https://code.claude.com/docs/en/hooks-guide
- Memory / CLAUDE.md：https://code.claude.com/docs/en/memory
- Permissions：https://code.claude.com/docs/en/permissions ・ Security：https://code.claude.com/docs/en/security
- Code Review：https://code.claude.com/docs/en/code-review
- Building Effective Agents：https://www.anthropic.com/engineering/building-effective-agents
- Claude Code Best Practices（blog）：https://www.anthropic.com/engineering/claude-code-best-practices
- How Anthropic teams use Claude Code：https://www.anthropic.com/news/how-anthropic-teams-use-claude-code
- Effective harnesses for long-running agents：https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

二手（旁證，引用前回查）：devops.com、tembo.io 等第三方整理；官方部落格中
關於 Code Review 成效的自述數字。
