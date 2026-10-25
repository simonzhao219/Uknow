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
- 本 prompt 自足。要看總綱溯源（§2.3A C／E、§8.1）而 develop 上的 `docs/plans/platform-growth-and-trust/plan.md` 還沒有 §2.3A 時，
  `git fetch origin claude/platform-uiux-redesign-plan-oowvbe && git show origin/claude/platform-uiux-redesign-plan-oowvbe:docs/plans/platform-growth-and-trust/plan.md`
  只讀不 merge；兩邊不一致以本 prompt 為準。
- 不要整檔讀 `supabase/functions/api/index.ts`；先 `grep -n "check-email" supabase/functions/api/index.ts` 定位，再讀那一段。

## 症狀與根因（監工 session 初判；請先寫紅燈測試重現，根因由你自己追到機制層再寫進 fix.md）
- `app.post('/auth/check-email')` 以 service key 打
  `GET {SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50&search=<email>`，再對回傳的 `users` 陣列做 `some(u => u.email?.toLowerCase() === email)`。
- GoTrue 的 admin list users 端點讀的查詢參數是 `filter`（子字串比對＋分頁；另有 `page`／`per_page`／`sort`），沒有 `search`；未知參數被忽略，
  所以這支永遠拿到「最新建立的 50 位使用者」（預設 `created_at desc`）。第 51 位以前註冊的會員會被判 `exists:false`。
- 前端後果：`src/components/AuthPage.tsx` 的 `handleCheckEmail` 收到 `exists:false` → `setIsExistingUser(false)` → 進 2B「設定密碼」表單 →
  既有會員對已存在的 email 跑 `supabase.auth.signUp`，而不是登入。
- 為什麼沒被抓到（可證的部分）：沒有任何測試對真 GoTrue 斷言過 `exists:true`——`check-email-rate-limit.test.ts` 只斷言狀態碼；e2e 全 mock。
  其餘原因（本機／CI 使用者數、程式碼來源）請你自己核對，不要照抄。

## 修法（總綱 §2.3A E 已定，R2 Email 邀請之後要共用這支函式——簽名照這裡，不要縮）
1. 新 migration `supabase/migrations/20261025000001_find_auth_user_by_email.sql`（總綱 §8.1 已登記此檔名；rebase 時若 `origin/develop` 已有更大的版本號，
   改號成大於它——版本號隨合併順序單調，不隨開工日）：
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
       and u.deleted_at is null
   $$;
   revoke execute on function public.find_auth_user_by_email(text) from anon, authenticated, public;
   grant execute on function public.find_auth_user_by_email(text) to service_role;
   `auth.users.deleted_at` 是 GoTrue 既有欄位（軟刪除）；本機 `supabase start` 起得來就以 `\d auth.users` 核對一次，起不來以 CI api-tests 套用成功為準。
   檔頭註解寫「為什麼」（照 `20261017000002_validate_referral_code_revoke.sql` 的寫法），三點都要可驗證：(1) `search=` 從未被 GoTrue 讀過、只拿到最新 50 位；
   (2) admin API 的 `filter` 是子字串比對＋分頁，沒有精確查詢端點；(3) Email 邀請要的 `has_password`、`invited_at` 等欄位 admin API 拿不到或要多打幾次，
   直接讀 `auth.users` 一次命中（第 3 點是設計理由）。只回這幾個欄位、不回其他個資；只給 service_role。
2. `/auth/check-email` 改成 `const { data, error } = await sb().rpc('find_auth_user_by_email', { p_email: email })`：
   - `error` → 503 `{ error: '暫時無法檢查 Email，請稍後再試' }`（fail-closed。現行 `!res.ok` 回 `{exists:false}` 會把暫時性故障變成與本 bug
     相同的症狀；`AuthPage.handleCheckEmail` 對非 2xx 已有錯誤提示、e2e `backend_api_mock.set_check_email_error()` 已有情境，前端不必改）。
   - 成功 → `{ exists: Array.isArray(data) && data.length > 0 }`。回應仍只有 `exists`，不回任何其他位元（理由見該處既有註解）。
   - 限流與 `clientIp` 不動；拿掉對 `SUPABASE_URL`／`SUPABASE_SERVICE_ROLE_KEY` 的直接 fetch。
   - 離線守衛 `e2e/journey/tools/test_check_email_quota.py` 會從 `app.post('/auth/check-email'` 切到下一個 `app.` 字串讀這段原始碼：
     處理函式裡必須保留 `rateLimit(` 呼叫、`` `check-email:${ `` 鍵字面值與 `{ error: '…' }, 429` 的寫法；新增的註解與程式碼不要出現 `app.` 子字串。
3. 不動 `/auth/register`、`cancel-signup`、`requireAuth`、前端。

## 測試（紅燈先行；`touch .claude/tdd-lock` → commit `test(red)`；綠後 `scripts/tdd-unlock.sh` → commit `fix:`，照 CLAUDE.md）
- 紅燈期 hook 禁改 `*.test.ts`：`check-email-rate-limit.test.ts` 檔頭「每次還以 service role 打一次 auth admin API 形成放大」那句修後會過期，
  在 `touch .claude/tdd-lock` 之前先改好、隨紅燈 commit 一起進（總綱 §8.5 #1「被改掉的說法 grep 全 repo」；舊 migration `20260720000002` 檔頭的同款說法不改，
  在新 migration 檔頭帶一句更正）。
- 新檔 `supabase/functions/api/check-email-lookup.test.ts`（需 DB、`deno task test:db`；名稱照 `.claude/rules/test-naming.md`「<主體>：<情境> → <預期>」）：
  1. `check-email：比目標帳號更新的使用者超過 50 位 → 仍回 exists:true`——`createTestUser` 建目標帳號，再建 50 位，
     `POST /api/auth/check-email`（帶唯一 `x-forwarded-for`，寫法照 `check-email-rate-limit.test.ts`）斷言 `{exists:true}`；修法前這條必紅。
     51 位用 try／finally 以 `deleteTestUsers` 清掉（斷言失敗時也要清）。
  2. `check-email：不存在的 email → exists:false`（修前就綠，回歸護欄）。
  3. `check-email：大小寫不同的既有 email → exists:true`（修前就綠，回歸護欄：現行比對已 `toLowerCase`，新函式用 `lower()`）。
  4. `find_auth_user_by_email：anon、authenticated 不能直接執行，只給 service_role`——寫法照 `referral-validate.test.ts` 的 `has_function_privilege` 查表，
     三個斷言：anon false、authenticated false、service_role true（第三個擋「revoke 誤傷 service_role → 全站登入步驟 1 都 503」）。
  5. `check-email：RPC 失敗 → 503，不偽裝成不存在`——照 `referral-validate.test.ts` 的 `withRestTableFailure(['rpc/validate_referral_code'], …)` 寫法，
     用 `withRestTableFailure(['rpc/find_auth_user_by_email'], …)`，斷言 503、body.error 為「暫時無法檢查 Email，請稍後再試」、body 無 `exists`。這條必寫。
- `rate-limit.unit.test.ts`、`check-email-rate-limit.test.ts` 不得變紅。`cd supabase/functions && deno fmt && deno lint && deno task check`。
- 本機起不了 `supabase start` 或連不上 jsr registry：紅綠以 CI `api-tests` 軌為準，fix.md 與 PR 註明「紅燈未在本機確認」；此時 push 前要先清掉 fix.md（見文件段），
  否則 `guards` 軌紅、其餘軌全 skip。

## 同類掃描（/fix-bug 第 3 步，必做並寫進 fix.md）
- pattern：「呼叫外部 API 時帶了對方不認的參數名，回應形狀正常、沒有任何錯誤」。
- 掃 `grep -rn "admin/users" . --exclude-dir=node_modules --exclude-dir=.git`（含 `.github/workflows/`）、`grep -rn "auth\.admin\." supabase/functions`、
  `grep -n "fetch(" supabase/functions/api/index.ts`（後端原生 fetch 只剩 PayUni 那處），每一處核對參數名與對方文件。
  已知 `e2e/journey/tools/supa.py` 的 `list_users_by_email_prefix` 是分頁掃到空頁為止、不靠 `search`，沒有同一個病；`journey.yml` 的 `admin/users/<id>` DELETE 以 id 定址，也沒有。
- 另有同病灶：小的本 PR 一併修，大的記 friction-log。

## 文件
- `supabase/README.md` 函數表加一列 `find_auth_user_by_email`（只給 service_role；`/auth/check-email` 與 Email 邀請端點共用）。
- 規格書 §4.1 Step 0 那列（`/auth/check-email` 只回 `{ exists }`）契約不變、不改；§14 不加列也不加「已修」旁白（`.claude/rules/document-writing.md`；
  總綱 §8.6 #14 的「合併前加一列」只在修正延後時適用）。
- fix.md：`docs/plans/fix-auth-check-email-lookup/fix.md`（從 `docs/_templates/fix.md` 實例化），紅燈 commit 之後至少 commit 一次（之後才能 `git show` 取回）。
  push 前以獨立 commit `chore(plans): 清理 fix-auth-check-email-lookup` 刪掉它（留著 `check-plans-scaffold` 會紅、CI 其餘軌全 skip）；
  根因、同類掃描、四面向結論貼進 PR 描述的結論摘要；「防線回填」一段升級進 `docs/plans/friction-log.md`，教訓以你的根因分析為準
  （監工初判、待你驗證：引用既有呼叫當範本前，先核對對方 API 的參數名）。

## 收尾
- rebase 後 `python3 scripts/check-migration-versions.py` 並手動確認新檔版本號大於 `origin/develop` 現有最大值；`npm run check:full`；
  `cd e2e/journey && pytest tools/ -q`；`bash scripts/framework-check.sh`。
- PR → develop（draft），標題 `fix(auth): /auth/check-email 改以 find_auth_user_by_email 查詢，不再只比對最新 50 位使用者`，內文照 PR 範本、附最後一次 rebase 後的紅燈 hash。
  驗收段加一項：develop 預覽站以註冊順序在最新 50 位之外的既有會員 email 進登入頁，應進「登入」步驟而非「設定密碼」；做不到就寫「未驗」。
- push 後 `gh pr checks --watch` 盯到 `api-tests` 綠才回報。
- 回報監工 session：migration 最終檔名（改號才需回報）、是否找到同病灶、根因分析結論一句。
```

---

## B. Plan Mode 小 PR：R1a-3 揭露句與用語

```text
Plan Mode 小 PR：推薦邀請的揭露句與用語（總綱 R1a-3）——邀請訊息與邀請卡加「本邀請由 Uknow 推薦人 {名} 發送」、刊登方案頁「下線」改寫、禁用字樣常數與測試

## 開局
- 分支 `fix/referral-disclosure-wording`：`git fetch origin develop && git checkout -B fix/referral-disclosure-wording origin/develop`。Sonnet 即可。
- Plan Mode（不落檔）：先在對話裡列改動點與測試落點，**跑 `/review-plan`（Plan Mode：把規劃全文交給四個 reviewer），P0 清掉再動手**。
- 本 prompt 自足。總綱溯源（§2.2、§14 第 1 題、§8.6 #8／#9／#15）在 develop 上讀不到時，
  `git fetch origin claude/platform-uiux-redesign-plan-oowvbe && git show origin/claude/platform-uiux-redesign-plan-oowvbe:docs/plans/platform-growth-and-trust/plan.md` 只讀不 merge。
- 業主裁決（已定、不要再問）：揭露句逐字「本邀請由 Uknow 推薦人 {名} 發送」；使用者看得到的文案一律「推薦人」、不出現「傳銷商／直銷」；
  律師定案的四份內容頁（`src/content/termsOfService.ts`、`participationContract.ts`、`businessManual.ts`、`referralRewardRules.ts`）原文一個字都不改；
  服務類別「傳銷」（`src/utils/constants.ts` `SERVICE_CATEGORIES`）是職業類別、保留；程式註解、內部文件、測試腳本的「上線／下線」業務術語不改。

## 改動點
1. 新檔 `supabase/functions/_shared/recruitment-copy.ts`（零依賴，Deno 與前端都直接讀；之後 Email 邀請的後端姓名檢查與信件模板測試都引用它）：
   - `export function referralDisclosureSentence(name?: string | null): string` → `本邀請由 Uknow 推薦人 ${name} 發送`；
     `name` 空白時回 `本邀請由 Uknow 推薦人發送`——**這是防禦性退化句、不是業主裁決**（能分享的人都已完成會員資料，實務上到不了），PR 描述列為「請業主確認的一處新句式」。
   - `export const RECRUITMENT_FORBIDDEN_WORDS = ['賺', '獎金', '收入', '投資', '受僱', '工作', '兼職', '節稅', '傳銷', '直銷', '下線'] as const`，
     常數上方註解標明前八個出自手冊 4-1-2(5)（總綱 §2.3A F 的同一陣列）、後三個出自業主 2026-10-23 用語裁決。
   - 接線照 `@backfill-cases` 的既有做法：`vite.config.ts` alias `@recruitment-copy`、`tsconfig.json` 的 `paths` 與 `include` 各加一列（檔頭已寫明兩處必須同步）。
2. `src/utils/referralInvite.ts`
   - `buildInviteMessage(code: string, memberName?: string | null)`：既有三段（邀請句／連結／推薦碼）逐字不動，其後換行接揭露句。`memberName` 可選，
     既有 5 處單引數呼叫（`referralInvite.test.ts`）才不會被 tsc 擋。
   - `shareReferralInvite(code, showToast, memberName?)`（型別 `string | null | undefined`，對齊 `InviteFriendPanelContent.tsx` 的 `memberName` 與 `user.name`）；
     呼叫端一起改：`src/components/referral/InviteFriendButton.tsx`（`user.referralCode`／`user.name`）、`src/components/referral/InviteFriendPanelContent.tsx`（已有 `memberName`）。
     `buildLineShareUrl` 不動。
3. `src/utils/inviteCardImage.ts` `drawInviteCard`：
   - QR 下方現在只印粗體等寬推薦碼的那一行，改成「掃描加入 Uknow・推薦碼 」（一般字、`PIXEL_INK_MUTED`）＋碼（粗體等寬、`PIXEL_INK`）同一行——
     兩種字型拼一行的做法抬頭已有（`name` ＋ `' 的Uknow邀請'`），照抄。
   - 連結之下加揭露句（`referralDisclosureSentence(memberName)`、灰字 18px），畫布高度隨之增加。
   - 說明行與揭露句都**不得截尾、不得加「…」**（業主裁決逐字）：以 `measureText` 量，超過 `W - PAD * 2` 先縮字級（下限 12px），仍過寬就換行置中、畫布高度再加一行。
     只有連結行維持現行截尾。顏色只准 `pixelColors.ts` 的三個常數（`inviteCardImage.test.ts`「只用現行色票上色」會驗）。
4. `src/content/listingPlans.ts:38`：「只要您的下線（或下線的下線）成功加入刊登或續約」→「只要您推薦的會員（及他們再推薦的會員）成功加入刊登或續約」。其餘不動。
5. `src/utils/constants.ts` `SERVICE_CATEGORIES` 上方加一行註解：「『傳銷』是職業類別（業主 2026-10-23），不受『使用者文案一律推薦人』的用語規則約束」——殘跡說明寫在定義處，不寫進文件。
6. `docs/ui-ux-guidelines.md`
   - §12.13「用語」條：補「使用者看得到的文案不出現『傳銷商／直銷』，一律『推薦人』」；例外清單改為「服務條款、參加契約、事業手冊、推廣獎勵規章四份律師定案內容
     （`src/content/` 對應四檔）維持原文」，拿掉原本的「刊登方案」。只列這四份，不寫「刊登方案不在例外」之類的旁白（`.claude/rules/document-writing.md`）。
   - §13 第 5 條加一子項：邀請訊息與邀請卡固定含揭露句「本邀請由 Uknow 推薦人 {名} 發送」（手冊 4-1-2(2)），來源 `_shared/recruitment-copy.ts`；
     訊息、邀請卡與三顆入口的文案不得出現 `RECRUITMENT_FORBIDDEN_WORDS`（4-1-2(5)＋用語裁決）。規則只寫這一份，規格書不重複。
7. 被改掉的說法 grep 全 repo（總綱 §8.5 #1）：`grep -rn "會員名 + QR\|四段文字\|同時含連結與推薦碼\|含會員名/推薦碼/連結" src`，把 `inviteCardImage.ts` 檔頭、
   `inviteCardImage.test.ts` 檔頭與測試名、`InviteFriendPanelContent.tsx` 的 `buildCardCanvas` 註解、`referralInvite.ts` 檔頭與 `buildInviteMessage` docblock 改成新組成。

## 測試（vitest，中文 it 名；紅燈期 hook 禁改 `*.test.*`，所以順序如下）
- 先把要改的既有測試改好：`InviteFriendButton.test.tsx` 的 `toHaveBeenCalledWith('8048877', showToast)` 改成新簽名並帶 `'王小明'`（該檔 JOINED 的 name）；
  `referralInvite.test.ts` 既有 `shareReferralInvite('abc123', showToast)` 等呼叫對齊新簽名。再寫下列新測試，`touch .claude/tdd-lock` → commit `test(red)`；
  實作至綠 → `scripts/tdd-unlock.sh` → commit `feat:`（PR 範本要紅燈 hash）。
- `src/utils/referralInvite.test.ts`：`buildInviteMessage('abc123', '小明')` 以揭露句結尾且前三段逐字不變；未給名字時走退化句；
  `navigator.share` 收到的 `text` 含揭露句；訊息逐字檢查不含 `RECRUITMENT_FORBIDDEN_WORDS` 任一（table-driven）。
- `_shared` 檔不另開測試檔：照 `src/utils/profileValidation.test.ts` 引用 `@name-cases` 的做法，在 `src/utils/referralInvite.test.ts` 經 `@recruitment-copy` 引入，
  斷言 `referralDisclosureSentence('小明') === '本邀請由 Uknow 推薦人 小明 發送'`、陣列恰為十一詞。
- `src/utils/inviteCardImage.test.ts`：用既有假 context 手法記錄 `fillText`，斷言畫了「掃描加入 Uknow・推薦碼 」、碼、揭露句，高度比改前大；
  用 `measureText` 回偏大寬度的假 context（50 字外文姓名）斷言 `fillText` 收到的揭露句字串仍等於完整原句（縮字級或換行，不截尾）；
  記錄到的所有 `fillText` 字串逐一不含 `RECRUITMENT_FORBIDDEN_WORDS`；三個既有案例維持。
- `InviteFriendPanelContent.test.tsx` 沒有 `shareReferralInvite` 的 mock：不要加整檔 mock，stub `navigator.share` 後點「邀請好友」，斷言 `text` 含
  「本邀請由 Uknow 推薦人 小明 發送」（JOINED 的 name 是小明）。
- `InviteFriendButton.test.tsx`、`MyQrButton.test.tsx`、`ReferralCodeWithCopy.test.tsx` 各加一條：render 後 `textContent` 不含 `RECRUITMENT_FORBIDDEN_WORDS`（三顆各自 render）。
- 新檔 `src/content/listingPlans.test.ts`：內容不含「傳銷商」「直銷」「下線」、含「您推薦的會員（及他們再推薦的會員）」。不要對四份律師文件寫禁用字測試。
- e2e：`npm run dev` 後 `cd e2e && pytest features/dashboard_smoke.feature`（只斷言 toast 文案、應不受影響）；跑不起來就以 CI e2e 軌為準並在 PR 寫明。
- `python3 scripts/check-test-names.py`、`npm run check:full`、`bash scripts/framework-check.sh`。

## 不做
- 不做 Email 邀請（R2）的邀請卡片／表單；不改 `InviteFriendPanelContent` 版面；不碰 `/auth/*` 後端；不改任何 `src/content/` 律師文件。

## 收尾
- 實作完跑 `/review-implementation`（Plan Mode：把規劃全文與 diff 給它；邀請卡 PNG 是 UI 改動，附一張下載的邀請卡截圖）。
- PR → develop（draft），標題 `feat(referral): 邀請訊息與邀請卡加推薦人揭露句，刊登方案頁用語改「推薦的會員」`；流程證據勾 Plan Mode、貼兩次審查摘要與紅燈 hash。
  驗收段加一項：develop 預覽站下載邀請卡，目視說明行、碼、連結、揭露句不截尾不重疊（含 10 字中文名與長外文名）；做不到寫「未驗」。
  另列「請業主確認」一項：無名時的退化句。
- push 後 `gh pr checks --watch` 盯到全綠。
- 回報監工 session：`referralDisclosureSentence`、`RECRUITMENT_FORBIDDEN_WORDS` 的匯出路徑與最終內容、alias 名、`shareReferralInvite` 最終簽名（R2 的 InviteCard 與模板測試要引用）。
```

---

## C. `/plan-feature referral-email-invite`（R2 三段式第一段）

```text
/plan-feature referral-email-invite

## 開局
- 分支 `feature/referral-email-invite`：`git fetch origin develop && git checkout -B feature/referral-email-invite origin/develop`
  （三段式流程，守衛只認 `feature/*`；規劃書目錄名必須等於 slug）。
- 模型 Opus。本 session 只做規劃與審查，不寫任何產品程式碼；審查報告出來後停，等業主裁決。不要跑 `/tdd-implement`。
- 上游是總綱 `docs/plans/platform-growth-and-trust/plan.md` 的 §2.3A（R2 Email 邀請，A～K）、§8.1／§8.2、§8.6 #9～#13、§14 第 6 題、§16。
  PR #386 合併前 develop 上的總綱沒有這些段，所以一律這樣讀：
  `git fetch origin claude/platform-uiux-redesign-plan-oowvbe && git show origin/claude/platform-uiux-redesign-plan-oowvbe:docs/plans/platform-growth-and-trust/plan.md > <scratchpad>/upstream-plan.md`
  （不 merge、不 commit），再用 Read 的 offset／limit 只讀上述段落（§2.3A 約 300–620 行、§8.1／§8.2 約 1156–1215 行，行號現算），不要整檔讀進 context。
  plan.md 的上游引用寫「總綱 §2.3A（commit <hash>）」：#386 已合併就填它合進 develop 的 merge commit，未合併填「待監工回填」並列入回報；不要寫會被 rebase 掉的分支 tip。
- 衝突時誰為準：§2.3A D／K 與業主 2026-10-22／23 裁決 > §2.3A I 表 > §2.5／§2.7／§9／§11 的摘要列（後者可能殘留舊稱）。
  已知殘留：總綱 E 段 purge 一句寫「R2-0 第 9 點驗可行性」，audit 刪除其實是 spike 第 6 點。規劃中再發現的，列進回報的「總綱需修正處」，不要自己改總綱。
- 前置狀態（開工時核對，寫進 plan.md「0. 現況」）：
  - check-email 修正（`fix/auth-check-email-lookup`，dispatch-prompts A）合併了嗎——合併後 `find_auth_user_by_email` 的權威是 `supabase/migrations/*_find_auth_user_by_email.sql`，
    未合併以 A 段的 SQL 為準。**R2-1 的開工條件＝A 已合併**；沒合併就在 plan.md 標「R2-1 擋於前置」，不列第二支 migration、不重建同名函式。
  - R1a-3（`fix/referral-disclosure-wording`，dispatch-prompts B）合併了嗎——B 建的是 `supabase/functions/_shared/recruitment-copy.ts`
    （`referralDisclosureSentence(name)`、`RECRUITMENT_FORBIDDEN_WORDS` 十一詞、vite alias `@recruitment-copy`）。未合併就寫「依賴 B」並照該路徑規劃，不要另建第二份陣列。
  - R2-0 spike（dispatch-prompts D）結論：由監工 session 貼進本 prompt 之後或 progress.md；沒有就視為不在，階段 0 標「外部 spike，待驗」，規劃不等它。

## 規劃書（落檔模式：跨 session、動 auth 資料、階段 ≥3，三條全中）
- `docs/plans/referral-email-invite/plan.md` 只寫與總綱 §2.3A 的差異與補足，設計本體引用上游、不複製。各節：
  0. 現況（前置狀態）：上面三項的實際狀態、develop HEAD、總綱 C／E 引用行號的重標結果。
  1. 使用者需求：引總綱 A；K 段 Q2-12～23 ＋ 用語稽核逐條列為「已定、不重議」。
  2. 系統設計：`POST /referrals/invites`、`POST /auth/invite/accept` 的請求／回應／error code 表；限流六組常數名與數值（每人 5／3600 與 20／86400；
     同一信箱 1／86400；全站 100／3600 與 1000／86400；accept per-IP 20／300）——常數留在 `index.ts` 常數區、窗口寫乘式（`rate-limit.unit.test.ts` 只讀那裡）；
     簽章 payload `{v,e,c,x}` 與 TTL 7 天（TTL 常數放 `index.ts` 讓 `check-spec-drift` 讀得到，或由 R2-1 擴充 `scripts/check-spec-drift.py` 的 `_load_sources` 並補 self-test 案例，二選一寫明；
     「十二條」＝五把 per-user／target／global 限流 ×2＋TTL＋purge，accept per-IP 是否納入請明寫）；purge 7 天＋`p_email`＋audit 列＋cron `23 3 * * *`；
     `app_metadata.referral_invite` 四鍵；`user_metadata` 兩鍵；`find_auth_user_by_email` 的欄名以前置狀態寫的權威為準。
  3. 架構影響：
     - 新檔：`api/referral-invite.ts`、`api/referral-invite-token.ts`、`_shared/referral-invite-payload.ts`（零依賴；前端經 vite alias `@referral-invite-payload` 讀，
       接線照 `@backfill-cases`：`vite.config.ts` alias、`tsconfig.json` paths 與 include）、`src/components/referral/InviteCard.tsx`（三處「邀請好友」改開同一張卡片、
       一顆主鈕依有無 email 切換「快速分享」／「用 Email 邀請」）、`src/hooks/useInviteAccept.ts`、`supabase/email-templates/referral-invite.html`。
       vitest 只跑 `src/**`（`vitest.config.ts` exclude supabase）：模板測試與 payload 純解碼測試都放 `src/`。
     - 既有檔：`AuthPage.tsx` invite 模式、`OTPVerificationPage.tsx` 抽 `routeAfterVerifiedSession`、`App.tsx` 豁免 `/auth/reset-password` 一行、`CompleteProfile.tsx` 後備預填、
       `index.ts` 只加路由註冊與常數、`InviteFriendButton.tsx`／`InviteFriendPanelContent.tsx`／`MyQrPage.tsx`（入口改開卡片）、`e2e/mocks/backend_api_mock.py`、
       `e2e/mocks/supabase_auth_mock.py`、`e2e/features/dashboard_smoke.feature`、`.github/workflows/ci.yml`／`journey.yml`（見下一點；改了要跑 `scripts/check-workflows.py`）。
     - 旗標與 secret 的環境落點（plan.md 逐一定案）：e2e 的 dev server（`ci.yml` 與 `e2e/conftest.py` 裡起 `npm run dev` 的地方）怎麼帶 `VITE_REFERRAL_EMAIL_INVITE`，
       或旗標缺省時表單是否仍渲染；journey 的 `supabase secrets set` 段加 `REFERRAL_INVITE_SECRET`、`REFERRAL_EMAIL_INVITE_ENABLED=true`，`e2e/journey/conftest.py` 的前端 env 加旗標；
       hosted 環境（Cloudflare Pages 建置變數、Supabase secrets）由誰在 R2-3 設。沒定這段，R2-2 的 e2e 會看不到表單、R2-3 的 journey 會拿到 503 `disabled`。
     - `_shared/recruitment-copy.ts` 的三個消費點：`POST /referrals/invites` 對推薦人姓名的檢查；模板測試以 `referralDisclosureSentence('{{ .Data.referral_invite_name }}')` 比對並斷言
       整份模板不含 `RECRUITMENT_FORBIDDEN_WORDS` 任一詞；InviteCard 與受理／錯誤文案的 render 測試。
     - 讀 `docs/multi-step-flow-recovery.md`，逐條寫四契約怎麼滿足（尤其契約 2 可重入入口、契約 4 零寄信），並決定 invite 狀態推導與 `routeAfterVerifiedSession`
       放進 `src/utils/registrationFlow.ts` 還是獨立檔，附理由。
     - 撞檔：T1 排 R2 之後（Q2-20）；admin 檔不動（交 A1a）；B 先改 `InviteFriendButton.tsx`／`InviteFriendPanelContent.tsx` 的分享簽名、S7a 動 `MemberDashboard`／`ReferralManagement`，
       R2 rebase 以先合併者為準（總綱 §8.2）。
  4. UIUX：邀請卡片三狀態（未填 email／已填未勾同意／已填已勾）、九種 error code 文案、受理文案（遮罩地址、不宣稱已送達）、2A 靜態提示、「改用其他 Email 註冊」；
     用語一律「推薦人」、信件與卡片文案不含 `RECRUITMENT_FORBIDDEN_WORDS`；讀 `docs/ui-ux-guidelines.md` §12.11／§12.13／§13 第 5 條。
  5. 階段切分（給 TDD 用）：只把可紅綠循環的階段列為待實作。R2-0 標「外部 spike，結論由監工貼入，不在本分支做」；R2-3 標「非 TDD：業主貼模板、開 env；journey 在晉升 PR 跑」。
     R2-1、R2-2 依依賴拆成多個紅綠循環，各寫測試落點與驗證標準，例如：token 模組（unit）→ purge migration → 資格 helper＋`rateLimitStrict` → invites 端點 → accept 端點 →
     `routeAfterVerifiedSession` 抽取（行為不變）→ AuthPage invite 模式＋hook → InviteCard → CompleteProfile 後備預填＋模板檔＋文件。`check-spec-drift` 十二條與規格書 §7.1 新段跟著後端那幾段。
  6. 開放問題：只准列總綱沒裁過的；K 段已裁的不得重開。
  7. 風險回滾：env `REFERRAL_EMAIL_INVITE_ENABLED` 與建置旗標 `VITE_REFERRAL_EMAIL_INVITE` 兩道開關；purge 可手動呼叫；回滾不需刪 migration。
  - migration：只有 purge 一支，版本號照總綱 §8.1 登記值 `20261025000011_purge_stale_referral_invites.sql`，plan.md 抄登記值；R2-1 開工若 develop 已有更大版本號就改號，
    rebase 後跑 `python3 scripts/check-migration-versions.py`。
- `docs/plans/referral-email-invite/progress.md`：從 `docs/_templates/progress.md` 實例化，階段照第 5 節的拆法、全部「未開始」。檔頭照先例
  （`docs/plans/platform-uiux-redesign/progress.md:3`）加 `<!-- plans-keep: 施工鷹架；退場條件＝/tdd-implement 收尾刪除整個目錄 -->`
  讓 `guards` 軌綠——friction-log 2026-09-14 業主裁決的過渡做法，衝突已記錄、不必再寫一次。

## 審查
- 規劃寫完立刻 `/review-plan referral-email-invite`。reviewer 只有 Read／Grep／Glob、跑不了 git：派工時在每個 prompt 附 `<scratchpad>/upstream-plan.md` 的絕對路徑與要讀的段落行段，
  並明講總綱不在工作樹。
- 事實核對拆兩半：repo 內事實（行號、函式名、檔案存在）交唯讀 subagent（codebase-scout）逐條核對；GoTrue 行為由你在連得到時以官方文件或原始碼核對，
  連不到就在 plan.md 標「未驗，由 R2-0 第 N 點承接」並附 GoTrue 主張 ↔ spike 十一點對照，不得寫成已核對。`review.md` 摘要表為事實核對加第五列。
- P0：修訂 plan.md 並重跑 `/review-plan`，或停下等業主明文豁免。P1／P2 原樣留在 `review.md`、不改判，需裁決的點放進 PR 描述。不要勾 `review.md`「處置」節的人審完成框。之後停。
- push 前 `python3 scripts/check-plans-scaffold.py` 與 `bash scripts/framework-check.sh`；推分支、開 draft PR（標題 `docs(plans): referral-email-invite 規劃與審查`，
  內文照 `.github/pull_request_template.md`，「流程證據」貼四視角＋事實核對的 P0／P1 摘要）；push 後 `gh pr checks <pr> --watch` 盯到 `guards` 綠。
- 回報監工 session：PR 號；三個前置各自的狀態；plan.md 登記的 migration 版本號；`review.md` 處置狀態與開放問題清單；總綱需修正處（含上面已知那句）。
```

---

## D. R2-0 spike：Email 邀請可行性十一點（拋棄式）

```text
R2-0 spike：Email 邀請可行性驗證（拋棄式、不留產品碼、不 commit；結論寫成一份 markdown 貼回監工 session）

## 開局
- 分支 `claude/r2-0-invite-spike`（非 `feature/*`；全程不 commit、不 push、不開 PR）：`git fetch origin develop && git checkout -B claude/r2-0-invite-spike origin/develop`。Sonnet。
- 筆記一律寫在 scratchpad（不寫進 `docs/plans/`），收尾整段貼回監工 session。每一點寫：怎麼驗、看到什麼、結論（可行／不可行／有條件／待本機／待業主）、對總綱 §2.3A 設計的影響。
- 背景只讀總綱 §2.3A C／E／F／I：`git fetch origin claude/platform-uiux-redesign-plan-oowvbe && git show origin/claude/platform-uiux-redesign-plan-oowvbe:docs/plans/platform-growth-and-trust/plan.md > <scratchpad>/upstream-plan.md`，
  用 Read offset／limit 只讀 §2.3A（約 300–620 行，行號現算），不 merge。
- 通則：任何一點因環境做不到（無 docker、連不上 develop、沒有 key），結論欄一律寫「未驗證」並說明原因，**不得**以讀 GoTrue 原始碼或總綱 §2.3A C 的敘述代替實測結論。
  service role key 只經環境變數傳入，不寫進 `spike-*.ts`、筆記或任何 commit；回報前自查筆記不含 `eyJ` 開頭字串。**不得對正式站 project `uhtwwxtazwqnlbejhprl` 發任何 API 呼叫**，正式站的值一律由業主在 Dashboard 唯讀查看後回填。
- 兩段：
  - 本機段：先讀 `docs/plans/friction-log.md` 的 2026-10-17 條（web session 起本機 Supabase 的做法：`nohup dockerd`、映像繞 `mirror.gcr.io`、`supabase start -x studio,logflare,vector,supavisor`、CLI 釘 `npm i -g supabase@2.109.1`、deno 測試 glob 的坑）。
    CLI 用 2.109.1（同 `.github/workflows/ci.yml` 的釘版，否則第 7 點的結論不能外推到 CI）；本機信箱是 Inbucket 或 Mailpit，`supabase status` 列網址。
    `supabase/config.toml` 現在只有 `project_id` 與 `[functions.api]`、沒有 `[auth]` 段——要測模板就新增 `[auth.email.template.invite]`（與 recovery 的 `content_path`），
    收尾必 `git checkout -- supabase/config.toml`。spike 程式放 `supabase/functions/api/spike-*.ts`，驗完刪掉，收尾 `git status` 必須乾淨。
    `supabase start` 起不來（無 docker、jsr.io 被擋）：本機段各點標「待本機」，不要硬湊結論；第 2、3、4、8 點可改打 develop 驗。
  - develop 段：打 develop 的 Supabase 分支（project `ijcxnxhrziehdtkwausy`，見 `config/supabaseTarget.ts`），需要 service role key 與 Dashboard。
    沒有權限的點標「待業主」並寫清楚操作路徑、要回填的欄位、「只看不改」或「改完還原」。develop 的 Invite 模板是整個專案共用的：業主貼之前先備份原文，收尾還原。
    develop 上建的所有測試使用者（第 2、3、4、8、9、10 點）收尾用 service role `deleteUser` 清掉；寄信對象一律用業主收得到的 plus 位址（`<業主信箱>+spikeN@gmail.com`），不用 `example.invalid`（真 SMTP 會退信）。

## 分段分配（結論欄照這張表分「本機」「develop」兩欄寫；沒驗的那欄不得寫「可行」）
| 段 | 點 |
|---|---|
| 本機 | 1（模板渲染）、2、3、4、7、8、12 |
| develop | 1（經 develop SMTP 實寄＋渲染）、5（develop Dashboard 密碼強度）、6（hosted 權限：Dashboard SQL Editor 以 `begin; …delete…; rollback;` 驗 postgres 能刪 `auth.users` 與 `auth.audit_log_entries` 並 cascade）、9、10、11 |
| 業主唯讀回填 | 5 與 10 的正式站值 |

## 十一點（編號照總綱 §2.3A I「R2-0 spike」列的順序；第 12 點是加測）
1. `auth.admin.inviteUserByEmail(email, { data: { referral_invite_name, referral_invite_url } })` 寄出的信在信箱看得到；模板裡 `{{ .Data.referral_invite_name }}` 與
   `{{ if .Data.referral_invite_url }}…{{ else }}…{{ end }}` 都正確渲染。另測 else 分支：`inviteUserByEmail(email)` 不帶 data，以及 Dashboard 手動 Invite 各一次，
   確認不報模板錯誤、渲染一般文案、沒有 `<no value>`。暫時模板採總綱 §2.3A F 的內文順序與排版數值（側邊 padding ≤ 24px、揭露句與告知段 ≥ 14px、CTA ≥ 44px），
   主旨固定「你收到一封 Uknow 的邀請」；揭露句逐字「本邀請由 Uknow 推薦人 {{ .Data.referral_invite_name }} 發送」；用語一律「推薦人」，全文不得含賺、獎金、收入、投資、受僱、工作、兼職、節稅、傳銷、直銷、下線；
   `referral_invite_name` 用中性假名。這份「暫貼用模板」由你寫在 scratchpad（不放 `supabase/email-templates/`），連同可直接複製的寄送指令（service role 打 `POST /auth/v1/invite` 帶 `data`）一起交給業主貼 develop Dashboard。把 config 寫法記下給 R2-3。
2. 對既存「已邀請未驗證」使用者先 `updateUserById(id, { user_metadata, app_metadata })` 再 `inviteUserByEmail` 重寄，信內渲染的是更新後的 metadata
   （總綱 C 說直接重寄不套用新 data，驗證繞法成立）。每一步之後 `select invited_at, confirmation_sent_at, raw_app_meta_data, raw_user_meta_data from auth.users`，記下哪一步覆寫了 `invited_at`。
3. `generateLink({ type: 'invite', email })` 對既存未驗證使用者回 `properties.hashed_token`；對已驗證使用者回 422。同樣記 `invited_at`／`confirmation_sent_at` 的變化。
4. 硬順序：`updateUserById(id, { password })` → `generateLink(invite)` → `verifyOtp({ token_hash, type: 'invite' })` 取得 session，`email_confirmed_at` 非空，
   `signInWithPassword` 用剛設的密碼成功；反過來（先 generateLink＋verifyOtp 再設密碼）會怎樣也記一下。
   另驗 accept 依賴的「null 值刪鍵」：`updateUserById(id, { user_metadata: { referral_invite_url: null } })` 後讀回 `user_metadata`，確認該鍵已刪、`referral_invite_name` 是否保留。
5. `updateUserById(id, { password })` 依序試三種：長度不足、缺字元類別（`abcdefgh`）、已知外洩（`Password123`），逐一記是否回 `weak_password`、`error.code`／message。
   本機預設設定下通過是正常結果（記為「本機無此防線」）；要驗字元類別就在 config.toml 加 `[auth]` 的 `minimum_password_length = 8`、`password_requirements = "lower_upper_letters_digits"`（測完還原）。
   另記 **develop 與正式站**兩個 Dashboard 的密碼強度設定（Authentication → Sign In / Providers → Email；正式站只看不改、標「待業主」），逐項對照前端 `src/utils/passwordPolicy.ts`，列出不一致處。
6. 以 postgres 身分 `delete from auth.users where …` 成功並 cascade 到 `profiles`；同交易刪 `auth.audit_log_entries`——先 `select payload` 看 invite／signup 事件的實際形狀，
   謂詞用實際鍵（可能是 `payload->'traits'->>'user_id'`、`payload->>'actor_id'` 或 `actor_username = email`，總綱 E 的 `payload->>'user_id'` 只是初稿），
   判準寫「被刪列數 > 0 且刪後以 email／id 搜 `audit_log_entries` 為 0」。pg_cron 排程下以函式 owner 執行也可行（本機 `cron.schedule` 一分鐘排程試一次）。
   本機與 develop（hosted；用 `begin; … rollback;` 或拋棄式測試使用者）各驗一次 postgres 角色對 `auth.users`／`auth.audit_log_entries` 的 DELETE 權限，結論分環境寫。
7. 本機 `supabase start` 下 Deno 整合測試可呼叫 `inviteUserByEmail`。先查本機是否 autoconfirm（`enable_confirmations`；config 沒設就是 CLI 預設）：若是，「不受 email 限流」只是 autoconfirm 的結果，
   結論寫成「CI api-tests 可呼叫 inviteUserByEmail，但與正式站限流無關（第 9、10 點才管）」。另記：R2-1 要造「自助註冊未驗證」fixture 在本機得用 `admin.createUser({ email_confirm: false })`
   （`test-helpers.ts` 的 `createTestUser` 是 `email_confirm: true`）。
8. 已邀請未驗證帳號 → `resetPasswordForEmail` → recovery 信 → `verifyOtp(type:'recovery')` → 可設密碼並登入（被邀請者不走邀請連結時的逃生路徑）。
   本機把 `supabase/email-templates/reset-password.html` 設為 recovery 的 `content_path` 走 6 碼 `verifyOtp({ email, token, type: 'recovery' })`；
   recovery 後 `App.tsx` 的導頁行為讀碼確認（`App.tsx` SIGNED_IN 處理與 `OTPVerificationPage` 的 recovery 分支），不必起前端。
9. `inviteUserByEmail` 是否計入 GoTrue 的 `email_sent` 限流桶：本機要驗得開 `enable_confirmations`＋`[auth.email.smtp]` 指向本機信箱＋`[auth.rate_limit] email_sent = 2`（測完還原），
   不開就只能在 develop 驗。develop 版：請業主把 Dashboard「Rate limit for sending emails」暫調到 3（收尾還原原值），再打 4 次，看第 4 次是否 429 `over_email_send_rate_limit`。
10. 記 develop **與正式站**的 `rate_limit_email_sent`（Dashboard Authentication → Rate Limits；正式站只看不改、標「待業主」）。
11. develop SMTP 實寄：業主以 Gmail、iOS 郵件、Outlook App 各收一封（plus 位址），記：進收件匣或垃圾、揭露句與告知段在手機不放大是否可讀、「接受邀請」連結可點且落到 `FRONTEND_URL`
    （業主操作，寫清楚步驟與回填欄位）。結論欄加註「僅代表模板渲染與手機可讀性，develop 的寄件者是 gmail.com，不得外推正式站送達」。
12. 加測（依據總綱 §2.3A C 的 GoTrue 事實）：`redirect_to` 不在 allow list 時落到 Site URL 且 query 被丟——驗一次，確認「不傳 redirectTo、連結自己放信內」是必要的。

## 收尾
- 刪 spike 程式與暫時模板、`git checkout -- supabase/config.toml`、`git status` 乾淨；清掉 develop 的測試使用者；確認 develop 的 Invite 模板與 rate limit 已還原。分支可留可刪，不開 PR。
- 回報監工 session：十二點各一行結論（含「未驗證」「待業主」的項目與業主操作步驟）；筆記結尾固定附「要寫進 `docs/supabase-setup-checklist.md` 的值」（develop／正式站密碼強度、
  develop 與正式站 `rate_limit_email_sent`、Invite 模板貼法、config.toml 寫法）與「總綱 §2.3A 需要修正的句子」。結論由監工 session 貼進 R2 子 progress。
```
