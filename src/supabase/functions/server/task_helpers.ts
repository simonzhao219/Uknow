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
      checkedAt: null // 會在定時任務中更新
    });
    
    // 重置本月
    king.currentMonth = currentMonth;
    king.currentCount = 0;
    king.completionsThisMonth = 0;  // ✅ 重置完成次數
    king.completed = false;
  }
  
  king.currentCount += 1;
  console.log(`  ✅ 推薦王任務：本月推薦數 ${king.currentCount}/${king.target}`);
  
  // ✅ 檢查是否完成任務（10人，支持溢出 - 扣除制）
  while (king.currentCount >= REWARD_CONFIG.TASK_MONTHLY_KING_TARGET) {
    king.completionsThisMonth = (king.completionsThisMonth || 0) + 1;
    
    console.log(`  🎉 推薦王任務完成！第${king.completionsThisMonth}次達成，創建待領取獎勵...`);
    
    try {
      // 創建待領取獎勵
      await createPendingMissionReward(
        userId,
        'monthly_king',
        REWARD_CONFIG.TASK_MONTHLY_KING_REWARD,
        timestampStr,
        { 
          month: currentMonth, 
          completionIndex: king.completionsThisMonth 
        }
      );
      
      // ✅ 扣除制：count -= 10
      king.currentCount -= REWARD_CONFIG.TASK_MONTHLY_KING_TARGET;
      
      console.log(`  ✅ 推薦王獎勵已創建，剩餘計數: ${king.currentCount}`);
    } catch (error) {
      console.error(`  ❌ 創建推薦王獎勵失敗:`, error);
      // 避免無限循環
      break;
    }
  }
  
  // ===== 3. 保存任務資料 =====
  tasks.lastUpdated = timestampStr;
  await kv.set(tasksKey, tasks);
  
  console.log('  ✅ 任務進度已更新並保存');
}

/**
 * 初始化預設任務
 */
export function initializeDefaultTasks() {
  return {
    consecutiveReferral: null,
    monthlyKing: null,
    lastUpdated: toTaiwanISOString(getTaiwanNow())  // ✅ 修復：使用台灣時區
  };
}

/**
 * 創建待領取的任務獎勵
 * 
 * @param userId - 用戶 ID
 * @param type - 任務類型
 * @param amount - 獎勵金額
 * @param achievedAt - 完成時間
 * @param details - 任務詳情
 */
export async function createPendingMissionReward(
  userId: string,
  type: 'consecutive_referral' | 'monthly_king',
  amount: number,
  achievedAt: string,
  details: any
): Promise<void> {
  const rewardId = `mission_reward_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  console.log(`[Create Pending Mission Reward] 創建待領取任務獎勵: ${rewardId}`);
  
  // 獲取當前獎勵數據（用於預計算）
  const rewardsKey = `user:${userId}:rewards`;
  const rewards = await kv.get(rewardsKey) || {
    availableRewards: 0,
    pendingRewards: 0,
    withdrawnRewards: 0,
    totalEarned: 0
  };
  
  // 生成描述
  let description = '';
  if (type === 'consecutive_referral') {
    description = `連續推薦達人 - 完成${details.streak}個月連續推薦`;
  } else if (type === 'monthly_king') {
    const monthStr = details.month.substring(0, 7); // "2024-12"
    description = `推薦王 - ${monthStr}月第${details.completionIndex}次達成`;
  }
  
  // 創建待領取獎勵記錄
  const pendingReward = {
    id: rewardId,
    type,
    amount,
    achievedAt,
    status: 'pending',
    description,
    details,
    // ✅ 預計算領取後的點數變化
    previewData: {
      currentAvailable: rewards.availableRewards,
      currentTotal: rewards.totalEarned,
      afterAvailable: rewards.availableRewards + amount,
      afterTotal: rewards.totalEarned + amount
    }
  };
  
  // 儲存到用戶的待領取獎勵列表
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
  
  const monthKey = timestampStr.substring(0, 7); // "2024-12"
  
  // ===== 1. 更新用戶的月度日誌 =====
  const userLogKey = `user:${userId}:referral_monthly_log`;
  const userLog = await kv.get(userLogKey) || {};
  
  if (!userLog[monthKey]) {
    userLog[monthKey] = [];
  }
  
  userLog[monthKey].push({
    userId: referee.userId,
    userName: referee.userName,
    userReferralCode: referee.userReferralCode || null,  // ✅ 新增
    listingId: referee.listingId,
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
    userId: referee.userId,
    userName: referee.userName,
    userReferralCode: referee.userReferralCode || null,  // ✅ 新增
    listingId: referee.listingId,
    listingName: referee.listingName,
    referrer: referee.referrer || null,
    createdAt: timestampStr
  });
  
  await kv.set(globalLogKey, globalLog);
  
  // ✅ 顯示名稱優先使用推薦碼
  const displayName = referee.userReferralCode 
    ? `${referee.userName}-${referee.userReferralCode}`
    : referee.listingName 
      ? `${referee.userName}-${referee.listingName}`
      : referee.userName;
    
  console.log(`✅ 更新月度日誌: user=${userId}, month=${monthKey}, referee=${displayName}`);
}

/**
 * 獲取台灣當前時間
 */
function getTaiwanNow(): Date {
  const now = new Date();
  const taiwanOffset = 8 * 60 * 60 * 1000; // 台灣時區偏移量（毫秒）
  return new Date(now.getTime() + taiwanOffset);
}

/**
 * 將日期轉換為台灣時區的 ISO 8601 字串
 */
function toTaiwanISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`;
}