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

**三輪審查全部完成,規劃書已到 v4,無未處置 P0/P1。開始實作。**

第三輪(v3)結果:P0 0、P1 8、P2 4,全數處置。兩個最重要的:
- **V3-1** F/H 在 SQL 層回傳相同的零列,v3 的告警分類做不到 → 改用只做診斷
  分類、不參與權限判定的輔助查詢,兩者都告警但 reason 不同
- **V3-3** 抑制只做渲染層擋不住網路層 —— `fetchReferrerInfo` 照樣發
  `GET /referrals/validate/<碼>` 並 console.log 印出碼與推薦人真名

**v4 縮小了範圍**:撤回 §4.3(`CompleteProfile` 抑制)——系統視角證明
`isEditing && isAutoReferral` 不可達(`/auth/reset-registration` 對有
completed 訂單者回 400,而旗標為 true 者必然有),UI/UX 視角證明 v3 的佐證
引用已不存在。改為在階段 3 補測試釘住那道守衛。

## Blockers(逃生口紀錄)

**三項人審裁決已全數完成,無阻擋開工的 blocker。**

- [x] **既有 fresh 換線回溯發獎 bug** → 裁決 **(a) 另開 fix-bug**,已開
  **GitHub issue #167**,不併入本 feature。
- [x] **推薦網絡樹規模** → 裁決 **接受**,上線到 develop.uknow.pages.dev 與
  uknow.com.tw 後再視實際狀況評估。維持 §7 觀察項。
- [x] **`asa899869` 的存在性** → 確認**任何環境都不存在**。推薦碼由
  `generate_referral_code()` 隨機產生、無法自選,只能以 SQL 指定;`code` 欄位
  無格式 CHECK 故此碼合法,但 `user_id` 是 not null 外鍵,必須掛在真實帳號下。
  建立步驟見 plan §5.5(**營運動作,非 migration**——帳號 uuid 在兩環境不同,
  寫死會靜默失效)。
  ⚠️ **測試仍一律自建測試用推薦碼當預設值**,不要依賴 `asa899869` 字面,
  否則會走 fallback 路徑,綠燈卻沒證明任何事。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->
