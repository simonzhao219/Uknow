# PostHog 監控與錄影 實作進度

<!-- plans-keep: 與 plan.md 同為鷹架，隨 /tdd-implement 收尾刪除 -->

分支:`feature/posthog-monitoring`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 設定純函式與 key 目標 | ✅ | 6838c1c4 | f21c94f0 |
| 2 | 懶載入 facade＋真實 SDK 外送驗證 | ✅ | 33f75ea3 | a90f41af |
| 3 | 接線與預算 | ✅ | 798ec594 | b5583de4 |
| 4 | 敏感欄位 block | ✅ | 6404d222 | 6e1a7da1 |
| 5 | 文件與收尾 | 🟡 進行中（文件已寫、/review-implementation 已跑並處置、待 check:full 與清理規劃檔） | | |

## 目前位置與下一步

階段 4 綠（全 check 綠）。已套用：CompleteProfile（身分證／生日／手機＋autoComplete／inputMode）、IdNumberInput 根容器、WithdrawalProcess（身分證／銀行代號／帳號／證件照正背面）、IdVerificationSection，付款頁與後台於路由層包 `PrivateRegion`。下一步：階段 5 文件與收尾——規格書「監控與隱私」小節（註明 localStorage 存 PostHog 匿名 id、與 §10.4 不同 key）、ui-ux-guidelines（新欄位須設對 autocomplete／type 或併入 privateClass）、`_headers` 註解、環境變數與回滾手段登記；check-spec-drift；`npm run check:full`；`/review-implementation`；刪規劃檔；PR 內文。

## Blockers(逃生口紀錄)

- **tdd-lock 兩次授權（業主互動選項，皆在本 session，2026-11-05）**：
  1. 「階段 2 紅燈的測試 helper 有一個錯…要授權嗎？」→ 業主選「授權解鎖並修正 helper（建議）」。範圍：只改 `analyticsPrivacy` 的解碼 helper。原因：SDK 的 `compress_events` 把 FullSnapshot 欄位 gzip 成 latin1 字串，原 helper 當 base64 解，「不得出現」斷言會空過（對照組 `home-probe` 抓到）。
  2. 「…要再授權嗎？」→ 業主選「授權拆成多個測試檔（建議）」。範圍：把單檔 4 案例拆成 4 檔＋共用 `analyticsPrivacyHarness.ts`，斷言逐字不變。原因：posthog-js 為外部套件，`vi.resetModules` 重置不了，同檔多案例互相污染（`__PosthogExtensions__` 不再建立）。
  兩次修改都只加嚴或重構，未放寬任何斷言。
- **偏離 plan §4（階段 4，實作期記錄）**：①plan 的 `PrivateField` 元件＋`privateProps()` 實作為 `privateClass(extra)` 函式（併進既有群組根容器，不新增節點）；②整頁 block 改在路由層用 `PrivateRegion`（`display:contents`，包在 ProtectedRoute／AdminRoute 外，連 loading／導向狀態都涵蓋），而非逐頁根容器加 class（PaymentResult 有 9 個 return 根，逐一加易漏）；已有真實 SDK 測試（`analyticsPrivacyBlock.test.ts`）證明 contents 容器底下的子樹不外送。③`/admin/verify` 現為 `<Navigate to="/dashboard/qr?tab=scan">`，落地頁不在禁錄路徑（QR 掃描頁是否含他人個資待主 session／業主裁決）。④手機欄位 `autoComplete` 用 `tel-national`（避免通訊錄 `+886…` 被 maxLength=10 截斷）；catch-all 同步加 `input[autocomplete^="tel-"]`。⑤`entryRawKB` 1000→1002（實測 raw +1.9 kB；plan 只授權 gzip +1.0，raw 為順帶，PR 內文說明）。
- **偏離 plan §2.2（記錄，未私改 plan）**：plan 說 `advanced_disable_feature_flags: true`「少一支外送請求」。實測（jsdom、遠端設定預載）整輪只送出 `/e/`（事件）與 `/s/`（錄影），**沒有 `/flags`**，所以這個選項的效果是「不評估 flag」而非 plan 描述的理由；`advanced_disable_flags: true` 則會讓 SDK 跳過遠端設定載入，錄影永遠不啟動，**不可用**。**驗證缺口**：測試以 `window._POSTHOG_REMOTE_CONFIG` 預載設定，所以正式環境的 `/array/<key>/config(.js)` 載入請求與可能的 `/flags` 請求沒有被測試涵蓋（它們不經過 `before_send`）；列入 develop 上線後人工清單——用瀏覽器 Network 面板確認這些請求的網址與本文都不含 token。

## 框架摩擦
