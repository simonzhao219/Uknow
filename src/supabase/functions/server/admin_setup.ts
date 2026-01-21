/**
 * 🔑 管理員設置工具
 * 
 * 功能：
 * - 將用戶設為管理員
 * - 僅允許首次設置或已有管理員操作
 */

import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { createClient } from 'npm:@supabase/supabase-js@2';

const adminSetup = new Hono();

/**
 * 檢查是否已有管理員
 */
async function hasExistingAdmin(): Promise<boolean> {
  try {
    // 獲取所有用戶 profile
    // 注意：getByPrefix 只返回 value 數組，不包含 key
    // 所以我們需要直接檢查每個 value 是否有 role === 'admin'
    const allValues = await kv.getByPrefix('user:');
    
    for (const value of allValues) {
      // 檢查這個 value 是否是 profile（profile 包含 name, email, role 等）
      // 並且檢查是否為管理員
      if (value && typeof value === 'object' && value.role === 'admin') {
        console.log(`[Admin Setup] ✅ 已存在管理員: ${value.name || 'Unknown'} (${value.userId || 'Unknown'})`);
        return true;
      }
    }
    
    console.log('[Admin Setup] ⚠️ 尚未有管理員');
    return false;
  } catch (error) {
    console.error('[Admin Setup] ❌ 檢查管理員時出錯:', error);
    return false;
  }
}

/**
 * 設置當前登入用戶為管理員
 * 
 * 規則：
 * 1. 如果還沒有管理員，任何登入用戶都可以設為管理員
 * 2. 如果已有管理員，必須由現有管理員操作
 */
adminSetup.post('/set-self-admin', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[Admin Setup] ❌ 缺少 Authorization header');
      return c.json({
        success: false,
        error: { message: '需要登入', code: 'UNAUTHORIZED' }
      }, 401);
    }
    
    const token = authHeader.substring(7);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('[Admin Setup] ❌ Token 驗證失敗:', error?.message);
      return c.json({
        success: false,
        error: { message: 'Token 無效或已過期', code: 'INVALID_TOKEN' }
      }, 401);
    }
    
    console.log(`[Admin Setup] 📝 用戶 ${user.id} (${user.email}) 嘗試設為管理員`);
    
    // 獲取用戶 profile
    const profileKey = `user:${user.id}:profile`;
    const profile = await kv.get(profileKey);
    
    if (!profile) {
      console.error(`[Admin Setup] ❌ 用戶 ${user.id} 的 profile 不存在`);
      return c.json({
        success: false,
        error: { message: '用戶資料不存在', code: 'PROFILE_NOT_FOUND' }
      }, 404);
    }
    
    // 檢查是否已是管理員
    if (profile.role === 'admin') {
      console.log(`[Admin Setup] ℹ️ 用戶 ${user.id} 已經是管理員`);
      return c.json({
        success: true,
        message: '您已經是管理員',
        profile: {
          userId: profile.userId,
          name: profile.name,
          email: profile.email,
          role: 'admin'
        }
      });
    }
    
    // 檢查是否已有管理員
    const existingAdmin = await hasExistingAdmin();
    
    if (existingAdmin) {
      console.error(`[Admin Setup] ❌ 已存在管理員，無法自動設置`);
      return c.json({
        success: false,
        error: {
          message: '系統已有管理員，請聯繫現有管理員為您設置權限',
          code: 'ADMIN_ALREADY_EXISTS'
        }
      }, 403);
    }
    
    // 更新為管理員
    profile.role = 'admin';
    await kv.set(profileKey, profile);
    
    console.log(`[Admin Setup] ✅ 用戶 ${user.id} (${profile.name}) 已設為管理員`);
    
    return c.json({
      success: true,
      message: '成功設為管理員',
      profile: {
        userId: profile.userId,
        name: profile.name,
        email: profile.email,
        role: 'admin'
      }
    });
  } catch (error: any) {
    console.error('[Admin Setup] ❌ 設置管理員時出錯:', error);
    return c.json({
      success: false,
      error: {
        message: '設置管理員失敗',
        details: error.message
      }
    }, 500);
  }
});

/**
 * 由現有管理員設置其他用戶為管理員
 */
adminSetup.post('/set-user-admin/:userId', async (c) => {
  try {
    const targetUserId = c.req.param('userId');
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: { message: '需要登入', code: 'UNAUTHORIZED' }
      }, 401);
    }
    
    const token = authHeader.substring(7);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return c.json({
        success: false,
        error: { message: 'Token 無效或已過期', code: 'INVALID_TOKEN' }
      }, 401);
    }
    
    // 檢查當前用戶是否為管理員
    const currentProfile = await kv.get(`user:${user.id}:profile`);
    
    if (!currentProfile || currentProfile.role !== 'admin') {
      console.error(`[Admin Setup] ❌ 用戶 ${user.id} 不是管理員，無法設置其他管理員`);
      return c.json({
        success: false,
        error: { message: '需要管理員權限', code: 'FORBIDDEN' }
      }, 403);
    }
    
    // 獲取目標用戶 profile
    const targetProfileKey = `user:${targetUserId}:profile`;
    const targetProfile = await kv.get(targetProfileKey);
    
    if (!targetProfile) {
      return c.json({
        success: false,
        error: { message: '目標用戶不存在', code: 'USER_NOT_FOUND' }
      }, 404);
    }
    
    // 更新為管理員
    targetProfile.role = 'admin';
    await kv.set(targetProfileKey, targetProfile);
    
    console.log(`[Admin Setup] ✅ 管理員 ${user.id} 將用戶 ${targetUserId} (${targetProfile.name}) 設為管理員`);
    
    return c.json({
      success: true,
      message: `成功將 ${targetProfile.name} 設為管理員`,
      profile: {
        userId: targetProfile.userId,
        name: targetProfile.name,
        email: targetProfile.email,
        role: 'admin'
      }
    });
  } catch (error: any) {
    console.error('[Admin Setup] ❌ 設置管理員時出錯:', error);
    return c.json({
      success: false,
      error: {
        message: '設置管理員失敗',
        details: error.message
      }
    }, 500);
  }
});

/**
 * 檢查當前用戶是否為管理員
 */
adminSetup.get('/check', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: true,
        isAdmin: false,
        message: '未登入'
      });
    }
    
    const token = authHeader.substring(7);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return c.json({
        success: true,
        isAdmin: false,
        message: 'Token 無效'
      });
    }
    
    const profile = await kv.get(`user:${user.id}:profile`);
    const isAdmin = profile && profile.role === 'admin';
    const hasAdmin = await hasExistingAdmin();
    
    return c.json({
      success: true,
      isAdmin,
      hasExistingAdmin: hasAdmin,
      canBecomeAdmin: !hasAdmin,
      userId: user.id,
      userName: profile?.name,
      userEmail: user.email
    });
  } catch (error: any) {
    console.error('[Admin Setup] ❌ 檢查管理員狀態時出錯:', error);
    return c.json({
      success: false,
      error: {
        message: '檢查失敗',
        details: error.message
      }
    }, 500);
  }
});

export default adminSetup;