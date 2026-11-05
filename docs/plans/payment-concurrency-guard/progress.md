# 金流與推薦的並行防線 實作進度

<!-- plans-keep: S2 施工期鷹架，draft PR 期間需在 CI 中存在；退場條件＝/tdd-implement 收尾以 chore(plans) commit 刪除整個目錄 -->

分支:`feature/payment-concurrency-guard`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)
第 5 波工項 S2;主 session `session_01MQovbBpvF5cMi5BqUrAH86`。紅綠燈 hash 以 PR 內文為準。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | C:唯一索引+repair 鎖 | ✅ 綠 | e905070(CI run 41899960223 紅 2 條)；並行測試修正 8f5173d | 7b98a21(CI run 41902489456 綠) |
| 2 | B:register 走 validate(後端) | ✅ 綠 | eaec081(CI run 41902489456 紅 4 條) | dbd9c52(CI run 41941807197 綠) |
| 3 | B:register 400／503 前端 | ✅ 綠 | 7ce5d4c(本機 vitest 紅 3 條) | bcb7fa7 |
| 4 | D:稍後註冊改登出、cancel-signup 退場 | ✅ 綠 | 6b29d0f(CI run 41941807197 D 紅 1 條；本機 vitest 紅 4 條) | b7f84de(CI run 41942455580 綠)；appShell 測試 64815b2(業主授權) |
| 5 | E:prepare 停權 403+prepare_payment_order(後端) | ✅ 綠 | c027e80(CI run 41942455580 紅 10 條) | b3b4e70(CI run 41943509156 綠) |
| 6 | E:結帳頁停權卡(前端) | ✅ 綠 | 5037fc1(本機 vitest 紅 5 條) | 448281b |
| 7 | A+W5-14:重複付款偵測、付款途中停權告警 | ✅ 綠(待 CI) | 922820b(CI run 41943509156 紅 5 條) | dda4a53 |
| 8 | 收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃 r2 已納入 W5-11～14 與審查 P1;等主 session 親審後由業主親打 `/tdd-implement payment-concurrency-guard`。
開工第一步:S3(#508)合併後 rebase origin/develop。§2.7 唯讀 SQL 11/04 23:00 兩邊皆 0 列。

## Blockers(逃生口紀錄)

- 環境：本機 `supabase start` 拉不到映像(Docker Hub 429、ECR／GHCR blob 被 proxy 擋)。D 層紅綠以 PR #510 的 api-tests 軌為證；
  SQL 另以本機 Postgres 16＋最小 Supabase shim 套全部 migration 驗(scratchpad 的 apply.sh)。
- 階段 1：〈兩個並行補發〉紅燈 commit 在 CI 上意外綠——postgres.js 查詢 lazy，第二條連線未真的並行(測試寫錯，非功能已存在)。
  解鎖後以 `test:` commit 8f5173d 修正(.execute())；修正前 DB 於本機重現 2 列、修正後 1 列。

- 階段 4(逃生口 2，待業主裁決)：`src/appShell.test.ts`〈apiClient 的 session 過期、取消註冊與 AuthPage 清理無效 session
  都會清提示〉逐檔掃 `components/CompleteProfile.tsx` 須含 `clearAuthHint()`。W5-12 後稍後註冊改走 `useFunnelLogout`
  (內含 clearAuthHint)，CompleteProfile 不再自己清。提議：清單中的 `components/CompleteProfile.tsx` 換成
  `hooks/useFunnelLogout.ts`(守的行為不變：註冊中途離開一定清提示)。規劃階段 4 漏列此測試。
  **授權**：業主 2026-11-05 08:25（台北）互動選項：「授權修改 (Recommended)」——由本 session 代刪 tdd-lock，只換該檔名；測試名「取消註冊」改「註冊中途登出」以符實。

- 階段 7：〈告警寫入失敗時付款仍完成開通〉〈prepare 已有未逾期 pending 單時仍建新單〉〈對帳延遲開通不判重複〉紅燈時即綠——
  前者因 log_system_alert 本身吞錯、後兩者是現況特徵，作為回歸防線保留(逃生口 1 的變體：不跳過階段，其餘 5 條真紅)。
- 階段 7 會改變 9 支既有測試裡「同一人 active 時再付一次 null 單」的錨點(改接續＋告警)；它們斷言的是獎金與任務，CI 全綠為準。

## 框架摩擦
