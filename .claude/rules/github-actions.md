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
(`needs.detect` − `changes.outputs.x`)。本 repo 的 `guards` 因此保持單字;
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
`ci-ok` 是 required status check 的**唯一**項目。漏掉一軌 = 那一軌紅了也
不擋合併。新增 job 一定要同步進 `ci-ok` 的 needs。

⚠️ **這條規則的前提是 required status checks 真的會被詢問**,而那取決於
repo 的可見性與方案:ruleset／branch protection 在 **private repo 上是付費
功能**,免費方案下規則可以存在、`enforcement` 顯示 `active`,卻完全不執行
(`GET /rulesets` 回 `Upgrade to GitHub Pro or make this repository public`、
`GET /branches/<b>` 回 `protected: false`)。本 repo 的 ruleset
`protect-main-develop` 建於 2026-07-25 06:08,直到 2026-08-07 改為 public
才真正開始擋人。這段期間三個「CI 還在跑就合併」的案例——PR #109(merged
08:38:40,`api-tests` 08:40:58、`e2e-tests` 08:42:25 才完成)、PR #205
(merged 05:50:46,`ci-ok` 05:51:01 才完成)、PR #199(merged 11:42:45,
`e2e-tests` 與 `api-tests` 皆 `in_progress`、`ci-ok` 尚未建立)——全都源於
**閘門根本沒有被詢問**。

這與「清單漂移」是**兩種不同的故障,症狀相反**,診斷時先分辨:

| 故障 | 症狀 |
|---|---|
| 規則未生效(private + 免費方案) | 合併暢通無阻,PR 上看不到任何 required 標記 |
| 清單漂移(舊 job id 殘留) | PR 永遠 pending,卡在「Waiting for status to be reported」 |

**規則 8 — 費用視角(每個 job 各自進位計費)**
GitHub-hosted runner 對**私有** repo 按分鐘計費,且**每個 job 無條件進位到
整分鐘**——10 秒的 job 也算 1 分鐘,所以「job 數量 × run 頻率」比「單 job
時長」更貴(2026-08-07 帳號分鐘數用罄事故:全量 CI 一次 19-20 計費分,
其中 42% 是 8 個秒級 job 的進位損耗)。

⚠️ **前提已於 2026-08-07 變更,本規則的力度待裁決**:repo 改為 **public**
之後,標準 runner 不再計費,上面的成本論證對現況不成立。8a 的「秒級檢查
不開新 job」仍有非費用面的價值(牆鐘、check 清單可讀性),8b 的排程費用
註記則失去依據。**維持現狀不動**——鬆綁與否是人的決定,而且 8b 有
`check-workflows.py` 的表格自測綁著,改規則要同時改檢查器與自測案例。
若日後改回 private,這段前提自動回復成立。

- **8a(審查原則)**:秒級檢查**不開新 job**,併入既有 job 當 step、用
  step 層 `if:` 控制條件——新開一個 job = 每次 run 至少 +1 分鐘 × run
  頻率(ci.yml 高峰月是數百 run)。開新 job 的正當理由只有:需要不同的
  runner 環境、需要與其他軌真並行的分鐘級工作、或需要獨立的 skip 語意。
- **8b(機械把關)**:帶 `schedule:` 觸發的 workflow,檔內必須有
  「費用」註記——寫明「頻率 × 單次計費分 ≈ 分/月」與選這個頻率的理由。
  排程頻率是費用決策,決策要留下依據。
- **盤點**:雙週整併時跑 `python3 scripts/actions-usage.py`。

## 不可改名的識別字

| 名稱 | 改了會怎樣 |
|---|---|
| workflow `name: CI` | `deploy-supabase.yml` 的 `workflow_run.workflows: [CI]` 靜默失效——部署再也不會觸發 |
| job id `ci-ok` | required status check 找不到回報者,PR 永遠 pending |
| job id `guards` | 見上方連字號陷阱;且所有 `needs.guards.outputs.*` 要同步改 |

⚠️ **改名前務必檢查 required status checks 清單本身**,不能只看 CLAUDE.md
或這份文件——規則文件講的是「應該」只鎖 `ci-ok`,但規則本身可能還殘留舊
job id(例如把 `build` 改名成 `build-bundle` 後,清單裡若還留著 `build`,
它從此不會再被任何 job 回報,PR 會卡在「Waiting for status to be reported」
永遠不綠——不是紅燈,是沒人送出那個名字的狀態,GitHub API 查得到的所有
check 可能都已經 success,UI 卻仍卡住)。

清單有**兩套獨立系統,required checks 取聯集**,兩處都要看:

- **Settings → Rules → Rulesets**——本 repo 的實際來源(`protect-main-develop`,
  套用於 `refs/heads/main` 與 `refs/heads/develop`)
- **Settings → Branches**——classic branch protection。本 repo 目前是**空的**
  (`GET /branches/develop` 的 `protection.enabled` 為 `false`),但它一旦被
  設起來就會與 ruleset 疊加

用 API 一次看完(比 UI 可靠,也看得到 `enforcement`):

```bash
gh api repos/:owner/:repo/rules/branches/develop   # 生效中的規則(來自 rulesets)
gh api repos/:owner/:repo/branches/develop --jq .protection   # classic 側
```

## reusable workflow 的兩個地雷

1. **不要在 reusable workflow 裡宣告 workflow 層 `concurrency`**。它會參與
   *呼叫端*的排隊;呼叫端的 run 被 `cancel-in-progress` 取消後,該 group 的
   slot 不會乾淨釋放,之後每個 run 都永遠卡在 `pending` 且零 job。
   需要 concurrency 就放在薄外殼(見 `journey-scheduled.yml`)。
2. **`workflow_run` 觸發的 workflow 定義一律取自預設分支**(不是被觸發那次
   commit 的版本)。所以改 `deploy-supabase.yml` 要**合進預設分支**才生效,
   在 feature 分支上改不會有反應。⚠️ 預設分支是 repo Settings → Branches
   的設定,不是固定的 main——本 repo 已於 2026-07-25 改成 **develop**,
   所以現在合進 develop 就生效,不必等晉升。改這條前先確認當下的預設分支。

## 新增 workflow 時

1. 照上面的規則寫
2. `python3 scripts/check-workflows.py` 必須綠
3. 加了新 job → 進 `ci-ok` 的 needs(規則 7 會擋,但別等它擋)
4. `actionlint` 驗不出規則 3/7/8b 與 concurrency 地雷——那幾條只有這支檢查器管
