# 第 1 波審查報告（審查 session，2026-10-31）

<!-- plans-keep: 第 1 波審查報告；與 plan.md 同生命週期——第 2 波主 session 依 §6「升級進長期文件」逐條處置後，隨整個 launch-wave-1/ 目錄刪除 -->

範圍：`git log --merges 67a27ec6..origin/main`，main HEAD **`1433b87`（#450，10/30 18:15 台北）**——
審查 prompt 預期的 `52039ca`（#439）之後又多了一次晉升，本報告一併審。共 **8 次晉升**
（#411、#417、#423、#426、#432、#435、#439、#450），develop 側 49 支 PR，393 檔、+38,958／−4,234 行。
行號一律引用 main `1433b87` 的樹。

審法：四視角（系統／架構／UI/UX／需求）各一個 agent 讀 diff 與 main 原始碼；每條 P1 由審查 session
自己對原始碼反駁一次，只留反駁後仍成立的（被推翻的列在 §1.4）。現場資料由第 2 波主 session 以 Supabase MCP
唯讀代跑（子 session 的 MCP 權限視窗到不了業主），GitHub issues／Actions 由本 session 直接查。`/health`
本容器打不到 `*.supabase.co`，略過。

**總結：P0 0、P1 4、P2 13。** 四個 P1 有兩個跟 #449（凍結期上 main 的 `TradeInvoice=1`）有關，另兩個是
告警管線「錢相關事件到不了 LINE」的缺口。

## 1. 發現

### 1.1 P0

無。

系統視角已核實的「沒問題」（列出來是因為它們是上線前最怕的幾處）：`find_auth_user_by_email` 是 security
definer、`search_path` 固定、只 grant `service_role`（`supabase/migrations/20261025000001_find_auth_user_by_email.sql:26-47`）；
R2 purge 的判準（未驗證、從未登入、有邀請章、零 `payment_orders`）與刪除在同一句 delete 內，不會誤刪付費帳號
（`20261025000011_purge_stale_referral_invites.sql:96-111`）；邀請 token 先驗 HMAC 再看到期、缺 secret 拋錯
（`supabase/functions/api/referral-invite-token.ts:76-101`）；`DELETE /listings/photos` 以 token 的 userId 比對路徑前綴、
他人前綴 403、全表引用檢查 fail-closed（`supabase/functions/api/listing-photos.ts:41-64,95-106`）。

### 1.2 P1

**P1-1　#449 `TradeInvoice=1` 的商店前提在晉升時完全驗不到，正式站上線後零真付款、尚未實證**
（`supabase/functions/api/index.ts:2108-2110`）

- 程式只靠註解寫「前提是商店後台已開通電子發票（正式與測試商店各自設定）」，沒有旗標、沒有 fallback。
- 前提在 sandbox **不成立**：測試商店未開通時 PayUni 拒收整張支付頁（工項 H 實證 `UPP02085`，主 session 轉述）。
  也就是說，商店沒開通時，**不是**忽略這個參數，而是**每一筆付款都失敗**；而 `/payuni/prepare` 仍回 success、
  DB 留 pending 單、不會有任何告警（商店級錯誤不告警，見 plan §6）。
- 晉升閘門驗不到它：journey-full 目前走 webhook（#413，簽章注入，不碰 PayUni 建單）；唯一的測試
  `payuni-prepare-payload.test.ts` 只驗 EncryptInfo 帶了參數。
- 現場：#450 後端部署（約 10/30 10:20 UTC）之後，正式站**零筆訂單**（最後一筆 completed 在 10/30 09:48 UTC，
  在部署之前）。業主口頭確認正式商店已開通，但沒有一筆真付款能證明。
- 連帶：develop（sandbox 測試商店）的真後端付款從 #449 合進 develop 起應該全數 `UPP02085`；11/03 規則 13
  到期、journey-full 改回 sandbox 時，也會撞上同一個錯，跟 harness 的表單問題疊在一起，很難分辨。
- 處置建議：(a) **業主盡快在正式站完成一筆真付款**（或到 PayUni 正式商店後台截圖「電子發票已啟用」）；失敗就
  立刻 hotfix 拿掉該行，那時這條升為 P0。(b) 第 2 波讓 `TradeInvoice` 由 secret 控制（如
  `PAYUNI_TRADE_INVOICE=true`），正式與測試商店分開開；develop 在測試商店開通前保持關閉。

**P1-2　#449／#448 在 10/29–31 凍結期上 main，核准只有 PR 內文的轉述**（流程，見 §4.1）

- 裁決 8：凍結期只許 hotfix，不上新功能、不動註冊／付款／登入主幹，hotfix 也要走晉升＋業主核准
  （`docs/plans/launch-wave-1/plan.md:30,132`）。
- #449 是新功能（開電子發票），而且改的是付款主幹 `/payuni/prepare`；#448 是新的 SEO 品牌改動（title、
  JSON-LD `alternateName`，另外多帶了 PR 敘述沒提的 `Organization.sameAs`），不碰主幹，但也不是 hotfix。
- #450 內文的「偏離規劃說明」寫了「業主 10/30 明確指示照開完整晉升，視為業主核准的例外」。但 PR 上沒有業主
  留言或 review；`plan.md`、`docs/plans/` 全文 grep 不到 TradeInvoice、電子發票、#448、#449 的裁決（沒有「裁決 40」）；
  §8 進度表沒有 #450 那一列（10/30 22:42 的收尾列寫「無開著的 PR」，沒提當天 18:15 的晉升）。
  #450 內文的未勾項也包括「`check:full`」「擋晉升項已合併（待業主確認）」，#449 自己寫的前提「晉升 main 前需確認正式商店
  已開通電子發票」在 #449、#450 都沒有任何回應。
- 就算業主核准屬實，凍結規則也只放行 hotfix：核准給了「晉升」，沒有把 #449 變成 hotfix。核准的意義應該是
  「業主知道這支動了付款主幹、而且前提已確認」，這兩件事都沒有留下紀錄。
- 處置建議：業主的核准原話與對象（哪幾支 PR）補進 plan §0（裁決 40）；凍結規則升級進 `docs/README.md`〈慣例〉時，
  把「凍結期的晉升 PR 要在內文列出每支 PR 屬哪一類 hotfix」寫成規則。

**P1-3　錢相關的對帳告警是 warning 級，永遠到不了 LINE**（`supabase/functions/api/index.ts:2595-2600, 2614-2617, 2625-2628, 2631-2635`）

- `logSystemAlert(Once)` 沒傳 severity 時預設 `'warning'`（`index.ts:2268, 2309`）；`/internal/system-alerts/recent`
  只撈 `severity='error'`（`index.ts:2789`）→ `reconcile-payments.yml` 只推 error。
- 走不到 LINE 的三條：
  - 訂單在查詢層失敗下被標 `expired`（`expired_query_failed`，訊息寫著「請人工向 PayUni 確認是否實付」）。
  - **PayUni 說已付款、但 `resolveFn` 開通失敗**（使用者付了錢沒開通）。
  - 對帳迴圈例外。
- 反駁後縮小的範圍：查詢層失敗這個類別本身**有** error 級告警（`payuni-query`，`index.ts:2577-2587`），但它依
  Status＋Message 去重，只要上一筆未 resolve，後續整批都不再寫，而推播窗口又只看新寫入的 error。所以第一次
  推過之後，4 天後真正把某張單標 expired 的那一刻，LINE 不會有任何訊號。
- 這正是 #407／issue #395 要補的缺口的反面。
- 處置建議：這三處改 `'error'`（`expired_query_failed` 是按訂單號去重，不會洗版）；對帳例外可維持 warning，
  但 resolve 失敗必須是 error。

**P1-4　LINE 推送失敗時告警永久遺失**（`.github/actions/notify/action.yml:76-82` ＋ `.github/workflows/reconcile-payments.yml:110-128`）

- notify 在 HTTP 非 200 時只寫 `::warning::` 並 `exit 0`，run 照樣 success。
- 下一輪的查詢窗口從「上一次**成功** run 的建立時間」起算，所以那一輪的 error 告警不會再推第二次。註解寫的
  「at-least-once」只在 run 變紅時成立。
- 這不是理論風險：10/27 業主第一次就把 Channel secret 當成 token 貼進去（plan §8 10/27 18:50 列）。那段期間的
  任何告警都會這樣靜默消失。
- 處置建議：推送失敗讓 notify 回非零（或輸出 `sent=false` 讓呼叫端 fail）。run 變紅就不推進窗口，也會觸發
  既有的「排程失敗」issue。

### 1.3 P2（記債，第 2 波排）

| # | 檔案:行 | 內容 |
|---|---|---|
| 1 | `src/components/PaymentResult.tsx:621`、`:549` | 成功頁缺 `AuthAmt` 時寫死顯示 `NT$ 1,200`；副標固定「帳號已完成註冊」，續約會員也看到這句 |
| 2 | `src/components/listing/PhotoCropDialog.tsx:119-122, 196` | Cropper 沒掛媒體載入失敗處理：預覽網址失效時「完成」永遠 disabled、無說明（取消仍可離開，不是死路） |
| 3 | `src/components/referral/InviteCard.tsx:83-94`、`index.html:8` | iOS Safari／LINE 內建瀏覽器不認 `interactive-widget`，置中對話框的 Email 欄可能被鍵盤蓋住；`scrollIntoView` 只對結果文字（`:146-149`）。併入 plan §6「邀請體驗整體重調」 |
| 4 | `.github/workflows/ci.yml:509-512` | 規則 13 到期日 11/03：機械把關存在（`scripts/check-workflows.py:291`），到期後 **develop 每支 PR 的 framework-check 都會紅**。harness 修好之前要先延期（附理由），不要讓它變成全面紅燈；並且要先處理 P1-1 的 sandbox `UPP02085` |
| 5 | `.github/workflows/deploy-supabase.yml:193-194, 216` | #437 把 `EXPECT_PRODUCTION_PAYUNI` 寫死 `'true'` 後，註解與 else 分支的「開放前記得改成 true」成了不可達的過期文字 |
| 6 | `.github/workflows/deploy-supabase.yml:133-149`、`.github/workflows/journey.yml:403` 起 | `--use-api` 部署退避迴圈抄了兩份；規則 12 只驗「有 for＋sleep」，不驗兩份一致 |
| 7 | `.github/actions/notify/action.yml` | composite action 不在 `check-workflows.py` 掃描範圍；journey 失敗、晉升 PR `ci-ok` 紅未接 LINE（#406 最小版，範圍已知） |
| 8 | `.env.production:6`、`src/utils/referralInvite.ts:208` | Email 邀請旗標寫進 git 後，緊急關閉要走 commit→PR→晉升→CF 重建；沒有一頁寫關閉流程（後端 `REFERRAL_EMAIL_INVITE_ENABLED=false` 可先擋，前端會變成寄送失敗而非隱藏） |
| 9 | `supabase/migrations/20261025000001_find_auth_user_by_email.sql:42` | `lower(u.email)=lower(p_email)` 走不到 email 索引；GoTrue 已存小寫，可改 `u.email = lower(p_email)` |
| 10 | `supabase/functions/api/listing-photos.ts:95-106` | 同帳號雙分頁時，刪照片與存刊登有競態（破圖或孤兒檔，只影響本人；孤兒無排程清理，已在規格書 §14） |
| 11 | `supabase/functions/api/index.ts:2304-2333` | `logSystemAlertOnce` 未 resolve 就不再寫：持續性故障只推一次，與 P1-4 疊加時零訊號 |
| 12 | `.github/workflows/reconcile-payments.yml:25` | cron 每小時，但 10/29–30 實際間隔 4–7 小時（20:51、00:35、06:46、13:49、18:58、22:53 UTC）；plan §5 的「中位 1.7 小時」已不成立。卡單撿回的最壞延遲要重估（候選：外部排程或 Supabase pg_cron 打端點） |
| 13 | `src/utils/referralRewardRules.ts:3` | 條款內文的「推廣人員資格」是律師定案文本，不是 UI 文案，不違反「一律推薦人」；記下以免下次 grep 再報 |

### 1.4 被反駁推翻的

- 架構視角提的「journey-full webhook 暫時例外沒有機械到期」：`scripts/check-workflows.py:159-165, 291-313`（規則 13）
  會在「暫時至 YYYY-MM-DD」過期時讓 CI 紅，而且有 self-test。降為 P2-4（到期的後果提醒）。
- UI/UX 視角的 P2-1「成功頁金額寫死」不確定定價：年費確實是 1,200（規格書 §4 Step 3），所以只在 `AuthAmt`
  缺值時才會出錯；維持 P2。

### 1.5 裁決落實核對（需求視角，抽查主檔）

裁決 7、18、19、20、25、31、32、34、35（`PHOTO_NUDGE_STEP_PX = 4`，`src/utils/constants.ts:555`）、36（`1/3` 計數
`src/components/listing/PhotoCarousel.tsx:108-111`）、37、38、39 **全部落實**；24（icon 黑底白字）只確認檔案存在，
沒有逐像素驗。使用者可見文案「推薦人」：`src` 非測試檔 grep「上級／上線／推廣人」零命中（除 P2-13）。
#449 在規格書 §4 Step 3 補的電子發票句與程式一致。

## 2. 未驗項清單

來源：34 支 PR 的內文、留言、review 與 check-runs，對照 plan §7／§8。「已驗」的只列需要特別說明的。

| PR | 自述未驗 | 之後 | 結論 |
|---|---|---|---|
| **#449** | 「晉升 main 前需確認正式商店已開通電子發票」 | PR 無留言、§8 無紀錄、部署後零真付款 | **未驗（最高風險，P1-1）** |
| #399／#409 | R2 hosted 首測：`{{ if }}` 分支、重寄套新 metadata、purge 刪 `auth.audit_log_entries`、「已邀請未點連結→忘記密碼」路徑 | webhook 子集綠（§8 10/27 18:50，邀請 GUI 在 hosted 通過）；業主手測含重寄連結不同（§8 10/28 07:40）。**audit 列刪除的 SQL 核對**（plan §7 第 11 步）與**忘記密碼路徑**找不到紀錄 | 部分驗 |
| #405／#414 | 真機看 LINE／FB 分享預覽與 favicon | 無紀錄 | 未驗 |
| #407 | PayUni 查詢層碼表未經 sandbox 實打 | issue #395 留 open | 未驗 |
| #413 | journey-full 11/03 前改回 sandbox | 醒來後待辦 #11 ⬜ | 未驗（且被 P1-1 的 `UPP02085` 擋住） |
| #422 | 375px 溢字只做 class 斷言 | 業主手測只涵蓋「同高、同一排」 | 部分驗 |
| #421 | 真機細節（窄格溢出、內建瀏覽器 unsupported 分流） | 移到第 2 波（plan §6） | 未驗 |
| #430 | 箭頭桌機顯示／手機隱藏沒有 e2e | 無 | 未驗（P2，plan §6 已列） |
| #431 | 交業主正式站手測置中 | §8 10/28 07:40 手測 OK | 已驗 |
| #448 | 本機沒跑 `check:full` | #450 `ci-ok` 綠 | 已驗 |
| #450 | `check:full`、biome、「擋晉升項已合併（待業主確認）」未勾 | — | 未驗 |

**晉升 PR**：8 支全部是 merge commit（雙親）；每支 head 的 `journey-full / journey-suite` 都是 success；都在 `ci-ok` 轉綠後 1–57 分鐘
才合併，沒有繞過 ruleset（#439 原裁決 bypass，最後重跑綠、正常合併）。#417 的 `ci-ok-push` 曾因 e2e 超時紅，`ci-ok` 綠。
注意 #413 起的 journey-full 都是 **webhook 模式**：「journey 綠」不代表 PayUni 建單被驗過（P1-1）。

## 3. 上線後現場（2026-10-31 00:55 UTC，主 session 代跑 `measure.sql`＋補查）

| 項 | 值 | 對照 plan §5 預期 |
|---|---|---|
| 註冊漏斗（24h） | 2 建立／2 驗證 | 正常（完成率 100%）。累計 users 13，遠低於裁決 7 預估的 100–500 人——容量假設沒有被考驗到 |
| 步驟分布 | 13 人全在 step 3 | 正常 |
| 訂單 | 16 筆：completed 13、failed 3 | failed 3 都在 10/28：02:40、02:41 兩筆 `DEF01006 商店狀態不符合`（舊商店停用；`payuni_response` 只有 5 鍵），08:47 一筆 `CREDIT05002 授權失敗`（23 鍵完整，持卡人端）。**10/30 09:48 UTC 之後零訂單**——見 P1-1 |
| 卡住 pending | 無回應 >20 分 0；pending 但 SUCCESS 0 | 正常 |
| 未解決 system_alerts | 0 | 正常；但 P1-3 的 warning 也會落在這裡，0 代表三條路徑都沒發生，不代表告警管線完整 |
| check-email 限流 | 打滿 0、unknown 桶 0 | 正常 |
| R2 邀請 | 0 發出、逾期未驗證 0 | **R2 上線後零使用**：加入推薦計畫 12 人，沒有人用過 Email 邀請。正式站實寄只在 10/28 由業主驗過一次 |
| 其他 | 刊登 10、is_admin 2、加入推薦計畫 12 | — |
| `/health` | 略過 | 本容器打不到 `*.supabase.co` |

**GitHub open issues（5 張）**

| # | 狀態判斷 |
|---|---|
| **#458 付款對帳排程失敗**（10/30 22:53 UTC，bot） | run 41141064038 在 runner 端 `curl: (6) Could not resolve host: uhtwwxtazwqnlbejhprl.supabase.co`，是暫時性 DNS 失敗，不是後端問題。LINE P1 告警**有送達**（log：`LINE 告警已送出`）。前一次 18:58 run 綠、pending 0 → 無實害。下一次綠 run 之後手動關閉即可（issue 不會自動關） |
| #395 PayUni 查詢層非 SUCCESS | #407 已補告警，方向 3（sandbox 實打碼表）留 open。與 P1-3 相關 |
| #384 upline-pairing-lines 規則去處 | 非本波，`docs/plans/upline-pairing-lines/` 仍在 |
| #383 R0 推薦碼端點 P2 | 非本波 |
| #288 journey 排程連紅 | 與 #413 的 webhook 例外、11/03 到期同源，第 2 波 harness 修完一起關 |

plan §6 列的「部署失敗 issue 群（#337–#400）」已全數不在 open 清單（被清掉或關閉），§6「既有 issue 收斂」那一列可以縮小成
只剩 #288。

## 4. 流程

### 4.1 10/29–31 合進 main 的是否都是 hotfix

凍結期 main 只收過一次：**#450（10/30 18:15 台北，merge commit，journey-full 綠，未繞過 ruleset）**。內含 9 支 develop PR：

| PR | 類別 | 判斷 |
|---|---|---|
| #441–#447 | docs（§8 量測、§6 待辦、friction-log） | 不受凍結限制 |
| #448 | SEO 品牌（title、alternateName、sameAs） | 新功能，**不是 hotfix**；不碰主幹，風險低 |
| #449 | `TradeInvoice=1` | 新功能且**動付款主幹**，違反裁決 8 兩條。見 P1-1、P1-2 |

另：10/28 是否凍結由裁決 30 解除（「10/28 不凍結」），所以第 4–7 次晉升都在授權內。

### 4.2 三種 session 分工

- **大致照設計運作**：主 session 不寫產品碼（例外：#419 旗標一行、#431 一個 class＋一個 meta，都在 ≤10 行例外內並記 §8）；
  執行 session 一工項一個，名冊完整；審查 session（本 session）在波末開出。
- **走樣一**：#448、#449 的分支是 `claude/eager-galileo-*`、`claude/tender-fermat-*`，名冊沒有它們、§8 沒有派工紀錄。
  看起來是業主直接開的 session，繞過主 session 合進 develop、再被收進 #450。主 session 的「凍結期守門」因此沒有發生。
- **走樣二**：第 2 波已經開跑（#452–#457 已合進 develop：build-sha 告警、首頁返回不閃、篩選還原），而本審查在第 1 波
  plan 定義的「凍結期結束」之前就開出。這不是錯，但 §6 的兩個「第 2 波優先」已在 develop 上實作，本報告只審 main，沒審它們。
- **走樣三**：審查 session 依 prompt 要用 Supabase MCP 跑 `measure.sql`，但子 session 的 MCP 呼叫要人按核准，業主不在畫面上，
  卡了約一小時，由主 session 代跑。dispatch prompt 應寫明「現場 SQL 由主 session 代跑」。

### 4.3 還沒進 friction-log 的摩擦

1. **凍結期的守門只寫在 plan 裡，沒有機械把關**：任何 session 都能把 PR 合進 develop、再被下一次晉升帶上 main。
   候選：凍結期間的晉升 PR 內文必須逐支標類別；或 `ci.yml` 在 base=main 且日期落在凍結窗口時要求 PR 內文帶 `hotfix:` 清單。
2. **晉升閘門驗不到「商店設定前提」**：journey-full 走 webhook 時，所有 PayUni 建單參數的變更都只有單元測試在驗
   參數「有帶」，沒有任何一層驗 PayUni「收不收」。規則：改 `/payuni/prepare` 送出的參數，PR 必須附一次 sandbox 實打
   （或正式站真付款）的結果；webhook 例外期間不得改。
3. **錢相關告警的 severity 沒有準則**：`logSystemAlert` 預設 warning，推播只看 error，結果「使用者付了錢沒開通」
   在設計上就到不了人。規則：凡是訊息含「人工確認是否實付」或 resolve 失敗的，一律 error；`payuni-notify-alerts.test.ts`
   的防規退擴到對帳迴圈。
4. **notify 吞掉推送失敗**：告警通道本身的失敗要讓 run 變紅（P1-4）。
5. **子 session 不能用要人核准的 MCP 寫入／查詢**：審查 session 的現場量測卡一小時，改由主 session 代跑。
6. **GitHub 排程的實際間隔可達 4–7 小時**：對帳延遲的估計要用實測，不能用 cron 名義值（P2-12）。

## 5. 現場驗證的待辦（給主 session／業主）

1. 業主在正式站完成一筆真付款（或截 PayUni 正式商店「電子發票已啟用」），結果記 plan §8。這條是 P1-1 的解除條件。
2. #458 在下一次綠 run 後關閉。
3. 業主追認／不追認 #448、#449（P1-2），寫進 §0。

## 6. 升級進長期文件（launch-wave-1/ 退場依據）

| 內容 | 去處 | 理由 |
|---|---|---|
| 凍結規則（只許 hotfix、不動註冊／付款／登入主幹、無 migration、hotfix 走晉升＋業主核准）＋凍結期晉升 PR 要逐支標類別 | `docs/README.md`〈慣例〉「每波三種 session」旁 | 每波都會再用；本波唯一一次凍結期晉升就破了 |
| 三種 session 分工表（plan §2）與「主 session 不寫產品碼，≤10 行 CI／文件例外」 | `docs/README.md`〈慣例〉（CLAUDE.md 已有指標） | plan 刪除後唯一的完整定義會消失 |
| 清資料 SOP（plan §4：先 Storage 由 Dashboard 清、再 `delete from auth.users` cascade、序列 restart、零殘留查詢；破壞性段由業主在 SQL Editor 貼） | `docs/supabase-setup-checklist.md` | 下次重建正式站或演練會再用；本波演練＋正式各一次已驗證 |
| 電子發票由 PayUni 代開、本系統不存發票資料；`TradeInvoice` 依商店是否開通 | 規格書 §4 已有前半句；後半句（商店前提、sandbox `UPP02085`）進 `docs/supabase-setup-checklist.md` 的 PayUni 段 | 前提只寫在程式註解，P1-1 |
| PayUni 換商店的 SOP（`DEF01006` 代表商店停用；換商店＝重設三把 Secret＋後台 Notify／Return URL 指向後端） | `docs/supabase-setup-checklist.md` PayUni 段 | 10/28 實際發生；#440 已補 ReturnURL，確認換商店整段都在 |
| Cloudflare 建置設定一律在 git（儀表板變數進不了建置，`wrangler.toml` 為唯一來源） | checklist（#419 已改措辭）——確認後免動 | 已升級，退場時只需核對 |
| `workflow_run` 部署 run 的 head 顯示為預設分支；核准 production 要找「緊跟 main CI push run」那筆 | `docs/supabase-setup-checklist.md` 或 `docs/operations.md` 的部署核准段 | 業主每次晉升都要做 |
| 裁決 39：PayUni `AuthBankName` 是收單行、`CardBank` 是發卡行代碼 | `src/components/PaymentResult.tsx` 已有註解；規格書付款結果頁一句 | 免得有人再加回來 |
| 裁決 18：失敗的 module fetch 依 HTML 規格會被記成 null，原地重試永遠失敗 → 一律重新整理 | friction-log 原則（`lazyWithRetry` 第 2 波簡化時一併） | 跨元件的瀏覽器事實 |
| 本報告 §4.3 六條 | friction-log 新節「2026-10-31｜第 1 波審查」 | 本 PR 已寫入 |
| 其餘（§1 時間線、§3 工作分解、§5 量測、§7 業主清單、§8 進度、執行 session 名冊、dispatch-prompts、measure.sql） | 隨目錄刪除 | 一次性施工紀錄，`git show` 取得回 |
