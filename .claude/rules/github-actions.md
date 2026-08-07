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

「CI 還在跑就合併成功」有**三種根因,症狀相近但機制完全不同**,診斷時先分辨
(前兩種各被誤診過一次,代價是同一個缺陷重複發生):

| 故障 | 症狀 | 分辨方法 |
|---|---|---|
| 規則未生效(private + 免費方案) | 合併暢通無阻,PR 上看不到任何 required 標記 | `gh api repos/:owner/:repo/rules/branches/<b>` 回 Upgrade 提示 |
| 清單漂移(舊 job id 殘留) | PR 永遠 pending,卡在「Waiting for status to be reported」 | 清單裡的名字沒有任何 job 會回報 |
| **綠章跨 run 冒名頂替**(規則 9) | required check 顯示綠、但那顆 check run 屬於**另一個 workflow run** | 點開 PR 上那顆 check,看它的 run id 是不是這個 PR 的 |

**規則 8 — 軌道切分與排程頻率:依據要寫在檔案裡**

**稀缺的是牆鐘,不是分鐘**。本 repo 於 2026-08-07 轉為 **public**,
GitHub-hosted 標準 runner 免費且無用量上限,所以切分軌道時該問的是
「回饋要多久才回得來」,不是「開了幾個 job」。

<details><summary>沿革:本規則原為「費用視角」(2026-08-07 裁決前)</summary>

原依據是私有 repo **每個 job 無條件進位到整分鐘**計費(10 秒的 job 也算
1 分鐘),當天帳號分鐘數用罄、所有 workflow 停擺兩小時。同日轉 public,
計費論證失效——但兩條子規則的**行為要求都不變**,只是依據換成牆鐘與
決策可追溯性(8a)、以及成本的多元性(8b)。若日後改回 private,計費
論證自動回復成立,規則力度只會更強不會更弱。

</details>

- **8a(審查原則)**:秒級檢查**不開新 job**,併入既有 job 當 step、用
  step 層 `if:` 控制條件。理由是**固定開銷**:每個 job 都要各自付 runner
  啟動 + checkout + 工具鏈安裝(本 repo 15-40 秒),拿它買不到 40 秒的
  運算不划算;而且 required check 清單每多一個名字,判讀成本就多一分。
  開新 job 的正當理由:需要不同的 runner 環境、需要與其他軌真並行的
  **分鐘級**工作、或需要獨立的 skip 語意。
  ⚠️ **判準是「固定開銷 > 運算量」,不是「job 數量多」**。2026-08-07 曾
  提案把 `static-checks`/`build-bundle`/`unit-tests`/`journey-offline`
  併軌,理由是省計費分鐘;轉 public 後那個理由消失,而四軌**並行**的牆鐘
  優於串行,提案作廢。同一個動作在兩種前提下結論相反,所以要看依據不是
  看形狀。
- **8b(機械把關)**:帶 `schedule:` 觸發的 workflow,檔內必須有
  **`頻率依據:`** 註記——寫明為什麼是這個頻率,以及**成本落在哪裡**
  (GitHub 分鐘 / Supabase 分支時數 / 外部 API 額度 / 訊號疲勞…)。
  排程頻率是有後果的決定:太密浪費資源、太疏讓問題晚被發現,而後果落在
  哪裡逐個 workflow 不同——journey 的成本是付費的 Supabase preview
  branch,reconcile 的成本趨近零而延遲直接影響付了錢的使用者。依據要留在
  檔案裡,不是留在某次對話裡:下一個要改頻率的人只讀得到檔案。
- **盤點**:雙週整併時跑 `python3 scripts/actions-usage.py`——public 期間
  它的分鐘欄不代表金錢,讀的是**牆鐘與 job 數分佈**(哪一軌最慢、誰在
  拖長回饋)。

**規則 9 — required check 的名字不得被 push run 蓋章**
required status check 的鍵是 **(commit SHA, check-run 名稱)**,**不綁 workflow
run**。`ci.yml` 同時有 `pull_request` 與 `push` 觸發、分支集合又重疊,所以同一顆
SHA 會被跑兩次;兩個 run 的匯總點若同名,**較寬鬆的那個會冒名頂替嚴格的那個**。

這在晉升 PR(develop→main)上是致命的:它的 head SHA 就是 develop 的 tip,
早在 PR 開啟前就被 push run 蓋過一顆綠 `ci-ok`(那個 run 裡 `journey-full`
必然 `skipped`,而 skipped 算通過)。而 PR run 自己的 `ci-ok` 因為 **GitHub 不
為 `needs` 尚未完成的 job 建立 check run** 而根本不存在——保護規則從頭到尾看
到的都是那顆廉價綠章,連黃燈都沒有。PR #236 就是這樣在 `journey-full` 還在跑
時合併進 main 的。

修法是讓 push run 的匯總點改名:

```yaml
  ci-ok:
    name: ${{ github.event_name == 'pull_request' && 'ci-ok' || 'ci-ok-push' }}
```

⚠️ **不能改用「把 `journey-full` 也列進 required checks」來修**——reusable
workflow 的 check-run 名字會隨執行狀態變:真的跑(`uses: ./...journey.yml`)
叫 `journey-full / journey-suite`,被 `if` 跳過時叫 `journey-full`。列前者會讓所有
base=develop 的 PR 永遠 pending,列後者會被 push run 那顆 skipped 自動滿足。
**required checks 清單無法表達這個閘門**,只能從 `ci-ok` 內部解決。

**規則 10 — `ci-ok` 對晉升 PR 必須單獨要求 `journey-full` 為 `success`**
`ci-ok` 把 `skipped` 算通過是刻意的(純文件 PR 會 skip 重的 job,不這樣做永遠
合不了),但套在 `journey-full` 上就是「上線前唯一的真後端閘門沒跑也算過」。
`base_ref == 'main'` 時把它從 `join(needs.*.result)` 拉出來單獨檢查:

```yaml
JOURNEY_RESULT: ${{ needs['journey-full'].result }}   # job id 帶連字號,須用索引語法
```

規則 9、10 都由 `check-workflows.py` 機械把關(各帶正反表格案例)——它們是
**寫在註解裡就會被重構靜默撤回**的那種規則,必須有檢查器綁著。

## 不可改名的識別字

| 名稱 | 改了會怎樣 |
|---|---|
| workflow `name: CI` | `deploy-supabase.yml` 的 `workflow_run.workflows: [CI]` 靜默失效——部署再也不會觸發 |
| job id `ci-ok` | required status check 找不到回報者,PR 永遠 pending |
| `ci-ok` 的 `name:` 表達式 | 拿掉或改成固定字串 → push run 的匯總點又與 PR run 同名,晉升 PR 的閘門靜默失效(規則 9)。`ci-ok-push` 這個名字本身可以換,但**兩個事件必須不同名** |
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
