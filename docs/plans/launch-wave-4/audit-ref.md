# 第 4 波稽核報告：推薦、獎勵、任務、提領（AU-ref）
<!-- plans-keep: 第 4 波稽核報告；退場條件＝第 5 波審查 session 依第 5 波 plan 處置後刪除 -->

- 依據：W4-30（plan.md）、dispatch-prompts.md〈AU 共用〉〈AU-ref〉
- 審查對象：origin/main＝`f88bae5`（正式站）。**行號一律以 main 為準**
- 範圍：規格書 §7–§10、`reward_config`；index.ts 的 `/referrals/*`、`/rewards/*`、`/tasks/*`、`/admin/withdrawals*`，
  `referral-invite.ts`；migrations 的 `apply_referral_side_effects`、`pay_referral_generations`、`reconcile_king_credits`、
  `claim_referral_king_reward`、`request_withdrawal`、`admin_update_withdrawal_status`、三支 `repair_orphaned_*`、
  `process_successful_payment` 的 fresh 清空段；前端 referral／reward／task／withdrawal 元件
- 方法：SQL 由本 session 親讀；Edge 端點與前端各派一個子 agent 平行盤點，**列入本報告的每條都由本 session 回原碼核實**
- 排除：H1（邀請推薦碼 `pending_referral_code` 暫存無期限、會殘留給下一位使用者）不重報；§14 第 6、8、10、11、13 列是已知落差，只在嚴重度應升級時才提
- 正式站佐證（主 session 代跑唯讀 SQL，2026-11-03 13:58Z）：
  - **P0-1、P0-2 潛伏，觸發期限 2027-10-27**：profiles 與推薦邊不一致 0 列、棄單後完成 extend 0 筆、成環 0、領到自己獎金 0。prepare 對有效會員一律回 400，而正式站 15 筆訂閱全部有效，最早到期日是 2027-10-27，這兩條要到第一批會員到期後才可能觸發
  - **P0-3 現役**：`has_function_privilege('authenticated', 'public.referral_tree(uuid)', 'execute') = true`（anon 為 false）；目前已有 2 位會員有二代下線（共 5 對）

**統計：P0 × 3、P1 × 9、P2 × 14；被推翻／降級的另列 11 條（§4）**

---

## §1 發現

### P0

| # | 檔案:行 | 失敗情境（輸入 → 錯誤結果） | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P0-1（潛伏，觸發期限 2027-10-27） | `supabase/functions/api/index.ts:2091-2156`（`/payuni/prepare` fresh 兩支）；`20260726000102_apply_default_referrer.sql:73`（`apply_referral_side_effects` 讀 `profiles.referred_by_user_id`） | **新約棄單後換線仍會生效，而且之後付的是續約（extend）。** prepare 在**建單當下**就 UPDATE `profiles.referred_by_user_id/code/is_default`；extend 分支（2049-2068）完全不碰這三欄；apply 也不看訂單是哪種 `renewal_mode`，一律以 profiles 的值 upsert `referral_edges` 並發三代獎金。例：過期會員 R（上代 Y）選新約、填 X 的碼 → 放棄付款 → 改選續約付款 → 推薦邊改指 X，X 鏈拿 3×100P、X 任務 +1；R 走的是 extend，`ledger_reset` 不會觸發，點數全數保留。結果是「不扣點也能換上代」，直接打 API 呼叫 prepare、不付款就能做到。新約未填碼時棄單同理，會被綁到預設推薦人。放棄付款後不再付任何款，也會出現 profiles 與推薦邊不一致：會員資料顯示 X，樹仍掛在 Y | 換線意圖改存在 `payment_orders`（新欄位），付款成功時只對 `renewal_mode='fresh'` 的訂單套用；或 extend 建單時把 profiles 還原成推薦邊的值。另請主 session 查正式站 `profiles.referred_by_user_id is distinct from referral_edges.referrer_user_id` 的列 | **無**。renewal-modes.test.ts「fresh 換推薦人…」、fresh-default-referrer.test.ts、journey 70 第 4、9 章都是 prepare 後直接付該筆 fresh；S6 只驗 extend 的 prepare 本身不動上代 |
| P0-2（潛伏，觸發期限 2027-10-27） | `20260620000001_initial_schema.sql:147`（`referral_edges` 只有 `check (referee <> referrer)`）；`index.ts:2101`（fresh 驗碼只擋自己）；`20260724000003_pay_referral_generations.sql:68,94` | **推薦關係可成環，付款人會拿到自己這筆付款的獎金。** R 的一代 D（D 的上代是 R）。R 過期後選新約填 D 的碼並付款 → 邊 R→D、D→R。R 付款：gen1=D、gen2=referrer(D)=R（**自己拿 100P**）、gen3=referrer(R)=D（D 拿兩份）。之後 D 每次付款，D 也會拿到 gen2。三角環 R→A→B→R 同理。冪等鍵含 generation，所以每一代各自入帳。前端 `loadNetwork`（index.ts:3934）在環上會把一代覆寫成三代：遮罩錯位、需要關注清單變空、自己出現在自己的樹裡 | prepare 驗碼後檢查新上代**不在自己 3 代下線內**；SQL 端在 apply 的 rewire 前再擋一次（環偵測失敗＝不換線＋告警）；`pay_referral_generations` 遇到收獎者＝p_referee 時跳過 | **無** |
| P0-3（**現役**） | `20260620000005_fix_referral_tree_access.sql:47`（`grant execute on function public.referral_tree(uuid) to authenticated`） | **會員可直接呼叫 rpc 拿到二、三代的未遮罩真名。** `referral_tree` 是 security definer，回傳 `p.name` 真名、代數與會籍狀態，之後沒有任何 migration 收回權限（`validate_referral_code` 收回了，這支沒有；20260620000008 的註解把它列為「刻意對外暴露」）。Edge 與前端都已不呼叫，只剩暴露面。例：已登入會員用 bundle 內的 anon key 加自己的 JWT，`POST /rest/v1/rpc/referral_tree {}`，拿到三代內所有人的真實全名，而 `/referrals` 頁面上二、三代顯示的是 `陳○華` | revoke（或直接 drop，因為沒有呼叫者）；GRANT 測試補一條 | **無**（rls-policies.test.ts 不含此函數；只有 referral-validate.test.ts 釘了 validate 的 GRANT）。可能與 AU-ops 的 security definer 盤點重疊 |

### P1

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P1-1 | `index.ts:864-870`（`/auth/register` 推薦碼查詢） | 不用 `validate_referral_code`，也忽略 `error`。(a) 查詢遇到暫時性錯誤時，`referred_by_user_id=null`，但碼字串照存 → 首購時 `resolve_default_referrer` 把人綁到**預設推薦人**而不是 X（錯綁；機率低，所以列 P1）；(b) 停權推薦人的 active 碼可以直接打 API 綁定（`/referrals/validate` 會擋，這裡不擋）；(c) `referralCode` 不是字串時 `.normalize` 拋錯 → 500 | 改用 `validate_referral_code`；error 回 503；檢查型別 | registration-completion-guard.test.ts 只測推薦人照新值與旗標重置；錯誤路徑**無** |
| P1-2 | `20260807000001_repair_retro_rewards_guard.sql`（`repair_orphaned_claim_rewards`）；`index.ts:2486`（每次 `/auth/profile` 都觸發） | 補發前不鎖 profiles，`reward_transactions` 也沒有冪等的唯一索引（§1 P2-1）。出現 claim 連動發獎失敗的孤兒後，同一會員兩個並行的 profile 讀取（多分頁、雙請求）都會通過 `not exists`，各插一份 → 上線三代各**重複**拿 100P。付款路徑的 repair 經由 apply 的 `for update` 已序列化，這支沒有 | 迴圈內先 `perform 1 from profiles where id=claimer for update` 再重查；長期做法是補唯一索引 | claim-cascade-repair.test.ts 只測單次與冪等；並行**無** |
| P1-3 | `index.ts:3888-3934`（`loadNetwork` 與 `selectInChunks`） | 一代查詢（`eq referrer`）與每 150 位上線一個分塊的子邊查詢都沒有分頁；hosted PostgREST 預設 `max_rows`＝1000（config.toml 未覆寫）。預設推薦人帳號 8048876，或 150 位一代平均 ≥7 位下線時，結果會被**靜默截斷**：總數、需要關注的總數、搜尋命中全部偏少，違反 §7.2／§7.3「不得靜默截斷」 | 用 `.range()` 迴圈或帶 count 的 RPC；截斷時擲出 | network-endpoints.test.ts 沒有超過 1000 列的案例 |
| P1-4 | `index.ts:4157`（`/referrals/network/search`） | 伺服器端比對真名且沒有限流。對 `陳○華` 逐一送單字 `q=` 候選字，看 `total` 與 `matches`，就能還原二、三代全名；英文名只遮長度，不遮字母，更容易還原。`name_*` 排序也會洩漏順序。§7.3 寫「比對真名」，§7.2 寫「二、三代遮罩」，兩者互相矛盾，記為規格衝突 | 業主裁決：二代以上只比對可見字元或完整全名；加每人限流 | network-endpoints.test.ts「search：真名比對命中被遮字元…」**刻意**釘住這個行為 |
| P1-5 | `index.ts:3784-3787`（`/rewards/history`） | 主查詢與 `reward_source_facets` 的 error 被忽略 → 回 200、`history:[]`、`total:0`；`limit=abc` 或負數同樣回 200 空清單；未知的 `source` 也回空。前端的重試 callout 永遠不會因為真正的 DB 錯誤而出現，會員看到的是「沒有獎勵」 | 檢查 error 回 500；用 `parsePageParams`；`source` 對照 `REWARD_SOURCE_CATEGORIES` 驗證 | api-contract.test.ts 只有成功路徑 |
| P1-6 | `index.ts:3606,3628`（`/rewards/upload-id-photos`） | `profiles.update` 的 error 被忽略 → 回 `success:true`，實際上路徑與狀態都沒寫入 → 提領時被 5b `missing_id_photos` 擋下；原本是 `rejected` 的會員繼續被 5a 擋（會員被誤擋，重傳可以繞過） | 檢查 error 回 500 | id-verification.test.ts 只有成功路徑 |
| P1-7 | `src/components/reward/WithdrawalProcess.tsx:137,421`；`src/utils/clearAccountLocalState.ts:11` | `withdrawalBankData`（完整銀行代碼與帳號，鍵不含 uid）只在 SIGNED_OUT、帳號切換或 401 時清除。A 的 session 在分頁關閉期間失效（例如 refresh token 在別處被撤銷），重開時 `useAuthBootstrap`（:335 的 `switching = uidRef.current !== null`；:422 沒有 session 時不呼叫 onSignedOut）**不會**觸發清除 → B 登入後，提領表單預填 A 的帳號，B 沒注意就會匯給 A。後端 `/rewards/withdraw` 不比對帳號歸屬。需要 auth-js 在初始化時吞掉 SIGNED_OUT 事件才會發生，未以測試證實，所以列 P1 | 存成 `{uid, bankCode, bankAccount}`，讀取時 uid 不符就丟棄。同類的 `pendingUser`（P1-8）一併處理 | clearAccountLocalState.test.ts、WithdrawalProcess.test.tsx 只測有 SIGNED_OUT 的路徑；不經 SIGNED_OUT 的路徑**無** |
| P1-8 | `src/components/CompleteProfile.tsx:179-200,431`；`src/components/PaymentCheckout.tsx:140,210-226,588` | `pendingUser`（姓名、電話、生日、遮罩身分證、推薦碼、推薦人姓名）**付款成功後從不清除**，與 P1-7 有同樣的跨使用者殘留問題；之後再進 `/payment` 會用舊快照，跳過 `resolveCheckoutPageRedirect`，換線過的人看到「目前：舊碼」 | 付款成功時清除，uid 不符時也清除；`/payment` 以伺服器 profile 為準 | PaymentCheckout.test.tsx 只測占位字；生命週期**無** |
| P1-9 | `src/components/admin/WithdrawalManagement.tsx:676-683`；`src/utils/csv.ts:30` | 匯款用 CSV 的銀行代號與帳號以純數字字串輸出 → Excel 開啟後 `004`→`4`，16 位帳號變成 `1.23457E+15` 並遺失末位；這份檔案就是拿來匯款的，可能**匯錯帳號** | 這兩欄強制輸出為文字（例如 `="004"`），並補測試 | csv.test.ts、WithdrawalManagement.test 不驗儲存格格式 |

### P2

| # | 檔案:行 | 失敗情境 | 建議修法 | 現有測試 |
|---|---|---|---|---|
| P2-1 | `reward_transactions`（全部 migrations 都沒有唯一索引） | 三代獎金、`ledger_reset`、退件退款的冪等全靠 `not exists` 加上鎖；只要有一條路徑沒鎖（P1-2），就會重複入帳 | partial unique index：`(referee_user_id, generation, subscription_id)`、`(referee_user_id, generation, source_claim_id)`、`(withdrawal_id) where type='adjustment'`、`(subscription_id) where type='ledger_reset'` | 無 |
| P2-2 | `20260724000003:139-160`（`reconcile_king_credits`）＋ fresh 清空（`20260802000002:201-204`） | 同月先拿到 credit、之後又做 fresh：當月桶被刪，但 `max(round_ordinal)` 還留著 → 該月要再滿 **16** 位才拿得到下一張。字面上符合 §9.1「張數＝floor(當月新人數／門檻)」，但與「清空重來」的直覺衝突；另外，fresh 後未領取的 credit 是否保留，規格也沒寫 | 業主裁決 fresh 對 credit 的語意，再改公式或寫進規格 | fresh-ledger-forfeit.test.ts 不含已有 credit 的情境 |
| P2-3 | fresh 清空刪除「當月」桶（§9.2） | 當月才加入的下線，pair-history 會隨桶刪除 → 他們明年續約時，同一上線的任務會**再 +1**。這是規格明文的取捨，但與 §9.2「R 從未出現在 U 歷史」的不變式互相矛盾；有每筆真實付款作為經濟防線 | 把「當月桶」改成只清計數、不刪名單（例如另存 `pair_history`） | fresh-ledger-forfeit.test.ts 只測歷史桶保留 |
| P2-4 | `20260802000002:182`（forfeit 只在付款當下計算） | A16 只在**建單時**擋 pending 提領。極端時序：先建 fresh 單 F 與 extend 單 E → 付 E 恢復有效 → 申請提領 → 再付 F（若 PayUni 表單還能用）→ 沖銷金額已扣掉提領 → 退件後退款落進已清空的帳本。與 AU-pay 的「重複付款」重疊 | `process_successful_payment` 的 fresh 段遇到 pending 提領時告警，或拒絕清空 | 無 |
| P2-5 | `20260726000102:121`（`referral_edges.referral_code_id = v_code_id`） | 寫入的是**被推薦人自己**的碼 id，不是推薦人的；rewire 時也不更新 `referred_at` | 確認欄位語意後修正，或標註為 vestigial | 無 |
| P2-6 | `index.ts:4229,4300,4387`（`/tasks*`） | 讀取錯誤被忽略 → `current:0`、`hasUnclaimedReward:false`、credit 清單 `[]`；`current-month-top` 對已換線離開的前下線，仍顯示全名與推薦碼 | fail-closed；顯示時用現任推薦邊過濾 | api-contract.test.ts 只有契約形狀 |
| P2-7 | `index.ts:1333`（`/admin/withdrawals` search） | profiles 搜尋的 error 被忽略，回「查無結果」；超過 1000 筆命中時被截斷（與 P1-3 同類）。不在 §14 第 11 列的範圍內 | 檢查 error | 只有成功路徑 |
| P2-8 | `index.ts:1321,1347`；`20260802000006:30-32` | `from`／`to` 以 UTC 日界判斷；§10.1 用的是台灣日曆日 → 台灣 11/03 07:00 的申請被算進 11/02；無效的 `to` 會讓 `toISOString` 拋錯 → 500 | 統一用 `+08:00` | 「from 與 to 依申請日篩選」不含日界 |
| P2-9 | `index.ts:3652,4436,3464` | `idNumber`／`bankCode` 以數字型別送出 → `.trim` TypeError → 500；`/rewards/withdrawals` 事件查詢的 error 被忽略 → `completedByAdmin:false`（違反 §10.3「明示管理員代為結案」） | `String()` 轉型；檢查 error | withdrawals.test.ts 只有成功路徑 |
| P2-10 | `index.ts:1853`（`/admin/id-reviews/:id/review`） | `!!body.approve` 讓字串 `"false"` 變成核准；會員重傳後，admin 若照舊畫面退件，會誤退新照片 | 嚴格的 boolean；帶上預期的 `id_submitted_at` 做樂觀鎖 | id-verification.test.ts 不含 |
| P2-11 | `src/components/reward/WithdrawalProcess.tsx:203-229` | `/rewards/verify-id` 回 400 時，apiClient 會拋錯 → 顯示「驗證失敗，請稍後再試」，而不是「身分證字號不正確」；vitest 用了正式環境不存在的 `{success:false}` resolve 形狀，所以沒抓到 | catch 時對 400 改用 ApiError 的訊息 | WithdrawalProcess.test 的 mock 形狀錯誤；e2e 的 `set_verify_id_error` 沒有步驟使用 |
| P2-12 | `src/components/referral/ReferralTreeView.tsx:567-583` | 「加載更多」競態：舊查詢的第 2 頁晚於新查詢回來，會被接到新結果後面，`total` 也被覆寫 | 依請求當下的 query 丟棄過期回應 | 只測成功路徑 |
| P2-13 | `src/components/task/TaskGuide.tsx:21` | 「單月每成功推薦 8 位」寫死，違反 §9.4「門檻取自 reward_config」 | 改傳 `task.target` | 無 |
| P2-14 | `WithdrawalProcess.tsx:91-92,133`；`withdrawalValidation.ts:62`；`PaymentCheckout.tsx:292,988`；`src/utils/rewardHistory.ts`；`admin/WithdrawalStatusBadge.tsx:6-9` | 小缺口合併：銀行帳號的全形數字被靜默丟棄、`parseInt('1000.5')` 變 1000（後端會再擋）；新約推薦碼輸入在 onChange 時正規化，打斷 IME 組字，`/referrals/validate/${code}` 也沒有 encode；歷史明細以當前手續費常數拆分；admin 狀態文案（待處理／已退件）與規格（處理中／已拒絕）不一致 | 逐項修 | withdrawalValidation.test 不含這些輸入 |

---

## §2 覆蓋對照表

層次縮寫：**V**＝vitest、**D**＝Deno（supabase/functions/api）、**E**＝e2e（全 mock）、**J**＝journey（真後端）

| 規格條目 | 實作位置 | 測試（層：檔／名） |
|---|---|---|
| §7.1 發碼：首購發、續約沿用、序號 | apply 3a；`generate_referral_code`（20260914000001） | D：process-payment-orphan-repair「補回缺漏的推薦碼…」；J：10_org_build |
| §7.1 出示閘門（加入推薦計畫） | `myQrTabsForUser` | V：myQrTabPreference.test、ReferralCodeWithCopy.test；E：task_center、rewards_withdrawal（未加入）；J：50「未加入推薦計畫…」 |
| §7.1 碼正規化（NFKC→小寫→trim） | index.ts:862、1068、2089；`normalizeReferralCode` | V：referralCode.test、CompleteProfile.test「全形數字…摺成半形」；**D：無全形案例**；E：無全形；J：15「無效推薦碼即時驗證」 |
| §7.1 驗碼限流與 503 | index.ts:1044-1095 | D：referral-validate.test（短窗、24h、「RPC 失敗 → 503」、GRANT） |
| §7.1 Email 邀請、accept、退額度 | referral-invite.ts、rate-limit-strict.ts | D：referral-invite.test、rate-limit-strict.test、refund-rate-limit.test、referral-invite-purge.test；E：referral_email_invite；J：80 |
| §7.1／§7.4 註冊時綁推薦人 | index.ts:864-870 | D：registration-completion-guard（成功路徑）；**錯誤／停權推薦人：無**（P1-1） |
| §7.2 rewire（新約換線） | prepare 2091-2156；apply 3b | D：renewal-modes「fresh 換推薦人…」、task-rewire-pair-history；J：60「新約復活」、70 第 4 章；**棄單後付 extend：無（P0-1）；成環：無（P0-2）** |
| §7.2 二、三代遮罩 | index.ts:3848 | D：name-validation.unit「maskNameByGen…」；J：20「只顯示三代」；**rpc referral_tree 直呼：無（P0-3）；搜尋側信道：刻意釘住（P1-4）** |
| §7.2 四態、需要關注 | `deriveNodeStatus`、`attentionIds` | D：network-endpoints（attention 組、「台灣日終邊界」）；V：ReferralTreeView.test；E：referral_attention |
| §7.3 排序、搜尋、分頁、不截斷 | index.ts:4000-4190 | D：network-endpoints（sort ×6、search ×4）；V：referralNetwork.test、ReferralTreeView.test；**超過 1000 列：無（P1-3）** |
| §7.4 預設推薦人（首購、fresh、告警、health） | `resolve_default_referrer`、prepare 2116-2156 | D：default-referrer.test（14 條）、fresh-default-referrer.test、health-default-referrer.test；J：70 第 1、9 章 |
| §8.1 金額取自 reward_config | apply、claim | D：reward-config.test |
| §8.2 發放時機五列 | apply 3c／3d、claim | D：process-payment-reward-repeats-on-renewal、task-new-downline-only、task-rewire-pair-history、claim-cascade-reward；J：20、70 |
| §8.3 冪等鍵與自癒 | `pay_referral_generations`；`repair_orphaned_*` | D：process-payment-orphan-repair、claim-cascade-repair、repair-retro-rewards（#167）；**並行 repair：無（P1-2）；唯一索引：無（P2-1）** |
| §8.4 來源分類 | `reward_transactions_with_balance` | D：api-contract「/rewards/history 契約形狀」；V：rewardHistoryFilter.test、rewardHistory.test；E：rewards_withdrawal；J：70 第 10 章；**讀取失敗：無（P1-5）** |
| §8.4 新約重置（ledger_reset＋補沖） | 20260802000002:178-211、`repair_orphaned_forfeitures` | D：fresh-ledger-forfeit.test（8 條）；J：70 第 4、7 章；**同月已有 credit：無（P2-2）** |
| §8.5 餘額 view | `reward_balances` | D：withdrawals「退件 → 點數退回（不影響 total_earned）」；J：20「可提領點數」 |
| §9.1 推薦王門檻、多張、月份 key | `reconcile_king_credits` | D：king-multi-credit、referral-king-month-key、tasks-endpoint-multi-round；J：30 |
| §9.2 pair-history 與 fresh | apply 3d、fresh 段 | D：task-rewire-pair-history、fresh-ledger-forfeit「歷史桶內老下線…」；J：70 第 7 章 |
| §9.3 領取守衛（停權 → 到期） | `claim_referral_king_reward` | D：referral-king-reward（3 條）；E：task_claim；J：30、70 第 8 章 |
| §9.4 徽章 | `kingProgress.ts`、`TaskMedals.tsx` | V：kingProgress.test、TaskMedals.test；E：task_center；**TaskGuide 寫死 8：無（P2-13）** |
| §10.1 守衛順序 1–7 | `request_withdrawal`（20260802000011） | D：withdrawals「驗證規則…」、5a／5b 三條、suspension-guards；V：withdrawalValidation.test；E：rewards_withdrawal；J：50「金額驗證」、60「過期會員提領被擋」 |
| §10.2 手續費外加 | 同上 | D：withdrawals「申請即扣 amount+fee…」；V：withdrawalValidation.test（1015 邊界）；J：50 |
| §10.3 狀態機與事件 | `admin_update_withdrawal_status`、`confirm_withdrawal_collection`、`admin_batch_mark_paid` | D：withdrawals 事件 ×6、批次 ×5；V：WithdrawalSection.test「管理員代為結案」；J：50「完整生命週期」「退件路徑」 |
| §10.3 pending 擋 fresh | index.ts:2074、213 | D：fresh-pending-withdrawal ×4；V：PaymentCheckout.test「hasPendingWithdrawal…」；J：70 第 6 章 |
| §10.4 隱私（身分證不入草稿、銀行帳號預填） | WithdrawalProcess:416-421 | V：WithdrawalProcess.test「已儲存的銀行帳號自動帶入」、clearAccountLocalState.test；**不經 SIGNED_OUT 的換人路徑：無（P1-7）；身分證不入草稿：沒有斷言** |

---

## §3 建議補的測試（依風險排序）

1. **D**：fresh 建單（帶碼或未填碼）→ 不付款 → extend 建單並付款 → 斷言推薦邊、三代獎金、任務仍歸原上代（P0-1，先紅後綠）
2. **D**：R 以自己一代 D 的碼做 fresh → 建單 400；直接以 SQL 造環 → 斷言沒有 `user_id = referee_user_id` 的獎金列（P0-2）
3. **D**：GRANT 測試——`authenticated` 不得 EXECUTE `referral_tree`（P0-3）；順手把所有回傳 profiles 欄位的 security definer 函數掃成同一張表
4. **D**：`/auth/register` 推薦碼查詢失敗 → 503、不寫入；停權推薦人的碼 → 400（P1-1）
5. **D**：造一筆 claim 孤兒，兩個並行的 `repair_orphaned_claim_rewards` → 每代恰好一列（P1-2）
6. **D**：一代超過 1000 位的網絡 → overview 總數與搜尋命中精確（P1-3）
7. **V**：`withdrawalBankData`／`pendingUser` 在「沒有 SIGNED_OUT、換 uid 登入」時不會預填給新使用者（P1-7、P1-8）
8. **V**：匯款 CSV 的 `004` 與 16 位帳號以文字輸出（P1-9）
9. **D**：`/rewards/history`、`/rewards/upload-id-photos`、`/tasks*` 的 DB 錯誤 → 5xx（P1-5、P1-6、P2-6）
10. **D**：同月已有 credit 再做 fresh → 依業主裁決斷言張數（P2-2）

---

## §4 被反駁推翻或降級的

| 原始懷疑 | 結論 | 理由 |
|---|---|---|
| IDOR：看得到別人的樹、獎勵、提領，或能領別人的 credit、確認別人的提領 | 推翻 | Edge 一律由 token 取得 user.id；`/children` 不在子樹內回 403（network-endpoints「陌生節點 403」）；`confirm_withdrawal_collection`、`claim_referral_king_reward` 都比對 owner |
| 會員 API 回應外洩身分證或銀行帳號 | 推翻 | `/auth/profile` 套用 `maskNationalId`／`maskBankAccount`（profile-masking.test）；完整值只給 admin |
| `hasPendingWithdrawal` 讀取失敗時放行 fresh | 推翻 | 讀取失敗擲出 → 500（fresh-pending-withdrawal「查詢失敗時 fresh 回 500」）；前端旗標與 renewal 同一回應，資料缺漏時 fresh 維持停用 |
| 提領金額竄改（字串、小數、負數） | 推翻 | Edge 用 `Number.isInteger` 與 `>0`，SQL 再擋 1000 倍數與 8000 上限 |
| 提領雙花與競態 | 推翻 | `request_withdrawal` 先 `for update` 鎖 profiles；fresh 沖銷在同一把鎖下 |
| claim 與 extend 付款並行造成效期重疊 | 推翻 | claim 要求會籍有效，付款要求已失效（prepare 擋 active），兩者互斥 |
| `reconcile_king_credits` 門檻為 0 時除以零 | 推翻 | `reward_config` 有 `check (threshold >= 1)` |
| 停權推薦人仍收三代獎金 | 推翻（符合規格） | §8.2 明訂發獎時「不檢查上線狀態」 |
| 退件退款被歸到人工調整 | 推翻 | `type='adjustment'` 且 `withdrawal_id` 有值時歸為 `withdrawal_refund`（20260802000002:57） |
| fresh 換線後，自癒函數回溯補發換線前的獎金 | 推翻 | #167 的 `referred_by_changed_at` 閘門（repair-retro-rewards.test）；P0-1 棄單時這道閘門反而會排除舊事件，屬於安全方向 |
| 前端 `withdrawalBankData` 換人預填（子 agent 原判 P0） | **降級為 P1**（P1-7） | 需要 auth-js 在初始化時吞掉 SIGNED_OUT 才可達，尚未以測試證實；提領第 3 步畫面上會顯示預填的帳號，會員有機會發現 |
| `/auth/register` 查詢錯誤導致錯綁預設推薦人（子 agent 原判 P0） | **降級為 P1**（P1-1） | 要在單次 DB 暫時錯誤的瞬間送出註冊才會發生，機率低；嚴重度類別屬 P0，正式站若查出實例就升級 |
