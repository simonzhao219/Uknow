# 登入狀態信任（T1）規劃書審查報告——v3 重審

<!-- /review-plan 彙整四個 fresh-context reviewer 的發現。只彙整、去重、排序，不改判。
     輸出契約見 docs/_templates/review.md。審查對象：./plan.md v3（業主 D1–D6、E1–E5 後修訂）。
     歷次：v1（P0 1／P1 18／P2 15）git show ddb591bf:docs/plans/auth-state-trust/review.md；
           v2（P0 0／P1 12／P2 16）git show 193fec78:docs/plans/auth-state-trust/review.md。
     本輪四位 reviewer 都讀了總綱 §1／§8.2 全文與 v2 報告，逐項確認 v2 處置。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 3 | 查證 SQL 表名欄位對得上 schema、誤判模型與 `/profile` 現況一致、金流冪等、多分頁競態、無 migration／RLS、PR-B 讀取對照表、PR-A 無逾時自洽 |
| 架構 | 0 | 3 | 5 | 22 支 mock 回落、memo deps 與 appShell regex、可測性、A0 非 TDD 前置合理、與 lazy／apiClient／單一 Edge Function 慣例相容 |
| UI/UX | 0 | 2 | 4 | BottomNav 五格契約、a11y 基本語意、CLS 量法、取消註冊並存語意、E5 toast 分流 |
| 需求 | 0 | 2 | 4 | 範圍與排除、裁決落點、溯源（新增需求明標）、不涉 `reward_config`、金流會籍規則未改、S1–S11 可證偽、無腦補 |

去重後 P1 8 項（系統 P1-1 與架構 P1-1 同一矛盾，合併）。**v2 處置**：四位 reviewer 逐項確認 v2 的 P1 全數已處理或部分處理，殘餘轉為下列 v3 發現。

## 發現清單（依嚴重度排序）

### P1

- **[P1]〔§2.2 hintKind 映射 vs PR-A transient〕（系統＋架構，去重）** `authState==='anonymous' ? null`（清提示）與「PR-A 5xx 不清提示、頁首依 anonymous 畫訪客版」互相矛盾——一次 5xx 就清掉 `member` 提示；且 reducer 把 `unknown ⇔ isLoadingUser` 釘死時，transient 的終態未定義 → transient 在 reducer 有可區分的內部狀態（`sessionPresent`／`lastOutcome:'transient'` 或 `bootstrapError`），`hintKind` 遇之為「保持」；只有 `getSession()` null、`SIGNED_OUT`、401／404／410 才清；A2 加「5xx 後提示仍在」。
- **[P1]〔§2.3、B2〕（系統）** `X-Uknow-Retry` 自訂 header 不在 CORS `allowHeaders`（`index.ts` 只允許 `Content-Type`、`Authorization`、`If-None-Match`），preflight 失敗、重試永遠被當 transient，全 mock e2e 也測不出 → B1 明列 `allowHeaders` 加入並以 deno 測試斷言 preflight，或改 query 參數（`?retry=1`）。
- **[P1]〔§2.5、§2.2〕（架構）** 換帳號時「首繪 `hint` state 設為 null」無歸屬：hint state 在 App，hook 注入／回傳面都沒有它，S11 無法只靠 hook 落地 → 注入 `onAccountSwitched()`，或讓 hook 擁有 hint state 並回傳；import 邊界寫明擁有者。
- **[P1]〔§5 A0／A1 vs §3〕（架構）** A0 查證 ＞0 時「`/profile` 加布林欄位屬 A1」會讓 PR-A 動到 `index.ts`／`api-contract.ts`（§3 規定 PR-B 才動），破壞 D4「PR-B 可晚一波」與「PR-A 單獨上線」→ A0 明寫分支：全 0 → PR-A 純前端；＞0 → 拆成 PR-A 內獨立後端階段（A1b）並調整撞檔與 deno 測試。〔需人工裁決〕是否預留該階段。
- **[P1]〔§2.1 A0、§7〕（需求）** A0 結果 ＞0 時沒有決策路徑：該格怎麼寫進 `classifyMembershipGate` 與守衛、守衛輸出是否變（與 §1.2「不改導向決策」衝突）；是否回主 session 重審 → 寫明（reviewer 建議：只影響 `isFirstTimeFunnel`、不動 `resolveMembershipRedirect`）；非 0 時回主 session 而非 A1 自行加欄位。（與上一項同根，處置連動）
- **[P1]〔§0、E3、S4／S6〕（需求）** 業主成因 (1) 仍有兩個殘留：(a) Email 連結落在首頁且無提示時仍閃「登入」——業主三個入口之一；(b) PR-A 5xx 時有提示者看到「頭像占位→訪客版→導 `/login`」。業主已接受（E1、E3），但 §0「從第一個畫面起」措辭偏滿 → A4 規格書註記與 PR 描述明白寫出「仍會看到的三種情形」。〔需人工裁決〕Email 連結落首頁是否仍算「修好」，請業主再確認一次。
- **[P1]〔§4.1 funnel、S8、§4.3〕（UI/UX）** 320px 同列放 logo＋「繼續完成註冊」（primary、不縮寫）＋「登出」（ghost、icon＋文字）空間不夠：Navbar `container px-4` 內寬約 288px，logo 約 100px 後右側約 170px → 預定窄寬降級規則（登出窄寬只留 icon＋`aria-label="登出"`，或「繼續完成註冊」窄寬短標籤），S8 對 funnel＋E4 量寬度。〔需人工裁決〕icon-only 或短標籤。
- **[P1]〔§4.1、E4、S10〕（UI/UX）** 已付款待開通者的 E4 鈕導向 `/payment/result?tradeNo=…`，文字仍是「繼續完成註冊」——與 E5 為已付款者分開文案的原則矛盾，可能誘發再次付款或困惑 → 〔需人工裁決〕gate＝`activating` 時改「查看開通進度」，或維持原文案並在 S10 說明理由。

### P2

- **[P2]〔§2.4、§2.5〕（系統）** single-flight 只以 user id 為鍵：登出（global 撤銷）後立刻同帳號重登，新 caller 合併到以已撤銷 token 在飛的舊請求，回 401 把新 session 登出 → `SIGNED_OUT`／換 session 時清空 in-flight map，或鍵加 generation。
- **[P2]〔§4.1 10 秒安全出口〕（系統）** 沒說是否涵蓋 `/profile` 卡住（PR-A 無逾時）：涵蓋則 10 秒後畫 guest、之後翻 funnel，違 S4；不涵蓋則頁首永遠空白 → 明寫計時只管 `getSession()`，接受 `/profile` 掛住時頁首空白為已知限制；或漏斗路由 fallback 維持 placeholder。〔需人工裁決〕
- **[P2]〔§2.3〕（系統）** `buildProfileResponse` 另有 `/auth/register`、`/auth/complete-registration` 呼叫者，讀取失敗的信號形式（throw／特殊值）未定 → B1 定義失敗信號與兩呼叫者的行為。
- **[P2]〔§2.5 載入旗標〕（架構）** reducer 衍生 `isLoadingUser` 後，`refreshUser`／focus 重驗不得轉入 `unknown`（現況刻意不碰，避免全頁 spinner）；新 uid 的 SIGNED_IN 轉 unknown、同 uid 重播不轉 → 寫進 reducer 動作表，A2 加測試。
- **[P2]〔§2.5 漏斗路由清單〕（架構）** `FUNNEL_ROUTE_PREFIXES`（正向）與 `shouldRedirectToCompleteProfile`（負向豁免）語意不同、無法共用；`/payment/` 前綴會誤收未來非漏斗的 `/payment/xxx` → 改列完整路徑（`/payment/checkout`、`/payment/result`），「共用」改為「各自獨立、由測試互相鎖定」。
- **[P2]〔§2.5、§2.2〕（架構）** `localStorage.user` 寫入端（`refreshUser` `App.tsx:257`）與 `pendingSession` 清除未進副作用表；`ingestProfile` 是否繼續寫未定 → A0 清查加 `localStorage.user` 讀寫全表；若不再寫，確認零讀者。
- **[P2]〔§5 A2〕（架構）** A2 一階段 12 項驗證標準過大 → 拆 A2a（hook＋reducer＋副作用表）與 A2b（9 處收斂＋AuthPage 合併＋hint 接線），中間態 `npm run check` 保持綠。
- **[P2]〔§2.5 import 邊界〕（架構）** `hooks/useAuthBootstrap.ts` 被 App import，必須禁止 import `'../App'`（否則循環），清單漏列；守衛要以解析後路徑比對涵蓋 `../App` 與 `../../App` → 補入清單。
- **[P2]〔§4.1 placeholder、§4.3 第 6 點〕（UI/UX）** 槽 `aria-hidden`、主體只靠各頁既有 spinner，未要求可讀文字 → A3 驗收加「漏斗路由主體載入指示須有可讀文字或 `role="status"`」。
- **[P2]〔§4.1 member-pending〕（UI/UX）** 選單一排灰色項目無說明 → 選單頂端加「載入中…」或只顯示「登出」。
- **[P2]〔§4.1 funnel→member、S5、S9〕（UI/UX）** PaymentResult 停留期間 BottomNav 突然彈出可能遮內容 → 導 `/dashboard` 前不顯示 BottomNav，或列 A3 手機實測項。
- **[P2]〔§4.1 登出位階、Q6〕（UI/UX）** 漏斗路由內只有單顆 ghost 登出時可能太不顯眼 → Q6 截圖也要涵蓋「漏斗路由單顆登出」。
- **[P2]〔§1.1 S1／S9〕（需求）** S1 觀察器只掛 `nav`，沒涵蓋 BottomNav 與 `main` padding 首繪 → S1 補「首繪起 BottomNav 有無與最終一致」，或 S9 範圍含 `main`。
- **[P2]〔§1.1 S3／S5〕（需求）** S3 的「已付款待開通」fixture 與 S5 起點應為同一份 → 測試設計細節，不擋開工。
- **[P2]〔§5 A3、時程〕（需求）** PR-A 份量（A2、A3 各 8–10 條標準、S 案例 11 個）距 11/10 約 10 天，A2 延誤會卡 A3 → 預寫 A3 可降級項（`startTransition` 修正、逐頁補 spinner 可拆到 PR-A 之後）。
- **[P2]〔§6〕（需求）** 「PR-A 已知限制」是已接受事實、非待裁決 → 移到 §0 或 §7。

## 需人工裁決

- 〔業主〕320px 窄寬降級：登出 icon-only，或「繼續完成註冊」短標籤（UI/UX P1）。
- 〔業主〕已付款待開通者的 E4 鈕文案：「查看開通進度」或維持「繼續完成註冊」（UI/UX P1）。
- 〔業主〕Email 連結落首頁且無提示仍閃一次——E3 已接受，是否再確認（需求 P1）。
- 〔業主／主 session〕A0 查證 ＞0 時的路徑：預留 PR-A 內後端階段 A1b，或回主 session 重審（架構 P1、需求 P1 同根）。
- 〔業主〕漏斗路由在 `/profile` 卡住時頁首保持空白（不畫 guest）是否接受（系統 P2）。
- 本彙整未改判任何一項。

## 處置（人審後填寫）

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
