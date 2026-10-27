# PayUni 查詢層非 SUCCESS 被當成「處理中」、滿 4 天靜默標 expired 修復紀錄

<!-- 由 /fix-bug 完整版從本模板實例化到 docs/plans/fix-<slug>/fix.md -->

分支:`fix/payuni-query-alert`|重現測試(紅燈 commit):見 PR(`test(red)` commit)|issue #395

## 1. 症狀與重現

- `queryPayUniTradeStatus` 對 PayUni 查詢回應只要 `Status !== 'SUCCESS' || !EncryptInfo` 就回
  `{ stillProcessing: true }`——與「查詢成功、交易未付款」完全同形。`reconcilePendingOrders` 對
  `stillProcessing` 滿 `expireAfterDays`(4)天就標 `expired`,兩者都不寫 `system_alerts`。
- 若查詢 payload 欄位名不對(從未在 sandbox 驗過),每輪都拿到錯誤回應,webhook 漏接的已付款卡單 4 天後
  被靜默標 expired;端點照樣回 `success: true`,排程的形狀斷言照樣過。
- 重現測試:
  - `supabase/functions/api/payuni-query-alert.unit.test.ts`——查詢層非 SUCCESS / 缺 EncryptInfo 時回傳必須帶
    `queryFailure`(PayUni 的 Status、Message);交易未付款時不帶。
  - `supabase/functions/api/reconcile-expire.test.ts` 後三支——查詢層失敗要依 PayUni Status 去重告警;
    標 expired 前要依訂單留紀錄(查詢層失敗 → warning,確認未付款 → info);轉移條件不變。

## 2. 根因

- 機制:`QueryResult` 型別只有兩態(`stillProcessing` / `data`),**沒有位置放「這輪根本沒問到」**。
  查詢函式只能把「沒問到」折進「還在處理」,下游迴圈因此無從區分,也就無從告警——資訊在型別邊界就丟了。
- 為什麼當時沒被發現:迴圈抽成可注入 `queryFn` 是為了測試,測試注入的永遠是乾淨的
  `{ stillProcessing: true }`,從沒有「查詢層出錯」這個形狀的測試輸入;`reconcile-payments.yml` 的三道防線
  (`curl -f`、回應形狀斷言、失敗開 issue)全看端點層,查詢層錯誤在端點眼中是正常計數。
- 同一個「錯誤長得像正常」形狀,friction-log 2026-10-25 check-email 條目已記過一次。

## 3. 同類掃描

- 根因抽象成的 pattern:外部服務的「查詢失敗」被映射成業務上的中性/正常狀態,且該映射之後會觸發持久的狀態轉移。
- 掃描方式:`grep -n "Status !== 'SUCCESS'\|Status === 'SUCCESS'\|stillProcessing" supabase/functions/api/index.ts`;
  逐一看 PayUni 回應的消費點(notify webhook、return 導回、result 自癒、reconcile)。
- 結果:
  - notify(`Status !== 'SUCCESS'` 分支)已有 `logSystemAlertOnce`(payuni-notify-alerts.test.ts 釘住)——非同病灶。
  - return 導回把非 SUCCESS 映射成 `FAILED` 只用於前端顯示,不轉移訂單狀態——非同病灶。
  - reconcile 迴圈 `resolveFn` 回 `ok:false` 時用無去重的 `logSystemAlert`,同一張卡單每輪重寫一筆——
    不是靜默,是洗版風險;不在本 issue 範圍且動它要另判去重鍵,記債(friction-log 本 PR 條目)。
  - 查詢層「查無此單」與「參數錯」無法分辨的根本解是 sandbox 實打確認錯誤碼(issue 償還方向 3),
    需要 sandbox 憑證與人工,本 PR 不做;告警帶回 PayUni 原文 Status/Message 就是為了讓人能分辨。

## 4. 四面向審視

| 面向 | 檢視結論(一句話;「不適用」也要寫) |
|---|---|
| 系統 | `QueryResult` 只**加**可選欄位 `queryFailure`,既有消費者(含測試注入的 `{ stillProcessing: true }`)不受影響;訂單狀態轉移條件一字不改;端點回應形狀不變,`reconcile-payments.yml` 斷言不受影響。 |
| 架構 | 點狀:告警決策放在已注入 client 的迴圈裡(可測),查詢函式只負責把資訊帶出來,不碰資料庫。非架構缺陷。 |
| UIUX | 不適用(server-to-server 排程,無使用者介面;告警出現在既有 admin 系統告警頁)。 |
| 需求 | 「查詢層失敗下要不要照樣標 expired」規格未定義;本 PR 依指示**不改**轉移條件,只告警——是否改成「查詢層失敗不標 expired」列為開放問題交主 session/業主。 |

## 5. 修法與驗證

- 修了什麼(綠燈 commit):見 PR。
  - `queryPayUniTradeStatus`:查詢層非 SUCCESS / 缺 EncryptInfo 時回 `{ stillProcessing: true, queryFailure: { status, message } }`。
  - `reconcilePendingOrders`:`queryFailure` 存在 → `logSystemAlertOnce('payuni-query', { reason, payuniStatus })`(去重鍵用錯誤碼,
    不用訂單號——這是系統層訊號,50 筆卡單撞同一個參數錯只該留一筆;個別訂單的後果由下一條按訂單號記)。
    標 expired 前 → `logSystemAlertOnce('reconcile-pending-payments', { reason, tradeNo })`,查詢層失敗為 warning、確認未付款為 info。
  - 告警 context 只含 tradeNo、PayUni 回的 Status/Message;不含 user_id、金額、金鑰。
- 為什麼這樣修是對的:根因是型別邊界丟資訊——把「沒問到」帶過邊界,下游才有能力分辨並告警。

## 6. 防線回填

- 為什麼既有閘門沒攔到:注入式測試只餵過乾淨輸入;排程防線只看端點層。
- 處置:□ 已補閘門:查詢層失敗形狀已有單元測試與整合測試釘住(本 PR)。
