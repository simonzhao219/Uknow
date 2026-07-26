# 預設推薦人（未填推薦碼時自動綁定）實作進度

分支:`claude/default-referral-code-etigue`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

> 註:本 feature 在 web session 既有的 `claude/*` 分支上開發(平台在 session
> 啟動前開好,早於任何 hook),非 `feature/*`。規劃檔守衛只認 `feature/*`,
> 故不會觸發;流程仍照三段式走。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `reward_config.default_referrer_code` + 未填推薦碼者付款綁定預設推薦人(情境 A/B/E) | ⬜ 未開始 | | |
| 2 | 護欄:自我推薦、碼失效 fallback、續約 no-op(情境 C/D/F) | ⬜ 未開始 | | |
| 3 | 推薦王照常參與 + 規格書 §7/§8 同步(情境 G) | ⬜ 未開始 | | |

## 目前位置與下一步

規劃書已完成,尚未送 `/review-plan`。**尚未寫任何產品程式碼**。
下一步:跑 `/review-plan default-referral-code`,四視角審查後停等人審;
實作只能由人親自打 `/tdd-implement default-referral-code` 啟動。

## Blockers(逃生口紀錄)

- **開放問題未決(阻擋階段 1 的真路徑驗證)**:`asa899869` 是否存在於
  正式站/develop 的 `referral_codes` 且為 `active`,尚未確認。develop 的
  Supabase branch 有獨立 DB,極可能不存在此碼——階段 1 的測試需自行建立
  測試用推薦碼作為預設值(不要直接依賴 `asa899869` 這個字面),否則測試
  會走到 fallback 路徑而非主路徑,綠燈卻沒證明任何事。
- **開放問題未決**:規格書 §7/§8 是否記載此機制。規劃書採「記載機制本身、
  不加面向使用者的告知語句」的解讀,待人審確認。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->
