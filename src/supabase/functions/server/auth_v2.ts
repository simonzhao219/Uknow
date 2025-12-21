/**
 * Authentication V2 - New Registration Flow (4 Steps + Payment)
 * 
 * Flow:
 * Step 0: Email Check (pre-validation)
 * Step 1: Account Creation (send verification email)
 * Step 2: Profile Completion (real name, ID, phone, referral code)
 * Step 3: Payment (annual fee $1,200) → Activate subscription
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module auth_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, sql, handleSupabaseError, handlePostgresError } from './db.ts';
import { generateReferralCode } from './utils/referralCode.ts';

const authV2 = new Hono();

// Initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Validate referral code format: 3 lowercase letters + 6 digits
 */
function validateReferralCode(code: string): boolean {
  const pattern = /^[a-z]{3}\d{6}$/;
  return pattern.test(code);
}

/**
 * Calculate subscription end date (1 year from start)
 */
function calculateSubscriptionEndDate(startDate: Date): Date {
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);
  return endDate;
}

/**
 * Calculate grace period end date (60 days after subscription end)
 */
function calculateGracePeriodEndDate(subscriptionEndDate: Date): Date {
  const graceEnd = new Date(subscriptionEndDate);
  graceEnd.setDate(graceEnd.getDate() + 60);
  return graceEnd;
}

/**
 * Calculate reward schedule date for a specific month
 */
function calculateRewardScheduleDate(paymentDate: Date, monthNumber: number): Date {
  const scheduleDate = new Date(paymentDate);
  scheduleDate.setMonth(scheduleDate.getMonth() + monthNumber);
  scheduleDate.setHours(0, 0, 0, 0);
  return scheduleDate;
}

// ============================================================
// Step 0: Email Check (Pre-validation)
// ============================================================

/**
 * POST /auth-v2/check-email
 * 
 * Check if email is already registered
 */
authV2.post('/check-email', async (c) => {
  try {
    const { email } = await c.req.json();
    
    if (!email) {
      return c.json({
        success: false,
        error: { message: 'Email 是必填欄位' }
      }, 400);
    }
    
    // ✅ Check if email exists using Supabase Client
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingUser) {
      return c.json({
        success: true,
        data: {
          exists: true,
          message: '此 Email 已被註冊，請使用其他 Email 或直接登入'
        }
      });
    }
    
    return c.json({
      success: true,
      data: {
        exists: false,
        message: 'Email 可以使用'
      }
    });
  } catch (error) {
    console.error('[Check Email] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Step 1: Account Creation
// ============================================================

/**
 * POST /auth-v2/signup/step1
 * 
 * Create account and send verification email
 */
authV2.post('/signup/step1', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return c.json({
        success: false,
        error: { message: 'Email 和密碼都是必填欄位' }
      }, 400);
    }
    
    const supabaseAdmin = getSupabaseAdmin();
    
    // ✅ Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Require email verification
      user_metadata: {
        registration_step: 1,
        account_status: 'Pending'
      }
    });
    
    if (authError) {
      console.error('[Step 1] Auth error:', authError);
      return c.json({
        success: false,
        error: { message: authError.message }
      }, 400);
    }
    
    // ✅ Create user profile in database
    const { error: dbError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        account_status: 'Pending',
        registration_step: 1,
        point_balance: 0,
        email_verified: false
      });
    
    if (dbError) {
      console.error('[Step 1] Database error:', dbError);
      // Cleanup: delete auth user if database insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return c.json(handleSupabaseError(dbError), 500);
    }
    
    console.log('[Step 1] ✅ User created:', authData.user.id);
    
    return c.json({
      success: true,
      data: {
        userId: authData.user.id,
        email,
        message: '帳號已創建，請檢查您的信箱以驗證 Email'
      }
    });
  } catch (error) {
    console.error('[Step 1] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Email Verification
// ============================================================

/**
 * POST /auth-v2/verify-email
 * 
 * Verify email address
 */
authV2.post('/verify-email', async (c) => {
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
    
    // ✅ Update user profile
    const { error } = await supabase
      .from('users')
      .update({ email_verified: true })
      .eq('id', user.id);
    
    if (error) {
      return c.json(handleSupabaseError(error), 500);
    }
    
    console.log('[Verify Email] ✅ Email verified for user:', user.id);
    
    return c.json({
      success: true,
      data: { message: 'Email 驗證成功' }
    });
  } catch (error) {
    console.error('[Verify Email] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Verify Referral Code
// ============================================================

/**
 * POST /auth-v2/verify-referral-code
 * 
 * Verify if referral code is valid and active
 */
authV2.post('/verify-referral-code', async (c) => {
  try {
    const { code } = await c.req.json();
    
    if (!code) {
      return c.json({
        success: false,
        error: { message: '推薦碼是必填欄位' }
      }, 400);
    }
    
    // Validate format
    if (!validateReferralCode(code)) {
      return c.json({
        success: false,
        error: { message: '推薦碼格式不正確（應為3個小寫英文字母+6個數字）' }
      }, 400);
    }
    
    // ✅ Check if code exists and is active
    const { data: referralCode, error } = await supabase
      .from('referral_codes')
      .select(`
        id,
        code,
        is_active,
        user:users!inner(real_name)
      `)
      .eq('code', code)
      .eq('is_active', true)
      .single();
    
    if (error || !referralCode) {
      return c.json({
        success: false,
        error: { message: '推薦碼無效或已失效' }
      }, 400);
    }
    
    return c.json({
      success: true,
      data: {
        code: referralCode.code,
        referrerName: referralCode.user.real_name,
        message: '推薦碼驗證成功'
      }
    });
  } catch (error) {
    console.error('[Verify Referral Code] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Step 2: Profile Completion
// ============================================================

/**
 * POST /auth-v2/signup/step2
 * 
 * Complete user profile (real name, ID, phone)
 */
authV2.post('/signup/step2', async (c) => {
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
    
    const { realName, idNumber, phoneNumber } = await c.req.json();
    
    if (!realName || !idNumber || !phoneNumber) {
      return c.json({
        success: false,
        error: { message: '真實姓名、身分證字號和手機號碼都是必填欄位' }
      }, 400);
    }
    
    // ✅ Update user profile
    const { error } = await supabase
      .from('users')
      .update({
        real_name: realName,
        id_number: idNumber,
        phone_number: phoneNumber,
        registration_step: 2,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    if (error) {
      return c.json(handleSupabaseError(error), 500);
    }
    
    console.log('[Step 2] ✅ Profile completed for user:', user.id);
    
    return c.json({
      success: true,
      data: {
        message: '資料填寫完成',
        nextStep: 3
      }
    });
  } catch (error) {
    console.error('[Step 2] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Step 3: Payment and Activation (Most Complex)
// ============================================================

/**
 * POST /auth-v2/signup/step3
 * 
 * Process payment and activate subscription
 * 
 * This is the most complex transaction:
 * 1. Create subscription
 * 2. Generate referral code
 * 3. Update user status
 * 4. Create referral relationships (up to 3 generations)
 * 5. Create reward schedules (12 months per generation)
 * 6. Issue first month rewards
 */
authV2.post('/signup/step3', async (c) => {
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
    
    const { paymentTransactionId, referralCode } = await c.req.json();
    
    if (!paymentTransactionId) {
      return c.json({
        success: false,
        error: { message: '缺少支付交易ID' }
      }, 400);
    }
    
    // TODO: Verify payment with Newebpay API
    console.log('[Step 3] Payment verification (mock):', paymentTransactionId);
    
    // ✅ Get user profile
    const { data: userProfile } = await supabase
      .from('users')
      .select('registration_step, real_name')
      .eq('id', user.id)
      .single();
    
    if (!userProfile || userProfile.registration_step < 2) {
      return c.json({
        success: false,
        error: { message: '請先完成資料填寫' }
      }, 400);
    }
    
    // ✅ Use Postgres SQL Transaction for atomicity
    try {
      const result = await sql.begin(async (tx) => {
        const now = new Date();
        const startDate = now;
        const endDate = calculateSubscriptionEndDate(startDate);
        const gracePeriodEnd = calculateGracePeriodEndDate(endDate);
        
        // 1. Create subscription
        await tx`
          INSERT INTO subscriptions (
            user_id, status, start_date, end_date, grace_period_end,
            payment_date, amount, payment_transaction_id, is_canceled
          ) VALUES (
            ${user.id}, 'Active', ${startDate.toISOString()}, 
            ${endDate.toISOString()}, ${gracePeriodEnd.toISOString()},
            ${now.toISOString()}, 1200, ${paymentTransactionId}, false
          )
        `;
        
        console.log('[Step 3] ✅ Subscription created');
        
        // 2. Generate unique referral code
        let newReferralCode: string;
        let codeExists = true;
        
        while (codeExists) {
          newReferralCode = generateReferralCode();
          const existing = await tx<Array<{ id: string }>>`
            SELECT id FROM referral_codes WHERE code = ${newReferralCode}
          `;
          codeExists = existing.length > 0;
        }
        
        const referralCodeResult = await tx<Array<{ id: string }>>`
          INSERT INTO referral_codes (user_id, code, status, is_active)
          VALUES (${user.id}, ${newReferralCode!}, 'Active', true)
          RETURNING id
        `;
        
        const referralCodeId = referralCodeResult[0].id;
        
        console.log('[Step 3] ✅ Referral code generated:', newReferralCode);
        
        // 3. Update user profile
        await tx`
          UPDATE users
          SET 
            account_status = 'Active',
            registration_step = 3,
            active_referral_code_id = ${referralCodeId},
            updated_at = NOW()
          WHERE id = ${user.id}
        `;
        
        console.log('[Step 3] ✅ User activated');
        
        // 4. Handle referral relationship (if provided)
        if (referralCode) {
          // Get referrer code info
          const referrerCodeResult = await tx<Array<{
            id: string;
            user_id: string;
            is_active: boolean;
          }>>`
            SELECT id, user_id, is_active
            FROM referral_codes
            WHERE code = ${referralCode}
          `;
          
          if (referrerCodeResult.length > 0 && referrerCodeResult[0].is_active) {
            const referrerCodeData = referrerCodeResult[0];
            
            // === Generation 1: Direct Referrer ===
            
            // Create referral relationship
            await tx`
              INSERT INTO referral_relationships (
                referrer_id, referee_id, referral_code_id, generation, is_active
              ) VALUES (
                ${referrerCodeData.user_id}, ${user.id}, ${referrerCodeData.id}, 1, true
              )
            `;
            
            console.log('[Step 3] ✅ Direct referral relationship created (Gen 1)');
            
            // Create 12-month reward schedules for Gen 1
            for (let month = 1; month <= 12; month++) {
              const scheduledDate = calculateRewardScheduleDate(now, month);
              const status = month === 1 ? 'completed' : 'pending';
              
              await tx`
                INSERT INTO reward_schedules (
                  user_id, referee_id, generation, month_number, amount,
                  scheduled_date, status
                ) VALUES (
                  ${referrerCodeData.user_id}, ${user.id}, 1, ${month}, 10,
                  ${scheduledDate.toISOString()}, ${status}
                )
              `;
            }
            
            console.log('[Step 3] ✅ Reward schedules created (Gen 1)');
            
            // Issue first month reward immediately
            await tx`
              UPDATE users
              SET point_balance = point_balance + 10
              WHERE id = ${referrerCodeData.user_id}
            `;
            
            await tx`
              INSERT INTO reward_history (
                user_id, amount, type, description, created_at
              ) VALUES (
                ${referrerCodeData.user_id}, 10, 'referral_gen1_month1',
                ${`推薦獎勵 - ${userProfile.real_name}（第1代）- 第1個月`},
                NOW()
              )
            `;
            
            console.log('[Step 3] ✅ First month reward issued (Gen 1)');
            
            // === Generation 2: Check if Gen 1 referrer has a referrer ===
            
            const gen1ReferrerRelationship = await tx<Array<{
              referrer_id: string;
            }>>`
              SELECT referrer_id
              FROM referral_relationships
              WHERE referee_id = ${referrerCodeData.user_id}
                AND generation = 1
                AND is_active = true
              LIMIT 1
            `;
            
            if (gen1ReferrerRelationship.length > 0) {
              const gen2ReferrerId = gen1ReferrerRelationship[0].referrer_id;
              
              // Create Gen 2 relationship
              await tx`
                INSERT INTO referral_relationships (
                  referrer_id, referee_id, referral_code_id, generation, is_active
                ) VALUES (
                  ${gen2ReferrerId}, ${user.id}, ${referrerCodeData.id}, 2, true
                )
              `;
              
              console.log('[Step 3] ✅ Second generation relationship created (Gen 2)');
              
              // Create 12-month reward schedules for Gen 2
              for (let month = 1; month <= 12; month++) {
                const scheduledDate = calculateRewardScheduleDate(now, month);
                const status = month === 1 ? 'completed' : 'pending';
                
                await tx`
                  INSERT INTO reward_schedules (
                    user_id, referee_id, generation, month_number, amount,
                    scheduled_date, status
                  ) VALUES (
                    ${gen2ReferrerId}, ${user.id}, 2, ${month}, 5,
                    ${scheduledDate.toISOString()}, ${status}
                  )
                `;
              }
              
              console.log('[Step 3] ✅ Reward schedules created (Gen 2)');
              
              // Issue first month reward for Gen 2
              await tx`
                UPDATE users
                SET point_balance = point_balance + 5
                WHERE id = ${gen2ReferrerId}
              `;
              
              await tx`
                INSERT INTO reward_history (
                  user_id, amount, type, description, created_at
                ) VALUES (
                  ${gen2ReferrerId}, 5, 'referral_gen2_month1',
                  ${`推薦獎勵 - ${userProfile.real_name}（第2代）- 第1個月`},
                  NOW()
                )
              `;
              
              console.log('[Step 3] ✅ First month reward issued (Gen 2)');
              
              // === Generation 3: Check if Gen 2 referrer has a referrer ===
              
              const gen2ReferrerRelationship = await tx<Array<{
                referrer_id: string;
              }>>`
                SELECT referrer_id
                FROM referral_relationships
                WHERE referee_id = ${gen2ReferrerId}
                  AND generation = 1
                  AND is_active = true
                LIMIT 1
              `;
              
              if (gen2ReferrerRelationship.length > 0) {
                const gen3ReferrerId = gen2ReferrerRelationship[0].referrer_id;
                
                // Create Gen 3 relationship
                await tx`
                  INSERT INTO referral_relationships (
                    referrer_id, referee_id, referral_code_id, generation, is_active
                  ) VALUES (
                    ${gen3ReferrerId}, ${user.id}, ${referrerCodeData.id}, 3, true
                  )
                `;
                
                console.log('[Step 3] ✅ Third generation relationship created (Gen 3)');
                
                // Create 12-month reward schedules for Gen 3
                for (let month = 1; month <= 12; month++) {
                  const scheduledDate = calculateRewardScheduleDate(now, month);
                  const status = month === 1 ? 'completed' : 'pending';
                  
                  await tx`
                    INSERT INTO reward_schedules (
                      user_id, referee_id, generation, month_number, amount,
                      scheduled_date, status
                    ) VALUES (
                      ${gen3ReferrerId}, ${user.id}, 3, ${month}, 2,
                      ${scheduledDate.toISOString()}, ${status}
                    )
                  `;
                }
                
                console.log('[Step 3] ✅ Reward schedules created (Gen 3)');
                
                // Issue first month reward for Gen 3
                await tx`
                  UPDATE users
                  SET point_balance = point_balance + 2
                  WHERE id = ${gen3ReferrerId}
                `;
                
                await tx`
                  INSERT INTO reward_history (
                    user_id, amount, type, description, created_at
                  ) VALUES (
                    ${gen3ReferrerId}, 2, 'referral_gen3_month1',
                    ${`推薦獎勵 - ${userProfile.real_name}（第3代）- 第1個月`},
                    NOW()
                  )
                `;
                
                console.log('[Step 3] ✅ First month reward issued (Gen 3)');
              }
            }
          }
        }
        
        return { success: true, referralCode: newReferralCode! };
      });
      
      console.log('[Step 3] ✅ Transaction completed successfully');
      
      return c.json({
        success: true,
        data: {
          message: '註冊完成！歡迎加入 Uknow',
          referralCode: result.referralCode,
          accountStatus: 'Active'
        }
      });
    } catch (txError) {
      console.error('[Step 3] Transaction error:', txError);
      return c.json(handlePostgresError(txError), 500);
    }
  } catch (error) {
    console.error('[Step 3] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Health Check
// ============================================================

authV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'auth-v2',
    timestamp: new Date().toISOString()
  });
});

export default authV2;
