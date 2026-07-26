# 註冊姓名格式防呆 實作審查報告

<!-- 由 /review-implementation 彙整四個 reviewer subagent 對實作 diff 的發現。
     輸出契約與聚合規則見 docs/_templates/review.md,不在此重複。 -->

審查對象:`claude/id-name-validation-safeguard-dkfahy` 相對 `origin/develop` 的
完整 diff(22 檔、+1410/-81)。規劃書 v4、三輪規劃審查、progress.md 一併提供。

## 審查結論

| 視角 | P0 | P1 | P2 | 需人工裁決 |
|---|---|---|---|---|
| 系統 | **1** | 1 | 1 | 0 |
| 架構 | 0 | 1 | 1 | 0 |
| UI/UX | 0 | 1 | 3 | 0 |
| 需求 | 0 | 1 | 1 | 1 |
| **去重後** | **1** | **4** | **6** | **1** |

**系統視角找到 1 個 P0(已修),其餘三個視角 0 個 P0。** 三個視角都獨立確認「沒有規劃講 A、實作做 B 的正面
牴觸」;需求視角另指出程式碼註解幾乎每個決策都能對回 plan/review 的具體段落,
可追溯性良好。

**特別值得記錄**:架構視角逐行核對 `handle_new_user()` 與基準版本
`20260620000009` 全文,確認除姓名那一行外**逐字相符**——這是三輪規劃審查中被
列為 P0/P1 級最多次的項目。需求視角則指出 plan §1「不做」清單不只被遵守,還
主動寫了兩支 characterization 測試釘住邊界(`phone` 仍可直寫、`phone`/
`national_id` 仍從 metadata 帶入),精確對應 plan 原文「避免下一個讀者以為
改完這支函式就把資安面清乾淨了」的顧慮。

## 發現與處置

### P0

`[P0]〔e2e/journey/tools/zh_names.py〕`**journey 姓名產生器在真實 CI 參數下會讓
同一次 run 的 30 個節點全部同名**,而新增的防護測試測不到。原實作把
`run_id`+`node` 串接後**整體**截到 10 字,`run_id` 排在前面;真實 CI 用
`JOURNEY_RUN_ID: gh${github.run_id}`(`journey.yml:190`),GitHub run id 目前是
10 位以上數字,加 `gh` 前綴已超過上限——**截斷後 `node` 完全被切掉**。journey
有大量步驟以 `get_by_text(users[node].name, exact=True)` 認人
(`f20_referral_rewards_steps.py`、`f60_time_scenarios_steps.py`),30 人同名會
認錯人或撞上 Playwright strict-mode 多重匹配錯誤。而新測試用 `run_id="a1b2"`
(4 字元)驗證,永遠踩不進截斷區間,**提供假的保護感**。這是本次 diff 直接
引進的迴歸(舊版 `f"測試{run_id}{node}"` 不截斷,天生不會撞名)。
→ **已修**:改為「截斷只發生在 run_id 段、node 永遠保留」,並取 run_id 的
**尾段**(`gh<遞增數字>` 前幾碼在同一天幾乎相同,尾碼區辨力高)。測試改用
`gh30182175581`/`gh9999999999999` 等真實形狀樣本,並新增
`test_node_的字元永遠不被截斷`。**實測對照**:真實 run_id 下舊實作 6 個節點
相異數 1/6、新實作 6/6。

### P1

`[P1]〔架構邊界〕`Deno 側測試以 `../../../src/utils/nameValidationCases.ts`
跨界引用前端檔案,牴觸 `.claude/rules/supabase-functions.md` 明文的
「Deno runtime 與前端 node/vite 世界完全隔離」。方向也與唯一的既有跨 runtime
共用前例**相反**:`supabase/functions/_shared/api-contract.ts` 是物理放在
Deno 側、前端經 `@contract` alias 讀入,這次卻是共用檔放前端、Deno 用三層
`../../../` 反向爬。且該 import 因 jsr.io 被封從未被 `deno check` 實跑過,
而 progress.md 對 TDD 鎖的變通有清楚記錄取捨、對這件事卻沒有,標準不一致。
→ **已處置**(`a3e4ded`):搬到
`supabase/functions/_shared/name-validation-cases.ts`,新增 `@name-cases`
alias(vite.config.ts + tsconfig.json paths/include),與 `@contract` 同構。

`[P1]〔需求 / 文件生命週期〕`plan §6 的兩項未結清查證(`HAN_RANGE` 缺字族群
規模、純羅馬拼音登記姓名的分隔慣例)**只存在於 `docs/plans/`,而下一步就是
刪掉它**——規格書 §14 與 friction-log 都沒有蹤跡。一旦規劃目錄被清,這個
「可能誤擋受《姓名條例》保護之原住民命名權」的已知風險會從任何未來讀者查得到
的地方消失,只留下看起來像完備設計的程式碼。另外 plan §2.3 承諾「風險成立需
比照間隔號給出逃生口(最低限度:錯誤訊息引導聯繫客服)」,查證未做、後備也
未觸發。→ **已處置**(`a3e4ded`):兩項風險升級進規格書 §14 第 5 列;並補上
針對性逃生口——缺字字元既非拉丁字母也非數字,以此偵測後回
「此姓名可能含系統未支援的罕用字,請聯繫客服協助」,不再拿「姓名須為中文字」
去誤導一個明明在打中文的人。

`[P1]〔UI/UX〕`plan §4 明訂中文模式字元錯誤訊息要拆兩個 `<p>` 提升 375px
掃讀性,實作合併成單一字串,且 progress.md 的階段 4/5 只有狀態列、沒有
「做了什麼」段落可查這是否為刻意取捨——依契約,未記錄的偏離至少 P1。
→ **已處置**(`a3e4ded`):`FieldError` 改為將含 `\n` 的訊息渲染成多個 `<p>`
(單句訊息行為不變),`validateName` 的中文模式訊息以 `\n` 分隔兩句。

### P2

`[P2]〔UI/UX 觸控目標〕`切換鈕實際高度約 32px(`py-1.5` + `text-sm`),低於
專案兩個同類元件的既有慣例(`HomeViewToggle` 的 `h-9`=36px、`FilterChip` 的
`min-h-10`=40px,後者註解明寫「符合行動裝置最小可點面積」),更低於
`docs/ui-ux-guidelines.md` §1 的 44px 目標——而這顆控制項正落在規劃自陳
「註冊是營收入口」的流程上。→ **已處置**:改為
`min-h-10 pointer-coarse:min-h-[44px]`。

`[P2]〔UI/UX a11y〕`分隔符號自動轉換的可見提示沒有 `aria-live`,螢幕報讀器
使用者在輸入當下不會被告知系統已把他的姓名改掉——而那正是本功能特別要服務的
族群(原住民漢字音譯姓名)。→ **已處置**:加 `aria-live="polite"`。

`[P2]〔UI/UX 測試覆蓋〕`計數器警示色與 `getInputAriaProps` 接線都做對了但沒有
斷言釘住,日後誤刪會靜默通過。→ **已處置**:各補一條斷言(共 3 條,含缺字
出口那條)。

`[P2]〔系統 / progress.md〕`「階段 1 做了什麼」仍描述共用案例表的舊路徑
`src/utils/nameValidationCases.ts`(檔案已搬走)。progress.md 是明訂「寫給完全
沒有對話記憶的下一個 session 看」的外部記憶,路徑過期會讓人白找。
→ **已處置**:更新為實際位置並補記 alias 設計與「探針必須用 `\u` 跳脫」的理由。

`[P1]〔系統 / supabase/functions/_shared/name-validation-cases.ts〕`共用案例表的
「相容表意文字下界」探針**名不符實、完全失能**:字面「豈」實際儲存的是
**U+8C48**(被編輯器/git NFC 正規化成同形字),不是註解宣稱要測的 U+F900
——與 `index.ts` 的 `HAN_RANGE` 註解記載的**同一起事故**如出一轍,只是這次
發生在測試資料而非正規表示式。U+8C48 本就落在主範圍 `\u3400-\u9FFF` 內,
所以這個案例無論如何都會通過,**`\uF900-\uFAFF` 那段從來沒被測到**——日後
若有人把該子範圍打錯或砍掉,前後端共用這份案例表的所有測試仍會全綠。
→ **已修**:兩個邊界探針都改用顯式跳脫(`'\u3400\u3400'`、`'\uF900\uF900'`)。
**實測對照**:砍掉 `\uF900-\uFAFF` 後,新探針會紅、舊探針仍綠。

`[P2]〔架構 / 需求(兩視角獨立提出)〕`journey 的第三份 `HAN_RANGE` 複製品用
**字面漢字**而非 `\uXXXX` 跳脫——`index.ts` 該常數上方的註解記載過一次真實
事故:字面「豈」(U+F900)曾被編輯器 NFC 正規化成同形的 U+8C48,導致範圍尾端
悄悄涵蓋全部 surrogate、把端點打成 500。在同一支 diff 裡、緊鄰剛記取這個教訓的
另外兩份複製品旁邊重新引入同一種暴露面。→ **已處置**:改用跳脫寫法。

## 處置過程中自己抓到的一個真 bug(不在任何 reviewer 的清單裡)

寫「缺字走客服出口」那條測試時發現:分隔符號判定原本寫成
「非漢字、非英文字母、非數字、非半形空格就當標點」——**太寬**。缺字字元
(擴充 B 區以上、造字區)不在 `HAN_RANGE` 也不是英數,於是在表單的**主動轉換**
路徑上被整串換成空格:缺字姓名會被靜默毀掉,比被拒還糟;驗證路徑上也會給出
文不對題的「請改用半形空格分隔」。

→ 改用 Unicode 類別 `[\p{P}\p{Z}]`(標點與分隔符,半形空格除外)精準鎖定,
前後端同步。原本靠「反向定義白名單」的寫法在 code review 讀起來完全合理,
是那條新測試把它逼出來的。

## 無缺口面向(逐視角摘要)

- **架構**:`HAN_RANGE` 三常數搬遷完整(grep 確認單一宣告,`maskNameByGen`
  與 `sortNodeIds` 都引用同一份,regex 字面值逐字未變);
  `ProfileDraft`/`ProfileFormValues`/`EMPTY_FORM` 三個平行型別皆已同步
  (另檢出第四個相似型別 `FunnelProfile` 僅供路由守衛判空,合理不需要);
  `run_state.py` 的 `from tools.zh_names import` 與 `conftest.py` 的
  `sys.path.insert` 及既有慣例一致;migration 遵守既定寫法;`appShell` 契約
  未被觸及;測試檔名分層符合 T4。
- **UI/UX**:資訊架構/`BottomNav` 契約、三態完備、segmented control 核心決策
  (`role="group"` + 原生 `<button>` + `aria-pressed` + 可見文字標籤 + 當前態
  浮起)、確認框合併文案與旗標三處重置、後台 `IdCardDialog` 提示的位置與措辭、
  `getInputAriaProps` 接線正確性。
- **系統**:資料流完整性(每一跳都有定義;`GET /profile` 不遮罩 `name` 是正確的,
  故 `PUT` 的遮罩防呆清單不含 `name` 並非遺漏)、API 契約(兩端點的觸發條件與
  型別防禦皆有測試覆蓋)、資料庫(逐行確認 migration 的唯一差異;`revoke
  update (name)` 精準到單欄不影響其餘五欄;RLS 不受影響;加法優先)、外部整合、
  multi-step-flow 四契約、其餘邊界條件(空值、長度邊界、code point 計數與
  `maxLength` 交互、正則無 catastrophic backtracking)。另逐一核對三支新 Deno
  測試的 API 用法與既有慣例一致、斷言具辨別力,並確認 `createTestUser` 改寫
  未破壞既有 37 檔/132 處呼叫(唯一接觸 `PUT /auth/profile` 的既有測試不送
  `name` 鍵,不會被新驗證攔到)。
- **需求**:PM 原始問題確實被解決(三層堵住寫入路徑);**人審五項裁決全數
  忠實落地**(逐項核實);規格書 §4.2 更新準確無誇大;journey 姓名產生器不影響
  任何既有 UI 斷言(逐一檢查所有 `.name` 使用點皆為精確文字比對);plan §1
  「不做」清單嚴格遵守;業務規則 §5–§10 不受影響。

## 需人工裁決

`〔需人工裁決〕``HAN_RANGE` 缺字族群規模與純羅馬拼音登記姓名的分隔慣例是否
真的存在會被誤擋的族群——這是 plan 從 v1 到 v4 一路標記「reviewer 環境無法
查證」的原始開放問題,本次審查同樣無新資訊。**風險已升級進規格書 §14 承接,
並補上客服逃生口**,但族群規模的實際查證仍是獨立、需要營運資料的動作。

## 已知的驗證強度落差(非審查發現,實作期自陳)

階段 2、3 是後端,本環境出口封鎖 `jsr.io` 與 `npm.jsr.io`(皆 403),
`deno check` 與 `deno task test:unit` 都跑不了,**紅綠燈未經實跑**。替代驗證:
把 `index.ts` 的常數與函式本體抽成獨立 deno 腳本(不含 supabase-js import)
對共用案例表跑一遍——實作版全過、退回 stub 則 26 條斷言失敗,證明規則邏輯
正確且測試有辨別力。`deno fmt`/`deno lint` 在本機綠。真訊號來自 CI 的 unit
與 api-tests 兩軌。階段 1、4、5 皆本機實測綠燈,階段 4 另有真瀏覽器 375px
截圖驗證。

## 處置結論

- [x] P0 一項(journey 姓名撞名)已修,並附實測對照證明修正有效
- [x] P1 四項全數修掉
- [x] P2 六項全數修掉
- [x] 需人工裁決一項:風險已升級進規格書 §14,查證動作留給營運
