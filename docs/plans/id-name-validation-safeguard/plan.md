# 註冊姓名格式防呆 規劃書

<!-- 由 /plan-feature 從模板實例化到 docs/plans/id-name-validation-safeguard/plan.md
     v3:依 2026-07-25 第二輪人審裁決修訂(見 review.md「v2 處置」節)。
     v1 → v2 → v3 的裁決與發現全數保留在 review.md,勿在此重述。 -->

## 0. 一句話

讓註冊「資料完善」步驟的姓名欄位在填寫當下就擋下明顯不是身分證本名的輸入
(帳號/暱稱/英數亂碼),並把防線補到資料庫層,因為姓名是提領撥款時**人工
核對身分**的依據,填錯要到那時才會被人眼發現。

> §0 措辭修正(v2 審查 P1):`request_withdrawal` 與 `/rewards/withdraw`
> **只驗 `national_id`,完全不檢查 `name`**。姓名唯一被看到的地方是
> `WithdrawalManagement.tsx:62` 這類**人工目視**欄位。先前寫「提領時會被
> 發現」容易讓人誤以為有自動比對,實際上沒有。

## 1. 使用者需求

- 對照規格書:`docs/uknow-software-specification.md` §4.2「真實姓名｜用於
  提領驗證;修改時連動所有顯示介面」。
- 現況缺口(規格書未記錄,本規劃補上依據):
  - 前端 `validateName`(`src/utils/profileValidation.ts:22`)只檢查非空與
    ≤10 字元,不檢查內容。
  - 後端 `POST /auth/register`(`index.ts:456`)只擋 `!name`;
    `PUT /auth/profile`(`index.ts:503-535`)對 `name` **完全沒有格式驗證**。
  - **資料庫層有兩條繞過路徑**(v1、v2 審查各抓到一條):
    (a) `20260620000009` 對 `authenticated` 開放 `name` 的 column-level
    UPDATE GRANT,可直接打 `PATCH /rest/v1/profiles`;
    (b) `handle_new_user()`(`security definer`)把
    `raw_user_meta_data ->> 'name'` 直接寫進 `profiles.name`,而該 metadata
    是任何人呼叫公開 signup 端點就能帶入的(只需 anon key、免 OTP)。
  - UI 已有正確意圖(`CompleteProfile.tsx:546` placeholder 寫「請輸入身分證
    上的姓名」),但那只是提示,背後沒有規則把關。
- 觸發案例:推薦網絡頁出現二代顯示名「z···m」。`maskNameByGen` 對含中文的
  姓名用「首字＋○＋末字」、對純英數用「首字＋•••＋末字」——遮罩樣式本身
  就洩漏了該筆 `profiles.name` 不含中文。
- 驗收情境:見 §2.1 規則表末的案例清單(含專門暴露「切換鈕強制力」的案例)。
- **不做(明確排除)**:
  - 不串接第三方 KYC 做身分證影像/戶政資料比對。
  - 不動既有提領身分驗證機制(`IdNumberVerification`、`/rewards/verify-id`)。
  - **不清洗、也不清點既有的非中文姓名紀錄**(人審裁決)。後果須明示:
    觸發本次規劃的那筆「z···m」以及其他既有髒資料,在推薦網絡與提領管理
    後台會**維持現狀、無限期可見**;這些帳號日後提領也不會被任何程式碼
    攔下(提領只核對身分證字號),發現與否純看 admin 有沒有人工注意到,
    而不清點代表連殘留規模都不會知道。**本次只防未來新註冊。**
  - **不撤銷 `phone`/`birth_date`/`national_id`/`bank_code`/`bank_account`
    的 authenticated UPDATE GRANT**——與 `name` 同屬 `20260620000009` 開放的
    同一類繞過面,其中 `national_id`/`bank_code`/`bank_account` 比 `name`
    更敏感,但一次撤五欄會擴大風險面,留待另案評估。
  - 不處理 `nationalId` 唯一性檢核(規格書 §14 #1,性質不同)。
  - 不補 `phone`/`birthDate`/`nationalId` 的後端格式驗證(留待另案)。

## 2. 系統設計

### 2.1 姓名格式規則

**兩種模式,由表單切換鈕控制,預設中文:**

| 模式 | 規則 | 長度上限 |
|---|---|---|
| 中文(預設) | 字元僅限**中文字元**與**單字間的單一半形空格** | 10 |
| 外文 | 字元僅限 `A-Z`/`a-z` 與**單字間的單一半形空格**;每個單字**首字母須大寫**,其餘字母大小寫不限(故 `JOHN SMITH` 與 `John Smith` 皆合法) | 50 |

**兩模式共同規則**:不接受標點符號、數字、全形空格;空格不得出現在開頭或
結尾、不得連續出現。

**間隔號的處置(人審裁決)**:不放行任何間隔號碼點(`·`U+00B7、
`‧`U+2027、`・`U+30FB)。原住民漢字音譯姓名與新住民歸化漢名**改以半形
空格分隔**(`谷辣斯 尤達卡`)——這是中文模式允許半形空格的原因,少了它
這些人就無法完成註冊。**錯誤訊息必須明確引導**(見 §4),否則使用者照
身分證輸入間隔號被拒後不會知道該改成空格,等同沒放行。

### 2.2 前端嚴格依模式、後端採聯集——刻意的不對稱

人審裁決「切換鈕要有真正的強制力」。這條只能在**前端**成立,原因:

- 後端只收到 `name` 字串。若新增模式參數,攻擊者只要宣稱 `mode='foreign'`
  即可繞過「預設中文」的意圖——**模式旗標沒有任何安全價值**,徒增 API
  契約與資料表面。
- 因此:**前端依切換鈕狀態嚴格把關**(中文模式下含任何拉丁字母一律拒絕,
  不論格式多工整,`Peter` 在中文模式被拒);**後端採聯集規則**(合乎中文
  規則**或**外文規則即通過)。
- 兩者職責不同,不是漏洞:後端是**安全邊界**,擋的是 `z1234567m`、
  `testuser`、`王John`、`王小明123` 這類任何模式下都不合法的垃圾;前端是
  **UX 引導**,確保「預設你該填中文」有實際強制力且錯誤訊息永遠對得上
  使用者當下的模式。
- 這也解掉 v2 審查的「錯誤訊息依切換鈕挑字、實際觸發規則卻依內容」的
  文不對題問題——前端知道模式,訊息必然一致。

**必測案例(v2 審查點名,原案例表全數漏掉)**:

| 輸入 | 中文模式 | 外文模式 | 後端(聯集) |
|---|---|---|---|
| `王小明` | ✅ | ❌ | ✅ |
| `谷辣斯 尤達卡` | ✅ | ❌ | ✅ |
| `John Smith` / `JOHN SMITH` | ❌ | ✅ | ✅ |
| `Mary Jane Watson` | ❌ | ✅ | ✅ |
| **`Peter`** | **❌**(暴露切換鈕強制力) | ✅ | ✅ |
| `john smith` | ❌ | ❌ | ❌ |
| `谷辣斯·尤達卡` | ❌(訊息須引導改空格) | ❌ | ❌ |
| `z1234567m` / `testuser` / `王John` / `王小明123` | ❌ | ❌ | ❌ |
| ` 王小明` / `王小明 ` / `王  小明` | ❌ | ❌ | ❌ |
| `{name:null}` / `{name:123}` | — | — | ❌(回格式不符,**不得拋錯**) |

### 2.3 中文字元判定:重用既有 `HAN_RANGE`,不重寫

判定一律以 `HAN_RANGE`/`HAS_HAN`(`index.ts:2380-2382`)為準:

- 該正則的註解記載過一次真實事故(NFC 正規化誤判導致 emoji 姓名觸發 500),
  重寫一份等於重踩。
- 若驗證與 `maskNameByGen` 對「什麼算中文」認定不一致,會出現「通過驗證的
  姓名在推薦網絡頁仍顯示英數樣式遮罩」——原地重現本次要解決的症狀。
- **前端無法共用該常數**(Deno / Vite 兩個隔離 runtime),必須新寫一份。
  要求:**逐字複製 `㐀-鿿豈-﫿`** 並註解標明出處,
  **不得**改用更常見但範圍較窄的 `一-龥`——後者對 CJK 擴充 A 區
  (`㐀-䶿`)與相容表意文字(`豈-﫿`)會前端拒絕、後端放行。
  共用案例表須含這三個 range 的邊界字元當機械探針。
- 順手把 `HAN_RANGE`/`HAS_HAN`/`HAN_LEAD` 三個常數搬到檔頭共用工具段
  (與 `verifyNationalId` 同段),讓「被多處共用」的常數位置名副其實。

### 2.4 長度上限分模式,同步四處

現行 `MAX_LEN.name = 10`(`formDraft.ts:38`)、`validateName` 的 `> 10`、
`CompleteProfile.tsx:547` 的 `maxLength={10}` 都是為中文姓名訂的。

| 位置 | 值 | 理由 |
|---|---|---|
| `validateName`(前端) | 依模式:中文 10、外文 50 | 精準把關 |
| 後端驗證函式 | 聯集:≤50 | 安全邊界只需擋離譜值 |
| `CompleteProfile.tsx` `maxLength` / onChange 守衛 | **一律 50** | 見下 |
| `formDraft.ts` `MAX_LEN.name` | **50(取兩模式較大值)** | 見下 |

- **`formDraft` 必須取較大值,不是照抄 10**:草稿層只是防炸儲存體的粗篩,
  無法也不需要做模式相依的精準把關。若留在 10,外文使用者填
  `Christopher Nolan`(17 字元)後遇頁面卸載重整,`sanitizeDraft` 會靜默
  截斷成 `Christophe`——**而截斷後的字串仍會通過格式驗證**,等於把一個
  格式合法但錯誤的姓名寫進要用來核對身分的欄位,使用者未必察覺。這正是
  本功能想避免的情境,由規劃自己製造。
- **onChange 守衛一律放寬到 50,不得依模式收緊**:現行守衛是
  `if (e.target.value.length <= 10)` ——**靜默丟棄超限按鍵、不顯示任何
  錯誤**。若綁模式,外文使用者在預設中文模式下打到第 10 字元後按鍵直接被
  吞,連一句可查找的訊息都沒有,是比錯誤訊息更難察覺的死巷。超限與否
  交給 blur 時的驗證訊息處理。
- 外文上限 50 的依據:足以涵蓋 `Christopher Nolan`(17)與絕大多數長姓名;
  `profiles.name` 是 `text` 無 DB 長度限制;提領走人工匯款,無下游系統對
  此欄位有長度約束。(此為建議值,人審未指定具體數字。)

### 2.5 資料庫層防線:兩條路徑都要堵

**(a) 撤銷 column-level GRANT**——新增 migration:

```sql
revoke update (name) on public.profiles from authenticated;
```

`20260620000009` 當初開放的理由(註解:「混合模式——完善個人資料會是前端
直接 update profiles」)**前提已不成立**:前端 supabase-js 直連只用於
`listings`/`public_listings`,`profiles` 的寫入全部改走 Edge Function
(逐條查證見 §3)。撤銷是收回遺留權限,不是移除在用功能。

**(b) `handle_new_user()` 不再從 metadata 帶入 `name`**(人審裁決)——
比照 `birth_date` 現行作法(該欄位根本不從 metadata 帶入),把
`coalesce(new.raw_user_meta_data ->> 'name', '')` 改為固定寫入 `''`,
由 Step 2 的 `/auth/register` 以**已通過驗證**的值寫入。

為什麼非堵不可:該 metadata 是任何人呼叫公開的 Supabase Auth signup 端點時
可任意帶入的 `data` 參數(只需 anon key、免登入 token、免通過 OTP),且
`handle_new_user` 是 `security definer`,以擁有者權限執行 INSERT——**撤銷
authenticated 的 GRANT 與兩個端點的新驗證對它完全無效**。不堵的話 (a) 堵了
等於白堵。

副作用須確認:`test-helpers.ts:33-46` 的 `createTestUser({name})` 正是靠
這條路徑帶入姓名(證明機制是活的),改動後該 helper 需改走
`profiles` 的 service_role 直寫或呼叫 `/auth/register`,否則既有 Deno
測試會大量失敗——**這是階段 3 的必要連帶工作,不是選配**。

### 2.6 API 變更

- `POST /auth/register`:姓名格式不符回 `400`,訊息比照 `validateNationalId`
  的「規則說明＋(例:…)」同句格式。
- `PUT /auth/profile`:同規則、同訊息。**只在 `body` 含 `name` 鍵時觸發**
  ——該端點是逐欄位局部更新,無條件檢查會誤擋只改手機/銀行帳號的請求。
- **型別防禦**:`'name' in body` 只檢查鍵存在,`body.name` 可以是
  `null`/數字/物件。新函式須先做 `typeof name === 'string'` 檢查,
  回傳「格式不符」**而非拋錯**(`HAN_RANGE` 那段註解記載的正是未防禦邊界
  輸入導致 500 的事故;同檔 `verifyNationalId` 的 `(idNumber ?? '').trim()`
  對數字一樣會拋未捕捉例外——同類疏漏在此 codebase 不是第一次)。
- **兩支函式都要 `export`**:新驗證函式(比照 `resolvePayuniConfig`,
  而非未匯出的 `verifyNationalId`),以及 **`maskNameByGen`**——階段 2 的
  一致性斷言要直接呼叫它,不 export 就寫不成 `.unit.test.ts`。

## 3. 架構影響

- 動到的模組:
  - `src/utils/profileValidation.ts`:`validateName` 改寫為依模式驗證。
  - `src/utils/formDraft.ts`:`MAX_LEN.name` → 50;`ProfileDraft` interface
    新增模式欄位;`sanitizeDraft` 對該欄位須用 **allow-list 檢查**
    (仿 `agreedToTerms` 的嚴格型別檢查),**不可掛進 `MAX_LEN` 沿用字串
    截斷**——模式本質是只有 2 個合法值的 enum,若走截斷路徑,被竄改的
    sessionStorage 值(如 `"xyz"`)會被當成合法草稿原樣寫回 UI state,
    打破該模組檔頭註解揭示的「型別不符即丟棄」設計原則。
  - `src/components/CompleteProfile.tsx`:切換鈕、長度連動、確認框合併、
    `EMPTY_FORM` 新增模式預設值。
  - `supabase/functions/api/index.ts`:新增 `export` 的驗證函式(檔頭共用
    工具段,`index.ts:126-200` 一帶,與 `verifyNationalId` 同段);
    `HAN_RANGE` 等三常數搬到同段;`maskNameByGen` 加 `export`;
    兩個端點接上驗證。
  - `supabase/functions/api/test-helpers.ts`:`createTestUser` 改寫(§2.5),
    新增 anon key 常數與 PostgREST 直連 helper(階段 3 前置,見 §5)。
  - `supabase/migrations/`:新增 migration(撤 GRANT + 改
    `handle_new_user`)。
  - `e2e/journey/run_state.py`:姓名產生器(見 §5 階段 5)。

- **繞過路徑查證(七面向)**——v2 的六面向漏了第七條,已補齊:
  1. **前端 `src/**`**:supabase-js 直連只碰 `listings`/`public_listings`,
     對 `profiles` 零寫入。`CompleteProfile.tsx` 只用
     `supabase.auth.getSession()` 取 token,寫入走 `fetch(/auth/register)`。
  2. **e2e 兩套件**:`e2e/` 全 mock;`e2e/journey/` 的 `rest_update` 走
     service_role,且唯二呼叫點目標是 `subscriptions`。
  3. **後端 client**:`supabase/functions/` 只有兩處 `createClient`
     (`sb()`、`adminClient()`),皆用 service_role;index.ts 內 16 處
     `.from('profiles')` 的 client 來源逐一確認都是 `sb()`。
  4. **DB 內部 UPDATE**:migrations 中 11 處 `update public.profiles` 全在
     `security definer` 函式內。補強證據(取代 v2 的推論式措辭):對全部
     migrations 掃 `set\s+name\s*=` **零筆**——`profiles.name` 在 migrations
     內從未被 UPDATE 過,連「invoker trigger 是否需欄位 GRANT」的推論都
     用不到。
  5. **後續 migration**:`20260620000009` 之後無任何 migration 再調整
     `profiles` 的 authenticated GRANT。反向佐證:`20260717000001:18-21`
     註解明寫「刻意只授權 service_role……authenticated 維持各 migration 的
     明確控制(例如 0009 的 profiles 欄位級 update)」。
  6. **admin 路徑**:走 `apiRequestJson`/Edge Function,後端用 `sb()` 或
     service_role + definer 函式。
  7. **`handle_new_user()` 的 INSERT**(v2 漏網,§2.5(b) 處理)——前六點的
     掃描範圍是 UPDATE 陳述式與 `.from('profiles')` 呼叫,**INSERT 經
     trigger 這條路兩者都不覆蓋**,這是 v2 寫「六面向窮舉、無任何依賴」
     卻仍有破口的原因。措辭已修正:查證的是**已知的七條路徑**,不宣稱窮盡。

- **multi-step-flow 四契約**:新增的模式狀態必須能撐過表單卸載,否則使用者
  切到外文模式、點服務條款彈窗後回來會被重置回中文,是契約 1 的新破口。
  **有兩條 prefill 路徑,都要處理**:(a) 草稿還原(`loadProfileDraft`);
  (b) **「編輯」回填**(`CompleteProfile.tsx:66-93` 的 `isEditing` 路徑,
  獨立於草稿之外,v2 規劃只提草稿、漏了這條)。兩條都要能依既有姓名內容
  還原正確的初始模式。
- 效能:純字串檢查,無額外查詢。
- 安全:堵住 §1 列出的兩條 DB 繞過路徑後,姓名的寫入路徑收斂到 Edge
  Function,規則有實際強制力。

## 4. UI/UX

- **模式切換鈕**:採**兩選項同時可見的 segmented control**,比照既有
  `src/components/home/HomeViewToggle.tsx`(`role="group"` 包兩顆原生
  `<button>`,各帶 `aria-pressed`,當前態浮起)。固定放在**姓名欄位正
  上方**。
  - 不採 UI 準則 §8 舉的「顯示/隱藏密碼」單顆變態鈕:那是低可發現性形狀,
    外文姓名使用者很可能根本沒注意到有切換,直接卡在錯誤訊息裡出不去
    ——註冊流程死巷,而註冊是營收入口。
  - a11y 必須有 `aria-pressed` + 原生 `<button>`(專案現有三個同類切換鈕
    `HomeViewToggle`/`FilterChip`/`password-input` 全都如此;`role` 硬掛
    非按鈕元素不會自動具備鍵盤操作)。本 repo 已有 a11y 債,不再添新債。
- **切換模式時保留已輸入文字**,只換驗證規則與提示文字(不清空——清空會
  讓誤觸切換鈕的人整串重打)。`maxLength` 一律 50 故不會出現回溯截斷;
  字數計數器須顯示**當前模式的上限**(`3/10` → 切換後 `3/50`)。
- **錯誤訊息**比照 `validateNationalId` 的「規則說明＋(例:…)」格式,
  且**必須帶出口指引**:
  - 中文模式一般錯誤:`姓名須為中文字（例：王小明）。非中文姓名請點上方
    「外文姓名」`
  - 中文模式偵測到間隔號:`請改用半形空格分隔（例：谷辣斯 尤達卡）`
    ——沒有這句,照身分證輸入間隔號的人會直接卡死。
  - 外文模式:`外文姓名僅限英文字母，每個單字首字母大寫（例：John Smith）`
- **送出前確認與推薦碼確認框合併為單一對話框**(不新增第二個 modal——
  連續兩個確認框會在行動版註冊流程疊加確認疲勞)。沿用
  `CompleteProfile.tsx:234-270` 既有的 `showNotification`,把姓名加進
  `details` 陣列。**文案須拆兩句,不可沿用推薦碼那句涵蓋姓名**:
  既有訊息「推薦碼註冊後將永久綁定,無法修改」是推薦碼專屬事實,而規格書
  §4.2 明載真實姓名「修改時連動所有顯示介面」——**姓名是可以改的**,
  沿用該句涵蓋姓名是錯誤陳述。建議:推薦碼那句維持,姓名另補
  「請確認姓名與身分證一致,將用於日後提領核對」。
- **確認旗標須涵蓋姓名**:現行 `hasConfirmedReferralCode`
  (`CompleteProfile.tsx:45`)**只在推薦碼變更時重置**(`:636-640`),
  姓名 onChange 完全不重置。合併後若使用者確認過一次、回頭改姓名再送出,
  確認框不會再跳出,新姓名從未被實際確認就送出,直接架空這次加確認框的
  意義。(具體觸發路徑:`onConfirm` 內的自動重送若因推薦碼再驗證逾時或
  推薦人剛被停權而失敗,使用者留在表單上改姓名重送,即命中。)
  → 姓名變動也要重置,且**旗標改名**以反映它涵蓋兩個欄位(避免下次有人
  加第三個欄位時重蹈同一疏漏)。
- **a11y 順手還債**:把既有但全專案零使用的 `getInputAriaProps`
  (`formHelpers.tsx:33-39`)接上姓名 `Input`(童子軍原則,UI 準則 §9),
  範圍只限本次觸碰的欄位。
- 行動版:沿用既有 `FieldError` 與 onBlur 驗證時機。`/auth/complete-profile`
  已在 `e2e/test_overflow_sweep.py` 的 ROUTES 內,新增切換鈕會自動被 375px
  溢版巡檢覆蓋,不需額外動作。
- 三態:純同步驗證,不涉及載入態;確認框沿用既有元件、不打 API。

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 前端 `validateName` 依模式驗證 + 分模式長度 | `src/utils/profileValidation.test.ts`(node) | §2.2 案例表全綠,含 `Peter` 在中文模式被拒、間隔號被拒、空格邊界案例 |
| 2 | 後端 `export` 驗證函式(聯集規則、重用 `HAN_RANGE`、型別防禦),接進兩端點;`maskNameByGen` 加 `export`;常數搬家 | `api/*.unit.test.ts`(純函式)+ `api/*.test.ts`(路由整合) | 跑**同一份**案例表的後端欄;`{name:null}`/`{name:123}` 回 400 不拋錯;不含 `name` 的 `PUT /auth/profile` 維持局部更新;通過驗證的中文姓名經 `maskNameByGen(gen=2)` 必為中文遮罩樣式 |
| 3 | **前置**:`test-helpers.ts` 加 anon key 常數 + PostgREST 直連 helper;`createTestUser` 改走新路徑。**主體**:migration 撤 GRANT + 改 `handle_new_user` | `api/*.test.ts`(需 `supabase start`) | 使用者 token 直寫 `/rest/v1/profiles` 的 `name` 被拒;帶 `data.name` 呼叫 signup 後 `profiles.name` 為空字串;既有註冊/更新路徑不受影響(characterization);既有 Deno 測試套件全綠 |
| 4 | 表單切換鈕、長度連動、兩條 prefill 路徑的模式還原、草稿 allow-list、確認框合併與旗標重置 | `src/components/CompleteProfile.test.tsx`(jsdom pragma)+ `src/utils/formDraft.test.ts` | 切換後驗證與提示同步改變且保留文字;模式撐過草稿與 `isEditing` 回填;**外文長姓名存草稿重整後不被截斷**;竄改的模式值被丟棄回預設;送出只跳**一個**確認框且同列姓名與推薦碼;**確認後改姓名再送出,確認框重新出現** |
| 5 | 收尾:規格書 §4.2、journey 姓名產生器 | `python3 scripts/check-spec-drift.py`、`cd e2e/journey && pytest tools/` | §4.2 補上格式規則;`run_state.py` 姓名符合新規則 |

- **階段 1、2 共用同一份案例表**(§2.2):兩個 runtime 隔離必然各寫一份
  實作,案例表共用可讓單邊改規則忘了同步時立刻紅燈——這正是
  `validateNationalId` 前端有、後端缺那類漂移上次沒被擋住的原因。
- **階段 3 的前置不是選配**:現有 `test-helpers.ts` 只有 `adminClient()`
  (service_role)與 `getUserAccessToken()`,後者回傳的 token 在既有測試中
  一律只餵給 `app.request()`(Hono in-process),**不經過 PostgREST 閘道**。
  要真測「使用者 token 直寫被拒」需對外發真 HTTP 請求且同時帶 `apikey`
  (anon key)+ `Authorization`,而整個 `supabase/functions/**` 沒有任何
  `SUPABASE_ANON_KEY` 的讀取或本地 fallback(對照 `SERVICE_ROLE_KEY` 在
  `test-helpers.ts:12-13` 有本地 demo fallback)。不先補這個,階段 3
  開工當下就卡住。
- **階段 5 的 journey 修改是必須的**:`e2e/journey/run_state.py:59` 以
  `name=f"測試{run_id}{node}"`(中文＋run_id＋節點代號如 `A0`)產生姓名,
  在新規則下**必定被拒**,整套 journey 會在註冊階段全滅。journey 依規則
  不能在本機跑,只在排程或晉升 PR 才會發現,是晚且貴的失敗點。
  develop 的 `8cafd94` 之後又多一層:該 commit 以同一支產生器在 develop
  種了**持久化的 45 人示範資料**(「跑完留著」),代表這批帳號的姓名同樣
  不符新規則。它們是既有資料、不會被回溯校驗(§1「不做」),但**任何再次
  執行的種樹流程都會在註冊階段失敗**,故階段 5 修產生器的優先級只升不降。

## 6. 開放問題

<!-- v1/v2 的開放問題已由兩輪人審全數裁決,裁決內容見 review.md。
     以下只列仍未決者。 -->

- [ ] **外文長度上限 50 為規劃建議值,人審未指定具體數字**——若有營運或
      證件格式上的依據要改,在開工前定案(牽動 §2.4 的四處同步)。

## 7. 風險與回滾

- **誤擋合法使用者**:已由「中文模式允許半形空格」處置(原住民漢字音譯與
  新住民歸化漢名改以空格分隔)。**殘留風險**:使用者照身分證輸入間隔號被
  拒時,若錯誤訊息沒把「改用半形空格」講清楚,實務上仍是死巷——因此
  §4 的間隔號專屬錯誤訊息是**必要功能而非文案潤飾**,階段 1 須有對應
  測試釘住。
- **既有髒資料維持現狀**:見 §1「不做」。本次只防未來新註冊,既有錯誤
  姓名在推薦網絡與後台無限期可見,提領時也不會被程式碼攔下。
- **改 `handle_new_user` 的連帶風險**:`createTestUser` 依賴該路徑帶入
  姓名,改動後既有 Deno 測試會大量失敗——階段 3 須一併改 helper,
  這是已知且有測試覆蓋的連帶工作,不是意外。
- **回滾**:階段 1、2、4 是驗證邏輯疊加,revert 即還原。**階段 3 的
  migration 需要反向 migration** 才能回滾(`grant update (name) ... to
  authenticated` 以及還原 `handle_new_user` 的 metadata 帶入)——這是本次
  唯一不能靠 revert PR 單獨還原的變更,須在 PR 說明標注。
- 全程無資料遷移、不改既有資料,已完成註冊的帳號不受影響(新規則只在
  寫入時檢查,不回溯校驗)。
