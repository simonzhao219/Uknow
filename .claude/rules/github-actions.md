---
paths:
  - ".github/workflows/**"
---

# GitHub Actions 命名與結構守則

**由 `scripts/check-workflows.py` 機械把關**(framework-check 軌)。
規則編號與該檔的 `naming_violations()` 一一對應——改規則要同時改兩邊,
而且該檔有自己的表格案例(`--self-test`),檢查器自己也有紅綠燈。

## 語言分工:識別字英文、敘述中文

| 位置 | 語言 | 為什麼 |
|---|---|---|
| workflow `name:` | **英文 Title Case** | 它是識別字——`workflow_run.workflows: [CI]` 以**名稱**引用它,也是 badge URL 的一部分。改名會靜默斷開引用。 |
| job id | **英文 kebab-case** | 它是 branch protection 的 check 名稱,也是 `needs:` 的引用鍵。 |
| step `name:` | **中文敘述** | 純粹給人看的。工具名以括號附註:`前端型別檢查（tsc）`。 |
| 註解 | 中文 | 與專案其餘部分一致。 |

## 規則

**規則 2 — workflow `name:` 是英文 Title Case**
每個字首大寫、不用標點。`Journey Scheduled` ✅ / `Journey (Scheduled)` ❌ / `持續整合` ❌。

**規則 3 — 禁止 workflow 層 `permissions:`**
它是**上限**不是預設值。設了 `contents: read`,底下需要 `issues: write` 的 job
就會被判越權,GitHub 在建圖階段直接拒絕整個 workflow——`startup_failure`,
連一個 check run 都不會建立,PR 上看起來像 CI 沒反應。權限一律逐 job 宣告。
(2026-07-25 PR #114 實測,四個 workflow 全中。)

**規則 4 — job id 是 kebab-case 名詞片語,描述「這一軌證明了什麼」**

- ❌ 工具名:`npm-audit`(工具會換,那一軌要證明的事不會)→ `dependency-audit`
- ❌ 裸形容詞/動詞:`static`、`unit`、`build`、`deploy`
  → `static-checks`、`unit-tests`、`build-bundle`、`deploy-edge-function`
- ✅ `api-tests`、`e2e-tests`、`migration-guard`、`linear-check`、`journey-offline`

理由:branch protection 的 check 清單裡只看得到這串字,「static」說不出它擋住什麼。

⚠️ **連字號陷阱**:job id 若其 `outputs` 被表達式引用,**避免連字號**——
`needs.detect-changes.outputs.x` 會被 GitHub 的表達式剖析器讀成減法
(`needs.detect` − `changes.outputs.x`)。本 repo 的 `changes` 因此保持單字;
真的需要連字號時用括號式 `needs['detect-changes'].outputs.x`。

**規則 5 — 每個 job 都要有 `timeout-minutes`**
沒有上限的 job 卡住就是燒滿 6 小時。呼叫 reusable workflow 的 job
(`uses: ./...`)不支援這個鍵,自動豁免。

**規則 6 — 每個 step 都要有 `name:`,包含 `uses:` 的 setup step**
無名 step 在 UI 顯示成 `Run actions/checkout@v4`,與真正的閘門混在一起,
看 log 找失敗點要多花時間。setup 類用固定說法:`取出程式碼`、`安裝 Node 24`。

step name 描述**意圖**不是工具:`Biome` ❌ → `前端風格與 lint（Biome）` ✅。
工具會換,那一步要達成的事不會。

**規則 7 — `ci.yml` 的 `ci-ok` 必須 `needs` 全部其他 job**
`ci-ok` 是 branch protection 的**唯一** required check。漏掉一軌 = 那一軌
紅了也不擋合併。2026-07-25 的 PR #109 就是這樣在 `api-tests` / `e2e-tests`
還在跑的時候被 auto-merge 掉的。新增 job 一定要同步進 `ci-ok` 的 needs。

## 不可改名的識別字

| 名稱 | 改了會怎樣 |
|---|---|
| workflow `name: CI` | `deploy-supabase.yml` 的 `workflow_run.workflows: [CI]` 靜默失效——部署再也不會觸發 |
| job id `ci-ok` | branch protection 的 required check 找不到,PR 永遠 pending |
| job id `changes` | 見上方連字號陷阱;且所有 `needs.changes.outputs.*` 要同步改 |

## reusable workflow 的兩個地雷

1. **不要在 reusable workflow 裡宣告 workflow 層 `concurrency`**。它會參與
   *呼叫端*的排隊;呼叫端的 run 被 `cancel-in-progress` 取消後,該 group 的
   slot 不會乾淨釋放,之後每個 run 都永遠卡在 `pending` 且零 job。
   需要 concurrency 就放在薄外殼(見 `journey-scheduled.yml`)。
2. **`workflow_run` 觸發的 workflow 定義一律取自預設分支**。改了
   `deploy-supabase.yml` 要合進 main 才會生效,在 develop 上改不會有反應。

## 新增 workflow 時

1. 照上面的規則寫
2. `python3 scripts/check-workflows.py` 必須綠
3. 加了新 job → 進 `ci-ok` 的 needs(規則 7 會擋,但別等它擋)
4. `actionlint` 驗不出規則 3/7 與 concurrency 地雷——那幾條只有這支檢查器管
