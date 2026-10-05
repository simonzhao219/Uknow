# 375px 長字串溢出（Email／網址／訂單編號／六位數點數）修復紀錄

分支:`fix/long-string-wrap`|重現測試(紅燈 commit):見 git log `test(red)`

## 1. 症狀與重現

- `e2e/test_overflow_sweep.py` 在 375px 掃到 4 條路由溢出,原本都掛著 `known_overflow`（不擋 CI）:
  - 服務者詳情:description 內長網址 +311px、FB 聯絡鈕原始網址 +204px
  - 獎勵回饋:統計卡六位數點數 +4px（`256920P`、`128460P`）
  - 付款結帳:`Email：chienmingchangservice@uknowplatform.com.tw` +80px
  - 付款結果:29 字訂單編號 +55px
- 會員中心基本資料的 Email 用 `truncate`,長 Email 被截成「…」——沒有溢出,但使用者看不到完整資料。
- 重現:刪掉 4 行 `known_overflow` 後 sweep 4 條紅;vitest `BreakableEmail`／globals base 層／會員中心 Email 5 條紅。

## 2. 根因

- **機制**:中文字元之間本來就能斷行,所以全站沒有任何「不可斷字串怎麼換行」的預設——Tailwind preflight
  不設 `overflow-wrap`,瀏覽器預設 `normal`,Email、網址、訂單編號這類沒有空白的字串只能整串溢出。
  開發時的測試資料多是中文或短字串,看不出來。
- **flex 子項是第二層**:就算段落能斷,`flex justify-between` 的值欄、`Button`（自帶 `whitespace-nowrap`）
  裡的文字,其最小寬度是整串字,`overflow-wrap: break-word` 不會縮小 min-content,照樣撐破。
- **數字不是長字串**:六位數點數不該斷,溢出的是卡片版面——手機兩欄卡左右各 24px padding,
  內容寬只剩約 115px。
- **為什麼一直沒修**:sweep 早就量到了,但被登記成 `known_overflow` 債務,而它是「不擋 CI」的標記——
  沒有誰負責償還（這次業主排進 S2e 後的第一支 `/fix-bug`）。

## 3. 同類掃描

- pattern:不可斷字串（Email、URL、訂單／交易編號、社群帳號）放在 (a) 段落、(b) flex 子項或按鈕、(c) `truncate` 裡。
- 掃描:grep `email}`、`tradeNo`／`TradeNo`、`contacts.`、`truncate`、`font-mono`;sweep 盲區
  （對話框、註冊步驟、OTP、忘記密碼完成頁）靠讀碼。
- 結果——一併修:
  - Email:結帳、會員中心、OTP 頁「已寄送至」、忘記密碼完成頁、註冊兩個確認步驟、付款結果付款人 Email、
    後台會員詳情 Sheet、證件審核卡 → 全改 `BreakableEmail`
  - 付款結果「訂單編號」值欄（flex）→ 值欄 `min-w-0 wrap-anywhere`
  - 服務者詳情 FB／IG／LINE 三顆聯絡鈕 → 文字可換行
  - 段落類（description、各頁訂單編號句子）→ body 預設 `overflow-wrap: break-word` 一次涵蓋
- 不改:後台會員卡片列表的 `truncate`（列表掃讀用,點進詳情有完整 Email）、`AdminSetup` 已有 `break-all`。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 純前端呈現,不動資料與 API。`break-word` 只在字放不下時生效,放得下的版面一個像素都不變;`truncate`／`whitespace-nowrap` 的元素不受影響 |
| 架構 | 點狀 bug 的共同機制是「沒有預設」,以 base 層一條規則＋`BreakableEmail` 小元件收斂,不需升級 `/plan-feature` |
| UIUX | 業主裁決:給使用者確認的資料不截斷、只換行;Email 在 @ 後放 `<wbr>`,再加 `wrap-anywhere` 保底。數字不斷行,改手機卡片 padding（與後台統計卡 `p-3 sm:p-6` 同手法） |
| 需求 | 規格書未定義;業主 2026-10-05 已裁決呈現方式,寫進 `ui-ux-guidelines.md` |

## 5. 修法與驗證

- 修了什麼(綠燈 commit):見 git log `fix:`
- 為什麼這樣修是對的:根因是「沒有預設」與「flex 最小寬度」兩層,前者由 base 層 `overflow-wrap: break-word`
  兜住所有段落,後者在每個 flex／按鈕值欄明確 `min-w-0 wrap-anywhere`;Email 的優先斷點由 `<wbr>` 決定。

## 6. 防線回填

- 為什麼既有閘門沒攔到:sweep 攔到了,但 `known_overflow` 讓它不擋 CI;OTP、註冊確認步驟、忘記密碼完成頁
  在 sweep 盲區。
- 處置:☑ 已補閘門:4 行 `known_overflow` 刪除,33 條路由全部硬失敗;globals.test 釘住 base 層規則;
  `BreakableEmail` 有元件測試。☑ 規則寫進 `ui-ux-guidelines.md`（長字串換行）。
