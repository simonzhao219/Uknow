# 金流與推薦的並行防線 規劃書

<!-- 第 5 波工項 S2（docs/plans/launch-wave-5/plan.md §2；裁決 W4-33、W5-4、W5-5、W5-9、W5-11～14）。
     稽核編號引用 docs/plans/launch-wave-4/audit-{pay,auth,ref}.md；行號一律以 develop 現算。
     修訂 r2（11/05）：納入業主裁決 W5-11～14 與 review.md 的 13 條 P1（D 段縮小後作廢的見 §8）。 -->

## 0. 一句話

讓「同一個人在同一瞬間做兩件會動到錢或推薦樹的事」不再產生重複付款、重複發獎、錯綁推薦或錢收了帳號沒了，
並讓停權者付不了款——五條都是現役路徑（正式站目前 0 例），付錢的人一旦撞上就只能靠客訴發現。

## 1. 使用者需求

對照規格書：§2.1（註冊中角色）、§4.1（註冊完成後資料鎖定、付款與 register 共用 profiles 列鎖）、§4.2（推薦碼）、
§5.2（停權凍結項）、§5.3（讀取失敗 fail-closed、register 503 語意）、§6.2（續約雙模式）、§8.3（冪等鍵）。

| # | 稽核編號／裁決 | 驗收情境（具體輸入 → 期望結果） |
|---|---|---|
| A | pay P1-2；W5-11、W5-13 | 首購者兩分頁各按「前往付款」，兩張 PayUni 頁都付成功 → 第二筆**不得**從付款日再起算一年（與第一筆重疊）；改以續約錨點接續、**不跑** fresh 清帳本、三代獎金照發；寫 error 級 `system_alerts`（source `duplicate_payment`），context 帶兩筆 trade_no 與該筆發出的獎金列，客服據此個案退款並人工沖銷。告警寫入失敗時付款仍 completed |
| B | auth P0-1、P1-2＝ref P1-1 | `/auth/register` 帶碼 X：查碼遇 DB 錯誤 → 503 `REFERRAL_CHECK_UNAVAILABLE`、**不寫入**、前端停原頁保留草稿；X 查無／推薦人停權／碼 inactive → 400，三者回應逐位元組同形，前端把推薦碼欄位標錯並清掉「驗證成功」狀態；X 是自己的碼 → 400；`referralCode` 非字串 → 400（不再 500） |
| C | ref P1-2＋P2-1 | 有 claim 孤兒（claimed 但上線續約獎勵未入帳）時，同一人兩個並行 `/auth/profile` → 每代恰好一列 100P；`reward_transactions` 存不進同一事件的第二列 |
| D | auth P1-4；**W5-12** | 完善資料頁的「稍後註冊」**不再刪帳號**，等同頁首「登出」：保留帳號、資料與草稿，下次登入接回原步驟。`DELETE /auth/cancel-signup` 端點退場——「刷卡中另一分頁刪帳號」這條路徑整個消失。註冊中要刪帳號找客服 |
| E | W5-5（pay P2-9＝auth P2-1）；W5-14 | 停權者進結帳頁 → 顯示停權卡、無付款鈕；直接打 `/payuni/prepare` → 403 `ACCOUNT_SUSPENDED`、不建單、不改 profiles；已建單、付款途中才被停權 → notify 到達時照開通，寫 error 告警（source `payment_while_suspended`）；規格書 §5.2 凍結項加「付款」 |

**不做**（明確排除）：
- prepare 的 fresh／extend 分支邏輯（換線時點、續費者 `renewalMode=null`、卡單旗標）——S6（ref P0-1、pay P1-1、P1-4）。本工項只加鎖所需的最小改動。**已知限制**：fresh 換線的 profiles 寫入發生在建單 RPC 之前、不在鎖內，S6 把它收進鎖內。
- 結帳頁 localStorage `pendingUser` 不綁 uid（pay P1-1 前端、P1-5）——第 6 波候選；本工項只在 localStorage 分支補「以 `/profile` 覆蓋停權判斷」（§2.6）。
- 對帳端點（`/internal/reconcile-pending-payments`）——S1。
- PayUni 退款 API 串接：重複付款只告警，退款由客服在 PayUni 商店後台人工辦。

## 2. 系統設計

### 2.1 鎖序總則（規劃必答 1）

現行唯一的跨表鎖序是 `process_successful_payment`：**payment_orders 該筆 `for update` → profiles 該人 `for update`**
（`20260802000002` 0／0b），`apply_referral_side_effects` 在同交易內重入同一列；`pay_referral_generations` INSERT 獎金列時對上線 1–3 代 profiles 取 FOR KEY SHARE（FK）。
`register_profile` 只鎖 profiles；`claim_referral_king_reward` 鎖 `referral_king_rewards` → `subscriptions`，不 `for update` profiles。

本工項所有新鎖遵守：**先 payment_orders → 後 profiles**；只鎖 profiles 的函式不得在持鎖期間等待任何 payment_orders 列鎖（INSERT 新列不等鎖）。

| 函式 | 取鎖順序 | 與付款交易的關係 |
|---|---|---|
| `process_successful_payment`（改：重複偵測、停權告警，不加鎖） | order → profiles(U) →（FK）上線 profiles | 不變 |
| `prepare_payment_order`（新） | profiles(U) → INSERT 新訂單 | 不等任何既有訂單列鎖 → 無環 |
| `repair_orphaned_claim_rewards`（改） | 每個候選依 `claimer_id` 排序：profiles(claimer) → 重查 →（FK）上線 profiles | 不持訂單鎖；`p_user_id = null` 時排序取鎖避免全域執行互鎖 |
| `register_profile`（不動） | profiles | 不變 |

**隱性前提**：沿推薦鏈只往祖先方向取 FK key-share，無環的前提是推薦鏈無環。DB 目前沒有防環約束（ref P0-2，屬 S6）；現有付款與 claim 路徑已有同樣性質，本工項不惡化。

D 層並行測試（雙連線 `postgres`，比照 `payment-user-lock.test.ts`）斷言**兩個交易都成功或一方被業務拒絕**，不得出現 `40P01`。

### 2.2 A — 重複付款（pay P1-2；W5-11、W5-13）

**付款時點的防線（唯一防線，W5-11：不加建單時的確認框）**：`process_successful_payment` 在 0b 取得 profiles 鎖之後判斷
「付款當下此人已在效期內」：`exists (select 1 from subscriptions where user_id = p and end_date >= v_paid_at)`。

- 刻意用 `v_paid_at`（PayUni 回報的付款時點）而不是 `now()`：對帳／自癒延遲開通時，要問的是「付款那一刻是否已有效」——
  付款時已有效才是重複付款；付款時未有效、只是開通晚了，不是。prepare 用 `now()`（`user_account_status`）是因為它問的是「此刻能不能建單」，兩者問題不同。
- prepare 對 active 者回 400，所以此條件成立就代表這張單是在變成 active 之前建的、現在又付了一次。合法情形只有 extend 預付（補繳到未來後又付一筆），已降為 warning。
- `renewal_mode` 為 null／fresh → 錨點改用 extend 算法（接續 `max(end_date)`）、**略過 3-0 fresh 清帳本**；告警 `error`。
- `renewal_mode` 為 extend → 照常串接，告警 `warning`（客服知道有人一次付了兩年）。
- `apply_referral_side_effects` 照常跑（W5-13：三代獎金照發）。告警在獎金之後寫，context 帶：`trade_no`、`renewal_mode`、此人前一筆 completed 的 `trade_no`、新效期、本筆 `subscription_id` 與該 subscription_id 的 `reward_transactions` 列（id、user_id、generation、amount），供客服退款時人工沖銷。
- **關鍵路徑隔離**：偵測查詢與錨點改算是純讀＋算術，放在主體；告警（含查獎金列）包在自己的 `begin … exception when others then raise warning` 內——告警失敗不得回滾付款（現行最外層 `exception … raise` 會讓錢收了不開通）。
- fresh 第二筆若在 prepare 時已改寫 profiles 推薦人，換線仍會發生——S6 修的 ref P0-1；告警 context 的 `renewal_mode` 讓客服看得到。

**建單時點**：新 RPC `prepare_payment_order(p_user_id, p_trade_no, p_renewal_mode)`，在 profiles 列鎖下重查後 INSERT
（`amount 1200`、`status 'pending'`、`payment_method 'payuni'`、`transaction_id`、`renewal_mode`——與現行 INSERT 欄位相同）。
它解決「prepare 與付款完成的交錯」與「停權的 TOCTOU」，**不**作廢舊 pending 單——舊單的 PayUni 頁在 ExpireDate 前仍可付，DB 作廢擋不住付款，反而讓對帳（只追 pending）不再追這張單 → 付了錢卻永不開通。

| RPC 回傳 | 判準（鎖內） | Edge 回應 |
|---|---|---|
| `'ok'` | — | 照常組 PayUni payload |
| `'not_found'` | profiles 無此列 | 404 `{ success:false, error:'用戶不存在' }` |
| `'suspended'` | `suspended_at is not null`（先於 active，§5.3 停權優先擋） | 403 `{ success:false, error:{ code:'ACCOUNT_SUSPENDED', message:'帳號已停權，請聯絡客服' } }` |
| `'active'` | `select status from user_account_status where user_id = p` = `'active'`（與 Edge `readAccountStatus` 同一個 view） | 400 原文案「已有有效訂閱，請到期後再續約」 |
| `'duplicate_trade_no'` | INSERT 撞 `transaction_id` 唯一鍵（RPC 內 `exception when unique_violation`） | Edge 重產 tradeNo 再呼叫一次 RPC；仍撞回 500——保留現行「tradeNo 在組加密 payload 之前定案」語意 |
| RPC error | — | 500「建立訂單失敗」 |

### 2.3 B — register 查推薦碼（auth P0-1、P1-2＝ref P1-1）

`/auth/register` 改走 `validate_referral_code`（已排除停權推薦人與 inactive 碼，§5.2）：

| 情況 | 回應 | DB |
|---|---|---|
| `referralCode` 非字串且非 null／undefined | 400 `{ error: '推薦碼格式錯誤' }` | 不寫 |
| RPC error | 503 `{ error: { code: 'REFERRAL_CHECK_UNAVAILABLE', message: '推薦碼暫時無法驗證，請稍後再試' } }` | 不寫 |
| 0 列（查無／停權／inactive） | 400 `{ error: '推薦碼不存在或已失效' }`（與 prepare fresh 同字串，同形） | 不寫 |
| `referrer_user_id = user.id` | 400 `{ error: '不能使用自己的推薦碼' }` | 不寫 |
| 1 列 | 照舊呼叫 `register_profile` | 寫入 |

契約：`_shared/api-contract.ts` 加 `REFERRAL_CHECK_UNAVAILABLE`；`:839-841` 註解「/auth/register 回 503＝寫入已成功」改寫成「看 code 判斷：`PROFILE_UNAVAILABLE`＝已寫入讀不回、`REFERRAL_CHECK_UNAVAILABLE`＝未寫入可重送」。

### 2.4 C — 重複發獎（ref P1-2＋P2-1）

- `repair_orphaned_claim_rewards`：基準 `20260807000001`，差異＝候選查詢 `order by rkr.user_id, rkr.id`；迴圈內 `perform 1 from profiles where id = claimer for update` 後重查 `not exists`，已有就跳過。
- `reward_transactions` 四組 partial unique index（ref P2-1）：
  1. `(referee_user_id, generation, subscription_id) where type = 'referral_reward' and subscription_id is not null`
  2. `(referee_user_id, generation, source_claim_id) where type = 'referral_reward' and source_claim_id is not null`
  3. `(withdrawal_id) where type = 'adjustment' and withdrawal_id is not null`
  4. `(subscription_id) where type = 'ledger_reset'`
- `pay_referral_generations`：基準 `20260724000003`，唯一差異＝每代的 `exception` 加 `when unique_violation then null`（撞索引＝已發過，不寫告警），排在 `when others` 之前。
- **既有資料**（規劃必答 2）：主 session 11/04 23:00 代跑，正式站與 develop 四組候選重複列皆 **0 列**。migration 不做自動去重（去重＝刪帳本列，必須人審）；施工若跨日，合併前請主 session 再跑一次 §2.7 的 SQL。
- **測試與 seed**：階段 1 先 grep 全部直接 `insert into reward_transactions`／`.from('reward_transactions').insert` 的 D 測試、`supabase/seed*.sql`、`e2e/journey` 種子，有同一事件重複插入的一併改。

### 2.5 D — 稍後註冊改為登出、`/auth/cancel-signup` 退場（auth P1-4；W5-12）

auth P1-4 的根因是「註冊中可自助刪帳號」與「付款」並行。W5-12 直接移除自助刪除，不再需要鎖或時間窗。

- 前端 `CompleteProfile`：「稍後註冊」改呼叫 `useFunnelLogout().logout()`（與頁首「登出」、結帳頁首購者的「稍後付款」同一支：同導向、同 toast、不清草稿）。拿掉 `handleLaterSignup`、`isCancelling`、`laterConfirmOpen` 與確認框。
- 後端：刪除 `app.delete('/auth/cancel-signup', …)` 與 `cancel-signup-guard.test.ts`（8 條測試全部退場：守的是一個不再存在的端點）。
- 呼叫端盤點（現算）：只有 `CompleteProfile.tsx`（`handleLaterSignup`）、`CompleteProfile.test.tsx`（19 處）、`e2e/steps/profile_steps.py`（route mock 與「未呼叫刪除」斷言）、`e2e/features/complete_profile.feature`（確認框 Scenario）。`supabase/functions` 內無其他呼叫者。另有文件提及：規格書 §2.1 第 60 列、§11 照片清理段（`:687`「`/auth/cancel-signup`」列為孤兒來源之一）、`docs/multi-step-flow-recovery.md:106`（草稿「稍後註冊時清除」）。
- 部署過渡：Edge 先於或晚於前端上線都安全——舊前端打已移除的端點得 404，走既有「刪除失敗：不清本機、不登出、停原頁」分支，帳號保留（安全方向）。
- S3（#508）剛把 cancel-signup 的認證段改成 `authenticate()`；本分支 rebase 後連同端點一起移除，`authenticate()` 本身留著（其他端點在用）。

### 2.6 E — 停權者不得付款（W5-5、W5-14）

**後端**
- `/payuni/prepare` 在**所有寫入之前**（fresh 換線的 profiles update 之前）讀一次 `suspended_at`，讀取失敗 → 500（fail-closed，併入既有「建單前守衛」try 區塊）；停權 → 403 `ACCOUNT_SUSPENDED`。`prepare_payment_order` 鎖內再查一次防 TOCTOU。
- W5-14：`process_successful_payment` 在 0b 之後讀 `suspended_at`，非 null 時照常開通，並在隔離的 `begin…exception` 內寫 error 告警 `payment_while_suspended`（context：trade_no、suspended_at）。

**前端 `PaymentCheckout`**（三態）
- 載入中：維持現行「載入中」卡，付款鈕本來就不渲染（`isCheckingUser`）——補 V 測試釘住。
- API 分支：`profile.suspended` → 渲染停權卡，不渲染付款鈕、「編輯」鈕。
- localStorage 分支：快照沒有 `suspended`。進頁後背景以 `fetchProfileForSession` 取 `/profile`，`suspended` 為真就切停權卡（付款鈕在回來前先停用，避免停權者先看到可按的付款鈕）。`/profile` 暫時性失敗時不擋付款（後端 403 兜底）。
- 送單收到 403 `ACCOUNT_SUSPENDED`（快照過時的最後一道）→ 清 `isLoading`、切停權卡，不顯示錯誤 toast。
- 純函式 `isCheckoutBlockedBySuspension(profile)` 放 `registrationFlow.ts`。`resolveCheckoutPageRedirect` 不改（停權者留在結帳頁看說明，不導走，避免守衛循環）。

### 2.7 資料庫變更與正式站影響（規劃必答 2）

**migration 切分**：每個後端階段一支 migration（版本號施工時現取、遞增），回滾與基準比對各自獨立；
每階段開工與每次 rebase 後重驗 `process_successful_payment`／`pay_referral_generations`／`repair_orphaned_claim_rewards` 的最新定義仍是本檔寫的基準，漂移就以新基準重做「唯一差異」。`check-migration-versions.py` 只管撞號，不管基準漂移。

| 階段 | migration 內容 |
|---|---|
| 1 | 四組 partial unique index（`create unique index if not exists`）、`pay_referral_generations`、`repair_orphaned_claim_rewards` 重定義 |
| 5 | `prepare_payment_order`（新） |
| 7 | `process_successful_payment` 重定義（重複偵測、停權告警） |

- 新函式 `set search_path = public`、revoke anon／authenticated／public、grant service_role。`security-definer-grants.test.ts` **不改**（它的 `ALLOWED` 是「允許 anon／authenticated 執行」的白名單，動態掃 `pg_proc`）——revoke 正確它就保持綠，revoke 漏了它就紅。
- 不改表結構、不回填資料。
- 正式站影響：15 筆訂閱、21 列 reward_transactions；建索引是唯一可能失敗點，已查 0 列重複。

盤點用唯讀 SQL（主 session 代跑；11/04 23:00 結果：兩邊皆 0 列）：

```sql
select 'rr_sub' k, referee_user_id, generation, subscription_id::text, count(*) from reward_transactions
 where type='referral_reward' and subscription_id is not null group by 2,3,4 having count(*)>1
union all
select 'rr_claim', referee_user_id, generation, source_claim_id::text, count(*) from reward_transactions
 where type='referral_reward' and source_claim_id is not null group by 2,3,4 having count(*)>1
union all
select 'adj_wd', null, null, withdrawal_id::text, count(*) from reward_transactions
 where type='adjustment' and withdrawal_id is not null group by 4 having count(*)>1
union all
select 'reset', null, null, subscription_id::text, count(*) from reward_transactions
 where type='ledger_reset' group by 4 having count(*)>1;
```

## 3. 架構影響

- 後端：`index.ts` 第 4 區（register 改寫、cancel-signup 刪除）、第 7 區（prepare 前置停權讀取＋建單換 RPC）；`_shared/api-contract.ts` 加 `REFERRAL_CHECK_UNAVAILABLE`、`ACCOUNT_SUSPENDED`，改 503 註解。
- 前端：`PaymentCheckout.tsx`（停權卡、localStorage 分支背景確認、403 處理）、`CompleteProfile.tsx`（register 400／503 分支、稍後註冊改登出）、`registrationFlow.ts`（純函式）。
- 撞檔：S3（#508）同改 `CompleteProfile.tsx`、`PaymentCheckout.tsx`、cancel-signup 認證段——**S3 先合，本分支 rebase**。S6 之後改 prepare。
- e2e mock：`e2e/mocks/backend_api_mock.py` 要能回 `suspended: true` 的 profile 與 prepare 403 `ACCOUNT_SUSPENDED`；`profile_steps.py` 的 cancel-signup route mock 改成斷言「按稍後註冊後登出、未打任何刪除端點」。
- 四契約（`docs/multi-step-flow-recovery.md`）：結帳頁「狀態可查詢」不變（停權來自 `/profile`）；「錯誤分可復原與否」——停權＝不可自助復原（給客服出口），register 503＝可重試（不清草稿）；稍後註冊改登出後「每步可重入」更完整（草稿與帳號都留著）。`:106`「成功送出或『稍後註冊』時清除」改成「成功送出時清除」（登出不清草稿，與頁首登出一致）。
- 規格書同步：§2.1 第 60 列〈註冊中〉（稍後註冊＝登出、不刪帳號、註冊中刪帳號找客服）、§4.1（無變動，確認）、§4.2（register 也套 validate、503 未寫入）、§5.2（凍結項加付款；付款途中被停權照開通＋告警）、**§5.3**（register 的 503 分兩種 code）、§6.2（重複付款的處理與告警）、§8.3（唯一索引）、§11 照片清理段（孤兒來源刪掉 `/auth/cancel-signup`）；跑 `check-spec-drift.py`。

## 4. UI/UX

**完善資料頁**
- register 503 `REFERRAL_CHECK_UNAVAILABLE`：在 `PROFILE_UNAVAILABLE` 分支旁加分支，以 `extractApiErrorMessage(errorData, '推薦碼暫時無法驗證，請稍後再試')` 取文案（新信封的 `error` 是物件，直接 `errorData.error` 會顯示 `[object Object]`）；toast、表單與草稿不動、送出鈕恢復可按。
- register 400（碼無效／自己的碼）：比照前端即時驗證失敗的既有流程——`setCodeError(message)`、`setCodeVerified(false)`、清 `verifiedReferralCode` 與 `referrerName`、`focusFirstError({ referralCode })`；欄位錯誤本身就是提示，不另發 toast。避免「欄位寫驗證成功、toast 寫碼無效」的矛盾（驗證後、送出前推薦人被停權或碼被停用時會發生）。
- 「稍後註冊」：依 ui-ux §11.3「可逆又無傷的動作不收確認框」——改為登出後帳號、資料、草稿都保留，破壞力 ~0，**拿掉確認框**；依 §12.11 按鈕三分法從 `tone="destructive"`（紅框字，只給刪除類）改成 `tone="secondary"`。保留「稍後註冊」字樣（使用者語言；與頁首「登出」同效果但在表單底部、手機上不用捲回頁首）。按下後與頁首登出同一支 `useFunnelLogout`（同 toast、同導向）。

**結帳頁停權卡**
- 與會員區停權畫面共用：把 `RequireMembershipRoute` 的停權 `StatusCallout`（標題「帳號已停權」、說明文案）抽成共用元件 `SuspendedNotice`，兩處引用，文案只寫一份。`StatusCallout variant="destructive"` 的 `role` 在階段 6 確認，V 測試以 `getByRole('alert')` 或等效斷言釘住。
- 出口：停權卡下方一顆 `tone="secondary"`「登出」（首購者）／「回首頁」（續費者），**不沿用** `handleCancel` 的「稍後付款」字樣（停權者沒有可付款的動作）。客服管道沿用會員區停權畫面現況（只寫「請聯繫客服」）；若要加具體聯絡方式，兩處一起改，不在本工項範圍。
- 行動版：置中卡片，與會員區停權畫面相同寬度（`max-w-md`）。

**重複付款**：前端無變化（W5-11）。

## 5. 階段切分（每階段一個紅綠循環）

測試層級：D＝`supabase/functions/api/*.test.ts`（真 Postgres）、V＝vitest、E＝e2e mocked Gherkin。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | C：唯一索引＋repair 鎖＋`pay_referral_generations` 撞索引靜默 | 先 grep 修重複插入的測試與 seed；D `claim-cascade-repair.test.ts` 加「兩個並行 repair → 每代恰好一列」；D 新 `reward-transactions-unique.test.ts`（四組各插第二列 → 23505；撞索引時 `pay_referral_generations` 不寫 system_alerts） | 並行 repair 紅（今天會出兩列）→ 綠；無 40P01；`security-definer-grants.test.ts` 保持綠 |
| 2 | B 後端：register 走 validate | D `registration-completion-guard.test.ts` 加：查碼失敗→503 `REFERRAL_CHECK_UNAVAILABLE` 且 profiles 不變（以 RPC 端點故障注入，比照既有 fail-closed 手法）；查無／停權／inactive 三案 →400 且回應逐位元組同形；自己的碼→400；非字串→400 | 紅→綠；既有成功路徑不變 |
| 3 | B 前端：register 400／503 | V `CompleteProfile.test.tsx`：503 `REFERRAL_CHECK_UNAVAILABLE` → 不導頁、不清草稿、toast 顯示「推薦碼暫時無法驗證，請稍後再試」；400 → 推薦碼欄位顯示錯誤、「驗證成功」與推薦人姓名消失、不跳 toast | 紅→綠 |
| 4 | D：稍後註冊改登出、cancel-signup 退場 | V `CompleteProfile.test.tsx`：按「稍後註冊」→ 不開確認框、呼叫 funnel logout、不打 `/auth/cancel-signup`、不清草稿（改寫既有確認框系列）；E `complete_profile.feature` 改寫為 `Choosing to register later signs out and keeps the account`；後端刪端點與 `cancel-signup-guard.test.ts`（加一條 D：`DELETE /auth/cancel-signup` → 404 釘住退場） | 紅→綠 |
| 5 | E 後端：prepare 停權 403＋`prepare_payment_order` | D `suspension-guards.test.ts`：停權者 prepare → 403 `ACCOUNT_SUSPENDED`、不建單、profiles 不變（含 fresh 有碼）；D `prepare-fail-closed.test.ts`：停權讀取失敗 → 500；D 新 `prepare-payment-order.test.ts`：直接呼叫 RPC 的 ok／not_found／suspended／active／duplicate_trade_no 五值、Edge 撞號重產重試一次；並行：付款完成與 prepare 交錯（雙連線）→ prepare 讀到 active 回 400、無 40P01 | 紅→綠 |
| 6 | E 前端：結帳頁停權卡 | V `registrationFlow` 純函式；V `PaymentCheckout.test.tsx`：載入中無付款鈕；API 分支 suspended → 停權卡（role alert）、無付款鈕；localStorage 分支背景 `/profile` 回 suspended → 切停權卡；送單 403 → 切停權卡且無轉圈；V `RequireMembershipRoute.test.tsx` 共用元件後文案不變；E `payment_checkout.feature` 加 `A suspended member sees the suspension notice instead of the pay button`（mock 加 suspended profile 與 prepare 403） | 紅→綠 |
| 7 | A＋W5-14：重複付款偵測、付款途中停權告警 | D 新 `duplicate-payment.test.ts`：兩筆 null 先後付款 → 第二筆效期接續、error 告警含獎金列、無重疊；fresh×2 → 第二筆不跑 ledger_reset；extend×2 → 串接＋warning；兩筆並行完成（雙連線）→ 同上且無 40P01；對帳延遲開通（paid_at 早於前一筆 end_date 之前）→ 不判重複；告警寫入失敗（暫時 revoke／rename `system_alerts` 或 stub）→ 付款仍 completed；停權者 notify → 開通＋`payment_while_suspended` error；特徵測試：prepare 已有未逾期 pending 單時仍建新單（釘住現況，S6 改動時看得見） | 紅→綠 |
| 8 | 收尾 | `npm run check:full`、`check-spec-drift.py`、`check-migration-versions.py`、`check-test-names.py`、`check-plans-scaffold.py`；規格書與 `multi-step-flow-recovery.md` 同步；刪規劃檔 | 全綠 |

journey：不新增章節（並行情境在真後端難以穩定重現，D 層雙連線已覆蓋）；晉升時 journey-full 照跑作回歸。

## 6. 開放問題

全部已裁決（業主 2026-11-04，主 session 互動選項代收）：

- [x] Q1 建單時加 15 分鐘確認框？→ **W5-11：不加**，只靠付款當下防線＋告警。
- [x] Q2／Q6 cancel-signup 4 天窗與提示形式？→ **W5-12：稍後註冊改為登出、不刪帳號**；註冊中自助刪帳號移除，要刪找客服。4 天窗與 `cancel_signup` RPC 不做。
- [x] Q3＋Q4 重複付款第二筆？→ **W5-13：接續效期、三代獎金照發，error 告警 context 附該筆獎金列**。
- [x] Q5 付款途中被停權？→ **W5-14：照開通，寫 error 告警**。

## 7. 風險與回滾

- 建索引失敗 → 該 migration 中止、部署卡住；已查 0 列重複。
- `process_successful_payment` 重定義寫錯 → 付款不開通。D 層既有 `process-payment-*`、`renewal-modes`、`fresh-ledger-forfeit`、`payment-user-lock` 全套是回歸網；告警一律隔離；自癒 `healPaidPendingOrders` 仍在。
- 移除 cancel-signup 後，註冊中想刪帳號的人只能找客服——業主裁決接受（W5-12）。
- 回滾：revert PR；每階段一支 migration，以新 migration 把三支函式還原到基準版、drop `prepare_payment_order`（索引可留，無害）；cancel-signup 端點隨 revert 回來。

## 8. 審查處置對照（r2）

review.md 的 13 條 P1 處置：#1（4 天窗）、#5（cancel 測試注入點）、#11（稍後註冊提示）、#13 的稍後註冊部分 → **W5-12 移除自助刪除後作廢**；
#2 → §2.2 關鍵路徑隔離＋階段 7；#3 → §2.2 回傳值表＋階段 5；#4 → W5-13＋§2.2 告警 context；#6 → §2.7 grants 段；#7 → W5-14＋§2.6＋階段 7；
#8 → §2.3 契約註解＋§3 規格書加 §5.3；#9、#10 → §4＋階段 3；#12 → §2.6 三態＋階段 6；#13 的 register 400 部分 → 階段 3。
P2 採納：#14（§2.1 隱性前提）、#15（order by）、#16（§2.4 測試與 seed）、#17（§2.2 v_paid_at 理由＋階段 7）、#18（§2.7 每階段一支）、#19（§3 e2e mock、S3 先合）、#20～#22（§4）、#23（階段 2 inactive）、#24（階段 7 特徵測試）；#25（4 天常數）隨 D 作廢。
