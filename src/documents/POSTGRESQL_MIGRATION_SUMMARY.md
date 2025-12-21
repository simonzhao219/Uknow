# 📝 PostgreSQL 架構遷移摘要

**更新日期：** 2024-12-21  
**計畫書版本：** v1.1 → v1.2  
**重大變更：** KV Store → PostgreSQL

---

## 🎯 變更摘要

### 架構變更

**從：** Supabase KV Store（Key-Value）  
**到：** Supabase PostgreSQL（關聯式資料庫）

### 工時優化

**原估：** 440 小時  
**新估：** 380 小時  
**節省：** 60 小時（13.6%）

---

## 📊 技術對比

| 需求項目 | KV Store | PostgreSQL | 勝出 |
|---------|----------|-----------|------|
| **SSOT 保證** | 手動維護姓名一致性 | 外鍵自動保證 | ✅ PostgreSQL |
| **組織樹查詢** | 1 + 2N 次讀取 | 單次 JOIN | ✅ PostgreSQL |
| **提領併發控制** | 手動樂觀鎖 | Transaction | ✅ PostgreSQL |
| **每日獎勵發放** | 逐筆處理 | 批次 UPDATE | ✅ PostgreSQL |
| **複雜查詢** | 不支援 | 完整 SQL | ✅ PostgreSQL |
| **開發複雜度** | 高 | 低 | ✅ PostgreSQL |
| **型別安全** | 需手動維護 | Prisma ORM | ✅ PostgreSQL |

**綜合評分：** PostgreSQL 28/30 分 vs KV Store 16/30 分

---

## 🔧 技術棧變更

### 後端

**新增：**
- ✅ Prisma ORM（型別安全的 ORM）
- ✅ PostgreSQL Function（複雜業務邏輯）
- ✅ PostgreSQL Transaction（ACID 保證）

**移除：**
- ❌ KV Store 抽象層（kv_store.tsx）
- ❌ 手動索引維護
- ❌ 手動樂觀鎖實作

### 資料層

**新增：**
- ✅ `schema.prisma`（Prisma Schema 定義）
- ✅ `/supabase/functions/server/db.ts`（Prisma Client）
- ✅ Migration Files（資料庫遷移）

---

## 📋 資料表設計

### 9 張 PostgreSQL 資料表

| 表名 | 用途 | 關鍵特性 |
|------|------|---------|
| `users` | 用戶主表（SSOT） | 外鍵約束、索引優化 |
| `subscriptions` | 訂閱表 | 一對一、狀態計算 |
| `referral_codes` | 推薦碼表 | Unique Index、O(log N) 查詢 |
| `referral_relationships` | 推薦關係表 | 組織樹索引、支援 JOIN |
| `reward_schedules` | 獎勵排程表 | 批次處理優化 |
| `reward_history` | 獎勵歷史表 | 溯源支援 |
| `withdrawals` | 提領表 | Transaction 保證 |
| `task_progress` | 任務進度表 | 原子操作 |
| `listings` | 刊登表 | 一對一關聯 |

### ER 關聯

```
users (1) ─────────── (1) subscriptions
  │
  ├── (1) ────────── (0..N) referral_codes
  ├── (1:Referrer) ── (0..N) referral_relationships
  ├── (1:Referee) ─── (0..1) referral_relationships
  ├── (1) ────────── (0..N) reward_schedules
  ├── (1) ────────── (0..N) reward_history
  ├── (1) ────────── (0..N) withdrawals
  ├── (1) ────────── (0..N) task_progress
  └── (1) ────────── (0..1) listings
```

---

## 💡 關鍵優勢

### 1. SSOT 自動保證

**問題：** 姓名可能不一致  
**KV Store：** 手動複製姓名，需手動同步  
**PostgreSQL：** 外鍵自動保證，即時查詢最新姓名

**範例：**
```sql
-- 獎勵歷史自動查詢最新姓名（SSOT）
SELECT 
  rh.*,
  u.real_name AS referee_name  -- 永遠是最新的
FROM reward_history rh
JOIN users u ON rh.referee_user_id = u.id;
```

### 2. 組織樹查詢效能

**問題：** 需要查詢三代推薦關係  
**KV Store：** 1 + 2N 次讀取（N = 推薦人數）  
**PostgreSQL：** 單次 JOIN 查詢

**範例：**
```sql
-- 單次查詢取得組織樹（包含姓名）
SELECT 
  rr.generation,
  u_referee.real_name,
  u_referrer.real_name
FROM referral_relationships rr
JOIN users u_referee ON rr.referee_id = u_referee.id
LEFT JOIN users u_referrer ON rr.referrer_id = u_referrer.id
WHERE rr.gen1_referrer_id = $1;
```

### 3. 提領 ACID 保證

**問題：** 防止提領競態條件  
**KV Store：** 需手動實作樂觀鎖，複雜且易錯  
**PostgreSQL：** Transaction 自動處理

**範例：**
```sql
-- Transaction 自動保證原子性
BEGIN;
  SELECT * FROM users WHERE id = $1 FOR UPDATE;  -- 鎖定
  UPDATE users SET point_balance = point_balance - 1015 WHERE id = $1;
  INSERT INTO withdrawals (...) VALUES (...);
COMMIT;
```

### 4. 每日獎勵發放

**問題：** 每日發放數千筆獎勵  
**KV Store：** 逐筆處理，效能差  
**PostgreSQL：** 批次 UPDATE，效能極佳

**範例：**
```sql
-- 批次發放（單次 UPDATE）
UPDATE reward_schedules
SET status = 'Completed', completed_at = NOW()
WHERE scheduled_date = CURRENT_DATE AND status = 'Pending';

-- 批次增加點數
UPDATE users
SET point_balance = point_balance + (
  SELECT SUM(amount) FROM reward_schedules
  WHERE recipient_user_id = users.id AND scheduled_date = CURRENT_DATE
)
WHERE id IN (...);
```

---

## 📐 實作變更

### Phase 1: 資料模型（變更最大）

**原方案：**
- KV Store Key-Value 結構設計
- 手動索引建立
- 手動一致性維護

**新方案：**
- ✅ Prisma Schema 定義
- ✅ PostgreSQL Migration
- ✅ 外鍵自動約束

**工時變更：** 60h → 50h（減少 10h）

### Phase 2: 註冊流程

**影響較小，主要是 ORM 調用方式變更**

**原方案：**
```typescript
await kv.set(`user:${userId}:profile`, profile);
```

**新方案：**
```typescript
await prisma.user.create({ data: profile });
```

**工時變更：** 80h → 75h（減少 5h）

### Phase 3: 帳號狀態機

**原方案：** 手動計算狀態  
**新方案：** PostgreSQL Function 自動計算

**工時變更：** 70h → 60h（減少 10h）

### Phase 4: 推薦系統

**影響最大，組織樹查詢效能大幅提升**

**原方案：** 多次 KV 讀取  
**新方案：** 單次 JOIN 查詢

**工時變更：** 60h → 50h（減少 10h）

### Phase 5: 年費月領

**原方案：** 逐筆發放  
**新方案：** 批次 UPDATE

**工時變更：** 80h → 65h（減少 15h）

### Phase 6-8: 其他階段

**工時變更：**
- Phase 6: 30h → 25h（減少 5h）
- Phase 7: 20h → 15h（減少 5h）
- Phase 8: 40h → 40h（不變）

---

## 🔄 遷移策略

### 如果現有系統使用 KV Store

**不需要遷移！** 新系統直接使用 PostgreSQL

**原因：**
1. 新規格是全新功能（會員訂閱制）
2. 可以並行運行（KV Store 保留舊功能）
3. 逐步切換，風險可控

### 數據遷移（如需要）

```typescript
// 從 KV Store 讀取現有資料
const oldUsers = await kv.getByPrefix('user:');

// 批次寫入 PostgreSQL
await prisma.user.createMany({
  data: oldUsers.map(u => ({
    id: u.id,
    email: u.email,
    realName: u.name,
    // ...
  }))
});
```

---

## ✅ 最終決策

### 採用 PostgreSQL 的理由

1. ✅ **完美符合新規格需求**（28/30 分）
2. ✅ **SSOT 自動保證**（外鍵約束）
3. ✅ **ACID 保證**（Transaction）
4. ✅ **查詢效能優異**（JOIN + 索引）
5. ✅ **開發效率高**（Prisma ORM）
6. ✅ **工時減少 13.6%**（440h → 380h）

### 技術風險評估

| 風險項目 | 評估 | 緩解措施 |
|---------|------|---------|
| **學習曲線** | 低 | 標準 SQL，團隊熟悉 |
| **效能擴展** | 低 | Supabase 自動擴展 |
| **資料遷移** | 無 | 新系統，無需遷移 |
| **工具支援** | 高 | Prisma、pgAdmin 成熟 |

**綜合風險：** 極低

---

## 📄 相關文件

1. **主計畫書：** `/documents/NEW_SPEC_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` (v1.2)
2. **完整 Schema：** `/documents/PART3_POSTGRESQL_SCHEMA.md`
3. **技術對比：** 本文件 Part「技術對比」章節

---

## 🎯 下一步

1. ✅ 計畫書已更新為 PostgreSQL 架構
2. ✅ Schema 設計完成
3. ⏭️ 開始 Phase 1 實作（建立 Prisma Schema + Migration）

**狀態：** ✅ 架構決策完成，準備開始實作
