import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from './kv_store.ts';
import { getPayUniConfig } from './payuni_config.ts';
import { decryptPayUni, generatePayUniHash } from './payuni_crypto.ts';
import { getTaiwanNow, toTaiwanISOString } from './date_utils.ts';

const payuniHandler = new Hono();

// ========================================
// 工具函數
// ========================================

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

// ========================================
// PayUni 通知處理
// POST /webhooks/payuni/notify
// 
// 安全機制：
// 1. Hash 驗證（確保請求來自 PayUni）
// 2. 冪等性保護（防止重複處理）
// 3. AES-256-GCM 解密
// ========================================
payuniHandler.post('/notify', async (c) => {
  try {
    console.log('[Webhook PayUni] 收到通知');
    
    // 1. 接收通知（form-data 格式）
    const body = await c.req.parseBody();
    const { MerID, EncryptInfo, HashInfo } = body;
    
    console.log('[Webhook PayUni] MerID:', MerID);
    
    if (!EncryptInfo || !HashInfo) {
      console.error('[Webhook PayUni] ❌ 缺少必要參數');
      return c.json({ Status: 'FAILED', Message: 'Missing required parameters' });
    }
    
    // 2. 獲取配置
    const config = getPayUniConfig();
    console.log(`[Webhook PayUni] 使用環境：${config.mode}`);
    
    // 3. 驗證 Hash（重要！確保請求來自 PayUni）
    const expectedHash = generatePayUniHash(
      EncryptInfo as string,
      config.hashKey,
      config.hashIV
    );
    
    if (HashInfo !== expectedHash) {
      console.error('[Webhook PayUni] ❌ Hash 驗證失敗');
      console.error('[Webhook PayUni] Expected:', expectedHash);
      console.error('[Webhook PayUni] Received:', HashInfo);
      return c.json({ Status: 'FAILED', Message: 'Hash verification failed' });
    }
    
    console.log('[Webhook PayUni] ✅ Hash 驗證通過');
    
    // 4. 解密交易資料
    const decrypted = decryptPayUni(
      EncryptInfo as string,
      config.hashKey,
      config.hashIV
    );
    const params = new URLSearchParams(decrypted);
    const data = Object.fromEntries(params);
    
    console.log('[Webhook PayUni] 解密數據:', data);
    
    // 5. 解析訂單號（去除 _X）
    const originalTradeNo = data.MerTradeNo.replace(/_\d+$/, '');
    const periodNumber = data.MerTradeNo.match(/_(\d+)$/)?.[1] || '0';
    console.log('[Webhook PayUni] 回調訂單號:', data.MerTradeNo);
    console.log('[Webhook PayUni] 原始訂單號:', originalTradeNo);
    console.log('[Webhook PayUni] 期數:', periodNumber);
    

    // 6. 獲取訂單
    const order = await kv.get(`payuni:order:${originalTradeNo}`);
    if (!order) {
      console.error('[Webhook PayUni] ❌ 訂單不存在:', originalTradeNo);
      console.error('[Webhook PayUni] 已嘗試查找:', data.MerTradeNo);
      return c.json({ Status: 'FAILED', Message: 'Order not found' });
    }
    
    console.log('[Webhook PayUni] 訂單用戶:', order.userId);
    
    // 7. 冪等性檢查（防止重複處理）
    const processedKey = `payuni:processed:${data.PeriodTradeNo || data.MerTradeNo}`;;
    const alreadyProcessed = await kv.get(processedKey);
    
    if (alreadyProcessed) {
      console.log('[Webhook PayUni] ⚠️ 已處理過，跳過重複處理');
      return c.json({ Status: 'SUCCESS' });
    }
    
    // 8. 處理首期付款成功（只在第一期 + 用户未激活時處理）
    if (data.Status === 'SUCCESS' && periodNumber === '1') {
      console.log('[Webhook PayUni] 🎉 首期付款成功');
      
      // 獲取用戶資料
      const profile = await kv.get(`user:${order.userId}:profile`);
      
      if (!profile) {
        console.error('[Webhook PayUni] ❌ 用戶資料不存在:', order.userId);
        return c.json({ Status: 'FAILED', Message: 'User profile not found' });
      }
      
      // 檢查是否已完成註冊（冪等性保護）
      if (profile.registrationStep === 3) {
        console.log('[Webhook PayUni] ⚠️ 用戶已完成註冊，跳過重複處理');
        await kv.set(processedKey, {
          processed: true,
          at: toTaiwanISOString(getTaiwanNow()),
          status: 'already_completed'
        });
        return c.json({ Status: 'SUCCESS' });
      }
      
      // ✅ 只更新状态，不生成推荐码和奖励
      profile.registrationStep = 2;  // ← 进入 Step 2（等待用户确认）
      profile.pendingActivation = true;  // ← 标记为待激活
      profile.paidAt = toTaiwanISOString(getTaiwanNow());
      profile.periodTradeNo = data.PeriodTradeNo;
      profile.lastTradeNo = originalTradeNo;  // ✅ 保存原始订单号，用于跳转到付款结果页面
      profile.updatedAt = toTaiwanISOString(getTaiwanNow());  // ✅ 添加更新時間
      
      await kv.set(`user:${order.userId}:profile`, profile);
      console.log('[Webhook PayUni] ✅ 用戶狀態已更新為 Step 2（待確認）');
      
      // 更新訂單狀態
      order.status = 'success';
      order.periodTradeNo = data.PeriodTradeNo;
      order.periodNumber = periodNumber;
      order.paymentData = data;
      order.completedAt = toTaiwanISOString(getTaiwanNow());
      await kv.set(`payuni:order:${originalTradeNo}`, order);
      
      console.log('[Webhook PayUni] ✅ 訂單已完成');
      console.log('[Webhook PayUni] ✅ 用戶已激活:', order.userId);
    }
    
    // 9. 處理付款失敗
    if (data.Status !== 'SUCCESS') {
      console.error('[Webhook PayUni] ❌ 付款失敗:', data.Message || data.ResCodeMsg);
      
      order.status = 'failed';
      order.errorCode = data.ResCode || data.Code;
      order.errorMessage = data.Message || data.ResCodeMsg;
      order.paymentData = data;
      await kv.set(`payuni:order:${originalTradeNo}`, order);
      
      console.log('[Webhook PayUni] ✅ 失敗訂單已記錄');
    }
    
    // 10. 標記已處理（冪等性保護）
    await kv.set(processedKey, {
      processed: true,
      at: toTaiwanISOString(getTaiwanNow()),
      status: data.Status,
      periodNumber
    });
    
    console.log('[Webhook PayUni] ✅ 標記已處理:', processedKey);
    
    // 10. 必須回應 SUCCESS（PayUni 要求）
    return c.json({ Status: 'SUCCESS' });
    
  } catch (error: any) {
    console.error('[Webhook PayUni] 💥 錯誤:', error);
    console.error('[Webhook PayUni] Stack:', error.stack);
    
    // 即使發生錯誤，也要返回合法的響應格式
    return c.json({ 
      Status: 'FAILED', 
      Message: error.message 
    });
  }
});

// ========================================
// 健康檢查（測試用）
// GET /webhooks/payuni/health
// ========================================
payuniHandler.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'payuni-webhook',
    timestamp: new Date().toISOString()
  });
});

export default payuniHandler;