# 平台信任感與成長——六項新需求總綱

<!-- plans-keep: 跨 session 施工鷹架（§3 的七個工項尚未開工，順序與 platform-uiux-redesign 的 S6–S8 交錯）；退場條件＝七個工項全部合併、決策升級進規格書／ui-ux-guidelines 後，收尾時整個目錄刪除 -->

> 業主 2026-10-16 提出六項需求（登入狀態閃爍、推薦分享、被推薦者註冊、刊登照片、管理者核對、定位、管理者代改資料），
> 要求「系統穩定優先、使用者信任且流暢、符合主流直覺的 UI/UX」一併規劃。本檔是**總綱**：每項先講現況與根因（五個唯讀
> 探查 agent 讀碼得出，附檔案:行號），再給設計與建議、穩定性取捨、分期與測試、需要業主裁決的開放問題。業主核對後，
> 三段式工項各自 `/plan-feature <slug>` 落細部規劃書；輕量工項走 Plan Mode。
>
> 業主附的影片本 session 讀不到；第 1 項依文字描述（右上角先出現登入／刊登鈕、偵測到登入後才換）規劃，與讀碼事實一致。

## 0. 三條貫穿原則（與 platform-uiux-redesign 的四個決策相容）

1. **沒確認的狀態不畫成已知狀態**：不知道有沒有登入就不畫「登入」鈕；不知道資料是否同步就不畫 0；不知道定位就不排距離。
   這是「系統不穩」觀感的共同根因——畫面先給一個答案、幾百毫秒後再改口。
2. **先改呈現與資料流，不動金流與會籍規則**：六項裡碰到點數、推薦邊、付款的地方（核對視圖、代改資料、邀請紀錄）一律
   **只讀**或**可稽核的單點寫入**，不改既有的發獎、換線、提領函式（規格書 §7–§10 不變）。
3. **主流樣式不等於新框架**：裁切用 IG 的手勢與比例、分享用 LINE 的分享面板、定位用「離我最近」排序鈕——都在既有
   React Context／Tailwind／Radix 內做，不引入狀態庫與 UI 框架（延續 platform-uiux-redesign plan.md §5）。

## 1. 登入狀態閃爍與「信任感」

### 1.1 現況與根因（讀碼事實）

- 首次繪製必然是未登入版：`user` 初值 `null`、`isLoggedIn = !!user`（`src/App.tsx:119,131`），Navbar 只看 `isLoggedIn`、
  不看 `isLoadingUser`（`src/components/Navbar.tsx:32,101-109`）。22 個讀 `UserContext` 的檔案裡只有 `ProtectedRoute` 與
  `AdminRoute` 讀 `isLoadingUser`。
- 之後才換版：首次 render 與 paint → effect → `supabase.auth.getSession()` → 原生 fetch `/profile` → `setUser`
  （`App.tsx:133-187`）。`/profile` 對已付款會員還依序 await 三支 repair RPC（`supabase/functions/api/index.ts:414-417`），
  且不在 ETag 讀端點清單（`:129-137`）。冷啟動可能對同一 session 打兩次 `/profile`（auth-js 初始化廣播 `SIGNED_IN` 與
  effect 各一次，`loadedUserIdRef` 在第一次回來前是 null；推論）。
- 同一根因的其他位置：BottomNav 載入中不畫、登入後整個冒出（`BottomNav.tsx:32`）；`main` 的底部 padding 登入後才加
  （`App.tsx:296`）；首頁搜尋 FAB 登入後上移（`HomePage.tsx:353,621-623`）；`MaintenanceBanner` 自己再查一次 session、
  淡入時把內容往下推（`MaintenanceBanner.tsx:58-99`）；已登入者在 `/login` 按 F5 先看到登入表單再被導走
  （`AuthPage.tsx:89-94`）；`ProtectedRoute`／`AdminRoute` 是全頁置中 spinner（違反 ui-ux §5）；冷載受保護頁依序出現
  空白 → 未登入 Navbar → 守衛 spinner → RouteLoader spinner → 頁內骨架，四種等待畫面。
- 更深的一層：`localStorage.user` 是 write-only（三處寫、全 repo 無 `getItem('user')`；`App.tsx:252-254` 的註解說會讀回，
  與程式不符）。Supabase session 本身存在 localStorage `sb-<ref>-auth-token`，同步可讀，但沒有任何程式在首繪前讀它。
- 會讓人更不安的既有行為：`/profile` 非 401 類失敗（5xx、斷網）時 `user` 維持 null、`isLoadingUser` 變 false、session 還在
  → 畫面變成未登入版，且 focus 重抓閘在 `isLoggedIn` 不會啟動（`App.tsx:152-154,172-174,269-276`；規格書 §14 #8 記了後端
  那一半）；session 過期一律靜默導回 `/login`、不說原因（`App.tsx:221-230`）；登出先 `setUser(null)` 讓受保護頁瞬間導
  `/login` 再 `navigate('/')`（`Navbar.tsx:58-85`）；`ErrorBoundary` 只包 `<Routes>`，Navbar／BottomNav／Banner 在邊界外。

### 1.2 設計

**A. 三態登入狀態，首繪用本機提示（推薦）**

- `UserContext` 的登入狀態從「null／有 user」改成三態 `unknown | anonymous | authenticated`，外加 `degraded`（有 session
  但 `/profile` 暫時失敗）。守衛邏輯不變（`ProtectedRoute`／`AdminRoute` 仍等確認；授權判斷一律以 `/profile` 回應為準）。
- **首繪提示**：登入成功、`/profile` 成功時寫一個小鍵 `uknow:auth-hint`（只存 `{ initial: 名字首字, at }`，不存 email、
  不存 isAdmin）；登出、401／404／410 清掉。App 第一個 render 同步讀它：有提示 → 頁首畫「頭像占位（首字）＋ 選單鈕
  骨架」、BottomNav 位置保留、`main` padding 先加；沒有提示 → **直接畫訪客版**，訪客（P1 關鍵路徑）不等任何請求。
  提示只影響呈現，不給任何權限；管理後台連結與待處理 badge 一律等 `/profile` 確認後才出現（避免反向閃爍）。
- 為什麼不用「一律中性直到確認」：訪客會看到頁首空白幾百毫秒，首頁是「未登入也要完美」的路徑（plan.md P1）。
  為什麼不用 Supabase 的 `sb-*` key 當提示：key 名依專案 ref、JSON 形狀是函式庫內部契約；自家一個小鍵更穩。
- **`degraded`**：有 session 而 `/profile` 回非 401 類失敗 → 不畫訪客版，頁首維持占位、`ProtectedRoute` 畫「正在重新連線…」
  骨架＋自動重試（指數退避 1s→2s→4s→8s，最多 5 次，之後留一顆「重試」）。只有 401／404／410 才登出。與規格書 §5.3
  「閘門擋的是已知不合格，不是尚未確認」同一精神搬到前端；同時關掉 §14 #8 的前端那一半（後端那一半仍另案）。
- **請求去重與預熱**：`loadUserProfile` 以 `requestDedup` 包住（冷啟動只打一次 `/profile`）；提示存在時立刻預熱會員區
  chunk（`lazyWithRetry` 的 preheat 已有先例 `MyQrEntry.tsx:16-20`），讓 `/profile` 與 chunk 下載並行而不是序列。
- **守衛與路由載入態改骨架**：`ProtectedRoute`／`AdminRoute`／`RouteLoader` 三個 spinner 換成同一個「頁骨架」（頁首已
  在，內容區畫與目標頁同形的骨架，受保護頁最多只看到一種等待畫面）。`MaintenanceBanner` 改吃 `UserContext`（不再自己
  查 session）、以 `grid-rows-[0fr→1fr]` 展開而不是淡入後推擠。
- **登出順序**：先 `navigate('/')` 再清 user（或 `startTransition`），受保護頁不再閃到 `/login`。
- **已登入者開 `/login`**：有提示就畫中性骨架、確認後導走，不再先畫表單。

**B. 同一主題的其他「安心設計」**（本工項順手做，各是一小段）

| 位置 | 現況 | 改法 |
|---|---|---|
| session 過期 | 靜默導 `/login` | 導向後在登入頁上方一行 `StatusCallout`：「為了安全，登入已逾時，請重新登入」（四契約第 3 條：可復原的訊息要給下一步） |
| 斷網 | 每個請求各自報錯 | `navigator.onLine` ＋ `online/offline` 事件 → 頁首下方一條「目前離線，恢復連線後會自動重試」；恢復時觸發一次 focus 重抓 |
| 錯誤 toast 語氣 | 66 處 `'error'` 型 toast、32 處含「失敗／錯誤」 | 盤點後統一成「發生了什麼＋下一步」（例「照片還沒傳上去，請再試一次」），不吐後端原文；盤點表進規劃書階段 2 |
| `ErrorBoundary` | 只包 `<Routes>` | 外再包一層只包頁首與導覽（出錯時畫最小頁首），避免整頁白 |
| chunk 404（部署後舊版） | 重試一次→整頁 reload 一次→白頁錯誤 | reload 前先寫 `uknow:chunk-reloaded`（已有）；失敗畫面改成「有新版本，請重新整理」而不是「頁面發生錯誤」 |
| 載入文案 | 「載入中...」（詳情頁、結帳頁） | 詳情頁由 S6 處理；結帳頁改骨架（四契約已要求步驟可重入，載入態也該一致） |

### 1.3 穩定性與架構

- 不動 `apiClient` 的 401 處理、不動 `AdminRoute` 的授權判斷（platform-uiux-redesign plan.md §5 的「不動權限判斷」仍成立）。
- `appShell.test.ts` 以原始碼正則釘住 App.tsx 的幾個結構（`useRevalidateOnFocus`、`refreshUser`、`ErrorBoundary resetKey`、
  `importWithRetry`、lazy 清單）——改 App.tsx 時先讀它；14 支測試 `vi.mock('../App')` 只替身 `UserContext`，新增的匯出
  在這些測試裡不存在，三態要加在 `UserContext` 的值裡而不是新匯出。
- e2e 契約：`e2e/steps/line_browser_steps.py:86` 要求匿名時 10 秒內看得到「立即刊登」連結（維持）；mocked e2e 的
  `/profile` 即時回應所以看不到閃爍，要新增一條「`/profile` 延遲 2 秒時，頁首不出現『登入』連結」（用
  `backend_api_mock` 的 deferred 機制）；journey 的 login builder 依賴 AuthPage「已登入自動導向」（維持）。
- 與 S6 的交集只有 `HomePage.tsx:353` 的 `hasBottomNav={isLoggedIn}`：改成讀三態（`unknown` 且有提示時視為有導覽列）。
  S6 已開工就在 S6 合併後做這一行，其餘檔案不重疊。

### 1.4 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `UserContext` 三態＋提示鍵（純函式 `authHint.ts` 讀寫、清除時機） | vitest node | 寫入／讀取／清除；壞 JSON 回 null；storage 例外不丟 |
| 2 | Navbar／BottomNav／`main` padding／Banner 依三態渲染 | vitest jsdom（Navbar.test 補 `unknown`／`anonymous`／`authenticated` 三組） | 有提示時第一個 render 沒有「登入」「立即刊登」；沒提示時立刻有；admin 連結只在 `authenticated && isAdmin` |
| 3 | 啟動流程：去重、`degraded` 自動重試、401 類才登出 | vitest jsdom（App 啟動測試，mock `getSession` 與延遲的 `/profile`） | 冷啟動 `/profile` 恰一次；5xx 時不畫訪客版、重試後成功；404 登出 |
| 4 | 守衛與路由載入態改骨架、登出順序、`/login` 已登入者 | vitest jsdom ＋ e2e `route_guards.feature` 補兩條 | 受保護頁最多一種等待畫面；登出不經 `/login` |
| 5 | 安心設計六項（過期說明、離線條、toast 盤點、ErrorBoundary 外層、chunk 文案、結帳骨架） | vitest ＋ e2e 一條離線情境 | 逐項可見 |
| 6 | 文件：ui-ux-guidelines §5 補「登入狀態三態與首繪提示」一條；規格書 §3 守衛段補「未確認≠未登入」；§14 #8 改寫為只剩後端半 | check-spec-drift 綠 | — |

重量：中（一個 session，三段式落檔——動到全站殼層，階段 ≥3）。模型 Sonnet 實作；階段 3 的啟動流程建議 Opus 規劃審查。

### 1.5 開放問題（請業主裁決）

- [ ] Q1-1 首繪策略：**A 本機提示（推薦）** / B 一律中性直到確認（訪客頁首會空白幾百毫秒）。
- [ ] Q1-2 `/profile` 熱路徑上的三支 repair RPC（`index.ts:414-417`）是否移出（改成每個 session 第一次或排程對帳）：這是後端
  金流相鄰的改動，建議另開 Opus 工項，不綁本項。
- [ ] Q1-3 `degraded` 的重試上限與文案是否接受「正在重新連線…」（不說「失敗」）。

## 2. 推薦：分享動線（2-1）與被推薦者註冊（2-2）

### 2.1 現況與根因

**分享動線**
- 入口只掛兩處：會員中心「會員資訊」卡（在四張統計卡與訂閱卡之後，`MemberDashboard.tsx:348`）與推薦管理首列
  （`ReferralManagement.tsx:119`）。手機路徑：BottomNav「推薦」→「我的 QR」→「邀請好友」= 3 次點擊（會員入口在長頁下方）；
  桌機 4 次。付款成功頁沒有分享 CTA（`PaymentResult.tsx:644`）。
- 分享本身在 LINE 內建瀏覽器幾乎失效：`shareReferralInvite` 對 in-app 瀏覽器**一律直接複製**、不叫分享面板
  （`src/utils/referralInvite.ts:79-82`）；非 in-app 才用 `navigator.share`，且刻意不帶 `url` 只帶 text。沒有「複製連結」鈕
  （測試釘死 `InviteFriendPanelContent.test.tsx:44`）；沒有 LINE 專屬分享；邀請卡 PNG（`inviteCardImage.ts`）上沒有任何
  說明文字或行動呼籲；`index.html` 無 og:/twitter: meta，連結貼到 LINE 沒有預覽圖文（推論）。
- 命名不一：BottomNav「推薦」、Navbar「推薦管理」、規格書 §3「推薦網絡」。

**被推薦者註冊**
- 連結只有 `${base}/register?ref=<code>` 一種（`referralInvite.ts:31-33`）；落地頁是一般登入／註冊頁，**不顯示任何邀請脈絡**
  （誰邀的、推薦碼已帶入、接下來幾步）。碼存 localStorage `pending_referral_code`（無 TTL、登出不清、再開另一條會覆蓋），
  到 Step 2 才自動填入並驗證（`CompleteProfile.tsx:185-195`）。
- 四步：Email 檢核 → 密碼 → **Email OTP** 6 碼（Supabase Auth，前端倒數 180 秒）→ 完善資料（姓名、身分證、生日、手機、
  推薦碼、條款）→ PayUni 年費 $1,200。專案**沒有簡訊供應商、SMS 環境變數或 phone auth**；手機只是 profile 欄位、只驗格式。
- 推薦關係在 Step 2 寫 `profiles.referred_by_*`，但 `referral_edges`、三代獎勵、任務 +1 要到首次付款成功才產生；**未付款的
  被推薦者在推薦者畫面完全不可見**，沒有「待付款／待註冊」狀態，推薦者無從追蹤。沒有任何邀請紀錄表。
- 兩個推薦碼驗證端點無登入、無限流，回推薦人真實姓名與刊登名（`index.ts:852-874,978-1002`）；碼是步長 1 的流水號
  → 可用連續整數枚舉已付費會員真名（停權者除外）。這是本輪必須一起關的洞。
- 法遵：事業手冊 4-1-3「嚴禁…未經本人同意，擅自為其申請或加入」（`src/content/businessManual.ts:205`）；多層次傳銷管理法
  第 11 條「招募時應表明係從事多層次傳銷」（`:419`）。現行邀請訊息與邀請卡沒有揭露字樣（是否需要由業主與法務判斷）。

### 2.2 設計：分享（2-1）

**A. 一鍵到 LINE（主流做法）**
- 新增 `shareToLine(message)`：`https://line.me/R/share?text=<encodeURIComponent(訊息)>`，同分頁開啟（repo 規則禁止
  `target=_blank`／`window.open`，走既有 `openExternalLink`）。在 LINE 內建瀏覽器會直接打開好友選擇器；在 Safari／Chrome
  會喚起 LINE app。這是把「複製→切到 LINE→貼上」三步變一步的關鍵。
- 分享面板的順序：**LINE 分享**（主按鈕）、**複製連結**（新增；只複製連結，貼到任何地方都能點）、其他 App（Web Share，
  有就顯示）、下載邀請卡（維持）。`navigator.share` 改成帶 `url`（LINE 以外的分享面板會自動抓預覽）。
- 邀請訊息改成「有事可做」：「{名} 邀請你加入 Uknow 專業服務平台 👉 {連結}（推薦碼 {碼} 已幫你帶入）」；邀請卡加一行
  「掃描加入 Uknow・推薦碼 {碼}」與品牌字。

**B. 入口搬到高頻位置（一次點到）**
- 推薦管理頁（`/referrals`）最上方常駐「邀請好友」區：QR 小圖＋推薦碼＋〔LINE 分享〕〔複製連結〕〔更多〕，推薦樹在它下面。
  BottomNav「推薦」不改路由（五格契約不動），點進去就是分享。
- 會員中心推薦卡（S7 要改成「總數＋狀態徽章」）加一顆次要動作「邀請」；Navbar 頭像選單加「邀請好友」。
- 付款成功頁加一張「邀請好友，三代各得 100 P」卡（付完錢是意願最高的時刻），按鈕走同一個分享面板。
- `/dashboard/qr` 維持（會員驗證碼與掃描還在那裡），邀請分頁加〔複製連結〕。

**C. 連結預覽**
- `index.html` 加靜態 og:title／og:description／og:image（品牌卡 1200×630）；SPA 所有路由共用同一份，LINE／FB 貼連結至少有
  圖文。每位推薦者個別化預覽（「〇〇 邀請你」）需要 Cloudflare Pages Function 在 `/register` 注入 meta——列為選配。

### 2.3 設計：被推薦者從連結到完成（2-2）

**先回答「Amway 式：推薦者填對方手機、對方收簡訊、點開就預填」怎麼做**

那條路的三個組件是：(1) 簡訊通道、(2) 一個「邀請」物件把推薦者與預填資料綁在 token 裡、(3) 落地頁讀 token 預填。
在本專案的代價：

| 組件 | 需要 | 代價與風險 |
|---|---|---|
| 簡訊通道 | 供應商（台灣：三竹／Every8d；或 Twilio）＋ Edge Function 寄送＋配額 | 每則成本、SMS pumping 濫用面、供應商金鑰管理；目前 OTP 是 Email，加簡訊是第二套通道 |
| 推薦者填對方手機 | 第三方個資由推薦者提交 | 事業手冊 4-1-3 明文禁止未經同意代為申請；個資法上推薦者蒐集他人手機再交平台，平台成為共同蒐集者；被推薦者收到陌生簡訊的信任反而更低 |
| 預填手機並直接註冊 | 手機要成為帳號識別（phone auth） | 現行帳號識別是 Email＋密碼＋Email OTP；改 phone-first 牽動登入、重設密碼、journey 全套——是整個 auth 的重做 |

**建議：方案 A「邀請物件＋落地頁＋推薦者可追蹤」，不做簡訊、不代填手機**（被推薦者自己輸入 10 碼手機只要 5 秒，
省下的不是輸入而是「不知道這是什麼、要做幾步、推薦碼有沒有帶到」的疑慮）。

- **邀請物件**：新表 `referral_invitations`（id、referrer_user_id、token（不可枚舉、32 bytes base64url）、channel
  （line／copy／share／qr）、created_at、opened_at、registered_user_id、registered_at、paid_at、expires_at 90 天）。
  推薦者按分享時 `POST /referrals/invitations` 取 token，連結改成 `/invite/<token>`（舊 `?ref=` 連結**繼續有效**，走原路）。
  被推薦者開連結 → `GET /referrals/invitations/<token>`（公開、限流）回「推薦者顯示名（遮罩規則同二代）＋推薦碼」並記
  `opened_at`；Step 2 綁定時填 `registered_user_id`；付款成功時由 `apply_referral_side_effects` 之外的一支小函式填 `paid_at`
  （**不改 `apply_referral_side_effects`**，用 `referral_edges` 的 insert trigger 或 Edge 在付款回呼後補寫；兩者皆只寫邀請表）。
- **邀請落地頁** `/invite/<token>`（未登入可看）：一張卡——「{推薦者} 邀請你加入 Uknow」、一句平台是什麼、「推薦碼 {碼} 已
  幫你帶入」chip、年費 $1,200 透明寫出、三步進度（驗證 Email → 基本資料 → 付年費）、主鈕「開始註冊」（進既有 Step 0，Email
  欄 autofocus）、次鈕「已有帳號？登入」。token 與碼同時存進既有 `pending_referral_code`（相容）與新的 `pending_invitation`。
  已登入者開連結：顯示「你已經是會員了」＋回會員中心，不覆寫自己的推薦碼。
- **推薦者可追蹤**：推薦管理頁「邀請好友」區下方「邀請紀錄」：每筆顯示狀態（已送出→已開啟→已註冊→已付費）與時間、
  〔再傳一次〕（同一 token 重送）。**付費前不顯示對方姓名**（與推薦樹「未付款不可見」一致，避免推薦者催逼；業主可改裁）。
  這是推薦者最缺的回饋：現在發出去等於石沉大海。
- **註冊漏斗本身的減阻**（不改帳號識別）：
  1. 四步共用一個頂部步驟列「1 驗證信箱・2 基本資料・3 付年費」（契約第 2 條的可見化）；OTP 頁寫「驗證碼寄到 {email}」並
     給「換一個信箱」。
  2. **身分證字號延後到第一次需要時再填**（業主裁決 Q2-4）：`verifyNationalId` 只用在會員驗證、提領、查收、領獎四處
     （`index.ts:3137,3294,3342,4066`），註冊與付款都不用它。改成在「加入推薦計畫」或首次提領時填（那兩處本來就要交證件），
     Step 2 只剩姓名、生日、手機、推薦碼——對陌生的被推薦者少掉最嚇人的一欄。規格書 §4.2 與 §14 #1 同步改。
  3. Step 2 的推薦碼欄位在有邀請脈絡時改成唯讀 chip「{推薦者} 的推薦碼 {碼}」＋「換一個」小連結（現在是可編輯欄位＋驗證鈕，
     被推薦者會疑惑「要不要按驗證」）。
  4. 草稿與 `pending_*` 加 TTL（90 天）與登出清除；再開另一條邀請連結時提示「改用 {新推薦者} 的邀請？」而不是靜默覆蓋。

**方案 B（選配，業主裁決 Q2-3）：簡訊只當「送達通道」**：推薦者輸入對方手機 → 需勾「我已取得對方同意」→ 後端以供應商寄
含 `/invite/<token>` 的簡訊，每人每日 10 則、全站配額、對方可回覆停止。帳號識別仍是 Email。建議列為第二期，先看方案 A 的
邀請→付費轉換率再決定要不要付簡訊錢。**方案 C（phone-first 帳號）**不建議本輪做：重做 auth 的風險與 journey 全套重寫，
收益只是少填一個 Email。

**一起關的洞**：兩個推薦碼驗證端點加限流（沿用 `bump_rate_limit`，10 次/300 秒/IP）、回應改遮罩名（「王○明」）＋刊登名
不回；邀請 token 的查詢同樣限流。流水號本身不改（規格書 §7.1 的口述需求）。

### 2.4 穩定性與架構

- 新表只有 `referral_invitations`，與 `referral_edges`／`reward_transactions`／`task_progress` **零耦合**；`paid_at` 回填失敗
  只影響邀請紀錄顯示，不影響發獎。RLS：推薦者可讀自己的；公開讀取只經 Edge（token 查詢），表本身不對 anon 開放。
- 前端：`referralInvite.ts` 擴充（`shareToLine`、`buildInviteLink(token)`、pending TTL）；新頁 `InviteLanding`（lazy）；
  `InviteFriendPanelContent` 改成共用的「分享面板」元件，四個入口共用。`repoHygiene.test.ts` 的 `tone="guide"` 白名單
  只准四檔——「邀請好友」在 ui-ux §12.11 歸次要動作；若業主要升為引導鈕（Q2-1），白名單與 §12.11 一起改。
- 與 platform-uiux-redesign 的交集：S7 會重做會員中心四卡與推薦管理橫幅（`/referrals`）。本項的「推薦管理頁最上方邀請區」
  與「會員中心推薦卡的邀請動作」**併入 S7 的開工 prompt**（同一頁兩個 session 碰會撞）；其餘（分享面板、LINE、落地頁、
  邀請物件、付款成功頁 CTA、驗證端點限流）不與 S6／S7 重疊，可以先做。
- 測試契約要改的：`InviteFriendPanelContent.test.tsx:44`「沒有複製連結鈕」→ 反轉；`referralInvite.test.ts` 的連結格式
  （新增 token 形式、舊形式保留）；e2e must-keep 三條註冊情境名不改，新增 `invite_landing.feature`；journey 補一條
  「從邀請連結完成註冊與付款，邀請紀錄變已付費」（目前 journey 沒有任何連結路徑情境）。

### 2.5 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 驗證端點限流＋遮罩名（先關洞） | deno test | 第 11 次 429；回應無真名、無刊登名；停權仍不洩漏 |
| 2 | 分享面板元件：LINE 分享、複製連結、Web Share 帶 url、邀請卡文案 | vitest jsdom | in-app 瀏覽器按 LINE 鈕得到 `line.me/R/share?text=`；複製連結只含連結 |
| 3 | 邀請物件：migration、`POST/GET /referrals/invitations`、opened／registered／paid 回填 | deno test ＋ sql | token 不可枚舉；過期 token 404；paid_at 由付款路徑回填且發獎不受影響 |
| 4 | 落地頁 `/invite/<token>`＋Step 2 唯讀 chip＋pending TTL | vitest jsdom ＋ e2e `invite_landing.feature` | 落地頁顯示推薦者與碼；註冊到 Step 2 碼已鎖定；已登入者不覆寫 |
| 5 | 推薦者的邀請紀錄區（狀態、再傳一次） | vitest ＋ e2e | 四種狀態各一筆的呈現；再傳一次重用 token |
| 6 | 付款成功頁 CTA、Navbar 選單入口、og meta | vitest ＋ e2e 溢版巡檢 | 一次點擊到分享面板 |
| 7 | （裁決後）身分證延後到首次需要；步驟列 | vitest ＋ e2e ＋ journey f00／f10 builder 同步 | Step 2 無身分證欄；加入推薦計畫／提領前補填 |
| 8 | 文件：規格書 §4.1–4.2、§7.1 新段「邀請物件」、§14 #1；ui-ux §12.11／§12.13 | check-spec-drift | — |

重量：中偏重（動註冊漏斗與新表；三段式落檔）。階段 1 可以今天就做（`fix/*`，半小時）。

### 2.6 開放問題（請業主裁決）

- [ ] Q2-1 「邀請好友」是否升為引導鈕（品牌色實心，一頁一顆的優先序改成 續訂＞邀請好友＞加入推薦計畫＞確認收款）：
  **推薦不升**，維持次要樣式但放在頁面頂部常駐區（版位比顏色有效）。
- [ ] Q2-2 邀請紀錄是否在付費前顯示對方姓名：**推薦不顯示**（只顯示狀態與時間）。
- [ ] Q2-3 簡訊通道（方案 B）：**推薦第二期**，先量方案 A 的轉換。
- [ ] Q2-4 身分證字號延後到首次需要時再填：**推薦做**；代價是規格書 §4.2 改、journey builder 改。
- [ ] Q2-5 邀請訊息是否加法定揭露句（多層次傳銷管理法第 11 條）：法務判斷，本規劃不代決；技術上只是文案常數。
- [ ] Q2-6 個別化 og 預覽（Pages Function）要不要做：**推薦不做**，靜態品牌卡夠用。

## 3. 刊登照片：上傳、裁切、呈現

### 3.1 現況與根因

- 鏈路是「原檔 multipart → Edge Function（只驗 MIME 與 5MB，`index.ts:4103-4143`）→ service_role 寫 public bucket → 回
  public URL → 前端把 URL 陣列寫進 `listings.photos`」。**沒有壓縮、裁切、縮圖、EXIF、HEIC 處理，沒有本機預覽**
  （上傳完才顯示），沒有進度與重試，`Promise.all` 一張失敗整批失敗（`CreateServiceProvider.tsx:202`）。
- 所以「太大不能上傳要自己壓」是必然：現代手機原圖 3–8 MB，5MB 上限直接擋；iPhone 預設 HEIC 在部分瀏覽器不會自動轉
  JPEG，落入「只支援 JPG、PNG、WEBP」錯誤（repo 零 HEIC 處理）。後端錯誤訊息還讀不到（後端回 `{error:'字串'}`、前端讀
  `.error?.message`，`:195`），使用者永遠只看到「上傳失敗」。
- 「不能決定顯示哪一塊」：儲存的是原圖，各處用 CSS `object-cover` 置中裁切——首頁照片牆與卡片是正方形、詳情頁主圖是 16:9
  `object-contain`（有黑邊）、桌機卡 16:9、縮圖 80px 正方形。同一張圖在五個地方被裁成不同樣子，使用者無從控制。
- 「第一張是封面」只是 `photos[0]` 慣例，沒有重排與指定封面的 UI；沒有「大頭照」概念（profiles 無圖片欄、Navbar 頭像是
  首字）。詳情頁三張縮圖點擊切換、無滑動無鍵盤（`ServiceProviderDetail.tsx:141-155`）。
- 其他：Edit 頁沒有前端大小檢查；移除照片與刪除刊登都不清 Storage（孤兒物件）；`ImageWithFallback` 一張失敗後切縮圖仍顯示
  fallback（不隨 src 重置）；全站 `<img>` 無 `loading`／寬高（CLS）。
- 可用的授權：服務條款十之一已授權「技術性編輯（含裁切、壓縮、格式轉換）」（`termsOfService.ts:48-49`）。

### 3.2 設計（貼近 IG／交友軟體）

**A. 選圖 → 裁切 → 壓縮 → 上傳，全在手機瀏覽器內完成**
1. 選圖：`accept="image/*"`（維持）；解碼用 `createImageBitmap(file, { imageOrientation: 'from-image' })`，失敗（Android
   Chrome 的 HEIC）才顯示「這張照片的格式這個瀏覽器讀不了，請改用 JPG，或在手機相機設定選『最相容』」。iOS Safari 原生能顯示 HEIC，
   解成 bitmap 後畫進 canvas 即可轉 JPEG（真機驗證列入階段 1），iPhone 使用者不再被擋。
2. 裁切（IG 手勢）：固定取景框，雙指縮放、單指拖曳、雙擊重置；比例固定 **1:1**（首頁與卡片都是正方形，封面即大頭照），
   第 2、3 張同樣 1:1（三張同比例，詳情頁輪播不跳高度）。裁切框即「顯示哪一塊」。
3. 壓縮：輸出 JPEG，最長邊 1600px、品質 0.82，目標 < 600 KB；輸出前後顯示「已自動縮小至 xxx KB」。5MB 上限留在後端當安全網。
4. 上傳：每張獨立進度與重試；選完立刻用 objectURL 顯示本機預覽（不等上傳）；已傳成功的 URL 寫進表單草稿（sessionStorage，
   補進 multi-step-flow-recovery 的候選清單），F5 不再全丟。
5. 封面：預設第一張；每張有「設為封面」；長按拖曳排序（桌機拖曳、手機上下箭頭亦可）。
- 元件：`PhotoPicker`（Create／Edit 共用；Edit 補大小與格式檢查，常數只有 `constants.ts` 一份）。裁切 UI 用 `react-easy-crop`
  （觸控手勢成熟、十幾 kB gzip 以內，實際數字在階段 1 量），**在 Create／Edit 的 lazy chunk 內動態載入**，不進首頁 entry；壓縮用自家 canvas 工具
  （無依賴）。bundle 預算（`scripts/check-bundle-budget.mjs`：entry 1000/310 kB、總 JS 1600 kB）要先量再定，超標時在 PR 說明。

**B. 詳情頁輪播（S6 之後）**
- 主圖區改 1:1（與卡片同比例、無黑邊），CSS `scroll-snap` 橫向輪播（不用套件）、底部圓點、鍵盤左右、點主圖開全螢幕
  lightbox（含縮放，可用瀏覽器原生 pinch）。縮圖列桌機保留、手機隱藏。alt 維持 `{名稱} - 圖片 N`（e2e 契約）。
- `ImageWithFallback` 隨 src 重置、加 `loading="lazy"`、`decoding="async"`、寬高屬性；首頁兩套 grid 同時掛載的雙 `<img>`
  改成只掛當前檢視模式（S6 若已處理則略）。

**C. 後端與 Storage 清理**
- `POST /listings/upload-photo` 維持；新增 `DELETE /listings/photos`（body 為自己 `${user.id}/` 前綴下的路徑，否則 403）；
  移除照片與刪除刊登時呼叫；journey cleanup 的前綴假設不變。
- 錯誤信封統一成 `{ error: { message } }`（與 `apiClient.extractApiErrorMessage` 相容），前端顯示後端原因。
- 不用 Supabase 圖片轉換（Pro 功能，方案未知）——客戶端已縮到 1600px，首頁 3 欄照片牆每格約 125px，先夠用。

### 3.3 穩定性與架構

- 資料欄位不變（`photos text[]` 仍存 URL）；`public_listings` 12 欄契約不動；規格書 §11 的「最多 3 張、單張 ≤5MB」regex 由
  `check-spec-drift.py` 釘住——若業主裁決張數改成「1–3 張」（Q3-1），規格書與常數同一 PR 改。
- e2e 契約：`create_service_provider_page.py` 用 22 byte 假 JPEG（「下游沒人解碼」）——新流程會解碼，e2e 與 journey 共用的
  page object 要改用真的 1×1 JPEG fixture；上傳 mock（`backend_api_mock.set_upload_photo_*`）維持。`listing_management.feature:74-81`
  「上傳中輸入不被倒回」仍要綠。
- LINE 內建瀏覽器：檔案選取與 canvas 都可用（相機先例 `MemberVerifyScanner`）；`<a download>` 不穩，所以不提供「下載裁切後
  的圖」。iOS 觸控：裁切層要 `touch-action: none` 並用非 passive 監聽（先例 `SignaturePad.tsx:78-90`）。
- 與 S6 的關係：S6 動詳情頁的骨架與三態、明訂「縮圖切換不動」。本項拆兩段：**P1a 上傳管線（Create／Edit／後端）可與 S6
  平行**；**P1b 詳情頁輪播與首頁 img 屬性在 S6 合併後**。

### 3.4 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `imagePipeline.ts`：解碼、EXIF 方向、裁切矩形→canvas、縮放、JPEG 輸出、大小估算（純函式＋canvas） | vitest jsdom（canvas 以 stub；數學純函式 node） | 裁切矩形換算正確；輸出尺寸 ≤1600；HEIC 解碼失敗回可辨識錯誤 |
| 2 | `PhotoPicker`：本機預覽、裁切對話框、進度、重試、封面與排序 | vitest jsdom ＋ e2e（真 JPEG fixture） | 三張各自進度；一張失敗其餘保留；封面切換反映到 `photos[0]` |
| 3 | 草稿：已上傳 URL 與文字欄位進 sessionStorage | vitest | F5 後照片與文字都在 |
| 4 | 後端：錯誤信封、`DELETE /listings/photos`、Edit 大小檢查、刪刊登清 Storage | deno test | 非本人前綴 403；刪除後 bucket 無殘留 |
| 5 | （S6 後）詳情頁輪播＋lightbox、`ImageWithFallback` 修正、img 屬性 | vitest ＋ e2e 溢版巡檢 ＋ `service_provider_detail.feature` 補輪播 | 手機可滑；鍵盤可切；一張壞圖不影響其他 |
| 6 | 文件：規格書 §11 照片列（比例、裁切、壓縮）、multi-step 候選結案、ui-ux §7 補「照片裁切與輪播」 | check-spec-drift | — |

重量：中（三段式落檔；兩段施工）。模型 Sonnet。

### 3.5 開放問題（請業主裁決）

- [ ] Q3-1 張數：維持「恰好 3 張」/ **改「1–3 張」（推薦）**——IG 式操作下強迫湊 3 張是流失點；規格書本來就寫「最多 3」。
- [ ] Q3-2 比例：**全部 1:1（推薦）**；或封面 1:1、其餘 4:5（IG 直式）——後者詳情頁要兩種高度。
- [ ] Q3-3 裁切 UI 用 `react-easy-crop`（推薦）或自寫手勢（省依賴、多風險）。
- [ ] Q3-4 「大頭照」是否要獨立於刊登封面（profiles 加 avatar 欄、Navbar／推薦樹用圖）：**推薦本輪不做**，封面即大頭照。

## 4. 管理者核對視圖（任務、點數、推薦樹、付款）

### 4.1 現況與根因

- 後台沒有任何「某位會員的獎勵明細、任務進度、推薦樹、付款紀錄」讀取：`/rewards*`、`/tasks*`、`/referrals/network/*`、
  `/subscriptions/status`、`/payuni/result` 全以 `user.id`（本人）取數；admin 看得到的只有會員詳情的三個點數總額、最近 10 筆
  提領、推薦人姓名與直推人數、會籍到期日（`MemberDetailSheet.tsx`、`api-contract.ts:753-778`）。**沒有任何頁面列出某會員的
  `payment_orders`／`subscriptions`**；付款異常只能從系統告警間接看到。
- 推薦樹只給會員自己看（3 代、二三代遮罩名）；SQL `referral_tree(p_user_id)` 允許 admin 查任何人但 Edge 與前端都沒用它。
- 帳本的正確性靠函式內 `NOT EXISTS` 保證（`pay_referral_generations`），**沒有 unique constraint**；任務計數在 `task_progress.
  monthly_referrals` jsonb 月份桶；推薦王 credit 在 `referral_king_rewards`。這些數字彼此該對得上（每個 task +1 對應一筆
  1,200 元付款；每筆首購 subscription 對應三代各一筆 100 P；餘額 view = 流水帳合計），但沒有任何機制去對。
- **沒有 admin 操作紀錄表**：停權（無 actor、無理由）、授予管理員、公告刪除、告警處理都不留痕；`withdrawal_events` 與
  `member_verify_logs` 是僅有的兩條軌跡。
- `adjustment_manual` 來源分類存在（規格書 §8.4）但「目前無端點產生」。

### 4.2 設計：三層

**(1) 稽核軌跡 `admin_audit_log`（基礎，第 6 項也靠它）**
- 新表：id、admin_id、action（`member.suspend`／`member.set_admin`／`id.review`／`withdrawal.status`／`withdrawal.batch`／
  `announcement.create|delete`／`alert.resolve`／`profile.edit`／`reward.adjust`…）、target_type、target_id、before jsonb、
  after jsonb、reason、request_id、created_at。append-only（無 UPDATE／DELETE policy），admin 可讀，寫入只經 Edge
  service_role 的單一 helper `audit(...)`；每個既有 admin 寫入端點各加一行呼叫（不改它們的 RPC）。敏感欄位（身分證、帳號）
  在 before／after 存遮罩值，原值已在主表。
- 讀取：`GET /admin/audit?target=<type:id>&limit&offset`；會員詳情新增「操作紀錄」區；提領作業台的事件歷史維持（它有自己的表）。

**(2) 會員層核對面板（擴充 S4 的詳情：從 Sheet 升級成可深入的頁 `/admin/members/:id`）**

| 分區 | 內容 | 資料來源（新增，只讀） |
|---|---|---|
| 付款與會籍 | `payment_orders`（狀態、金額、MerTradeNo、模式、完成時間）＋ `subscriptions`（起訖、是否續約、來源訂單）串成時間軸；pending 超過 N 小時標黃 | `GET /admin/members/:id/payments` |
| 獎勵明細 | 與會員端同一個 `RewardHistory` 元件（來源篩選、累計餘額），多一欄「對應付款」；頁尾顯示「流水帳合計 vs 餘額 view」是否相等 | `GET /admin/members/:id/rewards`（複用 `reward_transactions_with_balance`） |
| 推薦關係 | 上線鏈（往上 3 代）＋下線樹（`ReferralTreeView` 注入 admin 資料源，**不遮罩**、含付款狀態與「這筆給上線的 100 P 有沒有發」） | `GET /admin/members/:id/network/{overview,children,search}` 鏡像會員端三支，用 `referral_tree()` |
| 任務 | 每月桶的人數與名單 vs 該月 credit（granted／claimed），不等式 `count ≥ 8k ⇔ k 張` 不成立時標紅 | `GET /admin/members/:id/tasks` |
| 提領 | 全部（不只 10 筆）＋事件歷史 | 既有 `/admin/withdrawals?search=` 加 `userId` 篩選 |
| 操作紀錄 | 上一節的 audit | `GET /admin/audit` |

**(3) 全站對帳報表 `/admin/reconcile`（「定期人工核對」的主場）**
- 一組只讀 SQL 函式 `admin_reconcile_<check>()`（security definer、revoke、各回「例外列」），端點 `GET /admin/reconcile`
  回每個檢查的例外數，`GET /admin/reconcile/:check` 回例外列（分頁）。管理者看的是**例外**，不是全部資料。
- 第一批檢查（都從規格書規則直譯）：
  1. completed 訂單無對應 subscription（§6.2）。
  2. 首購 subscription 的三代獎勵缺筆或多筆（依 `referral_edges` 爬 3 代 × `reward_transactions` 冪等鍵，§8.2–8.3）。
  3. `reward_transactions` 指向不存在的 subscription／withdrawal。
  4. `task_progress` 月份桶的人數 vs 該月 `referral_king_rewards` 張數（§9.1–9.2）。
  5. 餘額 view vs 流水帳合計（§8.5）。
  6. 提領狀態與最後一筆事件不一致、`awaiting_collection` 超過 N 天（§10.3）。
  7. `payment_orders` pending 超過 N 小時（對帳排程漏網）。
  8. `profiles.referred_by_user_id` 與 `referral_edges.referrer` 不一致（§7.2；已付款者才算例外）。
  9. 未處理告警 > 7 天。
- 每個例外列有「開會員核對面板」連結；報表頁有「上次執行時間」與一鍵重跑；之後可排程（pg_cron 或 reconcile 排程）寫進
  `system_alerts`，本輪先手動。
- **人工修正**：發現錯帳後的修法是 `POST /admin/members/:id/rewards/adjustment`（金額正負、理由必填、寫 audit、type=
  `adjustment`、source_category=`adjustment_manual`）——這是唯一的寫入，且走規格書已預留的分類。是否納入本輪由業主裁決
  （Q4-2），納入則該階段用 Opus。

### 4.3 UI/UX

- 桌機為主（批次核對）、手機可讀（規劃決策「後台兩者並重」）：核對面板用 S4 的分區與 S5 的清單殼（`AdminListSkeleton`、
  `AdminStaleNotice`、`DataAgeNote`、`useAdminList`），推薦樹用世代色，例外列用 `StatusCallout` 的 warning／destructive 形狀。
- 數字去色（plan.md §4 第 5 點）：例外數是狀態語義才上色。
- 快取：核對資料一律不快取（走 `slot: null`，同告警）；寫入（adjustment）經 `runAdminWrite`、失效 `members`。

### 4.4 穩定性與架構

- 所有新讀取都是 security definer + revoke 的 SQL 函式（supabase/README.md 慣例），不改任何既有發獎、換線、提領函式。
- 推薦樹 admin 版重用 `loadNetwork` 的形狀但以 `referral_tree()` 取數，避免複製 400 行爬樹程式——需先把 `index.ts:3450-3840`
  的觀看者參數化（「觀看者＝自己」改成可注入），這是本項最大的重構面，要有 Deno 測試釘住會員端行為不變。
- PII：核對面板顯示身分證與帳號仍走 Edge 遮罩（與詳情同），提領作業台仍是唯一原值處。
- 與 S5 的 `adminCache`：新資源不入快取表；`AdminConsole` 多一個「對帳」分頁（五格時分頁列要重量 375px）。

### 4.5 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `admin_audit_log` 表、RLS、Edge helper、既有 8 個寫入端點接上 | sql ＋ deno test | 每個寫入各一筆 audit；表無 update／delete 路徑 |
| 2 | 會員層讀取端點 5 支（payments／rewards／network×3／tasks）＋ 契約 | deno test | 非 admin 403；遮罩規則；推薦樹與會員端同形 |
| 3 | 觀看者參數化重構（會員端行為零變） | deno test（既有 network-endpoints.test 全綠） | — |
| 4 | 核對面板頁（六區）＋ 操作紀錄 | vitest jsdom ＋ e2e admin 情境 2 條 | 手機 375px 無溢版；桌機六區可見 |
| 5 | 對帳函式 9 支＋ `/admin/reconcile` ＋ 報表頁 | sql ＋ deno test（每支至少一個「人造例外」案例） | 例外列正確、無誤報 |
| 6 | （裁決後）手動調整端點＋確認框＋audit | deno test ＋ vitest | 理由必填；餘額變動可追 |
| 7 | 文件：規格書 §13 新段「核對與稽核」、§8.4 `adjustment_manual` 落地、§14 增列尚未自動化的對帳 | check-spec-drift | — |

重量：重（兩個 session：A1 稽核＋會員面板、A2 對帳報表）；規劃與階段 3／5／6 用 Opus。

### 4.6 開放問題（請業主裁決）

- [ ] Q4-1 稽核軌跡涵蓋所有 admin 寫入（推薦）或只涵蓋金流類。
- [ ] Q4-2 手動點數調整端點納入本輪（推薦納入，但放最後一階段、Opus）或留待下一輪。
- [ ] Q4-3 admin 看推薦樹是否不遮罩二三代姓名（推薦不遮罩：核對需要；仍只限 admin）。
- [ ] Q4-4 對帳報表是否排程自動跑並寫告警（推薦第二期）。

## 5. 定位：記錄刊登者位置、依距離排序

### 5.1 現況與根因

- 「依距離排序」全在前端：首頁掛載就呼叫 `navigator.geolocation`（沒有說明、沒有按鈕，`HomePage.tsx:142-149`），拿到座標後
  用 **22 個縣市中心點查表**算 Haversine 排序（`:59-83,172-241`），只看 `city` 不看區；被拒／逾時都靜默、沒有提示；畫面
  沒有距離數字、沒有排序說明。
- **刊登沒有任何座標欄位**（`listings` 自建立後從未 ALTER；全庫無 lat/lng/geom）；建立／編輯刊登不抓定位、不做地址→座標；
  沒有端點接收座標；沒有「最後位置」類欄位。DB 只有 `pgcrypto` extension。
- 首頁一次 `select('*')` 抓全部、無分頁（PostgREST 列數上限會靜默截斷，`HomePage.tsx:105-108` 註解自承）；篩選與搜尋全在前端。
- 公開面：`public_listings` 12 欄契約由兩支測試釘死；**原表 `listings` 對 anon 也整表可讀**（`20260914000002:35-36`）——在
  `listings` 加座標欄位等於把刊登者的精確位置公開給所有人。ui-ux §7「依賴定位的功能只在取得真實定位後才啟用」。
- 條款沒有位置資料條目；LINE 內建瀏覽器對 geolocation 的行為 repo 無紀錄（需實測）。

### 5.2 設計

**A. 位置的來源：「服務據點」為主，「目前位置」為輔（業主裁決 Q5-1）**
- 刊登者在建立／編輯刊登設定**服務據點**：預設由「縣市＋第一個勾選的區」解析成**區級中心點**（repo 內建 368 區鄉鎮中心點
  表，零外部依賴，立刻把現在的縣市級精度提升到區級）；按「使用我目前的位置」可用 GPS 精確到點（適合有店面的提供者）；
  第二期再加地圖點選（Leaflet＋OSM 圖磚，新依賴）。
- 「最新位置」：提供者在刊登管理頁有一顆「更新為目前位置」（前景、手動），以及可選的「開啟 app 時自動更新」偏好（網頁
  無背景定位，所以只能是提供者打開 Uknow 時更新）。不做對訪客的即時追蹤。

**B. 儲存與公開粒度（穩定性與隱私的核心）**
- 新表 `listing_locations`（user_id pk → listings.user_id、lat、lng、accuracy_m、source ∈ {district, gps, manual}、
  updated_at），**不加進 `listings`、不進 `public_listings`**（兩個欄位契約不動）；RLS：本人讀寫、admin 讀、anon **不可讀**。
- 公開讀取只經一支 RPC `public_listings_nearby(p_lat, p_lng, p_limit, p_offset, p_city?, p_category?)`（security definer、
  grant 給 anon 與 authenticated，與 `has_active_subscription` 同慣例）：回 `public_listings` 的 12 欄＋`distance_km`
  （四捨五入到 0.1）＋`location_precision`（district／point）；**不回座標**。距離用 SQL Haversine（資料量 ≤ 有效會員數，
  不需 PostGIS；量到瓶頸再換 `geography` 與 KNN 索引，RPC 介面不變）。
- 刊登者的位置在卡片上只顯示「約 2.3 km」或「同區」，詳情頁顯示「服務地區：台北市 大安區」（維持現況）；位置只保留最新一筆
  （覆寫，無歷史）。

**C. 訪客側：先問用途、再要權限，拒絕也能用**
- 首頁排序控制「最新 / 離我最近」。進站**不再自動要定位**；點「離我最近」時先一句說明「用你目前的位置排序，不會儲存」，再
  呼叫 `getCurrentPosition`；成功後排序＋卡片顯示距離＋頂部「依你目前位置排序」；被拒或逾時 → 彈出「選擇你所在的地區」
  （縣市／區）用區中心點排序，並記住選擇（localStorage 偏好，與檢視模式同作法）。LINE 內建瀏覽器若不支援定位，走同一條
  fallback；這條要在 LINE 真機驗收。
- 列表改走 RPC 分頁（「載入更多」，重用 `usePagedList`——S7 也會用它）；搜尋與類別篩選改成 RPC 參數（p_city／p_category／
  p_search），不再前端抓全部。無定位時 RPC 以 `created_at desc` 回傳，行為與現在相同。

### 5.3 穩定性與架構

- `listings`／`public_listings` 零變更；`listings.test.ts` 與 `rls-policies.test.ts` 的欄位契約照綠。新表走 journey 的
  `45_listing_rls.feature` 同款 RLS probe（anon 讀 `listing_locations` 必須 0 列）。
- 首頁資料流改動大（直連 PostgREST → RPC＋分頁）：**在 S6 合併後做**（S6 明訂不動首頁排序與請求時序）；後端（表、RPC、區
  中心點表、Deno 測試）可先行。
- 條款：服務條款加「位置資料」一句（提供者自願提供、用於距離排序、可隨時清除）；刊登表單的位置區塊有同意文字。
- 效能：RPC 對每列算一次 Haversine，千筆等級毫秒級；加 `city` 索引既有。`limit` 預設 30、「載入更多」續抓。

### 5.4 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 區鄉鎮中心點表（TS 常數＋SQL seed 同源）、`districtCentroid()` 純函式 | vitest node ＋ `constants.test` 一致性 | 368 區全有、與 `TAIWAN_REGIONS` 鍵一致 |
| 2 | `listing_locations` 表、RLS、`public_listings_nearby` RPC、`upsert_listing_location` RPC | sql ＋ deno test ＋ journey RLS probe | anon 不可讀表；RPC 不回座標；距離正確（已知兩點） |
| 3 | 刊登表單的位置區塊（區中心點預設、使用目前位置、同意文字） | vitest jsdom ＋ e2e `listing_management` 補 1 條 | 建立刊登後 `listing_locations` 有列 |
| 4 | （S6 後）首頁排序控制、權限流程、地區 fallback、距離顯示、RPC 分頁 | vitest ＋ e2e（`set_geolocation` 既有 mock；補「拒絕→選地區」一條） | 被拒仍可依距離排序；卡片顯示距離；載入更多 |
| 5 | 刊登管理頁「更新為目前位置」＋自動更新偏好 | vitest | updated_at 更新；關閉偏好後不再更新 |
| 6 | 文件：規格書 §11／§12.3 新段「位置與距離」、§14 記「地圖點選第二期」；ui-ux §7 定位規則擴寫；條款 | check-spec-drift | — |

重量：中偏重（三段式落檔，兩段施工：後端先、首頁後）。模型 Sonnet；RPC 與 RLS 審查用 Opus。

### 5.5 開放問題（請業主裁決）

- [ ] Q5-1 位置來源：**A 服務據點為主＋手動更新目前位置（推薦）** / B 每次提供者開 app 自動更新 / C 兩者都要（A＋偏好開關）。
- [ ] Q5-2 公開粒度：**只回距離（推薦）** / 回粗略座標（為日後地圖）——後者要同時決定模糊半徑。
- [ ] Q5-3 地圖點選與地圖檢視（Leaflet）是否列入第二期。
- [ ] Q5-4 「離我最近」是否成為登入與未登入的預設排序（推薦：有定位偏好才預設，否則最新）。

## 6. 管理者代使用者修改資料

### 6.1 現況與根因

- 產品現況是「會員資料一經註冊後無法自行修改，請透過 LINE 聯繫客服」（`MemberDashboard.tsx:116-121`）；沒有編輯個人資料頁；
  唯一事後入口是首次付款前結帳頁的「編輯」（重走 Step 2）。
- `PUT /auth/profile`（`index.ts:688-742`）可改 name／phone／birthDate／nationalId／bankCode／bankAccount，但**沒有任何前端
  呼叫者**，而且除了姓名不驗格式。admin 沒有改他人資料的端點；`PATCH` 類操作只有停權、授予管理員、證件審核、提領狀態。
- 欄位的連動：`national_id` 是會員驗證、提領、查收、領獎四處的驗證憑證，且與證件照審核綁定；`bank_*` 在 profiles 是「上次使用
  值」、每筆提領另存快照（作業台讀快照）；`name` 改了推薦網絡即時反映、獎勵明細的名字快照不連動；`referred_by_*` 決定一代
  收獎者；email 在 `auth.users`。

### 6.2 設計

- **單一端點 `PATCH /admin/members/:id/profile`**（Edge、service_role、`/admin/*` 守門）：白名單 name（含中／外文模式，驗證
  與註冊同一套：Edge 的聯集規則）、phone（`^09\d{8}$`）、birth_date（≥18）、national_id（格式＋**唯一性檢核**，順手關 §14 #1）、
  bank_code／bank_account（與提領同一套格式）。**不含** referred_by_*（推薦關係只能走規格書 §7.2 的換線路徑）、is_admin／
  suspended（既有端點）、email（Q6-2）。
- 每次呼叫：reason 必填、寫 `admin_audit_log`（before／after 遮罩值）、冪等（相同值回 `idempotent`）。
- **連動規則**（寫進規格書 §13 新段）：改 `national_id` → `id_verification_status` 重設為 `none`、清證件照路徑（舊證件對不上新
  字號；會員下次提領前要重交）並寫 audit；改 `bank_*` → 只影響下一次提領的預填（既有快照不動）；改 `name` → 即時面全部反映、
  獎勵明細快照維持（規格書 §8 已如此）。
- UI：會員詳情「管理」區加「編輯基本資料」→ 表單（與 CompleteProfile 同欄位與驗證元件，但 admin 版）→ 確認框列出「舊 → 新」
  diff ＋ 理由欄 → 回報區顯示結果；若改了身分證，確認框紅字提醒「會員的證件驗證將重設」。
- 會員側的對應：會員中心「會員資訊」卡的說明改成「如需修改，請透過 LINE 聯繫客服」＋一鍵開 LINE 並預填「我要修改會員資料」
  （用既有 `@uknow` 常數）；資料被改後下次登入看到一次性提示「你的基本資料已由客服更新（{日期}）」（讀 audit 最近一筆）。

### 6.3 穩定性與架構

- 寫入仍只經 Edge（profiles 的欄級 GRANT 與「寫入收斂到 Edge」慣例不變，`20260726000002`）；validation 規則目前前後端各一份，
  本項順手把後端的 phone／nationalId／bank 格式驗證補齊（`PUT /auth/profile` 一併補，雖無呼叫者）。
- 不給會員自助修改（Q6-3 推薦維持）：推薦與提領系統的身分完整性比便利重要；客服代改＋稽核是對的位置。
- 依賴第 4 項的 `admin_audit_log`（A1 先做）。

### 6.4 階段與測試

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 後端驗證器共用化（Deno）：phone／nationalId／bank／birth；`PUT /auth/profile` 補驗 | deno test | 各欄位壞值 400、原文訊息 |
| 2 | `PATCH /admin/members/:id/profile`＋連動（證件重設）＋audit＋national_id 唯一性 | deno test | 非 admin 403；改身分證後 status=none；重複身分證 409 |
| 3 | 前端編輯表單＋diff 確認框＋回報 | vitest jsdom ＋ e2e admin 情境 1 條 | 確認框顯示舊→新；理由必填；成功後詳情更新（`invalidate('members')`） |
| 4 | 會員側：LINE 預填連結、一次性提示 | vitest | — |
| 5 | 文件：規格書 §13「代改資料與連動」、§4.2 唯一性、§14 刪 #1 | check-spec-drift | — |

重量：輕偏中（三段式落檔——動會籍身分資料；Opus 規劃審查、Sonnet 實作）。

### 6.5 開放問題（請業主裁決）

- [ ] Q6-1 可改欄位清單如上（不含推薦人）是否同意。
- [ ] Q6-2 email 是否可由 admin 改（要走 `auth.admin.updateUserById`，會改登入識別、寄驗證信）：**推薦本輪不做**。
- [ ] Q6-3 會員自助修改手機／收款帳號：**推薦維持不開放**，改成一鍵聯繫客服。
- [ ] Q6-4 改身分證是否一律重設證件驗證（推薦一律重設）。

## 7. 工項、順序與分工（與 platform-uiux-redesign 交錯）

| 工項 | 內容 | 流程 | 模型 | 可開工條件 | 重量 |
|---|---|---|---|---|---|
| **T1** 登入狀態與安心設計 | §1 全部（`HomePage.tsx:353` 一行在 S6 後） | 三段式 `feature/auth-state-trust` | Sonnet；啟動流程審查 Opus | 現在；與 S6 只差一行 | 中 |
| **R0** 推薦碼端點關洞 | §2.3 的限流＋遮罩名 | `fix/referral-validate-hardening`（Plan Mode） | Sonnet | 現在（半小時） | 輕 |
| **A1** 稽核軌跡＋會員核對面板＋代改資料 | §4.2(1)(2)＋§6 | 三段式 `feature/admin-audit-and-edit` | **Opus** 規劃、Sonnet 實作 | 現在（只動 admin／後端） | 重 |
| **P1a** 照片上傳管線 | §3.2A＋§3.2C | 三段式 `feature/listing-photo-pipeline` | Sonnet | 現在（Create／Edit／後端，不碰 S6 檔） | 中 |
| **R1** 分享面板、LINE、邀請物件、落地頁、付款成功 CTA、身分證延後 | §2.2A/C＋§2.3 | 三段式 `feature/referral-invite-flow` | Sonnet；註冊漏斗審查 Opus | 現在；**會員中心與推薦頁的入口併入 S7 prompt** | 中偏重 |
| **L1a** 位置後端 | §5.2B＋區中心點表 | 三段式 `feature/listing-location` | Sonnet；RPC/RLS 審查 Opus | 現在 | 中 |
| **S6 合併後** | P1b 詳情頁輪播；T1 的首頁一行；L1b 首頁排序與分頁 | 併入各自工項的第二段 | — | S6 合併 | — |
| **A2** 對帳報表（＋手動調整） | §4.2(3) | 三段式 `feature/admin-reconcile` | **Opus** | A1 合併 | 重 |
| **S7 prompt 增補** | 推薦管理頁頂部邀請區、會員中心推薦卡的「邀請」動作 | — | — | R1 的分享面板元件合併後 | — |

平行原則同 S5／S6：**不撞檔才平行**。T1（殼層）、A1（admin／後端）、P1a（刊登表單）、L1a（後端）彼此不重疊；R1 與 T1 都碰
`AuthPage`（T1 只改「已登入者開 /login」一處）——R1 先合併，T1 的那一處在 R1 之後。每個三段式工項各自 `/plan-feature`，
細部規劃書在該工項的 `docs/plans/<slug>/`，收尾清理；本總綱只保留到七個工項全部合併。

驗收：每個工項在 PR 描述附「可勾清單」（手機 LINE 內建瀏覽器為主），不另設驗收站；T1 的驗收項是「重新整理 20 次、切換
網路節流，頁首不出現登入鈕」，R1 是「從會員中心到 LINE 好友選擇器 2 次點擊內」與「被推薦者從連結到付款完成的步數」，P1a 是
「iPhone 原圖（HEIC、>5MB）可上傳並自選範圍」，L1 是「拒絕定位仍能依地區排序」，A1 是「任一 admin 寫入都查得到誰、何時、
為什麼」。

## 8. 不做什麼（本輪）

- 不換帳號識別（phone-first）、不做簡訊 OTP；簡訊只在方案 B 作為送達通道，且列第二期。
- 不做即時位置追蹤、不存位置歷史、不對匿名公開座標。
- 不做獨立大頭照欄位；不用 Supabase 圖片轉換。
- 不改發獎、換線、提領、推薦王的任何函式；對帳只讀，修正走單一可稽核的調整端點（且由業主決定是否本輪）。
- 不引入狀態庫、UI 框架、地圖套件（地圖第二期）。
- 不做會員自助修改資料頁。

## 9. 風險與回滾

| 風險 | 緩解 | 回滾 |
|---|---|---|
| 首繪提示與真實狀態不一致（換帳號、被撤權） | 提示只影響頁首占位，不含權限；`/profile` 回來即以其為準；401 類清提示 | 關掉讀提示（一行旗標），回到現狀 |
| `degraded` 把真的失效會員留在站內 | 只對 5xx／網路錯誤重試；401／404／410 照舊登出；重試有上限 | 同上 |
| 邀請表與付款路徑的回填漏寫 | 回填獨立於發獎；對帳檢查 #2 之外加「已付費但邀請未標記」提示 | 刪邀請紀錄顯示，連結仍可用（`?ref=` 路徑不動） |
| 裁切與壓縮在特定瀏覽器失敗 | 解碼失敗有明確文案；壓縮失敗退回原檔上傳（仍受 5MB 限） | 旗標關閉裁切步驟，回到原流程 |
| 位置資料外洩 | 表不對 anon 開放、RPC 只回距離、journey RLS probe 釘住 | drop RPC 即回到縣市排序（前端 fallback 仍在） |
| 核對面板重構推薦網絡端點誤傷會員端 | 先以 Deno 測試釘住會員端回應再參數化 | 保留舊函式路徑，admin 版獨立 |
| 代改資料改錯身分證 | 確認框 diff＋理由＋audit＋證件重設 | audit 的 before 值可人工還原 |
