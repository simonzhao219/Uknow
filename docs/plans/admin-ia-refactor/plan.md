# 後台資訊架構重構（S3：A1＋A2）規劃書

<!-- plans-keep: S3 施工中的三段式鷹架（規劃待人審、實作未開始）；退場條件＝/tdd-implement 收尾、PR 合併前整個 docs/plans/admin-ia-refactor/ 刪除 -->

> 母計畫：`docs/plans/platform-uiux-redesign/plan.md` §2.1／§2.2／§2.6、§3 A1／A2、§5。
> 本檔只寫 S3 的施工細節；母計畫已有的理由不重述。
> **狀態：定稿（業主 2026-10-05 於 #359 裁決 Q1 B／Q2 一律二字／Q3 加），待 `/review-plan` 與人審。**

## 0. 一句話

讓管理員在手機上一眼看到四個分頁、一行用完工具列，因為後台是功能逐個長出來的：
第五個分頁「管理員設置」只是身分展示，而它唯一的功能（bootstrap）其實點不到。

## 1. 使用者需求

- 對照：規格書 §13（`docs/uknow-software-specification.md:620-678`）；
  `ui-ux-guidelines.md` §1（44px 觸控）、§11.2（視覺權重）、§12.11（按鈕三分法：後台工具列動作皆次要）。服務 P4（母計畫 §1）。
- 驗收情境：
  1. 管理員 375px 進 `/admin`：**四個分頁「提領／會員／公告／告警」排成一列**，標籤不溢字、可點高度 ≥44px；桌機四欄等寬、同一套字串。
  2. 提領管理工具列在 375px **單行**：篩選 Select 吃剩餘寬度＋重新整理 icon 鈕＋CSV icon 鈕，
     兩顆 icon 鈕 44px、有 `aria-label`；桌機同位置帶文字。
  3. 按 CSV 後到檔案出來之前（多頁收集期間），CSV 鈕顯示忙碌且不可再按。
  4. 會員管理工具列用同一個元件：搜尋框吃剩餘寬度＋重新整理鈕；**沒有 CSV 鈕**。
  5. 全新資料庫的第一位管理員：照 `docs/supabase-setup-checklist.md` 新增的步驟打一次 API 即可產生；後台不再有任何 bootstrap 畫面。
- 不做（承母計畫 §5）：不動 `supabase/functions/`、不改 API；不動 `AdminRoute`（零權限閘門變更）；
  不把 CSV 匯出複製到會員管理；不動會員詳情（A3／S4）、不做快取（A4／S5）；不改 `ui/tabs.tsx` 基底。
- 看板遺留項「`--brand-subtle(-foreground)` 零消費者，S3 決定去留」：S2e 之後已有消費者
  （`ui/button.tsx:114` 的 brand tone）且已寫進 `ui-ux-guidelines.md` 定案色表——**保留，無需動作**，收尾時在看板結案。

## 2. 系統設計

- **無 API 變更**。`GET /admin-setup/check`、`POST /admin-setup/set-self-admin` 與 RPC
  `admin_setup_claim`（`api/index.ts:1708-1746`）全部保留——journey 的 `builders/admin_bootstrap.py` 依賴它們。
- **子項 A1-a｜bootstrap 只走 API、GUI 退場（Q1＝B，獨立審查子項）**：
  - 刪 `src/components/admin/AdminSetup.tsx` 與 `AdminSetup.test.tsx`；`AdminDashboard` 移除 import 與分頁。
  - `AdminRoute.tsx` **不動**——非管理員照舊導回 `/dashboard`。
  - `docs/supabase-setup-checklist.md` 新增一步「建立第一位管理員（全新資料庫才需要）」：該使用者先在前台登入，
    以其 access token 打 `POST /api/admin-setup/set-self-admin`（與 journey 同路徑）；已有管理員時 RPC 回 403，
    之後新增管理員一律在後台會員詳情授予（規格書 §13 既有路徑）。
  - 規格書 §13 模組表「管理員設定 / `AdminSetup`」列刪除；§13 「所有 `/admin/**` 路由統一守門」段後補一句
    bootstrap 端點不在 `/admin/**` 命名空間、只供全新資料庫使用並指向 checklist（端點仍在，屬「殘跡」的最小事實說明，
    符合 `.claude/rules/document-writing.md`）。
- **子項 A2｜AdminToolbar**：純呈現元件，資料與動作全由呼叫端以 props 注入（沿用 `AdminDashboard.tsx` 的
  「取數在殼層、畫面吃 props」慣例）；CSV 忙碌態是 `WithdrawalManagement` 的本地 state（`isExporting`），
  `try/finally` 包住既有 `downloadCSV`，含上限拒絕與收集失敗兩條 early return。

## 3. 架構影響

- 動到：`AdminDashboard.tsx`（4 欄、二字標籤、移除 admin-setup）、刪 `admin/AdminSetup.tsx`(+test)、
  新增 `admin/AdminToolbar.tsx`(+test)、`admin/WithdrawalManagement.tsx`、`admin/MemberManagement.tsx`。
- 路由 lazy 結構不變；`AdminRoute`、`App.tsx` 不動。
- **分頁標籤是跨層契約**：e2e（mock）與 journey（真後端）都以 `get_by_role("tab", name=…)` 找分頁，
  Playwright 的 name 比對是子字串，「會員管理」找不到「會員」。改名必須同 PR 改完所有呼叫端（§5 階段 1 清單），
  否則 journey 會在**晉升 PR** 才紅（本機不能跑 journey）。
- 安全：無權限邏輯變更；刪掉的是一個不可達畫面，後端守門（`requireAuth`＋`is_admin`／RPC 原子判斷）原樣。
- 不涉及多步驟流程四契約。

## 4. UI/UX

- **分頁列**：「提領／會員／公告／告警」（手機桌機同一套）；`grid-cols-4`、保留 `w-full grid h-auto` 與
  `pointer-coarse:[&>[role=tab]]:min-h-[44px]`。量測依據（375px）：track 337px ÷ 4 ＝ 84.25px，扣 18px 剩約 66px；
  二字 `text-sm` 約 28px，餘裕約 38px（現況三欄只有 10.3px）。**以 e2e 真瀏覽器量測為準**；
  不過則退 2+2（`grid-cols-2 md:grid-cols-4`），兩列斷言改 2。
- **AdminToolbar**（母計畫 §2.2）：
  - 版面：`[filter slot（flex-1 min-w-0）][重新整理][CSV?]`，`flex-nowrap` 單行；
    提領頁的「已顯示 N / M 筆」移出工具列成下一行小字，不再參與擠壓。
  - icon 鈕：手機 `size-11`（44px）只顯示 icon；`md:` 起帶文字。`aria-label` 一律存在（「重新整理」「下載 CSV」）。
  - 權重：重新整理在前（頻率高），CSV 在最右；兩者 `tone="secondary"`（§12.11）。
  - CSV：只在傳入 `onExport` 時渲染；忙碌時 icon 換轉圈、`disabled`、`aria-busy="true"`，`md:` 文字改「匯出中…」。
    重新整理在 `isRefreshing` 時 `disabled`。
  - 會員頁 filter slot ＝ 既有搜尋 `form`（Input `flex-1` 取代 `w-56`，送出鈕保留）；
    CardHeader 的手機隱藏標題結構不變。
- 空/錯/載入態：不變（列表區各自既有）。

## 5. 階段切分（每階段一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 四分頁＋二字標籤＋AdminSetup 退場 | `AdminDashboard.test.tsx`（四個二字分頁、無「管理員設置」、沒有第五個）；`e2e/test_admin_mobile_layout.py`（兩列→**1 列**、ink overflow、44px 迴圈 4 格）；e2e mock 全套 | `npm run check` 綠；e2e（mock）本機或 CI 綠；`cd e2e/journey && pytest tools/` 綠 |
| 2 | AdminToolbar 元件 | `admin/AdminToolbar.test.tsx`（jsdom）：無 `onExport` 不渲染 CSV；兩顆鈕有 aria-label；`isExporting` 時 disabled＋aria-busy；`isRefreshing` 時重新整理 disabled | vitest 綠 |
| 3 | 套用兩頁＋CSV 忙碌態＋會員頁重新整理 | `WithdrawalManagement.test.tsx`：多頁收集期間 CSV 鈕 disabled、完成與失敗後都恢復；`MemberManagement.test.tsx`：無 CSV 鈕、重新整理觸發重讀、搜尋仍可送出；e2e 新增「375px 兩頁工具列單行、icon 鈕可點 ≥44px」 | vitest 綠；e2e 於 CI 綠 |
| 4 | 文件與註解人工同步 | 無機械把關（`check-spec-drift.py` 抓不到），逐項勾下方清單 | 清單全勾；`framework-check.sh` 綠 |

**階段 1 分頁改名呼叫端清單**（漏一個就是靜默的晉升紅）：
- [ ] `e2e/features/admin_dashboard.feature`：:3 描述、:18-19、:26、:34
- [ ] `e2e/pages/admin_dashboard_page.py:2-3` docstring
- [ ] `e2e/test_overflow_sweep.py`：:393、:451、:590、:598（`_open_tab`／`get_by_role`）；移除「管理員設置」SweepRoute（:600-607）與 :359-362 的 `set_admin_setup` 呼叫
- [ ] `e2e/test_admin_mobile_layout.py`：:281、:353、:371；:63-72 兩列斷言、:209-223 docstring、:226-250 迴圈與 docstring
- [ ] `e2e/mocks/backend_api_mock.py:691-721` `set_admin_setup` 刪除（再無呼叫者）
- [ ] **journey**：`e2e/journey/steps/f50_withdrawal_steps.py:18`、`f70_renewal_saga_steps.py:151`、`:475`
- [ ] `e2e/overflow_probe.py:149` 不動（字型量測探針，與分頁無關）

**階段 4 文件清單**：
- [ ] 規格書 §13 模組表刪「管理員設定 / `AdminSetup`」列（:630），守門段後補 bootstrap 一句（見 §2）
- [ ] 規格書 §13.1「釘死的 5 欄 grid」（:678）→ 4 欄
- [ ] `docs/supabase-setup-checklist.md` 新增 bootstrap 步驟（並更新同檔「快速檢查表」）
- [ ] `AdminDashboard.tsx:121-145` Tab 註解（3+2、五欄、10.3px 餘裕）改寫成 4 欄的量測
- [ ] `MemberManagement.tsx:228-229` 「5 欄 grid」註解 → 4 欄
- [ ] `SystemNotifications.test.tsx:3` 引用 `AdminSetup.test.tsx` 的註解改寫
- [ ] `WithdrawalManagement.tsx:765` 「分頁標籤已經寫著『獎金提領管理』」→「提領」
- [ ] `e2e/README.md:168` 管理員設置分頁的例子：教訓保留，補「（該分頁已於 S3 移除）」
- [ ] 母計畫 `platform-uiux-redesign/plan.md` §0／§2.6／§3 A1／§5 已於規劃階段改為 Q1＝B（本 PR 第 3 個 commit）

## 6. 開放問題

- [x] **Q1** bootstrap → **B 只走 API、GUI 退場**（業主 2026-10-05，#359）
- [x] **Q2** 分頁標籤 → **手機桌機一律二字**
- [x] **Q3** 會員管理重新整理鈕 → **加**（`list.reload`；S5 快取的手動刷新入口也靠它）

## 7. 風險與回滾

- 最壞：分頁改名漏改 journey 呼叫端 → 晉升 PR 的 `journey-full` 紅、擋晉升。緩解：§5 清單＋
  實作完 `grep -rn "獎金提領管理\|會員管理\|公告管理\|管理員設置" e2e src` 只剩註解與非分頁用途。
- 全新環境沒人知道怎麼 bootstrap → checklist 一步；端點與 journey 路徑不變。
- 二字標籤量測不過 → 退 2+2，不影響其他階段。
- 純前端＋文件，回滾 ＝ revert PR。
