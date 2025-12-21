# Email 驗證重發機制 - 快速參考卡

**版本：** 增強版  
**冷卻時間：** 固定 90 秒  
**最後更新：** 2024-12-15

---

## 🎯 核心功能速覽

### **關鍵數字**

| 項目 | 數值 |
|------|------|
| **固定冷卻時間** | **90 秒** |
| **建議觸發次數** | **≥ 3 次** |
| **初始冷卻計算** | **90 - (進入時間 - 註冊時間)** |

---

## 📊 按鈕狀態速查表

| 狀態 | 文字範例 | 圖標 | 可點擊 |
|------|---------|------|--------|
| **初始冷卻** | 請稍候 85 秒後可重新寄送 | ⏱️ | ❌ |
| **載入中** | 寄送中... | ⏳ | ❌ |
| **可點擊（0次）** | 重新寄出驗證信 | 🔄 | ✅ |
| **可點擊（2次）** | 重新寄出驗證信（已重發 2 次） | 🔄 | ✅ |
| **冷卻中（2次）** | 請稍候 90 秒後可重新寄送（已重發 2 次） | ⏱️ | ❌ |

---

## 🎨 提示框狀態速查表

| resendCount | 提示框類型 | 顏色 |
|------------|-----------|------|
| **0** | 基本提示 | 藍色 |
| **1** | 基本提示 + 搜尋關鍵字 | 藍色 |
| **2** | 基本提示 + 檢查促銷內容 | 藍色 |
| **3+** | 完整建議（原因 + 解決方案） | 琥珀色 |

---

## ⏱️ 冷卻時間計算範例

### **範例 1：立即進入**
```
註冊時間：10:00:00
進入頁面：10:00:05
已過時間：5 秒
冷卻剩餘：90 - 5 = 85 秒 ✅
```

### **範例 2：延遲進入**
```
註冊時間：10:00:00
進入頁面：10:00:30
已過時間：30 秒
冷卻剩餘：90 - 30 = 60 秒 ✅
```

### **範例 3：超過 90 秒**
```
註冊時間：10:00:00
進入頁面：10:02:00
已過時間：120 秒
冷卻剩餘：0 秒（可立即重發）✅
```

---

## 🔄 用戶操作流程（精簡版）

```
註冊 → 驗證頁面 → 等待 85 秒
              ↓
         點擊重發（1次）
              ↓
         等待 90 秒
              ↓
         點擊重發（2次）
              ↓
         等待 90 秒
              ↓
         點擊重發（3次）
              ↓
    顯示琥珀色建議提示框
```

---

## 💾 localStorage 使用

| 鍵名 | 值 | 用途 |
|------|----|----|
| `emailVerificationStartTime` | timestamp | 註冊時間 |
| `emailVerificationResendCount` | number | 已重發次數 |

**範例：**
```typescript
// 讀取
const startTime = parseInt(localStorage.getItem('emailVerificationStartTime') || '0');
const resendCount = parseInt(localStorage.getItem('emailVerificationResendCount') || '0');

// 保存
localStorage.setItem('emailVerificationStartTime', Date.now().toString());
localStorage.setItem('emailVerificationResendCount', '2');
```

---

## 🧪 快速���試步驟

### **測試 1：初始冷卻**
1. 註冊新帳號
2. 立即進入驗證頁面
3. **確認：** 按鈕顯示「請稍候 85-87 秒後可重新寄送」
4. **確認：** 倒數每秒減 1

### **測試 2：重發流程**
1. 等待倒數到 0
2. 點擊「重新寄出驗證信」
3. **確認：** 顯示「寄送中...」
4. **確認：** Toast 顯示成功
5. **確認：** 按鈕顯示「請稍候 90 秒後可重新寄送（已重發 1 次）」

### **測試 3：建議顯示**
1. 重複重發直到 3 次
2. **確認：** 琥珀色提示框顯示
3. **確認：** 建議內容完整

### **測試 4：刷新頁面**
1. 重發 2 次，倒數到 50 秒
2. 刷新頁面（F5）
3. **確認：** 倒數時間重新計算
4. **確認：** 重發次數保持 = 2

---

## ⚠️ 常見問題

### **Q: 為什麼初始冷卻不是 90 秒？**
A: 因為從註冊到進入驗證頁面已經過了 5-10 秒，所以初始冷卻 = 90 - 已過時間。

### **Q: 刷新頁面後冷卻會重置嗎？**
A: 不會！使用 localStorage 保存註冊時間，刷新後會重新計算剩餘冷卻時間。

### **Q: API 失敗會啟動冷卻嗎？**
A: 不會！失敗不懲罰用戶，按鈕會恢復可點擊，允許立即重試。

### **Q: 重發次數有上限嗎？**
A: 沒有！可以無限重發（每次間隔 90 秒）。

### **Q: 第幾次重發會顯示建議？**
A: �� 3 次重發後（resendCount >= 3）。

---

## 🔧 開發者 Debug 指令

### **查看 localStorage**
```javascript
// Console 輸入
console.log('Start Time:', localStorage.getItem('emailVerificationStartTime'));
console.log('Resend Count:', localStorage.getItem('emailVerificationResendCount'));
```

### **計算剩餘冷卻時間**
```javascript
const startTime = parseInt(localStorage.getItem('emailVerificationStartTime'));
const now = Date.now();
const elapsed = Math.floor((now - startTime) / 1000);
const remaining = Math.max(0, 90 - elapsed);
console.log('Cooldown Remaining:', remaining, 'seconds');
```

### **重置狀態**
```javascript
localStorage.removeItem('emailVerificationStartTime');
localStorage.removeItem('emailVerificationResendCount');
location.reload();
```

---

## 📝 代碼關鍵點

### **冷卻時間常數**
```typescript
const COOLDOWN_DURATION = 90;  // 固定 90 秒
```

### **初始冷卻計算**
```typescript
const calculateInitialCooldown = (registrationTime: number): number => {
  const now = Date.now();
  const elapsed = Math.floor((now - registrationTime) / 1000);
  
  if (elapsed >= COOLDOWN_DURATION) {
    return 0;
  }
  
  return COOLDOWN_DURATION - elapsed;
};
```

### **建議顯示條件**
```typescript
const showSuggestions = resendCount >= 3;
```

---

## 📚 相關文檔

| 文檔 | 說明 |
|------|------|
| `EMAIL_VERIFICATION_TESTING_GUIDE.md` | 完整測試指南（11 個場景） |
| `EMAIL_VERIFICATION_IMPLEMENTATION_SUMMARY.md` | 實作總結報告 |
| `EMAIL_VERIFICATION_QUICK_REFERENCE.md` | 本快速參考卡 |

---

**版本：** 1.0  
**維護者：** Figma Make AI Assistant

📖 **快速參考卡完成！**
