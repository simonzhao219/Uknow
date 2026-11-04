# PostHog EU 監控與錄影 規劃書（v2.1）

<!-- plans-keep: 跨 session 派工鷹架（第 5 波 S4）；退場條件＝/tdd-implement 收尾刪除；值得長留的遮罩原則升級進規格書與 ui-ux-guidelines -->

v2.1 變更：吸收 v2 審查（review.md）全部 P1／P2，已對 SDK 原始碼驗證；**v2.1 的修訂未再跑第三輪審查**（見 review.md「處置」）。v2 變更：納入業主裁決 W5-35／W5-36（主 session 2026-11-05 轉達）與 v1 審查 P0＋13 條 P1。SDK 選項名稱已對 `posthog-js@1.445.5` 的 `.d.ts` 核實（見 §2 附表）。

## 0. 一句話

讓維運能看到使用者操作錄影（W4-35 PostHog EU、W4-36 全錄），同時全遮罩、匿名、付款頁與後台不錄、任何 URL 都不帶 query／hash，不改條款；**PR 合進 develop 時 PostHog 必須是關閉狀態且不送任何請求**（W5-35）。

## 1. 使用者需求

- 依據：`docs/plans/launch-wave-4/plan.md` §0 W4-35～37；W5-35（key 先用佔位、預設關閉，晉升前由主 session 轉交兩個 project 的 key）；W5-36（①admin 不錄，記為對 W4-36 的偏離 ②錯誤追蹤先關 ③`ip:false`、不收 geo ④LINE in-app 全錄、保留抽樣開關 ⑤登出 `reset(true)`）。規格書無監控章節（階段 5 新增）。
- 驗收情境：
  1. **關閉態（本 PR 合併時的狀態）**：佔位 key → `analyticsEnabled` 為 false；不載入 SDK、不發任何網路請求、不寫任何 storage（測試釘住）。
  2. 啟用態（假 key 的整合測試，真實 SDK）：送出的**所有**請求 payload（含 `$snapshot` 錄影事件與 Meta 事件）不含 query／hash，URL 欄位全數清理（見 §2 清單）。
  3. 全文字與輸入遮罩；身分證／手機／生日／銀行欄位整塊 block；`/payment/*` 整頁 block 且**不啟動錄影**；`/admin*` **不啟動錄影**（偏離 W4-36，W5-36①）。直接落地於這些路徑同樣不錄。
  4. 事件與人員屬性不含 email、姓名；distinct id 為匿名 id；登出／換帳號／無效 session → `reset(true)`（連 `$device_id` 一併重置；SDK 尚未載入時以「待重置旗標」補上，見 §2.4）。IP／geo：**程式端只能附 `$geoip_disable` 作輔助；是否真的不收，以 PostHog 專案設定「Discard client IP data」為準**（驗收 6 逐項核對）。
  5. 不錄 network payload、不錄 console、不錄 canvas；exception／dead click／heatmap 一律在 client 端**明確設為 false**（不依賴專案設定）。
  6. **develop 上線後人工驗證清單**（附在 PR 內文）：未通過不得晉升 main。W5-39：不設自動退化門檻；**上線第一天由業主在 PostHog 抽看 5～10 支錄影，涵蓋註冊（`/register`、`/auth/complete-profile`）、付款（`/payment/*`，應完全沒有錄影）、提領（`/rewards` 提領流程）頁**，確認沒有個資（姓名、手機、生日、身分證、銀行帳號、email、邀請 token）再繼續放量；另核對 Q8 專案端設定已完成。
  7. 本機 dev、vitest、一般 e2e、journey 一律 disabled——由建置期 `resolvePosthogTarget` 單元測試（key 為 null）加關閉態零請求斷言涵蓋。
- 對 W4-36 的偏離：①admin 不錄（W5-36①，已獲准）；②「出錯必錄」本波不做——錯誤追蹤關閉，待日後啟用抽樣時一併設計。
- 不做：改條款／隱私文案；抽樣實際啟用（只預備開關）；後端錯誤追蹤；identify；A/B／flag／survey／heatmap／dead-click；完整 CSP（另案）。**錯誤追蹤本波關閉**（W5-36②）：`capture_exceptions` 不開，待日後有白名單設計再議。

## 2. 系統設計

### 2.1 載入與啟用
- `posthog-js` 釘精確版本，**動態 `import('posthog-js')`**，`window load` 後 `requestIdleCallback`（無則 `setTimeout`）才載入，包 try/catch，失敗靜默。
- 兩層門檻，職責分開：
  - **建置期** `config/posthogTarget.ts`：`resolvePosthogTarget({CF_PAGES_BRANCH, VITE_POSTHOG_KEY, VITE_ANALYTICS, explicitSupabaseProject})` → `{ key: string | null }`。優先序（測試釘住）：`VITE_ANALYTICS=off` → null；`explicitSupabaseProject`（外部明確指定 `VITE_SUPABASE_PROJECT_ID`＝journey，語意同 `supabaseTarget.ts` 的 `if (env.VITE_SUPABASE_PROJECT_ID) return null`，必須在 `vite.config.ts` 覆寫 env **之前**記下）→ null；沒有 `CF_PAGES_BRANCH` 且無測試覆寫 → null；`CF_PAGES_BRANCH` 為 `main` → 正式 key；其他分支 → develop key；key 為佔位值 → null。**覆寫僅接受 `phc_test_` 前綴的假 key**；任何其他值的 `VITE_POSTHOG_KEY`（例如誤設在 Pages 環境變數）在 CF 建置下一律忽略。`vite.config.ts` 只在 key 非 null 時注入。
  - **執行期** `analyticsEnabled()`：只判斷 `import.meta.env.VITE_POSTHOG_KEY` 有值且非佔位。**不做任何 `VITE_SUPABASE_PROJECT_ID` 判斷**（develop／預覽建置該值必有，執行期無法分辨 journey；改由建置期保證）。
- 此刻 `posthogTarget.ts` 兩個 key 皆為佔位 → 合併後全站關閉（W5-35）。晉升前由主 session 提供 key，我填入並更新「key 已設」測試。

### 2.2 初始化選項（`buildPosthogOptions()` 純函式，皆已對 `.d.ts` 核實存在）
`api_host: 'https://eu.i.posthog.com'`、`ui_host: 'https://eu.posthog.com'`、`person_profiles: 'identified_only'`（永不 identify）、`persistence: 'localStorage'`（localStorage 被禁用時 SDK 退回記憶體，測試覆蓋：不拋錯）、`autocapture: false`、`capture_pageview: false`（改手動）、`capture_pageleave: false`、**`capture_exceptions: false`、`capture_heatmaps: false`、`capture_dead_clicks: false`、`enable_recording_console_log: false`（頂層選項）、`session_recording.captureCanvas: {recordCanvas: false}`——全部明確寫 false，因 SDK 對 `undefined` 會採 PostHog 專案端遠端設定（原始碼已驗證），不得依賴專案設定關閉**、`disable_surveys: true`、`advanced_disable_feature_flags: true`（不需要 flags，少一支未經 `before_send` 的外送請求）、`disable_capture_url_hashes: true`、`capture_performance: false`、`mask_personal_data_properties: true`（遮 utm／click-id 等 URL 參數）、`disable_session_recording: true`（**init 時預設不錄，載入後依 `recordingAllowed(location.pathname)` 才 `startSessionRecording()`**）。
`session_recording: { maskAllInputs: true, maskTextSelector: '*', blockClass: 'ph-no-capture', blockSelector: <§4>, maskAttributeFn: <§2.3 白名單>, recordHeaders: false, recordBody: false, maskCapturedNetworkRequestFn: (r) => ({...r, name: stripUrl(r.name)}) }`。**注意**：`maskCapturedNetworkRequestFn` 在 SDK 內同時是 replay URL 遮罩鉤子（Meta、`$pageview`、`$url_changed` 用它），回 `null` 會丟掉 Meta 事件而弄壞 replay，故改為「剝 query 與 hash」而非 null；network 不錄靠 `recordHeaders/recordBody/capture_performance` 皆 false（原始碼已驗證 plugin 不啟動）。
- **IP／geo（W5-36③）**：`ip` 設定在 1.445 已標註「NOT USED ANYMORE」。`$geoip_disable` 是伺服端 ingestion 認的屬性，SDK 內無處理，`$snapshot` 與 flags 請求也不經過它，**只是輔助**。真正保證＝PostHog 專案端開「Discard client IP data」，列為上線檢查項（Q8／驗收 6），不得把「屬性存在」當成已達成 W5-36③。

### 2.3 URL 與 PII 防線（審查 P0）
- 純函式 `stripUrl(url)`：移除 query 與 hash（含相對 URL）。
- `before_send` 對事件 `properties` 清理（已驗證 `before_send` 對 `$snapshot` 事件有跑）：`$current_url`、`$pathname`、`$referrer`、`$referring_domain`、`$session_entry_url`、`$session_entry_pathname`、`$session_entry_referrer`、`$initial_current_url`、`$initial_pathname`、`$initial_referrer`、`$initial_referring_domain`，以及 `$set`／`$set_once` 內同名鍵；`$snapshot` 事件只處理**未壓縮**的 rrweb Meta（type 4）`data.href` 與 Custom 事件，改寫為 `stripUrl`（跳過壓縮字串，不深走整批，低階手機效能）。移除 `utm_*`／`gclid`／`fbclid`。
- **更正（v2 審查 N1）**：`compress_events` 預設為 true，FullSnapshot 的 `data` 與 Mutation 的 `adds/attributes/texts/removes` 在進 `before_send` 前已被 gzip 成字串，`before_send` **看不到 DOM 屬性**。DOM 屬性（如 `<a href="/register?invite=…">`）只剩 `maskAttributeFn` 一層。故 `maskAttributeFn` 採**白名單**：僅保留 `class`、`style`、`type`、`role`、`id`、`for`、`width`／`height`、SVG 幾何屬性等非內容屬性，其餘（`href`、`src`、`srcset`、`action`、`formaction`、`poster`、`data-*`、`content`、`xlink:href`、`title`、`aria-label`、`alt`、`placeholder`、`value`…）一律遮罩或 `stripUrl`。備選（Q9）：`maskAllElementAttributes:true`（fail-closed，但 replay 保真度大降且與 `maskAttributeFn` 互斥）、或 `compress_events:false` 讓 `before_send` 可見 DOM（頻寬與 CPU 成本上升）。
- **不可只靠 mock**：階段 2 以**真實 `posthog-js` 加假 key**，攔截 `fetch`／`sendBeacon`／XHR 送出的請求並解碼 payload（含壓縮的 snapshot），逐一斷言上述欄位；**DOM 屬性的斷言必須解壓 snapshot（`fflate` 已為 SDK 相依）後逐屬性檢查，不依賴 `before_send`**。實測結論（尤其白名單是否漏屬性）寫進 PR。
- 例外追蹤關閉，故不處理 `$exception` 內文。

### 2.4 身分與重置
- facade `resetAnalytics()` → `posthog.reset(true)`（`reset_device_id=true`）；未載入時**不 no-op**：記「待重置」旗標並同步移除 PostHog 的 localStorage 鍵（`ph_<key>_posthog`），SDK 載入完成後若旗標存在即立刻 `reset(true)`（避免「登出發生在 idle 載入前、之後沿用舊 distinct_id／device_id」）；仍不為此觸發 SDK 載入。放進 `clearAccountLocalState()`。經核對：`clearAccountState` 由 `onSignedOut`／`onAccountSwitched`（`App.tsx` 156 行起）與 `endInvalidSession` 呼叫，非每次啟動；階段 3 加測試釘住「訪客啟動不會呼叫」。

### 2.5 錄影閘門與 pageview
- `recordingAllowed(pathname)`：`/payment/*`、`/admin*` 為 false。**起點在判斷之後**：init 為 `disable_session_recording: true`；載入完成後依當下路徑決定 start；之後每次路由變更：進入禁錄路徑 → `stopSessionRecording()`、離開 → `startSessionRecording()`（**不傳參數**；傳 `true` 會繞過 `sampleRate`，禁止）。SPA 進入禁錄路徑時，rrweb MutationObserver 會先於 `useEffect` flush，故 stop 以 `useLayoutEffect`（或路由 render 前同步判斷）執行；仍不能完全排除進入瞬間的 DOM，所以**付款頁與 admin 根容器都要帶 `ph-no-capture`**（含 loading／錯誤態子狀態；`AdminConsole`、`/admin/verify` 根容器亦然，admin 提領頁有未遮罩身分證與帳號）。防線順序：①不錄 ②block ③全遮罩。
- pageview：`usePageview` hook 手動 `capture('$pageview', {$current_url: stripUrl(...)})`。facade 在 SDK 就緒前緩存最後 pathname，就緒後補送一次。**刻意設計**（主 session 裁定）：S7 刊登換篇走 `history replace`，每換一篇一筆 pageview＝一次刊登瀏覽，視為有用訊號，不排除。
- 啟動依賴遠端設定：錄影要 PostHog 專案端開 Session replay（`/array/<key>/config` 的 `sessionRecording`），recorder 腳本名稱可由遠端設定覆寫；離線測試須 mock 該設定並以其腳本名對映 route，且**若沒收到 recorder 請求則測試失敗**（避免空過）。
- 抽樣開關（W5-36④）：`VITE_ANALYTICS_SAMPLE`（0～1，預設 1＝全錄）→ `session_recording.sampleRate`；LINE in-app 不降級。

### 2.6 recorder 載入與供應鏈
`posthog-js@1.445.5` 實測：`module.js` 375 kB raw／121 kB gz；其錄影 recorder（`lazy-recorder.js` 221 kB raw／69 kB gz）預設由 PostHog 資產網域 `eu-assets.i.posthog.com` 於執行期載入，**不進我們 bundle**；`module.full.no-external.js` 自帶 recorder 但 792 kB raw／232 kB gz。決策（建議 A，列 Q7 待裁）：**A＝預設 `module.js`＋外部 recorder**（bundle 小；代價：一支不受 lockfile 控制的第三方 JS 能讀 DOM，此風險在 PostHog 本身即為資料接收方的前提下可接受）；B＝自帶 recorder（更可控、可離線整合測試，但多 232 kB gz 的懶載入 chunk）。**Q7 須在階段 2 開工前裁決，且業主需明確承認 A 的供應鏈風險。**無論 A／B，錄影整合測試都須能離線跑：測試用 Playwright route 把 `eu-assets` 的 recorder 請求以 `node_modules/posthog-js/dist/lazy-recorder.js` fulfill。

### 2.7 無資料庫與後端變更。

## 3. 架構影響

- 新增 `src/utils/analytics/{analyticsConfig.ts,analytics.ts}`、`config/posthogTarget.ts`；改 `src/main.tsx`（render 後排程；canonical redirect 分支不啟動）、`clearAccountLocalState.ts`、`App.tsx`（僅加 `usePageview`）、`vite.config.ts`、`package.json`。facade 不得 import `App`（appShell 守衛）；`posthog-js` 只允許動態 import（`appShell.test.ts` 加靜態守衛）。
- **Chunk 切分**：`buildPosthogOptions`、`sanitizeEvent`、`stripUrl` 與 `before_send`／`maskAttributeFn` 放進與 SDK 同一個動態 chunk；entry 只留 facade（排程、`recordingAllowed`、reset 旗標、pageview 緩存）。啟動排程抽成純函式 `scheduleAnalytics({isRedirecting, idle, load})` 以便測試「canonical redirect 不啟動」。
- **Bundle 預算（主 session 裁定）**：S4 另給 **entry ≤ +1.0 kB gzip**，與 S7 的 W5-30（+3 kB）**分開計算、不互相佔用**。階段 3 第一步量 develop 實測 entry gzip 與 `totalRawKB`，記入 PR。誰後合併，誰在 PR 內文寫明兩項合計值（現行 312 ＋ S7 增量 ＋ S4 增量）並同步調 `entryGzipKB`；合計超過 312+3+1 即停下回報。S4 調 `BUDGET` 時只加自己的 ≤1.0，並在 `check-bundle-budget.mjs` 該行註解寫出分項（「S4 +1.0」），rebase 後保留對方數字。
- `totalRawKB`（現 1600）：方案 A 的動態 chunk 約 375 kB raw，需實測是否超；超過則 S4 單獨上調並寫理由（動態 chunk 不影響首屏）。階段 3 驗證 build 後 `index-*.js` 仍只有 entry 一個。
- CSP：`public/_headers` 現只有 `frame-ancestors 'none'`，無須放行；檔內註解記下未來完整 CSP 需 `https://eu.i.posthog.com`（connect-src）、`https://eu-assets.i.posthog.com`（script-src）。`appShell.test.ts` 的 `_headers` 契約維持綠。

## 4. UI/UX

無可見變更。
- **`PrivateField` 規格（v2 審查：`display:contents` 的 wrapper 會讓父層 `space-y-*` 間距塌陷，且 jsdom 抓不到）**：**預設做法＝把 `ph-no-capture` 併進既有的欄位群組根容器**（如 CompleteProfile 各欄位的 `space-y-2` div），不增加任何節點、不影響 margin；`IdNumberInput` 把 class 加在**元件自己的根 div**，所有使用處自動受保護。`privateProps()` 回傳 `{className:'ph-no-capture'}` 供併入。`contents` wrapper 降為例外，僅限父層無 `space-*`／`gap`／`:first-child` 規則時使用，且只能包欄位群組（label＋input＋錯誤訊息整組同在內），不得包 Dialog 根節點、table、fieldset。整頁 block 直接加在既有根容器。
- **Portal 注意**：真正走 Radix portal 的 Dialog，外層 wrapper 涵蓋不到，敏感欄位須在 Dialog 內容**裡面**帶 class。`CollectionVerifyDialog` 實為 `fixed inset-0` 自製覆蓋層（非 portal）；階段 4 對各 dialog **逐一確認實作型態**再決定位置（`ClaimRewardDialog` 尚未確認）。
- catch-all `blockSelector`：`.ph-no-capture, input[type="tel"], input[type="password"], input[autocomplete^="bday"], input[autocomplete="tel"], input[autocomplete^="cc-"], [data-sensitive]`。因現有欄位 autocomplete 標註不一致，階段 4 順手補齊敏感欄位的 `autoComplete`，並先寫**目標屬性表**再動手：手機 `autoComplete="tel"`＋`inputMode="tel"`；生日維持 `type="date"` 不為 catch-all 改型別；**身分證字號（首碼為英文字母）不得設 `inputMode` 為 numeric／tel**；銀行帳號 `inputMode="numeric"`。並以「主規則：新欄位須設對 autocomplete／type 或包 PrivateField」寫入 ui-ux-guidelines；清單測試是 best-effort 退化防線，不是保證。
- 套用清單以階段 4 盤點為準（現況：CompleteProfile、reward/IdNumberInput、WithdrawalProcess、WithdrawalFundingFields、common/IdNumberVerification、IdVerificationSection、ClaimRewardDialog、CollectionVerifyDialog、PaymentCheckout、PaymentResult 根容器；admin 路徑整段不錄，故不需逐欄）。
- 套用後既有表單元件測試須全綠、**不改任何既有測試選擇器**；以 class 斷言「欄位群組根容器帶 `ph-no-capture`」取代「結構不變」斷言（jsdom 不做 layout）。
- 行動版：錄影成本觀察指標（INP、長任務、JS 錯誤率）與放量門檻見 §7。

## 5. 階段切分（每階段 = 一個紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 純函式與 key 目標：`analyticsConfig.ts`（`buildPosthogOptions`、`stripUrl`、`sanitizeEvent`、`recordingAllowed`）＋`config/posthogTarget.ts` | vitest node：`analyticsConfig.test.ts`、`posthogTarget.test.ts` | 選項斷言（mask／block／recordBody／autocapture／capture_exceptions 不存在／`disable_session_recording:true`／`mask_personal_data_properties`）；`stripUrl` 與 `sanitizeEvent` 走遍 §2.3 全部鍵；佔位 key／無 `CF_PAGES_BRANCH`／`VITE_ANALYTICS=off`／journey project id → disabled；main→正式、其他→develop；`/payment/*`、`/admin*` 不錄 |
| 2 | 懶載入 facade＋**真實 SDK 外送驗證**（落地方式：**主要用 vitest jsdom 載入真 `posthog-js`＋stub `fetch`／`sendBeacon`**，mock 遠端設定 `/array/<key>/config`，真跑 recorder 並解壓 snapshot 驗屬性；階段 2 第一步先驗證 rrweb 在 jsdom 可行，**不可行才**改為專用的第二個 dev server＋Playwright（獨立埠、fixture 帶 env、同步 `ci.yml`、`e2e/README.md`、`check-workflows.py` 命名、`check-e2e-mustkeep.py` 是否納入），一般 e2e 的共用 dev server 不帶 key，維持驗收 7） | vitest node（mock，快）＋vitest jsdom（真 SDK）＋必要時 e2e feature | 未啟動時 reset／pageview no-op 且不載入 SDK；載入失敗不拋；**關閉態零請求零 storage 寫入**；真 SDK：所有請求 payload（含 `$snapshot`、Meta href 仍存在且無 query、解壓後 DOM 屬性）不含 query／hash／邀請 token；**必須收到 recorder 請求，否則測試失敗**；直接落地 `/payment/result?token=x`、`/admin` 不啟動錄影；從 `/` 以 SPA 導入 `/admin`、`/payment/result` 時 payload 不含其 DOM；`$geoip_disable` 存在；payload 序列化後不含測試 email／姓名字串；pageview 在 SDK 晚就緒時補送 |
| 3 | 接線與預算：`main.tsx` idle 啟動、`usePageview`、`clearAccountLocalState` → `reset(true)`、`vite.config.ts`、`package.json` | vitest（`clearAccountLocalState.test.ts`：登出／換帳號／無效 session 皆 reset；訪客啟動不 reset；`usePageview` jsdom `MemoryRouter` 測試；`appShell.test.ts` 靜態守衛）＋`npm run build && node scripts/check-bundle-budget.mjs` | entry 增量 ≤ 1.0 kB（PR 附前後實測）；`index-*.js` 仍唯一；`totalRawKB` 實測並說明；knip 綠 |
| 4 | 敏感欄位 block：`PrivateField`、`privateProps`、catch-all、補 `autoComplete` | vitest jsdom：`PrivateField` 元件測試（含 contents、轉傳 props、不切斷 label 關係）；`sensitiveFields.ts` 清單測試（掃原始碼＋掃 id 命中敏感詞缺屬性者）；selector fixture；dialog 欄位實測；既有表單測試全綠 | 漏包任何一欄測試紅；付款兩頁根容器帶 block class；版面斷言（套用點前後 className／結構不變） |
| 5 | 文件與收尾：登記新環境變數與回滾手段（`VITE_ANALYTICS`、`VITE_ANALYTICS_SAMPLE`、`CF_PAGES_BRANCH` 的角色）；規格書新增「監控與隱私」小節（註明 localStorage 存的是 PostHog 匿名 id，與 §10.4 為不同 key；不放 cookie 提示）、ui-ux-guidelines（PrivateField 用法）、`_headers` 註解、develop 上線驗證清單進 PR | `check-spec-drift.py`、`npm run check:full`、`check-context-budget.py` | 全綠；規劃檔刪除、原則升級 |

## 6. 開放問題

- [x] ~~Q1 key~~ → W5-35：佔位＋預設關閉，晉升前填入。
- [x] ~~Q2 admin~~ → W5-36①：不錄。
- [x] ~~Q4 錯誤追蹤~~ → W5-36②：關閉。
- [x] ~~IP/geo、in-app、reset~~ → W5-36③④⑤。
- [x] **Q7 recorder 載入方式** → **W5-37：方案 A，從 PostHog 資產網域外部載入**；業主已明確接受供應鏈風險（第三方 JS 不受 lockfile 控制、可讀 DOM）。PR 內文〈需要業主知道的事〉記一行。
- [ ] **Q8 PostHog 專案端設定（業主建 project 時操作；PR 內文〈需要業主做的事〉列完整勾選清單）**：開「Discard client IP data」；開 Session replay；關閉 exception autocapture、dead clicks、console logs、network payload、canvas、surveys；遮罩設定留空（以 client 設定為準）。列入驗收 6。
- [x] **Q9 DOM 屬性遮罩** → **W5-38：`maskAttributeFn` 白名單**（§2.3）。
- [x] **Q10 放量退化門檻** → **W5-39：不設自動門檻**，以上線第一天人工抽看錄影為準（驗收 6）。
- [ ] **Q5′ 人工驗證**：develop 上線後由主 session／業主看第一批錄影，確認遮罩與 block；未通過不晉升 main。

## 7. 風險與回滾

- 最壞：個資或 token 進 PostHog（不可撤回）。對策：預設關閉合併＋URL 全欄位清理＋真 SDK 外送驗證＋三層遮罩＋路由不錄＋人工驗證關卡。
- 行動版效能（LINE WebView／低階 Android）：idle 載入；上線後觀察 INP、長任務、JS 錯誤率；放量門檻＝先看第一批錄影與指標無退化；`VITE_ANALYTICS_SAMPLE` 隨時可降。
- 預算：entry 獨立 +1.0 kB；超過停下回報。
- 回滾：`VITE_ANALYTICS=off`（Pages 環境變數重新部署）或 revert；動態載入不影響其他功能。
