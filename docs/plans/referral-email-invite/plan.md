# Email 邀請（R2）子規劃書

<!-- 由 /plan-feature 實例化。本檔只寫與上游的差異與補足，設計本體不複製。
     目錄的 plans-keep 標記在 progress.md 檔頭（整個目錄是一個鷹架單位）。 -->

**上游**：總綱 `docs/plans/platform-growth-and-trust/plan.md` §2.3A（A～K）、§8.1／§8.2、§8.6 #9～#13、§14 第 6 題、§16
（commit `1b9e709`＝#386 合併進 develop 的 merge commit）。讀法：`git show 1b9e709:docs/plans/platform-growth-and-trust/plan.md`。
下文「上游 D／E／F…」都指 §2.3A 的段。

**衝突優先序**：§2.3A D／K 與業主 2026-10-22／23 裁決 ＞ §2.3A I 表 ＞ §2.5／§2.7／§9／§11 的摘要列。本檔對上游的每一處改動都在
「差異」標明理由；上游沒寫的才算「補足」。

## 0. 現況（2026-10-25 開工核對）

| 項目 | 狀態 | 對本規劃的效果 |
|---|---|---|
| develop HEAD | `dc4a615`（#388 合併；#386＝`1b9e709`）；總綱已在 develop，規劃分支已刪 | 上游引用填 `1b9e709` |
| 前置 A：check-email 修正（`fix/auth-check-email-lookup`） | **PR #390，draft、未合併**（head `98c582e`）。分支上的 `supabase/migrations/20261025000001_find_auth_user_by_email.sql` 與 dispatch-prompts A 段 SQL 逐欄一致：回 `id`、`email_confirmed_at`、`invited_at`、`confirmation_sent_at`、`last_sign_in_at`、`has_password`、`referral_invite`，條件 `lower(email) = lower(p_email) and deleted_at is null`，只給 service_role | **R2-1 擋於前置**（開工條件＝#390 合併）。未合併期間欄名權威＝A 段 SQL。本分支不列第二支 migration、不重建同名函式 |
| 前置 B：R1a-3（`fix/referral-disclosure-wording`） | **未開工**：遠端無此分支、無 PR；`supabase/functions/_shared/recruitment-copy.ts` 不存在 | **依賴 B**：照 B 段的路徑與名稱規劃（`referralDisclosureSentence(name)`、`RECRUITMENT_FORBIDDEN_WORDS` 十一詞、alias `@recruitment-copy`），R2 不另建第二份陣列。用到它的循環（第 4、9、11）開工條件＝B 已合併 |
| R2-0 spike（dispatch-prompts D） | 本 prompt 與 progress.md 都沒有結論 | 視為不在；階段 0 標「外部 spike，待驗」；下文 GoTrue 主張一律以原始碼核對＋spike 點對照呈現，不寫成已實測 |

**總綱 C／E 引用行號重標**：C／E 引用的檔案在 `ddd8fd9`→`dc4a615` 之間只有 `src/App.tsx`（`:391` 一行註解，不移位）與
`e2e/features/dashboard_smoke.feature`（檔尾追加兩條情境）有改動（`git diff --stat ddd8fd9 dc4a615 -- <C／E 引用檔>`），所以
C／E 的行號在 `dc4a615` 上**全部仍有效**。逐條現算時另發現三處**原本就引錯**（不是漂移）：

| 上游引用 | 實際 | 處置 |
|---|---|---|
| E.7「先例 `check-email-rate-limit.test.ts:55-57`（service role 直接 `delete`）」 | `:55-57` 是 `update window_start`；`delete().eq('key', …)` 在 `:65`（另 `:130`） | 引用改 `:65`；且 delete 不能當全站鍵的退還，見 §2.4 差異 |
| E accept「無自助重寄入口（`multi-step-flow-recovery.md:51-54`）」 | `:51-54` 是「為什麼不在步驟 1 自動接續」的引文；契約 4 本文在 `:138` 起（§4），摘要在 `:61` | 引用改 `:138` |
| dispatch-prompts C「接線照 `@backfill-cases`：alias、`tsconfig.json` paths 與 include」 | `@backfill-cases` 只在 `paths`（`tsconfig.json:26`），不在 `include`（`:44-48` 只有 `api-contract.ts`、`name-validation-cases.ts`）；`@name-cases` 才是 alias＋paths＋include 三處齊 | 照 `@name-cases` 接線（§3.1） |

## 1. 使用者需求

- 需求本體：上游 A（推薦人在站內輸入對方 email → 對方從信件點連結直接進「設定密碼」→ 完善資料頁、推薦碼已帶入並驗證、
  畫面不顯示邀請人與推薦碼訊息）。與 R1b 作廢裁決的關係：上游 B。
- **已定、不重議**（上游 K 與 §13；本規劃不得重開，開放問題也不列）：
  - Q2-12 不問律師，G 的對齊直接做、原「待律師」句由業主承擔；方案 B 只是備案。
  - Q2-13 已加入推薦計畫且未停權即可寄；後端不另查會籍；失效會員的入口列第二期。
  - Q2-14 每人 5／小時、20／天；同一信箱 1／24 小時；全站 100／小時、1,000／天。
  - Q2-15 主旨固定「你收到一封 Uknow 的邀請」、人名在內文；模板在 Dashboard「Invite user」、版型同驗證碼信。
  - Q2-16 清除天數 7 天，與簽章效期一致；Q2-17 簽章效期 7 天。
  - Q2-18 揭露句小 PR（R1a-3）獨立先出，用語「推薦人」；刊登方案頁「下線」句隨該 PR。
  - Q2-19 寄送失敗回「暫時無法寄送」、退額度、記告警、不自動重試。
  - Q2-20 R2 先、T1 後。
  - Q2-21 三處「邀請好友」都開同一張邀請卡；一顆主鈕依有無 email 切換「快速分享」／「用 Email 邀請」；我的 QR 頁不另放表單；快速分享多一下是業主接受的代價。
  - Q2-22 同一信箱 24 小時內先到者生效；重寄＝再送一次表單；v1 不做邀請狀態清單。
  - Q2-23 第一版不做拒收名單；客服以 purge 的 `p_email` 立即刪除。
  - 用語稽核（2026-10-23）：使用者看得到的文案一律「推薦人」，不出現「傳銷商／直銷」；四份律師文件原文不改；服務類別「傳銷」保留；程式註解與內部文件的業務術語不改。
- 驗收：上游 J 原樣適用；本規劃只補 §5 各循環的自動化驗證標準。
- 不做：上游 §10 與 E「不動」清單（`register_profile`、`/payuni/prepare`、`handle_new_user`、`validate_referral_code`、發獎鏈、
  `requireAuth`、`cancel-signup`）；admin 檔（「已邀請未註冊」欄、徽章、統計排除交 A1a，§8.2）。

## 2. 系統設計

### 2.1 `POST /referrals/invites`（需登入）

流程照上游 E 第 1～8 點。下表是對外契約（`{ success: false, error: { code, message } }` 是既有慣例，`index.ts:901`、`:2964`）：

| 狀態 | 回應 | 何時 |
|---|---|---|
| 202 | `{ accepted: true }` | 受理；**不寄的分支同形**（已驗證、自助註冊中、非 R2 的待驗證帳號、target 窗已滿、GoTrue 422 競態） |
| 400 | `invalid_email` | trim＋小寫後格式不合、長度 > 254、body 不是 JSON；GoTrue 對該信箱回 400／422 的格式類錯誤（補足，見 2.4） |
| 400 | `self_invite` | 等於本人 `user.email`（同樣 trim＋小寫比對） |
| 400 | `consent_required` | `consent !== true` |
| 400 | `restricted` | 推薦人姓名命中 `RECRUITMENT_FORBIDDEN_WORDS`（上游 F；同時 `logSystemAlertOnce`） |
| 403 | `not_joined` | `referral_program_joined` 不為真 |
| 403 | `restricted` | 停權或碼非 `active`（合併成一句，不細分） |
| 429 | `rate_limited`＋`scope: 'hour' \| 'day'` | per-user 短窗／日窗 |
| 503 | `unavailable` | 資格讀取失敗（fail-closed）、`find_auth_user_by_email` 失敗、`rateLimitStrict` 回 `error`、全站兩窗超額、GoTrue 429／5xx、新建後寫 `app_metadata` 失敗（見 2.4） |
| 503 | `disabled` | `REFERRAL_EMAIL_INVITE_ENABLED !== 'true'`、`REFERRAL_INVITE_SECRET` 缺失、**`FRONTEND_URL` 缺失**（補足：連結由它組成，缺了會寄出 `undefined/register?...`） |

檢查順序照上游 E：disabled → 資格（403／503）→ body（400）→ 姓名禁用字（400）→ per-user 兩窗（429）→ 查帳號 → 決定寄才扣 target／global → 寄送。

### 2.2 `POST /auth/invite/accept`（公開）

流程照上游 E accept 段（**硬順序：先 `updateUserById({ password })`、再 `generateLink({ type: 'invite' })`**）。

| 狀態 | 回應 | 何時 |
|---|---|---|
| 200 | `{ tokenHash }` | 成功；同一 token 再打一次只重設同一密碼並換新 hash（可重入） |
| 400 | `invalid_token` | 簽章不符、格式壞、body 缺欄 |
| 400 | `expired` | `x` 已過 |
| 400 | `weak_password` | 長度 < 8 的前置檢查，或 GoTrue `weak_password`（原訊息透傳給 `translateSignUpError`） |
| 409 | `already_accepted` | 帳號已驗證 |
| 410 | `gone` | 帳號不存在、`invited_at is null`（自助註冊帳號）、**或 `referral_invite is null`（補足：非 R2 的待驗證帳號，見 2.4）** |
| 429 | `rate_limited` | per-IP |
| 503 | `unavailable` | 查詢失敗、GoTrue 5xx |
| 503 | `disabled` | env 關或 secret 缺 |

per-IP 限流先於 disabled（上游順序）；不寄信、不回 session（契約 4）。

### 2.3 常數、簽章與資料

**限流常數**（`index.ts` 常數區 `:258-273` 之後，`export`、窗口寫乘式；`rate-limit.unit.test.ts` 的 regex
`const (\w+_WINDOW_SECONDS) = ([\d\s*]+);` 會自動納入，`1 * 60 * 60` 可被它算出）：

| 組 | 鍵 | 常數 | 值 | 失效策略 |
|---|---|---|---|---|
| 每人短窗 | `referral-invite:${uid}` | `REFERRAL_INVITE_RATE_MAX`／`REFERRAL_INVITE_RATE_WINDOW_SECONDS` | `5`／`1 * 60 * 60` | `rateLimit()` fail-open |
| 每人日窗 | `referral-invite-day:${uid}` | `REFERRAL_INVITE_DAILY_MAX`／`REFERRAL_INVITE_DAILY_WINDOW_SECONDS` | `20`／`24 * 60 * 60` | 同上；短窗擋下不扣日窗 |
| 同一信箱 | `referral-invite-target:${sha256(email)}` | `REFERRAL_INVITE_TARGET_MAX`／`REFERRAL_INVITE_TARGET_WINDOW_SECONDS` | `1`／`24 * 60 * 60` | `rateLimitStrict()`；超額不寄、仍 202 |
| 全站小時 | `referral-invite-global-hour` | `REFERRAL_INVITE_GLOBAL_HOUR_MAX`／`REFERRAL_INVITE_GLOBAL_HOUR_WINDOW_SECONDS` | `100`／`1 * 60 * 60` | `rateLimitStrict()`；超額 503 |
| 全站日 | `referral-invite-global-day` | `REFERRAL_INVITE_GLOBAL_DAY_MAX`／`REFERRAL_INVITE_GLOBAL_DAY_WINDOW_SECONDS` | `1000`／`24 * 60 * 60` | 同上 |
| accept per-IP | `invite-accept:${clientIp(c)}` | `INVITE_ACCEPT_RATE_MAX`／`INVITE_ACCEPT_RATE_WINDOW_SECONDS` | `20`／`5 * 60` | `rateLimit()` fail-open |

常數全環境同值（見 2.4 差異 4）。

**簽章 token**：payload `{ v: 1, e, c, x }`，`base64url(JSON) + '.' + base64url(HMAC-SHA256)`，專用 secret
`REFERRAL_INVITE_SECRET`、缺失即拋、`crypto.subtle.verify`（照 `api/member-token.ts`，含可注入的 `read`）。
**TTL 常數放 `_shared/referral-invite-payload.ts`**（`export const REFERRAL_INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60`），
不放 `index.ts`——二選一的理由：「7 天」有四個消費者（後端簽章、InviteCard 受理文案、AuthPage 過期提示、模板測試），其中三個
在前端；`index.ts` 前端讀不到（npm:／jsr: 相依），放 `_shared` 才能兩邊直接 import 同一個值。代價是 R2-1 擴充
`scripts/check-spec-drift.py` 的 `_load_sources`（加這一個檔）並補一條 self-test 案例。

**`check-spec-drift` 十二條**＝五把 per-user／target／global 限流各「上限＋窗口」10 條＋簽章 TTL 天數 1 條（讀
`_shared/referral-invite-payload.ts`）＋purge 預設天數 1 條（讀 migration `p_older_than_days int default (\d+)`）。
**accept per-IP 不納入**：它與 `/auth/check-email` 的 per-IP 同類（匿名端點的防濫用參數，不是對使用者的承諾），check-email
的數字不在規格書、也不在 `CONSTANTS`；仍受 `rate-limit.unit.test.ts` 的「窗口 ≤ 2 天」守衛。規格書 §7.1 新段的句型要讓 12 條
regex 各抓到一個數字（例：「同一推薦人 1 小時內最多寄 5 封、24 小時內最多寄 20 封；同一信箱 24 小時內最多收到 1 封；全站
1 小時內最多寄 100 封、24 小時內最多寄 1,000 封；邀請連結 7 天內有效；7 天未完成註冊即刪除該次邀請建立的帳號」），閘門句
（§7.1「出示與分享」條）加「寄送邀請信」。

**metadata**（上游 E.6，不變）：`app_metadata.referral_invite = { by, code, consent_at, issued_at }`（本人不可改寫）；
`user_metadata = { referral_invite_name, referral_invite_url }`；不寫 `referred_by_code`。accept 時
`user_metadata: { referral_invite_url: null }`（GoTrue null 值刪鍵）。

**purge**：照上游 E——`purge_stale_referral_invites(p_older_than_days int default 7, p_email text default null)`、SECURITY
DEFINER、四條件（`invited_at is not null`、`email_confirmed_at is null`、`last_sign_in_at is null`、`raw_app_meta_data ? 'referral_invite'`）
＋天數、排除 `payment_orders` 有列者、同交易刪 audit 列、cascade `profiles`、`cron.schedule('purge-stale-referral-invites',
'23 3 * * *', …)`、revoke from anon／authenticated／public；寫法照 `20261017000001_rate_limits_prune.sql`（`:28` 函式、`:46` revoke、
`:50` 排程）。audit 謂詞見 2.4 差異 6。**檔名照 §8.1 登記值 `20261025000011_purge_stale_referral_invites.sql`**；R2-1 開工時若
`origin/develop` 已有更大版本號就改號，rebase 後跑 `python3 scripts/check-migration-versions.py`。

**`find_auth_user_by_email`**：欄名以 §0 的權威為準（`id`、`email_confirmed_at`、`invited_at`、`confirmation_sent_at`、
`last_sign_in_at`、`has_password`、`referral_invite`）。R2 只讀 `id`、`email_confirmed_at`、`invited_at`、`referral_invite`。

**API 契約**：兩支端點的成功回應 schema（`{ accepted: true }`、`{ tokenHash: string }`）與兩組 error code 字面值聯集放
`supabase/functions/_shared/api-contract.ts` 末尾新區塊（handler 用 `satisfies`，前端經 `@contract` 引用、以
`extractApiErrorCode()`（`src/utils/apiClient.ts:162`）分流）。§8.2 的 `api-contract.ts` 列是 A1a 的 admin 區塊；R2 加的是不同區段，先合併者定。

### 2.4 與上游 E 的差異（每條附理由）

1. **`rateLimitStrict` 回三態，不回 boolean**：`'allowed' | 'limited' | 'error'`。上游寫「RPC 錯誤回 false → 503」，但 target
   窗超額要回 202、RPC 錯誤要回 503，boolean 分不出兩者。另：`bump_rate_limit` 本身有 `exception when others then return true`
   （`20260720000002_rate_limits.sql:49-51`），DB 端例外在 SQL 內就被吞成放行，`rateLimitStrict` 只能對 PostgREST 層錯誤
   fail-closed。三把 strict 鍵都是固定格式（常數字串、sha256 hex），觸發那個分支的主因（超長鍵）不存在，殘餘接受；不另建 SQL 函式
   （本工項只有 purge 一支 migration）。
2. **退額度不用 `delete` 全站鍵**：上游 E.7 寫「退還 target／global 三鍵（`delete from rate_limits where key = …`）」。target 鍵
   上限 1，刪列恰好等於退回這一次；但全站兩鍵的列記著**所有人**這個窗口的計數，刪列等於把全站額度歸零——GoTrue 回 429
   （正是寄信額度吃緊時）就重置自己的保護，與 Q2-19「退額度」的本意相反。改為：target 刪列；global 兩鍵以樂觀更新退一
   （讀 `count` → `update count = count - 1 where key = … and count = <讀到的值>`，競態失敗就不退、不重試）。同一規則用在
   「已扣 target 後全站窗超額」與「GoTrue 422 競態」：凡是最後沒寄的，把本請求已扣的 strict 鍵退回。
3. **非 R2 的待驗證帳號視同自助帳號**：上游以 `invited_at is not null` 判定「我們建的空殼」。Dashboard 手動 Invite 的帳號也
   有 `invited_at`、但沒有 `app_metadata.referral_invite`；照上游會被 R2 重寄、寫上 metadata 後變成 purge 對象。空殼判準改為
   `invited_at is not null and referral_invite is not null`（與 purge 謂詞一致，這正是 `find_auth_user_by_email` 回
   `referral_invite` 的用途）；不符者 invites 回 202 不寄、accept 回 410 `gone`。
4. **限流常數全環境同值**：上游 H「各環境值小於 100 則該環境的常數同步調低」做不到——常數寫在程式碼裡、全環境一份。改為：常數照
   Q2-14；某環境的 `rate_limit_email_sent` 低於 100（新掛 SMTP 預設 30／小時）時，由 GoTrue 429 → 503＋退額度兜底。R2-0 第 10 點
   若顯示**正式站**低於 100，才回頭以業主裁決調低常數。
5. **新建路徑的補償**：GoTrue 的 `Invite` 把建使用者與寄信放在同一個交易（`internal/api/invite.go` 的 `db.Transaction`），寄信失敗
   不會留下帳號；但其後的 `updateUserById(app_metadata)` 是第二次呼叫，失敗時會留下一個沒有 `referral_invite` 的待驗證帳號——
   purge 抓不到、差異 3 又讓它永遠不被重寄。補：該呼叫失敗 → `auth.admin.deleteUser(id)` 補償＋`logSystemAlertOnce`＋503
   `unavailable`；信可能已寄出，對方點連結 accept 會回 410（文案同「邀請連結已失效」）；額度不退（信已寄）。
6. **purge 的 audit 謂詞初稿改為 `payload->'traits'->>'user_id' = id::text or payload->>'actor_id' = id::text`**：GoTrue 的
   `user_invited`／`user_modified` 事件 actor 是管理者、被邀請者 id 在 `traits.user_id`（`invite.go` 的 `NewAuditLogEntry`、
   `internal/models/audit_log_entry.go:117-131`）；被邀請者自己的事件（例：accept 後中途離開又登入）id 在 `actor_id`。仍以 R2-0
   第 6 點在 hosted 上 select 實際形狀定案。另知：GoTrue 每筆 audit 同時寫一份到 log 管線（`audit_log_entry.go:164-166` 的
   logrus），purge 刪不到，保存期依 Supabase 的 log 保留期——告知段「依郵件服務商保存」之外的第二個殘留處，列 §6 開放問題 3。
7. **GoTrue 400／422 格式類錯誤 → 400 `invalid_email`**（補足）：上游只定了 429／5xx／422 `email_exists`。GoTrue 自己的
   `validateEmail` 比我們的基本格式檢查嚴（例：hosted 內建 mailer 拒收保留網域，`journey.yml:336-338` 的註解有實例）；這類錯誤
   退額度、回 400 `invalid_email`，不記告警（不是全站性失敗）。

### 2.5 已接受的殘餘（寫明，不另做機制）

- **推薦人 uuid 被邀請人讀得到**：上游 E.6「推薦人 uuid 不進 `user_metadata`（被邀請人可讀）」的理由不完整——`app_metadata`
  一樣進 JWT（GoTrue `internal/tokens/service.go:83-84`、`:723-724`），被邀請人登入後可解出 `by`。`app_metadata` 的保證是**不可改寫**，
  不是不可讀。uuid 不含額外個資、推薦人姓名本就會在完善資料頁顯示，接受；上游理由句列「總綱需修正處」。
- **時間側通道**：已驗證帳號不打 GoTrue、回應較快，已登入的推薦人可由延遲猜出某信箱是否已是會員。`/auth/check-email` 本就對
  匿名者公開 `{ exists }`（per-IP 10／5 分），這條不新增可得資訊，接受。

## 3. 架構影響

### 3.1 檔案

**新檔**（上游 E／D／F 已定名，本表補職責邊界）：

| 檔案 | 職責 | 依賴 |
|---|---|---|
| `supabase/functions/_shared/referral-invite-payload.ts` | payload 型別、`decodeReferralInvitePayload(token)`（不驗簽、只讀 `e`／`c`／`x`、壞了回 `null`）、`REFERRAL_INVITE_TOKEN_TTL_SECONDS` | 零依賴 |
| `supabase/functions/api/referral-invite-token.ts` | `signReferralInviteToken`、`verifyReferralInviteToken`（→ `ok` 或 `invalid`／`expired`）；secret 缺失即拋 | `_shared` payload |
| `supabase/functions/api/referral-invite.ts` | 兩支處理函式、資格 helper、`rateLimitStrict`、退額度 helper；以 deps 物件注入 `sb`、`rateLimit`、`logSystemAlertOnce`、`read`（env）、`now` | 上兩者、`@recruitment-copy` 的 Deno 路徑 |
| `supabase/migrations/20261025000011_purge_stale_referral_invites.sql` | purge 函式＋cron | — |
| `src/components/referral/InviteCard.tsx` | 邀請卡片（§4） | `@recruitment-copy`、`@referral-invite-payload`、`shareReferralInvite` |
| `src/hooks/useInviteAccept.ts` | accept → `verifyOtp` → `routeAfterVerifiedSession`；注入 supabase 與 fetch | 下兩者 |
| `src/utils/routeAfterVerifiedSession.ts` | 從 `OTPVerificationPage.tsx:110-140` 抽出的五條分支；注入 `{ fetchProfile, navigate, showToast }` | `registrationFlow.nextRouteForStep` |
| `supabase/email-templates/referral-invite.html` | 模板單一事實來源（上游 F） | — |
| `src/test-utils/backendConstants.ts` | 測試用：以 `node:fs` 讀 `index.ts`／migration 原文、regex 取常數（模板與卡片文案測試共用；先例 `repoHygiene.test.ts:10`） | — |

`index.ts` 只加：兩條路由註冊（`/referrals/invites` 在 `/referrals/join-program` `:946` 之後、`/auth/invite/accept` 在
`/auth/check-email` `:625-662` 之後）與 §2.3 的常數。

**`_shared` 接線**：照 `@name-cases`（不是 `@backfill-cases`，§0）：`vite.config.ts` alias `@referral-invite-payload`、
`tsconfig.json` 的 `paths` 與 `include` 各一列。knip 的 `project` 只有 `src/**`，`_shared` 只被 Deno 用到的匯出不會被報。

**既有檔**：

| 檔案 | 改動 |
|---|---|
| `src/components/AuthPage.tsx` | invite 模式（§3.3）；2A「忘記密碼」旁靜態提示 |
| `src/components/OTPVerificationPage.tsx` | `:110-140` 改呼叫 `routeAfterVerifiedSession`；recovery 分支 `:101-104` 留原處 |
| `src/App.tsx` | `:162` 豁免清單加 `/auth/reset-password`（一行） |
| `src/components/CompleteProfile.tsx` | `:248-259` 的預填 effect：pending 為空時 `getSession()` 讀 `session.user.app_metadata.referral_invite.code`（只預填、仍走 `verifyReferralCode`、不寫 `referred_by_*`） |
| `src/components/referral/InviteFriendButton.tsx` | `:79` 的 `onClick` 改開卡片（旗標開時） |
| `src/components/referral/InviteFriendPanelContent.tsx` | `:183-191`（`share-referral-button`）同上 |
| `src/components/MyQrPage.tsx` | **不改**：它的「邀請好友」是分頁標籤（`:133`），按鈕在面板元件裡（差異：上游 §8.2 與 prompt 把它列為入口檔） |
| `src/utils/referralInvite.ts` | 新增 `maskEmail()`（受理文案用）與 `isEmailInviteEnabled()`（讀旗標，單一出處） |
| `src/utils/registrationFlow.ts` | 新增純函式 `resolveInviteEntry`（§3.3） |
| `supabase/functions/_shared/api-contract.ts` | §2.3 的契約區塊 |
| `scripts/check-spec-drift.py` | `_load_sources` 加 `_shared/referral-invite-payload.ts`；`CONSTANTS` 加 12 條；self-test 加一案 |
| `e2e/mocks/backend_api_mock.py` | `mock_invite_accept(status, token_hash)`、`spy_invites()`、`set_invites_response(status, code, scope=None)` |
| `e2e/mocks/supabase_auth_mock.py` | `spy_verify()`：斷言 `type=invite` 且帶 `token_hash` |
| `e2e/features/dashboard_smoke.feature` | `:13-19`（我的 QR 頁「share referral button」）與 `:21-26`（推薦格）**兩條**都多一步「在邀請卡按快速分享」（差異：上游 D 只列 `:21-26`） |
| `e2e/features/auth_signup.feature`、`registration_recovery.feature`；新 `referral_email_invite.feature` | 情境照上游 I |
| `.github/workflows/ci.yml` | 「啟動 dev server」step（`:386-395`）加 `env: VITE_REFERRAL_EMAIL_INVITE: 'true'` |
| `e2e/conftest.py` | `dev_server`（`:81-`）的 `Popen` 帶同一變數 |
| `.github/workflows/journey.yml` | `:348-353` 的 `supabase secrets set` 加 `REFERRAL_INVITE_SECRET="$(openssl rand -hex 32)"`（拋棄式分支每次隨機、不需 GitHub secret）與 `REFERRAL_EMAIL_INVITE_ENABLED=true`；`FRONTEND_URL` 已有（`:353`） |
| `e2e/journey/conftest.py` | `dev_server` 的 env（`:223-227`）加 `VITE_REFERRAL_EMAIL_INVITE: 'true'` |
| 文件 | ui-ux §13 第 5 條、規格書 §4.1／§7.1、`docs/supabase-setup-checklist.md`、`supabase/README.md`（函數表加 purge）、`multi-step-flow-recovery.md`（上游 §8.6 #10～#13） |

改了 workflow 跑 `python3 scripts/check-workflows.py`；改了測試跑 `python3 scripts/check-test-names.py`。

### 3.2 旗標與 secret 的環境落點

| 環境 | 前端 `VITE_REFERRAL_EMAIL_INVITE` | 後端 `REFERRAL_EMAIL_INVITE_ENABLED`／`REFERRAL_INVITE_SECRET`／`FRONTEND_URL` | 誰設、何時 |
|---|---|---|---|
| vitest | `vi.stubEnv` 逐案切換 | 不適用 | 測試自己 |
| api-tests（Deno，`supabase start`） | 不適用 | 測試檔頂端 `Deno.env.set`（先例 `member-verify.test.ts:26`）；handler 每次請求經注入的 `read` 讀 env，「env 關閉 503」案例可逐案切換 | 測試自己 |
| e2e（全 mock） | `ci.yml` 起 dev server 的 step 與 `e2e/conftest.py` 都帶 `true`；手動起 dev server 跑 e2e 的人要自己帶（寫進 `e2e/README.md` 本機跑法一句） | 全 mock，不適用 | R2-2 |
| journey（拋棄式分支） | `e2e/journey/conftest.py` 帶 `true` | `journey.yml` 設定步驟注入（上表） | R2-2 提交、晉升 PR 實跑 |
| develop | Cloudflare Pages develop 環境變數 | `supabase secrets set --project-ref ijcxnxhrziehdtkwausy …` | 業主，R2-3（先貼模板再開） |
| 正式站 | Cloudflare Pages Production 環境變數 | `supabase secrets set --project-ref uhtwwxtazwqnlbejhprl …` | 業主，R2-3（正式站收信核對通過後才開，上游 H） |

**旗標缺省＝現況**（補足）：`isEmailInviteEnabled()` 為假時三處入口**照現在直接呼叫 `shareReferralInvite`、不開卡片**——
只剩一顆「快速分享」的卡片等於白多一下，且這樣 R2-2 合併後、R2-3 開旗標前，hosted 環境的使用者看不到任何變化。旗標為真、
後端 env 關時，卡片照常渲染，送出得 503 `disabled` →「Email 邀請暫停中」（上游 F 的 kill switch）。

### 3.3 四契約（`docs/multi-step-flow-recovery.md` §4）

| 契約 | 怎麼滿足 | 缺口 |
|---|---|---|
| 1 狀態可被查詢 | 帳號狀態在 GoTrue（`invited_at`／`email_confirmed_at`／`has_password`），accept 每次以 `find_auth_user_by_email` 現查；推薦碼在 pending code（localStorage）與 `app_metadata` 後備兩處 | **token 只在元件 state**（上游 D）：讀到 `invite` 就清掉 query，2B 畫面重新整理後 token 消失、落回步驟 1 空白表單。可回的入口是信中連結（7 天內重點一次即可），但畫面不會提示——列 §6 開放問題 1 |
| 2 每一步可重入 | 信中連結＝入口，7 天內可重點；accept 可重入（重設同密碼、換新 hash）；`verifyOtp` 失敗以同 token 重打一次 accept；已有 session → 既有導向接手；過期 → 2A＋忘記密碼。**另一條原始碼成立、未實測的回路**：accept 設了密碼但 `verifyOtp` 沒完成的人改走 `/register` → check-email `exists` → 2A 用剛設的密碼登入 → GoTrue 回 `email_not_confirmed`（`token.go:181-182`，密碼先驗）→ 既有 `resumeUnverifiedSignup` 重寄註冊驗證碼（`resend.go` 的 signup 分支只看 `IsConfirmed()`）→ OTP 頁。這條不需新程式，e2e 以 `registration_recovery.feature` 既有步驟覆蓋 | 第二條回路不在 R2-0 十一點，建議 spike 第 8 點順測（§附錄 A G17） |
| 3 錯誤分可復原與否 | accept 的 code 分流（上游 D 失敗分流）：`weak_password`／`rate_limited`／`unavailable` 留在 2B 可重試；`invalid_token`／`expired`／`gone` → 2A 或步驟 1＋下一步提示；`already_accepted` → 2A 登入 | 無 |
| 4 有副作用的動作需身分證明 | accept 零寄信，身分證明＝持有簽章；被推薦人沒有自助重寄入口（`multi-step-flow-recovery.md:138`）；寄信只在 `POST /referrals/invites`（需登入）與既有 `resumeUnverifiedSignup`（需正確密碼） | 無 |

**決策落點**：
- `resolveInviteEntry(payload, { nowSec })` → `{ kind: 'undecodable' } | { kind: 'expired', email } | { kind: 'valid', email, code }`
  放進 **`src/utils/registrationFlow.ts`**：它是純函式、決定「從外部連結進到流程哪一步」，正是該檔「下一步去哪的單一決策來源」
  的職責（契約 2 的實作指標就指向它，`multi-step-flow-recovery.md` §4 第 2 條）；輸入是已解碼的 payload（解碼在
  `_shared`），該檔不必新增 import 依賴，測試照 `registrationFlow.test.ts` 的 node 環境。
- `routeAfterVerifiedSession` 放**獨立檔**（上游 D 已定名）：它是帶注入副作用的 async 編排（打 `/auth/profile`、導頁、toast），
  `registrationFlow.ts` 檔頭承諾「收斂成純函式」，混進去會破壞那個承諾；它只消費 `nextRouteForStep`。

**AuthPage invite 模式的兩個實作約束**（補足上游 D）：
- 惰性初始值只做**純讀取**（`new URLSearchParams(window.location.search).get('invite')`、解碼、`resolveInviteEntry`）；清 query 放
  mount 時的 `useLayoutEffect`，用 react-router 的 `navigate({ search: '' }, { replace: true })` 而不是裸 `history.replaceState`——
  BrowserRouter 察覺不到裸 `replaceState`，`useSearchParams` 會繼續讀到 `invite`。
- `savePendingReferral(c)`、`setEmail(e)`、`setStep(2)` 等副作用等 `getSession()` 回來、確認沒有 session 才做（上游 D「已有 session →
  不寫 pending code」）；等待期間畫骨架，所以首繪不閃步驟 1。

### 3.4 撞檔與順序

照上游 §8.2：T1 排 R2 之後（Q2-20）；admin 檔不動（交 A1a）；B 先改 `InviteFriendButton.tsx`／`InviteFriendPanelContent.tsx` 的
`shareReferralInvite` 簽名（加 `memberName`）、S7a 已合併（#385）、S7b 未開工，R2 rebase 以先合併者為準。本規劃新增的撞檔：
`src/utils/referralInvite.ts`（B 也改）與 `supabase/functions/_shared/api-contract.ts`（A1a 改 admin 區塊）——都是不同區段、
先合併者定。

## 4. UI/UX

依據：`docs/ui-ux-guidelines.md` §1（觸控 44px、輸入 16px）、§4（表單）、§9（`aria-disabled`、live region「可見字即播報字」）、
§12.11、§12.13、§13 第 5 條。文案逐字照上游 D；本節只補狀態、位置與規則對照。

**邀請卡片**（`ui/dialog`：內容短、單一表單；`ui/sheet` 在本 repo 用於長清單與詳情面板，如 `ReferralTreeView`、`MemberDetailSheet`）：

| 狀態 | 看得到什麼 | 主鈕 |
|---|---|---|
| A 未填 email | 區塊標題、email 欄（選填、`type="email"`、`inputMode="email"`、`autoComplete="off"`、手機 16px）、主鈕 | 「快速分享」→ `shareReferralInvite`（手勢在卡片內觸發） |
| B 已填、未勾 | ＋同意聲明勾選（上游 D 逐字、`touchTarget="expanded"`、整列 label 可點） | 「用 Email 邀請」；按下且未勾 → 前端擋下、勾選框 `aria-invalid`＋`FieldError`「請先勾選同意聲明」，不送出 |
| C 已填、已勾 | 同 B | 「用 Email 邀請」→ `POST /referrals/invites`；在途 `aria-disabled`＋文字「寄送中…」 |

- 主鈕 `tone="flow"`（預設）：卡片內唯一、推進卡片目的的動作；入口鈕「邀請好友」照 §12.11 仍是次要（「流程的起點也算次要，
  進了流程才有流程鈕」）。手機整寬、桌機文字寬靠右。
- 結果以主鈕下方**常駐**的單一 live region 呈現（§9），不用 toast；受理後 email 與勾選清空、主鈕回「快速分享」；email 一變即取消
  勾選；429／503 保留輸入（上游 D 三規則）。受理文案回顯 `maskEmail()` 的結果（`a***@example.com`），**不宣稱已送達**。
- **文案對照**：8 個 code、9 句（`rate_limited` 依 `scope` 兩句）＋受理一句，全部照上游 D。`disabled` 只在旗標開、後端關時看得到。
  受理文案的現行句有語意問題，列 §6 開放問題 2。
- 數字綁常數：卡片文案裡的「7 天」由 `REFERRAL_INVITE_TOKEN_TTL_SECONDS` 算；「24 小時」由 render 測試以
  `src/test-utils/backendConstants.ts` 讀 `REFERRAL_INVITE_TARGET_WINDOW_SECONDS` 斷言相等（前端讀不到 `index.ts`）。
- 用語一律「推薦人」；卡片全文與受理／錯誤文案不含 `RECRUITMENT_FORBIDDEN_WORDS`（render 測試逐詞斷言）。§13 第 5 條改寫為
  「旗標開啟時三處開同一張邀請卡，卡片的快速分享呼叫 `shareReferralInvite`；同意聲明只在填了 email 時出現；任何一條路都不宣稱已送出」。

**被推薦人側**（上游 D，無差異）：invite 有效 → 現有 2B「設定密碼」同元件同文案、Email 框唯讀；「上一步」換成墨色底線連結「改用其他
Email 註冊」（跳離流程的入口是連結，§12.13 第 2 條）；解碼失敗／過期／已接受三種持久行內提示（`role="alert"`）放在步驟上方；
2A「忘記密碼」連結旁的靜態提示「透過邀請信加入的話，請用信中連結；還沒設定密碼請用忘記密碼」。

**信件**：上游 F 全段（主旨、內文順序、個資告知九要素、排版數值、`{{ if }}` 分支、不用 `{{ .ConfirmationURL }}` 等四個變數）。
補：模板裡的客服信箱用 `OFFICIAL_EMAIL`（`src/utils/constants.ts:32`）的值，由模板測試斷言相等。

## 5. 階段切分（給 TDD 用）

每個循環一個 `test(red)` → 綠燈 commit。後端測試名照 `.claude/rules/test-naming.md`（`<主體>：<情境> → <預期>`）。

| # | 循環 | 測試落點 | 驗證標準 | 開工條件 |
|---|---|---|---|---|
| 0 | **R2-0 spike** | 外部 spike，結論由監工貼入 progress.md，不在本分支做 | — | — |
| 1 | token 模組＋`_shared` payload／TTL＋`check-spec-drift` TTL 規則 | `api/referral-invite-token.unit.test.ts`（簽→驗、過期、竄改 payload 段／簽章段、secret 缺失拋錯、驗章走 `crypto.subtle.verify`、簽出的 token 經 `_shared` 解碼得回 `{e,c,x}`）；`check-spec-drift.py --self-test` | 單元綠；spec-drift 新規則在規格書句子寫入前紅、寫入後綠 | **R2-1 擋於前置**（#390 合併） |
| 2 | purge migration | `api/referral-invite-purge.test.ts`（四個 WHERE 條件各自不誤刪、天數邊界、`p_email` 只刪該空殼、有 `payment_orders` 者不刪、audit 列同刪、cascade `profiles`、grants 三角色、`cron.job` 有該列）；spec-drift purge 規則 | 全綠；本機不能 `supabase start` 時以 CI `api-tests` 為準並註明 | 同上 |
| 3 | 資格 helper＋`rateLimitStrict`＋退額度 helper | `api/referral-invite.test.ts`（資格三項含停權、碼非 active、讀取失敗 503；`rateLimitStrict` 三態——以 `withRestTableFailure(['rpc/bump_rate_limit'])` 造 `error`；target 刪列恰退一次；global 樂觀退一、競態不退） | 全綠 | 同上 |
| 4 | `POST /referrals/invites`＋契約區塊＋規格書 §7.1 新段與閘門句＋spec-drift 10 條 | 同檔（上游 I 的 invites 全部案例＋本規劃補：非 R2 待驗證帳號 202 不寄、`FRONTEND_URL` 缺失 503、新建後寫 `app_metadata` 失敗 → `deleteUser` 補償＋503、GoTrue 400 格式錯 → 400 退額度、已扣 target 後全站窗超額 → 退 target） | 全綠；回應同形 table-driven 比對 status 與 body 全等 | 同上＋**B 已合併**（姓名檢查） |
| 5 | `POST /auth/invite/accept` | 同檔（上游 I 的 accept 全部案例＋補：`referral_invite is null` 的待驗證帳號 410、先 generateLink 再設密碼會讓 `verifyOtp` 失敗——反向順序的負向案例，釘住硬順序） | 全綠；以 accept 設的密碼 `signInWithPassword` 成功 | 同上 |
| 6 | `routeAfterVerifiedSession` 抽取（行為不變） | `src/utils/routeAfterVerifiedSession.test.ts`（五分支：無 session、200、401、其他非 200、例外） | 新測試紅→抽取後綠；`otp_verification.feature` 不改且綠 | 無（不依賴 R2-1） |
| 7 | `resolveInviteEntry`＋payload 解碼 | `src/utils/registrationFlow.test.ts`（table-driven：壞 base64、壞 JSON、缺欄、`v` 不是 1、`x` 已過、有效） | 全綠 | 第 1 循環（`_shared` 檔） |
| 8 | AuthPage invite 模式＋`useInviteAccept`＋`App.tsx` 豁免＋2A 靜態提示 | `src/hooks/useInviteAccept.test.ts`（`renderHook`）、`AuthPage` 元件測試（jsdom：上游 I 列的全部案例）、`src/App.tsx` 豁免以既有 App 測試或新案例釘；e2e `auth_signup.feature` 四條、`registration_recovery.feature` 一條；mock `mock_invite_accept`、`spy_verify` | vitest 綠；e2e 以 CI 為準 | 第 6、7 循環 |
| 9 | InviteCard＋三處入口＋旗標＋`maskEmail` | `src/components/referral/InviteCard.test.tsx`（三狀態、同意必勾、勾選重置三規則、9 句文案、live region 常駐、44px、旗標關不開卡片、禁用字樣）；`InviteFriendButton.test.tsx`／`InviteFriendPanelContent.test.tsx` 各加旗標兩案；`referralInvite.test.ts` 加 `maskEmail`；e2e `referral_email_invite.feature`＋`dashboard_smoke.feature` 兩條改步驟；`ci.yml`／`e2e/conftest.py` 帶旗標 | vitest 綠；`check-workflows.py` 綠；e2e 以 CI 為準 | **B 已合併**（揭露句、禁用字樣、`shareReferralInvite` 新簽名） |
| 10 | CompleteProfile `app_metadata` 後備預填 | `CompleteProfile` 元件測試（pending 有值時不讀 session；pending 空且 `app_metadata` 有碼 → 預填並驗證；兩者皆空 → 不填） | 全綠 | 無 |
| 11 | 模板檔＋模板測試＋文件 | `src/utils/referralInviteTemplate.test.ts`（上游 F 的斷言全部＋`OFFICIAL_EMAIL`；天數與 24 小時以 `backendConstants.ts` 比對）；文件依 §3.1 文件列 | 全綠；`check-spec-drift`、`check-document-naming` 綠 | **B 已合併** |
| R2-3 | **非 TDD**：業主貼模板（develop → 正式站）、設 secret、開 env 與建置旗標；正式站收信核對（上游 H／J）；journey 一條（情境、`journey.yml`、journey conftest 隨本分支 PR 提交，以 `cd e2e/journey && pytest --collect-only -q` 與 `check-workflows.py` 驗形；**實跑在晉升 PR**）；真機驗收（上游 J） | journey：上游 I 的 R2-3 列 | 晉升 PR 的 `journey-full` 綠 | R2-1、R2-2 合併 |

第 6、7、10 循環不依賴前置，若 R2-1 久擋可先做（同分支、同一條 PR）。是否允許在 R2-1 擋著時先做前端循環，由業主決定（§6 開放問題 4）。

## 6. 開放問題（只列上游沒裁過的）

- [ ] **1. 2B 重新整理後 token 消失（契約 1）**：上游 D 把 token 放元件 state、讀到即清 query。重新整理 2B 會落回步驟 1 空白表單，
      對方得回信箱重點連結。兩案：(a) 照上游，靠信中連結重入；(b) token 另存 `sessionStorage`（分頁關閉即清，accept 成功、
      「改用其他 Email 註冊」、解碼失敗時清），重新整理回到 2B。**建議 (b)**：成本是一個 key，與 `formDraft` 選 `sessionStorage`
      的隱私取捨同型；LEG-11 要防的是網址列、瀏覽紀錄與 referrer，(b) 不碰這三處。
- [ ] **2. 受理文案語意**：上游 D「對方會在 7 天內收到一封由 Uknow 寄出的邀請信」讀起來像「7 天內會寄到」，但信是當下寄（或不寄），
      7 天是連結效期；也與「不宣稱已送達」的原則有張力。**建議**改為「已受理邀請（寄往 a***@example.com）。若對方還沒有 Uknow 帳號、
      且 24 小時內沒收過邀請，會收到一封由 Uknow 寄出的邀請信，連結 7 天內有效。請提醒對方查看垃圾郵件匣」。D 是業主定案層，
      所以列業主裁決，不自行改。
- [ ] **3. GoTrue log 管線的 email 殘留**：每筆 auth audit 事件另寫一份進 Supabase log（§2.4 差異 6），purge 刪不到。要不要在信內
      告知段把「系統紀錄依雲端服務商保存期限保存」併入（現句只寫郵件服務商）？業主承擔層級的措辭，列裁決。
- [ ] **4. R2-1 擋於前置期間能否先做前端循環 6、7、10**：監工的開工條件寫「R2-1 開工＝A 已合併」，沒提 R2-2 的獨立循環。

## 7. 風險與回滾

- 兩道開關：後端 env `REFERRAL_EMAIL_INVITE_ENABLED`（關 → 503 `disabled`，卡片顯示「Email 邀請暫停中」）；建置旗標
  `VITE_REFERRAL_EMAIL_INVITE`（關 → 三處入口回到現況，§3.2）。兩者獨立：只關後端是即時 kill switch（不需重建前端），只關前端要重建。
- purge 可手動呼叫（`select public.purge_stale_referral_invites(0)` 或帶 `p_email`，service role）；回滾不需刪 migration——函式與
  cron 留著無害（沒有 R2 帳號就刪不到任何列），要停排程用 `cron.unschedule('purge-stale-referral-invites')`。
- 最壞情況：(1) 模板貼錯 → R2 分支渲染空名或錯連結；正式站開 env 前的收信核對（上游 H）擋這條。(2) 空殼累積（purge 權限不足）→
  R2-0 第 6 點驗 hosted 權限；上線後 `system_alerts` 與 admin SQL 觀察 `invited_at` 超過 8 天的 R2 帳號數。(3) GoTrue 寄信額度被吃滿
  → 全站兩窗＋GoTrue 429 退額度＋告警；仍惡化就關 env。

---

## 附錄 A：GoTrue 主張 ↔ 核對 ↔ R2-0 承接

核對方式：讀 `supabase/auth` master（`c3348e8`，2026-10-25 取得）原始碼；Supabase 官方文件站本環境連不到（proxy 403），未查。
「原始碼成立」≠ hosted 實測成立，hosted 行為一律仍由 R2-0 對應點承接；R2-0 結論貼入前，本規劃不把任何一條寫成已實測。

| # | 主張（出處） | 原始碼核對 | R2-0 承接 |
|---|---|---|---|
| G1 | `inviteUserByEmail` 建未驗證使用者並設 `invited_at`、`confirmation_sent_at`，以 Invite 模板寄信（C） | 成立：`invite.go`、`mail.go` `sendInvite`（設兩欄後 `UpdateOnly`） | 1、11（實寄與渲染） |
| G2 | 模板 `{{ .Data }}` 只讀 user_metadata；有 `TokenHash`／`SiteURL`／`RedirectTo`（C） | 成立：`templatemailer.go` `InviteMail`（`"Data": user.UserMetaData`） | 1（`{{ if }}` 分支、無 `<no value>`） |
| G3 | 已驗證 → 422 `email_exists`（C） | 成立：`invite.go` 交易內 `isConfirmed` 分支 | — |
| G4 | 既存未驗證 → 重寄、不套用新 data、覆寫 token 與 `invited_at`（C、FACT-06） | 成立：既存使用者路徑不呼叫任何 metadata 更新；`sendInvite` 重設 `confirmation_token` 與 `invited_at` | 2（先 update 再重寄的繞法） |
| G5 | `sendInvite` 不受 `max_frequency`，只受 `email_sent`；autoconfirm 時跳過（C） | 成立：`sendInvite` 無 `validateSentWithinFrequencyLimit`；`sendEmail` 的 limiter 包在 `!config.Mailer.Autoconfirm` 內 | 7、9、10 |
| G6 | `updateUserById` 的兩種 metadata 合併、null 刪鍵（C） | 成立：`models/user.go` `UpdateUserMetaData`／`UpdateAppMetaData`；`admin.go` `adminUserUpdate` 呼叫兩者 | 2、4（null 刪鍵加驗） |
| G7 | 設密碼先過 `checkPasswordStrength`，不合規 `weak_password`（C） | 成立：`admin.go` `adminUserUpdate` 先 `checkPasswordStrength` | 5（兩環境設定值） |
| G8 | （新）設密碼會清掉 `confirmation_token` 等全部 pending token | 成立：`models/user.go` `UpdatePassword` 清 `ConfirmationToken`／`RecoveryToken` 等 → 反向順序（先 generateLink 再設密碼）會讓 hash 失效，是硬順序的第二個理由 | 4（反向順序記錄） |
| G9 | `generateLink(invite)`：不存在建立、既存未驗證重設 token／`confirmation_sent_at`／**`invited_at`**、已驗證 422、不寄信、不限流（C、FACT-05） | 成立（`mail.go` `adminGenerateLink` invite 分支）；回應帶 `hashed_token` 的組裝段未逐行讀 | 3 |
| G10 | `verifyOtp(token_hash, invite)` 以 `confirmation_sent_at` 與全域 OTP 效期判期（C） | 成立：`verify.go` 的 invite 與 signup 同分支用 `ConfirmationSentAt`＋`Mailer.OtpExp` | 4 |
| G11 | 沒密碼的被邀請者 verify 時被塞 64 字隨機密碼；`Confirm()` 清全部 one-time token（C、FACT-10） | 成立：`verify.go` `signupVerify`（`!HasPassword() && InvitedAt != nil`）；`models/user.go` `Confirm` 呼叫 `ClearAllOneTimeTokensForUser` | 4 |
| G12 | 密碼登入先驗密碼、密碼對才回 `email_not_confirmed`（`multi-step-flow-recovery.md` 的前提） | 成立：`token.go` 先 `Authenticate`、後 `IsConfirmed` | — |
| G13 | `redirect_to` 不在允許清單 → 退回 Site URL 並丟掉 query（C） | 部分：`adminGenerateLink` 不合法時用 `GetReferrer`；「丟 query」未讀到。R2 不依賴（不傳 `redirectTo`） | 12 |
| G14 | `/invite` 與 `/admin/generate_link` 只要管理者憑證、無 IP 限流（C） | 未核（`api.go` 未讀）；R2 不依賴 | — |
| G15 | （新）invite／modify 事件的被邀請者 id 在 `payload.traits.user_id`；audit 另寫一份到 log 管線 | 成立：`invite.go` 與 `adminGenerateLink` 都寫 `user_invited`（每次 accept 多一列）；`audit_log_entry.go` 的 payload 結構與 logrus 輸出 | 6（hosted 實際形狀、postgres 權限） |
| G16 | （新）JWT 含 `app_metadata` 與 `user_metadata` | 成立：`internal/tokens/service.go` 的 claims 結構與組裝 | — |
| G17 | （新）`resend(type: signup)` 對已被邀請、未驗證者照寄註冊驗證碼 | 成立：`resend.go` signup 分支只看 `IsConfirmed()` | **無對應點**——建議第 8 點順測（§3.3 契約 2） |
| G18 | postgres 角色在 hosted 能刪 `auth.users` 與 `auth.audit_log_entries` 並 cascade（E） | 不屬 GoTrue 原始碼範圍 | 6 |
| G19 | （新）新建邀請寄信失敗時不留帳號 | 成立：`invite.go` 把建使用者與 `sendInvite` 放同一個 `db.Transaction` → 退額度時不必清帳號；但其後的 `updateUserById` 不在交易內（§2.4 差異 5） | 9（429 時看有無殘留列） |

## 附錄 B：總綱需修正處（列給監工，本分支不改總綱）

1. 監工 prompt 所說的「E 段 purge 寫『R2-0 第 9 點驗可行性』」在 `dc4a615` 的 E（`plan.md:490`）已是「R2-0 第 6 點」，沒找到「第 9 點」——可能已在 #386 合併前修掉，請監工確認是否還有別處。
2. E.7 的退額度先例引 `check-email-rate-limit.test.ts:55-57`（那是 `update`），刪列在 `:65`；且「delete 全站鍵」會把全站額度歸零（§2.4 差異 2）。
3. E.5「`rateLimitStrict`：RPC 錯誤回 false」——boolean 分不出 target 超額（202）與錯誤（503），且 `bump_rate_limit` 內部例外已被 SQL 吞成放行（§2.4 差異 1）。
4. E.6「推薦人 uuid 不進 `user_metadata`（被邀請人可讀）」——`app_metadata` 一樣進 JWT，保證是不可改寫、不是不可讀（§2.5）。
5. E accept 的契約 4 引用 `multi-step-flow-recovery.md:51-54` 應為 `:138`。
6. E「已存在未驗證且 `invited_at is not null`（我們建的空殼）」缺 `referral_invite is not null`，Dashboard 手動 Invite 的帳號會被誤當空殼（§2.4 差異 3）。
7. E purge 的 audit 謂詞初稿 `payload->>'user_id'`：原始碼顯示 invite 事件在 `payload->'traits'->>'user_id'`（§2.4 差異 6；仍待 spike 第 6 點）。
8. H「R2-0 確認各環境值後若小於 100 則該環境的常數同步調低」——常數全環境一份，做不到逐環境調（§2.4 差異 4）。
9. D「`dashboard_smoke.feature:21-26` 多一步」漏了 `:13-19`（我的 QR 頁的分享情境也走入口鈕）。
10. §8.2 與 dispatch-prompts C 把 `MyQrPage.tsx` 列為入口檔；按鈕其實在 `InviteFriendPanelContent.tsx:183-191`，`MyQrPage.tsx:133` 是分頁標籤。
11. dispatch-prompts B／C「照 `@backfill-cases`：alias、paths 與 include」——`@backfill-cases` 不在 `tsconfig.json` 的 `include`，三處齊的是 `@name-cases`。
12. §16 處置表的摘要列殘留舊值：SYS-05 列「加小時窗 30」（已裁 100）、LEG-06 列「禁用陣列八詞」（現十一詞）。§16 是變更紀錄，是否要改由監工定。
13. E.1 的 503 `disabled` 條件缺 `FRONTEND_URL`（§2.1）。
