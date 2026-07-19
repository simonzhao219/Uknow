/**
 * 推薦關係的時間格式化工具。
 *
 * 歷史備註：這裡曾有一整組「使用者名稱-刊登名稱」的字串格式化函式
 * （formatReferee/formatReferrer/formatGeneration 等），推薦描述改由
 * 後端組字後全部失去使用者，已移除；只保留仍被獎勵歷史/推薦樹等
 * 六處元件使用的 formatTimestamp。
 *
 * @file /utils/referralFormatter.ts
 */

import { formatTwTimestamp } from './twDate';

/**
 * 格式化時間戳（完整版，含日期和時間）
 *
 * @param isoString ISO 8601 格式時間戳（例如：'2024-12-15T12:34:56.789Z'）
 * @returns 格式化後的時間字串（例如：'2024/12/15 12:34:56'）
 */
export function formatTimestamp(isoString: string): string {
  // 委派給統一的台灣時間工具（src/utils/twDate.ts）
  return formatTwTimestamp(isoString);
}
