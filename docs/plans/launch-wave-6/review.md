# 第 6 波審查報告（審查 session R6，2026-11-17）

<!-- plans-keep: 第 6 波審查報告；與 launch-wave-6/plan.md 同生命週期——第 7 波審查 session（R7）依 §6「升級進長期文件」逐條處置、結案後，隨整個 launch-wave-6/ 目錄刪除 -->

範圍：`git log --first-parent f5a1ed8..653e31e`（第 6 波晉升 #527，11/09 07:13 台北合進 main；`production` 核准後
deploy-supabase run 42534091645 於 23:19 UTC 完成，含「確認 migration 已套用」與 `/health` sha 比對；deploy-smoke 42534625913 綠）。
程式 PR 7 支：#520（S5）、#522（S2）、#523（S4）、#524（S1）、#521（S3a）、#525（S3b）、#526（S6）。
126 檔，+13,824／−1,533 行；migration 9 支（`20261114000001`、`20261115000001`、`20261116000001～5`、`20261117000001～2`）。
行號一律引用 main `653e31e` 的樹。

審法：#523、#524、#521、#525、#526 合併前已有獨立 Opus 審查（P0／P1 清零，摘要在各 PR 內文與 plan §8），本輪只找那幾輪沒看到的
**跨 PR 交互**。金流段（S1 逐筆 heal、S6 0d、對帳的 `QUERY03001`）由本 session 親讀 migration 與 `index.ts`；S3 SQL × S1／S6、
前端 × PostHog、PR 未驗項、第 5 波退場盤點各派一個子 agent，候選由本 session 讀碼核實後才收（§1.4 列推翻與降級）。

**總結：P0 0、P1 1、P2 12。** 點名的五組交互都核實沒有金錢或資料錯誤（§1.1）。P1-1 是 S2 新增的「已有有效訂閱」分支：
重抓的會員資料沒寫進 context 就導 `/dashboard`，會籍守衛讀到舊的 expired 又導回結帳頁，兩頁來回跳。上線後現場最大的事是
`QUERY03001`：官方碼表寫的是「查無符合訂單資料」，屬「處理」類，代表商店代號、Hash、解密都通過，**不是查詢層故障**。
現行程式把它當故障，每張棄付單滿 4 天都推一則 error 到 LINE（§3、P2-1，建議列第 7 波第一優先，先做正控驗證）。

## 1. 發現

### 1.1 已核實沒問題的（派工點名的交互）

| 交互 | 核實 |
|---|---|
| S1 逐筆 heal × S6 0d 驗單上碼 | S6 的 `process_successful_payment`（`20261117000001:21`）以 `20261113000003` 為基準，本體 diff 只有 0d 的 `v_check_code := coalesce(v_ref_code, …)` 與告警分句（本 session 逐行 diff）。鎖序、0a′ try 鎖、`v_duplicate` 不換線都沒動。S1 單筆函式在 0b 預取 profiles 後委派（`20261115000001:150-163`），旗標 `uknow.rewire_try_lock` 在子交易外設定，RPC 交易結束自然失效。0d 在同一子交易寫 profiles 與 edge，同生同滅 |
| S1 × S6 drop 三參數 prepare | 三參數版只被 `20261111000002` 的 wrapper 用，Edge 早已帶六參數（R5 §1.1）；S6 `20261117000002` drop 後 develop／正式站都只剩六參數版（plan §8 11/09 03:30、07:13）。S1 不碰 prepare |
| S1 `pay_referral_generations` 告警改版 × S3 `referral_award_chain` 等價與「缺漏」判定 | chain（`20261116000001:21-62`）與 main 最終版發獎函式（`20261115000001:314-450`）語意等價：第 1 代讀 profiles、第 2／3 代讀 edges，收獎人＝付款人時該代與其後停發，不看停權／到期／推薦計畫。等價測試 `referral-award-chain.test.ts` 直接呼叫線上函式，合併序 #524→#521，釘的是 S1 新版。S3 不讀 `system_alerts`，「缺漏」只看 `reward_transactions` 有沒有列；S1 失敗路徑不寫列，報缺漏正確，README〈補發漏發獎金〉補的列用同一組冪等鍵，補完轉「已發」 |
| S2 validate 擋本人 × S6 確認框第三態 | validate 未帶 token 直接 401（結帳頁當「暫時無法驗證」），不會碰到擋本人分支。填現任推薦人的碼→「維持 {姓名}」；自動綁定者填預設碼→「將改為 {姓名}」（W6-31）；留空依 changes／keeps_same／keeps 三態；讀現任推薦人失敗→「將改變」（W6-30）。任何組合都不出現預設推薦人的姓名或碼（W6-28）。例外見 P2-3、P2-4 |
| S6 部署前 migration 檢查 × S3 migration 0004 `_base` 改名 | `scripts/check-remote-migrations.py` 只比 14 位數版本前綴，不看函式名。0004:259 改名、0005 只重定義外層與 `tree_node`；兩支的授權迴圈都涵蓋 `_base`（`create or replace` 保留 ACL）。版本號 20261115→16→17 與合併序一致 |
| S4 手勢 × PostHog 遮罩 | 只寫數值 `translateX`，WAAPI 不產生屬性；新增 `data-browse-*` 由 `maskAttribute` 遮成 `***`，文字一律 `maskTextSelector:'*'`。`BrowseGesturesBoundary` 的 console.error 在 `enable_recording_console_log:false`、`capture_exceptions:false` 下不送出，內容也只有 chunk 錯誤 |
| S3 權限 | 5 支新端點先經 `index.ts:1294` 的 `/admin/*` 守門，handler 內再驗一次；新 SQL 函式全部 `revoke … from public, anon, authenticated`、只 grant service_role（0002:265、0003:213、0004:303、0005:262 的迴圈） |
| S1 逐筆化後互鎖是否還有殘餘環 | heal 每筆一個交易，只持「訂單列→profiles(本人)」；同一筆內收獎人方向只要 KEY SHARE。要成環得付款人與收獎人互為推薦人，被成環守衛擋掉 |
| 409 `paid_pending` × 400「已有有效訂閱」 | 後端先查 active 回 400、RPC 才回 409；前端先判 409。兩條不重疊 |
| 用語（W5-53） | 新文案與後台文案沒有禁用詞；後台用「第 N 代」「第 N 層」「往上第 N 位」 |

### 1.2 P0／P1

P0 無。

**P1-1｜S2「已有有效訂閱」分支導頁前沒更新 context，`/dashboard` ↔ `/payment/checkout` 來回跳**

- 位置：`src/components/PaymentCheckout.tsx:720-729`；`src/components/RequireMembershipRoute.tsx:47-57`；`src/App.tsx:320-326`。
- 輸入：本分頁的 UserContext 仍是 expired，送單時 prepare 回 400 `ALREADY_ACTIVE_MESSAGE`（另一分頁剛付完款，或建單 RPC 在鎖內才判定 active）。
- 結果：`fetchProfileForSession({force:true})` 的回傳被丟掉（`src/utils/fetchProfile.ts:113` 不寫 context，寫入要 `ingestProfile`／`refreshUser`），
  `refreshSubscription` 不改 `user.accountStatus`。`navigate('/dashboard')` 後 `RequireMembershipRoute` 讀到舊的 expired，照決策表第 4 格導回結帳頁；
  結帳頁掛載的 `confirmServerProfile`（`:186-205`）重抓到 active 又導 `/dashboard`——每圈一次 `/profile` 請求，直到 focus／visibility 的 revalidate（`App.tsx:239`）剛好更新 context 為止。
- 測試沒抓到：`PaymentCheckout.test.tsx:1365` 的 `/dashboard` 是沒包守衛的 stub 路由。
- 建議：拿到 `result.kind==='ok'` 後先 `ingestProfile(result.profile)`（或 `await refreshUser()`）再導頁；測試改經 `RequireMembershipRoute`。
  同類：輪詢（`:153`）與掛載導向（`:199`）也是「不寫 context 就導 `/dashboard`」，一起改。觸發機率低（多數情況切回分頁的 focus revalidate 已先更新 context），
  但觸發就是頁面迴圈、而且測試測不到，維持 P1；不動金流，不開 hotfix，列第 7 波第一批 `/fix-bug`。

### 1.3 P2

| # | 檔:行（`653e31e`） | 問題（具體輸入 → 錯誤結果） | 建議 |
|---|---|---|---|
| P2-1 | `supabase/functions/api/index.ts:3062-3070`（查詢層非 SUCCESS 一律 `queryFailure`）、`:2931-2976` | 棄付單（使用者沒在 PayUni 頁送出付款）→ PayUni 回 `QUERY03001`「查無符合訂單資料」→ 程式當查詢層故障：第一張寫 `payuni-query` error、每張滿 4 天再寫 `expired_query_failed` error 推 LINE 並請人工核對。上線 9 天 3 則、每張棄付單都會一則，真告警會被稀釋，業主每次都要去 PayUni 後台查 | 見 §3 的第 7 波工項：先正控驗證，再把 `QUERY03001` 改判「確認未付款」 |
| P2-2 | `PaymentCheckout.tsx:520-524`（`handleValidateNewCode`） | 新約碼欄填自己的碼 → validate 回 `{valid:false, error:{message:'不能使用自己的推薦碼'}}`（`index.ts:1132`）→ 只設 invalid，沒寫 `newCodeInvalidMessage`，欄位顯示預設的「推薦碼不存在或已失效」。S2 在後端加專屬文案的目的沒接上（CompleteProfile 有接）。付款會被 `:565` 擋下，不影響金流 | `valid===false` 時讀 `result.error.message`，是 SELF／NOT_APPLICABLE 就寫進 `newCodeInvalidMessage` |
| P2-3 | `src/utils/freshRenewalCopy.ts:82`（keeps_same 藏「目前：X」）、`:57` | 手動綁定、現任推薦人剛好是預設推薦人的會員：`freshCodeHint` 能分出 changes，placeholder 能分出 keeps，兩者合起來唯一推出 keeps_same＝「預設推薦人就是我的推薦人」。結帳頁個人資料卡（`:977-979`）本來就顯示推薦人，藏 placeholder 沒有保護，反而多一個訊號 | keeps_same 的 placeholder 與 keeps 一樣顯示「目前：X」，確認框在 keeps 也寫「您的推薦人維持不變。」——兩態對使用者結果相同，就不再可區分。影響人數少、不露姓名或碼，可與 P1-1 同一支 `/fix-bug` |
| P2-4 | `20261116000004:81-84`、`:114`；`20261117000001:199`（`changed_at` 取付款時點） | U 的新約單 T1 付款但 notify 遺失、待開通；U 的被推薦人 D 在 T2 付款，當時 edge 仍指舊推薦人 O，第 2 代發給 O；T3 自癒把 U 換到 N，`changed_at` 回填成 T1。審 D 在 T2 的付款時閘門判「可判定」，鏈上第 2 代是 N、實發是 O → 標紅「收獎人不符」，客服可能據此補發給 N | 另記換線實際寫入時點（例：`referred_by_written_at`），閘門改成任一者晚於付款時點就判不可判定；最低限度在詳情加一句「該會員有晚到開通的新約單時，結果僅供參考」 |
| P2-5 | `20261116000003` 的 `fresh_events`（約 :175-190） | 0d 拒絕換線（碼失效、成環、帳號不存在、例外）或重複付款，訂單上的 `fresh_referrer_user_id` 仍有值 → 換線紀錄照列「換到某某」，只標「無法確認」，客服會以為真的換過 | 依單號對 `fresh_referrer_invalid`／`_cycle`／`_missing`／`fresh_rewire_failed` 告警，或排除重複付款單，直接標「未換線」 |
| P2-6 | `20261116000005:176-200`（`tree_node`）、`20261116000002:106-118`（`unplaceable_ids`）、`AdminReferralTree.tsx:244` | 每節點掃 50 筆付款事件 × 約 8 次查詢＋點數核對，一頁 200 節點約 8 萬次索引查找；頂層每次對全部有 edge 的會員各往上走最多 51 步，無上限；詳情 `_base` 已算過一次付款異常，外層又全量重掃；搜尋展開祖先逐層依序呼叫，最多約 50 次往返。現在 24 位會員無感，會員數上千會慢 | 與 plan §5「頂層 unplaceable 效能」合併成一項：頂層數量快取或按需、節點異常延後算、詳情合併兩次掃描、祖先一次取回 |
| P2-7 | `20261116000001:6` | 檔頭寫的發獎函式基準仍是 `20261113000001`，main 最終定義已是 `20261115000001`，下次對照會找錯檔 | 下一支動到這區的 migration 順手更正檔頭（不另開 PR） |
| P2-8 | `20261116000005:20-25` | 檔頭說「批次自癒期間的清空同樣會誤報」，S1 後 Edge 已逐筆，只剩舊 wrapper（W6-30 待 drop）會觸發 | 同 P2-7，drop wrapper 時一起改 |
| P2-9 | `supabase/README.md:109` 起〈補發漏發獎金〉第 2 步 | 「沿 `referral_edges` 往上找」第 2、3 代，沒提醒付款後換過線的情況；照做可能補給換線後的新推薦人 | 改為以 `referral_award_chain` 為準，並先確認後台該筆不是「不可判定」（§6 升級表一起做） |
| P2-10 | `src/components/admin/MemberDetailSheet.tsx:183`、`MemberManagement.tsx:608`；`src/utils/analytics/sensitiveFields.ts:4` | 兩個後台 portal 沒有 `privateClass`、不在 `SENSITIVE_PORTALS`；同檔註解寫「components/admin 不在此列」，與新增的 ReferralAuditSheet 那筆自相矛盾。主防線 `/admin` 整段不錄（`analyticsGate.ts:8`）仍在，風險低 | 併 plan §5 已列的「MemberDetailSheet 補 SENSITIVE_PORTALS（W6-21）」，加 MemberManagement 的確認框並修註解 |
| P2-11 | `20261113000003` 3-0 清帳本 × `20261115000001` heal（既有，第 5 波起） | 新約單 T1 付款但 notify 遺失，T3 由自癒開通：清帳本算的是 T3 當下餘額，T1～T3 之間 U 因被推薦人付款新賺的點數也一起清掉；線上即時開通則會保留。窗口是自癒延遲（通常 ≤ 1 小時，`/profile` 載入時更早） | 規格書 §6.2 沒寫這個時點語意。業主已裁 **W6-37**：接受，規格書 §6.2 已寫 |
| P2-12 | `.github/workflows/deploy-smoke.yml` PayUni 閘門探測 | sandbox `sandbox-api.payuni.com.tw/api/upp` 偶發 403（11/09、11/11 run 42975735705、11/14 run 43626325532），每次推 LINE [P1]，下一輪自己綠；正式端點每次 200 | sandbox 403 單次不推 P1：連續 2 輪才推，或降為 P2 並註明「sandbox 端」；同時請業主詢問 PayUni（§5-5） |

### 1.4 被反駁推翻或降級的

| 候選 | 結論 |
|---|---|
| S1 告警分 error／warning、訊息前 60 字會影響 S3 的缺漏判定 | **推翻**：S3 不讀 `system_alerts`（§1.1） |
| S6 換線造成 profiles 與 edge 不一致，S3 誤標「推薦人資料兩處不一致」 | **推翻**：0d 在同一子交易寫兩邊，3b 再寫同值 |
| S3（2026111600000x）與 S6（20261117000001）版本依賴 | **推翻**：S6 沒重定義 S3 用到的函式 |
| 0d 換成同一位推薦人也更新 `changed_at`，讓舊付款全變不可判定 | **推翻**：`track_referred_by_change` 只在值真的變動時才寫 |
| P2-4 升 P1 | **未升**：只在自癒延遲窗口內、只影響後台顯示，不會自動動到錢；依「換線從付款時點起算」的語意，這筆也可能本來就該算不符 |
| P2-3 維持 P2 | **降為建議**：W5-63 第三態布林已由業主核准，能推論的只有「手動綁定且推薦人剛好是預設帳號」的人，不顯示姓名或碼 |
| `QUERY03001` 列 P0／P1 | **不列**：現行是 fail-safe（不確定就交人工），晚到的 notify 仍會把 expired 單收斂（R5 §1.1），錢不會掉；代價是告警噪音與業主人工。見 §3 |
| 舊資料 `referred_by_changed_at` 為 null（20260807 前沒記）會讓 S3 漏判 | **不列**：歷史資料問題、不屬本波交互；正式站曾付款且 null 只有 1 人（plan §8 11/08 14:25） |
| S1 逐筆 heal 的 lock_timeout 3 秒窗口讓 S3 點數核對誤報 | **併入既有**：0005 檔頭已記的清空競態同一類 |

## 2. 未驗項

來源：#520～#527 的 PR 內文，對照 plan §8 與 Actions（11/09 起 94 支 run，失敗 2 支，都是 deploy-smoke 的 sandbox 403）。

| PR | 自述未驗／待真實觸發／偏離 | 之後 | 結論 |
|---|---|---|---|
| #520（S5） | migration 冪等轉換；紅綠同 commit | 正式站已套 `20261114000001`（§8 11/09 07:13）；偏離已接受 | 已驗 |
| #522（S2） | 未走紅綠相位、biome warning 沒還 | 主 session 接受 | 已驗（偏離已接受） |
| #522 | 送單錯誤分支（自己的碼、非 JSON、已有訂閱） | 只有測試與 CI，正式站無樣本 | 未驗：待真實觸發；「已有訂閱」分支見 P1-1 |
| #523（S4） | 手機實測三項＋斜拖手感 | 業主 11/09 06:40 回報「動畫 OK」（W6-33），沒有逐條回覆 | 已驗（整體） |
| #523 | 焦點還原留在元件（W6-22） | plan §5 有 | 已列第 7 波 |
| #524（S1） | 單筆失敗告警 message 含原始 sqlerrm；3b／3d 仍 warning；drop wrapper（W6-14→W6-30） | plan §5 都有 | 已列第 7 波 |
| #524 | heal 新路徑 | develop 11/08 兩輪；正式站乙段 id 41、42；上線後 217 輪全 succeeded、heal 0 補 0 失敗 | 已驗 |
| #524 | 獎金漏發 error 告警走 LINE（前 60 字）、`healFailedStreak`／`healSkippedStreak` | 上線後 0 次漏發、0 次 heal 失敗 | 未驗：待真實觸發（零樣本） |
| #521（S3a） | 頂層 unplaceable 逐人 upline 效能 | plan §5 有 | 已列第 7 波（併 P2-6） |
| #521 | `tree_node` 重複呼叫 upline 與 payment_events、`unplaceable_ids` 線性掃描 | plan §5 只列 unplaceable | **未列候選** → 併 P2-6 |
| #521 | **320px 三個分頁並排未驗，交業主在 develop 實看** | plan §6、§8 都沒有 | **未驗：待業主**（§5-4） |
| #521 | P1-2 已知殘留：edge 改線沒有時間戳 | 改判不可判定；正式站 profiles≠edge 0 人 | 已記錄（另見 P2-4） |
| #525（S3b） | 「載入更多」在途／失敗沒有 aria-live、兩區之後一起改 | plan §5 沒有 | **未列候選** → §6.3 |
| #525 | `LedgerState`／`PagedState` 重複、merge 沒抽共用；清空金額每筆 reset 各掃一次（reset 變多再改 window sum） | plan §5 沒有 | **未列候選** → §6.3 |
| #525 | 階段 10 紅燈撞 setup-deno 504，無 CI 證據 | 主 session 接受 | 已驗（偏離） |
| #526（S6） | 「確認 migration 已套用」實地驗證 | develop 42513390673、正式站 42534091645（首次實跑）、11/17 develop 44197723446 皆綠 | 已驗 |
| #526 | `current_default_code_read_failed` 分支無測試；Management API 筆數上限未證實 | 審查接受；腳本缺版本時印「遠端 N 筆／repo M 筆」 | 未驗（已接受，有防線） |
| #526 | `fresh_referrer_invalid` 三種告警分句 | 上線後無樣本 | 未驗：待真實觸發 |
| #527 | journey 全套、4a、production 核准、乙段 | journey 綠 28 分；42534061674；42534091645；42534625913；乙段 id 41、42 | 已驗 |
| plan §8 | 「`QUERY03001` 碼義待確認（列第 7 波）」 | plan §5 沒有 | 本報告 §3 給碼義與工項，§6.3 補列 |
| plan §8 11/09 15:10 | sandbox 403「再出現就記 friction-log」 | 11/11、11/14 又出現，未記 | 本 PR 已記 friction-log（§4.2）、P2-12 |
| 第 5 波帶來 | K2 deploy-smoke fallback 告警、正式站第一筆真付款發票、PostHog 專案端勾選、Network 面板、`tel-national` 真機 | 仍未回報／未觸發 | 沿用（plan §6-4、§6-5） |

## 3. 上線後現場

主 session 11/18 07:40（台北）量的數字見 plan §8 最後一列：排程 reconcile 217 輪全 succeeded、heal 全 0；照片清理 9 輪全 `dryRun=false`；
function_edge_logs 無 5xx；新訂單 13（completed 9、expired 3、pending 1）；`system_alerts` 4 筆 error 全與 `QUERY03001` 有關。
**除了 `QUERY03001` 沒有回歸跡象**；新約換線、重複付款、獎金漏發告警、heal 失敗都還是零樣本。

### 3.1 `QUERY03001` 判讀

- **碼義**（PayUni 官方 docs.payuni.com.tw「錯誤代碼／交易查詢」，本 session 11/17 讀取）：
  `QUERY01xxx`＝基礎參數（商店代號、Hash、解密），`QUERY02xxx`＝解密後參數（單號格式、時間戳），**`QUERY03001`＝查無符合訂單資料**（「處理」類），
  `QUERY04xxx`＝異常。能回到 03 類，代表 MerID、HashKey／IV、加解密、單號格式全部正確——查詢層是通的，只是 PayUni 端沒有這張單。
- **為什麼會查無**：UPP 要使用者在 PayUni 頁實際送出付款，PayUni 端才有交易；只建了我方訂單、沒送出（或關掉頁面）就是查無。
  主 session 的現場：後兩張單的會員已有另一筆 completed 訂單（重試付款後留下的棄單），與此一致。
- **現行程式**（`index.ts:3062-3070`）：`raw.Status !== 'SUCCESS'` 一律回 `queryFailure`，對帳迴圈（`:2931-2976`）先寫一筆 `payuni-query`
  （按 Status＋Message 去重，所以 11/12 之後只有一筆），滿 4 天標 expired 前再按訂單寫 `expired_query_failed` error。
  程式註解（`:2933`、`reconcile-handler.ts:45`）其實已預期棄付單會走這條，只是當時碼義未證實，選了保守路徑。
- **剩下的風險**：如果查詢送出的單號跟 PayUni 端記的不一致（例如單號格式日後被改壞），**已付款的單也會回 03001**，改判「未付款」後會被靜默標 expired。
  正式站從 11/12 起只遇過棄單，沒有任何「查到 SUCCESS」的正向樣本（待主 session 代查 Q1 確認），所以要先補正控。
- **結論**：現行分類**要修**，但不急：fail-safe（晚到的 notify 仍會把 expired 單收斂，R5 §1.1）、錢不會掉，代價是每張棄單一則 LINE error 加業主人工核對。

### 3.2 第 7 波工項建議（`/fix-bug`，Opus；動 `index.ts` 對帳段與 deploy-smoke）

1. **正控先行**：deploy-smoke（或一次性 workflow_dispatch）挑正式站最近一張 completed 單查一次，斷言 `Status=SUCCESS`、同號 `TradeStatus=1`；
   之後每天跑一次，失敗推 P1。這一步證明「查得到的單一定查得到」，是 2 能成立的前提。
2. **`QUERY03001` 改判「確認查無」**：`queryPayUniTradeStatus` 回 `{stillProcessing:true}`（與 TradeStatus 0／9／4 同路徑）：不寫 `payuni-query`、
   滿 4 天直接 expired、不寫 `expired_query_failed`。其他 `QUERY0xxxx` 維持現行。summary 另計 `notFound`，看得到棄單量。
3. **護欄**：已存 `payuni_response`（notify／return 到過）的單回 03001 → 不改判，改寫 error（PayUni 端曾有這張單卻查不到，屬異常）。
4. 順手：查詢請求照官方建議加 `User-Agent: payuni`；README 碼表段（本 PR 已補出處）改寫成新行為。
5. **現有 4 張單**：業主到 PayUni 後台查完（§5-1），沒有實付就把那 3 筆 error 告警標已處理；`20261114175042776H9S` 同樣處理。

### 3.3 正式站唯讀查詢（主 session 11/20 代跑）

| # | 查詢 | 結果 | 判讀 |
|---|---|---|---|
| Q1 | 對帳帳本曾否有一輪 `checked > queryFailures`（問到過任何一張單） | **0 列**：11/12 前窗內 0 張 pending，之後每次查詢都回非 SUCCESS | 正式站查詢路徑**沒有任何正控樣本**，無法排除「連已付款單也查不到」——§3.2 第 1 步（正控）是第 2 步的前置條件，順序不能倒 |
| Q2 | 四張單現況 | 四張都已 expired（`20261114175042776H9S` 已過門檻）；`payuni_response` 全 null、`reconcile_unknown_at` 全 null、`renewal_mode` 全 null | 從未收到 notify／return，與「沒在 PayUni 頁送出付款」一致 |
| Q3 | 同會員其他訂單 | 會員甲：`BRI1XE`（11/12 expired）、`HSZTIE`（11/13 04:11:38 expired）、`HAXG72`（11/13 04:12:22 completed）——44 秒後重試成功，前兩張是棄單。`GSCF7`、`776H9S` 的會員各只有那一張 | 會員甲確定是棄單；另兩位要看業主在 PayUni 後台的結果（§5-1） |
| Q4 | 部署後告警 | `payuni-query` 1 筆（11/12 06:07，`QUERY03001`、message 空）＋`reconcile-pending-payments` 3 筆（11/16 05:07、15:07、11/17 05:07），皆未 resolved；`776H9S` 那筆預期也已寫入 | 與 §3.1 的去重行為一致（查詢層一組一筆、expired 前每張一筆） |
| Q5 | 11/01 後 expired 單有沒有 `payuni_response` | 4 張全部 null | **沒有「已收到付款通知卻被標 expired」的單**——目前沒有真實損失 |

結論：沒有錢的損失（Q5＝0），但正控從未發生（Q1＝0）。§3.2 維持「先正控、後改判」。
業主在 PayUni 後台核對 `GSCF7`、`776H9S` 兩位只有單張訂單的會員最要緊（§5-1）。

## 4. 流程

### 4.1 三種 session 分工

- **照〈慣例〉走**：主 session 沒寫產品碼；7 支程式 PR 都由執行 session 施工，其中 5 支合併前另派獨立 Opus 審查，全部抓到東西：
  #523 P1（手勢 chunk 載入失敗整頁重載）、#524 P1（LINE 截 60 字）、#521 P0（unplaceable 成環無限遞迴）＋P1 2、#525 P2 8、#526 P2 7。
  沒派獨立審查的 #520、#522 由主 session 親審，本輪的 P1-1、P2-2 都落在 #522——**金流相鄰的前端 PR（同一個結帳頁）也值得派獨立審查**。
- **裁決編號全由主 session 發**：W6-1～35 沒有撞號。
- **R6 開在上線 9 天後**（W6-35 原訂 48 小時）：主 session 的排程查詢因 worker 重啟延後一週才跑，`QUERY03001` 的 3 則告警因此累積到 11/18 才判讀（§4.2）。
- **審查 session 不碰 Supabase MCP**：正式站 SQL 全交主 session 代跑，照新規運作。

### 4.2 框架摩擦

已寫進 `docs/plans/friction-log.md` 新節「2026-11-17｜第 6 波審查」：worker 重啟讓排程查詢延後一週、推送守衛在 `git fetch` 時自動 rebase 主 session 分支、
PayUni sandbox 偶發 403 重複出現、外部碼表要以官方文件查證而非猜測（`QUERY03001`）、第 5 波 W5-x 裁決原文的取回指令。
LINE 通道截 60 字（S1 節第 6 條）、Management API 以真實回應驗證（S6 節第 3 條）已在 friction-log，本節只確認並補一句可複用的教訓。

## 5. 給主 session／業主的待辦

| # | 事 | 給誰 | 建議 |
|---|---|---|---|
| 1 | PayUni 商店後台查 4 張單是否實付：`202611121258381GSCF7`、`20261112224703BRI1XE`、`20261113121138HSZTIE`、`20261114175042776H9S` | 業主 | 必做。PayUni 已回「查無符合訂單資料」，預期都沒實付；查完把 3 筆告警標已處理 |
| 2 | `QUERY03001` 怎麼處理 | 業主裁決 | **已裁 W6-36（照建議）**：第 7 波先做正控，通過後改判「確認查無」靜默標 expired；已存 `payuni_response` 的單仍寫 error |
| 3 | P2-11 自癒延遲開通的新約，清帳本是否要扣掉付款到開通之間新賺的點數 | 業主裁決 | **已裁 W6-37（照建議）：接受**，本 PR 已寫進規格書 §6.2 |
| 4 | #521 的 320px 三個分頁並排實看（develop 後台推薦樹） | 業主 | 手機開 develop 後台看一眼即可 |
| 5 | PayUni sandbox 403 第三次出現 | 業主／主 session | 業主詢問 PayUni sandbox 是否有 WAF 或維護窗；主 session 照 P2-12 調整推播門檻 |
| 6 | 第 7 波第一批 | 主 session | P1-1＋P2-2＋P2-3（同一結帳頁，Sonnet `/fix-bug`）；`QUERY03001`（Opus `/fix-bug`，依 §5-2 裁決） |
| 7 | 核准 `production` 前的人工 4a 是否保留 | 業主裁決 | **已裁 W6-38（照建議）：保留**，本 PR 已寫進〈慣例〉 |

## 6. 升級進長期文件（launch-wave-6/ 退場依據，由第 7 波 R7 執行）

### 6.1 第 5 波退場（本 PR 執行）

`docs/plans/launch-wave-5/` 已依 R5 §6.2 逐條處置後刪除（`git show 252ebc6:docs/plans/launch-wave-5/<檔>` 取得回）：

| R5 §6.2 項目 | 去處 | 狀態 |
|---|---|---|
| W5-5／12／47／13／14 | 規格書 §5.2（:229-234）、§2.1（:60）、§6.2（:338-345） | 已含 |
| W5-15～17、41／42／44／45 | `supabase/README.md:161-195`、`:94-105`；規格書 :771；checklist :130 | 已含；**TradeStatus 與查詢層碼表出處本 PR 補進 `supabase/README.md`**（「單筆交易查詢 Ver 2.0」與「錯誤代碼／交易查詢」） |
| W5-8、49～52、54～56、58、59 | 規格書 §6.2（:322-335）、§9.1（:620-627）、§9.2（:648-652） | 已含（W5-54「首購放行、後端兜底」只在 `PaymentCheckout.test.tsx:1192-1200`，屬前端細節，接受） |
| W5-24～29、21／22／27 | 規格書 §3（:114-118，已是 S4 跟手後的現行行為） | 已含 |
| W5-34 顯名 | 規格書 :116；`scripts/gen-district-centroids.py` 檔頭 | 已含 |
| W5-36～39、57、68 | 規格書 §15（:1024-1040） | 已含 |
| W5-53 用語 | `src/terminologyGuard.test.ts`；規格書 :351-353 | 已含 |
| W5-62 部署順序 | 自動檢查已上線（`deploy-supabase.yml:129-143`、`scripts/check-remote-migrations.py`、規則 14、`supabase/README.md:205-211`）；核准前人工 4a **本 PR 補進 `docs/README.md`〈慣例〉** | 退場條件達成 |
| W5-67 密鑰清單 | `docs/supabase-setup-checklist.md` | **本 PR 改寫輪替段**：兩環境、五處同值 |
| R5 §4.2 摩擦 | friction-log「2026-11-07」節 | 已含；標題改成 `git show 252ebc6:…` |
| 第 5 波 plan §3 執行環境須知 | `docs/README.md`〈慣例〉雲端須知 | **本 PR 搬入**（fetch --prune、commit／push 分兩次、`ci-ok` expected、晉升 PR 開著不合、連不到的網域、worker 重啟） |
| 第 5 波 plan §5 候選＋R5 §6.3 補遺 | `launch-wave-6/plan.md` §5〈承接第 5 波〉 | **本 PR 搬入**（扣掉第 6 波已收）；第 4 波稽核 P2 細目以 `git show` 取回 |
| 產品碼註解裡的 W5-x 編號（約 78 檔） | friction-log 本波節寫了取回指令 | 已處置 |

`scripts/`、`.github/`、`src/`、`supabase/`、`.claude/` 都沒有引用 `launch-wave-5/` 路徑，CI 不受影響。

### 6.2 第 6 波（R7 執行）

| 內容 | 去處 | 理由 |
|---|---|---|
| W6-10～13、W6-23、W6-24（獎金未發 error 告警、文案前 60 字、per-user 自癒逐筆） | `supabase/README.md`〈補發漏發獎金〉與函式表（S1 已寫）——R7 核對；P2-9 的「以 `referral_award_chain` 為準」一起補 | 營運手冊 |
| W6-11（heal 失敗只寫帳本、不推 LINE）、W6-8（`unknownByReason`、`p_trigger`） | `supabase/README.md` 排程段——R7 核對 | 營運規則 |
| W6-15～19、W6-21、W6-26（推薦樹：照發但不可提領、成環停發、第 N 層／第 N 代用語、無法接上的群組） | 規格書後台段（S3 已寫）——R7 核對 | 規則的單一事實來源 |
| W6-18（點數對帳四條跨表核對） | 規格書後台段（S3b 已寫）——R7 核對 | 同上 |
| W6-27～31（新約綁建單時的預設碼、第三態「維持不變」、不揭露範圍） | 規格書 §6.2、§7.4（S6 已寫）——R7 核對 | 獎勵規則 |
| W6-20、W6-22（換篇手勢數值、reduced-motion） | `docs/ui-ux-guidelines.md`（S4 已寫）——R7 核對 | UX 規則 |
| W6-9（行政區改名以 `array_replace` 冪等轉換） | migration 檔頭即可 | 一次性 |
| W6-4／34（`PHOTO_PURGE_LIVE` 兩處須一致） | `docs/supabase-setup-checklist.md`——R7 核對 | 營運手冊 |
| §3.2 `QUERY03001` 新判讀（W6-36；若第 7 波已修） | `supabase/README.md` 告警 severity 段 | 營運規則 |
| P2-11 裁決結果（W6-37） | 規格書 §6.2（本 PR 已寫）——R7 核對 | 獎勵規則 |
| 本報告 §4.2 摩擦 | friction-log「2026-11-17」節 | 本 PR 已寫 |
| plan §5 候選＋6.3 補遺 | 第 7 波 plan | — |
| 其餘（§1 時程、§2 工作分解、§7 名冊、§8 進度、dispatch-prompts.md） | 隨目錄刪除 | 一次性施工紀錄 |

### 6.3 第 7 波候選補遺（plan §5 漏列；主 session 併入 §5）

本報告：P1-1（同類：輪詢與掛載導向）；P2-1～P2-12；`QUERY03001` 工項（§3.2）。
PR 未驗與已知限制：#525「載入更多」aria-live 兩區一起改、`LedgerState`／`PagedState` 合併與 merge 抽共用、清空金額改單次 window sum（reset 變多時）；
#521 `tree_node` 重複呼叫（併 P2-6）、320px 三分頁（§5-4）；#526 `current_default_code_read_failed` 無測試（已接受，不追蹤）。
