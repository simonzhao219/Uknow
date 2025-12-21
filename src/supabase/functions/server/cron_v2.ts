/**
 * Cron V2 - Scheduled Tasks System
 * 
 * Manages scheduled background tasks:
 * - Daily status check (account status sync)
 * - Daily reward issuance (scheduled rewards)
 * - Manual triggers for testing
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module cron_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { supabase, sql, handlePostgresError } from './db.ts';
import { syncAllAccountStatuses } from './utils/subscriptionStatus.ts';

const cronV2 = new Hono();

// ============================================================
// POST /cron-v2/daily-status-check - Daily Status Check
// ============================================================

/**
 * Daily status check cron job
 * 
 * Syncs all user account statuses based on subscription dates
 * Should be called daily via cron
 */
cronV2.post('/daily-status-check', async (c) => {
  try {
    console.log('[Cron] Starting daily status check...');
    
    const syncedCount = await syncAllAccountStatuses();
    
    console.log(`[Cron] ✅ Daily status check completed: ${syncedCount} users synced`);
    
    return c.json({
      success: true,
      data: {
        syncedCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Cron] Daily status check error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// POST /cron-v2/daily-reward-issuance - Daily Reward Issuance
// ============================================================

/**
 * Daily reward issuance cron job
 * 
 * Issues all scheduled rewards that are due today
 * Should be called daily via cron
 */
cronV2.post('/daily-reward-issuance', async (c) => {
  try {
    console.log('[Cron] Starting daily reward issuance...');
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
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
    
    console.log(`[Cron] Found ${dueSchedules.length} due rewards`);
    
    let issuedCount = 0;
    let failedCount = 0;
    
    // Process each schedule
    for (const schedule of dueSchedules) {
      try {
        // ✅ Issue reward in transaction
        await sql.begin(async (tx) => {
          // Get referee info for description
          const refereeResult = await tx<Array<{ real_name: string }>>`
            SELECT real_name FROM users WHERE id = ${schedule.referee_id}
          `;
          
          const refereeName = refereeResult[0]?.real_name || '未知用戶';
          
          // Update user balance
          await tx`
            UPDATE users
            SET point_balance = point_balance + ${schedule.amount}
            WHERE id = ${schedule.user_id}
          `;
          
          // Create reward history
          await tx`
            INSERT INTO reward_history (
              user_id, amount, type, description, created_at
            ) VALUES (
              ${schedule.user_id},
              ${schedule.amount},
              ${`referral_gen${schedule.generation}_month${schedule.month_number}`},
              ${`推薦獎勵 - ${refereeName}（第${schedule.generation}代）- 第${schedule.month_number}個月`},
              NOW()
            )
          `;
          
          // Mark schedule as completed
          await tx`
            UPDATE reward_schedules
            SET 
              status = 'completed',
              completed_at = NOW()
            WHERE id = ${schedule.id}
          `;
        });
        
        issuedCount++;
        console.log(`[Cron] ✅ Issued reward ${schedule.id}`);
      } catch (error) {
        failedCount++;
        console.error(`[Cron] ❌ Failed to issue reward ${schedule.id}:`, error);
      }
    }
    
    console.log(`[Cron] ✅ Daily reward issuance completed: ${issuedCount} issued, ${failedCount} failed`);
    
    return c.json({
      success: true,
      data: {
        totalDue: dueSchedules.length,
        issuedCount,
        failedCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Cron] Daily reward issuance error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// POST /cron-v2/manual-reward-issuance - Manual Reward Issuance
// ============================================================

/**
 * Manual reward issuance trigger
 * 
 * Issues rewards for a specific date (for testing/recovery)
 */
cronV2.post('/manual-reward-issuance', async (c) => {
  try {
    const { date } = await c.req.json();
    
    if (!date) {
      return c.json({
        success: false,
        error: { message: 'Date is required (format: YYYY-MM-DD)' }
      }, 400);
    }
    
    console.log(`[Cron] Manual reward issuance for date: ${date}`);
    
    // ✅ Get pending schedules for specified date
    const schedules = await sql<Array<{
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
        AND DATE(scheduled_date) = ${date}
    `;
    
    let issuedCount = 0;
    
    for (const schedule of schedules) {
      try {
        await sql.begin(async (tx) => {
          const refereeResult = await tx<Array<{ real_name: string }>>`
            SELECT real_name FROM users WHERE id = ${schedule.referee_id}
          `;
          
          const refereeName = refereeResult[0]?.real_name || '未知用戶';
          
          await tx`
            UPDATE users
            SET point_balance = point_balance + ${schedule.amount}
            WHERE id = ${schedule.user_id}
          `;
          
          await tx`
            INSERT INTO reward_history (
              user_id, amount, type, description, created_at
            ) VALUES (
              ${schedule.user_id},
              ${schedule.amount},
              ${`referral_gen${schedule.generation}_month${schedule.month_number}`},
              ${`推薦獎勵 - ${refereeName}（第${schedule.generation}代）- 第${schedule.month_number}個月`},
              NOW()
            )
          `;
          
          await tx`
            UPDATE reward_schedules
            SET 
              status = 'completed',
              completed_at = NOW()
            WHERE id = ${schedule.id}
          `;
        });
        
        issuedCount++;
      } catch (error) {
        console.error(`[Cron] Failed to issue reward ${schedule.id}:`, error);
      }
    }
    
    return c.json({
      success: true,
      data: {
        date,
        totalSchedules: schedules.length,
        issuedCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Cron] Manual reward issuance error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// POST /cron-v2/sync-status - Manual Status Sync
// ============================================================

/**
 * Manual status sync trigger
 * 
 * Syncs account statuses immediately (for testing/recovery)
 */
cronV2.post('/sync-status', async (c) => {
  try {
    console.log('[Cron] Manual status sync triggered');
    
    const syncedCount = await syncAllAccountStatuses();
    
    return c.json({
      success: true,
      data: {
        syncedCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Cron] Manual status sync error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// Health Check
// ============================================================

cronV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'cron-v2',
    timestamp: new Date().toISOString()
  });
});

export default cronV2;
