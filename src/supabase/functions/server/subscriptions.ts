import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import { YEARLY_PRICE } from './constants.ts';

const app = new Hono();

// ============================================
// 辅助函数
// ============================================

/**
 * 计算两个日期之间的月数差异（精确到小数）
 */
function calculateMonthsDiff(startDate: Date, endDate: Date): number {
  const years = endDate.getFullYear() - startDate.getFullYear();
  const months = endDate.getMonth() - startDate.getMonth();
  const days = endDate.getDate() - startDate.getDate();
  
  // 基础月数差
  let totalMonths = years * 12 + months;
  
  // 加上天数的比例（假设每月 30 天）
  totalMonths += days / 30;
  
  return totalMonths;
}

/**
 * 给日期增加指定月数
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================
// API 端点
// ============================================

/**
 * GET /subscriptions
 * 获取用户的所有订阅（刊登列表）
 */
app.get('/', async (c) => {
  try {
    // 1. 验证用户身份
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ success: false, error: { message: '未提供认证令牌' } }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      console.error('❌ 认证失败:', authError);
      return c.json({ success: false, error: { message: '认证失败' } }, 401);
    }

    const userId = user.id;
    console.log('✅ 用户认证成功:', userId);

    // 2. 获取用户的刊登列表
    const listingIds = await kv.get(`user:${userId}:listings`) || [];
    console.log(`📋 用户刊登数量: ${listingIds.length}`);

    if (listingIds.length === 0) {
      return c.json({
        success: true,
        data: {
          listings: []
        }
      });
    }

    // 3. 获取每个刊登的详细资料
    const listings = await kv.mget(listingIds.map(id => `listing:${id}`));
    
    // 过滤掉 null 值并确保日期字段只包含日期部分
    const validListings = listings
      .filter(listing => listing !== null)
      .map(listing => ({
        ...listing,
        createdAt: listing.createdAt ? listing.createdAt.split('T')[0] : listing.createdAt,
        activeUntil: listing.activeUntil ? listing.activeUntil.split('T')[0] : listing.activeUntil,
        nextPaymentDate: listing.nextPaymentDate ? listing.nextPaymentDate.split('T')[0] : listing.nextPaymentDate,
        lastPaymentDate: listing.lastPaymentDate ? listing.lastPaymentDate.split('T')[0] : listing.lastPaymentDate,
        cancelledAt: listing.cancelledAt ? listing.cancelledAt.split('T')[0] : listing.cancelledAt
      }));
    
    console.log(`✅ 成功获取 ${validListings.length} 个刊登`);

    return c.json({
      success: true,
      data: {
        listings: validListings
      }
    });

  } catch (error: any) {
    console.error('💥 获取订阅列表错误:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || '获取订阅列表失败'
        }
      },
      500
    );
  }
});

/**
 * PUT /subscriptions/:listingId/cancel
 * 取消订阅
 */
app.put('/:listingId/cancel', async (c) => {
  try {
    const listingId = c.req.param('listingId');
    
    // 1. 验证用户身份
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ success: false, error: { message: '未提供认证令牌' } }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      console.error('❌ 认证失败:', authError);
      return c.json({ success: false, error: { message: '认证失败' } }, 401);
    }

    const userId = user.id;

    // 2. 获取刊登资料
    const listing = await kv.get(`listing:${listingId}`);
    
    if (!listing) {
      return c.json({ success: false, error: { message: '刊登不存在' } }, 404);
    }

    // 3. 验证权限
    if (listing.userId !== userId) {
      return c.json({ success: false, error: { message: '无权限操作此刊登' } }, 403);
    }

    // 4. 设置取消标记
    const body = await c.req.json();
    listing.cancelledAt = body.cancelDate || new Date().toISOString();

    // 5. 保存更新
    await kv.set(`listing:${listingId}`, listing);

    console.log(`✅ 订阅已取消: ${listingId}, 将在 ${listing.activeUntil} 到期`);

    return c.json({
      success: true,
      message: `订阅已取消，将在 ${listing.activeUntil} 到期`,
      data: {
        activeUntil: listing.activeUntil
      }
    });

  } catch (error: any) {
    console.error('💥 取消订阅错误:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || '取消订阅失败'
        }
      },
      500
    );
  }
});

/**
 * PUT /subscriptions/:listingId/change-plan
 * 取消訂閱（保留此端點用於取消功能）
 * ⚠️ 不再支持方案變更（只有一個年費方案）
 */
app.put('/:listingId/change-plan', async (c) => {
  try {
    const listingId = c.req.param('listingId');
    const { action, newPlan } = await c.req.json();
    
    // 1. 驗證用戶身份
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ success: false, error: { message: '未提供認證令牌' } }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      console.error('❌ 認證失敗:', authError);
      return c.json({ success: false, error: { message: '認證失敗' } }, 401);
    }

    const userId = user.id;

    // 2. 獲取刊登資料
    const listing = await kv.get(`listing:${listingId}`);
    
    if (!listing) {
      return c.json({ success: false, error: { message: '刊登不存在' } }, 404);
    }

    // 3. 驗證權限
    if (listing.userId !== userId) {
      return c.json({ success: false, error: { message: '無權限操作此刊登' } }, 403);
    }

    // 4. 處理操作
    if (action === 'cancel') {
      // ✅ 允許取消訂閱
      listing.cancelledAt = new Date().toISOString();
      await kv.set(`listing:${listingId}`, listing);

      console.log(`✅ 訂閱已取消: ${listingId}, 將在 ${listing.activeUntil} 到期`);

      return c.json({
        success: true,
        message: `訂閱已取消，將在 ${listing.activeUntil} 到期`,
        data: {
          cancelledAt: listing.cancelledAt,
          activeUntil: listing.activeUntil
        }
      });
    } else if (action === 'changePlan') {
      // ❌ 不允許變更方案（只有一個年費方案）
      return c.json({ 
        success: false, 
        error: { message: '目前只有年費方案，無法變更訂閱方案' } 
      }, 400);
    } else {
      return c.json({ 
        success: false, 
        error: { message: '無效的操作類型' } 
      }, 400);
    }

  } catch (error: any) {
    console.error('💥 變更訂閱錯誤:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || '變更訂閱失敗'
        }
      },
      500
    );
  }
});

/**
 * PUT /subscriptions/:listingId/reactivate
 * 重新激活订阅
 * 新規格：固定付年費，清空點數，立即開始新訂閱
 */
app.put('/:listingId/reactivate', async (c) => {
  try {
    const listingId = c.req.param('listingId');
    
    // 1. 验证用户身份
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ success: false, error: { message: '未提供认证令牌' } }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      console.error('❌ 认证失败:', authError);
      return c.json({ success: false, error: { message: '认证失败' } }, 401);
    }

    const userId = user.id;

    // 2. 获取刊登资料
    const listing = await kv.get(`listing:${listingId}`);
    
    if (!listing) {
      return c.json({ success: false, error: { message: '刊登不存在' } }, 404);
    }

    // 3. 验证权限
    if (listing.userId !== userId) {
      return c.json({ success: false, error: { message: '无权限操作此刊登' } }, 403);
    }

    const today = new Date();
    
    // 4. 固定邏輯：清空點數，付年費，開始新訂閱
    delete listing.frozenPoints;        // 清空凍結點數
    delete listing.accumulatedPoints;   // 清空累積點數
    
    // 設置新的有效期（一年後）
    const newActiveUntil = new Date(today);
    newActiveUntil.setFullYear(newActiveUntil.getFullYear() + 1);
    newActiveUntil.setDate(newActiveUntil.getDate() - 1);
    
    // 更新刊登數據
    listing.activeUntil = formatDate(newActiveUntil);
    listing.lastPaymentDate = formatDate(today);
    listing.subscriptionPlan = 'yearly';
    listing.nextPaymentDate = formatDate(new Date(newActiveUntil.getTime() + 86400000)); // activeUntil + 1 天
    listing.startDate = formatDate(today);
    
    // 移除取消標記
    delete listing.cancelledAt;

    await kv.set(`listing:${listingId}`, listing);

    console.log(`✅ 订阅已重新激活: ${listingId}, 新有效期: ${listing.activeUntil}`);

    return c.json({
      success: true,
      message: '订阅已重新激活',
      data: {
        newActiveUntil: listing.activeUntil,
        price: YEARLY_PRICE,
        pointsCleared: true
      }
    });

  } catch (error: any) {
    console.error('💥 重新激活订阅错误:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || '重新激活订阅失败'
        }
      },
      500
    );
  }
});

/**
 * PUT /subscriptions/:listingId/resume
 * 繼續訂閱（取消「取消訂閱」狀態）
 */
app.put('/:listingId/resume', async (c) => {
  try {
    const listingId = c.req.param('listingId');
    
    // 1. 验证用户身份
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ success: false, error: { message: '未提供认证令牌' } }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      console.error('❌ 认证失败:', authError);
      return c.json({ success: false, error: { message: '认证失败' } }, 401);
    }

    const userId = user.id;

    // 2. 获取刊登资料
    const listing = await kv.get(`listing:${listingId}`);
    
    if (!listing) {
      return c.json({ success: false, error: { message: '刊登不存在' } }, 404);
    }

    // 3. 验证权限
    if (listing.userId !== userId) {
      return c.json({ success: false, error: { message: '无权限操作此刊登' } }, 403);
    }

    // 4. 移除取消标记
    delete listing.cancelledAt;

    // 5. 保存更新
    await kv.set(`listing:${listingId}`, listing);

    console.log(`✅ 订阅已恢复: ${listingId}, 取消标记已删除`);

    return c.json({
      success: true,
      message: '订阅已恢复',
      data: {
        activeUntil: listing.activeUntil,
        plan: listing.plan
      }
    });

  } catch (error: any) {
    console.error('💥 繼續訂閱錯誤:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || '繼續訂閱失敗'
        }
      },
      500
    );
  }
});

export default app;