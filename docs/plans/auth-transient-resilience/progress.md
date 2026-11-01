# 暫時性故障不登出（T1-B）實作進度

<!-- 外部記憶：每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支：`feature/auth-transient-resilience`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| B0 | 開工前置（F1 合併、rebase、結構快照、deno） | ✅ 完成 | — | — |
| B1 | 後端 authenticate／ProfileReadError 503／register post-write／?retry=1 | ✅ 綠（DB 整合測試待 CI） | e4fb2775 | c823fc95 |
| B2 | apiUrl 抽出、fetchProfile missing／retry／逾時常數 | ✅ 綠 | 062cd3a6 | e04ebcac |
| B3 | endInvalidSession＋appShell 等價改寫 | ✅ 綠 | 2691b4ed | c9d3bd12 |
| B4 | useAuthBootstrap degraded／重試／getSession 錯誤／anomaly | ✅ 綠（實作 4e29e176、W4-20 期望 eea0e29a） | de4d58cf | eea0e29a |
| B5 | 呈現：AuthDegradedNotice／Frame、守衛、RouteAuthLoading、authView、useMemberLogout | ✅ 綠 | a5bb2975 | 15cd222e |
| B6 | 入口與漏斗頁：routeAfterVerifiedSession、AuthPage、PaymentCheckout、CompleteProfile；e2e | ⬜ 未開始 | | |
| B7 | apiClient 兩層確認（可降級） | ⬜ 未開始 | | |
| B8 | 規格書 §5.3、§14 #8、§2.1 已知限制 | ⬜ 未開始 | | |

## 目前位置與下一步

B0 完成（11/01）：F1（#486，merge 2b99700）已合，分支 rebase 到 origin/develop；`check-migration-versions` OK（83 支）；deno 2.9.6（npm）；
**容器無 supabase CLI**（無法 `supabase start` 跑 DB 測試）。B1 綠（unit 168/168、deno check）；`profile-self-heal`／`registration-step-contract` 等 DB 測試只能看 CI api-tests 軌。B2、B3 綠（B3 knip 對只有測試消費者的匯出不報錯，不需併入 B4）。B4 綠（W4-20 裁決後；全閘門 2732/2732）。B5 綠（2767/2767）。下一步 B6。
11/01 再 rebase 到 develop（#487，efa1d06a）：本表 hash 已換成 rebase 後的值（commit message 內引用的舊紅燈 hash 以本表為準）。

### B0 結構快照（F1 後）

- `useAuthBootstrap.ts`：`AuthBootstrapDeps` 新增可選 `onAccountSwitched`；`begin()` 換 uid 分支（`uidRef!==null`）依序 `genRef+=1`、`clearInflight()`、
  `onAccountSwitched?.()`，之後 `uidRef=uid`、`start`、`load`。`load()`／`endSession()`／transient 分支（`uidRef=null`）與 F1 前相同。
  → B4 的 `attemptRef` 取消要放在換 uid 分支內、`onAccountSwitched` 之前或之後皆可（無相依），統一放在 `genRef+=1` 旁。
- 新模組 `utils/clearAccountLocalState.ts`：清 `withdrawalBankData`／`pendingUser`／`user`／`pendingSession`＋完善資料草稿；App 的 `onSignedOut`／`onAccountSwitched`
  與 apiClient 401 都呼叫。→ **B3 的 `endInvalidSession` 改呼叫 `clearAccountLocalState(storage)`**，取代 plan §2.5 寫的「移除 user／pendingSession 舊鍵」
  （同一目的、F1 已收斂成單一入口；屬依 F1 現況的等價調整，PR 偏離說明列出）。
- apiClient 401（`apiRequestJson` catch）：`signOutWithFallback` → `clearAccountLocalState()` → `clearAuthHint()` → `emitSessionExpired()`。
- AuthPage 三處裸 `signOut` → `signOutWithFallback`（掛載 effect unauthorized、catch、登入表單 404／410）。
- Navbar 會員登出 `handleLogout`（`Navbar.tsx:60-95`）是元件內函式、不可直接重用 → B5 依 plan §4.1 抽 `hooks/useMemberLogout.ts`。
- Button 基底不再給 `aria-disabled` 停用外觀：`AuthDegradedNotice` 的「重新連線中…」鈕自己補灰化 class。

### 後端測試落點調整（B1）

plan 寫 deno test `profile-transient.test.ts`。容器無 supabase CLI，改為 **`profile-transient.unit.test.ts`（純單元、注入假 client）**：`buildProfileResponse` 本來就收
`client` 參數，第 4 參數改為 options（`alreadyHealed`、`retry`、可注入 `heal`／`repair`），`authenticate` 抽成可注入 auth client 的純函式；R9 以讀原始碼列舉。
落點仍是 deno test（同層），只是不需 DB——本機可跑紅綠，CI 的 `test:unit` 也會跑。

### 實作時處理（主 session 審查 P2，不改 plan）

1. **B4**：§2.3 `retry()` 偽碼漏了 dispatch `retry` action——手動／事件重試進入時先設 `isRetrying=true`（callout 不卸載、鈕 `aria-disabled`）；
   `profile`／`transient`／`missing`／`signedOut`／`unauthorized` 每個出口都清 `isRetrying`。B4 補一案「重試後再 transient → `isRetrying` 回 false、`failedAgain` 為真」。
2. **B1 前**：把 Logs Explorer 唯讀查詢（24 小時 `/profile` 5xx 與 `effective_registration_step` 等 rpc 錯誤）send_message 給主 session 代跑兩站，結果記這裡。
   **結果（主 session 代跑，11/01 15:10 UTC 往前 24 小時，ClickHouse 統一 logs 表改寫）**：
   - 正式站：`/profile` 0 筆（整個 Edge Function 41 筆：200×26、401×15）；5xx 0、404 0；postgres ERROR／FATAL 0。
   - develop：GET `/profile` 200×2；5xx 0、404 0；execution_time_ms p50 2,280、p95 3,488、max 3,622（2 筆、含冷啟動）；postgres ERROR／FATAL 0。
   - 判讀：不必停；p95 遠低於 8 秒。**已知限制**：樣本量極小，正式站真實分布要等上線後依子 plan §2.4 量測 SQL 再看、必要時調逾時。

## Blockers（逃生口紀錄）

- **B4（逃生口 2，11/01）**：既有測試 `SIGNED_IN 為另一個 uid 時清提示、轉 unknown 並載入新帳號`（`useAuthBootstrap.test.tsx` 約 :323）
  以 `toHaveBeenLastCalledWith('tok-'+UID_B, { userId: UID_B })` 釘死 fetchProfile 參數。plan §2.2／§2.3 規定冷啟動與新 uid 的請求帶
  `timeoutMs: PROFILE_FETCH_TIMEOUT_MS`，實際參數為 `{ userId: UID_B, timeoutMs: 8_000 }`。紅燈 commit de4d58cf 已把**同形的另一條**
  （`會員 /profile ok 後…`）改成帶 `timeoutMs: 8_000`，這條漏改。實作未偏離 plan；需裁決是否允許把該期望改成
  `{ userId: UID_B, timeoutMs: 8_000 }`（只改參數期望，不改測試語意）。紅燈期鎖住 `*.test.*`，未自行修改。
  **裁決 W4-20**：業主先在主 session 同意，再於本 session 親打「同意 W4-20，改那條測試期望」（2026-11-01）。
  PreToolUse 守衛要求由人解鎖（`.claude/tdd-lock`）。雲端 session 不能由人執行 `!` shell（「shell 指令僅可在本機工作階段中使用」），
  業主改以互動選項授權「代為解鎖」：Claude 刪鎖、只改該條期望、全閘門綠後 commit eea0e29a。**已結案**。
  PR「偏離規劃說明」需列此條（業主原話與時間）。

## 框架摩擦

- 2026-11-01 B1：`python3 scripts/check-test-names.py | tail -2 && …` 的 pipe 吞掉 exit code，紅燈 commit 帶著兩個命名違規進去（鎖住期間無法改測試，解鎖後另 commit 修）。
  教訓：檢查指令不要接 `| tail` 再串 `&&`。
- 2026-11-01 B4：`tdd-test-guard` 的「由人解鎖修測試」假設人能在本機執行 shell；claude.ai/code 雲端 session 的使用者打 `!` 會被拒
  （「shell 指令僅可在本機工作階段中使用」）。這次以業主互動授權＋Claude 代刪鎖處理。框架修訂候選：給雲端 session 一條人工解鎖通道
  （例如業主授權語句寫進 progress.md 後由 script 驗證再刪鎖），並在 DENY_REASON 指路。
- 2026-11-01：push 前的守衛自動 rebase 會改寫全部 hash，progress.md 記的紅燈／綠燈 hash 隨之失效，需手動重對。
