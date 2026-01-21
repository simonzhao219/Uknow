/**
 * 🔧 修復用戶：江梓豪 (6597c99d-5905-4132-99e2-be7b98787315)
 * 
 * 問題：
 * - 2個推薦碼：cul122277, pbe942409
 * - 2個訂閱：subscription_1769001178400_fgsmm, subscription_1769001216008_y3pe4n
 * - 推薦樹中被重複添加
 * - 任務進度被重複計算
 * - 獎勵被重複發放
 * 
 * 推薦人：黎仁傑 (61b157d2-f242-4288-8deb-ffb7752d385e)
 * 
 * 執行方式：
 * deno run --allow-net --allow-env /supabase/functions/server/fix_user_6597c99d.ts
 */

import * as kv from './kv_store.tsx';
import { toTaiwanISOString, getTaiwanNow } from './date_utils.ts';

const REFEREE_USER_ID = '6597c99d-5905-4132-99e2-be7b98787315';
const REFEREE_USER_NAME = '江梓豪';
const REFERRER_USER_ID = '61b157d2-f242-4288-8deb-ffb7752d385e';
const REFERRER_USER_NAME = '黎仁傑';

// 推薦碼
const KEEP_REFERRAL_CODE = 'pbe942409';  // 保留（profile 中的）
const REMOVE_REFERRAL_CODE = 'cul122277'; // 刪除

// 訂閱
const KEEP_SUBSCRIPTION = 'subscription_1769001216008_y3pe4n';  // 保留（account_status 中的）
const REMOVE_SUBSCRIPTION = 'subscription_1769001178400_fgsmm'; // 刪除

console.log('========================================');
console.log('🔧 開始修復用戶：江梓豪');
console.log('========================================');
console.log(`用戶ID: ${REFEREE_USER_ID}`);
console.log(`推薦人: ${REFERRER_USER_NAME} (${REFERRER_USER_ID})`);
console.log('');

async function main() {
  const results = [];
  
  try {
    // ========== 步驟 1：移除重複的推薦碼 ==========
    console.log('步驟 1: 移除重複的推薦碼');
    console.log('----------------------------------------');
    
    try {
      // 檢查兩個推薦碼是否都存在
      const code1 = await kv.get(`referral_code:${KEEP_REFERRAL_CODE}`);
      const code2 = await kv.get(`referral_code:${REMOVE_REFERRAL_CODE}`);
      
      console.log(`✓ 推薦碼 ${KEEP_REFERRAL_CODE}: ${code1 ? '存在' : '不存在'}`);
      console.log(`✓ 推薦碼 ${REMOVE_REFERRAL_CODE}: ${code2 ? '存在' : '不存在'}`);
      
      if (code2) {
        // 刪除舊推薦碼
        await kv.del(`referral_code:${REMOVE_REFERRAL_CODE}`);
        console.log(`✅ 已刪除推薦碼: ${REMOVE_REFERRAL_CODE}`);
        results.push({
          step: 1,
          action: 'remove_duplicate_referral_code',
          success: true,
          details: `刪除了 ${REMOVE_REFERRAL_CODE}`
        });
      } else {
        console.log(`ℹ️  推薦碼 ${REMOVE_REFERRAL_CODE} 已不存在，跳過刪除`);
        results.push({
          step: 1,
          action: 'remove_duplicate_referral_code',
          success: true,
          details: '已不存在，跳過'
        });
      }
      
      // 確認保留的推薦碼
      if (code1) {
        console.log(`✅ 保留推薦碼: ${KEEP_REFERRAL_CODE}`);
      } else {
        console.error(`❌ 錯誤：保留的推薦碼 ${KEEP_REFERRAL_CODE} 不存在！`);
      }
      
    } catch (error) {
      console.error('❌ 步驟 1 失敗:', error);
      results.push({
        step: 1,
        action: 'remove_duplicate_referral_code',
        success: false,
        error: error.message
      });
    }
    
    console.log('');
    
    // ========== 步驟 2：合併重複的訂閱 ==========
    console.log('步驟 2: 合併重複的訂閱');
    console.log('----------------------------------------');
    
    try {
      // 檢查訂閱列表
      const userSubscriptions = await kv.get(`user:${REFEREE_USER_ID}:subscriptions`) || [];
      console.log(`✓ 當前訂閱列表: ${JSON.stringify(userSubscriptions)}`);
      
      // 更新為單一訂閱
      await kv.set(`user:${REFEREE_USER_ID}:subscriptions`, [KEEP_SUBSCRIPTION]);
      console.log(`✅ 訂閱列表已更新為: [${KEEP_SUBSCRIPTION}]`);
      
      // 刪除舊訂閱記錄
      const oldSub = await kv.get(`subscription:${REMOVE_SUBSCRIPTION}`);
      if (oldSub) {
        await kv.del(`subscription:${REMOVE_SUBSCRIPTION}`);
        console.log(`✅ 已刪除訂閱記錄: ${REMOVE_SUBSCRIPTION}`);
      } else {
        console.log(`ℹ️  訂閱記錄 ${REMOVE_SUBSCRIPTION} 已不存在，跳過刪除`);
      }
      
      // 確認保留的訂閱
      const keepSub = await kv.get(`subscription:${KEEP_SUBSCRIPTION}`);
      if (keepSub) {
        console.log(`✅ 保留訂閱: ${KEEP_SUBSCRIPTION}`);
        console.log(`   結束日期: ${keepSub.endDate}`);
      } else {
        console.error(`❌ 錯誤：保留的訂閱 ${KEEP_SUBSCRIPTION} 不存在！`);
      }
      
      results.push({
        step: 2,
        action: 'merge_duplicate_subscriptions',
        success: true,
        details: `保留 ${KEEP_SUBSCRIPTION}，刪除 ${REMOVE_SUBSCRIPTION}`
      });
      
    } catch (error) {
      console.error('❌ 步驟 2 失敗:', error);
      results.push({
        step: 2,
        action: 'merge_duplicate_subscriptions',
        success: false,
        error: error.message
      });
    }
    
    console.log('');
    
    // ========== 步驟 3：去重推薦人的推薦樹 ==========
    console.log('步驟 3: 去重推薦人的推薦樹');
    console.log('----------------------------------------');
    
    try {
      const treeKey = `user:${REFERRER_USER_ID}:referral_tree`;
      const tree = await kv.get(treeKey);
      
      if (!tree) {
        console.log(`ℹ️  推薦人無推薦樹，跳過`);
        results.push({
          step: 3,
          action: 'deduplicate_referral_tree',
          success: true,
          details: '無推薦樹'
        });
      } else {
        console.log(`✓ 當前一代推薦數量: ${tree.firstGeneration?.length || 0}`);
        
        // 去重一代
        if (tree.firstGeneration && tree.firstGeneration.length > 0) {
          const originalCount = tree.firstGeneration.length;
          const seen = new Set();
          
          tree.firstGeneration = tree.firstGeneration.filter((member: any) => {
            if (seen.has(member.userId)) {
              console.log(`  ❌ 移除重複成員: ${member.userName} (${member.userId})`);
              return false;
            }
            seen.add(member.userId);
            return true;
          });
          
          const removedCount = originalCount - tree.firstGeneration.length;
          console.log(`✅ 移除了 ${removedCount} 個重複成員`);
          console.log(`✅ 去重後一代推薦數量: ${tree.firstGeneration.length}`);
          
          // 保存推薦樹
          tree.lastUpdated = toTaiwanISOString(getTaiwanNow());
          await kv.set(treeKey, tree);
          
          // 更新推薦統計
          const statsKey = `user:${REFERRER_USER_ID}:referral_stats`;
          const stats = await kv.get(statsKey) || {
            totalReferrals: 0,
            firstGenCount: 0,
            secondGenCount: 0,
            thirdGenCount: 0
          };
          
          stats.firstGenCount = tree.firstGeneration.length;
          stats.secondGenCount = tree.secondGeneration?.length || 0;
          stats.thirdGenCount = tree.thirdGeneration?.length || 0;
          stats.totalReferrals = stats.firstGenCount + stats.secondGenCount + stats.thirdGenCount;
          stats.lastUpdated = toTaiwanISOString(getTaiwanNow());
          
          await kv.set(statsKey, stats);
          console.log(`✅ 推薦統計已更新: 總計 ${stats.totalReferrals} 人`);
          
          results.push({
            step: 3,
            action: 'deduplicate_referral_tree',
            success: true,
            details: `移除了 ${removedCount} 個重複成員`
          });
        } else {
          console.log(`ℹ️  一代推薦為空，跳過`);
          results.push({
            step: 3,
            action: 'deduplicate_referral_tree',
            success: true,
            details: '一代推薦為空'
          });
        }
      }
      
    } catch (error) {
      console.error('❌ 步驟 3 失敗:', error);
      results.push({
        step: 3,
        action: 'deduplicate_referral_tree',
        success: false,
        error: error.message
      });
    }
    
    console.log('');
    
    // ========== 步驟 4：刪除重複的獎勵排程 ==========
    console.log('步驟 4: 刪除重複的獎勵排程');
    console.log('----------------------------------------');
    
    try {
      // 獲取所有獎勵排程
      const allSchedules = await kv.getByPrefix('reward_schedule:');
      
      // 過濾出與江梓豪相關的排程
      const relatedSchedules = allSchedules.filter((schedule: any) => 
        schedule.userId === REFERRER_USER_ID && 
        schedule.referee?.userId === REFEREE_USER_ID
      );
      
      console.log(`✓ 找到 ${relatedSchedules.length} 個與江梓豪相關的獎勵排程`);
      
      // 按 generation + monthNumber 分組
      const scheduleMap: { [key: string]: any[] } = {};
      
      for (const schedule of relatedSchedules) {
        const key = `gen${schedule.generation}_month${schedule.monthNumber}`;
        if (!scheduleMap[key]) {
          scheduleMap[key] = [];
        }
        scheduleMap[key].push(schedule);
      }
      
      // 刪除重複排程
      let deletedCount = 0;
      
      for (const [key, schedules] of Object.entries(scheduleMap)) {
        if (schedules.length > 1) {
          console.log(`  🔍 發現重複排程: ${key}, 共 ${schedules.length} 筆`);
          
          // 保留第一個，刪除其他
          for (let i = 1; i < schedules.length; i++) {
            const schedule = schedules[i];
            
            // 刪除排程記錄
            await kv.del(`reward_schedule:${schedule.id}`);
            
            // 刪除日期索引
            if (schedule.scheduledDate) {
              const dateIndexKey = `reward_schedules_by_date:${schedule.scheduledDate}`;
              const dateIndex = await kv.get(dateIndexKey) || [];
              const newIndex = dateIndex.filter((id: string) => id !== schedule.id);
              
              if (newIndex.length > 0) {
                await kv.set(dateIndexKey, newIndex);
              } else {
                await kv.del(dateIndexKey);
              }
            }
            
            deletedCount++;
            console.log(`    ❌ 刪除排程: ${schedule.id}`);
          }
        }
      }
      
      console.log(`✅ 刪除了 ${deletedCount} 個重複的獎勵排程`);
      
      results.push({
        step: 4,
        action: 'remove_duplicate_reward_schedules',
        success: true,
        details: `刪除了 ${deletedCount} 個重複排程`
      });
      
    } catch (error) {
      console.error('❌ 步驟 4 失敗:', error);
      results.push({
        step: 4,
        action: 'remove_duplicate_reward_schedules',
        success: false,
        error: error.message
      });
    }
    
    console.log('');
    
    // ========== 步驟 5：校正推薦人的獎勵金額 ==========
    console.log('步驟 5: 校正推薦人的獎勵金額');
    console.log('----------------------------------------');
    
    try {
      // 獲取推薦樹（已去重）
      const tree = await kv.get(`user:${REFERRER_USER_ID}:referral_tree`);
      
      if (!tree) {
        console.log(`ℹ️  推薦人無推薦樹，跳過`);
        results.push({
          step: 5,
          action: 'recalculate_rewards',
          success: true,
          details: '無推薦樹'
        });
      } else {
        // 計算期望的首月獎勵
        const totalReferrals = 
          (tree.firstGeneration?.length || 0) +
          (tree.secondGeneration?.length || 0) +
          (tree.thirdGeneration?.length || 0);
        
        const expectedFirstMonthRewards = totalReferrals * 10;
        
        console.log(`✓ 推薦網絡總人數: ${totalReferrals}`);
        console.log(`✓ 期望首月獎勵總額: ${expectedFirstMonthRewards}P`);
        
        // 獲取獎勵歷史
        const historyKey = `user:${REFERRER_USER_ID}:reward_history`;
        const history = await kv.get(historyKey) || [];
        
        // 統計實際已發放的首月獎勵（只計算與江梓豪相關的）
        const jiangRelatedRewards = history.filter((r: any) => 
          r.referee?.userId === REFEREE_USER_ID && r.monthNumber === 1
        );
        
        const actualAmount = jiangRelatedRewards.reduce((sum: number, r: any) => sum + r.amount, 0);
        
        console.log(`✓ 實際已發放（江梓豪相關）: ${actualAmount}P`);
        console.log(`✓ 應發放（江梓豪，1人）: 10P`);
        
        const difference = actualAmount - 10;
        
        if (difference > 0) {
          console.log(`⚠️  多發了 ${difference}P，需要扣回`);
          
          // 校正獎勵餘額
          const rewardsKey = `user:${REFERRER_USER_ID}:rewards`;
          const rewards = await kv.get(rewardsKey) || {
            availableRewards: 0,
            pendingRewards: 0,
            withdrawnRewards: 0,
            totalEarned: 0
          };
          
          console.log(`  原可提領獎勵: ${rewards.availableRewards}P`);
          console.log(`  原總累積: ${rewards.totalEarned}P`);
          
          rewards.availableRewards -= difference;
          rewards.totalEarned -= difference;
          rewards.lastUpdated = toTaiwanISOString(getTaiwanNow());
          
          await kv.set(rewardsKey, rewards);
          
          console.log(`  新可提領獎勵: ${rewards.availableRewards}P`);
          console.log(`  新總累積: ${rewards.totalEarned}P`);
          console.log(`✅ 已扣除多發的 ${difference}P`);
          
          // 添加校正記錄到歷史
          history.unshift({
            id: `correction_${Date.now()}`,
            type: 'correction_duplicate_reward',
            amount: -difference,
            referee: {
              userId: REFEREE_USER_ID,
              userName: REFEREE_USER_NAME,
              listingId: null,
              listingName: null
            },
            generation: 1,
            monthNumber: 1,
            issuedAt: toTaiwanISOString(getTaiwanNow()),
            description: `系統校正：回收重複發放的推薦獎勵（江梓豪）`
          });
          
          await kv.set(historyKey, history);
          console.log(`✅ 已添加校正記錄到獎勵歷史`);
          
          results.push({
            step: 5,
            action: 'recalculate_rewards',
            success: true,
            details: `扣回 ${difference}P`
          });
        } else if (difference < 0) {
          console.log(`⚠️  少發了 ${-difference}P，但這不太可能，請人工檢查`);
          results.push({
            step: 5,
            action: 'recalculate_rewards',
            success: true,
            details: `異常：少發了 ${-difference}P`
          });
        } else {
          console.log(`✅ 獎勵金額正確，無需校正`);
          results.push({
            step: 5,
            action: 'recalculate_rewards',
            success: true,
            details: '金額正確'
          });
        }
      }
      
    } catch (error) {
      console.error('❌ 步驟 5 失敗:', error);
      results.push({
        step: 5,
        action: 'recalculate_rewards',
        success: false,
        error: error.message
      });
    }
    
    console.log('');
    
    // ========== 步驟 6：去重月度日誌 ==========
    console.log('步驟 6: 去重推薦人的月度日誌');
    console.log('----------------------------------------');
    
    try {
      const monthlyLogKey = `user:${REFERRER_USER_ID}:referral_monthly_log`;
      const monthlyLog = await kv.get(monthlyLogKey);
      
      if (!monthlyLog) {
        console.log(`ℹ️  推薦人無月度日誌，跳過`);
        results.push({
          step: 6,
          action: 'deduplicate_monthly_log',
          success: true,
          details: '無月度日誌'
        });
      } else {
        let totalRemoved = 0;
        
        for (const [month, records] of Object.entries(monthlyLog)) {
          if (!Array.isArray(records)) continue;
          
          const originalCount = records.length;
          const seen = new Set();
          
          monthlyLog[month] = records.filter((record: any) => {
            if (seen.has(record.userId)) {
              console.log(`  ❌ ${month} 移除重複: ${record.userName} (${record.userId})`);
              return false;
            }
            seen.add(record.userId);
            return true;
          });
          
          const removed = originalCount - monthlyLog[month].length;
          if (removed > 0) {
            totalRemoved += removed;
            console.log(`  ✓ ${month}: ${originalCount} → ${monthlyLog[month].length} (移除 ${removed} 個)`);
          }
        }
        
        if (totalRemoved > 0) {
          await kv.set(monthlyLogKey, monthlyLog);
          console.log(`✅ 月度日誌已去重，移除了 ${totalRemoved} 個重複記錄`);
        } else {
          console.log(`✅ 月度日誌無重複，無需修改`);
        }
        
        results.push({
          step: 6,
          action: 'deduplicate_monthly_log',
          success: true,
          details: `移除了 ${totalRemoved} 個重複記錄`
        });
      }
      
    } catch (error) {
      console.error('❌ 步驟 6 失敗:', error);
      results.push({
        step: 6,
        action: 'deduplicate_monthly_log',
        success: false,
        error: error.message
      });
    }
    
    console.log('');
    
    // ========== 保存修復日誌 ==========
    const logKey = `repair_log:${REFEREE_USER_ID}:${Date.now()}`;
    await kv.set(logKey, {
      userId: REFEREE_USER_ID,
      userName: REFEREE_USER_NAME,
      referrerId: REFERRER_USER_ID,
      referrerName: REFERRER_USER_NAME,
      timestamp: toTaiwanISOString(getTaiwanNow()),
      results
    });
    
    console.log('========================================');
    console.log('✅ 修復完成！');
    console.log('========================================');
    console.log('');
    console.log('修復摘要:');
    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} 步驟 ${result.step}: ${result.action}`);
      if (result.details) {
        console.log(`   詳情: ${result.details}`);
      }
      if (result.error) {
        console.log(`   錯誤: ${result.error}`);
      }
    });
    
  } catch (error) {
    console.error('========================================');
    console.error('❌ 修復過程中發生嚴重錯誤');
    console.error('========================================');
    console.error(error);
  }
}

// 執行修復
main();
