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
| W3-7 | migration 版本號登記 | A＝`20261104000001`（已合）；C 因 A 先合，改名為 `20261110000001`（C session 處理）；之後新 migration 一律晚於 develop 最大值。rebase 後一律跑 `check-migration-versions.py` |

**裁決（AskUserQuestion，業主 2026-10-31）**

| # | 題 | 裁決 |
|---|---|---|
| W3-8 | C 獨立審查 P1-1：正式站手動 dispatch 取消 dry_run 時，沒設 `PHOTO_PURGE_LIVE` 也會實刪，Edge 端也沒有開關 | **workflow 加閘**：production dispatch 實刪也必須 `PHOTO_PURGE_LIVE=='true'`，否則強制 dry-run 並警告（被推翻的選項：Edge 端另加 secret 雙鎖；維持現狀） |
| W3-9 | L 已知未涵蓋：人已在首頁時再點 logo，篩選與捲動不變 | **清篩選＋回頂端**，本波開 Sonnet 小工項 L2（`fix/home-logo-reset`） |
| W3-10 | T1 分工（業主已在 T1 實作 session 親打 `/tdd-implement`；第 2 波主 session 轉述的「分階段另開 session」） | **同一 session 做完 PR-A（A1–A4）**，收尾另開審查 session 跑 `/review-implementation`（被推翻：分階段另開，每個新 session 都要業主再打一次指令） |
| W3-11 | 晉升時點（業主「如果都跑完就晉升」） | **全部完成就晉升**：C、T1 PR-A、K 都合進 develop 後，主 session 立刻開晉升 PR，不等 11/10；11/09 22:00 收件截止不變，截止前沒合的順延第 4 波。合進 main 後仍由業主核准 `production`（被推翻：現在先晉升已合的 L／A／L2、之後再晉升一次；照原計畫 11/10） |

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
| L | 點 logo／導覽列回首頁回到乾淨首頁，只有返回（POP）還原篩選與捲動（W2-24）＋`homeListingsCache.test.ts`（P2-15） | `/fix-bug`，`fix/home-restore-pop-only` | Sonnet | `src/components/HomePage.tsx`、`src/utils/homeListingsCache.ts`、測試 | 見 T1 |
| A | 後台會員列表與詳情顯示推薦碼、是否加入推薦計畫（W2-2／W2-26） | Plan Mode，`fix/admin-member-referral-cols` | Sonnet | migration（`admin_list_members`／`admin_member_detail`，版本號 `20261104000001` 起）、`index.ts` `/admin/members` 兩支、`api-contract.ts`、`MemberManagement.tsx`、會員詳情 | index.ts 只動 admin 區段 |
| L2 | 已在首頁時點 logo／導覽列首頁＝清篩選＋捲回頂端（W3-9） | `/fix-bug`，`fix/home-logo-reset` | Sonnet | `HomePage.tsx`、Navbar／BottomNav 首頁連結、測試 | 與 T1 同碰 Navbar——後合的 rebase |
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
| 3 | **develop dry-run 已回 401**（run 41250155677）：到 Supabase develop branch 的 Secrets 設 `RECONCILE_SECRET`，與 GitHub secret／正式站同值；設好告訴主 session 重跑。不擋晉升 | ⬜ |
| 4 | T1 A3 實機截圖時回答 Q6（登出鈕樣式）、Q7（取消註冊確認框文案）、Q8（「稍後付款」鈕文字） | 等 T1 A3 |
| 5 | 11/10 晉升合進 main 後核准 `production` 部署 | 11/10 |
| 6 | 11/13 前核對正式站照片候選清單，再設 `PHOTO_PURGE_LIVE=true` | 11/10–13 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| C | 第 2 波 `session_01MQovbCF5454fAYfqy9NXaJ`（沿用，rebase 由它負責） | Opus | `feature/listing-photo-retention` | #453 ✅ d6be666 | 收工；待 develop dry-run |
| T1 | `session_01MQovbCdCKc51kHwtEqiV9o` | Opus | `feature/auth-state-trust` | #466（draft，規劃＋實作同一支） | A0–A2b 綠（HEAD `a0074cb7`），下一步 A3 |
| L | `session_01MQovbEyD9mbV4raoxQDrtU` | Sonnet | `fix/home-restore-pop-only` | #473 ✅ cd33515 | 收工 |
| L2 | `session_01MQovbCMjPvgMSqmXghhPQj` | Sonnet | `fix/home-logo-reset` | #474 ✅ 1253e00 | 收工 |
| A | `session_01MQovbEgBxiL2rkNdo1BWQL` | Sonnet | `fix/admin-member-referral-cols` | #472 ✅ b44606d | 收工 |
| K | `session_01MQovbDHyiASTQXhQNxSsU7` | Sonnet | `fix/alert-pipeline-gaps` | #475 ✅ 8912099 | 收工 |
| R3 | — | Opus | `docs/wave3-review` | — | 晉升後 |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 10/31 20:10 | 主 session 開局：讀交接與第 2 波 plan／review；#453 head `96a7e874`、#466 head `1ea013c`，皆落後 develop `2b1284a`。業主裁決 W3-1～4，主 session 定 W3-5～7；本檔擴寫、落 `dispatch-prompts.md` | 開 T1、L、A；審 C |
| 10/31 20:15 | 開 #471（本檔，draft，已訂閱）。開 T1 `session_01MQovbCdCKc51kHwtEqiV9o`（Opus）、L `session_01MQovbEyD9mbV4raoxQDrtU`、A `session_01MQovbEgBxiL2rkNdo1BWQL`（Sonnet），tag `uknow-wave-3`；A 與 K 的 prompt 補「不要進 Plan Mode 工具（無人核准會卡住）」。C 在 worktree rebase 到 develop（friction-log 檔尾衝突，兩條都保留）→ force-with-lease 推 `28dfaf73`、已訂閱；派獨立 Opus agent 審刪除路徑（W3-4），主 session 同時讀全 diff | 等 C 的 CI 與獨立審查；T1 備妥後通知業主親打 |
| 10/31 20:40 | **#473（L）合進 develop（cd33515）**：主 session 審，無 P0／P1（POP 才還原，非 POP 只清篩選與捲動、清單快取保留）。主 session 把 A rebase 後推 `758f44e4` → CI 綠 → **#472（A）合進 develop（b44606d）**：兩支 RPC 對前版只增欄位、權限照舊。獨立審查交回 #453：**P0-1**（錨點只看同 base 的 URL，base 漂移時放行；物件數 ≤20 不設比例閘）、**P1-1**（production dispatch 沒設 LIVE 也能實刪）、P2 五條。主 session 代跑正式站唯讀 SQL：32 物件、超過 7 日 0 個、30 個 URL 皆同一個 base → 現在不會觸發，但要修 | C 修 P0-1／P2 |
| 10/31 21:30 | 第 2 波 C session 自行把 migration 改名 `20261110000001`（A 先合，避免版本倒序），並要求 rebase 只由一方負責 → 定為由 C 負責，主 session 不再推 #453。C 修 P0-1（引用判準與 base 脫鉤、錨點改以「有照片的刊登者」為分母、拿掉 ≤20 豁免）＋P2（log 不印 err、advisor 預期、admin 代傳約束、晚存檔破圖寫進規格書）：紅燈 `16647896`→綠燈 `e4f6c038`，紅燈後沒改測試，CI 綠。主 session 審 migration 修正版：無 P0／P1 | 業主 W3-8／W3-9 |
| 11/01 04:50 | 業主裁決 **W3-8**（workflow 加閘）、**W3-9**（首頁再點 logo＝清篩選＋回頂端）。W3-8 交給 C，授權 CI 綠後自行轉 ready；開 **L2** `session_01MQovbCMjPvgMSqmXghhPQj`（Sonnet）。T1 仍等業主親打 `/tdd-implement` | C 轉 ready → 主 session 審最後一段 diff 後合 → develop dry-run → 開 K |
| 11/01 05:05 | **#474（L2）合進 develop（1253e00）**：改監聽 `location.key`，非 POP 的新 key 就重設篩選並捲回頂端；首頁本身不改 URL，不會自我重設。沒有獨立紅燈 commit（只在本機驗紅），以 19 行的規模接受。C 推 W3-8：紅燈 `b120b512`→綠燈 `59735dcf`，主 session 審過；之後 C 自行 rebase 成 `b5353e0` | C 轉 ready |
| 11/01 05:50 | 業主在 T1 實作 session 親打 `/tdd-implement`，人審通過。A0 由主 session 代跑：正式站 21:32 UTC 0／0／0／0、develop 21:52 UTC 1／0／0／0（第 2 波主 session 21:16 UTC 那次結果相同）→ 可進 A1。T1 規劃 session 已退訂 #466，改由 T1 實作 session 訂閱。業主裁決 **W3-10**（T1 由同一 session 做完 PR-A） | T1 A1–A4；完成後開 T1 審查 session |
| 11/01 06:00 | 業主裁決 **W3-11**：全部完成就晉升（可早於 11/10）。#471 兩版 CI 綠 | C 轉 ready；T1 施工；C 合併後開 K；三項都合併即開晉升 PR |
| 11/01 06:27 | C 自行 rebase 成 `b5353e0`，CI 綠但沒有轉 ready（session 閒置）。主 session 逐位元組比對，rebase 後的 diff 與審過的 `59735dc` 完全相同 → 主 session 轉 ready → **#453 合進 develop（d6be666）**。開 **K** `session_01MQovbDHyiASTQXhQNxSsU7`（Sonnet）。設 send_later，develop 部署完成後 dispatch dry-run（target=develop、force_ratio） | develop dry-run；K；T1 |
| 11/01 06:42 | **#475（K）合進 develop（8912099）**：主 session 審，無 P0／P1。P2-4 的偏離（不改窗口、改在內文註明「另有 N 筆」）經核實成立：端點以 `count:'exact'` 回傳完整 total | develop 部署後驗證 |
| 11/01 06:53 | develop 已部署 8912099（deploy-supabase run 41249918243）。主 session dispatch 驗證：**purge-listing-photos（target=develop、dry_run、force_ratio）回 `unauthorized`**（run 41250155677）→ develop 的 Supabase `RECONCILE_SECRET` 與 GitHub secret 不同值，workflow 照設計自動開了失敗 issue；**reconcile（run 41250157710）綠**，「呼叫對帳端點」帶重試成功，這輪沒有新 error 告警，所以「確認 LINE 推送設定存在」照設計跳過（只能等真有告警時實證）。本波只剩 T1 | 業主設 develop secret 後重跑 dry-run；T1 完成即晉升（W3-11） |
| 11/01 10:17 | T1 回報 A1 紅 `24325327`／綠 `55493dc6`、A2a 紅 `9db61256`／綠 `a2379904`、A2b 紅 `7ca2ff28`／綠 `0f22801c`；A2a 本機 e2e 308/308 綠。偏離：A1 逃生口 2（「漏斗路由在 App.tsx 有 Route」的測試用單行字串比對，碰到多行 JSX 必紅），業主在 T1 session 裁決放寬比對、授權解鎖，已記進 progress Blockers。P2-5（登出清 `homeListingsCache`）已併入 | T1 A3（帶 Q6–Q8 截圖）→ A4 |
