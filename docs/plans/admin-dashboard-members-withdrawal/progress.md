# 管理後台強化實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支：`feature/admin-dashboard-members-withdrawal`（實作 PR #188；規劃 PR #186 已合併）
規劃檔目錄名與分支 slug 對上，**PreToolUse 規劃檔守衛生效**——未經規劃的
`src/**` 與 `supabase/functions/**` 寫入會被機械擋下。

規劃書：`./plan.md`（**v3**，已處置 v2 審查的全部 P0/P1/P2）｜審查：`./review.md`

## 階段狀態

### PR 1：證件審核（PR 3 對它有欄位級硬相依；PR 2 只是建議順序）

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1.1 | 證件審核資料層 + 上傳端點狀態轉換 + backfill | ✅ 綠 | `7523d0e` | `d0b31bd` |
| 1.2 | `request_withdrawal` 守衛 #5a（只擋 `rejected`） | ✅ 綠 | `ee6b979` | `70aa55c` |
| 1.3 | admin 審核端點（含轉換表 + `revoke execute` 驗證） | ✅ 綠 | `c8c5c05` | `51e401b` |
| 1.4 | 會員端證件狀態區塊（dialog 結構不變） | ✅ 綠 | `3f03ede` | （本次 commit） |
| 1.5 | admin 審核佇列 UI + 掛進會員管理 Tab 次分頁殼 | ✅ 綠 | `5f94db0` | `6b8db71` |

### PR 2：提領作業台

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 2.1 | CSV 欄位跳脫純函式 | ✅ 綠 | `a7669e0` | `bc25432` |
| 2.2 | `copyText` 抽成 `src/utils/clipboard.ts` | ✅ 綠 | `499cfe0` | `45dd17d` |
| 2.3 | `withdrawal_events`（含 RLS/revoke）+ 狀態機改寫 | ✅ 綠 | `f534441` | `07620cc` |
| 2.4 | 批次標記已匯款（逐筆 `bank_ref` + savepoint 隔離） | ✅ 綠 | `f115f7e` | `5f78979` |
| 2.5 | 列表分頁／彙總／篩選／events | 🟡 紅燈已驗，綠燈待 CI | `402e56f` | `29104c5` |
| 2.6 | 退件理由端到端 | ⬜ 未開始 | | |
| 2.7 | 作業台前端（同屏＋複製＋批次＋分頁＋CSV＋手機邊界） | ⬜ 未開始 | | |
| 2.8 | 會員端顯示退件理由 | ⬜ 未開始 | | |
| 2.9 | 入口 badge（待處理筆數） | ⬜ 未開始 | | |

### PR 3：會員查詢台（**依賴 PR 1 的 `id_verification_status` 欄位**，不可與 PR 1 平行）

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 3.1 | 列表：全站 `stats` + 篩選 + 排序 + `endDate` | ⬜ 未開始 | | |
| 3.2 | 會員詳情（含近期提領記錄、遮罩） | ⬜ 未開始 | | |
| 3.3 | 管理員授予／撤銷 | ⬜ 未開始 | | |
| 3.4 | 分頁抽共用 hook + 查詢台前端 | ⬜ 未開始 | | |

### 收尾

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 4.1 | 規格書同步（§5.3／§10.1／§10.3／§13） | ⬜ 未開始 | | |

## 目前位置與下一步

**PR 1（證件審核）全數完成並驗證。** 7 階段 + 1 個缺陷修復。

| 階段 | 紅燈 | 綠燈 | 判定 |
|---|---|---|---|
| 1.1 證件審核資料層 | `7523d0e` | `d0b31bd` | CI 全綠 |
| 1.2 提領守衛 #5a | `ee6b979` | `70aa55c` | `173/2` → `175/0` |
| 1.3 admin 審核端點 | `c8c5c05` | `51e401b` | `176/9` → `185/0` |
| B3 審核時間戳歸零 | `1267228` | `0a26ddc` | `185/1` → `186/0` |
| 1.4 會員端證件區塊 | `3f03ede` | `7d23b37` | 本機 8 斷言 |
| 1.5 admin 審核佇列 | `5f94db0` | `6b8db71` | 本機 8 斷言 + CI 複驗 |
| 2.1 CSV 跳脫 | `a7669e0` | `bc25432` | 本機 15 斷言 |
| 2.2 剪貼簿 utility | `499cfe0` | `45dd17d` | 本機 6 斷言 |

**已完成 10 階段。** 進行中：階段 2.5，紅燈 `402e56f` 判定 `197 passed / 5 failed`（範圍乾淨），綠燈 `29104c5` 待 CI。

剩餘：2.6–2.9、3.1–3.4、4.1。

### ⚠️ 階段 2.4 的紅燈證據品質低於其他階段

前面每個後端階段都是「推紅燈 → 讀 CI 判定 → 推實作」，紅燈由 CI 證明過。
階段 2.4 不是：推紅燈時階段 2.3 的綠燈驗證還在跑，推任何東西都會 concurrency
取消它（B4 的教訓），所以紅燈與實作一起押在本機、一起推。CI 只會看到綠。

**那個紅燈沒有被 CI 證明過，只有本地推理。** 如實記錄，不假裝與前幾階段等值。
若日後要補強，可在該分支上單獨 revert 實作 commit 跑一次 CI。

### 實作中抓到的兩個「不會叫的錯誤」

**改 SQL 函數簽章時 `create or replace` 是多載不是取代**（階段 2.3）。
`admin_update_withdrawal_status` 從 4 參數變 6 參數，舊版本會留著繼續生效，
仍然寫 `withdrawals.note`、也不受理 `completed`；PostgREST 依參數名解析，
呼叫端少帶兩個參數就會打到舊版。migration 顯示成功、測試可能還會過，但線上
跑的是舊規則。已加顯式 `drop function if exists`。

**測試的前置條件沒建立起來就會恆綠**（階段 2.4，推之前自己抓到）。
「狀態不合法的那筆進 failed」原本把前置狀態設成 `awaiting_collection`，但批次
也是標記成 `awaiting_collection`——同狀態走冪等成功路徑，宣稱要驗的分流情境
根本沒發生。改用 `rejected` 當前置狀態。這與 `.claude/rules/test-naming.md`
檔尾警告的反例同族。

剩餘：2.3–2.9、3.1–3.4、4.1（規格書同步）。

### 階段 1.3 的兩層防線（審查 P0-2）

把新端點加進 `admin-gate.test.ts` 的 `ADMIN_ROUTES` **只是維持測試涵蓋率，
不是保護機制**——那份清單的檔頭自己就寫著「漏加一條，這裡不會紅」。真正的
保護是 `app.use('/admin/*')` middleware。

而 middleware **蓋不到 PostgREST 的 `rpc/` 端點**，那才是 P0-2 指出的真實
漏洞路徑。所以測試分兩層：

1. 端點層：新端點進 `ADMIN_ROUTES`（匿名 401、一般會員 403）
2. **函數層：`has_function_privilege('authenticated', …, 'EXECUTE')` 必須 false**
   ——漏了 `revoke execute` 時唯一會叫的警報

第 2 層用「直接問 Postgres」而非「以 authenticated 打 rpc 看它被拒」，理由見
`name-write-paths.test.ts` 檔頭記載的教訓：後者的 403 可能來自不相干的權限，
**即使 REVOKE 沒生效也照樣「被拒」**，斷言會失去辨別力。那是 CI 連紅兩輪才
逼出來的事實。

### 本機能驗到哪裡（重要，下一個 session 別重踩）

| 檢查 | 本機 | 原因 |
|---|---|---|
| vitest | ✅ | — |
| `deno fmt` / `deno lint` | ✅ | 不需要 registry |
| `deno check`（型別） | ❌ | `jsr.io` 回 403，相依解析不了。守則已載明這種環境降級交給 CI |
| `deno task test:db` | ❌ | docker daemon 不可用 |

所以後端階段的**型別與行為都只能靠 CI**。deno 本身可用（`npm i deno` 2.9.4），
但只幫得上 fmt/lint。

**流程節奏**：每次 push 會 concurrency 取消正在跑的 run，所以「推 commit」與
「等驗證」互斥。進度檔的更新要搭著下一個階段的 commit 一起推，不能單獨推。

## Blockers（逃生口紀錄）

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

### B1 本容器無法跑需要資料庫的後端測試（環境限制，非 plan 缺陷）

`docker info` 失敗——daemon 不可用，因此 `supabase start` 起不來。依
`.claude/rules/supabase-functions.md`，`api/*.test.ts` 是需要真 Postgres 的
整合測試（`deno task test:db`），**這類階段在本機無法取得紅燈或綠燈訊號**。

- deno 本身已裝起來（`npm i deno`，2.9.4；`deno.land` 被網路政策擋掉回 403，
  走 npm 是可行路徑，該守則也有記載）。故 `deno task check`（型別）與
  `deno task test:unit`（純函式）**可跑**。
- 受影響階段（10/15）：1.1、1.2、1.3、2.3、2.4、2.5、2.6、3.1、3.2、3.3
- 可在本機完整紅→綠的階段：2.1、2.2、1.4、1.5、2.7、2.8、2.9、3.4、4.1

**修正（PR #188 第一次 CI 之後）**：先前把這條寫成「拿不到紅綠訊號」是錯的。
正確說法是**本機拿不到，CI 拿得到**——#188 的 `api-tests` 軌實跑成功，
05:25:27 → 05:28:39，約 3 分鐘。所以 DB 相依階段是**可以**用 CI 當紅綠訊號的，
只是每個紅→綠循環要等兩輪 CI（約 6–10 分鐘），且 PR 中途會出現紅色 check
（那正是專案 PR 範本要的紅燈 hash 證據）。

**待人工裁決**：(a) 以 CI 的 `api-tests` 軌走紅綠（自主，慢）、(b) 由使用者在
有 Docker 的本機跑（快且訊號最真，但需介入 10 次）、(c) 本輪收在已完成的階段、
DB 階段另案。**在裁決之前不動那 10 個階段。**

### B2 審核佇列排不出「等最久的」——plan §2.1 的欄位表沒有送審時間戳

plan §2.1 定義的四個欄位是 `id_verification_status` / `id_verified_at` /
`id_verified_by` / `id_reject_reason`，**沒有「何時送審」**。`id_verified_at`
是「何時被審」，對 `pending` 的列是 null。

後果：admin 審核佇列無法依「等待最久」排序，而那正是佇列最自然的處理順序
（§1.1 把審證件列為 admin 的實際工作）。本階段先以 `profiles.created_at`
（註冊時間）排序——穩定、不需改 schema，但不是真正的送審順序。

**未擅自加欄位**：加 `id_submitted_at` 是明顯的解法，但那是 plan §2.1 沒有的
schema 擴張，依 skill「禁止私改 plan」留給人裁決。若佇列量小到先進先出無所謂，
維持現狀即可。

### B3 階段 1.1 的實作缺陷：換照片沒清掉 `id_verified_at`

`index.ts` 的 `/rewards/upload-id-photos` 把狀態設回 `pending`、清掉
`id_reject_reason`，但**沒清 `id_verified_at`**。所以先前已核可、後來換照片的
會員會是「狀態 pending，卻帶著上一輪的審核時間」——審核佇列顯示或排序時會對
admin 說謊：「這筆已於 X 時審核」，而它其實還沒被看過。

這是我在階段 1.1 留下的缺陷，不是 plan 的問題。在階段 1.3 補一條紅燈測試後
一併修掉（狀態轉 pending 時 `id_verified_at` 必須一起歸零）。

### B4 concurrency 取消讓一次綠燈驗證憑空消失（操作失誤，非工具問題）

推 `6b8db71`（階段 1.5 綠燈）時，`7d23b37` 的 run 還在跑，GitHub 的
concurrency 設定把它取消了。`ci-ok` 因此紅——但不是因為測試失敗，而是各軌
結果裡出現 `cancelled`：

    success success success success success success cancelled success skipped success success

**代價**：`7d23b37` 帶著 B3 修復的綠燈驗證從未完成，progress.md 一度標著
「待 CI」而那輪 CI 已不存在。修復本身沒問題（含在後續 tip 裡會被驗到），
但如果當時就此收工，紀錄上會留下一個**看起來驗過、實際沒驗**的階段。

**規則**（先前已遵守數輪，這次失守）：推 commit 與等驗證互斥。commit 隨時
做，push 只在拿到判定之後。這條在 CI 當紅綠訊號的模式下沒有例外——
`cancelled` 與 `failure` 在 `ci-ok` 眼中是同一件事，但在「這個階段驗過了嗎」
這個問題上完全不同。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->

- **web session 的預設分支是 `claude/*`，但三段式流程需要 `feature/*`。**
  CLAUDE.md「已知例外」段已寫明「真的要走三段式流程時，自己切一個
  `feature/<slug>` 分支」，但 session 開局的指示是「所有開發都在指定的
  `claude/*` 分支」——兩個指示相衝，且開局指示出現得比 CLAUDE.md 更顯眼，
  結果是規劃前三個 commit 都落在守衛不生效的 `claude/*` 上，靠使用者提醒
  才搬回 `feature/*`（原 PR #185 關閉，改開 #186）。
  **代價不只是分支名**：`claude/*` 上規劃檔守衛完全不作用，「規劃未經人審
  不得寫產品程式碼」全靠自律。這正是守衛想防的情況，卻在 web session 的
  預設路徑上靜默失效。
  可能的修法：SessionStart hook 偵測到 `claude/*` 分支時，主動提示
  「走三段式請先切 `feature/<slug>`」。
- `/review-plan` 派出的 reviewer subagent **不會在 session 恢復後存活**，
  結果直接遺失且無任何痕跡（沒有 review.md、沒有錯誤）。長規劃若中途被打斷，
  審查等於白跑一次。或許 review.md 應該由每個 subagent 各自落檔後再彙整，
  而不是全部彙整完才寫檔。
