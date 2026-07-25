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
| [`ui-ux-guidelines.md`](ui-ux-guidelines.md) | 動任何 UI。尺寸/觸控/導覽契約/表單/三態/可測試性慣例 |
| [`multi-step-flow-recovery.md`](multi-step-flow-recovery.md) | 動多步驟表單或金流頁。四條可恢復性契約 + 全站連續流程盤點 |

### B・現況說明

| 文件 | 何時讀 |
|---|---|
| [`../README.md`](../README.md) | 第一次接觸這個 repo |
| [`../CLAUDE.md`](../CLAUDE.md) | AI 助理的操作手冊：開發流程、閘門、分支與部署慣例 |
| [`../supabase/README.md`](../supabase/README.md) | 動後端 schema／函數。SSOT 設計、資料表、關鍵函數、migration 慣例 |
| [`supabase-setup-checklist.md`](supabase-setup-checklist.md) | Supabase 環境問題。程式碼之外必須在 Dashboard 手動完成的設定 |
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
從規格書 §14 刪除即可（§14 開頭已寫明）；不要在刪除處或其他文件另外
補一段「已定案不提供 X、非落差」之類的旁白。功能不存在，文件裡不出現
這個條目就是正確狀態——反覆解釋「為什麼沒有」，等於在維護一份原則上
列不完的「不提供清單」。例外：程式碼裡仍留著容易被誤讀的殘跡（保留但
不再讀寫的欄位、已停用的路由），才在該殘跡定義處寫一次**最小事實**
說明，不重複寫進第二份文件。（同一原則已用於 `docs/plans/` 的鷹架
文件生命週期——內容刪除不等於遺失，`git show <hash>:<path>` 找得回。）
