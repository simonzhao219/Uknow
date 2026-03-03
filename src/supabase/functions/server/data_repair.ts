import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { toTaiwanISOString, getTaiwanNow, toTaiwanDateString } from './date_utils.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { REWARD_CONFIG } from './reward_config.ts';

const dataRepair = new Hono();

interface RepairResult {
  action: string;
  success: boolean;
  affected: number;
  details?: any;
}

/**
 * 🔐 認證中間件：檢查是否為管理員
 */
const requireAdmin = async (c: any, next: any) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[Data Repair] ❌ 缺少 Authorization header');
      return c.json({
        success: false,
        error: { message: '需要管理員權限', code: 'UNAUTHORIZED' }
      }, 401);
    }
    
    const token = authHeader.substring(7);
    
    // 使用 Service Role Key 創建 Supabase Client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // 驗證 token
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('[Data Repair] ❌ Token 驗證失敗:', error?.message);
      return c.json({
        success: false,
        error: { message: 'Token 無效或已過期', code: 'INVALID_TOKEN' }
      }, 401);
    }
    
    // 檢查是否為管理員
    const profile = await kv.get(`user:${user.id}:profile`);
    
    if (!profile || profile.role !== 'admin') {
      console.error(`[Data Repair] ❌ 用戶 ${user.id} 不是管理員`);
      return c.json({
        success: false,
        error: { message: '需要管理員權限', code: 'FORBIDDEN' }
      }, 403);
    }
    
    console.log(`[Data Repair] ✅ 管理員驗證成功: ${user.email}`);
    
    // 將用戶信息存到 context
    c.set('user', user);
    c.set('profile', profile);
    
    await next();
  } catch (error) {
    console.error('[Data Repair] ❌ 認證過程出錯:', error);
    return c.json({
      success: false,
      error: { message: '認證失敗', details: error.message }
    }, 500);
  }
};

// 對所有數據修復路由應用管理員認證
dataRepair.use('*', requireAdmin);

/**
 * 修復指定用戶的重複數據
 */
dataRepair.post('/repair-user/:userId', async (c) => {
  const userId = c.req.param('userId');
  
  console.log(`[Data Repair] 開始修復用戶: ${userId}`);
  
  const results: RepairResult[] = [];
  
  try {
    // 1. 移除重複推薦碼
    const codeResult = await removeDuplicateReferralCodes(userId);
    results.push(codeResult);
    
    // 2. 合併重複訂閱
    const subResult = await mergeDuplicateSubscriptions(userId);
    results.push(subResult);
    
    // 3. 校正推薦樹（作為推薦人）
    const treeResult = await deduplicateReferralTree(userId);
    results.push(treeResult);
    
    // 4. 刪除重複獎勵排程
    const scheduleResult = await removeDuplicateRewardSchedules(userId);
    results.push(scheduleResult);
    
    // 5. 校正獎勵金額
    const rewardResult = await recalculateRewards(userId);
    results.push(rewardResult);
    
    // 6. 去重月度日誌
    const monthlyLogResult = await deduplicateMonthlyLog(userId);
    results.push(monthlyLogResult);
    
    // 保存修復日誌
    const logKey = `repair_log:${userId}:${Date.now()}`;
    await kv.set(logKey, {
      userId,
      timestamp: toTaiwanISOString(getTaiwanNow()),
      results
    });
    
    console.log(`[Data Repair] ✅ 修復完成: ${userId}`);
    
    return c.json({
      success: true,
      userId,
      results
    });
    
  } catch (error) {
    console.error('[Data Repair] ❌ 修復失敗:', error);
    return c.json({
      success: false,
      error: { message: '修復失敗', details: error.message }
    }, 500);
  }
});

/**
 * ⭐ 修復特定用戶：江梓豪 (6597c99d-5905-4132-99e2-be7b98787315)
 * 
 * 推薦關係鏈：歐宥塏 → 黎仁傑 → 江梓豪
 * 
 * 影響範圍：
 * - 江梓豪：重複推薦碼、重複訂閱
 * - 黎仁傑（1代推薦人）：推薦樹、獎勵、排程、月度日誌、任務
 * - 歐宥塏（2代推薦人）：推薦樹、獎勵、排程
 */
dataRepair.post('/repair-jiang-zihao', async (c) => {
  const JIANG_USER_ID = '6597c99d-5905-4132-99e2-be7b98787315';
  const JIANG_USER_NAME = '江梓豪';
  const LI_USER_ID = '61b157d2-f242-4288-8deb-ffb7752d385e';
  const LI_USER_NAME = '黎仁傑';
  
  console.log('========================================');
  console.log('🔧 開始修復用戶：江梓豪（三層級修復）');
  console.log('推薦鏈：歐宥塏 → 黎仁傑 → 江梓豪');
  console.log('========================================');
  
  const results: RepairResult[] = [];
  
  try {
    // ===== 步驟 1: 查詢歐宥塏的用戶ID =====
    console.log('\n步驟 1: 查詢推薦鏈條，確定歐宥塏的用戶ID');
    
    const liReferredBy = await kv.get(`user:${LI_USER_ID}:referred_by`);
    
    if (!liReferredBy || !liReferredBy.referrerUserId) {
      throw new Error('無法找到黎仁傑的推薦人（歐宥塏）');
    }
    
    const OU_USER_ID = liReferredBy.referrerUserId;
    const OU_USER_NAME = liReferredBy.referrerUserName;
    
    console.log(`✓ 找到歐宥塏: ${OU_USER_NAME} (${OU_USER_ID})`);
    console.log(`✓ 推薦鏈確認: ${OU_USER_NAME} → ${LI_USER_NAME} → ${JIANG_USER_NAME}`);
    
    // ===== 步驟 2: 修復江梓豪的重複推薦碼 =====
    console.log('\n步驟 2: 移除江梓豪的重複推薦碼');
    const codeResult = await removeDuplicateReferralCodes(JIANG_USER_ID);
    results.push(codeResult);
    
    // ===== 步驟 3: 合併江梓豪的重複訂閱 =====
    console.log('\n步驟 3: 合併江梓豪的重複訂閱');
    const subResult = await mergeDuplicateSubscriptions(JIANG_USER_ID);
    results.push(subResult);
    
    // ===== 步驟 4: 去重黎仁傑的推薦樹（1代推薦人）=====
    console.log(`\n步驟 4: 去重黎仁傑的推薦樹（江梓豪在1代）`);
    const liTreeResult = await deduplicateReferralTree(LI_USER_ID);
    results.push(liTreeResult);
    
    // ===== 步驟 5: 去重歐宥塏的推薦樹（2代推薦人）=====
    console.log(`\n步驟 5: 去重歐宥塏的推薦樹（江梓豪在2代）`);
    const ouTreeResult = await deduplicateReferralTree(OU_USER_ID);
    results.push(ouTreeResult);
    
    // ===== 步驟 6: 刪除黎仁傑的重複獎勵排程 =====
    console.log(`\n步驟 6: 刪除黎仁傑的重複獎勵排程`);
    const liScheduleResult = await removeDuplicateRewardSchedulesForReferee(
      LI_USER_ID,
      JIANG_USER_ID
    );
    results.push(liScheduleResult);
    
    // ===== 步驟 7: 刪除歐宥塏的重複獎勵排程 =====
    console.log(`\n步驟 7: 刪除歐宥塏的重複獎勵排程`);
    const ouScheduleResult = await removeDuplicateRewardSchedulesForReferee(
      OU_USER_ID,
      JIANG_USER_ID
    );
    results.push(ouScheduleResult);
    
    // ===== 步驟 8: 校正黎仁傑的獎勵金額 =====
    console.log(`\n步驟 8: 校正黎仁傑的獎勵金額（1代獎勵）`);
    const liRewardResult = await recalculateRewardsForReferee(
      LI_USER_ID,
      JIANG_USER_ID,
      JIANG_USER_NAME
    );
    results.push(liRewardResult);
    
    // ===== 步驟 9: 校正歐宥塏的獎勵金額 =====
    console.log(`\n步驟 9: 校正歐宥塏的獎勵金額（2代獎勵）`);
    const ouRewardResult = await recalculateRewardsForReferee(
      OU_USER_ID,
      JIANG_USER_ID,
      JIANG_USER_NAME
    );
    results.push(ouRewardResult);
    
    // ===== 步驟 10: 去重黎仁傑的月度日誌 =====
    console.log(`\n步驟 10: 去重黎仁傑的月度日誌`);
    const liMonthlyLogResult = await deduplicateMonthlyLog(LI_USER_ID);
    results.push(liMonthlyLogResult);
    
    // ===== 步驟 11: 重新計算黎仁傑的任務進度 =====
    console.log(`\n步驟 11: 重新計算黎仁傑的任務進度`);
    const liTaskResult = await recalculateTaskProgress(LI_USER_ID);
    results.push(liTaskResult);
    
    // ===== 步驟 12: 重新計算歐宥塏的任務進度 =====
    console.log(`\n步驟 12: 重新計算歐宥塏的任務進度`);
    const ouTaskResult = await recalculateTaskProgress(OU_USER_ID);
    results.push(ouTaskResult);
    
    // 保存修復日誌
    const logKey = `repair_log:jiang_zihao_three_level:${Date.now()}`;
    await kv.set(logKey, {
      jiangUserId: JIANG_USER_ID,
      jiangUserName: JIANG_USER_NAME,
      liUserId: LI_USER_ID,
      liUserName: LI_USER_NAME,
      ouUserId: OU_USER_ID,
      ouUserName: OU_USER_NAME,
      referralChain: `${OU_USER_NAME} → ${LI_USER_NAME} → ${JIANG_USER_NAME}`,
      timestamp: toTaiwanISOString(getTaiwanNow()),
      results
    });
    
    console.log('========================================');
    console.log('✅ 江梓豪三層級修復完成！');
    console.log(`✓ 影響用戶: ${JIANG_USER_NAME}, ${LI_USER_NAME}, ${OU_USER_NAME}`);
    console.log('========================================');
    
    return c.json({
      success: true,
      message: '江梓豪數據修復完成（三層級）',
      affectedUsers: [
        { id: JIANG_USER_ID, name: JIANG_USER_NAME, role: '被推薦人（本人）' },
        { id: LI_USER_ID, name: LI_USER_NAME, role: '1代推薦人' },
        { id: OU_USER_ID, name: OU_USER_NAME, role: '2代推薦人' }
      ],
      results
    });
    
  } catch (error) {
    console.error('========================================');
    console.error('❌ 江梓豪三層級修復失敗');
    console.error('========================================');
    console.error(error);
    
    return c.json({
      success: false,
      error: { message: '修復失敗', details: error.message }
    }, 500);
  }
});

/**
 * 🔍 DEBUG: 查詢推薦鏈條（往上追溯）
 * GET /data-repair/debug-referral-chain/:userId
 */
dataRepair.get('/debug-referral-chain/:userId', async (c) => {
  const userId = c.req.param('userId');
  
  console.log(`========== 🔍 查詢用戶推薦鏈條 ==========`);
  console.log(`起始用戶ID: ${userId}`);
  
  try {
    const chain = [];
    let currentUserId = userId;
    let depth = 0;
    const maxDepth = 5;  // 防止無限循環
    
    while (currentUserId && depth < maxDepth) {
      // 獲取用戶資料
      const profile = await kv.get(`user:${currentUserId}:profile`);
      
      if (!profile) {
        console.log(`⚠️ 找不到用戶資料: ${currentUserId}`);
        break;
      }
      
      // 獲取推薦來源
      const referredBy = await kv.get(`user:${currentUserId}:referred_by`);
      
      // 獲取推薦樹（查看此用戶推薦了誰）
      const referralTree = await kv.get(`user:${currentUserId}:referral_tree`);
      
      const userInfo = {
        depth,
        userId: currentUserId,
        userName: profile.name,
        email: profile.email,
        referralCode: profile.referralCode,
        referredByCode: profile.referredByCode,
        referredBy: referredBy ? {
          userId: referredBy.referrerUserId,
          userName: referredBy.referrerUserName,
          referralCode: referredBy.referrerReferralCode
        } : null,
        referralTreeStats: referralTree ? {
          firstGen: referralTree.firstGeneration?.length || 0,
          secondGen: referralTree.secondGeneration?.length || 0,
          thirdGen: referralTree.thirdGeneration?.length || 0
        } : null
      };
      
      chain.push(userInfo);
      
      console.log(`[層級 ${depth}] ${profile.name} (${currentUserId})`);
      console.log(`  推薦碼: ${profile.referralCode}`);
      console.log(`  被推薦碼: ${profile.referredByCode || '無'}`);
      console.log(`  推薦人: ${referredBy?.referrerUserName || '無'} (${referredBy?.referrerUserId || '無'})`);
      
      // 往上追溯
      currentUserId = referredBy?.referrerUserId;
      depth++;
    }
    
    console.log(`========== ✅ 推薦鏈條查詢完成（共 ${chain.length} 層） ==========`);
    
    return c.json({
      success: true,
      data: {
        startUserId: userId,
        chainLength: chain.length,
        chain
      }
    });
    
  } catch (error) {
    console.error('查詢推薦鏈條錯誤:', error);
    return c.json({
      success: false,
      error: { message: '查詢失敗', details: error.message }
    }, 500);
  }
});

/**
 * 🔧 修正推薦關係：江梓豪及其往上三代
 * POST /data-repair/fix-referral-chain-jiang
 * 
 * Request Body:
 * {
 *   newReferrerUserId: string,  // 江梓豪的新推薦人用戶ID
 *   newReferrerCode: string      // 新推薦人的推薦碼
 * }
 */
dataRepair.post('/fix-referral-chain-jiang', async (c) => {
  const JIANG_USER_ID = '6597c99d-5905-4132-99e2-be7b98787315';
  const JIANG_USER_NAME = '江梓豪';
  const LI_USER_ID = '61b157d2-f242-4288-8deb-ffb7752d385e';
  const LI_USER_NAME = '黎仁傑';
  
  console.log('========================================');
  console.log('🔧 開始修正江梓豪的推薦關係鏈條');
  console.log('========================================');
  
  try {
    const body = await c.req.json();
    const { newReferrerUserId, newReferrerCode } = body;
    
    if (!newReferrerUserId || !newReferrerCode) {
      return c.json({
        success: false,
        error: { message: '缺少必要參數: newReferrerUserId 或 newReferrerCode' }
      }, 400);
    }
    
    // 1. 獲取新推薦人資料
    const newReferrerProfile = await kv.get(`user:${newReferrerUserId}:profile`);
    
    if (!newReferrerProfile) {
      return c.json({
        success: false,
        error: { message: `找不到新推薦人: ${newReferrerUserId}` }
      }, 404);
    }
    
    console.log(`✓ 新推薦人: ${newReferrerProfile.name} (${newReferrerUserId})`);
    console.log(`✓ 新推薦碼: ${newReferrerCode}`);
    
    // 2. 獲取江梓豪的資料
    const jiangProfile = await kv.get(`user:${JIANG_USER_ID}:profile`);
    
    if (!jiangProfile) {
      return c.json({
        success: false,
        error: { message: '找不到江梓豪的用戶資料' }
      }, 404);
    }
    
    const oldReferredByCode = jiangProfile.referredByCode;
    console.log(`✓ 江梓豪當前被推薦碼: ${oldReferredByCode}`);
    
    // 3. 更新江梓豪的 profile（修改被推薦碼）
    jiangProfile.referredByCode = newReferrerCode;
    await kv.set(`user:${JIANG_USER_ID}:profile`, jiangProfile);
    console.log(`✅ 更新江梓豪的 referredByCode: ${oldReferredByCode} → ${newReferrerCode}`);
    
    // 4. 更新江梓豪的 referred_by
    const oldReferredBy = await kv.get(`user:${JIANG_USER_ID}:referred_by`);
    console.log(`✓ 江梓豪舊推薦來源:`, oldReferredBy);
    
    const newReferredBy = {
      referrerUserId: newReferrerUserId,
      referrerUserName: newReferrerProfile.name,
      referrerReferralCode: newReferrerCode,
      referredAt: toTaiwanISOString(getTaiwanNow())
    };
    
    await kv.set(`user:${JIANG_USER_ID}:referred_by`, newReferredBy);
    console.log(`✅ 更新江梓豪的 referred_by`);
    
    // 5. 從舊推薦人（黎仁傑）的推薦樹中移除江梓豪
    const liTreeKey = `user:${LI_USER_ID}:referral_tree`;
    const liTree = await kv.get(liTreeKey) || {
      firstGeneration: [],
      secondGeneration: [],
      thirdGeneration: []
    };
    
    console.log(`✓ 黎仁傑推薦樹（移除前）: 1代=${liTree.firstGeneration?.length || 0}, 2代=${liTree.secondGeneration?.length || 0}, 3代=${liTree.thirdGeneration?.length || 0}`);
    
    // 從一代中移除江梓豪
    liTree.firstGeneration = (liTree.firstGeneration || []).filter((member: any) => 
      member.userId !== JIANG_USER_ID
    );
    
    liTree.lastUpdated = toTaiwanISOString(getTaiwanNow());
    await kv.set(liTreeKey, liTree);
    
    console.log(`✅ 從黎仁傑的推薦樹移除江梓豪`);
    console.log(`✓ 黎仁傑推薦樹（移除後）: 1代=${liTree.firstGeneration?.length || 0}`);
    
    // 6. 將江梓豪添加到新推薦人的推薦樹
    const newReferrerTreeKey = `user:${newReferrerUserId}:referral_tree`;
    const newReferrerTree = await kv.get(newReferrerTreeKey) || {
      firstGeneration: [],
      secondGeneration: [],
      thirdGeneration: []
    };
    
    console.log(`✓ 新推薦人推薦樹（添加前）: 1代=${newReferrerTree.firstGeneration?.length || 0}, 2代=${newReferrerTree.secondGeneration?.length || 0}, 3代=${newReferrerTree.thirdGeneration?.length || 0}`);
    
    // 獲取江梓豪的訂閱和刊登信息（如果存在）
    const jiangSubscription = await kv.get(`user:${JIANG_USER_ID}:account_status`);
    const jiangListings = await kv.getByPrefix(`listing:`);
    const jiangListing = jiangListings.find((l: any) => l.userId === JIANG_USER_ID);
    
    const jiangMemberData = {
      userId: JIANG_USER_ID,
      userName: JIANG_USER_NAME,
      userReferralCode: jiangProfile.referralCode,
      listingId: jiangListing?.id || null,
      listingName: jiangListing?.name || null,
      category: jiangListing?.serviceType || null,
      city: jiangListing?.city || null,
      activeUntil: jiangSubscription?.subscriptionEndDate || null,
      createdAt: jiangSubscription?.subscriptionStartDate || toTaiwanISOString(getTaiwanNow())
    };
    
    // 添加到新推薦人的一代
    newReferrerTree.firstGeneration = newReferrerTree.firstGeneration || [];
    
    // 檢查是否已存在（防止重複）
    const existingIndex = newReferrerTree.firstGeneration.findIndex((m: any) => m.userId === JIANG_USER_ID);
    if (existingIndex >= 0) {
      newReferrerTree.firstGeneration[existingIndex] = jiangMemberData;
      console.log(`✓ 更新江梓豪在新推薦人推薦樹中的數據`);
    } else {
      newReferrerTree.firstGeneration.push(jiangMemberData);
      console.log(`✓ 添加江梓豪到新推薦人推薦樹`);
    }
    
    newReferrerTree.lastUpdated = toTaiwanISOString(getTaiwanNow());
    await kv.set(newReferrerTreeKey, newReferrerTree);
    
    console.log(`✅ 更新新推薦人的推薦樹`);
    console.log(`✓ 新推薦人推薦樹（添加後）: 1代=${newReferrerTree.firstGeneration?.length || 0}`);
    
    // 7. 更新推薦統計
    const liStatsKey = `user:${LI_USER_ID}:referral_stats`;
    const liStats = await kv.get(liStatsKey) || {
      totalReferrals: 0,
      firstGenCount: 0,
      secondGenCount: 0,
      thirdGenCount: 0
    };
    
    liStats.firstGenCount = liTree.firstGeneration?.length || 0;
    liStats.secondGenCount = liTree.secondGeneration?.length || 0;
    liStats.thirdGenCount = liTree.thirdGeneration?.length || 0;
    liStats.totalReferrals = liStats.firstGenCount + liStats.secondGenCount + liStats.thirdGenCount;
    liStats.lastUpdated = toTaiwanISOString(getTaiwanNow());
    
    await kv.set(liStatsKey, liStats);
    console.log(`✅ 更新黎仁傑的推薦統計`);
    
    const newReferrerStatsKey = `user:${newReferrerUserId}:referral_stats`;
    const newReferrerStats = await kv.get(newReferrerStatsKey) || {
      totalReferrals: 0,
      firstGenCount: 0,
      secondGenCount: 0,
      thirdGenCount: 0
    };
    
    newReferrerStats.firstGenCount = newReferrerTree.firstGeneration?.length || 0;
    newReferrerStats.secondGenCount = newReferrerTree.secondGeneration?.length || 0;
    newReferrerStats.thirdGenCount = newReferrerTree.thirdGeneration?.length || 0;
    newReferrerStats.totalReferrals = newReferrerStats.firstGenCount + newReferrerStats.secondGenCount + newReferrerStats.thirdGenCount;
    newReferrerStats.lastUpdated = toTaiwanISOString(getTaiwanNow());
    
    await kv.set(newReferrerStatsKey, newReferrerStats);
    console.log(`✅ 更新新推薦人的推薦統計`);
    
    // 8. 保存修復日誌
    const logKey = `repair_log:jiang_referral_chain:${Date.now()}`;
    await kv.set(logKey, {
      userId: JIANG_USER_ID,
      userName: JIANG_USER_NAME,
      oldReferrer: {
        userId: LI_USER_ID,
        userName: LI_USER_NAME,
        code: oldReferredByCode
      },
      newReferrer: {
        userId: newReferrerUserId,
        userName: newReferrerProfile.name,
        code: newReferrerCode
      },
      timestamp: toTaiwanISOString(getTaiwanNow())
    });
    
    console.log('========================================');
    console.log('✅ 江梓豪推薦關係修正完成！');
    console.log('========================================');
    
    return c.json({
      success: true,
      message: '江梓豪推薦關係修正完成',
      data: {
        userId: JIANG_USER_ID,
        userName: JIANG_USER_NAME,
        oldReferrer: {
          userId: LI_USER_ID,
          userName: LI_USER_NAME,
          code: oldReferredByCode
        },
        newReferrer: {
          userId: newReferrerUserId,
          userName: newReferrerProfile.name,
          code: newReferrerCode
        }
      }
    });
    
  } catch (error) {
    console.error('========================================');
    console.error('❌ 江梓豪推薦關係修正失敗');
    console.error('========================================');
    console.error(error);
    
    return c.json({
      success: false,
      error: { message: '修正失敗', details: error.message }
    }, 500);
  }
});

/**
 * 1. 移除重複的推薦碼（保留最新）
 */
async function removeDuplicateReferralCodes(userId: string): Promise<RepairResult> {
  console.log(`[Remove Duplicate Codes] 處理用戶: ${userId}`);
  
  try {
    // 獲取所有推薦碼
    const allCodes = await kv.getByPrefix('referral_code:');
    const userCodes = allCodes.filter(code => code.userId === userId);
    
    if (userCodes.length <= 1) {
      console.log(`[Remove Duplicate Codes] ℹ️ 用戶只有 ${userCodes.length} 個推薦碼，無需處理`);
      return {
        action: 'remove_duplicate_referral_codes',
        success: true,
        affected: 0,
        details: { message: '無重複推薦碼' }
      };
    }
    
    // 獲取用戶 profile，確定保留哪個推薦碼
    const userProfile = await kv.get(`user:${userId}:profile`);
    const keepCode = userProfile?.referralCode;
    
    if (!keepCode) {
      throw new Error('用戶 profile 中無推薦碼，無法確定保留哪一個');
    }
    
    console.log(`[Remove Duplicate Codes] 保留推薦碼: ${keepCode}`);
    
    // 刪除其他推薦碼
    let deletedCount = 0;
    const deletedCodes = [];
    
    for (const codeData of userCodes) {
      if (codeData.code !== keepCode) {
        await kv.del(`referral_code:${codeData.code}`);
        deletedCodes.push(codeData.code);
        deletedCount++;
        console.log(`[Remove Duplicate Codes] ❌ 刪除推薦碼: ${codeData.code}`);
      }
    }
    
    return {
      action: 'remove_duplicate_referral_codes',
      success: true,
      affected: deletedCount,
      details: {
        keptCode: keepCode,
        deletedCodes
      }
    };
    
  } catch (error) {
    console.error('[Remove Duplicate Codes] ❌ 錯誤:', error);
    return {
      action: 'remove_duplicate_referral_codes',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 2. 合併重複的訂閱（保留最新）
 */
async function mergeDuplicateSubscriptions(userId: string): Promise<RepairResult> {
  console.log(`[Merge Duplicate Subscriptions] 處理用戶: ${userId}`);
  
  try {
    const userSubscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
    
    if (userSubscriptions.length <= 1) {
      console.log(`[Merge Duplicate Subscriptions] ℹ️ 用戶只有 ${userSubscriptions.length} 個訂閱，無需處理`);
      return {
        action: 'merge_duplicate_subscriptions',
        success: true,
        affected: 0,
        details: { message: '無重複訂閱' }
      };
    }
    
    // 獲取帳號狀態，確定保留哪個訂閱
    const accountStatus = await kv.get(`user:${userId}:account_status`);
    const keepSubscriptionId = accountStatus?.currentSubscriptionId;
    
    if (!keepSubscriptionId) {
      // 如果沒有記錄，保留列表中第一個（最新的）
      const keepSubscriptionId = userSubscriptions[0];
      console.log(`[Merge Duplicate Subscriptions] ⚠️ 帳號狀態無記錄，保留列表第一個: ${keepSubscriptionId}`);
    } else {
      console.log(`[Merge Duplicate Subscriptions] 保留訂閱: ${keepSubscriptionId}`);
    }
    
    // 更新訂閱列表（只保留一個）
    await kv.set(`user:${userId}:subscriptions`, [keepSubscriptionId]);
    
    // 刪除其他訂閱記錄
    let deletedCount = 0;
    const deletedSubscriptions = [];
    
    for (const subId of userSubscriptions) {
      if (subId !== keepSubscriptionId) {
        await kv.del(`subscription:${subId}`);
        deletedSubscriptions.push(subId);
        deletedCount++;
        console.log(`[Merge Duplicate Subscriptions] ❌ 刪除訂閱: ${subId}`);
      }
    }
    
    return {
      action: 'merge_duplicate_subscriptions',
      success: true,
      affected: deletedCount,
      details: {
        keptSubscription: keepSubscriptionId,
        deletedSubscriptions
      }
    };
    
  } catch (error) {
    console.error('[Merge Duplicate Subscriptions] ❌ 錯誤:', error);
    return {
      action: 'merge_duplicate_subscriptions',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 3. 去重推薦樹（作為推薦人，樹中有重複被推薦人）
 */
async function deduplicateReferralTree(referrerId: string): Promise<RepairResult> {
  console.log(`[Deduplicate Referral Tree] 處理推薦人: ${referrerId}`);
  
  try {
    const treeKey = `user:${referrerId}:referral_tree`;
    const tree = await kv.get(treeKey);
    
    if (!tree) {
      console.log(`[Deduplicate Referral Tree] ℹ️ 用戶無推薦樹`);
      return {
        action: 'deduplicate_referral_tree',
        success: true,
        affected: 0,
        details: { message: '無推薦樹' }
      };
    }
    
    let totalRemoved = 0;
    
    // 處理一代
    if (tree.firstGeneration && tree.firstGeneration.length > 0) {
      const originalCount = tree.firstGeneration.length;
      const seen = new Set();
      tree.firstGeneration = tree.firstGeneration.filter((member: any) => {
        if (seen.has(member.userId)) {
          console.log(`[Deduplicate Referral Tree] ❌ 一代重複: ${member.userName} (${member.userId})`);
          return false;
        }
        seen.add(member.userId);
        return true;
      });
      totalRemoved += originalCount - tree.firstGeneration.length;
    }
    
    // 處理二代
    if (tree.secondGeneration && tree.secondGeneration.length > 0) {
      const originalCount = tree.secondGeneration.length;
      const seen = new Set();
      tree.secondGeneration = tree.secondGeneration.filter((member: any) => {
        if (seen.has(member.userId)) {
          console.log(`[Deduplicate Referral Tree] ❌ 二代重複: ${member.userName} (${member.userId})`);
          return false;
        }
        seen.add(member.userId);
        return true;
      });
      totalRemoved += originalCount - tree.secondGeneration.length;
    }
    
    // 處理三代
    if (tree.thirdGeneration && tree.thirdGeneration.length > 0) {
      const originalCount = tree.thirdGeneration.length;
      const seen = new Set();
      tree.thirdGeneration = tree.thirdGeneration.filter((member: any) => {
        if (seen.has(member.userId)) {
          console.log(`[Deduplicate Referral Tree] ❌ 三代重複: ${member.userName} (${member.userId})`);
          return false;
        }
        seen.add(member.userId);
        return true;
      });
      totalRemoved += originalCount - tree.thirdGeneration.length;
    }
    
    if (totalRemoved > 0) {
      tree.lastUpdated = toTaiwanISOString(getTaiwanNow());
      await kv.set(treeKey, tree);
      
      // 同時更新推薦統計
      const statsKey = `user:${referrerId}:referral_stats`;
      const stats = await kv.get(statsKey) || {
        totalReferrals: 0,
        firstGenCount: 0,
        secondGenCount: 0,
        thirdGenCount: 0
      };
      
      stats.firstGenCount = tree.firstGeneration?.length || 0;
      stats.secondGenCount = tree.secondGeneration?.length || 0;
      stats.thirdGenCount = tree.thirdGeneration?.length || 0;
      stats.totalReferrals = stats.firstGenCount + stats.secondGenCount + stats.thirdGenCount;
      stats.lastUpdated = toTaiwanISOString(getTaiwanNow());
      
      await kv.set(statsKey, stats);
      
      console.log(`[Deduplicate Referral Tree] ✅ 移除 ${totalRemoved} 個重複項`);
    }
    
    return {
      action: 'deduplicate_referral_tree',
      success: true,
      affected: totalRemoved,
      details: {
        firstGenCount: tree.firstGeneration?.length || 0,
        secondGenCount: tree.secondGeneration?.length || 0,
        thirdGenCount: tree.thirdGeneration?.length || 0
      }
    };
    
  } catch (error) {
    console.error('[Deduplicate Referral Tree] ❌ 錯誤:', error);
    return {
      action: 'deduplicate_referral_tree',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 4. 刪除重複的獎勵排程
 */
async function removeDuplicateRewardSchedules(userId: string): Promise<RepairResult> {
  console.log(`[Remove Duplicate Schedules] 處理用戶: ${userId}`);
  
  try {
    // 獲取所有該用戶的獎勵排程
    const allSchedules = await kv.getByPrefix('reward_schedule:');
    const userSchedules = allSchedules.filter((schedule: any) => 
      schedule.userId === userId || schedule.referee?.userId === userId
    );
    
    // 按 userId + refereeUserId + generation + monthNumber 分組
    const scheduleMap: { [key: string]: any[] } = {};
    
    for (const schedule of userSchedules) {
      if (!schedule.referee || schedule.userId !== userId) continue;
      
      const key = `${schedule.referee.userId}_${schedule.generation}_${schedule.monthNumber}`;
      
      if (!scheduleMap[key]) {
        scheduleMap[key] = [];
      }
      scheduleMap[key].push(schedule);
    }
    
    // 刪除重複的排程（保留第一個）
    let deletedCount = 0;
    
    for (const [key, schedules] of Object.entries(scheduleMap)) {
      if (schedules.length > 1) {
        console.log(`[Remove Duplicate Schedules] 🔍 發現重複排程: ${key}, 共 ${schedules.length} 筆`);
        
        // 保留第一個，刪除其他
        for (let i = 1; i < schedules.length; i++) {
          const schedule = schedules[i];
          
          // 刪除排程記錄
          await kv.del(`reward_schedule:${schedule.id}`);
          
          // 刪除日期索引
          if (schedule.scheduledDate) {
            const dateIndexKey = `reward_schedules_by_date:${schedule.scheduledDate}`;
            const dateIndex = await kv.get(dateIndexKey) || [];
            const newIndex = dateIndex.filter((id: string) => id !== schedule.id);
            await kv.set(dateIndexKey, newIndex);
          }
          
          deletedCount++;
          console.log(`[Remove Duplicate Schedules] ❌ 刪除排程: ${schedule.id}`);
        }
      }
    }
    
    return {
      action: 'remove_duplicate_reward_schedules',
      success: true,
      affected: deletedCount
    };
    
  } catch (error) {
    console.error('[Remove Duplicate Schedules] ❌ 錯誤:', error);
    return {
      action: 'remove_duplicate_reward_schedules',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 4. 刪除重複的獎勵排程（針對推薦人）
 */
async function removeDuplicateRewardSchedulesForReferee(
  referrerId: string,
  refereeId: string
): Promise<RepairResult> {
  console.log(`[Remove Duplicate Schedules] 處理推薦人: ${referrerId}, 被推薦人: ${refereeId}`);
  
  try {
    // 獲取所有該用戶的獎勵排程
    const allSchedules = await kv.getByPrefix('reward_schedule:');
    const userSchedules = allSchedules.filter((schedule: any) => 
      schedule.userId === referrerId || schedule.referee?.userId === refereeId
    );
    
    // 按 userId + refereeUserId + generation + monthNumber 分組
    const scheduleMap: { [key: string]: any[] } = {};
    
    for (const schedule of userSchedules) {
      if (!schedule.referee || schedule.userId !== referrerId) continue;
      
      const key = `${schedule.referee.userId}_${schedule.generation}_${schedule.monthNumber}`;
      
      if (!scheduleMap[key]) {
        scheduleMap[key] = [];
      }
      scheduleMap[key].push(schedule);
    }
    
    // 刪除重複的排程（保留第一個）
    let deletedCount = 0;
    
    for (const [key, schedules] of Object.entries(scheduleMap)) {
      if (schedules.length > 1) {
        console.log(`[Remove Duplicate Schedules] 🔍 發現重複排程: ${key}, 共 ${schedules.length} 筆`);
        
        // 保留第一個，刪除其他
        for (let i = 1; i < schedules.length; i++) {
          const schedule = schedules[i];
          
          // 刪除排程記錄
          await kv.del(`reward_schedule:${schedule.id}`);
          
          // 刪除日期索引
          if (schedule.scheduledDate) {
            const dateIndexKey = `reward_schedules_by_date:${schedule.scheduledDate}`;
            const dateIndex = await kv.get(dateIndexKey) || [];
            const newIndex = dateIndex.filter((id: string) => id !== schedule.id);
            await kv.set(dateIndexKey, newIndex);
          }
          
          deletedCount++;
          console.log(`[Remove Duplicate Schedules] ❌ 刪除排程: ${schedule.id}`);
        }
      }
    }
    
    return {
      action: 'remove_duplicate_reward_schedules',
      success: true,
      affected: deletedCount
    };
    
  } catch (error) {
    console.error('[Remove Duplicate Schedules] ❌ 錯誤:', error);
    return {
      action: 'remove_duplicate_reward_schedules',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 5. 校正獎勵金額（基於正確的推薦樹重新計算）
 */
async function recalculateRewards(userId: string): Promise<RepairResult> {
  console.log(`[Recalculate Rewards] 處理用戶: ${userId}`);
  
  try {
    // 獲取推薦樹
    const tree = await kv.get(`user:${userId}:referral_tree`);
    
    if (!tree) {
      console.log(`[Recalculate Rewards] ℹ️ 用戶無推薦樹，無需校正獎勵`);
      return {
        action: 'recalculate_rewards',
        success: true,
        affected: 0,
        details: { message: '無推薦樹' }
      };
    }
    
    // 計算應該有的獎勵
    const expectedTotalReferrals = 
      (tree.firstGeneration?.length || 0) +
      (tree.secondGeneration?.length || 0) +
      (tree.thirdGeneration?.length || 0);
    
    // 每個被推薦人的首月獎勵：10P
    const expectedFirstMonthRewards = expectedTotalReferrals * 10;
    
    console.log(`[Recalculate Rewards] 期望首月獎勵總額: ${expectedFirstMonthRewards}P`);
    
    // 獲取獎勵歷史
    const historyKey = `user:${userId}:reward_history`;
    const history = await kv.get(historyKey) || [];
    
    // 統計實際已發放的首月獎勵
    const firstMonthRewards = history.filter((r: any) => 
      r.type && r.type.includes('month1')
    );
    
    const actualFirstMonthAmount = firstMonthRewards.reduce((sum: number, r: any) => sum + r.amount, 0);
    
    console.log(`[Recalculate Rewards] 實際首月獎勵總額: ${actualFirstMonthAmount}P`);
    
    const difference = actualFirstMonthAmount - expectedFirstMonthRewards;
    
    if (difference !== 0) {
      console.log(`[Recalculate Rewards] ⚠️ 發現差異: ${difference}P`);
      
      // 校正獎勵餘額
      const rewardsKey = `user:${userId}:rewards`;
      const rewards = await kv.get(rewardsKey) || {
        availableRewards: 0,
        pendingRewards: 0,
        withdrawnRewards: 0,
        totalEarned: 0
      };
      
      // 扣除多發的部分
      if (difference > 0) {
        rewards.availableRewards -= difference;
        rewards.totalEarned -= difference;
        rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
        
        await kv.set(rewardsKey, rewards);
        
        // ✅ 計算交易後餘額
        const balanceAfterTransaction = rewards.availableRewards + rewards.pendingRewards;
        
        // 添加校正記錄到歷史
        history.unshift({
          id: `correction_${Date.now()}`,
          type: 'correction_duplicate_reward',
          amount: -difference,
          balance: balanceAfterTransaction,  // ✅ 新增：交易後餘額
          issuedAt: toTaiwanISOString(getTaiwanNow()),
          description: `系統校正：回收重複發放的推薦獎勵`
        });
        
        await kv.set(historyKey, history);
        
        console.log(`[Recalculate Rewards] ✅ 扣除多發獎勵: ${difference}P`);
      }
    } else {
      console.log(`[Recalculate Rewards] ✅ 獎勵金額正確，無需校正`);
    }
    
    return {
      action: 'recalculate_rewards',
      success: true,
      affected: Math.abs(difference),
      details: {
        expectedAmount: expectedFirstMonthRewards,
        actualAmount: actualFirstMonthAmount,
        difference: difference,
        action: difference > 0 ? 'deducted' : difference < 0 ? 'added' : 'no_change'
      }
    };
    
  } catch (error) {
    console.error('[Recalculate Rewards] ❌ 錯誤:', error);
    return {
      action: 'recalculate_rewards',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 5. 校正獎勵金額（基於正確的推薦樹重新計算）（針對推薦人）
 */
async function recalculateRewardsForReferee(
  referrerId: string,
  refereeId: string,
  refereeName: string
): Promise<RepairResult> {
  console.log(`[Recalculate Rewards] 處理推薦人: ${referrerId}, 被推薦人: ${refereeId}`);
  
  try {
    // 獲取推薦樹
    const tree = await kv.get(`user:${referrerId}:referral_tree`);
    
    if (!tree) {
      console.log(`[Recalculate Rewards] ℹ️ 用戶無推薦樹，無需校正獎勵`);
      return {
        action: 'recalculate_rewards',
        success: true,
        affected: 0,
        details: { message: '無推薦樹' }
      };
    }
    
    // 計算應該有的獎勵
    const expectedTotalReferrals = 
      (tree.firstGeneration?.length || 0) +
      (tree.secondGeneration?.length || 0) +
      (tree.thirdGeneration?.length || 0);
    
    // 每個被推薦人的首月獎勵：10P
    const expectedFirstMonthRewards = expectedTotalReferrals * 10;
    
    console.log(`[Recalculate Rewards] 期望首月獎勵總額: ${expectedFirstMonthRewards}P`);
    
    // 獲取獎勵歷史
    const historyKey = `user:${referrerId}:reward_history`;
    const history = await kv.get(historyKey) || [];
    
    // 統計實際已發放的���月獎勵
    const firstMonthRewards = history.filter((r: any) => 
      r.type && r.type.includes('month1')
    );
    
    const actualFirstMonthAmount = firstMonthRewards.reduce((sum: number, r: any) => sum + r.amount, 0);
    
    console.log(`[Recalculate Rewards] 實際首月獎勵總額: ${actualFirstMonthAmount}P`);
    
    const difference = actualFirstMonthAmount - expectedFirstMonthRewards;
    
    if (difference !== 0) {
      console.log(`[Recalculate Rewards] ⚠️ 發現差異: ${difference}P`);
      
      // 校正獎勵餘額
      const rewardsKey = `user:${referrerId}:rewards`;
      const rewards = await kv.get(rewardsKey) || {
        availableRewards: 0,
        pendingRewards: 0,
        withdrawnRewards: 0,
        totalEarned: 0
      };
      
      // 扣除多發的部分
      if (difference > 0) {
        rewards.availableRewards -= difference;
        rewards.totalEarned -= difference;
        rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
        
        await kv.set(rewardsKey, rewards);
        
        // ✅ 計算交易後餘額
        const balanceAfterTransaction = rewards.availableRewards + rewards.pendingRewards;
        
        // 添加校正記錄到歷史
        history.unshift({
          id: `correction_${Date.now()}`,
          type: 'correction_duplicate_reward',
          amount: -difference,
          balance: balanceAfterTransaction,  // ✅ 新增：交易後餘額
          issuedAt: toTaiwanISOString(getTaiwanNow()),
          description: `系統校正：回收重複發放的推薦獎勵（被推薦人: ${refereeName}）`
        });
        
        await kv.set(historyKey, history);
        
        console.log(`[Recalculate Rewards] ✅ 扣除多發獎勵: ${difference}P`);
      }
    } else {
      console.log(`[Recalculate Rewards] ✅ 獎勵金額正確，無需校正`);
    }
    
    return {
      action: 'recalculate_rewards',
      success: true,
      affected: Math.abs(difference),
      details: {
        expectedAmount: expectedFirstMonthRewards,
        actualAmount: actualFirstMonthAmount,
        difference: difference,
        action: difference > 0 ? 'deducted' : difference < 0 ? 'added' : 'no_change'
      }
    };
    
  } catch (error) {
    console.error('[Recalculate Rewards] ❌ 錯誤:', error);
    return {
      action: 'recalculate_rewards',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 6. 去重月度日誌
 */
async function deduplicateMonthlyLog(userId: string): Promise<RepairResult> {
  console.log(`[Deduplicate Monthly Log] 處理用戶: ${userId}`);
  
  try {
    const logKey = `user:${userId}:monthly_log`;
    const log = await kv.get(logKey);
    
    if (!log) {
      console.log(`[Deduplicate Monthly Log] ℹ️ 用戶無月度日誌`);
      return {
        action: 'deduplicate_monthly_log',
        success: true,
        affected: 0,
        details: { message: '無月度日誌' }
      };
    }
    
    let totalRemoved = 0;
    
    // 按月分組
    const monthMap: { [key: string]: any[] } = {};
    
    for (const entry of log) {
      const key = `${entry.year}-${entry.month}`;
      
      if (!monthMap[key]) {
        monthMap[key] = [];
      }
      monthMap[key].push(entry);
    }
    
    // 刪除重複的記錄（保留第一個）
    for (const [key, entries] of Object.entries(monthMap)) {
      if (entries.length > 1) {
        console.log(`[Deduplicate Monthly Log] 🔍 發現重複記錄: ${key}, 共 ${entries.length} 筆`);
        
        // 保留第一個，刪除其他
        for (let i = 1; i < entries.length; i++) {
          const entry = entries[i];
          
          // 刪除記錄
          const index = log.indexOf(entry);
          if (index > -1) {
            log.splice(index, 1);
            totalRemoved++;
            console.log(`[Deduplicate Monthly Log] ❌ 刪除記錄: ${entry.year}-${entry.month}`);
          }
        }
      }
    }
    
    if (totalRemoved > 0) {
      await kv.set(logKey, log);
      
      console.log(`[Deduplicate Monthly Log] ✅ 移除 ${totalRemoved} 個重複項`);
    }
    
    return {
      action: 'deduplicate_monthly_log',
      success: true,
      affected: totalRemoved
    };
    
  } catch (error) {
    console.error('[Deduplicate Monthly Log] ❌ 錯誤:', error);
    return {
      action: 'deduplicate_monthly_log',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 重新計算任務進度（基於推薦樹實時計算）
 */
async function recalculateTaskProgress(userId: string): Promise<RepairResult> {
  console.log(`[Recalculate Task Progress] 處理用戶: ${userId}`);
  
  try {
    // 獲取推薦樹
    const tree = await kv.get(`user:${userId}:referral_tree`);
    
    if (!tree) {
      console.log(`[Recalculate Task Progress] ℹ️ 用戶無推薦樹，無需計算任務`);
      return {
        action: 'recalculate_task_progress',
        success: true,
        affected: 0,
        details: { message: '無推薦樹' }
      };
    }
    
    const firstGenCount = tree.firstGeneration?.length || 0;
    
    // 獲取用戶任務進度
    const taskProgressKey = `user:${userId}:task_progress`;
    const taskProgress = await kv.get(taskProgressKey) || {};
    
    let updatedCount = 0;
    
    // 重新計算「連續推薦達人」任務進度
    if (taskProgress.consecutive_referral) {
      const oldCount = taskProgress.consecutive_referral.currentCount || 0;
      taskProgress.consecutive_referral.currentCount = firstGenCount;
      
      if (oldCount !== firstGenCount) {
        console.log(`[Recalculate Task Progress] 連續推薦達人: ${oldCount} → ${firstGenCount}`);
        updatedCount++;
      }
    }
    
    // 重新計算「推薦王」任務進度（本月推薦數）
    if (taskProgress.monthly_king) {
      // 從 monthly_log 計算本月推薦數
      const now = getTaiwanNow();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const monthlyLog = await kv.get(`user:${userId}:referral_monthly_log`) || {};
      const thisMonthReferrals = monthlyLog[currentMonth] || [];
      
      const oldMonthCount = taskProgress.monthly_king.currentMonthCount || 0;
      const newMonthCount = thisMonthReferrals.length;
      
      taskProgress.monthly_king.currentMonthCount = newMonthCount;
      
      if (oldMonthCount !== newMonthCount) {
        console.log(`[Recalculate Task Progress] 推薦王（本月）: ${oldMonthCount} → ${newMonthCount}`);
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      taskProgress.lastUpdated = toTaiwanISOString(getTaiwanNow());
      await kv.set(taskProgressKey, taskProgress);
      console.log(`[Recalculate Task Progress] ✅ 更新 ${updatedCount} 個任務進度`);
    } else {
      console.log(`[Recalculate Task Progress] ✅ 任務進度正確，無需更新`);
    }
    
    return {
      action: 'recalculate_task_progress',
      success: true,
      affected: updatedCount,
      details: {
        consecutiveReferral: taskProgress.consecutive_referral?.currentCount || 0,
        monthlyKing: taskProgress.monthly_king?.currentMonthCount || 0
      }
    };
    
  } catch (error) {
    console.error('[Recalculate Task Progress] ❌ 錯誤:', error);
    return {
      action: 'recalculate_task_progress',
      success: false,
      affected: 0,
      details: { error: error.message }
    };
  }
}

/**
 * 批量修復所有檢測到問題的用戶
 */
dataRepair.post('/repair-all', async (c) => {
  console.log('[Data Repair] 開始批量修復...');
  
  try {
    return c.json({
      success: false,
      message: '批量修復功能尚未實現，請使用 /fix-missing-referred-by 端點修復推薦鏈問題'
    });
    
  } catch (error) {
    console.error('[Data Repair] ❌ 批量修復失敗:', error);
    return c.json({
      success: false,
      error: { message: '批量修復失敗', details: error.message }
    }, 500);
  }
});

/**
 * ⭐⭐⭐ 修復所有缺失的 referred_by 記錄並重建推薦樹
 * POST /data-repair/fix-missing-referred-by
 * 
 * 問題根因：auth_registration_core.ts 的 completeUserRegistration 函數
 * 遺漏了建立 user:${userId}:referred_by 記錄，導致二代、三代推薦關係斷裂。
 * 
 * Query Parameters:
 * - dryRun=true  只檢查不修改（預設）
 * - dryRun=false 實際執行修復
 */
dataRepair.post('/fix-missing-referred-by', async (c) => {
  const dryRun = c.req.query('dryRun') !== 'false';
  
  console.log('========================================');
  console.log(`🔧 修復缺失的 referred_by 記錄${dryRun ? '（預覽模式）' : '（執行模式）'}`);
  console.log('========================================');
  
  try {
    // ===== 步驟 1: 掃描所有 profile =====
    console.log('\n步驟 1: 掃描所有用戶 profile...');
    
    const allProfiles = await kv.getByPrefix('user:');
    const profiles = allProfiles.filter((item: any) => 
      typeof item === 'object' && item !== null && item.id && item.email && item.registrationStep !== undefined
    );
    
    console.log(`✅ 找到 ${profiles.length} 個用戶 profile`);
    
    // ===== 步驟 2: 找出缺失 referred_by 的用戶 =====
    console.log('\n步驟 2: 檢查缺失的 referred_by 記錄...');
    
    const missingReferredBy: any[] = [];
    const allReferredByMap: { [userId: string]: any } = {};
    
    for (const profile of profiles) {
      if (profile.referredByUserId) {
        const referredBy = await kv.get(`user:${profile.id}:referred_by`);
        
        if (!referredBy) {
          missingReferredBy.push(profile);
          console.log(`❌ 缺失: ${profile.name} (${profile.id}) → 推薦人: ${profile.referredByUserId}`);
        } else {
          allReferredByMap[profile.id] = referredBy;
        }
      }
    }
    
    console.log(`\n📊 統計結果:`);
    console.log(`   有推薦人的用戶: ${profiles.filter((p: any) => p.referredByUserId).length}`);
    console.log(`   缺失 referred_by: ${missingReferredBy.length}`);
    console.log(`   已有 referred_by: ${Object.keys(allReferredByMap).length}`);
    
    if (dryRun) {
      console.log('\n⚠️ 預覽模式 - 不執行修改');
      return c.json({
        success: true,
        dryRun: true,
        summary: {
          totalProfiles: profiles.length,
          usersWithReferrer: profiles.filter((p: any) => p.referredByUserId).length,
          missingReferredBy: missingReferredBy.length,
          existingReferredBy: Object.keys(allReferredByMap).length
        },
        missingUsers: missingReferredBy.map((p: any) => ({
          userId: p.id,
          userName: p.name,
          referredByUserId: p.referredByUserId,
          referredByCode: p.referredByCode,
          registrationStep: p.registrationStep
        }))
      });
    }
    
    // ===== 步驟 3: 補建缺失的 referred_by 記錄 =====
    console.log('\n步驟 3: 補建缺失的 referred_by 記錄...');
    
    let createdCount = 0;
    
    for (const profile of missingReferredBy) {
      let referrerUserName = '未知用戶';
      let referrerListingId = null;
      let referrerListingName = null;
      
      if (profile.referredByCode) {
        const referralCodeData = await kv.get(`referral_code:${profile.referredByCode}`);
        if (referralCodeData) {
          referrerUserName = referralCodeData.userName || '未知用戶';
          referrerListingId = referralCodeData.listingId || null;
          referrerListingName = referralCodeData.listingName || null;
        }
      }
      
      if (referrerUserName === '未知用戶') {
        const referrerProfile = await kv.get(`user:${profile.referredByUserId}:profile`);
        if (referrerProfile) {
          referrerUserName = referrerProfile.name || '未知用戶';
        }
      }
      
      const referredByRecord = {
        referrerUserId: profile.referredByUserId,
        referrerListingId,
        referrerUserName,
        referrerListingName,
        referralCode: profile.referredByCode,
        referredAt: profile.paidAt || profile.createdAt || toTaiwanISOString(getTaiwanNow()),
        generation: 1
      };
      
      await kv.set(`user:${profile.id}:referred_by`, referredByRecord);
      allReferredByMap[profile.id] = referredByRecord;
      createdCount++;
      
      console.log(`✅ 已建立: ${profile.name} (${profile.id}) → ${referrerUserName}`);
    }
    
    console.log(`\n📊 步驟 3 完成: 共建立 ${createdCount} 筆 referred_by 記錄`);
    
    // ===== 步驟 4: 重建所有推薦樹 =====
    console.log('\n步驟 4: 重建所有推薦樹...');
    
    const profileMap: { [userId: string]: any } = {};
    for (const profile of profiles) {
      profileMap[profile.id] = profile;
    }
    
    // 找出所有推薦人
    const referrerIds = new Set<string>();
    for (const profile of profiles) {
      if (profile.referredByUserId) {
        referrerIds.add(profile.referredByUserId);
        
        const gen1RB = allReferredByMap[profile.referredByUserId];
        
        // 🔧 新增日志：检查一代推荐人的 referred_by
        if (!gen1RB) {
          console.log(`⚠️  警告: ${profile.name} 的一代推荐人 ${profile.referredByUserId} 没有 referred_by 记录`);
        }
        
        if (gen1RB?.referrerUserId) {
          referrerIds.add(gen1RB.referrerUserId);
          
          const gen2RB = allReferredByMap[gen1RB.referrerUserId];
          
          // 🔧 新增日志：检查二代推荐人的 referred_by
          if (!gen2RB) {
            console.log(`⚠️  警告: ${profile.name} 的二代推荐人 ${gen1RB.referrerUserId} 没有 referred_by 记录`);
          }
          
          if (gen2RB?.referrerUserId) {
            referrerIds.add(gen2RB.referrerUserId);
          }
        }
      }
    }
    
    console.log(`找到 ${referrerIds.size} 個推薦人需要重建推薦樹`);
    
    const newTrees: { [userId: string]: { firstGeneration: any[], secondGeneration: any[], thirdGeneration: any[] } } = {};
    for (const rid of referrerIds) {
      newTrees[rid] = { firstGeneration: [], secondGeneration: [], thirdGeneration: [] };
    }
    
    for (const profile of profiles) {
      if (!profile.referredByUserId || profile.registrationStep < 3) continue;
      
      const gen1ReferrerId = profile.referredByUserId;
      const memberInfo = {
        userId: profile.id,
        userName: profile.name,
        userReferralCode: profile.referralCode || null,
        listingId: null, listingName: null, serviceType: null, city: null,
        activeUntil: profile.activeUntil || null,
        isActive: profile.activeUntil ? new Date(profile.activeUntil) >= getTaiwanNow() : false,
        createdAt: profile.paidAt || profile.createdAt
      };
      
      const gen1Prof = profileMap[gen1ReferrerId];
      const directReferrerInfo = gen1Prof ? {
        userId: gen1ReferrerId,
        userName: gen1Prof.name || '未知用戶',
        userReferralCode: gen1Prof.referralCode || null
      } : null;
      
      if (newTrees[gen1ReferrerId]) {
        newTrees[gen1ReferrerId].firstGeneration.push({ ...memberInfo, referrer: null });
      }
      
      const gen1RB = allReferredByMap[gen1ReferrerId];
      if (gen1RB?.referrerUserId) {
        const gen2Id = gen1RB.referrerUserId;
        if (newTrees[gen2Id]) {
          newTrees[gen2Id].secondGeneration.push({ ...memberInfo, referrer: directReferrerInfo });
        }
        
        const gen2RB = allReferredByMap[gen2Id];
        if (gen2RB?.referrerUserId) {
          const gen3Id = gen2RB.referrerUserId;
          if (newTrees[gen3Id]) {
            newTrees[gen3Id].thirdGeneration.push({ ...memberInfo, referrer: directReferrerInfo });
          }
        }
      }
    }
    
    let treesUpdated = 0;
    const treeChanges: any[] = [];
    
    for (const [userId, newTree] of Object.entries(newTrees)) {
      const oldTree = await kv.get(`user:${userId}:referral_tree`);
      const oldGen1 = oldTree?.firstGeneration?.length || 0;
      const oldGen2 = oldTree?.secondGeneration?.length || 0;
      const oldGen3 = oldTree?.thirdGeneration?.length || 0;
      const newGen1 = newTree.firstGeneration.length;
      const newGen2 = newTree.secondGeneration.length;
      const newGen3 = newTree.thirdGeneration.length;
      
      const hasChange = oldGen1 !== newGen1 || oldGen2 !== newGen2 || oldGen3 !== newGen3;
      
      await kv.set(`user:${userId}:referral_tree`, { ...newTree, lastUpdated: toTaiwanISOString(getTaiwanNow()) });
      await kv.set(`user:${userId}:referral_stats`, {
        totalReferrals: newGen1 + newGen2 + newGen3,
        firstGenCount: newGen1, secondGenCount: newGen2, thirdGenCount: newGen3,
        lastUpdated: toTaiwanISOString(getTaiwanNow())
      });
      
      treesUpdated++;
      
      if (hasChange) {
        const userName = profileMap[userId]?.name || '未知用戶';
        console.log(`🔄 ${userName}: 1代 ${oldGen1}→${newGen1}, 2代 ${oldGen2}→${newGen2}, 3代 ${oldGen3}→${newGen3}`);
        treeChanges.push({ userId, userName, before: { gen1: oldGen1, gen2: oldGen2, gen3: oldGen3 }, after: { gen1: newGen1, gen2: newGen2, gen3: newGen3 } });
      }
    }
    
    console.log(`\n📊 步驟 4 完成: 更新 ${treesUpdated} 棵推薦樹，其中 ${treeChanges.length} 棵有變化`);
    
    // ===== 步驟 5: 補發缺失的二代、三代獎勵 =====
    console.log('\n步驟 5: 補發缺失的二代、三代獎勵...');
    
    let rewardsIssued = 0;
    let schedulesCreated = 0;
    const rewardDetails: any[] = [];
    
    for (const profile of profiles) {
      if (!profile.referredByUserId || profile.registrationStep < 3) continue;
      
      const gen1ReferrerId = profile.referredByUserId;
      const gen1RB = allReferredByMap[gen1ReferrerId];
      if (!gen1RB?.referrerUserId) continue;
      
      const gen2ReferrerId = gen1RB.referrerUserId;
      const gen2Profile = profileMap[gen2ReferrerId];
      
      if (gen2Profile) {
        const gen2History = await kv.get(`user:${gen2ReferrerId}:reward_history`) || [];
        const alreadyIssued = gen2History.some((r: any) => r.type === 'referral_gen2_month1' && r.referee?.userId === profile.id);
        
        if (!alreadyIssued) {
          console.log(`💰 補發二代獎勵: ${gen2Profile.name} ← ${profile.name}`);
          
          const rewardsKey = `user:${gen2ReferrerId}:rewards`;
          const rewards = await kv.get(rewardsKey) || { availableRewards: 0, pendingRewards: 0, withdrawnRewards: 0, totalEarned: 0 };
          rewards.availableRewards += REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH;
          rewards.totalEarned += REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH;
          rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
          await kv.set(rewardsKey, rewards);
          
          gen2History.unshift({
            id: `reward_repair_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'referral_gen2_month1',
            amount: REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH,
            balance: rewards.availableRewards + rewards.pendingRewards,
            referee: { userId: profile.id, userName: profile.name, userReferralCode: profile.referralCode },
            generation: 2, monthNumber: 1,
            issuedAt: toTaiwanISOString(getTaiwanNow()),
            description: `二代-${profile.name}-${profile.referralCode || 'N/A'}-第1個月`
          });
          if (gen2History.length > 200) gen2History.length = 200;
          await kv.set(`user:${gen2ReferrerId}:reward_history`, gen2History);
          
          rewardsIssued++;
          rewardDetails.push({ receiver: gen2Profile.name, receiverId: gen2ReferrerId, referee: profile.name, refereeId: profile.id, generation: 2 });
          
          if (profile.activeUntil) {
            const activeUntil = new Date(profile.activeUntil);
            const startDate = new Date(activeUntil);
            startDate.setDate(startDate.getDate() - 364);
            
            for (let month = 2; month <= 12; month++) {
              const scheduledDate = new Date(startDate);
              scheduledDate.setMonth(scheduledDate.getMonth() + (month - 1));
              const scheduledDateStr = toTaiwanDateString(scheduledDate);
              const scheduleId = `schedule_repair_${Date.now()}_${Math.random().toString(36).substring(7)}`;
              
              await kv.set(`reward_schedule:${scheduleId}`, {
                id: scheduleId, userId: gen2ReferrerId,
                referee: { userId: profile.id, userName: profile.name, userReferralCode: profile.referralCode },
                generation: 2, monthNumber: month, amount: REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH,
                scheduledDate: scheduledDateStr, status: 'pending',
                createdAt: toTaiwanISOString(getTaiwanNow()), completedAt: null, cancellationReason: null
              });
              
              const dateIndexKey = `reward_schedules_by_date:${scheduledDateStr}`;
              const dateIndex = await kv.get(dateIndexKey) || [];
              dateIndex.push(scheduleId);
              await kv.set(dateIndexKey, dateIndex);
              schedulesCreated++;
            }
          }
        }
      }
      
      // 三代
      const gen2RB = allReferredByMap[gen2ReferrerId];
      if (!gen2RB?.referrerUserId) continue;
      
      const gen3ReferrerId = gen2RB.referrerUserId;
      const gen3Profile = profileMap[gen3ReferrerId];
      
      if (gen3Profile) {
        const gen3History = await kv.get(`user:${gen3ReferrerId}:reward_history`) || [];
        const alreadyIssued = gen3History.some((r: any) => r.type === 'referral_gen3_month1' && r.referee?.userId === profile.id);
        
        if (!alreadyIssued) {
          console.log(`💰 補發三代獎勵: ${gen3Profile.name} ← ${profile.name}`);
          
          const rewardsKey = `user:${gen3ReferrerId}:rewards`;
          const rewards = await kv.get(rewardsKey) || { availableRewards: 0, pendingRewards: 0, withdrawnRewards: 0, totalEarned: 0 };
          rewards.availableRewards += REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH;
          rewards.totalEarned += REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH;
          rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
          await kv.set(rewardsKey, rewards);
          
          gen3History.unshift({
            id: `reward_repair_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'referral_gen3_month1',
            amount: REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH,
            balance: rewards.availableRewards + rewards.pendingRewards,
            referee: { userId: profile.id, userName: profile.name, userReferralCode: profile.referralCode },
            generation: 3, monthNumber: 1,
            issuedAt: toTaiwanISOString(getTaiwanNow()),
            description: `三代-${profile.name}-${profile.referralCode || 'N/A'}-第1個月`
          });
          if (gen3History.length > 200) gen3History.length = 200;
          await kv.set(`user:${gen3ReferrerId}:reward_history`, gen3History);
          
          rewardsIssued++;
          rewardDetails.push({ receiver: gen3Profile.name, receiverId: gen3ReferrerId, referee: profile.name, refereeId: profile.id, generation: 3 });
          
          if (profile.activeUntil) {
            const activeUntil = new Date(profile.activeUntil);
            const startDate = new Date(activeUntil);
            startDate.setDate(startDate.getDate() - 364);
            
            for (let month = 2; month <= 12; month++) {
              const scheduledDate = new Date(startDate);
              scheduledDate.setMonth(scheduledDate.getMonth() + (month - 1));
              const scheduledDateStr = toTaiwanDateString(scheduledDate);
              const scheduleId = `schedule_repair_${Date.now()}_${Math.random().toString(36).substring(7)}`;
              
              await kv.set(`reward_schedule:${scheduleId}`, {
                id: scheduleId, userId: gen3ReferrerId,
                referee: { userId: profile.id, userName: profile.name, userReferralCode: profile.referralCode },
                generation: 3, monthNumber: month, amount: REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH,
                scheduledDate: scheduledDateStr, status: 'pending',
                createdAt: toTaiwanISOString(getTaiwanNow()), completedAt: null, cancellationReason: null
              });
              
              const dateIndexKey = `reward_schedules_by_date:${scheduledDateStr}`;
              const dateIndex = await kv.get(dateIndexKey) || [];
              dateIndex.push(scheduleId);
              await kv.set(dateIndexKey, dateIndex);
              schedulesCreated++;
            }
          }
        }
      }
    }
    
    console.log(`\n📊 步驟 5 完成: 補發 ${rewardsIssued} 筆首月獎勵，補建 ${schedulesCreated} 筆後續排程`);
    
    // 保存修復日誌
    const logKey = `repair_log:fix_missing_referred_by:${Date.now()}`;
    await kv.set(logKey, {
      type: 'fix_missing_referred_by',
      timestamp: toTaiwanISOString(getTaiwanNow()),
      summary: { referredByCreated: createdCount, treesUpdated, treesChanged: treeChanges.length, rewardsIssued, schedulesCreated },
      treeChanges, rewardDetails
    });
    
    console.log('========================================');
    console.log('✅ 修復完成！');
    console.log(`   建立 referred_by: ${createdCount} 筆`);
    console.log(`   更新推薦樹: ${treesUpdated} 棵（${treeChanges.length} 棵有變化）`);
    console.log(`   補發獎勵: ${rewardsIssued} 筆`);
    console.log(`   補建排程: ${schedulesCreated} 筆`);
    console.log('========================================');
    
    return c.json({
      success: true, dryRun: false,
      summary: { referredByCreated: createdCount, treesUpdated, treesChanged: treeChanges.length, rewardsIssued, schedulesCreated },
      treeChanges, rewardDetails
    });
    
  } catch (error: any) {
    console.error('❌ 修復失敗:', error);
    return c.json({ success: false, error: { message: '修復失敗', details: error.message } }, 500);
  }
});

/**
 * 🔧 修复指定用户的推荐树关系（包括往上三代）
 * POST /data-repair/fix-specific-user/:userId
 * 
 * 用于修复因 referred_by 记录缺失导致的推荐树不完整问题
 * 
 * 使用场景：
 * - 用户注册时，其直接推荐人的 referred_by 记录不存在
 * - 导致该用户只出现在直接推荐人的一代树中
 * - 没有出现在二代、三代推荐人的树中
 */
dataRepair.post('/fix-specific-user/:userId', async (c) => {
  const userId = c.req.param('userId');
  
  console.log('========================================');
  console.log(`🔧 修复指定用户的推荐树关系: ${userId}`);
  console.log('========================================');
  
  try {
    // 1. 获取用户 profile
    const profile = await kv.get(`user:${userId}:profile`);
    if (!profile) {
      return c.json({ 
        success: false, 
        error: { message: '用户不存在' } 
      }, 404);
    }
    
    console.log(`✓ 用户信息: ${profile.name} (${profile.email})`);
    
    // 2. 获取 referred_by
    const referredBy = await kv.get(`user:${userId}:referred_by`);
    if (!referredBy) {
      return c.json({ 
        success: false, 
        error: { message: '该用户没有推荐人，无需修复' } 
      }, 400);
    }
    
    console.log(`✓ 推荐人: ${referredBy.referrerUserName} (${referredBy.referrerUserId})`);
    
    // 3. 构建新成员信息
    const newMember = {
      userId: profile.id,
      userName: profile.name,
      userReferralCode: profile.referralCode,
      listingId: null,
      listingName: null,
      serviceType: null,
      city: null,
      activeUntil: profile.activeUntil,
      isActive: profile.activeUntil ? new Date(profile.activeUntil) >= getTaiwanNow() : false,
      createdAt: profile.paidAt || profile.createdAt
    };
    
    const results = [];
    
    // 4. 更新一代推荐人的树
    console.log('\\n步骤 1: 检查一代推荐树...');
    const gen1Id = referredBy.referrerUserId;
    const gen1Tree = await kv.get(`user:${gen1Id}:referral_tree`) || {
      firstGeneration: [],
      secondGeneration: [],
      thirdGeneration: []
    };
    
    const existsInGen1 = gen1Tree.firstGeneration?.some((m: any) => m.userId === userId);
    if (!existsInGen1) {
      gen1Tree.firstGeneration = gen1Tree.firstGeneration || [];
      gen1Tree.firstGeneration.push({ ...newMember, referrer: null });
      gen1Tree.lastUpdated = toTaiwanISOString(getTaiwanNow());
      await kv.set(`user:${gen1Id}:referral_tree`, gen1Tree);
      console.log(`✅ 已添加到一代推荐树: ${referredBy.referrerUserName}`);
      results.push({ generation: 1, userId: gen1Id, userName: referredBy.referrerUserName, action: 'added' });
    } else {
      console.log(`ℹ️  已存在于一代推荐树，跳过`);
      results.push({ generation: 1, userId: gen1Id, userName: referredBy.referrerUserName, action: 'skipped' });
    }
    
    // 5. 更新二代推荐人的树
    console.log('\\n步骤 2: 检查二代推荐树...');
    const gen1RB = await kv.get(`user:${gen1Id}:referred_by`);
    if (gen1RB?.referrerUserId) {
      const gen2Id = gen1RB.referrerUserId;
      const gen2Profile = await kv.get(`user:${gen2Id}:profile`);
      
      if (gen2Profile) {
        console.log(`✓ 找到二代推荐人: ${gen2Profile.name} (${gen2Id})`);
        
        const gen2Tree = await kv.get(`user:${gen2Id}:referral_tree`) || {
          firstGeneration: [],
          secondGeneration: [],
          thirdGeneration: []
        };
        
        const existsInGen2 = gen2Tree.secondGeneration?.some((m: any) => m.userId === userId);
        if (!existsInGen2) {
          gen2Tree.secondGeneration = gen2Tree.secondGeneration || [];
          gen2Tree.secondGeneration.push({
            ...newMember,
            referrer: {
              userId: gen1Id,
              userName: referredBy.referrerUserName,
              userReferralCode: referredBy.referralCode
            }
          });
          gen2Tree.lastUpdated = toTaiwanISOString(getTaiwanNow());
          await kv.set(`user:${gen2Id}:referral_tree`, gen2Tree);
          
          // 更新推荐统计
          const gen2Stats = await kv.get(`user:${gen2Id}:referral_stats`) || {
            totalReferrals: 0,
            firstGenCount: 0,
            secondGenCount: 0,
            thirdGenCount: 0
          };
          gen2Stats.secondGenCount = gen2Tree.secondGeneration.length;
          gen2Stats.totalReferrals = (gen2Tree.firstGeneration?.length || 0) + 
                                     gen2Tree.secondGeneration.length + 
                                     (gen2Tree.thirdGeneration?.length || 0);
          gen2Stats.lastUpdated = toTaiwanISOString(getTaiwanNow());
          await kv.set(`user:${gen2Id}:referral_stats`, gen2Stats);
          
          console.log(`✅ 已添加到二代推荐树: ${gen2Profile.name}`);
          results.push({ generation: 2, userId: gen2Id, userName: gen2Profile.name, action: 'added' });
        } else {
          console.log(`ℹ️  已存在于二代推荐树，跳过`);
          results.push({ generation: 2, userId: gen2Id, userName: gen2Profile.name, action: 'skipped' });
        }
        
        // 6. 更新三代推荐人的树
        console.log('\\n步骤 3: 检查三代推荐树...');
        const gen2RB = await kv.get(`user:${gen2Id}:referred_by`);
        if (gen2RB?.referrerUserId) {
          const gen3Id = gen2RB.referrerUserId;
          const gen3Profile = await kv.get(`user:${gen3Id}:profile`);
          
          if (gen3Profile) {
            console.log(`✓ 找到三代推荐人: ${gen3Profile.name} (${gen3Id})`);
            
            const gen3Tree = await kv.get(`user:${gen3Id}:referral_tree`) || {
              firstGeneration: [],
              secondGeneration: [],
              thirdGeneration: []
            };
            
            const existsInGen3 = gen3Tree.thirdGeneration?.some((m: any) => m.userId === userId);
            if (!existsInGen3) {
              gen3Tree.thirdGeneration = gen3Tree.thirdGeneration || [];
              gen3Tree.thirdGeneration.push({
                ...newMember,
                referrer: {
                  userId: gen1Id,
                  userName: referredBy.referrerUserName,
                  userReferralCode: referredBy.referralCode
                }
              });
              gen3Tree.lastUpdated = toTaiwanISOString(getTaiwanNow());
              await kv.set(`user:${gen3Id}:referral_tree`, gen3Tree);
              
              // 更新推荐统计
              const gen3Stats = await kv.get(`user:${gen3Id}:referral_stats`) || {
                totalReferrals: 0,
                firstGenCount: 0,
                secondGenCount: 0,
                thirdGenCount: 0
              };
              gen3Stats.thirdGenCount = gen3Tree.thirdGeneration.length;
              gen3Stats.totalReferrals = (gen3Tree.firstGeneration?.length || 0) + 
                                         (gen3Tree.secondGeneration?.length || 0) + 
                                         gen3Tree.thirdGeneration.length;
              gen3Stats.lastUpdated = toTaiwanISOString(getTaiwanNow());
              await kv.set(`user:${gen3Id}:referral_stats`, gen3Stats);
              
              console.log(`✅ 已添加到三代推荐树: ${gen3Profile.name}`);
              results.push({ generation: 3, userId: gen3Id, userName: gen3Profile.name, action: 'added' });
            } else {
              console.log(`ℹ️  已存在于三代推荐树，跳过`);
              results.push({ generation: 3, userId: gen3Id, userName: gen3Profile.name, action: 'skipped' });
            }
          } else {
            console.log(`⚠️  找不到三代推荐人的 profile: ${gen3Id}`);
          }
        } else {
          console.log(`ℹ️  二代推荐人没有上级推荐人，无三代关系`);
        }
      } else {
        console.log(`⚠️  找不到二代推荐人的 profile: ${gen2Id}`);
      }
    } else {
      console.log(`ℹ️  一代推荐人没有上级推荐人，无二代、三代关系`);
    }
    
    // 保存修复日志
    const logKey = `repair_log:fix_specific_user:${userId}:${Date.now()}`;
    await kv.set(logKey, {
      type: 'fix_specific_user',
      userId,
      userName: profile.name,
      timestamp: toTaiwanISOString(getTaiwanNow()),
      results
    });
    
    console.log('========================================');
    console.log('✅ 修复完成！');
    console.log(`   用户: ${profile.name}`);
    console.log(`   操作: ${results.filter(r => r.action === 'added').length} 项添加, ${results.filter(r => r.action === 'skipped').length} 项跳过`);
    console.log('========================================');
    
    return c.json({
      success: true,
      user: {
        userId,
        userName: profile.name
      },
      results
    });
    
  } catch (error: any) {
    console.error('========================================');
    console.error('❌ 修复失败');
    console.error('========================================');
    console.error(error);
    
    return c.json({
      success: false,
      error: { message: '修复失败', details: error.message }
    }, 500);
  }
});

export default dataRepair;