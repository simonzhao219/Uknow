# ✅ 計畫書已更新為 PostgreSQL 架構

**更新日期：** 2024-12-21  
**文件版本：** v1.1 → v1.2  
**重大變更：** 資料儲存從 KV Store 改為 PostgreSQL

---

## 📋 更新內容總覽

### 1. 文件版本與工時

✅ **版本號更新：** v1.1 → v1.2  
✅ **預估工時優化：** 440h → 380h（節省 60h，13.6%）  
✅ **更新記錄：** 已添加 v1.2 變更說明

### 2. Executive Summary

✅ **新增章節：** 「重大架構變更：KV Store → PostgreSQL」  
✅ **技術對比表：** 展示 PostgreSQL 優勢  
✅ **變更理由：** 說明選擇 PostgreSQL 的 5 大原因

### 3. Part 1: 現有系統架構分析

✅ **後端架構更新：**
- 從 `kv_store.tsx` → `db.ts`（Prisma Client）
- 資料儲存從 Key-Value → PostgreSQL Tables
- 新增 ORM 使用範例

✅ **技術棧更新：**
- Database: KV Store → **PostgreSQL**
- ORM: 無 → **Prisma**

### 4. Part 3: 資料模型設計

✅ **完全重寫為 PostgreSQL Schema**
- 9 張資料表 SQL 定義
- 9 張資料表 Prisma Schema
- 外鍵關聯與索引設計
- SSOT 實作範例
- Transaction 範例
- PostgreSQL Function 範例

✅ **新增獨立文件：** `/documents/PART3_POSTGRESQL_SCHEMA.md`（完整 Schema）

### 5. Part 5: Phase-by-Phase 實作方案

✅ **總覽表更新：** 新增工時對比列（KV vs PostgreSQL）  
✅ **Phase 1 更新：** 從 KV Store 模型改為 Prisma Schema  
✅ **Phase 2-7 更新：** 反映 ORM 調用方式變更  
✅ **工時優化：** 每個 Phase 都已調整工時

---

## 🎯 關鍵變更說明

### 變更 1: 技術棧

| 項目 | 原方案（KV） | 新方案（PostgreSQL） |
|------|-------------|---------------------|
| **資料庫** | Supabase KV Store | Supabase PostgreSQL |
| **ORM** | 無 | Prisma |
| **查詢方式** | Key-Value 讀取 | SQL / ORM |
| **一致性** | 手動維護 | 外鍵約束 |
| **併發控制** | 手動樂觀鎖 | Transaction |

### 變更 2: 資料模型

**原方案（KV Store）：**
```typescript
// Key-Value 結構
user:{userId}:profile
user:{userId}:subscription
user:{userId}:referral_codes
// ... 等等
```

**新方案（PostgreSQL）：**
```sql
-- 關聯式資料表
CREATE TABLE users (...);
CREATE TABLE subscriptions (...);
CREATE TABLE referral_codes (...);
-- ... 等等，使用外鍵關聯
```

### 變更 3: SSOT 實作

**原方案（KV Store）：**
```typescript
// ❌ 需要複製姓名
history.push({
  refereeName: referee.name  // 複製，未來可能不一致
});
```

**新方案（PostgreSQL）：**
```sql
-- ✅ 自動查詢最新姓名
SELECT rh.*, u.real_name AS referee_name
FROM reward_history rh
JOIN users u ON rh.referee_user_id = u.id;
```

### 變更 4: 組織樹查詢

**原方案（KV Store）：**
```typescript
// ❌ 1 + 2N 次讀取
const gen1Ids = await kv.get(`user:${userId}:gen1`);  // 1次
for (const id of gen1Ids) {
  const listing = await kv.get(`listing:${id}`);      // N次
  const user = await kv.get(`user:${listing.userId}:profile`);  // N次
}
```

**新方案（PostgreSQL）：**
```typescript
// ✅ 單次查詢
const tree = await prisma.referralRelationship.findMany({
  where: { gen1ReferrerId: userId },
  include: {
    referee: { select: { id: true, realName: true } },
    referrer: { select: { id: true, realName: true } }
  }
});
```

### 變更 5: 提領操作

**原方案（KV Store）：**
```typescript
// ❌ 手動樂觀鎖，複雜
let retries = 3;
while (retries > 0) {
  const profile = await kv.get(`user:${userId}:profile`);
  const updated = await kv.compareAndSwap(...);
  if (updated) break;
  retries--;
}
```

**新方案（PostgreSQL）：**
```typescript
// ✅ Transaction 自動處理
await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (user.pointBalance < amount + 15) throw new Error('餘額不足');
  
  await tx.user.update({
    where: { id: userId },
    data: { pointBalance: { decrement: amount + 15 } }
  });
  
  await tx.withdrawal.create({ data: { userId, amount, ... } });
});
```

---

## 📊 工時變更明細

| Phase | 原工時 | 新工時 | 節省 | 原因 |
|-------|-------|-------|------|------|
| Phase 1 | 60h | 50h | -10h | Prisma 自動生成 ORM，減少手動實作 |
| Phase 2 | 80h | 75h | -5h | ORM 簡化 CRUD 操作 |
| Phase 3 | 70h | 60h | -10h | PostgreSQL Function 自動計算狀態 |
| Phase 4 | 60h | 50h | -10h | JOIN 查詢取代多次讀取 |
| Phase 5 | 80h | 65h | -15h | 批次 UPDATE 取代逐筆處理 |
| Phase 6 | 30h | 25h | -5h | 原子操作簡化實作 |
| Phase 7 | 20h | 15h | -5h | Transaction 取代手動鎖 |
| Phase 8 | 40h | 40h | 0h | 測試工時不變 |
| **總計** | **440h** | **380h** | **-60h** | **-13.6%** |

---

## 📁 新增/修改的文件

### 新增文件

1. ✅ `/documents/PART3_POSTGRESQL_SCHEMA.md`
   - 完整的 PostgreSQL Schema 設計
   - SQL 定義 + Prisma Schema
   - 查詢範例與最佳實踐

2. ✅ `/documents/POSTGRESQL_MIGRATION_SUMMARY.md`
   - PostgreSQL 架構遷移摘要
   - 技術對比與優勢說明
   - 實作變更指南

3. ✅ `/documents/UPDATE_TO_POSTGRESQL.md`
   - 本文件，更新總結

### 修改文件

1. ✅ `/documents/NEW_SPEC_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` (v1.2)
   - Executive Summary 新增架構變更說明
   - Part 1 後端架構更新為 PostgreSQL
   - Part 5 Phase 總覽更新工時
   - Phase 1 實作內容更新為 Prisma

---

## 🔍 技術細節補充

### Prisma 設定（Deno 環境）

```typescript
// /supabase/functions/server/db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: Deno.env.get('DATABASE_URL'),
  log: ['query', 'error', 'warn'],
});

export default prisma;
```

### Migration 流程

```bash
# 1. 創建 Migration
npx prisma migrate dev --name init

# 2. 生成 Prisma Client
npx prisma generate

# 3. 部署到生產環境
npx prisma migrate deploy
```

### 環境變數

```env
# .env
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
```

---

## ✅ 檢查清單

計畫書更新完成度：

- [x] 文件版本號更新（v1.2）
- [x] 更新記錄添加
- [x] Executive Summary 新增架構變更說明
- [x] Part 1 後端架構更新
- [x] Part 3 完全重寫為 PostgreSQL Schema
- [x] Part 5 Phase 總覽更新工時
- [x] Phase 1-7 實作內容更新
- [x] 創建獨立 Schema 文件
- [x] 創建遷移摘要文件
- [x] 創建更新總結文件

**狀態：** ✅ 所有更新完成

---

## 🎯 下一步行動

### 立即可執行

1. ✅ **審查計畫書：** 確認 PostgreSQL 架構符合需求
2. ✅ **審查 Schema：** 檢查 9 張資料表設計
3. ⏭️ **開始 Phase 1：** 建立 Prisma Schema + Migration

### Phase 1 具體步驟

```bash
# 1. 初始化 Prisma
cd /supabase/functions/server
npx prisma init

# 2. 編寫 schema.prisma（參考 PART3_POSTGRESQL_SCHEMA.md）

# 3. 創建 Migration
npx prisma migrate dev --name initial_schema

# 4. 生成 Prisma Client
npx prisma generate

# 5. 測試連線
npx prisma studio  # 打開資料庫管理介面
```

---

## 📄 相關文件連結

| 文件 | 用途 |
|------|------|
| `/documents/NEW_SPEC_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` (v1.2) | 主計畫書 |
| `/documents/PART3_POSTGRESQL_SCHEMA.md` | 完整 Schema 設計 |
| `/documents/POSTGRESQL_MIGRATION_SUMMARY.md` | 遷移摘要 |
| `/documents/SPEC_UPDATE_EMAIL_VERIFICATION.md` | Email 驗證機制說明 |
| `/documents/UPDATE_SUMMARY.md` | Email 驗證更新摘要 |

---

## 💬 總結

**✅ 計畫書已完成 PostgreSQL 架構更新！**

**主要優勢：**
1. ✅ SSOT 自動保證（外鍵約束）
2. ✅ ACID 保證（Transaction）
3. ✅ 查詢效能提升（JOIN + 索引）
4. ✅ 開發效率提升（Prisma ORM）
5. ✅ 工時減少 13.6%（60 小時）

**技術風險：** 極低（標準 SQL + 成熟 ORM）

**狀態：** ✅ 準備開始 Phase 1 實作

---

**如有任何疑問或需要調整，請隨時提出！** 🚀
