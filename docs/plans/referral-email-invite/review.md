# Email 邀請（R2）規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent＋事實核對兩條 lane 而成。輸出契約見 docs/_templates/review.md。
     聚合規則：只彙整、去重、排序，不改判；重複發現合併時取各 lane 的最高嚴重度並標出所有來源。 -->

審查對象：`docs/plans/referral-email-invite/plan.md` v1（rebase 後為 commit `ebba574`；審後只套用了事實核對 lane 的三處引用更正，見文末「事實核對」）。
本檔的條目編號（P1-1～26、P2-27～63）被 plan.md v2 以「審查 P1-N／P2-N」引用。
上游：總綱 §2.3A（`1b9e709`）。四個 reviewer 都拿到總綱的段落行段與 GoTrue 原始碼副本（supabase/auth master `c3348e8`）。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 5 | 8 | accept 硬順序與單線可重入（對原始碼成立）；`rateLimitStrict` 三態；migration 純新增與 RLS／grants；TTL 放 `_shared` 與 spec-drift 十二條可實作；purge 恆晚於 token 到期 |
| 架構 | 0 | 5 | 9 | `_shared` 照 `@name-cases` 接線；`routeAfterVerifiedSession` 獨立檔與 `resolveInviteEntry` 進 `registrationFlow.ts`；`MyQrPage.tsx` 不改；api-contract 與 A1a 不同區段；CI 結構（只改 step env、不加 job）；測試分層命名；appShell 契約 |
| UI/UX | 0 | 9 | 10 | 資訊架構與 BottomNav；主鈕 `tone="flow"`；「改用其他 Email 註冊」是連結；旗標關閉時入口回到現況；未勾聲明時按鈕可按、按下才擋 |
| 需求 | 0 | 10 | 8 | §1「已定、不重議」清單；§6 沒有重開 K 段已裁題；§2.4 差異 4 未動 Q2-14 數字；§3.2 旗標缺省與 Q2-21 最終態不衝突；補足項都附理由、非腦補 |
| 事實核對 | 0 | 0 | 3 | repo 內 35 條：32 成立、3 部分成立、0 不成立；GoTrue 19 條：15 原始碼成立、2 部分、1 未核、1 不屬原始碼範圍（見文末） |

表內計數是各 lane 自報（架構 lane 表上寫 P2 9、清單實列 12，照錄不改）。合併去重後：**P0 0 條、P1 26 條、P2 37 條**（含事實核對 3 條；
跨 lane 重複的併入最高嚴重度那條，來源都標在條目上）。

## 發現清單（依嚴重度排序）

### P1

**資料與後端**

1. [P1]〔§2.4 差異 2、§2.3 限流表〕（SYS；REQ P2 同題）「退回本請求已扣的 strict 鍵」沒定義「已扣」：`bump_rate_limit` 超額也 `count+1`，若把回 `limited` 的 target 鍵也刪列，會清掉先到者佔住的名額、同一信箱 24 小時內可收第二封；全站鍵的樂觀退一讀到的是含他人 bump 的值，有流量時常失敗，且無 `count > 0` 守衛、窗口翻轉後可能扣成負數。per-user 兩窗在 503／GoTrue 格式拒收時也不退，計畫沒寫是有意。→ 寫死「只退本請求 bump 回 `allowed` 的鍵」，補「小時窗 allowed、日窗 limited 要退小時窗」；全站鍵 (a) 不退、或 (b) 新增原子 `refund_rate_limit(key)`（帶 `count > 0`，推翻「只有 purge 一支 migration」）；明寫 per-user 不退與 Q2-19「退額度」的涵蓋範圍〔需人工裁決 A〕。
2. [P1]〔§2.1、§2.4 差異 5、7〕（SYS、REQ）GoTrue 錯誤只用狀態碼描述：`email_address_not_authorized`、401／403（service key 錯）沒有出口，若落入「格式類 → `invalid_email`」，使用者看到「Email 格式不正確」且不告警；5xx／逾時／gateway 502 是**不確定結果**（GoTrue 可能已提交、信已寄），照計畫「退額度＋503」後，重試時看到無 `referral_invite` 的帳號依差異 3 回 202 不寄，形成永不清除、連結回 410 的孤兒；差異 5 補償刪帳號後 target 不退，推薦人重試只得 202、對方手上是失效的信；`deleteUser` 再失敗無處置；沒有 GoTrue 呼叫逾時設計。差異 7 把 Q2-19「寄送失敗＝暫時無法寄送」改成「Email 格式不正確」，是對裁決的例外但未標明。→ 以 GoTrue `error_code` 建對映表（`email_exists` 202＋退；`over_email_send_rate_limit` 503＋退＋告警；`email_address_invalid`／email 的 `validation_failed` 400＋退；`email_address_not_authorized`／401／403／其他 4xx 503＋告警；5xx／例外／逾時先以 `find_auth_user_by_email` 對帳再決定補蓋章、刪除或退 target）；補償路徑退 target、`deleteUser` 失敗另告警；差異 7 列為 Q2-19 明示例外〔需人工裁決 B〕。
3. [P1]〔§2.2〕（SYS）accept 的 GoTrue 錯誤對映只有 `weak_password` 與 5xx：密碼過長（bcrypt 72 byte，前端 `passwordPolicy.ts:19` 只擋下限）會成 500 → 503 `unavailable` → 前端「留在 2B 可重試」無限循環；`updateUserById` 404（與 purge 競態）應為 410；`generateLink` 422（並行 accept 已驗證）應為 409；`generateLink(invite)` 對不存在的帳號會自己建空白帳號，兩呼叫之間帳號被刪時會靜默產出無密碼、無蓋章的帳號。→ accept 也用 `error_code` 對映表；密碼過長對映成可復原 400、加上限前置檢查，上限數字由 R2-0 實測。
4. [P1]〔§2.3 purge、§5 循環 2、§3.1 文件列、§7〕（SYS、REQ）`p_email` 有值時是否仍套天數未定義（若仍套，客服對剛建的空殼「立即刪除」會靜默刪 0 筆）；回傳型別未定（0 筆時分不出「不存在」與「不符條件」）；只寫 revoke 沒寫 service_role grant；上游 §8.6 #12 的客服 purge SOP 在文件列只剩「README 函數表加 purge」。→ 明定 `p_email` 模式不套天數、回刪除筆數或狀態、寫 grant；補「新建空殼立刻 `p_email` 即刪」「已驗證帳號不被刪」案例；文件列補 SOP（誰、用什麼身分、呼叫什麼）。
5. [P1]〔§2.3 purge、§5 循環 2〕（REQ）Q2-16 與信內承諾是「7 天未完成註冊即刪除」，purge 卻以 `invited_at` 計齡，而 accept 的 `generateLink` 會覆寫 `invited_at`：點過 accept、沒完成 `verifyOtp` 的空殼活到「accept＋7 天」，連結早已失效、帳號仍在。→ 改以 `app_metadata.referral_invite.issued_at` 計齡並加「accept 後不延壽」案例；維持 `invited_at` 則改告知段措辭〔需人工裁決〕。
6. [P1]〔§5 循環 2、§2.4 差異 6〕（SYS）audit 同刪的測試若手造 payload，只證明自己的假設；`user_invited`／`user_modified`／`user_signedup`／`user_deleted` 都寫 email，每次 accept 再加列；差異 5 的 `deleteUser` 與既有 `cancel-signup`（`index.ts:795`）刪掉的帳號，其 audit email 永久殘留，purge 只清自己刪的 id。→ 循環 2 對本機 GoTrue 真做 invite／update／generateLink／deleteUser 再 purge，斷言 `audit_log_entries` 無任何 `payload::text` 含該 email；把 audit 清理抽成可傳 id 的內部函式給補償路徑共用；cancel-signup 殘留列入 §6。
7. [P1]〔§0、§5 開工條件、progress.md、§2.4〕（ARCH、REQ）上游 §8.1 R2 列的前置含「R2-0 結論」，plan 改成「不擋開工」卻沒登記為差異；循環 2（audit 謂詞、hosted 權限）、4（spike 第 2 點）、5（第 3、4、7 點）押在未實測的行為上；本機 postgres 是 superuser，「全綠」不代表 hosted cron 跑得動，cron 失敗也不寫 `system_alerts`。→ 在 §2.4 登記差異並逐循環寫所需的 R2-0 點，或把本機特徵測試放進最前一個循環；或 §6 請業主明裁；另加 purge 失敗的可觀測訊號（例：超過 8 天的 R2 帳號數納入既有告警檢查）〔需人工裁決〕。
8. [P1]〔§5 循環 1–3、7、末段、§6 第 4 題〕（ARCH；REQ P2 同題）循環 1–3 都不呼叫 `find_auth_user_by_email`，卻標「擋於前置」；末段說 7 不依賴前置，但 7 的開工條件是循環 1；第 4 題的前提因此錯，且它是執行排序不是業主題。→ 1–3 開工條件改「無」，#390 只擋 4、5，B 擋 4、9、11；第 4 題改問「#390／B 未合併時是否先做 1、2、3、6、7、10」或刪除。
9. [P1]〔§3.1 `api/referral-invite.ts`、§2.3 常數〕（ARCH；SYS P2 同題）常數留 `index.ts`、處理函式在 `referral-invite.ts`，常數與未 export 的 `rateLimit` 怎麼進去沒定：反向 import `index.ts` 是循環匯入（單元測試會拖進整個 Hono app），模組內重寫是兩份，搬進模組則 `rate-limit.unit.test.ts` 的守衛靜默失效（`windows.length >= 4` 仍綠）。→ 寫死「常數留 `index.ts`，由路由註冊處組 `deps.limits`（連同 `rateLimit`、`logSystemAlertOnce`、`read`、`now`）傳入處理函式工廠」，並加「模組不得 import `./index.ts`」的測試。
10. [P1]〔§5 循環 8、§3.1 `App.tsx` 列〕（ARCH；FACT #13 佐證）「App.tsx 豁免以既有 App 測試或新案例釘」——repo 沒有任何 App 測試，`App.tsx:162` 是 `loadUserProfile` effect 內的行內比較，要 render 整個 App 才測得到；這是 R2 唯一修既有 bug（FACT-02）的一行。→ 抽成 `registrationFlow.ts` 純函式（例 `shouldBounceToCompleteProfile(pathname)`）table-driven 釘三種路徑，`App.tsx` 只呼叫它；退路是在 `appShell.test.ts` 加原文契約並寫明。
11. [P1]〔§2.1 `rate_limited`＋`scope`、§4、§3.1〕（ARCH；SYS P2 同題）`apiRequestJson` 失敗時只組 `ApiError(message, status, code)`（`apiClient.ts:15-24`、`:153-159`），`scope` 到不了前端；`scope` 在 body 哪一層、是否入契約也沒寫。→ 三選一寫死：(a) 拆 `rate_limited_hour`／`rate_limited_day`（與上游 D 寫法不同，要登記差異）；(b) 擴 `ApiError` 帶 `details` 並補測試；(c) InviteCard 用 `apiRequest` 自解 body〔需人工裁決〕。

**UI/UX**

12. [P1]〔§4 邀請卡片〕（UX）手機鍵盤下的卡片版面與開啟焦點沒定義：`ui/dialog.tsx:41` 的 `DialogContent` 置中、無 `max-h`／`overflow`；375×667 鍵盤開啟時標題＋欄位＋聲明＋主鈕＋結果約 380px，大於約 330px 可見高度，主鈕與結果被蓋住且捲不到（`dvh` 不追鍵盤，待真機）；Radix 開啟即聚焦 email 欄、彈鍵盤，蓋住多數人要按的「快速分享」。→ `max-h-[90dvh] overflow-y-auto`（先例 `JoinReferralProgramDialog.tsx:89`）、手機貼上緣、`onOpenAutoFocus` 改聚焦標題或內容容器、擋下與結果出現時 `scrollIntoView({ block: 'nearest' })`；真機驗收補「375 寬、鍵盤開啟、填 email 後主鈕與結果可見」。
13. [P1]〔§4 結果呈現、§3.1〕（UX）快速分享的回饋只走 toast（`referralInvite.ts:50-57,112-127`；LINE 內建瀏覽器的主要路徑），而 `ToastContainer` 在 `#root` 內、Radix modal 會把 `#root` 標 `aria-hidden`（依 Radix 行為推論、待測），卡片開著時 toast 對讀報器靜音；`shareReferralInvite` 是 fire-and-forget，分享完卡片仍擋在畫面上。→ (a) 按快速分享後立即關卡；或 (b) 卡片不關、傳一個寫進卡片 live region 的 `showToast` adapter；決定寫進 §4〔需人工裁決〕。
14. [P1]〔§4 文案對照〕（UX）上游 D 的 `unavailable`「請改用邀請好友或複製連結」與 `rate_limited`(day)「…或改用邀請好友」寫於裁決卡片之前，卡片內沒有那兩個控制項，要切去快速分享得先清空 email；`disabled` 沒有出口；`disabled`／`restricted`／`not_joined` 重試必敗，卡片仍讓人再填再按。→ 錯誤旁給行內連結「改用快速分享」（不清 email），或改句指向實際控制項；收到這三個 code 後本次收合 email 與聲明區；措辭〔需人工裁決〕。
15. [P1]〔§4 文案對照〕（UX）沒有「無 code」的失敗分支：`NETWORK_ERROR`（`apiClient.ts:96-100`）、非 JSON 的 5xx、未知 code、401（`:192-208` 觸發 signOut＋導登入頁，卡片連輸入一起卸載）。→ fallback：`NETWORK_ERROR`／未知／無 code 都映到 `unavailable` 那句並保留輸入；明寫 401 的處置。
16. [P1]〔§4 邀請卡片〕（UX）卡片的標題、欄位標籤、輔助說明沒有逐字文案（D 只定了按鈕、聲明、結果句）；「一顆主鈕依有無 email 切換」的唯一理解線索就是這段，且要過禁用字樣測試；讀報器使用者聽不到按鈕改名與聲明長出。→ 補逐字（`DialogTitle`、「Email（選填）」、一句說明如「填寫 Email 由 Uknow 代寄邀請信；留空則用 LINE 等 App 分享連結」），說明以 `aria-describedby` 掛在 email 欄；文案交業主定〔需人工裁決〕。
17. [P1]〔§4 邀請卡片〕（UX）狀態轉換缺三塊：在途時 email 與勾選仍可改（成功後清空會吃掉新輸入、結果與畫面收件人不一致）、在途關卡結果無處落；live region 何時清除未定、連續兩次相同錯誤不會重播；關閉再開是否重置未定（勾選是對「這一次寄送」的同意）。→ 在途 `readOnly`／`aria-readonly`＋勾選凍結、關閉時 abort；送出開始先清空 live region；email 變動清舊錯誤；關閉即卸載（`{open && <InviteCard/>}`）。
18. [P1]〔§3.3、§4 被推薦人側〕（UX）骨架沒有退場條件：`getSession()` 拋錯或 token refresh 拖很久（無逾時）就卡在骨架，重新整理後 token 已不在、落回空白步驟 1；骨架形狀與標記未定。→ `rejected` 視同無 session；約 3–5 秒逾時後同樣處理；骨架用 §5 的 `<output aria-busy="true" aria-label="載入中">`、形狀照 2B。
19. [P1]〔§5 循環 8、9〕（UX；REQ P2 同題）上游 I 的「溢版巡檢加兩畫面」被漏掉；vitest 的「44px」在 jsdom 量不到實際尺寸。→ `e2e/test_overflow_sweep.py` 加兩條 `SweepRoute`（`?invite=<假 token>`，前端不驗簽、Python 不必算 HMAC；開卡用 `after_load`，先例 `_open_id_card_dialog`），資料帶長 email 與長姓名；44px 改 e2e 實量。
20. [P1]〔§6 開放問題 1〕（UX）token 只在元件 state，行動版重新整理（切密碼管理員、切回信箱 App、WebView 被回收）會丟失且畫面無提示，比 §6 描述更迫切；支持 (b) `sessionStorage`，並補三細節：只在無 `?invite` 且路由為 `/register` 時還原並照常跑 `resolveInviteEntry` 與 session 判斷；accept 成功、`already_accepted`、「改用其他 Email 註冊」、解碼失敗時清；登出時清。選 (a) 則在契約 1 缺口欄寫明已接受〔需人工裁決〕。

**需求與上線**

21. [P1]〔§1 驗收「上游 J 原樣適用」〕（REQ）J 第 3、4 條與 D／E 對不上：改簽章段仍會進 2B（前端只解碼不驗簽），送出後 `invalid_token` 才轉 2A；改 payload 段會讓簽章不符、accept 被拒，到不了完善資料頁；未過期的已接受連結先看到 2B、送出後 409 才切 2A。→ 重寫三條預期（含「要送出一次密碼」），列入附錄 B；循環 8 加「簽章被改 → `invalid_token` → 2A」案例。
22. [P1]〔§5 循環 9〕（REQ）上游 I 元件 vitest 首項「閘門」（未加入者仍是「加入推薦計畫」引導鈕、卡片只對已加入者開）被丟掉，只剩旗標兩案。→ 補 `InviteFriendButton` 與 `InviteFriendPanelContent` 的閘門案例。
23. [P1]〔§4 信件、§5 循環 11〕（REQ）信中「年費 NT$1,200」（4-1-2(3) 付費事實句）未綁 `YEARLY_PRICE`（`src/utils/constants.ts:14`，`check-spec-drift.py:107-110` 已把關），改價時信件會靜默說錯價。→ 模板測試斷言信中金額＝`YEARLY_PRICE`。
24. [P1]〔§4 信件、§5 循環 11、R2-3〕（REQ）Q2-15 固定主旨沒有落點：主旨是 Dashboard 獨立欄位、不在 repo 的 html，測試斷言不到，R2-3「貼模板」沒提貼主旨，checklist 也沒列；漏設會寄出預設英文主旨。→ checklist 加「主旨欄＝固定句」，列入 R2-3 業主操作與快速檢查表。
25. [P1]〔§5 R2-3、§3.2〕（REQ；ARCH P2 同題）R2-3 沒講清誰在什麼時點做什麼：正式站收信核對要在「開 env 前」，但寄得出要後端 env 已開、操作卡片要前端旗標已開；J「各收 3 封」與「同一信箱 24 小時 1 封」衝突，測試產生的正式站空殼清理方式未寫；收信核對須在晉升 PR 合併、migration 與函式上線之後，開工條件涵蓋不到；journey 檔案在 §3.2 歸 R2-2、§5 R2-3 歸「隨本分支」、上游 I 歸 R2-3，且循環 1–11 沒有一個承擔它。→ 列有序步驟表（develop：貼模板與主旨、設 secret、開 env、開旗標；正式站：同序＋收信核對：先開後端 env、前端旗標維持關、以業主 token curl 端點收信，通過後才開旗標重建），每步標操作者與先決條件；收信用 `+alias` 位址，空殼以 `p_email` 清；journey 拆 R2-3a（分支內：檔案與 `--collect-only`、`check-workflows.py`）與 R2-3b（合併後：業主操作）。
26. [P1]〔§2.5 第一項〕（REQ）「推薦人 uuid 進被邀請人 JWT」由規劃者自行列為已接受殘餘，但規格書 §4.2 明寫推薦碼驗證「回應只有推薦人姓名與刊登名、不含任何 id」，上游 E.6 也刻意不讓 uuid 進被邀請人可讀處。→ 改存可由推薦碼後端解回的資訊、不放 uuid，或列 §6 請業主明裁〔需人工裁決〕。

### P2

**系統**

27. [P2]〔§5 循環 3、4〕（SYS）缺案例：target `limited` 不動 target 鍵；小時窗 allowed＋日窗 limited 要退小時窗；同信箱並行請求（`Promise.all`）GoTrue 只被呼叫一次、兩者皆 202；所有不寄分支斷言無副作用（GoTrue 未呼叫、`confirmation_token`／`invited_at`／metadata 不變、無新 target／global 列）——「回應同形」不等於沒寄。`withRestTableFailure` 只攔 `/rest/v1/`，造 GoTrue 失敗需指定注入縫（攔 `/auth/v1/*` fetch 或注入 stub `sb`）。循環 5 的反向順序案例只測 GoTrue 自己，釘順序的是正向「verifyOtp 成功＋signInWithPassword 成功」，反向案例留作 GoTrue 升級 canary。→ 補案例並指定縫。
28. [P2]〔§2.2、§3.3 契約 2〕（SYS）並行 accept（雙分頁）：`UpdatePassword` 會 `Logout` 該使用者全部 session（`internal_models_user.go:435-464`），頁 2 會把頁 1 剛建好的 session 踢掉並改密碼；頁 2 的 `generateLink` 422 無出口。→ 422 對映 409、在已接受殘餘補一行、加並行 accept 測試斷言最終只有一個密碼能登入。
29. [P2]〔§2.2 `disabled`、§3.3 契約 3〕（SYS）accept 的 `disabled` 沒有前端分流；kill switch 會連已寄出的合法連結一起打死（purge 照跑）。→ 定義前端行為（可復原、稍後再試）；評估 accept 只受 secret 閘門、不受寄信旗標〔需人工裁決 E〕。
30. [P2]〔§2.4 差異 3、5〕（SYS）空殼重寄「先寫 metadata 再寄」：寄送失敗時 `by`／`code`／`issued_at`／`consent_at` 已指向新推薦人，漏斗歸屬與 CompleteProfile 後備預填指向一封沒送達的信。→ 失敗時以 lookup 回來的舊 `referral_invite` 回寫。
31. [P2]〔§2.1〕（SYS）契約表小缺口：沒有 401（慣例 `{ error: '未授權' }, 401`，`index.ts:894`）；`FRONTEND_URL` 要去結尾斜線（`index.ts:87`、`:2724`）；「基本格式」要定成嚴格文法（拒顯示名稱、引號、角括號、逗號、空白），正規化後要與 GoTrue 存入值一致，lookup 與 target sha256 才對得上；`+tag`／Gmail 點號別名可繞過「同一信箱 24 小時一封」。→ 補 401、去斜線、文法；別名寫入殘餘或正規化。
32. [P2]〔§2.3〕（SYS）兩個不變式沒有守衛：「token 效期 ≤ purge 天數」只靠兩句規格各自釘數字；purge 的 audit 刪除若逐 id 掃全表會拖垮 cron。→ 加 `TTL 天數 ≤ purge 預設` 斷言；audit 刪除寫成對候選 id 陣列的 set-based `= any(array)`。
33. [P2]〔§3.3 `resolveInviteEntry`〕（SYS）前端以裝置時鐘判 `expired`，時鐘偏快會把有效連結導去失效路徑。→ 前端判過期只改提示、不阻擋 accept，以伺服器 `expired` 為準〔需人工裁決〕。

**架構**

34. [P2]〔§3.1 `backendConstants.ts`、§2.3、§4〕（ARCH）前端取後端數字有兩套機制（TTL 走 alias，24 小時／purge 天數走 fs＋regex）；D 的 `rate_limited`(hour)「每小時最多寄 5 封」未綁常數；`backendConstants.ts` 是第三個對 `index.ts` 原文跑 regex 的消費者，A1a 拆 `index.ts` 時三處各自壞；抽不到時是否拋錯未寫（undefined 對 undefined 會假綠）；沒有歸屬循環、沒有自己的測試。→ 抽不到即拋錯＋負向測試、歸入循環 9、斷言「5 封」；評估把使用者看得到的數字集中到單一 `_shared` 檔。
35. [P2]〔§3.1、§3.4、上游 §8.2〕（ARCH）deps 形狀未與 A1a 的 `api/deps.ts` 對齊、處理函式簽章（`(c, deps)` 或 `(input, deps)`）未定；`rateLimitStrict` 與退額度是通用原語，放功能模組內日後別處得反向 import。→ 寫出簽章與「A1a 的 `deps.ts` 先合併時改引用它」；考慮把限流原語拆成獨立小檔。
36. [P2]〔§3.3 契約 3〕（ARCH）accept 失敗分流沒有落點；「錯誤怎麼分類」是 `registrationFlow.ts` 的職責（先例 `classifyLoginError`）。→ 加純函式（例 `classifyInviteAcceptError(code)`）放 `registrationFlow.ts`，隨循環 7 table-driven 釘住。
37. [P2]〔§3.4〕（ARCH）撞檔漏列與 B 的重疊：`vite.config.ts` alias 與 `tsconfig.json` paths／include（同一插入點）；ui-ux §13 第 5 條（B 新增子項，R2 的改寫句沒包含它）；`supabase/README.md` 函數表（#390 與 R2 各加一列）。→ 補進 §3.4，寫「R2 改寫第 5 條時保留 B 的子項」。
38. [P2]〔§3.2〕（ARCH）照 `.claude/rules/e2e-tests.md` 本機先 `npm run dev` 再 `pytest`，旗標不在，改過的 `dashboard_smoke` 兩條會紅；同一變數要在三處設。→ 提交 `.env.development`（Vite 只在 dev mode 讀，production build 不受影響）取代三處設定；Pages 只有 Production／Preview 兩個作用域，「develop」實為 Preview（涵蓋所有 PR 預覽），請明寫；旗標寫退場條件（正式站穩定 N 週後刪建置旗標、留後端 kill switch）。
39. [P2]〔§5 循環 1、2、4、8、9〕（ARCH）規格書 §7.1 由三個循環分段寫入，表上只在循環 4 列；`constant_violations` 抽不到句子會紅，所以每個綠燈 commit 要帶自己的句子；契約區塊（含 accept schema）整塊在循環 4 出貨、accept 在循環 5 才實作；循環 8、9 消費契約卻沒列循環 4 為依賴；循環 4、5 的「body 全等」沒用 `assertShape`。→ 逐循環寫各自的規格句與契約段；invites 契約隨 4、accept 契約隨 5；8、9 加依賴；以 `assertShape` 驗形。
40. [P2]〔§5 循環 4〕（ARCH）單一循環約 20 個案例；§2.1 的檢查順序本身是切縫（查帳號前不碰 GoTrue）。→ 建議拆 4a／4b，由實作者判斷。
41. [P2]〔§2.3、§5 循環 10〕（ARCH）`app_metadata.referral_invite` 形狀只存在於散文，寫入端（循環 4）與讀取端（循環 10）各自假設。→ 型別放 `_shared/referral-invite-payload.ts` 兩端共用。
42. [P2]〔§3.1 `useInviteAccept` 列〕（ARCH）依賴欄「下兩者」依表序指向 `routeAfterVerifiedSession` 與模板檔，是筆誤。→ 改為 `routeAfterVerifiedSession`、`@contract`、`buildApiUrl`（公開端點沿用 `fetch(buildApiUrl(...))`，`AuthPage.tsx:146`）與循環 7 的分類函式。
43. [P2]〔§3.3 約束 2〕（ARCH）`AuthPage.tsx:43-87` 掛載時會驗證現存 session、404／410／401 就 signOut；計畫另以 `getSession()` 判斷，殘留的已刪除帳號 session 會被判成「已登入」，此時 query 已清、新邀請連結白費、落空白步驟 1。→ 寫明這條路徑的預期，或沿用既有 effect 的驗證結果〔需人工裁決〕。
44. [P2]〔§7、§3.4、R2-3 開工條件〕（ARCH；REQ 補充同題）空殼在 `profiles` 有 `name=''` 的列、會進後台會員列表與統計，排除交 A1a；R2-3 開工條件只列 R2-1／R2-2，最壞每日多 1,000 列空白會員且無標示。→ 擋：正式站開旗標加「A1a 空殼排除已合併」；接受：§7 寫明〔需人工裁決〕。

**UI/UX**

45. [P2]〔§4 結果呈現〕（UX）`invalid_email`／`self_invite` 是欄位錯，卻只落在鈕下 live region，欄位無 `aria-invalid`、焦點不回欄位；未勾聲明時焦點未移到勾選框；沒提 `<form noValidate>`（`AuthPage.tsx:134` 先例）。→ 欄位錯設 `aria-invalid`＋`aria-describedby` 指向同一 live region 節點（不放第二份文字）、焦點回欄位或勾選框、卡片用 `<form noValidate onSubmit>`。
46. [P2]〔§4 在途狀態〕（UX）`aria-disabled` 三陷阱：`Button` 的 `loading` prop 設原生 `disabled`（`button.tsx:180`，照抄 AuthPage 會讓焦點掉到 body）；`aria-disabled` 外觀要自補（先例 `SystemNotifications.tsx:325`）；email 欄按 Enter 的隱式提交不受 `aria-disabled` 擋。→ 不用 `loading` prop、補外觀、`onSubmit` 與 `onClick` 同樣 guard。
47. [P2]〔§4、`ui/dialog`〕（UX）卡片唯一的關閉手段是 16px 的 X（`ui/dialog.tsx:47-50`，無 `pointer-coarse` 放大、sr-only 名稱為英文「Close」；對照 `ui/sheet.tsx:77-80` 48px「關閉」）。→ 把 `ui/dialog` 的 X 對齊 Sheet（童子軍，LegalDialog 也受益），或卡片尾加次要「關閉」；44px 斷言納入 X。
48. [P2]〔§4 被推薦人側〕（UX）2B 暫時性錯誤（`rate_limited`、`unavailable`、`verifyOtp` 兩次失敗）只寫「行內」，位置與 role 未定；持久提示換步驟後是否清除未定；2A 密碼欄與步驟 1 email 欄有 `autoFocus`（`AuthPage.tsx:372,415`），長提示會被鍵盤蓋住。→ 同一提示元件與位置、統一 `role="alert"`、換步驟或再送出即清除、帶持久提示落地時不 autoFocus 或先聚焦提示。
49. [P2]〔§4 2A 靜態提示〕（UX）與「過期」「已接受」持久提示同畫面時指令相反，且對所有一般登入者常駐。→ 持久提示出現時隱藏靜態提示；靜態提示用小字放在忘記密碼列下方、`aria-describedby` 掛在忘記密碼鈕。
50. [P2]〔§4 被推薦人側〕（UX）「改用其他 Email 註冊」是本地狀態重置不導頁，形態與版位未定；2B 按鈕列 `flex gap-3` 兩個 `flex-1` 少一顆會破版。→ `<button type="button">`＋連結樣式（照 `AuthPage.tsx:421-429`）帶 `pointer-coarse:min-h-[44px]`；「註冊」整寬、連結在下方置中。
51. [P2]〔§4 信件〕（UX）模板可讀性三處：「側邊 padding ≤ 24px」沒說是兩層合計（`confirm-signup.html:11` 外層已左右各 20px）；純文字網址約 200 字元無空白，缺 `word-break:break-all`／`overflow-wrap:anywhere` 會撐破或被截；告知九要素連成一段難掃讀。→ 寫明合計、斷行樣式、告知段改「標籤：內容」列，由模板測試斷言。
52. [P2]〔§4 勾選重置〕（UX）「email 一變即取消勾選」的「變」未定義（貼上聯絡人多尾端空白、自動修正會讓剛勾完就被取消）；「有內容」是否 trim 未定。→ 以 `trim().toLowerCase()` 比對；email 欄加 `autoCapitalize="none" autoCorrect="off" spellCheck={false}`；取消勾選時給可聽見的提示。
53. [P2]〔§4 溢字〕（UX）聲明列 `flex items-start`＋`Label flex-1` 長姓名縮不了（需 `min-w-0 wrap-anywhere`）；`DialogContent` 是 grid、不可斷字串會撐容器；受理句遮罩地址應走 `BreakableEmail`。→ 卡片測試加長姓名與長網域兩案，並納入第 19 項巡檢。
54. [P2]〔§3.1 CompleteProfile 後備預填〕（UX）新增的 `getSession()` 是非同步，回來時使用者可能已開始打字，會蓋掉輸入。→ resolution 時以 functional `setState` 重判欄位仍空才填、再驗證，沿用 `isVerifyingCode`。

**需求**

55. [P2]〔§5 循環 8〕（REQ）D 失敗分流的 `rate_limited`／`unavailable`「留在 2B 可重試」沒有逐案測試。→ 循環 8 補兩案。
56. [P2]〔§6 第 3 題〕（REQ）log 殘留同一個事實也削弱 Q2-23「立即刪除」與信內「刪除這次邀請建立的帳號資料」。→ 題目擴成「承諾措辭＋客服 SOP 是否須註明 log 殘留」〔需人工裁決〕。
57. [P2]〔§3.2〕（REQ）上游 D「都改成先開同一張卡」與 F「表單只在旗標開啟時渲染」對旗標關時的行為未定，plan 採「整張卡不開」是規劃者詮釋。→ 列入附錄 B，並在 ui-ux §13 第 5 條註明旗標移除後的措辭。
58. [P2]〔§1 需求摘要〕（REQ）「畫面不顯示邀請人與推薦碼訊息」漏了範圍限定：A 指的是設定密碼畫面，完善資料頁依 J 與規格書 §4.2 仍要顯示推薦人姓名。→ 補「（設定密碼畫面）」。
59. [P2]〔§3.3 契約 2〕（REQ）「accept 後 `verifyOtp` 未完成 → 改走 `/register`」回路只靠全 mock e2e 覆蓋，證偽不了 GoTrue 實際行為；建議的 spike 第 8 點順測要由監工另行通知 R2-0。→ 註明誰負責驗、驗不到的後果。
60. [P2]〔§1 用語稽核〕（REQ）漏了 K 原文的「測試腳本」（模板測試的禁用陣列本身含「傳銷」「直銷」「下線」，缺這詞會讓實作者以為測試檔也要改寫）；Q2-14 少了「超額文案見 E.5」（非實質）。→ 補回。

**事實核對**

61. [P2]〔§2.1〕（FACT #1）「`{ success: false, error: { code, message } }` 是既有慣例（`index.ts:901`、`:2964`）」——`:901` 是 `{ valid: false, error: … }`。**已更正於 plan.md**。
62. [P2]〔§3.1 CompleteProfile 列〕（FACT #16）預填 effect 本體在 `:249-259`（註解 `:247-248`），原寫 `:248-259`。**已更正**。
63. [P2]〔§3.2 e2e 列〕（FACT #28）`e2e/README.md` 沒有「先 `npm run dev` 再 `pytest`」那句（那句在 `.claude/rules/e2e-tests.md`）；README 的落點是 `## Running` 段 `:41-44`（`E2E_SKIP_DEV_SERVER`）。**已更正**。

## 需人工裁決

業主拍板後再改 plan.md；P1 的修訂方向多數已在各條「→」裡，下表只列**要業主選**的。

| # | 題目 | 來源 | 選項（reviewer 傾向） |
|---|---|---|---|
| A | 全站鍵要不要退額度 | 1 | 不退（把全站窗當 GoTrue 呼叫上限）／新增原子 `refund_rate_limit` migration（推翻「只有 purge 一支」）；per-user 不退要不要寫明 |
| B | GoTrue 失敗對映與新建路徑 | 2 | 差異 7 是否作 Q2-19 明示例外；補償是否退 target；新建路徑是否改「先 `createUser` 蓋章、再 `inviteUserByEmail`」交 R2-0 評估（會動差異 3 與 purge 謂詞） |
| C | purge 計齡基準 | 5 | `issued_at`（accept 不延壽）／維持 `invited_at` 並改告知段措辭 |
| D | 告知段「完成註冊」的定義 | SYS | accept 還是付款——已 accept 未付款的帳號 purge 不刪；上游 G「7 天未接受即刪」與 F「逾期未完成註冊」措辭不一 |
| E | R2-0 是否擋實作 | 7 | 擋（逐循環列所需 spike 點）／不擋（本機特徵測試放最前一個循環） |
| F | 前置未合併時是否先做不依賴的循環 | 8 | 1、2、3、6、7、10 先做／全部等前置 |
| G | `scope` 傳遞 | 11 | 拆 code／擴 `ApiError`／自解 body |
| H | 推薦人 uuid 進被邀請人 JWT | 26 | 不放 uuid（改存可由碼解回的資訊）／接受 |
| I | 快速分享後卡片去留 | 13 | 立即關卡／不關、改寫入卡片 live region |
| J | 錯誤出口句措辭 | 14 | 行內「改用快速分享」連結／改句指向實際控制項 |
| K | 卡片逐字文案 | 16 | 標題、Label、說明句由業主定 |
| L | 2B 重整丟 token（plan §6 第 1 題） | 20 | (b) `sessionStorage`＋三細節（UX 支持）／(a) 照上游 |
| M | 受理文案（plan §6 第 2 題） | plan §6 | 業主定改句；UX 建議拆三個 `<p>`（狀態／條件／提醒）放同一 live region |
| N | log 管線殘留與承諾措辭（plan §6 第 3 題） | 56 | 告知段與客服 SOP 是否註明 |
| O | kill switch 是否關 accept | 29 | accept 只受 secret 閘門／一起關 |
| P | 同意聲明版本 | SYS | 加 `consent_version`（成本極低）／不加 |
| Q | 前端時鐘判過期 | 33 | 只改提示、以伺服器為準／照現設計 |
| R | 殘留 session 吞掉新邀請連結 | 43 | 沿用既有 effect 的驗證結果／寫明預期 |
| S | 開正式站旗標與 A1a 空殼排除的順序 | 44 | 等 A1a／接受最長 7 天的空白會員列 |
| T | 受理文案的遮罩粒度 | UX | `a***@` 只看得出網域錯字；要達 PM-11「發現輸錯」需多露（如前 2 個＋最後 1 個） |

## 事實核對（第五列的明細）

**repo 內事實**（唯讀 subagent codebase-scout 逐條核 35 條）：32 成立、3 部分成立（上列 61–63，已更正）、0 不成立。佐證其他視角的兩點：沒有任何 App 測試覆蓋 `App.tsx:162`（→ 第 10 項）；CI 上 dev server 由 workflow 先起、port 已開，`e2e/conftest.py` 的 fixture 直接 no-op，所以 CI 生效的是 `ci.yml` 的 env，`conftest.py` 只影響本機自動起。

**GoTrue 行為**（主 session 讀 supabase/auth master `c3348e8` 原始碼；Supabase 官方文件站本環境連不到）：plan.md 附錄 A 的 19 條——15 條原始碼成立（含新增 G8、G15、G16、G17、G19）、2 條部分（G9 `hashed_token` 回應組裝未讀、G13「丟 query」未讀）、1 條未核（G14，R2 不依賴）、1 條不屬原始碼範圍（G18，hosted 權限）。**原始碼成立 ≠ hosted 實測成立**：hosted 行為一律仍由 R2-0 對應點承接，R2-0 結論貼入前不寫成已實測。系統視角另從原始碼補出：`generateLink(invite)` 對不存在的帳號會自建（→ 第 3 項）、`UpdatePassword` 會 `Logout` 全部 session（→ 第 28 項）。

## 處置(人審後填寫)

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

本輪 P0 為 0，無需豁免。P1／P2 原樣保留、未改判。

業主 2026-10-26 裁決 A～T（[PR #393 留言 6410017491](https://github.com/simonzhao219/Uknow/pull/393#issuecomment-6410017491)，
監工補充 [6411556654](https://github.com/simonzhao219/Uknow/pull/393#issuecomment-6411556654)）：業主直裁 E、F、S、H、I、J、K、M、T、N、D，
監工代裁 A、B、C、G、L、O、P、Q、R；其餘 P1（第 3、4、6、9、10、12、15、17、18、19、21～25 條）與全部 P2 照各條「→」修訂，不再裁。
plan.md 已修訂為 v2（落點見其附錄 C）；P0 為 0，不重跑 `/review-plan`。

- [x] 人審完成,裁決:□ 通過 ■ 修訂後通過(業主 2026-10-26,見上方留言連結) □ 退回重規劃
