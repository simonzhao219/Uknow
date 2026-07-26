# 預設推薦人（未填推薦碼時自動綁定）實作進度

分支:`claude/default-referral-code-etigue`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

> 註:本 feature 在 web session 既有的 `claude/*` 分支上開發(平台在 session
> 啟動前開好,早於任何 hook),非 `feature/*`。規劃檔守衛只認 `feature/*`,
> 故不會觸發;流程仍照三段式走。

## 階段狀態

規劃書已改寫為 **v2**(依 review.md 的 2 個 P0、11 個 P1、3 個 P2 與人審裁決)。
階段由 3 個改為 5 個:

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `reward_config.default_referrer_code` + `resolve_default_referrer()` 子函數(首購判準/停權護欄/大小寫/自我推薦)——情境 D/E/F/H/I | ⬜ 未開始 | | |
| 2 | 接進 `apply_referral_side_effects`(exception 隔離 + 回寫三欄位)+ `profiles.referred_by_is_default`——情境 A/B/C/G/L | ⬜ 未開始 | | |
| 3 | 回歸:fresh 換線與 claim 路徑——情境 J/K | ⬜ 未開始 | | |
| 4 | 契約 + API:`ProfileResponseSchema.isAutoReferral` | ⬜ 未開始 | | |
| 5 | 前端抑制(`PaymentCheckout` / `CompleteProfile`)+ 規格書 §7/§8 同步——情境 M | ⬜ 未開始 | | |

## 目前位置與下一步

**尚未寫任何產品程式碼。**

v1 的兩個 P0 已由人裁決並在 v2 處置完畢(見 `review.md`〈處置〉):
- P0-1 → 解析改用 `validate_referral_code()`
- P0-2 → 裁決「只綁首購」,判準用現成的 `subscriptions.is_renewal`;
  此判準同時讓回溯發獎鏈在源頭不成立,不必動自癒函數
- 額外裁決:啟用 `isAutoReferral` 抑制顯示 → 範圍擴大到 `src/**` 與共用契約

**下一步:對 v2 重跑 `/review-plan default-referral-code`**(P0 修訂後不得直接
開工)。v2 審過後才由人親自打 `/tdd-implement default-referral-code`。

## Blockers(逃生口紀錄)

- **已解除**:P0-2 的裁決(選項一/讀法二)。保留技術根據供實作參考——
  既有無推薦人會員一旦被綁定,只要載入一次 profile
  (`index.ts:362` 對 `registrationStep === 3` 無條件呼叫
  `repairOrphanedPaymentsBestEffort`),`repair_orphaned_payments` 的候選條件
  (`20260716000006`:377-382)就會把其**歷史 subscription** 全部抓成候選並補發
  gen1。v2 靠「只綁首購」讓 `referred_by_user_id` 始終為 null,從源頭切斷。
- **開放問題未決(阻擋階段 1 的真路徑驗證)**:`asa899869` 是否存在於正式站/
  develop 的 `referral_codes` 且 active、未停權,尚未確認。develop 的 Supabase
  branch 有獨立 DB,極可能不存在此碼——階段 1、2 的測試一律**自建測試用推薦碼**
  當預設值,不要依賴 `asa899869` 字面,否則會走 fallback 路徑,綠燈卻沒證明任何事。
- **開放問題未決**:規格書 §7/§8 是否記載機制本身;§4.3 既有缺陷本次不修是否接受;
  預設推薦人帳號的提領落地面(KYC/每日上限/資金消化)。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->
