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

---

# 第 2 輪審查(plan.md 第 2 版)

同樣派四個 fresh-context reviewer,並明確要求「第 1 輪已提過且本版已修訂的
項目不要重複列,除非修訂本身有問題」。聚合者仍不改判。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1 | 3 | 2 | 鎖序與死鎖分析、`hasPaidAnyBackfill` 兩個情境、`completed_at` 假設不成立、連續三筆的測試工具支援度 |
| 架構 | 1 | 1 | 0 | PaymentCheckout 單例判斷屬實、命名慣例、四契約檢查、Q4 分析公允、appShell 未被動搖 |
| UI/UX | 0 | 6 | 1 | 模式一致性、資訊架構/BottomNav、a11y |
| 需求 | 1 | 2 | 1 | A9/A1 成文化、A3 標記改動正確、AC-6/AC-7 可驗證、六個契約欄位有落點、無腦補/偷加碼/偷縮水 |

**去重後:P0 × 1、P1 × 11、P2 × 4。**

> **第 1 輪三個 P0 的修訂全部被確認有效**——併發鎖的位置與鎖序成立、
> PaymentCheckout 掛 `useSubscription()` 的單例判斷屬實、`PaymentResult.tsx`
> 的行為修正方向正確。第 2 輪的唯一 P0 是**同一類缺口在同一個 feature 裡
> 換一個檔案復發**。

---

## P0(阻擋)

**[P0]〔§3 動到的模組 / §4 付款結果頁 / §5 階段 5〕`PaymentResult.tsx` 需要的 `renewal` 沒有任何資料流送達——與第 1 輪 P0-2 是同一種缺口在同一 feature 復發**
*(系統、架構、需求三個視角各自獨立發現,判定一致)*

§4 的核心修法是「`orderStatus === 'completed'` 且 `renewal.backfillCount > 0`
→ 跳過輪詢與逾時分支」(`plan.md:261-263`),階段 5 驗證標準原樣引用
(`plan.md:323`)。但:

- `PaymentResult.tsx` 只打 `GET /payuni/result/:tradeNo`(`:79-92`),回應型別
  `OrderResult`(`:34-38`)只有 `orderStatus`/`completedAt`/`payuni`,**無 `renewal`**
- 後端該端點(`index.ts:1567-1578`)同樣不含 `renewal`
- 該頁不呼叫 `useSubscription()`,也不呼叫 `/subscriptions/status`
- §3 為 PaymentCheckout 開了一整節定案接線,**對 PaymentResult 完全空白**

第 2 版把它標為「本 feature 的成敗關鍵」「這三個階段不是 UI 收尾,是這個
feature 的一半」(§7 R2),卻沒有做同樣深度的分析。照現狀開工,實作者只能
自己發明一條路(裸 fetch、第三方資料路徑,或臨時決定要不要動
`/payuni/result` 契約)——而 §3 正是為了避免這種「第三份實作」才寫的。
**階段 5 的 `PaymentResult.test.tsx` 現在也無法定義要 mock 什麼**——
「切不出測試落點 = 設計沒想清楚」在這裡直接命中。

**架構視角另補一個更隱蔽的陷阱**:若直接掛 `useSubscription()`,同屏意義上
的單例限制不成立(安全),但它是 stale-while-revalidate(`useSubscription.ts:82-93`),
而 `DataCacheProvider` 會從 `sessionStorage` 復原**付款前**的快取
(`DataCacheContext.tsx:140-149`)。PayUni 導回是整頁重載——
- 中間筆:「還差 N 筆」短暫顯示錯一格,數百毫秒自我修正,傷害有限
- **最後一筆**:舊快取的 `backfillCount` 仍是 1,會把**剛付完、已經 active**
  的使用者導向「還差 1 筆」的補繳畫面,完全跳過該走的完成分支

那是 R2 想修的錯誤的鏡像版——「已完成被誤判成中間筆」,發生在最該慶祝的一刻。

→ §3 補一節,比照 PaymentCheckout 那節的分析深度,在兩個方案中定案:
(a) 掛 `useSubscription()`,但**必須明訂這個判斷不吃 SWR 的預設快取路徑**,
用 `refresh()` 或等價機制強制取新資料再判斷;或
(b) 擴充 `GET /payuni/result/:tradeNo` 回傳精簡版 `renewal`(天生每次都是新
請求,沒有快取問題,但 `index.ts` 該段與 `_shared/api-contract.ts` 要一併列入
受影響範圍)。
§3 模組表、`_shared/api-contract.ts`、階段 5 的測試落點據此更新。

---

## P1(應改)

**[P1]〔§2 資料庫變更〕新 migration 的基準版本引用錯誤,照原引用寫會靜默回退一個已修好的 bug**〔系統〕
§2 全篇引用 `20260718000001:178-183`、`:200-208`、`:247-248`
(`plan.md:101-127`),但 `process_successful_payment` 的**權威定義在
`20260720000001_wave4_guards.sql:383-495`**(檔名序最新,其後無 migration 再動)。
兩版唯一差異:
- `20260718000001:248` → `apply_referral_side_effects(p_user_id, v_sub_id)`(兩參數)
- `20260720000001:479` → `apply_referral_side_effects(p_user_id, v_sub_id, v_paid_at)`(**三參數**)

第三個參數是「推薦王月份 key 錨定付款時點而非執行時間」的修法。本 repo 的
migration 慣例是「基準 = X,唯一差異」逐字複製再改(見 `20260726000102:1-9` 等
十餘處)。實作者依錯誤基準去寫,會把 `v_paid_at` 掉包,**回退一個影響所有付款
路徑的 bug,不只本 feature**。
→ §2/§3 明標「基準 = `20260720000001_wave4_guards.sql`」。

**[P1]〔§2 契約 `hasPaidAnyBackfill`〕定義無法分辨「本輪」,對多數目標族群誤判**〔系統 + UI/UX,兩視角獨立發現,UI/UX 的分析範圍更廣〕
定義是「目前 `expired`,且最新一筆 `completed` 訂單的 `renewal_mode = 'extend'`」
(`plan.md:158-160`)。但對一個目前過期的人,「最新一筆 completed 訂單」**必然
就是產生他現在這個已過期 `end_date` 的那一筆**——不論那是「本輪補繳中的一筆」
還是「上一輪正常續約、之後自然到期」,兩者在此定義下完全一樣。

**範圍比初判更大**:`extend` 在 A1 拍板後已無時效限制,且是既有**預設選項**
(`PaymentCheckout.tsx:303-307` 的 `canExtend ? 'extend' : 'fresh'`)。因此
**任何續約過兩次以上的老會員**,這次又過期時,即使本輪一筆都還沒付,
`hasPaidAnyBackfill` 都會是 `true`。

後果:退化條件(`hasPaidAnyBackfill === false && backfillCount === 1`)只對
「第二次繳費就遲到」的窄小族群生效;多數重複續約者會看到補繳語彙與
「已補至…還差…筆」——而他們什麼都還沒付。**這正是第 1 輪 P1「退化條件只看
數值」想修掉的同一類文案打架,換一條路徑重新引入。**

階段 4 只驗「有付過 → true」(`plan.md:322`),**沒有反向斷言**,攔不到。
→ 改用能真正分辨「本輪」的信號(例如比對該訂單是否建立於目前這次過期
episode 開始之後,或另外持久化一個欄位);階段 4 補「曾 extend 續約、本輪未
付款 → false」的反例測試。

**[P1]〔§4 付款結果頁 / §5 階段 5〕`orderStatus` 的既有抓取是一次性、不重試的,P0-1 會在一個未排除的時序窗口下復發**〔UI/UX〕
`PaymentResult.tsx:96-117` 的 pending-recheck effect 開頭是 `if (statusParam) return`
——而 PayUni 導回**一律帶 `status` 參數**(§2 已述),所以這個 effect **永遠被
跳過**。`orderStatus` 只在 `:73-92` 抓一次,無論結果如何都不再抓。

若使用者掛載本頁的當下 webhook/return 還沒把訂單寫成 `completed`(差幾百毫秒
就夠),新分支條件不成立 → 直接落回舊的 45 秒輪詢 → 逾時撞進「聯繫客服」。
**這正是本次要根除的 P0-1,在規劃沒排除的窗口下依然會發生。**

另外 `PaymentResult.tsx` 這個畫面本身的三態(載入/錯誤/空)完全沒被規劃覆蓋
——§4 的「錯誤(付款後)」寫的是結帳頁,但 §4 自己指出的最高風險時刻
(「整頁重載…LINE 內建瀏覽器」)描述的其實正是這一頁首次掛載的那一刻。
→ 補:(a) `orderStatus` 仍 pending 時的過渡態(短暫沿用舊輪詢作橋接,待資料
到位切換到新分支,而非直接落入舊逾時錯誤);(b) `renewal` 在本頁的失敗態;
(c) 階段 5 補一則「webhook 尚未落地、`orderStatus` 仍 pending」的測試情境。

**[P1]〔§7 R4 / §5 階段 3、6、9〕「過期超過一年只能新約」的斷言散在 5 個檔案,R4 只抓到 1 個;其中 journey 那個要到晉升 PR 才會紅**〔架構〕
R4(`plan.md:376-378`)只提 `renewal-modes.test.ts:171-184`。同一行為還斷言在:
- `e2e/features/payment_checkout.feature:30-34` + `e2e/steps/common_steps.py:64-73`
  (前端 mocked e2e,階段 6 拆 `canExtend` 後直接紅,但無階段列出要改)
- `e2e/journey/features/60_time_scenarios.feature:50-55` +
  `e2e/journey/steps/f60_time_scenarios_steps.py:193-205` +
  `e2e/journey/tools/seed_time_machine.py:67`
  ——**journey 只在 develop→main 晉升 PR 才跑**。不同步的話,不會在階段 1-9
  任何一次 CI 被抓到,而是在晉升 PR 那 30-90 分鐘跑到一半才紅,**是所有測試
  落點裡發現最晚的一個**
- `e2e/journey/README.md:165`、`docs/e2e-journey-test-design.md:16,229`
  兩份設計文件把舊行為寫成既定設計
→ 階段 3 或 6 補前端 e2e 的反轉;另立階段(或併入 9)處理 journey 三檔與兩份
文件。journey 本機不能跑,但**改動與否是規劃階段就該決定的範圍**。

**[P1]〔§5 階段 1 / AC-6〕併發測試技術未指定,codebase 已有明文教訓:`.rpc()` 測不出 race window**〔系統〕
`process-payment-concurrency.test.ts:23-29` 的既有註解明寫:走 PostgREST/`.rpc()`
時兩個 HTTP round-trip 的開銷反而會把 DB 執行時間點拉開,很難重現真正的 race;
該測試因此改用兩條 `npm:postgres@3` 原生連線 + `Promise.allSettled`(`:51-61`)。

階段 1(`plan.md:319`)只寫「兩筆 pending 訂單並行完成」,沒引用這個先例。而
同一支測試檔現成的 `payPendingOrder` helper(`renewal-modes.test.ts:68-80`)走
的正是 `.rpc()`——實作者照抄就會寫出一支**綠燈但根本沒測到鎖**的測試,
R1(規劃書自認的金錢正確性風險)形同沒驗證。
→ 階段 1 明訂「用兩條原生 postgres 連線,比照 `process-payment-concurrency.test.ts`」。

**[P1]〔§5 階段 9〕規格書更新清單**只刪不增**——做完後規格書會對補繳整套規則完全沉默**〔需求〕
階段 9 列的四件事全是刪除或改寫既有欄,沒有一項是「把 A1-A9 寫進規格書」。
`check-spec-drift.py` 只查常數/路由/列舉/路徑,查不到「內容有沒有新增」,所以
CI 會綠。但結果是:舊的「失效超過一年只能走新約」被拿掉了,新的「可無限期
逐筆補繳、每筆各自建 subscription、中間筆仍是 expired」**沒有被寫進去**——
規格書從「有一條規則(已過時)」退化成「這塊完全空白」,比修訂前更難溯源。

這也直接違反 CLAUDE.md 對 `docs/plans/` 生命週期的原則:「值得長期保存的
決策要**升級**進規格書…其餘隨 commit 清掉」。plan.md 是鷹架、PR 前要刪,
規格書是 A1-A9 唯一還留得住的地方,現有寫法會讓它們隨鷹架一起消失。
→ 階段 9 新增一項:把 A1-A5、A7、A9 改寫進 §5.1/§6.2 正文。

**[P1]〔§3 / §5 階段 6-7〕`extendAnchorDate` 沒被指名取代既有本地計算,兩套「起算日」會並存**〔需求〕
`extendAnchorDate`(`plan.md:139`)是七個契約欄位中唯一沒有任何 UI mockup 或
測試斷言引用的。它不是死欄位——它**應該**取代 `PaymentCheckout.tsx:296-300`
的本地計算,而該計算目前驅動 `:630-633` 的既有文案「效期自 X 接續,至 Y」。

§3 只明講「`canExtend` 隨之移除」,沒明講 `extendAnchorDay`/`extendEndDay` 也要
改吃契約值。這不是理論風險:`pendingUser` 優先讀 `localStorage`
(`PaymentCheckout.tsx:104-108`),既有 5 秒輪詢(`:52-96`)只觸發跳轉、**不會**
`setPendingUser`。使用者付完第 1 筆、從 PaymentResult「繼續補繳」回來時,舊文案
會顯示**付款前**算出的起訖日,與同一頁「已補至 2025-04-02,還差 2 筆」(來自
`refresh()` 更新的契約值)並排出現、互相矛盾。
→ §3 明訂一併改吃契約值(或明講為何不需要);階段 6 或 7 補驗證標準。

**[P1]〔§4 付款結果頁〕「稍後再說」導向未定義,導向會員頁會被守衛瞬間彈回**〔UI/UX〕
`RequireMembershipRoute.tsx:41`(`resolveMembershipRedirect`)寫死「曾有訂閱、
已過期 → `/payment/checkout`」。補繳中的人 `accountStatus` 永遠 `expired`,
所以「稍後再說」導向任何受此守衛保護的頁面,都會被立即彈回結帳頁——剛按下
「不想繼續」就被系統抓回去,比留在原頁更糟。

`PaymentCheckout.tsx:454-459`(`handleCancel`)已有經過設計的同類模式:
`showToast('已保留您的登入,隨時可回來完成續費', 'info'); navigate('/', { replace: true })`。
→ §4 明寫沿用此模式(導向 `/` + 同語氣 toast)。

**[P1]〔§4 揭露卡片〕退化分支沒有範例文案,移除 CardDescription 後到期日資訊無主**〔UI/UX〕
既有 `CardDescription`(`PaymentCheckout.tsx:565-569`)不論過期多久都顯示
「您的會籍已於 {date} 到期」。§4 要求移除它,但只給了「補繳」情境的範例文案,
沒寫「退化成一般續約敘述」時實際顯示什麼。實作者若照字面只拿掉補繳詞彙,
一般續約使用者(依上方 `hasPaidAnyBackfill` 的分析,這其實是多數族群)會連
「已到期」都看不到。
→ 補一則退化分支的範例文案,明確包含到期日。

**[P1]〔§5 階段 8〕四契約回歸測試場景過於籠統,沒列出本 feature 獨有的中斷點**〔UI/UX〕
驗證標準只有一句「補繳中途關頁 → 從不同入口回來 → 接續看到正確進度」。
套 `registration_recovery.feature` 樣板不會自動涵蓋:
1. 剛付完第 1 筆、人還停在 `PaymentResult.tsx` 尚未點任一 CTA 就關閉分頁
   ——本 feature 全新引入的中間狀態。理論上狀態可由後端 `renewal` 即時算出
   所以沒問題,**但這正是需要 e2e 明確驗收的地方,不能只靠理論推導**
2. 已補 N 筆中的 M 筆、中途離開後從不同入口回來,結帳頁是否正確顯示「還差
   X 筆」而非重新從頭起算
→ 階段 8 驗證標準明列這兩個情境為必測項目。

**[P1]〔§7 R2〕只處理「被誤判成故障」,沒正視「即使系統正常,走 N 次完整流程」本身的疲勞與放棄率**〔UI/UX〕
Q3 裁決後,過期 N 年要重複 N 次「結帳頁 → PayUni → 結果頁 → 回結帳頁」。
§7 R2 的「風險隨補繳年數線性放大」只被用來支撐「誤判成故障」這一半。目前的
進度提示只有一行「已補至 X,還差 N 筆」,沒有整體進度呈現(如「第 M / N 筆」),
也沒討論中途放棄者的提醒/召回。
→ §7 至少補一段討論並給出結論(哪怕是「暫不處理,先上線觀察流失率」),
不要讓「風險隨年數線性放大」只服務於半個風險。

---

## P2(建議)

**[P2]〔§2 `expiredForMonths`〕月底邊界只用閏日(2/29)代表,建議補一個非閏年的一般月底案例**〔系統〕
`compute_subscription_period` 的 `anchor + 1yr - 1day` 公式讓任何日序都可能出現在
`end_date`;到期日落在 1/31、3/31、5/31…比較目標月只有 30 天時,同樣可能踩到
「原到期日日序在目標月不存在」的邊界。閏日案例只是這個類別的一個特例,無法
驗證算法有沒有把 2/29 的修法過度特化。

**[P2]〔§2 `expiredForMonths`〕對 `status === 'active'` 的語意未定義**〔系統〕
照字面算會是負數,與欄位名稱矛盾。階段 4 對 active 只斷言 `backfillCount:0`。
目前沒有已知 UI 路徑會讀到,但屬未定義行為留在新契約裡。
→ §2 明訂(例如固定回 0)並補測試釘住。

**[P2]〔§4 付款結果頁〕新畫面範例文案缺少同檔其他狀態一律有的「訂單編號」與「不會重複扣款」保證句**〔UI/UX〕
`PaymentResult.tsx` 現有每個終局/等待畫面(`:283-289`、`:500-505`)都固定顯示
訂單編號並附保證句。§4 的範例文案兩者皆無,照抄字面會與同檔其他狀態風格不一致
——使用者在「剛付了真金白銀」的當下少了這句保證,比其他狀態更容易疑慮。

**[P2]〔規格書附錄〕新增的 lock migration 與 `backfillPlan()` 沒有對應索引列**〔需求〕
附錄「續約雙模式」列目前只指向 `20260716000008_renewal_modes.sql`(`spec:557`)。
`check-spec-drift.py` 的 `path_violations` 只查「引用的路徑存在嗎」,不查「該引用
的有沒有引用」,所以不影響機械檢查,純文件完整性建議。

---

## 需人工裁決

- **〔UI/UX〕中途放棄補繳(只付了部分年數)的使用者要不要有提醒/召回設計**
  (email、站內通知等)?屬產品決策,建議此次一併裁決並記錄結論。
- 系統與需求兩視角本輪**無新增**需人工裁決項目(Q4、Q5 仍待第 2 輪人審)。

---

## 聚合者附記(不改判,僅記錄觀察)

第 2 輪唯一的 P0,與第 1 輪的 P0-2 是**同一類缺口**——「規劃寫了新的目標行為,
但沒有設計資料怎麼送到那個畫面」——只是換了一個檔案(PaymentCheckout →
PaymentResult),而且是在規劃者已經被同一件事指正過一次之後。三個視角獨立
發現它。這個模式值得記進 `progress.md` 的框架摩擦,若再犯第三次就整併進
`docs/plans/friction-log.md`。

## 第 2 輪處置(人審後填寫)

- [ ] **P0(PaymentResult 接線)**:□ 方案 (a) 掛 `useSubscription()` + 強制 `refresh()`
      □ 方案 (b) 擴充 `/payuni/result/:tradeNo` 回傳精簡 renewal □ 其他:
- [ ] **Q4(twDate 雙副本是否收斂)**:□ 不收斂(規劃預設) □ 收斂
- [ ] **Q5(揭露文案是否說明補繳價值)**:□ 加 □ 不加
- [ ] **Q6(新):中途放棄者的召回機制**:□ 本次不做,先觀察 □ 要做,形式:
- [ ] P1 × 11:□ 全數修訂 □ 部分豁免(逐項列理由:)
- [ ] P2 × 4:□ 納入 □ 略過
- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃

### 第 2 輪裁決(2026-08-02,人:「照你建議」)

- [x] **P0(PaymentResult 接線)**:☑ **方案 (b) 擴充 `GET /payuni/result/:tradeNo` 回傳精簡 renewal**
      理由:該頁本來就在打這支端點,多回欄位即可;方案 (a) 要在一個以
      「先秀舊資料」為預設的 hook 上小心繞過其預設行為,而那正是本輪出事的
      地方。(b) 天生每次都是新請求,沒有快取新鮮度問題。
      連帶:`index.ts` 的 `/payuni/result` 段與 `_shared/api-contract.ts`
      列入受影響範圍。
- [x] **Q4(twDate 雙副本是否收斂)**:☑ **不收斂**(維持雙副本 + 共用案例表)
      理由:本 PR 已有一支 migration 碰金流函數,再疊一次跨端模組搬遷會讓
      風險面過寬。此為知情選擇,已記錄。
- [x] **Q5(揭露文案是否說明補繳價值)**:☑ **不加說服性文案,改中性事實並列**
      **理由見下方「Q5 覆核發現」——查證後,extend 對使用者沒有可以誠實
      陳述的好處,寫「為什麼值得補繳」等於發明一個不存在的賣點。**
- [x] **Q6(中途放棄者召回機制)**:☑ **本次不做,先上線觀察流失率**
      §7 補一段明確記錄此結論,不讓「風險隨年數線性放大」只服務半個風險。
- [x] P1 × 11:☑ 全數修訂,無豁免
- [x] P2 × 4:☑ 全數納入
- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃

> 第 3 版 plan.md 依上述裁決改寫,須重跑 `/review-plan` 產生第 3 輪結果。

### Q5 覆核發現(聚合者於裁決 Q5 時查證,非 reviewer 提出)

回答 Q5 需要先確定「extend 換到什麼」。查證結果:**查不到可以誠實寫給
使用者看的好處。**

- plan.md §0 寫的是「保住原本的推薦線與週年日」。但**推薦線不受影響**:
  `/payuni/prepare` 只在 `renewalMode === 'fresh' && referredByCode` 兩個
  條件同時成立時才改寫 `profiles.referred_by_*`(`index.ts:1414`)。
  使用者選 fresh 而**不填**新推薦碼時,上代維持原樣。推薦線從來不是
  extend 的專屬價值。
- 於是 extend 相對 fresh 的唯一差別只剩「保留原週年日」。而週年日在系統中
  沒有任何下游作用——推薦王月份錨定付款時點(`20260724000004:113`)、
  獎勵綁付款事件、提領守衛只看 active 與否。

逐案比較(每筆皆 NT$1,200):

| 情境 | extend | fresh |
|---|---|---|
| 過期 2 年 1 個月(2026-05-02 登入) | 付 3 筆 3,600,效期至 2027-04-02(**剩 11 個月**) | 付 1 筆 1,200,效期至 2027-05-01(**剩 12 個月**) |
| 過期 1 個月 | 付 1 筆 1,200,效期至 2027-04-02(**剩 11 個月**) | 付 1 筆 1,200,效期至 2027-05-01(**剩 12 個月**) |

**fresh 在所有情境下都不比 extend 貴,且涵蓋期都不短於 extend。**
過期越久,差距越大(3 倍價格換更短效期)。

這不推翻任何已拍板的規則(A1-A9 全部照舊實作),但它決定 Q5 的答案:
**中性並列雙方的金額與到期日即可,不要加說服性文案**——任何「為什麼值得
補繳」的說法都得靠一個查不到依據的好處撐著。

⚠️ **這一點超出 Q5 的範圍,值得人另外裁決**(已列為 Q7,見 plan.md §6):
若 extend 對使用者永遠是劣勢選項,「補繳制」實際上會是一個**設計出來但
沒有人會理性選擇**的路徑,本 feature 的九個階段有相當比例是在服務它。

### Q7 裁決(2026-08-02,人):(a) 接受現狀

**第 3 版「extend 永遠劣勢」的分析前提不完整**——只比較了「效期 vs 價格」,
漏掉帳本。**extend 的真正價值 = 保住累積的點數與任務進度**;選 fresh 則清空。
過期期間下線持續付款,上代照常入帳(§5.1、`pay_referral_generations` 與
`apply_referral_side_effects` Block B 皆不檢查上線狀態,已覆核),累積越多
extend 的價值越高。

**同時查明的兩件事(供另一包「上代配對線」規劃時使用)**:

1. **「選新約不填推薦碼」≠「套用預設推薦碼」。**
   - `/payuni/prepare` 只在 `renewalMode === 'fresh' && referredByCode` 兩條件
     同時成立時才改寫 `profiles.referred_by_*`(`index.ts:1414`)
   - `apply_referral_side_effects` 的預設推薦人分支只在
     `v_referrer1 is null` 時才走(`20260726000102:103-105`);
     `resolve_default_referrer` 內部又讀 `subscriptions.is_renewal`,
     **非首購直接回 null**(`20260726000101:70-75`)
   - 結論:對一個**已有上代的續約者**,選 fresh 不填碼 = **維持原上代不變**。
     預設推薦人機制只對「首購且從未有上代」的人生效。

2. **失效期間照常入帳、照常累積任務,extend 續約後全部保留。**
   規格書 §5.1 明寫且與 code 一致;`pay_referral_generations` 綁下線付款事件、
   不檢查上線狀態,`apply_referral_side_effects` Block B 的 task +1 只做
   pair-history 判斷、同樣不看上線狀態。

**衍生的新開放問題**(已寫入 plan.md §6):
- **Q8**:「fresh 清空帳本」屬另一包,若本 feature 先單獨上線,extend 在過渡期
  仍是劣勢選項,且使用者會養成「選 fresh 沒差」的認知。
- **Q9**:選 fresh 前的清空揭露,以及「補繳中途改選 fresh」「待審提領遇到清空」
  兩個邊界。
