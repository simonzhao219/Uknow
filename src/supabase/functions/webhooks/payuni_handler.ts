import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from '../server/kv_store.tsx';
import { getPayUniConfig } from './shared/payuni_config.ts';
import { decryptPayUni, generatePayUniHash } from './shared/payuni_crypto.ts';
import { getTaiwanNow, toTaiwanISOString } from '../server/date_utils.ts';

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
    
    console.log('[Webhook PayUni] 解密數據:', {
      Status: data.Status,
      MerTradeNo: data.MerTradeNo,
      PeriodTradeNo: data.PeriodTradeNo,
      ThisPeriod: data.ThisPeriod,
      TotalTimes: data.TotalTimes
    });
    
    // 5. 獲取訂單
    const order = await kv.get(`payuni:order:${data.MerTradeNo}`);
    if (!order) {
      console.error('[Webhook PayUni] ❌ 訂單不存在:', data.MerTradeNo);
      return c.json({ Status: 'FAILED', Message: 'Order not found' });
    }
    
    console.log('[Webhook PayUni] 訂單用戶:', order.userId);
    
    // 6. 冪等性檢查（防止重複處理）
    const processedKey = `payuni:processed:${data.PeriodOrderNo || data.TradeNo}`;
    const alreadyProcessed = await kv.get(processedKey);
    
    if (alreadyProcessed) {
      console.log('[Webhook PayUni] ⚠️ 已處理過，跳過重複處理');
      return c.json({ Status: 'SUCCESS' });
    }
    
    // 7. 處理首期付款成功
    if (data.Status === 'SUCCESS' && data.ThisPeriod === '1') {
      console.log('[Webhook PayUni] 🎉 首期付款成功');
      
      // 獲取用戶資料
      const profile = await kv.get(`user:${order.userId}:profile`);
      
      if (!profile) {
        console.error('[Webhook PayUni] ❌ 用戶資料不存在:', order.userId);
        return c.json({ Status: 'FAILED', Message: 'User profile not found' });
      }
      
      // 生成推薦碼
      const referralCode = generateReferralCode();
      console.log('[Webhook PayUni] 生成推薦碼:', referralCode);
      
      // 計算有效期限（一年後）
      const activeUntil = getTaiwanNow();
      activeUntil.setFullYear(activeUntil.getFullYear() + 1);
      
      // 更新用戶資料
      profile.referralCode = referralCode;
      profile.accountStatus = 'Active';
      profile.activeUntil = toTaiwanISOString(activeUntil);
      profile.paidAt = toTaiwanISOString(getTaiwanNow());
      profile.periodTradeNo = data.PeriodTradeNo;
      
      await kv.set(`user:${order.userId}:profile`, profile);
      
      console.log('[Webhook PayUni] ✅ 用戶資料已更新');
      
      // 更新訂單狀態
      order.status = 'success';
      order.periodTradeNo = data.PeriodTradeNo;
      order.paymentData = data;
      order.completedAt = toTaiwanISOString(getTaiwanNow());
      await kv.set(`payuni:order:${data.MerTradeNo}`, order);
      
      console.log('[Webhook PayUni] ✅ 訂單已完成');
      console.log('[Webhook PayUni] ✅ 用戶已激活:', order.userId);
    }
    
    // 8. 處理付款失敗
    if (data.Status !== 'SUCCESS') {
      console.error('[Webhook PayUni] ❌ 付款失敗:', data.ResCodeMsg);
      
      order.status = 'failed';
      order.errorCode = data.ResCode;
      order.errorMessage = data.ResCodeMsg;
      order.paymentData = data;
      await kv.set(`payuni:order:${data.MerTradeNo}`, order);
      
      console.log('[Webhook PayUni] ✅ 失敗訂單已記錄');
    }
    
    // 9. 標記已處理（冪等性保護）
    await kv.set(processedKey, {
      processed: true,
      at: toTaiwanISOString(getTaiwanNow()),
      status: data.Status
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
