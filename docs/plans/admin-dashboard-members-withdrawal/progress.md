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
| 2.5 | 列表分頁／彙總／篩選／events | ✅ 綠 | `402e56f` | `29104c5` |
| 2.6 | 退件理由端到端（含收掉手抄型別） | ✅ 綠 | `98c71e4` | `dff16ba` |
| 2.7 | 作業台前端（同屏＋複製＋批次＋分頁＋CSV＋手機邊界） | ✅ 綠 | `ecbac1f` | `68d6c30`＋`46b1f3a`＋（本次） |
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

階段 2.5 紅燈 `402e56f` 判定 `197 passed / 5 failed`（範圍乾淨，既有 197 支
未受影響），綠燈 `29104c5` 判定 `202 passed / 0 failed`。

**已完成 12 階段。** 階段 2.6 紅燈 `98c71e4` 判定 `202 passed / 3 failed`
（形狀與預期一致），綠燈 `dff16ba` 判定 `205 passed / 0 failed`。綠燈同時收掉
plan §2.4 的順手項：`WithdrawalSection.tsx` 的手抄 `WithdrawalRecord` 改 import
`@contract`——契約這一步長出 `note` 與 `completedByAdmin`，抄本不會跟著長，而
**多出來的欄位對元件只是「沒讀」、`tsc` 不會叫**，正是契約要防的靜默漂移。

進行中：階段 2.7（作業台前端），13 條測試本機判定 **12 failed / 1 passed**。

那 1 條綠的是「沒有任何申請時顯示空態」——**它本來就是既有行為**，不是新
功能被提前實作。如實記錄：這條在本階段是 characterization，不是紅轉綠的證據。

紅燈 commit 同時帶了**最小 stub**（元件改吃注入的 `loadWithdrawals` /
`updateStatus` / `batchMarkPaid`，`AdminDashboard` 補上三個 module-level
loader）。這是 pre-commit 靜態閘門的明文要求:「紅燈 = 編譯過、斷言失敗」——
測試引用尚不存在的 props 會讓 `tsc` 紅，而型別紅燈與斷言紅燈混在一起就分不清
哪個是真訊號。順帶把 `useNotification` 拿掉：元件測試不該為了 toast 去包整個
Provider，而錯誤態本來就該渲染在畫面上（三態要求之一）。

**階段 2.7 已綠**（13 條全過、`npm run check` exit=0、本機全套 mock e2e
`168 passed`）。B6 三條測試缺陷經人審批准後修正，詳見下方 B6 的裁決結果。

剩餘：2.8–2.9、3.1–3.4、4.1。

### 階段 2.7 需要先抽取的第二個元件內私有函式

`useMediaQuery` 目前是 `ReferralTreeView.tsx:97` 的檔內私有函式，沒有 export。
W8（手機只鎖「標記已匯款」）需要它。這與階段 2.2 的 `copyText` 是**同一個
模式**——plan §4 點名了 `copyText` 卻沒點名這個，但理由完全一樣:「復用不先
抽取就會變成複製貼上」。抽到 `src/hooks/useMediaQuery.ts`，`ReferralTreeView`
一併改成 import。

### 階段 2.7 被 e2e 抓到的兩個真缺陷（不是 fixture 過期）

推 `68d6c30` 後 `e2e-tests` 紅了 7 條。**兩條都是我引入的真缺陷**，不是測試
資料過期而已：

**(1)一個面板的 payload 形狀不合，五個分頁一起打不開。** 舊 mock 只回
`{withdrawals}`，沒有 `total` / `stats`；元件 `setStats(data.stats)` 拿到
`undefined`，接著讀 `stats.pendingAmount` 直接擲錯。`WithdrawalManagement` 是
`AdminDashboard` 的**預設分頁**，所以會員管理、公告、系統告警、管理員設置
**全部連著打不開**——e2e 的 `get_by_role("tab", name="會員管理")` timeout 就是
這麼來的。爆炸半徑不該這麼大：已改成缺欄位退回保守值
（`data.total ?? rows.length`、`data.stats ?? EMPTY_STATS`）。

**(2)admin 做完動作後完全沒有回報。** 紅燈階段我把 `useNotification` 拿掉，
理由是元件測試不該為了 toast 包整個 Provider——但那同時**把成功回饋一起刪了**，
而我沒發現，因為 13 條單元測試沒有任何一條驗「做完之後說了什麼」。e2e 有：
兩條情境斷言的正是 toast 文字 `已標記匯款完成` / `已退件`。

改法不是把 toast 裝回去，而是**把回報留在畫面上**（`role="status"` 的行內訊息
＋「知道了」）。理由是這個場景本身：admin 標記完一筆就切去網銀，回來時 toast
早消失了，於是不確定剛才那下到底送出去沒有——對金流動作，這種不確定比沒有
動畫效果糟得多。

**教訓**：拿掉一個相依時要問「它原本還負責什麼」。`useNotification` 表面上只是
測試阻力，實際上是那個元件唯一的成功回饋管道。

順帶更新 e2e 側：mock 回真契約形狀（含 `total` / `stats` / `events`），
page object 的按鈕名改 `標記已匯款`（旅程套件共用同一個 page object，一起涵蓋）。

**本機全套 mock e2e 已驗**：`168 passed`（`pip install -r e2e/requirements.txt`
後於 `e2e/` 下以 `E2E_SKIP_DEV_SERVER=1` 執行，dev server 另起）。這一層本機
跑得動、2.5 分鐘——**前端階段值得每次都跑**，不要只靠 CI。

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

### ⚠️ B5：又一次「推 commit 與等驗證互斥」失守（同 B4，換了個面向）

`bbb696e` 的 `ci-ok` 紅燈,原因是 `RESULTS` 裡有一個 `cancelled`——階段 2.6
紅燈推上去時,`bbb696e` 的 **e2e-tests 軌還在跑**,被 concurrency 取消。

B4 的教訓是「等驗證再推」,我這次卻把它窄化成「等 **api-tests** 再推」:
確認 api-tests `202 passed / 0 failed` 就推了下一個 commit,忘記 `ci-ok`
needs 的是**全部 11 軌**。後端階段的判定確實只看 api-tests,但**是否可以推**
要看整個 run 收工沒有。

後果有界:e2e 是全 mock 的前端情境,階段 2.5 只動後端與契約,而且下一個
run(`ab5c58a`)會重跑同一套 e2e——涵蓋沒有真的漏掉,漏掉的是「這個 commit
上 e2e 綠過」這條紀錄。

**判定條件從「api-tests 出爐」改成「整個 run 的 status = completed」。**

### B6 階段 2.7 的兩條測試自己寫錯——與專案已裁決的事實衝突（待人工裁決）

紅燈鎖擋下了我修改測試檔，**擋得對**。兩條斷言不是「實作還沒做到」，而是
**測試宣稱的行為與專案早先的裁決相反**；照著它們寫實作，等於用測試把兩個
已經想清楚的決定推翻掉。

**(1)`收款帳號可一鍵複製` 攔錯 API。** 測試斷言 `navigator.clipboard.writeText`
被呼叫，但 `src/utils/clipboard.ts`（階段 2.2 剛抽出來的）**刻意不用**
`navigator.clipboard`——檔頭寫著理由：LINE 等 in-app 瀏覽器與非 HTTPS 情境會
把它擋掉，而本專案使用者大量從 LINE 進來。照測試寫，就是在作業台重新引入
階段 2.2 才排除掉的失效模式。

修法：改成攔 `document.execCommand`，並從 `document.activeElement` 取出當下
被選取的 textarea 內容驗證帳號有進到剪貼簿路徑——驗的是同一件事，但攔在
專案真正使用的那一層。

**(2)`手機上不顯示標記已匯款…` 用了 plan 禁止的狀態轉換。** 測試把單筆
`awaiting_collection` 的記錄同時期待「退件」與「代為完成」兩顆鍵，但
plan §1.4 明文**不做 `awaiting_collection → rejected`**。退件只在 `pending`
可用、代為完成只在 `awaiting_collection` 可用，一筆記錄不可能同時有兩顆。

修法：改成兩筆記錄（一筆 `pending`、一筆 `awaiting_collection`），W8 要驗的
「手機鎖匯款但不鎖其他動作」原意不變。

**(3)`取資料失敗時顯示錯誤態並提供重試` 的查詢寫得太窄。** `findByText('王小明')`
在重試成功後會撞到兩個節點——作業面板一個、表格列一個。這不是實作的問題，
**同屏面板本來就該和列表同時顯示同一筆**（W1 要的正是這件事）。純機械修法：
改用 `findAllByText`。

**前兩條不是為了讓實作變綠而放寬斷言**——(1) 換的是攔截層、驗的事情不變，
(2) 補的是前置狀態、驗的邊界不變。但依紅燈期規則，測試檔的修改要人工裁決，
所以記在這裡等裁決；第 (3) 條是查詢寫法的機械修正，一併等同一次解鎖。

**裁決結果（2026-08-02，人審）：三條全部批准照上述修法修正。** 依裁決解除
紅燈鎖、改完三條測試，`npm run check` 全綠（`exit=0`）、`WithdrawalManagement`
13 條全過——與 `scripts/tdd-unlock.sh` 會驗的條件相同。

**這道閘門值得留著**：它擋下的不是筆誤，是兩個「照著測試寫實作就會推翻既有
決定」的改動。若當時直接改實作去迎合測試，(1) 會讓作業台在 LINE in-app
瀏覽器複製不了帳號、(2) 會做出 plan 明文否決的狀態轉換——兩個都不會有任何
測試叫。

**實作已完成，本機判定 `10 passed / 3 failed`**——3 條全部是上述測試自身的
缺陷，沒有一條是功能沒做到。`useMediaQuery` 抽取後 `ReferralTreeView` 的既有
測試全數維持綠（全庫 `489 passed / 3 failed`）。
