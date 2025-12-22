/**
 * 任務系統輔助函數
 * 
 * 統一管理任務進度更新邏輯，避免重複程式碼
 */

import * as kv from './kv_store.tsx';
import { REWARD_CONFIG } from './reward_config.ts';

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
      qualified: king.currentCount >= REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
      checkedAt: null // 會在定時任務中更新
    });
    
    // 重置本月
    king.currentMonth = currentMonth;
    king.currentCount = 0;
    king.completed = false;
  }
  
  king.currentCount += 1;
  console.log(`  ✅ 推薦王任務：本月推薦數 ${king.currentCount}/${king.target}`);
  
  // ===== 3. 保存任務資料 =====
  tasks.lastUpdated = timestampStr;
  await kv.set(tasksKey, tasks);
  
  console.log('  ✅ 任務進度已更新');
}

/**
 * 初始化預設任務
 */
export function initializeDefaultTasks() {
  return {
    consecutiveReferral: null,
    monthlyKing: null,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 更新推薦月度日誌
 * 用於任務判定和月度統計
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
    listingId: string;
    listingName: string;
    referrer?: {
      userId: string;
      userName: string;
      listingId: string;
      listingName: string;
    };
  },
  createdAt: Date | string
): Promise<void> {
  const timestampStr = typeof createdAt === 'string' 
    ? createdAt 
    : createdAt.toISOString();
  
  const monthKey = timestampStr.substring(0, 7); // "2024-12"
  
  // ===== 1. 更新用戶的月度日誌 =====
  const userLogKey = `user:${userId}:referral_monthly_log`;
  const userLog = await kv.get(userLogKey) || {};
  
  if (!userLog[monthKey]) {
    userLog[monthKey] = [];
  }
  
  userLog[monthKey].push({
    listingId: referee.listingId,
    userId: referee.userId,
    userName: referee.userName,
    listingName: referee.listingName,
    referrer: referee.referrer || null,
    createdAt: timestampStr
  });
  
  await kv.set(userLogKey, userLog);
  
  // ===== 2. 更新全局月度日誌索引（用於 Cron 任務結算）=====
  const globalLogKey = `referral_monthly_log:${monthKey}`;
  const globalLog = await kv.get(globalLogKey) || {};
  
  if (!globalLog[userId]) {
    globalLog[userId] = [];
  }
  
  globalLog[userId].push({
    listingId: referee.listingId,
    userId: referee.userId,
    userName: referee.userName,
    listingName: referee.listingName,
    referrer: referee.referrer || null,
    createdAt: timestampStr
  });
  
  await kv.set(globalLogKey, globalLog);
  
  console.log(`✅ 更新月度日誌: user=${userId}, month=${monthKey}, referee=${referee.userName}-${referee.listingName}`);
}
