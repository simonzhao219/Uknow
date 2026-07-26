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

v2 重審已完成(`review.md`〈v2 重審報告〉):**無新 P0**、8 個 P1、7 個 P2、
1 項需人工裁決。規劃書已修訂為 **v3**,P1/P2 全數處置。

v3 的實質修正(不只是措辭):
- **V2-2** `referred_by_is_default` 補清除時機——`/payuni/prepare` fresh 換線
  是第二個寫入點,不經 `apply_referral_side_effects`,v2 漏了它,旗標會永久卡
  `true`,把使用者自己選的真推薦人也一起隱藏
- **V2-4** 補第三曝光點 `PaymentCheckout.tsx:664-671` 的 placeholder(v1/v2 皆漏)
- **V2-5** §4.3 改為**整段區塊不渲染**——受控元件不能只清顯示值,否則使用者
  打一個字就會覆蓋掉背後的碼
- **V2-3** 情境 F 的告警指派給 `resolve_default_referrer`(查無結果不是例外,
  不會觸發 exception 隔離)
- **V2-7** 階段 3 不再是「純回歸」,有真正的產品碼

**下一步:等人裁決 `review.md`〈v2 需人工裁決〉的既有 bug 處理範圍**(見下方
Blockers),裁決後對 v3 重跑 `/review-plan`;v3 審過才由人親自打
`/tdd-implement default-referral-code`。

## Blockers(逃生口紀錄)

- **⚠️ 發現一個與本 feature 無關的既有 production bug(待人裁決處理範圍)**:
  `repair_orphaned_payments` 的候選條件(`20260720000001:516-562`)中
  `pr.referred_by_user_id is not null` 讀的是**當下**的 profiles 值,不是歷史
  訂閱當時的值。任何原本沒有推薦人的既有會員,只要透過 `/payuni/prepare` 的
  fresh 換線填一次真推薦碼,其**全部歷史訂閱**都會成為候選並回溯補發 gen1
  (甚至 gen2/gen3)給那位新推薦人;觸發只需事後載入一次 profile
  (`index.ts:361-362` 對 `registrationStep === 3` 無條件呼叫 repair)。
  **這條路徑現在就在線上**,與預設推薦人機制無關。
  選項見 `review.md`〈v2 需人工裁決〉。
- **開放問題未決**:`asa899869` 是否存在於正式站/develop 的 `referral_codes`
  且 active、未停權。develop 的 Supabase branch 有獨立 DB,極可能不存在此碼
  ——階段 1、2 的測試一律**自建測試用推薦碼**當預設值,不要依賴 `asa899869`
  字面,否則會走 fallback 路徑,綠燈卻沒證明任何事。
- **開放問題未決**:規格書 §7.4/§8.1 是否記載機制本身;§4.4 既有缺陷本次不修
  是否接受;推薦網絡樹規模是否接受上線後才修;預設推薦人帳號的提領落地面。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->
