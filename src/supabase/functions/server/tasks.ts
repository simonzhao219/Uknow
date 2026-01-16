import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { REWARD_CONFIG } from './reward_config.ts';

const tasks = new Hono();

// ========================================
// 路由定義順序規範：
// 1. 根路由 (/)
// 2. 具體路由 (/fixed-path, /fixed/:param)
// 3. 動態路由 (/:dynamic) - 必須放在最後！
// ========================================

/**
 * GET /tasks - 獲取用戶的任務列表
 * 
 * 返回：
 * - tasks: 任務陣列
 *   - id: 任務 ID
 *   - type: 任務類型
 *   - title: 任務標題
 *   - description: 任務描述
 *   - target: 目標數量
 *   - current: 當前進度
 *   - completed: 是否完成
 *   - reward: 獎勵點數
 *   - progress: 進度百分比
 * - rawData: 原始任務資料（供前端詳細顯示使用）
 */
tasks.get('/', async (c) => {
  try {
    console.log('========== 獲取任務列表 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[tasks] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[tasks] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[tasks] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 直接讀取預計算的任務資料（O(1) 時間複雜度）
    const tasksData = await kv.get(`user:${user.id}:tasks`) || {
      consecutiveReferral: null,
      monthlyKing: null,
      lastUpdated: new Date().toISOString()
    };
    
    // 3. 格式化返回資料
    const tasksList = [];
    
    // 3.1 連續推薦達人任務
    if (tasksData.consecutiveReferral) {
      const consecutive = tasksData.consecutiveReferral;
      tasksList.push({
        id: consecutive.id,
        type: consecutive.type,
        title: consecutive.title,
        description: consecutive.description,
        target: consecutive.target,
        current: consecutive.currentStreak,
        completed: consecutive.completed,
        reward: consecutive.reward,
        progress: Math.min((consecutive.currentStreak / consecutive.target) * 100, 100),
        details: {
          startMonth: consecutive.startMonth,
          lastActiveMonth: consecutive.lastActiveMonth,
          monthlyRecordCount: Object.keys(consecutive.monthlyRecord || {}).length
        }
      });
    } else {
      // 如果任務不存在，返回預設的任訊
      tasksList.push({
        id: "task_consecutive",
        type: "consecutive_referral",
        title: "連續推薦達人",
        description: "連續12個月每月至少推薦1位用戶",
        target: REWARD_CONFIG.TASK_CONSECUTIVE_MONTHS,
        current: 0,
        completed: false,
        reward: REWARD_CONFIG.TASK_CONSECUTIVE_REWARD,
        progress: 0,
        details: {
          startMonth: null,
          lastActiveMonth: null,
          monthlyRecordCount: 0
        }
      });
    }
    
    // 3.2 推薦王任務
    if (tasksData.monthlyKing) {
      const king = tasksData.monthlyKing;
      tasksList.push({
        id: king.id,
        type: king.type,
        title: king.title,
        description: king.description,
        target: king.target,
        current: king.currentCount,
        completed: king.completed,
        reward: king.reward,
        progress: Math.min((king.currentCount / king.target) * 100, 100),
        details: {
          currentMonth: king.currentMonth,
          historyCount: king.history?.length || 0,
          completedMonths: king.history?.filter((h: any) => h.qualified).length || 0
        }
      });
    } else {
      // 如果任務不存在，返回預設的任務資訊
      const currentMonth = new Date().toISOString().substring(0, 7);
      tasksList.push({
        id: "task_monthly_king",
        type: "monthly_king",
        title: "推薦王",
        description: "單月推薦10位以上用戶",
        target: REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
        current: 0,
        completed: false,
        reward: REWARD_CONFIG.TASK_MONTHLY_KING_REWARD,
        progress: 0,
        details: {
          currentMonth: currentMonth,
          historyCount: 0,
          completedMonths: 0
        }
      });
    }
    
    console.log(`📋 任務列表: ${tasksList.length} 個任務`);
    console.log('========== ✅ 任務列表獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        tasks: tasksList,
        rawData: tasksData // 保留原始資料供前端詳細顯示使用
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取任務列表錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取任務列表失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /tasks/details/:month - 獲取指定月份的推薦詳情
 * 
 * Parameters:
 * - month: 月份字串（格式：YYYY-MM，例如：2024-12）
 * 
 * 返回：
 * - data: 該月份的推薦記錄陣列
 *   - listingId: 刊登 ID
 *   - userId: 被推薦人用戶 ID
 *   - userName: 被推薦人用戶名 ✅
 *   - listingName: 被推薦人刊登稱 ✅
 *   - referrer: 推薦人信息（如果存在）✅
 *     - userId: 推薦人用戶 ID
 *     - userName: 推薦人用戶名
 *     - listingId: 推薦人刊登 ID
 *     - listingName: 推薦人刊登名稱
 *   - createdAt: 創建時間（ISO 8601 格式）
 */
tasks.get('/details/:month', async (c) => {
  try {
    const month = c.req.param('month');
    console.log(`========== 獲取月度推薦詳情: ${month} ==========`);
    
    // 1. 驗證月份格式（YYYY-MM）
    const monthPattern = /^\d{4}-\d{2}$/;
    if (!monthPattern.test(month)) {
      console.error(`❌ 月份格式錯誤: ${month}`);
      return c.json({
        error: { message: '月份格式錯誤，應為 YYYY-MM（例如：2024-12）' }
      }, 400);
    }
    
    // 2. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[tasks/details] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[tasks/details] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[tasks/details] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 3. 獲取月度日誌
    const userLogKey = `user:${user.id}:referral_monthly_log`;
    const userLog = await kv.get(userLogKey) || {};
    
    const monthData = userLog[month] || [];
    
    console.log(`📊 ${month} 月份推薦記錄: ${monthData.length} 筆`);
    console.log('========== ✅ 月度推薦詳情獲取完成 ==========');
    
    // 4. 直接返回（數據已經包含完整信息，無需額外處理）
    return c.json({
      success: true,
      data: monthData
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取月度推薦詳情錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取月度推薦詳情失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /tasks/monthly-summary - 獲取月度推薦摘要（連續推薦達人用）
 * 
 * 返回：
 * - data: 從遊戲開始月份起算的12個月推薦狀態 ✅
 *   - month: 月份（YYYY-MM）
 *   - hasReferral: 該月是否有推薦
 *   - firstReferral: 第一筆推薦記錄（如果存在）
 *     - userName: 被推薦人用戶名 ✅
 *     - userReferralCode: 被推薦人推薦碼 ✅
 *     - createdAt: 創建時間
 *   - status: 月份狀態 ('completed' | 'missed' | 'pending' | 'future') ✅
 *   - gameMonth: 遊戲月份序號（1-12）✅
 * - meta: 遊戲元數據 ✅
 *   - startMonth: 遊戲開始月份
 *   - currentGameMonth: 當前處於遊戲的第幾個月
 *   - isActive: 遊戲是否進行中
 */
tasks.get('/monthly-summary', async (c) => {
  try {
    console.log('========== 獲取月度推薦摘要 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[tasks/monthly-summary] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[tasks/monthly-summary] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取任務資料，檢查遊戲開始月份
    const tasksKey = `user:${user.id}:tasks`;
    const tasks = await kv.get(tasksKey);
    
    // 3. 檢查是否已開始遊戲
    if (!tasks || !tasks.consecutiveReferral || !tasks.consecutiveReferral.startMonth) {
      console.log('ℹ️ 用戶尚未開始連續推薦達人遊戲');
      return c.json({
        success: true,
        data: [],
        meta: {
          startMonth: null,
          currentGameMonth: 0,
          isActive: false,
          message: '完成第一次推薦後，遊戲將自動開始'
        }
      });
    }
    
    const startMonth = tasks.consecutiveReferral.startMonth; // "2024-12"
    console.log(`🎮 遊戲開始月份: ${startMonth}`);
    
    // 4. 獲取月度日誌
    const userLogKey = `user:${user.id}:referral_monthly_log`;
    const userLog = await kv.get(userLogKey) || {};
    
    // 5. 計算從開始月份起的12個月
    const [startYear, startMonthNum] = startMonth.split('-').map(Number);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const monthlyProgress = [];
    
    for (let i = 0; i < 12; i++) {
      // 計算月份（支持跨年）
      const targetDate = new Date(startYear, startMonthNum - 1 + i, 1);
      const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      
      const monthData = userLog[monthKey] || [];
      const hasReferral = monthData.length > 0;
      const firstReferral = hasReferral ? {
        userName: monthData[0].userName,
        userReferralCode: monthData[0].userReferralCode || 'N/A',
        createdAt: monthData[0].createdAt
      } : null;
      
      // 判斷月份狀態
      let status;
      const monthDate = new Date(monthKey + '-01');
      const currentMonthDate = new Date(currentMonth + '-01'); // ✅ 修復：重命名避免重複聲明
      
      if (hasReferral) {
        status = 'completed'; // 已完成
      } else if (monthDate < currentMonthDate) {
        status = 'missed'; // 已錯過（斷續）
      } else if (monthKey === currentMonth) {
        status = 'pending'; // 進行中
      } else {
        status = 'future'; // 未來月份
      }
      
      monthlyProgress.push({
        month: monthKey,
        hasReferral,
        firstReferral,
        status,
        gameMonth: i + 1 // 遊戲月份序號（1-12）
      });
    }
    
    // 6. 計算當前處於遊戲的第幾個月
    const currentGameMonthIndex = monthlyProgress.findIndex(m => m.month === currentMonth);
    const currentGameMonth = currentGameMonthIndex >= 0 ? currentGameMonthIndex + 1 : 0;
    
    // 7. 判斷遊戲是否仍在進行中
    const lastMonthKey = monthlyProgress.length > 0 ? monthlyProgress[monthlyProgress.length - 1].month : currentMonth;
    const lastMonthDate = new Date(lastMonthKey + '-01');
    const nowDate = new Date(currentMonth + '-01');
    const isActive = nowDate <= lastMonthDate;
    
    console.log(`📊 月度摘要:`);
    console.log(`   - 遊戲開始: ${startMonth}`);
    console.log(`   - 當前月份: ${currentMonth} (第 ${currentGameMonth} 個月)`);
    console.log(`   - 已完成: ${monthlyProgress.filter(m => m.hasReferral).length}/12 個月`);
    console.log(`   - 遊戲狀態: ${isActive ? '進行中' : '已結束'}`);
    console.log('========== ✅ 月度推薦摘要獲取完成 ==========');
    
    return c.json({
      success: true,
      data: monthlyProgress,
      meta: {
        startMonth,
        currentGameMonth,
        isActive,
        completedCount: monthlyProgress.filter(m => m.hasReferral).length
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取月度推薦摘要錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取月度推薦摘要失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /tasks/current-month-top - 獲取本月前N筆推薦（推薦王用）
 * 
 * Parameters:
 * - limit: 限制返回數量（預設10，查詢參數）
 * 
 * 返回：
 * - data: 本月推薦記錄
 *   - month: 當前月份（YYYY-MM）
 *   - total: 本月總推薦數
 *   - completedCount: 本月已完次數 ✅
 *   - currentProgress: 當前進度（剩餘計數）✅
 *   - referrals: 前N筆推薦記錄陣列
 */
tasks.get('/current-month-top', async (c) => {
  try {
    console.log('========== 獲取本月前N筆推薦 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[tasks/current-month-top] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[tasks/current-month-top] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取 limit 參數（預設10）
    const limit = parseInt(c.req.query('limit') || '10');
    console.log(`📊 限制數量: ${limit} 筆`);
    
    // 3. 計算當前月份
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // 4. 獲取月度日誌
    const userLogKey = `user:${user.id}:referral_monthly_log`;
    const userLog = await kv.get(userLogKey) || {};
    
    const monthData = userLog[currentMonth] || [];
    const topReferrals = monthData.slice(0, limit);
    
    // ✅ 5. 計算溢出機制數據
    const total = monthData.length;
    const completedCount = Math.floor(total / REWARD_CONFIG.TASK_MONTHLY_KING_TARGET); // 完成次數
    const currentProgress = total % REWARD_CONFIG.TASK_MONTHLY_KING_TARGET; // 當前進度
    
    console.log(`📊 ${currentMonth} 月份推薦記錄:`);
    console.log(`   - 總共: ${total} 筆`);
    console.log(`   - 已完成: ${completedCount} 次`);
    console.log(`   - 當前進度: ${currentProgress}/${REWARD_CONFIG.TASK_MONTHLY_KING_TARGET}`);
    console.log(`   - 返回: ${topReferrals.length} 筆`);
    console.log('========== ✅ 本月前N筆推薦獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        month: currentMonth,
        total: total,
        completedCount: completedCount,  // ✅ 新增：本月已完成次數
        currentProgress: currentProgress, // ✅ 新增：當前進度
        referrals: topReferrals
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取本月前N筆推薦錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取本月前N筆推薦失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /tasks/pending-rewards - 獲取待領取的任務獎勵
 * 
 * ⚠️ 必須放在動態路由 /:taskId 之前！
 * 
 * 返回：
 * - data: 待領取的任務獎勵陣列
 *   - id: 獎勵 ID
 *   - type: 任務類型 ('consecutive_referral' | 'monthly_king')
 *   - amount: 獎勵金額
 *   - achievedAt: 達成時間
 *   - status: 狀態 ('pending' | 'claimed' | 'expired')
 *   - description: 獎勵描述
 *   - details: 詳細資訊
 * 
 * ✅ 注意：不再返回 previewData
 * - 前端會在對話框第二步實時調用 GET /rewards/points-preview 獲取最新 SSOT 數據
 */
tasks.get('/pending-rewards', async (c) => {
  try {
    console.log('========== 獲取待領取任務獎勵 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[tasks/pending-rewards] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[tasks/pending-rewards] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取待領取的任務獎勵
    const rewardsKey = `user:${user.id}:pending_mission_rewards`;
    const pendingRewards = await kv.get(rewardsKey) || [];
    
    // 3. 過濾出狀態為 pending 的獎勵
    const activePendingRewards = pendingRewards.filter((reward: any) => reward.status === 'pending');
    
    console.log(`📊 待領取任務獎勵: ${activePendingRewards.length} 個`);
    console.log('========== ✅ 待領取任務獎勵獲取完成 ==========');
    
    return c.json({
      success: true,
      data: activePendingRewards
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取待領取任務獎勵錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取待領取任務獎勵失敗', details: error.message }
    }, 500);
  }
});

/**
 * POST /tasks/claim-reward/:id - 領取任務獎勵
 * 
 * ⚠️ 必須放在動態路由 /:taskId 之前！
 * 
 * Parameters:
 * - id: 獎勵 ID（路由參數）
 * - idNumber: 身分證字號（請求 Body）
 * 
 * 返回：
 * - data: 領取結果
 *   - rewardId: 獎勵 ID
 *   - amount: 獎勵金額
 *   - newAvailable: 更新後的可提領點數
 *   - newTotal: 更新後的總累積點數
 */
tasks.post('/claim-reward/:id', async (c) => {
  try {
    const rewardId = c.req.param('id');
    console.log(`========== 領取任獎勵: ${rewardId} ==========`);
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[tasks/claim-reward] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[tasks/claim-reward] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取請求 Body
    const body = await c.req.json();
    const { idNumber } = body;
    
    if (!idNumber) {
      console.error('❌ 缺少身分證字號');
      return c.json({
        error: { message: '請提供身分證字號' }
      }, 400);
    }
    
    // 3. 驗證身分證格式
    const idPattern = /^[A-Z][12]\d{8}$/;
    if (!idPattern.test(idNumber)) {
      console.error(`❌ 身分證格式錯誤: ${idNumber}`);
      return c.json({
        error: { message: '身分證格式錯誤，應為1個大寫英文字母加9個數字（例：A123456789）' }
      }, 400);
    }
    
    // 4. 獲取用戶資料，驗證身分證
    const userProfile = await kv.get(`user:${user.id}:profile`);
    if (!userProfile || userProfile.nationalId !== idNumber) {
      console.error('❌ 身分證驗證失敗');
      console.error(`   用戶 Profile nationalId: ${userProfile?.nationalId || 'undefined'}`);
      console.error(`   提供的 idNumber: ${idNumber}`);
      return c.json({
        error: { message: '身分證驗證失敗，請確認輸入正確' }
      }, 403);
    }
    
    console.log('✅ 身分證驗證成功');
    
    // 5. 獲取待領取獎勵列表
    const rewardsKey = `user:${user.id}:pending_mission_rewards`;
    const pendingRewards = await kv.get(rewardsKey) || [];
    
    // 6. 查找指定的獎勵
    const rewardIndex = pendingRewards.findIndex((r: any) => r.id === rewardId);
    if (rewardIndex === -1) {
      console.error(`❌ 獎勵不存在: ${rewardId}`);
      return c.json({
        error: { message: '獎勵不存在或已被領取' }
      }, 404);
    }
    
    const reward = pendingRewards[rewardIndex];
    
    // 7. 檢查獎勵狀態
    if (reward.status !== 'pending') {
      console.error(`❌ 獎勵狀態錯誤: ${reward.status}`);
      return c.json({
        error: { message: `獎勵已${reward.status === 'claimed' ? '領取' : '過期'}` }
      }, 400);
    }
    
    console.log(`📊 獎勵資訊: 類型=${reward.type}, 金額=${reward.amount}P`);
    
    // 8. ✅ 更新 SSOT 點數數據（user:{userId}:rewards）
    const rewardsKeySSOT = `user:${user.id}:rewards`;
    const rewardsData = await kv.get(rewardsKeySSOT) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0,
      lastUpdated: new Date().toISOString()
    };
    
    const oldAvailable = rewardsData.availableRewards || 0;
    const oldTotal = rewardsData.totalEarned || 0;
    
    rewardsData.availableRewards = oldAvailable + reward.amount;
    rewardsData.totalEarned = oldTotal + reward.amount;
    rewardsData.lastUpdated = new Date().toISOString();
    
    await kv.set(rewardsKeySSOT, rewardsData);
    
    console.log(`💰 SSOT 點數更新 (${rewardsKeySSOT}):`);
    console.log(`   可提領點數: ${oldAvailable} → ${rewardsData.availableRewards} (+${reward.amount})`);
    console.log(`   總累積點數: ${oldTotal} → ${rewardsData.totalEarned} (+${reward.amount})`);
    
    // 9. 更新獎勵狀態
    pendingRewards[rewardIndex].status = 'claimed';
    pendingRewards[rewardIndex].claimedAt = new Date().toISOString();
    await kv.set(rewardsKey, pendingRewards);
    
    // 10. 記錄到獎勵歷史
    const historyKey = `user:${user.id}:reward_history`;
    const history = await kv.get(historyKey) || [];
    
    // ✅ 計算交易後餘額
    const balanceAfterTransaction = rewardsData.availableRewards + rewardsData.pendingRewards;
    
    history.unshift({
      id: `mission_reward_claim_${Date.now()}`,
      type: `mission_${reward.type}`,
      amount: reward.amount,
      balance: balanceAfterTransaction,  // ✅ 新增：交易後餘額
      description: reward.description,
      details: reward.details,
      issuedAt: new Date().toISOString(),
      source: 'mission_claim'
    });
    
    // 保留最近 100 筆記錄
    if (history.length > 100) {
      history.splice(100);
    }
    
    await kv.set(historyKey, history);
    
    console.log('✅ 獎勵歷史已更新');
    console.log('========== ✅ 任務勵領取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        rewardId: reward.id,
        amount: reward.amount,
        newAvailable: rewardsData.availableRewards,
        newTotal: rewardsData.totalEarned,
        claimedAt: pendingRewards[rewardIndex].claimedAt
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 領取任務獎勵錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '領取任務獎勵失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /tasks/:taskId - 獲取單個任務的詳細資料
 * 
 * ⚠️ 注意：此動態路由必須放在所有具體路由之後，否則會攔截所有請求！
 * 
 * Parameters:
 * - taskId: 任務 ID (consecutive_referral | monthly_king)
 * 
 * 返回：
 * - task: 任務詳細資料（包含月度記錄等）
 */
tasks.get('/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');
    console.log(`========== 獲取任務詳情: ${taskId} ==========`);
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[tasks/:taskId] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[tasks/:taskId] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 讀取任務資料
    const tasksData = await kv.get(`user:${user.id}:tasks`) || {
      consecutiveReferral: null,
      monthlyKing: null
    };
    
    // 3. 根據 taskId 返回對應的任務
    let taskData = null;
    
    if (taskId === 'consecutive_referral' || taskId === 'task_consecutive') {
      taskData = tasksData.consecutiveReferral;
    } else if (taskId === 'monthly_king' || taskId === 'task_monthly_king') {
      taskData = tasksData.monthlyKing;
    } else {
      console.log(`❌ 無效的任務 ID: ${taskId}`);
      return c.json({
        error: { message: '無效的任務 ID' }
      }, 404);
    }
    
    if (!taskData) {
      console.log(`ℹ️ 任務尚未初始化: ${taskId}`);
      return c.json({
        success: true,
        data: {
          task: null,
          message: '任務尚未開始，完成第一次推薦後將自動啟動'
        }
      });
    }
    
    console.log(`✅ 任務資料: ${taskData.title}, 進度=${taskData.currentStreak || taskData.currentCount}/${taskData.target}`);
    console.log('========== ✅ 任務詳情獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        task: taskData
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取任務詳情錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取任務詳情失敗', details: error.message }
    }, 500);
  }
});

export default tasks;