import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { REWARD_CONFIG } from './reward_config.ts';
import { getTaiwanNow, toTaiwanDateString, toTaiwanISOString } from './date_utils.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const rewards = new Hono();

/**
 * GET /rewards - 獲取用戶的獎勵資料
 * 
 * 返回：
 * - availableRewards: 可提領點數
 * - pendingRewards: 處理中點數（提領申請中）
 * - withdrawnRewards: 已提領點數
 * - totalEarned: 總累積點數
 * - hasWithdrawnToday: 今日是否已提領過（true/false）
 */
rewards.get('/', async (c) => {
  try {
    console.log('========== 獲取獎勵資料 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[rewards] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 直接讀取預計算的獎勵資料（O(1) 時間複雜度）
    const rewardsData = await kv.get(`user:${user.id}:rewards`) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0,
      lastUpdated: new Date().toISOString()
    };
    
    // 3. ✅ 檢查今日是否已提領過（台灣時區）
    const todayStr = toTaiwanDateString(getTaiwanNow()); // "2024-12-23"
    const lastWithdrawalDateKey = `user:${user.id}:last_withdrawal_date`;
    const lastWithdrawalDate = await kv.get(lastWithdrawalDateKey);
    
    const hasWithdrawnToday = lastWithdrawalDate === todayStr;
    
    console.log(`💰 獎勵資料: 可提領=${rewardsData.availableRewards}P, 總累積=${rewardsData.totalEarned}P`);
    console.log(`📅 今日提領狀態: ${hasWithdrawnToday ? '已提領' : '未提領'} (${todayStr})`);
    console.log('========== ✅ 獎勵資料獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        ...rewardsData,
        hasWithdrawnToday  // ✅ 新增：今日是否已提領過
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取獎勵資料錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取獎勵資料失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /rewards/points-preview - 獲取領取任務獎勵後的點數預覽
 * 
 * 用途：
 * - 在用戶準備領取任務獎勵時，實時獲取最新的點數資料
 * - 確保與獎勵管理頁面使用相同的 SSOT 數據源
 * 
 * 返回：
 * - currentAvailable: 目前可提領點數（來自 SSOT）
 * - currentTotal: 目前總累積點數（來自 SSOT）
 * - currentPending: 目前處理中點數（來自 SSOT）
 * - currentWithdrawn: 目前已提領點數（來自 SSOT）
 * 
 * 注意：
 * - ✅ 此端點與 GET /rewards 使用完全相同的數據源
 * - 前端需要自行加上任務獎勵金額來顯示「領取後」的點數
 */
rewards.get('/points-preview', async (c) => {
  try {
    console.log('========== 獲取點數預覽（任務獎勵領取）==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[points-preview] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[points-preview] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. ✅ 從 SSOT 獲取最新的獎勵資料（與 GET /rewards 完全相同）
    const rewardsKey = `user:${user.id}:rewards`;
    const rewardsData = await kv.get(rewardsKey) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0,
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`💰 SSOT 點數數據 (${rewardsKey}):`);
    console.log(`   - 可提領點數: ${rewardsData.availableRewards}P`);
    console.log(`   - 處理中點數: ${rewardsData.pendingRewards}P`);
    console.log(`   - 已提領點數: ${rewardsData.withdrawnRewards}P`);
    console.log(`   - 總累積點數: ${rewardsData.totalEarned}P`);
    console.log(`   - 最後更新: ${rewardsData.lastUpdated}`);
    console.log('========== ✅ 點數預覽獲取完成 ==========');
    
    // 3. 返回目前的點數（前端會自行加上任務獎勵金額）
    return c.json({
      success: true,
      data: {
        currentAvailable: rewardsData.availableRewards,
        currentTotal: rewardsData.totalEarned,
        currentPending: rewardsData.pendingRewards,
        currentWithdrawn: rewardsData.withdrawnRewards
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取點數預覽錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取點數預覽失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /rewards/history - 獲取用戶獎勵歷史
 * 
 * Query Parameters:
 * - limit: 返回筆數（預設50，最多200）
 * - offset: 起始位置（預設0）
 * 
 * 返回：
 * - history: 獎勵記錄陣列（最近200筆）
 * - total: 總筆數
 */
rewards.get('/history', async (c) => {
  try {
    console.log('========== 獲取獎勵歷史 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards/history] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[rewards/history] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards/history] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取查詢參數
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');
    
    const limit = limitParam ? Math.min(parseInt(limitParam), 200) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;
    
    console.log(`📋 查詢參數: limit=${limit}, offset=${offset}`);
    
    // 3. 直接讀取預計算的獎勵歷史O(1) 時間複雜度）
    const allHistory = await kv.get(`user:${user.id}:reward_history`) || [];
    
    // 4. 分頁處理
    const paginatedHistory = allHistory.slice(offset, offset + limit);
    
    console.log(`📜 獎勵歷史: 總計=${allHistory.length}筆, 返回=${paginatedHistory.length}筆`);
    console.log('========== ✅ 獎勵歷史獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        history: paginatedHistory,
        total: allHistory.length,
        limit,
        offset
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取獎勵歷史錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取獎勵歷史失敗', details: error.message }
    }, 500);
  }
});

/**
 * POST /rewards/verify-id - 驗證身分證字號是否與註冊時一致
 * 
 * Request Body:
 * - idNumber: 身分證字號
 * 
 * 返回：
 * - success: true（驗證成功）/ false（驗證失敗）
 * - message: 錯誤訊息
 */
rewards.post('/verify-id', async (c) => {
  try {
    console.log('========== 驗證身分證字號 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[verify-id] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[verify-id] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取請求資料
    const { idNumber } = await c.req.json();
    
    if (!idNumber) {
      console.log('❌ 缺少身分證字號');
      return c.json({
        success: false,
        message: '請輸入身分證字號'
      });
    }
    
    console.log(`📝 前端傳入身分證字號: "${idNumber}" (長度: ${idNumber.length})`);
    
    // 3. 獲取用戶資料，驗證身分證字號
    const profile = await kv.get(`user:${user.id}:profile`);
    if (!profile) {
      console.log('❌ 找不到用戶資料');
      return c.json({
        error: { message: '找不到用戶資料' }
      }, 404);
    }
    
    // ✅ 註冊時存的是 nationalId，統一使用 nationalId
    if (profile.nationalId !== idNumber) {
      console.log(`❌ 身分證字號不正確: 輸入=${idNumber}, 儲存=${profile.nationalId}`);
      return c.json({
        success: false,
        message: '身分證字號不正確'
      }, 400);
    }
    
    console.log('✅ 身分證字號驗證通過');
    console.log('========== ✅ 驗證完成 ==========');
    
    return c.json({
      success: true,
      message: '驗證成功'
    });
    
  } catch (error) {
    console.error('========== ❌ 驗證身分證字號錯誤 ==========');
    console.error(error);
    return c.json({
      success: false,
      message: '驗證失敗，請稍後再試'
    }, 500);
  }
});

/**
 * GET /rewards/id-photos - 獲取已存儲的身分證照片URL
 * 
 * 返回：
 * - frontUrl: 正面照URL（Supabase Storage signed URL）
 * - backUrl: 背面照URL（Supabase Storage signed URL）
 */
rewards.get('/id-photos', async (c) => {
  try {
    console.log('========== 獲取身分證照片 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[id-photos] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[id-photos] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 檢查是否有存儲的照片路徑
    const frontPhotoKey = `user:${user.id}:id_card_front_path`;
    const backPhotoKey = `user:${user.id}:id_card_back_path`;
    
    const frontPath = await kv.get(frontPhotoKey);
    const backPath = await kv.get(backPhotoKey);
    
    // 3. 如果沒有照片，返回 null
    if (!frontPath && !backPath) {
      console.log('📷 尚未上傳身分證照片');
      return c.json({
        success: true,
        data: {
          frontUrl: null,
          backUrl: null
        }
      });
    }
    
    // 4. ✅ 生成 Supabase Storage 的 signed URL（有效期1小時）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let frontUrl = null;
    let backUrl = null;
    
    try {
      if (frontPath) {
        const { data, error } = await supabase.storage
          .from('make-5c6718b9-id-cards')
          .createSignedUrl(frontPath, 3600);
        
        if (!error && data) {
          frontUrl = data.signedUrl;
        }
      }
      
      if (backPath) {
        const { data, error } = await supabase.storage
          .from('make-5c6718b9-id-cards')
          .createSignedUrl(backPath, 3600);
        
        if (!error && data) {
          backUrl = data.signedUrl;
        }
      }
    } catch (storageError) {
      console.error('Storage error:', storageError);
      // 即使 storage 失敗，也返回存在標記
    }
    
    console.log(`📷 照片路徑: 正面=${frontPath || '無'}, 背面=${backPath || '無'}`);
    console.log('========== ✅ 照片資訊獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        frontUrl: frontUrl || (frontPath ? '存在' : null),
        backUrl: backUrl || (backPath ? '存在' : null)
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取照片錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取照片失敗', details: error.message }
    }, 500);
  }
});

/**
 * POST /rewards/upload-id-photos - 上傳身分證照片
 * 
 * FormData:
 * - idCardFront: 身分證正面照（可選，如果有則覆蓋舊照片）
 * - idCardBack: 身分證背面照（可選，如果有則覆蓋舊照片）
 * 
 * 回：
 * - success: true/false
 * - frontPath: 正面照路徑
 * - backPath: 背面照路徑
 */
rewards.post('/upload-id-photos', async (c) => {
  try {
    console.log('========== 上傳身分證照片 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[upload-id-photos] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[upload-id-photos] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 解析 FormData
    const formData = await c.req.formData();
    const frontFile = formData.get('idCardFront') as File | null;
    const backFile = formData.get('idCardBack') as File | null;
    
    if (!frontFile && !backFile) {
      console.log('❌ 沒有提供照片');
      return c.json({
        error: { message: '請至少上傳一張照片' }
      }, 400);
    }
    
    // 3. 初始化 Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const bucketName = 'make-5c6718b9-id-cards';
    
    // 4. 確保 bucket 存在（冪等操作）
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      console.log(`📦 創建 bucket: ${bucketName}`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: false,  // 私有 bucket
        fileSizeLimit: 5242880  // 5MB
      });
      
      if (createError) {
        console.error('創建 bucket 失敗:', createError);
        return c.json({
          error: { message: '創建存儲空間失敗' }
        }, 500);
      }
    }
    
    let frontPath = null;
    let backPath = null;
    
    // 5. 上傳正面照（如果提供）
    if (frontFile) {
      const fileName = `${user.id}/front.jpg`;
      
      // 刪除舊照片（如果存在）
      await supabase.storage.from(bucketName).remove([fileName]);
      
      // 上傳新照片
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, frontFile, {
          cacheControl: '3600',
          upsert: true  // 覆蓋模式
        });
      
      if (error) {
        console.error('上傳正面照失敗:', error);
        return c.json({
          error: { message: '上傳正面照失敗' }
        }, 500);
      }
      
      frontPath = data.path;
      console.log(`✅ 正面照上傳成功: ${frontPath}`);
      
      // 儲存路徑到 KV Store
      await kv.set(`user:${user.id}:id_card_front_path`, frontPath);
    }
    
    // 6. 上傳背面照（如果提供）
    if (backFile) {
      const fileName = `${user.id}/back.jpg`;
      
      // 刪除舊照片（如果存在）
      await supabase.storage.from(bucketName).remove([fileName]);
      
      // 上傳新照片
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, backFile, {
          cacheControl: '3600',
          upsert: true  // 覆蓋模式
        });
      
      if (error) {
        console.error('上傳背面照失敗:', error);
        return c.json({
          error: { message: '上傳背面照失敗' }
        }, 500);
      }
      
      backPath = data.path;
      console.log(`✅ 背面照上傳成功: ${backPath}`);
      
      // 儲存路徑到 KV Store
      await kv.set(`user:${user.id}:id_card_back_path`, backPath);
    }
    
    console.log('========== ✅ 身分證照片上傳完成 ==========');
    
    return c.json({
      success: true,
      data: {
        frontPath,
        backPath
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 上傳身分證照片錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '上傳照片失敗', details: error.message }
    }, 500);
  }
});

/**
 * POST /rewards/withdraw - 申請提領獎勵
 * 
 * Request Body:
 * - amount: 提領金額（必須 > 0  <= availableRewards）
 * 
 * 返回：
 * - withdrawalId: 提領申請 ID
 * - status: 提領狀態
 */
rewards.post('/withdraw', async (c) => {
  try {
    console.log('========== 申請提領獎勵 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards/withdraw] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[rewards/withdraw] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards/withdraw] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // ✅ 2. 驗證訂閱狀態（新增：防止寬限期和永久失效帳號提領）
    const accountStatus = await kv.get(`user:${user.id}:account_status`);
    
    if (!accountStatus) {
      console.log(`❌ 用戶帳號狀態不存在: ${user.id}`);
      return c.json({
        error: { message: '帳號狀態異常，請聯繫客服' }
      }, 400);
    }
    
    // 檢查訂閱狀態
    if (accountStatus.status === 'grace' || accountStatus.status === 'expired') {
      const message = accountStatus.status === 'grace'
        ? '訂閱處於寬限期，無法申請提領。請補繳以恢復服務。'
        : '訂閱已失效，無法申請提領。請重新訂閱以恢復服務。';
      
      console.log(`❌ 訂閱狀態不符合提領條件: ${accountStatus.status}`);
      return c.json({
        error: { message }
      }, 403);
    }
    
    console.log(`✅ 訂閱狀態驗證通過: ${accountStatus.status}`);
    
    // 3. 獲取請求資料
    const { amount } = await c.req.json();
    
    // 4. 驗證提領金額（最低 1000P + 手續費 15P = 1015P）
    const MIN_WITHDRAWAL = 1000;
    const WITHDRAWAL_FEE = 15;
    
    if (!amount || amount < MIN_WITHDRAWAL) {
      console.log(`❌ 無效的提領金額: ${amount}P（最低 ${MIN_WITHDRAWAL}P）`);
      return c.json({
        error: { message: `提領金額必須至少 ${MIN_WITHDRAWAL}P` }
      }, 400);
    }
    
    // ✅ 驗證是否為 1000 的倍數
    if (amount % 1000 !== 0) {
      console.log(`❌ 提領金額必須為 1000 的倍數: ${amount}P`);
      return c.json({
        error: { message: '提領金額必須為 1000 的倍數' }
      }, 400);
    }
    
    // ✅ 驗證每日提領上限
    const DAILY_WITHDRAWAL_LIMIT = 8000;
    if (amount > DAILY_WITHDRAWAL_LIMIT) {
      console.log(`❌ 超過每日提領上限: ${amount}P > ${DAILY_WITHDRAWAL_LIMIT}P`);
      return c.json({
        error: { message: `每日最多提領 ${DAILY_WITHDRAWAL_LIMIT}P` }
      }, 400);
    }
    
    // 5. 獲取用戶獎勵資料
    const rewardsKey = `user:${user.id}:rewards`;
    const rewards = await kv.get(rewardsKey) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0
    };
    
    // 6. 檢查餘額（提領金額 + 手續費）
    const totalRequired = amount + WITHDRAWAL_FEE;
    if (totalRequired > rewards.availableRewards) {
      console.log(`❌ 餘額不足: 需要=${totalRequired}P（提領${amount}P + 手續費${WITHDRAWAL_FEE}P）, 可用=${rewards.availableRewards}P`);
      return c.json({
        error: { message: '餘額不足' }
      }, 400);
    }
    
    // 7. ✅ 檢查今日是否已提領過
    const todayStr = toTaiwanDateString(getTaiwanNow());
    const lastWithdrawalDateKey = `user:${user.id}:last_withdrawal_date`;
    const lastWithdrawalDate = await kv.get(lastWithdrawalDateKey);
    
    if (lastWithdrawalDate === todayStr) {
      console.log(`❌ 今日已提領過: ${todayStr}`);
      return c.json({
        error: { message: '今日已提領過一次' }
      }, 400);
    }
    
    // 8. 創建提領申請（台灣時區）
    const now = getTaiwanNow();
    const withdrawalId = `withdrawal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const withdrawal = {
      id: withdrawalId,
      userId: user.id,
      amount,                               // 提領金額
      fee: WITHDRAWAL_FEE,                  // 手續費
      status: 'pending',                    // pending | awaiting_collection | completed | rejected
      requestedAt: toTaiwanISOString(now),  // 申請日期（台灣時區）
      processedAt: null,                    // 處理日期（Admin 切換時）
      completedAt: null                     // 完成日期（用戶確認查收時）
    };
    
    // 9. 更新獎勵資料（扣除提領金額 + 手續費）
    rewards.availableRewards -= totalRequired;
    rewards.pendingRewards += totalRequired;
    rewards.lastUpdated = toTaiwanISOString(now);
    
    await kv.set(rewardsKey, rewards);
    
    // 10. 儲存提領申請
    await kv.set(`withdrawal:${withdrawalId}`, withdrawal);
    
    // 11. 將提領申請加入用戶的提領列表
    const userWithdrawalsKey = `user:${user.id}:withdrawals`;
    const userWithdrawals = await kv.get(userWithdrawalsKey) || [];
    userWithdrawals.unshift(withdrawalId);
    await kv.set(userWithdrawalsKey, userWithdrawals);
    
    // 12. ✅ 更新今日提領日期
    await kv.set(lastWithdrawalDateKey, todayStr);
    
    // 13. ✅ 新增：立即更新獎勵明細（提交申請時）
    const historyKey = `user:${user.id}:reward_history`;
    const history = await kv.get(historyKey) || [];
    
    // 計算當前餘額（用於顯示）
    const currentBalance = rewards.availableRewards + rewards.pendingRewards;
    
    // ✅ 新增提領申請記錄（負數）- 狀態：pending
    history.unshift({
      id: `history_${Date.now()}_withdrawal_${withdrawalId}`,
      type: 'withdrawal_pending',  // ✅ 新類型：提領申請中
      amount: -(amount + WITHDRAWAL_FEE),  // ✅ 合併提領金額和手續費（單筆負數）
      description: `提領申請（${amount}P + 手續費${WITHDRAWAL_FEE}P）`,
      issuedAt: toTaiwanISOString(now),
      balance: currentBalance,
      
      // ✅ 關聯資訊（方便後續追溯）
      withdrawalId: withdrawalId,
      status: 'pending'
    });
    
    await kv.set(historyKey, history);
    
    console.log(`✅ 獎勵明細已更新: 新增提領申請記錄（-${amount + WITHDRAWAL_FEE}P）`);
    console.log(`✅ 提領申請創建: id=${withdrawalId}, amount=${amount}P, fee=${WITHDRAWAL_FEE}P`);
    console.log(`💰 更新後餘額: 可提領=${rewards.availableRewards}P, 處理中=${rewards.pendingRewards}P`);
    console.log('========== ✅ 提領申請完成 ==========');
    
    return c.json({
      success: true,
      data: {
        withdrawalId,
        status: withdrawal.status,
        amount,
        fee: WITHDRAWAL_FEE,
        requestedAt: withdrawal.requestedAt
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 申請提領錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '申請提領失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /rewards/withdrawals - 獲取用戶的提領記錄
 * 
 * 返回：
 * - withdrawals: 提領記錄陣列
 */
rewards.get('/withdrawals', async (c) => {
  try {
    console.log('========== 獲取提領記錄 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[rewards/withdrawals] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[rewards/withdrawals] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取提領 ID 列表
    const withdrawalIds = await kv.get(`user:${user.id}:withdrawals`) || [];
    
    // 3. 批量讀取提領詳情
    const withdrawals = await Promise.all(
      withdrawalIds.map(async (id) => {
        const withdrawal = await kv.get(`withdrawal:${id}`);
        return withdrawal;
      })
    );
    
    // 過濾掉不存在的提領記錄
    const validWithdrawals = withdrawals.filter(w => w !== null);
    
    console.log(`📜 提領記錄: ${validWithdrawals.length} 筆`);
    console.log('========== ✅ 提領記錄獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        withdrawals: validWithdrawals
      }
    });
    
  } catch (error) {
    console.error('==========  獲取提領記錄錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取提領記錄失敗', details: error.message }
    }, 500);
  }
});

/**
 * POST /rewards/withdrawals/:id/confirm - 用戶確認查收提領
 * 
 * Request Body:
 * - idNumber: 身分證字號（必須與註冊時一致）
 * 
 * 流程：
 * 1. 驗證身分證字號
 * 2. 更新提領狀態為 completed
 * 3. 扣除處理中點數、增加已提領點數（包含手續費）
 * 4. 新增單筆獎勵明細（提領點數&手續費）
 * 
 * 返回：
 * - success: true/false
 */
rewards.post('/withdrawals/:id/confirm', async (c) => {
  try {
    console.log('========== 用戶確認查收提領 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[withdrawals/confirm] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[withdrawals/confirm] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取提領 ID 和身分證字號
    const withdrawalId = c.req.param('id');
    const { idNumber } = await c.req.json();
    
    if (!idNumber) {
      console.log('❌ 缺少身分證字號');
      return c.json({
        error: { message: '請輸入身分證字號' }
      }, 400);
    }
    
    console.log(`📋 提領ID: ${withdrawalId}`);
    
    // 3. 獲取用戶資料，驗證身分證字號
    const profile = await kv.get(`user:${user.id}:profile`);
    if (!profile) {
      console.log('❌ 找不到用戶資料');
      return c.json({
        error: { message: '找不到用戶資料' }
      }, 404);
    }
    
    // ✅ 註冊時存的是 nationalId，統一使用 nationalId
    if (profile.nationalId !== idNumber) {
      console.log(`❌ 身分證字號不正確: 輸入=${idNumber}, 儲存=${profile.nationalId}`);
      return c.json({
        error: { message: '身分證字號不正確' }
      }, 400);
    }
    
    console.log('✅ 身分證字號驗證通過');
    
    // 4. 獲取提領記錄
    const withdrawal = await kv.get(`withdrawal:${withdrawalId}`);
    if (!withdrawal) {
      console.log('❌ 找不到提領記錄');
      return c.json({
        error: { message: '找不到提領記錄' }
      }, 404);
    }
    
    // 5. 驗證提領記錄屬於當前用戶
    if (withdrawal.userId !== user.id) {
      console.log('❌ 無權操作此提領記錄');
      return c.json({
        error: { message: '無權操作此提領記錄' }
      }, 403);
    }
    
    // 6. 驗證提領狀態（必須是 awaiting_collection）
    if (withdrawal.status !== 'awaiting_collection') {
      console.log(`❌ 提領狀態錯誤: ${withdrawal.status}（必須是 awaiting_collection）`);
      return c.json({
        error: { message: `無法確認查收，當前狀態：${withdrawal.status}` }
      }, 400);
    }
    
    console.log(`💰 提領金額: ${withdrawal.amount}P, 手續費: ${withdrawal.fee}P`);
    
    // 7. 更新提領狀態
    const now = getTaiwanNow();
    withdrawal.status = 'completed';
    withdrawal.completedAt = toTaiwanISOString(now);
    
    await kv.set(`withdrawal:${withdrawalId}`, withdrawal);
    console.log('✅ 提領狀態更新為 completed');
    
    // 8. 更新用戶獎勵資料
    const rewardsKey = `user:${user.id}:rewards`;
    const rewards = await kv.get(rewardsKey) || {
      availableRewards: 0,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 0
    };
    
    const totalAmount = withdrawal.amount + withdrawal.fee;
    
    // ✅ 重要：處理中Point扣除總額（提領+手續費），已提領Point也增加總額
    // 原因：手續費也是用戶支付的成本，應計入「已提領」
    rewards.pendingRewards -= totalAmount;  // 扣除 1015P（1000P提領 + 15P手續費）
    rewards.withdrawnRewards += totalAmount;  // ⭐ 增加 1015P（淨額 + 手續費）
    rewards.lastUpdated = toTaiwanISOString(now);
    
    await kv.set(rewardsKey, rewards);
    console.log(`💰 獎勵更新: 處理中=${rewards.pendingRewards}P, 已提領=${rewards.withdrawnRewards}P（含手續費）`);
    
    // 9. ✅ 更新獎勵明細記錄狀態（而非新增）
    const historyKey = `user:${user.id}:reward_history`;
    const history = await kv.get(historyKey) || [];
    
    // ✅ 計算交易後餘額
    const balanceAfterWithdrawal = rewards.availableRewards + rewards.pendingRewards;
    
    // ✅ 找到對應的提領申請記錄並更新狀態
    const recordIndex = history.findIndex(
      (record: any) => record.withdrawalId === withdrawalId
    );
    
    if (recordIndex !== -1) {
      // 更新現有記錄
      history[recordIndex].status = 'completed';
      history[recordIndex].description = `提領完成（${withdrawal.amount}P + 手續費${withdrawal.fee}P）`;
      history[recordIndex].balance = balanceAfterWithdrawal;
      history[recordIndex].completedAt = toTaiwanISOString(now);
      
      await kv.set(historyKey, history);
      
      console.log(`✅ 獎勵明細已更新: 提領記錄狀態改為 completed（${withdrawal.amount}P + 手續費${withdrawal.fee}P）`);
    } else {
      // 容錯處理：如果找不到記錄（不應該發生），新增完成記錄
      console.warn(`⚠️ 找不到對應的獎勵明細記錄: withdrawalId=${withdrawalId}，將新增完成記錄`);
      
      const totalAmount = withdrawal.amount + withdrawal.fee;
      
      history.unshift({
        id: `history_${Date.now()}_withdrawal_completed_${withdrawalId}`,
        type: 'withdrawal_completed',
        amount: -totalAmount,
        description: `提領完成（${withdrawal.amount}P + 手續費${withdrawal.fee}P）`,
        issuedAt: toTaiwanISOString(now),
        balance: balanceAfterWithdrawal,
        withdrawalId: withdrawalId,
        status: 'completed',
        completedAt: toTaiwanISOString(now)
      });
      
      await kv.set(historyKey, history);
      
      console.log(`✅ 新增提領完成記錄（容錯處理）: -${totalAmount}P`);
    }
    
    console.log('========== ✅ 確認查收完成 ==========');
    
    return c.json({
      success: true,
      data: {
        withdrawalId,
        status: withdrawal.status,
        completedAt: withdrawal.completedAt
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 確認查收錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '確認查收失敗', details: error.message }
    }, 500);
  }
});

export default rewards;