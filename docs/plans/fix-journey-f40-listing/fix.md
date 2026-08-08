# journey「透過 GUI 建立刊登」失敗 修復紀錄

分支:`claude/journey-f40-listing-failure-87hc8t`|重現測試(紅燈 commit):`83c066f`

> **本檔由兩個 session 接力寫成。** 前一個 session(處理「自訂服務類別」#246 時
> 因晉升 PR #249 卡在 journey 紅燈而追到這裡)完成了 §0–§4、§8–§11 的偵查,
> 但**刻意沒有動手修**——理由見 §8,那是正確的判斷。
>
> 接手的 session 補上 §2 的**結論**(前一份把它留成假說 B/D 的二選一,
> 而答案其實是**兩者皆非**)與 §5–§7、§9 的修正。
>
> 前一份標「假說」的都已在本輪處理:推翻的明確標為推翻,確立的附上實據。

## 0. 狀態

**已定位、已修、已補防線;等真後端複驗。**

觀測到的兩場失敗(形狀完全一致):

| Run | 時間 | 結果 | 備註 |
|---|---|---|---|
| 31231809650 | 08-08 01:05–01:28 | 13 failed / 73 passed | 本輪據以定位(develop @ `8bfa50f`) |
| 31232337950 | 08-08 01:19–01:44 | 13 failed / 76 passed | 前一份據以偵查(#256 登入修法之後) |

**失敗範圍不是 3 條,是 5 條,而且跨兩個 feature 檔**(前一份的關鍵發現):

| 情境 | 檔案 | 等不到的東西 |
|---|---|---|
| `A0 透過 GUI 建立刊登` | f40 | `服務gh…A0` |
| `訪客可在公開首頁搜尋到 A0 的刊登並開啟詳情` | f40 | `a[href^='/service-providers/']`(下游) |
| `一個帳號僅能有一筆刊登` | f40 | `服務gh…A0`(下游) |
| `刊登可見性隨會籍狀態變化(active→expired)` | **f60** | `服務gh…C7` |
| `過期補繳:效期接續原到期日而非付款日` | **f60** | `服務gh…C8` |

f40 與 f60 用不同步驟檔、不同使用者、不同節點,共同因子只有共用的
`create_service_provider_page.py` 與 `CreateServiceProvider.tsx`。
這排除了「A0 這個帳號特別」「f40 那支步驟檔寫壞了」。**這個縮小範圍的
推論是對的,而且直接指向了真正的共同因子:兩支步驟檔各有一份逐字相同的
名稱產生器。**

## 1. 症狀

五條的形狀完全一致:

```
form.fill_valid_form(name=...)     ← 沒拋錯
form.submit()                      ← 沒拋錯
expect(page.get_by_text(名字)).to_be_visible(timeout=30_000)   ← 死在這
```

## 2. 根因

**`#name` 的 `maxLength={10}` 把 17 字的測試名稱靜默截斷成 10 字,
之後每一條以「全名」做的斷言都必然失配。**

`listing_name()` 產生 `f"服務{run_id}{node}"`,例如 `服務gh31231809650A0`
= **17 字**。`CreateServiceProvider.tsx` 的 `#name` 有 `maxLength={10}`
(產品規則,`src/utils/constants.ts` 的 `NAME_MAX_LENGTH`,畫面上也寫著
「最多10字」)。

本機以 Playwright 1.62 + 同版 Chromium 實測——`fill()` 是否受 maxlength 限制
是整條推論的關鍵前提,不能靠記憶:

```
test 想填的名稱        : '服務gh31231809650A0'  (len=17)
maxlength=10 欄位實際值 : '服務gh312318'         (len=10)
無 maxlength 對照組     : '服務gh31231809650A0'  (len=17)
React state 會收到      : '服務gh312318'
```

`fill()` 走 DOM 設值,瀏覽器**照樣套用 maxlength**。於是:

1. 表單拿到合法的 10 字名稱 → 驗證通過、送出鈕 enabled;
2. 刊登**真的被建立**,只是名字叫 `服務gh312318`;
3. 之後 `get_by_text("服務gh31231809650A0")` 永遠找不到東西。

而且 A0/C7/C8 截斷後**是同一個名字**(節點碼在第 10 字之後),連
「首頁只搜到一張卡片」這種斷言都會互相干擾。

### 假說 A(照片沒上傳完就送出)——**推翻,兩個 session 獨立得到同一結論**

前一份的三步論證完全成立,這裡照錄並補上實證:

1. 送出鈕的 disabled 條件含 `formData.photos.length !== 3`;
2. `formData.photos` 只在 `await Promise.all(uploadPromises)` resolve 之後才被填;
3. Playwright 的 `click` 會自動等 enabled,等不到就拋 `Locator.click timeout`
   ——同一場的 f50「退件路徑」正是這樣紅的(`element is not enabled`),
   而這五條**沒有任何一條**拋這個。

∴ 點下去時按鈕是 enabled 的 ⇒ 三張照片都上傳成功 ⇒ storage bucket 與
`upload-photo` 端點無恙(2026-08-05 的 bucket migration 已修好那條)。

### 假說 B(insert 失敗被吞掉)與 D(insert 成功但讀不回來)——**兩者皆非**

前一份把答案留成 B/D 二選一,並設計了「看 `[Create Listing] ✅` 這行 console log」
的判別法。那個判別法是對的,但**不必等 trace 就能回答**,而且答案在兩個選項之外:

- **insert 成功了**:job log 裡失敗當下的
  `guarded_page = <Page url='http://localhost:3100/service-providers'>`。
  `handleFinalSubmit` 只有在 `insertError` 為空時才 `navigate('/service-providers')`,
  出錯路徑會 `return` 而停在 `/service-providers/create`。**⇒ 排除 B。**
- **讀回來也成功了**:見下面 §9——第四條情境點得到「刪除刊登」鈕。
  **⇒ 排除 D。**

insert 成功、讀取成功、畫面也畫出來了,唯一對不上的是**名字**。

### 為什麼當時沒被發現

1. **mock 套件從不踩到**:`e2e/` 呼叫 `fill_valid_form()` 用預設名
   `測試服務者`(5 字);只有 journey 傳入由 `run_id` 導出的長名稱。
2. **截斷完全無聲**:沒有 console error、沒有 toast、表單驗證通過、
   資料真的寫進去了。
3. **失敗形狀在 2026-08-07 剛換過一次臉**:在那之前 `#name` 用
   `if (length <= 10)` 的 JS 拒收(PR #212 為了 IME 注音改成 `maxLength` 屬性)。
   舊寫法下 17 字會被**整串拒收** → 名稱空 → 送出鈕 disabled →
   失敗形狀是「點不到鈕」。**前一份的原假說 A 描述的正是舊形狀**,
   那也是它「看起來很合理卻與觀察不符」的來源。

## 3. 證據怎麼取得的(trace 下載不到)

前一份規劃的第一步是下載 artifact 看 trace。**這條路在本輪走不通**:
GitHub 的 artifact 一律轉址到 `productionresultssa4.blob.core.windows.net`,
該網域被 session 的 egress 政策擋掉(403),依 `/root/.ccr/README.md` 的
指示不繞道。

改用三種等價證據,結論一樣硬:

1. **job log 的 fixture 傾印**——失敗當下的 `guarded_page` repr 帶著 URL,
   等於前一份想從「截圖時間軸」拿的那一件事;
2. **失敗形狀的鑑別**——`Locator.click timeout` vs `expect` 失敗,
   等於「送出鈕當時 enabled 嗎」;
3. **本機真瀏覽器實測**——`fill()` 與 `maxlength` 的互動(§2)。

**教訓已記入 friction-log**:journey 的失敗診斷不該只有 artifact 一條路。
`builders/page_diagnostics.py` 的設計理由(「log 讀得到,不必下載 artifact」)
值得推廣到 GUI 情境的失敗路徑。

## 4. 已排除(有實據,前一份的成果照錄)

| 假設 | 排除依據 |
|---|---|
| **#246 自訂服務類別造成的** | **決定性**:#249 內文以上一次晉升 #243 逐條比對,f40 這三條**在 #243 就已失敗**,早於 #246 |
| **登入沒清 session(#256 修的那個)** | **決定性**:#256 合併後重跑,`auth-login-button` 逾時從 4 條降到 0、總失敗 19→13,而這五條**原樣還在** |
| **照片沒上傳完就送出(原假說 A)** | 見 §2 三步論證,本輪並以「沒有任何一條拋 click timeout」實證 |
| `normalize_listing_category` trigger 擋掉寫入 | journey 用內建類別「美髮」,normalize 後不變,對 journey 是 no-op;且 `api-tests` 綠 |
| `CategorySelectField` 改了 DOM 導致選不到類別 | `e2e-tests` 綠;若選不到,`fill_valid_form` 會先拋錯 |
| **insert 被 RLS 擋下(假說 B)** | 本輪新增:失敗當下 URL 已是 `/service-providers`,而出錯路徑不會導頁 |
| **管理頁讀不回來(假說 D)** | 本輪新增:第四條情境點得到「刪除刊登」鈕,見 §9 |

## 5. 同類掃描

- **根因抽象成的 pattern**:*測試往有長度上限的欄位填入超長值,被瀏覽器
  靜默截斷,失敗在遠處現身。*
- **掃描方式**:`grep -rn "maxLength" src/` 取得全部有上限的欄位,逐一對照
  journey 實際填進去的值長度。
- **結果**:☑ 找到——一併修。

| 欄位 | 上限 | 測試填的值 | 判定 |
|---|---|---|---|
| `CreateServiceProvider` `#name` | 10 | 17 字 | ✗ **本 bug** |
| `f60_time_scenarios_steps._listing_name` | 10 | 17 字 | ✗ **同一個 bug 的第二份逐字複製** |
| `CompleteProfile` 身分證 / 手機 | 10 | 各 10 字 | ✓ |
| `IdNumberInput` / `WithdrawalProcess` 身分證 | 10 | 10 字 | ✓ |
| `OTPVerificationPage` | 6 | 6 碼 | ✓ |
| `CreateServiceProvider` 服務介紹 | 200 | 未填 | ✓ |
| `CategorySelectField` 自訂類別 | 10 | journey 未填 | ✓ |
| `EditServiceProvider` 名稱 / 介紹 | 10 / 200 | 編輯流程尚無 journey 情境 | ✓ |

前一份預想的另一條 pattern(「`e2e/pages/` 的 page object 被 journey 拿去打
真後端,但它是為 mock 寫的」)**有實體**但不是根因:該 page object 檔頭
確實寫著「the upload itself is mocked」——那句話對 journey 是錯的,已一併訂正。

## 6. 修法與驗證

產品端完全正確,**不動任何產品行為**。10 字是規格(畫面標示、`NAME_MAX_LENGTH`
有自己的單元測試)。改產品去遷就測試會刪掉一條真規則,是最糟的修法。

1. **`e2e/journey/builders/listing.py`(新)** —— 唯一的名稱產生器,格式改為
   `服務{run_id 尾 4 碼}{node}`(如 `服務9650A0`,8 字):保住決定性、逐節點
   唯一,超過上限直接 `ValueError`。f40 與 f60 兩份逐字相同的複製一併收斂過去。
2. **`e2e/pages/base_page.py`** —— 新增 `fill_exact()`:填完回頭比對
   `input_value()`,把「靜默截斷」變成**當場失敗**,對所有有上限的欄位有效。
3. **`create_service_provider_page.py`** —— `#name` 改走 `fill_exact`;
   訂正檔頭「the upload itself is mocked」的註解(兩套共用,journey 打真 Storage)。
4. **`CreateServiceProvider.tsx`** —— `maxLength` 與字數計數器改用
   `NAME_MAX_LENGTH`(`EditServiceProvider` 早就這樣寫,這裡是唯一的例外)。

**為什麼這樣修是對的**(對照根因,不是對照症狀):根因是「送進表單的值超過
欄位上限」。修法讓那個值合規(1)、讓同一個錯誤不可能再從第二個地方長出來(2)、
讓「值沒被完整收下」在發生的當下就失敗而不是 30 秒後的遠處(3)。
症狀式修法(斷言只比前 10 字、或加長 timeout)會讓測試繼續綠著跑一個
名字是錯的的刊登。

### 驗證

- `cd e2e/journey && pytest tools/ -q` → 新增 6 條全綠;紅燈期時
  訊息為 `'服務gh31231809650A0' 有 17 字,超過 #name 的 maxLength=10`。
- 真瀏覽器實測 `fill_exact`:17 字被攔下並印出實際只收到 `'服務gh312318'`;
  8 字順利通過。**這個守衛能在當初出錯的那一行就攔到本 bug。**
- `npm run check` 全綠;`CreateServiceProvider.test.tsx` 經**變異驗證**
  (把 `maxLength` 改成字面量 20 → 當場紅;改回即綠)。
- ⏳ **真後端複驗**:journey full run 31234221750。本機不得跑 journey,
  這是唯一能證明五條轉綠的方式。

## 7. 防線回填

**為什麼既有閘門沒攔到**:沒有任何一層在檢查「填進去的值有沒有被完整收下」。
mock 套件用短名永遠踩不到;journey 一個月只跑幾次,而且失敗訊息指向的是
遠處的 `get_by_text`,連續兩個 session 都被帶離現場——**錯誤訊息把人帶錯方向,
是這個 bug 真正的成本**。

補了三層,彼此獨立,都不需要真後端:

| 層 | 攔的是 | 在哪跑 |
|---|---|---|
| `src/components/CreateServiceProvider.test.tsx` | 元件不再套用產品常數 | vitest |
| `e2e/journey/tools/test_listing_name.py` | 測試資料超過上限 / 產品改了上限 | journey-offline |
| `BasePage.fill_exact()` | **任何**有上限的欄位被靜默截斷 | 兩套 e2e,填的當下 |

中間那層原本是空的:上限的「值」定義在 `constants.ts`,journey 的離線測試
也讀它,但**沒有任何一層確認元件真的把那個常數套上去**。有人把 `maxLength`
改回字面量時,`constants.ts` 沒變、離線測試照樣綠,兩邊各自「正確」而中間
裂開——那正是本次 bug 的形狀。

前一份預想的防線(在 mock 版 e2e 補一個「insert 失敗時 UI 怎麼表現」的情境)
**仍然值得做,但不屬於本 bug**:它守的是假說 B,而 B 已被排除。已記入
friction-log 當待償還項,不在本次修法內——沒有壞掉的東西不該用測試釘住。

## 8. 前一個 session 為什麼沒動手(判斷正確,照錄)

**跑不了 journey,而當時判定決定性證據在 trace 裡。**

> 憑猜測改一個驗證不了的東西,比誠實說「需要 trace」更糟——尤其這條
> 可能是產品 bug,猜錯會讓真實的使用者問題被一個假修法蓋掉。

這個判斷是對的,而且救了一次:當時的領先假說 B(insert 被擋)若真動手,
會往 RLS policy 或錯誤處理去改——那會在一個完全正常的產品路徑上留下改動。

## 9. 那條「假陰性」——**前一份的判斷需要訂正**

前一份說 `下架後訪客在首頁找不到刊登` 是假陰性,因為「刊登本來就沒建成」。
**這一點不成立,而且它正好是解開本題的鑰匙。**

該情境的 `delete_listing` 會先點「刪除刊登」鈕,而那顆鈕**只有在管理頁
真的有一筆刊登時才存在**;沒有刊登時管理頁顯示的是空狀態與建立 CTA。
它 PASSED ⇒ 刊登存在、讀得回來、也畫得出來。它同時是五條裡**唯一不引用
名稱**的——那正是分界線。

不過前一份提出的**原則完全正確**,只是不適用於這條:
「斷言不存在」的情境必須先確認「存在過」,否則上游壞掉時會靜默放行。
本次修好之後這條情境的前置狀態才是真的,原則本身已記入 friction-log。

## 10. 相關檔案

| 路徑 | 為什麼 |
|---|---|
| `e2e/journey/builders/listing.py` | **本次新增**:唯一的名稱產生器 |
| `e2e/journey/tools/test_listing_name.py` | **本次新增**:長度不變式 |
| `e2e/pages/base_page.py` | **本次新增** `fill_exact()` |
| `src/components/CreateServiceProvider.test.tsx` | **本次新增**:元件套用常數的契約 |
| `e2e/journey/steps/f40_listing_steps.py` / `f60_time_scenarios_steps.py` | 兩處重複的名稱產生器,已收斂 |
| `src/utils/constants.ts` | `NAME_MAX_LENGTH` = 上限的單一事實來源 |
| `.claude/rules/e2e-tests.md` | journey 的執行限制 |

## 11. 這一輪其餘失敗(不在本檔範圍)

| 群 | 情境 | 症狀 | 初判 |
|---|---|---|---|
| 推薦樹 | f20 `Root 推薦樹只顯示三代且第四代不出現` | 展開 B3 後等不到 C7 的 `treeitem` | 世代統計卡是綠的,資料形狀對;問題在懶載入渲染或展開時序 |
| 推薦樹 | f60 `上線的組織圖顯示已失效節點且結構不斷開` | 等不到 D4 姓名 | 同上,同一支 `expand_ancestors` |
| 獎勵頁 | f60 `過期會員的點數保留不歸零` | `/rewards` 等不到 heading,停在 `/payment/checkout` | **像產品規則而非測試 bug**:過期會員被路由守衛導去續約頁,但情境預期他看得到獎勵頁。動手前先讀規格書 §7–§10 |
| 獎勵頁 | f60 `過期會員提領被擋` | 同上 | 同上 |
| 提領 | f50 `完整生命週期` | `GET /rest/v1/withdrawals` 回 **400** | 查詢本身壞了(欄位/語法),不是 RLS |
| 提領 | f50 `退件路徑:點數退回` | 「申請Point提領」鈕 disabled 20 秒 | 前置狀態沒到位,或退件後沒回復可申請 |
| 金流 | f60 `新約復活` | 等不到導向 PayUni sandbox,60 秒逾時 | 外部相依,可能是環境而非程式 |
| RLS | f45 `訪客不能建立刊登` | `assert 'unauthenticated' == 'denied_by_rls'` | ✅ **已修**(PR #257):PostgREST 把 42501 對匿名角色映成 401,`rls_probe.classify()` 在讀訊息前就被狀態碼短路 |
