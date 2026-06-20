# Uknow 後端（重構版）

本目錄是 Uknow 重新設計後的後端，採 **Supabase（PostgreSQL + Auth + Storage）** 為基礎，
取代舊版「單一 KV 表 + 15000 行手動維護 JSON」的架構。

## 設計核心：單一真相來源（SSOT）

舊系統最大的問題是**同一個事實存好幾份、彼此對不上**，因此需要 `data_repair.ts`
（2050 行）和針對個別用戶的 hotfix。新設計遵守一條鐵律：

> **每個事實只存一次。能算出來的，就即時算，絕不另存第二份。**

| 想知道的事 | 舊版（存多份，會打架） | 新版（即時算） |
|---|---|---|
| 會員是否有效 | account_status + subscription.status + listing.isActive | `user_account_status` View（用訂閱日期算） |
| 刊登能否被看到 | listing.isActive | `public_listings` View（用訂閱算） |
| 點數餘額 | rewards 快取欄位 | `reward_balances` View（用流水帳加總） |
| 三代推薦樹 | referral_tree 快取 | `referral_tree()` 函數（用 referral_edges 爬） |

## 資料表（真相表）

| 表 | 說明 | 筆數 |
|---|---|---|
| `profiles` | 用戶資料（email 由 auth.users 管） | 1/人 |
| `listings` | 刊登（一人一個，1:1） | ≤1/人 |
| `subscriptions` | 訂閱歷史（不存 status 欄位） | N/人 |
| `referral_codes` | 推薦碼歷史（同時僅 1 個 active） | N/人 |
| `payment_orders` | 付款訂單歷史 | N/人 |
| `referral_edges` | 推薦關係（只記直接上線一層） | 1/人 |
| `reward_schedules` | 每月獎勵排程 | N |
| `reward_transactions` | 點數流水帳（只進不改） | N |
| `withdrawals` | 提領申請 | N |
| `task_progress` | 任務計數器 | 1/人 |

## 衍生 View / 函數（即時計算）

- `user_account_status` — 會員現在狀態（active / grace / expired）
- `public_listings` — 訪客瀏覽（只含有效會員的刊登）
- `reward_balances` — 點數餘額（total_earned / available / pending / withdrawn）
- `referral_tree(user_id)` — 三代推薦樹
- `validate_referral_code(code)` — 註冊頁推薦碼驗證（訪客可呼叫）
- `generate_referral_code()` — 產生唯一推薦碼

## 業務規則（v1）

- 訂閱：年繳 **1200 元**，寬限期 **60 天**
- 推薦獎勵：**3 代**，每代每月 **10 點**，持續 **12 個月**
- 任務：連續推薦達人（連 12 個月 → 1000 點）、推薦王（單月 10 人 → 1000 點）
- 點數：**1 點 = 1 元**，每日限提領一次
- 認證：Email + 密碼（Supabase Auth），保留 email 驗證信

## 架構（混合模式）

- 瀏覽 / 讀取（listings、profile、餘額）→ 前端用 supabase-js 直連，RLS 保護
- 複雜寫入（付款、發獎勵、cron）→ Edge Functions 用 service_role
- 認證 / Session → 全面交給 supabase-js 內建（自動 refresh token）

## Migrations

| 檔案 | 內容 |
|---|---|
| `20260620000001_initial_schema.sql` | 真相表 + 索引 |
| `20260620000002_rls_policies.sql` | RLS 權限 |
| `20260620000003_functions_and_views.sql` | 觸發器、函數、衍生 View |

### 本地開發

```bash
# 安裝 Supabase CLI 後
supabase login
supabase link --project-ref uhtwwxtazwqnlbejhprl
supabase db push          # 套用 migrations 到雲端
# 或本地測試：
supabase start            # 啟動本地 Postgres
supabase db reset         # 套用所有 migrations 到本地
```

> ⚠️ 套用前需先清空舊資料（含 auth.users）。清空腳本見 `reset_legacy.sql`，
> 確認後再執行。舊資料已備份於 repo 根目錄 `export/`。
