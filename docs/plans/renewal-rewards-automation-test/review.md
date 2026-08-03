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

## 第 1 輪處置

聚合者處置(依 SOP「有 P0 → 修訂規劃後重跑」):plan.md 修訂為第 2 版,
處置 P0(新增階段 0:pytest marker + workflow 輸入)與事實性 P1/P2;
規模取捨與開放問題留人審。第 2 輪審查(needs 第 2 版)確認:12 條 P1 +
7 條 P2 全數忠實處置,無偷加碼/偷縮水〔需求視角逐項核實〕。

---

# 第 2 輪審查(plan.md 第 2 版,2026-08-03;聚焦第 2 版新增/修改範圍)

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向(摘) |
|---|---|---|---|---|
| 系統 | 0 | 1 | 2 | 其餘三代鏈逐筆手算與 migration 一致(含 ch1 P+300、X1 gen3、ch8 雙鍵雙發獎);M8 平移後 pair-history 判定成立;admin 駁回退款+A16 守衛機制屬實 |
| 架構 | 0 | 2 | 2 | 小型載入器有 f60 先例;guarded_page 安全網與 org_builder 無關;命名慣例;github-actions 規則相容 |
| UI/UX | 0 | 3 | 0 | BottomNav/a11y/viewport(消費頁面無 isDesktop 條件渲染)/模式一致性 |
| 需求 | 1 | 2 | 2 | 第 1 輪處置忠實無縮水;M2/M3/M5/M7/M8 覆蓋;六年時間軸五關鍵點全掛載或已列開放問題;ensure_admin 與退件免鎖查證屬實 |

**去重後:P0 × 1、P1 × 6、P2 × 6**(journey.yml floor/MARKER 問題需求判
P0、架構判 P1,同一發現依「不改判」取較重的 P0 合併計)。

## P0(阻擋)

**[P0]〔§2.4/§5 階段 0〕`pytest_expr` 窄選會被 journey.yml 既有防線判定
「未執行」而必然紅**〔需求 P0+架構 P1 合併〕
`MARKER` 計算只認 `SCOPE=skeleton`;「斷言 journey 真的跑了」的 floor 只有
`MIN_SKELETON=1`/`MIN_FULL=20` 兩態——窄選(~10 個情境)遠低於 20,會被
2026-07-21 假綠事故後加的防線誤殺;`scope=skeleton` 又強制 `-m skeleton`
與 `pytest_expr` 互斥。階段 0 自身驗收標準與階段 2–5 的全部 dispatch 紅綠
都建立在這之上。`check-workflows.py` 不查此語意。
→ 階段 0 必須連動修改 MARKER 與 floor 兩段(第三態:`pytest_expr` 非空時
低 floor);具體修法(改本體邏輯 vs 另立 scope 值)留階段 0 內定案。

## P1(去重後 6 條)

1. **〔§2.2 ch1〕active 開付款頁的真實 GUI 訊號是被靜默導回 `/dashboard`**
   〔UIUX〕`resolveCheckoutPageRedirect`(`registrationFlow.ts:146-158`)
   導向,無「已有有效訂閱」頁面文案(那是後端錯誤訊息,不渲染於此路徑)
   → 斷言改 URL+「訂閱中」徽章。
2. **〔§2.2〕非 K0 演員的「任務 X/8」無 admin GUI 落點**〔UIUX〕
   `AdminMemberDetailSchema` 無任務欄位 → 明訂機制:該演員本人登入任務頁
   斷言(journey 常態)或標【DB】;登入切換成本入預算。
3. **〔§2.1/§2.3〕「上代=P」名稱比對缺 P 身分解析原語**〔UIUX〕A12 只回
   三態 enum → 新增 `resolve_default_referrer_identity()`。
4. **〔§2.2 ch7〕W2 補繳事件漏 U2 +100(gen2)**〔系統〕ch5 同鏈已正確
   列出,ch7 漏——第 1 輪同型缺口在新內容復發;終章 U2 推導值會少 100。
5. **〔§2.2〕M1「失效上線仍照收獎/任務照計」通篇未觸發**〔需求〕U1/U2
   收獎時刻全程 active → ch3 佈置加「U1 推入剛過期」,斷言 U1 expired
   仍入帳;或明講由單元測試覆蓋(沉默不可接受)。
6. **〔§6〕rules.md 核對點「B 樹時期招的下線永屬 B 樹」未被斷言也未列
   開放問題**〔需求〕需 K0 二次換線+M4 才可驗 → 併入 #2 系列(#2c)。

## P2(去重後 6 條)

1. 〔§7〕回滾 `-m 'not renewal_saga'` 會蓋掉 ini 的 `-m "not seed"`
   (後出現者勝),90_ seed 情境會被放進來白燒 CI → 寫成
   `-m 'not seed and not renewal_saga'`〔架構〕。
2. 〔§3〕文件同步須含**訂正** `e2e-journey-test-design.md` §11.5 的過時
   敘述(`feature_filter`/`reuse_tree`/`journey-nightly.yml`——第 1 輪
   P0 的誤導源)〔架構,原判 P1;聚合按內容歸入文件同步項,severity
   依原判記 P1,列此處僅為分組,不降級〕。
3. 〔§3〕「journey-smoke」不存在(ci.yml 只有 journey-offline 與
   base=main 的 journey-full)→ 敘述修正〔需求〕。
4. 〔§3〕A14/A15/補繳循環的 page object 方法零先例,是新寫非「共用既有」
   → 措辭修正,反映階段 3 工作量〔架構〕。
5. 〔§2.3〕`age_monthly_bucket` 目的地 key 已有資料時未定義語意——跨月
   run 整把覆寫會靜默打穿 M8 → 規格明訂 append 合併〔系統〕。
6. 〔§2.2 ch6〕動作欄缺「駁回後再開付款頁複驗」一格〔系統〕。

## 需人工裁決

- P0 的修法取捨(改 journey.yml 本體邏輯 vs 另立第三個 scope 值):實作
  期設計決定,規劃書已標記「階段 0 連動修改」即可,不必規劃期定案
  〔需求視角建議〕。
- P1-2 的通道選擇(演員本人登入 vs 標【DB】)牽動預算,與開放問題 #5
  一併裁決〔UIUX 視角建議〕;第 3 版已採「演員本人登入」為預設並調升
  預算估計至 +10–15 分,人審可改判。
- 聚合分組說明:P2 清單第 2 項原判 P1(架構),因與 P2 第 3 項同屬
  §3 敘述/文件同步修正而併組陳列,**severity 不變仍計 P1**——如需嚴格
  分列,P1 總數為 6、P2 為 5。

## 第 2 輪處置

聚合者處置:plan.md 修訂為第 3 版——P0(階段 0 範圍擴充:MARKER/floor
連動修改+60_ 實測驗收)、P1 六條(ch1 導向斷言、任務斷言通道約定、
P 身分解析原語、ch7 U2 gen2、ch3 U1 expired 收獎、#2c)、P2 六條全數
處置。規模取捨與開放問題 #1–#6 仍留人審。

---

# 第 3 輪(針對性覆核,plan.md 第 3 版,2026-08-03)

範圍說明(聚合者):第 2 輪唯一 P0 為 CI 邏輯連動問題,屬純架構面;
第 3 輪僅派架構視角覆核該 P0 的處置,未重審全書——如人審認為需要完整
第 3 輪四視角,請退回指示。

**結論:P0 已充分處置**——§2.4/§5 階段 0 精確對應 journey.yml 兩段
邏輯(MARKER 行 313-314、floor 行 344),第三態設計可行、兩軌行為不變,
`journey-scheduled.yml` 轉發鏈一併涵蓋;60_ 的 `timemachine` marker 是
真實可重跑的驗收 canary。三條施工提醒(CLI `-m` 蓋掉 `not seed`、narrow
dispatch 的 scope 搭配、input 型別)已回填 plan.md §2.4。

## 總結(供人審)

- 第 1 輪:P0×1、P1×12、P2×7 → 第 2 版全數處置(第 2 輪確認忠實)。
- 第 2 輪:P0×1、P1×6、P2×6 → 第 3 版全數處置(第 3 輪覆核 P0 通過)。
- **餘留人審事項**:開放問題 #1(重建時間軸 vs 原始例子)、#2a/#2b/#2c
  (「另一包」核對點的處理策略)、#3/#4(種 vs 真建置)、#5(nightly
  預算 +10–15 分)、#6(分支/slug);以及第 2 輪「需人工裁決」節的
  聚合分組說明。

## 處置(人審後填寫)

- [ ] 人審完成,裁決:□ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃
