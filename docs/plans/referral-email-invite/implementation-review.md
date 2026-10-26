# Email 邀請（R2）後端段 實作審查報告

<!-- /review-implementation 產出。審查對象：claude/referral-email-invite-vygu7r 相對 develop 的
     diff（循環 1–5＋R2-3a API 版），前端循環 6–11 未做、不算偏離。
     四位 reviewer 皆只讀碼（未跑 deno／CI）；彙整依 docs/_templates/review.md 的聚合規則：
     只去重與排序、不改判。同一缺口多人提出、判級不同者取最高並註明各自判級。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 3 | 7 | migration 加法性與 grants、HMAC 簽章、accept 硬順序與 id 不符防護、purge 的 SQL 語意、API 契約對前端的相容性 |
| 架構 | 0 | 3 | 8 | 模組邊界與依賴方向、migration 結構、契約與錯誤形狀、spec-drift 十二條與規格句對位、測試檔名分層、journey 節點與 cleanup 前綴 |
| UI/UX | 0 | 1 | 5 | 狀態分流 code、accept 分流、用語與禁用字樣、§0「不說已寄出」、`_shared` 供給、BottomNav／資訊架構、a11y、LINE 內建瀏覽器 |
| 需求 | 0 | 3 | 8 | 需求溯源（無腦補）、spec-drift 十二條、裁決 A／C／G／H／O／P 的字面兌現 |

去重後：**P0 0、P1 6、P2 18**，需人工裁決 6 項。

## 發現清單（依嚴重度排序）

### P1

1. [P1]〔§5 循環 4b；progress 偏離 5〕重寄路徑的 5xx 對帳（`confirmation_sent_at` 前後比對、NaN 分支）與偏離 5 補上的出口（lookup 失敗退 per-user、對帳查詢失敗、重寄先 update 失敗、全站窗 limited 告警、回寫舊章失敗）完全沒有測試；全站日窗也沒測 → 補 table-driven 案例。
   （需求 P1、架構 P1、系統 P2）
2. [P1]〔§2.1 對映表「逾時（`AbortSignal.timeout(10_000)`）」；未記錄偏離〕實作改用 `Promise.race`，GoTrue 請求逾時後仍在飛；新建路徑「逾時＋查無帳號 → 判未寄、退額度」之後若 GoTrue 晚到提交，會留下已寄信、沒蓋章的孤兒帳號（purge 不清、accept 回 410、之後邀請同信箱回 202 不寄）；重寄路徑則可能回寫舊章後信才寄出 → 記入偏離，補救方式〔需人工裁決〕。
   （系統 P1、架構 P1、需求 P1〔併 P2-8 崩潰窗口〕、UI/UX P1）
3. [P1]〔§2.1 退額度矩陣＋GoTrue 對映表〕GoTrue 回 `email_address_invalid`／`validation_failed` 時退 target 與 per-user、全站不退：通過我方正規式但 GoTrue 拒收的輸入可無限重送，單一會員約 100 次即耗盡全站小時窗、約 1,000 次耗盡日窗 → 〔需人工裁決〕（退額度是業主裁決 A）。
   （系統 P1）
4. [P1]〔§2.1 補償與告警；`index.ts` 的 `logSystemAlertOnce` 去重慣例〕`alert()` 只以 `kind` 去重，`compensate_delete_failed`、`resend_restore_failed` 這類「每筆都要人處理」的告警，第二筆會在第一筆未 resolve 前被吞掉 → 這兩種 kind 的去重鍵加 `user_id`。
   （系統 P1）
5. [P1]〔規格書 §7.1〕「寄送失敗時退回推薦人自己的額度（同一信箱與每人兩窗），全站額度不退」概括過頭：GoTrue 其他 4xx 不退、蓋章補償只退 target → 改成精確句（CLAUDE.md：規格書與程式衝突時同 PR 回修）。
   （需求 P1、UI/UX P2）
6. [P1]〔progress「實作與規劃字面不同之處」〕另有未記錄的偏離：(a) `validation_failed` 不分成因一律映成 `invalid_email`（plan 寫「email 的 `validation_failed`」）；(b) invites 後備文案與 plan §4 字面不同（`rate_limited_hour` 句、引號）；(c) accept「`generateLink` 的 id 不符」分支在 `deleteUser` 後另清稽核列（plan 只寫 `deleteUser`），且測試沒斷言 → 補記為偏離 8；(a) 是否收窄〔需人工裁決〕。
   （需求 P1、架構 P1、UI/UX P1）

### P2

1. [P2]〔§5 循環 5〕並行 accept 測試只斷言「恰好一個密碼能登入」，比 plan「只有最後成功那次的密碼能登入」弱 → 加循序案例。（需求）
2. [P2]〔測試命名〕`referrals/invites：停權或推薦碼非 active → 403 restricted` 只測了碼非 active → 補停權案例。（需求）
3. [P2]〔progress 偏離 3〕purge 的 `jsonb_typeof = 'object'` 沒有測試釘住 → 加章為 JSON `null`／字串時不刪的案例。（需求）
4. [P2]〔規格書 §7.1〕措辭缺口：「最多寄 5 封」實際計入所有被受理的請求（含設計上不寄的 202）；漏了驗證完成後重點連結回 409；沒寫姓名含禁用字樣回 400；沒寫同意證據 → 補句。（需求）
5. [P2]〔裁決 P〕`consent_version` 沒有機械守衛，「文案一改就升版」只靠約定 → 加測試把文案雜湊與版號綁在一起。（需求）
6. [P2]〔`supabase/README.md`〕`referral_invite_issued_at` 沒進函數表；`find_auth_user_by_email` 的呼叫端漏了 accept。（需求、架構）
7. [P2]〔PR 衛生〕`.claude/metrics/sessions/tmp-cycle2-fix.jsonl` 是暫存分支殘留 → 移除。（四位皆提；`0d44758` 已移除）
8. [P2]〔§2.1 補償〕蓋章逾時或 5xx 一律當確定失敗而 `deleteUser`，可能刪掉其實已蓋章成功、信已寄出的帳號 → 不確定時先查章，有章當成功。（系統）
9. [P2]〔§2.1 新建路徑〕查詢與寄送之間對方同時自助註冊時，對帳分支會把對方的帳號蓋章（7 天後被 purge）或在補償時刪掉 → 對帳以時間辨識「是我建的」，或列殘餘。（系統、架構〔需人工裁決 3〕）
10. [P2]〔§2.3 refund〕同信箱並行時以 decrement 退額度，target 名額可能被燒掉（A allowed、B limited、A 失敗退回後計數仍在上限）→ §2.5 補一句或條件式退。（系統）
11. [P2]〔§2.1 對映表〕無 `error_code` 的 429（gateway／Cloudflare）歸為「其他 4xx」：暫時性限流也吃掉推薦人額度 → 429 視同寄件限流。（系統）
12. [P2]〔§2.2 `weak_password`〕一個 code 對應三種成因（< 8 字元、> 72 位元組、GoTrue 強度／外洩），前端照 plan 沿用 `translateSignUpError` 會一律說「外洩」；前後端計字方式也不同（code point 對 UTF-16）→ 〔需人工裁決〕。（UI/UX）
13. [P2]〔§4 在途態〕invites 最壞等待約 30 秒（invite、蓋章、補償刪除各 10 秒），前端 `apiRequest` 沒有 timeout → 前端在途態加上限（約 25 秒 abort，行為同無 code 失敗）。（UI/UX）
14. [P2]〔§4 數字綁常數〕卡片「每小時」沒綁 `REFERRAL_INVITE_RATE_WINDOW_SECONDS` → 前端 `backendConstants` 測試加斷言。（UI/UX）
15. [P2]〔§2.3 deps〕`referralInviteDeps().limits` 的接線沒有守衛（兩個 key 對調時 spec-drift 與測試都不紅）；「不 import `./index.ts`」的斷言放在 DB 測試檔、`test:unit` 跑不到 → 新增 `referral-invite-deps.unit.test.ts`。（架構）
16. [P2]〔`/health` 慣例〕`REFERRAL_INVITE_SECRET`／`REFERRAL_EMAIL_INVITE_ENABLED` 沒有外顯訊號（同 `memberTokenConfigured` 的理由：Secrets 逐分支獨立）→ `/health` 加布林欄位、checklist 補一列。（架構）
17. [P2]〔測試隔離〕全站限流鍵在 `cleanupInvites` 不清，本機持久 DB 一小時內重跑約 4 次會假紅 → cleanup 統一重置。（架構）
18. [P2]〔文件一致性〕`e2e/journey/README.md` 的 marker 與里程碑、`docs/e2e-journey-test-design.md` 的檔案範圍與里程碑表沒有 80_；規格書 §7.1〔實作〕指標漏了 `api/referral-invite.ts`、`api/rate-limit-strict.ts`、refund migration；journey steps 直接伸進 `supabase_admin.session` 手組 URL（其餘 steps 都走 `tools/supa.py` 方法）；R2-3b 首次 hosted 實測會落在晉升 PR 的 `journey-full`。（架構）

另有交接類（不計入上表、皆為前端 session 待辦）：`@referral-invite-payload` alias 三處（vite alias、tsconfig paths、include）尚未接、progress 沒列（系統、架構）；前端一律依 code 映射文案、不讀 `err.message`（UI/UX、架構）。

## 需人工裁決

1. **逾時與孤兒帳號的補救方式**（P1-2，併需求 P2-8 崩潰窗口、P2-9 並行自助註冊）。選項：接受殘餘並記入 §2.5；逾時後延遲二次對帳；`sb()` 的 fetch 包 `AbortSignal`（GoTrue 斷線後是否回滾不確定）；改走「先 `createUser` 蓋章」路徑（R2-0 第 2 點未實測）。
2. **`invalid_email` 退額度與全站額度耗盡**（P1-3）：退額度規則是業主裁決 A。
3. **purge 判準與裁決 D 的措辭**（需求、系統）：信與規格書寫「7 天內未透過連結設定密碼即刪除」，實際判準是 email 未驗證——已 accept、設了密碼但 verify 沒完成的帳號第 7 天仍會被刪（plan 循環 2 的「accept 不延壽」與裁決 D 字面互相矛盾）。選項：改措辭為「未完成 email 驗證」，或 purge 排除已設密碼者。
4. **`weak_password` 三因一碼**（P2-12）：契約分碼或加欄位，或把 8／72 搬進 `_shared` 讓前端先擋。
5. **`validation_failed` 是否收窄**（P1-6a）：加成因判斷，或接受並記錄。
6. **總綱 E 與 A1a 面板段的空殼判準寫法**（架構）：實作與 purge 都是「`referral_invite` 為物件」，總綱仍寫 `is not null`。

## 處置(人審後填寫)

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。 -->

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
