/**
 * 日期工具函數（台灣時區專用）- Webhooks 副本
 * 
 * 所有日期都以台灣時區（UTC+8）為準
 */

const TAIWAN_TIMEZONE_OFFSET = 8 * 60; // 台灣時區偏移（分鐘）

/**
 * 獲取台灣當前日期時間
 * @returns Date 對象（台灣時區）
 */
export function getTaiwanNow(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (TAIWAN_TIMEZONE_OFFSET * 60000));
}

/**
 * 將日期轉換為台灣時區的 ISO 字符串（YYYY-MM-DDTHH:mm:ss+08:00）
 * 
 * @param date - Date 對象（台灣時區）
 * @returns 台灣時區的 ISO 字符串
 */
export function toTaiwanISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`;
}
