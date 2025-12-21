import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { REWARD_CONFIG } from './reward_config.ts';

const rewards = new Hono();

/**
 * GET /rewards - 獲取用戶的獎勵資料
 * 
 * 返回：
 * - availableRewards: 可提領點數
 * - pendingRewards: 處理中點數（提領申請中）
 * - withdrawnRewards: 已提領點數
 * - totalEarned: 總累積點數
 */
rewards.get('/', async (c) => {
  try {
    console.log('========== 獲取獎勵資料 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[rewards] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 直接讀取預計算的獎勵資料（O(1) 時間複雜度）
    const rewardsData = await kv.get(`user:${user.id}:rewards`) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`💰 獎勵資料: 可提領=${rewardsData.availableRewards}P, 總累積=${rewardsData.totalEarned}P`);
    console.log('========== ✅ 獎勵資料獲取完成 ==========');
    
    return c.json({
      success: true,
      data: rewardsData
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取獎勵資料錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取獎勵資料失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /rewards/history - 獲取用戶的獎勵歷史
 * 
 * Query Parameters:
 * - limit: 返回筆數（預設50，最多200）
 * - offset: 起始位置（預設0）
 * 
 * 返回：
 * - history: 獎勵記錄陣列（最近200筆）
 * - total: 總筆數
 */
rewards.get('/history', async (c) => {
  try {
    console.log('========== 獲取獎勵歷史 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards/history] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[rewards/history] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards/history] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取查詢參數
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');
    
    const limit = limitParam ? Math.min(parseInt(limitParam), 200) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;
    
    console.log(`📋 查詢參數: limit=${limit}, offset=${offset}`);
    
    // 3. 直接讀取預計算的獎勵歷史（O(1) 時間複雜度）
    const allHistory = await kv.get(`user:${user.id}:reward_history`) || [];
    
    // 4. 分頁處理
    const paginatedHistory = allHistory.slice(offset, offset + limit);
    
    console.log(`📜 獎勵歷史: 總計=${allHistory.length}筆, 返回=${paginatedHistory.length}筆`);
    console.log('========== ✅ 獎勵歷史獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        history: paginatedHistory,
        total: allHistory.length,
        limit,
        offset
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取獎勵歷史錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取獎勵歷史失敗', details: error.message }
    }, 500);
  }
});

/**
 * POST /rewards/withdraw - 申請提領獎勵
 * 
 * Request Body:
 * - amount: 提領金額（必須 > 0 且 <= availableRewards）
 * 
 * 返回：
 * - withdrawalId: 提領申請 ID
 * - status: 提領狀態
 */
rewards.post('/withdraw', async (c) => {
  try {
    console.log('========== 申請提領獎勵 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards/withdraw] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[rewards/withdraw] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards/withdraw] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取請求資料
    const { amount } = await c.req.json();
    
    // 3. 驗證提領金額
    if (!amount || amount <= 0) {
      console.log(`❌ 無效的提領金額: ${amount}`);
      return c.json({
        error: { message: '提領金額必須大於 0' }
      }, 400);
    }
    
    // 4. 獲取用戶獎勵資料
    const rewardsKey = `user:${user.id}:rewards`;
    const rewards = await kv.get(rewardsKey) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0
    };
    
    // 5. 檢查餘額
    if (amount > rewards.availableRewards) {
      console.log(`❌ 餘額不足: 申請=${amount}P, 可用=${rewards.availableRewards}P`);
      return c.json({
        error: { message: '餘額不足' }
      }, 400);
    }
    
    // 6. 創建提領申請
    const withdrawalId = `withdrawal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const withdrawal = {
      id: withdrawalId,
      userId: user.id,
      amount,
      status: 'pending', // pending | approved | rejected | completed
      requestedAt: new Date().toISOString(),
      processedAt: null
    };
    
    // 7. 更新獎勵資料
    rewards.availableRewards -= amount;
    rewards.pendingRewards += amount;
    rewards.lastUpdated = new Date().toISOString();
    
    await kv.set(rewardsKey, rewards);
    
    // 8. 儲存提領申請
    await kv.set(`withdrawal:${withdrawalId}`, withdrawal);
    
    // 9. 將提領申請加入用戶的提領列表
    const userWithdrawalsKey = `user:${user.id}:withdrawals`;
    const userWithdrawals = await kv.get(userWithdrawalsKey) || [];
    userWithdrawals.unshift(withdrawalId);
    await kv.set(userWithdrawalsKey, userWithdrawals);
    
    console.log(`✅ 提領申請創建: id=${withdrawalId}, amount=${amount}P`);
    console.log(`💰 更新後餘額: 可提領=${rewards.availableRewards}P, 處理中=${rewards.pendingRewards}P`);
    console.log('========== ✅ 提領申請完成 ==========');
    
    return c.json({
      success: true,
      data: {
        withdrawalId,
        status: withdrawal.status,
        amount,
        requestedAt: withdrawal.requestedAt
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 申請提領錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '申請提領失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /rewards/withdrawals - 獲取用戶的提領記錄
 * 
 * 返回：
 * - withdrawals: 提領記錄陣列
 */
rewards.get('/withdrawals', async (c) => {
  try {
    console.log('========== 獲取提領記錄 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards/withdrawals] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards/withdrawals] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取提領 ID 列表
    const withdrawalIds = await kv.get(`user:${user.id}:withdrawals`) || [];
    
    // 3. 批量讀取提領詳情
    const withdrawals = await Promise.all(
      withdrawalIds.map(async (id) => {
        const withdrawal = await kv.get(`withdrawal:${id}`);
        return withdrawal;
      })
    );
    
    // 過濾掉不存在的提領記錄
    const validWithdrawals = withdrawals.filter(w => w !== null);
    
    console.log(`📜 提領記錄: ${validWithdrawals.length} 筆`);
    console.log('========== ✅ 提領記錄獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        withdrawals: validWithdrawals
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取提領記錄錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取提領記錄失敗', details: error.message }
    }, 500);
  }
});

export default rewards;
