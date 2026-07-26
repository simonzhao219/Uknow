# Uknow 後端（Supabase）

Supabase（PostgreSQL + Auth + Storage）+ 單一 Edge Function。
取代舊版「單一 KV 表 + 15,000 行手動維護 JSON」的架構。

> **業務規則不在這裡**：完整規則見 `docs/uknow-software-specification.md`。
> 本文件只講**後端結構**（schema、函數、部署）。規則寫兩份必然漂移
> ——這份 README 就曾把獎金與任務門檻寫成早已作廢的舊值。

## 設計核心：單一真相來源（SSOT）

舊系統最大的問題是**同一個事實存好幾份、彼此對不上**，因此需要
`data_repair.ts`（2,050 行）和針對個別用戶的 hotfix。新設計遵守一條鐵律：

> **每個事實只存一次。能算出來的，就即時算，絕不另存第二份。**

| 想知道的事 | 舊版（存多份，會打架） | 新版（即時算） |
|---|---|---|
| 會員是否有效 | `account_status` + `subscription.status` + `listing.isActive` | `user_account_status` View（用訂閱日期算） |
| 刊登能否被看到 | `listing.isActive` | `public_listings` View（用訂閱算） |
| 點數餘額 | `rewards` 快取欄位 | `reward_balances` View（用流水帳加總） |
| 三代推薦樹 | `referral_tree` 快取 | `referral_tree()` 函數（爬 `referral_edges`） |
| 註冊進度 | 前端 state | `effective_registration_step()`（用實際資料推導） |

同一條鐵律延伸出第二條：**會變的業務數字收斂到 `reward_config` 單列表**，
SQL / Edge / 前端皆讀它，不各自硬編（見 `20260719000002` 檔頭的血淚史）。

## 資料表（真相表）

| 表 | 說明 | 筆數 |
|---|---|---|
| `profiles` | 用戶資料（email 由 `auth.users` 管） | 1/人 |
| `listings` | 刊登（一人一個，1:1） | ≤1/人 |
| `subscriptions` | 訂閱歷史（不存 status 欄位） | N/人 |
| `payment_orders` | 付款訂單歷史（含 `renewal_mode`） | N/人 |
| `referral_codes` | 推薦碼歷史（同時僅 1 個 active） | N/人 |
| `referral_edges` | 推薦關係（只記直接上線一層） | 1/人 |
| `reward_transactions` | 點數流水帳（只進不改） | N |
| `withdrawals` | 提領申請 | N |
| `task_progress` | 任務計數器（`monthly_referrals` jsonb） | 1/人 |
| `referral_king_rewards` | 推薦王「免費續約 1 年」credit（可多張） | N/人 |
| `reward_config` | 業務常數單列表（獎金額度、推薦王門檻） | 1（全域） |
| `announcements` | 系統公告 | N |
| `system_alerts` | 背景失敗告警（warning-only 隔離的落點） | N |
| `rate_limits` | 端點限流計數 | N |

## 衍生 View / 函數（即時計算）

**View**

- `user_account_status` — 會員現在狀態（**兩態：active / expired**，無寬限期）
- `public_listings` — 訪客瀏覽（只含有效會員的刊登）
- `reward_balances` — 點數餘額（`total_earned` / `available` / `withdrawn`）
- `reward_transactions_with_balance` — 明細 + 逐筆結餘 + `source_category` 分類

**關鍵函數**（完整清單見 migrations）

| 函數 | 用途 |
|---|---|
| `process_successful_payment` | 付款成功的總入口（訂閱效期、推薦連動） |
| `apply_referral_side_effects` | 推薦碼 / 推薦邊 / 三代獎勵 / 任務計數 |
| `pay_referral_generations` | **三代發獎的單一真相**（付款與任務續約共用） |
| `reconcile_king_credits` | 推薦王 credit 對帳補發（自癒） |
| `claim_referral_king_reward` | 領取免費續約 credit（延展效期 + 連動發獎） |
| `request_withdrawal` / `confirm_withdrawal_collection` | 提領申請與查收 |
| `admin_update_withdrawal_status` | 管理端審核（含退件退款） |
| `repair_orphaned_payments` / `repair_orphaned_claim_rewards` | 兩條路徑的自癒補償 |
| `referral_tree` | 三代推薦樹（只往下爬 3 層，限自己/admin） |
| `validate_referral_code` | 註冊頁推薦碼驗證（排除停權推薦人） |
| `has_active_subscription` | 會籍有效判斷（公開瀏覽用） |
| `effective_registration_step` | 註冊進度即時推導 |
| `tw_day` / `tw_start_of_day` / `tw_end_of_day` | 台灣時區日界（月份 key、單日限額都靠它） |

**慣例**：業務函數一律 `security definer` + `set search_path = public`，
並 `revoke execute ... from anon, authenticated, public`——只由 Edge Function
以 service_role 呼叫。金流相關函數的每個副作用各包一層 `begin…exception`
（warning-only），單一步驟失敗只寫 `system_alerts`，不整筆回滾。

## Edge Function

單一函數 `functions/api/index.ts`（Deno + Hono，掛在 `/api` basePath）。

- **`verify_jwt` 必須為 `false`**：PayUni 的付款回調不帶 Supabase JWT，
  gateway 層驗 JWT 會直接擋掉。函數內以 `requireAuth()` 逐路由自行驗證，
  公開端點（`/health`、webhook）刻意不驗。
- 部署由 `.github/workflows/deploy-supabase.yml` 在**該分支 CI 綠之後**觸發
  （`workflow_run`，不是 push）；部署後打 `/api/health` 比對 `sha`，
  確認線上跑的就是這個 commit。

工作守則（格式、lint、測試分層）見 `.claude/rules/supabase-functions.md`。

## Migrations

47 個 migration，檔名即時序（`YYYYMMDDNNNNNN_描述.sql`）。**每個檔頭都寫了
「為什麼這樣改」**——改動金流函數前請先讀對應檔頭，那裡記錄了歷次踩過的坑。

幾個影響全域的轉折點：

| Migration | 轉折 |
|---|---|
| `20260620000007_business_rule_revision` | 改即時一次發清、移除 `reward_schedules` 與「連續推薦達人」任務 |
| `20260716000008_renewal_modes` | 續約雙模式（extend / fresh） |
| `20260718000101_withdrawal_lifecycle` | 提領狀態機統一為 `pending → awaiting_collection → completed/rejected` |
| `20260719000002_reward_config` | 業務常數收斂為單列表 |
| `20260720000001_wave4_guards` | 停權守衛、付款時間錨定 |
| `20260721000001_remove_grace_status` | 移除寬限期，會籍改兩態 |
| `20260724000003_pay_referral_generations` | 三代發獎收斂為單一函數 |
| `20260724000004_..._pair_history` | 「新下線」判準改 pair-history |
| `20260725000002_reward_source_lifecycle` | 獎勵來源分類改「拉新／續約」軸 |
| `20260726000001_scope_own_policies_to_authenticated` | 「自己的資料」policy 收斂到 authenticated——訪客查詢路徑不再碰 `is_admin()` |

> **不要編輯已套用的 migration。** 修正一律新增一個 migration，並在檔頭寫明
> 基準版本與唯一差異——這是本專案覆寫金流函數時的既定寫法。

## 環境與部署

兩個 Supabase 環境，由 CI 依分支對應。**部署目標的 ref 讀 git 內的檔案**，
不讀儀表板變數——那兩個檔本來就是前端建置決定「打哪個後端」的依據，讓部署
與建置用同一份，兩邊就不可能各自漂移（`vars.*` 降為可選覆蓋，若與 git 不一致
會硬失敗；見 `deploy-supabase.yml` 的「解析目標 project ref」）：

| 分支 | Supabase 形態 | ref 來源 | 用途 |
|---|---|---|---|
| `develop` | 正式專案的 **persistent branch**（`develop`） | `config/supabaseTarget.ts` | 可安全驗證的真後端 |
| `main` | **正式專案** | `src/utils/supabase/info.tsx` | 正式站（部署需人工核准） |

> develop 是 Supabase Branching 長出來的分支，不是另一個獨立 project：
> 有自己的 DB／金鑰／Secrets，但掛在正式專案底下（同組織、同帳單）。
> **Secrets 逐分支獨立、不從母專案繼承**，所以 develop 的那套（PayUni sandbox
> 憑證與 `FRONTEND_URL`）要單獨設一次。見 `docs/supabase-setup-checklist.md`。

Dashboard 端的手動設定（Secrets、Email OTP 模板、PayUni 後台）
見 `docs/supabase-setup-checklist.md`。

### 本地開發

```bash
supabase login
supabase link --project-ref <目標 project ref>

supabase start            # 啟動本地 Postgres
supabase db reset         # 套用所有 migrations 到本地

cd supabase/functions
deno task check           # 型別檢查
deno task test:unit       # 純函式測試（不需資料庫）
deno task test:db         # 整合測試（需 supabase start）
```
