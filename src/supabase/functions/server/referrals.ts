import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';

const referrals = new Hono();

// GET /referrals/my-tree - 獲取我的推薦樹
referrals.get('/my-tree', async (c) => {
  try {
    console.log('========== 獲取推薦樹 ==========');
    
    // 1. 驗證用戶登入
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[my-tree] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[my-tree] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[my-tree] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}`);
    
    // 2. 獲取用戶的所有刊登 ID
    const userListingsIds = await kv.get(`user:${user.id}:listings`) || [];
    
    if (userListingsIds.length === 0) {
      console.log('ℹ️ 用戶沒有任何刊登');
      return c.json({
        success: true,
        data: {
          trees: [],
          summary: {
            totalReferrals: 0,
            firstGenCount: 0,
            secondGenCount: 0,
            thirdGenCount: 0
          }
        }
      });
    }
    
    console.log(`📋 用戶有 ${userListingsIds.length} 個刊登`);
    
    // 3. ✅ 使用預計算快取讀取推薦樹（效能優化）
    const trees = [];
    const today = new Date().toISOString().split('T')[0];
    
    for (const myListingId of userListingsIds) {
      // 3.1 讀取刊登基本資訊
      const myListing = await kv.get(`listing:${myListingId}`);
      if (!myListing) {
        console.warn(`⚠️ 找不到刊登: ${myListingId}`);
        continue;
      }
      
      console.log(`🔍 處理刊登: ${myListingId}`);
      
      // 3.2 讀取預計算的推薦樹
      const referralTree = await kv.get(`listing:${myListingId}:referral_tree`) || {
        firstGeneration: [],
        secondGeneration: [],
        thirdGeneration: []
      };
      
      console.log(`  👨👩‍👧 1代: ${referralTree.firstGeneration.length} 個`);
      console.log(`  👶 2代: ${referralTree.secondGeneration.length} 個`);
      console.log(`  👶👶 3代: ${referralTree.thirdGeneration.length} 個`);
      
      // 3.3 格式化我的刊登資訊
      const myListingFormatted = {
        id: myListing.id,
        name: myListing.name,
        serviceType: myListing.category,
        city: myListing.city,
        referralCode: myListing.referralCode,
        activeUntil: myListing.activeUntil,
        isActive: myListing.activeUntil >= today
      };
      
      // 3.4 格式化推薦樹中的刊登資訊（已包含必要資訊，無需額外查詢）
      const formatTreeListing = (listing: any) => {
        return {
          id: listing.listingId,
          name: listing.listingName,      // ✅ 修正：刊登名稱
          serviceType: listing.category,
          city: listing.city,
          ownerName: listing.userName,    // ✅ 修正：用戶名
          userId: listing.userId,
          activeUntil: listing.activeUntil,
          isActive: listing.activeUntil >= today,
          referrer: listing.referrer,     // ✅ 新增：推薦人信息（二代、三代有值）
          photos: [] // 列表顯示不需要照片，減少資料傳輸
        };
      };
      
      trees.push({
        myListing: myListingFormatted,
        firstGeneration: referralTree.firstGeneration.map(formatTreeListing),
        secondGeneration: referralTree.secondGeneration.map(formatTreeListing),
        thirdGeneration: referralTree.thirdGeneration.map(formatTreeListing)
      });
    }
    
    // 4. ✅ 使用預計算的推薦統計（效能優化）
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
        trees,
        summary: stats
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