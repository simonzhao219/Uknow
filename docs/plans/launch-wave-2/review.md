# 第 2 波審查報告（審查 session，2026-10-31）

<!-- plans-keep: 第 2 波審查報告；與 plan.md 同生命週期——第 3 波主 session 依 §6「升級進長期文件」逐條處置後，隨整個 launch-wave-2/ 目錄刪除 -->

範圍：`git log --merges 1433b877..5b6a7904`（#450 晉升之後到 #463 晉升，10/31 12:41 台北合進 main）。
共 11 個 merge：程式 PR 7 支（#454、#455、#456、#457、#459、#461、#462），docs 3 支（#451、#452、#460），加上晉升 #463。
42 檔，+2,019／−66 行。行號引用 main `5b6a7904` 的樹。develop 在那之後多了 #464（build-sha 收緊）與 #465（plan），
本報告只在相關處提到它們。

審法：四視角（系統、架構、UI/UX、需求）各派一個 agent，讀各 PR 的 diff 與 main 原始碼。四份報告共提出 8 條 P1 候選。
每條程式碼層的 P1 各派一個反駁者重新讀碼，流程類的 P1 由本 session 對 plan 與 PR 內文核對。**8 條候選全部降為 P2**，
降級理由見 §1.4。PR 內文、留言與 Actions 用 GitHub MCP 查。現場 SQL 交主 session 代跑（§3）。

**總結：P0 0、P1 0、P2 15。** 本波範圍小、每支 PR 都經主 session 審過，晉升後線上 build-sha 與安全標頭由 deploy-smoke 實證。
剩下的問題分兩類：一是告警管線仍有幾個「只推一次、或缺設定時靜默」的縫（P2-1～4），二是首頁快取在登出時不會清（P2-5）。

## 1. 發現

### 1.1 P0

無。

### 1.2 P1

無（8 條候選經反駁後全部降為 P2，見 §1.4）。

### 1.3 P2

已核實沒問題的（列出來是因為它們是審查 prompt 點名的重點）：

- **#461 分類**：`DEF01006`／`UPP02085` 歸商店級；對帳合成的 `FAILED_*` 排除在形狀判準外；帶 `ResCode` 的 `CREDIT*` 歸持卡人級，單筆不告警。
  持卡人級要一小時內、最後一筆成功付款之後，有 ≥3 位不同使用者失敗，才寫 `payuni-failure-burst`。
  寫入順序是先把訂單 update 成 failed，再告警，所以 burst 查詢看得到當筆失敗。兩種告警都是 `'error'`，推播端點只撈 error，兩邊對得上。
  notify 與 return 兩條路都會經過 `resolveOrderFromPayUni`，所以兩邊都接上了。兩邊的驗章失敗也各有一筆告警。
- **#459 `public/_headers`**：CSP 只有 `frame-ancestors 'none'`，沒有 `script-src`／`connect-src`／`form-action`，所以以下都不受影響：
  - PayUni 跳轉：頂層 `form.submit()`，`src/components/PaymentCheckout.tsx:537`。
  - PayUni 回 POST：打的是 Supabase 的 `/payuni/return`，不經過 Pages。
  - Supabase 連線與外部圖片。
  - Google Maps：`src/` 沒有任何 iframe 或 Maps 嵌入。

  HSTS 不含 `includeSubDomains`，也沒有 preload。正式站標頭由 deploy-smoke run 41172352231 實證齊全。
- **#454 build-sha 與 deploy-smoke**：
  - sha 來源依序是 `CF_PAGES_COMMIT_SHA`、`git rev-parse`、`unknown`，有格式白名單。
  - 寬限 30 分鐘內不符只警告，超過才紅，紅燈推 LINE。
  - #464 已把「線上無 build-sha／unknown」改為 fail，plan §4 第 4 點已落實。
- **#455／#457 快取內容**：`public_listings` 視圖登入與否內容相同，不含收藏、本人刊登或 admin 欄位。
  沒有任何 storage 持久化，不違反「admin 提領資料不得持久化」。詳情頁重驗遇到 404 時仍會正確轉成 notFound（`ServiceProviderDetail.tsx`）。
- **#462**：notify 非 200 時 `exit 1`；reconcile 的推送步驟移到最後、拿掉 `continue-on-error`。推送失敗會讓 run 變紅，下一輪窗口就不前移，同一批告警會重送。

| # | 檔案:行 | 內容 | 建議 |
|---|---|---|---|
| 1 | `supabase/functions/api/index.ts:2312-2333`、`:2413` | `logSystemAlertOnce` 的去重沒有時間窗：只要有同鍵、未 resolve 的列就不再寫。#461 的 `payuni-merchant` 因此在商店停用的整段期間只推 LINE **一次**；沒人在後台按 resolve 的話，日後同一原因再發生也永遠不推。去重語意本身是既有的（第 1 波 P2-11，`:1142` 註解已寫明），#461 只是多了一個依賴它的呼叫端 | 商店級的鍵加日期桶，比照 burst 已有的小時鍵；或在事故 runbook 寫明「處理完要 resolve」 |
| 2 | `.github/workflows/deploy-smoke.yml:151`、`:163` | #454 新增的 LINE 告警（`if: failure()`）排在既有的 PayUni 閘門探測**之前**，所以閘門紅（403／5xx，2026-10-07 那種事故）時只有 job 變紅、不推 LINE，排程 job 紅又沒人看。這是同類掃描的漏網：#454 補「前端部署零訊號」，同一個 job 的另一種故障仍是零訊號 | 把通知移到最後一步，條件涵蓋兩個 step；或另加一個 PayUni 專用的通知 |
| 3 | `.github/actions/notify/action.yml:57-66` | 缺 `LINE_CHANNEL_TOKEN`／`LINE_ALERT_TO` 時 no-op、`exit 0`。在 reconcile 這種「以上次成功 run 為窗口」的呼叫端，這等於 run 綠、窗口前移、告警遺失。#462 自述已知，plan §8 10/31 09:45 已列第 3 波候選 | reconcile 的推送 step 前先檢查 secret 非空，空的就 fail |
| 4 | `supabase/functions/api/index.ts:2830-2849` | `/internal/system-alerts/recent` 依 `created_at` 升冪取前 20 筆。窗口內新 error 超過 20 筆時，第 21 筆以後在窗口前移後永遠不推。批量故障正是最需要看到的時候 | 超量時在推播內文註明總數，並讓窗口只推進到已推的最後一筆 |
| 5 | `src/utils/homeListingsCache.ts:58`、`src/App.tsx:202-204` | 登出／session 過期都是 SPA 導頁、不重整，而 `SIGNED_OUT` 分支只清 adminCache 與邀請 token，沒呼叫 `resetHomeListingsCache`（現在只有測試在用）。共用裝置上，下一位使用者在同一分頁登入後，首頁會帶出前一人的搜尋字與篩選；定位被拒時，清單還會沿用前一人的座標排序。檔頭說座標「個資只留記憶體、重整即消失」，但登出並不會讓它消失。比照 `adminCache` 已有的 SIGNED_OUT 慣例 | `SIGNED_OUT` 呼叫 reset，並把註解從「測試用」改掉。一行修法，可併入 T1（同在 App.tsx 的 auth 事件段） |
| 6 | `src/components/HomePage.tsx:118-133`、`:284-288` | 快取還原不區分「返回」（POP）與「點 logo／導覽列重新進首頁」（PUSH），兩種都會還原舊篩選與捲動位置。業主 W2-10 只要求返回時還原。#455／#457 內文自述「可接受」，但沒有業主裁決紀錄 | 交業主裁決；要改的話用 `useNavigationType() === 'POP'` 決定是否還原 |
| 7 | `src/components/HomePage.tsx:351` | `totalFilters` 不含 `searchQuery`，所以只有搜尋字、又有結果時，面板外的「清除篩選」不出現。反駁後縮小：搜尋框（桌機）與手機底部列都會顯示搜尋字，手機徽章也計入搜尋字，sheet 內有「清除」鈕，空態有「清除搜尋與篩選」。結論是「多一步」，不是「清不掉」 | 低；可把 `searchQuery` 計入 `totalFilters` |
| 8 | `src/components/HomePage.tsx:284-288` | 捲動還原在 mount effect 裡同步 `scrollTo`，卡片圖片還沒載入時，文件高度可能不夠，會被夾到偏上的位置。測試只驗「有呼叫」，沒驗落點。業主真機驗收通過（W2-19），但只測了 develop 的資料量 | 卡片圖片確認有固定 aspect-ratio；資料量變大後再觀察 |
| 9 | `.github/workflows/deploy-smoke.yml:134` | 寬限期以 committer 時間（`%ct`）計。develop 若推上 rebase 過的舊 commit，剛 push 就可能被判超過 30 分鐘，在 CF 建置期間誤紅並推 P2 LINE。main 是 merge commit，不受影響（#454 自述的前提） | 記著；誤報出現再改用 push 時間 |
| 10 | `supabase/functions/api/index.ts:2890-2893`、`:2948-2951` | notify 與 return 在 `payuniConfig()` 擲錯（Secrets 缺件）時沒有告警。#461 friction-log 已記為第 3 波評估 | 同 friction-log |
| 11 | `supabase/functions/api/index.ts:2413` 一帶 | `payuni-merchant` 的去重鍵含 PayUni `Message` 原文；「沒有 ResCode 就是商店級」的形狀判準只有 3 筆實證。如果使用者取消也走這條，或 Message 帶變動內容，就會每種 Message 各推一次。#461 自述已知 | 上線後看 `system_alerts`（§3）；誤報出現再收斂 |
| 12 | `supabase/functions/api/index.ts:2115` | 第 1 波 P1-1 建議 (b)「`TradeInvoice` 由 secret 控制」沒有做，也沒有明確放棄：W2-18／19 只處理了 (a) 實測。商店前提已寫進 checklist（#468），#461 也會在 `UPP02085` 時告警，所以事後偵測有了，但事前防線仍沒有 | 主 session 在 plan 補一行「(b) 不做，理由」或列第 3 波候選 |
| 13 | `docs/plans/launch-wave-2/plan.md` §7、§5 | 工項 A（後台會員推薦碼，W2-2 納入）名冊仍寫「批 2」，§5 第 3 波候選也沒有它，是唯一被靜默擱置的裁決工項 | 主 session 在 §5 補一行；寫明是業主同意順延還是沒排上 |
| 14 | `.github/workflows/security.yml` | #459 自述 `deno audit` 未驗。本 session 10/31 17:37 台北 dispatch run 41189419941：`deno audit` 實跑，0 high／0 critical（8 moderate、1 low），已驗。但同一個 run 的 **npm audit 有 critical 2、high 10**，因此開了 **issue #467**（上一次排程 10/26 是 0）。逐條看：多為 dev／build 工具鏈（vitest、tinypool、vite dev server、postcss、brace-expansion）。會進前端 bundle 的只有 `react-router`（RSC 模式 CSRF，本專案沒用 RSC 模式）與 `zod`；全部 `fixAvailable` | 下週一 Dependabot 批次處理；`vitest`／`vite` 需大版本，另開 PR。另外，`deno audit` 只涵蓋 lock 內的 npm 套件，jsr 套件沒有 advisory 來源，plan 寫的「Deno 相依掃描」實際覆蓋比字面窄 |
| 15 | `src/components/HomePage.backNavigation.test.tsx` | `src/components/` 底下唯一帶次級字尾的測試檔；`homeListingsCache.ts` 沒有自己的單元測試，性別與地區的還原也沒有個別測試（#457 自述） | 補 `homeListingsCache.test.ts`；檔名若 `check-test-names.py` 允許就維持 |

### 1.4 被反駁推翻或降級的

| 原主張（視角） | 反駁後 |
|---|---|
| 持續性故障只推一次（系統 P1） | 機制屬實，但屬既有行為（第 1 波 P2-11），資料不會丟，後台查得到未 resolve 的列 → P2-1 |
| PayUni 閘門失敗不推 LINE（系統 P1） | 屬實；閘門 step 早於 #454 就存在（`ec1c801b`），#454 只是沒順帶涵蓋 → P2-2 |
| 缺 secret 時告警靜默（系統 P1） | 屬實，但 #462 自述已知、plan 已列候選；兩站 secret 目前都有設 → P2-3 |
| 登出不清快取，個資外洩（UI/UX P1；架構評 P2） | 屬實；但 listings 是公開資料，座標數值不會顯示，每次掛載都會重新定位並覆蓋座標，只有定位失敗時沿用舊座標。外洩限於同裝置、同分頁的搜尋偏好 → P2-5 |
| 清除入口不出現（UI/UX P1） | 部分推翻：搜尋字在兩種版面都看得見，也清得掉，只是多一步 → P2-7 |
| PUSH 也還原（UI/UX P1） | PR 自述範圍外、可接受；屬產品取捨，交業主 → P2-6 |
| 工項 A 未記錄、TradeInvoice (b) 未裁決（需求 P1） | 鷹架記帳問題，沒有程式風險 → P2-12、P2-13 |
| 規格書／checklist 沒同步電子發票前提（需求 P1） | 第 1 波 §6 本來就把它排在退場 PR；本 session 的 #468 已補進 checklist → 結案 |

## 2. 未驗項清單

來源：7 支程式 PR 與晉升 PR 的內文「未驗」段，對照 PR 留言、plan §8 與 Actions。

| PR | 自述未驗 | 之後 | 結論 |
|---|---|---|---|
| #454 | workflow bash（`expect` 陣列、fetch、notify 條件）只做靜態檢查 | §8 10/31 01:00 run 41088363862（develop 相符）、13:30 run 41172352231（正式站 5b6a790 相符） | 已驗。**LINE 推送分支**（真的不符超過 30 分鐘）沒有實際觸發過 |
| #455 | Safari／Chrome 返回鍵、bfcache、手機捲動手感 | W2-19 業主 develop 真機驗收通過 | 已驗（瀏覽器種類沒有紀錄） |
| #455／#457 | e2e 本機沒跑 | CI e2e 軌綠（`ci-ok`） | 已驗 |
| #457 | 性別、地區篩選沒有個別測試 | 無 | **未驗**（P2-15） |
| #456 | — | skeleton run 41155657844、full run 41158578126、晉升 journey-full 都是 sandbox 綠 | 已驗 |
| #459 | `deno audit` 本機無法跑 | 本 session dispatch run 41189419941：實跑通過 | 已驗（附帶 npm 發現，issue #467） |
| #459 | 標頭要部署後才生效 | deploy-smoke run 41172352231「安全標頭齊全」 | 已驗 |
| #461 | 「沒有 ResCode＝商店類」只有 3 筆實證；使用者取消可能被誤歸 | 上線後沒有真實拒單（§3） | **未驗**（P2-11） |
| #461 | Deno DB 測試本機沒跑 | CI api-tests 軌綠 | 已驗 |
| #461 | 正式站實際推出一則 `payuni-merchant`／burst | 無觸發 | **未驗**：端到端沒跑過（建單→告警列→LINE） |
| #462 | 真實 LINE 非 200 | 刻意不以錯 token 驗 | **未驗**（設計上接受） |
| #463 | — | journey-full sandbox 24 分鐘綠、production 核准、`/health` 與 build-sha 相符 | 已驗 |
| W2-14／18 | 正式站電子發票 | W2-19 走到刷卡頁（不付款）通過 | 部分驗：**晉升後仍沒有一筆正式站真付款**完成「付款→發票開立」全程（§3） |

## 3. 上線後現場

**GitHub**

- open issues 4 張：#467（本 session dispatch 產生，P2-14）、#395、#384、#383。#288 已由 #456 關閉，#458 已關閉。
- reconcile 排程實際間隔：10/31 01:59 → 08:19 UTC，約 6.3 小時，第 1 波 P2-12 的 4–7 小時仍成立。
- 晉升後 deploy-smoke 綠。

**正式站 DB**（主 session 代跑唯讀 SQL；結果回傳後補在這裡）

| 項 | 值 |
|---|---|
| 10/31 05:00 UTC 之後的 `system_alerts` | 待回傳 |
| 同期 `payment_orders` 依狀態 | 待回傳 |
| 10/28 起的 failed 單（Status／Message／有無 ResCode） | 待回傳 |

## 4. 流程

### 4.1 三種 session 分工

- **大致照設計運作**：
  - 名冊 §7 完整，每支 PR 都有對應的執行 session，沒有第 1 波那種名冊外的 `claude/*` session 合進 develop。
  - D 以「一工項一個 session」為由，不接 #460 P1-4，主 session 另開 N，邊界有守住。
  - 主 session 審了每支 PR，用互動問題收裁決（W2-5～22），rebase 解衝突（#461）。
- **走樣一（主 session 寫碼）**：#459 的 PR 內文末尾 session 連結是主 session（`session_01MQovbCaoDN21bovw6C2Y5w`），不是 S 的 session。
  可能是 rebase 後主 session 改寫了 PR 內文，也可能是主 session 代為修改內容（HSTS 拿掉 `includeSubDomains`）。
  依 §8，「必修一條」是交 S 修，不是主 session 自己修。
  建議：主 session 代 push 的 commit 在 §8 註明「誰改的」，PR 內文的 session 連結維持執行 session。
- **走樣二（凍結期例外再次發生）**：W2-20「10/31 立即晉升」屬業主授權的凍結期例外。
  這次有裁決紀錄、有逐支 PR 清單、沒有 migration，比第 1 波 #450 規範得多。
  但第 1 波 §6 要求的「凍結期晉升 PR 逐支標類別」在 #463 內文**沒有照格式做**：列了 PR，沒有標 hotfix／docs／其他。#468 才把這條寫進〈慣例〉，下一次就有依據。
- **走樣三（流程 PR 的審查證據薄）**：#454、#456、#459、#462 的「實作審查」都寫「不適用」或「主 session 審」，只有 #455 以紅燈 commit 佐證。
  依 fix/* 輕量流程這是合法的，但 #461 這種金流相鄰的改動，四視角實作審查只有主 session 一人（PR 內文：「主 session 審過：無 P0／P1」）。

### 4.2 還沒進 friction-log 的摩擦

已進 friction-log 的：#461 的建單層零告警、第 1 波審查六條。下列還沒進：

1. **同一個 job 的同類故障要一起接告警**（P2-2）：補「X 故障零訊號」時，同一個 workflow 裡其他 step 的故障也要一併檢查是否零訊號。
2. **登出要清所有模組層快取**（P2-5）：新增任何 route 外快取，都要在 `App.tsx` 的 `SIGNED_OUT` 清一次，`adminCache` 是先例。候選：機械把關，讓 `src/utils/*Cache.ts` 的 reset 函式必須在 App.tsx 被引用。
3. **dispatch 的週掃描是唯一驗證時，合併後要手動跑一次**：`deno audit` 的未驗在晉升後等到 11/02 排程才會發生；本 session dispatch 一次，同時暴露出 npm 從 0 跳到 12 個 high／critical（#467）。規則：PR 自述「靠排程驗」的，主 session 在合併後立刻 `workflow_dispatch`。
4. **runner 端暫時故障連續出現**：10/30–31 有 DNS 失敗（#458，第二次）與「安裝 Node 24」10 分鐘逾時（plan §8 10:00），兩者都只能重跑。對帳 curl 加重試已列第 3 波候選；`setup-node` 的逾時尚未列。

## 5. 給主 session／業主的待辦

1. 業主裁決 P2-6：點 logo 回首頁時，要不要也還原篩選與捲動。
2. P2-5（登出清快取）建議併入 T1，同一段 `App.tsx` auth 事件。
3. issue #467：下週一 Dependabot 批次後複查；`vitest`／`vite` 大版本另開 PR。
4. plan §5 補「工項 A」「TradeInvoice (b) 的處置」兩行（P2-12、P2-13）。
5. 第一筆正式站真付款後，確認發票開立、`system_alerts` 沒有誤報的 `payuni-merchant`。

## 6. 升級進長期文件（launch-wave-2/ 退場依據）

| 內容 | 去處 | 理由 |
|---|---|---|
| 告警 severity 準則：錢相關（含「人工確認是否實付」、resolve 失敗、商店級拒絕）一律 error；持卡人級只有多人連續失敗才告警；對帳例外維持 warning 的理由 | `supabase/README.md` 或規格書 §13 系統告警段（現行「金流函數的 warning-only 隔離」措辭已失真） | 準則目前只散在 `index.ts` 註解與 friction-log |
| 商店級拒絕碼表（`DEF01006`、`UPP02085`、無 `ResCode` 的形狀判準） | 已在 `payuni-rejection.ts` 檔頭與 checklist（#468）——免動 | 規則本體在程式 |
| build-sha 與 deploy-smoke 版本比對（寬限 30 分、正式站 P1） | `docs/supabase-setup-checklist.md` 或 CLAUDE.md 環境段一句指標，本體留在 `deploy-smoke.yml` 檔頭 | 業主晉升後會看到這則 LINE，要知道它代表什麼 |
| 安全標頭現況（HSTS 不含子網域的理由、CSP 只有 `frame-ancestors`） | `public/_headers` 檔頭已有——免動；子網域盤點、完整 CSP 列第 3 波候選 | — |
| 「PR 自述靠排程驗的，合併後立刻 dispatch」 | `docs/README.md`〈慣例〉三種 session 段（主 session 職責） | §4.2-3 |
| 登出清所有模組快取 | friction-log 原則；修 P2-5 時一併寫進 `homeListingsCache.ts` 檔頭 | §4.2-2 |
| 凍結期例外 W2-20 的處理方式（業主原話＋逐支清單＋無 migration） | 已由 #468 寫進〈慣例〉「凍結期只許 hotfix」——免動 | — |
| 執行環境須知（plan §3：`npm install -g deno`、子 session 不用 Supabase MCP、`gh pr checks` 被擋改用 MCP、journey 用 dispatch） | `docs/README.md`〈慣例〉三種 session 段，或 `dispatch-prompts.md` 的共用開頭搬到 `docs/` 一份長期範本 | plan 刪除後，下一波主 session 要從頭摸 |
| W2-5～13 條款十之一裁決 | 已隨 #453 進規格書 §11（第 3 波合併時核對）——免動 | — |
| 本報告 §4.2 四條 | friction-log 新節「2026-10-31｜第 2 波審查」 | 本 PR 寫入 |
| 其餘（§1 時程、§2 工作分解、§7 名冊、§8 進度、dispatch-prompts.md） | 隨目錄刪除 | 一次性施工紀錄，`git show` 取得回 |
