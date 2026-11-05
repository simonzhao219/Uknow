# 續約路徑潛伏組（renewal-path-hardening）規劃書審查報告

<!-- plans-keep: 第 5 波 S6 審查鷹架；退場條件同 plan.md（/tdd-implement 收尾刪除，或第 6 波接手後刪） -->

審查對象：`./plan.md`（commit `078d9fe`）。四個 fresh-context reviewer 平行審查；本檔只彙整、去重、排序，**不改判**。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 3 | 6 | 冪等與重複扣款、鎖序（死鎖）、部署順序、既有資料加法安全、PayUni 外部整合、R4 改法、`king_round_base` 算式 |
| 架構 | 0 | 3 | 6 | 鎖序、definer grant 慣例、測試命名、前端模組邊界 |
| UI/UX | 0 | 7 | 2 | 資訊架構、模式一致性、§7.4 不揭露 |
| 需求 | 0 | 4 | 3 | 工項覆蓋、不做清單、無硬編金額、重現步驟、S2 已知限制、W5-7 反向斷言 |

引用核實（系統）：plan 引的 index.ts 與 migration 行號全部屬實，唯 `20260726000102` 讀 profiles 實為 `:72-76`（plan 寫 `:69-72`）。changed_at 同類掃描經獨立核實成立。

## 發現清單（依嚴重度排序）

### P1

1. [P1][系統]〔2.1 鎖序／R2〕環檢查只持有付款人自己的 profiles 鎖，**跨使用者併發成環**擋不住（A 選 B 的碼、B 選 A 的碼同時付款，雙方都讀到舊 edge）→ 0d 換線區段取全域 `pg_advisory_xact_lock(<常數>)`（只在 fresh 且 source 為 code／default 時取；鎖序 orders → profiles → advisory），遞迴 CTE 用 `UNION` 去重終止；階段 2 加併發測試。
2. [P1][系統]〔2.1 0d〕0d 未定義例外隔離：raise 會回滾整筆付款完成（notify／reconcile 反覆重試）；隔離後失敗則意圖永久丟失（repair 不重做 0d）→ 0d 包 `exception when others`＋error 告警（帶 trade_no 與意圖），明寫失敗＝不換線、帳本照清、人工處理（與 Q2 同形），上線後對帳查詢涵蓋此態。
3. [P1][系統]〔2.1 migration A〕`fresh_referrer_user_id references profiles(id)` 缺 `on delete`，預設 NO ACTION 會擋住被選者的帳號刪除 → `on delete set null`；0d 遇 user 為 null 且 source=code 視同不換線＋告警；`referral_pair_history` 不加 FK 或兩端 cascade。
4. [P1][架構]〔2.1／2.4 migration 分配〕A 承載階段 1、2 的函式，B 又改 `process_successful_payment` 與 `apply_referral_side_effects`，未寫 B 的基準＝A，易靜默蓋掉 0d 與 changed_at；觸發器基準（`20260807000001`）未列 → 明列 A／B 內容與基準；建議拆 A1（階段 1：`referral_would_cycle`、`pay_referral_generations`）／A2（階段 2）。（系統 P2 同指此點）
5. [P1][架構]〔2.1 觸發器 changed_at〕「呼叫端明確改了就尊重」無可實作判準（`is distinct from old` 在 p_paid_at 恰等於舊值時落回 now()）；INSERT 路徑未定 → 寫死判準與 INSERT 行為，測試涵蓋「明確設值保留」與「一般改推薦人仍寫 now()」。
6. [P1][架構]〔§5 階段 2→3〕階段 2 的紅燈主案例（fresh 建單不付 → extend 付款）要 Edge 改完才會綠；`renewal-modes.test.ts`、`fresh-default-referrer.test.ts` 同列兩階段，既有斷言是「prepare 寫 profiles」→ 階段 2 主案例在 RPC 層以 SQL 呼叫六參數版造意圖，Edge 層主案例歸階段 3；兩階段測試檔不重疊或規定階段 2 不動既有斷言。
7. [P1][需求]〔§5 階段 7〕規格書同步未列章節 → 逐章列：§7.4（prepare 套用→付款時套用、`referred_by_is_default` 重置時點）、§6.2（無條件確認、400 模式必選、409 已付款待開通、成環 400、重複付款的 fresh 不換線）、§9.1（`king_round_base`、fresh 後從 0）、§9.2（pair-history 本體改為表、「當月桶刪除」措辭）、§7.2／§8.2（禁止成環）；同步 `check-spec-drift.py` 抽取項。（架構 P2：規格書改動隨觸發階段提交，不全擠到階段 7）
8. [P1][需求]〔§2.1 changed_at〕範圍擴張：派工未要求修觸發器與首購預設推薦人回寫，碰首購路徑與 repair 閘門，未列入不做或開放問題 → 拆獨立工項或列開放問題請人裁決；保留則補規格依據（§8.3 自癒）與獨立重現，並說明非 R1 必要條件。〔需人工裁決〕
9. [P1][需求]〔§7〕派工必答「migration 對 15 筆訂閱、21 列 reward_transactions 的影響」只有定性 → 先請主 session 跑 §7 唯讀查詢把數字寫進規劃；補「既有列零變動、回填僅新增 pair 列」斷言與驗證 SQL；回填 gen1 是否含 claim 列要判斷（見 P2-6）。
10. [P1][UI/UX＋需求]〔§4 推薦人句、Q6〕留空句「您將不指定推薦人」在 `source='default'`（實際綁預設推薦人＝推薦人會變）與 `source='keep'`（維持原上代）下真假不同；`newCodeStatus` 的 `unavailable`、`invalid`、`valid` 但無姓名三態無文案 → 依狀態規定文案並寫成測試；留空句改「推薦人將改變」或依 source 分句。〔需人工裁決〕
11. [P1][UI/UX]〔§4、R5〕`needsFreshConfirm` 現要求 `!!renewal`，plan 只寫「永遠出現」→ 改成只看 `renewalMode === 'fresh'`；renewal 未載入／失敗時框內寫「無法取得點數與推薦資料，確認後可能清空」或停用確認鈕＋重試；測試涵蓋 renewal 為 null。
12. [P1][UI/UX]〔§4 確認鈕〕無資產的 fresh 沒有「失去」，紅實心（§12.11 判準＝造成失去）會稀釋警示；無資產時框內沒有內容可確認 → 有資產紅實心、無資產改流程鈕（墨黑），或寫明不破例理由；無資產時加一句「目前沒有點數或推薦紀錄需要清空」。〔需人工裁決：鈕色〕
13. [P1][UI/UX]〔§4 localStorage 分支〕沿用 `suspensionPending` 缺三態：載入文案是停權語意；讀取失敗「不擋」讓舊快照續費者回到首購路徑（R3 本身）；快照→server 切換版面跳動、已填欄位去留未定 → 載入顯示「正在確認您的會員狀態…」；失敗顯示可重試的內嵌提示（不放行付款）；切換時保留已填欄位。
14. [P1][UI/UX]〔§4 RENEWAL_MODE_REQUIRED〕toast「請重新整理頁面」與「自動重抓」矛盾、toast 會消失 → 改「已更新您的會員資料，請選擇續約或新約」，重抓後焦點與捲動移到模式選擇區，加內嵌提示。
15. [P1][UI/UX]〔§4 prepare 409〕只規定 toast＋導向 → 確認 `/payment/result` 對 pending＋SUCCESS 有「開通處理中」文案與輪詢、tradeNo 缺失時的畫面；導向期間付款鈕保持停用；toast 只當輔助。（系統 P2：RPC 只回 text，Edge 拿不到 trade_no，見 P2-4）
16. [P1][UI/UX]〔§4／R4〕R4 只改後端旗標，前端導向與文案未寫 → 明寫導 `/payment/result?tradeNo=lastTradeNo`，確認續費者的 activating 不落到 renew；階段 6 補前端導向測試。

### P2

1. [P2][系統]〔2.1 0d〕0d 條件缺 `v_is_renewal`：首購者手打 `renewalMode='fresh'`＋碼會換線且不清帳本（既有漏洞，0d 沿用等於保留）→ 0d 加 `and v_is_renewal`，Edge 對無訂閱紀錄者的 fresh 不寫意圖。
2. [P2][系統]〔2.1 wrapper〕三參數 wrapper 委派新函式會把新 outcome 回給舊 Edge（→ 500，fail-closed 可接受但要寫明）；視窗內經 wrapper 建的 fresh 單 source 為 null 在**正式站也會出現**，「只可能在 develop」不精確。（架構 P2 同指，並要求測試）
3. [P2][系統]〔2.1 欄位 RLS〕`payment_orders_select_own` 整列可讀，source=default 時意圖欄會讓使用者讀到預設推薦人（與 `profiles.referred_by_code` 現況同級，非新增暴露）→ source=default 只存 source、付款時再 resolve，或註明接受現況。
4. [P2][系統]〔2.2 paid_pending〕(a) RPC 回 text，Edge 無 trade_no 可帶 → Edge 409 前再查或 RPC 改回 jsonb；(b) 永遠修不好的 SUCCESS pending 單（金額不符）會讓人永久被 409 → 409 同時寫 system_alert，plan 寫明人工處置。〔需人工裁決：是否可接受〕
5. [P2][架構]〔2.1 paid_pending〕對首購者（step 2 有 pending＋SUCCESS）同樣回 409，屬行為變更 → 規格或測試補首購案例。
6. [P2][系統]〔2.4 回填〕gen1 回填未排除推薦王 claim 發放的列（`source_claim_id` 非 null，非「付款 +1」配對）→ 加 `source_claim_id is null`，略過 `referee_user_id` 為 null。（需求 P1-9 同指）
7. [P2][架構]〔2.2 contract〕`api-contract.ts` 無 prepare 錯誤 schema；現行 400 是 `{success:false,error:string}`、停權 403 是 `{error:{code,message}}` → 決定新拒絕的單一形狀並列契約測試；R3 前端依賴 `RENEWAL_MODE_REQUIRED`，不能是「若需」。
8. [P2][架構]〔2.2 Edge 守衛順序〕Edge 預檢 `mode_required`／`cycle` 若早於 suspended／active，停權者看到 400 不是 403 → 預檢放在 suspended／active 之後，或明寫以 RPC 優先序為準。
9. [P2][架構]〔2.4 migration B〕新表 RLS 開但無 policy，未列安全測試；回填 SQL 與 DDL 分段、回填規模未交代 → 階段 5 加 anon／authenticated 讀不到斷言，確認 RLS 掃描涵蓋新表。
10. [P2][需求]〔§5 journey〕R3（曾訂閱者無 body → 400）、R4（卡單 409／旗標）無 journey 章節 → 補 API 層章節驗 400，說明 R4 為何只在 D 層測。
11. [P2][需求]〔R6、階段 5〕驗收寫死「8 位」→ 改「門檻」，測試讀 `reward_config`。
12. [P2][需求]〔R5〕「fresh 一律確認」未明範圍（§6.2 表列 fresh 適用「首購或續費」）→ 寫明只限續費者（首購送 null，不經 fresh 選項）。
13. [P2][UI/UX]〔§4 確認框〕段落增多後小螢幕要可捲動 → 內容區 max-height＋捲動，驗 375px 寬的最長狀態（資產全有＋已付補繳＋推薦人句）。

## 需人工裁決

reviewer 標記的（聚合者不改判，只列出）：

- **D1**（需求 P1-8）：`referred_by_changed_at` 修法留在本工項，或拆出／列第 6 波。
- **D2**（UI/UX＋需求 P1-10）：留空新約的推薦人句措辭（「將不指定推薦人」／「推薦人將改變」／依 source 分句）。
- **D3**（UI/UX P1-12）：無資產 fresh 的確認鈕色（紅實心／墨黑流程鈕）。
- **D4**（系統 P2-4）：永遠修不好的 SUCCESS pending 單讓人永久被 409，是否可接受（附告警與人工處置）。
- 需求 reviewer 註：其環境無 shell，未讀到 W5-1／7／8／9 原文，只依派工原文溯源；需主 session 對照 `launch-wave-5/plan.md` §0 逐條核。
- plan §6 Q1–Q6 仍待裁決（需求 reviewer：Q5 偏文案，可由規劃者自定）。

---

# 第 2 輪（對象：plan v2，commit `22c9280`）

## 審查結論

| 視角 | P0 | P1 | P2 | v1 發現處置 |
|---|---|---|---|---|
| 系統 | 0 | 1 | 4 | v1 系統 P1×3、P2 全處置（P1-1 的處置引入下列 P1） |
| 架構 | 0 | 0 | 3 | v1 架構 P1×3、P2×5 全處置 |
| UI/UX | 0 | 1 | 5 | v1 P1×7、P2 全處置（P1-10 部分處置，見下） |
| 需求 | 0 | 1 | 3 | v1 需求 P1×4、P2 全處置（P1-7 規格同步仍有漏項） |

## 發現清單（依嚴重度排序）

### P1

1. [P1][系統]〔§2.3 0d、鎖序總表〕「持有 advisory 後不再等別的列鎖」不成立：0d 之後的發獎與寫邊（insert `reward_transactions`／`referral_edges`／`task_progress` 的 FK 檢查要 `profiles(U)` 的 `FOR KEY SHARE`，`reconcile_king_credits` 鎖 `task_progress(U)`）會等收獎者 U 的列鎖。若 U 同時付 fresh（持 `profiles(U)` FOR UPDATE、排隊等 advisory）→ **死鎖**；被殺的一方錯誤會被各段 `exception when others` 吞掉，變成靜默不換線或靜默漏發 → advisory 前移到「鎖訂單之後、0b 鎖 profiles 之前」，條件只看 `v_renewal_mode='fresh'`（`v_is_renewal` 尚未算，用 `exists(subscriptions)`）；鎖序改 `payment_orders → advisory(fresh) → profiles`；取鎖放在 0d 的 exception 區塊外（不吞 40P01）；階段 2 加雙連線測試「A 的上線 U 同時付 fresh」。
2. [P1][UI/UX]〔§4／R5〕確認框依 source 分句了，但同畫面新約展開區的常駐說明沒改：`PaymentCheckout.tsx:1090`「不填則不會有推薦人」在 default、keep 下都不成立；`:1048-1052` placeholder「目前：{碼}」在 default 下暗示留空會保留 → 這兩處依 `freshDefaultReferrerAvailable` 分句，與確認框同文案來源（default＝「不填則推薦人將改變」；keep＝「不填則維持原推薦人」），placeholder 只在 keep 顯示「目前」；更新 `:1087-1088` 的「Q11 裁決文案逐字」註解；階段 6 斷言三處一致。
3. [P1][需求]〔§5 規格書欄〕規格同步仍漏：§4.1「新約＝換線」措辭、§6.2 表格（`:287`）換線時點、§6.2「模式由建單時寫入 `payment_orders.renewal_mode`」（`:303`，要補意圖三欄與「付款當下才寫 profiles」）；規格書內引用的新 migration 檔名須等實檔存在才寫（`check-spec-drift.py` 的 path 檢查）→ 補進階段 2／3／5 的規格書欄。

### P2

1. [P2][系統]〔§2.3 0d〕exception 與 advisory 交互本身無缺口，但「3b 在鎖內」只對成功路徑成立（例外路徑子交易回滾會釋放鎖與 GUC）→ 措辭限定成功路徑；補測試「0d 例外後 GUC 回復、changed_at 不受影響」。
2. [P2][系統＋架構]〔§2.3 wrapper〕六參數版**不得**給 `p_referrer_*` default（否則舊 Edge 三具名參數呼叫會 PGRST203 歧義）；兩個簽章各自 revoke／grant，`security-definer-grants.test.ts` 涵蓋兩個多載。
3. [P2][系統]〔§2.7 king_round_base〕`base = max(round_ordinal)` 會吞掉「已達門檻但 reconcile 尚未補發」的 credit → `base = greatest(max(round_ordinal), floor(刪桶前長度/門檻))`，或明寫「寧少發」取捨。
4. [P2][系統]〔§2.3 paid_pending 告警〕每次被擋都寫一筆會刷屏；告警失敗會讓 prepare 500 → 以 trade_no 去重或包 exception 隔離，409 不因告警失敗而失效。
5. [P2][架構]〔§2.3 末段〕「`repair_orphaned_payments` 呼叫 apply 時傳 `po.completed_at`」——現況 `20260807000001:135-136` 傳 `v_candidate.paid_at`（＝`po.completed_at`）→ 改寫成「現況已成立，不改」，或補進 A2 函式清單。
6. [P2][架構]〔§5 階段 2→3〕A2 一進 develop，舊 Edge 經 wrapper 會對曾訂閱者 null、paid_pending 回 500 → 寫明階段 2 與 3 同一 PR 合併（或 wrapper 對這兩個 outcome 保持舊行為）。另：0d 用到 `v_duplicate`，位置應寫「0c 之後」。
7. [P2][UI/UX]〔§4 localStorage 分支〕「`/profile` 讀不到就停用」擴及走快照的**首購者**（現行為首購轉換留「不擋」，`:258-259`），未說明取捨；失敗態未沿用 `LoadErrorCallout`＋`useRetryFocus` → 明寫取捨或沿用既有元件。〔需人工裁決：首購者要不要放行〕
8. [P2][UI/UX]〔§4 RENEWAL_MODE_REQUIRED〕重抓失敗、重抓後仍判不出續費（無出口、每按一次 400）未規定；聚焦目標與 live region 語意未定 → 重抓失敗給重試；仍判不出 → 「請聯絡客服」＋停用付款鈕；模式區 `tabIndex=-1`、提示 `role="status"`，進階段 6 測試。
9. [P2][UI/UX]〔§4 REFERRAL_CYCLE、階段 6〕無前端測試；錯誤在畫面上方欄位、行動版看不到 → 捲動並聚焦碼欄位、`aria-invalid`＋`aria-describedby`；更佳：`/referrals/validate` 回成環、blur 時就攔。
10. [P2][UI/UX]〔§4 確認框、§2.5〕`max-h` 捲動區：footer 留在捲動區外、捲動區 `tabIndex=0`＋`role="region"`＋標籤；`freshDefaultReferrerAvailable` 在 zod 設 optional，缺值視為 keep（前端先上、Edge 後上的空窗不會讓整個 renewal 解析失敗）。
11. [P2][UI/UX]〔§4 409〕`lastTradeNo` 缺漏時導 `/dashboard` 會與 `registrationFlow.ts:331`（activating 無單號 → `/payment/checkout`）互彈 → 契約必填 `lastTradeNo`，缺漏視為契約錯誤、顯示客服入口不導向。
12. [P2][需求]〔R5 推薦人句〕填的碼就是現任上代時「推薦人將改為 {姓名}」不成立 → 碼等於現上代時改句（例「您的推薦人維持 {姓名}」）。〔需人工裁決〕
13. [P2][需求]〔§2.7、階段 5〕§9.1 公式「張數＝floor(當月新人數／門檻)」要改寫、§9.2 `:595-599`「當月桶刪除」兩處 → 階段 5 規格書欄明列。
14. [P2][需求]〔R4〕首購者 pending＋SUCCESS 也 409 屬行為變更，規格書未列 → §4.1 或 §6.2 補一句。
15. [P2][UI/UX]〔R5〕「有資產」的反向定義未明寫 → 寫成「點數>0 或 推薦>0 或 hasPaidAnyBackfill」。

## 需人工裁決（第 2 輪）

- **E1**（UI/UX P2-7）：走 localStorage 快照的首購者，背景 `/profile` 讀不到時要不要放行付款（現行放行；v2 改成停用）。
- **E2**（需求 P2-12）：填的碼等於現任上代時，確認框推薦人句要不要改成「維持 {姓名}」。

---

# 第 3 輪（對象：plan v3；主 session 指示只由系統 reviewer 複審鎖序改動）

## 審查結論

| 視角 | P0 | P1 | P2 | 第 2 輪處置 |
|---|---|---|---|---|
| 系統 | 0 | 0 | 5 | 第 2 輪系統 P1（死鎖）已解：0a′ 逐條對過 notify／return 並發、同人兩單、FK KEY SHARE、`reconcile_king_credits`、`claim_referral_king_reward`、`register_profile`、repair 系列，advisory 不在任何等待環上；第 2 輪系統 P2 四條皆處置（其中兩條措辭／算式仍不完整，見下） |

## 發現清單

1. [P2]〔§2.3 0a′〕「取鎖不在任何 exception 區塊內，40P01 照常往上拋」不實：函式最外層 `exception when others then raise exception`（`20261111000003:241-243`）會改寫成 P0001。整筆仍回滾，行為是「整筆重試」→ 改措辭；測試不以 SQLSTATE 40P01 斷言。
2. [P2]〔§2.3 鎖序總表／prepare〕新欄 FK 讓 prepare insert 對被選者 X 取 KEY SHARE；prepare 持本人 A `for update`、X 的付款交易持 profiles(X) 並換線到 A 子樹內、對 profiles(A) 取 KEY SHARE → 窄死鎖（付款方被殺時發獎段吞成 warning＝靜默漏發一代）→ prepare 改 `for no key update`（仍與付款 `for update` 互斥），加併發測試。
3. [P2]〔§2.3 併發測試〕兩個雙連線測試靠碰運氣的時序，v2 的死鎖版本也可能通過 → 第三連線先持 advisory（鍵寫死 `hashtext('referral_rewire')`）、`pg_stat_activity` 確認兩筆都在等、`for update nowait` 證明等待方不持 profiles 鎖、放鎖後斷言三代列齊全且無 system_alerts。
4. [P2]〔§2.7 king_round_base〕多次 fresh 丟前一次 base；讀桶長與清桶之間未鎖 `task_progress`；門檻取得方式未寫 → `greatest(max(round_ordinal), 舊 base + floor(桶長/門檻))`、`for update` 讀桶、函式內讀 `reward_config`；測試「連續兩次 fresh、中間 reconcile 失敗」。
5. [P2]〔§2.3 0d／§2.2〕0d 寫 profiles、apply 3b 寫 edge 分屬兩個子交易，3b 自吞例外時兩者不一致，`referral_would_cycle` 只讀 edges 會漏看 → 0d 同一子交易內 upsert edge；§7 對帳查詢補 profiles／edges 一致性。

## 需人工裁決（第 3 輪）

- **F1**：建單到付款之間（繳費期限 3 天內）被選的推薦人（code）或預設推薦人（default）遭停權、碼被撤銷，0d 只檢查「被刪／成環」——付款當下要不要重驗 `validate_referral_code`？reviewer 不定性。規劃者建議見 plan §6。

## v3.1 處置

5 條 P2 全收進 plan（v3.1）；F1 列 plan §6 待裁決。P2 不重跑審查（主 session 指示只複審鎖序改動，鎖序結論 P1 已清零）。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。
     tdd-implement 開工前會檢查：存在未處置 P0 → 拒絕開工。 -->

無 P0。P1 16 條待業主裁決後修訂 plan（規劃者預計全收，D1–D4 依裁決）。

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
