# 🔧 修復部署路徑錯誤

## ❌ 錯誤訊息

```
WARN: failed to read file: open supabase/functions/make-server-5c6718b9/index.ts: no such file or directory
unexpected deploy status 400: {"message":"Entrypoint path does not exist"}
```

## 🔍 問題原因

1. **在錯誤的目錄執行命令**
   - ❌ 在 `Uknow\src` 執行 → 找不到 `supabase/` 目錄
   - ✅ 必須在 `Uknow` 根目錄執行

2. **入口文件使用相對導入**
   - 舊的 `index.ts` 使用 `export { default } from '../server/index.tsx'`
   - Supabase CLI 打包時無法正確解析

## ✅ 解決方案（已完成）

我已經為您：
1. ✅ 創建了完整的獨立入口文件
2. ✅ 移除了相對導入依賴
3. ✅ 所有路由都直接在入口文件中定義

---

## 🚀 現在請重新部署

### 步驟 1：確認在正確的目錄

**Windows PowerShell：**
```powershell
# 查看當前目錄
pwd

# 應該看到類似：
# Path
# ----
# C:\...\Uknow

# 如果不是，請切換到專案根目錄
cd C:\path\to\Uknow
```

**Mac/Linux：**
```bash
# 查看當前目錄
pwd

# 應該看到：
# /path/to/Uknow

# 如果不是，請切換到專案根目錄
cd /path/to/Uknow
```

**確認方法：**
```bash
# 列出目錄內容
ls

# 應該看到：
# supabase/
# src/
# package.json
# ...
```

---

### 步驟 2：執行部署命令

```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt --project-ref uhtwwxtazwqnlbejhprl
```

**注意：** 必須在 `Uknow` 根目錄執行，不是在 `Uknow\src`！

---

## ✅ 期望看到的成功訊息

```
Deploying function make-server-5c6718b9
Bundling function...
✔ Function deployed successfully

Function URL: https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9
```

---

## 📊 部署後驗證

### 1. 查看日誌

```bash
supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
```

**期望看到：**
```
✅ Uknow Platform API Server V2 starting...
✅ Route prefix: /make-server-5c6718b9
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

**期望響應：**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-12-21T..."
}
```

### 3. 測試 Listings API

```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
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

## 🔧 常見問題排查

### 問題 1：仍然提示找不到文件

```
WARN: failed to read file: open supabase/functions/make-server-5c6718b9/index.ts
```

**檢查清單：**

1. **確認當前目錄**
   ```bash
   pwd
   # 必須是專案根目錄（包含 supabase/ 目錄）
   ```

2. **確認文件存在**
   ```bash
   # Windows
   dir supabase\functions\make-server-5c6718b9\index.ts
   
   # Mac/Linux
   ls -la supabase/functions/make-server-5c6718b9/index.ts
   ```

3. **確認文件不是空的**
   ```bash
   # Windows
   type supabase\functions\make-server-5c6718b9\index.ts | more
   
   # Mac/Linux
   head -20 supabase/functions/make-server-5c6718b9/index.ts
   ```

### 問題 2：部署成功但函數無法訪問

**可能原因：**
- 函數正在啟動（需要等待 1-2 分鐘）
- 環境變量未設置

**解決方案：**

1. **等待函數完全啟動**
   ```bash
   # 持續監控日誌
   supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl --tail
   ```

2. **確認環境變量**
   - Dashboard → Edge Functions → Settings → Manage secrets
   - 必須有 4 個變量：
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `DATABASE_URL`

3. **重新部署**
   ```bash
   supabase functions deploy make-server-5c6718b9 --no-verify-jwt --project-ref uhtwwxtazwqnlbejhprl
   ```

### 問題 3：Health Check 返回 500 錯誤

**查看詳細錯誤：**
```bash
supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
```

**常見原因：**

1. **資料庫連接失敗**
   - 檢查 `DATABASE_URL` 是否正確
   - 格式：`postgresql://postgres.uhtwwxtazwqnlbejhprl:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
   - 必須使用 **Pooler** 模式（不是 Direct）

2. **環境變量缺失**
   - 確認所有 4 個變量都已設置
   - 確認變量值沒有多餘的空格或引號

3. **資料庫表不存在**
   - 執行 `/CLEAN_DATABASE.sql` 和 `/CREATE_DATABASE.sql`
   - 確認 6 個表都已創建

### 問題 4：Docker 警告

```
WARNING: Docker is not running
```

**這是正常的！**
- Supabase CLI 會嘗試使用 Docker 進行本地測試
- 但部署到雲端不需要 Docker
- 可以安全忽略此警告

---

## 📝 目錄結構說明

**正確的專案結構：**

```
Uknow/                          ← 必須在這個目錄執行命令
├── supabase/
│   ├── config.toml             ← CLI 配置文件
│   └── functions/
│       ├── make-server-5c6718b9/
│       │   ├── index.ts        ← 入口文件（已修復）
│       │   └── deno.json       ← Deno 配置
│       └── server/
│           ├── index.tsx       ← 舊的入口（不再使用）
│           ├── auth_v2.ts
│           ├── listings_v2.ts
│           └── ...             ← 所有路由模塊
├── src/                        ← 前端代碼
│   ├── App.tsx
│   └── ...
└── package.json
```

**為什麼需要兩個目錄？**
- `make-server-5c6718b9/` - CLI 部署的入口點
- `server/` - 實際的業務邏輯代碼

---

## 🎯 快速檢查清單

**部署前確認：**

- [ ] 當前目錄是 `Uknow`（專案根目錄）
- [ ] 執行 `ls` 能看到 `supabase/` 目錄
- [ ] 執行 `ls supabase/functions/make-server-5c6718b9/` 能看到 `index.ts`
- [ ] 已設置 4 個環境變量（在 Dashboard）
- [ ] 已創建資料庫表（執行過 SQL 腳本）

**部署後確認：**

- [ ] 部署命令顯示 "Function deployed successfully"
- [ ] 日誌顯示 "PostgreSQL connection successful"
- [ ] Health Check 返回 `{"status":"ok"}`
- [ ] Listings API 返回 `{"success":true}`

---

## 🎉 部署成功後的下一步

1. **訪問前端首頁**
   - 在 Figma Make 打開您的應用

2. **測試註冊流程**
   - 點擊「註冊」
   - 完成 4 步驟註冊

3. **創建服務者刊登**
   - 登入後訪問「我的帳戶」
   - 建立第一個刊登

4. **測試推薦系統**
   - 獲取推薦碼
   - 用另一個瀏覽器註冊新用戶

---

## 📞 仍然遇到問題？

請提供以下資訊：

1. **當前目錄**
   ```bash
   pwd
   ```

2. **目錄內容**
   ```bash
   ls
   ls supabase/functions/
   ```

3. **完整的部署錯誤訊息**
   ```bash
   supabase functions deploy make-server-5c6718b9 --no-verify-jwt --project-ref uhtwwxtazwqnlbejhprl --debug
   ```

4. **函數日誌**（如果已部署）
   ```bash
   supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
   ```

我會立即幫您解決！

---

**創建時間：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl  
**修復內容：** 入口文件路徑和相對導入問題
