# 用戶數據診斷工具使用說明

## 功能概述

用戶數據診斷工具是一個全面的系統工具，用於檢查和修復用戶數據的完整性和一致性。

## 訪問方式

### 前端頁面
- URL: `/admin/user-diagnosis`
- 需要管理員權限

### API 端點

**1. 診斷用戶數據**
```
GET /make-server-5c6718b9/admin-user-diagnosis/:userId
```

**2. 自動修復問題**
```
POST /make-server-5c6718b9/admin-user-diagnosis/:userId/fix
Content-Type: application/json

{
  "force": false  // true = 強制修復 Profile 缺失字段
}
```

---

## 檢查項目

### 1. Profile 數據檢查
- ✅ 檢查必要字段（email, name, phone, birthDate, registrationStep）
- ✅ 檢查注冊步驟相關字段完整性
  - Step 2: paidAt, periodTradeNo, lastTradeNo, pendingActivation
  - Step 3: referralCode, accountStatus, activeUntil

### 2. Email 索引檢查
- ✅ 驗證 `user:email:{email}` 索引是否存在
- ✅ 驗證索引指向正確的用戶 ID

### 3. 推薦碼檢查
- ✅ 驗證 `referral_code:{code}` 數據是否存在
- ✅ 驗證推薦碼綁定的用戶 ID 是否正確

### 4. 被推薦關係檢查
- ✅ 檢查 `user:{userId}:referred_by` 數據
- ✅ 驗證推薦人是否存在
- ✅ 檢查推薦碼一致性

### 5. 推薦樹檢查
- ✅ 檢查 `user:{userId}:referral_tree` 數據
- ✅ 驗證推薦統計與推薦樹是否一致

### 6. 獎勵記錄檢查
- ✅ 檢查 `user:{userId}:rewards` 數據
- ✅ 檢查 `user:{userId}:reward_history` 數據

### 7. 任務狀態檢查
- ✅ 檢查 `user:{userId}:tasks` 數據
- ✅ 檢查 `user:{userId}:referral_monthly_log` 數據

### 8. 訂單數據檢查
- ✅ 檢查訂單是否存在
- ✅ 驗證訂單數據一致性

---

## 使用方式

### 方法 1：前端頁面（推薦）

1. 登入管理員帳號
2. 訪問 `/admin/user-diagnosis`
3. 輸入用戶 ID：`297e23d4-0d9b-497c-b489-1e33043870ee`
4. 點擊「開始診斷」
5. 查看診斷報告：
   - 🔴 嚴重問題（紅色）
   - 🟡 警告（黃色）
   - 🔵 信息摘要（藍色）
   - 🟢 檢查通過（綠色）
6. 如有問題，點擊「自動修復」

### 方法 2：直接調用 API

**診斷用戶：**
```bash
curl -X GET \
  https://{projectId}.supabase.co/functions/v1/make-server-5c6718b9/admin-user-diagnosis/297e23d4-0d9b-497c-b489-1e33043870ee \
  -H "Authorization: Bearer {access_token}"
```

**自動修復：**
```bash
curl -X POST \
  https://{projectId}.supabase.co/functions/v1/make-server-5c6718b9/admin-user-diagnosis/297e23d4-0d9b-497c-b489-1e33043870ee/fix \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

---

## 診斷報告示例

### 成功案例
```json
{
  "success": true,
  "userId": "297e23d4-0d9b-497c-b489-1e33043870ee",
  "profile": {
    "email": "user@example.com",
    "name": "許凱傑",
    "registrationStep": 3,
    "accountStatus": "Active",
    "referralCode": "abc123456"
  },
  "issues": [],
  "warnings": [],
  "info": [
    "✓ Email 索引: user:email:user@example.com → 297e23d4-0d9b-497c-b489-1e33043870ee",
    "✓ 推薦碼: abc123456 → 297e23d4-0d9b-497c-b489-1e33043870ee",
    "✓ 推薦樹: 1代=5, 2代=12, 3代=8"
  ],
  "message": "所有檢查通過"
}
```

### 問題案例
```json
{
  "success": false,
  "userId": "297e23d4-0d9b-497c-b489-1e33043870ee",
  "profile": {
    "email": "user@example.com",
    "name": "許凱傑",
    "registrationStep": 1,
    "accountStatus": null,
    "referralCode": null
  },
  "issues": [
    "❌ registrationStep >= 2 但缺少 paidAt",
    "❌ registrationStep >= 2 但缺少 periodTradeNo",
    "❌ registrationStep = 3 但沒有推薦碼"
  ],
  "warnings": [
    "⚠️ Step >= 2 但沒有 lastTradeNo"
  ],
  "info": [
    "✓ Email 索引正確"
  ],
  "message": "發現 3 個嚴重問題和 1 個警告"
}
```

---

## 自動修復功能

### 修復項目

1. **Email 索引**
   - 自動創建或修復 `user:email:{email}` 索引

2. **Step 3 缺失數據**（registrationStep = 3）
   - 推薦樹（referral_tree）
   - 推薦統計（referral_stats）
   - 獎勵數據（rewards）
   - 獎勵歷史（reward_history）
   - 任務數據（tasks）
   - 月度日誌（referral_monthly_log）

3. **Profile 缺失字段**（需要 `force: true`）
   - updatedAt
   - accountStatus

### 修復示例

**請求：**
```bash
POST /admin-user-diagnosis/297e23d4-0d9b-497c-b489-1e33043870ee/fix
{
  "force": false
}
```

**響應：**
```json
{
  "success": true,
  "userId": "297e23d4-0d9b-497c-b489-1e33043870ee",
  "fixes": [
    "✓ 已創建/修復 Email 索引: user:email:user@example.com",
    "✓ 已創建推薦樹數據",
    "✓ 已創建獎勵數據",
    "✓ 已創建任務數據"
  ],
  "errors": [],
  "message": "已完成 4 項修復"
}
```

---

## 針對 297e23d4-0d9b-497c-b489-1e33043870ee 的診斷

### 預期問題

根據之前的分析，該用戶可能存在以下問題：

1. ❌ `registrationStep = 1`（應該是 2 或 3）
2. ❌ 缺少 `paidAt`
3. ❌ 缺少 `periodTradeNo`
4. ❌ 缺少 `lastTradeNo`
5. ❌ 缺少 `pendingActivation`
6. ❌ 缺少 `accountStatus`
7. ❌ 缺少 `activeUntil`
8. ❌ 缺少 `firstPaymentAt`

### 修復步驟

**Step 1：運行診斷**
```
GET /admin-user-diagnosis/297e23d4-0d9b-497c-b489-1e33043870ee
```

**Step 2：查看問題列表**
- 確認是否與預期一致

**Step 3：嘗試自動修復**
```
POST /admin-user-diagnosis/297e23d4-0d9b-497c-b489-1e33043870ee/fix
{ "force": false }
```

**Step 4：手動補齊 Profile 缺失字段**

如果自動修復無法解決 Profile 字段問題，需要手動更新：

```typescript
// 補齊以下字段
profile.registrationStep = 2;
profile.pendingActivation = true;
profile.paidAt = "2026-02-24T12:41:10+08:00";
profile.periodTradeNo = "20260224124034zrF1aN";
profile.lastTradeNo = "20260224124033EuAg0Ldz2DH";
profile.lastPaymentDate = "2026-02-24T12:41:10+08:00";
profile.accountStatus = "Active";  // 或 "Pending"
profile.activeUntil = "2027-02-24T12:41:10+08:00";
profile.firstPaymentAt = "2026-02-24T12:41:10+08:00";
profile.updatedAt = toTaiwanISOString(getTaiwanNow());

await kv.set(`user:${userId}:profile`, profile);
```

**Step 5：重新診斷**
```
GET /admin-user-diagnosis/297e23d4-0d9b-497c-b489-1e33043870ee
```

---

## 注意事項

### ⚠️ 重要提醒

1. **自動修復的限制**
   - 只能修復缺失的數據結構
   - 不能修復 Profile 的核心字段（如 registrationStep, paidAt）
   - Profile 字段需要手動更新（使用 `force: true` 可部分自動修復）

2. **何時需要手動干預**
   - registrationStep 不正確
   - 缺少付款相關字段（paidAt, periodTradeNo, lastTradeNo）
   - 推薦關係錯誤

3. **備份建議**
   - 在修復前，建議先導出用戶數據作為備份
   - 重要操作應在測試環境先驗證

---

## 常見問題

### Q1: 自動修復後還有問題怎麼辦？

如果自動修復無法解決所有問題：
1. 查看 `issues` 列表中的具體問題
2. 根據問題類型決定是否需要手動干預
3. 核心字段（如 registrationStep, paidAt）必須手動更新

### Q2: 如何查看後端日誌？

1. 進入 Supabase Dashboard
2. Functions → server → Logs
3. 搜索 `[診斷]` 或用戶 ID

### Q3: 修復後用戶仍然無法完成註冊？

檢查以下項目：
1. registrationStep 是否正確（應該是 2）
2. pendingActivation 是否為 true
3. 訂單數據是否完整
4. 前端是否正確跳轉到 /payment/result

---

## 總結

用戶數據診斷工具是一個強大的系統工具，可以：
- ✅ 快速定位數據問題
- ✅ 自動修復大部分問題
- ✅ 提供詳細的診斷報告
- ✅ 確保數據一致性

**最佳實踐：**
1. 定期運行診斷，確保系統數據健康
2. 在修復前仔細閱讀診斷報告
3. 重要操作前先備份數據
4. 修復後重新診斷驗證結果
