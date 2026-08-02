# 管理後台強化規劃書（以管理者的工作為單位）

> **v2 改寫說明**：v1 是「讀程式碼找出 11 個缺陷再逐一修」的缺陷驅動規劃。
> 從管理者視角重想後改成**工作驅動**——管理者不會用缺陷的方式體驗系統，
> 他體驗的是一份工作。重排之後 v1 漏掉的比它修掉的重要（見 §8 修訂紀錄）。

## 0. 一句話

讓管理者能**一次做完**他每天在做的三件事——審證件、匯款、查會員——
並且每一步都留下能跟銀行對帳的痕跡。

---

## 1. 使用者需求

**使用者是管理者（admin），不是會員。** 這份規劃的驗收標準是「admin 的工作
變快、變不容易出錯」，不是「缺陷數歸零」。

### 1.1 管理者的工作盤點

| 頻率 | 工作 | 風險 | 裝置 |
|---|---|---|---|
| 每日／每週 | **處理提領**：核對身分 → 放行或退件 → 網銀匯款 → 標記 → 追查收 | 錢、法律 | 電腦（要開網銀） |
| 隨時 | **客服查詢**：「我提領怎麼還沒到」「為什麼被退件」「我什麼時候到期」 | 信任 | 手機 |
| 不定期 | **審證件**、停權／解除、公告、告警、加管理員 | 中 | 手機可行 |
| 線下 | 掃碼核身（`/admin/verify`，已完成，本規劃不動） | 低 | 手機 |

裝置分工是需求方本輪的裁決（「兩者都有」）：**匯款在電腦、客服查詢在手機**。
因此三個模組各自有主場，不是全部套同一套版面——見 §4。

### 1.2 對照規格書

§5.2 停權、§5.3 守衛順序、§10 提領系統（§10.1 檢核、§10.3 狀態機、
§10.4 隱私）、§13 管理後台、§13.1 掃碼核身。

### 1.3 驗收情境

**證件審核（PR 1）**

| # | 故事 |
|---|---|
| V1 | 會員上傳身分證正反面後，狀態為「審核中」，admin 的審核佇列出現該筆 |
| V2 | admin 看照片後按「通過」或「退回」；退回**必須**填理由，會員在獎勵頁看得到那行理由並可重新上傳 |
| V3 | 審核**一次通過即跨提領重用**——同一人第二次提領不需重審（證件照本就是跨提領重用設計，見 `20260718000101` §2 註解） |
| V4 | 會員換上傳新照片 → 狀態退回「審核中」，需重審 |
| V5 | **既有會員不被新關卡擋住**：已經有提領到達過 `awaiting_collection`／`completed` 的人，其證件視為已審核（admin 當初為了匯款必然看過照片），backfill 為 `approved` |

**提領作業台（PR 2）**

| # | 故事 |
|---|---|
| W1 | admin 在**同一個面板**看到姓名、身分證字號、銀行代號、銀行帳號、匯款金額，帳號可**一鍵複製**貼進網銀，不必用眼睛抄 |
| W2 | admin 勾選多筆 → 填一組匯款日期 → **批次標記已匯款**；交易序號可逐筆填或留空 |
| W3 | 每次狀態轉換都在 `withdrawal_events` 留一筆（誰、何時、從什麼到什麼、備註、交易序號），**歷史不被覆寫** |
| W4 | 一筆已匯款但會員三週沒查收，admin 可代為標記完成，必須填理由，事件表留痕 |
| W5 | admin 退件時必須填理由，會員在獎勵頁看得到 |
| W6 | 列表顯示「已顯示 X / Y 筆」與**待匯款總額**；CSV 匯出符合當前篩選的全部資料，超過上限時明示拒絕而非給半份 |
| W7 | 待處理筆數以 badge 出現在 admin 入口，不必點進去才知道有事 |

**會員查詢台（PR 3）**

| # | 故事 |
|---|---|
| M1 | admin 在手機上輸入姓名或電話 → 直接看到那個人的全貌：會籍到期日、點數餘額、推薦人與下線數、刊登數、證件審核狀態、停權狀態、註冊時間 |
| M2 | 瀏覽全部會員時「已顯示 X / Y 筆」+ 加載更多，統計卡顯示**全站**數字而非當前頁 |
| M3 | 可依狀態（訂閱中/已失效/已停權/管理員）篩選、依註冊時間或到期日排序 |
| M4 | 可授予／撤銷管理員；不能撤銷自己，系統永遠至少留一位管理員 |

### 1.4 不做什麼

- **不編輯會員姓名／電話**——姓名格式規則（§4.2）有 `name-write-paths` 守衛與
  共用案例表，admin 側改名是另一條有自己風險的路。
- **不刪除會員**（`index.ts:701` 註記刪除會連 withdrawals／referral_edges 一起消失）。
- **不做通知推播**——本專案無 `notifications` 表。所有「通知會員」的文案一律
  改成不承諾推播的措辭（現行 `WithdrawalManagement.tsx:221` 寫「通知會員款項
  已匯出」是虛的）。
- **不動 AdminDashboard 的 5 欄 Tab 上限**（§13 註記硬加會壞版面）——證件審核
  併入「會員管理」Tab 內的次分頁，不新增第 6 欄。
- 不做 `awaiting_collection → rejected`（錢已匯出，維持走人工 adjustment）。

---

## 2. 系統設計

### 2.1 PR 1：證件審核

**這是一套新狀態機，且會插進既有提領流程的守衛順序，是本規劃風險最高的一段。**

**關鍵取捨：審核與提領解耦。** 現行證件是在提領 dialog 的**第 3 步當場上傳**
（`WithdrawalProcess.tsx:62`）。若把審核設成提領的前置條件而不解耦，會員會在
第 3 步卡住、隔天才能回來——把「一次做完」變成「等兩天」。

因此：**證件上傳與審核搬出提領流程**，成為獎勵頁的獨立區塊；提領第 3 步從
「上傳」改成「檢查審核狀態」（未通過則導向上傳區塊，不在 dialog 內完成）。
admin 側也因此得到獨立的審核佇列，可以批次審完再批次匯款，而不是每筆提領
都重看一次同一個人的證件。

**資料層**（migration `20260802000001_id_verification.sql`）

```
alter table public.profiles
  add column id_verification_status text not null default 'none'
    check (id_verification_status in ('none','pending','approved','rejected')),
  add column id_verified_at   timestamptz,
  add column id_verified_by   uuid references public.profiles(id) on delete set null,
  add column id_reject_reason text;
```

- 上傳（`/rewards/upload-id-photos`）→ 一律設 `pending`、清空 `id_reject_reason`
  （驗收情境 V4：換照片就要重審）。
- **backfill（V5，不可省）**：

  ```sql
  update public.profiles p set
    id_verification_status = 'approved',
    id_verified_at = now()
  where p.id_card_front_path is not null
    and p.id_card_back_path is not null
    and exists (select 1 from public.withdrawals w
                where w.user_id = p.id
                  and w.status in ('awaiting_collection','completed'));
  ```

  只放行「admin 當初必然看過照片」的人（曾有提領實際匯出）。**只上傳過但
  從未成功提領的人維持 `pending`**——那是這道關卡本來就該擋的對象。

**守衛變更**（`request_withdrawal`，§10.1 檢核 #5）

現行 #5 是「已上傳身分證正反面照片」→ `missing_id_photos`。改為：

| 證件狀態 | 結果 |
|---|---|
| `none` | `missing_id_photos`（訊息不變） |
| `pending` | **新** `id_pending_review` — 「證件審核中，通過後即可提領」 |
| `rejected` | **新** `id_rejected` — 帶上 `id_reject_reason` |
| `approved` | 放行 |

⚠️ **§5.3 要求守衛順序三處逐字對齊**（提領／領取 credit／刊登可見）。證件審核
只加在提領這一處——需在 §5.3 明文記載「證件審核是提領獨有的第三道，不適用
另兩處」，否則下一個讀規格書的人會以為三處漏對齊。

**函數**：`admin_review_id(p_admin_id, p_user_id, p_approve bool, p_reason text)`
——退回時 `p_reason` 必填；`admin_list_id_reviews(p_status, p_limit, p_offset)`。

### 2.2 PR 2：提領作業台

**資料層**（migration `20260802000002_withdrawal_events.sql`）

**用事件表取代在主表加欄位。** v1 原本要加 `processed_by`/`completed_by`，
那是錯的抽象：`note` 是單一欄位且既有 SQL 是 `note = coalesce(p_note, note)`，
兩次操作各填理由時**第二次會覆寫第一次**，金流稽核不能丟歷史。

```
create table public.withdrawal_events (
  id            uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.withdrawals(id) on delete cascade,
  admin_id      uuid references public.profiles(id) on delete set null,
  from_status   text not null,
  to_status     text not null,
  note          text,
  bank_ref      text,        -- 匯款交易序號：唯一能跟銀行對帳的錨點
  transferred_on date,       -- 匯款日期（批次共用一組）
  created_at    timestamptz not null default now()
);
create index idx_withdrawal_events_withdrawal on public.withdrawal_events(withdrawal_id, created_at);
```

`admin_id is null` = 會員自己的動作（查收確認）。主表 `withdrawals` 只留當前
狀態，歷史一律讀事件表。

**`admin_update_withdrawal_status()` 改寫**（`create or replace`，原版在
`20260718000101` §6d——**回滾時從該檔取回**）

合法轉換表（其餘一律 `invalid_transition`）：

| from | to | 附帶效果 |
|---|---|---|
| `pending` | `awaiting_collection` | 寫事件（含 `bank_ref`／`transferred_on`）；`note` 選填 |
| `pending` | `rejected` | 寫事件（`note` **必填**）；補償 adjustment（既有邏輯不動） |
| `awaiting_collection` | `completed` | 寫事件（`note` **必填**）、`completed_at = now()`；**不寫帳本**（扣款在申請時已完成） |

`note` 必填的判準：**會員沒有同意、但錢的狀態被改變**的動作。
同狀態重入維持既有冪等回應（不重複寫事件）。

**`confirm_withdrawal_collection()` 改寫**：補寫事件（`admin_id = null`）。

**批次**：`admin_batch_mark_paid(p_admin_id, p_withdrawal_ids uuid[], p_transferred_on date, p_note)`
——逐筆套用上表的 `pending → awaiting_collection`，**部分失敗不整批回滾**，
回傳 `{ succeeded: [], failed: [{id, error_code}] }`。理由：批次裡有一筆狀態
已被別人改過時，整批 abort 會讓 admin 不知道該重做哪幾筆。

**API**

| 端點 | 變更 |
|---|---|
| `GET /admin/withdrawals` | 加 `from`/`to`/`search` query；回應加 `stats`（`pendingAmount`、各狀態筆數）與 `events`（該筆的轉換歷史） |
| `POST /admin/withdrawals/:id/status` | 受理 `completed`；`bank_ref`/`transferred_on`；`note` 對 `rejected`/`completed` 必填 |
| `POST /admin/withdrawals/batch-mark-paid` | **新**：批次標記已匯款 |
| `GET /admin/withdrawals/summary` | **新**：待處理筆數（供入口 badge，輕量、可獨立快取） |
| `GET /rewards/withdrawals` | 加 `note`（退件理由）與 `completedByAdmin: bool`（不外洩 admin 身分） |

### 2.3 PR 3：會員查詢台

- `admin_list_members()` 改寫：加 `stats`（**在 filtered CTE 上算，不受 limit
  影響**）、`end_date`、`id_verification_status`；新增 `p_status` 與 `p_sort`。
- `admin_member_detail(p_user_id)`（新）：會籍（`user_account_status`）、點數
  （**復用 `get_reward_summary`**，不另寫一份餘額邏輯）、推薦人、直接下線數、
  刊登數、證件審核狀態、銀行資訊、停權時點、註冊時間。
- `admin_set_member_admin(p_admin_id, p_target_id, p_is_admin)`（新）：
  `cannot_demote_self` / `last_admin`（advisory lock，比照 `admin_setup_claim`）。
  可行性已確認——`prevent_admin_escalation` 放行 `service_role`/`postgres`
  （`20260718000102` §2c）。
- API：`GET /admin/members`（加 query）、`GET /admin/members/:id`（新）、
  `POST /admin/members/:id/admin`（新）。

### 2.4 契約（`supabase/functions/_shared/api-contract.ts`）

`AdminMemberSchema` 加 `endDate`、`idVerificationStatus`；`AdminMembersResponseSchema`
加 `stats`；新增 `AdminMemberDetailSchema`、`AdminIdReviewSchema`、
`WithdrawalEventSchema`、`AdminWithdrawalStatsSchema`。
會員端提領記錄型別目前**寫死在 `WithdrawalSection.tsx:23`**，順手收進 @contract。

**所有新 admin 端點必須登記進 `admin-gate.test.ts` 的 `ADMIN_ROUTES`**
——那張表是機械把關的權限清單，漏登記即漏權限。

---

## 3. 架構影響

- **切成三個 PR**（v1 把 11 階段塞一條分支，審查困難、回滾粒度粗）：
  PR 1 證件審核 → PR 2 提領作業台 → PR 3 會員查詢台。
  **順序有依賴**：PR 1 先落地，PR 2 的作業台才知道證件是否已審過（審過就
  不必再把證件照放在匯款動線的正中央，只留參考入口）。PR 3 獨立，可平行。
- **`api/index.ts` 已 3351 行**，本規劃再加 6 個端點。不在本規劃拆檔（那是
  獨立的重構，混進來會讓 diff 無法審），但**新端點一律緊鄰既有 `/admin/*`
  區塊（957–1210）**，不散落，為日後拆檔留下乾淨的切點。
- **四契約（multi-step-flow）**：提領 dialog 從 3 步變 2 步，是既有多步驟流程
  的**縮減**，需回頭確認 `docs/multi-step-flow-recovery.md` 的四契約仍成立
  （草稿恢復的步驟編號會變）。
- **效能**：`GET /admin/withdrawals` 加 `events` 會 N+1——一次 `in` 查詢批次
  取回後在應用層 group，比照現行證件照簽名網址的批次作法（`index.ts:1063`）。
- **既有測試風險**：`profile-masking.test.ts:132` 是「admin 列表維持完整值」的
  characterization，改 `/admin/withdrawals` 時**只加欄位、不改既有欄位**。
  `withdrawals.test.ts` 的既有 4 個案例會因守衛 #5 變更而受影響——需同步更新
  （建立可提領使用者的 helper 要補 `id_verification_status = 'approved'`）。

---

## 4. UI/UX

裝置分工是需求方裁決（「兩者都有」），因此三個模組各有主場：

| 模組 | 主場 | 版面策略 |
|---|---|---|
| 提領作業台 | **電腦**（要開網銀） | 桌面優先：左列表右作業面板。手機降級為唯讀卡片列表（可看狀態、不做匯款） |
| 會員查詢台 | **手機**（客服隨時查） | 手機優先：搜尋框置頂 + 結果卡片 + 詳情 `Sheet`。桌面用表格 |
| 證件審核 | 手機可行 | 大圖 + 通過／退回兩顆鍵，單欄，適合拇指 |

對照 `docs/ui-ux-guidelines.md`：

- **§5 不得靜默截斷** → 沿用 §7.3 已裁決的「已顯示 X / Y 筆記錄」+ 加載更多，
  實作比照 `ReferralTreeView.tsx:626`（含 offset = 已取回筆數的續接、失敗不清空）。
- **§5 骨架屏** → 現行兩處都是置中 spinner，準則明列「可延伸：…後台列表」，
  改成與列同形的 `Skeleton`。
- **§7 雙套版面 + Sheet** → 專案成熟模式，直接沿用；**v1 那句「admin 是低頻
  桌面作業所以維持橫向捲動」已作廢**（那是未經查證的假設，需求方已否定）。
- **§3 入口** → 準則明文「已登入的功能入口不應只藏在右上頭像下拉裡」，而
  admin 入口目前正是如此（`Navbar.tsx:142`）。本規劃補：入口移出下拉、待處理
  筆數 badge（驗收 W7）。**不動 BottomNav**（§3 契約：只有五格，admin 不進去）。
- **§6 三態** → 每張列表與面板都要空／錯／載入態；篩選後無結果的空態文案要與
  「尚無資料」區分。
- **§8 可測試性** → 搜尋框 `type="search"`、篩選用既有 `common/FilterChip`、
  切換鈕 name 隨狀態變動（「設為管理員」／「撤銷管理員」）。
- **統計卡**用既有 `ui/stat-card-grid.tsx`；**一鍵複製**復用
  `InviteFriendPanelContent.tsx:40` 的 `copyText`（含 `execCommand` fallback，
  LINE 內建瀏覽器需要）。
- **危險動作** → 退件、代為完成、批次標記、撤銷管理員都走 `AlertDialog` 二次
  確認；必填理由的 `Textarea` 空白時送出鍵 disabled。**批次確認要列出筆數與
  總金額**（「將標記 12 筆、合計 $34,000 為已匯款」）。

---

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

### PR 1：證件審核

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1.1 | 證件審核資料層 + backfill | `supabase/functions/api/id-verification.test.ts` | 上傳→`pending`；換照片→退回 `pending`；backfill 只放行曾成功提領者（V5） |
| 1.2 | `request_withdrawal` 守衛 #5 改寫 | `withdrawals.test.ts` | 四種證件狀態各自的 error_code；既有 4 個案例同步更新後仍綠 |
| 1.3 | admin 審核端點 | `id-verification.test.ts` | 退回缺理由 → 400；通過後跨提領重用（V3）；進 `ADMIN_ROUTES` |
| 1.4 | 會員端證件區塊（移出提領 dialog）+ 提領改 2 步 | `src/components/reward/*.test.tsx`（jsdom） | 審核中／退回（含理由）／通過三態；提領 dialog 步驟數與草稿恢復仍正確 |
| 1.5 | admin 審核佇列 UI | `src/components/admin/IdReviewQueue.test.tsx`（jsdom） | 大圖＋通過/退回；退回理由空白時送出 disabled |

### PR 2：提領作業台

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 2.1 | CSV 欄位跳脫純函式（`src/utils/csv.ts`） | `src/utils/csv.test.ts`（node） | 逗號／引號／換行／前導 `=+-@` 公式注入皆正確跳脫 |
| 2.2 | `withdrawal_events` + 狀態機改寫（含 `completed`） | `withdrawals.test.ts` | 每次轉換寫一筆事件、歷史不被覆寫；缺 note → `note_required`；重入冪等不重複寫事件 |
| 2.3 | 批次標記已匯款 | `withdrawals.test.ts` | 部分失敗回 `{succeeded, failed}` 而非整批 abort |
| 2.4 | 列表分頁／彙總／篩選／events | `withdrawals.test.ts` | `total` 反映全部命中；`pendingAmount` 正確；`profile-masking.test.ts` 仍綠 |
| 2.5 | 退件理由端到端（會員看得到） | `withdrawals.test.ts` | `GET /rewards/withdrawals` 回得到 note |
| 2.6 | 作業台前端（同屏＋一鍵複製＋批次＋分頁＋CSV） | `WithdrawalManagement.test.tsx`（jsdom） | 帳號可複製；批次確認顯示筆數與總額；「已顯示 X / Y」；CSV 接 2.1 |
| 2.7 | 會員端顯示退件理由 | `WithdrawalSection.test.tsx`（jsdom） | `rejected` 有 note 時渲染；無 note 不留空殼 |
| 2.8 | 入口 badge（待處理筆數） | `Navbar.test.tsx`（jsdom） | 有待處理時顯示數字；為 0 時不顯示空 badge |

### PR 3：會員查詢台

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 3.1 | 列表：全站 `stats` + 篩選 + 排序 + `endDate` | `admin-and-announcements.test.ts` | 51 筆資料下 `stats.suspended` 不受 `limit=50` 影響；各排序鍵正確 |
| 3.2 | 會員詳情 `GET /admin/members/:id` | 同上 | 回得到會籍到期日／餘額／推薦人／下線數／證件狀態；進 `ADMIN_ROUTES` |
| 3.3 | 管理員授予／撤銷 | 同上 | `cannot_demote_self`；`last_admin`；成功後 `is_admin` 確實改變 |
| 3.4 | 查詢台前端（搜尋優先、手機卡片、詳情 Sheet） | `MemberManagement.test.tsx`（jsdom） | 統計卡讀 `stats` 不再 filter 當前頁；詳情 Sheet 開闔；管理員切換 |

### 收尾（隨最後一個 PR）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 4.1 | 規格書同步：§5.3 證件審核例外、§10.1 檢核 #5、§10.3 事件表、§13 表格 | `python3 scripts/check-spec-drift.py` | 綠 |

> **階段 4.1 的地雷**：`check-spec-drift.py` 的「提領狀態機」抽取式是
> `` ^(`pending` → [^\n]*)$ ``（該檔 `ENUMS` 第一條）。§10.3 那行**必須維持
> 單行、以 `` `pending` → `` 開頭**，新描述只能加在它前後。抽不到 = 紅，
> 這是刻意設計（該檔開頭：「抽不到 = 失敗，不是略過」）。狀態**值**不變
> （沒有新狀態），`withdrawals_status_check` 不動。

---

## 6. 開放問題（等人裁決，禁止腦補）

已由需求方裁決、**不再是開放問題**：裝置（兩者都有）、批次標記（要做）、
§13 資料審核（是證件審核流程）、卡單收尾（admin 代為完成）。

- [ ] **#1 證件審核的 backfill 判準**：規劃採「曾有提領到達 `awaiting_collection`
      或 `completed` 者視為已審核」。只上傳過但從未成功提領的人會落在 `pending`
      ——他們下次提領會被新關卡擋住並看到「審核中」。這批人有多少、能否接受
      被擋，需求方需確認（正式站可先查 `count(*)`）。
- [ ] **#2 會員詳情面板是否顯示身分證字號與銀行帳號全碼？**
      `profile-masking.test.ts` 的 characterization 是「**提領列表**維持完整值
      （匯款作業需要）」——詳情面板不是匯款作業。傾向遮罩（`A1****789`），
      要全碼回作業台看。
- [ ] **#3 CSV 全量匯出上限**：規劃設 2000 筆、超限明示拒絕。實際月提領量未知，
      數字待定（原則不變）。
- [ ] **#4 匯款交易序號是否必填？** 規劃設**選填**（有些網銀批次轉帳不逐筆給
      序號）。若營運能穩定取得，改必填能讓對帳更硬。
- [ ] **#5 會員列表預設排序**：現況 `created_at desc`。§7.3 為推薦網絡裁決過
      「預設最早加入」，但 admin 通常找新註冊的人，傾向維持 `created_desc`。

---

## 7. 風險與回滾

| 風險 | 緩解 |
|---|---|
| **證件審核擋住既有會員**（最高風險：上線即客訴） | §2.1 的 backfill 是強制步驟，且判準保守（曾成功提領即放行）。開放問題 #1 要求上線前先查實際人數 |
| **提領 dialog 從 3 步變 2 步破壞草稿恢復** | 階段 1.4 的驗證標準明列草稿恢復；回頭核對 `multi-step-flow-recovery.md` 四契約 |
| **狀態機放寬導致誤標完成** | 只開 `awaiting_collection → completed` 一條路——必須先經過「已匯款」；二次確認 + 必填理由 + 事件表留痕 |
| **批次操作放大誤觸**（一次錯 12 筆） | 確認對話框列出筆數與總金額；部分失敗回報明細不整批 abort；事件表可逐筆追溯 |
| **提權路徑成為漏洞** | 三道防線（middleware／SQL `is_admin`／`last_admin` 防呆）；`admin-gate.test.ts` 的 `ADMIN_ROUTES` 是機械把關，漏登記會紅 |
| **規格書抽取式失配讓閘門靜默失效** | 階段 4.1 的地雷已寫明 |
| **回滾** | 三個 PR 各自可 revert。migration 的欄位／表都是加法（revert 為 `drop`）；被 `create or replace` 覆寫的函數，其原版來源已在 §2.2 標明（`20260718000101` §6d），回滾時重新 apply。**證件審核的 backfill 是資料異動、revert migration 不會還原**——但它只寫 `approved`，回滾後該欄位不再被讀取，無殘留影響 |

---

## 8. 修訂紀錄

**v2（本版）**：從缺陷驅動改為工作驅動。相對 v1 的實質變更——

1. **`processed_by`/`completed_by` 加欄位 → `withdrawal_events` 事件表**。v1 的
   方案有實質缺陷：`note` 是單一欄位且 `coalesce(p_note, note)` 會覆寫，兩次
   操作各填理由時歷史會丟失。
2. **新增匯款交易序號與匯款日期**。v1 的稽核只記「誰按的」，爭議時平台手上
   只有「某 admin 點過兩次按鈕」，沒有能跟銀行對帳的錨點。
3. **新增證件審核子系統**（需求方確認 §13「資料審核」是動詞），連帶解耦提領
   dialog 的第 3 步。v1 誤將其解讀為「詳情面板」並宣稱關閉落差，那是虛報。
4. **新增批次標記**。v1 把批次列入「不做」，但 CSV 匯出的存在證明批次是真實
   工作型態——匯得出去、標不回來，工作流是斷的。
5. **新增同屏作業面板與一鍵複製**。v1 完全沒碰 admin 每天真正的瓶頸：證件照
   在 Dialog、銀行帳號在表格，要用眼睛抄進網銀。
6. **11 階段一條分支 → 三個 PR**。
7. **推翻 v1「admin 是低頻桌面作業」的取捨**（未經查證的假設，需求方已否定：
   匯款在電腦、客服查詢在手機）。
8. **新增 admin 入口與 badge**（v1 未發現 `Navbar.tsx:142` 違反準則 §3）。
