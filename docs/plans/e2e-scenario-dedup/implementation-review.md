# e2e 情境去重 實作審查報告

<!-- 由 /review-implementation 彙整四個 reviewer subagent 的發現而成。
     聚合規則:只彙整、去重、排序,不改判。降級/剔除須列入「需人工裁決」附理由。 -->

審查對象:`origin/develop...HEAD` 的實作 diff(審查時 HEAD = `6f91471`)
審查日期:2026-08-07

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 0 | 18 條刪除與 plan §4 逐檔吻合(無多刪無少刪);抽驗 10+ 條下層證據全部真實存在且斷言相符;四旅程端到端全在;25 個孤兒 step 正反向查證無殘留引用;`e2e/pages/` 未被觸碰;Deno 契約面接手確認;ci.yml job/needs/timeout/artifact 未變 |
| 架構 | 0 | 1 | 1 | ci.yml 結構全項未動、規則 8 未被偷渡鬆綁(結論不變、只換依據);README 兩節與既有 rules 無重複衝突;孤兒 step 清理(8 個受影響檔案逐一讀過);9 個 pytest marker 無一降到 0;三階段各自獨立可 revert;`src/**`/`supabase/**` 未觸碰,appShell 契約不受影響 |
| UI/UX | 0 | 1 | 0 | P1-1/P1-2/P1-3 三項規劃期裁決均已落地(home 手機 4 條全留、overflow sweep 未動、`I am on a mobile-sized screen` 維持 5 處);375px toast 溢版情境未誤刪;README「Removing a scenario」內容正確且比規劃期更嚴謹 |
| 需求 | 0 | 1 | 1 | 硬約束 1–4 逐條滿足;人審裁決 P0-1/P0-2/Q9/Q10/Q2/Q6/Q4/Q5/Q7/Q12/Q13 逐項比對無一走偏;刪除量精確 18 條;ci.yml 與 README 改動均在授權範圍內,非範圍蔓延;friction-log 三條恰當;未腦補需求 |
| **合計(去重後)** | **0** | **3** | **2** | |

**四個視角一致確認**:18 條刪除與 plan §4 完全吻合、下層證據真實存在、
四旅程端到端保留、`route_guards.feature` 與 `line_browser.feature` 整檔未動、
CI 結構一行未改。**沒有 P0。**

---

## 發現清單(依嚴重度排序)

### P1-1〔progress.md 階段表與 Blockers〕 — 系統 / 架構 / UI/UX **三視角獨立發現**

`[P1]〔progress.md〕階段 4(ci.yml 改寫)與階段 5 的 README/friction-log 升級
都已落地,但 progress.md 仍標「🛑 停,待裁決」「⬜ 未開始」,Blockers 仍寫
「禁止我自行決定」「尚未動任何 e2e/ 檔案」,且未記錄裁決 (a) 的核准者與時間
——progress.md 是 CLAUDE.md 指定的跨 session rehydrate 起點,狀態失真會讓
接手者重工或誤判 → 更新階段表、補上人審裁決紀錄。`

**處置:已修(`dab229b`)。** 階段表拆成 4 / 5a(已綠,附 commit)與 5b
(規劃檔刪除,待收尾);Blockers 第一條改標「✅ 已解決,人審 2026-08-07
裁定 (a)」並保留原記錄作為決策脈絡;「目前位置與下一步」重寫。

> 系統視角另提出〔需人工裁決〕:裁決 (a) 是否真經人工核准。**是**——
> 使用者於對話中明示「按照你的建議」,而我提出的建議即 (a)。該核准先前
> 只存在於對話,未落檔;現已寫進 progress.md 與 review.md 處置節。
> 這正是本條 P1 的核心價值:**口頭核准不落檔,等於沒有核准**。

### P1-2〔admin「標記已匯款」的下層證據不足〕 — UI/UX 視角

`[P1]〔§4.1 / WithdrawalManagement.test.tsx〕被刪的 admin「標記已匯款」情境
斷言的是操作後的畫面文字「已標記匯款完成」,但引用的兩條下層測試一條驗按鈕
可見、一條驗送出參數,**都沒有畫面回饋斷言**,證據等級未達自訂的 A 級
→ 在元件測試補一行對稱的畫面確認斷言即可,不必回復 e2e 情境。`

**主 session 已複驗:成立。** `grep 已標記匯款完成 src/ supabase/` 當時只命中
`WithdrawalManagement.tsx` 的**原始碼**(狀態標籤 + action message),
**四層測試無人斷言**。

**處置:已修(`dab229b`)。** 補
`WithdrawalManagement.test.tsx::標記已匯款後畫面回報「已標記匯款完成」並帶上該會員`
(27 passed)。實測發現單筆路徑的實際文字是 `已標記匯款完成:王小明`,
斷言連會員姓名一起釘住——該動作不可回退,「對誰做的」比「做了幾筆」重要。

> 這與 plan §2「不為了湊數字而補下層測試再刪」不衝突:那條禁的是
> 「補測試以便刪更多」,這裡是「補齊已刪情境的證據缺口」,方向相反。

### P1-3〔階段 5 的 README 升級隨階段 4 commit 落地但訊息未揭露〕 — 架構視角

`[P1]〔plan §5 階段 4/5〕e2e/README.md 的判準升級屬階段 5,卻併在階段 4 的
commit 裡,而該 commit 訊息完全沒提到 README → 補記錄。`

**處置:部分已修(`dab229b` 更新了 progress.md 階段表,把 5a/5b 拆開)。**
commit 訊息本身無法回溯修改(已 push),但 `84d1691` 的訊息其實有一段
「同時把判準升級進 e2e/README.md(規劃檔是鷹架,階段 5 會刪,值得留的要先
搬家)」——架構視角是從 reflog 重建序列、未讀到完整訊息body 所致。
**此項降級為已處置,理由列入「需人工裁決」供覆核。**

### P2-1〔判準放在不會自動載入的 README〕 — 架構視角

`[P2]〔e2e/README.md + .claude/rules/e2e-tests.md〕判準升級進了不會自動載入的
README,而非本 repo 慣用的 path-scoped rules 機制(`e2e-tests.md` 有
`paths: ["e2e/**"]` frontmatter,動 e2e 就自動載入),長期曝光靠人工翻閱
→ 在 e2e-tests.md 加一行指向 README 該節的 pointer。`

**處置:已修。** `.claude/rules/e2e-tests.md` 新增「要刪 e2e 情境之前」一節,
**只放指標不複製內容**(遵守 `document-writing.md` 的「規則只寫一份」),
並帶一句最容易踩的通則(B 級證據要 grep 到實際 import)。

### P2-2〔progress.md 仍以計費數字開頭〕 — 需求視角

`[P2]〔progress.md〕裁決 (a) 要求撤掉計費語彙,但 progress.md「目前位置」
仍先寫「0.6 計費分/run ≈ 360 分/月」,免責到後面才出現 → 比照 ci.yml 整理。`

**處置:已修(`dab229b`)。** 該段改以牆鐘陳述,並明載 runner 變異 42%、
單次量測不足以歸因。

---

## 需人工裁決

1. **系統視角的 P1「ci.yml 檔頭 156 應改為 155」——主 session 複驗後認定不成立,
   未執行,列此供覆核。** 證據:當前樹 `test_overflow_sweep.py` 有 **21** 條
   `SweepRoute`(develop 於本任務期間新增一條系統告警路由),`pytest --collect-only`
   實測 **156 tests collected**,完整跑 **156 passed**。該視角依 20 條路由推算得
   155,且其引述的「第 402 行寫 173 → 155」在 `6f91471` 已修正——推測其讀到的是
   rebase 前的樹。**需求視角獨立查證後同樣確認 156 屬實**。依聚合規則不得逕行
   改判,故原樣呈報並附反證。
2. **架構視角的 P1-3 被主 session 降級為「已處置」**(理由見上:該 commit 訊息
   body 實際已載明 README 升級)。依聚合規則,降級須列此供覆核。
3. **UI/UX 視角提出的 a11y 觀察**已在 P1-2 處置,無殘留。

---

## 處置(人審後填寫)

- [ ] 覆核「需人工裁決」第 1 項:156 vs 155 的認定
- [ ] 覆核「需人工裁決」第 2 項:P1-3 降級是否恰當
- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過 □ 退回

## 附:本次審查的方法論限制(誠實記錄)

四個 reviewer 中有三個回報**沒有 Bash 權限**,無法實際執行
`git diff origin/develop...HEAD`,改以「讀取現況檔案 + 對照 plan 表格」
或「從 `.git/logs/HEAD` 重建 commit 序列」反推。這個方法對「現在長什麼樣」
可靠,對「哪一行是這次改的」只能間接推論——**上面第 1、2 項的分歧都源於此**。

**通則:未來派實作審查時,應在 prompt 內直接附上 diff 內容**(或確認
reviewer 有 Bash),否則會系統性產生「讀到舊狀態」這類假發現,消耗覆核成本。
本次已把 e2e 部分的 diff 另存成檔並在 prompt 指路,但仍不足——三個視角
都沒有實際讀取那個檔案。
