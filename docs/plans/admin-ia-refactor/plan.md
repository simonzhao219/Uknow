# 後台資訊架構重構（S3：A1＋A2）規劃書

<!-- plans-keep: S3 施工中的三段式鷹架（規劃待人審、實作未開始）；退場條件＝/tdd-implement 收尾、PR 合併前整個 docs/plans/admin-ia-refactor/ 刪除 -->

> 母計畫：`docs/plans/platform-uiux-redesign/plan.md` §2.1／§2.2／§2.6、§3 A1／A2、§5。
> 本檔只寫 S3 的施工細節；母計畫已有的理由不重述。
> **狀態：草稿——§6 開放問題 Q1–Q3 待業主裁決後定稿，再跑 `/review-plan`。**

## 0. 一句話

讓管理員在手機上一眼看到四個分頁、一行用完工具列，因為後台是功能逐個長出來的：
第五個分頁「管理員設置」只是身分展示，而它唯一的功能（bootstrap）其實點不到。

## 1. 使用者需求

- 對照：規格書 §13（`docs/uknow-software-specification.md:620-678`）、§2（:106 `AdminRoute`）；
  `ui-ux-guidelines.md` §1（44px 觸控）、§11.2（視覺權重）。服務 P4（母計畫 §1）。
- 驗收情境：
  1. 管理員 375px 進 `/admin`：**四個分頁排成一列**，標籤不溢字、可點高度 ≥44px；桌機四欄等寬。
  2. 提領管理工具列在 375px **單行**：篩選 Select 吃剩餘寬度＋重新整理 icon 鈕＋CSV icon 鈕，
     兩顆 icon 鈕 44px、有 `aria-label`；桌機同位置帶文字。
  3. 按 CSV 後到檔案出來之前（多頁收集期間），CSV 鈕顯示忙碌且不可再按。
  4. 會員管理工具列用同一個元件：搜尋框吃剩餘寬度＋（Q3）重新整理鈕；**沒有 CSV 鈕**。
  5. bootstrap：依 Q1 裁決的方式可達，並寫進文件。
- 不做（承母計畫 §5）：不動 `supabase/functions/`、不改 API；不把 CSV 匯出複製到會員管理；
  不動會員詳情（A3／S4）、不做快取（A4／S5）；不改 `ui/tabs.tsx` 基底。

## 2. 系統設計

- **無 API 變更**。`GET /admin-setup/check`、`POST /admin-setup/set-self-admin`
  （`api/index.ts:1711-1746`）兩案都保留——journey 的 `admin_bootstrap.py` 依賴它們。
- 子項 A1-a（bootstrap 可達性，**獨立審查子項**）兩案，待 Q1：
  - **案 A｜AdminRoute 例外放行**：`AdminRoute` 在 `isLoggedIn && !isAdmin` 時打一次
    `/admin-setup/check`；`canBecomeAdmin=true` → 不渲染 children，改渲染精簡的
    `AdminBootstrap`（只有「系統尚未有管理員／設為管理員」一張卡），宣告成功後
    `refreshUser()` → `isAdmin` 翻 true → 自然進後台；其餘情況照舊導回 `/dashboard`。
    check 失敗 → fail-closed 導回 `/dashboard`（不因網路錯誤放行）。
    代價：非管理員誤入 `/admin` 多一次請求；本工程唯一的存取閘門行為變更。
  - **案 B｜定案只走 API、GUI 退場**：刪 `AdminSetup.tsx` 與其測試；`AdminRoute` 不動；
    bootstrap 程序寫進 `docs/supabase-setup-checklist.md`（以已登入使用者 token 打
    `POST /api/admin-setup/set-self-admin`，與 journey 同一路徑）。
- 子項 A2：`AdminToolbar` 純呈現元件，資料與動作全由呼叫端以 props 注入（沿用
  `AdminDashboard.tsx` 的「取數在殼層、畫面吃 props」慣例）；CSV 忙碌態是
  `WithdrawalManagement` 的本地 state（`isExporting`），包住既有 `downloadCSV`。

## 3. 架構影響

- 動到：`AdminDashboard.tsx`（Tab 4 欄、標籤、移除 admin-setup）、`admin/AdminSetup.tsx`
  （案 A 改寫成 `AdminBootstrap`／案 B 刪除）、`AdminRoute.tsx`（僅案 A）、
  新增 `admin/AdminToolbar.tsx`、`admin/WithdrawalManagement.tsx`、`admin/MemberManagement.tsx`。
- 路由 lazy 結構不變（`AdminDashboard` 仍 lazy；案 A 的 `AdminBootstrap` 由 `AdminRoute`
  靜態 import——它很小，且只有非管理員誤入時才渲染）。
- 安全：案 A 的放行判準完全來自後端 `canBecomeAdmin`（伺服器算），前端不自行推論；
  宣告本身仍由 `admin_setup_claim` RPC 原子判斷，前端放行錯了也只看到一張卡、拿不到權限。
- 不涉及多步驟流程四契約。

## 4. UI/UX

- **分頁列**：標籤「提領／會員／公告／告警」（Q2 決定桌機是否保留長標籤）；
  `grid-cols-4`（手機桌機同欄數）、保留 `h-auto` 與 `pointer-coarse` 44px 補丁；
  量測依據（375px）：track 337px ÷ 4 = 84.25px，扣 18px 剩約 66px；二字 `text-sm` 約 28px，
  餘裕約 38px（現況三欄只有 10.3px）。**以 e2e 真瀏覽器量測為準**；不過則退 2+2 `grid-cols-2`。
- **AdminToolbar**（母計畫 §2.2）：
  - 版面：`[filter slot（flex-1, min-w-0）][重新整理][CSV?]`，`flex-nowrap` 單行；
    筆數提示（「已顯示 N / M 筆」）移出工具列成下一行小字，不再參與擠壓。
  - icon 鈕：手機 `size-11`（44px）只顯示 icon；桌機（`md:`）帶文字。`aria-label` 一律存在
    （「重新整理」「下載 CSV」），不靠可見文字。
  - 權重：重新整理在前（頻率高），CSV 在最右；兩者皆 `tone="secondary"`。
  - CSV：只在傳入 `onExport` 時渲染；忙碌時 icon 換轉圈、`disabled`、`aria-busy`，
    桌機文字改「匯出中…」。重新整理載入中同樣 `disabled`。
- 空/錯/載入態：不變（列表區各自既有）。

## 5. 階段切分（每階段一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | bootstrap 可達性（依 Q1） | 案 A：`AdminRoute.test.tsx`（jsdom，新）——無管理員時渲染宣告卡、有管理員導回、check 失敗導回、宣告成功後進後台；案 B：`AdminSetup.test.tsx` 刪除＋確認無殘留 import（knip） | `npm run check` 綠 |
| 2 | 四分頁＋短標籤 | `AdminDashboard.test.tsx`（四個分頁、無第五個）；`e2e/test_admin_mobile_layout.py`：兩列斷言改 **1 列**、ink overflow、44px 迴圈改 4；`test_overflow_sweep.py` 移除「管理員設置」項；`admin_dashboard.feature` 與 page object 更新 | vitest 綠；e2e 於 CI 綠 |
| 3 | AdminToolbar 元件 | `admin/AdminToolbar.test.tsx`（jsdom）：無 `onExport` 不渲染 CSV；aria-label 存在；忙碌態 disabled＋aria-busy | vitest 綠 |
| 4 | 套用兩頁＋CSV 忙碌態 | `WithdrawalManagement.test.tsx`：多頁收集期間 CSV 鈕 disabled、完成後恢復；`MemberManagement.test.tsx`：無 CSV 鈕、搜尋仍可送出；e2e 新增「375px 工具列單行、icon 鈕 ≥44px」 | vitest 綠；e2e 於 CI 綠 |
| 5 | 規格書與註解人工同步 | `check-spec-drift.py`（不會抓到，靠清單逐處核對） | 下方清單全勾 |

**階段 5 清單**（母計畫 §2.6，已依現況校正行號）：
- [ ] 規格書 §13 模組表「管理員設定 / `AdminSetup`」列（:630）——案 A 改寫為 bootstrap 例外說明、案 B 刪列並指向 checklist
- [ ] 規格書 §13.1「釘死的 5 欄 grid」句（:678）→ 4 欄
- [ ] `AdminDashboard.tsx:121-148` Tab 註解（3+2、五欄、10.3px 餘裕的量測）改寫
- [ ] `MemberManagement.tsx:229` 同措辭註解（母計畫寫 `App.tsx:71`，現況已不在該處）
- [ ] 案 A 另加：規格書 §2 `AdminRoute` 一行（:106）補例外

## 6. 開放問題（待業主裁決）

- [ ] **Q1 bootstrap 去留**（獨立子項）：案 A 例外放行 vs 案 B 只走 API。
  建議 **B**——理由：正式站與 develop 都已有管理員，bootstrap 只在全新資料庫發生一次，
  而唯一的實際使用者（journey）本來就走 API；GUI 自 `AdminRoute` 上線起就點不到卻無人回報；
  B 讓本工程維持「零權限行為變更」。但 B 推翻 §0 業主「保留條件式引導」的原決策，需業主確認。
- [ ] **Q2 桌機分頁標籤**：全平台一律二字 vs 桌機（`md:`）顯示長標籤。建議一律二字（一套字串、測試與文案不分岔）。
- [ ] **Q3 會員管理的重新整理鈕**：現況該頁沒有重新整理（只有搜尋）。建議**加**（`list.reload` 現成，工具列兩頁一致）。

## 7. 風險與回滾

- 最壞：案 A 放行判準寫錯讓非管理員看到後台殼——緩解：放行只渲染宣告卡、不渲染 children，
  且後端每支 `/admin/**` 仍 `requireAuth + is_admin`。案 B 最壞是全新環境沒人知道怎麼 bootstrap——緩解：checklist。
- 二字標籤量測不過 → 退 2+2，不影響其他階段。
- 純前端，回滾 = revert PR。
