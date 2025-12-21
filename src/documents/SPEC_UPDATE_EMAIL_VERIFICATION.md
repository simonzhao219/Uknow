# 📝 規格更新：Email 驗證機制說明

**更新日期：** 2024-12-21  
**文件版本：** v1.0  
**更新範圍：** `/documents/NEW_SPEC_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` v1.1

---

## 📋 更新內容

### 原始理解（錯誤）

在初版計畫書中，部分描述可能讓人誤以為採用「驗證碼」機制（用戶手動輸入6位數驗證碼）。

### 正確規格（已更新）

**Email 驗證機制：** 與現有系統相同，採用 **Supabase Auth 驗證信機制**

---

## 🔄 驗證流程（正確版本）

### Step 1: 帳號建立（發送驗證信）

```
用戶操作：
1. 在註冊頁面輸入 Email 和 Password
2. 點擊「建立帳號」按鈕
   ↓
後端處理：
3. POST /auth/v2/signup/step1
4. 調用 Supabase Auth API 創建用戶
5. Supabase Auth 自動發送驗證信到用戶郵箱
6. 返回成功訊息：「驗證信已發送，請查收郵件」
   ↓
前端處理：
7. 導向等待驗證頁面 (/auth/verify-email)
8. 顯示提示：「請查收郵件並點擊驗證連結」
```

### Email 驗證

```
用戶操作：
1. 打開郵箱，收到來自 Uknow 的驗證信
2. 點擊郵件中的驗證連結
   ↓
系統處理：
3. 驗證連結格式：https://uknow.com/auth/callback?token=xxx
4. 前端 AuthCallback 組件接收請求
5. 調用 Supabase Auth API 驗證 token
6. 驗證成功，更新 Profile (emailVerified: true)
7. 根據 registrationStep 導向下一步
   - registrationStep === 1 → 導向 /signup?step=2
   - registrationStep === 2 → 導向 /signup?step=3
   - registrationStep === 3 → 導向 /dashboard
```

---

## 📊 與現有系統的一致性

### 現有系統（舊版註冊）

```
Step 1: Email/Password 註冊
   ↓
Step 2: Email 驗證（驗證信機制）✅
   → 系統發送驗證信
   → 用戶點擊郵件中的驗證連結
   → 驗證完成，導向完善資料頁面
   ↓
Step 3: 完善資料
```

### 新系統（4步驟註冊）

```
Step 0: Email 檢核
   ↓
Step 1: 帳號建立（驗證信機制）✅
   → 系統發送驗證信
   → 用戶點擊郵件中的驗證連結
   → 驗證完成，導向資料完善頁面
   ↓
Step 2: 資料完善 + 推薦碼
   ↓
Step 3: 支付年費
```

**結論：** Email 驗證機制完全相同，無需額外開發。

---

## 🔧 技術實作（Supabase Auth）

### 後端：發送驗證信

```typescript
// POST /auth/v2/signup/step1
const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
  email: email,
  password: password,
  email_confirm: false,  // ❌ 不自動確認，需要用戶點擊驗證信
});

// Supabase Auth 會自動發送驗證信到用戶郵箱
// 驗證信包含驗證連結：https://{your-domain}/auth/callback?token=xxx
```

### 前端：處理驗證回調

```typescript
// /components/AuthCallback.tsx（重用現有組件）
useEffect(() => {
  const handleCallback = async () => {
    // 1. Supabase Auth 自動處理 token 驗證
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      setStatus('error');
      setMessage('Email 驗證失敗');
      return;
    }
    
    // 2. 獲取用戶 Profile
    const profile = await fetchProfile(session.user.id);
    
    // 3. 更新 Profile（標記 Email 已驗證）
    await updateProfile(session.user.id, { emailVerified: true });
    
    // 4. 根據 registrationStep 導向下一步
    if (profile.registrationStep === 1) {
      navigate('/signup?step=2', { replace: true });
    } else if (profile.registrationStep === 2) {
      navigate('/signup?step=3', { replace: true });
    } else if (profile.registrationStep === 3) {
      navigate('/dashboard', { replace: true });
    }
  };
  
  handleCallback();
}, []);
```

---

## ✅ 更新檢查清單

- [x] Executive Summary 添加 Email 驗證機制說明
- [x] Part 1.3 現有註冊流程更新為驗證信機制
- [x] Part 2.1 註冊流程變更更新技術實作差異
- [x] Phase 2 API 規格添加驗證信說明
- [x] Phase 2 實作重點添加 Step 1 完整範例
- [x] Phase 2 前端組件添加驗證信流程說明
- [x] Phase 2 整合測試添加驗證信測試案例
- [x] 文件版本號更新為 v1.1
- [x] 添加更新記錄

---

## 🎯 總結

**規格確認：** Email 驗證機制採用 **Supabase Auth 驗證信機制**（點擊郵件連結），與現有系統完全一致。

**實作影響：**
- ✅ 無需開發新的驗證機制
- ✅ 重用現有 `AuthCallback` 組件
- ✅ 重用現有 `EmailVerificationPending` 組件
- ✅ 實作工時不變（已包含在 Phase 2 預估中）

**下一步：** 確認規格無誤後，可以開始 Phase 1 實作。
