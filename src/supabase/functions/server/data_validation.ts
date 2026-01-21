/**
 * 🔍 數據完整性驗證工具
 * 
 * 功能：
 * 1. 檢測重複推薦碼
 * 2. 檢測重複訂閱
 * 3. 檢測推薦樹中的重複項
 * 4. 檢測獎勵排程重複
 * 5. 檢測異常付款行為
 * 
 * 使用方式：
 * - GET /admin/validate-data - 執行完整驗證
 * - GET /admin/validate-data/users - 只驗證用戶數據
 * - GET /admin/validate-data/referrals - 只驗證推薦關係
 */

import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { toTaiwanISOString, getTaiwanNow } from './date_utils.ts';

const dataValidation = new Hono();

interface ValidationError {
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  userId?: string;
  userName?: string;
  details: any;
  timestamp: string;
}

/**
 * 驗證所有數據
 */
dataValidation.get('/validate-all', async (c) => {
  console.log('[Data Validation] 開始執行完整數據驗證...');
  
  const errors: ValidationError[] = [];
  
  try {
    // 1. 驗證用戶推薦碼
    const referralCodeErrors = await validateReferralCodes();
    errors.push(...referralCodeErrors);
    
    // 2. 驗證用戶訂閱
    const subscriptionErrors = await validateSubscriptions();
    errors.push(...subscriptionErrors);
    
    // 3. 驗證推薦樹
    const referralTreeErrors = await validateReferralTrees();
    errors.push(...referralTreeErrors);
    
    // 4. 驗證獎勵排程
    const rewardScheduleErrors = await validateRewardSchedules();
    errors.push(...rewardScheduleErrors);
    
    // 5. 檢測異常付款行為
    const paymentAnomalies = await detectPaymentAnomalies();
    errors.push(...paymentAnomalies);
    
    // 保存驗證報告
    const reportKey = `validation_report:${Date.now()}`;
    await kv.set(reportKey, {
      timestamp: toTaiwanISOString(getTaiwanNow()),
      totalErrors: errors.length,
      criticalErrors: errors.filter(e => e.severity === 'CRITICAL').length,
      highErrors: errors.filter(e => e.severity === 'HIGH').length,
      errors: errors
    });
    
    console.log(`[Data Validation] ✅ 驗證完成，發現 ${errors.length} 個問題`);
    
    return c.json({
      success: true,
      summary: {
        totalErrors: errors.length,
        critical: errors.filter(e => e.severity === 'CRITICAL').length,
        high: errors.filter(e => e.severity === 'HIGH').length,
        medium: errors.filter(e => e.severity === 'MEDIUM').length,
        low: errors.filter(e => e.severity === 'LOW').length
      },
      errors: errors
    });
    
  } catch (error) {
    console.error('[Data Validation] ❌ 驗證過程中發生錯誤:', error);
    return c.json({
      success: false,
      error: { message: '數據驗證失敗', details: error.message }
    }, 500);
  }
});

/**
 * 1. 驗證推薦碼（檢測一個用戶有多個推薦碼）
 */
async function validateReferralCodes(): Promise<ValidationError[]> {
  console.log('[Validate Referral Codes] 開始檢查推薦碼...');
  
  const errors: ValidationError[] = [];
  
  try {
    // 獲取所有推薦碼
    const allCodes = await kv.getByPrefix('referral_code:');
    
    // 按用戶ID分組
    const codesByUser: { [userId: string]: any[] } = {};
    
    for (const codeData of allCodes) {
      const userId = codeData.userId;
      if (!codesByUser[userId]) {
        codesByUser[userId] = [];
      }
      codesByUser[userId].push(codeData);
    }
    
    // 檢查是否有用戶擁有多個推薦碼
    for (const [userId, codes] of Object.entries(codesByUser)) {
      if (codes.length > 1) {
        // 獲取用戶資料
        const userProfile = await kv.get(`user:${userId}:profile`);
        
        errors.push({
          type: 'DUPLICATE_REFERRAL_CODE',
          severity: 'CRITICAL',
          userId: userId,
          userName: userProfile?.name || '未知用戶',
          details: {
            count: codes.length,
            codes: codes.map(c => ({
              code: c.code,
              createdAt: c.createdAt
            }))
          },
          timestamp: toTaiwanISOString(getTaiwanNow())
        });
        
        console.error(`🚨 用戶 ${userProfile?.name} (${userId}) 有 ${codes.length} 個推薦碼！`);
      }
    }
    
    console.log(`[Validate Referral Codes] ✅ 完成，發現 ${errors.length} 個問題`);
    
  } catch (error) {
    console.error('[Validate Referral Codes] ❌ 錯誤:', error);
  }
  
  return errors;
}

/**
 * 2. 驗證訂閱（檢測一個用戶有多個訂閱）
 */
async function validateSubscriptions(): Promise<ValidationError[]> {
  console.log('[Validate Subscriptions] 開始檢查訂閱...');
  
  const errors: ValidationError[] = [];
  
  try {
    // 獲取所有用戶
    const allProfiles = await kv.getByPrefix('user:');
    const userProfiles = allProfiles.filter((item: any) => 
      item.id && item.email && !item.firstGeneration // 過濾出真正的 user profile
    );
    
    for (const userProfile of userProfiles) {
      const userId = userProfile.id;
      const userSubscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
      
      if (userSubscriptions.length > 1) {
        errors.push({
          type: 'DUPLICATE_SUBSCRIPTION',
          severity: 'CRITICAL',
          userId: userId,
          userName: userProfile.name,
          details: {
            count: userSubscriptions.length,
            subscriptions: userSubscriptions
          },
          timestamp: toTaiwanISOString(getTaiwanNow())
        });
        
        console.error(`🚨 用戶 ${userProfile.name} (${userId}) 有 ${userSubscriptions.length} 個訂閱！`);
      }
    }
    
    console.log(`[Validate Subscriptions] ✅ 完成，發現 ${errors.length} 個問題`);
    
  } catch (error) {
    console.error('[Validate Subscriptions] ❌ 錯誤:', error);
  }
  
  return errors;
}

/**
 * 3. 驗證推薦樹（檢測同一人在推薦樹中出現多次）
 */
async function validateReferralTrees(): Promise<ValidationError[]> {
  console.log('[Validate Referral Trees] 開始檢查推薦樹...');
  
  const errors: ValidationError[] = [];
  
  try {
    // 獲取所有推薦樹
    const allTrees = await kv.getByPrefix('user:');
    const referralTrees = allTrees.filter((item: any) => 
      item.firstGeneration && Array.isArray(item.firstGeneration)
    );
    
    for (const tree of referralTrees) {
      // 提取樹的擁有者 userId（從 key 中解析）
      // 注意：這裡需要從 allTrees 的 metadata 或其他方式獲取 userId
      // 暫時跳過，因為 getByPrefix 返回的是 value，不包含 key
      
      // 檢查一代
      if (tree.firstGeneration && tree.firstGeneration.length > 0) {
        const userIds = tree.firstGeneration.map((m: any) => m.userId);
        const duplicates = userIds.filter((id, index) => userIds.indexOf(id) !== index);
        
        if (duplicates.length > 0) {
          errors.push({
            type: 'DUPLICATE_IN_REFERRAL_TREE_GEN1',
            severity: 'HIGH',
            details: {
              generation: 1,
              duplicateUserIds: [...new Set(duplicates)],
              totalMembers: tree.firstGeneration.length
            },
            timestamp: toTaiwanISOString(getTaiwanNow())
          });
          
          console.error(`🚨 推薦樹一代有重複成員: ${duplicates.length} 個`);
        }
      }
      
      // 檢查二代
      if (tree.secondGeneration && tree.secondGeneration.length > 0) {
        const userIds = tree.secondGeneration.map((m: any) => m.userId);
        const duplicates = userIds.filter((id, index) => userIds.indexOf(id) !== index);
        
        if (duplicates.length > 0) {
          errors.push({
            type: 'DUPLICATE_IN_REFERRAL_TREE_GEN2',
            severity: 'HIGH',
            details: {
              generation: 2,
              duplicateUserIds: [...new Set(duplicates)],
              totalMembers: tree.secondGeneration.length
            },
            timestamp: toTaiwanISOString(getTaiwanNow())
          });
        }
      }
      
      // 檢查三代
      if (tree.thirdGeneration && tree.thirdGeneration.length > 0) {
        const userIds = tree.thirdGeneration.map((m: any) => m.userId);
        const duplicates = userIds.filter((id, index) => userIds.indexOf(id) !== index);
        
        if (duplicates.length > 0) {
          errors.push({
            type: 'DUPLICATE_IN_REFERRAL_TREE_GEN3',
            severity: 'HIGH',
            details: {
              generation: 3,
              duplicateUserIds: [...new Set(duplicates)],
              totalMembers: tree.thirdGeneration.length
            },
            timestamp: toTaiwanISOString(getTaiwanNow())
          });
        }
      }
    }
    
    console.log(`[Validate Referral Trees] ✅ 完成，發現 ${errors.length} 個問題`);
    
  } catch (error) {
    console.error('[Validate Referral Trees] ❌ 錯誤:', error);
  }
  
  return errors;
}

/**
 * 4. 驗證獎勵排程（檢測重複排程）
 */
async function validateRewardSchedules(): Promise<ValidationError[]> {
  console.log('[Validate Reward Schedules] 開始檢查獎勵排程...');
  
  const errors: ValidationError[] = [];
  
  try {
    // 獲取所有獎勵排程
    const allSchedules = await kv.getByPrefix('reward_schedule:');
    
    // 按 userId + refereeUserId + generation + monthNumber 分組
    const scheduleMap: { [key: string]: any[] } = {};
    
    for (const schedule of allSchedules) {
      if (!schedule.referee || !schedule.userId) continue;
      
      const key = `${schedule.userId}_${schedule.referee.userId}_${schedule.generation}_${schedule.monthNumber}`;
      
      if (!scheduleMap[key]) {
        scheduleMap[key] = [];
      }
      scheduleMap[key].push(schedule);
    }
    
    // 檢查重複
    for (const [key, schedules] of Object.entries(scheduleMap)) {
      if (schedules.length > 1) {
        const firstSchedule = schedules[0];
        
        errors.push({
          type: 'DUPLICATE_REWARD_SCHEDULE',
          severity: 'HIGH',
          userId: firstSchedule.userId,
          details: {
            count: schedules.length,
            refereeUserId: firstSchedule.referee.userId,
            refereeName: firstSchedule.referee.userName,
            generation: firstSchedule.generation,
            monthNumber: firstSchedule.monthNumber,
            scheduleIds: schedules.map(s => s.id)
          },
          timestamp: toTaiwanISOString(getTaiwanNow())
        });
        
        console.error(`🚨 獎勵排程重複: 用戶 ${firstSchedule.userId}, 第${firstSchedule.generation}代, 第${firstSchedule.monthNumber}個月, 共 ${schedules.length} 筆`);
      }
    }
    
    console.log(`[Validate Reward Schedules] ✅ 完成，發現 ${errors.length} 個問題`);
    
  } catch (error) {
    console.error('[Validate Reward Schedules] ❌ 錯誤:', error);
  }
  
  return errors;
}

/**
 * 5. 檢測異常付款行為
 */
async function detectPaymentAnomalies(): Promise<ValidationError[]> {
  console.log('[Detect Payment Anomalies] 開始檢測異常付款...');
  
  const errors: ValidationError[] = [];
  
  try {
    // 獲取所有付款訂單
    const allOrders = await kv.getByPrefix('payment_order:');
    const completedOrders = allOrders.filter((order: any) => order.status === 'completed');
    
    // 按用戶分組
    const ordersByUser: { [userId: string]: any[] } = {};
    
    for (const order of completedOrders) {
      const userId = order.userId;
      if (!ordersByUser[userId]) {
        ordersByUser[userId] = [];
      }
      ordersByUser[userId].push(order);
    }
    
    // 檢查短時間內多次付款
    for (const [userId, orders] of Object.entries(ordersByUser)) {
      if (orders.length > 1) {
        // 獲取用戶資料
        const userProfile = await kv.get(`user:${userId}:profile`);
        
        // 排序訂單
        orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        // 檢查時間間隔
        for (let i = 1; i < orders.length; i++) {
          const prevTime = new Date(orders[i-1].createdAt).getTime();
          const currTime = new Date(orders[i].createdAt).getTime();
          const interval = currTime - prevTime;
          
          // 如果在 5 分鐘內
          if (interval < 5 * 60 * 1000) {
            errors.push({
              type: 'DUPLICATE_PAYMENT_DETECTED',
              severity: 'CRITICAL',
              userId: userId,
              userName: userProfile?.name || '未知用戶',
              details: {
                orderIds: [orders[i-1].orderId, orders[i].orderId],
                timestamps: [orders[i-1].createdAt, orders[i].createdAt],
                intervalSeconds: Math.floor(interval / 1000)
              },
              timestamp: toTaiwanISOString(getTaiwanNow())
            });
            
            console.error(`🚨 檢測到重複付款: 用戶 ${userProfile?.name} (${userId}), 間隔 ${Math.floor(interval / 1000)} 秒`);
          }
        }
      }
    }
    
    console.log(`[Detect Payment Anomalies] ✅ 完成，發現 ${errors.length} 個問題`);
    
  } catch (error) {
    console.error('[Detect Payment Anomalies] ❌ 錯誤:', error);
  }
  
  return errors;
}

/**
 * 獲取最新的驗證報告
 */
dataValidation.get('/latest-report', async (c) => {
  try {
    const allReports = await kv.getByPrefix('validation_report:');
    
    if (allReports.length === 0) {
      return c.json({
        success: false,
        message: '尚無驗證報告'
      }, 404);
    }
    
    // 獲取最新的報告（假設 key 包含時間戳）
    const latestReport = allReports[allReports.length - 1];
    
    return c.json({
      success: true,
      data: latestReport
    });
    
  } catch (error) {
    console.error('[Get Latest Report] ❌ 錯誤:', error);
    return c.json({
      success: false,
      error: { message: '獲取報告失敗', details: error.message }
    }, 500);
  }
});

export default dataValidation;
