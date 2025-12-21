# 推薦系統開發檢查清單 ✅

**快速參考指南** - 當您開發涉及推薦關係的功能時，請使用此清單確保符合系統規範。

---

## 📋 後端開發檢查清單

### ✅ 數據存儲規範

#### 當創建新的推薦關係記錄時：

- [ ] **獲取被推薦人完整信息**
  ```typescript
  const newUserProfile = await kv.get(`user:${newListing.userId}:profile`);
  const referee = {
    userId: newListing.userId,
    userName: newUserProfile?.name || '未知用戶',
    listingId: newListing.id,
    listingName: newListing.name
  };
  ```

- [ ] **獲取推薦人完整信息（如果存在）**
  ```typescript
  let referrer = null;
  if (newListing.referrerUserId && newListing.referrerListingId) {
    const referrerProfile = await kv.get(`user:${newListing.referrerUserId}:profile`);
    const referrerListing = await kv.get(`listing:${newListing.referrerListingId}`);
    
    if (referrerProfile && referrerListing) {
      referrer = {
        userId: newListing.referrerUserId,
        userName: referrerProfile.name,
        listingId: newListing.referrerListingId,
        listingName: referrerListing.name
      };
    }
  }
  ```

- [ ] **存儲完整信息（不只是 ID）**
  ```typescript
  {
    referee: { userId, userName, listingId, listingName },
    referrer: { userId, userName, listingId, listingName } | null,
    generation: number,
    monthNumber: number,
    // ... 其他字段
  }
  ```

- [ ] **使用統一的描述格式**
  ```typescript
  const description = `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第${monthNumber}個月`;
  ```

---

### ✅ API 端點規範

#### 當創建新的 API 端點返回推薦數據時：

- [ ] **直接返回完整數據**（無需前端額外處理）
  ```typescript
  return c.json({
    success: true,
    data: {
      // 直接返回包含 referee 和 referrer 的數據
      // 無需在端點中進行額外查詢或格式化
    }
  });
  ```

- [ ] **使用 ISO 8601 格式的時間戳**
  ```typescript
  issuedAt: new Date().toISOString()  // "2024-12-15T12:34:56.789Z"
  ```

- [ ] **錯誤處理包含詳細上下文**
  ```typescript
  console.error(`❌ 處理推薦關係時發生錯誤: userId=${userId}, listingId=${listingId}`, error);
  ```

---

### ✅ 日誌記錄規範

- [ ] **成功操作日誌格式**
  ```typescript
  console.log(`✅ 操作名稱: user=${userId}, referee=${referee.userName}-${referee.listingName}`);
  ```

- [ ] **警告日誌格式**
  ```typescript
  console.warn(`⚠️ 警告信息: 具體原因`);
  ```

- [ ] **錯誤日誌格式**
  ```typescript
  console.error(`❌ 錯誤信息: 具體原因`, error);
  ```

---

## 📋 前端開發檢查清單

### ✅ TypeScript Interface 規範

#### 當定義推薦關係相關的 Interface 時：

- [ ] **包含完整的推薦關係字段**
  ```typescript
  interface RewardRecord {
    id: string;
    type: string;
    amount: number;
    description: string;
    issuedAt: string;
    
    // ✅ 必須包含
    referee?: {
      userId: string;
      userName: string;
      listingId: string;
      listingName: string;
    };
    
    // ✅ 推薦人（二代、三代才有）
    referrer?: {
      userId: string;
      userName: string;
      listingId: string;
      listingName: string;
    };
    
    generation?: number;
    monthNumber?: number;
  }
  ```

---

### ✅ 格式化工具使用規範

#### 當展示推薦關係數據時：

- [ ] **導入統一的格式化工具**
  ```typescript
  import { formatReferee, formatReferrer, formatTimestamp } from '../utils/referralFormatter';
  ```

- [ ] **格式化被推薦人信息**
  ```typescript
  formatReferee(userName, listingName)  // → "張三-台北按摩服務"
  ```

- [ ] **格式化推薦人信息**
  ```typescript
  formatReferrer(userName, listingName)  // → "李四-新北SPA"
  ```

- [ ] **格式化時間戳**
  ```typescript
  formatTimestamp(isoString)  // → "2024/12/15 12:34:56"
  ```

- [ ] **格式化日期（不含時間）**
  ```typescript
  formatDate(isoString)  // → "2024/12/15"
  ```

---

### ✅ 展示邏輯規範

#### 當展示推薦關係卡片或列表時：

- [ ] **第一行：被推薦人信息**（無空格）
  ```tsx
  <p>{record.referee.userName}-{record.referee.listingName}</p>
  ```

- [ ] **第二行或第三行：推薦人信息**（如果存在）
  ```tsx
  {record.referrer && (
    <p>推薦人：{record.referrer.userName}-{record.referrer.listingName}</p>
  )}
  ```

- [ ] **時間顯示使用統一格式**
  ```tsx
  <span>{formatTimestamp(record.issuedAt)}</span>
  ```

---

### ✅ API 請求規範

#### 當調用推薦關係相關 API 時：

- [ ] **使用統一的 API 請求工具**
  ```typescript
  import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
  ```

- [ ] **正確處理錯誤**
  ```typescript
  try {
    const result = await apiRequestJson<DataType>(buildApiUrl('/endpoint'));
    // ...
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      showToast('登入已過期，請重新登入', 'error');
      navigate('/login');
    } else {
      showToast(err instanceof Error ? err.message : '操作失敗', 'error');
    }
  }
  ```

---

## 📋 代碼審查檢查清單

### ✅ 提交前必須確認

#### 後���代碼：

- [ ] 是否在創建時一次性獲取所有需要的用戶名、刊登名稱？
- [ ] 獎勵歷史是否包含 `referee` 和 `referrer` 完整信息？
- [ ] 獎勵排程是否包含 `referee` 和 `referrer` 完整信息？
- [ ] 月度日誌是否包含 `userName`、`listingName` 和 `referrer` 信息？
- [ ] 推薦樹是否包含 `userName`、`listingName` 和 `referrer` 信息？
- [ ] API 端點是否直接返回完整數據？
- [ ] 時間戳是否使用 ISO 8601 格式？

#### 前端代碼：

- [ ] 是否導入並使用 `referralFormatter.ts` 的格式化函數？
- [ ] 時間顯示是否使用 `formatTimestamp()` 或 `formatDate()`？
- [ ] 被推薦人顯示是否使用 `formatReferee()`？
- [ ] 推薦人顯示是否使用 `formatReferrer()`？
- [ ] TypeScript interface 是否包含新的完整信息字段？
- [ ] 是否正確處理 API 錯誤（401 未登入）？

#### 一致性檢查：

- [ ] 所有中文都使用繁體中文？
- [ ] 格式化結果是否為 `{name}-{listing}` 無空格？
- [ ] 時間格式是否為 `YYYY/MM/DD HH:mm:ss` 或 `YYYY/MM/DD`？
- [ ] 是否避免重複實現格式化邏輯？
- [ ] 是否避免運行時額外查詢 KV Store？

---

## ⚠️ 常見錯誤速查

| ❌ 錯誤做法 | ✅ 正確做法 |
|-----------|-----------|
| 只存儲 `sourceUserName` | 存儲完整的 `referee` 和 `referrer` 對象 |
| `${userName} - ${listingName}` | `formatReferee(userName, listingName)` |
| `new Date().toLocaleString()` | `formatTimestamp(isoString)` |
| `await kv.get(\`user:${userId}\`)` 在運行時查詢 | 直接使用預存的 `referee.userName` |
| 在多個組件重複寫格式化邏輯 | `import { formatReferee } from ...` |
| 只存儲 `listingId` 和 `userId` | 預先獲取並存儲 `userName` 和 `listingName` |

---

## 📚 參考文檔

- **詳細設計規範：** `/guidelines/Guidelines.md` → 「獎勵溯源與數據展示架構」章節
- **實施報告：** `/docs/reward-traceability-implementation.md`
- **格式化工具源碼：** `/utils/referralFormatter.ts`

---

## 🚀 快速開始模板

### 後端：創建新的推薦關係記錄

```typescript
// 1. 獲取完整信息
const newUserProfile = await kv.get(`user:${newListing.userId}:profile`);
const referee = {
  userId: newListing.userId,
  userName: newUserProfile?.name || '未知用戶',
  listingId: newListing.id,
  listingName: newListing.name
};

let referrer = null;
if (newListing.referrerUserId && newListing.referrerListingId) {
  const referrerProfile = await kv.get(`user:${newListing.referrerUserId}:profile`);
  const referrerListing = await kv.get(`listing:${newListing.referrerListingId}`);
  
  if (referrerProfile && referrerListing) {
    referrer = {
      userId: newListing.referrerUserId,
      userName: referrerProfile.name,
      listingId: newListing.referrerListingId,
      listingName: referrerListing.name
    };
  }
}

// 2. 存儲完整信息
const record = {
  id: `record_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  referee,
  referrer,
  generation,
  monthNumber,
  issuedAt: new Date().toISOString(),
  description: `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第${monthNumber}個月`
};

await kv.set(key, record);
console.log(`✅ 記錄已創建: referee=${referee.userName}-${referee.listingName}`);
```

---

### 前端：展示推薦關係列表

```typescript
import { formatReferee, formatReferrer, formatTimestamp } from '../utils/referralFormatter';

interface ReferralRecord {
  id: string;
  referee: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  createdAt: string;
}

// 展示
records.map((record) => (
  <div key={record.id}>
    {/* 被推薦人 */}
    <p>{formatReferee(record.referee.userName, record.referee.listingName)}</p>
    
    {/* 推薦人（如果存在）*/}
    {record.referrer && (
      <p>推薦人：{formatReferrer(record.referrer.userName, record.referrer.listingName)}</p>
    )}
    
    {/* 時間 */}
    <p>{formatTimestamp(record.createdAt)}</p>
  </div>
))
```

---

**最後更新：** 2024-12-15  
**版本：** 1.0  
**維護狀態：** ✅ 活躍維護中
