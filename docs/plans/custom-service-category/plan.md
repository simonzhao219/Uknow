# 自訂服務類別 規劃書

## 0. 一句話

這個 feature 讓**刊登者**能在 30 個內建服務類別之外**自行輸入類別名稱**,
因為既有清單是封閉列舉,清單外的職業(例:寵物美容、寵物溝通)只能選「其他」
——一個把所有長尾服務壓成同一格的類別,對搜尋方等於沒有分類。

## 1. 使用者需求

對照規格書:`docs/uknow-software-specification.md` §11(刊登)、§12.1(服務類別)。

### 驗收情境

| # | 情境 | 預期 |
|---|---|---|
| A1 | 刊登表單的類別下拉選單選「自訂類別…」 | 出現文字輸入框,可輸入自訂名稱 |
| A2 | 自訂輸入框用 iOS 注音打字 | 組字期間值不被改寫也不被拒收(PR #212 的災情不重演) |
| A3 | 送出時自訂類別留白 | 擋下並提示「請輸入自訂類別」 |
| A4 | 輸入的自訂類別與既有類別只差空白/大小寫/全半形 | 收斂到既有那一個,不產生重複類別 |
| A5 | 甲建立自訂類別「寵物美容」後,乙開刊登表單 | 下拉選單裡看得到「寵物美容」可直接選 |
| A6 | 使用該自訂類別的最後一筆刊登改成別的類別(或被刪除、或會籍失效) | 該類別**自動**從下拉選單與篩選器消失 |
| A7 | 首頁篩選器 | 自訂類別與內建類別並列為 chip,可篩選 |
| A8 | 長度上限的自訂類別出現在卡片/徽章/chip | 375px 下不溢出版面(單行截斷) |

### 需求解讀(此處為判斷,非規格書明文)

「輸入後的種類只要還有一個人使用就留著」隱含**類別是全站共享的詞彙**——
若自訂類別只有作者本人看得到,「還有一個人使用就留著」這句話沒有著力點
(第二個人永遠不可能用到它)。故 A5 成立:自訂類別進入全站下拉選單。

### 不做什麼

- 不做自訂類別的審核/檢舉/管理後台(沒有這個需求,也沒有既有的內容審核機制)
- 不做類別改名、不做類別合併工具
- 不動內建的 30 個類別(既有刊登不受影響)
- 不做多層分類/標籤(仍是單選一個類別)

## 2. 系統設計

### 核心決策:類別詞彙用「推導」而非「另存一張表」

需求 2(有人用就留著、沒人用就刪掉)本質是**引用計數**。做法有兩條:

| 方案 | 做法 | 問題 |
|---|---|---|
| A 另建 `service_categories` 表 | 新增/刪除靠 trigger 或排程回收 | 兩份真相會漂移(孤兒類別、漏刪、競態);需要 RLS、需要清理任務 |
| **B 從 `listings` 推導**(採用) | 類別集合 ≡ `select distinct category from public_listings` | 引用計數就是 `group by` 本身,**沒有東西需要刪除** |

方案 B 讓「沒人使用就刪除」不是一段要維護的清理邏輯,而是**不可能違反的恆等式**。

### 資料庫變更

新增 migration:`supabase/migrations/20260807000002_public_listing_categories.sql`

```sql
create view public.public_listing_categories
with (security_invoker = on) as
select l.category, count(*)::int as listing_count
from public.public_listings l
group by l.category;
grant select on public.public_listing_categories to anon, authenticated;
```

- 疊在 `public_listings` 之上,可見性規則(`has_active_subscription`)只定義一次
- `security_invoker = on`:與 `public_listings` 一致,不繞過 RLS
- **不用前端 `select('category')` 自行 distinct**:PostgREST 有預設列數上限,
  刊登數超過上限時類別清單會**靜默截斷**——那是會沉默失效的正確性 bug。
  view 一個類別一列,payload 與刊登數無關

無 schema 變更(`listings.category` 仍是 `text`),故**無資料遷移、無回填**。

### 資料流

| 使用端 | 來源 | 為什麼 |
|---|---|---|
| 刊登表單(Create/Edit) | `public_listing_categories` view(`useCustomCategories` hook) | 表單手上沒有刊登資料,必須查 |
| 首頁篩選器 | 已抓到的 `serviceProviders` 就地推導 | 首頁**已經**有全部刊登;再發一次請求拿它已知的資訊是浪費,且推導結果與畫面上的結果保證一致(不會出現篩了 0 筆的 chip) |

兩條路徑共用 `src/utils/serviceCategories.ts` 的同一組純函式,推導邏輯只有一份。

### API 變更

無。刊登 CRUD 本來就直接走 supabase client + RLS,不經 Edge Function。

## 3. 架構影響

- 新增 `src/utils/serviceCategories.ts`(純函式,vitest node 層)
- 新增 `src/hooks/useCustomCategories.ts`(唯一查 view 的地方)
- 動到 `CreateServiceProvider` / `EditServiceProvider` / `HomePage` /
  `FilterChip`;不動路由、不動 appShell lazy 結構
- 與 multi-step-flow 四契約無關(刊登表單是單步表單)
- **IME 安全性**:自訂輸入框的 `onChange` 一律原樣收下 `e.target.value`,
  長度上限交給 DOM `maxLength`。這條由 `scripts/check-ime-safe-inputs.py`
  機械把關(PR #212 建立的閘門),不是靠自律
- 效能:view 的 `group by` 掃的是 `public_listings`,與首頁本來就跑的查詢同量級;
  表單頁多一次小查詢(約 35 列)
- 安全:自訂類別是使用者輸入的自由文字,會渲染在全站卡片上。React 預設跳脫,
  無 `dangerouslySetInnerHTML`;長度上限 + 空白正規化限制濫用空間

## 4. UI/UX

對照 `docs/ui-ux-guidelines.md` §7(響應式)、§10(溢字/溢版)。

### 刊登表單

下拉選單順序:**內建 30 項 → 分隔線 → 既有自訂類別(依使用數多寡)→「自訂類別…」**。
選到「自訂類別…」才顯示文字輸入框(漸進揭露,不佔預設版面)。

- 輸入框:`maxLength={CUSTOM_CATEGORY_MAX_LENGTH}`、右下角 `n/10` 計數器
  (與「服務者名稱」欄位同一套視覺)
- **上限取 10 字**:內建類別最長 6 字(各項運動教練),服務者名稱上限 10 字
  ——類別不該比名稱長;10 個全形字在 375px 的卡片徽章仍能單行呈現
- 錯誤態:留白送出 → `FieldError`「請輸入自訂類別」(沿用既有 `FieldError`)
- 空態/載入態:自訂類別清單載入中或載入失敗時,下拉選單仍有內建 30 項與
  「自訂類別…」——**功能不因附加資訊取不到而失效**

### 篩選器

`CategoryFilterChips` 由「寫死 `SERVICE_CATEGORIES`」改為接受 `categories` prop。
自訂類別排在內建之後,視覺上不分群——對搜尋方而言「這個類別是誰定義的」
不是有用的資訊。

### 溢字防線(§10)

自訂類別是**唯一長度不由開發者決定**的顯示欄位,所有渲染點都要有界:

| 位置 | 現況 | 處置 |
|---|---|---|
| `MobilePhotoWallCard` 左上膠囊 | 已有 `max-w + truncate` | 不動 |
| `Badge` 基底 | 已有 `max-w-full + text-ellipsis` | 不動 |
| 首頁桌面卡片徽章 | `shrink-0`,會把名稱擠到 0 寬 | 加 `max-w-[45%]` |
| 服務者詳情頁徽章 | `text-lg`,父層無 `min-w-0` | 補 `min-w-0` |
| 刊登管理頁徽章 | 父層 `<div>` 無 `min-w-0` | 補 `min-w-0` |
| `FilterChip` | 無寬度上限 | 加 `max-w-full` + 單行截斷 |

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 領域純函式:正規化、收斂、驗證、排序 | `src/utils/serviceCategories.test.ts`(vitest node) | A3/A4 的規則以純函式釘死;保留字與 sentinel 不可被冒用 |
| 2 | 資料層:`public_listing_categories` view | `supabase/functions/api/listing-categories.test.ts`(Deno,需 DB) | A6:最後一筆改類別後,該類別從 view 消失;會籍失效者的類別不外顯 |
| 3 | 刊登表單:下拉選單 + 自訂輸入 | `src/components/CreateServiceProvider.test.tsx`(jsdom) | A1/A2/A3/A5;`check-ime-safe-inputs` 綠 |
| 4 | 篩選器:chip 由資料推導 | `src/components/HomePage.test.tsx`(jsdom) | A7:自訂類別出現為 chip 且能篩選 |
| 5 | 溢字防線 + 文件升級 | `src/components/common/FilterChip.test.tsx` + 規格書 §11/§12 | A8;`check-spec-drift` 綠 |

## 6. 開放問題(逃生口)

- [ ] **自訂類別是否需要人工審核?** 目前規劃為不審核(全站無內容審核機制,
      加一套是獨立的 feature)。惡意/無意義類別的止血手段是管理員直接改該筆
      刊登(admin 對 `listings` 有 update 權限),類別隨之消失。
      〔需人工裁決:若要審核,階段 2 的資料模型要改成「另存一張表 + 狀態」〕
- [ ] **上限 10 字是否足夠?** 依內建類別最長 6 字與名稱欄位 10 字推得,
      非規格書明文。若實際使用者反映不夠,改常數即可(單一來源)。

## 7. 風險與回滾

| 風險 | 應對 |
|---|---|
| view 部署失敗 → 表單拿不到自訂類別 | hook 失敗時回退成「只有內建 30 項 + 自訂類別…」,表單仍可用 |
| 自訂類別大量增生、篩選器 chip 爆量 | 推導自實際使用,無人使用者自動消失;真的太多時再談分頁/搜尋 |
| 長類別撐破版面 | 階段 5 的六個渲染點都有界;`e2e/test_overflow_sweep.py` 在 375px 巡檢 |
| 回滾 | 前端改動可整段 revert;view 為新增物件,`drop view` 即可,**不影響 `listings` 任何資料** |
