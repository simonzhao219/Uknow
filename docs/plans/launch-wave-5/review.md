# 第 5 波審查報告（審查 session R5，2026-11-07）

<!-- plans-keep: 第 5 波審查報告；與 launch-wave-5/plan.md 同生命週期——第 6 波審查 session（R6）依 §6「升級進長期文件」逐條處置後，隨整個 launch-wave-5/ 目錄刪除 -->

範圍：`git log --first-parent 26c5ae8..f5a1ed8`（第 5 波晉升 #516，11/07 18:58 台北合進 main；`production` 核准後
deploy-supabase run 42365227288 於 10:56 UTC 完成，含 `/health` sha 比對；deploy-smoke run 42366062154 綠）。
程式 PR 9 支：#507（S5）、#508（S3）、#510（S2）、#512（S1）、#513（S8）、#511（S4）、#514（S6）、#509（S7）、#515（正式站 PostHog key）。
198 檔，+16,760／−1,152 行；migration 7 支（`20261111000001～3`、`20261112000001`、`20261113000001～3`）。
`f5a1ed8` 與 develop `e6c2835` 的樹相同，行號兩者通用。

審法：#510、#511、#512、#514、#509 合併前已有獨立 Opus 審查（P0／P1 清零，摘要在各 PR 內文與 plan §8），本輪只找那幾輪沒看到的
**跨 PR 交互**。金流與推薦（S2、S6、S1）由本 session 親讀 migration 與 `index.ts` 的 prepare、對帳、自癒路徑；前端錄影遮罩 × S7 新元件、
PaymentCheckout 的 outcome 分支派一個子 agent；PR 未驗項與 Actions、第 4 波退場盤點各派一個子 agent。子 agent 的候選由本 session
逐條讀碼核實後才收（§1.4 列推翻與降級）。

**總結：P0 0、P1 0、P2 9。** 點名的三組交互都核實沒有問題（§1.1）。最值得先修的是 P2-1：PaymentCheckout 對 prepare 的
「自己的推薦碼／碼已失效」400 沒有專屬處理，欄位仍顯示已驗證，使用者會一直重按。另有一條既有缺陷（P2-5）：批次自癒與線上付款的
profiles 列鎖可以互鎖，W5-61 只修了 advisory 那一種。被選中的一方會漏發獎金、只留 warning，要等下次載入 `/profile` 才會自癒補發。

## 1. 發現

### 1.1 已核實沒問題的（派工點名的交互）

| 交互 | 核實 |
|---|---|
| S2 `prepare_payment_order`（`20261111000002`）× S6 六參數版（`20261113000002:46`） | 三參數版改成委派六參數版的 SQL wrapper（:153），舊 Edge 拿到新 outcome（`paid_pending`、`mode_required`）會回 500，屬 fail-closed。六參數版刻意不給 default，避免 PGRST203 多載歧義。新 Edge 一律帶六個具名參數（`index.ts:2238`）。鎖改成 `for no key update`，仍與付款的 `for update` 互斥，S2 的序列化不變 |
| S2 重複付款 `v_duplicate` × S6 換線 0d、清帳本 3-0 | 0d 與 3-0 都加了 `not v_duplicate`（`20261113000003:224`、`:320`）。判準是 `end_date >= v_paid_at`：對帳收斂時 PayTime 缺漏、退回建單時點，任何仍在效期的訂閱照樣判成重複，不會因為付款時點往前偏移而誤清帳本 |
| S1 帳本／租約 × S6 W5-61 批次 try 鎖 | heal pass 的 `complete_paid_pending_orders(null)` 在租約內執行（`reconcile-handler.ts:65`）。U6R01 記為 `skipped_locked`，不寫告警（`20261113000003:802`），下一輪補。per-user 自癒（`/payuni/result`、`/profile`）也帶 try 旗標。`uknow.rewire_try_lock` 用 `set_config(..., true)` 設定，交易結束就失效 |
| S6 `uknow.referred_by_changed_at` 在批次中跨單殘留 | 成功的子交易會把設定留到下一筆。但交易內另外兩個寫推薦人的點（0d、3a-bis）寫入前都會自己重設，沒有其他寫入點會讀到殘值，所以無害 |
| S1 對帳標 expired × S6 意圖欄 | 標過 expired 的單晚到付款時，`process_successful_payment` 只跳過 completed 的單，照常收斂並讀單上的意圖，不會遺失換線 |
| S4 錄影遮罩 × S7 新元件 | `maskTextSelector:'*'` 加 `maskAllInputs`，屬性走白名單（`analyticsConfig.ts:42-89`、`:197-198`）。`PhotoCarousel` 的 `aria-label`（含刊登者名）、`data-listing-id`、`data-nav-dir` 都會遮成 `***`。座標只存在模組記憶體（`homeListingsCache`），不進 DOM、URL 或 history.state。FLIP 動畫走 WAAPI，不改屬性 |
| S4 × S6 新約確認框、S2 停權文案、S3 錯誤處理 | 都在 `/payment/checkout`，這一段整段不錄（`analyticsGate.ts:8`），外層還包了 PrivateRegion。CompleteProfile 的身分證、生日、手機也已列入 `SENSITIVE_FIELDS` |
| 前端對 prepare 每個 outcome 的分支 | 403 停權、409 已付款待開通（有單號與無單號兩種）、400 `RENEWAL_MODE_REQUIRED`、`REFERRAL_CYCLE` 都有專屬分支。500、404、提領審核中走一般 toast（例外見 P2-1、P2-3） |
| 用語（W5-53） | 新文案與後端訊息都沒有出現禁用詞；`src/terminologyGuard.test.ts` 把關 src（後端訊息不在掃描範圍，見 §2） |

### 1.2 P0／P1

無。

### 1.3 P2

| # | 檔:行（`f5a1ed8`） | 問題（具體輸入 → 錯誤結果） | 建議 |
|---|---|---|---|
| P2-1 | `src/components/PaymentCheckout.tsx:725`；`supabase/functions/api/index.ts:1122` | 續費者選新約、填自己的推薦碼 → `/referrals/validate` 不擋本人，回 valid，欄位顯示「推薦人：{本人}」，確認框寫「您的推薦人將改為 {本人}」→ 按確認後 prepare 回 400（`index.ts:2184`）→ 前端只跳一則 toast，欄位仍顯示已驗證，再按一次付款又重演一次。推薦人在驗證之後才被停權（`:2180`）也會掉進同一個循環 | 比照 S3 在 `CompleteProfile.tsx:635-649` 的處理：把欄位改成 invalid、清掉推薦人名、聚焦欄位。後端 validate 帶 token 時可以順手擋本人 |
| P2-2 | `PaymentCheckout.tsx:661`、`:729` | 閘道回 502／504 的 HTML，或行動網路斷線 → `response.json()` 擲錯 → toast 直接顯示「Unexpected token '<'…」或「Failed to fetch」。S3 已經在同檔的推薦碼驗證收掉這類字眼，送單這條路還沒有 | `.json().catch(() => null)`；catch 一律顯示「暫時無法建立訂單，請稍後再試」 |
| P2-3 | `PaymentCheckout.tsx:725` | 另一個分頁已經付完款，或建單 RPC 在鎖內回 active（`index.ts:2256`）→ 400「已有有效訂閱」只跳 toast，使用者留在結帳頁，付款鈕仍可按 | 強制重抓會員資料後導向 `/dashboard` |
| P2-4 | `PaymentCheckout.tsx:1376` | 新約確認框是 portal，不在 PrivateRegion 底下。框內有推薦人名、點數、補繳金額。現在只靠「`/payment/*` 整段不錄」這一道防線，路由規則一改就會露出 | `AlertDialogContent` 加 `privateClass()`，並列入 `SENSITIVE_PORTALS` |
| P2-5 | `supabase/migrations/20261113000003_referral_pair_history.sql:720`（批次）、`:191`（0b 鎖）；`20261113000001_referral_cycle_guard.sql:108`（gen1 `when others`） | **既有缺陷，W5-61 的同類**。批次自癒在單一交易內依序處理 U1、U2，U1 那筆的 profiles `for update` 要到整批結束才放。U1 是 X 的推薦人、X 是 U2 的推薦人時：線上 X 付款持有 profiles(X)，發 gen1 給 U1 要 FK KEY SHARE profiles(U1)，等批次；批次處理 U2，發 gen1 給 X 要 KEY SHARE profiles(X)，等 X → 40P01 死鎖。被選中方的錯誤被發獎函式的 `when others` 吞掉，只留 warning（推不到 LINE），該筆獎金漏發。補救：該會員下次載入 `/profile` 時 `repair_orphaned_payments` 會補發（#167 閘門放行），所以不會永久遺失 | 第 6 波：批次自癒改成每筆獨立交易（Edge 端迴圈呼叫單筆版），或每筆結束後不再持有本人列鎖。最低限度：`pay_referral_generations` 遇到 40P01／40001 時改寫 error 告警 |
| P2-6 | `20261113000003_referral_pair_history.sql:229` | 新約 source＝default：0d 用的是付款當下的 `reward_config.default_referrer_code`，不是單上記的碼。後台在建單到付款之間（最長 3 天）換了預設推薦碼 → `v_valid_user`（新預設）≠ `v_ref_user`（舊預設）→ 寫 error「被選的推薦碼在付款當下已停權或失效」並維持原推薦人。告警說錯原因，而且結果與使用者在確認框看到的不一致（確認框寫的是推薦人將改變） | 0d 驗 `v_ref_code`（prepare 已存進 `fresh_referrer_code`）；或保留現行語意，但把告警分成「預設碼已更換」與「失效」兩種 |
| P2-7 | `supabase/functions/api/index.ts:2858`；`reconcile-handler.ts:18-28` | 帳本 summary 只有 `unknownStatus` 的總數，沒有分 `unknown_code`、`missing_field`、`incomplete_too_long`。W5-44② 要看的「missing_field 計數」只能從 `system_alerts.context->>'statusReason'` 反查，而且告警按訂單去重，同一張單連續多輪只算一次 | summary 加 `unknownByReason`；W5-44② 第一輪先用 §3 的告警查詢代替 |
| P2-8 | `reconcile-handler.ts:70`、`:73` | heal pass 的結果（`failed`、`skipped_locked`、`amount_mismatch`）只出現在 HTTP 回應，沒寫進帳本 summary。看門狗與 `scheduler_health()` 都看不到「heal 連續失敗」或「連續被換線鎖跳過」。與 pay P2-14 同源（W5-18 已決定不收），但 plan §5 漏列 | 列進第 6 波候選（§6 補遺）；修的時候把 heal 摘要併進帳本 summary |
| P2-9 | `supabase/migrations/20261112000001_scheduled_job_runs.sql`（`invoke_internal_endpoint` 固定送 `trigger: 'pg_cron'`） | 人工在 SQL Editor 跑 `invoke_internal_endpoint('reconcile')`（乙段驗證就是這樣跑的）→ 帳本記成 `trigger=pg_cron`（正式站 id 1，10:57 UTC）→ `scheduler_health()` 的 `lastPgCronCompletedAt` 被人工那輪刷新。真正的 pg_cron 若剛好在這時停擺，看門狗會晚最多 90 分鐘才發現；現場判讀「首輪」時也會誤認 | 函式加 `p_trigger text default 'pg_cron'` 參數，人工驗證帶 `'manual'`；短期先在晉升清單乙段註明「此列是人工驗證」 |

### 1.4 被反駁推翻或降級的

| 候選 | 結論 |
|---|---|
| S6 `paid_pending` 讓「金額不符而留在 pending＋SUCCESS」的會員永遠 409、無法再買 | **已知、已裁決**：W5-50②「永久 409 → 接受，擋下時寫 system_alert 交客服」。不重複計數 |
| `uknow.referred_by_changed_at` 在批次自癒中跨單殘留，下一筆換線會記到前一筆的付款時點 | **推翻**：見 §1.1，寫入點都會先重設 |
| 對帳收斂時 `payuni_paid_at` 退回建單日，`v_duplicate` 會漏判，導致誤清帳本 | **推翻**：判準是 `end_date >= paid_at`，時點往前偏只會更容易判成重複 |
| A16（有審核中的提領就擋新約）只在建單時檢查，付款時不重驗 | **既有**＝ref P2-4。S2 的 `v_duplicate` 已擋掉稽核舉的「先付 extend、提領、再付 fresh」那條時序（付 fresh 時已在效期內 → 判成重複 → 不清帳本）。剩下「過期期間提領審核中、又付新約」，要看過期會員能否申請提領，列 §6 補遺 |
| 首頁距離排序可以反推使用者所在區（子 agent 原列 P2） | **降為接受的殘餘風險**：錄影的文字與圖片都已遮罩，要對齊文字長度，或拿點擊後 pageview 的刊登 id 才推得出來，結果只是區級近似，而且需要 PostHog 後台權限 |
| CompleteProfile 確認通知（portal）露出姓名、推薦人的字數 | **推翻**：與 input 遮罩本來就露出的長度相同，不是新的暴露 |
| 新約確認框遇到 `REFERRAL_CYCLE` 時，Radix 關閉後把焦點還給付款鈕，蓋掉 `PaymentCheckout.tsx:692` 的欄位聚焦 | **不列**：prepare 的往返（session 加多支 RPC）一般比關閉動畫的 200ms 長，競態很少發生 |
| S3 的 retryable 錯誤畫面與 S6 確認框同時出現 | **推翻**：確認框是 modal，`serverProfileUnconfirmed` 只是頁內 callout；停權時 `:812` 會提前 return，確認框跟著卸載 |

## 2. 未驗項

來源：#507～#516 的 PR 內文，對照 plan §8 與 Actions。

| PR | 自述未驗／待真實觸發／偏離 | 之後 | 結論 |
|---|---|---|---|
| #507（S5） | CSV 的 `="…"` 前綴不能直接上傳銀行批次；前端遇到 429 只顯示通用錯誤 | 已知限制（用途是人工核對） | 已記，未列候選 → §6 補遺 |
| #508（S3） | 同類掃描沒處理的兩條：`getAccessToken` 出錯回 null；ResetPassword、AuthPage 的 getSession 直接導走 | — | **未列候選** → §6 補遺 |
| #509（S7） | 手機實測三項（W5-66） | 業主 11/07 實測全部正常（plan §8 16:50） | 已驗 |
| #509 | 「南鄉」→「南州鄉」（W5-65）；P2 五項（reduced-motion、抽 hook、手勢 chunk 缺 error boundary、slide-in、手勢起點） | W5-65 已在 §5；P2 五項未列 | P2 五項 → §6 補遺 |
| #510（S2） | 已知限制：新約換線寫 profiles 早於建單 RPC | #514 改成意圖存在訂單上、付款時才換線 | 已由 S6 解（plan §8 沒寫結案，本表為準） |
| #511（S4） | PostHog 專案端勾選（丟棄 IP、關 console／Logs、exception autocapture 等，plan §6-6） | 未回報 | **未驗：待業主回報** |
| #511／#515 | develop 不驗錄影（W5-68）；上線當天業主抽看 5～10 支（W5-39） | — | **未驗：待業主**（§5-1） |
| #511 | 正式站 Network 面板確認 `/array/<key>/config`、`/flags` 不含 token、沒有 logs 端點請求；`/payment/*`、`/admin` 版面沒有塌陷 | 不在 §4、§6 | **未驗**，併入 §5-1 業主抽看 |
| #511 | `tel-national` 真機自動填入（W5-48） | — | **未驗：待業主真機** |
| #512（S1） | develop 甲段、乙段 | plan §8 11/07 16:35 | 已驗 |
| #512／#516 | 正式站甲段、乙段 | plan §8 18:58：invoke 200、帳本 succeeded | 已驗 |
| #512 | 正式站 `PHOTO_PURGE_LIVE=true` | #516 內文寫已設，plan §8 18:58 仍列「待業主確認」 | **未驗**：看今晚照片清理 pg_cron 首輪的 `summary.dryRun`（§3） |
| #512 | pg_cron 首輪（對帳 11:07 UTC、照片清理當晚） | 見 §3 | 見 §3 |
| #512 | 晉升後看門狗不再重複補跑（§4-3） | 10:56 UTC 部署後還沒有看門狗 run。10:38 UTC 那輪排程有「判讀」與「補跑」兩步（正式站當時還沒有 pg_cron 完成列，很可能真的補跑了），LINE 與開 issue 步驟 skipped | **未驗**：看部署後第一、二輪看門狗 |
| #512 | `unknownStatus`／`missing_field` 計數（W5-44②） | 見 §3、P2-7 | 見 §3 |
| #513（S8） | 後端錯誤訊息不在用語掃描範圍 | — | **未列候選** → §6 補遺 |
| #514（S6） | journey f70 缺章（W5-60）、W5-62 自動檢查、P2-3、W5-63 | 都已在 §5 | 第 6 波 |
| #514／#516 | W5-62 核准前確認 migration 已套用 | plan §8 18:58：7 支已套用、六參數版與 `referral_would_cycle` 都在、cron.job 5 列、pg_net 已裝 | 已驗（人工；自動化在 §5） |
| #514 | 配對名單回填 | 18 列（預查 15 列，差額是 11/05 之後的新配對） | 已驗；來源差集見 §3 Q4 |
| #516 | 正式站部署 | 42365227288 success（10:44 建立、約 12 分等核准、10:56 完成；`/health` sha 比對步驟 success）；deploy-smoke 42366062154 success | 已驗。註：這兩支 run 的 head_branch／head_sha 顯示 develop `e6c2835`，是 `workflow_run` 事件的特性（第 4 波 #502 也一樣）；觸發來源是 main push CI 42365208498（`f5a1ed8`） |
| 第 4 波遺留 | K2（#485）deploy-smoke fallback 告警、缺 secret 時的紅色 summary | 仍未觸發 | **未驗：待真實觸發**；R4 §2 有、wave-5 §5 漏帶 → §6 補遺 |
| 第 2 波起沿用 | 正式站第一筆真付款 → 發票（plan §6-3） | 業主未回報 | 沿用 |

## 3. 上線後現場

- **部署鏈**：main push CI 42365208498 綠（10:44:17–10:44:32 UTC）→ deploy-supabase 42365227288（等 `production` 核准，
  10:56:27 開始，部署＋`/health` sha 比對 success）→ deploy-smoke 42366062154 綠（10:56:46–10:56:54）。
- **乙段**（主 session，plan §8 18:58）：`select public.invoke_internal_endpoint('reconcile')` 回 HTTP 200，帳本新增 succeeded 列。
- **GitHub 排程**：reconcile-payments 11/07 有 03:09（schedule）、08:43（主 session 手動）、10:38（schedule，含看門狗補跑）三支，都 success。
  purge-listing-photos 只有 00:21 一支（排程是 20:47，晚了約 3.5 小時），success。
- **pg_cron 首輪與 DB 現場**（主 session 代跑，11:11 UTC）：
  - **正式站**：
    - 帳本：id 1（10:57，即乙段人工 invoke，帳本記成 pg_cron，見 P2-9）、id 2（**11:07，真正的 pg_cron 首輪**）兩列都是 succeeded。
      checked、unknownStatus、incomplete、queryErrors、queryFailures、expired 全為 0，所以 W5-44② 的計數這輪是 0（窗內沒有 pending 單，屬零樣本）。
    - cron：reconcile 11:07 succeeded；prune-rate-limits、purge-stale-referral-invites succeeded；prune-scheduled-job-runs 與
      purge-orphan-listing-photos 還沒輪到；5 列都是 active。
    - pg_net：兩筆都是 200，沒有逾時。
    - 部署後 `system_alerts` 新增 0 列；無法判讀的單 0；king_round_base／fresh_*／duplicate_payment 等新 source 都是 0。
    - `referral_pair_history` 18 列 = 來源配對 18；來源缺 0、表內多 0；`king_round_base` 非空 0 列（回填與 W5-8 都乾淨）。
    - 11/04 之後的訂單 4 筆，都是 completed、首購（renewal_mode null）；沒有 pending。
  - **develop**：08:34 之後每輪都 succeeded，數字全 0。更早的 01:07～05:07 是 vault_missing、06:07～08:07 是 401，這兩段都是 W5-67 換新前的狀態。
    五支 job 都有成功紀錄。
  - **待補**：照片清理首輪（19:17 UTC）的 `dryRun`，用來佐證 `PHOTO_PURGE_LIVE`（主 session 排在 19:25 UTC 檢查；業主口頭回報已設）；
    部署後第一、二輪看門狗是否還在補跑。
  - 結論：沒有回歸跡象。但新約、重複付款、unknown 單都還沒有真實樣本；24～48 小時的數字照 W4-26 由主 session 寫進 plan §8。

## 4. 流程

### 4.1 三種 session 分工

- **照〈慣例〉走**：主 session 沒寫產品碼（#515 只改 `config/posthogTarget.ts` 的 key 常數）；9 支程式 PR 都由執行 session 施工。
  其中 5 支在合併前另派獨立審查員，全部抓到東西：#511 P0（Logs 擴充）、#512 P1 兩條、#509 P1 一條、#514 P2-1（W5-61 死鎖）。
  主 session 的「親審＋獨立審查員」是本波品質的主力。
- **裁決編號全由主 session 發**（R4 P2-16 的修正生效）：W5-1～68 沒有撞號。PR 內文自稱的編號一律以 plan §0 為準。
- **hash 以 PR 內文為準**（R4 P2-17）：plan §8 已在表頭標明，本波沒再出錯。但這兩條〈慣例〉目前只在主 session 的分支
  （#506），develop 上還沒有（§5-4）。
- **審查 session 開在部署當天**：W4-26 的取捨照舊，§3 的 pg_cron 首輪要等主 session 代跑。
- **獨立審查員結果因容器重啟遺失一次**（#509），見 friction-log。

### 4.2 框架摩擦

已寫進 `docs/plans/friction-log.md` 新節「2026-11-07｜第 5 波審查」：容器重啟讓背景審查員結果遺失、RECONCILE_SECRET 四處同值
無從核對（W5-67）、TGOS 對雲端 IP 回 403（W5-64）、PostHog 免費方案只給 1 個 project（W5-68）、pre-commit 的 `npm run check`
偶發失敗而失敗提示一律導向 TDD 紅燈通道、W4-x 裁決原文的取回指令。

## 5. 給主 session／業主的待辦

| # | 事 | 給誰 | 建議 |
|---|---|---|---|
| 1 | 上線當天抽看 5～10 支錄影（W5-39），順手看 Network 面板（`/array/<key>/config`、`/flags` 不含 token、沒有 logs 端點請求）與 `/payment/*`、`/admin` 版面；回報 PostHog 專案端勾選（plan §6-6） | 業主 | 必做。develop 沒驗過（W5-68），這是錄影遮罩唯一的現場驗證 |
| 2 | 部署後第一、二輪看門狗是否還在補跑；今晚照片清理首輪的 `dryRun` 值（佐證 `PHOTO_PURGE_LIVE`） | 主 session | 結果貼回 R5 或直接寫 plan §8；`dryRun=true` 就請業主補設 |
| 3 | P2-1～P2-4（PaymentCheckout 三條與確認框 portal）是否合成第 6 波一個 `/fix-bug` | 主 session／業主 | **建議合成一支 Sonnet `/fix-bug`**：同一個檔案、同一類「錯誤沒有專屬處理」，P2-1 會讓使用者卡在循環裡 |
| 4 | 合併 #506：「裁決編號只由主 session 發」「hash 以 PR 內文為準」（`docs/README.md`）與「F1 草稿在 session 失效時也清」（`multi-step-flow-recovery.md`）目前只在 #506 | 主 session | 本 PR 已刪 `launch-wave-4/`（R4 §6 的去處以 #506 為準），#506 要在本 PR 之前或同時合；兩支 PR 不撞檔 |
| 5 | §6「第 6 波候選補遺」併進 plan §5 | 主 session | 本 PR 不改 plan.md，避免與 #506 衝突 |
| 6 | P2-5（批次自癒互鎖）的優先序 | 業主 | **建議第 6 波收**，與 W5-61 同一處；至少先把 40P01 改寫成 error 告警（推得到 LINE），客服才知道有漏發 |
| 7 | 三參數版 `prepare_payment_order` 下一波 drop（`20261113000002:153` 註解寫「下一波 drop」，plan §5 沒列） | 主 session | 列第 6 波候選（已在 §6 補遺） |

## 6. 升級進長期文件（launch-wave-5/ 退場依據，由第 6 波 R6 執行）

### 6.1 第 4 波退場（本 PR 執行）

`docs/plans/launch-wave-4/` 已依 R4 §6 逐條處置後刪除（`git show e6c2835:docs/plans/launch-wave-4/<檔>` 取得回）：

| R4 §6 項目 | 去處 | 狀態 |
|---|---|---|
| W4-11～18、22 的行為；W4-17 頁首空槽 | 規格書 §2.1（:66-67）、§5.3（:266-269） | 已升級 |
| W4-21 pages.dev 導向 | `src/utils/canonicalHost.ts:1-8`；P2-13 在 plan §5 | 已升級 |
| W4-23 journey 固定 24.04 | `journey.yml:62-65` 寫了退場條件；plan §5 有帶 | 已升級 |
| tdd-lock 雲端授權、判偶發先看現場 | `docs/README.md:125-127`、`:137-138` | 已升級 |
| 「裁決編號只由主 session 發」「hash 以 PR 內文為準」 | `docs/README.md`〈慣例〉——在 #506 | **待 #506 合併**（§5-4） |
| F1 草稿在 session 失效時也清 | `src/utils/formDraft.ts:19-20` 已同步；`multi-step-flow-recovery.md` 在 #506 | **待 #506 合併** |
| R4 §5 待辦、wave-4 plan §5 候選 | wave-5 plan §5、§6，逐項比對沒有遺漏，只差 K2 未驗（補在 6.3） | 已帶 |
| R4 §4.2 摩擦 | friction-log「2026-11-02」節（標題連結改成 `git show`） | 已升級 |
| 產品碼註解裡的 W4-x 編號（約 30 檔） | friction-log「2026-11-07」節最後一條寫了取回指令 | 已處置 |
| 四份稽核（W4-30） | 未修項見 6.3 | 見下 |

`scripts/`、`.github/` 都沒有引用 `launch-wave-4/`，CI 不受影響；wave-5 `dispatch-prompts.md`（#506）裡的引用屬同波鷹架，可接受。

### 6.2 第 5 波（R6 執行）

| 內容 | 去處 | 理由 |
|---|---|---|
| W5-5（停權不得付款）、W5-12／W5-47（稍後註冊＝登出）、W5-13／W5-14（重複付款、付款中被停權） | 規格書 §5.2、§6、§8.3（S2 已寫）——R6 核對 | 行為規則 |
| W5-15～17、W5-41／42／44／45（pg_cron、TradeStatus 對應、看門狗門檻） | `supabase/README.md`、規格書排程段（S1 已寫）——R6 核對；TradeStatus 碼表要有出處（官方「單筆交易查詢 Ver 2.0」） | 營運規則 |
| W5-8、W5-49～52、W5-54～56、W5-58、W5-59（新約換線、推薦王 base、配對名單） | 規格書 §7、§9（S6 已寫）——R6 核對 | 獎勵規則的單一事實來源 |
| W5-24～29（區級距離排序、定位等待與重排）、W5-21／22／27（換篇手勢） | 規格書 §3（S7 已寫）——R6 核對 | UX 規則 |
| W5-34 顯名義務 | 程式檔頭＋規格書（已做） | 授權條款 |
| W5-36～39、W5-57、W5-68（錄影隱私設定、不在 develop 驗證） | 規格書 §15（#515）——R6 核對 | 隱私規則 |
| W5-53 用語 | `src/terminologyGuard.test.ts` 已機械把關；規格書 §7 術語對照 | — |
| W5-62 部署順序 | 晉升清單範本或 `docs/README.md`〈慣例〉，直到 §5 的 workflow 自動檢查上線 | 退場條件：自動檢查上線 |
| W5-67 密鑰四處清單 | `docs/supabase-setup-checklist.md` | 營運手冊 |
| 本報告 §4.2 摩擦 | friction-log「2026-11-07」節 | 本 PR 已寫 |
| plan §5 候選＋6.3 補遺 | 第 6 波 plan | — |
| 其餘（§1 時程、§2 工作分解、§7 名冊、§8 進度、dispatch-prompts.md） | 隨目錄刪除 | 一次性施工紀錄 |

### 6.3 第 6 波候選補遺（plan §5 漏列；主 session 併入 §5，§5-5）

本報告：P2-9 `invoke_internal_endpoint` 帶 trigger 參數；P2-1～P2-4 PaymentCheckout 錯誤分支與確認框 portal（§5-3）；P2-5 批次自癒互鎖；P2-6 新約 default 碼在付款當下重讀；
P2-7 帳本 summary 分 reason；P2-8＝pay P2-14（heal pass 失敗不告警，W5-18 留第 6 波，但 §5 漏列）；三參數版 `prepare_payment_order` drop。

PR 未驗與已知限制：S3（#508）同類掃描未修兩條（`getAccessToken` 出錯回 null；ResetPassword、AuthPage 的 getSession 直接導走）；
S7（#509）P2 五項（reduced-motion、抽 hook、手勢 chunk 缺 error boundary、slide-in、手勢起點）；S8（#513）後端錯誤訊息納入用語掃描；
S5（#507）網絡搜尋 429 的專屬文案；K2（#485）deploy-smoke fallback 告警待真實觸發驗證。

第 4 波稽核未修、也不在 §5 或規格書 §14 的（照報告原文，標「仍在」的是盤點時在 develop 抽查確認過的）：

- **ops**：P0-1 殘餘（部署 workflow 的 `SUPABASE_ACCESS_TOKEN` 仍放在 job 層 env；失敗通知仍用被部署 ref 的本地 action
  `./.github/actions/notify`）；P2-2（約 20 支 security definer 函式只靠 revoke，函式內不驗 `p_admin_id`／`p_user_id`）；
  P2-3（停權的管理員沒有效果，可以自己解除停權）；P2-4（`admin-gate.test.ts` 的 `ADMIN_ROUTES` 漏 4 條寫入端點）；
  P2-5（`logSystemAlert` 不檢查 insert 的 error，告警會靜默遺失，仍在 `index.ts:2478`）；P2-6／P2-7（reconcile-payments.yml 告警時間窗漏推、
  告警查詢失敗卻開「對帳失敗」issue；S1 改寫後要重核）；P2-8（`listForRepo` 沒帶 `per_page`，去重失效，仍在）；P2-9（四條排程失敗不推 LINE；
  `deno audit --ignore-registry-errors`）；P2-10（LINE 內文截在 200 字）；P2-11（`/health` 的 `reward_config` 讀取錯誤回 unset，仍在）；
  P2-12（會員可經 PostgREST 直接寫 listings，沒有長度、張數、URL 限制）；P2-13（notify／return 失敗時整包交易資料寫進 log，仍在）；
  P2-14＝ref P2-7（`/admin/withdrawals` 姓名搜尋 error 被吞、超過 1000 筆截斷；建議併規格書 §14 #11）。
- **pay**：P2-2（金額寫死 1200、缺 TradeAmt 時放行）；P2-3（notify 找訂單的 `.single()` 不分 PGRST116）；P2-4（`/payuni/result` 的 renewal 查詢 error 被吞）；
  P2-5（新約讀 `reward_config` 失敗被告警成 unset）；P2-6（HashInfo 用 `!==` 比對，仍在）；P2-7（repair 以 `created_at` 相同誤判非首購）；
  P2-11（到期倒數用 `Math.ceil`，多算一天，仍在）；P2-12（PaymentResult 查詢 404 仍顯示付款成功、tradeNo 沒 encode）；P2-13（`payuni_paid_at` 的 fallback 退回建單日）。
- **ref**：P2-4（剩下「過期期間提領審核中、又付新約」那條時序，見 §1.4）；P2-5（`referral_edges.referral_code_id` 寫的是被推薦人自己的碼）；
  P2-6（`/tasks*` 讀取錯誤被吞；`current-month-top` 仍顯示已換線離開的人）；P2-8（提領篩選以 UTC 日界判斷，不是台灣日曆日）；
  P2-9（數字型別 `.trim` 擲錯回 500；`completedByAdmin` 的事件查詢 error 被吞）；P2-10（`!!body.approve` 讓字串 "false" 變成核准、沒有樂觀鎖，仍在）；
  P2-11（verify-id 回 400 時顯示「請稍後再試」）；P2-12（網絡「加載更多」競態）；P2-13（TaskGuide 寫死 8 位，仍在）；
  P2-14（全形帳號、IME 組字、手續費拆分、admin 狀態文案等小缺口合併）。
- **auth**：P2-3／P2-4（生日欄 max 與年齡計算的時區錯誤）；P2-5（AuthPage 4 秒就判未登入，比 `/profile` 的 8 秒短，會預填別人的推薦碼）；
  P2-6（72 位元組上限只在邀請路徑檢查）；P2-7（重設密碼成功後可以重複送出）；P2-8（OTP 錯誤不分流、顯示英文原文）；
  P2-9（check-email 429 把原始回應顯示給使用者）；P2-10（resend 回 `{error}` 仍提示已寄出）；P2-11（OTP 180 秒鎖與伺服器 TTL 沒對齊）；
  P2-12（推薦碼驗證晚到，欄位已清空仍顯示推薦人）；P2-13（身分證沒正規化就存進 DB，可併規格書 §14 #1）；P2-14（登入後深層連結遺失）；
  P2-15（`accountStatus 'unknown'` 死分支）；P2-16（check-email 收到非字串回 500）；P2-17（`complete-registration` 讀取失敗回 400，或刪掉這個端點）；
  P2-19（沒有 IP 時全站共用一個限流桶、IPv6 沒有收斂到 /64）；P2-20（邀請 token 沒綁 iat，可選）。
- auth P2-2 已由 W5-47 處置；auth P2-18 稽核本身判可接受——兩條都免列。
