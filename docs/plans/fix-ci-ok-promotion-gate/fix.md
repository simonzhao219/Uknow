# 晉升 PR 的 required check 被 push run 預先蓋的綠章滿足 修復紀錄

分支:`claude/promote-develop-to-main-qgtqhd`|重現測試(紅燈 commit):待填

## 1. 症狀與重現

PR #236(develop→main 晉升)於 2026-08-07 15:03 合併成功,當下
`journey-full / journey-suite`(CI run 31189965005,job 92904068500)仍在
`in_progress`——停在 step 15「journey 全鏈路測試(真後端)」。

`journey-full` 是 CLAUDE.md 晉升 SOP 裡**上線前唯一的真後端閘門**
(「(b) 開晉升 PR……journey 全套會自動在這個 PR 上跑;(c) 綠了以 merge
commit 合併」)。它沒能擋住任何東西:187 個 commit、14 個 migration 進了
main,沒有經過全鏈路驗證。

Merge 按鈕從 PR 開啟到合併全程是綠的,PR 上**沒有任何 pending 標記**。

重現:任何一個 develop→main 的晉升 PR 都會重現,不需要特殊條件。

## 2. 根因

required status check 的鍵是 **(commit SHA, check-run 名稱)**,不綁 workflow
run。而晉升 PR 的 head SHA 就是 develop 的 tip——**那顆 SHA 在 PR 存在之前
就已經被跑過一輪 CI 並蓋上綠章了**:

| 時間 | 事件 |
|---|---|
| 14:44 | `9911a43` 推上 develop → `on: push: branches: [develop]` 觸發 run 31189096648 |
| 14:44:32 | 該 run 的 `journey-full` → **skipped** |
| **14:48:43** | 該 run 的 **`ci-ok` → success**,蓋在 `9911a43` 上 |
| 14:54 | 開 PR #236。head SHA 仍是 `9911a43`,綠章已在 |
| 15:03 | 合併。required check `ci-ok` 自 14:48:43 起未曾中斷地是綠的 |

兩個獨立的機制串起來才成立,缺一不可:

**(a) push run 的 `ci-ok` 綠得毫無代價。** `journey-full` 的條件是
`github.event_name == 'pull_request' && github.base_ref == 'main'`——push
事件必然不成立 → `skipped`。而 `ci-ok` 的匯總把 `skipped` 算通過。那個
skipped 語意本身是對的(純文件 PR 要能合併),錯的是**沒有人區分「這一軌
本來就不該跑」與「這一軌是上線閘門而它沒跑」**。

**(b) PR run 自己的 `ci-ok` 當時根本不存在。** GitHub **不會為 `needs`
尚未完成的 job 建立 check run**。實測 PR run 31189965005 的 job 清單只有 8
個(guards / static-checks / unit-tests / build-bundle / api-tests /
e2e-tests / journey-offline / journey-full),**沒有 `ci-ok`**。

於是在保護規則的視角裡,「還沒跑完」不是 pending,而是「已經綠了(那顆舊
的)」。沒有黃燈可以擋人。

### 為什麼當時沒被發現

1. **只在晉升 PR 上出現。** 一般 feature PR 的 head 是 feature 分支,
   `push: branches: [main, develop]` 不涵蓋,不會有預先蓋好的綠章。晉升
   幾週才一次,樣本太少。
2. **規則 7 的機械把關管不到。** 它驗的是「`ci-ok` 有沒有 `needs` 全部
   job」——保證的是**同一個 run 之內**的完整性,對「綠章來自哪一個 run」
   沒有任何概念。
3. **前兩次歸因造成「已經修好了」的錯覺。** friction-log〈假閘門〉那則
   記了同症狀的兩次:#109 歸因「required checks 清單漂移」(錯的)、後來
   重新歸因「private repo 的 ruleset 靜默降級」(對的,08-07 轉 public 後
   一般 PR 的閘門確實開始生效)。**這是第三個、與前兩者都不同的根因**
   ——公開 repo、ruleset 正常運作,照樣放行。

### 附帶發現:reusable workflow 的 check-run 名字會變

同一個 `journey-full` job,兩種狀態下的 check-run **名字不一樣**:

- 真的跑(呼叫 `journey.yml`):`journey-full / journey-suite`
- 被 `if` 跳過:`journey-full`

所以「把 `journey-full` 也列進 required checks」修不了這個 bug——列
`journey-full` 會被 push run 那顆 skipped 自動滿足,列
`journey-full / journey-suite` 則會讓所有 base=develop 的 PR 永遠 pending。
**required checks 清單無法表達這個閘門**,只能從 `ci-ok` 內部解決。

## 3. 同類掃描

- **根因抽象成的 pattern**:同一顆 commit SHA 被**多個 workflow run** 蓋上
  **同名** check run,而各 run 的 job 集合／執行條件不同 → 較寬鬆那一個 run
  的綠章會冒名頂替嚴格那一個。
- **掃描方式**:逐一檢查 `.github/workflows/*.yml` 的 `on:` 區段,找出會讓
  同一 SHA 觸發兩次的觸發組合。
- **結果**:☑ 僅此一處。`ci.yml` 是唯一同時宣告 `pull_request` 與 `push`
  且分支集合重疊(`[main, develop]`)的 workflow。其餘皆為
  `workflow_run`(deploy-supabase)、`schedule` + `workflow_dispatch`
  (journey-scheduled / reconcile-payments / security)、`workflow_call`
  (journey)——都不會與 PR run 撞名。

第二條 pattern(「`needs` 未完成 → 不建立 check run」)掃描結果:ci.yml 裡
除 `guards` 外每個 job 都 `needs: guards`,但 guards 約 15 秒完成,窗口可
忽略;真正有害的只有 `ci-ok`——它 `needs` 一個 30-90 分鐘的 job,窗口是全部
其他軌加起來還久。**病灶只有 `ci-ok` 一個,一併修。**

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 改 `ci-ok` 的 check-run **名稱**不影響 `deploy-supabase.yml`——它讀的是 `workflow_run` 的整體 conclusion,不是某個 job 名。ruleset 的 required checks 清單寫的是 `ci-ok`,而 PR run 仍叫 `ci-ok`,清單不必動;push run 改叫 `ci-ok-push`,而 push 路徑本來就不經 required check。 |
| 架構 | 偏架構症狀但**不需升級 `/plan-feature`**:「單一匯總 check + 長尾 job」讓匯總點必然最後出現、窗口最大,這是設計的必然結果而非疏漏。補上「push run 不得產生 required check 名」這一條,設計即自洽,不動結構。 |
| UIUX | 無使用者介面。開發者體感有一項變化:push run 的匯總 check 從 `ci-ok` 變成 `ci-ok-push`,PR 頁面會看到兩顆不同名的匯總點——這比現況**更誠實**(現況是兩顆同名、後者靜默蓋掉前者)。 |
| 需求 | 「晉升必須真的過 journey」在 CLAUDE.md 晉升 SOP 有寫,但**從來沒有機械把關**把「綠了」定義成「journey 真的 success」。規格存在、閘門不存在——本次補上,不需人工裁決。 |

## 5. 修法與驗證

兩道,一道治時序、一道治語意。**只做第一道也能堵住這次的洞,但第二道讓
匯總點自己也懂得晉升的規矩**,不必依賴命名技巧永遠正確。

**修 1(治時序)**:`ci-ok` 的 check-run 名稱在非 `pull_request` 事件改成
`ci-ok-push`:

```yaml
  ci-ok:
    name: ${{ github.event_name == 'pull_request' && 'ci-ok' || 'ci-ok-push' }}
```

晉升 PR 的 head SHA 上不再有預先蓋好的 `ci-ok` → required check 停在
「Waiting for status to be reported」,直到 PR run 自己的 `ci-ok` 出現為止。

**修 2(治語意)**:`ci-ok` 在 `base_ref == 'main'` 時,`journey-full` 的
`skipped` 不算通過——必須 `success`。把晉升 SOP 的意圖寫進匯總點自己。

**修 3(防線回填)**:`check-workflows.py` 新增規則 9、10,把上面兩道釘死,
避免未來重構靜默撤回。

## 6. 防線回填

- **為什麼既有閘門沒攔到**:規則 7 只驗「同一 run 內 needs 完整」,沒有
  「跨 run 撞名」的概念;`actionlint` 只驗語法;沒有任何一層在問「這個
  check-run 名字會不會被別的 run 蓋章」。
- **處置**:☑ 已補閘門——`check-workflows.py` 規則 9(ci.yml 有 `push:`
  觸發時,`ci-ok` 必須有含 `pull_request` 的 `name:` 表達式)與規則 10
  (`ci-ok` 區塊必須同時引用 `base_ref` 與 `journey-full`,確保晉升強制條款
  不被靜默刪除),各帶正反表格案例。friction-log 另記〈假閘門〉第三個根因。
