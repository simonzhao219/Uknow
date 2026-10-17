# 註冊完成後仍可自助改寫身分資料與推薦人 修復紀錄

<!-- 由 /fix-bug 完整版從本模板實例化到 docs/plans/fix-<slug>/fix.md -->

分支:`claude/auth-register-completion-guard-12886h`(web session 預開分支)|重現測試(紅燈 commit):待填

來源:PR #378 留言 6230904825 審查發現 A1b-01(兩位反駁者皆確認)。

## 1. 症狀與重現

- `POST /auth/register`(`supabase/functions/api/index.ts` 的 register 路由)只有 `requireAuth`,
  不看註冊狀態。任何登入會員——包括已付款完成的正式會員——直接打這支 API 就能改寫自己的
  `name`、`national_id`、`phone`、`birth_date`、`referred_by_code`、`referred_by_user_id`,
  並把(已棄用的)`registration_step` 欄位寫回 1。
- UI 沒有入口:編輯模式只從 PaymentCheckout「編輯」→ `/auth/reset-registration`(已付款者回 400)
  → CompleteProfile(`location.state.editing`)進入。但 API 可以直接呼叫。
- 嚴重性:
  - 身分證字號是經營權的唯一鍵(事業手冊 1-1、2-3-3:變更身分證字號等於轉讓經營權,須書面申請與同意);
    它也是 `request_withdrawal` 唯一比對的身分欄位(規格書 §4.2「只驗身分證字號」)——
    可自助改寫等於可自助改寫提領的身分核對基準。
  - 推薦人在送出前有「推薦碼註冊後將永久綁定,無法修改」確認框。
  - `profiles.name` 是提領撥款時人工核對身分的依據(migration 20260726000002)。
- 重現測試:`supabase/functions/api/registration-completion-guard.test.ts`
  - 已完成付款者 `POST /auth/register` → 預期 403、身分欄位與推薦人不變(現況 200 且被改寫 = 紅)
  - **付款交易持有 profiles 列鎖期間**送出 register → 預期等 commit 後 403(只在 Edge Function
    先讀後寫的實作:回 200、訂單已 completed、姓名與身分證被改寫 = 紅;本機實測重現)
  - 付款前(step 0/1)送出、編輯模式重送、step 2 重送 → 照常 200(characterization,現況綠)
  - `PUT /auth/profile` → 預期 404(現況 200 = 紅)
  - `authenticated` 對 profiles 任何欄位的 UPDATE 權限 → 預期 false(現況 true = 紅)
- 業主裁決後納入的同類修補,各有紅燈:cancel-signup 讀取失敗 fail-closed、遮罩值拒寫搬到
  register、前端 403 出口與編輯守衛、續費頁編輯鈕

## 2. 根因

**狀態相依的寫入許可,被放在「不寫入的前置檢查端點」與 UI 導覽順序上,而不是寫入端點本身。**

1. migration 20260620000011 把 `registrationStep` 改成 `effective_registration_step()` 即時計算之後,
   `/auth/reset-registration` 從「狀態轉移」(寫 step 0)退化成純檢查:它不寫任何東西,只回答
   「你可不可以進編輯頁」。「已付款不可改資料」這條規則因此只活在「前端會先打 reset 再導去
   CompleteProfile」這個呼叫順序裡——是客戶端慣例,不是伺服器端不變式。
2. `/auth/register` 本身從未有狀態前置條件。0011 之前寫 `registration_step = 1` 會把已完成會員
   打回 step 1、症狀立刻可見;0011 之後該欄位已棄用(0719000005 的 column comment),
   寫回 1 沒有任何可見效果——漏洞從「會壞東西」變成「靜默」。
3. 第二層:migration 0009 的「混合模式」假設(前端 supabase-js 直接 update profiles)開了
   `grant update (name, phone, birth_date, national_id, bank_code, bank_account) to authenticated`。
   這個前提早已不成立(前端讀寫 profiles 一律走 Edge Function),0726 只收回 `name`、其餘
   「留待另案」。**本機實測(權限恢復原狀時)目前無法利用**:帶過濾條件的 PATCH 因
   `authenticated` 沒有 profiles 的 SELECT 而 403;不帶過濾條件的 PATCH 被 `authenticator`
   預載的 `safeupdate` 擋下(`21000 UPDATE requires a WHERE clause`)。兩道都是附帶效果、
   不是為此設計的防線——任一被改動(例如為讀取功能補 `grant select`),權限就變成可用的
   側門。收回權限是縱深防禦,讓「身分欄位只能經 Edge Function 寫入」成為明示的不變式。

**為什麼當時沒被發現**:`/auth/register` 的既有測試只測姓名格式;沒有任何測試列舉
「寫入端點 × 註冊狀態」的矩陣。「已完成付款不可 X」的守衛在 `reset-registration`、
`cancel-signup` 都有,審查者看到「編輯入口有守衛」就合理地以為寫入路徑也被保護——
守衛的位置和被保護的動作不在同一處。

## 3. 同類掃描

- 根因抽象成的 pattern:(a) 寫入 `profiles` 身分/推薦欄位的端點缺少「註冊已完成」前置條件;
  (b) 對 `authenticated` 開著、但前提已失效的欄位級 GRANT。
- 掃描方式:
  - `grep -n "from('profiles')" supabase/functions/api/index.ts` 逐一看 update 的欄位與守衛
  - `grep -n "update public.profiles" supabase/migrations/*.sql` 看 definer 函數寫了哪些欄位
  - `grep -n "grant update\|revoke update" supabase/migrations/*.sql` 看 profiles 的欄位權限
  - `grep -rn "from('profiles')" src` 確認前端沒有直連寫入
- 結果:

| 寫入點 | 欄位 | 判定 |
|---|---|---|
| `POST /auth/register` | 身分四欄 + 推薦人 | **本案**,加守衛 |
| `PUT /auth/profile` | 身分四欄 + 銀行兩欄 | **同病灶**。src 與 git 歷史都沒有呼叫端(前端 6 處 `/auth/profile` 全是 GET)→ 業主裁決**刪除端點** |
| `POST /auth/reset-registration` | 不寫入 | 不加。它已以「有 completed 訂單」擋已付款者(與 `effective_registration_step = 3` 同義),且不寫任何資料;它的守衛現在降為 UX 層的提早告知,真正的防線移到寫入端點 |
| `/payuni/prepare` fresh 分支 | 推薦人 | 不擋。規格書 §6.2/§7.4 明定「過期會員續費選新約可換推薦人」是唯一合法的自助換線路徑,有防重複、pending 提領等守衛 |
| `/rewards/upload-id-photos` | 證件照路徑、審核狀態 | 不屬身分欄位,不適用 |
| `/referrals/join-program`、admin 停權 | 旗標欄 | 不適用 |
| `request_withdrawal`(definer) | 銀行兩欄 | 合法寫入點,REVOKE 不影響 definer |
| `handle_new_user`(definer, INSERT) | phone、national_id 取自 metadata | 只在建帳號時寫、那時必然未完成註冊;本案不動(0726 已記為另案) |
| PostgREST 直連(`authenticated` 欄位 GRANT) | phone、birth_date、national_id、bank_code、bank_account | **同病灶 (b)** → 業主裁決**本 PR 收回**(表級 REVOKE) |
| `apply_referral_side_effects` 3a-bis 預設推薦人回寫 | 推薦人 | definer、在付款交易內,合法 |
| RLS `profiles_update_own` 含 `or is_admin()` | 五個自助欄 | 管理員 JWT 原本可直連改他人這五欄;REVOKE 一併關掉 |
| `DELETE /auth/cancel-signup` 守衛 | 刪帳號 | **同病灶的 fail-open**:讀取失敗當成「沒付過款」→ 刪除已付款會員並連鎖抹除金流紀錄 → 業主裁決**本 PR 一併修** |

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 守衛用既有的 `effective_registration_step()`。**檢查與寫入必須同一交易、同一把鎖**:系統審查指出、本機重現證實,Edge Function 先讀後寫時,UPDATE 會被付款交易的 profiles 列鎖擋住、commit 後照樣寫入;用腳本在付款期間連打即可命中,被改的推薦人會在下次 extend 續約 rewire,繞過 fresh 換線的帳本規則。業主裁決走完整版:`register_profile`(security definer)先 `for update` 同一把鎖再查進度再寫。鎖序:它只鎖 profiles、付款是 payment_orders → profiles,無環。RPC 失敗回 500(fail-closed)。step 2 不擋(業主裁決;付款失敗重試頁有「編輯」入口)。唯讀查 develop／正式站:已付款但資料未填齊者 0 / 0,守衛不會造成死巷 |
| 架構 | 點狀缺漏,不是架構缺陷:寫入集中在單一 Edge Function,補一道前置條件即可。刪除 PUT 讓 Edge Function 的身分欄位只剩一個寫入口,守衛不必在兩處維持一致 |
| UIUX | 「正常 UI 不會打到 403」不成立:停在編輯頁時另一個分頁付完款、或重新整理沿用舊 history state,送出就是 403,原本只有 3 秒 toast、表單留在原地。業主裁決:403 時 refreshUser 後帶回會員中心並說明(LINE 客服);`resolveProfilePageRedirect` 在 editing 下遇到 step 3(資料已填齊)導向 dashboard。續費頁「編輯」鈕對已鎖定者必定失敗 → 業主裁決同 PR 隱藏,明細區補聯繫客服說明 |
| 需求 | 規格書 §4.2 沒定義「註冊完成後能不能改」。CompleteProfile 的註解把 §4.2 姓名列的「修改時連動所有顯示介面」解讀為「姓名可以改」——本修法定義為:**付款前**可以改(編輯模式),**完成後**自助不可改、須聯繫客服(管理者代改為 A1b 另案)。同 PR 在 §4.2 補一句定義,並註明推薦人唯一的自助變更路徑是 §6.2/§7.4 的 fresh 續約 |

開放問題(已裁決,見上表);未處理、記入 friction-log:CompleteProfile「稍後註冊」對已付款者
吞掉 cancel-signup 的 400 後仍登出;客服代改的後台工具(A1b 另案)。

## 5. 修法與驗證

- 修了什麼(綠燈 commit):待填
  1. migration `20261017000002`:`register_profile`(security definer,只給 service_role)。
     `POST /auth/register` 驗證欄位、解析推薦碼後改呼叫它;`'completed'` → 403
     `註冊已完成，資料變更請聯繫客服`;RPC 錯誤 → 500。遮罩值(含 `*`)的身分證字號拒寫。
  2. 刪除 `PUT /auth/profile`;更新指向它的註解。
  3. migration `20261017000001`:`revoke update on public.profiles from authenticated`(表級,
     連帶清掉欄位級)。
  4. `DELETE /auth/cancel-signup`:守衛讀取失敗回 500、不刪。
  5. 前端:CompleteProfile 403 出口;`resolveProfilePageRedirect` editing + step 3 → dashboard;
     PaymentCheckout 對已鎖定者(isRenewal 或 step 3)不顯示編輯入口、明細補說明。
  6. 規格書 §4.1/§4.2/§6.2/§10.4/§2.2;跑 `check-spec-drift.py`。
- 為什麼這樣修是對的(對照根因):把「已付款不可改」從呼叫順序慣例,搬回**寫入本身**——
  而且與付款完成共用同一把列鎖,檢查與寫入之間沒有付款能插進來的空隙;再把繞過 Edge Function
  的 DB 直連寫入權限收回,讓這個不變式沒有側門。守衛讀的是全系統唯一的註冊進度來源
  (`effective_registration_step`),不另立判準——develop 上有 1 位已付款會員的
  `registration_step` 欄位不是 3,正是不能拿已棄用欄位當門禁的實例。

## 6. 防線回填

- 為什麼既有閘門沒攔到:測試只按「功能」組織(姓名格式、遮罩),沒有按「寫入端點 × 註冊狀態」
  組織;守衛和被保護的寫入不在同一端點,code review 看到入口有守衛就停止追問。
- 處置:待填(預定:registration-completion-guard.test.ts 釘住矩陣;friction-log 記一條
  「狀態相依的寫入許可要放在寫入端點,入口守衛只是 UX」)
