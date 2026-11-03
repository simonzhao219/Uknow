# 第 4 波稽核報告 — pay（金流與會籍）
<!-- plans-keep: 第 4 波稽核報告；退場條件＝第 5 波審查 session 依第 5 波 plan 處置後刪除 -->

- 裁決：plan.md W4-30（業主 2026-11-03：「從各方面確認有沒有 bug，測試有沒有涵蓋到」）
- 對象：origin/main `f88bae5`（正式站）。**行號一律以 main 為準**。唯讀稽核，不改產品碼。
- 範圍：規格書 §3（付款路由守衛）、§4.1（Step 3、資料鎖定）、§4.3、§5（兩態、停權、§5.3 讀取失敗）、§6（方案、續約雙模式、補繳）、§7.4（預設推薦人）、§8.2–8.3（付款路徑的發獎冪等）、§14。
  - 派工 prompt 寫的「§11（自癒、對帳）」在現行規格書裡是〈刊登系統〉；自癒和對帳沒有獨立章節，分散在 §8.3 和 §13。本報告以程式為準去對照。
- 方法：
  - 後端端點和 SQL 最終版由本 session 親讀。
  - SQL 細節與前端各派一個子 agent 平行讀碼。結論逐條回到原始碼核實；只經子 agent 讀、我沒有親自追完的，標「未親核」。
  - 不碰 Supabase MCP。正式站資料佐證以 SQL 交給主 session 代跑（見 §1 P0-1）。
- 不重報：H1（邀請推薦碼暫存無期限）；§14 已列的 #8／#10–#13（非本組範圍或已知）。

---

## §1 發現

### P0

| # | 檔案:行 | 失敗情境（具體輸入 → 錯誤結果） | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P0-1 | `supabase/functions/api/index.ts:2091-2114`（fresh 填碼）、`:2116-2160`（fresh 未填碼套預設推薦人）；`20260726000102_apply_default_referrer.sql:44` 起（`apply_referral_side_effects` 依 `profiles.referred_by_user_id` upsert `referral_edges`，並給 task +1）；`20260724000003_pay_referral_generations.sql:38`（gen1 取 `profiles.referred_by_user_id`） | **新約建單即換線，棄付後改續約仍生效。** `/payuni/prepare` 在建單時（付款前）就把 `profiles.referred_by_*` 寫成新推薦人 X；未填碼時寫成平台預設推薦人，`is_default=true`。之後沒有任何路徑還原。<br>情境：過期會員 M（原上線 U）選新約並填 X 的碼（或不填）→ 二次確認 → 到 PayUni 頁後返回或刷卡失敗 → 回結帳頁改選**續約**並付款。<br>結果：<br>• 付款時 `apply_referral_side_effects` 不看 `renewal_mode`，把推薦邊換到 X。<br>• 三代 100P 發給 X 那條線，X 的推薦王計數 +1。<br>• U 失去下線，也拿不到這筆與之後每筆續約獎勵。<br>• M 的帳本沒被清空。<br>這違反 §6.2「extend：推薦人不變」與 §4.1「註冊完成後唯一自助換線＝新約」。即使 M 從此不再付款，`profiles.referred_by` 也已和 `referral_edges` 不一致，下一次任何付款都會生效。<br>另一觸發點：fresh 填碼寫入後建單 insert 失敗（`:2177-2185` 回 500）也會留下同樣狀態。<br>**反駁**：「選新約後反悔改續約」是自然路徑，不需惡意；沒有任何既有防線（`register_profile` 的鎖只管 `/auth/register`）。**維持 P0（錯綁推薦＋獎勵錯發）**。已於撰寫中先行 send_message 主 session。<br>**現況：潛伏，觸發期限 2027-10-27**。主 session 11/03 13:58Z 以唯讀 SQL 查正式站：fresh 棄單後完成 extend 的有 0 筆；profiles 與 referral_edges 不一致的有 0 列。prepare 對 active 會員一律回 400，而 15 筆訂閱全部 active、最早到期日是 2027-10-27，所以在那之前無人能觸發。與 AU-ref 的 P0-1 是同一缺陷，彙整時去重。 | 換線改到「付款成功當下、依**該筆訂單**的 `renewal_mode`」才套用：<br>• prepare 只把候選推薦人記在 `payment_orders` 上（新欄位，或 `payuni_response` 外的 metadata），付款時 fresh 才寫 profiles 並 rewire；<br>• extend／null 一律不 rewire，gen1 改取 `referral_edges`。<br>需要 migration，屬「動金流・推薦」，走三段式。<br>正式站盤點用的唯讀 SQL：`select po.user_id, po.transaction_id, po.created_at from payment_orders po where po.renewal_mode='fresh' and po.status<>'completed' and exists (select 1 from payment_orders p2 where p2.user_id=po.user_id and p2.renewal_mode='extend' and p2.status='completed' and p2.completed_at>po.created_at);` | **無**。`fresh-default-referrer.test.ts`「prepare：extend 未填碼完全不動上代（S6）」只測單純 extend；`renewal-modes.test.ts`「fresh 換推薦人…」只測 fresh 付款成功。e2e、journey 也都沒有「fresh 建單未付 → extend 付款」。 |

### P1

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P1-1 | 前端：`src/components/PaymentCheckout.tsx:140,210-245`（localStorage 分支不呼叫 `resolveCheckoutPageRedirect`、不重抓 profile）、`:340`（`isRenewal = !!pendingUser?.subscriptionEndDate`）、`:515`（`isRenewal` 為假時不帶 body）；`CompleteProfile.tsx:431` 寫入 `pendingUser`，付款成功後沒有任何地方清除（只有登出、`useFunnelLogout` 會清）。<br>後端：`index.ts:2033-2035`，`renewalMode` 非 extend／fresh 時一律當 null，不檢查此人是否曾訂閱。 | **續費者走成「首購語意」：繞過補繳，帳本和推薦人照留。**<br>情境：首購時在 CompleteProfile 寫下 `pendingUser`，之後從未登出（Supabase refresh token 長期有效；手機上很常見）→ 一年後到期 → 守衛導到結帳頁 → 讀到 step 2 時的舊快照（沒有 `subscriptionEndDate`）→ `isRenewal=false`，不顯示續約／新約選項 → `/payuni/prepare` 不帶 body → `renewal_mode=null`。<br>`process_successful_payment` 的處理：<br>• 錨點取付款日（`20260802000002:131-140`）；<br>• 只有 `'fresh'` 才清帳本（`:180`）；<br>• 推薦人不換。<br>結果是過期 N 年只付 1 筆、從今天起算一年，帳本和上線全保留。這是 §6.2 兩種模式都不允許的第三種組合，平台因此少收補繳款。<br>畫面還出現首購才有的「編輯」鈕（必然失敗）與「稍後付款＝登出」。<br>手工打 API 不帶 body 也能達成同樣效果。<br>**反駁**：使用者沒有多付錢；登出過一次就不會發生；正式站上線未滿一年，續費潮尚未到。但觸發條件是「首購後從未登出」這種**常態**，不是邊角。列 P1，**潛伏，觸發期限 2027-10-27**（理由同 P0-1：只有過期者能建單）。 | **結論（回覆主 session 的提問，並納入 AU-auth 回報的同一路徑）：應拒。** prepare 對已有訂閱紀錄的使用者（`exists(subscriptions)`）收到 `renewalMode=null` 時應回 400，例如「請選擇續約或新約」。理由：
• 規格 §6.2 只定義 extend 和 fresh 兩種模式，null 只對首購有意義；
• null 走進 `process_successful_payment` 會變成「付款日起算＋不清帳本＋不換線」的混合語意；
• 前端 AC-17 也已經把續費者不帶模式當成不該送出的單——後端是唯一能同時擋下舊快照路徑和手工請求的位置。
此外，`process_successful_payment` 遇到「`v_is_renewal` 為真且 `renewal_mode` 為 null」時應寫 error 告警，作為縱深防線（防止 prepare 以外的建單路徑漏網）。<br>前端仍需另修，因為 UI 不能讓續費者看不到選項。<br>前端：結帳頁 localStorage 分支也走 `resolveCheckoutPageRedirect`，並以 API 的 profile 為準；`pendingUser` 綁 uid，付款成功時清除；續費身分改看 `renewal != null`。 | **無**。PC「過期超過一年時續約仍可選…非 localStorage 舊值」灌入的快取本身就帶 `subscriptionEndDate`，守不到舊快照。後端沒有「曾訂閱者不帶 renewalMode」的測試。 |
| P1-2 | `index.ts:2045`（prepare 只擋「此刻 active」，沒有鎖）；`:2177`（每次都 insert 新 pending 單；ExpireDate 3 天，`:2203`）；`20260802000002:124-140`（`process_successful_payment` 付款當下不檢查是否已 active，null／fresh 錨點取付款日）；前端 `PaymentCheckout.tsx:531-532`（只有記憶體裡的 15 秒鎖） | **重複付款沒有付款時點的防線。**<br>情境：首購者（或續費者）在兩個分頁或重新整理後各建一張單，或回到 3 天內仍有效的舊 PayUni 頁，兩張都付成功（Apple／Google Pay 一鍵就能完成）。<br>結果：第二筆 null／fresh 從付款日再起算一年，和第一筆幾乎完全重疊。使用者付 2,400 只得一年，上線領兩次三代獎勵。fresh×2 會再跑一次 `ledger_reset`。全程沒有告警，只能靠客訴發現；規格寫「付款成功不允許退款」。<br>（extend×2 會正確串接成兩年，屬預付，不在此列。）<br>**現況：首購路徑現在就能觸發，不是潛伏。**<br>**反駁**：需要使用者完成兩次付款，機率低；但後果是錯錢且無訊號。列 P1，金額上屬 P0 等級，觸發機率低。 | prepare 時若已有未逾期的 pending 單就沿用（回同一個 tradeNo），或作廢舊單。<br>`process_successful_payment` 偵測「付款當下已 active 且非 extend」時：寫 error 級 `system_alerts`，並改以 extend 錨點接續（錢已收就給足效期），或交人工處理。 | **無**。e2e `payment_checkout`「The pay button disables immediately…」只守同頁連點；`process-payment-concurrency.test.ts` 守的是**同一個 trade_no**。 |
| P1-3 | `index.ts:2753-2776`（建單超過 4 天、`stillProcessing` → 標 expired）、`:2891-2898`（`TradeStatus` 不是 1／2／3 → `stillProcessing`，**不帶** `queryFailure`） | **對帳靜默誤標 expired（#395 的殘餘路徑）。**<br>#395 的修補只涵蓋「查詢層非 SUCCESS」：會先寫 error 告警，再照標。查詢層 SUCCESS 但 `TradeStatus` 是未知碼或欄位缺漏時，走「確認未付款」分支，**不告警**。<br>情境：webhook 漏接、實際已付款，PayUni 回了碼表外的狀態 → 第 4 天被標 expired → `effective_registration_step` 掉回 1 → 使用者被引導重付。<br>**反駁**：碼表註明「未經 sandbox 驗證」，未知碼的機率不明；遲到的 SUCCESS notify 仍能收斂（`process_successful_payment` 不擋 expired），但「notify 漏接」正是這條路徑的前提。另，`:2882` 的 `list.find(...) ?? list[0]` 找不到同號交易時會拿第一筆的狀態，屬同一類不確定資料當結論。 | `TradeStatus` 為 0（確認未付）以外的碼都帶 `queryFailure`，走告警分支；未知碼不標 expired，留 pending 給人工。`list.find` 找不到同號交易時視為 `stillProcessing`＋告警。 | `reconcile-expire.test.ts` 7 案，**沒有「未知 TradeStatus」案例**。`payuni-query-alert.unit.test.ts` 只守查詢層。 |
| P1-4 | `index.ts:615-617,632`（step 3 時強制 `paidAwaitingActivation=false`、`lastTradeNo=null`）；`src/utils/registrationFlow.ts`（`classifyMembershipGate`：expired 且有 `subscriptionEndDate` → `renew` → `/payment/checkout`） | **續費者付款成功但卡單時被送回結帳頁，可能再付一次。**<br>續費者的 `effective_registration_step` 恆為 3（已有 completed 訂單），所以「pending＋SUCCESS」的旗標被後端蓋掉。<br>情境：金額不符或 `process_successful_payment` 失敗、自癒收斂不了 → 守衛判成 renew → 結帳頁 → 使用者以為沒付成功，再付一次。這和 `redirectForGate` 自己的註解「絕不能把已付款的人送回結帳頁」矛盾。<br>**潛伏**：只影響續費者，觸發期限同為 2027-10-27。**反駁**：需要自癒失敗才會發生（有 error 告警，人工會處理）；但告警和使用者再付款之間沒有時間保證。 | `paidAwaitingActivation` 不依 step 決定：任何人只要有 pending＋SUCCESS 都回 true，並帶 `lastTradeNo`。結帳頁和 prepare 也據此擋下。 | RMR「待開通蓋過『曾訂閱過』」用前端合成資料，後端實際送不出這個形狀；`profile-self-heal.test.ts` 只測首購（step 2）。後端無續費卡單案例。 |
| P1-5 | `PaymentCheckout.tsx:229-239`（拿到 session 後不比對 `pendingUser.id === session.user.id`）；`useAuthBootstrap.ts:335-340,422`（子 agent 讀，**未親核**） | **同一瀏覽器換人時讀到前一人的結帳資料。**<br>A 的 session 在分頁關閉期間失效，重開時不觸發 `onSignedOut`；B 登入時不被視為「換帳號」→ B 的結帳頁顯示 A 的姓名、生日、手機、遮罩身分證，`isRenewal` 也用 A 的。<br>建單仍以 B 的 token 進行，不會錯扣 A。屬個資跨使用者殘留，與 H1 同類但不同鍵。 | `pendingUser` 綁 uid，讀取時不符即丟棄（和 P1-1 的前端修法合併）。建議交給 auth 組彙整成「本機鍵生命週期」一併修。 | **無**。e2e `route_guards` 只守頭像提示（auth-hint）。 |

### P2

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P2-1 | `20260719000004_registration_step_zero_when_profile_incomplete.sql:41-72` | `effective_registration_step(uuid)` 是 security definer、接受任意 uid，卻 `grant execute ... to authenticated`。任何登入者知道某人 uid 就能經 PostgREST 探知對方是否付過款、是否有 pending 單、是否已填資料。推薦網絡回應裡有沒有 uid 屬 ops／ref 範圍，未查。 | 只 grant `service_role`（前端從來不直接呼叫，都經 `/profile`）。 | `registration-step-contract.test.ts` 不測權限。 |
| P2-2 | `index.ts:2632`、`complete_paid_pending_orders`（`20260716000007:81-88`） | 金額驗證寫死比對 1200，不和 `payment_orders.amount` 比；`TradeAmt` 缺欄位時直接放行（HashInfo 有驗簽，實際風險低）。1200 散在 index.ts:2171、:2213、:2632、SQL 兩處、`constants.ts:14`，改價漏一處就會靜默錯價。 | 以訂單 `amount` 為準比對；`TradeAmt` 缺漏視為不符。 | `payuni-notify.test.ts`「金額不符：付 1 元不得換到 1200 元的會籍」；缺欄位案例無。 |
| P2-3 | `index.ts:2603-2606` | 找訂單的 `.single()` 不檢查 error：DB 暫時性失敗會被當成「找不到訂單」，寫出 error 告警「錢已收、會籍沒開」，訊息誤導（PayUni 會重送，最終收斂）。 | 區分 PGRST116 與其他錯誤。 | 無。 |
| P2-4 | `index.ts:2293-2300` | `/payuni/result` 的 renewal 查詢不檢查 error（違反 §5.3）：讀取失敗時 `renewal=null`，補繳中間筆被前端當成一般開通來輪詢。 | 改用 `must()`，失敗回 5xx。 | 無。 |
| P2-5 | `index.ts:2129-2133` | fresh 未填碼讀 `reward_config` 不檢查 error：讀取失敗被告警成 `unset`（原因錯置），使用者維持原上代（不阻斷金流，符合 §7.4）。 | 區分讀取失敗與未設定。 | `fresh-default-referrer.test.ts` 的四種失效不含讀取失敗。 |
| P2-6 | `index.ts:2990` | HashInfo 用 `!==` 比對，不是現成的 `timingSafeEqual`（同檔 :2462）。實務上難以利用。 | 改用 `timingSafeEqual`。 | 無。 |
| P2-7 | `20260802000002:267`（`repair_orphaned_forfeitures` 以 `s2.created_at < s.created_at` 判斷非首購） | `complete_paid_pending_orders` 全量模式在同一交易內補完同一人多筆訂單時，各列 `created_at = now()` 完全相同。若其中 fresh 那筆的沖銷又剛好失敗，repair 會把它誤判成首購而漏補沖。觸發需要兩個條件疊加，機率很低。 | 改用 `start_date` 或訂單 `completed_at` 排序。 | `fresh-ledger-forfeit.test.ts` 的 repair 案例只有單筆。 |
| P2-8 | `reward_transactions` 索引（`20260716000006:58`） | 付款發獎的冪等鍵 `(referee, generation, subscription_id)` 只有一般索引，沒有 unique，冪等完全靠 profiles 列鎖序列化。目前所有寫入點都持鎖，屬縱深缺口。 | 加 partial unique。 | `payuni-notify.test.ts`「重放：同一筆 notify 連送三次只開通一次，不重複發獎」、`complete-paid-pending-orders.test.ts`「並發自癒同一使用者」。 |
| P2-9 | `src/App.tsx:400`（`/payment/checkout` 只套 ProtectedRoute）、`registrationFlow.ts`（`resolveCheckoutPageRedirect` 不看 suspended）、prepare 不擋停權 | 停權者可以進結帳頁並付款，付完仍被 `RequireMembershipRoute` 硬鎖擋在會員區外（「付了錢也進不來」）。規格 §5.2 沒列「付款」為凍結項，屬規格空白。 | 業主裁決：停權者是否允許續費。 | 無。 |
| P2-10 | `PaymentCheckout.tsx:364-369` vs 規格 §6.2 | 規格寫「選 fresh 前…送出付款前需二次確認」（無條件）；程式只在「有點數／有下線／付過補繳」時才確認。無資產的 fresh 仍會換到預設推薦人，卻不確認。**規格與程式衝突**，依指示不判誰對。 | 擇一修正：改規格措辭，或改成無條件確認。 | PC「fresh 無資產且未付過補繳時，付款不需二次確認直接送單」釘住現行為。 |
| P2-11 | `src/utils/subscriptionNotice.ts:25` | `Math.ceil((end − now)/86400000)`，end 是台北當日 23:59:59.999：到期日當天顯示「1 天後到期」，前一天顯示「2 天後」。應以日曆日計算。會籍判定本身正確。 | 改用 `twDayOf` 相減。 | `subscriptionNotice.test.ts`「active 且今天稍晚到期（<1 天）→ 進位為 1」釘住現行為。 |
| P2-12 | `src/components/PaymentResult.tsx:99,108,204,416-427`（子 agent 讀，**未親核**） | `?tradeNo=任意&status=SUCCESS` 查詢回 404 時，畫面仍顯示「付款成功」，純屬畫面偽造，不影響會籍（後端以 `user_id` 過濾，`index.ts:2272`）；tradeNo 沒有 `encodeURIComponent`。pending 畫面的文案「付款已受理…不會重複扣款」在 return 解密失敗時過度保證（同檔 :698-723）。 | 404 時不採信 URL status；文案降為「若已付款…」。 | e2e `payment_result`「No status param, an order still pending after retries shows the pending screen」釘住文案。 |
| P2-13 | `20260718000001`（`payuni_paid_at` 的 fallback＝訂單 `created_at`） | 回應缺 AuthDay／PayTime 時，錨點退回建單日，最多早 3 天（ExpireDate），fresh 使用者少拿最多 3 天效期。 | fallback 改成 `least(now(), created_at + 3 天)`，或維持現狀並記入規格。 | `subscription-period.test.ts`「fallback 鏈：回應沒有 AuthDay 時錨定訂單 created_at 的台灣日」釘住現行為。 |
| P2-14 | `index.ts:2919-2926`（已知，見程式內註解與 friction-log 2026-08-17） | 對帳 heal pass 失敗只寫 console，端點仍回 success。**已記債，不重新發現**，列出只為完整性。 | — | — |

---

## §2 覆蓋對照表

層別：**V**＝vitest、**D**＝Deno（`supabase/functions/api/*.test.ts`）、**E**＝e2e（全 mock）、**J**＝journey（真後端）。

| 規格條目 | 實作位置（main） | 測試層與測試名 |
|---|---|---|
| §4.1 Step 3 年費 $1,200、不信任前端金額 | `index.ts:2177`（amount 1200）、`:2632` 驗 TradeAmt | D `payuni-notify`「金額不符：付 1 元不得換到 1200 元的會籍」；D `payuni-notify-alerts`「notify 金額不符…」；J `00_skeleton` A0 |
| §4.1 電子發票由 PayUni 代開 | `index.ts`（`TradeInvoice: 1`） | D `payuni-prepare-payload`「prepare：組 EncryptInfo → 帶 TradeInvoice=1 啟用電子發票」 |
| §4.1 結果頁只顯示遮罩卡號、不顯示銀行 | `PaymentResult.tsx` | V PR「成功頁不顯示收單銀行（AuthBankName），只顯示遮罩卡號」；E `payment_result`「A success status in the URL renders the success screen…」 |
| §4.1 註冊完成後資料鎖定、付款中共用列鎖 | `register_profile`（`20261017000004`） | D `registration-completion-guard` 全組（含「付款交易持鎖期間送出 → 等付款 commit 後 403」） |
| §4.1 付款需先完成 Step 2 | **prepare 不檢查 step／資料完整度**；只靠前端導向 | V RF `resolveCheckoutPageRedirect`；**D 無**（直接打 API 可在資料未齊時付款，付款後資料即被鎖定。使用者自傷，未列發現，記為覆蓋缺口） |
| §3 `/payment/checkout` 守衛：active → dashboard、開通中 → result | `registrationFlow.ts` `resolveCheckoutPageRedirect` | V RF；E `payment_checkout` 前 3 個 Scenario；**localStorage 分支繞過（P1-1）無測試** |
| §3 RequireMembershipRoute：expired → 結帳、開通中 → 結果頁 | `classifyMembershipGate` | V RMR；E `route_guards`；**續費卡單（P1-4）後端形狀無測試** |
| §4.3 多步流程可恢復（付款中途離開） | `/subscriptions/status` renewal 契約 | E `renewal_backfill_recovery` 兩案；D `payuni-result-renewal` 兩案 |
| §5 兩態、`now() <= end_date`、到期日當天 23:59 仍 active | view `user_account_status`（`20260721000001:29`）、`compute_subscription_period` | D `subscription-period`「台灣午夜邊界：AuthTime 23:59:59 仍算當天」；J `60_time_scenarios`「刊登可見性隨會籍狀態變化」 |
| §5.2 停權 × 付款 | 未擋（P2-9） | 無 |
| §5.3 讀取失敗 fail-closed：prepare | `index.ts:2041-2087` | D `prepare-fail-closed` 三案、`fresh-pending-withdrawal`「withdrawals 查詢失敗時 fresh 回 500」 |
| §5.3 讀取失敗 fail-closed：`/subscriptions/status` | `index.ts:3130-3240` | D `subscriptions-status`（無讀取失敗案例，屬 #360 的範圍） |
| §5.3 讀取失敗 fail-closed：`/payuni/result` | `index.ts:2293`（**未遵守**，P2-4） | 無 |
| §5.3 `/profile` 付款欄位 503 | `buildProfileResponse` `:549-575` | D `profile-transient.unit`（含 payment_orders 讀取失敗 → 503） |
| §6.1 30 天倒數 banner | `subscriptionNotice.ts` | V `subscriptionNotice.test.ts`（釘住差一天，P2-11） |
| §6.2 extend 接續前期隔天、補繳每筆一列 | `process_successful_payment` `20260802000002:131-140` | D `renewal-modes`「extend：新訂閱效期接續前一筆的最後一天」「AC-1：過期近三年連續三筆 extend…」；D `payment-user-lock`「兩筆 extend 併發完成不得算出相同效期」；J `70_renewal_saga` 第 3 章；J `60` 過期補繳 |
| §6.2 extend 推薦人不變 | prepare extend 分支不寫 referred_by；**但 fresh 棄單後的殘留會被 extend 套用（P0-1）** | D `fresh-default-referrer`「extend 未填碼完全不動上代（S6）」；**fresh→extend 無** |
| §6.2 fresh 從付款日、換線、清帳本 | prepare `:2091-2160`、`20260802000002:180-213` | D `fresh-ledger-forfeit` 8 案、`renewal-modes`「fresh 換推薦人…」；J `70` 第 4、7、9 章；J `60`「新約復活」 |
| §6.2 fresh 護欄：pending 提領擋、讀取失敗 500 | `index.ts:2073-2081` | D `fresh-pending-withdrawal` 4 案；J `70` 第 6 章 |
| §6.2 fresh 揭露、二次確認 | `PaymentCheckout.tsx:364-369`、`/subscriptions/status` | V PC 確認與警語相關 it；D `subscriptions-status`「freshForfeitPoints/Referrals 等於現值…」；J `70` 第 4 章（A14／A15）；**規格與程式衝突（P2-10）** |
| §6.2 「模式由建單寫入、付款時決定效期」 | `payment_orders.renewal_mode` | D `renewal-modes`；**續費者 renewal_mode=null 未擋（P1-1）無測試** |
| §6.2 backfillPlan 前後端雙副本一致 | `tw-dates.ts`、`src/utils/twDate.ts`、`_shared/backfill-cases.ts` | D `backfill-plan.unit`；V `twDate.test.ts`（共用案例表） |
| §7.4 首購未填碼 → 預設推薦人 | `resolve_default_referrer`（`20260726000101:44`） | D `default-referrer`；D `health-default-referrer`；J `70` 第 1、2 章 |
| §7.4 fresh 未填碼 → 預設推薦人、失敗不阻斷金流 | prepare `:2116-2160` | D `fresh-default-referrer` 5 案；J `70` 第 9 章 |
| §8.2 每筆付款（含補繳）發三代 | `apply_referral_side_effects` → `pay_referral_generations` | D `process-payment-reward-repeats-on-renewal`；J `20_referral_rewards`；J `70` 第 3 章 |
| §8.3 冪等：同 trade_no 重放／並發 | 訂單 FOR UPDATE＋completed 短路、profiles 列鎖、兩個 partial unique | D `process-payment-concurrency`「同一 trade_no 併發重複呼叫仍安全」；D `payuni-notify`「重放…只開通一次」；D `subscriptions-unique-constraint` |
| §8.3 冪等：同一人不同 trade_no 重複付款 | **無防線（P1-2）** | 無 |
| §8.3 自癒：卡單（pending＋SUCCESS） | `complete_paid_pending_orders`（`20260716000007:25`） | D `complete-paid-pending-orders` 7 案；D `payuni-result-heal` 3 案；D `profile-self-heal` 4 案 |
| §8.3 自癒：orphaned payments／forfeitures | `repair_orphaned_payments`（`20260807000001:68`）、`repair_orphaned_forfeitures`（`20260802000002:245`） | D `process-payment-orphan-repair`、`repair-retro-rewards`、`fresh-ledger-forfeit`（repair 兩案） |
| 對帳：殭屍單 expired、查詢層告警 | `reconcilePendingOrders` `index.ts:2700-2810` | D `reconcile-expire` 7 案、`reconcile-pending-payments` 2 案；**未知 TradeStatus（P1-3）無** |
| PayUni 簽章／解密／缺參數 | `decryptPayUniFormBody` `:2981` | D `payuni-notify`（偽造簽章、竄改密文、缺參數）；D `crypto.unit` |
| return 302 帶 PayUni 原始 status | `/payuni/return` `:3062` | D `payuni-return-status` 5 案；E `payment_result` |
| 拒單告警（商店類、連續失敗） | `alertOnPayUniRejection` | D `payuni-merchant-alert`、`payuni-rejection.unit` |
| PayUni 設定成套／sandbox 判定 | `resolvePayuniConfig` `:700` | D `payuni-config.unit` |

---

## §3 建議補的測試（依風險排序）

1. **D／J：fresh 建單未付 → extend 付款，上代與推薦邊不變、獎勵歸原上代**（P0-1 的紅燈）。另補「fresh 填碼後 insert 失敗 → profiles 不變」。journey 可加進 `70_renewal_saga` 當插章。
2. **D：曾訂閱者打 prepare 不帶 renewalMode → 400**（P1-1 後端）。**V：結帳頁 localStorage 有舊 `pendingUser`（無 `subscriptionEndDate`）＋ API 為 expired 續費者 → 顯示續約／新約選項，且送單帶 renewalMode**（P1-1 前端）。
3. **D：同一人兩張 null／fresh 訂單先後付款成功 → 不產生重疊效期（或至少有 error 告警）**（P1-2）；**D：prepare 已有未逾期 pending 單時的行為**。
4. **D：reconcile 查到未知 TradeStatus（例如 '8'）、建單超過 4 天 → 不標 expired（或先寫 error 告警）**（P1-3）；以及 `Result` 陣列不含同號交易的情境。
5. **D：續費者 pending＋SUCCESS 卡單 → `/profile` 回 `paidAwaitingActivation=true` 並帶 `lastTradeNo`**（P1-4），搭配 E：續費卡單從守衛被導去結果頁、不進結帳頁。
6. **V：`pendingUser.id` 和 session uid 不符時丟棄**（P1-5）。
7. **D：`effective_registration_step` 不得由 authenticated 查他人**（P2-1，加進 `rls-policies.test.ts`）。
8. **D：`/payuni/result` renewal 讀取失敗 → 5xx**（P2-4）；**D：TradeAmt 缺漏 → 不開通**（P2-2）。

---

## §4 被反駁推翻或降級的

| 候選 | 結論 |
|---|---|
| notify／return 並發或重放造成雙訂閱、雙發獎 | **推翻**：訂單 `FOR UPDATE`＋completed 短路（`20260802000002:104-117`）、profiles 列鎖、`subscriptions.payment_transaction_id` partial unique 三道都在，D 有並發與重放測試。 |
| 遲到的 FAILED 蓋掉已完成或已存 SUCCESS 的訂單 | **推翻**：`.eq('status','pending')`＋`.or(payuni_response 非 SUCCESS)`（`index.ts:2593-2598`），D `payuni-return-status`「遲到的 FAILED 不得覆蓋…」有守。 |
| 訂單先被標 failed／expired，之後 SUCCESS 到達無法開通 | **推翻**：`process_successful_payment` 只短路 completed，不擋 failed／expired，付了就會開通。 |
| 到期日當天被判為過期（時區） | **推翻**：end_date 是台北當日 23:59:59.999999（timestamptz），view 用 `<=`，D 有台北午夜邊界測試。 |
| extend 在被 fresh 中斷後接錯錨點 | **推翻**：錨點取全體 `max(end_date)`，不是最後一列。 |
| 前端可竄改效期或金額 | **推翻**：prepare 只收 `renewalMode`／`referredByCode`；金額、日期都由後端決定。 |
| 別人的 tradeNo 可在結果頁查到資料 | **推翻**：`/payuni/result` 以 `user_id` 過濾（`index.ts:2272`），只剩畫面偽造（P2-12）。 |
| 跨使用者重放他人 SUCCESS notify 開通自己 | **推翻**：`process_successful_payment` 的 `p_user_id` 取自訂單列，不取自回呼內容。 |
| Security definer 函式缺 `search_path` 或對外可執行 | **推翻**（除 P2-1）：付款相關 definer 全部 `set search_path = public`，並 revoke 了 anon／authenticated／public。 |
| 重複付款（P1-2）列 P0 | **降級為 P1**：需要使用者主動完成兩次付款，機率低；但後果屬錯錢，建議優先度視同 P0 的尾端。 |
| 續費者走首購語意（P1-1）列 P0 | **降級為 P1**：使用者沒有多付錢（平台少收），且正式站上線未滿一年，續費潮尚未到；觸發條件是常態，須在滿一年前修好。 |
