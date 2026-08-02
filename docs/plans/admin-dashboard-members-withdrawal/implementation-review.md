# 實作審查報告 — `feature/admin-dashboard-members-withdrawal`

審查對象：`git diff origin/develop...HEAD`（46 檔、+6908/-454、57 commits）。
四視角平行審查（系統／架構／UIUX／需求），各自獨立 context。

## 彙整

| 視角 | P0 | P1 | P2 |
|---|---|---|---|
| 系統 | 1 | 1 | 2 |
| 架構 | 0 | 2 | 3 |
| UIUX | 1 | 7 | 0 |
| 需求 | 2 | 2 | 1 |

**去重後：2 個 P0、9 個 P1、5 個 P2。**

**三個視角獨立指向同一個 P0**（退件缺理由輸入），這件事本身值得記：它不是
某個 reviewer 的偏好，是三條不同的推理路徑都撞到的同一堵牆。

---

## P0

### P0-1 退件在正式環境 100% 失敗 —— 且被我自己的測試錄成「預期行為」

**證據鏈**：
- `WithdrawalManagement.tsx` 的退件確認框沒有任何理由輸入元件，
  `updateStatus(target, 'rejected')` 的第三個參數恆為 `undefined`
- 後端 `admin_update_withdrawal_status`（`20260802000004:120-125`）明文：
  `if p_status in ('rejected','completed') and v_note is null then return note_required`
- 串起來：admin 每次點「確認退件」都拿到 400，而畫面上沒有任何欄位讓他補救

**為什麼三層測試都沒抓到**（這才是真正該記的部分）：
1. 元件測試把它錄成預期：測試名叫「退件走確認框，確認後才送出**並帶理由**」，
   斷言卻是 `toHaveBeenCalledWith('w1', 'rejected', undefined)`——**名字宣稱的
   行為與斷言證明的行為相反**。`updateStatus` 是注入的 mock，碰不到後端契約。
2. mock e2e 的替身沒有 `note_required` 邏輯，一樣測不到。
3. journey（打真後端）的 page object `reject_first_withdrawal()` 也沒填理由
   ——那條情境只在排程／晉升 PR 才跑，這個分支還沒推過去，所以尚未曝光。

**同一份 PR 裡，同一個模式做對了一次、漏掉了一次**：`IdReviewQueue.tsx` 的
證件退回正確做了 `Textarea` + `aria-invalid` + `FieldError` + 空值 disabled。
不是不知道正確做法，是提領作業台這邊漏做。

**已修**：退件與代為結案兩個對話框都補上必填 `Textarea`（比照 `IdReviewQueue`
的 pattern），測試名與斷言改成一致並拆成「沒填送不出去」「填了送到後端」兩條，
e2e page object 一併更新（journey 共用它）。

### P0-2 `completedByAdmin` 零讀者，而規格書已斷言該行為存在

`WithdrawalSection.tsx:195` 的 `filter(w => w.status !== 'completed')` 把所有
已完成記錄濾掉，所以「管理員代為結案」的揭露到不了任何會員面前。這是
progress.md B7 早就記下的缺口。

**但 4.1 讓它從缺口變成失真**：我在 §10.3 寫了「逾期未查收由 admin 代為結案，
**會員端明示『管理員代為結案』**」——規格書現在對外承諾了一個不存在的保護。
CLAUDE.md 的規則是「規格書與程式碼衝突時以程式碼為準，並在同一 PR 回頭修
規格書」；這裡是**規格書比程式碼多寫了一層保護**，同樣是失真。

需求視角對三個選項的評估：
- **(b) 代為結案當下另行通知：不可行** —— 直接牴觸 plan §1.4「不做通知推播
  ——本專案無 `notifications` 表」。這個選項在規劃階段就已被排除，B7 把它列進
  候選是我的疏漏。
- **(c) 移除欄位：不建議** —— 等於承認「誠實揭露」沒做，且與需求方明確否決
  「讓會員以為自己按過查收」的立場相反。
- **(a) 會員端顯示已完成記錄並標註：建議採用** —— 唯一同時滿足規格書斷言與
  §1.4 限制的選項。

**狀態：待人工裁決。** (b) 已被規劃排除、(c) 與需求方立場相反，實質只剩 (a)，
但這動到會員端的資訊密度，不由我單方決定。**在裁決前，§10.3 那句話是失真的**
——若決定不做 (a)，規格書那句必須撤回。

---

## P1（9 項）

| # | 視角 | 發現 | 狀態 |
|---|---|---|---|
| 1 | 系統／需求 | `bank_ref`／`transferred_on` 全線無輸入介面，且**端點根本沒轉發** `body.bankRef` —— 前端就算送了也會在邊緣函式被丟掉，事件表那兩欄永遠 null | **已修**（端點轉發 + 單筆標記已匯款加選填欄 + `AdminDashboard` 補 `transferredOn` 參數） |
| 2 | 系統／UIUX／需求 | 代為完成的理由寫死成 `'管理員代為結案'`，機械滿足 `note_required` 但稽核答不出「憑什麼認定會員已收到錢」 | **已修**（改 admin 自填必填） |
| 3 | 架構 | `usePagedList` **實際只收斂一處**（`WithdrawalManagement` 完全沒有 import 它，仍是手刻）—— progress.md 寫「收斂了兩處」與程式碼不符 | **已更正紀錄**；retrofit 待裁決 |
| 4 | 架構 | plan §2.2 明訂的 `GET /admin/withdrawals/summary`（輕量）沒實作，badge 改用列表端點——那條 handler 即使 `limit=1` 仍會替該會員的身分證產**簽名 URL** | 紅燈已寫，**待實作** |
| 5 | UIUX | 撤銷管理員沒有 `AlertDialog`（plan §4 明列的四個危險動作之一） | 待處置 |
| 6 | UIUX | 會員查詢台手機仍是 8 欄 `Table`，plan §4 明訂「手機優先：搜尋框置頂 + 結果卡片」 | 待處置 |
| 7 | UIUX | M3 的狀態篩選與排序 UI 完全未實作（後端已支援 `p_status`／`p_sort`） | 待處置 |
| 8 | UIUX | 統計卡未重用 plan §4 指名的 `ui/stat-card-grid.tsx`；搜尋框缺 `type="search"` | 待處置 |
| 9 | UIUX | 證件審核佇列無分頁也無「已顯示 X / Y」，後端預設 50 —— backfill 上線當下可能一次產生數十筆，超過就靜默截斷 | 待處置 |

## P2（5 項）

- `Navbar` 沒跟進 props 注入慣例（自己呼叫 `apiRequestJson`），與同 PR 其他元件兩套慣例並存
- `AdminDashboard.tsx` 聚集 9 個 module-level loader，橫跨三個網域
- `src/utils/referralInvite.ts` 仍有第二份手刻 `copyTextFallback`（階段 2.2 的同類掃描沒掃到）
- `id_submitted_at` 沒有索引
- B2「留到 3.4 顯示等待天數」的承諾未兌現（3.4 只碰了 `MemberManagement`）

---

## 這次審查證明了什麼

**CI 全綠、19 個階段逐一紅→綠、530 條前端測試 + 214 條後端測試，都沒有攔下
一個「核心動作在正式環境 100% 失敗」的缺陷。** 攔下它的是四個從規劃書出發、
獨立讀 diff 的視角。

原因不是測試寫得不夠多，是**測試分層在架構上碰不到那條契約**：元件測試把後端
換成 mock，mock e2e 把整個網路換成替身，而唯一會打真後端的 journey 套件，它的
page object 恰好也漏填了同一個欄位。三層各自都「通過」，因為三層都不知道
`note_required` 存在。

這正是 `/review-implementation` 存在的理由——CI 能證明「測試綠、型別對」，
證明不了「做的是當初審核通過的那個東西」。

## 處置（人審後填寫）

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
