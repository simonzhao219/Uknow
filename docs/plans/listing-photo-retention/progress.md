# 刊登照片保存期限（listing-photo-retention）實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/listing-photo-retention`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 即時路徑引用語意改成「僅本人刊登」 | ✅ 完成 | `e7101e1f` | `7e7ab18b` |
| 2 | 判準 RPC `list_orphan_listing_photos`（＋Q2 撤 `listings_delete_own`） | ✅ 完成 | `109b1afc` | `8948cd1b` |
| 3 | `sweepOrphanPhotos` 純函式 | ✅ 完成 | `e494f0f5` | `61a799a0` |
| 4 | 端點 `POST /internal/purge-orphan-listing-photos` | ✅ 完成 | `e0603b0c` | （本 commit） |
| 5 | 排程 workflow `purge-listing-photos.yml` | ⬜ 未開始 | | |
| 6 | 規格書 §11 改寫、刪 §14 第 14 列 | ⬜ 未開始 | | |

## 目前位置與下一步

第 2 波只做規劃：plan v2.4、review 三輪（P0 0；P1 全數處置，Q1–Q11 都已裁決）。等主 session 核對與業主人審，之後第 3 波由業主親打
`/tdd-implement listing-photo-retention` 開工；開工前先 rebase 到最新 develop，再跑 `check-migration-versions.py`。

## 實作決策（給 /review-implementation 對照）

- 第二支 RPC `filter_unreferenced_listing_photos(p_public_base, p_names)` 依 plan 簽章不帶寬限期參數，所以寬限期寫死在 SQL（`168 hours`），
  定位為 `ORPHAN_GRACE_HOURS` 的**下限**；階段 4 定義常數時加一條 unit 測試讀 migration 原文比對，防兩邊漂移。
- 斷路器在 dry-run 也生效（每日 dry-run 先暴露問題）；業主要看被比例閘擋下的清單時，curl 帶 `force_ratio: true, dry_run: true`
  （階段 6 寫進 SOP）。`SweepOptions` 因此多一個 `forceRatio` 欄位（plan 的介面沒列，但 §2.2 第 2 點需要它）。
- `_listing_photo_is_orphan` 不加 `set search_path`／`security definer`，planner 才能內聯（plan 寫「可內聯」）；內部全 schema-qualified。

- 階段 4 在 plan 的 unit 落點之外，加了一條 DB 測試（`listing-photo-orphans.test.ts`）走真路由＋真 RPC 的 dry-run：
  index.ts 的 wiring（RPC jsonb 轉 camelCase、`` `${ORPHAN_GRACE_HOURS} hours` ``）在 unit 層驗不到。
- 失敗回應的 `message` 是依 `code` 給的固定文案，不帶 Storage 錯誤字串（可能含 uid）；細節只進 Edge log。

## 本機環境備註

- 本機 `supabase start`（CLI 2.122）的預設權限比 CI 寬：`rls-policies.test.ts` 的「anon 沒有寫入權」與
  `name-write-paths.test.ts` 的「authenticated 無 profiles table-level SELECT」兩條在本機紅，階段 1 之前（未動 migration）就紅，與本案無關。

## Blockers(逃生口紀錄)

- 階段 4 紅燈 `e0603b0c` 有兩個測試瑕疵，綠燈後以獨立 `test:` commit 修正（只改名稱與測試隔離，斷言不變）：
  ① 兩個測試名超過 72 字（`check-test-names.py` 經 `| tail` 吃掉失敗碼，沒擋下 commit）；
  ② 真路由 dry-run 測試以 `Deno.env.set` 覆寫 `RECONCILE_SECRET` 沒還原，害同行程的 `system-alerts-recent.test.ts` 401。

## 框架摩擦
