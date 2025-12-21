/**
 * Subscriptions V2 - Account Status Management
 * 
 * Manages subscription lifecycle and account status transitions:
 * - Active: Within subscription period, not canceled
 * - Canceled: User canceled but still within period
 * - Grace: Past end date but within 60-day grace period
 * - Fail: Past grace period or canceled + past end date
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module subscriptions_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, sql, handleSupabaseError, handlePostgresError } from './db.ts';
import { 
  calculateSubscriptionStatus,
  syncAccountStatus,
  canPerformSubscriptionActions 
} from './utils/subscriptionStatus.ts';
import {
  addYears,
  addDays,
  formatISODate
} from './utils/dateHelpers.ts';

const subscriptionsV2 = new Hono();

// Initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// GET /subscriptions-v2 - Get Subscription Info
// ============================================================

/**
 * Get current user's subscription information
 * 
 * Returns subscription details with calculated status and remaining days
 */
subscriptionsV2.get('/', async (c) => {
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
    
    // ✅ Get user data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, account_status')
      .eq('id', user.id)
      .single();
    
    if (userError) {
      return c.json(handleSupabaseError(userError), 500);
    }
    
    // ✅ Get subscription data
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (subError) {
      if (subError.code === 'PGRST116') {
        return c.json({
          success: false,
          error: { message: 'No subscription found' }
        }, 404);
      }
      return c.json(handleSupabaseError(subError), 500);
    }
    
    // Calculate status
    const status = calculateSubscriptionStatus({
      endDate: subscription.end_date,
      gracePeriodEnd: subscription.grace_period_end,
      isCanceled: subscription.is_canceled
    });
    
    // Calculate remaining days
    const now = new Date();
    const endDate = new Date(subscription.end_date);
    const gracePeriodEnd = new Date(subscription.grace_period_end);
    
    const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const daysInGracePeriod = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    let daysRemaining = 0;
    let gracePeriodDays = 0;
    
    if (status === 'Active' || status === 'Canceled') {
      daysRemaining = Math.max(0, daysUntilEnd);
    } else if (status === 'Grace') {
      gracePeriodDays = Math.max(0, daysInGracePeriod);
    }
    
    return c.json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          startDate: subscription.start_date,
          endDate: subscription.end_date,
          gracePeriodEnd: subscription.grace_period_end,
          paymentDate: subscription.payment_date,
          amount: Number(subscription.amount),
          isCanceled: subscription.is_canceled,
          canceledAt: subscription.canceled_at
        },
        accountStatus: status,
        daysRemaining,
        gracePeriodDays,
        isRenewable: status === 'Grace' || status === 'Fail'
      }
    });
  } catch (error) {
    console.error('[Get Subscription] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// POST /subscriptions-v2/cancel - Cancel Subscription
// ============================================================

/**
 * Cancel user's subscription
 * 
 * Sets isCanceled flag, status changes when subscription expires
 */
subscriptionsV2.post('/cancel', async (c) => {
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
    
    // ✅ Check if user can cancel (using Supabase Client)
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (!subscription) {
      return c.json({
        success: false,
        error: { message: 'No subscription found' }
      }, 404);
    }
    
    if (subscription.is_canceled) {
      return c.json({
        success: false,
        error: { message: 'Subscription already canceled' }
      }, 400);
    }
    
    // ✅ Cancel subscription (using Transaction for safety)
    try {
      await sql.begin(async (tx) => {
        // Update subscription
        await tx`
          UPDATE subscriptions
          SET 
            is_canceled = true,
            canceled_at = NOW(),
            updated_at = NOW()
          WHERE user_id = ${user.id}
        `;
        
        // Update user account status to Canceled
        await tx`
          UPDATE users
          SET 
            account_status = 'Canceled',
            updated_at = NOW()
          WHERE id = ${user.id}
        `;
      });
      
      console.log(`[Cancel Subscription] ✅ Canceled subscription for user: ${user.id}`);
      
      return c.json({
        success: true,
        data: { message: '訂閱已取消' }
      });
    } catch (txError) {
      return c.json(handlePostgresError(txError), 500);
    }
  } catch (error) {
    console.error('[Cancel Subscription] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// POST /subscriptions-v2/renew - Renew Subscription
// ============================================================

/**
 * Renew subscription (after payment)
 * 
 * Extends subscription by 1 year from current end date or now
 */
subscriptionsV2.post('/renew', async (c) => {
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
    
    const { paymentId, amount } = await c.req.json();
    
    // Validate amount
    if (amount !== 1200) {
      return c.json({
        success: false,
        error: { message: 'Invalid payment amount' }
      }, 400);
    }
    
    // ✅ Get current subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (!subscription) {
      return c.json({
        success: false,
        error: { message: 'No subscription found' }
      }, 404);
    }
    
    // Calculate new dates
    const now = new Date();
    const currentEndDate = new Date(subscription.end_date);
    const newStartDate = currentEndDate > now ? currentEndDate : now;
    const newEndDate = addYears(newStartDate, 1);
    const newGracePeriodEnd = addDays(newEndDate, 60);
    
    // ✅ Renew subscription (using Transaction)
    try {
      await sql.begin(async (tx) => {
        // Update subscription
        await tx`
          UPDATE subscriptions
          SET 
            status = 'Active',
            start_date = ${newStartDate.toISOString()},
            end_date = ${newEndDate.toISOString()},
            grace_period_end = ${newGracePeriodEnd.toISOString()},
            payment_date = NOW(),
            amount = ${amount},
            is_canceled = false,
            canceled_at = NULL,
            updated_at = NOW()
          WHERE user_id = ${user.id}
        `;
        
        // Update user account status
        await tx`
          UPDATE users
          SET 
            account_status = 'Active',
            updated_at = NOW()
          WHERE id = ${user.id}
        `;
        
        // Record payment (if needed)
        await tx`
          INSERT INTO payment_history (user_id, amount, type, payment_id, created_at)
          VALUES (${user.id}, ${amount}, 'subscription_renewal', ${paymentId}, NOW())
        `;
      });
      
      console.log(`[Renew Subscription] ✅ Renewed subscription for user: ${user.id}`);
      
      return c.json({
        success: true,
        data: {
          message: '訂閱已續訂',
          newEndDate: newEndDate.toISOString()
        }
      });
    } catch (txError) {
      return c.json(handlePostgresError(txError), 500);
    }
  } catch (error) {
    console.error('[Renew Subscription] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Health Check
// ============================================================

subscriptionsV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'subscriptions-v2',
    timestamp: new Date().toISOString()
  });
});

export default subscriptionsV2;
