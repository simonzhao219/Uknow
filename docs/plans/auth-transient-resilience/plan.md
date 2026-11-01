# 暫時性故障不登出（工項 T1-B）規劃書

<!-- 鷹架：第 4 波 T1-B（裁決 W4-1、W4-6）。上游＝第 3 波 T1 子 plan 的 PR-B：
     `git show b4b5bdcb:docs/plans/auth-state-trust/plan.md`（§2.3、§2.4、§2.5、§5 B1–B3、§7）
     與總綱 `git show 55268e03:docs/plans/platform-growth-and-trust/plan.md` §1.2B。
     本檔只寫「PR-A（#466）上線後的現況差異」與併入的 R3 P2-6、P2-15。
     讀碼基準：develop 27b09a0（2026-11-01）；F1（fix/signout-cleanup）會先動 useAuthBootstrap／apiClient／AuthPage，
     實作前 rebase 後行號一律現算。 -->

## 0. 一句話

讓**已登入的人**在 `/profile` 慢、5xx、斷網或後端讀取抖動時**不被登出、不被導去 `/login`**，改停在原頁看到「網路不穩，正在重新連線」與「重試」，
因為現況冷啟動遇暫時性故障會畫訪客版並導 `/login`（R3 P2-15），後端把讀取失敗翻成 404 → 前端 global `signOut`（規格書 §14 #8①②），
且 `/profile` 404 在 bootstrap 與 OTP 兩條路徑語意相反（R3 P2-6）。

## 1. 使用者需求

- 溯源：規格書 §5.3「讀取失敗不是尚未確認」、§14 #8①②；總綱 §1.2B（degraded、兩層確認、後端 `authenticate()`）；子 plan D4、D6（8 秒）、E1；
  R3 review §1.3 P2-6、P2-15。
- 本工項是 PR-A 的續集，PR-A 的三態＋提示＋W2-22 已上線，不重做。

### 1.1 現況（讀碼事實，行號以 27b09a0 為準、開工時現算）

| # | 位置 | 現況 | 後果 |
|---|---|---|---|
| C1 | `useAuthBootstrap.ts:184-187`＋reducer `transient` `:109-111` | 冷啟動 `/profile` transient → `authState:'anonymous'`、`outcome:'transient'` | 頁首畫訪客版；`ProtectedRoute`／`AdminRoute` `!isLoggedIn` → `<Navigate to="/login">`（P2-15） |
| C2 | `App.tsx:211-218` | `useRevalidateOnFocus(() => isLoggedIn, …)` | `user=null` 時 focus 不重試，只能等 SIGNED_IN 重播（P2-15） |
| C3 | `fetchProfile.ts:24` | 401／404／410 → `unauthorized` | bootstrap `:180-183` 對 404 也 `signOutWithFallback`（global） |
| C4 | `routeAfterVerifiedSession.ts:36-41` | 只有 401 要求重登；404 視為「profile 還沒建好」導 complete-profile | 與 C3 共用同一 in-flight 請求，真回 404 時兩邊打架（P2-6） |
| C5 | `index.ts:249-253` `requireAuth` | `auth.getUser` 任何錯誤 → null → 401 | Auth 抖動被當無效 session（§14 #8 背景） |
| C6 | `index.ts:444-534` `buildProfileResponse` | 五個讀取只取 `data`；profiles 失敗→null→404；`step ?? 1`；`acct?.status ?? 'expired'`；pending 訂單失敗→`paidAwaitingActivation:false` | 有效會員被登出、被導續訂、已付款待開通被導回結帳頁（§14 #8①②） |
| C7 | `fetchProfile.ts` `timeoutMs` | 呼叫端都不傳（E1） | `/profile` 卡住時漏斗頁首永遠空白（PR-A 已知限制 3） |
| C8 | `apiClient.ts:80-90,192-210` | refresh 任何錯誤 → 401 → global `signOut` | Auth 抖動時任一 API 呼叫把人登出所有裝置（F1 改成 `signOutWithFallback`，仍 global） |
| C9 | `AuthPage.tsx:192-221` 掛載 effect | unauthorized 與 **catch** 都 `signOut()`（global） | 例外路徑仍可能把暫時性故障變登出 |

- 已核實：`profiles` 由 `after insert on auth.users` trigger 同交易建立（`20260620000003_functions_and_views.sql:55`），auth user 存在而
  profiles 零列只會是資料異常（被手動刪），不是「還沒建好」——P2-6 的裁決依據。
- 已核實：410 只出現在 `referral-invite.ts`（邀請接受），`/profile` 不會回 410；`fetchProfile` 的 410 分類保留（無害）。

### 1.2 驗收情境（可證偽；e2e 全 mock）

| # | 情境 | 證偽方法 |
|---|---|---|
| R1 | 有 session、冷啟動 `/profile` 回 503 兩次 → 停在原受保護頁（URL 不變），主內容區一個 `StatusCallout`「網路不穩，正在重新連線」＋「重試」；**從未**導 `/login`、未呼叫 `signOut` | e2e `route_guards.feature`：mock 503×N；斷言 URL、callout、`/auth/v1/logout` 計次 0 |
| R2 | 同 R1，按「重試」時 `/profile` 已恢復 200 → 正常渲染受保護頁 | e2e：`set_profile_sequence([503,503,200])` |
| R3 | 冷啟動第一次 503、自動重試（約 2 秒後、帶 `?retry=1`）200 → 使用者只看到載入態，無 callout | e2e＋vitest renderHook（fake timers） |
| R4 | `/profile` 超過 8 秒未回 → 視同 transient（重試／degraded），不導 `/login` | vitest（fake timers）；e2e 以 mock 延遲 9 秒一案 |
| R5 | degraded 時分頁切回／`online` 事件 → 再試一次 | vitest renderHook（派發 `visibilitychange`／`online`） |
| R6 | 已有 user 的背景重驗（focus、`refreshUser`）遇 503 → 狀態與畫面不變（現況維持） | 既有 renderHook 測試續綠 |
| R7 | 後端：`auth.getUser` 網路錯誤／5xx／429 → `/profile` 503；`AuthApiError` 4xx → 401 | deno test |
| R8 | 後端：五個讀取任一 error → 503 JSON（含自癒遞迴重入）；profiles 零列仍 404；`/auth/register`、`/auth/complete-registration` 同 | deno test 逐讀取 |
| R9 | 其餘端點的 `requireAuth` 401 語意零變化 | deno 列舉測試（`index.ts`、`listing-photos.ts`、`referral-invite.ts`） |
| R10 | `/profile` 404（P2-6）：bootstrap 與 OTP／登入路徑**同一處置**（見 §2.4），不再一邊導 complete-profile、一邊登出 | vitest：兩路徑各一案、同一 in-flight 404 |
| R11 | apiClient：任一 API 401 → refresh 回 `AuthRetryableFetchError`／5xx／429 → **不登出**，該次請求以 `AUTH_UNAVAILABLE` 失敗；refresh 成功仍 401 → 再問 `/profile`：503 不登出、401 才 `endInvalidSession()`（`scope:'local'`） | vitest node（注入 supabase 替身） |
| R12 | `endInvalidSession()` 後：本機 session 清、提示清、邀請 token 依 AuthPage 情境保留（R2 交接三件事）、導 `/login` | vitest |

### 1.3 不做

- 不改 `requireAuth` 本體與其餘端點的 401（總綱 T1-02；殘餘由前端兩層確認補償，R11）。
- 不加 `accountStatus:'unknown'`（見 §2.1；子 plan §2.3 表格本已全 503，`unknown` 是總綱的另一案，收斂成一種）。
- 不做退避表、全站常駐狀態行（總綱 T1-13）；不做 ErrorBoundary、PageSkeleton。
- 不改使用者**主動**登出（頁首、漏斗登出維持 global，`signOutWithFallback`）。
- 不動 PR-A 的提示、funnel 判定、頁首五 view 的既有語意（只新增 `degraded` 的對應）。
- 不碰 PayUni callback、`complete_paid_pending_orders`、migration。
- 規格書 §14 #8 的③`/members/verify`、④`/referrals/debug` 不在範圍（留在 §14）。

## 2. 系統設計

### 2.1 後端（B1）

- `authenticate(token) → { user } | { error: 'unauthorized' | 'transient' }`，**只給 `profileHandler`**。分類：`isAuthRetryableFetchError`、
  status 0／≥500／429 → transient（503）；其餘 `AuthApiError`（400／401／403 含 `user_not_found`）→ unauthorized（401）；無 token → 401。
- `buildProfileResponse` 五個讀取全查 `error`，非零列錯誤擲 `ProfileReadError(readName)`：

  | 讀取 | 零列 | 查詢失敗 |
  |---|---|---|
  | `profiles` `.single()` | PGRST116 → null → 404（維持） | 503 |
  | `user_account_status` `.single()` | PGRST116 → `expired`（現況語意） | 503 |
  | `referral_codes` `.maybeSingle()` | `referralCode:null` | 503 |
  | `payment_orders` pending | `[]` | 503（否則已付款待開通被判未付款→重複付款風險） |
  | `effective_registration_step` rpc | — | 503，**刪 `step ?? 1`**（rpc 回 null 也視為讀取失敗） |

- 三個呼叫者（`profileHandler`、`/auth/register`、`/auth/complete-registration`）catch `ProfileReadError` → 503
  `{ error: { code: 'PROFILE_UNAVAILABLE', message: '暫時無法讀取帳號資料，請稍後再試' } }`；涵蓋自癒遞迴重入。不加全域 `app.onError`。
- `?retry=1`：只跳過 `healPaidPendingOrdersBestEffort` 與 `repairOrphanedPaymentsBestEffort` **兩支 RPC 呼叫**；step 3 的
  `paidAwaitingActivation = false` 照常（子 plan v4 審查 P2）。理由：逾時重試時第一個請求可能還在伺服器端跑，`repair_orphaned_payments`
  多版改寫、冪等性未逐版確認。用 query 參數不用 header（CORS `allowHeaders` 只有三個，`index.ts:116`）。
- 契約：`_shared/api-contract.ts` 加 `PROFILE_UNAVAILABLE` 錯誤碼常數（前後端共用）。**Migration：不需要。**

### 2.2 `fetchProfile`（B2）

- 新增常數 `PROFILE_FETCH_TIMEOUT_MS = 8_000`（D6），`fetchProfile` 預設套用（呼叫端不必各自傳；仍可覆寫）。
- 選項加 `retry?: boolean` → URL 帶 `?retry=1`。`retry` 請求一律 `force`（不合併）。
- 分類維持三種；503（含 `PROFILE_UNAVAILABLE`）、逾時、斷網 → `transient`。404 的處置見 §2.4。

### 2.3 bootstrap 狀態流（B3）

- reducer 新增 `outcome:'degraded'`，`authState:'degraded'`（型別已預留）。`isLoadingUser` 仍＝`authState==='unknown'`。
- 冷啟動（`user`、`funnelProfile` 皆 null）遇 transient：
  1. 第一次 → 維持 `unknown`（載入態），**2 秒後**重新 `getSession()` 取新 token，以 `retry:true` 再打一次（自動重試只一次）。
  2. 仍 transient → `degraded`；提示**保留**。
  3. `degraded` 中：`visibilitychange`（可見）、`online` 事件、使用者按「重試」→ 回到 `unknown` 再試（`retry:true`）；同時只一個在飛（genRef＋flag）。
- 背景重驗（已有資料）遇 transient → 不變（現況，R6）。
- context 加 `retryAuth()`（穩定 identity）給 StatusCallout 用；memo deps 不變（函式不列）。
- `App.tsx` 的 `useRevalidateOnFocus(() => isLoggedIn, …)` 字面**不動**（`appShell.test` 正則）；degraded 的 focus 重試在 hook 內自己掛
  （只在 `outcome==='degraded'` 時掛 listener），不擴大既有 focus 重驗的觸發面。
- `unauthorized` → `endInvalidSession()`（§2.5）取代現在的 `signOutWithFallback`（global）。

### 2.4 `/profile` 404 統一語意（P2-6）

依 §1.1 trigger 事實，auth user 有效而 profile 零列＝資料異常。**建議（Q1＝A）**：兩條路徑都視為「帳號資料異常」——
`endInvalidSession()`（本機登出）＋ toast「帳號資料異常，請重新登入；若持續發生請聯絡客服」→ `/login`。
`routeAfterVerifiedSession` 的 404 分支從「導 complete-profile」改成這個處置；`catch` 分支維持導 complete-profile（那是前端例外，不是 404）。
另案（Q1＝B）：bootstrap 對 404 不登出、當 transient；缺點是異常帳號會卡在 degraded 永遠重試。

### 2.5 `endInvalidSession()` 與 apiClient 兩層確認（B4）

- `src/utils/endInvalidSession.ts`（不 import App）：`signOut({ scope:'local' })` → `clearAuthHint()` → 移除舊鍵 → `emitSessionExpired()`
  （App 既有監聽導 `/login`）。**不撤銷其他裝置**（無效 session 只是本機問題）。
- apiClient 401 流程：
  1. `refreshSession()` 錯誤分類：`isAuthRetryableFetchError`、status ≥500、429、斷網 → 拋 `ApiError(…, 503, 'AUTH_UNAVAILABLE')`，**不登出**；
     只有 `AuthApiError` 4xx（`invalid_grant`、`refresh_token_not_found`、`user_not_found` 等）→ unauthorized。
  2. refresh 成功、重打仍 401 → 以新 token 呼叫 `fetchProfile({ force:true })` 確認：transient → `AUTH_UNAVAILABLE` 不登出；unauthorized → 登出。
  3. 兩層都判 unauthorized 才 `endInvalidSession()`。
- AuthPage 掛載 effect：unauthorized 走 `endInvalidSession` 但**保留 R2 三件事**（sessionState 三態、4 秒逾時、清理後 `keepInviteToken()`）；
  `catch` 分支改為**不登出**、只 `settle('signed_out')`（前端例外不是 session 無效）。登入表單送出後的 404 分支（`:374`）改走 §2.4 同一處置。
- 主動登出（Navbar、漏斗登出）不走這裡。

## 3. 架構影響

| 檔案 | 處置 |
|---|---|
| `supabase/functions/api/index.ts` | `authenticate()`、`ProfileReadError`、三呼叫者 503、`?retry=1` |
| `supabase/functions/_shared/api-contract.ts` | `PROFILE_UNAVAILABLE` |
| `src/utils/fetchProfile.ts` | 預設逾時、`retry` |
| `src/hooks/useAuthBootstrap.ts` | degraded、自動重試、事件重試、`retryAuth`、`endInvalidSession` |
| `src/utils/endInvalidSession.ts`（新） | 本機登出＋清理 |
| `src/utils/apiClient.ts` | 401 兩層確認 |
| `src/components/AuthPage.tsx`、`src/utils/routeAfterVerifiedSession.ts` | 404 與 catch 語意（§2.4、§2.5） |
| `ProtectedRoute`／`AdminRoute`／`RequireMembershipRoute` | degraded 不導頁，畫外框＋callout |
| `src/utils/authView.ts` | degraded 的頁首對應（§4） |
| `App.tsx` | context 加 `retryAuth`；不動 `useRevalidateOnFocus` 字面 |
| e2e `route_guards.feature`、`backend_api_mock.py` | R1–R4；`/profile` 計次基線可能因自動重試變動，重算 |

- **撞檔**：F1（`fix/signout-cleanup`）同碰 `useAuthBootstrap`（換 uid 清快取）、`apiClient`（401 改 `signOutWithFallback`）、`AuthPage`（裸 signOut）。
  **實作等 F1 合併後 rebase**（W4-3）；B4 會把 F1 在 apiClient 401 分支換上的 `signOutWithFallback` 再換成兩層確認＋`endInvalidSession`——
  與 F1 的目的（不留裸 signOut）一致，PR 內文說明。
- Import 邊界：`endInvalidSession.ts` 加進 `appShell.test.ts` 的 authHint 寫入白名單與「不得 import App」清單。
- 多步驟流程四契約：degraded 不改進度、不清草稿；漏斗頁（complete-profile、checkout）在 degraded 時同樣停原頁，不導 `/login`。
- 安全：本機登出不撤銷其他裝置——無效 token 在伺服器端本來就無效，global 只會誤殺其他裝置的有效 session。

## 4. UI/UX

- **degraded 頁面主體**：守衛外框內放**一個** `StatusCallout variant="warning"`：標題「網路不穩，正在重新連線」、內文「您的登入狀態仍在，
  恢復連線後會自動繼續」、按鈕「重試」（ui-ux §6 三態、§9 `aria-disabled` 進行中）；callout `role="status"`，出現時焦點移到「重試」。
  重試中鈕顯示「重新連線中…」並 `aria-disabled`。全站只這一個 `role="status"`。
- **degraded 頁首**（`resolveAuthView`）：有提示 → 依提示（`member-pending`／`funnel`，與 unknown 同）；**無提示 → `placeholder`**
  （已知有 session，不畫「登入」以免誘導重登）。BottomNav 跟 view 走（現況 `showsMemberChrome`）。
- 冷啟動自動重試期間（最多約 10 秒＋2 秒）維持既有 spinner；`ProtectedRoute` spinner 補可讀文字「載入中…」（`role="status"`）——
  若 PR-A A3 已補則略過，實作時核對。
- 非受保護頁（首頁）在 degraded：頁首同上，主體照常（訪客內容可看），不放 callout（避免首頁多一塊警告）。
- 手機：callout 寬度 100%、按鈕依 ui-ux §11 靠右；320px 不換行由 e2e 既有 overflow sweep 涵蓋。

## 5. 階段切分（每階段一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| B0 | 開工前置（非 TDD）：確認 F1 已合、rebase；`check-migration-versions`；讀 F1 改後的 `useAuthBootstrap`／`apiClient`／`AuthPage` 並在 progress.md 記差異 | — | 記錄完成 |
| B1 | 後端：`authenticate()`、§2.1 讀取對照表、`ProfileReadError` 三呼叫者 503（含遞迴）、`?retry=1`、`PROFILE_UNAVAILABLE`；401 列舉測試 | deno test（`profile-transient.test.ts`；容器無 deno 時先 `npm install -g deno`） | R7、R8、R9；既有 `profile-self-heal`、`profile-masking` 續綠 |
| B2 | `fetchProfile` 預設 8 秒逾時、`retry` 參數、retry 一律不合併 | vitest node | R4（單元）；逾時回 transient；`?retry=1` 出現在 URL |
| B3 | `useAuthBootstrap`：自動重試一次、`degraded`、事件重試、`retryAuth`、404＝§2.4、unauthorized → `endInvalidSession`；`routeAfterVerifiedSession` 404 對齊 | vitest jsdom renderHook | R3、R5、R6、R10；提示在 degraded 保留；generation 防復活仍成立 |
| B4 | `endInvalidSession.ts`＋apiClient 兩層確認＋AuthPage 掛載 effect／登入 404 | vitest node＋jsdom | R11、R12；AuthPage R2 三件事既有測試續綠 |
| B5 | 呈現：三個守衛 degraded 外框＋StatusCallout＋重試；`resolveAuthView` degraded；App context `retryAuth`；e2e | vitest jsdom＋e2e `route_guards.feature` | R1、R2、R4（e2e）；`appShell.test` 不放寬 |
| B6 | 文件：規格書 §5.3 補「`/profile` 讀取失敗＝未知態（503），前端停原頁不登出」一段；§14 #8 刪①②、留③④；`docs/e2e-journey-test-design.md` 若有 `/profile` 計次描述同步；`check-spec-drift` | check-spec-drift | 綠 |

模型：B1、B3、B4 與實作審查用 Opus（跨層契約、登出語意）；B2、B5、B6 Sonnet 可。**時程降級**（11/15 前做不完時）：B4 的 apiClient 兩層確認可拆成
後續小 PR（B1–B3、B5、B6 已能宣稱「冷啟動不登出」；apiClient 401 仍是 F1 後的 global 登出）——降級時規格書 §14 #8 只刪②、保留一句
apiClient 殘餘。

## 6. 開放問題

- [ ] **Q1 `/profile` 404 統一語意（P2-6）**：**A（建議）** 兩路徑都當帳號資料異常 → 本機登出＋toast＋`/login`；B bootstrap 當 transient 不登出。
- [ ] **Q2 `accountStatus:'unknown'`**：**不加（建議）**，五個讀取失敗一律 503，前端走 degraded；另案是讀不到會籍時回 200＋`unknown`、讓會員區外的頁面照常用。
- [ ] **Q3 無效 session 清理的 scope**：**`local`（建議，總綱已定）**——只清本機；另案維持 F1 的 global（會順手撤銷其他裝置，含有效者）。
- [ ] **Q4 apiClient 兩層確認是否本 PR**：**本 PR 做、但列為可降級（建議）**；另案直接拆第 5 波。
- [ ] Q5 degraded callout 文案（§4）——業主順帶確認，不擋開工。
- [ ] **Q6 degraded callout 加次要「登出」鈕**：**加（建議）**——無提示時頁首是 placeholder、沒有其他出口；另案不加（只靠重試）。

## 7. 風險與回滾

- 最壞：真的無效的 session 被誤判 transient → 使用者停在 degraded 一直重試、出不去。防線：自動重試只一次、之後手動；後端 401 分類只把
  `AuthApiError` 4xx 判 unauthorized，Auth 真回 4xx 時照登出；頁首在 degraded 有提示時仍有頭像選單／漏斗「登出」可自行登出。
  無提示（placeholder）時沒有出口——**Q6**：callout 是否加次要「登出」鈕（建議加，`tone="secondary"`，走主動登出 global）。
- 後端 503 範圍擴大：原本「悄悄回預設值」的讀取失敗改成 503，若某讀取在正式站**常態性**失敗（例如 rpc 回 null），會讓人卡 degraded。
  防線：B1 前請主 session 代跑一次 `/profile` 相關 Logs Explorer 查 24 小時 5xx 與 rpc 錯誤；上線後依子 plan §2.4 的量測 SQL 看 P95 調逾時。
- 回滾：單一 PR revert 即回 PR-A 狀態；無 migration、無資料變更。
