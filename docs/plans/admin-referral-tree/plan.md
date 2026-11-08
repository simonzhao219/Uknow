# 後台推薦樹＋查帳資訊 規劃書（S3a／S3b）

<!-- plans-keep: S3a、S3b 共用的施工鷹架（第 6 波 W6-6：一份規劃書兩支 PR）。退場條件：S3b 的 PR 合併時由 /tdd-implement 收尾刪除；S3b 順延第 7 波時，由第 7 波主 session 決定沿用或刪除 -->

上游：第 6 波 `plan.md` §0 的裁決，各條原文以該檔為準，不另問同樣的題：

- W5-70、W6-5：節點欄位與查帳情境全選。
- W6-6：切成 S3a 與 S3b。
- W6-7：預設入口是搜尋框加頂層樹。
- 業主 2026-11-08 經主 session 的裁決：W6-15～W6-19，對應 §6。

修訂紀錄（審查見 `review.md`）：

- 第 1 版：fd5bf0e。
- 第 2 版：併入 W6-15～19 與第 1 輪的 16 條 P1。
- 第 3 版：併入第 2 輪的 1 條 P0 與 15 條 P1。

各條處置見 §8。

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
   - S3a 標三種：
     - 付款了但三代獎金缺漏。
     - 收獎人不符：「有沒有發對」的細分，對應 W6-5 情境①「誰該拿、實際有沒有拿」。
     - 推薦關係成環或自己推薦自己。
   - 「推薦人資料兩處不一致」不算異常、不上節點標示，只在詳情裡當**資訊提示**出現（§2.2，屬執行 session 加選）。
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
- 推薦樹的入口只有兩個：會員次分頁本身，以及會員詳情裡的「在推薦樹中查看」（§3 選配）。

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

**判定順序**：先過可判定閘門，再判其他結果。例如付款人現在沒有推薦人，但 `referred_by_changed_at` 晚於付款時點，結果是「無法判定」，而不是「不適用」。

**找不到對應訂閱**的已完成付款單（`source_payment_order_id` 查無訂閱，或是舊資料）：三代都標「無法判定」，原因寫「找不到對應訂閱」。

**金額**：畫面一律顯示**實拿金額**，不比對「應得金額」。`reward_config.referral_reward_amount` 會隨時間調整，歷史的應得值無法重建，所以文案不寫「金額正確」。

**補充說明：**

- 「缺漏」一定已通過付款人本人的閘門，也就是自癒會補的範圍。所以「付款與三代獎金」區塊頂部可以提示一次：「缺漏會在該會員下次登入載入時自動補發；持續存在請回報」。「無法判定」與「收獎人不符」不套用這句提示。
- `ledger_reset` 不刪獎勵列，所以清空帳本不會被誤判成缺漏。

### 2.2 資料流與 API

**整體做法：**

- 後端由 RPC 組裝資料，Edge 只做守門與轉換格式。現況慣例：`admin_list_members`、`admin_member_detail`。
- **每支 RPC 都回單一 `jsonb`**，不回 `setof`。單一值不受 PostgREST `max_rows=1000` 截斷（第 4 波 ref P1-3）。
- 分頁與 `total` 都在 SQL 裡算。`limit` 預設 50、上限 200，與 `parsePageParams` 一致。
- 每支函式都是 `security definer`、`set search_path = public`。
- **不依賴** `statement_timeout`：函式上的 `SET` 擋不住已在跑的最外層 statement，repo 也沒有先例。成本改以「有界」設計控制，見下方 `anomalyKinds`。
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
- **搜尋與樹收同一群人**（W6-19）：曾有過訂閱，或至少有一條 edge 指向他（有推薦對象）。
  - edge 是付款時才寫入，所以樹上的子節點必然曾付款，一定在這群人裡。
  - 階段 2 斷言：沒訂閱、也沒有推薦對象的人搜不到。
- admin 看的是真名，與 §7.3 會員端的遮罩無關。

**樹的單一來源是 `referral_edges`：**

- 子層：`referrer_user_id = parent`，用 `idx_referral_edges_referrer` 查。排序固定為 `referred_at, referee_user_id`，分頁才不會重複或漏列。
- 頂層：收「沒有一條 edge 指向自己」的會員。
  - 成環的人和往上接進環的整條子樹，都不會出現在頂層，只能靠搜尋找到。
  - **W6-21**：頂層樹最後加一個預設收合的群組「無法接上推薦樹的會員（N）」。
    - 展開後是這些人的節點，帶成環標記，分頁與「已顯示 X / Y」照一般子層。
    - N=0 時整個群組不顯示。
    - 收的人：曾付款或有推薦對象（與樹同一群人）、往上走在 50 步內重複遇到節點，而且本身不是頂層。也就是在環上，或往上接進環。
    - 往上超過 50 層的人**不收**，因為他們在樹上接得到，只是鏈太長。
    - 這是樹的一部分，不是異常清單，與 W6-17 不衝突。
    - API：`nodes?group=unplaceable&limit=&offset=`，回 `{ total, nodes[] }`；頂層回應另帶 `unplaceableCount`。
    - 這些人的子樹：從群組內的節點照常逐層展開。環上的子節點可能又指回群組內的人，因此展開時遇到已在祖先路徑上的 id，就停止往下，並標「推薦關係成環，不再往下展開」。依 W6-19，只收「曾有過訂閱」或「至少有一條 edge 指向他」的人，也就是有推薦對象的人。排序固定為 `profiles.created_at, id`。
- 這個篩選在頂層才實際生效（子層必然符合），子層與 `directCount` 都直接數 edges，兩者一定對得上。
- 註冊中的空殼列從既有的會員列表找。
- **推薦人資料兩處不一致（資訊提示，不算異常）**：
  - 條件：曾有訂閱，且 `profiles.referred_by_user_id IS DISTINCT FROM`（該人 edge 的 referrer）。edge 不存在時取 null，所以「profiles 有、edge 沒有」與「profiles 為 null、edge 存在」都算。
  - 只在詳情的「推薦人鏈」下方寫一行說明：「發獎的第 1 代依會員資料，樹依推薦關係，兩者目前不一致」。
  - 理由：發獎第 1 代讀 profiles，樹讀 edges，不說明的話查帳會看到矛盾。
  - 這不是業主列的異常種類，屬執行 session 加選，主 session 可以拿掉。

**`ensureId` 與 `pinned`**（給自動展開用）：

- **頂層與子層**請求都能帶 `ensureId`。目標不在本頁時，另外回傳 `pinned`。
- 本頁 `nodes` 與 `total` 不受 `pinned` 影響。
- **搜尋命中定位不到樹上時**，`ancestorIds` 回 `null`，並附 `unplaceableReason`：
  - `cycle`：在環上，或往上接進環。
  - `truncated`：往上超過 50 層。
  - 前端改成「只開詳情、不展開樹」，並寫出原因，例如「這位會員的推薦關係成環，無法在樹上定位」。
  - 階段 2 與階段 7 各造一個這類案例。
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

- 每頁最多 200 個節點，每個節點只判定**最近 `ADMIN_TREE_ANOMALY_SCAN = 50` 筆**付款與任務續約。
  - 每個節點只算一次 chain（lateral 或 CTE），所以每頁最多算 200 次 chain。
  - 再依時間取前 50 筆付款，逐筆只做閘門判斷與唯一索引查找，每頁最多 200 × 50 次。
  - 超過 50 筆的節點回 `anomalyScanTruncated: true`，節點上加註「只檢查最近 50 筆」。
  - 詳情的付款查帳採分頁，逐頁判定，不受這個上限影響。
- 施工前請主 session 代查：正式站單一會員的最大付款筆數。
- 查詢錯誤一律回 500，前端顯示讀取失敗，不回空清單。

**換線紀錄**（W6-16 的 (a') 版本，不承諾完整的順序）：

- **曾有過的推薦人（無順序）**：
  - 來源：`referral_pair_history` 中 `referee = 本人` 的 referrer 集合，聯集目前的 edge referrer。
  - 只列姓名與推薦碼，不列時間。
  - pair-history 是在「任務 +1」時寫入的，回填列的 `created_at` 都相同，不能當作接線時點。
- **新約付款單事件（有時間）**：
  - 條件：`payment_orders` 中 `status='completed'`、`renewal_mode='fresh'`、`fresh_referrer_source in ('code','default')`、`fresh_referrer_user_id is not null`。`keep` 不算換線。
  - 每筆列出時間（`completed_at`）與指定的新推薦人。
  - 「是否生效」只對**最新一筆**判定：本人的 `referred_by_changed_at = completed_at`，而且目前的推薦人等於這張單的 `fresh_referrer_user_id`，才標「已生效」。
  - 其餘各筆一律用中性文案「現有資料無法確認是否生效」，不寫成像「沒生效」的說法。不用告警類型判定，因為 S6 會改動告警種類，判定條件會跟著漂移。
- 畫面說明：「換線前後的完整順序在現有資料中無法重建，只列出可確認的部分。」

**錯誤路徑：**

- RPC 有任何錯誤都回 500，不回空清單（第 4 波 P1-5 同類）。
- `:id`、`parentId`、`ensureId` 不是 uuid 回 400；查無此人回 404；`q` 去掉頭尾空白後為空回 400。
- 回應 schema 寫進 `_shared/api-contract.ts`，handler 用 `satisfies` 對齊。

**資料庫變更：**

- **每個新增 SQL 的階段各一支 migration**（階段 1～4 最多四支；S3b 另一支），版本號遞增，並排在同波 S1 之後。
  - 不在已 push 的 migration 上追加內容：Supabase preview 分支與 develop 的 persistent branch 已套用過的檔案，改了不會重跑，新函式會靜默不存在。
- 紅燈 commit 只放測試，migration 在綠燈 commit 才寫入。
- rebase 後必跑 `check-migration-versions.py`。
- **DB 測試不在 `npm run check` 內**。階段 1～4、5b、5c 的紅綠證據要靠以下其中之一，並記進 progress.md：
  - CI 的 api-tests 軌。
  - 本機 `supabase start` 加 `deno task test`（容器裝得起來的話）。
- 內容：
  - 新函式，含授權設定。
  - 新索引 `referral_pair_history (referee_user_id)`：現況只有 PK `(referrer, referee)`，查「本人有過哪些推薦人」需要這條。
  - 不另加 payment_orders 的索引，現有 `idx_payment_orders_user` 就夠。
  - 新索引 `subscriptions (source_payment_order_id)`（階段 4 的 migration）：付款單要經這一欄取得 `subscription_id`，現在沒有索引。
- **不改任何表結構與既有函式**，正式站的 migration 純加法。

### 2.3 S3b：點數來源明細與跨表核對（W6-18）

> S3a 實作後補註（#521 獨立審查 P2-6）：`admin_referral_member_audit` 在 0004 被改名為 `admin_referral_member_audit_base`，外面再包同名函式。S3b 若要動會員查帳 RPC，基準是 0004 的包裝與 `_base`，不是 0003。

**點數來源明細：**

- 這個人在 `reward_transactions_with_balance` 的每一列，分頁、依時間新到舊。
- 每列帶分類（`source_category`）、金額、`balance_after`。
- 每列附上關聯：
  - 推薦獎勵：付款人與付款時點（從 subscription 或 claim 取）。
  - 提領與退款：`withdrawal_id` 與提領狀態。
  - ledger_reset：觸發的訂閱。

**跨表核對**（取代「餘額 ≠ 獲得 − 提領」，因為那條式子在同一張表上是恆等式）。金額與 type 已對照現行函式：

- `request_withdrawal`：每筆提領都寫一列 `type='withdrawal'`，金額 −(amount＋fee)。
- `admin_update_withdrawal_status`：退件時**追加**一列 `type='adjustment'`，帶 `withdrawal_id`，金額 +(amount＋fee)，有唯一索引；扣款列不刪。
- `process_successful_payment` 的新約清空：寫 `-greatest(清空當下的 sum, 0)`。
- `repair_orphaned_forfeitures` 的延遲補沖：寫告警快照額；快照遺失寫 0，description 帶「延遲補沖」。

下列任一條不成立，就標「點數跨表核對不符」：

1. **所有狀態**的 `withdrawals`（含 rejected），帳本恰有一列 `type='withdrawal'` 扣款，金額等於 −(amount＋fee)。扣款列沒有唯一索引，所以「恰有一列」確實可能被違反。
2. 每筆 `rejected` 的提領，帳本恰有一列 `adjustment`＋`withdrawal_id` 退款，金額 +(amount＋fee)。**反向**也要成立：非 rejected 的提領不得有這種退款列。
3. **孤兒**：`type='withdrawal'` 但 `withdrawal_id is null`（提領被刪後 FK 設成 null 留下的），或 `withdrawal_id` 指向別人的提領。FK 是 `on delete set null`，所以「id 指向不存在的提領」在結構上不會發生，不另查。
4. 每列正常路徑的 `ledger_reset`，金額 = −greatest(該列之前的 `balance_after`, 0)。
   - description 含「延遲補沖」的列不算不符，只標「資訊：延遲補沖，以告警快照為準」。
   - 「之前的餘額」只取 `created_at` **嚴格早於**這一列的列。同一個時間戳（同一個交易）的列一律當作尚未發生，避免 uuid 決定先後造成偶發誤報。階段 10 要造一個同時間戳的案例。
   - 已知競態：別筆交易先開始、但在清空的 sum 之後才提交，就可能差一筆。詳情中的說明要寫出這點，避免 admin 誤判。

**舊資料**：`20260718000101` 加 `fee` 之前建立的提領單，帳本扣款可能不含手續費。但舊單的 `fee` 已被回填成 15，資料上分辨不出來。S3b 開工前請主 session 代查正式站有沒有這類單：
- 沒有：刪掉這一條，也不寫對應測試。
- 有：改以 `withdrawals.requested_at` 早於該 migration 套用時間作為判別，標「舊資料，未核對」，並寫進階段 10。

## 3. 架構影響

### 前端

- **次分頁位置**
  - 「會員」底下加第三個次分頁「推薦樹」，放在證件審核之後，不改動既有兩格的位置。
  - 不加第 5 個頂層分頁（ui-ux §3）。
  - 新 `TabsTrigger` 要套 `lockedTabProps`，參與 `tabLocked`（寫入在途時鎖住）。
- **元件**放 `src/components/admin/referral-tree/`：
  - `AdminReferralTree`：搜尋、頂層樹、懶展開、自動展開。
  - `ReferralAuditSheet`：節點詳情。
  - `PaymentAuditList`：付款與三代獎金的卡片列表（Sheet 內一律用卡片）。
  - `referralAudit.ts`：純函式，處理展開路徑、`pinned` 合併與去重、結果與原因的文案、層級標示。
- **資料注入鏈**
  - 在 `MemberManagementProps` 加一個欄位 `referralTree: ReferralTreeLoaders`，包含 `loadNodes`、`search`、`loadMember`、`loadPayments`；S3b 再加 `loadLedger`。
  - 實作放進 `AdminDashboard.tsx` 既有的 `MEMBER_API` 整包物件，沿用現有形狀。
  - `AdminConsole` 的 `members` 型別是 `Omit<MemberManagementProps,…>`，會自動帶上新欄位，不另開頂層常數。
  - 新增的是必填欄位，`MemberManagement.test.tsx`、`AdminConsole.test.tsx`、`AdminDashboard.test.tsx` 的 fixture 要一起補上，列在階段 8。
- **跨次分頁導覽**：從 `MemberDetailSheet` 點「在推薦樹中查看」：
  - 跳轉目標由 `MemberManagement` 用 `treeFocusId` state 持有，依序執行：
    1. 關閉 Sheet，焦點交還原處（照 Radix 的行為）。
    2. `setMemberTab('referral-tree')`。
    3. `AdminReferralTree` 收到 `focusId` 後，先 `GET members/:id` 取得 `ancestorIds`，再走自動展開（與點搜尋命中同一條路）。
  - 寫入在途、分頁被鎖時，連結停用，並 `aria-describedby` 指向鎖定說明。
  - 「推薦樹」**不寫入** `writeView({memberTab})`。理由：推薦樹每次都要重讀，回到後台時不該直接落在一個重頁。
    - 落點：`MemberManagement.tsx` 的 `onValueChange` 現在無條件寫入，改成 `next !== 'referral-tree'` 才寫。
    - 從推薦樹切回其他次分頁時照常寫入。
    - 階段 8 斷言：切到推薦樹後，`readView().memberTab` 仍是原值。
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
  - 這一步在階段 5 最先做，先於 handler。
  - 新增 `node-status.unit.test.ts`，做 characterization：停權優先、非 active、≤30 天 expiring、剛好 30 天、end_date 為 null。紅燈來自檔案不存在。
  - 既有呼叫點的行為不變，由既有測試把關，例如 network-endpoints、members/verify。
- **四態一律由 Edge 的 TS 推導**：RPC 回原始欄位（`account_status`、`end_date`、`suspended_at`），Edge 用 `deriveNodeStatus` 算四態，所以 DB 測試不斷言四態。
- **路由掛載位置**：新路由掛在 index.ts 的 admin 區段，必須在 `app.use('/admin/*')` 守門之後；Hono 的 middleware 只套用在註冊於它之後的路由。
- 與 S2 改動的 index.ts validate 段不同區。

### 守門（W6-19：自動列舉路由）

- `admin-gate.test.ts` 新增一條覆蓋斷言：
  - 從 `app.routes` 列舉路由。app 是 `basePath('/api')`，所以前綴過濾用 `'/api/admin/'`，含結尾斜線，才不會誤收 `/api/admin-setup/*`。
  - 排除 `method==='ALL'` 的 middleware 項。
  - 把所有 `:param` 正規化成同一個佔位（例如 `:id` 與 `:userId` 都換成 `:p`），再用「method＋正規化路徑」做子集比較：列舉結果必須是手寫 `ADMIN_ROUTES` 的子集，漏列一條就紅燈。
- 手寫清單保留 method 與帶入參數，所有 `:param` 一律代入合法的 dummy uuid。只打匿名與一般會員，不會真的執行寫入。
- 清單的 method 型別補上 `DELETE`。
- 補上清單漏掉的 4 條寫入端點：`POST /admin/system-alerts/:id/resolve`、`POST /admin/withdrawals/:id/status`、`POST /admin/members/:id/suspend`、`DELETE /admin/announcements/:id`。另加本次的新端點。
- 每支新 RPC 都測「authenticated／anon 不得 EXECUTE」。

### 個資

- RPC 本身不 select `national_id`、`bank_code`、`bank_account`、`phone`、`birth_date`。測試斷言回應的 key 集合不含這些欄位。
- `ReferralAuditSheet` 會走 portal，所以 `<SheetContent className={privateClass(…)}` 要寫在**同一行**，並列入 `SENSITIVE_PORTALS`。`analyticsReviewHardening.test.ts` 要求 anchor 與 `privateClass(` 在同一行。
- `ReferralAuditSheet.tsx` 同一檔內只能有一個 `<SheetContent`，而且要確認 `biome check` 不會把那一行拆開。
- `MemberDetailSheet` **不在本次**補進 `SENSITIVE_PORTALS`：它的 `<SheetContent` 跨多行，又夾著註解，改寫會和 biome 的格式化衝突，風險不值得。它已經在 `/admin` 的 `PrivateRegion` 底下；portal 漏網的問題列為第 7 波候選。

### 快取與規格書

- 推薦樹與詳情每次都重讀，不進 `adminCache`。
- 規格書 §13「不從快取顯示」的清單要補上這兩項。這不是 W6 的需求，屬於規格書同步。

### 其他

- 本功能沒有多步驟流程，multi-step-flow 四契約不適用。
- **選配範圍**（不是業主直接列出的需求，是執行 session 的工程或導覽決定，主 session 可以推翻）：
  - 自動列舉路由（W6-19 已定）。
  - `referral_pair_history` 索引。
  - 規格書 §13 的快取清單。
  - **推薦人鏈每一位都可點**，在 Sheet 內跳到該人：服務情境②「往上幾代、往下推薦了誰」，沒有它就得關掉 Sheet 再重新搜尋。
  - **`MemberDetailSheet` 的「在推薦樹中查看」連結**：服務 W6-7「先找到一個人」。會員列表是 admin 已經習慣的找人入口，加這條連結就不用再搜一次。
  - 「推薦人資料兩處不一致」的資訊提示。
  - 換線紀錄「已生效／現有資料無法確認」的判定：從 W6-16 衍生，W6-16 本身只要求列出事件。
  - 「不做」清單補一句：推薦樹沒有上面兩條以外的入口。

## 4. UI/UX

### 畫面草圖（手機 375px，〔〕代表 lucide 圖示，實作不用 emoji）

```
[會員列表] [證件審核] [推薦樹]          ← 次分頁，推薦樹在第三格
推薦樹（區塊標題，tabIndex=-1）
┌〔Search〕搜尋姓名或推薦碼 ─────〔X 清除〕┐   ← role="search"
已顯示 20 / 24 位（頂層）
[〔ChevronRight〕展開王大明]  王大明 · 8048876                    ← 名稱鈕：開詳情
    第 1 層 · 訂閱中 · 2027-03-01 到期 · 直接推薦 12 位 · [〔AlertTriangle〕獎金缺漏]
  [〔ChevronDown〕收合陳小華]  陳小華 · 8048890
      第 2 層 · 即將到期 剩 12 天 · 直接推薦 3 位
  [載入更多（已顯示 50 / 120 位）]
```

### 節點列：巢狀清單加 disclosure 鈕（不用 `role="tree"`）

- **結構**：選 disclosure 方案，因為 TalkBack 對 tree 角色支援弱，而且「載入更多」「重試」「pinned」都不是 tree 的合法子項。
  - 每層是 `<ul>`，每個節點是 `<li>`。
  - 列內有兩個並列的 `button`：
    - **展開鈕**：只在 `directCount>0` 時出現，帶 `aria-expanded`、`aria-controls`，名稱「展開／收合〇〇」。
    - **名稱鈕**：開詳情，名稱「查看〇〇的推薦與查帳資訊」。
  - 子層 `<ul>` 的尾端放「載入更多」「重試」。
- **操作**：
  - 手機上點姓名開詳情，點左側箭頭展開。
  - 鍵盤用原生 Tab 與 Enter／Space，不做方向鍵的 roving。
- **觸控與換行**：
  - 兩顆鈕都是 `pointer-coarse:min-h-11 min-w-11`。
  - 文字一律 `min-w-0 wrap-anywhere`，只換行不截斷（ui-ux §10）。
- **第 N 層**：每個節點的第二行開頭都顯示（W6-19）。
  - 縮排每層 12px，第 4 層以後不再增加。
- **姓名為空**：顯示「未填姓名」加推薦碼，不退回顯示 Email，個資最小化。
- **節點異常**：
  - 用 `warning-subtle` Badge 加 lucide 圖示，每種一顆。
  - 超過 2 種時收成一顆「N 項異常」。
  - `anomalyScanTruncated` 時再加一行小字「只檢查最近 50 筆」。
- **配色**：
  - 用灰階，不用 `--tree-gen-*` 世代色（§12.5(c)）。
  - 不畫頭像，不畫連接線。
  - 狀態徽章沿用四態。

### 無法接上推薦樹的會員（W6-21）

- 放在頂層列表最後、「載入更多」之後。
- 是一個 disclosure 群組：「無法接上推薦樹的會員（N）」，預設收合，N=0 時不渲染。
- 展開後的節點列與一般節點相同，必帶「推薦關係成環」徽章；載入、失敗、空態、重試焦點都照子層的規則。
- 搜尋命中這些人時（`unplaceableReason=cycle`）：自動展開這個群組，並以 `ensureId` 定位到該人，不再降級成「只開詳情」。只有 `truncated` 仍然只開詳情。

### 搜尋

- 有輸入時，結果清單**就地取代樹**；清除（`X` 或清空輸入框）後回到樹，樹的展開狀態保留不變。
- 結果列顯示：姓名（或「未填姓名」）、推薦碼、第 N 層、狀態徽章。同名的人靠這些分辨。
  - 定位不到樹上的人，層級寫「層級無法判定（推薦關係成環／往上超過 50 層）」，與 `unplaceableReason` 一致。
- 點結果會走自動展開，見下方。`ancestorIds` 為 `null` 時只開詳情，並顯示原因（§2.2）。
- 輸入後 debounce 300ms，只採用與目前 q 相同的回應（第 4 波 ref P2-12），清單顯示「已顯示 X / Y 筆」加「載入更多」。

### 詳情 Sheet

沿用 `MemberDetailSheet` 的結構：手機全寬，桌面 `sm:max-w-lg`（512px）。由上到下：

1. **頁首**：姓名、推薦碼、狀態徽章、到期日，回答「這個人現在是什麼狀態」。`SheetTitle` 帶 `tabIndex=-1`。
2. **需要注意**（`StatusCallout variant="warning"`，沒有異常就整塊不渲染，§13 第 3 條）：
   - 逐條列出：獎金缺漏 N 筆、收獎人不符 N 筆、推薦關係成環。
   - 每條附一個連結。點了以後，目標區塊（`tabIndex=-1`）捲到可見處並取得焦點。
   - 有異常的付款卡自己也掛 warning 徽章。
3. **帳號狀態說明**（中性提示，不用 warning，只在停權、到期、未加入推薦計畫時出現）：「獎金照常入帳，但目前不可提領（原因）」（W6-15）。
   - 原因文字依規格書 §10.1 的提領守衛順序推導：停權 `suspended` → 未加入 `not_joined` → 會籍 `subscription_invalid`。
   - 只取第一個命中的原因，不自行另編說法。
4. **推薦人鏈**：
   - 依序列出推薦人、往上第 2 位、往上第 3 位……，每位都可點。
   - `truncated` 時寫「往上超過 50 位，未全部列出」。
   - 兩處不一致時，下方加一行資訊提示（§2.2）。
5. **獎金與點數**：主數字是「可提領」；第 1／2／3 代各獲得、累計已發降為一行小字。
6. **任務**、7. **提領**、8. **換線紀錄**（見 §2.2）。
9. **付款與三代獎金**：
   - Sheet 內**一律用卡片**，不用表格。Sheet 最寬 512px，用視窗斷點切換的表格會塞爆。
   - 一筆付款一張卡：
     - 卡頭：付款時點、類型（付款／任務續約）。
     - 每一代兩行：
       - 第一行：「第 N 代 · 結果徽章」。
       - 第二行：「應給 A」。
       - 收獎人不符或無法判定、而且有實發時，加第三行「實發 B · 金額」。
       - 已發時，第二行寫「A · 金額」。
       - 不適用與成環停發只有第一行。
   - 載入更多，顯示「已顯示 X / Y 筆」。
   - 區塊頂部只出現一次自癒提示（§2.1）。

### Sheet 內跳到另一個人

- 跳轉方式是替換內容，不疊一層新的 Sheet。
- 頂部常駐「返回〇〇」。
- 堆疊存在元件 state 裡，**每一位都保留已載入的資料、付款區的頁數與捲動位置**，返回時不重讀。

| 操作 | 堆疊不空 | 堆疊為空 |
|---|---|---|
| 「返回〇〇」鈕 | 回上一位 | 不顯示 |
| Android 返回鍵（`useOverlayBackClose`，只掛在這張 Sheet） | 回上一位 | 關閉 Sheet |
| Esc、右上 X | 關閉 Sheet | 關閉 Sheet |

- 換人後捲回頂部，焦點落在 `SheetTitle`，常駐 live region 播報「已切換到〇〇」。
- 關閉 Sheet 後，焦點回到開啟它的那一列。不同步樹上的選取。
- `MemberDetailSheet` 不加返回鍵攔截，兩種 Sheet 的返回鍵行為因此不同。這個差異列為第 7 波候選。
  - 「在推薦樹中查看」是從 `MemberDetailSheet` 出發的，不經過這個 hook，所以 cleanup 的 `history.back()` 不會和切換次分頁互相干擾。

### 結果徽章（`badge.tsx` 現有的變體）

| 結果 | 變體 | 圖示 |
|---|---|---|
| 已發 | `outline`（中性，不滿版綠） | `Check` |
| 不適用 | `outline` | `Minus` |
| 無法判定 | `secondary` | `HelpCircle` |
| 缺漏 | `warning-subtle` | `AlertTriangle` |
| 收獎人不符 | `warning-subtle` | `ArrowLeftRight` |
| 成環停發 | `warning-subtle` | `RefreshCwOff`（或施工時選同義圖示） |

- 都是文字加圖示，不以色相作為唯一線索（§12.7）；不用紅色（§12.5）。

### 文案（W6-19、W5-53、§12.13）

- 樹上用「第 N 層」，從頂層算；付款查帳用收獎「第 1／2／3 代」；推薦人鏈用「推薦人／往上第 N 位」。
- 不出現「上線／下線／整條線」，`terminologyGuard.test.ts` 會掃描。

### 三態與重試焦點（逐塊列出）

| 區塊 | 載入中 | 讀取失敗 | 空態 | 重試焦點 |
|---|---|---|---|---|
| 頂層樹 | `AdminListSkeleton` | 整頁 `LoadErrorCallout` | 「目前沒有符合條件的會員」 | 用 `useRetryFocus`：成功時回到「推薦樹」區塊標題，失敗時回到錯誤框 |
| 子層 | 該層骨架 | 該層顯示中性錯誤字＋「重試」 | `directCount>0` 但查回 0 筆時，寫一行「目前沒有可顯示的推薦對象」 | 成功時到第一個子節點的名稱鈕，失敗時到該層錯誤字（`tabIndex=-1`） |
| 搜尋 | 結果區骨架 | 「搜尋失敗，請稍後再試」＋重試 | 「找不到符合的會員」 | 成功時到結果區標題，失敗時到錯誤字 |
| 詳情 Sheet | 同形骨架 | 黃框＋重試。404 時寫「找不到此會員（可能已刪除）」 | — | 都落在 `SheetTitle` |
| 付款與三代獎金 | 卡片骨架 | 只在這一區顯示中性錯誤字＋重試，上方各區照常（§13 第 4 條） | 「這位會員沒有付款紀錄」 | 成功與失敗都落在該區標題（`tabIndex=-1`） |

- **載入更多失敗**（樹子層、搜尋、付款區都一樣）：已載入的列保留，尾端顯示錯誤字與「重試」，重試只重發那一頁。

### 自動展開（點搜尋命中，或從會員詳情跳來）

- **展開順序**：依 `ancestorIds` 從頂層往下逐層請求 `nodes?parentId=…&ensureId=下一層的 id`；頂層也帶 `ensureId`。
- **展開鏈帶 token**：新操作（再點一個結果、收合正在展開的祖先、切換次分頁、關閉）會作廢舊鏈，舊鏈的回應直接丟棄。
- **`pinned` 的規則**：
  - pinned 節點接在該層已載入列的尾端，標「搜尋目標」，`key=id` 保持穩定。
  - 不計入「已顯示 X」，也不影響 offset。
  - 使用者離開該層（收合或另起一條展開鏈）之前，pinned 一直留著。
  - 之後若正常分頁載到同一個 id，那一列**不重複渲染**，但仍計入 X，因為它已經載入，而且畫面上看得到（以 pinned 的身分）。
  - 這樣不會發生卸載後重掛，焦點不會掉，也不會跳號。
- **展開中**：列表上方顯示「正在展開到〇〇…」，`aria-busy`；用常駐的單一 `aria-live` 節點播報，只換文字。
- **中途失敗**：停在失敗的那一層，該層顯示錯誤加「重試展開」，從那一層接續；已展開的上層保留。
- **完成**：目標列捲到可見處（`scroll-mt-20`），焦點落在它的名稱鈕，並播報「已展開到〇〇」。

### e2e 版面檢查

- 把推薦樹與詳情 Sheet 加進 `e2e/test_overflow_sweep.py` 的 `ROUTES`，用 `after_load` 切到推薦樹次分頁，並打開一個有付款卡的節點。
- 寬度掃 375、1024、1280px。
- 三格次分頁在 320px 與 375px 的寬度要另外驗證。

## 5. 階段切分（每階段＝一個 TDD 紅綠循環）

**S3a（必上）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `referral_award_chain`，及其與 `pay_referral_generations` 的等價 | `supabase/functions/api/referral-award-chain.test.ts`（DB） | 以下拓撲下，實發收獎者逐代等於 chain：完整三代、缺第 2 代、缺第 3 代、第 1／2／3 代分別成環、profiles 與 edges 不一致 |
| 2 | 樹節點與搜尋 RPC | `admin-referral-tree-db.test.ts`（DB） | 涵蓋分頁、total、穩定排序、頂層與搜尋共用的收人範圍、ancestorIds 與無法定位的原因、頂層與子層的 ensureId／pinned、個資排除、GRANT。沒訂閱也沒推薦對象的人搜不到；在環上的人 `ancestorIds=null` 且 reason 為 cycle。`group=unplaceable` 收進在環上與往上接進環的人，total 精確，`unplaceableCount` 與它一致，超過 50 層的人不收。一位推薦人有 1,005 位直接推薦時，total 精確，第 21 頁有資料且不重複；全形碼命中；`%` 被跳脫；回應的 key 不含敏感欄位；anon 與 authenticated 被拒 |
| 3 | 會員查帳 RPC | 同上 | 涵蓋全部欄位（原始欄位，不斷言四態）、往上鏈與深度上限、換線紀錄、成環／rho 形／自己推薦自己、兩處不一致的資訊提示（兩種 null 情境各一案）。具體斷言：回填形態的 pair-history（`created_at` 都相同）列為無序集合；新約單 keep 不列入；只有最新一筆可能標「已生效」；兩人成環與 rho 形都標異常且不會無窮迴圈；超過 50 層回 `truncated` |
| 4 | 付款查帳 RPC 與節點的 `anomalyKinds` | 同上 | 六種結果都要造出來，另驗判定順序與「找不到對應訂閱」。單一會員有 60 筆付款時，節點回 `anomalyScanTruncated`。具體斷言：刪掉第 2 代那一列 → 缺漏；改 `user_id` → 收獎人不符；付款後祖先換線 → 無法判定，且「實拿」照列；任務續約用 `claimed_at`；ledger_reset 不誤判；自癒後缺漏消失 |
| 5 | Edge 端點、契約、守門 | 依序做 5a～5d | 見 5a～5d |
| 5a | `deriveNodeStatus` 搬到 `node-status.ts`（最先做） | `node-status.unit.test.ts`（characterization）＋既有 network-endpoints、verify 測試 | 紅燈：檔案不存在。綠燈後既有測試全綠，index.ts 改成 import 這一份 |
| 5b | 參數與錯誤路徑（假 deps，不連 DB） | `admin-referral-tree.unit.test.ts` | 400（非 uuid、空 q）、404、RPC 錯誤回 500 而不是空清單；四態由 Edge 推導；反向匯入守衛 |
| 5c | 守門與回應形狀（DB） | `admin-referral-tree.test.ts`、`api-contract.test.ts` | 401、403；回應通過 `assertShape` |
| 5d | admin 路由清單的覆蓋斷言 | `admin-gate.test.ts` | 現有清單漏的 4 條會先讓它紅燈；補齊並加上新端點後綠燈 |
| 6 | 前端純函式 | `src/components/admin/referral-tree/referralAudit.test.ts`（node） | 涵蓋展開路徑、`pinned` 合併、去重與計數、結果與原因的文案、層級標示。所有情境綠燈，文案不含禁用詞 |
| 7 | `AdminReferralTree` | `AdminReferralTree.test.tsx`（jsdom） | 涵蓋搜尋取代樹與清除、頂層、懶展開、載入更多與載入失敗、自動展開、展開鏈 token、中途失敗後續展、無法定位時降級、「無法接上推薦樹的會員」群組（N=0 不渲染、命中 cycle 時自動展開群組並定位、往下展開遇到祖先就停）、三態與重試焦點、disclosure 語意。具體斷言：點命中結果會逐層展開並聚焦到目標的名稱鈕；子層失敗只影響那一層；pinned 不計入 X；同一個 id 出現在正常頁時不重複，焦點也不掉 |
| 8 | `ReferralAuditSheet`、`PaymentAuditList`、次分頁、跨分頁導覽、私密設定 | `ReferralAuditSheet.test.tsx`、`MemberManagement.test.tsx`、`AdminDashboard.test.tsx`、`analyticsReviewHardening.test.ts` | 涵蓋需要注意區與焦點目標、各區三態、付款卡的三種行數版型、Sheet 內跳轉與返回（返回鍵與 Esc 的對照表）、從會員詳情跳到推薦樹、`lockedTabProps`、`writeView` 不記推薦樹、portal 帶私密 class、fixture 補上 `referralTree` |
| 9 | 規格書與 e2e | `e2e/features/admin_referral_tree.feature`（mock）、`test_overflow_sweep.py`、`test_admin_mobile_layout.py` | 規格書改 §13（並在 §7.2 加指向 §13 的一句），e2e 掃描 375、1024、1280。CI 綠；`check-spec-drift.py` 綠 |

**S3b（看進度，S3a 合併後疊在 develop 上另開 PR）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 10 | 點數來源明細與跨表核對 RPC（§2.3） | `admin-referral-tree-db.test.ts` | 四條核對（含反向與孤兒的新定義）各造一個違反的案例，都要標成異常。下列正常案例不標：延遲補沖、餘額為負時的 reset、舊資料標「未核對」。明細分頁與總數正確 |
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

**W6-21（主 session 2026-11-08 親審通過 v3）**：

- 推薦人鏈可點、「在推薦樹中查看」：保留。
- 「推薦人資料兩處不一致」資訊提示：保留。
- 成環的人要讓業主看得到：在頂層樹最後加「無法接上推薦樹的會員（N）」群組（§2.2、§4）。
- 下列自決項全部同意；`MemberDetailSheet` 補 `SENSITIVE_PORTALS` 列第 7 波候選。

**執行 session 自己決定的事**（已由 W6-21 同意；選配範圍另見 §3）：

- Sheet 內跳到另一個人用「替換內容＋返回」，不疊層；只有這張 Sheet 攔 Android 返回鍵。
- 節點列用巢狀清單加 disclosure 鈕，不用 `role="tree"`。
- `writeView` 不記住推薦樹這個次分頁。
- 推薦樹這個次分頁放在第三格。
- `MemberDetailSheet` 本次不補 `SENSITIVE_PORTALS`（第 7 波候選）。
- 姓名為空時顯示「未填姓名」，不退回顯示 Email。
- 延遲補沖的 ledger_reset 列只標「資訊」，不算不符。

**仍待施工前確認的事實**（主 session 代跑唯讀 SQL）：

- 階段 4 前：
  - 正式站曾付款、`referred_by_changed_at` 為 null 的會員筆數。
  - 單一會員的最大付款筆數。
  - 成環與自己推薦自己的候選數。
  - 可判定但缺漏的筆數。
- S3b 前：正式站有沒有加 `fee` 之前建立的提領單。

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
  - 異常掃描每個節點以 50 筆為上限，不依賴 `statement_timeout`。
  - 查詢錯誤回 500，畫面不呈現成「空的」。
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
| 7 | 樹的來源不唯一 | 單一來源為 edges，篩選只套頂層，固定排序；「兩處不一致」在第 3 版降為資訊提示（§2.2） |
| 8 | 匯出 `deriveNodeStatus` 會循環匯入 | 抽出到 `node-status.ts`，加反向匯入守衛（§3、階段 5d） |
| 9 | 前端資料注入鏈漏寫 | 用 `ReferralTreeLoaders` 物件整包傳下去，由 `treeFocusId` 持有跳轉目標（§3） |
| 10 | 「500 不回空」在 DB 測試裡紅不了 | 拆出 unit 測試，用假 deps（階段 5a） |
| 11 | 異常排在最後 | 改成「需要注意」置頂，頁首放主狀態（§4） |
| 12 | 付款查帳沒有手機版面 | 第 3 版改成 Sheet 內一律用卡片，`wrap-anywhere`，並加進 overflow sweep（§4） |
| 13 | Sheet 內跳轉的導覽沒定義 | 替換內容，加返回堆疊，定義 Android 返回、焦點與捲動（§4） |
| 14 | 跨次分頁導覽沒規劃 | 跳轉三步驟、鎖定狀態、`writeView`（§3），測試在階段 8 |
| 15 | 三態缺漏 | 五個區塊各自列出三態表（§4） |
| 16 | 自動展開與 pinned 的一致性 | 定義計數、去重、中途失敗後續展、播報、焦點（§4） |

第 1 版的 P2 已一併處理：`user_id` 比對、兩種成環的口徑、跳脫與逾時、索引精簡加 `search_path`、等價測試的跨 PR 依賴、覆蓋斷言、同一行 anchor、`writeView`、單一 migration、情境 5 為部分滿足、選配範圍、觸控語意與鍵盤、灰階、文字徽章、次分頁位置。

### 第 2 輪（第 2 版的 P0 1 條、P1 15 條）

| # | 發現 | 處置 |
|---|---|---|
| P0 | 「在推薦樹中查看」與推薦人鏈可點，追溯不到任何裁決 | 列入 §3 選配與 §6 自決，附上服務的情境，「不做」補「沒有其他入口」 |
| 需求 1 | 「兩處不一致」不在業主的異常清單 | 降為詳情內的資訊提示，不上節點標示（§2.2） |
| 需求 2 | 搜尋沒有套用收人範圍 | 搜尋與樹收同一群人，加斷言（§2.2、階段 2） |
| 系統 1 | `statement_timeout` 擋不住 | 撤掉這個依賴，改成每節點掃描 50 筆的有界設計（§2.2） |
| 系統 2 | ledger_reset 的公式會誤報 | 改成 `-greatest(prev,0)`；延遲補沖只標資訊；寫出競態說明（§2.3） |
| 系統 3 | 核對 1、3 的範圍錯 | 1 涵蓋所有狀態；3 改定義；2 補反向（§2.3） |
| 系統 4 | 三種命中定位不到樹上 | 頂層也能 `ensureId`；`ancestorIds=null` 附原因，前端降級（§2.2、§4） |
| 架構 1 | node-status 沒有紅燈且順序錯 | 移到 5a 最先做，加 characterization 測試；四態由 Edge 推導 |
| 架構 2 | 在已 push 的 migration 上追加不會重跑 | 每階段一支 migration，S3b 另一支；寫明 DB 測試不在 check 內 |
| 架構 3 | 覆蓋斷言細節 | 前綴含斜線、排除 ALL、參數正規化、補 DELETE、掛在守門之後（§3） |
| UI 1 | tree 語意自相矛盾 | 改用巢狀清單加 disclosure（§4） |
| UI 2 | pinned 去重會掉焦點 | pinned 留到離開該層，正常列不重複渲染（§4） |
| UI 3 | 返回鍵的行為沒定義 | 補對照表，資料保留，只攔這張 Sheet（§4） |
| UI 4 | 付款卡表達不出「收獎人不符」 | 每代兩到三行的版型（§4） |
| UI 5 | 用視窗斷點切表格會塞爆 Sheet | Sheet 內一律用卡片（§4） |
| UI 6 | 重試焦點沒定義 | 三態表加「重試焦點」欄（§4） |

第 2 輪的 P2 已一併處理：
- 第 N 層每個節點都顯示。
- 換線判定註明為衍生。
- 找不到對應訂閱、判定順序、`IS DISTINCT FROM`、只顯示實拿金額。
- 最大付款筆數與舊提領單交由代查。
- 前端 loader 放進 `MEMBER_API`，fixture 補上。
- `writeView` 寫明落點。
- `MemberDetailSheet` 的 portal 改列第 7 波。
- DB 測試不在 check 內。
- 徽章對照表。
- 草圖改用 lucide。
- 需要注意的連結會移動焦點。
- 搜尋版面。
- 載入更多失敗、子層查回 0 筆。
- 姓名為空。
- 展開鏈 token。

### 第 3 輪（第 3 版；只重跑需求與系統兩個視角）：P0 0、P1 0、P2 7

已併入第 3 版的修訂：
- `subscriptions(source_payment_order_id)` 索引。
- 每節點只算一次 chain。
- 核對 4 的同時間戳規則。
- 舊提領單改為依代查結果二選一。
- 無法定位時，搜尋結果的層級文案。
- 提領原因依 §10.1 守衛推導。
- 換線改用中性文案。

成環的人不在頂層的提示，交主 session 決定。

