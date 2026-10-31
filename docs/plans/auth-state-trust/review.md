# 登入狀態信任（T1）規劃書審查報告

<!-- /review-plan 彙整四個 fresh-context reviewer 的發現。只彙整、去重、排序，不改判。
     輸出契約見 docs/_templates/review.md。審查對象：./plan.md（基準 develop 97cc879a）。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 5 | 4 | migration 不需要、RLS、hint 清除與壞資料處理、F1／F2 雙來源、舊 bundle 對 503 相容 |
| 架構 | 0 | 5 | 4 | 多步驟流程四契約、22 支 `vi.mock('../App')` 相容、階段 1／5 測試落點 |
| UI/UX | 0 | 3 | 4 | 載入態、BottomNav 五格契約、IA（只移除入口） |
| 需求 | 1 | 5 | 3 | 規格書溯源（除 P0）、開放問題品質、不涉 `reward_config` |

## 發現清單（依嚴重度排序）

### P0

- **[P0]〔§2.1 F2、§4〕（需求）** F2 的 `isFirstTimeFunnel` 把「已付款待開通」與「資料齊、未付款」都畫成只剩登出，超出 W2-22 字面「profile 未齊或尚未付款」，規格書 §2.1 無「註冊中」角色 → Q2 開工前由業主裁決，Q1／Q2／Q3 改標阻擋項；階段 5 規格書補列等 Q2 定案；結帳頁「登入」與碼不一致處對影片核實。

### P1

- **[P1]〔§2.1、§3、§5 階段 1〕（架構）** 「`isFirstTimeFunnel` 與 `resolveMembershipRedirect` 第 3／5／6 格共用」不成立：後者在 `RequireMembershipRoute.tsx:37`、是短路決策表；續約且待開通者會被守衛彈去結果頁、頁首卻是完整頭像選單 → 抽 `classifyMembershipGate(user)` 純函式進 `registrationFlow.ts`，兩者都由它導出；補性質測試「redirect 非 null 且非續約格 ⇒ funnel」；續約待開通者算不算 funnel 併入 Q2。
- **[P1]〔§2.1〕（系統）** 文字說不含停權者，公式沒有 `!suspended`，停權的首購未完成者會被畫成漏斗 → 公式加 `!suspended`（或寫明停權者 view），列進階段 1 判定表並核對守衛的停權格。
- **[P1]〔§2.2〕（系統）** `kind:'funnel'` 第一次寫入時機未定義：OTP 後 `routeAfterVerifiedSession` 的注入式 `fetchProfile` 不經 bootstrap，OTP→CompleteProfile 之間重新整理首繪仍是訪客版 → 注入式 `fetchProfile` 的結果必須回灌 bootstrap（同一 single-flight 實例），補「OTP 後重新整理首繪只有登出」測試。
- **[P1]〔§2.3〕（系統）** 五讀取 fail-closed 未區分零列與查詢失敗：`acct` 零列怎麼處理未寫；`step ?? 1` 在 RPC 失敗時把已付款者當 step 1；`pendingOrders` 失敗會漏判已付款待開通（重複付款風險） → 明列每個讀取的 error／零列對照表，自癒遞迴 `:490` 同一套。
- **[P1]〔§2.4〕（系統）** 逾時 abort 後重試會讓兩個 `/profile` 在伺服器端並行跑 `healPaidPendingOrders` 與 repair RPC（abort 不停 Edge Function）〔需人工裁決：reviewer 未追進 heal 內部確認是否冪等〕 → 階段 2 先確認 heal／repair 併發安全，重試加退避或帶只讀旗標。
- **[P1]〔§2.4〕（系統）** `get_logs`／Logs Explorer 取 7～14 天可能不可行（保留期，reviewer 記憶未驗證）；`execution_time_ms` 不含冷啟動與網路 → 改 24 小時視窗、`n` 不足即用預設 8 秒，以端到端量測為主、SQL 只做 sanity check；8 秒對照 heal 最壞情況。
- **[P1]〔§2.4、Q5〕（需求）** P95 量測佔業主／主 session 資源、11/10 時程風險 → 直接以預設 8 秒上線，量測改上線後調參，Q5 結案。
- **[P1]〔§1.1、§3、§5 階段 3〕（架構）** AuthPage 掛載 effect 與 `useAuthBootstrap` 並行：401／404／410 與 catch 仍立即 global `signOut()`，繞過兩層確認；AuthPage 4 秒逾時與 `fetchProfile` 8 秒競態 → `fetchProfile` 是模組級 single-flight；AuthPage 的清理走 `endInvalidSession()`（兩層確認、`scope:'local'`）；訂清兩個逾時的關係；補「同時掛載只打一次」測試。
- **[P1]〔§2.1、§3、§4〕（架構）** `authState`／`funnelProfile`／hint 如何流到 Navbar／BottomNav／HomePage 沒規格：是否進 `UserContext`、`contextValue` memo deps（現寫死 `[user, isLoadingUser]`，漏加會靜默不重繪）、`resolveAuthView` 輸入來源、F2 的 hint 由誰在哪個 effect 重算（`CompleteProfile`／`PaymentCheckout`／`PaymentResult` 直接 `setUser`） → §3 補「context 形狀＋memo deps＋hint 寫入 effect＋回落規則」表，階段 3 加重繪測試。
- **[P1]〔§3、§5 階段 3〕（架構）** `appShell.test.ts:94-97` regex 釘死 App.tsx 內的 `useRevalidateOnFocus(... refreshUser() ...)`，收斂進 hook 會紅 → 保留 App.tsx 呼叫字面（hook 回傳 `refreshUser`）或同步更新測試寫出新不變量；驗證標準加「appShell.test 全綠且不放寬」。
- **[P1]〔§5 階段 3／4〕（架構）** 階段 3 已改冷啟動 `/profile` 次數，既有 e2e（`set_profile_sequence` 全域計次）會在階段 3 就紅，但 e2e 基線重算寫在階段 4 → 基線重算移到階段 3 並列驗證標準；`seed_auth_hint` 與新 feature 留階段 4。
- **[P1]〔§4〕（UI/UX）** 「頁首＝離開帳號、頁內＝放棄付款」前提不符：首購結帳頁 `handleCancel`（`PaymentCheckout.tsx:549-580`）本來就是 `signOut` 後導 `/login`，頁首登出導 `/`——兩顆鈕做同件事去向不同 → 裁決 (a) 共用 handler、導向與 toast 一致（reviewer 建議）／(b) 結帳頁頁首不放登出／(c) 頁內鈕改名；補一致性測試。
- **[P1]〔§4、Q3、Q4〕（UI/UX）** 完善資料頁頁首「登出」與「取消註冊（刪帳號，`CompleteProfile.tsx:610-662`）」並存，誤觸與混淆未處理 → 定登出後果文案、與取消註冊的位階／位置分離；若 Q3 選清草稿，有未送出輸入時確認（清草稿使其不可逆，符合 §11.3）。
- **[P1]〔§2.2、§4〕（UI/UX）** 漏斗登出缺 a11y 規格：換版不掉焦點、`<button>` 非 Link、進行中 `aria-disabled` 與防連點、完成後焦點落點、失敗回報；`member-pending` 頭像占位點下去做什麼未定義 → §4 補 a11y 小節，Navbar.test 加 `getByRole('button',{name:'登出'})`、連點只觸發一次、首繪與完成後同節點。
- **[P1]〔§1 驗收 S1／S3／S5〕（需求）** 驗收缺可證偽做法：MutationObserver 掛載方式未寫；無提示的真正冷啟動（Email 連結首次進站、換裝置）沒情境，成因 1 的「Email 連結進站」仍會閃；S5 無觸發點與時限 → 明寫無提示時的預期（等 session 判定或接受閃一次並列 Q）；S5 寫成可測斷言。
- **[P1]〔§1 不做〕（需求）** 排除清單只引用總綱 → 補：不加客服連結、不改登出確認流程、不碰 PayUni callback、不改 `registrationFlow` 導向。
- **[P1]〔§5、時程〕（需求）** 5 階段含總綱 B 完整改造，11/10 沒有砍線 → 明寫降級順序（例：A 三態＋提示＋W2-22 先上，B 來不及可拆出）。
- **[P1]〔§6 Q3〕（需求）** 清草稿是 W2-22 沒要求的新增行為，且涉身分證字號 → 列業主裁決，預設保守「不清」，不在本波順手改。

### P2

- **[P2]〔§2.3〕（系統）** 全域 `app.onError` 會把所有端點未處理例外 500→503 → 只套 `/profile`（handler 內 try/catch），或列舉確認 apiClient 對 503 的處理。〔需對照總綱〕
- **[P2]〔§2.2〕（系統）** hint 沒綁使用者，換帳號時清除失敗會短暫顯示前一人首字 → 存 uid 雜湊前 8 碼比對，或寫明接受。
- **[P2]〔§3、階段 3〕（系統）** single-flight 與輪詢 `refreshUser` 互動未寫，去重可能延遲開通偵測 → 只去重同 token 進行中請求，輪詢走 `force`；取消只丟結果不重置 state。
- **[P2]〔§2.1 F2〕（系統）** `subscriptionEndDate` null 但非 active 的既有會員（贈送／手動開通／舊資料）會被收成只有登出 → 階段 1 前以資料查證，或判定表加一格。
- **[P2]〔§2.1、§3〕（架構）** `resolveAuthView`、`useAuthBootstrap` 沒指定檔案落點 → §3 列檔案清單與允許的 import（純函式檔不得 import `'../App'`）。
- **[P2]〔§1.1〕（架構）** 9 處中 `AuthPage:188`、`useInviteAccept:93`、`PaymentCheckout:93` 等是 `/auth/profile` → 表內標明；收斂驗收用 `grep "buildApiUrl\('/(auth/)?profile'"` 零命中。
- **[P2]〔§5 階段 2〕（架構）** 容器無 deno，紅燈證據要等 CI → 驗證標準明寫「紅燈 commit 以 CI 紅燈 run 為證」。
- **[P2]〔§4〕（架構）** 26 個讀者中還有以 `isLoggedIn` 切 UI 的元件 → 階段 4 grep 清查、逐一列入或排除。
- **[P2]〔§4〕（UI/UX）** 登出用 `tone="secondary"` 還是 ghost、與結帳主 CTA 的距離〔需人工裁決〕→ 以實機畫面定、§4 寫明（`Button` 的 `tone` prop 已存在，`ProtectedRoute.tsx` 有用）。
- **[P2]〔§4、§2.1〕（UI/UX）** 無提示的漏斗使用者（LINE 內建瀏覽器 storage 隔離）前幾百毫秒仍見「登入」 → 漏斗路由（complete-profile／payment／OTP）上 `unknown` 期間畫中性占位，或明列已知限制。
- **[P2]〔§4〕（UI/UX）** 320px 只驗 funnel → e2e 涵蓋四 view（含 admin「平台管理」＋頭像）。
- **[P2]〔§4、S5〕（UI/UX）** funnel→member 轉換時 BottomNav 出現、padding 增加，開通中頁有一次跳動 → S5 斷言或明說接受。
- **[P2]〔§4〕（需求）** 登出位階、320px 是實作描述不是驗收 → 寫成 e2e 斷言、說明 CLS 量法。
- **[P2]〔§1.1〕（需求）** 更正表行號會飄 → 行號移 progress.md，plan 只留事實差異。
- **[P2]〔§5 階段 5〕（需求）** §5.3 擴寫與 ui-ux 頁首指標超出本 plan 需求 → 確認為總綱已裁決（總綱 §1.3、§1.4 階段 4 有此項），否則降為開放問題。

## 需人工裁決

- **審查侷限**：系統、架構、UI/UX 三位 reviewer 沒有 Bash，**讀不到上游總綱**（`git show 55268e03:…`），對總綱沿用部分只依子 plan 轉述採信；需求 reviewer 也表明未逐條驗總綱。修訂後重跑時應把總綱 §1 全文放進 prompt。
- 系統 P1「heal 併發安全」reviewer 自標需人工裁決（未讀 `healPaidPendingOrdersBestEffort` 內部）。
- 系統 P1「`get_logs` 保留期」是 reviewer 記憶、未驗證。
- 本彙整未改判任何一項。

## 處置（人審後填寫）

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
