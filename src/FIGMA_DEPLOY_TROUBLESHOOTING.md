# 🔧 Figma Make Supabase 部署故障排除

## 問題：點擊 "Supabase Deploy" 顯示 "Something went wrong"

### ✅ 已實施的修復

我已經為您創建了必要的配置文件來修復此問題：

1. **`/supabase/config.toml`** - Supabase 專案配置
2. **`/supabase/functions/make-server-5c6718b9/index.ts`** - 標準入口點
3. **`/supabase/functions/make-server-5c6718b9/deno.json`** - Deno 配置

---

## 🎯 解決方案 1：重新嘗試 Figma Deploy

現在請再次嘗試：

1. 在 Figma Make 中
2. 點擊右上角的 **Supabase Deploy** 按鈕
3. 等待部署完成（可能需要 2-3 分鐘）

**如果仍然失敗**，請查看瀏覽器的開發者控制台（F12）是否有錯誤訊息。

---

## 🎯 解決方案 2：使用 CLI 部署（推薦）⭐

Figma Make 的部署功能可能因為專案結構複雜而失敗。使用 Supabase CLI 更可靠：

### 快速步驟：

```bash
# 1. 安裝 CLI（如果尚未安裝）
npm install -g supabase

# 2. 登入
supabase login

# 3. 連接專案（替換 YOUR_PROJECT_REF）
supabase link --project-ref YOUR_PROJECT_REF

# 4. 部署
supabase functions deploy make-server-5c6718b9 --no-verify-jwt

# 5. 查看日誌
supabase functions logs make-server-5c6718b9 --tail
```

**PROJECT_REF 在哪？**
- Supabase Dashboard → Project Settings → General → Reference ID

---

## 🎯 解決方案 3：Dashboard 手動部署

如果您不想使用 CLI：

### 步驟 1：下載代碼

**選項 A：下載整個 server 目錄**
1. 在 Figma Make 文件瀏覽器中
2. 右鍵點擊 `/supabase/functions/server` 文件夾
3. 選擇 "Download"（如果可用）

**選項 B：使用 Git（如果專案在 Git 倉庫）**
```bash
git clone YOUR_REPO_URL
cd YOUR_REPO
```

### 步驟 2：創建部署包

```bash
# 在本地終端執行
cd supabase/functions
zip -r server.zip server/
```

### 步驟 3：上傳到 Supabase

1. 訪問 https://supabase.com/dashboard
2. 選擇您的專案
3. 左側選單 → **Edge Functions**
4. 點擊 **"New Function"**（如果函數不存在）
   - 函數名稱：`make-server-5c6718b9`
   - 上傳 `server.zip`
5. 或點擊現有函數的 **"..."** → **"Deploy new version"**

---

## 🔍 常見錯誤原因

### 1. 環境變量未設置

**檢查：**
- Supabase Dashboard → Project Settings → Edge Functions → Environment Variables

**必須設置的變量：**
```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

### 2. 專案結構不符合標準

**原因：**
- Figma Make 期望標準的 Edge Function 結構：
  ```
  /supabase/functions/
    function-name/
      index.ts
  ```

**我們的結構：**
  ```
  /supabase/functions/
    server/           ← 非標準（多文件架構）
      index.tsx
      listings.ts
      auth.ts
      ...
  ```

**已修復：**
- 創建了 `/supabase/functions/make-server-5c6718b9/index.ts` 作為橋接

### 3. Deno 配置缺失

**已修復：**
- 創建了 `/supabase/functions/make-server-5c6718b9/deno.json`
- 配置了所有必要的導入映射

---

## 🧪 驗證部署成功

### 方法 1：CLI 查看日誌

```bash
supabase functions logs make-server-5c6718b9 --tail
```

**期望看到：**
```
✅ [Database] ✅ Supabase Client initialized
✅ [Database] ✅ Postgres Client initialized
✅ PostgreSQL connection successful
🚀 Server started successfully
```

### 方法 2：Health Check

訪問（替換 YOUR_PROJECT_REF）：
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應：**
```json
{
  "status": "ok",
  "database": "connected"
}
```

### 方法 3：測試 API

訪問：
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
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

## 📞 仍然遇到問題？

### 請提供以下信息：

1. **Figma Make 錯誤詳情**
   - 打開瀏覽器開發者控制台（F12）
   - 再次點擊 "Supabase Deploy"
   - 複製 Console 標籤中的所有錯誤訊息

2. **Project Reference ID**
   - 從 Supabase Dashboard 複製

3. **部署方式**
   - Figma Deploy 按鈕
   - CLI
   - Dashboard 手動上傳

---

## 🎊 推薦的部署流程

基於當前的複雜專案結構，建議使用以下優先順序：

1. **Supabase CLI** ⭐⭐⭐⭐⭐（最可靠）
2. **Dashboard 手動上傳** ⭐⭐⭐⭐☆
3. **Figma Deploy 按鈕** ⭐⭐⭐☆☆（可能因結構複雜而失敗）

---

**創建時間：** 2024-12-21  
**狀態：** 配置文件已創建，等待重新部署
