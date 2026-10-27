# 刊登照片上傳管線 實作進度

分支：`feature/listing-photo-pipeline`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| PR | # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|---|
| 1 後端清理 | 1-1 | listing-photos.ts 純函式 | ⬜ 未開始 | | |
| 1 | 1-2 | DELETE /listings/photos、/listings/:id 路由 | ⬜ 未開始 | | |
| 1 | 1-3 | listingPhotosApi＋Edit diff 刪＋管理頁改走後端 | ⬜ 未開始 | | |
| 1 | 1-4 | 文件（規格書 §11、ui-ux §7） | ⬜ 未開始 | | |
| 2 前端管線 | 2-1 | apiRequest 支援 FormData | ⬜ 未開始 | | |
| 2 | 2-2 | imageGeometry／imagePipeline | ⬜ 未開始 | | |
| 2 | 2-3 | useListingPhotos＋uploadListingPhoto | ⬜ 未開始 | | |
| 2 | 2-4 | PhotoPicker／PhotoCropDialog 接 Create／Edit | ⬜ 未開始 | | |
| 2 | 2-5 | e2e／journey page object 同步 | ⬜ 未開始 | | |
| 2 | 2-6 | 文件與 bundle 閘門 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃第二版（兩 PR）已依業主裁決改寫，待重跑 `/review-plan` 與業主審；業主親打 `/tdd-implement listing-photo-pipeline` 才開始實作。

## Blockers(逃生口紀錄)

（無）

## 框架摩擦

（無）
