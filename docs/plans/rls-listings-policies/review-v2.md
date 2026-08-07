# listings RLS policy 行為驗證 規劃書審查報告(第二輪)

<!-- 由 /review-plan 彙整四個 fresh-context reviewer 對 plan.md v2 的發現。
     聚合規則:只彙整、去重、排序,不改判。severity 一律以 reviewer 原判為準。 -->

審查對象:`./plan.md`(v2,規劃)
第一輪報告:`./review.md`(P0=0、P1=5、P2=9,人裁決「全部照建議」)
審查日期:2026-08-07

## 審查結論

| 視角 | P0 | P1 | P2 | 需裁決 | 第一輪發現回歸 |
|---|---|---|---|---|---|
| 系統 | 0 | 0 | 2 | 1 | **5/5 關閉** |
| 架構 | 0 | 0 | 3 | 0 | **5/5 關閉** |
| UI/UX | 0 | 0 | 2 | 0 | 1/1 關閉(原本即無缺口) |
| 需求 | 0 | 1 | 3 | 1 | **5/5 關閉** |

**合計(去重後):P0 = 0、P1 = 1、P2 = 9、需人工裁決 = 2。**
**第一輪 14 條發現全數確認關閉**,無殘留、無「關閉後衍生新缺口」(架構 A3 例外:
關閉了命名症狀,衍生出本輪 B1 的分層問題,已另計)。

---

## P1(1 條)

**[P1]〔§5 階段 1 驗證標準〕(需求 B-5)** L1 的 6 項檢查全部只讀 `pg_policy`,
**沒有檢查 `pg_class.relrowsecurity`**。`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`
不會刪除任何一條 policy——`pg_policy` 查詢會照樣回報 5 條、角色/表達式/permissive
全部與 golden 相符,但 RLS 完全不生效。而依規劃書 §2 自己實測到的事實,
`anon` 對 `listings` 的 SELECT/INSERT、`authenticated` 對 S/I/U/D 都是**全開**的
table GRANT——RLS 一旦被關掉(哪怕是某次資料回填 migration 忘記重開),任何人都能
讀寫**任意**會員的刊登,而 L1 六項檢查全部不會變紅,只能等每週一次的 L2 抓到。
**這正是本 feature 從第一天就在防的那類迴歸的最極端版本,卻是 L1 目前唯一的盲區。**
→ 在 §5 階段 1 加一條 `relrowsecurity` 斷言,比照 `withdrawals.test.ts:548-558`
的現成模式(`select relrowsecurity from pg_class where oid = 'public.listings'::regclass`
必須為 true)。零成本的既有模式複用,不是新技術。

---

## P2(9 條,已去重)

### 測試設計

**[P2]〔§5 階段 1 第 5 條〕(系統 B-2)** 欄位集合比對未指明是否為真正的**集合語意**
→ 若實作用未排序的逐列比較(按 `ordinal_position` 對應),日後只要重排 view 的
select list(不增減欄位、無安全意涵的重構)就會假紅。查詢也建議顯式加
`table_schema = 'public'` → 明確寫成「用 `EXCEPT` 或排序後陣列比對」。

**[P2]〔§2 新素材〕(架構 B1)** `tools/rls_probe.py` 把有離線測試的純函式
`classify()` 與網路 client `RestAsUser` 合併同檔,只換了檔名去對齊測試檔,
沒有真正解決 `tools/` 既有的分層慣例(`supa.py` 純網路無測試檔;`twid.py` /
`zh_names.py` / `orgchart.py` / `payuni_crypto.py` 四組純函式且與測試檔 1:1、
全部零網路依賴)。**離線軌 import 時打網路或掛掉的疑慮已被排除**(top-level 只
執行 class 定義;`requests` 早已是 `supa.py` 帶進來的既有相依)。真正的問題是:
這個模組被規劃書自己點名當「後續 11 張表的骨架」,混放樣式會被複製到
`profiles`/`withdrawals` → 實作時把 `classify()` 拆進真正零網路依賴的檔案,
或至少在模組檔頭寫明「與既有分層慣例不同,原因是 X」。

**[P2]〔§5 階段 1〕(架構 B2)** 6 條驗證標準裡,前 5 條是新測試檔要斷言的事、
有真正的紅綠訊號;第 6 條(訂正 `api/listings.test.ts:219` 的過時註解)是對另一個
既有檔案的手動文字編輯,沒有測試釘住 → 移出「驗證標準」清單,標成與階段 1 同一個
commit 捆綁的 housekeeping 即可,不要和可紅綠的 5 條混編。
(結構本身與 `name-write-paths.test.ts` 先例一致,**不是「階段太肥」**。)

### 說理與揭露

**[P2]〔§0 一句話〕(需求 B-1)** 停權分支「已涵蓋」的**技術結論成立,但論證鏈沒寫出來**。
reviewer 查證後確認:結論靠三件事疊加——①`listings.test.ts:199` 證明函式對
`suspended_at` 分支算出 false(走 service-role 查 view,證明的是**函式邏輯**);
②驗收情境 3 證明 RLS 對「函式回傳 false」真的會擋 anon 直連 raw table(但只用
expired 分支示範,證明的是 **RLS 機制**);③L1 golden 釘死 `listings_select_public`
呼叫的正是同一個函式(**綁定關係**)。§0 現在只寫「兩者是同一個函式」一句帶過,
單獨讀的人看不出「已涵蓋」是推論而非直接測試 → §0 補兩三句把這條組合推論寫明。

**[P2]〔§1 驗收情境 5〕(需求 B-2)** 情境 5(admin 讀)**沒有規格明文依據**——
規格書 §13 的管理後台模組清單裡沒有「刊登管理」,§1 開頭列的規格依據
(§2.2/§11/§5.1/§5.3)沒有一條佐證「管理員可直讀其他會員的刊登」。v2 §7 確實
誠實揭露了這點,但**揭露只在 §7,不在情境 5 本身**,只讀 §1 清單的人會把它誤讀成
跟其他 10 條一樣有規格依據 → 在情境 5 條目加一句「characterization,非規格明文
需求,見 §7」的顯式指標。

**[P2]〔§7 開放問題〕(系統 B-4)** 「死碼」措辭過頭。掃描範圍只涵蓋「目前前端 UI
有沒有呼叫點」,**不等於這個分支不可觸達**——任何持有 admin session token 的人
(配上隨 bundle 出貨的 anon key,規劃書 §2 自己就用這點論證 GRANT 全開的風險)
都能繞過前端直打 PostgREST 命中它。這是「未被前端使用但仍可直接觸達的即時授權
能力」,不是傳統意義的死碼 → 措辭改成「未被前端使用」,並把另開單的查證範圍從
「前端呼叫點掃描」擴大到「是否有人以 admin 身分繞過前端直打 PostgREST」,
避免未來承接者誤讀成「已確認無風險、可安全刪除」。

### 知識的持久歸宿(兩個視角獨立撞到同一件事)

**[P2]〔§1「不做」清單〕(UI/UX P2-1 + 需求 B-4,兩個視角獨立發現,已合併)**
`ServiceProviderManagement.tsx:56-59` 假成功訊息的說明**只寫在即將被刪除的
plan.md**。UI/UX reviewer 已驗證它在**任何**前端路徑下都不可觸發(該頁路由無
`:id` 參數、`listing.id` 只能來自 `useUserListing()` 自我限定查詢、全站僅此一處
`.delete()`),所以「不做」的裁決正確、**不是把該修的東西藏進不做清單**。問題是
依 CLAUDE.md 規劃檔生命週期,plan.md 會在 PR 前刪除,「不要順手去修它」的保護
只到合併為止;未來想在同一元件加 admin 代刪或恢復多刊登模式的人,得重做一次同樣的
ownership-check 追查。`document-writing.md` 的**殘跡例外條款**正是為這種情況而寫
→ 在該行加一句最小事實註解,或至少寫進 `friction-log.md` / 開一張低優先度 issue。

**[P2]〔§1「不做」清單〕(UI/UX P2-2)** `EditServiceProvider.tsx:252-271`
(`handleSubmit`)有與 delete 路徑**結構完全對稱**的同款瑕疵:0 列 UPDATE 同樣不回
error(§2「兩種拒絕形狀」一節自己已承認 UPDATE 與 DELETE 共享此特性),
`if (updateError) throw` 不會擋下,照樣顯示「服務者資訊已更新!」並 navigate 離開。
同樣已驗證任何路徑不可觸發(ownership 檢查在 `setServiceProvider` 前 redirect),
但 v2「不做」清單**只記錄了 delete 案例,沒有對稱記錄 update** → 補一句對稱說明,
與上一條一併升級到持久位置。

**[P2]〔docs/plans/ 生命週期〕(架構 B3)** plan v2 累積了三塊「這個 PR 之外仍值得
留存」的知識,但沒有指名升級落點:(a) §3 後續 11 張表按曝險排序的路線圖;
(b) §2「L1 只能斷言環境無關事實」這條測試設計原則與 `pg_policy`/`pg_get_expr`
golden-value 查詢手法;(c) 規劃期實測的 GRANT 現況表(它解釋了 0726 事故的成因
類型)。`/tdd-implement` 收尾雖有通用的「先升級再刪」步驟,但那仰賴實作者(可能是
全新 session)自行判斷哪些值得留 → 建議在 plan 定稿前明確指定落點,例如路線圖與
L1 設計原則寫進 `docs/e2e-journey-test-design.md`,GRANT 現況表併入
`supabase/README.md` 的既有事故記錄段落。

---

## 需人工裁決(2 條)

### 1. `pg_get_expr` golden 值的跨環境 Postgres 版本一致性(系統)

reviewer 指出:golden 值取自 **hosted develop**,但 L1 實際執行在 CI 的
**本地 `supabase start`**。`pg_get_expr` 是把運算式樹反編譯回文字,不同 Postgres
大版本間對括號化/間距的反編譯格式存在已知的微幅差異可能。**本專案既有同類先例
(`20260726000001` 的收尾自我驗證)刻意用 `LIKE '%is_admin%'` 子字串比對而非全等,
正是為了不被這類格式差異絆倒**——v2 的「全文逐字相符」比既有先例更嚴格,而 plan
沒有交代兩邊 Postgres 大版本是否一致。

**彙整者依 reviewer 建議查證的結果(部分可測)**:

| 環境 | Postgres | 來源 |
|---|---|---|
| develop 分支(golden 來源) | **17.6** | 唯讀查詢 `current_setting('server_version')` |
| CI 本地 `supabase start` | **未知,且未 pin** | `supabase/config.toml` 只有 `project_id` 與 `[functions.api]`,**沒有 `[db] major_version`**;本容器無 supabase CLI,無法實測 |

→ 這比 reviewer 原本陳述的更值得注意:本地大版本不只**未經查證**,而是**未被鎖定**
——`ci.yml` 的 `supabase/setup-cli` 版本(現為 2.109.1)日後一升,本地 Postgres 大版本
可能靜默改變,全文 golden 會在一個與 RLS 毫無關係的變更上爆掉。

**彙整者建議(不改判,供裁決參考)**:退一步用「空白正規化後全文比對」——保留
「條件被改寬」的偵測力(子字串比對抓不到 `user_id = auth.uid() OR true`),同時吃掉
格式差異;並在斷言失敗訊息裡帶上 `version()`,真的漂移時一眼看得出原因。

### 2. `update_own` / `delete_own` 的 admin 繞過覆蓋不對稱(需求 B-3)

`or is_admin()` 同時出現在三條 policy,§1 事實 (c) 論證「golden string 不證明它會
通電」對三條同樣成立——但目前只有 **select** 補了 L2 行為情境(情境 5),
`update_own`/`delete_own` 的 admin 繞過**只有 golden string 保護**。

reviewer 明示**不重開第一輪的裁決**(「只加讀取、改刪不加」已是明確人裁決),
只提醒揭露要完整:規劃書目前沒有一句話明講這個不對稱,容易被誤讀成「情境 5 已把
`or is_admin()` 處理完了」→ 是否要在 §7 補一句標註。

**彙整者註**:B-3 同時記錄了一個對規劃有利的機制——L1 釘死 USING 全文形成天然
耦合:未來真的動 migration 移除 `or is_admin()` 時 L1 會立刻變紅,逼實作者同時處理
golden 與情境 5,不會出現「migration 改了、測試沒人記得改」。**無矛盾。**

---

## 彙整者註記(不改判,供人審參考)

- **第一輪的爭議點,第二輪全部被獨立驗證為正確**:
  - 情境 6 與情境 9 的配對區辨力(系統逐條驗過 Postgres RLS 的 UPDATE 語意:
    policy 整條被刪 → 情境 6 從 1 列變 0 列翻紅;條件被放寬 → 情境 9 翻紅)
  - `rls_probe.py` 的離線 import 疑慮(架構實測排除)
  - B5/B6/B7 節點配置(系統對 8 個 feature 檔逐一 grep,三節點零占用;
    capture/restore 有 `f60_time_scenarios_steps.py` 的精確參數化先例)
  - 情境數 39(架構獨立重數 28,加 5+6 驗算一致)
  - 欄位集合現況相等(系統逐字核對 0001 建表 12 欄與 0004 view select 清單)
- **不動 `20260620000002` 檔頭這個偏離,找到了比我引用的更強依據**:
  `supabase/README.md:113` 已明文「**不要編輯已套用的 migration。** 修正一律新增一個
  migration」。我原本引的 `journey.yml` git/stored 漂移是這個 repo CI 特有的次要論證,
  真正一錘定音的是這條更早、更明確的專案慣例。**裁決正確,依據應改引 README:113。**
- **11 條驗收情境的溯源紀律獲需求視角正面評價**:「沒有一條是規劃書自行想像、
  既無規格依據也未誠實列為開放問題的斷言……在溯源紀律上做得比一般功能規劃更嚴謹
  (連 GRANT/policy 現況都連線 hosted DB 實測取值,不是憑空寫 golden)」。
- **P0 = 0**,不需修訂後重跑審查。唯一的 P1(`relrowsecurity`)是純加法、有現成先例、
  無取捨,建議直接補進 §5 階段 1。

---

## 處置(人審 2026-08-07 完成:**全部照建議**)

> plan.md 已依此修訂為 **v3**,並第三度重跑 `/review-plan`(做事者不自評)。
> 第三輪結果見 `./review-v3.md`。

### P1

- [x] 需求 B-5:§5 階段 1 **第 1 條**加 `relrowsecurity` 斷言(比照
      `withdrawals.test.ts:548-558`),並寫明「DISABLE RLS 不會刪掉任何 policy,
      2–6 全部照樣通過」這個理由

### P2

- [x] 系統 B-2:§5 階段 1 第 6 條寫明用 `EXCEPT`(雙向)或排序後陣列比對、
      **必須是集合語意**、顯式加 `table_schema='public'`,並點名不要用
      `ordinal_position` 逐列對應
- [x] 系統 B-4:§7 措辭改成「**未被前端使用**」,並加一段說明它是
      「可直接觸達的即時授權能力」、另開單的查證範圍要涵蓋「以 admin 身分
      繞過前端直打 PostgREST」
- [x] 架構 B1:拆成 `tools/rls_probe.py`(純函式,零網路,配對測試)與
      `tools/rest_as_user.py`(網路 client,無測試檔,比照 `supa.py`);
      §2 新素材改成表格並引用 PR #199 的 `time_shift.py` 先例
- [x] 架構 B2:註解訂正移出編號清單,改標「同 commit 的 housekeeping
      (非驗證標準,沒有紅綠訊號)」
- [x] 架構 B3:新增 **§9 知識的持久歸宿**(四項落點表),progress.md 也加了
      「收尾必做」段防止隨規劃檔一起蒸發
- [x] UI/UX P2-1 + 需求 B-4(合併):§9 指定走 `document-writing.md` 殘跡例外、
      在該行加最小事實註解,並附建議措辭
- [x] UI/UX P2-2:§1「不做」改成**兩列表格**,對稱記錄
      `EditServiceProvider.tsx:252-271`
- [x] 需求 B-1:§0 改寫成三段組合論證(函式邏輯 / RLS 機制 / 綁定關係)
- [x] 需求 B-2:情境 5 就地加 ⚠️ characterization 標記與 §7 指標

### 需人工裁決

- [x] `pg_get_expr` 比對策略 → **空白正規化後全文**;§2 新增專節說明
      本地 Postgres 大版本未鎖定的事實,並要求失敗訊息帶 `version()`
- [x] §7 補了「覆蓋不對稱的揭露」條目,明講 update/delete 的 admin 繞過
      只有 L1 結構層級保護

### 同批處理的 develop 漂移(非審查發現,但不改就是錯的)

`origin/develop` 於審查期間前進(PR #199),hook 已 rebase。連帶修正:

- [x] 既有情境數 28 → **38**(新增 `70_renewal_saga.feature` 10 條);
      加完後 39 → **49**
- [x] marker 清單補上 `renewal_saga`
- [x] §3 新增警告:PR #199 的 `pytest_expr` 窄選**不是**合併前驗證的捷徑
      ——RLS 情境的 Background 依賴 `組織樹已建置完成`,窄選會 deselect
      `orgbuild` 導致全數 skip(`MIN_FILTERED=1` 會判硬失敗),而建樹正是
      30-90 分的成本大頭
- [x] §2 節點配置重新查證:`"B5"`/`"B6"`/`"B7"` 在 `e2e/journey/` 底下零匹配,
      仍可用;`70_renewal_saga` 用自帶 cast(`orgchart-saga.yaml`),零交集。
      並引用該檔記錄的 X1→Y1 撞名事故(run 31158578254)當作不變量依據
- [x] §5 不動已套用 migration 的依據改引 **`supabase/README.md:113`**
      (既有明文規則),原本的 `journey.yml` 漂移理由降為次要

### 結論

- [x] 人審完成,裁決:**■ 修訂後通過** —— 全部照建議修訂為 v3 並重跑審查
      (見 `./review-v3.md`)。實作仍須由人親自打 `/tdd-implement`。
