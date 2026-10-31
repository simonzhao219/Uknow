# 登入狀態信任（工項 T1）規劃書——子 plan（v2，業主裁決 D1–D6 後修訂）

<!-- 鷹架：上游總綱 §1 為設計主體，本檔只寫「與總綱的差異」、W2-22 與 D1–D6。
     總綱取法：git show 55268e03:docs/plans/platform-growth-and-trust/plan.md（§1 約 57-204 行、§8.2 約 1220-1250 行）。
     讀碼基準：develop HEAD 97cc879a（2026-10-31）。行號開工時一律現算。 -->

## 0. 一句話

讓已登入會員與註冊中途的人**從第一個畫面起**就看到對的頁首（不先閃「登入／立即刊登」），且暫時性故障不把人登出，
因為業主實測（2026-10-31 手機錄影）重新整理、PayUni 返回、Email 連結進站都會先看到訪客頁首，註冊中途更整段顯示「登入」。

### 0.1 裁決（業主 2026-10-31，主 session 轉達）

| # | 裁決 | 落在本檔 |
|---|---|---|
| W2-21 | T1 三段式，第 3 波（11/10 晉升）上 | 全檔 |
| W2-22 | 註冊中途（有 session、profile 未齊或尚未付款）頁首只顯示「登出」 | §2.1、§4 |
| D1＝A | funnel＝從未訂閱過、非 admin、未停權者，**含已付款待開通**；開通後自動換頭像 | §2.1 |
| D2＝a | 頁首登出與結帳頁「取消／稍後付款」（首購者）共用同一 handler，導向與 toast 一致 | §4.2 |
| D3 | 頁首登出**不清**完善資料草稿（維持現況） | §4.2 |
| D4 | 先上 PR-A（三態＋提示＋W2-22）；PR-B（degraded、`/profile` 503）來不及就拆獨立 PR 晚一波 | §5 |
| D5 | 漏斗路由（complete-profile、payment、OTP）在 `unknown` 且無提示時畫中性占位（只有 logo）；其他路由畫訪客版 | §4.1 |
| D6 | `/profile` 逾時先用 8 秒上線，上線後依量測調整 | §2.4 |

主 session 已對照 develop 核實：整段顯示「登入」的是 complete-profile／OTP 頁；結帳頁看到的是冷啟動閃動（結帳頁在
`ProtectedRoute` 內，資料齊才 `setUser`，載入完成後是完整頭像選單——那些入口對未付款者全是死路，W2-22 一併處理）。

## 1. 使用者需求

- 對照規格書：§2.1 角色表、§4.1 註冊四步、§4.3 可恢復性、§5.3、§14 #8①②。
- 總綱 §1.2 A（三態＋`uknow:auth-hint`）、B（degraded、兩層確認、後端 `authenticate()`）、C（砍掉清單）沿用；差異見下。

### 1.1 驗收情境（可證偽；e2e 全 mock 網路）

| # | 情境 | 證偽方法 |
|---|---|---|
| S1 | 已登入會員（有 `member` 提示）重新整理／從 PayUni 返回：頁首首繪起**零次**出現「登入」「立即刊登」 | `page.add_init_script` 在 document 建立時掛 `MutationObserver` 於 `document.documentElement`，記錄 `nav` 內出現過的文字；`/profile` mock 延遲 2 秒；斷言紀錄無兩字樣 |
| S2 | 訪客首訪（無提示、無 session）：頁首立刻「登入／立即刊登」 | `line_browser_steps.py:86` 10 秒內可見（維持），另加 `getSession` 前即可見（不等 `/profile`：mock 對 `/profile` 計次為 0） |
| S3 | 註冊中途（F1 資料未齊、F2 未付款、F2 已付款待開通）在 complete-profile／checkout／payment-result／OTP 頁：頁首只有一顆 `button` 名為「登出」，無「登入」「立即刊登」、無「開啟會員選單」；手機無 BottomNav | 三種 profile fixture × 四路由；有 `funnel` 提示時同 S1 的 MutationObserver 斷言首繪起即如此 |
| S4 | **無提示**的冷啟動（Email 連結首次進站、換裝置、LINE 內建瀏覽器 storage 隔離）進漏斗路由：右上角在判定前**是空的**（中性占位），判定後只出現「登出」；全程零次「登入」 | 不預寫提示，同 S1 觀察器；非漏斗路由（如 `/`）無提示時仍是訪客版（接受閃一次，S6） |
| S5 | 開通成功：F2 待開通者在 `/payment/result`，`/profile` 序列由 `paidAwaitingActivation:true` 轉 `accountStatus:'active'` 後，頁首**在同一次 `/profile` 回應後**換成「開啟會員選單」、BottomNav 出現；全程零次「登入」 | `set_profile_sequence` 兩筆；斷言轉換後 5 秒內可見頭像鈕（PaymentResult 輪詢間隔內） |
| S6 | 已登入會員在**非漏斗路由**、無提示（升版後第一次開站除外——有舊 `localStorage.user` 會遷移）：允許閃一次訪客版 | 已知限制，寫進規格書 §2.1 註記；不設自動化 |
| S7 | 首購結帳頁按頁首「登出」與按頁內「稍後付款」：同一導向（`/login`）、同一 toast | vitest：兩個入口呼叫同一 handler，斷言 `navigate('/login')` 與 toast 字串相同 |
| S8 | 320px 寬：四種頁首版本（訪客、占位、漏斗、會員含 admin「平台管理」）同列不換行、頁首高度 64px | e2e viewport 320×640，量 `nav` 的 `getBoundingClientRect().height` 與子元素 `top` 相同 |
| S9 | 頁首 CLS=0（S1、S3、S4 情境） | init script 掛 `PerformanceObserver({type:'layout-shift', buffered:true})`，`nav` 內來源的 `value` 加總為 0 |

總綱 §1.5 的 degraded 驗收（503 停在受保護頁外框、5xx 不登出）移到 PR-B。

### 1.2 不做

- 總綱 §1.2 C 清單（PageSkeleton、ErrorBoundary、5a/5b/5c 等）。
- 不改註冊漏斗導向決策（`resolvePostLoginAction`、`resolveCheckoutPageRedirect`、`resolveMembershipRedirect` 的輸出不變，只重構成共用分類）。
- 不動 CompleteProfile「取消註冊（刪帳號）」流程、續約者的結帳頁「稍後付款」（不登出）行為。
- 不清草稿（D3）、不加登出確認框、不在頁首加客服或其他連結（W2-22 字面）。
- 不碰 PayUni callback／`/payuni/*` 端點、不動 `complete_paid_pending_orders`。
- 不改使用者**主動**登出的 `signOut` scope（維持現況 global；總綱的 `scope:'local'` 只用於 PR-B 的 `endInvalidSession()`）。

### 1.3 讀碼更正（總綱 10/19 之後的變動；行號開工時現算）

| 總綱寫的 | 現況 | 影響 |
|---|---|---|
| `/profile` 原生 fetch 8 處 | **9 處**，其中 6 處打別名 `/auth/profile`：`App.tsx`×2（`/profile`）、`AuthPage.tsx`×2、`CompleteProfile.tsx`×1、`PaymentCheckout.tsx`×2、`OTPVerificationPage.tsx`（注入 `routeAfterVerifiedSession.fetchProfile`）、**`useInviteAccept.ts`（R2 新增，同樣注入）** | 收斂驗收用 `grep -nE "buildApiUrl\\('/(auth/)?profile'"` 在 `src/`（非測試）只剩 `fetchProfile.ts` 一處 |
| `AuthPage` 掛載 effect catch-all `signOut` | R2 改成 `sessionState` 三態＋4 秒逾時＋清理後 `keepInviteToken()`；5xx 已不登出；401／404／410 與 catch 仍立即 global `signOut()` | friction-log 2026-10-27 R2 交接三件事保留；見 §2.5 |
| `requireAuth` 47 呼叫點 | `index.ts` 47 處＋`listing-photos.ts`、`referral-invite.ts` | PR-B 的 401 列舉測試涵蓋三檔 |
| `UserContext` 讀者 23、mock 17 | 讀者 26（非測試）、`vi.mock('../App')` 22 支 | 回落規則見 §2.5 |
| `HomePage` `hasBottomNav` | 一處；#455/#457 的 `homeListingsCache` 不讀 auth | 一行 |

## 2. 系統設計（差異）

### 2.1 第五態 `funnel` 與共用分類（D1＝A）

`authState: 'unknown' | 'anonymous' | 'funnel' | 'authenticated' | 'degraded'`（`degraded` 屬 PR-B；PR-A 期間不產生）。

把 `resolveMembershipRedirect` 的短路決策表抽成純函式，放 `src/utils/registrationFlow.ts`：

```
classifyMembershipGate(p) → 'admin' | 'active' | 'activating' | 'renew' | 'profile' | 'checkout'
  admin       p.isAdmin
  active      p.accountStatus === 'active'
  activating  p.paidAwaitingActivation
  renew       p.subscriptionEndDate（曾訂閱、已過期）
  profile     step 0 或資料未齊
  checkout    其餘（step 1、step 2 付款失敗）
```

- `resolveMembershipRedirect`（留在 `RequireMembershipRoute.tsx`、簽名不變）改由它導出路徑，**既有測試原封不動全綠**。
- `isFirstTimeFunnel(p) = !p.suspended && gate ∈ {activating, profile, checkout} && !p.subscriptionEndDate`。
  - 「續約且已付款待開通」：gate 是 `activating` 但有 `subscriptionEndDate` → **不是** funnel（D1＝A：曾是會員者維持頭像）。
  - 停權者：一律不是 funnel，維持會員頁首；會員區由既有 `suspendedBlocked` 顯示停權說明（`RequireMembershipRoute.tsx`），
    頁首仍可從頭像選單登出。
  - `accountStatus: 'unknown'`（PR-B）→ 不是 funnel，走 degraded。
- 性質測試：對判定表每一格，`isFirstTimeFunnel(p) ⇔ (resolveMembershipRedirect(p) ∉ {null} ∧ gate ≠ renew ∧ 無 subscriptionEndDate ∧ !suspended)`；
  另斷言「守衛放行者（redirect null）必非 funnel」。

funnel 的兩種來源：

| 來源 | 條件 | `user` | 存放 |
|---|---|---|---|
| F1 資料未齊 | 有 session、`/profile` ok、`!isProfileComplete(profile)` | 維持 `null`（`ProtectedRoute` 不放行，現況） | bootstrap 內 `funnelProfile` state |
| F2 首購未完成 | `user` 非 null 且 `isFirstTimeFunnel(user)` | 照現況 set（`/payment/*` 需要） | 由 `user` 推導，任何 `setUser`（含 CompleteProfile／PaymentCheckout／PaymentResult 直接呼叫）後自動重算 |

**資料查證（開工前，主 session 代跑唯讀 SQL）**：`subscriptionEndDate` 為 null 但曾有會籍的帳號（贈送、手動開通、舊資料）會被誤判 funnel。
```sql
select count(*) from profiles p
where not exists (select 1 from subscriptions s where s.user_id = p.id)
  and exists (select 1 from payment_orders o where o.user_id = p.id and o.status = 'completed');
```
＞0 就在判定表加一格（以「有 completed 訂單」排除），否則維持。

### 2.2 提示鍵 `uknow:auth-hint`（e2e 契約）

```
{ "v": 1, "kind": "member" | "funnel", "initial": "王" | "", "uid8": "1a2b3c4d", "at": 1730000000000 }
```

- `uid8` 是 user id 前 8 碼（UUID 片段，非個資）；bootstrap 拿到 session 後比對 `session.user.id`，不符即丟棄並重寫——
  換帳號時清除失敗也不會顯示前一人首字。
- 不存 email、isAdmin、手機。壞 JSON、未知 `v`／`kind` → 視同無提示並 `removeItem`。
- **寫入只有一處**：`App.tsx` 一個 effect，依 `[authState, user?.id, user?.name, funnelProfile?.id]` 重算並寫入
  （`authenticated`→`member`、`funnel`→`funnel`；`anonymous`→清除）。不包裝 `setUser`——直接呼叫 `setUser` 的三個頁面也被涵蓋。
- **OTP／邀請入口的 F1 寫入時機**（審查 P1）：`routeAfterVerifiedSession` 的 `fetchProfile` 注入值改成 bootstrap 提供的同一個
  single-flight `fetchProfile`；其結果經 bootstrap 的 `ingestProfile()` 落 `funnelProfile`／`user`，hint effect 因此在 OTP 完成、
  導去 complete-profile 之前就寫好。OTP 後立即重新整理 → 首繪是 `funnel` 頁首（S3 一案）。
- 清除時機：`getSession()` null、`INITIAL_SESSION` 無 session、`SIGNED_OUT`、使用者主動登出 handler、`uid8` 不符。
  總綱「`/profile` 回資料未齊 → 清提示」一條**刪除**（改寫 `funnel`）。
- PR-A 期間的 transient（5xx、斷網、逾時）：**不清提示**、行為維持今天（不 `setUser`、`isLoadingUser` false → 守衛導 `/login`、
  頁首依 `anonymous` 畫訪客版）；提示留著，下次冷啟動仍不閃。PR-B 才把這條改成 `degraded`。
- e2e：`e2e/conftest.py` 新增 `seed_auth_hint(page, kind, initial="王", uid="<fixture user id>")`（`add_init_script` 預寫）；
  鍵名與形狀寫在該 fixture docstring 一次，`docs/e2e-journey-test-design.md` 只放指標。

### 2.3 後端（PR-B）

照總綱 §1.2B，另補：

| 讀取 | 零列 | 查詢失敗 |
|---|---|---|
| `profiles` `.single()` | PGRST116 → 回 null → 404（維持） | 503 |
| `user_account_status` `.single()` | PGRST116 → `expired`（從未有會籍＝現況語意） | 503 |
| `referral_codes` `.maybeSingle()` | null → `referralCode: null`（維持） | 503 |
| `payment_orders` pending | `[]` → `paidAwaitingActivation:false`（維持） | 503（否則已付款待開通被判未付款→重複付款風險） |
| `effective_registration_step` rpc | — | 503，**刪除 `step ?? 1`** |

- 自癒遞迴（`alreadyHealed` 重入）走同一套檢查。
- 併發：逾時重試會讓兩個 `/profile` 在伺服器端並行。`complete_paid_pending_orders` 已用 `for update skip locked`
  （`20260716000007_self_heal_paid_pending_orders.sql`），併發安全；`repair_orphaned_payments` 的冪等性在階段 B1 紅燈前先讀定義確認，
  不冪等就讓重試請求帶 `X-Uknow-Retry: 1`、伺服器端跳過 repair（只讀）。
- `app.onError` **不做全域**：改在 `profileHandler` 內 try/catch → 503 JSON（其餘端點的 500 不變）。
- 契約 `accountStatus:'unknown'`、`PROFILE_FETCH_OUTCOME` 進 `_shared/api-contract.ts`。
- **Migration：不需要**（無 schema／RPC／RLS 變更）。

### 2.4 `fetchProfile` 與逾時（D6）

- `src/utils/fetchProfile.ts`：`fetchProfile(token, { force? }) → { kind:'ok', profile } | { kind:'unauthorized', status } | { kind:'transient' }`；
  `AbortController` 逾時 **8 秒**（常數 `PROFILE_FETCH_TIMEOUT_MS`，註明「D6，上線後依量測調整」）。
- single-flight：key＝access token；只合併**進行中**的同 token 請求。`refreshUser`（focus 重驗、PaymentResult／PaymentCheckout 輪詢）
  傳 `force:true` 不合併，開通偵測不被延遲。取消＝丟棄結果、不重置 state。
- 上線後量測（非開工前置）：主 session 以 Logs Explorer 跑唯讀查詢（24 小時視窗，保留期以實際為準）：
  ```sql
  select count(*) n,
         approx_quantiles(m.execution_time_ms, 100)[offset(95)] p95,
         max(m.execution_time_ms) max_ms
  from function_edge_logs cross join unnest(metadata) m cross join unnest(m.request) r
  where r.path like '%/api/%profile' and r.method = 'GET'
    and timestamp > timestamp_sub(current_timestamp(), interval 1 day)
  ```
  `execution_time_ms` 不含冷啟動與網路，只做 sanity check；調參以業主手機端到端觀察為準。

### 2.5 狀態流與 context 形狀（審查 P1）

| 項 | 規格 |
|---|---|
| `UserContext` 值 | 舊六欄不變，**加** `authState`、`isFunnel: boolean`（F1 或 F2） |
| `contextValue` memo deps | `[user, isLoadingUser, authState, isFunnel]`（漏加會靜默不重繪；階段 A2 測試釘住） |
| `resolveAuthView({ authState, isFunnel, isAdmin, hint, pathname })` | `src/utils/authView.ts` 純函式；回 `'guest' \| 'placeholder' \| 'member-pending' \| 'funnel' \| 'member'`；**輸入 `authState` 為 undefined（22 支舊 mock）時回落舊行為**：`isLoggedIn ? 'member' : 'guest'` |
| 提示讀取 | App 第一個 render 以 `useState(() => readAuthHint())` 同步讀一次，經 context 不外露；Navbar 等只拿 `view`（App 算好放進 context 的 `authView` 欄，亦加入 memo deps） |
| `useAuthBootstrap` | `src/hooks/useAuthBootstrap.ts`，注入 `supabase`／`fetchProfile`，回 `{ user, setUser, authState, funnelProfile, isLoadingUser, refreshUser, ingestProfile }`；App.tsx 保留 `useRevalidateOnFocus(() => …, () => { void dedupe('profileRevalidate', async () => { await refreshUser(); }); })` 字面，`appShell.test.ts` 的兩條 regex **不放寬** |
| AuthPage 掛載 effect | PR-A：fetch 換成共用 `fetchProfile`（同 token 與 bootstrap 合併成一次請求），4 秒 `settle('signed_out')` 只管邀請入口 UI、與 8 秒逾時無關；401／404／410 清理行為**維持**（PR-B 改走 `endInvalidSession()`，兩層確認、`scope:'local'`、保留 `keepInviteToken()`） |
| Import 邊界（`appShell.test.ts` 加守衛） | `authHint` 寫入／清除只准 `App.tsx`、`useAuthBootstrap.ts`、登出 handler；`authView.ts`、`authHint.ts`、`fetchProfile.ts`、`registrationFlow.ts` 不得 import `'../App'`；`resolveAuthView`、`isFirstTimeFunnel` 不從 App 匯出 |

## 3. 架構影響（差異）

| 檔案 | 撞誰 | 處置 |
|---|---|---|
| `App.tsx`、`Navbar.tsx`、`BottomNav.tsx`、`ProtectedRoute`／`AdminRoute`／`RequireMembershipRoute`、`apiClient.ts` | 第 3 波目前無人登記 | T1 獨佔；他人要動先向主 session 登記 |
| `AuthPage.tsx`、`OTPVerificationPage.tsx`、`useInviteAccept.ts`、`routeAfterVerifiedSession.ts` | R2 已合併 | 以 R2 版為基準，三件事保留 |
| `CompleteProfile.tsx`、`PaymentCheckout.tsx`、`PaymentResult.tsx` | A1b-1b、S7b（不同區段） | 只換 `/profile` fetch、`localStorage.user`、結帳頁 `handleCancel` 改呼叫共用登出 handler；開工前 `git log origin/develop -- <檔>` |
| `HomePage.tsx` | L1-1／P1b 若在第 3 波 | `hasBottomNav` 一行改讀 view |
| `registrationFlow.ts` | — | 新增 `classifyMembershipGate`、`isFirstTimeFunnel` |
| `e2e/conftest.py`、`backend_api_mock.py`、`payment_result_steps.py` | — | 冷啟動次數變動的基線重算放**階段 A2**（同 PR 內 e2e 先綠）；新 fixture 與 feature 放 A3 |
| `index.ts`、`_shared/api-contract.ts` | 第 3 波若有後端工項 | PR-B 才動 |

- 多步驟流程四契約：頁首登出＝新增離開出口，不改進度、不刪帳號、不清草稿（D3），重新登入由 `resolvePostLoginAction` 接回——契約 2 維持。
- 階段 A4 清查：`grep -n "isLoggedIn" src --include=*.tsx`（非測試）逐一判定是否屬視覺切換、列入 view 或明確排除，結果記 progress.md。

## 4. UI/UX（差異）

### 4.1 頁首五版本（`resolveAuthView`）

| view | 何時 | 頁首右側 | BottomNav／`main` padding／`hasBottomNav` |
|---|---|---|---|
| `guest` | `anonymous`；或 `unknown` 無提示且**非**漏斗路由 | 「登入」ghost＋「立即刊登」primary（現況） | 無 |
| `placeholder` | `unknown` 無提示且在漏斗路由（`/auth/complete-profile`、`/auth/verify-otp`、`/payment/*`）（D5） | 空，右側保留 40px 高固定寬槽（不位移） | 無 |
| `member-pending` | `unknown` 且提示 `member` | 頭像鈕（40px 圓＋`initial`、`aria-busy="true"`）；點開選單有靜態連結與「登出」，姓名列骨架 | 有 |
| `funnel` | `isFunnel`；或 `unknown` 且提示 `funnel` | **只有「登出」** | 無 |
| `member` | `authenticated` 且非 funnel | 頭像選單（現況）；admin「平台管理」連結＋待處理小圓點（`aria-label` 含數字） | 有 |

- 漏斗「登出」位階：`variant="ghost"`＋`LogOut` icon＋可見文字「登出」，與現況頁首按鈕同族、低於結帳頁主 CTA（ui-ux §11）。
  ghost 或 `tone="secondary"` 以階段 A3 實機截圖定案，寫回本節（審查 P2 需人工裁決，預設 ghost）。
- funnel→member（S5 開通）：BottomNav 出現與 padding 增加在 PaymentResult 偵測到 active 的同一刻發生，PaymentResult 隨即導 `/dashboard`；
  接受這一次位移（與路由切換同時，S9 只量非轉換情境）。

### 4.2 漏斗登出行為（D2、D3）

- 新增 `src/utils/logoutFunnel.ts`（或 hook，依階段 A3 落點）的共用 handler，頁首 `funnel` 鈕與結帳頁**首購者**的「取消／稍後付款」
  都呼叫它：`signOut()` → 清 `user`、`pendingUser`、提示 → toast「您已登出，之後用同一帳號登入即可繼續完成註冊」→ `navigate('/login', { replace:true })`。
  導向沿用結帳頁現況（`/login`）——繼續註冊的人下一步就是登入。
- 續約者的結帳頁鈕（不登出、回首頁）不動。
- 不清草稿（D3）→ 登出可逆 → 不加確認框。complete-profile 頁的「取消註冊（刪帳號）」維持頁內、破壞性樣式、既有確認；
  兩者位置（頁首 vs 頁內底部）與文案（「登出」vs「取消註冊」）已分離，登出後的 toast 明說「可繼續完成註冊」以免誤以為帳號已刪。

### 4.3 a11y（審查 P1）

1. 登出是 `<button>`（動作），其他 view 的登入／立即刊登維持 `Link`。
2. 首繪（提示）版與確認後版是**同一 DOM 節點**（同 key、同元素型別，只換 props），換版不 remount、不掉焦點；Navbar.test 以同一 element reference 斷言。
3. 進行中：`aria-disabled="true"`（不用原生 `disabled`，ui-ux §9），handler 以 ref 防連點，連點只觸發一次 `signOut`。
4. 完成後：導 `/login`，焦點交給登入頁既有的標題／第一欄位（沿用該頁現況，不另加）。
5. 失敗：`signOut` 回錯仍清本機狀態並導頁（現況語意），toast 改「已登出此裝置」；不另開錯誤區塊。
6. `placeholder` 槽 `aria-hidden="true"`；`member-pending` 頭像鈕 `aria-busy` 在 `/profile` 回來後移除。

## 5. 階段切分（D4：PR-A 必上 11/10，PR-B 可拆）

**PR-A：三態＋提示＋W2-22**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| A1 | 純函式：`authHint.ts`（形狀、`uid8`、壞 JSON／未知 kind／storage 例外、舊 `localStorage.user` 遷移）、`classifyMembershipGate`＋`isFirstTimeFunnel`（`resolveMembershipRedirect` 改用）、`resolveAuthView`（五態×提示×路由→五 view，含 `authState` undefined 回落）、`fetchProfile`（三分類、8 秒逾時、single-flight、`force`） | vitest node | 判定表逐格（未齊／step1／step2 失敗／待開通／續約待開通／續約／admin／停權）；性質測試；`RequireMembershipRoute` 既有測試全綠 |
| A2 | `useAuthBootstrap`：`funnelProfile`、`ingestProfile`、hint 寫入 effect、`uid8` 比對、transient 不清提示、OTP／邀請注入共用 `fetchProfile`、AuthPage 與 bootstrap 合併成一次請求；context 加欄與 memo deps；9 處 fetch 收斂；**既有 e2e 冷啟動計次基線重算** | vitest jsdom `renderHook`＋既有 e2e | 冷啟動 `/profile` 恰一次（含 AuthPage 同掛載）；資料未齊 → `funnel`、user null、提示 `funnel`；開通後提示轉 `member`；`authState` 轉換觸發 consumer 重繪；邀請 token 清理後仍在；`appShell.test` 全綠不放寬；grep 收斂零命中；既有 e2e 全綠 |
| A3 | 呈現：Navbar 五 view、BottomNav／padding／`hasBottomNav`、admin 小圓點、共用漏斗登出（結帳頁 `handleCancel` 改用）、a11y 六點、登出 `startTransition`；`seed_auth_hint` fixture＋`route_guards.feature` 補 S1、S3、S4、S5、S8、S9 | vitest jsdom（Navbar.test 補五 view；BottomNav.test 五格契約不變）＋e2e | §1.1 S1–S9 |
| A4 | 文件：規格書 §2.1 角色表加「註冊中（尚未成為會員）」列（頁首只有登出、不可用會員區、S6 已知限制一句）；ui-ux §3 補頁首版本指標一句；`isLoggedIn` 清查結果 | check-spec-drift | — |

**PR-B：暫時性故障不登出（來不及就晚一波；不影響 PR-A 驗收）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| B1 | 後端：`authenticate()` 只給 `profileHandler`、§2.3 讀取對照表、`profileHandler` 內 try/catch 503、`repair_orphaned_payments` 冪等確認、契約 `unknown`＋`PROFILE_FETCH_OUTCOME`；`profileHandler` 外 `requireAuth` 401 零變化列舉（三檔） | deno test（容器無 deno：紅燈證據以 CI 紅燈 run 為準，progress 記 run 連結） | 總綱 §1.4 階段 2 後端案例＋§2.3 每格 |
| B2 | 前端 `degraded`：冷啟動 transient → `degraded`＋一次自動重試＋單一 `StatusCallout`；守衛 degraded 畫外框不導頁；`endInvalidSession()` 兩層確認、`scope:'local'`、收 apiClient 與 AuthPage 清理（保留 `keepInviteToken()`） | vitest jsdom＋e2e（503 停外框、5xx 不登出） | 總綱 §1.4 階段 2 前端案例、§1.5 degraded 驗收 |
| B3 | 文件：規格書 §5.3「未確認≠不合格」（總綱 §1.3 已定）、§14 #8 改寫為剩餘③④ | check-spec-drift | — |

模型：A2、B1、B2 與其審查用 Opus（跨層契約、登出語意）；A1、A3、A4、B3 用 Sonnet。

## 6. 開放問題

- [x] Q1 漏斗頁首只放「登出」——W2-22 字面，業主裁決涵蓋。
- [x] Q2 已付款待開通算 funnel——D1＝A；續約待開通不算。
- [x] Q3 不清草稿——D3。
- [x] Q4 不加確認框——由 D3 推得（登出可逆）。
- [x] Q5 逾時 8 秒——D6。
- [ ] Q6 登出鈕 ghost 或 `tone="secondary"`——階段 A3 實機截圖後由業主看圖定（預設 ghost，不擋開工）。

## 7. 風險與回滾

- 最壞：`isFirstTimeFunnel` 誤判把有效會員畫成漏斗頁首（找不到會員中心）。防線：共用 `classifyMembershipGate`、判定表逐格＋性質測試、
  §2.1 開工前資料查證、`suspended`／`unknown`／有 `subscriptionEndDate` 明確排除。
- 提示錯置（訪客看到頭像占位）：`getSession()` null 數十毫秒內清掉並畫訪客版；`uid8` 不符即丟棄；e2e 反向案例。
- PR-A 單獨上線時，冷啟動 5xx 仍會被導 `/login`（今天的行為，未變差）；提示保留，不放大問題。
- 回滾：PR-A／PR-B 各自 revert 即回前一狀態；無 migration、無資料回滾。
