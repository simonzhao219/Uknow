# 暫時性故障不登出（T1-B）規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent（fresh context）的發現。輸出契約見 docs/_templates/review.md。
     審查對象：同目錄 plan.md 初稿（2026-11-01）。只彙整、去重、排序，不改判。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 5 | 6 | migration／RLS、金流冪等（pending 讀取 503 已覆蓋重複付款風險）、ETag、CORS、local scope 安全論述 |
| 架構 | 0 | 4（＋1 未標級） | 7 | appShell `useRevalidateOnFocus` 字面與 memo deps 契約、後端單檔慣例、無 migration、lazy／apiClient 出口 |
| UI/UX | 0 | 4 | 4 | BottomNav 五格契約、頁首 degraded 對應、漏斗頁不改進度 |
| 需求 | 0 | 4 | 3 | §1.3 排除清單、無金流參數硬編、§14 #8③④排除 |

**無 P0。** P1 共 17 條（去重後 13 條）。

## 發現清單（依嚴重度排序；同一缺口多視角提出者合併、標註來源）

### P1

1. **〔§2.5／§3〕apiClient ↔ fetchProfile 循環 import，且確認邏輯落在哪一層未定**（系統＋架構）——`fetchProfile.ts:8` 已 import `buildApiUrl` from apiClient；
   refresh 錯誤分類必須在 `apiRequest` 的 401 分支（`apiClient.ts:85-90`），不是 `apiRequestJson`；apiClient 手上只有 token、沒有合併鍵 uid；
   raw `apiRequest` 呼叫端會多一種 `AUTH_UNAVAILABLE` 例外 → 把 `buildApiUrl` 抽成無依賴模組（或注入確認函式），明定落點在 `apiRequest`、
   第二步 `force:true`、列 raw 呼叫端處置。
2. **〔§2.3〕`getSession()` 本身失敗未處理**（系統）——`useAuthBootstrap.ts:219-226` 不看 `error`；refresh 遇 retryable 錯誤回 `session:null`＋error →
   現況 `signedOut` 清提示畫訪客版，與 C1 同症狀、R1–R6 測不到 → retryable error 走 unknown → 重試 → degraded，補 R3b。
3. **〔§2.3〕自動重試計時器與 SIGNED_IN 重播競態**（系統＋架構 P2）——transient 時 `uidRef=null`（`:186`），重播經 `begin()` 不遞增 gen（`:205`），兩請求並飛、
   其一不帶 `?retry=1` 又觸發 heal／repair；計時器與 listener 在 unmount／`endSession`／換 uid／SIGNED_OUT 的清除未寫 → 單一「排程／在飛」ref，三處取消；
   B3 加「transient 後重播不產生第二請求」「degraded 中 SIGNED_OUT 離開並移除監聽」。
4. **〔§2.4〕`routeAfterVerifiedSession` 的 transient 也落在 else → 導 complete-profile**（系統）——後端改全 503 後流量大增，老會員在 OTP／邀請入口遇故障被送進註冊頁
   → 明定 transient 處置（不 ingest、導 `/` 或原目標、交給 bootstrap degraded＋toast），補 R10 transient 案。
5. **〔§2.1〕`/auth/register` 寫入已提交後才 `buildProfileResponse`，503 讓前端誤判失敗**（系統）——`index.ts:765-790`；重送會走 `:781` 的 403「註冊已完成」
   → 定義 post-write 讀取失敗契約（告知前端 refreshUser 而非重送，或退回 200＋最小 body），查 CompleteProfile／PaymentResult 對 503 的處理並納入範圍。
6. **〔§3／§4〕漏斗頁「degraded 停原頁」與程式碼不符**（架構）——`PaymentCheckout.tsx:178-185` 非 ok 一律 `navigate('/login')`；`/payment/checkout`、
   `/auth/complete-profile` 不在 ProtectedRoute 下，守衛改動覆蓋不到；8 秒預設逾時還會放大此缺口 → PaymentCheckout 納入 §3／B5，transient 停原頁＋同一 callout，補情境。
7. **〔§3／B4〕`appShell.test.ts:188-196` 要求 apiClient／CompleteProfile／AuthPage 原始碼含 `clearAuthHint()`**（架構）——改走 `endInvalidSession()` 必紅，
   與 B5「不放寬」矛盾 → plan 明列改寫成「含 `clearAuthHint()` 或 `endInvalidSession(`」並註明是等價收斂；白名單與 knip 同步。
8. **〔§2.5〕hook 直接呼叫 `endInvalidSession()` 破壞注入慣例**（架構）——`AuthBootstrapDeps`（`:44-55`）的 supabase、storage 被繞過；與 hook 內
   `dropHint`／`hintRef` 不同步 → 形如 `endInvalidSession({ auth, storage })` 或新增注入鍵，說明 React hint state 由哪邊清。
9. **〔§4／§6 Q6／§7〕無提示（placeholder）時唯一出口「登出」被列為可選，且 §7 的風險防線依賴它**（UI/UX＋需求）——手機頁首是 `aria-hidden` 空槽
   （`Navbar.tsx:127-128`） → 升為必做或明確裁決替代出口；寫明位階（ui-ux §11）、44px、`aria-disabled`、鍵盤順序、scope（global 需後果提示或改 local），列驗收情境。
10. **〔§4〕「出現時焦點移到重試」違反 ui-ux §9「首次載入不搶焦點」；重試後 callout 卸載、焦點掉到 body**（UI/UX）——不搬焦點、靠 live region；
    按重試把焦點交 spinner `<output tabIndex={-1}>`，成功交頁面標題、失敗交回 callout；`scroll-mt-20`。
11. **〔§4／§2.3〕「重新連線中…」與狀態流矛盾**（UI/UX）——degraded→unknown 會讓 `ProtectedRoute.tsx:28` 整頁換 spinner，callout 永遠看不到重試中
    → (a) 獨立 `isRetrying`、callout 不卸載（reviewer 偏好）或 (b) 刪該描述。
12. **〔§4〕三態只描述一半**（UI/UX）——`ProtectedRoute.tsx:30-32` spinner 未補 `role="status"`／文字（已核對，PR-A 沒補）→ 列必做；連續失敗無反饋 → 換描述；
    「恢復連線後會自動繼續」在後端掛但裝置在線時不成立 → 改文案或加低頻輪詢。
13. **〔§1.2〕驗收情境缺口**（需求）——缺：degraded 中後端回 401 → 登出；漏斗頁 degraded 停原頁；首頁 degraded 不放 callout；主動登出仍 global；
    rpc 回 null 的常態失敗；R1／R3 邊界（連兩次失敗必進 degraded）要明寫。
14. **〔§2.4／Q1〕404 統一處置缺需求依據且使用者可見**（需求；系統 P2、架構 P2 同指）——toast 文案與「聯絡客服」管道規格書沒有；重登後再 404 形成登出循環（系統）；
    `routeAfterVerifiedSession` 既有測試／e2e 可能以 404→complete-profile 為契約（架構）→ 維持待裁決；補發生率與客服處置；列需改寫的既有測試。
15. **〔R11／§2.5／§3〕`AUTH_UNAVAILABLE` 的使用者呈現未定義；§3「安全」段已把 local 當定案、與 Q3 待裁決矛盾**（需求）→ 補呈現（toast／頁面錯誤／degraded），§3 措辭服從 Q3。

### 未標級（架構，「階段切分可測性」段）

- **〔§5〕B3 依賴 B4 的 `endInvalidSession`，順序反了**——B3 紅燈無法 import 尚不存在的模組 → `endInvalidSession.ts`（含單元測試、appShell 白名單）前移到 B3 之前，
  或 B3 的 unauthorized 改道留到 B4；降級路徑口徑同步核對。〔reviewer 未給嚴重度，主 session 不代判〕

### P2

- **〔§2.3／§4〕冷啟動最壞約 18 秒純 spinner**（系統＋架構；UI/UX P1-12 相關）——8＋2＋8，plan 寫「約 10＋2」；`SESSION_STALL_MS` 與 `:215` 註解過期 →
  第二次用較短逾時或首次逾時即 degraded、背景再試；更正文字與註解。
- **〔§2.2〕8 秒預設逾時影響全站所有 `fetchProfile` 呼叫者**（架構）→ 驗證標準補各呼叫者檢視，或預設不套、只由 bootstrap／refreshUser 傳入。
- **〔§2.3〕focus／online listener 另寫一套**（架構）→ 重用 `useRevalidateOnFocus`（先確認是否涵蓋 `online`）。
- **〔§2.3〕reducer 轉移表缺**（架構）——`start` 回 INITIAL 會清 outcome；需區分「重試」與「換 uid 的 start」→ 補轉移表與 action 名。
- **〔§3〕F1 撞檔補強**（架構）——B0 產出 F1 後 `begin/load` 結構快照，B3 前確認 `uidRef` 在 degraded 重試的語意與 flag 關係。
- **〔§2.1〕`api-contract.ts` 前後端共用可行性未確認**（架構〔需人工裁決〕）；**`PROFILE_UNAVAILABLE` 在 `/profile` 路徑無前端消費者**（系統）→ 確定讀者或暫不放共用契約（knip）。
- **〔§2.1〕`authenticate()` 未涵蓋 `getUser` 拋非 Auth 例外**（系統）→ try/catch 一律 transient，補 R7。
- **〔§2.1〕degraded 重試都帶 `retry:true`，待開通者先拿到未自癒的 step 2**（系統）→ 補「retry 回 step 2＋paid 時守衛導結果頁」案；retry 不進 inflight 與 AuthPage 非 retry 請求並行 → 登記 inflight 或文件化。
- **〔§2.1〕`.single()` 的 PGRST116 同時涵蓋 0 列與多列**（系統）→ 確認 `user_account_status` 唯一性或比對 `details`。
- **〔§2.5〕登入表單 404 分支（`AuthPage.tsx:374`）與 toast／導頁互動、重登循環**（系統，推測）→ 停在 `/login` 顯示客服提示。
- **〔§4〕「全站只一個 `role="status"`」不成立**（UI/UX）——`status-callout.tsx:75` 內建，repo 約 33 處 → 改「degraded 同時只一個」，確認不與 MaintenanceBanner 疊加。
- **〔§4〕首頁 degraded 無提示時頁首空槽、無任何說明**（UI/UX〔需人工裁決〕）→ 補斷線 icon＋`aria-label` 或明寫已知取捨。
- **〔§2.4〕404 toast 跨導頁可能看不到、元件與 role 未指定**（UI/UX）→ 指定 ToastContainer error 變體，或 `/login` 頁內 StatusCallout。
- **〔§4〕StatusCallout 用法**（UI/UX）——按鈕走 `action` slot（`status-callout.tsx:51-58`）；雙鈕 320px `flex-wrap`、overflow sweep 涵蓋；`titleAs` 可考慮 `h2`。
- **〔§1.1 C6〕`referral_codes`、`effective_registration_step` 改 503 超出 §14 #8①② 字面**（需求）——與 §5.3 精神一致、不算腦補 → 溯源逐項對應，B6 措辭防 spec-drift 失配。
- **〔§4〕時間參數與文案寫在需求段、e2e 綁死文案**（需求）→ 標為可調；e2e 用 role／testid。
- **〔§5 B6〕降級後 §14 #8 最終文字未定**（需求）→ 明寫。

## 需人工裁決

1. **Q1 `/profile` 404 語意**（plan 建議 A＝本機登出＋toast）：需求視角認為缺依據、系統視角指出重登循環與「未來 RLS 誤回 404 會全體登出」風險。另案：異常帳號不登出、停在 `/login` 顯示客服提示。
2. **Q6 degraded 無提示時的出口**：UI/UX 與需求都要求升為必做；若做，scope 用 global（需「會登出所有裝置」提示）或 local。
3. **「恢復連線後會自動繼續」**：改文案，或加低頻輪詢（UI/UX）。
4. **首頁 degraded 無提示時是否補斷線指示**（UI/UX）。
5. **B4（apiClient 兩層確認）本 PR 做或拆**：系統 P1-1 的落點問題與 F1 撞檔相關，依 F1 合併後的差異定（系統）。
6. **`api-contract.ts` 是否可被前端 import**（架構，reviewer 未逐一驗證）。
7. **架構「階段順序反了」一條未標級**，主 session 不代判。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。 -->

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
