# 管理後台強化規劃書（v2）審查報告

審查對象：`./plan.md`（v2，工作驅動改寫）
審查方式：四個 fresh-context subagent 平行審查，本檔只彙整、去重、排序，**不改判**。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 2 | 5 | 0 | backfill SQL 判準、既有 4 個提領測試的影響盤點 |
| 架構 | 0 | 5 | 4 | `api/index.ts` 不拆檔的決定、`get_reward_summary`／`stat-card-grid` 復用、`appShell` 契約未動搖、5 欄 Tab 未觸碰、`prevent_admin_escalation`／advisory lock 引用屬實、階段 4.1 的抽取式地雷描述精確 |
| UI/UX | 0 | 5 | 3 | 模式一致性（系統性沿用既有元件）、admin 入口取捨（Navbar 非 BottomNav 是選對元件）、隱私開放問題的處置方式 |
| 需求 | 1 | 2 | 2 | 裁決 1–5 的溯源、裁決 6 的解讀（v2 修正了 v1 誤讀）、開放問題 #2–#5 維持開放屬正確、模組邊界未蔓延、未新增應走 `reward_config` 的硬編常數 |

**合計 3 P0、17 P1、9 P2。** 有 P0 → 必須修訂規劃後重跑 `/review-plan`，或由人明文豁免。

---

## 發現清單（依嚴重度排序）

### P0

**[P0]〔§2.2 資料層〕`withdrawal_events` 新表完全沒有 RLS/GRANT 處理，牴觸本專案零例外的建表慣例**
→ 建表時比照 `system_alerts`／`referral_king_rewards`／`member_verify_logs`／`announcements` 加 `enable row level security` + `revoke all from anon, authenticated`。
依據：`20260717000001_service_role_grants.sql` 明訂「一律不做 blanket grant，每張新表自己顯式收緊」；本 repo 現有新表零例外皆如此。該表存 `admin_id`／`bank_ref`／`note`，照字面實作時任何登入使用者可能經 PostgREST 讀到全站提領稽核紀錄。

**[P0]〔§2.1／§2.2／§2.3 新函數〕新 SECURITY DEFINER 函數都沒有明文要求 `revoke execute from anon, authenticated, public`，而 Postgres 對函數 EXECUTE 預設授予 PUBLIC — `admin_set_member_admin` 缺這行是真實提權漏洞**
→ migration 必須為每個新函數加上 revoke。
依據：本 repo 50+ 處 SQL 函數零例外都有 `revoke execute`。關鍵鏈條：PostgREST 的 `rpc/admin_set_member_admin` **不經過 Hono middleware**，而 SECURITY DEFINER 執行時 `current_user` 是函數擁有者，正好滿足 `prevent_admin_escalation` 的放行條件 → 一般會員可把自己設成管理員。§7 風險表寫的「三道防線」漏了最關鍵的函數層 EXECUTE 收回。同一缺口也適用 `admin_review_id`／`admin_list_id_reviews`／`admin_batch_mark_paid`／`admin_member_detail`（後果較輕）。

**[P0]〔§2.1／§10.1〕證件審核被設計成 `request_withdrawal` 的新阻擋守衛，超出需求方裁決 #6 的範圍、規格書無依據、且未列入開放問題**
→ 規劃書需明確論證「為何審核結果必須阻擋提領申請」，或把這個判斷退回列為開放問題讓需求方裁決。
依據：裁決 #6 只確立「§13『資料審核』原意是證件審核流程」，沒有裁決「審核未通過就不能申請提領」。規格書 §10.1 現行 #5 只檢查「已上傳」。**存在更小的替代方案**：讓 `id_verification_status` 純做 admin 審核佇列與「跨提領免重審」的內部工具，**不接進守衛鏈**——V1–V4 照樣成立（上傳觸發 pending、佇列出現、退回填理由、換照片重置），但不阻擋任何人。如此則不必動 §5.3、不必解耦 dialog、V5 backfill 不再是「上線即客訴」等級的急迫項。

### P1

**[P1]〔§2.2〕規劃沒交代新版 `admin_update_withdrawal_status` 是否停止寫入 `withdrawals.note`**
→ 需明文寫「`note` 只寫進 `withdrawal_events`，主表欄位停止更新」，或明訂欄位語意並把 `GET /admin/withdrawals`（現行 `index.ts:1092` 直接回 `w.note`）與 `GET /rewards/withdrawals` 一律改讀事件表最新一筆。
依據：若保留 `note = coalesce(p_note, note)`，新增的 `awaiting_collection → completed`（note 必填）會覆寫前一次的 note——**v1 被判定有缺陷的那個 bug 在主表欄位層級原樣重演**。

**[P1]〔§2.2〕`admin_batch_mark_paid` 簽名只有一組共用 `p_note`、無逐筆 `bank_ref`，達不到驗收情境 W2**
→ 簽名改成可攜帶每筆各自 `bank_ref` 的結構（如 `jsonb` 陣列 `[{id, bank_ref}]`）。
依據：W2 明訂「交易序號可逐筆填或留空」；批次是 admin 主要工作流，此缺口直接削弱 §2.2 自稱的「`bank_ref` 是唯一對帳錨點」。

**[P1]〔§2.2〕「部分失敗不整批回滾」在 Postgres 函數預設單一交易語意下不成立**
→ 需明訂每筆包 `begin...exception when others...end`（savepoint 隔離），並在階段 2.3 驗證標準加「硬錯誤不應讓已成功筆數跟著回滾」。
依據：既有慣例是 `apply_referral_side_effects`（`20260720000001_wave4_guards.sql:270-311`），規劃未引用。

**[P1]〔§2.1〕`/rewards/upload-id-photos` 允許只傳一張，規劃只寫「上傳→一律設 `pending`」**
→ 需明訂僅在 front 與 back 合計皆非 null 時才轉 `pending`，否則維持 `none`。
依據：現行端點 `index.ts:2357-2412` 只擋「兩張都沒傳」。只傳一張的人會看到「證件審核中」這個**錯誤訊息**（他根本沒交齊），且 admin 佇列會出現缺一張圖的送審紀錄，規劃未交代 UI 如何處理。這是解耦引入的真實回歸。

**[P1]〔§2.1〕PR1（規劃自承風險最高的一段）沒有像 §2.2／§2.3 一樣列出 REST 端點表**
→ 比照補一張 method/path 表，並在 `ADMIN_ROUTES` 提醒旁寫出要登記的確切路徑字串。
（架構視角以 P2 提出同一缺口，依聚合規則保留較高的 P1。）

**[P1]〔§3／§2.3〕「PR 3 獨立，可平行」與規劃自身規格矛盾**
→ §3 應更正為「PR3 對 PR1 有欄位級硬相依」，或把 `id_verification_status` 的曝光從 PR3 抽掉。
依據：`admin_list_members()` 與 `admin_member_detail()` 都要回 `id_verification_status`，該欄位由 PR1 的 migration 新增。PR1 未合併前 PR3 的 SQL 函數無法通過。

**[P1]〔§3／§2.2〕PR1→PR2 的依賴理由未落地成規格**
→ 若「參考入口」是真需求，§2.2／§2.4／2.6 需補對應欄位與元件變更點；若只是排序建議，§3 措辭應誠實反映。
依據：§3 說「審過就不必把證件照放在匯款動線正中央，只留參考入口」，但 `GET /admin/withdrawals` 變更表只加 `stats`／`events`；現有 `IdCardDialog`（`WithdrawalManagement.tsx:50-108`）在整份規劃裡完全沒被提及要保留、替換或移除。

**[P1]〔§3／§7〕既有測試影響清單漏掉兩個會直接紅燈的檔案**
→ 階段 1.2 驗證標準需納入 `suspension-guards.test.ts`（`createWithdrawableUser` 第 29-46 行、第 74-90 行 characterization）與 `cancel-signup-guard.test.ts`（第 57-90 行）。三個檔案各自複製了幾乎一樣的 helper，可趁機收斂進 `test-helpers.ts`。
依據：兩者都獨立呼叫 `request_withdrawal` 並斷言 `success: true`，建立使用者時只設照片路徑、從未設 `id_verification_status`。

**[P1]〔§1.4／§2.1／§5 PR1〕證件審核 UI 沒有掛載點的落地階段**
→ §5 PR1 需加一個最小分頁殼階段，或在 1.5 內明列由誰在哪個元件掛載。
依據：§1.4 裁決「併入會員管理 Tab 的次分頁」，但 `MemberManagement.tsx` 現況是單一列表、沒有次分頁殼，而重構要等 PR3 階段 3.4。PR1 先合併會出現「功能建好但站內無入口可達」的空窗期。

**[P1]〔§2.1／§3／§7〕「需回頭確認四契約」對 `multi-step-flow-recovery.md` 明文的強制要求而言不夠**
→ 階段 1.4 需明確定義：轉場時是否保留已輸入金額、是否用同一 dialog 內嵌顯示狀態（而非跳轉整頁清空表單），寫進驗收標準。
依據：該文件 §4 開頭寫明「必須滿足四條，缺一不可」，規劃只有一句「需回頭確認」。最關鍵是契約 #2（可重入入口）：既有已知的「關閉 dialog 遺失草稿」弱點會從邊緣情境被放大成**每個首次提領且未過審的會員都會踩到的主要路徑**。

**[P1]〔§2.1／§3／§5 階段 1.4／§7〕「提領 dialog 從 3 步變 2 步」與現行程式碼不符，驗收標準不可測**
→ 需明確畫出重排後每一步裝哪些欄位，再回頭核對四契約與步驟數宣稱。
依據：現行 step 3 有**四樣東西**——身分證字號輸入＋即時驗證、銀行代號、銀行帳號、照片上傳；且 `POST /rewards/withdraw` 要求同一次請求帶齊 `idNumber`／`bankCode`／`bankAccount`。規劃只交代搬走照片，沒說另外三樣去哪。「3 步變 2 步」在 §3、階段 1.4、§7 三處都這樣寫，與程式碼現實矛盾。

**[P1]〔§6 開放問題 #1／§7〕backfill 的衝擊揭露只停在散文，沒有變成部署前的硬性關卡**
→ 在 §5 階段表或 §7 加一列明確的部署前置條件（如「正式站執行 backfill 前先跑 `count(*)`，受影響人數 > N 時需求方需書面確認」）。
依據：§7 把它列為最高風險並寫「上線即客訴」，但翻遍 §5 階段表沒有任何一階段要求先查詢受影響人數並取得結果。

**[P1]〔§4／§2.3〕提領作業台手機降級的範圍比「匯款需開網銀」這個正當理由更寬**
→ 手機版應區分「匯款動作（鎖）」與「非匯款狀態操作／理由／事件查看（開放）」，不要用單一「唯讀」旗標概括。
依據：`plan.md:255` 寫「唯讀卡片列表（可看狀態、不做匯款）」，把「不能匯款」與「不能做任何操作」混為一談。但退件、代為完成、查看退件理由都不需要開網銀，正是 §1.1 明列「隨時」發生、走手機的客服工作。

**[P1]〔§2.3／M1〕會員查詢台答不出自己設定的頭號客服情境**
→ 在 `admin_member_detail` 加入該會員近期提領記錄（狀態、退件理由、匯款／查收時間），或明文指定客服查詢的第二步驟並確保該畫面在手機上能看到 note／events。
依據：`admin_member_detail`（`plan.md:206-208`）與 M1（`plan.md:64`）完全沒有提領記錄欄位，但 §1.1 明列頭號客服情境正是「我提領怎麼還沒到」；而能回答的提領作業台在手機又被降級。

**[P1]〔§5 階段切分〕三個全新畫面的驗證標準都沒把三態寫進驗收條件**
→ 1.5（IdReviewQueue）、2.6（作業台前端）、3.4（查詢台前端／詳情 Sheet）各補一行三態斷言，可比照 `ReferralTreeView.tsx:584-594` 的 `status: 'loading' | 'error' | 'done'` 模式。
依據：§4 有寫一般性原則，但 TDD 只會做驗證標準要求的行為，原則不落進驗收條件等於沒有強制力。

**[P1]〔§2.1／§7〕證件審核解耦沒有處理「首次提領會員的新等待」**
→ 至少在會員端證件區塊加上期望值文案，或在完善資料／首次登入流程提早引導上傳。
依據：解耦只把「卡住」從 dialog 內部搬到外部；對第一次提領的會員，總等待時間未必變短，反而多一次「離開提領意圖、找到上傳區塊、之後再回來」的往返。§7 只處理 backfill（既有會員），完全沒處理上線後所有新的首次提領會員。

**[P1]〔§4／§2.2〕批次標記的防呆不足，且「全選」的作用範圍全文未定義**
→ 確認框至少列出受影響會員姓名清單（或允許在確認框內逐筆勾掉），並明定「全選」限於目前篩選結果、有明確計數提示，不悄悄擴大到未載入的頁。
依據：這個動作在系統內**不可回退**（§2.2 明文不做 `awaiting_collection → rejected`，只能走系統外人工 adjustment）。只顯示聚合筆數與總額無法讓 admin 核對「是不是那 12 筆」，金額相近時聚合總額不會露出異常。

### P2

**[P2]〔§4〕「復用 `copyText`」需要先做一次抽取才成立**
→ 先抽成獨立 utility（如 `src/utils/clipboard.ts`）並列為 §5 的工作項。
依據：`InviteFriendPanelContent.tsx:40` 的 `copyText` 是元件內部 closure（依賴同檔 `useNotification()`），沒有 export。不處理就會變成複製貼上，恰好違反規劃自己想避免的重複邏輯。

**[P2]〔§2.4〕`ADMIN_ROUTES` 的把關作用被誇大**
→ 措辭修正。實際權限把關是 `app.use('/admin/*', ...)` middleware（`index.ts:963`），已對整個命名空間生效；現有 `POST /admin/withdrawals/:id/status`、`POST /admin/members/:id/suspend` 本來就不在 `ADMIN_ROUTES` 裡卻依然受保護。它是回歸測試的取樣清單，不是保護機制本身。

**[P2]〔§4／§5〕分頁／加載更多模式三處各自實作，沒抽共用 hook**
→ 至少在第三次出現時（PR3）抽出共用 hook。
依據：`ReferralTreeView.tsx:622-639` 是手刻在元件內的 state 邏輯（非獨立 hook），PR2（W6）與 PR3（M2）都要「比照」。

**[P2]〔§3／§5 階段 1.4〕提領 dialog 兩步各裝什麼欄位未交代**
→ 建議規劃至少畫出新兩步的欄位分配，降低實作時的猜測空間。
依據：既有三圈步驟指示器與 `validateStep1`／`validateStep2` 邊界在合併後需重新切。

**[P2]〔§2.1〕會員端證件區塊插入獎勵頁的位置未指定**
→ 建議放在提領按鈕之後，或用可摺疊區塊（僅在狀態非 approved 時展開提醒）。
依據：若排在「申請 Point 提領」主要 CTA 之前，會拉長手機首屏到主要行動的捲動距離。

**[P2]〔§4〕必填理由 Textarea 與批次 checkbox 的 a11y 未規劃**
→ 必填理由欄位接 `FieldError`／`aria-invalid`（`src/utils/formHelpers.tsx` 已有 pattern）；checkbox 補「選取 {會員名} 的提領記錄」這類 aria-label。
依據：只提到「空白時送出鍵 disabled」。IdReviewQueue、批次 UI 都是全新元件，複製既有反模式等於在新元件裡添新債（CLAUDE.md 明文「別再添新債」）。

**[P2／需人工裁決]〔§2.1／§5.3〕§5.3 例外文字的必要性存疑**
→ 見「需人工裁決」節。

**[P2／需人工裁決]〔§1.4〕「不做什麼」沒有明確排除「admin 代改會員銀行資訊」**
→ 見「需人工裁決」節。

---

## 需人工裁決

1. **§5.3 是否真的需要為證件審核加例外文字？**（需求視角，P2）
   §5.3 字面只約束「停權優先擋 → 到期再擋」這兩步的**相對順序**，不是要求三個守衛擁有相同檢核集合——`request_withdrawal` 早就有 5 條獨有守衛（#2 not_joined、#3 invalid_amount、#5 missing_id_photos、#6 already_withdrawn_today、#7 insufficient_balance）且都沒特別註記例外。若證件審核需要註記，其他 5 條依同一邏輯也該補，否則是選擇性補文件。建議改成在 §5.3 開頭寫一般性原則一次講清楚。

2. **「admin 代改會員銀行資訊」要不要明確排除？**（需求視角，P2）
   W1 只描述 admin「看到」帳號並複製，沒說明匯款前發現帳號填錯（常見客服情境）時能不能更正。目前唯一路徑是退件讓會員重新申請，且受單日一次限制要等隔天。建議在「不做什麼」補一句明確定案，或列為開放問題。

3. **`withdrawal_events.withdrawal_id` 的 `on delete cascade` 與稽核保留原則衝突**（系統視角）
   `withdrawals.user_id` 本身也是 `on delete cascade`。串起來：刪除一個 `profiles` 列會把這張「金流稽核不能丟歷史」的表整批砍光，直接牴觸它存在的理由。會員刪除不在本規劃範圍（§1.4 明訂不做），風險尚未觸發，但需一句話裁決：改用 `on delete restrict`，或明確接受這個技術債。

4. **`admin_review_id` 的合法轉換表未定義**（系統視角）
   是否允許把已 `approved` 的人改判 `rejected`（事後發現造假）？若不允許，需檢查目前狀態必須是 `pending`；若允許，需決定要不要連動已核准的既往提領。規劃沒觸及，需講清楚是刻意留白還是遺漏。

5. **P0 #3（證件審核是否該阻擋提領）的處置方向**（需求視角）
   審查者提出的「不阻擋」替代方案會連帶消解本報告數條 P1（四契約、dialog 步驟數、backfill 急迫性、首次提領新等待、§5.3 例外）。這是需求方的產品判斷，不是技術判斷。

---

## 審查期間已取得的需求方裁決（不在上述發現範圍內）

審查進行中，需求方回答了 plan.md §6 的部分開放問題：

- **證件審核 SLA**：對會員承諾「3 個工作天內」（原為未定）
- **開放問題 #2**：會員詳情面板**遮罩**身分證字號與銀行帳號（要全碼回提領作業台）
- **開放問題 #4**：匯款交易序號**選填**
- **手機權限邊界**：手機上可做退件、代為標記完成、查看事件；**只鎖「標記已匯款」**（此答覆正好對應本報告 §4 手機降級那條 P1，方向一致）

上述裁決需回寫進 plan.md §6 與 §4。

---

## 處置（人審後填寫）

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

- [ ] P0-1 `withdrawal_events` RLS/GRANT：□ 修訂 plan □ 豁免（理由：）
- [ ] P0-2 新函數 `revoke execute`：□ 修訂 plan □ 豁免（理由：）
- [ ] P0-3 證件審核是否阻擋提領：□ 維持阻擋（需補論證）□ 改為不阻擋 □ 退回列為開放問題
- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
