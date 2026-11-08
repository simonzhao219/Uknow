# 後台推薦樹＋查帳資訊 規劃書（S3a／S3b）

<!-- plans-keep: S3a、S3b 共用的施工鷹架（第 6 波 W6-6：一份規劃書兩支 PR）。退場條件：S3b 的 PR 合併時由 /tdd-implement 收尾刪除；S3b 順延第 7 波時，由第 7 波主 session 決定沿用或刪除 -->

上游：第 6 波 `plan.md` §0 的裁決，各條原文以該檔為準，不另問同樣的題：

- W5-70、W6-5：節點欄位與查帳情境全選。
- W6-6：切成 S3a 與 S3b。
- W6-7：預設入口是搜尋框加頂層樹。
- 業主 2026-11-08 經主 session 的裁決：W6-15～W6-19，對應 §6。

修訂紀錄：第 1 版 fd5bf0e，審查見 `review.md`。第 2 版併入 W6-15～19 與 16 條 P1，各條處置見 §8。

## 0. 一句話

讓管理員在後台「先找到一個人」，看他整條推薦線（往上的推薦人、往下推薦了誰），並能逐筆核對：

- 三代獎金有沒有發對
- 點數從哪來
- 會員為什麼沒拿到獎金

目前遇到會員來問或提領前核對，只能到 Supabase Studio 手寫 SQL 查。

## 1. 使用者需求

**對照規格書：**

- §5.1／§5.2：失效與停權照常入帳，只凍結提領。
- §7.2：組織圖是單親樹，節點有四態，不得成環。
- §8.1～8.4：三代發獎規則與冪等鍵。
- §8.5：餘額。
- §9.1～9.2：推薦王與 pair-history。
- §10：提領狀態機。
- §13：管理後台，包括守門、遮罩、不得靜默截斷、頂層分頁只有四格。

**驗收情境**（W6-5 的四個查帳情境，加上 W6-7 的入口）：

1. **入口**
   - admin 進「會員 › 推薦樹」，看到搜尋框和頂層樹。
   - 頂層樹收的是沒有推薦人的會員，口徑見 §2.2。
   - 每個節點都能逐層展開，畫面顯示「已顯示 X / Y 位」，可以載入更多。
2. **② 看某會員的整條線**
   - 用姓名或推薦碼搜尋，全形、半形都可以。
   - 點命中結果後，樹會自動展開他往上的整條線，並捲動、聚焦到他本人。
   - 他的詳情列出往上的推薦人鏈，以及他直接推薦的人數。
3. **① 某筆付款的獎金有沒有發對**
   - 詳情的「付款與三代獎金」逐筆列出付款，任務免費續約也算一筆。
   - 每筆列出第 1／2／3 代該拿的人、實際拿的人與金額，以及結果。
   - 結果共六種，見 §2.1。
4. **④ 會員為什麼沒拿到獎金**
   - 沒拿到的原因寫在各代的結果欄：沒有這一代、成環停發、付款後推薦關係有變動、收獎人不符。
   - 「新約清空帳本」（ledger_reset）不會刪掉獎勵列，所以清空不是「沒發」。它寫在帳號狀態說明，與 S3b 的點數來源明細。
   - 停權、到期、未加入推薦計畫**照發獎金，但不可提領**（W6-15）。帳號狀態區要如實寫出這句。
   - 業主說的「自領停發」，就是 `pay_referral_generations` 的成環停發（`referral_cycle_detected`：收獎者等於付款人本人）。畫面標「成環停發」。
5. **③ 提領前核對點數來源**
   - S3a 只**部分滿足**：給各代獲得、可提領餘額、累計已發、提領審核中與已匯款金額。
   - 逐筆的點數來源明細與跨表對帳在 S3b，S3b 合併後才算完整滿足。
6. **自動標異常**（只標在節點與詳情，不做清單入口，W6-17）
   - S3a 標四種：付款了但三代獎金缺漏、收獎人不符、推薦關係成環或自己推薦自己、推薦關係兩處不一致。
   - S3b 再加「點數跨表核對不符」。

**節點欄位**（W6-5，全要）：

- 身分與會籍：姓名、推薦碼、第 N 層（W6-19）、會籍四態（含停權）、到期日、是否加入推薦計畫與加入時間（`referral_program_joined_at`）。
- 獎金與點數：各代獲得、可提領餘額、累計已發。
- 任務：推薦王本月進度、credit 未領與已領張數。
- 提領：審核中金額、已匯款金額。
- 換線紀錄：口徑見 §2.2（W6-16）。

**不做：**

- 一次展開整棵樹、CSV 匯出（W6-5 已推翻）。
- 異常清單入口（W6-17）。
- 在推薦樹上直接停權、補發或改推薦人。寫入動作只放在既有的會員詳情（§13）。
- 顯示身分證、銀行帳號、電話、生日。
- 改任何發獎、換線、提領規則（W6-15）。
- 完整的換線事件表，列入第 7 波候選（W6-16）。

## 2. 系統設計

### 2.1 「該拿」的判定，與發獎走同一套規則

**現況**（`20261113000001_referral_cycle_guard.sql` 的 `pay_referral_generations`，行號施工時現算）：

- 第 1 代是付款人的 `profiles.referred_by_user_id`。
- 第 2、3 代沿 `referral_edges` 往上找。
- 每次呼叫都讀當下的資料，不存快照。
- 只有三種情況會不發：
  - 這一代沒有人。
  - 收獎者等於付款人（成環），寫 `referral_cycle_detected` 告警，這一代和之後各代都不發。
  - 冪等鍵已經存在。
- **不看收獎者是否停權、到期、加入推薦計畫。**

**新函式 `referral_award_chain(p_referee uuid)`：**

- 屬性：stable、`security definer`、`set search_path = public`、只授權給 service_role。
- 回傳每一代的 `generation`、`recipient_id`、`stop_reason`（`none`／`no_referrer`／`cycle`）。
- 讀法與停止條件和 `pay_referral_generations` 逐字相同。

**等價測試把判定規則釘死：**

- 各種結構下，`pay_referral_generations` 實際寫入的收獎者，必須逐代等於 chain 的結果。
- 結構要涵蓋：缺代、第 1／2／3 代成環、profiles 與 edges 不一致。
- 這支測試就是防止規則漂移的機械閘門。
- S3a **不改** `pay_referral_generations` 本體（W6-19）。
- 本支 PR 在 S1、S6 合併**前後**都要在 CI 跑過這支測試。若有一方先合併，就 rebase 後重跑：
  - S1 若改變例外處理（例如 re-raise），「實發」的斷言要跟著涵蓋。
  - S6 若改變 `uknow.referred_by_changed_at` 的設定時機，會影響下方的可判定閘門。

**付款時點與冪等鍵：**

| 事件 | 付款時點 | 冪等鍵 |
|---|---|---|
| 付款 | `payment_orders.completed_at`（`status='completed'`） | 經 `subscriptions.source_payment_order_id` 取 `subscription_id` |
| 任務免費續約 | `referral_king_rewards.claimed_at`（`status='claimed'`） | `source_claim_id` |

這和 `repair_orphaned_payments`、`repair_orphaned_claim_rewards` 使用的時點相同。

**可判定閘門（比自癒更保守）：**

- 自癒只檢查付款人本人的 `referred_by_changed_at` 是否 ≤ 付款時點，補發時讀的是現在的鏈。
- 查帳要求付款人、第 1 代、第 2 代**每一位**的 `referred_by_changed_at` 都是 null 或 ≤ 付款時點，才算「可判定」。
- 不可判定時，顯示「付款後推薦關係有變動，無法以現況判定」，不算缺漏。
- 已知殘留：`referred_by_changed_at` 為 null 的舊資料，與自癒一樣視為可判定。若這些人在欄位上線前就換過線，可能誤判。
  - 正式站會員 24 位，施工階段 4 前請主 session 代查 null 的筆數，回報在 PR 內文。

**每一代的結果（六種）：**

| 結果 | 條件 |
|---|---|
| 已發 | 可判定；該代有收獎者；找到 `(referee, generation, 冪等鍵)` 的 `type='referral_reward'` 列，且列上的 `user_id` 等於 chain 算出的收獎者 |
| 缺漏（異常） | 可判定；該代有收獎者；找不到上述那一列 |
| 收獎人不符（異常） | 可判定；列存在，但 `user_id` 不是 chain 算出的收獎者 |
| 不適用 | 鏈在這一代以前就沒有人 |
| 成環停發 | `stop_reason='cycle'`；這一代和之後各代都是這個結果 |
| 無法判定 | 未通過可判定閘門。若列存在，照樣列出實際拿到的人與金額，供人工判斷 |

**補充說明：**

- 「缺漏」一定已通過付款人本人的閘門，也就是自癒會補的範圍。所以「付款與三代獎金」區塊頂部可以提示一次：「缺漏會在該會員下次登入載入時自動補發；持續存在請回報」。「無法判定」與「收獎人不符」不套用這句提示。
- `ledger_reset` 不刪獎勵列，所以清空帳本不會被誤判成缺漏。

### 2.2 資料流與 API

**整體做法：**

- 後端由 RPC 組裝資料，Edge 只做守門與轉換格式。現況慣例：`admin_list_members`、`admin_member_detail`。
- **每支 RPC 都回單一 `jsonb`**，不回 `setof`。單一值不受 PostgREST `max_rows=1000` 截斷（第 4 波 ref P1-3）。
- 分頁與 `total` 都在 SQL 裡算。`limit` 預設 50、上限 200，與 `parsePageParams` 一致。
- 每支函式都是 `security definer`、`set search_path = public`、`set statement_timeout = '5s'`。
- 授權：`revoke execute … from anon, authenticated, public`，只 `grant` 給 service_role。

**端點**（都在 `/admin/*` middleware 之下，handler 內再查一次 admin）：

| 端點 | RPC | 回應重點 |
|---|---|---|
| `GET /admin/referral-tree/nodes?parentId=&ensureId=&limit=&offset=` | `admin_referral_tree_nodes` | 不帶 parentId 就是頂層。回 `{ total, nodes[], pinned? }`。節點是摘要欄位，含 `directCount` 與 `anomalyKinds[]` |
| `GET /admin/referral-tree/search?q=&limit=&offset=` | `admin_referral_tree_search` | 搜尋規則見下方。每筆命中帶 `ancestorIds`（從頂層到父節點的順序） |
| `GET /admin/referral-tree/members/:id` | `admin_referral_member_audit` | 節點全部欄位、往上的推薦人鏈、換線紀錄、`anomalies[]` |
| `GET /admin/referral-tree/members/:id/payments?limit=&offset=` | `admin_referral_payment_audit` | 這個人當付款人的每一筆付款與任務續約，依付款時點新到舊。每筆帶三代的「該拿／實拿／金額／結果」 |
| S3b：`GET /admin/referral-tree/members/:id/ledger?limit=&offset=` | `admin_referral_ledger_audit` | 點數來源明細與跨表核對，見 §2.3 |

**搜尋規則：**

- 推薦碼：在 TS 端先用 `normalizeReferralCode` 正規化，再精確比對 `referral_codes.code`。已失效的碼也比對。
- 姓名：`ilike` 部分比對，`%`、`_`、`\` 先跳脫。
- admin 看的是真名，與 §7.3 會員端的遮罩無關。

**樹的單一來源是 `referral_edges`：**

- 子層：`referrer_user_id = parent`，用 `idx_referral_edges_referrer` 查。排序固定為 `referred_at, referee_user_id`，分頁才不會重複或漏列。
- 頂層：收「沒有一條 edge 指向自己」的會員。依 W6-19，只收「曾有過訂閱」或「至少有一條 edge 指向他」的人，也就是有推薦對象的人。排序固定為 `profiles.created_at, id`。
- 這個篩選**只套在頂層**。子層與 `directCount` 都直接數 edges，兩者一定對得上。
- 註冊中的空殼列從既有的會員列表找。
- **推薦關係兩處不一致（異常）**：曾有訂閱、但 `profiles.referred_by_user_id` 不等於 edge 的 referrer。
  - 發獎的第 1 代讀 profiles，樹讀 edges，兩邊不一致時查帳會看到矛盾，所以要明標。
  - 只算曾付款的會員，因為註冊中還沒付款的人本來就還沒有 edge。

**`ensureId` 與 `pinned`**（給自動展開用）：

- 子層請求帶 `ensureId` 時，若目標不在本頁，就另外回傳 `pinned`。
- 本頁 `nodes` 與 `total` 不受 `pinned` 影響。
- 前端的規則見 §4，也就是 offset 怎麼算、X 怎麼數。

**往上的推薦人鏈：**

- 用遞迴 CTE 沿 edges 往上走，以 path 陣列防止無限迴圈。
- 深度上限 `ADMIN_TREE_MAX_UPLINE_DEPTH = 50`，是具名常數。
- 到上限就停，回傳 `truncated: true`，畫面明示，不靜默截斷。
- 頂層「第 N 層」的 N 等於鏈長加 1。

**成環有兩種，口徑分開：**

- **付款的「成環停發」**：只看前 3 代，與發獎相同，見 §2.1。
- **節點的「推薦關係成環」**：從這個節點往上走，在 50 步內重複遇到任何一個節點。
  - 這同時涵蓋「自己在環上」與「往上接進別人的環」（rho 形）。
  - 文案分成兩種：「在推薦環上」與「往上的推薦關係成環」。
  - `profiles.referred_by_user_id = id` 歸入這一類，標「自己推薦自己」。
  - edges 有 `check(referee<>referrer)`，所以自己指向自己只可能發生在 profiles。
- 第 4 代以上的環，付款列不會出現「成環停發」，但節點會有異常標示。兩者不矛盾，詳情裡要寫明這一點。

**節點摘要的 `anomalyKinds`：**

- 每頁最多 200 個節點，每個節點的付款數 × 三代都要逐筆判定。
- 量級假設是單一會員付款不超過 50 筆，這個上限就足夠。
- 超過 `statement_timeout` 就回 500，前端顯示讀取失敗，不回空清單。

**換線紀錄**（W6-16 的 (a') 版本，不承諾完整的順序）：

- **曾有過的推薦人（無順序）**：
  - 來源：`referral_pair_history` 中 `referee = 本人` 的 referrer 集合，聯集目前的 edge referrer。
  - 只列姓名與推薦碼，不列時間。
  - pair-history 是在「任務 +1」時寫入的，回填列的 `created_at` 都相同，不能當作接線時點。
- **新約付款單事件（有時間）**：
  - 條件：`payment_orders` 中 `status='completed'`、`renewal_mode='fresh'`、`fresh_referrer_source in ('code','default')`、`fresh_referrer_user_id is not null`。`keep` 不算換線。
  - 每筆列出時間（`completed_at`）與指定的新推薦人。
  - 「是否生效」只對**最新一筆**判定：本人的 `referred_by_changed_at = completed_at`，而且目前的推薦人等於這張單的 `fresh_referrer_user_id`，才標「已生效」。
  - 其餘各筆一律標「未能確認」。不用告警類型判定，因為 S6 會改動告警種類，判定條件會跟著漂移。
- 畫面說明：「換線前後的完整順序在現有資料中無法重建，只列出可確認的部分。」

**錯誤路徑：**

- RPC 有任何錯誤都回 500，不回空清單（第 4 波 P1-5 同類）。
- `:id`、`parentId`、`ensureId` 不是 uuid 回 400；查無此人回 404；`q` 去掉頭尾空白後為空回 400。
- 回應 schema 寫進 `_shared/api-contract.ts`，handler 用 `satisfies` 對齊。

**資料庫變更：**

- **一支 migration**，版本號排在同波 S1 的 migration 之後。各階段在同一支 migration 裡依序追加函式。
- rebase 後必跑 `check-migration-versions.py`。
- 內容：
  - 新函式，含授權設定。
  - 新索引 `referral_pair_history (referee_user_id)`：現況只有 PK `(referrer, referee)`，查「本人有過哪些推薦人」需要這條。
  - 不另加 payment_orders 的索引，現有 `idx_payment_orders_user` 就夠。
- **不改任何表結構與既有函式**，正式站的 migration 純加法。

### 2.3 S3b：點數來源明細與跨表核對（W6-18）

**點數來源明細：**

- 這個人在 `reward_transactions_with_balance` 的每一列，分頁、依時間新到舊。
- 每列帶分類（`source_category`）、金額、`balance_after`。
- 每列附上關聯：
  - 推薦獎勵：付款人與付款時點（從 subscription 或 claim 取）。
  - 提領與退款：`withdrawal_id` 與提領狀態。
  - ledger_reset：觸發的訂閱。

**跨表核對**（取代「餘額 ≠ 獲得 − 提領」，因為那條式子在同一張表上是恆等式）。下列任一條不成立，就標「點數跨表核對不符」：

1. 每筆非退件的 `withdrawals`，帳本恰有一列 `withdrawal` 的扣款，金額等於 −(amount＋fee)。
2. 每筆 `rejected` 的提領，帳本恰有一列退款（`adjustment` 加 `withdrawal_id`），金額等於 +(amount＋fee)。
3. 帳本上沒有孤兒 `withdrawal_id`：它指向的提領必須存在，且屬於同一人。
4. 每列 `ledger_reset` 的金額，等於該列之前的 `balance_after` 取負號，也就是清空當下的餘額。

金額與符號的實際寫法，S3b 開工時以 `request_withdrawal`、`admin_update_withdrawal_status`、fresh forfeit 的現行函式為準，在 S3b 的 PR 內文列出對照。

## 3. 架構影響

### 前端

- **次分頁位置**
  - 「會員」底下加第三個次分頁「推薦樹」，放在證件審核之後，不改動既有兩格的位置。
  - 不加第 5 個頂層分頁（ui-ux §3）。
  - 新 `TabsTrigger` 要套 `lockedTabProps`，參與 `tabLocked`（寫入在途時鎖住）。
- **元件**放 `src/components/admin/referral-tree/`：
  - `AdminReferralTree`：搜尋、頂層樹、懶展開、自動展開。
  - `ReferralAuditSheet`：節點詳情。
  - `PaymentAuditList`：手機卡片與桌面表格擇一渲染。
  - `referralAudit.ts`：純函式，處理展開路徑、`pinned` 合併與去重、結果與原因的文案、層級標示。
- **資料注入鏈**
  - `AdminDashboard.tsx` 定義 `REFERRAL_TREE_API: ReferralTreeLoaders`，包含 `loadNodes`、`search`、`loadMember`、`loadPayments`，S3b 再加 `loadLedger`。
  - 往下傳的路徑：`AdminConsole` 的 `members` props → `MemberManagement` → `AdminReferralTree`、`ReferralAuditSheet`。
  - 整包傳一個物件，不在 `MemberManagementProps` 上逐一加欄位。這個檔案已超過 900 行。
- **跨次分頁導覽**：從 `MemberDetailSheet` 點「在推薦樹中查看」：
  - 跳轉目標由 `MemberManagement` 用 `treeFocusId` state 持有，依序執行：
    1. 關閉 Sheet，焦點交還原處（照 Radix 的行為）。
    2. `setMemberTab('referral-tree')`。
    3. `AdminReferralTree` 收到 `focusId` 後，先 `GET members/:id` 取得 `ancestorIds`，再走自動展開（與點搜尋命中同一條路）。
  - 寫入在途、分頁被鎖時，連結停用，並 `aria-describedby` 指向鎖定說明。
  - 「推薦樹」**不寫入** `writeView({memberTab})`，`writeView` 維持上一個非推薦樹的子分頁。理由：推薦樹每次都要重讀，回到後台時不該直接落在一個重頁。
- **不共用會員端的 `ReferralTreeView`**：
  - 它的節點型別是遮罩名，loader 綁的是 viewer 的三代子樹。
  - 它的展開鈕是 24px，`treeitem` 裡又包 `button`，有既有的技術債。
  - admin 版另寫，只借用 `usePagedList`。

### 後端

- 新 handler 放 `supabase/functions/api/admin-referral-tree.ts`，照 `referral-invite.ts`、`listing-photos.ts` 的慣例：
  - `createAdminReferralTreeHandlers(deps)` 回傳 handler。
  - index.ts 只多 import、deps 與每條路由一行掛載。
  - 新檔**不得 import `./index.ts`**，複製 `referral-invite-deps.unit.test.ts` 的反向匯入守衛。
- **`deriveNodeStatus` 抽到 `supabase/functions/api/node-status.ts`**：
  - index.ts 與新 handler 都從這裡 import。
  - 現有呼叫點的行為不變，由既有測試把關，例如 network-endpoints、members/verify。
- 與 S2 改動的 index.ts validate 段不同區。

### 守門（W6-19：自動列舉路由）

- `admin-gate.test.ts` 新增一條覆蓋斷言：從 `app.routes` 列舉所有 `/api/admin/` 路由。
  - 排除 `ALL` 型的 middleware 項。
  - 列舉結果必須是手寫 `ADMIN_ROUTES` 的子集，漏列一條就紅燈。
- 手寫清單保留 method 與帶入參數，`:id` 一律代入一個合法的 dummy uuid。只打匿名與一般會員，不會真的執行寫入。
- 補上清單漏掉的 4 條寫入端點（ops P2-4）與本次的新端點。
- 每支新 RPC 都測「authenticated／anon 不得 EXECUTE」。

### 個資

- RPC 本身不 select `national_id`、`bank_code`、`bank_account`、`phone`、`birth_date`。測試斷言回應的 key 集合不含這些欄位。
- `ReferralAuditSheet` 會走 portal，所以 `<SheetContent className={privateClass(…)}` 要寫在**同一行**，並列入 `SENSITIVE_PORTALS`。`analyticsReviewHardening.test.ts` 要求 anchor 與 `privateClass(` 在同一行。
- 本次要動 `MemberDetailSheet`（加連結），順手把它的 `SheetContent` 一併補成同樣寫法、列入清單。

### 快取與規格書

- 推薦樹與詳情每次都重讀，不進 `adminCache`。
- 規格書 §13「不從快取顯示」的清單要補上這兩項。這不是 W6 的需求，屬於規格書同步。

### 其他

- 本功能沒有多步驟流程，multi-step-flow 四契約不適用。
- **選配範圍**（不是 W6 需求，是工程決定）：
  - 自動列舉路由（W6-19 已定）。
  - `MemberDetailSheet` 補進 `SENSITIVE_PORTALS`。
  - `referral_pair_history` 索引。
  - 規格書 §13 的快取清單。

## 4. UI/UX

### 畫面草圖（手機 375px）

```
[會員列表] [證件審核] [推薦樹]          ← 次分頁，推薦樹在第三格
┌ 搜尋姓名或推薦碼 ───────────── 🔍 ┐
已顯示 20 / 24 位（頂層）
[›] 王大明 · 8048876
    訂閱中 · 2027-03-01 到期 · 直接推薦 12 位 · ⚠ 獎金缺漏
  [⌄] 陳小華 · 8048890
      即將到期 剩 12 天 · 直接推薦 3 位
  [載入更多（已顯示 50 / 120 位）]
```

### 節點列

- **語意**
  - 容器用 `role="tree"`，列用 `role="treeitem"`，並加 `aria-level` 與 `aria-expanded`。
  - 展開鈕與「開詳情」是兩個並列的 `button`，不把按鈕巢狀在 treeitem 裡（不重蹈 `ReferralTreeView` 的債）。
  - 觸控面積用 `pointer-coarse:min-h-11 min-w-11`。
  - 鍵盤：↑↓ 移動焦點，→← 展開或收合，Enter 開詳情。
- **內容與換行**
  - 第一行是姓名、推薦碼。
  - 第二行依序是狀態徽章、到期日、直接推薦 N 位、異常文字。
  - 一律 `min-w-0 wrap-anywhere`，**只換行、不截斷**（ui-ux §10）。
- **縮排**
  - 每層 12px，第 4 層以後不再縮排。
  - 第 5 層以後在第二行開頭加「第 N 層」文字。
- **配色**
  - 灰階，不用 `--tree-gen-*` 世代色（§12.5(c)）：admin 樹的層級不是「相對於自己的代」。
  - 不放頭像，不畫連接線。
  - 狀態徽章沿用四態：訂閱中、即將到期、已失效、已停權。

### 詳情 Sheet

沿用 `MemberDetailSheet` 的結構：手機全寬，桌面 `sm:max-w-lg`。由上到下：

1. **頁首**：姓名、推薦碼、狀態徽章、到期日。這裡回答「這個人現在是什麼狀態」。
2. **需要注意**（`StatusCallout variant="warning"`，沒有異常就整塊不渲染，§13 第 3 條）：
   - 逐條列出異常：獎金缺漏 N 筆、收獎人不符 N 筆、推薦關係成環、推薦關係兩處不一致。
   - 每條附一個連結，捲動到對應的區塊。
   - 首屏不捲動，就能回答查帳情境 ①④「有沒有發錯」。
3. **帳號狀態說明**（停權、到期、未加入推薦計畫時才出現）：「獎金照常入帳，但目前不可提領（原因）」（W6-15）。
4. **推薦人鏈**：推薦人、往上第 2 位、往上第 3 位……，每位都可點；`truncated` 時寫「往上超過 50 位，未全部列出」。
5. **獎金與點數**：主數字是「可提領」，其餘降為一行小字：第 1／2／3 代各獲得、累計已發（§13 第 1 條）。
6. **任務**：本月 x / 門檻；credit 未領與已領張數。
7. **提領**：審核中金額、已匯款金額。
8. **換線紀錄**：見 §2.2。
9. **付款與三代獎金**：
   - 手機用 `useMediaQuery` 擇一渲染，一筆付款一張卡：
     - 卡頭：付款時點、類型（付款／任務續約）。
     - 卡內三行：「第 N 代 · 誰 · 金額 · 結果徽章」。
   - 桌面用表格。
   - 支援載入更多，顯示「已顯示 X / Y 筆」。
   - 區塊頂部只出現一次自癒提示，見 §2.1。

### Sheet 內跳到另一個人

- **替換內容**，不疊一層新的 Sheet。
- 頂部常駐「返回〇〇」，可以一路返回；跳轉堆疊只存在元件 state 裡。
- Android 返回鍵用 `useOverlayBackClose`：堆疊不為空時返回上一位，空了才關閉 Sheet。
- 換人後捲動回頂部，焦點落在標題（`tabIndex=-1`）。
- 不同步樹上的選取：樹的展開狀態不變，關閉 Sheet 後焦點回到開啟它的那一列。

### 結果徽章

- 一律「文字＋lucide 圖示」，用 `Badge` 的 subtle 變體，不用 emoji 與 ✓✗⛔ 字元，也不以色相作為唯一線索（§12.3、§12.7）。
- 「缺漏」與「收獎人不符」用 warning，不用紅色；紅色只留給破壞性與失敗（§12.5）。
- 已發、不適用、無法判定、成環停發，對應的色票與圖示在施工時照 §12 的色表決定。

### 文案（W6-19、W5-53、§12.13）

- 樹上用「第 N 層」，從頂層算。
- 付款查帳用收獎「第 1／2／3 代」。
- 推薦人鏈用「推薦人／往上第 N 位」。
- 不出現「上線／下線／整條線」。`terminologyGuard.test.ts` 會掃描。

### 三態（逐塊列出）

| 區塊 | 載入中 | 讀取失敗 | 空態 |
|---|---|---|---|
| 頂層樹 | `AdminListSkeleton` | 整頁 `LoadErrorCallout`。焦點交給 `useRetryFocus`：重試仍失敗回到錯誤框，成功後回到次分頁標題 | 「目前沒有符合條件的會員」 |
| 子層 | 該層骨架 | 只在該層顯示中性錯誤字＋「重試」，不連坐其他層 | 不會發生（`directCount` > 0 才可展開） |
| 搜尋 | 結果區骨架 | 「搜尋失敗，請稍後再試」＋重試，與「找不到符合的會員」分開 | 「找不到符合的會員」 |
| 詳情 Sheet 本體 | 同形骨架 | 黃框加重試。404 時寫「找不到此會員（可能已刪除）」，與失敗分開 | — |
| 付款與三代獎金 | 卡片骨架 | 只在這一區顯示中性錯誤字＋重試，上方各區照常顯示（兩支請求互不連坐，§13 第 4 條） | 「這位會員沒有付款紀錄」 |

### 搜尋

- 輸入後 debounce 300ms。
- 只採用與「目前 q」相同的回應，舊 q 的回應直接丟棄（第 4 波 ref P2-12）。
- 顯示「已顯示 X / Y 筆」，並有「載入更多」。

### 自動展開（點搜尋命中，或從會員詳情跳來）

- 依 `ancestorIds`，由頂層往下逐層請求 `nodes?parentId=…&ensureId=下一層的 id`。
- **`pinned` 的計數規則**：
  - `pinned` 節點接在該層已載入列的尾端，標「搜尋目標」。
  - 不算進「已顯示 X」，也不影響 offset。
  - 之後若在正常分頁中出現同一個 id，就去掉 pinned 那份，以正常列為準。
  - X / Y 仍然只數正常列，所以不會跳號，也不會重複。
- **展開中**：
  - 列表上方顯示「正在展開到〇〇…」，`aria-busy`。
  - 播報走常駐的單一 `aria-live` 節點，只更換文字。
- **中途失敗**：
  - 停在失敗的那一層，該層顯示錯誤＋「重試展開」，重試會從那一層接續。
  - 已展開的上層保留不動。
- **完成**：
  - 目標列捲到可見處（`scroll-mt-20`），焦點落在該列（`tabIndex=-1`）。
  - 播報「已展開到〇〇」。

### e2e 版面檢查

- 把推薦樹與詳情 Sheet 加進 `e2e/test_overflow_sweep.py` 的 `ROUTES`，用 `after_load` 切到推薦樹次分頁、打開一個節點。
- 375px 與 1280px 都要掃描溢出。
- 再驗證三格次分頁在 320px 與 375px 的寬度。

## 5. 階段切分（每階段＝一個 TDD 紅綠循環）

**S3a（必上）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `referral_award_chain`，及其與 `pay_referral_generations` 的等價 | `supabase/functions/api/referral-award-chain.test.ts`（DB） | 以下拓撲下，實發收獎者逐代等於 chain：完整三代、缺第 2 代、缺第 3 代、第 1／2／3 代分別成環、profiles 與 edges 不一致 |
| 2 | 樹節點與搜尋 RPC | `admin-referral-tree-db.test.ts`（DB） | 涵蓋分頁、total、穩定排序、頂層篩選、ancestorIds、ensureId 與 pinned、個資排除、GRANT。一位推薦人有 1,005 位直接推薦時，total 精確，第 21 頁有資料且不重複；全形碼命中；`%` 被跳脫；回應的 key 不含敏感欄位；anon 與 authenticated 被拒 |
| 3 | 會員查帳 RPC | 同上 | 涵蓋全部欄位、往上鏈與深度上限、換線紀錄、成環／rho 形／自己推薦自己、兩處不一致。具體斷言：回填形態的 pair-history（`created_at` 都相同）列為無序集合；新約單 keep 不列入；只有最新一筆可能標「已生效」；兩人成環與 rho 形都標異常且不會無窮迴圈；超過 50 層回 `truncated` |
| 4 | 付款查帳 RPC 與節點的 `anomalyKinds` | 同上 | 六種結果都要造出來。具體斷言：刪掉第 2 代那一列 → 缺漏；改 `user_id` → 收獎人不符；付款後祖先換線 → 無法判定，且「實拿」照列；任務續約用 `claimed_at`；ledger_reset 不誤判；自癒後缺漏消失 |
| 5 | Edge 端點、契約、守門 | 下列三組 | 見下列三組 |
| 5a | 參數與錯誤路徑（假 deps，不連 DB） | `admin-referral-tree.unit.test.ts` | 400（非 uuid、空 q）、404、RPC 錯誤回 500 而不是空清單；反向匯入守衛 |
| 5b | 守門與回應形狀（DB） | `admin-referral-tree.test.ts`、`api-contract.test.ts` | 401、403；回應通過 `assertShape` |
| 5c | admin 路由清單的覆蓋斷言 | `admin-gate.test.ts` | 自動列舉的路由必須是手寫清單的子集 |
| 5d | `deriveNodeStatus` 搬到 `node-status.ts` | 既有 network-endpoints、verify 測試 | 既有測試全綠；新 handler 與 index.ts import 同一份 |
| 6 | 前端純函式 | `src/components/admin/referral-tree/referralAudit.test.ts`（node） | 涵蓋展開路徑、`pinned` 合併、去重與計數、結果與原因的文案、層級標示。所有情境綠燈，文案不含禁用詞 |
| 7 | `AdminReferralTree` | `AdminReferralTree.test.tsx`（jsdom） | 涵蓋搜尋、頂層、懶展開、載入更多、自動展開、中途失敗後續展、三態、丟棄過期回應、`role=tree` 與鍵盤。具體斷言：點命中結果會逐層展開並聚焦到目標；子層失敗只影響那一層；X / Y 不受 pinned 影響 |
| 8 | `ReferralAuditSheet`、`PaymentAuditList`、次分頁、跨分頁導覽、私密設定 | `ReferralAuditSheet.test.tsx`、`MemberManagement.test.tsx`、`AdminDashboard.test.tsx`、`analyticsReviewHardening.test.ts` | 涵蓋需要注意區、各區三態、手機卡片與桌面表格、Sheet 內跳轉與返回、從會員詳情跳到推薦樹、`lockedTabProps`、`writeView` 不記推薦樹、portal 帶私密 class |
| 9 | 規格書與 e2e | `e2e/features/admin_referral_tree.feature`（mock）、`test_overflow_sweep.py`、`test_admin_mobile_layout.py` | 規格書改 §13（並在 §7.2 加指向 §13 的一句），e2e 掃描 375 與 1280。CI 綠；`check-spec-drift.py` 綠 |

**S3b（看進度，S3a 合併後疊在 develop 上另開 PR）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 10 | 點數來源明細與跨表核對 RPC（§2.3） | `admin-referral-tree-db.test.ts` | 四條核對各造一個違反的案例，都要標成異常；正常帳本不標；明細分頁與總數正確 |
| 11 | 端點、契約、詳情的「點數來源」區塊，與異常「點數跨表核對不符」 | Deno unit 與 DB 測試、jsdom | 三態完整；需要注意區列出這類異常 |

## 6. 裁決紀錄（原開放問題 Q1～Q8，皆已裁決）

| 原題 | 裁決 | 內容 |
|---|---|---|
| Q1 停權、到期照發 | **W6-15** | 不改發獎規則。畫面如實寫「照發，但不可提領」，成環停發也如實標示 |
| Q2 換線紀錄 | **W6-16** | (a')：列出曾有過的推薦人（無順序），加上新約付款單事件（有時間）。完整的事件表列為第 7 波候選 |
| Q3 異常清單 | **W6-17** | 不做清單入口。異常只標在節點與詳情上，與 W6-7 一致 |
| Q8 S3b 對帳口徑 | **W6-18** | 改為跨表核對（§2.3），取代「餘額 ≠ 獲得 − 提領」 |
| Q4 層級文案 | **W6-19** | 樹上用「第 N 層」，查帳用收獎「第 1／2／3 代」，推薦人鏈用「推薦人／往上第 N 位」 |
| Q5 收誰 | **W6-19** | 樹與搜尋只收曾訂閱過的人，或有推薦對象的人。篩選只套在頂層（§2.2） |
| Q6 發獎函式 | **W6-19** | S3a 不動 `pay_referral_generations`。等價測試在 S1、S6 合併前後都要跑。改成呼叫 chain 函式留第 7 波 |
| Q7 admin-gate | **W6-19** | 改為自動列舉，用覆蓋斷言實作，順手修掉 ops P2-4 |

**第 2 版審查時，執行 session 自己決定的事**（主 session 或業主可以推翻）：

- Sheet 內跳到另一個人用「替換內容＋返回」，不疊層。
- `writeView` 不記住推薦樹這個次分頁。
- `MemberDetailSheet` 一併補進 `SENSITIVE_PORTALS`。
- 推薦樹這個次分頁放在第三格。

**仍待施工前確認的事實**：

- 正式站 `referred_by_changed_at` 為 null、且曾付款的會員筆數。階段 4 前請主 session 代跑唯讀 SQL 查詢。

## 7. 風險與回滾

- **最壞情況一：判定規則錯了，把正常的付款標成缺漏**，admin 據此人工補發，造成重複發獎。
  - 可判定閘門比自癒更保守。
  - 推薦樹上沒有任何寫入或補發動作，提示只引導等自癒或回報。
  - 等價測試把判定規則釘在發獎函式上。
- **最壞情況二：個資外洩到新的 RPC 回應或錄影**。
  - RPC 不 select 敏感欄位，並用 key 集合測試釘住。
  - portal 帶私密 class，並列入掃描清單。
  - 新 RPC 都有 revoke，並有測試。
- **效能**：
  - 遞迴有深度上限，並用 path 防環。
  - 每次請求最多 200 列。
  - 加 `statement_timeout`；逾時回 500，畫面不呈現成「空的」。
- **同波衝突**：
  - S1、S6 改發獎與換線函式時，等價測試與可判定閘門會受影響。
  - 合併順序以 rebase 重跑 CI 為準。
- **回滾**：
  - 全部是純加法：新函式、新端點、新元件、一條索引。
  - revert PR 之後，再下一支 migration `drop function` 與 `drop index`。
  - `deriveNodeStatus` 搬檔是純重構，由既有測試把關。

## 8. 審查處置對照（第 1 版的 P1 共 16 條）

| # | 發現 | 處置 |
|---|---|---|
| 1 | 異常清單違反 W6-7 | 已移除（W6-17） |
| 2 | Q1 未裁決就寫進驗收；「自領停發」的對應沒寫明 | W6-15；§1 情境 4 寫明對應關係 |
| 3 | S3b 對帳口徑改寫了業主的需求 | W6-18；§2.3 定義明細與四條核對 |
| 4 | pair-history 不是換線紀錄 | W6-16 (a')，改成無順序集合加有時間的事件，階段 3 改用回填形態的資料 |
| 5 | 換線失敗的判定不穩 | 只判定最新一筆，其餘標「未能確認」，排除 keep，不靠告警種類（§2.2） |
| 6 | 「與自癒一致」不成立 | 改寫成「比自癒更保守」；任務續約用 `claimed_at`；寫明冪等鍵的來源；自癒提示只用在缺漏（§2.1） |
| 7 | 樹的來源不唯一 | 單一來源為 edges，篩選只套頂層，固定排序，新增「推薦關係兩處不一致」異常（§2.2） |
| 8 | 匯出 `deriveNodeStatus` 會循環匯入 | 抽出到 `node-status.ts`，加反向匯入守衛（§3、階段 5d） |
| 9 | 前端資料注入鏈漏寫 | 用 `ReferralTreeLoaders` 物件整包傳下去，由 `treeFocusId` 持有跳轉目標（§3） |
| 10 | 「500 不回空」在 DB 測試裡紅不了 | 拆出 unit 測試，用假 deps（階段 5a） |
| 11 | 異常排在最後 | 改成「需要注意」置頂，頁首放主狀態（§4） |
| 12 | 付款查帳沒有手機版面 | 手機卡片、桌面表格擇一渲染，`wrap-anywhere`，加進 overflow sweep（§4） |
| 13 | Sheet 內跳轉的導覽沒定義 | 替換內容，加返回堆疊，定義 Android 返回、焦點與捲動（§4） |
| 14 | 跨次分頁導覽沒規劃 | 跳轉三步驟、鎖定狀態、`writeView`（§3），測試在階段 8 |
| 15 | 三態缺漏 | 五個區塊各自列出三態表（§4） |
| 16 | 自動展開與 pinned 的一致性 | 定義計數、去重、中途失敗後續展、播報、焦點（§4） |

第 1 版的 P2 已一併處理：`user_id` 比對、兩種成環的口徑、跳脫與逾時、索引精簡加 `search_path`、等價測試的跨 PR 依賴、覆蓋斷言、同一行 anchor、`writeView`、單一 migration、情境 5 為部分滿足、選配範圍、觸控語意與鍵盤、灰階、文字徽章、次分頁位置。
