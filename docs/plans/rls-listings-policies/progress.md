# listings RLS policy 行為驗證 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/rls-listings-policies`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

> 規劃本身是在 web session 的 `claude/rls-listings-policies-plan-afn43h` 分支上
> 產出的(平台預先開好,不符 `feature/*`)。**實作要另切
> `feature/rls-listings-policies`** ——PreToolUse 守衛以分支 slug 對應
> `docs/plans/<slug>/`,slug 必須是 `rls-listings-policies` 才找得到這份規劃書。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | L1 結構守衛(`api/rls-policies.test.ts`):**relrowsecurity** + 集合 + 逐條角色 + 表達式(空白正規化)+ permissive + 欄位集合不變式 | ⬜ 未開始 | | |
| 2 | `classify()` 純函式(`tools/rls_probe.py` + `tools/test_rls_probe.py`;網路 client 另放 `tools/rest_as_user.py`) | ✅ 綠 | `91b27d4` | (本 commit) |
| 3 | L2 讀取邊界情境(驗收 1–5,**5 條**) | ⬜ 未開始 | | |
| 4 | L2 寫入邊界情境(驗收 6–11,**6 條**) | ⬜ 未開始 | | |

情境數 **38 → 49**(develop 於 PR #199 新增 `70_renewal_saga.feature` 10 條後重數)。
`MIN_FULL=20` 不動(理由見 plan.md §3)。

## 收尾必做(不可隨規劃檔一起刪掉)

plan.md **§9 知識的持久歸宿**列了四項升級動作(兩處程式碼最小事實註解、
`docs/e2e-journey-test-design.md` 兩個小節、`supabase/README.md` 的 GRANT 現況表)。
**先升級,再刪 `docs/plans/rls-listings-policies/`。** 這是 `/tdd-implement` 收尾
步驟的一部分,漏做等於這次審查挖出來的東西全部蒸發。

合併前另有一件:對 `feature/rls-listings-policies` 手動 `workflow_dispatch` 一次
`journey-scheduled.yml`(**scope=full**,不要用 `pytest_expr` 窄選——理由見
plan.md §3),拿到 L2 的真實紅綠證據。

### B4 —— 階段 2 的測試 fixture 自相矛盾(已裁決:修正)

`test_unclassifiable_42501_raises_instead_of_guessing` 原本的「無法歸類」例子是
`{"code":"42501","message":"permission denied for something new"}`,但那串**含
`permission denied for`**——不論後面是 table/function/schema/sequence 都是合法的
GRANT 形狀,所以 `classify()` 正確回 `denied_by_grant`,測試 DID NOT RAISE。

**實作是對的,fixture 與它自己的測試名不符。** 依逃生口 2 停手求裁決(不自行改
測試遷就實作),人裁示修正。改成裸 42501(`insufficient privilege`,兩個標記都不含),
並在該處留註解說明為何不能拿 `permission denied for X` 當反例。
這是**加強**而非放寬:原本那條根本沒測到它宣稱要測的東西。

### B5 —— 本容器 `test_payuni_crypto.py` 收集失敗(環境,非本分支造成)

`pyo3_runtime.PanicException`;`cryptography 41.0.7` 符合 `requirements.txt` 的
`>=41.0`,但本容器是 **Python 3.11.15**,而 `journey.yml` 與 `ci.yml` 的
journey-offline 軌都固定 **3.12**。**已由 CI 證實是環境差異**:CI(3.12.13)上
`pytest tools/ -q` 跑出 `1 failed, 32 passed`,payuni 在那 32 之中。
本機驗證因此排除該檔,跑其餘 5 個模組(29 passed)。不在本 feature 範圍,不處理。

## 目前位置與下一步

**階段 2 已綠**(紅燈 `91b27d4`)。三輪審查全數完成:P0=0、P1=7 全處置、P2=25
(見 `./review.md`、`./review-v2.md`、`./review-v3.md`,四視角一致「可開工」)。

**下一步:階段 1**(L1 結構守衛)。⚠️ 開工前要先解 B1——本容器沒有 `deno` 與
`supabase` CLI,階段 1 是 Deno 測試 + `supabase start` 的本地 Postgres,裝好才
跑得動。階段 1/3/4 依 B3 裁決走**突變驗證的紅**(寫測試 → 綠 → 打壞不變式 →
確認紅 → 還原 → 綠),commit 用 `test:`,突變前後輸出貼進本檔與 PR。

<details><summary>規劃階段的原始紀錄</summary>

規劃與四視角審查都已完成,**待人審**。審查結果:P0 = 0、P1 = 5、P2 = 9
(見 `./review.md`)。

下一步(順序不可換):

1. 人裁決 `review.md`〈處置〉節的 P1/P2 與規劃書 §6 的四個開放問題
2. 依裁決更新 `plan.md` 的 §1 與 §5 —— 5 條 P1 裡至少 3 條會**改變階段切分
   的內容**(新增擁有者 update 正面情境、admin 繞過情境、欄位集合比對測試),
   不先更新的話實作期必然撞牆
3. 人親自打 `/tdd-implement rls-listings-policies`

⚠️ **開工前的分支動作**(review.md 架構 P1-1):`/tdd-implement` 從 develop 切出的
`feature/rls-listings-policies` 不含 `docs/plans/rls-listings-policies/`
(它只在規劃分支上),`feature-plan-guard.py` 只看當前分支,會擋下 Stage 1 的
第一次寫入並印出誤導性的「先跑 `/plan-feature`」。切完分支第一步先把規劃檔帶過去:

```
git checkout claude/rls-listings-policies-plan-afn43h -- docs/plans/rls-listings-policies
git commit -m "docs: 帶入已審過的規劃書與審查報告"
```

</details>

## Blockers(逃生口紀錄)

### B1-2 —— 工具鏈已裝好,但**環境的網路政策**讓階段 1 仍無法在本機驗證

人裁示「裝工具鏈」後已安裝(兩者都從 GitHub releases 取得,`deno.land` 被擋):

- `deno 2.4.5`(符合 ci.yml 的 `v2.x`)
- `supabase 2.109.1`(與 ci.yml 逐字相同;⚠️ 該 tarball 含 `supabase` shim 與
  `supabase-go` 兩個 binary,只搬 shim 會失敗,要整包解到同一目錄)
- Docker daemon 需自行 `dockerd` 啟動(容器內預設沒跑)

**但兩道網路牆讓階段 1 仍然驗不了**:

| 需求 | 結果 |
|---|---|
| `supabase start` 拉 image | Docker Hub **429 Too Many Requests**(匿名拉取限流) |
| `deno check` 解析 `jsr:@std/assert` | `jsr.io` **403**(直連與走 proxy 都是) |

跑得動的本機閘門:`deno fmt --check` ✅、`deno lint` ✅、
`python3 scripts/check-test-names.py` ✅、`npm run check` ✅。

**結論**:階段 1 的綠燈只能由 CI 的 api-tests 軌證明(那裡 jsr 與 Docker Hub 都通)。
**B3 的突變驗證在本機做不到**——需要能起本地 Postgres 的環境。見下方 B6。

### B6 —— 階段 1 的突變驗證待補【待人裁決】

依 B3 裁決,階段 1 要「寫測試 → 綠 → 打壞不變式 → 確認紅 → 還原 → 綠」。
本機起不了 Postgres(見 B1-2),CI 也不可能替我們打壞 schema。所以目前只能
拿到「在正確的 DB 上會綠」(CI api-tests),拿不到「在壞掉的 DB 上會紅」。

可選路徑:(a) 在有 Docker Hub 存取的環境本機補跑一次突變驗證;
(b) 開一個拋棄式 Supabase 分支做突變(有費用);(c) 接受只有 CI 綠,
把突變證據列為待補並在 PR 註明。**未裁決前不宣稱階段 1 已完成驗證。**

### B1(原始紀錄)—— 本容器缺 deno 與 supabase CLI,階段 1 跑不了

`deno` 與 `supabase` 皆 command not found(SessionStart hook 開場就提示過),
`docker` 有。階段 1 是 Deno 測試 + `supabase start` 的本地 Postgres,**在這個
容器裡無法執行、也就無法驗證紅或綠**。階段 2 只需要 `pytest`(目前也未安裝,
但很輕)。node 22.22.2 與 python 3.11.15 都在。

### B2 —— 第三輪架構視角審查尚未回來(時序,非裁決)

系統(P0/P1/P2 = 0/0/0)、需求(0/0/4)、UI/UX(0/1/0,該 P1 已修)都已回覆
「可開工」;架構仍在跑。它被指派的第 6 題正是**「階段 1 現在有 6 條驗證標準
+ housekeeping,會不會該拆?」**——那會改變第一個 commit 的形狀。

### ✅ B1 / B3 已裁決(2026-08-07,人:「照建議做」)

- **B3 → 採突變驗證的紅**:階段 1/3/4 寫完測試會直接綠(characterization),
  改成「寫測試 → 綠 → 本地打壞不變式 → 確認紅 → 還原 → 綠」,突變前後輸出
  貼進本檔與 PR 當證據;commit 用 `test:` 而非 `test(red):`(沒有真紅燈可指,
  硬造一個是假證據)。**階段 2 不受影響,照原樣 `test(red)` 走。**
- **B1 → 先做階段 2**(唯一在本容器可跑、且是真正紅綠循環的階段),
  階段 1 的 deno + supabase CLI 工具鏈之後再處理。

### B3 —— 紅綠循環對本 feature 的三個階段不成立【已裁決,見上】

**這是規劃三輪都沒處理到的缺口,依逃生口 2 停手記錄,不自行修改 plan。**

本 feature 全部是既有行為的 characterization,**沒有任何產品碼要寫**。所以:

| 階段 | 測試一寫就… | 說明 |
|---|---|---|
| 1(L1 結構) | **綠** | 斷言的是 DB 現況(5 條 policy 都在、RLS 已啟用) |
| 2(`classify()`) | **紅** ✅ | 函式尚不存在;照 skill 先建 stub 再寫測試,是真正的斷言紅 |
| 3(L2 讀取) | **綠** | 斷言既有 RLS 行為 |
| 4(L2 寫入) | **綠** | 同上 |

四個階段有三個會命中逃生口 1(「測試一寫就綠 → 跳過該階段」)——但那顯然
不是本意,跳過等於這個 feature 什麼都不做。

plan §1 其實寫了正確的判準:「**每一條在對應 policy 被拿掉時必須變紅**」,
但**沒有寫怎麼示範、也沒有寫 `test(red)` commit 該裝什麼**。而 CLAUDE.md 明訂
紅燈 hash 是 PR 的證據。

**建議(待裁決):改用突變驗證的紅(mutation-verified red)。**
寫完測試 → 跑(綠)→ 在本地把受測不變式打壞(`alter table public.listings
disable row level security;` / `drop policy listings_select_own ...`)→ 確認**紅**
→ 還原 → 綠。把突變前後的輸出貼進 progress.md 與 PR 描述當證據。
commit 用 `test:` 而非 `test(red):`——沒有真的紅燈 commit 可指,硬造一個
反而是假證據。階段 2 不受影響,照原本的 `test(red)` 走。

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

- 階段 3、4 **本機沒有紅綠燈**(journey 不在本機跑)。這是已知體質,不是 blocker:
  紅燈證據取 `pytest --collect-only -q`,行為真值等 CI。實作時不要為了製造本機
  紅燈而繞過 hook。

### B4 —— 階段 2 的測試 fixture 自相矛盾【待裁決,逃生口 2】

`test_unclassifiable_42501_raises_instead_of_guessing` 紅,但**實作是對的、
我的測試案例寫錯**:我把「無法歸類」的例子寫成

```python
{"code": "42501", "message": "permission denied for something new"}
```

那句話含 `permission denied for`——那**就是** GRANT 形狀(不論物件是 table /
function / schema / sequence),所以 `classify()` 正確回 `denied_by_grant`,
`pytest.raises` 得到 DID NOT RAISE。測試名說「unclassifiable」,fixture 卻完全
classifiable。真正無法歸類的 42501 是不帶 marker 的裸訊息,例如
`{"code": "42501", "message": "insufficient privilege"}`。

**不自行修改**:skill 明訂「測試錯了不是繞,是走逃生口 2」,而「實作是對的、
只是 fixture 標錯」正是動機性推理最常見的說法。提案:那一行的 message 改成
`"insufficient privilege"`(讓測試真正執行它宣稱的意圖,不是放寬斷言)。

現況:**8 passed, 1 failed**。tdd-lock 仍在,階段 2 維持 🔴。

### B5 —— `test_payuni_crypto.py` 在本容器無法收集(既有環境問題,非本分支造成)

`pyo3_runtime.PanicException` on import。`cryptography 41.0.7` 已安裝且符合
`requirements.txt` 的 `>=41.0`,所以幾乎確定是 Python 版本落差:本容器是
**3.11.15**,而 `journey.yml` 與 `ci.yml` 的 journey-offline 軌都釘 **3.12**。
其餘 20 條純函式測試全過,本 feature 的新模組不碰它。

**不修**——環境產物,超出本 feature 範圍,CI 跑的是它建置對應的版本。
記在這裡是避免被誤認為本分支引入。代價:`pytest tools/ -q` 在**本容器**無法
全綠,可驗證的訊號是「本檔 + 其餘純函式模組」。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->

- bash-guard 對含 `pytest.ini` 字樣的 `cat` 指令誤判為「在本機跑 journey」而擋下
  (2026-08-07 規劃期,改用 Read 工具即通過)。誤擋成本低,但關鍵字比對打到的是
  「檔名」而非「執行」,值得在整併時看一眼。
