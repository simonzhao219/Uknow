# Demo 種子資料（supabase/seeds）

供展示（demo）使用的範例資料，**非**正式 schema migration。請以 Supabase
SQL Editor 或 MCP `execute_sql` 對目標專案執行。

## demo_referral_tree.sql

在 Simon（`973bd8b4-…`，推薦碼 `abc1234`）底下建立一棵完整三代推薦樹，
用來展示「組織圖 / 推薦關係 / 獎金 / 人物（刊登）」：

```
Simon (abc1234)
├─ 陳美玲 美容/台北    ├─ 黃雅婷 美甲/台北 ── 蔡明翰 美髮/台南 (三代)
│                     └─ 吳建宏 汽車/桃園
├─ 林志豪 健身/新北 ── 劉怡君 音樂/新竹
├─ 王淑芬 身心靈/台中
└─ 張家偉 攝影/高雄
```

- 一代下線 4 人、二代 3 人、三代 1 人；每人皆有有效年度訂閱（會員 active）、
  刊登（人物）與專屬推薦碼。
- 依獎勵規則（每筆訂單每代 10 點 × 12 月 = 120 點，最多三代）寫入推薦獎金：
  Simon 960、陳美玲 360、林志豪 120、黃雅婷 120。
- Simon 當月（2026-06）推薦王任務進度 = 4/10。
- 固定 UUID（`d1a…`～`d3a…`）、可重複執行（idempotent）。
- demo 帳號 email 為 `demo.*@demo.uknow.local`，密碼統一 `Demo2026!`
  （若需登入下線視角）。

## demo_referral_tree_cleanup.sql

移除上述全部 demo 資料（含發給上線的獎金列），並把 Simon 的推薦王進度歸零。
