# 金流收尾（payment-closeout）實作審查報告

<!-- plans-keep: 第 7 波 S4 施工鷹架；退場條件＝/tdd-implement 收尾、PR 合併前刪除（摘要貼進 PR 內文） -->

輸出契約與聚合規則見 `docs/_templates/review.md`。審查對象：`feature/payment-closeout` 相對 `origin/develop` 的實作 diff（階段 1～6 綠燈後）。只彙整、去重、排序，不改判。

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 0 | 2 | 與基準逐行比對只有檔頭宣稱的差異；nested exception 的 sqlstate／sqlerrm 作用域；去重；自動標處理位置；U6R02；revoke；drop 安全 |
| 架構 | 0 | 1 | 4 | 檔頭慣例、模組邊界、測試命名（T4）、README 慣例、entry 不動；test-helpers 依賴 paid-pending-heal.ts 合宜 |
| UI/UX | 0 | 1 | 4 | 四則文案前 60 字實算 55～58 字、後果完整、無禁詞與 uid／sqlerrm；後台文案無標點殘留 |
| 需求 | 0 | 0 | 3 | 驗收 1～8 皆有實作與測試承載；無範圍蔓延；規格書與實作一致 |

**偏離 plan（四視角必答）**：progress.md 已記兩條（階段 3 不寫「select 就擲錯」注入測試、階段 4 不寫 Edge guard 單元測試），四視角皆核為成立。架構另提一條未記錄的覆蓋缺口（下列 2）。

## 發現清單

**P1**

1. 〔README〈補綁預設推薦人〉第 3 步〕（UI/UX）`set_config(..., false)` 是 session 層級：分開執行會讓時點沒生效（#167 閘門不放行、補綁了卻補不到獎金），同連線則殘留污染之後的推薦人變更；第 2 步要確認停權卻沒給查詢 → 改 `begin; set_config(..., true); update; commit;` 並註明同一交易；補 `validate_referral_code` 與自我推薦檢查。
2. 〔progress.md 偏離清單 vs plan §5 階段 2〕（架構）「查無單號」分支只有 3b 有斷言，3d 與 open_failed 沒有；open_failed 的查無單號只有結構保證未記 → 補 3d 測試，或記進偏離清單。

**P2**

3. （系統）open_failed 只在 heal 本輪開通成功時自動標處理；改由 notify／return 完成的單 heal 回 skipped，告警掛著 → 補 skipped 分支 resolve，或由 README〈已付款未開通〉第 1 步兜底。〔需人工裁決〕
4. （系統）並行兩輪 heal 同單同時失敗可能各寫一筆 open_failed（多推一則 LINE，不影響金流）→ 可接受。
5. （架構）`classify_alert_sqlstate` 與 `log_referral_reward_failure` 內聯分類並存 → 記一行「下次動它時改呼叫共用函式」。
6. （架構）repair 三支 WHERE 內 `p_user_id is null or …` 成死條件（plan 要求迴圈體不動）→ 下次動到時移除。
7. （架構）test-helpers 新依賴、index.ts guard 的說明（記錄性，非缺口）。
8. （UI/UX）〈已付款未開通〉第 3 步重跑會開通並發獎，要明寫重跑前回報。
9. （UI/UX）〈補計任務進度〉第 1 步漏查 `monthly_referrals`；「沒有列但業主不要求」的分支沒寫；第 3 步會寫推薦王 credit 卻沒標回報。
10. （UI/UX）〈補寫推薦連結〉第 3 步查詢的判讀方式不明。
11. （UI/UX）plan §4 字數差一（鷹架，隨刪檔清掉）。
12. （需求）3d／3a-bis 的重跑去重、open_failed 查無單號、40P01／40001 分類沒有斷言；「告警函式擲錯」只走 3b handler（三處結構對稱）。
13. （需求）progress.md「目前位置」過期（隨刪檔清掉）。
14. （需求）〔需人工裁決〕W7-12 要求 bundle 實測、PR 內文要有 drop gate 證據、3a-bis 範圍外說明、U6R02 對「改逐筆」的解讀——審查者看不到 PR 內文。

## 處置

- 1：已修（README 改單一交易＋`true`、加 `validate_referral_code` 與自我推薦檢查）。
- 2、12：補 `apply_referral_side_effects：3d 持續失敗重跑 → 只留一筆、無訂閱寫查無單號`（加入即綠，逃生口 1）；open_failed 查無單號、3a-bis 重跑去重、40P01／40001 分類、3d／3a-bis 的告警擲錯路徑記為接受的覆蓋缺口（三處結構對稱；PR 內文寫明）。
- 8、9、10：已修 README。
- 3：不改，由 README〈已付款未開通〉第 1 步「已 completed 只標處理」兜底（plan §2.4 的預期行為）；列 PR 內文供主 session 裁。
- 4、6、7、11、13：不改（記錄性／鷹架隨刪）。5：寫進 PR 內文「後續」。
- 14：bundle 實測 entry gzip 316.3／316.5 kB、總 JS raw 1983.1／1984 kB（`check-bundle-budget.mjs` 綠，改動是刪字）；其餘寫進 PR 內文。
