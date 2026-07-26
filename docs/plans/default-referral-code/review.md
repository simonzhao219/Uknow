# 預設推薦人 規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent 的發現而成。
     聚合規則:只彙整、去重、排序,不改判。 -->

審查對象:`docs/plans/default-referral-code/plan.md`(commit `55e664b`)
審查日期:2026-07-26

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1 | 2 | 2 | 回寫鎖範圍、`pay_referral_generations` 必要性、自我推薦護欄、`getRewardConfig` 相容、migration/RLS 安全、金流冪等、fresh 換線交互 |
| 架構 | 1 | 4 | 1 | appShell 契約、路由 lazy/apiClient、§2.3 執行順序、測試命名慣例、spec-drift 把關 |
| UI/UX | 0 | 3 | 0 | BottomNav 五格契約、模式一致性、a11y |
| 需求 | 1 | 3 | 1 | §9.2 pair-history 判准、§10 提領靜態規則、§8.1 可調參數、需求溯源 |

**去重後**:P0 **2** 項(停權護欄由系統+架構獨立撞上,合併為一項)、
P1 **11** 項、P2 **3** 項、需人工裁決 **2** 項。

---

## 發現清單(依嚴重度排序)

### P0-1 〔§2.4 / §2.5 護欄〕停權推薦人的洞被重開

**來源**:系統視角、架構視角**獨立提出同一項**;主 session 已讀碼驗證屬實。

規劃書 §2.4 原話:「解析時能一併檢查 `referral_codes.status = 'active'`
——推薦人若被停權,機制自動失效。」**這句技術主張是錯的。**

全庫無任何 trigger 在 `profiles.suspended_at` 被設定時連動改
`referral_codes.status`,兩欄位完全獨立。真正擋停權推薦人的是
`validate_referral_code()` 自己的查詢條件
(`20260720000001_wave4_guards.sql:152-160`):

```sql
where rc.code = p_code
  and rc.status = 'active'
  and p.suspended_at is null
```

該 migration 檔頭明寫此行的理由:「排除停權推薦人——被停權仍繼續拉下線
賺獎金是權限模型的洞」。照規劃書字面實作(只查 `status='active'`),等於
把這個已被修過的洞在「預設推薦人」這個新入口重開一次。

→ **建議**:解析預設推薦人一律重用既有 `validate_referral_code(p_code)`
(它已是「推薦碼合法性」的單一真相),不要自行拼查詢條件;§1 補一列
驗收情境「預設推薦人於解析當下已被停權 → 不套用」。

### P0-2 〔§1 明確不做〕「不回填」與機制自相矛盾,且會**回溯**發放歷史獎金

**來源**:需求視角提出前半(lazy 回填);後半(回溯發放)為主 session
追查 `repair_orphaned_payments` 後驗證的**追加事實**,嚴重度因此提高。

規劃書 §1 斷言「不回填既有 `referred_by_user_id is null` 的會員」,且
「這些會員日後續約或領任務 credit 時,仍不會產生任何三代獎金」。但 §2
的機制只判斷「當下 `referred_by_user_id` 是否為 null」,對付款事件一視同仁,
不分辨「上線後全新首購」與「既有會員的續約」。

**驗證過的完整後果鏈**:

1. 既有會員 M(無推薦人,歷史訂閱 S1、S2)在本 feature 上線後續約(S3)
   → `v_referrer1 is null` → 套用預設 → 回寫 `referred_by_user_id`
2. M **只要載入一次自己的 profile**,`index.ts:362` 就會呼叫
   `repairOrphanedPaymentsBestEffort`(條件僅 `registrationStep === 3`)
3. `repair_orphaned_payments` 的候選條件
   (`20260716000006_payment_concurrency_and_referral_fixes.sql:377-382`)是
   「`pr.referred_by_user_id is not null` 且該筆 subscription 的 gen1 未發過」
   ——M 剛剛才變成 not null,於是**歷史訂閱 S1、S2 全部成為候選**
4. 逐筆補呼叫 `apply_referral_side_effects(M, S1)`、`(M, S2)`
   → **預設推薦人收到 M 過去每一筆歷史訂閱的第 1 代獎金**

即「不回填」在目前設計下不只做不到,還會**回溯**發放,觸發條件僅是使用者
開一次頁面。這與已拍板的決定方向相反。

→ **建議**:此為商業決策,不得由實作者選邊(見〈需人工裁決〉A)。技術上
若要真正落實「只對新人生效」,需補一個「本次是否為此帳號有史以來第一筆
已完成付款」的判準,不能只用 `referred_by_user_id is null` 當唯一條件。

---

### P1 清單

| # | 視角 | 章節 | 缺口 → 建議 |
|---|---|---|---|
| 1 | 系統 | §2.3 | 新解析區塊未明說要包獨立 `begin…exception`。主函數無頂層例外處理,4 個既有步驟各自隔離;未捕捉的例外會一路展開到 `process_successful_payment` 的 savepoint,**把已成功的 3a 建推薦碼一併回滾** → 比照既有慣例自包一層,任何例外一律 `log_system_alert` + fallback 成無推薦人繼續往下 |
| 2 | 系統 | §2.1 / §5 | 「唯一漏斗」措辭不準確:`pay_referral_generations` 有 **3 個**呼叫點(`apply_referral_side_effects`、`claim_referral_king_reward`、`repair_orphaned_claim_rewards`),後兩者不經套用點。今日安全是靠「能 claim 必先付過款」這個**未明講也未測試**的不變量 → 措辭改成「唯一**寫入**預設值的漏斗」並明文寫下該不變量;§5 補情境驗證 claim 路徑對「靠預設解析出的上線鏈」也正確發獎 |
| 3 | 需求 | §5 / §6 | 驗收情境 A–G 未覆蓋 §8.2 對照表的「新約 fresh 換到全新上線」與「任務成功續約(領免費 credit)」兩列在疊加預設推薦人後的語意。經查機制*恰好*能正確運作,但屬代碼巧合而非規劃保證,無回歸測試保護 → 補情境 H/I 與對應測試 |
| 4 | 需求 | §1 | 情境 C 的預期欄只寫「no-op」,未斷言「本次續約仍應依 §8.2 第 2 列對預設推薦人發 100P 三代」→ 易被誤讀成整筆續約都不發獎,應補一句 |
| 5 | 需求 | §6 | 開放問題遺漏兩項:①「不回填」是否約束既有會員的未來付款(即 P0-2 的決策面),規劃書自行下了與機制矛盾的結論;② 預設推薦人帳號能否/是否會實際通過提領 KYC 與每日上限、平台如何消化快速累積的點數(§7 風險表只談發放面,未談落地面) |
| 6 | 架構 | §2 | 未沿用前一個 migration 剛立下的先例:`20260724000003` 才示範把易變邏輯抽成 `pay_referral_generations`/`reconcile_king_credits` 小函數以縮小主函數 diff。本規劃把解析+護欄整段直接寫進主體,使這第 8 次全量覆寫的可審查 diff 又變大,且新邏輯無法單獨測試 → 抽成 `resolve_default_referrer(p_user_id uuid) returns uuid`,主函數只留一行呼叫 |
| 7 | 架構 | §3 / §5 | 「1 個新 migration」與「三階段各自一個紅綠循環」互相矛盾。`supabase/README.md:113-114` 明訂不得編輯已套用的 migration,修正一律新增檔案 → 若照慣例需 2–3 個 migration;若真只有 1 個,代表階段 2/3 沒有真紅燈。擇一修正敘述 |
| 8 | 架構 | §1/§2 vs §4 | 回寫欄位清單前後矛盾:§1/§2 只提 `referred_by_user_id`,§4 卻斷言 `referred_by_code` 也會回寫。後者的 schema 註解是「註冊當下使用的推薦碼字串(**稽核用**)」(`20260620000001_initial_schema.sql:38`),寫入一個使用者從未輸入過的碼會改變該欄位語意 → §2 明確列出回寫欄位清單並與 §4 對齊 |
| 9 | 架構 | §5 | 未要求測試還原全域單列 `reward_config`。`reward-config.test.ts` 檔頭已為此立下 `finally` 還原紀律;漏做會讓殘留的 `default_referrer_code` 污染 `task-new-downline-only.test.ts`、`referral-king-reward.test.ts` 等「建立無推薦人頂層使用者並付款」的既有測試 → 在 §5 明確要求比照該紀律 |
| 10 | UI/UX | §4 | **曝光點清單遺漏最直接的畫面**:`PaymentCheckout.tsx:591-603` 續約確認卡會在有推薦碼時主動打 `GET /referrals/validate/:code` 取推薦人真名,顯示「推薦碼:asa899869 / 推薦人:〈真名〉」於使用者按下付款前。程式碼本有 `isAutoReferral` 抑制旗標,但全域搜尋**只有這一處引用、從未被任何寫入點賦值**,是完全不生效的死碼 → §4 補列此畫面;若維持顯示應由人明確裁決,而非讓看似已防呆、實則失效的旗標繼續躺著 |
| 11 | UI/UX | §2.6 / §4 | §2.6「前端皆不變」對一條路徑不成立:`CompleteProfile.tsx:91-122` 的編輯回填只要 `referredByCode` 有值就 `setCodeVerified(true)`,但 `/auth/profile` **從不回傳 `referrerName`**;於是 `:301` 的判斷式 `referralCode.trim() && referrerName` 落入 else,對一個**帶著已驗證推薦碼即將原樣送出**的使用者彈出「您未填寫推薦碼」。此為既有缺陷,但本 feature 會把受影響族群從罕見邊角變成多數自然流量 → 至少記載此放大效應交人審;根治需在回填時補打 `/referrals/validate/:code` |
| 12 | UI/UX | §3 / §7 | 預設推薦人的推薦網絡頁面對「單一帳號吸收全部自然流量」無任何規模設計:`GET /referrals/network/overview` 把**全部**一代節點當 `roots` 回傳,**無 limit/offset**;`selectInChunks` 以 150 筆序列化逐批查三張表;前端 `ReferralTreeView.tsx:655-666` 直接 `.map()` 成 DOM,**無虛擬化**。數百至數千節點時有 Edge Function 執行時限風險,行動裝置/LINE 內建瀏覽器影響更明顯,且成長無自然回落 → 人審裁決是否可接受(或先觀察首月),至少記入 §7 風險表 <br>*(需求視角就同一主題以 P2 提出「上線後效能抽測」;依聚合規則不改判,並列記錄)* |

### P2 清單

| # | 視角 | 章節 | 缺口 → 建議 |
|---|---|---|---|
| 1 | 系統 | §1 | 缺「預設推薦人自己也沒有上線」的顯式情境。經查 `pay_referral_generations:68-71` 已正確處理(gen2/3 不觸發),**不需新增分支**;但情境表沒列會讓人誤以為要特殊處理,或漏掉驗證「真的什麼都不用做」→ 補一列作文件完整性 |
| 2 | 系統 | §2.4 | `default_referrer_code` 大小寫正規化未提及。其餘寫入點都做 `.toLowerCase().trim()`(`index.ts:591`、`1401-1402`);營運人員手動 UPDATE 成混合大小寫會安靜落到 fallback → 解析時一併 `lower(trim(...))` |
| 3 | 架構 | §2.4 | `reward_config` 現有兩欄是「錢怎麼算」的業務常數,`default_referrer_code` 是「錢算給誰」的路由決策,性質不同。現況借用尚可接受(不必為單一需求另起爐灶),但 §2.4 的 SQL 片段未比照其餘欄位補 `comment on column` → 補註解;若日後更多非獎勵類開關要塞進此表,屆時考慮改用中性表名 |

---

## 需人工裁決

**A.〔P0-2 的最終定性〕「不回填」的適用範圍**

需求視角明白指出:規劃書**沒有把這件事交由人確認就自行選了一種文字描述、
卻實作另一種機制**。兩種讀法導向完全不同的實作:

- **讀法一**:「不回填」僅禁止一次性 bulk backfill migration,允許既有會員
  在未來任何一次付款時被動 lazy 綁定 → P0-2 降級為「規劃書文字需修正」,
  但仍須處理回溯發放(見 P0-2 第 4 步),因為那不是綁定而是**補發歷史獎金**
- **讀法二**:「不回填」意在完全排除既有 null-referrer 會員(含其未來付款)
  → §2 機制需補「本次是否為該帳號史上第一筆已完成付款」的判準

依聚合規則不改判、不代為選擇。**此項未裁決前不得開工。**

**B.〔UI/UX〕規劃書 §4 對「使用者何時察覺」的描述不精確**

§4 寫「推薦網絡樹會顯示 asa899869 為上線」,但查證後:所有前端元件都**沒有**
「顯示自己上線是誰」的介面,`ReferralTreeView`/`ReferralManagement` 顯示的是
**下線**。唯一會渲染上線姓名的是 `PaymentCheckout` 續約卡(P1-10),且只在
續約時觸發。描述與實情不符,可能讓人審誤判「使用者會不會發現、何時發現」
→ 是否要求修正 §4 措辭,交人裁決。

---

## 處置(人審後填寫)

**本輪(v1)處置已完成 → 規劃書改寫為 v2,須重跑 `/review-plan` 審 v2。**

- [x] **P0-1**(停權護欄):☑ 修訂規劃——`resolve_default_referrer` 一律重用
      `validate_referral_code()`,不自行拼查詢條件。新增驗收情境 H。
      (plan v2 §2.4)
- [x] **P0-2**(不回填矛盾 / 回溯發獎):☑ 裁決**讀法二**(完全排除既有會員)。
      判準採現成的 `subscriptions.is_renewal`——既有會員續約 `is_renewal = true`
      → 不進綁定分支 → `referred_by_user_id` 維持 null →
      `repair_orphaned_payments` 候選條件永不成立 → 回溯鏈在源頭切斷,
      **不必修改任何自癒函數**。新增驗收情境 I。(plan v2 §2.3)
- [x] **需人工裁決 A**:裁決結果 = 讀法二(同上)。
- [x] **需人工裁決 B**:裁決結果 = 修正 §4 措辭。v2 §4 已改為指出**確切**
      曝光點(`PaymentCheckout.tsx:591-603` 續約確認卡、
      `CompleteProfile.tsx:108` 編輯預填),並刪除「推薦網絡樹會顯示上線」的
      不正確描述(該樹顯示的是下線)。
- [x] **額外裁決(人審主動提出)**:啟用 `isAutoReferral` 抑制顯示。
      連帶效果:範圍擴大到 `src/**` 與 `_shared/api-contract.ts`,
      v1 的「`src/**` 不動 / 契約不動」宣稱已作廢(v2 §2.8、§3、§4)。
- [x] **P1 全數處置**:1→v2 §2.7;2→§2.1(措辭+不變量+情境 K);
      3→情境 J/K;4→情境 C;5→§6;6→§2.2 抽子函數;7→§5 拆 3 個 migration;
      8→§2.6 唯一定義;9→§5 測試紀律;10→§4.1;11→§4.3(記錄不修,列 §6);
      12→§7 風險表觀察項。
- [x] **P2 全數處置**:1→情境 L;2→§2.5 大小寫正規化;3→§2.5 `comment on column`。
- [x] 人審完成,裁決:☑ 修訂後通過 → **v2 須重跑 `/review-plan`**
      (P0 修訂後不得直接開工)

---

## v2 待審重點(給下一輪 reviewer)

1. `subscriptions.is_renewal` 當首購判準是否有漏洞(歷史資料該欄位是否可信、
   `fresh` 換約模式下的語意)。
2. `profiles.referred_by_is_default` 新欄位是否為必要(對比「拿 code 比對
   config」的替代方案),以及它與 `referred_by_code` 稽核語意的關係。
3. §4.2 的「維持 state 值、只抑制顯示」是否會產生新的資料/顯示矛盾。
4. 5 個階段的紅綠循環切分是否成立(特別是階段 3 是純回歸、沒有新產品碼)。
