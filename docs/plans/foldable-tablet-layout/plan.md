# 摺疊機／平板版面＋首頁卡片對齊 規劃書

<!-- plans-keep: 第 7 波 S3 施工鷹架；退場條件＝/tdd-implement 收尾刪除（斷點規則升級進 docs/ui-ux-guidelines.md §7） -->

## 0. 一句話

這個 feature 讓用摺疊機展開態與平板的訪客，在詳情頁不必捲過整屏正方形照片才看到內容，並讓首頁卡片同列等高對齊，因為這兩處是業主 11/09 親見的版面問題。

## 1. 使用者需求

- 依據：`docs/plans/launch-wave-6/plan.md` §5（業主 11/09 兩則截圖描述）；規格書無斷點規定，以 `docs/ui-ux-guidelines.md` §7 為準。
- 驗收情境：
  1. 寬 768–1023px（摺疊展開 ≈ 840–884、平板直立 768/820/834）開詳情頁：照片與資訊並排雙欄，首屏同時看到名稱／類別／地區。
  2. 首頁桌面網格（≥768px）同列卡片外框等高、底框對齊，不論描述 1 行或 2 行。
  3. <768px 與 ≥1024px 既有行為不變。
- 不做：不改手機雙欄卡片（已 `h-full`）、不改輪播行為、不動後端／資料、不新增斷點 token。

## 2. 系統設計

純前端、無 API／DB 變更。

## 3. 架構影響（現況，行號現算）

- 根因 1：`ServiceProviderDetail.tsx` 內容區 `grid-cols-1 lg:grid-cols-2`（≈301）與 `DetailSkeleton`（≈431）都要 1024px 才雙欄；Tailwind 預設 md=768、lg=1024，摺疊展開態（≈840–884）落在中間 → 單欄，`PhotoCarousel` 是 `aspect-square` 滿欄寬 → 照片 ≈ 880px 高。
- 根因 2：`HomePage.tsx` 桌面 `ServiceProviderCard`（≈1170）的 `<Card>` 無 `h-full`，`ListingLink`（`home/ListingLink.tsx`，`<Link>` 預設 inline）無 `block h-full`；手機版 `MobileServiceProviderCard`（≈1134）有。桌面描述 `line-clamp-2` 但段落高度隨內容 → 卡高不齊。
- 首頁網格 `md:grid-cols-2 lg:grid-cols-3`（≈630、705）：摺疊展開態 2 欄、卡片 aspect-video，尚可；是否改 3 欄列為開放問題 Q2。
- 全為 class 字串變更，**entry JS 不增加**（Tailwind 產出的 CSS 不計入 `check-bundle-budget` 的 entry JS gzip）；不新增元件／匯入，不需放 lazy chunk。階段 1 先量 `npm run build` 前後值確認。
- 與其他功能：換篇手勢（#523）掛在 `PhotoCarousel onEdgeSwipe` 與 `data-browse-content`，雙欄不改 DOM 結構與順序；PostHog 遮罩靠既有 class／屬性，不動。

## 4. UI/UX

- 目標視窗（Playwright viewport，CSS px）：

  | 裝置 | 寬×高 | 預期 |
  |---|---|---|
  | 手機 | 390×844 | 單欄（不變） |
  | 摺疊外螢幕 | 344×882 | 單欄（不變） |
  | 摺疊展開直 | 884×1104 | 詳情雙欄、首頁 2 欄 |
  | Pixel Fold 展開 | 841×701 | 同上 |
  | 平板直 | 768×1024／820×1180 | 詳情雙欄、首頁 2 欄 |
  | 平板橫 | 1024×768／1180×820 | 雙欄、首頁 3 欄（不變） |
  | 邊界 | 767×1024 | 詳情單欄、首頁只顯示手機版（`md:hidden` 那套） |
  | 邊界 | 768×1024 | 詳情雙欄、首頁只顯示桌面版 2 欄 |
  | 邊界 | 1023×768 | 詳情雙欄、首頁 2 欄 |
  | 手機橫放 | 844×390 | 落在 md 以上 → 詳情雙欄、首頁桌面版（預期且接受；探針只驗不橫向溢出） |

- 詳情頁：`lg:grid-cols-2` → `md:grid-cols-2`（內容與骨架同步）。768px 時容器 `max-w-4xl` 扣 padding，每欄約 360px，照片正方形約 360px，可接受。**不加照片高度上限**（業主 W7-11 裁決）；改以 841×701 探針斷言名稱／類別／地區底邊 ≤ viewport 高度。≥768 起 `BottomNav`（`md:hidden`）消失、改桌面導覽，業主接受（W7-11，既有行為）。
- 首頁卡片（沿用手機版 `MobileServiceProviderCard` 的 `block h-full`＋`Card h-full` 模式）：桌面呼叫處傳 `className="block h-full"`（`ListingLink` 本身不動）；`<Card>` 加 `h-full`；`CardContent` 改 `flex flex-col h-full`、地區列加 `mt-auto`——底部對齊靠結構，不靠行高常數（不用 `min-h-[2.5rem]`）。描述為空時仍成立。
- **先量測現況**：grid item 預設 stretch，外框現況可能已等高、真正不齊的是內部地區列。階段 1 先用探針量現況（卡片底邊＋地區列 `top`），紅燈以量測到的差異為準；若外框已等高，只修內部對齊並記入 progress.md。
- 空／錯／載入態：骨架與內容同步變更，既有 `test_public_skeleton_layout.py` 守「骨架與載入後同形」。**該探針現況寫死 `className.includes('lg:grid-cols-2')`（≈43 行；75、172 行訊息亦同）且只參數化 `[375, 1280]`**：階段 2 同 commit 把選擇器改為穩定錨點（`data-browse-content`／`md:grid-cols-2`）、寬度擴為 `[375, 767, 768, 884, 1280]`。
- `PhotoCarousel` 箭頭為 `lg:flex`（≈99 行）：768–1023 雙欄時只有滑動與圓點，維持 lg 為有意（觸控裝置為主），寫進 §7 新規則；階段 2 先 grep `ServiceProviderDetail` 與子元件的 `lg:` 用法盤點。
- `docs/ui-ux-guidelines.md` §7 補：「詳情頁與首頁雙欄起點＝md（768）；摺疊展開態與平板直立依此落在雙欄；新增雙欄版面一律以 md 為起點，除非已證明 <1024 放不下」。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 首頁卡片等高：桌面呼叫處 `block h-full`、`Card h-full`、`CardContent flex-col`＋地區列 `mt-auto` | e2e 版面探針（紅燈證據只算 e2e；vitest 僅輔助斷言桌面 `<a>`／`Card` 的 class）：1280×900、884×1104 同列兩卡（描述 1 行／2 行／無描述）量卡片底邊與地區列 `top` 差 ≤2px；先確認 `build_public_listing` 支援不同描述長度 | 紅：以現況量測到的差異為準；綠：差 ≤2px |
| 2 | 詳情雙欄起點改 md（內容＋骨架）＋改寫 `test_public_skeleton_layout.py` 探針（選擇器、寬度矩陣） | e2e 版面探針：768×1024、884×1104、1023×768 照片欄與資訊欄 `top` 相同；841×701、768×1024、884×1104 名稱／類別／地區 `bottom ≤ viewport 高度`；767 單欄、390 與 1280 不變；首頁 767／768 只有一套可見；長名稱（10 全形字）＋長 URL 聯絡夾具於 768、841 量 `scrollWidth`（`overflow_probe`）；骨架與內容同形於 884 | 紅：768/884 單欄；綠：雙欄且首屏可見 |
| 3 | 回歸與文件：換篇手勢／輪播既有測試全綠、bundle 預算比對、`ui-ux-guidelines.md` §7 補斷點規則（md 起雙欄、導覽仍依 md、箭頭維持 lg、不追溯既有頁面） | `npm run check`、`check:full`、`check-spec-drift.py` | 全綠；**不超預算**（W7-12：總 JS raw 僅剩約 11 B 餘裕、entry gzip 316.2／316.5；撞限時不自行放寬，附實測回報主 session 授權） |

e2e 探針比照 `layout_probe.py`／`test_public_skeleton_layout.py`（全 mock、CI 字型、容差 2px、中文全形文字）；視窗用 Playwright `set_viewport_size`，不依賴真機。

## 6. 開放問題（已由業主裁決）

- [x] Q1 詳情頁照片不加高度上限（業主 2026-11-24 互動選項，主 session 轉達 W7-11）。
- [x] Q2 摺疊展開首頁維持 2 欄（W7-11）。依據：884px 時 2 欄每卡約 400px、3 欄約 260px，名稱列同時放性別與類別徽章（`max-w-[45%]`）會擠。
- [x] Q3 以 Pixel Fold／Z Fold 為準（iPhone 摺疊機尚無公開 CSS 寬）。

## 6b. 範圍補充

- 其他頁面的 `lg:grid-cols-2` 不在本次範圍；§7 新規則是向前規定，不追溯既有頁面。

## 7. 風險與回滾

- 風險：md 起雙欄時 768px 欄寬偏窄 → 長名稱／聯絡按鈕換行；既有 `wrap-anywhere` 與 `min-w-0` 已處理，e2e 以長名稱夾具量 `scrollWidth`（`overflow_probe.py`）。
- 回滾：純 class 變更，單一 revert 即可。
