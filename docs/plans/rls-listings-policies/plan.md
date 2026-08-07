# listings RLS policy 行為驗證 規劃書

## 0. 一句話

讓 `listings` 的 5 條 RLS policy 有機械把關,因為前端直連 PostgREST 的讀寫
路徑上 RLS 是**唯一**的授權機制,而它目前零測試。

## 1. 使用者需求

- 規格書:§2.2(瀏覽/讀取走前端直連、RLS 保護)、§11 刊登系統(1:1、可見性由
  `has_active_subscription` 決定)、§5.1(失效即隱藏)、§5.3(守衛順序三處對齊)
- 這不是使用者可見功能,是**既有行為的防線回填**——驗收情境就是下面的斷言清單
- 現況佐證(非推測):`sb()`(`api/index.ts:165`)一律 SERVICE_ROLE,api-tests 碰不到
  policy;前端直連 `listings` 的四處是 `CreateServiceProvider.tsx:69,237`、
  `EditServiceProvider.tsx:61,254`、`ServiceProviderManagement.tsx:51`(delete);
  anon key 隨 bundle 出貨(`src/utils/supabase/info.tsx`)
- **不做**:其餘 11 張表的 policy(骨架建好後逐步補)、停權(suspended)維度
  (journey 無停權 builder,見開放問題)、`public_listings` view 可見性
  (`api/listings.test.ts` (B) 已涵蓋,不重複)、任何產品碼與 migration 改動

### 驗收情境(每一條在對應 policy 被拿掉時必須變紅)

**讀取邊界**

1. 失效會員仍讀得到自己的刊登 —— 只有 `listings_select_own` 能讓它成立
   (`select_public` 對失效者為 false),這條把 own 與 public 分離開來
2. 訪客(anon)直打 `/rest/v1/listings` 讀得到**有效**會員的刊登(`select_public` 生效)
3. 訪客直打 `/rest/v1/listings` 讀不到**失效**會員的刊登(gate 真的擋)
4. 另一位登入會員讀不到失效會員的刊登(跨使用者的實際邊界所在)

**寫入邊界**

5. B 以 `user_id = A` insert → 被拒且無列產生;訊息為 RLS 形狀
   (`new row violates row-level security policy`),不是 GRANT 形狀
6. anon insert `user_id = A` → 被拒且無列產生(`auth.uid()` 為 null)
7. B PATCH A 的刊登 → **影響 0 列**,且以 service role 回讀確認 A 的資料未變
8. B DELETE A 的刊登 → **影響 0 列**,且該列仍存在
9. A 把自己刊登的 `user_id` 改成 B → 42501 ——`listings_update_own` 的
   WITH CHECK;只有 USING 擋不住「把擁有權送出去」

**刻意不斷言:「B 讀不到 A 的刊登」。** A 有效時 `listings_select_public` 讓任何人
(含 anon)讀得到,那是 §11 的公開瀏覽設計。寫成斷言會紅,而紅的是測試不是產品。
`listings`(0001 建表)與 `public_listings`(0004 view)欄位集合相同,直連 table
不會多洩任何欄位。

## 2. 系統設計

不動任何產品碼。兩層防線,都掛在**既有** CI job 上:

| 層 | 位置 | 證明什麼 | 頻率 | 邊際成本 |
|---|---|---|---|---|
| L1 結構 | `supabase/functions/api/rls-policies.test.ts`(api-tests 軌) | `listings` 上的 policy **恰好**是這 5 條、角色範圍與條件表達式未被改動 | 每個 PR | 0 |
| L2 行為 | `e2e/journey/features/45_listing_rls.feature`(journey 軌) | 真 hosted 上 anon/authenticated 真的被允許/拒絕 | 每週 + 每次晉升 PR | 0 |

**為什麼是兩層。** L2 是唯一能證明「線上安全」的——本地缺 hosted 的 anon/
authenticated table GRANT,直連在 RLS 被評估**之前**就吃 42501(理由已寫在
`api/listings.test.ts` 檔頭)。但 L2 一週才跑一次。L1 證明不了 policy「寫得對」,
卻抓得到 policy **被刪掉、角色被放寬、或多出第 6 條 permissive** ——那才是實際
會發生的迴歸,而且 1 個 PR 內就紅。

**L1 只能斷言環境無關的事實。**
`has_table_privilege('anon','public.listings','SELECT')` 本地 false、hosted true
(0717 檔頭寫明 hosted 靠平台 default privileges),在 api-tests 軌斷言它,等於
把錯的環境寫進測試——就是「先 GRANT 再測」那個假綠陷阱換件衣服。policy 的存在、
角色、表達式全部來自 migration,每個環境相同,那才是這層該釘的。做法沿用
`name-write-paths.test.ts` 的原則:**直接問 Postgres**(`pg_policy` join `pg_class`),
中間不隔 PostgREST。

**L2 的兩種拒絕形狀必須分開斷言**(本案最容易寫錯的地方):

- INSERT / UPDATE 違反 WITH CHECK → HTTP 403,body `code: 42501`
- SELECT / UPDATE / DELETE 被 USING 過濾 → **不是錯誤**,HTTP 200/204 + 0 列

所以驗收 7、8 是雙段斷言(0 列 + service role 回讀未變)。只斷言「請求成功」
或只斷言 HTTP 狀態,policy 全開時也照樣過。

**新素材**

- `e2e/journey/tools/rest_as_user.py` —— per-user PostgREST client。header 帶
  `apikey: <anon_key>` + `Authorization: Bearer <使用者 access token>`;anon 情境
  兩者都用 anon key。token 走既有 `SupabaseAdmin.password_grant_token()`,不動 GUI。
- 同模組的**純函式** `classify(status, body)` → `allowed` / `denied_by_rls` /
  `denied_by_grant` / `filtered_empty` / `unauthenticated`。這是本 feature 唯一
  能在本機跑紅綠燈的邏輯核心(區分「RLS 拒絕」與「GRANT 拒絕」正是
  `name-write-paths.test.ts` 檔頭說的辨別力問題)。

**資料與清理**

- 刊登以 service role 播種(「資料是種的,行為斷言是真的」——與時光機同原則);
  失效狀態用既有 `tools/seed_time_machine.py` 的 `capture_dates` /
  `enter_expired` / `restore_dates`,比照 60 對 A0 的做法
- 清理無新增工作:`cleanup.py` 的 `RESIDUE_TABLES` 已含 `("listings","user_id")`,
  且 `listings.user_id` 對 `profiles` 是 `on delete cascade`

**節點配置**(避開既有情境;`listings.user_id` 是 UNIQUE,撞了會壞別人):
owner = **B5**、attacker = **B6**、失效 owner = **B7**。
現況佔用:A0(00/10/20/30/40/50/60)、B1·C1(50)、D8·E1(20)、
B2·B4·C4·C5·C7·C8·D4(60)。40 的最後一個情境會**刪掉 A0 的刊登**,
所以 45 不能靠 A0 的既有資料。

## 3. 架構影響

- 不動 `src/**`、不動 `supabase/functions/api/index.ts`、不動任何 migration
- 新 marker `rls` 必須登記進 `e2e/journey/pytest.ini`——`--strict-markers` 下
  沒登記就是 collection error
- 情境數 28 → 34;`journey.yml` 的 `MIN_FULL=20` 下限仍成立,不必動(是否順手
  抬高列為開放問題)
- 效能/安全:唯讀性質的加法,無執行期影響

**為什麼不開新的 CI 軌**(指名要回答的成本問題):

一場 journey 的成本大頭是**拋棄式分支的建立、migration replay 與函式部署**
(≈10-15 分),不是情境本身。切一條只跑 RLS 情境的軌,每次仍要付那 10-15 分:
每日跑 = 300-450 計費分/月,比現在整個 journey 預算(週跑 130-390 分/月)還貴,
而它保護的是一組**只有在有人改 migration 時才會變**的規則。

正確的槓桿是改變**偵測方式**而不是提高頻率——L1 就是那個槓桿:掛在既有
api-tests 軌上,每個 PR 都跑,邊際成本 0,對「policy 被刪/被放寬」有 1 個 PR
的偵測延遲。L2 留在 full 套件:週級偵測 develop 漂移,而晉升 PR(`base=main`)
必跑 journey-full,所以對「進不進得了正式站」的延遲是 **0 天**。
符合 `.claude/rules/github-actions.md` 規則 8a:秒級/分鐘級檢查併入既有 job,
不新開 job。

## 4. UI/UX

不適用——不新增或修改任何使用者可見介面。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | L1 結構守衛:`listings` 的 policy 集合、角色、條件表達式 | `supabase/functions/api/rls-policies.test.ts`(Deno,需 DB) | 5 條齊全且無第 6 條;刪掉任一條或改成 `to public` 即紅。本機 `npm run check` 綠 |
| 2 | PostgREST 回應分類器(純函式) | `e2e/journey/tools/test_rls_probe.py` | `cd e2e/journey && pytest tools/ -q` 綠;403+42501(RLS)、403+42501(GRANT)、200+`[]`、204、401 五種形狀分類正確 |
| 3 | L2 讀取邊界(驗收 1–4) | `e2e/journey/features/45_listing_rls.feature` + `steps/f45_listing_rls_steps.py` | `pytest --collect-only -q` 列出 4 個新情境且步驟定義齊全;行為真值在 CI |
| 4 | L2 寫入邊界(驗收 5–9) | 同上 | 收集到 5 個新情境;行為真值在 CI |

⚠️ **階段 3、4 沒有本機紅綠燈。** journey 絕不在本機跑(hook 會擋),這兩階段
本機只驗證得了「情境被收集到、步驟不缺」。行為真值要等 CI 的 journey 執行。
這是這個 feature 的體質,不是能繞過的東西——能在本機跑紅綠燈的邏輯已經在
階段 2 抽出來了。實作時這兩階段的 `test(red)` 證據來自 `--collect-only`,
PR 描述要寫明這件事。

## 6. 開放問題

- [ ] **L1 要不要釘條件表達式全文?** 只釘「policy 集合 + 角色範圍」是低摩擦版,
      抓得到刪除與角色放寬,抓不到 USING 條件被改寬。加釘正規化表達式
      (`pg_get_expr`)能抓後者,代價是任何合法重寫都會紅、要人回來更新期望值。
      傾向兩者都釘(RLS 條件被悄悄改寬是最貴的迴歸),請裁決。
- [ ] **`listings_insert_own` 要不要順手收斂到 `authenticated`?** 它是 5 條裡
      唯一沒被 0726 收斂的(因為它不呼叫 `is_admin()`,當時沒症狀)。收斂會動
      migration,超出「只加測試」的範圍——傾向不動,先讓 L1 把現況釘成
      characterization,另開一張單。
- [ ] **停權(suspended)維度本輪不做**(`has_active_subscription` 同時擋停權,
      §5.3),因為 journey 目前沒有停權 builder。要補的話是本 feature 多一個階段,
      還是另一個 feature?
- [ ] **`MIN_FULL=20` 要不要隨 28→34 抬高?** 抬高讓「真的跑了」的下限更貼近
      現實,代價是每次加情境都要改一個數字。

## 7. 風險與回滾

- **純加法**:兩個新測試檔 + 一個 feature + 一個 steps 模組 + pytest.ini 一行
  marker。零產品碼改動,回滾 = revert PR。
- **最壞情況是測試本身假綠**:例如把「被 USING 過濾」誤當成「被拒絕」而只斷言
  HTTP 狀態——policy 全開時也會過。防線有兩道:驗收 7、8 的雙段斷言
  (0 列 + service role 回讀未變),以及階段 2 把分類邏輯抽成有離線測試的純函式。
- **次壞情況是情境互相污染**:B5/B6/B7 的播種刊登殘留會讓後續 `user_id` unique
  撞車。已被既有機制覆蓋——每場 journey 都是全新拋棄式分支,cleanup 的零殘留
  斷言已含 `listings`;B7 的失效狀態用 capture/restore 還原。
- **不會發生的風險**:本規劃不觸及正式站資料或金流。journey 只打拋棄式分支
  (conftest 對正式 ref 直接 `pytest.exit`)。
