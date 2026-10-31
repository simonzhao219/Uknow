# 登入狀態信任（工項 T1）規劃書——子 plan（v4.1 定稿，業主裁決 D1–D6、E1–E5、F1–F5 後修訂）

<!-- 鷹架：上游總綱 §1 為設計主體，本檔只寫「與總綱的差異」、W2-22、D1–D6、E1–E5。
     總綱取法：git show 55268e03:docs/plans/platform-growth-and-trust/plan.md（§1 約 57-204 行、§8.2 約 1220-1250 行）。
     讀碼基準：develop HEAD 97cc879a（2026-10-31）。行號開工時一律現算。
     v1／v2／v3 審查報告：git show ddb591bf:…/review.md（v1）、193fec78（v2）、6707b1e7（v3）。 -->

## 0. 一句話

讓**有本機提示的已登入會員**與**註冊中途的人**從第一個畫面起就看到對的頁首（不先閃「登入／立即刊登」），
註冊中途頁首只有「登出」（離開漏斗頁時多一顆「繼續完成註冊」），且（PR-B）暫時性故障不把人登出——
因為業主實測（2026-10-31 手機錄影）重新整理、PayUni 返回、Email 連結進站都會先看到訪客頁首，註冊中途更整段顯示「登入」。

**涵蓋範圍與已知限制（E3）**：無本機提示、又在非漏斗路由的已登入會員（升版後第一次開站有遷移除外；換裝置、清 storage、
LINE 內建瀏覽器 storage 隔離、Email 連結落在首頁）仍會閃一次訪客版——要完全不閃只能讓訪客首頁右上角空白，總綱 Q1-1 已否決。

### 0.1 裁決（業主 2026-10-31，主 session 轉達）

| # | 裁決 | 落在本檔 |
|---|---|---|
| W2-21 | T1 三段式，第 3 波（11/10 晉升）上 | 全檔 |
| W2-22 | 註冊中途（有 session、profile 未齊或尚未付款）頁首只顯示「登出」 | §2.1、§4 |
| D1＝A | funnel＝從未訂閱過、非 admin、未停權者，**含已付款待開通**；開通後自動換頭像 | §2.1 |
| D2＝a | 頁首登出與結帳頁「取消／稍後付款」（首購者）共用同一 handler，導向與 toast 一致 | §4.2 |
| D3 | 頁首登出**不清**完善資料草稿 | §4.2 |
| D4 | 先上 PR-A（三態＋提示＋W2-22）；PR-B（degraded、`/profile` 503）來不及就晚一波 | §5 |
| D5 | 漏斗路由在判定前畫中性占位（只有 logo）；其他路由畫訪客版 | §4.1 |
| D6 | `/profile` 逾時 8 秒、上線後依量測調整 | §2.4（E1：隨 PR-B 啟用） |
| E1＝a | **PR-A 不設逾時**；8 秒與 PR-B 的重試＋逾時不導 `/login` 一起啟用 | §2.4、§5 |
| E2＝a | OTP 驗證前（無 session）頁首只放 logo | §4.1 |
| E3＝a | 接受上述已知限制，寫進規格書 §2.1 註記 | §0、§5 A4 |
| E4＝b | funnel 狀態在**非漏斗路由**多一顆「繼續完成註冊」，導向下一步 | §4.1 |
| E5 | 登出 toast 兩句：一般「您已登出，之後用同一帳號登入即可繼續完成註冊」；已付款待開通「付款已收到，登入後會自動開通」 | §4.2 |
| 確認 | 使用者主動登出維持 global scope；`signOut` 失敗仍清本機並導頁 | §1.2、§4.3 |
| F1＝a | 320px 窄寬時「登出」只留 icon＋`aria-label="登出"`，「繼續完成註冊」維持全文 | §4.1 |
| F2＝a | 已付款待開通者的 E4 鈕文案「查看開通進度」 | §4.1 |
| F3 | A0 查證兩站皆 0，不需 A1b；A1 開工前重跑若 ＞0 → 停下回報主 session 重審，不自動擴進後端 | §2.1、§5 A0 |
| F4＝a | 漏斗頁在 `/profile` 卡住時右上角保持空白，列 PR-A 已知限制，PR-B 逾時上線後解決 | §4.1、§7 |
| F5 | 業主再次確認接受「Email 連結首次落在首頁會閃一次」，PR 描述與規格書註記寫明 | §0、§5 A4 |

主 session 已對照 develop 核實：整段顯示「登入」的是 complete-profile／OTP 頁；結帳頁看到的是冷啟動閃動（結帳頁在 `ProtectedRoute`
內，資料齊才 `setUser`，載入完成後是完整頭像選單——那些入口對未付款者全是死路，W2-22 一併處理）。

## 1. 使用者需求

- 溯源：首繪不閃、故障不登出——規格書 §5.3、§14 #8①②與總綱 §1。**「註冊中途頁首只有登出」「繼續完成註冊」是新增需求**
  （W2-22、D1＝A、E4），規格書 §2.1 目前沒有對應角色，由階段 A4 補列「註冊中（尚未成為會員）」一列。
- 總綱 §1.2 A（三態＋`uknow:auth-hint`）、B（degraded、兩層確認、後端 `authenticate()`）、C（砍掉清單）沿用；差異見下。

### 1.1 驗收情境（可證偽；e2e 全 mock 網路）

| # | 情境 | 證偽方法 |
|---|---|---|
| S1 | 已登入會員（有 `member` 提示）重新整理／從 PayUni 返回：頁首首繪起**零次**出現「登入」「立即刊登」；BottomNav 從首繪起即存在 | `page.add_init_script` 在 document 建立時掛 `MutationObserver` 於 `document.documentElement`，記錄 `nav` 內出現過的文字與 `nav[aria-label="主要導覽"]` 的出現時點；`/profile` mock 延遲 2 秒；斷言紀錄無兩字樣、BottomNav 首次出現早於 `/profile` 回應 |
| S2 | 訪客首訪（無提示、無 session）於 `/`：頁首立刻「登入／立即刊登」 | `line_browser_steps.py:86` 10 秒內可見（維持）；mock 對 `/profile` 計次為 0 |
| S3 | 註冊中途（F1 資料未齊、F2 未付款、F2 已付款待開通）在 complete-profile／checkout／payment-result／OTP（**驗證後**）：頁首只有一顆 `button`「登出」，無「登入」「立即刊登」「開啟會員選單」；手機無 BottomNav | 三種 profile fixture × 路由；有 `funnel` 提示時同 S1 觀察器斷言首繪起即如此 |
| S3′ | OTP **驗證前**（剛註冊、無 session）：頁首只有 logo（E2） | 觀察器斷言 `nav` 右側從未出現任何按鈕或連結 |
| S4 | **無提示**冷啟動進漏斗路由（Email 連結首次進站、換裝置、LINE storage 隔離）：判定前右上角空（中性占位），判定後只出現「登出」；全程零次「登入」 | 不預寫提示，同 S1 觀察器 |
| S5 | 開通成功：F2 待開通者在 `/payment/result`，`/profile` 序列由 `paidAwaitingActivation:true` 轉 `accountStatus:'active'`：頁首在該次回應後換成「開啟會員選單」；之後**重新整理**首繪即是頭像（提示已轉 `member`）；全程零次「登入」 | `set_profile_sequence` 兩筆；斷言轉換後 5 秒內可見頭像鈕（PaymentResult 輪詢 3 秒）；reload 後同 S1 觀察器 |
| S6 | 已知限制（E3）：已登入會員在非漏斗路由、無提示時允許閃一次訪客版 | 不設自動化；規格書 §2.1 註記 |
| S7 | 首購結帳頁按頁首「登出」與按頁內「稍後付款」：同一 handler、同一導向（`/login`）、同一 toast；已付款待開通者在 `/payment/result` 按頁首登出：toast 為「付款已收到，登入後會自動開通」 | vitest：兩入口呼叫同一 hook；斷言 `navigate('/login')` 與兩種 toast 字串 |
| S8 | 320px 寬：五種頁首版本（訪客、占位、漏斗、漏斗＋繼續完成註冊〔登出 icon-only，F1〕、會員含 admin「平台管理」）同列不換行、頁首高度 64px | e2e viewport 320×640，量 `nav` 高度、子元素 `top` 相同、子元素右緣 ≤ `nav` 內寬 |
| S9 | 頁首 CLS=0（S1、S3、S4 情境；S5 的開通轉換除外，與導頁同時） | init script 掛 `PerformanceObserver({type:'layout-shift', buffered:true})`，來源在 `nav` 內的 `value` 加總為 0 |
| S10 | F2 使用者在首頁（非漏斗路由）：未付款者頁首有「繼續完成註冊」→`/payment/checkout`；已付款待開通者為「查看開通進度」→`/payment/result?tradeNo=…`（F2）；兩者旁有「登出」 | vitest（導向與文案）＋e2e 一案（S3 的待開通 fixture 與 S5 起點共用同一份） |
| S11 | 同瀏覽器 A 登出失敗殘留 `member` 提示、B 登入：全程零次出現 A 的首字 | vitest renderHook＋e2e 一案 |

總綱 §1.5 的 degraded 驗收（503 停在受保護頁外框、5xx 不登出、逾時重試）屬 PR-B。

### 1.2 不做

- 總綱 §1.2 C 清單（PageSkeleton、ErrorBoundary、5a/5b/5c 等）。
- 不改註冊漏斗導向決策（`resolvePostLoginAction`、`resolveCheckoutPageRedirect`、`resolveMembershipRedirect` 的輸出不變，只重構成共用分類）。
- 不動 CompleteProfile「取消註冊（刪帳號）」流程本身（確認框只加一句文案，§4.2）、續約者的結帳頁「稍後付款」（不登出）行為。
- 不清草稿（D3）、不加登出確認框；頁首除「登出」與 E4 的「繼續完成註冊」外不加其他連結。
- 不碰 PayUni callback／`/payuni/*` 端點、不動 `complete_paid_pending_orders`。
- 不改使用者**主動**登出的 `signOut` scope（維持 global；總綱的 `scope:'local'` 只用於 PR-B 的 `endInvalidSession()`）。
- PR-A 不加 `/profile` 逾時（E1）。

### 1.3 讀碼更正（總綱 10/19 之後的變動；行號開工時現算）

| 總綱寫的 | 現況 | 影響 |
|---|---|---|
| `/profile` 原生 fetch 8 處 | **9 處**，其中 7 處打別名 `/auth/profile`（`AuthPage`×2、`CompleteProfile`×1、`PaymentCheckout`×2、`OTPVerificationPage` 與 `useInviteAccept` 經注入 `routeAfterVerifiedSession.fetchProfile`），2 處 `/profile`（`App.tsx`） | 收斂驗收：`grep -nE "buildApiUrl\\('/(auth/)?profile'"` 在 `src/`（非測試）只剩 `fetchProfile.ts` 一處 |
| `AuthPage` 掛載 effect catch-all `signOut` | R2 改成 `sessionState` 三態＋4 秒逾時＋清理後 `keepInviteToken()`；5xx 已不登出；401／404／410 與 catch 仍立即 global `signOut()` | friction-log 2026-10-27 R2 交接三件事保留；見 §2.5 |
| `requireAuth` 47 呼叫點 | `index.ts` 47 處＋`listing-photos.ts`、`referral-invite.ts` | PR-B 的 401 列舉測試涵蓋三檔 |
| `UserContext` 讀者 23、mock 17 | 讀者 26（非測試）、`vi.mock('../App')` 22 支 | 回落規則見 §2.5 |
| `HomePage` `hasBottomNav` | 一處；#455/#457 的 `homeListingsCache` 不讀 auth | 一行 |
| F1 只在 complete-profile | `shouldRedirectToCompleteProfile` 會把 F1 從**任何**路由（除 complete-profile、reset-password）導去完善資料頁 | E4 的「繼續完成註冊」實務上只會出現在 F2 |

## 2. 系統設計（差異）

### 2.1 狀態與 funnel 判定（D1＝A）

- `authState: 'unknown' | 'anonymous' | 'authenticated' | 'degraded'`（四值；`degraded` 只在 PR-B 產生）。
  **funnel 不是 authState 的值**，一律是衍生布林 `isFunnel`（v2 審查 P1：兩者並存會前後不一）。
- F1／F2 兩來源：

| 來源 | 條件 | `authState` | `user` | `isFunnel` 來自 |
|---|---|---|---|---|
| F1 資料未齊 | 有 session、`/profile` ok、`!isProfileComplete(profile)` | `authenticated` | 維持 `null`（`ProtectedRoute` 不放行，現況） | bootstrap 內 `funnelProfile` 非 null |
| F2 首購未完成 | `user` 非 null 且 `isFirstTimeFunnel(user)` | `authenticated` | 照現況 set（`/payment/*` 需要） | 由 `user` 推導；任何 `setUser`（含 CompleteProfile／PaymentCheckout／PaymentResult 直接呼叫）後自動重算 |

- 把 `resolveMembershipRedirect` 的短路決策表抽成純函式，放 `src/utils/registrationFlow.ts`：

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
- `isFirstTimeFunnel(p) = !p.suspended && gate ∈ {activating, profile, checkout} && !p.subscriptionEndDate`
  - 續約且已付款待開通（`activating` 但有 `subscriptionEndDate`）→ 不是 funnel（D1＝A：曾是會員者維持頭像）。
  - 停權者一律不是 funnel；會員區由既有 `suspendedBlocked` 顯示停權說明，頁首仍可從頭像選單登出。
  - `accountStatus: 'unknown'`（PR-B）→ 不是 funnel，走 degraded。
- `redirectForGate(p)`（同檔、純函式）：把現況 `resolveMembershipRedirect` 的「gate → 路徑」映射（含 `paidAwaitingActivation` 但無
  `lastTradeNo` 時回 `/payment/checkout` 的分支）搬過來；`resolveMembershipRedirect` 改成呼叫它的薄包裝、簽名與既有測試不動。
  （v4 審查 P1：`RequireMembershipRoute.tsx` import App，`registrationFlow.ts` 不能反向依賴它。）
- `nextFunnelRoute(p)`（E4，同檔）：F1 → `/auth/complete-profile`；F2 → `redirectForGate(p)`，與守衛同一來源。
- E4 鈕文案**依目的地決定**（不是依 gate）：目的地 `/payment/result…` →「查看開通進度」（F2）；其餘 →「繼續完成註冊」。
  `activating` 但無 `lastTradeNo`（目的地是結帳頁）因此顯示「繼續完成註冊」，文案與去處一致。A1 一格測試。
- 性質測試：判定表每格 `isFirstTimeFunnel(p) ⇔ (resolveMembershipRedirect(p) ≠ null ∧ gate ≠ renew ∧ !p.subscriptionEndDate ∧ !p.suspended)`；
  另斷言「守衛放行者（redirect null）必非 funnel」。

**資料查證（A1 開工前置；主 session 代跑唯讀 SQL，結果寫進 progress.md）**——模擬判定條件，找「會被判成 funnel、但其實曾有會籍」的人：

```sql
-- 候選＝非 admin、未停權、user_account_status.end_date 為 null（＝/profile 的 subscriptionEndDate 為 null）
with candidates as (
  select p.id
  from public.profiles p
  join public.user_account_status a on a.user_id = p.id
  where a.end_date is null
    and coalesce(p.is_admin, false) = false
    and p.suspended_at is null
)
select
  (select count(*) from candidates)                                                        as funnel_candidates,
  (select count(*) from candidates c
     where exists (select 1 from public.payment_orders o
                   where o.user_id = c.id and o.status = 'completed'))                     as with_completed_order,
  (select count(*) from candidates c
     where exists (select 1 from public.subscriptions s where s.user_id = c.id))           as with_subscription_row,
  (select count(*) from candidates c
     where exists (select 1 from public.referral_codes r
                   where r.user_id = c.id and r.status = 'active'))                        as with_active_referral_code;
```

**結果（2026-10-31 09:40 UTC，主 session 代跑）**：正式站 0／0／0／0；develop 候選 1、後三欄 0／0／0。→ 判定表維持原樣。
**決策路徑（F3）**：A1 開工前實作 session 必須再跑一次（資料會變）並記 progress.md；後三欄仍全 0 → 照本節；任一 ＞0 → **停下回報
主 session 重審**，不在 PR-A 內自行加欄位或動後端。查證結果只可能影響 `isFirstTimeFunnel`，不改 `resolveMembershipRedirect` 的導向。

### 2.2 提示鍵 `uknow:auth-hint`（e2e 契約）

```
{ "v": 1, "kind": "member" | "funnel", "initial": "王" | "", "uid8": "1a2b3c4d",
  "next": "profile" | "checkout" | "result" | null, "at": 1730000000000 }
```

- `next`（v4 審查 P1，系統＋UI/UX）：只在 `kind:'funnel'` 時有值，記 `nextFunnelRoute` 的**目的地種類**（不存 `tradeNo`）。首繪在非漏斗路由
  據此決定 E4 鈕文案（`result`→「查看開通進度」，其餘→「繼續完成註冊」）與暫用連結（`/auth/complete-profile`、`/payment/checkout`、
  `/payment/result`）；`/profile` 回來後同一 DOM 節點只換 `href`（補 `?tradeNo=`）與必要時的文案，S9 不因此位移。暫用連結
  `/payment/result`（無 tradeNo）可被點到的窗口極短，A3 確認 PaymentResult 無 tradeNo 時的現況行為；若不能正確處理，該鈕在 `/profile`
  回來前 `aria-disabled`。S10 補「帶 `funnel`＋`next:'result'` 提示冷啟動在首頁，首繪即為『查看開通進度』」一案。

- `uid8` 是 user id 前 8 碼（UUID 片段，非個資）。不存 email、isAdmin、手機。壞 JSON、未知 `v`／`kind` → 視同無提示並 `removeItem`。
- **hint 的擁有者是 `useAuthBootstrap`**（v3 審查 P1）：hook 內 `useState(() => readAuthHint())` 同步讀一次、回傳 `hint`；寫入與清除也
  都在 hook 內（App 不再持有 hint state）。
- **寫入只有一處**：hook 內一個 effect，deps＝衍生值 `[hintKind, initial, uid8]`。reducer 另記 `outcome`（v3 審查 P1，系統＋架構）：

  | reducer 狀態 | 何時 | `authState` | `hintKind` |
  |---|---|---|---|
  | `outcome:'none'` | 冷啟動中 | `unknown` | 保持（不寫不清） |
  | `outcome:'ok'` | `/profile` ok | `authenticated` | `isFunnel ? 'funnel' : 'member'` |
  | `outcome:'transient'` | 有 session、`/profile` 5xx／斷網（PR-A） | `anonymous`（守衛照今天導 `/login`） | **保持**（不清提示） |
  | `outcome:'signedOut'` | `getSession()` null、`INITIAL_SESSION` 無 session、`SIGNED_OUT`、401／404／410 | `anonymous` | `null` → 清除 |

  F2 開通時只有 `accountStatus` 變 → `isFunnel` 變 → `hintKind` 變 → 重寫成 `member`；反向同理。不包裝 `setUser`，直接呼叫 `setUser`
  的三個頁面也被涵蓋。A2 測試：「5xx 後提示仍在」「開通後轉 member」「401 後清除」。
- **換帳號（v2 審查 P1）**：`onAuthStateChange('SIGNED_IN')` 與冷啟動 `getSession()` 拿到 session 時，hook **同步**比對 `uid8`，不符立即
  清提示並把 `hint` state 設為 null（不等 effect），B 帳號判定前畫 `placeholder`／`guest`，不出現 A 的首字（S11）。
- **OTP／邀請入口**：`routeAfterVerifiedSession` 的 `fetchProfile` 注入值改成 bootstrap 提供的同一個 `fetchProfile`；結果經
  `ingestProfile()` 落 `funnelProfile`／`user`，hint effect 在導去 complete-profile 前寫好。OTP 後立即重新整理 → 首繪 `funnel`。
- 清除時機：`getSession()` null、`INITIAL_SESSION` 無 session、`SIGNED_OUT`、登出 handler、`uid8` 不符；另兩個自清 `localStorage.user`
  的呼叫點——`apiClient.ts` session 過期分支、`CompleteProfile.tsx` 取消註冊——也同步呼叫 `clearAuthHint()`（`signOut` 網路失敗時
  SIGNED_OUT 不一定觸發；刪帳號後殘留 `funnel` 提示是最糟情形）。總綱「`/profile` 回資料未齊 → 清提示」一條刪除（改寫 `funnel`）。
- PR-A 的 transient（5xx、斷網；PR-A 無逾時）：`outcome:'transient'`，**不清提示**、行為維持今天（不 `setUser`、守衛導 `/login`、頁首依
  `anonymous` 畫訪客版）。有 `member` 提示時是「頭像占位 → 訪客版＋導 `/login`」——今天 5xx 時已有的導頁，只多了前面的占位；
  列為 PR-A 已知限制（§7），PR-B 修。
- `localStorage.user`：`ingestProfile`／`refreshUser` **不再寫入**（現況唯一寫入在 `refreshUser`，`App.tsx` 約 :257；另 `AuthPage`、
  `CompleteProfile` 各一處一併刪），啟動時一次 `removeItem('user')`、`removeItem('pendingSession')` 清舊殘留；A0 清查確認零讀者
  （總綱已查：3 寫 9 清 0 讀）。
- e2e：`e2e/conftest.py` 新增 `seed_auth_hint(page, kind, initial="王", uid="<fixture user id>")`（`add_init_script` 預寫）；
  鍵名與形狀寫在該 fixture docstring 一次，`docs/e2e-journey-test-design.md` 只放指標。

### 2.3 後端（PR-B）

照總綱 §1.2B，另補：

| 讀取 | 零列 | 查詢失敗 |
|---|---|---|
| `profiles` `.single()` | PGRST116 → null → 404（維持） | 503 |
| `user_account_status` `.single()` | PGRST116 → `expired`（view 以 profiles 為底，零列只在 profile 不存在時，現況語意） | 503 |
| `referral_codes` `.maybeSingle()` | null → `referralCode: null`（維持） | 503 |
| `payment_orders` pending | `[]` → `paidAwaitingActivation:false`（維持） | 503（否則已付款待開通被判未付款→重複付款風險） |
| `effective_registration_step` rpc | — | 503，**刪除 `step ?? 1`** |

- `profileHandler` 內 try/catch → 503 JSON，範圍**包含**自癒遞迴重入（`alreadyHealed`）；不做全域 `app.onError`（其餘端點 500 不變）。
- 併發：`complete_paid_pending_orders` 已用 `for update skip locked`（`20260716000007_self_heal_paid_pending_orders.sql`），安全。
  `repair_orphaned_payments` 多版改寫、冪等性未逐版確認 → **預設**重試請求帶 query 參數 `?retry=1`（不用自訂 header：`index.ts` 的 CORS
  `allowHeaders` 只有 `Content-Type`、`Authorization`、`If-None-Match`，自訂 header 會 preflight 失敗——v3 審查 P1），伺服器端對該請求
  只跳過 heal 與 repair **兩支 RPC 呼叫**，`registrationStep === 3` 區塊內的 `paidAwaitingActivation = false` 等旗標重設照常執行；讀定義
  確認冪等後可移除，屬優化。B1 deno 測試：`?retry=1` 不呼叫兩支 RPC；step 3 且 `?retry=1` → `paidAwaitingActivation:false`。待開通者的
  重試回應是未自癒的 step 2（正確的 `activating`），下一次非重試請求才自癒。
- `buildProfileResponse` 的讀取失敗信號：擲出 `ProfileReadError`（帶讀取名稱）。三個呼叫者——`profileHandler`、`/auth/register`、
  `/auth/complete-registration`——都 catch 成 503 JSON（後兩者原本把 null 當 404，維持零列語意；查詢失敗改 503）。B1 逐呼叫者測試。
- 契約 `accountStatus:'unknown'`、`PROFILE_FETCH_OUTCOME` 進 `_shared/api-contract.ts`。
- **Migration：不需要**（無 schema／RPC／RLS 變更；A0 查證兩站後三欄皆 0，不需新欄位）。

### 2.4 `fetchProfile`、逾時與 single-flight

- `src/utils/fetchProfile.ts`：`fetchProfile(token, { userId, force?, timeoutMs? }) → { kind:'ok', profile } | { kind:'unauthorized', status } | { kind:'transient' }`。
- **E1**：PR-A 呼叫端一律不傳 `timeoutMs`（不逾時，與現況同）；PR-B 才以常數 `PROFILE_FETCH_TIMEOUT_MS = 8_000`（D6，上線後依量測調整）
  啟用，並同時上線一次自動重試與「逾時不導 `/login`」。
- single-flight 合併鍵＝**user id**（v2 審查 P1；token 只用來發請求），只合併進行中的請求；`SIGNED_OUT`／換 session 時**清空 in-flight map**
  （v3 審查 P2：登出後立刻同帳號重登，不得合併到以已撤銷 token 在飛的舊請求）。`onAuthStateChange` 的 `TOKEN_REFRESHED`
  不觸發 `/profile`（`App.tsx` 現況註解「僅換發 token，不需要任何 UI 狀態變化」，維持）。`refreshUser`（focus 重驗、PaymentResult／
  PaymentCheckout 輪詢）傳 `force:true` 不合併，開通偵測不被延遲。取消＝丟棄結果、不重置 state。
- 上線後量測（PR-B 上線後，非開工前置）：主 session 以 Logs Explorer 跑唯讀查詢（24 小時視窗，保留期以實際為準）：
  ```sql
  select count(*) n,
         approx_quantiles(m.execution_time_ms, 100)[offset(95)] p95,
         max(m.execution_time_ms) max_ms
  from function_edge_logs cross join unnest(metadata) m cross join unnest(m.request) r
  where r.path like '%/api/%profile' and r.method = 'GET'
    and timestamp > timestamp_sub(current_timestamp(), interval 1 day)
  ```
  `execution_time_ms` 不含冷啟動與網路，只做 sanity check；調參以業主手機端到端觀察為準。

### 2.5 狀態流、context 形狀與副作用歸屬

| 項 | 規格 |
|---|---|
| `UserContext` 值 | 舊六欄不變，**加** `authState`、`isFunnel`、`authView`、`nextFunnelRoute`（string \| null）、`hintInitial`（`member-pending` 頭像首字；`user` 為 null 時 Navbar 從這裡取）、`hintNext`、`ingestProfile`（OTP／邀請入口回灌用；穩定 identity） |
| `contextValue` memo deps | `[user, isLoadingUser, authState, isFunnel, authView, nextFunnelRoute, hintInitial, hintNext]`（函式欄位為穩定 identity 不列；漏加會靜默不重繪；A2a 測試釘住） |
| `fetchProfile` 實例 | `utils/fetchProfile.ts` 是**模組單例**（in-flight map 在模組內），OTP／邀請／AuthPage 直接 import 同一個函式即與 bootstrap 合併；hook 在 SIGNED_OUT／換 session 時呼叫其匯出的 `clearInflight()`；結果經 context 的 `ingestProfile` 回灌 |
| 載入旗標 | bootstrap 以**單一 `useReducer`** 管 `{ authState, outcome, user, funnelProfile }`，`isLoadingUser` 由 `authState==='unknown'` 衍生，兩者同批更新；測試 `unknown ⇔ isLoadingUser` |
| reducer 動作 | 新 uid 的 SIGNED_IN／冷啟動 → `unknown`；同 uid SIGNED_IN 重播 → 不變；`refreshUser`／focus 重驗／`ingestProfile` **絕不**轉入 `unknown`（現況刻意不碰 `isLoadingUser`，避免全頁 spinner）；**已有 `user` 或 `funnelProfile` 時，背景重驗遇 transient → 狀態不變、保留舊資料**（總綱 §1.2B；`outcome:'transient'` 只適用冷啟動）；A2a 各一測試 |
| `resolveAuthView({ authState, isFunnel, isAdmin, hint, pathname })` | `src/utils/authView.ts` 純函式；回 `'guest' \| 'placeholder' \| 'member-pending' \| 'funnel' \| 'member'`；`authState` 為 undefined（22 支舊 mock）時回落 `isLoggedIn ? 'member' : 'guest'` |
| 漏斗路由清單 | `registrationFlow.ts` 匯出 `FUNNEL_ROUTES = ['/auth/complete-profile', '/auth/verify-otp', '/payment/checkout', '/payment/result']`（完整路徑、比對前去掉結尾斜線後精確比對，不用前綴——v3 審查 P2；`/payment/result/` 一格測試）；與 `shouldRedirectToCompleteProfile`（負向豁免）語意不同、**各自獨立**，由 vitest 讀 `App.tsx` 原始碼斷言四條路徑都有 `<Route>` 鎖定 |
| 提示讀取 | hook 首個 render `useState(() => readAuthHint())` 同步讀一次，經 `authView` 外露，不外露原始提示 |
| `useAuthBootstrap` | `src/hooks/useAuthBootstrap.ts`，注入 `supabase`、`fetchProfile`、`onSignedOut`、`onIncompleteProfile`；回 `{ user, setUser, authState, funnelProfile, hint, isLoadingUser, refreshUser, ingestProfile }`；**不得 import `'../App'`**（被 App import，否則循環） |
| App.tsx 保留字面 | `useRevalidateOnFocus(() => …, () => { void dedupe('profileRevalidate', async () => { await refreshUser(); }); })`；`appShell.test.ts` 兩條 regex **不放寬** |

現有啟動 effect 的副作用歸屬（v2 審查 P1）：

| 副作用 | 現在 | v3 歸屬 | 測試 |
|---|---|---|---|
| 資料未齊導 `/auth/complete-profile`（`shouldRedirectToCompleteProfile`） | effect 內 `navigate` | 注入 `onIncompleteProfile(pathname)`，App 傳入用 `navigate` 的實作 | renderHook：F1 時呼叫一次、在豁免路由不呼叫 |
| `clearCache()`、`clearPendingInviteToken()`、`localStorage.removeItem('user'／'pendingSession')` | SIGNED_OUT 分支（401 分支亦清 `pendingSession`） | 注入 `onSignedOut()`，App 實作；`clearAuthHint()` 由 hook 自己做 | renderHook：SIGNED_OUT 呼叫一次 |
| `localStorage.setItem('user')` | `refreshUser` | **刪除**（見 §2.2，零讀者） | grep 零命中 |
| 同 uid 的 SIGNED_IN 重播忽略（`loadedUserIdRef`） | effect 內 ref | 移入 hook 內部，行為不變 | renderHook：同 uid 重播不打 `/profile` |
| 401／404／410 → `signOut()` | effect 內 | PR-A 維持於 hook 內；PR-B 改 `endInvalidSession()` | 既有行為測試 |
| SIGNED_OUT 後晚到的 `/profile` 結果 | 無防護 | hook 內 generation counter：SIGNED_OUT／換帳號後丟棄舊結果（防登出後「復活」，總綱 §1.2B 末段） | renderHook：登出後晚到的 ok 不 `setUser` |

- AuthPage 掛載 effect：PR-A 把 fetch 換成共用 `fetchProfile`（同 user id 與 bootstrap 合併成一次請求），4 秒 `settle('signed_out')`
  只管邀請入口 UI；401／404／410 清理行為維持。PR-B 改走 `endInvalidSession()`（兩層確認、`scope:'local'`、保留 `keepInviteToken()`）。
- Import 邊界（`appShell.test.ts` 加守衛）：`authHint` 的寫入／清除只准 `App.tsx`、`hooks/useAuthBootstrap.ts`、`hooks/useFunnelLogout.ts`、
  `utils/apiClient.ts`、`components/CompleteProfile.tsx`、`components/Navbar.tsx`（會員登出）；`authView.ts`、`authHint.ts`、`fetchProfile.ts`、`registrationFlow.ts`、
  `hooks/useAuthBootstrap.ts` 不得 import App（守衛以解析後路徑比對，涵蓋 `../App`、`../../App`，比照 `appShell.test.ts` 既有 admin
  邊界測試）；`resolveAuthView`、`isFirstTimeFunnel` 不從 App 匯出。`hooks/useFunnelLogout.ts` 讀 `UserContext` 走既有慣例（import App）。

## 3. 架構影響（差異）

| 檔案 | 撞誰 | 處置 |
|---|---|---|
| `App.tsx`、`Navbar.tsx`、`BottomNav.tsx`、`ProtectedRoute`／`AdminRoute`／`RequireMembershipRoute`、`apiClient.ts` | 第 3 波目前無人登記 | T1 獨佔；他人要動先向主 session 登記 |
| `AuthPage.tsx`、`OTPVerificationPage.tsx`、`useInviteAccept.ts`、`routeAfterVerifiedSession.ts` | R2 已合併 | 以 R2 版為基準，三件事保留 |
| `CompleteProfile.tsx`、`PaymentCheckout.tsx`、`PaymentResult.tsx` | A1b-1b、S7b（不同區段） | 只換 `/profile` fetch、`localStorage.user`、結帳頁 `handleCancel`（首購）改用 `useFunnelLogout`、取消註冊確認框加一句；開工前 `git log origin/develop -- <檔>` |
| `HomePage.tsx` | L1-1／P1b 若在第 3 波 | `hasBottomNav` 一行改讀 view |
| `registrationFlow.ts` | — | 新增 `classifyMembershipGate`、`isFirstTimeFunnel`、`nextFunnelRoute`、`FUNNEL_ROUTES` |
| `e2e/conftest.py`、`backend_api_mock.py`、`payment_result_steps.py` | — | 冷啟動計次基線重算放 **A2b**；新 fixture 與 feature 放 A3 |
| `index.ts`、`_shared/api-contract.ts` | 第 3 波若有後端工項 | PR-B 才動 |

- 多步驟流程四契約：頁首登出＝新增離開出口，不改進度、不刪帳號、不清草稿（D3），重新登入由 `resolvePostLoginAction` 接回；
  E4 的「繼續完成註冊」＝重入入口，與守衛同一來源——契約 2 維持。
- **A0 清查**（v2 審查 P2 提前）：`grep -n "isLoggedIn" src --include=*.tsx`（非測試）逐一判定是否屬視覺切換、列入 view 或明確排除，
  結果記 progress.md；A3 的 S3「手機無 BottomNav」依賴這份結果。

## 4. UI/UX（差異）

### 4.1 頁首五版本（`resolveAuthView`）

| view | 何時 | 頁首右側 | BottomNav／`main` padding／`hasBottomNav` |
|---|---|---|---|
| `guest` | `anonymous` 且**非**漏斗路由；或 `unknown` 無提示且非漏斗路由 | 「登入」ghost＋「立即刊登」primary（現況） | 無 |
| `placeholder` | 漏斗路由上的 `unknown` 無提示（D5）**或** `anonymous`（E2：OTP 驗證前） | 空，右側保留 40px 高固定寬槽（不位移、`aria-hidden`） | 無 |
| `member-pending` | `unknown` 且提示 `member` | 頭像鈕（40px 圓＋`initial`、`aria-busy="true"`）；選單在 `/profile` 回來前只列「登出」，頂端一行「載入中…」（不列一排灰色項目） | 有 |
| `funnel` | `isFunnel`；或 `unknown` 且提示 `funnel` | 漏斗路由：**只有「登出」**；非漏斗路由（E4）：「繼續完成註冊」（gate＝`activating` 時為「查看開通進度」，F2）＋「登出」 | 無 |
| `member` | `authenticated` 且非 funnel | 頭像選單（現況）；admin「平台管理」連結＋待處理小圓點（`aria-label` 含數字） | 有 |

- 「登出」：`variant="ghost"`＋`LogOut` icon＋可見文字，低於頁面主 CTA（ui-ux §11）；ghost 或 `tone="secondary"` 以 A3 實機截圖定案（Q6）。
- 「繼續完成註冊」（E4）／「查看開通進度」（F2）：`Link` 到 `nextFunnelRoute`，`Button` 預設尺寸 primary（非漏斗路由上它就是這個人唯一的
  下一步）；文字不縮寫。
- **320px 窄寬（F1）**：funnel＋E4 時「登出」只留 `LogOut` icon，`aria-label="登出"`、觸控 ≥44px；斷點以 Tailwind `sm` 以下為準，A3 截圖確認
  logo＋全文鈕＋icon 鈕同列。S8 對這一格量**寬度**（三者右緣不超出 `nav` 內寬、無換行）。漏斗路由單顆登出時保留文字。
- `placeholder` 的等待：PR-A 無逾時，`/profile` 慢時頁首槽保持空白，**頁面主體**沿用各頁既有載入態（`ProtectedRoute` 置中 spinner、
  CompleteProfile／OTP 頁自身表單）；A3 逐頁確認漏斗路由主體在等待期間都有可見、**可讀**（文字或 `role="status"`）的載入指示，缺的補
  既有 spinner 並加可讀文字（不新增元件）。
- **安全出口只管 `getSession()`（F4）**：`getSession()` 例外或 10 秒內未 resolve → 改畫 `guest`（加測試）。`/profile` 卡住（PR-A 無逾時）
  時漏斗路由頁首**保持空白**、不畫 guest——畫 guest 之後 `/profile` 回來又翻成「登出」會違反 S4；列 PR-A 已知限制（§7），PR-B 修。
- funnel→member（S5 開通）：BottomNav 出現與 padding 增加與 PaymentResult 導 `/dashboard` 同時發生，接受這一次位移；A3 手機實測確認
  BottomNav 不在導頁前遮住結果頁內容（若會，PaymentResult 路由上延後到導頁後才顯示）。

### 4.2 漏斗登出行為（D2、D3、E5）

- `src/hooks/useFunnelLogout.ts`：頁首 `funnel` 鈕與結帳頁**首購者**「取消／稍後付款」共用。流程：防連點 → `signOut()`（global）→
  清 `user`、`pendingUser`、提示 → toast（gate＝`activating` 用「付款已收到，登入後會自動開通」，其餘用「您已登出，之後用同一帳號
  登入即可繼續完成註冊」）→ `navigate('/login', { replace:true })`。
- 停輪詢：導頁使 PaymentResult／PaymentCheckout 卸載、清 interval；已發出的 `refreshUser` 晚到結果由 bootstrap 的 generation counter 丟棄
  （§2.5），不會在登出後 `setUser`。vitest 斷言。
- Navbar 會員登出（頭像選單）不併入：去向 `/`、無漏斗 toast、需 `startTransition` 順序修正（總綱 §1.2C）；兩者都呼叫 `clearAuthHint()`。
- 續約者的結帳頁鈕（不登出、回首頁）不動。
- 不清草稿（D3）→ 可逆 → 不加確認框。complete-profile 頁「取消註冊（刪帳號）」維持頁內、破壞性樣式；其既有確認框加一句
  「只是想先離開，請用右上角『登出』，資料會保留」（文案待業主順帶確認，不擋開工）。
- 失敗語意（確認）：`signOut()`（global）回錯時，**再呼叫 `signOut({ scope: 'local' })`** 確保本機 session 移除（supabase-js 在網路錯誤時
  不清本機 session——v4 審查 P1，否則導 `/login` 後 AuthPage 偵測到殘留 session 又把人拉回漏斗頁），再清本機狀態並導 `/login`，toast
  「已登出此裝置」。A3 失敗路徑測試斷言之後 `getSession()` 為 null。Navbar 會員登出套同一失敗處理。**與結帳頁現況不同**（現況失敗停原頁並提示錯誤）——
  實作 PR 的「偏離規劃說明」不需列（本 plan 已定），但 A3 要補失敗路徑測試。

### 4.3 a11y

1. 登出是 `<button>`（窄寬 icon-only 時 `aria-label="登出"`，F1）；登入／立即刊登／繼續完成註冊／查看開通進度是 `Link`。
2. 首繪（提示）版與確認後版是**同一 DOM 節點**（同 key、同元素型別，只換 props），換版不 remount、不掉焦點；Navbar.test 以 element reference 斷言。
3. 進行中 `aria-disabled="true"`（不用原生 `disabled`，ui-ux §9），以 ref 防連點，連點只觸發一次 `signOut`。
4. 完成後導 `/login`，焦點沿用該頁現況。
5. 失敗：見 §4.2。
6. `placeholder` 槽 `aria-hidden="true"`；`member-pending` 頭像鈕的 `aria-busy` 在 `/profile` 回來後移除。

## 5. 階段切分（D4：PR-A 必上 11/10，PR-B 可拆）

**PR-A：三態＋提示＋W2-22（無逾時，E1）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| A0 | 開工前置（非 TDD 階段）：§2.1 資料查證 SQL **重跑**（規劃期結果見 §2.1；＞0 即停下回報主 session，F3）、`isLoggedIn` 清查、`localStorage.user`／`pendingSession` 讀寫全表，寫進 progress.md | — | 三項有紀錄、查證後三欄仍為 0 才進 A1 |
| A1 | 純函式：`authHint.ts`（形狀、`uid8`、壞 JSON／未知 kind／storage 例外、舊 `localStorage.user` 遷移）、`classifyMembershipGate`＋`isFirstTimeFunnel`＋`nextFunnelRoute`＋`FUNNEL_ROUTES`（`resolveMembershipRedirect` 改用）、`resolveAuthView`（四態×isFunnel×提示×路由→五 view，含 undefined 回落、`anonymous`＋漏斗路由→`placeholder`）、`fetchProfile`（三分類、single-flight by user id、`force`、`timeoutMs` 可選但 PR-A 不傳） | vitest node | 判定表逐格（未齊／step1／step2 失敗／待開通／續約待開通／續約／admin／停權）；性質測試；路由常數比對 App 路由表；`RequireMembershipRoute` 既有測試全綠 |
| A2a | `useAuthBootstrap` 本體：reducer（§2.2 `outcome` 表、§2.5 動作表）、hint 擁有與寫入 effect（`hintKind` deps）、`uid8` 同步比對、副作用注入（§2.5 表）、generation counter、in-flight map 清空；App.tsx 改用 hook（只換啟動 effect 與 `refreshUser`——搬進 hook 時即**不再** `setItem('user')`；其餘 8 處 fetch 暫不動）；context 加欄與 memo deps | vitest jsdom `renderHook` | `unknown ⇔ isLoadingUser`；5xx 後提示仍在；401 後清除；F1 → `isFunnel`、user null、提示 `funnel`；F2「只變 accountStatus」→ 提示轉 `member`，反向亦然；S11；副作用表每列；`refreshUser` 不轉 unknown；同 uid 重播不轉；登出後晚到結果丟棄；`authState` 轉換觸發 consumer 重繪；`appShell.test` 全綠不放寬；既有 e2e 全綠 |
| A2b | 接線：其餘 8 處 `/profile` fetch 收斂到模組單例 `fetchProfile`（OTP／邀請以 context `ingestProfile` 回灌、AuthPage 掛載 effect 與 bootstrap 合併）、`clearAuthHint` 補 apiClient／CompleteProfile、刪其餘兩處 `localStorage.user` 寫入（AuthPage、CompleteProfile；`refreshUser` 那處已在 A2a 刪）；**既有 e2e 冷啟動計次基線重算** | vitest jsdom＋既有 e2e | 冷啟動 `/profile` 恰一次（含 AuthPage 同掛載）；OTP 後重新整理首繪 `funnel`；邀請 token 清理後仍在；grep 收斂零命中；`grep "setItem('user'"` 零命中；既有 e2e 全綠 |
| A3 | 呈現：Navbar 五 view＋E4 鈕、`member-pending` 選單 aria-disabled、BottomNav／padding／`hasBottomNav`、admin 小圓點、`useFunnelLogout`（結帳頁首購 `handleCancel` 改用、兩種 toast、失敗路徑）、取消註冊確認框一句、a11y 六點、Navbar 會員登出 `startTransition`、漏斗路由主體載入態逐頁確認、`placeholder` 10 秒安全出口；`seed_auth_hint` fixture＋`route_guards.feature` 補 S1、S3、S3′、S4、S5、S8、S9、S10、S11 | vitest jsdom（Navbar.test 補五 view；BottomNav.test 五格契約不變）＋e2e | §1.1 S1–S11。**時程降級**（A2 延誤時可移到 PR-A 之後的小 PR，不影響 S1–S11）：Navbar 會員登出 `startTransition` 修正、取消註冊確認框那一句、漏斗路由主體載入指示的可讀文字補強。**不可降級**：Navbar 會員登出的 `clearAuthHint()` 與失敗時 `scope:'local'` 補登出（否則殘留 `member` 提示＝S11 起因） |
| A4 | 文件：規格書 §2.1 角色表加「註冊中（尚未成為會員）」列——從未訂閱、資料未齊或首購未完成（含已付款待開通）；頁首只有登出（離開漏斗頁時多「繼續完成註冊」／「查看開通進度」）、不可用會員區；註記**仍會看到的三種情形**（§7 已知限制 1–3，
E3／F4／F5）；ui-ux §3 補頁首版本指標一句；PR-A 描述同樣列出這三種。**§14 #8 不動**（屬 PR-B） | check-spec-drift | — |

**PR-B：暫時性故障不登出（來不及就晚一波；不影響 PR-A 驗收；未上線前規格書 §14 #8 維持現況）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| B1 | 後端：`authenticate()` 只給 `profileHandler`、§2.3 讀取對照表、`ProfileReadError` 與三呼叫者 503（含遞迴）、`?retry=1` 跳過 heal／repair、契約 `unknown`＋`PROFILE_FETCH_OUTCOME`；`profileHandler` 外 `requireAuth` 401 零變化列舉（三檔） | deno test（容器無 deno：紅燈證據以 CI 紅燈 run 為準，progress 記 run 連結） | 總綱 §1.4 階段 2 後端案例＋§2.3 每格＋「遞迴重入時查詢失敗 → 503」 |
| B2 | 前端：啟用 `PROFILE_FETCH_TIMEOUT_MS` 8 秒（D6／E1）＋一次自動重試（帶 `?retry=1`）＋逾時不導 `/login`（同時解掉 §7 已知限制 2、3）；冷啟動 transient → `degraded`＋單一 `StatusCallout`；守衛 degraded 畫外框不導頁；`endInvalidSession()` 兩層確認、`scope:'local'`、收 apiClient 與 AuthPage 清理（保留 `keepInviteToken()`） | vitest jsdom＋e2e（503 停外框、5xx 不登出、逾時重試成功） | 總綱 §1.4 階段 2 前端案例、§1.5 degraded 驗收 |
| B3 | 文件：規格書 §5.3「未確認≠不合格」（總綱 §1.3 已定）、§14 #8 改寫為剩餘③④ | check-spec-drift | — |

模型：A2、B1、B2 與其審查用 Opus（跨層契約、登出語意）；A1、A3、A4、B3 用 Sonnet。

## 6. 開放問題

- [x] Q1–Q5：W2-22、D1＝A、D3、D3 推得、D6（v2 已結）。
- [x] E1–E5、F1–F5、登出 scope：見 §0.1。
- [ ] Q6 登出鈕 ghost 或 `tone="secondary"`——A3 實機截圖後由業主看圖定（預設 ghost；截圖須含「漏斗路由單顆登出」，不擋開工）。
- [ ] Q7 取消註冊確認框加的那一句文案（§4.2）——業主順帶確認，不擋開工。
- [ ] Q8 首購結帳頁「稍後付款」鈕現在會登出（D2），鈕上文字是否改成「稍後付款（將登出）」或維持現文案靠事後 toast——業主順帶確認，
  不擋開工（預設維持現文案；檔內現有註解稱「按鈕文字已明示登出」，A3 核對實際文字）。

## 7. 風險與回滾

- 最壞：`isFirstTimeFunnel` 誤判把有效會員畫成漏斗頁首（找不到會員中心）。防線：共用 `classifyMembershipGate`、判定表逐格＋性質測試、
  A0 資料查證（四欄、結果落 progress）、`suspended`／`unknown`／有 `subscriptionEndDate` 明確排除；誤判者仍有 E4「繼續完成註冊」與登出可走，
  不會卡死。
- 提示錯置：`getSession()` null 數十毫秒內清掉；`uid8` 同步比對；e2e 反向案例（S11）。
- PR-A 單獨上線：無逾時、transient 行為同今天——**不比現況差**。
- **已知限制（業主已接受；A4 規格書註記與 PR-A 描述照列）**：
  1. 無本機提示、在非漏斗路由的已登入會員（含 Email 連結首次落在首頁）會閃一次訪客版（E3、F5）。
  2. PR-A 期間 `/profile` 5xx／斷網：有 `member` 提示者看到「頭像占位 → 訪客版 → 導 `/login`」（E1；PR-B 修）。
  3. PR-A 期間漏斗路由遇 `/profile` 卡住：右上角保持空白直到回應（F4；PR-B 的 8 秒逾時修）。
- 回滾：PR-A／PR-B 各自 revert 即回前一狀態；無 migration、無資料回滾。
