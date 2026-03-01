import { Hono } from 'npm:hono@4.3.11';
import * as kv from './kv_store.tsx';
import { verifyToken } from './auth.ts';

const userDiagnosis = new Hono();

/**
 * GET /admin/user-diagnosis/:userId
 * 
 * 功能：全面诊断用户数据完整性
 * - 检查 Profile 数据
 * - 检查推荐关系（被推荐人、推荐人）
 * - 检查推荐树
 * - 检查奖励记录
 * - 检查任务状态
 * - 检查订单数据
 * - 验证数据一致性
 */
userDiagnosis.get('/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 开始诊断用户数据：${userId}`);
    console.log(`${'='.repeat(80)}\n`);
    
    const issues: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];
    
    // ========================================
    // 1. Profile 数据检查
    // ========================================
    console.log('📋 [1/8] 检查 Profile 数据...');
    const profile = await kv.get(`user:${userId}:profile`);
    
    if (!profile) {
      issues.push('❌ Profile 数据不存在');
      return c.json({
        success: false,
        userId,
        issues,
        message: '用户数据不存在'
      });
    }
    
    console.log('✅ Profile 数据存在');
    console.log(`   Email: ${profile.email}`);
    console.log(`   姓名: ${profile.name}`);
    console.log(`   手机: ${profile.phone}`);
    console.log(`   注册步骤: ${profile.registrationStep}`);
    console.log(`   账号状态: ${profile.accountStatus || '未设置'}`);
    console.log(`   推荐码: ${profile.referralCode || '未生成'}`);
    console.log(`   使用的推荐码: ${profile.referredByCode || '无'}`);
    console.log(`   创建时间: ${profile.createdAt}`);
    console.log(`   更新时间: ${profile.updatedAt || '未设置'}`);
    
    // 检查必要字段
    const requiredFields = ['email', 'name', 'phone', 'birthDate', 'registrationStep'];
    for (const field of requiredFields) {
      if (!profile[field] && profile[field] !== 0) {
        issues.push(`❌ Profile 缺少必要字段: ${field}`);
      }
    }
    
    // 检查注册步骤相关字段
    if (profile.registrationStep >= 2) {
      // Step 2 应该有付款相关数据
      if (!profile.paidAt) {
        issues.push('❌ registrationStep >= 2 但缺少 paidAt');
      }
      if (!profile.periodTradeNo) {
        issues.push('❌ registrationStep >= 2 但缺少 periodTradeNo');
      }
      if (!profile.lastTradeNo) {
        warnings.push('⚠️ registrationStep >= 2 但缺少 lastTradeNo');
      }
      if (profile.registrationStep === 2 && !profile.pendingActivation) {
        warnings.push('⚠️ registrationStep = 2 但 pendingActivation 不是 true');
      }
    }
    
    if (profile.registrationStep === 3) {
      // Step 3 应该有账号激活数据
      if (!profile.referralCode) {
        issues.push('❌ registrationStep = 3 但没有推荐码');
      }
      if (!profile.accountStatus) {
        issues.push('❌ registrationStep = 3 但没有 accountStatus');
      }
      if (!profile.activeUntil) {
        issues.push('❌ registrationStep = 3 但没有 activeUntil');
      }
      if (profile.accountStatus !== 'Active') {
        warnings.push(`⚠️ registrationStep = 3 但 accountStatus = ${profile.accountStatus}`);
      }
    }
    
    // ========================================
    // 2. Email 索引检查
    // ========================================
    console.log('\n📧 [2/8] 检查 Email 索引...');
    const emailIndex = await kv.get(`user:email:${profile.email}`);
    
    if (!emailIndex) {
      issues.push('❌ Email 索引不存在');
    } else if (emailIndex !== userId) {
      issues.push(`❌ Email 索引指向错误的用户: ${emailIndex}`);
    } else {
      console.log('✅ Email 索引正确');
      info.push(`✓ Email 索引: user:email:${profile.email} → ${userId}`);
    }
    
    // ========================================
    // 3. 推荐码检查（如果已生成）
    // ========================================
    console.log('\n🎫 [3/8] 检查推荐码...');
    
    if (profile.referralCode) {
      const referralCodeData = await kv.get(`referral_code:${profile.referralCode}`);
      
      if (!referralCodeData) {
        issues.push(`❌ 推荐码 ${profile.referralCode} 的数据不存在`);
      } else {
        console.log('✅ 推荐码数据存在');
        console.log(`   推荐码: ${referralCodeData.code}`);
        console.log(`   绑定用户: ${referralCodeData.userId}`);
        console.log(`   用户名: ${referralCodeData.userName}`);
        
        if (referralCodeData.userId !== userId) {
          issues.push(`❌ 推荐码绑定的用户 ID 不匹配: ${referralCodeData.userId}`);
        } else {
          info.push(`✓ 推荐码: ${profile.referralCode} → ${userId}`);
        }
      }
    } else {
      if (profile.registrationStep === 3) {
        issues.push('❌ Step 3 用户没有推荐码');
      } else {
        info.push('ℹ️ 用户还没有推荐码（符合预期）');
      }
    }
    
    // ========================================
    // 4. 被推荐关系检查
    // ========================================
    console.log('\n🔗 [4/8] 检查被推荐关系（该用户是否被别人推荐）...');
    
    if (profile.referredByCode) {
      console.log(`   使用的推荐码: ${profile.referredByCode}`);
      console.log(`   推荐人 ID: ${profile.referredByUserId || '未设置'}`);
      
      const referredBy = await kv.get(`user:${userId}:referred_by`);
      
      if (!referredBy) {
        issues.push('❌ Profile 有 referredByCode 但缺少 user:xxx:referred_by 数据');
      } else {
        console.log('✅ referred_by 数据存在');
        console.log(`   推荐人用户 ID: ${referredBy.referrerUserId}`);
        console.log(`   推荐码: ${referredBy.referralCode}`);
        console.log(`   创建时间: ${referredBy.createdAt}`);
        
        if (referredBy.referralCode !== profile.referredByCode) {
          warnings.push(`⚠️ referred_by 的推荐码 (${referredBy.referralCode}) 与 profile 不一致 (${profile.referredByCode})`);
        }
        
        if (referredBy.referrerUserId !== profile.referredByUserId) {
          warnings.push(`⚠️ referred_by 的推荐人 ID (${referredBy.referrerUserId}) 与 profile 不一致 (${profile.referredByUserId})`);
        }
        
        // 检查推荐人是否存在
        if (referredBy.referrerUserId) {
          const referrerProfile = await kv.get(`user:${referredBy.referrerUserId}:profile`);
          
          if (!referrerProfile) {
            issues.push(`❌ 推荐人 ${referredBy.referrerUserId} 的 Profile 不存在`);
          } else {
            console.log('✅ 推荐人 Profile 存在');
            console.log(`   推荐人姓名: ${referrerProfile.name}`);
            console.log(`   推荐人推荐码: ${referrerProfile.referralCode}`);
            info.push(`✓ 推荐人: ${referrerProfile.name} (${referredBy.referrerUserId})`);
          }
        }
      }
    } else {
      info.push('ℹ️ 用户没有使用推荐码注册');
    }
    
    // ========================================
    // 5. 推荐树检查（该用户推荐的人）
    // ========================================
    console.log('\n🌳 [5/8] 检查推荐树（该用户推荐的人）...');
    
    if (profile.registrationStep === 3) {
      const referralTree = await kv.get(`user:${userId}:referral_tree`);
      
      if (!referralTree) {
        issues.push('❌ Step 3 用户缺少推荐树数据');
      } else {
        console.log('✅ 推荐树数据存在');
        console.log(`   一代推荐: ${referralTree.firstGeneration?.length || 0} 人`);
        console.log(`   二代推荐: ${referralTree.secondGeneration?.length || 0} 人`);
        console.log(`   三代推荐: ${referralTree.thirdGeneration?.length || 0} 人`);
        console.log(`   更新时间: ${referralTree.lastUpdated}`);
        
        info.push(`✓ 推荐树: 1代=${referralTree.firstGeneration?.length || 0}, 2代=${referralTree.secondGeneration?.length || 0}, 3代=${referralTree.thirdGeneration?.length || 0}`);
        
        // 检查推荐统计是否匹配
        const referralStats = await kv.get(`user:${userId}:referral_stats`);
        
        if (!referralStats) {
          warnings.push('⚠️ 缺少推荐统计数据');
        } else {
          const treeCount1 = referralTree.firstGeneration?.length || 0;
          const treeCount2 = referralTree.secondGeneration?.length || 0;
          const treeCount3 = referralTree.thirdGeneration?.length || 0;
          
          if (referralStats.firstGenCount !== treeCount1) {
            warnings.push(`⚠️ 推荐统计一代数量 (${referralStats.firstGenCount}) 与推荐树不一致 (${treeCount1})`);
          }
          if (referralStats.secondGenCount !== treeCount2) {
            warnings.push(`⚠️ 推荐统计二代数量 (${referralStats.secondGenCount}) 与推荐树不一致 (${treeCount2})`);
          }
          if (referralStats.thirdGenCount !== treeCount3) {
            warnings.push(`⚠️ 推荐统计三代数量 (${referralStats.thirdGenCount}) 与推荐树不一致 (${treeCount3})`);
          }
        }
      }
    } else {
      info.push('ℹ️ 用户还未完成注册，推荐树检查跳过');
    }
    
    // ========================================
    // 6. 奖励记录检查
    // ========================================
    console.log('\n💰 [6/8] 检查奖励记录...');
    
    if (profile.registrationStep === 3) {
      const rewards = await kv.get(`user:${userId}:rewards`);
      const rewardHistory = await kv.get(`user:${userId}:reward_history`);
      
      if (!rewards) {
        issues.push('❌ Step 3 用户缺少奖励数据');
      } else {
        console.log('✅ 奖励数据存在');
        console.log(`   可用奖励: ${rewards.availableRewards || 0}`);
        console.log(`   待发放: ${rewards.pendingRewards || 0}`);
        console.log(`   已提领: ${rewards.withdrawnRewards || 0}`);
        console.log(`   总收益: ${rewards.totalEarned || 0}`);
        
        info.push(`✓ 奖励: 可用=${rewards.availableRewards || 0}, 待发放=${rewards.pendingRewards || 0}, 已提领=${rewards.withdrawnRewards || 0}`);
      }
      
      if (!rewardHistory) {
        warnings.push('⚠️ 缺少奖励历史数据');
      } else {
        console.log(`   奖励历史记录: ${Array.isArray(rewardHistory) ? rewardHistory.length : 0} 笔`);
        info.push(`✓ 奖励历史: ${Array.isArray(rewardHistory) ? rewardHistory.length : 0} 笔记录`);
      }
    } else {
      info.push('ℹ️ 用户还未完成注册，奖励检查跳过');
    }
    
    // ========================================
    // 7. 任务状态检查
    // ========================================
    console.log('\n🎯 [7/8] 检查任务状态...');
    
    if (profile.registrationStep === 3) {
      const tasks = await kv.get(`user:${userId}:tasks`);
      const monthlyLog = await kv.get(`user:${userId}:referral_monthly_log`);
      
      if (!tasks) {
        issues.push('❌ Step 3 用户缺少任务数据');
      } else {
        console.log('✅ 任务数据存在');
        console.log(`   连续推荐达人: ${tasks.consecutiveReferral ? JSON.stringify(tasks.consecutiveReferral) : '未达成'}`);
        console.log(`   推荐王: ${tasks.monthlyKing ? JSON.stringify(tasks.monthlyKing) : '未达成'}`);
        
        info.push(`✓ 任务数据存在`);
      }
      
      if (!monthlyLog) {
        warnings.push('⚠️ 缺少月度推荐日志');
      } else {
        const months = Object.keys(monthlyLog);
        console.log(`   月度推荐日志: ${months.length} 个月`);
        info.push(`✓ 月度日志: ${months.length} 个月`);
      }
    } else {
      info.push('ℹ️ 用户还未完成注册，任务检查跳过');
    }
    
    // ========================================
    // 8. 订单数据检查
    // ========================================
    console.log('\n📦 [8/8] 检查订单数据...');
    
    if (profile.lastTradeNo) {
      const order = await kv.get(`payuni:order:${profile.lastTradeNo}`);
      
      if (!order) {
        issues.push(`❌ 订单 ${profile.lastTradeNo} 不存在`);
      } else {
        console.log('✅ 订单数据存在');
        console.log(`   订单号: ${order.tradeNo}`);
        console.log(`   状态: ${order.status}`);
        console.log(`   金额: ${order.amount}`);
        console.log(`   周期扣款号: ${order.periodTradeNo || '未设置'}`);
        console.log(`   创建时间: ${order.createdAt}`);
        console.log(`   完成时间: ${order.completedAt || '未完成'}`);
        
        info.push(`✓ 订单: ${order.tradeNo} (${order.status})`);
        
        // 检查订单数据一致性
        if (order.userId !== userId) {
          issues.push(`❌ 订单的用户 ID (${order.userId}) 与当前用户不一致`);
        }
        
        if (profile.periodTradeNo && order.periodTradeNo !== profile.periodTradeNo) {
          warnings.push(`⚠️ 订单的 periodTradeNo (${order.periodTradeNo}) 与 profile 不一致 (${profile.periodTradeNo})`);
        }
      }
    } else {
      if (profile.registrationStep >= 2) {
        warnings.push('⚠️ Step >= 2 但没有 lastTradeNo');
      } else {
        info.push('ℹ️ 用户还未付款');
      }
    }
    
    // ========================================
    // 生成诊断报告
    // ========================================
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 诊断报告');
    console.log(`${'='.repeat(80)}\n`);
    
    const hasIssues = issues.length > 0;
    const hasWarnings = warnings.length > 0;
    
    if (hasIssues) {
      console.log('❌ 严重问题:');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log('');
    }
    
    if (hasWarnings) {
      console.log('⚠️ 警告:');
      warnings.forEach(warning => console.log(`   ${warning}`));
      console.log('');
    }
    
    if (!hasIssues && !hasWarnings) {
      console.log('✅ 所有检查通过，数据完整无误！');
    }
    
    if (info.length > 0) {
      console.log('ℹ️ 信息摘要:');
      info.forEach(i => console.log(`   ${i}`));
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
    
    // 返回结果
    return c.json({
      success: !hasIssues,
      userId,
      profile: {
        email: profile.email,
        name: profile.name,
        phone: profile.phone,
        registrationStep: profile.registrationStep,
        accountStatus: profile.accountStatus,
        referralCode: profile.referralCode,
        referredByCode: profile.referredByCode,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt
      },
      issues,
      warnings,
      info,
      message: hasIssues 
        ? `发现 ${issues.length} 个严重问题${hasWarnings ? `和 ${warnings.length} 个警告` : ''}`
        : hasWarnings 
          ? `发现 ${warnings.length} 个警告`
          : '所有检查通过'
    });
    
  } catch (error: any) {
    console.error('诊断失败:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * POST /admin/user-diagnosis/:userId/fix
 * 
 * 功能：自动修复检测到的问题
 * - 补齐缺失的字段
 * - 创建缺失的索引
 * - 初始化缺失的数据结构
 */
userDiagnosis.post('/:userId/fix', async (c) => {
  try {
    const userId = c.req.param('userId');
    const { force = false } = await c.req.json();
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔧 开始自动修复用户数据：${userId}`);
    console.log(`${'='.repeat(80)}\n`);
    
    const fixes: string[] = [];
    const errors: string[] = [];
    
    // 获取 Profile
    const profile = await kv.get(`user:${userId}:profile`);
    
    if (!profile) {
      return c.json({
        success: false,
        error: '用户数据不存在，无法修复'
      }, 404);
    }
    
    console.log('📋 当前状态:');
    console.log(`   registrationStep: ${profile.registrationStep}`);
    console.log(`   accountStatus: ${profile.accountStatus || '未设置'}`);
    console.log(`   referralCode: ${profile.referralCode || '未设置'}`);
    
    // ========================================
    // 修复 1: Email 索引
    // ========================================
    const emailIndex = await kv.get(`user:email:${profile.email}`);
    
    if (!emailIndex || emailIndex !== userId) {
      await kv.set(`user:email:${profile.email}`, userId);
      fixes.push(`✓ 已创建/修复 Email 索引: user:email:${profile.email}`);
      console.log('✅ 修复 Email 索引');
    }
    
    // ========================================
    // 修复 2: Step 3 但缺少推荐树等数据
    // ========================================
    if (profile.registrationStep === 3) {
      // 检查推荐树
      let referralTree = await kv.get(`user:${userId}:referral_tree`);
      if (!referralTree) {
        referralTree = {
          firstGeneration: [],
          secondGeneration: [],
          thirdGeneration: [],
          lastUpdated: profile.updatedAt || profile.createdAt
        };
        await kv.set(`user:${userId}:referral_tree`, referralTree);
        fixes.push('✓ 已创建推荐树数据');
        console.log('✅ 创建推荐树');
      }
      
      // 检查推荐统计
      let referralStats = await kv.get(`user:${userId}:referral_stats`);
      if (!referralStats) {
        referralStats = {
          totalReferrals: 0,
          firstGenCount: referralTree.firstGeneration?.length || 0,
          secondGenCount: referralTree.secondGeneration?.length || 0,
          thirdGenCount: referralTree.thirdGeneration?.length || 0,
          lastUpdated: profile.updatedAt || profile.createdAt
        };
        await kv.set(`user:${userId}:referral_stats`, referralStats);
        fixes.push('✓ 已创建推荐统计数据');
        console.log('✅ 创建推荐统计');
      }
      
      // 检查奖励数据
      let rewards = await kv.get(`user:${userId}:rewards`);
      if (!rewards) {
        rewards = {
          availableRewards: 0,
          pendingRewards: 0,
          withdrawnRewards: 0,
          totalEarned: 0,
          lastUpdated: profile.updatedAt || profile.createdAt
        };
        await kv.set(`user:${userId}:rewards`, rewards);
        fixes.push('✓ 已创建奖励数据');
        console.log('✅ 创建奖励数据');
      }
      
      // 检查奖励历史
      let rewardHistory = await kv.get(`user:${userId}:reward_history`);
      if (!rewardHistory) {
        await kv.set(`user:${userId}:reward_history`, []);
        fixes.push('✓ 已创建奖励历史');
        console.log('✅ 创建奖励历史');
      }
      
      // 检查任务数据
      let tasks = await kv.get(`user:${userId}:tasks`);
      if (!tasks) {
        tasks = {
          consecutiveReferral: null,
          monthlyKing: null
        };
        await kv.set(`user:${userId}:tasks`, tasks);
        fixes.push('✓ 已创建任务数据');
        console.log('✅ 创建任务数据');
      }
      
      // 检查月度日志
      let monthlyLog = await kv.get(`user:${userId}:referral_monthly_log`);
      if (!monthlyLog) {
        await kv.set(`user:${userId}:referral_monthly_log`, {});
        fixes.push('✓ 已创建月度推荐日志');
        console.log('✅ 创建月度日志');
      }
    }
    
    // ========================================
    // 修复 3: 补齐缺失的 Profile 字段（需要 force = true）
    // ========================================
    if (force) {
      let profileUpdated = false;
      
      if (!profile.updatedAt) {
        profile.updatedAt = profile.createdAt;
        profileUpdated = true;
      }
      
      if (profile.registrationStep >= 2 && !profile.accountStatus) {
        profile.accountStatus = profile.registrationStep === 3 ? 'Active' : 'Pending';
        profileUpdated = true;
        fixes.push(`✓ 已设置 accountStatus = ${profile.accountStatus}`);
      }
      
      if (profileUpdated) {
        await kv.set(`user:${userId}:profile`, profile);
        fixes.push('✓ 已更新 Profile');
        console.log('✅ 更新 Profile');
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 修复报告');
    console.log(`${'='.repeat(80)}\n`);
    
    if (fixes.length > 0) {
      console.log('✅ 已完成的修复:');
      fixes.forEach(fix => console.log(`   ${fix}`));
    } else {
      console.log('ℹ️ 没有需要修复的问题');
    }
    
    if (errors.length > 0) {
      console.log('\n❌ 修复失败:');
      errors.forEach(error => console.log(`   ${error}`));
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
    
    return c.json({
      success: errors.length === 0,
      userId,
      fixes,
      errors,
      message: fixes.length > 0 
        ? `已完成 ${fixes.length} 项修复`
        : '没有需要修复的问题'
    });
    
  } catch (error: any) {
    console.error('自动修复失败:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default userDiagnosis;
