# 續約路徑潛伏組（renewal-path-hardening）規劃書

<!-- plans-keep: 第 5 波 S6 規劃（W5-1：本波必交規劃＋審查，實作有完成才上）；退場條件＝/tdd-implement 收尾刪除；若 11/22 前未實作完，隨主 session PR 先合併，由第 6 波接手後刪 -->

工項 S6（`docs/plans/launch-wave-5/plan.md` §2；裁決 W5-1、W5-7、W5-8、W5-9，本規劃的裁決 W5-49～52 見 §6）。
觸發期限 **2027-10-27**（正式站最早到期日：prepare 對 active 者一律 400，第一批會員過期前沒人能走進續費路徑）。
基準＝develop `54ac83f`（S2 #510 已合併：`prepare_payment_order`、重複付款偵測 `20261111000003`、冪等唯一索引 `20261111000001`）。
稽核行號以 main `f88bae5` 為準，本檔行號一律以 develop `54ac83f` 現算。

**修訂紀錄**：v1 `078d9fe` → 審查 `review.md`（P0 0／P1 16／P2 13）→ v2（本版）：16 條 P1 全收、P2 除註明者外全收、W5-49～52 落入正文。

## 0. 一句話

讓過期會員的續約／新約只依**實際付款的那張單**生效、推薦關係不會成環、續費者不會被當成首購或被送回結帳頁重付，
並把新約的確認與推薦王語意對齊業主裁決（W5-7、W5-8）。這些都是 2027-10-27 第一批會員到期後就會碰到的錯錢、錯綁路徑。

## 1. 使用者需求

對照規格書：§4.1（註冊完成後唯一自助換線＝新約）、§6.2（續約雙模式、fresh 護欄、重複付款）、§7.2（組織圖）、§7.4（預設推薦人）、
§8.2–8.4（發放時機、冪等與自癒、ledger_reset）、§9.1–9.2（推薦王、pair-history）。

代號：M＝過期會員，Y＝M 原上代，X＝別的會員，D＝M 的一代下線，U＝某上線。

### R1　ref P0-1＝pay P0-1：新約棄單後改付續約，仍換線並發獎

- 重現：M（上代 Y）選新約、填 X 的碼 → `/payuni/prepare` 在**建單時**就寫 `profiles.referred_by_user_id = X`
  （`index.ts:2111-2122`；未填碼時寫預設推薦人，`:2153-2164`）→ M 放棄 PayUni 頁 → 回結帳頁改選續約並付款
  → `apply_referral_side_effects` 讀 profiles（`20260726000102:72-76`）把推薦邊 rewire 到 X，三代 100P 發給 X 線、X 任務 +1；
  M 走 extend，不清帳本。結果：**不扣點也能換上代**；直接打 API 呼叫 prepare、不付款也能做到。
  即使 M 從此不再付款，profiles 已與 `referral_edges` 不一致，下一次任何付款都生效。
- 另一觸發點（S2 留下的已知限制）：fresh 換線的 profiles 寫入發生在 `prepare_payment_order` 之前（`:2177-2201`），
  RPC 回 `active`／`suspended`／錯誤時不回復。
- 要的行為：換線意圖記在**那張訂單**上；只有該筆 fresh 訂單付款成功（且是續費者、非重複付款）時才寫 profiles 並 rewire。
  建單、棄單、extend 付款都不動 profiles。重複付款的 fresh 單不換線（W5-49①）。

### R2　ref P0-2：推薦成環

- 重現：D 的上代是 M。M 過期選新約填 D 的碼並付款 → 邊 M→D、D→M。M 付款：gen1＝D、gen2＝D 的上代＝M（**自己領 100P**）、
  gen3＝M 的上代＝D（D 兩份）。之後 D 每次付款 M 也拿 gen2。三角環 M→A→B→M 同理。`loadNetwork` 在環上把一代覆寫成三代。
  prepare 驗碼只擋 `referrerUserId === user.id`（`index.ts:2107`），`referral_edges` 只有 `referee <> referrer`。
- 併發重現（系統審查 P1-1）：A、B 皆過期，A 選 B 的碼、B 選 A 的碼，兩筆付款同時完成；各自只持有自己的 profiles 鎖，
  環檢查都讀到對方未 commit 的舊邊 → A↔B 成環。
- 要的行為（W5-49③）：新上代若在 M 的下線樹內（**任何深度**）→ prepare 回 400；付款當下在全域序列化鎖內再擋一次；
  付款當下才成環 → 維持原上代、帳本照清、error 告警（W5-49②，與 §7.4 A11 同形）；
  `pay_referral_generations` 遇收獎者＝付款人本人時停發（縱深）。

### R3　pay P1-1＝auth P1-1：續費者走首購路徑（renewalMode＝null）

- 重現：首購時 CompleteProfile 寫下 `pendingUser`（無 `subscriptionEndDate`），之後從未登出 → 一年後到期 → 守衛導結帳頁
  → localStorage 分支用舊快照（`PaymentCheckout.tsx:224-262`，`isRenewal = !!pendingUser?.subscriptionEndDate`，`:370`）
  → 不顯示續約／新約、送單不帶 body → 後端 `renewalMode=null`（`index.ts:2030-2031`）→ `process_successful_payment` 以付款日起算、
  不清帳本、不換線。結果：過期 N 年付 1 筆就拿「今天起一年＋保留點數與上線」，繞過補繳與新約清帳。手工打 API 不帶 body 同效。
- 要的行為：後端對**已有訂閱紀錄**者收到 null → 400 `RENEWAL_MODE_REQUIRED`（Edge 與 RPC 鎖內各一道）；
  prepare 以外的路徑讓曾訂閱者的 null 單走到付款 → 照常開通（行為不變）＋error 告警（W5-50①）；
  前端結帳頁以 `/profile` 為準判定續費身分，舊快照只當首繪。

### R4　pay P1-4：續費者付款成功但卡單，被送回結帳頁

- 重現：續費者 `effective_registration_step` 恆為 3（已有 completed 單）→ `buildProfileResponse` 在 step 3 強制
  `paidAwaitingActivation=false`、`lastTradeNo=null`（`index.ts:637-641,655-657`），自癒 heal 也只在 step 2 跑（`:624`）
  → 金額不符或 `process_successful_payment` 失敗、自癒收斂不了 → 守衛判 `renew` → 結帳頁 → 使用者以為沒付成功再付一次。
- 要的行為：非 active 者只要有 pending＋SUCCESS 就 `paidAwaitingActivation=true` 並帶該筆 `lastTradeNo`，先跑 heal；
  前端守衛既有的 `activating` 分支（`registrationFlow.ts` 的 `classifyMembershipGate`，先於 `renew`）把人導
  `/payment/result?tradeNo=<lastTradeNo>`，該頁既有「付款成功，正在開通會員資格」＋輪詢＋逾時交客服（`PaymentResult.tsx:443-`）。
  prepare 在鎖內遇到這種單 → 409 `PAYMENT_PENDING_ACTIVATION`＋`lastTradeNo`＋system_alert；修不好的單會讓此人一直 409，
  由客服人工開通（W5-50②，接受）。首購者（step 2）同樣適用（行為變更，見 §5 階段 2 測試）。

### R5　W5-7（pay P2-10）＋W5-51：新約無條件二次確認

- 現況：只在有點數／有下線／付過補繳時才確認，且要求 `!!renewal`（`PaymentCheckout.tsx:393-398`）；無資產的 fresh 照樣換線卻不確認。
- 要的行為：
  - 範圍＝**續費者**選新約（首購不出現模式選項、送 null，不經此框）。觸發條件只看 `renewalMode === 'fresh'`。
  - 框內段落：資產清空（零值不唸，現行）→ 已付補繳（現行）→ 推薦人句 → 效期（現行）。
  - 推薦人句（W5-51，依建單時會套用的 source）：填碼且驗證通過＝「您的推薦人將改為 {姓名}。」（姓名缺漏退回「您輸入的推薦碼的推薦人」）；
    留空且預設推薦人可用（default）＝「您的推薦人將改變。」（不揭露預設推薦人，§7.4）；留空且預設不可用（keep）＝**不寫推薦人句**。
    前端要知道 default／keep → `/subscriptions/status` 的 renewal 契約加 `freshDefaultReferrerAvailable: boolean`（後端同一個 validate 判準）。
  - 無資產（點數 0、推薦 0、未付補繳）時加一句「目前沒有點數或推薦紀錄需要清空。」，確認鈕用**墨黑流程鈕**；
    有資產時維持紅實心（W5-51、`docs/ui-ux-guidelines.md` §12.11）。
  - renewal 未載入或讀取失敗：不開框、付款鈕維持現行 AC-17 停用與重試（`:478`），不讓「沒有資產資料的框」出現。
  - 新碼 `unavailable`（暫時無法驗證）：沿用現行「按付款＝重驗、不送單」（`:495-509`），重驗通過後下次按付款才開框；`invalid` 現行即擋。
- 測試〈fresh 無資產且未付過補繳時，付款不需二次確認直接送單〉改成反向斷言（W5-7 授權）。

### R6　W5-8（ref P2-2、P2-3）：新約對推薦王的語意

- 重現 P2-2：U 當月已滿門檻拿到第 1 張 credit（`round_ordinal=1`），同月 U 做 fresh → 當月桶被刪，但 `max(round_ordinal)=1` 還在
  → `reconcile_king_credits`（`20260724000003:152-173`）要當月桶長度 ≥ 2×門檻才發第 2 張。
- 重現 P2-3：fresh 刪當月桶（`20261111000003:159-165`）＝刪了 pair-history 的一部分 → 當月才加入的下線 R 明年以同一上線續約時
  「R 從未出現在 U 歷史」成立 → U 任務**再 +1**，違反 §9.2 不變式。
- 要的行為（W5-8）：已發出的 credit（含 unclaimed）保留；fresh 後當月從 0 計門檻（再滿一個門檻發下一張）；
  當月桶只清計數，配對名單另存，「R 從未出現在 U 歷史」跨清空成立。門檻一律讀 `reward_config.referral_king_monthly_threshold`。

### R7　同類掃描：`referred_by_changed_at` 閘門（W5-52：留在本工項）

- 重現：#167 閘門（`repair_orphaned_payments`，`20260807000001:90-91`）比 `referred_by_changed_at <= po.completed_at`；
  觸發器（`:43-57`）一律寫 `now()`，而 `completed_at = v_paid_at`（PayUni 授權時點，`payuni_paid_at`）早於付款交易的 `now()`。
  首購未填碼 → 付款交易內 `apply_referral_side_effects` 3a-bis 回寫預設推薦人 → changed_at 晚於 completed_at
  → 若這筆的三代發獎失敗，自癒**永遠排除**它。正式站已有 3 筆 changed_at > completed_at（延遲 2～38 秒；獎金都已正常發，潛伏無損失）。
  `20260807000001` 註解「同交易 changed_at == completed_at」不成立。本工項的 0d 換線也會踩同一個坑（§8.3 自癒）。
- 要的行為：付款交易內寫推薦人時，changed_at 記付款時點 `p_paid_at`；其他寫入點（register、admin）仍記 `now()`。

### 不做

- ref P2-4（fresh 與 extend 兩單交錯、付款當下有 pending 提領）——S2 已讓「已 active 時付的 fresh」不清帳本；剩餘時序留第 6 波候選。
- `pendingUser` 綁 uid、付款成功清除（ref P1-8＝pay P1-5）——第 6 波候選；本工項只讓結帳頁不以快照判定續費身分。
- 已存在的環或不一致資料的自動修復（正式站 11/05 查：環 0、自領 0；見 progress.md）。
- 回寫既有 3 筆 changed_at（獎金已發，閘門只影響未來補發）。

## 2. 系統設計

### 2.1 migration 分配與基準（架構審查 P1-4）

| 檔（版本號施工時現定，跑 `check-migration-versions.py`） | 階段 | 內容 | 函式基準 |
|---|---|---|---|
| **A1** `…_referral_cycle_guard.sql` | 1 | `referral_would_cycle`（新）；`pay_referral_generations` | `pay_referral_generations`＝`20261111000001` |
| **A2** `…_renewal_referrer_intent.sql` | 2 | `payment_orders` 三欄；`prepare_payment_order` 六參數版（新）＋三參數 wrapper；`process_successful_payment`；`apply_referral_side_effects`；`track_referred_by_change` | `20261111000002`、`20261111000003`、`20260726000102`、`20260807000001` |
| **B** `…_referral_pair_history.sql` | 5 | `referral_pair_history`＋回填；`task_progress.king_round_base`；`process_successful_payment`；`apply_referral_side_effects`；`reconcile_king_credits` | 前兩支＝**A2**；`reconcile_king_credits`＝`20260724000003` |

每支檔頭照慣例寫「基準＝X，唯一差異＝…」。B 必須在 A2 之後（階段 5 晚於 2）。

### 2.2 A1：環偵測（R2）

- `referral_would_cycle(p_referee uuid, p_new_referrer uuid) returns boolean`：`p_new_referrer = p_referee` → true；
  否則自 `p_new_referrer` 沿 `referral_edges.referrer_user_id` 往上走，`with recursive … union`（非 union all，去重保證終止，
  既有環也不會無窮迴圈），遇到 `p_referee` → true。security definer、`set search_path = public`、只 grant service_role。
- `pay_referral_generations`：任一代收獎者＝`p_referee` → 該代與其後各代不發，寫 error 告警 `referral_cycle_detected`。

### 2.3 A2：換線意圖、建單、付款（R1、R2、R3、R4、R7）

**欄位**：`payment_orders` 加
`fresh_referrer_user_id uuid references profiles(id) on delete set null`、`fresh_referrer_code text`、
`fresh_referrer_source text check (fresh_referrer_source in ('code','default','keep'))`。
非 fresh 單、首購的 fresh 單三欄皆 null。`source=null` 的續費 fresh 單＝A2 套用後、新 Edge 部署前由舊 Edge 經 wrapper 建的單
（舊 Edge 已直接寫過 profiles）——正式站也可能出現（系統審查 P2-2），付款時不動 profiles。
`source='default'` 時 `fresh_referrer_user_id`／`code` 透過 `payment_orders_select_own` 可被本人讀到，與 `profiles.referred_by_code` 現況同級、
非新增暴露面——接受（系統審查 P2-3）。

**`prepare_payment_order` 六參數版**
`(p_user_id, p_trade_no, p_renewal_mode, p_referrer_user_id, p_referrer_code, p_referrer_source) returns jsonb`：
鎖 profiles 後依序回 `{outcome}`：`not_found` → `suspended` → `active` →
`paid_pending`（有 pending 且 `payuni_response->>'Status'='SUCCESS'`；回 `{outcome, trade_no}`，並寫 system_alert `checkout_blocked_paid_pending`，W5-50②）→
`mode_required`（null 且 `exists subscriptions`）→
`cycle`（`source='code'` 且 `referral_would_cycle`）→ insert（`source='default'` 而成環 → 改寫 `keep`＋告警 `default_referrer_unavailable_on_fresh`，回 ok）→
`duplicate_trade_no`／`ok`。
**三參數 wrapper**：`returns text`，委派六參數版（意圖欄 null）並回 `outcome` 字串；新 outcome 會讓舊 Edge 走「未預期值 → 500」（`index.ts:2198-2201`），
fail-closed、只存在於部署空窗——接受並寫測試（架構 P2、系統 P2-2）。下一波 drop。

**`process_successful_payment`**（基準 `20261111000003`；唯一差異如下）：
- 0b 之後新增 **0d 換線**，條件 `v_renewal_mode='fresh' and v_is_renewal and not v_duplicate and fresh_referrer_source in ('code','default')`
  （`v_is_renewal` 補上：首購手打 fresh 不換線，系統審查 P2-1）：
  ```
  begin
    perform pg_advisory_xact_lock(<常數：referral rewire>);   -- 全域序列化所有換線（系統審查 P1-1）
    if fresh_referrer_user_id is null then 告警 fresh_referrer_missing，不換線
    elsif referral_would_cycle(p_user_id, fresh_referrer_user_id) then 告警 fresh_referrer_cycle，不換線
    else
      perform set_config('uknow.referred_by_changed_at', v_paid_at::text, true);
      update profiles set referred_by_user_id/code/is_default(source='default') where id = p_user_id;
    end if;
  exception when others then
    告警 fresh_rewire_failed（error，context：trade_no、意圖三欄、sqlerrm）——不換線、付款照完成
  end;
  ```
  鎖序：payment_orders → profiles（0b）→ advisory。持有 advisory 之後只重入已持有的 profiles 鎖、讀 `referral_edges`、
  寫 edges（3b，在 apply 內、同交易），不再等任何別的列鎖 → 無環、無死鎖。全域鎖只在續費 fresh 付款時取，競爭極小。
  3b 的 edge upsert 在同一交易、advisory 仍持有，所以「檢查到寫邊」整段被序列化。
  失敗語意（W5-49②、系統審查 P1-2）：不換線、3-0 帳本照清、人工處理；上線後對帳查詢涵蓋此態（§7）。
- 0d 不換線但 `fresh_referrer_source` 有值、且 `v_duplicate` 時：duplicate 告警的 context 加 `fresh_referrer_*`（W5-49①，客服判斷）。
- `v_is_renewal and v_renewal_mode is null` → error 告警 `renewal_without_mode`；效期、帳本、推薦人行為不變（W5-50①）。

**`track_referred_by_change`**（基準 `20260807000001`；R7、架構審查 P1-5）：
判準＝交易層 GUC：`v_at := coalesce(nullif(current_setting('uknow.referred_by_changed_at', true), '')::timestamptz, now())`；
INSERT 帶推薦人、UPDATE 推薦人實質變動時寫 `v_at`。只有付款交易（0d、apply 3a-bis）會 `set_config(..., true)`（交易結束即失效），
register／admin 寫入沒設 → 仍是 `now()`。不靠「新舊值是否不同」判斷，沒有「恰等於舊值」的漏洞。
**`apply_referral_side_effects`**（基準 `20260726000102`）：唯一差異＝3a-bis 回寫前 `set_config('uknow.referred_by_changed_at', coalesce(p_paid_at, now())::text, true)`。
`repair_orphaned_payments` 呼叫 apply 時傳 `po.completed_at`，補寫的預設推薦人同樣記付款時點，閘門自洽。

**鎖序總表**：prepare RPC 只鎖 profiles（同 S2）；付款 payment_orders → profiles →（續費 fresh 才）advisory；
repair 系列只鎖 profiles。新增的 advisory 永遠是最後一把、只有付款路徑取 → 無新增死鎖可能。

### 2.4 Edge `/payuni/prepare`（R1、R2、R3、R4）

- 守衛順序（架構審查 P2）：讀取 suspended → 403；active → 400（現行）；**之後**才做預檢：
  `mode_required`（null 且有訂閱紀錄；與 extend 分支共用 subscriptions 讀取）、fresh＋碼的 `cycle`（呼叫 `referral_would_cycle`）。
  預檢只為提早失敗；最終以 RPC 鎖內優先序為準。
- 刪掉兩段 `profiles.update`（`index.ts:2111-2122`、`:2153-2164`）；兩條分支只算出 `{referrerUserId, code, source}` 傳給六參數 RPC。
  無訂閱紀錄者送 fresh → 意圖全 null（首購不換線）。default 解析失敗沿用 `default_referrer_unavailable_on_fresh` 告警並以 `keep` 建單。
- **錯誤形狀（架構審查 P2）**：新拒絕一律沿用停權 403 的 `{ success:false, error:{ code, message } }`；`api-contract.ts` 新增
  `PAYMENT_PENDING_ACTIVATION`（409，另帶 `lastTradeNo`）、`RENEWAL_MODE_REQUIRED`（400）、`REFERRAL_CYCLE`（400）與
  `PrepareErrorBodySchema`（含既有 `ACCOUNT_SUSPENDED`）；既有字串 `error` 的 400（推薦碼無效、自我推薦、pending 提領）不動。
  訊息：`RENEWAL_MODE_REQUIRED`＝「請選擇續約或新約」；`REFERRAL_CYCLE`＝「此推薦碼屬於您的推薦網絡成員，無法作為推薦人」（Q5 規劃者定案，W5-52）；
  `PAYMENT_PENDING_ACTIVATION`＝「付款已完成，開通處理中」。

### 2.5 `/subscriptions/status` renewal 契約（R5）

`RenewalInfoSchema` 加 `freshDefaultReferrerAvailable: boolean`：讀 `reward_config.default_referrer_code` → `validate_referral_code`，
可用且不是本人 → true。與 prepare 的 default 分支同一判準（抽成共用 helper，單一真相）。讀取失敗 → 端點既有的 fail-closed 5xx。
只回布林，不回碼或姓名（§7.4 不揭露）。

### 2.6 `/profile` 卡單旗標（R4）

`buildProfileResponse`：`paidAwaitingActivation = !!paidOrder && acct?.status !== 'active'`，不再依 step 蓋掉；
heal 條件由 `registrationStep === 2` 改為 `paidAwaitingActivation`（有界重入不變）；`lastTradeNo`：
`paidAwaitingActivation` 時給 paidOrder 單號，否則維持 step 2 既有語意。step 3 的 `repair()` 照跑。

### 2.7 B：pair-history 與推薦王（R6）

- 新表 `referral_pair_history (referrer_user_id uuid references profiles(id) on delete cascade, referee_user_id uuid references profiles(id) on delete cascade,
  first_month_key text not null, created_at timestamptz not null default now(), primary key (referrer_user_id, referee_user_id))`；
  RLS 開、無 policy，`revoke all from anon, authenticated`（只有 definer 函式讀寫）。
- 回填（DDL 之後分段，`on conflict do nothing`，`first_month_key` 取最早月份）：
  `task_progress.monthly_referrals`（jsonb `{月份: [下線 uuid]}`）各月陣列
  ∪ `reward_transactions where type='referral_reward' and generation=1 and source_claim_id is null and referee_user_id is not null`
  的 `(user_id, referee_user_id)`（月份取該列 created_at 的台北月份）。後者補回過去 fresh 刪掉的當月桶配對；claim 發的列不是「付款 +1」配對，排除。
  預期：正式站 15 列、develop 10 列（兩來源差集皆 0，progress.md）。**既有表零變動**：回填只 insert 新表。
- `task_progress` 加 `king_round_base jsonb not null default '{}'`：`{月份: fresh 當下該月已發張數}`。
- `apply_referral_side_effects` 3d：pair 判準改查 `referral_pair_history`；+1 時同交易 insert pair 並 append 當月桶（桶仍是計數與
  「本月推薦詳情」清單的來源，`/tasks`、`/tasks/current-month-top` 不改）。
- `process_successful_payment` 3-0：刪當月桶之外，`king_round_base[月份] = 該月 max(round_ordinal)`（無則不寫）；pair 表、credit 不動。
- `reconcile_king_credits`：`v_target = coalesce(king_round_base[月份], 0) + floor(當月桶長度 / 門檻)`；已發 1..k 保留，fresh 後再滿一個門檻發 k+1。
  多次 fresh 時 base 取當下 max，單調。

## 3. 架構影響

- 後端：`index.ts` 第 4 區段（`buildProfileResponse`）、第 7 區段（`/payuni/prepare`）、第 8 區段（`/subscriptions/status`）；三支 migration；`_shared/api-contract.ts`。
- 前端：`PaymentCheckout.tsx`（續費身分以 server profile 為準、新錯誤碼、確認框）；`registrationFlow.ts` 不改（`activating` 先於 `renew`）；
  `PaymentResult.tsx` 不改（既有開通中畫面）。
- multi-step-flow 四契約：結帳頁 localStorage 從「判定依據」降為「首繪」，符合「伺服器狀態為真」；已付款待開通由 prepare 409 兜底。
- 安全：`referral_would_cycle`、新 `prepare_payment_order` 只 grant service_role（`security-definer-grants.test.ts` 動態掃描）；新表 RLS 無 policy＋revoke（階段 5 斷言）。
- 效能：環檢查沿主鍵往上爬，深度＝樹高（正式站個位數）；全域 advisory 只在續費 fresh 付款取。

## 4. UI/UX（結帳頁）

- **localStorage 分支三態**（UI/UX 審查 P1-4）：首繪用快照；背景 `/profile`（現有停權確認那支，`:255-266`，擴大用途）回來前
  付款區顯示「正在確認您的會員狀態…」並停用付款鈕（**獨立文案**，不沿用停權語意）；
  成功 → 以 server profile 取代快照、跑 `resolveCheckoutPageRedirect`（可能導結果頁或會員中心），續費者切成雙模式；
  失敗 → 付款區內嵌「暫時無法確認會員狀態」＋重試鈕，付款鈕**維持停用**（不放行，避免回到 R3）。
  切換版面時：快照分支沒有可輸入欄位（首購版只有確認資料），續費雙模式的輸入（新推薦碼）在切換後才出現，無輸入遺失問題。
- **`RENEWAL_MODE_REQUIRED`**（UI/UX 審查 P1-5）：自動重抓 `/profile` → 切成雙模式 → 模式選擇區上方內嵌提示「已更新您的會員資料，請選擇續約或新約」，
  捲動並聚焦到模式選擇區；toast 只當輔助。不叫使用者重新整理。
- **`PAYMENT_PENDING_ACTIVATION`（409）**（UI/UX 審查 P1-6、R4）：付款鈕保持停用直到導向完成；導 `/payment/result?tradeNo=<lastTradeNo>`
  （既有開通中畫面與輪詢、逾時交客服）；toast「付款已完成，開通處理中」只當輔助。`lastTradeNo` 缺漏時導 `/dashboard`
  （守衛會依 `/profile` 的 `activating` 再導結果頁）。
- **`REFERRAL_CYCLE`**：比照既有推薦碼錯誤，標在新推薦碼欄位、撤銷已驗證狀態。
- **新約確認框**：見 R5。內容區 `max-h` 加捲動，於 375px 寬驗最長狀態（資產全有＋已付補繳＋推薦人句）（UI/UX 審查 P2）。
- 行動版：全部沿用既有元件（AlertDialog、內嵌 callout），不新增版面。

## 5. 階段切分

規格書改動**隨觸發它的階段提交**（`check-spec-drift.py` 每階段跑），不集中到最後（架構審查 P2）。

| # | 階段 | 測試落點 | 驗證標準 | 規格書 |
|---|---|---|---|---|
| 1 | A1：環偵測＋自領停發（R2 SQL） | `api/referral-cycle.test.ts`（新，db） | `referral_would_cycle` 對一～四代下線、自己 true，對旁支與自己的上代 false；以 SQL 造 M↔D 環，M 付款無自領列＋告警；既有環不無窮迴圈 | §7.2、§8.2「禁止成環」 |
| 2 | A2：意圖欄＋六參數 RPC＋wrapper＋0d＋null 告警＋changed_at（R1、R2、R3、R4、R7 的 SQL 部分） | `api/renewal-referrer-intent.test.ts`（新，db，**全部以 SQL 直接呼叫 RPC 造單**）、`prepare-payment-order.test.ts`、`repair-retro-rewards.test.ts` | **紅燈主案例**（RPC 層）：fresh 意圖 X 的單不付 → extend 單付款 → 邊、gen1–3、任務仍歸 Y，profiles 仍 Y；fresh 單付款後才換線；`mode_required`、`paid_pending`（續費者與首購各一，含 alert）、`cycle`；付款當下成環／被選者已刪 → 不換線＋告警、帳本照清；0d 例外不回滾付款；duplicate fresh 不換線且告警帶意圖；首購 fresh 不換線；兩筆互選付款併發 → 不成環（兩連線測試）；首購預設推薦人付款後 changed_at＝completed_at、repair 補得到；register 改推薦人仍記 now()；wrapper 回傳新 outcome 字串。**本階段不動** `renewal-modes.test.ts`、`fresh-default-referrer.test.ts`（Edge 層，歸階段 3） | §6.2 重複付款段（fresh 不換線）、§8.3 自癒閘門 |
| 3 | Edge prepare＋契約（R1、R2、R3、R4 Edge 部分） | `api/renewal-modes.test.ts`、`fresh-default-referrer.test.ts`（既有「prepare 寫 profiles」斷言改寫）、`api/payuni-prepare-errors.test.ts`（新）、`api-contract` 型別 | 紅燈主案例（Edge 層）：prepare(fresh,X) 不付 → prepare(extend) 付款 → profiles、邊不變；RPC 回 active／suspended 時 profiles 不變；曾訂閱者無 body → 400 `RENEWAL_MODE_REQUIRED`；填一代碼 → 400 `REFERRAL_CYCLE`；停權者先得 403；409 帶 `lastTradeNo`；錯誤形狀符合 `PrepareErrorBodySchema` | §6.2 fresh 護欄、§7.4 套用時點與 `referred_by_is_default` 重置時點 |
| 4 | `/profile` 卡單旗標＋heal；`/subscriptions/status` 加 `freshDefaultReferrerAvailable`（R4、R5 後端） | `api/profile-self-heal.test.ts`、`api/subscriptions-status.test.ts` | 續費者（step 3、expired）pending＋SUCCESS → 旗標 true、帶 `lastTradeNo`、先 heal；active 者 false；default 可用／不可用／自己 三案 | §6.2（無條件確認的資料來源）|
| 5 | B：pair-history＋回填＋king_round_base（R6） | `api/fresh-ledger-forfeit.test.ts`、`king-multi-credit.test.ts`、`api/referral-pair-history.test.ts`（新：回填、RLS） | 同月已有 1 張 credit 再 fresh → 原 credit（含 unclaimed）保留、再滿門檻（讀 config）發第 2 張；當月加入的 R 於 fresh 後續約 → U 任務不 +1；回填含 gen1 推得配對、排除 claim 列；anon／authenticated 讀不到新表；既有表列數不變 | §9.1、§9.2（pair-history 本體改為表、「當月桶」措辭） |
| 6 | 結帳頁（R3 前端、R4 前端、R5） | `src/components/PaymentCheckout.test.tsx`（jsdom） | 舊快照＋API 為 expired 續費者 → 確認中文案 → 雙模式、送單帶 renewalMode；`/profile` 失敗 → 內嵌重試、付款鈕停用；`RENEWAL_MODE_REQUIRED` → 內嵌提示＋聚焦；409 → 導結果頁、鈕停用；fresh 無資產也彈框（W5-7 反向斷言）、墨黑鈕、「沒有需要清空」句；推薦人句三態（code／default／keep）＋姓名缺漏；有資產紅實心；renewal 為 null 不開框 | §6.2 二次確認措辭（無條件） |
| 7 | e2e mocked＋journey f70 | `e2e/features/*renewal*`（mocked Gherkin）、`e2e/journey/features/70_renewal_saga.feature`（CI dispatch） | mocked：舊快照續費者看得到雙模式；無資產新約確認框；journey 見下；`check-test-names.py` 綠 | — |

**journey f70 補章**（真後端、CI 才跑；演員沿用 orgchart-saga.yaml）：

- 插章 4a「新約棄單改續約」：第 4 章前，演員選 fresh 填別樹碼 → 到 PayUni 頁返回不付 → 改 extend 付款 → 斷言上代、三代收獎者、任務計數不變【DB】。
  同章 API 步驟：演員以 API 打 prepare 不帶 body → 400 `RENEWAL_MODE_REQUIRED`【API】（R3）。
- 插章 4b「環防線」：以一代下線的碼選 fresh → 欄位錯誤訊息【GUI】；DB 無自領列。
- 第 7 章補：同月已有 credit 的演員做 fresh → credit 仍在、再滿門檻才發下一張（演員湊不出門檻時只驗 credit 保留，門檻部分留 D 層）。
- 第 9 章補：無資產 fresh 也出現確認框、含「推薦人將改變」、墨黑確認鈕【GUI】。
- R4 不進 journey：要造「SUCCESS 但開通失敗、自癒收斂不了」的卡單，真後端上只能靠竄改金額或注入失敗，屬 D 層（階段 2、4）。

## 6. 裁決（原開放問題）

| 題 | 裁決 |
|---|---|
| Q1 重複付款的 fresh 單是否換線 | **不換**，duplicate 告警帶意圖（W5-49①） |
| Q2 付款當下才成環 | **維持原上代、帳本照清、error 告警**（W5-49②） |
| Q4 環的判定範圍 | **任何深度**（W5-49③） |
| Q3 曾訂閱者的 null 單走到付款 | **照常開通＋error 告警**（W5-50①） |
| D4 修不好的 SUCCESS pending 單致永久 409 | **接受**，擋下時寫 system_alert，客服人工開通（W5-50②） |
| Q6／D2 留空新約的推薦人句 | **依 source 分句**：default＝「推薦人將改變」、keep＝不寫（W5-51） |
| D3 無資產確認鈕色 | **有資產紅實心、無資產墨黑流程鈕**（W5-51） |
| D1 changed_at 修正去留 | **留在本工項**（W5-52） |
| Q5 環的 400 訊息 | 點明「屬於您的推薦網絡成員」（規劃者定案，W5-52） |

尚無未決題。

## 7. 風險與回滾

- **正式站資料影響**（15 筆訂閱、21 列 reward_transactions；全員 active 至 2027-10-27；主 session 11/05 代跑結果見 progress.md）：
  - A1、A2：只加 nullable 欄、新函式、換函式定義；既有列零變動。現存 pending fresh 單 0。
  - B：新表回填 15 列；`king_round_base` 預設 `{}`（ledger_reset 0 → 無 fresh 歷史可補）；既有 1 張 credit 不動；21 列 reward_transactions 零變動。
  - 驗證 SQL（列進 PR 上線後清單）：`select count(*) from referral_pair_history`＝15；
    回填前後 `reward_transactions`、`referral_king_rewards`、`task_progress` 列數相同。
  - 環 0、自領 0；profiles／edges 不一致 1 列為已註冊未首購（正常）。
- **上線後對帳查詢**（續費潮開始後定期跑）：完成的 fresh 單 `fresh_referrer_source in ('code','default')` 且非 duplicate，
  但 profiles 推薦人 ≠ 意圖 → 應恰等於 `fresh_rewire_failed`／`fresh_referrer_cycle`／`fresh_referrer_missing` 告警數。
- **部署順序**：migration 由 Supabase 原生整合在 push 時套用，Edge 在 CI 綠後部署——migration 先。
  空窗內舊 Edge 經 wrapper 建單：一般情況照常；遇新 outcome → 500（fail-closed）；建出的 fresh 單 `source=null`、profiles 已由舊 Edge 寫過。
  新 Edge 對舊 DB 不會發生（順序天然成立）。
- 最壞情況：0d 錯 → fresh 付款不換線（付新約卻留原上代）；有告警與上述對帳查詢可見。
  回滾：函式回滾＝新 migration 重套上一版定義；新表、新欄保留（不刪資料）。
- 期限：觸發最早 2027-10-27；本波沒做完由第 6 波第一優先接手（plans-keep 已加）。
