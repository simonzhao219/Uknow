# 續約路徑潛伏組（renewal-path-hardening）規劃書

<!-- plans-keep: 第 5 波 S6 規劃（W5-1：本波必交規劃＋審查，實作有完成才上）；退場條件＝/tdd-implement 收尾刪除；若 11/22 前未實作完，隨主 session PR 先合併，由第 6 波接手後刪 -->

工項 S6（`docs/plans/launch-wave-5/plan.md` §2；裁決 W5-1、W5-7、W5-8、W5-9）。觸發期限 **2027-10-27**
（正式站最早到期日：prepare 對 active 者一律 400，第一批會員過期前沒人能走進續費路徑）。
基準＝develop `54ac83f`（S2 #510 已合併：`prepare_payment_order`、重複付款偵測 `20261111000003`、冪等唯一索引 `20261111000001`）。
稽核行號以 main `f88bae5` 為準，本檔行號一律以 develop `54ac83f` 現算。

## 0. 一句話

讓過期會員的續約／新約只依**實際付款的那張單**生效、推薦關係不會成環、續費者不會被當成首購或被送回結帳頁重付，
並把新約的確認與推薦王語意對齊業主裁決（W5-7、W5-8）。這些都是 2027-10-27 第一批會員到期後就會碰到的錯錢、錯綁路徑。

## 1. 使用者需求

對照規格書：§4.1（註冊完成後唯一自助換線＝新約）、§6.2（續約雙模式、fresh 護欄）、§7.2（組織圖）、§7.4（預設推薦人）、
§8.2–8.4（發放時機、冪等、ledger_reset）、§9.1–9.2（推薦王、pair-history）。

每條先給「具體輸入 → 錯誤結果」重現，再給要的行為。代號：M＝過期會員，Y＝M 原上代，X＝別的會員，D＝M 的一代下線。

### R1　ref P0-1＝pay P0-1：新約棄單後改付續約，仍換線並發獎

- 重現：M（上代 Y）選新約、填 X 的碼 → `/payuni/prepare` 在**建單時**就寫 `profiles.referred_by_user_id = X`
  （`index.ts:2111-2122`；未填碼時寫預設推薦人，`:2153-2164`）→ M 放棄 PayUni 頁 → 回結帳頁改選續約並付款
  → `apply_referral_side_effects` 讀 profiles（`20260726000102:69-72`）把推薦邊 rewire 到 X，三代 100P 發給 X 線、X 任務 +1；
  M 走 extend，不清帳本。結果：**不扣點也能換上代**；直接打 API 呼叫 prepare、不付款也能做到。
  即使 M 從此不再付款，profiles 已與 `referral_edges` 不一致（會員資料顯示 X、樹仍掛 Y），下一次任何付款都生效。
- 另一觸發點（S2 留下的已知限制）：fresh 換線的 profiles 寫入發生在 `prepare_payment_order` 之前（`:2177-2201`），
  RPC 回 `active`／`suspended`／錯誤時不回復。
- 要的行為：換線意圖記在**那張訂單**上；只有該筆 `renewal_mode='fresh'` 的訂單付款成功時才寫 profiles 並 rewire。
  建單、棄單、extend 付款都不動 profiles。

### R2　ref P0-2：推薦成環

- 重現：D 的上代是 M。M 過期選新約填 D 的碼並付款 → 邊 M→D、D→M。M 付款：gen1＝D、gen2＝D 的上代＝M（**自己領 100P**）、
  gen3＝M 的上代＝D（D 兩份）。之後 D 每次付款 M 也拿 gen2。三角環 M→A→B→M 同理。`loadNetwork` 在環上把一代覆寫成三代。
  prepare 驗碼只擋 `referrerUserId === user.id`（`index.ts:2107`），`referral_edges` 只有 `referee <> referrer`。
- 要的行為：新上代若在 M 自己的下線樹內（**任何深度**，見 Q4）→ prepare 回 400；付款當下 rewire 前在鎖內再擋一次
  （prepare 到付款之間樹可能變）；`pay_referral_generations` 遇收獎者＝付款人本人時停發（縱深）。

### R3　pay P1-1＝auth P1-1：續費者走首購路徑（renewalMode＝null）

- 重現：首購時 CompleteProfile 寫下 `pendingUser`（無 `subscriptionEndDate`），之後從未登出 → 一年後到期 → 守衛導結帳頁
  → localStorage 分支用舊快照（`PaymentCheckout.tsx:224-262`，`isRenewal = !!pendingUser?.subscriptionEndDate`，`:370`）
  → 不顯示續約／新約、送單不帶 body → 後端 `renewalMode=null`（`index.ts:2030-2031`）→ `process_successful_payment` 以付款日起算、
  不清帳本、不換線。結果：過期 N 年付 1 筆就拿「今天起一年＋保留點數與上線」，繞過補繳與新約清帳。手工打 API 不帶 body 同效。
- 要的行為：後端對**已有訂閱紀錄**者收到 null → 400「請選擇續約或新約」（Edge 與 RPC 鎖內各一道）；
  `process_successful_payment` 遇「曾訂閱且 null」寫 error 告警（縱深，防 prepare 以外的建單路徑）；
  前端結帳頁以 `/profile` 為準判定續費身分，舊快照只當首繪。

### R4　pay P1-4：續費者付款成功但卡單，被送回結帳頁

- 重現：續費者 `effective_registration_step` 恆為 3（已有 completed 單）→ `buildProfileResponse` 在 step 3 強制
  `paidAwaitingActivation=false`、`lastTradeNo=null`（`index.ts:637-641,655-657`），自癒 heal 也只在 step 2 跑（`:624`）
  → 金額不符或 `process_successful_payment` 失敗、自癒收斂不了 → 守衛判 `renew` → 結帳頁 → 使用者以為沒付成功再付一次。
- 要的行為：非 active 者只要有 pending＋SUCCESS 就 `paidAwaitingActivation=true` 並帶該筆 `lastTradeNo`，step 3 也先跑 heal；
  prepare 在鎖內遇到「已付款待開通」的 pending 單回 409，不建新單。

### R5　W5-7（pay P2-10）：新約無條件二次確認

- 現況：只在有點數／有下線／付過補繳時才確認（`PaymentCheckout.tsx:393-398`）；無資產的 fresh 照樣換線，卻不確認。
- 要的行為：fresh 一律跳確認框；框內依資產列出後果（點數、累積推薦、已付補繳）；**一定**有一句推薦人後果：
  填了碼＝「推薦人將改為〔姓名〕」，留空＝「將不指定推薦人」（§7.4：預設推薦人機制不對使用者揭露，沿用「留空表示不指定推薦人」）。
- 測試〈fresh 無資產且未付過補繳時，付款不需二次確認直接送單〉改成反向斷言（W5-7 授權）。

### R6　W5-8（ref P2-2、P2-3）：新約對推薦王的語意

- 重現 P2-2：U 當月已滿 8 位拿到第 1 張 credit（`round_ordinal=1`），同月 U 做 fresh → 當月桶被刪，但 `max(round_ordinal)=1` 還在
  → `reconcile_king_credits`（`20260724000003:152-173`）要當月桶長度 ≥16 才發第 2 張。
- 重現 P2-3：fresh 刪當月桶（`20261111000003:159-165`）＝刪了 pair-history 的一部分 → 當月才加入的下線 R 明年以同一上線續約時
  「R 從未出現在 U 歷史」成立 → U 任務**再 +1**，違反 §9.2 不變式。
- 要的行為（W5-8）：已發出的 credit（含 unclaimed）保留；fresh 後當月從 0 計門檻（下一張要再滿 8 位）；
  當月桶只清計數，配對名單另存，「R 從未出現在 U 歷史」跨清空成立。

### 不做

- ref P2-4（fresh 與 extend 兩單交錯、付款當下有 pending 提領）——S2 的重複付款偵測已讓「已 active 時付的 fresh」不再清帳本；
  剩下的時序留第 6 波候選。
- `pendingUser` 綁 uid、付款成功清除（ref P1-8＝pay P1-5）——第 6 波候選；本工項只讓結帳頁不以快照判定續費身分。
- 已存在的環或 profiles／edges 不一致資料的自動修復（正式站 11/03 查為 0；施工前再查，見 §7）。

## 2. 系統設計

### 2.1 換線意圖改存訂單（R1、R2 付款端、R3 後端）

**migration A**（`2026111xxxxxxx_renewal_referrer_intent.sql`，版本號施工時現定、跑 `check-migration-versions.py`）：

- `payment_orders` 加三欄（nullable、無預設）：`fresh_referrer_user_id uuid references profiles(id)`、`fresh_referrer_code text`、
  `fresh_referrer_source text check (in ('code','default','keep'))`。
  `source` 是意圖本身：`code`＝使用者填碼、`default`＝未填碼套預設、`keep`＝預設推薦人不可用（A11：維持原上代）。
  非 fresh 單三欄皆 null；fresh 單 `source` 必有值。**fresh 單 `source` 為 null＝本 migration 之前建的舊單**（只可能在 develop），
  付款時不動 profiles（舊 prepare 已寫過）。
- `prepare_payment_order` 新增六參數版：加 `p_referrer_user_id`、`p_referrer_code`、`p_referrer_source`。
  舊三參數版保留為 wrapper（意圖欄寫 null），讓 migration 套用後、新 Edge 部署前的舊 Edge 照常建單（§7）；Edge 以 rpc 帶具名參數呼叫，
  兩版參數集合不同、不會多載歧義。舊版下一波 drop。鎖內順序：`not_found` → `suspended` → `active` →（新）`paid_pending`（有 pending 且
  `payuni_response->>'Status'='SUCCESS'`）→（新）`mode_required`（null 且 `exists subscriptions`）→（新）`cycle`
  （`source='code'` 且新上代在本人下線樹內）→ insert（帶三欄）。
  `source='default'` 的環另行處理：改寫成 `keep`＋告警（A11 不阻斷金流），回 `ok`。
- 新函式 `referral_would_cycle(p_referee uuid, p_new_referrer uuid) returns boolean`：自 `p_new_referrer` 沿 `referral_edges`
  往上走，遇到 `p_referee` 即 true；遞迴 CTE 帶已訪集合防既有環無限迴圈、深度上限 10,000。
  `p_new_referrer = p_referee` 也回 true（自我推薦併同一判準）。security definer、只 grant service_role。
- `process_successful_payment`（基準＝`20261111000003`，唯一差異列在檔頭）：在 0b 的 profiles 鎖之後、3-0 清帳本之前新增
  **0d 換線**：`renewal_mode='fresh' and not v_duplicate and fresh_referrer_source in ('code','default')` →
  鎖內重跑 `referral_would_cycle`；不成環 → `update profiles set referred_by_user_id/code/is_default, referred_by_changed_at = v_paid_at`；
  成環 → 不換線、error 告警 `fresh_referrer_cycle`（帳本照清，見 Q2）。之後 `apply_referral_side_effects` 照舊讀 profiles rewire。
  另加縱深：`v_is_renewal and v_renewal_mode is null` → error 告警 `renewal_without_mode`，效期與帳本行為不變（見 Q3）。
- `pay_referral_generations`（基準＝`20261111000001`）：任一代收獎者＝`p_referee` 時該代與其後各代都不發，寫 error 告警
  `referral_cycle_detected`（不應發生；發生代表資料已有環）。

**鎖序**：prepare RPC 只鎖 profiles（同 S2）；`process_successful_payment` 仍是 payment_orders → profiles，0d 只在已持有的
profiles 鎖內讀 `referral_edges`（不加新鎖）。不新增死鎖可能。`referral_would_cycle` 只讀。

**`referred_by_changed_at`（同類掃描發現）**：#167 閘門比 `referred_by_changed_at <= po.completed_at`，觸發器一律寫 `now()`；
而 `completed_at = v_paid_at`（PayUni 授權時點，`payuni_paid_at`），早於付款交易的 `now()`。所以**付款交易內**寫推薦人
（現行首購預設推薦人回寫，以及本工項的 0d）時 changed_at 必晚於 completed_at → 這筆付款若周邊發獎失敗，
`repair_orphaned_payments` 會把它排除、永不補發（`20260807000001` 註解「同交易 changed_at == completed_at」不成立）。
修法：觸發器在呼叫端明確改了 `referred_by_changed_at` 時尊重該值；0d 與 `apply_referral_side_effects` 的預設推薦人回寫都設成
`p_paid_at`。（`apply_referral_side_effects` 基準＝`20260726000102`，唯一差異＝3a-bis 的 update 多一欄。）

### 2.2 Edge `/payuni/prepare`（R1、R2、R3）

- 刪掉兩段 `profiles.update`（`index.ts:2111-2122`、`:2153-2164`）；兩條分支改成只算出 `{referrerUserId, code, source}` 傳給 RPC。
  驗碼仍走 `validate_referral_code`（停權／失效在裡面）；自我推薦訊息不變；default 解析失敗沿用 `default_referrer_unavailable_on_fresh` 告警
  並以 `source='keep'` 建單。
- Edge 先在守衛區塊做一次 `mode_required`（讀 `subscriptions` 是否存在；已有 extend 那段的讀取可共用）與 `cycle`（呼叫 `referral_would_cycle`），
  任何寫入之前回 400；RPC 鎖內再判一次。新 outcome 對應：`paid_pending`→409「付款已完成，開通處理中」（帶 `lastTradeNo` 供前端導結果頁）、
  `mode_required`→400「請選擇續約或新約」、`cycle`→400「此推薦碼屬於您的推薦網絡成員，無法作為推薦人」。
- `api-contract.ts`：prepare 錯誤回應若需新 `code` 欄（`PAYMENT_PENDING_ACTIVATION`、`RENEWAL_MODE_REQUIRED`、`REFERRAL_CYCLE`）兩側同步。

### 2.3 `/profile` 卡單旗標（R4）

`buildProfileResponse`：`paidAwaitingActivation = !!paidOrder && acct?.status !== 'active'`，不再依 step 蓋掉；
heal 條件由 `registrationStep === 2` 改為 `paidAwaitingActivation`；`lastTradeNo` 在 `paidAwaitingActivation` 時給 paidOrder 的單號
（step 2 既有語意保留）。step 3 的 `repair()` 照跑。active 者有卡住的 SUCCESS 單（重複付款）旗標為 false，守衛本來就先判 active。

### 2.4 推薦王與 pair-history（R6）

**migration B**（`…_referral_pair_history.sql`）：

- 新表 `referral_pair_history (referrer_user_id uuid, referee_user_id uuid, first_month_key text, created_at timestamptz default now(),
  primary key (referrer_user_id, referee_user_id))`；RLS 開、無 policy（只有 definer 函式寫讀）。
- 回填＝所有 `task_progress.monthly_referrals` 各月陣列 ∪ `reward_transactions`（`type='referral_reward' and generation=1`）的
  `(user_id, referee_user_id)`——後者補回過去 fresh 刪掉的當月桶裡的配對（gen1 獎金＝當時是直接上線，pair-history 語意下
  第一次付款必然 +1）。`on conflict do nothing`；`first_month_key` 取最早月份。
- `task_progress` 加 `king_round_base jsonb not null default '{}'`：`{月份: fresh 當下該月已發的張數}`。
- `apply_referral_side_effects` 3d：pair 判準改查 `referral_pair_history`；+1 時同一交易 insert pair 並 append 當月桶（桶仍是計數與
  「本月推薦詳情」清單的來源，讀端不必改）。
- `process_successful_payment` 3-0：刪當月桶之外，寫 `king_round_base[月份] = 該月 max(round_ordinal)`（無則不寫）；
  pair 表不動、credit 不動。
- `reconcile_king_credits`：`v_target = coalesce(king_round_base[月份],0) + floor(當月桶長度 / 門檻)`，其餘不變——
  已發的 round 1..k 保留，fresh 後再滿 8 位發 round k+1。
- `/tasks`、`/tasks/current-month-top` 讀當月桶長度，fresh 後自然從 0；不改。

## 3. 架構影響

- 後端：`index.ts` 第 4 區段（`buildProfileResponse`）與第 7 區段（`/payuni/prepare`）；兩支新 migration；`_shared/api-contract.ts`。
- 前端：`PaymentCheckout.tsx`（續費身分以 server profile 為準、確認框）；`registrationFlow.ts` 不改（`activating` 本來就先於 `renew`）。
- multi-step-flow 四契約：結帳頁屬金流頁。本工項把 localStorage 從「判定依據」降為「首繪」，符合「伺服器狀態為真」；
  已付款待開通由 prepare 409 兜底（使用者從舊分頁按付款也不會多一張單）。
- 安全：`referral_would_cycle`、新 `prepare_payment_order` 只 grant service_role（`security-definer-grants.test.ts` 動態掃描會守）。
- 效能：環檢查走 `referral_edges` 主鍵 `referee_user_id` 往上爬，深度＝樹高（正式站 ≤ 個位數），每次 prepare 一次、付款一次。

## 4. UI/UX

- 結帳頁（localStorage 分支）：既有背景 `/profile`（停權確認，`:255-266`）擴大為「續費身分＋導向」確認——拿到後以 server profile 取代快照、
  跑 `resolveCheckoutPageRedirect`；確認前付款鈕停用（沿用 `suspensionPending` 的停用與文案）；讀不到時沿用現行為（不擋，後端 400 兜底，
  前端把 `RENEWAL_MODE_REQUIRED` 轉成「請重新整理頁面以選擇續約或新約」的 toast＋重抓 profile）。
- prepare 409（已付款待開通）：toast「付款已完成，開通處理中」並導 `/payment/result?tradeNo=…`。
- 新約確認框（`:1176-1222`）：永遠出現；段落順序＝資產清空（零值不唸，現行）→ 已付補繳（現行）→ **推薦人**（新）→ 效期（現行）。
  推薦人句：有效新碼＝「您的推薦人將改為 {newReferrerName}。」；留空＝「您將不指定推薦人。」。確認鈕維持紅實心（§12.11）。
- 行動版：確認框是既有 AlertDialog，不新增版面。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 環偵測函式＋`pay_referral_generations` 自領停發（R2 SQL） | `api/referral-cycle.test.ts`（新，db） | 直接以 SQL 造 M→D→M：M 付款無 `user_id = referee_user_id` 列＋告警；`referral_would_cycle` 對一、二、三、四代下線皆 true，對旁支與自己的上代 false；既有環不無窮迴圈 |
| 2 | 訂單換線意圖＋`prepare_payment_order` 新 outcome＋付款端 0d（R1、R2、R3、R4 的 RPC 部分）＋changed_at | `api/renewal-referrer-intent.test.ts`（新）、`prepare-payment-order.test.ts`、`renewal-modes.test.ts`、`fresh-default-referrer.test.ts`、`repair-retro-rewards.test.ts` | **紅燈主案例**：fresh 填 X 建單不付 → extend 建單並付款 → 推薦邊、gen1–3、任務仍歸 Y，profiles 仍是 Y；fresh 單付款後才換線；`mode_required`、`paid_pending`、`cycle` 三個 outcome；付款當下成環 → 不換線＋告警；首購預設推薦人付款後 changed_at = completed_at、repair 能補發 |
| 3 | Edge prepare 改寫（不再寫 profiles、傳意圖、三個新拒絕） | `api/renewal-modes.test.ts`、`fresh-default-referrer.test.ts`（既有 S6 案例改寫）、`api-contract` 型別 | prepare 後 profiles 不變；RPC 回 active／suspended 時 profiles 不變（S2 已知限制）；曾訂閱者無 body → 400；填一代碼 → 400 |
| 4 | `/profile` 續費卡單旗標＋heal（R4） | `api/profile-self-heal.test.ts` | 續費者（step 3、expired）pending＋SUCCESS → `paidAwaitingActivation=true`、帶 `lastTradeNo`、先 heal；active 者不帶旗標 |
| 5 | pair-history 表＋回填＋king_round_base（R6） | `api/fresh-ledger-forfeit.test.ts`、`king-multi-credit.test.ts`、`referral-king-reward.test.ts`、migration 回填案例 | 同月已有 1 張 credit 再 fresh → 原 credit 保留（含 unclaimed）、再滿 8 位發第 2 張；當月加入的 R 於 fresh 後續約 → U 任務不 +1；回填含 gen1 獎金推得的配對 |
| 6 | 結帳頁以 server profile 判續費身分＋確認框（R3 前端、R5） | `src/components/PaymentCheckout.test.tsx`（jsdom） | 舊快照（無 `subscriptionEndDate`）＋API 為 expired 續費者 → 顯示續約／新約、送單帶 renewalMode；fresh 無資產也彈確認且含推薦人句（反向斷言 W5-7）；409 導結果頁 |
| 7 | e2e mocked＋journey f70 補章＋規格書同步 | `e2e/features/*renewal*`（mocked Gherkin）、`e2e/journey/features/70_renewal_saga.feature`（CI dispatch） | mocked：舊快照續費者看得到雙模式；journey 見下；`check-spec-drift.py`、`check-test-names.py` 綠 |

**journey f70 要補的章節**（真後端、CI 才跑；演員沿用 orgchart-saga.yaml）：

- 插章 4a「新約棄單改續約」：第 4 章前，演員選 fresh 填別樹碼 → 到 PayUni 頁返回不付 → 改 extend 付款 → 斷言上代、三代收獎者、任務計數不變【DB】。
- 插章 4b「環防線」：以一代下線的碼選 fresh → 400 訊息【GUI】；DB 無自領列。
- 第 7 章補：同月已有 credit 的演員做 fresh → credit 仍在、再滿門檻才發下一張（若演員人數湊不出 8 位，改在 D 層測、journey 只驗 credit 保留）。
- 第 9 章補：無資產 fresh 也出現確認框且含「不指定推薦人」句【GUI】。

## 6. 開放問題

- [ ] **Q1 重複付款（付款當下已 active）的 fresh 單要不要換線？** 建議**不換**：S2 已把它降為「接續效期、不清帳本」的續約語意，
      換線卻不清帳本＝R1 要堵的「不扣點換上代」；duplicate 告警 context 加上該單的換線意圖，客服判斷。
- [ ] **Q2 prepare 時不成環、付款當下才成環（中間有人換線）怎麼辦？** 建議**維持原上代、帳本照清、error 告警**——
      與 §7.4 A11「預設推薦人不可用 → 維持原上代、不阻斷金流」同形；使用者付的是新約，清帳本是他確認過的後果。
      替代：不清帳本（等同 extend），但使用者確認過的是新約，後果會跟確認框不一致。
- [ ] **Q3 曾訂閱者的 null 單仍走到付款（prepare 以外的路徑）時的語意？** 建議**行為不變＋error 告警**（付款日起算、不清帳本、不換線），
      交人工；改成 extend 錨點可能讓付了錢的人仍是 expired。
- [ ] **Q4 環的判定範圍**：建議**任何深度**都擋（不是只擋三代內）——超過三代的環不會錯發獎金，但組織圖與網絡查詢沒有環的前提，
      規則也比「三代內」好說明。代價：深層下線的碼不能當新上代（正式站樹高個位數，影響極小）。
- [ ] **Q5 環的 400 訊息要不要點明「是您的下線」？** 建議點明「屬於您的推薦網絡成員」——使用者本來就看得到自己的網絡，
      不構成洩漏；只說「無法使用」會讓人反覆嘗試。
- [ ] **Q6 留空的新約，確認框推薦人句**：建議「您將不指定推薦人。」（沿用 §7.4 不揭露預設推薦人）。
      若業主希望明說「原推薦人 {姓名} 將不再是您的推薦人」，需要多讀一次上代姓名（`/subscriptions/status` 加欄位）。

## 7. 風險與回滾

- **正式站資料影響**（15 筆訂閱、21 列 reward_transactions；所有人 active 至 2027-10-27）：
  migration A 只加 nullable 欄與換函式，既有列不變；migration B 建表回填、加 `king_round_base` 預設 `{}`。
  施工前請主 session 代跑唯讀查詢（結果記進 progress.md）：
  1. `select count(*) from profiles p left join referral_edges e on e.referee_user_id=p.id where p.referred_by_user_id is distinct from e.referrer_user_id and p.referred_by_user_id is not null;`（預期 0）
  2. 環：`with recursive up(start, cur, depth) as (select referee_user_id, referrer_user_id, 1 from referral_edges union all select u.start, e.referrer_user_id, u.depth+1 from up u join referral_edges e on e.referee_user_id=u.cur where u.depth<50 and u.cur<>u.start) select count(*) from up where cur=start;`（預期 0）
  3. `select count(*) from reward_transactions where type='referral_reward' and user_id=referee_user_id;`（預期 0）
  4. `select count(*) filter (where type='ledger_reset') from reward_transactions;`、`select count(*) from referral_king_rewards;`（回填與 round_base 的影響面）
  5. 回填預覽：buckets 推得的配對數、gen1 推得的配對數、兩者差集數
  6. `select count(*) from payment_orders where status='pending' and renewal_mode='fresh';`（舊單，預期 0）
  7. changed_at 同類掃描佐證：`select count(*) from payment_orders po join profiles p on p.id=po.user_id where po.status='completed' and p.referred_by_changed_at > po.completed_at;`
- 最壞情況：0d 的換線邏輯錯 → fresh 付款不換線（使用者付新約卻留原上代）。偵測：fresh 付款後 profiles／edges 與訂單意圖不符的對帳查詢
  （列進 PR 的上線後驗證清單）。回滾：migration 不可逆部分只有新表與新欄（不刪既有資料）；函式回滾＝重新套用上一版定義的 migration。
  Edge 與 migration 由不同 workflow 部署：**Edge 新 prepare 依賴新 RPC 簽章**——migration 先於 Edge（Supabase 原生整合在 push 時套用、
  Edge 在 CI 綠後部署，順序天然成立）；舊 Edge 呼叫舊三參數簽章會因 drop 而失敗，所以 migration 保留三參數版為 wrapper（意圖欄寫 null），
  下一波再 drop。
- 期限：觸發最早 2027-10-27；本波沒做完由第 6 波第一優先接手（plans-keep 已加）。
