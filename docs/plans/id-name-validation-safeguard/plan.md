# 註冊姓名格式防呆 規劃書

<!-- 由 /plan-feature 從模板實例化到 docs/plans/id-name-validation-safeguard/plan.md
     v2:依 2026-07-25 人審裁決修訂(見 review.md「處置」節),已重跑 /review-plan -->

## 0. 一句話

讓註冊「資料完善」步驟的姓名欄位在填寫當下就擋下明顯不是身分證本名的輸入
(帳號/暱稱/英數亂碼),並把防線一路補到資料庫層,因為這欄位是提領撥款比對
身分的依據,錯了要等到提領才會被發現,屆時已牽涉金流與人工客服介入。

## 1. 使用者需求

- 對照規格書:`docs/uknow-software-specification.md` §4.2「真實姓名｜用於
  提領驗證;修改時連動所有顯示介面」。
- 現況缺口(規格書未記錄,本規劃補上依據):
  - 前端 `validateName`(`src/utils/profileValidation.ts:22`)只檢查非空與
    ≤10 字元,不檢查內容。
  - 後端 `POST /auth/register`(`supabase/functions/api/index.ts:456`)只擋
    `!name`;`PUT /auth/profile`(`index.ts:503-535`)對 `name` **完全沒有格式
    驗證**。
  - **資料庫層完全沒有防線**:`20260620000009_auth_profile_hardening.sql` 對
    `authenticated` 開放 `name` 等欄位的 column-level UPDATE GRANT,搭配 RLS
    `profiles_update_own`,任何登入用戶可直接打 `PATCH /rest/v1/profiles`
    繞過上述兩個端點寫入任意姓名(審查 P0)。
  - UI 已有正確意圖:`CompleteProfile.tsx:546` placeholder 寫著「請輸入身分證
    上的姓名」,但那只是提示,背後沒有規則把關,意圖與強制力脫節。
- 觸發案例:推薦網絡頁面出現二代顯示名「z···m」。`maskNameByGen`
  (`index.ts:2386`)對含中文的姓名用「首字＋○＋末字」,對純英數用
  「首字＋•••＋末字」——遮罩樣式本身就洩漏了該筆 `profiles.name` 不含中文,
  合理研判是註冊時填了帳號/暱稱。
- 驗收情境:
  - 中文模式(預設)輸入 `z1234567m`、`testuser`、`王小明123`、`王John` →
    前端即時錯誤、無法送出;直接打 `POST /auth/register`、
    `PUT /auth/profile`、`PATCH /rest/v1/profiles` 送同樣的值 → 三條路徑
    都被拒。
  - 中文模式輸入 `王小明` → 通過。
  - 切換到外文模式輸入 `John Smith` → 通過;輸入 `john smith`(首字母
    未大寫)、`John-Smith`(含標點)、`John3` → 被拒。
  - 送出前跳出**單一**確認對話框,同時列出姓名與推薦碼資訊。
- 不做(明確排除):
  - 不串接第三方 KYC 做身分證影像/戶政資料比對。
  - 不動既有提領身分驗證機制(`IdNumberVerification`、`/rewards/verify-id`)。
  - 不清洗、也不清點資料庫既有的非中文姓名紀錄(人審裁決 #4:先不用)。
  - 不處理 `nationalId` 唯一性檢核(規格書 §14 #1,性質不同)。
  - 不補 `phone`/`birthDate`/`nationalId` 的後端格式驗證(留待另案)。

## 2. 系統設計

### 2.1 姓名格式規則(人審裁決 #2)

**兩種模式,由表單上的切換控制,預設中文:**

| 模式 | 規則 | 合法 | 不合法 |
|---|---|---|---|
| 中文(預設) | 全部字元皆為中文字元 | `王小明` | `王John`、`王小明123`、`z1234567m` |
| 外文 | 僅 `A-Z`/`a-z` 與單字間的**單一半形空格**;每個單字首字母須大寫 | `John Smith` | `john smith`、`John-Smith`、`JOHN`(見開放問題#2)、`John3` |

**兩模式皆不接受標點符號、數字、全形空格。**

**後端判定規則自描述,不需要傳遞模式旗標**:含任何中文字元 → 套中文規則
(必須全為中文);否則 → 套外文規則。因此:

- `profiles` 不需要新欄位、API 契約不需要新參數。
- 前端切換鈕純粹是**呈現層**的引導(切換 placeholder、說明文字與錯誤訊息
  措辭),不是要送給後端的資料;前後端對「什麼字串合法」的判定完全一致,
  不存在前端放行、後端拒絕(或反之)的落差。

**中文字元的判定一律重用 `HAN_RANGE`/`HAS_HAN`**(`index.ts:2380-2382`,
審查 P1,三個視角獨立命中):那段正則的註解記載過一次真實事故(NFC 正規化
誤判導致 emoji 姓名觸發 500),重寫一份等於重踩;而且若驗證與
`maskNameByGen` 對「什麼算中文」認定不一致,會出現「通過驗證的姓名在推薦
網絡頁仍顯示英數樣式遮罩」——原地重現本次要解決的症狀。

### 2.2 長度上限必須分模式

現行 `MAX_LEN.name = 10`(`formDraft.ts:38`)、`validateName` 的 `> 10`
與 `CompleteProfile.tsx:547` 的 `maxLength={10}` 是為中文姓名訂的。開放外文
姓名後 10 字元會攔腰截斷英文全名(`Christopher Nolan` 有 17 字元),因此:

- 中文模式維持 10 字元上限;外文模式放寬(具體數字見開放問題#3)。
- 上限值必須**同步四處**:`validateName`、`CompleteProfile.tsx` 的
  `maxLength` 與 onChange 長度守衛與「N/10」計數顯示、`formDraft.ts` 的
  `MAX_LEN.name`、後端驗證函式。任一處漏改都會產生「打得進去卻送不出」或
  「草稿被截斷」的錯覺型 bug。

### 2.3 資料庫層防線(人審裁決 #1)

**撤銷 `authenticated` 對 `profiles.name` 的 column-level UPDATE 權限**,
使姓名只能經由 service_role(Edge Function)寫入。新增 migration:

```sql
revoke update (name) on public.profiles from authenticated;
```

`20260620000009` 當初開放此權限的理由寫在該檔註解:「混合模式——簡單讀寫由
前端 supabase-js 直連 + RLS,因此『完善個人資料』會是前端直接 update
profiles」。**該前提已不成立**:前端 supabase-js 直連只用於 `listings` /
`public_listings`,`profiles` 的所有寫入都已改走 Edge Function。撤銷是把
遺留的權限收回,不是移除在用的功能(逐條查證見 §3「撤銷安全性查證」)。

裁決要求「不能影響原有功能」,因此本次**只撤 `name` 一欄**,不動
`phone`/`birth_date`/`national_id`/`bank_code`/`bank_account`——那幾欄同樣
可疑但不在本次範圍,盲目一起撤會擴大風險面(留待另案評估)。

### 2.4 API 變更

- `POST /auth/register`:姓名格式不符回 `400`,訊息比照 `validateNationalId`
  的「規則說明＋(例:…)」同句格式(審查 P2)。
- `PUT /auth/profile`:同一規則、同一訊息。**只在 `body` 含 `name` 鍵時
  觸發**——該端點是逐欄位局部更新,無條件檢查會誤擋只改手機/銀行帳號的
  請求,或對 `undefined` 呼叫字串方法而回 500(審查 P1)。
- 後端驗證函式需 `export`(比照 `resolvePayuniConfig`,而非未匯出的
  `verifyNationalId`),否則階段 2 的 `.unit.test.ts` 無法直接 import
  (審查 P1)。

## 3. 架構影響

- 動到的模組:
  - `src/utils/profileValidation.ts`(`validateName` 改寫)+ 對應測試。
  - `src/utils/formDraft.ts`:`MAX_LEN.name` 放寬;若切換模式的狀態要能撐過
    重整,須把該狀態納入草稿白名單(`sanitizeDraft` 只收白名單欄位,漏加
    等於違反 multi-step-flow 契約 1)。
  - `supabase/functions/api/index.ts`:新增 `export` 的姓名驗證函式(放在
    檔頭「共用工具」段,`index.ts:126-200` 一帶,與 `verifyNationalId`/
    `maskNationalId` 同段;**不是**放在 `maskNameByGen` 附近——那裡屬推薦
    網絡顯示邏輯,審查 P1 已更正 v1 對此的誤述),接進兩個端點。
  - `supabase/migrations/`:新增撤銷 GRANT 的 migration。
  - `src/components/CompleteProfile.tsx`:姓名欄位加模式切換、長度規則連動、
    確認對話框合併。
- **撤銷安全性查證**(對應裁決「不能影響原有功能」),逐條確認無依賴:
  - 前端 `src/**`:supabase-js 直連只碰 `listings`/`public_listings`,
    無任何 `profiles` 寫入。
  - Edge Function:`sb()`(`index.ts:126`)用 service_role,不受 GRANT 影響。
  - e2e journey:透過 UI 操作註冊,不直接寫 `profiles`。
  - 待補:`security invoker` function/trigger 是否有以呼叫者身分寫
    `profiles`、`20260620000009` 之後是否有 migration 再調整過此權限
    ——查證進行中,結果須在開工前補入本節。
- multi-step-flow 四契約:本次新增「模式切換」這個表單狀態,必須一併納入
  草稿持久化(見上),否則使用者切到外文模式、點服務條款彈窗後回來會被
  重置回中文模式,是契約 1 的新破口。
- 效能:純字串檢查,無額外查詢。
- 安全:撤銷 GRANT 後,姓名的唯一寫入路徑收斂到 Edge Function,規則有實際
  強制力,而非僅前端提示。

## 4. UI/UX

- **模式切換**:姓名欄位上方或右側提供「中文姓名 / 外文姓名」切換。既有 UI
  元件庫無 toggle/radio 原生元件(`src/components/ui/` 只有 `tabs`),
  依 UI 準則 §8「切換鈕 → `role=button`,name 隨狀態切換」實作,不新增
  第三方元件。預設中文,切換時即時重跑驗證並更新 placeholder 與說明文字。
- **錯誤訊息**比照 `validateNationalId` 的「規則說明＋(例:…)」同句格式:
  - 中文模式:`姓名須為中文字（例：王小明）`
  - 外文模式:`外文姓名僅限英文字母，每個單字首字母大寫（例：John Smith）`
- **送出前確認**(人審裁決 #3):**與既有推薦碼確認框合併為單一對話框**,
  不新增第二個 modal——`CompleteProfile.tsx:234-270` 已用
  `showNotification`(`type:'warning'`、`details` 陣列、`confirmText`/
  `cancelText`)對推薦碼做送出前確認,把姓名加進同一個 `details` 陣列即可,
  標題與訊息改為同時涵蓋姓名與推薦碼。連續兩個確認框會在行動版註冊流程
  疊加確認疲勞(審查 P1)。
- **行動版**:沿用既有 `FieldError` 與 onBlur 驗證時機,無專屬處理。
- **a11y**:順手把既有但全專案零使用的 `getInputAriaProps`
  (`formHelpers.tsx:33-39`)接上姓名 `Input`(童子軍原則,UI 準則 §9),
  範圍只限本次觸碰的欄位。
- 空態/錯誤態/載入態:純同步驗證,不涉及載入態;確認對話框沿用既有
  `showNotification`,不打 API,亦無載入態。

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 前端 `validateName` 雙模式規則與分模式長度上限 | `src/utils/profileValidation.test.ts`(node) | 共用案例表全綠:中文/外文合法值通過,英數混雜、首字母小寫、含標點、超長皆被拒 |
| 2 | 後端 `export` 的姓名驗證函式(重用 `HAN_RANGE`),接進 `/auth/register` 與 `/auth/profile` | `supabase/functions/api/*.unit.test.ts`(純函式)+ `*.test.ts`(路由整合) | 跑**同一份**案例表,結果與階段 1 逐項一致;不含 `name` 的 `PUT /auth/profile` 維持局部更新行為;通過驗證的姓名經 `maskNameByGen(gen=2)` 必為中文遮罩樣式 |
| 3 | 撤銷 `profiles.name` 的 authenticated UPDATE GRANT | `supabase/functions/api/*.test.ts`(以使用者 token 建 client 直寫應失敗) | 使用者 token 直寫 `profiles.name` 被拒;經 Edge Function 的既有註冊/更新路徑不受影響(characterization) |
| 4 | 表單模式切換、長度連動、草稿持久化、確認對話框合併 | `src/components/CompleteProfile.test.tsx`(jsdom pragma)+ `src/utils/formDraft.test.ts` | 切換模式後驗證與提示同步改變;模式狀態撐過草稿存取;送出時只跳**一個**確認框且同時列出姓名與推薦碼 |
| 5 | 收尾:規格書 §4.2 與 journey 姓名產生器同步 | `python3 scripts/check-spec-drift.py`、`cd e2e/journey && pytest tools/` | §4.2「真實姓名」列補上格式規則;`run_state.py` 姓名符合新規則 |

**階段 1、2 共用同一份合法/不合法姓名案例表**(審查 P2):兩個 runtime 隔離
必然各寫一份實作,但案例表共用可讓單邊改規則忘了同步時立刻紅燈——這正是
`validateNationalId` 前端有、後端缺的那類漂移上次沒被擋住的原因。

**階段 5 的 journey 修改是必須的,不是選配**:`e2e/journey/run_state.py:40`
以 `name=f"測試{self.run_id}{node}"` 產生姓名(中文＋run_id＋節點代號如 `A0`),
在「中文模式必須全為中文」下**必定被拒**,整套 journey 會在註冊階段全滅。
journey 依規則不能在本機跑,只在排程或晉升 PR 才會發現,是晚且貴的失敗點。

## 6. 開放問題(逃生口——留白是合格產出)

- [ ] **`·`(間隔號)是否要放行——本項風險最高,建議開工前確認**。裁決 #2 訂
      「都不接受標點符號」,但台灣原住民依《姓名條例》以**漢字音譯**登記的
      法定姓名,在身分證上的標準格式正是以間隔號分隔(例:`谷辣斯·尤達卡`),
      新住民歸化後的中文姓名亦同。照目前規則,這些人的**身分證本名會被判為
      非法**,無法完成註冊——與本功能「確保填的是身分證上的姓名」的目的正好
      相反。此外間隔號有多個視覺相近但碼點不同的字元(`·` U+00B7、
      `‧` U+2027、`・` U+30FB),若決定放行需一併指定接受哪些碼點。
      **裁決 #2 回覆的是「羅馬拼音」那一路,此處問的是「漢字音譯＋間隔號」
      那一路,是不同案例,故再次列出確認。**
- [ ] **外文模式是否接受全大寫**(`JOHN SMITH`)?裁決只說「強制單字第一
      字母大寫」,未說其餘字母須小寫。護照與部分證件慣用全大寫拼寫,
      規則需明確二選一。
- [ ] **外文模式的長度上限訂多少?**(§2.2)中文 10 字元不適用於英文全名。
      需一個明確數字以同步四處實作。
- [ ] **外文模式是否允許多個空格分隔三段以上姓名**(如 `Mary Jane Watson`)?
      規則寫「單字間單一半形空格」隱含允許,列出確認。

## 7. 風險與回滾

- **最大風險是誤擋合法使用者**(開放問題#1 的間隔號案例已是具體而非假設性
  的風險):規則過嚴會讓部分族群無法完成註冊,而註冊是營收入口,失敗成本
  遠高於「偶爾有人填錯姓名」。開工前應先結清開放問題#1。
- **撤銷 GRANT 的風險**:若有未查出的路徑依賴該權限,撤銷後該功能會直接
  失敗。緩解:§3 的逐條查證須在開工前補完;階段 3 的 characterization 測試
  會釘住既有註冊/更新路徑不受影響。
- **回滾**:階段 1、2、4 是驗證邏輯疊加,revert 即還原。階段 3 的 migration
  需要反向 migration(`grant update (name) ... to authenticated`)才能回滾
  ——這是本次唯一不能靠 revert PR 單獨還原的變更,需在 PR 說明中標注。
- 全程無資料遷移、不改既有資料,已完成註冊的帳號不受影響(新規則只在
  寫入時檢查,不回溯校驗既有資料)。
