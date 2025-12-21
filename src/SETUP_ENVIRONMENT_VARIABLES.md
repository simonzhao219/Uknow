# 🔧 設置 Edge Function 環境變數

## ❌ 當前錯誤
```
ECONNREFUSED 127.0.0.1:5432
DATABASE_URL environment variable is required
```

**原因：** `DATABASE_URL` 環境變數未設置，導致 Postgres 客戶端嘗試連接到 localhost。

---

## ✅ 修復步驟（5 分鐘）

### 步驟 1：獲取 DATABASE_URL

#### 方法 A：從 Supabase Dashboard 複製（推薦）

1. **訪問 Database Settings：**
   ```
   https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/settings/database
   ```

2. **找到 Connection String 區域**

3. **選擇「Transaction」模式** (⚠️ 重要！不是 Session 模式)

4. **複製 Connection String**

   格式應該是：
   ```
   postgresql://postgres.uhtwwxtazwqnlbejhprl:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```

5. **替換 `[YOUR-PASSWORD]` 為實際的資料庫密碼**
   - 如果忘記密碼，可以在 Database Settings → Reset Database Password 重置

---

#### 方法 B：手動構建 DATABASE_URL

**格式：**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**參數說明：**
- `[project-ref]`：你的專案 ID = `uhtwwxtazwqnlbejhprl`
- `[password]`：資料庫密碼（創建專案時設置的）
- `[region]`：專案區域（如 `ap-southeast-1`、`us-east-1`）

**範例：**
```
postgresql://postgres.uhtwwxtazwqnlbejhprl:your_password_here@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

---

### 步驟 2：設置環境變數

#### 方法 A：使用 Supabase Dashboard（推薦）

1. **訪問 Edge Functions Settings：**
   ```
   https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions
   ```

2. **點擊「Secrets」或「Settings」標籤**

3. **添加新的環境變數：**
   - Name: `DATABASE_URL`
   - Value: （貼上從步驟 1 複製的連接字串）

4. **點擊「Save」**

---

#### 方法 B：使用 Supabase CLI

```bash
# 設置 DATABASE_URL
supabase secrets set DATABASE_URL="postgresql://postgres.uhtwwxtazwqnlbejhprl:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  --project-ref uhtwwxtazwqnlbejhprl

# 驗證環境變數
supabase secrets list --project-ref uhtwwxtazwqnlbejhprl
```

---

### 步驟 3：重新部署 Edge Function

環境變數更新後，必須重新部署 Edge Function：

```bash
supabase functions deploy make-server-5c6718b9 \
  --no-verify-jwt \
  --project-ref uhtwwxtazwqnlbejhprl
```

或者從 Dashboard：
1. 訪問 Functions → make-server-5c6718b9
2. 點擊「Deploy」按鈕

---

### 步驟 4：測試連接

```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health
```

**期望響應：**
```json
{
  "status": "ok",
  "timestamp": "2024-12-21T..."
}
```

**如果成功，測試 listings API：**
```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active
```

---

## 📋 必要的環境變數清單

Edge Function 需要以下 4 個環境變數：

| 變數名稱 | 來源 | 用途 |
|---------|------|------|
| `SUPABASE_URL` | 自動設置 | Supabase API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 自動設置 | Admin 權限的 API Key |
| `SUPABASE_ANON_KEY` | 自動設置 | 公開 API Key |
| `DATABASE_URL` | ⚠️ **需要手動設置** | Postgres 連接字串 |

---

## 🔍 驗證環境變數

### 方法 A：使用 CLI

```bash
supabase secrets list --project-ref uhtwwxtazwqnlbejhprl
```

**應該看到：**
```
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
```

### 方法 B：在 Edge Function 中打印（測試用）

暫時添加到 `/supabase/functions/server/index.tsx`：

```typescript
console.log('Environment variables check:');
console.log('- SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? '✅ Set' : '❌ Missing');
console.log('- SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? '✅ Set' : '❌ Missing');
console.log('- DATABASE_URL:', Deno.env.get('DATABASE_URL') ? '✅ Set' : '❌ Missing');
```

部署後查看 Function logs。

---

## 🚨 常見錯誤

### 錯誤 1：使用錯誤的連接模式

❌ **錯誤：** 使用 Session mode connection string
```
postgresql://postgres.uhtwwxtazwqnlbejhprl:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

✅ **正確：** 使用 Transaction mode connection string (端口 6543)
```
postgresql://postgres.uhtwwxtazwqnlbejhprl:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

**差異：** 端口不同
- Session mode: `:5432` (不適用於 Edge Functions)
- Transaction mode: `:6543` ✅

---

### 錯誤 2：忘記重新部署

**症狀：** 設置了環境變數但仍然報錯

**原因：** 環境變數更新不會自動應用到正在運行的 Function

**解決方案：** 重新部署
```bash
supabase functions deploy make-server-5c6718b9 --project-ref uhtwwxtazwqnlbejhprl
```

---

### 錯誤 3：密碼包含特殊字符未編碼

**症狀：** `ECONNREFUSED` 或 `authentication failed`

**原因：** 密碼中的特殊字符（如 `@`、`#`、`%`）未 URL 編碼

**解決方案：** 使用 URL 編碼
```javascript
// 例如密碼是：p@ssw0rd#123
// 編碼後：p%40ssw0rd%23123
```

**快速編碼工具：**
```javascript
encodeURIComponent('p@ssw0rd#123')
// 結果: p%40ssw0rd%23123
```

---

## 📊 完整的連接字串結構

```
postgresql://[user].[project-ref]:[password]@[host]:[port]/[database]
           │    │           │         │            │      │        │
           │    │           │         │            │      │        └─ 資料庫名稱 (固定: postgres)
           │    │           │         │            │      └────────── 端口 (6543 for Transaction)
           │    │           │         │            └───────────────── 主機地址
           │    │           │         └────────────────────────────── 資料庫密碼
           │    │           └──────────────────────────────────────── 專案 ID
           │    └──────────────────────────────────────────────────── 用戶名前綴
           └───────────────────────────────────────────────────────── 協議
```

---

## ✅ 驗證連接成功

執行以下測試確認一切正常：

```bash
# 1. 健康檢查
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/health

# 2. 測試資料庫連接（listings API）
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/listings-v2/active

# 3. 檢查 Function logs
# 訪問：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/functions/make-server-5c6718b9/logs

# 應該看到：
# [Database] ✅ Supabase Client initialized
# [Database] 🔗 Connecting to: postgresql://postgres.uhtwwxtazwqnlbejhprl:****@...
# [Database] ✅ Postgres Client initialized
```

---

## 🎯 快速修復檢查清單

- [ ] 從 Supabase Dashboard 複製 DATABASE_URL (Transaction mode)
- [ ] 確認密碼正確（無錯字）
- [ ] 確認端口是 6543（不是 5432）
- [ ] 在 Dashboard → Functions → Secrets 添加 DATABASE_URL
- [ ] 重新部署 Edge Function
- [ ] 測試 `/health` 端點
- [ ] 測試 `/listings-v2/active` 端點
- [ ] 檢查 Function logs 確認連接成功

---

## 🆘 仍然無法連接？

### 診斷步驟

1. **確認資料庫在線：**
   ```
   Dashboard → Database → 確認狀態為 "Healthy"
   ```

2. **測試直接連接（使用 psql 或其他工具）：**
   ```bash
   psql "postgresql://postgres.uhtwwxtazwqnlbejhprl:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
   ```

3. **檢查防火牆規則：**
   ```
   Dashboard → Settings → Database → Network Restrictions
   確認未限制 Supabase 內部連接
   ```

4. **查看 Edge Function 詳細日誌：**
   ```
   Dashboard → Functions → make-server-5c6718b9 → Logs
   查找具體的錯誤訊息
   ```

---

**完成環境變數設置後，立即測試 API！** 🚀

如果仍有問題，請告訴我：
1. 環境變數列表（`supabase secrets list` 的輸出）
2. Function logs 的錯誤訊息
3. 測試 API 的響應

我會立即協助解決！
