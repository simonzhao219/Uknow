import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { 
  getTaiwanNow, 
  getTaiwanToday, 
  toTaiwanDateString, 
  toTaiwanISOString,
  calculateSubscriptionEndDate
} from './date_utils.ts';

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
    
    // 2. 獲取用戶的帳號狀態（新規格：訂閱綁定到用戶，而非刊登）
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    
    if (!accountStatus || !accountStatus.currentSubscriptionId) {
      console.log(`ℹ️ 用戶尚未訂閱: ${user.id}`);
      return c.json({
        success: true,
        data: {
          hasSubscription: false,
          status: null,
          message: '尚未訂閱'
        }
      });
    }
    
    console.log(`📊 帳號狀態: ${accountStatus.status}`);
    console.log(`📦 當前訂閱 ID: ${accountStatus.currentSubscriptionId}`);
    
    // 3. 獲取訂閱詳細資料
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    if (!subscription) {
      console.error(`⚠️ 訂閱資料不存在: ${accountStatus.currentSubscriptionId}`);;
      
      // ✅ 回退邏輯：嘗試從舊的鍵讀取（向後兼容）
      console.log(`🔄 嘗試從舊的訂閱鍵讀取: user:${user.id}:subscription`);
      const oldSubscription = await kv.get(`user:${user.id}:subscription`);
      
      if (oldSubscription) {
        console.log(`✅ 找到舊的訂閱記錄，開始遷移...`);
        
        // 生成新的訂閱 ID
        const subscriptionId = `subscription_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // 計算寬限期結束日期（如果舊記錄沒有）
        const endDate = new Date(oldSubscription.activeUntil);
        const gracePeriodEnd = new Date(endDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 60);
        gracePeriodEnd.setHours(23, 59, 59, 999);
        
        // 創建新格式的訂閱記錄
        const newSubscription = {
          id: subscriptionId,
          userId: user.id,
          status: oldSubscription.status === 'active' ? 'Active' : 
                  oldSubscription.cancelledAt ? 'Canceled' : 'Active',
          startDate: oldSubscription.startDate,
          endDate: oldSubscription.activeUntil,
          gracePeriodEnd: toTaiwanISOString(gracePeriodEnd),
          amount: 1200,
          paymentMethod: 'legacy',
          paymentTransactionId: 'LEGACY_' + subscriptionId,
          isCanceled: !!oldSubscription.cancelledAt,
          canceledAt: oldSubscription.cancelledAt || null,
          isRenewal: false,
          createdAt: oldSubscription.createdAt,
          updatedAt: toTaiwanISOString(getTaiwanNow())
        };
        
        // 存儲新的訂閱記錄
        await kv.set(`subscription:${subscriptionId}`, newSubscription);
        
        // 更新帳號狀態
        await kv.set(`user:${user.id}:account_status`, {
          ...accountStatus,
          currentSubscriptionId: subscriptionId,
          lastStatusUpdate: toTaiwanISOString(getTaiwanNow())
        });
        
        // 添加到用戶訂閱列表
        const userSubscriptions = await kv.get(`user:${user.id}:subscriptions`) || [];
        userSubscriptions.unshift(subscriptionId);
        await kv.set(`user:${user.id}:subscriptions`, userSubscriptions);
        
        // 刪除舊的訂閱記錄
        await kv.del(`user:${user.id}:subscription`);
        
        console.log(`✅ 訂閱記錄遷移完成: ${subscriptionId}`);
        
        // 使用新的訂閱記錄繼續處理
        const statusInfo = calculateSubscriptionStatus(newSubscription);
        
        return c.json({
          success: true,
          data: {
            hasSubscription: true,
            ...statusInfo
          }
        });
      }
      
      // 如果舊記錄也不存在，返回數據不一致錯誤
      console.error(`❌ 數據不一致：account_status 存在但找不到任何訂閱記錄`);
      
      // 清理不一致的 account_status
      await kv.del(`user:${user.id}:account_status`);
      
      return c.json({
        success: true,
        data: {
          hasSubscription: false,
          status: null,
          message: '尚未訂閱'
        }
      });
    }
    
    // 4. 計算訂閱狀態
    const statusInfo = calculateSubscriptionStatus(subscription);
    
    console.log(`📊 訂閱狀態: ${statusInfo.status}`);
    
    return c.json({
      success: true,
      data: {
        hasSubscription: true,
        ...statusInfo
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
 * GET /subscriptions/preview-cancel
 * 預覽取消訂閱後的變化（從後端 SSOT 讀取）
 */
subscriptions.get('/preview-cancel', async (c) => {
  try {
    console.log('========== 預覽取消訂閱 ==========');
    
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
    
    // 2. 獲取用戶的帳號狀態
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    
    if (!accountStatus || !accountStatus.currentSubscriptionId) {
      return c.json({
        success: false,
        error: { message: '尚未訂閱' }
      }, 400);
    }
    
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    if (!subscription) {
      return c.json({
        success: false,
        error: { message: '訂閱資料不存在' }
      }, 404);
    }
    
    // 3. 計算當前狀態
    const currentStatus = calculateSubscriptionStatus(subscription);
    
    // 4. 構建預覽數據
    const previewData = {
      currentStatus: currentStatus.status,
      currentPeriodEnd: subscription.endDate,
      afterCancelStatus: '已取消',
      afterCancelNextPeriod: null  // 取消後沒有下個週期
    };
    
    console.log(`✅ 預覽數據:`, previewData);
    
    return c.json({
      success: true,
      data: previewData
    });
    
  } catch (error) {
    console.error('❌ 預覽取消訂閱失敗:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * POST /subscriptions/cancel
 * 取消訂閱（標記為已取消，到期後自動轉為永久失效）
 * ✅ 需要身分證驗證
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
    
    // 2. ✅ 驗證身分證字號
    const body = await c.req.json();
    const { idNumber } = body;
    
    if (!idNumber) {
      return c.json({
        success: false,
        error: { message: '請提供身分證字號' }
      }, 400);
    }
    
    // 驗證身分證格式
    const idPattern = /^[A-Z][12]\d{8}$/;
    if (!idPattern.test(idNumber)) {
      return c.json({
        success: false,
        error: { message: '身分證格式不正確' }
      }, 400);
    }
    
    // 檢查身分證是否與用戶資料匹配
    const userProfile = await kv.get(`user:${user.id}:profile`);
    if (!userProfile || !userProfile.nationalId) {
      return c.json({
        success: false,
        error: { message: '用戶尚未完成身分驗證' }
      }, 400);
    }
    
    if (userProfile.nationalId !== idNumber) {
      return c.json({
        success: false,
        error: { message: '身分證字號不符' }
      }, 403);
    }
    
    console.log(`✅ 身分證驗證通過: ${idNumber}`);
    
    // 3. 獲取用戶的帳號狀態
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    
    if (!accountStatus || !accountStatus.currentSubscriptionId) {
      return c.json({
        success: false,
        error: { message: '尚未訂閱' }
      }, 400);
    }
    
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    if (!subscription) {
      return c.json({
        success: false,
        error: { message: '訂閱資料不存在' }
      }, 404);
    }
    
    // 4. 檢查當前狀態
    const currentStatus = calculateSubscriptionStatus(subscription);
    
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
    
    // 5. 標記為已取消
    const now = toTaiwanISOString(getTaiwanNow());
    subscription.canceledAt = now;
    subscription.updatedAt = now;
    
    await kv.set(`subscription:${subscription.id}`, subscription);
    await kv.set(`user:${user.id}:account_status`, {
      ...accountStatus,
      status: 'cancelled'
    });
    
    console.log(`✅ 訂閱已取消: ${subscription.id}`);
    console.log(`   將在 ${subscription.activeUntil} 到期後失效`);
    
    return c.json({
      success: true,
      data: {
        message: '訂閱已取消',
        activeUntil: subscription.activeUntil,
        note: '您的刊登顯示到期限為止，之後將自動失效'
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
    
    // 2. 獲取用戶的帳號狀態
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    
    if (!accountStatus || !accountStatus.currentSubscriptionId) {
      return c.json({
        success: false,
        error: { message: '尚未訂閱' }
      }, 400);
    }
    
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    if (!subscription) {
      return c.json({
        success: false,
        error: { message: '訂閱資料不存在' }
      }, 404);
    }
    
    // 3. 檢查當前狀態
    const currentStatus = calculateSubscriptionStatus(subscription);
    
    console.log(`📊 當前狀態: ${currentStatus.status}`);
    
    // 4. 根據狀態處理續費（使用台灣時區）
    const now = getTaiwanNow();
    let newEndDate: Date;
    let newStartDate: Date;
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
      const originalEndDate = new Date(subscription.endDate);
      
      // 新週期起始日 = 原結束日 + 1天
      newStartDate = new Date(originalEndDate.getTime() + (24 * 60 * 60 * 1000));
      newStartDate.setHours(0, 0, 0, 0);
      
      // 新週期結束日 = 新起始日 + 1年 - 1天
      newEndDate = calculateSubscriptionEndDate(newStartDate);
      
      console.log(`  ✅ 補繳模式：接續原到期日 ${toTaiwanDateString(originalEndDate)}`);
    } else {
      // 正常續費或已取消後續費：從今天開始延長一年
      renewalType = currentStatus.status === SubscriptionStatus.CANCELLED ? '恢復並續費' : '正常續費';
      
      // 新週期起始日 = 今天
      newStartDate = getTaiwanToday();
      
      // 新週期結束日 = 今天 + 1年 - 1天
      newEndDate = calculateSubscriptionEndDate(newStartDate);
      
      console.log(`  ✅ ${renewalType}：延長到 ${toTaiwanDateString(newEndDate)}`);
    }
    
    // 5. TODO: 整合藍新金流付款
    // 這裡應該先創建付款訂單，付款成功後再更新
    // 目前先模擬付款成功
    
    // 6. 更新訂閱資料（使用台灣時區）
    // 計算寬限期結束日 = 結束日 + 60天
    const gracePeriodEnd = new Date(newEndDate.getTime() + (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) - 1);
    
    subscription.startDate = toTaiwanISOString(newStartDate);
    subscription.endDate = toTaiwanISOString(newEndDate);
    subscription.gracePeriodEnd = toTaiwanISOString(gracePeriodEnd);
    subscription.lastPaymentDate = toTaiwanISOString(now);
    subscription.nextPaymentDate = toTaiwanISOString(newEndDate); // 下次扣款日 = 結束日當天
    subscription.canceledAt = null; // 清除取消標記
    subscription.updatedAt = toTaiwanISOString(now);
    
    await kv.set(`subscription:${subscription.id}`, subscription);
    await kv.set(`user:${user.id}:account_status`, {
      ...accountStatus,
      status: 'active'
    });
    
    console.log(`✅ 續費成功: ${subscription.id}`);
    console.log(`   類型: ${renewalType}`);
    console.log(`   新到期日: ${subscription.activeUntil}`);
    
    return c.json({
      success: true,
      data: {
        message: `${renewalType}成功`,
        renewalType,
        lastPaymentDate: subscription.lastPaymentDate,
        nextPaymentDate: subscription.nextPaymentDate,
        activeUntil: subscription.activeUntil,
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
 * POST /subscriptions/resume
 * 恢復訂閱（從「已取消」狀態恢復）
 * 
 * 條件：
 * - 當前狀態必須是 cancelled
 * - 訂閱仍在有效期內
 * 
 * 動作：
 * - 清除 canceledAt
 * - 更新狀態為 active
 * - 重新設定下次扣款日
 */
subscriptions.post('/resume', async (c) => {
  try {
    console.log('========== 恢復訂閱 ==========');
    
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
    
    // 2. 獲取用戶的帳號狀態
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    
    if (!accountStatus || !accountStatus.currentSubscriptionId) {
      return c.json({
        success: false,
        error: { message: '尚未訂閱' }
      }, 400);
    }
    
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    if (!subscription) {
      return c.json({
        success: false,
        error: { message: '訂閱資料不存在' }
      }, 404);
    }
    
    // 3. 檢查當前狀態
    const currentStatus = calculateSubscriptionStatus(subscription);
    
    if (currentStatus.status !== SubscriptionStatus.CANCELLED) {
      return c.json({
        success: false,
        error: { message: '訂閱未處於「已取消」狀態，無法恢復' }
      }, 400);
    }
    
    if (currentStatus.daysRemaining <= 0) {
      return c.json({
        success: false,
        error: { message: '訂閱已到期，無法恢復。請開始新訂閱。' }
      }, 400);
    }
    
    // 4. 清除取消標記，恢復訂閱
    const now = toTaiwanISOString(getTaiwanNow());
    delete subscription.canceledAt;
    subscription.updatedAt = now;
    
    await kv.set(`subscription:${subscription.id}`, subscription);
    await kv.set(`user:${user.id}:account_status`, {
      ...accountStatus,
      status: 'Active'
    });
    
    console.log(`✅ 訂閱已恢復: ${subscription.id}`);
    console.log(`   有效期至: ${subscription.endDate}`);
    
    return c.json({
      success: true,
      data: {
        message: '訂閱已恢復',
        activeUntil: subscription.endDate,
        status: 'active'
      }
    });
    
  } catch (error) {
    console.error('❌ 恢復訂閱失敗:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * POST /subscriptions/makeup
 * 補繳（從「即將失效」狀態恢復）
 * 
 * 條件：
 * - 當前狀態必須是 grace
 * - 在寬限期內（60天內）
 * 
 * 動作：
 * - ⭐ 呼叫金流 API 執行扣款（目前模擬）
 * - 扣款成功：
 *   - 更新狀態為 active
 *   - 更新週期（接續原到期日）
 *   - 記錄扣款歷史
 * - 扣款失敗：
 *   - 返回錯誤原因
 */
subscriptions.post('/makeup', async (c) => {
  try {
    console.log('========== 補繳訂閱 ==========');
    
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
    
    // 2. 獲取用戶的帳號狀態
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    
    if (!accountStatus || !accountStatus.currentSubscriptionId) {
      return c.json({
        success: false,
        error: { message: '尚未訂閱' }
      }, 400);
    }
    
    const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
    
    if (!subscription) {
      return c.json({
        success: false,
        error: { message: '訂閱資料不存在' }
      }, 404);
    }
    
    // 3. 檢查當前狀態
    const currentStatus = calculateSubscriptionStatus(subscription);
    
    if (currentStatus.status !== SubscriptionStatus.GRACE) {
      return c.json({
        success: false,
        error: { message: '訂閱未處於「即將失效」狀態，無法補繳' }
      }, 400);
    }
    
    // 4. ⭐ 模擬金流扣款（未來整合藍新金流）
    // TODO: 整合藍新金流定期扣款 API
    console.log(`🔄 執行補繳扣款...`);
    
    // 模擬扣款（90% 成功率）
    const paymentSuccess = Math.random() > 0.1;
    
    if (!paymentSuccess) {
      console.error(`❌ 補繳扣款失敗`);
      
      // 記錄失敗歷史
      const paymentHistory = await kv.get(`user:${user.id}:payment_history`) || [];
      paymentHistory.unshift({
        id: `payment_${Date.now()}`,
        subscriptionId: subscription.id,
        amount: YEARLY_PRICE,
        status: 'failed',
        paymentMethod: 'newebpay_recurring',
        error: '信用卡餘額不足',
        attemptedAt: toTaiwanISOString(getTaiwanNow())  // ✅ 修復：使用台灣時區
      });
      
      if (paymentHistory.length > 100) {
        paymentHistory.length = 100;
      }
      
      await kv.set(`user:${user.id}:payment_history`, paymentHistory);
      
      return c.json({
        success: false,
        error: { message: '補繳失敗：信用卡餘額不足' }
      }, 400);
    }
    
    // 5. 扣款成功，更新訂閱（使用台灣時區）
    console.log(`✅ 補繳扣款成功`);
    
    const now = getTaiwanNow();
    const originalEndDate = new Date(subscription.endDate);
    
    // 計算新週期（接續原到期日）
    // 新週期起始日 = 原結束日 + 1天 00:00:00
    const newStartDate = new Date(originalEndDate.getTime() + (24 * 60 * 60 * 1000));
    newStartDate.setHours(0, 0, 0, 0);
    
    // 新週期結束日 = 新起始日 + 1年 - 1天 23:59:59.999
    const newEndDate = calculateSubscriptionEndDate(newStartDate);
    
    // 寬限期結束日 = 結束日 + 60天
    const gracePeriodEnd = new Date(newEndDate.getTime() + (GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) - 1);
    
    // 更新訂閱資料（使用台灣時區 ISO 字符串）
    subscription.startDate = toTaiwanISOString(newStartDate);
    subscription.endDate = toTaiwanISOString(newEndDate);
    subscription.gracePeriodEnd = toTaiwanISOString(gracePeriodEnd);
    subscription.lastPaymentDate = toTaiwanISOString(now);
    subscription.nextPaymentDate = toTaiwanISOString(newEndDate); // 下次扣款日 = 結束日當天
    subscription.updatedAt = toTaiwanISOString(now);
    
    // 清除寬限期標記
    delete subscription.graceStartedAt;
    delete subscription.lastPaymentFailedAt;
    delete subscription.lastPaymentFailureReason;
    
    await kv.set(`subscription:${subscription.id}`, subscription);
    await kv.set(`user:${user.id}:account_status`, {
      ...accountStatus,
      status: 'Active'
    });
    
    // 6. 記錄扣款歷史
    const paymentHistory = await kv.get(`user:${user.id}:payment_history`) || [];
    paymentHistory.unshift({
      id: `payment_${Date.now()}`,
      subscriptionId: subscription.id,
      amount: YEARLY_PRICE,
      status: 'success',
      paymentMethod: 'newebpay_recurring',
      transactionId: `TXN_${Date.now()}`,
      paidAt: now.toISOString()
    });
    
    if (paymentHistory.length > 100) {
      paymentHistory.length = 100;
    }
    
    await kv.set(`user:${user.id}:payment_history`, paymentHistory);
    
    console.log(`✅ 補繳成功: ${subscription.id}`);
    console.log(`   新週期: ${subscription.startDate} ~ ${subscription.endDate}`);
    
    return c.json({
      success: true,
      data: {
        message: '補繳成功',
        activeUntil: subscription.endDate,
        nextPaymentDate: subscription.nextPaymentDate,
        amount: YEARLY_PRICE,
        status: 'active'
      }
    });
    
  } catch (error) {
    console.error('❌ 補繳失敗:', error);
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
    
    // 2. 獲取付款歷��
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
 * @param subscription - 訂閱資料（新規格：從 subscription 表）
 * @returns 訂閱狀態資訊
 */
function calculateSubscriptionStatus(subscription: any) {
  const now = getTaiwanNow();
  const endDate = new Date(subscription.endDate);
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  let status: SubscriptionStatus;
  let message: string;
  let canRenew: boolean;
  let canMakeup: boolean;
  
  // ✅ 計算下期起訖日（僅 active 狀態）（使用台灣時區）
  // ✅ 新規則：
  // - 下次扣款日 = 本期結束日當天（不是 +1）
  // - 下期起始日 = 本期結束日 + 1天
  // - 下期結束日 = 下期起始日 + 1年 - 1天
  // 
  // 範例：本期結束日 2025/12/30
  // - 下次扣款日：2025/12/30（當天扣款）
  // - 下期起始日：2025/12/31
  // - 下期結束日：2026/12/30
  
  let nextPeriodStart: string | null = null;
  let nextPeriodEnd: string | null = null;
  let nextPaymentDate: string | null = null;
  
  // 1. 檢查是否已取消
  if (subscription.canceledAt) {
    if (daysRemaining > 0) {
      // 已取消但仍在有效期內
      status = SubscriptionStatus.CANCELLED;
      message = `訂閱已取消，將在 ${subscription.endDate} 到期`;
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
      
      // ✅ 計算下期起訖日（下期開始日 = 本期結束日 + 1天）（使用台灣時區）
      // 下期起始日 = 本期結束日 + 1天 00:00:00
      const nextStart = new Date(endDate.getTime() + (24 * 60 * 60 * 1000));
      nextStart.setHours(0, 0, 0, 0);
      
      // 下期結束日 = 下期起始日 + 1年 - 1天 23:59:59.999
      const nextEnd = calculateSubscriptionEndDate(nextStart);
      
      nextPeriodStart = toTaiwanISOString(nextStart);
      nextPeriodEnd = toTaiwanISOString(nextEnd);
      nextPaymentDate = toTaiwanISOString(endDate);  // 下次扣款日 = 本期結束日當天
    } else {
      // 已過期
      const daysOverdue = Math.abs(daysRemaining);
      const gracePeriodEnd = new Date(subscription.gracePeriodEnd);
      
      if (now <= gracePeriodEnd) {
        // 即將失效（寬限期內）
        status = SubscriptionStatus.GRACE;
        message = `訂閱已逾期 ${daysOverdue} 天，可補繳恢復`;
        canRenew = false;
        canMakeup = true;
      } else {
        // 永久失效（超過寬限期）
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
    // ✅ 本期起訖日
    currentPeriodStart: subscription.startDate,
    currentPeriodEnd: subscription.endDate,
    // ✅ 下期起訖日（僅 active 狀態有值）
    nextPeriodStart,
    nextPeriodEnd,
    // ✅ 下次扣款日（僅 active 狀態有值）
    nextPaymentDate,
    // 其他信息
    daysRemaining,
    canRenew,
    canMakeup,
    isCancelled: !!subscription.canceledAt,
    cancelledAt: subscription.canceledAt || null
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
  
  const accountStatus = await kv.get(`user:${userId}:account_status`);
  
  if (!accountStatus || !accountStatus.currentSubscriptionId) {
    console.log(`  ℹ️ 用戶沒有訂閱，跳過`);
    return { status: 'no_subscription' };
  }
  
  const subscription = await kv.get(`subscription:${accountStatus.currentSubscriptionId}`);
  
  if (!subscription) {
    console.log(`  ⚠️ 訂閱資料不存在: ${accountStatus.currentSubscriptionId}`);
    return { status: 'subscription_not_found' };
  }
  
  const status = calculateSubscriptionStatus(subscription);
  
  console.log(`  📊 當前狀態: ${status.status}`);
  
  // 如果狀態變為永久失效，需要處理推薦碼失效
  if (status.status === SubscriptionStatus.EXPIRED && subscription.referralCode) {
    await handleReferralCodeExpiration(userId, subscription.id, subscription.referralCode);
  }
  
  return { status: status.status };
}

/**
 * 處理推薦碼失效
 * 
 * @param userId - 用戶 ID
 * @param listingId - 刊登 ID
 * @param referralCode - ���薦碼
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
    referralCodeData.expiredAt = toTaiwanISOString(getTaiwanNow());
    await kv.set(`referral_code:${referralCode}`, referralCodeData);
    console.log(`  ✅ 推薦碼已標記為失效`);
  }
  
  // 2. ✅ 清空用戶點數 SSOT（根據規格：永久失效時點數歸零）
  await kv.set(`user:${userId}:rewards`, {
    availableRewards: 0,
    pendingRewards: 0,
    withdrawnRewards: 0,
    totalEarned: 0,
    lastUpdated: toTaiwanISOString(getTaiwanNow())
  });
  console.log(`  ✅ 用戶點數 SSOT 已清零`);
  
  // 3. 清空任務進度
  await kv.set(`user:${userId}:tasks`, {
    consecutiveReferral: null,
    monthlyKing: null,
    lastUpdated: toTaiwanISOString(getTaiwanNow())
  });
  console.log(`  ✅ 任務進度已清零`);
  
  // 4. 取消所有待發放的獎勵排程
  const userSchedules = await kv.get(`user:${userId}:reward_schedules`) || [];
  
  for (const scheduleId of userSchedules) {
    const schedule = await kv.get(`reward_schedule:${scheduleId}`);
    
    if (schedule && schedule.status === 'pending') {
      schedule.status = 'cancelled';
      schedule.completedAt = toTaiwanISOString(getTaiwanNow());
      schedule.cancellationReason = '用戶訂閱已永久失效';
      await kv.set(`reward_schedule:${scheduleId}`, schedule);
    }
  }
  
  console.log(`  ✅ 已取消所有待發放的獎勵排程（共 ${userSchedules.length} 筆）`);
}

export default subscriptions;