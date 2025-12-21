/**
 * 獎勵與任務系統配置
 * 
 * 所有系統常數統一定義在此檔案
 * 修改獎勵規則時只需更新此檔案
 */

export const REWARD_CONFIG = {
  // ===== 推薦獎勵配置 =====
  
  /**
   * 每月推薦獎勵點數
   * 根據 spec：每代每月 10P
   */
  REFERRAL_REWARD_PER_MONTH: 10,
  
  /**
   * 推薦獎勵持續月數
   * 根據 spec：持續 12 個月
   */
  REFERRAL_REWARD_MONTHS: 12,
  
  /**
   * 最大推薦代數
   * 根據 spec：最多 3 代
   */
  MAX_GENERATION: 3,
  
  // ===== 任務獎勵配置 =====
  
  /**
   * 連續推薦達人任務 - 需連續月數
   * 根據 spec：連續 12 個月
   */
  TASK_CONSECUTIVE_MONTHS: 12,
  
  /**
   * 連續推薦達人任務 - 獎勵點數
   * 根據 spec：1000P
   */
  TASK_CONSECUTIVE_REWARD: 1000,
  
  /**
   * 推薦王任務 - 單月目標推薦數
   * 根據 spec：單月至少 10 個推薦
   */
  TASK_MONTHLY_KING_TARGET: 10,
  
  /**
   * 推薦王任務 - 獎勵點數
   * 根據 spec：1000P
   */
  TASK_MONTHLY_KING_REWARD: 1000,
  
  // ===== 系統配置 =====
  
  /**
   * 時區設定
   * 台北時間 (UTC+8)
   */
  TIMEZONE: 'Asia/Taipei',
  
  /**
   * 獎勵歷史最大保留筆數
   * 避免資料過度膨脹
   */
  REWARD_HISTORY_MAX_COUNT: 200,
  
  /**
   * GitHub Actions Cron 執行時間
   * UTC 16:05 = 台北時間 00:05
   * 格式：'分 時 日 月 週'
   */
  CRON_TIME: '5 16 * * *',
  
} as const;

/**
 * 獎勵類型定義
 */
export const REWARD_TYPES = {
  // 推薦獎勵
  REFERRAL_GEN1_MONTH1: 'referral_gen1_month1',
  REFERRAL_GEN1_MONTH2: 'referral_gen1_month2',
  // ... 以此類推
  
  // 任務獎勵
  TASK_CONSECUTIVE: 'task_consecutive_referral',
  TASK_MONTHLY_KING: 'task_monthly_king',
} as const;

/**
 * 獎勵排程狀態
 */
export const SCHEDULE_STATUS = {
  PENDING: 'pending',       // 待發放
  COMPLETED: 'completed',   // 已發放
  CANCELLED: 'cancelled',   // 已取消（來源刊登無效）
} as const;

/**
 * 任務類型定義
 */
export const TASK_TYPES = {
  CONSECUTIVE_REFERRAL: 'consecutive_referral',  // 連續推薦達人
  MONTHLY_KING: 'monthly_king',                  // 推薦王
} as const;

/**
 * 任務名稱對照表（用於顯示）
 */
export const TASK_NAMES = {
  [TASK_TYPES.CONSECUTIVE_REFERRAL]: '連續推薦達人',
  [TASK_TYPES.MONTHLY_KING]: '推薦王',
} as const;

/**
 * 任務描述對照表（用於顯示）
 */
export const TASK_DESCRIPTIONS = {
  [TASK_TYPES.CONSECUTIVE_REFERRAL]: '連續12個月每月至少推薦1位用戶',
  [TASK_TYPES.MONTHLY_KING]: '單月推薦10位以上用戶',
} as const;
