/**
 * 統一的推薦關係格式化工具
 * 
 * 設計原則：
 * 1. 所有「被推薦人」信息統一格式：「使用者名稱-刊登名稱」
 * 2. 所有「推薦人」信息統一格式：「使用者名稱-刊登名稱」
 * 3. 所有時間戳統一格式：「YYYY/MM/DD HH:mm:ss」
 * 
 * 使用場景：
 * - 獎勵歷史展示
 * - 任務詳情展示
 * - 推薦樹展示
 * - 所有涉及推薦關係的地方
 * 
 * @file /utils/referralFormatter.ts
 */

/**
 * 格式化被推薦人信息
 * 
 * @param userName 使用者名稱（例如：「張三」）
 * @param listingName 刊登名稱（例如：「台北按摩服務」）
 * @returns 格式化後的字串（例如：「張三-台北按摩服務」）
 * 
 * @example
 * formatReferee('張三', '台北按摩服務')
 * // 返回: '張三-台北按摩服務'
 */
export function formatReferee(userName: string, listingName: string): string {
  return `${userName}-${listingName}`;
}

/**
 * 格式化推薦人信息
 * 
 * @param userName 使用者名稱（例如：「李四」）
 * @param listingName 刊登名稱（例如：「新北SPA」）
 * @returns 格式化後的字串（例如：「李四-新北SPA」）
 * 
 * @example
 * formatReferrer('李四', '新北SPA')
 * // 返回: '李四-新北SPA'
 */
export function formatReferrer(userName: string, listingName: string): string {
  return `${userName}-${listingName}`;
}

/**
 * 格式化時間戳（完整版，含日期和時間）
 * 
 * @param isoString ISO 8601 格式時間戳（例如：'2024-12-15T12:34:56.789Z'）
 * @returns 格式化後的時間字串（例如：'2024/12/15 12:34:56'）
 * 
 * @example
 * formatTimestamp('2024-12-15T12:34:56.789Z')
 * // 返回: '2024/12/15 12:34:56'
 */
export function formatTimestamp(isoString: string): string {
  // ✅ 強制使用台灣時區（UTC+8）顯示時間
  const date = new Date(isoString);
  
  // 使用 toLocaleString 強制轉換為台灣時區
  const taiwanTimeStr = date.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // 格式化為 YYYY/MM/DD HH:mm:ss
  // toLocaleString 返回格式：YYYY/M/D 下午H:mm:ss 或 YYYY/M/D HH:mm:ss
  const parts = taiwanTimeStr.split(' ');
  const datePart = parts[0]; // YYYY/M/D
  const timePart = parts[parts.length - 1]; // HH:mm:ss
  
  // 標準化日期部分（補零）
  const [year, month, day] = datePart.split('/');
  const paddedDate = `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
  
  return `${paddedDate} ${timePart}`;
}

/**
 * 格式化日期（不含時間）
 * 
 * @param isoString ISO 8601 格式時間戳
 * @returns 格式化後的日期字串（例如：'2024/12/15'）
 * 
 * @example
 * formatDate('2024-12-15T12:34:56.789Z')
 * // 返回: '2024/12/15'
 */
export function formatDate(isoString: string): string {
  // ✅ 強制使用台灣時區（UTC+8）顯示日期
  const date = new Date(isoString);
  
  // 使用 toLocaleString 強制轉換為台灣時區
  const taiwanDateStr = date.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // toLocaleDateString 返回格式：YYYY/MM/DD
  return taiwanDateStr;
}

/**
 * 格式化代數信息
 * 
 * @param generation 代數（1, 2, 或 3）
 * @returns 格式化後的代數字串（例如：「第1代」、「第2代」、「第3代」）
 * 
 * @example
 * formatGeneration(1)
 * // 返回: '第1代'
 */
export function formatGeneration(generation: number): string {
  return `第${generation}代`;
}

/**
 * 格式化月份信息
 * 
 * @param monthNumber 月數（1~12）
 * @returns 格式化後的月份字串（例如：「第1個月」、「第2個月」）
 * 
 * @example
 * formatMonth(1)
 * // 返回: '第1個月'
 */
export function formatMonth(monthNumber: number): string {
  return `第${monthNumber}個月`;
}

/**
 * 生成完整的獎勵描述
 * 
 * @param userName 被推薦人使用者名稱
 * @param listingName 被推薦人刊登名稱
 * @param generation 代數（1, 2, 或 3）
 * @param monthNumber 月數（1~12）
 * @returns 完整的獎勵描述（例如：「推薦獎勵 - Admin-台北按摩服務（第2代）- 第1個月」）
 * 
 * @example
 * generateRewardDescription('Admin', '台北按摩服務', 2, 1)
 * // 返回: '推薦獎勵 - Admin-台北按摩服務（第2代）- 第1個月'
 */
export function generateRewardDescription(
  userName: string,
  listingName: string,
  generation: number,
  monthNumber: number
): string {
  const refereeName = formatReferee(userName, listingName);
  const genText = formatGeneration(generation);
  const monthText = formatMonth(monthNumber);
  
  return `推薦獎勵 - ${refereeName}（${genText}）- ${monthText}`;
}

/**
 * TypeScript 類型定義
 */

/**
 * 被推薦人完整信息
 */
export interface RefereeInfo {
  userId: string;
  userName: string;
  listingId: string;
  listingName: string;
}

/**
 * 推薦人完整信息
 */
export interface ReferrerInfo {
  userId: string;
  userName: string;
  listingId: string;
  listingName: string;
}

/**
 * 推薦人簡化信息（用於推薦樹）
 */
export interface ReferrerSimpleInfo {
  userName: string;
  listingName: string;
}