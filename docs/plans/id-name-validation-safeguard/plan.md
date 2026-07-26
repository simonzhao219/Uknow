# 註冊姓名格式防呆 規劃書

<!-- v4:折入 v3 四視角審查的 10 個 P1 與 7 個 P2(見 review.md「v3 審查」節)。
     v1→v4 的裁決與發現全數保留在 review.md,勿在此重述。 -->

## 0. 一句話

讓註冊「資料完善」步驟的姓名欄位在填寫當下就擋下明顯不是身分證本名的輸入
(帳號/暱稱/英數亂碼),並把防線補到資料庫層,因為姓名是提領撥款時**人工
核對身分**的依據,填錯要到那時才會被人眼發現。

> 措辭校正:`request_withdrawal` 與 `/rewards/withdraw` **只驗
> `national_id`,完全不檢查 `name`**。姓名唯一被看到的地方是
> `WithdrawalManagement.tsx` 的 `IdCardDialog` 這類**人工目視**欄位。
> 早期版本寫「提領時會被發現」容易讓人誤以為有自動比對,實際上沒有。

## 1. 使用者需求

- 對照規格書:`docs/uknow-software-specification.md` §4.2「真實姓名｜用於
  提領驗證;修改時連動所有顯示介面」。
- 現況缺口(規格書未記錄,本規劃補上依據):
  - 前端 `validateName`(`src/utils/profileValidation.ts:22`)只檢查非空與
    ≤10 字元,不檢查內容。
  - 後端 `POST /auth/register`(`index.ts:456`)只擋 `!name`;
    `PUT /auth/profile`(`index.ts:503-535`)對 `name` **完全沒有格式驗證**。
  - **資料庫層有兩條繞過路徑**:(a) `20260620000009` 對 `authenticated`
    開放 `name` 的 column-level UPDATE GRANT,可直接打
    `PATCH /rest/v1/profiles`;(b) `handle_new_user()`(`security definer`)
    把 `raw_user_meta_data ->> 'name'` 直接寫進 `profiles.name`,而該
    metadata 是任何人呼叫公開 signup 端點就能帶入的(只需 anon key、免 OTP)。
  - UI 已有正確意圖(`CompleteProfile.tsx:546` placeholder 寫「請輸入身分證
    上的姓名」),但那只是提示,背後沒有規則把關。
- 觸發案例:推薦網絡頁出現二代顯示名「z···m」。`maskNameByGen` 對含中文的
  姓名用「首字＋○＋末字」、對純英數用「首字＋•••＋末字」——遮罩樣式本身
  就洩漏了該筆 `profiles.name` 不含中文。
- 驗收情境:見 §2.2 必測案例表。
- **不做(明確排除)**:
  - 不串接第三方 KYC 做身分證影像/戶政資料比對。
  - 不動既有提領身分驗證機制(`IdNumberVerification`、`/rewards/verify-id`)。
  - **不清洗、也不清點既有的非中文姓名紀錄**(人審裁決)。後果須明示:
    觸發本次規劃的那筆「z···m」以及其他既有髒資料,在推薦網絡與提領管理
    後台會**維持現狀、無限期可見**;這些帳號日後提領也不會被任何程式碼
    攔下(提領只核對身分證字號),發現與否純看 admin 有沒有人工注意到,
    而不清點代表連殘留規模都不會知道。
    **例外(v3 審查 P1,框架陳述校正)**:見 §7「這不是純粹的『不回溯』」。
  - **不撤銷 `phone`/`birth_date`/`national_id`/`bank_code`/`bank_account`
    的 authenticated UPDATE GRANT**——與 `name` 同屬 `20260620000009` 開放的
    同一類繞過面,其中 `national_id`/`bank_code`/`bank_account` 比 `name`
    更敏感,但一次撤五欄會擴大風險面,留待另案評估。
  - **`handle_new_user()` 的 metadata 注入路徑本次只堵 `name`**——同一支
    函式也把 `phone`、`national_id` 直接寫自 `raw_user_meta_data`
    (`20260620000009:53-55`),與 `name` 屬**同一條攻擊路徑**(公開 signup
    端點、免 token、`security definer` 繞過任何 GRANT)。本次不處理,
    留待另案。**寫在這裡是為了避免下一個讀者以為改完這支函式就把它的
    資安面清乾淨了**(v3 審查 P1)。
  - 不處理 `nationalId` 唯一性檢核(規格書 §14 #1,性質不同)。
  - 不補 `phone`/`birthDate`/`nationalId` 的後端格式驗證(留待另案)。

## 2. 系統設計

### 2.1 姓名格式規則

**兩種模式,由表單切換鈕控制,預設中文:**

| 模式 | 字元集 | 空格文法 | 長度上限 |
|---|---|---|---|
| 中文(預設) | 僅**中文字元**(`HAN_RANGE`,見 §2.3) | **恰好 0 或 1 個**半形空格;有空格時**兩邊各至少 2 字** | 10 |
| 外文 | 僅 `A-Z`/`a-z` | 單字間**單一**半形空格,可多段;每個單字**首字母須大寫**,其餘字母大小寫不限 | 50 |

**兩模式共同**:不接受標點符號、數字、全形空格;空格不得出現在開頭或結尾、
不得連續。

**空格文法必須明確定義**(v3 審查 P1):最自然的實作
(`^[HAN]+( [HAN]+)*$`)會放行「王 小 明」(三個單字元群組)與「谷 辣」
(兩個單字元群組),與動機案例「谷辣斯 尤達卡」的形狀不符,而前後端可能
各自實作出不同結果卻仍全綠。故中文模式限定「恰好 0 或 1 個空格、每邊至少
2 字」,並在案例表加入這兩個探針。

**間隔號的處置(人審裁決)**:不放行任何間隔號碼點。原住民漢字音譯姓名與
新住民歸化漢名**改以半形空格分隔**(`谷辣斯 尤達卡`)——這是中文模式允許
半形空格的唯一原因。緩解機制見 §4(**主動轉換**,不是只丟一句錯誤訊息)。

### 2.2 前端嚴格依模式、後端採聯集——刻意的不對稱

人審裁決「切換鈕要有真正的強制力」。這條只能在**前端**成立:

- 後端只收到 `name` 字串。若新增模式參數,攻擊者只要宣稱 `mode='foreign'`
  即可繞過「預設中文」的意圖——**模式旗標沒有任何安全價值**。
- 因此:**前端依切換鈕狀態嚴格把關**(中文模式下含任何拉丁字母一律拒絕,
  `Peter` 在中文模式被拒);**後端採聯集規則**(合乎中文規則**或**外文規則
  即通過)。
- 兩者職責不同:後端是**安全邊界**,擋任何模式下都不合法的垃圾;前端是
  **UX 引導**,確保「預設你該填中文」有強制力且錯誤訊息永遠對得上當下模式。
- 架構視角的補充論證:兩者關係是**子集而非相等**——後端只需涵蓋「前端任一
  模式所接受的」。相較「前後端須完全相等」的設計,這個不對稱對漂移**更
  容錯**:前端抓寬抓窄一點,只要仍落在後端聯集內,頂多 UX 落差,不會變成
  安全破口。

**必測案例表**(階段 1、2 共用):

| 輸入 | 中文模式 | 外文模式 | 後端(聯集) |
|---|---|---|---|
| `王小明` | ✅ | ❌ | ✅ |
| `谷辣斯 尤達卡` | ✅ | ❌ | ✅ |
| **`王 小 明`**(空格文法探針) | ❌ | ❌ | ❌ |
| **`谷 辣`**(空格文法探針) | ❌ | ❌ | ❌ |
| `John Smith` / `JOHN SMITH` | ❌ | ✅ | ✅ |
| `Mary Jane Watson` | ❌ | ✅ | ✅ |
| **`Peter`**(切換鈕強制力探針) | **❌** | ✅ | ✅ |
| `john smith` | ❌ | ❌ | ❌ |
| `谷辣斯·尤達卡` | ❌(訊息須引導改空格) | ❌ | ❌ |
| `z1234567m` / `testuser` / `王John` / `王小明123` | ❌ | ❌ | ❌ |
| ` 王小明` / `王小明 ` / `王  小明` | ❌ | ❌ | ❌ |
| CJK 擴充 A 區(`㐀`)、相容表意文字(`豈`)邊界字元 | ✅ | ❌ | ✅ |
| `{name:null}` / `{name:123}` | — | — | ❌(回格式不符,**不得拋錯**) |
| 中文 11 字 / 外文 51 字 | ❌(長度訊息) | ❌(長度訊息) | ❌ |

### 2.3 中文字元判定:重用既有 `HAN_RANGE`,不重寫

判定一律以 `HAN_RANGE`/`HAS_HAN`(`index.ts:2380-2382`)為準:

- 該正則的註解記載過一次真實事故(NFC 正規化誤判導致 emoji 姓名觸發 500),
  重寫一份等於重踩。
- 若驗證與 `maskNameByGen` 對「什麼算中文」認定不一致,會出現「通過驗證的
  姓名在推薦網絡頁仍顯示英數樣式遮罩」——原地重現本次要解決的症狀。
- **前端無法共用該常數**(Deno / Vite 兩個隔離 runtime),必須新寫一份。
  要求:**逐字複製 `㐀-鿿豈-﫿`** 並註解標明出處,
  **不得**改用範圍較窄的 `一-龥`。案例表已含三個 range 的邊界字元
  當機械探針。
- 順手把 `HAN_RANGE`/`HAS_HAN`/`HAN_LEAD` 三個常數搬到檔頭共用工具段(與
  `verifyNationalId` 同段)。已 grep 確認唯一引用點是 `maskNameByGen` 與
  `sortNodeIds`,純位置搬移無時序風險。

> **殘留風險(v3 審查 P1)**:`HAN_RANGE` 只涵蓋 BMP 內的統一表意文字與
> 相容表意文字,**不含擴充 B 區以上**(JS 中為 surrogate pair)**與造字區**
> ——對應台灣戶役政行之有年的「缺字」問題。關鍵在於**這個正則的職責被升級
> 了**:它過去只用於遮罩顯示(不匹配僅是樣式不精準),這是第一次被當成
> **註冊關卡**,同一個涵蓋落差的後果變成「兩個模式都過不了、完全無法完成
> 註冊」。**開工前應以既有 `profiles.name` 樣本查證是否為真實會撞到的
> 族群**;若查證後風險成立,需比照間隔號給出逃生口(最低限度:錯誤訊息
> 引導聯繫客服),不可靜默擋人。

### 2.4 長度上限分模式,同步五處

| 位置 | 值 | 理由 |
|---|---|---|
| `validateName`(前端) | 依模式:中文 10、外文 50 | 精準把關 |
| 後端驗證函式 | 聯集:≤50 | 安全邊界只需擋離譜值 |
| `CompleteProfile.tsx` `maxLength` / onChange 守衛 | **一律 50** | 見下 |
| `formDraft.ts` `MAX_LEN.name` | **50(取兩模式較大值)** | 見下 |
| `profileValidation.ts` 的 `ProfileFormValues` interface | 新增模式欄位 | 見 §3 |

- **`formDraft` 必須取較大值,不是照抄 10**:草稿層只是防炸儲存體的粗篩。
  若留在 10,外文使用者填 `Christopher Nolan`(17 字元)後遇頁面卸載重整,
  `sanitizeDraft` 會靜默截斷成 `Christophe`——**而截斷後的字串仍會通過格式
  驗證**,等於把一個格式合法但錯誤的姓名寫進要用來核對身分的欄位。
- **onChange 守衛一律放寬到 50,不得依模式收緊**:現行守衛
  `if (e.target.value.length <= 10)` 是**靜默丟棄超限按鍵、不顯示任何錯誤**。
  若綁模式,外文使用者在預設中文模式下打到第 10 字元後按鍵直接被吞,連一句
  可查找的訊息都沒有。超限與否交給 blur 驗證訊息處理。
- 外文上限 50 **已定案**(非開放問題):`profiles.name` 是 `text` 無 DB 長度
  限制(`20260620000001_initial_schema.sql:21`);已查無下游長度依賴(提領走
  人工匯款);50 足以涵蓋 `Christopher Nolan`(17)與絕大多數長姓名。

> **後端中文分支的殘留寬鬆(v3 審查 P2,刻意取捨)**:後端聯集規則的中文
> 分支沿用 50 上限(與外文共用),故純中文不含空格的長字串(如某字重複
> 20 次)繞過前端直打 API 時會被判合法。這不是「任何模式都不合法」的垃圾,
> 而是「規則上合法但不像真實姓名」。接受此寬鬆:後端的職責是擋垃圾不是
> 擋怪,為中文分支另訂上限會讓聯集規則需要知道模式,與 §2.2 的設計相悖。

### 2.5 資料庫層防線:兩條路徑都要堵

**(a) 撤銷 column-level GRANT**:

```sql
revoke update (name) on public.profiles from authenticated;
```

`20260620000009` 當初開放的理由(註解:「混合模式——完善個人資料會是前端
直接 update profiles」)**前提已不成立**:前端 supabase-js 直連只用於
`listings`/`public_listings`(逐條查證見 §3)。撤銷是收回遺留權限。

**(b) `handle_new_user()` 不再從 metadata 帶入 `name`**(人審裁決)。

> **必須貼完整 SQL(v3 審查 P1)**:`create or replace function` 在 Postgres
> 是**整段覆蓋**,無法只改一行。該函式的真實定義在
> `20260620000009_auth_profile_hardening.sql:30-63`(非更早的
> `20260620000003`,後者已被取代),內含推薦碼解析邏輯——**漏抄就會靜默
> 清空日後所有新註冊使用者的 `referred_by_user_id`**。依
> `supabase/README.md` 的既定寫法,新 migration 須寫明基準版本與唯一差異。

**基準版本:`20260620000009_auth_profile_hardening.sql`。唯一差異:INSERT
的 `name` 欄位由 `coalesce(new.raw_user_meta_data ->> 'name', '')` 改為
`''`。其餘(`v_ref_code`/`v_referrer` 解析、`phone`/`national_id`/
`referred_by_code`/`referred_by_user_id` 四個欄位、`on conflict do nothing`、
`security definer`、`set search_path`、末尾的 `revoke execute`)逐字照抄。**

為什麼非堵不可:該 metadata 是任何人呼叫公開 signup 端點時可任意帶入的
`data` 參數,且函式是 `security definer`——撤銷 GRANT 與端點驗證對它完全
無效。不堵的話 (a) 等於白堵。

對正式使用者是**行為不變更**:`AuthPage.tsx:294-297` 的
`supabase.auth.signUp({email, password})` 從未帶 `data.name`,該欄位在正式
註冊流程本就恆為 `undefined`。唯一受影響的是刻意利用此機制的測試 helper
(見 §2.6)。

### 2.6 `createTestUser` 改寫:採 service_role 直寫(已拍板)

`test-helpers.ts:33-51` 的 `createTestUser` 正是靠 metadata 帶入姓名,
§2.5(b) 落地後會失效。**兩個候選不等價,規劃直接拍板**(v3 審查 P1):

| 方案 | 判定 |
|---|---|
| **(a) service_role 直寫 `profiles.name`** | ✅ **採用**。唯一能保留 `phone`/`birth_date = null` 不變式的選項;同檔 `fillBasicProfile` 已是既有前例 |
| (b) 改呼叫 `POST /auth/register` | ❌ 該端點要求 `name`/`phone`/`birthDate` 皆非空,補上會讓 `effective_registration_step` 從 0 變 1,**直接打壞 `registration-step-contract.test.ts:62-72`**(該檔 `:64-65` 註解明文依賴現行機制);且每個使用者多兩次網路往返,而 helper 有 **37 個測試檔、132 處呼叫** |

**連帶工作**:`registration-step-contract.test.ts:64-65` 的註解在改用直寫後
會變成事實不符的過期敘述,須一併更新。metadata 只保留 `referred_by_code`
(至少 14 處呼叫依賴 trigger 內建的推薦人解析)。

### 2.7 API 變更

- `POST /auth/register`:姓名格式不符回 `400`,訊息比照 `validateNationalId`
  的「規則說明＋(例:…)」同句格式。
- `PUT /auth/profile`:同規則、同訊息。**只在 `body` 含 `name` 鍵時觸發**
  ——該端點是逐欄位局部更新。
- **型別防禦**:`body.name` 可以是 `null`/數字/物件。新函式須先做
  `typeof name === 'string'` 檢查,回傳「格式不符」**而非拋錯**。
- **兩支函式都要 `export`**:新驗證函式(比照 `resolvePayuniConfig`)與
  **`maskNameByGen`**——階段 2 的一致性斷言要直接呼叫它。

## 3. 架構影響

- 動到的模組:
  - `src/utils/profileValidation.ts`:`validateName` 改寫為依模式驗證;
    **`ProfileFormValues` interface 新增模式欄位**(`validateProfileForm`
    需要 `values.mode`;與 `ProfileDraft` 是無繼承關係的獨立型別,v3 審查
    P2 指出的第三個平行型別)。
  - `src/utils/formDraft.ts`:`MAX_LEN.name` → 50;`ProfileDraft` interface
    新增模式欄位;`sanitizeDraft` 對該欄位須用 **allow-list 檢查**(仿
    `agreedToTerms`),**不可掛進 `MAX_LEN` 沿用字串截斷**——模式是只有 2 個
    合法值的 enum,走截斷路徑會讓被竄改的值(如 `"xyz"`)被當成合法草稿
    寫回 UI state,打破該模組「型別不符即丟棄」的設計原則。
  - `src/components/CompleteProfile.tsx`:切換鈕、長度連動、間隔號主動轉換、
    確認框合併、`EMPTY_FORM` 新增模式預設值。
  - `src/components/admin/WithdrawalManagement.tsx`:`IdCardDialog` 加一句
    靜態說明(見 §4 末)。
  - `supabase/functions/api/index.ts`:新增 `export` 驗證函式(檔頭共用工具
    段);`HAN_RANGE` 等三常數搬到同段;`maskNameByGen` 加 `export`;
    兩個端點接上驗證。
  - `supabase/functions/api/test-helpers.ts`:`createTestUser` 改 service_role
    直寫(§2.6);新增 anon key 常數與 PostgREST 直連 helper(階段 3 前置)。
  - `supabase/functions/api/registration-step-contract.test.ts`:更新 `:64-65`
    的過期註解。
  - `supabase/migrations/`:新增 migration(撤 GRANT + 改 `handle_new_user`)。
  - `e2e/journey/run_state.py` + **`e2e/journey/tools/` 下的新測試**(階段 5)。

- **繞過路徑查證(七面向)**——查證的是**已知的七條路徑,不宣稱窮盡**:
  1. **前端 `src/**`**:supabase-js 直連只碰 `listings`/`public_listings`。
  2. **e2e 兩套件**:`e2e/` 全 mock;journey 的 `rest_update` 走 service_role
     且唯二呼叫點目標是 `subscriptions`。
  3. **後端 client**:只有 `sb()` 與 `adminClient()`,皆 service_role。
  4. **DB 內部 UPDATE**:migrations 中 11 處 `update public.profiles` 全在
     `security definer` 函式內;且掃 `set\s+name\s*=` **零筆**——
     `profiles.name` 在 migrations 內從未被 UPDATE 過。
  5. **後續 migration**:`20260620000009` 之後無任何 migration 再調整
     `profiles` 的 authenticated GRANT(`20260717000001:18-21` 註解反向佐證)。
  6. **admin 路徑**:走 Edge Function,後端用 `sb()` 或 definer 函式。
  7. **`handle_new_user()` 的 INSERT**(§2.5(b) 處理)——前六點的掃描範圍是
     UPDATE 陳述式與 `.from('profiles')` 呼叫,**INSERT 經 trigger 這條路
     兩者都不覆蓋**。
  - v3 審查獨立複查三個額外角度亦無第八條:`auth.users` 上只有
    `AFTER INSERT` 無 `AFTER UPDATE` trigger(故無
    `auth.updateUser({data:{name}})` 這條路);`anon` 對 `profiles` 零 GRANT;
    `index.ts` 內 4 處 `.from('profiles').update(` 只有 2 處寫 `name`。

- **multi-step-flow 四契約**:新增的模式狀態必須撐過表單卸載。**有兩條
  prefill 路徑,都要處理**:(a) 草稿還原(`loadProfileDraft`);(b)「編輯」
  回填(`CompleteProfile.tsx:66-93` 的 `isEditing`,獨立於草稿之外)。
  兩條都要能依既有姓名內容還原正確的初始模式。
- 效能:純字串檢查,無額外查詢。

## 4. UI/UX

- **模式切換鈕**:採**兩選項同時可見的 segmented control**,比照
  `src/components/home/HomeViewToggle.tsx`(`role="group"` 包兩顆原生
  `<button>`,各帶 `aria-pressed`,當前態浮起)。固定放在**姓名欄位正上方**。
  - **兩個選項用可見文字標籤:「中文姓名」/「外文姓名」**——**不複製
    `HomeViewToggle` 的純圖示形式**(v3 審查 P2):中文/外文沒有像 3 欄/2 欄
    那種自然的圖示隱喻,做成純圖示會直接牴觸「單顆變態鈕是低可發現性形狀」
    這個選型理由本身。
  - 不採 UI 準則 §8 的「顯示/隱藏密碼」單顆變態鈕:低可發現性,外文姓名
    使用者可能根本沒注意到有切換,卡在錯誤訊息裡出不去——註冊流程死巷。
  - a11y:`aria-pressed` + 原生 `<button>`(專案現有三個同類切換鈕皆如此)。
- **間隔號主動轉換**(v3 審查 P1,取代「只丟一句錯誤訊息」):
  在 onChange/onPaste 偵測到間隔號時**立即代換成半形空格,並顯示一句可見
  提示**(如「已將間隔號轉換為空格」)。理由:原設計是純被動流程——使用者
  打完 → 離開欄位 → 看到錯誤 → 自行找出特殊符號 → 刪除 → 改打空格,六個
  步驟扛住法定命名權族群的註冊成功率;主動轉換把中間三步歸零。
  **不可靜默代換**——沒有提示會讓使用者以為系統認不得他的名字。
  偵測清單至少含 `·`U+00B7、`‧`U+2027、`・`U+30FB;**通用錯誤訊息另加一句
  兜底**「如果你打的是分隔符號,請改用半形空格」(v3 審查 P2:清單可能不
  窮盡,如 `•`U+2022、`･`U+FF65 在部分輸入法或證件 OCR 貼上時常見,
  只靠精準偵測會原地重現同一個死巷)。
- **錯誤訊息**比照 `validateNationalId` 的「規則說明＋(例:…)」格式:
  - 中文模式字元不符:`姓名須為中文字（例：王小明）` +(視覺分行)
    `非中文姓名請點上方「外文姓名」`——拆兩個 `<p>` 提升 375px 下的掃讀性。
  - 外文模式字元不符:`外文姓名僅限英文字母，每個單字首字母大寫（例：John Smith）`
  - **超長(字元合法但太長)**:`姓名最多 N 個字元`(依模式帶入 10 / 50)
    ——v3 審查 P1:這是獨立案例,沿用「姓名須為中文字」去回應一個**全是
    合法中文字、只是太長**的輸入會給出事實錯誤的提示。
- **計數器**:顯示**當前模式**的上限(`3/10`,切換後 `3/50`)。中文模式下
  可打到 11~50 字(貼上長字串,或外文內容切回中文後保留原文),此時計數器
  顯示實際字數與當前模式上限(`23/10`)並**加警示色**,配合上面的超長錯誤
  訊息;不靜默吞鍵。
- **切換模式時保留已輸入文字**,只換驗證規則與提示文字(清空會讓誤觸的人
  整串重打)。
- **送出前確認與推薦碼確認框合併為單一對話框**,沿用既有
  `showNotification`。**完整 `message` 文案**(v3 審查 P2,消除臆測空間):
  > 推薦碼註冊後將永久綁定,無法修改。姓名將用於日後提領時核對身分,
  > 請確認與身分證一致。請再次確認以下資訊是否正確。

  `details` 陣列同時列出姓名與推薦碼資訊。**不可沿用原本只講推薦碼「永久
  綁定,無法修改」的句子涵蓋姓名**——規格書 §4.2 明載真實姓名「修改時連動
  所有顯示介面」,姓名是可以改的,沿用是錯誤陳述。
- **確認旗標須涵蓋姓名**:現行 `hasConfirmedReferralCode`
  (`CompleteProfile.tsx:45`)只在推薦碼變更時重置(`:636-640`)。合併後
  若使用者確認過一次、回頭改姓名再送出,確認框不會再跳出,新姓名從未被
  確認就送出。→ 姓名變動也要重置,且**旗標改名**以反映涵蓋兩個欄位。
- **a11y 順手還債**:把既有但全專案零使用的 `getInputAriaProps`
  (`formHelpers.tsx:33-39`)接上姓名 `Input`,範圍只限本次觸碰的欄位。
- 行動版:沿用既有 `FieldError` 與 onBlur 驗證時機。
  `/auth/complete-profile` 已在 `e2e/test_overflow_sweep.py` ROUTES 內。
- **後台提領審核加一句說明**(v3 審查 P1,UI/UX 與需求兩視角獨立命中):
  `WithdrawalManagement.tsx` 的 `IdCardDialog` 把系統姓名與身分證照片並列供
  admin 目視比對,而半形空格政策會讓兩者**系統性對不上**(照片印
  「谷辣斯·尤達卡」、系統顯示「谷辣斯 尤達卡」),admin 可能誤判姓名不符
  而退件——**傷害正好落在這條規則想保護的族群身上**。→ 在該對話框加一句
  靜態說明:「原住民/新住民姓名可能以半形空格取代身分證間隔號,屬正常
  註冊規則」。

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 前端 `validateName` 依模式驗證 + 分模式長度 + `ProfileFormValues` 型別 | `src/utils/profileValidation.test.ts`(node) | §2.2 案例表全綠,含 `Peter`、`王 小 明`、`谷 辣`、CJK 邊界字元、超長四類探針 |
| 2 | 後端 `export` 驗證函式(聯集、重用 `HAN_RANGE`、型別防禦),接進兩端點;`maskNameByGen` 加 `export`;常數搬家 | `api/*.unit.test.ts` + `api/*.test.ts` | 跑**同一份**案例表的後端欄;`{name:null}`/`{name:123}` 回 400 不拋錯;不含 `name` 的 `PUT /auth/profile` 維持局部更新;通過驗證的中文姓名經 `maskNameByGen(gen=2)` 必為中文遮罩樣式 |
| 3 | **前置**:`test-helpers.ts` 加 anon key 常數 + PostgREST 直連 helper;`createTestUser` 改 service_role 直寫(§2.6)+ 更新過期註解。**主體**:migration 撤 GRANT + 改 `handle_new_user`(完整 SQL,§2.5(b)) | `api/*.test.ts`(需 `supabase start`) | 使用者 token 直寫 `profiles.name` 被拒;帶 `data.name` 呼叫 signup 後 `profiles.name` 為空字串;**帶 `referred_by_code` 的 signup 仍正確解析出 `referred_by_user_id`**(防漏抄);既有 Deno 測試套件全綠 |
| 4 | 表單切換鈕、長度連動與計數器警示態、間隔號主動轉換、兩條 prefill 路徑的模式還原、草稿 allow-list、確認框合併與旗標重置 | `src/components/CompleteProfile.test.tsx`(jsdom pragma)+ `src/utils/formDraft.test.ts` | 切換後驗證與提示同步改變且保留文字;貼上含間隔號的姓名會自動轉空格並顯示提示;模式撐過草稿與 `isEditing` 回填;外文長姓名存草稿重整後不被截斷;竄改的模式值被丟棄回預設;超長時顯示長度訊息與計數器警示;送出只跳**一個**確認框且同列姓名與推薦碼;確認後改姓名再送出,確認框重新出現 |
| 5 | 收尾:規格書 §4.2、journey 姓名產生器、後台 `IdCardDialog` 說明 | **新增 `e2e/journey/tools/` 下的離線測試** + `python3 scripts/check-spec-drift.py` | §4.2 補上格式規則;**新測試直接斷言 `run_state.new_user()` 產生的 `name` 通過新規則** |

- **階段 1、2 共用同一份案例表**(§2.2):兩個 runtime 隔離必然各寫一份實作,
  案例表共用可讓單邊改規則忘了同步時立刻紅燈。
- **階段 3 的前置不是選配**:現有 `test-helpers.ts` 只有 `adminClient()`
  與 `getUserAccessToken()`,後者回傳的 token 在既有測試中一律只餵給
  `app.request()`(Hono in-process),**不經過 PostgREST 閘道**;而整個
  `supabase/functions/**` 沒有任何 `SUPABASE_ANON_KEY` 的讀取或本地 fallback。
  不先補這個,階段 3 開工當下就卡住。
- **階段 5 的測試落點必須新增,不能只填 `pytest tools/`**(v3 審查 P1):
  `run_state.py` **不在 `tools/` 目錄下**,且 `tools/` 現有三支測試都測其他
  模組——照原規劃字面執行會**全綠卻什麼都沒驗到**,只能等排程或晉升 PR 才
  發現,正是本階段自己警告的「晚且貴的失敗點」。須新增一支能被
  journey-offline 軌跑到的測試,直接斷言姓名產生器的輸出。
- **階段 5 的 journey 修改是必須的**:`run_state.py:59` 以
  `name=f"測試{run_id}{node}"` 產生姓名,在新規則下**必定被拒**。
  develop 的 `8cafd94` 之後又多一層:該 commit 以同一支產生器在 develop 種了
  **持久化的 45 人示範資料**,任何再次執行的種樹流程都會在註冊階段失敗。

## 6. 開放問題

- [ ] **〔需人工裁決〕純羅馬拼音登記姓名的分隔慣例**:依《姓名條例》部分
      原住民族可單獨以羅馬拼音(非漢字音譯)登記法定姓名。若這類登記傳統上
      沿用與漢字版本相同的分隔符號慣例(本名與父名之間),外文模式現行規則
      (僅 `A-Z`/`a-z` 與單一半形空格)會同樣擋下;而 §2.1 的空格容許在
      文字上只綁定中文模式。審查者環境無法查證戶政實務,**若官方轉寫慣例
      本就用空格則本來就合法、非問題**。→ 開工前用戶政資料或既有會員樣本
      確認;若存在同類需求,外文模式應延伸相同的空格容許。
- [ ] **`HAN_RANGE` 缺字族群的實際規模**(§2.3 殘留風險):開工前以既有
      `profiles.name` 樣本查證是否有擴充 B 區以上或造字區字元。

## 7. 風險與回滾

- **誤擋合法使用者**——本案最高風險,已有三層處置:
  (a) 中文模式允許半形空格(原住民漢字音譯與新住民歸化漢名);
  (b) §4 的間隔號**主動轉換 + 可見提示**,不再依賴使用者自行察覺;
  (c) 通用錯誤訊息帶兜底句,不仰賴精準偵測特定 codepoint。
  **殘留**:`HAN_RANGE` 的缺字涵蓋落差(§2.3)、純羅馬拼音姓名的分隔慣例
  (§6)——兩者都列為開工前查證項。
- **半形空格政策的下游後果**:提領審核時系統姓名與身分證照片**系統性
  對不上**,admin 可能誤判退件。已由 §4 末的 `IdCardDialog` 靜態說明緩解,
  但那只是提示、不是強制——admin 仍可能忽略。
- **這不是純粹的「不回溯」**(v3 審查 P1,框架陳述校正):§1 說「新規則只在
  寫入時檢查、不回溯校驗」,但 `/auth/register` **身兼「新註冊」與「編輯
  既有資料」兩種語意**——`CompleteProfile.tsx` 的 `handleSubmit` 對兩者走
  同一個端點、同一份全欄位驗證。因此「已完成步驟 1、尚未付款」的舊帳號
  按「編輯」時,即使只想改手機,整份表單(含未變動的舊姓名)也會重新過
  驗證而被擋下。
  **裁決:接受此行為,不另做豁免。** 這批帳號尚未付款成為會員,在付款前
  被要求把姓名填對正是本功能要的效果;錯誤訊息已足夠明確(§4),不構成
  死巷。**但 §1 的「不回溯校驗」措辭對這批帳號不成立,故在此明文校正**
  ——已付款會員不受影響(`registrationFlow.ts` 會把他們導離該頁)。
- **既有髒資料維持現狀**:見 §1。推薦網絡與後台無限期可見,提領時也不會
  被程式碼攔下。
- **改 `handle_new_user` 的連帶風險**:`createTestUser` 依賴該路徑,已由
  §2.6 拍板改寫方向並列入階段 3;**漏抄推薦碼解析邏輯會靜默清空
  `referred_by_user_id`**,階段 3 已加一條專門的防漏抄驗證。
- **回滾**:階段 1、2、4 是驗證邏輯疊加,revert 即還原。**階段 3 的
  migration 需要反向 migration** 才能回滾(還原 GRANT 與
  `handle_new_user` 的 metadata 帶入)——本次唯一不能靠 revert PR 單獨還原
  的變更,須在 PR 說明標注。
- 全程無資料遷移、不改既有資料。
