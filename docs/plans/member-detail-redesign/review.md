# 會員詳情 Sheet 分區重設計（S4／A3）規劃書審查報告

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

審查對象：`./plan.md`（規劃初版，rebase 後 commit `9978b04`）。四個 fresh-context reviewer 平行審查，主 session 只彙整、
去重、排序，**不改判**（severity 以 reviewer 原判為準；跨視角重複的發現取最高嚴重度並列出所有來源）。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 4 | 5 | API 契約與 DB 錯誤路徑、元件卸載、斷點切換、`pendingPoints` 語意、`idRejectReason` 條件、定位器契約、多步驟流程（不適用） |
| 架構 | 0 | 1 | 9 | appShell／lazy 路由、§11 指向（前提：型別不搬）、`useMediaQuery` 擇一渲染、現況宣稱抽查、plans-keep、測試命名 |
| UI/UX | 0 | 5 | 10（reviewer 自計 11，清單實列 10） | 資訊架構、管理區三分法對應、敏感資料標題、heading 結構、空態與載入態、`--raised` 與寬度約束 |
| 需求 | 0 | 2 | 10 | 需求溯源（無腦補）、覆蓋完整性（八條皆有交代）、業務規則 §7–§10 未碰 |

**P0：無。** 去重後 P1 共 10 項、P2 共 23 項（下表）。主 session 已查證兩項關鍵事實：(1) `construction-plan.md:402-403`
的 S7 prompt 確實已寫「待查收徽章在 admin 與會員兩處統一 warning（遺留事項最後一條就此結案）」；(2) 規格書 §5.2
與 `RequireMembershipRoute.tsx` 的 `suspendedBlocked` 確實硬鎖停權會員的會員區，與暫停確認框文案「會員區瀏覽不受影響」矛盾。

## 發現清單（依嚴重度）

### P1

1. [P1]〔§2 缺欄位、§4.1 近期提領〕尾註「完整記錄請到提領管理用姓名搜尋」指向不存在的功能——`WithdrawalManagement` 工具列只有狀態 Select，`search` 只在型別與後端；且「滿 10 筆」分不出剛好 10 筆與被截斷 → 尾註只講事實（「最多列出最近 10 筆」），10 用具名常數並註明出處 `20260802000008_admin_member_detail.sql`；遺留記「UI 看不到單一會員完整提領史」。〔系統 P1、UI/UX P1-3、需求 P1-2〕
2. [P1]〔§2 競態、§3 `openingId`、§4.4、§5 階段 1〕單一 `openingId` 與 Q5-A「A 鈕轉圈停用、他列可點」矛盾：點 B 後 A 立刻恢復可按、A 的結算會清掉 B 的轉圈；過期回應是否寫 `actionError`／`openingId` 未定義 → 明定狀態形狀（在途集合 `Set<string>` 或單值＋全停用）與「過期回應不得動 `detailFor`／`actionError`／`openingId`」；階段 1 補 A→B（B 先回、A 後 reject）、A→B→A 測試。〔系統 P1（含 Q5 文字與設計不符）；架構 P2、UI/UX P2-9、需求 P2-1 同指〕
3. [P1]〔§2 競態、§3〕〔需人工裁決〕序號只涵蓋「查看」，`runAction` 的重讀 `setDetailFor(await loadMemberDetail())`（`MemberManagement.tsx:220`）無守衛：處理中關掉 Sheet，重讀回來會把 Sheet 重開；關閉後開 B，A 的重讀晚到會把 B 換成 A。修它要動執行器的重讀那一行（不動確認規則與文案）→ A：序號＋清除收成單一 helper，onClose 作廢、重讀回來序號不同就丟棄（含 panelError）；B：不動執行器、記遺留。〔系統 P1；架構 P2、UI/UX P2-9 同指〕
4. [P1]〔§4.3 錯誤、§4.4〕取詳情失敗的 `actionError` 畫在列表上方，手機上捲到第 N 列時在視窗外，使用者只看到鈕停轉——正是 A3 要消除的「按了沒反應」→ 失敗時 `scrollIntoView`＋聚焦 callout（或就近 Toast，§6），階段 1 驗收補一條。〔系統 P1、UI/UX P2-8〕
5. [P1]〔§6 Q2、§8、§3〕〔需人工裁決〕Q2 漏看母計畫已定案：construction-plan S7 prompt (4)「待查收徽章在 admin 與會員兩處統一 warning（遺留事項最後一條就此結案）」，Q2-A（結案為依受眾刻意不同）與 Q2-B（後台拉成 secondary）都與之衝突 → 重寫 Q2：S4 只做「會員詳情用同源 Badge、後台待查收維持 warning」，遺留由 S7 把會員端改 warning 時結案；請業主確認仍採 S7(4)。〔需求 P1-1；UI/UX P2-13 補充：兩端另有「已完成」variant 與「待處理／處理中、已退件／已拒絕」標籤差異〕
6. [P1]〔§3 架構影響〕身分卡要沿用 `ACCOUNT_STATUS_BADGE`，但子元件 props（detail／processing／panelError／onRequestAction／onClose）沒有管道送進去；已暫停＝destructive、管理員＝default 現在在 `MemberCardList.tsx:51-52` 與桌機表格 `MemberManagement.tsx:604-615` 各手刻一份，身分卡會是第三份 → props 明列 `accountBadge`（比照 `MemberCardList`），或把 Badge 表搬到共用模組讓三處共用；並規定徽章順序「異常在前」＋`flex-wrap`。〔架構 P1、UI/UX P2-12〕
7. [P1]〔§4.5、SheetContent 捲動結構〕`SheetContent` 自帶 `overflow-y-auto`（`MemberManagement.tsx:285`），`absolute` 的關閉鈕會隨內容捲走；分區後 Sheet 變長，375px 全螢幕無 overlay 可點，做完管理動作後得捲回頂端才能關 → 比照 `HomePage.tsx:563`／`ReferralTreeView.tsx:695`：`SheetContent` 去 `overflow-y-auto`、`gap-0`，內層 `min-h-0 flex-1 overflow-y-auto px-4 pb-6`。〔UI/UX P1-1；身分卡是否一併釘住〔需人工裁決〕〕
8. [P1]〔§4.5(b)〕關閉鈕實占右緣約 12–62px（`right-3`＋`p-3`＋`size-6`＋1px 框），`pr-14`（56px）仍重疊 4–6px，長姓名末字被蓋；Email 行也落在關閉鈕垂直範圍 → 改 `pr-16` 以上，並用 e2e 量測（`SheetTitle` 右緣 ≤ 關閉鈕左緣）驗證，不靠目視。〔UI/UX P1-2、架構 P2〕
9. [P1]〔§5 階段 2 e2e、§7(3)〕e2e 斷言對本次修的內容沒有失敗機會：mock 是短姓名、短 Email、`recentWithdrawals: []`，「左右間距 0」「scrollWidth ≤ clientWidth」在現行碼就綠；`px-4` 與關閉鈕避讓沒有自動斷言；`get_by_role("heading", name=…)` 預設子字串比對（「管理」「帳號」需 `exact=True`）→ 補最壞資料夾具（無空白長 Email、長姓名、10 筆提領含長退件 note 與待查收、證件退回長理由、停權＋管理員），加兩條量測（分區標題 left ≥ 8px；標題右緣 ≤ 關閉鈕左緣），`test_overflow_sweep` 的 Sheet 路由改吃同一夾具。系統補：mock 由 `suspendedAt` 推導 `suspended`、`idRejectReason` 只在 rejected 非 null；`_setup_admin` 兩位會員同 id `mem-admin-1`（`openingId` 以 id 為鍵會兩列同轉、React key 重複）要給不同 id。〔UI/UX P1-4、系統 P2〕
10. [P1]〔§0、§1 驗收 1、§4.1 分區順序〕〔需人工裁決〕「近期提領」排第 6，概算 375px 起點約 y≈735、在首屏外，與規劃自己的急救故事及 `MemberManagement.tsx:279-282`「近期提領是這個面板存在的理由」衝突；順序承襲母計畫 A3 列舉 → 上移到「點數」之後（錢相關兩區相鄰），或記下維持原序的理由。〔UI/UX P1-5〕

### P2

11. [P2]〔§4.2 末段、§8〕〔需人工裁決〕「確認鈕維持墨黑、不改紅實心」與字面衝突：§11.3 寫授予資料層不可逆、§12.11 寫「紅實心只給不可逆的確認框」，且證件審核「退回」（可逆）的確認鈕現為紅實心（`IdReviewQueue.tsx:146`）；progress 記「會員管理詳情留給 S4」→ 列為 Q6 讓業主裁決，或在 §12.11／§11.3 補判準句（例：紅實心看破壞性、不看資料層可逆性）。〔架構 P2、需求 P2-4、UI/UX P2-10〕
12. [P2]〔§1 驗收 5、§4.2〕〔需人工裁決〕「確認框文案與現在完全相同」會保留一句錯的舊文案：暫停 body「會員區瀏覽不受影響」，與規格書 §5.2「會員區硬鎖」及 `suspendedBlocked` 矛盾（admin 判斷停權後果的依據）→ 修或記遺留；修的話 test 221 `/刊登將立即隱藏/` 不受影響。〔需求 P2-7，主 session 已查證屬實〕
13. [P2]〔§4.1 點數、§2〕`pendingPoints` 含手續費、含待查收的語意沒落到 UI：「處理中 1,015 P」對上列表「1,000 P」；且它才回答「我提領怎麼還沒到」卻被降成灰字一行 → 標「處理中（含手續費）」或列上帶 `fee`；處理中 > 0 時提升層級或說明維持理由。〔系統 P2、UI/UX P2-6（需人工裁決）〕
14. [P2]〔§4.1 近期提領〕`note` 是最新一筆事件的備註（代為完成必填原因、匯款可選填），不限退件，現行碼一律紅字 → 只有 `status==='rejected'` 才標「退件理由」用 destructive 色，其餘標「備註」中性色。〔系統 P2〕
15. [P2]〔§2 欄位盤點、§4.1〕盤點數字錯：契約 22 欄、現行 Sheet 用 18 欄（非 23／19），未呈現 4 欄名單正確；漏列巢狀 `fee`／`processedAt`／`completedAt`——待查收列的「何時匯出」正是客服要的 → 訂正數字，把巢狀欄位列入 Q4（待查收／已完成列加匯款或完成時間，零 API 變更）。〔系統 P2、架構 P2、需求 P2-10、UI/UX P2-14〕
16. [P2]〔§4.1 日期與數字格式〕日期函式未指定（現行 `formatTwTimestamp` 印時分秒，`ReferralTreeView.tsx:330` 用 `formatTwDate`），實作者自取 `slice`／`toLocaleDateString` 會差一天；已失效時「會籍到期 {過去日期}」時態含糊；「處理中 N P · 已提領 N P」單行在 375px 會從數字中間斷 → 日期型用 `formatTwDate`、暫停與申請時間保留時分秒，跨日測資（`…T16:30:00Z`）釘住；已失效寫「已於 … 到期」；每組「標籤＋數字＋P」`whitespace-nowrap`、外層 `flex-wrap`。〔系統 P2、UI/UX P2-15〕
17. [P2]〔§4.4〕〔需人工裁決〕`apiClient` 無 timeout／abort，同列停用後網路卡住就永遠轉圈、不可再點（改版前可再點重試）→ 接受並記錄，或給逾時出口，或只轉圈不停用。〔系統 P2〕
18. [P2]〔§4.4、§4.1 a11y〕四個焦點與名稱缺口：loading 設 `disabled` 使「查看」失焦、Sheet 關閉時焦點還原到 body；按鈕上的 `aria-busy` 多數報讀器不播報；Radix 開啟時聚焦 DOM 第一個可聚焦元素——關閉鈕在 children 之後，落點是畫面外的「暫停／恢復」（恢復無確認框）；關閉鈕可及名稱是英文 `Close`（`ui/sheet.tsx:79`）→ `onOpenAutoFocus` 聚焦標題或容器、`onCloseAutoFocus` 還原到對應「查看」鈕、載入中加 sr-only `role="status"`、Sheet 關閉鈕改「關閉」。〔UI/UX P2-7〕
19. [P2]〔§4.1 身分卡〕`name` 為 null 時標題用 Email、描述又印同一個 Email（長 Email 佔兩次；無名者正是註冊中斷的急救對象）→ 無名時省第二行，或標題改「（未設定姓名）」。〔UI/UX P2-11〕
20. [P2]〔§6 Q2、§4.1〕〔需人工裁決〕Sheet 內最多 10 列的已退件 `destructive` 實心紅與頂部「已暫停」同款，稀釋「先看到誰與狀態」；列內是否用淡底變體與「同源、顏色一致」的驗收衝突 → 業主定調。〔UI/UX P2-13〕
21. [P2]〔§3〕〔需人工裁決〕子元件 `import type { MemberAction }` 自父元件會是 `admin/` 第一條子→父依賴（只有型別、編譯後消失）→ (a) 留在 `MemberManagement.tsx` 守住 §11 指向並在子元件檔頭註明；(b) 搬進子元件並改 §11.1 一句。建議 (a) 並在規劃書記取捨。〔架構 P2〕
22. [P2]〔§3、§5 階段 2〕新增 `MemberDetailSheet.tsx` 卻不給同名測試檔，未承認偏離 test-naming「同層同名」；它有一整組條件矩陣 → 新增 `MemberDetailSheet.test.tsx` 直接 render 驗矩陣，並釘「四顆鈕只呼叫 `onRequestAction`（斷言 payload）、子元件不渲染任何 alertdialog」；整合測試留原檔。〔架構 P2〕
23. [P2]〔§3 提領狀態同源〕搬出範圍不完整：漏了轉換歷史對話框 `WithdrawalManagement.tsx:608-609` 的消費者、沒帶走 39-42 的生命週期註解；Q2=C 也要模組，條件寫錯 → 改寫成「模組一定存在，Q2 決定是否匯出 Badge」。〔架構 P2〕
24. [P2]〔§3 `withdrawalStatus.tsx`〕原樣搬出會留兩張表（`STATUS_LABEL` 與 `getStatusBadge` 內字面量）；`admin/` 全是 PascalCase 檔名 → 合成單表 `Record<status,{label,variant}>` 導出兩者；檔名考慮 `WithdrawalStatusBadge.tsx` 配同名測試（四態＋未知值 fallback）。〔架構 P2〕
25. [P2]〔§5 階段 2〕單一階段塞了抽元件、搬狀態表、分區改版、mock、e2e，風險未隔離 → 「搬出 withdrawalStatus」「純抽出元件（既有 it 零修改）」各自先做綠到綠重構 commit，再跑分區紅綠。〔架構 P2〕
26. [P2]〔§8 文件同步〕三處缺口：(a) `check-spec-drift.py` 抓不到 §13 描述文字（母計畫 §2.6 已查證），階段 4 把它列為測試落點會誤導 → 寫明「§13 人工同步，無機械把關」；(b) 母計畫 `plan.md` §3 A3 列仍寫「會籍與金流」，Q1／Q4 裁決後要同步並在母 progress「計畫異動記錄」記一行；(c) Q2 的結論只寫進會隨 S8 刪除的 progress → 一句最小事實寫在同源模組註解。〔架構 P2〕
27. [P2]〔§6 Q4、§1〕〔需人工裁決〕Q4-A 把兩類欄位綁一起：`pendingPoints`／`idRejectReason` 對得到客服情境，`createdAt`／`suspendedAt` 沒有對應故事 → 拆選，或替後兩者補 P4 情境；選 A／C 時驗收情境補可驗證行為。〔需求 P2-2〕
28. [P2]〔§6 Q3〕衝突依據漏列母計畫 `plan.md` §4 第 10 點與 construction-plan S2e 第八條（都把後台設為管理員列為流程鈕）→ Q3 補出處，選 A 的同步清單補這兩處。〔需求 P2-3〕
29. [P2]〔§4.3、§5〕業主第 1 條「區塊各自三態」被改寫為「單請求、整份失敗走既有路徑」，合理但未列為偏離讓業主知悉；「重讀失敗 panelError 只在管理區、其他分區保留舊資料」全 repo 無測試，抽元件時最易搬壞 → 補 vitest，偏離寫進偏離說明。〔需求 P2-5〕
30. [P2]〔§8 驗收 2 草稿〕construction-plan §4.3 驗收 2 是表格單一儲存格，`- [ ]` 清單無法在表格內渲染；清單寫死依賴 Q1／Q3 的字；漏急救情境關鍵項 → 表格下另立「驗收 2・S4 清單」小節、儲存格只留指標；各項標條件或裁決後定稿；補「近期提領每筆看得到金額、狀態、申請時間、退件理由」、尾註與空態。〔需求 P2-6〕
31. [P2]〔§8 規格書 §13〕〔需人工裁決〕「狀態篩選／排序」改「搜尋」不是分區造成的，業主第 8 條只授權因分區改變而同步；「規格書承諾、後端已備」也可能是未實作需求、應登 §14 → PR 說明單獨標出，或請業主定「改文字」或「登 §14」。〔需求 P2-8〕
32. [P2]〔§6 Q1〕Q1 理由漏了更根本的一點：契約沒有任何付款／訂閱交易欄位，「金流」實質只剩點數 → Q1 補此理由，確認業主的「金流」是否只指點數；若期待付款記錄要記遺留。〔需求 P2-9〕
33. [P2]〔§1 不做〕「不改列表」與階段 1 改「查看」鈕矛盾 → 改「不改列表欄位與版面，只動『查看』鈕的 loading」。〔需求 P2-10〕

## 需人工裁決

reviewer 標〔需人工裁決〕或主 session 判斷需業主定調的項目（**主 session 未降級或剔除任何發現**）：

| # | 題目 | 來源 |
|---|---|---|
| A | Q2 是否仍採 S7(4)「兩處統一 warning」，S4 只做同源 Badge、遺留留給 S7 結案（第 5 項） | 需求 P1-1 |
| B | 「關閉後重讀重開 Sheet」修不修：動 `runAction` 重讀一行 vs 記遺留（第 3 項） | 系統 P1 |
| C | 分區順序：近期提領上移到點數之後 vs 維持母計畫列舉順序（第 10 項） | UI/UX P1-5 |
| D | 身分卡是否隨捲動固定（第 7 項） | UI/UX P1-1 |
| E | 暫停／撤銷／授予的確認鈕：維持墨黑並補判準句 vs 改紅實心（第 11 項，原規劃書未列為開放問題） | 架構、需求、UI/UX |
| F | 暫停確認框錯誤文案「會員區瀏覽不受影響」：本 PR 修 vs 記遺留（第 12 項） | 需求 P2-7 |
| G | Q4 欄位拆選（客服情境欄位 vs 其餘；含巢狀 `fee`／`processedAt`／`completedAt`）（第 15、27 項） | 需求、系統、UI/UX |
| H | 處理中點數層級（第 13 項）、近期提領列內紅實心是否改淡底（第 20 項） | UI/UX |
| I | `apiClient` 無逾時下同列停用的取捨（第 17 項） | 系統 |
| J | `MemberAction` 型別落點（第 21 項） | 架構 |
| K | 規格書 §13「狀態篩選／排序」改字 vs 登 §14（第 31 項） | 需求 |
| — | 原規劃書 Q1、Q3、Q5：Q5 被三個視角指出與狀態模型矛盾、可降為設計決策（第 2 項）；Q1、Q3 需補理由與出處（第 28、32 項） | — |

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。
     tdd-implement 開工前會檢查：存在未處置 P0 → 拒絕開工。 -->

- 2026-10-05 session 內：Q1 裁決 A（區塊改名「點數」，`3f76a3d`）。
- 2026-10-06 業主於 PR #365 留言 6008679860 裁決 D1–D13（D1a、D2a、D3a、D4a、D5a、D6a、D7a、D8a、D9a＋b、D10b、D11a、
  D12a、D13a），並指示「不需裁決」7 項照審查建議落地、第 29 項（三態改寫列偏離＋補 vitest）與第 33 項（「不做」措辭）一併處理。
  主 session 已全數回填進 `plan.md`（修訂版，各處以〔D#〕／〔審#〕標出依據）：
  - P1 第 1–10 項：全數處置（1 尾註只講事實＋具名常數；2 `openingIds`＋序號；3 D7a 重讀共用序號；4 錯誤框捲入＋聚焦；
    5 D1a；6 `MemberStatusBadges` 共用模組；7 D8a 內層捲動；8 `pr-16`＋e2e 量測；9 最壞夾具＋兩條量測＋`exact=True`＋
    mock 不變式與不同 id；10 D2a）。
  - P2 第 11–33 項：11 D3a；12 D6a；13 標「含手續費」＋D10b；14 `note` 依狀態；15 數字訂正＋D5a；16 格式；17 D12a 記遺留；
    18 焦點／sr-only 狀態／關閉鈕「關閉」；19 無名不重複；20 D11a；21 D13a；22 同名測試檔；23、24 `WithdrawalStatusBadge`
    單表與完整消費者；25 重構先行綠到綠；26 §13 人工同步＋母計畫同步＋模組註解；27 D5a；28 D4 出處三處；29 偏離說明＋
    vitest；30 驗收 2 清單另立小節；31 D9a＋b；32 Q1 理由補；33「不做」措辭。
  - 無 P0，無需豁免。
- [x] 人審完成，裁決：□ 通過 ■ 修訂後通過（業主 2026-10-06 PR #365 留言 6008679860：回填後勾此項即可開工；無 P0 待豁免） □ 退回重規劃
