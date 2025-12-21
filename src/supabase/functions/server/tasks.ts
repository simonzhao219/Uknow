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
      // 如果任務不存在，返回預設的任務資訊
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
 *   - listingName: 被推薦人刊登名稱 ✅
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
 * - data: 12個月的推薦狀態，每月只返回第一筆推薦
 *   - month: 月份（YYYY-MM）
 *   - hasReferral: 該月是否有推薦
 *   - firstReferral: 第一筆推薦記錄（如果存在）
 *     - listingId: 刊登 ID
 *     - userName: 被推薦人用戶名
 *     - listingName: 被推薦人刊登名稱
 *     - createdAt: 創建時間
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
    
    // 2. 獲取月度日誌
    const userLogKey = `user:${user.id}:referral_monthly_log`;
    const userLog = await kv.get(userLogKey) || {};
    
    // 3. 計算過去12個月
    const now = new Date();
    const monthlyProgress = [];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const monthData = userLog[monthKey] || [];
      const hasReferral = monthData.length > 0;
      const firstReferral = hasReferral ? {
        listingId: monthData[0].listingId,
        userName: monthData[0].userName,
        listingName: monthData[0].listingName,
        createdAt: monthData[0].createdAt
      } : null;
      
      monthlyProgress.push({
        month: monthKey,
        hasReferral,
        firstReferral
      });
    }
    
    console.log(`📊 月度摘要: ${monthlyProgress.filter(m => m.hasReferral).length}/12 個月有推薦`);
    console.log('========== ✅ 月度推薦摘要獲取完成 ==========');
    
    return c.json({
      success: true,
      data: monthlyProgress
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
    
    console.log(`📊 ${currentMonth} 月份推薦記錄: 總共 ${monthData.length} 筆，返回前 ${topReferrals.length} 筆`);
    console.log('========== ✅ 本月前N筆推薦獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        month: currentMonth,
        total: monthData.length,
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
