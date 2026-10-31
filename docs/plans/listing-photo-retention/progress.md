# 刊登照片保存期限（listing-photo-retention）實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/listing-photo-retention`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 即時路徑引用語意改成「僅本人刊登」 | ✅ 完成 | `ea0eae74` | `31c9d9e1` |
| 2 | 判準 RPC `list_orphan_listing_photos`（＋Q2 撤 `listings_delete_own`） | ✅ 完成 | `619cf029` | `1ff4c355` |
| 3 | `sweepOrphanPhotos` 純函式 | ✅ 完成 | `b0324884` | `cf0e5fe5` |
| 4 | 端點 `POST /internal/purge-orphan-listing-photos` | ✅ 完成 | `a8873420` | `d5f1d5f8`（測試修正 `fc0400f1`） |
| 5 | 排程 workflow `purge-listing-photos.yml` | ✅ 完成 | `2cc3ab03` | `3b89bca1` |
| 6 | 規格書 §11 改寫、刪 §14 第 14 列 | ✅ 完成 | `83a17091` | `eb4dea37` |
| 審 | `/review-implementation` 修正（`implementation-review.md`） | ✅ 完成 | `6d3dbbcc` | （本 commit） |

## 目前位置與下一步

六階段與實作審查修正全數完成。下一步：決策升級進正式文件後清理本目錄、更新 PR #453。PR 在 11/03 晉升 PR 合進 main
之前不轉 ready、不合併。

## 實作決策（給 /review-implementation 對照）

- 第二支 RPC `filter_unreferenced_listing_photos(p_public_base, p_names)` 依 plan 簽章不帶寬限期參數，所以寬限期寫死在 SQL（`168 hours`），
  定位為 `ORPHAN_GRACE_HOURS` 的**下限**；階段 4 定義常數時加一條 unit 測試讀 migration 原文比對，防兩邊漂移。
- 斷路器在 dry-run 也生效（每日 dry-run 先暴露問題）；業主要看被比例閘擋下的清單時，curl 帶 `force_ratio: true, dry_run: true`
  （階段 6 寫進 SOP）。`SweepOptions` 因此多一個 `forceRatio` 欄位（plan 的介面沒列，但 §2.2 第 2 點需要它）。
- `_listing_photo_is_orphan` 不加 `set search_path`／`security definer`，planner 才能內聯（plan 寫「可內聯」）；內部全 schema-qualified。

- 階段 4 在 plan 的 unit 落點之外，加了一條 DB 測試（`listing-photo-orphans.test.ts`）走真路由＋真 RPC 的 dry-run：
  index.ts 的 wiring（RPC jsonb 轉 camelCase、`` `${ORPHAN_GRACE_HOURS} hours` ``）在 unit 層驗不到。
- 失敗回應的 `message` 是依 `code` 給的固定文案，不帶 Storage 錯誤字串（可能含 uid）；細節只進 Edge log。

- 階段 5：body 改由 `purge-listing-photos-request.py body` 產生（plan §2.5 前段寫 `jq -n --argjson`，後段把組裝抽進腳本，取後者）。
  vars 的 ref 檢查兩個環境同款：ref 取自 git，vars 有設才要求一致（`reconcile-payments.yml` 對正式站要求 vars 必設，因為它的
  URL 用 vars；本 workflow 的 URL 用 git 的 ref）。排程時間台北 03:17（`17 19 * * *` UTC）。

- 階段 6：`check-spec-drift.py` 新增「刊登照片孤兒寬限期（小時）」常數規則（規格書「寬限期 168 小時」↔
  `ORPHAN_GRACE_HOURS`），綠燈時順手把 `listing-photos.ts` 加進來源清單（紅燈 commit 漏了，規則抽不到程式碼那側）。
  突變驗證：規格書改 169 → 紅。README 突變表那列改以 `listings_update_own` 改 restrictive 在本機重驗（被「四條全是 permissive」抓到）。

- hash 註記：收尾 `git fetch` 時 hook 自動 rebase 到最新 develop，表內 hash 已依 commit 標題重新對應為 rebase 後的值。
- 審查修正（P1×4 全修、P2 除「progress 目前位置」外全修）：斷路器 500 回應加 `error.reason`（`anchor`／`ratio`）；回應與
  workflow 摘要加 `orphanTotal`；`sweepOrphanPhotos` 對 NaN 統計 fail-closed；`judge` 加 `--sent-file`，本輪送
  `dry_run: false` 遇 404 也判失敗；狀態碼正規化（curl 失敗不再輸出兩次 000）；issue 內文補齊各 code 處置；規格書 §11
  補「未開實刪＝不刪檔、開前由業主核對」、分輪依 `orphanTotal`、curl 的 ref 來源與 export、SOP 先確認開關、
  `returning id`，去掉鷹架編號 W2-5；develop 的 `RECONCILE_SECRET` 須與正式站同值寫進 workflow 檔頭與
  `supabase-setup-checklist.md`；SQL 與 `ORPHAN_GRACE_HOURS` 的關係改述為「必須相等」（與測試一致）。
- 未列在 plan 的連動（審查指出、補記）：`docs/e2e-journey-test-design.md` 兩處 policy 數改為四條；階段 1 的 DB 測試以真
  Storage 上傳＋`bucket.list` 驗證取代 plan 寫的 `removeObjects` spy（驗證力更強）；第二支 RPC join `storage.objects`，
  不存在的 name 會被剔除（比 plan 更保守）。

## 本機環境備註

- 本機 `supabase start`（CLI 2.122）的預設權限比 CI 寬：`rls-policies.test.ts` 的「anon 沒有寫入權」與
  `name-write-paths.test.ts` 的「authenticated 無 profiles table-level SELECT」兩條在本機紅，階段 1 之前（未動 migration）就紅，與本案無關。

## Blockers(逃生口紀錄)

- 階段 4 紅燈 `e0603b0c` 有兩個測試瑕疵，綠燈後以獨立 `test:` commit 修正（只改名稱與測試隔離，斷言不變）：
  ① 兩個測試名超過 72 字（`check-test-names.py` 經 `| tail` 吃掉失敗碼，沒擋下 commit）；
  ② 真路由 dry-run 測試以 `Deno.env.set` 覆寫 `RECONCILE_SECRET` 沒還原，害同行程的 `system-alerts-recent.test.ts` 401。

- 審查修正紅燈 `6d3dbbcc` 漏改一條既有斷言：`sweepOrphanPhotos` 實刪測試精確比對 `SweepResult`，加 `orphanTotal` 後
  期望物件少一欄而型別錯。經 `tdd-unlock`（`npm run check` 綠屬實；它不含 Deno）解鎖後，只在該期望物件補
  `orphanTotal: 3`，其餘斷言不動。

## 框架摩擦

- `tdd-unlock.sh` 只跑 `npm run check`，不含 Deno 測試；後端階段的紅燈期鎖不住「Deno 測試還紅就解鎖」。本案每階段另跑
  `deno task test` 確認，但腳本本身不擋。
- `python3 scripts/check-test-names.py | tail -n` 會吃掉失敗碼，紅燈 commit 前的命名檢查因此沒擋下超長名稱。
