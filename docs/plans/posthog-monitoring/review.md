# PostHog 監控與錄影 規劃書審查報告

<!-- plans-keep: 與 plan.md 同為鷹架，隨 /tdd-implement 收尾刪除 -->

四個 reviewer 原判彙整；未改判、未降級。SDK 選項行為（node_modules 尚無 posthog-js）以 reviewer 所知判斷，凡涉 SDK 行為者標〔需人工裁決〕，實作第一步須安裝後對 `.d.ts`／原始碼驗證。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1 | 5 | 3 | DB／RLS、金流冪等、`_headers` 事實、CF_PAGES_BRANCH 慣例、canonical redirect |
| 架構 | 0 | 3 | 4 | 模組邊界、_headers／CSP 處理、階段順序、回滾 |
| UI/UX | 0 | 3 | 2 | BottomNav、三態、互動模式 |
| 需求 | 0 | 4 | 2 | W4-35～37 逐項對應無漏項、與規格書無衝突、無未標示的腦補 |

## 發現清單(依嚴重度排序)

### P0

1. [P0]〔系統／§2 before_send、§1 驗收 1〕只清事件屬性的 URL；錄影快照（rrweb Meta 事件 `href`、FullSnapshot 的 `href`／`src`／`data-*`／`aria-label`／`title`）與 `$session_entry_url`、`$initial_*`、`$referring_domain`、`utm_*`／`gclid`／`fbclid` 仍帶完整 URL → `/register?invite=…`、付款結果 token 外洩。建議：`before_send` 走遍所有 URL 欄位、改寫 `$snapshot` 的 Meta href 與 DOM 屬性 URL；評估 `mask_personal_data_properties`、`property_denylist`、`maskAttributeFn`；階段 1 測試覆蓋。〔需人工裁決〕`before_send` 是否對 `$snapshot` 生效須以真實 SDK 驗證，不可只靠 mock。

### P1

2. [P1]〔系統＋架構／§2 Admin 與付款頁、階段 2〕錄影閘門只處理路由「變更」，未處理直接落地（PayUni 回跳 `/payment/result` 為最常見入口）；SPA 導入時 stop 晚於 DOM 掛載。建議：init 時 `disable_session_recording: true`，載入後依 `recordingAllowed(location.pathname)` 決定 start；整頁 block 才是第一道防線（雙保險主從寫反了）；階段 2 補「直接落地於 `/payment/*`、`/admin*` 不啟動錄影」測試。
3. [P1]〔系統／§2 身分重置〕`posthog.reset()` 預設保留 `$device_id`，換帳號後仍可串聯。建議 `reset(true)`；並確認 `clearAccountState`（App.tsx:156）不會在每次啟動都被呼叫。〔需人工裁決〕是否保留跨登出裝置連續性。
4. [P1]〔系統／§2、§7〕PostHog 專案端設定（console log、network payload、canvas 錄製）可能蓋過本地設定，`console.error` 可能夾帶輸入。建議 Q5 驗證清單加「後台關閉 console logs／network payload／canvas」，本地明確關閉相關選項。
5. [P1]〔系統＋需求／§2 capture_exceptions、Q4〕例外訊息／stack 可能含 email、手機、API 回應；截斷擋不住短 PII；且規劃已先設為 `true` 等於未裁決先做。建議：改白名單（只留 error type 與檔案行號）或預設關閉，Q4 裁決前不送訊息本文；`$exception` 規則納入階段 1 測試。
6. [P1]〔系統／§3 Bundle〕「SDK 與 recorder 各自成 chunk」「500–700 kB raw」為未驗證假設；標準 posthog-js 的 recorder 由 `eu-assets.i.posthog.com` 以 script 載入，不在我們的 bundle（亦代表有不受 lockfile 控制的第三方 JS 能讀整個 DOM）。建議階段 3 以實測為準再決定是否調 `totalRawKB`；確認 `ui_host`（EU `https://eu.posthog.com`）。〔需人工裁決〕
7. [P1]〔架構／§3 Bundle 預算〕「S4 不調 `entryGzipKB`」與「entry ≤0.6 kB」互相矛盾：現上限 312、develop 曾貼 310.0，無餘量計算；S7 若先合並調高 3 kB，S4 等於偷吃其專用額度。建議階段 3 第一步量 develop 實測值，二擇一明文處理（S4 單獨加 0.6～1.0 並附理由，或 S7 之後 rebase 用其餘量）；「後合者 rebase」只解文字衝突。
8. [P1]〔架構／§2 門檻、階段 1〕`CF_PAGES_BRANCH` 只存在於建置期，瀏覽器端沒有。建議「CF 才啟用」判斷放 `config/posthogTarget.ts` 的 `resolvePosthogTarget`（建置期，可測），僅符合條件才注入 `VITE_POSTHOG_KEY`；執行期 `analyticsEnabled` 只判 key 有值、非佔位、未 `VITE_ANALYTICS=off`；補「佔位 key → disabled」測試。
9. [P1]〔需求／§1 驗收 2、Q5〕驗收情境只斷言選項字面值，「個資真的沒進 PostHog」靠人工。建議把「develop 上線後驗證清單（逐欄位）」列為驗收情境 6，並寫明未通過不得晉升 main。
10. [P1]〔需求／§1 驗收 3〕PostHog 預設自動帶 IP、地理、UA、referrer；「只送匿名 id」與 IP 是否可接受未裁決。建議 `ip: false` 或 `before_send` 去除，加進階段 1 選項斷言。〔需人工裁決〕
11. [P1]〔需求／Q2、§1 驗收 2〕admin 不錄偏離 W4-36「全錄」，是新增範圍決定；規格書 §10.4 顯示 admin 提領頁含未遮罩身分證與帳號。建議 Q2 明標「偏離 W4-36」，`/admin*`、`/payment/*` 閘門寫進驗收情境 2。
12. [P1]〔UIUX／§4 PrivateField〕「包一層 div、不改版面」不成立：block 元素會影響 flex／grid 子項、`space-y-*`、`:first-child`、sticky。建議預設 `display: contents` 或把 class 併進既有容器不新增節點；整頁 block 直接加在既有根容器；階段 4 每個套用點驗證版面不變。
13. [P1]〔UIUX／§4、階段 4〕a11y 與測試選擇器：`display: contents` 可能丟語意；不得切斷 label／input／錯誤訊息關係；Radix Dialog（ClaimRewardDialog／CollectionVerifyDialog）內容在 portal，外層 wrapper 涵蓋不到。建議規定「只包欄位群組、不得包 Dialog 根節點」，dialog 欄位實測；既有表單測試全綠且不改選擇器；`PrivateField` 轉傳 `data-testid`／`className`。
14. [P1]〔UIUX／§2 效能、§7〕行動版（LINE WebView／低階 Android）只靠 idle 載入帶過，缺判準：未列觀察指標（INP、長任務、JS 錯誤率）與放量門檻；`localStorage` 被禁用時行為；抽樣開關（如 `VITE_ANALYTICS_SAMPLE`）未預備。〔需人工裁決〕`isInAppBrowser` 是否降級錄影。

### P2

15. [P2]〔系統〕journey 若在 CI／預覽建置，可能載入 PostHog；建議 `VITE_SUPABASE_PROJECT_ID` 有值時也 disabled。
16. [P2]〔系統〕手動 `$pageview` 與 SDK idle 載入的順序：首屏 pageview 被 no-op；建議 facade 緩存最後 pathname，就緒後補送。
17. [P2]〔系統＋UIUX＋架構〕catch-all `blockSelector` 依賴 `autocomplete`／`type`，現有欄位未必標註；清單測試（regex 掃原始碼）只是 best-effort。建議把「新欄位須設對 autocomplete／type」寫成主規則進 ui-ux-guidelines，並補掃「id 命中敏感詞卻缺屬性」的測試。
18. [P2]〔架構〕`check-bundle-budget.mjs` 以 `/^index-.*\.js$/` 找 entry；新增動態 chunk 後須確認 `index-*.js` 仍只有一個。
19. [P2]〔架構〕`usePageview` 無測試落點；建議 jsdom `MemoryRouter` hook 測試，或明寫由階段 2 涵蓋。
20. [P2]〔需求〕規格書新增小節時註明 localStorage 存的是 PostHog 匿名 id，與 §10.4「不寫 localStorage」取捨為不同 key。
21. [P2]〔需求〕Q6（不放 cookie 提示）可併入階段 5 紀錄，不必佔開放問題。
22. [P2]〔需求〕驗收 3 可在 facade 測試加斷言：所有 capture payload 序列化後不含測試用 email／姓名字串。

## 需人工裁決

- 發現 1／5：`before_send` 是否涵蓋 `$snapshot`、如何清 Meta href 與 DOM 屬性（須真實 SDK 驗證）；例外訊息走白名單／截斷／關閉。
- 發現 3：`reset(true)` 與否。
- 發現 6：recorder 載入方式與 `totalRawKB`（階段 3 實測為準）。
- 發現 10：IP／地理是否算個資、是否關閉。
- 發現 11：admin 不錄（偏離 W4-36）。
- 發現 14：LINE／in-app browser 是否降級或不錄。
- S7 交集（架構）：換篇若改 URL／`navigate`，`usePageview` 每滑一次記一筆 pageview；需 S7 確認換篇是否 `history replace`，S4 再定是否收這類事件（S7 規劃檔不在本分支，未能自行核對）。

## 處置(人審後填寫)

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
