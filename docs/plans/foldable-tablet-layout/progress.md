# 摺疊機／平板版面 實作進度

<!-- plans-keep: 第 7 波 S3 施工鷹架；退場條件＝/tdd-implement 收尾刪除 -->

分支:`feature/foldable-tablet-layout`
規劃書:`./plan.md`|審查:`./review.md`

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 首頁卡片等高 | ✅ 綠 | e2e30589 | (本 commit) |
| 2 | 詳情雙欄起點改 md | ✅ 綠 | dbde6fb0 | (本 commit) |
| 3 | 回歸與文件 | ⬜ 未開始 | | |

## 目前位置與下一步

階段 2 綠。下一步階段 3：ui-ux-guidelines §7 補斷點規則、npm run check:full、bundle 預算比對、/review-implementation、清理規劃檔、開 PR。

階段 1 量測（紅燈前現況）：格線項（<a>）底邊已等高（stretch），不齊的是 Card 底邊（621/641/661）與地區列 top（560/580/600）→ review 需人工裁決 A：reviewer 判斷屬實，外框 Card 與內部地區列皆不齊。

## Blockers(逃生口紀錄)

- 階段 2 實作偏離（需在 PR「偏離規劃說明」記錄）：10 全形字名稱在 md–lg 雙欄的 356px 資訊欄以 `md:text-3xl`（30px）會換行（h1 寬 298px＋徽章），骨架（單行 h-9）與內容差 36px，`test_public_skeleton_layout.py` 在 768／884 紅。處置：名稱字級改 `lg:text-3xl`（md–lg 區間維持 `text-2xl`），骨架 `lg:h-9`、徽章 `lg:mt-2` 同步。只影響 768–1023 的標題字級（原本該區間單欄用 3xl）。

## 框架摩擦

無
