import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import { verifyToken } from './auth.ts';
import { getTaiwanNow, toTaiwanISOString } from './date_utils.ts';

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
        lastUpdatedAt: toTaiwanISOString(getTaiwanNow()),
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
        lastUpdatedAt: toTaiwanISOString(getTaiwanNow()),
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
    
    // 3. 遍所有刊登進行遷移
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
          // 只有一個刊登確定無疑
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

/**
 * GET /admin/list-all-users
 * 🔍 列出所有 Supabase Auth 用戶（調試用）
 */
admin.get('/list-all-users', async (c) => {
  try {
    console.log('========================================');
    console.log('🔍 列出所有用戶');
    console.log('========================================');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const allUsers: any[] = [];
    let page = 1;
    const perPage = 1000;
    
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (error) {
        console.error('❌ 查詢失敗:', error);
        return c.json({
          success: false,
          error: { message: '查詢失敗', details: error.message }
        }, 500);
      }
      
      console.log(`  第 ${page} 頁: ${data.users.length} 個用戶`);
      
      // 收集用戶信息
      data.users.forEach(user => {
        allUsers.push({
          id: user.id,
          email: user.email,
          emailConfirmed: !!user.email_confirmed_at,
          createdAt: user.created_at
        });
      });
      
      // 最後一頁
      if (data.users.length < perPage) break;
      
      page++;
      if (page > 100) break;
    }
    
    console.log(`✅ 總共找到 ${allUsers.length} 個用戶`);
    console.log('========================================');
    
    return c.json({
      success: true,
      total: allUsers.length,
      users: allUsers
    });
    
  } catch (error) {
    console.error('❌ 列出用戶失敗:', error);
    return c.json({
      success: false,
      error: { message: '列出用戶失敗', details: error.message }
    }, 500);
  }
});

/**
 * GET /admin/debug-user-by-email/:email
 * 🔍 調查用戶註冊狀態（通過 Email）
 * 
 * 返回用戶的完整數據，包括：
 * - Supabase Auth 狀態
 * - Profile 資料
 * - 推薦碼
 * - 訂閱記錄
 * - 帳號狀態
 * - 推薦關係
 * - 獎勵數據
 */
admin.get('/debug-user-by-email/:email', async (c) => {
  const email = decodeURIComponent(c.req.param('email'));
  
  console.log('========================================');
  console.log(`🔍 開始調查用戶: ${email}`);
  console.log('========================================');
  
  try {
    const result: any = {
      email,
      timestamp: toTaiwanISOString(getTaiwanNow()),
      supabaseAuth: null,
      profile: null,
      referralCode: null,
      subscriptions: null,
      accountStatus: null,
      referredBy: null,
      rewards: null,
      rewardHistory: null,
      tasks: null,
      issues: []
    };
    
    // 1. 查詢 Supabase Auth（使用分頁查詢所有用戶）
    console.log('\n1️⃣ 查詢 Supabase Auth...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // ✅ 修復：使用分頁查詢所有用戶
    let authUser = null;
    let page = 1;
    const perPage = 1000;
    
    while (true) {
      const { data, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (listError) {
        console.error('❌ 查詢 Auth 失敗:', listError);
        result.issues.push({
          severity: 'critical',
          area: 'supabase_auth',
          message: `無法查詢 Supabase Auth: ${listError.message}`
        });
        break;
      }
      
      console.log(`  查詢第 ${page} 頁，找到 ${data.users.length} 個用戶`);
      
      // 在前頁查找用戶
      const foundUser = data.users.find(u => u.email === email);
      
      if (foundUser) {
        authUser = foundUser;
        console.log(`  ✓ 在第 ${page} 頁找到用戶`);
        break;
      }
      
      // 如果當前頁用戶數小於 perPage，表示已經是最後一頁
      if (data.users.length < perPage) {
        console.log(`  已查詢到最後一頁 (${page})，未找到用戶`);
        break;
      }
      
      // 繼續查詢下一頁
      page++;
      
      // 安全限制：最多查詢 100 頁
      if (page > 100) {
        console.error(`  ⚠️ 已查詢 100 頁，停止搜索`);
        break;
      }
    }
    
    if (authUser) {
      result.supabaseAuth = {
        id: authUser.id,
        email: authUser.email,
        emailConfirmed: !!authUser.email_confirmed_at,
        emailConfirmedAt: authUser.email_confirmed_at,
        createdAt: authUser.created_at,
        lastSignInAt: authUser.last_sign_in_at
      };
      console.log(`✓ 找到 Auth 用戶: ${authUser.id}`);
      console.log(`  Email 已驗證: ${!!authUser.email_confirmed_at}`);
      console.log(`  創建時間: ${authUser.created_at}`);
      console.log(`  最後登入: ${authUser.last_sign_in_at || '從未登入'}`);
      
      // 2. 查詢 Profile
      console.log('\n2️⃣ 查詢 Profile...');
      const profile = await kv.get(`user:${authUser.id}:profile`);
      
      if (profile) {
        result.profile = profile;
        console.log(`✓ 找到 Profile:`);
        console.log(`  姓名: ${profile.name || '未設置'}`);
        console.log(`  手機: ${profile.phone || '未設置'}`);
        console.log(`  生日: ${profile.birthDate || '未設置'}`);
        console.log(`  推薦碼: ${profile.referralCode || '未生成'}`);
        console.log(`  被推薦碼: ${profile.referredByCode || '無'}`);
        console.log(`  註冊步驟: ${profile.registrationStep || 0}`);
        console.log(`  創建時間: ${profile.createdAt || '未知'}`);
        
        // 檢查必要欄位
        if (!profile.name || !profile.phone || !profile.birthDate) {
          result.issues.push({
            severity: 'high',
            area: 'profile',
            message: '個人資料不完整',
            details: {
              missingName: !profile.name,
              missingPhone: !profile.phone,
              missingBirthDate: !profile.birthDate
            }
          });
        }
        
        if (!profile.referralCode) {
          result.issues.push({
            severity: 'high',
            area: 'profile',
            message: '尚未生成推薦碼（可能未完成付款）'
          });
        }
        
        // 3. 查詢推薦碼
        if (profile.referralCode) {
          console.log('\n3️⃣ 查詢推薦碼...');
          const referralCodeData = await kv.get(`referral_code:${profile.referralCode}`);
          
          if (referralCodeData) {
            result.referralCode = referralCodeData;
            console.log(`✓ 找到推薦碼索引: ${profile.referralCode}`);
            console.log(`  綁定用戶: ${referralCodeData.userId}`);
            console.log(`  用戶名: ${referralCodeData.userName}`);
          } else {
            result.issues.push({
              severity: 'critical',
              area: 'referral_code',
              message: `推薦碼索引缺失: referral_code:${profile.referralCode}`
            });
          }
        }
        
        // 4. 查詢訂閱記錄
        console.log('\n4️⃣ 查詢訂閱記錄...');
        const subscriptions = await kv.get(`user:${authUser.id}:subscriptions`);
        
        if (subscriptions && subscriptions.length > 0) {
          result.subscriptions = {
            count: subscriptions.length,
            ids: subscriptions
          };
          console.log(`✓ 找到 ${subscriptions.length} 筆訂閱記錄`);
          
          // 查詢最新訂閱詳情
          const latestSubId = subscriptions[0];
          const latestSub = await kv.get(`subscription:${latestSubId}`);
          
          if (latestSub) {
            result.subscriptions.latest = latestSub;
            console.log(`  最新訂閱ID: ${latestSubId}`);
            console.log(`  狀態: ${latestSub.status}`);
            console.log(`  起始日: ${latestSub.startDate}`);
            console.log(`  結束日: ${latestSub.endDate}`);
          }
        } else {
          result.issues.push({
            severity: 'critical',
            area: 'subscriptions',
            message: '未找到訂閱記錄（可能未完成付款）'
          });
        }
        
        // 5. 查詢帳號狀態
        console.log('\n5️⃣ 查詢帳號狀態...');
        const accountStatus = await kv.get(`user:${authUser.id}:account_status`);
        
        if (accountStatus) {
          result.accountStatus = accountStatus;
          console.log(`✓ 找到帳號狀態:`);
          console.log(`  狀態: ${accountStatus.status}`);
          console.log(`  當前訂閱ID: ${accountStatus.currentSubscriptionId}`);
        } else {
          result.issues.push({
            severity: 'high',
            area: 'account_status',
            message: '未找到帳號狀態記錄'
          });
        }
        
        // 6. 查詢推薦關係
        console.log('\n6️⃣ 查詢推薦關係...');
        const referredBy = await kv.get(`user:${authUser.id}:referred_by`);
        
        if (referredBy) {
          result.referredBy = referredBy;
          console.log(`✓ 找到推薦關係:`);
          console.log(`  推薦人: ${referredBy.referrerUserName} (${referredBy.referrerUserId})`);
          console.log(`  推薦碼: ${referredBy.referrerReferralCode || profile.referredByCode}`);
        } else {
          console.log(`  無推薦關係（可能使用預設推薦碼）`);
        }
        
        // 7. 查詢獎勵數據
        console.log('\n7️⃣ 查詢獎勵數據...');
        const rewards = await kv.get(`user:${authUser.id}:rewards`);
        
        if (rewards) {
          result.rewards = rewards;
          console.log(`✓ 找到獎勵數據:`);
          console.log(`  可提領: ${rewards.availableRewards}P`);
          console.log(`  待入帳: ${rewards.pendingRewards}P`);
          console.log(`  總累積: ${rewards.totalEarned}P`);
        } else {
          console.log(`  無獎勵數據（正常，如果沒有推薦人）`);
        }
        
        // 8. 查詢獎勵歷史
        const rewardHistory = await kv.get(`user:${authUser.id}:reward_history`);
        
        if (rewardHistory && rewardHistory.length > 0) {
          result.rewardHistory = {
            count: rewardHistory.length,
            recent: rewardHistory.slice(0, 5)
          };
          console.log(`✓ 找到 ${rewardHistory.length} 筆獎勵歷史`);
        }
        
        // 9. 查詢任務數據
        console.log('\n8️⃣ 查詢任務數據...');
        const tasks = await kv.get(`user:${authUser.id}:tasks`);
        
        if (tasks) {
          result.tasks = tasks;
          console.log(`✓ 找到任務數據`);
        }
        
      } else {
        result.issues.push({
          severity: 'critical',
          area: 'profile',
          message: `未找到 Profile 記錄: user:${authUser.id}:profile`
        });
        console.error(`❌ 未找到 Profile: user:${authUser.id}:profile`);
      }
      
    } else {
      result.issues.push({
        severity: 'critical',
        area: 'supabase_auth',
        message: `未找到 Supabase Auth 用戶: ${email}`
      });
      console.error(`❌ 未找到 Auth 用戶: ${email}`);
    }
    
    // 診斷結論
    console.log('\n========================================');
    console.log('📊 診斷結論:');
    console.log('========================================');
    
    if (result.issues.length === 0) {
      console.log('✅ 用戶數據完整，無異常');
      result.diagnosis = 'healthy';
      result.summary = '用戶已成功註冊並完成所有步驟';
    } else {
      const criticalIssues = result.issues.filter((i: any) => i.severity === 'critical');
      const highIssues = result.issues.filter((i: any) => i.severity === 'high');
      
      console.log(`⚠️ 發現 ${result.issues.length} 個問題:`);
      console.log(`   - 嚴重: ${criticalIssues.length}`);
      console.log(`   - 高風險: ${highIssues.length}`);
      
      result.issues.forEach((issue: any, index: number) => {
        console.log(`\n問題 ${index + 1} [${issue.severity.toUpperCase()}]:`);
        console.log(`  區域: ${issue.area}`);
        console.log(`  說明: ${issue.message}`);
        if (issue.details) {
          console.log(`  詳情: ${JSON.stringify(issue.details, null, 2)}`);
        }
      });
      
      // 判斷診斷結果
      if (criticalIssues.length > 0) {
        result.diagnosis = 'critical';
        
        // 判斷具體問題類型
        if (!result.supabaseAuth) {
          result.summary = '用戶未在 Supabase Auth 中註冊';
        } else if (!result.profile) {
          result.summary = '用戶已在 Supabase Auth 註冊，但 Profile 數據缺失';
        } else if (!result.profile.referralCode) {
          result.summary = '用戶已註冊，但尚未完成付款（無推薦碼）';
        } else if (!result.subscriptions || result.subscriptions.count === 0) {
          result.summary = '用戶已註冊，但訂閱記錄缺失';
        }
      } else {
        result.diagnosis = 'warning';
        result.summary = '用戶數據基本完整，但有輕微問題';
      }
    }
    
    console.log(`\n診斷: ${result.diagnosis}`);
    console.log(`總結: ${result.summary}`);
    console.log('========================================\n');
    
    return c.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('========================================');
    console.error('❌ 調查用戶失敗');
    console.error('========================================');
    console.error(error);
    
    return c.json({
      success: false,
      error: { message: '調查失敗', details: error.message }
    }, 500);
  }
});

export default admin;