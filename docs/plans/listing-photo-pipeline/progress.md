# 刊登照片上傳管線 實作進度

分支：`feature/listing-photo-pipeline`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| PR | # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|---|
| 1 後端清理 | 1-1 | listing-photos.ts 純函式 | ✅ 綠 | 48e766f1 | （見 git log） |
| 1 | 1-2 | DELETE /listings/photos、/listings/:id 路由 | ✅ 綠（整合測試 `listing-photos.test.ts` 本機無 supabase CLI 未跑，交 CI api-tests） | 091f879c | （見 git log） |
| 1 | 1-3 | listingPhotosApi＋Edit diff 刪＋管理頁改走後端 | ✅ 綠 | 29f773bf | （見 git log） |
| 1 | 1-4 | e2e 同步（刪刊登走後端 mock，4 情境） | ✅ 綠（本機 Playwright 跑過 listing_management 14 情境）；journey 刪刊登步驟走 UI，無需改 | （e2e 補測，無獨立紅燈） | （見 git log） |
| 1 | 1-5 | 文件（規格書 §11／§14、ui-ux §7、supabase-functions.md） | ⬜ 未開始 | | |
| 2 前端管線 | 2-1 | apiRequest 支援 FormData | ⬜ 未開始 | | |
| 2 | 2-2 | imageGeometry／imagePipeline | ⬜ 未開始 | | |
| 2 | 2-3 | useListingPhotos＋uploadListingPhoto | ⬜ 未開始 | | |
| 2 | 2-4 | PhotoPicker／PhotoCropDialog 接 Create／Edit | ⬜ 未開始 | | |
| 2 | 2-5 | e2e／journey page object 同步 | ⬜ 未開始 | | |
| 2 | 2-6 | 文件與 bundle 閘門 | ⬜ 未開始 | | |

## 目前位置與下一步

PR 1 實作中（業主 2026-10-27 親打 /tdd-implement，review.md 已勾通過，僅授權 PR 1）；1-1～1-3 綠；1-4 e2e 綠；下一步 1-5 文件，再 `npm run check:full`、`/review-implementation`、PR。業主親打 `/tdd-implement listing-photo-pipeline` 才開始實作。

## 偏離規劃（記入 PR 描述）

- 404 標記改用物件信封 `{success:false,error:{code:'not_found'}}`：前端 `extractApiErrorCode` 只讀 `error.code`，plan 寫的頂層 `code` 讀不到。
- 新端點錯誤信封一律 `{success:false,error:{code,message}}`（同 referral-invite），與 upload-photo 的字串信封不同；前端 `extractApiErrorMessage` 兩種都吃。
- 規劃檔留到 PR 2 收尾再清（PR 2 依賴 plan.md；plans-keep 已宣告退場條件）。

## Blockers(逃生口紀錄)

（無）

## 框架摩擦

（無）
