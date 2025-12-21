/**
 * Tasks V2 - Task Progress and Rewards System
 * 
 * Manages task progress for:
 * - Consecutive Referral Expert (連續推薦達人)
 * - Monthly Referral King (推薦王)
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module tasks_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, sql, handleSupabaseError, handlePostgresError } from './db.ts';

const tasksV2 = new Hono();

// Task constants
const CONSECUTIVE_REFERRAL_THRESHOLD = 3; // 3 consecutive months
const CONSECUTIVE_REFERRAL_REWARD = 50;   // 50 points

const MONTHLY_KING_THRESHOLD = 3;        // Top 3 users
const MONTHLY_KING_REWARDS = [100, 50, 30]; // 1st, 2nd, 3rd place

// Initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// GET /tasks-v2/progress - Get Task Progress
// ============================================================

/**
 * Get current user's task progress
 */
tasksV2.get('/progress', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.split(' ')[1];
    const supabaseAdmin = getSupabaseAdmin();
    
    // Verify token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({
        success: false,
        error: { message: 'Invalid token' }
      }, 401);
    }
    
    // ✅ Get task progress
    const { data: progress } = await supabase
      .from('task_progress')
      .select('*')
      .eq('user_id', user.id);
    
    // Format progress data
    const consecutiveReferral = progress?.find(p => p.task_type === 'consecutive_referral');
    const monthlyKing = progress?.find(p => p.task_type === 'monthly_king');
    
    return c.json({
      success: true,
      data: {
        consecutiveReferral: {
          currentStreak: consecutiveReferral?.current_value || 0,
          threshold: CONSECUTIVE_REFERRAL_THRESHOLD,
          reward: CONSECUTIVE_REFERRAL_REWARD,
          isCompleted: consecutiveReferral?.is_completed || false,
          lastUpdated: consecutiveReferral?.updated_at || null
        },
        monthlyKing: {
          currentRank: monthlyKing?.current_value || 0,
          threshold: MONTHLY_KING_THRESHOLD,
          rewards: MONTHLY_KING_REWARDS,
          isCompleted: monthlyKing?.is_completed || false,
          lastUpdated: monthlyKing?.updated_at || null
        }
      }
    });
  } catch (error) {
    console.error('[Get Progress] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// GET /tasks-v2/rewards - Get Task Rewards
// ============================================================

/**
 * Get task reward history
 */
tasksV2.get('/rewards', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.split(' ')[1];
    const supabaseAdmin = getSupabaseAdmin();
    
    // Verify token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({
        success: false,
        error: { message: 'Invalid token' }
      }, 401);
    }
    
    // ✅ Get task rewards from history
    const rewards = await sql<Array<{
      id: string;
      amount: number;
      type: string;
      description: string;
      created_at: string;
    }>>`
      SELECT id, amount, type, description, created_at
      FROM reward_history
      WHERE user_id = ${user.id}
        AND type LIKE 'task_%'
      ORDER BY created_at DESC
    `;
    
    return c.json({
      success: true,
      data: {
        rewards: rewards.map(r => ({
          id: r.id,
          amount: Number(r.amount),
          type: r.type,
          description: r.description,
          createdAt: r.created_at
        })),
        total: rewards.reduce((sum, r) => sum + Number(r.amount), 0)
      }
    });
  } catch (error) {
    console.error('[Get Task Rewards] Error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// POST /tasks-v2/manual-update - Manual Update (Testing)
// ============================================================

/**
 * Manually update task progress (for testing)
 * 
 * This endpoint should be removed in production or protected with admin auth
 */
tasksV2.post('/manual-update', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: { message: 'Unauthorized' }
      }, 401);
    }
    
    const token = authHeader.split(' ')[1];
    const supabaseAdmin = getSupabaseAdmin();
    
    // Verify token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return c.json({
        success: false,
        error: { message: 'Invalid token' }
      }, 401);
    }
    
    const { taskType, value } = await c.req.json();
    
    if (!taskType || value === undefined) {
      return c.json({
        success: false,
        error: { message: 'Task type and value are required' }
      }, 400);
    }
    
    // ✅ Update or insert task progress
    const { data: existing } = await supabase
      .from('task_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('task_type', taskType)
      .single();
    
    if (existing) {
      await supabase
        .from('task_progress')
        .update({
          current_value: value,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('task_progress')
        .insert({
          user_id: user.id,
          task_type: taskType,
          current_value: value
        });
    }
    
    console.log(`[Manual Update] ✅ Updated ${taskType} for user ${user.id}: ${value}`);
    
    return c.json({
      success: true,
      data: { message: 'Task progress updated' }
    });
  } catch (error) {
    console.error('[Manual Update] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Exported functions for use by other modules
// ============================================================

/**
 * Update consecutive referral progress
 * Called when a user makes a referral
 */
export async function updateConsecutiveReferralProgress(userId: string): Promise<void> {
  console.log(`[Task] Updating consecutive referral progress for user: ${userId}`);
  // Implementation would check if user has referrals in consecutive months
  // For now, this is a placeholder
}

/**
 * Update monthly king progress
 * Called at the end of each month
 */
export async function updateMonthlyKingProgress(): Promise<void> {
  console.log('[Task] Updating monthly king progress...');
  // Implementation would calculate rankings and award top 3 users
  // For now, this is a placeholder
}

// ============================================================
// Health Check
// ============================================================

tasksV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'tasks-v2',
    timestamp: new Date().toISOString()
  });
});

export default tasksV2;
