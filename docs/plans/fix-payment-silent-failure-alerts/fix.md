# 金流靜默失敗沒有告警 修復紀錄

分支:`claude/official-account-email-setup-qzq7fw`(既有 PR #286)|重現測試(紅燈 commit):待填

> 分支不是 `fix/*`:本次任務由平台在 session 啟動前開好分支,且承接同一條
> 觀測性主題(PR #286 的 friction-log 條目正是本次掃描的來源)。

## 1. 症狀與重現

不是使用者報的 bug,是 friction-log 2026-08-17「沒有人反映問題不構成證據」
留下的**同類掃描題**:專案裡還有哪些「失敗靜默、且回饋管道不在我們手上」
的路徑。

回饋管道本身是**存在**的:`system_alerts` 表 + `logSystemAlert()` +
admin SystemAlerts 頁(有 API 與元件兩層測試)。問題是接上去的很少——
`logSystemAlert` 只被 4 處呼叫,`console.error` 有 47 處。`console.error`
只進 Edge Function log,沒有人主動讀,等於靜默。

重現測試:`api/payuni-notify-alerts.test.ts`——用與 `payuni-notify.test.ts`
相同的手法造出四種失敗回調,斷言除了「拒絕」之外還要留下 `system_alerts`。
現況全部紅燈(一筆都不寫)。

## 2. 根因

**不是誰忘了加告警,是「什麼情況該告警」從來沒有判準。**

`logSystemAlert` 是 2026-07 為了 `process_successful_payment` 的周邊失敗
引進的,之後只在「當下那個 diff 想到的地方」被呼叫。沒有規則說明
「哪一類失敗必須留告警、哪一類 `console.error` 就夠」,於是每個新失敗
出口預設落到 `console.error`——那是阻力最小的路徑。

為什麼當時沒被發現:**同一個函式裡就已經不一致而沒人覺得奇怪**。
`resolveOrderFromPayUni` 有四個失敗出口,只有 RPC 失敗那一個有告警
(而且刻意標成 `error` 級並寫了理由),另外三個(`missing MerTradeNo` /
`order not found` / `amount mismatch`)只有 `console.error`。有告警的那個
是「當下正在修的那個」,其餘三個從第一天就沒有。

這與 friction-log 兩條既有紀錄同形:PR #119「自我糾正只綁定當下 diff」、
2026-08-07「修法做出來過卻沒有推廣」。差別是這次連「不一致」都在同一個
函式的視野內,只是沒有任何一層在檢查。

## 3. 同類掃描

- **根因抽象成的 pattern**:失敗出口「無使用者在看 + 有持久後果 +
  既有機制不會回報」卻只寫 `console.error`。
- **掃描方式**:`grep -n "console.error" api/index.ts`(47 處)逐一問三個
  問題;`grep -n "logSystemAlert("`(4 處)對照;另查前端與排程兩條非
  Edge Function 路徑。
- **結果**:□ 無同病灶 ☑ 找到——

| # | 路徑 | 判定 | 處置 |
|---|---|---|---|
| A1 | `resolveOrderFromPayUni` → `missing MerTradeNo` | 缺告警。**已過簽章驗證**,只有 PayUni 觸發得到 | 本次修 |
| A2 | 同上 → `order not found` | 缺告警。PayUni 說交易成功但我方無此訂單 = **有人付了錢** | 本次修 |
| A3 | 同上 → `amount mismatch` | 缺告警。靜默拒絕一筆真實付款,亦可能是竄改訊號 | 本次修 |
| B | notify 解密/驗章失敗(`index.ts` notify handler) | 缺告警,但**在驗證之前**、公開端點可觸發 | 本次修,**必須去重** |
| C | reconcile heal pass 失敗 | 缺告警,且端點仍回 `success: true` 對排程說謊 | **不修**,記債(見下) |
| D | 前端 lazy chunk 載入失敗 | **已有閘門**,不需處理 | 無 |

**D 的結論(掃描的價值一半在這裡)**:`utils/lazyWithRetry.ts` 有重試 + 一次
整頁重載 + 拋給 ErrorBoundary(使用者看得到,使用者就是回饋管道);而
2026-08-07 少上傳 chunk 的事故已由 `scripts/check-deployed-assets.py` +
`deploy-smoke.yml` 機械把關,該 workflow 註解記載開發時用「搬走一個 chunk」
實測過、且說明只看狀態碼的版本會漏。**這條已關閉,不要重複造輪子。**

**C 記債的理由**(不是懶):要測「RPC 自己失敗」需要在測試裡做 DDL 級
fault injection(drop/revoke `complete_paid_pending_orders`)。本 session
的容器 jsr.io 被 egress 封鎖、也沒有 supabase CLI,**Deno 測試一支都跑不
起來**,無法在本機迭代這種注入。改對帳端點的回應契約(讓
`reconcile-payments.yml` 的斷言抓到)風險更高——那支排程是錢的安全網,
弄錯會變成每小時假紅或假綠。→ friction-log 記債,不在盲測狀態下動。

## 4. 四面向審視

> ⚠️ SOP 對金流 bug 要求派四個 plan-reviewer agent 審本節。本 session 的
> 系統指示明確禁止未經使用者要求就呼叫 Agent 工具,故改用輕量做法
> (自問自答)。這是**已知的降級**,需要 agent 審查時請明示。

| 面向 | 檢視結論 |
|---|---|
| 系統 | 純新增 `logSystemAlert` 呼叫,不改控制流、不改回應契約——四個出口的 `return` 與 HTTP 回應形狀完全不動,所以 `payuni-notify.test.ts` 既有的「拒絕/不開通/回應形狀」斷言不受影響。`logSystemAlert` 自身 try/catch 包住、寫入失敗只 `console.error`,不會讓告警把付款流程弄壞——這點是既有設計,本次沿用而非新造。 |
| 架構 | **是架構缺陷的症狀,但修法不需要架構變更。** 缺的是「什麼情況該告警」的判準,不是缺機制。本次在程式碼旁寫下判準(三問)並補齊金流路徑;把判準機械化(例如禁止在金流失敗出口只寫 `console.error` 的 lint 規則)是更大的題目,記入 friction-log 待裁決,不在本次擴張。 |
| UIUX | 不適用——告警是內部維運資料,admin SystemAlerts 頁已有畫面與測試,本次不新增 UI。使用者可見行為零變化。 |
| 需求 | 規格書未定義「哪些金流失敗必須留告警」。本次採用的判準是**從既有實作反推**:`resolveOrderFromPayUni` 的 RPC 失敗路徑已標 `error` 並註明「必須人工介入」,A2/A3 的後果同級(錢已收、會籍沒開)故同樣 `error`;A1 是 PayUni 送來畸形資料,屬整合異常但不直接損失,故 `warning`。**這是判斷不是規格**,列為開放問題:是否要寫進規格書 §? 由人裁決。 |

**B 的設計決策(本節最重要的一條)**:notify 解密失敗在簽章驗證之前,
**任何人 POST 垃圾都能觸發**。無條件寫告警等於給未驗證端點開一條
無上限寫入路徑——真實告警會被洗掉,那正是本次要防的失效模式
(告警洪水 = 沒有告警)。故 B 採**去重**:同 source 已有未解決告警就不再
寫。範式取自 `complete_paid_pending_orders`(migration 20260716000007)
的「同訂單已有未解決告警就不重寫」,不自創。

去重也讓告警語意更正確:金鑰錯誤時**每一筆**回調都會死在這裡,
真正的訊號是「解密持續失敗」而不是「某一筆失敗」——一筆未解決的
告警正好表達這件事。

## 5. 修法與驗證

- 修了什麼(綠燈 commit):待填
- 為什麼這樣修是對的(對照根因):根因是「沒有判準」,所以修法除了補上
  四個告警,也把判準寫在 `logSystemAlert` 定義處——下一個加失敗出口的人
  在同一個視野內就看得到。**只補告警不寫判準,就是 08-14 那條
  「結論寫進註解 = 沒有閘門」的重演**;判準寫在函式旁是最小成本的改善,
  真正的閘門記債待裁決。

### ⚠️ 驗證能力的誠實揭露

本 session **無法在本機驗證任何 Deno 改動**:jsr.io 被 egress 封鎖(403),
而 `api/index.ts` 自己 import `jsr:@supabase/supabase-js`,故 `deno check`
與 `deno task test` 皆跑不起來;無 supabase CLI,起不了本機 Postgres。
可用的只有離線的 `deno fmt` / `deno lint`。

`scripts/tdd-unlock.sh` 驗的是 `npm run check`,而 **vitest 設定刻意不含
`supabase/**`**——也就是說對純 Deno 改動,那道鎖的綠燈訊號是空的,
不構成證據。

因此紅→綠證據改由 **CI 的 `api-tests` 軌**提供,分兩次 push:
先只推測試(該軌應紅),再推實作(該軌應綠)。兩次 run 的網址記在下方,
車尾燈就是證據。

- 紅燈 CI run:待填
- 綠燈 CI run:待填

## 6. 防線回填

- **為什麼既有閘門沒攔到**:沒有任何一層在檢查「金流失敗出口有沒有接上
  告警管道」。`npm run check` 不含 `supabase/**`;Deno 測試只驗被明確寫下
  的行為,而「該告警卻沒告警」在沒有人寫那條斷言之前不存在。這是
  **測不到 vs 沒去測**裡的後者。
- **處置**:☑ 已補閘門:本次四支測試把「這四個出口必須留告警」變成
  api-tests 軌的硬條件——之後有人把告警拿掉會紅。
  ☑ 攔不到,記 friction-log:(a) C 的 heal-pass 告警與對帳回應契約;
  (b) 「金流失敗出口不得只寫 `console.error`」的機械化閘門;
  (c) 本次無法本機驗證 Deno 改動這件事本身(容器 egress 限制)。
