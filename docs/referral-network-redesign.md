# 我的推薦網絡 — 重新設計方案

> 狀態：**設計提案（未實作）**
> 範圍：刊登管理 →「我的推薦網絡」（`ReferralManagement` / `ReferralTreeView`）之 UI/UX、資訊架構、API 契約、資料載入與效能策略。
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
- 節點狀態 `active / grace / 永久失效`，失效節點**仍留在樹上**（下線不斷開）→ 視覺需可區分。

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

### 3.1 節點資料模型（列表用，輕量）
```ts
interface ReferralNode {
  userId: string;
  name: string;
  generation: 1 | 2 | 3;             // 相對於我（root）
  status: 'active' | 'grace' | 'inactive';   // 對應帳戶狀態；inactive = 永久失效
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

### 3.2 節點詳情（sheet 用，較完整）
在列表節點資料之外，額外回傳：
- 加入日期完整格式、目前訂閱到期日（`activeUntil`）。
- 刊登：名稱、類別、城市（可連結到該刊登，若有權限）。
- 獎勵明細：本月已入帳、待發放、剩餘月數、逐月排程（可選）。
- 下線數與「展開查看其下線」捷徑。

### 3.3 頂部摘要（網絡總覽）
- 三代人數（各代有效／總數），沿用現有 `ReferralStats` 但語意化狀態。
- **網絡總收益**：此網絡累計已入帳、本月待發放。
- 我的推薦碼 + 一鍵複製／分享。

---

## 4. 互動與版面（線框見互動 Artifact）

### 4.1 主樹視圖
- 每列 = 一人。縮排深度 = 代數。左側 chevron 收合分支。
- 列上資訊密度（由左到右）：狀態點 · 姓名 · 代數色標 · 下線數 pill（如「3 位下線」）· 本月獎勵摘要。
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

### 4.5 狀態視覺系統（不可只靠顏色）
| 狀態 | 色 | 圖示 | 標籤 | 樹上呈現 |
|---|---|---|---|---|
| 訂閱中 active | 綠 | ● 實心 | 有效 | 正常 |
| 寬限 grace | 琥珀 | ◐ 半 | 寬限中 | 正常 + 提示 |
| 永久失效 inactive | 灰 | ○ 空心 | 已失效 | 降透明度，但**保留節點與其下線** |

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
- **失效節點**：確認失效下線仍完整顯示於樹中（規格 §4「即使上線永久失效，組織圖中節點仍存在」）——本設計遵循此規則。
- **搜尋範圍**：搜尋是否僅限有效節點，或含已失效？預設含全部並以狀態徽章區分。
