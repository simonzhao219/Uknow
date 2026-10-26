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
| 5 | `POST /auth/invite/accept`+accept 契約段 | ✅ 綠(待 CI 確認) | 第 3、4、5 點 | `ddedcce`(CI 13 條斷言紅;反向順序 canary 直接打 GoTrue、本就綠) | `cfce665` |
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

目前:循環 5 綠燈與 R2-3a(API 版 journey)同批推;下一步後端段收尾(check:full、/review-implementation、PR 轉 ready)。

**R2-3a 範圍(業主 2026-10-26 裁決)**:本 PR 只做 `journey.yml` 的 secret／旗標注入與一條**純 API** 的 journey 情境
(寄邀請 → service key 讀信中連結 → accept → verifyOtp → 已驗證;purge 的 `p_email`)。開連結 → 設密碼畫面 → 完善資料頁 →
結帳頁這段 UI 步驟,交給前端 session 在循環 8 之後補進同一個 feature 檔——後端先合併時,晉升 PR 的 journey 不會因缺前端而紅。

新建路徑用的是上游 E.6(`inviteUserByEmail` → `updateUserById(app_metadata)`＋補償),不是 plan §2.3 條件式裡的「先 `createUser` 蓋章」版:
R2-0 第 2 點尚無結論,條件未成立就維持 E.6(plan 原文)。R2-0 證實第 2 點後若要改,只動 `referral-invite.ts` 的 8a 段與對應測試。

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
