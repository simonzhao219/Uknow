# 新約與部署收尾（第 6 波 S6）規劃書 v2.1

<!-- plans-keep: 跨 session 施工鷹架（主 session 審、業主親打 /tdd-implement）；退場條件＝/tdd-implement 收尾時刪除 -->

基準：develop `47cf1953`（S1 #524、S3a #521 已合）。上游：`launch-wave-6/plan.md` §2 S6、W6-1、W6-14；
`launch-wave-5/plan.md` §0 W5-62、W5-63；R5＝`launch-wave-5/review.md` §1.3 P2-6；#514 內文「偏離」段 P2-3。
v1→v2：套業主 W6-27～29、主 session W6-30，處置 `review.md` v1 的 P1 8／P2 15（對照見 §8）。

**本波裁決（編號由主 session 發）**
- W6-27（業主）：新約留空、建單後換了預設碼 → 綁**建單時單上記的舊預設**；舊碼失效才維持原推薦人，告警分「預設碼已更換」與「失效」。
- W6-28（業主）：第三態寫「您的推薦人維持不變。」；規格書 §7.4 寫明「不揭露」只管預設推薦人的姓名與碼。
- W6-29（業主）：接受「填碼者剛好填到預設推薦人」新約付款後 `referred_by_is_default` 變 true、結帳頁不再顯示「目前：碼」。
- W6-30（主 session）：D 延第 7 波、本 PR 不做；#514 P2-3 競態本波不處理、規格書寫明；status 新讀取失敗降級成欄位缺；規則 14＋timeout 都做。
- 業主 2026-11-08 本 session 互動選項（與上同向）：「綁建單時的舊預設」「延到第 7 波」「可以，只不露姓名與碼」「降級，走今日文案」。

## 0. 一句話

續費選新約的會員在確認框看到的推薦人句與付款結果一致、0d 換線驗的是單上記的碼；部署 workflow 在 migration
沒套齊時拒絕推 Edge；清掉部署空窗用的三參數 `prepare_payment_order`。

## 1. 使用者需求

### 1.1 範圍

| 項 | 出處 | 現況（逐條核過程式碼） | 要的結果 |
|---|---|---|---|
| A | W5-63、W6-28 | `freshReferrerSentence`（`src/utils/freshRenewalCopy.ts`）留空時只看 `defaultAvailable`：true →「將改變」；後端 `resolveFreshDefaultReferrer` 不比對現任推薦人。現任＝預設時 0d 寫回同一人，確認框卻寫「將改變」，新碼欄說明也寫「不填則推薦人將改變」 | status 回第三態；確認框「您的推薦人維持不變。」、說明與 placeholder 歸「留空＝維持」，不出現預設推薦人姓名或碼 |
| B | R5 P2-6、W6-27 | `20261113000003` 0d：source＝default 時重讀付款當下的 `reward_config.default_referrer_code`，與建單時解析的 `v_ref_user` 比 → 換碼後誤寫「已停權或失效」並維持原推薦人 | 0d 一律驗單上的 `fresh_referrer_code`；失效時告警分句 |
| C | `20261113000002:151`「下一波 drop」 | 三參數版是委派六參數版的 wrapper；main `f5a1ed8` 的 `index.ts:2242` 已呼叫六參數版（規劃者 `git show` 核過） | drop 三參數版、改仍呼叫它的測試 |
| E | W5-62、W6-30 | 只靠晉升清單人工 4a | 部署 Edge 前自動比對目標環境 `schema_migrations` 與 repo 每支版本，缺任一支就失敗、不寫 DEPLOY_SHA、不部署 |

D（W6-14 drop `complete_paid_pending_orders`）依 W6-30 延第 7 波：main 的 Edge 仍直接呼叫它（`/profile` heal、reconcile heal），
與 S1 同次晉升時 migration 先 drop、Edge 等核准才換，空窗內兩條路徑失敗。本 PR 只改 `supabase/README.md` 的退場條件
（「正式站 Edge 含 #524 之後的下一次晉升」），不動已套用的 `20261115000001` 註解。

### 1.2 驗收情境

- A1：曾訂閱、現任推薦人＝預設推薦人（填碼或自動綁定皆同）、新約留空 → 確認框「您的推薦人維持不變。」；說明＝今日「不可用」那句；placeholder「輸入推薦碼」（不顯示「目前：碼」——那個碼就是預設碼）。
- A2：現任≠預設、預設可用 →「將改變」；預設不可用 → 不寫推薦人句、placeholder 照今日（`!isAutoReferral` 才顯示「目前：碼」）。皆不回歸。
- A3：`freshDefaultReferrerIsCurrent` 缺（舊後端，或新讀取失敗降級）→ 行為同今日。
- A4：status 讀現任推薦人失敗 → 仍 200，欄位缺，其餘欄位照常（W6-30）。
- B1：source＝default 的新約單，建單後後台換了預設碼、單上舊碼仍有效 → 付款後推薦人＝舊預設推薦人、`referred_by_code`＝舊碼、無告警。
- B2：同上但單上舊碼已失效 → 維持原推薦人、`fresh_referrer_invalid` error，message 為「建單時的預設推薦碼已被更換，且原碼在付款當下已停權或失效…」，context 帶 `current_default_code`。
- B3：預設碼未換、單上碼失效 → 今日 message「被選的推薦碼在付款當下已停權或失效…」（不回歸）。
- B4：後台把預設碼清空（unset）後付款、舊碼仍有效 → 照 B1 綁舊預設（W6-27 的已知結果，規格書寫明）。
- B5：source＝code 的所有既有 0d 案不回歸。
- C1：`to_regprocedure('public.prepare_payment_order(uuid,text,text)')` 為 null；六參數版行為、權限、無 default 不變。
- E1：缺任一版本 → step 紅、後續 step 不跑、走既有「開 issue＋LINE」。
- E2：第一次讀缺、之後套齊 → 輪詢放行。
- E3：401／403／5xx／逾時／回應不是版本陣列 → 立即失敗（不輪詢），訊息標「讀不到套用紀錄」，與「缺版本」分開。

### 1.3 不做（W6-30；規格書 §6.2 寫明這兩個視窗）

- #514 P2-3：讀 `/subscriptions/status` 之後才成環 → 確認框「將改變」、0d 判成環維持原推薦人並告警。
- 同類變體：status 判成「維持不變」或「將改變」後、建單前後台換了預設碼 → 建單綁新預設，句子可能不符。
- 3b／3d 仍 warning、`repair_orphaned_*` 單交易、單筆開通 sqlerrm 進 message（第 7 波）；ops P0-1 殘餘（token 在 job 層 env）。

## 2. 系統設計

### 2.1 A：第三態

- 契約 `_shared/api-contract.ts` `RenewalInfo` 加 `freshDefaultReferrerIsCurrent: optional(bool())`。前端經 `@contract` 別名 import 同一份（`tsconfig.json:24`、`vite.config.ts:79`），沒有第二份型別。保留 `freshDefaultReferrerAvailable` 型別不變（部署空窗相容）。
- `/subscriptions/status` renewal 分支：`resolveFreshDefaultReferrer` 回 ok 時才多讀 `profiles.referred_by_user_id`（`maybeSingle`）。讀取 error → `console.error`、欄位省略（不經 `must()`，W6-30；這是 #360「不做部分降級」的明示例外，理由：純文案欄位，缺值時前端走既有文案，不捏造事實）。值＝`referrerUserId === referred_by_user_id`（null 為 false）。
- `freshRenewalCopy.ts`：`FreshReferrerInput` 加 `defaultIsCurrent?: boolean`；抽 `blankFreshOutcome(available, isCurrent): 'changes' | 'keeps_same' | 'keeps'`，三函式共用：
  - 句子：changes →「您的推薦人將改變。」；keeps_same →「您的推薦人維持不變。」；keeps → null。
  - hint：changes → 今日 true 句；keeps_same 與 keeps → 今日 false 句「選擇新約會重新建立推薦關係。不填推薦碼則維持原本的推薦人。」。
  - placeholder：keeps 且 `!isAutoReferral` →「目前：{碼}」；其餘「輸入推薦碼」。
- `PaymentCheckout.tsx`：傳 `renewal?.freshDefaultReferrerIsCurrent`；`fresh-code-hint` 加 `id` 並併入輸入框 `aria-describedby`（與錯誤 id 並列）。
- 付款端不改：0d 寫回同一人；`track_referred_by_change` 只在推薦人實際改變時動 changed_at，edges upsert 有 `is distinct from`；`referred_by_is_default` 變 true（W6-29）。

### 2.2 B：0d 驗單上的碼

新 `20261117000001_fresh_rewire_order_code.sql`：`process_successful_payment` 基準＝`20261113000003`（之後的 `20261114000001`～`20261116000004` 皆未重定義，已 grep）。唯一差異：

1. `v_check_code := coalesce(v_ref_code, <今日的 reward_config 讀法>)`——兩種 source 都以單上碼為準；`fresh_referrer_code` 為 null 的 default 單（理論上只有本檔套用前、舊 Edge 建的單；正式站與 develop 目前 0 張 pending fresh，主 session 11/08 代查）退回今日語意，不誤報。
2. `fresh_referrer_invalid` 分支：source＝default 時在**自己的** `begin … exception when others then null` 內讀目前預設碼（讀失敗＝null，不會把外層 0d 子交易打成 `fresh_rewire_failed`）；`current_default_code is distinct from v_check_code` → 新 message（B2），否則今日 message（B3）。context 加 `current_default_code`。
- `referred_by_code`＝`v_check_code`＝單上碼（B1、B4）。鎖序、0a′、例外隔離、`v_duplicate` 不換線皆不動（R5 §1.1）。

### 2.3 C：drop 三參數 prepare

新 `20261117000002_drop_legacy_prepare_payment_order.sql`：`drop function if exists public.prepare_payment_order(uuid, text, text);`。不動 `20261113000002` 原文。
正式站安全：Supabase 整合先套 migration、Edge 核准後才換；兩個時點的 Edge（main `f5a1ed8` 與本波）都只呼叫六參數版。

### 2.4 E：部署前確認 migration

- 新 `scripts/check-remote-migrations.py`，整段邏輯在 Python（fetch、分類、輪詢、退出碼），fetch 與 sleep 可注入：
  - 讀 `GET https://api.supabase.com/v1/projects/$REF/database/migrations`（唯讀，`Authorization: Bearer $SUPABASE_ACCESS_TOKEN`）。回應須為陣列、元素含 `version`；版本一律轉字串比對。不符＝格式錯（E3）。不退用 `database/query`（可跑任意 SQL，不唯讀）。
  - repo 版本＝`supabase/migrations/*.sql` 檔名前綴（與 `check-migration-versions.py` 同一解析，抽共用函式或照抄並互相註明）。
  - 判準：repo 每支都在遠端（遠端多出的不管）。主 session 11/08 代查：develop 97／97 對齊、正式站 91 支＝缺的正是本波未晉升的 6 支，無歷史漂移，所以全量比對成立，不設基線截斷或豁免清單。
  - 輪詢：缺版本時每 30 秒重讀，上限 10 分鐘；讀取錯誤立即失敗（E3）。退出碼 0＝齊、1＝缺版本、2＝讀不到。缺版本時印出缺哪幾支；token 不印、錯誤只印 HTTP 狀態。
  - `--self-test` 表格：齊、缺一支、遠端多出、遠端空、版本為數字、回應非陣列、401、5xx、第二輪才齊、10 分鐘仍缺。註冊進 `framework-check.sh`。
- `deploy-supabase.yml`：新 step「確認 migration 已套用」，在「解析目標 project ref」後、「寫入本次部署的 commit sha」前，只呼叫腳本一次；job `timeout-minutes` 15→25（輪詢 10＋部署重試最長約 3＋煙霧 2＋餘裕；production 核准等待不計入 job timeout）。輪詢期間同分支新 push 會因 `cancel-in-progress: true` 取消本次——預期語意（規則 11），新部署會重跑檢查。
- `check-workflows.py` 規則 14：`deploy-supabase.yml` 中執行 `supabase functions deploy` 的 step 之前，必須有呼叫 `scripts/check-remote-migrations.py` 的 step（附 self-test 案例）；`.claude/rules/github-actions.md` 補規則 14 段。
- 晉升清單 4a（主 session 改 `launch-wave-6/plan.md` §4）：production 核准在 job 開始前，新 step 是核准**後**的第二道防線，不取代核准前的人工 4a。4a 簡化建議：「develop 最近一次部署的此 step 綠＋正式站 `schema_migrations` 含本次新版本」；函式存在性由「migration 已套」涵蓋。

## 3. 架構影響

- 動：`supabase/migrations/20261117000001`、`20261117000002`（新）、`supabase/functions/api/index.ts`（只 status renewal 段）、`_shared/api-contract.ts`、`src/utils/freshRenewalCopy.ts`、`src/components/PaymentCheckout.tsx`、`.github/workflows/deploy-supabase.yml`、`scripts/check-remote-migrations.py`（新）、`scripts/check-workflows.py`、`scripts/framework-check.sh`、`.claude/rules/github-actions.md`。
- 文件：規格書 §6.2（推薦人句加第三態、§1.3 兩個不處理視窗、0d 驗單上碼）、§7.4（`:487-488`「不填碼不等於維持原狀」加限定「現任即預設時推薦人不變」；W6-28 不揭露範圍；W6-27 換碼／清空時在途單綁舊預設；`:504` 用語順修）；`supabase/README.md`（三參數 prepare 移除、wrapper 退場條件、0d 驗單上碼）；`docs/supabase-setup-checklist.md` 若有部署順序段一併提 E。
- 檔頭逐支「基準＝X，唯一差異＝Y」；rebase 後跑 `check-migration-versions.py`。

## 4. UI/UX

- 只改文案分支，無新元件；新句與「您的推薦人維持 {姓名}。」同句型、不出現名字。用語照 W5-53。375px 下句長短於既有句。
- 錯誤態：A4 降級後畫面與今日相同，無新錯誤態。a11y：hint 進 `aria-describedby`。
- 部署空窗（新前端、舊後端）時現任＝預設的會員仍看到「將改變」，直到新 Edge 上線（§7）。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | A 後端：status 第三態＋契約＋降級 | `subscriptions-status.test.ts`（Deno 整合；A4 以攔截 `profiles` 讀取注入錯誤，照該檔既有寫法） | 現任＝預設 → true；≠ → false；預設不可用 → 欄位省略；讀取失敗 → 200 且欄位省略 |
| 2 | A 前端：文案三態＋a11y | `freshRenewalCopy.test.ts`（逐字斷言三態句、hint、placeholder）、`PaymentCheckout.test.tsx`（jsdom：A1～A3、`aria-describedby` 含 hint id） | A1～A3 |
| 3 | B：0d 驗單上碼＋告警分句 | `renewal-referrer-intent.test.ts` 加 B1～B4 | B1～B5；既有 0d 案全綠 |
| 4 | C：drop 三參數 prepare | 新案：`to_regprocedure` 為 null。改既有（**需業主授權**）：`renewal-referrer-intent.test.ts` LEGACY 案（約 `:240-250`）刪除、權限案（約 `:499-512`）拿掉三參數簽章；`prepare-payment-order.test.ts` `callRpc`（約 `:35`）與 raw SQL（約 `:180`）改六參數並改讀 `outcome`；`duplicate-payment.test.ts`（約 `:275`）同。行號開工時現算 | C1；改後各檔全綠 |
| 5 | E：部署前確認 migration | `check-remote-migrations.py --self-test`、`check-workflows.py --self-test`（規則 14）＋`check-workflows.py` 對真檔 | E1～E3 全由表格覆蓋；實地驗證＝合進 develop 後第一次 develop 部署、晉升後第一次正式站部署（PR 未驗項） |
| 6 | 文件同步＋收尾 | `check-spec-drift.py`、`check-migration-versions.py`、`check-plans-scaffold.py` | 規格書、README 與程式一致；刪規劃檔 |

## 6. 開放問題

- [ ] 階段 4 改既有測試：請業主在本 session 以互動選項授權（tdd-implement 開到階段 4 前問）。

## 7. 風險與回滾

- B：改壞 0d → 新約換線錯。以既有 0d 案＋B1～B4 守住；回滾＝新 migration 以 `20261113000003` 定義 create or replace。
- C：未知呼叫端仍用三參數 → 建單 500。已核兩環境 Edge 與 repo 皆無；回滾＝依 `20261113000002` 原文重建 wrapper。
- E：端點或 token 權限不符 → develop／main 部署紅（fail-closed，線上停舊版、不壞）。develop 先暴露；回滾＝revert workflow（合進 develop 即生效）。正式站首次部署才會碰到 main 的實際回應，列 PR 未驗項。
- E 輪詢上限內整合仍未套 → 紅，人工確認後 Re-run。
- A：部署空窗內舊後端不回新欄位，現任＝預設者仍見「將改變」（今日行為）。

## 8. v1 審查處置對照（`review.md` v1 編號）

1→§2.4 判準＋主 session 代查（無漂移，全量成立）｜2→§2.4 邏輯全進 Python｜3→§2.2 ①②與 B4｜4→W6-28｜5→§2.1 placeholder（keeps_same 不顯示碼）｜6→W6-30 降級（A4）｜7→W6-29｜8→§2.1 `@contract` 同一份｜9→§2.4 末段｜10→§2.4 schema 驗證、不退用 query｜11→§5 階段 4｜12→§1.3｜13→§1.1 D、§2.3｜14→兩支 migration｜15→§2.4｜16→§2.1 三態字串｜17→§4、§7｜18→§2.1 a11y｜19→§3 文件｜20→W6-27 定稿 B1～B4｜21→W6-30｜22→§2.4 4a｜23→D 不做，不需 D1

## 9. v2 審查處置（`review.md` 第 2 輪；本節優先於前文）

- R2-1（需求 P1）規格書 §7.4「換線到使用者親自填的推薦碼時於付款成功時重置為 false」一句加例外（W6-29）：新約留空而預設推薦人即現任時，旗標為 true，之後結帳頁不顯示「目前：碼」。§7.4 改動一律**以內容定位**（行號會漂）：「不填碼不等於維持原狀」加限定、「續約文案只說『留空表示不指定推薦人』」改成與現行文案一致、W6-28 的不揭露範圍寫在同段、W6-27 換碼／清空寫一句。§1.3 兩個不處理視窗只寫在 §6.2 一處。
- R2-2（架構 P1）規則 14 改為三條：(a) 以去掉註解行後的 step 序號比順序（同規則 12 的做法，避開 `_steps()` 把註解歸給上一個 step）；(b) 呼叫 `scripts/check-remote-migrations.py` 的 step 必須排在第一個含 `supabase secrets set` 或 `supabase functions deploy` 的 step 之前；(c) 該 step 不得有 `continue-on-error`、`if:`，指令不得含 `|| true`。範圍＝`deploy-supabase.yml`，檔案不存在即紅；`journey.yml` 部署的是拋棄式分支（migration 由 branch replay 建立），不在範圍——寫進 github-actions.md 規則 14 段。self-test 每條各一反例。
- R2-3（系統 P2）B 的告警分句改三分：內層讀目前預設碼設旗標 `v_cur_read_ok`。讀失敗 → 今日 message（B3）＋context `current_default_code_read_failed: true`；讀成功且目前為 null（unset）→「預設推薦人機制已停用，且建單時的預設推薦碼在付款當下已停權或失效…」；讀成功且不同 → B2 message；相同 → B3。補驗收 **B6**（unset＋舊碼失效）。
- R2-4（系統 P2）每次 HTTP 請求 timeout 15 秒；`URLError`、`socket.timeout`、連線重置等一律正規化成「讀不到」（退出碼 2）；token 空時退出碼 2 並印「未設定 SUPABASE_ACCESS_TOKEN」、不印值。self-test 加：逾時、URLError、空 token。
- R2-5（架構 P2）版本解析定案：遠端腳本自帶 `^(\d{14})_.+\.sql$`，不符者略過（M2 由 `check-migration-versions.py` 管），兩檔註解互相指向，不新增 import 依賴；self-test 加「repo 含格式不符檔名」。
- R2-6（架構 P2）輪詢上限以 `--max-wait 600` 引數傳入，workflow step 註解寫明 `timeout-minutes: 25`＝10（輪詢）＋3（部署重試）＋2（煙霧）＋餘裕。
- R2-7（UI/UX P2）`aria-describedby`：平時＝hint id；invalid 時＝「錯誤 id hint id」（錯誤在前）。階段 2 兩種都斷言。checking／unavailable 文字的既有 a11y 債不在範圍。
- R2-8（系統 P2）`fresh_referrer_missing` 的 context 碼不改（唯一差異原則，非本題）。
- R2-9（業主 11/08 18:23 接受）自動綁定者（`isAutoReferral`）手動填入恰好等於現任（＝預設）推薦人的碼 → 確認框寫「將改為 {姓名}」，與留空的「維持不變」不一致。要修就得讓前端知道「填的碼等於現任」，等於洩漏預設碼（與 W6-28 衝突）。建議：接受，記入 §6.2 不處理視窗旁一句。
