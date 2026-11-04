# 金流與推薦的並行防線 規劃書

<!-- 第 5 波工項 S2（docs/plans/launch-wave-5/plan.md §2；裁決 W4-33、W5-4、W5-5、W5-9）。
     稽核編號引用 docs/plans/launch-wave-4/audit-{pay,auth,ref}.md；行號一律以 develop 現算（本檔寫於 develop 3a7f506 之後）。 -->

## 0. 一句話

讓「同一個人在同一瞬間做兩件會動到錢或推薦樹的事」不再產生重複付款、重複發獎、錯綁推薦或錢收了帳號沒了，
並讓停權者付不了款——五條都是現役路徑（正式站目前 0 例），付錢的人一旦撞上就只能靠客訴發現。

## 1. 使用者需求

對照規格書：§4.1（註冊完成後資料鎖定、付款與 register 共用 profiles 列鎖）、§4.2（推薦碼：停權推薦人與查無同形、查詢失敗回 503）、
§5.2（停權凍結項）、§5.3（讀取失敗 fail-closed）、§6.2（續約雙模式）、§8.3（冪等鍵）。

| # | 稽核編號 | 驗收情境（具體輸入 → 期望結果） |
|---|---|---|
| A | pay P1-2 | 首購者兩分頁各按「前往付款」，兩張 PayUni 頁都付成功 → 第二筆**不得**再從付款日起算一年（與第一筆重疊）；改以續約錨點接續（錢已收、給足效期），**不跑** fresh 清帳本，寫 error 級 `system_alerts`（source `duplicate_payment`，帶兩筆 trade_no），客服據此決定退款或保留 |
| B | auth P0-1、P1-2＝ref P1-1 | `/auth/register` 帶碼 X：查碼遇 DB 錯誤 → 503、**不寫入**；X 查無／推薦人停權／碼 inactive → 400，三者回應逐位元組同形；X 是自己的碼 → 400；`referralCode` 非字串 → 400（不再 500） |
| C | ref P1-2＋P2-1 | 有 claim 孤兒（claimed 但上線續約獎勵未入帳）時，同一人兩個並行 `/auth/profile` → 每代恰好一列 100P；`reward_transactions` 再也存不進同一事件的第二列 |
| D | auth P1-4 | 分頁 A 在 PayUni 頁刷卡中、分頁 B 在完善資料頁按「稍後註冊」並確認 → 帳號**不刪**，回 400 說明「有一筆付款仍在處理期限內」；付款 notify 落在守衛與刪除之間也不會刪 |
| E | W5-5（pay P2-9＝auth P2-1） | 停權者進結帳頁 → 顯示「帳號已停權，請聯絡客服」、無付款鈕；直接打 `/payuni/prepare` → 403 `ACCOUNT_SUSPENDED`、不建單、不改 profiles；規格書 §5.2 凍結項加「付款」 |

**不做**（明確排除）：
- prepare 的 fresh／extend 分支邏輯（換線時點、續費者 `renewalMode=null`、卡單旗標）——S6（ref P0-1、pay P1-1、P1-4）；本工項只加鎖所需的最小改動。
- cancel-signup 的認證分類（`requireAuth` → `authenticate()`、401／503）——S3。
- 結帳頁 localStorage `pendingUser` 不綁 uid／不重抓（pay P1-1 前端、P1-5）——第 6 波候選。
- 對帳端點（`/internal/reconcile-pending-payments`）——S1。
- PayUni 退款 API 串接：重複付款只告警，退款由客服在 PayUni 商店後台人工辦。

## 2. 系統設計

### 2.1 鎖序總則（規劃必答 1）

現行唯一的跨表鎖序是 `process_successful_payment`：**payment_orders 該筆 `for update` → profiles 該人 `for update`**
（`20260802000002` 0／0b），`apply_referral_side_effects` 在同交易內重入同一列 profiles。`register_profile` 只鎖 profiles、讀訂單不加鎖。
`claim_referral_king_reward` 鎖 `referral_king_rewards` → `subscriptions`，不鎖 profiles。

本工項所有新鎖遵守同一順序：**先 payment_orders（多筆時依 id 排序）→ 後 profiles（單一使用者）**；只鎖 profiles 的函式不得在持鎖期間
等待任何 payment_orders 列鎖（INSERT 新列不等鎖）。逐支檢查：

| 函式 | 取鎖順序 | 與付款交易的關係 |
|---|---|---|
| `process_successful_payment`（改：加重複偵測，不加鎖） | order → profiles | 不變 |
| `prepare_payment_order`（新） | profiles → INSERT 新訂單 | 不等任何既有訂單列鎖 → 無環 |
| `cancel_signup`（新） | 該人全部 payment_orders `for update`（id 序）→ profiles → delete auth.users | 與付款同序；付款持訂單鎖時 cancel 等它 commit，之後讀到 completed／SUCCESS → 拒 |
| `repair_orphaned_claim_rewards`（改） | 每個候選：profiles（claimer）→ 重查 → 發獎 | 只由 `/auth/profile` 以 `p_user_id` 呼叫、單一交易內只鎖一人；不持訂單鎖 |
| `register_profile`（不動） | profiles | 不變 |

死結測試：D 層並行測試（雙連線 `postgres`，比照 `payment-user-lock.test.ts`）各情境斷言**兩個交易都成功或一方被業務拒絕**，不得出現 `40P01`。

### 2.2 A — 重複付款（pay P1-2）

**付款時點的防線（主防線）**：`process_successful_payment` 在 0b 取得 profiles 鎖之後，判斷「付款當下此人已在效期內」
（`exists subscriptions where user_id = p and end_date >= v_paid_at`）。prepare 對 active 者回 400，所以此條件成立就代表這張單是在變成 active
之前建的、現在又付了一次：

- `renewal_mode` 為 null／fresh → 錨點改用 extend 算法（接續 `max(end_date)`）、**略過 3-0 fresh 清帳本**；寫 `log_system_alert('duplicate_payment', 'error', …)`，
  context 帶 `trade_no`、`renewal_mode`、此人最近一筆 completed 的 `trade_no`、新算出的效期。
- `renewal_mode` 為 extend → 照常串接（補繳／預付語意正確），但寫 `warning` 級同 source 告警，讓客服知道有人一次付了兩年。
- `apply_referral_side_effects` 照常跑（這筆錢是真的，續約獎勵照 §8.2 發）。fresh 第二筆若在 prepare 時已改寫 profiles 推薦人，換線仍會發生——那是 S6 修的 ref P0-1，告警 context 帶 `renewal_mode` 讓客服看得到。

**建單時點**：新 RPC `prepare_payment_order(p_user_id, p_trade_no, p_renewal_mode)` 在 profiles 列鎖下重查「停權」「active」後 INSERT，回 `'ok'|'not_found'|'suspended'|'active'|'duplicate_trade_no'`。
它解決的是「prepare 與 cancel-signup／付款完成的交錯」，**不**作廢舊 pending 單——理由：舊單的 PayUni 頁在 ExpireDate 前仍可付，
DB 作廢擋不住付款，反而會讓對帳（只追 pending）不再追這張單 → 付了錢卻永不開通，比重複付款更糟。是否加「15 分鐘內已有進行中付款」的前端提醒見開放問題 Q1。

### 2.3 B — register 查推薦碼（auth P0-1、P1-2＝ref P1-1）

`/auth/register` 改走 `validate_referral_code`（已排除停權推薦人與 inactive 碼，§5.2）：

| 情況 | 回應 | DB |
|---|---|---|
| `referralCode` 非字串且非 null／undefined | 400 `{ error: '推薦碼格式錯誤' }` | 不寫 |
| RPC error | 503 `{ error: { code: 'REFERRAL_CHECK_UNAVAILABLE', message: '推薦碼暫時無法驗證，請稍後再試' } }` | 不寫 |
| 0 列（查無／停權／inactive） | 400 `{ error: '推薦碼不存在或已失效' }`（與 prepare fresh 同字串，同形） | 不寫 |
| `referrer_user_id = user.id` | 400 `{ error: '不能使用自己的推薦碼' }` | 不寫 |
| 1 列 | 照舊呼叫 `register_profile` | 寫入 |

503 新增錯誤碼進 `_shared/api-contract.ts`，與 `PROFILE_UNAVAILABLE`（資料已寫入）區分：前端遇它**不**走 `continueAfterSaved`，停在原頁、草稿保留、toast 說明可重試（§5.3「503 停在原頁讓人重試」）。

### 2.4 C — 重複發獎（ref P1-2＋P2-1）

- `repair_orphaned_claim_rewards`：基準 `20260807000001`，唯一差異＝迴圈內 `perform 1 from profiles where id = claimer for update` 後重查 `not exists`，已有就跳過。
- `reward_transactions` 四組 partial unique index（ref P2-1）：
  1. `(referee_user_id, generation, subscription_id) where type = 'referral_reward' and subscription_id is not null`
  2. `(referee_user_id, generation, source_claim_id) where type = 'referral_reward' and source_claim_id is not null`
  3. `(withdrawal_id) where type = 'adjustment' and withdrawal_id is not null`
  4. `(subscription_id) where type = 'ledger_reset'`
- `pay_referral_generations`：基準 `20260724000003`，唯一差異＝每代的 `exception` 加 `when unique_violation then null`（冪等撞索引＝已發過，不寫 warning 告警）排在 `when others` 之前。
- **既有資料**（規劃必答 2）：建索引前若有重複列 migration 會失敗、整支部署卡住。施工前請主 session 對正式站與 develop 各跑一次 §2.7 的唯讀 SQL（11/04 查過正式站無重複，施工前再查）；
  migration 本身不做自動去重（去重＝刪帳本列，必須人審）。

### 2.5 D — cancel-signup（auth P1-4）

新 RPC `cancel_signup(p_user_id)`（security definer，revoke 給 service_role 以外）：

1. `perform 1 from payment_orders where user_id = p order by id for update`（與付款同序）
2. `perform 1 from profiles where id = p for update`；不存在 → `'not_found'`
3. 守衛（全在鎖內）：completed 訂單 → `'paid'`；任一 pending 且 `payuni_response->>'Status' = 'SUCCESS'` → `'paid'`；有提領 → `'paid'`；
   **任一非 completed 訂單建立未滿 4 天 → `'payment_in_progress'`**（PayUni ExpireDate＝建單台北日＋3 天，最長約 4 天；與對帳「超過 4 天標 expired」同一個窗）
4. `delete from auth.users where id = p`（cascade 帶走 profiles／payment_orders；先例：`20261025000011_purge_stale_referral_invites.sql`），回 `'deleted'`

Edge `/auth/cancel-signup`：認證段不動（S3 的範圍）；守衛讀取與 `admin.deleteUser` 換成單一 RPC 呼叫；`'paid'` → 400 原文案；`'payment_in_progress'` → 400「您有一筆付款仍在處理中，暫時無法取消註冊；若未完成付款，該筆會在 4 天內自動失效」；RPC error → 500（fail-closed 不變）。
為什麼不只用鎖（規劃比較，派工題 4）：

| 方案 | 擋得住「守衛與刪除之間 notify 落地」 | 擋得住「刪除後才在舊 PayUni 頁付款」 | 代價 |
|---|---|---|---|
| ① 只把守衛＋刪除收進同一支 RPC 並 `for update` | ✅ | ❌ 錢收了、訂單已被 cascade 刪、process 找不到單 | 無 UX 變化 |
| ② 只拒刪 N 分鐘內的 pending | 部分（N 內）；守衛與 GoTrue 刪除仍非原子 | N 內 ✅ | — |
| **③ ①＋拒刪 4 天內任一未完成訂單（建議）** | ✅ | ✅（PayUni 頁 4 天內必然失效） | 去過 PayUni 頁又反悔的人 4 天內不能自助刪帳號（見 Q2） |

### 2.6 E — 停權者不得付款（W5-5）

- 後端：`prepare_payment_order` 在鎖內讀 `suspended_at`，非 null → `'suspended'`；Edge 回 403 `{ success: false, error: { code: 'ACCOUNT_SUSPENDED', message: '帳號已停權，請聯絡客服' } }`。
  **守衛順序**：停權先於 active 檢查（§5.3「停權優先擋」）——但 prepare 既有的 extend／A16 讀取在 RPC 之前，停權者送 fresh 有碼時會先寫 profiles；所以 Edge 端在**所有寫入之前**先做一次停權讀取（fail-closed 500），RPC 內再查一次防 TOCTOU。
- 前端 `PaymentCheckout`：API 分支拿到 `profile.suspended` → 渲染停權卡（沿用 `RequireMembershipRoute` 的 `StatusCallout variant="destructive"`，標題「帳號已停權」、說明「請聯絡客服」），不渲染付款鈕；
  localStorage 分支沒有 `suspended`（快照可能過時）→ 送單收到 403 `ACCOUNT_SUSPENDED` 時切到同一張停權卡。純函式 `isCheckoutBlockedBySuspension(profile)` 放 `registrationFlow.ts`。
- `resolveCheckoutPageRedirect` 不改（停權者留在結帳頁看說明，不導走，避免守衛循環）。

### 2.7 資料庫變更與正式站影響（規劃必答 2）

一支 migration `2026110x000001_payment_concurrency_guard.sql`（版本號施工時現取、rebase 後跑 `check-migration-versions.py`）：
- 新函式 `prepare_payment_order`、`cancel_signup`；重定義 `process_successful_payment`（基準 `20260802000002`）、`repair_orphaned_claim_rewards`（基準 `20260807000001`）、`pay_referral_generations`（基準 `20260724000003`）——三支「唯一差異」寫在檔頭。
- 四組 partial unique index（`create unique index if not exists`）。
- 不改表結構、不回填資料；函式全部 `set search_path = public`、revoke anon／authenticated／public，加進 `security-definer-grants.test.ts` 的清單。

正式站影響：15 筆訂閱、21 列 reward_transactions。唯一可能失敗的是建索引，施工前請主 session 代跑：

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
-- 期望 0 列。另：現役 pending 訂單盤點（cancel-signup 4 天窗的影響面）
select count(*) filter (where status<>'completed' and created_at > now()-interval '4 days') from payment_orders;
```

## 3. 架構影響

- 後端：`index.ts` 第 4 區（register、cancel-signup）、第 7 區（prepare 只換建單那段＋前置停權讀取）；`_shared/api-contract.ts` 加兩個錯誤碼常數。
- 前端：`PaymentCheckout.tsx`（停權卡、403 處理）、`CompleteProfile.tsx`（register 503 非 PROFILE_UNAVAILABLE 的文案）、`registrationFlow.ts`（純函式）。
- 撞檔：S3 同改 `CompleteProfile.tsx`、`PaymentCheckout.tsx`（getSession 分支）與 cancel-signup 認證段；S6 之後改 prepare。誰後合誰 rebase，衝突時保留兩者語意。
- 四契約（`docs/multi-step-flow-recovery.md`）：結帳頁的「狀態可查詢」不變（停權來自 `/profile`）；「錯誤分可復原與否」——停權＝不可自助復原（給客服出口），register 503＝可重試（不清草稿）；cancel-signup 的 `payment_in_progress` 是可復原（等 4 天或完成付款）。
- 規格書同步：§4.1（cancel-signup 守衛與 4 天窗、鎖）、§4.2（register 也套 validate、503）、§5.2（凍結項加付款）、§6.2 或 §6.1（重複付款的處理與告警）、§8.3（唯一索引）；跑 `check-spec-drift.py`。

## 4. UI/UX

- 結帳頁停權卡：與會員區停權畫面同元件同語氣；行動版置中卡片；不顯示付款鈕、「編輯」鈕，保留「登出」出口（首購者）／「回首頁」（續費者）——沿用既有 `handleCancel` 分流。
- 完善資料頁：register 400（碼無效）→ 推薦碼欄位標錯（沿用前端即時驗證的 invalid 呈現）＋toast；503 → toast「推薦碼暫時無法驗證，請稍後再試」，表單與草稿不動。
- 稍後註冊：`payment_in_progress` 的 400 文案在確認框關閉後以 toast 顯示（沿用既有刪除失敗路徑：不清本機、不登出、停在原頁）。
- 重複付款：前端無變化（見 Q1）。

## 5. 階段切分（每階段一個紅綠循環）

測試層級：D＝`supabase/functions/api/*.test.ts`（真 Postgres）、V＝vitest、E＝e2e mocked Gherkin。

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | C：唯一索引＋repair 鎖＋`pay_referral_generations` 撞索引靜默 | D `claim-cascade-repair.test.ts` 加「兩個並行 repair → 每代恰好一列」；D 新 `reward-transactions-unique.test.ts`（四組各插第二列 → 23505）；`security-definer-grants.test.ts` | 並行 repair 紅（今天會出兩列）→ 綠；無 40P01 |
| 2 | B：register 走 validate | D `registration-completion-guard.test.ts` 加：查碼失敗→503 且 profiles 不變（以 stub RPC 錯誤，比照既有 fail-closed 測試手法）；查無／停權→400 且回應同形；自己的碼→400；非字串→400 | 四案紅→綠；既有成功路徑不變 |
| 3 | B 前端：register 503 文案與草稿保留 | V `CompleteProfile` 測試：503 非 PROFILE_UNAVAILABLE → 不導頁、不清草稿、toast 文案 | 紅→綠 |
| 4 | D：`cancel_signup` RPC＋端點 | D `cancel-signup-guard.test.ts`：〈pending 訂單沒有 SUCCESS 仍可刪除〉改為「建單 4 天內 → 400、帳號保留」與「建單逾 4 天 → 可刪」；新增並行：持訂單鎖的付款交易進行中送 cancel → 不刪；既有 8 條照綠 | 紅→綠、無 40P01 |
| 5 | E 後端：prepare 停權 403＋`prepare_payment_order` | D `suspension-guards.test.ts` 加「停權者 prepare → 403 ACCOUNT_SUSPENDED、不建單、profiles 不變（含 fresh 有碼）」；D `prepare-fail-closed.test.ts` 加停權讀取失敗 → 500 | 紅→綠 |
| 6 | E 前端：結帳頁停權卡 | V `registrationFlow` 純函式；V `PaymentCheckout` 測試：suspended profile → 停權卡、無付款鈕；送單 403 ACCOUNT_SUSPENDED → 切停權卡；E `payment_checkout.feature` 加一個 Scenario（`A suspended member sees the suspension notice instead of the pay button`） | 紅→綠 |
| 7 | A：重複付款偵測 | D 新 `duplicate-payment.test.ts`：兩筆 null 先後付款 → 第二筆效期接續、error 告警、無重疊；fresh×2 → 第二筆不跑 ledger_reset；extend×2 → 串接＋warning；兩筆並行完成（雙連線）→ 同上且無 40P01 | 紅→綠 |
| 8 | 收尾 | `npm run check:full`、`check-spec-drift.py`、`check-migration-versions.py`、`check-test-names.py`；規格書同步；刪規劃檔 | 全綠 |

journey：不新增章節（並行情境在 journey 的真後端難以穩定重現，D 層雙連線已覆蓋）；晉升時 journey-full 照跑作回歸。

## 6. 開放問題（需業主裁決）

- [ ] **Q1 重複付款：建單時要不要再加一道前端提醒？** 建議**不加**，只靠 §2.2 的付款時點防線＋告警。替代：prepare 發現 15 分鐘內已有未完成訂單時回 409，結帳頁跳確認框「你剛開啟過付款頁，若已在另一個分頁付款請勿重複付款」——多一個確認框、多一條 UI 測試，換到的是把「兩分頁都付」從事後客服變成事前提醒。
- [ ] **Q2 cancel-signup 的 4 天窗會讓「去過 PayUni 頁又反悔」的人 4 天內不能自助刪帳號**，可以接受嗎？建議接受（刪帳號不可逆、錢收了帳號沒了更難處理）。替代：窗縮到 30 分鐘（殘餘風險：30 分鐘後在舊 PayUni 頁付款 → 錢收了、找不到訂單）。
- [ ] **Q3 重複付款（null／fresh 第二筆）自動轉成接續效期是否 OK？** 建議 OK——錢已收、給足效期、告警交客服；規格書「付款成功不允許退款」維持，告警讓客服可依個案在 PayUni 後台退款。替代：不開通、訂單留 pending 交人工（使用者會看到「付款處理中」直到客服處理）。

## 7. 風險與回滾

- 最壞情況：partial unique index 建立失敗 → migration 中止、該次部署 Edge 也不會上（deploy 依 CI 綠）；施工前查詢預防。
- `process_successful_payment` 重定義寫錯 → 付款不開通。D 層既有 `process-payment-*`、`renewal-modes`、`fresh-ledger-forfeit` 全套是回歸網；告警與自癒 `healPaidPendingOrders` 仍在。
- `cancel_signup` 直接 delete auth.users 與 GoTrue `deleteUser` 行為差異（sessions／identities 由 FK cascade 帶走；audit log 本來兩者都不刪）。
- 回滾：revert PR＋新 migration 還原三支函式到基準版、drop 兩支新函式（索引可留，無害）。
