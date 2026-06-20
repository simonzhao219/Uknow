# Uknow — Supabase Dashboard 手動設定清單

> 本清單涵蓋程式碼之外、**必須在 Supabase 後台手動完成**的設定。
> 完成後新版 `api` Edge Function（PayUni 付款、Email OTP）才能正常運作。

- **專案 Ref**：`uhtwwxtazwqnlbejhprl`
- **專案 URL**：`https://uhtwwxtazwqnlbejhprl.supabase.co`
- **Dashboard**：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl

---

## ☑️ 步驟 1：設定 Edge Function 環境變數（Secrets）

`api` 函數需要以下環境變數才能處理 PayUni 付款與 CORS。

### 導覽路徑
Dashboard → 左側 **Project Settings**（齒輪）→ **Edge Functions** → **Secrets** 區塊
（或直接開：https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/settings/functions ）

> Secrets 是**整個專案共用**的，所有 Edge Function（含 `api`）都會讀到，不需逐一函數設定。

### 需要新增的變數

| 變數名稱 | 值 | 說明 |
|----------|-----|------|
| `PAYUNI_MER_ID` | （PayUni 商店代號）| PayUni 後台取得 |
| `PAYUNI_HASH_KEY` | （32 字元）| PayUni 後台「Hash Key」 |
| `PAYUNI_HASH_IV` | （16 字元）| PayUni 後台「Hash IV」 |
| `PAYUNI_SANDBOX` | `true` 或 `false` | 測試環境填 `true`；正式上線填 `false` |
| `FRONTEND_URL` | 例：`https://你的前端網域.com` | **結尾不要加 `/`**；用於 CORS 白名單與付款完成導回頁 |

> ⚠️ `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase **自動注入**，
> **不需要**手動新增。

### 操作
1. 點 **Add new secret**
2. 逐一輸入上表 5 個變數的「名稱 / 值」
3. 全部加完後按 **Save**

### ⚠️ 重要：存檔後需重新部署
Secrets 變更後，正在執行的函數實例不會立即生效。
請在 Dashboard → **Edge Functions** → `api` → 點 **Deploy / Redeploy**，
或重新推送程式碼觸發部署，讓新變數生效。

---

## ☑️ 步驟 2：設定 Email OTP 模板

新版註冊／登入使用 **6 位數驗證碼（OTP）**，而非點擊連結。
需把 Email 模板改成顯示 `{{ .Token }}`。

### 導覽路徑
Dashboard → **Authentication** → **Emails**（或 **Email Templates**）
（ https://supabase.com/dashboard/project/uhtwwxtazwqnlbejhprl/auth/templates ）

### 需要調整的模板

| 模板 | 用途 | 必改內容 |
|------|------|----------|
| **Magic Link** | OTP 登入寄送 | 內文加入 `{{ .Token }}`，移除（或保留為輔助）`{{ .ConfirmationURL }}` 連結 |
| **Confirm signup** | 新用戶驗證 | 同上，改用 `{{ .Token }}` 顯示驗證碼 |
| **Reset Password** | 重設密碼 | 已於程式碼調整為 OTP，確認模板使用 `{{ .Token }}` |

### 範例內文片段
```html
<h2>您的 Uknow 驗證碼</h2>
<p>請在 App 中輸入以下 6 位數驗證碼：</p>
<p style="font-size:28px; font-weight:bold; letter-spacing:6px;">{{ .Token }}</p>
<p>驗證碼 1 小時內有效。若非您本人操作請忽略此信。</p>
```

### 操作
1. 選擇模板分頁（如 **Magic Link**）
2. 把內文改成含 `{{ .Token }}` 的版本
3. 按 **Save**，每個模板重複一次

> 💡 確認 **Authentication → Providers → Email** 已啟用、且
> **Confirm email** 設定符合預期（OTP 流程通常需要 Email 為啟用狀態）。

---

## ☑️ 步驟 3：確認 PayUni 後台設定

確保 PayUni 商店後台的設定與程式碼一致：

| 項目 | 應為 | 說明 |
|------|------|------|
| **NotifyURL（背景通知）** | `https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/api/webhooks/payuni/notify` | 付款成功的伺服器回調；程式已在加密參數帶入，若後台需另設白名單請填此網址 |
| **ReturnURL（前景導回）** | `{FRONTEND_URL}/payment/result?tradeNo=...` | 程式自動帶入，PayUni 後台若有限制網域請加入你的前端網域 |
| 金額 | `1200` | 年費會員固定金額 |

---

## ☑️ 步驟 4：驗證設定是否成功

### 4-1 健康檢查（不需登入）
```bash
curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/api/health
# 預期：{"ok":true,"ts":"..."}
```

### 4-2 PayUni 變數是否載入
建立一次測試付款（沙盒），若回傳 `PayUni 環境變數未設定` 代表步驟 1 尚未生效，
請重新部署 `api` 函數。

### 4-3 Email OTP
用新 Email 走一次註冊流程，確認收到的信件顯示 **6 位數驗證碼**（而非連結）。

---

## ☑️ 步驟 5（之後再做）：舊資源清理

> ⚠️ **破壞性操作，待新流程驗證穩定後再執行。** 建議先備份。

- [ ] 清空 `auth.users` 舊帳號（約 159 筆）
- [ ] 清空 `kv_store_5c6718b9`（約 5,361 筆）
- [ ] 刪除舊 Edge Function `make-server-5c6718b9`（目前仍 ACTIVE）
- [ ] 移除程式碼中的舊 server 目錄 `src/supabase/functions/server/`

> 需要時可請我先做 dry-run 統計，確認影響範圍後再執行。

---

## 快速檢查表

- [ ] 步驟 1：5 個 Edge Function Secrets 已新增並 Save
- [ ] 步驟 1：`api` 函數已重新部署，變數生效
- [ ] 步驟 2：Magic Link / Confirm signup / Reset Password 模板已含 `{{ .Token }}`
- [ ] 步驟 3：PayUni 後台 NotifyURL / ReturnURL 已確認
- [ ] 步驟 4：health 檢查通過、沙盒付款成功、收到 OTP 驗證碼信
- [ ] 步驟 5：（穩定後）清理舊資料與舊函數
