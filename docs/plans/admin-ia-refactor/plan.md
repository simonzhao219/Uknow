# 後台資訊架構重構（S3：A1＋A2）規劃書

<!-- plans-keep: S3 施工中的三段式鷹架（規劃待人審、實作未開始）；退場條件＝/tdd-implement 收尾、PR 合併前整個 docs/plans/admin-ia-refactor/ 刪除 -->

> 母計畫：`docs/plans/platform-uiux-redesign/plan.md` §2.1／§2.2／§2.6、§3 A1／A2、§5。
> 本檔只寫 S3 的施工細節；母計畫已有的理由不重述。
> **狀態：審查回填版**——業主 2026-10-05 於 #359 裁決 Q1–Q3 與 R1–R4，`/review-plan` 的 P1×9 全數回填（對照見 `review.md`「處置」）。待人審後由業主親自 `/tdd-implement`。

## 0. 一句話

讓管理員在手機上一眼看到四個分頁、一行用完工具列，因為後台是功能逐個長出來的：
第五個分頁「管理員設置」只是身分展示，而它唯一的功能（bootstrap）其實點不到。

## 1. 使用者需求

- 對照：規格書 §13（`docs/uknow-software-specification.md:620-678`）；
  `ui-ux-guidelines.md` §1（44px 觸控）、§5（不得靜默截斷）、§11.2（視覺權重）、§12.11（按鈕三分法：後台工具列動作皆次要）。服務 P4（母計畫 §1）。
- 驗收情境：
  1. 管理員 375px 與 320px 進 `/admin`：**四個分頁畫面上寫「提領／會員／公告／告警」、排成一列**，標籤不溢字、
     觸控可點高度 ≥44px；桌機四欄等寬、同一套可見字。螢幕閱讀器念完整名稱「獎金提領管理／會員管理／系統公告／系統告警」（「系統公告」取代現名「公告管理」，業主 2026-10-05 裁決）。
  2. 提領管理工具列在 375px **單行**：篩選 Select 吃剩餘寬度＋重新整理鈕＋CSV 鈕；手機只顯示 icon、`md:` 起帶文字；
     兩鈕間距 ≥8px；CSV 鈕的名稱含「（含身分證與帳號）」。
  3. 按 CSV 後到檔案出來之前，CSV 鈕顯示忙碌，篩選與重新整理也停用；連按只下載一份；
     完成後顯示「已匯出 N 筆」；收集失敗或超過上限時顯示錯誤、按鈕恢復。
  4. 會員管理工具列用同一個元件：搜尋框（右側內嵌放大鏡送出鈕、placeholder「搜尋會員」、Enter 可送出）吃剩餘寬度
     ＋重新整理鈕；**沒有 CSV 鈕**；375px 同列、無橫向溢出、placeholder 完整可見。
  5. 全新資料庫的第一位管理員：**逐步照 `docs/supabase-setup-checklist.md` 新增的步驟做，`GET /admin-setup/check` 回 `isAdmin:true`**；
     後台不再有任何 bootstrap 畫面。
- 不做（承母計畫 §5）：不動 `supabase/functions/`、不改 API；不動 `AdminRoute`（零權限閘門變更）；
  不把 CSV 匯出複製到會員管理；不動會員詳情（A3／S4）、不做快取（A4／S5，重新整理沿用現行「整列換骨架」）；
  不改 `ui/tabs.tsx`、`ui/button.tsx` 基底；**`SystemAlerts.tsx:73-84` 的重新整理鈕不套 AdminToolbar**——
  該頁沒有篩選、版面是告警清單上方一顆鈕，套用無版面收益；S5 若要統一手動刷新入口再一併處理。
- 看板遺留項「`--brand-subtle(-foreground)` 零消費者，S3 決定去留」：S2e 之後已有消費者
  （`ui/button.tsx:114` 的 brand tone）且已寫進 `ui-ux-guidelines.md` 定案色表——**保留**，階段 4 在看板結案。

## 2. 系統設計

- **無 API 變更**。`GET /admin-setup/check`、`POST /admin-setup/set-self-admin` 與 RPC
  `admin_setup_claim`（`api/index.ts:1708-1746`）全部保留——journey 的 `builders/admin_bootstrap.py` 依賴它們。
- **子項 A1-a｜bootstrap 只走 API、GUI 退場（Q1＝B，獨立審查子項）**：
  - 刪 `src/components/admin/AdminSetup.tsx` 與 `AdminSetup.test.tsx`；`AdminDashboard` 移除 import 與分頁。
  - `AdminRoute.tsx` **不動**——非管理員照舊導回 `/dashboard`。
  - `docs/supabase-setup-checklist.md` 新增編號步驟「建立第一位管理員（全新資料庫才需要；develop 與正式站各做一次）」，必備內容：
    1. **前置**：該使用者先在前台完成註冊並補完個人資料（`handle_new_user` 只建 `name=''` 的裸列，
       見 `e2e/journey/builders/admin_bootstrap.py:23-31`；沒有 profiles 列時 RPC 回 `not_found`）。
    2. **取得 access token**：可複製的方法（前台登入後 DevTools → Application → Local Storage 的 Supabase session `access_token`）。
    3. **呼叫**：`curl -X POST https://<ref>.supabase.co/functions/v1/api/admin-setup/set-self-admin -H "Authorization: Bearer <token>"`，
       `<ref>` 分別取 `config/supabaseTarget.ts`（develop）與 `src/utils/supabase/info.tsx`（正式站）。
    4. **回應**：200 `success:true` ＝ 成功；**403 兩種意義**——系統已有管理員（之後新增管理員一律在後台會員詳情授予，§13 既有路徑），
       或該使用者沒有 profile（回前置）。
    5. **自驗**：`GET /admin-setup/check` 回 `isAdmin:true`，再開 `/admin` 進得去。
    6. **時機提醒**：端點對「全新資料庫的第一個呼叫者」開放，新環境部署後應立即由預定管理員宣告。
    - 同步加進同檔 `:498-518` 的「快速檢查表」。措辭只寫操作事實，不寫「GUI 已退場」之類旁白（`document-writing.md`）。
  - 規格書 §13 模組表「管理員設定 / `AdminSetup`」列刪除；§13 守門段後補一句最小事實：bootstrap 端點
    `/admin-setup/*` 不在 `/admin/**` 命名空間、只在全新資料庫使用，程序見 checklist。
- **子項 A2｜AdminToolbar**：純呈現元件，資料與動作全由呼叫端以 props 注入（沿用 `AdminDashboard.tsx` 的
  「取數在殼層、畫面吃 props」慣例）。props：`filter`（ReactNode）、`onRefresh`、`isRefreshing`、
  `onExport?`、`isExporting?`、`exportLabel?`、`disabled?`（匯出期間停用整列）。
  - 提領頁：`isRefreshing` ＝ 既有本地 `isLoading`（`WithdrawalManagement.tsx:186`）。
  - 會員頁：`isRefreshing` ＝ `list.isLoading || list.isLoadingMore`（`usePagedList.ts:64-77` 的 loadMore 進行中按 reload
    會把舊頁尾接到新列表，所以兩者都要停用）。重新整理後搜尋字串保留（`deps: [search]`）。
- **CSV 匯出的狀態正確性**（`WithdrawalManagement.tsx:334-404`）：
  - 入口以 `useRef` 旗標**同步**擋重入（`setIsExporting` 要等 re-render 才 disabled，同 tick 連按會跑兩輪收集、下載兩份）。
  - `isExporting` state 驅動 UI；`try/finally` 包**整個函式本體**（含上限拒絕 :338、收集失敗 :365 兩條 early return、
    blob 組裝與 `link.click()`），finally 同時清 ref 與 state。
  - 匯出期間篩選 Select 與重新整理一併停用（收集迴圈閉包取按下當下的 `statusFilter`，停用才保證檔案與畫面一致）。
  - 完成後 `setActionMessage('已匯出 N 筆')`（LINE 內建瀏覽器下載常無聲，避免使用者以為沒反應再按）。

## 3. 架構影響

- 動到：`AdminDashboard.tsx`（4 欄、可見二字＋sr-only 補字、移除 admin-setup）、刪 `admin/AdminSetup.tsx`(+test)、
  新增 `admin/AdminToolbar.tsx`(+test)、`admin/WithdrawalManagement.tsx`、`admin/MemberManagement.tsx`。
- 路由 lazy 結構不變；`AdminRoute` 不動；`App.tsx` **經核對無需改動**（母計畫 §2.6 所列 `App.tsx:71` 行號已失效，現無「5 欄」措辭）。
- **分頁名稱是跨層契約**：e2e（mock）與 journey（真後端）都以 `get_by_role("tab", name=…)` 找分頁（子字串比對）。
  R1 裁決以 **sr-only 補字讓無障礙名稱維持現名**（例：`<span className="sr-only">獎金</span>提領<span className="sr-only">管理</span>`），
  所以 e2e／journey 找分頁的名稱**只改一個**：公告分頁由「公告管理」改為「系統公告」（可見「公告」、sr-only 前綴「系統」；業主裁決）。已核對 journey 沒有呼叫端用它，只有 mock e2e 的 `test_overflow_sweep.py:594/598`；其餘三個名稱不變；不用 `aria-label`（會蓋掉可見文字，違反 WCAG 2.5.3）。
  另將 `e2e/pages/admin_dashboard_page.py:31` 的 `tab()` 加 `exact=True`（防將來撞名：二字可見名本身不入名稱，但「會員管理」
  與會員頁內層「會員列表」若未來改名可能重疊）。
- 按鈕沿用原語：icon 版以 `size="icon"`（`size-9 pointer-coarse:size-[44px]`，`button.tsx:62`）為基底，
  `md:` 起覆寫成帶文字（`md:w-auto md:px-3`）；CSV 忙碌態用既有 `loading` prop（`button.tsx:180-189`，已含 disabled＋aria-busy＋Loader2），
  loading 時不渲染 Download icon 免雙 icon。兩顆鈕明確 `type="button"`（會員頁的 filter slot 是 `<form>`）。
- 安全：無權限邏輯變更；刪掉的是一個不可達畫面，後端守門（`requireAuth`＋`is_admin`／RPC 原子判斷＋advisory lock）原樣。
- knip：`AdminToolbar` 在階段 2 只被自己的測試 import，不算死碼（knip 只看 project 範圍）。
- 不涉及多步驟流程四契約。

## 4. UI/UX

- **分頁列**：可見字「提領／會員／公告／告警」（手機桌機同一套）＋ sr-only 補成完整名稱；`grid-cols-4`、保留
  `w-full grid h-auto` 與 `pointer-coarse:[&>[role=tab]]:min-h-[44px]`。量測依據：375px track 337px ÷ 4 ＝ 84.25px，
  扣 18px 剩約 66px；320px 剩約 52px；二字 `text-sm` 約 28px。**以 e2e 真瀏覽器量測為準**（ink overflow 只看可見字，
  實作時驗證 sr-only span 不影響 `scrollWidth`）；不過則退 2+2（`grid-cols-2 md:grid-cols-4`），兩列斷言改 2。
- **AdminToolbar**（母計畫 §2.2）：
  - 版面：`[filter slot（flex-1 min-w-0）][重新整理][CSV?]`，`flex-nowrap` 單行、`gap-2`（8px）；
    提領頁的「已顯示 N / M 筆」移出工具列成下一行小字（仍符合 §5）。
  - 名稱：文字放 `<span className="sr-only md:not-sr-only">`、icon `aria-hidden`、**不設 aria-label**——手機（icon）與桌機（文字）
    的可及名稱同源，忙碌文字也會被朗讀。名稱：「重新整理」、「下載 CSV」＋sr-only「（含身分證與帳號）」，忙碌時「匯出中…」；
    桌機另加 `title` 提示含敏感資料。
  - 權重：重新整理在前（頻率高），CSV 在最右；兩者 `tone="secondary"`（§12.11）；不加確認框（高頻匯款核對動作，R3）。
  - 忙碌：CSV `loading`；另放 `sr-only role="status"`「匯出中」；重新整理在 `isRefreshing` 時 `disabled`。
  - 上限拒絕／收集失敗的錯誤沿用既有 `setLoadError` 區塊（位於工具列正下方的列表區上緣），手機上在視線內。
- **會員頁 filter slot**（R2）：拿掉獨立送出鈕；`<form>` 內 Input（`flex-1`、`pr-10`）＋ **右側內嵌放大鏡
  `type="submit"`**（絕對定位、不佔工具列寬度、`aria-label="搜尋"`），placeholder 改「搜尋會員」；Enter 送出照舊。
  CardHeader 的手機隱藏標題結構不變。
- 空/錯/載入態：不變（列表區各自既有）。

## 5. 階段切分（每階段一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 四分頁（可見二字＋完整名稱）＋AdminSetup 退場 | `AdminDashboard.test.tsx`：四個分頁以完整名稱可找到、可見文字為二字、無「管理員設置」、tab 總數＝4；`e2e/test_admin_mobile_layout.py`：兩列→**1 列**（375／320）、ink overflow、44px 迴圈 4 格；桌機 viewport 四欄等寬（四個 tab 寬度差 ≤1px） | `npm run check` 綠；e2e（mock）綠；`cd e2e/journey && pytest tools/` 綠 |
| 2 | AdminToolbar 元件 | `admin/AdminToolbar.test.tsx`（jsdom）：無 `onExport` 不渲染 CSV；兩鈕可及名稱（「重新整理」「下載 CSV（含身分證與帳號）」）；`type="button"`；`isExporting` 時 CSV aria-busy 且名稱含「匯出中」、`disabled` 時整列停用；`isRefreshing` 時重新整理 disabled | vitest 綠 |
| 3 | 套用兩頁＋CSV 正確性＋會員頁重新整理與搜尋 | `WithdrawalManagement.test.tsx`：同 tick 連按兩次只跑一輪 `loadWithdrawals` 序列；收集期間 CSV／篩選／重新整理 disabled；完成顯示「已匯出 N 筆」；收集 reject 後恢復且顯示錯誤；上限拒絕後恢復；既有 `:181/193` 的 `name: '下載CSV'` 查詢改新名稱。`MemberManagement.test.tsx`：無 CSV 鈕；重新整理觸發重讀並保留搜尋字串；loadMore 期間重新整理 disabled；內嵌放大鏡與 Enter 都能送出。e2e：375px 兩頁工具列單行、無橫向溢出、icon 鈕觸控可點 ≥44px、會員頁 placeholder 完整可見 | vitest 綠；e2e 於 CI 綠 |
| 4 | 文件與註解人工同步 | 無機械把關（`check-spec-drift.py` 抓不到），逐項勾下方清單 | 清單全勾；`framework-check.sh` 綠 |

**階段 1 清單**（四個無障礙名稱中只有公告改名，其餘不變；主要處理「管理員設置」的移除與測試本身）：
- [ ] `src/components/AdminDashboard.test.tsx`：`:28` `TAB_LABELS` 去掉「管理員設置」、「公告管理」→「系統公告」、`:39` 註解、`:51-69` 的「五個」措辭與長度斷言
- [ ] `e2e/features/admin_dashboard.feature:3` 描述改四分頁、公告名稱改「系統公告」（:18-19／:26／:34 的名稱不變）
- [ ] `e2e/pages/admin_dashboard_page.py:2-3` docstring（含「系統公告」）；`:31` `tab()` 加 `exact=True`
- [ ] `e2e/test_overflow_sweep.py`：`:594` 標題與 `:598` `_open_tab("公告管理")` → 「系統公告」；移除「管理員設置」SweepRoute（:600-607）與 :359-362 的 `set_admin_setup` 呼叫及註解
      （已核對不在 `e2e/README.md` 必留清單／`check-e2e-mustkeep.py`）
- [ ] `e2e/mocks/backend_api_mock.py:691-721` `set_admin_setup` 刪除（再無呼叫者）
- [ ] `e2e/test_admin_mobile_layout.py`：:63-72 兩列斷言、:209-223 docstring、:226-250 迴圈與 docstring
- [ ] journey（`f50:18`、`f70:151/475`）**不用改**——它們用的名稱不變，且 journey 沒有呼叫端用公告分頁；以 `pytest tools/` 與收尾 grep 確認

**階段 4 文件清單**：
- [ ] 規格書 §13 模組表刪「管理員設定 / `AdminSetup`」列（:630），守門段後補 bootstrap 一句（見 §2）
- [ ] 規格書 §13.1「釘死的 5 欄 grid」（:678）→ 4 欄
- [ ] `docs/supabase-setup-checklist.md` 新增 bootstrap 步驟（§2 的六項）並加進 `:498-518` 快速檢查表
- [ ] `AdminDashboard.tsx:121-145` Tab 註解（3+2、五欄、10.3px 餘裕）改寫成 4 欄＋sr-only 補字的理由
- [ ] `MemberManagement.tsx:228-229`「5 欄 grid」註解 → 4 欄
- [ ] `SystemNotifications.test.tsx:3` 引用 `AdminSetup.test.tsx` 的註解改寫
- [ ] `WithdrawalManagement.tsx:765`「分頁標籤已經寫著『獎金提領管理』」→ 可見字「提領」
- [ ] `e2e/README.md:168` 管理員設置分頁的例子：教訓保留，補「（該分頁已於 S3 移除）」
- [ ] `MaintenanceBanner.tsx:44`、`SystemNotifications.tsx:26`、`SystemNotifications.test.tsx:3` 註解裡的「公告管理」→「系統公告」
- [ ] `App.tsx`：已核對無殘留（母計畫行號失效），不改
- [ ] 確認不用改：`docs/e2e-journey-test-design.md:186`、`.claude/rules/supabase-functions.md:51`、`docs/supabase-setup-checklist.md:461`
- [ ] 看板 `platform-uiux-redesign/progress.md`：`--brand-subtle` 遺留項結案
- [x] 母計畫 `platform-uiux-redesign/plan.md` §0／§2.6／§3 A1／§5 已改為 Q1＝B（`d1e6346`）

## 6. 開放問題

- [x] **Q1** bootstrap → **B 只走 API、GUI 退場**（業主 2026-10-05，#359）
- [x] **Q2** 分頁標籤 → **手機桌機一律可見二字**
- [x] **Q3** 會員管理重新整理鈕 → **加**（S5 快取的手動刷新入口也靠它）
- [x] **R1** 分頁名稱 → **可見二字＋sr-only 補成完整名稱**；公告的完整名稱改為「系統公告」（業主追加裁決），其餘三個名稱不變
- [x] **R2** 會員頁搜尋 → **拿掉獨立送出鈕、輸入框右側內嵌放大鏡 submit、placeholder「搜尋會員」**
- [x] **R3** CSV 防誤觸 → **間距 ≥8px＋名稱含「（含身分證與帳號）」，不加確認框**
- [x] **R4** `App.tsx` 項 → **降 P2，已核對無殘留**

## 7. 風險與回滾

- 分頁名稱漂移 → 晉升 PR 的 `journey-full` 紅。緩解：R1 讓名稱不變；收尾跑
  `grep -rn "AdminSetup\|admin-setup\|管理員設置" src e2e`（只允許 journey builder 與 e2e/README 教訓段）
  及 `grep -rn "獎金提領管理\|會員管理\|公告管理\|系統公告\|系統告警" src e2e`（「公告管理」應歸零；確認呼叫端與 DOM 名稱一致）。
- 全新環境 bootstrap 卡關 → checklist 六項（前置、token、URL、兩種 403、自驗、時機）。
- sr-only span 干擾 ink overflow 量測 → 階段 1 以真瀏覽器驗證；不過則改用 `aria-labelledby` 指向隱藏完整名稱（名稱仍含可見字）。
- 二字標籤量測不過 → 退 2+2，不影響其他階段。
- 純前端＋文件，回滾 ＝ revert PR。
