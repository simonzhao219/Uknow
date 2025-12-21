/**
 * Profile V2 - User Profile Management
 * 
 * Manages user profile data with Supabase Client (Deno compatible)
 * 
 * @module profile_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, handleSupabaseError } from './db.ts';

const profileV2 = new Hono();

// Initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// GET /profile-v2 - Get Current User Profile
// ============================================================

/**
 * Get current user's profile with account status
 */
profileV2.get('/', async (c) => {
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
    
    // ✅ Get user profile using Supabase Client
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, real_name, phone_number, id_number, account_status, point_balance, registration_step, created_at, updated_at')
      .eq('id', user.id)
      .single();
    
    if (profileError) {
      if (profileError.code === 'PGRST116') {
        return c.json({
          success: false,
          error: { message: 'Profile not found' }
        }, 404);
      }
      return c.json(handleSupabaseError(profileError), 500);
    }
    
    // ✅ Get active referral code
    const { data: referralCode } = await supabase
      .from('referral_codes')
      .select('code, created_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single();
    
    // ✅ Get active subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, status, start_date, end_date, grace_period_end')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    return c.json({
      success: true,
      data: {
        id: profile.id,
        email: profile.email,
        realName: profile.real_name,
        phoneNumber: profile.phone_number,
        idNumber: profile.id_number,
        accountStatus: profile.account_status,
        pointBalance: profile.point_balance,
        registrationStep: profile.registration_step,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        referralCode: referralCode?.code || null,
        subscription: subscription ? {
          id: subscription.id,
          status: subscription.status,
          startDate: subscription.start_date,
          endDate: subscription.end_date,
          gracePeriodEnd: subscription.grace_period_end
        } : null
      }
    });
  } catch (error) {
    console.error('[Get Profile] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// PUT /profile-v2 - Update User Profile
// ============================================================

/**
 * Update current user's profile
 */
profileV2.put('/', async (c) => {
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
    
    const { realName, phoneNumber } = await c.req.json();
    
    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    if (realName) updateData.real_name = realName;
    if (phoneNumber) updateData.phone_number = phoneNumber;
    
    // ✅ Update profile using Supabase Client
    const { data: updatedProfile, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.id)
      .select('id, email, real_name, phone_number, account_status, point_balance, updated_at')
      .single();
    
    if (error) {
      return c.json(handleSupabaseError(error), 500);
    }
    
    return c.json({
      success: true,
      data: {
        id: updatedProfile.id,
        email: updatedProfile.email,
        realName: updatedProfile.real_name,
        phoneNumber: updatedProfile.phone_number,
        accountStatus: updatedProfile.account_status,
        pointBalance: updatedProfile.point_balance,
        updatedAt: updatedProfile.updated_at
      }
    });
  } catch (error) {
    console.error('[Update Profile] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Health Check
// ============================================================

profileV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'profile-v2',
    timestamp: new Date().toISOString()
  });
});

export default profileV2;
