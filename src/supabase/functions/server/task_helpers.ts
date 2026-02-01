/**
 * 任務系統輔助函數
 * 
 * 統一管理任務進度更新邏輯，避免重複程式碼
 * 
 * ✅ Phase 10: 任務系統優化
 * - 付費成功時自動更新任務進度
 * - 任務達成時自動創建待領取獎勵
 * - 支持推薦王溢出機制（扣除制）
 * - 支持連續推薦達人循環（完成後重新開始）
 */

import * as kv from './kv_store.tsx';
import { REWARD_CONFIG } from './reward_config.ts';
import { getTaiwanNow, toTaiwanISOString } from './date_utils.ts';

/**
 * 更新任務進度
 * 只有第1代推薦才計入任務
 * 
 * @param userId - 用戶 ID
 * @param timestamp - 時間戳（ISO 8601 字串或 Date 物件）
 */
export async function updateTaskProgress(
  userId: string,
  timestamp: string | Date
): Promise<void> {
  console.log(`[Update Task Progress] 更新任務進度: ${userId}`);
  
  const tasksKey = `user:${userId}:tasks`;
  const tasks = await kv.get(tasksKey) || initializeDefaultTasks();
  
  // 統一時間格式
  const timestampStr = typeof timestamp === 'string' 
    ? timestamp 
    : timestamp.toISOString();
  
  const currentMonth = timestampStr.substring(0, 7); // "2024-12"
  const currentDate = timestampStr.split('T')[0]; // "2024-12-22"
  
  // ===== 1. 更新連續推薦達人任務 =====
  if (!tasks.consecutiveReferral) {
    tasks.consecutiveReferral = {
      id: "task_consecutive",
      type: "consecutive_referral",
      title: "連續推薦達人",
      description: "連續12個月每月至少推薦1位用戶",
      target: REWARD_CONFIG.TASK_CONSECUTIVE_MONTHS,
      currentStreak: 0,
      startMonth: currentMonth,
      lastActiveMonth: null,
      monthlyRecord: {},
      completed: false,
      reward: REWARD_CONFIG.TASK_CONSECUTIVE_REWARD,
      lastCheckedAt: null
    };
  }
  
  const consecutive = tasks.consecutiveReferral;
  
  // 檢查是否斷續
  if (consecutive.lastActiveMonth) {
    const lastDate = new Date(consecutive.lastActiveMonth + "-01");
    const currentDateObj = new Date(currentMonth + "-01");
    const monthsDiff = (currentDateObj.getFullYear() - lastDate.getFullYear()) * 12
                     + (currentDateObj.getMonth() - lastDate.getMonth());
    
    if (monthsDiff > 1) {
      // 斷續了，重置任務
      console.log(`  ⚠️ 連續推薦任務斷續: 上次=${consecutive.lastActiveMonth}, 本次=${currentMonth}`);
      consecutive.currentStreak = 0;
      consecutive.startMonth = currentMonth;
      consecutive.monthlyRecord = {};
      consecutive.completed = false;
    }
  }
  
  // 更新本月記錄
  if (!consecutive.monthlyRecord[currentMonth]) {
    consecutive.monthlyRecord[currentMonth] = {
      count: 0,
      date: currentDate,
      qualified: false
    };
  }
  
  consecutive.monthlyRecord[currentMonth].count += 1;
  consecutive.monthlyRecord[currentMonth].qualified = true;
  
  // 如果是本月第一次推薦，連續月數+1
  if (consecutive.monthlyRecord[currentMonth].count === 1) {
    consecutive.currentStreak += 1;
    console.log(`  ✅ 連續推薦任務：連續月數 ${consecutive.currentStreak}/${consecutive.target}`);
    
    // ✅ 檢查是否完成任務（12個月）
    if (consecutive.currentStreak === REWARD_CONFIG.TASK_CONSECUTIVE_MONTHS) {
      console.log(`  🎉 連續推薦達人任務完成！創建待領取獎勵...`);
      
      try {
        // 創建待領取獎勵
        await createPendingMissionReward(
          userId,
          'consecutive_referral',
          REWARD_CONFIG.TASK_CONSECUTIVE_REWARD,
          timestampStr,
          { streak: consecutive.currentStreak }
        );
        
        // 重置任務（開啟新一輪）
        consecutive.currentStreak = 0;
        consecutive.startMonth = currentMonth;
        consecutive.monthlyRecord = {};
        consecutive.completed = false;
        
        console.log(`  ✅ 連續推薦達人獎勵已創建，任務已重置（開啟新一輪）`);
      } catch (error) {
        console.error(`  ❌ 創建連續推薦達人獎勵失敗:`, error);
        // 不中斷流程
      }
    }
  }
  
  consecutive.lastActiveMonth = currentMonth;
  
  // ===== 2. 更新推薦王任務 =====
  if (!tasks.monthlyKing) {
    tasks.monthlyKing = {
      id: "task_monthly_king",
      type: "monthly_king",
      title: "推薦王",
      description: "單月推薦10位以上用戶",
      target: REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
      currentMonth: currentMonth,
      currentCount: 0,
      completionsThisMonth: 0,  // ✅ 新增：本月完成次數
      completed: false,
      reward: REWARD_CONFIG.TASK_MONTHLY_KING_REWARD,
      history: []
    };
  }
  
  const king = tasks.monthlyKing;
  
  // 檢查是否換月
  if (king.currentMonth !== currentMonth) {
    // 將上個月記錄加入歷史
    king.history.push({
      month: king.currentMonth,
      count: king.currentCount,
      completionsThisMonth: king.completionsThisMonth || 0,  // ✅ 記錄完成次數
      qualified: king.currentCount >= REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
      completedAt: timestampStr
    });
    
    // 重置本月計數
    king.currentMonth = currentMonth;
    king.currentCount = 0;
    king.completionsThisMonth = 0;  // ✅ 重置本月完成次數
    king.completed = false;
  }
  
  // 更新計數
  king.currentCount += 1;
  console.log(`  ✅ 推薦王任務：本月推薦數 ${king.currentCount}/${king.target}`);
  
  // ✅ 檢查是否達標（每達到10次創建一次待領取獎勵）
  if (king.currentCount % REWARD_CONFIG.TASK_MONTHLY_KING_TARGET === 0) {
    console.log(`  🎉 推薦王任務達標！創建待領取獎勵...`);
    
    try {
      king.completionsThisMonth += 1;  // ✅ 本月完成次數+1
      
      await createPendingMissionReward(
        userId,
        'monthly_king',
        REWARD_CONFIG.TASK_MONTHLY_KING_REWARD,
        timestampStr,
        { 
          month: currentMonth, 
          count: king.currentCount,
          completionNumber: king.completionsThisMonth  // ✅ 記錄第幾次完成
        }
      );
      
      console.log(`  ✅ 推薦王待領取獎勵已創建（本月第 ${king.completionsThisMonth} 次完成）`);
    } catch (error) {
      console.error(`  ❌ 創建推薦王獎勵失敗:`, error);
      king.completionsThisMonth -= 1;  // ✅ 回滾完成次數
      // 不中斷流程
    }
  }
  
  // 保存任務資料
  await kv.set(tasksKey, tasks);
  
  console.log(`[Update Task Progress] ✅ 任務進度已更新`);
}

/**
 * 初始化默認任務結構
 */
function initializeDefaultTasks() {
  return {
    consecutiveReferral: {
      id: "task_consecutive",
      type: "consecutive_referral",
      title: "連續推薦達人",
      description: "連續12個月每月至少推薦1位用戶",
      target: REWARD_CONFIG.TASK_CONSECUTIVE_MONTHS,
      currentStreak: 0,
      startMonth: null,
      lastActiveMonth: null,
      monthlyRecord: {},
      completed: false,
      reward: REWARD_CONFIG.TASK_CONSECUTIVE_REWARD,
      lastCheckedAt: null
    },
    monthlyKing: {
      id: "task_monthly_king",
      type: "monthly_king",
      title: "推薦王",
      description: "單月推薦10位以上用戶",
      target: REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
      currentMonth: null,
      currentCount: 0,
      completionsThisMonth: 0,
      completed: false,
      reward: REWARD_CONFIG.TASK_MONTHLY_KING_REWARD,
      history: []
    }
  };
}

/**
 * 創建待領取的任務獎勵
 * 
 * @param userId - 用戶 ID
 * @param taskType - 任務類型
 * @param amount - 獎勵金額
 * @param timestamp - 完成時間戳
 * @param metadata - 額外元數據
 */
export async function createPendingMissionReward(
  userId: string,
  taskType: string,
  amount: number,
  timestamp: string,
  metadata: any = {}
): Promise<void> {
  console.log(`[Create Pending Mission Reward] 創建待領取任務獎勵: userId=${userId}, type=${taskType}, amount=${amount}P`);
  
  const rewardId = `mission_reward_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // 任務類型描述
  const taskDescriptions: { [key: string]: string } = {
    'consecutive_referral': '連續推薦達人',
    'monthly_king': '推薦王'
  };
  
  const description = taskDescriptions[taskType] || '任務獎勵';
  
  const pendingReward = {
    id: rewardId,
    type: 'mission',
    taskType: taskType,
    amount: amount,
    description: description,
    metadata: metadata,
    status: 'pending',  // pending | claimed
    createdAt: timestamp,
    claimedAt: null
  };
  
  // 添加到用戶的待領取獎勵列表
  const pendingRewardsKey = `user:${userId}:pending_mission_rewards`;
  const pendingRewards = await kv.get(pendingRewardsKey) || [];
  
  pendingRewards.unshift(pendingReward);
  await kv.set(pendingRewardsKey, pendingRewards);
  
  console.log(`  ✅ 待領取任務獎勵已創建: ${rewardId}`);
  console.log(`  📋 描述: ${description}`);
  console.log(`  💰 獎勵金額: ${amount}P`);
}

/**
 * 更新推薦月度日誌
 * 用於任務判定和月度統計
 * 
 * ✅ Phase 10: 支持會員數據格式（付費時還沒有刊登）
 * 
 * @param userId - 用戶 ID
 * @param referee - 被推薦人資訊
 * @param createdAt - 創建時間
 */
export async function updateReferralMonthlyLog(
  userId: string,
  referee: {
    userId: string;
    userName: string;
    userReferralCode?: string;   // ✅ 新增：被推薦人的推薦碼
    listingId: string | null;     // ✅ 改為可空（付費時還沒有刊登）
    listingName: string | null;   // ✅ 改為可空
    referrer?: {
      userId: string;
      userName: string;
      userReferralCode?: string;  // ✅ 新增：推薦人的推薦碼
      listingId: string | null;
      listingName: string | null;
    };
  },
  createdAt: Date | string
): Promise<void> {
  const timestampStr = typeof createdAt === 'string' 
    ? createdAt 
    : createdAt.toISOString();
  
  const month = timestampStr.substring(0, 7); // "2024-12"
  
  console.log(`[Update Monthly Log] 更新月度日誌: userId=${userId}, month=${month}`);
  
  const logKey = `user:${userId}:referral_monthly_log`;
  const log = await kv.get(logKey) || {};
  
  if (!log[month]) {
    log[month] = [];
  }
  
  // ✅ 完整記錄（支持會員格式 + 刊登格式）
  const logEntry = {
    userId: referee.userId,
    userName: referee.userName,
    userReferralCode: referee.userReferralCode || null,  // ✅ 被推薦人推薦碼
    listingId: referee.listingId,                        // ✅ 可能為 null（付費時）
    listingName: referee.listingName,                    // ✅ 可能為 null（付費時）
    referrer: referee.referrer || null,                  // ✅ 推薦人資訊（二代/三代有值）
    createdAt: timestampStr
  };
  
  log[month].push(logEntry);
  
  await kv.set(logKey, log);
  
  console.log(`[Update Monthly Log] ✅ 月度日誌已更新: ${month}, 總推薦數=${log[month].length}`);
}
