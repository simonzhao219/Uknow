# 後台推薦樹＋查帳資訊 規劃書（S3a／S3b）

<!-- plans-keep: S3a、S3b 共用的施工鷹架（第 6 波 W6-6：一份規劃書兩支 PR）。退場條件：S3b 的 PR 合併時由 /tdd-implement 收尾刪除；S3b 順延第 7 波時，由第 7 波主 session 決定沿用或刪除 -->

上游：第 6 波 `plan.md` §0 裁決 W5-70、W6-5（欄位與查帳情境全選）、W6-6（切 S3a／S3b）、
W6-7（預設入口＝搜尋框＋頂層樹）。以下「業主需求」皆出自這四條，不另問同樣的題。

## 0. 一句話

讓管理員在後台用「先找到一個人」的方式看整條推薦線（往上的推薦人、往下推薦了誰），並逐筆核對三代獎金是否發對、點數從哪來、會員為什麼沒拿到獎金。會員來問、提領前核對時，現在只能靠 Supabase Studio 手查 SQL。

## 1. 使用者需求

- 對照規格書：§7.2 組織圖（單親樹、四態、不得成環）、§8.1～8.4 三代發獎與冪等鍵、
  §8.5 餘額、§9.1～9.2 推薦王與 pair-history、§10 提領狀態機、§13 管理後台（守門、遮罩、
  不得靜默截斷、後台分頁區只有四格）。
- **驗收情境**（W6-5 四個查帳情境＋W6-7 入口）：
  1. **入口**：admin 進「會員 › 推薦樹」，看到搜尋框和頂層樹（沒有推薦人的會員），每個節點都能逐層展開，「已顯示 X / Y 位」，可以載入更多。
  2. **②整條線**：用姓名或推薦碼（全形或半形都可以）搜尋，點命中結果後，樹會自動展開他往上的整條線，並捲動、聚焦到他本人。打開他的節點詳情，可以看到往上幾代的推薦人，以及他直接推薦的會員。
  3. **①某筆付款獎金有沒有發對**：在節點詳情的「付款與三代獎金」，每筆付款列（含任務免費續約）列出第 1／2／3 代該拿的人、實際拿到的人與金額，結果是 ✓ 已發、✗ 缺漏、— 不適用（沒有這一代）、⛔ 成環停發，或「無法以現況判定」。
  4. **④為什麼沒獎金**：詳情列出這個人實際收到的每一筆推薦獎勵。沒收到的原因要能從畫面讀出來，包括沒有這一代、成環停發、付款後才換線、新約清空帳本。帳號狀態（停權、到期、未加入推薦計畫）也要顯示，並標明它影響的是「提領」，不影響「入帳」（見 §6 Q1）。
  5. **③提領前核對**：S3a 先給「各代獲得、目前餘額、累計已發、提領審核中／已匯款」。逐筆的點數來源明細和對帳是 S3b。
  6. **自動標異常**：S3a 標「付款了但三代獎金缺漏」「成環／自己推薦自己」。S3b 標「點數對不上帳」。
- **節點欄位**（W6-5，全要）：姓名、推薦碼、層級（口徑見 Q4）、會籍四態（含停權）、到期日、推薦計畫與加入時間（`referral_program_joined_at`）；各代獲得、可提領餘額、累計已發；推薦王本月進度與 credit（未領／已領）；提領的審核中金額與已匯款金額；換線紀錄。
- **不做**：一次展開整棵、CSV 匯出（W6-5 已推翻）；在推薦樹上直接停權、補發或改推薦人（寫入動作只放在既有的會員詳情，§13）；顯示身分證或銀行帳號（個資最小化）；改任何發獎、換線、提領的規則。

## 2. 系統設計

### 2.1 口徑：「該拿」與發獎同一來源（必答）

現況（`20261113000001_referral_cycle_guard.sql` 的 `pay_referral_generations`，行號現算）：

- 第 1 代＝付款人的 `profiles.referred_by_user_id`。第 2、3 代沿 `referral_edges` 往上找，**每次呼叫時現讀**，不存快照。
- 停發條件只有三種：該代沒有人；收獎者等於付款人（成環，寫 `referral_cycle_detected` 告警，該代和之後各代都不發）；冪等鍵已存在。
- **不看收獎者是否停權、到期、加入推薦計畫。**

設計：

- **新函式 `referral_award_chain(p_referee uuid)`**（stable、security definer、只授權 service_role）。它回傳 `(generation, recipient_id, stop_reason)`，用與發獎同樣的讀法和同樣的停止條件逐代走。
- **等價測試釘口徑**：任意拓撲下（缺代、成環、profiles 與 edges 不一致），`pay_referral_generations` 實際插入的收獎者必須逐代等於 chain 函式的結果。這支測試就是防漂移的機械閘門。
- **S3a 不改 `pay_referral_generations` 本體**。S1 同波在改它的告警等級，S6 也會動同檔函式，見 Q6。
- **歷史付款的可判定性**：鏈是現讀的，付款之後若有人換線，用現況推不回付款當時的鏈。所以判定沿用 `repair_orphaned_payments` 既有的閘門（`referred_by_changed_at` 為 null 或 ≤ 付款時點），並推廣到鏈上每一位：付款人、第 1 代、第 2 代的 `referred_by_changed_at` 都 ≤ 付款時點，才算「可判定」。否則顯示「付款後推薦關係有變動，無法以現況判定」，不算缺漏。
  - 這和自癒的範圍一致：自癒補得到的，畫面才叫缺漏。
- **缺漏**＝可判定、chain 說該代有收獎者，但 `reward_transactions` 找不到 `(referee, generation, subscription_id | source_claim_id)` 這一列。
  - 冪等鍵與 §8.3 相同。只查 `type='referral_reward'`。
  - 新約清空帳本（`ledger_reset`）不會刪掉獎勵列，所以清空不會被誤判成缺漏。

### 2.2 資料流與 API

採 RPC 組裝、Edge 只做守門與轉形（現況慣例：`admin_list_members`、`admin_member_detail`）。

**每支 RPC 都回單一 `jsonb`**，不回 `setof`。理由：單一值不受 PostgREST `max_rows=1000` 截斷（第 4 波 ref P1-3）。分頁、`total` 都在 SQL 內算，`limit` 預設 50、上限 200，與 `parsePageParams` 相同。

| 端點（皆在 `/admin/*` middleware 下，handler 內再查 admin） | RPC | 回應重點 |
|---|---|---|
| `GET /admin/referral-tree/nodes?parentId=&limit=&offset=` | `admin_referral_tree_nodes(p_parent, p_limit, p_offset)` | 不帶 parentId＝頂層。回 `{total, nodes[]}`，節點是摘要欄位，含 `directCount` 與異常旗標 |
| `GET /admin/referral-tree/search?q=&limit=&offset=` | `admin_referral_tree_search(p_name, p_code, …)` | 推薦碼在 TS 端用 `normalizeReferralCode` 後精確比對（含已失效的碼）。姓名用 `ilike` 部分比對（admin 看真名，與 §7.3 會員端遮罩無關）。命中帶 `ancestorIds`（頂層 → 父），供自動展開 |
| `GET /admin/referral-tree/members/:id` | `admin_referral_member_audit(p_user)` | 節點全部欄位、往上的推薦人鏈、換線紀錄、異常清單 |
| `GET /admin/referral-tree/members/:id/payments?limit=&offset=` | `admin_referral_payment_audit(p_user, …)` | 他作為付款人的每筆付款與任務續約，各帶三代「該拿／實拿／結果」 |
| `GET /admin/referral-tree/anomalies?kind=&limit=&offset=`（依 Q3） | `admin_referral_anomalies(…)` | 異常的人清單，分頁加 `total` |
| S3b：`GET /admin/referral-tree/members/:id/ledger` | `admin_referral_ledger_audit` | 點數來源明細、對帳結果 |

- **往上的鏈**用遞迴 CTE 沿 `referral_edges` 往上走，以 path 陣列防環，深度上限 `ADMIN_TREE_MAX_UPLINE_DEPTH`（具名常數，暫定 50）。到上限就停，回 `truncated: true`，畫面明示，不靜默截斷。
- **成環偵測**：`referral_edges` 是單親（PK＝referee）且有 `check(referee<>referrer)`，所以環的長度至少 2。偵測方式是往上走時回到自己；自己推薦自己就是 `profiles.referred_by_user_id = id`。
  - 全站掃描用同一支遞迴（上限同上）。正式站現有 24 位會員；放大到幾千人時，每人最多走 50 步，可以接受。
- **換線紀錄**（依 Q2）：首位推薦人取自最早的 `referral_pair_history`，之後每一筆已完成的 `payment_orders.renewal_mode='fresh'` 帶 `fresh_referrer_user_id` 的單，就是一次「何時換到誰」。
  - 換線失敗（step 0d 寫了 `fresh_referrer_*` 或 `fresh_rewire_failed` 告警、維持原推薦人）的單標成「未生效」，判定方式是比對付款後的 `referred_by_user_id`，或查該單的告警。
- **錯誤路徑**：任何 RPC 錯誤都回 500，不回空清單（第 4 波 P1-5 同類）。`:id` 不是 uuid 回 400，查無此人回 404。所有回應 schema 進 `_shared/api-contract.ts`，handler 用 `satisfies` 對齊。
- **資料庫變更**：新 migration 只做三件事：
  - 加函式，每支都 `revoke execute from anon, authenticated, public`，`grant` 給 service_role。
  - 加索引 `referral_pair_history (referee_user_id, created_at)`，現在只有 PK。
  - 加索引 `payment_orders (user_id, completed_at) where status='completed'`，若現有 `idx_payment_orders_user` 不夠就加，施工時看 explain 決定。
  - **不改任何表結構和既有函式**。正式站的 migration 是純加法。

## 3. 架構影響

- **前端**：
  - 在「會員」分頁加次分頁「推薦樹」，排在會員列表與證件審核之間，沿用 `MemberManagement` 的次分頁殼。不加第 5 個頂層分頁（ui-ux §3，`grid-cols-4` 是釘死的）。
  - 新元件放 `src/components/admin/referral-tree/`：
    - `AdminReferralTree`（搜尋、頂層樹、懶展開）
    - `ReferralAuditSheet`（節點詳情）
    - `referralAudit.ts`（純函式：展開路徑合併、結果與原因的文案對照）
  - `MemberDetailSheet` 的「推薦關係」區加一個「在推薦樹中查看」連結（只導覽，不寫入）。
  - 會員端的 `ReferralTreeView` 不共用：它的節點型別是遮罩名，loader 綁 viewer 的三代子樹。admin 版另寫，但借用 `usePagedList` 與它的懶展開手法。
- **後端**：
  - 新 handler 放 `supabase/functions/api/admin-referral-tree.ts`。照 `referral-invite.ts`／`listing-photos.ts` 的慣例：`createAdminReferralTreeHandlers(deps)` 回傳 handler，index.ts 只多 import、deps 與每條路由一行掛載，邏輯不進 index.ts。
  - 與 S2 動 index.ts 的 validate 段不同區。
  - `deriveNodeStatus` 改成 export 供重用，四態同一份。
- **守門**：
  - `admin-gate.test.ts` 的 `ADMIN_ROUTES` 逐條加上新端點。
  - 另把 `ADMIN_ROUTES` 改成從 `app.routes` 自動列舉所有 `/api/admin/` 路由，補上第 4 波 ops P2-4 的缺口。這是依審查結果決定的選配，見 Q7。
  - 每支 RPC 都加「authenticated／anon 不得 EXECUTE」測試。
- **個資**：
  - RPC 本身不 select `national_id`、`bank_code`、`bank_account`、`phone`、`birth_date`。測試斷言回應的 key 集合不含這些欄位。
  - `/admin` 已在 `PrivateRegion` 下。`ReferralAuditSheet` 走 portal，`SheetContent` 要加 `privateClass()`，並列入 `SENSITIVE_PORTALS`。
- **快取**：推薦樹與詳情都每次現讀，不進 `adminCache`，比照會員詳情與搜尋結果（§13）。規格書 §13 的「不從快取顯示」清單要補上這兩項。
- **multi-step-flow 四契約**：這是唯讀頁，沒有多步驟流程，不適用。

## 4. UI/UX

畫面草圖，以手機 375px 為準：

```
[會員列表] [推薦樹] [證件審核]          ← 次分頁
┌ 搜尋姓名或推薦碼 ───────────── 🔍 ┐   ⚠ 異常 3（依 Q3）
已顯示 20 / 24 位（頂層）
▸ 王大明  8048876  訂閱中   直接推薦 12   ⚠
  ▾ 陳小華  8048890  即將到期 剩 12 天   直接推薦 3
     ▸ 林○○ …                              （admin 看真名）
  [載入更多（已顯示 50 / 120 位）]
```

- **節點列**：
  - 第一行是姓名和推薦碼。第二行是狀態徽章、到期日與「直接推薦 N 位」，有異常時加 ⚠ 加文字。
  - 整列點下去開詳情，展開鈕和整列分開，觸控面積都至少 44px。
  - 縮排每層 12px。超過 4 層後不再縮排，改在列前顯示「第 N 層」，避免 375px 被擠爆（ui-ux §10 溢字）。
- **詳情 Sheet**（沿用 `MemberDetailSheet` 的結構：手機全寬、桌面 `max-w-lg`）分區如下：
  - 身分與會籍
  - 推薦人鏈：往上各代，可點跳去該人
  - 獎金與點數：各代獲得、餘額、累計
  - 任務
  - 提領
  - 換線紀錄
  - 付款與三代獎金：分頁，可載入更多
  - 異常
  - 「為什麼沒獎金」不另開一區，原因直接寫在「付款與三代獎金」各代的結果欄，以及帳號狀態的說明行：「停權／到期不影響入帳，影響提領」。
- **文案（W5-53，§12.13）**：
  - 推薦人鏈寫成「推薦人」「推薦人的推薦人」，或「往上第 N 位」（依 Q4）。
  - 收獎的代數沿用獎勵明細既有的「第 1／2／3 代」。
  - 不出現「上線／下線」。`terminologyGuard.test.ts` 會掃到。
- **三態**：
  - 列表用 `AdminListSkeleton`，展開中的子層各自顯示骨架。
  - 讀取失敗分兩種：整頁失敗用 `LoadErrorCallout`；子層失敗只在該層顯示中性錯誤字加重試，不連坐。
  - 搜尋沒有命中時寫「找不到符合的會員」，不寫「0 筆」來代替讀取失敗（§6）。
- **搜尋**：debounce 300ms。過期回應依請求當下的 q 丟棄，避免重蹈第 4 波 ref P2-12 的競態。「已顯示 X / Y 筆」加載入更多。
- **自動展開**：點命中結果，依 `ancestorIds` 由頂層往下逐層載入。目標可能不在第一頁，所以子層請求要能「確保包含某 id」：RPC 加參數 `p_ensure_id`，把該節點併進回應並標 `pinned`。展開完成後聚焦到目標列，並用 `aria-live` 播報「已展開到〇〇」。

## 5. 階段切分（每階段＝一個 TDD 紅綠循環）

**S3a（必上）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `referral_award_chain`＋與 `pay_referral_generations` 的等價 | `supabase/functions/api/referral-award-chain.test.ts`（DB） | 五種拓撲（完整三代、缺第 2 代、缺第 3 代、第 2 或第 3 代成環、profiles 與 edges 不一致）下，實發收獎者逐代等於 chain |
| 2 | 樹節點與搜尋 RPC（分頁、total、ancestorIds、ensure_id、個資排除、GRANT） | `admin-referral-tree-db.test.ts` | 一位推薦人有 1,005 位直接推薦時，total 精確且第 21 頁有資料；搜尋全形碼命中；回應 key 不含身分證或帳號；authenticated／anon 呼叫被拒 |
| 3 | 會員查帳 RPC（欄位、往上鏈加深度上限、換線紀錄、成環與自己推薦自己） | 同上 | 造 A→B→A 換線（含一筆失敗的換線）得到正確序列；造兩人成環得到異常且不會無限迴圈 |
| 4 | 付款查帳與異常 RPC（✓、✗、—、⛔、無法判定；任務續約；ledger_reset 不誤判） | 同上 | 刪掉一列第 2 代獎勵得到 ✗；付款後才換線得到「無法判定」；自癒後 ✗ 消失 |
| 5 | Edge 端點、契約、守門（`ADMIN_ROUTES`，依 Q7 改自動列舉） | `admin-referral-tree.test.ts`、`admin-gate.test.ts`、`api-contract.test.ts` | 401、403、500 不回空、400 非 uuid、404；回應通過 `assertShape` |
| 6 | 前端純函式（展開路徑合併、ensure 節點去重、結果與原因的文案、層級標示） | `src/components/admin/referral-tree/referralAudit.test.ts`（node） | 全部情境綠；文案不含禁用詞 |
| 7 | `AdminReferralTree`（搜尋、頂層、懶展開、載入更多、自動展開、三態、過期回應丟棄） | `AdminReferralTree.test.tsx`（jsdom） | 點命中結果得到逐層展開並聚焦目標；子層失敗只影響該層 |
| 8 | `ReferralAuditSheet`＋次分頁＋從會員詳情跳轉＋`privateClass`、`SENSITIVE_PORTALS` | `ReferralAuditSheet.test.tsx`、`MemberManagement.test.tsx`、`sensitiveFields` 掃描測試 | 各區塊呈現、各代結果與原因、portal 帶私密 class |
| 9 | 規格書 §13（與 §7.2 指標）、e2e（mock 網路，375 與 1280 版面） | `e2e/features/admin_referral_tree.feature`、`test_admin_mobile_layout.py` 擴充 | CI 綠；`check-spec-drift.py` 綠 |

**S3b（看進度，疊在 develop 上另開 PR）**

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 10 | 點數來源明細與對帳 RPC | `admin-referral-tree-db.test.ts` | 對帳的口徑見 Q8 |
| 11 | 端點、契約、詳情的「點數來源」區、異常「點數對不上帳」 | Deno 端點測試、jsdom 測試 | 造一筆不一致得到異常，明細可以分頁 |

## 6. 開放問題

需要業主裁決的放 Q1～Q5，主 session 能決定的放 Q6～Q8。每題附建議。

- [ ] **Q1 停權、到期、未加入推薦計畫，現在都「照發獎金」**（規則事實，非 bug）。
  - 依據：`pay_referral_generations` 不讀這三欄；§5.1 寫明失效期間照常入帳；§5.2 停權只凍結提領、credit 與付款。
  - W6-5 寫「停權、自領停發、到期等原因要看得出來」，可能預期這些情況會停發。
  - 建議：**畫面如實呈現「照發，但目前不可提領（原因）」**，不改發獎規則。要改規則屬金流與獎勵變更，另開工項。
- [ ] **Q2 換線紀錄的資料來源**。
  - (a) 用現有資料推導：首位推薦人取自 pair-history，之後依新約付款單逐筆列出，並標出換線失敗的單。
  - (b) 新增事件表，掛在 `profiles.referred_by_user_id` 變更的 trigger 上，從今天起完整記錄。
  - 建議 **(a)**：正式站 18 列，量小，(a) 已經能列出 A→B→A 的序列。(b) 要動付款交易內的 trigger，與 S1、S6 撞區，留第 7 波。
- [ ] **Q3 異常要不要有清單入口**。W6-7 推翻的是「異常清單當預設入口」；但只把 ⚠ 標在節點上，幾千人時 admin 找不到異常的人。
  - 建議：搜尋框旁放「⚠ 異常 N」，點開是可分頁的清單，每列可點進詳情。預設畫面不變。
- [ ] **Q4 「第幾代」的口徑**。「代」在用語規範裡只用在「相對於自己」。
  - 建議：
    - 樹上顯示「第 N 層」，從頂層算。
    - 詳情的推薦人鏈寫「推薦人／往上第 2 位／往上第 3 位…」。
    - 付款查帳寫收獎「第 1／2／3 代」，與獎勵明細既有文案相同。
- [ ] **Q5 頂層樹收誰**。`profiles` 含註冊中、尚未付款的空殼列。
  - 建議：**樹與搜尋只收曾有過訂閱的會員，或至少有一位推薦對象的人**。註冊中的人從既有的會員列表找。
- [ ] **Q6（主 session）** S3a 不改 `pay_referral_generations`，只用等價測試釘住口徑。S1、S6 合併後，第 7 波再讓發獎函式改為呼叫 `referral_award_chain`，從結構上變成單一來源。
  - 若主 session 希望本波就收斂，S3a 必須等 S1 合併後 rebase 才能施工階段 1。
- [ ] **Q7（主 session）** `admin-gate.test.ts` 改為從 `app.routes` 自動列舉，順手修掉 ops P2-4。
  - 建議：做，成本小。不做就只手動加新的那幾條。
- [ ] **Q8（S3b 開工前定）** 「餘額 ≠ 獲得 − 提領」的口徑。
  - `reward_balances.available` 本身就是流水帳加總，拿同表重算會是恆等式。
  - 有意義的比對是跨表：每筆非退件的 `withdrawals` 在帳本有一列 −(amount＋fee)；每筆退件有一列退款；`withdrawal_id` 沒有孤兒；`ledger_reset` 的金額等於清空當下餘額。
  - 建議用這四條跨表不變式，S3b 規劃時再細化。

## 7. 風險與回滾

- **最壞情況一：判定口徑錯，把正常付款標成缺漏**，admin 據此人工補發，造成重複發獎。
  - 緩解：可判定閘門與自癒相同。推薦樹上沒有任何寫入或補發動作。缺漏旁的說明是「自癒會在該會員下次載入時補發；持續存在請回報」，不提供補發鈕。
- **最壞情況二：個資外洩到新的 RPC 回應或錄影**。
  - 緩解：RPC 不 select 敏感欄位，並用 key 集合測試釘住；portal 加私密 class；新 RPC 都 revoke 加測試。
- **效能**：遞迴有深度上限與 path 防環；每次請求最多 200 列；索引是純加法。
- **回滾**：純加法，包括新函式、新端點、新元件與新索引。revert PR 後，下一支 migration `drop function` 和 `drop index`。不動既有函式和表，所以回滾不碰金流路徑。
