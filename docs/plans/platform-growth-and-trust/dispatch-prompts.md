# 施工派工 prompt（總綱 §8.1 第 1 波：R2-0 spike）

<!-- plans-keep: 跨 session 派工鷹架——業主 2026-10-25 裁決三件工作都另開 session、由監工 session 給 prompt；退場條件＝對應 PR 合併（或 spike 回報）後刪該段，四段皆刪時刪本檔。A／B／C 已於 2026-10-26 隨 #390／#394／#393 合併刪除，只剩 D（R2-0 spike 結論貼進 R2 子 progress 後刪本檔） -->

每段都是「複製貼上即可」的完整 prompt，開給**全新 session**用。行號一律在開局 rebase 後現算
（總綱引用的行號是 2026-10-21 develop `ddd8fd9` 的，必漂）。原有 A（check-email `/fix-bug`）、B（R1a-3）、
C（`/plan-feature referral-email-invite`）三段已於 2026-10-26 隨 #390／#394／#393 合併刪除，取回：
`git show 8c7aedb:docs/plans/platform-growth-and-trust/dispatch-prompts.md`。

---

## D. R2-0 spike：Email 邀請可行性十一點（拋棄式）

```text
R2-0 spike：Email 邀請可行性驗證（拋棄式、不留產品碼、不 commit；結論寫成一份 markdown 貼回監工 session）

## 開局
- 分支 `claude/r2-0-invite-spike`（非 `feature/*`；全程不 commit、不 push、不開 PR）：`git fetch origin develop && git checkout -B claude/r2-0-invite-spike origin/develop`。Sonnet。
- 筆記一律寫在 scratchpad（不寫進 `docs/plans/`），收尾整段貼回監工 session。每一點寫：怎麼驗、看到什麼、結論（可行／不可行／有條件／待本機／待業主）、對總綱 §2.3A 設計的影響。
- 背景只讀總綱 `docs/plans/platform-growth-and-trust/plan.md` §2.3A C／E／F／I（#386 已合併、就在工作樹）：用 Read offset／limit 只讀 §2.3A（約 300–620 行，行號現算）。
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
