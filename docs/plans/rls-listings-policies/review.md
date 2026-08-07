# listings RLS policy 行為驗證 規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent 的發現而成。
     聚合規則:只彙整、去重、排序,不改判。severity 一律以 reviewer 原判為準。 -->

審查對象:`./plan.md`(規劃,非實作 diff)
審查日期:2026-08-07

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 2 | API 契約(PostgREST 行為描述正確)、「刻意不斷言」判斷、L1 環境無關宣稱、外部整合/四契約(不適用)、storage bucket 與 `public_listings`(已被既有測試涵蓋)、邊界條件 |
| 架構 | 0 | 2 | 3 | 模組邊界、appShell 契約、L1 檔案放置(與 `name-write-paths.test.ts` 同型別先例一致)、檔名格式(feature/steps 逐字合慣例)、不開新 CI 軌的成本論證(數字與 `journey-scheduled.yml` 費用註記吻合) |
| UI/UX | 0 | 0 | 0 | **全部** —— 模式一致性、行動版、三態完備、資訊架構/BottomNav、a11y 皆不適用且無缺口 |
| 需求 | 0 | 1 | 4 | 驗收可測性、業務規則 §7–§10 對照(不適用)、價值主張陳述、既有 4 條開放問題的品質 |

**合計:P0 = 0,P1 = 5,P2 = 9。**

---

## 發現清單(依嚴重度排序)

### P1

**[P1]〔§1 驗收情境 7 / 系統設計〕(系統)** 9 條情境沒有一條是「擁有者本人 PATCH
自己的刊登會成功」的正面路徑;`EditServiceProvider.tsx:254` 是唯一依賴
`listings_update_own` 的 USING 通過才能運作的真實產品路徑,而 Supabase client 在
0 列更新時**不回傳 error**——這條 policy 整條被刪時功能會靜默失效(UI 顯示成功、
資料未變),而驗收情境 7 在「policy 存在且正確」與「整條被刪」兩種情況下觀察結果
相同(都是 0 列),不具區辨力。既有 `40_listing.feature` 已對稱補了 insert 與
delete 的正面情境,唯獨 update 兩層皆無覆蓋 → 補一條「擁有者 PATCH 自己的刊登
→ 1 列受影響 + 欄位確實變更」的正面情境,與 insert/delete 對稱。

**[P1]〔§1 驗收情境 / §6 開放問題 1〕(系統)** 沒有一條情境測 `is_admin()` 的
管理員繞過路徑;`select_own`/`update_own`/`delete_own` 三條都有 `or is_admin()`,
那是 policy 明文宣告的授權語意的一部分。若開放問題 1 最終選「低摩擦版」(只釘
policy 集合 + 角色,不釘條件表達式),`or is_admin()` 被意外砍掉這件事 **L1 抓不到、
L2 也沒涵蓋——兩層防線同時失效** → 補一條「is_admin 帳號直讀/改/刪其他會員的
刊登應成功」的驗收情境,或至少在裁決開放問題 1 時把這個風險一併納入考慮。

**[P1]〔規劃書生命週期 / progress.md〕(架構)** progress.md 只說「實作要另切
`feature/rls-listings-policies`」,沒說**怎麼把規劃檔帶過去**。`/tdd-implement`
的標準做法是從 develop 切新分支,而該分支的工作目錄與 git 歷史都不含
`docs/plans/rls-listings-policies/`(它只存在於 `claude/rls-listings-policies-plan-afn43h`
上);`feature-plan-guard.py` 的 `plan_ever_existed()` 只看當前分支的工作目錄或
`git log -1 -- <path>`(預設只沿 HEAD 走),兩者都會判定「沒有規劃書」而擋下
Stage 1 的第一次寫入,且印出的是誤導性的「先跑 `/plan-feature`」 → 切出
`feature/rls-listings-policies` 後第一步顯式把規劃檔帶過去並 commit
(`git checkout <規劃分支> -- docs/plans/rls-listings-policies && git commit`,
或 cherry-pick 產出規劃的那次 commit),而不是只切分支。

**[P1]〔§5 階段切分〕(架構)** 階段 3、4 的問題不只是「本機沒有紅綠燈」——
`feature/rls-listings-policies → develop` 這條 PR **完全不會跑真後端 journey**:
`ci.yml` 的 `journey-full` 只在 `github.base_ref == 'main'` 觸發,
`journey-scheduled.yml` 每週跑一次且獨立於任何 PR。也就是說這兩階段合併進
develop 當下,行為真值完全沒被驗證過,最快要等下次週排程(最長 6 天)或未來某次
晉升 PR,而排程失敗只開 triage issue、不會回頭擋已合併的 PR → 階段 4 完成、PR
定稿前,人工對該分支手動 `workflow_dispatch` 一次 `journey-scheduled.yml`
(scope=full)拿到真實紅綠證據再合併,不要把「之後哪天排程跑到」當成驗證循環。

**[P1]〔§1 使用者需求·「刻意不斷言」段〕(需求)** 規劃斷言「`listings` 與
`public_listings` 欄位集合相同,直連 table 不會多洩任何欄位」只是**現在為真的
靜態事實**,沒有任何測試釘住這個不變量;未來有人幫 `listings` 加欄位卻忘了同步
`public_listings` 白名單,`listings_select_public` 會讓新欄位直接對 anon 曝光。
既有的 view 欄位白名單測試(`listings.test.ts:228`)只護得住 view、護不住 raw
table,本規劃 L1/L2 也都沒補這道防線——而這正是本 feature 宣稱要防的那類
「政策被悄悄放寬」迴歸的變體 → L1 加一條「`listings` 欄位集合 = `public_listings`
欄位集合」的比對測試,不要只在文字裡斷言。

### P2

**[P2]〔§1 驗收情境 5、6〕(系統)** 情境 5、6 的「被拒且無列產生」在
`listings_insert_own` **整條被刪**時觀察結果不變——RLS 對缺少任何 permissive
policy 的 INSERT 一律 default-deny,錯誤訊息文字與 WITH CHECK 失敗時完全相同。
這兩條實際防的是「條件被放寬」而非「policy 被刪除」(後者靠既有
`40_listing.feature` 的正面情境間接兜底,套件層級無實際漏洞),但 §1 開頭
「每一條在對應 policy 被拿掉時必須變紅」這句框架性宣稱對這兩條不成立
→ 在 §1 註明這兩條實際保護的是「條件被放寬」,避免誤導後續維護者。

**[P2]〔§5 階段切分,階段 1 驗證標準〕(系統)** 「刪掉任一條或改成 `to public`
即紅」這句通用敘述,套到 `listings_insert_own`(現況本來就是 `to public`,依 §6
開放問題 2 傾向維持)與 `listings_select_public`(依設計必須對 anon 開放)會
自相矛盾;照字面寫測試會把這兩條誤斷言成「不是 public」 → 階段 1 驗證標準改成
逐條列出每條 policy 的期望角色範圍(3 條 `to authenticated`、2 條維持 PUBLIC),
不要用一句話概括。

**[P2]〔§2 系統設計·新素材〕(架構)** `tools/rest_as_user.py`(來源)與
`tools/test_rls_probe.py`(測試)命名不成對,與 `tools/` 既有四組 1:1 慣例
(`zh_names.py`/`test_zh_names.py`、`twid.py`/`test_twid.py`、
`orgchart.py`/`test_orgchart.py`、`payuni_crypto.py`/`test_payuni_crypto.py`)
不一致 → 測試檔改名 `test_rest_as_user.py`,或把 `classify()` 拆到獨立的
`rls_probe.py` 讓測試檔名符其實。

**[P2]〔§3 架構影響〕(架構)** 情境數運算「28 → 34」與階段表對不上:階段 3 新增
4 個、階段 4 新增 5 個,4+5=9,28+9 應為 **37**。此數字被拿去支撐「`MIN_FULL=20`
下限仍成立」以及 §6 開放問題 4 的前提;雖然 34 或 37 都遠高於 20、結論不受影響,
但既然規劃書一貫要求精確的數字論證,這處算式要訂正,§6 的前提也要跟著更新。

**[P2]〔§1 使用者需求·驗收情境〕(需求)** 規劃引用 §11 佐證「B 讀得到 A 的刊登」
合理,但 §11 原文只寫「訪客走 `public_listings` View」,字面沒授權「訪客可直連
`listings` 資料表」;真正的證據是 migration `20260620000004`(view 改
`security_invoker` 後 `listings` 需要可見性 policy)與 `20260726000001`(明確重申
「anon 讀 listings 仍由 `listings_select_public` 決定可見範圍」是刻意設計)。
`20260620000002` 檔頭註解「訪客瀏覽刊登走 public_listings View...不直接開放
listings」與 `listings.test.ts:219` 的「public_listings 是唯一對 anon 開放 select
的資料表面」都已是與 0004 之後行為不一致的過時說法 → 規劃改引 0004/0726 為主要
佐證,並在同一 PR 順手更新這兩處過時註解,避免這個 PR 一落地就讓既有註解變成誤導。

**[P2]〔§6 開放問題〕(需求)** 停權維度排除本身判斷得當、也已誠實列為開放問題;
但「§0 一句話」宣稱「讓 `listings` 的 5 條 RLS policy 有機械把關」,而
`listings_select_public` 內建的停權分支(`has_active_subscription()` 同時檢查
`end_date` 與 `suspended_at`)在 L1(不斷言運算邏輯)與 L2(無停權 builder)都沒有
行為覆蓋 → §0 加註「不含停權分支」,避免被誤讀成 5 條 policy 的每個分支都已覆蓋。
(reviewer 明示:§5.3「三處逐字對齊」是否本輪補齊,維持規劃現有判斷,不升級為 P0/P1。)

### P2〔需人工裁決〕

**[P2]〔§3 架構影響〕(架構)** 新 marker `rls` 與既有 `listing` marker
(`40_listing.feature` 已用於刊登 CRUD/公開能見度)的關係未定義——
`45_listing_rls.feature` 的情境是否要疊加 `@listing`(`50_withdrawal.feature`
有 `@withdrawal @negative` 疊加的先例),會影響未來 `pytest -m listing` 選擇性
執行時是否涵蓋 RLS 場景 → 動手前把標籤慣例寫清楚,避免實作時隨意決定。

**[P2]〔§1 使用者需求·「不做」清單〕(需求)** 範圍只以「哪些表現在有前端直連
呼叫」決定第一輪做 `listings`,沒有比較 12 張表的曝險等級。`profiles`
(`national_id`/`bank_account`,只有 self-only policy)、`withdrawals`(INSERT 的
WITH CHECK 內嵌業務規則:僅允許 `status='pending'`)一旦 RLS 被誤放寬,衝擊遠高於
本就設計成半公開的 `listings`;而規劃自己的價值主張(anon key 隨 bundle 出貨)也
隱含攻擊面不受「前端目前是否呼叫該表」限制。「先做有現成呼叫點的表」是可辯護的
起手式,但規劃書沒交代這個取捨 → 開放問題補一條:後續 11 張表的補齊順序依據是
什麼、要不要按曝險等級重排(`profiles`/`withdrawals` 優先)。

**[P2]〔§1 驗收情境 1〕(需求)** 「失效會員仍讀得到自己的刊登」與 §2.1、§5 表格
「會員(會籍失效):...刊登隱藏」的字面有解讀落差——規格表格沒明確區分「對外隱藏」
與「連擁有者自己都看不到」。規劃的推論有現況佐證支持(`listings_select_own` 本就
不含 active 條件,`src/hooks/useUserListing.ts` 也有對應設計註解),但規劃書沒把
推論寫出來 → 補一句:「刊登隱藏」在此指公開可見度、非擁有者自身讀取權。

---

## 需人工裁決

### 1. `is_admin()` 對 `authenticated` 的 EXECUTE 授權 —— **已查證,前提成立**

系統 reviewer 提出:`20260620000004:79` 只 `revoke execute ... from anon, public`,
全庫沒有任何一行對 `authenticated` 補 `grant execute`,推測 `authenticated` 可能
拿不到 `is_admin()` 的 EXECUTE;若成立,驗收情境 4、7、8、9(全部命中
`user_id = auth.uid()` 為 false、必須實際求值 `is_admin()` 的分支)會得到
`permission denied for function is_admin`(GRANT 形狀)而非規劃預期的 RLS 形狀,
而修法要動 migration,**會推翻「純加法、零產品碼改動」的前提**。
reviewer 自述「未實際連線驗證」,並建議實作前先跑一次 `has_function_privilege`。

**依 reviewer 建議查證的結果**(對 develop 的 Supabase 分支 `ijcxnxhrziehdtkwausy`
執行唯讀查詢;該分支與 journey 的拋棄式分支同為「從 migration 乾淨重播」的
hosted 環境):

| 檢查 | 結果 |
|---|---|
| `has_function_privilege('authenticated','public.is_admin()','EXECUTE')` | **true** |
| `has_function_privilege('anon','public.is_admin()','EXECUTE')` | false |
| `has_function_privilege('anon','public.has_active_subscription(uuid)','EXECUTE')` | true |
| `has_table_privilege('anon','public.listings','SELECT' / 'INSERT')` | **true / true** |
| `has_table_privilege('authenticated','public.listings', S/I/U/D)` | 全部 true |

→ 推論鏈第 2 步不成立:`revoke ... from public` 移除的是**隱含**的 PUBLIC 授權,
而 hosted 的 default privileges 另外給了 `authenticated` 一份**明確**授權,
`revoke from anon, public` 動不到它(這也正好解釋 0726 那次為何只有 anon 中招)。
**驗收情境 4、7、8、9 會拿到 RLS 形狀,規劃的「零 migration 改動」前提成立。**

附帶確認兩件對規劃有利的事實:
- anon 對 `listings` 同時有 SELECT 與 INSERT 的 table GRANT → 驗收情境 6
  (anon insert)確實會走到 RLS 才被拒,規劃原本為此加的保守措辭
  (「被拒且無列產生」而不釘形狀)可以收緊成釘 RLS 形狀。
- 這也**正面印證**了本 feature 的價值主張:GRANT 層對 `listings` 全開,
  RLS 是唯一的列級授權邊界。

**仍需人裁決的是**:要不要把這組 GRANT 事實也寫進 L1?⚠️ 不建議——它們正是
規劃 §2 點名的「環境相依」事實(本地 false、hosted true),寫進 api-tests 軌就是
假綠陷阱。若要釘,該釘的位置是 L2(journey,真 hosted)。

### 2. 規劃書 §6 自列的四個開放問題(架構 reviewer 提醒一併裁決)

L1 是否釘條件表達式全文 / `listings_insert_own` 是否收斂到 `authenticated` /
停權維度是否本輪做 / `MIN_FULL` 是否隨情境數抬高。

**補充事實**(同次唯讀查詢,develop 上 `public.listings` 的實際 policy 現況,
可直接作為 L1 golden 值的來源):

| polname | cmd | permissive | roles | USING | WITH CHECK |
|---|---|---|---|---|---|
| `listings_select_own` | SELECT | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | — |
| `listings_insert_own` | INSERT | ✅ | **PUBLIC** | — | `(user_id = auth.uid())` |
| `listings_update_own` | UPDATE | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | `((user_id = auth.uid()) OR is_admin())` |
| `listings_delete_own` | DELETE | ✅ | `authenticated` | `((user_id = auth.uid()) OR is_admin())` | — |
| `listings_select_public` | SELECT | ✅ | **PUBLIC** | `has_active_subscription(user_id)` | — |

恰好 5 條、全部 permissive,與規劃描述一致——**L1 的可行性已被實測確認**,
且這張表就是「逐條列出期望角色範圍」(系統 P2-2)所需的內容。

### 3. 其他 reviewer 自標的裁決項

- 新 marker `rls` 與既有 `listing` marker 的疊加關係(架構,見 P2 區)
- 後續 11 張表的補齊順序依據(需求,見 P2 區)
- 驗收情境 1 與規格「刊登隱藏」字面的解讀落差是否要寫進規劃(需求,見 P2 區)

---

## 聚合者註記(不改判,僅供人審參考)

- **UI/UX 的「無缺口」是查證後的結論,不是略過**:reviewer 追到
  `EditServiceProvider.tsx:68-72` 有 client-side ownership 檢查會在
  `setServiceProvider` 之前 redirect(不存在他人資料閃現),且刪除路徑的
  `listing.id` 一律來自 `useUserListing()` 的 `.eq('user_id', userId)`,
  跨使用者情境在 UI 上不可觸發。
- reviewer 順帶指出的**既有**行為(非本規劃缺口,未列為發現):
  `ServiceProviderManagement.tsx:56-59` 在 0 列刪除時仍顯示「刊登已成功刪除」
  ——因為被 USING 過濾不是 error。UI 導覽下不可觸發,且落在本規劃「零產品碼
  改動」範圍外。記在此處以免這個事實隨審查報告一起蒸發。
- **P0 = 0**,故不需修訂後重跑 `/review-plan`;但 5 條 P1 中至少有 3 條
  (系統的兩條、需求的一條)會**改變階段切分的內容**(要新增正面路徑情境、
  admin 繞過情境、欄位集合比對測試),建議在人裁決後、`/tdd-implement` 開工前
  先把 plan.md 的 §1 與 §5 更新到位,否則實作期必然撞牆。

---

## 處置(人審 2026-08-07 完成:**全部照建議**)

> 人裁決:「全部照建議」。以下逐條記錄處置結果與落點。
> plan.md 已依此修訂為 v2,並**重跑 `/review-plan`**——修訂幅度動到 §1 驗收清單
> 與 §5 階段內容,做事者不自評,由四個 fresh-context reviewer 重審 v2。
> 第二輪結果見 `./review-v2.md`。

### 裁決摘要(8 項)

| # | 決定 | 落點 |
|---|---|---|
| 1 | L1 **釘**條件表達式全文(golden),不採語意子句比對 | plan §5 階段 1、§6-1 |
| 2 | **加** admin 繞過的讀取情境 1 條(改/刪不加) | plan §1 情境 5、§1 事實 (c) |
| 3 | `listings_insert_own` **維持 PUBLIC**,釘成 characterization,另開單 | plan §6-2 |
| 4 | 停權維度**不做** —— 已由 `listings.test.ts:199` 經同一函式涵蓋 | plan §0、§6-3 |
| 5 | listings 先做完當骨架,後續**改按曝險排序**(`profiles`/`withdrawals` 優先) | plan §3 |
| 6 | 合併前**手動 `workflow_dispatch` 一次 full journey** | plan §3 |
| 7 | 情境標籤**疊加** `@journey @listing @rls` | plan §3 |
| 8 | `MIN_FULL=20` **不動** | plan §3 |

### 一處刻意偏離 reviewer 建議(需求 P2-2)

reviewer 建議順手更新 `20260620000002` 檔頭的過時註解。**只改
`api/listings.test.ts:219`,不動該 migration 檔頭。** 理由:`journey.yml` 檔頭
寫明分支 schema 是 replay 母專案 `schema_migrations` **存下來的語句**、不是 git
檔案,2026-07-26 連紅 12 晚的根因正是這種 git/stored 漂移。註解改動行為上惰性
(0002 已在所有環境歷史裡,不會再從 git 執行),但不值得在「零產品碼改動」的 PR
裡替那條界線開例外。正確語意寫進新 L1 測試檔頭。詳見 plan §5 階段 1 的引言區塊。

### 一處數字訂正(聚合者自陳)

彙整當下對人口述的「情境總數 40 / 階段 3 從 4 條變 6 條」有誤:讀取邊界只增加
admin 那 1 條(4 → **5**),「有效擁有者讀自己」被驗收情境 1(失效擁有者讀自己)
嚴格涵蓋,獨立寫是冗餘。正確數字:讀取 5 + 寫入 6 = 11 條新情境,28 + 11 = **39**。
plan.md v2 用的是 39。

### P1

- [x] 系統 P1-1:補「擁有者 PATCH 自己的刊登成功」正面情境 → plan §1 情境 6;
      並在 §1 事實 (b) 寫明它是情境 9 區辨力的另一半
- [x] 系統 P1-2:補 `is_admin()` 管理員繞過情境 → plan §1 情境 5(只加讀取);
      連帶在 §7 記下「`or is_admin()` 可能是死碼」待另案確認
- [x] 架構 P1-1:progress.md 補「規劃檔怎麼帶到 `feature/` 分支」的具體指令
- [x] 架構 P1-2:合併前手動 `workflow_dispatch` → plan §3 專節,明示 scope=full
- [x] 需求 P1-1:L1 補「`listings` 欄位集合 = `public_listings` 欄位集合」比對
      → plan §5 階段 1 第 5 條

### P2

- [x] 系統 P2-1:§1 註明情境 7、8 保護的是「條件被放寬」 → plan §1 事實 (a)
- [x] 系統 P2-2:階段 1 驗證標準改為逐條(6 條),並寫明概括說法為何自相矛盾
- [x] 架構 P2-1:改用 `tools/rls_probe.py` + `tools/test_rls_probe.py`(成對)
- [x] 架構 P2-2:訂正情境數 → **39**(非 34 亦非 37,見上方數字訂正)
- [x] 架構 P2-3〔裁決〕:疊加 `@journey @listing @rls`
- [x] 需求 P2-1〔裁決〕:後續改按曝險排序 → plan §3「後續 11 張表的補齊順序」
- [x] 需求 P2-2:改引 0004/0726 為佐證 → plan §1 專節;測試檔註解訂正列入階段 1;
      **migration 檔頭刻意不動**(見上方偏離說明)
- [x] 需求 P2-3:§0 加註停權分支 —— 依裁決 4 改寫成「已由同一函式涵蓋」而非「不含」
- [x] 需求 P2-4:補寫「刊登隱藏 = 公開可見度,非擁有者自身讀取權」 → plan §1 專節

### 規劃書自列的開放問題(§6)

- [x] 開放問題 1 → 裁決 1(釘全文)
- [x] 開放問題 2 → 裁決 3(維持 PUBLIC,另開單)
- [x] 開放問題 3 → 裁決 4(不做)
- [x] 開放問題 4 → 裁決 8(不動)

### 結論

- [x] 人審完成,裁決:**■ 修訂後通過** —— 全部照建議修訂,plan.md 已更新為 v2
      並重跑審查(見 `./review-v2.md`)。實作仍須由人親自打 `/tdd-implement`。

<!-- 原本這裡留了一份未勾選的處置模板「供對照」,已刪除:它有 22 個空
     checkbox(含一行未勾的「人審完成,裁決」),而 /tdd-implement 的開工前置
     檢查正是讀這個檔——留著會讓未來 session 誤判成「還有未處置發現、且人審
     未裁決」而拒絕開工。真正的處置在上方,內容不會消失
     (`git show <hash>:docs/plans/rls-listings-policies/review.md`)。 -->
