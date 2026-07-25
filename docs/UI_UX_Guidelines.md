# Uknow UI/UX 準則

> **文件定位**：本文件是**前端互動與版面慣例的參照對象**。`/plan-feature` 的
> UI 章節、`plan-reviewer-uiux` 的模式一致性審查都對照這裡——規劃要發明新模式，
> 得先說明為什麼既有模式不適用。
>
> **前提**：規格明訂「以手機瀏覽器為主要優化目標」，使用者幾乎都在手機上
> （LINE 內建瀏覽器佔比高，見 `src/utils/browserDetection.ts`）。
> **桌面思維的設計是缺口，不是風格差異。**
>
> 本文件寫「規則」；規則的執行期真相在元件與測試裡，衝突時以程式碼為準
> 並回頭修本文件。

---

## 1. 尺寸與觸控

| 規則 | 值 | 依據 |
|---|---|---|
| 根字級 | **16px**（`--font-size`，`globals.css`） | 曾是 14px，使全站 rem 尺寸比 Tailwind 設計原意小 12.5% |
| 表單輸入字級 | 手機**明確 16px**、桌機 `md:text-sm` | <16px 時 iOS Safari 聚焦會自動放大整頁 |
| 觸控目標 | 觸控裝置（`pointer-coarse`）**≥ 44px** | Apple HIG 44px / Material 48dp；滑鼠維持精簡密度 |

〔實作〕`src/components/ui/{button,input,select,textarea}.tsx` 以
`pointer-coarse:min-h-[44px]` 達成，**不是**把桌面尺寸一起放大。
新增互動元件比照辦理。

## 2. 樣式基礎

- **Tailwind JIT 已啟用**（`tailwindcss` + `@tailwindcss/vite`）。
  `src/styles/globals.css` 是 design token 的**單一來源**。
- ⚠️ **不要引入預先編譯的 CSS**。專案初期用的是 Figma 匯出的靜態編譯
  `index.css`，任何未預先產生的 class 會**靜默失效**——曾為了一個 OTP 樣式
  手動補 CSS 才發現。token 改動應即時生效，做不到就是有人繞過了 JIT。
- **深色模式**：`.dark` 的 `--card`/`--popover` 需比 `--background` 亮一階
  （0.145→0.205），否則卡片與背景同色、完全沒有層次。
  目前無使用者切換入口（`next-themes` 已具備底層，要開放需補切換 UI）。

## 3. 導覽與資訊架構

**底部導覽（`BottomNav`）契約**——這是釘死在測試裡的 UI/UX 決策，不是實作細節：

1. **只有五格**——超過就開始壓縮拇指熱區。
2. 順序固定 **首頁 → 任務 → 推薦 → 獎勵 → 會員**
   （發現 → 做事賺 → 拉人賺 → 收錢 → 我）。
3. feature flag 只會讓**中間**的格子消失，**絕不改變剩下項目的相對順序**
   ——導覽列在不同帳號狀態下漂移，使用者的位置記憶就失效了。
4. **刊登不在導覽列裡**（主入口在會員中心）。

〔實作/契約〕`src/components/BottomNav.test.tsx` 檔頭。新增會員區入口前
先讀那份契約，再決定放哪。

其他：`Navbar` 為 `sticky`；`Footer` 保留快速連結與聯絡方式；
已登入的功能入口不應只藏在右上頭像下拉裡。

## 4. 表單

- **密碼欄一律用 `PasswordInput`**（眼睛切換，`aria-label`/`aria-pressed`）
  ——手機盲打易錯。
- 補 `autocomplete`（`email` / `current-password` / `new-password`）。
- 送出型表單用 `<form>` 包起來（Enter 送出、瀏覽器行為一致）。
- 錯誤顯示用 `aria-invalid` + `FieldError`。

**表單內的法遵連結一律用就地彈窗**（`LegalDialog` + `LegalMarkdown`），
不換頁、不開新分頁：換頁會卸載整個表單、連同 `useState` 一起蒸發，回來只剩
空白表單；`target=_blank` 在 LINE 等內建瀏覽器會被擋。長表單另以可持久化
來源存草稿（`src/utils/formDraft.ts`）。完整理由見
[`multi-step-flow-recovery.md`](multi-step-flow-recovery.md)。

## 5. 列表與感知效能

- **列表載入用骨架屏**（與卡片同形 + `aria-busy`），不要單一置中 spinner
  ——spinner 等待感強，且資料到位時版面會跳動。`Skeleton` 元件已存在。
  已套用：首頁。可延伸：`MemberDashboard`、獎勵/推薦/後台列表。
- **重新驗證中的清單**（例如切換伺服器端排序）以降透明度 + `aria-busy` 標示，
  保留舊資料，不要清空——避免看似無回應的空窗。
- **不得靜默截斷**：分頁或搜尋只回前 N 筆而不揭露總數，會讓使用者以為
  「找不到」等於「不存在」。要顯示「已顯示 X / Y 筆」並提供載入更多。

## 6. 三態完備

每個新畫面都要規劃**空態 / 錯誤態 / 載入態**——缺態是上線後最常見的 UX 事故。
既有的空狀態與 Toast（手機底部定位 `bottom-4 md:top-4`）可直接沿用。

## 7. 響應式版面策略

- 雙套版面（`md:hidden` / `hidden md:*`）+ Sheet 抽屜，是本專案的成熟模式。
- **手機卡片資訊量不得低於桌面到「只剩照片+名字」的程度**。
  首頁手機版為兩欄資訊卡（照片/性別/名稱/類別/地區）。
- 依賴定位的功能（如距離排序）**只在取得真實定位後才啟用**，
  不要用寫死的座標當預設——對非該地區使用者是誤導。

## 8. 可測試性（Design for Testing）

互動元件一律採「能產生 role」的語意化寫法，與 Playwright（pytest-bdd）的
`get_by_role` 慣例一致：

- 導覽 → `role=navigation` + `NavLink` 的 `aria-current`
- 搜尋框 → `type="search"`（`role=searchbox`）
- 切換鈕 → `role=button`，`name` 隨狀態切換（如「顯示/隱藏密碼」）

只有在 text/role 真的有歧義或依狀態變動時，才在來源元件加 `data-testid`。

## 9. a11y

本 repo 有既有 a11y 債（biome 的 `noSvgWithoutTitle` / `useSemanticElements`
等規則降為 warn，見 [`plans/friction-log.md`](plans/friction-log.md)）。
**不要再添新債**：新互動元件的語意與鍵盤可達性要一起想；碰到的檔案順手
還債（童子軍原則）。

## 10. 溢字/溢版

全站文案是中文，所有溢出行為都建立在中文字寬上。
`e2e/test_overflow_sweep.py` 在 **375px** 下巡檢各路由，目前為 **report-only**
（結果寫進 `test-results/overflow-report.{md,json}`）。新增路由時記得加進
該檔的 `ROUTES`。

---

## 附錄：本準則的來源

各條規則來自一次全面的 UI/UX 盤點（PR #30），當時修掉的問題：

| 嚴重度 | 問題 |
|---|---|
| 🔴 基礎 | 無 Tailwind 建置，跑靜態編譯 CSS，新 class 靜默失效 |
| 🔴 高 | 根字級 14px 使全站 rem 尺寸縮小 12.5% |
| 🔴 高 | 表單輸入 <16px，iOS 聚焦自動縮放 |
| 🔴 高 | 觸控目標過小（按鈕/輸入 ~32–36px） |
| 🔴 高 | 手機無底部導覽；訪客導覽死角 |
| 🔴 高 | 首頁手機卡片資訊過少（僅照片+名字） |
| 🟡 中 | 無關鍵字搜尋 |
| 🟡 中 | 距離排序用寫死台北座標，誤導 |
| 🟡 中 | 深色模式卡片與背景同色、無層次 |
| 🟡 中 | 密碼欄無顯示切換、缺 autocomplete |
| 🟡 中 | 列表載入用單一 spinner，無骨架屏 |
| 🟢 低 | 桌面卡片描述硬截斷 20 字；Navbar 非 sticky |

全數已修。保留此表是為了說明「為什麼這些準則長這樣」——每一條都對應一次
實際踩過的坑，不是憑空的風格偏好。
