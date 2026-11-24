# 第 7 波：結帳頁迴圈＋PayUni 查詢正控與改判＋金流收尾

<!-- plans-keep: 跨 session 鷹架（第 7 波主／執行／審查 session 的共同事實來源）；退場條件＝第 7 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**本波任何新開的 session**：開局只有 repo 和這份檔，沒有對話記憶。三種 session 的分工與凍結規則見 `docs/README.md`〈慣例〉；
派工 prompt 在同目錄的 `dispatch-prompts.md`。主 session 是 `session_01MQovbAnpCoXEVXZWSckKyc`，分支 `claude/uknow-wave-7-lead`。
行號一律現算。第 6 波主 session 寫的交接原文：`git show 3e76edd:docs/plans/launch-wave-7/plan.md`。

## 0. 上游與裁決

**上游**

- `docs/plans/launch-wave-6/plan.md`：§0 裁決 W6-1～38（仍有效）、§4 晉升清單（4a 人工核對保留＝W6-38）、§5 第 7 波候選（含〈承接第 5 波〉）、§8 進度。
- `docs/plans/launch-wave-6/review.md`（R6，P0 0／P1 1／P2 12）：§1.2 P1-1、§1.3 P2 表、§3 `QUERY03001` 判讀與工項、§5 待辦、§6.2 升級表（`launch-wave-6/` 退場依據，由本波 R7 執行）。
- `docs/plans/friction-log.md` 的「2026-11-17｜第 6 波審查」節。
- 第 5 波原文：`git show 252ebc6:docs/plans/launch-wave-5/{plan,review}.md`；第 4 波稽核：`git show 3a7f506:docs/plans/launch-wave-4/audit-*.md`。

**開局現況**（11/24 台北）

- main＝`653e31e`（第 6 波晉升 #527）；develop＝`3e76edd`（含 #528 R6、#529 第 6 波收工紀錄與本檔交接）。開著的 PR：無。open issue：#467、#395、#384、#383。
- **正式站查詢路徑從未有過一次成功樣本**（R6 §3.3 Q1＝0）。
- **`QUERY03001` 過期單結案**（第 6 波主 session 收尾後查得，業主 11/24 轉述）：共 5 張——`202611121258381GSCF7`、`20261112224703BRI1XE`、
  `20261113121138HSZTIE`、`20261114175042776H9S`、`MS0K73`（單號尾碼）。業主已在 **PayUni 正式後台確認 5 張皆查無紀錄**，Supabase `payuni_response` 皆為空；
  其中 3 張（`BRI1XE`、`HSZTIE`、`MS0K73`）是會員放棄後**數分鐘內重下單付款成功**。6 筆相關告警已於 2026-11-24 標處理，**正式站目前無未處理告警**。
  → 這是 S2「`QUERY03001`＝PayUni 端沒有這張單＝棄付」的現場佐證：5/5 張在 PayUni 後台都不存在、0 張有付款通知，與官方碼義（R6 §3.1）一致。
  它**不取代**正控：佐證的是「棄單會回 03001」，沒證明「已付款的單一定查得到」（R6 §3.1 剩下的風險）。
- PayUni sandbox `sandbox-api.payuni.com.tw/api/upp` 偶發 403（11/09、11/11、11/14），deploy-smoke 每次推 LINE [P1]，下一輪自癒（R6 P2-12）。
- 前端首屏預算：entry gzip 316.2／316.5 kB（W6-25 業主授權後的上限），**再動 entry 的 PR 幾乎必撞**。

**目標**：S1、S2、S4 三項全部合進 develop 就晉升（不設截止，W7-4）。S3、S5、S6 有完成才上，沒完成順延第 8 波。

**裁決（AskUserQuestion，業主 2026-11-24）**

| # | 題 | 裁決 |
|---|---|---|
| W7-1 | 本波範圍 | **S1、S2、S4 必上**；S3、S6 有完成才上；S5 只做 R6 P2-4（換線實際寫入時點，會誤導補發）、有完成才上，S5 其餘留候選（被推翻：S1～S4 必上；只 S1、S2 必上；S1～S6 全必上） |
| W7-2 | S2 正控與改判怎麼接 | **一支 PR、程式內自動把關**：`QUERY03001` 改判以「最近一次正控成功、且在 36 小時內」為前提；正控失敗或尚無樣本時，自動維持現行 error 告警路徑。一次晉升即完成，W6-36 的「正控先、改判後」由程式保證（被推翻：兩支 PR，本波只上正控、改判延第 8 波） |
| W7-3 | 首批派工 | **S1＋S2 施工（`/fix-bug`）、S4＋S3 規劃（三段式）**；S6 等首批有一支合併後開；S5 見 W7-5（被推翻：只開 S1＋S2；範圍內全部同時開） |
| W7-4 | 晉升時點 | **不設截止，必上（S1、S2、S4）全合就晉升**（被推翻：12/06 22:00 收件；11/29 收件） |

**主 session 定的**

| # | 題 | 定案 |
|---|---|---|
| W7-5 | S5 何時開 | **S4 合併後開**：S5 的 P2-4 要動 `process_successful_payment`／0d 寫 `changed_at` 的路徑與推薦樹閘門 migration，S4 也動 `apply_referral_side_effects` 同區函式，並行會互相 rebase migration 基準 |
| W7-6 | S1 合併前審查 | **派獨立 Opus 審查員**（R6 §4.1：P1-1、P2-2 都落在沒派獨立審查的 #522，金流相鄰的結帳頁前端也要派） |
| W7-8 | 業主 11/24 提報 P0 疑慮：會員 47 人、試營運時超過 50 人出過「查不到」 | **結案，不加工項**（業主 2026-11-24 互動選項）。主 session 排查：舊事故是 `/auth/check-email` 只看 GoTrue 第一頁 50 位（friction-log 2026-10-25，已由 `find_auth_user_by_email` 修好，正式站函式在、有 50 位壓力測試釘住），後端已無 GoTrue 名單呼叫；後台會員／提領／證件列表皆伺服器端分頁＋搜尋＋全站統計；heal 一輪 50 張是訂單、處理完離開清單；推薦網絡分批 150 位。會到頂的是 PostgREST 1000 列：首頁 `public_listings` 全撈（16/1000）、後台提領姓名搜尋 `profiles ilike` 無上限 → 併 ref P1-3 列第 8 波候選（被推翻：本波加小工項；加 GoTrue 手寫呼叫機械守門） |
| W7-9 | S4 規劃 Q1、Q2、Q5～Q7 | **全照 S4 預設**：Q1＝A（`repair_orphaned_*` 以 null 呼叫擲 U6R02，單人路徑不動）；Q2＝3d 失敗也推 LINE；Q5＝本 PR 順修後台「批次自癒期間…」半句；Q6＝文案照規劃；Q7＝同單之後成功開通自動標處理（被推翻：Q1 改 B 拆 list＋單筆＋Edge 迴圈；Q2 只推 3b）（業主 2026-11-24） |
| W7-10 | S4 Q3：3a-bis（首購套用預設推薦人）失敗只 warning | **一起升 error**（範圍外追加，PR 內文寫明）（被推翻：列第 8 波）（業主 2026-11-24） |
| W7-11 | S3 規劃 Q1、Q2 | **詳情頁照片不加高度上限**（以 841×701 探針斷言名稱首屏可見）；**摺疊展開首頁維持 2 欄**；≥768 觸控大螢幕無 BottomNav 接受為既有行為（被推翻：照片加上限；改 3 欄）（業主 2026-11-24） |
| W7-12 | 前端總 JS raw 只剩約 11 bytes 餘裕（#531 刪死碼後 1983.04／1983 kB） | **撞到時逐支授權**：PR 附實測、增量在 lazy chunk、entry 不變，主 session 審過再請業主核准（比照 W6-25／32）（被推翻：預先放寬 +10 kB）（業主 2026-11-24） |
| W7-7 | 5 張 `QUERY03001` 過期單 | **結案**（業主 11/24 PayUni 後台查無、告警已標處理）；第 6 波業主待辦 #1 關閉。S2 測試夾具可引用這組事實當情境，但不得把單號寫進產品碼 |

## 1. 時程

| 時點（台北） | 事 |
|---|---|
| 11/24 | 本檔落檔；開 S1、S2（`/fix-bug` 施工）、S4（Opus 規劃）、S3（Sonnet 規劃） |
| 業主時間 | 審 S4、S3 規劃與 `/review-plan` 報告 → 在各自 session 親打 `/tdd-implement <slug>` |
| 首批第一支合併後 | 開 S6（Sonnet） |
| S4 合併後 | 開 S5（Opus，三段式，只做 P2-4） |
| S1、S2、S4 全合併後 | 開晉升 PR（develop→main，標題 `chore(release): 晉升 develop → main——第 7 波`）→ journey-full 綠 → merge commit → 4a 人工核對（W6-38）→ 業主核准 `production` → `/health` sha 對上 |
| 晉升後 | 確認 S2 正控在正式站跑出第一個成功樣本（改判才會啟用）；24～48 小時現場查詢（W4-26） |
| 現場查完 | 開 R7 第 7 波審查 session（兼做 `launch-wave-6/` 退場，依 R6 §6.2） |

## 2. 工作分解

在途上限：**程式碼工項同時最多 3 個**；三段式工項在規劃期不佔名額，進實作才佔。

| ID | 工項 | 流程／分支 | 模型 | 主要動到 | 撞檔 |
|---|---|---|---|---|---|
| S1 | **結帳頁導頁迴圈＋碼欄文案**（R6 P1-1、P2-2、P2-3）：「已有有效訂閱」、輪詢、掛載導向三處導 `/dashboard` 前先寫進 context（`ingestProfile`／`refreshUser`），測試改經 `RequireMembershipRoute`；新約碼欄填自己的碼顯示後端專屬文案；keeps_same 的 placeholder 與確認框改成與 keeps 同一句 | `/fix-bug`，`fix/checkout-dashboard-loop` | Sonnet（合併前獨立 Opus 審查，W7-6） | `PaymentCheckout.tsx`、`freshRenewalCopy.ts`、對應測試 | 純前端；不動 entry chunk |
| S2 | **PayUni 查詢正控＋`QUERY03001` 改判＋sandbox 403**（W6-36、W7-2、R6 §3.2、P2-1、P2-12）：①每日正控查一張正式站 completed 單（`SUCCESS`＋`TradeStatus=1`），結果落檔，失敗寫 error（推 LINE P1）②正控 36 小時內成功時，`QUERY03001`＝確認查無：不寫 `payuni-query`、滿 4 天靜默 expired、summary 另計 `notFound`；否則維持現行 ③已存 `payuni_response` 的單回 03001 一律寫 error ④查詢加 `User-Agent: payuni` ⑤deploy-smoke sandbox 403 單次不推 P1 ⑥`supabase/README.md` 告警／碼表段改寫 | `/fix-bug`，`fix/payuni-query-positive-control` | Opus（合併前獨立審查） | `index.ts` 對帳段、`reconcile-handler.ts`、可能新 migration（正控結果表或欄位）、`deploy-smoke.yml`、`supabase/README.md` | 與 S4 都可能動 migration：版本號 rebase 後跑 check |
| S3 | **摺疊手機展開態／平板版面＋首頁卡片外框對齊**（業主 11/09 兩則截圖，W6 plan §5） | 三段式，`feature/foldable-tablet-layout` | Sonnet | `HomePage.tsx`、`ServiceProviderCard`、`ServiceProviderDetail.tsx`、`docs/ui-ux-guidelines.md` | **entry gzip 已頂上限**：規劃要先量、增量放 lazy chunk |
| S4 | **金流收尾**：drop `complete_paid_pending_orders` wrapper（W6-14→W6-30）＋改直接呼叫它的測試；`apply_referral_side_effects` 3b／3d 失敗升 error；`repair_orphaned_*` 改逐筆交易；`complete_paid_pending_order` 單筆失敗告警 message 不含原始 sqlerrm；順修檔頭 R6 P2-7／P2-8；README〈補發漏發獎金〉以 `referral_award_chain` 為準（P2-9） | 三段式，`feature/payment-closeout` | Opus（合併前獨立審查） | 新 migration（以 `20261115000001`／`20261117000001` 為基準）、`supabase/README.md`、Deno 測試 | S5 等它合併（W7-5） |
| S5 | **後台推薦樹：換線實際寫入時點**（R6 P2-4）：另記寫入時點，閘門任一者晚於付款時點即判「不可判定」 | 三段式，`feature/referral-rewire-written-at` | Opus | migration、推薦樹 SQL、`AdminReferralTree` 相關 | S4 合併後開 |
| S6 | **Playwright 升版＋journey-suite 改回 `ubuntu-latest`**（W4-23 退場條件，`journey.yml` 的 `runs-on: ubuntu-24.04` 註解） | 一般 PR，`chore/playwright-upgrade` | Sonnet | `e2e/` requirements、e2e image tag、`journey.yml` | 跑 `check-playwright-image.py`、`check-workflows.py` |
| R7 | 第 7 波審查；兼做 `launch-wave-6/` 退場（依 R6 §6.2） | 審查 session；報告 `docs/plans/launch-wave-7/review.md` | Opus | — | — |

主 session 自己做：本檔 §7、§8；審每支 PR（S1、S2、S4、S5 另派獨立 Opus 審查員）；合併後 dispatch 驗證；代跑唯讀 SQL；上線後現場查詢（W4-26）。

## 3. 執行環境須知（寫進每個派工 prompt）

`docs/README.md`〈慣例〉的「雲端 session 的執行環境須知」全部適用（R6 已把第 5、6 波的各條搬進去）。

## 4. 晉升清單（主 session）

沿用 `launch-wave-6/plan.md` §4：4a 人工核對保留（W6-38）——develop 最近一次部署的「確認 migration 已套用」步驟綠＋正式站 `schema_migrations` 含本次新版本。
本波新增：S2 上線後主 session 確認正式站正控**第一個成功樣本**的時間（之後 36 小時內的 `QUERY03001` 才走新判讀），寫進 §8；若正控失敗，先看是查詢層、單號格式還是 PayUni 端，再決定要不要 hotfix。
S4 drop wrapper 前提（W6-30）：正式站 Edge 已是 S1 版本並跑過多輪（第 6 波 §8：上線後 217 輪 succeeded）——已滿足。

## 5. 第 8 波候選

以 `launch-wave-6/plan.md` §5（含〈承接第 5 波〉）與 R6 §5、§6.3 為準，扣掉本波收的（P1-1、P2-1～3、P2-4、P2-7～9、P2-12、W6-14／30、W6-36、3b／3d、`repair_orphaned_*`、單筆 sqlerrm、W4-23）。
本波 W7-1 留下的：S5 其餘——P2-5（`fresh_events` 未換線標示）、P2-6（規模效能＋頂層 unplaceable）、P2-10＋W6-21（後台 portal 遮罩）、W6-16（完整換線事件表）。
W7-8 留下的：首頁 `public_listings` 全撈、後台提領姓名搜尋 `profiles` 無上限，到 1000 筆會被 PostgREST 靜默截斷（與 ref P1-3 同類，一起做）。
重點未收：稽核其餘 P1（ref P1-3／5／6／7／8、auth P1-3／5、ops P1-2）、journey f70 缺章（W5-60）、vitest／vite 大版本（#467）、後台刪帳號工具（W5-12）、unknown 單手動開通入口（W5-44③）、S4 焦點還原搬進 useBrowseNav（W6-22）、#525「載入更多」aria-live 與 `LedgerState`／`PagedState` 合併。

## 6. 業主待辦

| # | 事 | 狀態 |
|---|---|---|
| 1 | PayUni 後台查 `QUERY03001` 過期單是否實付、標告警處理 | ✅ 11/24 結案（5 張皆查無、6 筆告警已標處理，W7-7） |
| 2 | 審 S4、S3 規劃與 `/review-plan` 報告，通過後在各自 session 親打 `/tdd-implement` | 等規劃 |
| 3 | develop 後台推薦樹三個分頁在 320px 手機寬實看（R6 §5-4） | 待回報 |
| 4 | 詢問 PayUni：sandbox UPP 端點對 GitHub runner 偶發 403 是否有 WAF／維護窗 | 可選 |
| 5 | 實機確認（第 4 波起）：H1 邀請連結、`uknow.pages.dev` 導向、正式站登入；PayUni 第一筆付款（11/03）發票；PostHog 專案端勾選與 Network 面板抽看、`tel-national` 真機；GitHub 設定補強 | 待回報 |
| 6 | 晉升合進 main 後核准 `production` 部署 | 等晉升 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| S1 | `session_01MQovbDabamShr6Fkx2Lt2J` | Sonnet | `fix/checkout-dashboard-loop` | #531 | 獨立審查中（`session_01MQovbCRRA98cKaKeMZ6AMJ`） |
| S2 | `session_01MQovbEZhJ3VifEeRuWhKcD` | Opus | `fix/payuni-query-positive-control` | #532 | 獨立審查中（`session_01MQovbDkHVKo7qK3USRppyt`） |
| S4 | `session_01MQovbCnBaBPj9q5RuMCWqf` | Opus | `feature/payment-closeout` | — | 規劃交件，等業主裁決 |
| S3 | `session_01MQovbEmiLwz2w5g6WJa6nT` | Sonnet | `feature/foldable-tablet-layout` | — | 規劃交件，等業主裁決 |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列；hash 以 PR 內文為準）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 11/24 | 主 session 開局：讀交接、W6 plan／review、〈慣例〉、dispatch-prompts。現況同交接（main 653e31e、develop 3e76edd、無開著的 PR）。業主補 `QUERY03001` 5 張過期單結案事實（§0）。業主裁 **W7-1～4**；主 session 定 W7-5～7。本檔擴寫、落 `dispatch-prompts.md` | 開 S1、S2、S4、S3 |
| 11/24 22:32 | 開 #530（本檔，draft，已訂閱）。開 S1、S3（Sonnet）與 S2、S4（Opus），tag `uknow-wave-7`；prompt 只放指標，正本是本分支的 `dispatch-prompts.md` | 等各 session 回報；S4、S3 規劃交業主審 |
| 11/24 23:00 | 回報：S3 規劃交件（P0 0、P1 6；Q1 照片高度上限、Q2 摺疊展開首頁欄數待業主）；S1 交 **#531**（CI 綠、ready；總 JS raw 1983.04／1983 kB 餘裕約 11 bytes，請主 session 定預算）；S4 規劃交件（Q1～Q7 待業主，Q4 唯讀 SQL 待主 session 代跑）；S2 交 **#532**（CI 綠、ready；migration `20261124000001`、新表 `payuni_query_controls`）。業主提報 P0 疑慮（超過 50 人查不到）→ 主 session 排查、業主裁 **W7-8** 結案。正式站：auth.users 47、profiles 47、listings 16、referral_edges 32、單人最多直接推薦 10 | 派 #531、#532 獨立審查；代跑 S4 Q4；S3、S4 裁決交業主 |
| 11/25 04:45 | 開 #531、#532 獨立 Opus 審查（雲端 session，見 §7）。代跑 S4 Q4（兩環境）：wrapper 無 cron／函式呼叫者、pg_depend 實為 0（正式站 2 列是 OID 撞號的 pg_toast 索引）、side-effect 與開通失敗告警 0 列；正式站 missing_edge 3＝有推薦人但從未付款（edge 首次付款才寫，預期）；gate ① 以部署紀錄核（#527 含 #524）。業主裁 **W7-9～12**，已轉 S4、S3 | 等審查回報；業主到 S4、S3 親打 `/tdd-implement` |
