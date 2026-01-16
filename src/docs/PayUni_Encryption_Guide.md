# 統一金流 (PayUni) 資料加密技術文件

> **版本：** v1.0  
> **最後更新：** 2025-01-15  
> **參考文件：**
> - [資料加密陣列](https://docs.payuni.com.tw/web/#/7/56)
> - [PHP範例](https://docs.payuni.com.tw/web/#/7/29)
> - [Node.js範例](https://docs.payuni.com.tw/web/#/7/312)
> - [Java範例](https://docs.payuni.com.tw/web/#/7/343)

---

## 📋 目錄

1. [加密機制概述](#加密機制概述)
2. [加密流程圖解](#加密流程圖解)
3. [EncryptInfo 加密（AES）](#encryptinfo-加密aes)
4. [HashInfo 簽章（SHA256）](#hashinfo-簽章sha256)
5. [完整實作範例](#完整實作範例)
   - [Node.js / TypeScript 實作](#nodejs--typescript-實作)
   - [PHP 實作](#php-實作)
   - [Java 實作](#java-實作)
6. [解密流程](#解密流程)
7. [常見問題與除錯](#常見問題與除錯)
8. [測試與驗證](#測試與驗證)

---

## 加密機制概述

### 為什麼需要加密？

統一金流使用**雙重加密機制**確保交易安全：

1. **EncryptInfo（AES 加密）** - 保護交易內容不被竊取
2. **HashInfo（SHA256 簽章）** - 確保資料未被竄改

### 加密參數

所有 API 請求都包含以下三個核心參數：

```typescript
interface PayUniRequest {
  MerchantID: string;    // 特店編號（明文）
  EncryptInfo: string;   // 加密後的交易資料（AES 加密）
  HashInfo: string;      // 簽章（SHA256）
}
```

### 金鑰說明

統一金流提供兩組金鑰（由平台提供，**切勿洩漏**）：

| 金鑰名稱 | 長度 | 用途 |
|---------|------|------|
| `HashKey` | 32字元 | AES 加密金鑰 + SHA256 簽章 |
| `HashIV` | 16字元 | AES 初始向量 (Initialization Vector) |

**範例：**
```
HashKey: "abcdef1234567890abcdef1234567890"  (32 字元)
HashIV:  "1234567890abcdef"                  (16 字元)
```

---

## 加密流程圖解

```
原始交易資料 (JSON)
        │
        ▼
┌─────────────────────┐
│ 1. 轉換為查詢字串   │
│    (Query String)    │
└─────────────────────┘
        │
        ▼
   Key=Value&Key=Value
        │
        ├──────────────────────┬─────────────────────┐
        ▼                      ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌──────────────┐
│ 2A. AES 加密    │   │ 2B. SHA256簽章  │   │   原始資料   │
│  (EncryptInfo)  │   │   (HashInfo)    │   │ (MerchantID) │
└─────────────────┘   └─────────────────┘   └──────────────┘
        │                      │                     │
        └──────────────────────┴─────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  發送到 PayUni   │
                    │      API         │
                    └──────────────────┘
```

---

## EncryptInfo 加密（AES）

### 加密規格

- **演算法：** AES-256-CBC
- **模式：** CBC (Cipher Block Chaining)
- **填充：** PKCS7
- **金鑰：** HashKey (32 bytes)
- **初始向量：** HashIV (16 bytes)
- **輸出格式：** Hex 字串（小寫）

### 加密步驟

```
原始資料 → URL Encode → AES-256-CBC 加密 → Hex 編碼 → 小寫轉換
```

#### 詳細流程

**步驟 1：準備交易資料（Query String）**

```typescript
// 原始資料（物件）
const tradeInfo = {
  MerchantOrderNo: "UKNOW_user123_1705300800",
  Amt: 1200,
  ProdDesc: "Uknow平台年費訂閱",
  Email: "user@example.com"
};

// 轉換為查詢字串
// MerchantOrderNo=UKNOW_user123_1705300800&Amt=1200&ProdDesc=Uknow平台年費訂閱&Email=user@example.com
```

**步驟 2：AES 加密**

```typescript
import crypto from 'crypto';

function aesEncrypt(data: string, key: string, iv: string): string {
  // 創建加密器
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  // 加密
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return encrypted;
}

// 使用範例
const encryptInfo = aesEncrypt(queryString, hashKey, hashIV);
// 結果：a1b2c3d4e5f6...（hex 字串）
```

---

## HashInfo 簽章（SHA256）

### 簽章規格

- **演算法：** SHA-256
- **輸出格式：** Hex 字串（**大寫**）

### 簽章步驟

```
原始資料 → 加入 HashKey/IV → URL Encode → 轉小寫 → SHA256 → 轉大寫
```

#### 詳細流程

**步驟 1：組合簽章字串**

```
HashKey={HashKey}&{QueryString}&HashIV={HashIV}
```

**範例：**
```
HashKey=abcdef1234567890abcdef1234567890&MerchantOrderNo=UKNOW123&Amt=1200&HashIV=1234567890abcdef
```

**步驟 2：URL Encode**

需要對整個字串進行 URL Encode，並遵循以下規則：

| 字元 | 編碼規則 |
|------|---------|
| 空格 | 轉換為 `+` |
| `-` | 保持不變 |
| `_` | 保持不變 |
| `.` | 保持不變 |
| `!` | 保持不變 |
| `*` | 保持不變 |
| `(` | 保持不變 |
| `)` | 保持不變 |
| 其他特殊字元 | 轉換為 `%XX` |

**步驟 3：轉小寫**

```typescript
const lowercase = urlEncoded.toLowerCase();
```

**步驟 4：SHA256 雜湊**

```typescript
import crypto from 'crypto';

function sha256Hash(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex').toUpperCase();
}
```

**步驟 5：轉大寫**

```typescript
const hashInfo = hash.toUpperCase();
// 結果：A1B2C3D4E5F6...（大寫 hex 字串）
```

---

## 完整實作範例

### Node.js / TypeScript 實作

#### 基礎工具函數

```typescript
import crypto from 'crypto';

/**
 * 將物件轉換為查詢字串（依鍵名排序）
 */
function objectToQueryString(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([_, value]) => value !== null && value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))  // ⚠️ 依字母順序排序
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * AES-256-CBC 加密
 */
function aesEncrypt(data: string, key: string, iv: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted.toLowerCase();  // 統一轉小寫
}

/**
 * AES-256-CBC 解密
 */
function aesDecrypt(encryptedData: string, key: string, iv: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * 自訂 URL Encode（符合 PayUni 規範）
 */
function customUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')      // 空格轉 +
    .replace(/%2d/gi, '-')     // - 保持不變
    .replace(/%5f/gi, '_')     // _ 保持不變
    .replace(/%2e/gi, '.')     // . 保持不變
    .replace(/%21/gi, '!')     // ! 保持不變
    .replace(/%2a/gi, '*')     // * 保持不變
    .replace(/%28/gi, '(')     // ( 保持不變
    .replace(/%29/gi, ')');    // ) 保持不變
}

/**
 * 生成 SHA256 簽章
 */
function generateHash(data: string, hashKey: string, hashIV: string): string {
  // 1. 組合簽章字串
  const signString = `HashKey=${hashKey}&${data}&HashIV=${hashIV}`;
  
  // 2. URL Encode
  const encoded = customUrlEncode(signString);
  
  // 3. 轉小寫
  const lowercase = encoded.toLowerCase();
  
  // 4. SHA256 雜湊
  const hash = crypto.createHash('sha256').update(lowercase, 'utf8').digest('hex');
  
  // 5. 轉大寫
  return hash.toUpperCase();
}
```

#### 完整加密函數

```typescript
/**
 * PayUni 資料加密（完整流程）
 */
export function encryptPayUniData(
  tradeData: Record<string, any>,
  hashKey: string,
  hashIV: string
): { EncryptInfo: string; HashInfo: string } {
  
  // 1. 轉換為查詢字串
  const queryString = objectToQueryString(tradeData);
  
  console.log('原始查詢字串:', queryString);
  
  // 2. AES 加密 → EncryptInfo
  const encryptInfo = aesEncrypt(queryString, hashKey, hashIV);
  
  console.log('EncryptInfo:', encryptInfo);
  
  // 3. SHA256 簽章 → HashInfo
  const hashInfo = generateHash(queryString, hashKey, hashIV);
  
  console.log('HashInfo:', hashInfo);
  
  return {
    EncryptInfo: encryptInfo,
    HashInfo: hashInfo
  };
}
```

#### 使用範例

```typescript
// 統一金流提供的金鑰
const HASH_KEY = process.env.PAYUNI_HASH_KEY!;  // 32 字元
const HASH_IV = process.env.PAYUNI_HASH_IV!;    // 16 字元

// 交易資料
const tradeData = {
  MerchantID: "MS123456789",
  MerchantOrderNo: "UKNOW_user123_1705300800",
  Amt: 1200,
  ProdDesc: "Uknow平台年費訂閱",
  Email: "user@example.com",
  ReturnURL: "https://uknow.com.tw/payment/return",
  NotifyURL: "https://uknow.com.tw/api/payment/notify"
};

// 加密
const { EncryptInfo, HashInfo } = encryptPayUniData(tradeData, HASH_KEY, HASH_IV);

// 發送到 PayUni API
const requestBody = {
  MerchantID: tradeData.MerchantID,
  EncryptInfo: EncryptInfo,
  HashInfo: HashInfo
};

console.log('API 請求內容:', JSON.stringify(requestBody, null, 2));
```

---

### PHP 實作

```php
<?php

/**
 * 將陣列轉換為查詢字串（依鍵名排序）
 */
function arrayToQueryString($data) {
    ksort($data);  // 依鍵名排序
    
    $parts = [];
    foreach ($data as $key => $value) {
        if ($value !== null && $value !== '') {
            $parts[] = $key . '=' . $value;
        }
    }
    
    return implode('&', $parts);
}

/**
 * AES-256-CBC 加密
 */
function aesEncrypt($data, $key, $iv) {
    $encrypted = openssl_encrypt(
        $data,
        'AES-256-CBC',
        $key,
        OPENSSL_RAW_DATA,
        $iv
    );
    
    return bin2hex($encrypted);  // 轉 hex 小寫
}

/**
 * AES-256-CBC 解密
 */
function aesDecrypt($encryptedData, $key, $iv) {
    $decrypted = openssl_decrypt(
        hex2bin($encryptedData),
        'AES-256-CBC',
        $key,
        OPENSSL_RAW_DATA,
        $iv
    );
    
    return $decrypted;
}

/**
 * 自訂 URL Encode
 */
function customUrlEncode($str) {
    $encoded = urlencode($str);
    $encoded = str_replace('%2d', '-', $encoded);
    $encoded = str_replace('%5f', '_', $encoded);
    $encoded = str_replace('%2e', '.', $encoded);
    $encoded = str_replace('%21', '!', $encoded);
    $encoded = str_replace('%2a', '*', $encoded);
    $encoded = str_replace('%28', '(', $encoded);
    $encoded = str_replace('%29', ')', $encoded);
    
    return $encoded;
}

/**
 * 生成 SHA256 簽章
 */
function generateHash($data, $hashKey, $hashIV) {
    // 1. 組合簽章字串
    $signString = "HashKey={$hashKey}&{$data}&HashIV={$hashIV}";
    
    // 2. URL Encode
    $encoded = customUrlEncode($signString);
    
    // 3. 轉小寫
    $lowercase = strtolower($encoded);
    
    // 4. SHA256 雜湊
    $hash = hash('sha256', $lowercase);
    
    // 5. 轉大寫
    return strtoupper($hash);
}

/**
 * PayUni 資料加密（完整流程）
 */
function encryptPayUniData($tradeData, $hashKey, $hashIV) {
    // 1. 轉換為查詢字串
    $queryString = arrayToQueryString($tradeData);
    
    echo "原始查詢字串: {$queryString}\n";
    
    // 2. AES 加密
    $encryptInfo = aesEncrypt($queryString, $hashKey, $hashIV);
    
    echo "EncryptInfo: {$encryptInfo}\n";
    
    // 3. SHA256 簽章
    $hashInfo = generateHash($queryString, $hashKey, $hashIV);
    
    echo "HashInfo: {$hashInfo}\n";
    
    return [
        'EncryptInfo' => $encryptInfo,
        'HashInfo' => $hashInfo
    ];
}

// ===== 使用範例 =====

$HASH_KEY = getenv('PAYUNI_HASH_KEY');  // 32 字元
$HASH_IV = getenv('PAYUNI_HASH_IV');    // 16 字元

$tradeData = [
    'MerchantID' => 'MS123456789',
    'MerchantOrderNo' => 'UKNOW_user123_1705300800',
    'Amt' => 1200,
    'ProdDesc' => 'Uknow平台年費訂閱',
    'Email' => 'user@example.com',
    'ReturnURL' => 'https://uknow.com.tw/payment/return',
    'NotifyURL' => 'https://uknow.com.tw/api/payment/notify'
];

// 加密
$result = encryptPayUniData($tradeData, $HASH_KEY, $HASH_IV);

// 發送到 PayUni API
$requestBody = [
    'MerchantID' => $tradeData['MerchantID'],
    'EncryptInfo' => $result['EncryptInfo'],
    'HashInfo' => $result['HashInfo']
];

echo "API 請求內容:\n";
print_r($requestBody);

?>
```

---

### Java 實作

```java
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public class PayUniEncryption {
    
    /**
     * 將 Map 轉換為查詢字串（依鍵名排序）
     */
    public static String mapToQueryString(Map<String, String> data) {
        TreeMap<String, String> sortedData = new TreeMap<>(data);
        StringBuilder sb = new StringBuilder();
        
        for (Map.Entry<String, String> entry : sortedData.entrySet()) {
            if (entry.getValue() != null && !entry.getValue().isEmpty()) {
                if (sb.length() > 0) {
                    sb.append('&');
                }
                sb.append(entry.getKey()).append('=').append(entry.getValue());
            }
        }
        
        return sb.toString();
    }
    
    /**
     * AES-256-CBC 加密
     */
    public static String aesEncrypt(String data, String key, String iv) throws Exception {
        SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(iv.getBytes(StandardCharsets.UTF_8));
        
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, ivSpec);
        
        byte[] encrypted = cipher.doFinal(data.getBytes(StandardCharsets.UTF_8));
        
        return bytesToHex(encrypted).toLowerCase();
    }
    
    /**
     * AES-256-CBC 解密
     */
    public static String aesDecrypt(String encryptedData, String key, String iv) throws Exception {
        SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(iv.getBytes(StandardCharsets.UTF_8));
        
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey, ivSpec);
        
        byte[] decrypted = cipher.doFinal(hexToBytes(encryptedData));
        
        return new String(decrypted, StandardCharsets.UTF_8);
    }
    
    /**
     * 自訂 URL Encode
     */
    public static String customUrlEncode(String str) {
        String encoded = URLEncoder.encode(str, StandardCharsets.UTF_8);
        encoded = encoded.replace("%2D", "-");
        encoded = encoded.replace("%5F", "_");
        encoded = encoded.replace("%2E", ".");
        encoded = encoded.replace("%21", "!");
        encoded = encoded.replace("%2A", "*");
        encoded = encoded.replace("%28", "(");
        encoded = encoded.replace("%29", ")");
        encoded = encoded.replace("+", "%20");  // 空格特殊處理
        
        return encoded;
    }
    
    /**
     * 生成 SHA256 簽章
     */
    public static String generateHash(String data, String hashKey, String hashIV) throws Exception {
        // 1. 組合簽章字串
        String signString = "HashKey=" + hashKey + "&" + data + "&HashIV=" + hashIV;
        
        // 2. URL Encode
        String encoded = customUrlEncode(signString);
        
        // 3. 轉小寫
        String lowercase = encoded.toLowerCase();
        
        // 4. SHA256 雜湊
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(lowercase.getBytes(StandardCharsets.UTF_8));
        
        // 5. 轉大寫
        return bytesToHex(hash).toUpperCase();
    }
    
    /**
     * Byte 陣列轉 Hex 字串
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
    
    /**
     * Hex 字串轉 Byte 陣列
     */
    private static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                                 + Character.digit(hex.charAt(i+1), 16));
        }
        return data;
    }
    
    /**
     * PayUni 資料加密（完整流程）
     */
    public static Map<String, String> encryptPayUniData(
        Map<String, String> tradeData,
        String hashKey,
        String hashIV
    ) throws Exception {
        
        // 1. 轉換為查詢字串
        String queryString = mapToQueryString(tradeData);
        System.out.println("原始查詢字串: " + queryString);
        
        // 2. AES 加密
        String encryptInfo = aesEncrypt(queryString, hashKey, hashIV);
        System.out.println("EncryptInfo: " + encryptInfo);
        
        // 3. SHA256 簽章
        String hashInfo = generateHash(queryString, hashKey, hashIV);
        System.out.println("HashInfo: " + hashInfo);
        
        Map<String, String> result = new HashMap<>();
        result.put("EncryptInfo", encryptInfo);
        result.put("HashInfo", hashInfo);
        
        return result;
    }
    
    // ===== 使用範例 =====
    
    public static void main(String[] args) {
        try {
            String HASH_KEY = System.getenv("PAYUNI_HASH_KEY");  // 32 字元
            String HASH_IV = System.getenv("PAYUNI_HASH_IV");    // 16 字元
            
            Map<String, String> tradeData = new HashMap<>();
            tradeData.put("MerchantID", "MS123456789");
            tradeData.put("MerchantOrderNo", "UKNOW_user123_1705300800");
            tradeData.put("Amt", "1200");
            tradeData.put("ProdDesc", "Uknow平台年費訂閱");
            tradeData.put("Email", "user@example.com");
            tradeData.put("ReturnURL", "https://uknow.com.tw/payment/return");
            tradeData.put("NotifyURL", "https://uknow.com.tw/api/payment/notify");
            
            // 加密
            Map<String, String> result = encryptPayUniData(tradeData, HASH_KEY, HASH_IV);
            
            // 發送到 PayUni API
            Map<String, String> requestBody = new HashMap<>();
            requestBody.put("MerchantID", tradeData.get("MerchantID"));
            requestBody.put("EncryptInfo", result.get("EncryptInfo"));
            requestBody.put("HashInfo", result.get("HashInfo"));
            
            System.out.println("\nAPI 請求內容:");
            System.out.println(requestBody);
            
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

---

## 解密流程

### 接收 PayUni 回應

當 PayUni 發送通知到你的 `NotifyURL` 時，回應內容也是加密的：

```json
{
  "MerchantID": "MS123456789",
  "EncryptInfo": "a1b2c3d4e5f6...",
  "HashInfo": "A1B2C3D4E5F6..."
}
```

### 解密步驟

#### Node.js / TypeScript 解密範例

```typescript
/**
 * 驗證並解密 PayUni 回應
 */
export function decryptPayUniResponse(
  encryptInfo: string,
  hashInfo: string,
  hashKey: string,
  hashIV: string
): Record<string, any> | null {
  
  // 1. AES 解密
  const decryptedString = aesDecrypt(encryptInfo, hashKey, hashIV);
  
  console.log('解密後的查詢字串:', decryptedString);
  
  // 2. 驗證簽章
  const calculatedHash = generateHash(decryptedString, hashKey, hashIV);
  
  if (calculatedHash !== hashInfo) {
    console.error('簽章驗證失敗！資料可能被竄改');
    console.error('接收到的簽章:', hashInfo);
    console.error('計算的簽章:', calculatedHash);
    return null;
  }
  
  console.log('✅ 簽章驗證成功');
  
  // 3. 解析查詢字串為物件
  const params = new URLSearchParams(decryptedString);
  const result: Record<string, any> = {};
  
  params.forEach((value, key) => {
    result[key] = value;
  });
  
  return result;
}
```

#### 使用範例

```typescript
// 接收 PayUni 通知
app.post('/api/payment/notify', async (c) => {
  const { MerchantID, EncryptInfo, HashInfo } = await c.req.json();
  
  console.log('收到 PayUni 通知');
  
  // 解密並驗證
  const decryptedData = decryptPayUniResponse(
    EncryptInfo,
    HashInfo,
    HASH_KEY,
    HASH_IV
  );
  
  if (!decryptedData) {
    return c.json({ error: '簽章驗證失敗' }, 400);
  }
  
  console.log('解密後的資料:', decryptedData);
  
  // 處理付款結果
  const { Status, Message, MerchantOrderNo, Amt } = decryptedData;
  
  if (Status === 'SUCCESS') {
    console.log(`✅ 付款成功：訂單 ${MerchantOrderNo}，金額 ${Amt}`);
    
    // 更新資料庫
    await updatePaymentStatus(MerchantOrderNo, 'paid');
  } else {
    console.error(`❌ 付款失敗：${Message}`);
  }
  
  return c.json({ success: true });
});
```

---

## 常見問題與除錯

### 問題 1：簽章驗證失敗

**錯誤訊息：** `HashInfo 不符`

**可能原因：**
1. ❌ HashKey 或 HashIV 錯誤
2. ❌ 查詢字串順序不正確（未依鍵名排序）
3. ❌ URL Encode 規則不符
4. ❌ 大小寫轉換錯誤（簽章前要轉小寫，最後要轉大寫）

**除錯方法：**

```typescript
// 詳細記錄每個步驟
function debugGenerateHash(data: string, hashKey: string, hashIV: string): string {
  console.log('🔍 開始生成簽章...');
  
  // 步驟 1
  const signString = `HashKey=${hashKey}&${data}&HashIV=${hashIV}`;
  console.log('1️⃣ 簽章字串:', signString);
  
  // 步驟 2
  const encoded = customUrlEncode(signString);
  console.log('2️⃣ URL Encode:', encoded);
  
  // 步驟 3
  const lowercase = encoded.toLowerCase();
  console.log('3️⃣ 轉小寫:', lowercase);
  
  // 步驟 4
  const hash = crypto.createHash('sha256').update(lowercase, 'utf8').digest('hex');
  console.log('4️⃣ SHA256:', hash);
  
  // 步驟 5
  const uppercase = hash.toUpperCase();
  console.log('5️⃣ 轉大寫:', uppercase);
  
  return uppercase;
}
```

---

### 問題 2：AES 解密失敗

**錯誤訊息：** `error:06065064:digital envelope routines:EVP_DecryptFinal_ex:bad decrypt`

**可能原因：**
1. ❌ HashKey 或 HashIV 錯誤
2. ❌ EncryptInfo 格式錯誤（不是有效的 hex 字串）
3. ❌ 加密演算法不匹配（必須是 AES-256-CBC）

**除錯方法：**

```typescript
try {
  const decrypted = aesDecrypt(encryptInfo, hashKey, hashIV);
  console.log('✅ 解密成功:', decrypted);
} catch (error) {
  console.error('❌ 解密失敗:', error.message);
  console.error('EncryptInfo 長度:', encryptInfo.length);
  console.error('HashKey 長度:', hashKey.length, '（應為 32）');
  console.error('HashIV 長度:', hashIV.length, '（應為 16）');
}
```

---

### 問題 3：中文編碼問題

**症狀：** 中文字在加密後無法正確解密

**解決方法：**

```typescript
// ✅ 確保使用 UTF-8 編碼
const queryString = objectToQueryString({
  ProdDesc: encodeURIComponent('Uknow平台年費訂閱')
});

// 解密後需要 decode
const decoded = decodeURIComponent(result.ProdDesc);
console.log(decoded);  // 'Uknow平台年費訂閱'
```

---

### 問題 4：測試環境 vs 正式環境

**症狀：** 測試環境正常，正式環境失敗

**檢查清單：**
- [ ] 是否使用了正確環境的 HashKey/HashIV？
- [ ] API Base URL 是否正確？
- [ ] MerchantID 是否正確？

```typescript
// 環境變數管理
const isProd = process.env.NODE_ENV === 'production';

const config = {
  apiUrl: isProd 
    ? 'https://api.payuni.com.tw' 
    : 'https://sandbox-api.payuni.com.tw',
  merchantId: isProd 
    ? process.env.PAYUNI_PROD_MERCHANT_ID 
    : process.env.PAYUNI_TEST_MERCHANT_ID,
  hashKey: isProd 
    ? process.env.PAYUNI_PROD_HASH_KEY 
    : process.env.PAYUNI_TEST_HASH_KEY,
  hashIV: isProd 
    ? process.env.PAYUNI_PROD_HASH_IV 
    : process.env.PAYUNI_TEST_HASH_IV,
};
```

---

## 測試與驗證

### 單元測試範例（Jest）

```typescript
import { encryptPayUniData, decryptPayUniResponse } from './payuni-encryption';

describe('PayUni 加密測試', () => {
  const TEST_HASH_KEY = 'abcdef1234567890abcdef1234567890';  // 32 字元
  const TEST_HASH_IV = '1234567890abcdef';                    // 16 字元
  
  test('加密後能正確解密', () => {
    const tradeData = {
      MerchantOrderNo: 'TEST123',
      Amt: 1200,
      ProdDesc: 'Test Product'
    };
    
    // 加密
    const { EncryptInfo, HashInfo } = encryptPayUniData(
      tradeData,
      TEST_HASH_KEY,
      TEST_HASH_IV
    );
    
    expect(EncryptInfo).toBeTruthy();
    expect(HashInfo).toBeTruthy();
    expect(HashInfo).toMatch(/^[A-F0-9]{64}$/);  // SHA256 = 64 字元 hex
    
    // 解密
    const decrypted = decryptPayUniResponse(
      EncryptInfo,
      HashInfo,
      TEST_HASH_KEY,
      TEST_HASH_IV
    );
    
    expect(decrypted).toBeTruthy();
    expect(decrypted.MerchantOrderNo).toBe('TEST123');
    expect(decrypted.Amt).toBe('1200');
  });
  
  test('簽章驗證失敗應返回 null', () => {
    const { EncryptInfo } = encryptPayUniData(
      { test: 'data' },
      TEST_HASH_KEY,
      TEST_HASH_IV
    );
    
    const fakeHash = 'A'.repeat(64);  // 假簽章
    
    const decrypted = decryptPayUniResponse(
      EncryptInfo,
      fakeHash,
      TEST_HASH_KEY,
      TEST_HASH_IV
    );
    
    expect(decrypted).toBeNull();
  });
});
```

---

### 手動測試工具

```typescript
/**
 * PayUni 加密測試工具
 * 使用方式：npm run test:payuni
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testEncryption() {
  console.log('=== PayUni 加密測試工具 ===\n');
  
  const hashKey = await question('請輸入 HashKey (32字元): ');
  const hashIV = await question('請輸入 HashIV (16字元): ');
  
  if (hashKey.length !== 32 || hashIV.length !== 16) {
    console.error('❌ 金鑰長度錯誤');
    rl.close();
    return;
  }
  
  const testData = {
    MerchantOrderNo: 'TEST_' + Date.now(),
    Amt: 1200,
    ProdDesc: '測試商品'
  };
  
  console.log('\n測試資料:', testData);
  
  const { EncryptInfo, HashInfo } = encryptPayUniData(testData, hashKey, hashIV);
  
  console.log('\n加密結果:');
  console.log('EncryptInfo:', EncryptInfo);
  console.log('HashInfo:', HashInfo);
  
  // 驗證解密
  const decrypted = decryptPayUniResponse(EncryptInfo, HashInfo, hashKey, hashIV);
  
  if (decrypted) {
    console.log('\n✅ 解密驗證成功');
    console.log('解密資料:', decrypted);
  } else {
    console.log('\n❌ 解密驗證失敗');
  }
  
  rl.close();
}

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

testEncryption();
```

---

## 總結

### 關鍵要點

1. **雙重加密機制**
   - EncryptInfo：保護內容（AES-256-CBC）
   - HashInfo：防止竄改（SHA256）

2. **嚴格遵守規範**
   - 查詢字串必須依鍵名排序
   - URL Encode 規則必須符合 PayUni 標準
   - 大小寫轉換步驟不可省略

3. **金鑰安全**
   - HashKey 和 HashIV 絕對不可外洩
   - 使用環境變數管理
   - 測試環境和正式環境分開

4. **錯誤處理**
   - 記錄詳細日誌方便除錯
   - 簽章驗證失敗必須拒絕請求
   - 提供友善的錯誤訊息

### 實作檢查清單

- [ ] 已實作 AES 加密/解密函數
- [ ] 已實作 SHA256 簽章函數
- [ ] 已實作自訂 URL Encode
- [ ] 查詢字串正確排序
- [ ] 已測試加密→解密流程
- [ ] 已測試簽章驗證
- [ ] 已處理中文編碼
- [ ] 已設定環境變數
- [ ] 已撰寫單元測試
- [ ] 已完成端對端測試

---

**下一步：** 將此加密模組整合到 `/supabase/functions/server/payuni.ts`，開始實作續期收款 API。

**相關文件：**
- [PayUni 續期收款 API 整合文件](/docs/PayUni_Recurring_Payment_API.md)
