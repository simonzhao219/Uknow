# 對帳與照片清理改由 pg_cron 觸發 規劃書審查報告

- 第 1 輪審第 1 版（8d148aa），保留在本檔下半部。
- 第 2 輪審第 2 版（784b68af），見本檔上半部「第 2 輪」節；處置見 plan §9。
- 第 3 輪只覆核第 3 版對第 2 輪的處置，結果附在第 2 輪節末；處置見 plan §10（3.1 版）。

## 第 2 輪（第 2 版）

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1〔需人工裁決〕 | 4 | 4 | Vault 缺值寫帳本、trigger 分流表、空窗期安全、migration 加法、對帳冪等底線；第 1 輪 #2、#7、#9、#10、#18～#23 處置到位 |
| 架構 | 0 | 5 | 6 | 沿用端點、`scheduled-runs.ts` 位置、Vault 只由 definer 讀、spike 與守衛相容；fixture 在 Deno／Python 兩端技術上可行 |
| UI/UX | 0 | 2 | 3 | 三態、BottomNav、a11y；第 1 輪 #16、#17、#33 處置到位 |
| 需求 | 0 | 2 | 3 | W5-15③、W5-17、W5-18 落實；驗收 4、5 可測；沒有新的腦補需求 |

**P0**

- 〔§2.5 pay P1-3〕「只有 `'0'` 是未付款」的前提若不成立（reviewer 記憶中還有 4／8／9），棄付單會永久變成 unknown、永不 expire，且每小時 502 → 階段 0 碼表改為硬閘門，文件明確列為未付款／逾期的碼走原本的 expire 路徑。（系統，需人工裁決）

**P1**

- 〔§2.5〕queryFailures 算進全滅：只剩一兩張棄付單「查無此單」時，每小時 502；看門狗以 lastSucceededAt 判活，會把業務失敗誤判成停擺、補跑並開 issue。（系統）
- 〔§2.5〕移除 `?? list[0]` 後，單項缺 MerTradeNo 或數字型的已付款單永遠收斂不了。（系統）
- 〔§2.9〕SOP 步驟 4 在「migration 已套用、Edge 尚未部署」期間必然失敗，晉升清單時序不可行。（系統）
- 〔§2.5〕`nullsFirst` 漏寫會靜默反向；欄位從不清除；更新失敗未定義。（系統）
- 〔§5〕2、3 互相依賴；「全部 unknown」會同時觸發全滅與逐張告警。（架構）
- 〔§3、§5〕`withScheduledRun` 的 fn 回傳契約未定義。（架構）
- 〔§5〕handler 寫死 queryFn，端點層測試沒有測試縫。（架構）
- 〔§2.5〕清理加租約後，GitHub 補跑收到 skipped 會被判 `bad_shape`。（架構）
- 〔§2.7〕CI 的本機 cron 會寫 vault_missing 列，污染帳本斷言。（架構）
- 〔§2.5〕看門狗 LINE 範本超過 notify 的 200 字截斷，「下一步」最容易被截掉。（UI/UX）
- 〔§7〕人為 unschedule 後 24 小時內每小時推「停擺」P1。（UI/UX）
- 〔§1、§2.6〕驗收 1 與 GitHub 補跑列的關係沒交代；手動驗證列沒有扣除條件。（需求）
- 〔§2.8〕`checked >= 3` 的依據不足，沒寫 1/2 的取捨。（需求）

**P2**

- 系統：502 的 error 形狀與 curl 重試；並行測試要用兩條連線；`cronDispatches24h` 的 join 與 §7 敘述不符；`lastPurgeDryRun` 的取值。
- 架構：
  - migration 跨階段累加；
  - prune 沒有測試；
  - fixture 未定案（範例 JSON 不合法、單向比對）；
  - workflow「兩個 job」的說法；
  - 文件同步漏項：supabase-functions.md 導航、晉升清單、framework-check、spec-drift；
  - `payuni-query-alert.unit.test.ts` 是既有檔。
- UI/UX：unknown 逐張告警的洗版；開關不一致與清理失敗缺操作入口；SOP 的 `update_secret`、失敗對照、驗證列辨識。
- 需求：「帳本為空、無派發」吞掉「排程沒掛上」；purge 逾期每小時重推；prune 排程沒有測試。

**需人工裁決**：只有上面的 P0。第 3 版以「階段 0 ⑥ 硬閘門加暫定碼表」處置；官方碼表若不符，停下回報主 session。


### 第 3 輪覆核（第 3 版；系統、架構兩個視角）

| 視角 | P0 | P1 | P2 |
|---|---|---|---|
| 系統 | 0 | 3 | 2 |
| 架構（含 UI/UX 項覆核） | 0 | 1 | 3 |

第 2 輪的 P0 與各 P1 都確認已處置。新問題集中在看門狗層：

- **P1-A** `lastCompletedAt` 沒有限定 trigger。（系統）
- **P1-B** pause 用 unschedule，會先命中「排程不存在」那一列，導致人為停用時持續推 P1。（系統、架構）
- **P1-C** `manually_disabled` 會殘留，節流公式沒有寫出來。（系統）
- **P2**：
  - 24 小時節流沒有機制；
  - curl `--retry` 也會重打 5xx；
  - `handleReconcile` 落點與 3 → 4 依賴沒寫；
  - J5 要放在 `bad_shape` 之前；
  - `cron.job` 的測試隔離。

**需人工裁決**：系統 reviewer 標 P1-B 的兩種解法（定優先序／改 `alter_job`）要人裁決。
執行 session 判斷這是技術取捨、不涉及業務，在 3.1 版採 `alter_job`：停用期間 `cron.job` 保留原樣，恢復時不必重寫排程字串。主 session 可推翻。處置見 plan §10。

---

## 第 1 輪（第 1 版）

<!-- /review-plan 彙整四個 fresh-context reviewer 的發現。聚合規則：只彙整、去重、排序，不改判。
     多位 reviewer 重複提出的同一缺口合併為一條，標出來源視角，severity 取最高原判。 -->

審查對象：`docs/plans/pg-cron-schedulers/plan.md`（規劃，尚未實作）。
需求 reviewer 讀不到遠端分支上的 `dispatch-prompts.md`，必答 1～5 是對照 `launch-wave-5/plan.md` §2 S1 與 W4-25 核對，沒有逐字比對派工原文。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 7 | 5 | 沿用既有端點的空窗安全性（核對 index.ts／listing-photos.ts 成立）；502 與既有 workflow `curl -f` 相容；無新增使用者可達端點 |
| 架構 | 0 | 4 | 5 | 沿用端點與 `x-internal-secret`、不動 api-contract；migration 只新增物件；definer＋revoke 符合〈慣例〉；8b 改寫方向；前端零變動 |
| UI/UX | 0 | 3 | 3 | 告警頁三態既有；BottomNav、a11y 不受影響 |
| 需求 | 1 | 5 | 3 | 必答五題皆有對應章節；「不做什麼」清單存在；ops P1-3、pay P1-3 主幹修法與稽核一致 |

## 發現清單（依嚴重度排序）

### P0

1. **[P0]〔§1 驗收 4、§2.5、§5 階段 3〕「過半失敗也告警」（`checked >= 2 && queryErrors*2 > checked`）沒有出處**（需求）
   → 稽核 ops P1-3 只要求全滅告警／非 2xx，單張降 warning 是 #460 刻意決策；「過半」與 `checked >= 2` 屬腦補 → 刪掉只做全滅，或列成開放問題交業主裁決。
   註：派工原文寫的是「全滅或過半失敗要告警／非 0 結束」，需求 reviewer 沒讀到這段（見檔頭）。此條是否成立列「需人工裁決」，聚合者不改判。

### P1

2. **[P1]〔§2.2、§2.4、§1 驗收 3〕Vault 缺值時靜默 return、不寫帳本，與驗收「Vault 沒設 → 2 小時內告警」自相矛盾**（系統、需求；UI/UX P2 同指）
   「帳本沒有 pg_cron 列」同時代表過渡期與 Vault 沒設，判準表只補跑不推 LINE；90 分＋每小時看門狗最壞約 150 分才發現 → 缺值時寫帳本 `skipped`／`failed(error_code='vault_missing')`（拋棄式分支另行豁免），`scheduler-health` 回報 Vault 缺值；修正驗收 3 的時間與條件。
3. **[P1]〔§2.5 ops P1-3〕全滅判準與 `queryErrors` 語意不一致**（系統）
   `queryErrors` 也計 expire update 失敗；PayUni 回整批 Status 非 SUCCESS（`queryFailure`）不計入 → 「整批參數錯」不會觸發全滅 → 新增 `queryFailures` 計數，全滅＝`queryErrors + queryFailures === checked`，或明講只涵蓋 HTTP／網路例外。
4. **[P1]〔§2.5 pay P1-3〕`list.find(...) ?? list[0]` 的 fallback 要明確移除；平鋪欄位模式也要驗 `MerTradeNo`；`'0'` 是唯一未付款碼的前提未驗證**（系統）
   若 PayUni 還有其他「等待中」碼，改後這類單永不 expire、每輪發 error → 階段 2 涵蓋「同號在第二位」「無同號」「平鋪 MerTradeNo 不符」；碼表以 PayUni 文件確認後再寫死。
5. **[P1]〔§6 Q5、§2.5〕未知 TradeStatus 單留在掃描視窗最前端，系統性新碼會塞滿 50 張視窗、餓死真卡單**（需求、系統）
   「累積 10 張再說」不可量測 → 本案就讓未知單排到視窗後段，或把「≥N 張未知時告警」寫成驗收。
6. **[P1]〔§2.3、§7 最壞 3〕`PHOTO_PURGE_LIVE` 漏設＝三十日下架靜默失效，防線只有 step summary warning**（需求 P1、UI/UX P1、系統 P2）
   → 正式站連續 dry-run 而 repo var 為 true 時推 LINE P2（每日最多一次）或寫 system_alerts warning；「Edge Secrets 有 `PHOTO_PURGE_LIVE=true`」列為晉升清單硬性驗收項。
7. **[P1]〔§2.1／§2.4 租約〕崩潰／逾時的租約路徑沒定義**（系統、架構）
   Edge 被 wall clock 砍掉時列卡 `running` 15 分鐘；skipped 是否落帳未定（落帳則計數從哪來）；`abandoned` 沒進 health；晚到的舊 run 在 abandoned 後仍可能寫帳 → 明定 skipped 落帳與否、恢復時間上限、租約 > Edge 最大執行時間；`finish_scheduled_run` 檢查 status 仍為 running；abandoned 進 health 並告警。
8. **[P1]〔§5 階段 4、5〕帳本 finish 只驗了成功／502**（架構）
   既有 catch→500、purge 的 SweepError、skipped 都沒覆蓋 → 驗證標準補「任何擲錯路徑都 finish(`failed`)」，結構上用 try/finally。
9. **[P1]〔§2.1 pg_net〕pg_net 細節沒寫**（系統）
   `timeout_milliseconds` 單位是毫秒（150000）；`net._http_response` 只留約 6 小時，§2.6 ③與 health 的「24h 非 2xx」會被低估；pg_net 不重試 → 寫明三點；非 2xx 量法改以帳本有無收到請求判斷。
10. **[P1]〔§2.2、§5 階段 1〕Vault／net 表的存取與佇列斷言未驗證，可能 flaky**（系統、架構）
    `net.http_request_queue` 送出即刪；definer 讀 `vault.decrypted_secrets` 依賴本地 CI 版本；`cron.job` 讀取權依連線角色 → 加階段 0 spike（在 `supabase start` 上確認），佇列斷言改 stub `net.http_post` 或檢查回傳 request id／`pg_get_functiondef`。
11. **[P1]〔§5 階段切分〕依賴順序寫反一半，階段 1 太肥**（架構）
    4、5 依賴 1 的租約 RPC、6 依賴 `scheduler_health()` 卻沒寫 → 拆 1a（帳本＋租約）／1b（invoke＋cron 排程，最後上）／1c（health RPC）。
12. **[P1]〔§2.5、§5 階段 6～8〕health JSON 是 TS 端點與 Python 看門狗的契約，沒人釘住**（架構）
    → plan 寫死 schema；階段 6 的 Deno 測試與階段 7 self-test 吃同一份 fixture（如 `scripts/fixtures/`）；yml 只留薄膠水。
13. **[P1]〔§1 驗收 1/3、§2.5、§2.7、§3〕多個門檻數字沒有出處**（需求）
    90 分補跑、26 小時、70 分間隔、2 小時告警、≥23 次、15 分租約、90 天保留、150 秒 → 列「可調參數」表逐項寫依據，業主關心的併入開放問題。
14. **[P1]〔§2.5、§2.3、§3、§5 階段 6～7〕範圍超出派工必答＋兩條併入項**（需求）
    health 端點、pg_net 彙總、watchdog.py、帳本、租約、90 天清理；沒說明為何 `logSystemAlertOnce`＋`cron.job_run_details` 不夠 → 補「為何不採較小方案」，把 health、pg_net 告警、開關不一致檢查標成可延後項交業主。
15. **[P1]〔§6 Q4〕heal pass（pay P2-14）不在併入範圍卻「建議收」，與 §1「不做什麼」矛盾**（需求；系統則支持收）→ 預設不收，要收由業主明確同意。
16. **[P1]〔§2.5、§2.3〕同一根因多條 LINE、深夜疲勞；LINE 文案無固定格式**（UI/UX；需求 P2 同指 502 雙推）
    pg_cron 停擺可能同時推看門狗 P1、pg_net 非 2xx P1、`query_all_failed` → 明訂抑制規則（已推停擺就不推 pg_net）；文案固定「等級／環境／壞了什麼／是否已補跑／下一步」。
17. **[P1]〔§4、§5 階段 2、3、5〕新告警的 message 沒有可驗收的文案規格**（UI/UX）
    值班者手機上幾乎只看到 message；訂單號、數量、小時桶「持續中」都在 context → 每種告警列 message 範本（發生什麼、影響誰、下一步），訂單號與數量寫進本文，驗收加這一條。
18. **[P1]〔§2.1 空窗〕空窗內 pg_cron 與 GitHub 各打一次舊對帳端點，沒有租約，PayUni 查詢量加倍**（系統，量級風險非正確性）→ §7 補一行並確認 PayUni 查詢額度。

### P2

19. **[P2]〔§2.7〕`create extension pg_net with schema extensions` 可能與既有安裝衝突**（`20261025000011` 記過 pg_cron 重跑 2BP01）→ CI 上驗證，考慮只斷言存在。（系統）
20. **[P2]〔§2.4〕`begin_scheduled_run` 撞 unique 要在函式內 `exception when unique_violation` 回 null**，階段 1 涵蓋兩個並行交易。（系統）
21. **[P2]〔§2.5〕補跑的成功判準要排除 `skipped:'concurrent'`**（現行 curl `--retry-all-errors`）。（系統）
22. **[P2]〔§2.4〕`notRemoved > 0` 在 pg_cron 路徑判 error，但 Storage `remove()` 對不存在物件的行為未確認** → 確認前降 warning。（系統）
23. **[P2]〔§2.7〕帳本表除了 RLS 無 policy，也明寫 `revoke all ... from anon, authenticated`。**（系統）
24. **[P2]〔§3〕租約與帳本包裝抽成 `scheduled-runs.ts`（deps 注入、可寫 `.unit.test.ts`），`index.ts` 只接線。**（架構）
25. **[P2]〔§5 測試命名〕全滅／過半判斷抽純函式可改 `.unit.test.ts`；新檔名依 test-naming.md 核對。**（架構）
26. **[P2]〔§2.3、§5 階段 5〕缺 `trigger:'github'` 一列（沿用 body 的 dry_run、不受 Edge 開關影響）；未知 trigger 一律當 manual 走 dry-run 預設。**（架構）
27. **[P2]〔§5 階段 8〕文件同步漏項**：`supabase/README.md` Migrations 表、`framework-check.sh` 加 self-test 區塊、規格書第 802 行「error 級由對帳排程推 LINE」語意改變。（架構、需求）
28. **[P2]〔§2.2、§7〕同一密鑰存兩處的輪替順序要寫進 checklist SOP；develop 與正式站同值等於 develop 洩漏即正式站洩漏。**（架構、UI/UX）
29. **[P2]〔§2.2、§2.3〕業主手動步驟分散、無「設好了怎麼立即驗證」** → checklist 寫成有序清單（Edge Secrets → Vault → 手動 `select public.invoke_internal_endpoint('reconcile')` 查帳本一列）。（UI/UX）
30. **[P2]〔§1 驗收 4〕pg_cron 路徑上沒有東西會「變紅」** → 改寫成「回 502、一筆 error、下一輪看門狗推 LINE」。（需求）
31. **[P2]〔§2.6 vs §1 驗收 1〕「24 列全 succeeded」與「≥ 23」內部不一致** → 統一判準並寫明誰、何時、哪個查詢。（需求）
32. **[P2]〔§0、§2.5〕付了錢卡 pending 的使用者端文案本案未涉及也未註明** → §4 註明不改及理由，或加文案小項。（UI/UX）
33. **[P2]〔§4〕告警頁無法一眼分出排程類** → message 加固定前綴（如「【對帳】」），不動前端。（UI/UX）

## 需人工裁決

- **#1（P0）是否成立**：需求 reviewer 未讀到派工原文；派工 S1 段寫「全滅或過半失敗要告警／非 0 結束」。業主可：(a) 認定派工即依據 → 豁免此 P0，`checked >= 2` 門檻仍需寫明依據；(b) 只做全滅。
- **#15 Q4 heal pass**：系統 reviewer 支持收、需求 reviewer 主張預設不收。
- **#14 範圍**：health 端點、pg_net 告警、開關不一致檢查是否本波做（#2、#6 的修法會依賴其中一部分）。
- **#13 門檻值**：90 分、26 小時、2 小時告警上限是否交業主。
- **#6／#16 LINE 通知量**：開關不一致升 LINE 會增加通知量。
- **#28 develop 與正式站共用 `RECONCILE_SECRET`**：依據是 `docs/supabase-setup-checklist.md`（GitHub 只有一份 `secrets.RECONCILE_SECRET`）；pg_cron 不經 GitHub，是否趁此分開兩把。
- **#32 使用者端 pending 文案**是否納入本波。
- **#18、Q6 PayUni 查詢額度**未估算。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。
     tdd-implement 開工前會檢查：存在未處置 P0 → 拒絕開工。 -->

- [x] 人審完成，裁決：□ 通過 ■ 修訂後通過（豁免理由：第 1 輪 P0 依 W5-19 豁免；第 2 輪 P0（碼表）以階段 0 ⑥ 硬閘門處置；第 3 輪無 P0。主 session 2026-11-04 親審 v3.1（3e9f372b），P0／P1 為 0） □ 退回重規劃
  - 業主 2026-11-05 03:42（台北）互動選項：「修訂後通過 (Recommended)」；業主同時在本 session 親打 `/tdd-implement pg-cron-schedulers`。
