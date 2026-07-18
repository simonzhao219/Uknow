/**
 * 會員推薦格式化工具
 * 
 * ✅ Phase 10: 任務系統優化
 * 規格要求：推薦只與使用者有關，與刊登無關
 * 
 * 正確格式：userName-userReferralCode
 * 錯誤格式：userName-listingName（已棄用）
 */

/**
 * 格式化被推薦人資訊（會員推薦格式）
 * @example formatUserReferral('張三', 'abc123456') → '張三-abc123456'
 */
export function formatUserReferral(
  userName: string,
  userReferralCode: string
): string {
  return `${userName}-${userReferralCode}`;
}

/**
 * 格式化被推薦人卡片顯示數據
 * 
 * @param record - 月度推薦記錄
 * @returns 格式化後的卡片數據
 */
export function formatReferralCard(record: {
  userName: string;
  userReferralCode: string;
  createdAt: string;
}) {
  return {
    userName: record.userName,
    code: record.userReferralCode,
    timestamp: record.createdAt
  };
}

/**
 * 獲取激勵文案
 * 
 * @param progress - 進度百分比（0-100）
 * @returns 激勵文案
 */
export function getMotivationText(progress: number): string {
  if (progress === 0) return '🌱 開始你的推薦之旅！';
  if (progress <= 20) return '🔥 良好的開始！繼續加油！';
  if (progress <= 40) return '💪 進度不錯！再接再厲！';
  if (progress <= 60) return '🚀 即將達成！堅持下去！';
  if (progress <= 80) return '⚡ 就差一點點了！衝刺！';
  if (progress < 100) return '🎯 勝利在望！加油！';
  return '🎉 恭喜達成！立即領取獎勵！';
}

/**
 * 獲取進度顏色
 * 
 * @param progress - 進度百分比（0-100+）
 * @returns Tailwind 顏色類別
 */
export function getProgressColor(progress: number): string {
  if (progress >= 100) return 'text-green-600';
  if (progress >= 70) return 'text-yellow-600';
  if (progress >= 40) return 'text-blue-600';
  return 'text-gray-600';
}

/**
 * 獲取進度條樣式
 * 
 * @param progress - 進度百分比（0-100+）
 * @returns 進度條樣式類別
 */
export function getProgressBarStyle(progress: number): string {
  if (progress >= 100) {
    // 超過100%：橙色高光
    return 'bg-gradient-to-r from-orange-500 to-yellow-500';
  }
  if (progress >= 70) {
    // 70-99%：黃色漸變
    return 'bg-gradient-to-r from-yellow-500 to-orange-400';
  }
  if (progress >= 40) {
    // 40-69%：藍色漸變
    return 'bg-gradient-to-r from-blue-500 to-purple-500';
  }
  // 0-39%：灰色漸變
  return 'bg-gradient-to-r from-gray-400 to-gray-500';
}
