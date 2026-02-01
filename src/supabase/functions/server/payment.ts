import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { updateTaskProgress, updateReferralMonthlyLog } from './task_helpers.ts';
import { 
  getTaiwanNow, 
  getTaiwanToday, 
  toTaiwanDateString, 
  toTaiwanISOString,
  calculateSubscriptionEndDate,
  createTaiwanDate
} from './date_utils.ts';

const payment = new Hono();

// ===== 常數定義 =====
const YEARLY_PRICE = 1200; // 年費（新台幣）

/**
 * POST /payment/create-order
 * 創建付款訂單
 * 
 * ✅ Phase 9.4: 修改為不需要 listingData
 * 說明：
 * 1. 驗證用戶身份
 * 2. 檢查是否已有付款訂單（避免重複）
 * 3. 生成訂單編號
 * 4. ✅ 只暫存用戶 ID 和推薦碼（不需要刊登資料）
 * 5. 返回付款資訊
 */
payment.post('/create-order', async (c) => {
  try {
    console.log('[Create Payment Order] 開始處理付款訂單...');
    
    // 1. 驗證用戶
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[Create Payment Order] ❌ 未提供授權標頭');
      return c.json({
        success: false,
        error: { message: '未授權：請先登入' }
      }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('[Create Payment Order] ❌ 授權驗證失敗:', authError);
      return c.json({
        success: false,
        error: { message: '授權驗證失敗' }
      }, 401);
    }
    
    console.log(`[Create Payment Order] ✅ 用戶驗證成功: ${user.id}`);
    
    // 2. 檢查用戶資料
    const userProfile = await kv.get(`user:${user.id}:profile`);
    if (!userProfile) {
      console.error('[Create Payment Order] ❌ 用戶資料不存在');
      return c.json({
        success: false,
        error: { message: '用戶資料不存在，請先完成註冊' }
      }, 404);
    }
    
    // ✅ 3. 從用戶 profile 讀取推薦碼（註冊時填寫的）
    const referralCode = userProfile.referredByCode || null;
    
    console.log(`[Create Payment Order] 推薦碼（來自 profile）: ${referralCode || '無'}`);
    
    // 4. 生成訂單編號
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`[Create Payment Order] ✅ 生成訂單編號: ${orderId}`);
    
    // 5. ✅ 只暫存用戶 ID 和推薦碼（不需要刊登資料）
    const orderData = {
      id: orderId,
      userId: user.id,
      amount: YEARLY_PRICE,
      status: 'pending',
      referralCode: referralCode || null,
      createdAt: toTaiwanISOString(getTaiwanNow())  // ✅ 修復：使用台灣時區
    };
    
    await kv.set(`payment_order:${orderId}`, orderData);
    console.log(`[Create Payment Order] ✅ 訂單資訊已暫存`);
    
    // 6. TODO: 整合藍新金流
    // 目前返回模擬付款 URL
    const paymentUrl = `${Deno.env.get('FRONTEND_URL') || 'http://localhost:5173'}/payment/process?orderId=${orderId}`;
    
    console.log(`[Create Payment Order] ✅ 付款訂單創建完成`);
    
    return c.json({
      success: true,
      data: {
        orderId,
        amount: YEARLY_PRICE,
        paymentUrl,
        // TODO: 未來加入藍新金流參數
        message: '訂單已創建，請進行付款'
      }
    });
    
  } catch (error) {
    console.error('[Create Payment Order] ❌ 錯誤:', error);
    return c.json({
      success: false,
      error: { 
        message: '創建付款訂單失敗', 
        details: error.message 
      }
    }, 500);
  }
});

/**
 * POST /payment/simulate-success
 * 模擬付款成功（開發測試用）
 * 
 * 說明：
 * 這是一個臨時端點，用於測試付款成功後的流程
 * 未來整合藍新金流後，將由藍新金流的回調取代
 */
payment.post('/simulate-success', async (c) => {
  try {
    console.log('[Simulate Payment Success] 開始處理模擬付款成功...');
    
    const { orderId } = await c.req.json();
    
    if (!orderId) {
      return c.json({
        success: false,
        error: { message: '訂單編號是必填欄位' }
      }, 400);
    }
    
    console.log(`[Simulate Payment Success] 訂單編號: ${orderId}`);
    
    // 呼叫付款回調處理邏輯
    const result = await processPaymentCallback(orderId, 'SIMULATED_TRADE_NO');
    
    if (result.success) {
      console.log('[Simulate Payment Success] ✅ 模擬付款處理完成');
      return c.json(result);
    } else {
      console.error('[Simulate Payment Success] ❌ 處理失敗:', result.error);
      return c.json(result, 400);
    }
    
  } catch (error) {
    console.error('[Simulate Payment Success] ❌ 錯誤:', error);
    return c.json({
      success: false,
      error: { 
        message: '模擬付款處理失敗', 
        details: error.message 
      }
    }, 500);
  }
});

/**
 * POST /payment/callback
 * 藍新金流付款回調（未來整合用）
 * 
 * TODO: 整合藍新金流時實施
 */
payment.post('/callback', async (c) => {
  try {
    console.log('[Payment Callback] 接收到藍新金流回調');
    
    // TODO: 解密並驗證藍新金流回調資料
    const { Status, MerchantOrderNo, TradeNo } = await c.req.json();
    
    if (Status !== 'SUCCESS') {
      console.log(`[Payment Callback] ❌ 付款失敗: ${MerchantOrderNo}`);
      return c.json({ 
        success: false, 
        message: 'Payment failed' 
      });
    }
    
    console.log(`[Payment Callback] 付款成功: ${MerchantOrderNo}, TradeNo: ${TradeNo}`);
    
    // 處理付款成功
    const result = await processPaymentCallback(MerchantOrderNo, TradeNo);
    
    return c.json(result);
    
  } catch (error) {
    console.error('[Payment Callback] ❌ 錯誤:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

/**
 * 處理付款成功的核心邏輯
 * 
 * ✅ Phase 9.7: 修正自動創建刊登問題（Bug PHASE9-007）
 * 流程：
 * 1. 獲取訂單資訊
 * 2. 生成推薦碼（綁定到用戶，不綁定到刊登）
 * 3. ✅ 不創建刊登（由用戶手動創建）
 * 4. ✅ 創建訂閱資訊（獨立存儲）
 * 5. ✅ 更新用戶資料（registrationStep = 3 + referralCode）
 * 6. ✅ 記錄推薦來源
 * 7. 建立推薦關係（如果有推薦碼）
 * 8. 更新付款訂單狀態
 */
async function processPaymentCallback(orderId: string, tradeNo: string) {
  console.log(`[Process Payment] 開始處理付款回調: ${orderId}`);
  
  // 1. 獲取訂單資訊
  const paymentOrder = await kv.get(`payment_order:${orderId}`);
  
  if (!paymentOrder) {
    console.error(`[Process Payment] ❌ 訂單不存在: ${orderId}`);
    return {
      success: false,
      error: { message: '訂單不存在' }
    };
  }
  
  // ========== ✅ CRITICAL: 冪等性檢查（防止重複處理） ==========
  
  // 檢查 1: 訂單是否已處理
  if (paymentOrder.status === 'completed') {
    console.log(`[Process Payment] ⚠️ 訂單已處理過: ${orderId}`);
    return {
      success: true,
      message: '訂單已處理過',
      alreadyProcessed: true
    };
  }
  
  const { userId, referralCode } = paymentOrder;
  
  console.log(`[Process Payment] 用戶 ID: ${userId}`);
  console.log(`[Process Payment] 推薦碼: ${referralCode || '無'}`);
  
  // ========== ✅ CRITICAL: 用戶級別的冪等性檢查 ==========
  console.log(`[Process Payment] 🔍 執行用戶級別的冪等性檢查...`);
  
  // 獲取用戶資料
  const userProfile = await kv.get(`user:${userId}:profile`);
  
  if (!userProfile) {
    console.error(`[Process Payment] ❌ 用戶資料不存在: ${userId}`);
    return {
      success: false,
      error: { message: '用戶資料不存在' }
    };
  }
  
  // 檢查 2: 用戶是否已完成付款（registrationStep >= 3）
  if (userProfile.registrationStep >= 3) {
    console.error(`[Process Payment] 🚨 用戶已完成付款，拒絕重複處理！`);
    console.error(`[Process Payment] 用戶: ${userProfile.name} (${userId})`);
    console.error(`[Process Payment] 當前步驟: ${userProfile.registrationStep}`);
    console.error(`[Process Payment] 現有推薦碼: ${userProfile.referralCode}`);
    
    // 獲取用戶的訂閱信息
    const userSubscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
    const latestSubscriptionId = userSubscriptions[0];
    let subscriptionEndDate = null;
    
    if (latestSubscriptionId) {
      const subscription = await kv.get(`subscription:${latestSubscriptionId}`);
      if (subscription) {
        subscriptionEndDate = subscription.endDate;
      }
    }
    
    return {
      success: true,
      message: '用戶已完成付款',
      alreadyProcessed: true,
      data: {
        referralCode: userProfile.referralCode,
        subscriptionEndDate: subscriptionEndDate
      }
    };
  }
  
  // 檢查 3: 用戶是否已有推薦碼（雙重保險）
  if (userProfile.referralCode) {
    console.error(`[Process Payment] 🚨 用戶已有推薦碼，拒絕重複處理！`);
    console.error(`[Process Payment] 用戶: ${userProfile.name} (${userId})`);
    console.error(`[Process Payment] 現有推薦碼: ${userProfile.referralCode}`);
    
    return {
      success: true,
      message: '用戶已有推薦碼',
      alreadyProcessed: true,
      data: {
        referralCode: userProfile.referralCode
      }
    };
  }
  
  // 檢查 4: 用戶是否已有訂閱（三重保險）
  const existingSubscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
  
  if (existingSubscriptions.length > 0) {
    console.error(`[Process Payment] 🚨🚨🚨 嚴重錯誤：用戶已有訂閱記錄！`);
    console.error(`[Process Payment] 用戶: ${userProfile.name} (${userId})`);
    console.error(`[Process Payment] 訂閱數量: ${existingSubscriptions.length}`);
    console.error(`[Process Payment] 訂閱列表: ${JSON.stringify(existingSubscriptions)}`);
    console.error(`[Process Payment] 這可能是重複付款或數據異常，立即拒絕處理！`);
    
    // 記錄異常日誌
    const anomalyLogKey = `payment_anomaly_log:${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await kv.set(anomalyLogKey, {
      type: 'DUPLICATE_SUBSCRIPTION_DETECTED',
      userId: userId,
      userName: userProfile.name,
      orderId: orderId,
      existingSubscriptions: existingSubscriptions,
      timestamp: toTaiwanISOString(getTaiwanNow())
    });
    
    return {
      success: false,
      error: { 
        code: 'DUPLICATE_SUBSCRIPTION',
        message: '用戶已有訂閱記錄，請聯繫客服處理',
        details: `訂閱數量: ${existingSubscriptions.length}`
      }
    };
  }
  
  console.log(`[Process Payment] ✅ 冪等性檢查通過，開始處理付款...`);
  
  // ========== ✅ 分散式鎖：防止並發處理 ==========
  const lockKey = `payment_lock:${userId}`;
  const lockValue = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const lockTTL = 30000; // 30秒鎖定時間
  
  // 檢查鎖是否已存在
  const existingLock = await kv.get(lockKey);
  
  if (existingLock) {
    const lockAge = Date.now() - existingLock.timestamp;
    
    // 如果鎖已過期，強制釋放
    if (lockAge > lockTTL) {
      console.log(`[Process Payment] ⚠️ 鎖已過期，強制釋放: ${lockKey}`);
      await kv.del(lockKey);
    } else {
      console.error(`[Process Payment] 🚨 付款處理中，拒絕並發請求！`);
      console.error(`[Process Payment] 鎖: ${lockKey}, 剩餘時間: ${lockTTL - lockAge}ms`);
      
      return {
        success: false,
        error: {
          code: 'PAYMENT_IN_PROGRESS',
          message: '付款處理中，請稍候...',
          details: `請等待 ${Math.ceil((lockTTL - lockAge) / 1000)} 秒後再試`
        }
      };
    }
  }
  
  // 獲取鎖
  await kv.set(lockKey, {
    value: lockValue,
    timestamp: Date.now(),
    userId: userId,
    orderId: orderId
  });
  
  console.log(`[Process Payment] 🔒 獲取分散式鎖成功: ${lockKey}`);
  
  try {
    // ========== 開始處理付款 ==========
    
    // 記錄交易日誌 - 開始
    const transactionLogStartKey = `payment_transaction_log:${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await kv.set(transactionLogStartKey, {
      userId: userId,
      orderId: orderId,
      action: 'process_payment_start',
      timestamp: toTaiwanISOString(getTaiwanNow())
    });
    
    // 2. 生成推薦碼
    let newReferralCode = generateReferralCode();
    let codeAttempts = 0;
    while (await kv.get(`referral_code:${newReferralCode}`)) {
      console.log(`[Process Payment] ⚠️ 推薦碼衝突，重新生成: ${newReferralCode}`);
      newReferralCode = generateReferralCode();
      codeAttempts++;
      if (codeAttempts > 10) {
        throw new Error('無法生成唯一的推薦碼');
      }
    }
    console.log(`[Process Payment] ✅ 生成推薦碼: ${newReferralCode}`);
    
    // 記錄交易日誌 - 生成推薦碼
    const transactionLogCodeKey = `payment_transaction_log:${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await kv.set(transactionLogCodeKey, {
      userId: userId,
      orderId: orderId,
      action: 'generate_referral_code',
      referralCode: newReferralCode,
      timestamp: toTaiwanISOString(getTaiwanNow())
    });
    
    // 3. ✅ 不創建刊登（由用戶手動創建）
    const userProfile = await kv.get(`user:${userId}:profile`);
    
    if (!userProfile) {
      throw new Error('用資料不存在');
    }
    
    // ===== 計算訂閱日期 =====
    // ✅ 新規則：
    // - 起始日 = 付款當日 00:00:00
    // - 結束日 = 一年後的同一日 - 1天 23:59:59
    // - 下次扣款日 = 結束日（不是結束日 + 1）
    // 
    // 範例：2024/12/31 付款
    // - 起始日：2024/12/31 00:00:00
    // - 結束日：2025/12/30 23:59:59
    // - 下次扣款日：2025/12/30（結束日當天扣款）
    
    const now = getTaiwanNow();
    const createdAt = toTaiwanISOString(now);
    
    // 起始日：付款當日 00:00:00（台灣時區）
    const startDate = getTaiwanToday();
    
    // 結束日：一年後的同一日 - 1天 23:59:59（台灣時區）
    const endDate = calculateSubscriptionEndDate(startDate);
    
    // 寬限期結束日：結束日 + 60天 23:59:59
    const gracePeriodEnd = new Date(endDate.getTime() + (60 * 24 * 60 * 60 * 1000) - 1);
    
    // 下次扣款日：結束日當天 00:00:00
    const nextPaymentDate = new Date(endDate);
    nextPaymentDate.setHours(0, 0, 0, 0);
    
    console.log(`[Process Payment] ✅ 訂閱期間（台灣時區）: ${toTaiwanDateString(startDate)} - ${toTaiwanDateString(endDate)}`);
    console.log(`[Process Payment] ✅ 下次扣款日（台灣時區）: ${toTaiwanDateString(nextPaymentDate)}`);
    
    // ✅ 生成訂閱 ID
    const subscriptionId = `subscription_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // ✅ 建立推薦碼索引（綁定到用戶，listingId 初始為 null）
    await kv.set(`referral_code:${newReferralCode}`, {
      code: newReferralCode,
      userId: userId,
      listingId: null,  // ✅ 初始為 null，等用戶創建刊登時再更新
      userName: userProfile.name,
      listingName: null,  // ✅ 初始為 null
      createdAt: createdAt
    });
    
    console.log(`[Process Payment] ✅ 推薦碼索引創建成��（綁定到用戶）`);
    
    // ✅ 創建訂閱記錄（符合新規格）
    const subscription = {
      id: subscriptionId,
      userId: userId,
      status: 'Active',  // Active | Canceled | Expired | Grace
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      gracePeriodEnd: gracePeriodEnd.toISOString(),
      amount: YEARLY_PRICE,  // 1200
      paymentMethod: tradeNo === 'SIMULATED_TRADE_NO' ? 'simulated' : 'newebpay',
      paymentTransactionId: tradeNo,
      newebpayTradeNo: tradeNo !== 'SIMULATED_TRADE_NO' ? tradeNo : null,
      isCanceled: false,
      canceledAt: null,
      isRenewal: false,
      createdAt: createdAt,
      updatedAt: createdAt
    };
    
    // ✅ 存儲到正確的鍵（subscription:${subscriptionId}）
    await kv.set(`subscription:${subscriptionId}`, subscription);
    
    console.log(`[Process Payment] ✅ 訂閱記錄創建成功: ${subscriptionId}`);
    
    // ✅ 添加到用戶的訂閱列表（最新的在前面）
    const userSubscriptions = await kv.get(`user:${userId}:subscriptions`) || [];
    userSubscriptions.unshift(subscriptionId);
    await kv.set(`user:${userId}:subscriptions`, userSubscriptions);
    
    console.log(`[Process Payment] ✅ 用戶訂閱列表已更新`);
    
    // ✅ 創建用戶帳號狀態（SSOT - Single Source of Truth）
    const accountStatus = {
      status: 'Active',  // Active | Canceled | Grace | Fail
      currentSubscriptionId: subscriptionId,
      activeReferralCodeId: null,  // 稍後設置推薦碼 ID
      activeListingId: null,  // 用戶創建刊登時設置
      // ❌ 移除 pointBalance: 0,（違反 SSOT，點數由 user:${userId}:rewards 統一管理）
      lastStatusUpdate: createdAt,
      lastSubscriptionEndDate: endDate.toISOString(),
      gracePeriodEndDate: null  // 僅在 Grace 狀態時有值
    };
    
    await kv.set(`user:${userId}:account_status`, accountStatus);
    
    console.log(`[Process Payment] ✅ 用戶帳號狀態創建成功`);
    
    // 5. ✅ 更新用戶資料（registrationStep = 3 + referralCode）
    const updatedProfile = {
      ...userProfile,
      registrationStep: 3,
      referralCode: newReferralCode,  // ✅ 推薦碼存在用戶資料中
      updatedAt: toTaiwanISOString(getTaiwanNow())  // ✅ 修復：使用台灣時區
    };
    
    await kv.set(`user:${userId}:profile`, updatedProfile);
    
    console.log(`[Process Payment] ✅ 用戶資料更新成功`);
    
    // 6. ✅ 記錄推薦來源
    if (referralCode) {
      console.log(`========== 🔗 開始處理推薦關係 ==========`);
      console.log(`[Process Payment] 被推薦人用戶ID: ${userId}`);
      console.log(`[Process Payment] 使用推薦碼: ${referralCode}`);
      
      const referralData = await kv.get(`referral_code:${referralCode}`);
      
      if (referralData) {
        const referrerUserId = referralData.userId;
        
        console.log(`[Process Payment] ✅ 找到推薦人用戶ID: ${referrerUserId}`);
        console.log(`[Process Payment] 推薦人用戶名: ${referralData.userName}`);
        
        // ✅ 1. 記錄推薦來源
        await kv.set(`user:${userId}:referred_by`, {
          referrerUserId: referrerUserId,
          referrerListingId: referralData.listingId,  // 可能為 null
          referrerUserName: referralData.userName,
          referrerListingName: referralData.listingName,  // 可能為 null
          referredAt: createdAt,
          generation: 1 // 第1代
        });
        
        console.log(`[Process Payment] ✅ 推薦來源已記錄: user:${userId}:referred_by`);
        
        // ✅ 2. 立即更新推薦人的推薦樹（不需要等創建刊登）
        console.log(`[Process Payment] 🌲 開始更新推薦人的推薦樹...`);
        
        const referralTreeKey = `user:${referrerUserId}:referral_tree`;
        const referralTree = await kv.get(referralTreeKey) || {
          firstGeneration: [],
          secondGeneration: [],
          thirdGeneration: []
        };
        
        console.log(`[Process Payment] 當前推薦樹: 1代=${referralTree.firstGeneration.length}, 2代=${referralTree.secondGeneration.length}, 3代=${referralTree.thirdGeneration.length}`);
        
        // 組裝被推薦人信息（此時還沒有刊登）
        const newMember = {
          userId: userId,
          userName: userProfile.name,
          userReferralCode: newReferralCode,  // ✅ 被推薦者的推薦碼
          listingId: null,          // ✅ 付款時還沒有刊登
          listingName: null,        // ✅ 付款時還沒有刊登
          serviceType: null,        // ✅ 付款時還沒有刊登
          city: null,               // ✅ 付款時還沒有刊登
          activeUntil: endDate.toISOString(),  // 使用訂閱結束日期
          isActive: true,
          referrer: null,           // 一代沒有上級推薦人
          createdAt: createdAt
        };
        
        // 加入到一代推薦
        referralTree.firstGeneration.push(newMember);
        referralTree.lastUpdated = createdAt;
        
        await kv.set(referralTreeKey, referralTree);
        
        console.log(`[Process Payment] ✅ 推薦樹已更新: user:${referrerUserId}:referral_tree`);
        console.log(`[Process Payment] 新增成員: ${userProfile.name} (userId: ${userId})`);
        console.log(`[Process Payment] 更新後推薦樹: 1代=${referralTree.firstGeneration.length}`);
        
        // ✅ 3. 更新推薦人的推薦統計（備份數據，實際統計從 referral_tree 實時計算）
        // ⚠️ 架構變更說明：
        // - 實際統計從 referral_tree 實時計算（參考 referrals.ts 第 155-162 行）
        // - referral_stats 保留作為備份數據，以便未來回滾或比對驗證
        // - 前端顯示的統計數字永遠從 referral_tree.length 計算，不讀取此 stats
        const statsKey = `user:${referrerUserId}:referral_stats`;
        const stats = await kv.get(statsKey) || {
          totalReferrals: 0,
          firstGenCount: 0,
          secondGenCount: 0,
          thirdGenCount: 0
        };
        
        stats.totalReferrals += 1;
        stats.firstGenCount += 1;
        stats.lastUpdated = createdAt;
        
        await kv.set(statsKey, stats);
        
        console.log(`[Process Payment] ℹ️ referral_stats 已更新（僅作為備份，實際統計從 referral_tree 計算）`);
        console.log(`[Process Payment] 備份統計: 總推薦數=${stats.totalReferrals}, 一代=${stats.firstGenCount}`);
        
        // ✅ 4. 遞歸處理二代、三代推薦關係（向上追溯）
        console.log(`[Process Payment] 🔄 開始處理二代、三代推薦關係...`);
        
        // 檢查推薦人是否也有推薦人（二代）
        const referrerReferredBy = await kv.get(`user:${referrerUserId}:referred_by`);
        
        if (referrerReferredBy && referrerReferredBy.referrerUserId) {
          const gen2ReferrerUserId = referrerReferredBy.referrerUserId;
          
          console.log(`[Process Payment] 🔍 找到二代推薦人: ${gen2ReferrerUserId}`);
          
          // 獲取推薦人的推薦碼
          const referrerProfile = await kv.get(`user:${referrerUserId}:profile`);
          
          // 更新二代推薦人的推薦樹
          const gen2TreeKey = `user:${gen2ReferrerUserId}:referral_tree`;
          const gen2Tree = await kv.get(gen2TreeKey) || {
            firstGeneration: [],
            secondGeneration: [],
            thirdGeneration: []
          };
          
          const gen2Member = {
            userId: userId,
            userName: userProfile.name,
            userReferralCode: newReferralCode,  // ✅ 被推薦者的推薦碼
            listingId: null,
            listingName: null,
            serviceType: null,
            city: null,
            activeUntil: endDate.toISOString(),
            isActive: true,
            referrer: {  // 二代的推薦人是一代
              userId: referrerUserId,
              userName: referralData.userName,
              userReferralCode: referrerProfile?.referralCode || null,  // ✅ 推薦人的推薦碼
              listingId: referralData.listingId,
              listingName: referralData.listingName
            },
            createdAt: createdAt
          };
          
          gen2Tree.secondGeneration.push(gen2Member);
          gen2Tree.lastUpdated = createdAt;
          
          await kv.set(gen2TreeKey, gen2Tree);
          
          console.log(`[Process Payment] ✅ 二代推薦樹已更新: ${gen2TreeKey}`);
          console.log(`[Process Payment] 新增二代成員: ${userProfile.name} (通過 ${referralData.userName})`);
          
          // 更新二代推薦人的統計
          const gen2StatsKey = `user:${gen2ReferrerUserId}:referral_stats`;
          const gen2Stats = await kv.get(gen2StatsKey) || {
            totalReferrals: 0,
            firstGenCount: 0,
            secondGenCount: 0,
            thirdGenCount: 0
          };
          
          gen2Stats.totalReferrals += 1;
          gen2Stats.secondGenCount += 1;
          gen2Stats.lastUpdated = createdAt;
          
          await kv.set(gen2StatsKey, gen2Stats);
          
          console.log(`[Process Payment] ✅ 二代推薦統計已更新`);
          
          // 檢查二代推薦人是否也有推薦人（三代）
          const gen2ReferredBy = await kv.get(`user:${gen2ReferrerUserId}:referred_by`);
          
          if (gen2ReferredBy && gen2ReferredBy.referrerUserId) {
            const gen3ReferrerUserId = gen2ReferredBy.referrerUserId;
            
            console.log(`[Process Payment] 🔍 找到三代推薦人: ${gen3ReferrerUserId}`);
            
            // ✅ 修正：獲取一代推薦人（referrerUserId）的 profile，而非二代
            // 因為三代的推薦人應該是二代（在三代視角），也就是一代推薦人
            // referrerProfile 已在 Line 469 獲取，直接使用
            
            // 更新三代推薦人的推薦樹
            const gen3TreeKey = `user:${gen3ReferrerUserId}:referral_tree`;
            const gen3Tree = await kv.get(gen3TreeKey) || {
              firstGeneration: [],
              secondGeneration: [],
              thirdGeneration: []
            };
            
            const gen3Member = {
              userId: userId,
              userName: userProfile.name,
              userReferralCode: newReferralCode,  // ✅ 被推薦者的推薦碼
              listingId: null,
              listingName: null,
              serviceType: null,
              city: null,
              activeUntil: endDate.toISOString(),
              isActive: true,
              referrer: {  // ✅ 修正：三代的推薦人應該是二代（一代推薦人）
                userId: referrerUserId,  // ✅ 修正：使用一代推薦人 ID（Tank）
                userName: referrerProfile?.name || '未知用戶',  // ✅ 修正：使用一代推薦人名字（Tank）
                userReferralCode: referrerProfile?.referralCode || null,  // ✅ 修正：使用一代推薦人推薦碼
                listingId: referralData.listingId,  // ✅ 修正：使用一代推薦人刊登 ID
                listingName: referralData.listingName  // ✅ 修正：使用一代推薦人刊登名稱
              },
              createdAt: createdAt
            };
            
            gen3Tree.thirdGeneration.push(gen3Member);
            gen3Tree.lastUpdated = createdAt;
            
            await kv.set(gen3TreeKey, gen3Tree);
            
            console.log(`[Process Payment] ✅ 三代推薦樹已更新: ${gen3TreeKey}`);
            console.log(`[Process Payment] 新增三代成員: ${userProfile.name} (通過 ${referrerProfile?.name || '未知用戶'})`);
            
            // 更新三代推薦人的統計
            const gen3StatsKey = `user:${gen3ReferrerUserId}:referral_stats`;
            const gen3Stats = await kv.get(gen3StatsKey) || {
              totalReferrals: 0,
              firstGenCount: 0,
              secondGenCount: 0,
              thirdGenCount: 0
            };
            
            gen3Stats.totalReferrals += 1;
            gen3Stats.thirdGenCount += 1;
            gen3Stats.lastUpdated = createdAt;
            
            await kv.set(gen3StatsKey, gen3Stats);
            
            console.log(`[Process Payment] ✅ 三代推薦統計已更新`);
          } else {
            console.log(`[Process Payment] ℹ️ 無三代推薦關係`);
          }
        } else {
          console.log(`[Process Payment] ℹ️ 無二代推薦關係`);
        }
        
        console.log(`========== ✅ 推薦關係處理完成 ==========`);
        
        // ========== ✅ Phase 1: 發放上三代的首月獎勵 ==========
        console.log(`========== 💰 開始發放首月獎勵 ==========`);
        
        try {
          // 發放一代獎勵
          await issueImmediateReward(
            referrerUserId,      // 推薦人用戶ID
            userId,              // 被推薦人用戶ID
            userProfile.name,    // 被推薦人姓名
            newReferralCode,     // 被推薦人推薦碼
            1,                   // 第1代
            1,                   // 第1個月
            10                   // 10 Points
          );
          console.log(`[Process Payment] ✅ 一代獎勵已發放`);
          
          // 發放二代獎勵（如果存在）
          if (referrerReferredBy && referrerReferredBy.referrerUserId) {
            await issueImmediateReward(
              referrerReferredBy.referrerUserId,
              userId,
              userProfile.name,
              newReferralCode,
              2,
              1,
              10
            );
            console.log(`[Process Payment] ✅ 二代獎勵已發放`);
            
            // 發放三代獎勵（如果存在）
            const gen2ReferredBy = await kv.get(`user:${referrerReferredBy.referrerUserId}:referred_by`);
            if (gen2ReferredBy && gen2ReferredBy.referrerUserId) {
              await issueImmediateReward(
                gen2ReferredBy.referrerUserId,
                userId,
                userProfile.name,
                newReferralCode,
                3,
                1,
                10
              );
              console.log(`[Process Payment] ✅ 三代獎勵已發放`);
            }
          }
          
          console.log(`========== ✅ 首月獎勵發放完成 ==========`);
        } catch (error) {
          console.error(`========== ❌ 首月獎勵發放失敗 ==========`);
          console.error(error);
          // 不中斷流程，繼續執行後續步驟
        }
        
        // ========== ✅ Phase 2: 創建後續 11 個月的獎勵排程 ==========
        console.log(`========== 📅 開始創建後續 11 個月的獎勵排程 ==========`);
        
        try {
          // 創建第 2~12 個月的排程
          await createRewardSchedules(
            referrerUserId,      // 推薦人用戶ID
            userId,              // 被推薦人用戶ID
            userProfile.name,    // 被推薦人姓名
            newReferralCode,     // 被推薦人推薦碼
            1,                   // 第1代
            endDate              // 訂閱結束日期
          );
          console.log(`[Process Payment] ✅ 一代排程已創建`);
          
          // 創建第 2~12 個月的排程（如果存在）
          if (referrerReferredBy && referrerReferredBy.referrerUserId) {
            await createRewardSchedules(
              referrerReferredBy.referrerUserId,
              userId,
              userProfile.name,
              newReferralCode,
              2,
              endDate
            );
            console.log(`[Process Payment] ✅ 二代排程已創建`);
            
            // 創建第 2~12 個月的排程（如果存在）
            const gen2ReferredBy = await kv.get(`user:${referrerReferredBy.referrerUserId}:referred_by`);
            if (gen2ReferredBy && gen2ReferredBy.referrerUserId) {
              await createRewardSchedules(
                gen2ReferredBy.referrerUserId,
                userId,
                userProfile.name,
                newReferralCode,
                3,
                endDate
              );
              console.log(`[Process Payment] ✅ 三代排程已創建`);
            }
          }
          
          console.log(`========== ✅ 後續 11 個月的獎勵排程創建完成 ==========`);
        } catch (error) {
          console.error(`========== ❌ 後續 11 個月的獎勵排程創建失敗 ==========`);
          console.error(error);
          // 不中斷流程，繼續執行後續步驟
        }
        
        // ========== ✅ Phase 4: 更新推薦者的任務進度 ==========
        console.log(`========== 🎯 開始更新推薦者的任務進度 ==========`);
        
        try {
          // 只有一代推薦才計入任務（連續推薦達人 + 推薦王）
          // 二代、三代不計入任務
          
          // ✅ 1. 更新任務進度
          await updateTaskProgress(
            referrerUserId,  // 推薦人用戶ID
            createdAt        // 付款時間戳
          );
          
          console.log(`[Process Payment] ✅ 推薦者任務進度已更新`);
          
          // ✅ 2. 更新月度日誌（新增）
          await updateReferralMonthlyLog(
            referrerUserId,  // 推薦人用戶ID
            {
              userId: userId,
              userName: userProfile.name,
              userReferralCode: newReferralCode,  // ✅ 被推薦人的推薦碼
              listingId: null,                    // ✅ 付費時還沒有刊登
              listingName: null,
              referrer: null                      // ✅ ��代沒有推薦人
            },
            createdAt
          );
          
          console.log(`[Process Payment] ✅ 推薦者月度日誌已更新`);
          console.log(`========== ✅ 推薦者任務進度和月度日誌更新完成 ==========`);
        } catch (error) {
          console.error(`========== ❌ 推薦者任務進度更新失敗 ==========`);
          console.error(error);
          // 不中斷流程，繼續執行後續步驟
        }
        
      } else {
        console.log(`[Process Payment] ❌ 推薦碼無效: ${referralCode}`);
        console.log(`========== ❌ 推薦關係處理失敗 ==========`);
      }
    } else {
      console.log(`[Process Payment] ℹ️ 無推薦碼或使用默認推薦碼，跳過推薦關係處理`);
    }
    
    // 8. 更新付款訂單狀態
    await kv.set(`payment_order:${orderId}`, {
      ...paymentOrder,
      status: 'completed',
      completedAt: toTaiwanISOString(getTaiwanNow()),  // ✅ 修復：使用台灣時區
      tradeNo: tradeNo,
      referralCode: newReferralCode
    });
    
    console.log(`[Process Payment] ✅ 付款處理完成`);
    
    return {
      success: true,
      data: {
        referralCode: newReferralCode,
        subscriptionEndDate: endDate.toISOString(),
        message: '付款成功，請到刊登管理創建您的第一筆刊登'
      }
    };
    
  } catch (error) {
    console.error(`[Process Payment] ❌ 處理失敗:`, error);
    
    // 標記訂單為失敗
    await kv.set(`payment_order:${orderId}`, {
      ...paymentOrder,
      status: 'failed',
      failedAt: toTaiwanISOString(getTaiwanNow()),  // ✅ 修復：使用台灣時區
      errorMessage: error.message
    });
    
    return {
      success: false,
      error: { 
        message: '付款處理失敗', 
        details: error.message 
      }
    };
  } finally {
    // 釋放鎖
    await kv.del(lockKey);
    console.log(`[Process Payment] 🔓 釋放分散式鎖: ${lockKey}`);
  }
}

/**
 * 生成推薦碼（3個小寫英文字母 + 6個數字）
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
 * 
 * @param receiverUserId - 接收獎勵的用戶ID（推薦人）
 * @param refereeUserId - 被推薦人用戶ID
 * @param refereeName - 被推薦人姓名
 * @param refereeCode - 被推薦人推薦碼
 * @param generation - 第幾代（1/2/3）
 * @param monthNumber - 第幾個月（始終為 1）
 * @param amount - 獎勵金額（10P）
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
  console.log(`💰 發放首月獎勵: 用戶=${receiverUserId}, 第${generation}代, ${amount}P`);
  
  try {
    // ❌ 移除：不再更新 account_status.pointBalance（違反 SSOT）
    // 點數統一由 user:${userId}:rewards 管理
    
    // ✅ 更新獎勵統計數據（SSOT）
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
    
    // 3. 記錄到獎勵歷史
    const historyKey = `user:${receiverUserId}:reward_history`;
    const history = await kv.get(historyKey) || [];
    
    // ✅ 正確格式：一代推薦-被推薦者姓名-被推薦者推薦碼-第1個月
    const generationText = generation === 1 ? '一代' : generation === 2 ? '二代' : '三代';
    const description = `${generationText}-${refereeName}-${refereeCode}-第${monthNumber}個月`;
    
    // ✅ 計算交易後餘額
    const balanceAfterTransaction = rewards.availableRewards + rewards.pendingRewards;
    
    history.unshift({
      id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: `referral_gen${generation}_month${monthNumber}`,
      amount,
      balance: balanceAfterTransaction,  // ✅ 新增：交易後餘額
      referee: {
        userId: refereeUserId,
        userName: refereeName,
        userReferralCode: refereeCode  // ✅ 包含被推薦人推薦碼
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
  } catch (error) {
    console.error(`   ❌ 發放獎勵失敗: ${error.message}`);
    throw error;
  }
}

/**
 * 創建後續 11 個月的獎勵排程
 * 
 * @param receiverUserId - 接收獎勵的用戶ID（推薦人）
 * @param refereeUserId - 被推薦人用戶ID
 * @param refereeName - 被推薦人姓名
 * @param refereeCode - 被推薦人推薦碼
 * @param generation - 第幾代（1/2/3）
 * @param subscriptionEndDate - 訂閱結束日期
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
          userReferralCode: refereeCode  // ✅ 包含被推薦人推薦碼
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
  } catch (error) {
    console.error(`   ❌ 創建排程失敗: ${error.message}`);
    throw error;
  }
}

/**
 * GET /payment/order/:orderId
 * 查詢訂單狀態
 */
payment.get('/order/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId');
    
    console.log(`[Get Order Status] 查詢訂單: ${orderId}`);
    
    const order = await kv.get(`payment_order:${orderId}`);
    
    if (!order) {
      return c.json({
        success: false,
        error: { message: '訂單不存在' }
      }, 404);
    }
    
    // 移除敏感資料
    const { listingData, ...safeOrderData } = order;
    
    return c.json({
      success: true,
      data: safeOrderData
    });
    
  } catch (error) {
    console.error('[Get Order Status] ❌ 錯誤:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

export default payment;