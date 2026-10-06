# 會員詳情 Sheet 分區重設計（S4／工項 A3）規劃書

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

> 母計畫：`docs/plans/platform-uiux-redesign/`（plan.md §2.3、§3 A3；construction-plan §2 S4 列、§4.3 驗收 2；
> progress.md S4 列與遺留事項）。本檔只寫 S4 自己的設計，母計畫已裁決的不重述。
>
> **修訂版（2026-10-06）**：依四視角審查（`./review.md`，P0×0／P1×10／P2×23）與業主裁決（Q1 session 內；
> D1–D13 於 PR #365 留言 6008679860）回填。各處以〔D#〕／〔審#〕標出依據。

## 0. 一句話

讓客服／管理員（P4）打開會員詳情時**先看到「這是誰、狀態如何」，再往下找細節**，因為現在的 Sheet 是一條
從頭到尾同一層級的扁平 `dl`（母計畫 §2.3），看一個人要從第一行讀到最後一行。

## 1. 使用者需求

- 依據：母計畫 §2.3（資訊沒有位階）、§3 A3；規格書 §13 會員管理列（`uknow-software-specification.md:654`）、
  §5.2（停權）；`ui-ux-guidelines.md` §11（動作位階與確認框）、§12.11（按鈕三分法）、§13（資訊層次）。
- 使用者故事（P4 兩種模式，母計畫 §1）：
  - **急救（手機）**：接到電話「我提領怎麼還沒到」→ 搜到人 → 點「查看」**立刻有回饋** → Sheet 全螢幕，
    固定的身分卡看到姓名、會籍、有無停權；往下第一個長清單就是「近期提領」，看狀態、匯款時間與退件理由。
  - **判斷（桌機）**：要停權或授予權限前，先在側欄看完身分、推薦關係、證件狀態，再走到底部管理區按鈕。
- 驗收情境（可驗證行為）：
  1. 由上到下：身分卡（固定）→ 帳號 → 點數 → 近期提領 → 推薦關係 → 敏感資料 → 管理〔D2〕。
  2. 點「查看」到 Sheet 出現之間，該列鈕轉圈且停用、同列再點不重送；他列可點，**最後一次點擊**開面板；
     取詳情失敗仍不開空面板（test 367），且錯誤框被捲進視窗並取得焦點〔審 2、4〕。
  3. 處理中關掉 Sheet，動作後的重讀回來不會把它重開；關掉後開 B，A 的重讀晚到不會把 B 換成 A〔D7〕。
  4. 375px 下 Sheet 全螢幕、身分卡固定在上、分區內文捲動、所有分區標題都在、沒有橫向溢出、長姓名不鑽到關閉鈕
     底下；桌機維持 `sm:max-w-lg` 右側欄〔D8、審 7–9〕。
  5. 管理區：暫停、撤銷管理員紅框字；恢復、設為管理員白底灰框；面板內沒有實心鈕。確認框：確認暫停、確認撤銷
     紅實心，確認授予墨黑〔D3、D4〕。
  6. 停權／恢復／授予／撤銷**哪些方向要確認**、走同一個 `MemberAction`／確認框／執行器、錯誤只印在管理區——全部
     不變。確認框文案只改一句：暫停的後果描述改成與規格書 §5.2 一致（停權會員進不了會員區）〔D6〕。
  7. 新呈現的契約欄位〔D5〕：點數區有「處理中 N P（含手續費）」；證件退回時有退回理由；待查收列有匯款時間、
     已完成列有完成時間；帳號區有註冊日；停權時帳號區有暫停時間。
- **不做**：不擴 API／不動 `supabase/functions/`（缺欄位記遺留）；不加任何「顯示完整身分證／帳號」；不碰 Sheet
  的浮起表面 `--raised`（業主裁決留 S7）；不加 `tel:` 撥號等新互動；**不改列表欄位與版面，只動「查看」鈕的
  loading**〔審 33〕；不改統計卡、工具列、證件審核次分頁；不做 admin 快取（S5）；不在 S4 給 `apiClient` 加逾時
  （全站層，記遺留）〔D12〕；不改會員端 `reward/WithdrawalSection.tsx` 的待查收顏色（S7）〔D1〕。

## 2. 系統設計

- **資料流不變**：`查看` → `loadMemberDetail(id)`（`AdminDashboard.tsx` 注入，`GET /admin/members/:id`）
  → `AdminMemberDetail`（`_shared/api-contract.ts:753`）→ Sheet。**一次請求取回整份詳情**，沒有分區各自的請求
  ——這決定了 §13 第 4 條「區塊各自三態」在本頁怎麼落地（§4.3，且是對開工 prompt 第 1 條的偏離，見該節）。
- **API／DB 變更：無**。`supabase/functions/` 零 diff（收尾以 `git diff --stat origin/develop -- supabase/` 為證）。
- **欄位盤點**〔審 15〕：契約 22 欄；現行 Sheet 用 18 欄；未呈現 4 欄＝`suspendedAt`、`createdAt`、`idRejectReason`、
  `pendingPoints`；另有提領列巢狀的 `fee`／`processedAt`／`completedAt` 未用。依 D5 全部呈現（§4.1）。
  - `pendingPoints`＝處理中提領的點數，**含 awaiting_collection、含手續費**（`20260718000101_withdrawal_lifecycle.sql`
    檔頭第 5 點、`get_reward_summary`）。所以標示寫「處理中 N P（含手續費）」，才不會對不上列表的金額〔審 13〕。
  - 提領列的 `note`＝**該筆最新一筆事件的備註**，不限退件（代為完成必填原因、匯款可選填）〔審 14〕。
- **近期提領只回 10 筆、沒有總筆數**（`admin_member_detail` SQL `limit 10`）：前端以具名常數
  `RECENT_WITHDRAWALS_LIMIT = 10`（註解指向 `20260802000008_admin_member_detail.sql`）判斷，筆數 ≥ 常數時加尾註
  「最多列出最近 10 筆」——只講事實、**不指向不存在的「提領管理用姓名搜尋」**（提領管理只有狀態篩選；後端
  `/admin/withdrawals?search=` 有、前端沒接）〔審 1〕。缺 total 與「看不到單一會員完整提領史」記遺留。
- **請求狀態模型**〔審 2、3；D7〕（全部在 `MemberManagement.tsx`，子元件不碰）：
  - `openingIds: Set<string>`：在途中的列各自轉圈＋停用；同列在途時再點是 no-op。每個請求結算（成功或失敗）時
    只移除**自己的** id。（取代單值 `openingId`——單值時點 B 會讓 A 的鈕提前放開、A 的結算又清掉 B 的轉圈。）
  - `detailSeq`（`useRef<number>`）＝「最新的意圖」：每次點「查看」遞增並記下自己的序號；回應只有在序號仍為最新
    時才可寫 `detailFor`／`actionError`。過期回應（成功或 reject）**只移除自己的 id**，不寫面板、不寫錯誤。
  - `runAction` 的重讀：開頭取當下序號（不遞增），回來時序號不同就整個丟棄——包含 `setDetailFor` 與重讀失敗的
    `panelError`。`onClose` 遞增序號（作廢在途的重讀）再 `setDetailFor(null)`。開啟別人時的遞增同樣作廢舊重讀。
    這是 §11 執行器裡**唯一**動到的一行（重讀的守衛）；確認規則、`needsConfirm`、`actionCopy` 的判斷不動〔D7〕。
  - 序號的遞增、比對與 `openingIds` 的移除收在一組小 helper（同檔），兩條路徑共用，不各寫一份。
- **取詳情失敗的錯誤要看得到**〔審 4〕：沿用 `actionError` 路徑（不開 Sheet），但錯誤框（`StatusCallout`，
  `tabIndex={-1}`＋ref）出現時 `scrollIntoView({ block: 'nearest' })` 並 `focus()`。手機在長列表深處按「查看」失敗時，
  畫面才不會像「按了沒反應」。
- **逾時**：`apiClient` 沒有 timeout／abort，網路卡住時該列會一直轉圈且停用（照業主指定的「停用」）。接受並記遺留
  「`apiClient` 加 `AbortSignal.timeout`」，全站層的事不在 S4 單點加〔D12〕。

## 3. 架構影響

- **抽出 `src/components/admin/MemberDetailSheet.tsx`（純呈現）**：`MemberManagement.tsx` 已 657 行；比照
  `MemberCardList`／`WithdrawalCardList` 的抽法（審查 F10 先例）。
  - props：`detail`、`processing`、`panelError`、`onRequestAction(action: MemberAction)`、`onClose`。Badge 與狀態
    對照從共用模組 import（下一點），不經 props。
  - **§11 的單一路徑留在 `MemberManagement.tsx` 不動**：`MemberAction` 型別、`needsConfirm`、`actionCopy`、
    `requestAction`／`runAction` 執行器、唯一的 `AlertDialog`。四顆管理鈕全部呼叫同一個 `onRequestAction`，子元件
    **不得**自己判斷要不要確認、不得呼叫 `setMemberAdmin`／`suspendMember`、不得渲染任何 alertdialog。
  - `MemberAction` 用 `export type` 給子元件〔D13〕；這是 `admin/` 第一條子→父的型別依賴（編譯後消失），子元件
    檔頭註明「型別與執行器同檔，子元件只回呼 `onRequestAction`」。`ui-ux-guidelines.md` §11〔實作〕指向不變。
- **會員狀態 Badge 單一來源**〔審 6〕：新增 `src/components/admin/MemberStatusBadges.tsx`，收
  `ACCOUNT_STATUS_BADGE`（自 `MemberManagement.tsx` 搬出）與已暫停（`destructive`）、管理員（`default`）的定義，
  匯出 `MemberStatusBadges`（**異常在前**：已暫停 → 管理員 → 會籍，`flex-wrap`）。三處共用：桌機表格（其「角色」
  「狀態」兩欄的已暫停／管理員改用同一定義，正常態的「一般會員」「正常」照舊）、手機卡片（`MemberCardList` 改
  直接 import、拿掉 `accountBadge` prop）、身分卡。`ID_STATUS_LABEL` 只有詳情用，搬進 `MemberDetailSheet.tsx`。
- **提領狀態同源**〔D1；審 23、24〕：新增 `src/components/admin/WithdrawalStatusBadge.tsx`（PascalCase，與 `admin/`
  慣例一致），內容是**一張表** `Record<status, { label, variant }>`（由 `WithdrawalManagement.tsx:43-63` 的
  `STATUS_LABEL` 與 `getStatusBadge` 合併；後台現行對照原樣：待處理 `secondary`、待查收 `warning`、已完成
  `outline`、已退件 `destructive`、未知值 `secondary` 顯示原字），由它導出 `WITHDRAWAL_STATUS_LABEL` 與
  `WithdrawalStatusBadge`。39-42 行的生命週期註解一併搬過去，並以一句最小事實註明：會員端
  `reward/WithdrawalSection.tsx` 依受眾另有一份標籤（處理中／已拒絕），待查收的顏色統一由 S7 處理。
  - 消費者全數改 import：`WithdrawalManagement` 的表格、`WithdrawalCardList` 的 `statusBadge` prop、CSV 狀態欄、
    **轉換歷史對話框**（`WithdrawalManagement.tsx:608-609`，原規劃漏列），以及會員詳情；`MemberManagement.tsx:75-80`
    的重複表刪除。
- **e2e mock**〔審 9〕：`e2e/mocks/admin_console_mock.py` 的 `build_admin_member_detail` 補齊契約欄位（`isAdmin`、
  `suspended`、`suspendedAt`、`createdAt`、`idRejectReason`、`pendingPoints`；提領列補 `fee`、`processedAt`、
  `completedAt`），並守住兩個不變式：`suspended` 由 `suspendedAt` 推導、`idRejectReason` 只在 `rejected` 時非 null。
  另給一份**最壞資料**夾具（§5 階段 3）。`test_overflow_sweep.py` 的 `_setup_admin` 兩位會員改用不同 id
  （現在都是 `mem-admin-1`，`openingIds` 以 id 為鍵會兩列同轉、React key 也重複），會員詳情 Sheet 路由改吃同一份
  最壞夾具。
- 不動 appShell／路由 lazy 結構、不動 `AdminDashboard.tsx` 的 DI；無多步驟流程，四契約不適用；無新相依。
- `src/components/ui/sheet.tsx` 只改關閉鈕的 sr-only 名稱「Close」→「關閉」〔審 18〕；`dialog.tsx` 不動（
  `e2e/steps/profile_steps.py:95` 依賴它的「Close」）。

## 4. UI/UX

### 4.1 分區結構與每區主項（§13 第 1 條：總覽型，每區一個主項）

| 區塊 | 主項 | 降級項 | 空態（一般文字，不借錯誤樣式） |
|---|---|---|---|
| **身分卡**（`SheetHeader`，固定不捲） | `SheetTitle` 姓名＋`MemberStatusBadges` 一列 | Email（`BreakableEmail`）；會籍到期一行：有效「會籍到期 {日期}」、已失效「已於 {日期} 到期」 | 無名：標題用 Email、**不再印第二行 Email**（`SheetContent` 傳 `aria-describedby={undefined}`，避免 Radix 缺描述警告）〔審 19〕；`endDate` null → 不顯示到期行 |
| **帳號** | 電話（`font-mono`） | 註冊日；刊登數；暫停時間（**只在停權時渲染**）〔D5〕 | 電話 null →「—」 |
| **點數** | 可提領點數（`text-lg font-semibold`，數字墨黑 §12.5） | 「處理中 N P（含手續費） · 已提領 N P」一行 | 0 照常顯示「0 P」 |
| **近期提領** | 清單：每筆「金額＋`WithdrawalStatusBadge`」、申請時間；待查收列加「匯款時間」、已完成列加「完成時間」〔D5〕；已退件列的 `note` 標「退件理由」（`destructive-subtle-foreground`），其他狀態的 `note` 標「備註」（灰字）〔審 14〕 | 筆數 ≥ 10 時尾註「最多列出最近 10 筆」 | `[]` →「尚無提領記錄」（既有字串） |
| **推薦關係** | 推薦人（dt 文字**固定**「推薦人」，§4.6） | 直接推薦 N 位 | 推薦人 null →「—」 |
| **敏感資料** | 證件審核狀態（文字）；`rejected` 時下一行「退回理由」（`idRejectReason`）〔D5〕 | 身分證字號、收款帳號（後端遮罩值，`font-mono`，整列寬） | 身分證 null →「未設定」；銀行代號與帳號都 null →「未設定」（取代現在的「— / 未設定」） |
| **管理**（底部） | 兩列「現況說明＋切換鈕」，現況文字不變 | `panelError`（`role="alert"`，只在本區） | — |

- 分區用 `<section aria-labelledby>`＋`<h3>`（`SheetTitle` 是 h2）；標題字串：「帳號」「點數」〔Q1〕「近期提領」
  「推薦關係」「敏感資料」「管理」。
- **點數區只留一個主數字＝可提領**〔D10〕：可提領是會員自己也看得到、客服對帳用的數字；處理中的細節由緊鄰的
  「近期提領」逐筆回答（D2 上移後就在下一區），不在點數區再放大一次。
- 每區內一律「標籤左、值右」單欄列（`flex justify-between`，值 `min-w-0 text-right wrap-anywhere`），取代現在
  `grid-cols-1 sm:grid-cols-2` 的兩欄格（半寬欄把「銀行代號 / 帳號」折得破碎，現行碼 P9 註解）。
- 區與區之間用分隔線與留白（`divide-y`／`py-4`），不卡片套卡片；層次靠字重與灰階（§12.2），不加色。管理區放
  最底、分隔線隔開——「要讓人走到而不是路過」（現行碼註解），不做 sticky。
- **敏感資料標題**：「敏感資料」＋鎖頭圖示（`aria-hidden`）＋下一行灰字「身分證與收款帳號只顯示部分碼」；**沒有任何
  顯示完整的入口**（test 190 守住遮罩值）。
- **格式**〔審 16〕：日期型（會籍到期、註冊日）用 `formatTwDate`；時點型（暫停時間、申請、匯款、完成時間）用
  `formatTwTimestamp`；測試用跨台灣日界的測資（如 `…T16:30:00Z`）釘住。每組「標籤＋數字＋P」各自
  `whitespace-nowrap`，外層 `flex-wrap`（§10 數字不斷行）。
- 近期提領列內「已退件」維持與提領管理同源的 `destructive`（S2b 後語義色實心層是亮底黑字，不至於稀釋身分卡）〔D11〕。

### 4.2 動作位階、按鈕與確認框（§11、§12.11）

- **原樣保留**：四個方向共用 `MemberAction`、同一個確認框、同一個執行器；確認規則逐方向不變（暫停／授予／撤銷要
  確認、恢復不要）；錯誤只印在管理區。
- **管理區觸發鈕**〔D4〕：

  | 鈕 | tone | 現況 |
  |---|---|---|
  | 暫停 | `destructive`（紅框字） | `secondary`＋手刻 `text-destructive-subtle-foreground` |
  | 撤銷管理員 | `destructive`（紅框字） | 同上 |
  | 恢復 | `secondary` | `secondary` |
  | 設為管理員 | `secondary`（流程起點屬次要；§11.2 視覺權重跟頻率走） | `secondary` |

  手刻紅字 className 拿掉（S2e #354 D4「會員管理詳情留給 S4」那一處）。面板內**零顆實心鈕**；後台沒有引導鈕，
  不用品牌色。
- **確認鈕跟觸發鈕同類**〔D3〕：紅框字觸發（暫停、撤銷）→ 確認鈕 `AlertDialogAction variant="destructive"` 紅實心；
  次要觸發（設為管理員）→ 確認授予維持預設流程鈕墨黑。實作上由 `actionCopy` 這個單一來源多回一個欄位（例：
  `destructive: boolean`），確認框照它傳 `variant`——不另開第二份判斷。
- **暫停確認框文案修正**〔D6〕：body 的「會員區瀏覽不受影響，解除暫停後即恢復」與規格書 §5.2、
  `RequireMembershipRoute` 的 `suspendedBlocked`（停權會員一律看到「帳號已停權」、進不了會員區）矛盾，改成與
  §5.2 一致，例：「{name} 的刊登將立即隱藏，無法提領點數或領取免費續約 credit，也無法進入會員區。解除暫停後即恢復。」
  保留「刊登將立即隱藏」（test 221 的 `/刊登將立即隱藏/` 不受影響）。其餘三個方向的文案不動。

### 4.3 三態（§13 第 4 條在「一次請求取整份詳情」下的落地；**對開工 prompt 第 1 條的偏離**）

開工 prompt 第 1 條寫「區塊各自三態且失敗不連坐」；本頁只有一個請求，沒有分區各自的讀取，所以改寫為下列三條，
**寫進 PR「偏離規劃說明」**〔審 29〕：

- **載入**：資料到齊才開 Sheet（現行行為），Sheet 內不放骨架；載入回饋在**觸發鈕**上（§4.4）。
- **錯誤**：整份詳情取失敗＝維持現行路徑（不開 Sheet、`actionError`，test 367），加上捲進視窗與聚焦（§2）。
  動作後重讀失敗＝`panelError`「已更新，但重新讀取詳情失敗…」**只出現在管理區，其他分區保留上一份資料**——
  這條全 repo 目前沒有測試，階段 4 補一條 vitest（抽元件時最容易搬壞）。
- **空**：逐區一般文字（§4.1 表最後一欄），不用錯誤色。

### 4.4 「查看」→ Sheet 的回饋與焦點

- 觸發鈕（桌機表格與手機卡片）用 `Button` 的 `loading`：轉圈＋`disabled`＋`aria-busy`；`aria-label`
  「查看 {name} 的詳情」不變（Loader 圖示 `aria-hidden`，名稱不受影響）。狀態模型見 §2（`openingIds`＋序號）。
- 按鈕上的 `aria-busy` 多數報讀器不播報：在途期間另渲染一個 sr-only `role="status"`「正在讀取 {name} 的詳情」
  （比照列表載入態的寫法）〔審 18〕。
- 焦點〔審 18〕：開啟時 `onOpenAutoFocus` 把焦點放到 `SheetTitle`（`tabIndex={-1}`）——不讓 Radix 預設落到 DOM 第一個
  可聚焦元素（現在是畫面外的管理鈕，且「恢復」沒有確認框）；關閉時把焦點還給**同一位會員的「查看」鈕**（以會員
  id 找回，因為 loading 期間觸發鈕被停用、Radix 記不到它）。

### 4.5 手機與桌機

- **Sheet 結構**〔D8；審 7〕：比照 `HomePage.tsx:553`／`ReferralTreeView.tsx:683` 的 Sheet——`SheetContent` 拿掉
  `overflow-y-auto`、加 `gap-0`；身分卡（`SheetHeader`）固定在上；分區內文包一層 `min-h-0 flex-1 overflow-y-auto px-4
  pb-6`。關閉鈕因此不再隨內容捲走。身分卡要緊湊（標題＋Badge 列＋兩行），375px 下占不到 1/5 高。
- **375px**：`SheetContent` 已是 `w-full`（覆寫原語的 `w-3/4`），維持全螢幕。現況「內文左右貼齊螢幕邊緣」（原語
  沒有內距）由上面的 `px-4` 修掉。
- **關閉鈕避讓**〔審 8〕：關閉鈕實占右緣約 12–62px（`right-3`＋`p-3`＋`size-6`＋1px 框），身分卡右側留白 `pr-16`
  （64px），並由 e2e 量測（標題右緣 ≤ 關閉鈕左緣）驗證，不靠目視。
- **桌機**：維持 `sm:max-w-lg` 右側欄，結構與手機相同。
- 管理鈕 `size="sm"`，觸控裝置靠 `pointer-coarse:min-h-[44px]` 達 44px（§1）。不碰 `--raised`。

### 4.6 定位器契約（開工 prompt 第 7 條；friction-log 2026-10-05「漏網」的教訓）

已對 `e2e/`（含 `journey/`）與 `src/**/*.test.tsx` grep 過 Sheet 內每個可見字串、按鈕名稱與 aria-label：

| 會動到的字串 | 改成 | 依賴它的定位器 | 處置 |
|---|---|---|---|
| dt「推薦人」 | **不變** | journey f70 `get_by_text("推薦人", exact=True)`（`f70_renewal_saga_steps.py:164`） | 維持原字；**整頁只能有一個**完整等於「推薦人」的節點（Playwright strict mode）；分區標題用「推薦關係」不撞；vitest 斷言恰好一個 |
| 推薦人姓名 dd | **不變**（只放姓名） | f70 `get_by_text(P0 姓名, exact=True).first` | 不得包成「王小明（預設）」 |
| 「查看 {name} 的詳情」 | **不變** | f70 `:159`、`test_overflow_sweep.py:451`（`name="查看"` 子字串）、vitest 多處 | 加 `loading` 不改名稱 |
| 「暫停／恢復／設為管理員／撤銷管理員」 | **不變** | vitest 多處 `getByRole('button', {name})` | 只改 tone |
| 「確認暫停／確認授予／確認撤銷」 | **不變** | vitest 206、250、268、439、485、501、517 | 只改確認鈕 variant |
| 「帳號正常／帳號已暫停」 | **不變** | vitest 266、269（`getByText` 完整比對） | 帳號區不得再出現同一字串 |
| 暫停確認框 body | 後果描述改一句〔D6〕 | vitest 221 `/刊登將立即隱藏/` | 保留該片語 |
| 「尚無提領記錄」 | **不變** | vitest 385 | — |
| h3「近期提領記錄」 | 「近期提領」 | 無 | 直接改 |
| dt「會籍」「到期日」 | 移入身分卡 | 無 | 直接改 |
| Sheet 關閉鈕 sr-only「Close」 | 「關閉」 | 無（`profile_steps.py:95` 的「Close」是 `dialog.tsx`，不動） | 只改 `sheet.tsx` |
| 新增：分區標題、註冊日、暫停時間、處理中、匯款時間、完成時間、退件理由、備註、退回理由、敏感資料說明、尾註、sr-only 載入提示 | — | 無（新字串） | e2e 以 `get_by_role("heading", name=…, exact=True)` 定位分區標題（「帳號」「管理」不加 exact 會子字串誤中） |

收尾前再跑一次同一組 grep（舊字串＋新字串），結果寫進 PR 描述。

## 5. 階段切分（每階段一個 TDD 紅綠循環；重構先行、各自綠到綠）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | **重構（綠到綠，無紅燈）**：(a) 搬出 `WithdrawalStatusBadge`；(b) 搬出 `MemberStatusBadges`、`MemberCardList` 改 import；(c) 純抽出 `MemberDetailSheet`（版面不變） | 新 `WithdrawalStatusBadge.test.tsx`（四態＋未知值 fallback，含待查收＝warning）；`WithdrawalManagement.test.tsx`、`MemberManagement.test.tsx` 既有 it **零修改**全綠 | 三個子步驟各自一個 commit，每個 commit `npm run check` 綠；§11 九條既有測試不動照綠 |
| 2 | 「查看」回饋、請求序號、錯誤可見、焦點 | `MemberManagement.test.tsx`（桌機＋手機兩個 describe 各補） | 在途鈕 `aria-busy`＋`disabled`、同列再點只呼叫一次；A 在途點 B（B 先回、A 後 reject）→ 開的是 B、無 `actionError`、A 的鈕結算後恢復；A 在途點 B、B 先回後 A 成功 → 面板仍是 B；處理中關閉 Sheet 後重讀回來不重開；關閉後開 B，A 的重讀晚到不換掉 B；失敗時錯誤框取得焦點；在途有 sr-only 狀態；開啟焦點在標題、關閉焦點回到該列「查看」；test 367 原樣綠 |
| 3 | 分區結構與身分卡（含新欄位、Sheet 捲動結構） | 新 `MemberDetailSheet.test.tsx`（直接 render 驗條件矩陣）；e2e `test_admin_mobile_layout.py` 新增 375px 測試＋最壞資料夾具（先紅） | 分區標題依序（帳號→點數→近期提領→推薦關係→敏感資料→管理）；身分卡 Badge 異常在前；無名不重複 Email；到期行兩種時態與 null；各區主項與空態；處理中（含手續費）；匯款／完成時間只在對應狀態；`note` 依狀態標退件理由或備註；暫停時間只在停權；退回理由只在 rejected；「推薦人」完整比對恰好一個；遮罩值不變；筆數 ≥ 10 出尾註；日期跨日測資；四顆鈕只呼叫 `onRequestAction`（斷言 payload）、子元件不渲染 alertdialog。e2e（最壞資料：無空白長 Email、長姓名、10 筆提領含長退件 note 與待查收、證件退回長理由、停權＋管理員）：Sheet 左右間距 0、六個分區標題 `to_be_visible`（`exact=True`）、Sheet 內 `scrollWidth ≤ clientWidth`、分區標題離視窗左緣 ≥ 8px、`SheetTitle` 右緣 ≤ 關閉鈕左緣 |
| 4 | 管理區三分法、確認鈕、暫停文案、重讀失敗不連坐 | `MemberManagement.test.tsx` | 暫停、撤銷管理員帶紅框字（`border-destructive-border`）；恢復、設為管理員是次要外觀；面板內沒有實心鈕（無 `bg-primary`／`bg-brand`）；確認暫停、確認撤銷紅實心（`bg-destructive`），確認授予不是；暫停確認框 body 含「無法進入會員區」類描述且不再含「會員區瀏覽不受影響」；重讀失敗時 `panelError` 在管理區、其他分區仍顯示舊資料；既有 §11 測試全數不改照綠 |
| 5 | 文件同步 | `check-plans-scaffold.py`、`framework-check.sh`（規格書 §13 為**人工同步、無機械把關**，`check-spec-drift.py` 抓不到元件表描述文字）〔審 26〕 | §8 清單全數落地 |

- 既有 `MemberManagement.test.tsx` 的 `it` **只增不減、不弱化**。預期不需要改任何現有 `it`（暫停文案的斷言是
  `/刊登將立即隱藏/`，不受 D6 影響）；若非改不可，停手記進 progress.md Blockers 並寫偏離說明。
- 測試命名照 `.claude/rules/test-naming.md`（vitest 中文 `<情境>時，<預期>`；e2e 函式英文）。新元件配同名測試檔
  （`MemberDetailSheet.test.tsx`、`WithdrawalStatusBadge.test.tsx`）〔審 22、24〕；跨元件的整合行為留在
  `MemberManagement.test.tsx`。
- 每階段結束跑 `npm run check`；送 PR 前 `npm run check:full`＋`framework-check.sh`；e2e 新測試在 CI 的 e2e 軌驗
  （本機有 Chromium 時先跑一次）。

## 6. 裁決紀錄（原開放問題，已全數裁決）

- **Q1**（業主 2026-10-05，session 內）：區塊「會籍與金流」改名「點數」。補充理由：契約沒有任何付款／訂閱交易欄位，
  「金流」實質只剩點數〔審 32〕。
- 以下業主 2026-10-06 於 PR #365 留言 6008679860 裁決：
  - **D1＝a**：會員詳情用與提領管理同源的 `WithdrawalStatusBadge`，後台待查收維持 `warning`；會員端改 warning 與
    遺留結案留 S7（construction-plan S7 prompt (4)）。原 Q2 撤回。
  - **D2＝a**：近期提領上移到點數之後。
  - **D3＝a**：確認暫停、確認撤銷紅實心；確認授予墨黑。§12.11 寫「確認鈕跟觸發鈕同類」與判準句。
  - **D4＝a**：設為管理員 `secondary`；§12.11 表格、母計畫 plan.md §4 第 10 點、construction-plan S2e 第八條改寫。
  - **D5＝a**：五類欄位全部呈現（零 API 變更）。
  - **D6＝a**：暫停確認框後果描述本 PR 修正，寫進偏離說明。
  - **D7＝a**：重讀與「查看」共用序號，關閉即作廢。
  - **D8＝a**：身分卡固定、分區內文捲動。
  - **D9＝a＋b**：規格書 §13 改成「搜尋」，§14 加一列落差；PR 說明單獨標出。
  - **D10＝b**：處理中維持灰字一行（理由見 §4.1）。
  - **D11＝a**：近期提領列內已退件維持同源。
  - **D12＝a**：`apiClient` 逾時記遺留。
  - **D13＝a**：`MemberAction` 留在 `MemberManagement.tsx`。
  - 原 Q5 由審查降為設計決策：在途集合＋最後點擊勝出（§2）。

## 7. 風險與回滾

- **最壞情況**：(1) journey f70 的「推薦人」撞名或被改字 → 晉升 PR 才紅；防線是 §4.6＋收尾 grep＋vitest「恰好一個」。
  (2) 抽元件時把確認判斷搬進子元件、造成兩條路徑 → 防線是重構階段既有 §11 測試零修改、子元件只收 `onRequestAction`、
  `MemberDetailSheet.test.tsx` 斷言子元件不渲染 alertdialog。(3) 序號守衛寫錯讓面板開不起來或轉圈卡死 → 階段 2 的
  競態測試逐條覆蓋。(4) e2e mock 與真端點分岔 → mock 守住兩個不變式，最壞夾具同時餵 375px 測試與 overflow sweep。
- 純前端呈現層改動（加一句確認框文案修正），無資料、無 API、無 migration。回滾＝revert PR。
- 實作模型：construction-plan §2 定 Sonnet。

## 8. 文件同步清單（開工 prompt 第 8 條；階段 5）

- [ ] **規格書 §13 會員管理列**（`uknow-software-specification.md:654`，人工同步、無機械把關）：「會員詳情（含近期提領
  記錄，身分證與銀行帳號遮罩）＋面板底部的『管理』區」改寫為分區描述（固定身分卡＋帳號／點數／近期提領／推薦關係／
  敏感資料＋底部管理區）；同格「狀態篩選／排序」改成實際有的「搜尋」〔D9a〕。
- [ ] **規格書 §14** 新增一列〔D9b〕：會員列表狀態篩選／排序——後端 `/admin/members` 已收 `status`／`sort`，前端只有搜尋。
- [ ] **`ui-ux-guidelines.md` §12.11**：(a) 表格「後台的…設為管理員」改「確認授予（確認框內）」，註明面板內的設為
  管理員／撤銷切換鈕是流程起點、屬次要〔D4〕；(b) 新增「確認鈕跟觸發鈕同類：紅框字觸發（暫停、撤銷、刪除、退回、
  退件）→ 紅實心確認；次要觸發 → 墨黑確認。紅實心看的是破壞性（對那個人造成失去），資料層可逆性只決定要不要
  確認框（§11.3），不決定顏色」〔D3〕。§11〔實作〕指向 `MemberManagement.tsx` 不變〔D13〕。
- [ ] **母計畫 plan.md**：§3 A3 列的區塊改成「身分卡→帳號／點數／近期提領／推薦關係／敏感資料→管理」〔Q1、D2〕；
  §4 第 10 點的「設為管理員」同 D4 改寫。
- [ ] **construction-plan**：S2e 第八條的「設為管理員」同 D4 改寫；§4.3 驗收 2 表格儲存格的「S4 部分」只留指標，
  表格下另立「驗收 2・S4 清單」小節（草稿見下）〔審 30〕。
- [ ] **母計畫 progress.md**：S4 列（狀態、PR、驗收站備註）；「計畫異動記錄」記一行（Q1 命名、D2 順序、D3／D4 規則、
  D6 文案）；遺留事項——待查收那條**不結案**（留 S7），新增「近期提領無總筆數、UI 看不到單一會員完整提領史（提領
  管理無搜尋框、後端已支援 `search`）」（退場：後端加 total 或前端接搜尋）、「`apiClient` 加 `AbortSignal.timeout`」
  （退場：全站逾時落地）、「`dialog.tsx` 關閉鈕 sr-only 仍是英文 Close」（退場：改中文並同步 `profile_steps.py:95`）。
- [ ] PR 描述：「偏離規劃說明」寫明 §4.3 三態改寫、D6 文案修正；單獨標出 D9 的既有落差修正。
- [ ] 收尾刪除 `docs/plans/member-detail-redesign/`（`/tdd-implement` 收尾負責）。

**驗收 2・S4 清單草稿**（放 construction-plan §4.3 表格下方）：

- 手機（375px，建議 LINE 內建瀏覽器）：
  - [ ] 點「查看」到 Sheet 出現前，那顆鈕在轉圈、連點不會開兩次
  - [ ] Sheet 全螢幕；身分卡固定在上，看得到姓名、Badge（停權者「已暫停」在最前、管理員有「管理員」）、會籍到期或「已於…到期」
  - [ ] 往下依序是帳號／點數／近期提領／推薦關係／敏感資料／管理，內文左右有留白、不貼邊；捲到底關閉鈕仍在右上
  - [ ] 近期提領每筆看得到金額、狀態徽章、申請時間；待查收有匯款時間、已完成有完成時間；退件的列有「退件理由」；
        徽章顏色與提領管理頁同一筆一致；有 10 筆時底下寫「最多列出最近 10 筆」；沒有提領時寫「尚無提領記錄」
  - [ ] 點數區：可提領是大字；「處理中 N P（含手續費）· 已提領 N P」一行不從數字中間斷開
  - [ ] 敏感資料區一眼看得出是敏感資料，身分證與帳號只顯示部分碼，沒有任何「顯示完整」；證件被退回時看得到退回理由
  - [ ] 管理區：暫停／撤銷管理員紅框字，恢復／設為管理員白底灰框，鈕高好按（44px）；按暫停或撤銷跳出的確認鈕是紅實心、
        按設為管理員跳出的確認鈕是黑；暫停確認框寫的是「無法進入會員區」，不是「會員區瀏覽不受影響」
  - [ ] 長姓名不會鑽到右上關閉鈕底下；無名會員標題是 Email 且不重複印第二次
- 桌機：
  - [ ] Sheet 是右側欄（約 512px 寬），分區順序與手機相同
  - [ ] 表格列的「查看」同樣有轉圈回饋；鍵盤 Tab 到「查看」按 Enter，Sheet 開啟後焦點在姓名標題，按 Esc 關閉後焦點回到那顆「查看」
  - [ ] 管理區按鈕外觀與確認鈕顏色同手機；面板內沒有任何實心鈕
  - [ ] devtools `.dark` 看一次分區標題與分隔線的層次
