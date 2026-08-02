# 補繳式續約(renewal-backfill)規劃書

## 0. 一句話

這個 feature 讓**過期超過一年的會員**能用「續約(接續原效期)」逐年補繳回來、
保住原本的推薦線與週年日,因為現行規則直接封死這條路,把想回來的舊會員
一律推去新約——而新約會重設週年日、也讓他有動機換掉原本的上代。

## 1. 使用者需求

對照規格書:`docs/uknow-software-specification.md` §5.1(失效語意)、§6.2(續約雙模式)。
**這兩節的既有敘述與本 feature 直接衝突,須在同一個 PR 改寫**(見 §5 階段 5)。

### 規則(人已逐條拍板,實作不得改動語意)

| # | 規則 | 現況 |
|---|---|---|
| A1 | 「續約(接續原效期)」永遠可選,不因過期多久而消失 | ❌ 要改 |
| A2 | 一筆 1200 = 一年,從前一期到期日的**隔天**起算(台灣日曆日);算出來仍在過去也照給,**不做 `greatest(now(), …)` 補救** | ✅ 已符合 |
| A3 | 付款後若新到期日仍在過去 → 仍是 expired → 回結帳頁再選一次,重複到到期日 > 今天 | ✅ 已符合 |
| A4 | 補繳完成後保留原週年日 | ✅ 已符合 |
| A5 | 每一輪都可改選「換上代」(fresh,從付款日起算,立刻生效) | ✅ 已有 |
| A6 | 補繳每一筆都發三代獎金(補 3 年 = 上代拿 3 次) | ✅ 已符合 |
| A7 | 結帳頁**事前揭露總額**與**補繳進度** | ❌ 新增 |
| A8 | 過期者不得用免費續約 credit 復活,須先付費恢復 active | ✅ 維持不變 |

### 驗收情境

**AC-1(核心,必須成為測試案例)** 到期 2024-04-02、2026-05-02 登入:

| 付款 | 起算 | 新到期日 | 帳號狀態 |
|---|---|---|---|
| 第 1 筆 | 2024-04-03 | 2025-04-02 | 仍 expired |
| 第 2 筆 | 2025-04-03 | 2026-04-02 | 仍 expired |
| 第 3 筆 | 2026-04-03 | 2027-04-02 | ✅ active |

**AC-2** 上述使用者在**付第一筆之前**,結帳頁就看得到「已過期 2 年 1 個月;
接續原效期需補繳 3 筆共 3,600 元,或新約 1,200 元立即生效」。

**AC-3** 付完第 1 筆回到結帳頁,看得到「已補至 2025-04-02,還差 2 筆」,
而不是一個沒有前後文、看起來像扣款失敗的付款頁。

**AC-4** 上述使用者在任何一輪都能改選新約 1,200 立即生效。

**AC-5** 補 3 筆 → 上代(及其上二代)各拿 3 次推薦獎勵;任務計數 **不** 增加
(pair-history,該下線早已計過)。

### 不做什麼

- **不做「上代配對線」**(換上代開新線、帳本歸零、樹走訪跳過已離開者、
  配對歷史與任務計數分離)——schema 級改動,單獨規劃單獨上線。
- **不做一次付清 N 年的合併訂單**——人已確認維持「一筆 1200 一年、付 N 次」。
- **不為 A8 開例外**——過期者手上有免費續約 credit 仍須先自費補繳到 active。

## 2. 系統設計

### 資料流(不變)

`/payuni/prepare`(建單,寫入 `payment_orders.renewal_mode`)
→ PayUni → `/payuni/return` or `/webhooks/payuni/notify`
→ `process_successful_payment`(付款當下才依 `renewal_mode` 決定效期錨點)

**效期算術完全不動。** `process_successful_payment` 的 extend 錨點
(`tw_day(max(end_date)) + 1`,`20260718000001:201-207`)本來就是字面執行、
不做 now() 補救,補繳制要的正是這個行為。本 feature 不得改動這段。

### API 變更

**`POST /payuni/prepare`** — 移除「接續後效期仍在未來」的拒絕
(`supabase/functions/api/index.ts:1400-1405`)。

保留 `!lastSub?.end_date` → 「沒有可接續的訂閱紀錄,請選擇新約」
(`index.ts:1392-1394`):extend 仍需曾是會員,這條不是時效限制。

**`GET /subscriptions/status`** — 新增 `renewal` 區塊:

```ts
renewal: {
  extendAnchorDate: string;   // 'YYYY-MM-DD' 台灣日,下一筆的起算日
  extendEndDate:    string;   // 'YYYY-MM-DD' 下一筆付完的到期日
  backfillCount:    number;   // 還要付幾筆才會 active(active 時為 0)
  backfillAmount:   number;   // backfillCount × YEARLY_PRICE
}
```

理由見 §3「單一事實來源」。契約同步寫進 `_shared/api-contract.ts`。

### 資料庫變更

**無 migration。** 純屬 Edge Function 守衛與前端顯示的變更。

### 併發缺口(見 §7 風險 R1)

`process_successful_payment` 只鎖 `payment_orders`(以 `transaction_id` 為鍵,
`20260718000001:178-183`),**沒有 user 層級的鎖**。同一使用者的兩筆不同訂單
若並行付款完成,兩者可能都讀到相同的 `max(end_date)`,各自 insert 出**相同
效期**的訂閱——付了 2,400 只得一年。

現有的 `subscriptions_payment_transaction_id_unique`
(`20260716000006:54`)擋的是「同一筆 trade_no 被寫兩次」,擋不到這個。

這個洞今天就存在,但幾乎打不到(舊規則下 extend 一輩子最多用一次)。
補繳制讓「連續付 N 筆」變成常態操作,使用者雙開分頁或連點就會踩到。
**是否納入本 feature 見 §6 開放問題 Q1。**

## 3. 架構影響

### 動到的模組

| 檔案 | 改動 |
|---|---|
| `supabase/functions/api/index.ts` | `/payuni/prepare` 拆守衛;`/subscriptions/status` 加 `renewal` |
| `supabase/functions/_shared/api-contract.ts` | `renewal` 型別 |
| `supabase/functions/api/tw-dates.ts` | 新增 `backfillPlan()` 純函式 |
| `src/utils/twDate.ts` | 同上(Deno/node 隔離,見下) |
| `src/components/PaymentCheckout.tsx` | 移除 `canExtend` 限制;新增揭露與進度 UI |
| `src/hooks/useSubscription.ts` | 型別擴充 |

不動路由、不動 appShell、不涉及 multi-step-flow 四契約(本頁不是多步驟表單,
是單頁結帳)。

### 單一事實來源

現況的病:`canExtend` 在前端(`PaymentCheckout.tsx:296-300`)與後端
(`index.ts:1379-1406`)各實作一份同語意邏輯。補繳制要再加「還差幾筆」,
放著不管就是第三、第四份。

`src/utils/twDate.ts` 與 `supabase/functions/api/tw-dates.ts` 是既有的
**刻意重複**(node / Deno runtime 隔離,`@contract` alias 只搬得動不依賴
執行環境的純型別/常數)。本專案對這種重複已有既定解法:
`_shared/name-validation-cases.ts` ——**實作各留一份,測試案例表共用一份**,
用機械把關兩份實作不漂移。

採同一模式:
1. `backfillPlan(endDate, now)` 純函式,兩側各實作一份
2. 案例表放 `supabase/functions/_shared/backfill-cases.ts`,兩側測試都吃它
3. 後端 `/subscriptions/status` 回傳算好的結果,**前端顯示一律用回傳值**,
   前端那份實作只服務於「送單前的樂觀顯示」

第 3 點是關鍵:讓後端成為顯示的事實來源,順手把現有 `canExtend` 的雙實作
問題也收掉。

### 效能/安全

- `/subscriptions/status` 多回四個純計算欄位,無額外查詢。
- 拆掉的是**便利性守衛**不是**安全守衛**:extend 的效期由後端在付款當下
  自算,從不信任前端傳入的日期(§6.2 既有設計),拆掉不擴大攻擊面。
- 使用者最多只能把自己的效期往前補到「原到期日 + N 年」,每年都真金白銀
  付過 1,200,不存在套利。

## 4. UI/UX

對照 `docs/ui-ux-guidelines.md`;行動版優先。

### 揭露卡片(新增,置於「續費方式」選項之上)

過期會員一進結帳頁就先看到總額,**在按下第一筆付款之前**:

> 你的會籍已於 **2024-04-02** 到期,已過期 **2 年 1 個月**。
> - **接續原效期**:需補繳 **3 筆**,共 **NT$3,600**,補完到期日為 2027-04-02
> - **新約**:**NT$1,200** 立即生效,效期至 2027-05-01(可更換推薦碼)

`backfillCount === 1` 時退化成單筆的一般敘述,不出現「補繳」字樣——
沒缺席的人不該看到補繳語彙。

### 補繳進度(新增)

`backfillCount >= 1` 且已付過至少一筆時,選項卡片內顯示:

> 已補至 **2025-04-02**,還差 **2 筆**(NT$2,400)

這條是本 feature 的 UX 核心:**付完錢畫面還叫他付錢,體感等同扣款失敗。**
沒有它,規則 A3 就是一個客訴產生器。

### 移除

`canExtend` 為 false 時的「會籍已過期超過一年,無法接續原效期」提示
(`PaymentCheckout.tsx:656-660`)整段刪除——該情境不再存在。

### 狀態

- 載入:`/subscriptions/status` 未回前,兩個選項卡片走既有 skeleton
- 錯誤:取不到 `renewal` 時**隱藏揭露卡片、兩個選項都照常可選**
  (降級為現行體驗,不阻斷付款)
- 空態:首購(`isRenewal === false`)完全不顯示本區塊,與現行一致

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `backfillPlan()` 純函式 + 共用案例表 | `api/backfill-plan.unit.test.ts`(Deno,免 DB)、`src/utils/twDate.test.ts`(vitest node);兩者共吃 `_shared/backfill-cases.ts` | AC-1 三筆的錨點/迄日/筆數全中;跨年、閏日(2024-02-29 到期)、剛好今天到期、未滿一年各一例 |
| 2 | 後端拆守衛 | `api/renewal-modes.test.ts`(需 DB) | 過期 3 年送 `renewalMode:'extend'` → 200 建單;付款完成後 `end_date` = 原到期日 + 1 年(仍在過去)、`user_account_status` 仍 `expired`。**既有 `renewal-modes.test.ts:171-184` 的「過期超過一年被拒絕」斷言要反轉** |
| 3 | `/subscriptions/status` 回傳 `renewal` | `api/subscriptions-status.test.ts`(需 DB) | 過期 2 年 1 個月的使用者拿到 `backfillCount:3`、`backfillAmount:3600`、`extendEndDate:'2025-04-02'`;active 使用者拿到 `backfillCount:0` |
| 4 | 前端拆 `canExtend` + 揭露卡片 | `PaymentCheckout.test.tsx`(vitest + jsdom pragma) | 過期 3 年時 extend 選項可見且可選(AC-4);顯示「補繳 3 筆共 NT$3,600」(AC-2);`renewal` 缺漏時降級不阻斷 |
| 5 | 補繳進度顯示 | 同上 | 已付一筆後顯示「已補至 2025-04-02,還差 2 筆」(AC-3);`backfillCount === 1` 不出現補繳語彙 |
| 6 | 規格書同步 | `python3 scripts/check-spec-drift.py` | §5.1 末條「失效超過一年只能走新約」刪除;§6.2 表格「適用」欄改寫;綠 |

階段 1 先行是刻意的:算術是本 feature 唯一容易算錯的部分,先用純函式(秒級、
免 `supabase start`)把 AC-1 釘死,後面三個階段都只是把它接出去。

**AC-5(補繳每筆都發獎、任務不 +1)不另立階段**——它是既有行為,階段 2 的
整合測試順帶斷言即可;若一寫就綠,照 progress.md 的「逃生口 1」記錄後跳過。

## 6. 開放問題

- [ ] **Q1:併發缺口(§2 末)要不要納入本 feature?**
  兩筆並行付款可能讓使用者付 2,400 只得一年。今天已存在但幾乎打不到,
  補繳制讓它變成常態路徑。
  (a) 納入 —— 在 `process_successful_payment` 算錨點前加 user 層級鎖
  (`select … from profiles where id = p_user_id for update`,與
  `apply_referral_side_effects` 同模式),多一個階段。
  (b) 不納入 —— 另開 `fix/` 走 `/fix-bug`,但**本 feature 不該先上**,
  否則等於主動把使用者推向這個洞。
  **傾向 (a)**:補繳制正是讓它可觸發的原因,同一個 PR 補上防線比較誠實。

- [ ] **Q2:補繳筆數要不要設上限?**
  規則沒有上限,過期 10 年就是 10 筆 12,000。要不要在超過某個年數時
  改推新約、或顯示更強的提示?目前規劃**不設限**,照規則直接呈現。

- [ ] **Q3:`backfillCount` 大時的付款體驗**
  規劃維持「付 N 次、每次走完整 PayUni 流程」。若 N ≥ 5 這是很長的路徑,
  但合併訂單已被明確排除(§1「不做什麼」)。此處只確認:**維持逐筆,不做
  任何簡化**,對嗎?

## 7. 風險與回滾

**R1(高):並發付款導致效期少算。** 見 §2 末與 Q1。
最壞情況是使用者付了錢沒拿到對應效期——金錢正確性問題。
偵測:`subscriptions` 同一 user 出現兩列 `end_date` 相同。
緩解:Q1(a)。

**R2(中):使用者付完第一筆以為就好了。**
最壞情況是客訴與退款要求。緩解就是 A7 的揭露卡片與進度顯示——所以
階段 4、5 **不是** 可以砍掉的「UI 收尾」,是這個 feature 的一半。

**R3(低):既有測試斷言反轉時改錯方向。**
`renewal-modes.test.ts:171-184` 現在斷言「過期超過一年被拒絕」。
反轉時若順手把整個 test case 刪掉,就失去對新行為的覆蓋。
緩解:階段 2 明列「反轉而非刪除」。

### 回滾

程式面:把 `index.ts` 的拒絕分支與前端 `canExtend` 條件加回去即可,
單一 commit revert,無 migration、無資料轉換。

資料面:回滾**不需要**清理已產生的訂閱列。補繳期間每一筆付款都是獨立的
`subscriptions` insert,效期算術與現行規則一致,回滾後這些列仍然正確——
只是那些使用者不能再繼續補下去。

> 一個誠實的但書:回滾後,補到一半的使用者會卡在「付了 2 筆仍過期、
> 且不能再接續」的狀態,只能走新約。真要回滾必須同時決定怎麼處置他們
> (退款或人工補效期)。這使得 R1 更值得在上線前就處理掉。
