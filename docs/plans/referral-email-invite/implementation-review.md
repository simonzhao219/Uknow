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

業主 2026-10-26 裁決（需人工裁決 6 項）與處置。紅燈 `e625d0b`、綠燈隨後一批；規劃面的改動寫在 `plan.md` 檔頭「v3 增補」。

| # | 裁決 | 處置 |
|---|---|---|
| 1 逾時孤兒 | 接受殘餘並記錄 | `plan.md` §2.5 補三條殘餘（晚到提交、對帳時對方自助註冊、並行退額度燒 target）；R2-0 第 2 點成立後再評估「先 `createUser` 蓋章」 |
| 2 全站額度耗盡 | 信箱無效只退 target、per-user 照扣 | `classifySend` 對映表測試改為分列 target／per-user；規格書 §7.1 退額度句改精確 |
| 3 purge 與「設定密碼」措辭 | accept 一步完成驗證（後端一次設密碼＋驗證、前端以密碼登入） | 「有密碼、未驗證」的中間狀態不再存在，purge 判準與信中字面一致；契約改 `{ accepted: true }`、移除 `generateLink` 與 canary；journey 少一步 |
| 4 `weak_password` 三因一碼 | 前後端共用同一份密碼規則（現行註冊規則不變） | `_shared/password-policy.ts`＋`@password-policy` alias；accept 照擋並守 72 位元組 |
| 5 `validation_failed` | 維持並記錄 | progress 偏離第 8 條 |
| 6 總綱空殼判準 | 回修成物件判準 | 總綱 E.4、accept 段、purge 謂詞改「`referral_invite` 是 JSON 物件」 |
| 另：無碼 429（P2-11） | 視同寄件限流、退額度 | `classifySend` 以狀態 429 判定 |

不需裁決、直接處置：P1-1 補測（重寄 5xx 兩案、重寄先更新失敗、查帳號失敗、對帳查詢失敗、全站日窗）；P1-4 兩種告警以帳號去重；
P1-5 規格書；P1-6 progress 偏離第 8 條；P2-1（v3 改為「完成後再點同一連結 → 409、密碼不變」與並行案例）；P2-2 停權案例；P2-3 purge
JSON null／字串章；P2-4 規格書補句；P2-5 同意文案雜湊綁版號；P2-6、P2-18 文件；P2-7 已於 `0d44758` 移除；P2-8 蓋章不確定先查章；
P2-15 `referral-invite-deps.unit.test.ts`；P2-16 `/health` 兩欄＋checklist；P2-17 cleanup 重置全站鍵；P2-18 journey steps 改走
`tools/supa.py` 的 `api_post_public`／`rpc`。P2-13、P2-14 與 alias 交接寫進 progress「前端 session 交接」。P2-9、P2-10 列 §2.5 殘餘。

- [x] 人審完成,裁決:□ 通過 ☑ 修訂後通過(業主 2026-10-26 逐項裁決,見上表) □ 退回重規劃

---

# 前端段實作審查（循環 6–11、R2-3a UI、文件；2026-10-27）

審查對象：`feature/referral-email-invite` 相對 `origin/develop` 的 diff（排除 docs/plans）。四視角平行派工，只彙整不改判。

| 視角 | P0 | P1 | P2 |
|---|---|---|---|
| 系統 | 0 | 2（＋1 需人工裁決） | 4 |
| 架構 | 0 | 1 | 5 |
| UI/UX | 0 | 3 | 5（＋2 需人工裁決） |
| 需求 | 0 | 5 | 6 |

**共通結論**：P0 無。核心流程（accept 一步驗證→密碼登入→導向、錯誤只依 code、409 轉登入清密碼、三處入口閘門不變、
旗標單一出處、模板讀 `user_metadata.referral_invite_url`、全文「推薦人」）四視角都核對無缺口。P1 多為「偏離未記錄」。

## 處置

| 發現 | 處置 |
|---|---|
| 系統 P1：清過期 session 的 `signOut` 觸發 App 的 SIGNED_OUT 清掉邀請 token，重新整理回不到設定密碼 | 修：AuthPage 清理登出後寫回 token；補測 |
| 架構／系統／需求 P1：清 query 用 `useEffect`、`type="text"`、測試檔與 e2e 落點、live region 重播、`profile_steps` 連動等偏離未記錄 | 補記 progress「實作與規劃字面不同之處（前端段）」1–10 條；PR 偏離說明同步 |
| UI P1：送出時未先清空 live region | 修：送出即清；補測 |
| UI P1／需求 P1：失效文案與上游 D 字面不同 | 記為偏離（主 session 在 #399 要求三 code 分開）；`expired` 天數綁常數並補測 |
| UI P1：`invalid_token` 清了 token 卻沒說怎麼重試 | 修：文案加「請回到信件重新點一次連結」；補測 |
| UI P1／需求 P2：「你已登入」用 toast 非 `location.state.message` | 記為偏離（理由見 progress 第 7 條） |
| 需求 P1：缺「關閉重置」測試 | 補測（必敗收合後關卡再開歸零） |
| 需求 P1：忘記密碼路徑只有純函式測試 | 不自動化（需 hosted GoTrue recovery，R2-0 第 8 點）；列入 PR 業主真機驗收 |
| 需求 P1：checklist 不足以做正式站送達核對 | PR「業主操作」逐步寫出 curl、alias、核對標準、purge、渲染失敗處置 |
| UI P2：未勾同意的提示沒有錯誤樣式；受理訊息在輸入下一筆時殘留；無姓名時同意聲明空引號；骨架期間標題閃 Email 步驟 | 修；各補測 |
| 系統 P2：卸載 abort 守衛是死碼；accept 無逾時 | 修（卸載旗標；accept 25 秒逾時、補測） |
| 需求 P2：模板測試揭露句用字面 | 修：改用 `referralDisclosureSentence` |
| 架構 P2：mock 新方法插在 validate 註解與函式之間 | 修：搬回 |
| 系統 P2：4 秒逾時可能把慢速已登入者當未登入 | 不修（plan 審查 P1-18 定案）；殘餘 |
| 系統 P2：偽造連結的推薦碼先寫進 pending | 不修（與 `?ref=` 同風險，碼仍經本人確認與 validate） |
| UI P2：模板 `referral_invite_name` 空值 | 不修、列殘餘：後端未另擋空姓名（`referral-invite.ts` 資格段 `profile.name ?? ''`），但能寄的人都已完成 Step 2（姓名必填）、付款並加入推薦計畫，實務上到不了；前端邀請卡在無姓名時已不提供 Email 邀請 |
| 架構 P2：AuthPage 邀請狀態偏多；`browserDetection` 為測試替身放寬 | 不修；記為長期成本（再加入口模式時抽 `useInviteEntry`） |
| 〔需人工裁決〕邀請卡是否也帶揭露句 | 維持不加：ui-ux §13 第 5 條的「邀請卡」指 QR 邀請卡圖（`inviteCardImage`），本卡的同意聲明已寫明信中會顯示推薦人姓名、信件本身帶揭露句 |
| 〔需人工裁決〕`type="text"` vs `type="email"` | 維持 `text`＋`inputMode="email"`（理由見 progress 第 2 條） |

- [x] 處置完成（P0 無；P1 全數修或記錄），由主 session 審查 PR 時確認。
