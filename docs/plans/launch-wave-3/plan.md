# 第 3 波：T1 登入狀態信任＋條款十之一（2026-11-10 晉升）

<!-- plans-keep: 跨 session 鷹架（第 3 波主／執行／審查 session 的共同事實來源）；退場條件＝第 3 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**本波任何新開的 session**看：開局只有 repo 與這份檔，沒有對話記憶。三種 session 分工與凍結規則見 `docs/README.md`〈慣例〉；
派工 prompt 在同目錄 `dispatch-prompts.md`。主 session＝`session_01MQovbCkDzRPwGvYPQ8ST2e`，分支 `claude/uknow-wave-3-lead-qg5mpa`。
行號一律現算。

## 0. 上游與裁決

**上游**

- `docs/plans/launch-wave-2/plan.md`：§0 裁決 W2-1～26（仍有效）、§3 執行環境須知（本檔 §3 收錄並補充）、§5 候選、§6 第 5 項條款十之一上線步驟。
- `docs/plans/launch-wave-2/review.md`：第 2 波審查（P0 0／P1 0／P2 15）；§5 待辦、§6 升級表＝`launch-wave-2/` 退場依據（由 R3 執行）。
- 交接時現況（10/31）：main＝`5b6a790`（第 2 波晉升 #463，正式站 build-sha 相符）；develop＝`2b1284a`，領先 main 只有 docs 與 #464。
  #453（C）、#466（T1）皆 draft、皆落後 develop。

**目標**：11/10（週二）10:00 晉升；C（條款十之一）與 T1 PR-A 必上。

**裁決（AskUserQuestion，業主 2026-10-31 20:10 台北）**

| # | 題 | 裁決 |
|---|---|---|
| W3-1 | 本波範圍 | **必上＋小項**：C、T1 PR-A 必上；L、A、K 在 11/09 22:00 前合進 develop 就上；T1 PR-B 有餘力才上，否則順延第 4 波 |
| W3-2 | 派工順序 | **C 先合＋平行開小項**：主 session 先審 C、rebase、CI 綠合 develop，再對 develop dispatch dry-run；同時開 L、A（Sonnet）；T1 等業主親打；K 等 L 或 A 任一合併後補 |
| W3-3 | T1 實作 session | **開新的 Opus session**（第 2 波規劃 session `session_01MQovbFCufZij3JrT9nnFM2` 不跨波）；業主在新 session 親打 `/tdd-implement auth-state-trust` |
| W3-4 | C 合併前審查深度 | **主 session 親審全 diff＋一個沒看過主 session 結論的獨立 Opus agent** 專審刪除路徑（比例閘、寬限期、dry-run 預設、RLS 撤除、候選查詢） |

主 session 依工程預設定的（低風險，不另問）：

| # | 事 | 定案 |
|---|---|---|
| W3-5 | K 的 P2-1 修法 | 商店級告警去重鍵加**日期桶**（比照 burst 的小時鍵），不改 `logSystemAlertOnce` 的既有語意 |
| W3-6 | L 的範圍 | W2-24（只有 POP 還原）＋審查 P2-15（`homeListingsCache.test.ts`）；P2-7（`searchQuery` 計入 `totalFilters`）不做，屬 UI 取捨、未裁決 |
| W3-7 | migration 版本號登記 | C＝`20261102000001`（已在分支）；A 從 `20261104000001` 起；其他工項無 migration。rebase 後一律跑 `check-migration-versions.py` |

沿用的硬規則：服務條款等四份律師定案文件不可改；使用者可見文案一律「推薦人」；admin 提領資料不得持久化；晉升 PR 開著時 develop 不合任何 PR。

## 1. 時程

| 時點（台北） | 事 |
|---|---|
| 10/31 晚 | 本檔落檔；開 T1、L、A 三個 session；主 session 審 C |
| 11/01–11/02 | C 合 develop → 對 develop dispatch photo-purge dry-run（401＝develop 的 `RECONCILE_SECRET` 需業主補設）；L／A 審合；開 K |
| 業主時間 | 在 T1 新 session 親打 `/tdd-implement auth-state-trust`；A1 前主 session 代跑 A0 SQL |
| **11/09 22:00** | 收件截止：沒合進 develop 的順延第 4 波 |
| 11/10 10:00 | 開晉升 PR（develop→main，標題 `chore(release): 晉升 develop → main——第 3 波`）→ journey-full 綠 → merge commit → 業主核准 `production` → `/health` sha 與 build-sha 對上 |
| 11/10–11/13 | 業主核對正式站照片候選清單 → 設 `PHOTO_PURGE_LIVE=true`（W2-8：晉升後 3 日內） |
| 晉升後 | 開 R3 第 3 波審查 session（同時讓 `launch-wave-2/` 退場） |

## 2. 工作分解

在途上限：**程式碼工項同時最多 3 個**（主 session 審查是瓶頸）；C 的審查由主 session 做，不佔名額。

| ID | 工項 | 流程／分支 | 模型 | 主要動到 | 撞檔 |
|---|---|---|---|---|---|
| C | 條款十之一照片清理（#453，實作完成） | 主 session 審 → rebase → 合；分支 `feature/listing-photo-retention` | 主 session（Opus）＋獨立審查 agent | `supabase/functions/api/index.ts`、migration `20261102000001_listing_photo_orphans.sql`、排程 workflow、RLS 測試 | 與 K 同為 index.ts／workflow → K 在 C 合併後開 |
| T1 | 登入狀態信任 PR-A（A0–A4）；PR-B（B1–B3）有餘力才做 | `/tdd-implement auth-state-trust`（業主親打），分支 `feature/auth-state-trust`，PR #466 | Opus | `src/App.tsx`、新 `useAuthBootstrap`、`Navbar`、`BottomNav`、`apiClient`、AuthPage、CompleteProfile、e2e `route_guards.feature`；順手併審查 P2-5（`SIGNED_OUT` 呼叫 `resetHomeListingsCache`） | 與 L 都碰 `homeListingsCache.ts`（T1 只改註解＋reset 呼叫）——後合的 rebase |
| L | 點 logo／導覽列回首頁回到乾淨首頁，只有返回（POP）還原篩選與捲動（W2-24）＋`homeListingsCache.test.ts`（P2-15） | `/fix-bug`，`fix/home-push-no-restore` | Sonnet | `src/components/HomePage.tsx`、`src/utils/homeListingsCache.ts`、測試 | 見 T1 |
| A | 後台會員列表與詳情顯示推薦碼、是否加入推薦計畫（W2-2／W2-26） | Plan Mode，`fix/admin-member-referral-cols` | Sonnet | migration（`admin_list_members`／`admin_member_detail`，版本號 `20261104000001` 起）、`index.ts` `/admin/members` 兩支、`api-contract.ts`、`MemberManagement.tsx`、會員詳情 | index.ts 只動 admin 區段 |
| K | 告警管線四縫（審查 P2-1～4）＋reconcile curl DNS 失敗重試 | Plan Mode，`fix/alert-pipeline-gaps` | Sonnet | `index.ts`（`payuni-merchant` 去重鍵、`/internal/system-alerts/recent`）、`.github/actions/notify/action.yml`、`deploy-smoke.yml`、`reconcile-payments.yml` | C 合併後開 |
| R3 | 第 3 波審查（晉升後） | 審查 session，唯讀；報告 `docs/plans/launch-wave-3/review.md`；兼做 `launch-wave-2/` 退場 | Opus | — | — |

主 session 自己做：本檔 §7／§8；C 的審查與 rebase；A0 SQL 代跑；合併後 dispatch 驗證（第 2 波審查 §4.2-3：PR 自述靠排程驗的，合併後立刻 dispatch）；
#467 在週一 Dependabot 批次後複查；第一筆正式站真付款後確認發票與 `system_alerts` 無誤報（第 2 波審查 §5-5）。

## 3. 執行環境須知（寫進每個派工 prompt）

第 2 波 plan §3 全部仍適用（`create_session` 帶 `source_url`／`source_revision=develop`；`npm install -g deno`；子 session 不用 Supabase MCP、
SQL 交主 session 代跑；`gh pr checks` 被擋改用 GitHub MCP；journey 只用 workflow_dispatch；tdd-lock 解鎖只認業主親打）。補充：

- **推送守衛會自動 rebase 到最新 develop**（`.claude/hooks/pre-push-rebase.sh`），之後必須 `--force-with-lease`，而 auto mode 分類器可能擋
  改寫遠端分支的 force push。被擋時不要硬繞：以 plumbing 在遠端分支頂端疊**快轉** commit（`git read-tree` → `update-index --cacheinfo` →
  `commit-tree -p origin/<branch>` → 一般 push），或回報主 session 代為 rebase。
- 新的 `docs/plans/<slug>/` 目錄若要在 PR 中先合併，開 PR 前就加 `plans-keep` 註解，否則 `check-plans-scaffold` 紅（T1 規劃期踩過）。

## 4. 11/10 晉升清單（主 session）

1. 11/09 22:00 後 develop 凍結；列出 `5b6a790` 之後合進 develop 的全部 PR、後端變動、migration 檔名。
2. 開晉升 PR、訂閱；journey-full（sandbox）綠 → merge commit 合 main → 請業主核准 `production`（找建立時間緊跟 main CI push run 的那筆）→ `/health` sha、deploy-smoke build-sha 對上。
3. C 上線步驟（第 2 波 plan §6 第 5 項）：正式站預設 dry-run；業主 11/13 前本機 curl 核對候選清單 → 設 repo variable `PHOTO_PURGE_LIVE=true`；
   被比例閘擋時用 `force_ratio` dispatch；`orphanTotal` 超過 500 分多輪。
4. 開 R3。

## 5. 第 4 波候選（未納入本波，一行一項；細節見第 2 波 plan §5）

T1 PR-B（若本波沒上）；PR #379 launch-readiness ①–④ 分拆；備份／PITR 評估；伺服器端密碼規則；`handle_new_user` 不讀 metadata＋`national_id` 唯一；
後台稽核軌跡 A1b-2/3；SEO 進階；框架修訂（friction-log）；`lazyWithRetry` 簡化＋表單草稿保存；#421 記債；#430 輪播 P2；成功頁發卡行評估；邀請體驗整體重調；
A1a、A2、L1-1、S7b；寬限期失效破圖通知（W2-12）；首頁 `searchQuery` 計入 `totalFilters`（審查 P2-7）；`setup-node` 逾時（審查 §4.2-4）；
notify／return 的 `payuniConfig()` 擲錯告警（審查 P2-10）；子網域盤點＋完整 CSP；vitest／vite 大版本（#467）；登出清所有模組快取的機械把關（審查 §4.2-2）。

## 6. 業主待辦

| # | 事 | 狀態 |
|---|---|---|
| 1 | 手動刪 GitHub 暫存分支 `claude/auth-state-trust-v41`、`claude/auth-state-trust-v41b` | ⬜ |
| 2 | 在 T1 新 session 親打 `/tdd-implement auth-state-trust`（主 session 開好後給連結） | ⬜ |
| 3 | C 合 develop 後若 dry-run 回 401：到 Supabase develop branch 的 Secrets 設 `RECONCILE_SECRET`（與正式站同值） | 等 C |
| 4 | T1 A3 實機截圖時回答 Q6（登出鈕樣式）、Q7（取消註冊確認框文案）、Q8（「稍後付款」鈕文字） | 等 T1 A3 |
| 5 | 11/10 晉升合進 main 後核准 `production` 部署 | 11/10 |
| 6 | 11/13 前核對正式站照片候選清單，再設 `PHOTO_PURGE_LIVE=true` | 11/10–13 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| C | 第 2 波 `session_01MQovbCF5454fAYfqy9NXaJ`（實作，已完成） | 主 session 審 | `feature/listing-photo-retention` | #453（draft，rebase 後 head `28dfaf73`） | 主 session 審查中 |
| T1 | `session_01MQovbCdCKc51kHwtEqiV9o` | Opus | `feature/auth-state-trust` | #466（draft） | 備環境，等業主親打 `/tdd-implement` |
| L | `session_01MQovbEyD9mbV4raoxQDrtU` | Sonnet | `fix/home-push-no-restore` | — | 施工中 |
| A | `session_01MQovbEgBxiL2rkNdo1BWQL` | Sonnet | `fix/admin-member-referral-cols` | — | 施工中 |
| K | — | Sonnet | `fix/alert-pipeline-gaps` | — | 等 L 或 A 合併 |
| R3 | — | Opus | `docs/wave3-review` | — | 晉升後 |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 10/31 20:10 | 主 session 開局：讀交接與第 2 波 plan／review；#453 head `96a7e874`、#466 head `1ea013c`，皆落後 develop `2b1284a`。業主裁決 W3-1～4，主 session 定 W3-5～7；本檔擴寫、落 `dispatch-prompts.md` | 開 T1、L、A；審 C |
| 10/31 20:15 | 開 #471（本檔，draft，已訂閱）。開 T1 `session_01MQovbCdCKc51kHwtEqiV9o`（Opus）、L `session_01MQovbEyD9mbV4raoxQDrtU`、A `session_01MQovbEgBxiL2rkNdo1BWQL`（Sonnet），tag `uknow-wave-3`；A 與 K 的 prompt 補「不要進 Plan Mode 工具（無人核准會卡住）」。C 在 worktree rebase 到 develop（friction-log 檔尾衝突，兩條都保留）→ force-with-lease 推 `28dfaf73`、已訂閱；派獨立 Opus agent 審刪除路徑（W3-4），主 session 同時讀全 diff | 等 C 的 CI 與獨立審查；T1 備妥後通知業主親打 |
