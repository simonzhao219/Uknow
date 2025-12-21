# 推薦管理功能 - 啟用指南

## ✅ 已完成的實作

### Phase 1: 數據層修復
- ✅ 修改 `POST /listings/create` API，添加 `referrerListingId` 存儲邏輯
- ✅ 創建數據遷移 API：`POST /admin/migrate-referrer-listing-ids`
- ✅ 使用**保守策略**進行遷移

### Phase 2: Backend API
- ✅ 創建 `/supabase/functions/server/referrals.ts`
- ✅ 實現 `GET /referrals/my-tree` API
- ✅ 註冊路由到 `index.tsx`

### Phase 3: Frontend 組件
- ✅ 更新 `ReferralManagement.tsx` 連接真實 API
- ✅ 更新 `ReferralTreeView.tsx` 顯示推薦樹
- ✅ 更新 `ReferralStats.tsx` 顯示統計
- ✅ 添加管理員數據遷移工具

---

## 🚀 啟用步驟

### Step 1: 執行數據遷移（一次性）

1. 登入管理員帳號
2. 前往「平台管理」→「數據遷移」頁籤
3. 點擊「開始遷移」按鈕
4. 等待遷移完成，查看結果統計

**遷移邏輯：**
- 已有 `referrerListingId` 的刊登 → 跳過
- 無推薦人的刊登 → 跳過
- 推薦者只有 1 個刊登 → 自動分配
- 推薦者有多個刊登 → 分配給第一個並標記 `_migrationNote: 'auto-assigned-first'`

### Step 2: 啟用推薦管理功能開關

由於前端已移除「功能管理」UI，需要直接修改 Backend KV Store：

#### 方法 A：使用 Supabase Dashboard（推薦）

1. 登入 Supabase Dashboard
2. 前往 `Edge Functions` → `Logs`
3. 找到 `system:feature_flags` 的值
4. 修改為：
```json
{
  "features": {
    "serviceProviderManagement": true,
    "referralManagement": true,  ← 改為 true
    "taskCenter": false,
    "rewardSystem": false
  },
  "lastUpdatedAt": "2025-12-11T12:00:00.000Z",
  "lastUpdatedBy": {
    "userId": "admin",
    "email": "admin@uknow.com.tw",
    "name": "管理員"
  }
}
```

#### 方法 B：手動調用 API（暫時方案）

可以創建臨時 API 端點來更新功能開關：

```typescript
// 在 /supabase/functions/server/admin.ts 添加：
admin.post('/enable-feature/:featureName', async (c) => {
  const featureName = c.req.param('featureName');
  
  // 驗證管理員權限...
  
  const data = await kv.get('system:feature_flags') || { features: DEFAULT_FEATURES };
  data.features[featureName] = true;
  data.lastUpdatedAt = new Date().toISOString();
  
  await kv.set('system:feature_flags', data);
  
  return c.json({ success: true, features: data.features });
});
```

然後調用：
```bash
POST /make-server-5c6718b9/admin/enable-feature/referralManagement
```

### Step 3: 驗證功能

1. 登入一般會員帳號
2. 前往「會員儀表板」
3. 查看「推薦管理」選項是否出現
4. 點擊進入，查看推薦樹是否正常顯示

---

## 📊 數據結構

### Listing 對象（新增字段）

```json
{
  "id": "listing_1765439016949_7q2jd",
  "userId": "c511fa73-1def-456a-8d81-99e16354d1de",
  "referrerUserId": "推薦者的 User ID",
  "referrerListingId": "推薦者的 Listing ID",  // ← 新增字段
  "referralCode": "3XYsSNGu0m9TTtGi",
  // ... 其他字段
}
```

### Referral Code 映射

```json
Key: "referral_code:3XYsSNGu0m9TTtGi"
Value: {
  "userId": "c511fa73-1def-456a-8d81-99e16354d1de",
  "userName": "Simon99",
  "listingId": "listing_1765446197844_b311uus"  // 用於追溯 referrerListingId
}
```

---

## 🔄 推薦樹計算邏輯

### 1等親（First Generation）
```typescript
referrerListingId === myListing.id
```
- 直接使用我的刊登推薦碼註冊的刊登

### 2等親（Second Generation）
```typescript
referrerListingId === firstGenListing.id
```
- 使用1等親的刊登推薦碼註冊的刊登

---

## 🐛 故障排除

### 問題 1：推薦樹載入失敗
**檢查：**
1. 後端 API 是否正常運行
2. 查看 Backend Logs 是否有錯誤
3. 驗證用戶登入狀態

### 問題 2：推薦關係不完整
**可能原因：**
1. 數據遷移未完成
2. 舊數據缺少 `referrerListingId`

**解決方案：**
- 重新執行數據遷移
- 檢查遷移日誌查看失敗原因

### 問題 3：統計數字不正確
**檢查：**
1. 後端計算邏輯是否正確
2. 數據是否包含失效刊登

---

## 📝 未來優化建議

1. **手動校正工具**：對於多刊登自動分配的情況，提供手動校正界面
2. **推薦關係可視化**：使用圖形化方式展示推薦樹
3. **推薦績效分析**：添加時間序列分析、轉化率統計
4. **推薦碼分享工具**：一鍵分享到社交媒體

---

## 🎉 總結

推薦管理功能已完整實作，包含：
- ✅ 完整的數據模型（含 `referrerListingId`）
- ✅ 自動化數據遷移工具
- ✅ Backend API（推薦樹查詢）
- ✅ Frontend UI（統計、樹狀顯示）

只需啟用功能開關即可正式使用！
