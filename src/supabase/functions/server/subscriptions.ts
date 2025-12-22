import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const subscriptions = new Hono();

// ===== 常數定義 =====
const YEARLY_PRICE = 1200; // 年費（新台幣）
const GRACE_PERIOD_DAYS = 60; // 即將失效期限（60天）

/**
 * 訂閱狀態枚舉
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',           // 訂閱中
  CANCELLED = 'cancelled',     // 已取消（但仍在有效期內）
  GRACE = 'grace',             // 即將失效（逾期0-60天）
  EXPIRED = 'expired'          // 永久失效（逾期>60天或取消後到期）
}

/**
 * GET /subscriptions/status
 * 獲取當前用戶的訂閱狀態
 * 
 * 返回：
 * - status: 訂閱狀態
 * - activeUntil: 有效期限
 * - nextPaymentDate: 下次付款日
 * - daysRemaining: 剩餘天數
 * - canRenew: 是否可續費
 * - canMakeup: 是否可補繳
 */
subscriptions.get('/status', async (c) => {
  try {
    console.log('========== 獲取訂閱狀態 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取用戶的刊登（訂閱綁定到刊登）
    const userListing = await kv.get(`user:${user.id}:listing`);
    
    if (!userListing) {
      return c.json({
        success: true,
        data: {
          hasSubscription: false,
          status: null,
          message: '尚未訂閱'
        }
      });
    }
    
    const listing = await kv.get(`listing:${userListing.id}`);
    
    if (!listing) {
      return c.json({
        success: false,
        error: { message: '刊登資料不存在' }
      }, 404);
    }
    
    // 3. 計算訂閱狀態
    const status = calculateSubscriptionStatus(listing);
    
    console.log(`📊 訂閱狀態: ${status.status}`);
    
    return c.json({
      success: true,
      data: {
        hasSubscription: true,
        ...status
      }
    });
    
  } catch (error) {
    console.error('❌ 獲取訂閱狀態失敗:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * POST /subscriptions/cancel
 * 取消訂閱（標記為已取消，到期後自動轉為永久失效）
 */
subscriptions.post('/cancel', async (c) => {
  try {
    console.log('========== 取消訂閱 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取用戶的刊登
    const userListing = await kv.get(`user:${user.id}:listing`);
    
    if (!userListing) {
      return c.json({
        success: false,
        error: { message: '尚未訂閱' }
      }, 400);
    }
    
    const listing = await kv.get(`listing:${userListing.id}`);
    
    if (!listing) {
      return c.json({
        success: false,
        error: { message: '刊登資料不存在' }
      }, 404);
    }
    
    // 3. 檢查當前狀態
    const currentStatus = calculateSubscriptionStatus(listing);
    
    if (currentStatus.status === SubscriptionStatus.CANCELLED) {
      return c.json({
        success: false,
        error: { message: '訂閱已經被取消' }
      }, 400);
    }
    
    if (currentStatus.status === SubscriptionStatus.EXPIRED) {
      return c.json({
        success: false,
        error: { message: '訂閱已失效' }
      }, 400);
    }
    
    // 4. 標記為已取消
    const now = new Date().toISOString();
    listing.cancelledAt = now;
    listing.updatedAt = now;
    
    await kv.set(`listing:${listing.id}`, listing);
    await kv.set(`user:${user.id}:listing`, listing);
    
    console.log(`✅ 訂閱已取消: ${listing.id}`);
    console.log(`   將在 ${listing.activeUntil} 到期後失效`);
    
    return c.json({
      success: true,
      data: {
        message: '訂閱已取消',
        activeUntil: listing.activeUntil,
        note: '您的刊登將顯示到期限為止，之後將自動失效'
      }
    });
    
  } catch (error) {
    console.error('❌ 取消訂閱失敗:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * POST /subscriptions/renew
 * 續費訂閱（正常續費或補繳）
 * 
 * 說明：
 * - 訂閱中：正常續費，延長一年
 * - 已取消：恢復訂閱並延長一年
 * - 即將失效：補繳，接續原到期日
 * - 永久失效：不允許續費，需重新訂閱
 */
subscriptions.post('/renew', async (c) => {
  try {
    console.log('========== 續費訂閱 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取用戶的刊登
    const userListing = await kv.get(`user:${user.id}:listing`);
    
    if (!userListing) {
      return c.json({
        success: false,
        error: { message: '尚未訂閱' }
      }, 400);
    }
    
    const listing = await kv.get(`listing:${userListing.id}`);
    
    if (!listing) {
      return c.json({
        success: false,
        error: { message: '刊登資料不存在' }
      }, 404);
    }
    
    // 3. 檢查當前狀態
    const currentStatus = calculateSubscriptionStatus(listing);
    
    console.log(`📊 當前狀態: ${currentStatus.status}`);
    
    // 4. 根據狀態處理續費
    const now = new Date();
    let newActiveUntil: Date;
    let newNextPaymentDate: Date;
    let renewalType: string;
    
    if (currentStatus.status === SubscriptionStatus.EXPIRED) {
      return c.json({
        success: false,
        error: { 
          message: '訂閱已永久失效，無法續費',
          note: '請重新訂閱以獲得新的推薦碼'
        }
      }, 400);
    }
    
    if (currentStatus.status === SubscriptionStatus.GRACE) {
      // 補繳：接續原到期日
      renewalType = '補繳';
      const originalActiveUntil = new Date(listing.activeUntil);
      
      newNextPaymentDate = new Date(originalActiveUntil);
      newNextPaymentDate.setFullYear(newNextPaymentDate.getFullYear() + 1);
      newNextPaymentDate.setDate(newNextPaymentDate.getDate() + 1); // 下次付款日
      
      newActiveUntil = new Date(newNextPaymentDate);
      newActiveUntil.setDate(newActiveUntil.getDate() - 1);
      newActiveUntil.setHours(23, 59, 59, 999);
      
      console.log(`  ✅ 補繳模式：接續原到期日 ${listing.activeUntil}`);
    } else {
      // 正常續費或已取消後續費：從現在延長一年
      renewalType = currentStatus.status === SubscriptionStatus.CANCELLED ? '恢復並續費' : '正常續費';
      
      newNextPaymentDate = new Date(now);
      newNextPaymentDate.setFullYear(newNextPaymentDate.getFullYear() + 1);
      
      newActiveUntil = new Date(newNextPaymentDate);
      newActiveUntil.setDate(newActiveUntil.getDate() - 1);
      newActiveUntil.setHours(23, 59, 59, 999);
      
      console.log(`  ✅ ${renewalType}：延長到 ${newActiveUntil.toISOString()}`);
    }
    
    // 5. TODO: 整合藍新金流付款
    // 這裡應該先創建付款訂單，付款成功後再更新
    // 目前先模擬付款成功
    
    // 6. 更新刊登資料
    listing.lastPaymentDate = now.toISOString();
    listing.nextPaymentDate = newNextPaymentDate.toISOString();
    listing.activeUntil = newActiveUntil.toISOString();
    listing.cancelledAt = null; // 清除取消標記
    listing.updatedAt = now.toISOString();
    
    await kv.set(`listing:${listing.id}`, listing);
    await kv.set(`user:${user.id}:listing`, listing);
    
    console.log(`✅ 續費成功: ${listing.id}`);
    console.log(`   類型: ${renewalType}`);
    console.log(`   新到期日: ${listing.activeUntil}`);
    
    return c.json({
      success: true,
      data: {
        message: `${renewalType}成功`,
        renewalType,
        lastPaymentDate: listing.lastPaymentDate,
        nextPaymentDate: listing.nextPaymentDate,
        activeUntil: listing.activeUntil,
        amount: YEARLY_PRICE
      }
    });
    
  } catch (error) {
    console.error('❌ 續費失敗:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * GET /subscriptions/history
 * 獲取訂閱歷史（付款記錄）
 */
subscriptions.get('/history', async (c) => {
  try {
    console.log('========== 獲取訂閱歷史 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    // 2. 獲取付款歷史
    const paymentHistory = await kv.get(`user:${user.id}:payment_history`) || [];
    
    return c.json({
      success: true,
      data: {
        payments: paymentHistory
      }
    });
    
  } catch (error) {
    console.error('❌ 獲取訂閱歷史失敗:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ===================================================================
// 輔助函數
// ===================================================================

/**
 * 計算訂閱狀態
 * 
 * @param listing - 刊登資料
 * @returns 訂閱狀態資訊
 */
function calculateSubscriptionStatus(listing: any) {
  const now = new Date();
  const activeUntil = new Date(listing.activeUntil);
  const daysRemaining = Math.ceil((activeUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  let status: SubscriptionStatus;
  let message: string;
  let canRenew: boolean;
  let canMakeup: boolean;
  
  // 1. 檢查是否已取消
  if (listing.cancelledAt) {
    if (daysRemaining > 0) {
      // 已取消但仍在有效期內
      status = SubscriptionStatus.CANCELLED;
      message = `訂閱已取消，將在 ${listing.activeUntil} 到期`;
      canRenew = true;  // 可以恢復訂閱
      canMakeup = false;
    } else {
      // 已取消且已到期
      status = SubscriptionStatus.EXPIRED;
      message = '訂閱已失效（已取消並到期）';
      canRenew = false;
      canMakeup = false;
    }
  } else {
    // 2. 檢查是否在有效期內
    if (daysRemaining > 0) {
      // 訂閱中
      status = SubscriptionStatus.ACTIVE;
      message = `訂閱有效，剩餘 ${daysRemaining} 天`;
      canRenew = true;  // 可以提前續費
      canMakeup = false;
    } else {
      // 已過期
      const daysOverdue = Math.abs(daysRemaining);
      
      if (daysOverdue <= GRACE_PERIOD_DAYS) {
        // 即將失效（60天內）
        status = SubscriptionStatus.GRACE;
        message = `訂閱已逾期 ${daysOverdue} 天，可補繳恢復`;
        canRenew = false;
        canMakeup = true;
      } else {
        // 永久失效（超過60天）
        status = SubscriptionStatus.EXPIRED;
        message = `訂閱已永久失效（逾期超過 ${GRACE_PERIOD_DAYS} 天）`;
        canRenew = false;
        canMakeup = false;
      }
    }
  }
  
  return {
    status,
    message,
    activeUntil: listing.activeUntil,
    nextPaymentDate: listing.nextPaymentDate,
    lastPaymentDate: listing.lastPaymentDate,
    daysRemaining,
    canRenew,
    canMakeup,
    isCancelled: !!listing.cancelledAt,
    cancelledAt: listing.cancelledAt || null
  };
}

/**
 * 檢查並更新訂閱狀態
 * （由 Cron 定時任務調用）
 * 
 * @param userId - 用戶 ID
 */
export async function checkAndUpdateSubscriptionStatus(userId: string): Promise<{ status: string }> {
  console.log(`[Check Subscription] 檢查用戶訂閱狀態: ${userId}`);
  
  const userListing = await kv.get(`user:${userId}:listing`);
  
  if (!userListing) {
    console.log(`  ℹ️ 用戶沒有刊登，跳過`);
    return { status: 'no_listing' };
  }
  
  const listing = await kv.get(`listing:${userListing.id}`);
  
  if (!listing) {
    console.log(`  ⚠️ 刊登資料不存在: ${userListing.id}`);
    return { status: 'listing_not_found' };
  }
  
  const status = calculateSubscriptionStatus(listing);
  
  console.log(`  📊 當前狀態: ${status.status}`);
  
  // 如果狀態變為永久失效，需要處理推薦碼失效
  if (status.status === SubscriptionStatus.EXPIRED && listing.referralCode) {
    await handleReferralCodeExpiration(userId, listing.id, listing.referralCode);
  }
  
  return { status: status.status };
}

/**
 * 處理推薦碼失效
 * 
 * @param userId - 用戶 ID
 * @param listingId - 刊登 ID
 * @param referralCode - 推薦碼
 */
async function handleReferralCodeExpiration(
  userId: string,
  listingId: string,
  referralCode: string
): Promise<void> {
  console.log(`[Referral Code Expiration] 處理推薦碼失效: ${referralCode}`);
  
  // 1. 標記推薦碼為失效
  const referralCodeData = await kv.get(`referral_code:${referralCode}`);
  
  if (referralCodeData) {
    referralCodeData.isActive = false;
    referralCodeData.expiredAt = new Date().toISOString();
    await kv.set(`referral_code:${referralCode}`, referralCodeData);
    console.log(`  ✅ 推薦碼已標記為失效`);
  }
  
  // 2. 清空用戶點數（根據規格：永久失效時點數歸零）
  await kv.set(`user:${userId}:points`, 0);
  console.log(`  ✅ 用戶點數已清零`);
  
  // 3. 清空任務進度
  await kv.set(`user:${userId}:tasks`, {
    consecutiveReferral: null,
    monthlyKing: null,
    lastUpdated: new Date().toISOString()
  });
  console.log(`  ✅ 任務進度已清零`);
  
  // 4. 取消所有待發放的獎勵排程
  const userSchedules = await kv.get(`user:${userId}:reward_schedules`) || [];
  
  for (const scheduleId of userSchedules) {
    const schedule = await kv.get(`reward_schedule:${scheduleId}`);
    
    if (schedule && schedule.status === 'pending') {
      schedule.status = 'cancelled';
      schedule.completedAt = new Date().toISOString();
      schedule.cancellationReason = '用戶訂閱已永久失效';
      await kv.set(`reward_schedule:${scheduleId}`, schedule);
    }
  }
  
  console.log(`  ✅ 已取消所有待發放的獎勵排程（共 ${userSchedules.length} 筆）`);
}

export default subscriptions;