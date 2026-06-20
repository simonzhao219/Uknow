// PayUni AES-256-GCM + SHA-256 crypto utilities
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export function encryptPayUni(data: Record<string, string | number>, key: string, iv: string): string {
  const plaintext = new URLSearchParams(
    Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
  ).toString();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ct = cipher.update(plaintext, 'utf8', 'base64');
  ct += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return Buffer.from(`${ct}:::${tag}`).toString('hex').trim();
}

export function decryptPayUni(encryptStr: string, key: string, iv: string): string {
  const combined = Buffer.from(encryptStr, 'hex').toString();
  const [encData, tag] = combined.split(':::');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  let pt = decipher.update(encData, 'base64', 'utf8');
  pt += decipher.final('utf8');
  return pt;
}

export function generatePayUniHash(encryptStr: string, key: string, iv: string): string {
  return crypto.createHash('sha256')
    .update(`${key}${encryptStr}${iv}`)
    .digest('hex')
    .toUpperCase();
}
