# 🔑 **獲取管理員 Access Token 指南**

## 問題說明

您使用的 token `sbp_1c1e0cfd150bd5370e1b50e895a7709b2517c197` 不是有效的 JWT token，導致認證失敗。

數據修復工具現在需要**管理員權限**，您需要使用真實的管理員帳號登入後獲取 access token。

---

## 🚀 **方法一：通過瀏覽器開發者工具獲取**

### **步驟 1：登入管理員帳號**

1. 打開 Uknow 平台：`https://your-app-url.com/auth/login`
2. 使用管理員帳號登入（必須是 `role: 'admin'` 的帳號）

### **步驟 2：打開開發者工具**

1. 按 `F12` 或右鍵 → 檢查
2. 切換到 **Console（控制台）** 標籤

### **步驟 3：執行以下代碼**

```javascript
// 獲取當前用戶的 access token
import { createClient } from './utils/supabase/client';

const supabase = createClient();
const { data: { session }, error } = await supabase.auth.getSession();

if (session) {
  console.log('✅ Access Token:');
  console.log(session.access_token);
  console.log('\n📋 複製此 token 使用');
  
  // 自動複製到剪貼簿
  navigator.clipboard.writeText(session.access_token);
  console.log('✅ Token 已複製到剪貼簿');
} else {
  console.log('❌ 未登入或 session 已過期');
}
```

### **步驟 4：使用 Token**

複製獲得的 token（以 `eyJ` 開頭的長字串），然後執行修復：

```bash
curl -X POST \
  "https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/data-repair/repair-jiang-zihao" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

---

## 🛠️ **方法二：使用 Supabase Dashboard（更簡單）**

如果您有 Supabase Dashboard 訪問權限：

### **步驟 1：進入 Supabase Dashboard**

1. 登入 [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. 選擇您的專案：`uhtwwxtazwqnlbejhprl`

### **步驟 2：執行 SQL 獲取管理員 Token**

1. 進入 **SQL Editor**
2. 執行以下 SQL：

```sql
-- 查詢管理員用戶
SELECT 
  auth.users.id as user_id,
  auth.users.email,
  kv.value->>'role' as role
FROM auth.users
LEFT JOIN kv_store_5c6718b9 kv 
  ON kv.key = 'user:' || auth.users.id || ':profile'
WHERE kv.value->>'role' = 'admin'
LIMIT 5;
```

3. 找到管理員用戶的 email

### **步驟 3：使用 Edge Functions Invoke**

1. 進入 **Edge Functions** → **make-server-5c6718b9**
2. 使用 **Invoke** 功能，選擇 **POST** 方法
3. URL: `/make-server-5c6718b9/data-repair/repair-jiang-zihao`
4. Authorization: 選擇 **Service Role Key**（這會自動跳過用戶認證）

**⚠️ 注意：** 使用 Service Role Key 會跳過管理員檢查，但這是安全的方式（只有您能訪問 Dashboard）

---

## 🎯 **方法三：暫時移除管理員檢查（臨時方案）**

如果您急需修復數據，我可以暫時移除管理員檢查，修復完成後再加回來。

是否需要我這樣做？

---

## 📋 **驗證 Token 是否有效**

獲得 token 後，可以先測試是否有效：

```bash
curl -X GET \
  "https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/users/profile" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**預期返回：**
```json
{
  "success": true,
  "profile": {
    "name": "管理員名稱",
    "role": "admin",
    ...
  }
}
```

如果返回 `401 Unauthorized` 或 `403 Forbidden`，說明 token 無效或不是管理員。

---

## 🔍 **Token 格式說明**

**有效的 Access Token：**
- ✅ 以 `eyJ` 開頭（JWT 格式）
- ✅ 很長（通常 500-1000 字符）
- ✅ 包含三個部分，用 `.` 分隔

**無效的 Token：**
- ❌ `sbp_xxxxxx`（這是其他類型的 key）
- ❌ 太短（< 100 字符）
- ❌ 不包含 `.` 分隔符

---

## 💡 **推薦方案**

**最快速度修復：** 使用方法二（Supabase Dashboard Invoke），無需手動獲取 token

**最安全方式：** 使用方法一（瀏覽器獲取真實 token），確保只有管理員能執行修復

---

## ❓ **需要幫助？**

如果您：
- 無法獲取 access token
- Token 一直顯示無效
- 需要緊急修復數據

請告訴我，我可以：
1. 創建一個臨時的無需認證版本
2. 提供更詳細的獲取 token 教學
3. 創建一個前端修復界面（登入後直接點擊修復）
