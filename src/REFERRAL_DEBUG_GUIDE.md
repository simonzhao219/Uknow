# 推薦系統Debug指南

## 🎯 問題現象
用戶付款成功後，推薦人查看推薦管理頁面時，推薦樹沒有顯示被推薦人。

## 🔧 已實施的修正

### 1. **付款流程（payment.ts）**
修正了付款成功後立即建立推薦關係的邏輯：

**修正前：** 
- ❌ 只記錄推薦來源（`user:${userId}:referred_by`）
- ❌ 推薦樹更新需要等待被推薦人創建刊登

**修正後：**
- ✅ 記錄推薦來源（`user:${userId}:referred_by`）
- ✅ **立即更新推薦人的推薦樹**（`user:${referrerUserId}:referral_tree`）
- ✅ **立即更新推薦統計**（`user:${referrerUserId}:referral_stats`）
- ✅ 被推薦人信息完整記錄（即使還沒有刊登）

### 2. **推薦樹數據結構**
支持無刊登的成員：

```typescript
{
  userId: "user_xxx",           // ✅ 用戶ID（必填）
  userName: "用戶名",           // ✅ 用戶名（必填）
  listingId: null,              // ✅ 可選（付款時為null）
  listingName: null,            // ✅ 可選（付款時為null）
  serviceType: null,            // ✅ 可選
  city: null,                   // ✅ 可選
  activeUntil: "2026-12-23...", // ✅ 使用訂閱結束日期
  isActive: true,
  createdAt: "2025-12-23..."
}
```

### 3. **詳細Debug日誌**
添加了完整的日誌輸出（後端）：

**付款時：**
```
========== 🔗 開始處理推薦關係 ==========
[Process Payment] 被推薦人用戶ID: xxx
[Process Payment] 使用推薦碼: abc123456
[Process Payment] ✅ 找到推薦人用戶ID: yyy
[Process Payment] ✅ 推薦來源已記錄: user:xxx:referred_by
[Process Payment] 🌲 開始更新推薦人的推薦樹...
[Process Payment] 當前推薦樹: 1代=0, 2代=0, 3代=0
[Process Payment] ✅ 推薦樹已更新: user:yyy:referral_tree
[Process Payment] 新增成員: 用戶A (userId: xxx)
[Process Payment] 更新後推薦樹: 1代=1
[Process Payment] ✅ 推薦統計已更新: user:yyy:referral_stats
[Process Payment] 總推薦數: 1, 一代: 1
========== ✅ 推薦關係處理完成 ==========
```

**讀取推薦樹時：**
```
========== 🌲 開始獲取用戶推薦樹 ==========
[Get My Tree] ✅ 用戶驗證成功: yyy
🎫 用戶推薦碼: abc123456
📊 用戶推薦樹: 1代=1, 2代=0, 3代=0
📊 推薦統計: 總計=1, 1代=1, 2代=0, 3代=0
========== ✅ 推薦樹獲取完成 ==========
```

### 4. **前端Debug工具**
新增 `ReferralDebugger` 組件（僅開發環境可見）：

**功能：**
- 查詢任意用戶的推薦關係狀態
- 顯示用戶資料、推薦來源、推薦樹、推薦統計
- 顯示推薦碼索引信息

**使用方法：**
1. 前往推薦管理頁面
2. 滾動到最底部查看「Debug工具」卡片
3. 輸入用戶ID（或使用當前用戶）
4. 點擊搜尋按鈕查看完整數據

---

## 🧪 完整測試流程

### **情境A：測試新用戶註冊並被推薦**

#### **準備工作**
1. 確保推薦人（User B）已完成付款並擁有推薦碼

#### **Step 1: 推薦人獲取推薦碼**
1. 推薦人登入
2. 前往會員中心 → 推薦管理
3. 記錄推薦碼（例如：`abc123456`）

#### **Step 2: 被推薦人註冊**
1. 新用戶（User A）開始註冊流程
2. 在註冊時填寫推薦碼：`abc123456`
3. 完成個人資料填寫
4. 前往付款頁面

#### **Step 3: 被推薦人付款**
1. 點擊「模擬付款成功」
2. **檢查瀏覽器控制台（Console）：**
   - 應該看到：`PaymentCheckout: Payment successful`
   - 應該看到：返回的推薦碼（User A 自己的推薦碼）

#### **Step 4: 檢查後端日誌（Supabase Dashboard）**
1. 前往 Supabase Dashboard → Edge Functions → Logs
2. 搜尋 `Process Payment` 相關日誌
3. **應該看到：**
   ```
   ========== 🔗 開始處理推薦關係 ==========
   [Process Payment] 被推薦人用戶ID: user_A_id
   [Process Payment] 使用推薦碼: abc123456
   [Process Payment] ✅ 找到推薦人用戶ID: user_B_id
   [Process Payment] ✅ 推薦樹已更新
   [Process Payment] 更新後推薦樹: 1代=1
   ========== ✅ 推薦關係處理完成 ==========
   ```

#### **Step 5: 推薦人查看推薦樹**
1. 切換到推薦人帳號（User B）
2. 前往會員中心 → 推薦管理
3. **應該看到：**
   - 統計卡片顯示：一代推薦 = 1
   - 推薦網絡顯示：User A 的卡片
   - 卡片內容：用戶名、訂閱狀態（可能還沒有刊登）

#### **Step 6: 使用Debug工具（開發環境）**
1. 在推薦管理頁面滾動到底部
2. 找到「Debug工具」卡片
3. 輸入推薦人的用戶ID（User B）
4. 點擊搜尋按鈕
5. **檢查返回的數據：**
   - `profile.referralCode` = `abc123456`
   - `referralTree.firstGeneration.length` = 1
   - `referralTree.firstGeneration[0]` 包含 User A 的信息
   - `stats.totalReferrals` = 1
   - `stats.firstGenCount` = 1

---

### **情境B：檢查現有用戶的推薦關係**

如果推薦樹仍然沒有顯示，使用Debug工具檢查：

#### **Step 1: 獲取用戶ID**
1. 登入系統
2. 打開瀏覽器控制台（F12）
3. 執行：`JSON.parse(localStorage.getItem('user')).id`
4. 複製用戶ID

#### **Step 2: 使用Debug API**
在瀏覽器控制台執行：

```javascript
// 替換成實際的用戶ID
const userId = "6be148e0-5b9a-4644-95b9-95ed448dcd9f";

fetch(`https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-5c6718b9/referrals/debug/${userId}`)
  .then(res => res.json())
  .then(data => {
    console.log('========== Debug 結果 ==========');
    console.log('用戶資料:', data.data.profile);
    console.log('推薦來源:', data.data.referredBy);
    console.log('推薦樹:', data.data.referralTree);
    console.log('推薦統計:', data.data.stats);
    console.log('推薦碼索引:', data.data.codeIndex);
  });
```

#### **Step 3: 分析結果**

**預期結果（推薦人）：**
```json
{
  "profile": {
    "name": "User B",
    "referralCode": "abc123456",
    "referredByCode": null
  },
  "referredBy": null,
  "referralTree": {
    "firstGeneration": [
      {
        "userId": "user_A_id",
        "userName": "User A",
        "listingId": null,
        "listingName": null,
        "activeUntil": "2026-12-23...",
        "isActive": true
      }
    ],
    "secondGeneration": [],
    "thirdGeneration": []
  },
  "stats": {
    "totalReferrals": 1,
    "firstGenCount": 1,
    "secondGenCount": 0,
    "thirdGenCount": 0
  }
}
```

**預期結果（被推薦人）：**
```json
{
  "profile": {
    "name": "User A",
    "referralCode": "xyz789012",
    "referredByCode": "abc123456"
  },
  "referredBy": {
    "referrerUserId": "user_B_id",
    "referrerUserName": "User B",
    "generation": 1
  },
  "referralTree": {
    "firstGeneration": [],
    "secondGeneration": [],
    "thirdGeneration": []
  },
  "stats": {
    "totalReferrals": 0,
    "firstGenCount": 0,
    "secondGenCount": 0,
    "thirdGenCount": 0
  }
}
```

---

## 🔍 常見問題排查

### **問題1：推薦樹為空**

**檢查清單：**
- [ ] 被推薦人是否確實填寫了推薦碼？
- [ ] 被推薦人是否已完成付款？
- [ ] 後端日誌是否顯示「推薦關係處理完成」？
- [ ] `user:${referrerUserId}:referral_tree` 是否存在？
- [ ] `user:${referrerUserId}:referral_stats` 是否存在？

**解決方法：**
1. 使用Debug API檢查推薦人的數據
2. 檢查Supabase Edge Functions日誌
3. 重新執行付款流程

### **問題2：後端日誌沒有輸出**

**原因：** 後端日誌只在Supabase Dashboard可見，不會輸出到瀏覽器控制台。

**查看方法：**
1. 前往 Supabase Dashboard
2. 選擇 Edge Functions → Logs
3. 選擇 `make-server-5c6718b9` 函數
4. 搜尋相關日誌

### **問題3：前端API請求失敗**

**檢查清單：**
- [ ] 用戶是否已登入？
- [ ] Authorization header 是否正確？
- [ ] API URL 是否正確？
- [ ] 網絡請求是否成功（檢查 Network 標籤）？

**解決方法：**
1. 檢查瀏覽器控制台的錯誤訊息
2. 檢查 Network 標籤的請求和響應
3. 使用Debug API直接查詢數據

---

## 📊 數據流程圖

```
用戶A註冊時填寫推薦碼 (abc123456)
    ↓
保存到 user:A:profile.referredByCode
    ↓
用戶A付款成功
    ↓
processPaymentCallback 執行：
    ├─ 生成用戶A的推薦碼 (xyz789012)
    ├─ 保存 referral_code:xyz789012 → { userId: A }
    ├─ 讀取 referral_code:abc123456 → { userId: B }
    ├─ 保存 user:A:referred_by → { referrerUserId: B }
    ├─ 更新 user:B:referral_tree → { firstGeneration: [A] }
    └─ 更新 user:B:referral_stats → { firstGenCount: 1 }
    ↓
用戶B查看推薦管理
    ↓
GET /referrals/my-tree
    ↓
讀取 user:B:referral_tree
    ↓
前端顯示：一代推薦 = 1（包含用戶A）
```

---

## ✅ 驗證成功的標誌

1. **後端日誌：**
   - 看到 `========== ✅ 推薦關係處理完成 ==========`
   - 看到 `更新後推薦樹: 1代=1`

2. **前端顯示：**
   - 推薦管理頁面顯示統計數字 > 0
   - 推薦網絡顯示被推薦人的卡片
   - Debug工具顯示完整的推薦樹數據

3. **數據完整性：**
   - `user:${userId}:referred_by` 存在
   - `user:${referrerUserId}:referral_tree` 包含被推薦人
   - `user:${referrerUserId}:referral_stats` 統計正確

---

## 🚀 下一步

如果問題仍然存在，請提供以下信息：

1. **後端日誌：** Supabase Edge Functions 的完整日誌
2. **Debug API 結果：** 推薦人和被推薦人的Debug數據
3. **用戶ID：** 推薦人和被推薦人的用戶ID
4. **推薦碼：** 使用的推薦碼
5. **錯誤訊息：** 任何錯誤或異常訊息

有了這些信息，可以更精確地定位問題！
