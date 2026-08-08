# journey 剩餘失敗的交接文件

> **這份檔案的存在本身是今天的教訓。** 上一輪的交接文件 commit 在一條沒被
> fetch 的分支上,接手的 session 用 `git log --all` 搜不到就判定「不存在」,
> 從零重做了一整輪靜態分析(所幸結論一致)。**`--all` 只看本地 refs。**
> 這份直接進 develop,任何 session `git pull` 就看得到。

分支基準:develop @ `0858c19`(PR #265 合併後)
最新一場 journey:**run 31235468231 → 10 failed / 87 passed**

## 0. 已經修完的(不要重做)

| 根因 | 性質 | PR |
|---|---|---|
| 刊登名稱 17 字被 `#name` 的 `maxLength=10` 靜默截斷 | 測試 | #260 |
| 建立成功後沒清 `userListing` 快取 | **產品** | #260 |
| 提領查詢用了不存在的 `withdrawals.created_at` | 測試 | #265 |
| 兩個情境搶同一個人的當日提領額度 | 測試 | #265 |
| f45 `rls_probe.classify` 把 42501 判成 unauthenticated | 測試 | #257 |
| **S1** 推薦樹以未遮罩原名比對 UI(gen ≥ 2 會遮) | 測試 | 見下方 §S1 |

前兩條的完整紀錄見 `docs/plans/fix-journey-f40-listing/fix.md`(已結案,
兩個根因都經真後端複驗)。

## 1. 施工順序(已與使用者確認)

**S1 → S5 → S3 → S4**,一次一個 session、一個 PR 一個根因。
develop 高頻變動(今天一小時內合了 5 個 PR),**開工前先
`git fetch origin develop && git log --oneline HEAD..origin/develop`**
看別人在修什麼。

驗證策略:**批次**。各自 PR 進 develop 之後跑**一場** journey full 一次驗完
——牆鐘由 30 人 GUI 建樹主導,窄選省不掉,而分支費用每場都一樣。

⚠️ 窄選若真要用,**不能只帶 `listing` 這類 marker**:f40/f50/f60 的
Background 都需要 `@orgbuild` 的 30 人建樹,少了它情境會全 skip,
然後工作流的下限斷言以「實際只執行 0 個情境」硬失敗,整場白燒。

---

## S1 — 推薦樹展開(**已修,待下一場 journey 複驗**)

修法與根因如下,保留是因為 S3/S5 若碰到推薦網絡的任何斷言都適用同一組結論。
**動樹上的斷言一律走 `builders/referral_tree` 的 `expect_node` /
`expand_ancestors` / `tree_row`**,不要自己 `get_by_text(真名)`。

施工當下多發現一件規劃沒預料到的事,記在下方「額外發現」——照原規劃直接
把原名換成遮罩名會從逾時變成 strict mode violation,一樣是紅的。

**失敗情境**(2 條,同一個根因):

- `f20 Root 推薦樹只顯示三代且第四代不出現`
- `f60 上線的組織圖顯示已失效節點且結構不斷開`

**根因**:journey 用**未遮罩的原名**去比對 UI,但
`maskNameByGen()`(`supabase/functions/api/index.ts:3214`)對 **gen ≥ 2**
的姓名做隱私遮罩:

| 代 | 原名 | 畫面實際顯示 |
|---|---|---|
| gen 1 | `測壹捌零玖陸伍零乙參` | 原樣(不遮) |
| gen 2 | `測壹捌零玖陸伍零丙柒` | `測○○○○○○○○柒` |
| gen 3 | `測壹捌零玖陸伍零丁捌` | `測○○○○○○○○捌` |

規則:`gen <= 1` 或長度 ≤ 1 不遮;2 字 → 首字＋`○`;否則
首字＋`○`×(n-2)＋末字。非漢字用 `•`。

**為什麼失敗在那個位置**:`expand_ancestors(viewer=A0, target=D8)` 依
orgchart 走出鏈 `[C7, B3]`,反轉後先展開 **B3**(gen 1,**不遮**→ 成功),
再展開 **C7**(gen 2,**遮罩** → `treeitem` 的 `aria-label` 對不上 → 15 秒逾時)。
f60 等的是 D4(gen 3)—— 同一個根因。

**產品是對的**,遮罩是刻意的隱私設計(見 `/referrals/network/search`
端點註解:「回傳遮罩後顯示名…又不洩漏真名」)。**要改的是測試。**

### 額外發現:遮罩後的姓名**不再唯一**

journey 的姓名是 `測 + run_id 尾段 + 節點代號`(`tools/zh_names.py`),遮罩
只留首尾字,而尾字正是節點編號的數字——於是 **C7 與 D7 都遮成
`測○○○○○○○○柒`**。f20 展開到第三代之後,`測○…○捌` 同時命中 C8 與 D8,
只用姓名定位會撞上 Playwright 的 strict mode:症狀從逾時換成另一種紅。

定位鍵因此是**兩把鑰匙:遮罩後的顯示名 + `aria-level`**。orgchart 是嚴格
分層樹,某檢視者的第 k 代必定落在同一個絕對層,而**同一層之內遮罩後仍唯一**
——這個不變式由 `tools/test_name_mask.py` 的
`test_masked_names_stay_unique_within_each_generation` 鎖住,離線軌就會紅。

### 實際做的

1. `tools/name_mask.py` —— `maskNameByGen` 的鏡像;`tools/test_name_mask.py`
   直接讀 `index.ts` 源碼比對 `HAN_RANGE` 與遮罩規則的關鍵字面值,規則漂了
   在秒級的離線軌就紅(同 `test_listing_name.py` 讀 `NAME_MAX_LENGTH` 的做法)。
   順手把 `test_zh_names.py` 裡第三份 `HAN_RANGE` 複製品改成引用,Python 側只剩一份
2. `tools/orgchart.py` —— `ancestor_chain()` / `generation_of()`;target 不在
   viewer 下線鏈上時**擲錯**,先前會一路走到 root 交出不在該樹上的節點
3. `builders/referral_tree.py` —— `tree_row` / `expand_node` / `expand_ancestors`
   / `expect_node` 一律吃代數
4. `f20` 的 `tree_excludes(E1)` 是空洞斷言(它斷言 E1 的**原名**不出現,而遮罩
   之後原名本來就永遠不會出現,第四代真的漏出來時它也照樣綠),改成
   `推薦樹沒有第四代節點`:先確認第三代**已渲染**,再斷言沒有 `aria-level=4`
   的 treeitem,且第三代**沒有展開鈕**——把「此刻沒有」升級成「到不了」
5. `orgchart.yaml` 的 `expected_tree_visible` 沒有任何程式讀,其註解描述的正是
   被換掉的那條 E1 斷言,一併刪除

---

## S5 — f70 續約 saga(**新出現,先分類再修**)

**失敗情境**(3 條):

- 第 6 章 `q9 防線:待審提領擋 fresh、駁回退點後解封` — `Locator expected to have count '0'`
- 第 7 章 `s9 與 q14a:填現任上代碼照樣清空歷史桶` — `Locator.click timeout 20000ms`
- 第 10 章 `終章對帳:分類軸、免費續約註記與推導餘額` — `Locator expected to be visible`

**為什麼優先**:這 3 條在 run 31234221750(02:06)**沒有**、在
run 31235468231(02:40)**有**。兩場之間的差異是 rebase 到含 #257/#261 的
develop。「上一場沒有、這場有」本身就是訊號,拖越久越難歸因。

**第一步是分類,不是修**:

- saga 是**章節相依**的,第 6 章壞了會拖垮 7、10 → 很可能**一個根因三條**
- 第 6 章是**提領**相關,而今天剛確認「每人每天只能提領一次、且不看狀態」
  (`has_withdrawn_today`)。**懷疑同類,但沒有證據前不要當結論**
- 也可能只是 saga 對執行順序敏感(非真回歸)

先回答「是真回歸還是順序敏感」再決定要不要走完整 `/fix-bug`。

---

## S3 — 過期會員與獎勵頁(**產品決策已定:選項 C**)

**失敗情境**(2 條):`f60 過期會員的點數保留不歸零`、
`f60 過期會員提領被擋(點數保留、僅擋提領)`。
兩條都停在 `/payment/checkout`,等不到 `/rewards` 的「獎勵回饋」heading。

**衝突點**:

- **程式碼**:`/rewards` 包在 `RequireMembershipRoute` 裡(`App.tsx:375`)
  → 過期會員被導去續約頁
- **規格 §59**:「會籍失效…會籍限定功能被導向續約」→ 支持現行程式碼
- **規格 §5 狀態表**:失效時獎勵收益「✅ 保留不歸零」、提領「❌ 不可」
- **情境名稱**:「**僅擋提領**」→ 預期看得到頁面

張力在於:「點數保留不歸零」若使用者根本看不到,這個承諾等於不存在。

**使用者已裁決:選項 C** ——
**獎勵頁改為過期會員可看,但頂部常駐續約提示;提領動作維持擋。**

施工時記得:這會動到產品程式碼,**規格 §59 要在同一個 PR 回頭修**
(CLAUDE.md:規格與程式碼衝突時以程式碼為準,並在同一個 PR 修規格書)。
另外續約動線少了一個觸點,續約提示的顯著程度值得用 UI/UX 視角審一次。

---

## S4 — PayUni sandbox 導頁逾時(最後做)

**失敗情境**:`f60 新約復活 — 換推薦人、效期自付款日起算、刊登重新公開`
—— 等不到導向 `sandbox-api.payuni.com.tw`,60 秒逾時。

**兩場 run 都失敗(2/2)**,所以**不是偶發**,先前「可能只是環境雜訊」的
判斷已被推翻。但它是外部相依,最可能白費工,所以排最後。

---

## 貫穿這批 bug 的一條原則

今天四個根因裡有三個是同一個形狀,**S1 是第四個**:

| bug | 產品實際做的轉換 | 測試以為的值 |
|---|---|---|
| f40 刊登名稱 | `maxLength` 截斷成 10 字 | 原始 17 字 |
| f50 提領查詢 | 欄位叫 `requested_at` | `created_at` |
| **S1 推薦樹** | **gen≥2 姓名遮罩** | **原名** |

**測試相信了一個產品從未承諾的值**,而且三次的錯誤訊息都指向遠處
(某個 `get_by_text` / `expect` 找不到東西),把人帶離現場。

可操作的收斂:**斷言一個值之前,先確認產品在那條路徑上不會轉換它**
——長度上限、遮罩、正規化 trigger、欄位改名都算。已補的
`BasePage.fill_exact()` 是這條原則的第一個機械化實例(填完回頭比對),
其餘目前仍靠人。

S1 施工時長出第二句:**轉換之後還要確認轉換後的值仍然唯一。** 遮罩、截斷、
正規化都會壓縮資訊,原本能認人的值壓縮完可能認到兩個人——那時失敗訊息會從
「找不到」變成「找到太多」(Playwright strict mode),一樣離現場很遠。
定位一個東西時,識別鍵撐不住轉換就補一把結構性的鑰匙(S1 補的是 `aria-level`)。
