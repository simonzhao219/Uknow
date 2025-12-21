/**
 * Listings V2 - One Listing Per User
 * 
 * Key changes from V1:
 * - Enforces one listing per user (member-based)
 * - Listing is tied to user, not separate entity
 * - Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module listings_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, sql, handleSupabaseError, handlePostgresError } from './db.ts';

const listingsV2 = new Hono();

// Initialize Supabase Admin Client (for auth verification)
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// GET /listings-v2/my-listing - Get User's Listing
// ============================================================

/**
 * Get current user's listing (only one allowed)
 */
listingsV2.get('/my-listing', async (c) => {
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
    
    // ✅ Get user's listing using Supabase Client
    const { data: listing, error } = await supabase
      .from('listings')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return c.json({
          success: false,
          error: { message: 'No listing found' }
        }, 404);
      }
      return c.json(handleSupabaseError(error), 500);
    }
    
    return c.json({
      success: true,
      data: {
        id: listing.id,
        userId: listing.user_id,
        category: listing.category,
        city: listing.city,
        district: listing.district,
        serviceDescription: listing.service_description,
        contactLine: listing.contact_line,
        contactPhone: listing.contact_phone,
        contactWechat: listing.contact_wechat,
        gender: listing.gender,
        photos: listing.photos,
        createdAt: listing.created_at,
        updatedAt: listing.updated_at
      }
    });
  } catch (error) {
    console.error('[Get My Listing] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// POST /listings-v2/create - Create Listing (One Per User)
// ============================================================

/**
 * Create listing for current user
 * Enforces one listing per user constraint
 */
listingsV2.post('/create', async (c) => {
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
    
    // Get request body
    const body = await c.req.json();
    const {
      category,
      city,
      district,
      serviceDescription,
      contactLine,
      contactPhone,
      contactWechat,
      gender,
      photos
    } = body;
    
    // ✅ Check if user already has a listing
    const { data: existingListing } = await supabase
      .from('listings')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (existingListing) {
      return c.json({
        success: false,
        error: { message: 'User already has a listing. Please update existing listing instead.' }
      }, 400);
    }
    
    // ✅ Create new listing
    const { data: listing, error } = await supabase
      .from('listings')
      .insert({
        user_id: user.id,
        category,
        city,
        district,
        service_description: serviceDescription,
        contact_line: contactLine,
        contact_phone: contactPhone,
        contact_wechat: contactWechat,
        gender,
        photos,
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      return c.json(handleSupabaseError(error), 500);
    }
    
    console.log('[Create Listing] ✅ Created listing for user:', user.id);
    
    return c.json({
      success: true,
      data: {
        id: listing.id,
        message: '刊登創建成功'
      }
    });
  } catch (error) {
    console.error('[Create Listing] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// PUT /listings-v2/update - Update Listing
// ============================================================

/**
 * Update user's listing
 */
listingsV2.put('/update', async (c) => {
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
    
    // Get request body
    const body = await c.req.json();
    const {
      category,
      city,
      district,
      serviceDescription,
      contactLine,
      contactPhone,
      contactWechat,
      gender,
      photos
    } = body;
    
    // ✅ Check if listing exists
    const { data: existingListing } = await supabase
      .from('listings')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (!existingListing) {
      return c.json({
        success: false,
        error: { message: 'Listing not found' }
      }, 404);
    }
    
    // ✅ Update listing
    const { data: updatedListing, error } = await supabase
      .from('listings')
      .update({
        category,
        city,
        district,
        service_description: serviceDescription,
        contact_line: contactLine,
        contact_phone: contactPhone,
        contact_wechat: contactWechat,
        gender,
        photos,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select()
      .single();
    
    if (error) {
      return c.json(handleSupabaseError(error), 500);
    }
    
    console.log('[Update Listing] ✅ Updated listing for user:', user.id);
    
    return c.json({
      success: true,
      data: {
        id: updatedListing.id,
        message: '刊登更新成功'
      }
    });
  } catch (error) {
    console.error('[Update Listing] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// DELETE /listings-v2/delete - Delete Listing
// ============================================================

/**
 * Delete user's listing (soft delete by setting is_active = false)
 */
listingsV2.delete('/delete', async (c) => {
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
    
    // ✅ Soft delete listing
    const { error } = await supabase
      .from('listings')
      .update({ is_active: false })
      .eq('user_id', user.id);
    
    if (error) {
      return c.json(handleSupabaseError(error), 500);
    }
    
    console.log('[Delete Listing] ✅ Deleted listing for user:', user.id);
    
    return c.json({
      success: true,
      data: { message: '刊登刪除成功' }
    });
  } catch (error) {
    console.error('[Delete Listing] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// GET /listings-v2/active - Get All Active Listings (Public)
// ============================================================

/**
 * Get all active listings for public display (e.g., HomePage)
 * 
 * This is a PUBLIC endpoint (no authentication required)
 * Returns all listings with is_active = true
 */
listingsV2.get('/active', async (c) => {
  try {
    console.log('[Get Active Listings] Fetching all active listings...');
    
    // ✅ Query all active listings with user information (SSOT via JOIN)
    const { data: listings, error } = await supabase
      .from('listings')
      .select(`
        *,
        user:users!inner(
          id,
          real_name,
          account_status
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      return c.json(handleSupabaseError(error), 500);
    }
    
    console.log(`[Get Active Listings] Found ${listings?.length || 0} active listings`);
    
    // Transform to match frontend expectations
    const transformedListings = (listings || []).map((listing: any) => ({
      id: listing.id,
      name: listing.user.real_name,  // ✅ User's real name (SSOT)
      serviceType: listing.category,
      city: listing.city,
      district: listing.district,
      description: listing.service_description,
      contactLine: listing.contact_line,
      contactPhone: listing.contact_phone,
      contactWechat: listing.contact_wechat,
      gender: listing.gender,
      photos: listing.photos,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
      // Additional metadata
      userId: listing.user.id,
      accountStatus: listing.user.account_status,
      isActive: listing.is_active
    }));
    
    return c.json({
      success: true,
      listings: transformedListings,
      total: transformedListings.length
    });
  } catch (error) {
    console.error('[Get Active Listings] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Failed to fetch listings' }
    }, 500);
  }
});

// ============================================================
// GET /listings-v2/check-limit - Check Listing Limit
// ============================================================

/**
 * Check if user can create a listing (max one per user)
 */
listingsV2.get('/check-limit', async (c) => {
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
    
    // ✅ Check if user has a listing
    const { data: listing } = await supabase
      .from('listings')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    return c.json({
      success: true,
      data: {
        hasListing: !!listing,
        canCreate: !listing
      }
    });
  } catch (error) {
    console.error('[Check Limit] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Health Check
// ============================================================

listingsV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'listings-v2',
    timestamp: new Date().toISOString()
  });
});

export default listingsV2;
