import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyToken } from "./auth.ts";
import { REWARD_CONFIG, SCHEDULE_STATUS } from "./reward_config.ts";
import { 
  getTaiwanNow, 
  toTaiwanISOString, 
  toTaiwanDateString,
  getTaiwanToday,
  calculateSubscriptionEndDate 
} from './date_utils.ts';
// ❌ 移除：任務系統已改為只與會員繳費有關，不與刊登有關
// import { updateTaskProgress, updateReferralMonthlyLog } from "./task_helpers.ts";

// ===== 工具函數 =====

/**
 * ✅ 新規格：生成推薦碼（3個小寫英文字母 + 6個數字）
 * 格式：abc123456
 * 
 * @returns 9碼推薦碼
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
 * ❌ 淘汰：舊的推薦碼生成方式（16碼，基於用戶ID+刊登ID）
 * 保留供歷史數據查詢使用
 */
// function generateUserId(): string {
//   let result = '';
//   for (let i = 0; i < 10; i++) {
//     result += chars.charAt(Math.floor(Math.random() * chars.length));
//   }
//   return result;
// }

// function generateListingId(): string {
//   let result = '';
//   for (let i = 0; i < 6; i++) {
//     result += chars.charAt(Math.floor(Math.random() * chars.length));
//   }
//   return result;
// }

// function generateReferralCode(publicUserId: string, publicListingId: string): string {
//   const userPart = publicUserId.substring(0, 10);
//   const listingPart = publicListingId.substring(0, 6);
//   return `${userPart}${listingPart}`;
// }

// ===== API: 驗證推薦碼 =====
export async function verifyReferralCode(c: any) {
  try {
    const { referralCode, currentUserId } = await c.req.json();
    
    console.log(`驗證推薦碼請求: code=${referralCode}, userId=${currentUserId}`);
    
    // ✅ 新規格：格式驗證（3個小寫英文字母 + 6個數字 = 9碼）
    if (!referralCode || referralCode.length !== 9) {
      console.log(`推薦碼格式錯誤: 長度=${referralCode?.length}`);
      return c.json({
        valid: false,
        error: { message: '推薦碼格式錯誤，應為9碼（3個小寫英文字母+6個數字）' }
      }, 400);
    }
    
    // ✅ 驗證推薦碼格式（abc123456）
    if (!/^[a-z]{3}\d{6}$/.test(referralCode)) {
      console.log(`推薦碼格式錯誤: ${referralCode}`);
      return c.json({
        valid: false,
        error: { message: '推薦碼格式錯誤，應為3個小寫英文字母+6個數字' }
      }, 400);
    }
    
    // 從 KV Store 查詢推薦碼
    const referralData = await kv.get(`referral_code:${referralCode}`);
    
    if (!referralData) {
      console.log(`推薦碼不存在: ${referralCode}`);
      return c.json({
        valid: false,
        error: { message: '推薦碼不存在' }
      }, 404);
    }
    
    // ✅ 檢查是否為用戶自己的推薦碼（僅在有 currentUserId 時檢查）
    if (currentUserId && referralData.userId === currentUserId) {
      console.log(`用戶嘗試使用自己的推薦碼: ${referralCode}`);
      return c.json({
        valid: false,
        error: { message: '不能使用自己的推薦碼' }
      }, 400);
    }
    
    console.log(`✅ 推薦碼驗證成功: ${referralCode} -> ${referralData.userName}`);
    return c.json({
      valid: true,
      referrerName: referralData.userName,
      referrerUserId: referralData.userId
    });
    
  } catch (error) {
    console.error('❌ 推薦碼驗證錯誤:', error);
    return c.json({
      valid: false,
      error: { message: '推薦碼驗證失敗', details: error.message }
    }, 500);
  }
}

// ===== API: 上傳刊登照片 =====
export async function uploadListingPhoto(c: any) {
  try {
    // JWT 驗證 - 使用統一的 verifyToken 函數
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[uploadListingPhoto] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[uploadListingPhoto] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[uploadListingPhoto] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 創建 Supabase client 用於 Storage 操作
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const listingTempId = formData.get('listingTempId') as string;
    
    if (!file) {
      return c.json({ error: { message: '未提供檔案' } }, 400);
    }
    
    console.log(`上傳照片: user=${user.id}, file=${file.name}, size=${file.size}`);
    
    // 驗證檔案大小（5MB）
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      console.log(`❌ 照片過大: ${file.size} bytes`);
      return c.json({ error: { message: '照片大小不能超過 5MB' } }, 400);
    }
    
    // 驗證檔案格式
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      console.log(`❌ 不支援的格式: ${file.type}`);
      return c.json({ error: { message: '只支援 JPG、PNG、WEBP 格式' } }, 400);
    }
    
    // 生成檔案名稱
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${listingTempId}/${Date.now()}.${fileExt}`;
    
    console.log(`📤 準備上傳: ${fileName}`);
    
    // ✅ 將 File 轉換為 ArrayBuffer（Edge Functions 環境需要）
    const fileBuffer = await file.arrayBuffer();
    
    // 上傳到 Supabase Storage
    const { data, error } = await supabase.storage
      .from('make-5c6718b9-listings-photos')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false
      });
    
    if (error) {
      console.error('❌ 上傳照片錯誤:', error);
      return c.json({ error: { message: '上傳失敗', details: error.message } }, 500);
    }
    
    console.log(`✅ 照片上傳成功，路徑: ${data.path}`);
    
    // 取得公開 URL
    const { data: { publicUrl } } = supabase.storage
      .from('make-5c6718b9-listings-photos')
      .getPublicUrl(fileName);
    
    console.log(`✅ 公開 URL: ${publicUrl}`);
    return c.json({
      success: true,
      photoUrl: publicUrl
    });
    
  } catch (error) {
    console.error('❌ 上傳照片錯誤:', error);
    return c.json({
      error: { message: '上傳照片失敗', details: error.message }
    }, 500);
  }
}

// ===== API: 創建刊登 =====
export async function createListing(c: any) {
  try {
    console.log('========== 開始創建刊登 ==========');
    
    // ===== 步驟1: JWT 驗證 - 使用統一的 verifyToken 函數 =====
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[createListing] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[createListing] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[createListing] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // ===== ✅ 步驟1.5: 檢查用戶是否已有刊登（新規格：一個用戶只能有一個刊登）=====
    const existingListingId = await kv.get(`user:${user.id}:listing`);
    if (existingListingId) {
      console.log(`❌ 用戶已有刊登: ${existingListingId}`);
      return c.json({
        success: false,
        error: {
          code: 'LISTING_ALREADY_EXISTS',
          message: '您已經有一個刊登，每個帳號只能建立一個刊登',
          existingListingId
        }
      }, 400);
    }
    console.log('✅ 用戶尚未創建刊登，可以繼續');
    
    // ===== 步驟2: 取得請求資料 =====
    const { referralCode, listingData } = await c.req.json();
    const subscriptionPlan = 'yearly'; // 固定為年費方案
    console.log(`請求資料: referralCode=${referralCode}, plan=${subscriptionPlan}`);
    
    // ✅ 驗證必填字段
    const requiredFields = ['name', 'category', 'gender', 'city', 'districts', 'photos'];
    for (const field of requiredFields) {
      if (!listingData[field]) {
        console.log(`❌ 缺少必填字段: ${field}`);
        return c.json({ 
          error: { message: `${field} 為必填字段` } 
        }, 400);
      }
    }

    // ✅ 驗證 gender 值（只能是「男」或「女」）
    const validGenders = ['男', '女'];
    if (!validGenders.includes(listingData.gender)) {
      console.log(`❌ 性別字段無效: ${listingData.gender}`);
      return c.json({ 
        error: { message: '性別只能選擇「男」或「女」' } 
      }, 400);
    }

    // ✅ 驗證照片數量（必須是3張）
    if (!Array.isArray(listingData.photos) || listingData.photos.length !== 3) {
      console.log(`❌ 照片數量錯誤: ${listingData.photos?.length}`);
      return c.json({ 
        error: { message: '必須上傳3張照片' } 
      }, 400);
    }
    
    // ===== 步驟3: 取得用戶資料 =====
    const userProfile = await kv.get(`user:${user.id}:profile`);
    if (!userProfile) {
      console.log('❌ 用戶資料不存在');
      return c.json({ error: { message: '用戶資料不存在' } }, 404);
    }
    
    console.log(`✅ 用戶資料: name=${userProfile.name}`);
    
    // ❌ 移除步驟4和步驟5不再需要 Public User ID 和 Public Listing ID
    // 原因：新推薦碼格式不再基於這些 ID
    
    // ===== 步驟4: 生成內部 Listing ID =====
    const listingId = `listing_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`✅ 生成內部 Listing ID: ${listingId}`);
    
    // ===== ✅ 步驟5: 獲取或生成推薦碼（Phase 9.7: Bug PHASE9-007 修復）=====
    let newReferralCode = userProfile.referralCode;  // ✅ 優先使用付款時生成的推薦碼
    
    if (newReferralCode) {
      console.log(`✅ 使用已有推薦碼: ${newReferralCode}`);
      
      // ✅ 更新推薦碼索引（綁定到刊登）
      const existingReferralData = await kv.get(`referral_code:${newReferralCode}`);
      if (existingReferralData) {
        await kv.set(`referral_code:${newReferralCode}`, {
          ...existingReferralData,
          listingId: listingId,       // ✅ 更新 listingId
          listingName: listingData.name  // ✅ 更新 listingName
        });
        console.log(`✅ 更新推薦碼索引: ${newReferralCode} → listingId=${listingId}, listingName=${listingData.name}`);
      } else {
        // 如果推薦碼索引不存在，創建新的（容錯處理）
        await kv.set(`referral_code:${newReferralCode}`, {
          code: newReferralCode,
          userId: user.id,
          listingId: listingId,
          userName: userProfile.name,
          listingName: listingData.name,
          createdAt: toTaiwanISOString(getTaiwanNow())
        });
        console.log(`✅ 創建推薦碼索引（容錯）: ${newReferralCode}`);
      }
    } else {
      // ✅ 兼容舊用戶：如果沒有推薦碼，生成新的
      console.log(`⚠️ 用戶沒有推薦碼（舊用戶），生成新的`);
      newReferralCode = generateReferralCode();
      
      // 確保推薦碼唯一性
      let codeAttempts = 0;
      while (await kv.get(`referral_code:${newReferralCode}`)) {
        console.log(`⚠️ 推薦碼衝突，重新生成: ${newReferralCode}`);
        newReferralCode = generateReferralCode();
        codeAttempts++;
        if (codeAttempts > 10) {
          throw new Error('無法生成唯一的推薦碼');
        }
      }
      
      console.log(`✅ 生成新推薦碼: ${newReferralCode}`);
      
      // 創建推薦碼索引
      await kv.set(`referral_code:${newReferralCode}`, {
        code: newReferralCode,
        userId: user.id,
        listingId: listingId,
        userName: userProfile.name,
        listingName: listingData.name,
        createdAt: toTaiwanISOString(getTaiwanNow())
      });
      
      // 更新用戶 profile，保存推薦碼
      await kv.set(`user:${user.id}:profile`, {
        ...userProfile,
        referralCode: newReferralCode,
        updatedAt: toTaiwanISOString(getTaiwanNow())
      });
      console.log(`✅ 更新用戶 profile，保存推薦碼: ${newReferralCode}`);
    }
    
    // ===== 步驟6: 計算訂閱日期 =====
    const now = getTaiwanNow();
    const createdAt = toTaiwanISOString(now);
    const lastPaymentDate = toTaiwanISOString(now);
    
    // 固定年費方案：下次付款日為一年後
    let nextPaymentDate = new Date(now);
    nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
    
    const activeUntil = new Date(nextPaymentDate);
    activeUntil.setDate(activeUntil.getDate() - 1);
    activeUntil.setHours(23, 59, 59, 999);
    
    console.log(` 日期計算:`);
    console.log(`   創建: ${createdAt}`);
    console.log(`   下次付款: ${nextPaymentDate.toISOString()}`);
    console.log(`   有效期限: ${activeUntil.toISOString()}`);
    
    // ===== 步驟7: 處理推薦人 =====
    // ✅ 修正：從用戶 profile 中讀取註冊時使用的推薦碼（referredByCode）
    let referrerUserId = null;
    let referrerListingId = null;
    
    const referredByCode = userProfile.referredByCode;  // ✅ 從用戶 profile 讀取
    
    if (referredByCode) {
      console.log(`✅ 用戶註冊時使用的推薦碼: ${referredByCode}`);
      
      const referralData = await kv.get(`referral_code:${referredByCode}`);
      if (referralData) {
        referrerUserId = referralData.userId;
        referrerListingId = referralData.listingId;
        console.log(`✅ 推薦人: ${referralData.userName} (${referrerUserId}), 推薦刊登: ${referrerListingId}`);
      } else {
        console.log(`⚠️ 推薦碼索引不存在: ${referredByCode}`);
      }
    } else {
      console.log('ℹ 無推薦人');
    }
    
    // ===== 步驟8: 組裝刊登資料 =====
    const listing = {
      id: listingId,
      userId: user.id,
      name: listingData.name,
      category: listingData.category,
      gender: listingData.gender,        // ✅ 新增性別字段
      city: listingData.city,
      districts: listingData.districts,
      description: listingData.description || '',
      photos: listingData.photos,
      contacts: listingData.contacts,
      subscriptionPlan,
      referrerUserId,
      referrerListingId,                 // ✅ 新增：推薦的刊登 ID
      referralCode: newReferralCode,
      createdAt,
      lastPaymentDate,
      nextPaymentDate: nextPaymentDate.toISOString(),
      activeUntil: activeUntil.toISOString()
    };
    
    // ===== 步驟9: 儲存到 KV Store =====
    console.log('💾 開始儲存資料...');
    
    // 9.1 儲存刊登資料
    await kv.set(`listing:${listingId}`, listing);
    console.log(`✅ 儲存刊登: listing:${listingId}`);
    
    // 9.2 ✅ 儲存用戶的刊登 ID（新規格：單一值，不是陣列）
    await kv.set(`user:${user.id}:listing`, listingId);
    console.log(`✅ 儲存用戶的刊登 ID: user:${user.id}:listing = ${listingId}`);
    
    // ❌ 移除舊的陣列儲存方式
    // const userListings = await kv.get(`user:${user.id}:listings`) || [];
    // userListings.push(listingId);
    // await kv.set(`user:${user.id}:listings`, userListings);
    
    // ❌ 移除：不需要重複保存推薦碼映射（已在步驟5更新）
    // 9.3 儲存推薦碼映射
    // await kv.set(`referral_code:${newReferralCode}`, {
    //   listingId,
    //   userId: user.id,
    //   userName: userProfile.name
    // });
    // console.log(`✅ 儲存推薦碼映射: referral_code:${newReferralCode}`);
    
    // ===== 步驟9.4: 推薦關係處理 =====
    // ⚠️ 架構變更：推薦關係只在付款時建立（payment.ts），刊登時不更新
    // 原因：避免重複更新導致 referral_tree 和 referral_stats 計數不一致
    // 參考：payment.ts 第 402-595 行已完整處理推薦關係和獎勵發放
    // 
    // 說明：
    // - 付款時已更新推薦人的 referral_tree（一代、二代、三代）
    // - 付款時已發放上三代的首月獎勵
    // - 付款時已創建後續 11 個月的獎勵排程
    // - 刊登創建不應該再次觸發這些邏輯
    console.log('ℹ️ 推薦關係已在付款時建立，刊登創建不處理推薦邏輯');
    
    // ===== 步驟10: 返回成功 =====
    console.log('========== ✅ 刊登創建成功 ==========');
    return c.json({
      success: true,
      listingId,
      referralCode: newReferralCode,
      activeUntil: activeUntil.toISOString(),
      nextPaymentDate: nextPaymentDate.toISOString()
    });
    
  } catch (error) {
    console.error('========== ❌ 創建刊登錯誤 ==========');
    console.error(error);
    return c.json({
      success: false,
      error: { 
        code: 'CREATE_LISTING_FAILED',
        message: '創建刊登失敗', 
        details: error.message 
      }
    }, 500);
  }
}

// ===== API: 獲取用戶的刊登（新規格：單一刊登）=====
export async function getUserListings(c: any) {
  try {
    console.log('========== 獲取用戶刊登 ==========');
    
    // JWT 驗證 - 使用統一的 verifyToken 函數
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[getUserListings] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[getUserListings] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[getUserListings] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // ✅ 獲取用戶的單一刊登 ID（新規格：不是陣列）
    const listingId = await kv.get(`user:${user.id}:listing`);
    
    if (!listingId) {
      console.log('ℹ️ 戶尚未創建刊登');
      return c.json({ 
        success: true, 
        listing: null  // ✅ 返回單一值
      });
    }
    
    console.log(`✅ 用戶刊登 ID: ${listingId}`);
    
    // ✅ 讀取刊登詳情
    const listing = await kv.get(`listing:${listingId}`);
    
    if (!listing) {
      console.error(`❌ 刊登數據不存在: ${listingId}`);
      // 資料不一致，清理索引
      await kv.del(`user:${user.id}:listing`);
      return c.json({ 
        success: true, 
        listing: null 
      });
    }
    
    console.log(`✅ 返回刊登: ${listing.name}`);
    return c.json({ 
      success: true, 
      listing  // ✅ 返回單一對象
    });
    
  } catch (error) {
    console.error('❌ 獲取用戶刊登失敗:', error);
    return c.json({
      error: { message: '獲取刊登失敗', details: error.message }
    }, 500);
  }
}

// ===== API: 獲取所有活躍刊登（首頁用）=====
export async function getAllActiveListings(c: any) {
  try {
    console.log('========== 獲取所有活躍刊登 ==========');
    
    // 獲取所有 listing: 開頭的數據
    const allData = await kv.getByPrefix("listing:");
    console.log(`KV Store 返回數據數量: ${allData.length}`);
    
    // 過濾出完整刊登對象（排除 publicListingId 映射）
    // listing:listing_xxx ✅ 保留完整刊登數據，值是對象且有 id 字段）
    // listing:mV7hJ2 ❌ 跳過（publicListingId 映射，值是字符串）
    const listings = allData.filter((item: any) => {
      return typeof item === 'object' && item !== null && item.id && item.id.startsWith('listing_');
    });
    
    console.log(`過濾後的刊登數量: ${listings.length}`);
    
    // 前時間
    const now = new Date();
    
    // 核心過濾邏輯：activeUntil >= now
    const activeListings = listings.filter((listing: any) => {
      // activeUntil 必須 >= 當前時間
      const activeUntil = new Date(listing.activeUntil);
      if (activeUntil < now) {
        console.log(`刊登已過期: ${listing.name}, activeUntil: ${listing.activeUntil}`);
        return false;
      }
      
      return true;
    });
    
    // 按創建日期降序排序
    activeListings.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    console.log(`✅ 活躍刊登: ${activeListings.length}/${listings.length}`);
    
    return c.json({
      success: true,
      listings: activeListings,
      total: listings.length,
      active: activeListings.length
    });
    
  } catch (error) {
    console.error('❌ 獲取活躍刊登失敗:', error);
    return c.json({
      error: { message: '取刊登列表失敗', details: error.message }
    }, 500);
  }
}

// ===== API: 獲取單個刊登詳情 =====
export async function getListingById(c: any) {
  try {
    const { id } = c.req.param();
    console.log(`獲取刊登詳情: ${id}`);
    
    let listing = null;
    
    // 如果是內部 ID（listing_xxx）
    if (id.startsWith('listing_')) {
      listing = await kv.get(`listing:${id}`);
    } 
    // 如果是公開 ID（6碼）
    else {
      // 通過 publicListingId 查找內部 ID
      const internalId = await kv.get(`listing:${id}`);
      if (internalId) {
        listing = await kv.get(`listing:${internalId}`);
      }
    }
    
    if (!listing) {
      console.log(`❌ 刊登不存在: ${id}`);
      return c.json({ error: { message: '刊登不存在' } }, 404);
    }
    
    console.log(`✅ 獲取刊登詳情成功: ${listing.name}`);
    return c.json({ success: true, listing });
    
  } catch (error) {
    console.error('❌ 獲取刊登詳情失敗:', error);
    return c.json({
      error: { message: '獲取刊登詳情失敗', details: error.message }
    }, 500);
  }
}

// ===== API: 更新刊登 =====
export async function updateListing(c: any) {
  try {
    console.log('========== 開始更新刊登 ==========');
    
    // ===== 步驟1: JWT 驗證 - 使用統一的 verifyToken 函數 =====
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[updateListing] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[updateListing] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[updateListing] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // ===== 步驟2: 取得刊登 ID 和更新資料 =====
    const { id } = c.req.param();
    const updateData = await c.req.json();
    
    console.log(`請求更新刊登: ${id}`);
    console.log(`更新資料:`, updateData);
    
    // ===== 步驟3: 獲取現有刊登 =====
    let listing = null;
    
    // 如果是內部 ID（listing_xxx）
    if (id.startsWith('listing_')) {
      listing = await kv.get(`listing:${id}`);
    } 
    // 如果是公開 ID（6碼）
    else {
      const internalId = await kv.get(`listing:${id}`);
      if (internalId) {
        listing = await kv.get(`listing:${internalId}`);
      }
    }
    
    if (!listing) {
      console.log(`❌ 刊登不存在: ${id}`);
      return c.json({ error: { message: '刊登不存在' } }, 404);
    }
    
    // ===== 步驟4: 驗證權限 =====
    if (listing.userId !== user.id) {
      console.log(`❌ 用戶 ${user.id} 無權編輯刊登 ${id}（擁有者: ${listing.userId}）`);
      return c.json({ error: { message: '您無權編輯此刊登' } }, 403);
    }
    
    console.log(`✅ 權限驗證通過`);
    
    // ===== 步驟5: 驗證必填字段 =====
    const requiredFields = ['name', 'category', 'gender', 'city', 'districts', 'photos'];
    for (const field of requiredFields) {
      if (!updateData[field]) {
        console.log(`❌ 缺少必填字段: ${field}`);
        return c.json({ 
          error: { message: `${field} 為必填字段` } 
        }, 400);
      }
    }
    
    // ===== 步驟6: 驗證 gender 值 =====
    const validGenders = ['男', '女'];
    if (!validGenders.includes(updateData.gender)) {
      console.log(`❌ 性別字段無效: ${updateData.gender}`);
      return c.json({ 
        error: { message: '性別只能選擇「男」或「女」' } 
      }, 400);
    }
    
    // ===== 步驟7: 驗證照片數量（必須是3張）=====
    if (!Array.isArray(updateData.photos) || updateData.photos.length !== 3) {
      console.log(`❌ 照片數量錯誤: ${updateData.photos?.length}`);
      return c.json({ 
        error: { message: '必須上傳3張照片' } 
      }, 400);
    }
    
    // ===== 步驟8.5: 刪除舊照片 =====
    const oldPhotos = listing.photos || [];
    const newPhotos = updateData.photos || [];
    
    // 找出需要刪除的照片（在舊列表中，但不在新列表中）
    const photosToDelete = oldPhotos.filter((url: string) => !newPhotos.includes(url));
    
    if (photosToDelete.length > 0) {
      console.log(`📸 準備刪除 ${photosToDelete.length} 張舊照片`);
      
      // 創建 Supabase client 用於 Storage 操作
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      // 從 URL 提取文件路徑
      const filePaths = photosToDelete.map((url: string) => {
        try {
          const urlObj = new URL(url);
          // URL 格式: https://{projectId}.supabase.co/storage/v1/object/public/make-5c6718b9-listings-photos/{userId}/{listingId}/{timestamp}.{ext}
          const pathMatch = urlObj.pathname.match(/\/make-5c6718b9-listings-photos\/(.+)$/);
          return pathMatch ? pathMatch[1] : null;
        } catch (e) {
          console.error(`⚠️ 解析照片 URL 失敗: ${url}`, e);
          return null;
        }
      }).filter(Boolean);
      
      if (filePaths.length > 0) {
        console.log(`🗑️ 刪除文件路徑:`, filePaths);
        
        const { error: deleteError } = await supabase.storage
          .from('make-5c6718b9-listings-photos')
          .remove(filePaths);
        
        if (deleteError) {
          console.error('⚠️ 刪除舊照片失敗（不影響更新）:', deleteError);
        } else {
          console.log(`✅ 成功刪除 ${filePaths.length} 張舊照片`);
        }
      }
    } else {
      console.log('ℹ️ 沒有需要刪除的舊照片');
    }
    
    // ===== 步驟8: 更新刊登資料 =====
    const updatedListing = {
      ...listing,
      name: updateData.name,
      category: updateData.category,
      gender: updateData.gender,
      city: updateData.city,
      districts: updateData.districts,
      description: updateData.description || '',
      photos: updateData.photos,
      contacts: updateData.contacts,
      updatedAt: new Date().toISOString()
    };
    
    // ===== 步驟9: 儲存到 KV Store =====
    await kv.set(`listing:${listing.id}`, updatedListing);
    console.log(`✅ 刊登已更新: ${listing.id}`);
    
    console.log('========== ✅ 刊登更新成功 ==========');
    return c.json({
      success: true,
      listing: updatedListing
    });
    
  } catch (error) {
    console.error('========== ❌ 更新刊登錯誤 ==========');
    console.error(error);
    return c.json({
      error: { 
        message: '更新刊登失敗', 
        details: error.message 
      }
    }, 500);
  }
}

// ===== API: 刪除刊登 =====
export async function deleteListing(c: any) {
  try {
    console.log('========== 開始刪除刊登 ==========');
    
    // ===== 步驟1: JWT 驗證 =====
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.log('❌ 缺少 Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[deleteListing] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[deleteListing] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // ===== 步驟2: 獲取刊登 ID =====
    const { id } = c.req.param();
    console.log(`刪除刊登 ID: ${id}`);
    
    // ===== 步驟3: 驗證刊登存在且屬於該用戶 =====
    const listing = await kv.get(`listing:${id}`);
    
    if (!listing) {
      console.log(`❌ 刊登不存在: ${id}`);
      return c.json({ 
        error: { message: '刊登不存在' } 
      }, 404);
    }
    
    if (listing.userId !== user.id) {
      console.log(`❌ 無權刪除此刊登: listing.userId=${listing.userId}, user.id=${user.id}`);
      return c.json({ 
        error: { message: '無權刪除此刊登' } 
      }, 403);
    }
    
    console.log(`✅ 刊登驗證通過: ${listing.name}`);
    
    // ===== 步驟4: 刪除 Supabase Storage 中的照片 =====
    if (listing.photos && listing.photos.length > 0) {
      console.log(`📸 準備刪除 ${listing.photos.length} 張照片`);
      
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      // 從 URL 提取文件路徑
      const filePaths = listing.photos.map((url: string) => {
        try {
          const urlObj = new URL(url);
          // URL 格式: https://{projectId}.supabase.co/storage/v1/object/public/make-5c6718b9-listings-photos/{userId}/{listingId}/{timestamp}.{ext}
          const pathMatch = urlObj.pathname.match(/\/make-5c6718b9-listings-photos\/(.+)$/);
          return pathMatch ? pathMatch[1] : null;
        } catch (e) {
          console.error(`❌ 解析照片 URL 失敗: ${url}`, e);
          return null;
        }
      }).filter(Boolean);
      
      if (filePaths.length > 0) {
        const { error: deleteError } = await supabase.storage
          .from('make-5c6718b9-listings-photos')
          .remove(filePaths);
        
        if (deleteError) {
          console.error('⚠️ 刪除照片失敗:', deleteError);
          // 繼續刪除刊登，即使照片刪除失敗
        } else {
          console.log(`✅ 已刪除 ${filePaths.length} 張照片`);
        }
      }
    }
    
    // ===== 步驟5: 刪除刊登數據 =====
    await kv.del(`listing:${id}`);
    console.log(`✅ 已刪除刊登數據: ${id}`);
    
    // ===== 步驟6: 從用戶的刊登映射中移除 =====
    const userListingKey = `user:${user.id}:listing`;
    const userListingId = await kv.get(userListingKey);
    
    if (userListingId === id) {
      await kv.del(userListingKey);
      console.log(`✅ 已從用戶映射中移除刊登: user=${user.id}`);
    }
    
    // ⚠️ 注釋：此處不處理推薦樹、獎勵排程等複雜邏輯
    // 這些數據保留作為歷史記錄，不影響系統運作
    
    console.log('========== ✅ 刊登刪除成功 ==========');
    return c.json({
      success: true,
      message: '刊登已成功刪除'
    });
    
  } catch (error) {
    console.error('========== ❌ 刪除刊登錯誤 ==========');
    console.error(error);
    return c.json({
      error: { 
        message: '刪除刊登失敗', 
        details: error.message 
      }
    }, 500);
  }
}

// ===================================================================
// 推薦獎勵系統 - 核心處理函數
// ===================================================================

/**
 * @deprecated 已棄用：推薦關係改為只在付款時處理（payment.ts）
 * 
 * ⚠️ 重要架構變更：
 * - 推薦關係只在付款成功時建立（參考 payment.ts 第 402-595 行）
 * - 刊登創建不再更新 referral_tree 和 referral_stats
 * - 此函數保留僅供歷史參考，不應再被調用
 * 
 * 處理推薦獎勵的完整流程
 * 
 * ✅ 要架構變更：推薦樹以用戶為根，而不是刊登
 * 原因：推薦碼綁定到用戶，與刊登無關
 * 
 * 流程：
 * 1. 向上遍歷推薦鏈，找到所有祖先（最多3層）
 * 2. 對每個祖先：
 *    - ✅ 更新其用戶推薦樹（user:${userId}:referral_tree）
 *    - 更新其推薦統計
 *    - 發放獎勵（根據代數調整倍率）
 * 3. 只為第1代（直接推薦人）：
 *    - 更新月度日誌
 *    - 更新任務進度
 */
async function processReferralRewards({
  referrerUserId,
  referrerListingId,
  newListing,
  createdAt
}: {
  referrerUserId: string;
  referrerListingId: string;
  newListing: any;
  createdAt: Date;
}) {
  console.log(`🔄 開始處理推薦獎勵: referrer=${referrerUserId}, newListing=${newListing.id}`);
  
  try {
    // 1. 向上遍歷推薦鏈，找到所有祖先（最多3層）
    const ancestors: { listingId: string, userId: string }[] = [];
    let currentListing = newListing;
    
    while (currentListing.referrerListingId && ancestors.length < REWARD_CONFIG.MAX_GENERATION) {
      const parentListing = await kv.get(`listing:${currentListing.referrerListingId}`);
      if (!parentListing) break;
      
      ancestors.push({
        listingId: parentListing.id,
        userId: parentListing.userId
      });
      
      currentListing = parentListing;
    }
    
    console.log(`📊 推薦鏈長度: ${ancestors.length}`);
    
    // 2. 對每個祖先：
    //    - ✅ 更新其用戶推薦樹（user:${userId}:referral_tree）
    //    - 更新其推薦統計
    //    - 發放獎勵（根據代數調整倍率）
    for (let i = 0; i < ancestors.length; i++) {
      const ancestor = ancestors[i];
      const generation = i + 1;
      
      // 更新推薦樹
      await updateReferralTree(ancestor.userId, newListing, generation);
      
      // 更新推薦統計
      await updateReferralStats(ancestor.userId, generation);
      
      // 發放獎勵
      await issueImmediateReward(ancestor.userId, newListing, generation, createdAt);
      
      // 創建後續11個月的獎勵排程
      await createRewardSchedules(ancestor.userId, newListing, generation, createdAt);
    }
    
    // ❌ 移除：任務系統已改為只與會員繳費有關，不與刊登有關
    // 任務進度和月度日誌的更新已移至 payment.ts (付費成功時)
    
    console.log('✅ 推薦獎勵處理完成');
    
  } catch (error) {
    console.error('❌ 推薦獎勵處理失敗:', error);
    throw error;
  }
}

/**
 * 更新推薦樹（預計算快取）
 * 為用戶建立/更新完整的推薦樹結構
 */
async function updateReferralTree(
  userId: string,
  newListing: any,
  generation: number
) {
  const key = `user:${userId}:referral_tree`;
  const tree = await kv.get(key) || {
    firstGeneration: [],
    secondGeneration: [],
    thirdGeneration: []
  };
  
  // ===== 1. 獲被推薦人用戶名 =====
  const newUserProfile = await kv.get(`user:${newListing.userId}:profile`);
  const userName = newUserProfile?.name || '未知用戶';
  
  // ===== 2. 獲取推薦人信息（二代、三代需要）=====
  let referrer = null;
  if (generation > 1 && newListing.referrerUserId && newListing.referrerListingId) {
    const referrerProfile = await kv.get(`user:${newListing.referrerUserId}:profile`);
    const referrerListing = await kv.get(`listing:${newListing.referrerListingId}`);
    
    if (referrerProfile && referrerListing) {
      referrer = {
        ownerName: referrerProfile.name,    // ✅ 匹配前端 interface
        listingName: referrerListing.name
      };
    }
  }
  
  // ===== 3. 組裝刊登資訊 =====
  const listingInfo = {
    listingId: newListing.id,
    publicListingId: newListing.publicListingId,
    userId: newListing.userId,
    userPublicId: newListing.userPublicId,
    userName,                        // ✅ 新增：用戶名
    listingName: newListing.name,    // ✅ 明確字段名
    category: newListing.category,
    city: newListing.city,
    gender: newListing.gender,
    referrer,                        // ✅ 新增：推薦人信息
    createdAt: newListing.createdAt,
    activeUntil: newListing.activeUntil
  };
  
  // ===== 4. 根據代數加入對應層級 =====
  if (generation === 1) {
    tree.firstGeneration.push(listingInfo);
  } else if (generation === 2) {
    tree.secondGeneration.push(listingInfo);
  } else if (generation === 3) {
    tree.thirdGeneration.push(listingInfo);
  }
  
  tree.lastUpdated = new Date().toISOString();
  await kv.set(key, tree);
  
  console.log(`✅ 更新推薦樹: ${userId} - 第${generation}代 +1 (${userName}-${newListing.name})`);
}

/**
 * 更新推薦統計（預計算快取）
 * 為用戶更新總推薦數和各代推薦數
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
  
  stats.lastUpdated = new Date().toISOString();
  await kv.set(key, stats);
  
  console.log(`✅ 更新推薦統計: user=${userId}, gen=${generation}, total=${stats.totalReferrals}`);
}

/**
 * 發放第1個月獎勵（立即）
 * 根據 spec：新刊登完成時立即發放第1個月的10P
 */
async function issueImmediateReward(
  userId: string,
  newListing: any,
  generation: number,
  createdAt: Date
) {
  const amount = REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH; // 10P
  
  // ===== 1. 獲取被推薦人完整信息 =====
  const newUserProfile = await kv.get(`user:${newListing.userId}:profile`);
  const referee = {
    userId: newListing.userId,
    userName: newUserProfile?.name || '未知用戶',
    listingId: newListing.id,
    listingName: newListing.name
  };
  
  // ===== 2. 獲取推薦人完整信息（如果存在）=====
  let referrer = null;
  if (newListing.referrerUserId && newListing.referrerListingId) {
    const referrerProfile = await kv.get(`user:${newListing.referrerUserId}:profile`);
    const referrerListing = await kv.get(`listing:${newListing.referrerListingId}`);
    
    if (referrerProfile && referrerListing) {
      referrer = {
        userId: newListing.referrerUserId,
        userName: referrerProfile.name,
        listingId: newListing.referrerListingId,
        listingName: referrerListing.name
      };
    }
  }
  
  // ===== 3. 更新獎勵餘額 =====
  const rewardsKey = `user:${userId}:rewards`;
  const rewards = await kv.get(rewardsKey) || {
    availableRewards: 0,
    pendingRewards: 0,
    withdrawnRewards: 0,
    totalEarned: 0
  };
  
  rewards.availableRewards += amount;
  rewards.totalEarned += amount;
  rewards.lastUpdated = new Date().toISOString();
  
  await kv.set(rewardsKey, rewards);
  
  // ===== 4. 記錄獎勵歷史（新格式：包含完整推薦關係）=====
  const historyKey = `user:${userId}:reward_history`;
  const history = await kv.get(historyKey) || [];
  
  const description = `推薦獎勵 - ${referee.userName}-${referee.listingName}（第${generation}代）- 第1個月`;
  
  // ✅ 計算交易後餘額
  const balanceAfterTransaction = rewards.availableRewards + rewards.pendingRewards;
  
  history.unshift({
    id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: `referral_gen${generation}_month1`,
    amount,
    balance: balanceAfterTransaction,  // ✅ 新增：交易後餘額
    referee,           // ✅ 新增：完整的被推薦人信息
    referrer,          // ✅ 新增：完整的推薦人信息（可能為 null）
    generation,        // ✅ 新增：代數
    monthNumber: 1,    // ✅ 新增：月數
    issuedAt: createdAt,  // ✅ 修正：createdAt 已經是 ISO 字符串，不需要再調用 .toISOString()
    description
  });
  
  // 只保留最近200筆
  if (history.length > REWARD_CONFIG.REWARD_HISTORY_MAX_COUNT) {
    history.length = REWARD_CONFIG.REWARD_HISTORY_MAX_COUNT;
  }
  
  await kv.set(historyKey, history);
  
  console.log(`✅ 立即發放獎勵: user=${userId}, amount=${amount}P, referee=${referee.userName}-${referee.listingName} (第1個月)`);
}

/**
 * 創建後續11個月的獎勵排程
 * 根據 spec：第2~12個月的獎勵由定時任務發放
 */
async function createRewardSchedules(
  userId: string,
  newListing: any,
  generation: number,
  createdAt: Date
) {
  // ===== 1. 獲取被推薦人完整信息 =====
  const newUserProfile = await kv.get(`user:${newListing.userId}:profile`);
  const referee = {
    userId: newListing.userId,
    userName: newUserProfile?.name || '未知用戶',
    listingId: newListing.id,
    listingName: newListing.name
  };
  
  // ===== 2. 獲取推薦人完整信息（如果存在）=====
  let referrer = null;
  if (newListing.referrerUserId && newListing.referrerListingId) {
    const referrerProfile = await kv.get(`user:${newListing.referrerUserId}:profile`);
    const referrerListing = await kv.get(`listing:${newListing.referrerListingId}`);
    
    if (referrerProfile && referrerListing) {
      referrer = {
        userId: newListing.referrerUserId,
        userName: referrerProfile.name,
        listingId: newListing.referrerListingId,
        listingName: referrerListing.name
      };
    }
  }
  
  // ===== 3. 創建第2~12個月的排程（共11個）=====
  const schedules = [];
  
  for (let month = 1; month <= REWARD_CONFIG.REFERRAL_REWARD_MONTHS - 1; month++) {
    const scheduleDate = new Date(createdAt);
    scheduleDate.setMonth(scheduleDate.getMonth() + month);
    scheduleDate.setHours(0, 0, 0, 0);
    
    const scheduleDateStr = scheduleDate.toISOString().split('T')[0];
    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const schedule = {
      id: scheduleId,
      userId,
      referee,           // ✅ 新增：完整的被推薦人信息
      referrer,          // ✅ 新增：完整的推薦人信息（可能為 null）
      generation,
      monthNumber: month + 1,
      amount: REWARD_CONFIG.REFERRAL_REWARD_PER_MONTH,
      scheduledDate: scheduleDateStr,
      status: SCHEDULE_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    
    // 儲存排程
    await kv.set(`reward_schedule:${scheduleId}`, schedule);
    
    // 加入日期索引（用於定時任務快速查找）
    const dateIndexKey = `reward_schedules_by_date:${scheduleDateStr}`;
    const dateIndex = await kv.get(dateIndexKey) || [];
    dateIndex.push(scheduleId);
    await kv.set(dateIndexKey, dateIndex);
    
    schedules.push(schedule);
  }
  
  console.log(`✅ 創建獎勵排程: user=${userId}, count=${schedules.length}, referee=${referee.userName}-${referee.listingName} (第2~12個月)`);
}