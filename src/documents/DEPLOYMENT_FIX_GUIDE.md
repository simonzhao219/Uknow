# 🔧 部署問題修復指南

**問題：** Supabase Edge Function 編譯緩存包含舊的 Prisma 代碼  
**錯誤：** `The requested module 'npm:@prisma/client@5.8.0' does not provide an export named 'PrismaClient'`  
**日期：** 2024-12-21

---

## 🎯 問題分析

### 錯誤信息
```
worker boot error: Uncaught SyntaxError: 
The requested module 'npm:@prisma/client@5.8.0' does not provide an export named 'PrismaClient'
at file:///var/tmp/sb-compile-edge-runtime/source/db.ts:9:14
```

### 根本原因
1. ✅ **代碼已完全重構** - 所有 Prisma 調用已移除
2. ❌ **編譯緩存未清除** - Supabase 編譯緩存 (`sb-compile-edge-runtime`) 保留舊代碼
3. 🔄 **需要強制重新編譯** - 觸發 Supabase 重新編譯所有代碼

---

## ✅ 修復方案

### 方案 1：Supabase CLI 重新部署（推薦）⭐⭐⭐

**步驟：**

1. **安裝 Supabase CLI（如果尚未安裝）**
```bash
npm install -g supabase
```

2. **登入 Supabase**
```bash
supabase login
```

3. **連接到專案**
```bash
supabase link --project-ref [YOUR_PROJECT_REF]
```

4. **強制重新部署 Edge Function**
```bash
# 清除緩存並重新部署
supabase functions deploy --no-verify-jwt

# 或指定特定函數
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

5. **驗證部署**
```bash
# 檢查日誌
supabase functions logs make-server-5c6718b9
```

---

### 方案 2：Supabase Dashboard 重新部署 ⭐⭐

**步驟：**

1. 訪問 Supabase Dashboard
2. 進入 `Edge Functions` 頁面
3. 找到 `make-server-5c6718b9` 函數
4. 點擊 **"Redeploy"** 或 **"Deploy"** 按鈕
5. 等待部署完成（約 1-2 分鐘）
6. 檢查日誌確認無錯誤

---

### 方案 3：手動清除緩存（進階）⭐

**如果上述方案都不行，嘗試：**

1. **修改任意源文件觸發重新編譯**
   - 在 `index.tsx` 添加註釋或修改版本號
   - 提交更改
   - 推送到 Git（如果使用 Git 部署）

2. **刪除並重新創建 Edge Function**
   - 在 Dashboard 刪除函數
   - 重新部署函數

---

## 🔍 驗證步驟

### 1. 檢查 Edge Function 日誌

```bash
# CLI 方式
supabase functions logs make-server-5c6718b9 --tail

# Dashboard 方式
進入 Edge Functions → make-server-5c6718b9 → Logs
```

**期望看到：**
```
[Database] ✅ Supabase Client initialized
[Database] ✅ Postgres Client initialized
✅ PostgreSQL connection successful
```

**不應該看到：**
```
❌ Prisma
❌ @prisma/client
❌ PrismaClient
```

---

### 2. 測試 Health Check 端點

```bash
curl https://[PROJECT_ID].supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

---

### 3. 測試首頁刊登列表

```bash
curl https://[PROJECT_ID].supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

**期望響應：**
```json
{
  "success": true,
  "listings": [...],
  "total": 0
}
```

---

## 📝 已完成的重構清單

### ✅ 已移除 Prisma 的文件（12 個）

1. ✅ `db.ts` - 數據訪問層
2. ✅ `listings_v2.ts` - 刊登管理
3. ✅ `profile_v2.ts` - 用戶資料
4. ✅ `subscriptions_v2.ts` - 訂閱管理
5. ✅ `utils/subscriptionStatus.ts` - 狀態管理
6. ✅ `auth_v2.ts` - 註冊系統
7. ✅ `referrals_v2.ts` - 推薦系統
8. ✅ `rewards_v2.ts` - 獎勵系統
9. ✅ `withdrawals_v2.ts` - 提領系統
10. ✅ `tasks_v2.ts` - 任務系統
11. ✅ `cron_v2.ts` - 排程系統
12. ✅ `cron/dailyRewardIssuance.ts` - 獎勵發放

### ✅ 已添加版本標記

- ✅ `index.tsx` - 添加版本註釋（V2 - Prisma Removed）
- ✅ `db.ts` - 添加版本標記（Version 2.0.0）

---

## 🚨 常見問題

### Q1: 為什麼我的代碼已經沒有 Prisma 了還報錯？

**A:** Supabase 使用編譯緩存。舊代碼可能還在緩存中。需要強制重新部署。

---

### Q2: 重新部署後還是失敗怎麼辦？

**A:** 檢查以下項目：
1. 確認 `DATABASE_URL` 環境變量已設置
2. 確認 `SUPABASE_SERVICE_ROLE_KEY` 環境變量已設置
3. 檢查 PostgreSQL 數據庫是否可訪問
4. 查看詳細錯誤日誌

---

### Q3: 如何確認 Prisma 真的被移除了？

**A:** 搜索所有源文件：
```bash
# 在專案根目錄執行
grep -r "@prisma/client" supabase/functions/server/
grep -r "PrismaClient" supabase/functions/server/
```

應該返回：**沒有結果**（或只有註釋中的提及）

---

## 🎯 部署後驗證清單

- [ ] Edge Function 啟動成功（無錯誤日誌）
- [ ] Health Check 端點返回 `{"status": "ok"}`
- [ ] Database 連接成功（日誌顯示 ✅ PostgreSQL connection successful）
- [ ] 首頁可以載入刊登列表
- [ ] 無 Prisma 相關錯誤

---

## 📞 如果還有問題

1. **查看 Edge Function 日誌**
   ```bash
   supabase functions logs make-server-5c6718b9 --tail
   ```

2. **檢查環境變量**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`
   - `SUPABASE_ANON_KEY`

3. **聯繫支援**
   - 提供完整錯誤日誌
   - 提供部署時間
   - 提供 Project ID

---

**最後更新：** 2024-12-21  
**狀態：** 代碼重構完成，等待部署驗證
