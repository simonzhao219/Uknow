# 刊登照片保存期限（listing-photo-retention）規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent 的發現（2026-10-30）。聚合規則：只彙整、去重、排序，不改判。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 5 | 4 | Storage remove 切批與冪等；即時路徑收窄為 `.eq('user_id', ownerId)`；密鑰驗證與路由順序 |
| 架構 | 0 | 3 | 5 | 模組邊界（注入式、不 import index.ts、前端零改動、不動 api-contract）；migration 版本與撞檔；測試分層命名；workflow 命名與 8b |
| UI/UX | 0 | 2 | 1 | 新畫面三態、BottomNav、行動版、a11y（本案無新元件） |
| 需求 | 0 | 3 | 2 | 九種孤兒來源全數對到；條款原文引用一致；無腦補需求；範圍排除明確；驗收可測 |

合計 P0 0、P1 13（系統與架構各報一次的「排程上線即實刪」合併為 S1/A1，去重後 12 條）、P2 12。

## 發現清單（依嚴重度排序）

### P1

1. **〔§2 排程、§7 上線程序〕正式站「先 dry-run、核對後才開排程」沒有機械閘門**（系統＋架構同報）。workflow 一合進 develop
   （default branch），`schedule` 就生效。晉升前打正式站會 404，每天開 issue；晉升部署後的下一輪 cron 就是實刪，早於業主核對。
   → 排程預設 dry-run，另設 repo variable（如 `vars.PHOTO_PURGE_LIVE_<env>`）才實刪；端點未部署的 404 照 reconcile 的告警寫法降為
   warning；`workflow_dispatch` 的 `dry_run` 字串要明確轉成 JSON boolean。
2. **〔§2 端點〕（系統）`dry_run` 缺省等於實刪**：body 缺漏、解析失敗或型別不對時，會落到不可逆的刪除。→ 只有 `dry_run === false`
   才實刪，其餘一律當 dry-run。
3. **〔§2 斷路器、§7〕（系統）斷路器只擋「全部零命中」**：擋不住部分誤判，而且「所有被引用檔恰好都不存在」時會永久中止。→ 加比例閘
   （候選數／物件總數超過門檻且總數 >N 就中止，要人工 dry-run 放行）；零命中條件改成「matched=0 且 totalObjects>0 且
   referencedUrls>0」，並寫明誤中止時的處置。
4. **〔§2 清理邏輯、§1 驗收 3〕（系統）RPC 判定與 `remove` 之間有 TOCTOU**：舊分頁可以把已判為孤兒的檔重新存回 `photos`。寬限期
   看的是 `created_at`，對舊檔沒有保護。→ 每批刪除前，用收窄後的 `findReferencedUrls(ownerId)` 逐 owner 二次檢查（重用
   `removeUnreferencedPhotos`）。
5. **〔§2 判準 RPC、§5 階段 2〕（系統）`security definer` 讀 `storage.objects` 的權限與 search_path 未定案**。→ 全部 schema-qualified；
   DB 測試以 service_role 經 PostgREST `rpc` 呼叫，並測 anon／authenticated 被拒；`revoke … from public, anon, authenticated` 寫全；
   在階段 5 加一次 develop 的 dispatch dry-run，作為真環境的權限驗證。
6. **〔§2 排程、Q3〕（架構）matrix 雙環境的四個缺口**：(a) 「確認目標」要各自讀 git（正式站 `src/utils/supabase/info.tsx`，
   develop `config/supabaseTarget.ts`）；(b) 沿用 `RECONCILE_SECRET` 時，Supabase 兩邊的 Secrets 要設成同一個值（逐分支獨立、
   不繼承），需列業主待辦；(c) `fail-fast: false`；(d) 失敗 issue 的標題要含環境，避免去重時互相吞掉。另外，develop 上 cron 是新
   先例，若不是刻意，建議 develop 只做 dispatch。
7. **〔§5 階段 4、§2 端點〕（架構）handler 單測做不到**：`timingSafeEqual` 在 index.ts 內，`listing-photos.ts` 不得 import 它。
   → 寫明 deps 介面：`verifyInternalSecret(c)`、`sweep: { rpc, removeObjects }`、`publicBase`。
8. **〔§1、§2、§6 Q1〕（需求）條款六「隨時通知終止」、條款十二「請求刪除視同終止」未處理「已終止但帳號未刪」**：這種情況孤兒判準
   抓不到。→ 明載「業主收到終止或刪除請求後，三十日內刪帳號」並放進 §7 上線程序，或併入 Q1 一起問。
9. **〔§1 期限論證、§7〕（需求）時程論證有兩個缺口**：(1) P1a 之前就存在的孤兒沒有撤除日可查，期限可能已經過了；
   (2) 上線程序全靠人工，11/10 到 11/27 只有 17 天。→ 寫明業主核對的時限；把歷史孤兒列為已知風險，或給出處理方式。
10. **〔§1、§2〕（需求）寬限期從 `created_at` 起算，不是從撤除起算，規劃沒說清楚**。→ 在 §1 補一句寬限期的起算點，並說明為何仍合規。
11. **〔§4、§6 Q5〕（UI/UX）寬限期過後才送出的 Create 會在公開頁出現破圖**：LINE 內建瀏覽器背景化、隔天才回來按送出，是常見路徑，
    不是極端情況。→ 二選一：後端存檔前驗證檔案存在，失敗時前端把該格標為 failed 並播報；或拉長寬限期，並在 §4 寫明剩餘風險。
12. **〔§4、§6 Q1(b)〕（UI/UX）Edit 頁遇到已刪檔的呈現沒有規劃**：`PhotoPicker` 用裸 `<img>`，既有照片格直接是 `done`，死連結
    可以再存一次。→ 既有格掛 `onError` 轉成 failed，文案「這張照片已失效，請移除後重新上傳」，擋住送出；並說明這屬本案範圍，
    還是 Q1(b) 的前置條件。

### P2

1. 〔§2 端點回應〕（系統）dry-run 應回傳候選 name 清單（上限 p_limit）供業主核對；name 含 uid，不得寫進 issue 或公開 log。
2. 〔§2 清理邏輯〕（系統）分批中途失敗時，500 回應或 log 帶 `removedSoFar`。
3. 〔§2、Q2〕（系統＋架構）撤 `listings_delete_own` 會連動 `rls-policies.test.ts` 的斷言、`supabase/README.md` 的 RLS 描述、
   規格書與 e2e。→ 列進階段 2 的改動清單，附 grep 驗證指令。〔需人工裁決〕撤 policy 是否與 RPC 放同一支 migration（影響能否單獨 revert）。
4. 〔§2 RPC〕（系統）加 `order by created_at, name`，讓 `limit` 分輪具有決定性。
5. 〔§5 階段 4〕（架構）「路由註冊在 `/listings/:id` 之後」的斷言沒有意義，改成「有註冊」；放第 12 區段的理由要寫明，並同步更新
   `.claude/rules/supabase-functions.md` 的區段表。
6. 〔§5 階段 1〕（架構）`findReferencedUrls` 簽章改動會連動三處呼叫與既有 unit 案例；DB 測試要把 `removeObjects` 覆寫成 spy，
   才驗得到「檔被刪」。
7. 〔§5 階段 2〕（架構）種 `storage.objects` 列要照 `referral-invite-purge.test.ts` 的 postgres 直連寫法（注意與系統 P1-5 「以
   service_role rpc 呼叫」並存：種資料用直連，呼叫 RPC 用 service_role）。
8. 〔§2、階段 6〕（架構）先跑 `check-spec-drift.py` 確認規格書措辭是否觸發抽取失配，別預設常數不被抽取。
9. 〔§6 Q5〕（需求）`ORPHAN_GRACE_HOURS`／單輪上限是否需要做成可調參數，或寫明「寫死，改動要發 PR」。〔需人工裁決〕
10. 〔§6〕（需求）撤 `listings_delete_own` 前對照規格書有無引用；「CDN 快取屬但書」這個解讀併入律師確認項。
11. 〔§4、§3〕（UI/UX）他人違規引用的 URL 被清後，對方的刊登破圖，屬於接受的結果，在 §4 寫成已知現象。
12. （UI/UX）`ImageWithFallback` 的 alt 是英文「Error loading image」，與本案無關，不處理。〔原報為附註，列此保留不改判〕

## 需人工裁決

- 需求視角：條款十二「請求刪除即視同終止」是由本案排程涵蓋，還是只靠業主人工作業（與 P1-8 同題）。
- 需求視角：`ORPHAN_GRACE_HOURS` 要不要可調（P2-9）。
- 架構視角：撤 policy 與 RPC 是否同一支 migration（P2-3）。
- 系統視角：48h 寬限期對「Edit 頁放置後才存檔」的情境，上傳發生在 Edit 內，風險低；若將來改成重用舊檔的流程要重評。
- 規劃書 §6 的 Q1–Q6（見 plan.md）。

## 處置（人審後填寫）

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
- 無 P0。12 條 P1 預計在業主裁決 Q1–Q6 之後，於規劃書修訂一次再重跑 `/review-plan`，或由業主指定逐條處置。
