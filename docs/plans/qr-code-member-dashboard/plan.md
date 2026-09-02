# 我的 QR 整合頁（qr-code-member-dashboard）規劃書

<!-- 由 /plan-feature 從 docs/_templates/plan.md 實例化。分支：claude/qr-code-member-dashboard-qs36st
     第 4 版：依第 2 輪四視角審查（./review.md，P0 0／P1 8／P2 13）修訂；人審 2026-09-02 追加裁決
     「誰掃過我」本次不做。第 3 版（方案 B）與第 2 版（方案 A）的修訂紀錄保留在末段。 -->

## 0. 一句話

讓會員從會員中心的「我的 QR」入口進到**一個獨立頁**（`/dashboard/qr`），把
邀請好友 QR、會員驗證碼、以及原本只給管理員的**掃碼驗證**整合在同一頁，並把掃碼
**開放給所有會籍有效的會員**（管理員亦可），因為使用者要的是「所有 QR 相關的事都
在那一頁」且會員之間也需要當面確認對方是不是有效會員；相機取景頁按規格判準走
獨立路由，不塞在對話框裡。

## 1. 使用者需求

- 對照規格書：§2.1 使用者角色（會員新增「掃碼驗證其他會員」能力）、§3 路由表
  （新增 `/dashboard/qr`、`/admin/verify` 改轉址）、§5.2 停權（現況守衛已硬鎖，文字要
  對齊程式碼）、§13.1 會員驗證（**為什麼／流程／安全／稽核四段都要改寫**：「為什麼」
  補會員互掃動機、掃描方從「admin」變成「會籍有效的會員或管理員」、端點從
  `/admin/members/verify` 變成 `/members/verify`、非管理員看遮罩名、有節流）、§13 末段
  「admin 功能放哪的判準」（相機掃碼走獨立路由——原則沿用，但掃描不再是 admin 功能）。
- 現況（codebase）：
  - `MyQrEntry`（會員中心與推薦管理共用的唯一入口）→ `MyQrDialog`（Radix Dialog）
    → 兩分頁「邀請好友」`InviteFriendPanelContent`／「會員驗證碼」`MemberVerifyQrTab`；
    分頁偏好存 localStorage（`myQrTabPreference.ts`）。`canShareInvite`／`canShowCode`
    都是 `joined && !!referralCode` 的複合判斷。
  - 掃碼：`/admin/verify` → `admin/MemberVerifyScanner`（相機＋手動輸入退路）→
    `POST /admin/members/verify`（`/admin/*` middleware ＋ handler 內 `isAdminUser`）；
    入口是 `/admin` 頁首的「會員驗證」按鈕。稽核表 `member_verify_logs(admin_id,
    member_id, result, verified_at)`。
  - 節流基礎設施：`bump_rate_limit(p_key, p_max, p_window_seconds)` RPC（`/auth/check-email`
    在用，fail-open）。
  - 全 `src/` 只有三類 QR 表面（邀請 QR／驗證碼 QR／掃描），本頁三分頁一一對應。
- 使用者故事（可驗證）：
  1. 會員（已加入推薦計畫且有推薦碼）在會員中心點「我的 QR」→ 到 `/dashboard/qr`，
     看到「邀請好友／會員驗證碼／掃描驗證」三分頁，停在上次慣用的分頁。
  2. 未加入推薦計畫（或尚無推薦碼）的會員 → 「會員驗證碼／掃描驗證」兩分頁。
  3. 管理員也走同一頁：分頁組合只看 `available.invite = joined && !!referralCode` 與
     `canScan` 兩個布林值（四種組合都在測試矩陣，含理論上的「一個分頁都不能掃」＝只剩
     驗證碼、不畫分頁列）。
  4. 任何能進這頁的人在「掃描驗證」分頁對準對方出示的驗證碼 → 看到對方**姓名與會籍
     四態**；**管理員看全名，一般會員看遮罩名**（「王○明」，與推薦網絡同一支函式），
     遮罩時結果卡多一行小字「姓名部分遮蔽以保護隱私」；震動回饋、手動輸入退路與今日
     `/admin/verify` 一致。
  5. `/admin` 的「會員驗證」按鈕與舊網址 `/admin/verify` 都直接落在
     `/dashboard/qr?tab=scan`，相機立刻啟動（人審裁決）。**鍵盤方向鍵在分頁間移動焦點
     不會切換面板**（不會因為瀏覽分頁就跳出相機權限框），要按 Enter／Space 或點擊才切。
  6. 會籍過期或停權的會員進不了這頁（`RequireMembershipRoute` 守門）；即使繞過前端
     直呼端點，後端回 403。同一人一分鐘內掃超過 30 次 → 429，畫面顯示「掃描過於頻繁」。
  7. 在頁內切離「掃描驗證」或離開此頁 → 相機串流停止（含「相機還沒開好就離開」）。
  8. 推薦管理頁（`/referrals`）的同一顆「我的 QR」入口連到同一頁；**按頁面的返回鍵
     回到進來的那一頁**（`/referrals`、`/dashboard`、`/admin`；直接貼網址則回
     `/dashboard`）。
- 不做什麼：
  - 不改驗證碼的簽發端點、token TTL（90 秒）、驗簽邏輯；不改邀請卡／分享按鈕；
    不改「加入推薦計畫」流程與入口。
  - 不在會員中心放實際的 QR 縮圖（人審裁決）。
  - **不做「誰掃過我」的被掃方可見性**（人審裁決 2026-09-02）：稽核表照寫（掃描者、
    被掃者、時間），有爭議時管理員在 Supabase Studio 查；驗證碼要本人主動出示且只活
    90 秒，被掃本身就是知情的。不做稽核紀錄的前端查閱介面。

## 2. 系統設計

- 資料流：
  - 會員驗證碼分頁：`useMemberVerifyToken(active)` → `GET /members/verify-token`
    （登入本人，**不變**）→ 到期前自動換發。`active` 改為 `tab === 'verify'`。
  - 掃描分頁：`MemberVerifyScanner` → **`POST /members/verify`**（新端點，取代
    `POST /admin/members/verify`，後者刪除）。
- **`POST /members/verify` 授權與行為**（同一支 handler，順序固定；所有錯誤一律用
  同 handler 既有的 `{ success: false, error: { code, message } }` 信封）：
  1. `requireAuth` → 否則 401（全站 `requireAuth` 既有信封）。
  2. 讀掃描者 `profiles(is_admin, suspended_at)` 與 `user_account_status(status, end_date)`；
     非管理員時以 **`deriveNodeStatus(acct, suspended_at)`** 判定，`status` 不在
     `active`/`expiring` → 403 `{ code: 'verifier_not_eligible', message: '會籍有效的會員
     才能掃描驗證' }`。同一支函式判定掃描者與被掃者，「停權」與「會籍」兩個獨立欄位
     一次涵蓋。
  3. **節流**：`sb().rpc('bump_rate_limit', { p_key: \`verify:${user.id}\`, p_max: 30,
     p_window_seconds: 60 })`，回 `false` → 429 `{ code: 'rate_limited', message: '掃描
     過於頻繁，請稍後再試' }`；RPC 本身出錯 → 放行（fail-open，與 `/auth/check-email`
     同：限流器故障不擋正常使用，主要防線仍是登入＋簽章）。30 次／分鐘對人工掃描
     （每次至少兩三秒）碰不到，對「側拍一批他人短效碼批次驗證」則是硬上限；稽核照寫。
  4. `verifyMemberToken`：過期／無效 → 400 `token_expired`／`token_invalid`（不變）。
  5. 讀被掃者 `profiles(name, suspended_at)` 與 `user_account_status` → `deriveNodeStatus`
     四態；查無會員 → 404（不變）。
  6. 稽核 fail-closed：`member_verify_logs` 插入 `{ verifier_id, member_id, result: 'ok' }`，
     失敗回 500（不變）。
  7. 回 `{ displayName, nameMasked, status, activeUntil }`：管理員 `displayName` 全名、
     `nameMasked: false`；非管理員 `maskNameByGen(name, MASK_GEN_FORCE)` 且
     `nameMasked: true`。`MASK_GEN_FORCE = 2` 是具名常數並註解「借用推薦網絡二代以上的
     遮罩樣式，與推薦代數無關」。`api-contract.ts` 的 `MemberVerifyResponseSchema` 加
     `nameMasked: bool()`，註解改為「會籍有效的會員或管理員掃碼」。
- **稽核表 migration** `supabase/migrations/20260901000001_member_verify_logs_verifier.sql`：
  `admin_id` 改名 `verifier_id`（FK、`on delete set null` 隨欄位保留）、索引
  `member_verify_logs_admin_idx` 改名 `member_verify_logs_verifier_idx`、表註解與欄位
  註解改為「會籍有效的會員或管理員掃碼驗證成功時寫入」。無資料搬移，API 是唯一
  寫入者。**這是本 repo 第一支 `rename column`**（既有慣例是留欄名加註解，如
  `is_canceled`）：此表是資安稽核追溯用途，欄名叫 `admin_id` 卻存一般會員，誤導的代價
  高於一般業務欄位，故例外改名。跑 `python3 scripts/check-migration-versions.py`。
- 純前端新增狀態：URL query `?tab=invite|verify|scan` ＋既有 localStorage 偏好。決策
  順序（純函式）：URL 指定且可用 → 偏好可用 → `verify`（永遠可用）。使用者主動切換時
  同時寫偏好與 URL（`replace`）。`normalizeMyQrTab` 必須把 `'scan'` 當合法值。
  **可用分頁集合由一支純函式產生**：`availableMyQrTabs({ joined, referralCode, canScan })`
  → `{ invite: joined && !!referralCode, verify: true, scan: canScan }`，`MyQrPage` 與
  `MyQrEntry.canShowCode` 都吃它，不再各寫一份 `joined && !!referralCode`。
- `canScan`（前端門面）＝ `isAdmin || accountStatus === 'active'`，與後端規則對齊
  （`accountStatus` 是後端 `acct?.status ?? 'expired'` 的原始兩態，其 pre-image 恰等於
  後端 `{active, expiring}`）；在 `/dashboard/qr` 上對所有能進頁的人都為真。
- 返回目的地：`Link` 以 `state={{ from: pathname }}` 記住入口；`MyQrPage` 的返回鍵
  讀 `location.state.from`，只接受白名單 `/dashboard`、`/referrals`、`/admin`，其餘落回
  `useBackNavigation()`（對照表補 `'/dashboard/qr': '/dashboard'`）。
- 相機生命週期：`MemberVerifyScanner` 的 effect 在 `await getUserMedia()` 之後**先檢查
  `cancelled`，是就當場 `stop()` 剛拿到的 stream 再 return**——現行寫法在 resolve 前
  卸載會漏掉那條串流（指示燈常亮、下次開相機因裝置忙碌失敗）。專屬測試釘住。
- 部署順序：migration 與 Edge Function 換版之間**兩個方向都有一段視窗**——migration
  先套用時，仍在線的舊程式寫 `admin_id` 會失敗；程式先上線時，新程式寫 `verifier_id`
  會失敗。兩者都走稽核 fail-closed → 驗證回 500、不寫錯資料；Edge Function 是原子
  替換，視窗只有數秒到數分鐘，develop 與晉升 main 各發生一次，可接受。

## 3. 架構影響

- 新頁 `src/components/MyQrPage.tsx`（與 `MemberDashboard`/`ReferralManagement` 同層），
  以 `lazyNamed` 掛在 `App.tsx` 會員區 lazy 群組；路由 `/dashboard/qr`，守衛與 `/dashboard`
  相同（`ProtectedRoute` ＋ `RequireMembershipRoute`；`resolveMembershipRedirect` 第一條
  `isAdmin → null`，管理員無會籍也放行）。`BottomNav` 的「會員」`NavLink` 沒有 `end`，
  在 `/dashboard/qr` 仍高亮——不動導覽契約。
- **後端**：`POST /admin/members/verify` 整段搬出 `/admin/*` 命名空間成為
  `POST /members/verify`，授權寫進 handler（本 repo 已有先例：`claim-reward` 在 handler
  內判 `subscription_invalid`／`suspended` → 403），handler 註解明講「不在 middleware
  之下，授權是本 handler 自己的責任」。`admin-gate.test.ts` 的 `ADMIN_ROUTES` 移除該列
  （端點已不存在，留著會 404 而非 401）；`member-verify.test.ts` 改寫成新端點的授權矩陣、
  遮罩、節流與稽核欄位。
- **載入延遲**：`MyQrEntry` 的按鈕在 `onPointerEnter`／`onTouchStart`／`onFocus` 觸發
  `import('../MyQrPage')` 預熱（Vite 對同一模組的動態 import 回同一個 promise，與
  `App.tsx` 的 lazy 共用 chunk）。
- `MyQrEntry`：「我的 QR」按鈕改成 `Link`（`asChild`，`data-testid` 不變）到
  `/dashboard/qr`，帶 `state={{ from: location.pathname }}`；拿掉 `qrOpen` 與 `MyQrDialog`；
  `canShowCode` 改吃 `availableMyQrTabs(...).invite`。**不新增任何行為 prop**。
- `MyQrDialog.tsx` ＋測試**刪除**（knip 會擋住漏刪）；分頁契約測試搬進
  `MyQrPage.test.tsx`；「不放總述、`aria-describedby`」那條由頁首契約接住（§4）。
- **`MemberVerifyScanner` 搬家**：`src/components/admin/` → `src/components/referral/`
  （與 `MemberVerifyQrTab` 同住，「驗證」元件放 `referral/` 是既有先例；掃描已不是管理員
  專屬，留在 `admin/` 會打破「`admin/` 只被 `AdminDashboard` 組裝」的不變式），測試檔
  同步搬。改成面板：拿掉頁首與 `Card` 外殼；不再依賴 `useNavigate`；端點改
  `/members/verify`；依 `nameMasked` 顯示遮罩說明；`verifier_not_eligible`／`rate_limited`
  兩個錯誤碼有自己的標題（見 §4）。`ui-ux-guidelines.md` §7 末段的〔實作〕路徑同步改。
- `myQrTabPreference.ts`：`MyQrTab` 加 `'scan'`；`normalizeMyQrTab` 認 `scan`；
  `resolveMyQrTab(available, requested, preferred)`；新增 `availableMyQrTabs(...)`。
  **同一批**把 `MyQrDialog.tsx` 第 46、51 行的舊簽名呼叫改成新簽名，否則階段 1 之後
  `tsc` 會以 TS2554 紅燈直到刪檔。
- `useBackNavigation`：`ROUTE_HIERARCHY` 加 `'/dashboard/qr': '/dashboard'`。**不加會導回
  首頁**（前綴比對迴圈先命中既有的 `'/dashboard': '/'`），是必要修正；該 hook 目前沒有
  任何測試，接線階段補一條。`useBreadcrumbs` 名稱表加「我的 QR」。
- `App.tsx`：拿掉 `MemberVerifyScanner` 的 lazy import 與 `/admin/verify` 的 `AdminRoute`
  路由；`/admin/verify` 改成 `<Navigate to="/dashboard/qr?tab=scan" replace
  state={{ from: '/admin' }} />`（比照 `/referral-reward-contract` 舊 slug 轉址）。
  `AdminDashboard` 頁首的「會員驗證」按鈕改連 `/dashboard/qr?tab=scan`、帶
  `state={{ from: '/admin' }}`（人審裁決：保留）。**`state` 不會反映在 href 上**，兩處都
  要有 state 的斷言（階段 5）。
- **規格書 §3 路由表在階段 5 隨 `App.tsx` 一起改**（`check-spec-drift.py` 是 framework-check
  軌的機械把關，路由集合不同步就紅），其餘規格段落在階段 6。
- 與 multi-step-flow 四契約無關（無表單、無金流）。
- 效能：`jsqr` 仍是掃描面板內的動態 import；新頁 lazy，entry chunk 不長大。
- 安全：權限邊界從「管理員」放寬為「會籍有效的會員或管理員」，**邊界在後端 handler**，
  前端 `canScan` 只是門面；個資面：非管理員只拿遮罩名＋會籍狀態，且要對方主動出示
  90 秒短效碼；每人每分鐘 30 次節流擋批次濫用；token 不含個資、只能由後端解析。

## 4. UI/UX

- 頁首沿用 `MemberDashboard` 模式：`ArrowLeft` icon 按鈕（`aria-label`「返回上一頁」）
  ＋ h1「我的 QR」＋副標「邀請好友、出示驗證碼、掃描驗證」在手機隱藏（`hidden sm:block`）。
  **頁首契約**：副標元素必須帶 `hidden sm:block`（自動測試），且各分頁內自己的一句說明
  不得與副標重複（**由 `/review-implementation` 人審把關，不自動化**——三句說明分屬三個
  子元件，源碼比對式的斷言比它守的東西還脆）。
- 分頁：`Tabs` 實例加 **`activationMode="manual"`**（只在 `MyQrPage`，不動 `ui/tabs.tsx`
  基底）——Radix 預設 `automatic` 會讓鍵盤方向鍵一掃過「掃描驗證」就掛載相機並跳權限框。
  `TabsList` 用 `AdminDashboard` 已驗證的四件套
  `w-full grid grid-cols-{2|3} h-auto pointer-coarse:[&>[role=tab]]:min-h-[44px]`
  （44px 觸控目標，順手還債）。三分頁在 375px 的算式：每格 112px、可放 94px；「會員驗證碼」
  五字估 70px ＋ icon 16 ＋ gap 6 ＝ 92px，餘裕 2px 不可靠 → **只在實際渲染三個分頁時**把
  icon 在 `<sm` 隱藏（`hidden sm:inline` 依 tab 數決定）。方案 B 下多數使用者看到的是三
  分頁。**70px 是估計不是實測，且 grid 下放不下是 ink overflow（畫到隔壁格子，一般溢版
  巡檢抓不到）**：e2e 用既有 `ink_overflowing_children` 對 `MyQrPage` 的 `TabsList` 加
  硬斷言（比照 `test_admin_tab_labels_do_not_ink_overflow`）。三顆 icon 補
  `aria-hidden="true"`。只有一個可用分頁時不畫分頁列。
- 分頁順序與預設：邀請好友 → 會員驗證碼 → 掃描驗證；預設仍是邀請好友並記住上次選擇。
  「掃描驗證」的動作對象在標籤層級不夠明確（可能被讀成「掃描以驗證自己」），94px 預算
  下不加長標籤，**已知取捨**：靠分頁內第一行說明句「對準對方出示的會員驗證碼，確認對方
  的會員身分與會籍」補足，且 `activationMode="manual"` 讓誤瀏覽不會直接跳權限框。
- 「會員驗證碼」分頁既有文案「出示這組碼給店家掃描」預設驗證方是店家，方案 B 下改成
  「出示這組碼供對方掃描，即可確認您的會員身分與會籍」。
- 掃描分頁 = 既有取景框版面；`CardTitle` 改成置中說明句；手動輸入退路不變；切到分頁
  即啟動相機（人審裁決）。結果卡顯示後端回的 `displayName`；`nameMasked` 為真時多一行
  小字「姓名部分遮蔽以保護隱私」（未加入推薦計畫的會員從沒看過遮罩名，這是他們最需要
  對結果有信心的一刻）。**錯誤態分三種標題**：`verifier_not_eligible` → 「您目前無法掃描」
  ＋後端訊息（相機開著時本人會籍到期或被停權，不是純理論分支，且要讓現場的人一眼看出
  是自己的問題不是對方的）；`rate_limited` → 「掃描過於頻繁」；其餘維持「無法驗證」。
  三種都走同一個 `aria-live` 節點與「繼續掃描下一位」。
  **第一屏重算**（375×667，`BottomNav` 佔底部 56）：Navbar 64 ＋ 公告橫幅 40 ＋ `main`
  py-6 24 ＋ 頁首 76 ＋ TabsList（44＋6）50 ＋ 分頁內距 16 ＋ 說明句 36 ≈ **306px**；取景框
  高 = min(45dvh≈300, 343×3/4≈257) ＝ 257 → 底邊 563 < 611（667−56）。**驗收工具**：既有
  `first_screen_position` 只回頂邊，量不到底邊 → `e2e/layout_probe.py` 補 `element_box`
  （回 `top/bottom/height`）或讓 `first_screen_position` 多回 `bottom`；斷言「`scanner-viewport`
  底邊 ≤ `BottomNav`（`nav[aria-label="主要導覽"]`）的頂邊」，用實際量到的導覽列位置，不
  寫死 56。e2e 以 Chromium `--use-fake-device-for-media-stream` ＋
  `--use-fake-ui-for-media-stream` 讓相機真的啟動（`browser_type_launch_args` fixture，
  比照 `test_admin_mobile_layout.py` 覆寫 `browser_context_args` 的手法）。
- 行動版：`BottomNav` 保持可見、「會員」高亮；`main` 的 `pb-24` 讓疊層結果不被導覽列遮住。
- 三態：邀請（無碼 → 分頁不存在）；驗證碼（載入／錯誤＋重試／有碼，既有）；掃描（相機
  不可用 → 手動輸入；驗證中／三種錯誤標題／結果，疊層）。
- 可測試性：`data-testid` 沿用 `my-qr-button`、`invite-tab`、`verify-tab`、
  `member-verify-qrcode`、`scanner-viewport`、`verify-result`；新增 `scan-tab`。
- 溢版巡檢：`e2e/test_overflow_sweep.py` 的 `ROUTES` 加三條——(a) `/dashboard/qr` 不帶
  `after_load`（預設「邀請好友」分頁）；(b) 同路由 `after_load` 切到驗證碼分頁；(c)
  `/dashboard/qr?tab=scan`。`backend_api_mock` 補 `/members/verify-token` 的假回應（比照
  `set_subscription_status` 的 `_route` 寫法）。
- 新 e2e 檔 `e2e/test_my_qr_mobile_layout.py`（pytest，比照 `test_admin_mobile_layout.py`）：
  375px 三分頁 `TabsList` 無 ink overflow；fake camera 下 `scanner-viewport` 底邊在
  `BottomNav` 之上。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點（vitest / deno test / e2e） | 驗證標準 |
|---|---|---|---|
| 1 | 分頁決策純函式：`MyQrTab` 加 `scan`；`normalizeMyQrTab` 認 `scan`；`resolveMyQrTab(available, requested, preferred)`；`availableMyQrTabs({ joined, referralCode, canScan })`；**同批改 `MyQrDialog.tsx` 兩處呼叫**維持 `tsc` 綠 | `src/utils/myQrTabPreference.test.ts`（node） | `normalizeMyQrTab('scan')` 原樣保留；URL 指定可用分頁優先；不可用落回偏好；偏好也不可用落回 `verify`；髒值收斂；`availableMyQrTabs` 在 `joined` 但無 `referralCode` 時 `invite=false`、`verify` 恆真、`scan=canScan`；`MyQrDialog.test` 既有 4 條仍綠 |
| 2 | 後端：`POST /members/verify` 取代 `/admin/members/verify`（授權矩陣、節流、遮罩＋`nameMasked`、統一錯誤信封、`MASK_GEN_FORCE`、稽核 `verifier_id`）＋ migration 改名 ＋ `api-contract` | `supabase/functions/api/member-verify.test.ts`（改寫）、`admin-gate.test.ts`（移除該列）；**本機無 deno／supabase CLI，紅綠以 CI `api-tests` 軌為準**；`python3 scripts/check-migration-versions.py` | 有效會員掃 → 200、`displayName` 遮罩、`nameMasked: true`、稽核 `verifier_id`＝掃描者；管理員掃 → 全名、`nameMasked: false`；過期呼叫者 → 403 `verifier_not_eligible`（`{ success:false, error:{code,message} }` 信封）；效期內但停權的呼叫者 → 403；匿名 → 401；同一人一分鐘內第 31 次 → 429 `rate_limited`；token 過期 → 400 `token_expired` 且不留稽核；被掃者停權 → `suspended`；舊路徑 `/api/admin/members/verify` → 404 |
| 3 | 掃描面板：搬到 `referral/`、移除頁首／返回鈕／Card、端點改 `/members/verify`、遮罩說明列、三種錯誤標題、卸載即停相機（含「相機還沒開好」） | `src/components/referral/MemberVerifyScanner.test.tsx`（jsdom，既有 10 條隨檔搬） | 既有連續掃描／震動／疊層契約全綠；新增：穩態卸載停止所有 track；`getUserMedia` 延後 resolve、resolve 前卸載仍停止 track；不再渲染返回管理後台；呼叫的是 `/members/verify`；`nameMasked` 為真時顯示「姓名部分遮蔽以保護隱私」、為假時不顯示；`verifier_not_eligible` 顯示「您目前無法掃描」、`rate_limited` 顯示「掃描過於頻繁」、其他錯誤維持「無法驗證」 |
| 4 | `MyQrPage`：頁首、分頁組合、深連結、偏好寫回、依來源返回、`activationMode="manual"`；`MemberVerifyQrTab` 文案 | `src/components/MyQrPage.test.tsx`（jsdom；三個子面板替身化——證據等級 **B 級**）、`MemberVerifyQrTab.test.tsx`（文案） | 四格矩陣 `available.invite × canScan`：(T,T)＝三分頁預設邀請／(F,T)＝驗證碼＋掃描／(T,F)＝邀請＋驗證碼／(F,F)＝單分頁無分頁列；`joined` 但無 `referralCode` 落在 `invite=false` 那一格；`canScan` 對管理員無會籍為真、對 `accountStatus === 'active'` 為真；`?tab=scan` 在 `canScan` 為假時落回；`?tab=verify` 蓋過偏好；切換後偏好被寫入；會籍狀態取自 UserContext；`state.from` 為 `/referrals` → 返回 `/referrals`、為 `/admin` → 返回 `/admin`、無 state → `/dashboard`、白名單外不採用；副標帶 `hidden sm:block`；三分頁時 icon 帶 `hidden sm:inline`、兩分頁時不帶；`Tabs` 帶 `activationMode="manual"`（方向鍵移動焦點不切換面板）；驗證碼分頁文案為「出示這組碼供對方掃描…」 |
| 5 | 接線：`MyQrEntry` 改 Link（帶 `state.from`、hover/touch 預熱、`canShowCode` 改吃共用函式）、刪 `MyQrDialog`、`App.tsx` 路由＋lazy＋舊路由轉址（帶 state）、`AdminDashboard` 捷徑（帶 state）、`useBackNavigation` 對照表；**規格書 §3 路由表同批改**（`/dashboard/qr` 新列；`/admin/verify` 改「舊路徑，轉址至 `/dashboard/qr?tab=scan`，不再單獨守門」） | `MyQrEntry.test.tsx`（href＋state 斷言，需 `MemoryRouter`）、`AdminDashboard.test.tsx`（`MemoryRouter` ＋ 目標路由探針：點擊後 `location.pathname === '/dashboard/qr'`、`search === '?tab=scan'`、`state.from === '/admin'`）、`appShell.test.ts`（既有 lazy 契約＋新增：`/admin/verify` 的 `<Navigate>` 帶 `state={{ from: '/admin' }}` 的 source-level 斷言）、`src/hooks/useBackNavigation.test.tsx`（新：`/dashboard/qr` 返回 `/dashboard`）、`npm run check`（knip 抓孤兒）、`python3 scripts/check-spec-drift.py` | `my-qr-button` 是連到 `/dashboard/qr` 的連結且帶 `state.from`；`MyQrDialog` 無殘留引用；check 與 spec-drift 全綠 |
| 6 | 文件與 e2e 同步：規格書 §2.1 角色表／§5.2 停權措辭對齊守衛現況／§13.1 **四段**（為什麼補會員互掃動機；流程；安全含節流；稽核含 `verifier_id`）／§13 判準註；`ui-ux-guidelines` §7 路徑；溢版巡檢三條路由＋mock；fake-camera 啟動參數；`layout_probe.py` 底邊探針；新檔 `test_my_qr_mobile_layout.py`（ink overflow ＋ 第一屏底邊）；`dashboard_steps.py` 註解改對（預設是邀請好友） | `python3 scripts/check-spec-drift.py`、`python3 scripts/check-test-names.py`、`python3 scripts/check-document-naming.py`、CI 的 e2e 軌 | spec-drift 綠；既有 e2e `open_invite_friend_panel` 流程不改步驟即通過；375px 三分頁無 ink overflow；相機啟動下 `scanner-viewport` 底邊 ≤ `BottomNav` 頂邊 |

<!-- 測試落點指引：純函式 → vitest node；元件行為 → vitest + jsdom pragma；
     後端 API → supabase/functions/api/*.test.ts；跨頁流程 → e2e .feature（CI 驗證） -->

e2e 不新增 Gherkin 情境：分頁組合與門面規則在階段 4 以 B 級證據涵蓋；路由守衛與
`/dashboard` 共用同一個 `RequireMembershipRoute`，`route_guards.feature` 已涵蓋；後端
授權矩陣在階段 2 的 Deno 測試。新增的 e2e 只有階段 6 的兩條版面斷言（那是只有真瀏覽器
才量得到的事）。階段 5 與 6 若分開 push，階段 5 必須自帶 §3 路由表異動，否則 framework-check
軌會紅。

## 6. 開放問題（逃生口——留白是合格產出）

全部已人審裁決（紀錄在 `./review.md` 兩輪的「處置」節）：

- [x] **#1 掃描權限** → 方案 B：開放所有會籍有效的會員（2026-09-01）。
- [x] **#2 儀表板 QR 縮圖** → 不放（2026-09-01）。
- [x] **#3 `/admin` 捷徑** → 保留並改連 `/dashboard/qr?tab=scan`（2026-09-01）。
- [x] **#4 相機啟動時機** → 切到分頁即啟動（2026-09-01）；第 4 版補 `activationMode="manual"`
      讓「切到」限於明確的點擊／按鍵。
- [x] **#5 非管理員掃到的姓名** → 遮罩（2026-09-01）；第 4 版補說明列與 `nameMasked`。
- [x] **#6 被掃方能否看到「誰掃過我」** → 本次不做，稽核維持後台查閱（2026-09-02）。

目前無未決問題。

## 7. 風險與回滾

- 最壞情況：前端搬家＋一個端點改名放寬＋稽核欄位改名。回滾 = revert PR；migration
  的回滾是另一支 migration 把欄位與索引名改回去，無資料遺失。
- 權限放寬：邊界在後端 handler，以 `deriveNodeStatus` 同時排除過期與停權；階段 2 的
  Deno 測試逐格釘住授權矩陣，CI `api-tests` 軌把關（本機不可跑）。
- 濫用：每人每分鐘 30 次節流（`bump_rate_limit`，fail-open）。誤傷情境是活動報到台
  一人連續掃 30 人以上／分鐘，人工做不到；真發生時畫面明示「掃描過於頻繁」，一分鐘後
  自動恢復。
- 個資：非管理員只拿遮罩名＋會籍狀態；遮罩沿用推薦網絡同一支函式；結果卡有說明列。
- 部署順序：migration 與函數換版之間兩個方向都有短暫視窗，皆為稽核 fail-closed → 驗證
  500、不寫錯資料。
- `rename column` 是本 repo 首例：影響面已核實只有 API 一個讀寫端與兩支 Deno 測試；
  FK 與索引隨欄位保留。
- 相機生命週期：「切分頁也要停」與「相機還沒開好就離開」由階段 3 測試釘住；
  `activationMode="manual"` 讓鍵盤瀏覽不會誤啟相機。
- 三分頁在 375px：ink overflow 由 e2e 硬斷言把關，不再只靠估計值；`TabsList` 的
  `overflow-x-auto` 是最後退路。
- 掃描分頁第一屏：由 fake-camera e2e 量底邊對 `BottomNav` 頂邊，不寫死視窗高度。
- 停留期間資格改變（本人會籍到期／被停權）：後端 403，前端「您目前無法掃描」明示是
  自己的問題。
- 舊網址：`/admin/verify` 轉址保留；舊端點 `/admin/members/verify` 直接移除（唯一呼叫
  端是本 repo 的前端，同一 PR 一起改）。
- 返回目的地：`state.from` 走白名單，直接貼網址／state 遺失一律回 `/dashboard`。
- 規格書：§3 路由表在階段 5 同批改，`check-spec-drift` 是設計好的把關；§5.2 是既有
  spec-vs-code 落差（守衛已硬鎖停權會員），本次順手對齊，不是新行為。

## 修訂紀錄

### 第 4 版（回應第 2 輪 ./review.md 與 2026-09-02 追加裁決）

| review.md 第 2 輪編號 | 處置 | 落在 |
|---|---|---|
| 1 P1 會員互掃無節流 | 採納：`bump_rate_limit`，`verify:<user.id>`，30 次／60 秒，fail-open，429 | §2 第 3 步、§4 錯誤標題、階段 2/3、§7 |
| 2 P1 §13.1「為什麼」段漏改 | 採納：四段都改 | §1、階段 6 |
| 3 P1 「誰掃過我」未裁決 | 人審裁決：本次不做，記進不做什麼與 #6 | §1、§6 |
| 4 P1 `first_screen_position` 量不到底邊 | 採納：探針補底邊；斷言對 `BottomNav` 頂邊 | §4、階段 6 |
| 5 P1 grid ink overflow 抓不到 | 採納：`ink_overflowing_children` 硬斷言，新 e2e 檔 | §4、階段 6 |
| 6 P1 Radix `activationMode` 預設 automatic | 採納：`MyQrPage` 的 `Tabs` 加 `manual` ＋測試 | §4、階段 4、§6 #4 |
| 7 P1 遮罩名無說明 | 採納：`nameMasked` 欄位＋結果卡說明列 | §2 第 7 步、§4、階段 2/3 |
| 8 P1 `/admin` 捷徑與轉址缺 state 斷言 | 採納：路由探針測試＋source-level 斷言 | 階段 5 |
| 9 P2 403 信封不一致 | 採納：統一 `{ success:false, error:{code,message} }` | §2 |
| 10 P2 `maskNameByGen(name, 2)` 魔術數字 | 採納：`MASK_GEN_FORCE` 具名常數＋註解 | §2 第 7 步 |
| 11 P2 首次 rename column 未對照慣例 | 採納：§2 寫明例外理由 | §2、§7 |
| 12 P2 `dashboard_steps.py` 註解錯 | 採納 | 階段 6 |
| 13 P2 §5.2 停權措辭與守衛現況落差 | 採納：階段 6 順手對齊 | §1、階段 6、§7 |
| 14 P2 階段 4 缺 `/admin` 返回斷言 | 採納 | 階段 4 |
| 15 P2 部署視窗只寫一個方向 | 採納：兩個方向都寫 | §2、§7 |
| 16 P2 `available.invite` 複合判斷 | 採納：`availableMyQrTabs` 共用純函式，`MyQrEntry` 也吃它 | §2、§3、階段 1/4/5 |
| 17 P2 頁首契約「不重複」驗收方式 | 採納：明講由 `/review-implementation` 人審把關 | §4 |
| 18 P2 階段 5/6 分開 push 會 spec-drift 紅 | 採納：§3 路由表移到階段 5 | §3、階段 5、§5 末段 |
| 19 P2 「給店家掃描」文案 | 採納：改「供對方掃描」 | §4、階段 4 |
| 20 P2 「掃描驗證」命名 | 採納：記為已知取捨，靠說明句與 manual 啟用補足 | §4 |
| 21 P2 403 在停留期間會發生、視覺無區辨 | 採納：三種錯誤標題 | §4、階段 3、§7 |

### 第 3 版（方案 B，回應 2026-09-01 人審裁決）

| 裁決 | 落在 |
|---|---|
| #1 開放所有會籍有效的會員掃描 | §0、§1、§2 端點授權與遮罩、migration、§3 後端與搬家、階段 2/3、§7 |
| #2 不放縮圖 | §1 不做什麼 |
| #3 保留 `/admin` 捷徑 | §3 `App.tsx`／`AdminDashboard` |
| #4 切到分頁即啟動相機 | §4 掃描分頁 |
| #5 非管理員看遮罩名 | §2、§4 結果卡 |
| 第 1 輪第 10 條（`suspended_at`） | §2 第 2 步用 `deriveNodeStatus` 一併涵蓋 |
| 第 1 輪第 12 條（`admin/` 邊界） | §3 掃描面板搬到 `referral/` |

### 第 2 版（方案 A，回應第 1 輪 ./review.md）

| review.md 第 1 輪編號 | 處置 |
|---|---|
| 1 P1 getUserMedia 競態 | 採納：resolve 後先檢查 `cancelled` 並當場 stop；加專屬測試 |
| 2 P1 溢版巡檢漏預設分頁 | 採納：加不帶 `after_load` 的 base entry |
| 3 P1 階段 1 破壞 `MyQrDialog` 呼叫端 | 採納：階段 1 同批改兩處呼叫 |
| 4 P1 `normalizeMyQrTab` 漏 `scan` | 採納 |
| 5 P1 A/B 級證據自相矛盾 | 採納：改標 B 級 |
| 6 P1 從 `/referrals` 返回退化 | 採納：`Link state.from` ＋白名單＋fallback |
| 7 P1 掃描分頁第一屏未重算／未量測 | 採納：重算；fake-camera e2e |
| 8 P1 管理員∧未加入未枚舉 | 採納：四格矩陣 |
| 9 P1 `AdminDashboard` href 無測試 | 採納 |
| 10–18 P2 | 全數採納（`suspended_at`、路由表措辭、`admin/` 邊界、aria-describedby 後繼、`useBackNavigation` 理由、icon 依分頁數、預熱、`aria-hidden`、從 `/admin` 返回） |
