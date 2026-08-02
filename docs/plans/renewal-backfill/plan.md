# 補繳式續約(renewal-backfill)規劃書

> **版本:第 4 版**(2026-08-02)。第 1 輪 P0×3/P1×9/P2×4 → 第 2 版;
> 第 2 輪 P0×1/P1×11/P2×4 → 第 3 版;**Q10/Q11 裁決新增「選新約不填碼 →
> 套用預設推薦碼」規則(A10-A12)→ 本版**。已裁決:Q1=(a)、Q2=不設限、
> Q3=逐筆、P0=方案(b)、Q4=不收斂、Q5=中性文案、Q6=不做召回、Q7=(a)、
> Q10=保證預設碼存在、Q11=文案不解釋機制。版本差異見 §8。
>
> ⚠️ **本版擴大了 feature 範圍**(新增 A10-A12,階段從 **9 個變 11 個**)。
> 待裁決:Q8(上線時序)、Q9(清空揭露與兩個邊界)、Q12(預設推薦人是否
> 排除推薦王計數)、Q13(原上代失去下線是否通知)。**須重跑 `/review-plan`。**

## 0. 一句話

這個 feature 讓**過期超過一年的會員**能用「續約(接續原效期)」逐年補繳回來,
因為現行規則直接封死這條路,把想回來的舊會員一律推去新約。

> ⚠️ §0 第 2 版原本寫「保住原本的推薦線與週年日」。查證後**推薦線不受影響**
> ——`/payuni/prepare` 只在 `renewalMode === 'fresh' && referredByCode` 兩條件
> 同時成立時才改寫上代(`index.ts:1414`)。extend 的真正價值是**保住累積的
> 點數與任務進度**(見 §6 Q7),但那條規則屬於另一包、目前尚不存在(§6 Q8)。

## 1. 使用者需求

對照規格書 §5.1(失效語意)、§6.2(續約雙模式)——**這兩節與本 feature 直接
衝突,須在同一個 PR 改寫(§5 階段 11)**。

### 規則(人已逐條拍板,實作不得改動語意)

| # | 規則 | 現況 |
|---|---|---|
| A1 | 「續約(接續原效期)」永遠可選,不因過期多久而消失;**不設筆數上限** | ❌ 要改 |
| A2 | 一筆 1200 = 一年,從前一期到期日的**隔天**起算(台灣日曆日);算出來仍在過去也照給,**不做 `greatest(now(), …)` 補救** | ✅ 已符合 |
| A3 | 付款後若新到期日仍在過去 → 仍是 expired → 使用者被帶回結帳頁再選一次,重複到到期日 > 今天 | ❌ 要改 |
| A4 | 補繳完成後保留原週年日 | ✅ 已符合 |
| A5 | 每一輪都可改選「換上代」(fresh,從付款日起算,立刻生效) | ✅ 已有 |
| A6 | 補繳每一筆都發三代獎金(補 3 年 = 上代拿 3 次) | ✅ 已符合 |
| A7 | 結帳頁**事前揭露總額**與**補繳進度** | ❌ 新增 |
| A8 | 過期者不得用免費續約 credit 復活,須先付費恢復 active | ✅ 維持不變 |
| A9 | 每一筆付款各自建立一列 `subscriptions`,**不做合併訂單** | ✅ 已符合 |
| A10 | 續約選**新約(fresh)且未填推薦碼** → **套用平台預設推薦碼**,`referred_by_is_default = true` | ❌ 要改 |
| A11 | 預設推薦碼解析失敗(未設定/無效/推薦人停權/自我推薦)→ **維持原上代不變 + 告警**,不阻斷金流 | ❌ 新增 |
| A12 | 預設推薦碼的可用性須為**可見狀態**,不能只靠事後告警 | ❌ 新增 |

> **A10 的語意**:選新約 = 不要原本的樹了。所以不填碼不等於「維持原狀」,
> 而是「離開原上代」——比照首購未填碼的既有行為(綁預設推薦人)。
> 要留在原上代必須**主動填入原本的推薦碼**(見 §2 情境表 S9)。

### 驗收情境

**AC-1(核心)** 到期 2024-04-02、2026-05-02 登入:

| 付款 | 起算 | 新到期日 | 帳號狀態 |
|---|---|---|---|
| 第 1 筆 | 2024-04-03 | 2025-04-02 | 仍 expired |
| 第 2 筆 | 2025-04-03 | 2026-04-02 | 仍 expired |
| 第 3 筆 | 2026-04-03 | 2027-04-02 | ✅ active |

**必須用真實 DB 連續打三次驗證**——第 2/3 筆的錨點要接在前一筆**實際寫入**
的 `end_date` 上(§5 階段 3)。

**AC-2** 付第一筆之前,結帳頁就看得到:已過期 2 年 1 個月;接續原效期需
補繳 3 筆共 NT$3,600、補完到期日 2027-04-02;新約 NT$1,200、效期至 2027-05-01。

**AC-3** 付完第 1 筆、PayUni 導回後,**不進入開通輪詢/逾時錯誤畫面**,而是
看到補繳進度與明確去路。回到結帳頁後看得到「已補至 2025-04-02,還差 2 筆」。

**AC-4** 任何一輪都能改選新約 1,200 立即生效。

**AC-5** 補 3 筆 → 上代(及上二代)各拿 **3 次**獎勵;任務計數 **不** 增加。

**AC-6** 同一使用者兩筆訂單並行付款完成時,**不會**算出相同效期。

**AC-7** 補繳中途關頁、之後從任何入口回來,都能接續看到正確進度。

**AC-8** 曾用 extend 續約過、之後自然再到期、本輪尚未付款的使用者,
`hasPaidAnyBackfill` 必須是 `false`(不得顯示「已補至…」)。

**AC-9(A10)** 小明原上代是 A,選新約**不填碼** → 付款後上代變成**預設推薦人 P**,
且 `referred_by_is_default = true`(前端據此隱藏該碼)。

**AC-10(A10)** 小明原上代是 A,選新約**填 A 自己的碼** → 上代仍是 A(留在原樹)。
與 AC-9 的差別只在有沒有填碼,結果完全不同。

**AC-11(A11)** 預設推薦碼未設定/無效/推薦人停權時,小明選新約不填碼 →
**上代維持 A 不變**,不阻斷付款,並寫入一筆 `system_alerts`。

### 不做什麼

- 不做「上代配對線」(換上代開新線、帳本歸零、樹走訪跳過已離開者)——另案
- 不做合併訂單(A9)、不設補繳筆數上限(A1)、不為 A8 開例外
- **不做中途放棄者的召回機制**(Q6 裁決:先上線觀察流失率)
- **不收斂 `twDate.ts` / `tw-dates.ts` 雙副本**(Q4 裁決)
- **不做**「原上代失去下線時的通知」(Q13)、**不改**推薦王對 P 的計數(Q12)

## 2. 系統設計

### 資料流

`/payuni/prepare`(建單,寫 `payment_orders.renewal_mode`)
→ PayUni → **導回 `${frontendUrl}/payment/result?tradeNo=…&status=…`**
(`index.ts:2033,2074`)→ `/payuni/return` or `/webhooks/payuni/notify`
→ `process_successful_payment`

**效期算術不動**——extend 錨點本來就字面執行、不做 now() 補救,補繳制要的
正是這個行為。

### 資料庫變更:一支 migration(Q1(a) 裁決)

> ⚠️ **基準 = `20260720000001_wave4_guards.sql:383-495`,不是 `20260718000001`。**
> `process_successful_payment` 在 wave4 又被 `create or replace` 過一次
> (檔名序最新,其後無 migration 再動)。兩版唯一差異:
> - `20260718000001:248` → `apply_referral_side_effects(p_user_id, v_sub_id)`
> - `20260720000001:479` → `apply_referral_side_effects(p_user_id, v_sub_id, **v_paid_at**)`
>
> 第三個參數是「推薦王月份 key 錨定付款時點」的修法。本 repo 慣例是
> 「基準 = X,唯一差異」逐字複製再改——**抄錯基準會靜默回退一個影響所有
> 付款路徑的 bug,不只本 feature**。

**缺口**:該函數只 `for update` 鎖 `payment_orders`(鍵為 `transaction_id + user_id`);
算 `v_anchor_day` 時對 `subscriptions` 是無鎖的 `select max(end_date)`。同一使用者
兩筆不同訂單並行完成時,兩者可能讀到相同的 max,各自寫出**相同效期**——付了
2,400 只得一年。

`apply_referral_side_effects` 雖鎖 `profiles`,但那是在訂閱已 insert **之後**
才拿到,鎖不住。`subscriptions_payment_transaction_id_unique` 鍵在
`payment_transaction_id`,兩筆不同 trade_no 撞不到。

**觸發路徑不只「雙開分頁」**——`complete_paid_pending_orders`
(`20260716000007:113-120`)與 `/internal/reconcile-pending-payments`
(`index.ts:1766-1829`)都直接呼叫同一支函數。

**修法**:在算 `v_anchor_day` **之前**加

```sql
perform 1 from public.profiles where id = p_user_id for update;
```

鎖序「先 `payment_orders`(依 trade_no,各筆不同)→ 後 `profiles`(依 user_id)」;
`apply_referral_side_effects` 稍後在同一交易內重入同一列鎖不阻塞,**不構成
死鎖環**(兩輪 reviewer 皆已覆核)。

### API 變更

**`POST /payuni/prepare`** — 移除「接續後效期仍在未來」的拒絕(`index.ts:1400-1405`)。
保留 `!lastSub?.end_date` → 「沒有可接續的訂閱紀錄,請選擇新約」(`:1392-1394`)。

**`GET /subscriptions/status`** — `data` 新增 `renewal`:

```ts
renewal: {
  extendAnchorDate:     string;  // 'YYYY-MM-DD' 下一筆的起算日
  extendEndDate:        string;  // 'YYYY-MM-DD' 下一筆付完的到期日
  backfillCount:        number;  // 還要付幾筆才會 active(active 時 0)
  backfillAmount:       number;  // backfillCount × YEARLY_PRICE
  backfillFinalEndDate: string;  // 'YYYY-MM-DD' 補滿後的最終到期日
  expiredForMonths:     number;  // 已過期的完整月數(active 時**固定 0**)
  hasPaidAnyBackfill:   boolean; // 本輪是否已付過補繳(定義見下)
} | null                          // 從未訂閱過 = null
```

**`GET /payuni/result/:tradeNo`** — 依 P0 裁決方案 (b),回應新增**精簡版**
`renewal`(只需 `backfillCount`、`extendEndDate`、`backfillAmount`),供
`PaymentResult.tsx` 判斷是否為補繳中間筆。選 (b) 不選「掛 `useSubscription()`」
的理由見 §3。

契約兩者都寫進 `supabase/functions/_shared/api-contract.ts`。

### 上代寫入機制:改法 B(A10-A12)

**現況的三個寫入點**(全 repo 只有這三處會動 `profiles.referred_by_*`):

| # | 位置 | 時機 | 條件 |
|---|---|---|---|
| W1 | `/auth/register`(`index.ts:619-620`) | 註冊填資料 | 寫入使用者填的碼;**沒填就寫 null** |
| W2 | `apply_referral_side_effects` 3a-bis(`20260726000102:103-105`) | **付款成功** | 只在 `referred_by_user_id is null` 才進 |
| W3 | `/payuni/prepare` fresh 分支(`index.ts:1414,1427-1434`) | 續約建單 | 只在 `fresh` **且** `referredByCode` 有值 |

**預設推薦人現況只對首購生效**,被兩道關卡各擋一次:
W2 的 `v_referrer1 is null`(已有上代就不進),以及 `resolve_default_referrer`
的 `is_renewal is distinct from false`(`20260726000101:73-75`)——而
`is_renewal := exists(select 1 from subscriptions where user_id = …)`
(`20260720000001:426`),第二筆付款以後恆為 `true`。

**改法 B:只動 W3,不新增 migration。**

```
現在:  if (renewalMode === 'fresh' && referredByCode) { …驗證→換線… }

改成:  if (renewalMode === 'fresh') {
         if (referredByCode) {
           // 使用者親自填碼:validate_referral_code → 換到該碼主人
           // referred_by_is_default = false
         } else {
           // A10 未填碼:讀 reward_config.default_referrer_code
           //   → validate_referral_code(同一把尺)
           //   → 自我推薦護欄
           //   → 換到預設推薦人,referred_by_is_default = **true**
           // A11 任一步失敗 → 維持原上代 + logSystemAlert,不阻斷金流
         }
       }
```

**為什麼不動 SQL**:`resolve_default_referrer` 內含首購判準,且需要
`p_subscription_id`(建單當下訂閱還沒建),不適用於這條路徑。要沿用它就得
改簽名 + 放寬首購判準,而它是金流函數的一環、有五個呼叫點——動它的風險
遠高於在 W3 組合三個既有零件。

**不會產生第二份真相**:碼是否合法的唯一判準仍是 `validate_referral_code`
——填碼那條路徑本來就在呼叫它(`index.ts:1416`)。W3 新增的只有「讀 config」
(比照 `getRewardConfig` 的既有模式,`index.ts:179-191`)與一個自我推薦比較,
不重新實作驗證邏輯。告警走 Edge 端既有的 `logSystemAlert`(`index.ts:1610`),
用**專屬 reason**(如 `default_referrer_unavailable_on_fresh`),不複製
`resolve_default_referrer` 的 `suspended` / `code_invalid` 分類。

> ⚠️ **實作陷阱**:W3 目前寫死 `referred_by_is_default: false`(`index.ts:1432`),
> 因為原本只在「使用者親自填碼」時才走。**未填碼那一支必須設 `true`**,
> 否則 `/profile` 回的 `isAutoReferral`(`index.ts:393`)會是 false,
> 前端(`PaymentCheckout.tsx:672`)就會把使用者不該知道的預設推薦碼顯示在
> placeholder 上——正好違反 Q11 的裁決。

**A12 的落點**:`default_referrer_code` 目前**只能人工 SQL UPDATE**
(`20260726000101:36` 明寫「不由 migration 寫入」),沒有 admin UI 可以掛
即時驗證。因此把可用性做成 `/health`(`index.ts:3330`)的一個欄位:
`defaultReferrer: 'ok' | 'unset' | 'invalid'`。理由:部署後本來就會打
`/health` 比對 `sha`(CLAUDE.md 部署 SOP),順帶就看得到這個狀態,
不必等 `system_alerts` 事後才知道機制已經靜默失效。

### 情境全表(A10 生效後)

登場人物:小明(使用者)、A/B(其他會員)、P(平台預設推薦人)

**首購**(史上第一筆付款,行為不變)

| # | 情境 | 結果 |
|---|---|---|
| S1 | 註冊填了 A 的碼 | 上代 = A(註冊當下寫入,不等付款) |
| S2 | 註冊沒填碼,P 有效 | **付款成功那刻**綁 P,`isAutoReferral = true` |
| S3 | 註冊沒填碼,平台沒設預設碼 | 沒有上代(A12 要讓這件事可見) |
| S4 | 註冊沒填碼,P 停權/碼失效 | 沒有上代 **+ 告警** |
| S5 | P 本人首購沒填碼 | 自我推薦護欄擋下,P 沒有上代 |

**續約**(第二筆以後)

| # | 情境 | 現況 | A10 生效後 |
|---|---|---|---|
| S6 | 原上代 A,選 **extend** | 上代 = A | **不變**(extend 無換線路徑) |
| S7 | 原上代 A,選 **fresh 不填碼** | ⚠️ 上代仍是 A | ✅ **上代變成 P** |
| S8 | 原上代 A,選 fresh + 填 B 的碼 | 上代 = B | 不變 |
| S9 | 原上代 A,選 fresh + **填 A 自己的碼** | 上代仍是 A,但 `is_default` 被翻成 false | 不變(這是**留在原樹的唯一方法**) |
| S10 | 選 fresh + 填無效碼 | 400 建單失敗 | 不變 |
| S11 | 選 fresh + 填自己的碼 | 400「不能使用自己的推薦碼」 | 不變 |
| S12 | **原本就沒有上代**的舊會員,選 fresh 不填碼 | ⚠️ 仍然沒有上代(`is_renewal` 擋掉預設推薦人) | ✅ **綁上 P**——A10 順帶修好這個缺口 |
| S13 | 原上代 A,選 fresh 不填碼,但 P 此刻失效 | (不適用) | **上代維持 A + 告警**(A11) |

### `hasPaidAnyBackfill` 的定義(第 2 版的定義是壞的)

第 2 版定義為「目前 `expired`,且最新一筆 `completed` 訂單的
`renewal_mode = 'extend'`」。**這個定義無法分辨「本輪」**:對一個目前過期的人,
「最新一筆 completed 訂單」必然就是產生他現在這個已過期 `end_date` 的那一筆,
不論那是本輪補繳的一筆、還是上一輪正常續約後自然到期。

而 `extend` 是既有**預設選項**(`PaymentCheckout.tsx:303-307` 的
`canExtend ? 'extend' : 'fresh'`),所以**任何續約過兩次以上的老會員**這次又
過期時,即使一筆都還沒付也會被判成 `true`。

**新定義**:利用補繳付款的獨有特徵——**付款當下算出的效期已經在過去**。

> `hasPaidAnyBackfill` ⟺ 最新一筆 `subscriptions` 的 `end_date` <
> 其 `source_payment_order_id` 對應訂單的 `completed_at`

逐案驗證:

| 情境 | 最新訂閱 end_date vs 付款時點 | 結果 |
|---|---|---|
| 正常續約後自然到期 | end_date = 付款後一年 > completed_at | `false` ✅ |
| 首購(fresh) | end_date 在未來 > completed_at | `false` ✅ |
| 補繳第 1 筆後 | 2025-04-02 < 2026-05-02 | `true` ✅ |
| 補繳最後一筆後 | 2027-04-02 > 2026-05-02 | `false`,且已 active 不顯示 ✅ |
| 曾補繳完成、之後自然再到期(**AC-8**) | 最後那筆的 end_date 在未來 | `false` ✅ |

## 3. 架構影響

### 動到的模組

| 檔案 | 改動 |
|---|---|
| **`supabase/migrations/<新>_payment_user_lock.sql`** | 加 user 層級鎖(基準 = `20260720000001`) |
| `supabase/functions/api/index.ts` | `/payuni/prepare` 拆守衛 + **fresh 未填碼套用預設推薦碼(A10/A11)**;`/subscriptions/status` 加 `renewal`;**`/payuni/result/:tradeNo` 加精簡 `renewal`**;**`/health` 加 `defaultReferrer` 狀態(A12)** |
| `supabase/functions/_shared/api-contract.ts` | 兩個 `renewal` 型別 |
| `supabase/functions/_shared/backfill-cases.ts` | **新增**:兩側共用案例表 |
| `supabase/functions/api/tw-dates.ts` / `src/utils/twDate.ts` | 各新增 `backfillPlan()`(雙副本,Q4 裁決) |
| `src/components/PaymentResult.tsx` | 區分補繳中間筆;過渡態;新 CTA |
| `src/components/PaymentCheckout.tsx` | 移除 `canExtend`;**`extendAnchorDay`/`extendEndDay` 改吃契約值**;揭露與進度 UI |
| `src/hooks/useSubscription.ts` | `renewal` 型別;**修正過時的模組註解** |
| `e2e/features/payment_checkout.feature` + `e2e/steps/common_steps.py` | **反轉**舊斷言 |
| `e2e/features/renewal_backfill_recovery.feature` | **新增**:四契約回歸測試 |
| `e2e/journey/features/60_time_scenarios.feature` + `steps/f60_*.py` + `tools/seed_time_machine.py` | **反轉**舊斷言(見下方警告) |
| `e2e/journey/README.md`、`docs/e2e-journey-test-design.md` | 同步舊行為描述 |

> ⚠️ **journey 測試只在 develop→main 晉升 PR 才跑**(30-90 分鐘)。
> `60_time_scenarios.feature:50-55` 等三檔斷言了「過期超過一年僅能新約」,
> 漏改的話**不會在階段 1-10 任何一次 CI 被抓到**,而是在晉升 PR 跑到一半才紅
> ——是所有測試落點裡發現最晚的一個。本機不能跑 journey,但離線可用
> `cd e2e/journey && pytest --collect-only -q` 做健全性檢查。

### `renewal` 怎麼接進兩個頁面

**PaymentCheckout → 掛 `useSubscription()`**
1. 該 hook 已走 `apiClient.ts`,不必延續現有裸 `fetch` 的舊債
2. 它匯出的 `refresh()` 正是 AC-3 需要的(既有 5 秒輪詢只打 `/auth/profile`)
3. 單例陷阱不成立:`/payment/checkout` 是獨立路由(`App.tsx:370-377`),
   react-router 同時只掛一個 `<Route>`,不會與 `MemberDashboard.tsx:22` /
   `RewardDashboard.tsx:25` 同屏

連帶:`canExtend` 移除;**`extendAnchorDay`/`extendEndDay`(`:296-300`)也一併
改吃 `renewal.extendAnchorDate`/`extendEndDate`**。這條不能漏——`pendingUser`
優先讀 `localStorage`(`:104-108`),既有 5 秒輪詢**不會** `setPendingUser`,
所以付完一筆回來時,既有文案「效期自 X 接續,至 Y」(`:630-633`)會顯示
**付款前**算出的舊值,與同頁「已補至…還差 2 筆」並排出現、互相矛盾。

**PaymentResult → 擴充 `GET /payuni/result/:tradeNo`(方案 b)**

不掛 `useSubscription()` 的理由:該 hook 是 stale-while-revalidate
(`useSubscription.ts:82-93`),而 `DataCacheProvider` 會從 `sessionStorage`
復原**付款前**的快取(`DataCacheContext.tsx:140-149`)。PayUni 導回是整頁重載:
- 中間筆:「還差 N 筆」短暫顯示錯一格,數百毫秒自我修正
- **最後一筆**:舊快取的 `backfillCount` 仍是 1,會把**剛付完、已經 active**
  的使用者導向「還差 1 筆」——是本 feature 想修的誤判的鏡像版

方案 (b) 天生每次都是新請求,沒有快取新鮮度問題;且該頁本來就在打這支端點。

### multi-step-flow 四契約:適用,逐條檢查

`docs/multi-step-flow-recovery.md:71` 的盤點表已把「付款(PaymentCheckout /
PayUni 回跳)」列入管轄,判準是「需要連續多步才能完成」,與是否 wizard 無關。

| 契約 | 結論 |
|---|---|
| 1. 狀態可從後端查詢 | ✅ `renewal` 即是 |
| 2. 每一步都有可重入的入口 | ✅ 但要有 e2e 證明(階段 10) |
| 3. 失敗訊息區分可復原/不可復原,永遠給下一步 | ❌ **要補**——補繳中間筆正是被誤分類成不可復原的可復原狀態 |
| 4. 外部副作用先驗身分 | ✅ `/payuni/prepare` 走 `requireAuth` |

### 效能/安全

- 兩支端點多回純計算欄位,無額外查詢
- 拆掉的是**便利性守衛**不是安全守衛:效期由後端在付款當下自算
- 新增的鎖是 row-level,範圍限單一使用者的付款交易期間

## 4. UI/UX

行動版優先(375px 基準)。

### 付款結果頁 `PaymentResult.tsx`

**現況為什麼會壞**:`:154-173` 的邏輯是「`resolvedStatus === 'success'` 但
`accountStatus !== 'active'`」→ 45 秒輪詢(`MAX_ACTIVATION_POLLS=15` ×
`ACTIVATION_POLL_INTERVAL_MS=3000`)→ 逾時後(`:267-316`)顯示「開通處理中…
比預期久一些」+「重新確認」(只重跑同一迴圈)與「聯繫客服」,**沒有任何按鈕
回得了結帳頁**。補繳制刻意讓第 1~N-1 筆付款後仍 expired,不改就是把正常終態
顯示成故障。

**改法**:在進入輪詢分支**之前**先判斷:

```
orderStatus === 'completed' && renewal.backfillCount > 0
  → 跳過輪詢與逾時分支,顯示補繳進度
```

畫面內容(**必須包含訂單編號與付款保證句**,與同檔其他狀態
`:283-289`、`:500-505` 的既有風格對齊):

> ✅ 付款成功,已補至 **2025-04-02**
> 訂單編號:UK20260502xxxx
> 你的會籍仍在補繳中,還差 **2 筆**(NT$2,400)才會生效。
> 這筆款項已完成,不會重複扣款。
> 〔繼續補繳〕〔稍後再說〕

- **繼續補繳** → `/payment/checkout`
- **稍後再說** → **導向 `/`,並顯示 toast**,沿用 `handleCancel`
  (`PaymentCheckout.tsx:454-459`)的既有模式。
  **不可導向任何會員頁**——`RequireMembershipRoute.tsx:41` 寫死「曾有訂閱、
  已過期 → `/payment/checkout`」,補繳中的人 `accountStatus` 永遠 expired,
  會被立即彈回結帳頁:剛按「不想繼續」就被抓回去,比留在原頁更糟。

**過渡態(關鍵)**:`orderStatus` 的既有抓取是**一次性、不重試**的——
`:96-117` 的 pending-recheck effect 開頭是 `if (statusParam) return`,而 PayUni
導回**一律帶 `status`**,所以那個 effect 永遠被跳過;`orderStatus` 只在 `:73-92`
抓一次。若掛載當下 webhook 還沒把訂單寫成 `completed`(差幾百毫秒就夠),
新分支不成立 → 直接落回舊的 45 秒輪詢 → 逾時撞進「聯繫客服」。

→ `orderStatus` 仍 `pending` 時**短暫沿用既有輪詢作橋接**,待 `orderStatus`
與 `renewal` 到位後**切換到新分支**,而不是直接落入舊逾時錯誤分支。

**本頁三態**:載入(既有 skeleton)、`renewal` 取得失敗(顯示付款成功 +
訂單編號 + 「進度暫時無法讀取」+ 重試,**不落回逾時錯誤畫面**)、
空態(非補繳情境走原有分支,不回歸)。

### 結帳頁揭露卡片(A7)

**中性並列雙方事實,不加說服性文案**(Q5 裁決,理由見 §6 Q7):

> 你的會籍已於 **2024-04-02** 到期,已過期 **2 年 1 個月**。
> - **接續原效期**:補繳 **3 筆**,共 **NT$3,600**,補完到期日 2027-04-02
> - **新約**:**NT$1,200**,效期至 2027-05-01(可更換推薦碼)

**退化分支**(`hasPaidAnyBackfill === false && backfillCount === 1`)——
**必須仍包含到期日**,因為既有 `CardDescription`(`:565-569`)那句要移除:

> 你的會籍已於 **2026-04-02** 到期。
> - **接續原效期**:**NT$1,200**,效期至 2027-04-02
> - **新約**:**NT$1,200**,效期至 2027-05-01(可更換推薦碼)

不出現「補繳」字樣。判準用 `hasPaidAnyBackfill` 而非 `backfillCount === 1`
——已付 2 筆、只剩 1 筆的人 `backfillCount` 同樣是 1,用數值判斷會讓揭露卡片
說「一般續約」、進度卡片說「還差 1 筆」,同頁打架。

**避免重複**:移除既有 `CardDescription` 那句;選項卡片內的效期敘述只講
「下一筆」;總額與最終到期日只在揭露卡片講一次。

### 新約選項的文案(Q11 裁決)

A10 生效後,「不填碼」的後果從「維持原狀」變成「離開原上代」——這個改變
必須在使用者做選擇之前講清楚。但**不解釋「預設推薦碼」這個機制**
(Q11 裁決:對使用者而言那就是沒有上一代)。

新約選項卡片內、推薦碼輸入欄上方:

> 選擇新約會**重新建立推薦關係**。
> 若要留在原本的推薦人底下,請填入他的推薦碼;**不填則不會有推薦人**。

不出現「預設推薦碼」「平台帳號」等字眼。輸入欄的 placeholder 維持既有
邏輯(`PaymentCheckout.tsx:670-675`:`isAutoReferral` 為 true 時不顯示原碼)
——A10 寫入時 `referred_by_is_default = true`,所以下次進來一樣不會洩漏。

### 補繳進度(A7)

`hasPaidAnyBackfill === true` 時,選項卡片內顯示:

> 已補至 **2025-04-02**,還差 **2 筆**(NT$2,400)

### 結帳頁狀態

- 載入:既有 skeleton
- 錯誤(**付款前**):取不到 `renewal` → 隱藏揭露卡片、兩選項照常可選
- 錯誤(**付款後**,`hasPaidAnyBackfill === true`):**不靜默降級**,顯示
  「進度暫時無法讀取」+ 重試按鈕(`refresh()`)。理由:PayUni 導回是整頁重載,
  而本專案使用者以 LINE 內建瀏覽器為主(`browserDetection.ts` 已有既有處理),
  這正是最容易引發客訴的時刻,防線不能在此無聲失效
- 空態:`renewal === null`(首購)完全不顯示本區塊

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `process_successful_payment` 加 user 層級鎖(migration,**基準 = `20260720000001`**) | `api/payment-user-lock.test.ts`(需 DB) | **AC-6**:**用兩條 `npm:postgres@3` 原生連線 + `Promise.allSettled`,比照 `process-payment-concurrency.test.ts:23-29,51-61`**(走 `.rpc()` 的 HTTP 開銷會把執行時間點拉開,測不出 race window)。兩列 `subscriptions` 的 `end_date` **不相同**、第二筆正確接續;既有付款測試全綠 |
| 2 | `backfillPlan()` 純函式 + `_shared/backfill-cases.ts` | `api/backfill-plan.unit.test.ts`(Deno,免 DB)、`src/utils/twDate.test.ts`(vitest node);共吃同一案例表 | AC-1 三筆錨點/迄日/筆數;`backfillFinalEndDate`、`expiredForMonths` 正確;邊界:跨年、**閏日(2024-02-29)**、**非閏年月底(1/31 → 目標月 30 天)**、剛好今天到期、未滿一年、`endDate === null`、**active 時 `expiredForMonths` 固定 0** |
| 3 | 後端拆守衛 | `api/renewal-modes.test.ts`(需 DB) | 過期 3 年送 `extend` → 200;**連續打三次真實付款**,三列迄日依序 2025/2026/2027-04-02,前兩次仍 `expired`、第三次 `active`(**AC-1 端到端**);同輪斷言三代獎勵各 3 筆、`task_progress` 不增(**AC-5**)。**既有 `:171-184` 的斷言要反轉,不是刪除** |
| 4 | **A10/A11:fresh 未填碼套用預設推薦碼** | `api/fresh-default-referrer.test.ts`(需 DB) | **AC-9**:原上代 A、fresh 不填碼 → `referred_by_user_id = P`、`referred_by_code` = 預設碼、**`referred_by_is_default = true`**;**AC-10**:填 A 自己的碼 → 仍是 A(且 `is_default = false`);**AC-11**:預設碼未設定/無效/推薦人停權/自我推薦四種各一例 → **上代維持 A 不變**、建單仍成功(不阻斷金流)、`system_alerts` 有一筆;**S12**:原本無上代的舊會員 fresh 不填碼 → 綁上 P;**S6**:extend 不論填不填碼都不動上代 |
| 5 | **A12:`/health` 回報預設推薦碼可用性** | `api/health-default-referrer.test.ts`(需 DB) | `defaultReferrer` 三態正確:有效 → `'ok'`;`default_referrer_code` 為 null/空 → `'unset'`;碼不存在或推薦人停權 → `'invalid'`。**不得因此讓 `/health` 失敗**(該端點必須永遠回得了話,見 `index.ts:434-439` 的既有原則) |
| 6 | 兩支端點回傳 `renewal` | `api/subscriptions-status.test.ts` + `api/payuni-result-renewal.test.ts`(需 DB) | 過期 2 年 1 個月 → `backfillCount:3`、`backfillAmount:3600`、`extendEndDate:'2025-04-02'`、`backfillFinalEndDate:'2027-04-02'`、`expiredForMonths:25`;active → `backfillCount:0`、`expiredForMonths:0`;從未訂閱 → `renewal:null`;已付一筆補繳 → `hasPaidAnyBackfill:true`;**AC-8**:曾 extend 續約、本輪未付款 → `hasPaidAnyBackfill:false` |
| 7 | `PaymentResult.tsx` 區分補繳中間筆 | `PaymentResult.test.tsx`(vitest + jsdom) | **AC-3**:`completed` 且 `backfillCount>0` → 不啟動輪詢、不顯示逾時錯誤、顯示進度 + 訂單編號 + 保證句 + 兩個 CTA;「稍後再說」導向 `/`;**`orderStatus` 仍 `pending` 時走橋接輪詢,資料到位後切到新分支**;`backfillCount===0` 但非 active → 走原輪詢(不回歸);`renewal` 取得失敗 → 顯示重試而非逾時錯誤 |
| 8 | 前端接 `useSubscription()` + 拆 `canExtend` + 揭露卡片 + **新約文案** | `PaymentCheckout.test.tsx`;`e2e/features/payment_checkout.feature` + `common_steps.py` | **AC-4**:過期 3 年時 extend 可見可選;**AC-2** 三個數字全中;**`extendAnchorDay`/`extendEndDay` 顯示的是契約值,不是 `localStorage` 舊值**;`renewal===null` 整塊隱藏;**Q11 文案**:新約選項顯示「不填則不會有推薦人」,且**不出現「預設推薦碼」字樣**;`isAutoReferral` 為 true 時 placeholder 不洩漏原碼。**反轉 `payment_checkout.feature:30-34` 該 scenario 與 `common_steps.py:64-73` 的 step** |
| 9 | 補繳進度 + 付款後錯誤態 | `PaymentCheckout.test.tsx` | 已付一筆後顯示「已補至 2025-04-02,還差 2 筆」;退化分支**不出現補繳語彙但仍顯示到期日**;`hasPaidAnyBackfill:true` 且抓取失敗 → 重試而非靜默降級 |
| 10 | 四契約回歸測試 | `e2e/features/renewal_backfill_recovery.feature`(CI `e2e-tests` 軌) | **AC-7**,且**必測這兩個中斷點**:(a) 剛付完第 1 筆、人還停在 `PaymentResult.tsx` 未點任一 CTA 就關閉分頁 → 重新進入應接續;(b) 已補 N 筆中的 M 筆、從不同入口回來 → 結帳頁顯示「還差 X 筆」而非從頭起算 |
| 11 | journey 測試 + 規格書 + 註解同步 | `cd e2e/journey && pytest --collect-only -q`(離線健全性)+ `python3 scripts/check-spec-drift.py` + **人工核對** | **反轉** `60_time_scenarios.feature:50-55`、`f60_time_scenarios_steps.py:193-205`、`seed_time_machine.py:67`;同步 `e2e/journey/README.md:165`、`docs/e2e-journey-test-design.md:16,229`;§5.1 末條刪除;**§6.2 表格下方散文刪除**;§6.2 表格「適用」欄改寫(**併同修正 fresh 列本來就不準的敘述**);**把 A1-A5、A7、A9 寫進 §5.1/§6.2 正文**;**把 A10-A12 寫進 §7.4 預設推薦人章節**(該節目前只描述首購,須擴寫成「首購 + 續約選新約未填碼」);附錄補一列指向新 migration 與 `backfill-cases.ts`;`useSubscription.ts:9-12` 註解更新 |

**階段 1 先行**:金錢正確性防線,且獨立於其他階段——先補好洞,後面拆守衛時
才不會有一段「規則已放寬但防線未到位」的窗口。

**階段 11 不能只看 CI 綠燈**:`check-spec-drift.py` 只做常數/路由/列舉/路徑四類
機械抽取,**不比對自由散文,也不查「內容有沒有新增」**。若只刪不增,規格書會
從「有一條規則(已過時)」退化成「這塊完全空白」,比修訂前更難溯源——而
plan.md 是鷹架、PR 前要刪,**規格書是 A1-A9 唯一還留得住的地方**。

## 6. 開放問題

> Q1-Q3(第 1 輪)、P0 方案、Q4-Q6(第 2 輪)、Q7、**Q10/Q11** 均已裁決,
> 見 `review.md`。
>
> **Q10 裁決:保證預設推薦碼永遠存在。** 落實為三層——(1) A12 把可用性做進
> `/health`,讓它是可見狀態而非事後告警;(2) A11 的降級是「維持原上代 +
> 告警」,不清成 null(資料還在,人工補正得回來)、不阻斷金流(與
> `resolve_default_referrer` 既有的「任何例外一律視同無推薦人,不阻斷金流」
> 一致);(3) 既有的 `system_alerts` 告警保留。
> 註:`default_referrer_code` 目前只能人工 SQL UPDATE,**沒有 admin UI**
> 可掛即時驗證,所以第 (1) 層才是主要防線。
>
> **Q11 裁決:文案不解釋機制。** 只講「不填則不會有推薦人」,不出現
> 「預設推薦碼」字樣——對使用者而言那就是沒有上一代(見 §4)。

- [x] **Q7 已裁決:(a) 接受現狀,照 A1-A9 實作。**

  第 3 版曾質疑 extend 永遠是劣勢選項(同價或更貴、涵蓋期更短)。人裁決 (a),
  並指出該質疑的**前提不完整**:比較時只算了「效期 vs 價格」,漏掉帳本。

  **extend 的真正價值 = 保住累積的點數與任務進度**;選新約(fresh)則清空。
  過期期間下線持續付款、上代照常入帳(§5.1、`pay_referral_generations` 不
  檢查上線狀態),累積越多,extend 的價值越高——「帳號裡有足夠多的點數與
  任務完成獎勵,使用者就會願意付錢重啟」。

  ⚠️ **但「fresh 清空帳本」這條規則目前不存在**,它屬於另一包(上代配對線)。
  Feature 1 單獨上線時 fresh 不會清空,extend 在那段期間仍是劣勢選項。
  **時序問題見 §6 Q8。**

- [ ] **Q8(新):「fresh 清空帳本」要不要與本 feature 同時上線?**

  Q7 成立的前提是「選 fresh 會清空點數與任務」。該規則屬於另一包
  (上代配對線,schema 級)。若本 feature 先單獨上線:
  - extend 在過渡期仍是純劣勢選項,理性使用者全選 fresh
  - 更糟:使用者會養成「選 fresh 沒差」的認知,另一包上線後突然開始清空,
    是很傷的預期落差

  方向:
  (a) 兩包合併上線——但另一包是 schema 級,會拖很久
  (b) 本 feature 先上,接受過渡期 extend 沒人選
  (c) **把「fresh 清空帳本」單獨抽出來與本 feature 同時上** ——它不依賴
      「線」的概念,只需要一個帳本世代標記(或 reset 時間戳),比整包小很多
  (d) 調換順序,另一包先上

  **傾向 (c)**:歸零規則是 extend 存在意義的來源,與補繳制是同一個產品邏輯
  的兩半,拆開會讓上線初期的 extend 變成死選項。

- [ ] **Q12(新,A10 的連帶後果):預設推薦人 P 要不要排除在推薦王計數之外?**

  A10 生效後,每個「選新約不填碼」的人都掛到 P 底下。若對 P 是全新配對,
  P 的 `task_progress` +1;當月滿 8 位就發一張「免費續約一年」credit
  (`reconcile_king_credits`)。若 P 是平台自己的帳號,等於平台持續發 credit
  給自己。是刻意的還是副作用?若不是,P 需要被排除在推薦王計數(甚至三代
  獎金)之外——那會是 `apply_referral_side_effects` 的新分支,不在本版範圍。

- [ ] **Q13(新,A10 的連帶後果):原上代 A 失去下線時要不要通知?**

  A10 讓「換走」的門檻大幅降低——以前要主動填碼才會換,現在什麼都不填就會。
  A 未來拿不到這個下線的三代獎金,而且完全不會被通知。這是既有 fresh 換線
  就有的性質,但觸發頻率會顯著上升。本版**不做通知**;若要做,屬另案。

- [ ] **Q9(新):選 fresh 前的清空揭露,以及兩個邊界**

  若 Q8 採 (a)/(c),結帳頁必須在使用者按下「新約」**之前**明確顯示將清空
  多少點數與哪些任務進度。這比第 2 輪 Q5 問的「要不要說明補繳價值」更重要
  ——**這才是可以誠實陳述的補繳價值**。兩個邊界要定義:
  1. **補繳中途改選**:付了 2 筆 extend(2,400)保帳本,第 3 筆改選 fresh
     → 點數仍歸零。等於花 2,400 買兩年效期然後把帳本丟了,UI 必須在那一刻警告。
  2. **待審提領**:過期期間送出提領、審核中,選 fresh 歸零時那筆如何處置?
     第 1 輪 Q2 答過「作廢但提醒」,但當時觸發條件是「換上代」,改為「選 fresh」
     後範圍大得多。

## 7. 風險與回滾

**R1(高 → 已處置):並發付款導致效期少算。** 階段 1 的 user 層級鎖 + AC-6。
偵測:`subscriptions` 同一 user 出現兩列 `end_date` 相同。

**R2(高):補繳中間筆被誤判成系統故障。** 緩解:階段 5、6、7。
**這三個階段不是 UI 收尾,是這個 feature 的一半。**

**R2b(中,Q6 已裁決):逐筆流程本身的疲勞與放棄率。**
Q3 裁決逐筆後,過期 N 年要重複 N 次「結帳頁 → PayUni → 結果頁 → 回結帳頁」。
即使每一輪都正確運作,N 次完整結帳流程在行動裝置/LINE 內建瀏覽器上仍是實質
負擔。目前的進度提示只有一行「已補至 X,還差 N 筆」,沒有整體進度呈現。
**Q6 裁決:本次不做召回機制,先上線觀察流失率。** 記錄於此,不讓
「風險隨年數線性放大」只服務於半個風險。若觀察到高放棄率,再另案處理。

**R3(中):規格書散文殘留造成自我矛盾,且機械檢查抓不到。** 緩解:階段 9 人工核對。

**R4(中):舊行為斷言散在 5 個檔案,漏改的最晚在晉升 PR 才紅。**
緩解:階段 8(前端 e2e)與階段 11(journey 三檔 + 兩份文件)分別承接。

**R5(低):既有測試斷言反轉時改錯方向(整個刪掉)。** 緩解:階段 3、8 明列
「反轉而非刪除」。

**R6(高,A10 新增):`referred_by_is_default` 設錯值會洩漏預設推薦碼。**
W3 目前寫死 `false`;未填碼那一支若沿用,`/profile` 的 `isAutoReferral` 會是
false,前端就把使用者不該知道的預設推薦碼顯示在 placeholder 上——直接違反
Q11。緩解:階段 4 的 AC-9 明確斷言 `referred_by_is_default = true`。

**R7(中,A10 新增):「不填碼」的語意反轉,老使用者會被沉默換樹。**
A10 之前不填碼 = 維持原上代;之後 = 離開原上代。同一個操作、相反的結果。
緩解:階段 8 的 Q11 文案(「不填則不會有推薦人」)必須在選項卡片上、
在使用者按下付款之前就看得到。**這條的代價是不可逆的**——推薦樹歸屬一旦
寫下去,只能人工補正。

### 回滾

**程式面**:把 `index.ts` 的拒絕分支與前端 `canExtend` 加回去,單一 commit revert。
階段 1 的 migration **不需要回滾**——user 層級鎖是純防禦性強化,在舊規則下同樣
正確,留著只有好處。

**資料面**:不需要清理已產生的訂閱列。每一筆付款都是獨立 insert,效期算術與
現行規則一致,回滾後這些列仍然正確。

> 誠實的但書:回滾後,補到一半的使用者會卡在「付了 2 筆仍過期、且不能再接續」,
> 只能走新約或人工補效期。真要回滾必須同時決定怎麼處置他們。

## 8. 版本差異

### 第 3 版 → 第 4 版(依 Q10/Q11 裁決)

| 項目 | 第 3 版 | 本版 |
|---|---|---|
| **A10** | — | **新增**:fresh 未填碼 → 套用預設推薦碼(改法 B,只動 W3,無 migration) |
| **A11** | — | **新增**:預設碼解析失敗 → 維持原上代 + 告警,不阻斷金流 |
| **A12** | — | **新增**:`/health` 回報 `defaultReferrer` 三態,讓可用性是可見狀態 |
| §2 | 無上代寫入機制的說明 | 新增「上代寫入機制:改法 B」與 **S1-S13 情境全表** |
| §4 | 無新約選項文案 | 新增 Q11 文案(「不填則不會有推薦人」,不解釋機制) |
| §5 | 9 階段 | **11 階段**(新增階段 4 = A10/A11、階段 5 = A12) |
| §7 | R1-R5 | 新增 **R6**(`is_default` 設錯會洩漏預設碼)、**R7**(不填碼語意反轉) |
| 驗收 | AC-1~AC-8 | 新增 **AC-9/AC-10/AC-11** |
| 開放問題 | Q8、Q9 | 新增 **Q12**(P 要不要排除推薦王計數)、**Q13**(原上代要不要通知) |
| 規格書 | 階段 9 只改 §5.1/§6.2 | 階段 11 **併同擴寫 §7.4 預設推薦人**(目前只描述首購) |

### 第 2 版 → 第 3 版(依第 2 輪審查 P0×1/P1×11/P2×4 + 人審裁決)

> 下表的階段編號是**第 3 版當時的 9 階段編號**,與本版的 11 階段不對應,
> 保留原文以維持可追溯性。以 §5 現行表格為準。

| 項目 | 第 2 版 | 本版 |
|---|---|---|
| **P0** PaymentResult 接線 | 只有目標行為,無資料流 | 方案 (b):擴充 `/payuni/result/:tradeNo` 回精簡 `renewal`;§3 說明不選 (a) 的理由(SWR 舊快取會在最後一筆誤判) |
| **P1** migration 基準 | 引用 `20260718000001` | 改為 `20260720000001_wave4_guards.sql:383-495`,並警告抄錯會回退 `v_paid_at` |
| **P1** `hasPaidAnyBackfill` | 定義無法分辨「本輪」 | 改用「最新訂閱 `end_date` < 對應訂單 `completed_at`」;新增 AC-8 反例 |
| **P1** `orderStatus` 一次性抓取 | 未處理 | §4 新增橋接過渡態;階段 5 補測試情境 |
| **P1** 舊斷言散在 5 檔 | R4 只抓 1 個 | §3 模組表列全部;階段 6、9 分別承接;加 journey 晚爆警告 |
| **P1** 併發測試技術 | 未指定 | 階段 1 明訂兩條原生 postgres 連線 |
| **P1** 階段 9 只刪不增 | 只刪 | 新增「把 A1-A5、A7、A9 寫進規格書正文」 |
| **P1** `extendAnchorDate` | 未指名取代本地計算 | §3 明訂一併改吃契約值;階段 6 補驗證 |
| **P1** 「稍後再說」導向 | 未定義 | 導向 `/` + toast,沿用 `handleCancel` 模式 |
| **P1** 退化分支文案 | 缺範例 | §4 補完整範例,含到期日 |
| **P1** 階段 8 場景 | 一句話 | 明列兩個必測中斷點 |
| **P1** R2 只講半個風險 | — | 新增 R2b + Q6 結論 |
| **P2** ×4 | — | 月底案例、`expiredForMonths` active 固定 0、訂單編號與保證句、附錄索引 |
| **Q4/Q5/Q6** | 開放 | 全數裁決並成文 |
| **Q7** | — | **已裁決 (a)**:extend 的真正價值是保住累積的點數與任務進度(第 3 版原分析漏算帳本);同時查明「不填推薦碼 ≠ 套用預設推薦人」,對續約者是維持原上代 |
| **Q8/Q9** | — | **新增待裁決**:「fresh 清空帳本」的上線時序;清空前的揭露與兩個邊界 |

### 第 1 版 → 第 2 版

見 `review.md` 第 1 輪處置節。摘要:P0-1 `PaymentResult.tsx` 未列入、
P0-2 PaymentCheckout 接線只有結論、P0-3 併發缺口留白;另補
`backfillFinalEndDate`/`expiredForMonths`、四契約逐條檢查、`lastSub === null`
邊界、連續三筆整合測試、§6.2 散文、退化條件改判準、付款後降級重試。
