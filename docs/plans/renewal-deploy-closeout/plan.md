# 新約與部署收尾（第 6 波 S6）規劃書

<!-- plans-keep: 跨 session 施工鷹架（主 session 審、業主親打 /tdd-implement）；退場條件＝/tdd-implement 收尾時刪除 -->

基準：develop `1bcc377`（S1 #524 已合）。上游：`launch-wave-6/plan.md` §2 S6、W6-1、W6-14；
`launch-wave-5/plan.md` §0 W5-62、W5-63；R5＝`launch-wave-5/review.md` §1.3 P2-6；#514 內文「偏離」段 P2-3。

## 0. 一句話

續費選新約的會員在確認框看到的推薦人句與付款後的結果一致、0d 換線驗的是單上記的碼；
部署 workflow 在 migration 沒套就拒絕推 Edge；清掉兩支只為部署空窗留著的舊相容函式。

## 1. 使用者需求

### 1.1 範圍與依據

| 項 | 出處 | 現況（逐條核過程式碼） | 要的結果 |
|---|---|---|---|
| A | W5-63 | `freshReferrerSentence`（`src/utils/freshRenewalCopy.ts`）留空時只看 `defaultAvailable`：true →「將改變」。後端 `resolveFreshDefaultReferrer` 不比對現任推薦人。現任推薦人＝預設推薦人時，付款 0d 寫回同一人（推薦人與獎金正確），確認框卻寫「將改變」；新碼欄說明（`freshCodeHint`）同樣寫「不填則推薦人將改變」 | `/subscriptions/status` 回第三態；確認框寫「您的推薦人維持不變。」、說明改「不填則維持原本的推薦人」，**不揭露是誰**（W5-63） |
| B | R5 P2-6 | `20261113000003` 0d：source＝default 時 `v_check_code` 重讀付款當下的 `reward_config.default_referrer_code`，而 `v_ref_user` 是建單時解析的舊預設推薦人。建單到付款之間（最長 3 天）後台換了預設碼 → `v_valid_user ≠ v_ref_user` → 寫 `fresh_referrer_invalid`「已停權或失效」並維持原推薦人：原因寫錯、結果也和確認框不同 | 見 §6 Q1（建議：0d 一律驗單上的 `fresh_referrer_code`） |
| C | `20261113000002` 註解「下一波 drop」 | 三參數版 `prepare_payment_order(uuid,text,text)` 是委派六參數版的 wrapper。正式站 Edge（main `f5a1ed8`，11/07 部署、health sha 已比對）已用六參數版（`p_referrer_source`）；develop 亦同 | drop 三參數版；改掉仍呼叫它的測試 |
| D | W6-14 | S1 留下的單交易 wrapper `complete_paid_pending_orders`。**正式站 Edge（main `f5a1ed8`）仍直接呼叫它**（`/profile` heal 與 reconcile 的 heal 兩處；S1 的逐筆版只在 develop） | 見 §6 Q2（建議：本 PR 不 drop，延到 S1 的 Edge 在正式站上線過一輪之後） |
| E | W5-62 | `deploy-supabase.yml` 只靠人工晉升清單 4a 確認 migration 已套；Edge 先於 migration 上線曾讓 prepare 全 500 的風險（#514 審查 P2-2） | 部署 Edge 前自動比對目標環境 `supabase_migrations.schema_migrations` 與 repo 內每支 migration 版本；缺任一支就失敗、不部署（也不先寫 DEPLOY_SHA）。上線後 `launch-wave-6/plan.md` §4 的人工 4a 改看此步驟結果 |

### 1.2 驗收情境

- A1：曾訂閱、現任推薦人＝預設推薦人（不論當初是填碼或自動綁定）、選新約留空 → 確認框「您的推薦人維持不變。」，說明「不填則維持原本的推薦人」；畫面上不出現預設推薦人姓名或碼。
- A2：現任推薦人≠預設推薦人、預設可用 → 仍「將改變」（不回歸）。預設不可用 → 仍不寫推薦人句（不回歸）。
- A3：舊後端（欄位缺）→ 前端行為同今日（不回歸、不崩）。
- B1：source＝default 的新約單，建單後後台把預設碼換成別人、舊碼仍有效 → 付款後的結果與告警依 §6 Q1 裁決（建議案：換到單上記的舊預設推薦人、不寫告警）。
- B2：單上記的預設碼在付款當下已停權／失效 → 維持原推薦人、`fresh_referrer_invalid` error（同今日）；告警 context 多帶付款當下的預設碼，看得出「已更換」或「失效」。
- C1：`prepare_payment_order(uuid,text,text)` 不存在；六參數版行為、權限、無 default 不變。
- E1：目標環境缺 repo 內任一支 migration → 部署 job 紅、不寫 DEPLOY_SHA、不推 Edge、走既有「失敗時開 issue＋LINE」。
- E2：migration 由 Supabase 整合套用稍晚於 CI 綠 → 步驟在上限內輪詢等待，套齊即放行。
- E3：Management API 讀取失敗（401／5xx／格式不符）→ 失敗（fail-closed），訊息分得出「讀不到」與「缺版本」。

### 1.3 不做

- #514 P2-3（`/subscriptions/status` 讀取之後才成環的競態，確認框寫「將改變」、0d 判成環維持原推薦人並告警）：視窗是「讀 status 到付款」之間有人把自己掛進本人樹，罕見且已有 error 告警；本波不處理（§6 Q3 請確認）。
- 3b／3d 失敗仍是 warning、`repair_orphaned_*` 單交易、單筆開通 sqlerrm 進 message（第 7 波）。
- ops P0-1 殘餘（`SUPABASE_ACCESS_TOKEN` 在 job 層 env）：不在範圍，新步驟沿用同一 token、不擴散到新 job。

## 2. 系統設計

### 2.1 A：第三態（W5-63）

- 契約 `_shared/api-contract.ts` `RenewalInfo` 加 `freshDefaultReferrerIsCurrent: optional(bool())`（additive；舊前端忽略、新前端遇缺值走今日行為）。保留 `freshDefaultReferrerAvailable` 不改型別——改 enum 會讓部署空窗的新前端／舊後端組合壞掉。
- `/subscriptions/status`：renewal 分支多讀 `profiles.referred_by_user_id`（`must()`，失敗整支 500，照 #360 裁決）；`freshDefaultReferrerIsCurrent = freshDefault.ok && freshDefault.referrerUserId === referred_by_user_id`。判準與 prepare 同源（`resolveFreshDefaultReferrer`），不另寫。
- 前端 `freshRenewalCopy.ts`：`FreshReferrerInput` 加 `defaultIsCurrent: boolean | undefined`。留空時：`defaultAvailable && defaultIsCurrent` →「您的推薦人維持不變。」；`freshCodeHint`／`freshCodePlaceholder` 把「預設可用且即現任」歸到「留空＝維持」那一支（placeholder 仍只在 `!isAutoReferral` 時顯示現任的碼——使用者自己填過的碼，非預設推薦人揭露）。三處同一判斷式，抽成 `blankKeepsReferrer(available, isCurrent)`。
- 付款端不改：0d 寫回同一人，`referral_edges` 的 upsert 有 `where ... is distinct from`，不動邊；`referred_by_is_default` 會被設成 true（當初填碼者之後在結帳頁看不到「目前：碼」）。結果仍是「推薦人不變」，與句子一致；列 §7 已知行為。

### 2.2 B：0d 驗單上的碼（R5 P2-6）

新 migration `20261117000001_fresh_rewire_order_code.sql`，`process_successful_payment` 基準＝`20261113000003`（S1 未重定義；`20261114000001`、`20261115000001` 皆未碰），唯一差異依 Q1 裁決：

- **建議案（Q1-a）**：`v_check_code := v_ref_code`（兩種 source 都驗單上的碼）。驗不過時 `fresh_referrer_invalid` 的 context 多帶 `current_default_code`（source＝default 才帶），message 依「單上碼≠目前預設碼」分成「預設推薦碼已更換且原碼已失效」與「已停權或失效」兩句。0d 其餘、鎖序、例外隔離不變。
- 為什麼建議 a：意圖存在訂單上是 #514 的設計主軸（建單決定、付款重驗合法性 W5-56）；結果可由單據重現；確認框本就不揭露預設推薦人是誰，「將改變」在 a 案下仍為真。代價：後台換預設碼後，最長 3 天內付款的新約仍綁舊預設推薦人（舊碼仍有效時）。

### 2.3 C：drop 三參數 prepare

同一支 migration（或 `20261117000002`，實作時定；兩者正式站安全性相同）：`drop function if exists public.prepare_payment_order(uuid, text, text);`。
正式站安全：main 的 Edge 已呼叫六參數版；Supabase 整合先套 migration、Edge 核准後才換——兩個時點的 Edge 都不呼叫三參數版。開工前請主 session 再確認正式站／develop `/health` sha 仍 ≥ `f5a1ed8`（沒有回滾過）。

### 2.4 D：drop wrapper（W6-14）——建議延後

`complete_paid_pending_orders` 正式站現役。若 S6 與 S1 同一次晉升：migration 先 drop、Edge 等人工核准才換 → 這段空窗內正式站 `/profile`（有卡單旗標時）與 reconcile heal 的 RPC 全失敗（PGRST202）。正式站 Edge 在 S1 版本上線前，任何 drop 都會撞這個空窗。

建議：本 PR 不 drop；在 `supabase/README.md` 與 `20261115000001` 退場註解所指處改寫退場條件「正式站 `/health` sha 已含 #524 的 Edge 後的下一次晉升」，列第 7 波首項（Q2）。直接呼叫它的測試（現算：`complete-paid-pending-orders.test.ts`、`renewal-referrer-intent.test.ts`、`subscription-period.test.ts`、`referral-reward-failure-alert.test.ts`、`profile-self-heal.test.ts`）一併延後改。

### 2.5 E：部署前確認 migration（W5-62）

- 新 `scripts/check-remote-migrations.py`：輸入 repo `supabase/migrations/*.sql` 的版本清單與遠端已套用清單（JSON），輸出缺漏版本；`--self-test` 表格案例（全齊、缺一支、遠端多出、空白遠端、格式錯）。註冊進 `framework-check.sh`。
- `deploy-supabase.yml` 新 step「確認 migration 已套用」，位置在「解析目標 project ref」之後、「寫入本次部署的 commit sha」之前：
  - 讀遠端：Management API `GET https://api.supabase.com/v1/projects/$REF/database/migrations`（唯讀、不跑 SQL；`journey.yml` 已以同 token 打 Management API）。若實作時確認此端點不可用，退用 `POST .../database/query` 跑 `select version from supabase_migrations.schema_migrations`（Q4）。
  - 輪詢：缺版本時每 30 秒重讀，上限 10 分鐘（E2；整合套用通常在 CI 跑完前已完成）；讀取錯誤不輪詢、直接失敗（E3）。
  - job `timeout-minutes` 15 → 25（輪詢 10 分＋部署重試最長約 3 分＋煙霧 2 分）。
  - 失敗訊息寫進 `::error::` 與 job summary：缺哪幾支版本；處置「到 Supabase 儀表板看 migration 套用紀錄，套好後 Re-run」。
- 機械把關：`check-workflows.py` 加規則 14「deploy-supabase.yml 中 `supabase functions deploy` 的 step 之前必須有呼叫 `check-remote-migrations.py` 的 step」，附 `--self-test` 案例；`.claude/rules/github-actions.md` 補規則 14 段（含「為什麼」）。
- develop 與 main 同一步驟（develop 是 persistent branch，ref 由同一段解析）。

## 3. 架構影響

- 動：`supabase/migrations/2026111700000x`（新）、`supabase/functions/api/index.ts`（只 `/subscriptions/status` renewal 段）、`_shared/api-contract.ts`、`src/utils/freshRenewalCopy.ts`、`src/components/PaymentCheckout.tsx`（傳新欄位）、`.github/workflows/deploy-supabase.yml`、`scripts/check-remote-migrations.py`、`scripts/check-workflows.py`、`scripts/framework-check.sh`、`.claude/rules/github-actions.md`；文件：規格書 §6.2（推薦人句四態→五態、0d 驗單上碼）、§7.4（如 Q1 改語意）、`supabase/README.md`（三參數 prepare 移除、wrapper 退場條件）、`launch-wave-6/plan.md` §4 4a（由主 session 改）。
- R5 §1.1 已核實的交互不動：鎖序（訂單 → advisory → profiles）、0a′ try 鎖、例外隔離、`v_duplicate` 不換線、changed_at 交易層設定。
- 檔頭逐支寫「基準＝X，唯一差異＝Y」；版本號排在 `20261115000001` 之後、避開 S3 的 `2026111600000x`；rebase 後跑 `check-migration-versions.py`。
- 安全：新 step 只讀；token 不輸出（curl 不加 `-v`、錯誤只印 HTTP 狀態碼）。

## 4. UI/UX

- 只改文案分支，無新元件。新句「您的推薦人維持不變。」與既有「您的推薦人維持 {姓名}。」同句型，不出現名字（W5-63）。用語照 W5-53。
- 手機（375px）：句長短於既有句，不影響版面；確認鈕顏色規則（有資產紅實心）不變。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | A 後端：status 第三態＋契約 | `subscriptions-status.test.ts`（Deno 整合）；`api-contract.test.ts` 形狀 | 現任＝預設 → `IsCurrent=true`；現任≠預設、預設不可用 → false；紅燈：欄位缺 |
| 2 | A 前端：文案第三態 | `freshRenewalCopy.test.ts`、`PaymentCheckout.test.tsx`（jsdom） | A1～A3；三處文案同一判斷 |
| 3 | B：0d 驗單上碼＋告警分句 | `renewal-referrer-intent.test.ts` 加案（建單後換預設碼、舊碼仍有效／已失效） | B1、B2；既有 0d 案全綠 |
| 4 | C：drop 三參數 prepare | `renewal-referrer-intent.test.ts`（`to_regprocedure` 為 null）；改 `prepare-payment-order.test.ts`、`duplicate-payment.test.ts` 改呼叫六參數版、刪 LEGACY 案與權限測試的三參數簽章 | C1；**改既有測試需業主授權**（見 Q5） |
| 5 | E：部署前確認 migration | `check-remote-migrations.py --self-test`、`check-workflows.py --self-test`（規則 14） | E1～E3 以表格案例覆蓋；workflow 本身合進 develop 後第一次 develop 部署為實地驗證（PR 內文列為未驗項） |
| 6 | 文件同步＋收尾 | `check-spec-drift.py`、`check-migration-versions.py`、`check-plans-scaffold.py` | 規格書 §6.2／README 與程式一致；刪規劃檔 |

D（W6-14）依 Q2：若業主選本波做，加階段 4b（drop wrapper＋改五支測試），且 PR 必須在本波晉升**之後**才合。

## 6. 開放問題

- [ ] **Q1（B 語意）**：新約留空、建單到付款之間後台換了預設推薦碼，付款時綁誰？
  a.（建議）單上記的舊預設推薦人（舊碼仍有效就換；失效才維持原推薦人＋告警分句）；
  b. 付款當下的新預設推薦人（重驗新碼合法性與成環，改寫單上意圖）；
  c. 維持今日語意（不換線），只把告警分成「預設碼已更換」與「失效」兩種。
- [ ] **Q2（D 時機）**：drop `complete_paid_pending_orders`——a.（建議）延第 7 波，等正式站跑過 S1 的 Edge 一輪；b. 本 PR 做，但 PR 等第 6 波晉升完成後才合（等於落到下一次晉升）。
- [ ] **Q3（#514 P2-3 競態）**：a.（建議）本波不處理（已有 error 告警、視窗極小）；b. 一併處理（確認框改中性句或付款前再查一次）。
- [ ] **Q4（E 讀遠端的方式）**：Management API `database/migrations`（建議，唯讀）或 `database/query` 跑 SQL；雲端容器連不到 api.supabase.com，兩者都只能在 workflow 內實測——是否接受「合進 develop 後第一次 develop 部署才實地驗證」，失敗時 develop 部署會紅（不影響正式站）。
- [ ] **Q5（授權）**：階段 4 需改既有測試（三參數版呼叫、權限測試簽章、LEGACY 案），請業主在本 session 以互動選項授權。

## 7. 風險與回滾

- B：0d 改壞會讓新約換線錯誤——以既有 0d 全部案例＋新案守住；回滾＝新 migration 以 `20261113000003` 的定義 create or replace。
- C：若有未知呼叫端仍用三參數版 → 建單 500。緩解：開工前主 session 確認兩環境 `/health` sha；回滾＝重建 wrapper（`20261113000002` 原文）。
- E：端點錯或權限不足 → develop／main 部署全紅（fail-closed，線上停在舊版、不壞）。回滾＝revert workflow（合進 develop 即生效，workflow_run 取 default branch 定義）。
- E 輪詢上限內整合仍未套 → 紅燈，人工確認後 Re-run（正式站原本就要人工核准）。
- A：`referred_by_is_default` 對「填碼者剛好填到預設推薦人」會變 true（既有 0d 行為，非本 PR 引入），之後結帳頁不顯示「目前：碼」。
