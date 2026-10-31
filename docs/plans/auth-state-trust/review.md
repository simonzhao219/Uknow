# 登入狀態信任（T1）規劃書審查報告——v2 重審

<!-- /review-plan 彙整四個 fresh-context reviewer 的發現。只彙整、去重、排序，不改判。
     輸出契約見 docs/_templates/review.md。審查對象：./plan.md v2（業主 D1–D6 後修訂）。
     v1 報告（P0 1／P1 18／P2 15）：git show ddb591bf:docs/plans/auth-state-trust/review.md
     本輪 reviewer 拿到總綱 §1／§8.2 全文（scratchpad 摘出）；系統 reviewer 自述未讀該檔，總綱沿用部分依 plan 轉述採信。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 4 | 5 | migration／RLS、金流冪等（不碰 PayUni、`force` 輪詢不被延遲）、F1／F2 與 gate 共用、context 形狀與 appShell regex、回滾 |
| 架構 | 0 | 3 | 4 | gate 共用與決策表一致、appShell regex、e2e 基線移 A2、22 支 mock 回落、import 邊界、migration、PR-B 疊加性 |
| UI/UX | 0 | 3 | 4 | BottomNav 五格契約、CLS 與 320px、模式一致性（button／Link、aria-disabled、ghost 位階） |
| 需求 | 0 | 3 | 3 | 範圍與排除清單、11/10 時程切分、不涉 `reward_config`、S1–S9 可證偽、D1–D6 皆有落點 |

去重後 P1 12 項（系統與架構的 hint deps 合併為一項）。**v1 處置**：v1 唯一 P0（funnel 範圍）由 D1＝A 定案並落 §2.1，四位 reviewer 均確認已處理；v1 P1 多數已處理，殘餘轉為下列 v2 發現。

## 發現清單（依嚴重度排序）

### P1

- **[P1]〔§2.2、§2.5、§2.1〕（系統＋架構，去重）** hint 寫入 effect 的 deps `[authState, user?.id, user?.name, funnelProfile?.id]` 抓不到 F2 開通轉換（只有 `accountStatus`／`paidAwaitingActivation` 變），提示停在 `funnel`，S5 後重新整理會員只剩登出；且 §2.1 把 `funnel` 列成 authState 值、§2.5 又另設 `isFunnel`，前後不一 → authState 只留 `unknown/anonymous/authenticated/degraded`，funnel 一律是衍生布林 `isFunnel`；deps 改用衍生的 `hintKind`＋`initial`；A2 明列「user 只變 accountStatus、id 不變」與反向（member→funnel）案例。
- **[P1]〔§5、§2.2、§7〕（架構）** 8 秒逾時放 PR-A、重試與 degraded 在 PR-B：現況 `/profile` 無逾時、慢但會成功；PR-A 8 秒 abort→transient→導 `/login`，弱網下新增踢出登入，與 §7「未變差」矛盾 → (a) PR-A 的 `fetchProfile` 不設逾時、PR-B 才啟用；或 (b) 逾時＋一次重試＋transient 不導 `/login` 整組搬進 PR-A。D4 只有 (a) 自洽。
- **[P1]〔§2.2、§1.1 S1、§7〕（系統）** PR-A 的 transient 路徑：有 `member` 提示時先畫頭像占位，`/profile` 5xx／逾時後變訪客版並導 `/login`——等於新增一種閃爍，打破 S1 → 寫成 PR-A 已知限制，〔需人工裁決〕PR-B 晚一波時是否可接受。（與上一項同根，處置連動）
- **[P1]〔§4.1、§2.2、§7〕（UI/UX）** 無提示冷啟動在漏斗路由先畫 `placeholder`，最長 8 秒右上角空白、主體無載入指示、逾時後靜默導 `/login`，違 ui-ux §6 三態 → `placeholder` 約 3 秒後頁首槽或主體出載入指示；逾時導 `/login` 帶 info toast；若留給 PR-B，§6 明列已知缺口。
- **[P1]〔§2.2〕（系統）** `uid8` 比對只在 bootstrap 拿到 session 時做；同瀏覽器換帳號登入時，`ingestProfile` 前舊提示仍在，會短暫畫出前一人首字 → `SIGNED_IN` 時 `uid8` 不符同步清提示；補「A 提示殘留、B 登入，零次出現 A 首字」測試。
- **[P1]〔§2.4、A2〕（系統）** single-flight key＝access token：冷啟動窗口內 `TOKEN_REFRESHED` 換 token 就不再合併，與「冷啟動恰一次」衝突、也讓兩個 `/profile` 並行 → 寫明 `TOKEN_REFRESHED` 是否觸發 `/profile`（現況 App 註解：不觸發）；合併鍵改 user id（token 次要）或明說接受。
- **[P1]〔§2.5〕（架構）** `useAuthBootstrap` 注入／回傳面沒涵蓋現有 effect 的副作用：`navigate('/auth/complete-profile')`、`clearCache()`、`clearPendingInviteToken()`、`localStorage` 清理、`loadedUserIdRef` 去重 SIGNED_IN → §2.5 補副作用歸屬表（注入 `onSignedOut`／`onIncompleteProfile` 或留 App）；A2 加「SIGNED_OUT 清快取與邀請 token」「同 uid SIGNED_IN 重播被忽略」。
- **[P1]〔§4.2、§4.1、S5〕（UI/UX）** 共用登出 toast「繼續完成註冊」也會出現在 `/payment/result`（已付款待開通）——已付款者以為沒付成功、可能重複付款；登出時輪詢 `refreshUser` 未停 → toast 依 gate 分文案（`activating`：「付款已收到，登入後會自動開通」）；登出同時停輪詢，補 vitest。
- **[P1]〔§4.1、S3〕（UI/UX）** OTP 頁驗證**前**沒有 session，bootstrap 判 `anonymous` 畫 `guest`（「登入／立即刊登」）——業主影片現象之一未被覆蓋；「登出」對無 session 者也無意義 → 明定 OTP 驗證前頁首；S3／S4 的 OTP 案例拆驗證前／後兩格。〔需人工裁決〕驗證前只放 logo 還是保留「登入」。
- **[P1]〔§0、§1.1 S6〕（需求）** §0「從第一個畫面起」承諾大於驗收：S6 允許無提示的已登入會員在非漏斗路由閃一次（升版後首次、換裝置、storage 被清、LINE 內建瀏覽器、Email 連結落在 `/`），正是業主成因 (1) 的子集 → §0 改成實際涵蓋範圍；殘留列開放問題請業主確認，不只放 S6 與規格書註記。〔需人工裁決〕
- **[P1]〔§1、§2.1、A4〕（需求）** 規格書 §2.1 沒有「註冊中」角色；plan 引用 §2.1／§4.1 不支撐 W2-22 斷言 → §1 溯源明寫「W2-22／D1＝A 為新增需求，規格書依 A4 補列」；A4 新列寫成與 §2.1 同層級角色語句，含「已付款待開通屬此角色」。
- **[P1]〔§2.1 資料查證、§7〕（需求）** 誤判的最壞後果只剩一條「開工前資料查證」防線：SQL 只查無 subscriptions 有 completed 訂單，沒查贈送／手動開通；誰跑、何時、結果落哪未定 → 列為 A1 開工前置、結果落 progress.md；判定表預留「曾有會籍證據」一格。

### P2

- **[P2]〔§2.1 查證 SQL〕（系統）** SQL 用 `subscriptions`／`payment_orders`，但 `subscriptionEndDate` 來源是 `user_account_status` view → 改成直接模擬判定條件（`status != 'active'` 且 `end_date is null` 且曾有會籍）。
- **[P2]〔§2.3〕（系統）** `repair_orphaned_payments` 多版改寫（`20260716000006`、`20260724000006`、`20260802000002`…）冪等性未確認 → `X-Uknow-Retry: 1` 跳過 repair 改為預設，讀定義降為優化。〔需人工裁決：reviewer 未逐版讀〕
- **[P2]〔§2.2〕（系統）** `apiClient.ts`（session 過期）與 `CompleteProfile.tsx`（刪帳號）各自清 `localStorage.user`、靠 SIGNED_OUT 間接清提示，`signOut` 網路失敗時不一定觸發 → A4 清查所有 `removeItem('user')` 是否同步清提示，或守衛允許它們呼叫 `clearAuthHint()`。
- **[P2]〔§4.1〕（系統）** `placeholder` 無逾時出口（`getSession()` 永不 resolve 時頁首永遠空白）→ `unknown` 上限後改畫 `guest`，加測試。
- **[P2]〔§2.3〕（系統）** `profileHandler` try/catch 要涵蓋自癒遞迴 → B1 加「遞迴重入時查詢失敗 → 503」。
- **[P2]〔§2.5、§4.1〕（架構）** `isLoadingUser` 與 `authState` 兩套旗標可能不同批更新，F1 時一幀「守衛導 /login、頁首仍 unknown」→ bootstrap 單一 reducer 同批更新（或 `isLoadingUser` 由 `authState` 衍生），加 `unknown ⇔ isLoadingUser` 測試。
- **[P2]〔§5 A3／A4〕（架構）** `isLoggedIn` 視覺切換清查排在 A4，A3 的 S3 依賴它 → 清查提前到 A1 或 A3 開頭。
- **[P2]〔§4.2、§2.5〕（架構）** 共用登出 handler 落點未定（utils 下會有 React 依賴）→ 定為 `src/hooks/useFunnelLogout.ts`，守衛清單寫檔名；註明與 Navbar 會員登出不合併的理由。
- **[P2]〔§2.5〕（架構）** 漏斗路由清單與 App 路由表、`shouldRedirectToCompleteProfile` 各一份會漂移 → 共用常數或 vitest 比對路由表。
- **[P2]〔§4.1〕（UI/UX）** funnel 使用者離開漏斗路由（點 logo 回首頁）後頁首只剩登出、無路回結帳／完善資料。〔需人工裁決〕非漏斗路由是否放「繼續完成註冊」，或 funnel 時 logo 導向下一步。
- **[P2]〔§4.2〕（UI/UX）** 取消註冊既有確認框可加一句「只是想離開請用右上角登出」→ 小改文案。
- **[P2]〔§4.3 第 5 點〕（UI/UX）** 失敗語意與現況相反（現況失敗停原頁並提示錯誤）→ PR 偏離說明明寫、A3 補失敗路徑案例；保留 global scope 會連帶登出其他裝置。〔需人工裁決：§1.2 已列維持現況，確認接受即可〕
- **[P2]〔§4.1〕（UI/UX）** `member` 提示過期（實為 funnel／停權）時選單靜態連結會被守衛彈回 → `aria-busy` 期間選單項目 `aria-disabled` 或只留登出。
- **[P2]〔§6 Q6〕（需求）** 開放問題品質足夠 → 無需改動。
- **[P2]〔§4.2〕（需求）** 登出 toast 是新增文案 → 列待業主確認字串，或寫入 ui-ux 文案處。
- **[P2]〔§5〕（需求）** PR-B 晚一波時 §14 #8 維持現況 → PR-B 說明補一句，避免 A4 誤改。

## 需人工裁決

- 〔業主〕無提示、非漏斗路由的已登入會員閃一次（S6）是否接受（需求 P1）。
- 〔業主〕PR-A 的逾時處置：不設逾時（PR-B 才啟用）或把重試＋不導 `/login` 搬進 PR-A（架構 P1／系統 P1／UI/UX P1 同根）。
- 〔業主〕OTP 驗證前頁首：只放 logo 或保留「登入」（UI/UX P1）。
- 〔業主〕funnel 使用者在非漏斗路由是否放「繼續完成註冊」（UI/UX P2）。
- 〔業主〕登出 toast 文案兩句（一般／已付款待開通）。
- 〔確認〕使用者主動登出維持 global scope、失敗仍清本機並導頁（UI/UX P2）。
- 〔技術〕`repair_orphaned_payments` 冪等性未逐版確認（系統 P2）。
- 本彙整未改判任何一項。

## 處置（人審後填寫）

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
