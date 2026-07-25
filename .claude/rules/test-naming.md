---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "supabase/functions/api/*.test.ts"
  - "e2e/**/*.feature"
---

# 測試命名守則

**由 `scripts/check-test-names.py` 機械把關**(framework-check 軌)。
規則編號與該檔的函式一一對應,它自己也有表格案例(`--self-test`)。

## 敘述語言:分層固定,不是各憑喜好

一個測試名有兩種成分,**分開處理**:

- **識別字**(函式名、端點、資料表、欄位、狀態值)→ 一律英文原樣
- **敘述**(情境與預期)→ 依所在層固定

| 層 | 敘述語言 | 為什麼 |
|---|---|---|
| vitest `it` / `test` | 中文 | 與 CLAUDE.md、註解、commit message 一致 |
| `Deno.test` | 中文 | 同上 |
| `e2e/journey/` Scenario | 中文 | 同上 |
| **`e2e/` (mocked Gherkin)** | **英文** | Gherkin 的 `Given/When/Then` 步驟文字與 `*_steps.py` 的 `@given('...')` **逐字綁定**,改一個字就是 collection error。這層已 99% 英文一致,動它風險高、價值低。 |

**斷言值不是名稱**:`Then I should see the text "已推薦 3 人"` 裡的中文是
UI 的實際文字,那是**資料**,必須維持中文。檢查器會先挖掉引號內容再驗。

`describe(...)` 是例外:它放的是**受測單元**(`buildApiUrl`、`validateInstagram`),
那是識別字,原樣英文。分組主題才用中文(例:`懶載入展開`)。

## 形式

**vitest**
```ts
describe('validateWithdrawalAmount', () => {   // 受測單元(識別字)
  it('低於最低額度時被拒', ...)                  // <情境>時，<預期>
  it('非 1000 倍數被拒', ...)
});
```

**Deno.test** —— `<主體>：<情境> → <預期>`
```ts
Deno.test('verify-referral-code：空推薦碼被拒', ...)
Deno.test('public_listings：停權後該會員的刊登消失', ...)
```

**Gherkin** —— 陳述句,不加句點
```gherkin
Scenario: An expired member cannot reach listing management
```

## 規則

**T1 敘述語言** —— 見上表。中文層的名稱必須含中文字元;`e2e/` 的
Gherkin 關鍵字行不得含中文(引號內的斷言值除外)。

**T2 長度上限(棘輪)** —— 中文層 72 字、英文層 110 字。
**必須分層**:中文每字的資訊量遠高於拉丁字母,同一個字元門檻套兩層會誤判
(2026-07 實測:中文層 max 71、英文層 max 107)。
超標通常代表**一個測試在測太多件事**,先想拆測試再想改門檻。

**T3 禁止空泛名** —— `works`、`test`、`ok`、`正確`、`正常`、`成功`
單獨作為名稱一律違規。一個說不出「證明了什麼」的名字,壞掉時也說不出壞在哪。
(這些字出現在長句裡完全沒問題,例:`手機號碼格式不正確`。)

**T4 `*.unit.test.ts` 不得碰資料庫 helper** ——
這個檔名是 **CI 分軌的依據**:`unit` 軌不跑 `supabase start`,`api-tests` 軌才跑。
名實不符會讓快軌去連一個不存在的資料庫。用到 `adminClient` /
`createTestUser` / `payForUser` / `getUserAccessToken` / `postgres` 就得叫 `*.test.ts`。

## 檔案命名

| 套件 | 規則 |
|---|---|
| vitest | `<受測檔>.test.ts(x)`,與受測檔**同層同名** |
| Deno(需資料庫) | `<主題>.test.ts`,與被測程式同層放 `api/` |
| Deno(純函式) | `<主題>.unit.test.ts` —— 見 T4,這個字尾有機械意義 |
| e2e | `<domain>.feature`(snake_case) |
| journey | `<NN>_<domain>.feature`,`NN` 是里程碑順序 |

## 一個名字該回答什麼

> **在什麼情境下、什麼行為、預期什麼結果。**

不是「呼叫了哪個函式」(那從程式碼看得到),而是「這條斷言在保護什麼」。
`referral-king-reward` 那個被刪掉的測試就是反例:名字寫「超過 8 也只有一張」,
規則改成每滿 8 發一張之後它靠 `floor(12/8)=1` 碰巧通過——名字宣稱守的行為
早就不是產品行為,真壞了也照樣綠燈。

## 新增測試時

1. 照上面的形式寫
2. `python3 scripts/check-test-names.py` 必須綠(`npm run check` 之外,
   framework-check 軌每次 CI 都會跑)
