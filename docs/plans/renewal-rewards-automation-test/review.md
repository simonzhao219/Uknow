# renewal-rewards-automation-test 規劃書審查報告

聚合規則(`docs/_templates/review.md`):只彙整、去重、排序,不改判;
降級/剔除一律列「需人工裁決」附理由。

---

# 第 1 輪審查(plan.md 第 1 版,2026-08-03)

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向(摘) |
|---|---|---|---|---|
| 系統 | 0 | 5 | 2 | 冪等鍵/RLS/cleanup 覆蓋皆屬實;ch1/2/3/6/8/9 機制核對與 migration 逐一一致 |
| 架構 | 1 | 3 | 1 | 檔名/編號慣例、字母序執行順序、cleanup RESIDUE_TABLES、規則編號可查證、既有覆蓋聲稱屬實、另一包邊界正確 |
| UI/UX | 0 | 2 | 2 | Q9 文案逐字命中、A14/A15 testid 齊全、補繳進度雙落點、分類軸註記、任務 1/8、credit 被擋、退件流程、BottomNav、a11y |
| 需求 | 0 | 2 | 3 | 需求溯源全可回溯;M2 三路徑/M3 五情境/M5 五子行為全掛載;業務數字可回溯;擺放決策成立 |

**去重後:P0 × 1、P1 × 12、P2 × 7**(admin 演員一項系統判 P1、UIUX 判
P2,依「不改判」取原判較重的 P1 合併計)。

## P0(阻擋)

**[P0]〔§5 階段切分〕階段 2–5 的紅綠驗證建立在不存在的 CI 輸入上**〔架構〕
`journey.yml`/`journey-scheduled.yml` 的 `workflow_dispatch.inputs` 只有
`scope` 與 `payment_mode`,**沒有 `feature_filter`(也沒有 `reuse_tree`)**
——那只存在於 `docs/e2e-journey-test-design.md` §11.5 的設計文字,從未
落地。照字面執行,每次迭代要嘛跑全套 30–35 分、要嘛跑不到單一 feature。
→ 前置子任務:新增 pytest marker(登記 `pytest.ini`)+ `journey.yml` 加
可選 pytest 表達式輸入;或明講每迭代吃全套成本並反映進開放問題 #5。

## P1(去重後 12 條)

1. **〔§2.2 ch4〕漏斷言 U2 收到的獎勵/任務**〔系統〕K0 fresh 填 U2 碼是
   U2 的「首次配對」——`apply_referral_side_effects` Block B 必發
   U2 gen1 +100 且任務 +1;章節表只寫了 K0 側。→ 補「U2 +100(gen1)、
   任務 1/8」。
2. **〔§2.2 ch7〕S9 fresh 付款本身也是延展事件**〔系統〕M6 每筆事件都發
   → U2 應再收 gen1 +100(任務不 +1,pair-history 已配對)。章節表漏列,
   終章對帳會漏算。
3. **〔§2.2 ch8〕兩個獨立事件各發一輪獎**〔系統〕「補繳恢復 active」
   (`subscription_id` 鍵)與「領取 credit」(`source_claim_id` 鍵)不互相
   去重 → U2 應 +200 不是 +100。
4. **〔§2.3〕`age_monthly_bucket` 月鍵推算風險**〔系統〕production 月鍵
   一律 `Asia/Taipei` 'YYYY-MM';Python 側若自行用 UTC/本地時間推算,對
   不存在的 key 平移是靜默 no-op,Q14a 假綠會換個地方復發。→ 原語直接
   讀該使用者 `monthly_referrals` 現有 key 並對其平移,不自行推算。
5. **〔§2.1〕admin 演員未宣告**〔系統 P1+UIUX P2 合併〕ch6「admin 駁回」
   需真登入的管理員走 GUI(且該動作被誤置於斷言欄)。既有
   `管理員帳號已完成 bootstrap` Given(`steps/conftest.py` ensure_admin)
   可重用。→ §2.1 補 admin 演員與 Background 引用;嚴禁 service-role 直改
   `withdrawals.status` 抄捷徑。
6. **〔§2.1〕獨立 cast 與 `orgchart.py::load_nodes()` 單根不變量衝突**
   〔架構〕U1/U2 皆無上線 = 雙根,照既有格式載入直接 `ValueError`。
   → 明講 saga 用自己的載入邏輯;「共用既有 builder」收斂為只共用
   registration/payment 層。
7. **〔§5 階段 1〕「三原語 pytest tools/ 綠」過度宣稱**〔架構〕DB 寫入
   原語離線驗不到,只有日期/月鍵純函式可。→ 措辭收斂,DB 行為留給
   階段 2+ dispatch。
8. **〔§7〕`@quarantine` 機制未實作**〔架構〕全庫零命中,把沒蓋好的
   安全網當「既有」。→ 回滾改「人工以 marker 排除」或先落地 quarantine。
9. **〔§2.2 ch2/ch5〕gen3 走訪深度全劇本從未被斷言**〔需求〕K0 自身事件
   鏈深只有 2;W1/W2 首購鏈深達 3 但沒斷言 P 的 gen3;「M6×M4/M5 組合」
   (fresh 改樹後三代仍正確)全空白。→ 加一名 W 系下線讓改樹後首購鏈深
   達 3(gen3 落在 saga 自有演員),或補 P 的 gen3 斷言。
10. **〔§6 #2〕三個「另一包」核對點併一題,其二沒有情境可掛載**〔需求〕
    「換回歸位」「跳過空缺不遞補」在十章裡沒有任何情境——不是二選一,
    是選項背後沒有情境。→ 拆開;或加「K0 fresh 填回 U1」章節。
11. **〔§2.2 ch1/ch9〕`is_default` 無任何 UI 落點**〔UIUX〕grep 全 src
    無渲染;「上代=P」可走 admin 查詢台 GUI,`is_default` 只能 DB 直查。
    → 章節表標注該子句走 DB,非 GUI 斷言。
12. **〔§2.2 ch8〕「訂閱列數不變」是 DB 斷言**〔UIUX〕UI 只顯示迄日。
    → 拆成 GUI(迄日)與 DB(列數)兩句並標注。

## P2(去重後 7 條)

1. 〔§2.2 ch6→ch7〕K0「仍過期」是跨章隱性依賴(ch6 推入、被 Q9 擋下
   未消耗)→ 章節表明講,防止被「順手復原」斷鏈〔系統〕。
2. 〔§2.1〕P 是跨 feature 共用 fixture,ch1/ch9 持續往 P 疊資料;未來
   要斷言 P 精確值需考慮跨 feature 疊加(本包用 delta 斷言即可)〔系統〕。
3. 〔§3〕文件同步清單漏 `e2e-journey-test-design.md` §7(時光機原語)
   與 §11(CI 預算)〔架構〕。
4. 〔§2.2〕`ledger_reset` 應併記畫面字樣「新約重置」
   (`rewardHistoryFilter.ts:33`),避免對著 enum 值找選擇器〔UIUX〕。
5. 〔§2.2〕A12/A14/A15 標籤在 rules.md 未定義(只到 A11),原始定義已隨
   renewal-backfill 規劃檔清理 → 附錄補一行索引〔需求〕。
6. 〔§1〕M1「active 期間不能付款」負向路徑未斷言也未列不做+理由
   → 補排除句與涵蓋落點,或加一格廉價 GUI 斷言〔需求〕。
7. 〔§6 #3/#4〕「種」的取捨沒講白犧牲了什麼:選種 = 不再重演該段的
   GUI 起源,只驗下游連動 → 敘述補全再讓人二選一〔需求〕。

## 需人工裁決

- **abe5b25「journey 三檔反轉」先例的可查證性**〔架構〕:reviewer 於
  工作樹 grep 不到「反轉」。聚合者補證據(非改判):`git show abe5b25`
  存在,commit message 即「journey 三檔反轉(階段 13)」——先例屬實,
  引用成立。
- **gen3 缺口(P1-9)與「換回歸位」情境(P1-10)的規模取捨**〔需求〕:
  加 1 名 cast/1 個章節 vs 接受深度並誠實記錄限制。
- 開放問題 #1–#6 本身(規劃書已列,審查不重複判定);#1 的人工核對範圍
  應納入本輪新發現的 U2 獎勵缺口(P1-1/2/3)——同屬「原始例子是否本來
  就涵蓋」。

## 處置(人審後填寫)

聚合者處置(依 SOP「有 P0 → 修訂規劃後重跑」):plan.md 已修訂為第 2 版,
處置 P0(新增階段 0:pytest marker + workflow 輸入)與事實性 P1/P2;
規模取捨與開放問題仍留人審。第 2 輪審查見下。

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
