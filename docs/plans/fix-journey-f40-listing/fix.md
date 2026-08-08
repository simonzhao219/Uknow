# journey「透過 GUI 建立刊登」失敗 修復紀錄

分支:`fix/journey-f40-listing`|重現測試(紅燈 commit):**尚未開始**

> **本檔是交接文件,由前一個 session 預填。** 該 session 在處理「自訂服務類別」
> 功能(#246)時,因晉升 PR #249 卡在 journey 紅燈而追到這裡,但**沒有動手修**
> ——理由見 §7。下一個 session 從這裡接手。
>
> ⚠️ **未經驗證的都標成「假說」。** 前一個 session 跑不了 journey,
> 除了 §2 的「已排除」與 §4 之外,全部是靜態分析的推論,不是實測結論。

## 0. 最新狀態(run 31232337950,2026-08-08 01:19–01:44)

**13 failed / 76 passed**(collected 89)。前一輪(#256 登入修法之前)是
**19 failed / 67 passed**(collected 86)。

登入修法有效且已驗證:**死在 `auth-login-button` 的情境從 4 條降到 0 條**,
下游連鎖跟著解開。但 **f40 這一組沒有跟著綠**,而且這一輪暴露出更重要的事:

**失敗範圍不是 3 條,是 5 條——而且跨兩個 feature 檔。**

| 情境 | 檔案 | 等不到的東西 |
|---|---|---|
| `A0 透過 GUI 建立刊登` | f40 | `服務gh31232337950A0` |
| `訪客可在公開首頁搜尋到 A0 的刊登並開啟詳情` | f40 | `a[href^='/service-providers/']`(下游) |
| `一個帳號僅能有一筆刊登` | f40 | `服務gh31232337950A0`(下游) |
| `刊登可見性隨會籍狀態變化(active→expired)` | **f60** | `服務gh31232337950C7` |
| `過期補繳:效期接續原到期日而非付款日,權益隨之恢復` | **f60** | `服務gh31232337950C8` |

f40 與 f60 用的是**不同的步驟檔、不同的使用者、不同的節點**
(`f40_listing_steps.py` vs `f60_time_scenarios_steps.py:58`),
共同因子只有一個:**`e2e/pages/create_service_provider_page.py` 這個共用
page object,以及它背後的 `CreateServiceProvider.tsx` 送出流程**。

這排除了「A0 這個帳號特別」「f40 這支步驟檔寫壞了」這類解釋。

## 1. 症狀與重現

**失敗形狀**(五條完全一致):

```
form.fill_valid_form(name=...)     ← 沒拋錯
form.submit()                      ← 沒拋錯
expect(page.get_by_text(名字)).to_be_visible(timeout=30_000)   ← 死在這
  AssertionError: Locator expected to be visible / element(s) not found
```

也就是:**點了「建立刊登」之後,刊登管理頁上沒有出現那筆刊登。**

步驟檔在 `submit()` 之後**不自己 goto**,靠產品端 `navigate('/service-providers')`
帶過去。所以「名字沒出現」有兩種可能:根本沒導頁(留在建立頁),
或導了但管理頁讀不到那筆。§2 的判別法就是分這兩種。

(f40 第四條「下架後訪客在首頁找不到刊登」反而**通過**——因為它斷言的是
「找不到」,而刊登本來就沒建成。**假陰性**,見 §9。)

### 為什麼這條特別重要

「會員透過 GUI 建立刊登」是**主線功能**。如果這是產品 bug 而不是測試 bug,
代表真實使用者也可能建不了刊登。**在確定是哪一種之前,不要假設它只是測試問題。**

## 2. 根因分析

### ❌ 假說 A(前一輪的主嫌)已被推翻:照片其實上傳完成了

原本的推論是:page object 檔頭自己寫著「the upload itself is mocked」,
而 `_upload_three_photos()` 設完檔案就返回、不等上傳完成,打真 Storage 時
按鈕還是 disabled。**這個推論不成立**,三步論證:

1. 送出鈕的 disabled 條件含 `formData.photos.length !== 3`
   (`CreateServiceProvider.tsx:582`)。
2. `formData.photos` 只在 `await Promise.all(uploadPromises)` **resolve 之後**
   才被填(同檔 199–211 行的 functional update)——所以 `length === 3`
   等價於「三張都上傳完了」。
3. `submit()` 是 `get_by_role("button", name="建立刊登").click()`,
   而 Playwright 的 click **會自動等 enabled,等不到就拋 `Locator.click timeout`**
   (同一輪的 f50「退件路徑」正是這樣紅的,log 裡看得到
   `element is not enabled / retrying click action`)。
   五條失敗**沒有任何一條**拋這個。

∴ 點下去的當下按鈕是 enabled 的 ⇒ 三張照片都上傳成功了。
**假說 A 與「純粹逾時不足」的假說 C 一併作廢**——症狀不是「慢」,是「沒發生」。

> 這段推論本身也還沒被 trace 證實,但它只依賴三個可直接讀到的事實
> (disabled 條件、setState 時機、Playwright click 的等待語意),
> 比原本的假說 A 紮實得多。§3 的第一件事仍應拿 trace 覆核。

### 假說 B(領先):insert 失敗,而錯誤被吞掉

`handleFinalSubmit`(`CreateServiceProvider.tsx:233–`)是**前端直打 PostgREST**
(`supabase.from('listings').insert(...)`),不走 Edge Function。失敗時:

```ts
if (insertError) {
  showError('刊登建立失敗', insertError.message || '請稍後再試');
  return;              // ← 不 throw、不導頁
}
```

測試看不到任何異常,只會在後面「找不到刊登」時才死——與觀察到的症狀相符。

### 假說 D(新增):insert 成功,但管理頁讀不回來

`listings` 上有兩條 SELECT policy:`listings_select_own`(自己的,
`20260620000002`)與 `listings_select_public`(`has_active_subscription(user_id)`,
`20260620000004`)。A0 在 f40 當下是有效會員,理論上兩條都通——但**理論通
不等於實際通**,而 B 與 D 的症狀完全一樣,不能靠猜。

### **一行 console log 就能分開 B 和 D**

`handleFinalSubmit` 在 insert 成功後才印:

```
[Create Listing] ✅ 刊登建立完成
```

- trace 的 Console 裡**有這行** → insert 成功 ⇒ **假說 D**(讀回來的問題)
- **沒有這行** → insert 失敗 ⇒ **假說 B**,同一份 log 裡的
  `showError` 內容就是 PostgREST 的原始 message

這是 §3 拿到 trace 後**第一個要看的東西**,比翻 Network 快。

## 3. 下一個 session 的第一步:拿 trace

失敗 run 的 artifact **含 Playwright trace 與截圖**:

| Run | Artifact | 備註 |
|---|---|---|
| **31232337950** | `journey-results-31232337950`(**artifact ID 9014571465**,32MB) | **最新,#256 登入修法之後**,優先用這個 |
| 31204057428 | `journey-results-31204057428`(artifact ID 9004823100) | 修法前 |
| 31208164464 | `journey-results-31208164464` | 修法前 |

下載頁:`https://github.com/simonzhao219/Uknow/actions/runs/31232337950/artifacts/9014571465`

```
npx playwright show-trace <解壓後 test-results/ 裡 f40 那條的 trace.zip>
```

**要看的三件事,依優先序**:

1. **Console** ——`[Create Listing] ✅ 刊登建立完成` 在不在?(§2 的判別法)
   同時看 `[Upload Photos] ✅ 所有照片上傳完成,共 3 張` 是否出現,
   順帶把假說 A 的推翻做成實證。
2. **Network** ——`POST /rest/v1/listings` 有沒有發出、狀態碼與 response body。
   若是 4xx,body 裡的 PostgREST message 直接給出根因。
3. **截圖時間軸** ——點下「建立刊登」之後停在哪一頁。留在
   `/service-providers/create` ⇒ 假說 B;到了 `/service-providers` 但列表空 ⇒ 假說 D。

## 4. 已排除(有實據)

| 假設 | 排除依據 |
|---|---|
| **#246 自訂服務類別造成的** | **決定性**:#249 內文以上一次晉升 #243(即現在的 main)逐條比對,f40 這三條**在 #243 就已失敗**,早於 #246 |
| **登入沒清 session(#256 修的那個)** | **決定性,本輪新增**:#256 合併後重跑,`auth-login-button` 逾時從 4 條降到 0、總失敗 19→13,而這五條**原樣還在**。登入不是這條的鏈頭 |
| **照片沒上傳完就送出(原假說 A)** | 見 §2 的三步論證(disabled 條件 + setState 時機 + Playwright click 語意)。待 trace 覆核 |
| `normalize_listing_category` trigger 擋掉寫入 | journey 用內建類別「美髮」,normalize 後不變、非空、未逾 20 字,不 raise——對 journey 是 no-op。且 `api-tests` 綠(12 條 Deno 測試驗 INSERT/UPDATE 兩條路徑) |
| `CategorySelectField` 改了 DOM 導致選不到類別 | `e2e-tests` 綠;且若選不到,`fill_valid_form` 會先拋錯,而它沒有 |

## 5. 同類掃描(**待做**)

若根因落在假說 B/D(前端直打 PostgREST + 錯誤只進 toast),pattern 是
**「寫入失敗只 showError 不 throw,測試與使用者都只看得到『沒反應』」**。

```bash
grep -rn "showError\|showToast" src/components --include=*.tsx -A2 | grep -B2 "return;"
```

若根因落在「共用 page object 假設上傳被 mock」,pattern 是
**「`e2e/pages/` 的 page object 被 journey 拿去打真後端,但它是為 mock 寫的」**:

```bash
grep -rn "^from pages\.\|^from pages import" e2e/journey/ --include="*.py"
```

## 6. 修法與驗證(**待做**)

## 7. 防線回填(**待做**)

先想這題:**為什麼 `e2e-tests`(mock 版)全綠,journey 卻死?**
mock 版把 `POST /rest/v1/listings` 一律 mock 成成功,所以「insert 被拒絕時
UI 怎麼表現」在 mock 版是零覆蓋——而那正是真實使用者會遇到的情況。
防線大機率要加在 mock 版:mock 一個失敗回應,斷言使用者看得到、
且**留在原頁**而不是靜默不動。

## 8. 前一個 session 為什麼沒動手

**跑不了 journey,而這題的決定性證據在 trace 裡。**

- journey 只在 CI 的拋棄式 Supabase 分支上跑;**PreToolUse hook 會擋本機執行**
  (見 `.claude/rules/e2e-tests.md`),而且會產生真資料、耗分支費用
- **憑猜測改一個驗證不了的東西,比誠實說「需要 trace」更糟**——尤其這條
  可能是產品 bug,猜錯會讓真實的使用者問題被一個假修法蓋掉

## 9. 一併處理:那條假陰性

`下架後訪客在首頁找不到刊登` 在刊登根本沒建成時**照樣通過**。
「斷言不存在」的情境必須先確認「存在過」,否則它在上游壞掉時會靜默放行。
這與 `e2e/README.md`「Removing a scenario」談的證據強度是同一類問題。

## 10. 相關檔案

| 路徑 | 為什麼 |
|---|---|
| `e2e/journey/features/40_listing.feature` | 失敗情境 |
| `e2e/journey/steps/f40_listing_steps.py` | `create_listing` / `listing_shown` |
| `e2e/journey/steps/f60_time_scenarios_steps.py:46-58` | **同形狀的第二處**,證明不是 f40 專屬 |
| `e2e/pages/create_service_provider_page.py` | 共用 page object(`submit()` = 純 click) |
| `src/components/CreateServiceProvider.tsx` | 產品端:582 行 disabled 條件、199–211 上傳 setState、233– `handleFinalSubmit` 的吞錯 |
| `supabase/migrations/20260620000002_rls_policies.sql` | `listings_insert_own` / `listings_select_own` |
| `supabase/migrations/20260620000004_security_hardening.sql` | `listings_select_public` + `has_active_subscription` |
| `.claude/rules/e2e-tests.md` | journey 的執行限制 |

## 11. 這一輪其餘 8 條失敗(不在本檔範圍,但同一個晉升 PR 卡著)

留在這裡讓接手的人知道「修完這 5 條還剩什麼」,不要誤以為 journey 會就此全綠。

| 群 | 情境 | 症狀 | 初判 |
|---|---|---|---|
| 推薦樹 | f20 `Root 推薦樹只顯示三代且第四代不出現` | 展開 B3 之後等不到 **C7** 的 `treeitem` | 世代統計卡(一/二/三代各 8)**是綠的**,所以資料形狀對;問題在懶載入渲染或展開時序 |
| 推薦樹 | f60 `上線的組織圖顯示已失效節點且結構不斷開` | 等不到 **D4** 的姓名 | 同上,同一支 `referral_tree.expand_ancestors` |
| 獎勵頁 | f60 `過期會員的點數保留不歸零` | `/rewards` 上等不到「獎勵回饋」heading,失敗當下停在 `/payment/checkout` | **像是產品規則而非測試 bug**:過期會員被路由守衛導去續約頁,但情境預期他看得到獎勵頁。動手前先讀規格書 §7–§10 確認哪邊才對 |
| 獎勵頁 | f60 `過期會員提領被擋,點數保留,僅擋提領` | 同上 | 同上 |
| 提領 | f50 `完整生命週期:申請→匯款→查收` | `GET /rest/v1/withdrawals?...` 回 **400** | 查詢本身壞了(欄位/語法),不是 RLS |
| 提領 | f50 `退件路徑:點數退回` | 「申請Point提領」按鈕 **disabled** 20 秒 | 前置狀態沒到位(點數/資格),或退件後沒回復可申請 |
| 金流 | f60 `新約復活:換推薦人,效期自付款日起算,刊登重新公開` | 等不到導向 `sandbox-api.payuni.com.tw`,60 秒逾時 | PayUni sandbox 外部相依,可能是環境而非程式 |
| RLS | f45 `訪客不能建立刊登` | `assert 'unauthenticated' == 'denied_by_rls'` | ✅ **已修**(本 PR):PostgREST 把 42501 對匿名角色映成 401,`rls_probe.classify()` 在讀訊息前就被狀態碼短路。policy 其實有生效,是判讀錯了 |
