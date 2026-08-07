# e2e 情境去重 規劃書

<!-- 由 /plan-feature 從 docs/_templates/plan.md 實例化 -->

## 0. 一句話

刪掉 e2e 套件裡「同一個行為已經在 vitest 元件測試或 api-tests 被斷言過」
的情境,讓 `e2e-tests` 這條最貴的軌少跑一段,**在不減少任何一條把關的前提下**
把每次 CI 的計費分往下壓一格。

---

## 1. 量化基準(規劃前的第一步,取代 ci.yml 檔頭的估算值)

### 1.1 本機逐情境耗時(2026-08-07 實測)

```
cd e2e && E2E_SKIP_DEV_SERVER=1 pytest --browser chromium -q --durations=0 --junit-xml=…
→ 173 passed in 188.89s
```

| 指標 | 值 |
|---|---|
| 測試總數 | **173**(147 個 Scenario,其中 5 個 Outline 展開成 11 → 153 個 BDD case;`test_overflow_sweep.py` 20 個) |
| 總耗時 | 188.5s |
| 平均 / 中位數 | 1.09s / **0.81s** |
| p90 / 最大 | 1.70s / 6.65s |
| 最慢 20 個佔比 | 26% |

**成本曲線是平的**——沒有「少數幾條吃掉大半時間」的長尾可砍。這一點直接
決定了本任務的天花板(見 §1.3)。

按 step module 的分佈:

| module | n | 秒 | module | n | 秒 |
|---|---|---|---|---|---|
| test_overflow_sweep | 20 | 32.6 | otp_steps | 7 | 8.5 |
| reward_steps | 17 | 21.6 | profile_steps | 9 | 8.3 |
| payment_result_steps | 12 | 20.7 | line_browser_steps | 6 | 5.8 |
| forgot_password_steps | 14 | 14.5 | route_guard_steps | 9 | 5.8 |
| payment_checkout_steps | 13 | 12.3 | registration_recovery | 4 | 3.5 |
| auth_steps | 16 | 12.2 | renewal_backfill | 4 | 3.3 |
| home_steps | 15 | 11.2 | task_claim_steps | 2 | 3.0 |
| admin_steps | 8 | 10.8 | referral_steps | 3 | 2.6 |
| listing_management | 10 | 8.6 | legal / dashboard | 2+2 | 3.4 |

### 1.2 CI 實測(不是估算——GitHub Actions API 取兩次 develop run 的逐 step 時間)

| run | job 總時長 | 計費分 | 固定開銷(step 1–9) | **pytest step** | post 步驟 |
|---|---|---|---|---|---|
| 31153673362(7ab9d46) | 290s | **5** | 53s | 233s | 4s |
| 31151494251(df60c0d) | 385s | **7** | 50s | 330s | 5s |

(53+233+4=290、50+330+5=385,兩列各自加總吻合。審查 P2-2 修正:
初版漏列 post 步驟欄且 run 1 的固定開銷誤植為 57s。)

兩次的 e2e 套件內容實質相同(兩個 commit 之間只動 CI 設定與文件),
pytest step 卻差 **97s(+42%)**——runner 快慢的變異比整份候刪清單還大。

**三個必須先講清楚的事實:**

1. **ci.yml 檔頭寫的「e2e-tests ~7 分」不是穩定值**,實測落在 **5–7 計費分**。
   本規劃的基準改用實測區間,檔頭數字併同修正(階段 4)。
2. **固定開銷 ~50–57s 砍不掉**:checkout / npm ci / pip install / playwright
   install / dev server 起動,與情境數量無關。刪情境只作用在 pytest step。
3. **ci.yml 檔頭寫的「182 個情境」已漂移**,現值 173。xdist 那段註解的
   實測前提(182 個同跑有 2 個不穩)因此也帶著一個過期數字。

### 1.3 天花板:誠實的算術(這條結論與任務目標不一致,列在最前面)

任務設定的目標是「~7 → ~4-5 計費分」。以實測數字回推:

- 要進 **4 計費分**,job 總時長須 ≤240s ⇒ pytest step ≤ ~185s。
  從 233s 起算要砍 21%,從 330s 起算要砍 44%。
- 平均每情境 1.09s(中位 0.81s),砍 44% ≈ **刪掉 70–80 個情境**,
  約占全套件一半。

**在「每個候刪情境必須附下層覆蓋證據」的硬約束下,拿不到這個量。**

> ⚠️ **審查後修訂(2026-08-07,見 `review.md`)**:四視角審查揪出 2 個 P0
> 與 6 個 P1,全部是「證據等級標錯」——初版的 29 條候刪裡有 14 條的證據
> 經不起查證(詳見 §4 各表的刪除線標註)。移出後的實得如下,**比初版少了
> 四成**,Q1 的結論因此更強烈而非減弱。

人審裁決後的候刪集合是 **18 個情境(18 個 test case)、
本機 23.0s、佔 12.2%**,換算 CI 約 **-28~-40s**:

| 情境 | 現況 | 刪後(推估) | 計費分變化 |
|---|---|---|---|
| 快 runner | 290s | ~256s | 5 → **5**(不變) |
| 慢 runner | 385s | ~345s | 7 → **6**(-1) |

計費是無條件進位,省下的 28–40s 是否跨過分鐘邊界取決於落點,
期望值 ≈ 34/60 ≈ **0.6 計費分/run**。

月估:friction-log 記 07-25~08-07 共 330 次 CI run(≈24/日 ⇒ ≈700/月),
e2e 只在 `guards.outputs.code == 'true'` 時跑(估 ≈85%)⇒ **≈600 run/月**。

> **月省 ≈ 0.6 × 600 ≈ 360 分**(初版誤估 450–600:候刪清單未經查證偏大,
> 且區間端點算術不一致,審查 P2-3 指出 0.7–0.9 × 600 應為 420–540)。
> 任務描述的目標是 700–1,000 分。

**達標需要什麼(Q1 裁決時一併記錄)**:700–1,000 分/月 ÷ 600 run
≈ **每 run 要砍 70–100s**。刪重複給 28–40s,固定開銷樂觀再給 15–25s,
合計 40–65s ≈ 420–650 分/月。**要真的碰到 700–1,000,必須放寬三條硬約束
之一**(並行 / 抽樣 / 改 CI 結構)。人審已裁定接受實得並另開固定開銷任務,
未選擇重新檢視 xdist。

差額的來源不是「還沒找夠」,而是 §1.1 的平坦成本曲線 + §1.2 的固定開銷:
**單靠刪重複情境到不了 4 計費分**。要再往下需要動 §1.2 的固定開銷或並發,
兩者都在本任務的授權邊界外(ci.yml 的 xdist 註解已否決並發;任務硬約束 3
禁止改 CI 結構)。這一條列為 §6 開放問題 Q1,等人裁決是否要另開任務。

---

## 2. 使用者需求

本任務改的是**測試套件**,不動任何產品行為,因此沒有對應的規格書功能章節。
授權來源是 `.github/workflows/ci.yml` e2e-tests job 的既有註解:

> 刻意「不」用 pytest-xdist 平行化⋯⋯**速度從「刪掉在下層已經驗過的重複
> 情境」拿,不從並發拿。**

驗收情境(可驗證的行為):

1. `cd e2e && pytest` 全綠,測試數從 173 降到 **155**。
2. 四條使用者關鍵旅程各自**至少保留一條端到端 e2e 情境**(§3.2 對照表)。
3. 每一條被刪的情境,在 `docs/plans/e2e-scenario-dedup/plan.md`(本檔)
   §4 的表格裡都指得出「哪個檔案的哪個測試名」接手了它的斷言。
4. `npm run check` 與 `python3 scripts/check-test-names.py` 綠。

**不做什麼(明確排除):**

- 不引入 pytest-xdist / 任何並行或抽樣(硬約束 3,且 ci.yml 已實測否決)。
- 不改 `e2e-tests` job 的 step 結構、不動 timeout、不動 artifact 上傳。
- 不刪 `test_overflow_sweep.py` 的任何路由——它是**唯一**跑 375px 的軸
  (其餘情境全跑 1280×900),沒有任何下層等價物。
- **不為了湊數字而補下層測試再刪 e2e**。本次只刪「證據已經存在」的;
  「應該補一個下層測試然後 e2e 就能刪」的一律進 §6 開放問題,不在本任務做
  (那是把驗證責任往前挪,屬於另一個決策)。
- 不改任何 `.feature` 的既有情境內容(只整條刪除),避免動到與
  `*_steps.py` 逐字綁定的步驟片語(見 `.claude/rules/test-naming.md` T1)。

---

## 3. 系統設計

### 3.1 判準:什麼叫「同一行為已在下層被斷言」

三級證據,由強到弱。**只有 A、B 級可以刪**:

| 級 | 定義 | 例 |
|---|---|---|
| **A** | 下層測試 render 真元件、驅動同一組互動、斷言同一串文字 | `WithdrawalProcess.test.tsx` 的 `renderAndGoToStep3()` 完整重演 e2e 的「金額→下一步→確認→身分表單」四步 |
| **B** | 下層測試斷言同一個**決策函式/純函式**的輸出,且該決策在 e2e 只是被顯示出來 | `withdrawalValidation.test.ts::低於最低（999 / 500 / 0）→ 最低提領提示` 產出的正是 e2e 斷言的 `最低提領Point為 1,000P` |
| **C** | 同一行為在 e2e 內部被兩個情境重複驗(跨 feature 檔) | `listing_management.feature` 與 `service_provider_detail.feature` 都驗公開詳情頁 |

> **審查後修訂(P1-4)+ 人審裁決(Q9,2026-08-07)**:初版寫「只有 A、B 級
> 可以刪」卻在 §4.8/§4.10 用 C 級刪了 3 條——自己違反自己剛定的判準。
> 該矛盾已提交人審,裁決為**C 級算證據,但收窄**:
>
> **C 級的合格條件:同一元件、同一段程式碼路徑,只有被 mock 的資料不同。**
> 僅「看起來結果一樣」不算——那是 §3.1「不算證據」清單的第一條。
>
> 依據:硬約束 1 的字面是「在更便宜的層被斷言」,但其**目的**是「別在無人
> 驗證的情況下刪」;跑兩次同一段程式碼的第二次,對這個目的沒有貢獻。
> **這是對硬約束 1 的修訂,由人裁決,不是規劃自行放寬**(處置見 review.md)。
>
> **套用 B 級時必須額外查證的一件事(P0-1 的教訓)**:確認 e2e 情境走的
> 是**哪一個**決策函式。`RequireMembershipRoute` 有自己的
> `resolveMembershipRedirect`,與 `registrationFlow.ts` 的
> `resolveCheckoutPageRedirect` 是**兩張獨立決策表**;初版把後者的測試
> 當成前者的證據,而前者全 repo 零覆蓋。**「名字看起來像同一件事」不是證據,
> 要 grep 到實際 import 才算。**

**不算證據(這幾條在盤點時擋掉了不少「看起來像重複」的候選):**

- 字串在下層檔案出現過 ≠ 被斷言過(`王小明` 出現在 14 個測試檔,全是測資名字)。
- 後端有 API 測試 ≠ 前端有接上(e2e 的獨特價值就是這條接線)。
- 決策函式有測 ≠ 決策被接進 router(見 §3.3)。

### 3.2 硬約束 2 的守護:四條關鍵旅程的端到端保留

| 旅程 | 保留的端到端情境 | 檔案 |
|---|---|---|
| 註冊 | `Successful signup navigates to OTP verification` → `Correct code verifies and proceeds` → `A fully valid submission proceeds to checkout` | auth_signup / otp_verification / complete_profile |
| 付款 | `Clicking pay redirects through a simulated successful PayUni payment`、`A success status in the URL renders the success screen` | payment_checkout / payment_result |
| 會籍 | `An expired former member is sent to checkout to renew`、`A paid arrival not yet activated shows the activating screen, then auto-advances` | route_guards / payment_result |
| 提領 | `An eligible member can submit a withdrawal application end to end`、`A member confirms collection of an approved withdrawal` | rewards_withdrawal |

這 8 條**一律不在候刪清單內**,不論下層覆蓋到什麼程度——它們證明的是
「整條線串起來」,那不是重複。

### 3.3 一個必須記下來的發現:route guard 的接線沒有下層防線

`grep -rln "ProtectedRoute|RequireMembershipRoute|AdminRoute" src --include=*.test.tsx`
→ 只有 `PaymentResult.test.tsx` 命中(而且只出現在**註解**裡,沒有 import
或 render)。也就是說:**沒有任何元件測試 render 過這三個 guard**。

**比「沒有 render」更嚴重的一層(審查 P0-1 揪出)**:
`RequireMembershipRoute.tsx:29` 有自己的決策函式 `resolveMembershipRedirect`,
六個分支(isAdmin / active / paidAwaitingActivation / expired / step0 / catch-all)
**全 repo 零測試覆蓋**——`grep -rn "resolveMembershipRedirect" src supabase`
除定義處與同檔呼叫外零命中。初版誤把 `registrationFlow.test.ts` 對
`resolveCheckoutPageRedirect` 的測試當成它的證據,兩者是**兩張獨立決策表**,
從無互相 import。

(初版還寫了兩個不存在的函式名 `resolveMembershipAction` /
`resolveCheckoutAction`——審查 P2-1 指出這個命名漂移很可能就是誤判成因。
實際識別字是 `resolveMembershipRedirect` 與 `resolveCheckoutPageRedirect`。)

處置(修訂後):**route_guards.feature 全數保留,一條不刪**。它是
`resolveMembershipRedirect` 這張決策表在**任何層**的唯一防線,其中
`paidAwaitingActivation` 分支守的是「絕不能把已付款的人送回結帳頁造成
重複付款」——金流路由不變式,不是裝飾性行為。

同理 `/payment/checkout` **只包 `ProtectedRoute`**(`App.tsx:371-375`),
不包 `RequireMembershipRoute`;該頁的自我導頁由 `PaymentCheckout.tsx:94-104
/ 154-164` 兩個 useEffect 呼叫 `resolveCheckoutPageRedirect` 驅動,而
`PaymentCheckout.test.tsx` 的 21 個測試沒有任何一條驗這個 mount-time 導頁
(審查 P0-2)。那 3 條 redirect 情境同樣改列存疑。

### 3.4 資料庫 / API / migration

無。本任務不動 `src/**`、不動 `supabase/**`、不動 `.github/workflows/` 的
job 結構,只刪 `e2e/features/*.feature` 的情境與隨之孤兒化的
`e2e/steps/*_steps.py` 步驟定義。

---

## 4. 逐情境清單(刪 / 留 / 存疑)

秒數為本機實測(§1.1)。證據欄的格式:`檔案::測試名`
——刻意用測試名而不是行號,行號會漂移。

### 4.1 admin_dashboard.feature(8 情境 / 10.8s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 3.30 | A logged-in non-admin is redirected away from /admin | **留** | AdminRoute 接線,無下層(§3.3) |
| 1.27 | The admin console renders its management tabs | **留** | 唯一證明五分頁組裝起來的情境 |
| 1.19 | The withdrawals tab shows the empty state when there are none | **刪** | A級 `WithdrawalManagement.test.tsx::沒有任何申請時顯示空態而非空白表格`(斷言同一串 `目前沒有提領申請`) |
| 0.95 | A pending withdrawal shows the applicant and a pending badge | **刪** | A級 `WithdrawalManagement.test.tsx::作業面板同屏顯示姓名、身分證、銀行代號、帳號與匯款金額` + `::桌機上待處理的申請看得到標記已匯款` |
| 0.82 | Switching to the members tab lists platform members | **存疑** | 內容有 `MemberManagement.test.tsx`(19 個測試)覆蓋,但「切分頁→載入正確面板」是 AdminDashboard 層,無下層 → Q2 |
| 0.82 | The system alerts tab lists unresolved alerts and resolving clears them | **留** | `SystemAlerts.tsx` **沒有元件測試**;Deno `system-alerts-api.test.ts` 只覆蓋 API。刪掉等於 UI 全裸 → 反而列為 §6 Q3 的補測目標 |
| 1.15 | Marking a pending withdrawal as paid | **刪** | A級 `WithdrawalManagement.test.tsx::桌機上待處理的申請看得到標記已匯款`、`::標記已匯款可帶交易序號，那是唯一能跟銀行對帳的錨點` + Deno `withdrawals.test.ts::withdrawal_events：標記已匯款寫一筆事件，帶交易序號與匯款日期` |
| 1.33 | Rejecting a pending withdrawal refunds the applicant | **刪** | A級 `WithdrawalManagement.test.tsx::退件把 admin 填的理由送到後端`(斷言 `已退件`)+ Deno `withdrawals.test.ts::生命週期：已匯款 → 查收完成；退件 → 點數退回（不影響 total_earned）`。**退款本身 e2e 根本證不了**(全 mock),真正的證據只在 Deno 層 |

**小計:刪 4 條 / 4.62s**

### 4.2 rewards_withdrawal.feature(17 情境 / 21.6s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 0.78 | A paid member sees their points balance and the referral that earned it | **留** | /rewards 進場渲染,無 RewardDashboard 元件測試 |
| 0.73 | A member with no rewards yet sees the empty history state | **存疑** | `rewardHistoryFilter.test.ts::全部回 null；篩選中回完整標籤（空狀態文案要能自我解釋）` 只覆蓋文案函式,不是空態渲染 → Q4 |
| 0.72 | Withdrawal is blocked until the member joins the referral program | **留** | 三道 gate 的訊息在 `WithdrawalSection.tsx` / `WithdrawalProcess.tsx`,`WithdrawalSection.test.tsx` 5 個測試都不碰 gate → 無證據 |
| 0.73 | Withdrawal is blocked when the balance is below the minimum | **留** | 同上 |
| 0.72 | Withdrawal is blocked once the daily limit has been used | **留** | 同上 |
| 1.55 | An eligible member can submit a withdrawal application end to end | **留** | §3.2 提領旅程端到端 |
| 1.62 | A returning member can replace a saved ID photo during the application | **刪** | A級 `WithdrawalProcess.test.tsx::移除既有照片後該面回到上傳區` |
| 1.85 | A member whose ID was rejected sees the reason and must upload fresh photos | **刪** | A級 `WithdrawalProcess.test.tsx::證件被退回時步驟 3 顯示退回原因警示`、`::證件被退回時既有照片不予沿用——兩面都要求重新上傳`、`::退回理由缺失時顯示聯繫客服的後備文案` + `IdVerificationSection.test.tsx::被退回時顯示 admin 填的理由`(斷言同一串 `背面反光看不清出生年月日`、`證件審核未通過`)+ Deno `withdrawals.test.ts::request_withdrawal：證件被退回 → id_rejected 並附退回理由` |
| 1.70 | A member without ID photos on file uploads them during the application | **存疑** | 與上一條端到端高度重疊,但「none 狀態的上傳路徑」下層只有 Deno `id-verification.test.ts::upload-id-photos：雙面齊全 → 轉為 pending 進審核佇列` → Q4 |
| 1.55 | A backend rejection of the withdrawal is surfaced to the member | **存疑** | `apiClient.test.ts` 覆蓋錯誤信封解析,但「解析結果進 toast」的接線無下層 → Q4 |
| 1.63 | A toast carrying an unbreakable error code stays inside a phone screen | **留** | 375px 版面行為,jsdom 無版面,無下層等價物 |
| 1.00 | A withdrawal below the minimum is rejected | **刪** | B級 `withdrawalValidation.test.ts::低於最低（999 / 500 / 0）→ 最低提領提示`(產出的正是斷言字串 `最低提領Point為 1,000P`)+ A級 `WithdrawalProcess.test.tsx::金額非 1000 倍數時停在步驟 1 並顯示錯誤`(同一條 validateStep1 路徑) |
| 1.30 | An ID that fails verification cannot submit the application | **刪** | A級 `WithdrawalProcess.test.tsx::後端身分證驗證失敗時顯示欄位錯誤` |
| 1.57 | The application stays locked until the terms are agreed | **存疑** | 條款 gate 無下層測試 → Q4 |
| 1.84 | A failed ID-photo upload aborts the submission with an error | **存疑** | 上傳失敗中止路徑無下層測試 → Q4 |
| 1.19 | A collection whose ID fails verification surfaces the error and stays open | **留** | 查收 gate,下層只有 Deno 狀態機 |
| 1.15 | A member confirms collection of an approved withdrawal | **留** | §3.2 提領旅程端到端(查收段) |

**小計:刪 4 條 / 5.77s;存疑 5 條 / 7.39s**

### 4.3 payment_result.feature(12 情境 / 20.7s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 0.65 | A success status in the URL renders the success screen | **留** | §3.2 付款旅程 |
| 0.67 | A failed status in the URL renders the failure reason | **留** | 失敗分支對稱保留 |
| 1.16 | No status param falls back to polling — completed resolves to success | **存疑** | Deno `payuni-result-heal.test.ts::卡單使用者輪詢結果頁：同一次請求就回 completed（當場自癒）` 覆蓋後端,前端輪詢入口的接線是本條的獨有價值 → Q5 |
| **4.43** | No status param, a pending order resolves to success after retrying | **刪** | A級 `PaymentResult.test.tsx::orderStatus 仍 pending 時先橋接輪詢，completed 後切到補繳進度`(同一條 retry 橋接)+ Deno `payuni-result-heal.test.ts::一般 pending（無存檔回應）：不觸發自癒，照舊回 pending`。**單條最大收益** |
| 0.73 | An order still pending after retries shows the pending screen | **存疑** | 同 Q5 |
| 0.67 | A missing trade number shows the missing-order screen | **存疑** | 無下層 → Q5 |
| 0.69 | An order that can't be found shows the unknown screen | **存疑** | 無下層 → Q5 |
| 0.67 | Success screen navigates to the dashboard | **存疑** | 按鈕接線,無下層 → Q5 |
| 0.68 | Failure screen offers to retry payment | **存疑** | 同上 → Q5 |
| 0.71 | Contact support opens the LINE link in the same tab | **刪** | B級 `externalLink.test.ts::在原分頁導頁（設定 location.href），不開新分頁/視窗` + `repoHygiene.test.ts::src/ 內不得使用 target="_blank" 或 window.open(url, '_blank')`(這條是**機械把關**,比 e2e 更強:它掃全 src,不只這一個按鈕) |
| **6.65** | A paid arrival not yet activated shows the activating screen, then auto-advances | **留** | §3.2 會籍旅程;全套件最貴,但這正是取代舊死路的旗艦行為 |
| 2.96 | Activation that never completes times out to a support screen that can retry | **存疑** | `PaymentResult.test.tsx::renewal 取不到時顯示付款成功與重試，不落入逾時錯誤畫面` 相鄰但非同一條 → Q5 |

**小計:刪 2 條 / 5.14s;存疑 7 條 / 7.56s**

### 4.4 home_listings.feature(13 情境 / 9.9s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 0.63 | The directory renders a card for each active listing | **留** | 公開首頁進場 |
| 0.68 | An empty directory shows the no-listings empty state | **留** | 空態,無下層 |
| 0.69 | A directory load failure shows an error with retry | **留** | 錯誤態 + retry,無下層 |
| 0.71 | A keyword search narrows the directory | **留** | 搜尋,無下層 |
| 0.89 | A search with no matches shows the empty state, then clears back | **留** | 同上 |
| 0.73 | Opening a listing card navigates to its detail page | **留** | 導頁接線 |
| 0.96 | District filters are scoped per city and never leak across cities | **刪** | B級 `districtSelection.test.ts::同名區不跨市誤配：基隆的選擇不會讓台北的大同區刊登通過`(**逐字對應本情境的斷言**)+ `::該市勾全區 → 該市所有刊登都過`、`::該市勾具體區 → 只有交集的刊登過`、`::縣市已勾但區清空（=只按縣市篩）→ 該市全部通過` |
| 0.62 | Without location permission the newest listing stays on top | **留** | 地理排序**無任何下層測試**(grep 無命中) |
| 0.78 | With location granted the directory sorts nearest-first | **留** | 同上 |
| 0.58 | The directory renders mobile cards on a small screen | ~~刪~~ → **存疑** | **審查 P1-1 推翻**:`MobilePhotoWallCard.test.tsx` 只測孤立卡片元件,**沒有任何測試 render `HomePage`**;該情境驗的是 `block md:hidden` media query 在真瀏覽器 375px 下選了哪組 DOM,而 vitest 不載入編譯後 CSS、jsdom 無版面引擎,**結構性測不到** → Q10 |
| 0.69 | The mobile directory defaults to the 3-column photo wall without overflow | ~~刪~~ → **存疑** | **審查 P1-1 + P1-2 推翻**:`homeViewMode.test.ts` 只測裸 localStorage 函式;溢版半邊引用的 `test_overflow_sweep.py[/]` 因 `E2E_OVERFLOW_STRICT` 未設而是 **report-only 不擋 CI**(初版寫「更嚴格」是錯的,那是**降級**),且它只偵測有無溢出、**不驗證欄數**(變 2 欄不觸發任何 finding) → Q10 |
| 0.78 | A visitor can switch between the photo-wall and detailed views on mobile | ~~刪~~ → **存疑** | **審查 P1-1 推翻**:`HomeViewToggle.test.tsx` 測的是孤立 toggle 元件會不會回報事件,**不是切換有沒有真的換掉可見 DOM**——與 §3.3 的 guard 同一種「決策有測 ≠ 接進畫面」漏洞 → Q10 |
| 1.18 | The mobile view preference is remembered across reloads | ~~刪~~ → **存疑** | **審查 P1-1 推翻**:`homeViewMode.test.ts` 驗的是讀寫函式,不是「重載後真的挑對初始檢視」 → Q10 |

**小計(修訂後):刪 1 條 / 0.96s;存疑 4 條 / 3.23s**

> **審查 P1-3(行動版優先)**:全庫 `grep "I am on a mobile-sized screen"` 只有
> 5 處,其中 4 處就是上面這 4 條。若刪,首頁手機版在瀏覽器層將**完全沒有
> 會擋 CI 的迴歸防線**,只剩 report-only 掃描。首頁是 LINE 導流第一入口,
> 規格明訂手機優先——這是實質削弱,不是去重。已全數改列存疑。

### 4.5 payment_checkout.feature(13 情境 / 12.3s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 0.64 | A paid user awaiting activation is redirected to the result page | ~~刪~~ → **存疑** | **審查 P0-2 推翻**:`/payment/checkout` **只包 `ProtectedRoute`**(`App.tsx:371-375`),初版寫的「C級 route_guards 保留了 guard 接線」根本不在此路由執行。B 級證據(`registrationFlow.test.ts::已付款、開通中（paidAwaitingActivation + lastTradeNo）→ 導向結果頁`,測的是 `resolveCheckoutPageRedirect`)本身成立,但缺 A 級 wiring 證明 → Q11 |
| 0.70 | A step-2 user whose payment failed stays on checkout to retry | ~~刪~~ → **存疑** | 同上。B級 `registrationFlow.test.ts::付款失敗的 step 2（paidAwaitingActivation=false）→ 留在結帳頁重新付款` 成立,缺 wiring → Q11 |
| 0.62 | An already-paid active member is redirected to the dashboard | ~~刪~~ → **存疑** | 同上。B級 `registrationFlow.test.ts::會籍有效（active）→ 導向會員中心` 成立,缺 wiring → Q11 |
| 0.68 | An expired former member sees both renewal options | **刪** | A級 `PaymentCheckout.test.tsx::extend 選中時揭露補繳筆數、總額、補完到期日與已過期時長`、`::fresh 卡片顯示新約的具體效期迄日（AC-2）` + Deno `renewal-modes.test.ts::prepare：過期未滿一年選 extend 建單成功，訂單帶 renewal_mode` |
| 0.73 | A member expired for over a year can still choose to extend | **刪** | A級 `PaymentCheckout.test.tsx::過期超過一年時續約仍可選且為預設，日期吃契約值非 localStorage 舊值`(斷言同一串 `無法接續原效期` 的不存在)+ Deno `renewal-modes.test.ts::prepare：過期超過一年選 extend 也能建單（A1 補繳制）；fresh 照舊` |
| 0.66 | Referrer info is shown when the profile has an uncached referral code | **存疑** | `PaymentCheckout.test.tsx::手動填碼者：確認卡照常顯示推薦碼與快取的推薦人姓名` 測的是**已快取**路徑,「未快取 → 現場查」是本條獨有 → Q6 |
| 1.63 | Clicking pay redirects through a simulated successful PayUni payment | **留** | §3.2 付款旅程 |
| 1.56 | Clicking pay redirects through a simulated failed PayUni payment | **留** | 失敗分支對稱保留 |
| 0.68 | The pay button disables immediately after being clicked | **留** | 重複送單防線,無下層(需要真實 pending 的 fetch) |
| 0.72 | Paying later as a first-time signup signs the user out, and says so | **留** | 身分分流,無下層 |
| 0.76 | A renewing member who pays later stays signed in | **留** | 同上(對稱分支) |
| 2.20 | Editing returns to the profile form, stays there, and prefills the data | **留** | 回歸釘(feature 檔內註明的既有事故) |
| 0.71 | A duplicate-subscription error is surfaced as a warning | **存疑** | `apiClient.test.ts::解析物件形信封 { error: { message } }` 覆蓋解析,toast 接線無下層 → Q6 |

**小計(修訂後):刪 2 條 / 1.41s;存疑 5 條 / 3.33s**

### 4.6 route_guards.feature(8 情境 / 5.8s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 0.60 | Anonymous user is redirected to login | **留** | ProtectedRoute 唯一接線證明(§3.3) |
| 0.75 | An active member reaches the member-only route directly | **留** | RequireMembershipRoute 放行分支接線 |
| 0.73 | An admin without a subscription is not locked out | **留** | admin 例外分支,無下層 |
| 0.59 | A paid user awaiting activation is sent to the activation-pending result page | ~~刪~~ → **留** | **審查 P0-1 推翻(系統+架構雙視角獨立發現)**:本情境走 `/dashboard` → `RequireMembershipRoute` → `resolveMembershipRedirect`,**不是** `registrationFlow.ts` 的 `resolveCheckoutPageRedirect`。前者全 repo **零測試覆蓋**,刪掉等於此金流路由不變式(「絕不能把已付款的人送回結帳頁造成重複付款」)四層皆無防線 |
| 0.61 | A user whose payment failed is sent back to checkout | ~~刪~~ → **留** | 同上,`resolveMembershipRedirect` 的 catch-all 分支唯一防線 |
| 0.62 | An expired former member is sent to checkout to renew | **留** | §3.2 會籍旅程 + RequireMembershipRoute **重導分支**的接線證明 |
| 1.16 | Scenario Outline: The first-time funnel routes by registration step(2 列) | ~~刪~~ → **留** | 同上,`resolveMembershipRedirect` 的 step0 分支唯一防線 |
| 0.70 | A step-0 user who reaches checkout is sent to complete their profile | **留** | 回歸釘(空白確認框事故),feature 檔內註明 |

**小計(修訂後):刪 0 條。route_guards.feature 全數保留。**

### 4.7 renewal_backfill_recovery.feature(4 情境 / 3.3s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 0.78 | A mid-backfill payment result shows progress instead of an activation error | **刪** | A級 `PaymentResult.test.tsx::completed 且 backfillCount>0 時，顯示補繳進度且不進開通輪詢`、`::舊後端形狀缺 extendAnchorDate 時，已補至退回迄日反推一年`(斷言同一串 `還差`、`不會重複扣款`) |
| 1.12 | Closing the result page without clicking any CTA loses nothing | **留** | multi-step-flow 四契約之一(可離開性),契約級不算重複 |
| 0.69 | Returning to checkout from any entrance shows remaining installments | **留** | 四契約之一(可重入性) |
| 0.69 | Continue backfill on the result page returns to checkout | **刪** | A級 `PaymentResult.test.tsx::繼續補繳導向結帳頁；稍後再說導向首頁並顯示提示` |

**小計:刪 2 條 / 1.47s**

### 4.8 listing_management.feature(10 情境 / 8.6s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 0.66 | Anyone can view a public listing detail without logging in | **刪**(Q9 裁定) | C級 `service_provider_detail.feature::A known listing renders its details`——**同一個 `/service-providers/:id` 頁、同一條 `public_listings` 讀取路徑**,只有 mock 資料不同,符合 Q9 收窄條件;e2e README 也把該頁擁有權指給 service_provider_detail |
| 0.82 | A missing listing shows a not-found message | **刪**(Q9 裁定) | C級 `service_provider_detail.feature::An unknown listing shows the not-found screen`——同一條 not-found 分支,**兩者斷言字串完全相同**(`找不到此服務者`) |
| 其餘 8 條 | (empty state / summarised / expired 導向 / create 反彈 / 刪除 / 無權編輯 / 建立 / 上傳期間輸入不被清空) | **留** | 刊登 CRUD 的元件層無測試;最後一條是冷啟動間歇失敗的回歸釘 |

**小計(Q9 裁決後):刪 2 條 / 1.48s**

> 刪除後 `/service-providers/:id` 這一頁仍有 `service_provider_detail.feature`
> 的 2 條情境完整守著(found + not-found),不是無人驗證。

### 4.9 line_browser.feature(5 情境 / 5.8s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 1.30 | Scenario Outline: `<platform>` renders the full app instead of a block page(2 列) | ~~刪~~ → **存疑** | **審查 P1-5 推翻**:全 src grep `detectInAppBrowser` 只命中 `referralInvite.ts` 與 `InviteFriendPanelContent.tsx`,App.tsx/路由層皆不引用——「偵測結果接到渲染決策」這條 wiring 似已整個移除,`browserDetection.test.ts` 驗的是**分類邏輯**而非渲染決策,證據等級標錯。且刪後 **Android WebView(非 LINE)UA 家族不再有任何 e2e 覆蓋**(保留的 3 條全綁 LINE UA) → Q12 |
| 0.57 | An injected LINE LIFF SDK global no longer forces a block page | **留** | `window.liff` 這條偵測路徑的接線 |
| 0.52 | A LINE user can reach the signup form | **留** | LINE 內註冊接線 |
| 1.55 | A LINE user completes a successful PayUni payment end to end | **留** | LINE 內付款端到端(§3.2 付款旅程的 in-app 變體) |
| 1.83 | A LINE user sees a failed PayUni payment result | **留** | 失敗分支對稱保留 |

**小計(修訂後):刪 0 條;存疑 1 條(2 個 test case)/ 1.30s**

### 4.10 forgot_password.feature(14 情境 / 14.5s)

| 秒 | 情境 | 決定 | 下層覆蓋證據 |
|---|---|---|---|
| 2.13 | Resend becomes available once the 3-minute window expires | **刪**(Q9 裁定) | C級 `otp_verification.feature::Resend becomes available once the 3-minute window expires`(2.33s)——**同一個 `OTPVerificationPage` 元件、同一段倒數計時程式碼**,只有 `otpType` 與被 mock 的 Supabase 呼叫不同,符合 Q9 收窄條件;recovery 那一側的送碼分支由本檔保留的 `A correct recovery code lands on the new-password page` 與 `An incorrect recovery code shows an error` 覆蓋。輔以 `otpSession.test.ts::save → get 能還原 email 與 otpType` |
| 1.50 | Reopening the verification link in a new tab resumes an in-progress reset | **存疑** | 與 `otp_verification.feature::Reopening the verification link in a new tab resumes an in-progress signup` 同型,但 recovery session 的 rehydrate 路徑不同 → Q7 |
| 0.71 | An invalid email is rejected before any request is made | **存疑** | 與 `auth_login.feature::Invalid email format is rejected` 同型但不同元件(ForgotPasswordPage vs AuthPage)→ Q7 |
| 4 條錯誤訊息 (`A failed password update`、`Reusing the old password`、`A breached new password`、`A failed send`) | | **留** | **關鍵發現**:這些中文訊息硬編在 `AuthPage.tsx` / `ResetPasswordPage.tsx`,`grep` 全 repo **沒有任何單元測試**斷言它們。刪掉等於這層映射全裸 → §6 Q8 |
| 其餘 7 條 | | **留** | 三頁串接流程,無下層 |

**小計(Q9 裁決後):刪 1 條 / 2.13s;存疑 2 條 / 2.21s**

### 4.11 全數保留的檔案

| 檔案 | 情境 | 秒 | 理由 |
|---|---|---|---|
| `test_overflow_sweep.py` | 20 | 32.6 | **唯一** 375px 軸;其餘情境全跑 1280×900。無下層等價物(jsdom 無版面) |
| auth_signup.feature | 8 | 6.9 | 4 條錯誤訊息映射無下層(同 Q8);其餘為註冊旅程 |
| auth_login.feature | 5 | 5.3 | 登入導流 Outline 是 `resolvePostLoginAction` 的**接線**證明(§3.3 同理) |
| otp_verification.feature | 7 | 8.5 | 註冊旅程 + 保留 resend/reopen 這一側 |
| complete_profile.feature | 8 | 8.3 | 表單草稿救援(四契約)、條款對話框版面、IME 之外的提交契約 |
| registration_recovery.feature | 4 | 3.5 | `docs/multi-step-flow-recovery.md` 指名的四契約範本 |
| referral_visibility.feature | 3 | 2.6 | stale-while-revalidate 快取行為,無下層 |
| service_provider_detail.feature | 2 | 1.3 | 公開詳情頁的擁有者(4.8 把重複的那份刪到這裡) |
| task_claim.feature | 2 | 3.0 | 領獎後快取失效 → 儀表板看得到新效期,跨頁,無下層 |
| dashboard_smoke.feature | 2 | 1.7 | 會員中心唯一覆蓋 |
| legal_documents.feature | 2 | 1.7 | 回歸釘(back 死鍵、target=_blank 新分頁) |

### 4.12 合計

**修訂後(審查處置完成)**:

**人審裁決後的最終範圍(2026-08-07)**:

| | 情境數 | test case | 本機秒 | 佔比 |
|---|---|---|---|---|
| **刪** | **18** | **18** | **22.98** | **12.2%** |
| 存疑(裁定不在本任務動:Q4/Q5/Q7/Q10/Q11/Q12) | 24 | 25 | 25.02 | 13.3% |
| 留 | 105 | 130 | 140.46 | 74.5% |
| **合計** | **147** | **173** | **188.46** | 100% |

刪後預期:**155 個 test case、~166s 本機**。

三階段演變(初版 → 審查後 → 人審裁決後):

| | 初版 | 審查後 | **裁決後** |
|---|---|---|---|
| 刪 | 29 / 31 / 31.83s | 15 / 15 / 19.37s | **18 / 18 / 22.98s** |
| 存疑 | 16 / 16 / 18.53s | 27 / 28 / 28.63s | 24 / 25 / 25.02s |
| 留 | 102 / 126 / 138.1s | 105 / 130 / 140.46s | 105 / 130 / 140.46s |

審查把 14 條證據不成立的移出;人審 Q9 裁定 C 級(收窄後)算證據,
把其中 3 條放回。加總複驗:18+24+105 = 147 情境、18+25+130 = 173 case、
22.98+25.02+140.46 = 188.46s ≈ §1.1 實測的 188.5s。

**18 條刪除清單**:

| 檔案 | 條數 | 秒 | 證據級 |
|---|---|---|---|
| admin_dashboard(空態 / 待處理徽章 / 標記已匯款 / 退件) | 4 | 4.62 | A + Deno |
| rewards_withdrawal(換照片 / 證件退回 / 低於最低 / 身分證驗證失敗) | 4 | 5.77 | A / B |
| payment_result(pending 重試輪詢 / LINE 客服連結) | 2 | 5.14 | A / B |
| forgot_password(3 分鐘 resend 視窗) | 1 | 2.13 | C(Q9) |
| payment_checkout(兩種續約選項 / 過期逾一年仍可續約) | 2 | 1.41 | A + Deno |
| listing_management(公開詳情頁 / not-found) | 2 | 1.48 | C(Q9) |
| renewal_backfill_recovery(補繳進度 / 繼續補繳導向) | 2 | 1.47 | A |
| home_listings(行政區跨市不外洩) | 1 | 0.96 | B |

**保留下來的 15 條刪除清單**(全數為 A/B 級,且已逐條複驗實際 import 關係):

| 檔案 | 條數 | 秒 |
|---|---|---|
| admin_dashboard(空態 / 待處理徽章 / 標記已匯款 / 退件) | 4 | 4.62 |
| rewards_withdrawal(換照片 / 證件退回 / 低於最低 / 身分證驗證失敗) | 4 | 5.77 |
| payment_result(pending 重試輪詢 / LINE 客服連結) | 2 | 5.14 |
| payment_checkout(兩種續約選項 / 過期逾一年仍可續約) | 2 | 1.41 |
| renewal_backfill_recovery(補繳進度 / 繼續補繳導向) | 2 | 1.47 |
| home_listings(行政區跨市不外洩) | 1 | 0.96 |

---

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

刪測試沒有「先寫紅燈」的相位——這一點必須講明白:**本任務的「紅燈」是
「刪掉之後下層測試仍然全綠」**,也就是證明被刪的斷言確實在別處活著。
每階段的驗證標準因此是雙向的:e2e 綠 **且** 下層測試數不減。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 刪 §4.1 admin 4 條 + §4.2 rewards 4 條(10.4s) | `e2e/features/admin_dashboard.feature`、`rewards_withdrawal.feature`;清理孤兒 step | `cd e2e && pytest -q` 綠且 **165 passed**;`npx vitest run src/components/admin/WithdrawalManagement.test.tsx src/components/reward/WithdrawalProcess.test.tsx src/components/reward/IdVerificationSection.test.tsx src/utils/withdrawalValidation.test.ts` 全綠;`npm run check` 綠 |
| 2 | 刪 §4.3 payment_result 2 + §4.5 payment_checkout 2 + §4.4 home 1(7.5s) | `payment_result.feature`、`payment_checkout.feature`、`home_listings.feature` | pytest 綠且 **160 passed**;`npx vitest run src/components/PaymentResult.test.tsx src/components/PaymentCheckout.test.tsx src/utils/districtSelection.test.ts src/utils/externalLink.test.ts src/utils/repoHygiene.test.ts` 全綠(審查 P1-6:此清單初版漏了證據測試,已補齊) |
| 3 | 刪 §4.7 renewal_backfill 2 + §4.8 listing_management 2 + §4.10 forgot_password 1(5.1s) | `renewal_backfill_recovery.feature`、`listing_management.feature`、`forgot_password.feature` | pytest 綠且 **155 passed**;`npx vitest run src/components/PaymentResult.test.tsx src/utils/otpSession.test.ts` 全綠;**C 級的兩組必須額外確認接手方仍在**:`pytest -k "service_provider_detail"`(2 passed)與 `pytest -k "otp_verification and resend"`(1 passed) |
| 4 | 回填量測與文件 | `.github/workflows/ci.yml` 檔頭與 e2e job 註解;`docs/plans/friction-log.md` | 情境數 182→155、計費分 ~7→實測 5–7 區間;xdist 註解的 182 前提同步修正;`python3 scripts/check-workflows.py` 綠 |
| 5 | 刪除本規劃檔 | `docs/plans/e2e-scenario-dedup/` | 依 CLAUDE.md「規劃檔生命週期」,PR 前刪除;可複用的原則升級進 `e2e/README.md`——依審查 P2-7,新增對稱於「Adding a scenario」的 **「Removing a scenario」** 小節放 §3.1 三級判準,四旅程清單另立 **「Must-keep end-to-end coverage」** 小節;§3.3 的 guard 覆蓋缺口與 §6 Q8 的 auth 錯誤訊息缺口寫進 friction-log |

**孤兒 step 的處理**:刪情境後,只被該情境用到的 `@given/@when/@then` 會變成
死碼。`knip` 不掃 Python,所以每階段收尾要手動 grep 步驟片語確認無其他
`.feature` 引用再刪——這是本任務唯一容易漏的機械動作,寫進各階段的 checklist。

---

## 6. 開放問題

> **全部已於 2026-08-07 人審裁決**(裁決紀錄與理由見 `review.md`「處置」節)。
> 以下保留原問題文字以留下決策脈絡,每題前標示裁決結果。
> **Q1、Q9 的裁決改變了範圍與判準,其餘皆裁定「留,不在本任務動」。**

| 題 | 裁決 | 對範圍的影響 |
|---|---|---|
| Q1 | (a) 接受實得 + (b) 另開固定開銷任務 | 記錄「達標需放寬硬約束之一」 |
| Q2 / Q6 | 留 | 無 |
| Q3 | 另開任務補 `SystemAlerts.test.tsx` | 無 |
| Q4 / Q5 / Q7 | 先留,待有人改該元件時順手補測再刪 | 無 |
| Q8 | 另開任務抽映射 + vitest | 無 |
| **Q9** | **C 級算證據(收窄:同元件同路徑、只有 mock 資料不同)** | **+3 條 / +3.61s** |
| Q10 | (a) 全留——不以手機版覆蓋換 3.23s | 無 |
| Q11 | (a) 採架構視角全留——判準一致性優先 | 無 |
| Q12 | 先不動,另開 line_browser 整檔清查 | 無 |
| Q13 | (a) route_guards 全留;缺口另開任務 | 無 |

**Q1(最重要,關乎任務目標本身)** —— §1.3 算出:在「必須有下層證據」的
約束下,審查後的實得是 **-24~-34s / ≈0.5 計費分**,月省 **≈300 分**,
**到不了任務描述的「~4-5 計費分」與「700–1,000 分/月」**。
差額只能從固定開銷(50–57s)或並發拿,兩者都在授權邊界外。
請裁決:(a) 接受本規劃的實得(**≈300 分/月**)並結案;(b) 另開任務處理
固定開銷(例:把 `playwright install --with-deps` 的系統相依也納入 cache、
`npm ci` 換 `--prefer-offline`)——**審查 P2-4 指出這個選項尚未量化**,
裁決前應先實測一次 `--with-deps` 的單步秒差,否則是猜測性選項;
(c) 重新檢視 xdist 的否決(那 2 個不穩情境是否可個別隔離)。

Q9–Q12 若裁定「可刪」,最多可再加回 12.46s(回到初版的 31.83s 規模),
但那需要先接受放寬判準或先補下層測試——兩者都改變本任務範圍,
所以 Q1 的答案應該連同 Q9–Q12 一起定。

**Q2** —— admin 分頁切換(§4.1)只在 e2e 有覆蓋。刪或留?
若留,是否值得補一支 `AdminDashboard.test.tsx` 專測分頁切換,下次再刪?

**Q3** —— `SystemAlerts.tsx` 沒有元件測試,e2e 是唯一防線。
這是**覆蓋缺口**而非重複,是否另開任務補 `SystemAlerts.test.tsx`?

**Q4** —— rewards 的 5 條存疑(空態、無照片上傳、後端拒絕 toast、條款 gate、
上傳失敗中止;合計 7.39s)。共同型態是「元件層測得到但目前沒測」。
一次裁決:(a) 全留;(b) 補下層測試後於下一輪刪;(c) 逐條裁決。

**Q5** —— payment_result 的 7 條存疑(合計 7.56s)。同型態。
特別注意 `Activation that never completes times out`(2.96s)——它與
`PaymentResult.test.tsx::renewal 取不到時顯示付款成功與重試` 相鄰但不同,
刪掉會失去逾時→客服畫面→重試這條鏈的唯一覆蓋。

**Q6** —— payment_checkout 的 2 條存疑(未快取推薦碼、重複訂閱 toast)。

**Q7** —— forgot_password 與 otp_verification 的兩對同型情境
(new-tab rehydrate、email 格式)。要不要以「同一元件的不同 otpType /
不同頁面的同一驗證器」為由再刪一側?

**Q8(不是刪除問題,是缺口)** —— auth 的錯誤訊息映射(已註冊 / 密碼外洩 /
rate limit / 舊密碼相同,共 8 條 e2e)硬編在 `AuthPage.tsx` 與
`ResetPasswordPage.tsx`,**沒有任何單元測試**。這是本次盤點的副產品發現。
是否另開任務抽出映射函式並補 vitest?(抽出後這 8 條 e2e 才具備刪除條件,
約可再省 6s。)

---

### 審查後新增(Q9–Q13,對應 `review.md` 的 P0/P1)

**Q9(判準級,連動 3 條 / 3.61s)** —— **C 級證據算不算合格的刪除依據?**
硬約束 1 的字面是「在**更便宜的層**被斷言」,C 級(e2e 內部跨檔重複)證的是
**同一層**另一個情境,不滿足;但那確實是真重複,跑兩次同一段程式碼。
裁定「算」則 §4.8 兩條 + §4.10 一條可恢復刪除。

**Q10(連動 4 條 / 3.23s)** —— home_listings 的 4 條手機檢視情境。
審查 P1-1/P1-2/P1-3 證明 jsdom 結構性測不到 media query、沒有測試 render
`HomePage`、overflow sweep 是 report-only 而非「更嚴格」。
選項:(a) 全留;(b) 補一支 render `HomePage` 的整合測試後再刪;
(c) 只保留「switch between views」與「preference remembered across reloads」
這兩條接線/初始化行為,刪掉另兩條內容型斷言(UI/UX 視角的建議)。
**注意**:選 (a) 以外的任何選項都會讓「會擋 CI 的手機視窗情境」從 5 條
降到 2–3 條,而規格明訂手機優先——這是 Q10 真正要權衡的東西。

**Q11(連動 3 條 / 1.96s)** —— payment_checkout 的 3 條 redirect 情境。
**兩個視角判斷不同**(見 review.md「需人工裁決」第 1 項):系統視角認為
B 級證據獨立成立(已讀 `PaymentCheckout.tsx:94-104/154-163` 確認
`resolveCheckoutPageRedirect` 真的驅動 navigate),只是失效的 C 級 backup
該拿掉;架構視角以「§3.3 自己立的 wiring 標準」判 P0。請裁決採哪一方。

**Q12(連動 1 條 / 1.30s)** —— line_browser 的 Outline。
`detectInAppBrowser` 已不在路由/渲染層被引用,「偵測接到渲染決策」這條
wiring 看來已移除。若屬實,刪除的真正理由是「同一段無條件渲染的程式碼被
不同 UA 字串重複跑」——那是 §3.1 未定義的第四類證據,要不要承認?
另:刪後 Android WebView(非 LINE)UA 家族將無任何 e2e 覆蓋。

**Q13(P0-1 的處置,連動 route_guards 4 個 case / 2.36s)** ——
`resolveMembershipRedirect`(`RequireMembershipRoute.tsx:29`)六個分支
**全 repo 零測試覆蓋**,route_guards.feature 是它唯一的防線,已全數改「留」。
要恢復刪除必須先補測試,但 §2 明文排除「補下層測試再刪」。
請裁決:(a) 維持全留結案;(b) 放寬 §2,把「補 `RequireMembershipRoute`
測試」納入本任務。
**不論選哪個,「這張決策表零覆蓋」本身是應該獨立處理的缺口**——它守的是
「絕不能把已付款的人送回結帳頁造成重複付款」這條金流不變式。

---

## 7. 風險與回滾

| 風險 | 機率 | 影響 | 處置 |
|---|---|---|---|
| 刪錯:被刪情境的行為其實下層沒真的驗到 | **已實現(初版 29 條中 14 條踩到)** | 高(把關變弱且無人察覺) | 四視角審查抓出 2 P0 + 6 P1,全數改列存疑;§3.1 已補「要 grep 到實際 import 才算」;階段收尾實跑證據測試檔並貼輸出 |
| 孤兒 step 片語誤刪,連累其他 feature | 中 | 中(collection error,CI 立刻紅) | 刪前 grep 全 `features/` 確認無其他引用;pytest collection 會當場擋下 |
| 省下的時間被 runner 變異吃掉,看起來沒效果 | **高** | 低 | §1.2 已把變異寫進基準;驗收看 **pytest step 秒數**而不是計費分 |
| 未來有人以「反正下層有測」為由繼續刪到旅程斷掉 | 中 | 高 | §3.2 的四旅程保留清單升級進 `e2e/README.md`,成為長期規則 |

**回滾**:整個變更是純刪除,`git revert` 單一 PR 即可完全復原;
被刪的情境內容永久可由 `git show <hash>:e2e/features/<file>` 取回。
分階段 commit,任一階段發現誤刪可只 revert 該階段。

---

## 8. 量測方法(可重現)

```bash
# 本機逐情境耗時
cd e2e && E2E_SKIP_DEV_SERVER=1 pytest --browser chromium -q \
  --durations=0 --junit-xml=/tmp/e2e.xml

# CI 逐 step 時間(本 session 用 GitHub MCP 取,本機有 gh 時等價於)
gh api repos/simonzhao219/Uknow/actions/runs/<run_id>/jobs \
  --jq '.jobs[] | select(.name=="e2e-tests") | .steps[] | {name, started_at, completed_at}'

# 計費分(與 scripts/actions-usage.py 同一個模型)
# billable = ceil((completed_at - started_at) / 60)
```
