# 刊登照片保存期限（listing-photo-retention）實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/listing-photo-retention`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 即時路徑引用語意改成「僅本人刊登」 | ⬜ 未開始 | | |
| 2 | 判準 RPC `list_orphan_listing_photos`（＋Q2 撤 `listings_delete_own`） | ⬜ 未開始 | | |
| 3 | `sweepOrphanPhotos` 純函式 | ⬜ 未開始 | | |
| 4 | 端點 `POST /internal/purge-orphan-listing-photos` | ⬜ 未開始 | | |
| 5 | 排程 workflow `purge-listing-photos.yml` | ⬜ 未開始 | | |
| 6 | 規格書 §11 改寫、刪 §14 第 14 列 | ⬜ 未開始 | | |

## 目前位置與下一步

第 2 波只做規劃：plan v2.3、review 三輪（三輪皆 P0 0；第三輪 P1 7 條，6 條已在 v2.3 處理，停權 1 條列為 Q11）。等業主裁決 Q11，之後第 3 波由業主親打
`/tdd-implement listing-photo-retention` 開工；開工前先 rebase 到最新 develop，再跑 `check-migration-versions.py`。

## Blockers(逃生口紀錄)

## 框架摩擦
