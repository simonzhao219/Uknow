# `/auth/check-email` 只比對最新 50 位使用者，較早註冊的既有會員在登入頁被判「不存在」

分支:`fix/auth-check-email-lookup`|重現測試(紅燈 commit):`test(red): /auth/check-email 對第 51 位以前的既有會員也要回 exists:true`(紅燈已在本機 `supabase start` 確認;rebase 會改 hash,以標題為準,當下 hash 見 PR 描述)

## 1. 症狀與重現

- `POST /auth/check-email` 對「註冊順序在最新 50 位之外」的既有會員回 `{ exists: false }`。
  `AuthPage.handleCheckEmail` → `setIsExistingUser(false)` → 進 2B「設定密碼」→ 既有會員對自己已存在的
  email 跑 `supabase.auth.signUp`，而不是登入。會員總數一過 50，每位新註冊者都把一位最舊的會員擠出可登入範圍。
- 重現:`supabase/functions/api/check-email-lookup.test.ts` 第一條——建目標帳號、之後再建 50 位，
  `check-email` 回 `exists:false`(修前紅、AssertionError)。

## 2. 根因

**機制**:舊實作打 `GET /auth/v1/admin/users?page=1&per_page=50&search=<email>`,再在回傳那一頁裡比對。
GoTrue 的 list users 讀 `page`／`per_page`／`sort`／`filter`,**沒有 `search`**;未知參數被靜默忽略,
回的是預設排序(`created_at desc`)第一頁 = 最新 50 位。本機 gotrue v2.197.0 實測(53 位使用者,目標最舊):

| 查詢 | 結果 |
|---|---|
| `per_page=50&search=<目標 email>` | 50 位,目標不在內,第一筆是最新建立的那位 |
| `per_page=50`(不帶參數) | 同上一列 |
| `per_page=50&filter=<目標 email>` | 只有目標 |
| `per_page=50&filter=probe-` | 滿一頁 50 筆(子字串比對+分頁) |
| `per_page=50&filter=<目標 email 全大寫>` | 0 筆(大小寫敏感) |

**為什麼會寫錯**:這段來自 2026-06-20 的 `2f3f715b`(前端改打新 `api` Edge Function、補齊後端路由)。
它取代的舊 `make-server` 版 `checkEmail`(`src/supabase/functions/server/auth.ts`)是用 SDK
`auth.admin.listUsers({ page, perPage: 1000 })` **分頁掃到最後一頁**,註解寫著「Phase 10.2: 修復分頁問題」——
**同一個 bug 在舊版已經修過一次**。改寫時從有型別的 SDK 呼叫換成手寫 `fetch`,自創了一個 `search` 參數:
- 型別層沒有訊號:raw `fetch` 的 URL 是字串,SDK 的 `listUsers` 型別根本沒有 search 選項,但沒經過它;
- 執行期沒有訊號:GoTrue 對未知參數不報錯,HTTP 200、回應形狀與正確查詢完全相同;
- 舊修法沒有測試:Phase 10.2 的修正只活在程式碼與註解裡,重寫時被靜默撤回,沒有任何紅燈。

**為什麼沒被發現**(可證的部分):
- 沒有任何測試對真 GoTrue 斷言過 `exists:true`。`check-email-rate-limit.test.ts` 只斷言狀態碼(查的都是
  `@example.invalid` 不存在的 email);e2e 主套件全 mock(`backend_api_mock`)。
- 就算有,**「剛建立的測試帳號 → exists:true」修前修後都綠**:測試 fixture 永遠是最新建立的帳號,天生落在第一頁。
  bug 的前提(目標之後還有 ≥50 位)不是任何 fixture 的自然形狀,要刻意造——這是紅燈第一條建 50 位的理由。
- CI api-tests 每次從空 DB 起,使用者數量與順序由測試自己決定,同上一點。

未核對(不外推):正式站與 develop 的實際會員數、journey 每輪是否曾在建滿 50 位之後才讓較早的帳號登入。

## 3. 同類掃描

- 根因抽象成的 pattern:**呼叫外部 API 時帶了對方不認的參數名(或把單頁當全集),回應形狀正常、沒有任何錯誤**。
- 掃描方式:`grep -rn "admin/users" . --exclude-dir=node_modules --exclude-dir=.git`(含 `.github/workflows/`)、
  `grep -rn "auth\.admin\." supabase/functions`、`grep -n "fetch(" supabase/functions/api/index.ts`、
  `grep -rn "listUsers\|list_users"`、`grep -n "curl" .github/workflows/*.yml`、`e2e/journey/tools/supa.py` 全部 HTTP 呼叫。
- 逐處核對:

| 位置 | 呼叫 | 結論 |
|---|---|---|
| `index.ts` `/auth/check-email` | `admin/users?…&search=` | **本 bug**,本 PR 修 |
| `index.ts` `/auth/cancel-signup` | `auth.admin.deleteUser(user.id)` | SDK 型別呼叫、以 id 定址,無此病 |
| `index.ts` `queryPayUniTradeStatus` | `fetch(config.queryUrl)`,`MerID`/`Version`/`EncryptInfo`/`HashInfo`,內層 `MerTradeNo` | **同形態風險,記債**(見下) |
| `supa.py` `list_users_by_email_prefix` | `admin/users` `page`/`per_page` 分頁掃到空頁 | 參數名正確、不把單頁當全集,無此病 |
| `supa.py` `create_confirmed_user` / `fetch_signup_otp` / `password_grant_token` / `delete_user` | `admin/users` POST、`admin/generate_link`、`token?grant_type=password`、`admin/users/<id>` DELETE | 參數名皆為 GoTrue 文件欄位,無此病 |
| `supa.py` `storage_list` / `storage_delete` | `object/list/{bucket}` `{prefix, limit:1000}`、`object/{bucket}` `{prefixes}` | 參數名正確;`limit:1000` 不翻頁,但只列單一使用者資料夾(幾張證件照),碰不到上限 |
| `journey.yml` | Management API `config/auth` PATCH、`auth/v1/signup`、`admin/users/<id>` DELETE、`auth/v1/settings` | 參數名正確,以 id 定址;PATCH 失敗會看 HTTP code 硬停 |
| `test-helpers.ts`、`name-write-paths.test.ts` | `auth.admin.createUser`/`deleteUser`/`generateLink` | SDK 型別呼叫,無此病 |

- 結果:□ 無同病灶 ☑ 找到——一併修:本 bug / 記債:`queryPayUniTradeStatus`(friction-log 2026-10-25 條)。
  它的查詢層回應 `Status !== 'SUCCESS'` 一律回 `stillProcessing`,不記錄、不告警:若 payload 欄位名不對,每一輪
  都會拿到 PayUni 的錯誤狀態,卡單永遠「處理中」,端點照樣回成功——與本 bug 同一個「錯誤長得像正常」的形狀。
  欄位名本 session 無法對 PayUni 文件驗證(`index.ts` 註解自己也寫「以官方文件為準、上線前 sandbox 驗一輪」,
  `docs/`、`.github/` 內找不到驗過的紀錄),
  屬金流、不在本 PR 範圍,記債。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 唯一呼叫者是 `AuthPage.handleCheckEmail`;回應契約 `{ exists }` 不變。新增失敗路徑 503:前端對非 2xx 已顯示錯誤 toast(含 `API returned ${status}`),e2e `set_check_email_error()` 已有情境,前端不必改。限流與 `clientIp` 不動,離線守衛要的 `rateLimit(`、`` `check-email:${ ``、`{ error: '…' }, 429` 都保留。函式只給 service_role,anon 拿前端公開 key 打 `/rest/v1/rpc/find_auth_user_by_email` 會被拒(測試第 4 條)。 |
| 架構 | 點狀 bug,但暴露的是「手寫 HTTP 呼叫外部服務」沒有型別也沒有執行期訊號。修法改成資料庫內精確查詢:不依賴 GoTrue 的查詢參數語意,成本不隨會員數成長(單次查詢),而且是 R2 Email 邀請之後要共用的函式(總綱 §2.3A E)。auth schema 由 GoTrue 擁有,讀 `auth.users` 的 security definer 函式在本 repo 已有先例(`admin_member_list` 等)。不需升級 `/plan-feature`。 |
| UIUX | 錯誤不是 UX 誘發的;是後端給了錯的答案,把使用者導去錯的表單。503 時使用者看到「暫時無法檢查 Email，請稍後再試」而不是被送去設定密碼——比靜默給錯答案好。 |
| 需求 | 正確行為規格書已定義(§4.1 Step 0:已註冊 → 登入、未註冊 → 設定密碼),本 bug 是實作違反規格,不是規格缺漏。RPC 失敗時回 503 是新行為,規格書 Step 0 只定義回應形狀 `{ exists }`,錯誤路徑未列——與其他端點的 fail-closed 慣例一致,不需人裁決。 |

## 5. 修法與驗證

- 修了什麼(綠燈 commit `fix(auth): /auth/check-email 改以 find_auth_user_by_email 精確查 auth.users`):新 migration `20261025000001_find_auth_user_by_email.sql`(SECURITY DEFINER、`lower(email) = lower($1)`、
  排除軟刪除 `deleted_at is null`、只回 7 個帳號狀態欄位、只給 service_role);`/auth/check-email` 改呼叫
  `sb().rpc('find_auth_user_by_email', …)`,`error` → 503 `{ error: '暫時無法檢查 Email，請稍後再試' }`,成功 → `{ exists: data.length > 0 }`;
  拿掉對 `SUPABASE_URL`／`SUPABASE_SERVICE_ROLE_KEY` 的直接 fetch。
- 為什麼這樣修是對的(對照根因):根因是「靠一個 GoTrue 不認的參數去縮小範圍,再在單頁裡比對」。新查詢在資料庫裡
  以 email 精確比對整張 `auth.users`,沒有分頁、沒有參數語意可誤用;大小寫由 `lower()` 兩側處理(GoTrue 存 email
  本來就小寫,`filter` 實測大小寫敏感,不能直接拿來替代)。fail-closed 補的是同一個症狀的第二個來源:舊實作 `!res.ok`
  回 `exists:false`,暫時性故障也會把既有會員送去設定密碼。
- `auth.users.deleted_at` 以本機 `\d auth.users` 核對存在(`timestamp with time zone`)。
- 本機驗證(CLI 2.122.0、gotrue v2.197.0):新檔 5 條全綠;`check-email-rate-limit.test.ts`、`rate-limit.unit.test.ts`
  全綠;完整 `deno task test:db` 337 過、2 紅——`name-write-paths.test.ts`「GRANT：authenticated 失去 name 的 UPDATE 權限」
  與 `rls-policies.test.ts`「listings GRANT：anon…」,正是 friction-log 2026-10-17 記載「本機 CLI 新於 CI 釘的 2.109.1
  時這兩條 GRANT 斷言必紅」的同一對,與本改動無關;以 CI `api-tests`(2.109.1)為準。
  `e2e/journey` `pytest tools/` 89 條全綠(含 `test_check_email_quota.py` 的原始碼抽取守衛)。

## 6. 防線回填

- 為什麼既有閘門沒攔到:見 §2「為什麼沒被發現」——沒有斷言 `exists:true` 的測試;而且 fixture 天生是最新建立的帳號,
  就算寫了也修前修後都綠。舊版修過一次(Phase 10.2),那次修正沒有測試,重寫時被靜默撤回。
- 處置:☑ 已補閘門:`check-email-lookup.test.ts`(第 51 位仍 exists、RPC 失敗 503、只給 service_role)
  ☑ 記 friction-log:2026-10-25 條(引用既有呼叫或改寫 SDK 呼叫為手寫 HTTP 時先核對對方的參數名;
  測試要刻意造出 bug 的前提,不能只用天生落在第一頁的 fixture;PayUni 查詢記債)
