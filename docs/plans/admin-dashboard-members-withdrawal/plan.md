# 管理後台強化規劃書（以管理者的工作為單位）

> **版本**：v3（處置 v2 審查的 3 P0 / 17 P1 / 9 P2，見 `./review.md` 與 §8 修訂紀錄）

## 0. 一句話

讓管理者能**一次做完**他每天在做的三件事——審證件、匯款、查會員——
並且每一步都留下能跟銀行對帳的痕跡。

---

## 1. 使用者需求

**使用者是管理者（admin），不是會員。** 驗收標準是「admin 的工作變快、變不
容易出錯」，不是「缺陷數歸零」。

### 1.1 管理者的工作盤點

| 頻率 | 工作 | 風險 | 裝置 |
|---|---|---|---|
| 每日／每週 | **處理提領**：核對身分 → 放行或退件 → 網銀匯款 → 標記 → 追查收 | 錢、法律 | 電腦（要開網銀） |
| 隨時 | **客服查詢**：「我提領怎麼還沒到」「為什麼被退件」「我什麼時候到期」 | 信任 | 手機 |
| 不定期 | **審證件**、停權／解除、公告、告警、加管理員 | 中 | 手機 |
| 線下 | 掃碼核身（`/admin/verify`，已完成，本規劃不動） | 低 | 手機 |

### 1.2 對照規格書

§5.2 停權、§5.3 守衛順序、§10 提領系統（§10.1 檢核、§10.3 狀態機、
§10.4 隱私）、§13 管理後台、§13.1 掃碼核身。

### 1.3 驗收情境

**證件審核（PR 1）**

| # | 故事 |
|---|---|
| V1 | 會員上傳身分證**正反面齊全**後狀態為「審核中」，admin 的審核佇列出現該筆；只傳一面時維持 `none`、不進佇列 |
| V2 | admin 看照片後按「通過」或「退回」；退回**必須**填理由，會員在獎勵頁看得到那行理由並可重新上傳 |
| V3 | 審核**一次通過即跨提領重用**——同一人第二次提領不需重審 |
| V4 | 會員換上傳新照片 → 狀態退回「審核中」，需重審 |
| V5 | **審核中（`pending`）不擋提領**：會員上傳完照片可立刻申請，與現行行為一致。**只有 admin 主動退回（`rejected`）的人被擋**，錯誤訊息帶上退回理由 |
| V6 | 既有會員不受影響：狀態預設 `none` 但照片齊全者照舊可提領（守衛保留現行的照片存在檢查作為 fallback） |

**提領作業台（PR 2）**

| # | 故事 |
|---|---|
| W1 | admin 在**同一個面板**看到姓名、身分證字號、銀行代號、銀行帳號、匯款金額，帳號可**一鍵複製**貼進網銀 |
| W2 | admin 勾選多筆 → 填一組匯款日期 → **批次標記已匯款**；交易序號**逐筆可各自填或留空** |
| W3 | 每次狀態轉換都在 `withdrawal_events` 留一筆（誰、何時、從什麼到什麼、備註、交易序號），**歷史不被覆寫** |
| W4 | 一筆已匯款但會員三週沒查收，admin 可代為標記完成，必須填理由，事件表留痕 |
| W5 | admin 退件時必須填理由，會員在獎勵頁看得到 |
| W6 | 列表顯示「已顯示 X / Y 筆」與**待匯款總額**；CSV 匯出符合當前篩選的全部資料，超過上限時明示拒絕而非給半份 |
| W7 | 待處理筆數以 badge 出現在 admin 入口，不必點進去才知道有事 |
| W8 | **手機上可做退件、代為完成、查看事件歷史；只有「標記已匯款」鎖在桌面**（該動作需同時開網銀） |

**會員查詢台（PR 3）**

| # | 故事 |
|---|---|
| M1 | admin 在手機上輸入姓名或電話 → 看到那個人的全貌：會籍到期日、點數餘額、推薦人與下線數、刊登數、證件審核狀態、停權狀態、註冊時間，**以及近期提領記錄（狀態／退件理由／匯款與查收時間）** |
| M2 | 瀏覽全部會員時「已顯示 X / Y 筆」+ 加載更多，統計卡顯示**全站**數字而非當前頁 |
| M3 | 可依狀態（訂閱中/已失效/已停權/管理員）篩選、依註冊時間或到期日排序 |
| M4 | 可授予／撤銷管理員；不能撤銷自己，系統永遠至少留一位管理員 |

### 1.4 不做什麼

- **不編輯會員姓名／電話**——姓名格式規則（§4.2）有 `name-write-paths` 守衛。
- **不提供 admin 代改會員銀行資訊**（需求方裁決）——帳號是會員自己填的，
  admin 代改等於平台替會員決定錢匯到哪，出事責任在平台。發現有誤一律退件，
  由會員重新申請（受單日一次限制，隔天生效）。
- **不刪除會員**（`index.ts:701` 註記刪除會連 withdrawals／referral_edges 一起消失）。
- **不做通知推播**——本專案無 `notifications` 表。所有「通知會員」的文案一律
  改成不承諾推播的措辭（現行 `WithdrawalManagement.tsx:221` 是虛的）。
- **不動 AdminDashboard 的 5 欄 Tab 上限**——證件審核併入「會員管理」Tab 的
  次分頁。
- **不改提領 dialog 的步驟結構**（v2 曾規劃 3 步改 2 步，因 V5 裁決而不再需要
  ——`pending` 不擋提領，會員照舊在 step 3 上傳完就能送出）。
- 不做 `awaiting_collection → rejected`（錢已匯出，維持走人工 adjustment）。

---

## 2. 系統設計

### 2.1 PR 1：證件審核

**核心裁決（需求方）：審核結果只在 `rejected` 時阻擋提領。**
理由：真正的關卡是**匯款**不是申請——admin 本來就不會在沒核對證件的情況下把
錢轉出去。在申請端擋「還沒輪到審核」的人不增加實質保護，只讓每個新會員的
第一次提領多等三個工作天。保留 `rejected` 的阻擋，admin 仍握有系統層的拒絕權。

**連帶效果**：不必解耦提領 dialog、不必動 `multi-step-flow-recovery.md` 四契約、
backfill 從「上線即客訴」等級降為低風險整理、既有會員零影響。

**資料層**（migration `20260802000001_id_verification.sql`）

```sql
alter table public.profiles
  add column id_verification_status text not null default 'none'
    check (id_verification_status in ('none','pending','approved','rejected')),
  add column id_verified_at   timestamptz,
  add column id_verified_by   uuid references public.profiles(id) on delete set null,
  add column id_reject_reason text;
```

- 上傳（`/rewards/upload-id-photos`）→ **僅在 front 與 back 合計皆非 null 時**
  才設 `pending` 並清空 `id_reject_reason`；只傳一面維持 `none`（V1）。
  現行端點允許單面上傳（`index.ts:2357-2412` 只擋兩張都沒傳），不加這個條件
  會讓沒交齊的人看到「審核中」這個錯誤訊息，且佇列出現缺圖的送審紀錄。
- **backfill（低風險整理，非阻擋前置）**：曾有提領到達 `awaiting_collection`／
  `completed` 者設 `approved`（admin 當初為了匯款必然看過照片）；照片齊全但
  從未成功提領者設 `pending`（進佇列待審，但**不影響其提領**）。

**守衛變更**（`request_withdrawal`，§10.1 檢核 #5）—— **最小改動**：

```
#5a  id_verification_status = 'rejected'  → 'id_rejected'（帶 id_reject_reason）
#5b  v_front is null or v_back is null    → 'missing_id_photos'（現行邏輯不動）
```

`none`／`pending`／`approved` 一律落到 #5b 的現行檢查。**因此既有會員
（狀態 `none`、照片齊全）行為完全不變**（V6），也不需要 backfill 才能通過。

**函數**（每一個都必須 `revoke execute ... from anon, authenticated, public`
——見 §2.5）

- `admin_review_id(p_admin_id, p_user_id, p_approve bool, p_reason text)`
  合法轉換：`pending → approved`／`pending → rejected`／`approved → rejected`
  （事後發現造假可改判）；`rejected → approved` 需會員重新上傳，不由 admin
  直接翻回。退回時 `p_reason` 必填。
  **不連動既往提領**——守衛只在申請當下檢查，已送出的提領照常往下走。
  這是刻意設計（錢的狀態由提領狀態機管，不由證件狀態回溯翻案）。
- `admin_list_id_reviews(p_status, p_limit, p_offset)`

**API**

| 端點 | 說明 |
|---|---|
| `GET /admin/id-reviews?status=&limit=&offset=` | 審核佇列（含簽名證件照網址） |
| `POST /admin/id-reviews/:userId/review` | body `{ approve: bool, reason?: string }` |
| `GET /rewards/id-photos` | 既有端點，回應加 `verificationStatus` 與 `rejectReason` |

兩個新 admin 端點登記進 `admin-gate.test.ts` 的 `ADMIN_ROUTES`（回歸測試取樣
清單，見 §2.5 的措辭修正）。

### 2.2 PR 2：提領作業台

**資料層**（migration `20260802000002_withdrawal_events.sql`）

```sql
create table public.withdrawal_events (
  id            uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.withdrawals(id) on delete cascade,
  admin_id      uuid references public.profiles(id) on delete set null,
  from_status   text not null,
  to_status     text not null,
  note          text,
  bank_ref      text,          -- 匯款交易序號：唯一能跟銀行對帳的錨點（選填）
  transferred_on date,         -- 匯款日期
  created_at    timestamptz not null default now()
);
create index idx_withdrawal_events_withdrawal
  on public.withdrawal_events(withdrawal_id, created_at);

-- 本專案零例外的建表慣例（比照 system_alerts / member_verify_logs /
-- announcements）：預設權限不可依賴，每張新表自己顯式收緊。
-- 見 20260717000001_service_role_grants.sql：「一律不做 blanket grant」。
alter table public.withdrawal_events enable row level security;
revoke all on public.withdrawal_events from anon, authenticated;
```

不開任何 policy = 只有 `service_role` 可存取（與 `announcements` 同模式）。
本表存 `admin_id`／`bank_ref`／`note`，漏了這兩行等於讓任何登入使用者經
PostgREST 讀到全站提領稽核紀錄。

`admin_id is null` = 會員自己的動作（查收確認）。

> **`on delete cascade` 的技術債（已裁決接受）**：`withdrawals.user_id` 本身
> 也是 cascade，且現行 `/auth/delete` 自助刪除已經會連 withdrawals 一起刪。
> 改成 `restrict` 會**破壞既有端點**，故維持 cascade。代價是刪除會員時稽核
> 歷史一併消失——會員刪除不在本規劃範圍（§1.4），日後若要保留稽核，必須
> 連同 `withdrawals` 的 cascade 一起重新設計，不能只改這張表。

**`admin_update_withdrawal_status()` 改寫**（`create or replace`；原版在
`20260718000101` §6d，**回滾時從該檔取回**）

合法轉換表（其餘一律 `invalid_transition`）：

| from | to | 附帶效果 |
|---|---|---|
| `pending` | `awaiting_collection` | 寫事件（含 `bank_ref`／`transferred_on`）；`note` 選填 |
| `pending` | `rejected` | 寫事件（`note` **必填**）；補償 adjustment（既有邏輯不動） |
| `awaiting_collection` | `completed` | 寫事件（`note` **必填**）、`completed_at = now()`；**不寫帳本** |

**`note` 一律只寫進 `withdrawal_events`，停止更新 `withdrawals.note`。**
既有的 `note = coalesce(p_note, note)` 必須拿掉——否則新增的
`awaiting_collection → completed`（note 必填）會覆寫「已匯款」那次寫的 note，
正是本規劃建事件表想解決的那個 bug 換個欄位重演。連帶：
`GET /admin/withdrawals`（現行 `index.ts:1092` 直接回 `w.note`）與
`GET /rewards/withdrawals` 一律改讀事件表最新一筆。
`withdrawals.note` 欄位保留但不再寫入，在 migration 加 column comment 註明
vestigial（比照 `subscriptions.is_canceled` 的既有作法）。

`note` 必填的判準：**會員沒有同意、但錢的狀態被改變**的動作。
同狀態重入維持既有冪等回應（不重複寫事件）。

**`confirm_withdrawal_collection()` 改寫**：補寫事件（`admin_id = null`）。

**批次**：`admin_batch_mark_paid(p_admin_id, p_items jsonb, p_transferred_on date, p_note text)`

- `p_items` 形如 `[{"id": "...", "bank_ref": "..."}, ...]`——**逐筆各自的
  `bank_ref`**（W2 要求「可逐筆填或留空」，單一共用參數做不到）。
- **每筆包一層 `begin ... exception when others then ... end`**（savepoint
  隔離）。Postgres 函數預設是單一交易，任何未攔截的例外（deadlock、約束違反）
  會讓整批 rollback，連已判定成功的筆數一起消失——「部分失敗不整批回滾」
  這個對外承諾在硬錯誤下會是假的。既有慣例見 `apply_referral_side_effects`
  （`20260720000001_wave4_guards.sql:270-311`）。
- 回傳 `{ succeeded: [], failed: [{id, error_code}] }`。

**API**

| 端點 | 變更 |
|---|---|
| `GET /admin/withdrawals` | 加 `from`/`to`/`search`；回應加 `stats`（`pendingAmount`、各狀態筆數）與 `events`（批次 `in` 查詢後在應用層 group，比照 `index.ts:1063` 的證件照批次簽名作法，不做 N+1） |
| `POST /admin/withdrawals/:id/status` | 受理 `completed`；`bank_ref`/`transferred_on`；`note` 對 `rejected`/`completed` 必填 |
| `POST /admin/withdrawals/batch-mark-paid` | **新**：`{ items: [{id, bankRef?}], transferredOn, note? }` |
| `GET /admin/withdrawals/summary` | **新**：待處理筆數（供入口 badge，輕量） |
| `GET /rewards/withdrawals` | 加 `note`（讀事件表最新一筆）與 `completedByAdmin: bool`（不外洩 admin 身分） |

### 2.3 PR 3：會員查詢台

- `admin_list_members()` 改寫：加 `stats`（**在 filtered CTE 上算，不受 limit
  影響**）、`end_date`、`id_verification_status`；新增 `p_status` 與 `p_sort`。
- `admin_member_detail(p_user_id)`（新）：會籍（`user_account_status`）、點數
  （**復用 `get_reward_summary`**）、推薦人、直接下線數、刊登數、證件審核狀態、
  銀行資訊、停權時點、註冊時間、**近期提領記錄（最多 10 筆，含狀態、退件理由、
  `processed_at`／`completed_at`）**。最後一項是 M1 的核心——§1.1 的頭號客服
  情境正是「我提領怎麼還沒到」，詳情面板答不出來就失去存在意義。
- `admin_set_member_admin(p_admin_id, p_target_id, p_is_admin)`（新）：
  `cannot_demote_self` / `last_admin`（advisory lock，比照 `admin_setup_claim`）。
- API：`GET /admin/members`（加 query）、`GET /admin/members/:id`（新）、
  `POST /admin/members/:id/admin`（新）。

**遮罩（需求方裁決）**：`admin_member_detail` 回傳的身分證字號與銀行帳號
一律**遮罩**（`A1****789`）。需要全碼時回提領作業台看——那裡因匯款作業需要
而維持完整值，已有 `profile-masking.test.ts:132` 的 characterization 把關。

### 2.4 契約（`supabase/functions/_shared/api-contract.ts`）

`AdminMemberSchema` 加 `endDate`、`idVerificationStatus`；`AdminMembersResponseSchema`
加 `stats`；新增 `AdminMemberDetailSchema`、`AdminIdReviewSchema`、
`WithdrawalEventSchema`、`AdminWithdrawalStatsSchema`。
會員端提領記錄型別目前**寫死在 `WithdrawalSection.tsx:23`**，順手收進 @contract。

### 2.5 所有新 SQL 函數的共同要求（P0，不可省）

**每一個新函數都必須緊接著 `revoke execute ... from anon, authenticated, public`。**
Postgres 對函數 EXECUTE 預設授予 PUBLIC，本 repo 現有 50+ 處函數零例外都有這行。

`admin_set_member_admin` 缺了它是**真實的提權漏洞**：PostgREST 的
`rpc/admin_set_member_admin` **不經過 Hono 的 `/admin/*` middleware**，而
SECURITY DEFINER 執行時 `current_user` 是函數擁有者，正好滿足
`prevent_admin_escalation`（`20260718000102` §2c）放行 `service_role`/`postgres`
的條件——任何已登入會員可直接呼叫它把自己設成管理員。

適用清單：`admin_review_id`、`admin_list_id_reviews`、`admin_batch_mark_paid`、
`admin_member_detail`、`admin_set_member_admin`，以及被 `create or replace`
覆寫的 `admin_update_withdrawal_status`、`confirm_withdrawal_collection`、
`request_withdrawal`、`admin_list_members`（replace 會沿用原權限，但仍明寫以免
日後有人複製這段 migration 時漏掉）。

> **措辭修正**：v2 寫「`ADMIN_ROUTES` 是機械把關的權限清單，漏登記即漏權限」
> 是錯的。實際保護是 `app.use('/admin/*', ...)` middleware（`index.ts:963`），
> 已對整個命名空間生效——現有 `POST /admin/withdrawals/:id/status` 本來就不在
> `ADMIN_ROUTES` 裡卻依然受保護。它是**回歸測試的取樣清單**，登記新端點是維持
> 測試涵蓋率的好習慣，不是保護機制本身。真正需要逐一確認的是本節的
> `revoke execute`。

---

## 3. 架構影響

- **三個 PR 的依賴關係（誠實版）**：
  - **PR 3 對 PR 1 有欄位級硬相依**——`admin_list_members()` 與
    `admin_member_detail()` 都要回 `id_verification_status`，該欄位由 PR 1 的
    migration 新增。**PR 3 不能與 PR 1 平行開工**（v2 誤稱「獨立可平行」）。
  - **PR 1 → PR 2 沒有程式碼層級耦合**，只是建議順序（先有審核佇列，作業台的
    證件照就退居參考角色）。現有 `IdCardDialog`（`WithdrawalManagement.tsx:50-108`）
    **保留不動**——匯款前 admin 仍可能想再看一眼。
  - 可行順序：PR 1 → PR 2 → PR 3，或 PR 1 → (PR 2 ∥ PR 3)。
- **`api/index.ts` 已 3351 行**，本規劃再加 6 個端點。不在本規劃拆檔（獨立重構，
  混進來會讓 diff 無法審），但**新端點一律緊鄰既有 `/admin/*` 區塊（963–1205）**。
- **四契約（multi-step-flow）不適用**——V5 裁決後提領 dialog 結構不變。
- **既有測試影響**：
  - `withdrawals.test.ts` 的 `createWithdrawableUser`（第 30 行）、
    `suspension-guards.test.ts`（第 29-46、74-90 行）、
    `cancel-signup-guard.test.ts`（第 57-90 行）三處各自複製了幾乎一樣的
    「payForUser + 手動塞 profiles 欄位」helper。**因守衛採最小改動（`none`
    落到現行照片檢查），這三處預期不會紅**——但階段 1.2 必須實跑驗證，
    並趁機把 helper 收斂進 `test-helpers.ts`。
  - `profile-masking.test.ts:132`（admin 列表維持完整值）：改
    `/admin/withdrawals` 時**只加欄位、不改既有欄位**。

---

## 4. UI/UX

| 模組 | 主場 | 版面策略 |
|---|---|---|
| 提領作業台 | 電腦 | 桌面優先：左列表右作業面板。**手機可退件／代為完成／看事件歷史，只有「標記已匯款」鎖在桌面**（需求方裁決 W8） |
| 會員查詢台 | 手機 | 手機優先：搜尋框置頂 + 結果卡片 + 詳情 `Sheet`。桌面用表格 |
| 證件審核 | 手機 | 大圖 + 通過／退回兩顆鍵，單欄 |

對照 `docs/ui-ux-guidelines.md`：

- **§5 不得靜默截斷** → 沿用 §7.3 已裁決的「已顯示 X / Y 筆記錄」+ 加載更多。
  這是第三處出現（`ReferralTreeView.tsx:622-639` 是手刻在元件內的 state，非
  hook），**PR 3 負責抽出共用 hook** 讓三處收斂。
- **§5／§6 三態** → 骨架屏取代現行置中 spinner；三態一律寫進**驗收標準**
  （§5 各前端階段），不只寫在原則裡——TDD 只做驗證標準要求的行為。
  可比照 `ReferralTreeView.tsx:584-594` 的 `status: 'loading' | 'error' | 'done'`。
- **§3 入口** → admin 入口目前只藏在頭像下拉（`Navbar.tsx:142`），違反準則明文。
  移出下拉並掛待處理 badge。**不動 BottomNav**（五格契約；`Navbar` 手機也渲染，
  是正確的掛載點）。
- **§4 表單** → 必填理由 `Textarea` 接 `aria-invalid` + `FieldError`
  （`src/utils/formHelpers.tsx` 已有 pattern），不只是「空白時送出鍵 disabled」
  ——新元件不再添 a11y 債（CLAUDE.md 明文）。批次 checkbox 補
  `aria-label`（「選取 {會員名} 的提領記錄」）。
- **§8 可測試性** → 搜尋框 `type="search"`、篩選用既有 `common/FilterChip`、
  切換鈕 name 隨狀態變動。
- **統計卡**用 `ui/stat-card-grid.tsx`；**一鍵複製**需先把
  `InviteFriendPanelContent.tsx:40` 的 `copyText` 抽成 `src/utils/clipboard.ts`
  ——它現在是元件內部 closure（依賴同檔 `useNotification()`）、沒有 export，
  「復用」不先抽取就會變成複製貼上。抽取列為 PR 2 的獨立階段。
- **危險動作** → 退件、代為完成、批次標記、撤銷管理員都走 `AlertDialog`。
  **批次確認框列出受影響會員姓名清單**（不只筆數與總額）——這個動作在系統內
  **不可回退**（§1.4 不做 `awaiting_collection → rejected`），金額相近時聚合
  總額不會露出異常。**「全選」限於目前篩選結果的已載入頁**，並顯示明確計數，
  不悄悄擴大到未載入的頁。
- **會員端證件區塊**放在獎勵頁「申請 Point 提領」CTA **之後**，用可摺疊區塊
  （僅在狀態非 `approved` 時預設展開），不把主要行動往下擠。
- **證件審核 SLA**（需求方裁決）：會員端文案寫「審核中，通常 **3 個工作天**內
  完成；審核期間仍可正常申請提領」。後半句很重要——V5 讓 `pending` 不擋提領，
  文案要講清楚，否則會員以為要等。

---

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

### PR 1：證件審核

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1.1 | 證件審核資料層 + 上傳端點狀態轉換 + backfill | `supabase/functions/api/id-verification.test.ts` | 雙面齊全才轉 `pending`、單面維持 `none`（V1）；換照片退回 `pending`（V4）；backfill 兩類判準正確 |
| 1.2 | `request_withdrawal` 守衛 #5a（只擋 `rejected`） | `withdrawals.test.ts` | `rejected` → `id_rejected` 帶理由；`none`/`pending`/`approved` 落到現行照片檢查（V5/V6）；**實跑 `suspension-guards.test.ts` 與 `cancel-signup-guard.test.ts` 確認未紅**，並把三處重複 helper 收斂進 `test-helpers.ts` |
| 1.3 | admin 審核端點（含轉換表） | `id-verification.test.ts` | 退回缺理由 → 400；`approved → rejected` 允許、`rejected → approved` 拒絕；不連動既往提領；`revoke execute` 生效（以 authenticated 身分直呼 rpc 應失敗） |
| 1.4 | 會員端證件狀態區塊 | `src/components/reward/*.test.tsx`（jsdom） | 審核中／退回（含理由與重新上傳入口）／通過三態；**空／錯／載入三態**；提領 dialog 步驟結構不變 |
| 1.5 | admin 審核佇列 UI **+ 掛進會員管理 Tab 的次分頁殼** | `src/components/admin/IdReviewQueue.test.tsx`（jsdom） | 大圖＋通過/退回；退回理由空白時送出 disabled 且有 `FieldError`；**空／錯／載入三態**；**站內有可達入口**（不留孤兒頁） |

### PR 2：提領作業台

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 2.1 | CSV 欄位跳脫純函式（`src/utils/csv.ts`） | `src/utils/csv.test.ts`（node） | 逗號／引號／換行／前導 `=+-@` 公式注入皆正確跳脫 |
| 2.2 | `copyText` 抽成 `src/utils/clipboard.ts` | `src/utils/clipboard.test.ts`（jsdom） | 含 `execCommand` fallback；`InviteFriendPanelContent` 改用抽出的版本後既有測試仍綠 |
| 2.3 | `withdrawal_events`（含 RLS/revoke）+ 狀態機改寫 | `withdrawals.test.ts` | 每次轉換寫一筆事件、`withdrawals.note` 不再被寫入；缺 note → `note_required`；重入冪等不重複寫事件；**以 authenticated 身分直讀 `withdrawal_events` 應失敗** |
| 2.4 | 批次標記已匯款（逐筆 `bank_ref` + savepoint 隔離） | `withdrawals.test.ts` | 逐筆 `bank_ref` 各自落地；部分失敗回 `{succeeded, failed}`；**硬錯誤不讓已成功筆數跟著回滾** |
| 2.5 | 列表分頁／彙總／篩選／events | `withdrawals.test.ts` | `total` 反映全部命中；`pendingAmount` 正確；`events` 不做 N+1；`profile-masking.test.ts` 仍綠 |
| 2.6 | 退件理由端到端（會員看得到） | `withdrawals.test.ts` | `GET /rewards/withdrawals` 的 note 讀自事件表最新一筆 |
| 2.7 | 作業台前端 | `WithdrawalManagement.test.tsx`（jsdom） | 帳號一鍵複製；批次確認列出姓名清單；「全選」限已載入頁且有計數；「已顯示 X / Y」；手機可退件/代為完成、「標記已匯款」不可見（W8）；**空／錯／載入三態** |
| 2.8 | 會員端顯示退件理由 | `WithdrawalSection.test.tsx`（jsdom） | `rejected` 有 note 時渲染；無 note 不留空殼 |
| 2.9 | 入口 badge（待處理筆數） | `Navbar.test.tsx`（jsdom） | 有待處理時顯示數字；為 0 不顯示空 badge；非 admin 不發請求 |

### PR 3：會員查詢台（**依賴 PR 1 的 `id_verification_status` 欄位**）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 3.1 | 列表：全站 `stats` + 篩選 + 排序 + `endDate` | `admin-and-announcements.test.ts` | 51 筆資料下 `stats.suspended` 不受 `limit=50` 影響；各排序鍵正確 |
| 3.2 | 會員詳情（含近期提領記錄、遮罩） | 同上 | 回得到會籍到期日／餘額／推薦人／下線數／證件狀態／**近期提領記錄**；身分證與銀行帳號**已遮罩** |
| 3.3 | 管理員授予／撤銷 | 同上 | `cannot_demote_self`；`last_admin`；**以 authenticated 身分直呼 rpc 應失敗**（提權防線） |
| 3.4 | 分頁「加載更多」抽成共用 hook + 查詢台前端 | `MemberManagement.test.tsx`（jsdom） | hook 抽出後 `ReferralTreeView` 既有測試仍綠；統計卡讀 `stats` 不再 filter 當前頁；詳情 Sheet；管理員切換；**空／錯／載入三態** |

### 收尾（隨最後一個 PR）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 4.1 | 規格書同步：§5.3 一般性原則、§10.1 檢核 #5a、§10.3 事件表、§13 表格 | `python3 scripts/check-spec-drift.py` | 綠 |

> **階段 4.1 的地雷**：`check-spec-drift.py` 的「提領狀態機」抽取式是
> `` ^(`pending` → [^\n]*)$ ``（該檔 `ENUMS` 第一條，267-275 行）。§10.3 那行
> **必須維持單行、以 `` `pending` → `` 開頭**，新描述只能加在它前後。抽不到 = 紅，
> 這是刻意設計。狀態**值**不變，`withdrawals_status_check` 不動。
>
> **§5.3 的處理**（審查裁決）：不逐條加例外。§5.3 字面只約束「停權優先擋 →
> 到期再擋」的**相對順序**，而 `request_withdrawal` 早就有 5 條另兩處沒有的
> 獨有守衛且都沒註記例外。改成在 §5.3 開頭寫一次一般性原則：「本節只約束三處
> 共通的前兩道順序；各守衛自身的額外檢核（如提領的金額級距、證件狀態）不必
> 逐條加註」。

---

## 6. 開放問題

**已由需求方裁決（不再是開放問題）**：範圍全做、走三段式、admin 代為標記完成、
雙裝置、批次標記、§13 資料審核=證件審核流程、**審核只擋 `rejected`**、
**SLA 3 個工作天**、**詳情面板遮罩**、**交易序號選填**、**手機只鎖「標記已匯款」**、
**不提供 admin 代改銀行資訊**。

- [ ] **#1 CSV 全量匯出上限**：規劃設 2000 筆、超限明示拒絕。實際月提領量未知，
      數字待定（原則不變）。
- [ ] **#2 會員列表預設排序**：現況 `created_at desc`。§7.3 為推薦網絡裁決過
      「預設最早加入」，但 admin 通常找新註冊的人，傾向維持 `created_desc`。
- [ ] **#3 backfill 執行前的人數確認**（降級為一般查核，非阻擋前置）：
      V5/V6 裁決後 backfill 不再影響任何人的提領能力，只影響審核佇列初始內容。
      仍建議正式站執行前跑一次 `count(*)` 確認佇列規模在可處理範圍。

---

## 7. 風險與回滾

| 風險 | 緩解 |
|---|---|
| **提權漏洞**（最高：`admin_set_member_admin` 可被一般會員直呼） | §2.5 的 `revoke execute` 是強制項；階段 1.3／3.3 的驗證標準明列「以 authenticated 身分直呼 rpc 應失敗」，用測試釘死而非靠人記得 |
| **稽核表外洩**（`withdrawal_events` 含 `bank_ref`／`note`） | §2.2 建表即 `enable RLS` + `revoke all`；階段 2.3 驗證標準明列「以 authenticated 身分直讀應失敗」 |
| **`note` 覆寫在事件表之外重演** | §2.2 明訂主表 `note` 停止寫入、讀取路徑一律改讀事件表；階段 2.3 驗證標準把它寫成斷言 |
| **批次操作放大誤觸**（一次錯 12 筆，且不可回退） | 確認框列出姓名清單；「全選」限已載入頁；savepoint 隔離讓部分失敗可精確重做；事件表可逐筆追溯 |
| **狀態機放寬導致誤標完成** | 只開 `awaiting_collection → completed` 一條路——必須先經過「已匯款」；二次確認 + 必填理由 + 事件表留痕 |
| **證件審核擋住會員**（v2 的最高風險） | **已由 V5 裁決消解**——`pending` 不擋提領，`none` 落到現行照片檢查，既有會員零影響 |
| **規格書抽取式失配讓閘門靜默失效** | 階段 4.1 的地雷已寫明 |
| **回滾** | 三個 PR 各自可 revert。migration 的欄位／表都是加法（revert 為 `drop`）；被 `create or replace` 覆寫的函數原版來源已在 §2.2 標明（`20260718000101` §6d），回滾時重新 apply。backfill 是資料異動、revert 不會還原，但該欄位回滾後不再被讀取，無殘留影響 |

---

## 8. 修訂紀錄

**v3（本版）**：處置 `./review.md` 的 3 P0 / 17 P1 / 9 P2。

P0 處置：
1. `withdrawal_events` 補 `enable RLS` + `revoke all`（§2.2）。
2. 所有新函數補 `revoke execute`，並獨立成 §2.5——附上 PostgREST 繞過
   middleware 的完整攻擊鏈，以及「用測試釘死」的驗證標準。
3. **證件審核改為只擋 `rejected`**（需求方裁決）。真正的關卡是匯款不是申請。
   連帶消解四條 P1：不必解耦 dialog、四契約不適用、backfill 從最高風險降為
   低風險整理、沒有「首次提領新等待」。

主要 P1 處置：主表 `note` 停止寫入並改讀事件表；批次改 `jsonb` 逐筆
`bank_ref`；批次加 savepoint 隔離；上傳僅雙面齊全才轉 `pending`；PR1 補端點表；
更正「PR3 獨立可平行」為對 PR1 硬相依；PR1→PR2 依賴改為誠實的「建議順序」；
補 IdReviewQueue 的掛載階段；三態寫進各前端階段的驗收標準；手機只鎖「標記
已匯款」；詳情面板加近期提領記錄；批次確認列姓名 + 定義「全選」範圍。

P2 處置：`copyText` 抽取獨立成階段 2.2；更正 `ADMIN_ROUTES` 的措辭；分頁抽
共用 hook 列入 3.4；證件區塊位置指定；必填理由接 `FieldError`／checkbox 補
`aria-label`。

需人工裁決處置：§5.3 改寫成一般性原則不逐條加註；`on delete cascade` 維持
（改 restrict 會破壞既有 `/auth/delete`）並記錄技術債；`admin_review_id` 補
合法轉換表；admin 不得代改銀行資訊（需求方裁決）。

**v2**：從缺陷驅動改為工作驅動——事件表取代加欄位、新增交易序號、新增證件
審核、新增批次標記、新增同屏作業面板與一鍵複製、11 階段拆成三個 PR、推翻
「admin 是低頻桌面作業」的假設、補 admin 入口與 badge。

**v1**：缺陷驅動的 11 階段規劃。
