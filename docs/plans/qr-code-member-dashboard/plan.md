# 我的 QR 整合頁（qr-code-member-dashboard）規劃書

<!-- 由 /plan-feature 從 docs/_templates/plan.md 實例化。分支：claude/qr-code-member-dashboard-qs36st
     第 2 版：依 ./review.md（四視角，P0 0／P1 9／P2 9）修訂，對應表見末段「修訂紀錄」。 -->

## 0. 一句話

讓會員從會員中心的「我的 QR」入口進到**一個獨立頁**（`/dashboard/qr`），把
邀請好友 QR、會員驗證碼、以及原本只在 `/admin/verify` 的**掃碼驗證**整合在同一頁
（掃碼分頁只對管理員出現），因為使用者要的是「所有 QR 相關的事都在那一頁」，
而相機取景頁按規格判準本來就該走獨立路由，不該塞在對話框裡。

## 1. 使用者需求

- 對照規格書：§3 路由表（新增 `/dashboard/qr`、`/admin/verify` 改轉址）、
  §13.1 會員驗證（流程段「會員在會員中心『我的 QR → 會員驗證碼』出示…→ admin 在
  `/admin/verify` 掃描」要改寫）、§13 末段「admin 功能放哪的判準」（相機掃碼走
  獨立路由——本案沿用此判準，只是路由從 admin 區搬到會員區）。
- 現況（codebase）：
  - `MyQrEntry`（會員中心與推薦管理共用的唯一入口）→ `MyQrDialog`（Radix Dialog）
    → 兩分頁「邀請好友」`InviteFriendPanelContent`／「會員驗證碼」`MemberVerifyQrTab`；
    分頁偏好存 localStorage（`myQrTabPreference.ts`）。
  - 掃碼：`/admin/verify` → `admin/MemberVerifyScanner`（相機＋手動輸入退路）→
    `POST /admin/members/verify`；入口是 `/admin` 頁首的「會員驗證」按鈕。
  - 全 `src/` 只有三類 QR 表面（邀請 QR／驗證碼 QR／掃描），本頁三分頁一一對應。
- 使用者故事（可驗證）：
  1. 會員（已加入推薦計畫）在會員中心點「我的 QR」→ 到 `/dashboard/qr`，看到
     「邀請好友／會員驗證碼」兩分頁，停在上次慣用的分頁；內容與今日對話框相同。
  2. 未加入推薦計畫的會員 → 同一頁只有「會員驗證碼」，不顯示分頁列（沿用現規則）。
  3. 管理員（已加入）→ 三分頁，多出「掃描驗證」；`/admin` 的「會員驗證」按鈕與舊網址
     `/admin/verify` 都直接落在 `/dashboard/qr?tab=scan`，相機立刻啟動；掃描、結果
     呈現、震動回饋、手動輸入退路與今日 `/admin/verify` 完全一致。
  4. **管理員且未加入推薦計畫**（無會籍的管理員多半如此，`route_guards.feature`
     已把「admin without a subscription is not locked out」列為保留情境）→ 兩分頁
     「會員驗證碼／掃描驗證」，無邀請分頁。`isAdmin` 與 `joined` 是兩個獨立布林值，
     四種組合都要在測試矩陣裡。
  5. 非管理員以 `?tab=scan` 進頁 → 看不到掃描分頁，靜默落回可用分頁（UI 只是門面，
     真正的權限在後端端點；非管理員時掃描面板根本不掛進 DOM）。
  6. 在頁內切離「掃描驗證」或離開此頁 → 相機串流停止（含「相機還沒開好就離開」）。
  7. 推薦管理頁（`/referrals`）的同一顆「我的 QR」入口連到同一頁；**按頁面的返回鍵
     回到進來的那一頁**（從 `/referrals` 來就回 `/referrals`、從 `/dashboard` 來就回
     `/dashboard`、從 `/admin` 捷徑來就回 `/admin`；直接貼網址進來則回 `/dashboard`）。
- 不做什麼：
  - **不改掃描權限**（預設方案 A：掃描仍僅限管理員；開放給一般會員是開放問題 #1 的
    變體 B，其增量列在 §6）。
  - 不改後端端點、token TTL（90 秒）、稽核表；不改邀請卡／分享按鈕的內容與行為；
    不改「加入推薦計畫」流程與入口。
  - 不在會員中心放實際的 QR 縮圖（開放問題 #2）。

## 2. 系統設計

- 資料流（方案 A，**與今日相同**，只是呼叫方換了外殼）：
  - 會員驗證碼分頁：`useMemberVerifyToken(active)` → `GET /members/verify-token`
    （登入本人）→ 到期前自動換發。`active` 改為 `tab === 'verify'`；Radix Tabs 本就
    只掛載 active 面板，切走即卸載、停止輪替。
  - 掃描分頁：`MemberVerifyScanner` → `POST /admin/members/verify`（`/admin/*`
    middleware ＋ handler 內 `isAdminUser` 雙層守門，寫 `member_verify_logs`）。
  - 純前端新增狀態：URL query `?tab=invite|verify|scan`（深連結／`/admin` 捷徑用）
    ＋既有 localStorage 偏好。決策順序（純函式）：URL 指定且可用 → 用它；否則偏好
    可用 → 用它；否則 `verify`（永遠可用）。使用者主動切換時同時寫偏好與 URL
    （`replace`，不堆歷史）。`normalizeMyQrTab` 必須把 `'scan'` 當合法值原樣保留
    （否則管理員寫入 `scan` 後下次讀回會被當髒值收斂回 `invite`，TypeScript 攔不到）。
  - 返回目的地：`Link` 以 `state={{ from: pathname }}` 記住入口；`MyQrPage` 的返回鍵
    讀 `location.state.from`，**只接受白名單** `/dashboard`、`/referrals`、`/admin`，
    其餘（直接貼網址、state 遺失）落回 `useBackNavigation()`（對照表補
    `'/dashboard/qr': '/dashboard'`）。
- 相機生命週期（從「整頁導航才卸載」變成「切分頁就卸載」，機率放大的競態）：
  `MemberVerifyScanner` 的 effect 在 `await getUserMedia()` 之後必須**先檢查
  `cancelled`，是就當場 `stop()` 剛拿到的 stream 再 return**——現行寫法 cleanup 時
  `stream` 仍是 `null`（stop 是 no-op），promise 之後才指派、然後 `if (cancelled) return`
  直接離開，那條 `MediaStream` 永遠沒人停，症狀就是相機指示燈常亮、下次
  `getUserMedia` 因裝置忙碌失敗。這條路徑要有專屬測試（延後 resolve、resolve 前卸載）。
- API 變更：**無**。資料庫變更：**無**。`api-contract.ts` 不動。

## 3. 架構影響

- 新頁 `src/components/MyQrPage.tsx`（與 `MemberDashboard`/`ReferralManagement` 同層，
  頁面放頂層是既有慣例），以 `lazyNamed` 掛在 `App.tsx` 會員區 lazy 群組；路由
  `/dashboard/qr`，守衛與 `/dashboard` 相同（`ProtectedRoute` ＋
  `RequireMembershipRoute`；`resolveMembershipRedirect` 第一條 `isAdmin → null`，
  管理員無會籍也放行，與今日 `AdminRoute` 守 `/admin/verify` 等價）。
  `BottomNav` 的「會員」`NavLink` 沒有 `end`，在 `/dashboard/qr` 仍高亮——不動導覽契約。
- **載入延遲**：Dialog 是同頁零網路的開啟，改成路由後多一個 lazy chunk 的下載，而
  最典型的情境正是「店家當面等你出示驗證碼」。對策：`MyQrEntry` 的按鈕在
  `onPointerEnter`／`onTouchStart`／`onFocus` 觸發 `import('../MyQrPage')` 預熱
  （Vite 對同一模組的動態 import 回同一個 promise，與 `App.tsx` 的 lazy 共用 chunk，
  不會重複下載）。
- `MyQrEntry`：「我的 QR」按鈕改成 `Link`（`asChild`，`data-testid` 不變）到
  `/dashboard/qr`，帶 `state={{ from: location.pathname }}`；拿掉 `qrOpen` 狀態與
  `MyQrDialog`；`openJoin` 裡「先關 QR 面板再開加入流程」的 z-index 防線隨之消失。
  **不新增任何行為 prop**，維持「唯一入口、狀態單一來源」。
- `MyQrDialog.tsx` ＋測試**刪除**（knip 會擋住漏刪）；其分頁契約的測試搬進
  `MyQrPage.test.tsx`——其中「不放總述、`aria-describedby` 為 undefined」那條是 Radix
  Dialog 特有機制，新頁用等價斷言接住它守的意圖（見 §4「頁首」）。
- `admin/MemberVerifyScanner.tsx` **留在原處、改成面板**：拿掉頁首（返回鈕、h1、副標）
  與 `Card` 外殼，只留取景框／疊層結果／手動輸入；不再依賴 `useNavigate`。方案 A 下
  它仍是管理員專屬能力，留在 `admin/` 語意正確、`ui-ux-guidelines` §7 的〔實作〕路徑
  不必改。**代價**：`admin/` 下檔案「只被 `AdminDashboard` 組裝」的不變式首次被會員區
  頁面打破——這個放置決策與開放問題 #1 連動：若選方案 B，此檔應搬到 `referral/`
  （或新資料夾），並同步改 ui-ux §7 的路徑。
- `myQrTabPreference.ts`：`MyQrTab` 加 `'scan'`；`normalizeMyQrTab` 認 `scan`；
  `resolveMyQrTab` 改成 `(available, requested, preferred)` 純函式。**同一批**把
  `MyQrDialog.tsx` 第 46、51 行的舊簽名呼叫改成新簽名（`{ invite: canShareInvite,
  verify: true, scan: false }`），否則階段 1 之後 `tsc` 會以 TS2554 紅燈直到階段 4 刪檔。
- `useBackNavigation`：`ROUTE_HIERARCHY` 加 `'/dashboard/qr': '/dashboard'`。**不加會導回
  首頁**——前綴比對迴圈會先命中既有的 `'/dashboard': '/'`（`'/dashboard/qr'.startsWith('/dashboard/')`
  為真），這行是必要修正不是防禦性寫法；該 hook 目前沒有任何測試，階段 4 補一條。
  `useBreadcrumbs` 名稱表加「我的 QR」。
- `App.tsx`：拿掉 `MemberVerifyScanner` 的 lazy import 與 `/admin/verify` 的
  `AdminRoute` 路由；`/admin/verify` 改成 `<Navigate to="/dashboard/qr?tab=scan" replace
  state={{ from: '/admin' }} />`（比照 `/referral-reward-contract` 舊 slug 轉址——管理員
  很可能把它加在手機主畫面；轉址本身不守門，守門在目的地）。`AdminDashboard` 頁首的
  「會員驗證」按鈕改連 `/dashboard/qr?tab=scan`、帶 `state={{ from: '/admin' }}`
  （開放問題 #3）。
- 與 multi-step-flow 四契約無關（無表單、無金流）。
- 效能：`jsqr` 仍是掃描面板內的動態 import，只有掃描分頁掛載時才下載；`qrcode.react`
  本就在會員區 chunk；新頁 lazy，entry chunk 不長大（`check-bundle-budget` 棘輪不受影響）。
- 安全：方案 A 零變更。掃描分頁對非管理員隱藏是 UI 門面；真正的邊界仍是
  `/admin/*` middleware（`admin-gate.test.ts` 已釘住 `POST /api/admin/members/verify`）。

## 4. UI/UX

- 頁首沿用 `MemberDashboard`／舊掃描頁的模式：`ArrowLeft` icon 按鈕（`aria-label`
  「返回上一頁」，行為見 §2「返回目的地」）＋ h1「我的 QR」＋副標「邀請好友、出示
  會員驗證碼」在手機隱藏（`hidden sm:block`）。**頁首契約**（承接 `MyQrDialog.test`
  那條 aria-describedby 測試守的意圖「手機第一屏留給 QR、不重複說明」）：副標元素
  必須帶 `hidden sm:block`，且各分頁內自己的一句說明不得與副標重複。
- 分頁：`TabsList` 用 `AdminDashboard` 已驗證的四件套
  `w-full grid grid-cols-{2|3} h-auto pointer-coarse:[&>[role=tab]]:min-h-[44px]`
  （ui-ux §1 的 44px 觸控目標——今日對話框的分頁只有 36px，順手還債）。
  三分頁在 375px 的算式：內容寬 343 − TabsList 內距 6 → 每格 112px，扣 trigger
  內距與邊框 18 → 可放 94px；「會員驗證碼」五字 70px ＋ icon 16 ＋ gap 6 ＝ 92px，
  餘裕 2px 不可靠 → **只在實際渲染三個分頁時**把 icon 在 `<sm` 隱藏（`hidden sm:inline`
  依 tab 數決定，不寫死斷點）；兩分頁時每格 ≈168px，維持帶 icon。三顆 icon 補
  `aria-hidden="true"`（文字即 accessible name）。只有一個可用分頁時不畫分頁列。
- 分頁順序與預設：邀請好友 → 會員驗證碼 → 掃描驗證；預設仍是邀請好友並記住上次選擇。
- 掃描分頁 = 既有取景框版面（ui-ux §7 那條的〔實作〕）；`CardTitle`「對準會員的驗證 QR」
  改成與驗證碼分頁同款的置中說明句；手動輸入退路不變；切到分頁即啟動相機（需人工
  裁決 #1，見 review.md）。**第一屏重算**（375×667，`BottomNav` 佔底部 56）：
  Navbar 64 ＋ 公告橫幅 40 ＋ `main` py-6 24 ＋ 頁首 76 ＋ TabsList（44＋6）50 ＋
  分頁內距 16 ＋ 說明句 36 ≈ **306px**（舊頁 288，多了分頁列、少了 CardHeader）；取景框
  高 = min(45dvh≈300, 寬 343×3/4≈257) ＝ 257 → 底邊 563 < 611（667−56）。結果面板
  疊在取景框內，跟著在第一屏。**驗收不能只靠 headless 手動輸入版面**：e2e 以 Chromium
  `--use-fake-device-for-media-stream` ＋ `--use-fake-ui-for-media-stream` 讓相機真的
  啟動，用既有 `first_screen_position`（`e2e/test_admin_mobile_layout.py`）斷言
  `scanner-viewport` 底邊在第一屏內。
- 行動版：`BottomNav` 保持可見、「會員」高亮；`main` 的 `pb-24` 讓疊層結果不被導覽列
  遮住（既有設計）。
- 三態：邀請（無碼 → 分頁不存在，非空態）；驗證碼（載入 spinner／錯誤＋重試／有碼，
  既有）；掃描（相機不可用 → 手動輸入；驗證中／無法驗證／結果三態疊層，既有）。
- 可測試性：`data-testid` 沿用 `my-qr-button`、`invite-tab`、`verify-tab`、
  `member-verify-qrcode`、`scanner-viewport`、`verify-result`；新增 `scan-tab`。
- 溢版巡檢：`e2e/test_overflow_sweep.py` 的 `ROUTES` 加**三**條——(a) 會員視角
  `/dashboard/qr` 不帶 `after_load`（預設「邀請好友」分頁：不斷行的推薦連結與長姓名，
  是本次真正從 Dialog 盲區變成可直達的畫面）；(b) 同路由 `after_load` 切到驗證碼分頁；
  (c) 管理員視角 `/dashboard/qr?tab=scan`（有 fake camera 就是相機版面）。
  `backend_api_mock` 補 `/members/verify-token` 的假回應（比照 `set_subscription_status`
  的 `_route` 寫法），否則驗證碼分頁只量得到錯誤態。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點（vitest / deno test / e2e） | 驗證標準 |
|---|---|---|---|
| 1 | 分頁決策純函式：`MyQrTab` 加 `scan`；`normalizeMyQrTab` 認 `scan`；`resolveMyQrTab(available, requested, preferred)`；**同批改 `MyQrDialog.tsx` 兩處呼叫**維持 `tsc` 綠 | `src/utils/myQrTabPreference.test.ts`（node） | `normalizeMyQrTab('scan')` 原樣保留；URL 指定可用分頁優先；不可用（非管理員 `scan`、未加入 `invite`）落回偏好；偏好也不可用落回 `verify`；髒值收斂；`MyQrDialog.test` 既有 4 條仍綠 |
| 2 | 掃描頁改面板：移除頁首／返回鈕／Card；卸載即停相機，含「相機還沒開好」 | `src/components/admin/MemberVerifyScanner.test.tsx`（jsdom，既有 10 條保留） | 既有連續掃描／震動／疊層契約全綠；新增「穩態卸載停止所有 track」「`getUserMedia` 延後 resolve、resolve 前卸載仍停止 track」「不再渲染返回管理後台」 |
| 3 | `MyQrPage`：頁首、分頁組合、深連結、偏好寫回、依來源返回 | `src/components/MyQrPage.test.tsx`（jsdom；三個子面板替身化，同 `MyQrDialog.test` 作法——證據等級是 e2e/README 的 **B 級**：決策函式已測＋本檔驗決策接進元件） | 四格矩陣：已加入＝兩分頁預設邀請／未加入＝單分頁無分頁列／管理員∧已加入＝三分頁／**管理員∧未加入＝驗證碼＋掃描**；非管理員 `?tab=scan` 落回；`?tab=verify` 蓋過偏好；切換後偏好被寫入；會籍狀態取自 UserContext；`state.from` 為 `/referrals` 時返回導向 `/referrals`、無 state 走 `/dashboard`、白名單外的值不採用；副標帶 `hidden sm:block`；三分頁時 icon 帶 `hidden sm:inline`、兩分頁時不帶 |
| 4 | 接線：`MyQrEntry` 改 Link（帶 `state.from`、hover/touch 預熱）、刪 `MyQrDialog`、`App.tsx` 路由＋lazy＋舊路由轉址、`AdminDashboard` 捷徑、`useBackNavigation` 對照表 | `MyQrEntry.test.tsx`（href＋state 斷言，需 `MemoryRouter`）、`AdminDashboard.test.tsx`（「會員驗證」href 為 `/dashboard/qr?tab=scan`）、`src/hooks/useBackNavigation.test.tsx`（新：`/dashboard/qr` 返回 `/dashboard`）、`appShell.test.ts`（既有 lazy 契約）、`npm run check`（knip 抓孤兒） | `my-qr-button` 是連到 `/dashboard/qr` 的連結；`MyQrDialog` 無殘留引用；check 全綠 |
| 5 | 文件與 e2e 同步：規格書 §3 路由表（`/dashboard/qr` 新列；`/admin/verify` 改「舊路徑，轉址至 `/dashboard/qr?tab=scan`，不再單獨守門」）／§13.1 流程段／§13 判準註；溢版巡檢三條路由＋mock；fake-camera 啟動參數（`browser_type_launch_args`）＋掃描分頁第一屏斷言；`dashboard_steps.py` 註解 | `python3 scripts/check-spec-drift.py`、`python3 scripts/check-test-names.py`、CI 的 e2e 軌（`test_overflow_sweep.py`、`test_admin_mobile_layout.py` 新增一條） | spec-drift 綠（路由集合對照）；既有 e2e `open_invite_friend_panel` 流程不改步驟即通過；掃描分頁在 375×667 相機啟動下 `scanner-viewport` 底邊 ≤ 第一屏 |

<!-- 測試落點指引：純函式 → vitest node；元件行為 → vitest + jsdom pragma；
     後端 API → supabase/functions/api/*.test.ts；跨頁流程 → e2e .feature（CI 驗證） -->

e2e 不新增 Gherkin 情境：分頁組合與門面規則在階段 3 以 B 級證據涵蓋；路由守衛與
`/dashboard` 共用同一個 `RequireMembershipRoute`，`route_guards.feature` 已涵蓋。唯一新增
的 e2e 斷言是階段 5 的相機版面第一屏（那是只有真瀏覽器＋fake camera 才量得到的事）。

## 6. 開放問題（逃生口——留白是合格產出）

- [ ] **#1 掃描權限（業務判斷，影響範圍最大）**：需求描述「目前掃 QR 辨識身分只開放
      給管理者，不過現在想統一移至會員儀表板」——是**只搬入口**（方案 A，本規劃預設）
      還是**同時開放給一般會員掃**（方案 B）？規格 §13.1 的理由是「業主在門市／活動
      現場確認來的人是不是會員」，端點也綁管理員權限；規格未提會員互掃。若選 B，增量
      為：新端點 `POST /members/verify`（授權條件＝登入 ∧ 會籍有效 ∧ **`suspended_at`
      為 null**——停權與會籍是兩個獨立欄位，前端靠 `suspendedBlocked` 另擋，端點不能只
      驗會籍兩態）、`member_verify_logs` 的 `admin_id` 欄位語意改為「掃描者」（migration
      改名或加註）、`admin-gate.test` 與 `member-verify.test` 增修、規格 §13.1 安全／稽核
      段改寫、前端 `canScan` 從 `isAdmin` 改為恆真、`MemberVerifyScanner` 搬出 `admin/`
      （並改 ui-ux §7 路徑），且要決定**非管理員掃到的是否只看遮罩姓名**（推薦樹對會員
      就是遮罩顯示）。建議先做 A，B 另開規劃。
- [ ] **#2「在會員儀表板呈現 QR Code」的字面**：是否要在會員中心直接放一張 QR 縮圖當
      入口？縮圖在儀表板尺寸不可掃（驗證碼 token 太長，64–96px 的 QR 讀不出來），
      驗證碼縮圖還會讓每次進會員中心都打 `/members/verify-token` 並每 90 秒輪替；
      邀請 QR 縮圖可行（純前端推導）但未加入推薦計畫的人沒有。建議維持 QR 圖示按鈕
      （現狀）；若要縮圖，只放邀請 QR、未加入時退回圖示。
- [ ] **#3 `/admin` 頁首的「會員驗證」捷徑**：保留並改連 `/dashboard/qr?tab=scan`
      （建議——管理員平日在 `/admin` 工作，少走「會員中心 → 我的 QR → 掃描」三步；
      §2 的「依來源返回」讓它按返回鍵仍回 `/admin`，不再有導覽退化），還是依「統一」
      字面移除？

## 7. 風險與回滾

- 最壞情況：純前端搬家，功能與端點都沒變；回滾 = revert PR，無資料層變更。
- 相機生命週期：「切分頁也要停」與「相機還沒開好就離開」兩條路徑都由階段 2 的測試
  釘住；漏掉的症狀是相機指示燈常亮、下一次進分頁 `getUserMedia` 因裝置忙碌失敗。
- 三分頁在 375px 溢出：三分頁時 icon 在手機隱藏 ＋ 溢版巡檢三條路由把關；`TabsList`
  的 `overflow-x-auto` 是最後退路，不是設計目標。
- 掃描分頁第一屏：頁首＋分頁列比舊頁多約 18px，算式仍有餘裕；由 fake-camera e2e
  斷言把關，不靠人眼。
- 舊網址：`/admin/verify` 轉址保留，管理員手機主畫面的捷徑不會落到首頁。
- 返回目的地：`state.from` 走白名單，直接貼網址／state 遺失一律回 `/dashboard`，
  不會出現「返回到未知頁」。
- 載入延遲：預熱只在指標進入／觸碰入口時觸發，失敗靜默（lazy 路由本身會再抓一次）。
- 規格書：§3 路由表少列 `/dashboard/qr` 或漏改 `/admin/verify` 那列，`check-spec-drift`
  會紅——這是設計好的把關，不是風險。

## 修訂紀錄（第 2 版，回應 ./review.md）

| review.md 編號 | 處置 | 落在 |
|---|---|---|
| 1 P1 getUserMedia 競態 | 採納：resolve 後先檢查 `cancelled` 並當場 stop；加專屬測試 | §2 相機生命週期、階段 2 |
| 2 P1 溢版巡檢漏預設分頁 | 採納：加不帶 `after_load` 的 base entry，共三條 | §4 溢版巡檢、階段 5 |
| 3 P1 階段 1 破壞 `MyQrDialog` 呼叫端 | 採納：階段 1 同批改兩處呼叫 | §3、階段 1 |
| 4 P1 `normalizeMyQrTab` 漏 `scan` | 採納：列入階段 1 驗收 | §2、階段 1 |
| 5 P1 A/B 級證據自相矛盾 | 採納：改標 B 級 | 階段 3、§5 末段 |
| 6 P1 從 `/referrals` 返回退化 | 採納：`Link state.from` ＋白名單＋fallback，加斷言 | §2 返回目的地、§3、階段 3/4 |
| 7 P1 掃描分頁第一屏未重算／未量測 | 採納：重算（306px）；fake-camera e2e 斷言 | §4 掃描分頁、階段 5 |
| 8 P1 管理員∧未加入未枚舉 | 採納：故事 4 ＋四格矩陣 | §1、階段 3 |
| 9 P1 `AdminDashboard` href 無測試 | 採納：`AdminDashboard.test.tsx` 加 href 斷言 | 階段 4 |
| 10 P2 變體 B 漏 `suspended_at` | 採納：寫進 #1 授權條件 | §6 #1 |
| 11 P2 路由表存取層級措辭 | 採納：明寫「轉址、不再單獨守門」 | §3、階段 5 |
| 12 P2 `admin/` 資料夾邊界 | 採納：寫明代價並與 #1 連動 | §3、§6 #1 |
| 13 P2 aria-describedby 測試無後繼 | 採納：頁首契約（副標 `hidden sm:block`、說明不重複） | §3、§4、階段 3 |
| 14 P2 `useBackNavigation` 理由寫錯 | 採納：改成「不加會導回首頁」＋補測試 | §3、階段 4 |
| 15 P2 icon 隱藏拖累兩分頁 | 採納：依實際分頁數決定 | §4、階段 3 |
| 16 P2 lazy chunk 載入延遲 | 採納：入口 hover/touch 預熱 | §3、階段 4 |
| 17 P2 icon `aria-hidden` | 採納 | §4 |
| 18 P2 從 `/admin` 返回退化 | 採納：同第 6 條機制（`state.from='/admin'`） | §2、§3、§6 #3 |
| 需人工裁決 #1 相機啟動時機 | **未定**，建議切到分頁即啟動 | §4、review.md |
