# 暫時性故障不登出（T1-B）實作審查報告

<!-- /review-implementation：四個 fresh-context reviewer 審 `origin/develop...HEAD` 的實作 diff（2026-11-01，HEAD 約 fc7f8ee9＋progress）。
     只彙整、去重、排序，不改判。reviewer 皆無 shell，改以讀工作樹現況對照 plan v2.1／progress.md。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 未記錄的偏離 | 無缺口面向 |
|---|---|---|---|---|---|
| 系統 | 0 | 0 | 3 | 無 | 後端 /profile 契約、金流冪等、無 migration、fetchProfile 在飛登記、競態、兩層確認、三入口 404、W4-22、漏斗頁、部署時序偏斜兩向安全 |
| 架構 | 0 | 2 | 3 | e2e 範圍、白名單未收緊 | 模組邊界與循環、注入慣例、測試命名分層 |
| UI/UX | 0 | 1 | 4 | 異常 callout 登出無防連點 | 三態、Button 用法、aria-disabled 外觀、行動版、a11y、結帳頁外框 |
| 需求 | 0 | 2 | 2 | e2e 範圍、progress 未揭露 | 裁決落地（W4-11～17、W4-22）、規格書內容、無範圍蔓延、已記錄偏離齊全 |

**無 P0。** P1 去重後 3 條。

## 發現清單

### P1

1. **〔§5 B6、§1.2 R1／R3／R4／R10／R11／R13〕e2e 範圍少於 plan，progress.md 未記錄**（需求＋架構）——缺 R1 的 logout 計次 0、R3 第二請求帶 `?retry=1`、
   R4 逾時、R11 結帳頁、R13 首頁、R10 不登出＋重整不循環 → 補 e2e，補不了的列降級與下層替代證據。
2. **〔§2.5 末段〕apiClient 已不直接呼叫 `clearAuthHint`，authHint 白名單未收緊**（架構）——`appShell.test.ts` 仍列 `utils/apiClient.ts` → 移除。
3. **〔§4.1〕AuthPage 帳號異常說明的「登出」沒有 aria-disabled＋ref 防連點**（UI/UX）——`useMemberLogout` 內有 100ms 等待，可連點重複 global 登出 → 補防連點。

### P2

- 系統：retry 入口的「在飛」防護有空窗（`getSession` 之前未設旗標，同時的 online＋visibilitychange 可各發一個 `?retry=1`）；`getSession()` reject 時
  INITIAL_SESSION(null) 不再收尾，守衛 spinner 可能不退場；`/auth/register` 讀回擲非 ProfileReadError 例外時仍 500（契約單向，已記錄）。
- 架構：`isRetryableSessionError`（hook）與 `isRetryableAuthError`（apiClient）重複；`useAuthBootstrap.ts` 約 535 行（plan 目標 500）；raw `apiRequest`
  呼叫端行為待確認（R15 已有一案）。
- UI/UX：`<main>` 缺 `scroll-mt-20`；`AuthDegradedFrame` 以 `setTimeout(0)`＋DOM 查詢判斷成功〔需人工裁決〕；CompleteProfile 送出鈕 aria-disabled 無灰化；
  AuthPage 驗證中載入畫面沒有 5 秒換字。
- 需求：R12／R14／R16 測試對應可追溯性；規格書 §14 #8 末句補寫「`/profile`（T1-B）已改 fail-closed」有違 document-writing 規則之虞；`AuthDegradedFrame`
  不在 plan 檔案表（B5 拆分）。

## 需人工裁決

1. W4-20、W4-21 由 Claude 代刪 `.claude/tdd-lock`（業主互動授權，progress 已記、列框架摩擦）——PR 偏離說明逐條列出（系統）。
2. `AuthDegradedFrame` 成功後焦點的時序判斷是否接受（UI/UX）。
3. AuthPage `getSession` 擲例外留 /login、與 `sessionStalled` 是否重疊；`refreshUser` 與在飛重試競態（架構）。

## 處置

見同目錄 progress.md「實作審查處置」。
