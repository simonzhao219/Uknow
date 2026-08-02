# 補繳式續約(renewal-backfill)規劃書

> **版本:第 2 版**(2026-08-02)。第 1 版經 `/review-plan` 四視角審查得
> P0×3、P1×9、P2×4,人已於 `review.md`「處置」節裁決 Q1=(a)、Q2=不設限、
> Q3=維持逐筆。本版依裁決全面改寫,須重跑 `/review-plan`。
> 第 1 版與本版的差異摘要見 §8。

## 0. 一句話

這個 feature 讓**過期超過一年的會員**能用「續約(接續原效期)」逐年補繳回來、
保住原本的推薦線與週年日,因為現行規則直接封死這條路,把想回來的舊會員
一律推去新約——而新約會重設週年日、也讓他有動機換掉原本的上代。

## 1. 使用者需求

對照規格書:`docs/uknow-software-specification.md` §5.1(失效語意)、§6.2(續約雙模式)。
**這兩節的既有敘述與本 feature 直接衝突,須在同一個 PR 改寫**(見 §5 階段 9)。

### 規則(人已逐條拍板,實作不得改動語意)

| # | 規則 | 現況 |
|---|---|---|
| A1 | 「續約(接續原效期)」永遠可選,不因過期多久而消失;**不設筆數上限** | ❌ 要改 |
| A2 | 一筆 1200 = 一年,從前一期到期日的**隔天**起算(台灣日曆日);算出來仍在過去也照給,**不做 `greatest(now(), …)` 補救** | ✅ 已符合 |
| A3 | 付款後若新到期日仍在過去 → 仍是 expired → 使用者被帶回結帳頁再選一次,重複到到期日 > 今天 | ❌ 要改(見 P0-1) |
| A4 | 補繳完成後保留原週年日 | ✅ 已符合 |
| A5 | 每一輪都可改選「換上代」(fresh,從付款日起算,立刻生效) | ✅ 已有 |
| A6 | 補繳每一筆都發三代獎金(補 3 年 = 上代拿 3 次) | ✅ 已符合 |
| A7 | 結帳頁**事前揭露總額**與**補繳進度** | ❌ 新增 |
| A8 | 過期者不得用免費續約 credit 復活,須先付費恢復 active | ✅ 維持不變 |
| A9 | **每一筆付款各自建立一列 `subscriptions`,不做合併訂單** | ✅ 已符合 |

> A3 在第 1 版被誤標為「✅ 已符合」。實際上 PayUni 導回落在 `/payment/result`,
> 該頁會把「付款成功但仍 expired」當成開通異常處理——見 §4「付款結果頁」。
>
> A9 是 Q3 裁決的成文化。合併訂單會打破「一筆付款 = 一列 `subscriptions`
> = 一個 `subscription_id`」的粒度,而 `pay_referral_generations` 的冪等鍵
> 與 `repair_orphaned_payments` 的 `source_payment_order_id` 對應都建立在
> 這個粒度上——合併會**直接違反 A6**(3 次獎勵縮成 1 次)。

### 驗收情境

**AC-1(核心)** 到期 2024-04-02、2026-05-02 登入:

| 付款 | 起算 | 新到期日 | 帳號狀態 |
|---|---|---|---|
| 第 1 筆 | 2024-04-03 | 2025-04-02 | 仍 expired |
| 第 2 筆 | 2025-04-03 | 2026-04-02 | 仍 expired |
| 第 3 筆 | 2026-04-03 | 2027-04-02 | ✅ active |

**必須用真實 DB 連續打三次驗證**,不能只靠純函式模擬——第 2/3 筆的錨點要接在
前一筆**實際寫入**的 `end_date` 上(見 §5 階段 3)。

**AC-2** 該使用者在**付第一筆之前**,結帳頁就看得到:已過期 2 年 1 個月;
接續原效期需補繳 3 筆共 NT$3,600,補完到期日 2027-04-02;或新約 NT$1,200
立即生效。

**AC-3** 付完第 1 筆、PayUni 導回後,**不進入開通輪詢/逾時錯誤畫面**,而是
看到補繳進度與「繼續補繳」的明確去路。回到結帳頁後看得到「已補至
2025-04-02,還差 2 筆」。

**AC-4** 該使用者在任何一輪都能改選新約 1,200 立即生效。

**AC-5** 補 3 筆 → 上代(及其上二代)各拿 **3 次**推薦獎勵;任務計數 **不** 增加
(pair-history,該下線早已計過)。

**AC-6** 同一使用者的兩筆訂單並行付款完成時,**不會**算出相同效期
(每筆各自接續前一筆)。

**AC-7** 補繳中途關閉頁面、之後從任何入口回來,都能接續看到正確進度,
不會卡死也不用從頭開始(四契約第 2 條)。

### 不做什麼

- **不做「上代配對線」**(換上代開新線、帳本歸零、樹走訪跳過已離開者、
  配對歷史與任務計數分離)——schema 級改動,單獨規劃單獨上線。
- **不做合併訂單**(A9)。
- **不設補繳筆數上限**(A1;Q2 已依 A1 收斂結案)。
- **不為 A8 開例外**——過期者手上有免費續約 credit 仍須先自費補繳到 active。

## 2. 系統設計

### 資料流

`/payuni/prepare`(建單,寫入 `payment_orders.renewal_mode`)
→ PayUni → **導回 `${frontendUrl}/payment/result?tradeNo=…&status=…`**
(`index.ts:2033,2074`)
→ `/payuni/return` or `/webhooks/payuni/notify` → `process_successful_payment`

第 1 版寫「付款後回結帳頁」是**錯的**。導回一律先落在 `/payment/result`,
`PaymentResult.tsx` 才是補繳體驗的第一現場——這是 P0-1 的根源。

**效期算術不動。** `process_successful_payment` 的 extend 錨點
(`tw_day(max(end_date)) + 1`,`20260718000001:200-208`)本來就字面執行、
不做 now() 補救,補繳制要的正是這個行為。

### 資料庫變更:一支 migration(依 Q1(a) 裁決)

> 第 1 版宣稱「無 migration」。Q1 裁決為 (a) 後該宣稱不再成立。

`process_successful_payment` 目前只 `for update` 鎖 `payment_orders`
(鍵為 `transaction_id + user_id`,`20260718000001:178-183`);算 `v_anchor_day`
時對 `subscriptions` 是無鎖的 `select max(end_date)`(`:200-208`)。同一使用者
的兩筆不同訂單並行完成時,兩者可能讀到相同的 max,各自寫出**相同效期**——
付了 2,400 只得一年。

`apply_referral_side_effects` 確實鎖 `profiles`(`20260726000102:72-76`),但那是
在訂閱已 insert **之後**才拿到(`20260718000001:247-248`),鎖不住這個 race。
`subscriptions_payment_transaction_id_unique`(`20260716000006:54-56`)鍵在
`payment_transaction_id`,兩筆不同 trade_no 撞不到。

**觸發路徑不只「使用者雙開分頁」**——`complete_paid_pending_orders`
(`20260716000007:113-120`)與 `/internal/reconcile-pending-payments`
(`index.ts:1766-1829`)都直接呼叫同一支函數,對同一人的不同 pending 訂單
各自補完時同樣無保護。補繳制讓一人多筆 pending 成為常態,這些路徑撞在一起
的機率跟著上升。

**修法**:在算 `v_anchor_day` **之前**加一道 user 層級鎖:

```sql
perform 1 from public.profiles where id = p_user_id for update;
```

鎖序為「先 `payment_orders`(依 trade_no,各筆不同)→ 後 `profiles`(依 user_id)」。
`apply_referral_side_effects` 稍後在同一交易內對已持有的 `profiles` 鎖屬
**可重入**,不會自我死鎖;兩個不同訂單的並行呼叫不會互相持有對方需要的資源,
**不構成死鎖環**(系統視角已覆核)。

### API 變更

**`POST /payuni/prepare`** — 移除「接續後效期仍在未來」的拒絕
(`index.ts:1400-1405`)。保留 `!lastSub?.end_date` → 「沒有可接續的訂閱紀錄,
請選擇新約」(`:1392-1394`):extend 仍需曾是會員,那不是時效限制。

**`GET /subscriptions/status`** — `data` 新增 `renewal`:

```ts
renewal: {
  extendAnchorDate:     string;  // 'YYYY-MM-DD' 下一筆的起算日
  extendEndDate:        string;  // 'YYYY-MM-DD' 下一筆付完的到期日
  backfillCount:        number;  // 還要付幾筆才會 active
  backfillAmount:       number;  // backfillCount × YEARLY_PRICE
  backfillFinalEndDate: string;  // 'YYYY-MM-DD' 補滿 backfillCount 筆後的最終到期日
  expiredForMonths:     number;  // 原到期日到今天經過的完整月數
  hasPaidAnyBackfill:   boolean; // 本輪補繳是否已付過至少一筆
} | null                          // 從未訂閱過(lastSub === null)= null
```

四個欄位是第 1 版沒有、審查抓出來的缺口:

- `backfillFinalEndDate` — 第 1 版的 `extendEndDate` 註解寫「下一筆付完的
  到期日」,但 §4 文案要顯示的是「補完到期日 2027-04-02」(全部補完後)。
  兩者在第 1 版自己的例子裡就對不上,契約沒有欄位承載,實作者只能自己在
  前端另算一份,違反單一事實來源。
- `expiredForMonths` — AC-2 的「已過期 2 年 1 個月」在第 1 版無資料來源、
  無測試落點。**只回月數,由前端做 `月數 → 年+月` 的顯示換算**(純除法,
  不含日期邏輯,不需要跨端一致的算術)。
- `hasPaidAnyBackfill` — §4 退化文案的判準(見 P1「退化條件」)。定義:
  **目前 status 為 `expired`,且最新一筆 `completed` 訂單的
  `renewal_mode = 'extend'`**。
- `renewal: null` — `/subscriptions/status` 的 `sub` 查詢用 `.maybeSingle()`
  (`index.ts:2101-2106`),從未訂閱者為 `null`。第 1 版沒定義這個邊界,
  漏判會讓端點 500。明確約定回 `null`,前端據此隱藏整塊。

契約同步寫進 `supabase/functions/_shared/api-contract.ts`。

## 3. 架構影響

### 動到的模組

| 檔案 | 改動 |
|---|---|
| **`supabase/migrations/<新>_payment_user_lock.sql`** | `process_successful_payment` 加 user 層級鎖 |
| `supabase/functions/api/index.ts` | `/payuni/prepare` 拆守衛;`/subscriptions/status` 加 `renewal` |
| `supabase/functions/_shared/api-contract.ts` | `renewal` 型別 |
| `supabase/functions/_shared/backfill-cases.ts` | **新增**:兩側共用的案例表 |
| `supabase/functions/api/tw-dates.ts` | 新增 `backfillPlan()` |
| `src/utils/twDate.ts` | 同上(見「雙副本」) |
| **`src/components/PaymentResult.tsx`** | **新增**:區分「補繳中間筆」與「開通收斂延遲」 |
| `src/components/PaymentCheckout.tsx` | 移除 `canExtend` 限制;揭露卡片與進度 UI |
| `src/hooks/useSubscription.ts` | `renewal` 型別;**併同修正過時的模組註解** |
| `e2e/features/renewal_backfill_recovery.feature` | **新增**:四契約要求的中途離開回歸測試 |

### `renewal` 怎麼接進 PaymentCheckout(第 1 版只有結論、沒有機制)

`PaymentCheckout.tsx` 現況**完全不呼叫 `/subscriptions/status`**——
`isRenewal`/`canExtend`/`extendAnchorDay` 全部算自 `pendingUser.subscriptionEndDate`
(來源 `/auth/profile`,`PaymentCheckout.tsx:104-149`、`296-300`)。

**定案:掛 `useSubscription()`**,不新開第二條呼叫路徑。理由:

1. 該 hook 已走 `apiClient.ts`(`useSubscription.ts:6,58-60`),不必延續
   PaymentCheckout 現有裸 `fetch` 的舊債
2. 它匯出的 `refresh()`(`:102-106`)正是 AC-3「付完一筆後進度要更新」需要的
   ——既有的 5 秒輪詢只打 `/auth/profile`,不會帶動 `renewal`
3. 單例陷阱不成立:該 hook 的 docstring 警告「同一個畫面只准掛一個實例」
   (`:30-40`,`dedupe` 會讓後到者卡在 `isLoading` 永遠 true),但
   `/payment/checkout` 是獨立路由(`App.tsx:370-377`),不會與已使用此 hook 的
   `MemberDashboard.tsx:22` / `RewardDashboard.tsx:25` 同屏。**此判斷寫在這裡
   留痕,不留給實作者重新發現。**

`canExtend` 隨之從前端移除(不再有時效限制),第 1 版說的「順手收掉雙實作」
因此才真正成立。

### multi-step-flow 四契約:適用,且要逐條過(第 1 版排除理由不成立)

第 1 版用「本頁不是多步驟表單,是單頁結帳」排除四契約——**理由錯誤**。
`docs/multi-step-flow-recovery.md:71` 的盤點表已明確把「付款(PaymentCheckout /
PayUni 回跳)」列入管轄,判準是「需要連續多步才能完成」,與頁面是否 wizard 無關。
補繳制讓使用者要跨多次(可能跨天跨 session)才能從 expired 走到 active,
正落在管轄範圍。

逐條檢查:

| 契約 | 結論 |
|---|---|
| 1. 狀態可從後端查詢 | ✅ `renewal` 區塊即是,不藏在 React state |
| 2. 每一步都有可重入的入口 | ✅ 任何時候回結帳頁都算得出當前進度;但**要有 e2e 證明**(§5 階段 8) |
| 3. 失敗訊息區分可復原/不可復原,永遠給下一步 | ❌ **要補**:P0-1 的「補繳中間筆」正是被誤分類成不可復原的可復原狀態;`renewal` 取不到時也要給下一步 |
| 4. 外部副作用先驗身分 | ✅ `/payuni/prepare` 走 `requireAuth` |

契約 3 正是 P0-1 的本質——`PaymentResult.tsx` 把一個完全正常的狀態顯示成
「請聯繫客服」的終局錯誤。

### 雙副本(P2,轉為開放問題 Q4)

`src/utils/twDate.ts` 與 `supabase/functions/api/tw-dates.ts` 目前皆**零外部
import**,條件與 `_shared/api-contract.ts`、`_shared/name-validation-cases.ts`
完全相同。兩檔 docstring 宣稱「兩邊不能互相 import」,但那只在「Deno 讀
`src/`」方向成立;「前端讀 `_shared/**`」這個反方向,`@contract` /
`@name-cases` 兩個既有 alias 已證明可行且是本專案慣例。

本規劃**預設不收斂**(照既有雙副本模式,新增 `backfillPlan()` 到兩側 +
共用案例表),但這是知情的選擇而非蕭規曹隨——見 Q4。

### 效能/安全

- `/subscriptions/status` 多回七個純計算欄位,無額外查詢。
- 拆掉的是**便利性守衛**不是**安全守衛**:extend 效期由後端在付款當下自算,
  從不信任前端傳入的日期(§6.2 既有設計)。
- 使用者最多把自己的效期補到「原到期日 + N 年」,每年都真金白銀付過 1,200,
  不存在套利。
- 新增的 user 層級鎖是 row-level,鎖定範圍限於單一使用者的付款交易期間。

## 4. UI/UX

對照 `docs/ui-ux-guidelines.md`;行動版優先(375px 為基準寬度)。

### 付款結果頁 `PaymentResult.tsx`(P0-1,本 feature 的成敗關鍵)

**現況為什麼會壞**:`PaymentResult.tsx:154-173` 的邏輯是「`resolvedStatus ===
'success'` 但 `accountStatus !== 'active'`」→ 啟動輪詢(`MAX_ACTIVATION_POLLS=15`
× `ACTIVATION_POLL_INTERVAL_MS=3000` ≈ 45 秒),顯示「付款成功,正在開通會員
資格」(`:236-263`);逾時後(`:267-316`)顯示「開通處理中…比預期久一些」+
「重新確認」(只重跑同一個 45 秒迴圈)與「聯繫客服」,**沒有任何按鈕回得了結帳頁**。

這個假設(付款成功 ⟹ 應該很快變 active)在舊規則下永遠成立,但補繳制
**刻意**讓第 1~N-1 筆付款後仍是 expired(A2/A3)。不改的話,每一筆非最終筆
都會讓使用者先卡 45 秒無意義輪詢,再撞進一個主動暗示系統故障的畫面。

**改法**:在進入輪詢分支**之前**先判斷是不是補繳中間筆——
`orderStatus === 'completed'` 且 `renewal.backfillCount > 0` → **完全跳過輪詢
與逾時分支**,直接顯示:

> ✅ 付款成功,已補至 **2025-04-02**
> 你的會籍仍在補繳中,還差 **2 筆**(NT$2,400)才會生效。
> 〔繼續補繳〕〔稍後再說〕

「繼續補繳」導回 `/payment/checkout`;「稍後再說」導回可去的頁面。關鍵是
**永遠給下一步**(四契約第 3 條),而不是把人留在死巷。

### 結帳頁揭露卡片(A7)

過期會員一進結帳頁,**在按下第一筆付款之前**就先看到:

> 你的會籍已於 **2024-04-02** 到期,已過期 **2 年 1 個月**。
> - **接續原效期**:需補繳 **3 筆**,共 **NT$3,600**,補完到期日 2027-04-02
> - **新約**:**NT$1,200** 立即生效,效期至 2027-05-01(可更換推薦碼)

**退化條件用 `hasPaidAnyBackfill`,不是 `backfillCount === 1`。** 第 1 版寫
「`backfillCount === 1` 時不出現補繳字樣」,理由是「沒缺席的人不該看到補繳
語彙」——但那理由只適用於「原本就只差 1 年」的人。**已付 2 筆、只剩最後 1 筆**
的使用者此刻 `backfillCount` 同樣是 1,揭露卡片會顯示成普通續約,而同一頁的
進度卡片卻說「還差 1 筆」,兩則文案在同一畫面互相打架。

正確判準:`hasPaidAnyBackfill === false && backfillCount === 1` 才退化成
一般續約敘述。

**避免與既有卡片重複**(P2):結帳頁已有 CardDescription 顯示「您的會籍已於
{date} 到期」(`PaymentCheckout.tsx:563-570`)、選項卡片顯示「效期自 X 接續,
至 Y」(`:630-633`)。揭露卡片上線時把 CardDescription 那句移除,選項卡片內的
效期敘述改為只講「下一筆」,總額與最終到期日只在揭露卡片講一次——同一資訊
不在 375px 版面上分兩處各講一遍。

### 補繳進度(A7)

`hasPaidAnyBackfill === true` 時,選項卡片內顯示:

> 已補至 **2025-04-02**,還差 **2 筆**(NT$2,400)

### 狀態

- **載入**:`/subscriptions/status` 未回前,兩個選項卡片走既有 skeleton
- **錯誤(付款前)**:取不到 `renewal` → 隱藏揭露卡片、兩個選項照常可選
  (降級為現行體驗,不阻斷付款)
- **錯誤(付款後,P1)**:第 1 版的靜默降級沒有排除「剛付完一筆」這個情境。
  PayUni 導回是瀏覽器層級跳轉(整頁重載),`/subscriptions/status` 要重打;
  而本專案使用者以 LINE 內建瀏覽器為主(`src/utils/browserDetection.ts` 已有
  既有處理)。此時若請求失敗,使用者會完全看不到進度,退化成看似首次選擇的
  畫面——**正是最容易引發客訴的時刻,防線卻在此無聲失效**。
  改法:`hasPaidAnyBackfill` 情境下不靜默降級,顯示「進度暫時無法讀取」+
  重試按鈕(`refresh()`)。
- **空態**:首購(`renewal === null`)完全不顯示本區塊,與現行一致

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `process_successful_payment` 加 user 層級鎖(migration) | `api/payment-user-lock.test.ts`(需 DB) | **AC-6**:同一 user 兩筆 pending 訂單並行完成 → 兩列 `subscriptions` 的 `end_date` **不相同**、第二筆正確接續第一筆;既有付款測試全綠(無回歸) |
| 2 | `backfillPlan()` 純函式 + `_shared/backfill-cases.ts` | `api/backfill-plan.unit.test.ts`(Deno,免 DB)、`src/utils/twDate.test.ts`(vitest node);兩者共吃同一份案例表 | AC-1 三筆的錨點/迄日/筆數全中;`backfillFinalEndDate`、`expiredForMonths` 正確;跨年、閏日(2024-02-29 到期)、剛好今天到期、未滿一年、**`endDate === null` 各一例** |
| 3 | 後端拆守衛 | `api/renewal-modes.test.ts`(需 DB) | 過期 3 年送 `renewalMode:'extend'` → 200 建單;**連續打三次真實付款**,三列 `subscriptions` 的迄日依序為 2025/2026/2027-04-02,前兩次後 `user_account_status` 仍 `expired`、第三次轉 `active`(**AC-1 端到端**);同一輪斷言三代獎勵各 3 筆、`task_progress` 不增(**AC-5**)。**既有 `renewal-modes.test.ts:171-184` 的「過期超過一年被拒絕」斷言要反轉,不是刪除** |
| 4 | `/subscriptions/status` 回傳 `renewal` | `api/subscriptions-status.test.ts`(需 DB) | 過期 2 年 1 個月 → `backfillCount:3`、`backfillAmount:3600`、`extendEndDate:'2025-04-02'`、`backfillFinalEndDate:'2027-04-02'`、`expiredForMonths:25`;active → `backfillCount:0`;**從未訂閱 → `renewal: null`**;已付一筆補繳 → `hasPaidAnyBackfill:true` |
| 5 | `PaymentResult.tsx` 區分補繳中間筆 | `PaymentResult.test.tsx`(vitest + jsdom pragma) | **AC-3**:`orderStatus==='completed'` 且 `backfillCount>0` → **不啟動輪詢**、不顯示逾時錯誤、顯示補繳進度與「繼續補繳」CTA;`backfillCount===0` 但仍非 active → 走原輪詢路徑(不回歸) |
| 6 | 前端接 `useSubscription()` + 拆 `canExtend` + 揭露卡片 | `PaymentCheckout.test.tsx` | **AC-4**:過期 3 年時 extend 選項可見可選;**AC-2**:顯示「已過期 2 年 1 個月」「補繳 3 筆共 NT$3,600」「補完到期日 2027-04-02」;`renewal === null` 時整塊隱藏 |
| 7 | 補繳進度顯示 + 錯誤態 | 同上 | 已付一筆後顯示「已補至 2025-04-02,還差 2 筆」;`hasPaidAnyBackfill:false && backfillCount:1` 時**不出現補繳語彙**;`hasPaidAnyBackfill:true` 且 `renewal` 抓取失敗時顯示重試而非靜默降級 |
| 8 | 四契約回歸測試 | `e2e/features/renewal_backfill_recovery.feature`(CI `e2e-tests` 軌) | **AC-7**:補繳中途關頁 → 從不同入口回來 → 接續看到正確進度,非死巷。仿 `registration_recovery.feature` 樣板(`multi-step-flow-recovery.md:150-153`) |
| 9 | 規格書 + 過時註解同步 | `python3 scripts/check-spec-drift.py` + 人工核對 | §5.1 末條「失效超過一年只能走新約」刪除;**§6.2 表格下方那段散文**(「失效超過一年者選 extend…直接拒絕」)一併刪除;§6.2 表格「適用」欄改寫,**併同修正 fresh 列本來就不準的敘述**;`useSubscription.ts:9-12` 的「沒有『取消／恢復／補繳／寬限期』」註解更新 |

**階段 1 先行是刻意的**:它是金錢正確性防線,且獨立於其他階段。先補好洞,
後面拆守衛時才不會有一段「規則已放寬但防線未到位」的窗口。

**階段 2 次之**:算術是本 feature 唯一容易算錯的部分,用純函式(秒級、免
`supabase start`)先把 AC-1 釘死,階段 3、4 只是把它接出去。

**階段 9 的驗證不能只靠綠燈**:`scripts/check-spec-drift.py` 只做常數/路由/
列舉/路徑四類機械抽取,**不比對自由散文**——§6.2 表格下方那段描述舊拒絕行為
的文字,CI 綠燈也抓不到。必須人工核對,否則規格書會出現「表格說永遠可選、
下面一段話說會被拒絕」的自我矛盾。

## 6. 開放問題

> Q1(併發缺口)、Q2(筆數上限)、Q3(逐筆付款)已於第 1 輪人審裁決,見
> `review.md`「處置」節。Q2 依 A1 收斂結案,不再列此。

- [ ] **Q4:`twDate.ts` / `tw-dates.ts` 的雙副本要不要趁這次收斂成 `_shared/tw-dates.ts`?**
  兩檔目前零外部 import,技術上可比照 `@contract` / `@name-cases` 收成單一份。
  - **不收斂**(本規劃預設):照既有模式兩側各加 `backfillPlan()` + 共用案例表。
    案例表能攔住「輸出漂移」,但攔不住「單邊忘記實作整段邏輯」這種更嚴重的漂移。
  - **收斂**:一勞永逸,但本 feature 的 diff 會多一段與補繳無關的搬遷,
    且要驗證 Supabase deploy bundling 不受影響。
  **傾向不收斂**——本 feature 已有一支 migration 碰金流函數,再疊一次跨端
  模組搬遷會讓這個 PR 的風險面過寬;但這應該是知情的決定,故列此。

- [ ] **Q5:揭露卡片要不要說明「為什麼值得補繳」?**
  目前文案只陳列「筆數 × 金額」。§0 說補繳換到的是「保住原推薦線與原週年日」,
  但這個理由沒有出現在**給使用者看的**文案裡。加一句說明可能降低「我沒用到的
  那幾年為什麼要付錢」的客訴,但也可能被讀成推銷。屬文案/商業溝通決策,
  不由規劃單方決定。

## 7. 風險與回滾

**R1(高 → 已納入處置):並發付款導致效期少算。**
最壞情況是使用者付了錢沒拿到對應效期——金錢正確性問題。
偵測:`subscriptions` 同一 user 出現兩列 `end_date` 相同。
處置:階段 1 的 user 層級鎖 + AC-6 整合測試。**Q1(a) 已裁決,不再是開放風險。**

**R2(高):補繳中間筆被誤判成系統故障。**
最壞情況是使用者付了錢、看到「請聯繫客服」,判定平台有問題而要求退款。
Q3 裁決維持逐筆付款後,這條路徑會被走 N-1 次,**風險隨補繳年數線性放大**。
緩解:階段 5(`PaymentResult.tsx`)與階段 6、7(揭露與進度)。
**這三個階段不是 UI 收尾,是這個 feature 的一半。**

**R3(中):規格書散文殘留造成自我矛盾。**
機械檢查抓不到,綠燈不代表清乾淨。緩解:階段 9 明列人工核對項目。

**R4(低):既有測試斷言反轉時改錯方向。**
`renewal-modes.test.ts:171-184` 現在斷言「過期超過一年被拒絕」。反轉時若順手
把整個 test case 刪掉,就失去對新行為的覆蓋。緩解:階段 3 明列「反轉而非刪除」。

### 回滾

**程式面**:把 `index.ts` 的拒絕分支與前端 `canExtend` 條件加回去,單一 commit
revert。階段 1 的 migration **不需要**回滾——user 層級鎖是純防禦性強化,
在舊規則下同樣正確,留著只有好處。

**資料面**:回滾**不需要**清理已產生的訂閱列。補繳期間每一筆付款都是獨立的
`subscriptions` insert,效期算術與現行規則一致,回滾後這些列仍然正確。

> 一個誠實的但書:回滾後,補到一半的使用者會卡在「付了 2 筆仍過期、且不能
> 再接續」,只能走新約或人工補效期。真要回滾必須同時決定怎麼處置他們。
> 這正是 R1、R2 都必須在上線前處理掉、而不是留待觀察的原因。

## 8. 與第 1 版的差異

| 來源 | 第 1 版 | 本版 |
|---|---|---|
| P0-1(UIUX+需求) | 誤以為付款後回結帳頁;`PaymentResult.tsx` 未列入 | §2 修正資料流;§4 新增付款結果頁設計;階段 5;A3 標記改為「要改」 |
| P0-2(架構,系統判 P1) | 「後端成為事實來源」只有結論 | §3 定案掛 `useSubscription()` 並記錄單例判斷 |
| P0-3(系統) | 併發缺口留白、無階段 | Q1(a);§2 新增 migration 一節;階段 1;R1 改為已處置 |
| P1 契約缺欄位 | `extendEndDate` 與文案對不上 | 新增 `backfillFinalEndDate` |
| P1「已過期 X 年 Y 個月」 | 無來源無測試 | 新增 `expiredForMonths`;進階段 2 案例表 |
| P1「無 migration」矛盾 | §2 與 Q1 自相矛盾 | §2 改寫 |
| P1 四契約 | 以「非 wizard」排除 | §3 逐條檢查,契約 3 判定要補;階段 8 |
| P1 `lastSub === null` | 未定義 | 約定 `renewal: null`;進階段 2、4 |
| P1 連續三筆整合測試 | 只有單筆 | 階段 3 驗證標準明訂 |
| P1 §6.2 散文 | 只提表格 | 階段 9 明列散文與人工核對 |
| P1 退化條件 | `backfillCount === 1` | 改用 `hasPaidAnyBackfill` |
| P1 付款後降級 | 靜默降級 | `hasPaidAnyBackfill` 時顯示重試 |
| P2 × 3 | — | `useSubscription` 註解(階段 9)、§6.2 fresh 列(階段 9)、卡片重複(§4) |
| P2 雙副本 | 定性為「既定解法」 | 轉為 Q4,知情選擇 |
