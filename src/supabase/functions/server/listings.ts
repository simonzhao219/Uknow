import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyToken } from "./auth.ts";
import { REWARD_CONFIG, SCHEDULE_STATUS } from "./reward_config.ts";

// ===== 工具函數 =====
const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// 生成10碼用戶ID（用於組成推薦碼）
function generateUserId(): string {
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成6碼刊登ID（用於組成推薦碼）
function generateListingId(): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成推薦碼（用戶ID 10碼 + 刊登ID 6碼 = 16碼）
function generateReferralCode(publicUserId: string, publicListingId: string): string {
  const userPart = publicUserId.substring(0, 10);
  const listingPart = publicListingId.substring(0, 6);
  return `${userPart}${listingPart}`;
}

// ===== API: 驗證推薦碼 =====
export async function verifyReferralCode(c: any) {
  try {
    const { referralCode, currentUserId } = await c.req.json();
    
    console.log(`驗證推薦碼請求: code=${referralCode}, userId=${currentUserId}`);
    
    // 格式驗證：必須是16碼
    if (!referralCode || referralCode.length !== 16) {
      console.log(`推薦碼格誤: 長度=${referralCode?.length}`);
      return c.json({
        valid: false,
        error: { message: '推薦碼格式錯誤，應為16碼' }
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
    
    // 檢查是否為用戶自己的推薦碼
    const currentUserProfile = await kv.get(`user:${currentUserId}:profile`);
    
    if (currentUserProfile?.publicUserId) {
      const referralUserPart = referralCode.substring(0, 10);
      
      if (referralUserPart === currentUserProfile.publicUserId) {
        console.log(`用戶嘗試使用自己的推薦碼: ${referralCode}`);
        return c.json({
          valid: false,
          error: { message: '不能使用自己的推薦碼' }
        }, 400);
      }
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
    
    // 上傳到 Supabase Storage
    const { data, error } = await supabase.storage
      .from('make-5c6718b9-listings-photos')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      });
    
    if (error) {
      console.error('❌ 上傳照片錯誤:', error);
      return c.json({ error: { message: '上傳失敗', details: error.message } }, 500);
    }
    
    // 取得公開 URL
    const { data: { publicUrl } } = supabase.storage
      .from('make-5c6718b9-listings-photos')
      .getPublicUrl(fileName);
    
    console.log(`✅ 照片上傳成功: ${publicUrl}`);
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
    
    console.log(`✅ 用戶資料: name=${userProfile.name}, publicUserId=${userProfile.publicUserId}`);
    
    // ===== 步驟4: 檢查並生成 Public User ID =====
    let publicUserId = userProfile.publicUserId;
    
    if (!publicUserId) {
      // 🔥 第一次創建刊登，生成 Public User ID
      console.log('🔥 第一次創建刊登，生成 Public User ID...');
      publicUserId = generateUserId();
      
      // 確保唯一性
      let attempts = 0;
      while (await kv.get(`public_user_id:${publicUserId}`)) {
        console.log(`⚠️ Public User ID 衝突，重新生成: ${publicUserId}`);
        publicUserId = generateUserId();
        attempts++;
        if (attempts > 10) {
          throw new Error('無法生成唯一的 Public User ID');
        }
      }
      
      // 更新用戶資料
      userProfile.publicUserId = publicUserId;
      userProfile.updatedAt = new Date().toISOString();
      await kv.set(`user:${user.id}:profile`, userProfile);
      
      // 建立反向映射
      await kv.set(`public_user_id:${publicUserId}`, user.id);
      
      console.log(`✅ 為用戶 ${user.id} 生成 Public User ID: ${publicUserId}`);
    } else {
      console.log(`✅ 用戶已有 Public User ID: ${publicUserId}`);
    }
    
    // ===== 步驟5: 生成 Public Listing ID =====
    let publicListingId = generateListingId();
    
    // 確保唯一性
    let attempts = 0;
    while (await kv.get(`listing:${publicListingId}`)) {
      console.log(`⚠️ Public Listing ID 衝突，重新生成: ${publicListingId}`);
      publicListingId = generateListingId();
      attempts++;
      if (attempts > 10) {
        throw new Error('無法生成唯一的 Public Listing ID');
      }
    }
    
    console.log(`✅ 生成 Public Listing ID: ${publicListingId}`);
    
    // ===== 步驟6: 生成內部 Listing ID =====
    const listingId = `listing_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`✅ 生成內部 Listing ID: ${listingId}`);
    
    // ===== 步驟7: 生成16碼推薦碼 =====
    const newReferralCode = generateReferralCode(publicUserId, publicListingId);
    console.log(`✅ 生成推薦碼: ${newReferralCode} (${publicUserId} + ${publicListingId})`);
    
    // ===== 步驟8: 計算訂閱日期 =====
    const now = new Date();
    const createdAt = now.toISOString();
    const lastPaymentDate = now.toISOString();
    
    // 固定年費方案：下次付款日為一年後
    let nextPaymentDate = new Date(now);
    nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
    
    const activeUntil = new Date(nextPaymentDate);
    activeUntil.setDate(activeUntil.getDate() - 1);
    activeUntil.setHours(23, 59, 59, 999);
    
    console.log(`✅ 日期計算:`);
    console.log(`   創建: ${createdAt}`);
    console.log(`   下次付款: ${nextPaymentDate.toISOString()}`);
    console.log(`   有效期限: ${activeUntil.toISOString()}`);
    
    // ===== 步驟9: 處理推薦人 =====
    let referrerUserId = null;
    let referrerListingId = null;  // 新增：推薦者的刊登 ID
    if (referralCode && referralCode !== 'DEFAULTRCM01') {
      const referralData = await kv.get(`referral_code:${referralCode}`);
      if (referralData) {
        referrerUserId = referralData.userId;
        referrerListingId = referralData.listingId;  // 新增：從推薦碼映射獲取刊登 ID
        console.log(`✅ 推薦人: ${referralData.userName} (${referrerUserId}), 推薦刊登: ${referrerListingId}`);
      }
    } else {
      console.log('ℹ️ 無推薦人');
    }
    
    // ===== 步驟10: 組裝刊登資料 =====
    const listing = {
      id: listingId,
      publicListingId,
      userId: user.id,
      userPublicId: publicUserId,
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
      referrerListingId,                 // ✅ 新增：推薦者的刊登 ID
      referralCode: newReferralCode,
      createdAt,
      lastPaymentDate,
      nextPaymentDate: nextPaymentDate.toISOString(),
      activeUntil: activeUntil.toISOString()
    };
    
    // ===== 步驟11: 儲存到 KV Store =====
    console.log('💾 開始儲存資料...');
    
    // 11.1 儲存刊登資料
    await kv.set(`listing:${listingId}`, listing);
    console.log(`✅ 儲存刊登: listing:${listingId}`);
    
    // 11.2 更新用戶的刊登列表
    const userListings = await kv.get(`user:${user.id}:listings`) || [];
    userListings.push(listingId);
    await kv.set(`user:${user.id}:listings`, userListings);
    console.log(`✅ 更新用戶刊登列表: ${userListings.length} 個刊登`);
    
    // 11.3 儲存推薦碼映射
    await kv.set(`referral_code:${newReferralCode}`, {
      listingId,
      userId: user.id,
      userName: userProfile.name
    });
    console.log(`✅ 儲存推薦碼映射: referral_code:${newReferralCode}`);
    
    // ===== 步驟11.4: 處理推薦獎勵（如果有推薦人）=====
    if (referrerUserId && referrerListingId) {
      try {
        console.log('🎁 開始處理推薦獎勵...');
        await processReferralRewards({
          referrerUserId,
          referrerListingId,
          newListing: listing,
          createdAt: now
        });
        console.log('✅ 推薦獎勵處理完成');
      } catch (rewardError) {
        // 獎勵處理失敗不影響刊登創建
        console.error('⚠️ 推薦獎勵處理失敗（不影響刊登創建）:', rewardError);
      }
    }
    
    // ===== 步驟12: 返回成功 =====
    console.log('========== ✅ 刊登創建成功 ==========');
    return c.json({
      success: true,
      listingId,
      publicListingId,
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

// ===== API: 獲取用戶的所有刊登 =====
export async function getUserListings(c: any) {
  try {
    console.log('========== 獲取用戶刊登列表 ==========');
    
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
    
    // 獲取用戶的刊登 ID 列表
    const listingIds = await kv.get(`user:${user.id}:listings`) || [];
    console.log(`用戶刊登數量: ${listingIds.length}`);
    
    if (listingIds.length === 0) {
      return c.json({ success: true, listings: [] });
    }
    
    // 批量讀取刊登詳情
    const listings = await Promise.all(
      listingIds.map(async (id: string) => {
        try {
          return await kv.get(`listing:${id}`);
        } catch (error) {
          console.error(`讀取刊登失敗: ${id}`, error);
          return null;
        }
      })
    );
    
    // 過濾掉 null 值
    const validListings = listings.filter(l => l !== null);
    
    // 按創建日期降序排序
    validListings.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    console.log(`✅ 返回 ${validListings.length} 個刊登`);
    return c.json({ success: true, listings: validListings });
    
  } catch (error) {
    console.error('❌ 獲取用戶刊登失敗:', error);
    return c.json({
      error: { message: '獲取刊登列表失敗', details: error.message }
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
    // listing:listing_xxx ✅ 保留（完整刊登數據，值是對象且有 id 字段）
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
      error: { message: '獲取刊登列表失敗', details: error.message }
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

// ===================================================================
// 推薦獎勵系統 - 核心處理函數
// ===================================================================

/**
 * 處理推薦獎勵的完整流程
 * 
 * ✅ 修復：向上遍歷推薦鏈，更新所有祖先的推薦樹（最多3代）
 * 
 * 流程：
 * 1. 向上遍歷推薦鏈，找到所有祖先（最多3層）
 * 2. 對每個祖先：
 *    - 更新其推薦樹（把新刊登加入對應的代數）
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
    //    - 更新其推薦樹（把新刊登加入對應的代數）
    //    - 更新其推薦統計
    //    - 發放獎勵（根據代數調整倍率）
    for (let i = 0; i < ancestors.length; i++) {
      const ancestor = ancestors[i];
      const generation = i + 1;
      
      // 更新推薦樹
      await updateReferralTree(ancestor.listingId, newListing, generation);
      
      // 更新推薦統計
      await updateReferralStats(ancestor.userId, generation);
      
      // 發放獎勵
      await issueImmediateReward(ancestor.userId, newListing, generation, createdAt);
      
      // 創建後續11個月的獎勵排程
      await createRewardSchedules(ancestor.userId, newListing, generation, createdAt);
    }
    
    // 3. 只為第1代（直接推薦人）：
    //    - 更新月度日誌
    //    - 更新任務進度
    if (ancestors.length > 0) {
      const firstGenAncestor = ancestors[0];
      
      // 更新推薦月度日誌（用於任務判定，只記錄第1代）
      await updateReferralMonthlyLog(firstGenAncestor.userId, newListing, createdAt);
      
      // 更新任務進度（只有第1代才計入任務）
      await updateTaskProgress(firstGenAncestor.userId, createdAt);
    }
    
    console.log('✅ 推薦獎勵處理完成');
    
  } catch (error) {
    console.error('❌ 推薦獎勵處理失敗:', error);
    throw error;
  }
}

/**
 * 更新推薦樹（預計算快取）
 * 為根刊登建立/更新完整的推薦樹結構
 */
async function updateReferralTree(
  rootListingId: string,
  newListing: any,
  generation: number
) {
  const key = `listing:${rootListingId}:referral_tree`;
  const tree = await kv.get(key) || {
    firstGeneration: [],
    secondGeneration: [],
    thirdGeneration: []
  };
  
  // ===== 1. 獲取被推薦人用戶名 =====
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
  
  console.log(`✅ 更新推薦樹: ${rootListingId} - 第${generation}代 +1 (${userName}-${newListing.name})`);
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
  
  history.unshift({
    id: `reward_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type: `referral_gen${generation}_month1`,
    amount,
    referee,           // ✅ 新增：完整的被推薦人信息
    referrer,          // ✅ 新增：完整的推薦人信息（可能為 null）
    generation,        // ✅ 新增：代數
    monthNumber: 1,    // ✅ 新增：月數
    issuedAt: createdAt.toISOString(),
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

/**
 * 更新推薦月度日誌
 * 用於任務判定，只記錄第1代推薦
 * 
 * 同時維護：
 * 1. 用戶級別日誌：user:${userId}:referral_monthly_log
 * 2. 全局月度日誌：referral_monthly_log:${monthKey} (用於定時任務掃描)
 */
async function updateReferralMonthlyLog(
  userId: string,
  newListing: any,
  createdAt: Date
) {
  const monthKey = createdAt.toISOString().substring(0, 7); // "2024-12"
  
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
  
  // ===== 3. 更新用戶級別日誌 =====
  const userLogKey = `user:${userId}:referral_monthly_log`;
  const userLog = await kv.get(userLogKey) || {};
  
  if (!userLog[monthKey]) {
    userLog[monthKey] = [];
  }
  
  userLog[monthKey].push({
    listingId: newListing.id,
    userId: newListing.userId,
    userName: referee.userName,       // ✅ 新增
    listingName: referee.listingName, // ✅ 新增
    referrer,                          // ✅ 新增（可能為 null）
    createdAt: createdAt.toISOString()
  });
  
  await kv.set(userLogKey, userLog);
  
  // ===== 4. 更新全局月度日誌（用於定時任務掃描）=====
  const globalLogKey = `referral_monthly_log:${monthKey}`;
  const globalLog = await kv.get(globalLogKey) || {};
  
  if (!globalLog[userId]) {
    globalLog[userId] = [];
  }
  
  globalLog[userId].push({
    listingId: newListing.id,
    userId: newListing.userId,
    userName: referee.userName,       // ✅ 新增
    listingName: referee.listingName, // ✅ 新增
    referrer,                          // ✅ 新增
    createdAt: createdAt.toISOString()
  });
  
  await kv.set(globalLogKey, globalLog);
  
  console.log(`✅ 更新月度日誌: user=${userId}, month=${monthKey}, referee=${referee.userName}-${referee.listingName}`);
}

/**
 * 更新任務進度
 * 只有第1代推薦才計入任務
 */
async function updateTaskProgress(
  userId: string,
  createdAt: Date
) {
  const tasksKey = `user:${userId}:tasks`;
  const tasks = await kv.get(tasksKey) || initializeDefaultTasks();
  
  const currentMonth = createdAt.toISOString().substring(0, 7); // "2024-01"
  const currentDate = createdAt.toISOString().split('T')[0]; // "2024-01-15"
  
  // ===== 更新連續推薦任務 =====
  if (!tasks.consecutiveReferral) {
    tasks.consecutiveReferral = {
      id: "task_consecutive",
      type: "consecutive_referral",
      title: "連續推薦達人",
      description: "連續12個月每月至少推薦1位用戶",
      target: REWARD_CONFIG.TASK_CONSECUTIVE_MONTHS,
      currentStreak: 0,
      startMonth: currentMonth,
      lastActiveMonth: null,
      monthlyRecord: {},
      completed: false,
      reward: REWARD_CONFIG.TASK_CONSECUTIVE_REWARD,
      lastCheckedAt: null
    };
  }
  
  const consecutive = tasks.consecutiveReferral;
  
  // 檢查是否斷續
  if (consecutive.lastActiveMonth) {
    const lastDate = new Date(consecutive.lastActiveMonth + "-01");
    const currentDateObj = new Date(currentMonth + "-01");
    const monthsDiff = (currentDateObj.getFullYear() - lastDate.getFullYear()) * 12
                     + (currentDateObj.getMonth() - lastDate.getMonth());
    
    if (monthsDiff > 1) {
      // 斷續了，重置任務
      console.log(`⚠️ 連續推薦任務斷續: 上次=${consecutive.lastActiveMonth}, 本次=${currentMonth}`);
      consecutive.currentStreak = 0;
      consecutive.startMonth = currentMonth;
      consecutive.monthlyRecord = {};
      consecutive.completed = false;
    }
  }
  
  // 更新本月記錄
  if (!consecutive.monthlyRecord[currentMonth]) {
    consecutive.monthlyRecord[currentMonth] = {
      count: 0,
      date: currentDate,
      qualified: false
    };
  }
  
  consecutive.monthlyRecord[currentMonth].count += 1;
  consecutive.monthlyRecord[currentMonth].qualified = true;
  
  // 如果是本月第一次推薦，連續月數+1
  if (consecutive.monthlyRecord[currentMonth].count === 1) {
    consecutive.currentStreak += 1;
  }
  
  consecutive.lastActiveMonth = currentMonth;
  
  // ===== 更新推薦王任務 =====
  if (!tasks.monthlyKing) {
    tasks.monthlyKing = {
      id: "task_monthly_king",
      type: "monthly_king",
      title: "推薦王",
      description: "單月推薦10位以上用戶",
      target: REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
      currentMonth: currentMonth,
      currentCount: 0,
      completed: false,
      reward: REWARD_CONFIG.TASK_MONTHLY_KING_REWARD,
      history: []
    };
  }
  
  const king = tasks.monthlyKing;
  
  // 檢查是否換月
  if (king.currentMonth !== currentMonth) {
    // 將上個月記錄加入歷史
    king.history.push({
      month: king.currentMonth,
      count: king.currentCount,
      qualified: king.currentCount >= REWARD_CONFIG.TASK_MONTHLY_KING_TARGET,
      checkedAt: null // 會在定時任務中更新
    });
    
    // 重置本月
    king.currentMonth = currentMonth;
    king.currentCount = 0;
    king.completed = false;
  }
  
  king.currentCount += 1;
  
  tasks.lastUpdated = new Date().toISOString();
  await kv.set(tasksKey, tasks);
  
  console.log(`✅ 更新任務進度: 連續=${consecutive.currentStreak}月, 本月=${king.currentCount}個`);
}

/**
 * 初始化預設任務
 */
function initializeDefaultTasks() {
  return {
    consecutiveReferral: null,
    monthlyKing: null,
    lastUpdated: new Date().toISOString()
  };
}