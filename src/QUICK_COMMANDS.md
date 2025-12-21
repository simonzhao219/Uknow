# 🚀 快速部署命令（複製貼上版）

## 📋 前置檢查

```bash
# 1. 確認 Node.js 已安裝
node --version

# 2. 確認 npm 已安裝
npm --version
```

---

## ⚡ 5 分鐘快速部署

### 步驟 1：安裝 Supabase CLI

```bash
npm install -g supabase
```

### 步驟 2：驗證安裝

```bash
supabase --version
```

### 步驟 3：登入

```bash
supabase login
```

### 步驟 4：連接專案

```bash
supabase link --project-ref uhtwwxtazwqnlbejhprl
```

**（會提示輸入資料庫密碼）**

### 步驟 5：部署

```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

### 步驟 6：查看日誌

```bash
supabase functions logs make-server-5c6718b9
```

---

## ✅ 驗證命令

### 測試 Health Check

**瀏覽器訪問：**
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**或使用 curl：**
```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

### 測試 Listings API

```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

---

## 🔧 常用命令

### 查看所有函數

```bash
supabase functions list
```

### 查看即時日誌（持續監控）

```bash
supabase functions logs make-server-5c6718b9 --tail
```

### 重新部署

```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

### 刪除函數（小心使用！）

```bash
supabase functions delete make-server-5c6718b9
```

### 登出

```bash
supabase logout
```

---

## 🗄️ 資料庫命令

### 連接到資料庫

```bash
supabase db remote --project-ref uhtwwxtazwqnlbejhprl
```

### 查看表結構

```sql
\dt
```

### 查看用戶數量

```sql
SELECT COUNT(*) FROM public.users;
```

### 查看刊登數量

```sql
SELECT COUNT(*) FROM public.listings;
```

---

## 📊 監控命令

### 查看函數狀態

```bash
supabase functions list
```

### 查看最近 50 條日誌

```bash
supabase functions logs make-server-5c6718b9 --limit 50
```

### 查看錯誤日誌

```bash
supabase functions logs make-server-5c6718b9 | grep ERROR
```

---

## 🆘 故障排查命令

### 檢查專案連接

```bash
supabase projects list
```

### 重新連接專案

```bash
supabase link --project-ref uhtwwxtazwqnlbejhprl
```

### 檢查環境變量

**在 Dashboard：**
Edge Functions → Settings → Manage secrets

### 測試資料庫連接

**在 Dashboard：**
SQL Editor → New Query → 輸入：
```sql
SELECT NOW();
```

---

## 🎯 一鍵完整部署（PowerShell/Bash）

### PowerShell (Windows)

將以下內容保存為 `deploy.ps1`：

```powershell
# Uknow 快速部署腳本

Write-Host "🚀 開始部署 Uknow 平台..." -ForegroundColor Green

# 檢查 CLI
Write-Host "`n檢查 Supabase CLI..." -ForegroundColor Yellow
supabase --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CLI 未安裝，正在安裝..." -ForegroundColor Red
    npm install -g supabase
}

# 連接專案
Write-Host "`n連接到專案..." -ForegroundColor Yellow
supabase link --project-ref uhtwwxtazwqnlbejhprl

# 部署函數
Write-Host "`n部署 Edge Function..." -ForegroundColor Yellow
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 等待啟動
Write-Host "`n等待函數啟動（10秒）..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 測試 Health Check
Write-Host "`n測試 Health Check..." -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health"
Write-Host $response.Content -ForegroundColor Cyan

Write-Host "`n✅ 部署完成！" -ForegroundColor Green
```

**執行：**
```powershell
.\deploy.ps1
```

### Bash (Mac/Linux)

將以下內容保存為 `deploy.sh`：

```bash
#!/bin/bash

# Uknow 快速部署腳本

echo "🚀 開始部署 Uknow 平台..."

# 檢查 CLI
echo -e "\n檢查 Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    echo "❌ CLI 未安裝，正在安裝..."
    npm install -g supabase
fi

# 連接專案
echo -e "\n連接到專案..."
supabase link --project-ref uhtwwxtazwqnlbejhprl

# 部署函數
echo -e "\n部署 Edge Function..."
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 等待啟動
echo -e "\n等待函數啟動（10秒）..."
sleep 10

# 測試 Health Check
echo -e "\n測試 Health Check..."
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health

echo -e "\n✅ 部署完成！"
```

**執行：**
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 📝 環境變量清單（Dashboard 設置）

**位置：** Edge Functions → Settings → Manage secrets

```
SUPABASE_URL=https://uhtwwxtazwqnlbejhprl.supabase.co

SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（從 Dashboard 複製）

SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（從 Dashboard 複製）

DATABASE_URL=postgresql://postgres.uhtwwxtazwqnlbejhprl:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

---

## 🎯 關鍵 URL

| 用途 | URL |
|------|-----|
| Dashboard | https://supabase.com/dashboard |
| 專案設置 | https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/settings/general |
| Edge Functions | https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions |
| SQL Editor | https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/sql/new |
| Health Check | https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health |

---

**最後更新：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl
