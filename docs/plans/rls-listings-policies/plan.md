# listings RLS policy 行為驗證 規劃書

> **v3(2026-08-07)** —— 依 `./review-v2.md`(第二輪:P0=0、P1=1、P2=9、需裁決=2)
> 與人裁決「全部照建議」修訂,並同步 `origin/develop` 前進(PR #199)後的過期事實。
> v2 → v3 主要變動:L1 補 `relrowsecurity` 斷言、`classify()` 拆成零網路依賴模組、
> 表達式比對改空白正規化、新增 §9 知識升級落點、情境數 28→**38**(既有)。

## 0. 一句話

讓 `listings` 的 5 條 RLS policy 有機械把關,因為前端直連 PostgREST 的讀寫
路徑上 RLS 是**唯一**的授權機制,而它目前零測試。

### 停權(suspended)分支為什麼不必另測——這是推論,不是有一支測試直接證明

`has_active_subscription()` 同時擋到期與停權(§5.3),本輪不為停權另寫情境。
「已涵蓋」這個結論是**三件事疊加**推出來的,不是單一測試的直接結果:

1. **函式邏輯** —— `api/listings.test.ts:199`(`public_listings：停權後該會員的
   刊登消失`)證明函式對 `suspended_at` 分支確實算出 false。它走 service-role
   查 view,繞過 RLS,所以證明的只有函式本身。
2. **RLS 機制** —— 本規劃的驗收情境 3 證明「函式回傳 false」時 RLS **真的會擋**
   anon 直連 raw table。它只用 expired 分支示範,所以證明的只有機制。
3. **綁定關係** —— L1 釘死 `listings_select_public` 的 USING 表達式,確保它呼叫的
   正是同一個 `has_active_subscription()`。

1 + 2 + 3 才推得出「停權會員的刊登被 anon 直連擋下」。任一環鬆掉,這個結論就不成立
——**要動這段 RLS 的人請先讀懂這三段的分工**。

## 1. 使用者需求

- 規格書:§2.2(瀏覽/讀取走前端直連、RLS 保護)、§11 刊登系統(1:1、可見性由
  `has_active_subscription` 決定)、§5.1(失效即隱藏)、§5.3(守衛順序三處對齊)
- 這不是使用者可見功能,是**既有行為的防線回填**

### 「訪客可直連 `listings`」的授權依據

規格書 §11 只寫「訪客走 `public_listings` View」,**字面沒有**授權訪客直連
`listings` 資料表。真正的依據是 migration,不是 §11:

- `20260620000004`:`public_listings` 改成 `security_invoker` 之後,底層
  `listings` 必須有一條可見性 policy,view 在 anon 身分下才回得了資料 ——
  `listings_select_public` 就是為此而生
- `20260726000001`:明確重申「anon 讀 listings 仍由 `listings_select_public`
  決定可見範圍」是**刻意設計**,不是該次改動的對象

⚠️ `20260620000002` 檔頭的「訪客瀏覽刊登走 public_listings View...不直接開放
listings」與 `api/listings.test.ts:219` 的「public_listings 是唯一對 anon 開放
select 的資料表面」**都已是與 0004 之後行為不一致的過時說法**。處理見 §5。

### 「刊登隱藏」的語意

§2.1 與 §5 表格寫「會籍失效 → 刊登隱藏」,指的是**公開可見度**,不是擁有者
自身的讀取權。`listings_select_own` 本就不含 active 條件,
`src/hooks/useUserListing.ts` 也有對應設計註解。驗收情境 1 依據的是這個解讀,
明確排除「失效即完全不可見」那一種讀法。

### 不做

- 其餘 11 張表的 policy —— 見 §3「補齊順序」
- 停權維度 —— 見 §0
- `public_listings` view 的可見性 —— `api/listings.test.ts` (B) 已涵蓋,不重複
- 任何產品碼與 migration 的**行為**改動(唯一例外是 §9 的兩處最小事實註解)

**兩處既有的「0 列即假成功」瑕疵,本輪不修**(範圍控制),但要有持久歸宿(§9):

| 位置 | 症狀 |
|---|---|
| `ServiceProviderManagement.tsx:56-59` | 0 列 DELETE 不是 error → `if (deleteError)` 不觸發 → 顯示「刊登已成功刪除」 |
| `EditServiceProvider.tsx:252-271` | 0 列 UPDATE 同理 → 顯示「服務者資訊已更新!」並 navigate 離開 |

兩者**結構完全對稱**(§2「兩種拒絕形狀」一節已承認 UPDATE 與 DELETE 共享
「被過濾非錯誤」特性),且都**已驗證在任何前端路徑下不可觸發**:
`/service-providers` 路由無 `:id` 參數、全站僅一處 `.delete()`、`listing.id`
一律來自 `useUserListing()` 的 `.eq('user_id', userId)` 自我限定查詢;
`/service-providers/edit/:id` 雖可手動改網址,但 `EditServiceProvider.tsx:68-72`
的 ownership 檢查在 `setServiceProvider` **之前** redirect。
**寫在這裡是為了讓實作者不要順手去修它**——真正的持久記錄見 §9。

### 驗收情境

**讀取邊界(5 條)**

1. 失效會員仍讀得到自己的刊登 —— 只有 `listings_select_own` 能讓它成立
2. 訪客(anon)直打 `/rest/v1/listings` 讀得到**有效**會員的刊登
3. 訪客直打 `/rest/v1/listings` 讀不到**失效**會員的刊登
4. 另一位登入會員讀不到失效會員的刊登
5. **管理員讀得到失效會員的刊登** —— `select_own` 的 `or is_admin()` 分支。
   ⚠️ **這條是 characterization,不是規格明文需求**:規格書 §13 的管理後台模組
   清單裡沒有「刊登管理」,§1 開頭列的規格依據沒有一條佐證「管理員可直讀他人
   刊登」。它把關的是 **policy 明文宣告的授權語意**。相關疑慮見 §7。

**寫入邊界(6 條)**

6. **擁有者 PATCH 自己的刊登 → 1 列受影響且欄位確實變更**
7. B 以 `user_id = A` insert → 403 + `code: 42501`,訊息是 RLS 形狀
8. anon insert `user_id = A` → 同上被拒,且無列產生
9. B PATCH A 的刊登 → **影響 0 列**,且以 service role 回讀確認未變
10. B DELETE A 的刊登 → **影響 0 列**,且該列仍存在
11. A 把自己刊登的 `user_id` 改成 B → 42501(WITH CHECK)

### 三件關於斷言強度的事實(不要在實作時弄丟)

**(a) 情境 7、8 保護的是「條件被放寬」,不是「policy 被刪除」。**
RLS 對缺少任何 permissive policy 的 INSERT 一律 default-deny,錯誤訊息文字與
WITH CHECK 失敗時**完全相同**。「`listings_insert_own` 被整條刪掉」由既有
`40_listing.feature` 的「A0 透過 GUI 建立刊登」正面情境兜底。

**(b) 情境 9 的區辨力來自情境 6,不是它自己。**
「B PATCH A → 0 列」在 policy 正確與整條被刪兩種情況下觀察結果相同。是情境 6
補上另一半:policy 整條被刪 → 情境 6 從 1 列變 0 列翻紅;條件被放寬 → 情境 9
翻紅。delete 同理,由 `40_listing.feature` 的刪除情境兜底。

**(c) 為什麼行為情境不能被 golden 取代(情境 5)。**
L1 的表達式 golden 證明 `or is_admin()` 這串文字還在,**不證明它會通電**——
`is_admin()` 是 SECURITY DEFINER 讀 `profiles`,若 EXECUTE 被 revoke 或
`profiles` 的 RLS 出現遞迴,golden 完全看不到。

**刻意不斷言:「B 讀不到 A 的刊登」。** A 有效時 `listings_select_public` 讓任何人
讀得到,那是公開瀏覽設計。寫成斷言會紅,而紅的是測試不是產品。

## 2. 系統設計

不動任何產品碼行為。兩層防線,都掛在**既有** CI job 上:

| 層 | 位置 | 證明什麼 | 頻率 | 邊際成本 |
|---|---|---|---|---|
| L1 結構 | `supabase/functions/api/rls-policies.test.ts`(api-tests 軌) | RLS 旗標、policy 集合、逐條角色、表達式、permissive、欄位集合不變式 | 每個 PR | 0 |
| L2 行為 | `e2e/journey/features/45_listing_rls.feature`(journey 軌) | 真 hosted 上 anon/authenticated/admin 真的被允許或拒絕 | 每週 + 晉升 PR | 0 |

**為什麼是兩層。** L2 是唯一能證明「線上安全」的——本地缺 hosted 的 anon/
authenticated table GRANT,直連在 RLS 被評估**之前**就吃 42501(理由已寫在
`api/listings.test.ts` 檔頭)。但 L2 一週才跑一次。L1 抓得到 policy 被刪、角色被
放寬、條件被改寬、多出第 6 條 permissive、**或整個 RLS 被關掉**——1 個 PR 內就紅。

**L1 只能斷言環境無關的事實。**
`has_table_privilege('anon','public.listings','SELECT')` 本地 false、hosted true,
在 api-tests 軌斷言它等於把錯的環境寫進測試——就是「先 GRANT 再測」那個假綠陷阱
換件衣服。**GRANT 事實若要釘,位置是 L2,不是 L1。** 做法沿用
`name-write-paths.test.ts` 的原則:**直接問 Postgres**,中間不隔 PostgREST。

### 規劃期實測(develop 分支 `ijcxnxhrziehdtkwausy`,唯讀查詢)

L1 golden 值的來源,也是本 feature 前提成立的證據:

| polname | cmd | permissive | roles | USING | WITH CHECK |
|---|---|---|---|---|---|
| `listings_select_own` | SELECT | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | — |
| `listings_insert_own` | INSERT | ✅ | **PUBLIC** | — | `(user_id = auth.uid())` |
| `listings_update_own` | UPDATE | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | `((user_id = auth.uid()) OR is_admin())` |
| `listings_delete_own` | DELETE | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | — |
| `listings_select_public` | SELECT | ✅ | **PUBLIC** | `has_active_subscription(user_id)` | — |

GRANT 現況(**環境相依,不得寫進 L1**):

- `authenticated` 對 `is_admin()` 有 EXECUTE = **true**
  → 情境 4、5、9、10、11 會拿到 RLS 形狀而非 GRANT 形狀,「零 migration 改動」
  前提成立。(`0004:79` 的 `revoke ... from anon, public` 移除的是**隱含**的
  PUBLIC 授權;hosted 的 default privileges 另給了 `authenticated` 一份**明確**
  授權,revoke 動不到它——這也正好解釋 0726 那次為何只有 anon 中招。)
- `anon` 對 `is_admin()` 有 EXECUTE = false
- `anon` 對 `listings` 的 SELECT / INSERT GRANT = **true / true**
  → 情境 8 確實走到 RLS 才被拒。**這也正面印證本 feature 的價值主張:
  GRANT 層對這張表全開,RLS 是唯一的列級授權邊界。**

### ⚠️ 表達式比對用「空白正規化後全文」,不用逐字全等

golden 取自 hosted develop(**PostgreSQL 17.6**),但 L1 跑在 CI 的本地
`supabase start`,而 `supabase/config.toml` **沒有 `[db] major_version`**——
本地大版本不只未經查證,是**未被鎖定**:`ci.yml` 的 `supabase/setup-cli` 版本
(現為 2.109.1)一升,本地 Postgres 大版本可能靜默改變。`pg_get_expr` 是把運算式
樹反編譯回文字,跨大版本的括號化/間距格式可能微幅不同,逐字全等會在一個與 RLS
毫無關係的變更上爆掉。

既有先例(`20260726000001` 的收尾自我驗證)刻意用 `LIKE '%is_admin%'` **子字串**
比對正是為此。但純子字串太弱——抓不到 `user_id = auth.uid() OR true`。

**折衷:空白正規化(collapse 連續空白、去頭尾)後比對全文。** 保住「條件被改寬」
的偵測力,同時吃掉格式差異;**斷言失敗訊息必須帶上 `version()`**,真的漂移時
一眼看得出原因而不是誤以為 policy 被改了。

### L2 的兩種拒絕形狀必須分開斷言(本案最容易寫錯的地方)

- INSERT / UPDATE 違反 WITH CHECK → HTTP 403,body `code: 42501`
- SELECT / UPDATE / DELETE 被 USING 過濾 → **不是錯誤**,HTTP 200/204 + 0 列

所以情境 9、10 是雙段斷言(0 列 + service role 回讀未變)。

### 新素材(兩個模組,刻意分開)

比照 PR #199 剛引入的 `tools/time_shift.py` / `tools/test_time_shift.py` 先例
——把純函式核心從網路模組拆出來、配對測試、零網路 import:

| 檔案 | 內容 | 網路依賴 | 測試檔 |
|---|---|---|---|
| `e2e/journey/tools/rls_probe.py` | **純函式** `classify(status, body)` → `allowed` / `denied_by_rls` / `denied_by_grant` / `filtered_empty` / `unauthenticated` | **零** | `tools/test_rls_probe.py`(1:1 配對,離線軌會跑) |
| `e2e/journey/tools/rest_as_user.py` | 網路 client `RestAsUser`:header 帶 `apikey: <anon_key>` + `Authorization: Bearer <token>`;anon 情境兩者都用 anon key。token 走既有 `SupabaseAdmin.password_grant_token()` | 有 | 無(比照 `supa.py`) |

RLS 違規與 GRANT 拒絕**共用同一個 SQLSTATE(42501)**,只能靠 message 文字辨別
——這正是 `name-write-paths.test.ts` 檔頭說的辨別力問題。`classify()` 是本 feature
唯一能在本機跑紅綠燈的邏輯核心,**必須零網路依賴**,否則離線軌的意義被稀釋、
而且這個模組會被當成後續 11 張表的骨架複製下去。

### 資料與清理

- 刊登以 service role 播種(「資料是種的,行為斷言是真的」);失效狀態用既有
  `tools/seed_time_machine.py` 的 `capture_dates` / `enter_expired` /
  `restore_dates`,比照 `f60_time_scenarios_steps.py` 的參數化先例
- admin 帳號用既有 `builders/admin_bootstrap.py` 的 `ensure_admin`
- 清理無新增工作:`cleanup.py` 的 `RESIDUE_TABLES` 已含 `("listings","user_id")`,
  且 `listings.user_id` 對 `profiles` 是 `on delete cascade`

### 節點配置

owner = **B5**、attacker = **B6**、失效 owner = **B7**。
⚠️ **節點名是 `run_state` 的全域鍵(email 由它推導),不得與任何 feature 的演員
撞名**——`orgchart-saga.yaml` 檔頭記著這條的代價:`X1` 曾被
`15_registration_negative` 的臨時帳號佔用,full 全套實測撞出「email 已存在」
(run 31158578254),才改名 Y1。

**v3 重新查證(develop 前進後)**:`"B5"` / `"B6"` / `"B7"` 在整個
`e2e/journey/` 底下**零匹配**,仍然可用。`70_renewal_saga.feature` 用的是自帶的
獨立 cast(`orgchart-saga.yaml`:P0/U1/U2/K0/W1/W2/Y1),與 30 人主樹零交集。
`40_listing.feature` 的最後一個情境仍會刪掉 A0 的刊登,所以 45 不依賴 A0 的資料。

## 3. 架構影響

- 不動 `src/**` 的行為、不動 `supabase/functions/api/index.ts`、不動任何 migration
- 新 marker `rls` 要登記進 `e2e/journey/pytest.ini`(`--strict-markers`,沒登記
  就是 collection error)。現有 marker:`journey` `skeleton` `orgbuild` `rewards`
  `tasks` `listing` `withdrawal` `timemachine` `renewal_saga` `negative`
- **情境標籤:`@journey @listing @rls`(疊加)**。`pytest -m listing` 的語意是
  「所有跟刊登有關的驗證」,漏掉 RLS 會給出偏安全的假象;`40_listing.feature`
  的 `@journey @listing @negative` 與 `50_withdrawal.feature` 都有疊加先例。
- 情境數 **38 → 49**(讀取 5 + 寫入 6)。**`MIN_FULL=20` 不動**:這個下限的用途是
  抓「整批 skip/deselect 的空跑」(2026-07-21 那兩次 0.2 秒全綠),不是抓
  「少跑幾個」;20 對 49 個情境仍抓得到災難性空跑。

### 為什麼不開新的 CI 軌

一場 journey 的成本大頭是**拋棄式分支的建立、migration replay 與函式部署**
(≈10-15 分),不是情境本身。切一條只跑 RLS 情境的軌,每次仍要付那 10-15 分:
每日跑 = 300-450 計費分/月,比整個 journey 現行預算(週跑 130-390 分/月)還貴,
而它保護的是一組**只有在有人改 migration 時才會變**的規則。正確的槓桿是改變
**偵測方式**而非提高頻率——L1 就是那個槓桿。符合 `github-actions.md` 規則 8a。

### ⚠️ 合併前必須手動觸發一次 journey(且 `pytest_expr` 不是捷徑)

`ci.yml` 的 `journey-full` **只在 `github.base_ref == 'main'` 觸發**,
`journey-scheduled.yml` 每週跑一次且獨立於任何 PR。所以
`feature/rls-listings-policies → develop` 這條 PR **完全不會跑真後端 journey**,
合併當下 L2 的行為真值是零驗證,最快等下次週排程(最長 6 天),而排程失敗只開
triage issue、不會回頭擋已合併的 PR。

**做法**:階段 4 完成、PR 定稿前,對該分支手動 `workflow_dispatch` 一次
`journey-scheduled.yml`,**`scope=full`**,拿到真實紅綠證據再合併。

⚠️ **不要用 PR #199 新增的 `pytest_expr` 窄選當捷徑。** 看起來 `pytest_expr: rls`
只跑 11 條很便宜,但 RLS 情境的 Background 是 `組織樹已建置完成`,而建樹是
`10_org_build`(marker `orgbuild`)——窄選會把它 deselect,Background 直接
`pytest.skip`,11 條全 skip。`MIN_FILTERED=1` 會把這種空跑判成硬失敗(守衛是
對的),但你付了分支建立的錢卻什麼都沒驗到。而**建樹正是那 30-90 分的成本大頭**,
窄選省不到它。`skeleton` 同理(只跑 `@skeleton`,不含 listing)。

### 後續 11 張表的補齊順序

第一輪的真正產出是**測試骨架**(`RestAsUser`、`classify()`、L1 的 pg_policy
斷言模式),`listings` 是最適合的載體:現成的 journey 情境與 per-user 登入狀態,
讀寫兩種邊界都有。骨架建好後**改按曝險等級排序**,而不是按「有沒有前端直連
呼叫點」——攻擊面不受前端目前是否呼叫該表限制(anon key 隨 bundle 出貨)。
依此,下一輪應是 `profiles`(`national_id`/`bank_account`,只有 self-only policy)
與 `withdrawals`(INSERT 的 WITH CHECK 內嵌業務規則:僅允許 `status='pending'`)。

## 4. UI/UX

不適用——不新增或修改任何使用者可見介面。(審查已查證:
`EditServiceProvider.tsx:68-72` 的 ownership 檢查在 `setServiceProvider` 之前
redirect,不存在他人資料閃現;`/service-providers` 路由無 `:id` 參數,刪除路徑的
`listing.id` 一律來自 `useUserListing()` 的自我限定查詢,跨使用者情境在 UI 上
不可觸發。兩處「0 列即假成功」的既有瑕疵見 §1「不做」與 §9。)

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | L1 結構守衛 | `supabase/functions/api/rls-policies.test.ts`(Deno,需 DB) | 見下方逐條 |
| 2 | `classify()` 純函式 | `e2e/journey/tools/test_rls_probe.py` | `cd e2e/journey && pytest tools/ -q` 綠;5 種形狀分類正確 |
| 3 | L2 讀取邊界(驗收 1–5) | `e2e/journey/features/45_listing_rls.feature` + `steps/f45_listing_rls_steps.py` | `--collect-only` 列出 5 個新情境且步驟齊全;行為真值在 CI |
| 4 | L2 寫入邊界(驗收 6–11) | 同上 | 收集到 6 個新情境;行為真值在 CI |

### 階段 1 的驗證標準(逐條;概括說法會自相矛盾)

「刪掉任一條或改成 `to public` 即紅」這種概括**自相矛盾**——`listings_insert_own`
現況本來就是 PUBLIC,`listings_select_public` 依設計必須對 anon 開放。逐條列:

1. **`pg_class.relrowsecurity` 為 true** —— RLS 本身仍對 `listings` 生效。
   ⚠️ **這條不可省**:`ALTER TABLE ... DISABLE ROW LEVEL SECURITY` **不會刪除
   任何一條 policy**,下面 2–5 全部照樣通過,但 RLS 完全不生效;而 anon/
   authenticated 對 `listings` 的 table GRANT 是全開的(§2 實測),等於任何人
   讀寫任意會員的刊登。這是本 feature 要防的那類迴歸的**最極端版本**。
   比照 `withdrawals.test.ts:548-558` 的現成模式。
2. `public.listings` 上的 policy 集合**恰好**是那 5 條(多一條 permissive 也要紅)
3. 逐條角色範圍:`select_own`/`update_own`/`delete_own` = `authenticated`;
   `insert_own`/`select_public` = PUBLIC
4. 逐條 USING / WITH CHECK **經空白正規化後**與 §2 表格的 golden 相符
   (理由與失敗訊息要求見 §2 的專節)
5. 全部 5 條都是 permissive(`polpermissive = true`)
6. **`listings` 欄位集合 = `public_listings` 欄位集合** —— 用 `EXCEPT`(雙向)
   或排序後陣列比對,**必須是集合語意**;查詢顯式加 `table_schema = 'public'`。
   ⚠️ 不要用 `ordinal_position` 逐列對應——日後重排 view 的 select list
   (不增減欄位、無安全意涵的重構)就會假紅。
   這條防的是「加欄位卻忘了同步 view 白名單,讓 `listings_select_public` 把新欄位
   直接曝光給 anon」;既有的 `listings.test.ts:228` 白名單測試只護得住 view。

**同 commit 的 housekeeping(非驗證標準,沒有紅綠訊號)**:訂正
`api/listings.test.ts:219` 那句過時的「public_listings 是唯一對 anon 開放 select
的資料表面」,並在新測試檔頭寫清楚 0004 之後的正確語意。

> **刻意不動 `20260620000002` 的檔頭註解**(它同樣過時)。依據是
> **`supabase/README.md:113`:「不要編輯已套用的 migration。修正一律新增一個
> migration」**——這是既有明文規則。次要理由:`journey.yml` 檔頭寫明分支 schema
> 是 replay 母專案 `schema_migrations` **存下來的語句**、不是 git 檔案,
> 2026-07-26 連紅 12 晚的根因正是這種漂移。正確語意寫在新測試檔頭。

### ⚠️ 階段 3、4 沒有本機紅綠燈

journey 絕不在本機跑(hook 會擋),這兩階段本機只驗證得了「情境被收集到、
步驟不缺」。能在本機跑紅綠燈的邏輯已經在階段 2 抽出來了。`test(red)` 證據取
`--collect-only`,PR 描述要寫明;行為真值靠 §3 的手動 `workflow_dispatch`。

## 6. 已裁決事項

1. **L1 釘條件表達式** —— 採用,但用**空白正規化後全文**而非逐字全等(§2)。
2. **`listings_insert_own` 維持 PUBLIC,不收斂** —— L1 釘成 characterization。
   它不呼叫 `is_admin()`,沒有 0726 那個症狀;anon 的 `auth.uid()` 為 null,
   比不中 with check,本來就過不了。收斂是純衛生,**另開單**。
3. **停權維度不做** —— 見 §0(三段組合推論)。
4. **`MIN_FULL` 不動** —— 見 §3。
5. **`classify()` 與 `RestAsUser` 拆成兩個模組** —— 見 §2,照 `time_shift.py` 先例。
6. **admin 繞過只補讀取(情境 5),改/刪不補** —— 覆蓋不對稱的揭露見 §7。

## 7. 開放問題

- [ ] **`or is_admin()` 在 `listings` 上未被前端使用,是否該移除?**
      掃過全部前端 `.from('listings')` / `.from('public_listings')` 呼叫點
      (`useUserListing` `HomePage` `EditServiceProvider` `ServiceProviderManagement`
      `ServiceProviderDetail` `CreateServiceProvider`),**沒有任何 admin 路徑走
      PostgREST**——admin 後台一律走 Edge Function 的 service_role(本來就繞過
      RLS);規格書 §13 的管理後台模組清單也沒有「刊登管理」。
      ⚠️ **措辭是「未被前端使用」而不是「死碼」**:任何持有 admin session token
      的人(配上隨 bundle 出貨的 anon key)都能繞過前端直打 PostgREST 命中它,
      這是**可直接觸達的即時授權能力**。另開單時查證範圍要涵蓋這一點,
      不要只掃前端呼叫點就結論「可安全刪除」。
      **本輪不動**(要動 migration),驗收情境 5 仍要做——在它被移除之前,
      它是 policy 明文宣告的授權語意。
- [ ] **覆蓋不對稱的揭露**:`or is_admin()` 同時在 `select_own`/`update_own`/
      `delete_own` 三條,§1 事實 (c) 的論證對三條同樣成立,但目前**只有 select
      補了 L2 行為情境**;`update_own`/`delete_own` 的 admin 繞過**只有 L1
      結構層級保護,行為層級未驗證**。這是裁決 6 的已知取捨,寫在這裡避免被誤讀
      成「情境 5 已把 `or is_admin()` 處理完了」。
      有利機制:L1 釘死 USING 形成天然耦合——未來真的移除 `or is_admin()` 時
      L1 會立刻變紅,逼實作者同時處理 golden 與情境 5,不會出現「migration 改了、
      測試沒人記得改」。

## 8. 風險與回滾

- **純加法**:兩個新測試檔 + 一個 feature + 一個 steps 模組 + 兩個 tools 模組 +
  pytest.ini 一行 marker + 既有測試一處註解訂正 + §9 的兩處程式碼註解。
  零行為改動,回滾 = revert PR。
- **最壞情況是測試本身假綠**:例如把「被 USING 過濾」誤當成「被拒絕」而只斷言
  HTTP 狀態。防線有三道:情境 9、10 的雙段斷言、情境 6 提供的區辨力另一半
  (§1 事實 (b))、階段 2 把分類邏輯抽成有離線測試的純函式。
- **情境互相污染**:B5/B6/B7 的播種刊登殘留會讓後續 `user_id` unique 撞車。
  已被既有機制覆蓋——每場 journey 都是全新拋棄式分支,cleanup 的零殘留斷言已含
  `listings`;B7 的失效狀態用 capture/restore 還原。節點撞名風險見 §2。
- **⚠️ 這套把關看不到「migration 之外的手動 dashboard 改動」。** L1 只碰 CI 的
  local DB,L2 只碰拋棄式分支,兩者都不碰 production。若有人直接在正式站
  dashboard 動 `listings` 的 policy,這套機械把關完全無感——而那正是 0726 那次
  事故的根因類型(`is_admin()` 的 anon grant 當年就是被手動下在正式站、不在
  任何 migration 裡)。GitOps 的通用限制,要知道邊界在哪。
- **不會發生的風險**:不觸及正式站資料或金流。journey 只打拋棄式分支
  (conftest 對正式 ref 直接 `pytest.exit`)。

## 9. 知識的持久歸宿(規劃檔刪除前必須完成)

`docs/plans/` 是鷹架,依 CLAUDE.md 會在 PR 前刪除。以下內容**刪掉就沒了**,
`/tdd-implement` 收尾時要先升級再刪:

| 內容 | 落點 | 形式 |
|---|---|---|
| 兩處「0 列即假成功」為何安全(§1 表格) | `ServiceProviderManagement.tsx:56` 與 `EditServiceProvider.tsx:266` 該行上方 | **最小事實註解**,依 `document-writing.md` 的殘跡例外條款 |
| 後續 11 張表按曝險排序的路線圖(§3) | `docs/e2e-journey-test-design.md` | 新增小節 |
| 「L1 只能斷言環境無關事實」原則 + `pg_policy`/`pg_get_expr` golden 手法與正規化理由(§2) | `docs/e2e-journey-test-design.md` | 同上 |
| GRANT 現況表與它對 0726 事故成因的解釋(§2) | `supabase/README.md` 既有事故記錄段落 | 併入 |

**註解建議措辭**(兩處對稱,擇一改寫):

> 0 列不是 error——被 RLS 的 USING 過濾掉時 PostgREST 回 200/204 而非 403,
> 所以這裡的成功訊息在「沒刪到任何列」時也會顯示。目前安全,因為 `listing.id`
> 恆為 `useUserListing()` 自我限定查詢的結果;**若未來改成接受外部傳入的 id,
> 必須重新檢查這個假設**。

⚠️ **這一節的程式碼註解不在規劃階段做**——`/plan-feature` 明令規劃階段不寫任何
產品程式碼,`src/**` 的寫入要等 `/tdd-implement` 開工後。本節是交辦,不是已完成。
