# 統一金流 (PayUni) 續期收款 API 整合文件

> **版本：** v1.0  
> **最後更新：** 2025-01-16  
> **參考文件：**
> - [續期收款-支付頁API](https://docs.payuni.com.tw/web/#/7/305)
> - [續期收款狀態修改](https://docs.payuni.com.tw/web/#/7/311)
> - [續期收款訂單查詢API](https://docs.payuni.com.tw/web/#/7/320)
> - [續期收款卡號修改-支付](https://docs.payuni.com.tw/web/#/7/331)
> - [資料加密技術文件](/docs/PayUni_Encryption_Guide.md)

---

## 📋 目錄

1. [續期收款概述](#續期收款概述)
2. [核心概念與流程](#核心概念與流程)
3. [API 1：續期收款-支付頁API](#api-1續期收款-支付頁api)
4. [API 2：續期收款狀態修改](#api-2續期收款狀態修改)
5. [API 3：續期收款訂單查詢](#api-3續期收款訂單查詢)
6. [API 4：續期收款卡號修改-支付](#api-4續期收款卡號修改-支付)
7. [完整實作範例](#完整實作範例)
8. [狀態機與生命週期](#狀態機與生命週期)
9. [錯誤處理與除錯](#錯誤處理與除錯)
10. [最佳實踐與安全建議](#最佳實踐與安全建議)

---

## 續期收款概述

### 什麼是續期收款？

**續期收款（Recurring Payment / Subscription）** 是一種定期自動扣款的支付機制，適用於訂閱制服務。

#### Uknow 平台使用場景

- **年費制會員：** 使用者首次付款 $1,200，一年後自動扣款續訂
- **自動化管理：** 統一金流自動處理續期扣款，無需人工干預
- **會員狀態控制：** 可隨時暫停/恢復/取消訂閱
- **卡號更新：** 使用者可更換信用卡而不中斷訂閱

---

### 續期收款 vs 一般收款

| 項目 | 一般收款 | 續期收款 |
|------|---------|---------|
| **支付次數** | 單次 | 首次 + 週期性自動扣款 |
| **卡號儲存** | 不儲存 | 儲存信用卡資訊（加密） |
| **到期處理** | 無 | 自動扣款或通知 |
| **狀態管理** | 完成即結束 | Active/Pause/Cancel 狀態機 |
| **適用場景** | 單次購買 | 訂閱制服務 |

---

### 核心流程圖

```
┌─────────────────────────────────────────────────────────────┐
│                  使用者註冊 Uknow 平台                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  API 1: 建立續期收款訂單 + 導向支付頁                        │
│  - MerchantOrderNo: "UKNOW_SUB_user123_1705300800"          │
│  - Amt: 1200                                                 │
│  - PeriodAmt: 1200 (續期金額)                                │
│  - PeriodType: Y (年繳)                                      │
│  - PeriodPoint: 2026-01-15 (下次扣款日期)                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               使用者填寫信用卡資訊 (統一金流支付頁)            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  NotifyURL 回調：訂單狀態 = SUCCESS                           │
│  - 儲存 UP_TradeNo (續期交易編號)                             │
│  - 更新會員狀態：Active                                       │
│  - 記錄下次扣款日期：2026-01-15                               │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌──────────────────┐              ┌──────────────────────┐
│  一年後自動扣款   │              │  使用者主動操作       │
│  (統一金流處理)   │              │  - 暫停訂閱 (API 2)  │
│                  │              │  - 恢復訂閱 (API 2)  │
│  成功 → Active   │              │  - 取消訂閱 (API 2)  │
│  失敗 → Fail     │              │  - 查詢狀態 (API 3)  │
│                  │              │  - 更換卡號 (API 4)  │
└──────────────────┘              └──────────────────────┘
```

---

## 核心概念與流程

### 關鍵參數說明

| 參數名稱 | 說明 | 範例值 |
|---------|------|--------|
| `UP_TradeNo` | **續期交易編號**（統一金流回傳，唯一識別碼） | `"241215123456789"` |
| `MerchantOrderNo` | **商店訂單編號**（您自行產生，建議格式：`UKNOW_SUB_{userId}_{timestamp}`） | `"UKNOW_SUB_user123_1705300800"` |
| `PeriodAmt` | **續期金額**（每次續期扣款的金額，單位：元） | `1200` |
| `PeriodType` | **續期週期**（`D`=日、`W`=週、`M`=月、`Y`=年） | `"Y"` |
| `PeriodPoint` | **下次扣款日期**（格式：`YYYY-MM-DD`） | `"2026-01-15"` |
| `PeriodTimes` | **續期次數**（`0`=無限次，`N`=固定N次） | `0` |
| `Status` | **訂閱狀態**（`1`=啟用、`2`=暫停、`9`=取消） | `1` |

---

### 續期收款生命週期

```
建立訂單 (API 1)
    │
    ▼
首次付款 (使用者操作)
    │
    ▼
Active (啟用狀態) ←─────┐
    │                    │
    ├─→ 自動扣款成功 ───┘
    │
    ├─→ 暫停訂閱 (API 2: Status=2) → Pause
    │       │
    │       └─→ 恢復訂閱 (API 2: Status=1) → Active
    │
    └─→ 取消訂閱 (API 2: Status=9) → Cancel (結束)
```

---

## API 1：續期收款-支付頁API

### 用途

建立續期收款訂單，並將使用者導向統一金流的支付頁面，完成首次付款並綁定信用卡。

---

### API 基本資訊

- **端點：** `POST /api/upp`
- **測試環境：** `https://sandbox-api.payuni.com.tw/api/upp`
- **正式環境：** `https://api.payuni.com.tw/api/upp`
- **回應格式：** JSON
- **加密方式：** AES-256-CBC + SHA256（詳見[加密技術文件](/docs/PayUni_Encryption_Guide.md)）

---

### 請求參數

#### 必填參數

| 參數名稱 | 類型 | 說明 | 範例值 |
|---------|------|------|--------|
| `MerchantID` | String | 特店編號 | `"MS123456789"` |
| `MerchantOrderNo` | String | 商店訂單編號（唯一，建議格式：`UKNOW_SUB_{userId}_{timestamp}`） | `"UKNOW_SUB_user123_1705300800"` |
| `ProdDesc` | String | 商品描述 | `"Uknow平台年費訂閱"` |
| `Amt` | Integer | 首次付款金額（單位：元） | `1200` |
| `PeriodAmt` | Integer | 續期金額（每次自動扣款的金額，單位：元） | `1200` |
| `PeriodType` | String | 續期週期（`D`=日、`W`=週、`M`=月、`Y`=年） | `"Y"` |
| `PeriodPoint` | String | 下次扣款日期（格式：`YYYY-MM-DD`） | `"2026-01-15"` |
| `PeriodTimes` | Integer | 續期次數（`0`=無限次，`N`=固定N次） | `0` |
| `ReturnURL` | String | 支付完成後導向的前端頁面 | `"https://uknow.com.tw/payment/return"` |
| `NotifyURL` | String | 支付結果非同步通知的後端API | `"https://uknow.com.tw/api/payment/notify"` |
| `Email` | String | 使用者電子郵件 | `"user@example.com"` |

#### 選填參數

| 參數名稱 | 類型 | 說明 | 範例值 |
|---------|------|------|--------|
| `PeriodStartType` | Integer | 續期起始類型（`1`=首次授權成功後開始計算、`2`=自訂日期開始） | `1` |
| `PaymentInfo` | String | 付款說明 | `"年費會員資格"` |

---

### 請求範例

#### TypeScript 實作

```typescript
import { encryptPayUniData } from './payuni-encryption';
import { buildApiUrl } from '../utils/apiClient';

interface CreateRecurringOrderParams {
  userId: string;
  userEmail: string;
  amount: number;
  periodAmount: number;
  nextBillingDate: string;  // YYYY-MM-DD
}

/**
 * 建立續期收款訂單
 */
export async function createRecurringOrder(params: CreateRecurringOrderParams) {
  const { userId, userEmail, amount, periodAmount, nextBillingDate } = params;
  
  // 1. 生成商店訂單編號
  const timestamp = Math.floor(Date.now() / 1000);
  const merchantOrderNo = `UKNOW_SUB_${userId}_${timestamp}`;
  
  // 2. 準備交易資料
  const tradeData = {
    MerchantID: process.env.PAYUNI_MERCHANT_ID!,
    MerchantOrderNo: merchantOrderNo,
    ProdDesc: 'Uknow平台年費訂閱',
    Amt: amount,
    PeriodAmt: periodAmount,
    PeriodType: 'Y',  // 年繳
    PeriodPoint: nextBillingDate,
    PeriodTimes: 0,  // 無限次續期
    PeriodStartType: 1,  // 首次授權成功後開始
    ReturnURL: `https://${process.env.DOMAIN}/payment/return`,
    NotifyURL: `https://${process.env.DOMAIN}/api/payment/notify`,
    Email: userEmail
  };
  
  console.log('建立續期訂單:', merchantOrderNo);
  
  // 3. 加密交易資料
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    tradeData,
    process.env.PAYUNI_HASH_KEY!,
    process.env.PAYUNI_HASH_IV!
  );
  
  // 4. 發送到統一金流
  const response = await fetch('https://sandbox-api.payuni.com.tw/api/upp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      MerchantID: tradeData.MerchantID,
      EncryptInfo: EncryptInfo,
      HashInfo: HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    console.log('✅ 訂單建立成功，導向支付頁:', result.Result.PaymentURL);
    
    return {
      success: true,
      merchantOrderNo: merchantOrderNo,
      paymentUrl: result.Result.PaymentURL
    };
  } else {
    console.error('❌ 訂單建立失敗:', result.Message);
    throw new Error(result.Message);
  }
}
```

---

### 回應範例

#### 成功回應

```json
{
  "Status": "SUCCESS",
  "Message": "成功",
  "Result": {
    "MerchantID": "MS123456789",
    "MerchantOrderNo": "UKNOW_SUB_user123_1705300800",
    "PaymentURL": "https://sandbox-payment.payuni.com.tw/upp?token=abc123xyz"
  }
}
```

**說明：**
- `PaymentURL`：將使用者導向此 URL 完成付款
- 使用者完成付款後，統一金流會：
  1. 將使用者導回 `ReturnURL`
  2. 發送付款結果到 `NotifyURL`（**重要：訂單狀態以此為準**）

---

#### 失敗回應

```json
{
  "Status": "ERROR",
  "Message": "訂單編號重複"
}
```

---

### NotifyURL 回調處理

#### 回調資料格式

統一金流會發送 POST 請求到您的 `NotifyURL`，內容為加密的交易結果：

```json
{
  "MerchantID": "MS123456789",
  "EncryptInfo": "a1b2c3d4e5f6...",
  "HashInfo": "A1B2C3D4E5F6..."
}
```

#### 解密後的資料

```json
{
  "Status": "SUCCESS",
  "Message": "付款成功",
  "MerchantID": "MS123456789",
  "MerchantOrderNo": "UKNOW_SUB_user123_1705300800",
  "TradeNo": "241215001234567",
  "UP_TradeNo": "241215123456789",  // ⚠️ 重要：續期交易編號，必須儲存！
  "Amt": 1200,
  "CardNo": "************1234",
  "PaymentDate": "2025-01-15 12:34:56"
}
```

#### 後端處理範例

```typescript
import { decryptPayUniResponse } from './payuni-encryption';

/**
 * 處理統一金流的付款通知
 */
export async function handlePaymentNotify(request: Request) {
  const { MerchantID, EncryptInfo, HashInfo } = await request.json();
  
  console.log('收到付款通知:', MerchantID);
  
  // 1. 解密並驗證簽章
  const decryptedData = decryptPayUniResponse(
    EncryptInfo,
    HashInfo,
    process.env.PAYUNI_HASH_KEY!,
    process.env.PAYUNI_HASH_IV!
  );
  
  if (!decryptedData) {
    console.error('❌ 簽章驗證失敗');
    return new Response('簽章驗證失敗', { status: 400 });
  }
  
  console.log('解密後的資料:', decryptedData);
  
  // 2. 檢查付款狀態
  if (decryptedData.Status === 'SUCCESS') {
    const { MerchantOrderNo, UP_TradeNo, Amt, CardNo, PaymentDate } = decryptedData;
    
    console.log(`✅ 付款成功：訂單 ${MerchantOrderNo}，金額 ${Amt}`);
    
    // 3. 更新資料庫
    await updateSubscriptionStatus({
      merchantOrderNo: MerchantOrderNo,
      upTradeNo: UP_TradeNo,  // ⚠️ 儲存續期交易編號
      status: 'active',
      cardLastFour: CardNo.slice(-4),
      paidAt: PaymentDate,
      nextBillingDate: calculateNextBillingDate()  // 一年後
    });
    
    console.log('✅ 訂閱狀態已更新');
  } else {
    console.error(`❌ 付款失敗：${decryptedData.Message}`);
    
    await updateSubscriptionStatus({
      merchantOrderNo: decryptedData.MerchantOrderNo,
      status: 'failed',
      errorMessage: decryptedData.Message
    });
  }
  
  // 4. 回應統一金流（必須返回 "SUCCESS"）
  return new Response('SUCCESS', { status: 200 });
}
```

---

## API 2：續期收款狀態修改

### 用途

修改訂閱狀態（暫停/恢復/取消），用於會員管理功能。

---

### API 基本資訊

- **端點：** `POST /api/trade/upp/close`
- **測試環境：** `https://sandbox-api.payuni.com.tw/api/trade/upp/close`
- **正式環境：** `https://api.payuni.com.tw/api/trade/upp/close`

---

### 請求參數

| 參數名稱 | 類型 | 說明 | 範例值 |
|---------|------|------|--------|
| `MerchantID` | String | 特店編號 | `"MS123456789"` |
| `UP_TradeNo` | String | 續期交易編號（由 API 1 回傳） | `"241215123456789"` |
| `Status` | Integer | 訂閱狀態（`1`=啟用、`2`=暫停、`9`=取消） | `2` |

#### Status 狀態說明

| 值 | 狀態 | 說明 | 可逆性 |
|----|------|------|--------|
| `1` | **啟用（Active）** | 正常續期，到期自動扣款 | - |
| `2` | **暫停（Pause）** | 暫停自動扣款，可隨時恢復 | ✅ 可恢復為 `1` |
| `9` | **取消（Cancel）** | 永久取消訂閱，刪除信用卡資訊 | ❌ 不可逆，需重新建立訂單 |

---

### 請求範例

#### TypeScript 實作

```typescript
/**
 * 修改訂閱狀態
 */
export async function updateSubscriptionStatus(
  upTradeNo: string,
  status: 1 | 2 | 9
) {
  const statusNames = { 1: '啟用', 2: '暫停', 9: '取消' };
  
  console.log(`修改訂閱狀態 ${upTradeNo} → ${statusNames[status]}`);
  
  // 1. 準備交易資料
  const tradeData = {
    MerchantID: process.env.PAYUNI_MERCHANT_ID!,
    UP_TradeNo: upTradeNo,
    Status: status
  };
  
  // 2. 加密
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    tradeData,
    process.env.PAYUNI_HASH_KEY!,
    process.env.PAYUNI_HASH_IV!
  );
  
  // 3. 發送請求
  const response = await fetch('https://sandbox-api.payuni.com.tw/api/trade/upp/close', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      MerchantID: tradeData.MerchantID,
      EncryptInfo: EncryptInfo,
      HashInfo: HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    console.log(`✅ 訂閱狀態已修改為：${statusNames[status]}`);
    
    // 4. 更新資料庫
    await updateLocalSubscription(upTradeNo, status);
    
    return { success: true };
  } else {
    console.error('❌ 狀態修改失敗:', result.Message);
    throw new Error(result.Message);
  }
}
```

---

### 回應範例

#### 成功回應

```json
{
  "Status": "SUCCESS",
  "Message": "成功",
  "Result": {
    "MerchantID": "MS123456789",
    "UP_TradeNo": "241215123456789",
    "Status": "2"
  }
}
```

---

### 使用場景範例

#### 場景 1：使用者取消訂閱

```typescript
// 1. 使用者點擊「取消訂閱」按鈕
async function handleCancelSubscription(userId: string) {
  // 2. 從資料庫獲取 UP_TradeNo
  const subscription = await getSubscription(userId);
  
  if (!subscription.upTradeNo) {
    throw new Error('找不到訂閱資訊');
  }
  
  // 3. 呼叫統一金流 API
  await updateSubscriptionStatus(subscription.upTradeNo, 9);
  
  // 4. 更新本地資料庫
  await updateLocalSubscription(subscription.upTradeNo, 9);
  
  console.log('✅ 訂閱已取消');
}
```

#### 場景 2：使用者暫停訂閱（寬限期）

```typescript
// 使用者付款失敗後，進入 7 天寬限期
async function handlePaymentFailed(userId: string) {
  const subscription = await getSubscription(userId);
  
  // 暫停自動扣款
  await updateSubscriptionStatus(subscription.upTradeNo, 2);
  
  // 設定寬限期到期日（7天後）
  await setGracePeriodExpiry(userId, addDays(new Date(), 7));
  
  console.log('⏸️ 訂閱已暫停，進入寬限期');
}
```

#### 場景 3：使用者恢復訂閱

```typescript
// 使用者在寬限期內補繳費用後，恢復訂閱
async function handleResumeSubscription(userId: string) {
  const subscription = await getSubscription(userId);
  
  // 恢復自動扣款
  await updateSubscriptionStatus(subscription.upTradeNo, 1);
  
  console.log('▶️ 訂閱已恢復');
}
```

---

## API 3：續期收款訂單查詢

### 用途

查詢訂閱的詳細資訊，包括當前狀態、下次扣款日期、扣款歷史等。

---

### API 基本資訊

- **端點：** `POST /api/trade/query/upp`
- **測試環境：** `https://sandbox-api.payuni.com.tw/api/trade/query/upp`
- **正式環境：** `https://api.payuni.com.tw/api/trade/query/upp`

---

### 請求參數

| 參數名稱 | 類型 | 說明 | 範例值 |
|---------|------|------|--------|
| `MerchantID` | String | 特店編號 | `"MS123456789"` |
| `UP_TradeNo` | String | 續期交易編號 | `"241215123456789"` |

---

### 請求範例

```typescript
/**
 * 查詢訂閱詳情
 */
export async function querySubscription(upTradeNo: string) {
  console.log('查詢訂閱:', upTradeNo);
  
  // 1. 準備查詢資料
  const queryData = {
    MerchantID: process.env.PAYUNI_MERCHANT_ID!,
    UP_TradeNo: upTradeNo
  };
  
  // 2. 加密
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    queryData,
    process.env.PAYUNI_HASH_KEY!,
    process.env.PAYUNI_HASH_IV!
  );
  
  // 3. 發送請求
  const response = await fetch('https://sandbox-api.payuni.com.tw/api/trade/query/upp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      MerchantID: queryData.MerchantID,
      EncryptInfo: EncryptInfo,
      HashInfo: HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    // 4. 解密回應
    const decryptedData = decryptPayUniResponse(
      result.Result.EncryptInfo,
      result.Result.HashInfo,
      process.env.PAYUNI_HASH_KEY!,
      process.env.PAYUNI_HASH_IV!
    );
    
    console.log('訂閱詳情:', decryptedData);
    
    return {
      success: true,
      data: {
        upTradeNo: decryptedData.UP_TradeNo,
        merchantOrderNo: decryptedData.MerchantOrderNo,
        status: decryptedData.Status,
        periodAmt: decryptedData.PeriodAmt,
        periodType: decryptedData.PeriodType,
        nextBillingDate: decryptedData.PeriodPoint,
        cardLastFour: decryptedData.CardNo?.slice(-4),
        createdAt: decryptedData.CreateTime,
        lastBillingDate: decryptedData.LastPayTime
      }
    };
  } else {
    console.error('❌ 查詢失敗:', result.Message);
    throw new Error(result.Message);
  }
}
```

---

### 回應範例

#### 成功回應

```json
{
  "Status": "SUCCESS",
  "Message": "查詢成功",
  "Result": {
    "EncryptInfo": "...",
    "HashInfo": "..."
  }
}
```

#### 解密後的資料

```json
{
  "UP_TradeNo": "241215123456789",
  "MerchantOrderNo": "UKNOW_SUB_user123_1705300800",
  "Status": "1",
  "PeriodAmt": 1200,
  "PeriodType": "Y",
  "PeriodPoint": "2026-01-15",
  "PeriodTimes": 0,
  "CardNo": "************1234",
  "CreateTime": "2025-01-15 12:34:56",
  "LastPayTime": "2025-01-15 12:34:56",
  "PaymentHistory": [
    {
      "PaymentDate": "2025-01-15 12:34:56",
      "Amt": 1200,
      "Status": "SUCCESS"
    }
  ]
}
```

---

### 使用場景範例

#### 場景 1：顯示訂閱詳情給使用者

```typescript
// 會員中心顯示訂閱資訊
async function displaySubscriptionInfo(userId: string) {
  const subscription = await getSubscription(userId);
  
  if (!subscription.upTradeNo) {
    return { hasSubscription: false };
  }
  
  // 查詢最新狀態
  const details = await querySubscription(subscription.upTradeNo);
  
  return {
    hasSubscription: true,
    status: details.data.status === '1' ? '啟用中' : '已暫停',
    nextBillingDate: details.data.nextBillingDate,
    amount: details.data.periodAmt,
    cardLastFour: details.data.cardLastFour
  };
}
```

#### 場景 2：同步訂閱狀態（定期排程）

```typescript
// 每日凌晨同步所有訂閱狀態
async function syncAllSubscriptions() {
  const activeSubscriptions = await getAllActiveSubscriptions();
  
  for (const sub of activeSubscriptions) {
    try {
      const details = await querySubscription(sub.upTradeNo);
      
      // 更新本地資料庫
      await updateLocalSubscription(sub.upTradeNo, details.data.status);
      
      console.log(`✅ 同步成功: ${sub.upTradeNo}`);
    } catch (error) {
      console.error(`❌ 同步失敗: ${sub.upTradeNo}`, error);
    }
  }
}
```

---

## API 4：續期收款卡號修改-支付

### 用途

允許使用者更換信用卡而不中斷訂閱，適用於卡片過期或更換銀行等場景。

---

### API 基本資訊

- **端點：** `POST /api/upp/modify`
- **測試環境：** `https://sandbox-api.payuni.com.tw/api/upp/modify`
- **正式環境：** `https://api.payuni.com.tw/api/upp/modify`

---

### 請求參數

| 參數名稱 | 類型 | 說明 | 範例值 |
|---------|------|------|--------|
| `MerchantID` | String | 特店編號 | `"MS123456789"` |
| `UP_TradeNo` | String | 續期交易編號 | `"241215123456789"` |
| `ReturnURL` | String | 支付完成後導向的前端頁面 | `"https://uknow.com.tw/payment/card-update-return"` |
| `NotifyURL` | String | 支付結果非同步通知的後端API | `"https://uknow.com.tw/api/payment/card-update-notify"` |

---

### 請求範例

```typescript
/**
 * 建立卡號修改訂單
 */
export async function createCardUpdateOrder(upTradeNo: string) {
  console.log('建立卡號修改訂單:', upTradeNo);
  
  // 1. 準備交易資料
  const tradeData = {
    MerchantID: process.env.PAYUNI_MERCHANT_ID!,
    UP_TradeNo: upTradeNo,
    ReturnURL: `https://${process.env.DOMAIN}/payment/card-update-return`,
    NotifyURL: `https://${process.env.DOMAIN}/api/payment/card-update-notify`
  };
  
  // 2. 加密
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    tradeData,
    process.env.PAYUNI_HASH_KEY!,
    process.env.PAYUNI_HASH_IV!
  );
  
  // 3. 發送請求
  const response = await fetch('https://sandbox-api.payuni.com.tw/api/upp/modify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      MerchantID: tradeData.MerchantID,
      EncryptInfo: EncryptInfo,
      HashInfo: HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    console.log('✅ 卡號修改訂單建立成功，導向支付頁:', result.Result.PaymentURL);
    
    return {
      success: true,
      paymentUrl: result.Result.PaymentURL
    };
  } else {
    console.error('❌ 卡號修改訂單建立失敗:', result.Message);
    throw new Error(result.Message);
  }
}
```

---

### 回應範例

#### 成功回應

```json
{
  "Status": "SUCCESS",
  "Message": "成功",
  "Result": {
    "MerchantID": "MS123456789",
    "UP_TradeNo": "241215123456789",
    "PaymentURL": "https://sandbox-payment.payuni.com.tw/upp/modify?token=xyz789abc"
  }
}
```

---

### NotifyURL 回調處理

#### 回調資料格式（解密後）

```json
{
  "Status": "SUCCESS",
  "Message": "卡號修改成功",
  "UP_TradeNo": "241215123456789",
  "CardNo": "************5678",
  "UpdateTime": "2025-06-15 14:30:00"
}
```

#### 後端處理範例

```typescript
/**
 * 處理卡號修改通知
 */
export async function handleCardUpdateNotify(request: Request) {
  const { MerchantID, EncryptInfo, HashInfo } = await request.json();
  
  console.log('收到卡號修改通知:', MerchantID);
  
  // 1. 解密
  const decryptedData = decryptPayUniResponse(
    EncryptInfo,
    HashInfo,
    process.env.PAYUNI_HASH_KEY!,
    process.env.PAYUNI_HASH_IV!
  );
  
  if (!decryptedData) {
    console.error('❌ 簽章驗證失敗');
    return new Response('簽章驗證失敗', { status: 400 });
  }
  
  // 2. 檢查修改狀態
  if (decryptedData.Status === 'SUCCESS') {
    const { UP_TradeNo, CardNo, UpdateTime } = decryptedData;
    
    console.log(`✅ 卡號修改成功：${UP_TradeNo} → ${CardNo}`);
    
    // 3. 更新資料庫
    await updateCardInfo({
      upTradeNo: UP_TradeNo,
      cardLastFour: CardNo.slice(-4),
      updatedAt: UpdateTime
    });
    
    console.log('✅ 卡號資訊已更新');
  } else {
    console.error(`❌ 卡號修改失敗：${decryptedData.Message}`);
  }
  
  // 4. 回應統一金流
  return new Response('SUCCESS', { status: 200 });
}
```

---

### 使用場景範例

#### 場景 1：使用者主動更換信用卡

```typescript
// 會員中心點擊「更換信用卡」
async function handleUpdateCard(userId: string) {
  // 1. 獲取訂閱資訊
  const subscription = await getSubscription(userId);
  
  if (!subscription.upTradeNo) {
    throw new Error('找不到訂閱資訊');
  }
  
  // 2. 建立卡號修改訂單
  const result = await createCardUpdateOrder(subscription.upTradeNo);
  
  // 3. 導向支付頁
  window.location.href = result.paymentUrl;
}
```

#### 場景 2：信用卡過期提醒

```typescript
// 定期檢查信用卡是否即將過期（每月1號執行）
async function checkExpiringCards() {
  const subscriptions = await getAllActiveSubscriptions();
  const nextMonth = addMonths(new Date(), 1);
  
  for (const sub of subscriptions) {
    // 查詢訂閱詳情
    const details = await querySubscription(sub.upTradeNo);
    
    // 如果卡片即將過期，發送通知
    if (isCardExpiringSoon(details.data.cardLastFour, nextMonth)) {
      await sendEmailNotification(sub.userId, {
        subject: '信用卡即將過期提醒',
        message: '您的信用卡即將過期，請更新卡號以繼續訂閱。',
        updateUrl: `/settings/update-card`
      });
      
      console.log(`📧 已發送過期提醒: ${sub.userId}`);
    }
  }
}
```

---

## 完整實作範例

### 後端整合（Supabase Edge Functions）

#### 檔案結構

```
/supabase/functions/server/
├── payuni.ts              # PayUni API 整合模組
├── payuni_encryption.ts   # 加密/解密工具
├── subscriptions.ts       # 訂閱管理邏輯
└── index.tsx              # 主路由
```

---

#### payuni.ts - PayUni API 整合模組

```typescript
import { encryptPayUniData, decryptPayUniResponse } from './payuni_encryption';

// 環境變數
const PAYUNI_CONFIG = {
  merchantId: Deno.env.get('PAYUNI_MERCHANT_ID')!,
  hashKey: Deno.env.get('PAYUNI_HASH_KEY')!,
  hashIV: Deno.env.get('PAYUNI_HASH_IV')!,
  apiUrl: Deno.env.get('PAYUNI_API_URL') || 'https://sandbox-api.payuni.com.tw',
  domain: Deno.env.get('DOMAIN')!
};

/**
 * 建立續期收款訂單
 */
export async function createRecurringPayment(params: {
  userId: string;
  userEmail: string;
  amount: number;
}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const merchantOrderNo = `UKNOW_SUB_${params.userId}_${timestamp}`;
  
  // 計算下次扣款日期（一年後）
  const nextBillingDate = new Date();
  nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
  const periodPoint = nextBillingDate.toISOString().split('T')[0];  // YYYY-MM-DD
  
  const tradeData = {
    MerchantID: PAYUNI_CONFIG.merchantId,
    MerchantOrderNo: merchantOrderNo,
    ProdDesc: 'Uknow平台年費訂閱',
    Amt: params.amount,
    PeriodAmt: params.amount,
    PeriodType: 'Y',
    PeriodPoint: periodPoint,
    PeriodTimes: 0,
    PeriodStartType: 1,
    ReturnURL: `https://${PAYUNI_CONFIG.domain}/payment/return`,
    NotifyURL: `https://${PAYUNI_CONFIG.domain}/api/payment/notify`,
    Email: params.userEmail
  };
  
  console.log('[PayUni] 建立續期訂單:', merchantOrderNo);
  
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    tradeData,
    PAYUNI_CONFIG.hashKey,
    PAYUNI_CONFIG.hashIV
  );
  
  const response = await fetch(`${PAYUNI_CONFIG.apiUrl}/api/upp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      MerchantID: PAYUNI_CONFIG.merchantId,
      EncryptInfo,
      HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    console.log('[PayUni] ✅ 訂單建立成功');
    return {
      success: true,
      merchantOrderNo,
      paymentUrl: result.Result.PaymentURL
    };
  } else {
    console.error('[PayUni] ❌ 訂單建立失敗:', result.Message);
    throw new Error(result.Message);
  }
}

/**
 * 修改訂閱狀態
 */
export async function updateSubscriptionStatus(
  upTradeNo: string,
  status: 1 | 2 | 9
) {
  const tradeData = {
    MerchantID: PAYUNI_CONFIG.merchantId,
    UP_TradeNo: upTradeNo,
    Status: status
  };
  
  console.log(`[PayUni] 修改訂閱狀態: ${upTradeNo} → ${status}`);
  
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    tradeData,
    PAYUNI_CONFIG.hashKey,
    PAYUNI_CONFIG.hashIV
  );
  
  const response = await fetch(`${PAYUNI_CONFIG.apiUrl}/api/trade/upp/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      MerchantID: PAYUNI_CONFIG.merchantId,
      EncryptInfo,
      HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    console.log('[PayUni] ✅ 狀態修改成功');
    return { success: true };
  } else {
    console.error('[PayUni] ❌ 狀態修改失敗:', result.Message);
    throw new Error(result.Message);
  }
}

/**
 * 查詢訂閱詳情
 */
export async function querySubscription(upTradeNo: string) {
  const queryData = {
    MerchantID: PAYUNI_CONFIG.merchantId,
    UP_TradeNo: upTradeNo
  };
  
  console.log('[PayUni] 查詢訂閱:', upTradeNo);
  
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    queryData,
    PAYUNI_CONFIG.hashKey,
    PAYUNI_CONFIG.hashIV
  );
  
  const response = await fetch(`${PAYUNI_CONFIG.apiUrl}/api/trade/query/upp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      MerchantID: PAYUNI_CONFIG.merchantId,
      EncryptInfo,
      HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    const decryptedData = decryptPayUniResponse(
      result.Result.EncryptInfo,
      result.Result.HashInfo,
      PAYUNI_CONFIG.hashKey,
      PAYUNI_CONFIG.hashIV
    );
    
    console.log('[PayUni] ✅ 查詢成功');
    return { success: true, data: decryptedData };
  } else {
    console.error('[PayUni] ❌ 查詢失敗:', result.Message);
    throw new Error(result.Message);
  }
}

/**
 * 建立卡號修改訂單
 */
export async function createCardUpdateOrder(upTradeNo: string) {
  const tradeData = {
    MerchantID: PAYUNI_CONFIG.merchantId,
    UP_TradeNo: upTradeNo,
    ReturnURL: `https://${PAYUNI_CONFIG.domain}/payment/card-update-return`,
    NotifyURL: `https://${PAYUNI_CONFIG.domain}/api/payment/card-update-notify`
  };
  
  console.log('[PayUni] 建立卡號修改訂單:', upTradeNo);
  
  const { EncryptInfo, HashInfo } = encryptPayUniData(
    tradeData,
    PAYUNI_CONFIG.hashKey,
    PAYUNI_CONFIG.hashIV
  );
  
  const response = await fetch(`${PAYUNI_CONFIG.apiUrl}/api/upp/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      MerchantID: PAYUNI_CONFIG.merchantId,
      EncryptInfo,
      HashInfo
    })
  });
  
  const result = await response.json();
  
  if (result.Status === 'SUCCESS') {
    console.log('[PayUni] ✅ 卡號修改訂單建立成功');
    return {
      success: true,
      paymentUrl: result.Result.PaymentURL
    };
  } else {
    console.error('[PayUni] ❌ 卡號修改訂單建立失敗:', result.Message);
    throw new Error(result.Message);
  }
}

/**
 * 處理付款通知（NotifyURL 回調）
 */
export function handlePaymentNotify(encryptInfo: string, hashInfo: string) {
  console.log('[PayUni] 收到付款通知');
  
  const decryptedData = decryptPayUniResponse(
    encryptInfo,
    hashInfo,
    PAYUNI_CONFIG.hashKey,
    PAYUNI_CONFIG.hashIV
  );
  
  if (!decryptedData) {
    console.error('[PayUni] ❌ 簽章驗證失敗');
    return null;
  }
  
  console.log('[PayUni] ✅ 簽章驗證成功');
  return decryptedData;
}
```

---

#### subscriptions.ts - 訂閱管理邏輯

```typescript
import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store';
import * as payuni from './payuni';
import { createClient } from '../../utils/supabase/client';

const subscriptions = new Hono();

/**
 * POST /subscriptions/create
 * 建立續期收款訂單
 */
subscriptions.post('/create', async (c) => {
  try {
    const supabase = createClient();
    
    // 1. 驗證使用者
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user) {
      console.error('[Subscription] 未登入:', error);
      return c.json({ error: { message: '請先登入' } }, 401);
    }
    
    // 2. 檢查是否已有訂閱
    const existingSubscription = await kv.get(`user:${user.id}:subscription`);
    
    if (existingSubscription && existingSubscription.status === 'active') {
      console.error('[Subscription] 使用者已有啟用中的訂閱');
      return c.json({ error: { message: '您已有啟用中的訂閱' } }, 400);
    }
    
    // 3. 獲取使用者資料
    const userProfile = await kv.get(`user:${user.id}:profile`);
    
    if (!userProfile || !userProfile.email) {
      console.error('[Subscription] 找不到使用者 email');
      return c.json({ error: { message: '找不到使用者資料' } }, 400);
    }
    
    // 4. 建立續期訂單
    const result = await payuni.createRecurringPayment({
      userId: user.id,
      userEmail: userProfile.email,
      amount: 1200
    });
    
    // 5. 儲存訂單資訊到 KV Store
    await kv.set(`user:${user.id}:subscription`, {
      merchantOrderNo: result.merchantOrderNo,
      status: 'pending',  // 等待付款
      amount: 1200,
      createdAt: new Date().toISOString()
    });
    
    console.log('[Subscription] ✅ 訂單建立成功:', result.merchantOrderNo);
    
    return c.json({
      success: true,
      data: {
        merchantOrderNo: result.merchantOrderNo,
        paymentUrl: result.paymentUrl
      }
    });
    
  } catch (error) {
    console.error('[Subscription] ❌ 建立訂單失敗:', error);
    return c.json({ error: { message: error.message } }, 500);
  }
});

/**
 * POST /subscriptions/notify
 * 處理統一金流的付款通知
 */
subscriptions.post('/notify', async (c) => {
  try {
    const { MerchantID, EncryptInfo, HashInfo } = await c.req.json();
    
    console.log('[Subscription] 收到付款通知:', MerchantID);
    
    // 1. 解密並驗證
    const decryptedData = payuni.handlePaymentNotify(EncryptInfo, HashInfo);
    
    if (!decryptedData) {
      console.error('[Subscription] ❌ 簽章驗證失敗');
      return new Response('簽章驗證失敗', { status: 400 });
    }
    
    console.log('[Subscription] 解密後的資料:', decryptedData);
    
    // 2. 解析訂單編號，取得 userId
    const merchantOrderNo = decryptedData.MerchantOrderNo;
    const userId = merchantOrderNo.split('_')[2];  // UKNOW_SUB_{userId}_{timestamp}
    
    if (!userId) {
      console.error('[Subscription] ❌ 無效的訂單編號:', merchantOrderNo);
      return new Response('無效的訂單編號', { status: 400 });
    }
    
    // 3. 檢查付款狀態
    if (decryptedData.Status === 'SUCCESS') {
      const { UP_TradeNo, Amt, CardNo, PaymentDate } = decryptedData;
      
      console.log(`[Subscription] ✅ 付款成功: ${merchantOrderNo}, 金額: ${Amt}`);
      
      // 4. 計算下次扣款日期（一年後）
      const nextBillingDate = new Date();
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      
      // 5. 更新訂閱狀態
      await kv.set(`user:${userId}:subscription`, {
        merchantOrderNo,
        upTradeNo: UP_TradeNo,  // ⚠️ 儲存續期交易編號
        status: 'active',
        amount: Amt,
        cardLastFour: CardNo.slice(-4),
        createdAt: PaymentDate,
        nextBillingDate: nextBillingDate.toISOString().split('T')[0],
        lastBillingDate: PaymentDate
      });
      
      // 6. 更新使用者會員狀態
      const userProfile = await kv.get(`user:${userId}:profile`);
      if (userProfile) {
        userProfile.accountStatus = 'Active';
        await kv.set(`user:${userId}:profile`, userProfile);
      }
      
      console.log('[Subscription] ✅ 訂閱狀態已更新');
      
    } else {
      console.error(`[Subscription] ❌ 付款失敗: ${decryptedData.Message}`);
      
      await kv.set(`user:${userId}:subscription`, {
        merchantOrderNo,
        status: 'failed',
        errorMessage: decryptedData.Message,
        failedAt: new Date().toISOString()
      });
    }
    
    // 7. 回應統一金流（必須返回 "SUCCESS"）
    return new Response('SUCCESS', { status: 200 });
    
  } catch (error) {
    console.error('[Subscription] ❌ 處理付款通知失敗:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

/**
 * POST /subscriptions/cancel
 * 取消訂閱
 */
subscriptions.post('/cancel', async (c) => {
  try {
    const supabase = createClient();
    
    // 1. 驗證使用者
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user) {
      console.error('[Subscription] 未登入:', error);
      return c.json({ error: { message: '請先登入' } }, 401);
    }
    
    // 2. 獲取訂閱資訊
    const subscription = await kv.get(`user:${user.id}:subscription`);
    
    if (!subscription || !subscription.upTradeNo) {
      console.error('[Subscription] 找不到訂閱資訊');
      return c.json({ error: { message: '找不到訂閱資訊' } }, 404);
    }
    
    if (subscription.status !== 'active') {
      console.error('[Subscription] 訂閱已取消或未啟用');
      return c.json({ error: { message: '訂閱已取消或未啟用' } }, 400);
    }
    
    // 3. 呼叫統一金流 API 取消訂閱
    await payuni.updateSubscriptionStatus(subscription.upTradeNo, 9);
    
    // 4. 更新本地資料庫
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date().toISOString();
    await kv.set(`user:${user.id}:subscription`, subscription);
    
    // 5. 更新使用者會員狀態
    const userProfile = await kv.get(`user:${user.id}:profile`);
    if (userProfile) {
      userProfile.accountStatus = 'Canceled';
      await kv.set(`user:${user.id}:profile`, userProfile);
    }
    
    console.log('[Subscription] ✅ 訂閱已取消');
    
    return c.json({ success: true, message: '訂閱已取消' });
    
  } catch (error) {
    console.error('[Subscription] ❌ 取消訂閱失敗:', error);
    return c.json({ error: { message: error.message } }, 500);
  }
});

/**
 * GET /subscriptions/status
 * 查詢訂閱狀態
 */
subscriptions.get('/status', async (c) => {
  try {
    const supabase = createClient();
    
    // 1. 驗證使用者
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user) {
      console.error('[Subscription] 未登入:', error);
      return c.json({ error: { message: '請先登入' } }, 401);
    }
    
    // 2. 獲取本地訂閱資訊
    const subscription = await kv.get(`user:${user.id}:subscription`);
    
    if (!subscription) {
      console.log('[Subscription] 使用者無訂閱');
      return c.json({
        success: true,
        data: { hasSubscription: false }
      });
    }
    
    // 3. 如果有 UP_TradeNo，查詢最新狀態
    if (subscription.upTradeNo) {
      try {
        const result = await payuni.querySubscription(subscription.upTradeNo);
        
        // 同步狀態到本地
        subscription.status = result.data.Status === '1' ? 'active' : 'paused';
        subscription.nextBillingDate = result.data.PeriodPoint;
        await kv.set(`user:${user.id}:subscription`, subscription);
        
        console.log('[Subscription] ✅ 訂閱狀態已同步');
      } catch (error) {
        console.error('[Subscription] ⚠️ 查詢訂閱失敗，使用本地資料:', error);
      }
    }
    
    // 4. 返回訂閱資訊
    return c.json({
      success: true,
      data: {
        hasSubscription: true,
        status: subscription.status,
        amount: subscription.amount,
        nextBillingDate: subscription.nextBillingDate,
        cardLastFour: subscription.cardLastFour,
        createdAt: subscription.createdAt
      }
    });
    
  } catch (error) {
    console.error('[Subscription] ❌ 查詢訂閱失敗:', error);
    return c.json({ error: { message: error.message } }, 500);
  }
});

export default subscriptions;
```

---

### 前端整合（React）

#### 建立訂閱並導向支付頁

```typescript
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';

/**
 * 建立訂閱並導向支付頁
 */
async function handleCreateSubscription() {
  try {
    setLoading(true);
    
    const result = await apiRequestJson<{
      success: boolean;
      data: {
        merchantOrderNo: string;
        paymentUrl: string;
      };
    }>(buildApiUrl('/subscriptions/create'), {
      method: 'POST'
    });
    
    if (result.success) {
      console.log('✅ 訂單建立成功，導向支付頁');
      
      // 導向統一金流支付頁
      window.location.href = result.data.paymentUrl;
    } else {
      throw new Error('建立訂單失敗');
    }
    
  } catch (error) {
    console.error('❌ 建立訂閱失敗:', error);
    showToast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}
```

#### 顯示訂閱狀態

```typescript
/**
 * 獲取訂閱狀態
 */
async function fetchSubscriptionStatus() {
  try {
    const result = await apiRequestJson<{
      success: boolean;
      data: {
        hasSubscription: boolean;
        status?: string;
        amount?: number;
        nextBillingDate?: string;
        cardLastFour?: string;
      };
    }>(buildApiUrl('/subscriptions/status'));
    
    if (result.success) {
      setSubscriptionData(result.data);
    }
  } catch (error) {
    console.error('❌ 獲取訂閱狀態失敗:', error);
  }
}

// 使用範例
{subscriptionData.hasSubscription && (
  <Card>
    <CardHeader>
      <CardTitle>訂閱資訊</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>狀態</span>
          <Badge variant={subscriptionData.status === 'active' ? 'default' : 'secondary'}>
            {subscriptionData.status === 'active' ? '啟用中' : '已暫停'}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span>下次扣款日期</span>
          <span>{subscriptionData.nextBillingDate}</span>
        </div>
        <div className="flex justify-between">
          <span>扣款金額</span>
          <span>NT$ {subscriptionData.amount}</span>
        </div>
        <div className="flex justify-between">
          <span>信用卡末四碼</span>
          <span>**** {subscriptionData.cardLastFour}</span>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

#### 取消訂閱

```typescript
/**
 * 取消訂閱
 */
async function handleCancelSubscription() {
  try {
    const confirmed = confirm('確定要取消訂閱嗎？取消後將無法恢復。');
    
    if (!confirmed) return;
    
    setLoading(true);
    
    const result = await apiRequestJson<{
      success: boolean;
      message: string;
    }>(buildApiUrl('/subscriptions/cancel'), {
      method: 'POST'
    });
    
    if (result.success) {
      showToast('訂閱已取消', 'success');
      
      // 重新載入訂閱狀態
      await fetchSubscriptionStatus();
    }
    
  } catch (error) {
    console.error('❌ 取消訂閱失敗:', error);
    showToast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}
```

---

## 狀態機與生命週期

### 訂閱狀態流轉

```
┌─────────────────────────────────────────────────────────────┐
│                      Pending (待付款)                        │
│  - 訂單已建立，等待使用者完成首次付款                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (首次付款成功)
┌─────────────────────────────────────────────────────────────┐
│                      Active (啟用中)                         │
│  - 訂閱正常運作，到期自動扣款                                 │
│  - 可暫停或取消                                              │
└─────────────────────────────────────────────────────────────┘
          │                        │                   │
          │ (API 2: Status=2)      │ (續期扣款失敗)     │ (API 2: Status=9)
          ▼                        ▼                   ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Paused (暫停)  │    │  Failed (失敗)  │    │Cancelled (已取消)│
│  - 暫停自動扣款  │    │  - 扣款失敗      │    │  - 永久取消      │
│  - 可恢復為 1   │    │  - 進入寬限期    │    │  - 不可恢復      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
          │                        │
          │ (API 2: Status=1)      │ (補繳成功)
          └───────────►│◄───────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Active (啟用中) │
              └─────────────────┘
```

---

### Uknow 平台會員狀態對應

| 統一金流狀態 | Uknow 會員狀態 | 說明 |
|-------------|---------------|------|
| Pending | `Pending` | 等待首次付款 |
| Active (Status=1) | `Active` | 正常會員，可建立刊登 |
| Paused (Status=2) | `Grace` | 寬限期，可繼續使用 7 天 |
| Failed | `Fail` | 扣款失敗且超過寬限期 |
| Cancelled (Status=9) | `Canceled` | 已取消訂閱 |

---

### 自動扣款流程

```
統一金流自動扣款（每年到期日）
         │
         ▼
    扣款成功？
    /        \
  是          否
  │           │
  ▼           ▼
Active    Failed → 進入 Grace 狀態（7天寬限期）
             │
             ▼
        7 天內補繳？
        /        \
      是          否
      │           │
      ▼           ▼
    Active      Fail → 刊登下架
```

---

## 錯誤處理與除錯

### 常見錯誤

#### 錯誤 1：訂單編號重複

**錯誤訊息：** `"訂單編號重複"`

**原因：** `MerchantOrderNo` 必須是唯一的，建議使用時間戳避免重複

**解決方法：**
```typescript
const timestamp = Math.floor(Date.now() / 1000);
const merchantOrderNo = `UKNOW_SUB_${userId}_${timestamp}`;
```

---

#### 錯誤 2：UP_TradeNo 不存在

**錯誤訊息：** `"找不到續期交易編號"`

**原因：** 使用者尚未完成首次付款，或 NotifyURL 處理失敗導致 `UP_TradeNo` 未儲存

**解決方法：**
1. 檢查 NotifyURL 的處理邏輯是否正確儲存 `UP_TradeNo`
2. 確認使用者已完成首次付款

---

#### 錯誤 3：簽章驗證失敗

**錯誤訊息：** `"簽章驗證失敗"`

**原因：** HashKey 或 HashIV 錯誤，或加密流程不正確

**解決方法：** 參考[加密技術文件](/docs/PayUni_Encryption_Guide.md)檢查加密流程

---

### 除錯工具

#### 日誌記錄範例

```typescript
// 在關鍵步驟記錄日誌
console.log('[PayUni] 建立訂單:', {
  userId,
  merchantOrderNo,
  amount
});

console.log('[PayUni] 收到付款通知:', {
  merchantId: MerchantID,
  encryptInfoLength: EncryptInfo.length,
  hashInfoLength: HashInfo.length
});

console.log('[PayUni] 解密後的資料:', decryptedData);
```

---

#### 測試環境驗證清單

- [ ] 能成功建立訂單並獲得 `PaymentURL`
- [ ] 能正確解密 NotifyURL 回調
- [ ] `UP_TradeNo` 已正確儲存到資料庫
- [ ] 能成功修改訂閱狀態（暫停/恢復/取消）
- [ ] 能成功查詢訂閱詳情
- [ ] 能成功建立卡號修改訂單

---

## 最佳實踐與安全建議

### 資料安全

1. **金鑰管理**
   - HashKey 和 HashIV 使用環境變數儲存
   - 絕對不可在前端或版本控制系統中洩漏
   - 測試環境和正式環境使用不同金鑰

2. **簽章驗證**
   - 所有 NotifyURL 回調都必須驗證簽章
   - 簽章驗證失敗直接拒絕請求

3. **敏感資料保護**
   - 信用卡號僅儲存末四碼
   - 完整卡號由統一金流加密儲存

---

### 冪等性設計

1. **訂單唯一性**
   - 使用 `userId + timestamp` 確保訂單編號唯一
   - 避免重複建立訂單

2. **NotifyURL 冪等處理**
   ```typescript
   // 檢查訂單是否已處理
   const existingOrder = await kv.get(`order:${merchantOrderNo}`);
   
   if (existingOrder && existingOrder.processed) {
     console.log('[Subscription] ⚠️ 訂單已處理，跳過');
     return new Response('SUCCESS', { status: 200 });
   }
   
   // 處理訂單...
   
   // 標記為已處理
   await kv.set(`order:${merchantOrderNo}`, {
     ...orderData,
     processed: true,
     processedAt: new Date().toISOString()
   });
   ```

---

### 錯誤重試機制

```typescript
/**
 * 帶重試機制的 API 呼叫
 */
async function callPayUniWithRetry(
  apiCall: () => Promise<any>,
  maxRetries = 3
) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      console.error(`[PayUni] ❌ API 呼叫失敗 (第 ${i + 1} 次):`, error);
      lastError = error;
      
      // 指數退避
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  
  throw lastError;
}

// 使用範例
const result = await callPayUniWithRetry(() => 
  payuni.querySubscription(upTradeNo)
);
```

---

### 監控與告警

```typescript
/**
 * 定期檢查訂閱狀態（每日執行）
 */
async function dailySubscriptionCheck() {
  console.log('[Cron] 開始每日訂閱檢查');
  
  const allUsers = await kv.getByPrefix('user:');
  const issues = [];
  
  for (const userKey of allUsers) {
    const subscription = await kv.get(`${userKey}:subscription`);
    
    if (!subscription || !subscription.upTradeNo) continue;
    
    try {
      // 查詢最新狀態
      const result = await payuni.querySubscription(subscription.upTradeNo);
      
      // 檢查狀態是否一致
      const remoteStatus = result.data.Status === '1' ? 'active' : 'paused';
      
      if (remoteStatus !== subscription.status) {
        console.warn(`[Cron] ⚠️ 狀態不一致: ${userKey}`);
        issues.push({
          userId: userKey.split(':')[1],
          localStatus: subscription.status,
          remoteStatus
        });
        
        // 自動同步
        subscription.status = remoteStatus;
        await kv.set(`${userKey}:subscription`, subscription);
      }
      
    } catch (error) {
      console.error(`[Cron] ❌ 查詢失敗: ${userKey}`, error);
    }
  }
  
  // 發送告警郵件
  if (issues.length > 0) {
    await sendAdminAlert({
      subject: '訂閱狀態同步問題',
      content: `發現 ${issues.length} 筆狀態不一致的訂閱`,
      details: issues
    });
  }
  
  console.log(`[Cron] ✅ 每日訂閱檢查完成，共 ${issues.length} 筆問題`);
}
```

---

## 總結

### 實作檢查清單

#### 後端

- [ ] 已實作 PayUni 加密/解密模組
- [ ] 已實作 API 1：建立續期收款訂單
- [ ] 已實作 NotifyURL 回調處理
- [ ] 已實作 API 2：修改訂閱狀態（暫停/恢復/取消）
- [ ] 已實作 API 3：查詢訂閱詳情
- [ ] 已實作 API 4：卡號修改功能
- [ ] 已設定環境變數（HashKey, HashIV, MerchantID）
- [ ] 已實作冪等性檢查
- [ ] 已實作錯誤重試機制
- [ ] 已實作監控與告警

#### 前端

- [ ] 已實作建立訂閱流程
- [ ] 已實作支付頁導向
- [ ] 已實作訂閱狀態顯示
- [ ] 已實作取消訂閱功能
- [ ] 已實作卡號更換功能
- [ ] 已實作錯誤處理與提示

#### 測試

- [ ] 已測試完整訂閱流程（建立→付款→啟用）
- [ ] 已測試暫停/恢復訂閱
- [ ] 已測試取消訂閱
- [ ] 已測試查詢訂閱
- [ ] 已測試卡號修改
- [ ] 已測試 NotifyURL 簽章驗證
- [ ] 已測試錯誤情境（付款失敗、網路錯誤等）

---

### 環境變數設定

確保以下環境變數已正確設定：

```bash
# 統一金流設定（測試環境）
PAYUNI_MERCHANT_ID=MS123456789
PAYUNI_HASH_KEY=abcdef1234567890abcdef1234567890
PAYUNI_HASH_IV=1234567890abcdef
PAYUNI_API_URL=https://sandbox-api.payuni.com.tw

# 統一金流設定（正式環境）
PAYUNI_PROD_MERCHANT_ID=MS987654321
PAYUNI_PROD_HASH_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYUNI_PROD_HASH_IV=xxxxxxxxxxxxxxxx
PAYUNI_PROD_API_URL=https://api.payuni.com.tw

# 平台設定
DOMAIN=uknow.com.tw
```

---

### 相關文件

- [資料加密技術文件](/docs/PayUni_Encryption_Guide.md)
- [Uknow 軟體規格書](/Uknow_Software_Specification.md)
- [訂閱架構問題分析](/docs/SUBSCRIPTION_ARCHITECTURE_ISSUES.md)

---

**下一步：** 開始實作後端 PayUni 整合模組 (`/supabase/functions/server/payuni.ts`)，並測試完整的訂閱流程。
