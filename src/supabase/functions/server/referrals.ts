import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';

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

export default referrals;