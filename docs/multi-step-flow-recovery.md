# 連續流程的可恢復性（Multi-step Flow Recovery）

> 任何「需要連續多步才能完成」的流程，中斷任一步都必須能接得回去，
> 絕不能變成死巷。這份文件記錄一次真實事故的根因、盤點全站的連續流程，
> 並定出所有未來新流程都必須滿足的三條「可恢復性契約」與其強制機制。

## 1. 事故：註冊到一半就回不去了

**重現步驟**

1. 用 Email + 密碼註冊 → Supabase 建立了一個 **Email 未驗證** 的帳號
   （`email_confirmed_at = null`，但帳密都已存好）。
2. 被導向輸入驗證碼（OTP）的頁面，使用者關掉它。
3. 重開登入頁，輸入**正確**的帳密 → 卻一直顯示「Email 或密碼錯誤」，
   無法登入。使用者以為這個帳號「廢了」。

**根因（兩個各自獨立的缺陷）**

- **診斷說謊**：`signInWithPassword()` 對未驗證帳號回傳的錯誤其實是
  `email_not_confirmed`，**不是** `invalid_credentials`。但 `AuthPage.handleLogin`
  把**所有**錯誤一律吞成「Email 或密碼錯誤」。帳號是活的、密碼是對的，
  只差沒驗證，但畫面把它說成帳密錯。
- **流程沒有回頭路**：`/auth/check-email` 只回 `{ exists }`，無法分辨
  「已驗證的既有帳號（該登入）」與「註冊到一半、未驗證的帳號（該接續驗證）」。
  於是未驗證帳號被當成一般既有帳號送進登入表單——而登入表單對未驗證帳號
  永遠只會失敗，且沒有任何「回去驗證」的入口。

**本質**：這個 App 有一套很好的「註冊進度狀態機」（`registrationStep` 0→1→2→3，
由後端 `effective_registration_step` 即時算出）。但這套狀態機是從
`registrationStep = 0` 才開始的；在它之前還有一個看不見的前置狀態——
**「帳號已建立、但 Email 未驗證」**——這個狀態不在狀態機裡，沒有人負責
讓它可以被恢復。**每一個「離開頁面就遺失、又沒人負責恢復的中間狀態，
都是一個潛在的死巷。」**

## 2. 修法

分三層，對應 commit 內容：

| 層 | 內容 | 檔案 |
|----|------|------|
| L1 止血 | `handleLogin` 用 `classifyLoginError` 分辨 `email_not_confirmed`，導回 OTP 驗證而非謊報密碼錯誤；`check-email` 回傳 `confirmed`，讓步驟 1 就能把未驗證帳號直接接續驗證。 | `AuthPage.tsx`、`supabase/functions/api/index.ts` |
| L2 收斂狀態機 | 抽出 `src/utils/registrationFlow.ts` 作為「下一步去哪 / 錯誤怎麼分類」的**單一決策來源**，取代 `AuthPage`、`OTPVerificationPage` 各自維護的 if/else。 | `registrationFlow.ts` |
| L3 契約化 | 本文件 + 可恢復性 e2e 測試樣板，讓「中途關頁再回來」成為每個連續流程的回歸測試。 | `docs/`、`e2e/features/registration_recovery.feature` |

「未驗證帳號」現在有**兩道**互相獨立的守衛：

- **守衛 A（步驟 1 前置偵測）**：`check-email` 回 `confirmed=false` →
  一輸入 Email 就重寄驗證碼並導回 OTP，使用者根本不會進到會失敗的登入表單。
- **守衛 B（登入安全網）**：萬一表單還是被走到（`confirmed` 判斷不可得、
  或與 GoTrue 不一致），`handleLogin` 收到 `email_not_confirmed` 時同樣導回 OTP。
  以 GoTrue 為真理來源，確保即使前置偵測失手也不會死巷。

## 3. 全站連續流程盤點

| 流程 | 中間狀態存在哪 | 中斷後可否恢復 | 依據 |
|------|--------------|--------------|------|
| 註冊 → **OTP 驗證** → 完善資料 → 付款 | 後端 `registrationStep` + 本次修復的「未驗證」前置狀態 | ✅（修復後） | `AuthPage` / `OTPVerificationPage` / `registrationFlow` |
| 完善資料（CompleteProfile） | 後端 `registrationStep`（`hasCompleteProfile`） | ✅ | 登入/開機時依 step 重導 |
| 付款（PaymentCheckout / PayUni 回跳） | 後端 `registrationStep=1/2` + 訂單自癒 migration | ✅ | 路由守衛 + `process_successful_payment` 自癒 |
| 忘記密碼 → OTP → 重設 | 前端 router state（`otpType='recovery'`） | ⚠️ 部分：重整頁面會沿用倒數，但直接開 `/auth/reset-password` 無 session 時需重走 | `ForgotPasswordPage` / `OTPVerificationPage` |
| 提領（WithdrawalProcess 多步 dialog） | 前端 component state | ⚠️ 關閉 dialog 即遺失草稿（金額/照片已上傳者可由 `/rewards/id-photos` 復原） | `WithdrawalProcess` |

**規律**：靠**後端可查詢的狀態**驅動的步驟都能恢復；靠**前端記憶體 / 一次性導頁 /
router state** 驅動的步驟則容易死巷。OTP 驗證的前置「未驗證」狀態正是後者，
所以最先爆炸。

## 4. 可恢復性契約（新流程必須遵守）

任何新增的「連續多步流程」在 PR review 時必須滿足以下三條，缺一不可：

1. **狀態可被查詢（Server-derivable state）**
   「使用者現在卡在第幾步」必須能從後端（或至少是可持久化、跨分頁存活的來源）
   算出，不能只存在 React state 或單次 `navigate(state)` 裡。
   > 反例：本次事故的「未驗證」狀態只隱含在 Supabase auth，前端無從得知，
   > 於是無法導引。修法就是讓 `check-email` 把它暴露出來。

2. **每一步都有可重入的入口（Resumable entry）**
   不論使用者從哪裡回來（重新登入、直接開網址、重整），都要能被算出正確的
   下一步並接續，而不是只能從頭走一次或卡死。
   > 實作：導向決策集中在 `registrationFlow.ts`；「未驗證」有 `resumeUnverifiedSignup`
   > 這個單一重入點。

3. **失敗訊息要能區分「可復原 / 不可復原」，且永遠給下一步**
   錯誤處理必須先分類（可否恢復），可恢復的要把使用者帶回流程；
   絕不能把可恢復狀態顯示成終局錯誤。
   > 實作：`classifyLoginError` 把 `email_not_confirmed`（可復原）與
   > `invalid_credentials`（真的錯）分開處理。

## 5. 強制機制

- **單一決策來源**：導向與錯誤分類集中在 `src/utils/registrationFlow.ts`，
  以純函式單元測試釘死（`registrationFlow.test.ts`）。新流程的狀態轉移也應
  比照抽成純函式 + 單元測試。
- **「中途關頁再回來」回歸測試**：`e2e/features/registration_recovery.feature`
  是可套用的樣板——新流程請新增對應 feature，至少涵蓋
  「進到第 N 步 → 離開 → 用不同入口回來 → 應接續而非死巷」。
  這些測試已納入 CI 的 `e2e-tests` job，根治後必須恆綠。
- **PR checklist**：凡是新增/修改多步流程的 PR，reviewer 對照第 4 節三條契約逐條確認。
