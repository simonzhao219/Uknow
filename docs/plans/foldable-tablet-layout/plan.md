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

- 詳情頁：`lg:grid-cols-2` → `md:grid-cols-2`（內容與骨架同步）。768px 時容器 `max-w-4xl` 扣 padding，每欄約 360px，照片正方形約 360px，可接受。另加照片高度上限防禦（`max-h` 搭配寬度）列為 Q1，預設**不加**。
- 首頁卡片：`ListingLink` 加 `block h-full`（桌面卡片傳 className）；`<Card>` 加 `h-full`；描述區 `min-h` 固定兩行（`line-clamp-2` ＋ `min-h-[2.5rem]`），讓同列內部也對齊。
- 空／錯／載入態：骨架與內容同步變更，既有 `test_public_skeleton_layout.py` 守「骨架與載入後同形」。
- `docs/ui-ux-guidelines.md` §7 補：「詳情頁與首頁雙欄起點＝md（768）；摺疊展開態與平板直立依此落在雙欄；新增雙欄版面一律以 md 為起點，除非已證明 <1024 放不下」。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 首頁卡片等高：`ListingLink`／`Card` 撐滿、描述區固定高 | vitest jsdom 斷言 class（`h-full`、`block`）＋ e2e 版面探針：1280×900 與 884×1104 同列兩卡（描述 1 行 vs 2 行）`getBoundingClientRect` 高度與底邊差 ≤2px | 紅：現況高度不同；綠：等高 |
| 2 | 詳情雙欄起點改 md（內容＋骨架） | e2e 版面探針：768×1024、884×1104 下照片欄與資訊欄 `top` 相同（並排）、首屏可見名稱；390 與 1280 不變；`test_public_skeleton_layout.py` 在 884 寬骨架／內容同形 | 紅：768/884 單欄；綠：雙欄 |
| 3 | 回歸與文件：換篇手勢／輪播既有測試全綠、bundle 預算比對、`ui-ux-guidelines.md` §7 補斷點規則 | `npm run check`、`check:full`、`check-spec-drift.py` | 全綠；entry gzip 增量 0 |

e2e 探針比照 `layout_probe.py`／`test_public_skeleton_layout.py`（全 mock、CI 字型、容差 2px、中文全形文字）；視窗用 Playwright `set_viewport_size`，不依賴真機。

## 6. 開放問題

- [ ] Q1 詳情頁照片是否加高度上限（如 `max-h-[70vh]`）？建議**不加**：雙欄後單欄只剩 <768，照片已 ≤768 寬；加上限會讓輪播 `aspect-square` 與圓點列對不齊。
- [ ] Q2 摺疊展開態（≈840–884）首頁要 3 欄嗎？建議**維持 2 欄**：3 欄時每卡 ≈260px，描述 2 行與徽章會擠；需業主以截圖／實機認可。
- [ ] Q3 iPhone 摺疊機尚無公開 CSS 寬，是否以 Pixel Fold／Z Fold 為準？建議是。

## 7. 風險與回滾

- 風險：md 起雙欄時 768px 欄寬偏窄 → 長名稱／聯絡按鈕換行；既有 `wrap-anywhere` 與 `min-w-0` 已處理，e2e 以長名稱夾具量 `scrollWidth`（`overflow_probe.py`）。
- 回滾：純 class 變更，單一 revert 即可。
