/**
 * Subscription Status Calculation Utilities
 * 
 * This module handles the account status state machine:
 * - Active: Within subscription period, not canceled
 * - Canceled: Canceled but still within period
 * - Grace: Past end date but within 60-day grace period
 * - Fail: Past grace period or canceled + past end date
 * - Pending: Registration not complete
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module subscriptionStatus
 */

import { supabase, sql } from '../db.ts';

export type AccountStatus = 'Active' | 'Canceled' | 'Grace' | 'Fail' | 'Pending';

/**
 * Calculate subscription status based on dates and cancellation state
 * 
 * @param subscription - Subscription object with dates and cancellation info
 * @returns {AccountStatus} Current account status
 */
export function calculateSubscriptionStatus(subscription: {
  endDate: Date | string;
  gracePeriodEnd: Date | string;
  isCanceled: boolean;
}): AccountStatus {
  const now = new Date();
  const endDate = new Date(subscription.endDate);
  const gracePeriodEnd = new Date(subscription.gracePeriodEnd);
  
  if (subscription.isCanceled) {
    // User has canceled subscription
    if (now <= endDate) {
      return 'Canceled';  // Still within paid period
    } else {
      return 'Fail';      // Past paid period, permanently failed
    }
  } else {
    // User has not canceled subscription
    if (now <= endDate) {
      return 'Active';    // Within subscription period
    } else if (now <= gracePeriodEnd) {
      return 'Grace';     // Within 60-day grace period
    } else {
      return 'Fail';      // Past grace period, permanently failed
    }
  }
}

/**
 * Sync user account status with subscription status
 * 
 * @param userId - User ID to sync
 * @returns {Promise<AccountStatus | null>} New account status, or null if no subscription
 */
export async function syncAccountStatus(userId: string): Promise<AccountStatus | null> {
  try {
    // ✅ Get user using Supabase Client
    const { data: user } = await supabase
      .from('users')
      .select('id, account_status')
      .eq('id', userId)
      .single();
    
    if (!user) {
      console.error(`[Status Sync] User not found: ${userId}`);
      return null;
    }
    
    // ✅ Get subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!subscription) {
      console.log(`[Status Sync] No subscription for user: ${userId}`);
      return null;
    }
    
    // Calculate new status
    const newStatus = calculateSubscriptionStatus({
      endDate: subscription.end_date,
      gracePeriodEnd: subscription.grace_period_end,
      isCanceled: subscription.is_canceled
    });
    
    // Update if changed
    if (user.account_status !== newStatus) {
      console.log(`[Status Sync] ${userId}: ${user.account_status} → ${newStatus}`);
      
      // ✅ Use Transaction for consistency
      await sql.begin(async (tx) => {
        // Update user account status
        await tx`
          UPDATE users
          SET 
            account_status = ${newStatus},
            updated_at = NOW()
          WHERE id = ${userId}
        `;
        
        // Update subscription status
        await tx`
          UPDATE subscriptions
          SET 
            status = ${newStatus},
            updated_at = NOW()
          WHERE user_id = ${userId}
        `;
      });
      
      // Handle status-specific actions
      if (newStatus === 'Fail') {
        await handleAccountFail(userId);
      }
    }
    
    return newStatus;
  } catch (error) {
    console.error(`[Status Sync] Error syncing status for ${userId}:`, error);
    return null;
  }
}

/**
 * Handle account entering Fail status
 * 
 * Actions:
 * 1. Deactivate all referral codes
 * 2. Reset point balance to 0
 * 3. Clear task progress
 * 4. Deactivate listing
 * 
 * @param userId - User ID that failed
 */
async function handleAccountFail(userId: string): Promise<void> {
  console.log(`[Account Fail] Handling account fail for user: ${userId}`);
  
  try {
    // ✅ Use Transaction for all operations
    await sql.begin(async (tx) => {
      // 1. Deactivate all referral codes
      await tx`
        UPDATE referral_codes
        SET 
          is_active = false,
          status = 'Inactive',
          inactivated_at = NOW()
        WHERE user_id = ${userId} AND is_active = true
      `;
      
      // 2. Reset point balance
      await tx`
        UPDATE users
        SET point_balance = 0
        WHERE id = ${userId}
      `;
      
      // 3. Clear task progress
      await tx`
        DELETE FROM task_progress
        WHERE user_id = ${userId}
      `;
      
      // 4. Deactivate listing
      await tx`
        UPDATE listings
        SET is_active = false
        WHERE user_id = ${userId}
      `;
      
      // 5. Cancel all pending reward schedules
      await tx`
        UPDATE reward_schedules
        SET 
          status = 'cancelled',
          updated_at = NOW()
        WHERE user_id = ${userId} AND status = 'pending'
      `;
    });
    
    console.log(`[Account Fail] ✅ Completed fail handling for user: ${userId}`);
  } catch (error) {
    console.error(`[Account Fail] Error handling fail for ${userId}:`, error);
    throw error;
  }
}

/**
 * Check if user can perform subscription actions (renew, cancel)
 * 
 * @param userId - User ID to check
 * @returns {Promise<boolean>} True if user can perform actions
 */
export async function canPerformSubscriptionActions(userId: string): Promise<boolean> {
  try {
    // ✅ Get user account status
    const { data: user } = await supabase
      .from('users')
      .select('account_status')
      .eq('id', userId)
      .single();
    
    if (!user) {
      return false;
    }
    
    // Only Active, Canceled, and Grace can perform actions
    return ['Active', 'Canceled', 'Grace'].includes(user.account_status);
  } catch (error) {
    console.error(`[Can Perform Actions] Error checking for ${userId}:`, error);
    return false;
  }
}

/**
 * Sync all user account statuses (cron job)
 * 
 * @returns {Promise<number>} Number of users synced
 */
export async function syncAllAccountStatuses(): Promise<number> {
  try {
    console.log('[Sync All] Starting account status sync for all users...');
    
    // ✅ Get all users with active subscriptions
    const users = await sql<Array<{ id: string }>>`
      SELECT DISTINCT u.id
      FROM users u
      INNER JOIN subscriptions s ON u.id = s.user_id
      WHERE u.account_status IN ('Active', 'Canceled', 'Grace')
    `;
    
    console.log(`[Sync All] Found ${users.length} users to sync`);
    
    let syncedCount = 0;
    
    // Sync each user
    for (const user of users) {
      const newStatus = await syncAccountStatus(user.id);
      if (newStatus) {
        syncedCount++;
      }
    }
    
    console.log(`[Sync All] ✅ Synced ${syncedCount}/${users.length} users`);
    return syncedCount;
  } catch (error) {
    console.error('[Sync All] Error:', error);
    return 0;
  }
}
