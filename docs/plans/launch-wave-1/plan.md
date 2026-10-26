# 第 1 波：正式上線（2026-10-27）與大量註冊前窗口（10/27–10/28）

<!-- plans-keep: 跨 session 鷹架（主／執行／審查三種 session 的共同事實來源）；退場條件＝第 1 波審查 session 結案（10/31 凍結期結束、審查報告回填 §8）後，值得長留的升級進 docs/operations.md／規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的主 session**看：它開局只有 repo 與這份檔，沒有對話記憶。所有裁決都在 §0，
所有事實都附來源；行號一律現算（引用的行號是 2026-10-27 develop `ea777f0` 之前的）。

## 0. 業主目標與裁決（2026-10-27 00:30–02:00 台北，監工 session 核對）

**六個目標**

1. 階段性收尾 → 晉升 develop→main → 清空正式站資料 → **10/27 12:00 開放正式註冊收費**。
2. 10/27 中午到 10/28：盡量把重要功能上去，減少 10/29–10/31 大量註冊後的劇烈變動。
3. 接著排維運、資安計畫；之後每週固定晉升一次。
4. 為 10/29–10/31 的大量註冊做評估與衡量。
5. 分工盡量平行展開；**衝突由主 session 自行修正**（這句就是主 session push 他人分支做 rebase／解衝突的授權）。
6. **每一波更新三種 session**：新的主 session 做規劃與監工、執行 session 分工施工、獨立審查 session 審該波全部變動。主 session 不跨波。

**八題裁決（AskUserQuestion，2026-10-27 01:50–02:00）**

| # | 題 | 裁決 |
|---|---|---|
| 1 | 12:00 與 R2 的關係 | **12:00 必須含 R2（Email 邀請）開啟**；R2 沒好就把開放時間往後延。被推翻的建議：分段上線（12:00 先用現有推薦方式）。 |
| 2 | 部署通道壞掉（ECR 匿名拉映像限流） | **改 workflow 不經 Docker**（`--use-api`）——PR #402，本波第一個要合的 PR。 |
| 3 | 清資料範圍 | **全清含管理員**：全部會員、訂單、上傳照片、刊登、管理員與平台預設推薦人帳號都刪；之後業主重新註冊、以正式金流付 NT$1,200 成為第一個付款帳號拿到 8048876、設 `default_referrer_code`、`set-self-admin`。 |
| 4 | PayUni 正式金流 | **晉升後切換**（`PAYUNI_SANDBOX=false`＋正式三把憑證＋重部署），**從台灣網路真付款一次**驗通；同時出小 PR 把 `EXPECT_PRODUCTION_PAYUNI` 改 `'true'`（順序：secrets 先翻，PR 後合）。 |
| 5 | 10/27–10/28 窗口功能 | **照建議排**：T1 登入不閃（R2 合併後才開，共檔 AuthPage）、P1a 照片裁切、R1a-2 og＋lang、issue #395 PayUni 靜默 expired 改告警、寄信失敗告警、告警送到人（LINE／Email）。S7b、L1-1、P1b 排 10/31 後。 |
| 6 | 誰清資料 | **新主 session 用 Supabase MCP 執行**：先在 develop 分支 DB 演練，再對正式站乾跑列計數、互動問題給業主確認後才刪。前提：業主先在 Dashboard 確認有備份（Backups／PITR）。 |
| 7 | 10/29–31 預估量 | **100–500 人，部分在活動現場**（同一 Wi-Fi 共用 IP）→ 放寬 check-email 每 IP 限流、確認寄信上限、排現場尖峰小時的監看。 |
| 8 | 凍結規則 | **10/29–10/31 凍結，只許 hotfix**：不上新功能、不上 migration、不動註冊／付款／登入主幹；hotfix 走晉升＋業主核准。每週晉升從 11/3 起。 |

較早的裁決仍有效：服務條款／參加契約／事業手冊／推廣獎勵規章已律師定案不可改；使用者可見文案一律「推薦人」；
admin 提領資料含未遮罩身分證與銀行帳號，任何快取不得持久化；R2 的 A～T 裁決見 `docs/plans/referral-email-invite/plan.md` 附錄 C。

## 1. 時間事實與關鍵路徑

- 核對時刻：2026-10-27 02:00 台北（UTC 18:00 10/26）。業主所在時區 UTC+2（commit 時區），台北 12:00 ＝ 巴黎 06:00。
- main `67a27ec6`（2026-10-06）→ develop `ea777f0`：20 個 PR、204 commits、**5 支 migration**（`20261017000001` pg_cron＋prune_rate_limits、`000002` validate_referral_code 收權、`000003` profiles 自改收權、`000004` register_profile 列鎖、`20261025000001` find_auth_user_by_email）。R2 後端（PR #399）再加兩支（`20261025000011` purge、`000012` refund）。
- 晉升 PR 的 journey-full 是 30–90 分鐘（最近一次 sandbox full 成功 23 分鐘，2026-10-17）；正式站部署需業主在 GitHub `production` 環境核准；migration 由 Supabase GitHub 整合在 push main 時自動套用（部署前先確認整合仍連著——repo 無紀錄）。

**關鍵路徑（串行，全部順利的估計）**

| 步 | 誰 | 估時 | 內容 |
|---|---|---|---|
| K1 | 業主 | 5 分 | 回答 R2 session（`session_015dFtMVsyqYU5gijDBa6yCp`）卡住的問題（中間層 429 無錯誤碼：建議「不改」）；合併 PR #402；看 develop 的 deploy run「部署 Edge Function」step 綠 |
| K2 | R2 後端 session | 1 小時 | `npm run check:full` → `/review-implementation` → #399 轉 ready → 業主合併 |
| K3 | 執行 session（R2 前端） | 3–4 小時 | 循環 6–11（見 `docs/plans/referral-email-invite/progress.md`）＋ R2-3a UI 步驟 → PR → 審查 → 合併 |
| K4 | 主 session | 0.5 小時＋journey 0.5–1.5 小時 | 開晉升 PR（develop→main）；journey-full 綠；業主以 merge commit 合併 |
| K5 | 業主 | 0.5 小時 | 核准 production 部署；`/health` 的 `sha` 對上；Dashboard 翻 PayUni 正式＋R2 的兩把 secret＋貼 Invite 模板＋Cloudflare 旗標；重部署 |
| K6 | 主 session＋業主 | 0.5 小時 | 清資料：乾跑 → 業主確認 → 執行 → 零殘留檢查 |
| K7 | 業主（台灣網路） | 0.5 小時 | 註冊第一個帳號、真付款 NT$1,200、拿到 8048876、`set-self-admin`、用自己第二個信箱測 Email 邀請全程 |
| K8 | 業主 | — | 宣布開放 |

**誠實的估計**：K1 起算 7–9 小時，對應台北 09:00–11:00 是最早的可開放時間，**沒有緩衝**；任何一步紅（journey-full 第一次在 hosted 跑 #390／#394 的後端、`--use-api` 對 `_shared` import 的相容性、R2 正式站實寄）都會讓 12:00 往後。業主裁決 1 已接受「R2 沒好就延」。主 session 每小時在本檔 §8 記一列進度，延誤超過 2 小時就用互動問題給業主新的開放時間。

## 2. 三種 session（目標 6 的落地）

| 角色 | 職責 | 不做 | 交接物 |
|---|---|---|---|
| **主 session**（每波一個，開局 prompt 在 `dispatch-prompts.md` §A） | 讀本檔；派工（寫執行 prompt）；監工各 PR（CI、審查、裁決收集、PR 留言）；**rebase 與解衝突**（可 push 任何執行分支，裁決 5）；開晉升 PR；清資料（裁決 6）；維護本檔 §8 與總綱 §8.1；波結束時開審查 session、收審查報告、刪鷹架 | 不自己寫產品程式碼（例外：≤10 行的 CI／文件修補）；不跨波 | 本檔、`dispatch-prompts.md`、各 PR 留言、總綱 §13 一列 |
| **執行 session**（一工項一個） | 照 prompt 施工：`/fix-bug`／Plan Mode／`/tdd-implement`；自己的 PR 自己推到 CI 綠；回報主 session（PR 號、偏離、未驗項） | 不改別人分支；不裁決（問主 session 或業主） | PR（內文照 `.github/pull_request_template.md`） |
| **審查 session**（每波一個，prompt 在 §C） | 波結束（凍結期結束）後審「本波合進 main 的全部變動」：四視角＋事實核對＋上線後 system_alerts／issue 盤點；報告寫 `docs/plans/launch-wave-1/review.md` | 不改碼；P0 回主 session 開 hotfix | `review.md`；升級進 friction-log 的原則 |

規矩本體寫在 CLAUDE.md「開發流程細節」與 `docs/README.md`〈慣例〉（本波一併落檔）。
主 session 開局必讀：本檔、`docs/plans/platform-growth-and-trust/plan.md` §0／§8、`docs/plans/referral-email-invite/{plan,progress}.md`、`docs/supabase-setup-checklist.md`、`CLAUDE.md`。

## 3. 工作分解與平行度

### 3.1 上線前（K1–K7，串行為主）

| Lane | 工項 | session | 分支／PR | 狀態 2026-10-27 02:00 |
|---|---|---|---|---|
| A | 部署改 `--use-api` | 監工 session（已做） | PR #402 | 待業主合併；合併後第一個 develop push 的 deploy run 是證據 |
| B | R2 後端 | `session_015dFtMVsyqYU5gijDBa6yCp`（Opus） | `claude/referral-email-invite-vygu7r`，PR #399 draft | 循環 1–5＋R2-3a API 版綠；卡在等業主回答 |
| C | R2 前端循環 6–11＋R2-3a UI 步驟 | 新執行 session（**建議 Opus**：時間緊、動 AuthPage 主幹；業主先前裁 Sonnet，由主 session 再問一次） | #399 合併後從 develop 切；prompt §B | 未開始 |
| D | 清資料腳本（乾跑→確認→執行） | 主 session 自己（Supabase MCP） | 不進產品碼；腳本與乾跑結果記本檔 §4 | 未開始；§4 是規格 |
| E | 晉升 PR | 主 session | develop→main | 等 B、C 合併 |
| F | 業主正式站操作 | 業主 | — | §7 清單 |

### 3.2 窗口（10/27 開放後 → 10/28 24:00，平行）

| 工項 | 流程／模型 | 動到 | 撞檔與順序 | 風險 |
|---|---|---|---|---|
| **R1a-2** og 預覽＋`lang` | Plan Mode `fix/*`，Sonnet | `index.html` 一檔＋vitest 讀檔 | 零撞檔，**最先開** | none |
| **寄信失敗告警** | Plan Mode `fix/*`，Sonnet | `index.ts` system_alerts 來源 | 與 #395 同檔不同區段；排在 #395 後或同一 PR | low |
| **issue #395** PayUni 查詢層非 SUCCESS 告警、expired 前先告警 | Plan Mode `fix/*`，**Opus**（金流相鄰） | `index.ts` `queryPayUniTradeStatus`、reconcile 迴圈；`reconcile-payments.yml` | 等 #399 合併後切（同檔） | medium |
| **告警送到人** | 輕量 Plan Mode，Sonnet；重用 PR #379 的 `.github/actions/notify` 設計（LINE push＋Gmail SMTP） | `deploy-supabase.yml`、`reconcile-payments.yml`、`deploy-smoke.yml`、新 composite action | 與 #402 同檔但 #402 先合 | low |
| **容量 hotfix** | Plan Mode `fix/*`，Sonnet | `index.ts` `CHECK_EMAIL_RATE_MAX` 10→**60**／5 分（現場共用 IP）；`check-spec-drift` 常數；規格書 §4.1 | 同檔 index.ts，小段 | low |
| **P1a** 照片裁切管線 | 三段式 `feature/listing-photo-pipeline`，Sonnet（規劃在總綱 §3.2A／C） | `EditServiceProvider`、新 `imagePipeline.ts`、`index.ts` DELETE /listings/photos | 與其他項不撞；最大的一項，**10/27 開放後立刻開** | low |
| **T1** 登入狀態信任（不閃、暫時故障不登出） | 三段式 `feature/auth-state-trust`，**Opus 規劃**（總綱 §1） | `App.tsx`、`AuthPage.tsx`、`apiClient.ts`、`Navbar`、`BottomNav` | **R2 前端合併後才切分支**；與 P1a 不撞 | high：若 10/28 24:00 前沒綠，**不上**，留到 11/3 |

每項開工前主 session 先查 `docs/plans/platform-growth-and-trust/plan.md` §8.2 撞檔矩陣；同檔者串行、不同檔者平行。衝突時主 session 自己 rebase（`git fetch origin develop && git rebase origin/develop && git push --force-with-lease`），解不開的才問執行 session。

### 3.3 10/29–10/31 凍結（裁決 8）

只許 hotfix：營運中發現、定義明確、不動註冊／付款／登入主幹、無 migration；每個 hotfix 都走晉升 PR＋業主核准。
窗口內沒做完的（T1、S7b、L1-1、P1b、A1a…）全部等 11/3 的第 2 波。

## 4. 清資料 SOP（裁決 3、6）

**原則**：先乾跑列計數、業主確認後才刪；刪的順序照 `e2e/journey/tools/cleanup.py`（先 Storage 物件，再 `auth.users` 讓業務表 cascade）；全程用 Supabase MCP `execute_sql` 對正式專案 `uhtwwxtazwqnlbejhprl`（Storage 物件走 `storage.objects` 的 SQL 刪除；物件實體由 Storage 的 GC 回收，若 MCP 無法刪實體則請業主在 Dashboard 清 bucket）。

**前提（業主）**：Dashboard → Project Settings → Database → Backups 確認今天有可還原的備份（或 PITR 開著），截圖回報。沒有備份不執行。

**演練**：先對 develop 分支 `ijcxnxhrziehdtkwausy` 跑一次同樣的腳本（develop 的測試資料可清；R2-0 spike 若仍在用 develop，先問 session D 狀態）。

**乾跑（唯讀）**：

```sql
select 'auth.users' t, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'profiles.is_admin', count(*) from public.profiles where is_admin
union all select 'listings', count(*) from public.listings
union all select 'payment_orders', count(*) from public.payment_orders
union all select 'payment_orders.completed', count(*) from public.payment_orders where status='completed'
union all select 'subscriptions', count(*) from public.subscriptions
union all select 'withdrawals', count(*) from public.withdrawals
union all select 'withdrawal_events.bank_ref', count(*) from public.withdrawal_events where bank_ref is not null
union all select 'reward_transactions', count(*) from public.reward_transactions
union all select 'referral_codes', count(*) from public.referral_codes
union all select 'referral_edges', count(*) from public.referral_edges
union all select 'system_alerts', count(*) from public.system_alerts
union all select 'announcements', count(*) from public.announcements
union all select 'rate_limits', count(*) from public.rate_limits
union all select 'member_verify_logs', count(*) from public.member_verify_logs
union all select 'auth.audit_log_entries', count(*) from auth.audit_log_entries
union all select 'storage.objects:'||bucket_id, count(*) from storage.objects group by bucket_id;
select last_value, is_called from public.referral_code_seq;
select default_referrer_code from public.reward_config;
```

把結果整段貼進互動問題給業主確認（特別標出：`withdrawal_events.bank_ref` 非 0 代表曾有真匯款；`payment_orders.completed` 若有 `PAYUNI_SANDBOX=false` 期間的單代表真錢——目前證據是正式站一直 sandbox，PR #372）。

**執行（業主確認後，一個交易一段，避開每小時 :00 的 reconcile 與 :17 的 prune）**：

```sql
begin;
delete from storage.objects where bucket_id in ('id-cards','referral-signatures','make-5c6718b9-listings-photos');
delete from auth.users;                      -- profiles 與全部業務表 cascade（20260620000001:20 起）
delete from auth.audit_log_entries;          -- 含 email，無 cascade，個資清理
delete from public.system_alerts;
delete from public.rate_limits;
delete from public.member_verify_logs;
delete from public.announcements;            -- 業主若有上線公告要留，先問
alter sequence public.referral_code_seq restart with 8048876;   -- 只有整批清空才允許（checklist:487-493）
commit;
```

不碰：`public.reward_config`（單列；`default_referrer_code` 維持 `'8048876'`，業主付款後自動對上）、`storage.buckets` 列、`cron.job`、`supabase_migrations.schema_migrations`。

**零殘留檢查**：再跑一次乾跑，除 `reward_config` 外全部為 0；`select last_value, is_called from public.referral_code_seq` 應為 `8048876, false`。

**之後（業主，§7 第 9–10 步）**：註冊 → 真付款 → `/health` 的 `defaultReferrer` 應為 `ok`（第一個付款帳號拿到 8048876 且與 `reward_config` 相符）→ `POST /admin-setup/set-self-admin`。

## 5. 10/29–10/31 評估與衡量（目標 4，裁決 7）

**容量事實（來源：掃描 2026-10-27）**

| 環節 | 上限 | 100–500 人、部分現場的判斷 |
|---|---|---|
| 驗證碼信 | Supabase Auth 寄信 300 封／小時（文件值，Dashboard 現值待業主讀）；Google Workspace 2,000 封／日 | 尖峰小時 100 人註冊約 150 封（含重寄）：300／小時夠但緊，**業主在 Dashboard 調到 600／小時**；2,000／日夠（單日最多約 750 封）。relay 不必先換，備案在 checklist:330-334 |
| `/auth/check-email` | 每 IP 10 次／5 分鐘，IP 取 `cf-connecting-ip`→`x-forwarded-for`→`unknown` 共用桶 | 現場同一 Wi-Fi 第 11 人起被 429 → **窗口 hotfix 改 60／5 分**；主 session 先在 develop 驗 Supabase edge 到底給不給 `cf-connecting-ip`（打一次 check-email、看 log），若兩個 header 都沒有就是全站共用 `unknown` 桶，必須改 |
| 推薦碼驗證 | 每人 10 次／5 分、50 次／日 | 夠 |
| 結帳頁輪詢 `/profile` | 每 5 秒一次、不收斂 | 50 人同時停在結帳頁 ＝ 10 req/s 的 6 查詢端點；可接受，不改（T1 會收斂） |
| PayUni | 正式端點是否擋海外來源未確認；NotifyURL 必須打得到 `*.supabase.co` | 台灣真付款驗證（裁決 4）同時驗這兩點 |
| 對帳排程 | GitHub cron 名義每小時、實測中位 1.7 小時；批次 50 | 夠；#395 上去後靜默 expired 會變告警 |

**量測（主 session 在 10/28 前準備成一支 SQL 檔放 scratchpad，10/29–31 每 2 小時跑一次，結果記本檔 §8）**

1. 每小時註冊漏斗：`auth.users` 依 `date_trunc('hour', created_at)` 的 建立數／`email_confirmed_at` 非空數（完成率 <80% 或整點斷崖 ＝ 寄信額度）。
2. 重寄比：`confirmation_sent_at` 更新次數無法直讀，改看 Auth logs 的 send 事件數／註冊數，>1.3 代表送達問題。
3. 步驟分布：`profiles` 依 `effective_registration_step`（1 填資料前／2 未付款／3 已付款）。
4. 訂單：`payment_orders` 每小時各狀態數；`pending` 且無 `payuni_response` 超過 20 分鐘的數；`pending` 且 `payuni_response->>'Status'='SUCCESS'` 的數（目標 0）。
5. `system_alerts` 未解決數依 source／severity。
6. 限流壓力：`rate_limits` 中 `key like 'check-email:%'` 且 `count >= 上限` 的列數、`check-email:unknown` 的 count。
7. `/health` 每次都看：`ok`、`sha`、`payuniMode=production`、`defaultReferrer=ok`。
8. 客服回報分類計數：沒收到驗證碼／付了未開通／推薦碼無效／請求過於頻繁。

**監看分工**：告警送到人（窗口工項）上去前，業主每 2 小時看 `/admin` 的系統告警與 GitHub issues；上去後由 LINE 推播。

## 6. 第 2 波起：維運與資安（目標 3）

每週晉升：週一台北 10:00 開晉升 PR、journey-full 綠、業主核准（11/3 起）。第 2 波主 session 從這張表挑（大小是掃描估計）：

| 項 | 大小 | 內容 |
|---|---|---|
| PR #379 launch-readiness ①–④ | 中 | 告警到人（本波先做最小版）、每日 AI 維運任務＋runbook、Supabase 安全強化（search_path、revoke、索引）、備份還原演練與金流切換演練；分支落後 develop 117 commits，先 rebase 再分拆 |
| 備份／PITR 與日誌保留 | XS | 文件化方案層級、PITR、log drain；本波只要業主確認備份存在 |
| 安全標頭 | S | `public/_headers` 加 HSTS、X-Content-Type-Options、Referrer-Policy、frame-ancestors；CSP 另案 |
| 伺服器端密碼規則 | XS | Dashboard 最小長度 8＋外洩密碼檢查，記進 checklist |
| `handle_new_user` 不讀 metadata、`national_id` 唯一 | S–M | A1b-1b；先唯讀掃重複 |
| 私有 bucket 釘測試 | XS | Deno DB 測試斷言 `storage.buckets.public=false`、`storage.objects` 零 policy |
| Deno 相依掃描 | XS | security.yml 加一步 |
| 後台稽核軌跡 | M | A1b-2/3（總綱 §6） |
| 既有 issue 收斂 | XS | 14 張同標題部署失敗 issue、#288、#280、#279 一次清 |
| 窗口沒做完的 | — | T1、S7b、L1-1、P1b、A1a、A2 照總綱 §8 順序 |

## 7. 業主操作清單（按順序；每步做完回主 session 一句）

1. 回答 R2 session 卡住的問題（建議「不改」）。
2. 合併 PR #402（merge commit）；看之後第一個 develop deploy run 的「部署 Edge Function」綠。
3. 開新的主 session，貼 `dispatch-prompts.md` §A。
4. #399 轉 ready 後合併。
5. Supabase Dashboard（正式專案）：確認備份存在；Authentication → Rate Limits 的寄信上限調到 600／小時並記下現值；Authentication → Email Templates 貼 R2 的 Invite user 模板與主旨（`supabase/email-templates/referral-invite.html`，由 R2 前端 PR 產出）；Edge Function Secrets 加 `REFERRAL_INVITE_SECRET`（`openssl rand -hex 32`）、`REFERRAL_EMAIL_INVITE_ENABLED=true`。
6. Cloudflare Pages → uknow → Settings → Variables（**Production** 作用域）：`VITE_REFERRAL_EMAIL_INVITE=true`（晉升合併後的建置才會帶到）。
7. 晉升 PR 綠後以 merge commit 合併；到 Actions 核准 `production` 部署；`curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/api/health` 看 `sha` 對上。
8. Secrets 翻 PayUni 正式：`PAYUNI_SANDBOX=false`、`PAYUNI_MER_ID`／`PAYUNI_HASH_KEY`／`PAYUNI_HASH_IV`；確認 `FRONTEND_URL=https://uknow.com.tw`；Dashboard 重部署 `api`（或等主 session 的 `EXPECT_PRODUCTION_PAYUNI` PR 合進 develop 後再部署一次）；`/health` 的 `payuniMode=production`。PayUni 商店後台確認 NotifyURL／ReturnURL 網域。
9. 回答主 session 的清資料乾跑確認。
10. 清完後：從台灣網路註冊第一個帳號、真付款 NT$1,200、`/health` 的 `defaultReferrer=ok`、`POST /admin-setup/set-self-admin`（checklist 步驟 7）、用第二個信箱走一次 Email 邀請（收信、點連結、設密碼、完善資料頁帶推薦碼）。
11. 宣布開放。之後每 2 小時看一次 `/admin` 系統告警與 GitHub issues，直到告警送到人上線。

## 8. 進度與異動紀錄（主 session 每小時一列）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 10/27 02:00 | 監工 session 完成目標核對（§0）、掃描、PR #402；本檔與 `dispatch-prompts.md` 落檔 | 業主做 §7 第 1–3 步 |
