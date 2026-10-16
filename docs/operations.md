# Uknow 維運手冊

> **B 級現況說明**：描述維運現在怎麼運作，過期就是 bug，發現即修。
> 業務規則在規格書、Dashboard 設定步驟在 `supabase-setup-checklist.md`、CI 規則在
> `.claude/rules/github-actions.md`，本文件不重複它們。這裡只講三件事：**訊號怎麼到人、
> 人看到之後做什麼、沒人看的時候機器與 AI 做什麼。**
>
> 上線前的施工分解（工項、分工、驗收）在 `plans/launch-readiness/plan.md`，上線後刪除；
> 本文件是留下來的那份。

## 導航（需要哪段讀哪段，不要整檔讀）

| 情境 | 讀 |
|---|---|
| 收到告警、線上出事 | §7 對應的 runbook，修碼走 `/fix-bug` |
| 想知道什麼在自動跑、多久一次、壞了會落在哪 | §5 |
| 設定或調整每日 AI 維運 session | §6 |
| 要切真金流、或緊急切回 sandbox | §7 R0 |
| 資料壞了、要還原 | §7 R6、§8 |
| 密鑰外洩、帳號被盜 | §7 R7、R8 |
| 客服案件 | §7 R12 |
| 每天／每週／每月／每季要做什麼 | §10 |

## 1. 原則（從 friction-log 的事故提煉）

1. **訊號必須回流到「一定有人看的地方」。** 本 repo 只有兩個這樣的時刻：PR 的 checks、
   正式站部署核准；再加上手機推播。排程紅燈不接到其中之一就等於沒有
   （journey 排程連紅四週無人接，2026-10-07）。**開 GitHub issue 是帳本，不是通知。**
2. **「不是 failure」不等於「沒事」。** 等待核准、排隊、skipped、cancelled 都可能是停擺
   （正式站靜默停擺 13 天，2026-08-07）。凡有佇列或人工閘門的流程，都要另外問
   「它會不會安靜地不前進」。
3. **「沒有人反映問題」不是沒有問題的證據。** 失敗靜默、回饋管道也被關掉時，沒有抱怨只證明
   抱怨管道不存在（DMARC 一直 fail 而無人知，2026-08-17）。
4. **觀測不到的狀態視為壞的。** 設定存檔成功不等於驗證通過：寄信看 mail-tester、部署看
   `/health` 的 `sha`、金流看 `payuniMode`。
5. **一人團隊的設計約束：** 任何需要「有人記得」的事變成機械檢查或排程；任何需要「有人盯」
   的事變成推播；人只做判斷與核准。
6. **「暫時」沒有到期日就是永久。** 暫時繞過的閘門要帶到期日並由檢查器把關（規則 13）。

## 2. 系統地圖與帳號

### 2.1 元件、環境、誰在看它

| 層 | 服務 | 環境 | 現有觀測 |
|---|---|---|---|
| 前端 | Cloudflare Pages：`uknow.com.tw`、`develop.uknow.pages.dev` | main／develop | `deploy-smoke.yml`（部署事件＋每 6 小時）、外部監控 |
| API | Supabase Edge Function `api`（Deno，單一函數） | 正式專案 `uhtwwxtazwqnlbejhprl`；develop 是 persistent branch `ijcxnxhrziehdtkwausy` | `deploy-supabase.yml` 部署後比對 `/health` 的 `sha`、外部監控 |
| 資料庫／Auth／Storage | Supabase Pro，`ap-southeast-1`，Postgres 17 | 同上 | Supabase advisors、每日備份、AI 日報 |
| 金流 | PayUni UPP，sandbox 或正式由 `PAYUNI_SANDBOX` 決定 | 兩環境各一套憑證 | `deploy-smoke` 閘門探測、對帳排程、`system_alerts` |
| 寄信 | Supabase Auth（GoTrue）→ Google Workspace SMTP | 正式寄件者 `admin@uknow.com.tw`；develop 用另一寄件者 | Auth logs、DNS 四筆、季檢 mail-tester |
| DNS | Cloudflare zone `uknow.com.tw` | — | 目前無自動檢查（上線前補，見 launch-readiness） |
| CI 與排程 | GitHub Actions（public repo，標準 runner 免費） | — | 目前無「排程器本身停擺」的偵測（上線前以 heartbeat 兜底） |
| 排程 AI | Claude Code 雲端排程 session（本 repo 的環境） | — | 它自己寄日報；沒收到日報就是告警 |

### 2.2 帳號與存取（季檢盤點表）

| 供應商 | 用途 | 2FA | 備註 |
|---|---|---|---|
| GitHub | 程式碼、Actions、Secrets、`production` 環境的核准人 | 必開 | ruleset 只在 public repo 生效 |
| Supabase org（Pro） | 正式專案與 develop 分支、Secrets、備份、Logs | 必開；org 層強制 MFA | 帳單卡片到期日記入行事曆 |
| Cloudflare | Pages、DNS | 必開 | 有 API token 就記錄用途與到期 |
| Google Workspace | 寄件者、告警收件匣、SMTP 應用程式密碼 | 必開 | 每日 2,000 封上限 |
| PayUni 後台 | 商店憑證、NotifyURL、交易查詢 | 依 PayUni | 測試與正式商店各一組 |
| LINE Developers | **告警 bot**，與客服用的官方 LINE 分開 | 必開 | 免費方案每月 200 則推播 |
| 外部監控服務 | 可用性探測、heartbeat | 必開 | 免費方案 |
| 網域註冊商 | `uknow.com.tw` 續約 | 必開 | **自動續約必開**，到期日記入行事曆 |

**存取復原（break-glass）**：所有帳號收進密碼管理器，並設定至少一位緊急聯絡人能取得管理器的
緊急存取。業主與工程師是同一人時這條更重要，不是更不重要。

## 3. 告警分級與路由

### 3.1 分級

| 級 | 定義 | 通道 | 目標回應（內部目標，不是對會員的承諾） |
|---|---|---|---|
| **P1** | 錢或可用性：正式站或 API 不可用；付款鏈斷（notify 驗章失敗、建單 500、PayUni 閘門 403／5xx）；對帳排程失敗；正式站部署失敗或卡住；`system_alerts.severity = 'error'`；備份失敗 | 外部監控推播＋LINE 推播＋Email | 4 小時內確認，24 小時內緩解 |
| **P2** | 需要人判斷但不急：`severity = 'warning'`；develop 部署失敗；journey 排程紅；相依 high／critical；advisor 新增 WARN；後台積壓超過門檻 | AI 日報 Email（彙整） | 3 個工作天 |
| **P3** | 趨勢與債：效能 advisor、unused index、成本變化、friction-log 待裁決 | AI 週報 | 下次整併 |

### 3.2 訊號來源與落點

「現在」是本文件寫成時的狀態，launch-readiness 的 session ① 完成後把「現在」欄改成實況。

| 來源 | 現在 | 目標 |
|---|---|---|
| `deploy-supabase.yml` 失敗 | 開 issue（每次一張，不自動關） | main → P1 推播；develop → P2；同分支下一次成功即自動關閉舊 issue |
| `deployment-queue-audit.yml` 卡住 > 6 小時 | 開 issue，佇列清空自動關 | P1 推播 |
| `reconcile-payments.yml` 失敗 | 開 issue（去重） | P1 推播；成功即自動關閉 |
| `deploy-smoke.yml` 紅（資產、SPA 模式、快取、PayUni 閘門） | job 紅，無 issue | P1 推播 |
| `journey-scheduled.yml` 紅 | issue #288 累加連紅週數；晉升 PR 的 `ci-ok` 印警告 | P2 日報 |
| `security.yml` high／critical | 開或更新 issue | P2 日報 |
| `system_alerts` error | 只在後台「系統告警」分頁可見 | P1 推播（每小時輪詢未通知的 error，見 launch-readiness ③-E） |
| `system_alerts` warning／info | 後台分頁 | P2 日報計數 |
| 外部可用性探測 | 無 | P1，由監控服務自帶推播 |
| GitHub 排程器停擺、排程被自動停用 | 無 | heartbeat：對帳成功即打一次 heartbeat，3 小時沒收到即 P1 |
| 後台積壓（待匯款停留 > 10 天、證件待審 > 7 天、未結 error） | 無 | P2 日報 |
| DNS 四筆（SPF／DKIM／DMARC／MX）消失 | 無 | P1，併入 `deploy-smoke` 排程路徑 |

### 3.3 `system_alerts` 的來源目錄

severity 由寫入端判定，判準寫在 `api/index.ts` 的 `logSystemAlert` 定義處。
來源：Edge 側 `payuni-notify`（驗章或解密失敗，去重）、`payuni-prepare`（預設推薦人不可用）、
`reconcile-pending-payments`、PayUni 結果解析（`order_not_found`／`amount_mismatch`／
`missing_mer_trade_no`）；SQL 側 `process_successful_payment`、`apply_referral_side_effects`、
`pay_referral_generations`、`claim_referral_king_reward`、`complete_paid_pending_orders`、
`fresh_ledger_forfeit`、`repair_orphaned_*`、`resolve_default_referrer`。
處理完在後台標記已處理。每一筆 error 都對應 §7 的一條 runbook，多數落在 R3。

## 4. 監控與 SLI

| SLI | 來源 | 門檻／目標 | 誰算 |
|---|---|---|---|
| 正式站可用性 | 外部監控：首頁 200 且含關鍵字；`/functions/v1/api/health` 回 `"ok":true` | 月可用率 ≥ 99.5%；單次中斷超過 5 分鐘推播 | 監控服務 |
| 線上版本正確 | `/health` 的 `sha` 等於 main HEAD | 不符即部署紅燈 | `deploy-supabase.yml` |
| 付款卡單 | 對帳回報的 `stillPending`／`expired`／`queryErrors` | 每次對帳後只剩門檻（20 分鐘）內的新單；`expired` 連續出現要查 R3 | 對帳排程＋AI 日報 |
| 付款回調健康 | `payuni-notify` 的 `decrypt_failed` 告警 | 出現即 P1 | `system_alerts` |
| PayUni 閘門 | `deploy-smoke` 對兩個 UPP 端點各 POST 一次 | 403、5xx、連線失敗即紅 | `deploy-smoke.yml` |
| 寄信 | Auth logs 的 SMTP 錯誤；DNS 四筆；季檢 mail-tester | 錯誤數 > 0 即查 R4；季檢三項 pass 且有 `DKIM_VALID_AU` | AI 日報＋人季檢 |
| API 錯誤率 | `function_edge_logs` 的 5xx 占比 | 日 < 1%；單日 5xx > 20 筆查 R2 | AI 日報 |
| 後台積壓 | SQL 彙總（只取計數，附錄 A） | 待匯款停留 > 10 天為 0；證件待審 > 7 天為 0；未結 error 為 0 | AI 日報 |
| 安全 | Supabase security advisor 的 WARN 數；npm audit high／critical | WARN 不增加；高危 14 天內有結論 | AI 日報與週報 |
| 成本 | Supabase 帳單、分支時數、LINE 則數、Claude session token | 月檢，較上月變動 > 30% 要解釋 | 業主月檢 |

門檻可調，調整時改本表並在同一 commit 寫理由。

**日誌怎麼查**：Supabase Dashboard → Logs（Edge Functions、Auth、Postgres）；Supabase MCP 的
`query_logs` 以 ClickHouse SQL 查 `logs` 表，一次最多 24 小時窗。AI 日報用的查詢片段在附錄 A。

## 5. 排程與自動化一覽

| 什麼 | 頻率 | 定義在 | 失敗落點 |
|---|---|---|---|
| CI（guards／static／unit／build／api／e2e／journey-offline／`ci-ok`） | 每次 PR 與 push | `ci.yml` | PR checks |
| Edge Function 部署（含 `/health` sha 比對） | 該分支 CI 綠之後；main 需人工核准 | `deploy-supabase.yml` | issue；上線前改為推播 |
| 前端部署 | push（Cloudflare Pages 的 GitHub 整合） | Cloudflare | `deploy-smoke` |
| 部署後 smoke：資產完整、SPA 模式、快取標頭、PayUni 閘門 | `deployment_status` 事件＋每 6 小時 | `deploy-smoke.yml` | job 紅；上線前改為推播 |
| 部署佇列健檢 | 每 6 小時 | `deployment-queue-audit.yml` | issue；上線前改為推播 |
| 付款對帳（錢的安全網） | 每小時；實測中位間隔 1.7 小時、最大 6.3 小時 | `reconcile-payments.yml` | issue；上線前改為推播＋heartbeat |
| journey 真後端全鏈路 | 每週日 02:00 台北 | `journey-scheduled.yml` → `journey.yml` | issue #288 累加 |
| 相依漏洞掃描 | 每週一 | `security.yml` | issue |
| 相依更新 PR | npm 每週一；actions 與 pip 每月 | `.github/dependabot.yml` | PR |
| 資料庫每日備份 | 每日，保留 7 天 | Supabase Pro | Dashboard → Database → Backups；AI 日報確認最近一次時間 |
| AI 維運分診 | 每日台北早上；週一加週報；每月 1 日加月報 | 雲端排程任務（§6） | 沒收到日報本身是告警 |

GitHub 的排程器在整點高峰會丟觸發；repo 60 天沒有活動時 GitHub 會**自動停用排程 workflow**。
兩者都靠 heartbeat 監控兜底。每個排程的頻率依據一律寫在該 workflow 檔頭（規則 8b）。

## 6. AI 維運 session（章程）

執行環境：本 repo 的 Claude Code 雲端環境，由排程任務每日開一個全新 session。
工具：GitHub MCP、Supabase MCP（唯讀用法）、Gmail。**本節是它的單一事實來源**，
排程的 prompt 只說「依 `docs/operations.md` §6 執行今天的分診」，規則改這裡就生效。

### 6.1 每日順序

1. **收集**：(a) 最近 24 小時每個排程 workflow 的最新 run 結論與連結；(b) 未結 issue 中機器開的
   （標題前綴：「Edge Function 部署失敗」「部署佇列卡住」「付款對帳排程失敗」「journey 排程失敗」
   「相依安全掃描」）；(c) Supabase security advisor 的 WARN 清單與昨日差異；(d) `system_alerts`
   未處理數，依 severity；(e) `function_edge_logs` 的 5xx 數；(f) 附錄 A 的三個積壓計數；
   (g) 最近一次每日備份時間；(h) Dependabot 開啟中的 PR 與其 CI 狀態；(i) 進行中的 PR 有沒有
   紅 CI 或衝突。
2. **判定**：每一條套 §3.1。P1 已由推播通道處理，日報只確認「已推播、有人在處理」。
3. **允許的行動**：關閉條件已消失的機器 issue 並留一句原因與證據連結；對 Dependabot PR 的紅 CI
   做歸屬判定並留言；對相依升級、告警誤報修正、文件錯誤開 PR（分支 `claude/ops-<YYYYMMDD>-<slug>`，
   照 PR 範本，`npm run check` 綠才 push，PR 一律 draft）；在日報列出建議工項並附可直接開新
   session 的 prompt。
4. **禁止的行動**：合併任何 PR；核准任何部署；對正式站執行任何寫入 SQL；修改 Secrets；關閉非機器
   開的 issue；觸發 journey 或 production 部署；讀取含個資欄位的資料列（只准彙總計數）；
   寫入 `docs/plans/friction-log.md` 以外的任何長期文件。
5. **輸出**：一封日報 Email 到 `admin@uknow.com.tw`（格式見 6.3）；有未被確認的 P1 時另發
   LINE（走 repo 的通知 action，不自己持有 token）。

### 6.2 週報與月報

- **週一**另加：§4 每個 SLI 的週趨勢；未結事項的 aging；成本訊號（分支時數、LINE 則數、
  自己的 token 用量）；friction-log 本週新增條目摘要；下週建議工項最多 3 條。
- **每月 1 日**另加：§9.2 密鑰年齡；§2.2 存取盤點提醒；還原演練到期提醒（季）；相依 major
  升級清單與 changelog 摘要。

### 6.3 日報格式

標題 `[Uknow 日報] YYYY-MM-DD ｜ P1 n ｜ P2 n ｜ 待辦 n`。內容依序：P1（含處理狀態）、
P2（條列，每條附連結與建議動作）、SLI 一行表、今天做了什麼（關了哪些 issue、開了哪些 PR）、
建議工項（附 prompt）。**沒有事也要寄**，寫「今日無異常」；沒收到日報本身是告警。

### 6.4 校準期

上線前至少跑滿兩週，人每天讀並調誤報。首跑用手動觸發、在有人看的時候跑，確認不會卡在權限
提示、能讀到 Actions／issues／advisors／logs、能寄出 Email。

## 7. Runbooks

格式：症狀 → 先確認 → 處置 → 事後。只寫判斷與動作，細節指向既有文件。
每次事故結束後：friction-log 記一條「為什麼沒攔到」；要修碼走 `/fix-bug`。

### R0 金流模式切換（上線日，以及緊急切回）

**切成真金流**（只做一次）：

1. 前置：PayUni 正式商店三把憑證到手；PayUni 後台 NotifyURL 指向正式 API
   （`supabase-setup-checklist.md` 步驟 3）；「正式端點是否也擋海外來源」已向 PayUni 確認並
   決定對會員的說法；§8.2 的還原演練做過一次；外部監控與推播已用假告警端到端實測。
2. 正式站 Secrets：`PAYUNI_MER_ID`、`PAYUNI_HASH_KEY`、`PAYUNI_HASH_IV` 設入，
   `PAYUNI_SANDBOX=false`（checklist 步驟 1）。
3. 開 PR 把 `deploy-supabase.yml` 的 `EXPECT_PRODUCTION_PAYUNI` 改成 `'true'`，隨晉升 PR 進
   main。部署核准後 `/health` 應回 `payuniMode: production`、`payuniConfigured: true`，
   `defaultReferrer: ok`（已啟用預設推薦人時）。
4. 從**台灣網路**以真卡付款一次（建議就是預設推薦人平台帳號的首購，checklist 步驟 6 要求它是
   該環境第一筆成功付款），確認 notify 回調成功、訂單進 `subscriptions`、`system_alerts` 無 error。
5. 首 48 小時每天看兩次：`system_alerts`、對帳回報、`deploy-smoke`。

**緊急切回 sandbox**：`PAYUNI_SANDBOX=true` → 重新部署 `api`（Dashboard 的 Deploy，或推一個
commit）。已完成的訂單不受影響；切回期間新付款會走測試站，所以要同時發系統公告。
`EXPECT_PRODUCTION_PAYUNI='true'` 會讓下一次 main 部署紅燈，那是刻意的提醒，不要為了綠燈改回去。

### R1 正式站整站打不開

- 先確認：外部監控紅的是前端還是 API；Cloudflare 狀態頁；`develop.uknow.pages.dev` 是否正常。
- 處置：Cloudflare Pages → Deployments → 對上一個成功部署按 Rollback；Cloudflare 整體故障就只能等，
  用官方 LINE 對外說明。
- 事後：`deploy-smoke` 為什麼沒先叫。

### R2 API 不回或大量 5xx

- 先確認：`/health` 回什麼；Supabase 狀態頁（`ap-southeast-1`）；Edge Function logs 的錯誤訊息；
  最近一次 deploy run 的時間是否吻合。
- 處置：壞部署 → Actions 對上一個成功的 Deploy run 按 Re-run（會再要一次 production 核准，部署的是
  該 run 的 commit）；Secrets 被改 → 對照 checklist 的「完整對照」表補回並重新部署；Supabase 故障
  → 等待並對外說明。

### R3 付款相關

| 症狀 | 先確認 | 處置 |
|---|---|---|
| 會員付了錢沒開通 | `payment_orders` 該 `trade_no` 的狀態；PayUni 後台該筆是否成功 | `pending` 且 PayUni 成功 → 等下一次對帳，或手動 dispatch `reconcile-payments.yml`；`expired` 且 PayUni 成功 → 查 `system_alerts` 對應筆，對帳的自癒路徑（`complete_paid_pending_orders`）會收斂它，仍不行走 `/fix-bug` |
| `payuni-notify` 的 `decrypt_failed` 告警 | HashKey／IV 是否剛換；PayUni 是否改了欄位 | 憑證對齊後重新部署；期間卡單由對帳撿回 |
| 瀏覽器導到 PayUni 回純文字 403 | 來源地區是否海外；`deploy-smoke` 的閘門探測是否也紅 | 海外 → 依與 PayUni 確認的結果回覆會員；探測也紅 → PayUni 故障，等待 |
| 對帳排程失敗 | run log：curl 失敗（網路）還是回應形狀錯（端點） | 端點錯走 `/fix-bug`；期間手動 dispatch 補跑 |
| 帳面成功但實際未入帳 | `/health` 的 `payuniMode` | 若是 `sandbox` 就是 2026-07-26 的形狀，走 R0 |

訂單在 `pending` 停留超過 4 天會被對帳標成 `expired`；對會員說明對帳時間尺度時一律講「數小時內」，
不講「每小時」（排程器不保證）。

### R4 會員收不到驗證碼

依序：Auth logs 該 email 的寄送紀錄（SMTP 錯誤、是否撞 Auth 限流）→ Google 日額度
（`550 daily limit exceeded`）→ DNS 四筆仍在 → 垃圾桶 → 用 Outlook 或 Yahoo 收一封真實 OTP 看
`Authentication-Results`。處置與每一步的細節：`supabase-setup-checklist.md` 步驟 2。

### R5 Edge Function 部署失敗或卡住

- 失敗：看 run 裡四次重試的輸出，ECR 拉映像限流以外的錯誤才是程式問題。
- 卡住（`waiting`／`pending`）：依 `deployment-queue-audit` 的 issue 內容處置。核准前先確認該 run 的
  commit 是最新的，舊的要**取消**不是核准。

### R6 資料壞了（錯誤 migration、誤改、誤刪）

- 原則：已套用的 migration 不改，一律新增修正 migration（`supabase/README.md`）。
- 資料層：先停掉壞掉的寫入路徑（系統公告，必要時 R0 切回 sandbox）→ Dashboard → Database →
  Backups 取最近一次每日備份 → 依 §8.2 還原 → 對帳 `payment_orders`、`reward_transactions`、
  `withdrawals` 的筆數差異並逐筆補。
- Storage 檔案不在資料庫備份內（§8.3）。

### R7 密鑰外洩與輪替

| 密鑰 | 在哪換 | 影響 | 連帶 |
|---|---|---|---|
| `MEMBER_TOKEN_SECRET` | Supabase Secrets，兩環境各一把 | 未掃描的 90 秒碼失效 | 重新部署 `api` |
| `RECONCILE_SECRET` | Supabase Secrets 與 GitHub Secrets 同步 | 對帳排程 | 兩邊都換才會綠 |
| PayUni 三把 | PayUni 後台重新產生 → Supabase Secrets | 期間 notify 全部失敗 | 重新部署；對帳撿回卡單 |
| `SUPABASE_ACCESS_TOKEN` | Supabase 帳號 → GitHub Secrets | 部署與 journey | — |
| service_role 與 anon（JWT secret） | Supabase Dashboard 重設 JWT secret | **anon key 寫在 git**（`src/utils/supabase/info.tsx`、`config/supabaseTarget.ts`），要同步改並重新建置前端 | 所有登入 session 失效 |
| Google 應用程式密碼 | `myaccount.google.com` → Supabase SMTP 設定 | 寄信 | 兩環境 |
| LINE channel token | LINE Developers → GitHub Secrets | 告警推播 | — |

輪替後打 `/health` 確認 `memberTokenConfigured`、`payuniConfigured`，並更新 §9.2 的日期。

### R8 管理員帳號疑似被盜

1. SQL Editor：`update public.profiles set is_admin = false where id = '<uuid>';`，並停權。
2. Supabase Auth → 該使用者 → 登出所有 session。
3. 檢查 `withdrawal_events`（近期「已匯款」標記）、`member_verify_logs`、管理員授予紀錄。
4. 輪替 `MEMBER_TOKEN_SECRET`（R7）。
5. 由另一位管理員重新授予；規格書 §13 的「授予不可逆」段說明了為什麼事後撤回不夠。

### R9 供應商區域故障

Supabase、Cloudflare、Google Workspace 的狀態頁都訂閱 Email（上線前完成）。能做的只有對外說明，
以及事後驗證一致性：手動跑一輪對帳、`system_alerts` 清零。

### R10 journey 排程紅燈的歸屬

不要逐條讀 log。列出「上次綠之後進 develop 的改動可能波及的機制」，用同一 commit 上其他綠的閘門
逐一排除（friction-log 2026-08-07 的判定法）；`e2e/journey/tools/failure_digest.py` 先把外部逾時與
斷言失敗分開。PayUni sandbox 抖動與地區封鎖不是迴歸。

### R11 相依漏洞 issue

Dependabot PR 綠就合；沒有修補版本的 transitive 相依在 issue 註記評估結果後關閉；14 天內要有結論。

### R12 客服案件

| 案件 | 查哪裡 | 處置 |
|---|---|---|
| 收不到驗證碼 | R4 | 多半是垃圾桶或限流 |
| 付了錢沒開通 | R3 第一列 | 時間尺度講「數小時內」 |
| 我的錢呢（提領） | 後台 → 提領 → 該筆的事件歷史 | 狀態語意依規格書 §10.3 原文回覆 |
| 退件理由 | 後台提領列的退件理由 | 轉告原文 |
| 停權申訴 | 後台 → 會員詳情 → 管理 | 恢復前先看停權理由 |
| 刪除帳號、個資查詢 | 服務條款 §十二：以電子郵件書面提出 | 先核對身分；已付款帳號不能自助取消；刪除的 SQL 與連帶表由 launch-readiness 的 session ③ 在 develop 演練後補入本列 |
| 海外付款被擋 | R3 第三列 | 依 PayUni 的確認結果回覆 |

後台作業（匯款、證件審核）的處理節奏由業主自行安排，本文件不規定，只用 §4 的積壓門檻告警。

## 8. 備份與還原

### 8.1 現況

| 項目 | 現況 | 說明 |
|---|---|---|
| 資料庫 | Supabase Pro 每日備份，保留 7 天 | RPO 最差 24 小時。PITR 未購，付費會員約 300 人時再評估（約 US$100／月起） |
| Storage（證件照、推薦簽名、刊登照片） | 無獨立備份 | 刊登照片可重傳；證件照與簽名是 KYC 證據。做法由 launch-readiness 的 session ④ 決定後填入 §8.3 |
| 設定（Secrets、SMTP、Auth 設定、PayUni 後台） | 清單在 `supabase-setup-checklist.md` | 重建靠清單，不靠備份 |
| 程式碼與 migration | git | 任何環境可從零重放 |

### 8.2 還原演練（每季）

從 Dashboard 取最近一次每日備份 → 還原到拋棄式分支或本機 Postgres → 比對關鍵表筆數
（`profiles`、`subscriptions`、`payment_orders`、`reward_transactions`、`withdrawals`）與
`reward_balances` 合計 → 跑 `rls-policies.test.ts` 確認結構 → 記錄耗時。

第一次演練的實測 RTO、步驟修正與踩坑：（session ④ 填）

### 8.3 Storage 備份

（session ④ 決策後填：範圍、頻率、加密、存放處、還原方式、憑證放哪）

## 9. 安全與法遵維運

### 9.1 巡檢

- 每日（AI）：security advisor 的 WARN 差異。
- 每週：Dependabot PR。
- 每月：Dashboard 設定快照：leaked password protection 開、SSL enforcement 開、Auth 連線策略為
  百分比、org 層 MFA 強制、Network restrictions 的狀態。
- 每季：§2.2 存取盤點、§9.2 密鑰年齡、mail-tester、§8.2 還原演練。

### 9.2 密鑰年齡表

| 密鑰 | 上次輪替 | 建議週期 |
|---|---|---|
| `MEMBER_TOKEN_SECRET`（兩環境） | （待填） | 12 個月，外洩即換 |
| `RECONCILE_SECRET` | （待填） | 12 個月 |
| PayUni 憑證 | 依 PayUni | 依 PayUni |
| `SUPABASE_ACCESS_TOKEN` | （待填） | 12 個月 |
| Google 應用程式密碼 | （待填） | 12 個月 |
| LINE channel token | （待填） | 12 個月 |

### 9.3 個資

蒐集項目、目的、保存期限與權利行使方式以服務條款 §十二為準，本文件只定義處理路徑（R12）。
後台含未遮罩的身分證字號與收款帳號，授予管理員前讀規格書 §13 的「授予在資料層面是不可逆的」段。

## 10. 節奏

| 誰 | 多常 | 做什麼 | 預估 |
|---|---|---|---|
| AI | 每日 | §6 分診與日報 | 自動 |
| 人 | 每日 | 讀日報；P1 依 runbook | 5 分鐘 |
| 人 | 每週 | 讀週報；合併綠的 Dependabot PR；處理 P2 | 30 分鐘 |
| 人 | 每月 | 帳單與用量；§9.1 的設定快照；月報工項 | 30 分鐘 |
| 人 | 每季 | 還原演練、存取盤點、密鑰年齡、mail-tester、friction-log 整併 | 半天 |

## 11. 成本與配額

| 項目 | 現況 | 注意 |
|---|---|---|
| Supabase Pro | 月費＋develop persistent branch 依時數計費＋journey 拋棄式分支時數 | 帳單每月看一次；分支時數是最大變因 |
| Cloudflare Pages | 免費 | 資產 TTL 一週且可能消失，`deploy-smoke` 持續量測 |
| GitHub Actions | public repo 免費 | 改回 private 的計費模型見 `ci.yml` 檔頭沿革 |
| Google Workspace | 既有 | 每日 2,000 封，撞到改 SMTP relay（checklist 步驟 2） |
| LINE Messaging API | 免費每月 200 則 | 告警要去重，別讓一次事故吃光額度 |
| 外部監控 | 免費方案 | 探測間隔與監控數上限依方案 |
| Claude 排程 session | 依 token | 日報 session 的 token 用量列進月報 |

## 附錄 A：AI 日報用的唯讀查詢（只取彙總，不取個資）

後台積壓三個計數：

```sql
select
  (select count(*) from public.withdrawals
     where status = 'pending' and requested_at < now() - interval '10 days') as withdrawals_pending_over_10d,
  (select count(*) from public.profiles
     where id_verification_status = 'pending' and id_submitted_at < now() - interval '7 days') as id_reviews_over_7d,
  (select count(*) from public.system_alerts
     where resolved_at is null and severity = 'error') as unresolved_error_alerts,
  (select count(*) from public.system_alerts
     where resolved_at is null and severity = 'warning') as unresolved_warning_alerts;
```

API 5xx 數（`query_logs`，ClickHouse SQL）：`logs` 表以 `source = 'function_edge_logs'` 篩，
狀態碼欄位的實際鍵名以 `select distinct` 探勘後填入（session ② 補）。
