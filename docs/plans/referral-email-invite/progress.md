# Email 邀請（R2）實作進度

<!-- plans-keep: 施工鷹架；退場條件＝/tdd-implement 收尾刪除整個目錄 -->

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`claude/referral-email-invite-vygu7r`(後端段;2026-10-26 業主選定:web session 平台指定分支,不另切 `feature/*`)
規劃書:`./plan.md`(v2,2026-10-26 依業主裁決 A～T 修訂)|審查:`./review.md`(P0 0;處置:修訂後通過)
上游:總綱 `docs/plans/platform-growth-and-trust/plan.md` §2.3A(commit `e8c6080`)

## 開工條件(2026-10-26 核對;裁決 F;前置 A、B 已於同日合併)

| 前置 | 狀態 | 擋哪些循環 |
|---|---|---|
| check-email 修正(PR #390,`find_auth_user_by_email`) | ✅ 已合併(`1f35f72`) | — |
| R1a-3(PR #394,`_shared/recruitment-copy.ts`) | ✅ 已合併(`5363fde`) | — |
| R2-0 spike 結論 | ⬜ 未貼入 | 不擋(裁決 E);標「待 R2-0」的循環先以原始碼核對結果實作,結論與規劃矛盾時由監工更新 plan.md 再續 |
| 人審 `review.md` | ✅ 修訂後通過(2026-10-26) | — |

## 階段狀態

| # | 階段 | 狀態 | 待 R2-0 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|---|
| 0 | R2-0 spike(外部,結論貼入下方「R2-0 結論」) | ⬜ 未開始 | — | — | — |
| 1 | token 模組+`_shared/referral-invite-payload.ts`+spec-drift TTL 規則 | ✅ 綠 | — | `bb1b0df` | `e81389b` |
| 2 | 兩支 migration(`20261025000011` purge+audit 清理、`20261025000012` refund)+spec-drift purge 規則 | ✅ 綠(CI 為證) | 第 6 點 | `7114b20`(CI 12 條斷言紅) | `4c04a75`+修正 `c9e0aa7`(CI 全過) |
| 3 | `api/rate-limit-strict.ts`(三態、refund)+資格 helper | ✅ 綠(CI 為證) | — | `869504a`(CI 7 條斷言紅) | `2d825fe`(CI 全過) |
| 4a | invites 前半(disabled、資格、body、姓名、per-user 兩窗、401)+invites 契約段+spec-drift 4 條 | ✅ 綠(CI 為證) | — | `63ff52c`(CI 12 條斷言紅) | `b7b5d79`(CI 全過) |
| 4b | invites 後半(lookup、target／global、寄送、GoTrue 對映、對帳、補償、退額度矩陣)+spec-drift 6 條 | ✅ 綠(CI 為證) | 第 1、2、7、9 點 | `e4c18dd`(CI 12 條紅,其中 3 條是 stub 不建帳號致前置讀取 null 的 TypeError,其餘斷言紅) | `78e3b37`(CI 全過) |
| 5 | `POST /auth/invite/accept`+accept 契約段 | ✅ 綠(CI 為證:`0d44758` 映像限流重跑後全過;v3 改一步驗證見下列) | 第 3、4、5 點 | `ddedcce`(CI 13 條斷言紅;反向順序 canary 直接打 GoTrue、本就綠) | `cfce665` |
| 審 | 實作審查處置(業主 2026-10-26 裁決,plan.md v3 增補):accept 一步驗證、共用密碼規則、無效信箱只退 target、無碼 429 退額度、告警以帳號去重、蓋章對帳、`/health` 兩欄、補測 | ✅ 綠(待 CI) | — | `e625d0b`(CI 證據在其上的移植 commit `8fa6c2a`:404 過、10 條斷言紅,正是預期的 10 條;`e625d0b` 本身兩次死在拉映像) | (本批) |
| 6 | `routeAfterVerifiedSession` 抽取(行為不變) | ⬜ 未開始 | — | | |
| 7 | `registrationFlow.ts` 三個純函式 | ⬜ 未開始 | — | | |
| 8 | AuthPage invite 模式+`useInviteAccept`+`App.tsx`+2A 提示+`sessionStorage` | ⬜ 未開始 | — | | |
| 9 | InviteCard+三處入口+旗標+`ui/dialog` 關閉鈕+`backendConstants.ts` | ⬜ 未開始 | — | | |
| 10 | CompleteProfile `app_metadata` 後備預填 | ⬜ 未開始 | — | | |
| 11 | 模板檔+模板測試+文件 | ⬜ 未開始 | 第 1、11 點 | | |
| R2-3a | journey 情境+`journey.yml` secret 注入(非 TDD,分支內驗形) | ◐ API 版完成 `6640936`(UI 步驟交前端,見下) | — | — | — |
| R2-3b | 合併後業主操作(plan.md §5 R2-3b 十二步) | ⬜ 未開始 | 第 5、10 點 | — | — |

**hash 對照**:2026-10-26 pre-push hook 把分支 rebase 到 develop(#398),上表已換成 rebase 後的 hash;CI 的紅綠證據
跑在 rebase 前的 commit 上(PR #399 的 Checks 歷史看得到),對照:`52890f3`→`bb1b0df`、`b19cf57`→`e81389b`、
`42f29fe`→`7114b20`、`e847f89`→`4c04a75`、`eb0ac40`→`c9e0aa7`、`7cf06aa`→`869504a`、`8e1fdfd`→`2d825fe`、
`4fc4d0b`→`63ff52c`、`2aefdbc`→`b7b5d79`、`2b84cc7`→`e4c18dd`、`9b9328e`→`78e3b37`、`7a1e309`→`ddedcce`、
`36293b4`→`cfce665`、`508c3c1`→`6640936`。

前置已全部合併,只剩循環間依賴:7 依賴 1,8 依賴 5、6、7,9 依賴 4a,R2-3a 依賴 4b、5。

## R2-0 結論

<!-- 由監工 session 貼入。每點對照 plan.md 附錄 A 的 G 編號;結論欄分「本機」「develop」兩欄。 -->

(尚未貼入)

## 目前位置與下一步

**分工(業主 2026-10-26 裁決)**:本 session(Opus)做後端循環 1–5+R2-3a,開 PR 到 develop;合併後另開
Sonnet session 打 `/tdd-implement referral-email-invite`,從本表接著做前端循環 6–11 與收尾(含清理規劃檔)。

**DB 測試的紅綠證據(業主 2026-10-26 裁決)**:web 容器起不了本機 Supabase(ghcr／ECR 映像 blob 被網路政策擋、
Docker Hub 429),所以 `api/*.test.ts`(需 DB／GoTrue)的紅綠以 CI api-tests 軌為證:紅燈 commit 單獨推一次、
看 api-tests 是斷言紅;實作完推綠燈 commit、看轉綠。`*.unit.test.ts` 與 `deno task check` 照常本機跑。

目前:後端段收尾中——`/review-implementation` 已跑(`implementation-review.md`,P0 0),業主 2026-10-26 對 6 項需人工裁決的
處置已落地(紅 `e625d0b`、綠本批;規劃面的改動寫在 plan.md 檔頭「v3 增補」)。下一步:CI 綠 → PR #399 轉 ready、等人審合併。

**R2-3a 範圍(業主 2026-10-26 裁決)**:本 PR 只做 `journey.yml` 的 secret／旗標注入與一條**純 API** 的 journey 情境
(寄邀請 → service key 讀信中連結 → accept(設密碼同時驗證)→ 以該密碼登入;purge 的 `p_email`)。開連結 → 設密碼畫面 → 完善資料頁 →
結帳頁這段 UI 步驟,交給前端 session 在循環 8 之後補進同一個 feature 檔——後端先合併時,晉升 PR 的 journey 不會因缺前端而紅。

新建路徑用的是上游 E.6(`inviteUserByEmail` → `updateUserById(app_metadata)`＋補償),不是 plan §2.3 條件式裡的「先 `createUser` 蓋章」版:
R2-0 第 2 點尚無結論,條件未成立就維持 E.6(plan 原文)。R2-0 證實第 2 點後若要改,只動 `referral-invite.ts` 的 8a 段與對應測試。

## 實作與規劃字面不同之處(後端段,2026-10-26)

都不改變對外行為或裁決,只是規劃沒寫到的實作細節,列給審查與前端 session:

1. **deps 多三個成員**:plan §2.3 寫 `{ sb, rateLimit, logSystemAlertOnce, read, now, limits }`;實作另加 `requireAuth`(invites
   需登入)、`clientIp`(accept 的 per-IP 鍵,原本在 index.ts)、`gotrueTimeoutMs`(測試要能把 10 秒逾時調短)。`limits` 多
   `accept` 一組。index.ts 匯出 `referralInviteDeps()` 給測試換掉 `sb`(造 GoTrue 失敗),正式路由用同一份。
2. **purge 的 `issued_at` 壞值處理**:plan 寫「cast 前以 `~ '^\d{4}-\d{2}-\d{2}T'` 守住格式」;但 `2026-02-30T…` 過得了
   regex、cast 仍會拋,整批中斷。改成內部函式 `referral_invite_issued_at(jsonb)`(regex＋`exception when others → null`),
   壞值一律跳過——達成 plan 寫的「壞值跳過，不讓單列壞值中斷整批」。測試釘了 `garbage` 與 `2026-02-30` 兩案。
3. **空殼判準用 `jsonb_typeof(...) = 'object'`**:plan 寫 `referral_invite is not null`;`raw_app_meta_data ? 'referral_invite'`
   對 JSON `null` 也成立,所以三處(invites／accept／purge)都要求「是物件」。
4. **新建路徑維持上游 E.6**(`inviteUserByEmail` → `updateUserById` 蓋章＋補償),不是 plan §2.3 條件式裡的「先 `createUser`」
   版——R2-0 第 2 點尚無結論,條件未成立。
5. **plan 沒寫到、實作補上的出口**:`find_auth_user_by_email` 查詢失敗 → 退 per-user 兩鍵＋503;全站窗 `limited` 另寫一筆告警
   (kind `referral-invite-global-hour-limited`／`-day-limited`,讓營運看得到撞上限);重寄時 `updateUserById` 先失敗 →
   退額度＋告警＋503;對帳時查詢失敗 → 告警＋503、不退不回寫(不知道寄了沒,保守不退)。
6. **accept 的錯誤句**是後端後備文案;前端依 code 分流,實際字句以 plan §4／上游 D 為準(前端 session 實作)。
7. **R2-3a 只做 API 版**(業主裁決,見「目前位置」),UI 步驟交前端。
8. **實作審查補記**(`implementation-review.md` P1-2、P1-6):
   - GoTrue 逾時用 `Promise.race`+`setTimeout`(plan 寫 `AbortSignal.timeout`):supabase-js 的 admin 方法不收 signal,逾時後
     請求仍在飛。晚到提交的殘餘已列入 plan §2.5(業主裁決接受)。
   - `validation_failed` 不分成因一律映成 `invalid_email`(plan 寫「email 的」):invite 只送 email 與兩個信件字串,業主裁決維持。
   - invites 的錯誤句也是後備文案(`rate_limited_hour` 句與 plan §4 字面不同):前端一律依 code 用自己的
     `Record<ReferralInviteErrorCode, string>`,不讀 `err.message`。
   - accept「`generateLink` 回的 id 不符」分支原本另清稽核列;v3 一步驗證後整段移除,不再適用。

## 過夜施工規則(業主 2026-10-27 授權,台北 02:50 起約 8 小時)

前端 session(Sonnet)在業主睡覺期間接手循環 6–11,照這節做,不要停下來等人:

1. **開局分支**:#399(後端)還沒合併,前端疊在它上面——
   `git fetch origin claude/referral-email-invite-vygu7r && git checkout -B <本 session 的分支> origin/claude/referral-email-invite-vygu7r`。
   PR 開 **draft**、base `develop`(CI 只跑 base=develop 的 PR),描述第一行寫「疊在 #399 上,先合 #399」。
2. **需要裁決時**:可逆的 UI／實作細節(版面、元件拆法、測試寫法、文案以外的互動細節)→ 採推薦選項,記進下方
   「待業主確認」並在 PR 描述列出,繼續做。動到**金流、會籍、法務／告知文案的字句、後端契約**→ 不自己決定:記進
   「待業主確認」,跳去做不受影響的循環。
3. **紅綠證據**:前端 vitest、e2e(mocked)都能在本機跑,紅燈 commit 照常本機取證;push 後看 CI。
4. **不做**:不 merge、不 push develop／main、不動 #399 的分支。規劃檔清理留到整個功能(含 #399)都合併後的收尾。

### 待業主確認(過夜期間採推薦選項的決定)

(前端 session 寫入)

## 前端 session 交接(後端段審查後)

1. **alias**:`@password-policy` 已在本 PR 接好(vite、tsconfig paths、include);`@referral-invite-payload` 還沒接——前端循環 7
   開工時照 `@recruitment-copy` 先例補三處。
2. **accept 流程(v3)**:`POST /auth/invite/accept` → 200 `{ accepted: true }`(密碼已設、email 已驗證)→
   `signInWithPassword({ email: payload.e, password })` → `routeAfterVerifiedSession`。登入失敗或回 409 → 2A、保留 email、
   用剛設的密碼登入。沒有 `verifyOtp`、沒有「重打 accept」的回路;e2e mock 也照 plan §3 v3 的列改。
3. **密碼**:invite 模式的 2B 用 `validatePasswordPolicy`(已改走共用規則)並加 `exceedsPasswordMaxBytes` 前置檢查;後端再回
   `weak_password` 就只剩外洩密碼,沿用 `translateSignUpError`。
4. **錯誤文案**:兩支端點一律依 code 映射,不顯示 `err.message`(`apiClient` 會把後端後備句或 GoTrue 英文原文塞進去)。
5. **在途上限**:invites 最壞約 30 秒(寄送、蓋章、補償刪除各 10 秒),`apiRequest` 沒有 timeout——在途態加約 25 秒 abort,
   行為同「無 code 失敗 → `unavailable`」。
6. **數字綁常數**:卡片「每小時最多寄 5 封」的 `backendConstants` 測試,除 `REFERRAL_INVITE_RATE_MAX` 外也斷言
   `REFERRAL_INVITE_RATE_WINDOW_SECONDS === 3600`(窗口改了「每小時」會靜默過期)。
7. **journey**:`80_` 的 Background 需要建好的 30 人樹。R2-3b 第 1 步(合併 develop)之後,先在 develop 手動 dispatch
   `pytest_expr="orgbuild or invite"` 跑一次,別讓 hosted 行為的第一次實測落在晉升 PR 的 `journey-full`(紅了會擋整個晉升)。

## Blockers(逃生口紀錄)

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->

- 2026-10-26 DB 測試紅燈需要「stub migration」:函式不存在時 `has_function_privilege` 直接拋錯(不是斷言紅),所以紅燈 commit
  帶只有簽章的 stub、綠燈再改寫同一支 migration。代價:Supabase Preview 分支只套用**新**的 migration 檔,本 PR 的 preview DB
  會停在 stub 版(bot 留言明寫);CI 與合併後的 develop 不受影響。
- 2026-10-26 `4c04a75` 在 CI 套用 migration 時失敗(2BP01 dependent privileges exist):migration 重跑
  `create extension if not exists pg_cron`(已由 `20261017000001` 建立),推測是再觸發 Supabase 的 pg_cron 授權 event trigger。
  移除後過(`c9e0aa7`)。本機起不了 Supabase 時,migration 的套用錯誤只有 CI 抓得到。
- 2026-10-26 bash-guard 誤擋:`git add` 參數裡的路徑 `e2e/journey/pytest.ini` 同時含 `pytest`(`\bpytest\b` 命中
  `pytest.ini`)與 `journey`,被當成「本機跑 journey」擋下整串指令。改成目錄層級 `git add e2e/` 繞開。可考慮讓判準
  只看 `pytest` 出現在指令位置(行首或 `&&`／`;` 之後)。
- 2026-10-26 TDD 證據 × 自動 rebase:pre-push hook 把分支 rebase 到新 develop,紅綠燈 hash 全換;CI 證據留在舊 hash 上,
  只能靠對照表把兩者接起來(見「階段狀態」下方)。DB 測試以 CI 為證時,這個落差特別明顯。
- 2026-10-26 `tdd-test-guard` 擋所有 `*.test.ts` 路徑(含 scratchpad 草稿),紅燈期間草擬下一循環的測試要先存成別的副檔名。
- 2026-10-26 CI api-tests 的 `supabase start` 一天內三次死在拉映像(`762bbf3`、`0d44758`、`e625d0b`;ECR `Data limit exceeded`、
  ghcr `toomanyrequests`、Docker Hub 無該映像),都在任何測試跑之前。github-actions.md 規則 12 原本只要求
  `supabase functions deploy` 有退避重試、`supabase start`「沒有失敗紀錄、記在 friction-log 觀察」——現在有了。建議另開
  `fix/*` PR 讓 api-tests 的 `supabase start` 比照規則 12 加退避重試(並把規則 12 的範圍擴到 `supabase start`)。
- 2026-10-26 bash-guard 同一判準再誤擋一次:`pip install -r journey/requirements.txt; python3 -c "import pytest_bdd, pytest"`
  只是裝離線套件、驗安裝,因為同一串指令裡有 `pytest` 字樣與 journey 路徑就被當成本機跑 journey;改從 scratchpad 複本安裝。
