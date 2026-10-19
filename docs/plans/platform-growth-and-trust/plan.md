# 平台信任感與成長——六項新需求總綱（v3，重審與第一波施工後回填）

<!-- plans-keep: 跨 session 施工鷹架（§8 仍有未開工工項，順序與 platform-uiux-redesign 的 S7–S8 交錯）；退場條件＝§8 全部工項合併或明確作廢、決策升級進規格書／ui-ux-guidelines／friction-log 後，收尾時整個目錄刪除 -->

> 業主 2026-10-16 提出六項需求（登入狀態閃爍、推薦分享與被推薦者註冊、刊登照片、管理者核對、定位、管理者代改資料），
> 要求「系統穩定優先、使用者信任且流暢、符合主流直覺的 UI/UX」一併規劃。本檔是**總綱**：每項先講現況與根因（讀碼事實，
> 附 develop HEAD 的檔案:行號），再給設計、穩定性取捨、分期與測試、需業主裁決的問題。
>
> 版本：v1（`ed89b8f`）→ v2（四視角 `/review-plan` 回填，§12）→ **v3**：依業主 2026-10-17 重審報告（PR #378 留言
> 6230904825，150 位唯讀代理＋反駁者）與第一波三個施工 PR（#380 推薦碼端點關洞、#382 註冊完成守衛、#381 推薦入口三顆
> 共用元件，2026-10-19 全部合併進 develop）回填。v3 做了四件事：(1) 重審報告確認的 major 逐條處置（§15）；(2) 已合併的
> 工項改寫成「已完成＋實作偏離」，剩餘範圍重切；(3) 七節「現況與根因」對 develop HEAD `2fa1f2c` 逐條重核，行號全部重標，
> 寫錯的改掉（§15）；(4) 法務題一次問齊（§14）。v2 的裁決題編號沿用，作廢的標明。

## 給業主的十分鐘版

**開放問題已於 2026-10-19 與業主逐題裁決完畢（§13 最後一列）**；服務條款、參加契約、事業手冊已經律師定案、**不可更改**，
產品與規格書向文件對齊（§14）。每列的「一句話結論」末尾標正文位置：

| 項 | 狀態（2026-10-19） | 一句話結論 | 要您拍板的核心 |
|---|---|---|---|
| 1 登入閃爍（T1） | 待開工，範圍已縮 | 首繪不再猜「未登入」：有本機提示就畫頭像占位、沒有就直接畫訪客版；前端登出前先確認、暫時性故障不登出；後端 `/profile` 不再把暫時性故障翻成 401／404（其餘端點的假 401 由前端確認補償，是接受的殘餘）→ §1 | Q1-1 首繪策略（推薦：本機提示）；Q1-2 後端 `/profile` 的錯誤分類一併修（推薦：併） |
| 2-1 分享（R1a） | **入口與順位已上線**（#381） | 會員中心與推薦管理各一顆「邀請好友」、系統分享面板→所在 App→複製、閘門單一來源；剩 og 預覽與 `lang`、依手冊 4-1-2 的揭露句 → §2.2 | 已裁：揭露句照文件寫（§14 第 1 題）；真機驗收結果回填 PR #381 |
| 2-2 被推薦者（R0／R1b） | **R0 已上線**（#380）；R1b 作廢 | 拿碼猜名的面從匿名降到需登入＋限流（不是關閉）；邀請物件、落地頁、邀請紀錄整套不做——沒有縮短任何點擊 → §2.1、§2.3 | 已裁：未簽約者的碼維持現況（契約第 3 條把發獎綁在證件與提領），只補停權檢查小 PR |
| 3 照片（P1a／P1b） | 待開工，核心保留 | 選圖→每張進 1:1 裁切→壓縮（剝 EXIF）→逐張上傳；維持恰好 3 張；刪照片與刪刊登改走後端清理；顯示容器統一正方形、手機可滑動切圖。草稿持久化、舊圖重裁、配額與排程清理改選配 → §3 | Q3-1 張數改「1–3 張」（推薦）；Q3-3 自動裁＋選用調整（推薦） |
| 4 核對（A1a／A2） | 待開工，已拆開 | 先做純讀的會員核對面板與十一項對帳；稽核軌跡搬去跟代改一起做 → §4 | Q4-5 面板在 Sheet 內、對帳放告警次分頁（推薦）；Q4-6「合理／完整／定期」的範圍 |
| 5 定位（L1） | 待開工，改最小版 | 訪客 GPS 只在前端吸附到所在區、用完即丟、不送後端；刊登依服務區的中心點算距離；預設「離我最近」，被拒就選地區；不開新表、不改條款 → §5 | 已裁：區級、進站就要定位、被拒可選地區、資料用政府開放資料 |
| 6 代改（A1b） | **階段 1 已上線**（#382） | 已付款會員不能再改身分資料（API 與直連都關了）；後台代改五欄限「更正輸入錯誤」，推薦人只在沒有子代時可改，變更身分證字號的書面程序維持人工 → §6 | 已裁：在途提領時拒改、一律重設證件驗證、稽核全 fail-closed、敏感值只存遮罩 |

**一個被漏掉的產品狀態**：首購者付完年費 100% 是「已付費、未加入推薦計畫」——碼已產生但不可出示、不可分享、不能提領。
#381 的入口元件已處理（未加入者看到的是「加入推薦計畫」引導鈕），本總綱 §7 影響表與 S7／S8 的 persona 也補上這個狀態。

**施工順序**（§8）：S7 prompt 重寫（另案）→ T1 ∥ A1a（純讀後端）∥ P1a → A2 → A1b（稽核＋代改＋手動調整）→ L1、P1b、
R1a-2／R1a-3 各一個 Plan Mode PR。在途工項上限 3。沒有任何裁決擋開工。

## 0. 貫穿原則

1. **沒確認的狀態不畫成已知狀態**：不知道有沒有登入就不畫「登入」鈕；不知道資料是否同步就不畫 0；不知道定位就不排距離；
   不知道有沒有送達就不寫「已送出」。這是「系統不穩」觀感的共同根因——畫面先給一個答案、幾百毫秒後再改口。
2. **先改呈現與資料流，不動金流與會籍規則**：碰到點數、推薦邊、付款的地方一律只讀或可稽核的單點寫入，不改既有的發獎、
   換線、提領函式（規格書 §7–§10 不變）。會動到規格書／條款／手冊文字的地方全部列在 §8.6 的「現行規則變動表」並各有裁決題
   （§12 的 v2 表只留歷史）。
3. **主流樣式不等於新框架**：裁切用 IG 的手勢與比例、分享用系統分享面板、定位用「離我最近」排序鈕——都在既有
   React Context／Tailwind／Radix 內做，不引入狀態庫、UI 框架、地圖套件（延續 platform-uiux-redesign plan.md §5）。
4. **法遵與個資先於功能，且文件不可改**：服務條款、傳銷商參加契約、事業手冊已經律師定案（業主 2026-10-19），本總綱任何工項
   都不得以「改條款」為前提——產品與規格書向文件對齊（§14）。新的招募曝光面要照手冊 4-1-2 揭露；位置資料不儲存（條款十二沒有
   這個類別，也不能加）；稽核紀錄的保存期限照條款十二「終止後一年」。
5. **「已付費、未加入推薦計畫」是正式狀態**（v3 新增）：推薦碼在首次付款成功時產生（`process_successful_payment`），
   但 `myQrTabsForUser()` 規定 `invite = joined && referralCode`；簽參加契約書（`POST /referrals/join-program`）之前不出示、
   不複製、不分享、不能提領。任何推薦、獎勵、分享相關的設計都要有這個狀態的畫面與文案。
6. **事實要打開程式碼核對**（v3 新增）：總綱裡每個「現況」都附 develop HEAD 的檔案:行號；改版時逐條重核，行號漂移要重標，
   寫錯的在 §15 留紀錄。重審報告抓到的錯誤多半是沒打開程式碼就下結論（含主 session 自己寫的 S7 第 (9) 條與 §13 的法務讀碼）。

## 1. 登入狀態與安心設計（工項 T1）

### 1.1 現況與根因（讀碼事實，develop HEAD `2fa1f2c`；三個 PR 沒碰 `App.tsx`／`Navbar.tsx`／`AuthPage.tsx`／`BottomNav.tsx`／守衛，`CompleteProfile.tsx` 與 `PaymentCheckout.tsx` 的行號已依 #380／#382 後重標，`index.ts` 行號因 #380 插入限流區塊整體 +50～+60。業主附的影片本 session 讀不到，第 1 項依文字描述與讀碼規劃、真機驗收為準）

- 首次繪製必然是未登入版：`user` 初值 `null`、`isLoggedIn = !!user`（`src/App.tsx:119,131`），Navbar 只看 `isLoggedIn`、不看
  `isLoadingUser`（`src/components/Navbar.tsx:32,101-109`）。23 個讀 `UserContext` 的檔案（#381 新增三顆推薦元件）裡只有
  `ProtectedRoute` 與 `AdminRoute` 讀 `isLoadingUser`。
- 之後才換版：首次 render → effect → `supabase.auth.getSession()` → 原生 fetch `/profile` → `setUser`（`App.tsx:133-187`；
  `onAuthStateChange` 只處理 SIGNED_IN／SIGNED_OUT，沒有 INITIAL_SESSION 分支）。`/profile` 對已付款會員還依序 await 三支
  repair RPC（`index.ts:464-465` → `:2273-2285`），不在 ETag 讀端點清單（`:129-137`）。
- `/profile`（別名 `/auth/profile`，`index.ts:618-619`）的原生 fetch 全站共 8 處、各自處置失敗、沒有逾時（`App.tsx:140,246`、
  `AuthPage.tsx:56,224`、`CompleteProfile.tsx:193`、`PaymentCheckout.tsx:93,151`、`OTPVerificationPage.tsx:119`）。其中
  `refreshUser`（`App.tsx:240-262`，失敗一律回 null）在三個 PR 後多了消費者：`PaymentResult.tsx:234,258`（既有）、
  `CompleteProfile.tsx:214,535`（#382 的編輯守衛與 403 出口）、`referral/InviteFriendButton.tsx:66`（#381 簽完翻鈕）。
- **現況已經會把暫時性錯誤變成「導去登入頁」**：`App.tsx:152-155` 對非 401／404／410 的失敗直接 return、不 `setUser`，
  `:167` finally 把 `isLoadingUser` 設 false → `ProtectedRoute.tsx:28-38`（`AdminRoute.tsx:12-22` 同）在 `!isLoggedIn` 時
  `<Navigate to="/login">`；登入頁掛載又打一次 `/auth/profile`（`AuthPage.tsx:44-88`）且 catch-all `signOut()`（`:77-82`，
  預設 `scope: 'global'`）——冷啟動遇 5xx 的實際路徑是「導去登入頁 → 再查一次 → 網路仍斷就登出所有裝置」。
- 同一根因的其他位置：BottomNav 載入中不畫、登入後整個冒出（`BottomNav.tsx:32`）；`main` 底部 padding 登入後才加
  （`App.tsx:296`）；首頁搜尋 FAB 登入後上移（`HomePage.tsx:388`，S6 合併後的行號）；`MaintenanceBanner` 自己再查一次
  session、淡入時把內容往下推（`MaintenanceBanner.tsx:54-122`，走 `utils/auth.ts:65-68` 的 `isAuthenticated`）；已登入者在
  `/login` 按 F5 先看到表單再被導走（`AuthPage.tsx:90-94`）；守衛與 `RouteLoader` 是三處、兩種置中 spinner
  （`ProtectedRoute.tsx:29-33`＝`AdminRoute.tsx:13-17`；`App.tsx:92-98`）。
- `localStorage.user` 是 write-only（3 處寫、9 處清、零讀者；`App.tsx:252-254` 的「整頁載入會讀回」是過時註解），內容是整份
  profile（含未遮罩手機，`index.ts:472`）長駐——該刪不該用。死鍵 `pendingSession` 只有 removeItem。
- **後端會把暫時性故障翻成「不合格」**：`requireAuth`（`index.ts:242-247`）對 `auth.getUser` 任何錯誤回 null，**47 個呼叫點**
  共用、全部映成 401（42 處是 `{ error: '未授權' }` 字面、含 `/admin/*` middleware；另 5 處信封不同，含付款與提領端點）；`buildProfileResponse`（`:408-434`）解構只取 `data`、吞掉
  profiles 讀取錯誤→null→`profileHandler` 回 404（`:610-616`）；`accountStatus: acct?.status ?? 'expired'`（`:492`）。前端收到
  404 就 `signOut()`（`App.tsx:145-146`），`signOut()` 預設 `scope: 'global'`——撤銷該使用者**所有裝置**的 session。規格書
  §14 #8 記了這件事但沒有工項承接（四個子項在三個 PR 後原封未動）。
- **`apiClient` 對 401 也做全域登出**：`src/utils/apiClient.ts:78-86` 先 `refreshSession()` 重試一次，仍 401 時 `:191-208`
  `signOut()`（global）＋清 localStorage＋`emitSessionExpired()` → `App.tsx:221-230` 靜默導 `/login`。所有 `apiRequestJson`
  呼叫者共用，v2 漏列。
- 其他：登出先 `setUser(null)` 讓受保護頁閃到 `/login` 再回首頁（`Navbar.tsx:53-91`；react-router 7 的導頁包在
  `startTransition`，單純對調順序無效）；`ErrorBoundary` 只包 `<Routes>`（`App.tsx:300-301`）、沒有 fallback prop、不收 error
  物件。

### 1.2 設計（v3 縮：只留「首繪不閃」與「暫時性故障不登出」兩個核心）

**A. 登入狀態三態＋本機提示（Q1-1，推薦）**

- `UserContext` 的值加 `authState: 'unknown' | 'anonymous' | 'authenticated' | 'degraded'`（**加性**：舊欄位全留，17 支
  `vi.mock('../App')`／`'../../App'` 的舊 fixture 沒有這個 key 時由純函式 `resolveAuthView()` 回落到舊行為；`ProtectedRoute`／
  `AdminRoute` 的授權判斷不變）。註冊漏斗（有 session、profile 未填齊，`App.tsx:160-164`）是第五種合法狀態，維持 `user=null`、
  導向 complete-profile，**不**視為 degraded。
- **首繪提示** `uknow:auth-hint`：只存 `{ initial: 首字, at }`，不存 email、isAdmin。App 第一個 render 同步讀它：有提示 →
  頁首畫**可點的**頭像鈕（同一顆 40px 圓＋首字、`aria-busy`；選單的靜態連結與「登出」首繪就能開，只有姓名列等 `/profile`）、
  BottomNav **直接畫真的五格**（五格不依賴 user）、`main` padding 先加、首頁 `hasBottomNav`（`HomePage.tsx:388`）跟著提示走
  （**併入 T1，不另開 PR**——重審 T1-06）；沒有提示 → 直接畫訪客版，訪客不等任何請求。管理後台連結與待處理 badge 一律等
  `/profile` 確認後才出現，badge 改成絕對定位小圓點（晚到的第二個請求不再撐寬按鈕；`aria-label` 仍含數字，不只靠顏色）。
  既有登入者升版後第一次開站沒有提示：啟動時若無提示但有舊 `localStorage.user`，先取其姓名首字寫成提示再 `removeItem`；
  姓名列在 `/profile` 回來前用骨架、不留空列；已登入者在 `/login` 按 F5：有提示時先畫骨架不畫表單。
- **寫入與清除只有一個 choke point**：`UserContext` 提供的 `setUser` 換成包裝版（非 null→寫提示；null→清提示），`refreshUser`
  也走它；再補四個清除時機：`getSession()` 回 null、`INITIAL_SESSION` 無 session、`/profile` 回「資料未齊」、`signOut()` 失敗。
  `localStorage.user` 與死鍵 `pendingSession` 刪除（啟動時一次 `removeItem` 清舊殘留；`App.tsx:252-254` 的過時註解一併刪）。
  提示鍵名成為 e2e 契約（fixtures 預寫）。
- 為什麼不用「一律中性直到確認」：訪客會看到頁首空白幾百毫秒，首頁是「未登入也要完美」的路徑。為什麼不用 Supabase 的
  `sb-*` key 當提示：key 名依專案 ref、JSON 形狀是函式庫內部契約。

**B. `degraded`：暫時性故障不登出、有出口、不自動退避**

- 抽 `fetchProfile(token) → ok | unauthorized | transient`（含逾時——基線在 develop 預覽站量 `/profile` 的 P95（已付款會員會
  await 三支 repair RPC），逾時取其 2–3 倍；`AbortController`；key=`profile:<userId>` 的 single-flight）與 `useAuthBootstrap()`（注入 supabase／fetch，可 `renderHook` 測），**8 處 `/profile` 原生 fetch 與
  `refreshUser` 的 5 個呼叫點全走它**；App 保留 `useRevalidateOnFocus(… refreshUser())` 字面以過 `appShell.test.ts:95-96` 正則。
- `transient`（5xx、斷網、逾時）→ `degraded`——**只在冷啟動 `user==null` 時成立**；已有 user 的背景重驗（focus／online、
  `refreshUser`）失敗維持 `authenticated`、保留舊資料（今天的 stale-while-revalidate），最多出一行非阻擋提示。冷啟動 degraded：
  頁首維持占位；**自動重試一次**（2 秒後，重新 `getSession()` 取新 token），仍失敗就在主內容區（守衛外框內）放**一個**
  ui-ux §6 同款的 `StatusCallout`「網路不穩，正在重新連線」＋「重試」鈕（焦點落在鈕上；全站只有這一個 `role="status"`，
  頁首占位不另加字），focus／online 事件再各觸發一次。
  v2 的「1→2→4→8 秒含 jitter、最多 5 次」與全站常駐狀態行砍掉（重審 T1-13）：一次自動＋手動出口就夠，退避表只是把
  「什麼時候放棄」變成一個沒人驗得了的參數。
- **守衛對 `degraded` 的處置（重審 T1-01，v2 漏寫）**：`ProtectedRoute`／`AdminRoute` 在 `degraded` 時**不導 `/login`**，
  畫受保護頁的外框骨架＋上述那一個 `StatusCallout`；`RequireMembershipRoute` 同。只有 `anonymous` 才導 `/login`。
  `AuthPage` 掛載時那次 `/auth/profile`（`AuthPage.tsx:44-88`）改走 `fetchProfile`，catch-all `signOut` 改成只在 `unauthorized`。
- `unauthorized` 才登出，且**先確認再登出**，確認分兩層（重審 T1-04；`apiClient.ts:76-87,191-208` 與 8 處 fetch 共用同一個
  `endInvalidSession()`）：(1) `refreshSession()` 自身的錯誤要分類——`AuthRetryableFetchError`、status≥500、429、斷網 →
  transient，拋不登出的 `ApiError`（code `AUTH_UNAVAILABLE`），只有 `AuthApiError` 4xx（`invalid_grant`、
  `refresh_token_not_found`、`user_not_found`）才算 unauthorized（現行 `apiClient.ts:81-86` 把任何 refresh 錯誤都當 401 登出，
  正是「暫時性故障被當不合格」的同一類）；(2) refresh 成功但重打仍 401 時，再打一次 `/profile` 用後端 `authenticate()` 的分類
  確認——它是唯一分得出 transient／unauthorized 的端點；回 transient 就不登出、該次請求以 `AUTH_UNAVAILABLE` 失敗。兩層都過
  才 `signOut({ scope: 'local' })`，不再撤銷其他裝置，並帶 `from` 回原頁。這是其餘 46 個端點在 Auth 抖動時仍回假 401 的前端
  補償（見下一點）。
- **後端那一半同一工項做（Q1-2，推薦併），但只動 `/profile` 這條路徑、不動 `requireAuth` 本體**（重審 T1-02：47 個呼叫點
  共用）：新增 `authenticate(token) → { user } | { error: 'unauthorized' | 'transient' }`，只有 `profileHandler`（`:610-616`）
  改用它。分類表：`isAuthRetryableFetchError`、status 0、≥500、429 → transient（503）；其餘 `AuthApiError`（400／401／403，
  含 `user_not_found`）→ unauthorized（401）。`buildProfileResponse` 有三個呼叫者（`/profile` `:613`、`/auth/register` `:750`、
  `/auth/complete-registration` `:813`），契約寫死：profiles 零列（PGRST116）維持 null→404，其他讀取錯誤才 503；**同一個
  `Promise.all` 的五個讀取全部檢查 error**（`:415-432`：profiles、`user_account_status`、`referral_codes`、
  `effective_registration_step`、pending 訂單），任一失敗就 503 或該欄回 `unknown`，不得落到 `?? 1`、`false`、`null`——
  pending 訂單讀取失敗會讓 `paidAwaitingActivation=false`，已付款待開通的會員被導去結帳頁（`RequireMembershipRoute.tsx:44-49`
  自己註明絕不能發生；`/payuni/prepare` 的後端備援見 §6.2C）。Hono 目前沒有 `app.onError`，擲出的例外是 500 純文字，補一個
  統一回 503 JSON。`accountStatus: 'unknown'` 要進 `_shared/api-contract.ts` 的 `ProfileResponseSchema` 與前端讀者（路由守衛對
  `unknown` 視同 degraded、不導續訂）。其餘 46 處 `requireAuth` 語意不變，由 `app.routes` 推導的列舉測試釘住「除 `profileHandler`
  外 46 處 401 零變化」（不以訊息字面為準）。**殘餘**：其餘 46 端點在 Auth 抖動時仍回假 401，由前端的兩層確認補償，該次請求
  失敗但不登出；接受，記 §10。不併的話 `degraded` 只擋得住斷網、擋不住 DB／Auth 抖動這個最常見的形態。
- 冷啟動 `/profile` 只打一次；SIGNED_OUT／換帳號時取消 in-flight，避免登出後「復活」。

**C. 砍掉的（v2 §1.2C／D，重審 T1-13；都不是「首繪不閃、故障不登出」的必要條件）**

| 項 | 去向 |
|---|---|
| `PageSkeleton` 統一三處 spinner | S8 制度化收尾的候選（三處只有兩種 markup，統一是整理不是修 bug） |
| `MaintenanceBanner` 改吃 `UserContext`、不推擠內容 | 選配：T1 階段 3 若順手就做（它是 `utils/auth.ts:65` 的唯一消費者，做完可刪死碼）；不做不影響驗收 |
| `ErrorBoundary` fallback／分類／外層 | 另案 issue |
| 登出 `startTransition` 順序 | T1 階段 3 小項（一行），保留 |
| 5a 殼層安心四項、5b 結帳頁骨架 | 5a 的「session 逾時說明」併入 `endInvalidSession()` 的出口（帶 `from` 回原頁）；離線條、chunk 404 文案、5b 另案 |
| 5c toast 語氣盤點（105 處／24 檔） | 作廢；由 S8 的文案 sweep 決定要不要做 |

### 1.3 穩定性與架構

- 「元件只准從 App 匯入 `UserContext`」升級成 `appShell.test.ts` 守衛，並加一條 import 邊界：`authHint` 的寫入與清除函式只准
  `App.tsx` 與 `useAuthBootstrap` 匯入，`resolveAuthView` 不從 `App.tsx` 匯出（否則 17 支 mock 會吞掉它）；`utils/auth.ts` 的 `isAuthenticated` 若 MaintenanceBanner
  不改就留著（knip 不報死碼，手刪要先確認唯一消費者）。
- 契約：`fetchProfile` 的三分類是前後端共用的錯誤碼對照（`_shared/api-contract.ts` 新增 `PROFILE_FETCH_OUTCOME`）；`/profile`
  是 S5 之後唯一一條「讀取失敗策略＝未知態」的端點，規格書 §5.3 補一句、§14 #8 改寫成剩餘子項（③ `/members/verify`、
  ④ `/referrals/debug`）。
- e2e 契約：`line_browser_steps.py:86` 匿名時 10 秒內看得到「立即刊登」（維持）；新增「`/profile` 延遲 2 秒且 fixtures 預寫
  提示鍵時，頁首從首繪起 DOM 變更紀錄中零次出現『登入』」（`MutationObserver` 由 init script 掛）＋頁首 CLS=0；反向案例
  「提示在、session 已失效」必須出現逾時說明；「`/profile` 回 503」必須停在受保護頁外框而非 `/login`；`set_profile_sequence`
  是全域計次（`backend_api_mock.py:110-125`），冷啟動次數改變要重基線（`payment_result_steps.py:22`）；journey 的 login builder
  依賴 AuthPage「已登入自動導向」（維持）。
- 撞檔：S6 已合併（2026-10-17），`HomePage.tsx:388` 那行併入 T1。#381 沒碰 `App.tsx`／`Navbar.tsx`／`AuthPage.tsx`，v2 寫的
  「與 R1 的交集」已不存在；S7 prompt 重寫後若動會員區頁面也不碰這三檔。T1 是目前唯一會動 `App.tsx` 啟動流程的工項。

### 1.4 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `authHint.ts`（讀寫清除、壞 JSON、storage 例外）、`resolveAuthView()`、`fetchProfile()` 三分類 | vitest node | 清除時機六種各一案例；transient／unauthorized 分類；逾時回 transient |
| 2 | `useAuthBootstrap()`：single-flight、取消、一次重試、兩層確認再登出（refresh 錯誤分類、`/profile` 確認）、`scope:'local'`、`endInvalidSession()` 收 apiClient、8 處 fetch＋`refreshUser` 5 個呼叫點收斂到 `fetchProfile`；後端 `authenticate()` 分類表、五個讀取 fail-closed、零列仍 404、`app.onError`、契約 `unknown`（Deno）＋ 46 處 401 列舉測試 | vitest jsdom `renderHook` ＋ deno test | 冷啟動恰一次；5xx 不登出且重試後成功；401 後 refreshSession 網路失敗不登出；重試仍 401 但 `/profile` 回 transient 不登出；404 先確認再登出；Auth 5xx → 503；單一讀取失敗→503 逐讀取案例；profile 零列仍 404；其餘端點 401 零變化 |
| 3 | Navbar／BottomNav／`main`／`hasBottomNav` 依三態渲染；badge 小圓點；守衛對 `degraded` 畫外框不導頁；登出 `startTransition`；（選配）MaintenanceBanner | vitest jsdom（Navbar.test 補三組；BottomNav.test 五格契約不變）＋ e2e `route_guards.feature` 補 2 條 | 有提示首繪無「登入」；無提示立刻有；admin 連結只在 `authenticated && isAdmin`；503 停在外框 |
| 4 | 文件：規格書 §5.3 擴寫「未確認≠不合格」（只寫這一處，§3 與 ui-ux §5 放指標）；§14 #8 改寫為剩餘子項；`PROFILE_FETCH_OUTCOME` 契約與 `unknown` 進 `api-contract.ts` | check-spec-drift | — |

重量：中（三段式落檔）。階段 2 的啟動流程與後端 `/profile` 屬跨層契約——**規劃與階段 2 審查用 Opus**，其餘 Sonnet。

### 1.5 驗收（可證偽）

- 自動化：上述 e2e 三條（DOM 變更零次「登入」、CLS=0、503 停在外框）＋反向案例。
- 真機（業主，LINE 內建 iOS／Android）：登入後重新整理 20 次，頁首不出現登入鈕、不位移；頁面載入完成後開飛航模式、切到別的
  App 再回來（觸發 focus 重驗）看到重試而非登出；Slow 3G 用手機系統的網路節流或在 Safari／Chrome 的 devtools 做（LINE 內沒有
  devtools），各 5 次；「`/profile` 回 503 停在外框」由 e2e 證偽。`/profile` 的 P95 延遲在 develop 預覽站量一次當逾時基線。

### 1.6 開放問題

- [x] Q1-1（**裁決 2026-10-19＝A 本機提示**） 首繪策略：**A 本機提示（推薦）** / B 一律中性直到確認（訪客頁首空白幾百毫秒）。
- [x] Q1-2（**裁決 2026-10-19＝併入 T1**） 後端 `/profile` 把暫時性錯誤翻成 401／404 的缺口（規格書 §14 #8①②）**併入 T1（推薦）** / 另開工項（T1 只能宣稱
  「首繪不閃」、不能宣稱「不再被登出」）。

## 2. 推薦：分享動線（2-1）與被推薦者註冊（2-2）（工項 R0 ✅、R1a-1 ✅、R1a-2；R1b 作廢）

### 2.1 現況（2026-10-19，#380 與 #381 合併後；本節 v2 的「入口只掛兩處、in-app 一律複製、沒有複製連結鈕、兩個匿名驗證端點」都已不是現況）

**分享動線（#381 的事實）**
- 入口是三顆共用元件（`src/components/referral/`），七個掛點：`MyQrButton`「我的 QR」（次要鈕、純連結，掛會員中心與推薦管理
  標題列右端 `MemberDashboard.tsx:191`、`ReferralManagement.tsx:44`）；`InviteFriendButton`（掛會員中心「推薦網絡」統計卡的
  `action` `MemberDashboard.tsx:241-246`——卡內真按鈕、在連結外——與推薦管理推薦碼列 `ReferralManagement.tsx:104`；已加入＝
  「邀請好友」直接呼叫 `shareReferralInvite`，未加入＝同位置「加入推薦計畫」引導鈕，簽完立刻翻成「邀請好友」）；
  `ReferralCodeWithCopy`（會員資訊卡、推薦碼列、我的 QR 頁；未加入顯示「尚未加入推薦計畫」、不露碼）。我的 QR 頁面板另有自己
  的「邀請好友」鈕與「複製邀請連結」圖示鈕＋唯讀全選的連結欄。`MyQrEntry` 已退場。
- 點擊數（讀掛點推得）：已在會員中心或推薦管理 1 下；手機從任何頁 BottomNav「會員」或「推薦」→「邀請好友」2 下；桌機從任何頁
  頭像 → 會員中心／推薦管理 → 邀請好友 3 下。真機實際點擊數是 PR #381 驗收清單的待填欄。
- 分享順位（業主 2026-10-17 二次裁決「使用者不一定透過 LINE 分享」，`src/utils/referralInvite.ts:112-127`）：(1) 只要
  `navigator.share` 存在就叫**系統分享面板**（LINE 內建瀏覽器有面板時也一樣；`text` 只帶整段訊息、不帶 `url`）；按取消
  （`AbortError`）或連點（`InvalidStateError`）就停；(2) 面板不存在或出錯 → 所在 App 能直接分享就交給它（`IN_APP_SHARE_URL`，
  目前只有 `line` → `line.me/R/share?text=`）；(3) 最後複製整段邀請訊息並提示，失敗提示指向我的 QR 頁的連結欄。任何一條路
  都不宣稱「已送出」。**代價**：LINE 內有面板時比「直開好友選擇器」多一下；桌機有面板的瀏覽器行為與原本相同。
- 閘門單一來源 `myQrTabsForUser()`（`src/utils/myQrTabPreference.ts:63-82,149-157`：`invite = joined && referralCode`），
  四個消費者共用，全 `src` 沒有第二份判斷；規格書 §7.1 已補「碼雖在首購時發出，完成『加入推薦計畫』後才可出示、複製或分享」
  （spec:278-279,288-289）；ui-ux §13 第 5 條記三顆元件的規則、第 2 條記「真按鈕放連結外、推薦格的鈕常駐」。
- 邀請訊息（`referralInvite.ts:40-42`，逐字三段）：「邀請你一起加入 Uknow：」換行「{連結}」空一行「推薦碼 {碼}」；邀請卡 PNG 只畫名、碼、連結。兩者都
  沒有法定揭露字樣（Q2-5）。
- **仍未做**：`index.html` 是 `lang="en"`、meta 只有 charset 與 viewport、沒有任何 og（連結貼到 LINE 沒有預覽圖文，推論）；
  付款成功頁沒有分享 CTA（`PaymentResult.tsx` 無）——而首購者 100% 未加入，那張卡只能是「加入推薦計畫」引導，會員中心已有，
  v3 作廢。真機驗收（LINE iOS／Android、FB、IG 內建瀏覽器）是 #381 的合併前 gate，結果待回填。
- 命名不一維持：BottomNav「推薦」、Navbar「推薦管理」、規格書 §3「推薦網絡」（頁面 h1「推薦管理」、統計卡「推薦網絡」）。

**被推薦者註冊（未變，加上 #382 的鎖定）**
- 連結只有 `${base}/register?ref=<code>` 一種（`referralInvite.ts:30-33`）；落地頁是一般登入／註冊頁（`AuthPage.tsx:36-40` 讀
  `?ref` 存 localStorage `pending_referral_code`——純字串、e2e 逐字比對、無 TTL、登出不清、再開另一條會覆蓋）。
- 四步：Email 檢核 → 密碼 → Email OTP → 完善資料（姓名、身分證、生日、手機、推薦碼、條款）→ PayUni 年費；沒有簡訊供應商或
  phone auth；手機只驗格式（`profileValidation.ts:122`）。寄信走 Custom SMTP，新掛預設 30 封／小時、正式站目前 300 封／小時
  （`docs/supabase-setup-checklist.md:202-205,326`）。
- 推薦關係在 Step 2 寫 `profiles.referred_by_*`——**#382 後改經 `register_profile` RPC**（`20261017000004`：先 `for update` 鎖
  profiles 列、`effective_registration_step = 3` 就回 `completed` → 端點 403「註冊已完成，資料變更請聯繫客服」）；
  `referral_edges`、三代獎勵、任務 +1 要到首次付款成功才產生（`apply_referral_side_effects` 3b／3c）。註冊完成後唯一的自助
  換推薦人路徑是續費選新約：`/payuni/prepare` fresh **在建單前**就改 `profiles.referred_by_*`（`index.ts:1902-1911`；無碼則套
  平台預設碼 `:1944-1952`），`referred_by` 的寫入點全檔只有這三處，付款失敗／棄單沒有還原路徑，`track_referred_by_change`
  trigger 只蓋時戳不留舊值（重審 R-09，確認）。
- **後端不檢查「已加入」**（重審 R-08，確認）：`validate_referral_code`（`20260720000001:142-160`）只看 `status='active'` 與
  推薦人未停權；發獎鏈 `apply_referral_side_effects` → `pay_referral_generations` 從不讀 `referral_program_joined`（該欄只出現
  在 schema 與提領守衛）。碼是流水號（`20260914000001`），被猜到就能讓未簽約的人收到獎勵——R0 把枚舉面降到需登入＋限流，
  不是消除。另一個洞：`/auth/register` 解析推薦人只查 `referral_codes.status='active'`（`index.ts:711-717`），不經
  `validate_referral_code`、不查 `suspended_at`——直接打 API 可綁停權推薦人（前端流程先經 GET validate 才送出，所以 UI 走不到）。
  前者歸 §14 法務題 4；後者是規格書 §4.2「推薦人未停權」已明文的缺口，與法務無關，列 §8 的小 PR（解析改經 `validate_referral_code`）。
- 法遵（原文核對無誤）：事業手冊 1-2-3「不得委託他人填寫入會資料」、4-1-2(2)「需明白表示自己為傳銷商身分」、4-1-2(5)「嚴禁
  誇大或承諾任何獎金計畫說明或收入」、4-1-3「未經本人同意不得擅自為其申請」（`businessManual.ts:29,187,193,203-205`）；
  多層次傳銷管理法第十條（參加前告知七款）、第十一條（招募時應表明）在手冊附錄一（`:404-419`）。退費口徑三份文件互相不同，
  見 §13 更正與 §14。

**推薦碼驗證端點（#380 的事實）**
- 只剩 `GET /referrals/validate/:code`（`index.ts:884-939`）：需登入（無 token 401）；以 `user.id` 為鍵的雙窗限流依序計數
  （常數 `:270-273`：5 分鐘 10 次、24 小時 50 次，固定窗口自第一次請求起算；被短窗擋下不扣日額；超過回 429 `rate_limited`）；
  RPC 失敗回 503；查無或停權同形回 200 `valid:false`；回應只有 `{ valid, referrer: { userName, listingName } }`（移除
  `referrer.userId`、頂層 `referrerUserId` 與舊欄位 `referrerName`，比 v2 寫的範圍大；不遮罩真名、不去刊登名）。
- 匿名別名 `POST /listings/verify-referral-code` 整支刪除；RPC `validate_referral_code` 收回 anon／authenticated 的 EXECUTE
  （`20261017000002`，函式本體不動）。`rate_limits` 由 pg_cron 每小時 `prune_rate_limits()`（`20261017000001`，repo 第一支
  DB 排程）。`clientIp()`／`rateLimit()` 抽成共用（`:280-297`），限流常數集中於 `:258-276`，規則「任何窗口不得長於 2 天」由
  `rate-limit.unit.test.ts` 讀兩邊原始碼把關；四條 ConstantRule（短窗分鐘與次數、日窗小時與次數）把數字釘在規格書 §4.2。
- 前端：付款頁換推薦人分 valid／invalid／unavailable 三態，unavailable 時按付款即重驗、通過後要再按一次才帶碼送單
  （同一次點擊送單會漏帶碼，主 session 變異實驗證實）；完善資料頁送出前重驗遇暫時錯誤保留已驗證推薦人，503 與網路錯誤不
  外露後端原文。
- **殘餘風險（接受，量化）**：單一帳號 5 分鐘 10 碼、每日 50 碼；多開帳號線性放大，總量受 Email OTP 寄信配額限制。不加 per-IP
  第三道窗。寄信失敗告警未做（v2 §2.3 R0 第二句），改列 §8 的小 Plan Mode 項。後續 P2 在 issue #383（同碼重驗燒額度、兩頁
  429 文案一致、註解與規格書補「依序計數只寫一半」、`clientIp`／窗口守衛／journey 離線測試補強）。

### 2.2 設計：分享（2-1）——最小版，已完成大半

- **已完成（#381）**：三顆元件、五個掛點、分享順位、閘門單一來源、推薦碼複製鈕 44px、我的 QR 頁的複製邀請連結鈕與全選欄、
  ui-ux §13 與規格書 §7.1 的規則。業主要的「會員中心一顆鈕、少點幾層、重複的設計共用同一份程式」（重審 §一-3）已成立。
- **R1a-2（剩餘，Plan Mode `fix/*`，Sonnet）**：`index.html` 靜態 og（`og:title`／`og:description`／`og:image`）＋`lang="zh-Hant"`。
  `og:description` 是平台介紹、不含獎金字樣（與 Q2-5 無關）；絕對網址用必填環境變數 `VITE_PUBLIC_APP_URL`（Pages 各環境設定，
  未設就讓建置失敗或略過 `og:image`，不輸出字面佔位字）；`og:image` 由業主提供約 1200×630 的圖放 `public/` 固定路徑；vitest 讀檔
  斷言三個 og 存在且網址是絕對網址或該佔位；真機驗收：LINE 貼連結出現預覽圖文。
- **選配（真機驗收後裁決，各是一個小判斷）**：(a) `platform === 'line'` 時跳過面板直開好友選擇器（`shareReferralInvite` 開頭
  一個判斷，若業主覺得 LINE 內多一下不值）；(b) 某內建瀏覽器 `navigator.share` 存在卻沒反應 → 窄表 `WEB_SHARE_UNRELIABLE`；
  (c) Navbar 頭像旁常駐一顆（桌機從任何頁 1 下；只對已加入者顯示，導覽列不放未加入者的引導鈕）。現在不預先為沒證據的失敗模式寫程式。
- **文案 R1a-3（已裁，§14 第 1 題）**：邀請訊息加一句「本邀請由 Uknow 傳銷商 {名} 發送」（手冊 4-1-2(2) 表明身分），訊息與邀請卡
  不出現「賺／獎金／收入」字樣（4-1-2(5)）；邀請卡加「掃描加入 Uknow・推薦碼 {碼}」說明行同批做。都是常數，一個 Plan Mode PR。
- **作廢（v2 §2.2A／B）**：面板並列三鈕（LINE 傳給好友／複製連結／更多）、Web Share 的「無連結變體」（現行刻意只帶 text）、
  邀請卡「長按儲存」、`/referrals` 頁重排、Navbar 選單「邀請好友」、付款成功頁加卡、`StatCardAction` 導 `/referrals`（做不到直接
  分享，重審 F2；#381 以 `DashboardStatCard` 的 `action` prop 把真按鈕放在連結外取代）、面板抽三件組。

### 2.3 設計：被推薦者從連結到完成（2-2）——本輪不做邀請物件

- 重審結論（業主同意）：v2 整套「邀請物件」（新表、token、`/invite/<token>` 落地頁、邀請紀錄、註冊步驟列、Step 2 唯讀徽章、
  OTP 換信箱）沒有縮短到 LINE 的點擊數，卻新增表、新路由，並動到註冊與付款相鄰路徑 → **R1b 刪除、Q2-1／2-2／2-6／2-7／
  2-8／2-9 作廢**。被推薦者看到的仍是一般註冊頁；「誰邀請我、碼有沒有帶到」由邀請訊息文字＋ Step 2 推薦人姓名即時顯示承擔。
- 簡訊通道（B）、phone-first（C）、LINE Login（D）：第二期裁決，記 GitHub issue，不入規格書 §14（Q2-3 作廢為「第二期」）。
- Q2-4 身分證延後：**不做，且已被 #382 關死**——#382 審查依授權裁決「不採 set-if-null 補填入口」（重開剛關的寫入面；付款後首次設定會撞
  `register_profile` 的 403）；規格書 §4.1 已把身分證變更定性為轉讓經營權。
- 寄信配額：活動前確認 SMTP 限流值（正式站 300 封／小時）；寄信失敗告警列 §8 的小 Plan Mode 項。
- Step 2 的「永久綁定」確認框（v2 §2.3）已由 #382 改成「付款完成後，姓名、身分證字號、生日、手機與推薦人即鎖定，變更須聯繫
  客服」（續費選新約仍可換推薦人）。

### 2.4 穩定性與架構

- 三顆元件與 `shareReferralInvite` 的測試契約：testid `invite-friend-button`／`my-qr-button`／`join-referral-button`／
  `share-referral-button`；`dashboard_smoke.feature:21-26`「從推薦格邀請（複製 fallback）」；`test_overflow_sweep.py`「推薦碼
  不得被截斷」；`check-color-usage.py` 排除 `pixelColors.ts`（墨字、灰字與 `:root` 同步，白底固定純白）。
- 與 S7：S7 prompt 重寫（另案）以三顆元件為既成事實；`MyQrEntry` 不存在了；S7 動 `MemberDashboard`／`ReferralManagement` 時
  不得複製閘門（3967f69 教訓）。與 T1：R1a-2 只動 `index.html`，零撞檔。
- e2e mock 對 Web Share 的遮蔽已改在 `Navigator.prototype` 上（#381 回填時順手做掉），不再是待辦。

### 2.5 階段與測試

| # | 工項 | 狀態／流程 | 內容 | 測試落點 | 驗證標準 |
|---|---|---|---|---|---|
| R0 | 推薦碼端點關洞 | ✅ #380（merge `ae07800`） | 見 §2.1；後續 P2 在 #383 | `referral-validate.test.ts`、`rate-limit.unit.test.ts`、`check-spec-drift` 四條 | 無 token 401；第 N+1 次 429；被短窗擋下不扣日額；回應無 id；RPC 失敗 503；別名 404；RPC 權限只給 service_role |
| R1a-1 | 入口三顆元件＋分享順位 | ✅ #381（merge `2fa1f2c`） | 見 §2.1 | 元件 vitest、`dashboard_smoke`、溢版巡檢 | 真機驗收四項（LINE iOS／Android、FB、IG）為合併前 gate，結果回填 PR |
| R1a-2 | og＋`lang` | Plan Mode `fix/*` | `index.html` | vitest 讀檔 | 三個 og 存在、image 絕對網址；真機 LINE 預覽 |
| R1a-3 | 揭露文案 | Plan Mode，等 Q2-5 | 邀請訊息、邀請卡常數 | vitest 字串斷言 | 法務句逐字 |
| 寄信告警 | SMTP 失敗告警 | Plan Mode，排 T1 後 | `system_alerts` 來源新增 | deno | — |
| 停權檢查 | `/auth/register` 解析碼改經 `validate_referral_code` | Plan Mode 小 PR，不等法務 | `index.ts:711-717` | deno | 停權推薦人的碼在寫入端也被拒 |
| R1b | 邀請物件 | **作廢** | — | — | — |

### 2.6 驗收

- 真機（#381 gate，待業主回填）：按下後必須出現系統分享面板、LINE 好友選擇器或複製提示三者之一；記實際點擊數；複製後貼上
  確認內容；「有面板但拒絕」在 LINE 內仍開得出選擇器；LINE 內建瀏覽器首屏四個主數字仍在不滑動範圍內。
- 轉換率：沒有邀請紀錄表，以 `profiles.referred_by_*` 非預設且付款完成的比率當既有 baseline；不新增表。

### 2.7 開放問題

- [x] Q2-5（**裁決 2026-10-19＝揭露句照手冊 4-1-2 寫，文件不改；R1a-3 解除**）（**擋 R1a-3**）邀請訊息、邀請卡的法定揭露句與獎金字樣：法務裁決（§14 第 1 題）；技術上是文案常數。業主 2026-10-17
  已看示意畫布（§13）。
- [x] Q2-10（**裁決 2026-10-19＝規格書 §4.1 改成引用條款六與契約十二、十三，文件不改**） 前半：年費退費口徑（§14 第 2 題，§13 已更正）。後半已裁：R0 完成。
- [x] Q2-11（**裁決 2026-10-19＝維持現況——碼可用、獎勵入帳、提領前須簽約與證件（契約第 3 條）；只補停權檢查小 PR**）（v3 新）：未簽約者的推薦碼可否被使用與發獎（§14 第 4 題）。若答「不可」→ `validate_referral_code` 與發獎鏈加
  `referral_program_joined` 判準——動金流，獨立 Opus 工項，另需處理既有「未簽約但已有下線」的存量（A2 第 12 項先盤點）。
  `/auth/register` 的停權檢查不等這題（§2.5 小 PR）。
- 作廢：Q2-1、Q2-2、Q2-6、Q2-7、Q2-8、Q2-9（隨 R1b）；Q2-3 改「第二期 issue」；Q2-4 關死（§2.3）。

## 3. 刊登照片：上傳、裁切、呈現（工項 P1a、P1b）

### 3.1 現況與根因（develop HEAD；三個 PR 只讓 `index.ts` 行號漂移，照片相關前端檔零改動）

- 鏈路：原檔 multipart → Edge Function（只驗 MIME 白名單與 5MB，`index.ts:4127-4168`，`file.arrayBuffer()` 原位元組直寫）→
  service_role 寫 public bucket（`20260805000001:17-18`，bucket 自己也有 `file_size_limit=5242880`）→ 回 URL → 前端把 URL 陣列
  寫進 `listings.photos`（`text[]`，無張數約束）。**沒有壓縮、裁切、縮圖、EXIF、HEIC 處理，沒有本機預覽**（預覽讀的是伺服器
  回的 URL），沒有進度與重試，`Promise.all` 一張失敗整批失敗（`CreateServiceProvider.tsx:202`；Edit `:217` 同構）。原圖含
  EXIF（可能含 GPS）直接公開——機制可證（無任何重新編碼），實際檔案含 GPS 需抽樣（推論）。
- 「太大不能上傳」：repo 內沒有任何使用者回報、HEIC 字樣或 commit 紀錄（重審 P-03，確認未證）。可證的機制：file input
  `accept="image/*"` 讓 HEIC 被選進來，但前後端白名單都是 jpeg／png／webp（`constants.ts:19`、Edit `:171`、`index.ts:4141`），
  HEIC 會被「只支援 JPG、PNG、WEBP 格式」擋下——是**格式**拒絕，不是 5MB。P1a 階段 0 先以真機確認抱怨的成因。
- 後端錯誤訊息前端讀不到：後端回 `{error:'字串'}`（`:4143,4146,4159`）、前端讀 `.error?.message`（Create `:195`、Edit `:210`）
  永遠落到 fallback——**bug 在前端**，`apiClient.extractApiErrorMessage`（`:133-144`）已能吃字串與巢狀兩種信封（同檔
  `/rewards/upload-id-photos` 用的是巢狀，兩個上傳端點信封本就不同）。e2e mock 只有成功路徑，這條沒有既有測試覆蓋。
- 「不能決定顯示哪一塊」：儲存原圖，各處 CSS `object-cover` 置中裁——首頁照片牆（`MobilePhotoWallCard.tsx:21`）與手機卡
  （`HomePage.tsx:1007`）1:1、桌機卡（`:1044`）16:9、刊登管理卡（`ServiceProviderManagement.tsx:175`）16:9、Create／Edit 預覽
  （`:480`／`:502`）16:9、詳情主圖（`ServiceProviderDetail.tsx:219`）16:9 `object-contain`（S6 後是 `bg-muted` 灰底留白，不是
  黑邊）、縮圖 80px 正方形（`:241`）。七種容器、兩種比例；另有兩處同形骨架（`HomePage.tsx:982`、`ServiceProviderDetail.tsx:385`）
  改比例時是成對的。
- 「第一張是封面」：程式只是 `photos[0]` 慣例，但 **Create 的 UI 標籤已向使用者宣告「必須上傳3張，第一張為封面照」**
  （`CreateServiceProvider.tsx:475`；Edit `:497` 沒有這句）；沒有重排、指定封面；沒有「大頭照」概念。詳情頁三張縮圖點擊切換
  （原生 `<button>`，Tab 可達），無滑動、無方向鍵；S6 把縮圖列由橫向捲動改成換行。
- Edit 沒有前端大小檢查、張數與格式硬編（`:110,165-166,497,628` 四處寫死 3，不走 `MAX_PHOTO_COUNT`；Create 也有三處）；
  移除照片與刪除刊登都不清 Storage（刪刊登是前端 supabase-js 直刪 `ServiceProviderManagement.tsx:50-54`；`index.ts` 無任何
  `.remove(`）——條款十之一承諾「撤除後三十日內完成下架，技術快取殘留不在此限」（`termsOfService.ts:48-49`）→ 清理是合規項；
  `ImageWithFallback` 一張失敗後切縮圖仍 fallback（無 `useEffect` 隨 src 重置；以 `{...rest}` 轉發 img 屬性）；全站 10 個
  `<img>` 無 `loading`／寬高。
- 授權：條款十之一已授權「為適應版面所必要之技術性編輯（含裁切、壓縮、格式轉換）」。`check-spec-drift.py:124-135` 以 regex 釘
  §11「最多 N 張／單張 ≤N MB」與 `constants.ts:17-19`。

### 3.2 設計（v3：核心保留，重審 P-02 的矛盾修掉，其餘改選配）

**A. 核心（P1a）：選圖 → 自動裁 → 壓縮 → 逐張上傳**
1. 選圖 `accept="image/*"`；解碼 `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth/Height })`（限邊解碼）；
   失敗訊息分「記憶體不足」與「格式無法讀取」：「這張照片的格式無法讀取，請換一張，或截圖後再試」（iOS 另附「相機設定→格式→
   最相容」）。**階段 0**：真機確認 iPhone 預設 HEIC 在 Safari／LINE 內建瀏覽器選檔時會不會轉 JPEG、會被哪句擋下（P-03）。
2. **每張都進 1:1 裁切畫面確認取景框後才上傳**（Q3-3 裁決 2026-10-19；取景框預設置中，多數人按「完成」即可）。裁切用
   `react-easy-crop` 在 lazy chunk 內動態載入（手勢、縮放滑桿、拖曳由它提供，不自刻監聽；§0 原則 3 的「不引入框架」指狀態庫與
   UI 框架，一個裁切元件可接受）；矩形換算仍用自己的 `imageGeometry.ts`。對話框：重設、完成／取消（44px）、方向鍵微調、`useBodyScrollLock`、Android 返回鍵
   關疊層、`dvh`；chunk 載入中與失敗兩態（失敗則維持自動裁結果，不擋上傳）。
3. 壓縮：輸出 JPEG，最長邊 1600px、品質 0.82、目標 < 600 KB（可調常數，只在原檔超過上限時顯示「已自動縮小」）。**重新編碼
   即剝除 EXIF，這是需求不是副作用——所以編碼失敗不退回原檔上傳**（v2 §11 風險表寫「壓縮失敗退回原檔」與此矛盾，重審 P-02；
   v3 改成：解碼成功但編碼失敗 → 該張標「無法處理，請換一張」、不上傳，其餘照常）。5MB 上限留在後端與 bucket 當安全網。
4. 上傳：每張獨立狀態（準備中／上傳中／失敗-可重試／無法處理-只能移除／完成）＋常駐 live region；每格鈕命名「重試第 N 張／
   移除第 N 張／調整第 N 張範圍」，格列表用 `ul/li`；選完立刻 objectURL 預覽；上傳中送出鈕
   `aria-disabled`＋原因；Create `:195`／Edit `:210` 改用 `extractApiErrorMessage`。
5. 張數：**維持恰好 3 張**（Q3-1 裁決 2026-10-19）；規則不動，只把 Create／Edit 七處硬編 3 改成 `MAX_PHOTO_COUNT`。
- 元件：`PhotoPicker`（`src/components/listing/`，先例 `CategorySelectField`；Create／Edit 共用，只回報已確認 URL）＋
  `useListingPhotos`（`src/hooks/`）；`imageGeometry.ts`（純數學）＋`imagePipeline.ts`（注入 ImageIO）放 `src/utils/`；
  `react-easy-crop` 只在 Create／Edit 的 lazy chunk 內動態載入（bundle 預算 `scripts/check-bundle-budget.mjs` 只在 CI 跑，PR 前手動 `node` 量一次；
  基準 955／296 kB 是 2026-07 值）。

**B. 選配（P1a 不做也能驗收；各自是獨立小 PR）**
- 封面：每張「設為封面」＋ 375px 的磚下動作列（≤3 張不做拖曳）。不做時標籤寫「第一張為封面，要換請移除重加」。
- 草稿持久化 `listingDraft.ts`（sessionStorage，F5 不丟）。
- 既有刊登的舊照片「調整範圍」（抓既有 URL→裁切→上傳新檔→更新成功後刪舊檔）；不做時舊圖以 1:1 cover 置中並在 Edit 說明。
- 每使用者物件數上限與排程 janitor。

**C. 後端與 Storage 清理（P1a 必做的那一半）**
- `DELETE /listings/photos`：只收 `^<uid>/\d+_[a-z0-9]+\.(jpg|png|webp)$` 的路徑、單次上限；**先存 listings 成功再 diff 刪
  Storage**，仍被 `listings.photos` 引用者拒刪；刪刊登改走 Edge（目前是前端直刪）同一條清理。上傳端點不變（可選 magic-byte）。

**D. 顯示容器統一 1:1（P1b，S6 已合併，Plan Mode）**
- 七個容器＋兩處骨架全改 `aspect-square`（重審 P-01／X3：`e2e/test_public_skeleton_layout.py:40-80` 量的是骨架與內容同形，
  大圖改 1:1 而骨架 `ServiceProviderDetail.tsx:385` 不改就紅；桌機卡 `HomePage.tsx:1044` 與 `DesktopCardSkeleton:982` 同理）。
- 縮圖列**桌機與手機都保留、維持換行**：v2「手機隱藏」會直接打紅 `e2e/test_public_touch_targets.py:124-149`（375px 下
  `expect(thumb).to_be_visible()` 與焦點環不被裁切）；放進 scroll-snap 溢出容器也會打紅 clipping 斷言。
- 張數維持 3，詳情骨架三格縮圖列與內容同形的前提不變（Q3-1 裁決後 UX-08 不成立）。
- **手機主圖可左右滑動切圖納入 P1b**（Q3-5 裁決 2026-10-19）：主圖用 CSS `scroll-snap` 橫向容器，縮圖列**留在容器外**、維持換行
  （`e2e/test_public_touch_targets.py:124-149` 的縮圖可見與焦點環不裁斷言才不會紅），滑動與點縮圖同步 `currentImageIndex`；
  鍵盤切圖做在縮圖群（roving tabindex），「第 n 張，共 N 張」做成可見字兼 live region；`prefers-reduced-motion` 關平滑捲動。
  lightbox 仍選配。`ImageWithFallback` 隨 src 重置（改元件）＋呼叫端傳
  `loading="lazy"`／`decoding="async"`／寬高。alt 維持 `{名稱} - 圖片 N`。

### 3.3 穩定性與架構

- 資料欄位不變；`public_listings` 12 欄契約不動（`listings.test.ts:190-224`、`rls-policies.test.ts:254-282`）；5MB 的四份副本
  （`constants.ts:17`、`index.ts:4145`、Edit 區域白名單、bucket）由子規劃決定共用位置，至少 Edit 的那份要刪。
- e2e：`create_service_provider_page.py:15` 的 22 byte 假 JPEG 會被新流程解碼失敗 → 改用真的小 JPEG fixture（e2e 與 journey
  共用：`f40_listing_steps.py`、`f60_time_scenarios_steps.py` 同一個 page object，journey 會打進真 Storage）；「框的＝傳的」
  用 2×2 色塊 fixture 在真瀏覽器驗輸出主色並斷言無 EXIF（APP1）；`listing_management.feature:74-81`「上傳中輸入不被倒回」
  仍要綠；mock 補上傳失敗路徑。
- 與 S7：`ServiceProviderManagement` 是 S7 檔（construction-plan §3 S7 範圍），P1a 只改它的刪除清理與容器比例一行，先合併者定。
- 真機矩陣（業主）：iPhone Safari／LINE、Android Chrome／LINE；fixture：HEIC、48MP、EXIF 方向 6、透明 PNG（canvas 轉 JPEG
  預設黑底→補白底）、極大檔。

### 3.4 階段與測試

| # | 工項 | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 0 | P1a | 真機確認 HEIC 成因（P-03）；查現有刊登張數分佈 | — | 成因寫進 PR 描述 |
| 1 | P1a | `imageGeometry.ts`＋`imagePipeline.ts`（解碼限邊、方向、裁切矩形、縮放、JPEG、大小估算、錯誤分類；編碼失敗不退回原檔） | vitest node＋jsdom（ImageIO 替身） | 矩形換算正確；OOM 與格式錯誤分流；編碼失敗該張不上傳 |
| 2 | P1a | `PhotoPicker`＋`useListingPhotos`：自動置中裁、選用調整、狀態機、錯誤信封 | vitest jsdom＋e2e（真 JPEG、2×2 色塊） | 一張失敗其餘保留；輸出無 EXIF；後端錯誤訊息顯示出來 |
| 3 | P1a | 後端 `DELETE /listings/photos`、引用檢查、刪刊登改走 Edge、Edit 大小檢查、張數常數化 | deno test | 非法路徑 403；仍引用者拒刪；仍需 3 張 |
| 4 | P1a | 文件：規格書 §11（寫行為不寫數字）、ui-ux §7 補「照片裁切」 | check-spec-drift | — |
| 5 | P1b（Plan Mode） | 七容器＋兩骨架 1:1、主圖 scroll-snap 滑動、縮圖群鍵盤切換、`ImageWithFallback`、img 屬性；`service_provider_detail.feature` 補滑動與鍵盤切換 | vitest＋e2e 溢版巡檢＋兩支既有探針 | 骨架探針差 ≤2px 仍綠；觸控探針縮圖可見且焦點環不裁；滑一格索引同步 |
| 選配 | P1a-x | 封面、草稿、舊圖重裁、配額與 janitor、輪播／lightbox | 各自 | — |

重量：中（P1a 三段式；P1b Plan Mode）。模型 Sonnet。

### 3.5 開放問題

- [x] Q3-1（**裁決 2026-10-19＝維持恰好 3 張**） 張數：**改「最多 3 張（至少 1 張）」（推薦）** / 維持恰好 3。
- [x] Q3-2（**裁決 2026-10-19＝全部 1:1**） 比例：**全部 1:1、七容器統一（推薦）** / 封面 1:1＋其餘 4:5。
- [x] Q3-3（**裁決 2026-10-19＝每張強制進裁切**） 裁切流程：**自動置中裁＋選用調整（推薦）** / 每張強制進裁切。
- [ ] Q3-4 「大頭照」獨立於刊登封面：**推薦本輪不做**，封面即大頭照。
- [x] Q3-5（**裁決 2026-10-19＝納入 P1b**）（v3 新）詳情頁手機滑動切圖是否納入 P1b：**推薦列選配**（縮圖群鍵盤與點擊已可達標）。

## 4. 管理者核對視圖（工項 A1a 核對面板、A2 對帳；稽核軌跡移到 §6 的 A1b）

### 4.1 現況與根因（develop HEAD；`index.ts` 現為 4,292 行）

- 後台沒有「某位會員的獎勵明細、任務進度、推薦樹節點、付款紀錄」讀取：`/admin/*` 共 16 支（`index.ts:1061-1771`）＋
  `/admin-setup/*` 兩支，沒有 rewards／tasks／network／payments 類；`/rewards*`、`/tasks*`、`/referrals/network/*` 全以本人
  取數。唯一的例外是 `GET /referrals/debug/:userId`（`:4172-4223`，admin 可讀任一會員的名、碼、推薦碼來源、註冊步驟、會籍、
  一代人數、碼狀態）。admin 詳情面板只有三個點數總額、最近 10 筆提領、推薦人姓名與直推人數（都取自
  `profiles.referred_by_user_id`，不是 `referral_edges`）、到期日、證件狀態、遮罩後的身分證與帳號。**沒有頁面列出
  `payment_orders`／`subscriptions`**；付款異常只在系統告警。
- `loadNetwork(client, viewerId)`（`index.ts:3539`）本來就以觀看者為參數；寫死「自己」的是 `buildFlatNode` 的遮罩
  （`:3632`）、4 個 handler 的 `user.id`（`:3727,3768,3805,3849`）加 overview 的 `myReferralCode` 與 children 的 `isSelf`
  （`:3728,3770`）；SQL `referral_tree()` 只回 5 欄，產不出 `NetworkNode`。「往上的推薦人鏈」兩邊都沒有現成程式。
  `RewardHistory` 自抓 `/rewards/history`（`RewardHistory.tsx:111-113`）、非 props 注入。
- **推薦關係有兩套來源並存**（重審 S4-04，部分確認）：用 `profiles.referred_by_user_id` 的——gen1 發獎、任務與推薦王歸屬、
  admin 詳情的推薦人與直推數、前端 `isAutoReferral`；用 `referral_edges` 的——gen2／gen3 發獎、推薦網絡四端點、`referral_tree()`、
  `/referrals/debug`。同步點：`apply_referral_side_effects` 3b 在每次 completed 付款時把 edge 覆寫成當下 profile 值；edge 也
  沒有歷史。所以「註冊未付款者」與「棄單者」必然 profile 有值、edge 不存在，同一個 admin 畫面的「直推人數」與「推薦網絡一代數」
  在 profile≠edge 時會不一致。
- 帳本正確性靠函式內 `NOT EXISTS`（`pay_referral_generations` 三處，鍵 `(referee, generation, subscription_id, source_claim_id)`）
  ＋ `apply_referral_side_effects` 對 profiles 的列鎖；**沒有 unique constraint、沒有事後的重複發獎偵測**（重審 S4-06，確認：
  migrations 內 `having count(*) > 1` 只有 payment_orders 與 subscriptions）。合法特例：fresh 換線（邊原地覆寫、歷史獎勵留舊上線）、
  fresh 清空當月桶但 credit 保留、預設推薦人、補繳多筆、任務免費續約（`source_claim_id`）、prepare fresh 在付款前就改 profile。
- `repair_orphaned_payments` 的候選查詢（`20260807000001:80-132`）**是函式本體的迴圈、同迴圈內直接發獎**（`:135`），候選分支 (a)
  是「已付款卻沒有 active 推薦碼」不是缺獎勵——「抽成共用 dry-run」等於 `create or replace` 發獎函式（重審 S4-05，確認）。
- **沒有 admin 操作紀錄表**：停權（無 actor、無理由）、授予管理員、公告刪除、告警處理（只寫 `resolved_at`）、首位管理員自授都不留痕；
  `withdrawal_events`（同交易、含 `idempotent`）是唯一的 admin 事件表；`member_verify_logs` 記的是 QR 核身（`admin_id` 已改名
  `verifier_id`，`20260902000001`），不是 admin 操作；**證件審核沒有事件表**（`admin_review_id` 只 update profiles，重審 S4-01）。
  8 個寫入端點 5 個沒有理由欄（提領狀態與證件退回的理由由 SQL 必填）。`adjustment_manual` 分類存在但無端點；
  `reward_balances.total_earned` 只算正數且排除提領，手動調整若直接 insert 會灌進累計收益。
- **`/admin/withdrawals` 回未遮罩的身分證、銀行帳號與證件簽名網址**（`index.ts:1167,1179,1217,1222,1230-1231`，重審 S4-02，
  確認）——會員核對面板的提領區不能直接複用它。
- `payment_orders.status` 集合是 pending／completed／failed／cancelled／expired；`/internal/reconcile-pending-payments`
  （`:2606`，每小時）會把超過 PayUni 3 天期限再加 1 天緩衝仍查無結果的 pending 單標成 expired——pending 不會無限停留。
- 後台既有約束：資料管理類走 `AdminConsole` 的四分頁（規格書 §13 `:744`、ui-ux §3 `:58-67`「加第五個分頁會壞版面，新功能先找
  次分頁」）；`AdminConsole` 卸載即 dispose 快取；`repoHygiene.test.ts:251-262` 禁 admin 殼層用 URL state；S4 的詳情 Sheet 有
  journey f70 與 e2e `sheet-header` 契約；後台手機與桌機並重。

### 4.2 設計（v3 拆成兩個純讀工項；稽核軌跡 §6）

**(1) 會員層核對面板（A1a；在既有 Sheet 內，不升獨立路由，Q4-5）**
- Sheet 維持（手機全螢幕）、內加「完整核對」展開成 `MemberManagement` 內的子視圖（state 驅動，store／busy／鎖分頁仍在
  `AdminConsole`）；手機首屏＝身分卡＋4 項關鍵事實（會籍狀態與到期、最近一筆付款、點數餘額是否與流水帳一致、處理中提領），
  其餘折疊；**逐區載入、各區三態、失敗不連坐**（ui-ux §13 第 4 條：單一區塊失敗只在該區塊顯示中性錯誤字）。

| 分區 | 內容 | 資料來源（新增，只讀） |
|---|---|---|
| 付款與會籍 | `payment_orders`（明確投影，不含 `payuni_response`）＋`subscriptions` 時間軸；pending 標黃、expired 標灰 | `GET /admin/members/:id/payments` |
| 獎勵明細 | `RewardHistory` 注入化後複用，多一欄「對應付款」；頁尾「流水帳提領列 vs withdrawals」是否一致 | `GET /admin/members/:id/rewards` |
| 推薦關係 | **兩套來源並列**：profile 推薦人（`referred_by_*`、`is_default`、`changed_at`）與 edge 推薦人，不一致時標示；一代／二代／三代推薦人（往上，新程式，以 edge 為準）；推薦網絡（`ReferralTreeView` 注入 admin 資料源，**完整姓名**＋常駐說明），含付款狀態與「這筆給一代推薦人的獎勵有沒有發」 | `GET /admin/members/:id/network/{overview,children,search}`：4 個 handler 本體抽成 `(client, viewerId, { mask })` |
| 任務 | 每月桶人數與名單 vs 該月 credit；只驗單向、排除當月有 `ledger_reset` 者 | `GET /admin/members/:id/tasks` |
| 提領 | 全部＋事件歷史——**新端點、遮罩投影**（不複用 `/admin/withdrawals`，S4-02） | `GET /admin/members/:id/withdrawals` |
| 操作紀錄 | 等 A1b 的 audit 表上線後才加這一區（面板先留位） | — |

- **後端語意**：每個讀端點的任何查詢錯誤回 5xx（不得吞成空陣列、0 或 null；現行會員端 `/rewards/history` 等 handler 是吞錯的，
  「與會員端同形」指回應形狀，錯誤處理不照抄），deno 以注入錯誤斷言；前端該區顯示錯誤態而非空態。
- 取數函式獨立檔＋`MEMBER_AUDIT_API` 分組由 `AdminDashboard` 注入；`useAdminList` 配 `slot: null`。新端點約 10 支進
  4,292 行的 `index.ts`：**先抽 `api/deps.ts`（requireAuth／isAdminUser／sb）再拆模組，屬結構調整，A1a 規劃用 Opus**。

**(2) 全站對帳報表（A2；純讀，放「告警」次分頁，Q4-5）**
- 每項檢查回 `{ status: ok | exceptions | error | not_run, count, ranAt }`，畫面四態並列（「查詢出錯」絕不畫成 0 例外；
  「0 例外」寫「上次執行 {時間}」用 `DataAgeNote`）；各自請求與進度；`statement_timeout`＋
  advisory lock 防連點；例外列全序分頁；正規化成同一列形，手機卡片與桌機表格共用。
- 第一批十一項（都從規格書規則直譯，含**合法特例排除**；v3 修正第 2、7、8 項，新增第 11 項）：
  1. completed 訂單無對應 subscription（舊列以 `payment_transaction_id` 後備）。
  2. 付款（首購、補繳、續約、任務續約 claim）的三代獎勵缺筆或多筆——**另寫唯讀查詢，複製 `repair_orphaned_payments` 的候選
     條件、剔除候選分支 (a)，不改發獎函式**（S4-05）。**時點閘門不照抄** `referred_by_changed_at ≤ completed_at`：
     `completed_at` 是 PayUni 的付款時點（`payuni_paid_at`，早於處理交易），而無碼首購在同一交易由 3a-bis 回寫預設推薦人、
     trigger 以 `now()` 蓋 `changed_at`，所以**預設推薦人首購恆 `changed_at > completed_at`**，repair 閘門對這群人永遠為假
     （`20260807000001:20-22` 檔頭「changed_at == completed_at 放行」與程式不符，既有 bug，見 §6.1 (d′)）。對帳用同交易寫入的
     `subscriptions.created_at` 當事件時點（與 trigger 的 `now()` 同值），或對 `referred_by_is_default=true` 且 `changed_at` 落在
     該訂閱交易內者放行。合法特例矩陣獨立於 repair 寫期望值（含「預設推薦人首購、3c 中斷」要報出），不拿 repair 當標準答案。
     二三代祖先後來換線者標「不可判定」。
  3. `reward_transactions` 型別與外鍵不一致（`type='withdrawal'` 而 `withdrawal_id` 為 null；`referral_reward` 而 subscription
     與 claim 皆 null）。
  4. 月份桶 vs credit 張數（單向不等式；排除當月 `ledger_reset`；月份鍵 `Asia/Taipei`）。
  5. 跨來源餘額：Σ ledger 提領列 vs `withdrawals(amount+fee)`；退款 adjustment vs rejected 提領。
  6. 提領狀態與最後事件不一致、`awaiting_collection` 超過 N 天（排除事件表建立前的舊提領）。
  7. **pending 單超過 PayUni 期限＋1 天＋至少 2 個排程週期仍是 pending**（門檻進設定表），輸出分兩類：「`payuni_response` 有
     SUCCESS 卻未開通」（金額不符等人工案）與「無 SUCCESS 且逾期未被 reconcile 標 expired」（排程失效）；v2 的「pending 超過
     N 小時」在排程正常時命中集合為空。
  8. **推薦人兩套來源不一致**（S4-03 口徑修正）：母體是「有 completed 訂單者」；`left join` 後 `profiles.referred_by_user_id
     IS DISTINCT FROM referral_edges.referrer_user_id`（無 edge 也算不一致）；排除「最近一筆 completed 付款的訂閱 `created_at`
     之後才換線的在途者」（同第 2 項的時點，不用 `completed_at`；pending 會被 reconcile 標 expired，不能當排除條件）。付款前的
     profile≠edge 是常態，不報。
  9. 未處理告警 > N 天。
  10. `national_id` 正規化後重複（給 A1b 唯一索引清零用）。
  11. **重複發獎**（S4-06）：`reward_transactions` 限 `type='referral_reward' and generation is not null`，依
     `(referee, generation, subscription_id, source_claim_id)` 計數 > 1（不加 type 過濾會把提領、調整等 referee 為 NULL 的列併成
     一組誤報）。
  12. **盤點（不算例外）**：發給 `referral_program_joined=false` 推薦人的 `referral_reward` 列——供 §14 第 4 題的存量處理。
  門檻 N 全部進設定表。驗收：合法特例矩陣各一例**不得報**；對正式環境快照跑全部檢查，例外集須全數可解釋。排程寫告警列第二期。
- **合理性訊號**（Q4-6 裁決：第一批只做一致性檢查）第二批再議。**手動調整**（Q4-2 裁決：納入，排在稽核軌跡之後）：
  `admin_adjust_reward(p_admin, p_user, p_amount, p_reason, p_idem_key)`——`for update` profiles、`idem_key` partial unique、audit
  同交易、金額上限、`available<0` 明示；規格書 §8.4／8.5 寫明 `total_earned` 排除 adjustment；扣點紅實心確認、加點墨黑；會員端
  獎勵明細看得到分類與理由。排 A1b-2 之後當 A2 第二段。

### 4.3 穩定性與架構

- 新讀取全是 security definer＋revoke 的 SQL 函式或 Edge 查詢，不改發獎、換線、提領函式；`ADMIN_MUTATION_GROUPS` 不動
  （純讀）；核對、對帳一律 `slot: null`。
- 與 S7：`ReferralTreeView`（已是注入式）、`MemberDetailSheet`、`RewardHistory` 是 S7 也會碰的檔；三個 PR 都沒動它們。A1a 的
  面板階段排在 S7 合併後，或先合併者定、後者 rebase。會員端行為由 `network-endpoints.test.ts` 釘住再參數化。
- A1 建在尚未人工驗收的 S3／S4／S5 之上（驗收站 2、3 延到 S7 後）：風險記在 §11。

### 4.4 階段與測試

| # | 工項 | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | A1a | `api/deps.ts`／`api/mask.ts`；`loadNetwork` 的 mask 參數化（會員端零變）＋往上推薦人鏈＋`RewardHistory` 注入化 | deno（既有測試全綠）＋vitest | — |
| 2 | A1a | 會員層讀取端點（payments 投影、rewards、network×3、tasks、withdrawals 遮罩投影）＋契約 | deno test | 非 admin 403；遮罩；回應形狀與會員端同形；不含 `payuni_response` 與簽名網址；注入單一查詢錯誤→5xx、不回空 |
| 3 | A1a | Sheet 內子視圖五區（逐區三態）＋兩套推薦人來源並列 | vitest jsdom＋e2e admin 2 條 | 手機首屏四事實；失敗不連坐；profile≠edge 有標示 |
| 4 | A2 | 對帳函式 11 支＋盤點 1 支（唯讀、排除條件、門檻設定）＋`/admin/reconcile`＋告警次分頁 UI 四態 | sql＋deno（每支「人造例外」＋「合法特例不得報」各一；第 2 項另加「預設推薦人首購、3c 中斷」要報出） | 無誤報矩陣通過 |
| 5 | — | 文件：規格書 §13 新段「核對與對帳」、用語；ui-ux §3 次分頁例 | check-spec-drift | — |

重量：A1a 中偏重、A2 中。**A1a 規劃與階段 1 用 Opus**（`index.ts` 結構調整、推薦網絡重構）；A2 階段 4 用 Opus；其餘 Sonnet。

### 4.5 開放問題

- [x] Q4-1 （**裁決 2026-10-19＝所有 admin 寫入**）稽核涵蓋所有 admin 寫入（**推薦**）或只金流類；是否也稽核敏感資料「讀取」——移到 §6（A1b）。
- [x] Q4-2（**裁決 2026-10-19＝納入，排稽核軌跡之後**） 手動調整：**推薦本輪不納入**；納入則附上限、雙人覆核、會員端可見理由。
- [x] Q4-3（**裁決 2026-10-19＝不遮罩，常駐說明**） admin 看推薦網絡不遮罩二三代姓名：**推薦不遮罩**（常駐說明）——A1a 推薦關係區的前提，開工前裁。
- [ ] Q4-4 對帳排程寫告警：**第二期**。
- [x] Q4-5（**裁決 2026-10-19＝Sheet 內子視圖＋告警次分頁**） 面板在 Sheet 內子視圖（**推薦**）/ 獨立路由；對帳放告警次分頁（**推薦**）/ 第五分頁。
- [x] Q4-6（**裁決 2026-10-19＝先只做一致性檢查**） 「合理」是否含多帳號／成鏈訊號；「完整推薦樹」深度；「定期」是否要核對留存。
- [x] Q4-7、Q4-8（audit（**裁決 2026-10-19＝Q4-7 全部 fail-closed、Q4-8 只存遮罩**） 失敗政策、敏感欄位 before／after）：移到 §6（A1b）。
- [x] Q4-9（**裁決 2026-10-19＝面板兩套並列、對帳以 edge 為準；長期只做讀端收斂（後台詳情改讀 edge），不動發獎——先用對帳第 8 項量不一致筆數再評估**）（v3 新）推薦關係以哪套來源為準：**面板兩套並列、對帳以 edge 為準（推薦）** / 改程式統一來源（動發獎，不在本輪）。

## 5. 定位：依距離排序（工項 L1；v3 改成「先做中心點排序」）

### 5.1 現況與根因（develop HEAD；三個 PR 未動本節任何前端檔）

- 「依距離排序」全在前端：首頁掛載就要定位（無說明、無按鈕，`HomePage.tsx:142-150`），用 **22 個縣市中心點查表**算距離
  （`:61-83`，只看 `city`；Haversine `:46-58` 模組私有、無單元測試），被拒／逾時靜默（`:147` 只 `setUserCoords(null)`）；
  畫面無距離數字、無排序說明；e2e 只有 `home_listings.feature:57-69` 兩條情境（Playwright `set_geolocation`，台北市／高雄市）。
- **刊登沒有任何座標欄位**、沒有端點接收座標、沒有「最後位置」欄位；DB extensions 現為 `pgcrypto`＋`pg_cron`（後者由 #380
  新增，repo 第一支 DB 排程）。**repo 內沒有任何區級座標**：`TAIWAN_REGIONS`（`constants.ts:115-494`）是 22 縣市／368 區的
  名稱表，座標只有首頁那 22 個縣市中心點。
- 首頁一次 `select('*')` 全抓、無分頁；篩選是多縣市逐區（`districtSelection.ts:117`）、性別多選、關鍵字三欄（`listingSearch.ts:28`）、
  自訂類別，全在前端（純函式有測試）。地區篩選 UI：桌面 `DesktopFilterPopover`「服務地區」、手機底部面板「服務地區」區段，共用
  `LocationFilterChips`（`:900-957`：縣市 chip → 展開該市全部區 chip，多選）；首頁沒有任何排序控制或「我的位置」輸入。
- 公開面：`public_listings` 12 欄由兩支測試釘死（`listings.test.ts:190-224`、`rls-policies.test.ts:254-282`）；**原表 `listings`
  對 anon 開放 SELECT**（PUBLIC policy `20260620000004:30-31`＋`grant select … to anon` `20260914000002:35`；列集同 view、欄位
  全開）——座標欄不能加在 `listings`。
- `districts` 預設 `['全區', …全部區]`、可多選——「第一個勾選的區」是系統性偏差。條款十二沒有位置資料條目（蒐集項目只有姓名、
  身分證、生日、電話、Email；保存「終止本服務後一年」）；LINE 內建瀏覽器的 geolocation 行為 repo 無紀錄。
- **會籍失效不是事件**（重審 L-01，確認）：`has_active_subscription` 以 `now() <= end_date` 即時判定，`subscriptions` 無 status
  欄、無到期 trigger、無 cron；刪刊登是前端直刪（FK cascade 可掛）；付費會員沒有自助「終止服務」路徑（`cancel-signup` 限未付款）。
  v2 §5.2B「會籍失效時位置列一併刪除」沒有任何機制可掛。
- **級距會讓跨縣市排序退化**（重審 L-03，確認）：以現行 22 中心點算，高雄訪客對其餘 21 市全落在 20+ km（屏東 26.7、台南 42.1、
  台東 91.2），v2 的級距設計會把三者併成同一桶改依 `created_at`，比今天的連續排序退化；22 中心點兩兩 <20 km 的只有 4 對。
- hosted 拋棄式分支 anon／authenticated 的 table GRANT 為空（`supabase/README.md:192-194`）：新表若只寫 policy 不寫 GRANT，
  本人 SELECT 也是 42501（重審 L-04，確認）。e2e `supabase_rest_mock.py` 沒有 `/rpc/` route，只攔 `/public_listings**`。

### 5.2 設計（v3）

**L1-1：訪客 GPS 吸附到區、刊登依服務區中心點排序——不儲存位置、不新表、不改條款（Q5-1／Q5-4／Q5-6 裁決 2026-10-19）**
- 首頁載入就要定位（配合「預設離我最近」）；結果列上方整寬分段切換「最新｜離我最近」（沿用 `HomeViewToggle` 的 `role=group`
  ＋`aria-pressed`＋`bg-sel`；觸控 44px、滑鼠 36px；載入中佔位同高、不可按；桌機同位置）。狀態行固定佔一列高度：定位中
  「正在取得你的位置…」、成功「依你的位置排序（大安區）・改用地區」、被拒／逾時／無權限「選擇你所在的地區」，三態不位移；
  切換排序時結果列 `aria-busy`。現行的靜默定位（`HomePage.tsx:142-150`）改成有狀態行與出口。
- **座標只在前端用完即丟**：取得 GPS 後立刻吸附到最近的區中心點（`regionCentroids`），之後排序與顯示只用「所在區」；不送後端、
  不寫任何 storage（sessionStorage 只記所選或吸附到的**區名**，返回詳情頁後還原）。條款十二沒有位置資料類別、也不能加，所以
  任何儲存座標的設計都排除（服務據點作廢，見下）。
- 被拒、逾時、LINE 內建瀏覽器沒權限 → 「選擇你所在的地區」（縣市 → 區，單選；沿用 `LocationFilterChips` 的 chip 樣式，與
  「服務地區」篩選分開語意）；都沒有就「最新」。預設排序：有所在區（GPS 或手選）就「離我最近」，否則「最新」（Q5-4）。
- 距離來源，**單一規則、純函式案例表進 vitest**：(1) 刊登 `districts` 含訪客所在區，或含「全區」且同縣市 → 距離 0、顯示
  「同區」、排第一組（全區刊登本來就服務該區，不能算到縣市中心點去）；(2) 否則取刊登各區中心點到訪客所在區中心點的**最小**
  距離；(3) 他縣市且含「全區」→ 該縣市中心點；(4) 鍵不在中心點表內的舊資料 → 縣市中心點。案例表至少含：全區／多區／單區／
  跨縣市／空 `districts`。中心點資料：368 區＋22 縣市座標做成 `src/utils/regionCentroids.ts`（動態 import，不進首屏 bundle；PR 前
  手動量一次 bundle；**資料來源＝政府開放資料**（內政部鄉鎮市區界線圖的幾何中心或各區公所座標，政府資料開放授權），PR 寫明
  來源與授權；repo 目前沒有這份資料，不能憑印象造），vitest 直接 import 與 `TAIWAN_REGIONS` 對鍵集合（368 區一個不缺、無多餘）。
- 顯示：「同區」／「約 N 公里（區中心點間）」整數／<1 km 寫「1 公里內」——距離是行政區中心點之間的距離，文案明說，不假裝是
  到對方的距離；版位：照片牆磚右上角膠囊、詳細卡保留「城市 區」行＋膠囊。**不用級距桶排序**（L-03），排序鍵
  `(distance, created_at desc, id)` 全序。**隱私面**：訪客座標離開瀏覽器前已降為區名；刊登端只有公開的行政區。
- 不做：位置儲存、新表、RPC、後端改動、條款變動。既有刊登零回填（每筆刊登本來就有 `city`／`districts`）。
- 觀察（上線後）：repo 沒有任何分析埋點，也不新增（埋點就是新的資料類別）；由業主定性觀察。

**作廢（v2 §5.2A／B 的「服務據點」與 `listing_locations`）**：刊登者設 GPS 據點、新表、RPC、限流、防三角定位、條款新增位置
資料條目——條款已定案不可改，沒有位置資料的告知條目就不能儲存位置，整段不再列為第三步。v2 細節留在
`git show 8f0ebcf:docs/plans/platform-growth-and-trust/plan.md` §5.2 供日後條款重新定案時參考。Q5-2 的 1 km 網格裁決隨之無對象。

### 5.3 穩定性與架構

- `listings`／`public_listings` 零變更；無 migration；無後端改動——L1-1 是純前端 Plan Mode PR（`fix/*`），不需三段式。
- e2e：`home_listings.feature:57-69` 兩條 `set_geolocation` 情境保留並改斷言「吸附到區、同區在前」；補「拒絕定位→選地區→最近
  在前」與「切換排序時 `aria-busy`」；溢版巡檢加排序列與三態狀態行。vitest：`regionCentroids` 鍵集合、吸附函式、距離排序純函式
  （抽出 `HomePage.tsx:46-58` 的 Haversine 並測）。真機：LINE 內建瀏覽器 iOS／Android 的定位權限行為（repo 無紀錄）。
- 與 S6：已合併。與 T1：首頁只有 `hasBottomNav` 一行屬 T1，L1-1 不碰。與 P1b：都動 `HomePage.tsx` 的結果列區塊，先合併者定。

### 5.4 階段與測試

| # | 工項 | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | L1-1 | `regionCentroids.ts`（含來源註明）＋ `listingDistance.ts`（Haversine、刊登中心點解析、全序排序） | vitest node | 368 區鍵一致；案例表五類全過（全區同縣市＝同區）；全序穩定 |
| 2 | L1-1 | 定位三態狀態行、GPS 吸附到區、拒絕→選地區（單選縣市→區）、sessionStorage 記區名、距離顯示 | vitest jsdom＋e2e 三條＋溢版巡檢 | 座標不出前端；沒有所在區不排距離；有就整數公里與同區 |
| 3 | L1-1 | 文件：ui-ux §7 定位段改寫（有狀態行與出口、座標不離開前端）、規格書 §12.3 補一句「依區中心點排序」 | check-spec-drift | — |

重量：輕（Plan Mode，Sonnet）。

### 5.5 開放問題

- [x] Q5-1（**裁決 2026-10-19＝訪客 GPS 吸附到區、刊登依服務區；座標不儲存**） 位置來源：**D 先做中心點排序、不收集位置（v3 新增，推薦）** / A 服務據點為主＋手動更新 / B 每次開 app 自動更新 / C 兩者。
- [x] Q5-2 公開精度：裁決 2026-10-17＝1 km 網格＋級距，不存精確點——服務據點作廢後無對象。
- [ ] Q5-3 地圖點選與地圖檢視：**第二期**。
- [x] Q5-4（**裁決 2026-10-19＝有所在區就預設最近，否則最新**） 「離我最近」是否成為預設排序：**推薦：訪客選過地區才預設，否則最新**——L1-1 開工前裁。
- [x] Q5-5 首頁資料流：純前端，不需要 RPC（隨服務據點作廢）。
- [x] Q5-6（**裁決 2026-10-19＝政府開放資料**）（v3 新）區中心點的資料來源與授權（政府開放資料的條款）——L1-1 開工前由業主或 session 查明並寫進 PR。

## 6. 管理者代使用者修改資料＋稽核軌跡（工項 A1b；階段 1 已由 #382 完成）

### 6.1 現況與根因（develop HEAD，#382 合併後）

- **已付款會員不能再改身分資料**（#382）：`POST /auth/register` 改走 `register_profile`（`20261017000004`，security definer、只給
  service_role、先 `for update` 鎖 profiles 列、`effective_registration_step = 3` 回 `completed` → 403）；`PUT /auth/profile`
  整支刪除（`registration-completion-guard.test.ts:398` 釘 404）；`20261017000003` 表級 `revoke update on profiles from
  authenticated`（連帶撤銷每一欄的欄位級權限，`has_any_column_privilege` 斷言 false；也關掉 `profiles_update_own` 的
  `or is_admin()` 分支替管理員 JWT 開的直連路徑）；cancel-signup fail-closed 並擋已付款待開通；前端 `isRegistrationLocked`、
  `PROFILE_LOCKED_*` 常數三處共用（`constants.ts:38-44`，含 LINE 官方帳號 `@uknow` 文字）。規格書 §4.1 新增「註冊完成後的
  資料鎖定」段（`spec:130-141`）：姓名依手冊 2-3-1／2-3-2 書面申請、身分證字號變更等同轉讓經營權依 2-3-3、手機／生日／推薦人
  經客服辦理、pending 視同付款前、續費選新約是唯一自助換推薦人路徑。**規格已承諾「由客服辦理」，後台卻沒有任何代改工具**
  （friction-log 記為 A1b 另案）——A1b 從新需求變成規格已承諾、實作缺席的落差。
- 身分欄位的自助寫入口收斂為單一條：`POST /auth/register` → `register_profile`（寫 name／phone／birth_date／national_id／
  referred_by_*，並把 `referred_by_is_default` 重設為 false）。`referred_by_*` 另兩個寫入點是 `/payuni/prepare` fresh 有碼／
  無碼（`index.ts:1902-1909`、`:1945-1952`）。
- **`handle_new_user` 仍從 `raw_user_meta_data` 寫 `phone` 與 `national_id`**（`20260726000002:81-82`，最後一次定義；
  `20261017000003:20` 註明它是 security definer INSERT、不受 UPDATE 撤銷影響；重審 A1b-03，確認）。正式前端 `signUp` 不帶
  `data`，正常流程兩欄恆為 null，但拿 anon key 直打 `/auth/v1/signup` 帶 `data` 就能在 Step 2 之前種下 national_id——與
  v2 Q2-4「第一次輸入從驗證變設定」是同一個注入面。
- 欄位連動：`national_id` 是身分驗證（`/rewards/verify-id`）、提領、查收、領獎四處的驗證憑證（`verifyNationalId`
  `index.ts:311-315`，呼叫 `:3161,3318,3366,4090`；null 一律 false）並與證件審核綁定（`request_withdrawal` 讀
  `id_verification_status`）；提領作業台的姓名、手機、身分證、證件照是**即時 join profiles**（`index.ts:1166-1169`，只有銀行
  資訊是申請當下的快照）；`bank_*` 在 profiles 是「上次使用值」，提領預填讀裝置 localStorage、送出由 body 帶入——代改 bank_*
  對會員流程無效；`name` 改了推薦網絡即時反映，獎勵明細的名字是發獎當下快照、不連動——**規格書 §4.2:147 已由 #382 改寫成與
  程式一致**（v2 引的「修改時連動所有顯示介面」已不存在，Q6-7 失去文字依據）；§14 #5 的罕用字逃生口是「聯繫客服」；§14 #1
  身分證唯一性仍未實作（`register_profile` 也沒查）。
- 事業手冊 2-3-3 原文（`businessManual.ts:95`）：「欲轉讓經營權或變更身分證字號者，應以書面向本公司申請，經本公司書面同意，
  且受讓人循事業手冊規定入會後，始完成經營權轉讓」——把「變更身分證字號」與「轉讓經營權」放在同一個程序裡（重審 A1b-02，
  確認；原文沒有直接寫「＝」）。1-1「每名傳銷商以身分證字號為準限取一個經營權」。
- **權限盤點（2026-10-17 唯讀查詢，逐環境）**：正式站與本機重播——`authenticated` 對 profiles 沒有 table-level SELECT
  （`name-write-paths.test.ts:36-45,65-72` 釘 false）；**持久 develop 分支——有**（平台 default privileges），`profiles_select_own`
  在那裡是活的，持 token 的會員可直讀自己列的**完整** `national_id`／`bank_account`，繞過 Edge 的遮罩（推論，未實送）；正式站
  `anon` 對 profiles 有表級 SELECT（RLS 無 anon policy → 0 列）；develop 的 `authenticated` 有 INSERT／DELETE／TRUNCATE 表級
  授權（RLS 無對應 policy）。各環境 default privileges 不一致是 `rls-policies.test.ts` 早已記錄的事實。
- admin 沒有改他人資料的端點（`/admin/members/*` 只有 GET、admin、suspend）；journey 唯一直打 PostgREST 的 profiles 寫入者
  用 service_role（`admin_bootstrap.py:38`），不受撤銷影響。
- #382 審查留下的未處理項在 HEAD 逐項仍在：(a) `/payuni/prepare` 建單前沒有 `isProfileComplete`／`national_id` 非空檢查，
  之後直接寫 `referred_by` 並建單；(b) step 3 且資料未填齊者會在 App 守衛 → 完善資料頁 → 403 → 會員中心 → 守衛之間繞圈
  （兩環境此族群目前 0 筆，含 `national_id` 為空也是 0；時點量測非結構保證）；(c) cancel-signup 讀與刪之間無鎖；(d) 已付款待開通窗口內換線，
  `completed_at` 取 PayUni 付款時點、早於換線時刻，`repair_orphaned_payments` 的閘門會永遠略過該筆；**(d′) 同一個閘門對所有
  預設推薦人首購恆為假**（無碼首購在付款交易內由 3a-bis 回寫預設推薦人、trigger 以交易 `now()` 寫 `changed_at`，必大於
  PayUni 時點的 `completed_at`），3c 中斷的孤兒修不到，`20260807000001:20-22` 檔頭的說法與程式不符——既有 bug，v3 審查發現，
  另開 `/fix-bug`（動 repair 函式，Opus）；(e) `PaymentCheckout` 的
  localStorage `pendingUser` 付款後不更新；(f) 完善資料頁「稍後註冊」對 cancel-signup 的 400 仍登出。

### 6.2 設計（v3：代改限「更正輸入錯誤」；稽核軌跡從 §4 搬來；唯一索引改選配）

**A. 稽核軌跡 `admin_audit_log`（A1b 階段 2，代改與既有寫入共用）**
- 欄位：id、admin_id（**純 uuid、不加 FK**＋姓名快照——稽核表不該被 cascade 動到；`on delete set null` 會以 UPDATE 觸發
  append-only trigger，刪曾操作過的管理員會整筆失敗，審查者本機 PG16 實測）、action、target_type、target_id、before、after、
  reason、request_id、created_at。**權限**（repo 慣例：`20260717000001` 只授 service_role、`rate_limits`／`system_alerts` 先例）：
  `enable row level security` 且不建 policy、`revoke all on` 表與 view `from anon, authenticated`、view 一律
  `with (security_invoker = on)`、讀寫只走 service_role 的 Edge；migration 尾端放 `do $$` 斷言（先例 `20260726000001`）並加
  `rls-policies.test` 斷言——develop 分支的 default privileges 會自動授權新表，不顯式 revoke 就是持 token 的會員可直讀稽核
  （含加密身分證原值）。**原子性**：單表寫入（停權、授予、公告、告警、證件審核、代改）改成 SQL 函式 `update … returning` 取 old 並在
  **同一交易**寫 audit；提領已有 `withdrawal_events` 不雙寫，`GET /admin/audit` 以 UNION view 呈現並看 `idempotent` 不重複記；
  **證件審核沒有事件表**（S4-01）→ `admin_review_id` 改成同交易寫 audit。由 `app.routes` 推導的列舉測試保證「每個 admin
  寫入都有 audit」（8 支＋`/admin-setup/set-self-admin`）。
- 敏感欄位的 before／after：**二擇一（Q4-8）**——另存加密原值（pgcrypto，金鑰在 Edge secret，管理端只讀遮罩）以保留還原能力，
  或只存遮罩並刪掉「可還原」的承諾。append-only 靠 `BEFORE UPDATE/DELETE/TRUNCATE` trigger；保存期限的清除走 security definer
  的 `purge` 函式，以交易內旗標（`set_config`）讓 trigger 放行，寫進 migration 說明；測試：刪曾操作過的管理員成功、一般
  UPDATE／DELETE 仍被擋。
- reason：代改、停權**必填**；授予管理員、證件、公告、告警選填（既有 7 個後台寫入 UI 補欄位，列入階段 4）。audit 寫入失敗
  （Q4-7 的選項改成可實作的描述）：(a) **全部 fail-closed**（推薦：同一交易內 audit 失敗＝整筆失敗，最單純）；(b) 非金流類用
  `BEGIN…EXCEPTION` 子交易吞掉 audit 錯誤、回應帶 `auditFailed` 並寫 `system_alerts`，該路徑要有測試。helper 放 `api/audit.ts`；
  `/admin/*` middleware `c.set('adminId')`（目前 `index.ts:1046-1051` 只做 requireAuth＋isAdminUser）。保存期限：條款十二
  「終止後一年」是個資的期限，稽核紀錄是否另有法定保存年限待法務（§14 補充題），答案前不寫死。

**B. 代改端點（A1b 階段 3）**
- **單一 SQL 函式**（先例 `admin_review_id` 與 `register_profile`）由 `PATCH /admin/members/:id/profile` 呼叫：`for update`
  profiles（與付款、register 同一把列鎖）、白名單 name（中／外文模式，**客服例外**：罕用字可帶 reason 跳過格式檢查）、phone、
  birth_date、national_id；**不含** bank_*（代改無效）、referred_by_*、is_admin／suspended（既有端點）、email（Q6-2）。驗證規則
  用「雙實作＋共用案例表」（`api/profile-validation.ts`＋`_shared/profile-validation-cases.ts`，先例 `name-validation-cases.ts`）。
- **代改的定位是「更正輸入錯誤」，不是變更**（重審 A1b-02 的處置）：reason 必選類別——「更正輸入錯誤」／「依書面申請變更」；
  身分證字號只開放前者（打錯一碼、全半形），後者（真的換人、換身分證字號）依手冊 2-3-3 走書面程序，系統端等法務題 §14 第 3 題
  的答案再定要不要開第二類；「更正輸入錯誤」類別可先開發，**上線給客服使用前**要 §14 第 3 題 (a) 的答案（更正是否算 2-3-3 的
  變更）。適用範圍：step<3 的會員可自助重填，代改只在客服需要時用（同一支函式）；**推薦人**：規格書 §4.1 寫「推薦人經客服辦理」，
  但白名單排除 `referred_by_*`——是否納入由 Q6-10 定（納入時經 `validate_referral_code`、同交易寫 audit、維護
  `referred_by_is_default=false`，下次 completed 付款才 rewire 邊；**只在該會員沒有子代時可改**——`referral_edges` 以其為
  referrer 的列為零，同一支函式、同一把鎖內 `exists` 判斷，有子代回 409「已有下線，推薦人不可更改」）。UI：沿用 `MemberAction` 的單一執行器與確認框骨架，唯讀摘要
  「遮罩舊值 → 完整新值」（身分證再輸入一次）；身分證的 reason 類別顯示為固定文字「更正輸入錯誤」而非單選；改身分證的確認鈕
  紅實心（Q6-8；與 ui-ux §12.11「確認鈕跟觸發鈕同類」不同，理由是會員會失去已通過的驗證，記成 §12.11 的例外）。
- 連動：改 `national_id` → 同交易重設 `id_verification_status=none`、清 `id_reject_reason／id_verified_at／id_verified_by／
  id_submitted_at`、兩個 `id_card_*_path` 欄位設 null、舊路徑寫進 audit 的 before；**搬檔是 Storage 外部副作用、不在交易內**：
  commit 後由 Edge 依 audit 列把檔案搬到 archive 前綴（冪等），失敗寫 `system_alerts` 並可依 audit 列重放；409 時不搬。
  **有 pending／awaiting_collection 提領或未領 credit 時拒改（409「有處理中的提領，暫不能更改身分證字號」）**（Q6-5；既有 helper
  `hasPendingWithdrawal` 只查 pending，要擴）。改 `name` → 即時面反映，快照不連動（規格已定）。並發：請求帶 `profiles.updated_at`
  當樂觀鎖（admin 介面只拿得到遮罩值，比不了完整身分證），不符 409「資料已被其他人更新，請重新載入」；相同值回 `idempotent`
  不寫 audit。代改函式**自己在同一把列鎖下查重複**（`exists(… upper(btrim(national_id)) = … and id <> target)` → 409 泛化
  訊息）——「更正輸入錯誤」最容易撞到別人的號碼，不能等選配索引。`BEFORE UPDATE OF national_id` trigger（`WHEN old IS DISTINCT
  FROM new`，同值重寫不重設）一律重設證件狀態。
- **唯一性改選配**（重審）：對帳第 10 項先報表清零；索引 `unique index on (upper(btrim(national_id))) where national_id is not
  null` 與 `/auth/register` 查重另開小 PR，且要同時處理 `handle_new_user` 的 INSERT 路徑（撞 23505 會讓 signup 失敗）。
  §14 #1 在那個 PR 才刪。

**C. 同批要關的洞與出口（A1b 階段 1 的剩餘，可先於稽核做）**
- `handle_new_user` 不再從 metadata 讀 `phone`／`national_id`（正式前端本就不帶；A1b-03）。
- `/payuni/prepare` 建單前守衛：`isProfileComplete` 且 `national_id` 非空，否則 400「請先完成個人資料」（未處理項 a）；另加
  「有 pending 且 `payuni_response->>Status='SUCCESS'` 的訂單就 400『付款處理中』」（與 cancel-signup 同判準）——`/profile` 若
  誤判 `paidAwaitingActivation=false`，這是防重複扣款的後端備援（§1.2B）。
- step 3 且資料未填齊者的 UI 出口：完善資料頁以 `StatusCallout`「資料尚未填齊，請聯繫客服協助補填」取代表單（未處理項 b；
  不說「已鎖定」，事實是未填齊）。
- **權限顯式化 migration**：`revoke all on public.profiles from anon, authenticated`（涵蓋 references／trigger），讓三個環境
  一致、關掉 develop 分支的直讀完整身分證路徑；migration 尾端 `do $$` 斷言三種權限皆 false（先例 `20260726000001:86`），部署後
  逐環境人工查一次當雙保險；`name-write-paths.test.ts` 的環境限定註解改回「三環境皆無」。前端從不直讀 profiles（全走 Edge），
  journey 的直寫者用 service_role，零行為變更。`handle_new_user` 仍讀 metadata 的 `referred_by_code`（正式前端不帶）——同批
  評估是否也中和，檔頭註明依據。
- 選配：cancel-signup 讀與刪包進一支 SQL 函式加列鎖（未處理項 c）；repair 閘門對「開通前換線」的處置（未處理項 d，動
  `repair_orphaned_payments`，Opus，另案）；`pendingUser` 快照（e）歸 S7／S8；「稍後註冊」的 400 處置（f）小修。

**D. 會員側**
- 會員資訊卡說明已是「會員資料一經註冊後無法自行修改」＋ LINE 帳號文字；加一鍵開 LINE（`LINE_OFFICIAL_ACCOUNT_URL` 既有，
  `oaMessage` 預填是否支援 repo 無紀錄，開工時實測一次）；資料被改後**下次開啟會員中心**在需要注意區看到一次性提示
  （`profiles.profile_change_seen_at` 一欄經 Edge 讀寫，內容由 service_role 從 audit 的 before／after 欄位名組出、不含理由；
  按「我知道了」才標已讀；含「已由客服依您的聯繫更正」與 LINE 一鍵）；「請重新上傳證件」靠 `id_verification_status=none` 的
  持久狀態驅動，不依賴一次性提示。

### 6.3 穩定性與架構

- 寫入只經 Edge＋SQL 函式；`ADMIN_MUTATION_GROUPS` 加 `memberProfileEdit → ['members','withdrawals']`；`invalidate` 只收封閉
  聯集。e2e：admin 情境 1 條；會員側 403 情境已由 #382 覆蓋；journey 不受影響。
- 與 A1a：audit 表不再是 A1a 的前置；A1a 面板的「操作紀錄」區等本工項上線後補。與 S7：不撞檔（admin 區）。

### 6.4 階段與測試

| # | 階段 | 狀態 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | 守衛與撤銷：`register_profile` 列鎖、刪 `PUT /auth/profile`、表級撤銷 UPDATE、cancel-signup fail-closed、前端 403 出口 | ✅ #382 | `registration-completion-guard.test.ts`、`cancel-signup-guard.test.ts`、`registrationFlow.test`、`CompleteProfile.test`、e2e `complete_profile.feature` | 已付款 403；付款交易持鎖期間送出等 commit 後 403；pending+SUCCESS 視同付款前；GRANT 斷言 |
| 1b | 剩餘守衛：`handle_new_user` 不讀 metadata、`/payuni/prepare` 完整性與已付款待開通守衛、step 3 未填齊出口、權限顯式化 migration、驗證案例表＋Deno 驗證器 | 待做（Plan Mode `fix/*`；動金流入口、auth trigger 與三環境權限，**規劃與審查用 Opus**） | deno test＋`name-write-paths.test`、vitest | 直打 signup 帶 national_id 不落地；未填齊或已付款待開通不能建單；三環境 GRANT 一致 |
| 2 | 稽核：`api/audit.ts`、`admin_audit_log` 表（無 FK 的 admin_id、RLS 無 policy、revoke all、`security_invoker` view、`do $$` 斷言）、append-only trigger＋`purge` 函式、既有單表寫入改 SQL 函式同交易、`admin_review_id` 補 audit、UNION view、列舉測試、`c.set('adminId')` | 三段式 | sql＋deno test＋`rls-policies.test` | 每個 admin 寫入一筆；表無改刪路徑；刪曾操作過的管理員成功；anon／authenticated 讀寫皆 42501；失敗政策依裁決 |
| 3 | 代改：SQL 函式＋`PATCH` 端點（白名單、reason 類別、連動、兩種 409、`updated_at` 樂觀鎖、同鎖查重、冪等、audit、commit 後搬檔可重放） | 三段式 | deno test | 在途提領拒改；重複字號 409；改字號後 status=none、path 清空、搬檔失敗可重放；409 時不搬；同值重寫不重設證件狀態；「依書面申請」類別依法務答案 |
| 4 | 前端表單＋確認框＋回報＋快取事件；既有 7 個後台寫入 UI 的 reason 欄（停權必填、其餘選填；告警處理與公告這類高頻動作不加進確認框）；A1a 面板補「操作紀錄」區 | | vitest jsdom＋e2e 1 條 | diff 顯示；理由必填；成功後詳情更新 |
| 5 | 會員側提示（`profile_change_seen_at` migration＋Edge 讀寫）＋LINE 一鍵 | | vitest＋deno | 按「我知道了」後不再出現 |
| 6 | 文件：規格書 §13「稽核、代改與連動」、§4.1／§4.2 的「更正輸入錯誤」例外措辭、§4.2 唯一性措辭、§14 #1（隨選配索引）、ui-ux §12.11 例外 | | check-spec-drift | — |
| 選配 | 唯一索引＋`/auth/register` 查重＋`handle_new_user` 衝突處理；cancel-signup 列鎖；repair 閘門 | 各自小 PR | sql＋deno | 重複 409、訊息泛化 |

重量：中偏重（三段式；動會籍身分資料與稽核，**規劃與階段 2／3 用 Opus**）。

### 6.5 開放問題

- [x] Q6-1（**裁決 2026-10-19＝五欄**） 可改欄位：name／phone／birth_date／national_id（**推薦**；bank_* 移除）。
- [x] Q6-2（**裁決 2026-10-19＝不做**） email 由 admin 改（`auth.admin.updateUserById`）：**推薦本輪不做**。
- [x] Q6-3（**裁決 2026-10-19＝不開放**） 會員自助修改：**推薦維持不開放**，一鍵聯繫客服。
- [x] Q6-4（**裁決 2026-10-19＝一律重設**） 改身分證一律重設證件驗證：**推薦一律**。
- [x] Q6-5（**裁決 2026-10-19＝拒改 409**） 有在途提領／未領 credit 時：**拒改 409（推薦）** / 先快照進 withdrawals 後放行。
- [x] Q6-6 撤銷會員對 profiles 欄位的直改權：**已由 #382 完成**（`20261017000003`）。
- [x] Q6-7 改名後獎勵明細快照：**規格書 §4.2 已明文不連動**（#382）。
- [x] Q6-8（**裁決 2026-10-19＝紅實心**） 改身分證確認鈕紅實心：**推薦紅實心**。
- [x] Q6-9（**裁決 2026-10-19＝代改只做「更正輸入錯誤」；文件不改，2-3-3 的書面程序維持人工、系統不開第二類**）（v3 新）代改身分證字號與手冊 2-3-3 的關係：**代改限「更正輸入錯誤」（推薦）**；「依書面申請變更」是否開放給系統
  端、書面文件要不要留檔，§14 第 3 題。
- [x] Q6-10（**裁決 2026-10-19＝A 納入，且只在沒有子代（edge）時可改**）（v3 新）推薦人是否納入代改白名單：規格書 §4.1 已承諾「推薦人經客服辦理」。**A 納入（推薦：經 `validate_referral_code`、
  同交易 audit，下次 completed 付款才 rewire）** / B 不納入並把 §4.1 改成「推薦人由續費選新約更換」。
- [x] Q4-1、Q4-7、Q4-8（稽核範圍（**裁決 2026-10-19＝所有 admin 寫入、全部 fail-closed、只存遮罩**）、失敗政策、敏感欄位）：從 §4 移到這裡，隨階段 2 裁。

## 7. 五種使用者＋被推薦者 × 工項影響表（v3 補 P3′「已付費、未加入推薦計畫」）

| 工項 | P1 訪客 | P2 刊登會員 | P3′ 已付費未加入推薦計畫 | P3 推薦會員（已加入） | P4 管理者 | P5 被推薦者（未註冊） |
|---|---|---|---|---|---|---|
| T1 登入狀態 | 無提示→直接訪客版，不等請求 | 重新整理不閃、暫時性故障停在外框不登出 | 同左 | 同左 | 「平台管理」等確認才出現（不位移） | 註冊漏斗維持 user=null，不誤判 degraded |
| R0 關洞 ✅ | — | — | 驗證端點改需登入（合法流程本就有） | 同左 | — | 落地頁不受影響 |
| R1a 入口與分享 ✅ | og 預覽（R1a-2） | 會員中心看到「加入推薦計畫」引導鈕 | **同位置是「加入推薦計畫」，簽完翻成「邀請好友」；推薦碼欄顯示「尚未加入」** | 1 下到系統分享面板；付費前看不到下線姓名 | — | 收到的訊息含連結與碼；一般註冊頁 |
| P1a／P1b 照片 | 卡片與詳情無灰底留白、縮圖可鍵盤切換 | 自動裁＋可調、1–3 張、HEIC 成因確認 | — | — | 無審核（規格無刊登審核） | — |
| A1a／A2 核對 | — | — | — | — | 手機 Sheet 首屏四事實＋桌機對帳 | — |
| A1b 代改與稽核 ✅階段 1 | — | 已付款後不能自改；被改後有提示 | 同左 | 同左 | 單一入口＋稽核＋reason 類別 | — |
| L1-1 定位 | 按「離我最近」自己選地區、看整數公里 | 不需設定任何位置 | — | — | — | — |

## 8. 工項、波次與分工

### 8.1 波次表（2026-10-19 更新）

| 波 | 工項 | 狀態 | 內容 | 流程／分支 | 模型 | 前置 | 業主看到什麼 |
|---|---|---|---|---|---|---|---|
| 1 | **R0** 推薦碼端點關洞 | ✅ #380（2026-10-18） | §2.1；後續 P2 在 #383 | Plan Mode `fix/referral-validate-hardening` | Sonnet | — | 無可見變化；枚舉面降到需登入＋限流 |
| 1 | **A1b-1** 已付款守衛＋撤銷直改 | ✅ #382（2026-10-18） | §6.1 | `/fix-bug` `claude/auth-register-completion-guard` | Opus | — | 已付款會員改資料得到「請聯繫客服」 |
| 1 | **R1a-1** 入口三顆元件＋分享順位 | ✅ #381（2026-10-19） | §2.1 | Plan Mode `fix/referral-entry-points` | Sonnet | 真機驗收回填 | 會員中心 1 下到分享面板 |
| 0 | S7 prompt 重寫 | 另案（步驟 3） | 拆 S7a／S7b、補 P3′、承接三顆元件；S8 補步驟與 `upline-pairing-lines/rules.md` 處置另開 issue 追蹤（重審 §四 步驟 3） | 規劃分支 | — | — | — |
| 2 | **T1** 登入狀態（縮） | 待開工 | §1 | 三段式 `feature/auth-state-trust` | Opus 規劃／階段 2，Sonnet 實作 | Q1-1、Q1-2 | 重新整理不閃；斷網不被登出 |
| 2 | **A1a** 會員核對面板（純讀） | 待開工 | §4.2(1)；migration 前綴：開工時登記 | 三段式 `feature/admin-member-review` | Opus 規劃／階段 1 | Q4-3、Q4-5、Q4-9；面板段在 S7（最小完成點＝會員區三頁資訊層次）合併後或先合併者定 | Sheet 內五區核對 |
| 2 | **P1a** 照片上傳管線（核心） | 待開工 | §3.2A／C | 三段式 `feature/listing-photo-pipeline` | Sonnet | Q3-1、Q3-3；階段 0 真機 | 選圖即裁、1–3 張、錯誤看得懂 |
| 2 | **A1b-1b** 剩餘守衛與權限顯式化 | 待開工 | §6.2C；migration 前綴：開工時登記 | Plan Mode `fix/*` | Opus 規劃與審查、Sonnet 實作 | — | 無可見變化 |
| 3 | **A2** 對帳報表（純讀）＋手動調整（第二段，排 A1b-2 後） | 待開工 | §4.2(2)；migration 前綴：開工時登記 | 三段式 `feature/admin-reconcile` | Opus 階段 4 與手動調整 | A1a 合併；手動調整另等 A1b-2 | 告警次分頁十一項檢查＋一項盤點；之後手動調整 |
| 3 | **A1b-2／3** 稽核＋代改 | 待開工 | §6.2A／B；migration 前綴：開工時登記 | 三段式 `feature/admin-profile-edit` | Opus | A1a 合併；裁決已齊 | 每筆後台操作可查；會員詳情「更正資料」 |
| Plan Mode | **L1-1** GPS 吸附到區＋中心點排序 | 待開工 | §5.2 | `fix/*` | Sonnet | 已裁；政府開放資料座標 | 「離我最近」有狀態行與出口 |
| Plan Mode | **P1b** 顯示容器 1:1＋滑動 | 待開工 | §3.2D | `fix/*` | Sonnet | 已裁；S6 ✅；P1a 先合併較順 | 卡片與詳情正方形、手機滑動切圖 |
| Plan Mode | **R1a-2** og＋`lang` | 待開工 | §2.2 | `fix/*` | Sonnet | — | LINE 貼連結有預覽 |
| Plan Mode | **R1a-3** 揭露文案 | 待開工 | §2.2 | `fix/*` | Sonnet | 已裁（§14 第 1 題） | 邀請訊息含傳銷商身分句 |
| Plan Mode | 寄信失敗告警 | 待開工 | §2.1 | `fix/*` | Sonnet | T1 後 | 無可見變化 |
| Plan Mode | `/auth/register` 停權檢查 | 待開工 | §2.1、§2.5 | `fix/*` | Sonnet | — | 無可見變化 |
| `/fix-bug` | repair 閘門對預設推薦人首購恆假 | 待開工 | §6.1 (d′)、§4.2 第 2 項 | `fix/*`，動發獎相鄰函式 | Opus | — | 無可見變化；孤兒獎勵可被修補 |
| 第二期（issue） | 簡訊通道、LINE Login、個別化 og、地圖、對帳排程、admin 漏斗檢視、手動調整（若 Q4-2 不納入）、Email 可改、服務據點（L1 第三步）、`ErrorBoundary`、5c 文案 sweep | — | — | — | — | — | — |

**在途工項上限 3**。建議起手：**S7 prompt 重寫**（另案）→ T1 ∥ A1a 階段 1–2（後端）∥ P1a；A1b-1b 與 R1a-2 是小 PR，
塞在空檔。法務題（§14）不擋 T1／A1a／P1a；擋 R1a-3 與 A1b-3 的「依書面申請」類別。各工項 `/plan-feature` 的子 `plan.md`
只放與本總綱的差異，以 `git show <hash>:docs/plans/platform-growth-and-trust/plan.md §n` 為上游，不複製設計。

### 8.2 撞檔矩陣（只撞檔才序列化；S6 已合併，S7 待 prompt 重寫）

| 檔案 | 動它的工項 | 處置 |
|---|---|---|
| `src/App.tsx`、`Navbar.tsx`、`AuthPage.tsx`、`BottomNav.tsx`、`ProtectedRoute`／`AdminRoute`、`apiClient.ts` | 只有 T1 | — |
| `HomePage.tsx` | T1（`hasBottomNav` 一行）、L1-1（結果列與排序）、P1b（桌機卡比例）、S7（現行 prompt 有首頁項，重寫後更新） | 先合併者定；L1-1 與 P1b 都是小 PR，rebase 成本低 |
| `CompleteProfile.tsx`、`PaymentCheckout.tsx` | T1（`/profile` 收斂到 `fetchProfile`）、A1b-1b（step 3 出口，不同區段）、#383（付款頁重驗）、S7（現行 prompt 的姓名切換焦點） | T1 先；其餘互不重疊的區段先合併者定 |
| `Create/EditServiceProvider.tsx` | P1a | — |
| `ServiceProviderManagement.tsx` | P1a（刪除清理、比例）、S7 | 先合併者定 |
| `ServiceProviderDetail.tsx`＋`e2e/test_public_skeleton_layout.py`、`test_public_touch_targets.py` | P1b、S7（現行 prompt 的 `LoadErrorCallout`） | 兩支探針隨 P1b 同 PR 改；S7 先合併者定 |
| `MemberDashboard`／`ReferralManagement`／`referral/*` | S7（prompt 重寫後） | 三顆元件是既成事實；S7 不得複製閘門 |
| `ReferralTreeView`／`MemberDetailSheet`／`RewardHistory` | A1a 面板段、S7 | S7 先或先合併者定（都是注入式改動） |
| `AdminConsole`／`AdminDashboard`／`adminCache`／`api-contract.ts` | A1a → A2 → A1b | 序列化 |
| `supabase/functions/api/index.ts` | T1（`authenticate`＋`/profile`）、A1a（約 10 支讀端點，先抽 `api/deps.ts`）、A2、A1b、P1a（`DELETE /listings/photos`） | 各工項只加自己的區段；A1a 的 `deps.ts` 抽取先合併 |
| `supabase/migrations/` | A1b-1b（權限顯式化）、A1b-2（audit、`profile_change_seen_at`）、A2（對帳函式）、A1a（往上推薦人鏈若需 SQL）、repair 閘門 `/fix-bug`；P1a、L1-1 無 | **migration 版本號登記制**（見下） |
| 規格書 | 每個工項 | 各改自己的節；`check-spec-drift` 把關 |
| `docs/plans/friction-log.md` | 每個 PR | 追加檔尾；後合併者 rebase 時依日期排序、保留一組 `---` |

**migration 版本號登記制（v3 新增，2026-10-17 的教訓）**：#380 與 #382 同日各自取 `20261017000001/2`，各自 CI 綠，只有進
同一棵樹才由 framework-check 10b 抓到，後合併者重編。規則：(1) 工項開工時在 §8.1 自己那列的「內容」欄登記前綴（開工日
`YYYYMMDD`＋序號區段，同日第二個工項用 `000011` 起、第三個 `000021` 起）；(2) **rebase 時若 develop 已有更大的版本號，改號成
大於它**——版本號必須隨合併順序單調，不是隨開工日（長工項預留的低號會在小 PR 先合併後變成亂序）；`check-migration-versions.py`
的 M3「不得早於已合併最大值」目前因先排序永遠不會觸發，另開小 PR 以 `origin/develop` 的最大版本為基準修好，rebase 後一律跑；
(3) 已部署到任何 hosted 環境的 migration 不重編（#382 的 000003／000004 能原地重編是因為預覽分支沒建立）。

### 8.3 裁決 ↔ 工項對照（gating）

2026-10-19 業主逐題裁決後，**沒有任何裁決擋開工**。對照：

| 工項 | 依據的裁決 |
|---|---|
| T1 | Q1-1 A 本機提示；Q1-2 併入 |
| P1a | Q3-1 維持 3 張；Q3-3 每張進裁切 |
| P1b | Q3-2 全部 1:1；Q3-5 滑動納入 |
| A1a | Q4-3 不遮罩；Q4-5 Sheet 子視圖；Q4-9 兩套並列、對帳以 edge 為準 |
| A2 | Q4-2 手動調整納入（排稽核後）；Q4-6 先一致性 |
| A1b-2／3 | Q4-1 所有寫入；Q4-7 全 fail-closed；Q4-8 只存遮罩；Q6-1 五欄；Q6-2／6-3 不開；Q6-4 一律重設；Q6-5 409；Q6-8 紅實心；Q6-9 只做更正；Q6-10 納入且無子代 |
| L1-1 | Q5-1 GPS 吸附到區；Q5-4 有所在區就預設最近；Q5-6 政府開放資料 |
| R1a-3 | Q2-5 揭露句照手冊 4-1-2 |
| 規格書 §4.1 | Q2-10 前半 改引用條款六與契約十二、十三 |
| 停權檢查小 PR | Q2-11 維持現況 |
| 已裁或作廢 | Q5-2（無對象）、Q2-10 後半（R0 ✅）、Q6-6（✅ #382）、Q6-7（規格已定）、Q5-5（純前端）；Q2-1／2／6／7／8／9 隨 R1b 作廢；Q2-3 第二期；Q2-4 關死 |
| 可延後 | Q3-4、Q4-4、Q5-3 |

### 8.4 本輪完成定義

六項各有「業主看到什麼」落地（§8.1 右欄）；第二期清單進 GitHub issue；本目錄刪除（v2 的細節以 `git show` 取回）。

### 8.5 PR 收尾清單（v3 新增；只列 CLAUDE.md 與 PR 範本沒有的三條，退場時升級到 `/review-implementation` 清單與 PR 範本）

1. **被改掉的說法 grep 全 repo**：含 migration 檔頭、測試檔頭、friction-log 同一條目的推論段與處置段、`check-color-usage` 之類
   的排除清單註解（#382 的「永久綁定」、#381 的「整檔與 :root 同步」、#380 的「慢速枚舉」都是這型）。升級落點：
   `/review-implementation` 的檢查清單。
2. 審查者給修法時，若修法牽涉 async handler 內讀 state，先想那是哪一次 render 的 closure（#380 增量確認的「重驗後依結果放行」
   會漏帶推薦碼，施工 session 讀碼後擋下）。升級落點：`/review-implementation` 的審查者提醒。
3. 真機驗收是 gate 的項目，結果回填 PR 驗收清單後才合併；做不到真機的寫「未驗」，不寫「應該可以」。升級落點：PR 範本的驗收段。

紅燈 hash、規格書同 PR 回修、`check-spec-drift`／`check-migration-versions` 與 friction-log 衝突處理已在 CLAUDE.md 與 PR 範本，不重複。

### 8.6 現行規則變動表（v3；§12 的 v2 表只留歷史）

| # | 位置 | 變動 | 裁決／工項 |
|---|---|---|---|
| 1 | 規格書 §4.1:126「付款成功不允許退款」 | 改成「退費依服務條款第六條與參加契約第十二、十三條辦理，平台無線上退款功能」，不重述條文 | §14 第 2 題；只改規格書 |
| 2 | 規格書 §4.1／§4.2:148 鎖定段 | 補「更正輸入錯誤由客服辦理；推薦人僅在無子代時可由客服更正」 | §14 第 3 題、Q6-10；A1b-3 |
| 3 | 規格書 §11:602 | 張數不變；補裁切／壓縮行為（寫行為不寫數字） | Q3-1；P1a |
| 4 | 規格書 §12.3 | 補一句「依區中心點排序」 | L1-1 |
| 5 | 規格書 §13 | 新段「核對與對帳」「稽核、代改與連動」 | A1a／A2／A1b |
| 6 | 規格書 §14 #1、#8 | #1 隨選配索引刪；#8 改寫為剩餘子項 | A1b 選配；T1 |
| 7 | 條款十二 | **不改**（已定案）；稽核紀錄保存照「終止後一年」、位置資料不儲存 | §14 第 5 題；A1b-2 的 `purge` |
| 8 | ui-ux §7、§12.11、§13 第 5 條 | 定位段改「有狀態行與出口、座標不離開前端」；改身分證確認鈕的例外；揭露句規則 | L1-1；Q6-8；Q2-5 |
| 9 | `referralInvite.ts`／`inviteCardImage.ts` 文案常數 | 法定揭露句與獎金字樣 | Q2-5；R1a-3 |

## 9. 驗收與真機責任

每個工項在 PR 描述附「可勾清單」；**真機項目全由業主在 develop 預覽站驗**（Claude web session 無真機），每項列環境（LINE
內建 iOS／Android、Safari、Chrome）、測試帳號與測試刊登：

| 工項 | 自動化證偽 | 真機 |
|---|---|---|
| T1 | e2e：`/profile` 延遲 2 秒時首繪起 DOM 變更零次「登入」＋CLS=0；503 停在受保護頁外框；401 後 refresh 網路失敗不登出；反向案例 | 重新整理 20 次不閃；飛航模式切 App 再回來看到重試不登出；Slow 3G 在 Safari／Chrome 5 次（LINE 內無 devtools） |
| R0 ✅ | deno：無 token 401、限流 429、短窗不扣日額、503 | — |
| R1a-1 ✅ | 元件 vitest、`dashboard_smoke`、溢版巡檢 | **待回填**：LINE iOS／Android、FB、IG 內建瀏覽器按「邀請好友」出現面板／選擇器／複製提示三者之一；記點擊數；貼上確認 |
| R1a-2 | vitest 讀 `index.html` | LINE 貼連結有預覽 |
| P1a／P1b | 2×2 色塊驗裁切；無 EXIF；一張失敗其餘保留；兩支既有探針仍綠 | iPhone HEIC／48MP／方向 6；LINE iOS／Android 裁切手勢 |
| A1a／A2 | 遮罩投影；注入查詢錯誤回 5xx 不回空；合法特例矩陣不報；重複發獎與「預設推薦人首購 3c 中斷」人造例外會報 | 桌機對帳走一輪；手機 Sheet 首屏四事實 |
| A1b | 列舉測試每寫入一筆 audit；在途提領拒改；直打 signup 帶 national_id 不落地；三環境 GRANT 一致 | 代改一筆、會員端看到提示 |
| L1-1 | 368 區鍵一致；案例表五類（全區同縣市＝同區）；選區排序全序；無 geolocation 呼叫 | LINE 內建瀏覽器選區與切換不卡 |

## 10. 不做什麼（本輪）

- 不做邀請物件、token 落地頁、邀請紀錄、註冊步驟列（R1b 作廢）；不做簡訊 OTP、phone-first、LINE Login（第二期裁決）。
- 不收集任何位置資料、不做 GPS 據點、不開位置表、不做地圖（L1 第一步只排序；第三步待觀察）。
- 不做獨立大頭照欄位；不用 Supabase 圖片轉換；不批次回填舊照片；草稿持久化、舊圖重裁、配額清理改選配。
- 不改發獎、換線、提領、推薦王的任何函式；對帳只讀、不重用 repair 的候選迴圈；手動調整不納入（Q4-2 推薦）。
- 不做會員自助修改資料頁；代改只做「更正輸入錯誤」，「依書面申請變更」等法務答案；身分證唯一索引改選配。
- 不引入狀態庫、UI 框架、地圖套件；不做 `PageSkeleton` 統一、`ErrorBoundary` 重做、toast 全站盤點（T1 縮）。
- 不稽核敏感資料讀取（除非 Q4-1 另裁）。
- 不改 `requireAuth` 本體：其餘 46 端點在 Auth 抖動時的假 401 由前端兩層確認補償（該次請求失敗但不登出），是接受的殘餘。
- 不新增分析埋點（L1 的觀察是業主定性觀察）。

## 11. 風險與回滾

| 風險 | 緩解 | 回滾 |
|---|---|---|
| 首繪提示與真實狀態不一致（換帳號、撤權、他裝置登出） | 提示只影響頁首占位；清除時機六種；`/profile` 回來即以其為準 | 關掉讀提示（一行旗標） |
| `degraded` 把真的失效會員留在站內 | 只對 transient 重試一次；401 類先確認再登出；守衛外框不露受保護內容 | 同上 |
| 後端 `/profile` 改錯誤碼影響其他呼叫者 | 只動 `profileHandler` 與 `buildProfileResponse`，不動 `requireAuth`；42 處 401 映射列舉測試 | 還原錯誤碼對照 |
| 裁切／壓縮在特定瀏覽器失敗 | 解碼失敗明確文案；**編碼失敗該張不上傳**（不退回原檔，EXIF 是硬需求） | 旗標關閉裁切（仍不接受原檔） |
| 1:1 改比例打紅 S6 的兩支探針 | 骨架與內容同 PR 改；縮圖列保留 | 還原比例 |
| 核對面板重構推薦網絡端點誤傷會員端 | 先以 Deno 測試釘住再參數化 | 保留舊函式路徑 |
| 對帳第 2 項與 repair 的候選條件漂移 | 合法特例矩陣測試兩邊共用案例 | 關掉第 2 項 |
| 代改資料改錯身分證 | diff 確認＋再輸入＋reason 類別＋audit＋在途提領拒改；「更正輸入錯誤」以外等法務 | 依 Q4-8 的原值還原或人工 |
| 權限顯式化 migration 在某環境撤掉前端其實在用的權限 | 前端無任何直讀 profiles（全走 Edge）；journey 直寫者用 service_role；部署後逐環境查 | 單一 migration 可逆 |
| `handle_new_user` 改動影響 signup | 正式前端不帶 metadata；Deno 測試直打 signup | 還原 trigger |
| 三條管線部署順序（Pages／Edge／migration） | migration 先於前端合併；前端 feature-detect | 前端旗標 |
| 退費口徑三份文件不同（§14 第 2 題）在法務定案前被使用者引用 | 不在任何新畫面重述退費條文，只連結既有文件 | — |
| 未簽約者的碼被使用與發獎（§14 第 4 題）在定案前持續發生 | R0 已把枚舉降到需登入＋限流；A2 第 12 項盤點存量 | — |
| repair 閘門對開通前換線與**所有預設推薦人首購**恆假（§6.1 d、d′） | 對帳第 2 項以訂閱 `created_at` 當時點會報出；閘門本身另開 `/fix-bug` | 人工補發 |
| 稽核表沒顯式 revoke 時 develop 分支可被會員直讀 | §6.2A 的 RLS／revoke／`security_invoker`＋`do $$` 斷言 | 單一 migration |
| A1 建在未人工驗收的 S3／S4／S5 上 | 驗收站 2、3 延到 S7 後是業主既定；A1a 面板段排 S7 後 | — |
| 邀請分享放大註冊量撞 Email 寄信配額 | 正式站 300 封／小時；寄信失敗告警（小 PR） | — |
| 區中心點資料來源的授權或精度 | PR 寫明來源；vitest 釘鍵集合 | 退回縣市中心點 |

## 12. 審查回填紀錄（v1 → v2）

**規則變動表**（本總綱會動到規格書／條款／手冊的地方，全部有裁決題）：

| # | 位置 | 變動 | 裁決 |
|---|---|---|---|
| 1 | 規格書 §4.1／§4.2 | 身分證延後（若做） | Q2-4（推薦不做） |
| 2 | 規格書 §11 | 張數「最多 3（至少 1）」；裁切／壓縮行為 | Q3-1 |
| 3 | 規格書 §4.2:134 | 改名是否連動獎勵明細快照 | Q6-7 |
| 4 | 規格書 §14 #5 | 罕用字客服例外落地 | Q6-1 |
| 5 | 規格書 §8.4 | `adjustment_manual` 端點（若納入） | Q4-2 |
| 6 | 條款十二 | 位置、邀請、稽核的告知與保存期限 | Q5-2、Q4-7 |
| 7 | 規格書 §13 | 稽核、對帳、代改新段；快取事件 | Q4-* |
| 8 | 規格書 §5.3 | 「未確認≠不合格」擴寫到前端 | Q1-2 |
| 9 | ui-ux §12.11 | 「開始註冊」是否開流程鈕例外 | Q2-9 |
| v1 曾寫、v2 撤回 | 驗證端點遮罩名與去刊登名（違反 §4.2） | — | R0 改 requireAuth＋限流 |

**四視角發現處置**（P0／P1 逐條；P2 已併入各節，未採者註明）：

| 來源 | 發現 | 處置 |
|---|---|---|
| 系統 S-0／需求 P0-2／UI F16 | 三角定位 | §5.2B 網格化＋級距＋限流＋防三角測試；Q5-2 擋開工 |
| 需求 P0-1／系統 S-6／架構 P2-17 | R0 遮罩違反 §4.2、journey 斷言全名 | R0 改 requireAuth＋user 限流，不遮罩；落地頁全名 Q2-8 |
| 系統 S-1／UI F1／架構 P2-1 | 提示清除時機、`localStorage.user` | §1.2A choke point、六種清除、刪 user 鍵 |
| 系統 S-2／需求 P1-4／架構 P1-7 | 後端翻譯錯誤碼、global signOut、8 處 fetch | §1.2B `fetchProfile`／`useAuthBootstrap`、local scope、Q1-2 併後端 |
| 系統 S-3／UI F3 | degraded 逾時、單飛、出口、第五態 | §1.2B |
| UI F2／F4／架構 P2-3／P2-4／P2-5 | 占位可點、BottomNav 真五格、骨架對照、登出 transition、ErrorBoundary | §1.2A／C |
| 架構 P1-4／需求 P1-16 | toast 盤點撞檔、T1 與 R1 同檔 | §1.2D 拆 5c 獨立工項；T1 先合併 |
| 系統 S-4／S-5／S-22／UI F6／F7／需求 P1-19／P1-20／架構 P2-8 | 邀請物件語意、碼為權威、paid 推導、冪等、預建 token、狀態名 | §2.3 全面改寫；Q2-7 |
| UI F5／架構 P1-8 | 閘門「已加入推薦計畫」 | §2.2B 閘門內建；付款成功頁導加入 |
| UI F8／G6／G7／需求 P2-4 | 落地頁三態、順序、最小頁首、Badge、步驟列 | §2.3 |
| 需求 P1-1／系統 S-7／UI F5 | 身分證延後代價 | §2.3 改「推薦不做」並列全代價；Q2-4 |
| 需求 P1-2／P1-3 | 法遵升 blocking；硬編數字 | Q2-5 擋開工；數字改常數／契約 |
| 需求 P1-21 | 簡訊「不做」寫成定案 | §2.3 三方案並列；Q2-3；§10 改寫 |
| 架構 P1-5 | S7 綁 R1 | §2.4 S7 不等；入口 S7 後接線 |
| 架構 P2-6／UI G4 | share 帶 url 重複連結 | §2.2A 無連結變體 |
| 需求 P1-5／P1-6／UI F10／F11 | 16:9 容器、舊照片、EXIF | §3.2A／B 七容器統一、Edit 調整範圍、重新編碼剝 EXIF |
| 系統 S-8／S-21／架構 P2-9／P2-10／P2-11／UI F9／G8／G9 | DELETE 授權、孤兒、resize 解碼、信封誤診、草稿模組、裁切流程、a11y | §3.2 全面回填；Q3-3 |
| 架構 P1-1／P1-2／UI F12／需求 P1-14 | Sheet vs 路由、第五分頁、引用反向 | §4.2(2)(3) Sheet 子視圖、告警次分頁；Q4-5 |
| 架構 P1-3／系統 S-18 | loadNetwork 已參數化、referral_tree 不可用、RewardHistory 注入 | §4.1／4.2 修正 |
| 系統 S-9／需求 P1-12／UI F17／架構 P2-14 | audit 原子性、雙寫、漏端點、before 不可還原、reason | §4.2(1)；Q4-7、Q4-8 |
| 系統 S-10／需求 P1-13／UI F13 | 對帳誤報、#3／#5 無偵測力、四態 | §4.2(3) 重寫十項；合法特例矩陣 |
| 系統 S-11／需求 回答 1 | 手動調整冪等與 total_earned | §4.2(3)；Q4-2 推薦不納入 |
| 需求 P1-15 | 「合理／完整／定期」未確認 | Q4-6 |
| 系統 S-12／S-13／S-14／需求 P1-10／P1-11／UI F18／G12／架構 P2-13 | 代改原子性、在途提領、欄級 UPDATE 洞、唯一索引策略、bank_* 無效、姓名規則、會員提示 | §6 全面改寫；Q6-5～Q6-8 |
| 系統 S-15／S-16／架構 P1-9／UI F14／F15／需求 P1-7／P1-8／P1-9 | RPC 篩選語意、寫入雙路徑、回填、精度顯示、首頁重構擴範圍 | §5.2 覆寫表＋薄距離 RPC 預設；Q5-5；L1 階段歸屬 |
| 架構 P1-6 | 依賴 S6 的階段放三段式 | §8.1 拆成 S6 後 Plan Mode PR |
| 架構 P2-15／P2-16／系統 S-19 | 快取事件、index.ts 拆模組、§3 路由同階段、§14 不當路線圖、同一原則三處 | §4.3、§8.2；第二期改 issue；§1.4 階段 6 只擴寫 §5.3 |
| 需求 P1-17／P1-18／UI 回答 4 | 驗收不可證偽、無四視角表 | §7、§9 |
| 系統 S-23／S-24 | 寄信配額、風險遺漏 | §2.3 R0、§11 |
| 未採 | UI G1「公告快取首繪」改為二擇一；系統「RPC 內讀 request.headers 限流」列為階段 2 實測選項；UI H9 LINE Login 列第二期裁決而非本輪 | — |

## 13. 業主裁決紀錄（v2 之後逐題累積；v3 已併入各節，本表是溯源）

| 日期 | 題 | 裁決 | 連帶 |
|---|---|---|---|
| 2026-10-17 | Q5-2 公開精度 | (a) 1 km 網格＋級距，**不存精確點** | 適用於 L1 第三步（v3 把 L1 改成先做中心點排序，§5.2） |
| 2026-10-17 | Q2-10 後半 無匿名消費者 | 業主確認 repo 外沒有東西匿名呼叫推薦碼驗證端點 | R0 已完成（#380）：`GET /referrals/validate/:code` 需登入＋限流；`POST /listings/verify-referral-code` 已刪 |
| 2026-10-17 | Q2-5 法定揭露句與獎金字樣 | 待法務；業主已看示意畫布 https://claude.ai/artifact/V9fhyw3HzcSDVttMu9ptei（八張；其中付款成功頁、落地頁正常態與失效態、註冊第 2 步四張隨 R1b 作廢） | §14 第 1 題；落點只剩邀請訊息與邀請卡 |
| 2026-10-17 | Q2-10 前半 退款口徑 | 待法務：業主指示「以既有法務文件內容為主」 | **v3 更正 v2 的讀碼結論**：v2 寫「三份文件各管一份契約、不衝突；規格書只講了年費那一半」是錯的。原文：《服務條款》第六條除排除消保法七日解除權外，**明文「您於服務期間內仍得隨時通知 UKNOW 終止本服務，UKNOW 應就尚未提供服務之期間，按您未使用月份之比例退還已繳年費」**（`termsOfService.ts:33-34`）；《傳銷商參加契約》第 12 條訂約 30 日內書面解除「全額退款，但得扣除已支付之相關獎金」、第 13 條之後終止「以尚未使用服務之月數，扣除 10% 之減損費後退款」（`participationContract.ts:18-19`）；《事業手冊》2-2-1／2-2-2 同契約（`businessManual.ts:74-80`；v2 引的 2-1-1 只定義猶豫期解約與終止契約兩種情況、不含金額）；規格書 §4.1「付款成功**不允許退款**」（`spec:126`）。契約第 9 條與手冊 1-2-1 把傳銷商契約綁在同一筆 1,200 元年費上——**同一筆錢三種口徑**，是法務題（§14 第 2 題）。起算點有三個錨：契約 12 與手冊 2-2-1 的「訂約之日」、手冊 2-1-1(1) 的「本公司同意申請人成為傳銷商之日」、契約第 3 條的生效日（審核通過並發送推薦碼），在程式上都對不到單一時點；條款六寫「通知」、契約與手冊寫「書面通知」 |
| 2026-10-17 | 重審報告（PR #378 留言 6230904825）處理順序 | 1 立刻可做（R0、`/fix-bug` 補 register 守衛、會員中心邀請鈕）；2 總綱 v3；3 S7 重寫＋S8、rules.md；4 法務題一次問齊 | 1 已全部合併（#380／#382／#381）；2 即本版；3、4 接續 |
| 2026-10-17 | 分享順位（二次裁決，#381 session 內） | 系統分享面板 → 所在 App → 複製；取消就停；不預先為 FB／IG 加窄表，真機驗收為 gate | 取代重審報告 §一-3「直接開 LINE 好友選擇器」；代價是 LINE 內有面板時多一下 |
| 2026-10-17 | #380 審查（留言 6237456203，主 session 依授權裁決） | RPC 收回 anon／authenticated：同意；pg_cron 首次使用：同意；不加 per-IP 第三道窗：維持；付款頁 429 顯示成「無效」：推翻，改三態；舊別名 410 墓碑：不做 | 全部已落地 |
| 2026-10-17 | #382 審查（留言 6239049379，主 session 依授權裁決） | 維持「step 2 含已付款待開通不擋」，以規格句＋測試釘住；cancel-signup 另擋已付款待開通；刪 PUT、表級撤銷、DB 函式加列鎖：維持；set-if-null 補填入口：不採；合併順序 #380 先、#382 重編 000003／000004 | 全部已落地；Q2-4 因此關死 |
| 2026-10-17 | #381 審查（留言 6239632003，主 session 依授權裁決） | 維持二次裁決並延伸到「分享 QR Code」；維持拿掉內建瀏覽器守衛、FB／IG 升 gate；接受回填測試無紅燈但描述要誠實；不做桌機畫布「一代 N」與欄位 label 提示 | 全部已落地；PR 由業主於 2026-10-18 合併，真機驗收結果改為合併後回填（gate 由業主豁免） |
| 2026-10-18 | #380 增量確認 P2 | P2 #1（付款頁暫時無法驗證要有重試出口）、#2（503 文案）合併前修；其餘 9 條開 #383 | 已落地；施工 session 把 #1 改成「重驗通過後再按一次才送單」，主 session 複驗確認同一次點擊送單會漏帶推薦碼，偏離正確 |
| 2026-10-18／19 | 三個 PR 合併 | #380（`ae07800`，10-18）→ #382（`79e0591`，10-18）→ #381（`2fa1f2c`，台北時間 10-19） | 總綱 v3 依此回填 |
| 2026-10-19 | 業主逐題互動裁決（本 session，AskUserQuestion 五輪） | Q1-1 A、Q1-2 併入；Q3-1 維持 3 張、Q3-2 全 1:1、Q3-3 每張進裁切、Q3-5 滑動納入；Q4-1 所有寫入、Q4-2 納入排稽核後、Q4-3 不遮罩、Q4-5 Sheet＋告警次分頁、Q4-6 先一致性、Q4-7 全 fail-closed、Q4-8 只存遮罩、Q4-9 兩套並列＋對帳以 edge 為準（長期只收讀端）；Q5-1 GPS 吸附到區、Q5-4 有所在區就預設最近、Q5-6 政府開放資料；Q6-1 五欄、Q6-2／6-3 不開、Q6-4 一律重設、Q6-5 409、Q6-8 紅實心、Q6-9 只做更正、Q6-10 納入且無子代；**法務文件已定案不可改**，§14 五題改為對齊方式 | 各節開放問題已打勾；§5 改寫成 GPS 區級版、服務據點作廢；§3 回到 3 張；§8.3 無擋開工項 |
| 2026-10-19 | 總綱 v3 四視角審查（系統／架構／UI/UX／需求＋事實核對） | P0×0；P1 41 條各經兩位反駁者，10 條成立全數回填（S-02、S-06、S-07、S-08／ARCH-08、S-09、ARCH-02、UX-06、UX-08、PM-10），31 條降 P2 後擇要回填；事實核對 11 處更正 | 見 §15；新發現既有 bug：repair 閘門對預設推薦人首購恆假（另開 `/fix-bug`） |

## 14. 法務文件對齊（文件已律師定案、不可改；本節是產品與規格書怎麼對齊，2026-10-19 業主裁決）

**前提**：服務條款、傳銷商參加契約、事業手冊三份文件已經律師審閱定案，**不得更改**（業主 2026-10-19）。v3 草稿把下列五題寫成
「要去問法務」，業主裁決改為：文件為準、產品向文件對齊；不再問法務。

**1. 招募曝光面的揭露句與獎金字樣（Q2-5）——已裁**
- 依據：事業手冊 4-1-2(2)「需明白表示自己為傳銷商身分」、4-1-2(5)「嚴禁誇大或承諾任何獎金計畫說明或收入」（`businessManual.ts:187,193`）；
  管理法第十一條（手冊附錄一 `:417-419`）。
- 對齊：邀請訊息（`referralInvite.ts:40-42`）加一句「本邀請由 Uknow 傳銷商 {名} 發送」；訊息、邀請卡、三顆入口的文案不出現
  「賺／獎金／收入」字樣（現況本就沒有，寫進 ui-ux §13 第 5 條當規則）。落點 R1a-3，常數一個 commit。

**2. 年費退費口徑（Q2-10 前半）——已裁**
- 三份文件對同一筆年費寫法不同（§13 更正列有逐字引文）：條款六按未使用月份比例退、契約 12／13 訂約 30 日內全額退（扣已付獎金）
  之後扣 10% 減損費、規格書 §4.1 寫不允許退款。文件不改。
- 對齊：規格書 §4.1:126 改成「退費依《服務條款》第六條與《傳銷商參加契約》第十二、十三條辦理；平台沒有線上退款功能，由客服
  人工處理」，不重述條文、不解釋起算點（起算點以文件原文為準，程式不判定）。落點 §8.6 #1，隨下一個動規格書的 PR 改。

**3. 管理者代改身分證字號與事業手冊 2-3-3（Q6-9）——已裁**
- 依據：2-3-3（`businessManual.ts:95`）把「變更身分證字號」放在轉讓經營權的書面程序裡；1-1 一人一經營權。
- 對齊：後台代改只做「更正輸入錯誤」（本人證件相同、打錯一碼或全半形），reason 固定為該類別並寫 audit；真的換身分證字號或
  換人走 2-3-3 的書面程序，**由客服人工辦理、系統不開第二類**。代改函式在同一把鎖下查重複，更正不得撞到別人的號碼（1-1）。
  落點 A1b-3；規格書 §4.1／§4.2 補「更正輸入錯誤由客服辦理」一句（§8.6 #2）。

**4. 未簽參加契約者的推薦碼可否被使用與發獎（Q2-11）——已裁：維持現況**
- 依據：契約第 3 條（`participationContract.ts:9`）把契約生效綁在推薦碼發放、把**發放獎金**綁在提供證件與存摺之後；手冊 4-1-2(2)
  要求推薦時表明身分。程式現況：碼在首付款時產生、前端閘門讓未簽約者不能出示與分享、獎勵入帳不看簽約、**提領**守衛要簽約與證件。
- 對齊：維持——碼可被使用、獎勵入帳、提領前須簽約與證件，與契約第 3 條的「發放」時點一致；不在 `validate_referral_code`
  與發獎鏈加 `referral_program_joined` 判準。另 `/auth/register` 解析碼不查停權是規格書 §4.2 的缺口，小 PR 補（§2.5）。
  A2 第 12 項的盤點保留，供日後需要時查存量。

**5. 稽核紀錄與個資的保存年限——已裁：照條款十二**
- 條款十二寫個資「保存至您終止本服務後一年止」（`termsOfService.ts:55`），不改。
- 對齊：稽核紀錄只存遮罩值（Q4-8），不另存加密原值；`purge` 函式依「終止本服務後一年」清除（§6.2A）；條款不需要新增稽核條目。

## 15. v2 → v3 變更紀錄

**重審報告（2026-10-17，留言 6230904825）確認的 major 與 v3 處置**

| 來源 | 發現 | v3 處置 |
|---|---|---|
| T1-01 | degraded 時 `ProtectedRoute` 會導 `/login`，計畫沒寫怎麼擋 | §1.2B 守衛對 degraded 畫外框不導頁；現況已會把 5xx 導去登入頁的事實寫進 §1.1 |
| T1-02 | `requireAuth` 是 47 個呼叫點共用，計畫說只動 `/profile` | §1.2B 改成新增 `authenticate()` 只給 `profileHandler` 用；42 處 401 映射列舉測試 |
| T1-04 | `apiClient` 對 401 做全域 signOut，計畫沒列 | §1.1 補事實；§1.2B 收進 `endInvalidSession()` |
| T1-06 | `hasBottomNav` 一行不該另開 PR | 併入 T1 階段 3 |
| T1-09／F1 | 缺「已付費未加入推薦計畫」狀態 | §0 原則 5、十分鐘版、§7 新增 P3′ 欄；S7／S8 另案 |
| T1-13 | T1 做成大工程 | §1.2C 砍掉清單；階段 6→4 |
| R-08 | `validate_referral_code` 與發獎不看已加入 | §2.1 事實；§14 第 4 題；順帶發現 `/auth/register` 解析不查停權 |
| R-09 | `/payuni/prepare` 付款前改 `referred_by`、棄單無還原 | §2.1 事實確認；§6.1 未處理項 (d)；對帳第 8 項口徑配合 |
| F2 | `StatCardAction` 做不到直接分享 | 作廢；#381 以 `action` prop 把真按鈕放連結外 |
| F4／X15 | 邀請物件沒縮短點擊、動到註冊與付款相鄰路徑 | R1b 刪除；Q2-1／2／6／7／8／9 作廢 |
| F7 | 「枚舉面關閉」→「降到需登入＋限流」；§13 法務讀碼錯 | §2.1、§8.1、§9 改口；§13 Q2-10 前半列整段更正 |
| F8 | 頂層 `referrerUserId` 也要移除 | #380 已移除（含 `referrerName`） |
| P-01／X3 | 1:1 會打紅 S6 的骨架探針 | §3.2D 骨架與探針同 PR 改；另發現「縮圖列手機隱藏」會打紅觸控探針 → 改保留 |
| P-02 | 「壓縮失敗退回原檔」與「剝 EXIF 是需求」矛盾 | §3.2A 第 3 點與 §11：編碼失敗該張不上傳 |
| P-03 | HEIC 成因未證 | §3.1 事實（repo 零紀錄；HEIC 現在被格式白名單擋）；P1a 階段 0 真機確認 |
| S4-01 | 證件審核沒有事件表 | §4.1 事實；§6.2A `admin_review_id` 補 audit |
| S4-02 | `/admin/withdrawals` 回未遮罩身分證、帳號、簽名網址 | §4.2 提領區改新端點遮罩投影 |
| S4-03 | 對帳第 8 項口徑錯 | §4.2 第 8 項改母體與排除條件；第 7 項改成偵測 reconcile 失效 |
| S4-04 | 推薦關係以 `referral_edges` 為準 | §4.1 兩套來源並存的事實；面板兩套並列、對帳以 edge 為準（Q4-9） |
| S4-05 | 重用 repair 候選查詢＝動發獎函式 | §4.2 第 2 項另寫唯讀查詢，矩陣測試對照 |
| S4-06 | 重複發獎偵測不存在 | §4.2 新增第 11 項 |
| A1a 拆 | 核對面板＋對帳純讀先做，稽核綁代改 | §4 只剩 A1a／A2；稽核搬到 §6.2A |
| L-01 | 失效連動刪除無機制 | §5.1 事實；第三步才需處理 |
| L-02 | fallback 資料流缺 | §5.2 第一步只有「選地區→區中心點」一條資料流 |
| L-03 | 級距 20+ 退化 | §5.2 第一步連續距離取整數，不用桶 |
| L-04 | 新表要顯式 GRANT | §5.1 事實；第一步無新表 |
| L-06 | 首頁軟詢問＋地區選擇器過重 | §5.2 第一步只有選地區；GPS 改第二步選配 |
| L1 改最小版 | 先做中心點排序 | §5 全節改寫；Q5-1 加 D；Q5-6 資料來源 |
| A1b-01 | `/auth/register` 無已付款守衛 | ✅ #382；§6.1 |
| A1b-02 | 代改身分證牴觸手冊 2-3-3 | §6.2B 代改限「更正輸入錯誤」；§14 第 3 題 |
| A1b-03 | `handle_new_user` 仍從 metadata 寫 `national_id` | §6.2C 階段 1b 關掉 |
| 唯一索引 | 改選配 | §6.2B、§6.4 選配列 |
| X1／X2 | S6 仍寫成進行中；S7 與 P1b／L1b／T1 共檔未排序 | §8.1 狀態、§8.2 撞檔矩陣重寫（S7 列進首頁、詳情、完善資料頁三列）；migration 登記制 |

**v3 四視角審查（2026-10-19）成立的 P1 與回填**

| 來源 | 發現 | v3 回填 |
|---|---|---|
| S-02／ARCH-02 | `apiClient` 把 refresh 自身失敗當 401；只動 `/profile` 時其餘 46 端點的假 401 仍會登出，宣稱過頭 | §1.2B 兩層確認（refresh 錯誤分類、`/profile` 確認），十分鐘版與 §10 改口為「接受的殘餘」 |
| S-06 | 對帳第 2／8 項照抄 repair 的 `completed_at` 閘門，對預設推薦人首購恆假；repair 本身有同一個 bug | §4.2 第 2／8 項改用訂閱 `created_at`；§6.1 (d′)；§8.1 新增 `/fix-bug` |
| S-07 | 稽核表沒有 RLS／revoke／`security_invoker` | §6.2A 權限段、§6.4 階段 2 |
| S-08／ARCH-08 | `admin_id on delete set null` 與 append-only trigger 互斥 | admin_id 無 FK；`purge` 函式放行 |
| S-09 | 證件照搬檔寫成同交易 | §6.2B：path 同交易清空、commit 後搬檔可重放 |
| UX-06 | 中心點規則自相矛盾、全區刊登被算到縣市中心點 | §5.2 單一規則＋案例表 |
| UX-08 | 1–3 張後詳情骨架三格與 1 張刊登不同形 | §3.2D 縮圖列 1 張也畫、探針補 fixture |
| PM-10 | A1a 讀端點沒寫 fail-closed | §4.2(1) 後端語意、§4.4 階段 2 |
| 降 P2 後仍回填的 | S-03／S-04／S-12（`buildProfileResponse` 三呼叫者、五個讀取、分類表、`app.onError`）、S-05／UX-02（degraded 只在冷啟動）、S-11／ARCH-14（登記制改「rebase 時改號單調」、M3 小 PR）、S-15～S-17、S-19～S-21、ARCH-01／03／05／06／07／10～13／16～18、UX-01／03／04／05／10／11／13～20、PM-01～09／11～18、F1～F11 | 各節 |

**七節事實重核摘要（develop HEAD `2fa1f2c`，2026-10-19）**
- 行號漂移：`index.ts` 自 `:248` 起整體 +50～+60（#380 插入限流區塊）；`HomePage.tsx` 353→388（S6）；`constants.ts` `TAIWAN_REGIONS`
  104→115（#382 加 `PROFILE_LOCKED_*`）；`listings.test.ts` 白名單測試上移至 `:190`（#380 刪三條別名測試）；`verifyNationalId`
  261→311；`buildProfileResponse` 364→408；`loadNetwork` 3515→3539；上傳端點 4103→4127；規格書 §4.2 真實姓名列 134→147。
- v2 寫錯、v3 改掉：守衛「三種置中 spinner」→三處兩種；「22 個讀 UserContext 的檔案」→23；「五個 journey builder」→4；詳情主圖
  「黑邊」→S6 後灰底留白；「第一張是封面只是慣例」→Create 標籤已向使用者宣告；「上傳限制的後端第二副本」→至少四份；
  「DB 只有 pgcrypto」→加 pg_cron；「journey 無直寫者」→有一個 service_role 直寫者；§13 Q2-10 前半的三點讀碼結論；§4.1「後台沒有
  任何會員層讀取」→收窄（`/referrals/debug/:userId` 存在）；`member_verify_logs.admin_id` 已改名 `verifier_id`。
- v3 草稿自己寫錯、審查事實核對後改掉：「42 處 401＋middleware 一處」→47 處全部 401（42 處同形字面、含 middleware）；
  `myQrTabPreference.ts:167-176`→`:149-157`；手冊 4-1-2(2)(5) 行號 `:191,197`→`:187,193`；手冊 2-1-1「三種情況」→兩種；
  #382 合併日 10-19→10-18；「三個 PR 沒碰本節前端檔」→`CompleteProfile`／`PaymentCheckout` 有被改；ConstantRule「五條」→四條；
  「五個掛點」→七個；e2e `delete navigator.share` 待辦→已改在 prototype 上；`/admin/*` 行段 `:1061-1776`→`:1061-1771`、
  `/referrals/debug` `:4172-4231`→`:4172-4223`、`/auth/register` 解析 `:709-716`→`:711-717`、提領作業台 join `:1168-1172`→
  `:1166-1169`、`home_steps.py:26-29`→`:27-30`。
- 被三個 PR 改掉、v3 重寫的事實：§2.1 整段（入口、順位、複製連結鈕、驗證端點、Step 2 寫入機制、確認框文案）；§6.1 整段
  （`PUT /auth/profile`、直改權、鎖定段、§4.2 連動措辭）；§1.1 的 `refreshUser` 消費者、`vi.mock('../App')` 數量、`showToast` 數量。
- 仍無法從 repo 驗證、維持標「推論」：冷載四種等待畫面；原圖 EXIF 含 GPS；HEIC 成因；iOS Safari 顯示 HEIC；三邊定位（幾何）；
  LINE 官方帳號 `oaMessage`；3967f69 事故本身（shallow clone 查不到，只見於程式註解）。
- §12（v1→v2 審查回填紀錄）原樣保留為歷史，其中的檔案:行號是 v2 當時的值，不再維護。
