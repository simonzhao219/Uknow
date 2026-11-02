# Uknow 文件索引

每份文件的**權威性**與**生命週期**不同，讀之前先看它屬於哪一類。
搞混會出事：把一次性報告當規格，或把已上線的設計草案當現況，
都比沒有文件更糟。

## 權威性分級

| 級別 | 意思 | 屬於這級的文件 |
|---|---|---|
| **A・規範** | 是規則本身。程式碼與它衝突時，兩邊都要處理（以程式碼為準，同一個 PR 回頭修文件） | 規格書、UI/UX 準則、可恢復性契約 |
| **B・現況說明** | 描述現在長什麼樣。過期就是 bug，發現即修 | 各 README、Supabase 設定清單、journey 測試設計 |
| **C・長期記憶** | 只增不改的紀錄。不會過期，因為它記的是「當時發生了什麼」 | friction-log |
| **D・鷹架** | 施工用，用完即刪 | `plans/<slug>/`（plan / review / progress）、`_templates/` |

> **真相順序**：功能上線後，**程式碼與測試是真相**，文件是索引與意圖。
> 任何 A 級文件裡的行為斷言，都應該能在程式碼裡找到對應。

---

## 文件清單

### A・規範

| 文件 | 何時讀 |
|---|---|
| [`uknow-software-specification.md`](uknow-software-specification.md) | **動任何功能前。** 需求與業務規則的單一事實來源——會員/訂閱/推薦/獎勵/任務/提領/刊登的規則都在這裡。`plan-reviewer-requirements` 以它為溯源對象 |
| [`ui-ux-guidelines.md`](ui-ux-guidelines.md) | 動任何 UI。尺寸/觸控/導覽契約/表單/三態/可測試性慣例；色彩、按鈕三分法、選取與聚焦、文案（§12） |
| [`multi-step-flow-recovery.md`](multi-step-flow-recovery.md) | 動多步驟表單或金流頁。四條可恢復性契約 + 全站連續流程盤點 |

### B・現況說明

| 文件 | 何時讀 |
|---|---|
| [`../README.md`](../README.md) | 第一次接觸這個 repo |
| [`../CLAUDE.md`](../CLAUDE.md) | AI 助理的操作手冊：開發流程、閘門、分支與部署慣例 |
| [`../supabase/README.md`](../supabase/README.md) | 動後端 schema／函數。SSOT 設計、資料表、關鍵函數、migration 慣例 |
| [`supabase-setup-checklist.md`](supabase-setup-checklist.md) | Supabase 環境問題。程式碼之外必須在 Dashboard 手動完成的設定 |
| [`claude-code-token-best-practices.md`](claude-code-token-best-practices.md) | 調整 hook／權限／CLAUDE.md／subagent 模型設定前。官方 token 效率 best practice 的採用現況與缺口，以及 token/context 治理的分層架構、四條不變式、放置演算法與預算模型；由 `scripts/check-context-budget.py` 機械把關 |
| [`e2e-journey-test-design.md`](e2e-journey-test-design.md) | 動 journey 測試。六代 30 人情境的設計與決策 |
| [`../e2e/README.md`](../e2e/README.md) | 動全 mock 的 e2e 套件 |
| [`../e2e/journey/README.md`](../e2e/journey/README.md) | 跑 journey 套件（**絕不在本機跑**） |

### C・長期記憶

| 文件 | 何時讀／寫 |
|---|---|
| [`plans/friction-log.md`](plans/friction-log.md) | 框架自身出現摩擦時**寫**（誤擋/漏網/重複糾正/存量債）；每 2 個 feature 或雙週整併成框架修訂 PR |

### D・鷹架

| 位置 | 說明 |
|---|---|
| [`_templates/`](_templates/) | `plan.md` / `review.md` / `progress.md` / `fix.md`——由 skill 實例化，勿手動複製 |
| `plans/<slug>/` | 施工中的規劃書。**PR 前刪除**（`/tdd-implement` 收尾負責）；值得長期保存的決策要升級進規格書或 friction-log |

`docs/plans/` 平常**只該有 `friction-log.md`**。看到別的目錄，代表有 feature
正在施工，或有人忘了收尾。

---

## 慣例

**檔名 kebab-case。** 全小寫、連字號分隔(`README.md` / `CLAUDE.md` /
`SKILL.md` 例外——工具依固定檔名辨識)。原則與理由見
[`../.claude/rules/document-naming.md`](../.claude/rules/document-naming.md),
由 `scripts/check-document-naming.py` 機械把關(framework-check 軌)。

**規則只寫一份。** 業務規則一律寫進規格書，其他文件用連結指過去。
過去曾出現「規格書寫 120P、後端 README 寫 120P、實作是 100P」的三方漂移
——同一條規則存兩份，遲早會有一份是錯的。

**規格書的可驗證事實有機器盯著。** `scripts/check-spec-drift.py`（framework-check 軌）
把規格書的業務常數、路由表、狀態機列舉、引用路徑與程式碼逐條對上，兩邊都從真實
檔案抽取、不設會自己漂移的錨點。**抽不到值視為失敗**——否則改個措辭就能讓閘門
靜默變成 no-op，而那正是本專案付過學費的教訓（見 friction-log 的 paths-filter 一則）。
新增可驗證的規則時，順手在該腳本補一條規則與表格案例。

**會變的數字不寫死在文件。** 獎金額度、推薦王門檻的執行期真相是資料表
`reward_config`。文件寫現值時要一併標明來源，讓調參的人知道去哪改。

**設計草案上線後就該退場。** 落檔的規劃是施工鷹架：值得長期保存的決策
**升級**進規格書／本索引所列的 A 級文件／friction-log，其餘隨 commit 清掉。
內容不會消失——`git show <hash>:<path>` 永遠取得回。

> 因此，**歷史 migration 的檔頭註解可能指向已退場的設計文件**——那是
> 當時的正確紀錄，不要為了讓連結有效而去改已套用的 migration，
> 需要原文時用 `git log --diff-filter=D -- <path>` 找回。

**已知落差集中在一處。** 規格與實作的差距列在規格書 §14，不要在各測試
套件的 README 各存一份——那樣修好了也不會有人記得把三份都刪掉。

**沒有的功能，不必記錄「沒有」。** 落差消除或功能定案不做時，把該列
從規格書 §14 刪除即可，不必另外解釋「為什麼沒有」。完整規則、例外
條款與理由見
[`../.claude/rules/document-writing.md`](../.claude/rules/document-writing.md)
（path-scoped，動 `docs/`／`e2e/**/*.md` 時自動載入）。

**每一波更新三種 session。**（業主 2026-10-27）一波＝一次晉升 develop→main
的內容。波開始起**新的主 session**：讀 `docs/plans/<wave>/plan.md`、派工、
審每個 PR、用互動問題收業主裁決並留言在 PR、rebase 與解衝突（業主授權它
push 執行分支）、開晉升 PR、清理鷹架；它不寫產品碼、不跨波。每個工項各開
**執行 session**，只動自己的分支、PR 回 develop、不裁決。波結束另開**審查
session**，審該波合進 main 的全部變動（四視角＋事實核對＋上線後現場），
報告寫 `docs/plans/<wave>/review.md`，P0 回主 session 開 hotfix。理由：
單一長壽 session 的 context 會被歷史吃掉、裁決與事實混在對話裡，新 session
只看得到 repo——所以交接物一律落檔（plan.md 的裁決表與進度表、
dispatch-prompts.md 的開局 prompt、PR 留言），不靠記憶。

| 角色 | 做 | 不做 | 交接物 |
|---|---|---|---|
| 主 session（每波一個） | 讀 plan、派工（`create_session` 帶 `source_url`）、審每支 PR、收業主裁決、rebase／解衝突、開晉升 PR、代跑要人核准的 MCP 查詢、波末開審查 session、刪鷹架 | 寫產品碼（例外：≤10 行的 CI／文件修補，記進 plan §8）；跨波 | plan.md（裁決表、名冊、進度表）、dispatch-prompts.md、PR 留言 |
| 執行 session（一工項一個） | 照 prompt 施工、自己的 PR 推到 CI 綠、回報 PR 號／偏離／未驗項 | 改別人分支；裁決；接第二個工項 | PR（內文照 `.github/pull_request_template.md`） |
| 審查 session（每波一個） | 審該波合進 main 的全部變動：四視角＋未驗項核對＋上線後現場；寫 `review.md` 與「升級進長期文件」表 | 改產品碼；直接用要人核准的 MCP（現場 SQL 交主 session 代跑） | `review.md`、friction-log 條目 |

**主 session 合併後的驗證**：PR 自述「靠排程驗」的（週掃描、每日排程、只在真告警時才跑的 step），主 session 在合併、
部署後立刻 `workflow_dispatch` 一次，不等排程——第 2 波的 `deno audit` 若等到排程，npm 從 0 跳到 12 個
high／critical 會晚兩天才被看見（issue #467）。dispatch 也驗不到的（例如只在有告警時才執行的 step），在 plan 的
未驗項明寫「待真實觸發」。

**雲端 session 的執行環境須知**（寫進每個派工 prompt 的共用開頭；第 1–3 波累積）：
- `create_session` 一律帶 `source_url`（本 repo）與 `source_revision=develop`；沒帶的 session 沒有 repo，只能封存。
- 容器沒有 deno：`npm install -g deno` 可裝（deno.land 被網路政策擋，npm registry 與 jsr.io 通）。動
  `supabase/functions/` 的 session 開局先裝，否則 pre-commit 會擋；`deno task test` 留給 CI 的 api-tests 軌。
- 子 session **不直接用 Supabase MCP**：會跳權限核准，沒人按就永久卡住。資料查詢交主 session 代跑。
- `gh pr checks` 在雲端被擋：看 CI 用 GitHub MCP（`pull_request_read` 的 check runs、`actions_list`）。
- journey 絕不在本機跑；要驗 harness 用 GitHub MCP `actions_run_trigger` 對 `journey-scheduled.yml` 發
  workflow_dispatch（ref＝自己的分支）。
- tdd-lock 解鎖只認業主**親打**的授權，主 session 轉述的不算；三段式工項的 `/tdd-implement` 由業主親打。
- 推送守衛（`.claude/hooks/pre-push-rebase.sh`）會自動 rebase 到最新 develop，之後要 `--force-with-lease`，而
  auto mode 分類器可能擋改寫遠端分支的 force push：被擋時不硬繞，改在遠端分支頂端疊快轉 commit，或交主 session rebase。
- 新的 `docs/plans/<slug>/` 若要隨 PR 先合併，開 PR 前就加 `plans-keep` 註解，否則 `check-plans-scaffold` 紅。

**凍結期只許 hotfix。**（第 1 波裁決 8）晉升後的凍結窗口內，main 只收「營運中發現、
定義明確、不動註冊／付款／登入主幹、無 migration」的修正，而且照樣走晉升 PR＋業主核准
`production`；develop 照常合併。凍結期開的晉升 PR，內文要**逐支標類別**（hotfix／docs／其他），
「其他」要附業主授權的原話與日期，並記進該波 plan 的裁決表——第 1 波唯一一次凍結期晉升（#450）
就帶上了動付款主幹的 #449，核准只剩 PR 內文一句轉述。
