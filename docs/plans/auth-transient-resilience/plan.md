# 暫時性故障不登出（工項 T1-B）規劃書（v2.1：業主裁決 W4-11～17、v1 審查 P1 修訂、v2 審查 P1 落地）

<!-- 鷹架：第 4 波 T1-B（裁決 W4-1、W4-6）。上游＝第 3 波 T1 子 plan 的 PR-B：
     `git show b4b5bdcb:docs/plans/auth-state-trust/plan.md`（§2.3、§2.4、§2.5、§5 B1–B3、§7）
     與總綱 `git show 55268e03:docs/plans/platform-growth-and-trust/plan.md` §1.2B。
     本檔只寫「PR-A（#466）上線後的現況差異」與併入的 R3 P2-6、P2-15。
     v1 審查：`git show 65fb23c:docs/plans/auth-transient-resilience/review.md`；v2 審查＝同目錄 review.md（P1 已落地處標〔v2審〕）。
     讀碼基準：develop 27b09a0（2026-11-01）；F1（fix/signout-cleanup）會先動 useAuthBootstrap／apiClient／AuthPage，
     實作前 rebase 後行號一律現算。 -->

## 0. 一句話

讓**已登入的人**在 `/profile` 慢、5xx、斷網或後端讀取抖動時**不被登出、不被導去 `/login`**，改停在原頁看到「網路不穩，正在重新連線」與「重試」，
因為現況冷啟動遇暫時性故障會畫訪客版並導 `/login`（R3 P2-15），後端把讀取失敗翻成 404 → 前端 global `signOut`（規格書 §14 #8①②），
且 `/profile` 404 在 bootstrap 與 OTP 兩條路徑語意相反（R3 P2-6）。

### 0.1 裁決（業主 2026-11-01 21:00，主 session 轉達）

| # | 題 | 裁決 | 落在 |
|---|---|---|---|
| W4-11 | `/profile` 404（Q1） | **B**：不登出；停在 `/login` 顯示「帳號資料異常，請聯絡客服」，不自動導頁（防重登循環）；bootstrap、OTP、登入表單三處統一 | §2.4 |
| W4-12 | `accountStatus:'unknown'`（Q2） | 不加；五讀取任一失敗一律 503 | §2.1 |
| W4-13 | 無效 session 系統清理 scope（Q3） | `local`，保留邀請 token | §2.5 |
| W4-14 | apiClient 兩層確認（Q4） | 本 PR 做、排**最後階段**；11/15 前來不及可降級拆第 5 波 | §5 B7 |
| W4-15 | degraded 文案（Q5） | 標題「網路不穩，正在重新連線」＋「重試」；說明「請稍後按重試」；**不加輪詢**（focus／online 各自動重試一次） | §4.1 |
| W4-16 | degraded 出口（Q6） | callout 加次要「登出」鈕，**必做**，走主動登出 global（`signOutWithFallback`） | §4.1 |
| W4-17 | 首頁 degraded 無提示（Q7） | 頁首空槽接受為已知取捨，列規格書已知限制 | §4.2、§7 |

## 1. 使用者需求

- 溯源：規格書 §5.3「讀取失敗不是尚未確認……一律 fail-closed 回 5xx」、§14 #8①②；總綱 §1.2B；子 plan D4、D6（8 秒）、E1；R3 review §1.3 P2-6、P2-15；
  業主 W4-11～17。R3 兩條原文（`docs/plans/launch-wave-3/review.md` §1.3 P2 表，第 6、15 列，約 :86、:95）：
  - P2-6：「`/profile` 404 的語意兩邊不一致。bootstrap 視為無效 session，直接 global signOut；OTP 路徑則視為『profile 列還沒建好，繼續註冊』」。
  - P2-15：「冷啟動 `/profile` 5xx 時狀態是 `anonymous/transient`，頁首畫訪客版。user=null 時 `useRevalidateOnFocus` 不啟動」。
  （wave-3 plan／dispatch 另有一個 P2-15 指 `homeListingsCache.test.ts`，是不同表的編號，與本工項無關。）
- `referral_codes`、`effective_registration_step` 讀取失敗改 503 超出 §14 #8 字面，依據是 §5.3 同一原則（「不退化成預設值」）——`step ?? 1` 會把
  已付款者當未付款，與 pending 訂單同一個重複付款風險。B8 在 §5.3 逐項寫明。

### 1.1 現況（讀碼事實，行號以 27b09a0 為準、開工時現算）

| # | 位置 | 現況 | 後果 |
|---|---|---|---|
| C1 | `useAuthBootstrap.ts:184-187`＋reducer `:109-111` | 冷啟動 `/profile` transient → `anonymous`／`transient` | 頁首訪客版；守衛 `<Navigate to="/login">`（P2-15） |
| C2 | `App.tsx:211-218` | `useRevalidateOnFocus(() => isLoggedIn, …)` | `user=null` 時 focus 不重試（P2-15） |
| C3 | `useAuthBootstrap.ts:219-226` | `getSession()` 不看 `error`；refresh 遇 retryable 錯誤時回 `session:null`＋error → `signedOut` | 暫時性故障在 `/profile` 之前就被當登出、清提示 |
| C4 | `fetchProfile.ts:24`＋bootstrap `:180-183` | 404 歸 `unauthorized` → `signOutWithFallback`（global） | 與 C5 相反（P2-6） |
| C5 | `routeAfterVerifiedSession.ts:36-41` | 只有 401 重登；404 **與 transient** 都落 else → 導 complete-profile | 老會員在 OTP／邀請入口遇故障被送進註冊頁 |
| C6 | `PaymentCheckout.tsx:176-185` | 無 `pendingUser` 時自己 `fetchProfileForSession`，非 ok（含 transient）與 catch 一律 `navigate('/login')`。路由雖在 `ProtectedRoute` 下（`App.tsx:356-359`），但守衛放行後這次自有讀取的失敗不經守衛 | bootstrap 已成功、這次讀取遇故障就被踢去登入 |
| C7 | `index.ts:249-253` `requireAuth` | `auth.getUser` 任何錯誤 → 401；拋非 Auth 例外 → Hono 500 | Auth 抖動被當無效 session |
| C8 | `index.ts:444-534` `buildProfileResponse` | 五讀取只取 `data`；profiles 失敗→null→404；`step ?? 1`；`?? 'expired'`；pending 失敗→未付款 | §14 #8①② |
| C9 | `index.ts:765-790` `/auth/register` | `register_profile` 寫入成功**之後**才 `buildProfileResponse` | 若改 503 而不定契約，前端誤判失敗、重送遇 403「註冊已完成」 |
| C10 | `apiClient.ts:80-90,192-210` | refresh 任何錯誤 → 401 → global `signOut`（F1 改成 `signOutWithFallback`，仍 global） | Auth 抖動時任一 API 呼叫登出所有裝置 |
| C11 | `AuthPage.tsx:192-221,374-388` | 掛載 effect：unauthorized 與 **catch** 都 `signOut()`；登入表單 404／410 → `signOut` | 例外與 404 都變登出 |

- 已核實：`profiles` 由 `after insert on auth.users` trigger 同交易建立（`20260620000003_functions_and_views.sql:55`）→ auth user 有效而 profiles
  零列＝資料異常。410 只出自 `referral-invite.ts`，`/profile` 不回 410。
- 已核實：`useRevalidateOnFocus` 只掛 `focus`／`visibilitychange`，**沒有 `online`**。`@contract` alias 讓前端可 import `_shared/api-contract.ts`（`vite.config.ts:64`）。
- 已核實：`/auth/complete-registration` 在 `src/` 無呼叫者；`/auth/register` 唯一呼叫者 `CompleteProfile.tsx:541`。raw `apiRequest` 呼叫者只有
  `listingPhotosApi.ts`（3 處），已處理 `ApiError`。

### 1.2 驗收情境（可證偽；e2e 全 mock；e2e 斷言用 role／testid，不綁文案）

| # | 情境 | 證偽方法 |
|---|---|---|
| R1b | 〔v2審〕`/admin`（AdminRoute）與會員專屬頁（RequireMembershipRoute）在 degraded 同樣不放行、不導 `/login`、顯示 callout | vitest jsdom 兩守衛各一案 |
| R1 | 有 session、冷啟動 `/profile` 連兩次 503（首次＋自動重試）→ **必進 degraded**：停在原受保護頁（URL 不變），主內容區 degraded callout（重試＋登出）；從未導 `/login`、未呼叫 logout | e2e `route_guards.feature`：mock 503×2；斷言 URL、`data-testid="auth-degraded"`、`/auth/v1/logout` 計次 0 |
| R2 | R1 後按「重試」，`/profile` 已恢復 → 正常渲染；重試中 callout 不卸載、鈕 `aria-disabled`；〔v2審〕使用者按重試而成功時焦點移到 `main`；再失敗時說明換成連續失敗文案 | e2e `set_profile_sequence([503,503,200])`＋vitest（`document.activeElement`） |
| R3 | 首次 503、自動重試 200 → 只看到載入態，無 callout；第二個請求帶 `?retry=1` | vitest renderHook（fake timers）＋e2e 斷言 URL query |
| R3b | `getSession()` 回 `session:null`＋retryable error → 不清提示、走同一重試／degraded 流程；〔v2審〕同時觸發 `INITIAL_SESSION(null)` 也不進 `signedOut` | vitest renderHook |
| R4 | `/profile` 超過逾時未回 → 視同 transient | vitest（fake timers）；e2e mock 延遲一案 |
| R4b | 〔v2審〕守衛 spinner 有可讀文字，5 秒後換「連線較慢」文案 | vitest jsdom（fake timers） |
| R5 | degraded 時 `visibilitychange`（可見）／`online` → 觸發一次重試；〔v2審〕重試在飛時事件不再發請求；該次失敗後下一個事件可再試（不是輪詢：沒有事件就不發） | vitest renderHook |
| R6 | 已有 user 的背景重驗遇 503 → 狀態不變 | 既有測試續綠 |
| R6b | transient 後同 uid 的 SIGNED_IN 重播 → 不產生第二個在飛請求；degraded 中 SIGNED_OUT → 離開 degraded、移除監聽、取消計時器 | vitest renderHook |
| R6c | degraded 中重試得到 401 → `endInvalidSession` → `/login` | vitest renderHook |
| R7 | 後端：`auth.getUser` retryable／status 0／≥500／429／拋例外 → `/profile` 503；`AuthApiError` 4xx → 401 | deno test |
| R8 | 後端：五讀取任一 error → 503 `PROFILE_UNAVAILABLE`（含自癒遞迴）；rpc 回 null → 503；profiles 零列仍 404 | deno test 逐讀取 |
| R8b | `/auth/register` 寫入成功、讀取失敗 → 503 `PROFILE_UNAVAILABLE`；前端不顯示「註冊失敗」、不重送，改 `refreshUser()` 接續成功路徑；refresh 仍失敗 → 留本頁、〔v2審〕頁內持久 callout＋「重新載入資料」鈕、送出鈕 `aria-disabled` | deno test＋vitest jsdom（CompleteProfile） |
| R9 | 其餘端點 `requireAuth` 401 零變化 | deno 列舉測試（三檔） |
| R10 | `/profile` 404：bootstrap、OTP／邀請入口、登入表單三處都**不登出**，落在 `/login` 顯示異常 callout（含登出鈕）、不自動導頁；重整後仍是同一畫面（無循環） | vitest 三入口＋e2e 一案 |
| R10c | 〔v2審〕AuthPage 掛載 effect：fetch 拋例外或 transient → 不登出、導 `/dashboard`；401／410 → `endInvalidSession`＋邀請 token 保留；`authAnomaly` 為真時直接顯示異常 callout、不再打 `/profile` | vitest jsdom |
| R10b | OTP／邀請入口遇 transient → 不 ingest、不導 complete-profile，改導 `/dashboard`（由守衛的 degraded 接手） | vitest |
| R11 | 結帳頁冷載入遇 transient → 停在 `/payment/checkout` 顯示同一 degraded callout，重試成功後照常；401 才導 `/login` | vitest jsdom＋e2e 一案 |
| R12 | 漏斗頁（complete-profile、checkout）degraded 不改進度、不清草稿 | vitest |
| R13 | 首頁 degraded：無 callout、頁首有提示依提示、無提示為空槽（W4-17） | vitest（authView）＋e2e 一案 |
| R14 | degraded callout 的「登出」走 `signOutWithFallback`（global）、導 `/`；頁首主動登出行為不變 | vitest |
| R15 | 〔B7 降級時移第 5 波，改驗「apiClient 401 維持 F1 後行為」〕apiClient：401 → refresh 回 retryable／≥500／429 → 不登出、拋 `AUTH_UNAVAILABLE`；refresh 成功仍 401 → `/profile` 確認：transient 不登出、401 才 `endInvalidSession`；〔v2審〕確認 ok／missing 後的端點 401 不登出 | vitest node（B7） |
| R16 | `endInvalidSession` 後：本機 session 清、提示清、邀請 token 依情境保留、導 `/login` | vitest |

### 1.3 不做

- 不改 `requireAuth` 本體與其餘端點 401（殘餘由 B7 補償）。不加 `accountStatus:'unknown'`（W4-12）。
- 不做退避表、低頻輪詢（W4-15）、全站常駐狀態行、ErrorBoundary、PageSkeleton。
- 不改使用者主動登出（頁首、漏斗、degraded callout 的登出都是 global）。
- 不動 PR-A 的提示、funnel 判定、頁首五 view 既有語意（只新增 `degraded`）。
- 不碰 PayUni callback、`complete_paid_pending_orders`、migration。§14 #8③④不在範圍。
- 其他頁面自己的 `fetchProfileForSession`（CompleteProfile 載入）語意不改：CompleteProfile 遇 transient 本來就「允許繼續填」。

## 2. 系統設計

### 2.1 後端（B1）

- `authenticate(token) → { user } | { error: 'unauthorized' | 'transient' }`，**只給 `profileHandler`**，整段 try/catch：
  `isAuthRetryableFetchError`、status 0／≥500／429、**拋出任何例外** → transient（503）；其餘 `AuthApiError`（400／401／403 含 `user_not_found`）→ 401；無 token → 401。
- `buildProfileResponse` 五讀取全查 `error`，非零列錯誤擲 `ProfileReadError(readName)`：

  | 讀取 | 零列 | 查詢失敗 |
  |---|---|---|
  | `profiles` `.single()` | PGRST116 → null → 404（維持） | 503 |
  | `user_account_status` `.single()` | PGRST116 → `expired`（現況語意；view 以 profiles 為底一人一列，多列不會發生——B1 讀 view 定義確認並在註解寫明） | 503 |
  | `referral_codes` `.maybeSingle()` | `referralCode:null` | 503 |
  | `payment_orders` pending | `[]` | 503（重複付款風險） |
  | `effective_registration_step` rpc | — | 503；**rpc 回 null 亦擲**；刪 `step ?? 1` |

- 呼叫者 catch `ProfileReadError` → 503 `{ error: { code: 'PROFILE_UNAVAILABLE', message: '暫時無法讀取帳號資料，請稍後再試' } }`（涵蓋自癒遞迴）：
  - `profileHandler`、`/auth/complete-registration`：照上。
  - **`/auth/register`（post-write 契約）**：此端點的 `PROFILE_UNAVAILABLE` **只可能發生在寫入成功之後**（寫入失敗是 500「更新失敗」），契約即「已寫入、
    讀不到」；`api-contract.ts` 在常數註解寫明，前端據此不重送（§2.6）。
  - 不加全域 `app.onError`。
- `?retry=1`：只跳過 `healPaidPendingOrdersBestEffort`、`repairOrphanedPaymentsBestEffort` 兩支 RPC；step 3 的 `paidAwaitingActivation=false` 照常。
  待開通者的重試回應是未自癒的 step 2＋`paidAwaitingActivation:true` → 守衛導結果頁（正確）、結果頁輪詢的非 retry `refreshUser` 才自癒；B4 一案釘住。
- 〔v2審〕契約註解只寫單向：「`/auth/register` 回 503＋`PROFILE_UNAVAILABLE`＝已寫入」；500 的語意不保證（重送冪等：`register_profile` 已完成回 403，`CompleteProfile.tsx:572-580` 已處理）。
- 〔v2審 P2〕B1 在註解與 deno 測試釘住 `uq_referral_codes_one_active`（`maybeSingle` 不因多列報錯的前提）。
- 契約：`_shared/api-contract.ts` 加 `PROFILE_UNAVAILABLE`；前端讀者＝`CompleteProfile`（§2.6）與 `apiClient`（B7 區分 503 種類時可用），經 `@contract` import。
  **Migration：不需要。**

### 2.2 模組切分與 `fetchProfile`（B2）

- **抽 `src/utils/apiUrl.ts`**（`projectId`＋`buildApiUrl`，零依賴）；`apiClient.ts` 改 re-export 維持既有 import 不變；`fetchProfile.ts` 改從 `apiUrl` 取。
  之後 apiClient → fetchProfile → apiUrl 單向，無循環（B7 需要）。
- 逾時**不設全域預設**（v1 審查：預設會改變全站呼叫者行為）：匯出 `PROFILE_FETCH_TIMEOUT_MS = 8_000`（D6）與 `PROFILE_RETRY_TIMEOUT_MS = 5_000`，
  由 bootstrap 冷啟動／重試、AuthPage 掛載 effect、`routeAfterVerifiedSession`、PaymentCheckout 冷載入**明確傳入**；PaymentCheckout／PaymentResult 的
  `force` 輪詢與 `refreshUser` 不傳（行為同今天）。
- 選項加 `retry?: boolean` → URL `?retry=1`。合併規則：`retry` 請求**不加入**既有在飛請求，但**登記**為該 uid 的在飛請求（取代舊的），使之後
  AuthPage 等非 retry 呼叫合併到它，避免與 retry 並行再跑 heal／repair。
- 分類維持 `ok`／`unauthorized`／`transient`，**新增 `kind:'missing'`（404）**；401／410 → `unauthorized`。呼叫端各自處置 `missing`（§2.4）。
- 〔v2審〕**B2 不改任何呼叫端行為**：同階段把所有消費端改成 exhaustive `switch`（`never` 斷言，型別檢查逼出漏處），`missing` 暫時映射到現況的 404 處置
  （bootstrap 登出、`routeAfterVerifiedSession` 導 complete-profile、AuthPage 清理）；既有 fetchProfile 404 測試同步改寫。行為改變在 B4／B6 落地。
- 〔v2審〕B2 加一案：被取代的舊請求晚於 retry 結束時，`finally` 不得刪掉 retry 的在飛登記（`fetchProfile.ts:37-41` 的 `map.get===p` 判斷）。

### 2.3 bootstrap 狀態流（B4）

**reducer 轉移表**（`outcome` 新增 `retrying`、`degraded`、`anomaly`；`isLoadingUser` 仍＝`authState==='unknown'`）：

| action | 從 | 到 `authState`／`outcome` | 備註 |
|---|---|---|---|
| `start`（新 uid） | 任何 | `unknown`／`none`，清資料 | 現況 |
| `transient`（冷啟動首次） | `unknown`／`none` | `unknown`／`retrying` | 排程自動重試 |
| `transient`（重試後） | `unknown`／`retrying` 或 `degraded`（手動／事件重試中） | `degraded`／`degraded` | 提示保留 |
| `retry`（手動／事件） | `degraded` | `degraded`／`degraded`＋`isRetrying:true` | **不回 unknown**：callout 不卸載（v1 UI/UX P1） |
| `transient`（已有資料） | 有 `user`／`funnelProfile` | 不變 | R6 |
| `profile` | 任何非 signedOut | `authenticated`／`ok` | 現況 |
| `missing` | 任何 | `anonymous`／`anomaly` | §2.4；提示清除 |
| `signedOut` | 任何 | `anonymous`／`signedOut` | 現況 |

- **排程與在飛的單一來源**：hook 內一個 `attemptRef = { timer, inFlight }`；`begin()` 若 `attemptRef` 有排程或在飛就**不另發**（解掉 transient 後
  `uidRef=null` 讓 SIGNED_IN 重播再發一條的競態，v1 系統 P1），換 uid 時才取消重來；`endSession`、unmount、SIGNED_OUT 都清 timer 與事件監聽。
  transient 不再 `uidRef.current = null`（改由 `attemptRef` 管重試）。
- 〔v2審〕**session 有無的唯一判定者是 `getSession()`**：`onAuthStateChange('INITIAL_SESSION', null)` 只在 `getSession()` 已無 error resolve、且
  `attemptRef` 無排程時才 dispatch `signedOut`（現況 `:237-238` 會在初始化 refresh 失敗時搶先清提示）。`AuthBootstrapSupabase.getSession()` 型別擴充
  `error`，既有 hook 測試 mock 同步補。
- 〔v2審〕**重試入口偽碼**（自動重試、`retryAuth`、事件重試共用）：
  ```
  retry():
    if attemptRef.inFlight → return
    { session, error } = await getSession()
    if !session: error 為 retryable → dispatch transient（排下一步／進 degraded）；否則 → signedOut
    elif uidRef === session.user.id → load(token, uid, { retry:true })   // 不經 begin（同 uid 會早退），不動 uidRef
    else → begin(session)                                               // 換人或 R3b 首次取得 session
  ```
  自動重試**不 dispatch `start`**（那會回 INITIAL、清掉 `retrying`）。`profile`／`setUser`／`signedOut`／`missing` 與 `ingestProfile`、成功的 `refreshUser`
  一律清 `attemptRef.timer`；在飛請求以 `genRef` 判定是否作廢。排程與事件監聽抽成 `src/hooks/authRetryScheduler.ts`（純邏輯、可獨立測），
  hook 只接線——〔v2審 P2〕避免 hook 膨脹到 500 行以上。
- 〔v2審〕提示衍生：`anomaly` → `hintKind = null`（清）；`retrying`／`degraded` → `undefined`（保留）。anomaly 時 `uidRef` 保留（SIGNED_IN 重播不重打）。
- 冷啟動時間預算：首次 8 秒逾時＋1 秒後自動重試（5 秒逾時）→ **最壞約 14 秒**進 degraded；spinner 5 秒後換「連線較慢，仍在載入…」（§4.1）。
  `SESSION_STALL_MS` 與 `:215` 註解同步更新（PR-A 已知限制 3 解除）。
- **`getSession()` 錯誤（R3b）**：回 `error` 且屬 retryable（`isAuthRetryableFetchError` 或 status ≥500／429／0）→ 不 `signedOut`、不清提示，
  比照 transient 走重試；非 retryable error 或無 error 的 null → 照現況 `signedOut`。重試時重新 `getSession()` 取 token。
- **事件重試**：重用 `useRevalidateOnFocus(() => outcome==='degraded' && !isRetrying, retryAuth)`（hook 內**新的一次呼叫**，App 既有字面不動），
  另掛 `online` 監聽（`useRevalidateOnFocus` 沒有）；只在 degraded 時觸發，各一次。
- context 加 `retryAuth()`、`isRetrying`、`authAnomaly`（布林）；函式穩定 identity；memo deps 加 `isRetrying`、`authAnomaly`（`appShell.test` 的 deps 斷言同步加，
  屬擴充不是放寬）。
- `unauthorized`（401／410）→ 注入的 `endInvalidSession`（§2.5）；`missing` → `anomaly`（§2.4）。

### 2.4 `/profile` 404＝帳號資料異常（P2-6，W4-11）

- 三入口統一「**不登出、落在 `/login`、顯示異常 callout、不自動導頁**」：
  - bootstrap：`missing` → `anomaly`；`authState:'anonymous'` 使守衛照常導 `/login`；提示清除（避免下次首繪畫頭像）。**session 保留**。
  - `routeAfterVerifiedSession`：`missing` → `navigate('/login')`（不 ingest）；`transient` → `navigate('/dashboard')`（由守衛 degraded 接手，R10b）；
    401 維持現況；`catch` → `/dashboard`（同 transient）。既有測試「404 帶去完善資料頁」**改寫**（`routeAfterVerifiedSession.test.ts:51`）。
  - AuthPage：異常 callout 的顯示條件＝context `authAnomaly` **或**本頁讀取得到 `missing`〔v2審〕；`authAnomaly` 為真時掛載 effect 不再打 `/profile`。
    callout：`StatusCallout variant="destructive"`（`data-testid="auth-anomaly"`）「帳號資料異常，請聯絡客服」＋說明「為保護您的資料，系統暫停此帳號的登入流程。」
    ＋次要動作「LINE 客服」（既有常數 `LINE_OFFICIAL_ACCOUNT_URL`，`utils/constants.ts:31`，與 Footer／結帳頁同一入口）＋「登出」鈕（global）；
    **不呼叫 signOut、不導頁**。標題文案為 W4-11 原文；說明句、LINE 連結、登出鈕與隱藏表單是 W4-11 的衍生設計（session 保留時沒有它們使用者無法行動）。
  - AuthPage 掛載 effect 的其他結果〔v2審〕：`transient`、`catch` → **不登出**、`navigate('/dashboard')`（守衛 degraded 接手）；401／410 → `endInvalidSession`
    ＋`keepInviteToken()`。檢查期間（`sessionState==='checking'` 且有 session）不畫可輸入的登入表單，畫既有 spinner。
  - 登入表單送出〔v2審〕：`missing` → 異常 callout；401／410 → `endInvalidSession`＋現有「帳號不存在」處置；`transient` → 維持現況錯誤 toast、不登出。
    已登入自動導向（`AuthPage.tsx:231-236`）依賴 context `user`，anomaly 時 `user=null` 不會觸發 → 無循環。重整後 bootstrap 再得 404 → 同畫面（R10）。
- 邀請入口：anomaly 時 `sessionState` 歸 `signed_out`（不清邀請 token）。

### 2.5 `endInvalidSession`（B3）

- `src/utils/endInvalidSession.ts`（不 import App）：`endInvalidSession({ auth, storage? })`：`auth.signOut({ scope:'local' })`（吞例外）→
  `clearAuthHint(storage)` → 移除 `user`／`pendingSession` 舊鍵。**不**導頁、**不**動 React state、**不**清邀請 token——各呼叫端自己處置：
  - bootstrap：注入鍵 `AuthBootstrapDeps.endInvalidSession`（預設綁真模組），hook 自己 `dropHint()`（React hint state 由 hook 擁有）＋`endSession()`。
  - AuthPage 掛載 effect：呼叫後 `keepInviteToken()`、`settle('signed_out')`（R2 交接三件事保留）。
  - apiClient（B7）：呼叫後 `emitSessionExpired()`。
- SIGNED_OUT 事件仍會觸發 `onSignedOut`（清快取、邀請 token）——AuthPage 的 `keepInviteToken()` 在其後寫回，順序同今天。
- `appShell.test.ts:188-196` 改寫為「這三檔原始碼含 `clearAuthHint()` **或** `endInvalidSession(`，且 `endInvalidSession.ts` 含 `clearAuthHint(`」——
  守的行為（無效 session 一定清提示）不變，屬**等價收斂**；白名單（authHint 寫入者）加 `endInvalidSession.ts`、不得 import App 清單加該檔與 `apiUrl.ts`、`authRetryScheduler.ts`；
  apiClient 若不再直接呼叫 `clearAuthHint` 就從白名單移除（收緊）。

### 2.6 漏斗頁（B5）

- **PaymentCheckout**（`:176-185`）：冷載入傳逾時；`transient`／catch → 不導頁，畫共用 `AuthDegradedNotice`（§4.1）＋重試重跑 `loadUser`；
  `unauthorized` → `/login`（現況）；`missing` → `/login`（AuthPage 顯示異常）。
- **CompleteProfile 送出**（`:541-585`）：`503`＋`PROFILE_UNAVAILABLE` → 不丟「註冊失敗」、不重送；`refreshUser()`：取得完整 profile → 走既有成功路徑
  （`pendingUser`、`setUser`、清推薦暫存、清草稿、導下一步）；仍失敗 → 留本頁、草稿不清，〔v2審〕表單上方持久 `StatusCallout variant="warning"`「資料已送出，連線不穩」＋action「重新載入資料」（呼叫 `refreshUser`，成功即走成功路徑），送出鈕 `aria-disabled`（防重送遇 403）。

### 2.7 apiClient 兩層確認（B7，最後階段，可降級）

- 落點：`apiRequest` 的 401 分支（`apiClient.ts:80-90`），不是 `apiRequestJson`。
  1. `refreshSession()` 錯誤：retryable／≥500／429／斷網 → 拋 `ApiError('連線不穩，請稍後再試', 503, 'AUTH_UNAVAILABLE')`，不登出；
     `AuthApiError` 4xx → unauthorized。
  2. refresh 成功、重打仍 401 → 以新 session `fetchProfileForSession(session, { force:true, timeoutMs: PROFILE_RETRY_TIMEOUT_MS })`：
     `transient` → `AUTH_UNAVAILABLE`；`unauthorized` → unauthorized；`ok`／`missing` → 該次請求照 401 失敗但**不登出**（session 有效、是端點自己的 401）。
  3. 〔v2審〕分流靠 `ApiError.code`：確認 unauthorized → `SESSION_INVALID`；端點自己的 401（確認為 ok／missing）→ `UNAUTHORIZED`。`apiRequestJson` 的 catch
     **只對 `SESSION_INVALID`** 呼叫 `endInvalidSession({ auth })`＋`emitSessionExpired()`；`UNAUTHORIZED` 照常拋出、不登出。
  4. apiClient 在 B7 後不再直接呼叫 `clearAuthHint` → 從 authHint 白名單移除（收緊）；**B7 降級時白名單維持不動**。
- `AUTH_UNAVAILABLE` 的使用者呈現：沿用各呼叫端既有錯誤處理（toast／頁內錯誤顯示 `ApiError.message`）——訊息即「連線不穩，請稍後再試」；
  不轉 degraded（degraded 只屬登入狀態判定）。raw `apiRequest` 呼叫端（`listingPhotosApi.ts` 3 處）已 catch `ApiError`，不需改，B7 列測試確認。
- **降級**（W4-14）：B7 整段延到第 5 波時，apiClient 401 維持 F1 後的 `signOutWithFallback`（global）；B8 在 §14 #8 補一列殘餘（§5）。

## 3. 架構影響

| 檔案 | 階段 | 處置 |
|---|---|---|
| `supabase/functions/api/index.ts` | B1 | `authenticate()`、`ProfileReadError`、三呼叫者 503、`?retry=1` |
| `supabase/functions/_shared/api-contract.ts` | B1 | `PROFILE_UNAVAILABLE`（註解寫 register post-write 語意） |
| `src/utils/apiUrl.ts`（新）、`apiClient.ts`、`fetchProfile.ts` | B2 | 抽 URL、`missing`、`retry`、逾時常數 |
| `src/utils/endInvalidSession.ts`（新）、`appShell.test.ts` | B3 | 本機清理；守衛等價改寫 |
| `src/hooks/useAuthBootstrap.ts`、`App.tsx`（context 欄位） | B4 | §2.3 |
| `routeAfterVerifiedSession.ts`、`AuthPage.tsx`、`PaymentCheckout.tsx`、`CompleteProfile.tsx` | B6 | §2.4、§2.6 |
| `ProtectedRoute`／`AdminRoute`／`RequireMembershipRoute`、`authView.ts`、`AuthDegradedNotice.tsx`（新） | B5 | §4 |
| `apiClient.ts` | B7 | §2.7 |
| `src/hooks/authRetryScheduler.ts`（新） | B4 | §2.3 |
| 規格書、`docs/e2e-journey-test-design.md`（如有 `/profile` 計次描述）、e2e | B6、B8 | |

- **撞檔**：F1（`fix/signout-cleanup`）同碰 `useAuthBootstrap`（換 uid 清快取、碰 `begin()`）、`apiClient`、`AuthPage`、`CompleteProfile`（取消註冊）。
  實作等 F1 合併後 rebase（W4-3）；B0 產出 F1 後 `begin()`／`load()`／`endSession()` 的結構快照記 progress.md，B4 紅燈前確認 `attemptRef` 與 F1 新增的
  換 uid 清快取的先後。B7 會把 F1 換上的 `signOutWithFallback` 再換成兩層確認——與 F1「不留裸 signOut」目的一致，PR 內文說明。
- 多步驟流程四契約：degraded 不改進度、不清草稿；register post-write 以 `refreshUser` 接續，不重送（冪等不受挑戰）。
- 安全：無效 session 本機登出（W4-13）；anomaly 不登出但 `user=null`、守衛不放行，不給受保護資料。

## 4. UI/UX

### 4.1 degraded 呈現（`AuthDegradedNotice`，守衛與 PaymentCheckout 共用）

- `StatusCallout variant="warning"`（`data-testid="auth-degraded"`），`titleAs="h2"`：標題「網路不穩，正在重新連線」；說明「請稍後按重試」；連續失敗後說明換成
  「仍無法連線，請稍後按重試」（W4-15）。
- 〔v2審〕`AuthDegradedNotice` 是**純呈現元件**（props：`onRetry`、`isRetrying`、`failedAgain`、`onSignOut`），不讀 context、不 import App；守衛傳 context 的
  `retryAuth`，PaymentCheckout 傳自己的 `loadUser`。
- 按鈕放 `action` slot（`status-callout.tsx:51-58`），依 ui-ux §11.2 傳 `container="warning"`：「重試」primary、「登出」`tone="secondary"`（W4-16）；次要在左、
  主要在右；觸控 ≥44px；320px `flex-wrap`。
- 「登出」〔v2審〕：`onSignOut` 由呼叫端提供，重用 Navbar 會員登出的同一套處理（`signOutWithFallback`、清提示與 context、導 `/`）——B0 核對 F1 後該 handler
  是否已可重用，不可則抽 `hooks/useMemberLogout.ts`（加入 authHint 白名單），**不新增提示寫入點**。按下後 `aria-disabled`＋ref 防連點；`signOutWithFallback`
  補本機登出後照樣導 `/`。異常 callout 的登出同一 handler。
- **重試中**：callout 不卸載（`isRetrying`），「重試」改「重新連線中…」並 `aria-disabled`（ref 防連點），焦點留在鈕上。
  〔v2審〕成功：**只在使用者按下重試而成功時**，守衛把焦點移到 `<main>`（`tabIndex=-1`、`scroll-mt-20`；App 的 main 補屬性），事件／自動重試成功不搶焦點；
  失敗：焦點仍在「重試」，說明換成「仍無法連線，請稍後按重試」（live region 內容變更，至少播報一次）。
- **不搶焦點**：callout 首次出現不移焦點（ui-ux §9「首次載入不搶」）；靠 `StatusCallout` 內建 `role="status"` 播報；容器 `scroll-mt-20`。
  degraded 時頁面同時只出現這一個 callout。
- 冷啟動載入態（守衛 spinner）：補 `<output aria-busy="true">`＋可讀文字「載入中…」，5 秒後換「連線較慢，仍在載入…」（v1 審查核對：`ProtectedRoute.tsx:30-32` 尚無）。

### 4.2 頁首（`resolveAuthView`）

- `degraded`：有提示 → 依提示（`member-pending`／`funnel`）；**無提示 → `placeholder`**（已知有 session，不畫「登入」）。
- 首頁等非受保護頁 degraded：主體照常、無 callout；無提示時頁首空槽（**W4-17 已知限制**，B8 寫進規格書 §2.1 已知限制列）。
- `anomaly`：頁首 `guest`（在 `/login` 上）。

### 4.3 異常 callout（`/login`）

- AuthPage 頁內 `StatusCallout variant="destructive"`（不用 toast：toast 會跟著導頁消失）；文案與動作見 §2.4；按鈕傳 `container="destructive"`；
  表單在 anomaly 時隱藏（已有 session，登入表單無意義）。〔v2審〕傳 `role="alert"`（擋住流程的錯誤、非同步出現）；表單隱藏後頁面若無 h1 則 `titleAs="h1"`。

## 5. 階段切分（每階段一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| B0 | 開工前置（非 TDD）：F1 已合、rebase、`check-migration-versions`；F1 後 `begin/load/endSession` 結構快照與差異記 progress.md；`npm install -g deno` | — | 記錄完成 |
| B1 | 後端 §2.1；401 列舉測試 | deno test（新 `profile-transient.test.ts`） | R7、R8、R8b（後端）、R9；`profile-self-heal`、`profile-masking`、`registration-*` 續綠 |
| B2 | `apiUrl.ts` 抽出、`fetchProfile` 的 `missing`／`retry`／逾時常數 | vitest node | R4（單元）；`retry` 登記在飛且不合併；`missing` 分類；既有 fetchProfile 測試續綠 |
| B3 | `endInvalidSession.ts`；`appShell.test` 等價改寫與白名單 | vitest node＋appShell | R16（單元）；改寫後斷言對現有三檔仍成立 |
| B4 | `useAuthBootstrap` §2.3（轉移表、`attemptRef`、`getSession` 錯誤、事件重試、`retryAuth`、`missing`→anomaly、unauthorized→注入的 `endInvalidSession`）＋App context 欄位 | vitest jsdom renderHook | R3、R3b、R5、R6、R6b、R6c、R10（bootstrap）；待開通者 retry 回 step 2 一案；提示在 degraded 保留、anomaly 清除 |
| B5 | 呈現：`AuthDegradedNotice`（純元件）、三守衛 degraded、spinner 可讀文字、`<main tabIndex=-1>`、`resolveAuthView` degraded／anomaly | vitest jsdom | R1b、R2（vitest）、R4b、R13、R14 |
| B6 | 入口與漏斗頁：`routeAfterVerifiedSession`、AuthPage（掛載 effect、登入表單、異常 callout）、PaymentCheckout（用 B5 的元件）、CompleteProfile 送出；e2e | vitest jsdom＋e2e `route_guards.feature` | R10（三入口）、R10b、R10c、R11、R8b（前端）、R12；R1、R2、R4、R11 e2e；AuthPage R2 三件事既有測試續綠；e2e `/profile` 計次基線重算 |
| B7 | apiClient 兩層確認 §2.7（**可降級**） | vitest node | R15；raw `apiRequest` 呼叫端一案 |
| B8 | 文件：規格書 §5.3 補「`/profile` 讀取失敗＝503，前端停原頁不登出；五讀取逐項」；§14 #8 刪①②（B7 降級時補一列「apiClient 401 時 refresh 錯誤未分類，Auth 抖動仍可能全域登出」）；§2.1 已知限制加 W4-17；`check-spec-drift` | check-spec-drift | 綠 |

模型：B1、B4、B6、B7 與實作審查用 Opus（跨層契約、登出語意）；B2、B3、B5、B8 Sonnet 可。

〔v2審〕**B2–B6 是中間態**（B2 只加分類不改行為、B4 引入 degraded 時守衛到 B5 才接）：各階段 commit 都綠，但只能整個 PR 一起合併。
B3 的 `endInvalidSession` 若在 B3 時只有測試消費者而 knip 報未使用，B3 併入 B4（knip 設定 `knip.json` 的 project＝`src/**`，開工時實跑確認）。

## 6. 開放問題

- [x] Q1–Q7：見 §0.1（W4-11～17）。
- 無新的待裁決題。

## 7. 風險與回滾

- 最壞：真的無效的 session 被誤判 transient → 停在 degraded。防線：後端只把 `AuthApiError` 4xx 判 401；自動重試只一次；callout 有「登出」（W4-16）。
- 後端 503 範圍擴大：某讀取若在正式站**常態性**失敗會讓人卡 degraded。防線：B1 前請主 session 代跑 Logs Explorer 查 24 小時 `/profile` 5xx 與 rpc 錯誤；
  上線後依子 plan §2.4 量測 SQL 看 P95 調逾時。
- anomaly 誤判：若未來 profiles 查詢被新條件擋成零列，會讓人停在 `/login` 異常畫面（**不會**全體登出，W4-11 的取捨）。防線：B1 deno 測試釘「profiles 讀取用
  service role、零列才 404」。
- 已知限制（W4-17）：首頁 degraded 且無本機提示時頁首空槽。
- 回滾：單一 PR revert 即回 PR-A 狀態；無 migration、無資料變更。
