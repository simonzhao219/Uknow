import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { updateTaskProgress, updateReferralMonthlyLog } from './task_helpers.ts';

const payment = new Hono();

// ===== 常數定義 =====
const YEARLY_PRICE = 1200; // 年費（新台幣）

/**
 * POST /payment/create-order
 * 創建付款訂單
 * 
 * 說明：
 * 1. 驗證用戶身份
 * 2. 檢查是否已有付款訂單（避免重複）
 * 3. 生成訂單編號
 * 4. 暫存訂單資訊
 * 5. 返回付款資訊（目前為模擬，未來整合藍新金流）
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
    
    // 3. 獲取請求資料
    const body = await c.req.json();
    const { listingData, referralCode } = body;
    
    console.log(`[Create Payment Order] 刊登資料:`, listingData);
    console.log(`[Create Payment Order] 推薦碼: ${referralCode || '無'}`);
    
    // 4. 生成訂單編號
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`[Create Payment Order] ✅ 生成訂單編號: ${orderId}`);
    
    // 5. 暫存訂單資訊（包含刊登資料和推薦碼）
    const orderData = {
      orderId,
      userId: user.id,
      amount: YEARLY_PRICE,
      status: 'pending',
      listingData,
      referralCode: referralCode || null,
      createdAt: new Date().toISOString()
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
 * 流程：
 * 1. 獲取訂單資訊
 * 2. 創建刊登（呼叫 listings.ts 的邏輯）
 * 3. 生成推薦碼
 * 4. 建立推薦關係（如果有推薦碼）
 * 5. 更新訂單狀態
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
  
  // 檢查訂單是否已處理
  if (paymentOrder.status === 'completed') {
    console.log(`[Process Payment] ⚠️ 訂單已處理過: ${orderId}`);
    return {
      success: true,
      message: '訂單已處理過',
      alreadyProcessed: true
    };
  }
  
  const { userId, listingData, referralCode } = paymentOrder;
  
  console.log(`[Process Payment] 用戶 ID: ${userId}`);
  console.log(`[Process Payment] 推薦碼: ${referralCode || '無'}`);
  
  try {
    // 2. 創建刊登（這裡會生成推薦碼）
    // 注意：這裡直接操作 KV Store，而不是呼叫 HTTP API
    
    const userProfile = await kv.get(`user:${userId}:profile`);
    
    if (!userProfile) {
      throw new Error('用戶資料不存在');
    }
    
    // ===== 生成刊登 ID =====
    const listingId = `listing_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`[Process Payment] ✅ 生成刊登 ID: ${listingId}`);
    
    // ===== 生成9碼推薦碼 =====
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
    
    // ===== 計算訂閱日期 =====
    const now = new Date();
    const createdAt = now.toISOString();
    
    const nextPaymentDate = new Date(now);
    nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
    
    const activeUntil = new Date(nextPaymentDate);
    activeUntil.setDate(activeUntil.getDate() - 1);
    activeUntil.setHours(23, 59, 59, 999);
    
    console.log(`[Process Payment] 訂閱有效期限: ${activeUntil.toISOString()}`);
    
    // ===== 處理推薦關係 =====
    let referrerUserId = null;
    let referrerListingId = null;
    
    if (referralCode && referralCode !== 'DEFAULTRCM01') {
      console.log(`[Process Payment] 處理推薦關係: ${referralCode}`);
      
      const referralData = await kv.get(`referral_code:${referralCode}`);
      
      if (referralData) {
        referrerUserId = referralData.userId;
        
        // 獲取推薦人的刊登 ID
        const referrerListing = await kv.get(`user:${referrerUserId}:listing`);
        if (referrerListing) {
          referrerListingId = referrerListing.id;
        }
        
        console.log(`[Process Payment] ✅ 推薦人: ${referrerUserId}`);
      } else {
        console.log(`[Process Payment] ⚠️ 推薦碼無效，但繼續創建刊登`);
      }
    }
    
    // ===== 創建刊登資料 =====
    const listing = {
      id: listingId,
      userId: userId,
      name: listingData.name,
      category: listingData.category,
      gender: listingData.gender,
      city: listingData.city,
      districts: listingData.districts,
      description: listingData.description || '',
      photos: listingData.photos,
      contacts: listingData.contacts,
      referralCode: newReferralCode,
      referrerUserId: referrerUserId,
      referrerListingId: referrerListingId,
      subscriptionPlan: 'yearly',
      lastPaymentDate: createdAt,
      nextPaymentDate: nextPaymentDate.toISOString(),
      activeUntil: activeUntil.toISOString(),
      isActive: true,
      createdAt: createdAt,
      updatedAt: createdAt
    };
    
    // 儲存刊登
    await kv.set(`listing:${listingId}`, listing);
    await kv.set(`user:${userId}:listing`, listing);
    
    // 建立推薦碼索引
    await kv.set(`referral_code:${newReferralCode}`, {
      code: newReferralCode,
      userId: userId,
      listingId: listingId,
      userName: userProfile.name,
      createdAt: createdAt
    });
    
    console.log(`[Process Payment] ✅ 刊登創建成功: ${listingId}`);
    
    // ===== 處理推薦關係（如果有推薦人）=====
    if (referrerUserId && referrerListingId) {
      console.log(`[Process Payment] 建立推薦關係...`);
      
      // ✅ Phase 5: 實施完整的推薦關係建立邏輯
      await createReferralRelationships(
        userId,
        listingId,
        userProfile.name,
        listingData.name,
        referrerUserId,
        referrerListingId,
        createdAt
      );
      
      console.log(`[Process Payment] ✅ 推薦關係已建立`);
    }
    
    // 3. 更新付款訂單狀態
    await kv.set(`payment_order:${orderId}`, {
      ...paymentOrder,
      status: 'completed',
      completedAt: new Date().toISOString(),
      tradeNo: tradeNo,
      listingId: listingId,
      referralCode: newReferralCode
    });
    
    console.log(`[Process Payment] ✅ 付款處理完成`);
    
    return {
      success: true,
      data: {
        listingId,
        referralCode: newReferralCode,
        activeUntil: activeUntil.toISOString(),
        message: '付款成功，刊登已創建'
      }
    };
    
  } catch (error) {
    console.error(`[Process Payment] ❌ 處理失敗:`, error);
    
    // 標記訂單為失敗
    await kv.set(`payment_order:${orderId}`, {
      ...paymentOrder,
      status: 'failed',
      failedAt: new Date().toISOString(),
      errorMessage: error.message
    });
    
    return {
      success: false,
      error: { 
        message: '付款處理失敗', 
        details: error.message 
      }
    };
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
 * ✅ Phase 5: 創建推薦關係（完整的三代推薦邏輯）
 * 
 * 說明：
 * 1. 建立第1代推薦關係（新用戶 → 推薦人）
 * 2. 更新推薦人的推薦樹
 * 3. 遞歸處理第2代和第3代
 * 4. 發放第1個月獎勵
 * 5. 創建後續11個月的獎勵排程
 * 6. 更新任務進度
 * 
 * @param newUserId - 新用戶 ID
 * @param newListingId - 新刊登 ID
 * @param newUserName - 新用戶名稱
 * @param newListingName - 新刊登名稱
 * @param referrerUserId - 推薦人用戶 ID
 * @param referrerListingId - 推薦人刊登 ID
 * @param createdAt - 創建時間
 */
async function createReferralRelationships(
  newUserId: string,
  newListingId: string,
  newUserName: string,
  newListingName: string,
  referrerUserId: string,
  referrerListingId: string,
  createdAt: string
): Promise<void> {
  console.log('[Create Referral Relationships] 開始建立推薦關係...');
  console.log(`  新用戶: ${newUserId} (${newUserName} - ${newListingName})`);
  console.log(`  推薦人: ${referrerUserId}`);
  
  // ===== 1. 獲取推薦人資料 =====
  const referrerProfile = await kv.get(`user:${referrerUserId}:profile`);
  const referrerListing = await kv.get(`listing:${referrerListingId}`);
  
  if (!referrerProfile || !referrerListing) {
    console.error('[Create Referral Relationships] ❌ 推薦人資料不完整');
    return;
  }
  
  console.log(`  推薦人資料: ${referrerProfile.name} - ${referrerListing.name}`);
  
  // ===== 2. 獲取新用戶的刊登資料 =====
  const newListing = await kv.get(`listing:${newListingId}`);
  
  if (!newListing) {
    console.error('[Create Referral Relationships] ❌ 新刊登資料不存在');
    return;
  }
  
  // ===== 3. 建立第1代推薦關係 =====
  console.log('[Create Referral Relationships] 處理第1代推薦關係...');
  
  // 3.1 更新推薦人的推薦樹（第1代）
  const referrerTree = await kv.get(`listing:${referrerListingId}:referral_tree`) || {
    firstGeneration: [],
    secondGeneration: [],
    thirdGeneration: [],
    lastUpdated: null
  };
  
  // 新增到第1代
  referrerTree.firstGeneration.push({
    listingId: newListingId,
    publicListingId: newListingId, // 暫時使用相同值
    userId: newUserId,
    userPublicId: newUserId, // 暫時使用相同值
    userName: newUserName,
    listingName: newListingName,
    category: newListing.category,
    city: newListing.city,
    gender: newListing.gender,
    createdAt: createdAt,
    activeUntil: newListing.activeUntil
  });
  
  referrerTree.lastUpdated = createdAt;
  
  await kv.set(`listing:${referrerListingId}:referral_tree`, referrerTree);
  
  console.log(`  ✅ 第1代推薦關係已建立（推薦人: ${referrerUserId}）`);
  
  // 3.2 記錄新用戶的推薦來源
  await kv.set(`user:${newUserId}:referred_by`, {
    referrerUserId: referrerUserId,
    referrerListingId: referrerListingId,
    referrerUserName: referrerProfile.name,
    referrerListingName: referrerListing.name,
    referredAt: createdAt,
    generation: 1 // 第1代
  });
  
  // 3.3 發放第1個月獎勵（第1代：$10）
  console.log('[Create Referral Relationships] 發放第1代第1個月獎勵...');
  
  await issueReferralReward(
    referrerUserId,
    newUserId,
    newUserName,
    newListingName,
    1, // 第1代
    1, // 第1個月
    10, // $10
    createdAt
  );
  
  // 3.4 創建後續11個月的獎勵排程
  await createRewardSchedules(
    referrerUserId,
    newUserId,
    newUserName,
    newListingName,
    1, // 第1代
    10, // $10
    createdAt
  );
  
  // 3.5 更新任務進度
  await updateTaskProgress(referrerUserId, newUserId, createdAt);
  
  console.log('  ✅ 第1代處理完成');
  
  // ===== 4. 處理第2代和第3代（遞歸）=====
  // 檢查推薦人是否也是被推薦人（即推薦人有上級）
  const referrerReferredBy = await kv.get(`user:${referrerUserId}:referred_by`);
  
  if (referrerReferredBy) {
    console.log('[Create Referral Relationships] 處理第2代推薦關係...');
    
    const gen2ReferrerId = referrerReferredBy.referrerUserId;
    const gen2ReferrerListingId = referrerReferredBy.referrerListingId;
    
    // 獲取第2代推薦人資料
    const gen2ReferrerProfile = await kv.get(`user:${gen2ReferrerId}:profile`);
    const gen2ReferrerListing = await kv.get(`listing:${gen2ReferrerListingId}`);
    
    if (gen2ReferrerProfile && gen2ReferrerListing) {
      // 4.1 更新第2代推薦人的推薦樹
      const gen2Tree = await kv.get(`listing:${gen2ReferrerListingId}:referral_tree`) || {
        firstGeneration: [],
        secondGeneration: [],
        thirdGeneration: [],
        lastUpdated: null
      };
      
      // 新增到第2代
      gen2Tree.secondGeneration.push({
        listingId: newListingId,
        publicListingId: newListingId,
        userId: newUserId,
        userPublicId: newUserId,
        userName: newUserName,
        listingName: newListingName,
        category: newListing.category,
        city: newListing.city,
        gender: newListing.gender,
        createdAt: createdAt,
        activeUntil: newListing.activeUntil,
        // ✅ 新增：推薦人信息（第2代需要知道是誰推薦的）
        referrer: {
          ownerName: referrerProfile.name,
          listingName: referrerListing.name
        }
      });
      
      gen2Tree.lastUpdated = createdAt;
      
      await kv.set(`listing:${gen2ReferrerListingId}:referral_tree`, gen2Tree);
      
      console.log(`  ✅ 第2代推薦關係已建立（推薦人: ${gen2ReferrerId}）`);
      
      // 4.2 發放第2代第1個月獎勵（$5）
      await issueReferralReward(
        gen2ReferrerId,
        newUserId,
        newUserName,
        newListingName,
        2, // 第2代
        1, // 第1個月
        5, // $5
        createdAt,
        referrerProfile.name,
        referrerListing.name
      );
      
      // 4.3 創建第2代後續11個月的獎勵排程
      await createRewardSchedules(
        gen2ReferrerId,
        newUserId,
        newUserName,
        newListingName,
        2, // 第2代
        5, // $5
        createdAt,
        referrerProfile.name,
        referrerListing.name
      );
      
      console.log('  ✅ 第2代處理完成');
      
      // ===== 5. 處理第3代 =====
      const gen2ReferredBy = await kv.get(`user:${gen2ReferrerId}:referred_by`);
      
      if (gen2ReferredBy) {
        console.log('[Create Referral Relationships] 處理第3代推薦關係...');
        
        const gen3ReferrerId = gen2ReferredBy.referrerUserId;
        const gen3ReferrerListingId = gen2ReferredBy.referrerListingId;
        
        // 獲取第3代推薦人資料
        const gen3ReferrerProfile = await kv.get(`user:${gen3ReferrerId}:profile`);
        const gen3ReferrerListing = await kv.get(`listing:${gen3ReferrerListingId}`);
        
        if (gen3ReferrerProfile && gen3ReferrerListing) {
          // 5.1 更新第3代推薦人的推薦樹
          const gen3Tree = await kv.get(`listing:${gen3ReferrerListingId}:referral_tree`) || {
            firstGeneration: [],
            secondGeneration: [],
            thirdGeneration: [],
            lastUpdated: null
          };
          
          // 新增到第3代
          gen3Tree.thirdGeneration.push({
            listingId: newListingId,
            publicListingId: newListingId,
            userId: newUserId,
            userPublicId: newUserId,
            userName: newUserName,
            listingName: newListingName,
            category: newListing.category,
            city: newListing.city,
            gender: newListing.gender,
            createdAt: createdAt,
            activeUntil: newListing.activeUntil,
            // ✅ 新增：推薦人信息（第3代需要知道是誰推薦的）
            referrer: {
              ownerName: gen2ReferrerProfile.name,
              listingName: gen2ReferrerListing.name
            }
          });
          
          gen3Tree.lastUpdated = createdAt;
          
          await kv.set(`listing:${gen3ReferrerListingId}:referral_tree`, gen3Tree);
          
          console.log(`  ✅ 第3代推薦關係已建立（推薦人: ${gen3ReferrerId}）`);
          
          // 5.2 發放第3代第1個月獎勵（$3）
          await issueReferralReward(
            gen3ReferrerId,
            newUserId,
            newUserName,
            newListingName,
            3, // 第3代
            1, // 第1個月
            3, // $3
            createdAt,
            gen2ReferrerProfile.name,
            gen2ReferrerListing.name
          );
          
          // 5.3 創建第3代後續11個月的獎勵排程
          await createRewardSchedules(
            gen3ReferrerId,
            newUserId,
            newUserName,
            newListingName,
            3, // 第3代
            3, // $3
            createdAt,
            gen2ReferrerProfile.name,
            gen2ReferrerListing.name
          );
          
          console.log('  ✅ 第3代處理完成');
        }
      }
    }
  }
  
  console.log('[Create Referral Relationships] ✅ 推薦關係建立完成');
}

/**
 * 發放推薦獎勵（第1個月）
 * 
 * @param receiverUserId - 接收獎勵的用戶 ID
 * @param refereeUserId - 被推薦人用戶 ID
 * @param refereeUserName - 被推薦人用戶名
 * @param refereeListingName - 被推薦人刊登名稱
 * @param generation - 代數（1, 2, 3）
 * @param monthNumber - 月份（1-12）
 * @param amount - 獎勵金額
 * @param issuedAt - 發放時間
 * @param intermediateUserName - 中間推薦人名稱（第2代、第3代需要）
 * @param intermediateListingName - 中間推薦人刊登名稱（第2代、第3代需要）
 */
async function issueReferralReward(
  receiverUserId: string,
  refereeUserId: string,
  refereeUserName: string,
  refereeListingName: string,
  generation: number,
  monthNumber: number,
  amount: number,
  issuedAt: string,
  intermediateUserName?: string,
  intermediateListingName?: string
): Promise<void> {
  console.log(`[Issue Reward] 發放獎勵: ${receiverUserId}, 第${generation}代, 第${monthNumber}個月, $${amount}`);
  
  // 1. 生成獎勵 ID
  const rewardId = `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // 2. 構建獎勵描述
  let description = '';
  if (generation === 1) {
    description = `推薦獎勵 - ${refereeUserName}-${refereeListingName}（第1代）- 第${monthNumber}個月`;
  } else {
    description = `推薦獎勵 - ${refereeUserName}-${refereeListingName}（第${generation}代）- 第${monthNumber}個月`;
  }
  
  // 3. 構建獎勵記錄
  const rewardRecord = {
    id: rewardId,
    type: `referral_gen${generation}_month${monthNumber}`,
    amount: amount,
    referee: {
      userId: refereeUserId,
      userName: refereeUserName,
      listingId: '', // 這裡可以補充
      listingName: refereeListingName
    },
    generation: generation,
    monthNumber: monthNumber,
    issuedAt: issuedAt,
    description: description
  };
  
  // 如果是第2代或第3代，加入中間推薦人信息
  if (generation > 1 && intermediateUserName && intermediateListingName) {
    rewardRecord['referrer'] = {
      userId: '', // 可以補充
      userName: intermediateUserName,
      listingId: '',
      listingName: intermediateListingName
    };
  }
  
  // 4. 更新獎勵歷史
  const history = await kv.get(`user:${receiverUserId}:reward_history`) || [];
  history.unshift(rewardRecord);
  await kv.set(`user:${receiverUserId}:reward_history`, history);
  
  // 5. 更新點數餘額
  const pointsKey = `user:${receiverUserId}:points`;
  const currentPoints = await kv.get(pointsKey) || 0;
  await kv.set(pointsKey, currentPoints + amount);
  
  // 6. 記錄到月度日誌
  const currentMonth = issuedAt.substring(0, 7); // YYYY-MM
  const monthlyLogKey = `user:${receiverUserId}:referral_monthly_log`;
  const monthlyLog = await kv.get(monthlyLogKey) || {};
  
  if (!monthlyLog[currentMonth]) {
    monthlyLog[currentMonth] = [];
  }
  
  monthlyLog[currentMonth].push({
    listingId: '',
    userId: refereeUserId,
    userName: refereeUserName,
    listingName: refereeListingName,
    createdAt: issuedAt
  });
  
  await kv.set(monthlyLogKey, monthlyLog);
  
  console.log(`  ✅ 獎勵已發放: ${rewardId}, +${amount} 點`);
}

/**
 * 創建後續11個月的獎勵排程
 * 
 * @param receiverUserId - 接收獎勵的用戶 ID
 * @param refereeUserId - 被推薦人用戶 ID
 * @param refereeUserName - 被推薦人用戶名
 * @param refereeListingName - 被推薦人刊登名稱
 * @param generation - 代數（1, 2, 3）
 * @param monthlyAmount - 每月獎勵金額
 * @param startDate - 開始日期
 * @param intermediateUserName - 中間推薦人名稱（第2代、第3代需要）
 * @param intermediateListingName - 中間推薦人刊登名稱（第2代、第3代需要）
 */
async function createRewardSchedules(
  receiverUserId: string,
  refereeUserId: string,
  refereeUserName: string,
  refereeListingName: string,
  generation: number,
  monthlyAmount: number,
  startDate: string,
  intermediateUserName?: string,
  intermediateListingName?: string
): Promise<void> {
  console.log(`[Create Reward Schedules] 創建後續11個月的獎勵排程...`);
  
  const start = new Date(startDate);
  
  // 創建第2個月到第12個月的排程
  for (let month = 2; month <= 12; month++) {
    // 計算排程日期（每個月的1號）
    const scheduleDate = new Date(start);
    scheduleDate.setMonth(scheduleDate.getMonth() + (month - 1));
    scheduleDate.setDate(1);
    scheduleDate.setHours(0, 0, 0, 0);
    
    const scheduleDateStr = scheduleDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 生成排程 ID
    const scheduleId = `schedule_${Date.now()}_${month}_${Math.random().toString(36).substring(7)}`;
    
    // 構建排程記錄
    const schedule = {
      id: scheduleId,
      userId: receiverUserId,
      referee: {
        userId: refereeUserId,
        userName: refereeUserName,
        listingId: '',
        listingName: refereeListingName
      },
      generation: generation,
      monthNumber: month,
      amount: monthlyAmount,
      scheduledDate: scheduleDateStr,
      status: 'pending',
      createdAt: startDate,
      completedAt: null
    };
    
    // 如果是第2代或第3代，加入中間推薦人信息
    if (generation > 1 && intermediateUserName && intermediateListingName) {
      schedule['referrer'] = {
        userId: '',
        userName: intermediateUserName,
        listingId: '',
        listingName: intermediateListingName
      };
    }
    
    // 儲存排程
    await kv.set(`reward_schedule:${scheduleId}`, schedule);
    
    // 加入到用戶的排程列表
    const userSchedulesKey = `user:${receiverUserId}:reward_schedules`;
    const userSchedules = await kv.get(userSchedulesKey) || [];
    userSchedules.push(scheduleId);
    await kv.set(userSchedulesKey, userSchedules);
  }
  
  console.log(`  ✅ 已創建11個月的獎勵排程（第${generation}代）`);
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