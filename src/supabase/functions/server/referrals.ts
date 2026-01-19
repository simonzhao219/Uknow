import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const referrals = new Hono();

// ===== DEBUG 端點：檢查推薦關係狀態 =====
referrals.get('/debug/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    
    console.log(`========== 🔍 DEBUG: 檢查用戶推薦關係 ==========`);
    console.log(`用戶ID: ${userId}`);
    
    // 1. 用戶基本資料
    const profile = await kv.get(`user:${userId}:profile`);
    console.log('📋 用戶資料:', profile ? {
      name: profile.name,
      referralCode: profile.referralCode,
      referredByCode: profile.referredByCode
    } : 'null');
    
    // 2. 推薦來源
    const referredBy = await kv.get(`user:${userId}:referred_by`);
    console.log('🔗 推薦來源 (referred_by):', referredBy);
    
    // 3. 推薦樹
    const referralTree = await kv.get(`user:${userId}:referral_tree`);
    console.log('🌲 推薦樹 (referral_tree):', referralTree ? {
      firstGen: referralTree.firstGeneration?.length || 0,
      secondGen: referralTree.secondGeneration?.length || 0,
      thirdGen: referralTree.thirdGeneration?.length || 0
    } : 'null');
    
    // 4. 推薦統計
    const stats = await kv.get(`user:${userId}:referral_stats`);
    console.log('📊 推薦統計 (stats):', stats);
    
    // 5. 推薦碼索引
    if (profile?.referralCode) {
      const codeIndex = await kv.get(`referral_code:${profile.referralCode}`);
      console.log(`🎫 推薦碼索引 (referral_code:${profile.referralCode}):`, codeIndex);
    }
    
    console.log(`========== ✅ DEBUG 完成 ==========`);
    
    return c.json({
      success: true,
      data: {
        profile: profile ? {
          name: profile.name,
          referralCode: profile.referralCode,
          referredByCode: profile.referredByCode
        } : null,
        referredBy,
        referralTree,
        stats,
        codeIndex: profile?.referralCode ? await kv.get(`referral_code:${profile.referralCode}`) : null
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    return c.json({
      success: false,
      error: { message: error.message }
    }, 500);
  }
});

// GET /referrals/my-tree - 獲取我的推薦樹
referrals.get('/my-tree', async (c) => {
  try {
    console.log('========== 🌲 開始獲取用戶推薦樹 ==========');
    
    // ✅ 1. 驗證用戶
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      console.error('[Get My Tree] ❌ 缺少 Authorization header');
      return c.json({
        success: false,
        error: { message: '未授權：請先登入' }
      }, 401);
    }
    
    const { user, error } = await verifyToken(accessToken);
    
    if (error || !user) {
      console.error('[Get My Tree] ❌ 用戶驗證失敗:', error);
      return c.json({
        success: false,
        error: { message: '未授權：請先登入' }
      }, 401);
    }
    
    console.log(`[Get My Tree] ✅ 用戶驗證成功: ${user.id}`);
    
    // ✅ 2. 獲取用戶資料（包含推薦碼）
    const userProfile = await kv.get(`user:${user.id}:profile`);
    console.log(`📋 用戶資料:`, userProfile ? {
      name: userProfile.name,
      email: userProfile.email,
      referralCode: userProfile.referralCode
    } : 'null');
    
    const userReferralCode = userProfile?.referralCode || '';
    
    if (!userReferralCode) {
      console.warn(`⚠️ 用戶推薦碼為空！用戶ID: ${user.id}`);
      console.warn(`⚠️ userProfile 存在: ${!!userProfile}`);
      console.warn(`⚠️ userProfile.referralCode 值: ${userProfile?.referralCode}`);
    }
    
    console.log(`🎫 用戶推薦碼: ${userReferralCode}`);
    
    // ✅ 3. 從用戶推薦樹讀取數據（不再依賴刊登）
    // 架構變更：推薦碼綁定用戶，推薦樹也應該以用戶為根
    const referralTreeKey = `user:${user.id}:referral_tree`;
    const referralTree = await kv.get(referralTreeKey) || {
      firstGeneration: [],
      secondGeneration: [],
      thirdGeneration: []
    };
    
    console.log(`📊 用戶推薦樹: 1代=${referralTree.firstGeneration.length}, 2代=${referralTree.secondGeneration.length}, 3代=${referralTree.thirdGeneration.length}`);
    
    // ✅ 4. 格式化推薦樹數據（移除刊登概念，純用戶推薦）
    const today = new Date().toISOString().split('T')[0];
    
    const formatReferralMember = (member: any) => {
      return {
        userId: member.userId,
        userName: member.userName,
        userReferralCode: member.userReferralCode || null,  // ✅ 被推薦者的推薦碼
        listingId: member.listingId || null,        // 可能還沒創建刊登
        listingName: member.listingName || null,    // 可能還沒創建刊登
        serviceType: member.category || null,
        city: member.city || null,
        activeUntil: member.activeUntil || null,
        isActive: member.activeUntil ? member.activeUntil >= today : false,
        referrer: member.referrer || null,          // 二代、三代的推薦人信息（包含推薦碼）
        createdAt: member.createdAt
      };
    };
    
    // ✅ 5. 組裝返回數據（以用戶為核心，不是刊登）
    const referralTreeData = {
      firstGeneration: referralTree.firstGeneration.map(formatReferralMember),
      secondGeneration: referralTree.secondGeneration.map(formatReferralMember),
      thirdGeneration: referralTree.thirdGeneration.map(formatReferralMember)
    };
    
    //  6. 使用預計算的推薦統計（效能優化）
    const stats = await kv.get(`user:${user.id}:referral_stats`) || {
      totalReferrals: 0,
      firstGenCount: 0,
      secondGenCount: 0,
      thirdGenCount: 0
    };
    
    console.log(`📊 推薦統計: 總計=${stats.totalReferrals}, 1代=${stats.firstGenCount}, 2代=${stats.secondGenCount}, 3代=${stats.thirdGenCount}`);
    console.log('========== ✅ 推薦樹獲取完成 ==========');
    
    return c.json({
      success: true,
      data: {
        userReferralCode,       // ✅ 用戶推薦碼
        referralTree: referralTreeData,  // ✅ 直接返回推薦樹，不是 trees 數組
        summary: stats          // ✅ 推薦統計
      }
    });
    
  } catch (error) {
    console.error('========== ❌ 獲取推薦樹錯誤 ==========');
    console.error(error);
    return c.json({
      error: { message: '獲取推薦樹失敗', details: error.message }
    }, 500);
  }
});

/**
 * POST /referrals/join-program
 * 
 * 功能：加入推薦計畫（簽署協議）
 * 
 * Request Body:
 * {
 *   agreedToTerms: boolean,
 *   signatureData: string  // Base64 簽名圖片
 * }
 */
referrals.post('/join-program', async (c) => {
  try {
    // 1️⃣ 驗證用戶登入
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      console.log('加入推薦計畫失敗: 缺少 Authorization header');
      return c.json({
        success: false,
        error: { message: '未授權：請先登入' }
      }, 401);
    }
    
    const { user, error } = await verifyToken(accessToken);
    
    if (error || !user) {
      console.error('加入推薦計畫失敗: 用戶驗證失敗', error);
      return c.json({
        success: false,
        error: { message: '未授權：請先登入' }
      }, 401);
    }
    
    const userId = user.id;

    // 2️⃣ 獲取用戶資料
    const profileKey = `user:${userId}:profile`;
    const profile = await kv.get(profileKey);

    if (!profile) {
      console.log('加入推薦計畫失敗: 找不到用戶資料');
      return c.json({
        success: false,
        error: { message: '找不到用戶資料' }
      }, 404);
    }

    // 3️⃣ 檢查是否已加入（防止重複加入）
    if (profile.referralProgramJoined) {
      console.log(`用戶 ${userId} 已加入推薦計畫，返回現有推薦碼`);
      return c.json({
        success: true,
        data: {
          referralCode: profile.referralCode,
          joinedAt: profile.referralProgramJoinedAt,
          message: '您已經加入推薦計畫'
        }
      });
    }

    // 4️⃣ 驗證請求資料
    const body = await c.req.json();
    const { agreedToTerms, signatureData } = body;

    if (!agreedToTerms) {
      console.log('加入推薦計畫失敗: 未同意條款');
      return c.json({
        success: false,
        error: { message: '請同意推廣獎勵條款' }
      }, 400);
    }

    if (!signatureData) {
      console.log('加入推薦計畫失敗: 未簽名');
      return c.json({
        success: false,
        error: { message: '請完成簽名' }
      }, 400);
    }

    console.log(`用戶 ${userId} 開始加入推薦計畫...`);

    // 5️⃣ 上傳簽名到 Supabase Storage
    let signatureUrl = null;
    
    try {
      // 初始化 Supabase Client（使用 Service Role Key 才能操作私有 bucket）
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // 解析 Base64 簽名數據（格式：data:image/png;base64,xxxxx）
      const base64Data = signatureData.split(',')[1];
      const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      // 生成唯一的檔案名稱
      const fileName = `signature_${userId}_${Date.now()}.png`;
      const bucketName = 'make-5c6718b9-signatures';
      
      console.log(`📤 開始上傳簽名圖片: ${fileName}`);
      
      // 上傳到 Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, buffer, {
          contentType: 'image/png',
          upsert: false  // 不覆蓋已存在的檔案
        });
      
      if (uploadError) {
        console.error('❌ 簽名圖片上傳失敗:', uploadError);
        throw new Error(`簽名圖片上傳失敗: ${uploadError.message}`);
      }
      
      console.log(`✅ 簽名圖片上傳成功: ${uploadData.path}`);
      
      // 生成簽名圖片的 Signed URL（有效期 10 年）
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(uploadData.path, 315360000);  // 10 年 = 10 * 365 * 24 * 60 * 60
      
      if (signedUrlError) {
        console.error('❌ 生成簽名 URL 失敗:', signedUrlError);
        throw new Error(`生成簽名 URL 失敗: ${signedUrlError.message}`);
      }
      
      signatureUrl = signedUrlData.signedUrl;
      console.log(`✅ 生成簽名 Signed URL: ${signatureUrl}`);
      
    } catch (error) {
      console.error('❌ 處理簽名圖片時發生錯誤:', error);
      // 如果簽名上傳失敗，仍然允許加入推薦計畫，但記錄錯誤
      console.warn('⚠️ 簽名上傳失敗，但仍允許加入推薦計畫');
    }

    // 6️⃣ 更新用戶資料
    const joinedAt = new Date().toISOString();
    const updatedProfile = {
      ...profile,
      referralProgramJoined: true,
      referralProgramJoinedAt: joinedAt,
      referralSignatureUrl: signatureUrl  // 存儲 Signed URL（如果上傳成功）
    };

    await kv.set(profileKey, updatedProfile);

    console.log(`✅ 用戶 ${userId} 成功加入推薦計畫`);
    console.log(`   - 推薦碼: ${profile.referralCode}`);
    console.log(`   - 加入時間: ${joinedAt}`);
    console.log(`   - 簽名 URL: ${signatureUrl || '無（上傳失敗）'}`);

    // 7️⃣ 返回成功（推薦碼本來就存在，直接返回）
    return c.json({
      success: true,
      data: {
        referralCode: profile.referralCode,
        joinedAt
      }
    });

  } catch (error) {
    console.error('加入推薦計畫錯誤:', error);
    return c.json({
      success: false,
      error: { message: '加入推薦計畫失敗，請稍後再試' }
    }, 500);
  }
});

export default referrals;