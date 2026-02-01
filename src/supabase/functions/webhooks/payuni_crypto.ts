import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

// ========================================
// PayUni 加解密工具
// AES-256-GCM + SHA256
// ========================================

/**
 * 加密數據（PayUni 格式）
 * 使用 AES-256-GCM
 * 
 * @param data - 要加密的數據（可以是字串或物件）
 * @param key - HashKey
 * @param iv - HashIV
 * @returns hex 格式的加密字串
 */
export function encryptPayUni(data: string | object, key: string, iv: string): string {
  // 如果是物件，轉換為 URLSearchParams 格式
  const plainText = typeof data === 'string' 
    ? data 
    : new URLSearchParams(data as Record<string, string>).toString();
  
  const keyBuffer = Buffer.from(key);
  const ivBuffer = Buffer.from(iv);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, ivBuffer);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag().toString('hex');
  
  const combined = `${encrypted}:::${tag}`;
  return Buffer.from(combined).toString('hex').trim();
}

/**
 * 解密數據（PayUni 格式）
 * 使用 AES-256-GCM
 * 
 * @param encryptStr - hex 格式的加密字串
 * @param key - HashKey
 * @param iv - HashIV
 * @returns 解密後的字串
 */
export function decryptPayUni(encryptStr: string, key: string, iv: string): string {
  const combined = Buffer.from(encryptStr, 'hex').toString();
  const [cipherText, tag] = combined.split(':::');
  
  const keyBuffer = Buffer.from(key);
  const ivBuffer = Buffer.from(iv);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(cipherText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * 生成 PayUni Hash（用於驗證）
 * 使用 SHA256
 * 
 * @param encryptInfo - 加密後的數據
 * @param key - HashKey
 * @param iv - HashIV
 * @returns 大寫 hex 格式的 hash 值
 */
export function generatePayUniHash(encryptInfo: string, key: string, iv: string): string {
  const combined = `HashKey=${key}&HashIV=${iv}&${encryptInfo}`;
  return crypto.createHash('sha256').update(combined).digest('hex').toUpperCase();
}
