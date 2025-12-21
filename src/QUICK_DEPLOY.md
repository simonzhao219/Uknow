# ⚡ 快速部署指南（5 分鐘）

## 🎯 最快速的部署方式

### 選項 1：Supabase CLI（推薦）⭐

```bash
# 第一次部署需要執行以下步驟：

# 1. 安裝 CLI
npm install -g supabase

# 2. 登入
supabase login

# 3. 連接專案（替換 YOUR_PROJECT_REF）
supabase link --project-ref YOUR_PROJECT_REF

# 4. 部署
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 5. 查看日誌確認成功
supabase functions logs make-server-5c6718b9 --tail
```

**之後每次部署只需執行：**
```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

---

### 選項 2：Supabase Dashboard（無需安裝）⭐

1. **訪問：** https://supabase.com/dashboard
2. **選擇專案**
3. **左側選單** → `Edge Functions`
4. **找到** `make-server-5c6718b9`
5. **點擊** `...` → **"Redeploy"** 或 **"Deploy new version"**
6. **等待** 1-2 分鐘
7. **查看** `Logs` 標籤確認成功

---

## ✅ 驗證部署成功

**1. 在瀏覽器訪問：**
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-5c6718b9/health
```

**應該看到：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

**2. 測試首頁 API：**
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

**應該看到：**
```json
{
  "success": true,
  "listings": [],
  "total": 0
}
```

---

## 🔍 在哪裡找到 PROJECT_REF？

1. 訪問 Supabase Dashboard
2. 選擇專案
3. 點擊左下角 ⚙️ `Project Settings`
4. 選擇 `General` 標籤
5. 複製 `Reference ID`（16 個字符）

---

## 🚨 如果還有問題？

**查看錯誤日誌：**

**CLI：**
```bash
supabase functions logs make-server-5c6718b9 --tail
```

**Dashboard：**
- Edge Functions → make-server-5c6718b9 → Logs 標籤

**期望看到：**
```
✅ [Database] ✅ Supabase Client initialized
✅ [Database] ✅ Postgres Client initialized
✅ PostgreSQL connection successful
```

**不應該看到：**
```
❌ Prisma
❌ @prisma/client
❌ worker boot error
```

---

## 📚 詳細文檔

如需更多資訊，請查看：
- `/DEPLOYMENT_STEPS.md` - 完整部署步驟
- `/documents/DEPLOYMENT_FIX_GUIDE.md` - 問題排查指南
- `/documents/ERROR_FIX_SUMMARY.md` - 錯誤修復總結

---

**預計部署時間：** 5-10 分鐘  
**難度：** ⭐⭐☆☆☆（簡單）
