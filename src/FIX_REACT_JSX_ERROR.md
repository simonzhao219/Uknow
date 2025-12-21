# 🔧 修復 React JSX Runtime 錯誤

## ❌ 錯誤訊息

```
Error: failed to create the graph

Caused by:
    Relative import path "react/jsx-runtime" not prefixed with / or ./ or ../ 
    and not in import map from "file:///.../kv_store.tsx"
```

## 🔍 問題根源

### 原因分析：

1. **`kv_store.tsx` 使用 `.tsx` 擴展名**
   - `.tsx` 通常用於 React/JSX 文件
   - 但這是一個後端工具文件，不包含任何 JSX 代碼

2. **`deno.json` 配置了 JSX 處理**
   ```json
   {
     "compilerOptions": {
       "jsx": "react-jsx",           ← 問題所在
       "jsxImportSource": "react"    ← 問題所在
     }
   }
   ```

3. **Deno 行為**
   - 看到 `.tsx` 文件 + JSX 配置
   - 自動嘗試導入 `react/jsx-runtime`
   - 但 import map 中沒有 React
   - 部署失敗

### 為什麼 `kv_store.tsx` 使用 `.tsx`？

這是 Figma Make 自動生成的受保護文件，使用 `.tsx` 擴展名是為了與前端代碼保持一致。但實際上它**不包含任何 JSX 代碼**，只是普通的 TypeScript。

---

## ✅ 解決方案（已完成）

### 修復內容：

移除了 `deno.json` 中的 JSX 配置：

**修改前：**
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",        ← 移除
    "jsxImportSource": "react" ← 移除
  },
  "imports": {
    ...
  }
}
```

**修改後：**
```json
{
  "imports": {
    "hono": "https://deno.land/x/hono@v4.3.11/mod.ts",
    "hono/": "https://deno.land/x/hono@v4.3.11/",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.39.0",
    "postgres": "https://deno.land/x/postgres@v0.17.0/mod.ts"
  }
}
```

### 為什麼這樣可行？

1. **後端不需要 React**
   - Edge Functions 是純後端代碼
   - 不需要渲染 JSX
   - 不需要 React runtime

2. **`.tsx` 不強制需要 JSX 配置**
   - `.tsx` 只是擴展名
   - 如果沒有 JSX 配置，Deno 會當作普通 TypeScript 處理
   - 不會嘗試導入 `react/jsx-runtime`

3. **Import map 更簡潔**
   - 只包含實際需要的庫（Hono、Supabase、Postgres）
   - 沒有前端依賴

---

## 🚀 現在請重新部署

```bash
supabase functions deploy make-server-5c6718b9 \
  --no-verify-jwt \
  --project-ref uhtwwxtazwqnlbejhprl
```

### 期望看到：

```
Bundling Function: make-server-5c6718b9
✔ Function deployed successfully

Function URL: https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9
```

**不再有 React/JSX 相關的錯誤！**

---

## ✅ 驗證部署成功

### 1. Health Check

```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應：**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-12-21T..."
}
```

### 2. Listings API

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

### 3. 查看日誌

```bash
supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
```

**期望看到：**
```
✅ Uknow Platform API Server V2 starting...
✅ Route prefix: /make-server-5c6718b9
✅ [Database] PostgreSQL connection successful
✅ Storage Bucket 已存在: make-5c6718b9-listings-photos
```

---

## 📝 技術細節

### Deno 的 JSX 處理機制：

| 配置 | Deno 行為 |
|------|----------|
| 有 JSX 配置 + `.tsx` | 自動導入 JSX runtime |
| 無 JSX 配置 + `.tsx` | 當作普通 TypeScript |
| 有 JSX 配置 + `.ts` | 忽略 JSX 配置 |
| 無 JSX 配置 + `.ts` | 普通 TypeScript |

### Edge Functions 的最佳實踐：

1. **不要配置 JSX**
   - Edge Functions 是後端代碼
   - 不需要渲染 UI
   - 不需要 React

2. **Import map 只包含必要依賴**
   - Hono（Web 框架）
   - Supabase Client
   - Postgres（如需直接查詢）

3. **避免混合前後端依賴**
   - 前端：React、Tailwind、UI 庫
   - 後端：Hono、資料庫客戶端、工具庫

---

## 🔧 故障排除

### 問題 1：仍然提示 React 錯誤

**可能原因：**
- Deno 快取了舊的配置

**解決方案：**
```bash
# 清除 Deno 快取
deno cache --reload supabase/functions/make-server-5c6718b9/index.ts

# 重新部署
supabase functions deploy make-server-5c6718b9 --no-verify-jwt --project-ref uhtwwxtazwqnlbejhprl
```

### 問題 2：部署成功但函數無法訪問

**檢查環境變量：**
- Dashboard → Functions → Settings → Secrets
- 確認 4 個變量都已設置：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL`

### 問題 3：資料庫連接失敗

**查看日誌：**
```bash
supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
```

**確認 DATABASE_URL 格式：**
```
postgresql://postgres.uhtwwxtazwqnlbejhprl:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

---

## 🎯 關鍵要點

### ✅ 應該做的：

1. Edge Functions 不配置 JSX
2. Import map 只包含後端依賴
3. 使用 `--no-verify-jwt` 部署

### ❌ 不應該做的：

1. 在後端代碼中配置 React/JSX
2. 混合前後端依賴
3. 使用前端工具（如 Webpack、Vite）打包後端代碼

---

## 📚 相關文檔

- **Deno Manual - JSX**: https://deno.land/manual/jsx_dom/jsx
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **Hono Documentation**: https://hono.dev/

---

## 🎉 部署成功後

### 下一步：

1. **測試 API 端點**
   - Health Check
   - Listings API
   - Auth API

2. **訪問前端應用**
   - 在 Figma Make 打開應用
   - 測試註冊流程
   - 測試登入功能

3. **監控日誌**
   ```bash
   supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl --tail
   ```

---

**創建時間：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl  
**修復內容：** 移除後端代碼的 JSX 配置
