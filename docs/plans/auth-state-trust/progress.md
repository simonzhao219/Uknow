# 登入狀態信任（T1）實作進度

<!-- plans-keep: 跨 session 施工鷹架（規劃 PR 先於實作合併，三段式狀態全在本目錄）；退場條件＝T1 實作 PR 收尾（/tdd-implement 收尾）時決策升級進規格書／friction-log，整個目錄刪除 -->

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/auth-state-trust`
規劃書:`./plan.md`（上游總綱 `git show 55268e03:docs/plans/platform-growth-and-trust/plan.md` §1）|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| A0 | 開工前置：資料查證 SQL 重跑（plan §2.1）、`isLoggedIn` 清查、`localStorage.user` 讀寫全表 | ✅ 三項完成；重跑後三欄兩站皆 0，F3 不觸發 | — | — |
| A1 | 純函式：authHint、classifyMembershipGate／isFirstTimeFunnel／nextFunnelRoute、resolveAuthView、fetchProfile | ✅ 綠（逃生口 2 一格，見 Blockers） | `24325327` | `55493dc6` |
| A2a | useAuthBootstrap 本體（reducer／outcome、hint 擁有與寫入、uid8、副作用注入、generation counter） | ✅ 綠（既有 e2e 308/308） | `9db61256` | `a2379904` |
| A2b | 其餘 8 處 /profile 收斂、clearAuthHint 補點、刪 localStorage.user 寫入、e2e 基線 | ✅ 綠（既有 e2e 308/308；計次基線不需改，見下） | `7ca2ff28` | `0f22801c` |
| A3 | Navbar 五 view＋繼續完成註冊、useFunnelLogout、BottomNav／padding、e2e S1–S11 | ✅ 綠（e2e 全套 326/326＋頁首 30 情境）；Q6–Q8 待業主 | `356417f1`、`dda2d4f1`；e2e 紅燈證據見下 | `cfb9a648`、`966956a3`、`95a8bed3`、`3d129cbd`；e2e `9a6e6dfc` |
| A4 | 規格書 §2.1 註冊中角色＋已知限制、ui-ux §3 | ✅ | — | `1c637c3d` |
| B1 | 後端 authenticate／讀取對照表／ProfileReadError 503／?retry=1 | ⬜ 未開始（可晚一波） | | |
| B2 | 前端 8 秒逾時＋重試＋degraded＋endInvalidSession | ⬜ 未開始（可晚一波） | | |
| B3 | 規格書 §5.3、§14 #8 | ⬜ 未開始（可晚一波） | | |

## 目前位置與下一步

**人審通過（2026-10-31，業主）**：規劃 v4.1 定稿、review.md〈處置〉已勾。實作由新開的執行 session 跑 `/tdd-implement auth-state-trust`（A2a／A2b 用 Opus，A1／A3／A4 用 Sonnet；收尾另開審查 session 跑 `/review-implementation`）。第一步 A0：主 session 代跑 plan §2.1 查證 SQL（正式站＋develop），結果加一列到下表後才進 A1。

## A0 資料查證紀錄

| 時間 | 環境 | funnel_candidates | with_completed_order | with_subscription_row | with_active_referral_code | 執行者 |
|---|---|---|---|---|---|---|
| 2026-10-31 09:40 UTC | 正式站 uhtwwxtazwqnlbejhprl | 0 | 0 | 0 | 0 | 主 session（唯讀） |
| 2026-10-31 09:40 UTC | develop ijcxnxhrziehdtkwausy | 1 | 0 | 0 | 0 | 主 session（唯讀） |
| 2026-10-31 21:16 UTC | 兩站 | 同上（正式站 0／0／0／0；develop 1／0／0／0） | | | | 第 2 波主 session（唯讀） |
| 2026-10-31 21:32 UTC | 正式站 uhtwwxtazwqnlbejhprl | 0 | 0 | 0 | 0 | 第 3 波主 session（唯讀，A1 開工前重跑） |
| 2026-10-31 21:52 UTC | develop ijcxnxhrziehdtkwausy | 1 | 0 | 0 | 0 | 第 3 波主 session（唯讀，A1 開工前重跑） |

→ 後三欄兩站皆 0，判定表維持原樣。**A1 開工前必須重跑一次**（SQL 見 plan §2.1）並加一列；任一後三欄 ＞0 → 停下回報主 session 重審（F3）。

## A0 清查（2026-10-31，HEAD 6e8be7a 之上）

**`isLoggedIn` 使用處（產品碼）**——全部由 `App.tsx` 的 `isLoggedIn = !!user` 供應：

| 檔案 | 用途 |
|---|---|
| `App.tsx` | context 定義與預設值、`isLoggedIn = !!user`、一處 getter、memo、主容器 `pb-24 md:pb-6` |
| `RequireMembershipRoute.tsx` | `redirect` 前置條件、`suspendedBlocked`、未登入分支 |
| `ProtectedRoute.tsx`／`AdminRoute.tsx` | 未登入 → 導登入 |
| `BottomNav.tsx` | 未登入不渲染 |
| `HomePage.tsx` | `hasBottomNav={isLoggedIn}` |
| `Navbar.tsx` | 訪客版／會員版切換 |
| `MaintenanceBanner.tsx` | **同名本地 state**（`useState(false)`），與 context 無關，不納入改動 |

測試引用：RequireMembershipRoute、BottomNav、HomePage、HomePage.backNavigation、AdminDashboard、Navbar 六支 `.test.tsx`（context mock 形狀，A2 改 context 時需同步）。

**`localStorage.user`／`pendingSession` 讀寫全表**——產品碼**沒有任何 `getItem('user')`／`getItem('pendingSession')`**（只寫不讀，純殘跡）；`pendingSession` 也沒有 `setItem`：

| 檔案 | `setItem('user')` | `removeItem('user')` | `removeItem('pendingSession')` |
|---|---|---|---|
| `App.tsx` | refreshUser（A2a 移除） | SIGNED_OUT、bootstrap 失敗 | SIGNED_OUT |
| `AuthPage.tsx` | 登入成功（A2b 移除） | 兩處 | 一處 |
| `CompleteProfile.tsx` | 送出成功（A2b 移除） | 兩處 | — |
| `Navbar.tsx` | — | 登出 | — |
| `PaymentCheckout.tsx` | — | 一處 | — |
| `utils/apiClient.ts` | — | session 過期 | session 過期 |

e2e：無任何 `localStorage` 的 `user`／`pendingSession`／`uknow:auth-hint` 依賴（只用 `pending_referral_code`、`uknow:pref:home-view-mode`、journey 的 `clear()`）。

## 本機 e2e 跑法（執行 session 備忘）

容器的 Chromium 是 build 1243、`playwright==1.56.0` 要 1194：在 scratchpad 建 `pwb/chromium_headless_shell-1194/chrome-linux/headless_shell` 指向 `/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`，以 `PLAYWRIGHT_BROWSERS_PATH` 指過去。conftest 自起的 dev server 會在跑到約 20% 時死掉（ERR_CONNECTION_REFUSED 洗版）——改在獨立 worktree 起 `npx vite --port 3000` 並設 `E2E_SKIP_DEV_SERVER=1`（同 CI 做法），也避免邊改碼邊 HMR。

## A2b／A3 補記

- **A2b 計次基線**：`set_profile_sequence` 依呼叫次數前進；收斂成 single-flight 後既有 e2e 308/308 照綠，不需要重算。
- **A3 e2e 紅燈證據**：新頁首情境在 A2b（`0f22801c`）跑 15 failed／15 passed（通過的 15 個是舊頁首本來就不會出現那些字樣的反向斷言）；在 `966956a3` 起 30 passed。
- **A3 中 e2e 抓到的三個實作缺陷**（皆已修、各有回歸斷言）：換帳號冷啟動首繪在 getSession 回來前畫出前一人首字（→ `hintVerified`，S11）；占位換登出鈕時右側容器位移、logo 晚到時容器位移（→ 容器固定高度＋logo 寬高屬性，S9）；320px「繼續完成註冊」壓到 logo 7px（→ 窄寬間距，S8 加量 logo 重疊）。
- **偏離 plan**：Q7 的「取消註冊既有確認框」不存在——「稍後註冊」直接刪帳號、無確認框；已送主 session 請業主裁決，本 PR 未動。Q8 核對：鈕文字現況已是「登出，稍後再付款」。
- **時程降級（plan §5 A3 允許）**：Navbar 會員登出的 `startTransition` 順序修正未做；`clearAuthHint()` 與失敗補 local 登出（不可降級項）已做。漏斗路由主體載入態：四頁現況都有各自 spinner／表單，未另補文字。

## Blockers(逃生口紀錄)

- **A1 逃生口 2（2026-11-01，業主裁決「放寬比對」）**：紅燈 `24325327` 的「每條漏斗路由在 App.tsx 都有對應的 Route」以單行字串 `<Route path="…"` 比對，但 `/payment/checkout`、`/payment/result` 在 App.tsx 是多行 JSX（`<Route` 換行後才接 `path=`），實作無論如何都綠不了——測試比對寫法過窄，非實作錯。裁決：只把該格改成容許 `<Route` 與 `path=` 之間有空白／換行的正則，斷言語意不變；其餘 A1 測試已全綠（198/199）。業主同時授權由執行 session 刪 `.claude/tdd-lock` 後修該格。

## 框架摩擦

- 推送守衛在分支落後 develop 時自動 rebase，之後要求 `--force-with-lease`，但 auto mode 分類器擋 force push——規劃 session 推不上去，改用 GitHub API（push_files）疊 commit，分支因此落後 develop。
- 規劃 PR 先於實作合併時，新目錄要在開 PR 前就加 `plans-keep`，否則 framework-check 的 check-plans-scaffold 紅；plan-feature skill 沒提這步。
