# 管理後台強化（會員管理 + 提領管理）規劃書

## 0. 一句話

讓管理員能在後台**看見全部會員**、**查得到單一會員的完整狀況**，並且把提領從
申請一路**收尾到完成且留下稽核痕跡**——因為目前兩張列表都靜默截斷、卡在
「待查收」的提領無人能收尾、退件理由永遠到不了會員手上。

---

## 1. 使用者需求

**對照規格書**：§5.2 停權、§10 提領系統（§10.3 狀態機、§10.4 隱私取捨）、
§13 管理後台。

### 驗收情境

| # | 故事 |
|---|---|
| A1 | 平台有 120 位會員時，admin 在會員列表看到「已顯示 50 / 120 筆」，按「加載更多」能觸及第 51 位以後的人 |
| A2 | 「暫停會員」「管理員」統計卡顯示的是**全站**數字，不隨當前載入頁數變動 |
| A3 | admin 點某位會員 → 看到會籍到期日、點數餘額（可提領/處理中/已提領）、推薦人與直接下線數、註冊時間、銀行與證件資訊 |
| A4 | admin 可用狀態（訂閱中/已失效/已停權/管理員）篩選會員，可依註冊時間或到期日排序 |
| A5 | admin 可把另一位會員設為管理員、也可撤銷；系統永遠至少留一位管理員 |
| B1 | 一筆提領已匯款但會員三週沒按「查收」，admin 可代為標記完成，並留下「誰、何時、為什麼」 |
| B2 | admin 退件時**必須**填理由；會員在獎勵頁看得到那行理由 |
| B3 | 提領列表顯示「已顯示 X / Y 筆」與**待匯款總額**；CSV 匯出的是符合當前篩選的**全部**資料，不是畫面上那頁 |
| B4 | 任何狀態轉換都查得到經手管理員（`processed_by` / `completed_by`） |

### 不做什麼（明確排除）

- **不編輯會員的姓名／電話**——姓名格式規則（§4.2）有 `name-write-paths` 守衛與
  共用案例表，admin 側改名是另一條有自己風險的路，另案。
- **不刪除會員**（`/auth/delete` 已有自助路徑，且 index.ts:701 註記刪除會連
  withdrawals/referral_edges 一起消失，admin 代刪風險更高）。
- **不做通知**——本專案無 `notifications` 表，退件理由靠會員回站內查看。
  現行 `WithdrawalManagement.tsx:221` 的文案「通知會員款項已匯出」是虛的，
  一併改成不承諾推播的措辭。
- **不動 AdminDashboard 的 5 欄 Tab 結構**（§13 註記：硬加會壞版面）。
- 不做提領批次操作、不做提領的 `awaiting_collection → rejected`（錢已匯出，
  §6d 註記維持走人工 adjustment）。

---

## 2. 系統設計

### 2.1 資料庫（單一新 migration `20260802000001_admin_console.sql`）

**欄位**

```
alter table public.withdrawals
  add column processed_by uuid references public.profiles(id) on delete set null,
  add column completed_by uuid references public.profiles(id) on delete set null;
```

`completed_by = user_id` ⇒ 會員本人查收；`completed_by <> user_id` ⇒ 管理員代為。
**不另開 enum 欄位**——多一個可能與 `completed_by` 不一致的欄位，就多一個
說謊的地方。

**`admin_update_withdrawal_status()` 改寫**（`create or replace`）

- 受理狀態集合由 `{awaiting_collection, rejected}` 擴為
  `{awaiting_collection, rejected, completed}`。
- 合法轉換表（其餘一律 `invalid_transition`）：

  | from | to | 附帶效果 |
  |---|---|---|
  | `pending` | `awaiting_collection` | `processed_by = admin` |
  | `pending` | `rejected` | `processed_by = admin`，補償 adjustment（既有邏輯不動） |
  | `awaiting_collection` | `completed` | `completed_by = admin`、`completed_at = now()`，**不寫帳本**（扣款在申請時已完成，與 `confirm_withdrawal_collection` 同語意） |

- **`p_note` 對 `rejected` 與 `completed` 成為必填**（空白/null → `note_required`）。
  理由：這兩者都是「會員沒有同意、但錢的狀態被改變」的動作，金流稽核需要人話。
  `awaiting_collection` 維持選填。
- 同狀態重入維持既有冪等回應。

**`confirm_withdrawal_collection()` 改寫**：補寫 `completed_by = p_user_id`，
其餘不動。

**`admin_list_members()` 改寫**：回應加 `stats`（全站 `total` / `suspended` /
`admins` / `active` / `expired`，**在 filtered CTE 上算，不受 limit 影響**），
成員加 `end_date`（來自 `user_account_status`）；新增 `p_status`
（`all|active|expired|suspended|admin`）與 `p_sort`
（`created_desc|created_asc|end_date_asc|end_date_desc|name_asc|name_desc`）。
排序一律伺服器端算，比照 §7.3 的既有裁決。

**`admin_member_detail(p_user_id)`**（新，`security definer`）：單一會員的
會籍（`user_account_status.status/end_date`）、點數（`get_reward_summary` 復用，
不另寫一份餘額邏輯）、推薦人（`profiles.referred_by_user_id` → 姓名）、
直接下線數（`referral_edges`）、刊登數、銀行/證件路徑、停權時點、註冊時間。

**`admin_set_member_admin(p_admin_id, p_target_id, p_is_admin)`**（新）：
- 呼叫者須為 admin；
- 撤銷自己 → `cannot_demote_self`；
- 撤銷後系統將無任何管理員 → `last_admin`（advisory lock 序列化，比照
  `admin_setup_claim`）。
- 可行性已確認：`prevent_admin_escalation` trigger 放行 `service_role`/`postgres`
  （20260718000102 §2c），security definer 函數改得動 `is_admin`。

**`admin_withdrawal_stats(p_status, p_from, p_to, p_search)`**（新）：回符合篩選
條件的筆數與**待匯款總額**（`status='pending'` 的 `sum(amount)`，銀行實付金額，
不含手續費）。

### 2.2 API（`supabase/functions/api/index.ts`）

| 端點 | 變更 |
|---|---|
| `GET /admin/members` | 新增 `status` / `sort` query；回應加 `stats`、成員加 `endDate`；`limit`/`offset` 既有 |
| `GET /admin/members/:id` | **新**：會員詳情 |
| `POST /admin/members/:id/admin` | **新**：`{ isAdmin: boolean }`，422 對應 `cannot_demote_self` / `last_admin` |
| `GET /admin/withdrawals` | 新增 `from` / `to` / `search` query；回應加 `stats`（`pendingAmount`、各狀態筆數）；`total` 既有但前端未用 |
| `POST /admin/withdrawals/:id/status` | 受理 `completed`；`note` 對 `rejected`/`completed` 必填，缺 → 400 `note_required` |
| `GET /rewards/withdrawals` | 回應加 `note` 與 `completedBy`（僅回布林 `completedByAdmin`，不外洩 admin 身分） |

新端點必須登記進 `admin-gate.test.ts` 的 `ADMIN_ROUTES`（該表是機械把關的
權限清單）。

### 2.3 契約（`supabase/functions/_shared/api-contract.ts`）

`AdminMemberSchema` 加 `endDate: nullable(str())`；
`AdminMembersResponseSchema` 加 `stats`；
新增 `AdminMemberDetailSchema`、`AdminWithdrawalStatsSchema`；
`AdminWithdrawalRecordSchema` 加 `processedBy`/`completedBy`（nullable str）；
會員端提領記錄型別（目前寫死在 `WithdrawalSection.tsx:23`）加 `note`。

---

## 3. 架構影響

- **動到的既有模組**：`AdminDashboard`（不動 Tab 結構）、`admin/MemberManagement`、
  `admin/WithdrawalManagement`、`reward/WithdrawalSection`、`api/index.ts` 的
  admin 區塊與 `/rewards/withdrawals`、共享契約、一支新 migration。
- **路由 lazy 結構不變**——admin 已在 lazy 群組，新增的是同 Tab 內的元件。
- **四契約（multi-step-flow）不適用**：admin 側無多步驟表單，詳情面板是唯讀 +
  單一動作。
- **CSV 全量匯出的效能**：走「以當前篩選重打一次、`limit` 上限 2000」而非
  無上限；超過上限時**明示告知並拒絕匯出**，不靜默給半份財務清單。
- **安全**：`admin_set_member_admin` 是提權路徑，三道防線——API 層 `/admin/*`
  middleware、SQL 層 `is_admin` 檢查、`last_admin`/`cannot_demote_self` 防呆。
  `admin_member_detail` 回傳銀行/證件屬敏感資料，僅 admin 可達（見開放問題 #4）。
- **既有測試風險**：`profile-masking.test.ts:132` 是「admin 列表維持完整值」的
  characterization test，改 `/admin/withdrawals` 回應時**不得破壞**它。

---

## 4. UI/UX

對照 `docs/ui-ux-guidelines.md`：

- **§5 不得靜默截斷** → 兩張列表都用既有的「已顯示 X / Y 筆記錄」+「加載更多」
  模式，實作直接比照 `ReferralTreeView.tsx:626`（含 offset = 已取回筆數的續接、
  失敗不清空）。
- **§5 骨架屏** → 現行兩處都是置中 spinner（準則明列「可延伸：…後台列表」），
  改成與表格列同形的 `Skeleton`。
- **§7 雙套版面 + Sheet 抽屜** → 會員詳情用 `ui/sheet.tsx`（既有成熟模式），
  手機全寬、桌面右側抽屜。表格在手機維持橫向捲動（admin 是低頻桌面作業，
  不為它做卡片化改版——這是刻意取捨）。
- **§6 三態** → 每張列表與詳情面板都要空/錯/載入態；篩選後無結果的空態文案
  要與「尚無資料」區分。
- **§8 可測試性** → 搜尋框 `type="search"`、篩選用既有 `common/FilterChip`、
  切換鈕 name 隨狀態變動（「設為管理員」／「撤銷管理員」）。
- **統計卡** → 用既有 `ui/stat-card-grid.tsx`（手機兩欄），不要另刻。
- **危險動作** → 代為完成、退件、撤銷管理員都走 `AlertDialog` 二次確認
  （比照現行「已匯款」的既有慣例）；退件與代為完成的對話框內含**必填**
  `Textarea` 理由，送出鈕在理由空白時 disabled。

---

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | CSV 欄位跳脫純函式（抽 `src/utils/csv.ts`） | `src/utils/csv.test.ts`（node） | 逗號/引號/換行/前導 `=+-@` 公式注入皆正確跳脫 |
| 2 | 提領狀態機擴充：`awaiting_collection → completed`（admin 代為）+ `processed_by`/`completed_by` | `supabase/functions/api/withdrawals.test.ts` | 代為完成成功且 `completed_by` = admin；非法轉換回 `invalid_transition`；重入冪等；帳本不重複寫 |
| 3 | 退件／代為完成的理由必填，且會員看得到 | 同上 + `admin-and-announcements.test.ts` | 缺 note → 400 `note_required`；`GET /rewards/withdrawals` 回得到 note |
| 4 | 提領列表分頁契約 + 彙總 + 篩選（`from`/`to`/`search`/`stats`） | `supabase/functions/api/withdrawals.test.ts` | `total` 反映全部命中；`pendingAmount` 正確；`profile-masking.test.ts` 仍綠 |
| 5 | 會員列表：全站 `stats` + `status` 篩選 + `sort` + `endDate` | `supabase/functions/api/admin-and-announcements.test.ts` | 51 筆資料下 `stats.suspended` 不受 `limit=50` 影響；各排序鍵順序正確 |
| 6 | 會員詳情 `GET /admin/members/:id` | 同上 | 回得到會籍到期日/餘額/推薦人/下線數；非 admin 403（進 `ADMIN_ROUTES`） |
| 7 | 管理員授予／撤銷 `POST /admin/members/:id/admin` | 同上 | 撤銷自己 → `cannot_demote_self`；撤銷最後一位 → `last_admin`；成功後 `is_admin` 確實改變 |
| 8 | 提領前端改版 | `src/components/admin/WithdrawalManagement.test.tsx`（jsdom） | 「已顯示 X / Y」+ 加載更多；退件理由空白時送出鈕 disabled；代為完成走二次確認；CSV 接階段 1 |
| 9 | 會員前端改版 | `src/components/admin/MemberManagement.test.tsx`（jsdom） | 統計卡讀 `stats` 不再 `filter` 當前頁；篩選/排序/分頁；詳情 Sheet 開闔；管理員切換 |
| 10 | 會員端提領記錄顯示退件理由 | `src/components/reward/WithdrawalSection.test.tsx`（jsdom） | `rejected` 且有 note 時渲染理由；無 note 時不留空殼 |
| 11 | 規格書同步 | `python3 scripts/check-spec-drift.py` 綠 | §10.3 補代為完成、§13 表格更新、§14 落差列調整 |

> **階段 11 的地雷**：`check-spec-drift.py` 的「提領狀態機」抽取式是
> `^(`pending` → [^\n]*)$`（該檔 ENUMS 第一條）。§10.3 那行**必須維持單行、
> 以 `` `pending` → `` 開頭**，新描述只能加在它前後。抽不到 = 檢查紅，
> 這是刻意設計（該檔開頭：「抽不到 = 失敗，不是略過」）。狀態**值**不變
> （沒有新狀態），所以 `withdrawals_status_check` 不動。

---

## 6. 開放問題（等人裁決，禁止腦補）

- [ ] **#1 代為完成要不要強制填理由？** 規劃採「強制」（金流稽核）。若營運嫌
      麻煩，替代案是預設帶入「逾期未確認，管理員代為結案」但仍可改。
- [ ] **#2 `completed` 的語意變更如何對會員揭露？** §10.3 現寫「用戶已確認查收」。
      代為完成後，會員端該顯示「已完成」還是「已完成（管理員代為確認）」？
      後者誠實但可能引發客訴；前者讓會員以為自己按過。**建議後者**。
- [ ] **#3 是否要加「逾期自動完成」當保底？** 使用者本輪選了「admin 代為」，
      未選自動。若日後仍會累積卡單，才回頭做——先看代為完成的實際使用頻率。
- [ ] **#4 會員詳情面板要不要顯示身分證字號與銀行帳號全碼？**
      `profile-masking.test.ts` 的 characterization 是「**提領列表**維持完整值
      （匯款作業需要）」——詳情面板不是匯款作業。傾向遮罩（`A1****789`），
      需要全碼時回提領列表看。需求方裁決。
- [ ] **#5 CSV 全量匯出上限 2000 筆是否合適？** 取決於實際月提領量，目前無數據。
      超限時明示拒絕（不給半份財務清單）的原則不變，只有數字待定。
- [ ] **#6 會員列表預設排序？** 現況是 `created_at desc`（最新註冊在前）。
      §7.3 為推薦網絡裁決過「預設最早加入」，但 admin 的使用情境不同
      （通常找新註冊的人），傾向維持 `created_desc`。確認即可。

---

## 7. 風險與回滾

| 風險 | 緩解 |
|---|---|
| **狀態機放寬導致誤標完成**（錢沒匯出卻標完成） | 只開 `awaiting_collection → completed` 一條路——必須先經過「已匯款」才可能完成；加上二次確認 + 必填理由 + `completed_by` 稽核 |
| **提權路徑成為漏洞** | 三道防線（middleware / SQL `is_admin` / `last_admin` 防呆）；`admin-gate.test.ts` 的 `ADMIN_ROUTES` 是機械把關，新端點漏登記會紅 |
| **改 `/admin/withdrawals` 回應破壞既有 characterization** | 階段 4 的驗證標準明列 `profile-masking.test.ts` 須維持綠；只加欄位不改既有欄位 |
| **規格書抽取式失配讓閘門靜默失效** | 階段 11 的地雷已寫明；`check-spec-drift.py` 抽不到即紅，不會靜默 |
| **回滾** | 前端與 API 純加法，revert PR 即可。migration 的欄位是可為 null 的加法欄位（revert 時 `drop column`）；兩支 RPC 用 `create or replace`，回滾需把舊版本定義重新 apply——**因此新 migration 要在檔頭附上被覆寫函數的來源 migration 檔名**（`20260718000101`），方便回滾時取回原版 |
