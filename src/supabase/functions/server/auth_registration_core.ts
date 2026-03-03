/**
 * 註冊核心函數模組
 * 
 * 提供統一的註冊完成邏輯，避免程式碼重複
 * 被 Webhook 和 API 端點共同調用
 * 
 * 設計原則：
 * - 冪等性：可重複調用而不產生副作用
 * - 完整性：處理所有推薦關係數據
 * - 可靠性：錯誤處理不中斷主流程
 */

import * as kv from "./kv_store.tsx";
import { REWARD_CONFIG } from "./reward_config.ts";
import { 
  getTaiwanNow, 
  toTaiwanISOString,
  toTaiwanDateString
} from './date_utils.ts';
import { 
  updateTaskProgress, 
  updateReferralMonthlyLog 
} from "./task_helpers.ts";

/**
 * 生成推薦碼（3個小寫英文字母 + 6個數字）
 * 格式：abc123456
 */
function generateReferralCode(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  
  let code = '';
  
  // 3個小寫英文字母
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  // 6個數字
  for (let i = 0; i < 6; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return code;
}

/**
 * 立即發放首月獎勵
 */
async function issueImmediateReward(
  receiverUserId: string,      // 接收獎勵的用戶ID（推薦人）
  refereeUserId: string,       // 被推薦人用戶ID
  refereeName: string,         // 被推薦人姓名
  refereeCode: string,         // 被推薦人推薦碼
  generation: number,          // 第幾代（1/2/3）
  monthNumber: number,         // 第幾個月（始終為 1）
  amount: number               // 獎勵金額（10P）
) {
  console.log(`💰 發放首月獎勵: 用戶=${receiverUserId}, 第${generation}代, ${amount}P`);
  
  try {
    // 1. 更新獎勵統計數據（SSOT）
    const rewardsKey = `user:${receiverUserId}:rewards`;
    const rewards = await kv.get(rewardsKey) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0
    };
    
    rewards.availableRewards += amount;  // 可提領增加
    rewards.totalEarned += amount;       // 總累積增加
    rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
    
    await kv.set(rewardsKey, rewards);
    
    console.log(`   ✅ 獎勵統計已更新: 可提領=${rewards.availableRewards}P, 總累積=${rewards.totalEarned}P`);
    
    // 2. 記錄到獎勵歷史
    const historyKey = `user:${receiverUserId}:reward_history`;
    const history = await kv.get(historyKey) || [];
    
    // 正確格式：一代-被推薦者姓名-被推薦者推薦碼-第1個月
    const generationText = generation === 1 ? '一代' : generation === 2 ? '二代' : '三代';
    const description = `${generationText}-${refereeName}-${refereeCode}-第${monthNumber}個月`;
    
    // 計算交易後餘額
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
    
    // 只保留最近 200 筆
    if (history.length > 200) {
      history.length = 200;
    }
    
    await kv.set(historyKey, history);
    
    console.log(`   ✅ 獎勵已發放: ${description}`);
  } catch (error: any) {
    console.error(`   ❌ 發放獎勵失敗: ${error.message}`);
    throw error;
  }
}

/**
 * 創建後續 11 個月的獎勵排程
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
  
  try {
    // 計算付款日（訂閱結束日 - 364天）
    const startDate = new Date(subscriptionEndDate);
    startDate.setDate(startDate.getDate() - 364);
    
    // 創建第 2~12 個月的排程
    for (let month = 2; month <= 12; month++) {
      // 計算發放日期：付款日 + (month-1) 個月
      const scheduledDate = new Date(startDate);
      scheduledDate.setMonth(scheduledDate.getMonth() + (month - 1));
      const scheduledDateStr = toTaiwanDateString(scheduledDate);  // YYYY-MM-DD
      
      // 生成排程 ID
      const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // 創建排程記錄
      const schedule = {
        id: scheduleId,
        userId: receiverUserId,  // 接收獎勵的用戶ID
        referee: {
          userId: refereeUserId,
          userName: refereeName,
          userReferralCode: refereeCode
        },
        generation,
        monthNumber: month,
        amount: 10,
        scheduledDate: scheduledDateStr,
        status: 'pending',  // pending | completed | cancelled
        createdAt: toTaiwanISOString(getTaiwanNow()),
        completedAt: null,
        cancellationReason: null
      };
      
      // 存儲排程記錄
      await kv.set(`reward_schedule:${scheduleId}`, schedule);
      
      // 添加到日期索引
      const dateIndexKey = `reward_schedules_by_date:${scheduledDateStr}`;
      const dateIndex = await kv.get(dateIndexKey) || [];
      dateIndex.push(scheduleId);
      await kv.set(dateIndexKey, dateIndex);
      
      console.log(`   ✅ 排程已創建: 第${month}個月, 發放日=${scheduledDateStr}`);
    }
    
    console.log(`   ✅ 總計創建 11 筆排程`);
  } catch (error: any) {
    console.error(`   ❌ 創建排程失敗: ${error.message}`);
    throw error;
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
async function updateReferralStats(
  userId: string,
  generation: number
) {
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
 * 核心函數：完成用戶註冊
 * 
 * 此函數被 Webhook 和 API 端點共同調用，實現統一的註冊邏輯
 * 
 * @param userId - 用戶 ID
 * @returns 成功返回 { success: true, data: {...} }，失敗返回 { success: false, error: string }
 * 
 * 冪等性保護：
 * - 如果用戶已經完成註冊（Step 3），直接返回成功
 * - 避免重複處理推薦關係和發放獎勵
 */
export async function completeUserRegistration(userId: string): Promise<{
  success: boolean;
  data?: {
    referralCode: string;
    activeUntil: string;
    accountStatus: string;
  };
  error?: string;
}> {
  try {
    console.log(`[completeUserRegistration] 開始處理用戶: ${userId}`);
    
    // 1. 獲取用戶資料
    const profile = await kv.get(`user:${userId}:profile`);
    
    if (!profile) {
      console.error('[completeUserRegistration] 用戶資料不存在:', userId);
      return { success: false, error: '用戶資料不存在' };
    }
    
    // 2. 冪等性檢查
    if (profile.registrationStep === 3) {
      console.log('[completeUserRegistration] ⚠️ 用戶已完成註冊，跳過重複處理');
      return {
        success: true,
        data: {
          referralCode: profile.referralCode,
          activeUntil: profile.activeUntil,
          accountStatus: profile.accountStatus
        }
      };
    }
    
    // 3. 狀態檢查
    if (profile.registrationStep !== 2) {
      console.error('[completeUserRegistration] 用戶狀態不正確:', profile.registrationStep);
      return { success: false, error: '請先完成付款' };
    }
    
    if (!profile.pendingActivation) {
      console.error('[completeUserRegistration] 付款未成功');
      return { success: false, error: '付款未成功，請重新付款' };
    }
    
    console.log('[completeUserRegistration] ✅ 狀態檢查通過，開始生成推薦碼...');
    
    // 4. 生成推薦碼（確保唯一性）
    let referralCode: string;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      referralCode = generateReferralCode();
      const existing = await kv.get(`referral_code:${referralCode}`);
      
      if (!existing) {
        break;  // 找到唯一的推薦碼
      }
      
      attempts++;
      console.log(`[completeUserRegistration] 推薦碼重複，重試 (${attempts}/${maxAttempts})`);
    }
    
    if (attempts >= maxAttempts) {
      console.error('[completeUserRegistration] 無法生成唯一推薦碼');
      return { success: false, error: '系統繁忙，請稍後再試' };
    }
    
    console.log('[completeUserRegistration] 生成推薦碼:', referralCode);
    
    // 5. 綁定推薦碼到用戶
    await kv.set(`referral_code:${referralCode}`, {
      code: referralCode,
      userId: userId,
      userName: profile.name,
      createdAt: toTaiwanISOString(getTaiwanNow()),
      listingId: null,  // 用戶還沒有刊登
      listingName: null
    });
    
    console.log('[completeUserRegistration] ✅ 推薦碼已綁定');
    
    // 6. 激活帳號
    const now = getTaiwanNow();
    
    // ✅ 使用 profile 中已存在的 activeUntil（Webhook 中已設置）
    // 如果不存在，則重新計算（兼容舊流程）
    let activeUntil: Date;
    if (profile.activeUntil) {
      console.log('[completeUserRegistration] 使用現有的 activeUntil:', profile.activeUntil);
      activeUntil = new Date(profile.activeUntil);
    } else {
      console.log('[completeUserRegistration] 重新計算 activeUntil');
      activeUntil = new Date(now);
      activeUntil.setFullYear(activeUntil.getFullYear() + 1);
    }
    
    profile.referralCode = referralCode;
    // ✅ 只在 profile 中沒有 accountStatus 時才設置（Webhook 可能已設置）
    if (!profile.accountStatus) {
      profile.accountStatus = 'Active';
    }
    profile.activeUntil = toTaiwanISOString(activeUntil);
    profile.registrationStep = 3;  // 完成註冊
    profile.pendingActivation = false;
    profile.updatedAt = toTaiwanISOString(now);
    
    await kv.set(`user:${userId}:profile`, profile);
    
    console.log('[completeUserRegistration] ✅ 帳號已激活');
    
    // 7. 初始化獎勵記錄
    await kv.set(`user:${userId}:rewards`, {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0,
      lastUpdated: toTaiwanISOString(now)
    });
    
    await kv.set(`user:${userId}:reward_history`, []);
    
    console.log('[completeUserRegistration] ✅ 獎勵記錄已初始化');
    
    // 8. 初始化任務狀態
    await kv.set(`user:${userId}:tasks`, {
      consecutiveReferral: null,  // 第一次推薦時才初始化
      monthlyKing: null
    });
    
    await kv.set(`user:${userId}:referral_monthly_log`, {});
    
    console.log('[completeUserRegistration] ✅ 任務狀態已初始化');
    
    // 9. 初始化推薦樹
    await kv.set(`user:${userId}:referral_tree`, {
      firstGeneration: [],
      secondGeneration: [],
      thirdGeneration: [],
      lastUpdated: toTaiwanISOString(now)
    });
    
    await kv.set(`user:${userId}:referral_stats`, {
      totalReferrals: 0,
      firstGenCount: 0,
      secondGenCount: 0,
      thirdGenCount: 0,
      lastUpdated: toTaiwanISOString(now)
    });
    
    console.log('[completeUserRegistration] ✅ 推薦樹已初始化');
    
    // 10. 處理推薦關係（如果有推薦碼）
    const referredByUserId = profile.referredByUserId;
    const referredByCode = profile.referredByCode;
    
    if (referredByUserId && referredByCode) {
      console.log('[completeUserRegistration] 🔗 開始處理推薦關係...');
      console.log('[completeUserRegistration] 推薦碼:', referredByCode);
      console.log('[completeUserRegistration] 推薦人:', referredByUserId);
      
      // ✅ 修復：建立 user:${userId}:referred_by 記錄（之前遺漏！）
      // 此記錄是二代、三代推薦鏈向上追溯的關鍵
      const referralCodeData = await kv.get(`referral_code:${referredByCode}`);
      await kv.set(`user:${userId}:referred_by`, {
        referrerUserId: referredByUserId,
        referrerListingId: referralCodeData?.listingId || null,
        referrerUserName: referralCodeData?.userName || profile.name || '未知用戶',
        referrerListingName: referralCodeData?.listingName || null,
        referralCode: referredByCode,
        referredAt: profile.paidAt || toTaiwanISOString(getTaiwanNow()),
        generation: 1
      });
      console.log(`[completeUserRegistration] ✅ referred_by 記錄已建立: user:${userId}:referred_by`);
      
      const paidAt = profile.paidAt;
      const newMember = {
        userId: userId,
        userName: profile.name,
        userReferralCode: referralCode,
        activeUntil: profile.activeUntil,
        createdAt: paidAt
      };
      // 新成員的直接推薦人信息
      const gen1Profile = await kv.get(`user:${referredByUserId}:profile`);
      const newMemberDirectReferrer = {
        userId: referredByUserId,
        userName: gen1Profile?.name || '未知用戶',
        userReferralCode: gen1Profile?.referralCode || null
      };
      
      try {
        // ========== 一代推薦關係 ==========
        console.log('[completeUserRegistration] 📍 處理一代推薦關係...');
        
        if (gen1Profile) {
          // 發放一代首月獎勵
          await issueImmediateReward(
            referredByUserId,
            userId,
            profile.name,
            referralCode,
            1,
            1,
            REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH
          );
          
          // 創建一代後續排程
          await createRewardSchedules(
            referredByUserId,
            userId,
            profile.name,
            referralCode,
            1,
            activeUntil
          );
          
          // 更新一代推薦樹
          await updateReferralTree(
            referredByUserId,
            newMember,
            1,
            null  // 一代沒有推薦人
          );
          
          // 更新一代推薦統計
          await updateReferralStats(referredByUserId, 1);
          
          // 更新一代任務進度
          await updateTaskProgress(referredByUserId, paidAt);
          
          // 更新一代月度日誌
          await updateReferralMonthlyLog(
            referredByUserId,
            {
              userId: userId,
              userName: profile.name,
              userReferralCode: referralCode,
              listingId: null,
              listingName: null,
              referrer: null
            },
            paidAt
          );
          
          console.log('[completeUserRegistration] ✅ 一代推薦關係處理完成');
          
          // ========== 二代推薦關係 ==========
          const gen1ReferredBy = await kv.get(`user:${referredByUserId}:referred_by`);
          
          if (gen1ReferredBy && gen1ReferredBy.referrerUserId) {
            console.log('[completeUserRegistration] 📍 處理二代推薦關係...');
            console.log('[completeUserRegistration] 二代推薦人:', gen1ReferredBy.referrerUserId);
            
            const gen2UserId = gen1ReferredBy.referrerUserId;
            const gen2Profile = await kv.get(`user:${gen2UserId}:profile`);
            
            if (gen2Profile) {
              // 發放二代首月獎勵
              await issueImmediateReward(
                gen2UserId,
                userId,
                profile.name,
                referralCode,
                2,
                1,
                REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH
              );
              
              // 創建二代後續排程
              await createRewardSchedules(
                gen2UserId,
                userId,
                profile.name,
                referralCode,
                2,
                activeUntil
              );
              
              // 更新二代推薦樹（包含推薦人信息）
              await updateReferralTree(
                gen2UserId,
                newMember,
                2,
                newMemberDirectReferrer
              );
              
              // 更新二代推薦統計
              await updateReferralStats(gen2UserId, 2);
              
              console.log('[completeUserRegistration] ✅ 二代推薦關係處理完成');
              
              // ========== 三代推薦關係 ==========
              const gen2ReferredBy = await kv.get(`user:${gen2UserId}:referred_by`);
              
              if (gen2ReferredBy && gen2ReferredBy.referrerUserId) {
                console.log('[completeUserRegistration] 📍 處理三代推薦關係...');
                console.log('[completeUserRegistration] 三代推薦人:', gen2ReferredBy.referrerUserId);
                
                const gen3UserId = gen2ReferredBy.referrerUserId;
                const gen3Profile = await kv.get(`user:${gen3UserId}:profile`);
                
                if (gen3Profile) {
                  // 發放三代首月獎勵
                  await issueImmediateReward(
                    gen3UserId,
                    userId,
                    profile.name,
                    referralCode,
                    3,
                    1,
                    REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH
                  );
                  
                  // 創建三代後續排程
                  await createRewardSchedules(
                    gen3UserId,
                    userId,
                    profile.name,
                    referralCode,
                    3,
                    activeUntil
                  );
                  
                  // 更新三代推薦樹（包含推薦人信息）
                  await updateReferralTree(
                    gen3UserId,
                    newMember,
                    3,
                    newMemberDirectReferrer
                  );
                  
                  // 更新三代推薦統計
                  await updateReferralStats(gen3UserId, 3);
                  
                  console.log('[completeUserRegistration] ✅ 三代推薦關係處理完成');
                }
              }
            }
          }
        }
        
        console.log('[completeUserRegistration] ✅ 所有推薦關係處理完成');
      } catch (error: any) {
        console.error('[completeUserRegistration] ❌ 推薦關係處理失敗:', error);
        // 不中斷流程，允許用戶繼續使用
      }
    } else {
      console.log('[completeUserRegistration] ℹ️ 無推薦關係或使用預設推薦碼');
    }
    
    console.log('[completeUserRegistration] 🎉 註冊完成:', userId);
    
    return {
      success: true,
      data: {
        referralCode,
        activeUntil: profile.activeUntil,
        accountStatus: profile.accountStatus
      }
    };
    
  } catch (error: any) {
    console.error('[completeUserRegistration] 錯誤:', error);
    return { success: false, error: '系統錯誤，請稍後再試' };
  }
}