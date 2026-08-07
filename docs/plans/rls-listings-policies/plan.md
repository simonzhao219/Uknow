# listings RLS policy 行為驗證 規劃書

> **v2(2026-08-07)** —— 依 `./review.md` 的四視角審查(P0=0、P1=5、P2=9)與人裁決
> 修訂。主要變動:新增 admin 繞過與擁有者 update 兩條正面情境、L1 擴充為
> 「集合 + 逐條角色 + 表達式 golden + 欄位集合比對」、§6 開放問題全數裁決完畢。

## 0. 一句話

讓 `listings` 的 5 條 RLS policy 有機械把關,因為前端直連 PostgREST 的讀寫
路徑上 RLS 是**唯一**的授權機制,而它目前零測試。

> 停權(suspended)分支不在本輪的新增涵蓋範圍內——`listings_select_public`
> 呼叫的 `has_active_subscription()` 與 `public_listings` view 是同一個函式,
> 其停權分支已由 `api/listings.test.ts:199`(`public_listings：停權後該會員的
> 刊登消失`)涵蓋。本輪不在 raw table 路徑重測同一個函式回傳值。

## 1. 使用者需求

- 規格書:§2.2(瀏覽/讀取走前端直連、RLS 保護)、§11 刊登系統(1:1、可見性由
  `has_active_subscription` 決定)、§5.1(失效即隱藏)、§5.3(守衛順序三處對齊)
- 這不是使用者可見功能,是**既有行為的防線回填**——驗收情境就是下面的斷言清單

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
select 的資料表面」**都已是與 0004 之後行為不一致的過時說法**。處理見 §5 階段 1
(只改測試檔;刻意不動已套用的 migration 檔頭,理由見該處)。

### 「刊登隱藏」的語意

§2.1 與 §5 表格寫「會籍失效 → 刊登隱藏」,指的是**公開可見度**,不是擁有者
自身的讀取權。`listings_select_own` 本就不含 active 條件,
`src/hooks/useUserListing.ts` 也有對應設計註解(刊登刻意沒有活躍/過期狀態欄位,
是否對外顯示完全由帳號訂閱決定)。驗收情境 1 依據的是這個解讀,明確排除
「失效即完全不可見」那一種讀法。

### 不做

- 其餘 11 張表的 policy —— 見 §3「補齊順序」
- 停權維度 —— 見 §0
- `public_listings` view 的可見性 —— `api/listings.test.ts` (B) 已涵蓋,不重複
- 任何產品碼與 migration 改動
- **`ServiceProviderManagement.tsx:56-59` 在 0 列刪除時仍顯示「刊登已成功刪除」**
  (因為被 USING 過濾不是 error)。這是既有行為,UI 導覽下不可觸發(`listing.id`
  一律來自 `useUserListing()` 的 `.eq('user_id', userId)` 自我限定查詢),
  落在本規劃「零產品碼改動」範圍外。**寫在這裡是為了讓實作者不要順手去修它。**

### 驗收情境

**讀取邊界(5 條)**

1. 失效會員仍讀得到自己的刊登 —— 只有 `listings_select_own` 能讓它成立
   (`select_public` 對失效者為 false),這條把 own 與 public 分離開來
2. 訪客(anon)直打 `/rest/v1/listings` 讀得到**有效**會員的刊登(`select_public` 生效)
3. 訪客直打 `/rest/v1/listings` 讀不到**失效**會員的刊登(gate 真的擋)
4. 另一位登入會員讀不到失效會員的刊登(跨使用者的實際邊界所在)
5. **管理員讀得到失效會員的刊登** —— `select_own` 的 `or is_admin()` 分支
   (見下方「為什麼行為情境不能被 golden string 取代」)

**寫入邊界(6 條)**

6. **擁有者 PATCH 自己的刊登 → 1 列受影響且欄位確實變更** ——
   `listings_update_own` 的 USING 正面路徑
7. B 以 `user_id = A` insert → 403 + `code: 42501`,且訊息是 RLS 形狀
   (`new row violates row-level security policy`)而非 GRANT 形狀
8. anon insert `user_id = A` → 同上被拒,且無列產生
9. B PATCH A 的刊登 → **影響 0 列**,且以 service role 回讀確認 A 的資料未變
10. B DELETE A 的刊登 → **影響 0 列**,且該列仍存在
11. A 把自己刊登的 `user_id` 改成 B → 42501 ——`listings_update_own` 的
    WITH CHECK;只有 USING 擋不住「把擁有權送出去」

### 三件關於斷言強度的事實(不要在實作時弄丟)

**(a) 情境 7、8 保護的是「條件被放寬」,不是「policy 被刪除」。**
RLS 對缺少任何 permissive policy 的 INSERT 一律 default-deny,錯誤訊息文字與
WITH CHECK 失敗時**完全相同**。「`listings_insert_own` 被整條刪掉」這件事由
既有 `40_listing.feature` 的「A0 透過 GUI 建立刊登」正面情境兜底。

**(b) 情境 9 的區辨力來自情境 6,不是它自己。**
「B PATCH A → 0 列」在 policy 正確與 policy 整條被刪兩種情況下觀察結果相同
(default-deny 與 USING 過濾的回應形狀一致)。是情境 6(擁有者 PATCH 成功)
補上了另一半:兩條一起看才能區分「policy 在且正確」與「policy 不見了」。
delete 同理,由 `40_listing.feature` 的「A0 刪除自己的刊登」兜底。

**(c) 為什麼行為情境不能被 golden string 取代(情境 5)。**
L1 的表達式 golden 證明 `or is_admin()` 這串文字還在,**不證明它會通電**——
`is_admin()` 是 SECURITY DEFINER 讀 `profiles`,若 EXECUTE 被 revoke 或
`profiles` 的 RLS 出現遞迴,golden string 完全看不到。

**刻意不斷言:「B 讀不到 A 的刊登」。** A 有效時 `listings_select_public` 讓任何人
(含 anon)讀得到,那是公開瀏覽設計(依據見上方「授權依據」段)。寫成斷言會紅,
而紅的是測試不是產品。

## 2. 系統設計

不動任何產品碼。兩層防線,都掛在**既有** CI job 上:

| 層 | 位置 | 證明什麼 | 頻率 | 邊際成本 |
|---|---|---|---|---|
| L1 結構 | `supabase/functions/api/rls-policies.test.ts`(api-tests 軌) | policy 集合恰好 5 條、逐條角色、USING/WITH CHECK 表達式、欄位集合不變式 | 每個 PR | 0 |
| L2 行為 | `e2e/journey/features/45_listing_rls.feature`(journey 軌) | 真 hosted 上 anon/authenticated/admin 真的被允許或拒絕 | 每週 + 晉升 PR | 0 |

**為什麼是兩層。** L2 是唯一能證明「線上安全」的——本地缺 hosted 的 anon/
authenticated table GRANT,直連在 RLS 被評估**之前**就吃 42501(理由已寫在
`api/listings.test.ts` 檔頭)。但 L2 一週才跑一次。L1 證明不了 policy「寫得對」,
卻抓得到 policy **被刪掉、角色被放寬、條件被改寬、或多出第 6 條 permissive**
——那才是實際會發生的迴歸,而且 1 個 PR 內就紅。

**L1 只能斷言環境無關的事實。**
`has_table_privilege('anon','public.listings','SELECT')` 本地 false、hosted true
(規劃期實測,見下),在 api-tests 軌斷言它等於把錯的環境寫進測試——就是
「先 GRANT 再測」那個假綠陷阱換件衣服。**GRANT 事實若要釘,位置是 L2,不是 L1。**
policy 的存在、角色、表達式、欄位集合全部來自 migration,每個環境相同,那才是
這層該釘的。做法沿用 `name-write-paths.test.ts` 的原則:**直接問 Postgres**
(`pg_policy` join `pg_class`),中間不隔 PostgREST。

### 規劃期實測(develop 分支 `ijcxnxhrziehdtkwausy`,唯讀查詢)

develop 與 journey 的拋棄式分支同為「從 migration 乾淨重播」的 hosted 環境,
以下是 L1 golden 值的來源,也是本 feature 前提成立的證據:

| polname | cmd | permissive | roles | USING | WITH CHECK |
|---|---|---|---|---|---|
| `listings_select_own` | SELECT | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | — |
| `listings_insert_own` | INSERT | ✅ | **PUBLIC** | — | `(user_id = auth.uid())` |
| `listings_update_own` | UPDATE | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | `((user_id = auth.uid()) OR is_admin())` |
| `listings_delete_own` | DELETE | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | — |
| `listings_select_public` | SELECT | ✅ | **PUBLIC** | `has_active_subscription(user_id)` | — |

GRANT 現況(**環境相依,不得寫進 L1**):

- `authenticated` 對 `is_admin()` 有 EXECUTE = **true**
  → 情境 4、5、9、10、11 會拿到 RLS 形狀而非 GRANT 形狀,「零 migration 改動」前提成立。
  (`0004:79` 的 `revoke ... from anon, public` 移除的是**隱含**的 PUBLIC 授權;
  hosted 的 default privileges 另給了 `authenticated` 一份**明確**授權,revoke
  動不到它——這也正好解釋 0726 那次為何只有 anon 中招。)
- `anon` 對 `is_admin()` 有 EXECUTE = false(符合 0004 + 0726 的設計)
- `anon` 對 `listings` 的 SELECT / INSERT GRANT = **true / true**
  → 情境 8 確實走到 RLS 才被拒,可以釘 RLS 形狀。**這也正面印證本 feature 的
  價值主張:GRANT 層對這張表全開,RLS 是唯一的列級授權邊界。**

### L2 的兩種拒絕形狀必須分開斷言(本案最容易寫錯的地方)

- INSERT / UPDATE 違反 WITH CHECK → HTTP 403,body `code: 42501`
- SELECT / UPDATE / DELETE 被 USING 過濾 → **不是錯誤**,HTTP 200/204 + 0 列

所以情境 9、10 是雙段斷言(0 列 + service role 回讀未變)。只斷言「請求成功」
或只斷言 HTTP 狀態,policy 全開時也照樣過。

### 新素材

- `e2e/journey/tools/rls_probe.py` —— 內含
  - `RestAsUser`:per-user PostgREST client。header 帶 `apikey: <anon_key>` +
    `Authorization: Bearer <使用者 access token>`;anon 情境兩者都用 anon key。
    token 走既有 `SupabaseAdmin.password_grant_token()`,不動 GUI。
  - **純函式** `classify(status, body)` → `allowed` / `denied_by_rls` /
    `denied_by_grant` / `filtered_empty` / `unauthenticated`。RLS 違規與 GRANT
    拒絕**共用同一個 SQLSTATE(42501)**,只能靠 message 文字辨別——這正是
    `name-write-paths.test.ts` 檔頭說的辨別力問題。這是本 feature 唯一能在本機
    跑紅綠燈的邏輯核心。
- `e2e/journey/tools/test_rls_probe.py` —— 只測 `classify()`(離線純函式)。
  檔名與來源模組成對,比照 `twid.py`/`test_twid.py` 等既有四組 1:1 慣例。

### 資料與清理

- 刊登以 service role 播種(「資料是種的,行為斷言是真的」——與時光機同原則);
  失效狀態用既有 `tools/seed_time_machine.py` 的 `capture_dates` /
  `enter_expired` / `restore_dates`,比照 60 對 A0 的做法
- admin 帳號用既有 `builders/admin_bootstrap.py` 的 `ensure_admin`
- 清理無新增工作:`cleanup.py` 的 `RESIDUE_TABLES` 已含 `("listings","user_id")`,
  且 `listings.user_id` 對 `profiles` 是 `on delete cascade`

### 節點配置

`listings.user_id` 是 UNIQUE,撞了會壞別人的情境。owner = **B5**、
attacker = **B6**、失效 owner = **B7**。現況佔用:A0(00/10/20/30/40/50/60)、
B1·C1(50)、D8·E1(20)、B2·B4·C4·C5·C7·C8·D4(60)。
40 的最後一個情境會**刪掉 A0 的刊登**,所以 45 不能靠 A0 的既有資料。

## 3. 架構影響

- 不動 `src/**`、不動 `supabase/functions/api/index.ts`、不動任何 migration
- 新 marker `rls` 必須登記進 `e2e/journey/pytest.ini`——`--strict-markers` 下
  沒登記就是 collection error
- **情境標籤:`@journey @listing @rls`(疊加)**。`pytest -m listing` 的語意是
  「所有跟刊登有關的驗證」,漏掉 RLS 會讓那個選擇器給出偏安全的假象;
  `50_withdrawal.feature` 已有 `@withdrawal @negative` 疊加先例。
- 情境數 28 → **39**(讀取 5 + 寫入 6)。**`MIN_FULL=20` 不動**:這個下限的用途是
  抓「整批 skip/deselect 的空跑」(2026-07-21 那兩次 0.2 秒全綠),不是抓
  「少跑幾個」;20 對 39 個情境仍抓得到災難性空跑,而抬成精確值會讓每次加情境
  都得改一個數字(skeleton scope 還走另一個下限),摩擦大於收益。

### 為什麼不開新的 CI 軌

一場 journey 的成本大頭是**拋棄式分支的建立、migration replay 與函式部署**
(≈10-15 分),不是情境本身。切一條只跑 RLS 情境的軌,每次仍要付那 10-15 分:
每日跑 = 300-450 計費分/月,比現在整個 journey 預算(週跑 130-390 分/月)還貴,
而它保護的是一組**只有在有人改 migration 時才會變**的規則。

正確的槓桿是改變**偵測方式**而不是提高頻率——L1 就是那個槓桿:掛在既有
api-tests 軌上,每個 PR 都跑,邊際成本 0,對「policy 被刪/被放寬」有 1 個 PR
的偵測延遲。符合 `.claude/rules/github-actions.md` 規則 8a。

### ⚠️ 合併前必須手動觸發一次 journey

`ci.yml` 的 `journey-full` **只在 `github.base_ref == 'main'` 觸發**,
`journey-scheduled.yml` 每週跑一次且獨立於任何 PR。也就是說
`feature/rls-listings-policies → develop` 這條 PR **完全不會跑真後端 journey**,
合併當下 L2 的行為真值是零驗證,最快要等下次週排程(最長 6 天),而排程失敗
只開 triage issue、不會回頭擋已合併的 PR。

**做法**:階段 4 完成、PR 定稿前,對該分支手動 `workflow_dispatch` 一次
`journey-scheduled.yml`(**scope=full**;skeleton 只跑 `@skeleton`,不含 listing
情境,拿不到本 feature 的訊號),拿到真實紅綠證據再合併。這是一次性的
30-90 計費分,對照「合併一組宣稱在守授權邊界、卻從未被執行過的測試」,值得。

### 後續 11 張表的補齊順序

第一輪的真正產出是**測試骨架**(`RestAsUser`、`classify()`、L1 的 pg_policy
斷言模式),`listings` 是最適合的載體:現成的 journey 情境與 per-user 登入狀態,
讀寫兩種邊界都有。骨架建好後,後續**改按曝險等級排序**,而不是按「有沒有前端
直連呼叫點」——攻擊面不受前端目前是否呼叫該表限制(anon key 隨 bundle 出貨)。
依此,下一輪應是 `profiles`(`national_id`/`bank_account`,只有 self-only policy)
與 `withdrawals`(INSERT 的 WITH CHECK 內嵌業務規則:僅允許 `status='pending'`)。

## 4. UI/UX

不適用——不新增或修改任何使用者可見介面。(審查已查證:
`EditServiceProvider.tsx:68-72` 的 ownership 檢查在 `setServiceProvider` 之前
redirect,不存在他人資料閃現;刪除路徑的 `listing.id` 一律來自
`useUserListing()` 的自我限定查詢,跨使用者情境在 UI 上不可觸發。)

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | L1 結構守衛 | `supabase/functions/api/rls-policies.test.ts`(Deno,需 DB) | 見下方逐條 |
| 2 | `classify()` 純函式 | `e2e/journey/tools/test_rls_probe.py` | `cd e2e/journey && pytest tools/ -q` 綠;5 種形狀分類正確 |
| 3 | L2 讀取邊界(驗收 1–5) | `e2e/journey/features/45_listing_rls.feature` + `steps/f45_listing_rls_steps.py` | `pytest --collect-only -q` 列出 5 個新情境且步驟定義齊全;行為真值在 CI |
| 4 | L2 寫入邊界(驗收 6–11) | 同上 | 收集到 6 個新情境;行為真值在 CI |

### 階段 1 的驗證標準(逐條,不用一句話概括)

「刪掉任一條或改成 `to public` 即紅」這種概括會**自相矛盾**——`listings_insert_own`
現況本來就是 PUBLIC(見下方裁決 2),`listings_select_public` 依設計必須對 anon
開放。所以逐條列:

1. `public.listings` 上的 policy 集合**恰好**是那 5 條(多一條 permissive 也要紅)
2. 逐條角色範圍:`select_own` / `update_own` / `delete_own` = `authenticated`;
   `insert_own` / `select_public` = PUBLIC
3. 逐條 `pg_get_expr` 的 USING 與 WITH CHECK 與 §2 表格的 golden 值逐字相符
4. 全部 5 條都是 permissive(`polpermissive = true`)
5. **`listings` 的欄位集合 = `public_listings` 的欄位集合** —— 不變式,防止
   日後有人加欄位卻忘了同步 view 白名單,讓 `listings_select_public` 把新欄位
   直接曝光給 anon(既有的 `listings.test.ts:228` 白名單測試只護得住 view)
6. 順手改掉 `api/listings.test.ts:219` 那句過時的「public_listings 是唯一對 anon
   開放 select 的資料表面」,並在新測試檔頭寫清楚 0004 之後的正確語意

> **刻意不動 `20260620000002` 的檔頭註解**(它同樣過時)。`journey.yml` 檔頭寫明
> 分支 schema 是 replay 母專案 `schema_migrations` **存下來的語句**、不是 git 檔案,
> 2026-07-26 連紅 12 晚的根因正是這種 git/stored 漂移。註解改動行為上是惰性的
> (0002 已在所有環境的歷史裡,永遠不會再從 git 執行),但不值得在一個
> 「零產品碼改動」的 PR 裡替那條界線開例外。正確語意寫在新測試檔頭——那是
> 未來讀 RLS 意圖的人真正會去的地方。

### ⚠️ 階段 3、4 沒有本機紅綠燈

journey 絕不在本機跑(hook 會擋),這兩階段本機只驗證得了「情境被收集到、
步驟不缺」。這是這個 feature 的體質,不是能繞過的東西——能在本機跑紅綠燈的
邏輯已經在階段 2 抽出來了。`test(red)` 證據取 `--collect-only`,PR 描述要寫明;
行為真值靠 §3 的手動 `workflow_dispatch`。

## 6. 已裁決事項(原開放問題)

1. **L1 釘條件表達式全文** —— 採用。golden 值已從 develop 實測取得(§2 表格),
   寫起來是免費的;這批表達式五年來只在 0002/0004/0726 動過三次,每次都值得人
   回頭看一眼。不採「語意子句比對」:那擋不住 `user_id = auth.uid()` 被改成 `true`。
2. **`listings_insert_own` 維持 PUBLIC,不收斂** —— L1 把現況釘成 characterization。
   它不呼叫 `is_admin()`,沒有 0726 那個症狀;行為上 anon 的 `auth.uid()` 為 null,
   比不中 with check,本來就過不了。收斂是純衛生,**另開單**——動 migration 會讓
   這個 PR 從「只加測試」變成需要 migration-guard 與真後端驗證,成本結構整個變掉。
3. **停權維度不做** —— 見 §0(已由 `listings.test.ts:199` 經同一個函式涵蓋)。
4. **`MIN_FULL` 不動** —— 見 §3。

## 7. 開放問題

- [ ] **`listings` 三條 own policy 的 `or is_admin()` 可能是死碼。** 掃過全部前端
      `.from('listings')` / `.from('public_listings')` 呼叫點(`CreateServiceProvider`
      `EditServiceProvider` `ServiceProviderManagement` `HomePage`
      `ServiceProviderDetail`),**沒有任何 admin 路徑走 PostgREST**——admin 後台
      一律走 Edge Function 的 service_role(本來就繞過 RLS)。若確認無真實使用者,
      這三處 `or is_admin()` 是可以移除的攻擊面。**本輪不動**(要動 migration),
      但值得另開單確認。註:驗收情境 5 仍要做——在它被移除之前,它是 policy
      明文宣告的授權語意,沒被涵蓋就是缺口。

## 8. 風險與回滾

- **純加法**:兩個新測試檔 + 一個 feature + 一個 steps 模組 + 一個 tools 模組 +
  pytest.ini 一行 marker + 一處既有測試註解訂正。零產品碼改動,回滾 = revert PR。
- **最壞情況是測試本身假綠**:例如把「被 USING 過濾」誤當成「被拒絕」而只斷言
  HTTP 狀態——policy 全開時也會過。防線有三道:情境 9、10 的雙段斷言、
  情境 6 提供的區辨力另一半(§1 事實 (b))、以及階段 2 把分類邏輯抽成有離線
  測試的純函式。
- **情境互相污染**:B5/B6/B7 的播種刊登殘留會讓後續 `user_id` unique 撞車。
  已被既有機制覆蓋——每場 journey 都是全新拋棄式分支,cleanup 的零殘留斷言已含
  `listings`;B7 的失效狀態用 capture/restore 還原。
- **⚠️ 這套把關看不到「migration 之外的手動 dashboard 改動」。** L1 只碰 CI 的
  local DB,L2 只碰拋棄式分支,兩者都不碰 production。若有人直接在正式站
  dashboard 動 `listings` 的 policy,這套機械把關完全無感——而那正是 0726 那次
  事故的根因類型(`is_admin()` 的 anon grant 當年就是被手動下在正式站、不在
  任何 migration 裡)。這是 GitOps 的通用限制,不是本規劃獨有的漏洞,但要知道
  它的邊界在哪。
- **不會發生的風險**:本規劃不觸及正式站資料或金流。journey 只打拋棄式分支
  (conftest 對正式 ref 直接 `pytest.exit`)。
