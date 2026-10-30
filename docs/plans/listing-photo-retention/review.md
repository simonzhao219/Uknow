# 刊登照片保存期限（listing-photo-retention）規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent 的發現。第一輪 2026-10-30（v1）、第二輪 2026-10-31（v2）。聚合規則：只彙整、去重、排序，不改判。 -->

## 第三輪（v2.2，2026-10-31）

這一輪四個 reviewer 都直接 Read 了 review.md 前兩輪，逐條核對第二輪的處理狀況；系統 reviewer 沒有重新 grep 程式碼。

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 5 | fail-closed、dry_run 只認 false、LIVE 閘與 404、concurrency 與冪等、RPC 授權與 search_path、撤 policy 不影響 cascade、ownerId 收窄、20 日算式、錨點條件 |
| 架構 | 0 | 2 | 4 | migration 版本、撤 policy 同一支、階段 1–4、6 的落點與順序、DB 測試分工、區段表、不動 api-contract／appShell |
| UI/UX | 0 | 0 | 0 | SOP 沿用既有停權畫面；§4 仍準確；其餘變動都在維運面 |
| 需求 | 0 | 3 | 3 | 條款原文、§14 覆蓋、「不做」清單、兩種起算點、寬限期合規推算 |

合計 **P0 0、P1 7、P2 12**。系統與架構都報了「共用判準函式權限」，合併後 P2 是 11 條。第二輪的 6 條 P1 都已確認處理，
但其中兩條的處理方式又帶出了本輪的新 P1。

### 第三輪 P1

1. （系統）比例閘拿「被 `limit` 截斷後的候選數」除以「物件總數」。bucket 超過 1000 個物件時，閘永遠不會觸發。
   → 改用截斷前的 `orphan_total`。
2. （系統）`notRemoved` 只記錄，沒有消費者，刪不掉的物件會讓排程靜默失效。→ workflow 讀到 `notRemoved > 0` 就判失敗並開 issue。
3. （架構）`OrphanSweepDeps` 沒有第二支 RPC 的注入點；§7 防線 3 仍寫「逐 owner」，與 §2.2 不一致。
4. （架構）階段 5 的離線 body 檢查沒有落點，也沒有 CI 軌會執行它。→ 寫成 `check-workflows.py` 的規則，或寫成帶 `--self-test` 的腳本並接進 `framework-check.sh`。
5. （需求）〔需人工裁決〕用「停權」處理終止請求，會連帶凍結獎勵與提領、影響推薦（規格書 §5.2、§5.3）。→ 列為開放問題。
6. （需求）「回信留痕」和「20 日內完成」無法驗收。→ 補留痕載體、必記欄位、完成後核對步驟、升級條件。
7. （需求）「刪 `listings` 列」沒指定操作工具；撤掉 policy 後，應用內已經沒有入口。

### 第三輪 P2

- （系統＋架構）共用判準函式要 revoke，不然會被 PostgREST 暴露成 `/rpc`。
- （系統）第二支 RPC 要自己重新驗證 bucket、正則、寬限期。
- （系統）單輪上限 500 與「首輪就清完」的說法矛盾。
- （系統）變體 URL（帶 query、transform 路徑、尾斜線）會被判成孤兒 → 加測試，並寫明預期行為。
- （系統）失敗路徑的 log 也要遵守隱私規則。
- （架構）authenticated 對 `listings` 送 DELETE 的斷言要寫成「刪後列仍在」。
- （架構）workflow 的 `name` 與 job id 要寫定。
- （架構）讀原文斷言路由的測試放在 Deno 側。
- （需求）規格書 SOP 旁要有一行條款六退費的指標。
- （需求）20 日要寫成引用寬限期常數的公式。
- （需求）升級點提前到 11/17。

### v2.3 的回應（規劃者自述，未再送審）

- 系統 P1-1、P1-2，架構 P1-3、P1-4：已補。對應 plan §2.1 的 `orphan_total`；§2.2 的 deps 介面與 `notRemoved` 消費端；
  §2.5 與階段 5 的 `scripts/purge-listing-photos-request.py --self-test`，接進 `framework-check.sh`。
- 需求 P1-6、P1-7：已補，見 plan §1 SOP 的留痕、完成後核對、升級條件，以及 Dashboard SQL Editor。
- 需求 P1-5：列為 **plan §6 Q11，等業主裁決**。
- P2：全部採納，見 plan §2.1、§2.2、§2.5、§5、§7。

---

## 第二輪（v2，2026-10-31）

v2 依業主裁決 W2-5～9 與第一輪工程類 P1 修訂。限制：第二輪的系統、架構、需求 reviewer 沒有 shell，取不到第一輪報告原文，
是從 v2 內文反推第一輪的處理情況；UI/UX 有逐條比對。

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 7 | fail-closed、雙斷路器、二次檢查、dry_run 只認 false、RPC 權限、引用收窄、LIVE 開關；RLS 撤除不影響 cascade；端點錯誤語意 |
| 架構 | 0 | 2 | 4 | migration 版本與撞檔、RLS 連動範圍、階段 1–4 測試落點與分層、依賴順序、不動 appShell／api-contract、workflow 規則 3/5/6/8b |
| UI/UX | 0 | 0 | 1 | 第一輪兩條 P1 的「接受並記錄」足夠；新畫面、三態、BottomNav、行動版、LINE 內建瀏覽器 |
| 需求 | 0 | 3 | 2 | §14 第 14 列覆蓋與溯源；條款原文未改；驗收可測；Q1–Q8 已裁 |

合計 P0 0、P1 7。系統與架構都報了「逐 owner 呼叫與 ≤100 切批互相矛盾」，合併後是 **6 條**；P2 14 條。

### 第二輪 P1

1. **〔§2.3、§2.5、§7〕（系統）repo 是 public，Actions 的 step summary 和 log 都公開**，dry-run 候選 name 含 uid 等於公開 uid。
   → summary 與 log 只放統計；業主在本機 curl 取清單。
2. **〔§2.2 步驟 3–4〕（系統＋架構）逐 owner 呼叫 `removeUnreferencedPhotos` 與「≤100 切批」互相矛盾**：序列往返會逼近
   Edge 執行時限；`.overlaps` 走 GET query string，大量 URL 會超過長度上限；`removedSoFar` 的累計位置沒定義。
   → 一次批次複查後再合併切批，或逐 owner 再切小批並累計。
3. **〔§5 階段 5〕（架構）實作 session 對 develop dispatch 做不到**：workflow 檔要先合進 develop 才能 dispatch，端點也要等
   develop CI 綠後才部署。→ 階段 5 只留離線檢查；真環境 dispatch 改列為合併後的上線驗收。
4. **〔§1 SOP、§6 Q9〕（需求）SOP 時限超過三十日**：收件後 30 日刪刊登，再加寬限期 7 日＋1 輪，實際約第 37 日。→ 人工期限 N
   要滿足 N＋7＋1 ≤ 30（例如 N ≤ 20），或刪刊登後 dispatch 一次實刪。
5. **〔§1 期限推算〕（需求）「撤除日起算」與「業主人工動作日起算」沒有分開寫。**
6. **〔§1 SOP、§6 Q9〕（需求）SOP 缺三件事**：留痕（收件日與完成日）、刪刊登後帳號仍可重新刊登、條款十二的個資保存是另案
   卻沒寫明不在範圍。

### 第二輪 P2

- （系統）比例閘在首輪實刪時預期會觸發 → §7 寫明首輪要 `force_ratio`；同標題 issue 合併，不每日新開。
- （系統）錨點失效的合法例外（所有被引用物件都已不存在）→ 註明處置。
- （系統＋架構）RPC 的 `p_grace interval` 與 `graceHours: number` 型別落差 → 寫明轉換點。
- （系統）`order by … limit` 會讓刪不掉的物件每輪霸佔額度 → 回報差額。
- （系統）`PHOTO_PURGE_LIVE=true` 後 404 仍降級，路由漏註冊時排程會永遠靜默 → 開實刪後 404 改為失敗。
- （系統＋架構）workflow 沒有 `concurrency` → 加上。
- （系統）〔需人工裁決〕Q9 (a) 刪刊登後會員可以立刻重新刊登 → 是否同時停權。
- （系統）`= any(l.photos)` 沒有 GIN 索引 → 超過數萬物件再補。
- （架構）端點 header 名稱與 `verifyInternalSecret` 的組法沒寫 → 寫明沿用 `x-internal-secret`。
- （架構）`/internal/*` 拆到三個區段 → 註明這是避撞檔的暫時安排。
- （需求）Q9 要區分未付款（可刪帳號）與已付款（只刪刊登），並說明這是在修正 W2-5 的作法。
- （需求）寬限期失效要不要告知使用者 → 列為開放問題或寫明不告知。
- （需求）〔需人工裁決〕其他 bucket 不在範圍，要寫進「不做」。
- （UI/UX）`PhotoPicker` 既有格是裸 `<img alt="">`，沒有 `onError` → 是否順手處理由業主裁決。

### 第二輪需人工裁決

- 規劃書 §6 **Q9**（終止／刪除請求 SOP）：**實作前必須定案**，因為階段 6 要把 SOP 寫進規格書（架構視角）。
- 規劃書 §6 **Q10**（UI/UX：照片失效時要不要通知刊登者、`PhotoPicker` 要不要掛 `onError`）：不擋本案。

### v2.1 的回應（規劃者自述，未再送審；人審時請核對 plan.md）

- P1-1：workflow 不送 `include_names`，log 只印統計；業主在本機 curl 取清單（plan §2.3、§7）。
- P1-2：新增第二支 RPC `filter_unreferenced_listing_photos`，一次批次複查（走 POST body）後再切 ≤100 刪除；sweep 層累計
  `removedSoFar` 與 `notRemoved`；兩支 RPC 共用同一個判準函式（plan §2.2）。
- P1-3：階段 5 改為離線檢查四種 body 組合；真環境 dispatch 改列為 §7 上線程序第 1 步。
- P1-4、P1-5、P1-6：§1 分開寫兩種起算點，人工期限訂為收件後 20 日；SOP 加上停權、留痕、未付款者可刪帳號，個資保存寫明
  不在本案範圍；以上併入 Q9 (a)，等業主裁決。
- P2 採納：首輪 `force_ratio`、issue 合併、錨點例外處置、interval 轉換點、`notRemoved`、LIVE 後 404 改失敗、`concurrency`、
  GIN 索引註記、header 名稱、區段暫時安排、未付款與已付款分流、其他 bucket 寫進「不做」。
- P2 未採納（列入 Q10）：照片失效時通知刊登者、`PhotoPicker` 掛 `onError`。

---

## 第一輪（v1，2026-10-30）


| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 5 | 4 | Storage remove 切批與冪等；即時路徑收窄為 `.eq('user_id', ownerId)`；密鑰驗證與路由順序 |
| 架構 | 0 | 3 | 5 | 模組邊界（注入式、不 import index.ts、前端零改動、不動 api-contract）；migration 版本與撞檔；測試分層命名；workflow 命名與 8b |
| UI/UX | 0 | 2 | 1 | 新畫面三態、BottomNav、行動版、a11y（本案無新元件） |
| 需求 | 0 | 3 | 2 | 九種孤兒來源全數對到；條款原文引用一致；無腦補需求；範圍排除明確；驗收可測 |

合計 P0 0、P1 13（系統與架構各報一次的「排程上線即實刪」合併為 S1/A1，去重後 12 條）、P2 12。

### 發現清單（依嚴重度排序）

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

### 需人工裁決

- 需求視角：條款十二「請求刪除即視同終止」是由本案排程涵蓋，還是只靠業主人工作業（與 P1-8 同題）。
- 需求視角：`ORPHAN_GRACE_HOURS` 要不要可調（P2-9）。
- 架構視角：撤 policy 與 RPC 是否同一支 migration（P2-3）。
- 系統視角：48h 寬限期對「Edit 頁放置後才存檔」的情境，上傳發生在 Edit 內，風險低；若將來改成重用舊檔的流程要重評。
- 規劃書 §6 的 Q1–Q6（見 plan.md）。

## 處置（人審後填寫）

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
- 兩輪都沒有 P0。第一輪的 P1 已由 v2 處理；第二輪的 P1 中，工程類三條已由 v2.1 處理，**SOP 類三條等 Q9 裁決**。
- Q9 → W2-11 選 (a)，Q10 → W2-12 選 (a)，已回填 plan v2.2。第三輪：P0 0；P1 7 條中 6 條已在 v2.3 處理，1 條（停權）列為 Q11 等業主裁決。第二輪 SOP 類三條 P1 已隨 (a) 處理（20 日人工期限、停權、回信留痕、個資保存另案）。
