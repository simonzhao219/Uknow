# 登入狀態信任（工項 T1）規劃書——子 plan

<!-- 鷹架：上游總綱 §1 為設計主體，本檔只寫「與總綱的差異」與 W2-22。
     總綱取法：git show 55268e03:docs/plans/platform-growth-and-trust/plan.md（§1、§8.2）。
     讀碼基準：develop HEAD 97cc879a（2026-10-31）。行號一律以此為準。 -->

## 0. 一句話

讓已登入會員與註冊中途的人**從第一個畫面起**就看到對的頁首（不先閃「登入／立即刊登」），
且暫時性故障不把人登出，因為業主實測（2026-10-31 手機錄影）重新整理、PayUni 返回、Email
連結進站都會先看到訪客頁首，註冊中途更整段顯示「登入」誘導誤按。

- 業主裁決：W2-21（開 T1 三段式、第 3 波 11/10 晉升）、W2-22（註冊中途頁首只顯示「登出」）。
- 總綱 §1.2 A（三態＋`uknow:auth-hint`）、B（degraded、兩層確認再登出、後端 `authenticate()`）、
  C（砍掉清單）**原樣沿用**，下文只寫差異。

## 1. 使用者需求

- 對照規格書：§2.1 角色表、§4.1 註冊四步、§4.3 可恢復性、§5.3（未確認≠不合格，階段 5 擴寫）、§14 #8①②。
- 驗收情境（總綱 §1.5 全部保留，新增 W2-22 三條）：
  - S1 已登入會員重新整理／從 PayUni 返回：頁首從首繪起**零次**出現「登入」「立即刊登」（e2e MutationObserver 證偽）。
  - S2 訪客首訪：頁首立刻是「登入／立即刊登」，不等任何請求（`line_browser_steps.py:86` 10 秒內可見，維持）。
  - **S3（W2-22）註冊中途**——Email 已驗證、有 session，處於「完善個人資料」「結帳」「付款結果（開通中）」任一頁：
    頁首**只有「登出」**，沒有「登入／立即刊登」，也沒有會員頭像選單；手機 BottomNav 不出現；重新整理後首繪即是此版。
  - **S4（W2-22）**註冊中途按「登出」：回首頁、頁首變訪客版；之後以同帳號登入會接回原步驟（`resolvePostLoginAction`，現況）。
  - **S5（W2-22）**註冊中途完成付款、開通成功：頁首在進會員中心時換成頭像選單，中途不出現「登入」。
- 不做：總綱 §1.2 C 清單；不改註冊漏斗的導向決策（`registrationFlow.ts` 的 `resolvePostLoginAction`／
  `resolveMembershipRedirect` 語意不動）；不動 CompleteProfile 的「取消註冊（刪帳號）」流程。

### 1.1 讀碼更正（總綱 10/19 之後 R2、P1a、#454、#455/#457 改過的事實）

| 總綱寫的 | 現況（97cc879a） | 影響 |
|---|---|---|
| `/profile` 原生 fetch 8 處 | **9 處**：`App.tsx:141,248`、`AuthPage.tsx:188,368`、`CompleteProfile.tsx:196`、`PaymentCheckout.tsx:93,151`、`OTPVerificationPage.tsx:111`（已改成注入 `routeAfterVerifiedSession.fetchProfile`）、**`hooks/useInviteAccept.ts:93`（R2 新增，同樣注入）** | 階段 3 收斂對象 +1；後兩處已是注入式，改注入值即可 |
| `AuthPage` 掛載 effect catch-all `signOut` | R2 改寫成 `sessionState` 三態＋4 秒逾時（`SESSION_CHECK_TIMEOUT_MS`，`:35`）＋清理後 `keepInviteToken()`；5xx 已不登出（`:208-211`），**401/404/410 與 catch 仍 `signOut()` global**（`:199,220`） | friction-log 2026-10-27 R2 交接：三件事必須保留；T1 只把 fetch 換成 `fetchProfile`、catch 分支改成只在 `unauthorized` 清 |
| `requireAuth` 47 呼叫點 | `index.ts` 內 47 處＋`listing-photos.ts`、`referral-invite.ts` 另有呼叫（P1a、R2 新增） | 「除 `profileHandler` 外 401 零變化」的列舉測試要涵蓋三個檔，不只 `index.ts` |
| `buildProfileResponse` `:408-434`、`profileHandler` `:610-616`、`accountStatus ?? 'expired'` `:492` | `:444-475`、`:645-655`、`:528`；呼叫者 `:649`、`:790`、`:853`＋自癒遞迴 `:490` | 行號更新；自癒遞迴也要吃到 fail-closed |
| `UserContext` 讀者 23 檔、`vi.mock('../App')` 17 支 | 26 檔（非測試）、22 支 mock | `resolveAuthView` 回落舊行為的範圍擴大，契約不變 |
| `HomePage.tsx:388` `hasBottomNav` | `:439`（`hasBottomNav={isLoggedIn}`）；#455/#457 的 `homeListingsCache` 只管篩選與列表快取，**不讀 auth** | 一行改動，無語意交集 |
| `main` padding `App.tsx:296` | `:298` | — |
| `localStorage.user` 3 寫 9 清 | 寫：`App.tsx:257`、`AuthPage.tsx:408`、`CompleteProfile.tsx:586` | 不變（仍零讀者），照總綱刪 |

**與業主描述不一致的一點（請主 session 對影片核實）**：`/payment/checkout`、`/payment/result` 包在 `ProtectedRoute`
（`App.tsx:400-415`），資料已填齊的人 `App.tsx:161-168` 會 `setUser`，所以**結帳頁載入完成後頁首依碼應是完整頭像選單**
（會員中心／推薦管理…點了又被 `RequireMembershipRoute` 彈回結帳），不是「登入」；結帳頁看到的「登入」應是成因 1
的冷啟動閃動。整段顯示「登入」的是**完善個人資料頁**（資料未齊 → 不 `setUser`）與 OTP 驗證頁。W2-22 的處置對兩種
現象都成立（結帳頁的完整頭像選單也是錯的——那些入口對未付款者全是死路），本規劃以「漏斗狀態只顯示登出」一併處理。

## 2. 系統設計（差異）

### 2.1 第五態 `funnel`——狀態來源不只靠 user

`authState: 'unknown' | 'anonymous' | 'funnel' | 'authenticated' | 'degraded'`。`funnel` 由**兩種事實**之一成立：

| 來源 | 條件 | `user` | 說明 |
|---|---|---|---|
| F1 資料未齊 | 有 session、`/profile` ok、`!isProfileComplete(profile)` | 維持 `null`（現況、總綱 §1.2A） | `useAuthBootstrap` 另存 `funnelProfile`（不進 `user`，以免 `ProtectedRoute` 放行） |
| F2 首購未完成 | `user` 非 null、`isFirstTimeFunnel(user)` | 照現況 set（`/payment/*` 的 `ProtectedRoute` 需要） | 純函式由 profile 推導，`setUser`／`refreshUser` 後自動重算 |

`isFirstTimeFunnel(p) = !p.isAdmin && p.accountStatus !== 'active' && !p.subscriptionEndDate`
——與 `resolveMembershipRedirect` 的第 3／5／6 格同一組條件（從未訂閱過、非 admin、會籍非 active），放在
`registrationFlow.ts` 由兩邊共用，不另寫一份。**不含**會籍失效的續約會員（規格書 §2.1：會籍失效仍是會員、獎勵頁可讀，
維持頭像選單）、停權者、admin。`accountStatus: 'unknown'`（總綱 B 新增）→ 不算 funnel，走 degraded 呈現。
已付款待開通（`paidAwaitingActivation`）落在 F2 → 只顯示登出：見開放問題 Q2。

### 2.2 提示鍵 `uknow:auth-hint`（e2e 契約，總綱 §1.2A 的形狀加一欄）

```
{ "v": 1, "kind": "member" | "funnel", "initial": "王", "at": 1730000000000 }
```

- `kind` 是 W2-22 新增：總綱原寫「`/profile` 回資料未齊 → 清提示」，**改為寫 `kind:'funnel'`**（`initial` 可空），
  F2 也寫 `funnel`；開通成功（`isFirstTimeFunnel` 轉 false）時覆寫成 `member`。
- 清除時機不變（`getSession()` null、`INITIAL_SESSION` 無 session、`signOut()`／失敗、401 確認後），其中「資料未齊」那一條移除。
- 首繪：`kind:'funnel'` → 頁首直接畫「登出」（`signOut` 不依賴 `/profile`，首繪就可按）；`kind:'member'` → 總綱的可點頭像占位。
- 壞 JSON、未知 `v`、未知 `kind` → 視同無提示（畫訪客版），並 `removeItem`。
- e2e：`e2e/conftest.py` 新增 `seed_auth_hint(page, kind, initial)`（`add_init_script` 預寫）；鍵名與形狀寫進
  `docs/e2e-journey-test-design.md` 的契約表（若該檔沒有合適表格，就在 fixture docstring 寫一次，規格書不抄）。

### 2.3 API／資料庫

- API：照總綱 §1.2B（`authenticate()` 只給 `profileHandler`、五個讀取 fail-closed、`app.onError` 503 JSON、契約加
  `accountStatus:'unknown'`、`PROFILE_FETCH_OUTCOME`）。W2-22 **不需要新欄位**：`isProfileComplete` 與 `isFirstTimeFunnel`
  所需欄位 `/profile` 已回（`name/phone/birthDate/accountStatus/subscriptionEndDate/isAdmin/paidAwaitingActivation`）。
- **Migration：不需要。** 沒有 schema、RPC、RLS 變更；`effective_registration_step` 不動。

### 2.4 `/profile` P95 量測（逾時基線）

develop 預覽站流量太少，P95 不可信，改「兩段」：

1. **伺服器端**（主 session 代跑，唯讀）：Supabase Logs Explorer／`get_logs`（edge function）對**正式專案與 develop 分支各一次**：
   ```sql
   select count(*) as n,
          approx_quantiles(m.execution_time_ms, 100)[offset(50)] as p50,
          approx_quantiles(m.execution_time_ms, 100)[offset(95)] as p95,
          max(m.execution_time_ms) as max_ms
   from function_edge_logs
     cross join unnest(metadata) as m
     cross join unnest(m.request) as r
   where r.path like '%/api/%profile'
     and r.method = 'GET'
     and timestamp > timestamp_sub(current_timestamp(), interval 7 day)
   ```
   （`n < 200` 就把區間拉到 14 天；已付款會員會 await 三支 repair RPC，所以要看 p95 與 max 的差距。）
2. **端到端**（執行 session 在階段 3 前做，或業主手機）：develop 預覽站以測試帳號重新整理 30 次，devtools 量
   `getSession` 起到 `/profile` 回應結束，取 P95。
3. 逾時 = `clamp(3 × 端到端 P95, 4s, 10s)`；量不到時預設 **8 秒**。數字落 progress.md，常數放 `fetchProfile.ts` 並註明來源。

## 3. 架構影響（差異）

- 撞檔（總綱 §8.2 重算）：

| 檔案 | 現況撞誰 | 處置 |
|---|---|---|
| `App.tsx`、`Navbar.tsx`、`BottomNav.tsx`、`ProtectedRoute`／`AdminRoute`／`RequireMembershipRoute`、`apiClient.ts` | R2 已合併（只動豁免清單）；第 3 波目前無他人登記 | T1 獨佔；第 3 波其他工項動到這些檔先向主 session 登記 |
| `AuthPage.tsx`、`OTPVerificationPage.tsx`、`useInviteAccept.ts`、`routeAfterVerifiedSession.ts` | R2 已合併 | 以 R2 版為基準；`AuthPage` 掛載 effect 的三件事保留（§1.1） |
| `CompleteProfile.tsx`、`PaymentCheckout.tsx` | A1b-1b、S7b（不同區段） | T1 只換 `/profile` fetch 與 `setUser`／`localStorage.user`；開工前 `git log origin/develop -- <檔>` 再確認 |
| `HomePage.tsx` | #455/#457 已合併、L1-1／P1b 若在第 3 波 | 一行（`:439`），先合併者定 |
| `index.ts` | 第 3 波若有後端工項 | 只動 `requireAuth` 旁新增 `authenticate`、`buildProfileResponse`、`profileHandler`、`app.onError` |
| `registrationFlow.ts` | — | 新增 `isFirstTimeFunnel`，`RequireMembershipRoute` 改用它（行為不變，測試釘住） |
| `e2e/conftest.py`、`backend_api_mock.py` | — | 新 fixture；`set_profile_sequence` 全域計次，冷啟動次數變了要重基線（`payment_result_steps.py`） |

- Import 邊界（總綱 §1.3）：`authHint` 寫入／清除只准 `App.tsx` 與 `useAuthBootstrap`；`resolveAuthView`、`isFirstTimeFunnel`
  不從 `App.tsx` 匯出（22 支 mock 會吞掉）。
- 多步驟流程四契約：註冊漏斗頁首加「登出」= 新增一個**離開**出口，不影響「可查詢、可重入」；登出不刪帳號、不改進度，
  重新登入接回（`resolvePostLoginAction`）——契約 2「每步可重入」維持。
- 安全：提示不含 email、isAdmin、手機；`localStorage.user`（含未遮罩手機）刪除是淨改善。

## 4. UI/UX（差異）

頁首依 `resolveAuthView()` 的回傳畫四種版本：

| view | 何時 | 頁首右側 | BottomNav／`main` padding／`hasBottomNav` |
|---|---|---|---|
| `guest` | `anonymous`、或無提示的 `unknown` | 「登入」ghost＋「立即刊登」primary（現況） | 無 |
| `member-pending` | `unknown`／`degraded` 且提示 `member` | 可點頭像占位（總綱） | 有 |
| `funnel` | `funnel`、或 `unknown`／`degraded` 且提示 `funnel` | **只有「登出」**：`Button tone="secondary"`（次要位階，ui-ux §11）、`LogOut` icon＋可見文字「登出」、觸控 ≥44px | 無（漏斗頁不可用會員區；五格全是死路） |
| `member` | `authenticated` 且非 funnel | 頭像選單（現況；admin 連結＋小圓點 badge 照總綱） | 有 |

- 漏斗「登出」行為：與 Navbar `handleLogout` 共用同一條（`startTransition` 順序修正照總綱），額外清 `pendingUser`
  （現況 Navbar 登出不清，下一位使用者同分頁會讀到）；草稿是否清見 Q3。無確認對話框——登出可逆、不刪帳號（Q4）。
- 結帳頁自己的「取消／稍後付款」鈕（`PaymentCheckout.tsx:555-580`，續約者不登出）不動；頁首登出與它並存，語意不同：
  頁首＝離開這個帳號；頁內＝放棄這次付款。
- 行動版：頁首高度 64px 不變，「登出」與 logo 同列不換行（最窄 320px 驗）；CLS=0 一併由 e2e 量。
- 載入態：`funnel` 不需骨架（沒有等待中的資料）；錯誤態照總綱 degraded 的單一 `StatusCallout`。

## 5. 階段切分（總綱 §1.4 拆成 5 段；後端獨立一段，方便審查用 Opus）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 純函式：`authHint.ts`（`kind` 欄、壞 JSON／未知 kind／storage 例外、舊 `localStorage.user` 遷移）、`isFirstTimeFunnel`（`registrationFlow.ts`，`RequireMembershipRoute` 改用）、`resolveAuthView()`（五態 × 提示三種 → 四 view，含舊 fixture 無 `authState` 回落）、`fetchProfile()` 三分類＋逾時 | vitest node | 清除時機五種各一案；funnel 判定表（未齊／step1／step2 失敗／待開通／續約／admin／停權／unknown）逐格；`resolveMembershipRedirect` 既有測試全綠 |
| 2 | 後端：`authenticate()` 分類表、`buildProfileResponse` 五讀取 fail-closed（含自癒遞迴 `:490`）、零列仍 404、`app.onError` 503 JSON、契約 `accountStatus:'unknown'`＋`PROFILE_FETCH_OUTCOME`；`profileHandler` 以外 `requireAuth` 401 零變化列舉（`index.ts`＋`listing-photos.ts`＋`referral-invite.ts`） | deno test（容器無 deno，執行 session 先裝或交 CI） | Auth 5xx → 503；單一讀取失敗 → 503 逐讀取；零列 404；其餘端點 401 不變 |
| 3 | `useAuthBootstrap()`：single-flight、取消、一次重試、兩層確認再登出、`scope:'local'`、`endInvalidSession()` 收 apiClient；`funnelProfile`（F1）；9 處 fetch＋`refreshUser` 呼叫點收斂；`AuthPage` 掛載 effect 保留 R2 三件事 | vitest jsdom `renderHook` | 總綱 §1.4 階段 2 前端案例全部＋：資料未齊 → `funnel` 且 user=null 且提示 `funnel`；開通後提示轉 `member`；AuthPage 邀請 token 在清理後仍在 |
| 4 | 呈現：Navbar 四 view、BottomNav／`main` padding／`HomePage:439` 依 view、admin badge 小圓點、守衛 degraded 畫外框、漏斗登出（清 `pendingUser`）、登出 `startTransition` | vitest jsdom（Navbar.test 補四 view；BottomNav.test 五格契約不變）＋ e2e `route_guards.feature` 補 4 條 | 有 member 提示首繪零「登入」；有 funnel 提示首繪只見「登出」；complete-profile／checkout 頁頁首無「登入」「立即刊登」、無頭像；503 停在外框；無提示訪客立刻見「登入」 |
| 5 | 文件：規格書 §2.1 角色表補「註冊中（未付款）」一列（頁首只有登出、不可用會員區）、§5.3 擴寫「未確認≠不合格」、§14 #8 改寫為剩餘③④；ui-ux §3 補一句頁首四版本指標 | check-spec-drift | — |

重量：中偏重（三段式落檔）。模型：階段 2、3 與其審查用 Opus（跨層契約、登出語意）；1、4、5 用 Sonnet。

## 6. 開放問題

- [ ] **Q1 漏斗頁首要不要保留 logo 以外的任何東西？** 本案只放「登出」（W2-22 字面）。替代：加「客服」連結。建議照字面只放登出。
- [ ] **Q2 已付款待開通（`/payment/result` 開通中）算漏斗嗎？** 本案算（只顯示登出；開通後自動換頭像）。替代：視同會員顯示頭像
  （但選單項目全會被守衛彈回結果頁）。建議算漏斗。
- [ ] **Q3 頁首「登出」要不要清完善資料草稿（`uknow:draft:complete-profile`）？** 清：共用裝置的下一位看不到前一位的身分資料；
  不清：誤按登出再登入，填到一半的表單還在。建議**清**（身分證字號等個資不該在登出後留在裝置上；後端已存的進度不受影響）。
- [ ] **Q4 漏斗「登出」要不要確認對話框？** 建議不要（可逆、不刪帳號；ui-ux §11 確認框留給不可逆動作）。若 Q3 選清草稿且使用者在
  完善資料頁已輸入內容，改為只在**該頁有未送出輸入時**確認一次——此為備案。
- [ ] **Q5 逾時常數**：依 §2.4 量測；量不到時是否接受預設 8 秒。建議接受。

## 7. 風險與回滾

- 最壞：`isFirstTimeFunnel` 判錯把有效會員畫成漏斗頁首（只剩登出）——會員找不到會員中心入口。防線：判定表逐格測試、
  `accountStatus:'unknown'` 明確排除、與 `resolveMembershipRedirect` 共用同一函式（守衛放行者不可能是 funnel，加一條性質測試）。
- 最壞：提示鍵寫錯讓訪客首繪看到頭像占位——`getSession()` null 會在數十毫秒內清掉並畫訪客版；e2e 反向案例釘住。
- 後端 503 新路徑：前端舊版本（快取中的 bundle）把 503 當「其他錯誤」保留現狀，不會登出——向下相容。
- 回滾：前端 revert PR 即回現況；後端 revert 後 `/profile` 回到 401／404 行為。無 migration，無資料回滾。
