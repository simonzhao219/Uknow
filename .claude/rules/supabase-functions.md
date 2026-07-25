---
paths:
  - "supabase/functions/**"
---

# Supabase Edge Functions(Deno)工作守則

這裡是 **Deno runtime**,與前端的 node/vite 世界完全隔離:

- 格式與 lint 由 `supabase/functions/deno.json` 定義(單一事實來源,
  勿在此抄寫具體值)。提交前:`cd supabase/functions && deno fmt && deno lint`
- 型別檢查:`deno task check`(秒級,但**要連得上 registry** 解析 jsr:/npm:
  相依;首次跑完會進 DENO_DIR 快取。沙箱擋 jsr.io 之類的環境跑不了——
  pre-commit 偵測到「相依解析不到」會降為警告交給 CI,型別錯誤仍照擋)
- 測試分兩層,由**檔名**決定:
  - `api/*.unit.test.ts` —— 不碰資料庫的純函式測試。`deno task test:unit`
    秒級跑完,**不需要 `supabase start`**;CI 在最快的 unit 軌跑
  - `api/*.test.ts` —— 需要真 Postgres 的整合測試。`deno task test:db`
    **需要 `supabase start`**(分鐘級);CI 在 api-tests 軌跑
  寫新測試時先問「這支需要資料庫嗎」,不需要就命名成 `.unit.test.ts`——
  放錯只是慢,不會錯,但慢的代價是每次都多等兩分鐘
- 本機粒度是 per-phase 不是 per-edit:每個 TDD 階段起一次 supabase、跑該
  階段測試確認紅/綠即可。日常靜態驗證靠 `deno task check`
- 測試檔跟被測程式同層放在 `api/`
- import 用 URL/jsr 慣例(看鄰近檔案),沒有 node_modules
  (`nodeModulesDir: "none"`)
- pre-commit 在 functions 有改動時會自動跑 `deno fmt --check` +
  `deno task check`,本機沒裝 deno 會擋 commit 並附安裝指引
  (`deno.land` 被擋的環境可用 `npm i -g deno`)

## index.ts 導航——**不要整檔讀**

`api/index.ts` 是單一 Hono app,**3,000+ 行、49 條路由、約 31,000 tokens**
(≈15% 的 context window)。整檔讀進來會擠掉後續工作的空間,而任何單一
任務用得到的通常不到 5%。**先定位,再用 Read 的 offset/limit 取那一段。**

定位指令(行號會隨改動漂移,一律現算,不要相信任何寫死的行號):

    grep -n "app\.\(get\|post\|put\|patch\|delete\)(" supabase/functions/api/index.ts
    grep -n "<你要找的路徑或函式名>" supabase/functions/api/index.ts

檔案的區段順序(用來判斷該往檔頭還是檔尾找):

| # | 區段 | 內容 |
|---|---|---|
| 1 | 前置 | CORS、`READ_PATHS`、`CORS_304_HEADERS` |
| 2 | 共用工具 | `sb()`、`getRewardConfig()`、`requireAuth()`、`isAdminUser()`、`verifyNationalId()`、`maskNationalId()`、`maskBankAccount()` |
| 3 | PayUni 設定 | `payuniConfig()` |
| 4 | auth | `/profile`、`/auth/*`(check-email / register / profile / cancel-signup / complete-registration / reset-registration) |
| 5 | 推薦碼 | `/referrals/validate/:code`、`/referrals/join-program`、`/listings/verify-referral-code` |
| 6 | admin | `/admin/system-alerts`、`/admin/features`、`/admin/withdrawals`、`/admin/members`、`/admin/announcements`、`/announcements/active`、`/admin-setup/*` |
| 7 | 金流 | `/payuni/prepare`、`/payuni/result/:tradeNo`、`/payuni/return`、`/webhooks/payuni/notify`、`/internal/reconcile-pending-payments` |
| 8 | 會籍 | `/subscriptions/status` |
| 9 | 獎勵/提領 | `/rewards`、`/rewards/points-preview`、`/rewards/withdrawals`、`/rewards/verify-id`、`/rewards/id-photos`、`/rewards/upload-id-photos`、`/rewards/withdraw`、`/rewards/withdrawals/:id/confirm`、`/rewards/history` |
| 10 | 推薦網絡 | `/referrals/network/overview`、`/children`、`/search` |
| 11 | 任務 | `/tasks`、`/tasks/pending-rewards`、`/tasks/current-month-top`、`/tasks/claim-reward/:id` |
| 12 | 其他 | `/listings/upload-photo`、`/referrals/debug/:userId`、`/health` |

改動前也先看 `_shared/api-contract.ts`(前後端共用契約,≈5,000 tok)——
契約變更要同步兩側,只改一邊會在 CI 的型別檢查才炸。
