/**
 * 测试账号管理模块
 * 
 * 功能：
 * 1. 创建测试推荐人账号
 * 2. 清理所有测试账号
 * 3. 检查账号是否为测试账号
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { getTaiwanNow, toTaiwanISOString } from './date_utils.ts';

// 创建 Supabase Admin Client
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// ========== 测试推荐人配置 ==========
export const TEST_REFERRER_CONFIG = {
  userId: 'test-referrer-001',
  publicUserId: 'TEST000001',
  email: 'test-referrer@uknow-test.internal',
  name: '【测试】系统推荐人',
  nationalId: 'Z999999999',
  phone: '0900000000',
  birthDate: '1990-01-01',
  password: 'TestReferrer123!@#',
  referralCode: 'test999999'
};

/**
 * 初始化测试推荐人账号
 * 创建一个永久有效的测试推荐人，用于测试注册流程
 */
export async function initTestReferrer() {
  console.log('[Init Test Referrer] 开始初始化测试推荐人...');
  
  // 1. 检查测试推荐人是否已存在
  const existingProfile = await kv.get(`user:${TEST_REFERRER_CONFIG.userId}:profile`);
  if (existingProfile) {
    console.log('[Init Test Referrer] ✅ 测试推荐人已存在');
    return {
      success: true,
      message: '测试推荐人已存在',
      referralCode: TEST_REFERRER_CONFIG.referralCode,
      existing: true
    };
  }
  
  console.log('[Init Test Referrer] 测试推荐人不存在，开始创建...');
  
  try {
    // 2. 检查 Supabase Auth 中是否已有此用户
    let authUserId = TEST_REFERRER_CONFIG.userId;
    
    try {
      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(TEST_REFERRER_CONFIG.userId);
      
      if (existingUser) {
        console.log('[Init Test Referrer] Auth 用户已存在，使用现有用户');
        authUserId = existingUser.user.id;
      }
    } catch (error) {
      console.log('[Init Test Referrer] Auth 用户不存在，将创建新用户');
    }
    
    // 3. 创建 Supabase Auth 用户（如果不存在）
    if (authUserId === TEST_REFERRER_CONFIG.userId) {
      console.log('[Init Test Referrer] 创建 Supabase Auth 用户...');
      
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: TEST_REFERRER_CONFIG.email,
        password: TEST_REFERRER_CONFIG.password,
        email_confirm: true,  // 自动确认邮箱
        user_metadata: {
          isTestAccount: true,
          isTestReferrer: true
        }
      });
      
      if (authError) {
        console.error('[Init Test Referrer] ❌ 创建 Auth 用户失败:', authError);
        throw new Error(`创建 Auth 用户失败: ${authError.message}`);
      }
      
      authUserId = authData.user.id;
      console.log('[Init Test Referrer] ✅ Auth 用户创建成功:', authUserId);
    }
    
    // 4. 创建用户 Profile
    const now = getTaiwanNow();
    const profile = {
      id: authUserId,
      publicUserId: TEST_REFERRER_CONFIG.publicUserId,
      email: TEST_REFERRER_CONFIG.email,
      name: TEST_REFERRER_CONFIG.name,
      nationalId: TEST_REFERRER_CONFIG.nationalId,
      phone: TEST_REFERRER_CONFIG.phone,
      birthDate: TEST_REFERRER_CONFIG.birthDate,
      isAdmin: false,
      emailVerified: true,
      phoneVerified: true,
      registrationStep: 3,  // 已完成注册
      referralCode: TEST_REFERRER_CONFIG.referralCode,
      referredByCode: null,
      referredByUserId: null,
      referredByListingId: null,
      isAutoReferral: false,
      isTestAccount: true,      // ✅ 标记为测试账号
      isTestReferrer: true,      // ✅ 标记为测试推荐人
      createdAt: toTaiwanISOString(now),
      updatedAt: toTaiwanISOString(now)
    };
    
    await kv.set(`user:${authUserId}:profile`, profile);
    console.log('[Init Test Referrer] ✅ Profile 创建成功');
    
    // 5. 创建 Email 索引
    await kv.set(`user:email:${TEST_REFERRER_CONFIG.email}`, authUserId);
    console.log('[Init Test Referrer] ✅ Email 索引创建成功');
    
    // 6. 创建推荐码索引
    await kv.set(`referral_code:${TEST_REFERRER_CONFIG.referralCode}`, {
      code: TEST_REFERRER_CONFIG.referralCode,
      userId: authUserId,
      listingId: null,  // 测试推荐人不需要刊登
      userName: TEST_REFERRER_CONFIG.name,
      listingName: null,
      isTestCode: true,  // ✅ 标记为测试推荐码
      createdAt: toTaiwanISOString(now)
    });
    console.log('[Init Test Referrer] ✅ 推荐码索引创建成功');
    
    // 7. 创建订阅（永久有效）
    const subscriptionId = `test-sub-${authUserId}`;
    const subscription = {
      id: subscriptionId,
      userId: authUserId,
      status: 'Active',
      startDate: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      endDate: new Date('2099-12-31T23:59:59.999Z').toISOString(),  // 永不过期
      gracePeriodEnd: new Date('2099-12-31T23:59:59.999Z').toISOString(),
      amount: 0,  // 免费
      paymentMethod: 'test',
      paymentTransactionId: 'TEST_TRANSACTION',
      newebpayTradeNo: null,
      isCanceled: false,
      canceledAt: null,
      isRenewal: false,
      isTestSubscription: true,  // ✅ 标记为测试订阅
      createdAt: toTaiwanISOString(now),
      updatedAt: toTaiwanISOString(now)
    };
    
    await kv.set(`subscription:${subscriptionId}`, subscription);
    console.log('[Init Test Referrer] ✅ 订阅创建成功');
    
    // 8. 创建用户订阅列表
    await kv.set(`user:${authUserId}:subscriptions`, [subscriptionId]);
    console.log('[Init Test Referrer] ✅ 用户订阅列表创建成功');
    
    // 9. 初始化其他必要数据
    await kv.set(`user:${authUserId}:reward_history`, []);
    await kv.set(`user:${authUserId}:points`, 0);
    await kv.set(`user:${authUserId}:referral_monthly_log`, {});
    console.log('[Init Test Referrer] ✅ 其他数据初始化完成');
    
    console.log('[Init Test Referrer] ✅✅✅ 测试推荐人创建成功！');
    console.log('[Init Test Referrer] 推荐码:', TEST_REFERRER_CONFIG.referralCode);
    console.log('[Init Test Referrer] Email:', TEST_REFERRER_CONFIG.email);
    console.log('[Init Test Referrer] Password:', TEST_REFERRER_CONFIG.password);
    
    return {
      success: true,
      message: '测试推荐人创建成功',
      referralCode: TEST_REFERRER_CONFIG.referralCode,
      email: TEST_REFERRER_CONFIG.email,
      userId: authUserId,
      existing: false
    };
    
  } catch (error) {
    console.error('[Init Test Referrer] ❌ 创建失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建测试推荐人失败'
    };
  }
}

/**
 * 清理所有测试账号
 * 删除所有标记为测试的账号及其相关数据
 * 
 * ⚠️ 注意：测试推荐人 (test-referrer-001) 不会被删除
 */
export async function cleanupTestAccounts() {
  console.log('[Cleanup Test] 开始清理所有测试账号...');
  
  const deletedData = {
    users: 0,
    subscriptions: 0,
    orders: 0,
    referralCodes: 0,
    authUsers: 0,
    listings: 0
  };
  
  try {
    // 1. 查找所有用户
    const allUsers = await kv.getByPrefix('user:');
    
    // 2. 过滤出测试账号（排除测试推荐人）
    const testUsers = allUsers.filter((item: any) => {
      // 只处理 profile 数据
      if (!item || typeof item !== 'object' || !item.id) {
        return false;
      }
      
      // 排除测试推荐人
      if (item.id === TEST_REFERRER_CONFIG.userId || item.isTestReferrer === true) {
        return false;
      }
      
      // 只删除标记为测试的账号
      return item.isTestAccount === true;
    });
    
    console.log(`[Cleanup Test] 找到 ${testUsers.length} 个测试账号（排除测试推荐人）`);
    
    // 3. 删除每个测试账号的数据
    for (const user of testUsers) {
      console.log(`[Cleanup Test] 删除测试账号: ${user.email} (${user.id})`);
      
      try {
        // 3.1 删除订阅
        const subscriptions = await kv.get(`user:${user.id}:subscriptions`) || [];
        for (const subId of subscriptions) {
          await kv.del(`subscription:${subId}`);
          deletedData.subscriptions++;
          console.log(`[Cleanup Test]   - 删除订阅: ${subId}`);
        }
        await kv.del(`user:${user.id}:subscriptions`);
        
        // 3.2 删除推荐码索引
        if (user.referralCode) {
          await kv.del(`referral_code:${user.referralCode}`);
          deletedData.referralCodes++;
          console.log(`[Cleanup Test]   - 删除推荐码: ${user.referralCode}`);
        }
        
        // 3.3 删除用户相关数据
        await kv.del(`user:${user.id}:profile`);
        await kv.del(`user:email:${user.email}`);
        await kv.del(`user:${user.id}:reward_history`);
        await kv.del(`user:${user.id}:points`);
        await kv.del(`user:${user.id}:referral_monthly_log`);
        
        // 3.4 删除用户的刊登
        const userListings = await kv.getByPrefix(`listing:`);
        const testUserListings = userListings.filter((l: any) => l.userId === user.id);
        
        for (const listing of testUserListings) {
          await kv.del(`listing:${listing.id}`);
          await kv.del(`listing:${listing.id}:referral_tree`);
          deletedData.listings++;
          console.log(`[Cleanup Test]   - 删除刊登: ${listing.id}`);
        }
        
        deletedData.users++;
        
        // 3.5 删除 Supabase Auth 用户
        try {
          await supabaseAdmin.auth.admin.deleteUser(user.id);
          deletedData.authUsers++;
          console.log(`[Cleanup Test]   - 删除 Auth 用户成功`);
        } catch (authError) {
          console.error(`[Cleanup Test]   - 删除 Auth 用户失败:`, authError);
        }
        
      } catch (error) {
        console.error(`[Cleanup Test] ❌ 删除用户 ${user.id} 时出错:`, error);
      }
    }
    
    // 4. 清理测试订单
    console.log('[Cleanup Test] 清理测试订单...');
    const allOrderKeys = await kv.getByPrefix('payment_order:');
    
    for (const orderKey of allOrderKeys) {
      const order = await kv.get(orderKey);
      
      if (order && testUsers.some((u: any) => u.id === order.userId)) {
        await kv.del(orderKey);
        deletedData.orders++;
        console.log(`[Cleanup Test]   - 删除订单: ${order.id}`);
      }
    }
    
    // 5. 重置测试推荐人的数据（清空推荐树等）
    console.log('[Cleanup Test] 重置测试推荐人数据...');
    await kv.set(`user:${TEST_REFERRER_CONFIG.userId}:referral_monthly_log`, {});
    await kv.set(`user:${TEST_REFERRER_CONFIG.userId}:reward_history`, []);
    await kv.set(`user:${TEST_REFERRER_CONFIG.userId}:points`, 0);
    
    console.log('[Cleanup Test] ✅✅✅ 清理完成!');
    console.log('[Cleanup Test] 删除统计:', JSON.stringify(deletedData, null, 2));
    
    return {
      success: true,
      message: '测试账号清理完成',
      deleted: deletedData
    };
    
  } catch (error) {
    console.error('[Cleanup Test] ❌ 清理失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '清理测试账号失败',
      deleted: deletedData
    };
  }
}

/**
 * 检查用户是否为测试账号
 */
export function isTestAccount(userId: string): boolean {
  return userId === TEST_REFERRER_CONFIG.userId;
}

/**
 * 检查推荐码是否为测试推荐码
 */
export function isTestReferralCode(code: string): boolean {
  return code === TEST_REFERRER_CONFIG.referralCode;
}
