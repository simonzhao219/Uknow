# journey f40「A0 透過 GUI 建立刊登」失敗 修復紀錄

分支:`fix/journey-f40-listing`|重現測試(紅燈 commit):**尚未開始**

> **本檔是交接文件,由前一個 session 預填。** 該 session 在處理「自訂服務類別」
> 功能(#246)時,因晉升 PR #249 卡在 journey 紅燈而追到這裡,但**沒有動手修**
> ——理由見 §7。下一個 session 從這裡接手。
>
> ⚠️ **未經驗證的都標成「假說」。** 前一個 session 跑不了 journey,
> 以下除了「§4 已排除」之外,全部是靜態分析的推論,不是實測結論。

## 1. 症狀與重現

**失敗情境**(`e2e/journey/features/40_listing.feature`):

```
Scenario: A0 透過 GUI 建立刊登
  When "A0" 登入並建立自己的刊登
  Then 刊登管理頁顯示該刊登      ← 死在這
```

**實際錯誤**(run 31204057428):

```
FAILED steps/f40_listing_steps.py::test_a0_透過_gui_建立刊登
  AssertionError: Locator expected to be visible
  Error: element(s) not found
  - Expect "to_be_visible" with timeout 30000ms
  - waiting for get_by_text("服務gh31204057428A0")
```

也就是:**送出之後,刊登管理頁上沒有出現那筆刊登。**

同章另外兩條跟著死(下游):
- `訪客可在公開首頁搜尋到_a0_的刊登並開啟詳情` — 等 `a[href^='/service-providers/']`
- `一個帳號僅能有一筆刊登` — 等 `服務gh31204057428A0`

(第四條「下架後訪客在首頁找不到刊登」反而**通過**——因為它斷言的是
「找不到」,而刊登本來就沒建成。**假陰性**,值得一併處理。)

### 為什麼這條特別重要

「會員透過 GUI 建立刊登」是**主線功能**。如果這是產品 bug 而不是測試 bug,
代表真實使用者也可能建不了刊登。**在確定是哪一種之前,不要假設它只是測試問題。**

## 2. 根因(**假說,未驗證**)

### 假說 A(最強):page object 是為「上傳被 mock」的環境寫的

`e2e/pages/create_service_provider_page.py` 的檔頭自己寫著:

> only `File.type` (image/jpeg) and size (<5MB) are checked client-side before
> upload, **and the upload itself is mocked**.

而 `_upload_three_photos()` 是:

```python
self.page.locator('input[type="file"]').set_input_files(files)
```

**設完檔案就返回,不等上傳完成。** mock 環境下上傳瞬間 resolve,所以沒問題;
journey 打的是**真 Supabase Storage**,三張照片要真實往返時間。

接著 `fill_valid_form` 填完 instagram 就 `submit()` 點「建立刊登」——而該按鈕在
`formData.photos.length !== 3` 時是 **disabled**(`CreateServiceProvider.tsx`
的 disabled 條件)。

⚠️ **這個假說有一個對不上的地方,不要忽略它**:Playwright 的 click 會自動等
元素 enabled,等不到會拋 `Locator.click timeout`。但實際錯誤發生在**後面那個
`listing_shown` 斷言**,代表 click 已經成功送出了。所以要嘛照片其實上傳成功了
(那假說 A 不成立或只是間歇性),要嘛 click 在某個狀態下沒被擋。
**這一點必須用 trace 釐清,不能繞過。**

### 假說 B:送出後的 insert 失敗但被吞掉

`handleFinalSubmit` 的 catch 只 `showError` 一個 toast,**不 throw**。
所以 insert 失敗時測試看不到任何異常,只會在後面「找不到刊登」時才死——
與觀察到的症狀相符。可能的失敗原因:RLS、必填欄位、storage bucket 不存在
(`20260805000001_add_listings_photos_bucket.sql`)。

**trace 裡的 network 分頁應該直接看得到那個 POST 的狀態碼。**

### 假說 C:純粹是逾時不足

30 秒對「三張照片真上傳 + insert + 導頁 + 管理頁載入」可能不夠。
若是這條,修法是等上傳完成的明確信號,**不是把逾時調大**
(調大只是把不穩定往後推)。

## 3. 同類掃描(**待做**)

根因若是「page object 假設上傳被 mock」,pattern 是
**「e2e/pages/ 的共用 page object 被 journey 拿去打真後端,但它是為 mock 寫的」**。

要掃的:`e2e/pages/` 底下所有被 `e2e/journey/` import 的 page object,
逐一問「它有沒有隱含 mock 才成立的假設(不等非同步完成、假資料、
瞬時回應)」。

```bash
grep -rn "^from pages\.\|^from pages import" e2e/journey/ --include="*.py"
```

## 4. 已排除(前一個 session 實際查證過)

| 假設 | 排除依據 |
|---|---|
| **#246 自訂服務類別造成的** | **決定性**:#249 內文以上一次晉升 #243(即現在的 main)逐條比對,f40 這三條**在 #243 就已失敗**。早於 #246 |
| `normalize_listing_category` trigger 擋掉寫入 | journey 用內建類別「美髮」,normalize 後不變、非空、未逾 20 字,不 raise——對 journey 是 no-op。且 `api-tests` 綠(12 條 Deno 測試驗 INSERT/UPDATE 兩條路徑) |
| `CategorySelectField` 改了 DOM 導致選不到類別 | `e2e-tests` 綠。page object 的 `_select("服務類別", "美髮")` 走 `get_by_role("combobox", name="服務類別")`,mock 版套件用同一支且通過 |
| 登入沒清 session(#256 修的那個) | **可能有關但不完整**。f40 的 `_open_management` 只登入一次,不是同情境內二次登入。#256 合併後的重跑會給答案 |

## 5. 修法與驗證(**待做**)

## 6. 防線回填(**待做**)

先想這題:**為什麼 `e2e-tests`(mock 版)全綠,journey 卻死?**
若根因是假說 A,那代表 mock 版套件對「上傳需要時間」這件事是零覆蓋——
而那正是真實使用者會遇到的情況。防線可能要加在 mock 版(用 deferred upload
mock,`fill_valid_form_photos_first` 的註解顯示這個機制已經存在)。

## 7. 前一個 session 為什麼沒動手

**跑不了 journey,而這題的決定性證據在 trace 裡。**

- journey 只在 CI 的拋棄式 Supabase 分支上跑;**PreToolUse hook 會擋本機執行**
  (見 `.claude/rules/e2e-tests.md`),而且會產生真資料、耗分支費用
- 靜態分析到假說 A 就是極限,而假說 A 自己有一個對不上的地方(§2 的 ⚠️)
- **憑猜測改一個驗證不了的東西,比誠實說「需要 trace」更糟**——尤其這條
  可能是產品 bug,猜錯會讓真實的使用者問題被一個假修法蓋掉

## 8. 下一個 session 的第一步:拿到 trace

失敗 run 的 artifact **含 Playwright trace 與截圖**,這是最快的解法:

| Run | Artifact |
|---|---|
| 31204057428 | `journey-results-31204057428`(artifact ID 9004823100) |
| 31208164464 | `journey-results-31208164464` |
| 31232337950 | #256 修法後的重跑(01:19 起跑,結果見 #249) |

下載後看 `test-results/` 裡 f40 那條的 trace:

```
npx playwright show-trace <trace.zip>
```

**要看的三件事**:
1. **Network**:`POST /listings/upload-photo` 三次的狀態碼與耗時;
   之後那個 `POST /rest/v1/listings` 有沒有發出、回什麼
2. **截圖時間軸**:點「建立刊登」的當下,按鈕是 enabled 還是 disabled?
   照片預覽出現了幾張?
3. **Console**:`CreateServiceProvider.tsx` 有大量 `console.log`
   (`[Upload Photos] …`),以及失敗時的 `console.error`

這三件事會直接分辨假說 A / B / C。

## 9. 相關檔案

| 路徑 | 為什麼 |
|---|---|
| `e2e/journey/features/40_listing.feature` | 失敗情境 |
| `e2e/journey/steps/f40_listing_steps.py` | 步驟實作(`create_listing` / `listing_shown`) |
| `e2e/pages/create_service_provider_page.py` | **共用 page object,假說 A 的核心** |
| `src/components/CreateServiceProvider.tsx` | 產品端:上傳流程、disabled 條件、被吞掉的 catch |
| `supabase/functions/api/index.ts` | `POST /listings/upload-photo` |
| `supabase/migrations/20260805000001_add_listings_photos_bucket.sql` | storage bucket |
| `.claude/rules/e2e-tests.md` | journey 的執行限制 |

## 10. 一併處理:那條假陰性

`下架後訪客在首頁找不到刊登` 在刊登根本沒建成時**照樣通過**。
「斷言不存在」的情境必須先確認「存在過」,否則它在上游壞掉時會靜默放行。
這與 `e2e/README.md`「Removing a scenario」談的證據強度是同一類問題。
