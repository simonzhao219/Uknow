/**
 * Daily Reward Issuance - Cron Job Handler
 * 
 * This module is called by the cron system to issue daily rewards
 * It processes all pending reward schedules that are due today
 * 
 * Uses Postgres SQL (Deno compatible)
 * 
 * @module dailyRewardIssuance
 */

import { sql } from '../db.ts';

/**
 * Issue all rewards scheduled for today
 * 
 * This function:
 * 1. Finds all pending rewards due today
 * 2. Issues each reward in a transaction
 * 3. Updates user balances
 * 4. Creates reward history records
 * 5. Marks schedules as completed
 * 
 * @returns {Promise<{ issued: number, failed: number }>} Issuance result
 */
export async function issueDailyRewards(): Promise<{ issued: number; failed: number }> {
  console.log('[Daily Rewards] Starting daily reward issuance...');
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  try {
    // ✅ Get all pending schedules due today
    const dueSchedules = await sql<Array<{
      id: string;
      user_id: string;
      referee_id: string;
      generation: number;
      month_number: number;
      amount: number;
    }>>`
      SELECT id, user_id, referee_id, generation, month_number, amount
      FROM reward_schedules
      WHERE status = 'pending'
        AND DATE(scheduled_date) <= ${today}
      ORDER BY scheduled_date ASC
    `;
    
    console.log(`[Daily Rewards] Found ${dueSchedules.length} due rewards`);
    
    let issuedCount = 0;
    let failedCount = 0;
    
    // Process each schedule in its own transaction
    for (const schedule of dueSchedules) {
      try {
        await issueReward(schedule);
        issuedCount++;
        console.log(`[Daily Rewards] ✅ Issued reward ${schedule.id} to user ${schedule.user_id}`);
      } catch (error) {
        failedCount++;
        console.error(`[Daily Rewards] ❌ Failed to issue reward ${schedule.id}:`, error);
        
        // Mark schedule as failed
        try {
          await sql`
            UPDATE reward_schedules
            SET 
              status = 'failed',
              updated_at = NOW()
            WHERE id = ${schedule.id}
          `;
        } catch (updateError) {
          console.error(`[Daily Rewards] Failed to mark schedule as failed:`, updateError);
        }
      }
    }
    
    console.log(
      `[Daily Rewards] ✅ Completed: ${issuedCount} issued, ${failedCount} failed out of ${dueSchedules.length} total`
    );
    
    return { issued: issuedCount, failed: failedCount };
  } catch (error) {
    console.error('[Daily Rewards] Fatal error during daily reward issuance:', error);
    throw error;
  }
}

/**
 * Issue a single reward
 * 
 * Uses transaction to ensure atomicity
 * 
 * @param schedule - Reward schedule to process
 */
async function issueReward(schedule: {
  id: string;
  user_id: string;
  referee_id: string;
  generation: number;
  month_number: number;
  amount: number;
}): Promise<void> {
  await sql.begin(async (tx) => {
    // Get referee info for description
    const refereeResult = await tx<Array<{ real_name: string }>>`
      SELECT real_name
      FROM users
      WHERE id = ${schedule.referee_id}
    `;
    
    const refereeName = refereeResult[0]?.real_name || '未知用戶';
    
    // Check if user still exists and is active
    const userResult = await tx<Array<{
      id: string;
      account_status: string;
      point_balance: number;
    }>>`
      SELECT id, account_status, point_balance
      FROM users
      WHERE id = ${schedule.user_id}
    `;
    
    if (userResult.length === 0) {
      throw new Error(`User ${schedule.user_id} not found`);
    }
    
    const user = userResult[0];
    
    // Only issue rewards to Active or Canceled accounts
    if (user.account_status !== 'Active' && user.account_status !== 'Canceled') {
      console.log(
        `[Daily Rewards] Skipping reward for user ${schedule.user_id} (status: ${user.account_status})`
      );
      
      // Mark schedule as cancelled
      await tx`
        UPDATE reward_schedules
        SET 
          status = 'cancelled',
          updated_at = NOW()
        WHERE id = ${schedule.id}
      `;
      
      return;
    }
    
    // Update user balance
    await tx`
      UPDATE users
      SET 
        point_balance = point_balance + ${schedule.amount},
        updated_at = NOW()
      WHERE id = ${schedule.user_id}
    `;
    
    // Create reward history
    const rewardType = `referral_gen${schedule.generation}_month${schedule.month_number}`;
    const description = `推薦獎勵 - ${refereeName}（第${schedule.generation}代）- 第${schedule.month_number}個月`;
    
    await tx`
      INSERT INTO reward_history (
        user_id,
        amount,
        type,
        description,
        created_at
      ) VALUES (
        ${schedule.user_id},
        ${schedule.amount},
        ${rewardType},
        ${description},
        NOW()
      )
    `;
    
    // Mark schedule as completed
    await tx`
      UPDATE reward_schedules
      SET 
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${schedule.id}
    `;
    
    console.log(
      `[Daily Rewards] Issued ${schedule.amount} points to user ${schedule.user_id} ` +
      `(${rewardType})`
    );
  });
}

/**
 * Get statistics for a specific date
 * 
 * @param date - Date in YYYY-MM-DD format
 * @returns {Promise<{ total: number, completed: number, pending: number, cancelled: number, failed: number }>}
 */
export async function getRewardStatistics(date: string): Promise<{
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
  failed: number;
}> {
  const stats = await sql<Array<{
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    failed: number;
  }>>`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM reward_schedules
    WHERE DATE(scheduled_date) = ${date}
  `;
  
  return {
    total: Number(stats[0]?.total || 0),
    completed: Number(stats[0]?.completed || 0),
    pending: Number(stats[0]?.pending || 0),
    cancelled: Number(stats[0]?.cancelled || 0),
    failed: Number(stats[0]?.failed || 0)
  };
}
