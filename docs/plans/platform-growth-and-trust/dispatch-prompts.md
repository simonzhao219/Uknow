# 施工派工 prompt（總綱 §8.1 第 1 波：check-email 修正、R1a-3、R2 規劃、R2-0 spike）

<!-- plans-keep: 跨 session 派工鷹架——業主 2026-10-25 裁決三件工作都另開 session、由監工 session 給 prompt；退場條件＝對應 PR 合併（或 spike 回報）後刪該段，四段皆刪時刪本檔 -->

每段都是「複製貼上即可」的完整 prompt，開給**全新 session**用。行號一律在開局 rebase 後現算
（總綱引用的行號是 2026-10-21 develop `ddd8fd9` 的，必漂）。四段彼此獨立；順序建議
A、B 立即並行，C 隨後，D 可與 C 並行。

---

## A. `/fix-bug`：`/auth/check-email` 只比對最新 50 位使用者

```text
/fix-bug `/auth/check-email` 只比對最新 50 位使用者——GoTrue admin users 列表不認 `search=` 參數，較舊的既有會員在登入頁被判「不存在」

## 開局
- 本 session 只做這一件事。分支 `fix/auth-check-email-lookup`：
  `git fetch origin develop && git checkout -B fix/auth-check-email-lookup origin/develop`
- 走 /fix-bug 完整版（行為級：影響第 51 位之後所有既有會員能否登入）。Sonnet 即可。
- 不要整檔讀 `supabase/functions/api/index.ts`；先 `grep -n "check-email" supabase/functions/api/index.ts` 定位，再讀那一段。

## 症狀與根因（監工 session 已讀碼核對；請先寫紅燈測試重現，再修）
- `app.post('/auth/check-email')` 以 service key 打
  `GET {SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50&search=<email>`，再對回傳的 `users` 陣列做 `some(u => u.email === email)`。
- GoTrue 的 admin list users 端點讀的查詢參數是 `filter`（另有 `page`／`per_page`／`sort`），沒有 `search`；未知參數被忽略，
  所以這支永遠拿到「最新建立的 50 位使用者」（預設 `created_at desc`）。第 51 位以前註冊的會員會被判 `exists:false`。
- 前端後果：`src/components/AuthPage.tsx` 的 `handleCheckEmail` 收到 `exists:false` → `setIsExistingUser(false)` → 進 2B「設定密碼」表單 →
  既有會員對已存在的 email 跑 `supabase.auth.signUp`，而不是登入。
- 為什麼沒被抓到：本機與 CI 的資料庫從零起步、使用者數從未超過 50；`check-email-rate-limit.test.ts` 只釘限流；e2e 全 mock。

## 修法（總綱 §2.3A E 已定，R2 Email 邀請之後要共用這支函式——簽名照這裡，不要縮）
1. 新 migration `supabase/migrations/<開工日 YYYYMMDD>000001_find_auth_user_by_email.sql`：
   create or replace function public.find_auth_user_by_email(p_email text)
   returns table (
     id uuid,
     email_confirmed_at timestamptz,
     invited_at timestamptz,
     confirmation_sent_at timestamptz,
     last_sign_in_at timestamptz,
     has_password boolean,
     referral_invite jsonb
   )
   language sql security definer set search_path = public stable
   as $$
     select u.id, u.email_confirmed_at, u.invited_at, u.confirmation_sent_at, u.last_sign_in_at,
            coalesce(u.encrypted_password, '') <> '' as has_password,
            u.raw_app_meta_data -> 'referral_invite' as referral_invite
     from auth.users u
     where lower(u.email) = lower(p_email)
       and u.deleted_at is null   -- 本機 supabase start 後以 \d auth.users 核對此欄存在才加；不存在就拿掉這行
   $$;
   revoke execute on function public.find_auth_user_by_email(text) from anon, authenticated, public;
   grant execute on function public.find_auth_user_by_email(text) to service_role;
   檔頭註解寫「為什麼」（照 `20261017000002_validate_referral_code_revoke.sql` 的寫法）：GoTrue admin list 不支援以 email 精確查詢、
   `search=` 從未被讀過；只回 `/auth/check-email` 與日後 Email 邀請端點需要的欄位、不回其他個資；只給 service_role。
2. `/auth/check-email` 改成 `const { data, error } = await sb().rpc('find_auth_user_by_email', { p_email: email })`：
   - `error` → 503 `{ error: '暫時無法檢查 Email，請稍後再試' }`（fail-closed。現行 `!res.ok` 回 `{exists:false}` 會把暫時性故障變成與本 bug
     相同的症狀；`AuthPage.handleCheckEmail` 對非 2xx 已有錯誤提示、e2e `backend_api_mock.set_check_email_error()` 已有情境，前端不必改）。
   - 成功 → `{ exists: Array.isArray(data) && data.length > 0 }`。回應仍只有 `exists`，不回任何其他位元（理由見該處既有註解）。
   - 限流與 `clientIp` 不動；拿掉對 `SUPABASE_URL`／`SUPABASE_SERVICE_ROLE_KEY` 的直接 fetch。
3. 不動 `/auth/register`、`cancel-signup`、`requireAuth`、前端。

## 測試（紅燈先行；`touch .claude/tdd-lock` → commit `test(red)`，照 CLAUDE.md）
- 新檔 `supabase/functions/api/check-email-lookup.test.ts`（需 DB、`deno task test:db`；名稱照 `.claude/rules/test-naming.md`「<主體>：<情境> → <預期>」）：
  1. `check-email：比目標帳號更新的使用者超過 50 位 → 仍回 exists:true`——`createTestUser` 建目標帳號，再建 50 位，
     `POST /api/auth/check-email`（帶唯一 `x-forwarded-for`，寫法照 `check-email-rate-limit.test.ts`）斷言 `{exists:true}`；修法前這條必紅。
     結束用 `deleteTestUsers` 清掉 51 位。
  2. `check-email：不存在的 email → exists:false`。
  3. `check-email：大小寫不同的既有 email → exists:true`。
  4. `find_auth_user_by_email：anon／authenticated 直接呼叫 RPC → 權限被拒`（寫法照 `referral-validate.test.ts` 的 revoke 斷言）。
  5. RPC 失敗 → 503：寫得出就寫（`test-helpers.ts` 的 `withRestTableFailure` 是針對 REST 表的失敗注入，RPC 可能要另想辦法）；
     寫不出就在 fix.md 第 5 節寫明為何，不要硬湊。
- `rate-limit.unit.test.ts`、`check-email-rate-limit.test.ts` 不得變紅。`cd supabase/functions && deno fmt && deno lint && deno task check`。

## 同類掃描（/fix-bug 第 3 步，必做並寫進 fix.md）
- pattern：「呼叫外部 API 時帶了對方不認的參數名，回應形狀正常、沒有任何錯誤」。
- 掃 `grep -rn "admin/users" supabase/ e2e/ scripts/` 與 `grep -rn "auth\.admin\." supabase/functions`，每一處核對參數名與 GoTrue 文件。
  已知 `e2e/journey/tools/supa.py` 的 `list_users_by_email_prefix` 是分頁掃到空頁為止、不靠 `search`，沒有同一個病。
- 另有同病灶：小的本 PR 一併修，大的記 friction-log。

## 文件
- `supabase/README.md` 函數表加一列 `find_auth_user_by_email`（只給 service_role；`/auth/check-email` 與 Email 邀請端點共用）。
- 規格書 §4.1 Step 0 那列（`/auth/check-email` 只回 `{ exists }`）契約不變、不改；不在 §14 加「已修」旁白（`.claude/rules/document-writing.md`）。
- fix.md：`docs/plans/fix-auth-check-email-lookup/fix.md`（從 `docs/_templates/fix.md` 實例化）。PR 收尾前刪掉它（`check-plans-scaffold` 會紅）；
  「防線回填」一段升級進 `docs/plans/friction-log.md`——教訓：引用既有呼叫當範本前，先核對對方 API 的參數名。

## 收尾
- rebase 後 `python3 scripts/check-migration-versions.py`；`npm run check`；`bash scripts/framework-check.sh`。
- PR → develop（draft），標題 `fix(auth): /auth/check-email 改以 find_auth_user_by_email 查詢，不再只比對最新 50 位使用者`，內文照 PR 範本、附紅燈 hash。
- 回報監工 session：migration 檔名（總綱 §8.1 要登記）、是否找到同病灶、RPC 失敗測試有沒有寫出來。
```

---

## B. Plan Mode 小 PR：R1a-3 揭露句與用語

```text
Plan Mode 小 PR：推薦邀請的揭露句與用語（總綱 R1a-3）——邀請訊息與邀請卡加「本邀請由 Uknow 推薦人 {名} 發送」、刊登方案頁「下線」改寫、禁用字樣測試

## 開局
- 分支 `fix/referral-disclosure-wording`：`git fetch origin develop && git checkout -B fix/referral-disclosure-wording origin/develop`
- Plan Mode（不落檔）：先在對話裡列改動點與測試落點，審完再動手。Sonnet 即可。
- 業主裁決（已定、不要再問）：揭露句逐字「本邀請由 Uknow 推薦人 {名} 發送」；使用者看得到的文案一律「推薦人」、不出現「傳銷商／直銷」；
  律師定案的四份內容頁（`src/content/termsOfService.ts`、`participationContract.ts`、`businessManual.ts`、`referralRewardRules.ts`）原文一個字都不改；
  服務類別「傳銷」（`src/utils/constants.ts` `SERVICE_CATEGORIES`）是職業類別、保留；程式註解、內部文件、測試腳本的「上線／下線」業務術語不改。

## 改動點
1. `src/utils/referralInvite.ts`
   - 新增匯出 `referralDisclosureSentence(name)`：`本邀請由 Uknow 推薦人 ${name} 發送`；`name` 空白時退成 `本邀請由 Uknow 推薦人發送`。
     這是唯一一份揭露句，之後 Email 邀請的信件模板測試會引用同一個函式比對。
   - `buildInviteMessage(code, memberName)`：訊息最後加一行揭露句，前三行不動（既有測試釘了連結只出現一次、含「推薦碼 {碼}」、含「邀請你一起加入」）。
   - `shareReferralInvite` 加 `memberName` 參數（簽名由你定，呼叫端一起改）：`src/components/referral/InviteFriendButton.tsx`（`user.referralCode`／`user.name`）、
     `src/components/referral/InviteFriendPanelContent.tsx`（已有 `memberName`）。`buildLineShareUrl` 不動。
   - 同檔匯出 `RECRUITMENT_FORBIDDEN_WORDS = ['賺', '獎金', '收入', '傳銷', '直銷', '下線']`（手冊 4-1-2(5) 嚴禁誇大獎金／收入＋業主用語裁決），給測試用。
2. `src/utils/inviteCardImage.ts` `drawInviteCard`：
   - QR 下方現在只印粗體等寬推薦碼的那一行，改成「掃描加入 Uknow・推薦碼 」（一般字、`PIXEL_INK_MUTED`）＋碼（粗體等寬、`PIXEL_INK`）同一行——
     兩種字型拼一行的做法抬頭已有（`name` ＋ `' 的Uknow邀請'`），照抄；碼不得截尾，整行過寬就縮小字級。
   - 連結之下加揭露句（同一函式、灰字 18px），畫布高度隨之增加。
   - 顏色只准 `pixelColors.ts` 的三個常數（`inviteCardImage.test.ts`「只用現行色票上色」會驗）。
3. `src/content/listingPlans.ts:38`：「只要您的下線（或下線的下線）成功加入刊登或續約」→「只要您推薦的會員（及他們再推薦的會員）成功加入刊登或續約」。其餘不動。
4. `docs/ui-ux-guidelines.md`
   - §12.13「用語」條補：「使用者看得到的文案不出現『傳銷商／直銷』，一律『推薦人』；服務類別清單的『傳銷』是職業類別、保留」；
     例外清單由「三份法規性內容」改成四份（加推廣獎勵規章 `referralRewardRules.ts`）；刊登方案頁 `listingPlans.ts` 不是律師定案文件、不在例外內。
   - §13 第 5 條加一子項：邀請訊息與邀請卡固定含揭露句「本邀請由 Uknow 推薦人 {名} 發送」（手冊 4-1-2(2)），來源 `referralInvite.ts`；
     訊息、邀請卡與三顆入口的文案不得出現「賺／獎金／收入」（4-1-2(5)）。規則只寫這一份，規格書不重複。

## 測試（vitest，中文 it 名；先紅再綠）
- `src/utils/referralInvite.test.ts`：`buildInviteMessage` 含揭露句且名字在句中；名字空白退成無名版本；揭露句逐字等於「本邀請由 Uknow 推薦人 小明 發送」；
  訊息不含 `RECRUITMENT_FORBIDDEN_WORDS` 任一字樣（table-driven）；既有 `shareReferralInvite` 測試改簽名後全綠、`navigator.share` 收到的 `text` 含揭露句。
- `src/utils/inviteCardImage.test.ts`：用既有假 context 的手法記錄 `fillText`，斷言畫了說明行文字、碼、揭露句，高度比改前大；三個既有案例維持。
- 新檔 `src/content/listingPlans.test.ts`：內容不含「傳銷商」「直銷」「下線」、含「您推薦的會員（及他們再推薦的會員）」。不要對四份律師文件寫禁用字測試。
- `InviteFriendButton.test.tsx`、`InviteFriendPanelContent.test.tsx`：既有斷言照舊，`shareReferralInvite` mock 收到的參數含 `user.name`。
- e2e `dashboard_smoke.feature` 只斷言 toast 文案、不受影響；跑一次確認。
- `python3 scripts/check-test-names.py`、`npm run check`、`bash scripts/framework-check.sh`。

## 不做
- 不做 Email 邀請（R2）的邀請卡片／表單；不改 `InviteFriendPanelContent` 版面；不碰 `/auth/*` 後端；不改任何 `src/content/` 律師文件。

## 收尾
- PR → develop（draft），標題 `feat(referral): 邀請訊息與邀請卡加推薦人揭露句，刊登方案頁用語改「推薦的會員」`，內文列揭露句逐字與用語規則落點。
- 回報監工 session：揭露句函式的名稱與匯出路徑（R2 模板測試要引用）。
```

---

## C. `/plan-feature referral-email-invite`（R2 三段式第一段）

```text
/plan-feature referral-email-invite

## 開局
- 分支 `feature/referral-email-invite`：`git fetch origin develop && git checkout -B feature/referral-email-invite origin/develop`
  （三段式流程，守衛只認 `feature/*`；規劃書目錄名必須等於 slug）。
- 模型 Opus。本 session 只做規劃與審查，不寫任何產品程式碼；審查報告出來後停，等業主裁決。不要跑 `/tdd-implement`。
- 上游：總綱 `docs/plans/platform-growth-and-trust/plan.md` §2.3A（R2 Email 邀請，A～K 全部）、§2.4／§2.5 的 R2 列、§8.1／§8.2／§8.6 #9～#13、
  §14 第 6 題、§16。若 PR #386 還沒合併、develop 的總綱沒有 §2.3A，用
  `git fetch origin claude/platform-uiux-redesign-plan-oowvbe && git show origin/claude/platform-uiux-redesign-plan-oowvbe:docs/plans/platform-growth-and-trust/plan.md`
  讀那份（不要 merge 進來）。
- 前置狀態（開工時核對，寫進 plan.md「現況」）：
  - check-email 修正（`fix/auth-check-email-lookup`）合併了嗎——合併了就直接用 `find_auth_user_by_email`（簽名見總綱 §2.3A E 第一點），
    沒合併就在 plan.md 寫明依賴、不要重複建同名 migration；
  - R1a-3（`fix/referral-disclosure-wording`）合併了嗎——揭露句函式的名稱與路徑，模板測試要引用；
  - R2-0 spike 結論在不在（監工 session 另有 spike prompt）；不在就把十一點列為階段 0 並標「待驗證」，規劃不等它。

## 規劃書（落檔模式：跨 session、動 auth 資料、階段 ≥3，三條全中）
- `docs/plans/referral-email-invite/plan.md` 只寫與總綱 §2.3A 的差異與補足，設計本體以
  `git show <總綱 commit>:docs/plans/platform-growth-and-trust/plan.md §2.3A` 為上游、不複製。各節至少要有：
  1. 使用者需求：引總綱 A；K 段 Q2-12～23 ＋ 用語稽核逐條列為「已定、不重議」。
  2. 系統設計：讀碼重標總綱 C／E 引用的行號；`POST /referrals/invites`、`POST /auth/invite/accept` 的請求／回應／error code 表；
     限流六組常數名與數值（每人 5／3600 與 20／86400；同一信箱 1／86400；全站 100／3600 與 1000／86400；accept per-IP 20／300）；
     簽章 payload `{v,e,c,x}` 與 TTL 7 天；purge 7 天＋`p_email`＋audit 列＋cron `23 3 * * *`；`app_metadata.referral_invite` 四鍵；`user_metadata` 兩鍵。
  3. 架構影響：新檔（`api/referral-invite.ts`、`api/referral-invite-token.ts`、`_shared/referral-invite-payload.ts`、
     `src/components/referral/InviteCard.tsx`——三處「邀請好友」改開同一張卡片、一顆主鈕依有無 email 切換「快速分享」／「用 Email 邀請」、
     `src/hooks/useInviteAccept.ts`、`supabase/email-templates/referral-invite.html`）；既有檔改動點（`AuthPage.tsx` invite 模式、
     `OTPVerificationPage.tsx` 抽 `routeAfterVerifiedSession`、`App.tsx` 豁免 `/auth/reset-password` 一行、`CompleteProfile.tsx` 後備預填、
     `index.ts` 只加路由註冊與常數）；撞檔：T1 排 R2 之後（Q2-20）、admin 檔不動（交 A1a）。
  4. UIUX：邀請卡片三狀態（未填 email／已填未勾同意／已填已勾）、九種 error code 文案、受理文案（遮罩地址、不宣稱已送達）、2A 靜態提示、
     「改用其他 Email 註冊」；用語一律「推薦人」；讀 `docs/ui-ux-guidelines.md` §12.11／§12.13／§13 第 5 條。
  5. 階段切分（TDD）：R2-0 spike（拋棄式）、R2-1 後端、R2-2 前端＋文件、R2-3 上線——照總綱 §2.3A I 的表，每階段寫紅燈測試落點與驗證標準；
     `check-spec-drift` 十二條與規格書 §7.1 新段同在 R2-1。
  6. 開放問題：只准列總綱沒裁過的；K 段已裁的不得重開。
  7. 風險回滾：env `REFERRAL_EMAIL_INVITE_ENABLED` 與建置旗標 `VITE_REFERRAL_EMAIL_INVITE` 兩道開關；purge 可手動呼叫；回滾不需刪 migration。
  - migration 檔名：`<開工日>000001_purge_stale_referral_invites.sql`（`find_auth_user_by_email` 只在 check-email 修正未先合併時才另列 `000002`），
    寫進 plan.md 讓監工 session 登記進總綱 §8.1。
- `docs/plans/referral-email-invite/progress.md`：從 `docs/_templates/progress.md` 實例化，R2-0～R2-3 全部「未開始」。檔頭照先例
  （`docs/plans/platform-uiux-redesign/progress.md:3`）加 `<!-- plans-keep: 施工鷹架；退場條件＝/tdd-implement 收尾刪除整個目錄 -->`
  讓 `guards` 軌綠——friction-log 2026-09-14 業主裁決的過渡做法，衝突已記錄、不必再寫一次。

## 審查
- 規劃寫完立刻 `/review-plan referral-email-invite`（四個 plan-reviewer，並照 2026-10-21 先例自加一條「事實核對」lane：逐條核對 plan.md 引用的行號、
  函式名、GoTrue 行為）。產出 `review.md`。
- P0／P1 處置後停。推分支、開 draft PR（標題 `docs(plans): referral-email-invite 規劃與審查`，內文列開放問題與需業主裁決的點）。
- 回報監工 session：PR 號、開放問題清單、與總綱 §2.3A 不一致之處（規劃過程發現總綱寫錯的，列出來，不要自己改總綱）。
```

---

## D. R2-0 spike：Email 邀請可行性十一點（拋棄式）

```text
R2-0 spike：Email 邀請可行性驗證（拋棄式、不留產品碼；結論寫成一份 markdown 回報監工 session）

## 開局
- 分支 `claude/r2-0-invite-spike`（非 `feature/*`；不開 PR、不合併）：`git fetch origin develop && git checkout -B claude/r2-0-invite-spike origin/develop`。Sonnet。
- 產物只有一份筆記：若 `docs/plans/referral-email-invite/` 已存在（R2 規劃分支）就寫 `spike-notes.md` 到那裡，否則寫在 scratchpad、最後整段貼回監工 session。
  每一點寫：怎麼驗、看到什麼、結論（可行／不可行／有條件）、對總綱 §2.3A 設計的影響。
- 兩段：本機段用 `supabase start`（GoTrue＋本機信箱 Inbucket 或 Mailpit，`supabase status` 列網址），spike 程式放 `supabase/functions/api/spike-*.ts`、驗完刪掉；
  develop 段要打 develop 的 Supabase 分支（project `ijcxnxhrziehdtkwausy`，見 `config/supabaseTarget.ts`），需要 service role key 與 Dashboard——
  沒有權限就把該點標「待業主」並寫出業主要做的操作步驟與要回填的欄位。
- 背景：總綱 §2.3A C／E／F（develop 上沒有就 `git show origin/claude/platform-uiux-redesign-plan-oowvbe:docs/plans/platform-growth-and-trust/plan.md`）。

## 十一點（總綱 §2.3A I「R2-0 spike」列）
1. `auth.admin.inviteUserByEmail(email, { data: { referral_invite_name, referral_invite_url } })` 寄出的信在本機信箱看得到；
   Invite 模板裡 `{{ .Data.referral_invite_name }}` 與 `{{ if .Data.referral_invite_url }}…{{ end }}` 都正確渲染
   （本機用 `supabase/config.toml` 的 `[auth.email.template.invite]` `content_path` 指一份暫時模板測；把 config 寫法記下給 R2-3）。
2. 對既存「已邀請未驗證」使用者先 `updateUserById(id, { user_metadata, app_metadata })` 再 `inviteUserByEmail` 重寄，信內渲染的是更新後的 metadata
   （總綱 C 說直接重寄不套用新 data，驗證繞法成立）。
3. `generateLink({ type: 'invite', email })` 對既存未驗證使用者回 `properties.hashed_token`；對已驗證使用者回 422。
4. 硬順序：`updateUserById(id, { password })` → `generateLink(invite)` → `verifyOtp({ token_hash, type: 'invite' })` 取得 session，
   `email_confirmed_at` 非空，`signInWithPassword` 用剛設的密碼成功；反過來（先 generateLink＋verifyOtp 再設密碼）會怎樣也記一下。
5. `updateUserById({ password: '12345678' })` 之類弱密碼回 `weak_password`；記下本機與 develop 兩環境的密碼強度設定（最小長度、字元類別、外洩密碼檢查）。
6. 以 postgres 身分 `delete from auth.users where …` 成功並 cascade 到 `profiles`；同交易 `delete from auth.audit_log_entries where payload->>'user_id' = …` 可行；
   pg_cron 排程下以函式 owner 執行也可行（本機 `cron.schedule` 一分鐘排程試一次）。
7. 本機 `supabase start` 下，Deno 整合測試呼叫 `inviteUserByEmail` 不受 email 寄送限流影響，確認 R2-1 的測試在 CI `api-tests` 軌跑得動。
8. 已邀請未驗證帳號 → `resetPasswordForEmail` → recovery 信 → `verifyOtp(type:'recovery')` → 可設密碼並登入
   （被邀請者不走邀請連結時的逃生路徑；順帶記 recovery 後 `App.tsx` 的導頁行為）。
9. `inviteUserByEmail` 是否計入 GoTrue 的 `email_sent` 限流桶（連續打超過 develop 的 `rate_limit_email_sent` 看是否 429 `over_email_send_rate_limit`）；
   develop 該值是多少（Dashboard Auth → Rate Limits）。
10. develop SMTP 實寄：業主以自己的 Gmail、iOS 郵件、Outlook App 各收一封，記：進收件匣或垃圾、揭露句與告知段在手機不放大是否可讀、
    「接受邀請」連結可點且落到 `FRONTEND_URL`（業主操作，寫清楚步驟與回填欄位）。
11. `redirect_to` 不在 allow list 時落到 Site URL 且 query 被丟——驗一次，確認「不傳 redirectTo、連結自己放信內」是必要的。

## 收尾
- 刪掉所有 spike 程式與暫時模板；分支可留可刪，不開 PR。
- 回報監工 session：十一點各一行結論＋總綱 §2.3A 需要修正的句子。
```
