# 第 4 波：登出清理＋暫時性故障不登出（11/15 收件）

<!-- plans-keep: 跨 session 鷹架（第 4 波主／執行／審查 session 的共同事實來源）；退場條件＝第 4 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**本波任何新開的 session**看：開局只有 repo 與這份檔，沒有對話記憶。三種 session 分工與凍結規則見 `docs/README.md`〈慣例〉；
派工 prompt 在同目錄 `dispatch-prompts.md`。主 session＝`session_01MQovbEFdqaJrxqs2p1jZ5D`，分支 `claude/dazzling-darwin-y7gs0z`。
行號一律現算。第 3 波主 session 寫的交接原文：`git show 27b09a0:docs/plans/launch-wave-4/plan.md`。

## 0. 上游與裁決

**上游**

- `docs/plans/launch-wave-3/plan.md`：§0 裁決 W3-1～15（仍有效）、§3 執行環境須知、§5 候選。
- `docs/plans/launch-wave-3/review.md`：第 3 波審查（R3，P0 0／P1 0／P2 22）；§2 未驗項、§5 待辦、§6 升級表＝`launch-wave-3/` 退場依據（由本波審查 session R4 執行）。
- 開局現況（11/01 20:13 台北）：main＝`1f61e68`（第 3 波晉升 #477，正式站 `/health` sha、build-sha 相符）；develop＝`27b09a0`，領先 main 只有 docs（#478、#479、#480）。
  沒有開著的 PR；open issue：#467（npm audit）、#395（PayUni 查詢層，欠 sandbox 實打）、#384、#383。
  照片清理 `PHOTO_PURGE_LIVE=true`，首輪實刪排程在台北 11/02 03:17，開局時尚未執行（見 §8）。

**目標**：必上 F1、E、D、K2、P 五項全部合進 develop 就晉升；T1-B 有完成才上。11/15（日）22:00 收件截止。

**裁決（AskUserQuestion，業主 2026-11-01 20:20 台北）**

| # | 題 | 裁決 |
|---|---|---|
| W4-1 | 本波範圍 | **四項＋T1-B 併 P2-6／P2-15**：F1、E、D 必上；T1-B（暫時性故障不登出）併入 R3 P2-6（`/profile` 404 語意不一致）與 P2-15（冷啟動 5xx 畫訪客版），有完成才上（被推翻：只做小項快晉升；T1-B 列必上） |
| W4-2 | R3 P2 加收 | **CI／告警小修（K2：P2-10、12、13、22）列必上**；**規格書補記 P2-18 交本波審查 session**，與 `launch-wave-3/` 退場一起做（未選：後台／UX 小缺口 P2-16／17；#395 sandbox 實打——留第 5 波候選） |
| W4-3 | 派工順序 | **F1＋E 先開，D 等週一**：11/01 晚開 F1、E（Sonnet）與 T1-B 規劃（Opus，規劃期不佔名額）；D 等 11/02 Dependabot 週一批次後再開；T1-B 實作等 F1 合併（被推翻：全部同時開；一項一項來） |
| W4-4 | 晉升時點 | **全完成就晉升＋11/15 截止**：必上四項都合進 develop 即開晉升 PR；11/15 22:00 收件，沒合的順延第 5 波（被推翻：固定 11/17；小項先晉升、T1-B 再晉升一次） |

**裁決（AskUserQuestion，業主 2026-11-01 21:00 台北）**

| # | 題 | 裁決 |
|---|---|---|
| W4-10 | F1 紅燈期死結：舊測試 `button.test.tsx`〈aria-disabled 與 disabled 同樣呈現停用外觀並擋住指標〉斷言的正是 W3-15 要拿掉的行為 | **授權改寫成反向斷言並解鎖**；依〈慣例〉由業主在 F1 session 親打授權才生效（被推翻：先不改） |
| W4-11 | T1-B Q1：`/profile` 404（P2-6） | **不登出、停在 `/login` 顯示「帳號資料異常，請聯絡客服」、不自動導頁**，bootstrap 與 OTP 兩條路徑統一（被推翻：本機登出＋toast→`/login`，有重登循環） |
| W4-12 | T1-B Q2：`accountStatus:'unknown'` | **不加**，五讀取任一失敗一律 503 |
| W4-13 | T1-B Q3：無效 session 的系統清理 scope | **local**（保留邀請 token；被推翻：維持 global） |
| W4-14 | T1-B Q4：apiClient 401 兩層確認 | **本 PR 做，排最後階段，11/15 前來不及可降級拆第 5 波** |
| W4-15 | T1-B Q5：degraded 文案 | 「網路不穩，正在重新連線」＋「重試」，說明改「請稍後按重試」，**不加輪詢** |
| W4-16 | T1-B Q6：degraded callout 的「登出」鈕 | **加，必做，走主動登出 global**（`signOutWithFallback`；被推翻：用 local；不加） |
| W4-17 | T1-B Q7：首頁 degraded 且無提示時頁首空槽 | **接受為已知取捨**，列規格書已知限制（被推翻：補斷線 icon） |
| W4-18 | T1-B 異常 callout「聯絡客服」入口（22:00） | **既有 `LINE_OFFICIAL_ACCOUNT_URL`**（與 Footer、結帳頁同一入口；被推翻：LINE＋Email 並列） |
| W4-20 | T1-B B4 紅燈期：舊測試「SIGNED_IN 為另一個 uid…載入新帳號」釘死 `fetchProfile` 參數 `{ userId }`，與 plan §2.2 的 8 秒逾時衝突（11/02 00:25） | **授權只改參數期望為 `{ userId, timeoutMs: 8_000 }`**，測試語意不變；業主在 T1-B session 親打才生效（被推翻：改實作不帶逾時） |
| W4-21 | `uknow.pages.dev`（Pages 根網址＝main 建置）顯示正式站資料但登入「Failed to fetch」（正式站 CORS 只放行 uknow.com.tw，刻意設計），易誤用（11/02 00:50） | **本波加小工項 P**：前端偵測 host 精確等於 `uknow.pages.dev` 就導向 `https://uknow.com.tw`（保留路徑）；CORS 不放寬（被推翻：列第 5 波候選；不處理） |
| W4-19 | T1-B plan v2.1 的 v2 P1 由規劃者自行落地、未經獨立複核（22:00） | **主 session 親審 v2.1 diff 代替第三輪 `/review-plan`**（被推翻：不重跑交實作後審查；重跑完整四視角） |

主 session 依工程預設定的（低風險，不另問）：

| # | 事 | 定案 |
|---|---|---|
| W4-5 | K2 開工時點 | 11/01 晚與 F1、E 一起開，占第三個程式名額（K2 只動 CI、檢查腳本與一行註解，和 F1／E 不撞檔）；D 等 E 或 K2 任一合併後補位 |
| W4-6 | T1-B 規劃 slug | `auth-transient-resilience`，分支 `feature/auth-transient-resilience`；規劃原檔 `git show b4b5bdcb:docs/plans/auth-state-trust/plan.md`（§2.3、§2.4、§2.5、§5 PR-B）重新落檔、重跑 `/review-plan`，停等業主人審與親打 `/tdd-implement` |
| W4-7 | rebase 歸屬（交接 §2：一個分支只能由一方 rebase） | **各分支由自己的執行 session rebase**；主 session 只在該 session 閒置且已在 PR 留言宣告接手後才動，接手後原 session 不再推 |
| W4-8 | migration 版本號 | 本波預期無 migration；若有，一律晚於 develop 最大值，rebase 後跑 `check-migration-versions.py` |
| W4-9 | 晉升條件與 T1-B | 必上四項合併時，若 T1-B 已在實作且預估 11/15 前合得了，由主 session 問業主「等或先晉升」；T1-B 還在規劃／人審就不等 |

沿用的硬規則：服務條款等四份律師定案文件不可改；使用者可見文案一律「推薦人」；admin 提領資料不得持久化；晉升 PR 開著時 develop 不合任何 PR。

## 1. 時程

| 時點（台北） | 事 |
|---|---|
| 11/01 晚 | 本檔落檔（#本 PR）；開 F1、E、K2（Sonnet）、T1-B 規劃（Opus） |
| 11/02 03:17 後 | 主 session 核對照片清理首輪實刪 run 的 step summary，記進 §8，並補進第 3 波 review §2 |
| 11/02（一） | Dependabot 週一批次 → 開 D（E 或 K2 合併後補位） |
| 業主時間 | 審 T1-B 規劃（`/review-plan` 報告）→ 親打 `/tdd-implement auth-transient-resilience`；實作在 F1 合併後才開始 |
| **11/15 22:00** | 收件截止：沒合進 develop 的順延第 5 波 |
| 必上四項合併後 | 開晉升 PR（develop→main，標題 `chore(release): 晉升 develop → main——第 4 波`）→ journey-full 綠 → merge commit → 業主核准 `production` → `/health` sha 與 build-sha 對上 |
| 晉升後 | 開 R4 第 4 波審查 session（兼做 `launch-wave-3/` 退場與規格書補記 P2-18） |

## 2. 工作分解

在途上限：**程式碼工項同時最多 3 個**（主 session 審查是瓶頸）；T1-B 規劃期不佔名額，進實作才佔。

| ID | 工項 | 流程／分支 | 模型 | 主要動到 | 撞檔 |
|---|---|---|---|---|---|
| F1 | R3 P2-1～5（W3-15）：Button 基底拿掉 `aria-disabled:pointer-events-none／opacity-50`、改在 Navbar 兩顆鈕補；換 uid 的 SIGNED_IN 補快取清理；`withdrawalBankData` 登出清除；cancel-signup busy＋401；401 分支與 AuthPage 改走 `signOutWithFallback` | `/fix-bug`，`fix/signout-cleanup` | Sonnet | `src/components/ui/button.tsx`、`Navbar.tsx`、`AdminToolbar.tsx` 註解、`useAuthBootstrap.ts`、`WithdrawalProcess.tsx`、`CompleteProfile.tsx`、`apiClient.ts`、`AuthPage.tsx`、測試 | 與 T1-B 同碰 `useAuthBootstrap`／`apiClient` → T1-B 實作等 F1 合併 |
| E | R3 P2-7：journey 偶發補診斷——`registration.py` 等 `#name` 前補 `dump_page`；f70 改等 `round-progress` test id 並以 `to_have_text` 斷言 | 小 PR，`fix/e2e-flake-diagnostics` | Sonnet | `e2e/journey/builders/registration.py`、`e2e/journey/steps/f70_renewal_saga_steps.py` | 無 |
| K2 | R3 P2-10（spec-drift 補 `ORPHAN_SWEEP_LIMIT` 規則）、P2-12（deploy-smoke `failure()` fallback 標題）、P2-13（notify 其他呼叫端缺 secret 至少在 summary 標紅）、P2-22（日期桶註明 UTC） | 小 PR，`fix/ci-alert-p2` | Sonnet | `scripts/check-spec-drift.py`、`deploy-smoke.yml`、`.github/actions/notify/action.yml`、`index.ts` 一行註解 | 無 |
| D | issue #467 npm audit（critical 2、high 10）：先吃 Dependabot 週一批次，剩下的補；`vitest`／`vite` 大版本另開 PR | 小 PR，`fix/npm-audit-467` | Sonnet | `package.json`、`package-lock.json` | 與 Dependabot PR 互斥——先看批次 |
| T1-B | 暫時性故障不登出：degraded 狀態、`/profile` 8 秒逾時＋重試、後端 503、`endInvalidSession()`；併 R3 P2-6、P2-15 | 三段式：`/plan-feature auth-transient-resilience` → `/review-plan` → **停等業主** → 業主親打 `/tdd-implement`；分支 `feature/auth-transient-resilience` | Opus | `useAuthBootstrap.ts`、`fetchProfile.ts`、`apiClient.ts`、`routeAfterVerifiedSession.ts`、`index.ts`（503）、`api-contract.ts`、e2e `route_guards.feature`、規格書 §14 #8 | 見 F1 |
| P | `uknow.pages.dev` 根網址導向正式網域（W4-21） | `/fix-bug`，`fix/pages-root-redirect` | Sonnet | `src/main.tsx`、新純函式＋測試；**不動** `_redirects`／`_headers`／不加 `404.html`／不用 Pages Functions | 無 |
| R4 | 第 4 波審查（晉升後）；兼做 `launch-wave-3/` 退場（依 R3 §6）與規格書補記 P2-18 | 審查 session；報告 `docs/plans/launch-wave-4/review.md` | Opus | — | — |

主 session 自己做：本檔 §7／§8；審每支 PR；合併後 dispatch 驗證（K2 合併後 dispatch deploy-smoke）；照片清理首輪核對；
第一筆正式站真付款後確認發票與 `system_alerts` 無誤報（R3 §5-2，沿用）。

## 3. 執行環境須知（寫進每個派工 prompt）

`docs/README.md`〈慣例〉的「雲端 session 的執行環境須知」全部適用。第 3 波新增（交接原文 §2）：

- **合併後 GitHub 會自動刪 head 分支**。主 session 的紀錄分支合併後也會消失，再推之前先從 develop 重建：`git checkout -B <分支> origin/develop`。
- **推送守衛（`pre-push-rebase.sh`）在指令執行前就會攔下**，先 rebase 再要求 `--force-with-lease`。「改檔＋commit＋push」寫在同一個 Bash 指令時，
  前面的改檔與 commit 也不會執行——**commit 和 push 分成兩次呼叫**。
- **一個分支只能由一方 rebase**（W4-7）。
- **執行 session 不一定收得到 CI 事件**：主 session 自己查 check runs。rebase 後 diff 與審過的版本逐位元組相同，可直接合併。
- **子 session 對正式站的唯讀 SQL 會被權限分類器擋**（Production Reads）：一律交主 session 代跑。
- **晉升時 journey-full 偶發紅**：照規則只重跑一次；重跑綠、且執行 session 對照程式路徑判定與本波改動無關，才合併，並在晉升 PR 留言記錄。
- **雲端 worker 常重啟**：重啟後先讀 notifications，再看 `git status` 與本檔 §8，不憑記憶判斷進度。
- **send_later／ScheduleWakeup 不能當唯一事件來源**：PR 事件會叫醒 session，自設提醒只當保險。

## 4. 晉升清單（主 session）

1. 必上四項合併後 develop 凍結；列出 `1f61e68` 之後合進 develop 的全部 PR、後端變動、migration 檔名。
2. 開晉升 PR、訂閱；journey-full（sandbox）綠 → merge commit 合 main → 請業主核准 `production` → `/health` sha、deploy-smoke build-sha 對上。
3. 開 R4。

## 5. 第 5 波候選（未納入本波，一行一項）

R3 P2-16（會員表 768–1024px 隱藏推薦碼欄）、P2-17（登出中無文字、CTA 暫停無原因）；#395 方向 3 sandbox 實打（需業主憑證）；
R3 P2-8（錨點在 listings 回 0 列時的 SOP）、P2-9（孤兒判準索引）、P2-11（雙分頁晚存檔破圖）、P2-14（F1 admin 雙保險事實補記）、P2-19（第 3 波靜默擱置項）、P2-20（S1 BottomNav 時點斷言）；
第 3 波 §5 其餘：PR #379 launch-readiness ①–④ 分拆；備份／PITR 評估；伺服器端密碼規則；`handle_new_user` 不讀 metadata＋`national_id` 唯一；
後台稽核軌跡 A1b-2/3；SEO 進階；框架修訂（friction-log）；`lazyWithRetry` 簡化＋表單草稿保存；#421 記債；#430 輪播 P2；成功頁發卡行評估；邀請體驗整體重調；
A1a、A2、L1-1、S7b；寬限期失效破圖通知（W2-12）；首頁 `searchQuery` 計入 `totalFilters`；`setup-node` 逾時；notify／return 的 `payuniConfig()` 擲錯告警；
子網域盤點＋完整 CSP；vitest／vite 大版本（#467 拆出）；登出清所有模組快取的機械把關；#383、#384。

## 6. 業主待辦

| # | 事 | 狀態 |
|---|---|---|
| 1 | 審 T1-B 規劃與 `/review-plan` 報告，通過後在 T1-B session 親打 `/tdd-implement auth-transient-resilience` | 等規劃 |
| 2 | 晉升合進 main 後核准 `production` 部署 | 等晉升 |
| 3 | 持續關注：照片清理失敗 issue「[production] 刊登照片孤兒清理失敗」；第一筆正式站真付款 | 持續 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| F1 | `session_01MQovbDKkNQ6mDxkBr1nf2f` | Sonnet | `fix/signout-cleanup` | #486 ✅ 2b99700 | 收工 |
| E | `session_01MQovbE4KCLkaeC3Mfpg7Xc` | Sonnet | `fix/e2e-flake-diagnostics` | #484 ✅ 266ad42 | 收工 |
| K2 | `session_01MQovbF911rZdJNxbFpzmb8` | Sonnet | `fix/ci-alert-p2` | #485 ✅ 1525913 | 收工；待 develop deploy-smoke dispatch |
| T1-B | `session_01MQovbCGZbmeXeqr5PNd75K` | Opus | `feature/auth-transient-resilience` | — | 實作中（B0 起；業主已親打 `/tdd-implement`） |
| D | （11/02 Dependabot 批次後開） | Sonnet | `fix/npm-audit-467` | — | 未開 |
| P | `session_01MQovbEsQtrDFGbM41Hz9nC` | Sonnet | `fix/pages-root-redirect` | — | 施工中 |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 11/01 20:13 | 主 session 開局：讀交接、第 3 波 plan／review、〈慣例〉。develop＝`27b09a0`＝origin；無開著的 PR。照片清理首輪實刪排程（台北 11/02 03:17）**尚未執行**，最近一次是 11/01 09:53 UTC 的 develop dry-run 41295068483（綠）。業主裁決 W4-1～4，主 session 定 W4-5～9；本檔擴寫、落 `dispatch-prompts.md` | 開 F1、E、K2、T1-B 規劃；設提醒於 11/02 03:30 核對首輪 run |
| 11/01 20:22 | 開 #483（本檔，draft，已訂閱）。開 F1、E、K2（Sonnet）與 T1-B（Opus），tag `uknow-wave-4`；prompt 只放指標，正本是本分支的 `dispatch-prompts.md`。設 send_later 於 11/02 03:35 核對照片清理首輪 run | 等各 session 回報；11/02 核對首輪 run、開 D |
| 11/01 20:38 | E 交 #484：只動 journey harness（`#name` 逾時 `dump_page`；f70 改等 `round-progress` 並以 `to_have_text` 斷言），journey dispatch run 41306410552 綠。主 session 審，無 P0／P1 → **#484 合進 develop（266ad42）**。同類掃描列出的 `expect_or_dump` 統一包裝、`open_task_center` 只等標題 → 第 5 波候選 | — |
| 11/01 20:52 | K2 交 #485：P2-10／12／13／22，無偏離。主 session 審：deploy-smoke fallback 在其他 step 失敗、兩個 outcome 為 skipped 時成立；notify 缺 secret 改 `::error::`＋summary 標紅、不 fail。K2 自行 rebase 成 `bfa79d1`，diff 與審過的 `72f7ffd` 逐位元組相同 → **#485 合進 develop（1525913）**。未驗：fallback 與缺 secret 分支待真實觸發（dispatch 不跑告警 step） | develop 部署後 dispatch deploy-smoke |
| 11/01 21:00 | F1 回報紅燈 `b4e44f1`，卡在舊測試與 W3-15 矛盾、守衛禁改測試的死結。T1-B 回報規劃 `040cfac`、`/review-plan` P0 0、P1 約 15、需裁決 Q1–Q7。業主裁決 **W4-10～17**（全照建議）；已轉達兩個 session，F1 等業主親打授權 | F1 解鎖後施工；T1-B 修訂重審 |
| 11/01 21:46 | K2 合併後 develop：CI push 41308547578 綠 → deploy-supabase 41309330236 綠 → deploy-smoke 41309365066（deployment_status 觸發，跑的已是 K2 版 workflow）綠，不另 dispatch | — |
| 11/01 22:00 | T1-B 回報 v2：`/review-plan` 第二輪 P0 0、P1 9，已自行落地成 v2.1（`1985a0b`，已 rebase 到含 #485 的 develop）。業主裁決 **W4-18、W4-19**。主 session 審 v2.1：9 條 P1 都有落點、無偏離 W4-11～17 → **通過**；兩條 P2 交實作（retry() 要 dispatch `retry` 並在各出口清 `isRetrying`；B1 前主 session 代跑 Logs Explorer） | 業主在 T1-B session 親打 `/tdd-implement auth-transient-resilience`；實作等 F1 合併 |
| 11/01 23:10 | 業主已在 T1-B session 親打 `/tdd-implement`，review.md 處置填「通過」（`2ad511f`）。主 session 代跑 B1 前置 Logs 查詢（query_logs，24 小時）：正式站 `/profile` 0 筆（Edge 全部 41 筆：200×26、401×15），postgres ERROR／FATAL 0；develop `/profile` GET 200×2（execution p95 3,488 ms）、ERROR／FATAL 0 → 無 5xx／404、逾時 8 秒不需調整；樣本小，上線後再量 | T1-B 等 F1 合併；F1 等業主親打解鎖授權 |
| 11/01 23:20 | 業主 23:06 在 F1 session 親打授權（W4-10 生效）。F1 開 #486（紅燈 `6bc120c`，rebase 前為 `b4e44f1`）：紅燈後只改了 `button.test.tsx` 那一條（反向斷言），`tdd-unlock.sh` 與該紅燈測試互鎖，依授權直接移除鎖檔。主 session 審：無 P0／P1——基底契約寫進 `button.tsx`、Navbar 兩鈕自補；`onAccountSwitched`（可選 dep，`begin()` 換 uid 分支）；新 `clearAccountLocalState`（`withdrawalBankData`、`pendingUser`、舊鍵、完善資料草稿）；Q7 `isCancelling`＋401 收尾；401／AuthPage 走 `signOutWithFallback`。P2：`multi-step-flow-recovery.md` 完善資料與提領兩列補「登出／換帳號時清除」→ 交 F1 本 PR 補 | F1 補文件、CI 綠 → 合 → 通知 T1-B |
| 11/01 23:35 | F1 補 `multi-step-flow-recovery.md` 兩列（`dd9fb45`），CI 全綠、主 session 審過 → **#486 合進 develop（2b99700）**。已通知 T1-B 開工 B0（F1 帶進的 `onAccountSwitched`、`clearAccountLocalState`、Button 基底契約）。必上四項剩 D | 11/02 核對照片清理首輪 run、Dependabot 批次後開 D；T1-B 施工 |
| 11/02 00:25 | T1-B 回報 B0–B3 綠（B1 紅 `537a368`→綠 `d754e36`；B2 `8f54277`→`be18910`；B3 `dd87963`→`2a69c8c`），B4 實作完成、hooks 181 測試 180 綠；卡逃生口 2：舊測試釘死 `fetchProfile` 參數，與 plan §2.2 逾時衝突。業主裁決 **W4-20**（只改參數期望）；已請 T1-B 同類掃描，若還有同形期望一次列齊 | 業主到 T1-B session 親打授權；B4 綠後續 B5 |
| 11/02 00:50 | 業主回報 `uknow.pages.dev` 顯示正式站資料、登入「檢查 Email 時發生錯誤：Failed to fetch」。主 session 讀碼判定：根網址＝main 建置→正式站 Supabase；刊登走 PostgREST 不受 CORS 限制，`/auth/check-email` 走 Edge Function，正式站 CORS 只放行 `uknow.com.tw`（刻意設計）→ 非本波回歸、無資料錯誤。業主裁決 **W4-21**：本波加小工項 P | 開 P（Sonnet） |
