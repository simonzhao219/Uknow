# PostHog EU 監控與錄影 規劃書

<!-- plans-keep: 跨 session 派工鷹架（第 5 波 S4）；退場條件＝/tdd-implement 收尾刪除；值得長留的遮罩原則升級進規格書與 ui-ux-guidelines -->

## 0. 一句話

讓維運能看到使用者實際操作錄影與前端錯誤（W4-35 PostHog EU、W4-36 全錄），同時照 W4-37 全遮罩、匿名、付款頁不錄，不改條款。

## 1. 使用者需求

- 依據：`docs/plans/launch-wave-4/plan.md` §0 W4-35～37；規格書無監控章節（新增小節見階段 5）。
- 驗收情境：
  1. 正式站／develop 部署後，PostHog EU 各自的 project 看得到 pageview（僅路徑，不含 query／hash）與 session 錄影。
  2. 錄影中所有文字與輸入值被遮罩；身分證、手機、生日、銀行欄位整塊 block；付款頁（`/payment/*`）整頁 block。
  3. 事件與人員屬性不含 email、姓名；distinct id 為 PostHog 匿名 id，登出／換帳號即 reset。
  4. 不錄 network payload（headers／body 皆不收）。
  5. 本機 dev、vitest、e2e、journey 完全不載入也不連 PostHog。
- 不做：改條款／隱私告知文案（W4-37）；抽樣（W4-36 規模大了再做）；後端錯誤追蹤（沿用 Supabase 日誌）；identify 到會員 id；A/B、feature flag、survey；完整 CSP（另案）。

## 2. 系統設計

- SDK：`posthog-js`（釘精確版本，現行 1.445.x）。**動態 `import('posthog-js')`**，不進 entry；SDK 與 recorder 各自成 chunk，在 `window load` 後 `requestIdleCallback`（退回 setTimeout）才載入。
- 初始化選項（純函式 `buildPosthogOptions()`，可直接測）：
  - `api_host: 'https://eu.i.posthog.com'`、`person_profiles: 'identified_only'` 且**永不呼叫 identify** → 僅匿名事件。
  - `autocapture: false`（autocapture 會收元素文字）、`capture_pageview: false`，改由我們在路由變更時手動 `capture('$pageview')`，並用 `before_send` 把 `$current_url`／`$pathname`／`$referrer` 去掉 query 與 hash（`/register?invite=…`、付款結果頁 query 含 token／單號）。
  - `capture_exceptions: true`（錯誤追蹤）；`persistence: 'localStorage'`（不寫 cookie）。
  - `session_recording: { maskAllInputs: true, maskTextSelector: '*', blockClass: 'ph-no-capture', blockSelector: <見 §4 catch-all>, recordHeaders: false, recordBody: false, maskCapturedNetworkRequestFn: () => null }`；另 `capture_performance: false`。
- 門檻（`analyticsEnabled(env)`）：**只有 Cloudflare Pages 建置（`CF_PAGES_BRANCH` 有值）才啟用**——本機 build、vitest、e2e（全 mock 網路）、journey 的本機建置都是 disabled。key 取得仿 `config/supabaseTarget.ts`：新增 `config/posthogTarget.ts`，main → 正式 project key、其餘分支 → develop project key，**commit 在 git**（`phc_…` 是公開設計值，與 anon key 同理），由 `vite.config.ts` 餵成 `VITE_POSTHOG_KEY`。可選 `VITE_ANALYTICS=off` 緊急關閉開關。
- 身分重置：facade `resetAnalytics()` 呼叫 `posthog.reset()`（未載入則 no-op，不觸發載入）。放進 `clearAccountLocalState()`，這樣登出、換帳號、`endInvalidSession` 三條路徑一次涵蓋（該檔註解本就要求「新增帳號相關狀態加這裡，不要另寫一處」）。
- Admin 與付款頁：`recordingAllowed(pathname)` 純函式，`/payment/*`、`/admin*` 為 false；路由變更時 facade 呼叫 `stopSessionRecording()`／`startSessionRecording()`。付款頁除此之外仍有整頁 block 容器（雙保險：路由閘門失效時 DOM 仍被 block）。
- 無資料庫與後端變更。

## 3. 架構影響

- 新增：`src/utils/analytics/`（`analyticsConfig.ts` 純函式、`analytics.ts` 懶載入 facade）、`config/posthogTarget.ts`。
- 改動：`src/main.tsx`（render 後排程啟動；canonical redirect 分支不啟動）、`src/utils/clearAccountLocalState.ts`（加 `resetAnalytics`）、路由變更處（`App.tsx` 既有 `useLocation` 附近加一個 `usePageview` hook，不碰 auth 邏輯）、`vite.config.ts`、`package.json`。
- facade 不得 import `App`（appShell 守衛）；`clearAccountLocalState` → facade 為單向依賴，facade 不回 import 帳號模組。
- **Bundle 預算（與 S7 衝突處）**：S7（W5-30）已獲准 entry gzip 上調至多 +3 kB 並專用於換篇功能。S4 的 entry 增量目標 **≤ 0.6 kB gzip**（facade＋hook），**S4 不調 `entryGzipKB`**；SDK 走動態 chunk 不計入 entry。但 `totalRawKB: 1600`（所有 JS 加總）會被 posthog-js＋recorder（估 500–700 kB raw）撐爆——階段 3 實測目前總量；超標則為 S4 單獨調高 `totalRawKB` 並在 PR 說明理由（chunk 不影響首屏）。兩 PR 都動 `check-bundle-budget.mjs` 時後合者 rebase、保留雙方數字語意。
- CSP：`public/_headers` 目前只有 `frame-ancestors 'none'`，**沒有 script-src／connect-src，故現在無需放行任何網域、不新增限制性指令**。於檔內註解記下未來完整 CSP 需放行：`https://eu.i.posthog.com`（connect-src）、`https://eu-assets.i.posthog.com`（script-src／recorder chunk）。`appShell.test.ts` 的 `_headers` 契約須維持綠。
- 效能：SDK 在 idle 後載入，不阻塞 LCP；recorder 在低階手機有 CPU 成本——見風險。

## 4. UI/UX

使用者介面無可見變更。遮罩規則（W4-37）：

- 全站預設：所有文字與輸入值遮罩。
- **整塊 block**：新增 `<PrivateField>`（包一層帶 `ph-no-capture` class 的 div，不改版面），套在 CompleteProfile 的姓名／生日／手機、`IdNumberInput`／`WithdrawalProcess` 的身分證與銀行代碼／帳號、`IdVerificationSection`、`ClaimRewardDialog`／`CollectionVerifyDialog` 的對應欄位、`PaymentCheckout`／`PaymentResult` 整頁根容器。實際清單以階段 4 的 codebase 盤點為準（`grep` 現況：CompleteProfile.tsx、reward/IdNumberInput.tsx、reward/WithdrawalProcess.tsx、reward/WithdrawalFundingFields.tsx、common/IdNumberVerification.tsx、PaymentCheckout.tsx、PaymentResult.tsx、admin 提領／會員頁）。
- **catch-all `blockSelector`**：`.ph-no-capture, input[type="tel"], input[type="password"], input[autocomplete^="bday"], input[autocomplete="tel"], input[autocomplete^="cc-"], [data-sensitive]`——新欄位只要寫對 autocomplete／type 就自動被擋，不依賴有人記得包 `PrivateField`。
- 錄影中被 block 的區塊呈現為灰塊；全文字遮罩使重播只能看版面與操作節奏（W4-37 業主已接受）。
- 空態／錯誤態：SDK 載入失敗一律靜默（try/catch，不 toast、不影響任何頁面）。

## 5. 階段切分（每階段 = 一個紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 設定純函式與 key 目標：`analyticsConfig.ts`（`buildPosthogOptions`、`stripUrlSensitiveParts`、`recordingAllowed`、`analyticsEnabled`）＋`config/posthogTarget.ts` | vitest node：`analyticsConfig.test.ts`、`posthogTarget.test.ts` | 選項斷言：`maskAllInputs=true`、`maskTextSelector='*'`、`recordBody/Headers=false`、`autocapture=false`、`person_profiles='identified_only'`；URL 去 query／hash；`/payment/*`、`/admin*` 不錄；無 `CF_PAGES_BRANCH`→disabled；main→prod key、其他→develop key |
| 2 | 懶載入 facade：`analytics.ts`（`startAnalytics`、`trackPageview`、`resetAnalytics`、路由錄影閘門） | vitest node，mock `posthog-js` 動態 import | 未啟動時 reset／pageview 為 no-op 且不載入 SDK；載入失敗不拋；pageview 不含 query；`/payment/…` 時 stopSessionRecording、離開時 start；`reset` 被呼叫一次 |
| 3 | 接線與預算：`main.tsx` idle 啟動、`usePageview`、`clearAccountLocalState` → `resetAnalytics`、`vite.config.ts` 餵 key、`package.json` 依賴 | vitest（`clearAccountLocalState.test.ts` 新增斷言；`appShell.test.ts` 靜態守衛：facade 不在 entry 靜態 import、`posthog-js` 只允許動態 import）＋`npm run build && node scripts/check-bundle-budget.mjs` | entry gzip 增量 ≤ 0.6 kB（PR 附前後數字）；登出／換帳號／無效 session 三路都 reset；knip 綠 |
| 4 | 敏感欄位 block：`PrivateField`、catch-all selector、套用到盤點清單 | vitest jsdom：(a) `PrivateField` 元件測試；(b) **敏感欄位清單測試**：`sensitiveFields.ts` 列出 `{檔案, 欄位 id}`，測試掃各元件原始碼，斷言每個敏感 `id=` 都落在 `PrivateField`／`ph-no-capture` 內，且全 src 掃到新的 `id="(phone\|birthDate\|idNumber\|bank…)"` 不在清單內就失敗；(c) jsdom fixture 驗 `document.querySelectorAll(blockSelector)` 命中 tel／password／bday 欄 | 清單與 codebase 一致；漏包任何一欄測試紅；付款兩頁根容器帶 block class |
| 5 | 文件與收尾：規格書新增「監控與隱私」小節、ui-ux-guidelines 加「新增敏感欄位必包 PrivateField」、`_headers` 註解、friction-log 若有；`check-spec-drift`／`check-context-budget` | `python3 scripts/check-spec-drift.py`、`npm run check:full` | 全綠；規劃檔刪除、遮罩原則升級進規格書 |

## 6. 開放問題

- [ ] **Q1 PostHog 專案與 key**：需業主在 PostHog EU 建兩個 project（develop／正式）並提供 `phc_` key（公開值，可 commit）。建議：預覽分支共用 develop project。實作期未拿到 key 時，`posthogTarget.ts` 放明顯的未設定佔位並使 analytics 保持 disabled，PR 標示「上線前須填 key」。
- [ ] **Q2 admin 頁是否錄**：建議**不錄**（後台畫面含他人個資，遮罩後價值也低）。本規劃已按此設計；如要錄請裁決。
- [ ] **Q3 全文字遮罩的可用性**：`maskTextSelector:'*'` 讓重播只剩版面。W4-37 已定，列此僅確認「錄影價值＝操作路徑與卡關位置」符合預期。
- [ ] **Q4 錯誤追蹤**：`capture_exceptions` 的錯誤訊息／stack 可能夾帶使用者輸入字串（如驗證錯誤）。建議開啟、並在 `before_send` 對 `$exception` 訊息做長度截斷；若業主不接受則關閉。
- [ ] **Q5 無 key／e2e 的驗證手段**：雲端容器無法連 PostHog，真實錄影遮罩效果只能在 develop 部署後人工驗證。建議 PR 附「develop 上線後驗證清單」由業主或主 session 於 PostHog 後台看一段錄影確認（需人工）。
- [ ] **Q6 隱私政策**：W4-37 為「不改條款」。僅確認不需在網站放任何 cookie／追蹤提示（本設計用 localStorage、不寫 cookie）。

## 7. 風險與回滾

- 最壞：遮罩遺漏導致個資進 PostHog（不可撤回，只能後台刪除）。對策：三層防線（全域遮罩＋catch-all selector＋PrivateField＋路由閘門）＋清單測試；上線後先看第一批錄影再放量。
- SDK／recorder 拖慢低階手機：僅 idle 載入；若觀察到問題改抽樣（W4-36 已預留）。
- 預算：entry 與 S7 競爭；以 ≤0.6 kB 約束，並在規劃寫明處理順序。
- 回滾：`VITE_ANALYTICS=off`（Pages 環境變數，重新部署即關）或 revert PR；因 `posthog-js` 為動態載入，回滾不影響其他功能。
