# 平台信任感與成長——六項新需求總綱（v2，四視角審查回填後）

<!-- plans-keep: 跨 session 施工鷹架（§8 的工項尚未開工，順序與 platform-uiux-redesign 的 S6–S8 交錯）；退場條件＝§8 全部工項合併、決策升級進規格書／ui-ux-guidelines 後，收尾時整個目錄刪除 -->

> 業主 2026-10-16 提出六項需求（登入狀態閃爍、推薦分享、被推薦者註冊、刊登照片、管理者核對、定位、管理者代改資料），
> 要求「系統穩定優先、使用者信任且流暢、符合主流直覺的 UI/UX」一併規劃。本檔是**總綱**：每項先講現況與根因（五個唯讀
> 探查讀碼得出，附檔案:行號），再給設計與建議、穩定性取捨、分期與測試、需業主裁決的問題。業主核對後，三段式工項各自
> `/plan-feature <slug>` 落細部規劃書；輕量工項走 Plan Mode。
>
> v1（`ed89b8f`）經四視角 `/review-plan`（系統 P0×1／P1×16、架構 P1×9、UI/UX P1×18、需求 P0×2／P1×21，P2 共 52）。
> 去重後兩條 P0 與全部 P1 已回填或轉成裁決題，處置逐條記在 §12。業主附的影片本 session 讀不到；第 1 項依文字描述規劃，
> 與讀碼事實一致。

## 給業主的十分鐘版

**六項裡真正要改規則的只有四處，其餘都是呈現與資料流**：

| 項 | 一句話結論 | 要您拍板的核心 |
|---|---|---|
| 1 登入閃爍 | 首次繪製不再猜「未登入」：有本機提示就畫頭像占位、沒有就直接畫訪客版；後端暫時性故障不再把人登出 | Q1-1 首繪策略（推薦：本機提示）；Q1-2 後端 `/profile` 把暫時性錯誤翻成 404 的缺口一併修（推薦：併） |
| 2-1 分享 | 一鍵進 LINE 好友選擇器、複製連結、入口搬到推薦頁頂部與付款成功頁；全部走同一個「已加入推薦計畫」閘門 | Q2-5 法定揭露句（擋開工，需法務） |
| 2-2 被推薦者 | 不做簡訊、不代填手機；做「邀請物件」：落地頁顯示誰邀請、碼已鎖定、三步進度，推薦者看得到邀請走到哪一步 | Q2-4 身分證是否延後到首次需要時（推薦：本輪不做，代價見 §2.3）；Q2-3 簡訊／LINE Login 列第二期 |
| 3 照片 | 選圖→自動 1:1 置中裁（可調整）→壓縮→上傳；封面即大頭照；詳情頁滑動輪播；所有顯示容器統一正方形 | Q3-1 張數改「1–3 張」（推薦）；Q3-3 自動裁＋選用調整 vs 每張強制裁（推薦前者） |
| 4 核對 | 先建稽核軌跡，再做會員核對面板（在既有 Sheet 內）、全站對帳報表（只讀、顯示例外）；手動調點數本輪不做 | Q4-2 手動調整（推薦：不納入）；Q4-5 對帳放告警次分頁（推薦）；Q4-6「合理／完整／定期」的範圍 |
| 5 定位 | 刊登者設「服務據點」（區級中心點為預設、可用目前位置）；訪客按「離我最近」才要定位、拒絕可選地區；距離只公開公里級、不回座標 | Q5-2 公開精度（擋開工：預設 1 km 網格＋級距）；Q5-1 位置來源；Q5-5 首頁資料流路線 |
| 6 代改 | 單一端點＋理由必填＋稽核＋連動（改身分證重設證件驗證）；會員自助仍不開放；同時關掉會員目前可直改個資欄位的洞 | Q6-5 有在途提領時禁改身分證（推薦）；Q6-6 撤銷會員對 profiles 欄位的直改權（推薦） |

**施工分三波**（§8）：波次 1「穩定與信任」（登入狀態、推薦碼端點關洞、後端 /profile 缺口）；波次 2「管理」（稽核→對帳
→代改）；波次 3「成長」（照片、邀請流程、定位）。與進行中的 S6／S7 不撞檔，S7 不等本計畫任何工項。

## 0. 貫穿原則

1. **沒確認的狀態不畫成已知狀態**：不知道有沒有登入就不畫「登入」鈕；不知道資料是否同步就不畫 0；不知道定位就不排距離；
   不知道有沒有送達就不寫「已送出」。這是「系統不穩」觀感的共同根因——畫面先給一個答案、幾百毫秒後再改口。
2. **先改呈現與資料流，不動金流與會籍規則**：碰到點數、推薦邊、付款的地方一律只讀或可稽核的單點寫入，不改既有的發獎、
   換線、提領函式（規格書 §7–§10 不變）。本總綱裡會動到規格書 §4／§11／§13 文字的地方全部列在 §12 的「規則變動表」並
   各有裁決題。
3. **主流樣式不等於新框架**：裁切用 IG 的手勢與比例、分享用 LINE 的分享面板、定位用「離我最近」排序鈕——都在既有
   React Context／Tailwind／Radix 內做，不引入狀態庫、UI 框架、地圖套件（延續 platform-uiux-redesign plan.md §5）。
4. **法遵與個資先於功能**：新的招募曝光面（分享、落地頁、付款成功卡）要先過法定揭露的裁決；新的資料類別（位置、邀請、
   稽核）要先定告知、保存期限、清除；公開面只給推算不出個人的粒度。

## 1. 登入狀態與安心設計（工項 T1）

### 1.1 現況與根因（讀碼事實）

- 首次繪製必然是未登入版：`user` 初值 `null`、`isLoggedIn = !!user`（`src/App.tsx:119,131`），Navbar 只看 `isLoggedIn`、不看
  `isLoadingUser`（`src/components/Navbar.tsx:32,101-109`）。22 個讀 `UserContext` 的檔案裡只有 `ProtectedRoute` 與 `AdminRoute`
  讀 `isLoadingUser`。
- 之後才換版：首次 render → effect → `supabase.auth.getSession()` → 原生 fetch `/profile` → `setUser`（`App.tsx:133-187`）。
  `/profile` 對已付款會員還依序 await 三支 repair RPC（`supabase/functions/api/index.ts:414-417`），不在 ETag 讀端點清單。
  `/profile`（別名 `/auth/profile`）的原生 fetch 全站共 8 處、各自處置失敗（App×2、AuthPage×2、CompleteProfile、
  PaymentCheckout×2、OTPVerificationPage），沒有逾時。
- 同一根因的其他位置：BottomNav 載入中不畫、登入後整個冒出（`BottomNav.tsx:32`）；`main` 底部 padding 登入後才加
  （`App.tsx:296`）；首頁搜尋 FAB 登入後上移（`HomePage.tsx:353`）；`MaintenanceBanner` 自己再查一次 session、淡入時把內容
  往下推（`MaintenanceBanner.tsx:58-99`）；已登入者在 `/login` 按 F5 先看到表單再被導走（`AuthPage.tsx:89-94`）；守衛與
  `RouteLoader` 是三種置中 spinner；冷載受保護頁依序出現四種等待畫面。
- `localStorage.user` 是 write-only（3 處寫、9 處清、零讀者），內容是整份 profile（含未遮罩手機）長駐——該刪不該用。
- **後端會把暫時性故障翻成「不合格」**：`requireAuth` 把 `auth.getUser` 任何錯誤回 401（`index.ts:242-247`）；
  `buildProfileResponse` 吞掉 profiles 讀取錯誤→null→404（`:364-384,563-565`）；`accountStatus ?? 'expired'`（`:442`）。前端收到
  404 就 `signOut()`（`App.tsx:145-150`），且 `signOut()` 預設 `scope: 'global'`——撤銷該使用者**所有裝置**的 session。規格書
  §14 #8 記了這件事但沒有工項承接。
- 其他：session 過期一律靜默導 `/login`（`App.tsx:221-230`）；登出先 `setUser(null)` 讓受保護頁閃到 `/login` 再回首頁
  （`Navbar.tsx:58-85`；react-router 7 的導頁包在 `startTransition`，單純對調順序無效）；`ErrorBoundary` 只包 `<Routes>`、沒有
  fallback prop、不收 error 物件（分不出 chunk 錯誤）。

### 1.2 設計

**A. 登入狀態三態＋本機提示（Q1-1，推薦）**

- `UserContext` 的值加 `authState: 'unknown' | 'anonymous' | 'authenticated' | 'degraded'`（**加性**：舊欄位全留，14 支
  `vi.mock('../App')` 的舊 fixture 沒有這個 key 時由純函式 `resolveAuthView()` 回落到舊行為；`ProtectedRoute`／`AdminRoute`
  的授權判斷不變）。註冊漏斗（有 session、profile 未填齊，`App.tsx:160-164`）是第五種合法狀態，維持 `user=null`、導向
  complete-profile，**不**視為 degraded。
- **首繪提示** `uknow:auth-hint`：只存 `{ initial: 首字, at }`，不存 email、isAdmin。App 第一個 render 同步讀它：有提示 →
  頁首畫**可點的**頭像鈕（同一顆 40px 圓＋首字、`aria-busy`；選單的靜態連結與「登出」首繪就能開，只有姓名列等 `/profile`）、
  BottomNav **直接畫真的五格**（五格不依賴 user，旗標是靜態常數）、`main` padding 先加；沒有提示 → 直接畫訪客版，訪客不等
  任何請求。管理後台連結與待處理 badge 一律等 `/profile` 確認後才出現，badge 改成絕對定位小圓點（晚到的第二個請求不再
  撐寬按鈕）。
- **寫入與清除只有一個 choke point**：`UserContext` 提供的 `setUser` 換成包裝版（非 null→寫提示；null→清提示）；再補四個清除
  時機：`getSession()` 回 null、`INITIAL_SESSION` 無 session、`/profile` 回「資料未齊」、`signOut()` 失敗。`localStorage.user`
  與死鍵 `pendingSession` 刪除（啟動時一次 `removeItem` 清舊殘留）。提示鍵名成為 e2e 契約（fixtures 預寫）。
- 為什麼不用「一律中性直到確認」：訪客會看到頁首空白幾百毫秒，首頁是「未登入也要完美」的路徑。為什麼不用 Supabase 的
  `sb-*` key 當提示：key 名依專案 ref、JSON 形狀是函式庫內部契約。

**B. `degraded`：暫時性故障不登出、有出口、有上限**

- 抽 `fetchProfile(token) → ok | unauthorized | transient`（含 8–10 秒逾時、`AbortController`、key=`profile:<userId>` 的
  single-flight）與 `useAuthBootstrap()`（注入 supabase／fetch，可 `renderHook` 測），**8 處 `/profile` 原生 fetch 全走它**；
  App 保留 `useRevalidateOnFocus(… refreshUser())` 字面以過 `appShell.test.ts` 正則。
- `transient`（5xx、斷網、逾時）→ `degraded`：頁首維持占位；全站常駐的狀態行（`role="status"`，提前掛載）「網路不穩，正在
  重新連線」＋第一次失敗就給「立即重試」與「先逛逛首頁／登出」；自動重試 1→2→4→8 秒含 jitter、最多 5 次，每次重新
  `getSession()` 取新 token；focus／online 重置退避。`useRevalidateOnFocus` 的閘改成 `authenticated || degraded`。
- `unauthorized`（401／404／410）才登出，且**先確認再登出**：先 `refreshSession()` 或 1–2 秒後重打一次，仍是 401 類才走單一
  `endInvalidSession()`——`signOut({ scope: 'local' })`，不再撤銷其他裝置。`AuthPage` 的 catch-all signOut 改成只在 401 類。
- **後端那一半同一工項做（Q1-2，推薦併）**：`requireAuth` 的 Auth 5xx 回 503 而非 401；`buildProfileResponse` 的 profiles 讀取
  錯誤 throw→5xx 而非 404；`accountStatus` 讀不到回未知態而非 `expired`。變動只在 `/profile` 一條路徑；不併的話 `degraded`
  只擋得住斷網、擋不住 DB／Auth 抖動這個最常見的形態。
- 冷啟動 `/profile` 只打一次（single-flight 的 key 含 userId，換帳號不會 join 到前一人的請求）；SIGNED_OUT／換帳號時取消
  in-flight，避免登出後「復活」。

**C. 等待畫面與登出**

- 守衛（`ProtectedRoute`／`AdminRoute`）、`RouteLoader`、頁內載入共用 `components/common/PageSkeleton.tsx`：**外框**（標題列＋
  卡片區）一致，內容層由各頁自己的骨架細化；驗收改成「無置中 spinner、外框一致、內容層不跳版」（不宣稱「只有一種等待
  畫面」）。提示存在時預熱當前路由的 chunk。
- 登出：`startTransition(() => { navigate('/'); setUser(null) })`，或只靠 SIGNED_OUT 事件清 user。
- `MaintenanceBanner` 改吃 `UserContext`、上次公告快取在 sessionStorage 首繪就位（或改覆蓋式），不再推擠內容。
- `ErrorBoundary` 加 `fallback` prop 與錯誤分類；外再包一層只包頁首與導覽。

**D. 安心設計（拆成三小批，不與其他工項撞檔）**

| 批 | 內容 | 說明 |
|---|---|---|
| 5a 殼層四項 | session 過期後登入頁上方 `StatusCallout`「為了安全，登入已逾時，請重新登入」並帶 `from` 回原頁；離線條「目前離線，恢復連線後會更新資料」（覆蓋式，不承諾自動重試）；chunk 404 文案「有新版本，請重新載入」＋頁內「重新載入」鈕；`ErrorBoundary` 外層 | 只動 App／AuthPage／ErrorBoundary |
| 5b 結帳頁載入態 | `PaymentCheckout` 的「載入中...」卡改骨架 | 只動一檔 |
| 5c toast 語氣盤點 | 全站 107 處 `showToast`／23 檔，統一「發生了什麼＋下一步」；後端回 code、前端對照文案 | **獨立工項，排在波次 3 之後**：與 P1a／R1／S6／S7 全部撞檔，不能塞在 T1 |

### 1.3 穩定性與架構

- 「元件只准從 App 匯入 `UserContext`」升級成 `appShell.test.ts` 守衛；`utils/auth.ts` 的 `isAuthenticated` 變死碼要手刪
  （knip 不報）；`MaintenanceBanner.test` 要改 mock `../App`。
- e2e 契約：`line_browser_steps.py:86` 匿名時 10 秒內看得到「立即刊登」（維持）；新增「`/profile` 延遲 2 秒且 fixtures 預寫
  提示鍵時，頁首從首繪起 DOM 變更紀錄中零次出現『登入』」（`MutationObserver` 由 init script 掛，單點 `not_to_be_visible`
  抓不到瞬閃）＋ 頁首 CLS=0；反向案例「提示在、session 已失效」必須出現逾時說明；`set_profile_sequence` 是全域計次，冷啟動
  次數改變要重基線（`payment_result_steps.py:22`）；journey 的 login builder 依賴 AuthPage「已登入自動導向」（維持）。
- 與 S6 的交集只有 `HomePage.tsx:353` 一行（`hasBottomNav`）：**S6 合併後另開 `fix/*` Plan Mode PR**，不放進 T1 的規劃書。
- 與 R1 的交集：`App.tsx`（T1 重寫啟動流程、R1 加路由）、`Navbar`（T1 三態、R1 選單入口）、`AuthPage`（T1 兩處、R1 落地）
  → **T1 先合併**，R1 的小增量 rebase；落地頁也要吃三態才不會對已登入者閃「新會員」畫面。

### 1.4 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `authHint.ts`（讀寫清除、壞 JSON、storage 例外）、`resolveAuthView()`、`fetchProfile()` 三分類 | vitest node | 清除時機六種各一案例；transient／unauthorized 分類；逾時回 transient |
| 2 | `useAuthBootstrap()`：single-flight、取消、退避、確認再登出、`scope:'local'`；後端 `/profile` 的 503／5xx／未知態（Deno） | vitest jsdom `renderHook` ＋ deno test | 冷啟動恰一次；5xx 不登出且重試後成功；404 先確認再登出；Auth 5xx → 503 |
| 3 | Navbar／BottomNav／`main`／Banner 依三態渲染；badge 小圓點 | vitest jsdom（Navbar.test 補三組；BottomNav.test 五格契約不變） | 有提示首繪無「登入」；無提示立刻有；admin 連結只在 `authenticated && isAdmin` |
| 4 | `PageSkeleton` ＋ 守衛／RouteLoader 接上；登出 `startTransition`；`/login` 已登入者 | vitest ＋ e2e `route_guards.feature` 補 2 條 | 無置中 spinner；登出不經 `/login` |
| 5a | 殼層安心四項 | vitest ＋ e2e 離線情境 1 條 | 逐項可見 |
| 5b | 結帳頁骨架 | vitest | — |
| 6 | 文件：規格書 §5.3 擴寫「未確認≠不合格」（只寫這一處，§3 與 ui-ux §5 放指標）；§14 #8 改寫為剩餘的後端子項；8 處 fetch 收斂記 friction-log | check-spec-drift | — |

後續 Plan Mode PR（不在規劃書內）：`HomePage.tsx:353` 一行（S6 後）；5c toast 盤點（波次 3 後）。
重量：中偏重（三段式落檔）。階段 2 的啟動流程與後端 `/profile` 屬跨層契約——**規劃與階段 2 審查用 Opus**，其餘 Sonnet。

### 1.5 驗收（可證偽）

- 自動化：上述 e2e 兩條（DOM 變更零次「登入」、CLS=0）＋反向案例。
- 真機（業主，LINE 內建 iOS／Android）：登入後重新整理 20 次、devtools Slow 3G 各 5 次，頁首不出現登入鈕、不位移；斷網重新
  整理看到「正在重新連線」而非訪客版；恢復連線自動回來。`/profile` 的 P50／P95 延遲由階段 2 的 Deno 測試環境量一次當基線。

### 1.6 開放問題

- [ ] Q1-1 首繪策略：**A 本機提示（推薦）** / B 一律中性直到確認（訪客頁首空白幾百毫秒）。
- [ ] Q1-2 後端 `/profile` 把暫時性錯誤翻成 401／404 的缺口（規格書 §14 #8①②）**併入 T1（推薦）** / 另開工項（T1 只能宣稱
  「首繪不閃」、不能宣稱「不再被登出」）。

## 2. 推薦：分享動線（2-1）與被推薦者註冊（2-2）（工項 R0、R1a、R1b）

### 2.1 現況與根因

**分享動線**
- 入口只掛兩處：會員中心「會員資訊」卡（在四張統計卡與訂閱卡之後，`MemberDashboard.tsx:348`）與推薦管理首列
  （`ReferralManagement.tsx:119`）。手機路徑 BottomNav「推薦」→「我的 QR」→「邀請好友」= 3 次點擊；桌機 4 次。付款成功頁
  沒有分享 CTA。
- 分享本身在 LINE 內建瀏覽器幾乎失效：`shareReferralInvite` 對 in-app 瀏覽器**一律直接複製**、不叫分享面板
  （`src/utils/referralInvite.ts:79-82`）；沒有「複製連結」鈕（測試釘死 `InviteFriendPanelContent.test.tsx:44`）；沒有 LINE
  專屬分享；邀請卡 PNG 沒有說明文字；`index.html` 無 og meta，連結貼到 LINE 沒有預覽圖文（推論）。
- 「已加入推薦計畫」才可見邀請分頁（`myQrTabPreference.ts:53-81` 是單一來源；3967f69 事故就是漏了這個閘門）：首購者付完
  年費必為「未加入」。
- 命名不一：BottomNav「推薦」、Navbar「推薦管理」、規格書 §3「推薦網絡」。

**被推薦者註冊**
- 連結只有 `${base}/register?ref=<code>` 一種；落地頁是一般登入／註冊頁，不顯示任何邀請脈絡。碼存 localStorage
  `pending_referral_code`（純字串，e2e 逐字比對；無 TTL、登出不清、再開另一條會覆蓋）。
- 四步：Email 檢核 → 密碼 → **Email OTP** → 完善資料（姓名、身分證、生日、手機、推薦碼、條款）→ PayUni 年費。沒有簡訊供應商
  或 phone auth；手機只驗格式、不驗擁有權。寄信走 Custom SMTP，預設 30 封／小時需手動調高（`docs/supabase-setup-checklist.md:202-207`）。
- 推薦關係在 Step 2 寫 `profiles.referred_by_*`，`referral_edges`、三代獎勵、任務 +1 要到首次付款成功才產生；未付款的被
  推薦者在推薦者畫面完全不可見、沒有邀請紀錄表。
- 兩個推薦碼驗證端點**無登入、無限流**，回推薦人真實姓名、刊登名與內部 `userId`（`index.ts:852-874,978-1002`）；碼是流水號
  → 可枚舉已付費會員真名。**但所有合法呼叫者本來就帶 session**（CompleteProfile 走 `apiRequestJson`、PaymentCheckout 帶
  Bearer），所以關洞不需要遮罩名——規格書 §4.2 要求顯示推薦人真名（打錯碼的唯一防呆），journey 也斷言全名。
- 法遵：事業手冊 1-2-3「不得委託他人填寫入會資料」、4-1-2(2)(5)「需明白表示自己為傳銷商／嚴禁誇大獎金」、4-1-3「未經本人
  同意不得代為申請」；多層次傳銷管理法第十條（參加前告知）、第十一條（招募時應表明）（`src/content/businessManual.ts`）。
  現行邀請訊息與邀請卡沒有揭露字樣。另：規格書 §4.1「付款成功不允許退款」與手冊 2-1-1(1)「30 天猶豫期」現況不一致。

### 2.2 設計：分享（2-1）

**A. 一鍵到 LINE，四個動作同一位階**
- `shareToLine(message)`：`https://line.me/R/share?text=<encodeURIComponent(訊息)>`，同分頁開啟（走既有 `openExternalLink`；
  repo 禁 `target=_blank`／`window.open`）。LINE 內建瀏覽器直接打開好友選擇器；Safari／Chrome 喚起 LINE。**真機驗收**（repo 無
  紀錄）。
- 面板動作：「LINE 傳給好友」（整寬）、「複製連結」（新增，只複製連結）、「更多」（Web Share，帶 `url` 時 `text` 用**無連結**
  變體，避免連結重複；LINE 內建瀏覽器無 Web Share 且 `<a download>` 不穩，改內嵌邀請卡圖＋「長按儲存」）。全部
  `tone="secondary"`、靠順序與整寬分主從，不用 LINE 綠底、不升引導鈕（ui-ux §12.11：分享／邀請屬次要；Q2-1）。推薦碼列的
  複製鈕補到 44px。複製失敗顯示可全選的連結欄。
- 邀請訊息（主詞清楚、數字來自契約而非硬編）：「{名} 邀請你加入 Uknow 專業服務平台 👉 {連結}（推薦碼 {碼} 已幫你帶入）」；
  獎金字樣是否出現、法定揭露句怎麼寫，等 Q2-5。邀請卡加「掃描加入 Uknow・推薦碼 {碼}」。
- 面板掛載時**預先**建邀請 token（§2.3），點擊時同步導向（iOS 對非手勢的 async 導向會退化成開網頁）；token 建立失敗就降級為
  舊 `?ref=` 連結照樣分享，不出現「已送出」這類無法證實的提示。

**B. 入口與閘門**
- 面板抽成三件組 `useInviteShare`＋`InviteSharePanel`（完整）＋`InviteShareActions`（精簡列），放 `components/referral/`；
  **閘門內建於面板**（吃 `availableMyQrTabs`）：未加入推薦計畫者看到的是「加入推薦計畫」引導（簽名對話框），不是分享。
  後端 `POST /referrals/invitations` 同樣擋 `not_joined`。
- 入口：推薦管理頁（`/referrals`）層次改為「橫幅（有才畫）→ 推薦總人數（主數字）→ 精簡邀請區 → 邀請紀錄 → 推薦網絡」；
  會員中心推薦卡加次要動作「邀請」（`StatCardAction`，導向 `/referrals`，不巢狀互動）；Navbar 選單加「邀請好友」；付款成功頁
  加一張卡（未加入者導「加入推薦計畫」）。「2 次點擊到 LINE 好友選擇器」成立。
- 用語收斂：BottomNav「推薦」維持（五格契約），頁名「推薦管理」，UI 字串用「推薦人／一代二代三代」（ui-ux §12.13）。
- `index.html` 加靜態 og（title／description／image，絕對網址靠 `%VITE_*%` 注入）與 `lang="zh-Hant"`；個別化預覽列第二期。

### 2.3 設計：被推薦者從連結到完成（2-2）

**先回答「Amway 式：推薦者填對方手機、對方收簡訊、點開就預填」**

那條路的三個組件：(1) 簡訊通道、(2) 一個「邀請」物件把推薦者與預填資料綁在 token 裡、(3) 落地頁讀 token 預填。
三個方案並列（Q2-3）：

| 方案 | 內容 | 成本與風險 | 價值 |
|---|---|---|---|
| **A 邀請物件（推薦，本輪）** | token 連結＋落地頁＋推薦者可追蹤；被推薦者自己輸入手機 | 新表一張、零外部依賴 | 解掉「不知道這是什麼、要幾步、碼有沒有帶到」與「石沉大海」 |
| B 簡訊送達通道（第二期） | 推薦者輸入對方手機→系統寄含連結的簡訊；需勾「我已取得對方同意」；每人每日上限、全站配額、可回覆停止 | 供應商（三竹／Every8d／Twilio）＋每則費用＋濫用面；手冊 1-2-3／4-1-3 與個資法上平台成為共同蒐集者；陌生簡訊的信任反而低 | 可兼當手機擁有權證明（目前只驗格式） |
| C phone-first 帳號 | 手機當帳號識別、簡訊 OTP 取代 Email OTP | 重做 auth（登入、重設密碼、journey 全套） | 少填一個 Email |
| D LINE Login（第二期裁決） | 以 LINE 帳號登入／註冊 | 新 OAuth 供應商、profile 綁定規則 | LINE 族群註冊轉換的最大槓桿 |

**方案 A 的設計**

- **邀請物件** `referral_invitations`：id、referrer_user_id、token（32 bytes base64url，不可枚舉；明文存放可接受）、channel
  （line／copy／share／qr）、client_request_id（冪等建立：開面板時產生，重開不重建）、created_at、opened_at、
  registered_user_id、registered_at、revoked_at、expires_at（90 天，可調常數）。每使用者未過期上限（可調常數）。
  **碼為權威、token 只做歸因**：`/auth/register` 收 `referralCode` 與選填 `invitationToken`，驗證 token 的 referrer 等於由碼
  解析出的推薦人才寫 `registered_*`；只有 token、沒有碼時由後端從 token 解析出碼作後備（落地頁 GET 失敗也不丟推薦人）。
  `opened_at` 用 `update … where opened_at is null` 單句冪等，帶推薦者本人 Authorization 時略過。
  **「已付費」不存欄位、不加 trigger**：讀取時由 `referral_edges`（referee = registered_user_id **且** referrer = invitation.
  referrer）＋ `min(payment_orders.completed_at)` 推導——付款路徑零寫入耦合、對 repair 自癒、改碼後舊邀請不會誤標。
  RLS：推薦者只能讀自己的且 owner-select 不含 `registered_user_id`（付費前不可見，Q2-2）；公開讀取只經 Edge。
  token 語意（Q2-7）：**每次分享鑄新 token、單次綁定（推薦）**；若要「一個連結貼群組、多人註冊都算」則拆子表。
- **落地頁** `/invite/<token>`（未登入可看，是 LINE 冷進站第一頁 → 同步匯入或 preheat；用最小頁首，不顯示訪客版的「立即
  刊登」）。順序：推薦人（碼併同一行）→ 一句平台是什麼 → 三步進度（第 3 步寫「付年費 NT$1,200」，金額來自常數）→ 主鈕
  「開始註冊」（色調見 Q2-9）→「已有帳號？登入」底線連結；法定揭露句預留位置（Q2-5）。**三態**：載入＝卡片骨架（推薦人名
  未到不先畫「邀請你」）；失效／無效／限流＝「這個邀請連結已失效，你仍可直接註冊，推薦碼可在註冊時填寫」＋照常 CTA；
  CTA 首繪即可按，token 在背景解析，解析失敗不擋註冊。已登入者：「你已經是會員了」＋回會員中心，不覆寫自己的碼。推薦人名
  在落地頁顯示**完整名**（token 是推薦者自己發的，Q2-8），舊 `?ref=` 路徑不顯示脈絡。
- **pending 儲存**：`pending_referral_code` 維持純字串（e2e 契約）；新增旁鍵 `pending_invitation`（`{code, token, at}` 原子
  覆寫、90 天 TTL、登出清除）；再開另一條邀請時提示「改用 {新推薦人} 的邀請？」而不是靜默覆蓋。
- **推薦者的邀請紀錄**（`/referrals` 邀請區下方）：狀態名「連結已建立 → 已開啟 → 已註冊 → 已付費」（沒有「已送出」）；列以
  「渠道＋時間」識別（LINE・10/16 14:32）；「再傳一次」只給前兩態；已付費列連到推薦網絡；空態（附 LINE 鈕）／骨架／中性
  錯誤／載入更多＋「已顯示 X / Y」。付費前**不顯示對方姓名**（Q2-2）。
- **註冊漏斗減阻（不改帳號識別）**：四步共用頂部步驟列（`<ol>`＋`aria-current="step"`，三組對應五個畫面：Email／密碼／OTP
  都算第 1 步）；Step 2 的推薦碼在有邀請脈絡時改成唯讀 `Badge`「{推薦人} 的推薦碼 {碼}」＋「換一個」（轉可編輯並解除
  token 歸因），送出前「永久綁定」確認框維持；OTP 頁加「換一個信箱」。
- **身分證是否延後到首次需要時再填（Q2-4）**：v1 的前提有誤——「加入推薦計畫」只收同意與簽名、不收證件；`verifyNationalId`
  在會員驗證、提領、查收、**領獎**四處比對註冊時留下的值（`index.ts:261-265`），且 null 一律 false；手冊 1-1「每名傳銷商以身分
  證字號為準限取一個經營權」、條款十二寫明註冊時輸入、migration `20260620000007:14` 註明「不可廢棄」。延後等於：第一次輸入
  從「驗證」變「設定」（被盜帳號可自設）、取得經營權時無法以身分證把關、五個 journey builder 要改。**推薦本輪不做**；若業主
  仍要做，獨立成 Opus 工項：統一 set-if-null 入口供加入／提領／領獎共用、`verifyNationalId` 對 null 回 `national_id_required`、
  規格書 §4.2 與條款同步、需法務確認。

**R0：先關枚舉洞，不改規則**
- 兩個驗證端點加 `requireAuth`（所有合法呼叫者都有 session）＋以 user 為鍵的限流（抽 `clientIp(c)`／`rateLimit()` 共用，
  `cf-connecting-ip` 優先、`rate_limits` 加清理）；回應移除 `referrer.userId`；**不遮罩名、不去刊登名**（規格書 §4.2 不變）。
  Pages Function 等匿名消費者目前不存在（Q2-10 確認）。邀請 token 查詢另設限流（只計 404）、區分 404／410、`no-store`。
- 寄信配額：活動前確認 SMTP 限流值並加寄信失敗告警（邀請漏斗放大註冊量，Email OTP 是硬上限）。

### 2.4 穩定性與架構

- 新表與發獎、換線、任務零耦合；回填失敗只影響紀錄顯示。
- 模組：`referralInvite.ts` 留連結／訊息／LINE／Web Share；pending 抽 `pendingReferral.ts`；token API 獨立檔＋`@contract`
  `API_PATHS`；落地頁 `InviteLanding`；路由進規格書 §3 路由表（加路由的那階段就改，`check-spec-drift` 雙向比對）、
  `e2e/test_overflow_sweep.py` 的清單。
- 拆兩個工項：**R1a**（面板三件組、LINE、複製連結、入口、落地頁 UI、紀錄 UI、og；Sonnet）與 **R1b**（邀請表、端點、
  `/auth/register` 歸因、付費推導、RLS；**Opus**——動註冊與付款相鄰路徑）。R1b 先於 R1a 的紀錄區。
- 與 S7：S7 **不等本計畫**，照原 prompt 先走（入口沿用 `MyQrEntry`）；R1a 在 S7 合併後以小 PR 把會員中心推薦卡與推薦頁頂部
  接到新面板（R1 去適應 S7 版面）。與 T1：T1 先合併（§1.3）。
- 測試契約：`InviteFriendPanelContent.test.tsx:44`「沒有複製連結鈕」反轉；`referralInvite.test.ts` 連結格式（新增 token 形式、
  舊形式保留）；testid `share-referral-button`／`invite-tab`／`my-qr-button` 留用（`dashboard_smoke.feature:12`）；e2e must-keep
  三條註冊情境名不改；新增 `invite_landing.feature`；journey 補「從邀請連結完成註冊與付款，邀請紀錄變已付費」（目前無連結
  路徑情境）；`backend_api_mock` 加邀請端點 mock。

### 2.5 階段與測試

| # | 工項 | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| R0 | Plan Mode | 驗證端點 `requireAuth`＋限流＋移除 userId；`clientIp`／`rateLimit` 抽取；`rate_limits` 清理 | deno test | 無 token 401；第 N+1 次 429；回應無 userId；停權仍不洩漏 |
| R1b-1 | 三段式 | migration（表、RLS、索引）、`POST/GET /referrals/invitations`（冪等建立、上限、404／410、限流、`not_joined`） | sql＋deno test | token 不可枚舉；過期 410；未加入 403 |
| R1b-2 | | `/auth/register` 收 token 做歸因（referrer 一致才寫）、後備解析碼；「編輯」重送撤回舊歸因 | deno test | 不一致不寫；只有 token 也綁對推薦人 |
| R1b-3 | | 已付費推導查詢＋邀請紀錄端點（分頁、total） | deno test＋sql | 改碼後舊邀請不誤標；repair 後自癒 |
| R1a-1 | 三段式 | 面板三件組＋閘門＋LINE／複製連結／Web Share 變體＋預建 token 與降級 | vitest jsdom | in-app 按 LINE 得 `line.me/R/share?text=`；未加入者看到加入引導；token 失敗仍可分享 |
| R1a-2 | | 落地頁三態＋最小頁首＋pending 雙鍵＋Step 2 Badge＋步驟列 | vitest＋e2e `invite_landing.feature` | 失效 token 仍可註冊；已登入者不覆寫 |
| R1a-3 | | 邀請紀錄區（四態、再傳一次、載入更多） | vitest＋e2e | 四態各一筆；空態附 LINE 鈕 |
| R1a-4 | | 入口：Navbar 選單、付款成功卡（含未加入導引）、og meta、`lang` | vitest＋e2e 溢版巡檢 | 2 次點擊到分享 |
| R1a-5 | | 文件：規格書 §3 路由、§7 新段「邀請物件」、ui-ux §12.11／§12.13、條款（邀請資料保存期限） | check-spec-drift | — |
| R1c（Q2-4 若做） | 三段式，Opus | 身分證 set-if-null 統一入口、四處守衛、journey builder、規格書 §4.2 | deno＋vitest＋journey | — |
| S7 後 | Plan Mode | 會員中心推薦卡「邀請」、推薦頁頂部接新面板 | vitest | — |

### 2.6 驗收

- 自動化：`line.me/R/share?text=` 導向與訊息內容；落地頁三態；邀請紀錄狀態轉換；must-keep 三條照綠。
- 真機（業主）：LINE 內建瀏覽器按「LINE 傳給好友」是否直接開好友選擇器；Safari／Chrome 是否喚起 LINE；未裝 LINE 的退路；從
  LINE 內建瀏覽器開邀請連結、切到系統瀏覽器完成註冊，推薦歸屬不丟（推論待驗）。轉換率：以 `referral_invitations` 的四個時間
  戳做新連結的漏斗；舊 `?ref=` 無 baseline，在紀錄表上線後再量。

### 2.7 開放問題

- [ ] Q2-1 「邀請好友」是否升為引導鈕：**推薦不升**，維持次要樣式但放頂部常駐區。
- [ ] Q2-2 邀請紀錄付費前是否顯示對方姓名：**推薦不顯示**。
- [ ] Q2-3 簡訊通道（B）、phone-first（C）、LINE Login（D）：**推薦 B／D 列第二期裁決，C 不做**。
- [ ] Q2-4 身分證延後：**推薦本輪不做**（代價見 §2.3）；要做則獨立 Opus 工項＋法務。
- [ ] Q2-5（**擋 R1a 開工**）邀請訊息、邀請卡、落地頁、付款成功卡的法定揭露句與獎金字樣：法務裁決；技術上是文案常數。業主 2026-10-17 要求先看示意畫面（§13）再定。
- [ ] Q2-6 個別化 og 預覽（Pages Function）：**推薦不做**。
- [ ] Q2-7 token 語意：**A 每次分享單次綁定（推薦）** / B 廣播型一對多＋子表。
- [ ] Q2-8 落地頁推薦人姓名：**完整名（推薦）** / 遮罩。
- [ ] Q2-9 落地頁「開始註冊」色調：依 §12.11 流程起點是次要；單一轉換 CTA 的頁面是否比照導覽列「立即刊登」開流程鈕例外。
- [ ] Q2-10 前半：規格書 §4.1「不允許退款」vs 手冊 2-1-1 30 天猶豫期——業主 2026-10-17 指示以既有法務文件為準，看過示意畫面再定落地頁寫法（§13）。後半 R0 前確認沒有匿名消費者：**業主 2026-10-17 確認 repo 外無匿名呼叫者（repo 內只有付款頁與完成資料頁，都在登入後），R0 擋開工項解除**。

## 3. 刊登照片：上傳、裁切、呈現（工項 P1a、P1b）

### 3.1 現況與根因

- 鏈路：原檔 multipart → Edge Function（只驗 MIME 與 5MB，`index.ts:4103-4143`）→ service_role 寫 public bucket → 回 URL →
  前端把 URL 陣列寫進 `listings.photos`。**沒有壓縮、裁切、縮圖、EXIF、HEIC 處理，沒有本機預覽**（上傳完才顯示），沒有進度
  與重試，`Promise.all` 一張失敗整批失敗（`CreateServiceProvider.tsx:202`）。原圖含 EXIF（可能含 GPS）直接公開（推論，未抽樣）。
- 「太大不能上傳」：手機原圖 3–8 MB，5MB 上限直接擋；iPhone HEIC 在部分瀏覽器不會自動轉 JPEG。後端錯誤訊息前端讀不到
  （後端回 `{error:'字串'}`、前端讀 `.error?.message`，`:195`）——**bug 在前端**，`apiClient.extractApiErrorMessage` 已能吃兩種
  信封，後端不必動。
- 「不能決定顯示哪一塊」：儲存原圖，各處 CSS `object-cover` 置中裁——首頁照片牆與手機卡 1:1、桌機卡 16:9、刊登管理卡 16:9、
  Create／Edit 預覽 16:9、詳情頁主圖 16:9 `object-contain`（黑邊）、縮圖 80px 正方形。七種容器、兩種比例。
- 「第一張是封面」只是 `photos[0]` 慣例；沒有重排、指定封面；沒有「大頭照」概念。詳情頁三張縮圖點擊切換、無滑動無鍵盤。
- Edit 沒有前端大小檢查；移除照片與刪除刊登都不清 Storage（條款十之一承諾「撤除後三十日內下架」→ 清理是合規項）；
  `ImageWithFallback` 一張失敗後切縮圖仍 fallback；全站 `<img>` 無 `loading`／寬高。
- 授權：服務條款十之一已授權「技術性編輯（含裁切、壓縮、格式轉換）」。`check-spec-drift.py:124-135` 以 regex 釘 §11「最多 N
  張／單張 ≤N MB」與 `constants.ts`。

### 3.2 設計

**A. 選圖 → 自動裁 → 壓縮 → 上傳（IG 式，手機瀏覽器內完成）**
1. 選圖 `accept="image/*"`；解碼 `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth/Height })`（限邊解碼，
   48MP 原圖不會整張 RGBA 進記憶體）；失敗訊息分「記憶體不足」與「格式無法讀取」：「這張照片的格式無法讀取，請換一張，或
   截圖後再試」（iOS 另附「相機設定→格式→最相容」）。iOS Safari 原生能顯示 HEIC（真機驗證列入階段 1）。
2. **先自動 1:1 置中裁並開始上傳，「調整範圍」為選用**（一次選 3 張連續進 3 個全螢幕裁切是最大流失點；Q3-3）。裁切對話框：
   固定取景框、雙指縮放＋**縮放滑桿**（單指替代）、拖曳、重設、完成／取消（44px）；`useBodyScrollLock`＋`touch-action: none`＋
   非 passive 監聽（先例 `SignaturePad.tsx:78-90`、`JoinReferralProgramDialog`）；Android 返回鍵關疊層（`pushState`）；`dvh`。
3. 壓縮：輸出 JPEG（**重新編碼即剝除 EXIF**，這是需求不是副作用），最長邊 1600px、品質 0.82、目標 < 600 KB（三個值是可調
   常數，只在原檔超過上限時顯示「已自動縮小」）。5MB 上限留在後端當安全網。
4. 上傳：每張獨立狀態（準備中／上傳中／失敗-重試／完成）＋常駐 live region；選完立刻 objectURL 預覽；已傳成功的 URL 與文字
   欄位進 `listingDraft.ts`（sessionStorage，key 含 userId／listingId；Edit 定與伺服器版本衝突策略），F5 不丟。上傳中送出鈕
   `aria-disabled`＋原因。
5. 封面：第一張＝封面，每張「設為封面」（≤3 張不做拖曳）；多選顯示 1／2／3 序號與「封面」標。375px 三欄磚塞不下 44px 動作 →
   點磚後在下方出一條動作列。
- 元件：`PhotoPicker`＋`useListingPhotos`（Create／Edit 共用，picker 只回報已確認 URL、不寫整份 formData——stale-closure 回歸
  無從發生），放 `src/components/listing/`（先例 `CategorySelectField`）。`imageGeometry.ts`（純數學，node 測）＋
  `imagePipeline.ts`（注入 ImageIO，jsdom 替身；「≤1600px／<600KB」只能在 Playwright 真瀏覽器驗）。裁切 UI 用 `react-easy-crop`
  在 Create／Edit 的 lazy chunk 內動態載入（依賴與首個 import 同 commit；bundle 預算只在 CI，PR 前手動 build 量；基準
  955／296 kB 是 2026-07 值）。
- **既有刊登的舊照片**（都是未裁切原檔）：Edit 對每張既有照片提供「調整範圍」（抓既有 URL→裁切→上傳新檔→刊登更新成功後
  才刪舊檔）；新舊混排時舊圖以 1:1 cover 置中並在 Edit 說明；EXIF 的舊檔靠重新裁切逐步汰換，不做批次回填。
- 張數：**改「最多 3 張（至少 1 張）」（Q3-1，推薦）**——規格書本就寫「最多 3」；UI 標籤「必須上傳 3 張」、送出鈕、驗證文案、
  `listing_management.feature` 同步改；規格列文字保留 `check-spec-drift` 可抽的形狀。現有刊登全為 3 張，無資料遷移。

**B. 顯示容器統一 1:1（S6 後的 P1b）**
- 七個容器全改 `aspect-square`：桌機卡、刊登管理卡、Create／Edit 預覽、詳情主圖；首頁照片牆與手機卡已是。「封面 1:1＋其餘
  4:5」只在詳情輪播多一種高度、首頁只用 `photos[0]`，無收益（Q3-2 推薦全 1:1）。
- 詳情頁輪播：CSS `scroll-snap` 橫向、底部圓點（≥44px button＋`aria-current`，n=1 不畫）、`region`＋`aria-roledescription=
  "carousel"`、「第 n 張，共 N 張」單一 live 節點、鍵盤左右、`prefers-reduced-motion`；點主圖開 lightbox（Radix Dialog：焦點
  圈、ESC、44px 關閉、焦點歸還；縮放做在 lightbox 內，不靠原生 pinch——viewport 未鎖會放大整頁）。縮圖列桌機保留、手機隱藏。
  alt 維持 `{名稱} - 圖片 N`。`ImageWithFallback` 隨 src 重置、加 `loading="lazy"`／`decoding="async"`／寬高。

**C. 後端與 Storage 清理**
- `DELETE /listings/photos`：只收 `^<uid>/\d+_[a-z0-9]+\.(jpg|png|webp)$` 的路徑（拒 `..`、`//`、編碼變體）、單次上限；**先存
  listings 成功再 diff 刪 Storage**，仍被 `listings.photos` 引用者拒刪；刪刊登走同一條。每使用者物件數上限（查 prefix 計數）；
  排程 janitor（`storage.objects` 未被引用且 >7 天者，先 dry-run 告警再刪）兜底孤兒。
- 上傳端點不變（產物 <1 MB，5MB 是安全網；可選 magic-byte 檢查）。前端 Create:195／Edit:210 改用 `extractApiErrorMessage`。

### 3.3 穩定性與架構

- 資料欄位不變；`public_listings` 12 欄契約不動；上傳限制的後端第二副本（`index.ts:4117,4121`）由子規劃決定共用位置。
- e2e：`create_service_provider_page.py` 的 22 byte 假 JPEG 會被新流程解碼失敗 → 改用真的小 JPEG fixture（e2e 與 journey 共用，
  journey 會打進真 Storage）；「框的＝傳的」用 2×2 色塊 fixture 在真瀏覽器驗輸出主色並斷言無 EXIF（APP1）；`listing_management.
  feature:74-81`「上傳中輸入不被倒回」仍要綠。
- 與 S6：S6 動詳情頁骨架與三態、明訂「縮圖切換不動」。**P1a（上傳管線、Create／Edit、後端、刊登管理卡比例）可與 S6 平行；
  P1b（詳情頁輪播、桌機卡比例、img 屬性）在 S6 合併後另開 Plan Mode PR**。與 S7：`ServiceProviderManagement` 是 S7 檔，P1a
  只改它的刪除清理與容器比例一行，排 S7 前後皆可，先合併者定。
- 真機矩陣（業主）：iPhone Safari／LINE、Android Chrome／LINE；fixture：HEIC、48MP、EXIF 方向 6、透明 PNG（canvas 轉 JPEG 預設
  黑底→補白底）、極大檔。

### 3.4 階段與測試

| # | 工項 | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | P1a | `imageGeometry.ts`＋`imagePipeline.ts`（解碼限邊、方向、裁切矩形、縮放、JPEG、大小估算、錯誤分類） | vitest node＋jsdom（ImageIO 替身） | 矩形換算正確；OOM 與格式錯誤分流 |
| 2 | P1a | `PhotoPicker`＋`useListingPhotos`：自動置中裁、選用調整、狀態機、封面、動作列 | vitest jsdom＋e2e（真 JPEG、2×2 色塊） | 一張失敗其餘保留；封面反映到 `photos[0]`；輸出無 EXIF |
| 3 | P1a | `listingDraft.ts`＋Edit 既有照片「調整範圍」＋衝突策略 | vitest | F5 後照片與文字都在；舊檔在更新成功後才刪 |
| 4 | P1a | 後端：`DELETE /listings/photos`、引用檢查、配額、janitor（dry-run）、Edit 大小檢查、張數 1–3 | deno test | 非法路徑 403；仍引用者拒刪；1 張可送出 |
| 5 | P1a | 文件：規格書 §11（寫行為不寫數字）、multi-step 候選結案、ui-ux §7 補「照片裁切與輪播」 | check-spec-drift | — |
| 6 | P1b（S6 後，Plan Mode） | 詳情輪播＋lightbox、七容器 1:1、`ImageWithFallback`、img 屬性、`service_provider_detail.feature` 補輪播 | vitest＋e2e 溢版巡檢 | 手機可滑；鍵盤可切；一張壞圖不影響其他 |

重量：中（P1a 三段式；P1b Plan Mode）。模型 Sonnet。

### 3.5 開放問題

- [ ] Q3-1 張數：**改「最多 3 張（至少 1 張）」（推薦）** / 維持恰好 3。
- [ ] Q3-2 比例：**全部 1:1、七容器統一（推薦）** / 封面 1:1＋其餘 4:5。
- [ ] Q3-3 裁切流程：**自動置中裁＋選用調整（推薦）** / 每張強制進裁切。
- [ ] Q3-4 「大頭照」獨立於刊登封面：**推薦本輪不做**，封面即大頭照（在首頁牆、卡片、詳情、推薦樹頭像不用圖）。

## 4. 管理者核對視圖（任務、點數、推薦樹、付款）（工項 A1a、A2、A1b）

### 4.1 現況與根因

- 後台沒有任何「某位會員的獎勵明細、任務進度、推薦樹、付款紀錄」讀取：`/rewards*`、`/tasks*`、`/referrals/network/*` 全以本人
  取數；admin 只看得到詳情面板的三個點數總額、最近 10 筆提領、推薦人姓名與直推人數、到期日。**沒有頁面列出 `payment_orders`
  ／`subscriptions`**；付款異常只在系統告警。
- `loadNetwork(client, viewerId)` 本來就以觀看者為參數（`index.ts:3515`），寫死「自己」的只有 `buildFlatNode` 的遮罩與 4 個
  handler 的 `user.id`——重構面比 v1 估的小；SQL `referral_tree()` 只回 5 欄，產不出 `NetworkNode`，不用它。「往上的推薦人鏈」
  兩邊都沒有現成程式。`RewardHistory` 自抓 `/rewards/history`、非 props 注入。
- 帳本正確性靠函式內 `NOT EXISTS`，**沒有 unique constraint**；`repair_orphaned_payments` 的候選查詢（`20260807000001:80-130`）
  就是「缺三代獎勵」的判定且已處理換線閘門；合法特例：fresh 換線（邊原地覆寫、歷史獎勵留舊上線）、fresh 清空當月桶但 credit
  保留、預設推薦人、補繳多筆、任務免費續約（冪等鍵 `source_claim_id`）、`/payuni/prepare` fresh 在付款前就改 `profiles.
  referred_by_*`（棄單者 profile≠edge 是常態）。
- **沒有 admin 操作紀錄表**：停權（無 actor、無理由）、授予管理員、公告刪除、告警處理、首位管理員自授都不留痕；
  `withdrawal_events`（同交易、含 `idempotent`）與 `member_verify_logs`（fail-closed）是僅有的兩條軌跡。既有 8 個寫入端點多數沒有
  理由輸入。`adjustment_manual` 分類存在但無端點；`reward_balances.total_earned` 只算正數且排除提領——手動調整若直接 insert 會
  灌進累計收益。
- 後台既有約束：資料管理類走 `AdminConsole` 的四分頁（規格書 §13:726-729、ui-ux §3:58-65「加第五個分頁會壞版面，新功能先找
  次分頁」）；`AdminConsole` 卸載即 dispose 快取；`repoHygiene.test.ts:250-262` 禁 admin 殼層用 URL state；S4 的詳情 Sheet 有
  journey f70 與 e2e `sheet-header` 契約；**後台手機與桌機並重**（platform-uiux-redesign plan.md:16，v1 引用反了）。

### 4.2 設計：三層

**(1) 稽核軌跡 `admin_audit_log`（A1a，第 6 項也靠它）**
- 欄位：id、admin_id（`on delete set null`＋姓名快照）、action、target_type、target_id、before、after、reason、request_id、
  created_at。**原子性**：單表寫入（停權、授予、公告、告警、代改、調整）改成 SQL 函式 `update … returning` 取 old 並在**同一
  交易**寫 audit；已有自己事件表的（提領狀態、證件審核）**不雙寫**，`GET /admin/audit` 以 UNION view 呈現，並看 `idempotent`
  不重複記。涵蓋 8 個既有寫入＋`/admin-setup/set-self-admin`；由 `app.routes` 推導的列舉測試保證「每個 admin 寫入都有 audit」。
- 敏感欄位的 before／after：**二擇一（Q4-8）**——另存加密原值（pgcrypto，金鑰在 Edge secret，管理端只讀遮罩）以保留還原能力，
  或只存遮罩並刪掉「可還原」的承諾。append-only 靠 `BEFORE UPDATE/DELETE/TRUNCATE` trigger（RLS 擋不住 service_role）。
- reason：代改、調整、停權**必填**；授予管理員、證件、公告、告警選填（既有端點補欄位與 UI）。audit 寫入失敗：金流類
  fail-closed、其餘寫 `system_alerts`＋回應帶 `auditFailed`（Q4-7）。helper 放 `api/audit.ts`（不放 `_shared/`）；先抽
  `api/mask.ts`；`/admin/*` middleware `c.set('adminId')`。保存期限與條款十二「終止後一年」對齊（Q4-7）。

**(2) 會員層核對面板（A1a；在既有 Sheet 內，不升獨立路由，Q4-5）**
- Sheet 維持（手機全螢幕）、內加「完整核對」展開成 `MemberManagement` 內的子視圖（state 驅動，store／busy／鎖分頁仍在
  `AdminConsole`，不需新路由）；保住「查人→看→回列表查下一位」迴圈與 S4 契約。手機首屏＝身分卡＋4 項關鍵事實（會籍狀態與
  到期、最近一筆付款、點數餘額是否與流水帳一致、處理中提領），其餘折疊；**逐區載入、各區三態、失敗不連坐**（§13.4）。

| 分區 | 內容 | 資料來源（新增，只讀） |
|---|---|---|
| 付款與會籍 | `payment_orders`（明確投影，不含 `payuni_response`）＋`subscriptions` 時間軸；pending 超過付款期限標黃 | `GET /admin/members/:id/payments` |
| 獎勵明細 | `RewardHistory` 注入化後複用，多一欄「對應付款」；頁尾「流水帳提領列 vs withdrawals」是否一致 | `GET /admin/members/:id/rewards` |
| 推薦關係 | 一代／二代／三代推薦人（往上，新程式）＋推薦網絡（`ReferralTreeView` 注入 admin 資料源，**完整姓名**＋常駐說明「管理員檢視：顯示完整姓名」，含付款狀態與「這筆給一代推薦人的獎勵有沒有發」） | `GET /admin/members/:id/network/{overview,children,search}`：4 個 handler 本體抽成 `(client, viewerId, { mask })`，admin 端點呼叫同一份 |
| 任務 | 每月桶人數與名單 vs 該月 credit（granted／claimed）；不等式只驗單向、排除當月有 `ledger_reset` 者 | `GET /admin/members/:id/tasks` |
| 提領 | 全部＋事件歷史 | 既有 `/admin/withdrawals` 加 `userId` |
| 操作紀錄 | audit UNION view：action 中文標籤、操作者、時間、理由、before/after 摺疊、分頁 | `GET /admin/audit?target=` |

- 取數函式獨立檔＋`MEMBER_AUDIT_API` 分組仍由 `AdminDashboard` 注入；`useAdminList` 配 `slot: null`。
- 新端點約 20 支進 4,200 行的 `index.ts`：**總綱表態先抽 `api/deps.ts`（requireAuth／isAdminUser／sb）再拆模組，屬結構調整，
  A1a 規劃用 Opus**。

**(3) 全站對帳報表（A2；放「告警」次分頁，Q4-5）**
- 每項檢查回 `{ status: ok | exceptions | error | not_run, count, ranAt }`，畫面四態並列（「查詢出錯」絕不畫成 0 例外；「0 例外」
  寫「上次執行 {時間}」用 `DataAgeNote`）；九項各自請求與進度；`statement_timeout`＋advisory lock 防連點；例外列全序分頁；
  九種檢查正規化成同一列形（會員／問題／應有 vs 實際／金額／時間／連結），手機卡片與桌機表格共用；例外數墨色、狀態靠 Badge。
- 第一批檢查（都從規格書規則直譯，含**合法特例排除**）：
  1. completed 訂單無對應 subscription（舊列以 `payment_transaction_id` 後備）。
  2. 付款（首購、補繳、續約、任務續約 claim）的三代獎勵缺筆或多筆——**重用 `repair_orphaned_payments` 的候選查詢抽成共用
     dry-run 函式**（含 `referred_by_changed_at ≤ completed_at` 閘門），二三代祖先後來換線者標「不可判定」。
  3. `reward_transactions` 型別與外鍵不一致（`type='withdrawal'` 而 `withdrawal_id` 為 null；`referral_reward` 而 subscription
     與 claim 皆 null）——FK 是 `on delete set null`，「指向不存在」結構上不可能，v1 寫錯。
  4. 月份桶 vs credit 張數（單向不等式；排除當月 `ledger_reset`；月份鍵沿用 `Asia/Taipei`）。
  5. 跨來源餘額：Σ ledger 提領列 vs `withdrawals(amount+fee)`；退款 adjustment vs rejected 提領（`available = Σamount` 是恆等式，
     v1 寫錯）。
  6. 提領狀態與最後事件不一致、`awaiting_collection` 超過 N 天（排除事件表建立前的舊提領）。
  7. `payment_orders` pending 超過 N 小時（N > 3 天付款期限）。
  8. `profiles.referred_by_user_id` 與 `referral_edges.referrer` 不一致（排除有 pending fresh 訂單者）。
  9. 未處理告警 > N 天。
  10. `national_id` 正規化後重複（給第 6 項的唯一索引清零用）。
  門檻 N 全部進設定表。驗收：合法特例矩陣（換線／fresh／補繳／預設推薦人／免費續約）各一例**不得報**；對正式環境快照跑全部
  檢查，例外集須全數可解釋。排程寫告警列第二期（Q4-4）。
- **合理性訊號**（Q4-6）：規格書 §9.2 自承弱去重靠「經濟上不划算」，業主要的「合理」可能包含同手機／同收款帳號多帳號、短時間
  成鏈註冊付款；樹深度（三代／到根）；核對留存（簽核／匯出）。本總綱先列第一批一致性檢查，合理性訊號由業主定範圍後進 A2。
- **手動調整**（Q4-2，**推薦本輪不納入**：它是唯一會寫帳本的新能力，與「只讀」承諾相反）。若納入：SQL 函式
  `admin_adjust_reward(p_admin, p_user, p_amount, p_reason, p_idem_key)`——`for update` profiles、`idem_key` partial unique、
  audit 同交易、金額上限、`available<0` 明示；規格書 §8.4／8.5 寫明 `total_earned` 語意；UI 開確認框時產生 idem_key；扣點
  紅實心確認、加點墨黑；雙人覆核與會員端可見理由三項控制。

### 4.3 穩定性與架構

- 新讀取全是 security definer＋revoke 的 SQL 函式或 Edge 查詢，不改發獎、換線、提領函式；`ADMIN_MUTATION_GROUPS` 新增
  `memberProfileEdit → ['members','withdrawals']`、`rewardAdjust`（不入表，註解）；核對、對帳、audit 一律 `slot: null`。
- 與 S7：`ReferralTreeView`、`MemberDetailSheet`、`RewardHistory` 是 S7 也會碰的檔 → A1a 的面板階段排在 S7 合併後，或先合併者定、
  後者 rebase（都是注入式改動）。
- 會員端行為由 `network-endpoints.test.ts` 釘住再參數化（階段順序：先抽取、後端點）。
- A1 建在尚未人工驗收的 S3／S4／S5 之上（驗收站 2、3 延到 S7 後）：風險記在 §11。

### 4.4 階段與測試

| # | 工項 | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | A1a | `api/deps.ts`／`api/mask.ts`／`api/audit.ts`；`admin_audit_log` 表、trigger、RLS；既有單表寫入改 SQL 函式同交易；UNION view；列舉測試 | sql＋deno test | 每個寫入一筆；表無改刪路徑；失敗政策依裁決 |
| 2 | A1a | `loadNetwork` 的 mask 參數化（會員端零變）＋往上推薦人鏈＋`RewardHistory` 注入化 | deno（既有測試全綠）＋vitest | — |
| 3 | A1a | 會員層讀取端點（payments 投影、rewards、network×3、tasks、audit）＋契約 | deno test | 非 admin 403；遮罩；與會員端同形 |
| 4 | A1a | Sheet 內子視圖六區（逐區三態）＋操作紀錄 UI | vitest jsdom＋e2e admin 2 條 | 手機首屏四事實；失敗不連坐 |
| 5 | A2 | 對帳函式 10 支（dry-run 共用、排除條件、門檻設定）＋`/admin/reconcile`＋告警次分頁 UI 四態 | sql＋deno（每支「人造例外」＋「合法特例不得報」各一） | 無誤報矩陣通過 |
| 6 | A2（Q4-2 若納入，Opus） | `admin_adjust_reward`＋確認框＋audit | deno＋vitest | 重送不重複；餘額鎖 |
| 7 | — | 文件：規格書 §13 新段「稽核與對帳」（§3 路由不變）、§8.4 `adjustment_manual`、快取段新事件、用語；ui-ux §3 次分頁例 | check-spec-drift | — |

重量：A1a 重、A2 中偏重。**A1a 規劃與階段 1／2 用 Opus**（`index.ts` 結構調整、推薦網絡重構）；A2 階段 5／6 用 Opus；其餘 Sonnet。

### 4.5 開放問題

- [ ] Q4-1 稽核涵蓋所有 admin 寫入（**推薦**）或只金流類；是否也稽核敏感資料「讀取」（證件簽名網址、完整字號）。
- [ ] Q4-2 手動調整：**推薦本輪不納入**；納入則附上限、雙人覆核、會員端可見理由。
- [ ] Q4-3 admin 看推薦網絡不遮罩二三代姓名：**推薦不遮罩**（常駐說明）。
- [ ] Q4-4 對帳排程寫告警：**第二期**。
- [ ] Q4-5 面板在 Sheet 內子視圖（**推薦**）/ 獨立路由（需動 S5 快取契約）；對帳放告警次分頁（**推薦**）/ 第五分頁（要改
  ui-ux §3 與規格書 §13 的四欄規則與 e2e）。
- [ ] Q4-6 「合理」是否含多帳號／成鏈訊號；「完整推薦樹」深度；「定期」是否要核對留存（簽核／匯出）。
- [ ] Q4-7 audit 失敗政策（金流類 fail-closed？）與保存期限。
- [ ] Q4-8 敏感欄位 before／after：加密原值（可還原）/ 只存遮罩（刪「可還原」承諾）。

## 5. 定位：記錄刊登者位置、依距離排序（工項 L1a、L1b）

### 5.1 現況與根因

- 「依距離排序」全在前端：首頁掛載就要定位（無說明、無按鈕，`HomePage.tsx:142-149`），用 **22 個縣市中心點查表**算距離
  （只看 `city`），被拒／逾時靜默；畫面無距離數字、無排序說明。
- **刊登沒有任何座標欄位**、沒有端點接收座標、沒有「最後位置」欄位；DB 只有 `pgcrypto`。
- 首頁一次 `select('*')` 全抓、無分頁；篩選是多縣市逐區（`districtSelection.ts:117`）、性別多選、關鍵字三欄
  （`listingSearch.ts:28`）、自訂類別，全在前端（純函式有測試）。
- 公開面：`public_listings` 12 欄由兩支測試釘死；**原表 `listings` 對 anon 整表可讀**——座標不能加在 `listings`。
- `districts` 預設 `['全區', …全部區]`、可多選——「第一個勾選的區」是系統性偏差。條款沒有位置資料條目；LINE 內建瀏覽器的
  geolocation 行為 repo 無紀錄。
- **v1 的「RPC 只回距離」不是隱私保證**：匿名呼叫者換三組自選原點就能三邊定位 `source=gps` 的刊登者到百公尺（交友 app 的
  典型事故）——本輪最嚴重的 P0。

### 5.2 設計

**A. 位置來源（Q5-1）：服務據點為主，手動更新目前位置為輔**
- 刊登者在建立／編輯刊登設定**服務據點**：預設由 `city`／`districts` 解析——單一區→區中心點（精度 `district`）、全區或多區→
  縣市中心點（精度 `city`）；「使用我目前的位置」→ GPS 點（精度 `point`，**就地**同意文字：「公開的只有大約距離，可被推算
  到約 1 公里」）。刊登管理頁有「更新為目前位置」與「清除位置」。**不做**「開 app 自動更新」（與「進站不再自動要定位」
  矛盾，且讓服務者位置在不知情下移動）；地圖點選列第二期。
- **既有刊登不需回填**：`listing_locations` 是**覆寫表**，RPC 對無列者用 `districts`／`city` 的中心點 coalesce（多區取最小距離）
  → 上線當天每筆刊登都有位置可排，不退化。

**B. 儲存與公開粒度（Q5-2，擋開工）**
- 新表 `listing_locations`（user_id pk → `listings.user_id`、lat、lng、**grid_lat／grid_lng（寫入時吸附到 1 km 網格）**、accuracy_m、
  source ∈ {district, city, gps}、updated_at）。authenticated 只有 SELECT 本人；**寫入只能經 RPC** `upsert_listing_location`
  （`auth.uid()`、該使用者有 listing、source 白名單、台灣範圍框）；anon 不可讀。中心點表只在 SQL 一份（RPC 吃 `(city, district)`），
  前端不需 368 列座標。
- 公開讀取：**距離只用網格座標計算、回傳分級**（<1 km／1–3／3–5／5–10／10–20／20+，或整數公里取整），永不回座標；對匿名
  呼叫限流（PostgREST RPC 不經 Edge，`bump_rate_limit` 對 anon 已 revoke → 走 Edge `GET /listings/nearby` 沿用限流，RPC 只給
  service_role；或 RPC 內讀 `request.headers` 限流，階段 2 擇一實測）。防三角定位測試：相近查詢點的回傳不得讓位置可推算到
  <1 km。訪客座標送出前捨入到 0.01 度、確認不進日誌。
- 顯示：`district`／`city` 精度寫「約 N 公里」整數或「1 公里內」，**不顯示 0.1 公里**（區中心點相距數公里，是假精度）；
  `point` 精度也只到級距。「同區」只在訪客明確選了地區時顯示。未定位者排最後、不顯示距離。
- 條款：新增「位置資料」告知（目的、保存只留最新一筆、可隨時清除）；刪刊登／會籍失效／終止服務時位置列一併刪除。

**C. 訪客側：先問用途、再要權限，拒絕也能用**
- 首頁結果列上方獨立一列整寬分段切換「最新｜離我最近」（沿用 `HomeViewToggle` 的 `role=group`＋`aria-pressed`＋`bg-sel`，
  高度 44px）。**進站不再自動要定位**。點「離我最近」→ 軟詢問對話框（只出現一次）「用你目前的位置，把附近的服務者排前面。
  位置只用來排序，不會留存。」＋[使用目前位置][改選地區]；定位中有進行中與取消；拒絕／無法取得／逾時三種文案（含「LINE 或
  手機的定位權限沒開」）→「選擇你所在的地區」（縣市／區，與「服務地區」篩選分開語意）；已存地區＋系統已拒＝直接用地區排序
  並顯示「依『台北市 大安區』排序・更改」。卡片：照片牆磚右上角膠囊、詳細卡保留「城市 區」行＋膠囊；切換排序沿用降透明度＋
  `aria-busy`。
- **首頁資料流路線（Q5-5）**：**預設 (b) 薄距離 RPC**——`listing_distances(p_lat, p_lng)` 只回 `(listing_id, distance_bucket,
  precision)` 全量小表，前端照舊抓 `public_listings`＋既有純函式篩選再 join 排序；不改篩選語意、不重寫 SQL、不動 S6 資料路徑、
  e2e REST mock 照用。(a) 全搬 RPC（陣列篩選參數、`total`、分頁、`debounce`）留給資料量逼出時，RPC 介面另訂。前端
  feature-detect：距離 RPC 失敗就退回縣市排序。
- 篩選／排序／已載入頁數進 URL query 或 sessionStorage，返回詳情頁後還原。

### 5.3 穩定性與架構

- `listings`／`public_listings` 零變更；新表走 journey `45_listing_rls.feature` 同款 RLS probe（anon 讀 0 列）。RPC 以
  `public_listings` 為基底（可見性只定義一次，不自寫 `has_active_subscription`）；`set search_path`；clamp 參數；全序排序
  `(bucket, created_at desc, id)`。
- **L1a（後端：表、RPC、Edge nearby、中心點 seed、條款）可先做；刊登表單位置區塊與刊登管理頁「更新／清除」歸 L1a 第二段
  並排在 P1a 合併後（同改 Create／Edit）；L1b（首頁排序 UI、軟詢問、地區 fallback、膠囊、feature-detect、URL state）在 S6
  合併後另開 Plan Mode PR**。e2e：`set_geolocation` 既有 mock；補「拒絕→選地區」；距離 RPC 走 Edge 時由 `backend_api_mock` 攔。
- 量級：Haversine 非瓶頸，逐列可見性函式才是（現行 view 已付）；N 在數萬內毫秒級。

### 5.4 階段與測試

| # | 工項 | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | L1a | 區鄉鎮中心點 SQL seed（368 區，與 `TAIWAN_REGIONS` 鍵一致，vitest 以 fs 讀 migration 對表）；`listing_locations` 表、RLS、網格吸附、`upsert_listing_location` | sql＋deno＋journey RLS probe | anon 不可讀；寫入只能 RPC；吸附正確 |
| 2 | L1a | 距離查詢（Edge `GET /listings/nearby` 或 RPC）＋級距＋限流＋防三角定位測試 | deno test | 不回座標；兩相近查詢點推不出 <1 km；第 N+1 次 429 |
| 3 | L1a（P1a 後） | 刊登表單位置區塊（唯讀一行、使用目前位置、就地同意、結果行含更新時間與清除、預設收合）；刊登管理頁更新／清除；刪刊登／失效連動刪除 | vitest jsdom＋e2e `listing_management` 1 條 | 建立後有列；清除後走中心點 |
| 4 | L1b（S6 後，Plan Mode） | 排序切換、軟詢問、地區 fallback、膠囊、feature-detect、URL state | vitest＋e2e（補「拒絕→選地區」） | 被拒仍可依地區排序；卡片顯示級距 |
| 5 | L1a | 文件：規格書 §11／§12.3 新段「位置與距離」、ui-ux §7 定位規則擴寫、條款 | check-spec-drift | — |

重量：中偏重。**L1a 的 RPC／RLS／限流用 Opus 審查**，其餘 Sonnet。

### 5.5 開放問題

- [ ] Q5-1 位置來源：**A 服務據點為主＋手動更新目前位置（推薦）** / B 每次開 app 自動更新 / C 兩者（偏好開關）。
- [x] Q5-2 公開精度：**裁決 2026-10-17＝1 km 網格＋級距，不存精確點**（寫入時吸附、資料庫只留網格座標；精確點沒有消費者、只有外洩風險與告知義務，第二期地圖檢視再加欄）。L1a 的擋開工項解除；§5.2B 的 lat／lng 欄位描述於 v3 同步改成只存 grid_*。
- [ ] Q5-3 地圖點選與地圖檢視：**第二期**。
- [ ] Q5-4 「離我最近」是否成為預設排序：**推薦：有定位偏好才預設，否則最新**。
- [ ] Q5-5 首頁資料流：**(b) 薄距離 RPC（推薦）** / (a) 全搬 RPC＋分頁。

## 6. 管理者代使用者修改資料（工項 A1b）

### 6.1 現況與根因

- 產品現況「會員資料一經註冊後無法自行修改，請透過 LINE 聯繫客服」；沒有編輯頁；`PUT /auth/profile` 可改六欄但無前端呼叫者
  且只驗姓名；admin 沒有改他人資料的端點。
- **會員目前其實可以直改**：`20260620000009:23-25` 對 authenticated 授與 `profiles` 的 phone／birth_date／national_id／bank 欄位
  UPDATE（只撤了 name），任一登入會員可 `PATCH /rest/v1/profiles?id=eq.<self>` 繞過一切連動與稽核——本項要一併關。
- 欄位連動：`national_id` 是會員驗證、提領、查收、領獎四處的驗證憑證並與證件審核綁定；提領作業台的姓名、手機、身分證、證件照
  是**即時 join profiles**（只有銀行資訊是快照）；`bank_*` 在 profiles 是「上次使用值」，但提領預填讀裝置 localStorage、送出由
  body 帶入——**代改 bank_* 對會員流程無效**；`name` 改了推薦網絡即時反映，獎勵明細的名字快照不連動（這是現況，不是規格
  §8 的規則；規格 §4.2:134 寫「修改時連動所有顯示介面」）；規格 §14 #5 的罕用字逃生口是「聯繫客服」。

### 6.2 設計

- **單一 SQL 函式**（比照 `admin_review_id`）由 `PATCH /admin/members/:id/profile` 呼叫：`for update` profiles、白名單 name
  （中／外文模式，**客服例外**：罕用字可帶 reason 跳過格式檢查）、phone、birth_date、national_id；**不含** bank_*（代改無效，
  移除）、referred_by_*、is_admin／suspended（既有端點）、email（Q6-2）。驗證規則用「雙實作＋共用案例表」（Deno
  `api/profile-validation.ts`＋`_shared/profile-validation-cases.ts`，先例 `name-validation-cases.ts`），`PUT /auth/profile`
  同批收斂成 national_id set-if-null、其餘拒。
- 連動：改 `national_id` → 同交易重設 `id_verification_status=none`、清 `id_reject_reason／id_verified_at／id_verified_by／
  id_submitted_at`、證件照搬 archive 前綴並記 audit；**有 pending／awaiting_collection 提領或未領 credit 時拒改（409）**
  （Q6-5；否則查收與領獎要輸入新字號、作業台列顯示新字號無證件照）。改 `name` → 即時面反映；獎勵明細快照是否連動由
  Q6-7 定。唯一性：先用對帳第 10 項報表清零 → `unique index on (upper(btrim(national_id))) where national_id is not null`
  （migration 內預檢 RAISE）→ 應用層 23505→409 泛化訊息（順手關 §14 #1；`/auth/register` 也要查，否則 §14 #1 刪不掉）。
- 並發：請求帶 `expectedBefore`（或 `updated_at`）樂觀鎖，不符 409；相同值回 `idempotent` 不寫 audit。reason 必填、
  `admin_audit_log` 同交易（before／after 依 Q4-8）。**撤銷會員欄級 UPDATE**（Q6-6；提領寫回 profiles 走 definer 函式不受影響；
  src 與 journey 無直寫者）＋`BEFORE UPDATE OF national_id` trigger 一律重設證件狀態（任何路徑改字號都連動）。
- UI：併入 `MemberAction` 的單一執行器與確認框；表單在 Sheet 管理區（理由欄在表單內）、確認框唯讀摘要「遮罩舊值 → 完整新值」
  （身分證／帳號再輸入一次）；改身分證的確認鈕紅實心（會員失去已通過的驗證，Q6-8）、其餘墨黑；警示用 `StatusCallout`。
- 會員側：會員資訊卡說明改「如需修改，請透過 LINE 聯繫客服」＋一鍵開 LINE 預填（確認官方帳號網址支援 `oaMessage`）；資料
  被改後**下次開啟會員中心**看到一次性提示（已讀標記放後端；內容列被改欄位名＋後續動作如「請重新上傳證件」，不含理由）。

### 6.3 穩定性與架構

- 寫入只經 Edge＋SQL 函式；`ADMIN_MUTATION_GROUPS` 加 `memberProfileEdit`；`invalidate` 只收封閉聯集，不能傳字串。
- 依賴 A1a 的 audit；排在 A1a 後。e2e：admin 情境 1 條；journey 不受影響（無直寫者）。

### 6.4 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 驗證案例表＋Deno 驗證器；`PUT /auth/profile` 收斂；撤銷欄級 UPDATE（Q6-6） | deno test＋rls-policies.test | 會員直改 profiles 被拒 |
| 2 | 唯一性報表→索引 migration（預檢）→ `/auth/register` 查重 | sql＋deno | 重複 409、訊息泛化 |
| 3 | SQL 函式＋`PATCH` 端點（連動、409 條件、樂觀鎖、冪等、audit） | deno test | 在途提領拒改；改字號後 status=none 且照片 archive |
| 4 | 前端表單＋確認框＋回報＋快取事件 | vitest jsdom＋e2e 1 條 | diff 顯示；理由必填；成功後詳情更新 |
| 5 | 會員側提示＋LINE 預填 | vitest | — |
| 6 | 文件：規格書 §13「代改與連動」、§4.2 唯一性與連動措辭、§14 刪 #1 | check-spec-drift | — |

重量：中（三段式；動會籍身分資料，**規劃與階段 3 用 Opus**）。

### 6.5 開放問題

- [ ] Q6-1 可改欄位：name／phone／birth_date／national_id（**推薦**；bank_* 移除）。
- [ ] Q6-2 email 由 admin 改（`auth.admin.updateUserById`，改登入識別）：**推薦本輪不做**；業主原話「Dashboard 有這些資訊」是否
  指 Email 請確認。
- [ ] Q6-3 會員自助修改：**推薦維持不開放**，一鍵聯繫客服。
- [ ] Q6-4 改身分證一律重設證件驗證：**推薦一律**。
- [ ] Q6-5 有在途提領／未領 credit 時：**拒改 409（推薦）** / 先快照進 withdrawals 後放行。
- [ ] Q6-6 撤銷會員對 profiles 欄位的直改權：**推薦撤銷**（需確認無外部腳本直打 PostgREST）。
- [ ] Q6-7 改名後獎勵明細快照：維持不連動（現況）/ 連動（規格 §4.2 字面）。
- [ ] Q6-8 改身分證確認鈕紅實心：**推薦紅實心**。

## 7. 四種使用者＋被推薦者 × 工項影響表

| 工項 | P1 訪客 | P2 刊登會員 | P3 推薦會員 | P4 管理者 | P5 被推薦者（未註冊） |
|---|---|---|---|---|---|
| T1 登入狀態 | 無提示→直接訪客版，不等請求 | 重新整理不閃、暫時性故障不登出 | 同左 | 「平台管理」等確認才出現（不位移） | 註冊漏斗維持 user=null，不誤判 degraded |
| R0 關洞 | — | — | 驗證端點改需登入（合法流程本就有） | — | 落地頁走 token，不受影響 |
| R1 分享與邀請 | og 預覽 | 失效會籍進不了 `/dashboard/qr`，新入口同樣受閘門 | 一鍵 LINE、紀錄可追蹤、付費前看不到姓名 | 暫無漏斗檢視面（第二期） | 落地頁知道誰邀、要幾步、碼已鎖；失效仍可註冊 |
| P1a／P1b 照片 | 卡片與詳情無黑邊、輪播 | 自動裁＋可調、HEIC 可傳、舊照可調整 | — | 無審核（規格無刊登審核） | — |
| A1a／A2 核對 | — | — | 手動調整（若納入）後會員端看到分類與理由 | 手機急救（Sheet 首屏四事實）＋桌機對帳 | — |
| A1b 代改 | — | 被改後有提示與後續動作；在途提領時不被改字號 | 同左 | 單一入口＋稽核 | — |
| L1a／L1b 定位 | 按了才問、拒絕可選地區、級距距離 | 公開只有級距；就地同意；可清除 | — | 可讀位置表（無 UI，第二期） | — |

## 8. 工項、波次與分工

### 8.1 波次表（業主看得到的成果）

| 波 | 工項 | 內容 | 流程／分支 | 模型 | 前置 | 業主看到什麼 |
|---|---|---|---|---|---|---|
| 1 穩定與信任 | **R0** 推薦碼端點關洞 | §2.3 R0 | Plan Mode `fix/referral-validate-hardening` | Sonnet | Q2-10 確認無匿名消費者 | 無可見變化；枚舉面關閉 |
| 1 | **T1** 登入狀態與安心設計 | §1（含後端 `/profile` 缺口） | 三段式 `feature/auth-state-trust` | Opus 規劃／階段 2，Sonnet 實作 | Q1-1、Q1-2 | 重新整理不閃；斷網不被登出 |
| 2 管理 | **A1a** 稽核＋會員核對面板 | §4.2(1)(2) | 三段式 `feature/admin-audit-and-review` | Opus 規劃／階段 1–2 | Q4-1、Q4-5、Q4-7、Q4-8；面板階段在 S7 後 | 每筆後台操作可查；Sheet 內六區核對 |
| 2 | **A2** 對帳報表 | §4.2(3) | 三段式 `feature/admin-reconcile` | Opus 階段 5／6 | A1a 合併；Q4-2、Q4-6 | 告警次分頁的十項檢查與例外列 |
| 2 | **A1b** 代改資料 | §6 | 三段式 `feature/admin-profile-edit` | Opus 規劃／階段 3 | A1a 合併；Q6-* | 會員詳情「編輯基本資料」 |
| 3 成長 | **P1a** 照片上傳管線 | §3.2A／C | 三段式 `feature/listing-photo-pipeline` | Sonnet | Q3-1、Q3-3 | 選圖即裁、HEIC 可傳、封面 |
| 3 | **R1b** 邀請物件後端 | §2.3 | 三段式 `feature/referral-invitations` | **Opus** | Q2-7；T1 合併 | 無可見變化 |
| 3 | **R1a** 分享面板、落地頁、紀錄 | §2.2、§2.3 | 三段式 `feature/referral-share-flow` | Sonnet | Q2-5（擋開工）、Q2-8、Q2-9；R1b、T1 合併 | 一鍵 LINE；落地頁；邀請紀錄 |
| 3 | **L1a** 位置後端＋刊登表單 | §5.2A／B | 三段式 `feature/listing-location` | Opus 審 RPC／RLS | Q5-1、Q5-2（擋開工）；表單段在 P1a 後 | 刊登可設服務據點 |
| S6 後 | P1b、L1b、T1 首頁一行 | 詳情輪播與容器；首頁排序 UI；`hasBottomNav` | 各一個 `fix/*` Plan Mode PR | Sonnet | S6 合併；L1b 另需 Q5-5 | 輪播；「離我最近」 |
| S7 後 | R1a 入口接線 | 會員中心推薦卡「邀請」、推薦頁頂部 | `fix/*` Plan Mode | Sonnet | S7、R1a 合併 | 2 次點擊到 LINE |
| 最後 | **T1-5c** toast 語氣盤點 | §1.2D | `fix/*` Plan Mode | Sonnet | 波次 3 全合併 | 錯誤訊息一致 |
| 第二期（GitHub issue，不入規格書 §14） | 簡訊通道、LINE Login、個別化 og、地圖點選、對帳排程、admin 漏斗檢視、手動調整（若 Q4-2 不納入）、Email 可改 | — | — | — | — | — |

**在途工項上限 3**（業主每個三段式都要人審一次規劃＋親自打 `/tdd-implement`）。建議起手：R0 → T1 ∥ A1a 的階段 1–3（後端）
∥ P1a。S7 **不等**本計畫任何工項；S8 與驗收站 2–4 時程不受影響。

### 8.2 撞檔矩陣（只撞檔才序列化）

| 檔案 | 動它的工項 | 處置 |
|---|---|---|
| `src/App.tsx`、`Navbar.tsx`、`AuthPage.tsx` | T1（重寫啟動流程）、R1a（路由、選單、落地） | T1 先合併 |
| `CompleteProfile.tsx`、`PaymentCheckout.tsx` | R1a、T1（`/profile` 收斂） | T1 先 |
| `Create/EditServiceProvider.tsx` | P1a、L1a 表單段 | P1a 先 |
| `ServiceProviderManagement.tsx` | P1a（刪除清理、比例）、L1a（更新位置）、S7 | 先合併者定，後者 rebase |
| `ReferralManagement`／`MemberDashboard`／`MyQrEntry` | R1a 入口、S7 | S7 先；R1a 入口在 S7 後 |
| `ReferralTreeView`／`MemberDetailSheet`／`RewardHistory` | A1a 面板段、S7 | S7 先或先合併者定 |
| `AdminConsole`／`AdminDashboard`／`adminCache`／`api-contract.ts` | A1a → A2 → A1b | 序列化 |
| `api/index.ts`、migrations、規格書 | R0／R1b／A1a／A2／A1b／P1a／L1a | 各工項預留 migration 版本區段、rebase 後定號並跑 `check-migration-versions.py`；`api-contract.ts` 按領域分段追加 |
| `HomePage.tsx`、`ServiceProviderDetail.tsx` | S6、P1b、L1b、T1 一行 | 全在 S6 後 |
| `apiClient.ts` | 只有 T1 一行 | — |

### 8.3 裁決 ↔ 工項對照（gating）

| 擋開工 | 裁決 | 工項 |
|---|---|---|
| 是（示意畫面審閱中，§13） | Q2-5 法定揭露 | R1a |
| 已裁決 2026-10-17 | Q5-2 公開精度 | L1a 可開工（Q5-1、Q5-5 開工前裁） |
| 已裁決 2026-10-17 | Q2-10 無匿名消費者 | R0 可開工 |
| 開工前 | Q1-1、Q1-2 | T1 |
| 開工前 | Q4-1、Q4-5、Q4-7、Q4-8 | A1a |
| 開工前 | Q4-2、Q4-6 | A2 |
| 開工前 | Q6-1～Q6-8 | A1b |
| 開工前 | Q3-1、Q3-3 | P1a |
| 開工前 | Q2-7、Q2-8、Q2-9、Q2-2 | R1b／R1a |
| 開工前 | Q5-1、Q5-5 | L1a／L1b |
| 可延後 | Q2-1、Q2-3、Q2-4、Q2-6、Q3-2、Q3-4、Q4-3、Q4-4、Q5-3、Q5-4、Q6-7 | — |

### 8.4 本輪完成定義

六項各有「業主看到什麼」落地（§8.1 右欄）；第二期清單進 GitHub issue；本目錄刪除。

## 9. 驗收與真機責任

每個工項在 PR 描述附「可勾清單」；**真機項目全由業主在 develop 預覽站驗**（Claude web session 無真機），每項列環境（LINE
內建 iOS／Android、Safari、Chrome）、測試帳號與測試刊登：

| 工項 | 自動化證偽 | 真機 |
|---|---|---|
| T1 | e2e：`/profile` 延遲 2 秒時首繪起 DOM 變更零次「登入」＋CLS=0；反向案例 | 重新整理 20 次＋Slow 3G 5 次不閃；斷網不登出 |
| R0 | deno：無 token 401、限流 429 | — |
| R1a／R1b | `line.me/R/share` 導向與訊息；落地頁三態；紀錄狀態轉換 | LINE 內建按鈕開好友選擇器；Safari／Chrome 喚起；跨瀏覽器完成註冊歸屬不丟 |
| P1a／P1b | 2×2 色塊驗裁切；無 EXIF；一張失敗其餘保留 | iPhone HEIC／48MP／方向 6；LINE iOS／Android 裁切手勢 |
| A1a／A2／A1b | 列舉測試每寫入一筆 audit；合法特例矩陣不報；在途提領拒改 | 桌機對帳走一輪；手機 Sheet 首屏四事實 |
| L1a／L1b | anon 讀位置表 0 列；防三角定位；拒絕→選地區 | LINE 內建瀏覽器定位權限行為；覆蓋率（有位置刊登占比） |

## 10. 不做什麼（本輪）

- 不換帳號識別（phone-first）、不做簡訊 OTP、不代填他人手機。
- 不做即時位置追蹤、不存位置歷史、不公開座標、不做地圖。
- 不做獨立大頭照欄位；不用 Supabase 圖片轉換；不批次回填舊照片。
- 不改發獎、換線、提領、推薦王的任何函式；對帳只讀。
- 不引入狀態庫、UI 框架、地圖套件；不做會員自助修改資料頁；不稽核敏感資料讀取（除非 Q4-1 另裁）。

## 11. 風險與回滾

| 風險 | 緩解 | 回滾 |
|---|---|---|
| 首繪提示與真實狀態不一致（換帳號、撤權、他裝置登出） | 提示只影響頁首占位；清除時機六種；`/profile` 回來即以其為準 | 關掉讀提示（一行旗標） |
| `degraded` 把真的失效會員留在站內 | 只對 transient 重試；401 類先確認再登出；上限 5 次 | 同上 |
| 後端 `/profile` 改錯誤碼影響其他呼叫者 | 只動 `/profile`；8 處 fetch 已收斂到 `fetchProfile` | 還原錯誤碼對照 |
| 邀請歸因錯人 | 碼為權威、token 只歸因、referrer 一致才寫 | 刪紀錄顯示，連結仍可用 |
| 裁切／壓縮在特定瀏覽器失敗 | 解碼失敗明確文案；壓縮失敗退回原檔上傳（仍受 5MB） | 旗標關閉裁切 |
| 位置資料外洩 | 表不對 anon 開放、網格化＋級距、限流、防三角定位測試、RLS probe | drop 距離查詢→前端退回縣市排序（feature-detect） |
| 核對面板重構推薦網絡端點誤傷會員端 | 先以 Deno 測試釘住再參數化 | 保留舊函式路徑 |
| 代改資料改錯身分證 | diff 確認＋再輸入＋理由＋audit＋在途提領拒改 | 依 Q4-8 的原值還原或人工 |
| 三條管線部署順序（Pages／Edge／migration） | migration 先於前端合併；前端 feature-detect | 前端旗標 |
| 新失敗模式無可觀測性 | audit 失敗、degraded 進入率、邀請 429 率寫 `system_alerts` | — |
| A1 建在未人工驗收的 S3／S4／S5 上 | 驗收站 2、3 延到 S7 後是業主既定；A1a 面板段排 S7 後 | — |
| 邀請漏斗放大註冊量撞 Email 寄信配額 | 活動前確認 SMTP 限流、寄信失敗告警 | — |

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

## 13. 業主裁決紀錄（v2 之後，逐題累積；v3 回填時併入各節）

| 日期 | 題 | 裁決 | 連帶 |
|---|---|---|---|
| 2026-10-17 | Q5-2 公開精度 | (a) 1 km 網格＋級距，**不存精確點** | L1a 擋開工項解除；§5.2B 表的 lat／lng 欄改為只存 grid_*（v3） |
| 2026-10-17 | Q2-10 後半 無匿名消費者 | 業主確認 repo 外沒有東西匿名呼叫 `/referrals/validate/:code`、`/listings/verify-referral-code` | R0 可開工（Plan Mode `fix/referral-validate-hardening`） |
| 2026-10-17 | Q2-5 法定揭露句與獎金字樣 | 待：業主要求先看「做在哪」的示意畫面 | 示意畫布 https://claude.ai/artifact/V9fhyw3HzcSDVttMu9ptei（八張：總圖、推薦管理頁、LINE 訊息、邀請卡、付款成功頁、落地頁正常態與失效態、註冊第 2 步；黃框＝揭露句位置、灰框＝獎金字樣位置） |
| 2026-10-17 | Q2-10 前半 退款口徑 | 待：業主指示「以既有法務文件內容為主」，看過示意畫面再定落地頁怎麼寫 | 讀碼釐清：三份既有文件各管一份契約、不衝突——《服務條款》第六條（年費的刊登服務是線上數位服務，付費前明示同意後不適用消保法七日解除權）；《傳銷商參加契約》第十二、十三條與《事業手冊》2-1-1（加入推薦計畫後 30 日內可書面解除、全額退款扣已付獎金，之後終止依未使用月數扣 10%）。規格書 §4.1「付款成功不允許退款」只講了年費那一半，v3 要補一句區分。落地頁的「費用與退費」段建議只引用＋連結，不重述條文（示意畫布藍框） |
