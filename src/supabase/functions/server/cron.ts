import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { REWARD_CONFIG, SCHEDULE_STATUS, TASK_NAMES } from './reward_config.ts';
import { checkAndUpdateSubscriptionStatus, SubscriptionStatus } from './subscriptions.ts';

const cron = new Hono();

/**
 * POST /cron/process-daily-rewards
 * 
 * 每日獎勵與任務處理（由 GitHub Actions 每日 00:05 觸發）
 * 
 * 功能：
 * 1. 處理推薦獎勵排程（第2~12個月）
 * 2. 檢查並更新所有用戶的訂閱狀態
 * 3. 結算任務完成狀態（每月1日）
 * 
 * 安全：只允許 Service Role Key 調用
 */
cron.post('/process-daily-rewards', async (c) => {
  try {
    console.log('========== 🕐 開始每日獎勵處理 ==========');
    const startTime = Date.now();
    
    // ===== 驗證請求來源（只允許 Service Role Key）=====
    const authHeader = c.req.header('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
      console.error('❌ 未授權的請求');
      return c.json({ 
        error: 'Unauthorized',
        message: '只允許 Service Role Key 調用此端點'
      }, 401);
    }
    
    console.log('✅ 請求授權驗證通過');
    
    // ===== 獲取今日日期 =====
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // "2025-12-15"
    
    console.log(`📅 處理日期: ${todayStr}`);
    console.log(`📅 當前時間: ${new Date().toISOString()}`);
    
    // ===== 1. 處理推薦獎勵排程 =====
    console.log('\n🎁 ===== 開始處理推薦獎勵排程 =====');
    const rewardResults = await processDailyRewardSchedules(todayStr);
    
    // ===== 2. 檢查並更新所有用戶的訂閱狀態 ===== 
    console.log('\n📋 ===== 開始檢查訂閱狀態 =====');
    const subscriptionResults = await processSubscriptionStatusCheck();
    
    // ===== 3. 處理任務結算（只在每月1日執行）=====
    let taskResults;
    if (today.getDate() === 1) {
      console.log('\n🎯 ===== 開始處理任務結算（每月1日）=====');
      taskResults = await processDailyTaskSettlement(today);
    } else {
      console.log('\n🎯 ===== 跳過任務結算（非每月1日）=====');
      taskResults = { skipped: true };
    }
    
    // ===== 計算執行時間 =====
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n========== ✅ 每日獎勵處理完成 ==========');
    console.log(`⏱️ 執行時間: ${executionTime} 秒`);
    console.log(`📊 推薦獎勵: 處理=${rewardResults.processed}, 發放=${rewardResults.issued}, 取消=${rewardResults.cancelled}`);
    if (taskResults.skipped) {
      console.log(`📊 任務結算: 已跳過（非每月1日）`);
    } else {
      console.log(`📊 任務結算: 連續推薦=${taskResults.consecutiveRewardCount}, 推薦王=${taskResults.monthlyKingRewardCount}`);
    }
    
    return c.json({
      success: true,
      date: todayStr,
      executionTime: `${executionTime}s`,
      rewards: rewardResults,
      tasks: taskResults,
      processedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('========== ❌ 每日獎勵處理錯誤 ==========');
    console.error(error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, 500);
  }
});

// ===================================================================
// 推薦獎勵排程處理
// ===================================================================

/**
 * 處理推薦獎勵排程
 * 
 * 流程：
 * 1. 從日期索引讀取今日應發放的排程 ID
 * 2. 逐一檢查排程狀態和來源刊登有效性
 * 3. 發放獎勵或標記為取消
 * 4. 更新排程狀態
 */
async function processDailyRewardSchedules(todayStr: string) {
  console.log(`🔄 開始處理推薦獎勵排程: ${todayStr}`);
  
  // 1. 從日期索引讀取今日應發放的排程 ID 列表
  const dateIndexKey = `reward_schedules_by_date:${todayStr}`;
  const scheduleIds = await kv.get(dateIndexKey) || [];
  
  console.log(`📋 今日待處理排程數量: ${scheduleIds.length}`);
  
  if (scheduleIds.length === 0) {
    return { processed: 0, issued: 0, cancelled: 0 };
  }
  
  let issuedCount = 0;
  let cancelledCount = 0;
  
  // 2. 逐一處理每個排程
  for (const scheduleId of scheduleIds) {
    try {
      const schedule = await kv.get(`reward_schedule:${scheduleId}`);
      
      // 檢查排程是否存在且狀態為待處理
      if (!schedule) {
        console.warn(`⚠️ 排程不存在: ${scheduleId}`);
        continue;
      }
      
      if (schedule.status !== SCHEDULE_STATUS.PENDING) {
        console.log(`ℹ️ 排程已處理，跳過: ${scheduleId} (status=${schedule.status})`);
        continue;
      }
      
      console.log(`\n📦 處理排程: ${scheduleId}`);
      console.log(`   用戶: ${schedule.userId}`);
      console.log(`   來源刊登: ${schedule.sourceListingId}`);
      console.log(`   月數: ${schedule.monthNumber}`);
      console.log(`   金額: ${schedule.amount}P`);
      
      // 3. 檢查來源刊登是否仍然有效
      const sourceListing = await kv.get(`listing:${schedule.sourceListingId}`);
      
      if (!sourceListing) {
        console.log(`   ❌ 來源刊登不存在，取消排程`);
        schedule.status = SCHEDULE_STATUS.CANCELLED;
        schedule.completedAt = new Date().toISOString();
        schedule.cancellationReason = '來源刊登不存在';
        await kv.set(`reward_schedule:${scheduleId}`, schedule);
        cancelledCount++;
        continue;
      }
      
      // 檢查刊登是否已取消
      if (sourceListing.cancelledAt) {
        console.log(`   ❌ 來源刊登已取消（${sourceListing.cancelledAt}），取消排程`);
        schedule.status = SCHEDULE_STATUS.CANCELLED;
        schedule.completedAt = new Date().toISOString();
        schedule.cancellationReason = '來源刊登已取消';
        await kv.set(`reward_schedule:${scheduleId}`, schedule);
        cancelledCount++;
        continue;
      }
      
      // 檢查刊登是否仍在有效期內
      const activeUntil = new Date(sourceListing.activeUntil);
      if (activeUntil < new Date()) {
        console.log(`   ❌ 來源刊登已過期（${sourceListing.activeUntil}），取消排程`);
        schedule.status = SCHEDULE_STATUS.CANCELLED;
        schedule.completedAt = new Date().toISOString();
        schedule.cancellationReason = '來源刊登已過期';
        await kv.set(`reward_schedule:${scheduleId}`, schedule);
        cancelledCount++;
        continue;
      }
      
      // 4. 發放獎勵
      console.log(`   ✅ 來源刊登有效，發放獎勵`);
      await issueScheduledReward(schedule);
      
      // 5. 更新排程狀態
      schedule.status = SCHEDULE_STATUS.COMPLETED;
      schedule.completedAt = new Date().toISOString();
      await kv.set(`reward_schedule:${scheduleId}`, schedule);
      
      issuedCount++;
      console.log(`   ✅ 排程處理完成`);
      
    } catch (error) {
      console.error(`❌ 處理排程失敗: ${scheduleId}`, error);
      // 繼續處理下一個排程，不中斷整個流程
    }
  }
  
  console.log(`\n✅ 推薦獎勵處理完成: 發放=${issuedCount}, 取消=${cancelledCount}`);
  
  return {
    processed: scheduleIds.length,
    issued: issuedCount,
    cancelled: cancelledCount
  };
}

/**
 * 發放排程獎勵
 */
async function issueScheduledReward(schedule: any) {
  const { userId, amount, referee, referrer, generation, monthNumber } = schedule;
  
  // ===== 1. 更新獎勵餘額 =====
  const rewardsKey = `user:${userId}:rewards`;
  const rewards = await kv.get(rewardsKey) || {
    availableRewards: 0,
    pendingRewards: 0,
    withdrawnRewards: 0,
    totalEarned: 0
  };
  
  rewards.availableRewards += amount;
  rewards.totalEarned += amount;
  rewards.lastUpdated = new Date().toISOString();
  
  await kv.set(rewardsKey, rewards);
  
  // ===== 2. 記錄獎勵歷史（使用排程中的完整信息）=====
  const historyKey = `user:${userId}:reward_history`;
  const history = await kv.get(historyKey) || [];
  
  const description = `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第${monthNumber}個月`;
  
  history.unshift({
    id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: `referral_gen${generation}_month${monthNumber}`,
    amount,
    referee,           // ✅ 直接使用排程中的完整信息
    referrer,          // ✅ 直接使用排程中的完整信息
    generation,
    monthNumber,
    issuedAt: new Date().toISOString(),
    description
  });
  
  // 只保留最近200筆
  if (history.length > REWARD_CONFIG.REWARD_HISTORY_MAX_COUNT) {
    history.length = REWARD_CONFIG.REWARD_HISTORY_MAX_COUNT;
  }
  
  await kv.set(historyKey, history);
  
  console.log(`      💰 發放獎勵: user=${userId}, amount=${amount}P, referee=${referee.userName}-${referee.listingName} (第${monthNumber}個月)`);
}

// ===================================================================
// 訂閱狀態檢查處理
// ===================================================================

/**
 * 檢查並更新所有用戶的訂閱狀態
 * 
 * 流程：
 * 1. 從用戶列表索引獲取所有用戶 ID
 * 2. 逐一檢查每個用戶的訂閱狀態
 * 3. 更新訂閱狀態
 */
async function processSubscriptionStatusCheck() {
  console.log(`🔄 開始檢查訂閱狀態`);
  
  // 1. 從用戶列表索引獲取所有用戶 ID
  const userIndexKey = `user_list`;
  const userIds = await kv.get(userIndexKey) || [];
  
  console.log(`📊 總用戶數量: ${userIds.length}`);
  
  let updatedCount = 0;
  
  // 2. 逐一處理每個用戶的訂閱狀態
  for (const userId of userIds) {
    try {
      console.log(`\n📋 處理用戶: ${userId}`);
      
      const result = await checkAndUpdateSubscriptionStatus(userId);
      
      if (result.status === SubscriptionStatus.UPDATED) {
        updatedCount++;
      }
      
    } catch (error) {
      console.error(`❌ 處理用戶訂閱狀態失敗: ${userId}`, error);
      // 繼續處理下一個用戶
    }
  }
  
  console.log(`\n✅ 訂閱狀態檢查完成: 更新用戶=${updatedCount}`);
  
  return {
    updatedUserCount: updatedCount
  };
}

// ===================================================================
// 任務結算處理
// ===================================================================

/**
 * 處理任務結算（每月1日執行）
 * 
 * 流程：
 * 1. 計算上個月份
 * 2. 掃描所有用戶的月度日誌
 * 3. 逐一處理每個用戶的任務
 * 4. 檢查連續推薦任務是否達成
 * 5. 檢查推薦王任務是否達成
 * 6. 發放任務獎勵
 * 
 * 注意：由於 KV Store 沒有 scan 功能，我們使用全局月度日誌索引
 */
async function processDailyTaskSettlement(today: Date) {
  console.log(`🔄 開始處理任務結算`);
  
  // 1. 計算上個月份
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStr = lastMonth.toISOString().substring(0, 7); // "2024-11"
  const currentMonthStr = today.toISOString().substring(0, 7); // "2024-12"
  
  console.log(`📅 結算月份: ${lastMonthStr}`);
  console.log(`📅 當前月份: ${currentMonthStr}`);
  
  // 2. 從全局月度日誌索引獲取上個月有推薦活動的用戶
  const globalLogKey = `referral_monthly_log:${lastMonthStr}`;
  const globalLog = await kv.get(globalLogKey) || {};
  
  // globalLog 格式: { userId1: [...listings], userId2: [...listings], ... }
  const userIds = Object.keys(globalLog);
  
  console.log(`📊 上個月有 ${userIds.length} 個用戶有推薦活動`);
  
  let consecutiveRewardCount = 0;
  let monthlyKingRewardCount = 0;
  let processedUserCount = 0;
  
  // 3. 逐一處理每個用戶的任務
  for (const userId of userIds) {
    try {
      console.log(`\n📋 處理用戶: ${userId}`);
      
      const result = await processUserTaskSettlement(userId, lastMonthStr, currentMonthStr);
      
      if (result.consecutiveCompleted) {
        consecutiveRewardCount++;
      }
      if (result.monthlyKingCompleted) {
        monthlyKingRewardCount++;
      }
      
      processedUserCount++;
      
    } catch (error) {
      console.error(`❌ 處理用戶任務失敗: ${userId}`, error);
      // 繼續處理下一個用戶
    }
  }
  
  console.log(`\n✅ 任務結算完成: 處理用戶=${processedUserCount}, 連續推薦=${consecutiveRewardCount}, 推薦王=${monthlyKingRewardCount}`);
  
  return {
    month: lastMonthStr,
    processedUserCount,
    consecutiveRewardCount,
    monthlyKingRewardCount
  };
}

/**
 * 處理單個用戶的任務結算
 * 
 * @param userId 用戶 ID
 * @param lastMonthStr 上個月份字串（"YYYY-MM"）
 * @param currentMonthStr 當前月份字串（"YYYY-MM"）
 */
async function processUserTaskSettlement(
  userId: string,
  lastMonthStr: string,
  currentMonthStr: string
): Promise<{
  consecutiveCompleted: boolean;
  monthlyKingCompleted: boolean;
}> {
  const tasksKey = `user:${userId}:tasks`;
  const tasks = await kv.get(tasksKey);
  
  if (!tasks) {
    return { consecutiveCompleted: false, monthlyKingCompleted: false };
  }
  
  let consecutiveCompleted = false;
  let monthlyKingCompleted = false;
  
  // ===== 結算連續推薦任務 =====
  if (tasks.consecutiveReferral) {
    const consecutive = tasks.consecutiveReferral;
    
    // 檢查上個月是否有推薦
    if (!consecutive.monthlyRecord[lastMonthStr] || !consecutive.monthlyRecord[lastMonthStr].qualified) {
      // 上個月沒有推薦，重置任務
      console.log(`   ⚠️ 用戶 ${userId} 連續推薦任務斷續（上個月無推薦）`);
      consecutive.currentStreak = 0;
      consecutive.startMonth = currentMonthStr;
      consecutive.monthlyRecord = {};
      consecutive.completed = false;
    }
    
    // 檢查是否達到12個月
    if (consecutive.currentStreak >= REWARD_CONFIG.TASK_CONSECUTIVE_MONTHS && !consecutive.completed) {
      // 發放獎勵
      await issueTaskReward(userId, 'consecutive_referral', REWARD_CONFIG.TASK_CONSECUTIVE_REWARD);
      consecutive.completed = true;
      consecutive.completedAt = new Date().toISOString();
      
      console.log(`   🎉 用戶 ${userId} 完成連續推薦任務，發放 ${REWARD_CONFIG.TASK_CONSECUTIVE_REWARD}P`);
      
      // 重置任務，開始新一輪
      consecutive.currentStreak = 0;
      consecutive.startMonth = currentMonthStr;
      consecutive.monthlyRecord = {};
      consecutive.completed = false;
      
      consecutiveCompleted = true;
    }
    
    consecutive.lastCheckedAt = new Date().toISOString();
  }
  
  // ===== 結算推薦王任務 =====
  if (tasks.monthlyKing) {
    const king = tasks.monthlyKing;
    
    // 如果上個月推薦數>=10，發放獎勵
    if (king.currentMonth === lastMonthStr && king.currentCount >= REWARD_CONFIG.TASK_MONTHLY_KING_TARGET && !king.completed) {
      // 發放獎勵
      await issueTaskReward(userId, 'monthly_king', REWARD_CONFIG.TASK_MONTHLY_KING_REWARD);
      king.completed = true;
      
      console.log(`   🎉 用戶 ${userId} 完成推薦王任務，發放 ${REWARD_CONFIG.TASK_MONTHLY_KING_REWARD}P`);
      
      monthlyKingCompleted = true;
    }
    
    // 將上個月記錄加入歷史
    if (king.currentMonth === lastMonthStr) {
      king.history.push({
        month: king.currentMonth,
        count: king.currentCount,
        qualified: king.currentCount >= REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
        rewardIssued: king.completed,
        rewardIssuedAt: king.completed ? new Date().toISOString() : null,
        checkedAt: new Date().toISOString()
      });
      
      // 重置本月
      king.currentMonth = currentMonthStr;
      king.currentCount = 0;
      king.completed = false;
    }
  }
  
  // 儲存更新後的任務資料
  tasks.lastUpdated = new Date().toISOString();
  await kv.set(tasksKey, tasks);
  
  return { consecutiveCompleted, monthlyKingCompleted };
}

/**
 * 發放任務獎勵
 */
async function issueTaskReward(userId: string, taskType: string, amount: number) {
  // 1. 更新獎勵餘額
  const rewardsKey = `user:${userId}:rewards`;
  const rewards = await kv.get(rewardsKey) || {
    availableRewards: 0,
    pendingRewards: 0,
    withdrawnRewards: 0,
    totalEarned: 0
  };
  
  rewards.availableRewards += amount;
  rewards.totalEarned += amount;
  rewards.lastUpdated = new Date().toISOString();
  
  await kv.set(rewardsKey, rewards);
  
  // 2. 記錄獎勵歷史
  const historyKey = `user:${userId}:reward_history`;
  const history = await kv.get(historyKey) || [];
  
  history.unshift({
    id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: `task_${taskType}`,
    amount,
    issuedAt: new Date().toISOString(),
    description: `任務獎勵 - ${TASK_NAMES[taskType] || taskType}`
  });
  
  // 只保留最近200筆
  if (history.length > REWARD_CONFIG.REWARD_HISTORY_MAX_COUNT) {
    history.length = REWARD_CONFIG.REWARD_HISTORY_MAX_COUNT;
  }
  
  await kv.set(historyKey, history);
  
  console.log(`      💰 發放任獎勵: user=${userId}, type=${taskType}, amount=${amount}P`);
}

export default cron;