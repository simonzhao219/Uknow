import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import { getPayUniConfig } from './payuni_config.ts';
import { encryptPayUni, decryptPayUni, generatePayUniHash } from './payuni_crypto.ts';
import { getTaiwanNow, toTaiwanDateString, toTaiwanISOString, generatePayUniTradeNo } from './date_utils.ts';

const payuni = new Hono();

// ========================================
// API 1: 準備訂單
// POST /payuni/prepare
// ========================================
payuni.post('/prepare', async (c) => {
  try {
    console.log('[PayUni Prepare] 開始準備訂單...');
    
    // 1. 驗證登入
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user) {
      console.error('[PayUni Prepare] 未登入');
      return c.json({ success: false, error: { message: '未登入' } }, 401);
    }
    
    // 2. 獲取用戶資料
    const profile = await kv.get(`user:${user.id}:profile`);
    if (!profile) {
      console.error('[PayUni Prepare] 用戶資料不存在');
      return c.json({ success: false, error: { message: '用戶資料不存在' } }, 404);
    }
    
    // 3. 獲取配置
    const config = getPayUniConfig();
    console.log(`[PayUni Prepare] 使用環境：${config.mode}`);
    
    // 4. 生成訂單編號（25碼）
    const tradeNo = generatePayUniTradeNo();
    console.log(`[PayUni Prepare] 訂單編號：${tradeNo}`);
    
    // 5. 獲取當前台灣時間
    const now = getTaiwanNow();
    const periodDate = toTaiwanDateString(now);
    
    // 6. 構建加密數據
    const projectId = Deno.env.get('SUPABASE_URL')!.match(/https:\/\/(.+)\.supabase\.co/)![1];
    const frontendUrl = Deno.env.get('FRONTEND_URL')!;
    
    const encryptData = {
      MerID: config.merID,
      MerTradeNo: tradeNo,
      PeriodAmt: 1200,
      ProdDesc: '訂閱刊登服務',
      PayerName: profile.name,
      PayerPhone: profile.phone,
      PayerEmail: profile.email,
      PeriodType: 'year',
      PeriodDate: periodDate,
      PeriodTimes: 12,
      FType: 'build',
      NotifyURL: `https://${projectId}.supabase.co/functions/v1/webhooks/payuni/notify`,  // ✅ 改為 webhooks
      ReturnURL: `${frontendUrl}payment/result?tradeNo=${tradeNo}`
    };
    
    console.log('[PayUni Prepare] 加密數據：', {
      MerTradeNo: tradeNo,
      PeriodAmt: 1200,
      PeriodType: 'year',
      PeriodDate: periodDate,
      PeriodTimes: 12
    });
    
    // 7. 加密
    const encryptInfo = encryptPayUni(encryptData, config.hashKey, config.hashIV);
    const hashInfo = generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);
    
    // 8. 存儲訂單
    await kv.set(`payuni:order:${tradeNo}`, {
      tradeNo,
      userId: user.id,
      status: 'pending',
      mode: config.mode,
      createdAt: toTaiwanISOString(now)
    });
    
    console.log(`[PayUni Prepare] ✅ 訂單已創建：${tradeNo}`);
    
    // 9. 返回
    return c.json({
      success: true,
      data: {
        MerID: config.merID,
        Version: '1.0',
        EncryptInfo: encryptInfo,
        HashInfo: hashInfo,
        apiUrl: config.apiUrl,
        mode: config.mode,
        tradeNo: tradeNo
      }
    });
    
  } catch (error: any) {
    console.error('[PayUni Prepare] 錯誤:', error);
    return c.json({ success: false, error: { message: error.message } }, 500);
  }
});

// ========================================
// API 2: 背景通知（已移至 webhooks function）
// ⚠️ 此端點已廢棄，請使用 /webhooks/payuni/notify
// ========================================
// 為了向後兼容，暫時保留此端點並返回提示訊息
payuni.post('/notify', async (c) => {
  console.log('[PayUni Notify] ⚠️ 此端點已移至 webhooks function');
  return c.json({ 
    Status: 'FAILED', 
    Message: 'This endpoint has been moved to /webhooks/payuni/notify' 
  });
});

// ========================================
// API 3: 查詢結果
// GET /payuni/result/:tradeNo
// ========================================
payuni.get('/result/:tradeNo', async (c) => {
  try {
    const tradeNo = c.param('tradeNo');
    
    console.log('[PayUni Result] 查詢訂單:', tradeNo);
    
    // 驗證登入
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    
    if (!user) {
      return c.json({ success: false, error: { message: '未登入' } }, 401);
    }
    
    // 獲取訂單
    const originalTradeNo = tradeNo.replace(/_\d+$/, '');
    const order = await kv.get(`payuni:order:${originalTradeNo}`);
    
    if (!order || order.userId !== user.id) {
      console.error('[PayUni Result] 訂單不存在或不屬於當前用戶');
      console.error('[PayUni Result] 原始訂單號:', originalTradeNo);
      console.error('[PayUni Result] 查詢訂單號:', tradeNo);
      return c.json({ success: false, error: { message: '訂單不存在' } }, 404);
    }
    
    console.log('[PayUni Result] 訂單狀態:', order.status);
    
    return c.json({
      success: true,
      data: {
        status: order.status,
        tradeNo: order.tradeNo,
        periodTradeNo: order.periodTradeNo,
        errorMessage: order.errorMessage,
        mode: order.mode,
        completedAt: order.completedAt
      }
    });
    
  } catch (error: any) {
    console.error('[PayUni Result] 錯誤:', error);
    return c.json({ success: false, error: { message: error.message } }, 500);
  }
});

// ========================================
// 輔助函數：生成推薦碼
// ========================================
function generateReferralCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const nums = '0123456789';
  
  let code = '';
  
  // 3個小寫英文
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // 6個數字
  for (let i = 0; i < 6; i++) {
    code += nums.charAt(Math.floor(Math.random() * nums.length));
  }
  
  return code;
}

export default payuni;