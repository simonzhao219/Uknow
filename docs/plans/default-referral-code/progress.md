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

四視角審查已完成,報告在 `./review.md`:**2 個 P0、11 個 P1、3 個 P2、
2 項需人工裁決**。**尚未寫任何產品程式碼。**

**現在卡在人審**。兩個 P0 都必須先處置才可開工:
- P0-1 停權護欄:解析預設推薦人須重用 `validate_referral_code()`
  (`referral_codes.status` 與 `profiles.suspended_at` 無連動,規劃書原本
  的安全宣稱是錯的)
- P0-2「不回填」自相矛盾且會**回溯**發放歷史獎金:需人裁決適用範圍
  (見 review.md〈需人工裁決 A〉的讀法一/讀法二)

裁決後:改規劃 → 重跑 `/review-plan` → 人親自打
`/tdd-implement default-referral-code` 才開工。

## Blockers(逃生口紀錄)

- **P0-2 未裁決(阻擋開工)**:「不回填」的兩種讀法導向不同機制,規劃書
  自行選了文字描述卻實作另一種。詳見 `review.md`〈需人工裁決 A〉。
- **驗證過的回溯發獎路徑(P0-2 的技術根據,實作時務必保留這條記錄)**:
  既有無推薦人會員被 lazy 綁定後,只要載入一次 profile
  (`index.ts:362` 無條件對 `registrationStep === 3` 呼叫
  `repairOrphanedPaymentsBestEffort`),`repair_orphaned_payments` 的候選
  條件(`20260716000006:377-382`)就會把其**歷史 subscription** 全部抓成
  候選並補發 gen1 給預設推薦人。
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
