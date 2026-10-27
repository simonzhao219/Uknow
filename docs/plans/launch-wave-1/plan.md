# 第 1 波：正式上線（2026-10-27）與大量註冊前窗口（10/27–10/28）

<!-- plans-keep: 跨 session 鷹架（主／執行／審查三種 session 的共同事實來源）；退場條件＝第 1 波審查 session 結案（10/31 凍結期結束、審查報告回填 §8）後，值得長留的升級進 docs/operations.md／規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的主 session**看：它開局只有 repo 與這份檔，沒有對話記憶。所有裁決都在 §0，
所有事實都附來源；行號一律現算（引用的行號是 2026-10-27 develop `b861133`（#398）時的）。

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
| 1 | 12:00 與 R2 的關係 | **12:00 必須含 R2（Email 邀請）開啟**；R2 沒好就把開放時間往後延。被推翻的建議：分段上線（12:00 先用現有推薦方式）。R2 規劃書 R2-3b 的順序仍有效（裁決 S：正式站後端先開、curl 收信核對通過才開前端旗標），只是全部壓縮到開放前；R2-3b 第 2–5 步（develop 側演練）略過，develop 的旗標與 secret 由窗口期補。 |
| 2 | 部署通道壞掉（ECR 匿名拉映像限流） | **改 workflow 不經 Docker**（`--use-api`）——PR #402，本波第一個要合的 PR。 |
| 3 | 清資料範圍 | **全清含管理員**：全部會員、訂單、上傳照片、刊登、管理員與平台預設推薦人帳號都刪；之後業主重新註冊、以正式金流付 NT$1,200 成為第一個付款帳號拿到 8048876、設 `default_referrer_code`、`set-self-admin`。 |
| 4 | PayUni 正式金流 | **晉升後切換**（`PAYUNI_SANDBOX=false`＋正式三把憑證＋重部署），**從台灣網路真付款一次**驗通；同時出小 PR 把 `EXPECT_PRODUCTION_PAYUNI` 改 `'true'`（順序：secrets 先翻，PR 後合）。 |
| 5 | 10/27–10/28 窗口功能 | **照建議排**：T1 登入不閃（R2 合併後才開，共檔 AuthPage）、P1a 照片裁切、R1a-2 og＋lang、issue #395 PayUni 靜默 expired 改告警、寄信失敗告警、告警送到人（LINE／Email）。S7b、L1-1、P1b 排 10/31 後。 |
| 6 | 誰清資料 | **新主 session 用 Supabase MCP 執行**：先在 develop 分支 DB 演練，再對正式站乾跑列計數、互動問題給業主確認後才刪。前提：業主先在 Dashboard 確認有備份（Backups／PITR）。 |
| 7 | 10/29–31 預估量 | **100–500 人，部分在活動現場**（同一 Wi-Fi 共用 IP）→ 放寬 check-email 每 IP 限流、確認寄信上限、排現場尖峰小時的監看。 |
| 8 | 凍結規則 | **10/29–10/31 凍結，只許 hotfix**：不上新功能、不上 migration、不動註冊／付款／登入主幹；hotfix 走晉升＋業主核准。每週晉升從 11/3 起。 |
| 9 | 夜間授權（業主 10/27 02:15–10:15 睡眠，無法回覆） | **主 session 可以**：審過後合併 PR 進 develop（#399、R2 前端、窗口小項）；開晉升 PR，journey-full 綠後以 merge commit 合進 main（migration 會自動套到正式站 DB；函式部署停在等業主核准，舊函式不呼叫新函式、視窗安全）；用 Claude Code Remote 的 `create_session` 自己開執行 session（繼承環境與 auto 權限模式）。**主 session 不做**：正式站部署核准、Dashboard secrets、PayUni 切換、清資料、付款——全部等業主醒來，§7 已拆成「睡前」與「醒來後」。 |

**主 session 追加裁決（AskUserQuestion，2026-10-27 14:15）**

| # | 題 | 裁決 |
|---|---|---|
| 10 | 12:00 錯過後的開放時間 | **今晚 23:00 前後**（被推翻的建議：10/28 12:00）。任何一步紅就自動順延到 10/28，主 session 在 §8 記並給新時間 |
| 11 | R2 前端模型 | **Opus** |
| 12 | 窗口工項派工時機 | **現在全派**：R1a-2、P1a（只規劃）、告警送到人先派；#399 合併後派容量 hotfix＋寄信失敗告警（合成一個 session）、#395。晉升 PR 合進 main 前一律不合進 develop |
| 13 | 10/29–31 量測排程 | **允許**主 session 建排程任務（每 2 小時、只在 10/29–31） |
| 14 | P1a 範圍（PR #404 規劃審出 P0：apiRequest 寫死 JSON Content-Type） | **拆兩個 PR，後端清理先上**：PR 1＝`DELETE /listings/photos`＋刪刊登走 Edge 清理；PR 2＝前端裁切管線（P0 選 a：apiRequest 遇 FormData 不設 header），趕不上 10/28 就留 11/3 |
| 15 | P1a Q-A 刪刊登清理 | **走後端**（總綱 §3.2C 原案） |
| 16 | 寄信失敗告警（盤點：後端無寄信路徑，攔 429 需新公開端點＋改 AuthPage 等三檔，與 R2／T1 共檔） | **本波不做程式**，靠 Dashboard 寄信上限 600＋§5 每小時漏斗監看；端點留第 2 波 |
| 17 | 清資料演練的刪除段（MCP 破壞性語句確認視窗到不了業主，兩次 cancelled） | **業主在 Dashboard SQL Editor 貼**（演練分支與今晚正式站都這樣做；主 session 負責乾跑與零殘留檢查） |
| 18 | P1a Q-D 裁切元件載入失敗 | **保守：顯示重試、不可送出**；Q3-3 無例外 |
| 19 | P1a Q-F 原檔上限 | **原檔 ≤20 MB、上傳檔 ≤5 MB**；規格書 §11 界定 5 MB 是上傳檔 |
| 20 | P1a Q-G 條款十之一 | **記入規格書已知落差，第 2 波在 30 日窗口內補齊**（帳號刪除 cascade、`/auth/cancel-signup`、歷史孤兒），列第 2 波必做 |
| 21 | PITR add-on | **先不開，第 2 波再評估**；每日 PHYSICAL 備份（UTC 22:44）已確認存在 |
| 22 | journey sandbox 紅（PayUni 測試站改版）後的開放時間 | **今晚繼續，開放改 00:00 前後**；晉升閘門暫走 webhook 備援（#413，規則 13 到期 11/03）；journey-full webhook 仍紅或真付款失敗就改明天 |
| 23 | 官方 icon 與 SEO／AEO／GEO（業主 19:55 提出） | **兩段**：基礎進窗口（favicon 全套、manifest、og-image 1200×630、品牌名統一「Uknow」、description／canonical、robots.txt＋sitemap.xml、私密頁 noindex、JSON-LD Organization／WebSite）目標 10/28 第二次晉升；進階（AEO：FAQ／服務者頁 JSON-LD；GEO：llms.txt、公開頁預渲染、服務者動態 sitemap）第 2 波三段式 |
| 24 | 站內 logo（業主 20:05 修正） | **需要正方形的地方用黑底白字 Uk**（favicon、手機捷徑、manifest、正方形縮圖）；**顯示全名的地方照舊**——業主確認目前網頁與手機頁的 logo 顯示正確，不動 |

較早的裁決仍有效：服務條款／參加契約／事業手冊／推廣獎勵規章已律師定案不可改；使用者可見文案一律「推薦人」；
admin 提領資料含未遮罩身分證與銀行帳號，任何快取不得持久化；R2 的 A～T 裁決見 `docs/plans/referral-email-invite/plan.md` 附錄 C。

## 1. 時間事實與關鍵路徑

- 核對時刻：2026-10-27 02:00 台北（UTC 18:00 10/26）。時程一律以台北時間寫。
- main `67a27ec6`（2026-10-06）→ develop `b861133`（#398；PR #402 head `ea777f0` 待合併，本檔隨 #402 進 develop）：20 個 PR、204 commits、**5 支 migration**（`20261017000001` pg_cron＋prune_rate_limits、`000002` validate_referral_code 收權、`000003` profiles 自改收權、`000004` register_profile 列鎖、`20261025000001` find_auth_user_by_email）。R2 後端（PR #399）再加兩支（`20261025000011` purge、`000012` refund）。
- 晉升 PR 的 journey-full 是 30–90 分鐘（最近一次 sandbox full 成功 23 分鐘，2026-10-17）；正式站部署需業主在 GitHub `production` 環境核准；migration 由 Supabase GitHub 整合在 push main 時自動套用（整合是否連著：用 Supabase MCP `list_branches` 看最新 PR 有沒有自動長出 preview branch，有就是連著；2026-10-26 的 PR 有）。

**關鍵路徑（串行，全部順利的估計）**

| 步 | 誰 | 估時 | 內容 |
|---|---|---|---|
| K1 | 業主 | 5 分 | 回答 R2 session（`session_015dFtMVsyqYU5gijDBa6yCp`）卡住的問題（中間層 429 無錯誤碼：建議「不改」）；合併 PR #402；看 develop 的 deploy run「部署 Edge Function」step 綠 |
| K2 | R2 後端 session | 1 小時 | `npm run check:full` → `/review-implementation` → #399 轉 ready → 業主合併 |
| K3 | 執行 session（R2 前端） | 3–4 小時 | 循環 6–11（見 `docs/plans/referral-email-invite/progress.md`）＋ R2-3a UI 步驟 → PR → 審查 → 合併 |
| K4 | 主 session | 0.5 小時＋journey 0.5–1.5 小時 | 開晉升 PR（develop→main）；journey-full 綠；業主以 merge commit 合併 |
| K5 | 業主 | 0.5 小時 | 核准 production 部署；`/health` 的 `sha` 對上；Dashboard 翻 PayUni 正式＋R2 的兩把 secret＋貼 Invite 模板；重部署；清三個 bucket（Cloudflare 旗標留到 K7 實寄核對後，裁決 S） |
| K6 | 主 session＋業主 | 0.5 小時 | 清資料：乾跑 → 業主確認 → 執行 → 零殘留檢查 |
| K7 | 業主（台灣網路） | 1 小時 | 註冊第一個帳號＋完善資料、`set-self-admin`、真付款 NT$1,200、拿到 8048876、加入推薦計畫、curl 實寄核對、開 Cloudflare 旗標並重建、UI 走一次邀請卡 |
| K8 | 業主 | — | 宣布開放 |

**誠實的估計**：K1 起算 7–9 小時；業主 02:15 睡到 10:15（裁決 9），夜裡主 session 把 K2–K4 做到「main 已合併、等核准」，業主醒來後做 K5–K7 約 1.5–2 小時，**最早台北 12:00 前後可開放**、沒有緩衝；任何一步紅（journey-full 第一次在 hosted 跑 #390／#394 的後端、`--use-api` 對 `_shared` import 的相容性、R2 正式站實寄）都會讓 12:00 往後。業主裁決 1 已接受「R2 沒好就延」。主 session 每小時在本檔 §8 記一列進度，延誤超過 2 小時就用互動問題給業主新的開放時間。

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
| **告警送到人** | 輕量 Plan Mode，Sonnet；**新建** `.github/actions/notify`（composite；設計見 PR #379 分支的 `docs/plans/launch-readiness/plan.md` C 列：LINE push＋Gmail SMTP，Secrets `LINE_CHANNEL_TOKEN`／`LINE_ALERT_TO`／`ALERT_SMTP_*`，目前 repo 沒有這個 action） | `deploy-supabase.yml`、`reconcile-payments.yml`、`deploy-smoke.yml`、新 composite action | 與 #402 同檔但 #402 先合 | low |
| **容量 hotfix** | Plan Mode `fix/*`，Sonnet | `index.ts` `CHECK_EMAIL_RATE_MAX` 10→**60**／5 分（現場共用 IP）＋ log 一行記下解析到的 IP 來源 header；**新增** `check-spec-drift` 規則與規格書 §4.1 一句（目前兩者都沒有這個限流值） | 同檔 index.ts，小段 | low |
| **P1a** 照片裁切管線 | 三段式 `feature/listing-photo-pipeline`，Sonnet（規劃在總綱 §3.2A／C） | `EditServiceProvider`、新 `imagePipeline.ts`、`index.ts` DELETE /listings/photos | 與其他項不撞；最大的一項，**10/27 開放後立刻開** | low |
| **T1** 登入狀態信任（不閃、暫時故障不登出） | 三段式 `feature/auth-state-trust`，**Opus 規劃**（總綱 §1） | `App.tsx`、`AuthPage.tsx`、`apiClient.ts`、`Navbar`、`BottomNav` | **R2 前端合併後才切分支**；與 P1a 不撞 | high：若 10/28 24:00 前沒綠，**不上**，留到 11/3 |

每項開工前主 session 先查 `docs/plans/platform-growth-and-trust/plan.md` §8.2 撞檔矩陣；同檔者串行、不同檔者平行。衝突時主 session 自己 rebase（`git fetch origin develop && git rebase origin/develop && git push --force-with-lease`），解不開的才問執行 session。

### 3.3 10/29–10/31 凍結（裁決 8）

只許 hotfix：營運中發現、定義明確、不動註冊／付款／登入主幹、無 migration；每個 hotfix 都走晉升 PR＋業主核准。
窗口內沒做完的（T1、S7b、L1-1、P1b、A1a…）全部等 11/3 的第 2 波。

## 4. 清資料 SOP（裁決 3、6）

**原則**：先乾跑列計數、業主確認後才刪；刪的順序照 `e2e/journey/tools/cleanup.py`（先 Storage 物件，再 `auth.users` 讓業務表 cascade）；DB 部分用 Supabase MCP `execute_sql` 對正式專案 `uhtwwxtazwqnlbejhprl`。**Storage 物件不能用 SQL 刪**（直接刪 `storage.objects` 列只會留下孤兒實體，之後也無法再從 Dashboard 清）：由業主在 Dashboard → Storage 的三個 bucket（`id-cards`、`referral-signatures`、`make-5c6718b9-listings-photos`）全選刪除，乾跑看到 `storage.objects` 各 bucket 為 0 才進 SQL 段。

**前提（業主）**：Dashboard → Project Settings → Database → Backups 確認今天有可還原的備份（或 PITR 開著），截圖回報。沒有備份不執行。

**演練**：**不在 develop 上演練**（develop 的管理員、預設推薦人與測試帳號還要給窗口工項的真機驗收用）。用 Supabase MCP `create_branch` 從正式專案開一條拋棄式分支，對它跑乾跑與刪除段，確認每句 SQL 都能執行、零殘留查詢正確，然後 `delete_branch`。分支沒有資料，演練驗的是語法與權限，不是計數；**用同一個 `execute_sql` 呼叫跑含 `begin;`／`commit;` 的整段**，被拒或要求確認時改成單一多語句呼叫，再不行就由業主在 Dashboard SQL Editor 貼同一段。

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
union all select 'task_progress', count(*) from public.task_progress
union all select 'referral_king_rewards', count(*) from public.referral_king_rewards
union all select 'system_alerts', count(*) from public.system_alerts
union all select 'announcements', count(*) from public.announcements
union all select 'rate_limits', count(*) from public.rate_limits
union all select 'member_verify_logs', count(*) from public.member_verify_logs
union all select 'auth.audit_log_entries', count(*) from auth.audit_log_entries
union all select 'storage.objects:'||bucket_id, count(*) from storage.objects group by bucket_id;
select last_value, is_called from public.referral_code_seq;
select default_referrer_code from public.reward_config;
select to_regclass('public.kv_store_5c6718b9');   -- 舊 KV 表若仍存在（checklist 附錄），一併列計數並刪
```

把結果整段貼進互動問題給業主確認（特別標出：`withdrawal_events.bank_ref` 非 0 代表曾有真匯款；`payment_orders.completed` 若有 `PAYUNI_SANDBOX=false` 期間的單代表真錢——目前證據是正式站一直 sandbox，PR #372）。

**執行（業主確認後，整段在單一交易內；執行前看 `reconcile-payments.yml` 沒有 in_progress 的 run 即可，排程看不到半刪狀態）**：

```sql
begin;
-- storage.objects 已由業主在 Dashboard 清空（乾跑各 bucket 為 0），這裡不碰
delete from auth.users;                      -- profiles 與全部業務表 cascade（20260620000001:20 起）
delete from auth.audit_log_entries;          -- 含 email，無 cascade，個資清理
delete from public.system_alerts;
delete from public.rate_limits;
delete from public.member_verify_logs;
delete from public.announcements;            -- 業主若有上線公告要留，先問
alter sequence public.referral_code_seq restart with 8048876;   -- 裁決 3 全清＝checklist「整批測試資料一起清掉」的例外（checklist:486-494）；乾跑的 referral_codes 必為 0
commit;
```

不碰：`public.reward_config`（單列）。乾跑若看到 `default_referrer_code = '8048876'` 就維持，業主付款拿到 8048876 後自動對上；若是 null 或別的值，業主付款後執行 `update public.reward_config set default_referrer_code = '8048876';`（checklist 步驟 6 的順序：先付款、後設定）、`storage.buckets` 列、`cron.job`、`supabase_migrations.schema_migrations`。

**零殘留檢查**：再跑一次乾跑，除 `reward_config` 外全部為 0；`select last_value, is_called from public.referral_code_seq` 應為 `8048876, false`。

**之後（業主，§7 第 9–10 步）**：註冊 → 真付款 → `/health` 的 `defaultReferrer` 應為 `ok`（第一個付款帳號拿到 8048876 且與 `reward_config` 相符）→ `POST /admin-setup/set-self-admin`。

## 5. 10/29–10/31 評估與衡量（目標 4，裁決 7）

**容量事實（來源：掃描 2026-10-27）**

| 環節 | 上限 | 100–500 人、部分現場的判斷 |
|---|---|---|
| 驗證碼信 | Supabase Auth 寄信 300 封／小時（文件值，Dashboard 現值待業主讀）；Google Workspace 2,000 封／日 | 尖峰小時 100 人註冊約 150 封（含重寄）：300／小時夠但緊，**業主在 Dashboard 調到 600／小時**；2,000／日夠（單日最多約 750 封）。relay 不必先換，備案在 checklist:330-334 |
| `/auth/check-email` | 每 IP 10 次／5 分鐘，IP 取 `cf-connecting-ip`→`x-forwarded-for`→`unknown` 共用桶 | 現場同一 Wi-Fi 第 11 人起被 429 → **窗口 hotfix 改 60／5 分**。真實 IP 有到（develop 的 `rate_limits` 已有 `check-email:49.216.167.190` 這類列，不是 `unknown` 桶）；主 session 可用 Supabase MCP `execute_sql` 對 develop 查 `select key, count, window_start from public.rate_limits where key like 'check-email:%'` 再確認一次，不必打端點 |
| 推薦碼驗證 | 每人 10 次／5 分、50 次／日 | 夠 |
| 結帳頁輪詢 `/profile` | 每 5 秒一次、不收斂 | 50 人同時停在結帳頁 ＝ 10 req/s 的 6 查詢端點；可接受，不改（T1 會收斂） |
| PayUni | 正式端點是否擋海外來源未確認；NotifyURL 必須打得到 `*.supabase.co` | 台灣真付款驗證（裁決 4）同時驗這兩點 |
| 對帳排程 | GitHub cron 名義每小時、實測中位 1.7 小時；批次 50 | 夠；#395 上去後靜默 expired 會變告警 |

**量測（主 session 在 10/28 前準備成一支 SQL 檔放 scratchpad，10/29–31 每 2 小時跑一次，結果記本檔 §8）**

1. 每小時註冊漏斗：`auth.users` 依 `date_trunc('hour', created_at)` 的 建立數／`email_confirmed_at` 非空數（完成率 <80% 或整點斷崖 ＝ 寄信額度）。
2. 重寄比：`confirmation_sent_at` 更新次數無法直讀，改看 Auth logs 的 send 事件數／註冊數，>1.3 代表送達問題。
3. 步驟分布：`select public.effective_registration_step(id) as step, count(*) from public.profiles group by 1`（函式，0 基本資料未填／1 無訂單／2 有 pending 訂單／3 有 completed 訂單；`profiles.registration_step` 欄已棄用、不要讀）。
4. 訂單：`payment_orders` 每小時各狀態數；`pending` 且無 `payuni_response` 超過 20 分鐘的數；`pending` 且 `payuni_response->>'Status'='SUCCESS'` 的數（目標 0）。
5. `system_alerts` 未解決數依 source／severity。
6. 限流壓力：`rate_limits` 中 `key like 'check-email:%'` 且 `count >= 上限` 的列數、`check-email:unknown` 的 count。
7. `/health` 每次都看：`ok`、`sha`、`payuniMode=production`、`defaultReferrer=ok`（主 session 的容器打不到 `*.supabase.co`：由業主貼，或請執行 session 從它的容器 curl）。
8. 客服回報分類計數：沒收到驗證碼／付了未開通／推薦碼無效／請求過於頻繁。
9. R2 邀請：`auth.users` 中 `raw_app_meta_data ? 'referral_invite'` 的數、其中 `email_confirmed_at is null` 且 `issued_at` 超過 8 天的數（應為 0，purge 失效的訊號）、`system_alerts` 的 R2 來源（接手 R2 規劃書 R2-3b 第 12 點，該規劃書在前端合併後會刪）。

**監看分工**：告警送到人（窗口工項）上去前，業主每 2 小時看 `/admin` 的系統告警與 GitHub issues；上去後由 LINE 推播。主 session 在凍結期沒有 PR 事件就不會醒：10/29–31 的每 2 小時量測需要一個排程任務（Claude Code Remote `create_trigger`，cron 每 2 小時、只到 10/31）——業主醒來後裁決是否允許（列在 §8 待辦），未允許前由業主手動喚醒主 session。

## 6. 第 2 波起：維運與資安（目標 3）

每週晉升：第一次 11/3（週二）台北 10:00 開晉升 PR、journey-full 綠、業主核准；之後每週同一天。第 2 波主 session 從這張表挑（大小是掃描估計）：

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
| 既有 issue 收斂 | XS | 全部同標題「Edge Function 部署失敗」issue（2026-10-26 時點 13 張，#337–#400）、#288、#280、#279 一次清；順手把 checklist 的號源重設句改成「已開始發碼後絕不執行」 |
| SEO 進階（AEO／GEO） | M | FAQ 與服務者頁 JSON-LD、llms.txt、公開頁預渲染（建置流程變更，三段式）、服務者動態 sitemap（後端產生）；基礎版在窗口 PR `fix/brand-icons-seo` |
| journey harness 配合 PayUni sandbox 新表單 | S | `payuni_sandbox_page.py` 重新定位卡號欄與送出鍵；11/03 前把 ci.yml journey-full 改回 sandbox（規則 13 到期自動紅） |
| 窗口沒做完的 | — | T1、S7b、L1-1、P1b、A1a、A2 照總綱 §8 順序 |

## 7. 業主操作清單（按順序；每步做完回主 session 一句）

**睡前（10/27 02:15 前）**

1. 回答 R2 session 卡住的問題（建議「不改」）。
2. PR #402 轉 ready → 合併（merge commit；內含本檔、三種 session 的 prompt、CLAUDE.md／README 修訂）。
3. 開新的主 session（Opus），貼 `dispatch-prompts.md` §A；它會自己開 R2 前端與窗口工項的執行 session。你醒著時它每問一次裁決都會停在互動問題等你核准，上線日請保持可即時回覆。
4. 睡。夜裡不會有任何互動問題等你；主 session 把要你決定的事列在本檔 §8 的「醒來後待辦」。

**醒來後（約 10:15 起，順序照做；先看本檔 §8 最後幾列與「醒來後待辦」表）**

5. 若晉升 PR 已合進 main：到 Actions 核准 `production` 部署；`curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/api/health` 看 `sha` 對上 main 的 merge commit。若還沒合進 main：看 §8 的原因，先做主 session 列出的那件事。
6. Supabase Dashboard（正式專案）：確認備份存在（Project Settings → Database → Backups，截圖回主 session）；Authentication → Rate Limits 的寄信上限調到 600／小時並記下現值；Authentication → Email Templates 貼 R2 的 Invite user 模板與主旨（`supabase/email-templates/referral-invite.html`，R2 前端 PR 合併後才有這個檔，PR 內文有貼法）；Edge Function Secrets 加 `REFERRAL_INVITE_SECRET`（`openssl rand -hex 32`）、`REFERRAL_EMAIL_INVITE_ENABLED=true`。
7. Secrets 翻 PayUni 正式：`PAYUNI_SANDBOX=false`、`PAYUNI_MER_ID`／`PAYUNI_HASH_KEY`／`PAYUNI_HASH_IV`；確認 `FRONTEND_URL=https://uknow.com.tw`；Dashboard 重部署 `api`；`/health` 的 `payuniMode=production`、`payuniConfigured=true`。PayUni 商店後台確認 NotifyURL／ReturnURL 網域。告訴主 session「已翻」，它才合 `EXPECT_PRODUCTION_PAYUNI` 的 PR。
8. Storage：Dashboard → Storage → `id-cards`、`referral-signatures`、`make-5c6718b9-listings-photos` 三個 bucket 各自全選刪除物件（bucket 本身留著）。
9. 回答主 session 的清資料乾跑確認（它會貼 §4 的計數；`storage.objects` 各 bucket 必須已是 0）。
10. 清完後，從台灣網路：註冊第一個帳號＋完善資料 → `GET /admin-setup/check`（`hasExistingAdmin=false`）→ `POST /admin-setup/set-self-admin`（checklist 步驟 7；**先做這步再付款**，端點對第一個完成資料的人開放、不要留空窗）→ 真付款 NT$1,200 → `/health` 的 `defaultReferrer=ok`（`reward_config` 不是 `'8048876'` 時先 `update`，見 §4）→ 加入推薦計畫（簽規章）。
11. R2 實寄核對（R2 規劃書 R2-3b 第 8–10 步，裁決 S 的順序：後端先開、收信核對通過才開前端旗標）：用自己的 token `curl -X POST …/api/referrals/invites` 寄到第二個信箱 → 收到信、主旨、揭露句、連結正確 → 點連結設密碼 → 完善資料頁帶推薦碼 → 回報主 session；主 session 跑 `purge_stale_referral_invites(p_email := '<第二個信箱>')` 清掉測試空殼（或你再註冊完它）。同一步順便驗 R2-0 沒做過的兩件 hosted 行為：同信箱第二次寄（重寄）信內連結是新的；purge 後主 session 用 SQL 確認該帳號的 `auth.audit_log_entries` 列已被刪（`delete_auth_audit_for_users` 對 hosted payload 形狀有效）。兩件都過才做第 12 步。
12. Cloudflare Pages → uknow → Settings → Variables（**Production** 作用域）：`VITE_REFERRAL_EMAIL_INVITE=true` → Deployments 對最新 production 部署按 Retry deployment（環境變數要重建才生效）→ 開 https://uknow.com.tw 按「邀請好友」確認邀請卡有 Email 欄。
13. 宣布開放。之後每 2 小時看一次 `/admin` 系統告警與 GitHub issues，直到告警送到人上線（它需要你在 GitHub Secrets 放 LINE token，主 session 會列在待辦）。

## 8. 進度與異動紀錄（主 session 每小時一列）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 10/27 02:00 | 監工 session 完成目標核對（§0）、掃描、PR #402；本檔與 `dispatch-prompts.md` 落檔 | 業主做 §7 睡前 1–3 步 |
| 10/27 02:15 | 業主裁決 9（夜間授權）後入睡到 10:15 | 主 session 接手；夜裡的紀錄一律寫在本表 |
| 10/27 13:45 | **主 session 開局**（夜間沒有主 session 運作，夜間授權未使用）。現況：#402 於 13:43 由業主合併，develop CI run 40456919943 進行中，「部署 Edge Function」step（`--use-api` 首次）待它綠後的 deploy run 判定；#399 已轉 ready，R2 後端 session 閒置在等審查，**沒有卡在 AskUserQuestion**（K1 的「回答問題」已不需要）；#399、#401 因 #402 改了 `.claude/rules/github-actions.md` 規則 12 而 conflict、CI 未跑。open issues 未變（部署失敗 issue 群待 §6 收斂）。**12:00 開放已錯過** | rebase #399／#401、五 lane 審 #399、問業主新開放時間 |
| 10/27 13:55 | 依目標 5 授權 rebase＋force-push：#401 → `f6a0d4b`、#399 → `c3be852`（規則 12 段落解成兩邊都留；#399 的移植段與 #401 逐字相同，#401 合併後 no-op）。本機 check／check-workflows／spec-drift／migration-versions 綠。已 send_message 通知 R2 後端 session 先 reset 再動 | #399 五 lane 審查進行中；CI 綠後合 #401 → #399 |
| 10/27 14:10 | develop deploy run 40457604933（`--use-api` 首次）**綠**——K1 完成。#399 五 lane 審查完成：無擋合併的 P0／P1（需求 lane 的「沒有前端」是既定分工），追蹤項留言在 #399、轉進 dispatch §I 與 §7 第 11 步 | 業主裁決 10–13（見 §0）|
| 10/27 14:20 | 派工 prompt D～I 落檔；開 R1a-2、P1a（規劃）、告警送到人三個執行 session | #399／#401 CI 綠 → 合併 → 開 R2 前端（§B＋§I）、G、H |
| 10/27 14:05 | 首批三個 session 用 create_session 不帶 source_url 開出 → 容器沒有 repo、add_repo 被分類器擋，三個都卡住（已改帶 `source_url` 重開；舊的 `session_01MQovbDCdjDsSfdjR573frP`、`session_01MQovbEWLNfqLFHrSzGLdsx` 封存被權限擋，請業主手動封存）。**教訓：create_session 一律帶 source_url＋source_revision=develop** | — |
| 10/27 14:06 | **#399 合併**（`5364205`，head `58b38c1` CI 綠）；#401 內容已逐字隨 #399 進 develop → 留言後關閉。建 10/29–31 量測排程 `trig_01KmMD7RYZFDjNiLWHrNDhx3` | 等各執行 session 回報 |
| 10/27 14:15 | 開 #403（本分支的文件 PR，晉升前合）。六個執行 session 全部在跑（名冊見下）。清資料演練（§4）：Supabase MCP `create_branch` 需要業主確認分支費用，MCP 等不到回答逾時——**待業主在互動視窗核准後重試**。`measure.sql` 落檔（§5 的 SQL 項） | 等執行 session 回報；業主核准分支費用 |
| 10/27 14:20–14:30 | 執行 session 回報：R1a-2 → PR #405（CI 綠、ready）；告警送到人 → PR #406（CI 綠、draft）；#395 → PR #407（draft，等 CI）；P1a 規劃 → PR #404（1 P0／15 P1，待裁決）；容量 hotfix 工作樹完成但 pre-commit 要 deno、容器裝不了 curl\|sh → 指示改試 `npm install -g deno`；R2 前端循環 6、7 綠、8 施工中，核准其一條紅燈測試字面修正（斷言改以「密碼需包含：」開頭） | 審 #405／#406／#407（三個 agent 進行中） |
| 10/27 14:30 | 演練分支 `wave1-cleanup-rehearsal`（`ykaxvdxtswhtqohwhlss`，業主在 Dashboard 開的；MCP create_branch 的費用確認視窗兩次都到不了業主）：乾跑 SQL 全部可執行、權限 OK（第一次因分支 migration 尚未套完而找不到 `referral_code_seq`，數秒後即存在——**今晚對正式站不會有這個問題**）。刪除段透過 MCP 兩次 `cancelled` → 裁決 17。business decisions 14–17 落 §0 | 業主在 SQL Editor 貼刪除段 → 主 session 跑零殘留檢查 → 刪分支 |
| 10/27 14:40 | #405 審過可合併（等晉升）；og 圖開 issue #408。#406／#407 第一輪審查 agent 無 shell 取不到 diff → 以有 shell 的 agent 重審中。容量 hotfix session 連 `npm install -g deno` 也被分類器擋 → 交棒：它把 patch 以 send_message 傳給 #395 session（唯一有 deno＋本機 Supabase 的執行 session），由後者在 #407 ready 後另開 `fix/peak-capacity-hotfix` PR | 等 #406／#407 審查結果、R2 前端 PR、業主貼演練刪除段 |
| 10/27 14:55 | #407 審過：P0 無、5 點需修（去重鍵加 payuniMessage、未付款不寫 info、payuni-query 升 error、fallback 條件、零告警斷言）；開放問題裁決「本 PR 不動轉移條件，#395 留 open 等 sandbox 碼表」。#406 審過：P0 無、1 P1 必修（`actions: read` 缺 → 窗口靜默退化 70 分）＋4 P2。P1a 第二版 #404 剩 Q-D／Q-F／Q-G → 業主裁決 18–20，執行 session 跑第三輪 /review-plan。容量 hotfix patch 已交 #395 session | 等 #406／#407 修完、R2 前端 PR、業主貼演練刪除段 |
| 10/27 15:45 | R2 前端開 draft PR #409（循環 6–8＋文件＋R2-3a UI 驗形；本機 check:full 綠、mocked e2e 290 passed）；已訂閱、預審 6–8 | 循環 9–11 推完後五 lane 完整審查 → 合併 → 開晉升 PR |
| 10/27 15:47 | 容量 hotfix 交棒成功 → PR #410（#395 session 本機 supabase 實跑紅燈證據；另順手改 journey docstring 與 index.ts 註解的舊數字）| 審 #410 |
| 10/27 15:52 | #410 審過可合併（P0／P1 無，3 條 P2 記債）。P1a #404 第三輪 0 P0／3 P1（已處置）／7 P2，裁決 18–20 已落 plan；**待業主審 #404 後親打 /tdd-implement**（PR 1 後端清理先做） | 業主審 #404；等 #409 循環 9–11 |
| 10/27 16:00 | #409 預審（循環 6–8）：P0 無、2 P1（SIGNED_OUT 清掉使用中 token；T1 撞檔面要記交接）已交 R2 session 在循環 11 前修。#406 P1 已修（`9da630f`）複核通過、ready；#410 CI 綠、ready；#407 五點已修（`4978574`）複核中 | 等 #409 循環 9–11；窗口 PR #405／#406／#410（#407 待複核）全部等晉升後合 |
| 10/27 16:40 | 業主在演練分支 SQL Editor 跑完 §4 刪除段（`8048876, false`）；主 session 跑零殘留檢查後刪分支。業主審過 #404、已在 P1a session 打 /tdd-implement（PR 1 後端清理先做）；兩個空 session 已封存。**今晚正式站清資料的實際路徑確定：乾跑與零殘留由主 session 用 MCP 跑，刪除段由業主在 SQL Editor 貼** | 等 #409 循環 9–11 |
| 10/27 16:50 | 零殘留檢查全 0、`reward_config` 1 列、序列 `8048876,false` → 演練分支已刪。業主確認正式站每日 PHYSICAL 備份（最新 10/26 22:44 UTC＝10/27 06:44 台北），Storage 物件不在備份內（§4 已知）；裁決 21 PITR 不開。手把手步驟（寄信上限 600、SMTP 確認、LINE channel 與兩把 Secret）已交業主 | 等業主回 4b／4c／5；等 #409 |
| 10/27 17:05 | 業主完成：寄信上限調 600／小時（Rate Limits 頁；原值待業主補）；自訂 SMTP 確認（`admin@uknow.com.tw` 經 `smtp.gmail.com:587`，Dashboard 的「personal provider」黃色警告是制式提醒，§5 已算入 2,000 封／日）；LINE Messaging API 綁在既有官方帳號「Simon」（@693hcfug，輕用量 200 則／月）、Provider「Uknow」，兩把 Secret `LINE_CHANNEL_TOKEN`／`LINE_ALERT_TO` 已放 GitHub；其他 Auth 限流（sign-up 300／5 分／IP、OTP 300／5 分／IP）對現場共用 IP 足夠，不動 | 推播實測（curl 或 #406 合併後 workflow_dispatch） |
| 10/27 17:12–17:40 | R2 前端 #409 完成（循環 6–11、R2-3a UI、實作審查與預審處置、規劃目錄已刪；head `eae1213` CI 綠）。五 lane 審查：P0 無；P1 兩條經反駁只剩 `expired` 文案一條成立（第 8 天才踩到、首批邀請 11/3 到期）→ follow-up `fix/invite-expired-notice`（R2 session，目標 10/28 第二次晉升）；模板保存期限句為裁決 N，維持。事實核對全綠。**#409 合併（`1471912`）** | 開晉升 PR |
| 10/27 17:45 | **晉升 PR #411 開出**（develop→main，23 個 PR、7 支 migration；#403 主 session 文件 PR 因 ready 後 ci-ok 要重跑、不值得佔關鍵路徑，排除在本次晉升外、晉升後再合）。dispatch `journey-scheduled.yml`（develop，`pytest_expr=orgbuild or invite`）先驗 R2 的 hosted 行為，與 #411 的 journey-full 平行 | 等 journey 子集（~10–20 分）與 journey-full（30–90 分）；綠就以 merge commit 合進 main → 業主核准 production 部署 |
| 10/27 18:26–18:45 | **journey 子集（sandbox）紅**：拋棄式分支、migration、`--use-api` 部署、signup 探測全綠；pytest 在 PayUni sandbox 刷卡頁「確認送出」後 45 秒表單仍在、卡號欄只剩末四碼（run 40472945048）。史料：10/17 sandbox full 綠（run 39063973420）、10/24 排程紅在拉映像（未到 pytest）→ 今天是 10/17 後第一次碰 PayUni sandbox 頁，判定 PayUni 測試站改版，非本波程式問題。#411 的 journey-full（sandbox）必同樣紅。處置：(a) 重 dispatch 子集改 `payment_mode=webhook`（run 40473648265）驗 R2 hosted 行為；(b) 主 session 依 ≤10 行 CI 例外開 **PR #413**：ci.yml journey-full 暫改 webhook、規則 13 標「暫時至 2026-11-03」；PayUni 邊界由今晚真付款驗（裁決 4）。#413 合進 develop 後 #411 自動跟上重跑 journey-full（webhook，約 30–60 分） | 等 webhook 子集結果 → 合 #413 → 等 #411 journey-full |
| 10/27 18:50 | **webhook 子集綠**（run 40473648265：30 節點建樹＋Email 邀請 GUI 情境在 hosted 分支通過＝R2 hosted 行為已驗）。#413 CI 只剩 e2e-tests。R2 follow-up PR #412 開出（draft，4 項都做，目標 10/28 晉升）。業主：LINE token 貼成 Channel secret，已指正；裁決 22 | #413 綠 → 合併 → #411 journey-full（webhook）重跑 |
| 10/27 19:00 | 業主 LINE 推播實測通（curl 回 `{}`、手機收到）；Secret 已更正為長效 Channel access token。#412 審過可合併（P2 順手刪 useRef）。#413 只剩 e2e-tests | #413 綠 → 合併 → #411 journey-full（webhook）|
| 10/27 19:47 | **#413 合併**（`5779d16`）：develop 的 journey-full 閘門暫走 webhook 至 11/03。#411 head 隨之更新、CI 含 journey-full（webhook、full 30 節點）重跑 | journey-full 綠 → merge commit 合進 main → 叫業主核准 production 部署 |
| 10/27 19:55 | 業主提出官方 icon（黑底白字 Uk）、搜尋引擎可見、SEO／AEO／GEO 準備 → 裁決 23／24。原檔已放 `fix/brand-icons-seo` 分支 `public/brand/`（54d06bc）；派工 prompt §J；開 Sonnet 執行 session | 等 #411 journey-full |
| 10/27 20:13 | **#411 journey-full（webhook，full 30 節點）綠，24.7 分鐘**（run 40475965034）；ci-ok 綠 → 以 merge commit 合進 main。brand/SEO 執行 session 開出 PR #414（審查中；Navbar 改動要還原） | 業主核准 production 部署（§7 第 5 步）→ /health sha 比對 |
| 10/27 20:35 | main CI 綠（b4f9bb3，push 軌只跑 guards）→ deploy-supabase run 283（40479159452）停在 `waiting`＝等 production 核准（REST 顯示 head_branch=develop 是 workflow_run 以預設分支為上下文的已知顯示法，環境判定用 payload 的 main）。#403 ci-ok 綠 → 合進 develop（91d4a1e，develop 解凍後第一支）；本分支改從 develop 重切，後續 §8 另開 PR。給業主 §7 第 5 步核准＋sha 比對說明 | 業主核准 → 貼 /health 輸出；接著 #405 rebase |
| 10/27 20:50 | #405 rebase 到 develop（e02e3a2）CI 中；#414 兩項修正（fa861dd Navbar 還原、88d7c67 sitemap）CI 綠，疊在 #405 上等它合後 rebase；#412 ready 綠等 rebase。**#404（P1a PR 1）四 lane 審查**：無 P0；P1 ×5（整合測試補真 overlaps＋Storage 移除案例、public URL base 不靠 `publicUrlOf('')`、§14 第 14 列補齊孤兒來源、刪除中回饋、PR 內文失準兩處＋部署順序）已交執行 session；URL 新舊形狀一致（不誤刪）與撞檔（merge-tree 全乾淨）皆核對通過。PR 2 裁示留 11/3 第 2 波同 session 接手。架構 lane 另查出 #407 對 develop 的 friction-log 會衝突，輪到它時 rebase 處理 | #405 綠 → 合；#404 修完 → 複核 |
| 10/27 21:05 | 停車 PR 依序合進 develop：#405（0c5c11b）→ #410（140fecb）→ #406（0786b61），每支 rebase＋ci-ok 綠後 merge commit。#404 五項 P1 修完（60a411d）CI 全綠含新整合測試，最後再 rebase 合。#407 rebase 時 friction-log 衝突（#395 條目的償還段 vs R2 施工摩擦節）兩邊都留、推 4b92157 等 CI。業主尚未回覆 production 核准 | #407 綠 → 合 → #412 → #414 → #404 |

**執行 session 名冊**（主 session 維護）

| 工項 | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| R2 前端 | `session_01MQovbDDZ3ai3vEKXRrHPEe` | Opus | `feature/referral-email-invite` → `fix/invite-expired-notice` | #409 ✅ 已合併 | follow-up PR #412（draft，4 項完成，紅 1e4fe53→綠 fed29e5）；等 CI、主 session 審；目標 10/28 晉升 |
| R1a-2 og＋lang | `session_01MQovbEo7gaDGV4zL74C89U` | Sonnet | `fix/og-preview-lang` | #405 | CI 綠、ready，主 session 審查中；晉升後合 |
| P1a | `session_01MQovbCmtDUFsDFhE3Ei39S` | Sonnet | `feature/listing-photo-pipeline` | #404（規劃）| 業主 16:40 打 /tdd-implement，PR 1 後端清理施工中；PR 1 目標 10/28 第二次晉升，PR 2 趕不上留 11/3 |
| 告警送到人 | `session_01MQovbAiZV42jJLPRAqLhY5` | Sonnet | `fix/ops-alert-routing` | #406 | 審過、P1 已修複核通過、ready；晉升後合 |
| 容量 hotfix（寄信告警依裁決 16 不做） | `session_01MQovbDWjfcnq21M6T5cDBf` → 交棒 `session_01MQovbEHzitj2bAVNdriREc` | Sonnet → Opus | `fix/peak-capacity-hotfix` | #410（draft） | 審過可合併、CI 綠、ready；晉升後合 |
| #395 | `session_01MQovbEHzitj2bAVNdriREc` | Opus | `fix/payuni-query-alert` | #407 | 5 點已修（`4978574`）複核中；容量 hotfix 已另開 #410 |
| R2 後端（收工） | `session_015dFtMVsyqYU5gijDBa6yCp` | Opus | — | #399 ✅ | 已合併，可封存 |

**醒來後待辦**（主 session 維護；業主 10:15 起照順序做，做完刪該列）

| # | 事 | 狀態 |
|---|---|---|
| 1 | 核准 production 部署（若晉升已合進 main） | ⬜ |
| 2 | §7 第 6–8 步：~~備份確認、寄信上限 600、SMTP 確認~~ ✅；剩模板與主旨、R2 兩把 secret、PayUni 正式、清三個 bucket（等晉升後） | ◐ |
| 3 | 清資料乾跑確認（主 session 會把計數貼在這裡） | ⬜ |
| 10 | ~~審 #404、親打 /tdd-implement~~ 16:40 已做 | ✅ |
| 4 | ~~LINE channel 與兩把 Secret~~ 17:05 完成（Email 通道的 `ALERT_SMTP_*` 依 #406 最小版不做，留第 2 波） | ✅ |
| 5 | ~~是否允許排程任務~~ 已裁決允許（§0 第 13 題） | ✅ |
| 8 | ~~核准建拋棄式分支~~ 業主自己在 Dashboard 開了、演練完成 | ✅ |
| 9 | 雲端環境 setup script 預裝 deno 與 supabase CLI：session 標題列的雲端環境選單 → Edit → Setup script，加 `curl -fsSL https://deno.land/install.sh \| sh && export PATH=$HOME/.deno/bin:$PATH` 與 `npm install -g supabase`（setup script 不受 auto-mode 分類器限制；今天三個執行 session 都因容器無 deno 而被 pre-commit 擋下或得交棒）。新 session 才會生效 | ⬜ |
| 7 | ~~手動封存兩個空 session~~ | ✅ |
| 6 | ~~寄信上限與 SMTP 確認~~ 17:05 完成 | ✅ |
| 11 | 第 2 波：修 journey harness `payuni_sandbox_page.py` 配合 PayUni sandbox 新表單（或向 PayUni 確認改版），11/03 前把 ci.yml journey-full 改回 `sandbox`（規則 13 到期會自動紅） | ⬜ |
