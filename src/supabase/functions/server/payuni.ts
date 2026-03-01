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
    
    // 3. 獲取當前台灣時間（統一使用，確保時間一致性）
    const now = getTaiwanNow();
    
    // 4. 獲取配置
    const config = getPayUniConfig();
    console.log(`[PayUni Prepare] 使用環境：${config.mode}`);
    
    // ========================================
    // 5. 檢查是否有未過期的 pending 訂單（15分鐘內複用）
    // ========================================
    if (profile.pendingOrderTradeNo && profile.pendingOrderCreatedAt) {
      console.log(`[PayUni Prepare] 檢查現有訂單：${profile.pendingOrderTradeNo}`);
      
      // 5.1 獲取訂單
      const existingOrder = await kv.get(`payuni:order:${profile.pendingOrderTradeNo}`);
      
      // 5.2 檢查訂單存在且為 pending 狀態
      if (existingOrder && existingOrder.status === 'pending') {
        // 5.3 檢查是否在 15 分鐘內
        const createdAt = new Date(profile.pendingOrderCreatedAt);
        const elapsedMs = now.getTime() - createdAt.getTime();
        const elapsedMinutes = elapsedMs / (1000 * 60);
        
        if (elapsedMinutes < 15) {
          // 5.4 訂單未過期，複用現有訂單
          console.log(`[PayUni Prepare] ✅ 複用現有訂單：${profile.pendingOrderTradeNo}（已用時 ${elapsedMinutes.toFixed(1)} 分鐘）`);
          
          // 5.5 重新生成加密數據（使用現有訂單號）
          const periodDate = toTaiwanDateString(now);
          const projectId = Deno.env.get('SUPABASE_URL')!.match(/https:\/\/(.+)\.supabase\.co/)![1];
          const frontendUrl = Deno.env.get('FRONTEND_URL')!;
          
          const encryptData = {
            MerID: config.merID,
            MerTradeNo: profile.pendingOrderTradeNo,  // ← 複用訂單號
            PeriodAmt: 1200,
            ProdDesc: '訂閱刊登服務',
            PayerName: profile.name,
            PayerPhone: profile.phone,
            PayerEmail: profile.email,
            PeriodType: 'year',
            PeriodDate: periodDate,  // ← 使用當前日期
            PeriodTimes: 12,
            FType: 'build',
            NotifyURL: `https://${projectId}.supabase.co/functions/v1/webhooks/payuni/notify`,
            ReturnURL: `${frontendUrl}payment/result?tradeNo=${profile.pendingOrderTradeNo}`
          };
          
          console.log('[PayUni Prepare] 重新生成加密數據：', {
            MerTradeNo: profile.pendingOrderTradeNo,
            PeriodAmt: 1200,
            PeriodType: 'year',
            PeriodDate: periodDate,
            PeriodTimes: 12
          });
          
          // 5.6 加密
          const encryptInfo = encryptPayUni(encryptData, config.hashKey, config.hashIV);
          const hashInfo = generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);
          
          // 5.7 返回現有訂單
          return c.json({
            success: true,
            data: {
              MerID: config.merID,
              Version: '1.0',
              EncryptInfo: encryptInfo,
              HashInfo: hashInfo,
              apiUrl: config.apiUrl,
              mode: config.mode,
              tradeNo: profile.pendingOrderTradeNo
            }
          });
        } else {
          console.log(`[PayUni Prepare] 訂單已過期（${elapsedMinutes.toFixed(1)} 分鐘），將生成新訂單`);
        }
      } else {
        console.log(`[PayUni Prepare] Pending 訂單不存在或已完成`);
      }
      
      // 5.8 清空過期或無效的 pending 字段
      console.log(`[PayUni Prepare] 清空過期或無效的 pending 訂單字段`);
      profile.pendingOrderTradeNo = null;
      profile.pendingOrderCreatedAt = null;
      profile.updatedAt = toTaiwanISOString(now);
      await kv.set(`user:${user.id}:profile`, profile);
    }
    
    // ========================================
    // 6. 生成新訂單編號（25碼）
    // ========================================
    const tradeNo = generatePayUniTradeNo();
    console.log(`[PayUni Prepare] 訂單編號：${tradeNo}`);
    
    // 7. 獲取當前台灣時間
    const periodDate = toTaiwanDateString(now);
    
    // 8. 構建加密數據
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
    
    // 9. 加密
    const encryptInfo = encryptPayUni(encryptData, config.hashKey, config.hashIV);
    const hashInfo = generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);
    
    // 10. 存儲訂單
    await kv.set(`payuni:order:${tradeNo}`, {
      tradeNo,
      userId: user.id,
      status: 'pending',
      mode: config.mode,
      createdAt: toTaiwanISOString(now)
    });
    
    console.log(`[PayUni Prepare] ✅ 訂單已創建：${tradeNo}`);
    
    // 10.5 記錄新訂單到 profile（15分鐘訂單鎖機制）
    profile.pendingOrderTradeNo = tradeNo;
    profile.pendingOrderCreatedAt = toTaiwanISOString(now);
    profile.updatedAt = toTaiwanISOString(now);
    await kv.set(`user:${user.id}:profile`, profile);
    console.log(`[PayUni Prepare] ✅ 新訂單已記錄到 profile：${tradeNo}`);
    
    // 11. 返回
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
    const tradeNo = c.req.param('tradeNo');
    
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
        completedAt: order.completedAt,
        paymentData: order.paymentData  // ✅ 添加完整的 paymentData
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