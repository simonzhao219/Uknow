# 後台資訊架構重構（S3）實作審查報告

<!-- plans-keep: S3 收尾前的實作審查證據；退場條件＝規劃檔清理 commit 一併刪除（結論已摘要進 PR 描述） -->

> 審查對象：`git diff origin/develop...HEAD`（S3 四階段 + 文件）。四個 fresh-context reviewer 平行審查，2026-10-05。
> 註：四位 reviewer 都沒有 Bash，改讀工作樹現況比對 plan／progress，未逐 hunk 讀 diff（各自已聲明）。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 4 | 分頁名稱跨層契約（aria-labelledby＋exact）、usePagedList 會員頁、bootstrap 其餘事實、權限與資料層 |
| 架構 | 0 | 1 | 3 | 模組邊界、純呈現＋props 注入、Button size/tone、測試落點與命名 |
| UI/UX | 0 | 2 | 4 | 四分頁、工具列一行與 44px、名稱由文字承擔、CSV 忙碌態、三態、§12.11 |
| 需求 | 0 | 0 | 4 | 驗收 1–5 皆有測試或證據、階段 4 清單全勾、無範圍蔓延 |

**偏離 plan**：progress.md Blockers 已記錄 4 條，四位都核對吻合。未記錄的偏離：系統 #1（checklist 措辭與實際行為不符）、
架構 #3（放大鏡送出鈕沒走原語、未達 44px、未記錄）。

## 發現清單（依嚴重度排序，去重）

### P1
1. **[P1]〔A1-a／checklist 步驟 7〕前置寫「資料沒補完 RPC 會回 not_found」與實際不符**（系統）——`admin_setup_claim` 對空白 profile
   照樣成功並用掉首位名額（`20260718000102_admin_members_announcements.sql:158-163`），之後前端資料守衛擋住 `/admin`。
   → **已修**：前置改寫為「API 不檢查、先補完再宣告」；403 的第二種意義改為「連 profile 列都沒有」。
2. **[P1]〔A2／提領頁重新整理〕`isRefreshing={isLoading}` 沒帶 `isLoadingMore`**（系統；架構 P2 同點）——同會員頁的交錯問題，
   這頁是批次匯款依據。→ **已修**：`isLoading || isLoadingMore`，新增測試（拿掉修正會紅）。
3. **[P1]〔§4 會員頁 filter slot〕內嵌放大鏡 40px 寬，觸控未達 44px、e2e 沒量到**（UI/UX；架構 P1、系統 P2 同點）——
   → **已修**：`pointer-coarse:w-11`＋`pointer-coarse:pr-11`；e2e 新增放大鏡觸控可點範圍斷言。仍用原生 `<button>`（Button 原語的
   size 會撐高、無法貼齊輸入框），記入偏離。
4. **[P1]〔§4／WCAG 2.5.3〕搜尋框 aria-label 不含可見的「搜尋會員」**（UI/UX；架構列 P2）〔reviewer 標需人工裁決〕——
   → **已修**：改成「搜尋會員（姓名、Email 或電話）」，名稱含可見字。

### P2
5. **[P2]〔CSV〕重新整理進行中仍可按匯出（total 是舊值）**（系統）→ **已修**：`canExport` 加 `!isLoading`。
6. **[P2]〔checklist〕回應表沒寫 401／500**（系統）→ **已修**：補 401（重新登入取 token）、500（看日誌）。
7. **[P2]〔驗收 2〕「兩鈕間距 ≥8px」只靠 class**（需求）→ **已修**：e2e 斷言工具列相鄰元件間距 ≥8px。
8. **[P2]〔殘留措辭〕「五個分頁」**：`e2e/layout_probe.py:10,44`、`test_admin_mobile_layout.py:4,12`、`e2e/README.md:61`（需求）→ **已修**。
9. **[P2]〔AdminToolbar.tsx:22〕`md:pointer-coarse:w-auto` 未說明**（架構）→ **已修**：補註解。
10. **[P2]〔錯誤路徑〕匯出失敗／超限走 `setLoadError`，整張列表換成錯誤區，「重試」是重讀列表不是重匯**（系統＋UI/UX）——沿用既有耦合、
    plan 寫「沿用既有」，不影響資料正確。→ **未修，列 PR 偏離說明／S5 一併處理**〔需人工裁決是否本 PR 動〕。
11. **[P2]〔AdminToolbar〕重新整理 disabled 後焦點掉、無狀態宣告**（UI/UX）→ 未修，列 S5（快取改 SWR 後刷新不再換骨架，屆時一併設計）。
12. **[P2]〔完成回報〕「已匯出 N 筆」callout 在工具列上方出現，造成版面位移**（UI/UX）→ 未修，可接受。
13. **[P2]〔§12.12〕放大鏡焦點環與 `type="search"` 原生清除鈕的實機目視**（UI/UX）→ 列入驗收站 2 目視項。
14. **[P2]〔progress.md／plan.md〕`plans-keep` 註解過時**（需求＋架構）→ 規劃檔清理時一併刪除。
15. **[P2]〔後端註解〕`api/index.ts:1046` 仍寫「公告管理」**（需求）→ plan 明示不動後端，忽略。

## 需人工裁決

1. 第 10 條：匯出錯誤是否在本 PR 改成獨立錯誤狀態（不換掉列表）。建議留給 S5（同一批 admin 狀態層改動）。
2. 第 4 條原標需人工裁決，已採 reviewer 建議修正（名稱含可見字），如業主不同意可回退。

## 處置

- P0：無。P1×4 全數修正（`fix` commit），P2 修 5 條、其餘列 PR／S5／驗收站。
