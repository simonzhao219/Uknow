# 註冊姓名格式防呆 規劃書

<!-- 由 /plan-feature 從模板實例化到 docs/plans/id-name-validation-safeguard/plan.md -->

## 0. 一句話

讓註冊「資料完善」步驟的姓名欄位在填寫當下就擋下明顯不是身分證本名的輸入
（帳號/暱稱/純英數字串），因為這欄位是提領撥款比對身分的依據，錯了要等到
提領才會被發現，屆時已牽涉金流與人工客服介入。

## 1. 使用者需求

- 對照規格書:`docs/uknow-software-specification.md` §4.2「真實姓名｜用於
  提領驗證；修改時連動所有顯示介面」。
- 現況缺口(規格書未記錄,本規劃補上依據):
  - 前端 `validateName`(`src/utils/profileValidation.ts:22`)只檢查非空與
    ≤10 字元,不檢查內容是否像中文姓名。
  - 後端 `POST /auth/register`(`supabase/functions/api/index.ts:456`)只擋
    `!name`(空字串);`PUT /auth/profile`(`index.ts:503-535`)對 `name` **完全
    沒有格式驗證**,只擋遮罩值誤填。前端驗證可被直接呼叫 API 繞過。
  - UI 其實已經有正確意圖:`CompleteProfile.tsx:546` 的 placeholder 寫著
    「請輸入身分證上的姓名」,但這只是 placeholder(對焦/輸入後就消失),
    背後沒有對應的驗證規則把關,意圖與強制力脫節。
- 觸發案例(來自使用者回報的截圖):推薦網絡頁面(`ReferralTreeView`)有一筆
  二代顯示名為「z···m」。`maskNameByGen`(`index.ts:2386`)對含中文字元的
  姓名用「首字＋○重複＋末字」遮罩,對純英數姓名固定用「首字＋•••＋末字」
  ——兩種遮罩格式不同本身就洩漏了「這筆 `profiles.name` 不含中文字元」,
  合理懷疑該會員註冊時填的是帳號/暱稱而非身分證本名。
- 驗收情境:
  - 姓名欄位輸入純英數字串(如 `z1234567m`、`testuser`)→ 前端即時錯誤,
    無法送出;直接打 `POST /auth/register` / `PUT /auth/profile` 送同樣的值
    → 後端回 400。
  - 輸入正常中文姓名(2–10 個中文字,可含 `·` 等常見姓名符號)→ 正常通過。
  - 中英混合輸入(例如夾帶英文暱稱)→ 依「開放問題」規則裁決後的邊界處理。
- 不做(明確排除,防範圍蔓延):
  - 不做真正的「與身分證影像/戶政資料比對」——那需要串接第三方 KYC,是另一
    量級的功能,列開放問題,不在本次範圍。
  - 不動既有提領身分驗證機制(`IdNumberVerification`、`POST /rewards/verify-id`)。
  - 不回溯清洗資料庫既有的錯誤姓名紀錄(如截圖中的會員)——那是客服/營運
    動作,不是程式改動,列開放問題。
  - 不處理 `nationalId` 唯一性檢核(規格書 §14 #1 已知落差)——性質不同
    (唯一性 vs 格式),避免規劃範圍發散。

## 2. 系統設計

- 資料流:`CompleteProfile.tsx` 表單 → `validateProfileForm`(前端擋停,
  UX 即時回饋)→ 送出 → `POST /auth/register`(後端補一層同規則的格式檢查,
  邊界驗證,不信任前端)→ 寫入 `profiles.name`。`PUT /auth/profile` 是
  第二個寫入 `name` 的路徑(目前無前端呼叫點,但端點本身允許,見「架構影響」),
  同步補上同一規則,避免日後開放「編輯資料」UI 時出現繞過口。
- API 變更:
  - `POST /auth/register`:姓名格式不符時回 `400`,錯誤訊息比照
    `validateNationalId` 的「說出為什麼」風格(例:「姓名需包含中文字，
    請填寫身分證上的本名」)。
  - `PUT /auth/profile`:同一格式規則,同一錯誤訊息文案,與前端/`/auth/register`
    三處規則一致(比照 `validateNationalId` 前端已有、後端目前缺的落差,
    這次前後端一起補,不重蹈覆轍)。
- 資料庫變更:無。不加 DB constraint——姓名格式規則屬於「應用層防呆」而非
  資料完整性不變量(規則本身仍有模糊地帶,見開放問題),加 DB constraint
  會讓規則調整需要 migration,成本與彈性不成比例。

## 3. 架構影響

- 動到的模組:
  - `src/utils/profileValidation.ts`(`validateName` 加規則)+
    `src/utils/profileValidation.test.ts`(對應測試)。
  - `supabase/functions/api/index.ts`:`/auth/register`、`/auth/profile`
    兩個 handler。後端目前沒有共用的姓名格式驗證函式,需要新增一個(緊鄰
    `maskNameByGen`/`verifyNationalId` 這類共用工具函式的既有慣例位置),
    讓兩個路由共用同一份規則,避免規則漂移(`validateNationalId` 在前端已有
    但後端至今無對應規則,就是規則只存在單側、日後容易漂移的先例)。
  - `CompleteProfile.tsx` 姓名欄位:錯誤訊息呈現沿用既有 `FieldError` +
    `getInputErrorClass`,不需新元件。
- 與 multi-step-flow 四契約的關係:註冊 Step 2 屬既有多步驟流程,本次只在
  既有欄位上加驗證規則與可能的文案調整,不改變步驟結構、不影響
  `formDraft.ts` 的草稿可恢復性機制。
- 相關但不同層級的既有缺口(記錄以防重複發現,不在本次處理):
  `POST /auth/register` 對 `nationalId`/`phone`/`birthDate` 同樣只做存在性
  檢查,沒有格式驗證(對照前端 `validateNationalId`/`validatePhone`/
  `validateBirthDate` 都只在前端)。本次規劃刻意只補 `name`(範圍對應使用者
  這次提出的問題),其餘欄位的後端格式驗證留待另案,已列開放問題供人裁決
  是否要一併擴大範圍。
- 效能:純函式格式檢查,無額外查詢或外部呼叫,可忽略。
- 安全:這是本次的核心動機之一——`PUT /auth/profile` 對 `name` 目前零格式
  驗證,任何持有效 token 的使用者可直接打 API 把姓名改成任意字串,前端
  UI 的 `maxLength`/placeholder 只是視覺提示、毫無強制力。

## 4. UI/UX

- `CompleteProfile.tsx` 姓名欄位:
  - Placeholder 已經是正確意圖(「請輸入身分證上的姓名」),不需改文案,
    只需要讓 `validateName` 真正把這個意圖變成強制規則。
  - 錯誤訊息比照 `validateNationalId`/`validatePhone` 現有風格,具體點出
    規則(例:「姓名需包含中文字，例：王小明」),不要只寫「格式錯誤」。
  - 是否需要「送出前二次確認」互動(例如 modal 顯示「您填寫的姓名為
    『OOO』，請確認與身分證一致」)——`docs/ui-ux-guidelines.md` 目前沒有
    這類「送出前跳出確認」的既有模式(僅 `ThreeStepDialog` 這類多步驟驗證
    對話框,語意不同),屬於新互動模式,列開放問題,不在規劃階段自創。
- 行動版:延用既有 `FieldError` 呈現,無需新增行動版專屬處理。
- 空態/錯誤態/載入態:不涉及(純表單同步驗證,無非同步載入態)。

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點(vitest / deno test / e2e) | 驗證標準 |
|---|---|---|---|
| 1 | 前端姓名格式規則:`validateName` 要求至少含一個中文字元(規則細節見開放問題#1裁決結果) | `src/utils/profileValidation.test.ts`(node) | 純英數字串被拒、正常中文姓名通過、邊界案例(單字姓名、含 `·`)符合裁決後的規則 |
| 2 | 後端共用姓名格式驗證函式,接進 `/auth/register` 與 `/auth/profile` | `supabase/functions/api/*.unit.test.ts`(純函式部分)+ 對應 `.test.ts`(需資料庫的路由整合測試) | 不合法姓名兩個端點都回 400 且訊息一致;合法中文姓名維持現有行為(characterization) |
| 3 | 錯誤訊息文案核對(若開放問題#2裁決要加二次確認,則含該互動) | `src/components/CompleteProfile.test.tsx`(jsdom pragma) | 輸入不合法姓名時畫面顯示對應錯誤文案,不能送出表單 |

## 6. 開放問題(逃生口——留白是合格產出)

- [ ] **規則嚴格度**:「至少含一個中文字元」還是「必須全為中文字元」?
      `validateNationalId` 已限定台灣身分證格式(隱含使用者是台灣籍),但
      無法排除少數合法登記姓名含羅馬拼音或特殊符號的邊界情況。規則過嚴
      會擋到合法使用者,過鬆則防呆無效——需要人裁決可接受的邊界,而非
      腦補一個規則直接寫死。
- [ ] **是否需要送出前二次確認互動**(UI/UX 第 4 節提到的 modal)?這是新
      互動模式,需要人判斷是否值得新增,或格式驗證本身已足夠當防呆。
- [ ] **既有錯誤資料是否要處理**(如截圖中「z···m」這筆)?這屬於客服/
      營運通知會員更正的動作,不是本次程式碼變更的範圍,但需要人確認
      是否要另開營運工單追蹤。
- [ ] **是否擴大範圍到 `nationalId`/`phone`/`birthDate` 的後端格式驗證**
      (見「架構影響」記錄的相關缺口)?本次規劃刻意聚焦 `name`,若要一併
      處理需要重新評估階段切分與工作量。

## 7. 風險與回滾

- 最壞情況:規則邊界抓太緊,擋到合法使用者完成不了註冊(例如姓名含合法
  但少見符號),造成新會員流失或客訴——這是頭號風險,因此規則細節列為
  開放問題交人裁決,不在規劃階段自行拍板。
- 回滾:純驗證邏輯疊加(前端純函式規則 + 後端同規則的格式檢查),無 DB
  schema 變動、無資料遷移,revert PR 即可完全還原,不影響任何既有資料或
  已完成註冊的帳號。
