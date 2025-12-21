# 🚀 Supabase Edge Functions 部署步驟

**目的：** 將重構後的 V2 API 部署到 Supabase Edge Functions  
**狀態：** 代碼已準備就緒，等待部署

---

## 📋 前置需求

### 1. 獲取專案資訊

在部署前，您需要知道：

- **Project Reference ID** - 在 Supabase Dashboard 可以找到
  - 格式：`abcdefghijklmnop`（16 字符）
  - 位置：Dashboard → Project Settings → General → Reference ID

- **Access Token** - 用於 CLI 認證
  - 位置：Dashboard → Account → Access Tokens
  - 創建新 Token 或使用現有的

---

## 🚀 方案 A：使用 Supabase CLI（推薦）

### 步驟 1：安裝 Supabase CLI

**macOS / Linux：**
```bash
npm install -g supabase
```

**或使用 Homebrew (macOS)：**
```bash
brew install supabase/tap/supabase
```

**Windows：**
```bash
npm install -g supabase
```

**驗證安裝：**
```bash
supabase --version
```

應該看到版本號，例如：`supabase 1.x.x`

---

### 步驟 2：登入 Supabase

```bash
supabase login
```

這會打開瀏覽器讓您登入 Supabase 帳戶。

**或使用 Access Token 登入：**
```bash
supabase login --token YOUR_ACCESS_TOKEN
```

---

### 步驟 3：連接到專案

```bash
# 替換 YOUR_PROJECT_REF 為您的 Project Reference ID
supabase link --project-ref YOUR_PROJECT_REF
```

**示例：**
```bash
supabase link --project-ref abcdefghijklmnop
```

---

### 步驟 4：部署 Edge Function

**完整部署（推薦）：**
```bash
# 從專案根目錄執行
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

**如果需要指定專案：**
```bash
supabase functions deploy make-server-5c6718b9 --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

---

### 步驟 5：查看部署日誌

```bash
# 實時查看日誌
supabase functions logs make-server-5c6718b9 --tail

# 查看最近的日誌
supabase functions logs make-server-5c6718b9
```

---

### 步驟 6：驗證部署成功

**1. 檢查 Health Check：**
```bash
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

**2. 測試刊登列表 API：**
```bash
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
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

## 🌐 方案 B：使用 Supabase Dashboard

如果您不想使用 CLI，可以通過 Dashboard 部署：

### 步驟 1：準備部署包

**1. 壓縮整個 server 目錄：**

```bash
# 在專案根目錄執行
cd supabase/functions
zip -r server.zip server/
```

**或手動：**
- 右鍵點擊 `supabase/functions/server` 文件夾
- 選擇「壓縮」創建 `server.zip`

---

### 步驟 2：使用 Dashboard 上傳

1. **訪問 Supabase Dashboard**
   - https://supabase.com/dashboard

2. **選擇您的專案**

3. **進入 Edge Functions 頁面**
   - 左側選單 → `Edge Functions`

4. **部署函數**
   - 如果函數已存在：
     - 找到 `make-server-5c6718b9`
     - 點擊右側 `...` 選單
     - 選擇 **"Deploy new version"**
   
   - 如果函數不存在：
     - 點擊 **"Create a new function"**
     - 函數名稱：`make-server-5c6718b9`
     - 上傳 `server.zip`

5. **設置環境變量（如果尚未設置）**
   - 在函數設置中找到 "Environment Variables"
   - 確保以下變量已設置：
     ```
     SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     SUPABASE_ANON_KEY=your_anon_key
     DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
     ```

6. **等待部署完成**
   - 通常需要 1-2 分鐘

---

### 步驟 3：檢查部署狀態

1. **查看日誌**
   - 在 Edge Functions 頁面
   - 點擊 `make-server-5c6718b9`
   - 切換到 `Logs` 標籤

2. **期望看到：**
   ```
   ✅ [Database] ✅ Supabase Client initialized
   ✅ [Database] ✅ Postgres Client initialized
   ✅ PostgreSQL connection successful
   ```

3. **不應該看到：**
   ```
   ❌ Prisma
   ❌ @prisma/client
   ❌ worker boot error
   ```

---

## 🔧 常見問題排查

### Q1: 找不到 PROJECT_REF？

**解決方案：**
1. 訪問 Supabase Dashboard
2. 選擇專案
3. 點擊左下角 `Project Settings`（齒輪圖標）
4. 選擇 `General` 標籤
5. 複製 `Reference ID`

---

### Q2: DATABASE_URL 如何獲取？

**解決方案：**
1. 在 Supabase Dashboard
2. Project Settings → Database
3. 找到 `Connection String`
4. 選擇 `URI` 格式
5. 複製並替換 `[YOUR-PASSWORD]` 為您的資料庫密碼

**格式：**
```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

---

### Q3: 部署後仍然看到 Prisma 錯誤？

**解決方案：**

1. **強制重新部署：**
   ```bash
   supabase functions delete make-server-5c6718b9
   supabase functions deploy make-server-5c6718b9 --no-verify-jwt
   ```

2. **清除瀏覽器緩存：**
   - 前端可能緩存了舊的錯誤訊息
   - 硬重新整理：`Ctrl+Shift+R` (Windows) 或 `Cmd+Shift+R` (Mac)

3. **檢查環境變量：**
   - 確保 `DATABASE_URL` 正確設置

---

### Q4: 如何查看詳細錯誤日誌？

**CLI 方式：**
```bash
# 實時日誌（推薦）
supabase functions logs make-server-5c6718b9 --tail

# 最近 100 條日誌
supabase functions logs make-server-5c6718b9 --limit 100
```

**Dashboard 方式：**
1. Edge Functions → make-server-5c6718b9
2. 切換到 `Logs` 標籤
3. 選擇時間範圍查看

---

## ✅ 部署成功驗證清單

完成以下所有項目確認部署成功：

- [ ] Edge Function 啟動無錯誤
- [ ] 日誌顯示 `✅ Supabase Client initialized`
- [ ] 日誌顯示 `✅ Postgres Client initialized`
- [ ] 日誌顯示 `✅ PostgreSQL connection successful`
- [ ] Health Check 返回 `{"status": "ok"}`
- [ ] Listings API 返回正確格式
- [ ] 前端首頁可以載入刊登列表
- [ ] 無 Prisma 相關錯誤

---

## 🎯 快速部署指令（CLI）

如果您已經設置好 CLI，只需執行：

```bash
# 1. 登入（如果尚未登入）
supabase login

# 2. 連接專案（如果尚未連接）
supabase link --project-ref YOUR_PROJECT_REF

# 3. 部署
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 4. 查看日誌
supabase functions logs make-server-5c6718b9 --tail

# 5. 測試（替換 YOUR_PROJECT_REF）
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-5c6718b9/health
```

---

## 📞 需要幫助？

如果遇到問題：

1. **查看完整錯誤日誌**
   ```bash
   supabase functions logs make-server-5c6718b9 --limit 100
   ```

2. **檢查���境變量**
   - Dashboard → Edge Functions → make-server-5c6718b9 → Settings → Environment Variables

3. **驗證代碼無 Prisma**
   ```bash
   bash scripts/verify-no-prisma.sh
   ```

4. **提供資訊：**
   - Project Reference ID
   - 完整錯誤日誌
   - 部署時間

---

**最後更新：** 2024-12-21  
**狀態：** 等待部署
