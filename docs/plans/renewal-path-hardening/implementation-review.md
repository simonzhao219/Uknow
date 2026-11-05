# 續約路徑潛伏組（renewal-path-hardening）實作審查

<!-- plans-keep: 第 5 波 S6 實作審查鷹架；退場條件＝/tdd-implement 收尾刪除（結論摘要貼進 PR #514） -->

審查對象：`feature/renewal-path-hardening` 相對 `origin/develop` 的實作 diff（至 fcc7f5e1）。
四視角平行審查（system／architecture／uiux／requirements），本檔只彙整、不改判。

## 結論

**P0：0**。P1 與 P2 的處置如下；「需人工裁決」的項目沒有降級，原級保留並列在最後一節。

## P1

| # | 來源視角 | 發現 | 處置 |
|---|---|---|---|
| 1 | uiux | `REFERRAL_CYCLE` 標在碼欄位後，離開欄位會觸發 onBlur 重驗；validate 回「有效」就把環的原因洗掉 | **已修**：錯誤訊息還在（碼沒改過）時 onBlur 不重驗；補元件測試〈REFERRAL_CYCLE 標記後離開碼欄位不重驗…〉（先紅後綠） |
| 2 | uiux／requirements／architecture | W5-54 失敗路徑缺：localStorage 分支背景 `/profile` 讀不到時，只放行付款，沒有「暫時無法確認會員狀態」＋重試 | **已修**：抽出 `confirmServerProfile`，失敗顯示 `LoadErrorCallout`（「仍可直接付款，送出時會再確認一次。」）＋只重發 `/profile` 的重試（`useRetryFocus` 管焦點）；補元件測試〈背景確認失敗時顯示暫時無法確認＋重試…〉 |
| 3 | requirements | R7 只測了新約換線的 changed_at；首購綁預設推薦人（3a-bis）同樣改了，沒有測試 | **已修**：`default-referrer.test.ts` 補〈首購綁預設推薦人 → changed_at 記付款時點、刪掉 gen1 後自癒補回〉；本機 PG16 以同情境 SQL 驗綠 |
| 4 | requirements／architecture | journey f70 與 plan §5 的章節有落差：3b／6b 命名；新約後三代獎金、任務、自領停發未逐項斷言；ch7 credit 補充、ch9 墨黑鈕斷言缺 | **未修，記偏離**：這些行為已由 Deno 整合測試（referral-cycle、renewal-referrer-intent、referral-pair-history）與 mocked e2e 覆蓋；journey 補章留待第 6 波（見 PR「偏離規劃說明」） |
| 5 | system | migration B 的回填寫成具名函式 `backfill_referral_pair_history()`（plan 寫的是一次性 SQL），且多了 `exists` 過濾（排除已刪帳號）；plan 沒寫 | **記偏離**：具名函式是為了冪等與可測（測試直接呼叫兩次）；`exists` 過濾避免外鍵失敗。行為與 plan 預覽查詢（q5）一致 |

## P2

| # | 來源視角 | 發現 | 處置 |
|---|---|---|---|
| 1 | system | prepare 在「預設推薦人成環改記 keep」時寫告警，沒有包在獨立子交易 | 不修：`log_system_alert` 本身吞例外；記偏離 |
| 2 | requirements | 規格書 §8.2 沒寫新約後三代獎金由新推薦人起算 | 已在 §6.2 換線段寫明；§8.2 留給審查 session 判斷是否要再補一句 |
| 3 | uiux | 409 之後付款鈕應維持停用 | 已滿足：有單號 → 導結果頁；無單號 → `paidPendingNoTrade` 停用付款鈕 |
| 4 | architecture | 契約裡 `lastTradeNo` 是 optional | 刻意：缺單號是後端契約錯誤，前端走客服退路（有元件測試）；記偏離 |
| 5 | system | `GET /profile` 的 heal 會取換線 advisory lock | 不修：heal 只在旗標為真時跑，量極少；記偏離 |

## 需人工裁決（原級保留，未降級）

| # | 來源視角 | 級別 | 發現 |
|---|---|---|---|
| 1 | system | P2 | `king_round_base` 寫入失敗會讓整筆付款交易（含 `ledger_reset`）回滾——要不要包成子交易、失敗只告警 |
| 2 | requirements | P2 | `/subscriptions/status` 的 `freshDefaultReferrerAvailable` 不看環；預設推薦人在自己推薦樹內時，確認框寫「將改變」，付款時實際記 keep |
