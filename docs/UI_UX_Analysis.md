# Uknow 前端 UI/UX 分析與優化報告

> 對象：Uknow 專業服務媒合平台前端。規格明訂「以手機瀏覽器為主要優化目標」。
> 本報告盤點手機/桌面體驗的問題，並記錄本次（PR #30）的對應優化。
> 分析涵蓋技術棧：React 18 + Vite 6 + TypeScript、Tailwind v4、shadcn/ui（Radix）、Supabase。

## 摘要

| 嚴重度 | 問題 | 狀態 |
|---|---|---|
| 🔴 基礎 | 無 Tailwind 建置，跑靜態編譯 CSS，新 class 靜默失效 | ✅ 已修 |
| 🔴 高 | 根字級 14px 使全站 rem 尺寸縮小 12.5% | ✅ 已修 |
| 🔴 高 | 表單輸入 <16px，iOS 聚焦自動縮放 | ✅ 已修 |
| 🔴 高 | 觸控目標過小（按鈕/輸入 ~32–36px） | ✅ 已修 |
| 🔴 高 | 手機無底部導覽；訪客導覽死角 | ✅ 已修 |
| 🔴 高 | 首頁手機卡片資訊過少（僅照片+名字） | ✅ 已修 |
| 🟡 中 | 無關鍵字搜尋 | ✅ 已修 |
| 🟡 中 | 距離排序用寫死台北座標，誤導 | ✅ 已修 |
| 🟡 中 | 深色模式卡片與背景同色、無層次 | ✅ 已修 |
| 🟡 中 | 密碼欄無顯示切換、缺 autocomplete | ✅ 已修 |
| 🟡 中 | 列表載入用單一 spinner，無骨架屏 | ✅ 已修（首頁） |
| 🟢 低 | 桌面卡片描述硬截斷 20 字 | ✅ 已修 |
| 🟢 低 | Navbar 非 sticky | ✅ 已修 |

---

## 詳細問題與對應

### 🔴 樣式基礎：無 Tailwind 建置
- **問題**：`src/main.tsx` 原引入 Figma 匯出的**靜態編譯** `index.css`；`package.json` 無 `tailwindcss`，
  `vite.config.ts` 無 plugin。任何未預先產生的 class 會靜默失效（近期 PR 29 需手動補 OTP 的 CSS 才修好）。
  `src/styles/globals.css`（token 來源）從未被 import，等同死檔。
- **對應**：加入 `tailwindcss` + `@tailwindcss/vite`，`globals.css` 成單一來源、刪除靜態 `index.css`，
  `package.json` 加 `type: module`。JIT 恢復後所有 class 自動產生，token 改動即時生效。

### 🔴 根字級與 iOS 縮放
- **問題**：`html { font-size: 14px }`（`globals.css`）使 `text-base`(1rem)=14px，所有 rem 尺寸比
  Tailwind 設計原意小 12.5%（`h-9` 標示 36px、實際 31.5px）；輸入框 <16px 時 iOS Safari 聚焦會自動放大。
- **對應**：根字級改 16px（對齊字階、手機更好讀）；表單輸入手機明確 16px、桌機 `md:text-sm`。

### 🔴 觸控目標
- **問題**：Button/Input 預設 `h-9`、`sm` `h-8`，換算後僅 ~31.5px，低於 44px（Apple HIG）/48dp（Material）。
- **對應**：Button/Input/Select/Textarea 於觸控裝置（`pointer-coarse`）達 44px；滑鼠維持精簡密度。
  `src/components/ui/{button,input,select,textarea}.tsx`。

### 🔴 導覽
- **問題**：手機無底部拇指區導覽；訪客 Navbar 只有登入/刊登、`Footer` 快速連結整段被註解；
  已登入功能全藏右上頭像下拉。
- **對應**：新增 `BottomNav`（登入會員手機底部導覽，語意 `<nav>`/`NavLink`，active 自動帶
  `aria-current`）；`Footer` 復原快速連結與聯絡；`Navbar` 改 `sticky`。

### 🔴 / 🟡 首頁列表
- **問題**：手機卡片只有照片+名字（3 欄方格），資訊遠少於桌面；無關鍵字搜尋；
  距離排序用寫死的台北市政府座標，對非台北使用者誤導。
- **對應**：手機改兩欄資訊卡（照片/性別/名稱/類別/地區）；新增 `type="search"` 搜尋框（比對名稱/介紹/標籤）；
  距離排序改為僅在取得真實定位後才啟用，否則保留最新排序。`src/components/HomePage.tsx`。

### 🟡 深色模式
- **問題**：`.dark` 的 `--card`/`--popover` 與 `--background` 同色，卡片無層次；`--destructive-foreground` 紅底紅字對比低。
- **對應**：card/popover 提亮一階（0.145→0.205）、destructive 文字改近白。`src/styles/globals.css`。

### 🟡 表單
- **問題**：密碼欄無顯示切換（手機盲打易錯）、輸入缺 `autocomplete`。
- **對應**：新增 `PasswordInput`（眼睛切換，`aria-label`/`aria-pressed`）；補 autocomplete
  （email / current-password / new-password）；Email 步驟改 `<form>`。

### 🟡 感知效能
- **問題**：列表載入用單一置中 spinner，等待感強、資料到位版面跳動；`Skeleton` 元件已存在但未用。
- **對應**：首頁載入改與卡片同形的骨架屏（`aria-busy`）。同一模式可延伸至 `MemberDashboard`、
  獎勵/推薦/後台列表（後續）。

---

## 既有優點（保留）

- 響應式雙套版面（`md:hidden`/`hidden md:*`）+ Sheet 抽屜策略成熟。
- Toast 手機底部定位（`bottom-4 md:top-4`）。
- 空狀態、表單欄位錯誤（`aria-invalid` + `FieldError`）、Button `loading` 與 `focus-visible` 焦點環一致完整。

## 可測試性（Design for Testing）

所有新增互動元件皆採「能產生 role」的語意化寫法，與現有 Playwright（pytest-bdd）
`get_by_role` 慣例一致：底部導覽 `role=navigation` + `NavLink` 的 `aria-current`、
搜尋框 `role=searchbox`、密碼切換 `role=button` 且 `name` 在「顯示/隱藏密碼」間切換。

## 後續建議（本 PR 未含）

- 骨架屏延伸到其餘列表頁。
- 首頁定位可加「附近」開關與權限說明，而非載入即請求。
- 深色模式若要開放使用者切換，需補主題切換入口（目前 `next-themes` 已具備底層）。
