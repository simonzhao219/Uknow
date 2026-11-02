# 第 4 波審查報告（審查 session R4，2026-11-02）

<!-- plans-keep: 第 4 波審查報告；與 plan.md 同生命週期——第 5 波主 session（或其審查 session）依 §6「升級進長期文件」逐條處置後，隨整個 launch-wave-4/ 目錄刪除 -->

範圍：`git log --first-parent 1f61e68..f88bae5^2`（第 3 波晉升 #477 之後到第 4 波晉升 #490；#490 在 11/02 17:15 台北合進 main，
`production` 核准後 deploy-supabase run 41419246465 於 18:01 台北完成，`/health` sha＝`f88bae5`；deploy-smoke run 41425474970 綠）。
程式 PR 7 支：#484（E）、#485（K2）、#486（F1）、#487（P）、#488（T1-B）、#489（D）、#491（journey runner 固定 24.04）。
docs 4 支：#478、#479、#480、#483。86 檔，+4,119／−940 行，無 migration。行號引用 main `f88bae5` 的樹。

審法：T1-B（#488，登入主幹）派一個專審 agent，讀 diff、規劃原檔（`git show 5f5af22d:docs/plans/auth-transient-resilience/`）、
`node_modules/@supabase/auth-js` 2.108.2 的 refresh／getSession 實作，逐條推演派工點名的六個重點。其餘六支程式 PR 派一個 agent。
兩份報告的候選各自做過一輪反駁；P1 候選與 T1-B 的關鍵 P2 由本 session 再讀碼核實（§1.4）。

**總結：P0 0、P1 0、P2 17。** T1-B 的分類器、無效 session 登出、degraded 守衛、重試排程四項都核實成立，找不到讓失效 token
停在 degraded 無限重試、或讓 degraded 放行受保護頁的路徑。最值得先修的是 P2-1：F1 的「稍後註冊」把任何 401 都當成「帳號已刪」，
而後端 `requireAuth` 對 GoTrue 暫時錯誤同樣回 401——正好是 T1-B 這波要消滅的那一類誤判，只是落在 T1-B 沒改到的端點上。

## 1. 發現

### 1.1 P0

無。

### 1.2 P1

無（1 條候選經核實降為 P2，見 §1.4）。

### 1.3 P2

已核實沒問題的（派工點名的重點）：

- **暫時性故障分類**（`src/utils/fetchProfile.ts:77-85`、`supabase/functions/api/index.ts:458-476`）：前端 401／410→session 無效，
  404→帳號資料異常，其他非 2xx、斷網、逾時（AbortError）、非 JSON→暫時性。後端 Auth retryable／status 0／≥500／429／擲例外→503，
  其餘 Auth 4xx→401。
- **無效 session 一定被登出**：冷啟動與重試的 401 都走 `endSession`＋`endInvalidSession`（scope local，W4-13）。沒有輪詢，
  degraded 只由 focus／online／手動各觸發一次，失效 token 不會無限重試。
- **degraded 不放行**：`ProtectedRoute`、`AdminRoute` 在 `degraded && !user` 畫 `AuthDegradedNotice`；`isLoggedIn=!!user`；
  anomaly 是 anonymous 會導 `/login`；`RequireMembershipRoute` 都包在 `ProtectedRoute` 內。
- **重試排程無洩漏**：同一時間只有一個計時器或一個在飛請求；`endSession`、換帳號、卸載都 reset；`genRef` 丟棄晚到結果；
  online 監聽只在 degraded 時掛上；getSession 的 race 計時器在 finally 清掉。
- **`/auth/register` post-write 契約**：寫入失敗 500、寫入成功但讀不回 503 `PROFILE_UNAVAILABLE`；前端遇 503 不重送，以 `refreshUser`
  接續，接續失敗時持久提示、送出鈕 aria-disabled；重送本身冪等。
- **apiClient 兩層確認**（`src/utils/apiClient.ts`）：refresh 暫時性→`AUTH_UNAVAILABLE` 不登出；refresh 成功仍 401→`/profile` 確認，
  確認也 401 才 `endInvalidSession`；確認為 ok／missing 時回端點自己的 401。F1 的 `clearAccountLocalState` 仍經 `endInvalidSession.ts:31` 呼叫。
- **F1 Button 基底**：全 src 的 aria-disabled 消費者逐一核對，沒有任何一處只靠基底的 `pointer-events-none` 擋點擊；處理函式都有守衛。
- **P 主機比對**（`src/utils/canonicalHost.ts`）：大小寫、結尾點正規化；精確比對擋得住前後綴；目標 origin 寫死、不構成開放重導；
  導向前不 render、不打 API。
- **K2**：fallback 在其他 step 失敗、兩個 outcome 為 skipped 時成立；notify 缺 secret 刻意 exit 0（`::error::`＋summary 標紅），
  唯一需要失敗的呼叫端（`reconcile-payments.yml:229-238`）自己先檢查。規格書與 `listing-photos.ts:181` 的抽取式對得上。
- **D**：lockfile 無 major；正式產物只有 react-router(-dom) 7.18.0→7.18.5、set-cookie-parser patch。
- **E**：`dump_page` 每段 try、以 `raise … from exc` 保留原錯；呼叫端沒有 `except AssertionError` 重試，改型別不影響分支。
- **#491**：只有 journey-suite 跑 `playwright install --with-deps`；ci.yml 的 e2e 在 Playwright 容器內，不受 runner 版本影響。

| # | 檔案:行 | 問題（具體輸入 → 錯誤結果） | 建議 |
|---|---|---|---|
| 1 | `src/components/CompleteProfile.tsx:696`；`supabase/functions/api/index.ts:253-257`、`:916-917` | F1「稍後註冊」把 401 一律當「帳號已不存在」。後端 `requireAuth` 對 `getUser` 的**任何** error 回 null→401。帳號還在、按「確定刪除」時 GoTrue 抖一下 → 401 → 清本機、global 登出、提示「帳號資料已不存在，之後可以用同一個 Email 重新註冊」→ 使用者照做去註冊撞「已存在」。違反同函式註解自訂的不變式 | cancel-signup 改用 T1-B 的分類式 `authenticate()`（抖動 503、Auth 4xx 401）；或「使用者不存在」回 410／專用 code，前端只認那個 |
| 2 | `src/utils/authErrors.ts:67-72`；`apiClient.ts:112-116`；`useAuthBootstrap.ts:389-392`、`:416-424` | `AuthRefreshDiscardedError`（409，多分頁同時換發 token 的輸家）被判非暫時性。休眠還原多個分頁 → 輸的分頁 getSession `session:null`＋409 → signedOut → 導 `/login`，之後的 TOKEN_REFRESHED 不理；apiClient 路徑更糟：`endInvalidSession` 清掉共用 storage 裡贏家剛換好的有效 session，所有分頁一起登出。T1-B 之前就是這樣，但本 PR 的分類器延續了它 | `isRetryableAuthError` 把 `name==='AuthRefreshDiscardedError'` 視為暫時性；apiClient 遇 409 重取 session 再打一次 |
| 3 | `useAuthBootstrap.ts:406-434` | 冷啟動 `getSession()` 不 resolve → authState 停在 unknown → 受保護頁永遠 `RouteAuthLoading`（有「連線較慢」文字，但無重試／登出）。10 秒 stall 只設 `sessionStalled` 給頁首；本 PR 只替重試路徑的 getSession 加 5 秒上限 | stall 時若 `uidRef===null` 也走 `onTransient('initial')` 進 degraded |
| 4 | `src/components/CompleteProfile.tsx:225`；`src/utils/fetchProfile.ts:50-53` | 冷載入 `/auth/complete-profile`：子元件 effect 先登記一個**沒帶逾時**的 `/profile`，bootstrap 的 8 秒逾時請求合併進去 → `/profile` 卡住時要等瀏覽器自己的逾時（分鐘級）才進 retrying／degraded（W4-20 的 8 秒在這條路徑失效） | CompleteProfile 傳 `PROFILE_FETCH_TIMEOUT_MS`；或帶逾時的呼叫不合併進沒逾時的在飛請求 |
| 5 | `src/utils/fetchProfile.ts:78` | 前端分不出後端零列 404 與閘道 404。Edge Function 部署壞掉／路由錯 → 閘道回 404 → **所有人**看到「帳號資料異常，請聯絡客服」並清掉首繪提示（該是 degraded 的情形變成 anomaly） | 後端零列 404 帶 `code: 'PROFILE_MISSING'`，前端只認帶碼的 404 為 missing，其餘歸 transient |
| 6 | `useAuthBootstrap.ts:429`；`src/utils/authView.ts:36`（`sessionStalled` 判斷在 degraded 前） | getSession 擲例外而進 degraded：頁面顯示「網路不穩」外框，頁首卻是訪客版「登入」，與 authView 註解「degraded 不畫登入以免誘導重登」衝突 | `authState==='degraded'` 優先於 `sessionStalled`，畫 placeholder |
| 7 | `src/hooks/useMemberLogout.ts:238`；`useAuthBootstrap.ts:185` | degraded 外框按「登出」：`setUser(null)` 保留 `outcome:'degraded'` → authState anonymous → 立刻導 `/login` → AuthPage 掛載再打一次 `/profile`；global 登出最多 5 秒期間 focus／online 仍觸發重試。最後靠 genRef＋SIGNED_OUT 收斂，結果正確，只是畫面閃 `/login`、多餘請求 | `setUser(null)` 一併把 outcome 改 signedOut，或登出中停用重試 |
| 8 | `src/components/PaymentCheckout.tsx:156-201`、`:635` | 結帳頁重試在飛時按「登出」（handleSignOut 不看 isRetrying）→ global 登出撤銷 token → 在飛請求回 401 → `navigate('/login')` 蓋掉登出導的 `/` | effect 加 cancelled 旗標，或登出時 abort 在飛請求 |
| 9 | `src/utils/apiClient.ts:37-48`、`:230-241` | N 個請求同時兩層確認失敗 → N 次 force `/profile`、N 次 `endInvalidSession`、N 次 `emitSessionExpired`。冪等，只是多餘 | 模組層 promise 讓同一時間只確認一次 |
| 10 | `src/hooks/useAuthBootstrap.ts:329-340` | 換帳號清理在冷啟動不觸發：`uidRef` 為 null 時只 `dropHint()`、不呼叫 `onAccountSwitched`。A 的 session 結束但本分頁沒收到 SIGNED_OUT（初始化時 refresh 失敗、事件早於訂閱）→ B 同裝置登入 → 首繪提示 uid8 不符只清提示 → `withdrawalBankData` 留著，提領預填 A 的銀行帳號 | `current.uid8 !== toUid8(uid)` 分支一併呼叫 `onAccountSwitched` |
| 11 | `src/components/listing/PhotoPicker.tsx:50`、`src/components/admin/AdminListError.tsx:39`、`src/components/admin/AdminStaleNotice.tsx:57` | F1 拿掉 Button 基底停用外觀後，三顆 aria-disabled 鈕不再灰化。裁切工具載入中，「載入中…」看起來可按、按了沒反應（點擊都已被擋，純外觀；F1 自審已點名接受，後兩顆有轉圈） | 補 `aria-disabled:opacity-50`，或在 `ui-ux-guidelines.md` 寫明「有轉圈即可不灰化」 |
| 12 | `src/utils/endInvalidSession.ts:31`；`src/utils/formDraft.ts` 檔頭；`docs/multi-step-flow-recovery.md` | session 確認失效時 `clearAccountLocalState` 連完善資料草稿一起清 → 填到一半、session 失效、重登同帳號 → 草稿沒了。與 `formDraft.ts`「被 session 檢查導頁也能接回」的承諾衝突；但草稿鍵不含 uid，保留會交給下一位，清是合理取捨 | 在 `multi-step-flow-recovery.md` 完善資料列寫明「session 失效也清」，`formDraft.ts` 檔頭同步 |
| 13 | `src/utils/canonicalHost.ts:21-22` | `<hash>.uknow.pages.dev` 若是 main 的正式部署 → 連正式後端 → 登入照樣 CORS 失敗，不會被導向。測試把 hash 網址歸為「預覽有自己的後端」，但 hash 網址同時有 develop 與 main 兩種建置。一般使用者幾乎碰不到 | 判準改「本建置連正式後端且 host 不是 `uknow.com.tw`」 |
| 14 | `src/main.tsx:2` | `import App` 是靜態 import，`location.replace` 前整包 App 已下載並執行模組頂層（supabase client 是惰性單例，不打 API）——只是多花頻寬 | 改動態 import，導向判定後才載 App |
| 15 | `.github/workflows/deploy-smoke.yml`（K2 fallback 標題） | 既有小缺口：閘門與 smoke 同時紅時，告警標題沒有正式站／預覽站之分（body 有） | 標題帶環境名 |
| 16 | #488 內文〈偏離規劃說明〉第 2 點 | 執行 session 自稱的「W4-21」（mock 隔離代刪鎖授權）與 plan §0 的 W4-21（pages.dev 導向）撞號；日後 `grep W4-21` 會指到兩件事 | 裁決編號只由主 session 發；執行 session 的授權記成「業主 YYYY-MM-DD HH:MM 互動選項」 |
| 17 | `docs/plans/launch-wave-4/plan.md` §8 11/02 02:05 列 | 記的 T1-B 紅綠 hash（B1 `e4fb277`→`c823fc9`…）在之後兩次 rebase 後全部失效，#488 內文的表才是正確值；plan 沒標「以 PR 內文為準」 | 見 friction-log 2026-11-02 第 2 條 |

### 1.4 被反駁推翻或降級的

| 候選 | 處置 |
|---|---|
| P2-1（F1 cancel-signup 401）原列 P1 | **降 P2**（本 session 讀碼核實觸發條件成立）：只在 GoTrue 暫時錯誤時觸發；觸發後帳號仍在、使用者被登出，重新登入就接回完善資料頁，無資料或金流損失；錯的是提示文案與「可重新註冊」的誤導 |
| P2-2（409）原擬 P1 | **降 P2**：T1-B 之前的行為（舊碼 refresh 任何錯誤都登出），觸發要多分頁同時換發，重整或重登即恢復 |
| P2-3（冷啟動 getSession 卡住）原擬 P1 | **降 P2**：F4 安全出口本來只管頁首，不是退化；至少有「連線較慢」可讀文字 |
| P2-10（冷啟動換帳號）原擬 P1 | **降 P2**：多數失效路徑都會發 SIGNED_OUT，需特殊時序 |
| refresh 遇 429 auth-js 仍會清 session | **已知**：規格書 §5.3 已記為例外，reducer 已處理晚到的 transient 不翻案 |
| OTP 401 只導 `/login` 不清 session | **推翻**：verifyOtp 先觸發 SIGNED_IN，OTP 的讀取與 bootstrap 合併，bootstrap 拿到 401 會跑 `endInvalidSession` |
| bootstrap 401 經 SIGNED_OUT 清掉邀請 token（違反 W4-13） | **推翻**：plan §2.5 明載 onSignedOut 會清、AuthPage `keepInviteToken()` 事後寫回；auth-js signOut 排隊，寫回一定在兩次 SIGNED_OUT 之後 |
| 沒有 session 時 apiClient 不再登出 | **推翻**：W4-14 的設計，SIGNED_OUT 與守衛接手 |
| rpc 回 null 讓零列也變 503 | **推翻**：`effective_registration_step` 有 `else 0`（migration `20260719000004`） |
| Button 改動讓後台鈕可被點 | **推翻**：正是 K5 要的行為，處理函式都有守衛 |
| #486 的 401 清理被 #488 蓋掉 | **推翻**：`endInvalidSession.ts:31` 仍呼叫 `clearAccountLocalState` |
| canonicalHost 被 port／大小寫繞過 | **推翻**：`location.hostname` 不含 port，瀏覽器先轉小寫 |
| `pending_otp`、otpExpiry 鍵含 email，登出後留在共用裝置 | **可接受**：登入前流程的狀態，F1 PR 已說明取捨 |
| T1-B 已知兩條（PaymentCheckout／CompleteProfile 的 getSession retryable 仍導 `/login`；各頁 401 文案「登入已過期」） | **已知**：#488 內文已列、plan §5 已收第 5 波，不重複計數 |

## 2. 未驗項

來源：7 支程式 PR 與晉升 #490 的內文，對照 PR 留言、plan §8 與 Actions。

| PR | 自述未驗 | 之後 | 結論 |
|---|---|---|---|
| #484（E） | 容器無 pytest，沒跑 `e2e/journey` 的 `pytest tools/`；harness 實跑要 dispatch | journey dispatch 41306410552 綠（plan §8 11/01 20:38）；晉升 journey-full 41415959428 146/146 | 已驗 |
| #485（K2） | (a) 其他 step 失敗時 fallback 的標題／level／body；(b) 缺 LINE secret 時的紅色 summary 與 annotation | develop deploy-smoke 41309365066、正式站 41425474970 皆綠，告警 step 照設計跳過 | **未驗：待真實觸發** |
| #486（F1） | Deno 型別檢查沒跑；本機 e2e 只跑 5 個相關情境 | CI 全綠（含 api-tests、全 mock e2e）；晉升 journey-full 綠 | 已驗（CI） |
| #487（P） | Cloudflare 上實際導向（根網址、深層路徑、query＋hash、develop 不跳） | 容器連不到 pages.dev（plan §8 11/02 18:05） | **未驗：待業主實機確認** |
| #488（T1-B） | 正式站 `/profile` 5xx／逾時分布（plan §8 11/01 23:10 的 B1 前置量測樣本小：正式站 0 筆、develop 2 筆） | 部署後 1 小時內正式站 Edge 無流量 | **未驗：待量測**（§3；§5-3） |
| #488 | 實作審查 P2 未修三條（`useAuthBootstrap.ts` 約 550 行；`/auth/register` 讀回擲非 ProfileReadError 仍 500；成功後焦點以 setTimeout） | 無後續 | 已記、未列候選 → §5-4 |
| #489（D） | 無；vitest／tinypool 鏈 2 critical＋5 moderate 延到第 5 波，#467 Refs | Security Audit 排程 41415277633 綠 | 已驗；#467 仍開 |
| #491 | 要等 #490 journey-full 重跑 | 41415959428（ubuntu-24.04）146 collected／146 ran／0 skipped | 已驗 |
| #490 | 正式站部署 | deploy-supabase 41419246465：部署、`/health` sha 比對步驟皆綠（等 `production` 核准 45 分鐘）；deploy-smoke 41425474970 兩站前端皆 f88bae5 | 已驗 |
| 第 3 波遺留 | 照片清理實刪模式首輪 | 11/02 UTC 22:51 延遲觸發的排程 run 41359203507（LIVE、dry_run=false）：候選 0、刪除 0 | 已驗（管線；尚無真實候選） |
| 第 2 波遺留 | 正式站第一筆真付款→發票、`system_alerts` 無誤報 | 見 §3 | **未驗：現場未觸發**，沿用 |

## 3. 上線後現場

- **部署鏈**：main CI push 41419197178 綠（09:15–09:16 UTC）→ deploy-supabase 41419246465（`workflow_run`，等 `production` 核准，
  10:01 UTC 執行；部署 Edge Function、比對 `/health` sha 兩步綠，失敗分支 skipped）→ 主 session dispatch deploy-smoke 41425474970 綠。
  （deploy-supabase 這類 `workflow_run` run 在 Actions 列表顯示 `head_branch: develop`、sha `987af62`——定義取自 default branch，
  不是部署錯分支；實際部署的 sha 以 `/health` 回的 `f88bae5` 為準。）
- **排程**：部署前後的 reconcile-payments（每小時）實際只在 21:40、01:14、08:51 UTC 跑——11 小時 3 次，與第 3 波觀察一致
  （friction-log 2026-11-02 第 3 條）。deploy-smoke 排程 22:14、06:35 UTC 綠；Security Audit 08:44 UTC 綠。
- **DB／Logs**：已以 send_message 請主 session 代跑唯讀查詢（部署後 `/profile`、`/auth/register` 狀態碼分布與 p95、postgres ERROR／FATAL、
  `system_alerts` 新增、訂單新增）。**截至本報告送出前尚未收到結果**；收到後補進本節（同 PR 追加 commit）。
  部署到審查開局約 1 小時，主 session 18:05 記錄「部署後正式站 Edge 日誌暫無流量」，預期樣本很小。

## 4. 流程

### 4.1 三種 session 分工

- **大致照〈慣例〉走**：主 session 沒寫產品碼；唯一例外 #491（1 行 CI 修補）在 ≤10 行例外內、記進 plan §8 與 W4-23。
  T1-B 的三段式完整走完（兩輪 `/review-plan`、W4-19 以主 session 親審代第三輪、業主親打 `/tdd-implement`）。
- **走樣一：執行 session 自發裁決編號**（P2-16）。
- **走樣二：plan §8 的 hash 成了錯的事實來源**（P2-17）：主 session 照執行 session 回報抄 hash，回報之後執行 session 又 rebase 兩次。
- **走樣三：審查 session 開得太早**（W4-24）：§3 幾乎只能記「待量測」。不是錯，是取捨；建議見 §5-5。
- **審查 session 代跑現場 SQL**：本波以 send_message 送出唯讀查詢請求，未被分類器擋（第 3 波被擋過），但結果要等主 session 有空。

### 4.2 框架摩擦

已寫進 `docs/plans/friction-log.md` 新節「2026-11-02｜第 4 波審查」：雲端 session 打不了 `! rm .claude/tdd-lock`（第 2 次）、
push 前自動 rebase 讓 hash 失效、GitHub 排程大量跳過、`ubuntu-latest` 換 26.04 讓 journey 無預警壞掉、環境類紅燈不套「重跑一次」、
審查 session 開得太早。

## 5. 給主 session／業主的待辦

| # | 事 | 給誰 | 建議 |
|---|---|---|---|
| 1 | `uknow.pages.dev` 根網址、深層路徑、帶 query＋hash 實機開一次，確認跳到 `uknow.com.tw`；`develop.uknow.pages.dev` 不跳；正式站實際登入一次 | 業主 | 必做（#487 唯一未驗） |
| 2 | P2-1（cancel-signup 401）、P2-4（CompleteProfile 失去 8 秒逾時）、P2-5（閘道 404 判成帳號異常）列第 5 波**必上**；其餘 P2 進候選 | 主 session／業主 | P2-1 與 T1-B 已知那條「getSession retryable 仍導 /login」同屬「暫時性錯誤被當成定論」，建議併成一個工項；P2-5 一旦 Edge 部署壞掉會讓全體看到「帳號異常」，修法小 |
| 3 | 部署後 24～48 小時量 `/profile` 狀態碼分布（503、逾時 >8 秒的比例）與 `system_alerts`，寫進 plan §8 | 主 session | 是 T1-B 的唯一現場驗證；503 若高於預期，代表 `buildProfileResponse` 五讀取有不穩的一支 |
| 4 | T1-B 實作審查未修三條 P2（§2）是否列第 5 波候選 | 主 session | `/auth/register` 讀回擲非 ProfileReadError 仍 500 那條列候選；行數與焦點兩條不列 |
| 5 | 審查 session 何時開（W4-24 的取捨再來一次） | 業主 | 建議下一波改成「主 session 部署後 24～48 小時跑固定現場查詢、寫 plan §8，審查 session 只讀」，審查可以照常立刻開 |
| 6 | GitHub 排程跳過：reconcile-payments 11 小時只跑 3 次 | 業主 | 第 5 波候選已收；對帳是金流安全網，建議提為必上，改由 Supabase pg_cron 觸發 |
| 7 | 正式站第一筆真付款→發票、`system_alerts` 無誤報（第 2 波 §5-5 起沿用） | 主 session | 沿用 |

## 6. 升級進長期文件（launch-wave-4/ 退場依據）

第 3 波目錄已由本 PR 依其 §6 處置後刪除（`git show 4a8035fb^:docs/plans/launch-wave-3/review.md` 取得回）：P2-18 規格書補記
（§2.1 註冊中定義對齊 F1、首次閃訪客版的措辭；§3 首頁返回還原／點 logo 清空；Q7 確認框原已在 §2.1）、「晉升 journey 紅判偶發前先看現場」
寫進 `docs/README.md`〈慣例〉；其餘列「免動」或已在 friction-log。

第 4 波的：

| 內容 | 去處 | 理由 |
|---|---|---|
| W4-11～18、W4-22 的行為（degraded、帳號異常、登出鈕、客服入口、AuthPage 分流） | 已在規格書 §2.1、§5.3 與程式註解（#488）——免動 | — |
| W4-17 首頁 degraded 頁首空槽 | 已在規格書 §2.1——免動 | — |
| W4-21 `uknow.pages.dev` 導向 | `canonicalHost.ts` 檔頭已說明——免動；P2-13 若修，順手補 hash 網址的判準 | — |
| W4-23 journey-suite 固定 24.04 | `journey.yml` 註解＋plan §5 候選（退場條件：Playwright 升級後改回 `ubuntu-latest`）——第 5 波 plan 帶過去 | 退場條件不能隨目錄消失 |
| 雲端 session 的 tdd-lock 授權做法 | `docs/README.md`〈慣例〉（本 PR）＋friction-log | — |
| 「判偶發前先看現場；環境類紅燈不重跑」 | `docs/README.md`〈慣例〉（本 PR） | — |
| 「裁決編號只由主 session 發」、「hash 以 PR 內文為準」 | 第 5 波主 session 寫進〈慣例〉或 plan 範本 | P2-16、P2-17 |
| 「F1 草稿在 session 失效時也清」 | `docs/multi-step-flow-recovery.md` 完善資料列 | P2-12 |
| §5 第 5 波候選、本報告 §5 待辦 | 第 5 波 plan | — |
| 本報告 §4.2 摩擦 | friction-log 新節「2026-11-02｜第 4 波審查」 | 本 PR 寫入 |
| 其餘（§1 時程、§2 工作分解、§7 名冊、§8 進度、dispatch-prompts.md） | 隨目錄刪除 | 一次性施工紀錄，`git show` 取得回 |
