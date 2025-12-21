/**
 * Rewards V2 - Reward Schedule and History System
 * 
 * Manages reward schedules and reward history
 * - Creates 12-month reward schedules upon subscription payment
 * - Issues rewards on scheduled dates
 * - Maintains reward history
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module rewards_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, sql, handleSupabaseError, handlePostgresError } from './db.ts';

const rewardsV2 = new Hono();

// Initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// GET /rewards-v2/schedules - Get Reward Schedules
// ============================================================

/**
 * Get current user's pending reward schedules
 * 
 * Returns all pending rewards with referee information
 */
rewardsV2.get('/schedules', async (c) => {
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
    
    // ✅ Get pending schedules with referee information
    const schedules = await sql<Array<{
      id: string;
      referee_id: string;
      referee_name: string;
      generation: number;
      month_number: number;
      amount: number;
      scheduled_date: string;
      status: string;
      created_at: string;
    }>>`
      SELECT 
        rs.id,
        rs.referee_id,
        u.real_name as referee_name,
        rs.generation,
        rs.month_number,
        rs.amount,
        rs.scheduled_date,
        rs.status,
        rs.created_at
      FROM reward_schedules rs
      JOIN users u ON rs.referee_id = u.id
      WHERE rs.user_id = ${user.id}
        AND rs.status = 'pending'
      ORDER BY rs.scheduled_date ASC, rs.generation ASC
    `;
    
    return c.json({
      success: true,
      data: {
        schedules: schedules.map(s => ({
          id: s.id,
          referee: {
            userId: s.referee_id,
            name: s.referee_name
          },
          generation: s.generation,
          monthNumber: s.month_number,
          amount: Number(s.amount),
          scheduledDate: s.scheduled_date,
          status: s.status,
          createdAt: s.created_at
        })),
        total: schedules.length
      }
    });
  } catch (error) {
    console.error('[Get Schedules] Error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// GET /rewards-v2/history - Get Reward History
// ============================================================

/**
 * Get current user's reward history
 * 
 * Returns all issued rewards with pagination
 */
rewardsV2.get('/history', async (c) => {
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
    
    // Get query params
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const typeFilter = c.req.query('type'); // Optional: filter by type
    
    // ✅ Get reward history with optional filtering
    let query = sql`
      SELECT 
        id,
        amount,
        type,
        description,
        created_at
      FROM reward_history
      WHERE user_id = ${user.id}
    `;
    
    // Add type filter if provided
    if (typeFilter) {
      query = sql`
        SELECT 
          id,
          amount,
          type,
          description,
          created_at
        FROM reward_history
        WHERE user_id = ${user.id}
          AND type LIKE ${`%${typeFilter}%`}
      `;
    }
    
    // Add ordering, limit, and offset
    const history = await sql<Array<{
      id: string;
      amount: number;
      type: string;
      description: string;
      created_at: string;
    }>>`
      ${query}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    // Get total count
    const countResult = await sql<Array<{ count: number }>>`
      SELECT COUNT(*) as count
      FROM reward_history
      WHERE user_id = ${user.id}
      ${typeFilter ? sql`AND type LIKE ${`%${typeFilter}%`}` : sql``}
    `;
    
    const totalCount = Number(countResult[0]?.count || 0);
    
    return c.json({
      success: true,
      data: {
        history: history.map(h => ({
          id: h.id,
          amount: Number(h.amount),
          type: h.type,
          description: h.description,
          createdAt: h.created_at
        })),
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      }
    });
  } catch (error) {
    console.error('[Get History] Error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// GET /rewards-v2/summary - Get Reward Summary
// ============================================================

/**
 * Get current user's reward summary
 * 
 * Returns total earnings, breakdown by type, and pending schedules
 */
rewardsV2.get('/summary', async (c) => {
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
    
    // ✅ Get current point balance
    const { data: userData } = await supabase
      .from('users')
      .select('point_balance')
      .eq('id', user.id)
      .single();
    
    // ✅ Get total earned from history
    const earnedResult = await sql<Array<{
      total_earned: number;
      referral_earned: number;
      task_earned: number;
      gen1_earned: number;
      gen2_earned: number;
      gen3_earned: number;
    }>>`
      SELECT 
        COALESCE(SUM(amount), 0) as total_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE 'referral_%'), 0) as referral_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE 'task_%'), 0) as task_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE '%gen1%'), 0) as gen1_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE '%gen2%'), 0) as gen2_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE '%gen3%'), 0) as gen3_earned
      FROM reward_history
      WHERE user_id = ${user.id}
    `;
    
    // ✅ Get pending schedules summary
    const pendingResult = await sql<Array<{
      pending_count: number;
      pending_amount: number;
    }>>`
      SELECT 
        COUNT(*) as pending_count,
        COALESCE(SUM(amount), 0) as pending_amount
      FROM reward_schedules
      WHERE user_id = ${user.id}
        AND status = 'pending'
    `;
    
    // ✅ Get this month's earned rewards
    const thisMonthResult = await sql<Array<{
      month_earned: number;
    }>>`
      SELECT COALESCE(SUM(amount), 0) as month_earned
      FROM reward_history
      WHERE user_id = ${user.id}
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
    `;
    
    return c.json({
      success: true,
      data: {
        currentBalance: Number(userData?.point_balance || 0),
        totalEarned: Number(earnedResult[0]?.total_earned || 0),
        thisMonthEarned: Number(thisMonthResult[0]?.month_earned || 0),
        bySource: {
          referral: Number(earnedResult[0]?.referral_earned || 0),
          task: Number(earnedResult[0]?.task_earned || 0)
        },
        byGeneration: {
          generation1: Number(earnedResult[0]?.gen1_earned || 0),
          generation2: Number(earnedResult[0]?.gen2_earned || 0),
          generation3: Number(earnedResult[0]?.gen3_earned || 0)
        },
        pending: {
          count: Number(pendingResult[0]?.pending_count || 0),
          amount: Number(pendingResult[0]?.pending_amount || 0)
        }
      }
    });
  } catch (error) {
    console.error('[Get Summary] Error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// Health Check
// ============================================================

rewardsV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'rewards-v2',
    timestamp: new Date().toISOString()
  });
});

export default rewardsV2;
