/**
 * 日期工具函數（台灣時區專用）
 * 
 * 所有日期都以台灣時區（UTC+8）為準
 * 
 * ✅ Phase 10.1: 修復時區重複偏移問題
 * - toTaiwanISOString() 和 formatTaiwanDateTime() 不再重複加8小時
 * - getTaiwanNow() 已經返回台灣時間 Date 對象，直接格式化即可
 */

const TAIWAN_TIMEZONE_OFFSET = 8 * 60; // 台灣時區偏移（分鐘）

/**
 * 獲取台灣當前日期時間
 * @returns Date 對象（台灣時區）
 */
export function getTaiwanNow(): Date {
  const now = new Date();
  // ✅ 優化：getTime() 已經返回 UTC 時間戳，直接加台灣時區偏移
  return new Date(now.getTime() + (TAIWAN_TIMEZONE_OFFSET * 60000));
}

/**
 * 將日期轉換為台灣時區的日期字符串（YYYY-MM-DD）
 * 
 * ⚠️ 重要：此函數接收的 Date 對象應該是 getTaiwanNow() 返回的時間戳調整後的對象
 * 使用 getUTC*() 方法在 UTC 環境下解釋時間戳，得到台灣時間的數字
 * 
 * @param date - Date 對象（時間戳已調整為台灣時間）
 * @returns 台灣時區的日期字符串
 */
export function toTaiwanDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 將日期轉換為台灣時區的 ISO 字符串（YYYY-MM-DDTHH:mm:ss+08:00）
 * 
 * ⚠️ 重要：此函數接收的 Date 對象應該是 getTaiwanNow() 返回的時間戳調整後的對象
 * 使用 getUTC*() 方法在 UTC 環境下解釋時間戳，得到台灣時間的數字
 * 
 * @param date - Date 對象（時間戳已調整為台灣時間）
 * @returns 台灣時區的 ISO 字符串
 */
export function toTaiwanISOString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`;
}

/**
 * 創建台灣時區的日期（從 YYYY-MM-DD 字符串）
 * @param dateString - 日期字符串（YYYY-MM-DD）
 * @param hours - 小時（0-23），默認 0
 * @param minutes - 分鐘（0-59），默認 0
 * @param seconds - 秒（0-59），默認 0
 * @param milliseconds - 毫秒（0-999），默認 0
 * @returns Date 對象
 */
export function createTaiwanDate(
  dateString: string,
  hours: number = 0,
  minutes: number = 0,
  seconds: number = 0,
  milliseconds: number = 0
): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  // 創建 UTC 時間，然後減去台灣時區偏移
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds));
  return new Date(utcDate.getTime() - (TAIWAN_TIMEZONE_OFFSET * 60000));
}

/**
 * 獲取台灣時區的今天日期（00:00:00）
 * @returns Date 對象
 */
export function getTaiwanToday(): Date {
  const now = getTaiwanNow();
  const dateString = toTaiwanDateString(now);
  return createTaiwanDate(dateString, 0, 0, 0, 0);
}

/**
 * 計算訂閱週期的結束日（台灣時區）
 * 規則：起始日 + 1年 - 1天 23:59:59.999
 * 
 * @param startDate - 起始日（Date 對象）
 * @returns 結束日（Date 對象）
 */
export function calculateSubscriptionEndDate(startDate: Date): Date {
  const startDateString = toTaiwanDateString(startDate);
  const [year, month, day] = startDateString.split('-').map(Number);
  
  // 加一年
  const nextYearDate = createTaiwanDate(`${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, 0, 0, 0, 0);
  
  // 減一天，設為 23:59:59.999
  const endDate = new Date(nextYearDate.getTime() - 1); // 減一毫秒
  
  return endDate;
}

/**
 * 格式化日期顯示（YYYY/MM/DD）
 * @param date - Date 對象或 ISO 字符串
 * @returns 格式化的日期字符串
 */
export function formatTaiwanDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const dateString = toTaiwanDateString(dateObj);
  return dateString.replace(/-/g, '/');
}

/**
 * 格式化日期時間顯示（YYYY/MM/DD HH:mm:ss）
 * 
 * ⚠️ 重要：此函數接收 ISO 字符串或 getTaiwanNow() 返回的 Date 對象
 * - ISO 字符串：new Date() 會正確解析時區信息
 * - getTaiwanNow() 的 Date：使用 getUTC*() 方法解釋時間戳
 * 
 * @param date - Date 對象或 ISO 字符串
 * @returns 格式化的日期時間字符串
 */
export function formatTaiwanDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // 如果是 ISO 字符串（帶時區信息），使用本地方法
  // 如果是 getTaiwanNow() 返回的對象，需要使用 UTC 方法
  // 為了統一處理，統一使用 UTC 方法（因為我們的 Date 都是時間戳調整後的）
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getUTCSeconds()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 生成 PayUni 訂單編號（25碼）
 * 格式：YYYYMMDDHH(10) + User UID(前15)
 * 
 * @param userId - 用戶 UID
 * @returns 25碼訂單編號
 */
export function generatePayUniTradeNo(userId: string): string {
  const now = getTaiwanNow();
  
  // 時間戳（10碼）YYYYMMDDHH - 使用 UTC 方法解釋時間戳
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const timestamp = `${year}${month}${day}${hours}`;
  
  // User UID 前15碼
  const userIdPrefix = userId.substring(0, 15).padEnd(15, '0');
  
  return timestamp + userIdPrefix;  // 總共 25 碼 (10 + 15)
}