# 🔧 Figma Deploy 400 錯誤修復方案

## 問題分析

**錯誤訊息：**
```
POST https://www.figma.com/api/integrations/supabase/.../edge_functions/make-server/deploy 400 (Bad Request)
```

**根本原因：**
- Figma Make 的 Supabase 部署功能嘗試部署到固定名稱 `make-server`
- 我們的實際函數名是 `make-server-5c6718b9`
- 名稱不匹配導致 400 錯誤

---

## ✅ 已實施的修復

### 1. 創建 Figma Make 別名函數
- **文件：** `/supabase/functions/make-server/index.ts`
- **作用：** 讓 Figma Deploy 可以部署到 `make-server`
- **內容：** 轉發到實際的 `make-server-5c6718b9` 邏輯

### 2. 配置 Deno
- **文件：** `/supabase/functions/make-server/deno.json`
- **作用：** 配置必要的導入映射

---

## 🚀 解決方案（3 種選擇）

### 🎯 方案 1：Figma Make 重試（現在應該可以了）

1. **再次點擊 "Supabase Deploy" 按鈕**
2. **等待 2-3 分鐘**
3. **檢查結果**

**成功後：**
- Figma 會部署到 `make-server` 函數
- 前端需要更新 API 端點從 `make-server-5c6718b9` 改為 `make-server`

**如果仍然失敗** → 使用方案 2

---

### ⭐ 方案 2：使用 Supabase CLI（最推薦）⭐⭐⭐

這是**最可靠**的方式，完全繞過 Figma Make 的限制。

#### 步驟：

**1. 安裝 Supabase CLI**
```bash
npm install -g supabase
```

**2. 登入 Supabase**
```bash
supabase login
```
（會打開瀏覽器讓您登入）

**3. 連接到專案**
```bash
supabase link --project-ref uhtwwxtazwqnlbejhprl
```

**4. 部署函數**
```bash
# 部署主函數（推薦）
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 或部署 Figma 別名函數
supabase functions deploy make-server --no-verify-jwt

# 或同時部署兩個
supabase functions deploy make-server-5c6718b9 --no-verify-jwt && \
supabase functions deploy make-server --no-verify-jwt
```

**5. 查看日誌確認成功**
```bash
supabase functions logs make-server-5c6718b9 --tail
```

**期望看到：**
```
✅ [Database] ✅ Supabase Client initialized
✅ [Database] ✅ Postgres Client initialized
✅ PostgreSQL connection successful
```

---

### 🌐 方案 3：使用 Supabase Dashboard

1. **訪問** https://supabase.com/dashboard
2. **選擇專案** uhtwwxtazwqnlbejhprl
3. **左側選單** → Edge Functions
4. **部署選項：**
   - 如果函數已存在：點擊 `...` → "Redeploy"
   - 如果函數不存在：點擊 "New Function" → 命名為 `make-server` 或 `make-server-5c6718b9`

---

## 🔄 部署後需要做什麼？

### 選項 A：如果部署到 `make-server`

**需要更新前端 API 端點：**

修改 `/utils/apiClient.ts` 的 `buildApiUrl` 函數：

```typescript
export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // 從 make-server-5c6718b9 改為 make-server
  return `https://${projectId}.supabase.co/functions/v1/make-server${cleanPath}`;
}
```

### 選項 B：如果部署到 `make-server-5c6718b9`

**不需要修改前端**，API 端點已經正確配置。

---

## ✅ 驗證部署成功

### 1. Health Check

**如果部署到 `make-server`：**
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server/health
```

**如果部署到 `make-server-5c6718b9`：**
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

### 2. 測試 Listings API

**如果部署到 `make-server`：**
```
https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server/listings-v2/active
```

**如果部署到 `make-server-5c6718b9`：**
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

## 🎯 推薦的部署策略

### 方案：同時部署兩個函數（最佳）⭐⭐⭐⭐⭐

**優點：**
- ✅ Figma Make 部署按鈕可以工作（部署 `make-server`）
- ✅ CLI 部署也可以工作（部署 `make-server-5c6718b9`）
- ✅ 兩個函數共享相同的代碼邏輯
- ✅ 無需修改前端（繼續使用 `make-server-5c6718b9`）

**執行：**
```bash
# 部署兩個函數
supabase functions deploy make-server --no-verify-jwt
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 查看兩個函數的狀態
supabase functions list
```

**結果：**
```
make-server           deployed  2024-12-21
make-server-5c6718b9  deployed  2024-12-21
```

---

## 🔍 為什麼 Figma Deploy 失敗？

### Figma Make 的限制：

1. **固定函數名稱**
   - Figma Make 只支持部署到 `make-server`
   - 無法自定義函數名稱

2. **簡單專案結構**
   - 期望 `/supabase/functions/make-server/index.ts`
   - 我們的結構較複雜（多文件、子模塊）

3. **配置限制**
   - 缺少某些 Figma 期望的配置文件
   - 部署 API 可能有特殊要求

### 為什麼 CLI 更可靠？

- ✅ 完全控制函數名稱
- ✅ 支持複雜的專案結構
- ✅ 詳細的錯誤訊息和日誌
- ✅ 支持環境變量配置
- ✅ 可以部署多個函數

---

## 📞 仍然遇到問題？

### CLI 部署錯誤排查

**問題 1：找不到 Supabase CLI**
```bash
# 確認安裝
supabase --version

# 如果沒有安裝
npm install -g supabase
```

**問題 2：登入失敗**
```bash
# 使用 Access Token 登入
supabase login --token YOUR_ACCESS_TOKEN

# Access Token 位置：
# Dashboard → Account → Access Tokens
```

**問題 3：連接專案失敗**
```bash
# 確認 Project Reference ID
supabase link --project-ref uhtwwxtazwqnlbejhprl

# 如果失敗，檢查：
# 1. Project ID 是否正確
# 2. 是否有專案訪問權限
# 3. 網絡連接是否正常
```

**問題 4：部署失敗**
```bash
# 查看詳細錯誤
supabase functions deploy make-server --no-verify-jwt --debug

# 檢查環境變量是否設置
# Dashboard → Project Settings → Edge Functions → Environment Variables
```

---

## 🎊 快速開始（推薦流程）

**5 分鐘完成部署：**

```bash
# 1. 安裝 CLI
npm install -g supabase

# 2. 登入
supabase login

# 3. 連接專案
supabase link --project-ref uhtwwxtazwqnlbejhprl

# 4. 部署（選擇一個）
# 選項 A：部署主函數（推薦）
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 選項 B：部署 Figma 別名
supabase functions deploy make-server --no-verify-jwt

# 選項 C：同時部署兩個（最佳）
supabase functions deploy make-server --no-verify-jwt && \
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 5. 驗證
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

---

## 📚 相關文檔

- `/FIGMA_DEPLOY_FIX.md` - Figma Deploy 初步修復
- `/FIGMA_DEPLOY_TROUBLESHOOTING.md` - 完整故障排除
- `/QUICK_DEPLOY.md` - 快速部署指南
- `/DEPLOYMENT_STEPS.md` - 詳細部署步驟

---

**創建時間：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl  
**狀態：** ⚠️ Figma Deploy 受限，建議使用 CLI
