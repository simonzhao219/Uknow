import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import { verifyToken } from './auth.ts';

const admin = new Hono();

// 默认功能配置
const DEFAULT_FEATURES = {
  serviceProviderManagement: true,   // 刊登管理（默认开启）
  referralManagement: false,         // 推荐管理（默认关闭）
  taskCenter: false,                 // 任务中心（默认关闭）
  rewardSystem: false                // 奖励回馈（默认关闭）
};

// GET /admin/features - 获取功能开关状态（公开 API）
admin.get('/features', async (c) => {
  try {
    console.log('📥 获取功能开关状态');
    
    // 从 KV Store 获取数据
    const data = await kv.get('system:feature_flags');
    
    if (!data) {
      console.log('⚠️ 未找到功能配置，返回默认值');
      
      // 首次访问，初始化默认值
      const initialData = {
        features: DEFAULT_FEATURES,
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: {
          userId: 'system',
          email: 'system@uknow.com.tw',
          name: '系統初始化'
        }
      };
      
      // 保存默认值
      await kv.set('system:feature_flags', initialData);
      
      return c.json({
        success: true,
        features: initialData.features,
        metadata: {
          lastUpdatedAt: initialData.lastUpdatedAt,
          lastUpdatedBy: initialData.lastUpdatedBy
        }
      });
    }
    
    console.log('✅ 成功获取功能配置');
    
    return c.json({
      success: true,
      features: data.features,
      metadata: {
        lastUpdatedAt: data.lastUpdatedAt,
        lastUpdatedBy: data.lastUpdatedBy
      }
    });
    
  } catch (error) {
    console.error('❌ 获取功能开关失败:', error);
    
    // 降级到默认值
    return c.json({
      success: true,
      features: DEFAULT_FEATURES,
      metadata: {
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: {
          userId: 'system',
          email: 'system@uknow.com.tw',
          name: '系統'
        }
      }
    });
  }
});

// POST /admin/migrate-referrer-listing-ids - 遷移推薦者刊登 ID（管理員專用）
admin.post('/migrate-referrer-listing-ids', async (c) => {
  try {
    console.log('🔄 ========== 開始遷移 referrerListingId ==========');
    
    // 1. 驗證管理員權限 - 使用統一的 verifyToken 函數
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      console.error('[migrate] No Authorization header');
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('[migrate] Verifying token...');
    const { user, error: authError } = await verifyToken(token);
    
    if (authError || !user) {
      console.error('[migrate] Auth error:', authError);
      return c.json({ error: { message: 'Unauthorized' } }, 401);
    }
    
    console.log(`✅ 用戶認證成功: ${user.id}, email: ${user.email}`);
    
    // 驗證管理員權限
    const userProfile = await kv.get(`user:${user.id}:profile`);
    if (!userProfile?.isAdmin) {
      console.error(`❌ 用戶 ${user.email} 不是管理員`);
      return c.json({ 
        error: { message: '權限不足：需要管理員權限' } 
      }, 403);
    }
    
    console.log(`✅ 管理員權限驗證通過: ${user.email}`);
    
    // 2. 獲取所有刊登
    const allData = await kv.getByPrefix('listing:');
    
    // 過濾出完整刊登對象
    const allListings = allData.filter((item: any) => {
      return typeof item === 'object' && item !== null && item.id && item.id.startsWith('listing_');
    });
    
    console.log(`📊 找到 ${allListings.length} 個刊登`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const migrationDetails = [];
    
    // 3. 遍歷所有刊登進行遷移
    for (const listing of allListings) {
      try {
        // 跳過已有 referrerListingId 的
        if (listing.referrerListingId) {
          skippedCount++;
          console.log(`⏭️ 跳過（已有 referrerListingId）: ${listing.id}`);
          continue;
        }
        
        // 跳過沒有 referrerUserId 的（無人推薦）
        if (!listing.referrerUserId) {
          skippedCount++;
          console.log(`⏭️ 跳過（無推薦人）: ${listing.id}`);
          continue;
        }
        
        // 4. 獲取推薦者的所有刊登
        const referrerListingsIds = await kv.get(
          `user:${listing.referrerUserId}:listings`
        );
        
        if (!referrerListingsIds || referrerListingsIds.length === 0) {
          console.warn(`⚠️ 無法找到推薦者的刊登列表: ${listing.referrerUserId}`);
          migrationDetails.push({
            listingId: listing.id,
            status: 'error',
            reason: '推薦者無刊登列表'
          });
          errorCount++;
          continue;
        }
        
        console.log(`📋 推薦者 ${listing.referrerUserId} 有 ${referrerListingsIds.length} 個刊登`);
        
        let assignedListingId = null;
        
        // 5. 保守策略：
        if (referrerListingsIds.length === 1) {
          // 只有一個刊登，確定無疑
          assignedListingId = referrerListingsIds[0];
          
          listing.referrerListingId = assignedListingId;
          await kv.set(`listing:${listing.id}`, listing);
          
          migratedCount++;
          migrationDetails.push({
            listingId: listing.id,
            status: 'success',
            strategy: 'single-listing',
            referrerListingId: assignedListingId
          });
          
          console.log(`✅ 遷移成功（單一刊登）: ${listing.id} → ${assignedListingId}`);
          
        } else {
          // 多個刊登：分配給第一個並標記
          assignedListingId = referrerListingsIds[0];
          
          listing.referrerListingId = assignedListingId;
          listing._migrationNote = 'auto-assigned-first';  // 標記為自動分配
          await kv.set(`listing:${listing.id}`, listing);
          
          migratedCount++;
          migrationDetails.push({
            listingId: listing.id,
            status: 'success',
            strategy: 'first-listing-auto-assigned',
            referrerListingId: assignedListingId,
            note: '推薦者有多個刊登，已自動分配給第一個'
          });
          
          console.log(`✅ 遷移成功（多刊登-自動分配）: ${listing.id} → ${assignedListingId} (共${referrerListingsIds.length}個)`);
        }
        
      } catch (error) {
        console.error(`❌ 遷移失敗: ${listing.id}`, error);
        migrationDetails.push({
          listingId: listing.id,
          status: 'error',
          reason: error.message
        });
        errorCount++;
      }
    }
    
    console.log('🔄 ========== 遷移完成 ==========');
    console.log(`✅ 成功: ${migratedCount}`);
    console.log(`⏭️ 跳過: ${skippedCount}`);
    console.log(`❌ 失敗: ${errorCount}`);
    
    return c.json({
      success: true,
      summary: {
        total: allListings.length,
        migrated: migratedCount,
        skipped: skippedCount,
        errors: errorCount
      },
      details: migrationDetails
    });
    
  } catch (error) {
    console.error('❌ 遷移過程發生錯誤:', error);
    return c.json({
      error: { message: '遷移失敗', details: error.message }
    }, 500);
  }
});

export default admin;