# 第 4 波稽核報告：auth（註冊、登入與本機狀態）
<!-- plans-keep: 第 4 波稽核報告；退場條件＝第 5 波審查 session 依第 5 波 plan 處置後刪除 -->

稽核 session AU-auth（W4-30，2026-11-03）。審的是 `origin/main`＝`f88bae5`（正式站），**行號以該樹為準**。唯讀：沒改產品碼。
範圍：規格書 §2（角色與頁首）、§3（路由與守衛）、§4 註冊漏斗、§5.3、§7.1 Email 邀請（R2 契約）、忘記密碼；
所有 localStorage／sessionStorage 鍵的生命週期。

審法：本 session 親審本機狀態鍵與結帳頁快取；三個子 agent 平行審（守衛與頁首、後端 `/auth/*`、前端漏斗）。子 agent 回報的
P0／P1 與關鍵 P2 由本 session 重讀程式核實，核實時改了嚴重度的在 §4 註明。不重報：H1（待用推薦碼無期限）、第 4 波 R4 `review.md` §1.3 的 17 條 P2。

**總結：P0 1、P1 5、P2 22。** P0 與 P1-1 已先 send_message 給主 session。

## 1. 發現

### 1.1 P0

| # | 檔案:行 | 失敗情境（具體輸入 → 錯誤結果） | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P0-1 | `supabase/functions/api/index.ts:861-870`；`supabase/migrations/20261017000004_register_profile_payment_lock.sql:68-69`；`20260726000102_apply_default_referrer.sql:73`、`:103-115` | **錯綁推薦（低機率、靜默）。** `/auth/register` 查推薦人用 `referral_codes … .single()`，**不檢查 error**。使用者填了碼 X，前端驗證通過並顯示推薦人姓名 → 送出時這次查詢遇 DB 暫時錯誤 → `referrerUserId=null`，但 `referred_by_code=X` 照樣寫入，回 200。結帳頁的推薦人姓名來自 `pendingUser.referrerName` 快取，畫面看不出異常。付款成功時 `apply_referral_side_effects` 只看 `referred_by_user_id IS NULL` → 套用平台預設推薦人、覆寫 `referred_by_code`、`is_default=true`（前端隨即隱藏）。結果 X 失去這位下線與之後的獎勵。註冊完成後 register 鎖死（403），只能找客服改。全程沒有告警 | register 改用 `validate_referral_code` RPC：error 回 503 不寫入；查無或停權推薦人回 400，兩者同形；自我推薦回 400。另加測試：查碼失敗→503 且 DB 不變 | 無（`registration-completion-guard.test.ts` 沒有查碼錯誤、查無碼、停權推薦人的案例） |

### 1.2 P1

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P1-1 | `src/components/CompleteProfile.tsx:431`（寫入）；`src/components/PaymentCheckout.tsx:140`、`:210-226`、`:340`、`:572-581`；`supabase/functions/api/index.ts:2033-2034`；`20260802000002_fresh_ledger_forfeit.sql:128-140`、`:180` | **續約被當首購，繞過補繳制與新約清帳（潛伏約一年）。** `pendingUser` 在註冊完成時寫入（`registrationStep=2`、`subscriptionEndDate=null`），**付款成功後沒有任何地方清**；只有登出、`clearAccountLocalState`、結帳頁三個錯誤分支會清。一年後會籍到期 → 守衛導 `/payment/checkout` → 結帳頁走 localStorage 分支，用的是註冊當下的舊快照：不讀 `/profile`，也不呼叫 `resolveCheckoutPageRedirect` → `isRenewal=false` → 畫成首購頁：沒有續約／新約可選、沒有補繳揭露，送單不帶 `renewalMode`。後端把 `null` 當首購放行（只擋 active）；`process_successful_payment` 對 null 以付款日起算、不清帳本、不換線、不補繳。結果：過期 N 年的會員付 1,200 就拿到「從今天起一年＋保留點數與上線」。附帶兩個問題：(a) 「稍後付款」因 `isRenewal=false` 把正式會員登出；(b) 付款開通中的人按上一頁回結帳頁，輪詢 5 秒才導走，這段時間按得到付款（重複訂單交 AU-pay 判斷）。觸發條件只有「註冊後在同一瀏覽器沒登出過」，手機上很常見 | 根因在後端：`/payuni/prepare` 對已有訂閱紀錄的使用者拒收 `renewalMode=null`（AU-pay 範圍）。前端：付款成功／結果頁清 `pendingUser`，或結帳頁一律以 `/profile` 判定、localStorage 只當首繪 | 無（vitest `PaymentCheckout.test.tsx` 的 `seedPendingUser` 續約案例都帶 `subscriptionEndDate`；e2e `renewal_backfill_recovery` 同樣；「舊註冊快照＋expired」無測試） |
| P1-2 | `supabase/functions/api/index.ts:862-870` | 與 P0-1 同一段的鄰近問題。(a) **不排除停權推薦人**：只看 `referral_codes.status`，而停權記在 `profiles.suspended_at`。前端驗證後、送出前推薦人被停權，或直接打 API → 綁到停權者，付款後照發獎勵，違反 §5.2「停權會員的推薦碼不得通過驗證」。(b) **查無此碼照存**：存碼＋`null` id，付款時被預設推薦人蓋掉，不回 400。(c) `referralCode` 非字串（如 `123`）→ `.normalize` 擲例外 → 500 | 同 P0-1 | 無 |
| P1-3 | `supabase/functions/api/index.ts:839-885` | **後端只驗姓名格式**，不驗生日 18 歲以上、手機格式、身分證格式，身分證也不是必填（`nationalId \|\| null`），migration 也沒有 CHECK。直接打 API 送 `birthDate:"2015-01-01"`、`phone:"x"`、不帶 `nationalId` → 200。付款後 register 鎖死，`national_id` 留 NULL → 提領的身分證比對（`index.ts:351-354`）每次都失敗，只能客服修。違法生日字串（如 `"abc"`）在 RPC 轉型時失敗 → 500「更新失敗」，不是 400。§4.2 寫「限 18 歲以上」；同函式 `:845` 的註解自己承認「前端驗證可被繞過」 | 抽 `_shared` 驗證器，前後端共用（比照姓名），失敗回 400；身分證必填 | 後端無。前端：vitest `validateBirthDate`「今天剛滿 18 歲通過」「明天才滿 18 歲被拒」、`validatePhone`、`validateNationalId`；journey `15_registration_negative.feature`「未滿 18 歲無法送出資料」（只到 UI 層） |
| P1-4 | `supabase/functions/api/index.ts:919-946` | **cancel-signup 先查後刪，沒持鎖。** 守衛讀取與 `deleteUser` 不在 `register_profile`／`process_successful_payment` 共用的 `profiles` 列鎖下；「pending、尚無 SUCCESS」的訂單刻意可刪，而這正是使用者停在 PayUni 頁面時的狀態。分頁 A 正在刷卡、分頁 B 的完善資料頁按「稍後註冊」並確認，或 PayUni notify 落在守衛與刪除之間 → auth user 連同訂單 cascade 刪除 → 錢收了、帳號沒了。需要人為的兩分頁操作，所以列 P1 | 守衛與刪除收進同一支 RPC 並 `for update`；或拒刪 N 分鐘內建立的 pending 訂單 | `cancel-signup-guard.test.ts`「pending 訂單沒有 PayUni SUCCESS（付款未完成）仍可刪除」把現行為釘住；無並行測試 |
| P1-5 | `src/components/ResetPasswordPage.tsx:63-106` | **重設密碼成功後不登出。** recovery `verifyOtp` 留下的 session 繼續有效，其他裝置的 session 也沒撤銷。帳號被盜而來重設的人，盜用者手上的舊 session 照樣能用。畫面說「請使用新密碼登入」並導 `/login`，但已登入者會被 AuthPage 彈去 `/dashboard`，訊息不實。（GoTrue 的 `updateUser` 不撤銷其他 session，是依 Supabase 文件推論，未實測） | 成功後 `signOut({ scope: 'global' })` 再導 `/login`，或至少 `scope: 'others'` | e2e `forgot_password.feature`「Successfully setting a new password returns to login」（全 mock，看不到這點）；vitest、journey 無 |

### 1.3 P2

| # | 檔案:行 | 失敗情境 | 建議 | 現有測試 |
|---|---|---|---|---|
| 1 | `src/App.tsx:399-414`；`src/components/RequireMembershipRoute.tsx:63-65`；`index.ts:2019-2083` | 停權會員直接打開 `/payment/checkout`：結帳頁只套 `ProtectedRoute`，`/payuni/prepare` 也不看 `suspended_at` → 可以付款續期，付完照樣被會員區擋「帳號已停權」。正是 `RequireMembershipRoute` 註解要避免的「付了錢也進不來」。規格 §5.2 沒寫停權能不能付款 | 先由業主裁決，再在結帳頁與 prepare 擋下或提示 | 無 |
| 2 | `src/App.tsx:190-195`、`src/utils/clearAccountLocalState.ts:30`；規格書 §2.1 | 規格 §2.1 說頁首登出「不清草稿，下次登入接回原步驟」，`useFunnelLogout.ts:4-5` 也這樣寫。實際上登出觸發 SIGNED_OUT → `onSignedOut` → `clearAccountLocalState` → `clearProfileDraft`，表單是空的，toast 卻說「之後用同一帳號登入即可繼續完成註冊」。`multi-step-flow-recovery.md:68` 寫的是「登出時清除」，與規格互相矛盾。R4 P2-12 是 session 失效的版本，這裡是主動登出的版本 | 依「程式為準」改規格 §2.1、`useFunnelLogout` 註解與 toast 文案（草稿含身分證，清掉是合理取捨） | `clearAccountLocalState.test.ts`、`useFunnelLogout.test.tsx` 都沒斷言草稿 |
| 3 | `src/components/CompleteProfile.tsx:893-901` | 生日欄 `max` 以本地午夜建 Date 再 `toISOString()`，在 UTC+8 會變成前一天 → 今天剛滿 18 歲的人在 iOS 選不到自己的生日（日期選擇器夾在 max） | 用本地年月日補零組字串 | 無（`validateBirthDate` 的測試只測函式） |
| 4 | `src/utils/profileValidation.ts:127-143` | 年齡用裝置時區算，不是台灣時間；人在海外、18 歲生日跨午夜時差一天 | 以 `Asia/Taipei` 取日期 | `validateBirthDate` 注入 `now`，但只測本地時區 |
| 5 | `src/components/AuthPage.tsx:41`、`:141-156`、`:192` | session 檢查 4 秒逾時就判「未登入」，但 `/profile` 逾時是 8 秒。網路慢、已登入的註冊中使用者點別人的邀請連結 → 4 秒後走未登入分支 → `savePendingReferral(code)` → 完善資料頁預填別人的碼。規格要求已登入者不帶碼。綁定仍要使用者在確認框按確定 | 逾時後先不寫待用碼，等 session 結果確定 | vitest「session 驗證 4 秒沒有結果時視為未登入、進設定密碼」釘住現行為；慢 `/profile` 無 |
| 6 | `src/components/AuthPage.tsx:478`；`ResetPasswordPage.tsx:53` | 72 位元組上限只在邀請路徑檢查（`AuthPage.tsx:532`）。一般註冊與重設密碼輸入長中文密碼時，顯示「註冊失敗，請稍後再試」「密碼重設失敗，請稍後再試」，看起來重試會好，實際上永遠不會成功 | `exceedsPasswordMaxBytes` 併進 `validatePasswordPolicy` | 只有邀請路徑的測試 |
| 7 | `src/components/ResetPasswordPage.tsx:92-106`、`:157`、`:167` | 成功後 2 秒導頁期間 `finally` 已把 `isLoading` 設回 false，Enter 處理也沒擋 → 再送一次 → 成功 toast 之後緊接「新密碼不能與舊密碼相同」 | 送出成功後保持 submitted 直到導頁 | 無 |
| 8 | `src/components/OTPVerificationPage.tsx:91-97` | `verifyOtp` 的錯誤一律同樣處理：斷網、限流、5xx 都顯示原始英文 `error.message`，還清掉已輸入的碼。違反四契約第 3 條（錯誤分可復原與否） | 依 `isRetryableAuthError` 分流 | e2e `otp_verification.feature`「Incorrect or expired code shows an error and clears the input」；暫時性失敗無 |
| 9 | `src/components/AuthPage.tsx:353-357`、`:372` | `check-email` 回 429（§4.1 的限流）或 5xx → toast「檢查 Email 時發生錯誤：API returned 429: {json}」，原始狀態碼與回應本文直接給使用者看 | 429 改「請稍後再試」，其餘給通用文案 | e2e `auth_signup.feature`「A failure checking the email keeps the user on the email step」；429 無 |
| 10 | `src/components/AuthPage.tsx:309-320`；`OTPVerificationPage.tsx:54-55` | `supabase.auth.resend` 失敗時**回傳** `{error}`、不擲例外，`try/catch` 接不到 → 仍顯示「已重新寄送驗證碼」，並重啟 3 分鐘重寄鎖，但其實沒寄出。直接進 OTP 頁、本機沒有到期時間時也會開一個新的 3 分鐘窗 | 檢查 `{ error }`，寄送成功才開窗 | e2e `registration_recovery.feature`「A password login rejected as unverified resumes verification」（mock 永遠寄成功） |
| 11 | `src/utils/otpExpiry.ts:10`；`OTPVerificationPage.tsx:174`、`:204` | 180 秒鎖只存在前端；伺服器端 OTP 有效期是 Dashboard 設定，repo 裡沒有。若伺服器設得比 180 秒長，晚到的信裡的碼還能用，輸入框卻已鎖，使用者按重寄反而讓它失效（推論） | 把 TTL 寫進 repo 文件或設定檔，或到期後不鎖輸入框 | `otpExpiry.ts` 無單元測試；e2e `otp_verification.feature`「Resend becomes available once the 3-minute window expires」 |
| 12 | `src/components/CompleteProfile.tsx:718-737`、`:766`、`:977` | 推薦碼驗證進行中把欄位清空 → 回應晚到 → 空欄位下顯示「推薦人：X」。送出的是空字串、確認框寫「您未填寫推薦碼」，不會錯綁，純顯示問題 | 回應的碼與欄位當下的值不同就丟棄 | 無 |
| 13 | `src/components/CompleteProfile.tsx:607` | 身分證驗證時有 trim 與轉大寫，送出的卻是原始值（如 `"a123456789 "`）。提領比對有正規化，功能不壞，但存進 DB 的值不一致，日後做唯一性檢核（§14 #1）會失準 | 送出正規化後的值；後端也正規化 | 無 |
| 14 | `src/components/ProtectedRoute.tsx:40`；`AuthPage.tsx:465` | 深層連結在登入後遺失：未登入打開 `/dashboard/qr?tab=scan` → `/login`，登入後一律落在 `/dashboard`。沒有任何程式讀 redirect 參數，所以不構成開放重導 | 可選：帶經允許清單過濾的 `from` 走完登入 | 無 |
| 15 | `src/utils/registrationFlow.ts:350` | `isFirstTimeFunnel` 特判 `accountStatus==='unknown'`，但後端只回 active／expired（`index.ts:643`）；`redirectForGate` 沒有對應分支。死分支，兩邊判斷不對稱 | 刪掉，或兩邊一致處理 | `registrationFlow.test.ts:543` 釘住這個死分支 |
| 16 | `supabase/functions/api/index.ts:773-794` | `check-email` 收到非字串（`{"email":123}`）→ `.trim` 擲例外 → 500；限流額度已先扣掉 | 檢查型別，回 400 | 無 |
| 17 | `supabase/functions/api/index.ts:980-999` | `complete-registration` 讀 `payment_orders` 用 `.single()` 且不看 error：讀取失敗回 400「尚未完成付款」，違反 §5.3；已付款待開通也回同一句。目前沒有前端呼叫者，影響有限 | error 回 503；或確認無人使用後刪除端點 | 只有原始碼 grep（`profile-transient.unit.test.ts:330`） |
| 18 | `supabase/functions/api/referral-invite.ts:569-588` | 兩個分頁同時 accept：都通過查詢，後寫的 `updateUserById` 生效，兩邊都拿到 200，但只有一組密碼能登入；輸的那邊接著登入失敗，退回登入頁 | 可接受；或更新前再查一次已驗證狀態 | `referral-invite.test.ts`「兩個分頁並行 accept 後帳號已驗證，恰好一個密碼能登入」（文件化現行為） |
| 19 | `supabase/functions/api/index.ts:311-316` | 沒有 `cf-connecting-ip`／XFF 時 `clientIp` 回 `'unknown'` → `check-email`（60／5 分）與 accept（20／5 分）全站共用一個桶，一個人就能把所有人擋掉；IPv6 沒有收斂到 /64（推論） | `ip_source=unknown` 時告警；IPv6 以 /64 為鍵 | `rate-limit.unit.test.ts` 只測 `clientIp` 解析 |
| 20 | `supabase/functions/api/referral-invite-token.ts:60-65` | token 只綁 email 與到期時間，沒有綁空殼的 `issued_at`。重寄邀請（可能換了推薦人）之後，舊連結在自己的到期日前仍有效，帶的是舊推薦碼。持有者仍是信箱本人，不會被冒用 | 可選：token 綁 `iat` | `referral-invite-token.unit.test.ts`（簽、驗、到期） |
| 21 | `src/App.tsx:183-199`（`onSignedOut`／`onAccountSwitched` 的接線） | 不是 bug，是覆蓋缺口。「登出清所有本機狀態」只在單元層測過：`clearAccountLocalState` 的內容、bootstrap 會呼叫 `onSignedOut`。**App 把兩者接起來**這件事，只有 `appShell.test.ts` 以 regex 檢查 `resetHomeListingsCache`。沒有任何一層測「A 登出、B 在同一瀏覽器登入，看不到 A 的 `withdrawalBankData`、`pendingUser`、DataCache」 | 補 e2e（見 §3-4） | 部分（見左） |
| 22 | `src/contexts/DataCacheContext.tsx:136-150` | DataCache 存在 sessionStorage，載入時先畫舊資料再背景重抓（stale-while-revalidate）。換帳號若沒觸發 `onAccountSwitched`（即 R4 P2-10 的冷啟動時序），B 會先看到 A 的推薦網路、獎勵與提領清單，直到重抓完成。屬 P2-10 的同類路徑，影響面比 P2-10 原本只寫的銀行帳號更大 | 併入 P2-10 的修法（冷啟動 uid 不符時也呼叫 `onAccountSwitched`）；快取資料帶 uid、讀取時比對 | 無 |

## 2. 覆蓋對照表

層：V＝vitest、D＝Deno（`supabase/functions/api/*.test.ts`）、E＝e2e 全 mock（`e2e/features`）、J＝journey（真後端）。

### 2.1 本機狀態鍵（§2.1 頁首、登出、換帳號）

| 鍵（儲存區） | 內容 | 寫入 | 清除 | 跨使用者風險 | 測試 |
|---|---|---|---|---|---|
| `withdrawalBankData`（local） | 銀行代碼＋帳號 | `WithdrawalProcess.tsx:421` | `clearAccountLocalState`（SIGNED_OUT、帳號切換、session 失效） | 鍵不含 uid；冷啟動時序見 R4 P2-10 | V `clearAccountLocalState.test`「清掉提領銀行帳號…」；E／J 無 |
| `pendingUser`（local） | 註冊個資快照 | `CompleteProfile.tsx:431`、`PaymentCheckout.tsx:588` | 同上＋`useFunnelLogout`＋結帳頁錯誤分支；**付款成功後不清（P1-1）** | 同一人的舊快照被當現況（P1-1） | V 同上、`useFunnelLogout.test`；舊快照無 |
| `user`、`pendingSession`（local） | 升版前殘留 | 不再寫入 | `clearAccountLocalState` | 無 | V `appShell.test`「產品碼不再寫入 localStorage.user」 |
| `uknow:auth-hint`（local） | uid8、首字、頁首種類 | `useAuthBootstrap` | 登出、session 失效、uid 不符 | uid8 比對擋首字外流 | V `authHint.test`、`useAuthBootstrap.test`；E `route_guards`「A hint left by another account never shows that account's initial」 |
| `uknow:draft:complete-profile`（session） | 完善資料草稿（含身分證） | `formDraft` | 註冊送出、取消註冊、`clearAccountLocalState` | 鍵不含 uid，靠登出時清除擋住 | V `formDraft.test`、`endInvalidSession.test`；規格寫的「主動登出不清」與程式不符（P2-2） |
| `uknow_data_cache`（session） | 推薦網路、任務、獎勵、提領、訂閱、刊登 | `DataCacheContext` | `clearCache()`（登出、帳號切換） | 冷啟動時序（P2-22） | V `DataCacheContext` 相關；換帳號無 |
| `pending_invite_token`（session） | 邀請 token | `AuthPage` | accept 成功、離開邀請模式、SIGNED_OUT | 低 | V `AuthPage.test` 邀請入口；E `auth_signup` |
| `pending_referral_code`（local） | 待用推薦碼 | `AuthPage` | 註冊送出、取消註冊 | **H1 處理中，不重報** | — |
| `pending_otp`、OTP 到期鍵（local） | email、otpType、到期時間 | `otpSession`、`otpExpiry` | 驗證成功 | 登入前流程，R4 已判可接受 | V `otpSession.test`；`otpExpiry` 無 |
| 偏好鍵（首頁檢視、`referralSortMode`、QR 分頁、`dismissedAnnouncements`、`uknow:chunk-reloaded`） | 非個資 | 各模組 | 不清（刻意保留） | 無 | V `clearAccountLocalState.test`「不清與帳號無關的偏好…」 |
| `sb-*`（local） | Supabase session | auth-js | 主動登出時 `useMemberLogout` 強制清除 | — | V `useMemberLogout.test` |
| admin 快取 | 未遮罩的身分證與銀行帳號 | 只在記憶體（`adminCache.ts`） | 卸載時 | 無 | — |

### 2.2 規則 → 實作 → 測試

| 規格條目 | 實作位置 | 測試層與測試名／無 |
|---|---|---|
| §3 `ProtectedRoute`：載入、degraded、匿名 | `ProtectedRoute.tsx:30-41` | V「degraded 時停在原頁畫 degraded 外框，不導 /login」「anonymous 時照舊導 /login」；E `route_guards`「Anonymous user is redirected to login」「A temporary profile outage keeps a signed-in member on the page with a retry」 |
| §3 degraded＋已有 user 時畫出內容 | `ProtectedRoute.tsx:30,35` | 無 |
| §3 `featureRequired` | `ProtectedRoute.tsx:44` | 無（§14 #4：路徑不可達） |
| §3 `AdminRoute` | `AdminRoute.tsx:14-29` | V degraded／載入；E `admin_dashboard`「A logged-in non-admin is redirected away from /admin」；匿名與非管理員無 V |
| §3 `RequireMembershipRoute` 決策表 | `registrationFlow.ts:311-341` | V `RequireMembershipRoute.test`（`resolveMembershipRedirect` 各列）；E `route_guards`「An expired former member is sent to checkout to renew…」「A paid user awaiting activation…」「An admin without a subscription is not locked out」 |
| §5.2 停權硬鎖（含 `allowExpired`） | `RequireMembershipRoute.tsx:52,66` | V「停權會員看到停權說明，而且不會被導去結帳頁」「停權的管理員不受阻擋」；`allowExpired`＋停權、E、J 無 |
| §5.2 停權者付款 | 無守衛（P2-1） | 無 |
| §2.1 頁首五種版本 | `authView.ts:23-49` | V `authView.test`；E `route_guards` 頁首系列；停權者的頁首無 |
| §2.1 註冊中頁首登出不刪帳號 | `useFunnelLogout.ts` | V「登出後清 user、pendingUser、提示…」 |
| §2.1 「稍後註冊」先確認再刪 | `CompleteProfile.tsx:660-714`；`index.ts:915-952` | V「稍後註冊的刪除確認」系列；D `cancel-signup-guard.test`（8 條）；E `complete_profile`「Choosing to register later asks first…」；並行無（P1-4） |
| §4.1 Step 0 只回 `{exists}`、限流 60／5 分、fail-open、429 | `index.ts:773-807` | D `check-email-lookup.test`、`check-email-rate-limit.test`「同一 IP 連打超過上限回 429…」；fail-open 無明確測試；前端 429 文案無（P2-9） |
| §4.1 Step 1 密碼＋OTP | `AuthPage.tsx:382-522`；`OTPVerificationPage.tsx` | E `auth_signup`、`otp_verification`；元件 V 無；暫時性錯誤無（P2-8） |
| §4.1 邀請入口 | `AuthPage.tsx:141-156`；`useInviteAccept.ts`；`referral-invite.ts:527-589` | V `AuthPage.test` 邀請入口／送出分流、`useInviteAccept.test`；D `referral-invite.test`（accept 系列）、`referral-invite-token.unit.test`；E `auth_signup`；J `80_referral_email_invite.feature` |
| §4.1 已登入者點邀請只提示 | `AuthPage.tsx:146-150` | V「已登入時只提示你已登入…」；慢 `/profile` 無（P2-5） |
| §4.1 註冊完成後鎖定（403） | `register_profile`；`index.ts:893` | D `registration-completion-guard.test`「已完成付款的會員 → 403…」「付款交易持鎖期間送出…」；E `complete_profile`「Submitting after registration completed elsewhere…」 |
| §4.2 推薦碼即時驗證、限流、503 | `index.ts:1044-1066`；`CompleteProfile.tsx:718-737` | D `referral-validate.test`（匿名 401、短窗／24h、503…）；V「推薦碼驗證」系列；E `complete_profile`；J `15_registration_negative` |
| §4.2 停權推薦人與查無同形 | `validate_referral_code`；**register 未套用（P0-1、P1-2）** | 無 |
| §4.2 姓名兩模式 | `profileValidation.ts:76-107`；`index.ts:414` | V `validateName`；D `name-validation-routes.test`；E `complete_profile` |
| §4.2 生日 18 歲、手機、身分證 | 僅前端（P1-3） | V `validateBirthDate`／`validatePhone`／`validateNationalId`；D 無；J「未滿 18 歲無法送出資料」（UI） |
| §4.2 推薦碼正規化 | `referralCode.ts:24`；`index.ts:861` | V `referralCode.test`；J `tools/test_referral_code.py` |
| §4.3 四契約：忘記密碼 | `ForgotPasswordPage.tsx`；`ResetPasswordPage.tsx` | E `forgot_password.feature`（12 個情境，含不洩漏帳號、無 session 導頁）；V、J 無；重設後登出無（P1-5） |
| §5.3 `/profile` 503、Auth 暫時錯誤 503、401 才算無效 | `index.ts:458-476`、`502-535` | D `profile-transient.unit.test`（約 25 條）；V `fetchProfile.test`、`useAuthBootstrap.test`；E `route_guards` 斷線情境 |
| §5.3 其他端點 401 → 換發 → `/profile` 確認 | `apiClient.ts` | V `apiClient.test` |
| §5.3 session 失效只清本機 | `endInvalidSession.ts` | V `endInvalidSession.test`（4 條） |

## 3. 建議補的測試（依風險排序）

1. **D**：`/auth/register` 查碼遇錯誤→503、DB 不變；查無碼→400；停權推薦人→400 且與查無同形（P0-1、P1-2）。
2. **V＋E**：expired 會員帶「註冊當下的 `pendingUser`」進結帳頁 → 必須出現續約／新約選擇、送單帶 `renewalMode`；D：prepare 對有訂閱紀錄者收 `null` → 400（P1-1）。
3. **D**：`/auth/register` 未滿 18 歲、手機格式錯、缺身分證、身分證格式錯 → 400（P1-3）。
4. **E**：同一瀏覽器 A 登出、B 登入 → 提領頁不預填 A 的銀行帳號、結帳頁不出現 A 的個資、DataCache 不顯示 A 的資料（P2-21、P2-22、R4 P2-10）。
5. **D**：cancel-signup 與 `process_successful_payment` 並行 → 不得刪除（P1-4）。
6. **V**：`ResetPasswordPage` 成功後呼叫 `signOut`；重複送出只送一次（P1-5、P2-7）。
7. **V**：`OTPVerificationPage` 暫時性錯誤不清輸入、文案為中文；`resend` 回 `{error}` 時不提示「已寄送」、不開鎖窗（P2-8、P2-10）。
8. **V**：生日欄 `max` 在 UTC+8 等於「今天減 18 年」（P2-3）。
9. **V**：`RequireMembershipRoute` 的 `allowExpired`＋停權；`AdminRoute` 的匿名與非管理員導向。

## 4. 被反駁推翻或降級的

| 候選 | 處置 |
|---|---|
| register 查碼錯誤（子 agent 原列 P1） | **升 P0**（P0-1）：付款時被預設推薦人覆寫，結果是錯綁推薦，且靜默、不可自助回復 |
| `pendingUser` 舊快照讓 active 會員重複付款 | **推翻**：prepare 擋 active（`index.ts:2045`）。付款開通中的那段空窗併入 P1-1(b)，重複訂單交 AU-pay |
| 停權＋過期會員進會員區被導去結帳 | **推翻**：`suspendedBlocked` 優先於導向，有測試 |
| 透過 `?redirect=`／`state.from` 開放重導 | **推翻**：沒有程式讀它們；唯一讀 `state.from` 的 `MyQrPage.tsx:80` 有允許清單 |
| register 連點競態 | **推翻**：`register_profile` 持 `profiles` 列鎖重讀進度（D `registration-completion-guard.test` 有測） |
| check-email／accept／忘記密碼可枚舉帳號 | **推翻**：回應同形；accept 的不同錯誤碼要有效 HMAC token（信箱本人）才拿得到；忘記密碼一律導 OTP 頁（E 有測） |
| 邀請 token 重放、空殼刪後重建、換 email 後沿用 token | **推翻**：`email_confirmed_at`→409、沒有空殼戳章→410，以 email 查；都有 D 測試 |
| 邀請 token 留在網址或 Referer | **推翻**：`navigate({search:''},{replace:true})` 改寫歷史；`public/_headers` 設 `strict-origin-when-cross-origin` |
| 完善資料送出兩次（submit＋onClick） | **推翻**：onClick 先 `preventDefault` |
| 推薦碼改成 B 時用 A 的驗證結果送出 | **推翻**：驗證中鈕停用；送出條件要求欄位值等於已驗證的碼。只剩空欄位的顯示問題（P2-12） |
| 草稿跨使用者還原 | **推翻**：SIGNED_OUT 與帳號切換都會清；鍵不含 uid 只是少一層防禦 |
| 頁首登出觸發 global signOut 卻沒清 `withdrawalBankData` | **推翻**：`signOutWithFallback` 不論 global 或補 local，都會發 SIGNED_OUT → `onSignedOut` → `clearAccountLocalState` |
| `requireAuth` 端點把 Auth 暫時錯誤回 401 | **已知、合規格**：§5.3 允許非 profile 端點回 401，由前端換發後以 `/profile` 確認；cancel-signup 那條即 R4 P2-1 |
| 未驗證帳號忘記密碼收不到信 | **未驗證**（GoTrue 行為）：要在 journey 分支實測後才判 |
