# 會員詳情 Sheet 分區重設計（S4／工項 A3）規劃書

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

> 母計畫：`docs/plans/platform-uiux-redesign/`（plan.md §2.3、§3 A3；construction-plan §2 S4 列、§4.3 驗收 2；
> progress.md S4 列與遺留事項）。本檔只寫 S4 自己的設計，母計畫已裁決的不重述。

## 0. 一句話

讓客服／管理員（P4）打開會員詳情時**先看到「這是誰、狀態如何」，再往下找細節**，因為現在的 Sheet 是一條
從頭到尾同一層級的扁平 `dl`（母計畫 §2.3），看一個人要從第一行讀到最後一行。

## 1. 使用者需求

- 依據：母計畫 §2.3（資訊沒有位階）、§3 A3；規格書 §13 會員管理列（`uknow-software-specification.md:654`）；
  `ui-ux-guidelines.md` §11（動作位階與確認框）、§12.11（按鈕三分法）、§13（資訊層次）。
- 使用者故事（P4 兩種模式，母計畫 §1）：
  - **急救（手機）**：接到電話「我提領怎麼還沒到」→ 搜到人 → 點「查看」**立刻有回饋** → Sheet 全螢幕，
    第一屏看到姓名、會籍、有無停權；往下滑到「近期提領」看狀態與退件理由。
  - **判斷（桌機）**：要停權或授予權限前，先在側欄看完身分、推薦關係、證件狀態，再走到底部管理區按鈕。
- 驗收情境（可驗證行為）：
  1. 詳情由上到下依序是：身分卡 → 帳號 → 點數（名稱見 Q1）→ 推薦關係 → 敏感資料 → 近期提領 → 管理。
  2. 點「查看」到 Sheet 出現之間，該鈕轉圈且停用；再點不會重送請求。取詳情失敗仍走現行錯誤態（不開空面板）。
  3. 375px 下 Sheet 全螢幕、所有分區標題都在、沒有橫向溢出；桌機維持 `sm:max-w-lg` 右側欄。
  4. 管理區：暫停、撤銷管理員是紅框字；恢復、設為管理員是白底灰框；面板內沒有實心鈕。
  5. 停權／恢復／授予／撤銷的確認規則與文案、錯誤顯示位置與現在完全相同。
- **不做**：不擴 API／不動 `supabase/functions/`（缺欄位記遺留）；不加任何「顯示完整身分證／帳號」；
  不碰 Sheet 的浮起表面 `--raised`（業主裁決留 S7）；不加 `tel:` 撥號連結等新互動；不改列表、統計卡、
  工具列、證件審核次分頁；不做 admin 快取（S5）。

## 2. 系統設計

- **資料流不變**：`查看` → `loadMemberDetail(id)`（`AdminDashboard.tsx` 注入，`GET /admin/members/:id`）
  → `AdminMemberDetail`（`_shared/api-contract.ts:753`）→ Sheet。**一次請求取回整份詳情**，沒有分區各自的
  請求——這決定了 §13 第 4 條「區塊各自三態」在本頁怎麼落地（見 §4.3）。
- **API／DB 變更：無**。`supabase/functions/` 零 diff（收尾以 `git diff --stat origin/develop -- supabase/` 為證）。
- 契約欄位使用盤點（23 欄）：現行 Sheet 已用 19 欄；**未呈現 4 欄**——`suspendedAt`、`createdAt`、
  `idRejectReason`、`pendingPoints`（後端早已回傳，`api/index.ts:1439-1452`）。是否呈現見 Q4（推薦呈現）。
  `pendingPoints` 的語意是「處理中提領的點數（含 awaiting_collection，含手續費）」——
  `20260718000101_withdrawal_lifecycle.sql` 檔頭第 5 點，正好回答「我提領怎麼還沒到」。
- **缺欄位（記遺留，不擴 API）**：近期提領只回最近 10 筆、沒有總筆數（`admin_member_detail` SQL `limit 10`），
  依 §5「不得靜默截斷」只能在滿 10 筆時加尾註「只列最近 10 筆，完整記錄請到提領管理用姓名搜尋」，
  無法顯示「X / Y 筆」。
- **「查看」的競態**：使用者在 A 列取詳情途中改點 B 列，現況兩個請求誰晚回誰贏（可能開出 A 的面板）。
  本 PR 加請求序號，只採用最後一次點擊的回應（Q5 推薦）；同列在途時鈕已停用，不會重送。

## 3. 架構影響

- **抽出 `src/components/admin/MemberDetailSheet.tsx`（純呈現）**：`MemberManagement.tsx` 已 657 行，Sheet
  內文重設計後會再長；比照 `MemberCardList`／`WithdrawalCardList` 的抽法（審查 F10 先例）。
  - 它只收 `detail`、`processing`、`panelError`、`onRequestAction(action: MemberAction)`、`onClose`。
  - **§11 的單一路徑留在 `MemberManagement.tsx` 不動**：`MemberAction` 型別、`needsConfirm`、`actionCopy`、
    `requestAction`／`runAction` 執行器、唯一的 `AlertDialog`。四顆管理鈕全部呼叫同一個 `onRequestAction`，
    子元件**不得**自己判斷要不要確認、不得自己呼叫 `setMemberAdmin`／`suspendMember`。所以
    `ui-ux-guidelines.md` §11〔實作〕指向 `MemberManagement.tsx` 維持正確、不必改（`MemberAction` 需 `export type`
    給子元件用）。
  - 測試仍走 `MemberManagement.test.tsx` 的整合路徑（與 `MemberCardList` 無獨立測試檔的現況一致）；
    新增的分區斷言放在同檔新的 `describe`。
- **提領狀態同源（Q2=A 或 B 時）**：新增 `src/components/admin/withdrawalStatus.tsx`，匯出
  `WITHDRAWAL_STATUS_LABEL` 與 `WithdrawalStatusBadge`（由 `WithdrawalManagement.tsx:43-63` 的
  `STATUS_LABEL`／`getStatusBadge` 原樣搬出）。`WithdrawalManagement`（表格、`WithdrawalCardList` 的
  `statusBadge` prop、CSV 的狀態欄）與會員詳情都 import 它；`MemberManagement.tsx:75-80` 的重複表刪除。
  會員端 `reward/WithdrawalSection.tsx` 的對照**不併入**（不同受眾、不同文案「處理中／已拒絕」，見 Q2）。
- **身分卡的狀態 Badge 與列表同源**：卡片列表（`MemberCardList`）的規則是「會籍 Badge 常駐、只有異常才加
  已暫停／管理員」；身分卡沿用同一份 `ACCOUNT_STATUS_BADGE` 與同樣的 variant（已暫停＝`destructive`、
  管理員＝`default`），不另訂一套。
- `MemberCardList` 的 `processingId` prop 目前**沒有被使用**（死 prop）；改成 `openingId`，供「查看」的
  loading 用。桌機表格同一個 state。
- 不動 appShell／路由 lazy 結構；無多步驟流程，四契約不適用；無新相依。

## 4. UI/UX

### 4.1 分區結構與每區主狀態（§13 第 1 條：總覽型，每區一個主項）

| 區塊 | 主項（放大或置頂） | 降級項 | 空態（一般文字，不借錯誤樣式） |
|---|---|---|---|
| **身分卡**（`SheetHeader`） | `SheetTitle` 姓名（無名用 Email）＋狀態 Badge 列：會籍 Badge 常駐；已暫停、管理員只在成立時出現 | Email（`BreakableEmail`）；「會籍到期 {日期}」一行 | `endDate` 為 null → 不顯示到期行（不留「—」殘影） |
| **帳號** | 電話（`font-mono`，客服回撥用） | 註冊日（`createdAt`，Q4）、刊登數、暫停時間（`suspendedAt`，僅暫停時出現，Q4） | 電話 null →「—」 |
| **點數**（命名見 Q1） | 可提領點數（`text-lg font-semibold`，數字墨黑 §12.5） | 「處理中 N P · 已提領 N P」一行（處理中＝`pendingPoints`，Q4） | 0 照常顯示「0 P」 |
| **推薦關係** | 推薦人（dt 文字**固定**「推薦人」，見 §4.6） | 直接推薦 N 位 | 推薦人 null →「—」 |
| **敏感資料** | 證件審核狀態（文字）；退回時下一行顯示退回理由（`idRejectReason`，Q4） | 身分證字號、收款帳號（後端遮罩值，`font-mono`，整列寬） | 身分證 null →「未設定」；銀行代號與帳號都 null →「未設定」（取代現在的「— / 未設定」） |
| **近期提領** | 清單：每筆「金額＋狀態」、申請時間、退件理由（客服要的那一行） | 滿 10 筆時的尾註（§2） | `[]` →「尚無提領記錄」（既有字串） |
| **管理**（底部） | 兩列「現況說明＋切換鈕」，文字與現在相同 | `panelError`（`role="alert"`，只在本區） | — |

- 分區用 `<section aria-labelledby>`＋`<h3>` 標題（Radix 的 `SheetTitle` 是 h2，h3 層級正確）；標題字串：
  「帳號」「點數」（Q1）「推薦關係」「敏感資料」「近期提領」「管理」。
- 每區內一律「標籤左、值右」單欄列（`flex justify-between`，值 `min-w-0 text-right wrap-anywhere`）——取代
  現在 `grid-cols-1 sm:grid-cols-2` 的兩欄格；半寬欄會把「銀行代號 / 帳號」折得破碎（現行碼的 P9 註解），
  而分區後每區只有 2～4 項，兩欄格沒有省到空間。
- 區與區之間用分隔線與留白（`divide-y`／`py-4`），不用卡片套卡片；層次靠字重與灰階（§12.2），不加色。
  管理區維持「放在最底、以分隔線隔開——要讓人走到而不是路過」（現行碼註解），不做 sticky。
- **敏感資料標題**：「敏感資料」＋鎖頭圖示（`aria-hidden`）＋標題下一行灰字「身分證與收款帳號只顯示部分碼」。
  讓人一眼知道這區是敏感資料、而且看到的不是全碼；**沒有任何顯示完整的入口**（需求 5，test 190 守住遮罩值）。

### 4.2 動作位階與按鈕（§11、§12.11）

- **原樣保留**：四個方向共用 `MemberAction`、同一個確認框、同一個執行器；確認規則逐方向不變（暫停／授予／
  撤銷要確認、恢復不要）；確認框文案（`actionCopy`）不變；錯誤只印在管理區。
- **管理區按鈕依三分法**：
  | 鈕 | tone | 現況 |
  |---|---|---|
  | 暫停 | `destructive`（紅框字） | `secondary`＋手刻 `text-destructive-subtle-foreground` |
  | 撤銷管理員 | `destructive`（紅框字） | 同上 |
  | 恢復 | `secondary` | `secondary` |
  | 設為管理員 | `secondary`（**與 §12.11 表格字面衝突，見 Q3**） | `secondary` |

  手刻的紅字 className 一併拿掉（S2e #354 D4 裁決「會員管理詳情留給 S4」的那一處）。面板內**零顆實心鈕**；
  後台沒有引導鈕，不用品牌色。
- **確認框的確認鈕維持流程鈕（墨黑），不改紅實心**：§12.11「紅實心只給不可逆的確認框」——暫停可恢復、撤銷可
  再授予，都可逆；授予在資料層不可逆但不是破壞性動作。所以三個確認鈕（確認暫停／確認授予／確認撤銷）維持
  `AlertDialogAction` 預設，與「確認框契約原樣保留」一致。

### 4.3 三態（§13 第 4 條在「一次請求取整份詳情」下的落地）

- **載入**：資料到齊才開 Sheet（現行行為，不改），所以 Sheet 內沒有骨架；載入回饋在**觸發鈕**上（4.4）。
- **錯誤**：整份詳情取失敗＝維持現行路徑——不開 Sheet、列表上方顯示 `actionError`（test 367）。
  動作後重讀失敗＝`panelError`「已更新，但重新讀取詳情失敗…」只出現在管理區，其他分區保留上一份資料（不連坐）。
- **空**：逐區一般文字（4.1 表最後一欄），不用錯誤色。

### 4.4 「查看」→ Sheet 的回饋

- 觸發鈕（桌機表格與手機卡片兩處）用 `Button` 的 `loading` prop：轉圈＋`disabled`＋`aria-busy`，
  `aria-label`「查看 {name} 的詳情」不變（Loader 圖示 `aria-hidden`，名稱不受影響）。
- 同列在途時停用、不重送；他列仍可點，**最後一次點擊勝出**、較早的回應丟棄（Q5 推薦 A）。
- 成功或失敗都要清掉 loading；失敗後鈕恢復可按。

### 4.5 手機與桌機

- **375px**：`SheetContent` 已是 `w-full`（覆寫原語的 `w-3/4`），維持全螢幕；e2e 新增正向斷言。
  現況兩個版面缺口一併修：(a) `SheetContent` 原語沒有內距，現在 `dl`／提領／管理三塊**左右貼齊螢幕邊緣**——
  分區內文加 `px-4`（與 `SheetHeader` 的 `p-4` 對齊，`ReferralTreeView` 的 Sheet 同寫法）；(b) 右上關閉鈕是
  `absolute top-3 right-3` 約 48px，身分卡要留 `pr-14`，長姓名才不會鑽到關閉鈕底下。
- **桌機**：維持 `sm:max-w-lg` 右側欄，分區結構與手機相同（單欄列在 512px 寬仍好讀）。
- 管理鈕 `size="sm"`，觸控裝置靠 `pointer-coarse:min-h-[44px]` 達 44px（§1）。
- 不碰 `--raised`（業主已裁決留 S7）。

### 4.6 定位器契約（第 7 條；S3 friction-log 2026-10-05「漏網」的教訓）

已對 `e2e/`（含 `journey/`）與 `src/**/*.test.tsx` grep 過 Sheet 內每一個可見字串與按鈕名稱：

| 會動到的字串 | 改成 | 依賴它的定位器 | 處置 |
|---|---|---|---|
| dt「推薦人」 | **不變** | journey f70 `get_by_text("推薦人", exact=True)`（`f70_renewal_saga_steps.py:164`） | 維持 dt 原字；**整頁只能有一個**完整等於「推薦人」的節點（Playwright strict mode，兩個就紅）；分區標題用「推薦關係」不撞 |
| 推薦人姓名 dd | **不變**（只放姓名，不加前後綴） | f70 `get_by_text(P0 姓名, exact=True).first` | 不得包成「王小明（預設）」之類 |
| 「查看 {name} 的詳情」 | **不變** | f70 `:159`、`test_overflow_sweep.py:451`（`name="查看"` 子字串）、vitest 多處 | 加 `loading` 不改名稱 |
| 「暫停／恢復／設為管理員／撤銷管理員」 | **不變** | vitest 多處 `getByRole('button', {name})` | 只改 tone |
| 「帳號正常／帳號已暫停」 | **不變** | vitest 266、269（`getByText` 完整比對） | 帳號區**不得**再出現同一字串（會變 multiple） |
| 「尚無提領記錄」 | **不變** | vitest 385 | — |
| h3「近期提領記錄」 | 「近期提領」 | 無 | 直接改 |
| dt「會籍」「到期日」 | 移入身分卡（Badge＋「會籍到期 …」） | 無 | 直接改 |
| 新增：分區標題、「註冊日」「暫停時間」「處理中」「退回理由」、敏感資料說明、10 筆尾註 | — | 無（新字串） | e2e 新測試以 role＝heading 定位分區標題 |

收尾前再跑一次同一組 grep（舊字串＋新字串），結果寫進 PR 描述。

## 5. 階段切分（每階段一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | 「查看」觸發回饋 | `MemberManagement.test.tsx`（jsdom；桌機＋手機兩個 describe 各補） | 在途時鈕 `aria-busy` 且 `disabled`、再點 `loadMemberDetail` 只被呼叫一次；失敗後鈕恢復可按、test 367 原樣綠；A 在途改點 B 時開出的是 B（Q5=A） |
| 2 | 分區結構與身分卡（抽 `MemberDetailSheet`；提領狀態同源） | `MemberManagement.test.tsx` 新 `describe('會員詳情分區')`；e2e `test_admin_mobile_layout.py` 新增 375px 測試（先紅）；`e2e/mocks/admin_console_mock.py` 的 `build_admin_member_detail` 補齊契約欄位（現缺 `isAdmin`／`suspended`／`suspendedAt`／`createdAt`／`idRejectReason`／`pendingPoints`，Sheet 開始讀它們後缺欄位會畫出 Invalid Date） | 分區標題依序存在（`getAllByRole('heading')` 順序）；身分卡 Badge 規則（常駐會籍、異常才加）；各區主項與空態；「推薦人」完整比對恰好一個；敏感資料區有標題與說明、值仍是遮罩；近期提領狀態與提領管理同源（`awaiting_collection` 等四態）；滿 10 筆出尾註；e2e：Sheet 左右間距 0、六個分區標題 `to_be_visible`、Sheet `scrollWidth ≤ clientWidth` |
| 3 | 管理區三分法 | `MemberManagement.test.tsx` | 暫停、撤銷管理員帶紅框字 class（`border-destructive-border`）、恢復與設為管理員是次要外觀；面板內 `getAllByRole('button')` 沒有任何實心鈕（無 `bg-primary`／`bg-brand`）；既有 §11 測試全數不改照樣綠 |
| 4 | 文件同步 | `check-spec-drift.py`、`check-plans-scaffold.py`、`framework-check.sh` | 見 §8 清單全數落地 |

- 既有 `MemberManagement.test.tsx` 的 `it` **只增不減、不弱化**。預期**不需要改任何現有 `it`**；若實作中發現
  非改不可，停手記進 progress.md Blockers 並寫偏離說明（哪一條、為什麼、斷言強度有沒有降）。
- 測試命名照 `.claude/rules/test-naming.md`（vitest 中文 `<情境>時，<預期>`；e2e 函式英文）。
- 每階段結束跑 `npm run check`；送 PR 前 `npm run check:full`＋`framework-check.sh`；e2e 新測試在 CI 的 e2e 軌驗。

## 6. 開放問題（等業主裁決）

- [x] **Q1 已裁決（業主 2026-10-05，session 內）：A 改名「點數」**。補充理由（審查第 32 項）：契約沒有任何付款／
  訂閱交易欄位，「金流」實質只剩點數。母計畫 plan.md §3 A3 的區塊列舉於階段 4 同步。
  **Q1 身分卡與「會籍與金流」區的分工**：第 1 條把「會籍與到期」放進身分卡，若區塊仍叫「會籍與金流」，
  要嘛重複會籍、要嘛名不副實。
  A（推薦）身分卡放會籍 Badge＋到期；該區改名「點數」，只放可提領／處理中／已提領。
  B 維持「會籍與金流」，區內再列一次會籍與到期日＋點數（與身分卡重複）。
  C 身分卡只放 Badge，到期日留在「會籍與金流」區。
- [ ] **Q2 近期提領的狀態呈現與 awaiting_collection 顏色**（第 6 條，遺留事項在此結案或延續）：
  A（推薦）改 Badge，與提領管理共用 `withdrawalStatus.tsx`（同源）、維持後台現有對照（待查收＝`warning`）；
  兩處顏色不同結案為「依受眾刻意不同」——後台的黃是「款已匯出、球在會員手上，客服接電話時要提醒他去確認
  收款」；會員端的注意力已由蔚藍「確認收款」引導鈕承擔（S2e），徽章維持中性灰才不重複訊號。
  B 改 Badge、同源，並把後台的待查收也改成 `secondary`（兩邊拉平；會改到提領管理的畫面）。
  C 維持純文字（`WITHDRAWAL_STATUS_LABEL` 改由同源模組匯入），遺留事項不結案、原樣保留。
- [ ] **Q3「設為管理員」的 tone**：你的指示是 secondary，但 `ui-ux-guidelines.md` §12.11 表格把「後台的設為
  管理員」列在流程主要動作（墨黑）。
  A（推薦）secondary，同 PR 改 §12.11：該格的「設為管理員」改成「確認授予（確認框內）」，並註明面板裡的
  切換鈕是流程起點、屬次要（§12.11 本來就寫「流程的起點也算次要」）。
  B 設為管理員改 `flow` 墨黑（面板內唯一一顆實心鈕），§12.11 不改。
- [ ] **Q4 四個已在契約、但現在沒呈現的欄位**（`suspendedAt` 暫停時間、`createdAt` 註冊日、`idRejectReason`
  證件退回理由、`pendingPoints` 處理中點數）：
  A（推薦）全部呈現（零 API 變更；處理中點數與退回理由直接回答客服的頭號問題）。
  B 都不呈現（與現在資訊量完全相同）。
  C 只呈現 `pendingPoints` 與 `idRejectReason`（與客服情境直接相關的兩個）。
- [ ] **Q5 A 列取詳情途中改點 B 列**：
  A（推薦）A 鈕轉圈停用、其他列照常可點，最後一次點擊勝出（較早的回應丟棄）。
  B 任一列在取詳情時，所有「查看」都停用。

## 7. 風險與回滾

- **最壞情況**：(1) journey f70 的「推薦人」定位撞名或被改字 → 晉升 PR 才紅；防線是 §4.6 表＋收尾 grep＋vitest
  斷言「完整等於『推薦人』的節點恰好一個」。(2) 抽元件時把確認判斷搬進子元件、造成兩條路徑 → 防線是既有
  §11 整合測試（暫停／恢復／授予／撤銷 9 條）原樣保留，加上子元件只收 `onRequestAction` 的介面設計。
  (3) e2e mock 缺欄位讓 375px 測試量到錯誤畫面 → 階段 2 先補 mock。
- 純前端呈現層改動，無資料、無 API、無 migration。回滾＝revert PR。
- 實作模型：construction-plan §2 定 Sonnet。

## 8. 文件同步清單（第 8 條；階段 4）

- [ ] 規格書 §13 會員管理列（`uknow-software-specification.md:654`）：「會員詳情（含近期提領記錄，身分證與
  銀行帳號遮罩）＋面板底部的『管理』區」改為描述分區（身分卡＋帳號／點數／推薦關係／敏感資料／近期提領＋
  底部管理區）。同一格的「狀態篩選／排序」是**既有落差**——後端 `/admin/members` 支援 `status`／`sort`，
  但前端只有搜尋；本 PR 順手把那幾個字改成實際有的「搜尋」（純文件、零行為變更；照 document-writing
  守則，不另寫「不提供篩選」之類的旁白）。
- [ ] `ui-ux-guidelines.md` §11〔實作〕指向 `MemberManagement.tsx` 不變（`MemberAction` 留在原檔）；
  §12.11 依 Q3 裁決改或不改。
- [ ] construction-plan §4.3 驗收 2 的「**S4 部分**：會員詳情分區」補成可勾清單（手機、桌機各一組；
  草稿見下）。
- [ ] progress.md S4 列（狀態、PR、驗收站備註）；遺留事項「awaiting_collection 兩處顏色」依 Q2 結案或保留；
  新增遺留「近期提領無總筆數（`admin_member_detail` 只回 10 筆）」，退場條件＝後端加 total 時改成「X / Y 筆」。
- [ ] 收尾刪除 `docs/plans/member-detail-redesign/`（`/tdd-implement` 收尾負責），值得留的決策升級進上面幾處。

**驗收 2「S4 部分」草稿**（寫進 construction-plan §4.3）：

- 手機（375px，建議 LINE 內建瀏覽器）：
  - [ ] 點「查看」到 Sheet 出現前，那顆鈕在轉圈、連點不會開兩次
  - [ ] Sheet 全螢幕；第一屏看得到姓名、會籍 Badge、到期日，停權者有「已暫停」、管理員有「管理員」
  - [ ] 往下依序是帳號／點數／推薦關係／敏感資料／近期提領／管理，各區標題清楚；內文左右有留白、不貼邊
  - [ ] 敏感資料區一眼看得出是敏感資料，身分證與帳號只顯示部分碼，沒有任何「顯示完整」
  - [ ] 近期提領的狀態徽章與提領管理頁同一筆的顏色一致（Q2=A／B 時）
  - [ ] 管理區：暫停／撤銷管理員紅框字，恢復／設為管理員白底灰框，鈕高好按（44px）；按下後確認框與文案照舊
  - [ ] 長姓名不會鑽到右上關閉鈕底下
- 桌機：
  - [ ] Sheet 是右側欄（約 512px 寬），分區順序與手機相同
  - [ ] 表格列的「查看」同樣有轉圈回饋
  - [ ] 管理區按鈕外觀同手機；面板內沒有任何實心鈕
  - [ ] devtools `.dark` 看一次分區標題與分隔線的層次
