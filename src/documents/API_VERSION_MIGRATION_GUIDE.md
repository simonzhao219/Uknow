# 📚 API 版本遷移指南

**版本：** v1.7.2  
**最後更新：** 2024-12-21  
**目的：** 明確 V1 和 V2 API 的對照關係，指導前端遷移

---

## 🎯 遷移策略

### 總體原則
1. **V2 優先：** 所有新功能使用 V2 API
2. **逐步淘汰：** V1 API 標記為 `@deprecated`，將在未來移除
3. **向下兼容：** V2 API 返回格式盡量與 V1 保持一致
4. **完整性：** 所有 V1 端點都必須有對應的 V2 版本

### 架構差異

| 特性 | V1 API | V2 API |
|------|--------|--------|
| **數據儲存** | KV Store | PostgreSQL + Prisma |
| **資料一致性** | 手動維護 | 外鍵約束（ACID） |
| **查詢效能** | O(n) 前綴查詢 | O(1) 索引查詢 |
| **SSOT** | 預存姓名 | 即時 JOIN 查詢 |
| **併發控制** | 手動樂觀鎖 | Transaction |
| **推薦關係** | 手動維護樹狀結構 | 自動遞歸查詢 |

---

## 📋 API 端點對照表

### 1. 認證系統（Auth）

#### V1 API（Legacy）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/auth/check-email` | POST | ⚠️ Deprecated | Email 檢核 |
| `/auth/signup` | POST | ⚠️ Deprecated | 用戶註冊 |
| `/auth/register` | POST | ⚠️ Deprecated | 用戶資料註冊 |
| `/auth/profile` | GET | ⚠️ Deprecated | 獲取用戶資料 |

#### V2 API（Current）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/auth-v2/check-email` | POST | ✅ Active | Email 檢核（Step 0） |
| `/auth-v2/signup/step1` | POST | ✅ Active | 帳號建立（Step 1） |
| `/auth-v2/verify-email` | POST | ✅ Active | Email 驗證 |
| `/auth-v2/verify-referral-code` | POST | ✅ Active | 推薦碼驗證 |
| `/auth-v2/signup/step2` | POST | ✅ Active | 資料完善（Step 2） |
| `/auth-v2/signup/step3` | POST | ✅ Active | 支付年費（Step 3） |

**遷移建議：** 所有新註冊流程必須使用 V2 API（4 步驟流程）

---

### 2. 刊登管理（Listings）

#### V1 API（Legacy）

| 端點 | 方法 | 狀態 | 說明 | 替代方案 |
|------|------|------|------|----------|
| `/listings/active` | GET | ⚠️ Deprecated | 獲取所有活躍刊登 | `/listings-v2/active` ✅ |
| `/listings/user` | GET | ⚠️ Deprecated | 獲取用戶刊登列表 | `/listings-v2/my-listing` ✅ |
| `/listings/:id` | GET | ⚠️ Deprecated | 獲取單個刊登 | `/listings-v2/my-listing` ✅ |
| `/listings/create` | POST | ⚠️ Deprecated | 創建刊登 | `/listings-v2/create` ✅ |
| `/listings/:id` | PUT | ⚠️ Deprecated | 更新刊登 | `/listings-v2/update` ✅ |

#### V2 API（Current）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/listings-v2/active` | GET | ✅ Active | 獲取所有活躍刊登（公開） |
| `/listings-v2/my-listing` | GET | ✅ Active | 獲取我的刊登（唯一） |
| `/listings-v2/create` | POST | ✅ Active | 創建刊登（一對一） |
| `/listings-v2/update` | PUT | ✅ Active | 更新我的刊登 |
| `/listings-v2/delete` | DELETE | ✅ Active | 刪除我的刊登 |
| `/listings-v2/check-limit` | GET | ✅ Active | 檢查刊登限制 |

**遷移重點：**
- ✅ 首頁已遷移：`HomePage.tsx` 使用 `/listings-v2/active`
- ⏳ 待遷移：其他頁面如有使用 V1 API，需逐一檢查

---

### 3. 推薦系統（Referrals）

#### V1 API（Legacy）

| 端點 | 方法 | 狀態 | 說明 | 替代方案 |
|------|------|------|------|----------|
| `/referrals/my-tree` | GET | ⚠️ Deprecated | 獲取推薦樹 | `/referrals-v2/my-tree` ✅ |
| `/referrals/my-code` | GET | ⚠️ Deprecated | 獲取推薦碼 | `/referrals-v2/my-code` ✅ |

#### V2 API（Current）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/referrals-v2/my-tree` | GET | ✅ Active | 獲取三代推薦樹（SSOT） |
| `/referrals-v2/statistics` | GET | ✅ Active | 推薦統計 |
| `/referrals-v2/my-code` | GET | ✅ Active | 我的推薦碼 |

**遷移重點：**
- V2 使用 Prisma JOIN 即時查詢姓名（SSOT）
- V1 使用預存姓名（可能過時）

---

### 4. 獎勵系統（Rewards）

#### V2 API（New）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/rewards-v2/schedules` | GET | ✅ Active | 獲取獎勵排程（12 個月） |
| `/rewards-v2/history` | GET | ✅ Active | 獲取獎勵歷史 |
| `/rewards-v2/summary` | GET | ✅ Active | 獎勵摘要統計 |

**說明：** V1 無此系統，V2 全新實作

---

### 5. 訂閱系統（Subscriptions）

#### V2 API（New）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/subscriptions-v2` | GET | ✅ Active | 獲取訂閱資訊 |
| `/subscriptions-v2/cancel` | POST | ✅ Active | 取消續訂 |
| `/subscriptions-v2/renew` | POST | ✅ Active | 續訂年費 |

**說明：** V1 無此系統，V2 全新實作

---

### 6. 任務系統（Tasks）

#### V2 API（New）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/tasks-v2/progress` | GET | ✅ Active | 獲取任務進度 |
| `/tasks-v2/rewards` | GET | ✅ Active | 獲取任務獎勵 |
| `/tasks-v2/manual-update` | POST | ✅ Active | 手動更新（測試用） |

**說明：** V1 無此系統，V2 全新實作

---

### 7. 提領系統（Withdrawals）

#### V2 API（New）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/withdrawals-v2/request` | POST | ✅ Active | 申請提領 |
| `/withdrawals-v2/history` | GET | ✅ Active | 提領歷史 |
| `/withdrawals-v2/validate` | GET | ✅ Active | 驗證提領金額 |

**說明：** V1 無此系統，V2 全新實作

---

### 8. 用戶資料（Profile）

#### V2 API（New）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/profile-v2` | GET | ✅ Active | 獲取完整用戶資料 |
| `/profile-v2` | PUT | ✅ Active | 更新用戶資料 |

**說明：** V1 無此系統，V2 全新實作

---

### 9. 排程系統（Cron）

#### V2 API（New）

| 端點 | 方法 | 狀態 | 說明 |
|------|------|------|------|
| `/cron-v2/daily-status-check` | POST | ✅ Active | 每日狀態檢查 |
| `/cron-v2/daily-reward-issuance` | POST | ✅ Active | 每日獎勵發放 |
| `/cron-v2/manual-reward-issuance` | POST | ✅ Active | 手動觸發發放 |
| `/cron-v2/sync-status` | POST | ✅ Active | 手動同步狀態 |

**說明：** V1 無此系統，V2 全新實作

---

## 🔄 前端遷移檢查清單

### ✅ 已遷移

- [x] `HomePage.tsx` - 使用 `/listings-v2/active`
- [x] `ReferralManagementV2.tsx` - 使用 `/referrals-v2/my-tree`
- [x] `RewardManagementV2.tsx` - 使用 `/rewards-v2/*`
- [x] `TaskManagementV2.tsx` - 使用 `/tasks-v2/*`
- [x] `WithdrawalManagementV2.tsx` - 使用 `/withdrawals-v2/*`
- [x] `SignupFlow.tsx` - 使用 `/auth-v2/*`

### ⏳ 待檢查

**需要檢查以下組件是否還在使用 V1 API：**
- [ ] `ServiceProviderManagement.tsx` - 是否使用 `/listings/user`？
- [ ] `ServiceProviderDetail.tsx` - 是否使用 `/listings/:id`？
- [ ] `CreateServiceProvider.tsx` - 是否使用 `/listings/create`？
- [ ] `EditServiceProvider.tsx` - 是否使用 `/listings/:id`（PUT）？

---

## 🚨 遷移注意事項

### 1. 數據格式差異

**V1 刊登格式：**
```json
{
  "id": "listing_xxx",
  "name": "服務名稱",  // ❌ 手動輸入的服務名稱
  "userName": "張三",  // ❌ 預存的用戶名（可能過時）
  "category": "按摩服務",
  "photos": [...]
}
```

**V2 刊登格式：**
```json
{
  "id": "listing_xxx",
  "name": "張三",       // ✅ SSOT：即時從 users 表查詢的真實姓名
  "serviceType": "按摩服務",  // ⚠️ 欄位名稱改變（category → serviceType）
  "userId": "user_xxx",
  "accountStatus": "Active",
  "photos": [...]
}
```

**前端適配建議：**
```typescript
// 兼容兩種格式的處理
const displayName = listing.name || listing.userName;
const category = listing.serviceType || listing.category;
```

---

### 2. 認證方式差異

**V1 API：**
```typescript
// 使用 publicAnonKey（Supabase Anon Key）
headers: {
  'Authorization': `Bearer ${publicAnonKey}`
}
```

**V2 公開 API：**
```typescript
// 無需認證（如 /listings-v2/active）
// 不需要 Authorization header
```

**V2 受保護 API：**
```typescript
// 使用用戶的 access_token
const session = await supabase.auth.getSession();
headers: {
  'Authorization': `Bearer ${session.access_token}`
}
```

---

### 3. 錯誤處理差異

**V1 API：**
```typescript
if (!response.ok) {
  throw new Error('操作失敗');
}
const data = await response.json();
```

**V2 API：**
```typescript
const data = await response.json();

if (!data.success) {
  throw new Error(data.error?.message || '操作失敗');
}

// 使用 data.data 訪問實際資料
```

---

## 📝 開發規範

### 新功能開發

**必須遵守：**
1. ✅ 所有新功能使用 V2 API
2. ✅ V2 API 必須使用 PostgreSQL + Prisma
3. ✅ 遵循 SSOT 原則（姓名即時查詢）
4. ✅ 使用 Transaction 保證併發安全
5. ✅ 返回格式包含 `success` 字段

**禁止行為：**
1. ❌ 不要創建新的 V1 API
2. ❌ 不要在 V2 中使用 KV Store（除非必要）
3. ❌ 不要預存可變資料（如姓名）
4. ❌ 不要跳過 Transaction（涉及多表操作時）

---

### V1 API 維護

**允許的操作：**
- ✅ Bug 修復（僅維持現有功能）
- ✅ 添加 `@deprecated` 標記
- ✅ 添加遷移提示日誌

**禁止的操作：**
- ❌ 新增功能
- ❌ 重大重構
- ❌ 移除端點（先標記 deprecated）

---

## 🎯 遷移時間表

### Phase 1：標記階段（已完成）
- [x] 標記所有 V1 API 為 `@deprecated`
- [x] 添加遷移提示日誌
- [x] 創建 API 版本對照表

### Phase 2：主要頁面遷移（進行中）
- [x] 首頁刊登列表 → V2
- [ ] 刊登管理頁面 → V2（待檢查）
- [ ] 刊登詳情頁面 → V2（待檢查）
- [ ] 刊登創建/編輯 → V2（待檢查）

### Phase 3：測試與驗證（1 週）
- [ ] 全面測試 V2 API
- [ ] 確認所有前端頁面正常
- [ ] 性能測試（對比 V1）

### Phase 4：淘汰 V1（2 週後）
- [ ] 移除 V1 API 端點
- [ ] 清理 V1 相關代碼
- [ ] 更新文檔

---

## 🔍 遷移驗證清單

**在移除 V1 API 前，必須確認：**

### 後端檢查
- [ ] 所有 V1 端點都有對應的 V2 版本
- [ ] V2 API 返回格式與 V1 兼容
- [ ] V2 API 性能不低於 V1
- [ ] V2 API 通過所有測試

### 前端檢查
- [ ] 所有組件都不再使用 V1 API
- [ ] 所有 fetch 請求都指向 V2 端點
- [ ] 所有頁面都能正常載入數據
- [ ] 控制台無 API 錯誤

### 數據檢查
- [ ] V2 API 返回的數據正確
- [ ] SSOT 查詢正確（姓名即時更新）
- [ ] 推薦關係查詢正確
- [ ] 獎勵歷史完整

---

## 📞 聯絡與支援

**遇到遷移問題？**
1. 查看本文檔的 API 對照表
2. 檢查前端組件是否使用舊版 API
3. 查看後端日誌中的 `DEPRECATED` 警告
4. 參考 V2 API 的實作範例

**常見問題：**
- **Q: 為什麼要遷移到 V2？**
  - A: V2 使用 PostgreSQL，保證資料一致性（ACID）、效能更好（索引查詢）、支援複雜業務邏輯（Transaction）

- **Q: V1 API 什麼時候會移除？**
  - A: 所有前端遷移完成後 2 週（預計 2025-01-15）

- **Q: V2 API 是否向下兼容？**
  - A: 大部分兼容，但有些欄位名稱改變（如 `category` → `serviceType`）

---

**版本：** v1.7.2  
**最後更新：** 2024-12-21  
**維護者：** Development Team
