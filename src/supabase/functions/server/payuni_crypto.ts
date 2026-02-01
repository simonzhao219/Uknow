import crypto from 'node:crypto';

// ========================================
// PayUni 加解密工具
// AES-256-GCM + SHA256
// ========================================

/**
 * AES-256-GCM 加密（PayUni 規格）
 * 
 * @param data - 要加密的數據對象
 * @param key - 加密金鑰（Hash Key）
 * @param iv - 初始化向量（Hash IV）
 * @returns hex 編碼的加密字串
 */
export function encryptPayUni(
  data: Record<string, any>,
  key: string,
  iv: string
): string {
  // 1. 轉為 URLSearchParams (query string)
  const plaintext = new URLSearchParams(data).toString();
  
  // 2. 創建 cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  // 3. 加密
  let cipherText = cipher.update(plaintext, 'utf8', 'base64');
  cipherText += cipher.final('base64');
  
  // 4. 取得 auth tag
  const tag = cipher.getAuthTag().toString('base64');
  
  // 5. 組合格式：密文:::標籤
  const combined = `${cipherText}:::${tag}`;
  
  // 6. 轉為 hex
  return Buffer.from(combined).toString('hex').trim();
}

/**
 * AES-256-GCM 解密（PayUni 規格）
 * 
 * @param encryptStr - hex 編碼的加密字串
 * @param key - 加密金鑰（Hash Key）
 * @param iv - 初始化向量（Hash IV）
 * @returns 解密後的 query string
 */
export function decryptPayUni(
  encryptStr: string,
  key: string,
  iv: string
): string {
  // 1. hex 轉回字串
  const combined = Buffer.from(encryptStr, 'hex').toString();
  const [encryptData, tag] = combined.split(':::');
  
  // 2. 創建 decipher
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  
  // 3. 解密
  let decipherText = decipher.update(encryptData, 'base64', 'utf8');
  decipherText += decipher.final('utf8');
  
  return decipherText;
}

/**
 * SHA256 Hash（PayUni 規格）
 * 
 * @param encryptStr - 加密後的字串
 * @param key - 加密金鑰（Hash Key）
 * @param iv - 初始化向量（Hash IV）
 * @returns 大寫 16 進制 hash 字串
 */
export function generatePayUniHash(
  encryptStr: string,
  key: string,
  iv: string
): string {
  const hash = crypto.createHash('sha256')
    .update(`${key}${encryptStr}${iv}`)
    .digest('hex');
  return hash.toUpperCase();
}
