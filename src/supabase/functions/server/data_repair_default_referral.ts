/**
 * 數據修復腳本：補救使用默認推薦碼的用戶
 * 
 * 問題：使用 asa899869 推薦碼的用戶，因為 complete-registration 的條件判斷錯誤
 * 導致推薦關係、任務、獎勵都沒有發放和建立
 * 
 * 此腳本會：
 * 1. 創建 user:{userId}:referred_by 記錄
 * 2. 更新推薦人的推薦樹（一代、二代、三代）
 * 3. 發放推薦人的獎勵（補發首月獎勵）
 * 4. 創建獎勵排程（2-12 月）
 * 5. 更新推薦人的統計
 * 6. 更新推薦人的任務進度
 * 7. 更新推薦人的月度日誌
 */

import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { 
  getTaiwanNow, 
  toTaiwanISOString,
  toTaiwanDateString 
} from './date_utils.ts';
import { REWARD_CONFIG } from './reward_config.ts';
import { 
  updateTaskProgress, 
  updateReferralMonthlyLog 
} from './task_helpers.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const repairDefaultReferral = new Hono();

/**
 * 🔐 認證中間件：檢查是否為管理員
 */
const requireAdmin = async (c: any, next: any) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: { message: '需要管理員權限' }
      }, 401);
    }
    
    const token = authHeader.substring(7);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return c.json({
        success: false,
        error: { message: 'Token 無效' }
      }, 401);
    }
    
    const profile = await kv.get(`user:${user.id}:profile`);
    
    if (!profile || !profile.isAdmin) {
      return c.json({
        success: false,
        error: { message: '需要管理員權限' }
      }, 403);
    }
    
    await next();
  } catch (error: any) {
    console.error('[Repair] 認證失敗:', error);
    return c.json({
      success: false,
      error: { message: '認證失敗' }
    }, 500);
  }
};

/**
 * 發放首月獎勵
 */
async function issueImmediateReward(
  receiverUserId: string,
  refereeUserId: string,
  refereeName: string,
  refereeCode: string,
  generation: number,
  monthNumber: number,
  amount: number
) {
  console.log(`💰 補發首月獎勵: 用戶=${receiverUserId}, 第${generation}代, ${amount}P`);
  
  // 1. 更新獎勵統計
  const rewardsKey = `user:${receiverUserId}:rewards`;
  const rewards = await kv.get(rewardsKey) || {
    availableRewards: 0,
    pendingRewards: 0,
    withdrawnRewards: 0,
    totalEarned: 0
  };
  
  rewards.availableRewards += amount;
  rewards.totalEarned += amount;
  rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
  
  await kv.set(rewardsKey, rewards);
  
  // 2. 記錄到獎勵歷史
  const historyKey = `user:${receiverUserId}:reward_history`;
  const history = await kv.get(historyKey) || [];
  
  const generationText = generation === 1 ? '一代' : generation === 2 ? '二代' : '三代';
  const description = `${generationText}-${refereeName}-${refereeCode}-第${monthNumber}個月`;
  const balanceAfterTransaction = rewards.availableRewards + rewards.pendingRewards;
  
  history.unshift({
    id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: `referral_gen${generation}_month${monthNumber}`,
    amount,
    balance: balanceAfterTransaction,
    referee: {
      userId: refereeUserId,
      userName: refereeName,
      userReferralCode: refereeCode
    },
    generation,
    monthNumber,
    issuedAt: toTaiwanISOString(getTaiwanNow()),
    description
  });
  
  if (history.length > 200) {
    history.length = 200;
  }
  
  await kv.set(historyKey, history);
  
  console.log(`   ✅ 獎勵已補發: ${description}`);
}

/**
 * 創建後續排程
 */
async function createRewardSchedules(
  receiverUserId: string,
  refereeUserId: string,
  refereeName: string,
  refereeCode: string,
  generation: number,
  subscriptionEndDate: Date
) {
  console.log(`📅 創建獎勵排程: 用戶=${receiverUserId}, 第${generation}代, 共11筆`);
  
  const startDate = new Date(subscriptionEndDate);
  startDate.setDate(startDate.getDate() - 364);
  
  for (let month = 2; month <= 12; month++) {
    const scheduledDate = new Date(startDate);
    scheduledDate.setMonth(scheduledDate.getMonth() + (month - 1));
    const scheduledDateStr = toTaiwanDateString(scheduledDate);
    
    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const schedule = {
      id: scheduleId,
      userId: receiverUserId,
      referee: {
        userId: refereeUserId,
        userName: refereeName,
        userReferralCode: refereeCode
      },
      generation,
      monthNumber: month,
      amount: 10,
      scheduledDate: scheduledDateStr,
      status: 'pending',
      createdAt: toTaiwanISOString(getTaiwanNow()),
      completedAt: null,
      cancellationReason: null
    };
    
    await kv.set(`reward_schedule:${scheduleId}`, schedule);
    
    const dateIndexKey = `reward_schedules_by_date:${scheduledDateStr}`;
    const dateIndex = await kv.get(dateIndexKey) || [];
    dateIndex.push(scheduleId);
    await kv.set(dateIndexKey, dateIndex);
    
    console.log(`   ✅ 排程已創建: 第${month}個月, 發放日=${scheduledDateStr}`);
  }
}

/**
 * 更新推薦樹
 */
async function updateReferralTree(
  userId: string,
  newMember: {
    userId: string;
    userName: string;
    userReferralCode: string;
    activeUntil: string;
    createdAt: string;
  },
  generation: number,
  referrer?: {
    userId: string;
    userName: string;
    userReferralCode: string | null;
  }
) {
  const key = `user:${userId}:referral_tree`;
  const tree = await kv.get(key) || {
    firstGeneration: [],
    secondGeneration: [],
    thirdGeneration: []
  };
  
  const memberInfo = {
    userId: newMember.userId,
    userName: newMember.userName,
    userReferralCode: newMember.userReferralCode,
    listingId: null,
    listingName: null,
    serviceType: null,
    city: null,
    activeUntil: newMember.activeUntil,
    isActive: true,
    referrer: referrer || null,
    createdAt: newMember.createdAt
  };
  
  if (generation === 1) {
    tree.firstGeneration.push(memberInfo);
  } else if (generation === 2) {
    tree.secondGeneration.push(memberInfo);
  } else if (generation === 3) {
    tree.thirdGeneration.push(memberInfo);
  }
  
  tree.lastUpdated = toTaiwanISOString(getTaiwanNow());
  await kv.set(key, tree);
  
  console.log(`✅ 更新推薦樹: ${userId} - 第${generation}代 +1 (${newMember.userName}-${newMember.userReferralCode})`);
}

/**
 * 更新推薦統計
 */
async function updateReferralStats(userId: string, generation: number) {
  const key = `user:${userId}:referral_stats`;
  const stats = await kv.get(key) || {
    totalReferrals: 0,
    firstGenCount: 0,
    secondGenCount: 0,
    thirdGenCount: 0
  };
  
  stats.totalReferrals += 1;
  
  if (generation === 1) stats.firstGenCount += 1;
  else if (generation === 2) stats.secondGenCount += 1;
  else if (generation === 3) stats.thirdGenCount += 1;
  
  stats.lastUpdated = toTaiwanISOString(getTaiwanNow());
  await kv.set(key, stats);
  
  console.log(`✅ 更新推薦統計: user=${userId}, gen=${generation}, total=${stats.totalReferrals}`);
}

/**
 * POST /repair-default-referral/:userId
 * 修復使用默認推薦碼的用戶
 */
repairDefaultReferral.post('/:userId', requireAdmin, async (c) => {
  const targetUserId = c.req.param('userId');
  
  console.log(`\n========== 🔧 開始修復用戶推薦關係 ==========`);
  console.log(`目標用戶: ${targetUserId}`);
  
  try {
    // 1. 獲取用戶資料
    console.log('\n步驟 1: 獲取用戶資料...');
    const profile = await kv.get(`user:${targetUserId}:profile`);
    
    if (!profile) {
      console.error('❌ 用戶不存在');
      return c.json({
        success: false,
        error: { message: '用戶不存在' }
      }, 404);
    }
    
    console.log(`✓ 用戶姓名: ${profile.name}`);
    console.log(`✓ 推薦碼: ${profile.referralCode}`);
    console.log(`✓ 使用的推薦碼: ${profile.referredByCode || '無'}`);
    console.log(`✓ 推薦人 ID: ${profile.referredByUserId || '無'}`);
    console.log(`✓ 註冊步驟: ${profile.registrationStep}`);
    console.log(`✓ 帳號狀態: ${profile.accountStatus}`);
    
    // 2. 驗證狀態
    if (profile.registrationStep !== 3) {
      console.error('❌ 用戶尚未完成註冊');
      return c.json({
        success: false,
        error: { message: '用戶尚未完成註冊' }
      }, 400);
    }
    
    if (!profile.referredByUserId || !profile.referredByCode) {
      console.error('❌ 用戶沒有推薦關係');
      return c.json({
        success: false,
        error: { message: '用戶沒有推薦關係' }
      }, 400);
    }
    
    // 3. 檢查是否已經修復過
    const existingReferredBy = await kv.get(`user:${targetUserId}:referred_by`);
    if (existingReferredBy) {
      console.log('⚠️ 用戶已有 referred_by 記錄，可能已經修復過');
      return c.json({
        success: false,
        error: { message: '用戶已有推薦關係記錄，無需修復' }
      }, 400);
    }
    
    const referredByUserId = profile.referredByUserId;
    const referredByCode = profile.referredByCode;
    
    console.log(`\n步驟 2: 獲取推薦人資料...`);
    const gen1Profile = await kv.get(`user:${referredByUserId}:profile`);
    
    if (!gen1Profile) {
      console.error('❌ 推薦人不存在');
      return c.json({
        success: false,
        error: { message: '推薦人不存在' }
      }, 404);
    }
    
    console.log(`✓ 推薦人姓名: ${gen1Profile.name}`);
    console.log(`✓ 推薦人推薦碼: ${gen1Profile.referralCode}`);
    
    // 4. 創建 referred_by 記錄
    console.log(`\n步驟 3: 創建 referred_by 記錄...`);
    await kv.set(`user:${targetUserId}:referred_by`, {
      referrerUserId: referredByUserId,
      referrerListingId: profile.referredByListingId || null,
      referrerUserName: gen1Profile.name,
      referrerListingName: null,
      referrerReferralCode: gen1Profile.referralCode,
      referredAt: profile.paidAt || profile.createdAt,
      generation: 1
    });
    
    console.log(`✅ referred_by 記錄已創建`);
    
    // 5. 準備新成員信息
    const paidAt = profile.paidAt || profile.createdAt;
    const newMember = {
      userId: targetUserId,
      userName: profile.name,
      userReferralCode: profile.referralCode,
      activeUntil: profile.activeUntil,
      createdAt: paidAt
    };
    
    const newMemberDirectReferrer = {
      userId: referredByUserId,
      userName: gen1Profile.name,
      userReferralCode: gen1Profile.referralCode
    };
    
    // 6. 處理一代推薦關係
    console.log(`\n步驟 4: 處理一代推薦關係...`);
    
    // 發放一代首月獎勵
    await issueImmediateReward(
      referredByUserId,
      targetUserId,
      profile.name,
      profile.referralCode,
      1,
      1,
      REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH
    );
    
    // 創建一代後續排程
    const activeUntil = new Date(profile.activeUntil);
    await createRewardSchedules(
      referredByUserId,
      targetUserId,
      profile.name,
      profile.referralCode,
      1,
      activeUntil
    );
    
    // 更新一代推薦樹
    await updateReferralTree(
      referredByUserId,
      newMember,
      1,
      null
    );
    
    // 更新一代推薦統計
    await updateReferralStats(referredByUserId, 1);
    
    // 更新一代任務進度
    await updateTaskProgress(referredByUserId, paidAt);
    
    // 更新一代月度日誌
    await updateReferralMonthlyLog(
      referredByUserId,
      {
        userId: targetUserId,
        userName: profile.name,
        userReferralCode: profile.referralCode,
        listingId: null,
        listingName: null,
        referrer: null
      },
      paidAt
    );
    
    console.log(`✅ 一代推薦關係處理完成`);
    
    // 7. 處理二代推薦關係
    console.log(`\n步驟 5: 檢查二代推薦關係...`);
    const gen1ReferredBy = await kv.get(`user:${referredByUserId}:referred_by`);
    
    if (gen1ReferredBy && gen1ReferredBy.referrerUserId) {
      const gen2UserId = gen1ReferredBy.referrerUserId;
      const gen2Profile = await kv.get(`user:${gen2UserId}:profile`);
      
      if (gen2Profile) {
        console.log(`✓ 找到二代推薦人: ${gen2Profile.name}`);
        
        // 發放二代首月獎勵
        await issueImmediateReward(
          gen2UserId,
          targetUserId,
          profile.name,
          profile.referralCode,
          2,
          1,
          REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH
        );
        
        // 創建二代後續排程
        await createRewardSchedules(
          gen2UserId,
          targetUserId,
          profile.name,
          profile.referralCode,
          2,
          activeUntil
        );
        
        // 更新二代推薦樹
        await updateReferralTree(
          gen2UserId,
          newMember,
          2,
          newMemberDirectReferrer
        );
        
        // 更新二代推薦統計
        await updateReferralStats(gen2UserId, 2);
        
        console.log(`✅ 二代推薦關係處理完成`);
        
        // 8. 處理三代推薦關係
        console.log(`\n步驟 6: 檢查三代推薦關係...`);
        const gen2ReferredBy = await kv.get(`user:${gen2UserId}:referred_by`);
        
        if (gen2ReferredBy && gen2ReferredBy.referrerUserId) {
          const gen3UserId = gen2ReferredBy.referrerUserId;
          const gen3Profile = await kv.get(`user:${gen3UserId}:profile`);
          
          if (gen3Profile) {
            console.log(`✓ 找到三代推薦人: ${gen3Profile.name}`);
            
            // 發放三代首月獎勵
            await issueImmediateReward(
              gen3UserId,
              targetUserId,
              profile.name,
              profile.referralCode,
              3,
              1,
              REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH
            );
            
            // 創建三代後續排程
            await createRewardSchedules(
              gen3UserId,
              targetUserId,
              profile.name,
              profile.referralCode,
              3,
              activeUntil
            );
            
            // 更新三代推薦樹
            await updateReferralTree(
              gen3UserId,
              newMember,
              3,
              newMemberDirectReferrer
            );
            
            // 更新三代推薦統計
            await updateReferralStats(gen3UserId, 3);
            
            console.log(`✅ 三代推薦關係處理完成`);
          }
        } else {
          console.log(`ℹ️ 無三代推薦人`);
        }
      }
    } else {
      console.log(`ℹ️ 無二代推薦人`);
    }
    
    console.log(`\n========== ✅ 修復完成 ==========`);
    
    return c.json({
      success: true,
      message: '推薦關係修復成功',
      data: {
        userId: targetUserId,
        userName: profile.name,
        referredByCode,
        referredByUserId,
        referrerName: gen1Profile.name,
        repaired: {
          referred_by: true,
          gen1: true,
          gen2: !!gen1ReferredBy?.referrerUserId,
          gen3: false  // 需要手動檢���
        }
      }
    });
    
  } catch (error: any) {
    console.error(`\n========== ❌ 修復失敗 ==========`);
    console.error('錯誤:', error);
    
    return c.json({
      success: false,
      error: { message: error.message || '修復失敗' }
    }, 500);
  }
});

export default repairDefaultReferral;
