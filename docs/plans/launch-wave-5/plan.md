# 第 5 波：對帳排程上 pg_cron＋金流並行防線＋暫時性錯誤（11/22 收件）

<!-- plans-keep: 跨 session 鷹架（第 5 波主／執行／審查 session 的共同事實來源）；退場條件＝第 5 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**本波任何新開的 session**：開局只有 repo 和這份檔，沒有對話記憶。三種 session 的分工與凍結規則見 `docs/README.md`〈慣例〉；
派工 prompt 在同目錄的 `dispatch-prompts.md`。主 session 是 `session_01MQovbBpvF5cMi5BqUrAH86`，分支 `claude/quirky-pasteur-hjb0pv`。
行號一律現算。第 4 波主 session 寫的交接原文：`git show 3a7f506:docs/plans/launch-wave-5/plan.md`。

## 0. 上游與裁決

**上游**

- `docs/plans/launch-wave-4/plan.md`：§0 裁決 W4-1～37（仍有效）、§5 候選。
- `docs/plans/launch-wave-4/review.md`：第 4 波審查（R4，P0 0／P1 0／P2 17）；§5 待辦、§6 升級表是 `launch-wave-4/` 退場的依據（由本波審查 session R5 執行）。
- `docs/plans/launch-wave-4/audit-{pay,ref,auth,ops}.md`：W4-30 稽核，行號以 main `f88bae5` 為準。**本波工項直接引用這四份的編號**；
  R5 刪 `launch-wave-4/` 前要確認沒有待辦只存在稽核報告裡（見 §5）。

**開局現況**（11/04 21:30 台北）

- main＝`26c5ae8`，develop＝`3a7f506`；develop 領先 main 的只有 docs（#503、#505）。
- #502 的正式站 Edge 部署（run 41706804315）業主已於 11/04 21:14 核准。煙霧測試結果：`/health` sha＝`26c5ae8`（第 1 次探測就對上），
  PayUni production 憑證齊全，預設推薦人 ok。
  （Actions 列表上這個 run 的 head_branch 顯示 develop，但 job 環境的 `DEPLOY_BRANCH=main`、`DEPLOY_SHA=26c5ae8`，以 job 為準）
- 主 session dispatch 的 deploy-smoke（ref=main，run 41844045128）綠。
- 沒有開著的 PR；open issue：#467、#395、#384、#383。

**目標**：S1、S2、S3、S5 四項全部合進 develop 就晉升。S6 本波至少把規劃做完並經過審查，實作有完成才上；S4 有完成才上。
收件截止 11/22（日）22:00。

**裁決（AskUserQuestion，業主 2026-11-04 21:30 台北）**

| # | 題 | 裁決 |
|---|---|---|
| W5-1 | 本波範圍 | **S1、S2、S3、S5 必上**。S6 本波完成規劃與審查，實作有完成才上，沒完成由第 6 波接手；S4 有完成才上（被推翻：S1–S6 全必上；只做 S1＋S2＋S3） |
| W5-2 | 派工順序 | **第一批四項並行**：S2 規劃（Opus）、S1 規劃（Opus）、S3（Sonnet）、S5（Sonnet）。S6 規劃等 S2 合併後再開（同碰 prepare／register）；S4 等 S1、S2 進實作後再開（被推翻：全部同時開；一項一項來） |
| W5-3 | 晉升時點 | **必上項全部合併就晉升，11/22 22:00 收件**，沒合的順延第 6 波（被推翻：分兩次晉升；固定 11/29） |
| W5-4 | 稽核其餘 P1 加收 | **ref P1-2（重複發獎：補鎖＋partial unique index，併 ref P2-1）→ 併 S2**；**auth P1-4（cancel-signup 無鎖）→ 併 S2**；**ops P1-3＋pay P1-3（對帳告警）→ 併 S1**（未選：ops P1-2 upload-photo 限流，留候選） |
| W5-5 | W4-34① 停權者能否續費（pay P2-9＝auth P2-1） | **不允許，前後端都擋**：結帳頁顯示「帳號已停權，請聯絡客服」，prepare 回 403；規格書 §5.2 把「付款」列為凍結項（被推翻：允許付款、維持現行） |
| W5-6 | W4-34② 網絡搜尋比對真名（ref P1-4） | **二、三代只比對遮罩後看得到的字元，並加限流**：一代照舊比對真名；`name_*` 排序二、三代改用遮罩名；每人加限流；`network-endpoints.test.ts` 刻意釘住的舊行為改成反向斷言（被推翻：只接受完整全名；維持比對真名） |
| W5-7 | W4-34③ 新約二次確認（pay P2-10） | **改程式，無條件確認**：fresh 一律跳二次確認，確認框依資產列出後果，沒有資產時至少說明推薦人會變（被推翻：改規格成有資產才確認） |
| W5-8 | W4-34④ 新約清空對推薦王 credit 與當月下線（ref P2-2／P2-3） | **保留已發的、門檻重算、名單不刪**：已發出的 credit（含未領）保留；fresh 後當月從 0 計門檻；當月桶只清計數，配對名單另存，守住 §9.2「R 從未出現在 U 歷史」（被推翻：維持現行並寫進規格；全部清空） |

**主 session 裁決**（落點與分配，非業主題目）

| # | 題 | 裁決 |
|---|---|---|
| W5-9 | W5-5～8 的工項落點 | W5-5 → S2（同碰 prepare，S2 必上）；W5-6 → S5（後端小修，Sonnet）；W5-7、W5-8 → S6（同屬 fresh 路徑；W5-8 碰獎勵規則，Opus） |
| W5-10 | R4 §6 指定給本波的升級 | 「裁決編號只由主 session 發」、「hash 以 PR 內文為準」→ 主 session 在本檔所屬 PR 寫進 `docs/README.md`〈慣例〉；「F1 草稿在 session 失效時也清」→ 主 session 改 `docs/multi-step-flow-recovery.md`，`src/utils/formDraft.ts` 檔頭的同步交 S3（產品碼不由主 session 改） |

## 1. 時程

| 時點（台北） | 事 |
|---|---|
| 11/04 晚 | 本檔落檔；開 S2 規劃、S1 規劃（Opus）、S3、S5（Sonnet） |
| 業主時間 | 審 S1、S2 規劃與 `/review-plan` 報告 → 在各自 session 親打 `/tdd-implement <slug>` |
| S1、S2 進實作後 | 開 S4（Sonnet，三段式） |
| S2 合併後 | 開 S6 規劃（Opus） |
| **11/22（日）22:00** | 收件截止：沒合進 develop 的順延第 6 波 |
| 必上四項合併後 | 開晉升 PR（develop→main，標題 `chore(release): 晉升 develop → main——第 5 波`）→ journey-full 綠 → merge commit → 業主核准 `production` → `/health` sha 與 build-sha 對上 |
| 晉升後 24～48 小時 | 主 session 跑上線後現場查詢（W4-26），**特別看 pg_cron 的準時度**（S1 的唯一現場驗證） |
| 晉升後 | 開 R5 第 5 波審查 session（兼做 `launch-wave-4/` 退場） |

## 2. 工作分解

在途上限：**程式碼工項同時最多 3 個**（主 session 審查是瓶頸）；三段式工項在規劃期不佔名額，進實作才佔。

| ID | 工項 | 流程／分支 | 模型 | 主要動到 | 撞檔 |
|---|---|---|---|---|---|
| S1 | **對帳與照片清理改由 Supabase pg_cron 觸發**（W4-25），GitHub workflow 留作手動觸發與告警；併 ops P1-3（對帳 PayUni 查詢全滅時排程仍綠）、pay P1-3（未知 TradeStatus 建單第 4 天靜默標 expired） | 三段式，`feature/pg-cron-schedulers` | Opus | 新 migration（pg_cron／pg_net 排程、驗證機制）、`reconcile-payments.yml`、照片清理 workflow、`index.ts` 對帳與清理端點、`system_alerts`、`supabase/README.md`、規格書排程段 | `index.ts` 對帳段與 S2 不同區；migration 版本號 rebase 後必跑 `check-migration-versions.py` |
| S2 | **金流與推薦的並行防線**（W4-33 第一優先）：pay P1-2 同人兩分頁重複付款；auth P0-1／P1-2（＝ref P1-1）register 查推薦碼錯誤被吞（改走 `validate_referral_code`，error→503，查無／停權→400 同形）；ref P1-2＋P2-1 重複發獎（補鎖＋partial unique index）；auth P1-4 cancel-signup 無鎖；W5-5 停權者不得付款 | 三段式，`feature/payment-concurrency-guard` | Opus | `index.ts`（prepare、register、cancel-signup）、新 migration（鎖、唯一索引）、`PaymentCheckout.tsx`、`registrationFlow.ts`、規格書 §5.2／§6／§8.3 | 與 S6 同碰 prepare → S6 等 S2 合併；與 S3 同碰 `CompleteProfile.tsx`／cancel-signup → 一個分支只能由一方 rebase，後合的那支 rebase |
| S3 | **暫時性錯誤被當成定論**（R4 §5-2）：R4 P2-1（cancel-signup 401 一律當帳號已刪）、P2-4（CompleteProfile 冷載失去 8 秒逾時）、P2-5（閘道 404 判成帳號異常，改認 `code: 'PROFILE_MISSING'`）；T1-B 未修的 PaymentCheckout／CompleteProfile getSession retryable 仍導 `/login`；`formDraft.ts` 檔頭同步「session 失效也清」（W5-10） | `/fix-bug`，`fix/transient-not-final` | Sonnet | `CompleteProfile.tsx`、`fetchProfile.ts`、`PaymentCheckout.tsx`、`index.ts`（cancel-signup 改用分類式 `authenticate()`、`/profile` 零列 404 帶 code）、`api-contract.ts`、`formDraft.ts` | 見 S2：cancel-signup 後端，S3 只改認證分類（401／503），S2 改鎖 |
| S4 | **PostHog EU 監控＋錄影**（W4-35～37）：照 W4-37 的遮罩清單施工，敏感欄位 block 要有測試釘住；不改條款 | 三段式，`feature/posthog-monitoring` | Sonnet | `src/main.tsx` 或新 `src/utils/analytics.ts`、CSP（`public/_headers`）、敏感表單元件加 block 屬性、`package.json` | S1、S2 進實作後才開 |
| S5 | **後端小修組**：ops P1-1＝ref P1-9 提領 CSV 銀行代號與帳號前導 0、15 位以上截斷（第一筆提領前必修）；W5-6 網絡搜尋二、三代只比對可見字元＋限流（ref P1-4） | `/fix-bug`，`fix/csv-and-network-search` | Sonnet | `src/utils/csv.ts`、`WithdrawalManagement.tsx`、`index.ts`（`/referrals/network/search`）、`network-endpoints.test.ts`、規格書 §7.2／§7.3 | 無 |
| S6 | **續約路徑潛伏組**（期限 2027-10-27）：ref P0-1＝pay P0-1（fresh 棄單後改付 extend 仍換線／發獎）；ref P0-2（推薦成環）；pay P1-1＝auth P1-1（續費者走首購路徑，prepare 應拒已有訂閱者 `renewalMode=null`）；pay P1-4（續費者卡單被送回結帳頁）；W5-7 新約無條件二次確認；W5-8 新約清空語意 | 三段式，`feature/renewal-path-hardening`；**本波必交規劃＋審查**，實作有完成才上 | Opus | `index.ts`（prepare fresh／extend、`/profile` 卡單旗標）、migration（成環檢查、`reconcile_king_credits`、配對名單）、`PaymentCheckout.tsx`、規格書 §6.2／§9 | S2 合併後才開 |
| R5 | 第 5 波審查（晉升後）；兼做 `launch-wave-4/` 退場（依 R4 §6；四份 audit 一併） | 審查 session；報告 `docs/plans/launch-wave-5/review.md` | Opus | — | — |

主 session 自己做：本檔 §7、§8；審每支 PR；合併後 dispatch 驗證（S1 合併後在 develop 驗 pg_cron 首輪觸發，並 dispatch 兩支 workflow 的手動路徑）；
W5-10 的兩條文件升級（本 PR）；上線後現場查詢（W4-26）。

## 3. 執行環境須知（寫進每個派工 prompt）

`docs/README.md`〈慣例〉的「雲端 session 的執行環境須知」全部適用。第 3、4 波累積、仍有效的（原文見 `launch-wave-4/plan.md` §3 與交接 §2）：

- **合併後 GitHub 會自動刪 head 分支**。主 session 的紀錄分支合併後也會消失，再推前要 `git fetch --prune` 並從 develop 重建，否則 `--force-with-lease` 會報 stale info。
- **推送守衛在指令執行前就會攔下**並要求 rebase＋`--force-with-lease`：commit 和 push 分成兩次 Bash 呼叫。
- **一個分支只能由一方 rebase**（W4-7）。
- **執行 session 不一定收得到 CI 事件**：主 session 自己查 check runs。rebase 後 diff 與審過的版本逐位元組相同，可直接合併。
- **子 session 對正式站的唯讀 SQL 會被權限分類器擋**：一律交主 session 代跑。
- **合併一支 PR 讓 base 前進後，其他 PR 的 `ci-ok` 會變 expected、不能合**。同時交件的多支 docs PR，由主 session 的 PR 逐字帶入、一次跑 CI。
- **雲端容器連不到 `*.supabase.co` 與 `*.pages.dev`**（proxy 403）。正式站 `/health` 只能看 deploy-supabase 的煙霧測試步驟，或 dispatch deploy-smoke。
- **晉升 PR 開著時不合任何 PR 進 develop**（含主 session 自己的紀錄 PR）。
- **首輪 CI 偶發**：`PhotoPicker.test.tsx`〈取消與 Esc 都只取消當張〉。再出現就列 E 類補診斷，不要跳過。
- **雲端 worker 常重啟**：重啟後先讀 notifications，再看 `git status` 與本檔 §8，不憑記憶判斷進度。
- **裁決編號只由主 session 發**（W5-10）：執行 session 拿到的授權記成「業主 YYYY-MM-DD HH:MM 互動選項：原話」，不自編 W5-x。
- **紅綠燈 hash 以 PR 內文為準**（W5-10）：rebase 會改寫 hash，PR 內文的表是唯一正本；本檔 §8 只記 PR 號，不抄 hash。

## 4. 晉升清單（主 session）

1. 必上四項合併後 develop 凍結；列出 `3a7f506` 之後合進 develop 的全部 PR、後端變動、migration 檔名。
2. 開晉升 PR、訂閱；journey-full（sandbox）綠 → merge commit 合 main → 請業主核准 `production` → `/health` sha、deploy-smoke build-sha 對上。
3. S1 的 pg_cron 在正式站由 migration 建立：晉升後確認 `cron.job` 有預期的排程列，首輪 `cron.job_run_details` 成功；GitHub 那兩支 workflow 改手動後，排程不再重複觸發。
4. 開 R5。

## 5. 第 6 波候選（未納入本波，一行一項）

**稽核未收的 P1**（R5 刪 `launch-wave-4/` 前，這些要已在本節或規格書 §14）：
ref P1-3（推薦網絡超過 1000 列時 PostgREST 靜默截斷）；ref P1-5（`/rewards/history` error 被吞成 200）；ref P1-6（`upload-id-photos` update error 被吞）；
ref P1-7（`withdrawalBankData` 鍵不綁 uid）；ref P1-8＝pay P1-5（`pendingUser` 付款後不清、不綁 uid）；auth P1-3（後端不驗 18 歲／手機／身分證）；
auth P1-5（重設密碼後不登出）；ops P1-2（upload-photo 無限流、不要求會籍）。各報告其餘 P2 以報告為準，R5 退場時逐條決定進候選或 §14。

**R4 未收的 P2**：P2-2（`AuthRefreshDiscardedError` 被判非暫時性，多分頁休眠還原會全體登出）、P2-3（冷啟動 getSession 不 resolve 永遠 loading）、
P2-6（degraded 時頁首畫訪客版）、P2-7（degraded 按登出閃 `/login`）、P2-8（結帳頁重試中登出被蓋掉）、P2-9（N 個請求 N 次確認）、
P2-10（冷啟動換帳號不觸發 `onAccountSwitched`，提領會預填前一人的銀行帳號；併 auth P2-21／P2-22 的 DataCache 同類）、P2-11（三顆 aria-disabled 鈕不灰化）、
P2-13（hash 網址導向判準）、P2-14（App 靜態 import）、P2-15（smoke 告警標題不分環境）；T1-B 未修：`/auth/register` 讀回擲非 ProfileReadError 仍 500。

**第 4 波 §5 帶過來的**：Playwright 升到支援 Ubuntu 26.04 的版本（含 e2e 容器 image）、journey-suite 改回 `ubuntu-latest`（**W4-23 退場條件，不可遺失**）；
vitest／vite 大版本（#467 拆出）；`otpSession` 存 email、共用裝置可能預填前一人 email（H1 未處理）；
T1-B 審查未修：各頁 401 文案「登入已過期」；E 同類掃描（`expect_or_dump` 統一包裝、`open_task_center` 只等標題）；登出清所有模組快取的機械把關；
R3 P2-16、P2-17、P2-8、P2-9、P2-11、P2-14、P2-19、P2-20；#395 方向 3 sandbox 實打（需業主憑證）；PR #379 launch-readiness ①–④ 分拆；備份／PITR 評估；
伺服器端密碼規則；`handle_new_user` 不讀 metadata＋`national_id` 唯一；後台稽核軌跡 A1b-2/3；SEO 進階；框架修訂（friction-log）；`lazyWithRetry` 簡化＋表單草稿保存；
#421 記債；#430 輪播 P2；成功頁發卡行評估；邀請體驗整體重調；A1a、A2、L1-1、S7b；寬限期失效破圖通知（W2-12）；首頁 `searchQuery` 計入 `totalFilters`；
`setup-node` 逾時；notify／return 的 `payuniConfig()` 擲錯告警；子網域盤點＋完整 CSP；#383、#384。
**S6 實作**若 11/22 前沒合，列第 6 波第一優先（期限 2027-10-27）。

## 6. 業主待辦

| # | 事 | 狀態 |
|---|---|---|
| 1 | 審 S1、S2 規劃與 `/review-plan` 報告，通過後在各自 session 親打 `/tdd-implement pg-cron-schedulers`／`/tdd-implement payment-concurrency-guard` | 等規劃 |
| 2 | 實機確認（第 4 波交接 §3-2，未回報）：H1 曾開邀請連結的瀏覽器新註冊不帶推薦碼、帶 `?ref=` 仍帶入；`uknow.pages.dev` 根網址、深層路徑、query＋hash 都導向 `uknow.com.tw`，`develop.uknow.pages.dev` 不導；正式站實際登入一次 | 待回報 |
| 3 | PayUni 商店後台確認第一筆付款（11/03）發票已開立 | 待回報 |
| 4 | GitHub 設定（補強，非必須）：Fork PR workflows 設「Require approval for all external contributors」；Environments → develop 加 required reviewer | 待回報 |
| 5 | 晉升合進 main 後核准 `production` 部署 | 等晉升 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| S1 | — | Opus | `feature/pg-cron-schedulers` | — | 待開 |
| S2 | — | Opus | `feature/payment-concurrency-guard` | — | 待開 |
| S3 | — | Sonnet | `fix/transient-not-final` | — | 待開 |
| S5 | — | Sonnet | `fix/csv-and-network-search` | — | 待開 |
| S4 | — | Sonnet | `feature/posthog-monitoring` | — | S1、S2 進實作後開 |
| S6 | — | Opus | `feature/renewal-path-hardening` | — | S2 合併後開 |
| R5 | — | Opus | `docs/wave5-review` | — | 晉升後開 |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列；hash 以 PR 內文為準）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 11/04 21:30 | 主 session 開局：讀交接、第 4 波 plan／review、〈慣例〉。#502 的正式站部署 run 41706804315 已在 21:14 核准，煙霧測試 `/health` sha＝`26c5ae8`（第 1 次探測）、PayUni production、預設推薦人 ok；dispatch deploy-smoke（ref=main）run 41844045128 綠。#502 收尾完成。業主裁決 W5-1～8（全照建議）；主 session 定 W5-9、W5-10。本檔擴寫、落 `dispatch-prompts.md` | 開 S1、S2、S3、S5 |
