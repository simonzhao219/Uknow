# 第 2 波：上線後第一次每週晉升（2026-11-03）

<!-- plans-keep: 跨 session 鷹架（主／執行／審查三種 session 的共同事實來源）；退場條件＝第 2 波審查 session 結案、review.md 回填 §8 後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的主 session**看：它開局只有 repo 與這份檔，沒有對話記憶。上游是第 1 波
`docs/plans/launch-wave-1/plan.md`（§0 裁決 1–39、§6 待辦、§8 進度）；那個目錄在第 1 波審查結案後會刪，
屆時用 `git show <hash>:docs/plans/launch-wave-1/plan.md` 取回。行號一律現算。

## 0. 業主目標與裁決

**目標**（業主 2026-10-30 22:42 宣布進第 2 波；主 session `session_01MQovbCaoDN21bovw6C2Y5w` 核對）

1. 11/03（週二）10:00 第一次每週晉升；之後每週同一天（第 1 波裁決 8）。
2. 先清有期限的：journey-full 暫走 webhook 的規則 13 於 **2026-11-03 到期**（ci.yml `journey-full` 的 `payment_mode: webhook` 註記），到期 CI 自動紅；
   條款十之一照片清理（第 1 波裁決 20，規格書 §14 第 14 列）須在撤除後三十日窗口內補齊。
3. 業主點名的優先：刊登首頁從詳情頁返回時閃骨架、順序跳動；正式站前端部署失敗零訊號（10/29 事故）。

**裁決（AskUserQuestion，2026-10-30 23:00 台北）**

| # | 題 | 裁決 |
|---|---|---|
| W2-1 | 波範圍 | **11/03 晉升＋大項先規劃**：本波晉升只收必做三項＋小項；條款十之一本波只做規劃與審查，實作進第 3 波（11/10）。T1 不在本波 |
| W2-2 | 納入工項（必做三項以外） | 條款十之一（規劃）、PayUni 商店級錯誤告警、小型維運資安包、後台會員列表顯示推薦碼 |
| W2-3 | 第 1 波審查 session | **現在開，與第 2 波平行**（main 在凍結期內不再變）；P0 回主 session 開 hotfix；結案後主 session 讓 `launch-wave-1/` 退場 |
| W2-4 | 派工 | 主 session 用 `create_session` 自動開執行 session；業主只回答裁決題 |
| W2-5 | 條款十之一 C-Q1：會籍到期算不算「本服務終止」 | **先不算、請律師確認**：只清帳號刪除與主動撤除；收到終止或刪除請求者，30 日內刪帳號（寫進 SOP）；律師若判「算」，在 RPC 加一個條件 |
| W2-6 | C-Q2：撤 RLS `listings_delete_own` | **撤**（含 admin 分支），刪刊登只剩 Edge 一個入口 |
| W2-7 | C-Q5：孤兒寬限期（照片裁切完即上傳、送出才寫進刊登，中間的檔沒有引用） | **7 日、不加存檔前驗證**（被推翻的建議：48h＋存檔前驗證，範圍太大） |
| W2-8 | C-Q7：正式站上線閘門 | **預設 dry-run**，業主在第 3 波晉升後 3 日內核對候選清單，再設 repo variable 開實刪 |
| W2-9 | C-Q3／Q4／Q8（主 session 照建議定，低風險工程預設） | 密鑰沿用 `RECONCILE_SECRET`；`/auth/cancel-signup` 不加即時清理；develop 只做 workflow_dispatch。C-Q6 由事實回答：舊 bucket 已於 10/28 由業主刪除（第 1 波 §8） |
| W2-10 | 首頁搜尋／篩選條件返回後被清空（B 回報） | **另開小工項趕 11/03**：B 接做 `fix/home-filter-restore`（#455 合併後切），篩選 state 放進同一快取 |
| W2-11 | C-Q9：終止／刪除請求 SOP（**修正 W2-5 的 SOP 部分**） | **已付款：收件後 20 日內停權＋刪刊登列**，照片由排程清，金流與推薦紀錄依條款十二保留，回信留痕；未付款可直接刪帳號。理由：刪帳號會 cascade 抹掉金流紀錄；照片尚需 7 日寬限＋1 輪，20 日才能落在 30 日內 |
| W2-12 | C-Q10：寬限期失效破圖通知／Edit onError | 本案不做，列第 3 波後候選 |
| W2-13 | C-Q11：終止請求要不要停權（**修正 W2-11 的停權部分**） | **只刪刊登、不停權**：停權會鎖會員區、擋提領、廢推薦碼，使已賺獎勵領不到；停權留給違規處置 |
| W2-14 | 正式商店電子發票（#449 起建單帶 `TradeInvoice: 1`，已隨 #450 上正式站約 10/30 18:20；之後尚無真付款） | 業主確認**正式商店已開通**；主 session 建議找時間用未付款帳號走到刷卡頁實測（不付款） |
| W2-15 | 測試商店電子發票（H 實證 sandbox 拒單 `UPP02085 商店尚未啟用電子發票`，journey 與 develop 付款全擋） | **業主開通測試商店**，開好通知主 session；H 再驗 skeleton/sandbox，綠了在 #456 改回 sandbox。11/02 18:00 前未開通則延長規則 13 期限 |
| W2-16 | 測試商店電子發票 | **業主 10/31 09:20 回報已開通即時電子發票**；H 重跑 skeleton/sandbox |
| W2-17 | 第 1 波審查 #460 P1-2：#448／#449 凍結期上 main 無裁決紀錄 | 業主確認授權 → 補記為第 1 波 plan §0 裁決 40 |
| W2-18 | 第 1 波審查 #460 P1-1：電子發票上正式站後零付款、前提未實證 | 業主以未付款帳號走到 PayUni 刷卡頁（不付款）實證；被導回付款失敗即升 P0、立刻 hotfix 撤 TradeInvoice |
| W2-19 | W2-18 實測結果、首頁返回真機驗收、#453 規劃審閱 | 業主 10/31 10:00 回報：**正式站刷卡頁正常出現（電子發票前提成立，#460 P1-1 結案）**；**develop 首頁返回真機驗收通過**（#455／#457）；**#453 規劃審閱通過** → 主 session 開實作 session（Opus）待業主親打 `/tdd-implement`，11/03 晉升前不轉 ready |
| W2-20 | 晉升時點與範圍（業主 10/31 11:35：「既然已經準備好，就先動作」） | **10/31 立即晉升**（被推翻的原計畫：11/03 週二；屬業主授權的凍結期例外——內容為告警／維運／首頁體驗，無 migration、未動金額與狀態機）；**#453 條款十之一不隨本次上**，留第 3 波主 session 審後再上 |
| W2-21 | 頁首「先登入、再轉已登入」（業主 10/31 錄影） | 主 session 讀碼：(1) Navbar 只看 `!!user`、不看 `isLoadingUser`，冷啟動先畫訪客；(2) 註冊中途（有 session、profile 未齊）`user=null`，頁首全程顯示「登入／立即刊登」。**開 T1 正式做（Opus 三段式），第 3 波上** |
| W2-22 | 註冊中途頁首呈現 | **只顯示「登出」**（不顯示登入／立即刊登）；併入 T1 |

沿用第 1 波仍有效的：服務條款／參加契約／事業手冊／推廣獎勵規章律師定案不可改；使用者可見文案一律「推薦人」；admin 提領資料含未遮罩身分證與
銀行帳號，任何快取不得持久化；10/29–10/31 凍結只針對 main（只許 hotfix），develop 照常合併；晉升 PR 開著時 develop 不合任何 PR（strict required check）。

## 1. 時程

| 時點（台北） | 事 |
|---|---|
| 10/30 23:00 | 本檔落檔；開第 1 波審查 session 與第一批執行 session |
| 11/01 | 第一批 PR 審完合 develop；開第二批 |
| **11/02 22:00** | 本波收件截止：沒合進 develop 的順延第 3 波 |
| 11/03 10:00 | 主 session 開晉升 PR（develop→main）；journey-full（**此時應已改回 sandbox**）綠 → merge commit 合進 main → 業主核准 `production` 部署 → `/health` sha 對上 |
| 11/03 之後 | 開第 2 波審查 session；本波收尾 |

## 2. 工作分解

在途上限：**程式碼工項同時最多 3 個**（主 session 審查是瓶頸），規劃與審查 session 不計。

| ID | 工項 | 批 | 流程／分支 | 模型 | 主要動到 | 撞檔 |
|---|---|---|---|---|---|---|
| H | journey harness 配合 PayUni sandbox 新表單＋`journey-full` 改回 sandbox（11/03 期限） | 1 | `/fix-bug`，`fix/journey-payuni-sandbox-form` | Sonnet | `e2e/journey/builders/payuni_sandbox_page.py`、`.github/workflows/ci.yml`（`journey-full` 的 `payment_mode`） | 無 |
| B | 首頁／詳情頁返回時閃骨架、順序跳動 | 1 | `/fix-bug`，`fix/home-back-skeleton` | Sonnet | `src/components/HomePage.tsx`（清單只在元件 state、`getCurrentPosition` 後重排）、詳情頁 `/service-providers/:id`、新的清單快取 | 無 |
| D | 正式站前端部署失敗零訊號 | 1 | Plan Mode，`fix/prod-build-sha` | Sonnet | 建置時把 commit sha 埋進 `index.html`（`<meta name="build-sha">`）、`scripts/check-deployed-assets.py` 比對 main HEAD、`deploy-smoke.yml` | 與 S 同為 workflow，不同檔 |
| C | 條款十之一照片清理——**只做規劃** | 1 | `/plan-feature listing-photo-retention` → `/review-plan` → 停等業主審；分支 `feature/listing-photo-retention` | Opus | 規劃書 `docs/plans/listing-photo-retention/`；實作第 3 波由業主親打 `/tdd-implement` | 規劃期無 |
| P | PayUni 商店級錯誤進告警 | 2 | `/fix-bug`，`fix/payuni-merchant-alert` | Opus | `supabase/functions/api/index.ts`（建單與查詢層的非 SUCCESS 出口、`logSystemAlertOnce`） | 與 A 同檔 index.ts（不同區段） |
| S | 小型維運資安包 | 2 | Plan Mode，`fix/ops-security-hardening` | Sonnet | `public/_headers`（HSTS、X-Content-Type-Options、Referrer-Policy、frame-ancestors；CSP 另案）、Deno DB 測試斷言 `storage.buckets.public=false` 與 `storage.objects` 零 policy、`security.yml` 加 Deno 相依掃描 | 與 D 同為 workflow，不同檔 |
| A | 後台會員列表顯示推薦碼與是否加入推薦計畫 | 2 | Plan Mode，`fix/admin-member-referral-cols` | Sonnet | migration（`admin_list_members`／`admin_member_detail` 回傳推薦碼、`referral_program_joined`；**版本號登記 `20261101000001` 起**）、`api-contract.ts`、`MemberManagement.tsx`、會員詳情 | migration；index.ts 若要動與 P 不同區段 |
| R1 | 第 1 波審查 | — | 審查 session，唯讀；報告 `docs/plans/launch-wave-1/review.md`（docs PR 回 develop） | Opus | — | — |

主 session 自己做（≤10 行或非程式碼）：整批關閉同標題「Edge Function 部署失敗」舊 issue（#337–#400，`--use-api` 後已修）與 #288、#280、#279 先查證再關；
第 1 波 §6「第 1 波收尾」列（`launch-wave-1/` 退場，等 R1 結案）；本檔 §8。

**批 2 的開工條件**：批 1 任一程式碼工項合進 develop 就補一個（P → S → A 的順序；P 是金流相鄰，先開）。

## 3. 執行環境須知（第 1 波的教訓，寫進每個派工 prompt）

- `create_session` 一律帶 `source_url=https://github.com/simonzhao219/Uknow`、`source_revision=develop`（第 1 波首開的 e2e session 沒帶 repo 只能封存）。
- 容器沒有 deno；**`npm install -g deno` 可裝**（deno.land 被網路政策擋，npm registry 與 jsr.io 是通的；2026-10-30 主 session 實測 deno 2.9.6、`deno task check` 綠）。
  動 `supabase/functions/` 的 session 開局先裝，否則 pre-commit 會擋。supabase CLI 不必裝（`deno task test` 留給 CI 的 api-tests 軌）。
- 子 session **不要直接用 Supabase MCP**：MCP 政策會跳權限核准，業主不在子 session 畫面上就永久卡住（R1 卡 1 小時、P 卡 40 分）。資料查詢一律由主 session 代跑。
- `gh pr checks` 在雲端被擋：看 CI 用 GitHub MCP（`pull_request_read` 的 status／check runs、`actions_list`）。
- journey 絕不在本機跑；要驗 harness 用 GitHub MCP `actions_run_trigger` 對 `journey-scheduled.yml` 發 workflow_dispatch（ref＝自己的分支、`scope=skeleton`、`payment_mode=sandbox`）。
- 分類器只認業主親打的 tdd-lock 解鎖授權；主 session 轉述的不算（第 1 波 P1a 卡過兩次）。三段式工項的 `/tdd-implement` 由業主親打。

## 4. 11/03 晉升清單（主 session）

1. 11/02 22:00 後 develop 凍結；確認 H 已把 ci.yml `journey-full` 改回 `payment_mode: sandbox`（H 沒成功就用互動問題問業主：延長規則 13 的「暫時至」日期 vs 晉升延後）。
2. 開晉升 PR：標題 `chore(release): 晉升 develop → main——第 2 波`；內文列 52039ca 之後的全部 PR、是否有後端變動、migration 檔名。訂閱它。
3. journey-full 綠 → merge commit 合進 main → 請業主核准 `production` 部署（找建立時間緊跟 main CI push run 的那筆）→ `/health` sha 對上。
4. D 上線後，第一次 deploy-smoke 要能看到正式站 build-sha＝main HEAD；確認後開小 PR 把 `check-deployed-assets.py` 的「線上無 build-sha／unknown」由 warn 收緊為 fail（#454 導入期刻意寬鬆，不收緊就是永久寬鬆）。

## 5. 第 3 波候選（第 1 波 §6 未納入本波的，一行一項；細節取第 1 波 plan.md §6）

條款十之一實作（C 規劃審過後）；T1 登入狀態信任；PR #379 launch-readiness ①–④ 分拆；備份／PITR 評估（第 1 波裁決 21）；伺服器端密碼規則；
`handle_new_user` 不讀 metadata＋`national_id` 唯一（A1b-1b）；後台稽核軌跡 A1b-2/3；SEO 進階（AEO／GEO）；框架修訂（第 1 波 friction-log 2026-10-26～27）；
`lazyWithRetry` 簡化＋表單草稿保存；PR 2 審查記債（#421）；詳情頁輪播 P2（#430）；成功頁發卡行評估；邀請體驗整體重調；A1a、A2、L1-1、S7b。

## 6. 業主待辦

| # | 事 | 狀態 |
|---|---|---|
| 1 | 第 1 波醒來後待辦 #9（setup script 預裝 deno）改為**選做**：執行 session 會自己 `npm install -g deno`。要做的話 setup script 加 `npm install -g deno` 一行（不要用 deno.land 的 install.sh，被網路政策擋） | 選做 |
| 2 | 手動刪 GitHub 分支 `claude/diag-prod-bundle`（第 1 波遺留） | ⬜ |
| 3 | C 的規劃審查報告出來後審閱，通過才在第 3 波親打 `/tdd-implement listing-photo-retention` | 等 C |
| 4 | 11/03 晉升合進 main 後核准 `production` 部署 | 等 11/03 |
| 5 | 條款十之一上線（第 3 波 #453 合併、11/10 晉升後；規格書 §11）：(a) 晉升後主 session 先對 develop dispatch dry-run 驗權限——401 表示 develop 的 `RECONCILE_SECRET` 須與正式站同值，業主到 Supabase Secrets 設；(b) **11/13 前**業主在本機 curl 核對正式站候選清單，再設 repo variable `PHOTO_PURGE_LIVE=true` 開實刪；(c) 被比例閘擋下時用 `force_ratio` dispatch，orphanTotal 超過 500 分多輪 | 第 3 波 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| R1 | `session_01MQovbDaQBDh27Eb8zoKDev` | Opus | `docs/wave1-review` | #460 ✅ 82b0f02 | 收工 |
| H | `session_01MQovbDk9KPWWoD8sZFrAvw` | Sonnet | `fix/journey-payuni-sandbox-form` | #456 ✅ dcb676d | 收工（full sandbox 綠） |
| B | `session_01MQovbBg7R2p1PUxhKZb3DK` | Sonnet | `fix/home-back-skeleton` → `fix/home-filter-restore` | #455 ✅ ee6613b、#457 ✅ 707d0b0 | 收工（待業主真機驗返回） |
| D | `session_01MQovbBDFtCbNxf1AjTosRA` | Sonnet | `fix/prod-build-sha` | #454 ✅ f110586 | 待命（晉升後收緊 build-sha） |
| N | `session_01MQovbAdbpZorMkp8trfxwx` | Sonnet | `fix/notify-exit-code` | #462 ✅ 8d81c7a | 收工 |
| C | `session_01MQovbCdFo86t9DX6d66Afq`（規劃）→ `session_01MQovbCF5454fAYfqy9NXaJ`（實作） | Opus | `feature/listing-photo-retention` | #453（draft） | 實作完成，待第 3 波審與合併 |
| P | `session_01MQovbCNPqBHZoyuZsvmxiJ` | Opus | `fix/payuni-merchant-alert` | #461 ✅ 3b5b7c9 | 收工 |
| S | `session_01MQovbBGBW1DseerZ2P4p64` | Sonnet | `fix/ops-security-hardening` | #459 ✅ 9ac1231 | 收工 |
| A | — | Sonnet | `fix/admin-member-referral-cols` | — | 批 2 |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 10/30 23:00 | 主 session 開局：讀第 1 波交接（無開著的 PR；量測 #4 全項正常）；業主裁決 W2-1～4；實測 `npm install -g deno` 可在容器裝 deno；落檔本檔與 `dispatch-prompts.md` | 開 R1、H、B、D、C 五個 session |
| 10/30 23:50 | 五個 session 已用 create_session 開（帶 source_url、tag `uknow-wave-2`；名冊見 §7）。本機 `npm ci` 才讓 pre-commit 綠（node_modules 過期缺 react-easy-crop）→ 共用開頭補「開局先 npm ci」 | 等 PR／回報；查證後整批關舊 issue |
| 10/30 23:55 | 開本檔 PR #452（draft，已訂閱）。查證後關 issue：13 張「Edge Function 部署失敗」（#337–#400；develop deploy 自 `--use-api` 起連 8 次綠）、#280（reconcile 排程連續綠）、#279（Security Audit 連 5 週綠）。#288（journey 排程紅）留給 H 的 PR 關 | 等各 session PR |
| 10/31 00:20 | C 回報 #453：四視角 P0 0、P1 12、P2 12，8 題裁決。主 session 讀過規劃（每日 janitor＋斷路器＋dry-run，方向合理）；業主裁決 W2-5～8，主 session 定 W2-9。C 提醒 S 的 public=false 斷言要排除 `listings-photos`——S 的 prompt 已寫明 | C 修訂規劃 → 主 session 複核 → 業主審 → 第 3 波親打 `/tdd-implement` |
| 10/31 00:30 | D 開 #454（build-sha meta、smoke 版本比對＋寬限 30 分、失敗推 LINE）。主 session 直讀全 diff 審：無 P0／P1；P2 兩項（無 meta 只 warn 須於晉升後收緊→記 §4；寬限以 commit 時間計，merge commit 下成立）。預覽站本容器連不到（proxy 403），線上 meta 待合併後 workflow_dispatch 實跑驗 | ci-ok 綠 → 轉 ready → 合 develop → 手動觸發 deploy-smoke |
| 10/31 00:40 | **#454 合進 develop（f110586）**；手動觸發 deploy-smoke（develop，兩站）驗線上 build-sha。批 2 第一個 **P 開工** `session_01MQovbCNPqBHZoyuZsvmxiJ`（Opus）。B 開 #455（紅 28e835d→綠 5c635fc；模組層快取＋靜默重驗＋捲動還原，詳情頁共用快取）：主 session 審無 P0／P1，請 B 修檔頭裁決歸屬一行；業主裁決 W2-10 | #455 修完合；B 接 W2-10；看 deploy-smoke 結果 |
| 10/31 00:50 | C 推 v2.1（#453 cd6d996b）：第二輪 P0 0、P1 6（工程三條已改：log 不印 uid、第二支批次複查 RPC、階段 5 改離線）＋Q9／Q10 → 業主裁決 W2-11、W2-12。主 session 要求回填後跑第三輪 /review-plan（設計有變、刪除不可逆）。#455 ci-ok 紅是 B 推新 head 時 concurrency 取消舊 run，非實際失敗 | C 第三輪 → 交業主審；#455 新 head CI |
| 10/31 01:00 | deploy-smoke 手動 run 41088363862：**develop「✓ 線上版本 f110586 與預期 f110586 相符」**、正式站「⚠ 無 build-sha」（預期，11/03 晉升後才有）——D 端到端驗證通過。#455 檔頭修正 fb48a48 → CI 綠 → **合進 develop（ee6613b）**；B 開工 W2-10。在途程式工項＝H、P、B（篩選）已達 3，S、A 等其一合併再開 | 業主真機驗返回；等 H／P／B 回報 |
| 10/31 01:10 | C 第三輪（#453 9c1317b5，審 v2.2）：P0 0、P1 7、P2 11；v2.3 自修 6 條（含真 bug：比例閘用截斷後候選數，bucket >1000 物件永不觸發 → 改用 RPC 回傳的 orphan_total）＋Q11 → 業主裁決 W2-13。不跑第四輪，主 session 親自核對 v2.3 六條自修 | C 回填 → 主 session 核對 → 交業主審 |
| 10/31 01:40 | **H 查出 journey sandbox 紅的現行根因不是表單，是 PayUni 測試商店拒單 `UPP02085`**（#449 的 TradeInvoice=1，PR 前提「兩商店皆已開通」對 sandbox 不成立）；H 開 #456（harness 拒單時解密 return 印出 Status／Message，診斷用）。主 session 查證 #449 已隨 #450 上 main、正式站部署後零付款（最後成功 10/30 09:48 UTC）→ 業主確認正式商店已開通（W2-14）、會開通測試商店（W2-15）。UPP02085 轉給 P 納入商店級告警（且走 /payuni/return 路徑）。B 開 #457（W2-10，紅 c67f4e25→綠 95aee4d3）：主 session 審無 P0／P1。教訓：webhook 模式的晉升閘門不碰 PayUni 建單，#449 這類商店設定前提在晉升時完全不會被驗到——記 friction-log 候選 | 等業主開通測試商店 → H 驗；#457 CI 綠合 |
| 10/31 08:55 | 主 session worker 兩度重啟。安全網自查發現 **R1（自 10/30 15:52）與 P（自 16:13）卡在 Supabase MCP execute_sql 權限核准**→主 session 代跑唯讀查詢（訂單 16 筆、measure.sql 等價：users 13 全 step 3、completed 13／failed 3、卡單 0、告警 0、刊登 10）並以 priority now 送達、請其改由主 session 代查；共用開頭與 §3 補此規則。**#457 合進 develop（707d0b0）**，B 收工。C 交 v2.4（#453 f5d47ddc，未處置 P0／P1 皆 0），主 session 已核對 v2.3 自修 → 交業主審。批 2 開 S | 業主審 #453；等 P、S、R1、H |
| 10/31 09:20 | 業主開通測試商店即時電子發票（W2-16）→ 通知 H rebase 後重發 dispatch。S 開工 `session_01MQovbBGBW1DseerZ2P4p64`（Sonnet）；在途程式工項＝P、S（H 只等驗證） | H 驗證結果；P／S PR |
| 10/31 09:30 | **R1 交第 1 波審查 #460**：P0 0、P1 4、P2 13、現場無異常。P1-1 電子發票前提→W2-18；P1-2 凍結例外→W2-17／第 1 波裁決 40；P1-3 對帳告警 warning 級推不到 LINE（index.ts 約 :2595／:2625，推播只撈 error :2789）→併入 P；P1-4 notify 非 200 仍 exit 0、該輪告警永久遺失→派 D 開 `fix/notify-exit-code`。另記：reconcile 排程實際 4–7 小時一跑；規則 13 到期後所有 PR 的 framework-check 都會紅（H 未綠前須先延期）；#458 為 runner DNS 暫時失敗，下次 run 綠可關 | 業主刷卡頁實測；#460 CI 綠合；P／D／S／H |
| 10/31 09:40 | **#460 合進 develop（82b0f02）**。D 以「一工項一個 session」為由不接 P1-4（正確）→ 新開 **N** `session_01MQovbAdbpZorMkp8trfxwx`（Sonnet，`fix/notify-exit-code`）。S 開 **#459**：主 session 審，無 P0，必修一條——HSTS 拿掉 `includeSubDomains`（子網域未盤點，一年快取收不回）。P 開 **#461**（紅 2486b6c、a95ae73 → 綠 f29c638、0559ea8；含 #460 P1-3）：主 session 審，無 P0／P1 | #459 修完合；#461 CI 綠合；N、H |
| 10/31 09:45 | N 開 **#462**：notify 非 200 改 exit 1；reconcile 的 system_alerts 推送去掉 continue-on-error 並移最後一步（失敗→run 紅→窗口不前移→重送）；deploy-smoke／deploy-supabase／對帳失敗通知三處保留 continue-on-error。主 session 審：無 P0／P1。記第 3 波候選：缺 Secrets 仍 exit 0 致窗口前移 | #462 CI 綠合 |
| 10/31 10:00 | 01:42–01:52 UTC 一批 CI 的 unit-tests／static-checks 卡「安裝 Node 24」10 分鐘被取消（runner 端），#459、#462 各重跑失敗 job 一次。#461 與 develop 衝突（friction-log 檔尾）→ 主 session rebase 解衝突（紅燈 hash 改為 e5d876bd、99162571）→ CI 綠 → **#461 合進 develop（3b5b7c9）**。**H 完成 #456**：根因兩層——(1) 測試商店未開電子發票 UPP02085（W2-16 已開通）；(2) 開通後刷卡頁多了必填「買方名稱」，harness 固定填值；skeleton/sandbox dispatch run 41155657844 綠；ci.yml journey-full 改回 sandbox、刪「暫時至」、Closes #288。主 session 審無 P0／P1，rebase 到新 develop（6a1a31ff）。合併後主 session 對 develop 發 full/sandbox dispatch，晉升前先驗全套 | #456 CI 綠合 → full dispatch；#459／#462 重跑結果 |
| 10/31 10:00 | 業主 W2-19：刷卡頁實測通過、首頁返回真機通過、#453 審過。開 **C 實作 session** `session_01MQovbCF5454fAYfqy9NXaJ`（Opus，分支 feature/listing-photo-retention，先備環境、等業主親打 `/tdd-implement listing-photo-retention`；屬第 3 波，11/03 晉升前不轉 ready） | 業主在該 session 打指令 |
| 10/31 11:20 | **#456 合進 develop（dcb676d）**→ 主 session 對 develop 發 full/sandbox：run 41158578126 **綠**（25 分鐘，30 人、並行 8 人買方名稱共用無礙）。**#459（9ac1231）、#462（8d81c7a）依序 rebase 後合進 develop**——第 2 波程式工項全部合併。業主轉來 LINE P1「正式站付款對帳排程失敗」（run 41141064038）：查為 runner DNS 暫時失敗（curl exit 6，未送到正式站），下一輪 41157903717 已綠 → 留言並關 #458；第二次發生，對帳 curl 加重試列第 3 波候選。C 實作 session 已在跑（#453 TDD 紅燈期 CI 紅屬預期） | 11/02 22:00 收件；11/03 晉升 |
| 10/31 11:30 | **C 實作完成**（#453 head fc8aab4b，draft）：六階段 TDD 全綠、/review-implementation P0 0／P1 4 全修／P2 15（僅 progress 過時一條未修，鷹架已刪）、決策升級進規格書 §11／workflow 檔頭／checklist。程序偏離：審查修正紅燈 commit 漏改一條斷言，C 自行 tdd-unlock 補 1 行（已記 friction-log；主 session 接受，要求下次先報）。照指示 11/03 前不轉 ready；第 3 波主 session 合併前須再審（實刪資料） | 第 3 波接手 |
| 10/31 11:40 | 業主 W2-20：立即晉升、#453 不上。主 session 合 #452（本檔）進 develop → 開晉升 PR（develop→main，含 #451 #454 #455 #456 #457 #459 #460 #461 #462；無 migration；後端僅 #461 告警）；journey-full 已改 sandbox | journey-full 綠 → 合 main → 業主核准 production |
| 10/31 13:30 | **晉升 #463 合進 main（5b6a790）**：journey-full sandbox 24 分鐘綠。業主 13:30 核准 production，deploy-supabase run 41169598265 成功。deploy-smoke run 41172352231：**正式站「✓ 線上版本 5b6a790 與預期相符」、安全標頭齊全**、PayUni 閘門 200。派 D 開 `fix/build-sha-strict`（無 meta 由 warn 改 fail）。業主錄影問頁首閃動 → W2-21／22，開 T1 規劃 session（Opus，`feature/auth-state-trust`，第 3 波） | 第 2 波收尾：開第 2 波審查 session |
