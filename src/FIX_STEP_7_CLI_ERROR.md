# 🔧 修復步驟 7.1 CLI 配置錯誤

## ❌ 錯誤訊息

```
failed to parse config: decoding failed due to the following error(s):
'functions[verify_jwt]' expected a map or struct, got "bool"
```

## 🔍 問題原因

您使用的是 **Supabase CLI 2.67.1**（新版本），但配置文件使用的是舊格式。

**舊格式（已不支持）：**
```toml
[functions]
verify_jwt = false  ❌ 不再支持
```

**新格式（CLI 2.67+）：**
```toml
[functions]
enabled = true  ✅ 正確格式
```

## ✅ 解決方案（已自動修復）

我已經為您更新了 `/supabase/config.toml` 文件為新格式，兼容 CLI 2.67+。

---

## 🚀 現在請重新部署

### 方法 1：使用命令行參數（推薦）⭐

由於配置文件可能仍有問題，**最簡單的方式是使用命令行參數繞過配置文件**：

```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt --project-ref uhtwwxtazwqnlbejhprl
```

**說明：**
- `--no-verify-jwt` 禁用 JWT 驗證
- `--project-ref` 直接指定專案 ID
- 這樣可以**完全繞過配置文件**的解析問題

---

### 方法 2：使用更簡單的配置文件

如果方法 1 仍然失敗，執行以下步驟：

#### 步驟 2.1：刪除現有配置

在專案根目錄執行：

```bash
# Windows PowerShell
Remove-Item supabase\config.toml -Force

# Mac/Linux Bash
rm -f supabase/config.toml
```

#### 步驟 2.2：創建最簡配置

創建新的 `supabase/config.toml`：

```toml
# 最簡配置（僅包含必要項）
[project]
id = "uhtwwxtazwqnlbejhprl"
```

#### 步驟 2.3：重新部署

```bash
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

---

### 方法 3：完全不使用配置文件（終極方案）

如果上面的方法都失敗，使用以下方式部署：

```bash
# 移動到函數目錄
cd supabase/functions

# 直接部署（不依賴配置文件）
supabase functions deploy make-server-5c6718b9 \
  --project-ref uhtwwxtazwqnlbejhprl \
  --no-verify-jwt

# 返回專案根目錄
cd ../..
```

---

## ✅ 驗證部署成功

### 1. 查看部署結果

**期望看到：**
```
Deploying function make-server-5c6718b9
✔ Function deployed successfully
Function URL: https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9
```

### 2. 查看函數日誌

```bash
supabase functions logs make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
```

**期望看到：**
```
✅ [Database] ✅ Supabase Client initialized
✅ [Database] ✅ Postgres Client initialized
✅ PostgreSQL connection successful
```

### 3. 測試 Health Check

**瀏覽器訪問：**
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

---

## 🔧 常見問題排查

### 問題 1：仍然提示配置文件錯誤

**解決方案：**
```bash
# 完全移除配置文件
rm supabase/config.toml

# 使用完整參數部署
supabase functions deploy make-server-5c6718b9 \
  --project-ref uhtwwxtazwqnlbejhprl \
  --no-verify-jwt
```

### 問題 2：提示找不到專案

```
Error: Project ref not found
```

**解決方案：**
```bash
# 重新連接專案
supabase link --project-ref uhtwwxtazwqnlbejhprl

# 或者使用 --project-ref 參數部署
supabase functions deploy make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl --no-verify-jwt
```

### 問題 3：權限不足

```
Error: permission denied
```

**解決方案：**
```bash
# 重新登入
supabase logout
supabase login

# 確認已連接到正確專案
supabase projects list

# 重新部署
supabase functions deploy make-server-5c6718b9 --no-verify-jwt
```

### 問題 4：部署成功但函數無法訪問

**可能原因：**
- 函數正在啟動（需要等待 1-2 分鐘）
- 環境變量未設置

**解決方案：**
```bash
# 1. 等待 2 分鐘讓函數完全啟動

# 2. 查看日誌確認啟動狀態
supabase functions logs make-server-5c6718b9

# 3. 確認環境變量（在 Dashboard）
# Edge Functions → Settings → Manage secrets
# 應該有 4 個變量：
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - DATABASE_URL
```

---

## 📝 為什麼會有這個問題？

**Supabase CLI 版本變更：**

| 版本 | verify_jwt 格式 | 狀態 |
|------|----------------|------|
| CLI < 2.0 | `verify_jwt = false` | ✅ 支持 |
| CLI 2.0-2.60 | `verify_jwt = false` | ⚠️ 部分支持 |
| CLI 2.67+ | 不支持布爾值 | ❌ 必須使用命令行參數 |

**最佳實踐：**
1. ✅ 使用命令行參數 `--no-verify-jwt`
2. ✅ 保持配置文件簡單
3. ✅ 使用 `--project-ref` 直接指定專案

---

## 🎯 推薦的部署命令（複製使用）

```bash
# 最簡單的部署命令（推薦）⭐⭐⭐⭐⭐
supabase functions deploy make-server-5c6718b9 \
  --no-verify-jwt \
  --project-ref uhtwwxtazwqnlbejhprl
```

**優點：**
- ✅ 不依賴配置文件
- ✅ 明確指定所有參數
- ✅ 版本兼容性最佳
- ✅ 錯誤訊息更清晰

---

## ✅ 完成檢查清單

部署成功後，請確認：

- [ ] 部署命令顯示 "Function deployed successfully"
- [ ] 函數日誌顯示資料庫連接成功
- [ ] Health Check 返回 `{"status":"ok","database":"connected"}`
- [ ] Listings API 返回 `{"success":true,"listings":[],"total":0}`
- [ ] 前端首頁可以正常訪問

**如果所有項目都打勾 → 完美！繼續步驟 8（驗證部署）！** 🎉

---

## 📞 仍然遇到問題？

請提供以下資訊：

1. **使用的部署命令**（複製貼上）
2. **完整的錯誤訊息**（包含堆疊追蹤）
3. **Supabase CLI 版本**
   ```bash
   supabase --version
   ```
4. **函數日誌**（如果已部署）
   ```bash
   supabase functions logs make-server-5c6718b9
   ```

我會立即幫您解決！

---

**創建時間：** 2024-12-21  
**專案 ID：** uhtwwxtazwqnlbejhprl  
**CLI 版本：** 2.67.1
