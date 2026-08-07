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
| A6 | 使用該自訂類別的最後一筆刊登改成別的類別(或被刪除、或會籍過期、**或被停權**) | 該類別**自動**從下拉選單與篩選器消失 |
| A7 | 首頁篩選器 | 自訂類別與內建類別並列為 chip,可篩選 |
| A8 | 長度上限的自訂類別出現在卡片/徽章/chip/篩選摘要鈕 | 375px 與 768px 下不溢出版面(單行截斷) |
| A9 | 編輯一筆自訂類別的刊登(含自訂類別清單尚未載入完成時) | 下拉選單正確顯示該類別,不會顯示成未選擇 |
| A10 | 內建類別(如「美髮」)已被大量刊登使用 | 不因此在下拉選單的「自訂類別」區段重複出現 |

### 需求解讀(此處為判斷,非規格書明文)

**判斷一:類別是全站共享的詞彙。**
「輸入後的種類只要還有一個人使用就留著」隱含這件事——若自訂類別只有作者本人
看得到,「還有一個人使用就留著」這句話沒有著力點(第二個人永遠不可能用到它)。
故 A5 成立:自訂類別進入全站下拉選單。

**判斷二:「使用」= 目前**可見**的刊登在用,不是「資料列存在」。**
類別詞彙推導自 `public_listings`,而它以 `has_active_subscription()` 同時排除
**會籍過期**與**停權**兩種擁有者。也就是說:停權/過期會員的刊登資料列沒有被刪、
`category` 欄位也沒被清空,但只要他是該類別最後一人,類別會立刻從全站消失,
續約/解除停權後又自動回來。使用者原話「還有一個人使用」完全沒區分
「存在」與「可見」,這條是規劃自行做的判斷。

採用它的理由:篩選器只該提供**篩得到結果**的選項,而過期/停權會員的刊登本來就
整筆從全站消失(規格書 §5.3「刊登可見與提領/credit 用同一把尺」),類別跟著消失
才是一致的。〔人審可推翻——若認定類別應在停權期間留存,階段 2 的 view 要改成
直接建在 `listings` 上,並接受「篩得到 0 筆」的 chip〕

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
- ⚠️ view 的 `group by` **包含內建 30 類**(絕大多數刊登本來就選內建類別)。
  「自訂類別」的定義因此必須是 **view 回傳列 − `SERVICE_CATEGORIES`**,
  由 `deriveCustomCategories()` 一處實作;直接渲染 view 原始列會讓內建類別
  在下拉選單出現兩次(A10)

同一個 migration 另加一道**資料層防線**——A4「不產生重複類別」原本只由前端純函式
強制,但 `listings.category` 是純 `text`、RLS 只查 `user_id` 不查值的形狀,任何繞過
該元件的寫入路徑都能塞進近似重複字串,而 `group by` 是逐字元比對:

```sql
create trigger listings_normalize_category
  before insert or update of category on public.listings
  for each row execute function public.normalize_listing_category();
```

trigger 做三件事:空白正規化(`btrim` + 內部連續空白收成一個)、擋空白字串、
長度硬上限 20 字。**20 是 DB 的濫用上界,不是產品規則**——產品規則是 UI 的 10 字
(`CUSTOM_CATEGORY_MAX_LENGTH`),兩個數字職責不同,不是漂移。用 trigger 而非
CHECK constraint 是因為 CHECK 會在 `ALTER TABLE` 當下驗證既有資料,對線上資料
有未知風險;trigger 只作用於新寫入。

無 schema 變更(`listings.category` 仍是 `text`),故**無資料遷移、無回填**。

### 資料流:全站單一路徑

| 使用端 | 來源 |
|---|---|
| 刊登表單(Create/Edit) | `public_listing_categories` view |
| 首頁篩選器 | 同上 |

**原規劃讓首頁「就地從已載入的 `serviceProviders` 推導」,已否決。**
理由:`HomePage.fetchAllListings` 是 `select('*')` 且無 `limit`,面對的是同一個
PostgREST 列數上限風險,而它抓的是完整 row、比類別清單**更早**撞上限。屆時表單
(查 view)列得出某個自訂類別、首頁篩選器(截斷後的 `serviceProviders`)卻篩不到
任何一筆——正是我們想避免的「篩了 0 筆的 chip」,只是換條路徑發生。
兩處共用 `useCustomCategories` 之後,「哪些類別存在」全站只有一個答案。

連帶效果:訪客首頁成為 `grant select ... to anon` 的真實消費端。

**不比照 `useDataCache` 的 SWR 慣例**(`src/hooks/` 其他資料 hook 都走那套):
類別詞彙必須反映最新資料——使用者送出一個新自訂類別後若讀到快取,會看不到
自己剛建立的類別。查詢只有約 35 列,快取效益低於失效風險。

### API 變更

無。刊登 CRUD 本來就直接走 supabase client + RLS,不經 Edge Function。

## 3. 架構影響

- 新增 `src/utils/serviceCategories.ts`(純函式,vitest node 層)
- 新增 `src/hooks/useCustomCategories.ts`(唯一查 view 的地方)
- 新增 `src/components/listing/CategorySelectField.tsx`——Create/Edit **共用**
  的類別欄位。兩張表單現況是逐欄位複製的兩份(連字數計數器 JSX 都各寫一份),
  在兩處各疊同一組新邏輯等於再複製一層;抽出來之後,一個測試落點同時覆蓋兩張
  表單,也讓「當前值一定有對應選項」這條不變式只需維護一份
- 新增 `src/components/common/CategoryBadge.tsx`——四個徽章渲染點共用,
  寬度上限由建構保證(見 §4)
- 新增 `src/components/home/CategoryFilterChips.tsx`(自 `HomePage.tsx` 抽出,
  改吃 `categories` prop 才測得到)
- 動到 `CreateServiceProvider` / `EditServiceProvider` / `HomePage` /
  `FilterChip` / `ServiceProviderDetail` / `ServiceProviderManagement`;
  不動路由、不動 appShell lazy 結構
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
  (與「服務者名稱」欄位同一套視覺)、接上 `aria-invalid`/`aria-describedby`
  (`getInputAriaProps`,順手還既有欄位沒接的債)
- **上限取 10 字**:內建類別最長 6 字(各項運動教練),服務者名稱上限 10 字
  ——類別不該比名稱長;10 個全形字在 375px 的卡片徽章仍能單行呈現
- 錯誤態:留白送出 → `FieldError`「請輸入自訂類別」(沿用既有 `FieldError`)
- **收斂提示**:輸入的字經正規化後對應到既有類別時,顯示一行說明
  (「將歸入既有類別「美髮」」)。不提示的話使用者不知道自己的字被換掉了
- 載入態:自訂類別清單載入中或失敗時,下拉選單仍有內建 30 項與「自訂類別…」
  ——**功能不因附加資訊取不到而失效**
- **A9 不變式**:不論清單抓取狀態為何,`value` 目前的值一定在選項裡。
  由 `CategorySelectField` 把當前值併入選項集合來保證,不依賴載入時序
- **焦點移轉**:選到「自訂類別…」後以 `useEffect` 把焦點送進輸入框
  (jsdom 可斷言)。**但不宣稱 iOS 軟鍵盤必定彈出**——Radix 關閉下拉時會把
  焦點送回 trigger,且 iOS 限制手勢呼叫堆疊外的程式化 focus。緩解手段是
  版面:輸入框緊接在 trigger 正下方,使用者的下一次點擊就在原地

### 篩選器

`CategoryFilterChips` 自 `HomePage.tsx` 抽成獨立檔案並改吃 `categories` prop
(留在 HomePage 內部就沒有測試落點)。自訂類別排在內建之後,視覺上不分群
——對搜尋方而言「這個類別是誰定義的」不是有用的資訊。

### 溢字防線(§10)

自訂類別是**唯一長度不由開發者決定**的顯示欄位,所有渲染點都要有界。
四個徽章渲染點改用共用的 `CategoryBadge`,寬度上限**由建構保證**
——單一元件單一測試,取代「三處各自貼 CSS、零機械驗證」:

| 位置 | 現況 | 處置 | 機械驗證 |
|---|---|---|---|
| `MobilePhotoWallCard` 左上膠囊 | 已有 `max-w + truncate` | 不動 | 既有測試 |
| `Badge` 基底 | 已有 `max-w-full + text-ellipsis` | 不動 | — |
| 首頁桌面卡片徽章 | `shrink-0`,會把名稱擠到 0 寬 | 改用 `CategoryBadge` | ✅ `CategoryBadge.test` |
| 首頁手機卡片徽章 | 同上 | 改用 `CategoryBadge` | ✅ 同上 |
| 服務者詳情頁徽章 | `text-lg`,父層無 `min-w-0` | 改用 `CategoryBadge` | ✅ 同上 |
| 刊登管理頁徽章 | 父層 `<div>` 無 `min-w-0` | 改用 `CategoryBadge` | ✅ 同上 |
| `FilterChip` | 無寬度上限 | `max-w-full` + 內層 `truncate` | ✅ `FilterChip.test` |
| `DesktopFilterPopover`「類別:X」摘要鈕 | `Button` 基底 `whitespace-nowrap shrink-0`,無上限 | 摘要文字加寬度上限 + truncate | ❌ **無機械閘門**,僅人工驗收(已於 768px 截圖確認) |
| `MemberDashboard` 刊登卡片描述 | 外層 `CardDescription` 已 truncate | 不動(列入清單避免後人失去警覺) | — |

**徽章旁的名稱容器**(詳情頁 `<h1>`、刊登管理頁 `<h3>`)另需
`flex-1 min-w-0` + truncate——只在最外層補 `min-w-0`,擠壓不會解決、
只是換位置繼續存在。

**誠實揭露:名稱容器三處與桌面篩選摘要鈕沒有硬閘門**,靠
`e2e/test_overflow_sweep.py`(report-only)與人工驗收;而摘要鈕連
report-only 都掃不到——那支巡檢只掃 375px 一個寬度,而該列是
`hidden md:flex`,375px 下根本不會被渲染。
不把 report-only 的巡檢寫成「都有界」的佐證——那是 friction-log
2026-08-07 條記過的降級,這張表自己也差點犯同一條。

**`CategoryBadge` 的預設上限是 `max-w-full` 不是 `max-w-[45%]`。**
百分比只在「徽章與名稱同列競爭寬度」時才有意義,由那兩個呼叫端自己傳。
徽章獨佔一行的兩處套 45% 只會過度截斷:375px 下手機卡片單欄約 149px,
45% 扣掉內距後不到 4 個全形字,連「寵物美容」都放不下——那會直接違背
10 字上限「在 375px 卡片徽章仍能單行呈現」的設計前提。

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 領域純函式:正規化、收斂、驗證、排序 | `src/utils/serviceCategories.test.ts`(vitest node) | A3/A4/**A10** 的規則以純函式釘死;保留字與 sentinel 不可被冒用 |
| 2 | 資料層:view + 正規化 trigger | `supabase/functions/api/listing-categories.test.ts`(Deno,需 DB) | A6:最後一筆改類別後該類別從 view 消失;**會籍過期者與停權者**的類別都不外顯;trigger 正規化空白、擋空白字串 |
| 3 | 共用類別欄位元件 | `src/components/listing/CategorySelectField.test.tsx`(jsdom) | A1/A2/A3/A5/**A9**;收斂提示;焦點移轉;`check-ime-safe-inputs` 綠 |
| 4 | 篩選器 + 首頁接線 | `src/components/home/CategoryFilterChips.test.tsx`(jsdom) | A7:自訂類別出現為 chip 且能篩選 |
| 5 | 溢字防線 + 文件升級 | `src/components/common/CategoryBadge.test.tsx`、`FilterChip.test.tsx`、`e2e/test_overflow_sweep.py` 測資、規格書 §11/§12 | A8;`check-spec-drift` 綠 |

Create/Edit 兩張表單的接線在階段 3 一併改完——它們共用同一個元件,
分兩階段反而讓不變式(A9)有一階段是半套的。

## 6. 開放問題(逃生口)

- [ ] **自訂類別是否需要人工審核?** 目前規劃為不審核(全站無內容審核機制,
      加一套是獨立的 feature)。惡意/無意義類別的止血手段:`src/components/admin/`
      **沒有**任何操作 `listings` 的介面,實際得由工程師連 Supabase Studio 直接改
      該筆 row(admin 在 RLS 層有 update 權限,但那是資料庫權限、不是產品功能)。
      〔需人工裁決:若要審核,階段 2 的資料模型要改成「另存一張表 + 狀態」〕
- [ ] **上限 10 字是否足夠?** 依內建類別最長 6 字與名稱欄位 10 字推得,
      非規格書明文。若實際使用者反映不夠,改常數即可(單一來源)。
- [ ] **類別數量成長後的選取體驗**。目前先不處理:表單下拉是內建 30 + N 個自訂,
      只靠既有 `max-h-60 overflow-y-auto` 捲動,無型入即找(Radix Select 內建
      typeahead 對注音組字支援有限);篩選器 chip 同理。**表單這一側會先碰到**。
      量大到不可用時再談搜尋/分組。

## 7. 風險與回滾

| 風險 | 應對 |
|---|---|
| view 部署失敗 → 拿不到自訂類別 | hook 失敗時回退成「內建 30 項 + 自訂類別…」;A9 不變式不依賴這條查詢,編輯既有自訂類別的刊登仍正確 |
| 自訂類別大量增生 | 推導自實際使用,無人使用者自動消失;選取體驗見 §6 第三條 |
| 長類別撐破版面 | 四個徽章點由 `CategoryBadge` 建構保證 + `FilterChip`/摘要鈕有測試;**名稱容器三處無硬閘門**,靠 report-only 巡檢與人工驗收 |
| trigger 擋掉既有寫入路徑 | trigger 只正規化與擋「空白字串/超過 20 字」,既有內建類別最長 6 字,不受影響;只作用於新寫入,不驗證既有資料 |
| 回滾 | 前端改動可整段 revert;view 與 trigger 皆為新增物件,`drop view` / `drop trigger` 即可,**不影響 `listings` 任何資料** |
