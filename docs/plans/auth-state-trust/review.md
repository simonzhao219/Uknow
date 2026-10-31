# 登入狀態信任（T1）規劃書審查報告——v4 重審（定稿）

<!-- /review-plan 彙整四個 fresh-context reviewer 的發現。只彙整、去重、排序，不改判。
     輸出契約見 docs/_templates/review.md。審查對象：./plan.md v4（業主 D1–D6、E1–E5、F1–F5 後修訂）。
     歷次：v1（P0 1／P1 18／P2 15）ddb591bf；v2（0／12／16）193fec78；v3（0／8／16）6707b1e7（皆 git show <hash>:docs/plans/auth-state-trust/review.md）。
     本輪四位 reviewer 讀了總綱 §1、v3 報告與 progress.md 的 A0 查證，逐項確認 v3 處置。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 2 | 金流冪等、migration／RLS、多分頁競態、PR-A 單獨上線不比現況差、PR-B 讀取對照表與三呼叫者、CORS 與 `?retry=1`、已知限制三條完整 |
| 架構 | 0 | 2 | 3 | 慣例相容、PR-A／PR-B 切分乾淨、A3 降級項（除 clearAuthHint）、appShell 契約、各階段可測且依賴順序正確 |
| UI/UX | 0 | 1 | 1 | 三態完備、BottomNav 五格契約、a11y、資訊架構、LINE 內建瀏覽器 |
| 需求 | 0 | 0 | 0 | 溯源、覆蓋與排除、驗收可測、業務規則、開放問題品質——**建議定稿** |

去重後 P1 4 項（系統 P1-1 與 UI/UX P1 同一缺口）。v3 的 P1／P2 四位 reviewer 均確認已處理。

## 發現清單（依嚴重度排序）與落地狀態

本輪無需業主裁決的 P1；主 session 授權「P0 0 且剩餘 P1 皆技術修正即定稿」。以下 P1 與可直接落地的 P2 已**依 reviewer 建議原樣寫進 plan v4.1**，
未再跑一輪審查——實作後的 `/review-implementation` 會覆蓋這些點。

### P1（皆已落地）

- **[P1]〔§2.2 提示形狀、§4.1 funnel、S9、S10〕（系統＋UI/UX，去重）** 提示只存 `kind:'funnel'`，非漏斗路由首繪畫不出 E4 鈕的正確文案與連結（待開通者會先看到「繼續完成註冊」再翻成「查看開通進度」，正是 F2 要避免的誘導，也破壞 S9）→ **已落地**：提示加 `next: 'profile'|'checkout'|'result'|null`（不存 tradeNo），首繪據此決定文案與暫用連結，判定後同節點只換 `href`；S10 補帶提示冷啟動一案。
- **[P1]〔§4.2 失敗語意〕（系統）** supabase-js 網路錯誤時 `signOut` 不清本機 session，導 `/login` 後 AuthPage 會把人拉回漏斗頁，toast「已登出此裝置」成假訊息 → **已落地**：global 失敗後補 `signOut({ scope:'local' })`，A3 斷言 `getSession()` 為 null；Navbar 會員登出同一處理。
- **[P1]〔§2.1 `nextFunnelRoute`、§2.5 import 邊界〕（架構）** `resolveMembershipRedirect` 在 `RequireMembershipRoute.tsx`（import App），`registrationFlow.ts` 呼叫它會循環依賴；`activating` 無 `lastTradeNo` 時文案「查看開通進度」卻導結帳頁 → **已落地**：抽 `redirectForGate(p)` 純函式進 `registrationFlow.ts`，`resolveMembershipRedirect` 改薄包裝；E4 文案依**目的地**決定。
- **[P1]〔§2.5 context 形狀、A2b〕（架構）** `member-pending` 要 `initial` 但 context 不外露提示；OTP／AuthPage 拿不到 hook 的 `ingestProfile` 與 `fetchProfile` 實例 → **已落地**：context 加 `hintInitial`、`hintNext`、`ingestProfile`；`fetchProfile` 定為模組單例，hook 呼叫其 `clearInflight()`；memo deps 同步。

### P2

- **[P2]〔§2.5 reducer〕（系統）** 已有 user 時背景重驗遇 transient 的處置未定義 → **已落地**：狀態不變、保留舊資料（總綱 §1.2B）。
- **[P2]〔§2.3 `?retry=1`〕（系統）** 「跳過 repair 與 heal」範圍不明，整塊跳過會讓 step 3 回 `paidAwaitingActivation:true` → **已落地**：只跳過兩支 RPC，旗標重設照常；B1 加測試。
- **[P2]〔§2.5 import 邊界、§4.2〕（架構）** Navbar 會員登出呼叫 `clearAuthHint()` 但不在白名單；若隨 `startTransition` 修正被降級會殘留提示 → **已落地**：Navbar 加入白名單；`clearAuthHint` 與 local 補登出列「不可降級」。
- **[P2]〔§5 A2a／A2b〕（架構）** `refreshUser` 在 A2a 搬家時 `setItem('user')` 去留未定 → **已落地**：A2a 搬時即不再寫，A2b 只刪其餘兩處。
- **[P2]〔§2.5 FUNNEL_ROUTES〕（架構）** 結尾斜線（`/payment/result/`）會被判非漏斗 → **已落地**：比對前去結尾斜線，加一格測試。
- **[P2]〔§4.2 D2〕（UI/UX）** 首購「稍後付款」現在會登出，鈕上文字未提示〔需人工裁決〕→ **列 Q8**（不擋開工，業主順帶確認；預設維持現文案）。

## 需人工裁決

- 無阻擋項。Q6（登出鈕樣式，看圖定）、Q7（取消註冊確認框一句）、Q8（「稍後付款」鈕文字）皆標「不擋開工」，於 A3 實機截圖時一併請業主確認。
- 本彙整未改判任何一項；P1／P2 的落地是照 reviewer 建議，未自行變更其內容。

## 處置（人審後填寫）

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

- [x] 規劃收斂：v4 無 P0；P1 4 項已依建議落地為 plan v4.1（2026-10-31，主 session 授權「P0 0 且剩餘 P1 皆技術修正即定稿」）。
- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃——由業主於第 3 波親自下 `/tdd-implement auth-state-trust` 前勾選。
