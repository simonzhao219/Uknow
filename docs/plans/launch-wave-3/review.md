# 第 3 波審查報告（審查 session，2026-11-01）

<!-- plans-keep: 第 3 波審查報告；與 plan.md 同生命週期——第 4 波主 session 依 §6「升級進長期文件」逐條處置後，隨整個 launch-wave-3/ 目錄刪除 -->

範圍：`git log --merges 5b6a790..1f61e68`（#463 第 2 波晉升之後到 #477 第 3 波晉升；#477 在 11/01 13:5x 台北合進 main，
`production` 於 15:37 台北核准部署，`/health` sha＝`1f61e68`，deploy-smoke run 41285941139 綠）。
程式 PR 6 支：#473（L）、#474（L2）、#472（A，migration `20261104000001`）、#453（C，migration `20261110000001`）、#475（K）、
#466（T1 PR-A）。docs／CI 6 支：#464、#465、#468、#469、#470、#471。98 檔，+7,104／−1,404 行。行號引用 main `1f61e68` 的樹。

審法：四視角（系統、架構、UI/UX、需求）各派一個 agent，讀各 PR 的 diff、內文與留言、main 原始碼、T1 規劃原檔
（`git show b4b5bdcb:docs/plans/auth-state-trust/`）。另派一個 agent 專查晉升 journey-full 第一輪的兩條失敗。
四份報告提出 5 條程式碼層 P1 候選，每條各派一個反駁者重新讀碼（含 `node_modules/@supabase/auth-js` 的實作）：
**2 條推翻、3 條降為 P2**（§1.4）。需求視角的 3 條流程類 P1 候選由本 session 對 PR 內文與程式核對，也都降級或推翻。

**總結：P0 0、P1 0、P2 22。** C 的刪除路徑是本波風險最高的部分，系統視角逐條推演後，正式站沒有 `PHOTO_PURGE_LIVE=='true'`
不可能實刪，開了也找不到讓仍被引用的照片被判孤兒的路徑。最值得優先修的是 P2-1：T1 為了給頁首兩顆鈕停用外觀，
改了共用 `Button` 的基底，連帶讓後台違反業主裁決 K5（0.3 秒內的更新不閃灰），重新整理鈕在自動更新途中也點不到。

## 1. 發現

### 1.1 P0

無。

### 1.2 P1

無（5 條程式碼層候選經反駁後 2 條推翻、3 條降為 P2，見 §1.4）。

### 1.3 P2

已核實沒問題的（列出來是因為它們是審查 prompt 點名的重點）：

- **C 孤兒判準與 public base 無關**（`supabase/migrations/20261110000001_listing_photo_orphans.sql:46-69`）：
  `_listing_photo_name_from_url` 只認 `/listings-photos/<uuid>/<數字>_<英數>.(jpg|png|webp)`，後面接 `?`、`#`、`/` 或結尾。
  - 能取出的：`/render/image/`、`?v=`、`#`、任何網域。
  - 取不出、回 null 的：舊 bucket `make-5c6718b9-listings-photos`（前面是 `-` 不是 `/`）、`%2F`、大寫 UUID、`.JPG`／`.jpeg`、多重副檔名。
  - 取不出時 `coalesce(..., p_name) = p_name` 視為引用該刊登者**全部**的檔，一律偏保留。物件端的 name 也只收同一格式，
    所以 `.jpeg` 之類的物件永遠不會成為候選。
  - 要被刪，必須同時滿足：前綴本人沒有任何一條 URL 取出同名、本人沒有任何取不出名的 URL、上傳超過 168 小時。找不到讓活照片被判孤兒的路徑。
  - 其他引用來源：只有 `listings.photos`。草稿不存照片 URL；身分證與簽名是別的 bucket；`listings_delete_own` 撤除後前後端都沒有直接刪除的呼叫者。
- **C 錨點與比例閘**（`supabase/functions/api/listing-photos.ts:213-228`）：
  - 統計欄位非數字時整輪 `sweep_failed`，不放行。
  - 錨點以「有照片 URL 的刊登者」為分母，對得到物件的不到一半就 `circuit_open(anchor)`，不可放行。
  - 比例閘：孤兒超過 bucket 物件數一半就中止，沒有小 bucket 豁免，只有 `force_ratio` 能放行。
  - dry-run 也過兩道閘。
  - 刪除前 `filter_unreferenced_listing_photos` 自己重驗 bucket、格式、寬限期與引用。寬限期 `168 hours` 與 `ORPHAN_GRACE_HOURS` 由單元測試讀 SQL 原文比對。
- **W3-8 workflow 閘門**（`.github/workflows/purge-listing-photos.yml`＋`scripts/purge-listing-photos-request.py`）：

  | 事件 | 結果 |
  |---|---|
  | schedule（inputs 皆空） | `PHOTO_PURGE_LIVE` 精確等於 `'true'` 才實刪，否則 dry-run；`force_ratio` 恆 false |
  | dispatch production，`dry_run=true` | dry-run |
  | dispatch production，`dry_run=false`，LIVE 未設 | 強制 dry-run，step summary 警告 |
  | dispatch production，`dry_run=false`，LIVE=`'true'` | 實刪 |
  | dispatch develop | 照輸入 |

  Edge 端是 `dryRun = body?.dry_run !== false`，body 空、截斷、非 JSON、字串 `"false"` 一律 dry-run；python 組 body 失敗時送空 body，同樣 dry-run。
  正式站與 develop 的 ref 都從 git 取，vars 不一致就中止。workflow 不送 `include_names`，log 不印 name。
- **K（#475）**：
  - 商店級去重鍵加 UTC 日期桶（W3-5），不改 `logSystemAlertOnce` 的語意，有「昨天的種子不壓今天」測試。
  - `/internal/system-alerts/recent` 以 `count:'exact'` 回總數，「另有 N 筆」＝總數減已列筆數，數字正確。
  - 「確認 LINE 推送設定存在」（`reconcile-payments.yml:228-237`）只在 `has_alerts=='true'` 時執行，缺任一 secret 就 exit 1，run 變紅、窗口不前移。
    邏輯正確，但至今只被跳過過（§2）。
  - deploy-smoke 的 LINE 推送已移到最後一步，PayUni 閘門紅也會推。
  - reconcile curl 的 `--retry-all-errors` 若逾時重打，可能與第一次並行。後端先看 `completed` 就回成功，成功路徑的 RPC 有 `for update` 與冪等判斷，所以重放安全。
- **A（#472）**：兩支 RPC 仍是 `security definer`＋`set search_path = public`，簽章不變，`create or replace` 不產生多載，revoke 照舊。
  推薦碼子查詢有 `uq_referral_codes_one_active` 保證最多一列。新欄位只經 `/admin/members*`（admin 守衛未動）回傳。
- **T1（#466）**：
  - 約 30 處 `useContext(UserContext)` 的消費者都沒漏，新欄位都是 optional。
  - `useAuthBootstrap` 的 cleanup、uid 去重、gen 擋過期回應都正確。
  - `signOutWithFallback` 逾時後的 local signOut 不會排在卡住的 global 後面：auth-js 2.108.2 只在設了 `lock` 時取鎖，本專案沒設。
    前提是 `^2` 的版本浮動，日後若預設取鎖要重驗。
  - cancel-signup 失敗時不清本機、停在原頁；後端守衛 fail-closed。
  - 第 2 波 P2-5（登出清 `homeListingsCache`）已接上 `SIGNED_OUT`。
  - T1 實作審查的 14 條 P2：5 條已修，其餘都記在 #466「偏離規劃說明」，沒有一條需升 P1。
- **L／L2**：統一以「`location.key` 變了且不是 POP」判斷，所以 BottomNav 首頁、Navbar logo、Navbar 首頁連結三者一致，POP 還原與 key 重設互斥。
  T1 的 `SIGNED_OUT` reset 與兩者冪等，不打架。

| # | 檔案:行 | 內容 | 建議 |
|---|---|---|---|
| 1 | `src/components/ui/button.tsx:24` | **T1 改了共用 Button 基底**：加 `aria-disabled:pointer-events-none aria-disabled:opacity-50`，本意只是給 Navbar 兩顆鈕停用外觀（`6038efe5`）。<br>後台的 aria-disabled 鈕刻意「停用外觀延遲 0.3 秒」（業主裁決 D、K5；`remittanceGate.ts:4-5`、`adminBusy.ts` 的 `PAUSED_LOOK`）。改動後，提領頁每次背景重讀，標記已匯款、查看、批次、CSV、載入更多都會立刻閃灰；同列的勾選框不是 Button，不閃，外觀也不一致。<br>`pointer-events-none` 讓重新整理鈕在自動更新途中點不到：它設計上可以按，按了會接上「仍在更新」（`useRefreshAnnouncer.ts:7`）。現在只剩鍵盤能觸發；CSV 鈕的 `title` 提示也不再出現。<br>jsdom 不載 Tailwind，所以 vitest 綠。`AdminToolbar.tsx:95` 的註解「Button 基底只有 disabled: 的灰化」已失真 | **第 4 波第一個工項（W3-15）**。從基底拿掉這兩個 class，改在 Navbar 兩顆鈕的 className 補；同 PR 修 `AdminToolbar.tsx:95` 註解，並寫明「aria-disabled 的鈕仍收得到點擊」的契約 |
| 2 | `src/hooks/useAuthBootstrap.ts:192-212` | 偵測到**不同 uid 的 SIGNED_IN** 時只丟 hint、gen+1，不做 `SIGNED_OUT` 那組清理（`clearCache`、`resetHomeListingsCache`）。<br>auth-js 跨分頁會廣播 SIGNED_OUT，所以一般的「另一分頁先登出再登入」不受影響。會走到的只有兩條：A 已登入時 B 從 `/forgot-password` 的重設信連結進站；分頁凍結漏收廣播。<br>殘留只是本分頁原本畫給 A 的任務、獎勵、推薦網路，直到下次 revalidate。這是既有行為（`5b6a790:src/App.tsx:193-212` 相同），T1 原樣搬入，`adminCache.ts:12` 註解自己點名過 | 換 uid 分支補呼叫同一組快取清理（不清邀請 token）；併 P2-1 的小 PR |
| 3 | `src/components/reward/WithdrawalProcess.tsx:137`、`:421` | **範圍外、既有**：提領成功後把銀行代碼與帳號存進 localStorage `withdrawalBankData`，鍵不含 uid，登出也不清（`App.tsx` 的 `SIGNED_OUT` 與 Navbar 只清 `sb-*`、`user`、`pendingSession`）。共用裝置上，下一位會員開提領流程會被預填前一人的帳號；沒注意就送出，錢會匯進前一人的帳戶 | 第 4 波：鍵加 uid，或 `SIGNED_OUT` 時清。加進「登出清所有本機狀態」的盤點（§4.2-2） |
| 4 | `src/components/CompleteProfile.tsx:618-661`、`:961-991` | Q7「確定刪除」後確認框立刻關、沒有 busy 狀態：弱網下畫面無回饋，紅框鈕可以再點一次。反駁後降級：重送要兩次刻意操作，第二次只會多一則「未授權」或「刪除失敗」toast，不會多刪任何東西。<br>同一處的裸 `fetch`（`:629-644`）：刪除成功但回應遺失時，前端顯示失敗、停在原頁；重試得到 401「未授權」，沒有 401 處理，只能重整 | 加 `isCancelling` 停用兩顆鈕並顯示「處理中」；401 視為帳號已不存在，走清本機＋`signOutWithFallback` |
| 5 | `src/utils/apiClient.ts:200-213`、`src/components/AuthPage.tsx:197,219,378` | 401 分支與 AuthPage 仍是裸 `supabase.auth.signOut()`，沒走 T1 新增的 `signOutWithFallback`。signOut 卡住時，後面的清 hint、`emitSessionExpired` 都不執行，畫面停在 401。重整可恢復（bootstrap 的 unauthorized 分支有 fallback） | 一律改用 `signOutWithFallback`，併 P2-4 |
| 6 | `src/hooks/useAuthBootstrap.ts:180-183`、`src/utils/fetchProfile.ts:24`、`src/utils/routeAfterVerifiedSession.ts:40` | `/profile` 404 的語意兩邊不一致。bootstrap 視為無效 session，直接 global signOut；OTP 路徑則視為「profile 列還沒建好，繼續註冊」。T1 之後兩者共用同一個 in-flight 請求。真的回 404 時會是：OTP 頁導去完善資料頁，同時 bootstrap 把人登出，再被導回 /login。正常情況 trigger 在 signup 時就建好 profile，機率低，未證實發生過 | 統一 404 的處置（bootstrap 對 404 不 global signOut，或交 OTP 路徑決定）；PR-B 補 `/profile` 逾時 |
| 7 | `e2e/journey/builders/registration.py:54`、`e2e/journey/steps/f70_renewal_saga_steps.py:216` | 晉升 journey-full 第一輪兩條失敗（§3.1）沒有現場診斷。等 `#name` 那行沒有 `dump_page`（同檔 :43-49 有）。f70 斷言「任務中心」標題，但標題在載入中與錯誤時也會畫（`TaskDashboard.tsx:80-110`），證明不了資料已載入 | 兩處補 `dump_page`；f70 改等 `get_by_test_id("round-progress")` 並以 `to_have_text` 斷言。#477 留言已列第 4 波候選 |
| 8 | `supabase/functions/api/listing-photos.ts:217-222` | 錨點只在 `referencedOwners > 0 && totalObjects > 0` 時檢查。若 listings 查詢日後被改壞而回 0 列，只剩比例閘，而比例閘可用 `force_ratio` 放行 | 規格書 §11 SOP 補一句：「`referencedOwners=0` 而 `totalObjects>0` 時不得 force_ratio」 |
| 9 | `supabase/migrations/20261110000001_listing_photo_orphans.sql:66` | `l.user_id::text = split_part(...)` 讓 `listings.user_id` 的索引用不上，成本是 O(物件 × 刊登 × 照片)。失敗形態偏安全：逾時只會 `sweep_failed`＋開 issue | 量大前不急；之後以新 migration 改成 `l.user_id = split_part(...)::uuid` |
| 10 | `scripts/check-spec-drift.py` | 只新增了 `ORPHAN_GRACE_HOURS` 對規格書的規則；規格書寫的「單輪最多處理 500 個（`ORPHAN_SWEEP_LIMIT`）」沒有規則，改常數不改規格書不會紅 | 補一條 ConstantRule |
| 11 | `src/components/EditServiceProvider.tsx:183-214` | 同帳號雙分頁：B 分頁移除照片 X 存檔、即時清理失敗，排程隔天刪 X；A 分頁持舊表單再存檔，把 X 寫回 photos，刊登破圖。規格書 §11「晚存檔破圖」已涵蓋這類取捨 | 記著；W2-12（破圖通知）候選一併考慮 |
| 12 | `.github/workflows/deploy-smoke.yml:218-225` | `failure()` 也會被 checkout 等其他 step 觸發。此時 smoke 與閘門兩個 outcome 都不是 failure，LINE 標題變成「develop 預覽站」、body 空、level P2，訊息誤導 | 加一條 fallback 標題「部署驗證 job 失敗，詳見 run」 |
| 13 | `.github/actions/notify/action.yml:57-66` | K 只在 reconcile 加了「缺 LINE secret 就 fail」；deploy-smoke、deploy-supabase 等其他呼叫端缺 secret 仍靜默 no-op。原第 2 波 P2-3 只建議 reconcile，屬範圍內設計 | 列第 4 波候選：其他呼叫端至少在 summary 標紅 |
| 14 | `src/utils/authView.ts:34`、`src/hooks/useAuthBootstrap.ts:105-107,289` | W3-13 F1 的事實補記：資料未齊時 `user=null`，所以 `isFunnel && !isAdmin` 的 admin 雙保險在 F1 不生效，admin 也畫註冊中版頁首（只有登出＋「繼續完成註冊」），看不到「平台管理」。<br>`isRegistrationLocked`（`registrationFlow.ts:100`）會鎖住有效會員的資料，所以有效會員到完善資料頁可能改不了資料。正式站候選 0 人（A0），業主已裁決維持 | 不改；若日後出現這類帳號，先查 CompleteProfile 對已鎖定會員的行為。CTA 文案對「已是會員、只是缺欄位」的人是誤導，屆時一併改 |
| 15 | `src/hooks/useAuthBootstrap.ts:109-111,185-187` | 冷啟動 `/profile` 5xx 時狀態是 `anonymous/transient`，頁首畫訪客版。user=null 時 `useRevalidateOnFocus` 不啟動，所以要等分頁切回才可能重試。這是 plan 留給 PR-B 的 `degraded` 範圍 | PR-B 排第 4 波時一併處理 |
| 16 | `src/components/admin/MemberManagement.tsx:147,797-835` | A 加兩欄後，表格約 11 欄，768–1024px 會橫向捲動，「操作」欄可能在畫面外（不破版，有 `overflow-x-auto`） | 768–1024px 隱藏「推薦碼」欄，或與徽章合併 |
| 17 | `src/components/Navbar.tsx:138-158`、`src/components/HomePage.tsx:76-86` | 小 UX 缺口：<br>漏斗版登出進行中只有變淡，沒有「登出中」文字或 spinner，最久 5 秒。<br>待開通結果頁的 CTA 暫停時沒有原因說明。<br>L2 清篩選後焦點留在 logo，搜尋框被清空卻沒有播報 | 登出鈕換 spinner＋「登出中…」；其餘可不做 |
| 18 | `docs/uknow-software-specification.md`（§3 `/` 列、§2.1） | 規格書失真與缺漏：<br>首頁行為（返回還原篩選與捲動、點 logo 清篩選並回頂端；W2-24、W3-9）只存在程式與測試。<br>§2.1「註冊中＝從未訂閱過」與 F1 實作（資料未齊一律走註冊中頁首）不符。<br>§2.1 第 1 點寫「LINE 內建瀏覽器」會閃訪客版，易被讀成「每次」；實際只有第一次登入（hint 與 session 同在 localStorage） | 第 4 波主 session 回頭修規格書（§6） |
| 19 | `docs/plans/launch-wave-3/plan.md` §5 | 有幾項既沒做，§5 也沒列，又沒寫「接受」，等於靜默擱置：<br>第 2 波 P2-8（捲動還原落點）、P2-9（deploy-smoke 寬限以 committer 時間計）、P2-11（`payuni-merchant` 去重鍵含 Message 原文）。<br>T1 的降級與記債：Navbar 會員登出的 startTransition、載入態可讀文字、S5／S8 測試強度、請求恰一次 | 第 4 波 plan §5 補上，各附觸發條件 |
| 20 | `e2e/steps/route_guard_steps.py:263-266` | T1 驗收 S1 的 BottomNav 子句只斷言「最終存在」（`to_have_count(1, timeout=5000)`），證不出 PR 摘要寫的「`/profile` 回來前就已出現」。需求視角提 P1，本 session 降級：這是測試強度，不是行為錯誤；業主 A3 實機截圖驗過首繪 | 記債已在 #466；第 4 波以 observer 記錄首現時點 |
| 21 | `docs/supabase-setup-checklist.md`「附錄：正式站清空測試資料 SOP」 | 長期文件裡留著可直接執行的 `delete from auth.users;`。#468 依第 1 波 §6 升級進來，已有「不得再整批全清」警語 | **已處置（W3-14，業主 11/01）**：只留原則，SQL 本體改以 `git show 3461f2bf:docs/supabase-setup-checklist.md` 取回；本 PR 改寫該附錄 |
| 22 | `supabase/functions/api/index.ts:2419-2425` 一帶 | W3-5 的日期桶用 UTC（`toISOString().slice(0,10)`），換日點在台北 08:00；營運以台北計時，沒有註明 | 在註解寫明 UTC，或改台北日；低 |

### 1.4 被反駁推翻或降級的

| 原主張（視角） | 反駁後 |
|---|---|
| Button 基底 aria-disabled 波及後台（架構 P1 候選） | 機制屬實，違反業主裁決 K5，重新整理鈕滑鼠與觸控點不到；但沒有資料錯誤、使用者不會卡住（15 秒後放行）→ **P2-1，建議優先** |
| 換 uid 的 SIGNED_IN 不清快取，外洩他人資料（架構 P1 候選） | auth-js 跨分頁會廣播 SIGNED_OUT，一般換帳號不受影響。剩下的兩條路徑罕見；B 在換帳號前本來就能操作 A 的分頁，沒有拿到額外的東西；屬既有行為 → P2-2 |
| Q7 可重複觸發刪除（UI/UX P1） | 重送要兩次刻意操作；第二次只多一則錯誤 toast，沒有額外傷害 → P2-4 |
| 會員登出時頁首變「U」頭像（UI/UX P1） | **推翻**：`setUser(null)` 在同一個 render 就把 authState 改成 anonymous，頁首立刻變訪客版，不會出現 'U'。受保護頁閃一下 /login 是 T1 前就有的行為，T1 只把上限收斂到 5 秒 |
| LINE 內建瀏覽器每次先畫訪客頁首（UI/UX P1 候選） | **推翻**：hint 與 Supabase session 同在 localStorage，清了 storage 本來就是未登入。「有 session 沒 hint」只會在第一次登入時發生一次；比 T1 前（每次都閃）更好；plan E3／S6 已列為裁決過的限制 → 只剩規格書措辭（P2-18） |
| T1 驗收 S1 的 BottomNav 子句偏弱（需求 P1 候選） | 是測試強度不是行為錯誤，已記債 → P2-20 |
| Q7 成功 toast「之後可以用同一個 Email 重新註冊」未經業主過目，可能不實（需求 P1 候選） | **推翻**：後端 `deleteUser`（`index.ts:835`）刪 auth user，Email 隨之釋出，承諾屬實。文案是主 session「toast 照實寫」要求下的實作，非新功能 |
| C 的 live dry-run 從未成功（需求 P1 候選） | develop 401 是 secret 不同值，11/01 輪換後兩站 dry-run 都通過；業主開開關前本機核對過候選（0）與錨點（10/10）→ 不成立，首輪實況見 §3.2 |

## 2. 未驗項清單

來源：6 支程式 PR 與晉升 PR 的內文「未驗」段，對照 PR 留言、plan §8 與 Actions。

| PR | 自述未驗 | 之後 | 結論 |
|---|---|---|---|
| #453（C） | 端點的 live 行為（RPC、斷路器、比例閘只有 CI 的 DB／單元測試） | develop dispatch 回 401（run 41250155677，issue #476）→ 11/01 業主輪換 `RECONCILE_SECRET` 後，正式站 dry-run 41294916617、develop dry-run 41295068483 皆通過（§3.2） | 已驗（dry-run）；實刪首輪見 §3.2 |
| #453 | W3-8 workflow 閘門 | `purge-listing-photos-request.py --self-test` 表格案例涵蓋；沒有 live 的 production dispatch | 部分驗（表格測試＋本審查逐條推演） |
| #453 | `PHOTO_PURGE_LIVE` 未開 → 三十日下架尚不成立 | 11/01 業主本機核對（候選 0、錨點 10/10）後開啟（#478） | 開關已開；實刪首輪見 §3.2 |
| #466（T1） | 已知限制 1–3（訪客版頁首閃一次的三種情形） | 規格書 §2.1 已註記 | 已驗（已落文件；措辭見 P2-18） |
| #466 | 記債 7 條（恰一次、BottomNav 首現時點、S5 10 秒、S8 容差與觸控、`role=status` 位置、OTP 驗證後只靠純函式、載入態無文字） | 無後續 | **未驗**，未列候選（P2-19、P2-20） |
| #466 | e2e 327/327 | CI e2e 軌綠；晉升 journey-full 重跑 146/146 | 已驗 |
| #472（A） | 後台實機 | CI api-tests（`admin-and-announcements.test.ts`）綠 | 部分驗：develop 後台實機沒有紀錄 |
| #473（L）／#474（L2） | 真機返回鍵、logo 再點；L2 沒有獨立紅燈 commit（只在本機驗紅） | 主 session 以 19 行規模接受（plan §8） | 部分驗（jsdom 測試） |
| #475（K） | 「確認 LINE 推送設定存在」只在有告警時跑 | reconcile run 41250157710 綠，step 照設計跳過 | **未驗：待真實觸發**。缺 secret 分支、deploy-smoke 閘門紅的推送、「另有 N 筆」文案都沒實觸發 |
| #477 | journey-full 第一輪 2 failed／102 passed／42 skipped（run 41274370205） | 重跑 146/146（job 124757166029）；T1 session 判定無因果 | 見 §3.1：偶發的判定方向成立，但「沒有產品 bug」只是沒找到，無法證實 |
| #477 | 正式站部署 | `production` 15:37 台北核准，`/health` sha＝`1f61e68`、PayUni production 憑證齊全、預設推薦人 ok（deploy-supabase run 41277716004）；deploy-smoke run 41285941139 綠 | 已驗 |
| W2 遺留 | 正式站第一筆真付款→發票開立、`system_alerts` 無誤報（第 2 波 §5-5） | 部署後訂單 0 筆、告警 0 列（§3.3） | **未驗：現場未觸發**，沿用 |

## 3. 上線後現場

### 3.1 晉升 journey-full 第一輪的兩條失敗

| 失敗 | 判讀 | 信心 |
|---|---|---|
| `f10_org_build` 第 4 代 E3 在完善資料頁等不到 `#name`（30 秒），下游 42 個情境被 skip | `#name` 無條件渲染、路由沒有守衛（`App.tsx:266`、`CompleteProfile.tsx:762`），看不到它代表沒導到完善資料頁：可能卡在 OTP 頁（verifyOtp 錯誤只跳 toast），也可能被導走。<br>log 分不出是哪一種，因為那行沒有 `dump_page`。<br>兩條失敗都落在新分支建立後約 7 分鐘內（04:50～04:56 UTC），8 個瀏覽器並行；GoTrue 的 per-IP 限流只調高了 email 寄送一項，第 4 代時已累積約 28 次 signup／verify，E3 排在最後。<br>T1 引入的潛在不一致見 P2-6（404 語意），但正常情況不會回 404 | 偏向環境，約 65% |
| `f70_renewal_saga` 第 1 章 U1 的 /tasks 沒有「1 / 8」 | 斷言的標題在載入中與錯誤時也會畫，證明不了資料已載入。<br>任務頁相關程式（`useTaskData`、`TaskDashboard`、後端 `/tasks`）從 `5b6a790` 到 `1f61e68` 沒動過。<br>同一步驟在第 2、4 章都通過 | 偏向環境＋測試等待漏洞，約 70% |

結論：主 session 的「偶發」方向成立、不是 T1 的回歸；但兩條都缺現場畫面，所以「沒有產品 bug」只能說沒找到。失敗 run 的 artifact
`journey-results-41274370205` 存在 Azure blob，本 session 的 proxy 拿不到（403），**業主或主 session 可下載看 E3 與 U1 失敗當下的截圖與 trace**。
下一次晉升前先補兩處診斷（P2-7）。

### 3.2 照片清理第一次排程

**前置（#478，11/01）**：
- develop 回 401 的根因是 GitHub 的 `RECONCILE_SECRET` 與 develop 的 Supabase Secret 不同值。業主改為**輪換**密鑰，GitHub、正式站、develop 三處同值。
  驗證 run：正式站 dry-run 41294916617、develop dry-run 41295068483、對帳 41295070551。issue #476、#481、#482 已關。
- `PHOTO_PURGE_LIVE` 於 11/01 開啟（業主本機核對時候選 0、錨點 10/10），在 W2-8「晉升後 3 日內」的期限內，比 plan 原排的 11/10–13 早。
  所以台北 11/02 03:17（UTC 11/01 19:17）那輪是**實刪模式的首輪**。

**首輪結果**：（待 run 結束後補）

### 3.3 正式站 DB

本 session 依派工把唯讀 SQL 以 send_message 交主 session 代跑，**第一次送出被本 session 的權限分類器擋下**（Production Reads）；
之後在中間回報裡說明，主 session 主動代跑（2026-11-01 08:24 UTC，唯讀）：

| 項 | 值 | 判讀 |
|---|---|---|
| #477 部署（07:37 UTC）之後的 `system_alerts` | 0 列 | 沒有誤報；同期也沒有觸發機會（下一列） |
| 未 resolve 的告警 | 0 列 | W3-5 日期桶上線前沒有殘留的同鍵列擋著去重 |
| 部署後 `payment_orders` | 0 筆 | 晉升後零訂單：#461 告警路徑、電子發票開立在正式站仍未走過（第 2 波 §5-5 沿用） |
| `20261104000001`、`20261110000001` | 兩支都已套用 | — |
| `listings-photos` bucket | 32 個物件，超過 168 小時的 0 個 | 首輪排程的候選預期為 0；錨點與比例閘的分母照常計算 |

**GitHub 側**（本 session 以 GitHub MCP 查）：

- open issues 5 張：#476（develop 照片清理 401，plan §6-3 業主待辦）、#467（npm high／critical，週一 Dependabot 後複查）、#395、#384、#383。
- 正式站部署：見 §2 #477 列。deploy-smoke 晉升後 dispatch 一次綠（run 41285941139）。
- reconcile 排程：晉升部署（07:37 UTC）之前最後一輪是 04:21 UTC，綠。

## 4. 流程

### 4.1 三種 session 分工

- **大致照設計運作**：
  - 名冊 §7 完整，沒有名冊外的 session 合進 develop；#453、#466 的 PR 內文 session 連結都對得上名冊。
  - 主 session 動手的範圍是 rebase（A 的 `758f44e4`）、轉 ready、逐位元組核對 C 的 rebase 結果、docs，都在〈慣例〉允許內。
  - C 的 P0-1 與 W3-8 都交回 C 自己修，主 session 只審。
- **晉升 PR #477 照〈慣例〉做了**：
  - 逐支標類別。
  - 附 W3-11 業主原話與日期。
  - 列出兩支 migration 與新排程。
  - 第 2 波審查 §4.1 走樣二已改善。
- **走樣一（重跑即判偶發）**：journey-full 第一輪紅後重跑一次綠，就判偶發合 main。T1 session 有對照程式路徑，但沒拿失敗 run 的截圖與 trace。
  建議規則：晉升 PR 的 journey 紅，判偶發前至少看過一次失敗當下的截圖或 `dump_page`；拿不到時在留言明寫「未看現場」。
- **走樣二（紅燈證據的規模豁免累積）**：
  - C 紅燈後兩度改測試（已進 friction-log）。
  - L2 沒有獨立紅燈 commit。
  - T1 A1 逃生口由業主裁決解鎖。
  三處都有紀錄，個別合理；但「規模小所以免紅燈 commit」已經出現兩波，沒有寫成規則。
- **走樣三（共用元件的連帶影響沒人掃）**：P2-1 的 Button 基底改動經過 T1 實作審查與主 session 審查，兩邊都只看 Navbar 兩顆鈕；
  也是第 2 波 §4.2-1「補一個點要掃同類」的另一種形狀：改共用元件時要 grep 全部消費者。
- **plan 落後實況**：§1 時程與 §4 清單仍寫 11/10，與 W3-11 衝突；§6 業主待辦 #2、#4 已完成仍是 ⬜；§8 沒有「開 #477」「journey 紅／重跑」「合 main」「production 核准」四列。

### 4.2 還沒進 friction-log 的摩擦

本 PR 寫入 friction-log「2026-11-01｜第 3 波審查」一節：

1. **改共用元件基底要掃全部消費者**（P2-1）：jsdom 不載 Tailwind，樣式類回歸 vitest 抓不到；審查也只看了觸發改動的那兩顆鈕。
2. **晉升 journey 紅判偶發前要看現場**（§3.1、§4.1 走樣一）。
3. **登出清理的範圍是「本機狀態」不只「模組層快取」**（P2-2、P2-3）：第 2 波的規則只講 `*Cache.ts`，localStorage 的 `withdrawalBankData`、換 uid 的 SIGNED_IN 都在規則外。
4. **審查 session 代跑現場 SQL 的路被分類器擋**（§3.3）：〈慣例〉寫「現場 SQL 交主 session 代跑」，但審查 session 送出含正式站 SQL 的 send_message 被判為 Production Reads。需要業主在設定允許，或改由主 session 主動跑、把結果寫進 plan §8。

## 5. 給主 session／業主的待辦

1. ~~業主：`PHOTO_PURGE_LIVE`、develop 的 `RECONCILE_SECRET`~~：11/01 已完成（#478，§3.2）。
2. **主 session**：第一筆正式站真付款後確認發票與 `system_alerts`（§3.3 部署後仍 0 筆）。
3. ~~業主裁決 P2-21~~：W3-14 只留原則，本 PR 已改。
4. **第 4 波第一個工項（W3-15，業主 11/01）**：P2-1＋P2-2＋P2-3＋P2-4＋P2-5 併一支小 PR（共用 Button 的 aria-disabled 樣式、換帳號清理、提領銀行帳號 localStorage 登出不清、cancel-signup busy 與 401、401／AuthPage 改走 `signOutWithFallback`）。本 PR 不動程式碼。
5. **第 4 波 plan §5**：補 P2-19 列的靜默擱置項，並收 P2-6、P2-7、P2-12、P2-13、P2-15。
6. 失敗 run 的 artifact `journey-results-41274370205`（90 日保留）若要確認 §3.1，下載看 E3／U1 的截圖。

## 6. 升級進長期文件（launch-wave-3/ 退場依據）

第 2 波目錄已由本 session 另開 #479 退場（第 2 波 review §6 逐條處置，明細見該 PR）。第 3 波的由第 4 波主 session 處置，交接檔是 `docs/plans/launch-wave-4/plan.md`：

| 內容 | 去處 | 理由 |
|---|---|---|
| W3-8 workflow 閘門、dry-run 預設、錨點／比例閘 | 已在規格書 §11 與 workflow 檔頭——免動 | — |
| W3-5 日期桶 | 已在 `index.ts` 註解與 `supabase/README.md`〈告警 severity〉（#479）——免動；UTC 註明見 P2-22 | — |
| W3-9／W2-24 首頁返回還原、點 logo 清空 | 規格書 §3 `/` 列或首頁段補一句 | P2-18；目前只在程式與測試 |
| W3-12 Q7 確認框、W3-13 F1 | 規格書 §2.1（F1 補「資料未齊一律走註冊中頁首」） | P2-18 |
| 執行環境須知（plan §3 兩條補充） | 已由 #479 寫進 `docs/README.md`〈慣例〉——免動 | — |
| 「晉升 journey 紅判偶發前要看現場」 | `docs/README.md`〈慣例〉主 session 職責，或晉升 SOP（CLAUDE.md 晉升段） | §4.1 走樣一 |
| 「改共用元件基底要掃全部消費者」 | friction-log（本 PR）；若再犯，考慮在 `ui-ux-guidelines.md` 寫 Button 基底的契約 | §4.2-1 |
| 「登出清所有本機狀態」 | friction-log（本 PR）；修 P2-2／P2-3 時寫進 `useAuthBootstrap.ts` 的 `onSignedOut` 註解 | §4.2-3 |
| T1 PR-B、§5 候選 | 第 4 波 plan | — |
| 本報告 §4.2 四條 | friction-log 新節「2026-11-01｜第 3 波審查」 | 本 PR 寫入 |
| 其餘（§1 時程、§2 工作分解、§7 名冊、§8 進度、dispatch-prompts.md） | 隨目錄刪除 | 一次性施工紀錄，`git show` 取得回 |
