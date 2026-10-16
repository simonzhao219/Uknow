# 上線前維運準備——工作分解與分工

<!-- plans-keep: 上線前的跨 session 施工鷹架（四個實作 session 尚未開工）；退場條件＝正式站切成真金流（R0 完成）且本檔「上線後 30 天」清單全數結案時，整個目錄刪除，值得保存的決策升級進 docs/operations.md -->

> 長期文件是 `docs/operations.md`（維運手冊）。本檔只放**施工期**的東西：拍板的決策、
> 分級後的工項、四個實作 session 的範圍與開工 prompt、上線切換清單。
> 每個 session 開工先讀本檔對應段落與 `docs/operations.md` 的導航表，收工回來更新「狀態」欄。

## 0. 已拍板的決策（2026-10-16，業主）

| 題目 | 決定 |
|---|---|
| 上線時程 | 1 到 2 個月，等 UI/UX 重設計 S7 收尾；因此 P0 與 P1 都在上線前完成 |
| P1 告警通道 | 外部監控推播＋Email，加 LINE 官方帳號（Messaging API）推播；GitHub issue 降為帳本 |
| AI 自主度 | 每日 AI 分診可報告、關閉已自癒的機器 issue、開 draft PR；合併、部署核准、正式站 SQL 一律留給人 |
| 備份 | 沿用 Supabase Pro 每日備份；上線前做一次還原演練；Storage 證件照另議；付費會員約 300 人時再評估 PITR |
| 分工 | 規劃由本 session 產出；實作拆四個獨立 session（① ② Sonnet，③ ④ Opus） |
| 法務文本 | 既有：服務條款 §六退費、§十二個資，事業手冊、參加契約書、推廣獎勵規章。不新寫，業主確認為最終版即可 |
| 客服管道 | 頁尾純文字的官方 LINE 與信箱，刻意不做可點連結，維持 |
| 後台作業節奏 | 不寫進任何文件；只用停留天數門檻告警（待匯款 > 10 天、證件待審 > 7 天） |

## 1. 分級

- **P0（切真金流之前必須為真）**：訊號到人、外部監控、heartbeat、還原演練、金流切換 runbook
  演練、帳號安全、陳舊 issue 清零、AI 分診跑滿兩週。
- **P1（上線前完成，1 到 2 個月窗內）**：Supabase 安全與效能 advisor 修正、`system_alerts`
  error 推播、對帳 heal pass 靜默失敗修正、DNS 存在性檢查、Storage 備份決策與落地、
  舊資源清理決策。
- **P2（上線後 30 到 90 天）**：前端錯誤回報端點、流量基線（Cloudflare Web Analytics）、
  Network restrictions、unused index 清理（要有 60 天真實流量才有意義）、`tdd-unlock.sh`
  的 Deno 缺口（框架債）。

## 2. 四個實作 session

每個 session 的通則：讀 `CLAUDE.md`；分支從 `origin/develop` 切（CI 與文件改動用 `fix/*` 或
`claude/*`，不走 `feature/*`）；輕量 Plan Mode 規劃、業主核准後再動手；`npm run check` 綠才 push；
PR 用範本、draft；改 `.github/workflows/` 後跑 `python3 scripts/check-workflows.py`；
新增 workflow 規則就補到 `check-workflows.py` 並附正反表格案例（規則寫在註解裡等於沒有）。
收工：更新本檔 §2 對應的「狀態」與 `docs/operations.md` §3.2 的「現在」欄。

### ① 告警到人、外部監控、issue 收斂（Sonnet）

| 項 | 內容 | 驗收 |
|---|---|---|
| 狀態 | ⬜ 未開工 | 分支 `fix/ops-alert-routing` |
| A 外部監控 | Better Stack 或 UptimeRobot 免費方案（人在服務後台設定，步驟與截圖記進 operations.md §4）：監控 1 `https://uknow.com.tw/` 200＋關鍵字；監控 2 `https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/api/health` 含 `"ok":true`；監控 3 heartbeat（期望每 3 小時至少一次）；通知：App 推播＋Email；develop 可選、不推播 | 故意打壞一次（暫停 heartbeat 或改錯 URL）手機收到推播 |
| B LINE 告警 bot | LINE Developers 建 Messaging API channel（與客服 LINE 分開），取得 channel access token 與業主 userId → GitHub Secrets `LINE_CHANNEL_TOKEN`、`LINE_ALERT_TO` | 以 workflow_dispatch 發一則測試訊息收到 |
| C 共用通知 action | `.github/actions/notify`（composite）：輸入 `level`（P1／P2）、`title`、`body`、`run_url`；P1 → LINE push＋Email；P2 → Email。Email 走 Gmail SMTP 應用程式密碼（Secrets `ALERT_SMTP_USER`／`ALERT_SMTP_PASS`），收件 `admin@uknow.com.tw`。訊息內不得含個資 | 接到：`deploy-supabase`（main 失敗 P1；develop 失敗 P2）、`reconcile-payments` 失敗、`deploy-smoke` 排程路徑失敗、`deployment-queue-audit` 卡住、`security` high／critical（P2）、`journey-scheduled` 連紅（P2） |
| D heartbeat | `reconcile-payments.yml` 對帳成功後 curl 監控服務的 heartbeat URL（Secret `HEARTBEAT_URL`）；失敗路徑不打 | 停掉 workflow 3 小時內收到推播（可用暫時 disable 驗證後再 enable） |
| E issue 自動收斂 | 同分支下一次部署成功即關閉舊的「Edge Function 部署失敗」issue；對帳成功關閉「付款對帳排程失敗」；journey 綠關閉 #288 類；關閉時留一句「已於 run <url> 恢復」 | 現有 10 張陳舊 issue 由本 session 一次清零（人工關或 session 內用 GitHub MCP），之後 issue 數成為 SLI |
| F DNS 存在性 | `deploy-smoke.yml` 排程路徑加一個 step（規則 8a 不開新 job）：`dig` 查 SPF、DKIM（`google._domainkey`）、DMARC、MX 四筆存在；缺任一即紅並走 notify P1 | 把其中一筆名稱改錯跑一次確認會紅 |
| G 機械把關 | `check-workflows.py` 新規則：任何 `if: failure()` 的 step 所在 workflow 必須呼叫 `.github/actions/notify`（排除 `ci.yml`，它的落點是 PR checks）；附正反案例 | 自測綠；移除一處 notify 會紅 |
| H 文件 | operations.md §3.2「現在」欄更新；§2.1 觀測欄更新；LINE 與監控服務的設定步驟寫進 §4 之後的小節 | `check-document-naming.py` 綠 |

依賴：③-E 的 `system_alerts` 推播需要本 session 的 notify action 先存在，所以 ① 先於 ③ 合併，
或 ③ 先完成端點、步驟留到 ① 合併後接上。

### ② 每日 AI 維運 session 與 runbook 試走（Sonnet）

| 項 | 內容 | 驗收 |
|---|---|---|
| 狀態 | ⬜ 未開工 | 分支 `claude/ops-ai-triage`（文件改動）；排程任務在雲端環境建立，不在 git |
| A 建排程任務 | 用本 repo 雲端環境的排程功能建一個「每次觸發開新 session」的任務：台北每日早上（避開整點，例如 08:47）；prompt 只說「今天是 {日期}，依 `docs/operations.md` §6 執行分診並寄日報；星期一加週報、每月 1 日加月報」；connectors 只給 GitHub、Supabase、Gmail | 任務存在、下次觸發時間正確 |
| B 首跑驗證 | 手動觸發一次，在有人看時跑：不卡權限提示；能讀 Actions run、issues、advisors、`query_logs`、附錄 A 的 SQL；能寄出 Email；禁止清單確實沒被觸碰 | 收到第一封日報，格式符合 §6.3 |
| C 附錄 A 補完 | 用 `select distinct` 探勘 `function_edge_logs` 的狀態碼鍵名，把 5xx 查詢寫回附錄 A | 查得出數字 |
| D 校準兩週 | 每日記錄誤報與漏報，調整 §6 的判定措辭；兩週後產出一行結論寫進本檔 | 誤報率可接受（業主判） |
| E 桌上演練 | 把 R1 到 R12 每條在 develop 環境或紙上走一次：連結是否存在、Dashboard 路徑是否正確、缺的步驟補上 | operations.md 每條 runbook 至少被一個人走過 |
| F 日報缺席告警 | 監控服務加一個 heartbeat：日報寄出後由 session 打一次 heartbeat URL（Secret 由業主在排程環境提供）；36 小時沒收到即 P2 | 停一次任務會收到通知 |

### ③ Supabase 安全與資料層強化（Opus）

| 項 | 內容 | 驗收 |
|---|---|---|
| 狀態 | ⬜ 未開工 | 分支 `fix/supabase-hardening`；每條 migration 檔頭寫「為什麼」；改金流函數前讀對應 migration 檔頭 |
| A search_path | 6 支函數補 `set search_path = public`：`compute_subscription_period`、`payuni_paid_at`、`tw_day`、`tw_end_of_day`、`tw_start_of_day`、`track_referred_by_change` | security advisor 該項歸零 |
| B anon 可呼叫的 SECURITY DEFINER | 逐支判定 `effective_registration_step`、`has_active_subscription`、`validate_referral_code`：前端目前只用 `.from()`、沒有 `.rpc()`，三支都由 Edge Function 以 service_role 呼叫；但 `has_active_subscription` 可能被 `public_listings` view 引用，先查 view 定義與 security invoker 設定再決定。能 revoke 的 revoke from anon／authenticated／public；不能的在測試釘住理由 | advisor 該項歸零或逐條記為刻意（`is_admin` 的 authenticated EXECUTE 是 `20260914000003` 刻意宣告；`referral_tree` 內部有授權檢查） |
| C RLS initplan | 14 條 policy 的 `auth.uid()` 改 `(select auth.uid())`。**`rls-policies.test.ts` 釘著 `listings` 五條 policy 的條件 golden，改表達式必須同 PR 更新 golden**（突變驗證：改寬條件仍要紅） | performance advisor 該項歸零；api-tests 綠 |
| D 外鍵索引 | 9 個無索引外鍵補索引（小表，一支 migration） | advisor 該項歸零 |
| E `system_alerts` error 推播 | migration：`system_alerts` 加 `notified_at timestamptz` 與部分索引；Edge：`POST /internal/system-alerts/pending-notify`（`x-internal-secret` 同 `RECONCILE_SECRET`，回傳並標記未通知的 error 列，欄位只含 id、source、message、created_at、context 的非個資鍵）；`reconcile-payments.yml` 加一個 step 每小時呼叫並透過 ① 的 notify action 推 P1。Deno db 測試一支 | 插入一筆 error 告警，下一輪收到 LINE |
| F 對帳 heal pass 靜默失敗 | friction-log 2026-08-17 記債 1：`complete_paid_pending_orders` RPC 失敗時端點仍回 `success: true`。改為回報失敗並寫告警，`reconcile-payments.yml` 的回應斷言跟著收緊；測試用 revoke 做 fault injection | 排程在 heal 失敗時會紅並推播 |
| G 刪除帳號 SOP | 在 develop 演練「刪除一個已付款帳號」：盤點 FK 連帶（`profiles` cascade 到哪些表、`auth.users` 刪除的行為、Storage 檔案），寫成可複製的步驟與 SQL 填入 operations.md R12 該列 | develop 上演練成功且零殘留 |
| H Dashboard 設定 | 以 checklist 形式寫進 `supabase-setup-checklist.md`（兩環境各做）：leaked password protection、SSL enforcement、Auth 連線策略改百分比、org MFA 強制、Network restrictions 評估結論 | 業主在 Dashboard 逐項勾完 |
| I 舊資源 | `supabase-setup-checklist.md` 附錄的舊 KV 表與舊 `auth.users` 帳號：先 dry-run 統計筆數報給業主，業主裁決後才執行，執行前先確認當日備份存在 | 業主裁決記錄在本檔 §4 |

### ④ 備份還原演練與金流切換演練（Opus）

| 項 | 內容 | 驗收 |
|---|---|---|
| 狀態 | ⬜ 未開工 | 分支 `claude/ops-drills`（文件與腳本）；所有演練在 develop 或拋棄式分支，不碰正式站資料 |
| A 還原演練 | 依 operations.md §8.2 走一次：取正式站最近一次每日備份 → 還原到拋棄式分支或本機 Postgres → 筆數與餘額合計比對 → `rls-policies.test.ts` → 記錄耗時與踩坑填回 §8.2 | §8.2 的「待填」變成實測數字 |
| B Storage 備份決策 | 三個選項給業主：(1) 只備份證件照與簽名到 Cloudflare R2（每週，S3 相容端點，憑證最小權限，R2 預設靜態加密）；(2) 全部 bucket 都備；(3) 接受風險並記錄。含還原方式 | 業主裁決；落地後 §8.3 填完 |
| C 金流切換演練 | 在 develop 以 sandbox 從頭刷到尾一次（手動 dispatch `journey-scheduled.yml` scope=skeleton、payment_mode=sandbox）；逐項核對 R0 的步驟與 checklist 步驟 1、3、5、6 的現況；整理「上線日 60 分鐘腳本」寫進本檔 §3 | journey skeleton 綠；R0 無「待確認」 |
| D 密鑰輪替演練 | 以 `MEMBER_TOKEN_SECRET` 在 develop 演練 R7 一次（影響最小），修正 R7 表格的步驟；填 operations.md §9.2 的「上次輪替」 | `/health` 的 `memberTokenConfigured` 仍為 true，驗證碼流程正常 |
| E 事故回顧 | 把 friction-log 裡 2026-07-26、08-07、08-17、10-07 四次線上事故對照 operations.md 的 runbook：每一次如果當時有這份手冊，第幾分鐘會被哪條抓到；抓不到的補 runbook 或補訊號 | 四次都有對應條目 |

## 3. 上線切換清單（切真金流前逐項為真）

- [ ] ①-A 外部監控三個都在線，推播實測過一次
- [ ] ①-B／C／D LINE 與 Email 通知接上所有 P1 來源；heartbeat 實測過一次
- [ ] ①-E 陳舊 issue 清零；①-G 機械把關綠
- [ ] ② AI 日報連續跑滿兩週、業主每天讀過、誤報可接受
- [ ] ③-A 到 D advisor 的 security WARN 歸零或逐條記為刻意；③-E error 推播實測；③-F heal pass 修正合併
- [ ] ③-H Dashboard 設定兩環境逐項勾完；③-I 舊資源有裁決
- [ ] ④-A 還原演練完成，RTO 寫進 §8.2；④-B Storage 有裁決並落地或記錄接受風險
- [ ] ④-C R0 演練完成；PayUni 正式端點是否擋海外已有答案與對會員的說法
- [ ] 業主手動（§5）：五個供應商 2FA、網域自動續約、密碼管理器與緊急存取、三個狀態頁訂閱
- [ ] 正式站：第一位管理員已就位（checklist 步驟 7）；預設推薦人 `/health` 回 `ok`（若啟用）
- [ ] 法務文本：業主確認服務條款、事業手冊、參加契約書、推廣獎勵規章為最終版
- [ ] UI/UX 重設計 S7 合併、驗收站 2 到 4 通過（`platform-uiux-redesign/progress.md`）
- [ ] 上線日 60 分鐘腳本（④-C 產出）印出來放手邊

## 4. 業主裁決紀錄（施工期間新增的決定記在這裡）

| 日期 | 題目 | 裁決 |
|---|---|---|
| 2026-10-16 | §0 全部 | 見 §0 |

## 5. 業主手動清單（不是程式，沒人能代做）

- [ ] GitHub、Supabase（含 org 層 MFA 強制）、Cloudflare、Google Workspace、PayUni 後台：2FA 全開
- [ ] 網域註冊商：自動續約開、到期日與 Supabase 帳單卡片到期日進行事曆
- [ ] 密碼管理器收齊 operations.md §2.2 全部帳號；設一位緊急聯絡人的緊急存取
- [ ] 訂閱 Supabase、Cloudflare、Google Workspace 狀態頁的 Email 通知
- [ ] 向 PayUni 確認正式端點對海外來源的封鎖政策，決定對會員的說法（R3 第三列）
- [ ] 確認法務文本為最終版（§0）
- [ ] 提供給 ①：Better Stack 或 UptimeRobot 帳號、LINE Developers 帳號、`admin@uknow.com.tw` 的 SMTP 應用程式密碼（只給告警用，與 Supabase SMTP 那把分開）

## 6. 上線後 30 天與 90 天

| 時間 | 項 | 說明 |
|---|---|---|
| 30 天 | 前端錯誤回報 | `ErrorBoundary` 與 `lazyWithRetry` 的最終失敗 POST 到 `/client-errors`，寫入 `system_alerts`（warning、去重、不含個資）。目前白屏原因無從得知 |
| 30 天 | 流量基線 | Cloudflare Web Analytics（免費、無 cookie）或等價物，給 SLI 一個分母 |
| 30 天 | AI 自主度升級評估 | 校準期數據夠了再決定是否讓 Dependabot patch／minor 在 CI 綠時自動合進 develop |
| 90 天 | Network restrictions | 正式站資料庫直連限制；先確認還原演練與 CI 不依賴直連 |
| 90 天 | unused index | 以 60 天真實流量重看 advisor，再決定刪 |
| 90 天 | PITR 評估 | 付費會員數與每日交易筆數對照 §0 的門檻 |
| 90 天 | 框架債 | `tdd-unlock.sh` 的 Deno 缺口（friction-log 2026-08-17）；對帳 `success: true` 契約若 ③-F 未全修完 |

## 7. 開工 prompt（複製整段貼進新 session）

### ① Sonnet

```
讀 CLAUDE.md、docs/operations.md 的導航表與 §3、docs/plans/launch-readiness/plan.md §2 的 ①。
目標：把 §2 ① 的 A 到 H 做完。A 與 B 需要我在服務後台操作，請先列出你要我提供的東西
（帳號、token、URL）與每一步的畫面路徑，等我給齊再動 C 之後的程式。
分支 fix/ops-alert-routing 從 origin/develop 切。先用 Plan Mode 給我規劃（含 notify action 的
介面、每個 workflow 接法、check-workflows.py 新規則的正反案例），我核准後再寫。
改 workflow 後跑 python3 scripts/check-workflows.py；npm run check 綠才 push；PR 用範本、draft。
收工更新 plan.md ① 的狀態欄與 operations.md §3.2 的「現在」欄。有需要我決策的事，一律用互動式
選項列出題目、選項、說明與你的建議。
```

### ② Sonnet

```
讀 CLAUDE.md、docs/operations.md §6 與附錄 A、docs/plans/launch-readiness/plan.md §2 的 ②。
目標：建立每日 AI 維運排程任務（本雲端環境的排程功能，每次觸發開新 session，台北早上避開整點），
prompt 只引用 operations.md §6，connectors 只給 GitHub、Supabase、Gmail；然後手動觸發首跑並
依 B 的驗收逐項確認。C 用 Supabase MCP 的 query_logs 探勘狀態碼鍵名後把 5xx 查詢寫回附錄 A。
E 把 R1 到 R12 每條在 develop 環境走一次，修正不準確處。文件改動走分支 claude/ops-ai-triage，
PR draft。有需要我決策的事，一律用互動式選項列出題目、選項、說明與你的建議。
```

### ③ Opus

```
讀 CLAUDE.md、supabase/README.md、.claude/rules/supabase-functions.md、docs/operations.md §3.3 與 R12、
docs/plans/launch-readiness/plan.md §2 的 ③。
目標：A 到 I。先用 Supabase MCP 的 get_advisors 取正式站 security 與 performance 現況，再用
Plan Mode 給我規劃：每支 migration 的內容與檔頭理由、B 的逐支判定、C 對 rls-policies.test.ts
golden 的影響與突變驗證方式、E 的端點契約與測試、F 的 fault injection 做法。我核准後再寫。
金流相關函數改動前先讀對應 migration 檔頭。分支 fix/supabase-hardening 從 origin/develop 切；
rebase 後跑 python3 scripts/check-migration-versions.py；npm run check 與 deno 閘門綠才 push；
PR 用範本、draft。I 只做 dry-run 統計並向我報告，不執行刪除。
有需要我決策的事，一律用互動式選項列出題目、選項、說明與你的建議。
```

### ④ Opus

```
讀 CLAUDE.md、docs/operations.md §7 R0、R7、§8、docs/plans/launch-readiness/plan.md §2 的 ④。
目標：A 到 E。所有演練只碰 develop 或拋棄式分支，不碰正式站資料；需要我在 Dashboard 操作的步驟
先列出來等我做。A 做完把實測 RTO 與踩坑寫回 operations.md §8.2；B 用互動式選項給我三個選項與
你的建議；C 手動 dispatch journey-scheduled（scope=skeleton、payment_mode=sandbox）後整理
「上線日 60 分鐘腳本」寫進 plan.md §3 下方；D 在 develop 輪替 MEMBER_TOKEN_SECRET 並修正 R7；
E 對照四次事故補 runbook。分支 claude/ops-drills，PR draft。
有需要我決策的事，一律用互動式選項列出題目、選項、說明與你的建議。
```
