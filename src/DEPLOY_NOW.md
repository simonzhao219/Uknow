# 🚀 立即部署（一行命令）

## ⚡ 快速部署命令

**直接複製執行以下命令：**

```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt --project-ref uhtwwxtazwqnlbejhprl
```

---

## ✅ 期望看到的成功訊息

```
Deploying function make-server-5c6718b9
Bundling function...
✔ Function deployed successfully

Function URL: https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9
```

---

## 📊 部署後立即驗證

### 1. 查看日誌

```bash
supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
```

**期望看到：**
```
✅ [Database] ✅ Supabase Client initialized
✅ [Database] ✅ Postgres Client initialized
✅ PostgreSQL connection successful
✅ Storage Bucket 已存在: make-5c6718b9-listings-photos
```

### 2. 測試 Health Check

**瀏覽器訪問：**
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**或使用 curl：**
```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

### 3. 測試 Listings API

```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

**期望響應：**
```json
{
  "success": true,
  "listings": [],
  "total": 0
}
```

---

## 🎉 全部成功？

**恭喜！部署完成！**

現在您可以：
1. ✅ 訪問前端首頁測試
2. ✅ 註冊第一個用戶
3. ✅ 創建服務者刊登
4. ✅ 測試推薦系統

---

## ❌ 遇到錯誤？

### 錯誤 1：配置文件問題

```
failed to parse config: ...
```

**解決：** 已修復配置文件，重新執行部署命令即可。

### 錯誤 2：找不到專案

```
Error: Project ref not found
```

**解決：**
```bash
supabase link --project-ref uhtwwxtazwqnlbejhprl
```
然後重新部署。

### 錯誤 3：權限不足

```
Error: permission denied
```

**解決：**
```bash
supabase logout
supabase login
```
然後重新部署。

### 錯誤 4：Health Check 返回 500

**原因：** 環境變量未設置

**解決：**
1. Dashboard → Edge Functions → Settings → Manage secrets
2. 確認有 4 個變量：
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - DATABASE_URL
3. 如果缺少，請參考 `/COMPLETE_DEPLOYMENT_GUIDE.md` 步驟 2

---

## 📞 需要詳細指南？

**查看以下文件：**
- `/FIX_STEP_7_CLI_ERROR.md` - CLI 配置錯誤修復
- `/COMPLETE_DEPLOYMENT_GUIDE.md` - 完整部署流程
- `/QUICK_COMMANDS.md` - 所有常用命令

---

**準備好了？立即複製上面的部署命令執行！** 🚀
