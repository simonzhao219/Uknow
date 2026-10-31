# listing-photo-retention 實作審查（/review-implementation）

審查對象：`feature/listing-photo-retention` 相對 `origin/develop` 的實作 diff（不含 `docs/plans/`），2026-10-31。
四視角平行審查（系統、架構、UI/UX、需求），只彙整不改判。

| 視角 | P0 | P1 | P2 | 未記錄偏離 |
|---|---|---|---|---|
| 系統 | 0 | 0 | 3 | 無 |
| 架構 | 0 | 0 | 3 | 無 |
| UI/UX | 0 | 3 | 5 | `e2e-journey-test-design.md:473` 措辭連動（P1） |
| 需求 | 0 | 1 | 4 | 階段 1 以真 Storage 取代 spy、第二支 RPC 驗存在性（良性，標 P2） |

合計 **P0 0、P1 4、P2 15**（去重後 P2 約 11：「dispatch 實刪遇 404 仍綠燈」三視角同報；`e2e-journey-test-design.md:437` 兩視角同報）。

## P1

1. 〔UI/UX〕錨點失效與比例閘共用 `circuit_open`，失敗 issue 看不出是哪一道閘、能不能 `force_ratio` 放行。
2. 〔UI/UX〕回應與 workflow 摘要沒有 `orphanTotal`，plan §7「依 `orphan_total` 決定 dispatch 幾次」沒有依據（`candidateCount` 被截在 500）。
3. 〔UI/UX〕`docs/e2e-journey-test-design.md:473` 的措辭連動不在 plan §3，也沒記進 progress.md。
4. 〔需求〕plan 專屬的營運前提沒有升級進長期文件：開實刪前必須由業主核對、沒開實刪就達不到三十日承諾；develop 的 `RECONCILE_SECRET` 須與正式站同值。

## P2（摘要）

- 〔系統／架構／UI/UX〕dispatch `dry_run=false` 而 `PHOTO_PURGE_LIVE` 未設時，404 降為 warning、job 綠燈。
- 〔系統〕`curl -w '%{http_code}' … || echo 000` 連線失敗時輸出兩次 `000`，`code=` 寫壞 `$GITHUB_OUTPUT`。
- 〔系統〕`Number(data.orphan_total)` 等缺欄位時成 `NaN`，兩道斷路器同時靜默放行。
- 〔架構〕單元測試要求 SQL 的 168 與 `ORPHAN_GRACE_HOURS` 相等，但註解說「下限、以較長者為準」，語意不一致。
- 〔架構／需求〕`docs/e2e-journey-test-design.md:437` 仍寫「五條 policy」。
- 〔需求〕規格書 §11 引用鷹架編號 `W2-5`，且「不清照片」接近 document-writing.md 的「記錄沒有」。
- 〔需求〕progress.md 補記兩項良性偏離；規格書 SOP 補「dry-run 單輪最多列 500 個」。
- 〔UI/UX〕issue 內文只列三個 code 的處置；SOP 收件第一步確認 `PHOTO_PURGE_LIVE`；curl 的 ref 從哪找、先 export 密鑰；`delete … returning id` 方便留痕。
- 〔UI/UX〕progress.md「目前位置」過時（鷹架隨收尾刪除，不另修）。

## 處置

全部 P1 與除最後一條外的 P2 都在同一分支修正（`test(red)`＋`fix` 一輪），見 progress.md〈實作決策〉。無需人工裁決項。
