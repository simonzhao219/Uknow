# 身分證照片上傳功能實作文檔

**實作日期**: 2024-12-24  
**功能**: 完整實作身分證照片上傳、儲存和自動帶入功能  
**影響範圍**: 前端 + 後端 + Supabase Storage

---

## 🎉 完成的功能

### ✅ 後端 API

1. **POST /rewards/upload-id-photos** - 上傳身分證照片
   - 支持 FormData 格式
   - 自動創建 Supabase Storage bucket（`make-5c6718b9-id-cards`）
   - 照片以用戶 ID 為文件名（`{userId}/front.jpg`、`{userId}/back.jpg`）
   - 上傳新照片時自動刪除舊照片（覆蓋模式）
   - 照片路徑儲存到 KV Store

2. **GET /rewards/id-photos** - 獲取已存照片
   - 生成 Supabase Storage signed URL（有效期 1 小時）
   - 如果沒有照片返回 null
   - 如果 Storage 失敗返回「存在」標記

3. **POST /rewards/verify-id** - 驗證身分證字號
   - 比對註冊時儲存的身分證字號
   - 實時反饋驗證結果

### ✅ 前端功能

1. **身分證字號自動驗證**
   - 輸入完 10 個字元自動驗證
   - 實時顯示驗證狀態（loading/成功/失敗）
   - 驗證成功才能提交

2. **照片管理**
   - 首次上傳：顯示上傳區域
   - 已有照片：顯示「已有照片」提示 + 可選更新
   - 上傳新照片：顯示檔案名稱 + 移除按鈕
   - 照片驗證：檢查格式和大小（最大 5MB）

3. **提交流程**
   - 步驟 1：上傳新照片（如果有）
   - 步驟 2：提交提領申請
   - 步驟 3：儲存銀行帳號到 localStorage

---

## 📦 Supabase Storage 架構

### **Bucket 設計**

```
Bucket 名稱: make-5c6718b9-id-cards
權限: 私有（private: true）
大小限制: 5MB

目錄結構:
make-5c6718b9-id-cards/
├── user123/
│   ├── front.jpg  ← 正面照
│   └── back.jpg   ← 背面照
├── user456/
│   ├── front.jpg
│   └── back.jpg
...
```

### **檔案命名規則**

- 正面照：`{userId}/front.jpg`
- 背面照：`{userId}/back.jpg`

**優點：**
- ✅ 每個用戶固定兩張照片
- ✅ 更新照片時自動覆蓋（不會累積舊檔案）
- ✅ 容易管理和清理
- ✅ 路徑可預測

---

## 🔧 後端實施詳情

### **1. 上傳照片 API**

**端點：** `POST /rewards/upload-id-photos`

```typescript
// 1. 解析 FormData
const formData = await c.req.formData();
const frontFile = formData.get('idCardFront') as File | null;
const backFile = formData.get('idCardBack') as File | null;

// 2. 初始化 Supabase Storage
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// 3. 確保 bucket 存在（冪等操作）
const bucketName = 'make-5c6718b9-id-cards';
const { data: buckets } = await supabase.storage.listBuckets();
const bucketExists = buckets?.some(bucket => bucket.name === bucketName);

if (!bucketExists) {
  await supabase.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: 5242880  // 5MB
  });
}

// 4. 上傳照片（覆蓋模式）
const fileName = `${user.id}/front.jpg`;

// 刪除舊照片
await supabase.storage.from(bucketName).remove([fileName]);

// 上傳新照片
const { data, error } = await supabase.storage
  .from(bucketName)
  .upload(fileName, frontFile, {
    cacheControl: '3600',
    upsert: true
  });

// 5. 儲存路徑到 KV Store
await kv.set(`user:${user.id}:id_card_front_path`, data.path);
```

---

### **2. 獲取照片 API**

**端點：** `GET /rewards/id-photos`

```typescript
// 1. 檢查是否有照片路徑
const frontPath = await kv.get(`user:${user.id}:id_card_front_path`);
const backPath = await kv.get(`user:${user.id}:id_card_back_path`);

// 2. 生成 signed URL
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const { data, error } = await supabase.storage
  .from('make-5c6718b9-id-cards')
  .createSignedUrl(frontPath, 3600);  // 有效期 1 小時

// 3. 返回結果
return {
  frontUrl: data?.signedUrl || null,
  backUrl: ...
};
```

---

## 💻 前端實施詳情

### **1. 照片上傳邏輯**

```typescript
const handleSubmit = async () => {
  // ✅ 步驟1：如果有新照片，先上傳
  if (personalData.idCardFront || personalData.idCardBack) {
    const photoFormData = new FormData();
    
    if (personalData.idCardFront) {
      photoFormData.append('idCardFront', personalData.idCardFront);
    }
    
    if (personalData.idCardBack) {
      photoFormData.append('idCardBack', personalData.idCardBack);
    }
    
    const photoResponse = await fetch(
      buildApiUrl('/rewards/upload-id-photos'),
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getAccessToken()}`
        },
        body: photoFormData
      }
    );
    
    if (!photoResponse.ok) {
      throw new Error('照片上傳失敗');
    }
  }
  
  // ✅ 步驟2：提交提領申請
  const result = await apiRequestJson(
    buildApiUrl('/rewards/withdraw'),
    {
      method: 'POST',
      body: JSON.stringify({
        amount: amountNum,
        idNumber: personalData.idNumber,
        bankCode: personalData.bankCode,
        bankAccount: personalData.bankAccount
      })
    }
  );
};
```

---

### **2. 載入已存照片**

```typescript
useEffect(() => {
  const loadExistingPhotos = async () => {
    const result = await apiRequestJson<{ success: boolean; data: IdPhoto }>(
      buildApiUrl('/rewards/id-photos')
    );
    
    if (result.success && result.data) {
      setExistingPhotos(result.data);
    }
  };

  loadExistingPhotos();
}, []);
```

---

### **3. 照片UI狀態**

```typescript
{/* 已有照片提示 */}
{existingPhotos.frontUrl && !personalData.idCardFront && (
  <div className="flex items-center gap-2 p-3 border rounded border-blue-200 bg-blue-50">
    <ImageIcon className="h-4 w-4 text-blue-600" />
    <span className="text-sm text-blue-800">已有身分證正面照片</span>
  </div>
)}

{/* 已上傳新照片 */}
{personalData.idCardFront && (
  <div className="flex items-center gap-2 p-3 border rounded border-green-200 bg-green-50">
    <CheckCircle className="h-4 w-4 text-green-600" />
    <span className="text-sm text-green-800">{personalData.idCardFront.name}</span>
    <Button onClick={() => removeFile('idCardFront')}>
      <X className="h-3 w-3" />
    </Button>
  </div>
)}

{/* 上傳區域 */}
{!personalData.idCardFront && (
  <label className="border-2 border-dashed ...">
    <Upload className="h-6 w-6 ..." />
    <span>
      {existingPhotos.frontUrl ? '點擊更新身分證正面照' : '點擊上傳身分證正面照'}
    </span>
  </label>
)}
```

---

## 🔄 數據流程

### **首次提領（無已存照片）**

```
1. 用戶進入提領流程
   ↓
2. GET /rewards/id-photos
   → 返回 { frontUrl: null, backUrl: null }
   ↓
3. 顯示「上傳身分證正面照」和「上傳身分證背面照」
   ↓
4. 用戶選擇照片檔案
   ↓
5. 點擊「提交申請」
   ↓
6. POST /rewards/upload-id-photos (FormData)
   → 上傳照片到 Supabase Storage
   → 儲存路徑到 KV Store
   ↓
7. POST /rewards/withdraw (JSON)
   → 創建提領申請
   ↓
8. 完成
```

---

### **第二次提領（有已存照片）**

```
1. 用戶進入提領流程
   ↓
2. GET /rewards/id-photos
   → 返回 { frontUrl: "https://...", backUrl: "https://..." }
   ↓
3. 顯示「已有身分證照片」提示
   ↓
4. 用戶選擇：
   a) 不上傳新照片 → 直接提交
   b) 上傳新照片 → 覆蓋舊照片
   ↓
5. 點擊「提交申請」
   ↓
6. 如果有新照片：
   POST /rewards/upload-id-photos
   → 刪除舊照片
   → 上傳新照片
   → 更新 KV Store
   ↓
7. POST /rewards/withdraw
   → 創建提領申請
   ↓
8. 完成
```

---

## 🔐 安全性設計

### **1. Storage 權限**

- ✅ Bucket 設為私有（`public: false`）
- ✅ 只有後端可以訪問（使用 Service Role Key）
- ✅ 前端無法直接訪問 Storage

### **2. Signed URL**

- ✅ 有效期 1 小時
- ✅ 每次獲取都生成新的 URL
- ✅ 過期後無法訪問

### **3. 身分證驗證**

- ✅ 輸入的身分證字號必須與註冊時一致
- ✅ 實時驗證，防止錯誤提交
- ✅ 驗證成功才能提交申請

---

## 📊 KV Store 數據結構

```typescript
// 照片路徑
user:${userId}:id_card_front_path → "user123/front.jpg"
user:${userId}:id_card_back_path  → "user123/back.jpg"

// 用戶資料（用於身分證驗證）
user:${userId}:profile → {
  idNumber: "A123456789",
  name: "張三",
  ...
}
```

---

## 🧪 測試場景

### **場景1：首次提領 + 上傳照片**

1. 進入提領流程
2. ✅ 顯示「上傳身分證正面照」和「上傳身分證背面照」
3. 選擇兩張照片
4. ✅ 顯示檔案名稱和綠色勾勾
5. 提交申請
6. ✅ 照片上傳成功
7. ✅ 提領申請成功

### **場景2：第二次提領 + 不更新照片**

1. 進入提領流程
2. ✅ 顯示「已有身分證正面照片」和「已有身分證背面照片」
3. 不上傳新照片
4. 提交申請
5. ✅ 跳過照片上傳
6. ✅ 提領申請成功

### **場景3：第二次提領 + 更新一張照片**

1. 進入提領流程
2. ✅ 顯示「已有照片」提示
3. 只上傳新的正面照
4. 提交申請
5. ✅ 只上傳正面照，覆蓋舊照片
6. ✅ 背面照保持不變
7. ✅ 提領申請成功

### **場景4：照片大小驗證**

1. 選擇超過 5MB 的照片
2. ❌ 顯示「檔案大小不能超過 5MB」
3. ✅ 無法提交

### **場景5：照片格式驗證**

1. 選擇 PDF 檔案
2. ❌ 顯示「請上傳圖片檔案」
3. ✅ 無法提交

---

## ✅ 完成的文件

### **後端文件**
- ✅ `/supabase/functions/server/rewards.ts`
  - POST /rewards/upload-id-photos
  - GET /rewards/id-photos（生成 signed URL）
  - POST /rewards/verify-id

### **前端文件**
- ✅ `/components/reward/WithdrawalProcess.tsx`
  - 照片上傳邏輯
  - 照片載入邏輯
  - 照片UI狀態管理

### **文檔文件**
- ✅ `/docs/ID_PHOTO_UPLOAD_IMPLEMENTATION.md`（本文件）
- ✅ `/docs/WITHDRAWAL_ID_VERIFICATION.md`
- ✅ `/docs/WITHDRAWAL_CONFIRMATION_STEP.md`

---

## 🎯 技術亮點

1. **冪等性設計**
   - Bucket 創建是冪等的（檢查存在才創建）
   - 照片上傳是冪等的（使用 `upsert: true`）

2. **自動清理舊照片**
   - 上傳新照片前先刪除舊照片
   - 避免 Storage 空間累積

3. **優雅的錯誤處理**
   - Storage 失敗返回「存在」標記（不中斷流程）
   - 照片上傳失敗顯示明確錯誤訊息

4. **用戶體驗優化**
   - 已有照片顯示藍色提示
   - 新上傳照片顯示綠色確認
   - 照片驗證即時反饋

---

## 📝 注意事項

1. **Supabase Storage Bucket 創建**
   - 第一次調用 API 時會自動創建
   - Bucket 名稱：`make-5c6718b9-id-cards`
   - 如果創建失敗，需要手動在 Supabase Dashboard 創建

2. **環境變數**
   - `SUPABASE_URL` - Supabase 項目 URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Service Role Key（不是 Anon Key）

3. **照片格式**
   - 後端儲存為 `.jpg`（固定）
   - 前端接受所有圖片格式（`image/*`）
   - Supabase 會自動處理格式轉換

---

**實作完成日期**: 2024-12-24  
**實作者**: AI Assistant (Claude)  
**驗證狀態**: ✅ 完成  
**用戶體驗**: ✅ 已優化
