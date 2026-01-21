# 🔧 **修復用戶：江梓豪 - 執行指南**

## 📋 **問題摘要**

**用戶ID：** `6597c99d-5905-4132-99e2-be7b98787315`  
**用戶名：** 江梓豪  
**推薦人ID：** `61b157d2-f242-4288-8deb-ffb7752d385e`  
**推薦人名：** 黎仁傑

**重複數據：**
- ❌ 2個推薦碼：`cul122277`, `pbe942409`
- ❌ 2個訂閱：`subscription_1769001178400_fgsmm`, `subscription_1769001216008_y3pe4n`
- ❌ 推薦樹中被重複添加
- ❌ 任務進度被重複計算
- ❌ 獎勵被重複發放（多發 10P）

---

## 🚀 **推薦方法：使用前端修復界面（最簡單）** ⭐

### **步驟 1：登入管理員帳號**

1. 打開平台並使用管理員帳號登入
2. 進入管理後台：點擊導航欄的「平台管理」

### **步驟 2：打開數據修復面板**

1. 在管理後台，切換到「數據修復」標籤
2. 您會看到江梓豪的問題詳情

### **步驟 3：執行修復**

1. 點擊「開始修復」按鈕
2. 等待修復完成（約 5-10 秒）
3. 查看修復結果

**優點：**
- ✅ 無需手動處理 token
- ✅ 自動認證
- ✅ 視覺化結果展示
- ✅ 操作簡單安全

---

## 🔧 **備選方法：使用 API（需要 Access Token）**

如果您需要通過 API 執行修復，請先獲取管理員 access token：

### **獲取 Access Token**

**方法 1：瀏覽器控制台**

1. 登入管理員帳號後，按 `F12` 打開開發者工具
2. 切換到 **Console** 標籤
3. 執行以下代碼：

```javascript
// 獲取 access token
import { createClient } from './utils/supabase/client';
const supabase = createClient();
const { data: { session } } = await supabase.auth.getSession();
console.log('Access Token:', session?.access_token);
navigator.clipboard.writeText(session?.access_token);
console.log('✅ Token 已複製到剪貼簿');
```

**方法 2：使用 Supabase Dashboard**

如果您有 Supabase Dashboard 訪問權限，可以直接使用 Service Role Key。

### **執行 API 修復**

使用獲取的 token（必須以 `eyJ` 開頭的 JWT token）：

```bash
curl -X POST \
  "https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/make-server-5c6718b9/data-repair/repair-jiang-zihao" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**替換 `YOUR_ACCESS_TOKEN_HERE`** 為您獲取的真實 token。

---

## ⚠️ **關於 Token 認證**

### **為什麼需要認證？**

數據修復工具現在受管理員認證保護，確保：
- ✅ 只有管理員能執行修復
- ✅ 防止未授權訪問
- ✅ 記錄操作日誌

### **您之前使用的 Token 為什麼無效？**

```
sbp_1c1e0cfd150bd5370e1b50e895a7709b2517c197
```

這不是有效的 JWT access token，而是其他類型的 key。

**有效的 Access Token 格式：**
- ✅ 以 `eyJ` 開頭
- ✅ 包含兩個 `.` 分隔符
- ✅ 長度通常 500-1000 字符

**示例：**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

---

## 📊 **修復內容詳解**

### **1. 移除重複推薦碼**
- **保留：** `pbe942409`（profile 中記錄的）
- **刪除：** `cul122277`（舊的推薦碼）
- **影響：** `referral_code:cul122277` 記錄被刪除

### **2. 合併重複訂閱**
- **保留：** `subscription_1769001216008_y3pe4n`（account_status 中記錄的）
- **刪除：** `subscription_1769001178400_fgsmm`
- **影響：**
  - `user:6597c99d:subscriptions` 只保留一個訂閱
  - `subscription:subscription_1769001178400_fgsmm` 記錄被刪除

### **3. 去重推薦樹**
- **對象：** 推薦人黎仁傑的推薦樹
- **操作：** 從 `user:61b157d2:referral_tree.firstGeneration` 中移除重複的江梓豪
- **影響：** 一代推薦從 2 人變為 1 人

### **4. 刪除重複獎勵排程**
- **對象：** 黎仁傑的後續 11 個月獎勵排程
- **操作：** 刪除重複的排程記錄
- **影響：** 11 個重複排程被刪除

### **5. 校正獎勵金額**
- **對象：** 黎仁傑的獎勵餘額
- **操作：** 扣回多發的 10P
- **影響：**
  - `user:61b157d2:rewards.availableRewards` 減少 10P
  - `user:61b157d2:rewards.totalEarned` 減少 10P
  - 獎勵歷史新增一筆校正記錄

### **6. 去重月度日誌**
- **對象：** 黎仁傑的月度日誌
- **操作：** 移除重複的江梓豪記錄
- **影響：** `user:61b157d2:referral_monthly_log` 去重

---

## ⚠️ **注意事項**

1. **執行前確認：**
   - 確保有數據備份（雖然系統會保存修復日誌）
   - 確認用戶 ID 正確
   - 確認有管理員權限

2. **執行中：**
   - 修復過程大約需要 5-10 秒
   - 不要重複執行修復（有冪等性保護）

3. **執行後：**
   - 立即驗證修復結果
   - 檢查修復日誌（保存在 `repair_log:jiang_zihao:{timestamp}`）
   - 通知受影響用戶（如有必要）

---

## 🔍 **檢查清單**

修復前檢查：
- [ ] 確認用戶 ID 正確
- [ ] 確認推薦人 ID 正確
- [ ] 確認有管理員權限
- [ ] 已閱讀修復內容

修復後檢查：
- [ ] API 返回 `success: true`
- [ ] 所有 6 個步驟都成功
- [ ] 數據驗證返回 0 個錯誤
- [ ] 檢查江梓豪的 profile（只有 1 個推薦碼）
- [ ] 檢查江梓豪的訂閱列表（只有 1 個訂閱）
- [ ] 檢查黎仁傑的推薦樹（江梓豪只出現 1 次）
- [ ] 檢查黎仁傑的獎勵餘額（已扣回 10P）

---

## 📞 **支援**

如果修復過程中遇到問題：

1. 查看後端日誌（Supabase Edge Functions Logs）
2. 檢查修復日誌（KV Store: `repair_log:jiang_zihao:{timestamp}`）
3. 如果需要回滾，請聯繫系統管理員

---

## ✅ **修復完成確認**

修復完成後，系統將達到以下狀態：

**江梓豪（被推薦人）：**
- ✅ 只有 1 個推薦碼：`pbe942409`
- ✅ 只有 1 個訂閱：`subscription_1769001216008_y3pe4n`
- ✅ registrationStep = 3
- ✅ account_status.status = Active

**黎仁傑（推薦人）：**
- ✅ 推薦樹一代只有 1 個江梓豪
- ✅ 推薦統計：totalReferrals = 正確數量
- ✅ 獎勵餘額：已扣回多發的 10P
- ✅ 獎勵排程：11 個月（無重複）
- ✅ 月度日誌：江梓豪只出現 1 次

---

**修復文檔版本：** 1.0  
**最後更新：** 2026-01-22  
**狀態：** 準備就緒