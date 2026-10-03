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
 * @example formatUserReferral('張三', '8048876') → '張三-8048876'
 */
export function formatUserReferral(userName: string, userReferralCode: string): string {
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
    timestamp: record.createdAt,
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
 * @returns Tailwind 語義色 token 類別（達標=success，將達=warning，其餘去色為中性）
 */
export function getProgressColor(progress: number): string {
  if (progress >= 100) return 'text-success-subtle-foreground';
  if (progress >= 70) return 'text-warning-subtle-foreground';
  if (progress >= 40) return 'text-muted-foreground';
  return 'text-muted-foreground';
}

/**
 * 獲取進度條樣式
 *
 * @param progress - 進度百分比（0-100+）
 * @returns 進度條樣式類別（離散分段的語義色 token，不再用漸層）
 */
export function getProgressBarStyle(progress: number): string {
  if (progress >= 100) {
    return 'bg-success';
  }
  if (progress >= 70) {
    return 'bg-warning';
  }
  if (progress >= 40) {
    return 'bg-muted-foreground';
  }
  return 'bg-muted-foreground';
}
