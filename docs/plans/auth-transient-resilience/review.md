# 暫時性故障不登出（T1-B）規劃書審查報告（v2）

<!-- 由 /review-plan 彙整四個 reviewer subagent（fresh context）的發現。輸出契約見 docs/_templates/review.md。
     審查對象：plan.md v2（業主裁決 W4-11～17＋v1 審查 P1 修訂後）。v1 報告：`git show 65fb23c:docs/plans/auth-transient-resilience/review.md`
     （P0 0、P1 17〔去重 15〕＋1 未標級；v1 各 P1 已在 v2 處置，四視角皆確認解掉或解一半，見下）。
     只彙整、去重、排序，不改判。v2 的 P1 已由主規劃者落地成 plan v2.1（標〔v2審〕），**未再重跑審查**——是否需要第三輪由人決定。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | v1 P1 解除狀況 | 無缺口面向 |
|---|---|---|---|---|---|
| 系統 | 0 | 3 | 5 | 5 條解 4、R3b 解一半 | 金流冪等（重試／`?retry=1`／結帳重讀都不發起付款）、register post-write 契約、migration／RLS、`authenticate()` 範圍、anomaly 不登出、R6c |
| 架構 | 0 | 2 | 6 | 循環 import、B3／B4 順序、注入慣例、appShell 改寫全解 | F1 撞檔處理、後端單檔、lazy／apiClient 出口、B7 依賴方向、降級路徑、`AuthState` 已預留 |
| UI/UX | 0 | 2 | 6 | 4 條解 3.5（成功路徑焦點） | BottomNav 五格、行動版佈局、事件重試、三態、漏斗頁 |
| 需求 | 0 | 2 | 5 | v1 缺口的驗收情境皆已補 | 排除清單、無金額參數、W4-11～17 全有落點 |

**無 P0。** P1 9 條，全部可在 plan 內調整、不需重議 §0.1。

## 發現清單（依嚴重度；「落地」欄＝v2.1 的處置位置，供人核對，非改判）

### P1

| # | 視角 | 發現 | 建議 | v2.1 落地 |
|---|---|---|---|---|
| 1 | 系統 | 〔§2.3〕`INITIAL_SESSION(null)` 分支（`useAuthBootstrap.ts:237-238`）未納入：初始化 refresh 遇暫時性故障時仍搶先 `signedOut`，與 getSession 路徑競態 | getSession 為 session 有無的唯一判定者；R3b 加同時觸發 INITIAL_SESSION 案 | §2.3 首條、R3b |
| 2 | 系統 | 〔§2.3〕重試入口在「有 uid／無 uid」兩起點行為未定；`begin()` 同 uid 早退；自動重試不能 dispatch `start`；計時器清除時機未寫 | 補 `retryAuth` 偽碼與清 timer 規則 | §2.3 偽碼 |
| 3 | 系統 | 〔§2.7〕「端點自己的 401」與「session 無效的 401」在 `apiRequestJson` catch 無法區分，仍會誤登出 | 以 `ApiError.code` 分流（`SESSION_INVALID`／`UNAUTHORIZED`），R15 補案 | §2.7 第 3 點、R15 |
| 4 | 架構 | 〔§5〕B5（PaymentCheckout）要用 B6 才建的 `AuthDegradedNotice`；元件應為純呈現（兩處重試來源不同） | 前移元件或挪動；props 化 | §4.1 純元件、§5 B5／B6 對調 |
| 5 | 架構 | 〔§2.2〕B2 把 404 改 `missing` 但消費端到 B4／B5 才處理，中間 commit 語意靜默偏移（型別與 check 都綠） | exhaustive `never` 或延後分類；註明中間態只能整 PR 合 | §2.2〔v2審〕兩條、§5 中間態註記 |
| 6 | UI/UX | 〔§4.1〕重試成功後 callout 卸載，「維持瀏覽器預設」＝焦點掉 body | 只在使用者按重試成功時移焦點到 `main`；R2 斷言 | §4.1 重試中、R2 |
| 7 | UI/UX | 〔§2.6／R8b〕register post-write 失敗只有會消失的 toast，表單仍可再送 → 遇 403 | 頁內持久 callout＋「重新載入資料」、送出鈕 `aria-disabled` | §2.6、R8b |
| 8 | 需求 | 〔§1〕R3 的 P2-6、P2-15 編號在工作樹 grep 不到定義段，wave-3 另有一個 P2-15 指別的事 | 在 plan 寫原文一句＋出處 | §1 溯源 |
| 9 | 需求 | 〔§2.4〕AuthPage 掛載 effect 的 `catch`、登入表單的 410 處置未定、無驗收 | 明寫並補 R10c | §2.4〔v2審〕兩條、R10c |

### P2

- 系統：anomaly 時提示衍生仍是「保持」→ 明寫 `anomaly → hintKind=null`〔落地 §2.3〕；AuthPage callout 顯示來源未定（context 或 effect）〔落地 §2.4〕；register 契約措辭只寫單向
  〔落地 §2.1〕；`uq_referral_codes_one_active` 是 `maybeSingle` 前提，B1 釘住〔落地 §2.1〕；retry 取代在飛登記後舊請求 `finally` 不得誤刪，B2 加案〔落地 §2.2〕。
- 架構：`AuthBootstrapSupabase.getSession()` 型別需擴充 `error`、mock 同步〔落地 §2.3〕；`authAnomaly` 與 AuthPage 自讀兩個真相來源、`uidRef` 保留〔落地 §2.3、§2.4〕；
  B4–B5 中間態守衛未接〔落地 §5 註記〕；degraded 登出應重用既有會員登出、不新增提示寫入點〔落地 §4.1〕；hook 膨脹→抽 `authRetryScheduler`〔落地 §2.3〕；
  `apiUrl.ts` 列入不得 import App；`endInvalidSession` 在 B3 可能被 knip 報未使用〔需人工裁決→落地 §5：開工實跑，紅則 B3 併 B4〕。
- UI/UX：異常 callout 的「聯絡客服」無入口〔落地 §2.4：用既有 `LINE_OFFICIAL_ACCOUNT_URL`〕；異常 callout 用 `role="alert"`、必要時 `titleAs="h1"`〔落地 §4.3〕；
  登出鈕進行中／失敗態〔落地 §4.1〕；StatusCallout 內按鈕傳 `container`〔落地 §4.1、§4.3〕；AuthPage 掛載 transient 與檢查期間表單〔落地 §2.4〕；
  重試狀態播報——失敗後換說明〔落地 §4.1、R2〕。
- 需求：異常 callout 的說明句、LINE 連結、登出鈕、隱藏表單是 W4-11 衍生設計〔落地 §2.4 註明〕；R5 改可證偽寫法〔落地〕；AdminRoute／RequireMembershipRoute 的 degraded 驗收
  〔落地 R1b〕；R15 標 B7 降級條件〔落地〕；5 秒換文案無驗收〔落地 R4b〕。

## 需人工裁決

1. **客服入口**（需求 P2＋UI/UX P2）：v2.1 預設用既有 `LINE_OFFICIAL_ACCOUNT_URL`（Footer、結帳頁已用同一入口），不另立管道。若業主要別的入口（email `OFFICIAL_EMAIL`、兩者並列）再改。
2. **是否需要第三輪 `/review-plan`**：v2 的 P1 已落地，但由規劃者自己落地、未經獨立視角複核（「做事者不自評」的殘餘）。建議：落地項皆為補規則／補驗收，不改裁決或架構方向 → 不重跑，
   由 `/review-implementation` 在實作後攔偏離；若人要求則重跑。
3. knip 對「只有測試消費者的匯出」是否報錯（架構）：開工實跑確認，不擋規劃。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。 -->

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
