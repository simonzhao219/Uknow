# 補繳式續約(renewal-backfill)規劃書審查報告

由 `/review-plan` 彙整四個 fresh-context reviewer subagent 的發現而成。
**聚合者不改判**——severity 一律以 reviewer 原判為準;兩位 reviewer 對同一
缺口給不同 severity 時保留較高者並註記分歧,不自行折衷。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1 | 2 | 0 | A8 credit 守衛、`pay_referral_generations` 冪等、`repair_orphaned_payments` 粒度、效期算術(AC-1 手算)、`resolveCheckoutPageRedirect` |
| 架構 | 1 | 3 | 1 | `_shared/name-validation-cases.ts` 模式引用正確、appShell/路由 lazy、`renewal_mode` 現況描述、既有測試引用、測試命名分軌 |
| UI/UX | 1 | 3 | 2 | 模式一致性、BottomNav/資訊架構、a11y |
| 需求 | 1 | 4 | 2 | **A1–A8 逐條對照 code 全部準確**、「不做什麼」界定明確 |

**去重後:P0 × 3、P1 × 9、P2 × 4。**

> 一個正面結論值得記下:需求視角逐條讀 code 驗證了 §1 的 A1–A8 標記
> (✅ 已符合 / ❌ 要改 / ✅ 已有 / ✅ 維持不變)**全部準確,無腦補、無偷加碼、
> 無偷縮水**。規則忠實度沒有問題;三個 P0 全部落在「規劃沒把設計做完」。

---

## 發現清單(依嚴重度排序)

### P0(阻擋)

**[P0]〔§3 動到的模組 / §4 / AC-3〕`PaymentResult.tsx` 未列入受影響模組,其開通輪詢會把每一筆非最終補繳付款誤判成系統故障 → 必須新增此檔的改動階段**
*(UI/UX 與需求兩個視角各自獨立發現,判定一致)*

PayUni 導回一律落在 `${frontendUrl}/payment/result`(`index.ts:2033,2074`),
**不是規劃書 AC-3 說的「回到結帳頁」**。而 `PaymentResult.tsx:154-173` 的邏輯是:
`resolvedStatus === 'success'` 但 `accountStatus !== 'active'` → 啟動輪詢
(`MAX_ACTIVATION_POLLS=15` × `ACTIVATION_POLL_INTERVAL_MS=3000` ≈ 45 秒),
畫面顯示「付款成功,正在開通會員資格」(236-263);逾時後(267-316)顯示
「開通處理中…比預期久一些」+「重新確認」(293-301,只重跑同一個 45 秒迴圈)
與「聯繫客服」,**沒有任何按鈕能回到結帳頁**。

依規則 A3,補繳制下第 1~N-1 筆付款完成後 `accountStatus` **永遠**停留
`expired`——那不是收斂延遲,是設計上的正常終態。但現有頁面把它當異常,
還主動暗示系統故障。使用者要先撐過一段偽裝的載入動畫、再撞見一個偽裝的
錯誤畫面,才可能誤打誤撞被送回結帳頁。

這正好打穿規劃書 §7 R2 那條防線:§4 設計的揭露卡片與補繳進度,在補繳制下
**每一筆非最終筆都走不到**。

→ 新增階段明確改動 `PaymentResult.tsx`:區分「補繳規則下的正常 expired 終態」
與「真正的開通收斂延遲」(例如 `orderStatus === 'completed'` 且
`renewal.backfillCount > 0` 時直接顯示補繳進度 +「返回結帳頁繼續補繳」CTA,
完全跳過輪詢與逾時分支),並補對應測試。

---

**[P0]〔§3 單一事實來源 / §5 階段 4-5〕「後端成為顯示的事實來源」只有結論、沒有機制——PaymentCheckout 目前根本不呼叫 `/subscriptions/status`**
*(架構判 P0;系統就同一缺口判 P1,依聚合規則保留較高者並註記分歧)*

`PaymentCheckout.tsx` 現況完全不呼叫 `/subscriptions/status`、也不用
`useSubscription()`——`isRenewal`/`canExtend`/`extendAnchorDay` 全部算自
`pendingUser.subscriptionEndDate`(來源 `/auth/profile`,`PaymentCheckout.tsx:104-149`、
`296-300`)。`useSubscription()` 的唯二呼叫點是 `MemberDashboard.tsx:22` 與
`RewardDashboard.tsx:25`。

規劃書 §3 只寫「`useSubscription.ts`:型別擴充」,完全沒交代 `renewal` 資料
怎麼接進 PaymentCheckout。這不是實作細節——沒有這條線,§3 宣稱的「順手收掉
`canExtend` 雙實作」根本無法成立:實作者很可能就地在 `pendingUser` /
`/auth/profile` 上加欄位繼續走原路,產生規劃書自己想避免的**第三份實作**。
§5 階段 4 的驗證標準「`renewal` 缺漏時降級不阻斷」也預設了一個目前不存在的
資料流。

另需交代:AC-3 的「付完一筆後補繳進度即時更新」怎麼觸發 refresh——既有的
5 秒輪詢只打 `/auth/profile`,不會帶動 `renewal` 更新。

→ 規劃需定案串接方式(走 `useSubscription()` 還是獨立呼叫),且必須走
`src/utils/apiClient.ts`,不延續現有裸 `fetch` 的舊債。

---

**[P0]〔§2 併發缺口 / §6 Q1 / §7 R1〕併發缺口分析屬實且範圍比規劃書描述更廣,但解法仍是「開放問題」留白、無決議無階段 → Q1 必須在本次人審定案並回填,不能帶著開放問題進 TDD**

規劃書自陳的缺口經覆核**完全正確**:
- `process_successful_payment`(`20260718000001:178-183`)只 `for update` 鎖
  `payment_orders`;算 `v_anchor_day` 時(`:200-208`)對 `subscriptions` 是
  plain `select max(end_date)`,**無鎖**。
- `apply_referral_side_effects` 確實鎖 `profiles`
  (`20260726000102:72-76`),但那是在 `process_successful_payment` 呼叫它
  **之後**(`20260718000001:247-248`)——此時錨點已算完、訂閱已 insert,鎖不住。
- `subscriptions_payment_transaction_id_unique`(`20260716000006:54-56`)鍵在
  `payment_transaction_id`,兩筆不同 trade_no 撞不到。

**比規劃書描述更廣**:這個 race 不只發生在「使用者雙開分頁」。
`complete_paid_pending_orders`(`20260716000007:113-120`)與
`/internal/reconcile-pending-payments`(`index.ts:1766-1829`)都直接呼叫同一支
`process_successful_payment`,對同一使用者的不同 pending 訂單各自補完時,
**同樣沒有 user 級鎖保護**。補繳制讓一人多筆 pending 成為常態後,這些自癒/
對帳路徑撞在一起的機率也跟著上升。

但 §2 明寫「無 migration」、§3 模組表只列 Edge Function/前端、§5 六個階段
沒有一個承接它。照現狀開工,`/tdd-implement` 很容易只做已拍板的部分而把 Q1
無限期擱置——**而 R1 是規劃書自己承認的金錢正確性問題**。

→ 本次人審必須把 Q1 定案(reviewer 建議 (a)),並回填 §2(移除「無 migration」
斷言)、§3(補 migration 檔案)、§5(新增階段,測試落點含一支能重現 race 的
整合測試),再重跑審查。

> reviewer 補充驗證(供決議參考):若選 (a),鎖的取得順序是「先
> `payment_orders`〔依 trade_no,各筆不同〕→ 後 `profiles`〔依 user_id〕」,
> `apply_referral_side_effects` 在同一交易內對已持有的 `profiles` 鎖屬**可重入**,
> 不會自我死鎖;兩個不同訂單的並行呼叫不會互相持有對方需要的資源,**不構成
> 死鎖環**。此方向技術上可行。

---

### P1(應改)

**[P1]〔§2 API 變更 / §4 揭露卡片〕契約缺「補滿 N 筆後的最終到期日」欄位——規劃書自己的例子就對不上**
*(UI/UX 與需求兩個視角各自獨立發現)*
§2 契約註解明寫 `extendEndDate // 下一筆付完的到期日`,但 §4 範例文案(同一位
AC-1 使用者)寫「補完到期日為 **2027-04-02**」——AC-1 表格顯示「下一筆」算出來
是 2025-04-02。契約沒有任何欄位能表達最終到期日,實作時要嘛違反 §3 原則在前端
另算一份,要嘛回頭補契約。
→ `renewal` 補一個 `backfillFinalEndDate`(或同義)欄位,由 `backfillPlan()` 一併算出。

**[P1]〔§4 揭露卡片 / AC-2 / §5 階段 1、4〕「已過期 X 年 Y 個月」是全新算法,資料來源與測試落點雙缺**
*(架構與需求兩個視角各自獨立發現)*
`twDate.ts` / `tw-dates.ts` 現有匯出裡沒有「兩個台灣日曆日相差幾年幾月」的
helper,`renewal` payload 四個欄位也不含它。§5 階段 1 的驗證標準只列
「錨點/迄日/筆數」,階段 4 只引了 AC-2 後半段(筆數金額)——AC-2 前半段
「已過期 2 年 1 個月」完全沒有出現在任何階段的測試落點。
→ 決定放後端 payload 或前端純函式(比照 `backfillPlan()` 走共用案例表),並列進階段。

**[P1]〔§2 資料庫變更 / §6 Q1〕「無 migration」與 Q1「傾向 (a)」自相矛盾,且 plan.md 與 progress.md 給出不一致的答案**
§2 明寫「無 migration」,但 Q1(a) 必然要新增 migration 改
`process_successful_payment`。`progress.md:17-18` 已預先注記「若裁決為 (a),
需在階段 2 之前插入一個階段」,但 plan.md 本文 §2 沒有同步這個但書。
→ §2 至少補條件句,避免只讀 §2 就動工的人以為保證免 migration。

**[P1]〔§3 架構影響〕排除 multi-step-flow 四契約的理由過窄,漏了該文件強制的回歸測試**
`docs/multi-step-flow-recovery.md:71` 的盤點表**已把「付款(PaymentCheckout /
PayUni 回跳)」列為受契約管轄的連續流程**。該文件的判準是「需要連續多步才能
完成」,不是「同一頁面內是不是 wizard 表單」——規劃書用「本頁不是多步驟表單,
是單頁結帳」排除,理由不成立。補繳制讓使用者要跨多次(可能跨天跨 session)
才能從 expired 走到 active,正落在管轄範圍。該文件 §5 明訂新流程要補一支
「中途關頁再回來」的 e2e regression(`:150-153`),本規劃六個階段都沒有。
→ 明確走一次四契約檢查(多半能過),並補「中途離開再回來」的回歸測試落點。

**[P1]〔§2 API 變更 / §5 階段 3〕`renewal` 在「從未訂閱過」(`lastSub === null`)時的欄位值未定義**
`/subscriptions/status` 的查詢用 `.maybeSingle()`(`index.ts:2101-2106`),
從未訂閱者會是 `null`。階段 3 只涵蓋「過期 2 年 1 個月」與「active」兩種情境。
前端雖會用 `isRenewal === false` 隱藏整塊,但那只是前端降級——後端
`backfillPlan()` 對 `null` end_date 的行為若沒定義,漏判會讓端點直接 500。
→ 階段 1 案例表與階段 3 驗證標準各補一條「無歷史訂閱時 renewal 回傳 ___」。

**[P1]〔§5 階段 2 / AC-1、AC-5〕沒有任何階段明訂「連續 3 筆真實付款」的整合測試**
階段 1 是純函式測試,每次呼叫互相獨立、模擬不同的 `now`,**不會驗證**「用真實
DB 連續打 3 次 `process_successful_payment`,第 2/3 筆的錨點是否正確接在前一筆
**實際寫入**的 `end_date`」——在有 R1 併發風險的情況下,這正是最需要真實整合
測試證明的部分。階段 2 的驗證標準只寫單筆情境。§5 末段說 AC-5 由「階段 2 的
整合測試順帶斷言」,但階段 2 自己的驗證標準沒提「連續多筆」或「獎勵計次」,
兩處對不上——AC-5 的覆蓋只存在於一句「順帶」的承諾裡。
→ 階段 2 驗證標準明訂連續三筆,並斷言三代獎勵各發 3 次、任務不 +1。

**[P1]〔§5 階段 6〕漏掉規格書 §6.2 表格下方那段描述舊拒絕行為的散文,且機械檢查抓不到**
§6.2 表格下方寫「…失效超過一年者選 extend 會『付了錢效期仍在過去』,
`/payuni/prepare` 直接拒絕(前端也不顯示該選項)。」——正是本 feature 要移除的
行為。但階段 6 的驗證標準只寫「§5.1 末條刪除;§6.2 表格『適用』欄改寫;綠」。
`scripts/check-spec-drift.py` 只做常數/路由/列舉/路徑四類機械抽取,**不比對
自由散文**,所以「綠燈」不能保證這段被清掉。照現有驗證標準做完,CI 綠,但
§6.2 會自我矛盾。
→ 階段 6 驗證標準明列這段散文。

**[P1]〔§4 補繳進度 / `backfillCount === 1` 退化規則〕退化條件只看數值,會讓同一頁出現互相矛盾的用語**
§4 說「`backfillCount === 1` 時退化成單筆的一般敘述,不出現『補繳』字樣」,
理由是「沒缺席的人不該看到補繳語彙」——但這理由只適用於「原本就只差 1 年」的人。
**已經付了 2 筆、只剩最後 1 筆**的使用者此刻 `backfillCount` 同樣是 1:揭露卡片
會隱藏補繳字樣顯示成普通續約,而同一頁的補繳進度卡片(觸發條件是
「`backfillCount >= 1` 且已付過至少一筆」)卻會明講「已補至…還差 1 筆」。
→ 退化條件改用「是否已付過任何一筆」,而非單純數值。

**[P1]〔§4 狀態—錯誤〕`renewal` 抓取失敗的降級,恰好與補繳流程風險最高的時刻重疊**
§4 的「取不到 `renewal` 時隱藏揭露卡片、兩個選項照常可選」沒有排除「使用者剛
付完一筆、正需要看到補繳進度」的情境。PayUni 導回是瀏覽器層級跳轉(整頁重載),
`/subscriptions/status` 要重新打;而本專案使用者以 LINE 內建瀏覽器為主
(`src/utils/browserDetection.ts` 已有既有處理)。若這次請求剛好失敗,使用者會
完全看不到進度,退化成看似首次選擇的畫面——**正是 §7 R2 認定最容易引發客訴的
時刻,規劃卻讓最重要的防線在這個時刻最可能無聲失效**。
→ 此情境至少提供重試或明確的「進度暫時無法讀取,請重新整理」提示。

---

### P2(建議)

**[P2]〔`src/hooks/useSubscription.ts:9-12`〕既有註解明文寫死「沒有『取消／恢復／補繳／寬限期』」,與本 feature 直接矛盾**
*(UI/UX 與需求兩個視角各自獨立發現)*
§3 列了此檔但理由只寫「型別擴充」。本 feature 名稱正是「補繳式續約」,這句話
上線後會變成錯誤陳述——正是 CLAUDE.md 反覆強調要避免的「留著會被誤當規格」的
舊描述。

**[P2]〔§4〕揭露卡片與既有續費選項卡片資訊重複,手機版造成不必要的長捲動**
結帳頁已有選項卡片顯示「效期自 X 接續,至 Y」(`PaymentCheckout.tsx:630-633`)、
CardDescription 已顯示「您的會籍已於 {date} 到期」(563-570)。新增揭露卡片再講
一次,且兩處資料來源不同(一個算全部補完後、一個算下一筆)、文案不同,在 375px
版面(`e2e/test_overflow_sweep.py` 巡檢寬度)上等於同類資訊分兩處各講一次。

**[P2]〔§3〕`twDate.ts` / `tw-dates.ts` 的雙副本可能是可避免的技術債,不是不可繞過的邊界**
兩份檔案目前皆**零外部 import**(只用 `Intl.DateTimeFormat`/`Date`),條件與
`_shared/api-contract.ts`、`_shared/name-validation-cases.ts` 完全相同。檔案
docstring 宣稱「兩邊不能互相 import」——但這只在「Deno 讀 `src/`」方向成立;
「前端讀 `supabase/functions/_shared/**`」這個反方向,`@contract` / `@name-cases`
兩個既有 alias 已證明可行且是本專案慣例。規劃把既有重複定性為「既定解法,照做
即可」,但這個「既定解法」本身可能只是歷史遺留。這次要在兩邊各加一個新函式,
是重新檢視、順手收斂的好時機。
→ 不收斂不算錯(共用案例表能攔輸出漂移,但攔不住「單邊忘記實作整段邏輯」),
但值得讓人**知情地**選擇要不要付這筆債,而不是預設蕭規曹隨。

**[P2]〔§5 階段 6〕規格書 §6.2 表格「新約(fresh)」列的「適用」欄在本 feature 之前就已經不準**
`index.ts:1379` 的 fresh 分支(1408-1439)完全沒有「限失效超過一年才能選」的
守衛,前端「新約」按鈕(`PaymentCheckout.tsx:637-654`)也沒有顯示限制——fresh
其實一直都能選。但 §6.2 表格寫「新約(fresh) | 適用:首購,或失效超過一年」。
這不是本 feature 造成的落差,但階段 6 剛好要動這張表,值得一併修正,而不只是
刪掉「或失效超過一年」幾個字。

---

## 需人工裁決

- **〔UI/UX〕揭露卡片文案要不要主動回答「我沒用到的那幾年為什麼要付錢」?**
  目前只陳列「筆數 × 金額」,沒有說明補繳換到什麼(保留原推薦線與週年日)。
  §0 已點出這是本 feature 存在的理由,但這個理由沒有出現在**給使用者看的**文案裡。
  屬文案/商業溝通決策,不由 UI/UX 審查單方認定為缺口。

- **〔架構〕若 P0-2 選擇讓 PaymentCheckout 重用 `useSubscription()`**,該 hook 的
  docstring(`useSubscription.ts:30-39`)警告「同一個畫面只准掛一個實例」,
  `dedupe()` 會讓後到的實例卡在 `isLoading` 永遠 true。PaymentCheckout 是獨立
  路由頁面(`App.tsx:370-377`),不會與 MemberDashboard/RewardDashboard 同屏,
  **現狀不會踩到**——但規劃書應把這個判斷寫下來,而不是留白讓實作者重新發現。

- **〔需求〕Q2 與 A1 在文字上有張力**:A1 已拍板「續約永遠可選,不因過期多久而
  消失」,似乎已隱含不設上限;Q2 又把這件事重新開放。兩者鎖定對象略有不同
  (A1 講「選項本身是否消失」,Q2 講「是否額外加提示/上限」)。請確認 Q2 是刻意的
  二次確認,還是可直接依 A1 收斂掉、不需再等業主回覆。

- **〔系統〕Q2、Q3 屬產品決策**,不在系統正確性範圍內,reviewer 不代審。

---

## 處置(人審後填寫)

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

**三個 P0 都不是「規則錯了」,是「規劃沒把設計做完」。** 其中 P0-3 需要人先裁決
Q1,才有辦法一次改齊 §2/§3/§5——因此建議的處置順序是:先答 Q1,再一次修訂
規劃(含 P0-1、P0-2 與全部 P1),然後重跑 `/review-plan`。

### 第 1 輪裁決(2026-08-02,人)

- [x] **Q1(併發缺口)裁決**:☑ **(a) 納入本 feature**
- [x] **Q2(補繳筆數上限)裁決**:☑ **依 A1 收斂,不設限**
      理由:A1 已拍板「不因過期多久而消失」,設上限等於讓它在某年數後消失,
      與 A1 直接衝突;任何門檻數字都無依據;且揭露卡片已把「補 N 筆 vs
      新約 1,200 立即生效」並排呈現,資訊已足,不需再替使用者決定。
      **Q2 就此結案,不再列為開放問題。**
- [x] **Q3(逐筆付款體驗)裁決**:☑ **維持逐筆,不做合併訂單**
      理由(比原提問更強):現有正確性保證全綁在「一筆付款 = 一列
      `subscriptions` = 一個 `subscription_id`」的粒度上
      (`pay_referral_generations` 冪等鍵、`repair_orphaned_payments` 的
      `source_payment_order_id` 逐筆對應)。合併訂單會打破這個粒度,並
      **直接違反已拍板的 A6**(補 3 年上代該拿 3 次,合併後只剩 1 次)。
      連帶結論:逐筆代表過期 3 年要走 3 次 PayUni,**這條路徑能否忍受
      完全取決於 P0-1 修得好不好**——P0-1 因此是本 feature 的成敗關鍵,
      不是附屬修補。
- [x] P0-1 `PaymentResult.tsx` 處置:☑ 修訂規劃(第 2 輪)
- [x] P0-2 PaymentCheckout 接線 處置:☑ 修訂規劃(第 2 輪)
- [x] P0-3 併發缺口 處置:☑ 修訂規劃(第 2 輪,依 Q1(a))
- [x] P1 × 9:全數修訂,無豁免
- [x] P2 × 4:三項納入修訂(`useSubscription` 註解、§6.2 fresh 列、卡片資訊重複);
      **`twDate.ts`/`tw-dates.ts` 雙副本收斂**改列為新的開放問題 Q4,等第 2 輪人審
- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃

> 第 1 輪的 P0 全數走「修訂規劃」,無豁免。plan.md 已依上述裁決改寫,
> 須重跑 `/review-plan` 產生第 2 輪審查結果後,才可再次送人審。
