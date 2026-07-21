# 我的推薦網絡 — 重新設計方案

> 狀態：**設計提案（未實作）**
> 範圍：**僅重塑「我的推薦網絡」這張卡片**（`ReferralManagement` 內的 `ReferralTreeView` 與其上的推薦碼區塊）之 UI/UX、資訊架構、API 契約、資料載入與效能策略。
> **不改動**：頁面上方既有的四張統計卡（總推薦數／一代／二代／三代，現有 `ReferralStats` 元件）。
> 定調前提（已與需求方確認）：
> 1. 活躍推薦者的三代網絡**可能數百到上千人**。
> 2. 顯示深度**封頂 3 代**（與獎勵制度一致）。
> 3. 節點詳情需**串接獎勵資料**（此下線幫我帶進多少）。
> 4. 本階段交付**設計方案 + 線框，不動程式碼**。

---

## 1. 問題診斷

### 1.1 現況
`ReferralTreeView` 把網絡按代數壓平成三個獨立區塊（一代／二代／三代），每塊是一排卡片。二、三代雖標註「推薦人是誰」，但需要在不同區塊間用眼睛對名字。

### 1.2 根本問題
**父子結構（誰是誰的下線）在呈現層被丟失。** 一旦超過幾個人，就無法追蹤下線關係。這不是「缺一張圖」，而是**把樹壓平了**。

### 1.3 資料層其實很健康（利多）
- `referral_edges`：`referee_user_id` 是主鍵 → 每人只有一個上線 → 這是一棵**樹（forest）**，不是複雜網狀圖，天生適合樹狀呈現。
- 獎勵只算 3 代 → 顯示深度天然有上限，不會無限遞迴。
- 節點狀態採 main 0721 後的模型（見下方註記），失效節點**仍留在樹上**（下線不斷開）→ 視覺需可區分。

> **⚠ 對齊 main 0721 狀態重構**：main 已 `remove_grace_status`——會員狀態由三態收斂為**兩態 `active / expired`**（到期即失效，取消 60 天寬限）；提醒前移到**到期前 30 天**（`subscriptionNotice.ts` 的 `renewalNoticeDaysLeft`）；`suspended`（`profiles.suspended_at`）為正交狀態，會擋刊登可見性與獎勵領取；可見性（`has_active_subscription`）改以 `end_date` 為界。本設計已依此重做狀態系統（見 §4.5）。附帶效果：先前「grace 卻在 `public_listings` 顯示」的不一致已隨 grace 移除而消失。

**結論：這題是「還原呈現層的結構」＋「重新設計載入策略」，資料庫 schema 不需改。**

---

## 2. 核心設計決策

| 決策 | 選擇 | 理由 |
|---|---|---|
| 主視圖形式 | **可展開的縮排大綱樹（outline tree）**，非畫布式節點圖 | Mobile-first（有 BottomNav）。空間型節點圖在手機上需縮放平移、節點小、名字擠、觸控難。縮排大綱在窄螢幕直覺、可無障礙、天生支援「只展開我關心的分支」。 |
| 節點圖（org-chart） | **桌機／平板選配的第二視圖**（後續里程碑） | 想看全貌的加值功能，非主力，不擋 mobile 體驗。 |
| 顯示深度 | **封頂 3 代** | 與獎勵一致；授權與遞迴自然收斂。 |
| 載入策略 | **分支懶載入（lazy expand）** | 數百到上千人不可一次撈滿。展開才載入下一代。 |
| 摘要統計 | **便宜的 COUNT 查詢**，與節點內文分離 | 三代人數用 count 算，不撈 enrich 過的整列；避免大 payload。 |
| 獎勵 | **節點詳情逐人 + 頂部網絡總收益** | 把「網絡結構」與「錢」串起來，是使用者最在意的資訊。 |
| 技術依賴 | 幾乎零新增：`@radix-ui/react-collapsible` + `motion` 已在專案 | 遞迴渲染即可；不引入重量級 graph library。 |

---

## 3. 資訊架構（IA）

### 3.0 確定版資訊清單（已與需求方核對）

以「放在哪個畫面區塊」為主軸，✅ = 放、🟡 = 有條件放、❌ = 刻意不放。

**A0. 頁面上方四張統計卡** — **不在改動範圍**，維持現有 `ReferralStats`（總推薦數／一代／二代／三代）。

**A. 卡片內頂部**（「我的推薦網絡」卡片內，非頁面頂部）
| 欄位 | 來源 | 決策 |
|---|---|---|
| 我的推薦碼 + **分享** | `referral_codes`(我) | ✅ 見 §3.5 |
| 網絡累計收益 / 本月待入帳 | `reward_schedules` | ❌ 移除——本卡不呈現獎勵金額 |
| 單純「複製推薦碼」按鈕 | — | ❌ 刪除，改為分享（見 §3.5） |
| 本月新增下線 / 任務進度 | `referral_edges` / `tasks` | ❌ 不放（屬激勵/任務範疇，另有入口） |

**B. 樹狀列 · 掃視層**（密度＝精簡，手機維持單行）
| 欄位 | 來源 | 決策 |
|---|---|---|
| 狀態點（綠/琥珀/灰） | `user_account_status.status` | ✅ |
| 姓名（深代數遮罩，見 §3.4） | `profiles.name` | ✅ |
| 代數色標（左側 rail） | 計算 | ✅ |
| 狀態燈號（綠/琥珀/灰/紅） | `status` + `suspended_at` | ✅ 各狀態**只靠燈號**表達，不加文字 label |
| 右側「剩 N 天到期」（琥珀） | `daysToExpiry` | ✅ **僅即將到期**才顯示；其餘狀態右側留白 |
| 到期日 | `account_status.end_date` | ❌ 樹列不放（收到詳情「訂閱到期」列） |
| 下線數 pill / 「末代」標籤 | `childCount` | ❌ 列上不放——展開與否由左側箭頭表示；下線數收到詳情 |
| 本月獎勵摘要 | `reward_schedules` | ❌ 列上不放（收到詳情）——到期日是更該被掃到的流失風險訊號 |
| 服務類別 · 城市 | `listings` | ❌ 列上不放（收到詳情） |
| 推薦碼 · 加入日期 | — | ❌ 列上不放（收到詳情） |

**C. 節點詳情 · sheet / 側欄**（精簡：不呈現獎勵與推薦碼）
| 欄位 | 來源 | 決策 |
|---|---|---|
| 大頭 + 姓名 + 狀態徽章 | `profiles` + `account_status` | ✅（名字下方不放副標） |
| 代數徽章 | 計算 | ✅ 標「一代／二代／三代」，**不加「下線」** |
| 直接下線數（「N 位直接下線」） | `childCount` | ✅ |
| **加入日期**（置於「訂閱到期」上一列） | `referral_edges.referred_at` | ✅ |
| 訂閱到期日 | `account_status.end_date` | ✅ |
| 「查看刊登」+「展開其下線」捷徑 | `listings` / `childCount` | ✅ |
| 刊登服務、所在城市 | `listings` | ❌ 移除——改由「查看刊登」自行檢視 |
| 獎勵（已入帳 / 待發 / 剩餘月數） | `reward_schedules` | ❌ 移除——本卡不呈現獎勵 |
| 推薦碼 | `referral_codes` | ❌ 一律不顯示（含各代下線） |
| 聯絡方式 | `profiles` | ❌ 刻意不給（隱私/騷擾） |

### 3.1 節點資料模型（列表用，輕量）
```ts
interface ReferralNode {
  userId: string;
  name: string;
  generation: 1 | 2 | 3;             // 相對於我（root）
  status: 'active' | 'expiring' | 'expired' | 'suspended';
  // active=效期內；expiring=active 且距 end_date ≤30 天；
  // expired=到期/從未訂閱；suspended=帳號停權（正交狀態）
  daysToExpiry?: number;             // expiring 用：距到期天數（伺服器算）
  joinedAt: string;                  // referred_at
  referralCode: string | null;
  listing: { serviceType: string | null; city: string | null } | null;
  childCount: number;                // 直接下線數（gen<3 才可能 >0；gen3 恆為 0/隱藏）
  reward: {                          // 「這個人幫我帶進多少」摘要
    earned: number;                  // 已發放（completed）點數
    pending: number;                 // 待發放（pending）點數
    monthsRemaining: number;         // 12 個月分期還剩幾個月
  };
}
```

### 3.2 節點詳情（sheet 用，精簡）
- 頭部：大頭 + 姓名 + 狀態點；**名字下方不放副標**（不再有「加入於…·城市」那行）。
- 徽章列：代數（一代／二代／三代，不加「下線」）· 狀態 · 「N 位直接下線」。
- 欄位（依序）：**加入日期**、訂閱到期日。
- 底部動作：展開其下線、查看刊登（服務／城市等細節由此進刊登頁自行檢視）。
- **不呈現**：刊登服務／城市、獎勵金額、推薦碼、聯絡方式。

**失效／停權節點的「查看刊登」**：刊登詳情頁讀 `public_listings` view，其只暴露 `has_active_subscription` 者——0721 後可見性以 `end_date` 為界且會擋 `suspended`。因此 **expired 與 suspended 兩者的刊登都不在此 view**，直接連過去會落到通用的「找不到此服務者」死頁。故對 **expired／suspended** 節點，詳情**不提供「查看刊登」連結**，改標「此帳號已失效／已停權，刊登已下架」。active（含即將到期）的刊登仍公開，保留正常連結。

### 3.3 卡片內頂部（非頁面頂部）
- 三代人數統計卡**不在此**——它們是頁面上方既有的 `ReferralStats`，本次不動。
- 卡片內只置頂：**推薦碼 + 分享**（見 §3.5）。
- **不放**網絡收益金額、本月新增下線、任務進度等資訊，讓卡片專注於「看網絡結構」。

### 3.4 隱私與遮罩規則（跨畫面）
下線分兩層對待：
- **一代（直推）**：你親自找來的人 → **全顯**姓名、刊登。
- **二、三代（下線的下線）**：你未必認識 → **姓名部分遮罩**（如「陳○玲」）、保留服務類別／城市供辨識。
- **推薦碼一律不顯示**（不分代數），聯絡方式亦不提供。

**姓名遮罩演算法（依文字類型切換）**：
- **中文 / CJK**：保留首末字，中間逐字換 `○`。例：陳美玲→`陳○玲`、王淑惠→`王○惠`、兩字「王淑」→`王○`。
- **英文 / 帳號名（Latin、含數字）**：保留**首字母 + 末字元**，中間換**固定 `•••`**（不隨長度變化，避免洩漏名字長度）。例：Simon2→`S•••2`、John Smith→`J•••h`、兩字「Al」→`A•`。保留末字元讓共用前綴的帳號（Simon2 / Simon6 / Simon7）仍可由尾碼區分。
- **單字元**：原樣顯示。

理由：平衡「看得懂網絡結構」與「不過度暴露非直接關係者的個資、避免跨線騷擾」。遮罩在**伺服器端**完成（API 依觀看者與目標的代數關係決定回傳粒度），前端不持有未遮罩資料。

### 3.5 推薦碼 → 分享（對齊 Dashboard）
卡片內的推薦碼區塊**移除單純「複製推薦碼」**，改為一顆「分享」，直接沿用既有的 `shareReferralInvite()`（`src/utils/referralInvite.ts`）：
- 支援 Web Share API 時：叫**系統原生分享面板**，`text` 帶完整邀請訊息。
- 不支援（或會壞掉的 in-app 瀏覽器）：**複製整段邀請訊息**到剪貼簿並提示。
- 分享內容為 `buildInviteMessage()` 產出的一段文字（含註冊連結＋推薦碼）：

  ```
  邀請你一起加入 Uknow：
  https://<app>/register?ref=<code>

  推薦碼 <code>
  ```

與 Dashboard 的 `ReferralCodeCard` 行為一致，但此處**只保留分享**（Dashboard 的「複製碼」按鈕不在此頁重現），UI 收斂為推薦碼 + 分享單一動作。仍複用同一份 `referralInvite` 工具，行為與文案不分岔。

---

## 4. 互動與版面（線框見互動 Artifact）

### 4.1 主樹視圖
- 每列 = 一人。縮排深度 = 代數。左側 chevron 收合分支。
- **密度＝精簡**（手機維持單行）：狀態點 · 姓名 · 代數色標 · **最近訂閱到期日**（近期到期以警示色）。展開與否由左側箭頭表示，**列上不放**下線數 pill、「末代」標籤、獎勵摘要、服務類別／城市（皆收到詳情）。
- 點整列 → 開節點詳情（手機 bottom sheet / 桌機右側欄）。
- 一代預設展開，二、三代預設收合（維持現況直覺）。

### 4.2 展開／收合與懶載入
- 點 chevron 展開某節點 → 若尚未載入，顯示**骨架列（skeleton shimmer）**，同時發 `children` 請求。
- 回來後填入子節點；分支結果快取，二次展開不再請求。
- gen3 節點不顯示展開箭頭（葉節點）。

### 4.3 搜尋下線
- 頂部搜尋框：依姓名／推薦碼。
- 伺服器回傳命中者 + 其**祖先路徑**；前端自動展開沿途分支並高亮命中列。
- 大網絡的救命功能（上千人不可能手動翻）。

### 4.4 節點詳情（含獎勵）
- Bottom sheet（手機）：姓名 + 狀態徽章、加入日、刊登、推薦碼（複製）、**獎勵區塊**（已入帳／待發放／剩餘月數）、「查看其下線」。
- 桌機：右側 sticky 面板，內容同上。

### 4.5 狀態視覺系統（兩態 + 即將到期 + 停權，不可只靠顏色）

| 狀態 | 定義 | 色 | 圖示 | 樹列右側 | 查看刊登 | 獎勵 |
|---|---|---|---|---|---|---|
| 訂閱中 active | `now ≤ end_date` | 綠 | ● 實心 | （留白） | 可看 | 正常 |
| 即將到期 | active 且距到期 ≤30 天 | 琥珀 | ● | **「剩 N 天到期」** | 可看 | 正常，流失風險高 |
| 已失效 expired | 過期／從未訂閱 | 灰 | ○ 空心 | （留白） | ❌ 標「已下架」 | 停止 |
| 停權 suspended | `suspended_at` 有值 | 紅 | ● | （留白） | ❌ 標「已下架」 | 領取被擋 |

**樹列格式規則**：
- **狀態一律只靠燈號**表達，不加文字 label（避免與燈號重複）。
- **右側只在「即將到期」時顯示「剩 N 天到期」**（琥珀）——斷崖前唯一需要主動催續約的訊號；其餘狀態右側留白。
- **到期日不放樹列**，收到詳情「訂閱到期」列（各狀態皆有日期；失效者為過去日期）。詳情狀態徽章只寫「即將到期」，天數已由「訂閱到期（剩 N 天）」表達。
- 琥珀色由舊「grace 狀態」**轉義**為「active 但 ≤30 天將到期」——對齊 main 的 30 天續訂提醒，是催下線續約的流失防線。
- expired／suspended 節點降透明度但**保留在樹上**，下線不斷開。
- `suspended` 不在 `user_account_status` 兩態列舉中（來自 `profiles.suspended_at`），故 my-tree／node API **需額外回傳 `suspended_at`** 才能正確標示與擋「查看刊登」。

### 4.6 空 / 載入 / 錯誤
- 空：維持現況引導（分享推薦碼）。
- 冷啟動載入：頂部摘要 + 一代骨架。
- 錯誤：沿用 SWR，有舊快取先畫舊資料，背景重試失敗不擋畫面。

---

## 5. 資料載入架構與 API 契約

> 現行 `GET /referrals/my-tree` 一次撈滿 3 代並壓平回傳，數百到上千人時 payload 過重、且結構被壓平。以下為**新契約提案**（可與舊端點並存漸進遷移）。

### 5.1 `GET /referrals/network/overview`（初次載入）
回傳頂部摘要 + 一代節點（含每個節點的 `childCount` 與逐人獎勵摘要）。
```jsonc
{
  "userReferralCode": "ABC123",
  "summary": {
    "gen1": { "total": 12, "active": 10 },
    "gen2": { "total": 48, "active": 41 },   // 用 COUNT 查詢，不撈整列
    "gen3": { "total": 96, "active": 80 }
  },
  "rewardSummary": { "earnedTotal": 3600, "pendingThisMonth": 240 },
  "roots": [ /* ReferralNode[]（一代） */ ]
}
```

### 5.2 `GET /referrals/network/children?parentId=<uuid>`（展開）
- **授權 + 深度檢查**：`parentId` 必須在我的 3 代子樹內；若 `parentId` 已是第 3 代，回空陣列（葉）。
- 回傳該 parent 的直接下線 `ReferralNode[]`（各含自己的 `childCount` 與獎勵摘要）。

### 5.3 `GET /referrals/network/search?q=<text>`（搜尋）
- 於我的 3 代子樹內比對姓名／推薦碼。
- 回傳命中節點 + `ancestorPath: string[]`（從一代到命中者的 userId 序列），供前端自動展開。

### 5.4 `GET /referrals/network/node/:userId`（詳情）
- 授權：`userId` 在我的 3 代子樹內。
- 回傳完整詳情 + 獎勵明細（見 §3.2）。

### 5.5 授權與深度檢查（新增的關鍵伺服器邏輯）
「T 是否在觀看者 V 的 3 代子樹內？」→ 自 T 沿 `referral_edges` 往上爬**最多 3 跳**，看 V 是否出現。成本 ≤3 次索引查詢，非常便宜。所有 children/detail/search 端點都必須過這關，避免越權查看他人網絡。

### 5.6 前端快取
沿用現有 `DataCacheContext` + SWR：
- overview 一份快取（stale-while-revalidate，維持現有 F5 秒開行為）。
- 每個展開分支各自快取（key = parentId），避免重複請求。
- 搜尋結果不快取，但展開後的分支進共用快取。

---

## 6. 資料模型：需不需要改？

**不需要改 schema。** `referral_edges` 已是樹的唯一真相，且 `idx_referral_edges_referrer` 支援「查某人的直接下線」與 `childCount` count。

- `childCount`：`select count(*) from referral_edges where referrer_user_id in (...)` group by，走現有索引，便宜。
- 三代摘要：分層 COUNT（gen1 → 以 gen1 ids 查 gen2 count → 以 gen2 ids 查 gen3 count）。是 count 不是撈整列，payload 極小。
- **逐人獎勵**：`reward_schedules` 以 `beneficiary_user_id`（= 我）+ `referee_user_id`（= 該節點）聚合 completed / pending / 剩餘月數。建議加索引：`(beneficiary_user_id, referee_user_id)`（若尚無）。
- 網絡總收益：`reward_schedules` 以 `beneficiary_user_id = 我` 聚合。

> 可選（僅在 profiling 顯示 count 查詢成為瓶頸時）：物化 `subtree_count` / `direct_child_count` 至 profiles，用觸發器維護。**目前判斷為過早最佳化，不建議先做。**

---

## 7. 效能策略（數百到上千）

1. **分支懶載入**：初次只載一代（通常數十人）。上千人的網絡展開才付費。
2. **摘要 = COUNT，內文 = 懶載入**：兩者分離，杜絕「為了顯示總數而撈全樹」。
3. **childCount 預取**：每個節點自帶下線數，展開前就知道要不要顯示箭頭、有多大。
4. **長分支虛擬化**：某節點若有數百直接下線（推薦王），該層清單用虛擬滾動（windowing）+「載入更多」分頁。
5. **搜尋走伺服器**：不在前端撈全樹再過濾；伺服器回路徑，前端只展開需要的分支。
6. **分支快取**：展開過的分支不重撈；SWR 背景更新。

---

## 8. 交付分期建議

- **M1（本提案）**：設計規格 + 互動線框（本文件 + Artifact）。
- **M2 — 資料層**：新增 `overview` / `children` / `search` / `node` 四端點與授權深度檢查；保留舊端點並存。
- **M3 — 前端主樹**：以縮排大綱樹重寫 `ReferralTreeView`（懶載入、骨架、狀態視覺、搜尋、節點詳情 sheet 含獎勵）。
- **M4 — 加值**：桌機組織圖模式、逐月獎勵排程視覺化、分享／邀請整合。

---

## 9. 風險與待確認

- **隱私**：目前 API 已回傳二、三代下線的真實姓名與刊登。是否需對較深代數做遮罩（例如只顯示暱稱／代號）？沿用現況或收斂，需產品決策。
- **失效/停權節點**：expired／suspended 下線仍完整顯示於樹中（節點保留、下線不斷）——本設計遵循。
- **API 需回傳 `suspended_at`**：`suspended` 不在 `user_account_status` 兩態列舉中，my-tree／node 端點須額外帶出，前端才能標示停權並擋「查看刊登」。
- **即將到期由伺服器判定**：`daysToExpiry`／`status='expiring'` 建議在伺服器算（對齊 `renewalNoticeDaysLeft` 的 30 天門檻），避免前端各自為政。
- **搜尋範圍**：搜尋是否僅限有效節點，或含 expired／suspended？預設含全部並以狀態徽章區分。
