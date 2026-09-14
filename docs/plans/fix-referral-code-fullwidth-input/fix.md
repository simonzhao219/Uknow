# 推薦碼輸入框沒有全形數字正規化 修復紀錄

分支:`fix/referral-code-fullwidth-input`|重現測試(紅燈 commit):`c81b96a`

## 1. 症狀與重現

中文輸入法在**全形模式**下輸入推薦碼,打出的是 `８０４８８７６`(U+FF18…)
而不是 `8048876`。驗證時後端查無此碼,回「推薦碼不存在或已失效」——訊息
沒有任何線索指向全形,使用者會以為碼是錯的。

重現測試:`src/components/CompleteProfile.test.tsx` 的
〈推薦碼的全形數字在組字結束後摺成半形〉,以及
`src/utils/referralCode.test.ts` 的 `normalizeReferralCode` 全套。

急迫性:推薦碼自 PR #311 起是 7 碼純數字流水號(規格書 §7.1)。碼變短、
可口述,**手動輸入從邊緣路徑變成主要路徑**,全形命中率隨之上升。

## 2. 根因

`CompleteProfile.tsx` 的 `onCommit` 只做 `raw.toLowerCase()`。而
`toLowerCase()` 對全形數字是 **identity**——`'８'.toLowerCase() === '８'`,
它只處理大小寫,不處理全形/半形。把全形摺成半形要的是 `normalize('NFKC')`。

**為什麼會寫錯**:寫的時候推薦碼是「3 小寫英文 + 6 數字」,作者關心的是
大小寫(`ABC123` → `abc123`),全形只在註解裡被提到一次
(「全形英數打得中(Ａ → ａ 是真的變了)」)——註解講的是「全形英數會觸發
改寫、所以要延後到組字結束」這個 IME 議題,不是「全形要被摺成半形」這個
正規化議題。兩個議題共用「全形」這個詞,於是前者被解決後,後者看起來也
像被處理過了。

**為什麼沒被接住**:`referral_codes.code` 沒有格式約束,`validate_referral_code`
是查表比對而非格式驗證,所以全形碼在任何一層都不是「錯誤輸入」,只是
「查無此碼」——與使用者真的打錯碼在系統中完全同形。沒有任何閘門能區分。

## 3. 同類掃描

- **根因抽象成的 pattern**:「推薦碼正規化」沒有單一實作。每個觸點各自
  手寫 `.toLowerCase().trim()`,於是「摺全形」這一步在**任何一處**都不存在——
  這不是某一行寫錯,是缺少單一事實來源的必然結果。
- **掃描方式**:`grep -n "toLowerCase" src/ supabase/functions/api/index.ts`,
  逐一判斷是否為推薦碼觸點。
- **結果**:□ 無同病灶 ■ 找到——一併修:

  | # | 位置 | 現況 | 處置 |
  |---|---|---|---|
  | 1 | `CompleteProfile.tsx` onCommit | `raw.toLowerCase()` | 改走 `normalizeReferralCode` |
  | 2 | `CompleteProfile.tsx` 送出 | `.toLowerCase().trim()` | 同上 |
  | 3 | `CompleteProfile.tsx` 驗證送出 | `.toLowerCase().trim()` | 同上 |
  | 4 | `CompleteProfile.tsx` 編輯模式回填 | `.toLowerCase()` | 同上 |
  | 5 | `CompleteProfile.tsx` `setVerifiedReferralCode(code)` | 存**原始值** | 存正規化值(見下方「系統」) |
  | 6 | `PaymentCheckout.tsx` 新推薦碼輸入 | **完全沒正規化** | 改走 `normalizeReferralCode` |
  | 7 | `referralInvite.ts` `savePendingReferral` | `.toLowerCase().trim()` | 同上 |
  | 8 | `api/index.ts` `/referrals/validate/:code` | `.toLowerCase().trim()` | 插入 `.normalize('NFKC')` |
  | 9 | `api/index.ts` `/listings/verify-referral-code` | `.toLowerCase().trim()` | 同上 |
  | 10 | `api/index.ts` `/auth/register` | `.toLowerCase().trim()` | 同上 |
  | 11 | `CompleteProfile.tsx` `/auth/register` 實際送出 | **送原始值** | 改走 `normalizeReferralCode` |
  | 12 | `api/index.ts` `/payuni/prepare` 換線碼 | `.toLowerCase().trim()` | 插入 `.normalize('NFKC')` |

  11 與 12 是**列完清單後再跑一次機械 grep 才浮出來的**——手動編目漏了兩個
  使用者輸入觸點(其中 11 送的還是完全未正規化的原始值)。記錄這件事本身:
  同類掃描的清單不能只靠閱讀,要以 grep 結果收斂。

  **刻意不動**:`api/index.ts:1860`、`:4145` 的 `default_referrer_code` 是
  **營運以 SQL 寫入的設定值**,不是使用者輸入。SQL 側的
  `resolve_default_referrer` 只做 `lower(trim())`,單方面在 Edge Function 加
  NFKC 會讓兩側對「同一個設定」有不同解讀,比全形設定值本身更危險。而全形
  設定值今天就會**大聲失敗**(驗證查無此碼 → 寫 `system_alerts`
  `default_referrer_code_invalid`),不是靜默——可接受。

  非推薦碼的同形寫法(`IdNumberInput` 的 `toUpperCase`、姓名欄位)**不在本次
  範圍**——身分證與姓名有各自的驗證規則與既有測試,混進來會讓這支 PR 失焦。
  記入 friction-log 排償還。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | **正規化必須落在 state 層(onCommit),不能只在送出時做。** `verifyReferralCode` 的 `setVerifiedReferralCode(code)` 存的是原始值,而送出的是正規化值;若只在送出處正規化,`formData.referralCode === verifiedReferralCode` 這個「驗證後有沒有被改過」的判準就會永遠不成立,使用者會卡在「請先驗證推薦碼」出不去。今天沒壞是因為兩邊都是原始值——一致但都錯。 |
| 架構 | 點狀 bug,但成因是缺少單一事實來源。修法是抽出 `normalizeReferralCode()` 並讓所有觸點走它,不是在每處各補一個 `.normalize()`。不需升級 `/plan-feature`——邊界清楚、無結構改動。 |
| UIUX | 錯誤確實由 UX 誘發:欄位沒有任何格式提示,錯誤訊息「推薦碼不存在或已失效」與「真的打錯碼」同形。正規化之後全形不再是錯誤路徑,**不需要新增錯誤訊息**——能自動修好的東西不該變成使用者的功課。刻意不加 `inputMode="numeric"`:舊格式碼含英文,鎖數字鍵盤會讓持舊碼者打不出來。 |
| 需求 | 規格書 §7.1 定義了編碼格式,但沒說「什麼算同一個碼」。比對規則(不分大小寫、不分全形半形)是業務規則不是實作細節,補一行進 §7.1。 |

## 5. 修法與驗證

- **修了什麼**:新增 `src/utils/referralCode.ts` 的 `normalizeReferralCode()`
  (NFKC → 小寫 → trim,idempotent),前端 8 個觸點全部改道;Deno 與 Vite 是
  獨立 runtime 無法共用模組,後端 4 個使用者輸入觸點以最小改動插入
  `.normalize('NFKC')`。規格書 §7.1 補「比對規則」一條(§7.1 原本只定義
  編碼格式,沒定義「什麼算同一個碼」)。
- **為什麼這樣修是對的**:對照的是根因「缺少單一正規化事實來源」,不是症狀
  「全形打不進去」。若只對照症狀,修法會是在 onCommit 加一個 `.normalize()`,
  留下另外十一個觸點繼續各自為政——下一個正規化需求(例如去除使用者貼上時
  夾帶的不可見字元)會再犯一次同樣的錯。
- **驗證**:`npm run check` 全綠(79 檔 920 測試),紅燈期經
  `scripts/tdd-unlock.sh` 解除(check 綠才刪鎖)。⚠️ **Deno 側未在本機驗證**
  ——本環境的網路政策擋掉 `deno.land`(403),裝不了 deno。後端改動因此
  刻意壓到「在既有運算式插入一個 `.normalize('NFKC')`」,不新增檔案或型別,
  由 CI 的 `api-tests` 軌把關。

## 6. 防線回填

- **為什麼既有閘門沒攔到**:全形碼在系統中與「打錯碼」完全同形(查表查不到),
  沒有任何一層有辦法區分。這不是閘門漏掉,是**閘門原理上攔不到**的類別。
- 處置:□ 已補閘門 ■ 攔不到,記 friction-log □ 其他
  —— 已寫入 `docs/plans/friction-log.md` 2026-09-14 條。記的重點不是這個
  bug,是它的**形狀**:`serviceCategories.ts` 早就寫對了(`categoryMatchKey`
  的 NFKC),知識完整、就是沒有離開那個檔案——與既有兩條(PR #119、
  2026-08-07 journey 登入)是同一個失效模式。另記一層:「全形」這個詞在
  `CompleteProfile.tsx` 同時指 IME 議題與正規化議題,前者解決後後者看起來
  也像被處理過了。
