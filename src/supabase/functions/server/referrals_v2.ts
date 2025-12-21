/**
 * Referrals V2 - Member-based Referral System
 * 
 * Key changes from V1:
 * - Referral relationships are between members (users), not listings
 * - Uses Postgres SQL for efficient recursive queries
 * - Implements SSOT (Single Source of Truth) for user names
 * - Preserves inactive nodes in the tree
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module referrals_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, sql, handleSupabaseError, handlePostgresError } from './db.ts';

const referralsV2 = new Hono();

// Initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// Types
// ============================================================

interface MemberNode {
  userId: string;
  realName: string;
  accountStatus: string;
  isActive: boolean;
  createdAt: string;
  generation: number;
  referrer?: {
    userId: string;
    realName: string;
  };
}

interface ReferralTreeData {
  generation1: MemberNode[];
  generation2: MemberNode[];
  generation3: MemberNode[];
  summary: {
    totalReferrals: number;
    activeCount: number;
    inactiveCount: number;
    gen1Count: number;
    gen2Count: number;
    gen3Count: number;
  };
}

// ============================================================
// GET /referrals-v2/my-tree - Get My Referral Tree
// ============================================================

/**
 * Get current user's referral tree (member-based)
 * 
 * Returns three generations of referred members with their current status
 * Uses SSOT principle - queries real names from database in real-time
 * Uses recursive CTE for efficient tree traversal
 */
referralsV2.get('/my-tree', async (c) => {
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
    
    // ✅ Get current user's profile and active referral code
    const { data: currentUser } = await supabase
      .from('users')
      .select('id, real_name, account_status')
      .eq('id', user.id)
      .single();
    
    if (!currentUser) {
      return c.json({
        success: false,
        error: { message: 'User not found' }
      }, 404);
    }
    
    const { data: referralCode } = await supabase
      .from('referral_codes')
      .select('code')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    // ✅ Use recursive CTE to get all three generations
    const tree = await sql<Array<{
      user_id: string;
      real_name: string;
      account_status: string;
      created_at: string;
      generation: number;
      referrer_id: string | null;
      referrer_name: string | null;
    }>>`
      WITH RECURSIVE referral_tree AS (
        -- Base case: Direct referrals (Generation 1)
        SELECT 
          u.id as user_id,
          u.real_name,
          u.account_status,
          rr.created_at,
          rr.generation,
          NULL::text as referrer_id,
          NULL::text as referrer_name
        FROM referral_relationships rr
        JOIN users u ON rr.referee_id = u.id
        WHERE rr.referrer_id = ${user.id}
          AND rr.generation = 1
          AND rr.is_active = true
        
        UNION ALL
        
        -- Recursive case: Indirect referrals (Generation 2 & 3)
        SELECT 
          u.id as user_id,
          u.real_name,
          u.account_status,
          rr.created_at,
          rr.generation,
          rt.user_id as referrer_id,
          rt.real_name as referrer_name
        FROM referral_tree rt
        JOIN referral_relationships rr ON rr.referrer_id = rt.user_id
        JOIN users u ON rr.referee_id = u.id
        WHERE rr.generation = rt.generation + 1
          AND rr.generation <= 3
          AND rr.is_active = true
      )
      SELECT * FROM referral_tree
      ORDER BY generation, created_at DESC
    `;
    
    // ✅ Organize by generation
    const generation1: MemberNode[] = [];
    const generation2: MemberNode[] = [];
    const generation3: MemberNode[] = [];
    
    for (const node of tree) {
      const memberNode: MemberNode = {
        userId: node.user_id,
        realName: node.real_name,
        accountStatus: node.account_status,
        isActive: node.account_status === 'Active' || node.account_status === 'Canceled',
        createdAt: node.created_at,
        generation: node.generation
      };
      
      // Add referrer info for Gen 2 & 3
      if (node.referrer_id && node.referrer_name) {
        memberNode.referrer = {
          userId: node.referrer_id,
          realName: node.referrer_name
        };
      }
      
      if (node.generation === 1) {
        generation1.push(memberNode);
      } else if (node.generation === 2) {
        generation2.push(memberNode);
      } else if (node.generation === 3) {
        generation3.push(memberNode);
      }
    }
    
    // Calculate summary
    const totalReferrals = tree.length;
    const activeCount = tree.filter(n => 
      n.account_status === 'Active' || n.account_status === 'Canceled'
    ).length;
    const inactiveCount = totalReferrals - activeCount;
    
    const summary = {
      totalReferrals,
      activeCount,
      inactiveCount,
      gen1Count: generation1.length,
      gen2Count: generation2.length,
      gen3Count: generation3.length
    };
    
    return c.json({
      success: true,
      data: {
        currentUser: {
          userId: currentUser.id,
          realName: currentUser.real_name,
          accountStatus: currentUser.account_status,
          referralCode: referralCode?.code || null
        },
        tree: {
          generation1,
          generation2,
          generation3
        },
        summary
      }
    });
  } catch (error) {
    console.error('[Get Referral Tree] Error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// GET /referrals-v2/statistics - Get Referral Statistics
// ============================================================

/**
 * Get current user's referral statistics
 * 
 * Returns counts and earnings breakdown by generation
 */
referralsV2.get('/statistics', async (c) => {
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
    
    // ✅ Get referral counts by generation
    const stats = await sql<Array<{
      generation: number;
      total_count: number;
      active_count: number;
    }>>`
      SELECT 
        rr.generation,
        COUNT(*) as total_count,
        COUNT(*) FILTER (
          WHERE u.account_status IN ('Active', 'Canceled')
        ) as active_count
      FROM referral_relationships rr
      JOIN users u ON rr.referee_id = u.id
      WHERE rr.referrer_id = ${user.id}
        AND rr.is_active = true
      GROUP BY rr.generation
      ORDER BY rr.generation
    `;
    
    // ✅ Get total rewards earned from referrals
    const rewards = await sql<Array<{
      total_earned: number;
      gen1_earned: number;
      gen2_earned: number;
      gen3_earned: number;
    }>>`
      SELECT 
        COALESCE(SUM(amount), 0) as total_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE '%gen1%'), 0) as gen1_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE '%gen2%'), 0) as gen2_earned,
        COALESCE(SUM(amount) FILTER (WHERE type LIKE '%gen3%'), 0) as gen3_earned
      FROM reward_history
      WHERE user_id = ${user.id}
        AND type LIKE 'referral_%'
    `;
    
    // Format statistics
    const gen1 = stats.find(s => s.generation === 1);
    const gen2 = stats.find(s => s.generation === 2);
    const gen3 = stats.find(s => s.generation === 3);
    
    const totalCount = stats.reduce((sum, s) => sum + Number(s.total_count), 0);
    const totalActive = stats.reduce((sum, s) => sum + Number(s.active_count), 0);
    
    return c.json({
      success: true,
      data: {
        totalReferrals: totalCount,
        activeReferrals: totalActive,
        inactiveReferrals: totalCount - totalActive,
        byGeneration: {
          generation1: {
            total: Number(gen1?.total_count || 0),
            active: Number(gen1?.active_count || 0)
          },
          generation2: {
            total: Number(gen2?.total_count || 0),
            active: Number(gen2?.active_count || 0)
          },
          generation3: {
            total: Number(gen3?.total_count || 0),
            active: Number(gen3?.active_count || 0)
          }
        },
        earnings: {
          total: Number(rewards[0]?.total_earned || 0),
          generation1: Number(rewards[0]?.gen1_earned || 0),
          generation2: Number(rewards[0]?.gen2_earned || 0),
          generation3: Number(rewards[0]?.gen3_earned || 0)
        }
      }
    });
  } catch (error) {
    console.error('[Get Statistics] Error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// GET /referrals-v2/my-code - Get My Referral Code
// ============================================================

/**
 * Get current user's active referral code
 */
referralsV2.get('/my-code', async (c) => {
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
    
    // ✅ Get active referral code
    const { data: referralCode, error } = await supabase
      .from('referral_codes')
      .select('code, created_at, status, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !referralCode) {
      return c.json({
        success: false,
        error: { message: 'No active referral code found' }
      }, 404);
    }
    
    return c.json({
      success: true,
      data: {
        code: referralCode.code,
        createdAt: referralCode.created_at,
        status: referralCode.status,
        shareUrl: `https://uknow.com/signup?ref=${referralCode.code}`
      }
    });
  } catch (error) {
    console.error('[Get My Code] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Health Check
// ============================================================

referralsV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'referrals-v2',
    timestamp: new Date().toISOString()
  });
});

export default referralsV2;
