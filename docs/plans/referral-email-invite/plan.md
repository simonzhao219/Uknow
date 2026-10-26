# Email 邀請（R2）子規劃書

<!-- 由 /plan-feature 實例化。本檔只寫與上游的差異與補足，設計本體不複製。
     目錄的 plans-keep 標記在 progress.md 檔頭（整個目錄是一個鷹架單位）。 -->

**上游**：總綱 `docs/plans/platform-growth-and-trust/plan.md` §2.3A（A～K）、§8.1／§8.2、§8.6 #9～#13、§14 第 6 題、§16
（commit `e8c6080`＝#391 合併進 develop 的 merge commit；#391 已把 PR #393 的 A～T 裁決回填進 §2.3A D／E／F／G／H／J／K）。
讀法：`git show e8c6080:docs/plans/platform-growth-and-trust/plan.md`。下文「上游 D／E／F…」都指 §2.3A 的段。

**衝突優先序**：§2.3A D／K 與業主裁決（2026-10-22／23，及 2026-10-26 的 A～T）＞ §2.3A I 表 ＞ §2.5／§2.7／§9／§11 的摘要列。
同一段內新舊句並存時以標了 2026-10-26 裁決代號的句子為準（§2.6 列出本規劃讀到的段內殘留）。本檔對上游的每一處改動都在
§2.4「差異」標明理由；上游沒寫的才算「補足」。

**修訂紀錄**：v1（審查對象）→ v2（本版，2026-10-26）：依 PR #393 業主裁決 A～T（[留言 6410017491](https://github.com/simonzhao219/Uknow/pull/393#issuecomment-6410017491)）
與監工補充（[留言 6411556654](https://github.com/simonzhao219/Uknow/pull/393#issuecomment-6411556654)）修訂；`review.md` 的 P1 第 3、4、6、9、10、12、15、17、18、19、21～25 條與全部 P2 照各條「→」落實。
裁決與審查條目落在本檔哪一節，見附錄 C。

## 0. 現況（2026-10-26 核對）

| 項目 | 狀態 | 對本規劃的效果 |
|---|---|---|
| develop HEAD | `5363fde`（#394 合併；其前 `1f35f72`＝#390、`e8c6080`＝#391）。`e8c6080` 之後總綱未再變動；#390 讓 `index.ts` `/auth/check-email` 之後的行號整體 −3（本檔引用已重標；總綱 C／E 的 `index.ts` 行號在 `:625` 之後要減 3），推薦入口元件行號未漂 | 上游引用維持 `e8c6080` |
| 前置 A：check-email 修正 | ✅ **#390 已合併**（2026-10-26，merge `1f35f72`）。`supabase/migrations/20261025000001_find_auth_user_by_email.sql` 回 `id`、`email_confirmed_at`、`invited_at`、`confirmation_sent_at`、`last_sign_in_at`、`has_password`、`referral_invite` | 欄名權威＝該 migration 檔。不再擋任何循環 |
| 前置 B：R1a-3 | ✅ **#394 已合併**（2026-10-26，merge `5363fde`）。產出：`supabase/functions/_shared/recruitment-copy.ts` 匯出 `referralDisclosureSentence(name?)`、`RECRUITMENT_FORBIDDEN_WORDS`（十五詞，業主 2026-10-26 加「僱傭、合夥、獨家、特許」）、`findForbiddenWord(text): string \| undefined`；alias `@recruitment-copy`（vite alias＋`tsconfig` paths＋include 三處齊）；`shareReferralInvite(code, showToast, memberName?)`；ui-ux §13 第 5 條新增揭露句子項 | 不再擋任何循環。R2 不另建陣列、姓名檢查直接用 `findForbiddenWord` |
| R2-0 spike | 無結論 | **不擋開工**（裁決 E）；押 hosted 行為的循環先以原始碼核對結果實作，§5 逐循環標「待 R2-0 第 N 點」；結論與規劃矛盾時由監工更新本檔再續 |
| migration 登記 | 總綱 §8.1 R2 列已登記兩支 | `20261025000011_purge_stale_referral_invites.sql`、`20261025000012_refund_rate_limit.sql`；開工時 `origin/develop` 已有更大版本號就改號，rebase 後跑 `python3 scripts/check-migration-versions.py` |

總綱的 13 條修正已於 #391 回填。

## 1. 使用者需求

- 需求本體：上游 A——推薦人在站內輸入對方 email；對方從信件點連結，直接進入和一般註冊相同的「設定密碼」畫面，再到完善資料頁，
  推薦碼已帶入並驗證。**設定密碼畫面**不顯示「某某邀請你」「推薦碼 ○○」；完善資料頁照既有行為顯示推薦人姓名（上游 J、規格書 §4.2）。
- **已定、不重議**：上游 K 的 Q2-12～23（Q2-14 的超額文案見上游 D）、用語稽核（使用者看得到的文案一律「推薦人」；四份律師文件原文不改；
  服務類別「傳銷」保留；程式註解、內部文件與測試腳本的業務術語不改），以及 2026-10-26 的 A～T 二十題（附錄 C）。本規劃不重開任何一題。
- **驗收**：上游 J，下列四條依 D／E 的實際行為改寫預期（審查 P1-21）：
  - （已登出、同裝置）再點已接受的連結 → 設定密碼畫面 → 輸入任意密碼送出 → 409 → 登入步驟、密碼欄空白、「此邀請已完成設定，請用先前設定的密碼登入」；用先前的密碼登入成功。
  - （已登出）改簽章段一碼 → 設定密碼畫面（前端只解碼不驗簽）→ 送出 → `invalid_token` → 登入步驟（email 帶入）＋「邀請連結已失效…」。
  - （已登出）改 payload 段一碼 → 解碼失敗則步驟 1＋「邀請連結無法辨識…」；解碼成功則同上一條（簽章不符），到不了完善資料頁。
  - 第 8 天點連結 → 設定密碼畫面（前端不以裝置時鐘分流，裁決 Q）→ 送出 → `expired` → 登入步驟＋失效提示；走忘記密碼能設密碼並進完善資料頁。
  - 正式站送達核對的「各收 3 封」改用三個 `+alias` 位址（同一信箱 24 小時一封，Q2-14）；收完以 purge 的 `p_email` 清掉這些空殼（§5 R2-3b）。
- 不做：上游 E「不動」清單（`register_profile`、`/payuni/prepare`、`handle_new_user`、`validate_referral_code`、發獎鏈、`requireAuth`、
  `cancel-signup`）；admin 檔（「已邀請未註冊」欄、徽章、統計排除交 A1a，§8.2）。

## 2. 系統設計

### 2.1 `POST /referrals/invites`（需登入）

流程照上游 E 第 1～8 點；錯誤形狀照 `index.ts:2961` 的 `{ success: false, error: { code, message } }`（`:898` 的 `/referrals/validate`
是 `{ valid: false, … }`，只證明 `error.code` 的位置）。

| 狀態 | 回應 | 何時 |
|---|---|---|
| 202 | `{ accepted: true }` | 受理；**不寄的分支同形**（已驗證、自助註冊中、非 R2 的待驗證帳號、target 窗已滿、GoTrue `email_exists` 競態、5xx 對帳後判定已寄） |
| 400 | `invalid_email` | 正規化後不合文法或 > 254（文法見下）；GoTrue `email_address_invalid`／email 的 `validation_failed`（Q2-19 的明示例外：輸入錯不是寄送失敗，裁決 B） |
| 400 | `self_invite`／`consent_required` | 等於本人 `user.email`（同樣正規化後比對）／`consent !== true` |
| 400 | `restricted` | 推薦人姓名 `findForbiddenWord(name)` 命中；同時 `logSystemAlertOnce` |
| 401 | `{ error: '未授權' }` | 無效 token（既有慣例，`index.ts:891`） |
| 403 | `not_joined`／`restricted` | 未加入推薦計畫／停權或碼非 `active` |
| 429 | `rate_limited_hour`／`rate_limited_day` | per-user 短窗／日窗（裁決 G：拆兩個 code，不帶 `scope`） |
| 503 | `unavailable` | 資格讀取失敗、`find_auth_user_by_email` 失敗、`rateLimitStrict` 回 `error`、全站兩窗超額、GoTrue 對映表的 503 列、新建後蓋章失敗的補償 |
| 503 | `disabled` | `REFERRAL_EMAIL_INVITE_ENABLED !== 'true'`、`REFERRAL_INVITE_SECRET` 缺失、`FRONTEND_URL` 缺失 |

- **email 文法**（補足，審查 P2-31）：trim＋小寫後須符合 `^[^\s@",<>()\[\]\\;:]+@[^\s@",<>()\[\]\\;:]+\.[^\s@",<>()\[\]\\;:]+$`，
  拒顯示名稱、引號、角括號、逗號、空白；正規式放 `_shared/referral-invite-payload.ts` 前後端共用。GoTrue `validateEmail` 只做小寫＋
  `checkmail`，我們送出的字串就是它存入的字串，lookup 與 target 鍵的 `sha256` 才對得上。
- `FRONTEND_URL` 去結尾斜線再組連結（先例 `index.ts:87`、`:2721`）。
- `consent_version` 由伺服器蓋自己的常數（client 只送 `consent: true`）；部署時差見 §2.5。

**GoTrue 錯誤對映**（裁決 B；以 GoTrue 回應的 `error_code` 判斷，不靠狀態碼）：

| GoTrue 結果 | 回應 | 退額度 | 告警 |
|---|---|---|---|
| `email_exists`（lookup 後被驗證的競態） | 202 | 退 | — |
| `over_email_send_rate_limit` | 503 `unavailable` | 退 | ✓ |
| `email_address_invalid`、email 的 `validation_failed` | 400 `invalid_email` | 退 | — |
| `email_address_not_authorized`、401、403、其他 4xx | 503 `unavailable` | 不退（照裁決 B 字面） | ✓ |
| 5xx、逾時（`AbortSignal.timeout(10_000)`）、網路例外 | **不確定結果**：先 `find_auth_user_by_email` 對帳（下段） | 依對帳 | 未寄時 ✓ |

**不確定結果的對帳**（補足裁決 B 的「先對帳再決定」）：GoTrue 的 `sendInvite` 只在寄信成功後才更新 `confirmation_sent_at`
（同一交易，`internal/api/mail.go`），所以以它前後比對判斷是否已寄：
- 新建路徑：查得到帳號＝交易已提交、信已寄 → 未蓋章就補蓋章 → 202（不退）；補蓋章失敗走補償。查不到 → 未寄 → 退額度＋告警＋503。
- 重寄路徑：`confirmation_sent_at` 比寄送前新 → 已寄 → 202；未變 → 未寄 → 以 lookup 回來的舊 `referral_invite` 回寫 metadata（審查 P2-30，
  避免歸屬與後備預填指向一封沒送達的信）＋退額度＋告警＋503。

**退額度矩陣**（裁決 A：只退本請求 bump 回 `allowed` 的 target 與 per-user 兩鍵，全站兩鍵一律不退；用原子 `refund_rate_limit`）：

| 結果 | 退哪些鍵 |
|---|---|
| 429 `rate_limited_hour` | 無（日窗沒 bump） |
| 429 `rate_limited_day`（短窗 allowed、日窗 limited） | 短窗 |
| 設計上不寄的 202（已驗證、自助註冊、非 R2 待驗證、target `limited`） | 無（per-user 額度是枚舉與濫用的上限；`limited` 的 target 鍵不動，否則清掉先到者佔住的名額） |
| 全站窗超額、`rateLimitStrict` 回 `error`（503） | target（若 allowed）＋per-user 兩鍵 |
| GoTrue 對映表「退」的三列、對帳判定未寄 | target＋per-user 兩鍵 |
| 新建後蓋章失敗的補償 | target（裁決 B；信多半已寄，per-user 不退） |

### 2.2 `POST /auth/invite/accept`（公開）

流程照上游 E accept 段。**硬順序：先 `updateUserById({ password })`、再 `generateLink({ type: 'invite' })`**——兩個理由：沒密碼的被邀請者
在 verify 時會被塞隨機密碼（G11）；設密碼會清掉既有 `confirmation_token`（G8），反過來會讓剛產生的 hash 失效。

| 狀態 | 回應 | 何時 |
|---|---|---|
| 200 | `{ tokenHash }` | 成功；同一 token 再打一次只重設同一密碼並換新 hash（單線可重入） |
| 400 | `invalid_token`／`expired` | 簽章不符、格式壞、body 缺欄／`x` 已過（伺服器時鐘） |
| 400 | `weak_password` | 長度 < 8 字元或 > 72 UTF-8 位元組的前置檢查（bcrypt 上限，數字待 R2-0 第 5 點實測）；GoTrue `weak_password`（訊息透傳 `translateSignUpError`） |
| 409 | `already_accepted` | 帳號已驗證；`generateLink` 回 422 `email_exists`（並行 accept 已讓帳號驗證） |
| 410 | `gone` | 帳號不存在、不是 R2 空殼（`referral_invite is null`）、`updateUserById` 回 404 `user_not_found`（與 purge 競態）、`generateLink` 回的 `user.id` 不等於 lookup 的 id（帳號在兩呼叫之間被刪、GoTrue 自建了新帳號——以 `deleteUser(新 id)` 清掉，審查 P1-3） |
| 429 | `rate_limited` | per-IP |
| 503 | `unavailable` | 查詢失敗、GoTrue 5xx／逾時 |
| 503 | `disabled` | **只看 `REFERRAL_INVITE_SECRET` 缺失**，不讀 `REFERRAL_EMAIL_INVITE_ENABLED`（裁決 O：kill switch 關寄信、不打死已寄出的合法連結） |

並行 accept（兩個分頁）：`UpdatePassword` 會登出該使用者全部 session（系統審查引 `internal/models/user.go:435-464`），後到者的密碼生效、
先到者剛建的 session 失效；前端 `verifyOtp` 失敗時照上游 D 以同一 token 重打一次 accept。列為已接受殘餘（§2.5），測試釘「並行兩次後只有最後成功
那次的密碼能登入」。

### 2.3 常數、模組、資料

**限流常數**（`index.ts` 常數區 `:258-273` 之後，`export`、窗口寫乘式；`rate-limit.unit.test.ts:78` 的 regex 會自動納入）：

| 組 | 鍵 | 常數 | 值 | 失效策略 |
|---|---|---|---|---|
| 每人短窗 | `referral-invite:${uid}` | `REFERRAL_INVITE_RATE_MAX`／`_RATE_WINDOW_SECONDS` | `5`／`1 * 60 * 60` | `rateLimit()` fail-open |
| 每人日窗 | `referral-invite-day:${uid}` | `REFERRAL_INVITE_DAILY_MAX`／`_DAILY_WINDOW_SECONDS` | `20`／`24 * 60 * 60` | 同上；短窗擋下不扣日窗 |
| 同一信箱 | `referral-invite-target:${sha256(email)}` | `REFERRAL_INVITE_TARGET_MAX`／`_TARGET_WINDOW_SECONDS` | `1`／`24 * 60 * 60` | `rateLimitStrict()`；超額 202 不寄 |
| 全站小時 | `referral-invite-global-hour` | `REFERRAL_INVITE_GLOBAL_HOUR_MAX`／`_GLOBAL_HOUR_WINDOW_SECONDS` | `100`／`1 * 60 * 60` | `rateLimitStrict()`；超額 503 |
| 全站日 | `referral-invite-global-day` | `REFERRAL_INVITE_GLOBAL_DAY_MAX`／`_GLOBAL_DAY_WINDOW_SECONDS` | `1000`／`24 * 60 * 60` | 同上 |
| accept per-IP | `invite-accept:${clientIp(c)}` | `INVITE_ACCEPT_RATE_MAX`／`_RATE_WINDOW_SECONDS` | `20`／`5 * 60` | `rateLimit()` fail-open |

常數全環境同值（上游 H 已改）。

**依賴方向**（審查 P1-9、P2-35）：常數留在 `index.ts`；`index.ts` 在路由註冊處組一次
`deps = { sb, rateLimit, logSystemAlertOnce, read, now, limits }`，交給 `createReferralInviteHandlers(deps)` 回傳
`{ invites: (c) => Promise<Response>, accept: (c) => Promise<Response> }`。`api/referral-invite.ts` **不得 import `./index.ts`**（以單元測試
讀原文斷言）。A1a 的 `api/deps.ts` 若先合併，`deps` 型別改引用它。

**限流原語**另放葉節點 `api/rate-limit-strict.ts`（注入 `sb`）：`rateLimitStrict(sb, key, max, windowSeconds)` 嚴格判 `data === true` →
`'allowed'`、`data === false` → `'limited'`、其餘（含 RPC error）→ `'error'`（既有 `rateLimit()` 的 `!== false` 不可沿用）；
`refundRateLimit(sb, key)` 呼叫 RPC、失敗只記 log 不拋。`bump_rate_limit` 內部 `exception when others then return true`
（`20260720000002_rate_limits.sql:49-51`）的殘餘照上游 E.5：鍵為固定格式，接受。

**`_shared/referral-invite-payload.ts`**（零依賴；前端 alias `@referral-invite-payload`，照 `@name-cases` 接 vite alias＋`tsconfig` paths＋include）
放：payload 型別與 `decodeReferralInvitePayload(token)`（不驗簽、壞了回 `null`）、`REFERRAL_INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60`、
`app_metadata.referral_invite` 的型別 `{ code: string; consent_at: string; consent_version: string; issued_at: string }`（ISO-8601 UTC；讀寫兩端共用，
審查 P2-41）、同意聲明文案（含 `{名}` 佔位）與 `REFERRAL_INVITE_CONSENT_VERSION`（文案一改就升版，裁決 P）、email 文法正規式。
TTL 放這裡而非 `index.ts` 的理由不變（四個消費者有三個在前端）；代價是擴充 `scripts/check-spec-drift.py` 的 `_load_sources` 並補 self-test 案例。

**`check-spec-drift` 十二條**＝五把 per-user／target／global 限流各「上限＋窗口」10 條＋TTL 天數＋purge 預設天數；accept per-IP 不納入
（與 `/auth/check-email` per-IP 同類，不是對使用者的承諾）。`constant_violations` 對同一條規格 regex 命中多個不同值直接判違規，所以 12 條
regex 各以範圍詞（同一推薦人／同一信箱／全站）錨定；規格書 §7.1 句型：「同一推薦人 1 小時內最多寄 5 封、24 小時內最多寄 20 封；同一信箱
24 小時內最多收到 1 封；全站 1 小時內最多寄 100 封、24 小時內最多寄 1,000 封；邀請連結 7 天內有效；7 天內未透過連結設定密碼即刪除該次邀請建立的
帳號」（裁決 D 的措辭）。每句隨常數所在的循環寫入（§5）。閘門句（§7.1「出示與分享」條）加「寄送邀請信」。

**metadata**：`app_metadata.referral_invite = { code, consent_at, consent_version, issued_at }`（**不存推薦人 uuid**，推薦人由 `code` 經
`referral_codes` 解回，漏斗以 code 歸戶，裁決 H）；`user_metadata = { referral_invite_name, referral_invite_url }`；不寫 `referred_by_code`；
重寄更新 `issued_at`（＝新邀請，裁決 C）；accept 時 `user_metadata: { referral_invite_url: null }`。

**新建路徑的順序**（裁決 B 的條件式）：R2-0 第 2 點（既存未驗證者「先 update metadata 再 invite」渲染新 metadata）成立 → 改
`auth.admin.createUser({ email, email_confirm: false, user_metadata, app_metadata })` 先蓋章、再 `inviteUserByEmail(email)`（走既存未驗證者的
重寄路徑）；不成立 → 維持上游 E.6 的 `inviteUserByEmail` → `updateUserById(app_metadata)`＋補償。兩條路共用 §2.4 差異 2 的空殼判準。

**purge**（`20261025000011`，上游 E＋裁決 C）：
- 函式 `purge_stale_referral_invites(p_older_than_days int default 7, p_email text default null) returns int`（回刪除筆數）、SECURITY DEFINER；
  revoke from anon／authenticated／public、**grant execute to service_role**（審查 P1-4）。
- 刪除條件：`email_confirmed_at is null and last_sign_in_at is null and raw_app_meta_data ? 'referral_invite'`，且不存在於 `payment_orders`；
  **計齡**以 `(raw_app_meta_data->'referral_invite'->>'issued_at')::timestamptz < now() - make_interval(days => p_older_than_days)`，cast 前以
  `~ '^\d{4}-\d{2}-\d{2}T'` 守住格式（壞值跳過，不讓單列壞值中斷整批）；**`p_email` 有值時不套天數**、只刪該信箱且符合其餘條件的空殼。
  不再要求 `invited_at is not null`（§2.4 差異 2）。
- audit 清理抽成同檔內部函式 `delete_auth_audit_for_users(p_user_ids uuid[])`：set-based 單次 `= any(p_user_ids)`，謂詞
  `payload->'traits'->>'user_id' = any(...) or payload->>'actor_id' = any(...)`（原始碼核對結果，待 R2-0 第 6 點以 hosted 實際形狀定案）；
  purge 在同交易呼叫；也 grant service_role，給補償路徑在 `deleteUser` 之後呼叫（審查 P1-6）。
- `cron.schedule('purge-stale-referral-invites', '23 3 * * *', …)`；寫法照 `20261017000001_rate_limits_prune.sql`（`:28` 函式、`:46` revoke、`:50` 排程）。

**refund**（`20261025000012`，裁決 A）：`refund_rate_limit(p_key text) returns void`、SECURITY DEFINER、
`update public.rate_limits set count = count - 1 where key = p_key and count > 0`；revoke from anon／authenticated／public、grant service_role。
窗口已翻轉時會退到新窗口的計數（少算一次），`count > 0` 守住不為負，接受。

**`find_auth_user_by_email`**：欄名以 §0 的權威為準；R2 讀 `id`、`email_confirmed_at`、`confirmation_sent_at`、`referral_invite`。

**API 契約**：`_shared/api-contract.ts` 末尾新增兩段——invites 段（`{ accepted: true }`＋code 聯集）隨循環 4a，accept 段（`{ tokenHash }`＋
code 聯集）隨循環 5；handler 以 `satisfies` 把關，測試以 `assertShape` 驗真實回應（審查 P2-39）。前端以 `extractApiErrorCode()`
（`src/utils/apiClient.ts:162`）分流。

### 2.4 與上游的差異（`e8c6080` 之後仍與總綱不同之處）

1. **R2-0 不擋開工**：上游 §8.1 R2 列的前置欄仍列「R2-0 結論」。裁決 E 改為不擋；押 hosted 行為的循環在 §5 標「待 R2-0 第 N 點」。
2. **空殼判準只看 `referral_invite`**：上游 E.4 寫「`invited_at is not null` 且 `referral_invite is not null`」、purge 謂詞也含 `invited_at is not null`。
   改為只要求 `email_confirmed_at is null` 且 `referral_invite is not null`（invites 重寄、accept、purge 三處一致）。理由：裁決 B 的條件式新建路徑
   （先 `createUser` 蓋章）在寄信成功前沒有 `invited_at`，若仍要求它，寄信失敗留下的已蓋章帳號既不會被重寄也不會被清除；`app_metadata` 只有
   service role 能寫，`referral_invite` 本身就足以證明是 R2 建的帳號，Dashboard 手動 Invite 與自助註冊帳號都沒有它。
3. **前端不以裝置時鐘判過期**（裁決 Q 的落實）：上游 D 被推薦人側仍寫「`x` 已過 → 2A 登入步驟」。改為解碼成功一律進 2B，`expired` 由 accept
   回應決定、才轉 2A＋失效提示；不另寫「可能已過期」的提示句（不新增文案，伺服器是唯一判準）。§1 的 J 改寫同此。
4. **入口判斷等既有 session 驗證 effect**（裁決 R）：上游 D 仍寫「先畫骨架等 `getSession()`」。改為等 `AuthPage.tsx:43-87` 的驗證 effect
   產出結果（§3.3）。
5. **清 query 用 router**：上游 D 寫 `history.replaceState`；改 `navigate({ search: '' }, { replace: true })`——BrowserRouter 察覺不到裸
   `replaceState`，`useSearchParams` 會繼續讀到 `invite`。
6. **旗標落點用 `.env.development`**（審查 P2-38）：上游 F 只說「建置旗標為真時才渲染」。dev 模式的旗標改由 repo 內 `.env.development`
   （`VITE_REFERRAL_EMAIL_INVITE=true`）提供，CI e2e、本機 e2e、journey 三個起 `npm run dev` 的地方都不必各設一次；production build 不讀它。
   旗標關時三處入口**維持現況**（直接 `shareReferralInvite`、不開卡）——這是本規劃對上游 D「三處都開卡」與 F「表單只在旗標開時渲染」之間
   空白的詮釋（審查 P2-57）。
7. **`App.tsx` 豁免抽成純函式**（審查 P1-10）：上游 D 寫「`App.tsx:160-164` 的豁免清單加一行」。`:162` 是 effect 內的行內比較、沒有測試可釘；
   改抽 `registrationFlow.ts` 的 `shouldRedirectToCompleteProfile(pathname)`，`App.tsx` 只呼叫它。

### 2.5 已接受的殘餘

- **`+tag`／Gmail 點號別名**可繞過「同一信箱 24 小時一封」：仍受 per-user 兩窗與全站兩窗約束；不做別名正規化（正規化會讓 lookup 與 GoTrue 存入值不一致）。
- **時間側通道**：已驗證帳號不打 GoTrue、回應較快；`/auth/check-email` 本就公開 `{ exists }`，不新增可得資訊。
- **並行 accept**：後到者密碼生效、先到者 session 失效（§2.2）。
- **`consent_version` 部署時差**：前端（Cloudflare）與後端（Supabase）分別部署，改聲明文案的 PR 合併後到兩邊都上線前，伺服器可能蓋新版號而畫面是舊文案；窗口以分鐘計，接受。
- **GoTrue log 管線**：每筆 auth 事件另寫一份到 Supabase log，purge 刪不到；信內告知段已加「系統紀錄依雲端服務商保存期限保存」、客服 SOP 同註（裁決 N）。

### 2.6 總綱段內殘留（讀到的新舊句並存，以裁決句為準；列給監工，本分支不改總綱）

E.4 仍寫「超額 429 `rate_limited` 帶 `scope`」（D 末句與裁決 G 已拆兩個 code）；E purge 的 WHERE 仍寫 `invited_at < now() - …`（同段前句與
裁決 C 以 `issued_at` 計齡）；E「migration 登記：兩支（`find_auth_user_by_email`、purge）」（§8.1 已改 purge＋refund）；F 內文仍寫「逾期未完成
註冊，本平台會刪除」（裁決 D 改「7 天內未透過連結設定密碼即刪除」，F 告知段已改）；D 被推薦人側仍寫「`x` 已過 → 2A」與「等 `getSession()`」
（裁決 Q、R）；D 推薦人側文案的 `rate_limited`（hour）、`not_joined`、`restricted` 三句沒講到「快速分享」（裁決 J：錯誤句必須講到）。

## 3. 架構影響

### 3.1 檔案

**新檔**：

| 檔案 | 職責 |
|---|---|
| `supabase/functions/_shared/referral-invite-payload.ts` | §2.3 所列共用型別、解碼、常數、聲明文案與版號、email 文法 |
| `supabase/functions/api/referral-invite-token.ts` | `signReferralInviteToken`、`verifyReferralInviteToken`（→ `ok` 或 `invalid`／`expired`）；secret 缺失即拋；照 `member-token.ts` 的可注入 `read` |
| `supabase/functions/api/rate-limit-strict.ts` | `rateLimitStrict`、`refundRateLimit`（葉節點） |
| `supabase/functions/api/referral-invite.ts` | `createReferralInviteHandlers(deps)`、資格 helper、GoTrue 對映、對帳、退額度矩陣、補償 |
| `supabase/migrations/20261025000011_purge_stale_referral_invites.sql`、`…000012_refund_rate_limit.sql` | §2.3 |
| `src/components/referral/InviteCard.tsx` | 邀請卡片（§4） |
| `src/hooks/useInviteAccept.ts` | accept → `verifyOtp` → `routeAfterVerifiedSession`；依賴 `routeAfterVerifiedSession`、`@contract`、`buildApiUrl`（公開端點沿用 `fetch(buildApiUrl(...))`，先例 `AuthPage.tsx:146`）、`classifyInviteAcceptError`；注入 supabase 與 fetch |
| `src/utils/routeAfterVerifiedSession.ts` | 從 `OTPVerificationPage.tsx:110-140` 抽出的五條分支；注入 `{ fetchProfile, navigate, showToast }` |
| `src/test-utils/backendConstants.ts`（＋同層測試） | 以 `node:fs` 讀 `index.ts`／migration 原文取常數；**抽不到即拋錯**（負向測試釘住，審查 P2-34）；給模板與卡片文案測試共用 |
| `supabase/email-templates/referral-invite.html` | 模板單一事實來源 |
| `.env.development` | `VITE_REFERRAL_EMAIL_INVITE=true`（§2.4 差異 6） |
| `e2e/features/referral_email_invite.feature` | 情境照上游 I，「回顯遮罩地址」改「回顯完整地址」（裁決 T） |

`index.ts` 只加：兩條路由註冊（`/referrals/invites` 在 `/referrals/join-program` `:943` 之後、`/auth/invite/accept` 在 `/auth/check-email`
`:625-659` 之後）、§2.3 的常數、組 `deps` 的幾行。`_shared` 只被 Deno 用到的匯出不會被 knip 報（`knip.json` 的 `project` 只有 `src/**`）。

**既有檔**：

| 檔案 | 改動 |
|---|---|
| `src/components/AuthPage.tsx` | invite 模式（§3.3）；2A 靜態提示；持久／暫時提示同一元件（§4） |
| `src/components/OTPVerificationPage.tsx` | `:110-140` 改呼叫 `routeAfterVerifiedSession`；recovery 分支 `:101-104` 留原處 |
| `src/App.tsx` | `:162` 改呼叫 `shouldRedirectToCompleteProfile`；`SIGNED_OUT` 分支（`:201`）加清 invite token |
| `src/utils/registrationFlow.ts` | 新增純函式 `resolveInviteEntry`、`classifyInviteAcceptError`、`shouldRedirectToCompleteProfile` |
| `src/components/CompleteProfile.tsx` | `:249-259` 的預填 effect 加 `app_metadata.referral_invite.code` 後備；非同步回來時以 functional `setState` 重判欄位仍空才填（審查 P2-54） |
| `src/components/referral/InviteFriendButton.tsx`（`:79`）、`InviteFriendPanelContent.tsx`（`:184-192`） | 旗標開時開卡片；閘門不變 |
| `src/utils/referralInvite.ts` | `isEmailInviteEnabled()`（讀旗標的單一出處）、invite token 的 `sessionStorage` 讀寫清（`pending_invite_token`）。不做 `maskEmail`（裁決 T） |
| `src/components/ui/dialog.tsx` | 關閉鈕對齊 `ui/sheet.tsx:77-80`：`pointer-coarse` 44px、名稱「關閉」（審查 P2-47；LegalDialog 一併受益） |
| `supabase/functions/_shared/api-contract.ts` | §2.3 兩段 |
| `scripts/check-spec-drift.py` | `_load_sources` 加一檔；`CONSTANTS` 加 12 條；self-test 加一案 |
| `e2e/mocks/backend_api_mock.py` | `mock_invite_accept(status, token_hash)`、`spy_invites()`、`set_invites_response(status, code)` |
| `e2e/mocks/supabase_auth_mock.py` | `spy_verify()`：斷言 `type=invite` 且帶 `token_hash` |
| `e2e/features/dashboard_smoke.feature` | `:13-19` 與 `:21-26` 兩條都多一步「在邀請卡按快速分享」 |
| `e2e/features/auth_signup.feature`、`registration_recovery.feature` | 情境照上游 I＋§5 循環 8 |
| `e2e/test_overflow_sweep.py` | 兩條 `SweepRoute`（審查 P1-19）：`/register?invite=<假 token>`（前端不驗簽，Python 不必算 HMAC）與開卡（`after_load`，先例 `_open_id_card_dialog` `:539`），資料帶長 email 與長姓名 |
| `.github/workflows/journey.yml` | `:348-353` 的 `supabase secrets set` 加 `REFERRAL_INVITE_SECRET="$(openssl rand -hex 32)"`、`REFERRAL_EMAIL_INVITE_ENABLED=true` |
| 文件 | ui-ux §13 第 5 條（改寫入口描述、**保留 #394 新增的揭露句子項**）；規格書 §4.1（邀請信入口列、Step 0 空殼註記）、§7.1（新段與閘門句）；`docs/supabase-setup-checklist.md`（Invite user 模板與**主旨欄**、兩支新函式、secret 與旗標、密碼強度值、客服 purge SOP 與 log 殘留註記、快速檢查表）；`supabase/README.md` 函數表（purge、refund、audit 清理三列）；`multi-step-flow-recovery.md`（外部連結進入中段） |

`ci.yml`、`e2e/conftest.py`、`e2e/journey/conftest.py` 不改（差異 6）。改 workflow 後跑 `python3 scripts/check-workflows.py`；新增測試跑
`python3 scripts/check-test-names.py`。

### 3.2 旗標與 secret 的環境落點

| 環境 | 前端 `VITE_REFERRAL_EMAIL_INVITE` | 後端 secret／env | 誰、何時 |
|---|---|---|---|
| vitest | `vi.stubEnv` 逐案切換（vitest 是 test mode，不讀 `.env.development`） | 不適用 | 測試自己 |
| api-tests（Deno） | 不適用 | 測試檔頂端 `Deno.env.set`（先例 `member-verify.test.ts:26`）；handler 每次請求經 `read` 讀，關閉案例可逐案切換 | 測試自己 |
| e2e（全 mock）、本機 `npm run dev` | `.env.development` | 全 mock | R2-2 |
| journey（拋棄式分支） | `.env.development`（journey 也起 `npm run dev`） | `journey.yml` 設定步驟注入 | R2-3a 提交，晉升 PR 實跑 |
| develop 與所有 PR 預覽 | Cloudflare Pages **Preview** 作用域（Pages 只有 Production／Preview 兩個作用域） | `supabase secrets set --project-ref ijcxnxhrziehdtkwausy …` | 業主，R2-3b |
| 正式站 | Cloudflare Pages **Production** 作用域 | `supabase secrets set --project-ref uhtwwxtazwqnlbejhprl …` | 業主，R2-3b（收信核對通過後才開前端旗標） |

**退場**：正式站開旗標穩定 4 週後另開小 PR 刪建置旗標與三處分支、`.env.development` 那一行；後端 kill switch 保留。

### 3.3 四契約與決策落點

| 契約 | 怎麼滿足 |
|---|---|
| 1 狀態可被查詢 | 帳號狀態在 GoTrue，accept 每次現查；推薦碼在 pending code（localStorage）與 `app_metadata` 後備兩處；**invite token 存 `sessionStorage`**（裁決 L）：只在網址沒有 `?invite`、路由是 `/register` 時還原，還原後照常走 `resolveInviteEntry` 與 session 判斷；accept 成功、`already_accepted`、「改用其他 Email 註冊」、解碼失敗、登出時清 |
| 2 每一步可重入 | 信中連結 7 天內可重點；accept 可重入；`verifyOtp` 失敗以同 token 重打一次 accept；已有 session → 既有導向；過期 → 2A＋忘記密碼。第二條回路（accept 設了密碼但沒 verify → `/register` → 2A 用該密碼登入 → `email_not_confirmed` → 既有 `resumeUnverifiedSignup` 重寄註冊驗證碼）原始碼成立（附錄 A G12、G17）；**由監工通知 R2-0 在第 8 點順測**，驗不到時只有全 mock e2e 覆蓋、列為未實測（審查 P2-59） |
| 3 錯誤分可復原與否 | `classifyInviteAcceptError(code)` → `stay2B`（`weak_password`、`rate_limited`、`unavailable`、`disabled`、無 code）／`to2A`（`expired`、`invalid_token`、`gone` 且有 email；`already_accepted` 另清密碼）／`toStep1`（無 email）（審查 P2-36） |
| 4 有副作用的動作需身分證明 | accept 零寄信，身分證明＝持有簽章；被推薦人沒有自助重寄入口（`multi-step-flow-recovery.md:138`）；寄信只在需登入的 invites 與需正確密碼的 `resumeUnverifiedSignup` |

**決策落點**：`resolveInviteEntry(payload)` → `{ kind: 'undecodable' } | { kind: 'valid', email, code }`、`classifyInviteAcceptError`、
`shouldRedirectToCompleteProfile` 三個純函式放 `src/utils/registrationFlow.ts`（該檔是「下一步去哪／錯誤怎麼分類」的單一決策來源，
`multi-step-flow-recovery.md` §4 第 2 條、§5）；`routeAfterVerifiedSession` 放獨立檔（帶注入副作用的 async 編排，混進去會破壞該檔「純函式」的承諾）。

**AuthPage invite 模式的約束**：
- 惰性初始值只做純讀取（網址的 `invite`，或依契約 1 從 `sessionStorage` 還原）＋解碼＋`resolveInviteEntry`；清 query 放 mount 時的
  `useLayoutEffect`（差異 5），同時把 token 寫進 `sessionStorage`。
- 入口判斷等既有驗證 effect（`AuthPage.tsx:43-87`）的結果（裁決 R）：把它改成產出 `'signed_in' | 'signed_out'`——`/auth/profile` 回 ok 或
  非認證性非 2xx 視為 `signed_in`（照既有：保留 session）；404／410／401 已 `signOut`、例外已 `signOut`、`getSession()` reject、
  **4 秒逾時**都視為 `signed_out`（審查 P1-18）。結果出來前畫骨架 `<output aria-busy="true" aria-label="載入中">`，形狀照 2B。
- `signed_in` → 不寫 pending code，照上游 D 的「你已登入」與既有導向；`signed_out` → 才 `savePendingReferral(c)`、`setEmail(e)`、`setStep(2)`。

### 3.4 撞檔與順序

照上游 §8.2：T1 排 R2 之後；admin 檔不動（交 A1a）；S7a 已合併、S7b 未開工。B（#394）與 #390 已合併，下列與它們共檔處照 develop 現況接續（審查 P2-37）：`vite.config.ts` alias 與
`tsconfig.json` paths／include（同一插入點，接在 `@recruitment-copy` 之後）、ui-ux §13 第 5 條（改寫時保留 B 的揭露句子項）、
`InviteFriendButton.tsx`／`InviteFriendPanelContent.tsx`（B 改 `shareReferralInvite` 簽名）、`src/utils/referralInvite.ts`。與 #390：
`supabase/README.md` 函數表各加列。與 A1a：`api-contract.ts` 不同區段。都是先合併者定；R2 rebase 後跑 `check-migration-versions.py`。

## 4. UI/UX

依據：`docs/ui-ux-guidelines.md` §1、§4、§6、§9、§10、§12.11、§12.13、§13 第 5 條。文案以上游 D（已含 2026-10-26 裁決 I、J、K、M、T）為準；本節補狀態、版面與 a11y。

**邀請卡片**（`ui/dialog`）：
- 逐字（裁決 K）：`DialogTitle`「邀請好友」；欄位「對方的 Email（選填）」；說明「填寫 Email，由 Uknow 代寄邀請信給對方；留空則用 LINE 等 App 分享你的
  邀請連結」，以 `aria-describedby` 掛在 email 欄。同意聲明照上游 D、文案常數在 `_shared`（§2.3）。
- **版面**（審查 P1-12）：`DialogContent` 加 `max-h-[90dvh] overflow-y-auto`（先例 `JoinReferralProgramDialog.tsx:89`）；手機貼上緣、不垂直置中；
  `onOpenAutoFocus` 改聚焦標題（`tabIndex={-1}`），不彈鍵盤；錯誤、結果出現時對該節點 `scrollIntoView({ block: 'nearest' })`。
  真機驗收加「375 寬、鍵盤開啟、填 email 後主鈕與結果可見」。
- **狀態**：

| 狀態 | 看得到什麼 | 主鈕與行為 |
|---|---|---|
| A 未填 email（trim 後為空） | 標題、說明、email 欄 | 「快速分享」→ `shareReferralInvite` **並關卡**，回饋照現行 toast（裁決 I；卡片關了 toast 就不在 `aria-hidden` 之下） |
| B 已填、未勾 | ＋同意聲明（`touchTarget="expanded"`、整列可點；`min-w-0 wrap-anywhere` 防長姓名撐版） | 「用 Email 邀請」；按下且未勾 → 不送出、勾選框 `aria-invalid`、焦點移到勾選框、live region「請先勾選同意聲明」 |
| C 已填、已勾 | 同 B | 「用 Email 邀請」→ 送出 |
| 在途 | email 欄 `readOnly`＋`aria-readonly`、勾選凍結；主鈕 `aria-disabled`＋文字「寄送中…」 | `onClick` 與 `onSubmit` 同樣擋重複送出；**不用 `Button` 的 `loading` prop**（它設原生 `disabled`，`button.tsx:180`）、停用外觀照 `SystemNotifications.tsx:325` 自補；關卡時 abort 請求 |
| 受理 | live region 三個 `<p>`（裁決 M），地址完整回顯（裁決 T）、以 `BreakableEmail` 呈現 | email 與勾選清空、主鈕回「快速分享」 |
| 寄不了（裁決 J 規則 1） | 錯誤句都講到「快速分享」（按鈕改名對讀報器無聲）：`rate_limited_hour`「每小時最多寄 5 封，請稍後再試，或改按下方『快速分享』」；`rate_limited_day`、`unavailable`、`disabled` 照上游 D；`restricted`、`not_joined`「暫時無法寄送，可改按下方『快速分享』」（裁決 J 字面；上游 D 這三句仍是舊句，§2.6） | 主鈕換「快速分享」，email 與勾選保留 |
| 必敗（裁決 J 規則 3：`disabled`／`restricted`／`not_joined`） | 錯誤句 | 本次開卡期間 email 區收合、主鈕固定「快速分享」，改 email 也不恢復 |
| 欄位錯（`invalid_email`／`self_invite`） | 錯誤句 | email 欄 `aria-invalid`＋`aria-describedby` 指向**同一個** live region 節點（不放第二份字）、焦點回 email 欄 |

- **live region**：常駐單一節點；每次送出先清空再寫入，同句也會重播；email 一改（以 `trim().toLowerCase()` 比對，與後端正規化一致）→ 清錯誤、
  主鈕回「用 Email 邀請」（裁決 J 規則 2）、取消勾選並寫入「Email 已變更，請重新勾選同意聲明」。email 欄加 `autoCapitalize="none"`
  `autoCorrect="off"` `spellCheck={false}`。卡片用 `<form noValidate onSubmit>`，送出前以 `_shared` 的文法正規式先檢查。
- **無 code 的失敗**（審查 P1-15）：`NETWORK_ERROR`、非 JSON 的 5xx、未知 code 一律映到 `unavailable` 那句並保留輸入；401 由 `apiClient`
  既有的 session 過期處理登出並導頁，卡片隨之卸載（全站一致，接受）。
- **關閉即重置**：`{open && <InviteCard/>}` 讓全部狀態隨關卡歸零（勾選是對這一次寄送的同意）。關閉鈕由 `ui/dialog` 的修正提供 44px「關閉」。
- 主鈕 `tone="flow"`；入口鈕「邀請好友」照 §12.11 仍是次要。旗標關時入口不開卡（§2.4 差異 6）。
- 數字綁常數：「7 天」由 `REFERRAL_INVITE_TOKEN_TTL_SECONDS` 算；「24 小時」「每小時最多寄 5 封」由 render 測試以 `backendConstants.ts` 讀
  `REFERRAL_INVITE_TARGET_WINDOW_SECONDS`、`REFERRAL_INVITE_RATE_MAX` 斷言相等。卡片全文不含 `RECRUITMENT_FORBIDDEN_WORDS`。
- ui-ux §13 第 5 條改寫為「旗標開啟時三處開同一張邀請卡，卡片的快速分享呼叫 `shareReferralInvite` 並關卡；同意聲明只在填了 email 時出現；
  任何一條路都不宣稱已送出」，保留 #394 的揭露句子項；旗標退場時刪「旗標開啟時」幾字。

**被推薦人側**（流程照上游 D，以 §2.4 差異 3、4、5 為準）：
- 提示一律同一個元件、同一位置（步驟上方）、`role="alert"`：持久提示（無法辨識、已失效、已完成設定）與 2B 的暫時性錯誤（`rate_limited`、
  `unavailable`、`disabled`、兩次 `verifyOtp` 失敗後的「請重新點信中連結」）共用；**換步驟或再次送出即清除**（審查 P2-48）。帶提示落地時
  不 `autoFocus` 欄位（`AuthPage.tsx:372`、`:415`），焦點先給提示（`tabIndex={-1}`）。accept 的 `disabled` 與 `unavailable` 同句、留在 2B。
- 2A 靜態提示「透過邀請信加入的話，請用信中連結；還沒設定密碼請用忘記密碼」：小字放在「忘記密碼？」那列**下方**（不放 `text-right` 內）、
  以 `aria-describedby` 掛在忘記密碼鈕；有持久提示時隱藏，避免兩條指令相反（審查 P2-49）。
- 「改用其他 Email 註冊」：`<button type="button">`＋連結樣式，照 `AuthPage.tsx:421-429`「忘記密碼？」並帶 `pointer-coarse:min-h-[44px]`；
  invite 模式 2B 按鈕列改「註冊」整寬、連結在其下方置中（原 `flex gap-3` 兩個 `flex-1` 少一顆會破版，審查 P2-50）。

**信件**（上游 F 全段，已含裁決 D、N 的措辭）。補：
- 排版（審查 P2-51）：側邊 padding 以**外層＋卡片兩層合計**單側 ≤ 24px（`confirm-signup.html:11` 外層已左右各 20px，要嘛降外層、要嘛卡片內 ≤ 4px）；
  純文字網址加 `word-break:break-all; overflow-wrap:anywhere`；個資告知九要素寫成「標籤：內容」逐列。
- 模板測試另斷言：信中年費金額等於 `YEARLY_PRICE`（`src/utils/constants.ts:14`，審查 P1-23）、客服信箱等於 `OFFICIAL_EMAIL`、「7 天內未透過連結
  設定密碼即刪除」字樣、「系統紀錄依雲端服務商保存期限保存」字樣、padding 合計值、網址斷行樣式。
- **主旨**是 Dashboard 的獨立欄位、不在 html 內（審查 P1-24）：checklist 的 Invite user 一節與快速檢查表各加「主旨欄＝你收到一封 Uknow 的邀請」，
  R2-3b 的貼模板步驟同列。

## 5. 階段切分（給 TDD 用）

每個循環一個 `test(red)` → 綠燈 commit；後端測試名照 `.claude/rules/test-naming.md`。每個綠燈 commit 帶該循環自己的規格書句子與 spec-drift 規則
（`constant_violations` 抽不到句子會紅）。開工條件照裁決 F；#390、#394 已於 2026-10-26 合併，前置不再擋任何循環，下表「開工條件」欄只剩循環間的依賴。

| # | 循環 | 測試落點與驗證標準 | 開工條件 | 待 R2-0 |
|---|---|---|---|---|
| 0 | **R2-0 spike** | 外部 spike，結論由監工貼入 progress.md，不在本分支做 | — | — |
| 1 | token 模組＋`_shared/referral-invite-payload.ts`＋spec-drift TTL 規則與 §7.1 TTL 句 | `api/referral-invite-token.unit.test.ts`：簽→驗、過期、竄改 payload 段／簽章段、secret 缺失拋錯、驗章走 `crypto.subtle.verify`、簽出的 token 經 `_shared` 解碼得回 `{e,c,x}`；`check-spec-drift.py --self-test` | 無 | — |
| 2 | 兩支 migration（purge＋audit 清理函式、refund）＋spec-drift purge 規則與句子 | `api/referral-invite-purge.test.ts`：**對本機 GoTrue 真做** invite、`updateUserById`、`generateLink`、`deleteUser` 後 purge，斷言 `auth.audit_log_entries` 沒有任何 `payload::text` 含該 email；各刪除條件各自不誤刪；以 `issued_at` 計齡且 **accept 後不延壽**；**新建空殼立刻 `p_email` 即刪**、已驗證帳號不被刪、有 `payment_orders` 者不刪；回傳筆數；grants 三角色＋service_role 為真；`cron.job` 有列；`TTL 天數 ≤ purge 預設`。`api/refund-rate-limit.test.ts`：退一、`count > 0` 守衛、grants | 無 | 第 6 點（audit 謂詞形狀、hosted postgres 權限） |
| 3 | `api/rate-limit-strict.ts`＋資格 helper | `api/rate-limit-strict.test.ts`：三態（以 `withRestTableFailure(['rpc/bump_rate_limit'], …)` 造 `error`；先例 `referral-validate.test.ts:234`）、`refundRateLimit` 走 RPC、失敗不拋；`api/referral-invite.test.ts` 資格三項含停權、碼非 active、讀取失敗 503 | 無 | — |
| 4a | invites 前半：disabled、資格、body 與文法、姓名 `findForbiddenWord`、per-user 兩窗（含日窗 limited 退短窗）、401＋invites 契約段＋spec-drift per-user 4 條 | 同檔；`assertShape`；`referral-invite.ts` 不 import `./index.ts` 的原文斷言 | — | — |
| 4b | invites 後半：lookup 四分支、target／global、新建與重寄、GoTrue 對映表、5xx 對帳、補償（含 audit 清理、`deleteUser` 失敗另告警）、重寄失敗回寫 metadata、退額度矩陣＋spec-drift target／global 6 條 | 同檔。GoTrue 失敗以 **deps 注入的 stub `sb`** 造（`withRestTableFailure` 只攔 `/rest/v1/`，審查 P2-27）。補：target `limited` 不動 target 鍵；**同信箱並行**（`Promise.all`）GoTrue 只被呼叫一次、兩者皆 202；**所有不寄分支無副作用**（GoTrue 未呼叫、`confirmation_token`／`invited_at`／metadata 不變、無新 target／global 列）；`raw_user_meta_data` 無 `referred_by_code`、`profiles.referred_by_*` 為 null；回應同形 table-driven | — | 第 1、2、7、9 點 |
| 5 | `POST /auth/invite/accept`＋accept 契約段 | 同檔：上游 I 的 accept 案例＋§2.2 補足（密碼上限、`user_not_found` → 410、`generateLink` 422 → 409、`generateLink` 回的 id 不符 → 清新帳號＋410、非 R2 待驗證 410、`disabled` 只看 secret）；以 accept 設的密碼 `verifyOtp` 後 `signInWithPassword` 成功（釘硬順序的正向案例）；並行兩次 accept 後只有最後成功那次的密碼能登入；反向順序案例保留作 GoTrue 升級的 canary | — | 第 3、4、5 點 |
| 6 | `routeAfterVerifiedSession` 抽取（行為不變） | `src/utils/routeAfterVerifiedSession.test.ts` 五分支；`otp_verification.feature` 不改且綠 | 無 | — |
| 7 | `registrationFlow.ts` 三個純函式 | `src/utils/registrationFlow.test.ts` table-driven：`resolveInviteEntry`（壞 base64、壞 JSON、缺欄、`v` 不是 1、有效；**不看 `x`**）、`classifyInviteAcceptError`（每個 code＋無 code）、`shouldRedirectToCompleteProfile`（`/auth/complete-profile`、`/auth/reset-password`、其他） | 循環 1 | — |
| 8 | AuthPage invite 模式＋`useInviteAccept`＋`App.tsx`＋2A 提示＋`sessionStorage` | `src/hooks/useInviteAccept.test.ts`（`renderHook`）、AuthPage 元件測試（上游 I 的案例＋`signed_in`／`signed_out`／逾時三入口、骨架、`sessionStorage` 還原與五個清除時機、**簽章被改 → `invalid_token` → 2A**、`rate_limited`／`unavailable`／`disabled` 留在 2B、提示換步驟即清、靜態提示在持久提示出現時隱藏）；e2e `auth_signup.feature` 四條、`registration_recovery.feature` 一條；mock `mock_invite_accept`、`spy_verify` | 循環 5（契約）、6、7 | — |
| 9 | InviteCard＋三處入口＋旗標＋`ui/dialog` 關閉鈕＋`backendConstants.ts` | `InviteCard.test.tsx`：表格每一列、live region 常駐與重播、關閉重置、長姓名與長網域、禁用字樣、數字綁常數；`InviteFriendButton.test.tsx`／`InviteFriendPanelContent.test.tsx`：**閘門**（未加入者仍是引導鈕、不開卡，審查 P1-22）與旗標開關各案；`dialog` 關閉鈕名稱與 class；`backendConstants` 負向測試；e2e `referral_email_invite.feature`、`dashboard_smoke.feature` 兩條、溢版巡檢兩條 | 循環 4a（契約） | — |
| 10 | CompleteProfile `app_metadata` 後備預填 | 元件測試：pending 有值時不讀 session；pending 空且 `app_metadata` 有碼 → 預填並驗證；使用者已開始輸入時不覆蓋；兩者皆空 → 不填 | 無 | — |
| 11 | 模板檔＋模板測試＋文件 | `src/utils/referralInviteTemplate.test.ts`（上游 F 的斷言＋§4 信件補充）；`check-spec-drift`、`check-document-naming` 綠 | — | 第 1、11 點（渲染與手機可讀） |
| R2-3a | **非 TDD，分支內**：journey 情境＋`journey.yml` secret 注入 | `cd e2e/journey && pytest --collect-only -q`、`python3 scripts/check-workflows.py` 驗形；**實跑在晉升 PR** | 循環 4b、5 | — |
| R2-3b | **非 TDD，合併後的業主操作**：見下表 | 晉升 PR 的 `journey-full` 綠；上游 J 的真機與送達核對 | 本分支合併 | 第 5、10 點（兩環境設定值） |

**R2-3b 步驟**（審查 P1-25；正式站開旗標不等 A1a，裁決 S）：

| # | 環境 | 動作 | 誰 | 先決 |
|---|---|---|---|---|
| 1 | develop | 本 PR 合併進 develop → CI 綠 → `deploy-supabase.yml` 部署，`/api/health` 的 `sha` 對上 | 自動 | — |
| 2 | develop | Dashboard「Invite user」貼模板與**主旨** | 業主 | 1 |
| 3 | develop | `supabase secrets set` 兩把（secret 用隨機值） | 業主 | 1 |
| 4 | develop | Cloudflare Pages **Preview** 設旗標、重新部署 develop | 業主 | 2、3 |
| 5 | develop | 上游 J 的真機驗收 | 業主 | 4 |
| 6 | 正式站 | 晉升 PR（develop → main）`journey-full` 綠後合併；核准正式站部署 | 業主 | 5 |
| 7 | 正式站 | 貼模板與主旨 | 業主 | 6 |
| 8 | 正式站 | `supabase secrets set` 兩把（**後端先開、前端旗標維持關**） | 業主 | 7 |
| 9 | 正式站 | 以業主自己的登入 token `curl POST /referrals/invites`，寄往自己 Gmail 與 Outlook 各三個 `+alias`、iCloud 一個；核對收件匣與 Authentication-Results（上游 H／J） | 業主 | 8；業主帳號已加入推薦計畫 |
| 10 | 正式站 | service role 以 `purge_stale_referral_invites(p_email => …)` 清掉第 9 步的空殼 | 業主或監工 | 9 |
| 11 | 正式站 | Cloudflare Pages **Production** 設旗標、重新部署 | 業主 | 9 通過 |
| 12 | 正式站 | 觀察 `system_alerts` 與「`issued_at` 超過 8 天的 R2 帳號數」（admin SQL；purge 失敗的可觀測訊號） | 監工 | 11 |

## 6. 開放問題（只列上游沒裁過的）

- [x] 1. 2B 重新整理丟 token → 已裁 L：`sessionStorage`（§3.3 契約 1）。
- [x] 2. 受理文案 → 已裁 M、T：三句、完整回顯（上游 D）。
- [x] 3. log 管線殘留 → 已裁 N：告知段加句、客服 SOP 註明。
- [x] 4. 前置未合併時先做哪些循環 → 已裁 F（§5 開工條件欄）。
- [ ] 5. **既有 `cancel-signup` 與後台刪帳號留下的 audit email**（審查 P1-6 建議列入）：GoTrue 刪使用者會寫 `user_deleted` 事件（含 email），R2 的 purge
      與補償路徑會清自己刪的 id，但既有 `cancel-signup`（`index.ts:792`）與其他刪帳號路徑不在 R2 範圍。**建議**另開 issue，用本工項新增的
      `delete_auth_audit_for_users` 接上，不在 R2 內處理。

## 7. 風險與回滾

- 兩道開關：後端 env `REFERRAL_EMAIL_INVITE_ENABLED`（關 → invites 回 503 `disabled`；**accept 不受影響**，已寄出的連結照常可用，裁決 O）；
  建置旗標 `VITE_REFERRAL_EMAIL_INVITE`（關 → 三處入口回到現況）。只關後端是即時 kill switch，只關前端要重建。
- purge 可手動呼叫（`select public.purge_stale_referral_invites(0)` 或帶 `p_email`，service role，回刪除筆數）；回滾不需刪 migration——兩支函式與
  cron 留著無害，要停排程用 `cron.unschedule('purge-stale-referral-invites')`。
- **接受**：A1a 合併前，後台會員列表與統計最長 7 天會出現 `name` 空、`registrationStep` 0 的邀請中帳號（裁決 S）；全站上限每日 1,000 封為其上界。
- 最壞情況：(1) 模板或主旨貼錯 → 正式站開前端旗標前的收信核對（R2-3b 第 9 步）擋這條。(2) 空殼累積（hosted 權限不足或 cron 失敗）→ R2-0 第 6 點驗權限；
  上線後 R2-3b 第 12 步觀察。(3) GoTrue 寄信額度吃緊 → 全站兩窗＋GoTrue 429 → 503＋退額度＋告警；仍惡化就關後端 env。

---

## 附錄 A：GoTrue 主張 ↔ 核對 ↔ R2-0 承接

核對方式：讀 `supabase/auth` master（`c3348e8`，2026-10-25 取得）原始碼；Supabase 官方文件站本環境連不到。「原始碼成立」不等於 hosted 實測成立，
hosted 行為一律由 R2-0 對應點承接；R2-0 結論貼入前，本規劃不把任何一條寫成已實測。

| # | 主張 | 原始碼核對 | R2-0 |
|---|---|---|---|
| G1 | `inviteUserByEmail` 建未驗證使用者、設 `invited_at` 與 `confirmation_sent_at`、以 Invite 模板寄信 | 成立：`invite.go`；`mail.go` `sendInvite` 寄成功後才 `UpdateOnly` 兩欄 | 1、11 |
| G2 | 模板 `{{ .Data }}` 只讀 user_metadata | 成立：`templatemailer.go` `InviteMail` | 1 |
| G3 | 已驗證 → 422 `email_exists` | 成立：`invite.go` | — |
| G4 | 既存未驗證 → 重寄、不套用新 data、覆寫 token 與 `invited_at` | 成立 | 2 |
| G5 | `sendInvite` 不受 `max_frequency`，受 `email_sent`；autoconfirm 時跳過 | 成立：`sendEmail` 的 limiter 包在 `!Autoconfirm` 內 | 7、9、10 |
| G6 | `updateUserById` 兩種 metadata 合併、null 刪鍵 | 成立：`models/user.go`、`admin.go` | 2、4 |
| G7 | 設密碼先過 `checkPasswordStrength` | 成立：`admin.go` | 5 |
| G8 | 設密碼會清掉 `confirmation_token` 等 pending token | 成立：`models/user.go` `UpdatePassword` | 4 |
| G9 | `generateLink(invite)`：既存未驗證重設 token、`confirmation_sent_at`、`invited_at`；已驗證 422；不寄信、不限流 | 成立（回應的 `hashed_token` 組裝段未讀） | 3 |
| G10 | `verifyOtp(token_hash, invite)` 以 `confirmation_sent_at`＋全域 OTP 效期判期 | 成立：`verify.go` | 4 |
| G11 | 沒密碼的被邀請者 verify 時被塞隨機密碼；`Confirm()` 清全部 one-time token | 成立：`verify.go` `signupVerify`；`models/user.go` `Confirm` | 4 |
| G12 | 密碼登入先驗密碼、密碼對才回 `email_not_confirmed` | 成立：`token.go` | — |
| G13 | `redirect_to` 不在允許清單 → 退回 Site URL 並丟 query | 部分（「丟 query」未讀）；R2 不依賴 | 12 |
| G14 | `/invite` 與 `/admin/generate_link` 無 IP 限流 | 未核；R2 不依賴 | — |
| G15 | invite／modify 事件的被邀請者 id 在 `payload.traits.user_id`；audit 另寫一份到 log 管線 | 成立：`audit_log_entry.go`；每次 accept 的 `generateLink` 與 `updateUserById` 各再加一列 | 6 |
| G16 | JWT 含 `app_metadata` 與 `user_metadata` | 成立：`internal/tokens/service.go`（裁決 H 已因此拿掉 uuid） | — |
| G17 | `resend(signup)` 對已被邀請、未驗證者照寄註冊驗證碼 | 成立：`resend.go` signup 分支只看 `IsConfirmed()` | 8（順測，§3.3） |
| G18 | postgres 在 hosted 能刪 `auth.users` 與 `auth.audit_log_entries` 並 cascade | 不屬原始碼範圍 | 6 |
| G19 | 新建邀請寄信失敗時不留帳號 | 成立：建使用者與 `sendInvite` 同一個 `db.Transaction` | 9 |
| G20 | `generateLink(invite)` 對不存在的帳號會自建 | 成立：`mail.go` `adminGenerateLink` 的 invite 分支在 `user == nil` 時 `signupNewUser`（§2.2 以 id 比對守住） | 3 |
| G21 | `UpdatePassword` 登出該使用者全部 session | 成立：`models/user.go` `UpdatePassword` 在 `sessionID` 為 nil（admin 更新即是）時呼叫 `Logout(tx, u.ID)` | 4（並行 accept） |
| G22 | 密碼上限（bcrypt 72 位元組）在 `checkPasswordStrength` 或 `SetPassword` 擋下、錯誤碼為何 | 未核（相關檔未下載） | 5（加測） |
| G23 | `email_address_not_authorized` 是寄件設定問題、回 400 | 成立：`mail.go` `sendEmail` 在設了 `AuthorizedAddresses` 白名單且收件地址不在其中時回 400 `email_address_not_authorized`（hosted 何時設這份白名單未核） | — |

## 附錄 B：總綱需修正處

總綱已於 #391 回填（含原本的 13 條）。本版新讀到的段內殘留見 §2.6。

## 附錄 C：裁決與審查條目落點

| 來源 | 落點 |
|---|---|
| A 退額度 | §2.1 退額度矩陣、§2.3 refund、§5 循環 2／3 |
| B GoTrue 對映 | §2.1 對映表與對帳、§2.3 新建路徑順序 |
| C purge 計齡 | §2.3 purge、§5 循環 2 |
| D 刪除措辭 | §2.3 規格句、§4 信件 |
| E R2-0 不擋 | §0、§2.4-1、§5「待 R2-0」欄 |
| F 先做的循環 | §5 開工條件欄、§6-4 |
| G 拆 code | §2.1、§3.3 契約 3 |
| H 不放 uuid | §2.3 metadata |
| I 快速分享即關卡 | §4 狀態 A |
| J 寄不了換快速分享 | §4 狀態表 |
| K 卡片逐字 | §4 |
| L `sessionStorage` | §3.3 契約 1、§5 循環 8 |
| M、T 受理三句、完整回顯 | §4 受理列 |
| N 系統紀錄句 | §2.5、§4 信件、§3.1 文件列 |
| O accept 只看 secret | §2.2、§7 |
| P `consent_version` | §2.3 `_shared`、§2.5 |
| Q 伺服器判過期 | §2.4-3、§1 驗收、§5 循環 7 |
| R 沿用既有 session 驗證 | §2.4-4、§3.3 |
| S 不等 A1a | §5 R2-3b、§7 |
| 審查 P1-3、4、6、9、10、12、15、17、18、19、21～25 | 各條文中以「審查 P1-N」標註 |
| 審查 P2-27～63 | 各條文中以「審查 P2-N」標註；P2-33、43、44、56 由裁決 Q、R、S、N 吸收；P2-61～63 已於 v1 更正 |
