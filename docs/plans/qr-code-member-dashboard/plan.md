# 我的 QR 整合頁（qr-code-member-dashboard）規劃書

<!-- 由 /plan-feature 從 docs/_templates/plan.md 實例化。分支：claude/qr-code-member-dashboard-qs36st
     第 3 版（方案 B）：2026-09-01 人審裁決——掃描開放所有會籍有效的會員、非管理員看遮罩名、
     不放儀表板縮圖、保留 /admin 捷徑、切到分頁即啟動相機。第 2 版（方案 A）對第 1 輪審查的
     回應仍保留在末段「修訂紀錄」。 -->

## 0. 一句話

讓會員從會員中心的「我的 QR」入口進到**一個獨立頁**（`/dashboard/qr`），把
邀請好友 QR、會員驗證碼、以及原本只給管理員的**掃碼驗證**整合在同一頁，並把掃碼
**開放給所有會籍有效的會員**（管理員亦可），因為使用者要的是「所有 QR 相關的事都
在那一頁」且會員之間也需要當面確認對方是不是有效會員；相機取景頁按規格判準走
獨立路由，不塞在對話框裡。

## 1. 使用者需求

- 對照規格書：§2.1 使用者角色（會員新增「掃碼驗證其他會員」能力）、§3 路由表
  （新增 `/dashboard/qr`、`/admin/verify` 改轉址）、§13.1 會員驗證（流程／安全／稽核
  三段都要改寫：掃描方從「admin」變成「會籍有效的會員或管理員」、端點從
  `/admin/members/verify` 變成 `/members/verify`、非管理員看遮罩名）、§13 末段
  「admin 功能放哪的判準」（相機掃碼走獨立路由——原則沿用，但掃描不再是 admin 功能，
  註記要改寫）。
- 現況（codebase）：
  - `MyQrEntry`（會員中心與推薦管理共用的唯一入口）→ `MyQrDialog`（Radix Dialog）
    → 兩分頁「邀請好友」`InviteFriendPanelContent`／「會員驗證碼」`MemberVerifyQrTab`；
    分頁偏好存 localStorage（`myQrTabPreference.ts`）。
  - 掃碼：`/admin/verify` → `admin/MemberVerifyScanner`（相機＋手動輸入退路）→
    `POST /admin/members/verify`（`/admin/*` middleware ＋ handler 內 `isAdminUser`）；
    入口是 `/admin` 頁首的「會員驗證」按鈕。稽核表 `member_verify_logs(admin_id,
    member_id, result, verified_at)`。
  - 全 `src/` 只有三類 QR 表面（邀請 QR／驗證碼 QR／掃描），本頁三分頁一一對應。
- 使用者故事（可驗證）：
  1. 會員（已加入推薦計畫）在會員中心點「我的 QR」→ 到 `/dashboard/qr`，看到
     「邀請好友／會員驗證碼／掃描驗證」三分頁，停在上次慣用的分頁；邀請與驗證碼
     內容與今日對話框相同。
  2. 未加入推薦計畫的會員 → 「會員驗證碼／掃描驗證」兩分頁，無邀請分頁。
  3. 管理員也走同一頁：已加入三分頁、未加入兩分頁；分頁組合只看 `joined` 與
     `canScan` 兩個布林值（四種組合都在測試矩陣，含理論上的「一個分頁都不能掃」
     ＝只剩驗證碼、不畫分頁列）。
  4. 任何能進這頁的人（會籍有效的會員或管理員）在「掃描驗證」分頁對準對方出示的
     驗證碼 → 看到對方**姓名與會籍四態**；**管理員看全名，一般會員看遮罩名**
     （「王○明」，與推薦網絡的遮罩慣例同一支函式）；震動回饋、手動輸入退路與今日
     `/admin/verify` 一致。
  5. `/admin` 的「會員驗證」按鈕與舊網址 `/admin/verify` 都直接落在
     `/dashboard/qr?tab=scan`，相機立刻啟動（人審裁決：切到分頁即啟動）。
  6. 會籍過期或停權的會員進不了這頁（`RequireMembershipRoute` 守門）；即使繞過前端
     直呼端點，後端回 403（會籍有效才能掃描）。
  7. 在頁內切離「掃描驗證」或離開此頁 → 相機串流停止（含「相機還沒開好就離開」）。
  8. 推薦管理頁（`/referrals`）的同一顆「我的 QR」入口連到同一頁；**按頁面的返回鍵
     回到進來的那一頁**（`/referrals`、`/dashboard`、`/admin`；直接貼網址則回
     `/dashboard`）。
- 不做什麼：
  - 不改驗證碼的簽發端點、token TTL（90 秒）、驗簽邏輯；不改邀請卡／分享按鈕；
    不改「加入推薦計畫」流程與入口。
  - 不在會員中心放實際的 QR 縮圖（人審裁決：不放）。
  - 不做稽核紀錄的前端查閱介面（維持 Supabase Studio）；不加掃描次數限制（token 是
    HMAC 簽章、90 秒到期，暴力猜測不可行；稽核只記成功）。

## 2. 系統設計

- 資料流：
  - 會員驗證碼分頁：`useMemberVerifyToken(active)` → `GET /members/verify-token`
    （登入本人，**不變**）→ 到期前自動換發。`active` 改為 `tab === 'verify'`；Radix
    Tabs 只掛載 active 面板，切走即卸載、停止輪替。
  - 掃描分頁：`MemberVerifyScanner` → **`POST /members/verify`**（新端點，取代
    `POST /admin/members/verify`，後者刪除）。
- **`POST /members/verify` 授權與行為**（同一支 handler，順序固定）：
  1. `requireAuth` → 否則 401。
  2. 讀掃描者 `profiles(is_admin, suspended_at)` 與 `user_account_status(status, end_date)`；
     非管理員時以 **`deriveNodeStatus(acct, suspended_at)`** 判定，`status` 不在
     `active`/`expiring` → 403 `{ code: 'verifier_not_eligible', message: '會籍有效的
     會員才能掃描驗證' }`。用同一支函式判定掃描者與被掃者，「停權」與「會籍」兩個獨立
     欄位一次涵蓋（第 1 輪審查第 10 條）。
  3. `verifyMemberToken`：過期／無效 → 400 `token_expired`／`token_invalid`（不變）。
  4. 讀被掃者 `profiles(name, suspended_at)` 與 `user_account_status` → `deriveNodeStatus`
     四態；查無會員 → 404（不變）。
  5. 稽核 fail-closed：`member_verify_logs` 插入 `{ verifier_id, member_id, result: 'ok' }`，
     失敗回 500（不變）。
  6. 回 `{ displayName, status, activeUntil }`：`displayName` 在管理員為全名，非管理員為
     `maskNameByGen(name, 2)`（CJK 保留首末字、中間○；英數首末保留、中間 •••）。
     `api-contract.ts` 的 `MemberVerifyResponseSchema` 形狀不變，只改註解。
- **稽核表 migration** `supabase/migrations/20260901000001_member_verify_logs_verifier.sql`：
  `admin_id` 改名 `verifier_id`（FK、`on delete set null` 隨欄位保留）、索引
  `member_verify_logs_admin_idx` 改名 `member_verify_logs_verifier_idx`、表註解與欄位
  註解改為「會籍有效的會員或管理員掃碼驗證成功時寫入」。無資料搬移。API 是唯一寫入者。
  跑 `python3 scripts/check-migration-versions.py` 確認版號唯一。
- 純前端新增狀態：URL query `?tab=invite|verify|scan` ＋既有 localStorage 偏好。決策
  順序（純函式）：URL 指定且可用 → 偏好可用 → `verify`（永遠可用）。使用者主動切換時
  同時寫偏好與 URL（`replace`）。`normalizeMyQrTab` 必須把 `'scan'` 當合法值。
- `canScan`（前端門面）＝ `isAdmin || accountStatus === 'active'`，與後端規則對齊；
  在 `/dashboard/qr` 上對所有能進頁的人都為真，寫成獨立述詞是為了讓測試矩陣與
  後端規則一字不差。
- 返回目的地：`Link` 以 `state={{ from: pathname }}` 記住入口；`MyQrPage` 的返回鍵
  讀 `location.state.from`，只接受白名單 `/dashboard`、`/referrals`、`/admin`，其餘落回
  `useBackNavigation()`（對照表補 `'/dashboard/qr': '/dashboard'`）。
- 相機生命週期：`MemberVerifyScanner` 的 effect 在 `await getUserMedia()` 之後**先檢查
  `cancelled`，是就當場 `stop()` 剛拿到的 stream 再 return**——現行寫法在 resolve 前
  卸載會漏掉那條串流（指示燈常亮、下次開相機因裝置忙碌失敗）。專屬測試釘住。
- 部署順序：develop 的 migration 由 Supabase 整合在 push 時套用，Edge Function 在
  該分支 CI 綠之後才部署，正常情況欄位先改名、程式後上線。反過來的短暫視窗裡插入
  `verifier_id` 會失敗 → 稽核 fail-closed → 驗證回 500，不會寫錯資料，可接受。

## 3. 架構影響

- 新頁 `src/components/MyQrPage.tsx`（與 `MemberDashboard`/`ReferralManagement` 同層，
  頁面放頂層是既有慣例），以 `lazyNamed` 掛在 `App.tsx` 會員區 lazy 群組；路由
  `/dashboard/qr`，守衛與 `/dashboard` 相同（`ProtectedRoute` ＋ `RequireMembershipRoute`；
  管理員無會籍也放行，與今日 `AdminRoute` 守 `/admin/verify` 等價）。`BottomNav` 的
  「會員」`NavLink` 沒有 `end`，在 `/dashboard/qr` 仍高亮——不動導覽契約。
- **後端**：`POST /admin/members/verify` 整段搬出 `/admin/*` 命名空間成為
  `POST /members/verify`，授權改寫進 handler（見 §2），handler 註解明講「不在 middleware
  之下，授權是本 handler 自己的責任」。`admin-gate.test.ts` 的 `ADMIN_ROUTES` 移除該列
  （端點已不存在，留著會 404 而非 401，測試會紅）；`member-verify.test.ts` 改寫成新端點
  的授權矩陣與遮罩行為。
- **載入延遲**：Dialog 是同頁零網路的開啟，改成路由後多一個 lazy chunk 的下載，而
  最典型的情境正是「對方當面等你出示驗證碼」。對策：`MyQrEntry` 的按鈕在
  `onPointerEnter`／`onTouchStart`／`onFocus` 觸發 `import('../MyQrPage')` 預熱
  （Vite 對同一模組的動態 import 回同一個 promise，與 `App.tsx` 的 lazy 共用 chunk）。
- `MyQrEntry`：「我的 QR」按鈕改成 `Link`（`asChild`，`data-testid` 不變）到
  `/dashboard/qr`，帶 `state={{ from: location.pathname }}`；拿掉 `qrOpen` 狀態與
  `MyQrDialog`；`openJoin` 裡「先關 QR 面板再開加入流程」的 z-index 防線隨之消失。
  **不新增任何行為 prop**，維持「唯一入口、狀態單一來源」。
- `MyQrDialog.tsx` ＋測試**刪除**（knip 會擋住漏刪）；其分頁契約的測試搬進
  `MyQrPage.test.tsx`——其中「不放總述、`aria-describedby` 為 undefined」那條是 Radix
  Dialog 特有機制，新頁用等價斷言接住它守的意圖（見 §4「頁首」）。
- **`MemberVerifyScanner` 搬家**：`src/components/admin/` → `src/components/referral/`
  （與 `MemberVerifyQrTab` 同住——「驗證」元件放 `referral/` 是既有先例；掃描已不是
  管理員專屬，留在 `admin/` 會打破「`admin/` 只被 `AdminDashboard` 組裝」的不變式），
  測試檔同步搬（測試命名規則：與受測檔同層同名）。改成面板：拿掉頁首（返回鈕、h1、
  副標）與 `Card` 外殼，只留取景框／疊層結果／手動輸入；不再依賴 `useNavigate`；端點
  改 `/members/verify`。`ui-ux-guidelines.md` §7 末段的〔實作〕路徑同步改。
- `myQrTabPreference.ts`：`MyQrTab` 加 `'scan'`；`normalizeMyQrTab` 認 `scan`；
  `resolveMyQrTab` 改成 `(available, requested, preferred)` 純函式。**同一批**把
  `MyQrDialog.tsx` 第 46、51 行的舊簽名呼叫改成新簽名（`{ invite: canShareInvite,
  verify: true, scan: false }`），否則階段 1 之後 `tsc` 會以 TS2554 紅燈直到刪檔。
- `useBackNavigation`：`ROUTE_HIERARCHY` 加 `'/dashboard/qr': '/dashboard'`。**不加會導回
  首頁**——前綴比對迴圈會先命中既有的 `'/dashboard': '/'`；這行是必要修正不是防禦性
  寫法；該 hook 目前沒有任何測試，接線階段補一條。`useBreadcrumbs` 名稱表加「我的 QR」。
- `App.tsx`：拿掉 `MemberVerifyScanner` 的 lazy import 與 `/admin/verify` 的 `AdminRoute`
  路由；`/admin/verify` 改成 `<Navigate to="/dashboard/qr?tab=scan" replace
  state={{ from: '/admin' }} />`（比照 `/referral-reward-contract` 舊 slug 轉址；轉址本身
  不守門，守門在目的地）。`AdminDashboard` 頁首的「會員驗證」按鈕改連
  `/dashboard/qr?tab=scan`、帶 `state={{ from: '/admin' }}`（人審裁決：保留）。
- 與 multi-step-flow 四契約無關（無表單、無金流）。
- 效能：`jsqr` 仍是掃描面板內的動態 import；`qrcode.react` 本就在會員區 chunk；新頁
  lazy，entry chunk 不長大（`check-bundle-budget` 棘輪不受影響）。
- 安全：權限邊界從「管理員」放寬為「會籍有效的會員或管理員」，**邊界在後端 handler**
  （§2 第 2 步），前端 `canScan` 只是門面。個資面：非管理員只拿到遮罩名＋會籍狀態，
  且要對方主動出示 90 秒短效碼才拿得到；token 不含任何個資、只能由後端解析。

## 4. UI/UX

- 頁首沿用 `MemberDashboard`／舊掃描頁的模式：`ArrowLeft` icon 按鈕（`aria-label`
  「返回上一頁」，行為見 §2「返回目的地」）＋ h1「我的 QR」＋副標「邀請好友、出示
  驗證碼、掃描驗證」在手機隱藏（`hidden sm:block`）。**頁首契約**（承接 `MyQrDialog.test`
  那條 aria-describedby 測試守的意圖「手機第一屏留給 QR、不重複說明」）：副標元素
  必須帶 `hidden sm:block`，且各分頁內自己的一句說明不得與副標重複。
- 分頁：`TabsList` 用 `AdminDashboard` 已驗證的四件套
  `w-full grid grid-cols-{2|3} h-auto pointer-coarse:[&>[role=tab]]:min-h-[44px]`
  （ui-ux §1 的 44px 觸控目標——今日對話框的分頁只有 36px，順手還債）。
  三分頁在 375px 的算式：內容寬 343 − TabsList 內距 6 → 每格 112px，扣 trigger
  內距與邊框 18 → 可放 94px；「會員驗證碼」五字 70px ＋ icon 16 ＋ gap 6 ＝ 92px，
  餘裕 2px 不可靠 → **只在實際渲染三個分頁時**把 icon 在 `<sm` 隱藏（`hidden sm:inline`
  依 tab 數決定）；兩分頁時每格 ≈168px，維持帶 icon。方案 B 下多數使用者看到的是
  三分頁，所以手機上多數人看不到 icon——標籤文字本身就是可辨識的名稱，可接受。
  三顆 icon 補 `aria-hidden="true"`。只有一個可用分頁時不畫分頁列（理論路徑，仍測）。
- 分頁順序與預設：邀請好友 → 會員驗證碼 → 掃描驗證；預設仍是邀請好友並記住上次選擇。
- 掃描分頁 = 既有取景框版面（ui-ux §7 那條的〔實作〕）；`CardTitle` 改成與驗證碼分頁
  同款的置中說明句「對準對方出示的會員驗證碼，確認對方的會員身分與會籍」；手動輸入
  退路不變；切到分頁即啟動相機（人審裁決）。結果卡直接顯示後端回的 `displayName`
  （管理員全名／會員遮罩名），不另加「已遮罩」標示——○ 本身就是慣例。**第一屏重算**
  （375×667，`BottomNav` 佔底部 56）：Navbar 64 ＋ 公告橫幅 40 ＋ `main` py-6 24 ＋
  頁首 76 ＋ TabsList（44＋6）50 ＋ 分頁內距 16 ＋ 說明句 36 ≈ **306px**（舊頁 288）；
  取景框高 = min(45dvh≈300, 寬 343×3/4≈257) ＝ 257 → 底邊 563 < 611（667−56）。結果
  面板疊在取景框內，跟著在第一屏。**驗收不能只靠 headless 手動輸入版面**：e2e 以
  Chromium `--use-fake-device-for-media-stream` ＋ `--use-fake-ui-for-media-stream`
  讓相機真的啟動，用既有 `first_screen_position`（`e2e/test_admin_mobile_layout.py`）
  斷言 `scanner-viewport` 底邊在第一屏內。
- 行動版：`BottomNav` 保持可見、「會員」高亮；`main` 的 `pb-24` 讓疊層結果不被導覽列
  遮住（既有設計）。
- 三態：邀請（無碼 → 分頁不存在，非空態）；驗證碼（載入 spinner／錯誤＋重試／有碼，
  既有）；掃描（相機不可用 → 手動輸入；驗證中／無法驗證／結果三態疊層，既有；新增
  403「會籍有效的會員才能掃描驗證」走既有錯誤態，不另做畫面——能進頁的人理論上
  碰不到，只是後端邊界的回應要能顯示）。
- 可測試性：`data-testid` 沿用 `my-qr-button`、`invite-tab`、`verify-tab`、
  `member-verify-qrcode`、`scanner-viewport`、`verify-result`；新增 `scan-tab`。
- 溢版巡檢：`e2e/test_overflow_sweep.py` 的 `ROUTES` 加**三**條——(a) 會員視角
  `/dashboard/qr` 不帶 `after_load`（預設「邀請好友」分頁：不斷行的推薦連結與長姓名，
  是本次真正從 Dialog 盲區變成可直達的畫面）；(b) 同路由 `after_load` 切到驗證碼分頁；
  (c) 同路由 `?tab=scan`（有 fake camera 就是相機版面；方案 B 下用一般會員即可）。
  `backend_api_mock` 補 `/members/verify-token` 的假回應，否則驗證碼分頁只量得到錯誤態。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點（vitest / deno test / e2e） | 驗證標準 |
|---|---|---|---|
| 1 | 分頁決策純函式：`MyQrTab` 加 `scan`；`normalizeMyQrTab` 認 `scan`；`resolveMyQrTab(available, requested, preferred)`；**同批改 `MyQrDialog.tsx` 兩處呼叫**維持 `tsc` 綠 | `src/utils/myQrTabPreference.test.ts`（node） | `normalizeMyQrTab('scan')` 原樣保留；URL 指定可用分頁優先；不可用落回偏好；偏好也不可用落回 `verify`；髒值收斂；`MyQrDialog.test` 既有 4 條仍綠 |
| 2 | 後端：`POST /members/verify` 取代 `/admin/members/verify`（授權矩陣、遮罩、稽核 `verifier_id`）＋ migration 改名 | `supabase/functions/api/member-verify.test.ts`（改寫）、`admin-gate.test.ts`（移除該列）；**本機無 deno／supabase CLI，紅綠以 CI `api-tests` 軌為準**；`python3 scripts/check-migration-versions.py` | 有效會員掃 → 200、`displayName` 為遮罩名、稽核 `verifier_id`＝掃描者；管理員掃 → 全名；會籍過期的呼叫者 → 403 `verifier_not_eligible`；效期內但停權的呼叫者 → 403；匿名 → 401；token 過期 → 400 `token_expired` 且不留稽核；被掃者停權 → `suspended`；舊路徑 `/api/admin/members/verify` → 404 |
| 3 | 掃描面板：搬到 `referral/`、移除頁首／返回鈕／Card、端點改 `/members/verify`、卸載即停相機（含「相機還沒開好」） | `src/components/referral/MemberVerifyScanner.test.tsx`（jsdom，既有 10 條隨檔搬） | 既有連續掃描／震動／疊層契約全綠；新增「穩態卸載停止所有 track」「`getUserMedia` 延後 resolve、resolve 前卸載仍停止 track」「不再渲染返回管理後台」「呼叫的是 `/members/verify`」 |
| 4 | `MyQrPage`：頁首、分頁組合、深連結、偏好寫回、依來源返回 | `src/components/MyQrPage.test.tsx`（jsdom；三個子面板替身化，同 `MyQrDialog.test` 作法——證據等級是 e2e/README 的 **B 級**：決策函式已測＋本檔驗決策接進元件） | 四格矩陣 `joined × canScan`：(T,T)＝三分頁預設邀請／(F,T)＝驗證碼＋掃描／(T,F)＝邀請＋驗證碼／(F,F)＝單分頁無分頁列；`canScan` 對管理員無會籍為真、對 `accountStatus === 'active'` 為真；`?tab=scan` 在 `canScan` 為假時落回；`?tab=verify` 蓋過偏好；切換後偏好被寫入；會籍狀態取自 UserContext；`state.from` 為 `/referrals` 時返回導向 `/referrals`、無 state 走 `/dashboard`、白名單外的值不採用；副標帶 `hidden sm:block`；三分頁時 icon 帶 `hidden sm:inline`、兩分頁時不帶 |
| 5 | 接線：`MyQrEntry` 改 Link（帶 `state.from`、hover/touch 預熱）、刪 `MyQrDialog`、`App.tsx` 路由＋lazy＋舊路由轉址、`AdminDashboard` 捷徑、`useBackNavigation` 對照表 | `MyQrEntry.test.tsx`（href＋state 斷言，需 `MemoryRouter`）、`AdminDashboard.test.tsx`（「會員驗證」href 為 `/dashboard/qr?tab=scan`）、`src/hooks/useBackNavigation.test.tsx`（新：`/dashboard/qr` 返回 `/dashboard`）、`appShell.test.ts`（既有 lazy 契約）、`npm run check`（knip 抓孤兒） | `my-qr-button` 是連到 `/dashboard/qr` 的連結；`MyQrDialog` 無殘留引用；check 全綠 |
| 6 | 文件與 e2e 同步：規格書 §2.1 角色表／§3 路由表（`/dashboard/qr` 新列；`/admin/verify` 改「舊路徑，轉址至 `/dashboard/qr?tab=scan`，不再單獨守門」）／§13.1 流程・安全・稽核三段／§13 判準註；`ui-ux-guidelines` §7 路徑；`api-contract.ts` 註解；溢版巡檢三條路由＋mock；fake-camera 啟動參數（`browser_type_launch_args`）＋掃描分頁第一屏斷言；`dashboard_steps.py` 註解 | `python3 scripts/check-spec-drift.py`、`python3 scripts/check-test-names.py`、CI 的 e2e 軌（`test_overflow_sweep.py`、`test_admin_mobile_layout.py` 新增一條） | spec-drift 綠（路由集合對照）；既有 e2e `open_invite_friend_panel` 流程不改步驟即通過；掃描分頁在 375×667 相機啟動下 `scanner-viewport` 底邊 ≤ 第一屏 |

<!-- 測試落點指引：純函式 → vitest node；元件行為 → vitest + jsdom pragma；
     後端 API → supabase/functions/api/*.test.ts；跨頁流程 → e2e .feature（CI 驗證） -->

e2e 不新增 Gherkin 情境：分頁組合與門面規則在階段 4 以 B 級證據涵蓋；路由守衛與
`/dashboard` 共用同一個 `RequireMembershipRoute`，`route_guards.feature` 已涵蓋；後端
授權矩陣在階段 2 的 Deno 測試。唯一新增的 e2e 斷言是階段 6 的相機版面第一屏。

## 6. 開放問題（逃生口——留白是合格產出）

全部已於 2026-09-01 人審裁決（紀錄在 `./review.md`「處置」節）：

- [x] **#1 掃描權限** → **方案 B：開放所有會籍有效的會員**（本版即依此改寫）。
- [x] **#2 儀表板 QR 縮圖** → 不放，維持「我的 QR」圖示按鈕。
- [x] **#3 `/admin` 捷徑** → 保留並改連 `/dashboard/qr?tab=scan`。
- [x] **#4 相機啟動時機**（第 1 輪審查的需人工裁決） → 切到分頁即啟動。
- [x] **#5 非管理員掃到的姓名** → 遮罩（`maskNameByGen(name, 2)`）；管理員全名。

目前無未決問題。

## 7. 風險與回滾

- 最壞情況：前端搬家＋一個端點改名放寬＋稽核欄位改名。回滾 = revert PR；migration
  的回滾是把欄位與索引名改回去（另一支 migration），無資料遺失。
- 權限放寬：邊界在後端 handler，以 `deriveNodeStatus` 同時排除過期與停權；階段 2 的
  Deno 測試逐格釘住授權矩陣，CI `api-tests` 軌把關（本機不可跑）。
- 個資：非管理員只拿遮罩名＋會籍狀態；遮罩沿用推薦網絡同一支函式，不另創規則。
- 部署順序：migration 先於 Edge Function 是常態；反向視窗裡稽核插入失敗 → 驗證 500，
  fail-closed，不會寫錯資料。
- 相機生命週期：「切分頁也要停」與「相機還沒開好就離開」兩條路徑都由階段 3 測試釘住。
- 三分頁在 375px 溢出：三分頁時 icon 在手機隱藏 ＋ 溢版巡檢三條路由把關；`TabsList`
  的 `overflow-x-auto` 是最後退路，不是設計目標。
- 掃描分頁第一屏：頁首＋分頁列比舊頁多約 18px，算式仍有餘裕；由 fake-camera e2e
  斷言把關。
- 舊網址：`/admin/verify` 轉址保留；舊端點 `/admin/members/verify` 直接移除（唯一呼叫
  端是本 repo 的前端，同一 PR 一起改）。
- 返回目的地：`state.from` 走白名單，直接貼網址／state 遺失一律回 `/dashboard`。
- 規格書：§3 路由表少列或漏改，`check-spec-drift` 會紅——設計好的把關。

## 修訂紀錄

### 第 3 版（方案 B，回應 2026-09-01 人審裁決）

| 裁決 | 落在 |
|---|---|
| #1 開放所有會籍有效的會員掃描 | §0、§1 故事 4/6、§2 端點授權與遮罩、migration、§3 後端與搬家、§5 階段 2/3、§7 |
| #2 不放縮圖 | §1 不做什麼 |
| #3 保留 `/admin` 捷徑 | §3 `App.tsx`／`AdminDashboard` |
| #4 切到分頁即啟動相機 | §4 掃描分頁 |
| #5 非管理員看遮罩名 | §2 第 6 步、§4 結果卡 |
| 第 1 輪審查第 10 條（`suspended_at`） | §2 第 2 步用 `deriveNodeStatus` 一併涵蓋 |
| 第 1 輪審查第 12 條（`admin/` 邊界） | §3 掃描面板搬到 `referral/` |

### 第 2 版（方案 A，回應第 1 輪 ./review.md）

| review.md 編號 | 處置 | 落在 |
|---|---|---|
| 1 P1 getUserMedia 競態 | 採納：resolve 後先檢查 `cancelled` 並當場 stop；加專屬測試 | §2、階段 3 |
| 2 P1 溢版巡檢漏預設分頁 | 採納：加不帶 `after_load` 的 base entry，共三條 | §4、階段 6 |
| 3 P1 階段 1 破壞 `MyQrDialog` 呼叫端 | 採納：階段 1 同批改兩處呼叫 | §3、階段 1 |
| 4 P1 `normalizeMyQrTab` 漏 `scan` | 採納：列入階段 1 驗收 | §2、階段 1 |
| 5 P1 A/B 級證據自相矛盾 | 採納：改標 B 級 | 階段 4、§5 末段 |
| 6 P1 從 `/referrals` 返回退化 | 採納：`Link state.from` ＋白名單＋fallback，加斷言 | §2、§3、階段 4/5 |
| 7 P1 掃描分頁第一屏未重算／未量測 | 採納：重算（306px）；fake-camera e2e 斷言 | §4、階段 6 |
| 8 P1 管理員∧未加入未枚舉 | 採納：分頁組合改成 `joined × canScan` 四格矩陣 | §1、階段 4 |
| 9 P1 `AdminDashboard` href 無測試 | 採納：`AdminDashboard.test.tsx` 加 href 斷言 | 階段 5 |
| 10 P2 變體 B 漏 `suspended_at` | 採納（第 3 版落地） | §2 |
| 11 P2 路由表存取層級措辭 | 採納：明寫「轉址、不再單獨守門」 | §3、階段 6 |
| 12 P2 `admin/` 資料夾邊界 | 採納（第 3 版落地：搬到 `referral/`） | §3 |
| 13 P2 aria-describedby 測試無後繼 | 採納：頁首契約（副標 `hidden sm:block`、說明不重複） | §3、§4、階段 4 |
| 14 P2 `useBackNavigation` 理由寫錯 | 採納：改成「不加會導回首頁」＋補測試 | §3、階段 5 |
| 15 P2 icon 隱藏拖累兩分頁 | 採納：依實際分頁數決定 | §4、階段 4 |
| 16 P2 lazy chunk 載入延遲 | 採納：入口 hover/touch 預熱 | §3、階段 5 |
| 17 P2 icon `aria-hidden` | 採納 | §4 |
| 18 P2 從 `/admin` 返回退化 | 採納：同第 6 條機制（`state.from='/admin'`） | §2、§3 |
