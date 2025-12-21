/**
 * Withdrawals V2 - Point Withdrawal System
 * 
 * Manages point withdrawal requests
 * - Validates minimum withdrawal amount
 * - Uses transactions to ensure atomicity
 * - Maintains withdrawal history
 * 
 * Uses Supabase Client + Postgres SQL (Deno compatible)
 * 
 * @module withdrawals_v2
 */

import { Hono } from 'npm:hono@4.3.11';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabase, sql, handleSupabaseError, handlePostgresError } from './db.ts';

const withdrawalsV2 = new Hono();

// Constants
const MINIMUM_WITHDRAWAL = 100; // Minimum points to withdraw

// Initialize Supabase Admin Client
const getSupabaseAdmin = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
};

// ============================================================
// POST /withdrawals-v2/request - Request Withdrawal
// ============================================================

/**
 * Request point withdrawal
 * 
 * Validates balance and creates withdrawal request
 * Uses transaction to ensure atomicity
 */
withdrawalsV2.post('/request', async (c) => {
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
    
    const { amount, bankAccount } = await c.req.json();
    
    // Validate amount
    if (!amount || amount < MINIMUM_WITHDRAWAL) {
      return c.json({
        success: false,
        error: { message: `最低提領金額為 ${MINIMUM_WITHDRAWAL} 點` }
      }, 400);
    }
    
    if (!bankAccount || !bankAccount.bankCode || !bankAccount.accountNumber) {
      return c.json({
        success: false,
        error: { message: '銀行帳戶資訊不完整' }
      }, 400);
    }
    
    // ✅ Use transaction for atomicity
    try {
      const result = await sql.begin(async (tx) => {
        // Get and lock user row (FOR UPDATE prevents race conditions)
        const userResult = await tx<Array<{
          id: string;
          point_balance: number;
          account_status: string;
        }>>`
          SELECT id, point_balance, account_status
          FROM users
          WHERE id = ${user.id}
          FOR UPDATE
        `;
        
        if (userResult.length === 0) {
          throw new Error('User not found');
        }
        
        const userData = userResult[0];
        
        // Check account status
        if (userData.account_status !== 'Active' && userData.account_status !== 'Canceled') {
          throw new Error('Account must be Active or Canceled to withdraw');
        }
        
        // Check balance
        if (userData.point_balance < amount) {
          throw new Error(`餘額不足，目前餘額：${userData.point_balance} 點`);
        }
        
        // Deduct points
        await tx`
          UPDATE users
          SET point_balance = point_balance - ${amount}
          WHERE id = ${user.id}
        `;
        
        // Create withdrawal request
        const withdrawalResult = await tx<Array<{ id: string }>>`
          INSERT INTO withdrawal_requests (
            user_id, amount, status, bank_code, account_number, account_name,
            requested_at
          ) VALUES (
            ${user.id}, ${amount}, 'pending',
            ${bankAccount.bankCode}, ${bankAccount.accountNumber}, ${bankAccount.accountName || ''},
            NOW()
          )
          RETURNING id
        `;
        
        return {
          withdrawalId: withdrawalResult[0].id,
          newBalance: userData.point_balance - amount
        };
      });
      
      console.log(`[Request Withdrawal] ✅ Withdrawal requested: ${result.withdrawalId}`);
      
      return c.json({
        success: true,
        data: {
          withdrawalId: result.withdrawalId,
          amount,
          newBalance: result.newBalance,
          status: 'pending',
          message: '提領申請已提交，預計3-5個工作天處理'
        }
      });
    } catch (txError: any) {
      console.error('[Request Withdrawal] Transaction error:', txError);
      return c.json({
        success: false,
        error: { message: txError.message || 'Withdrawal failed' }
      }, 400);
    }
  } catch (error) {
    console.error('[Request Withdrawal] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// GET /withdrawals-v2/history - Get Withdrawal History
// ============================================================

/**
 * Get current user's withdrawal history
 */
withdrawalsV2.get('/history', async (c) => {
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
    
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    
    // ✅ Get withdrawal history
    const history = await sql<Array<{
      id: string;
      amount: number;
      status: string;
      bank_code: string;
      account_number: string;
      requested_at: string;
      processed_at: string | null;
      notes: string | null;
    }>>`
      SELECT 
        id, amount, status, bank_code, account_number,
        requested_at, processed_at, notes
      FROM withdrawal_requests
      WHERE user_id = ${user.id}
      ORDER BY requested_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    // Get total count
    const countResult = await sql<Array<{ count: number }>>`
      SELECT COUNT(*) as count
      FROM withdrawal_requests
      WHERE user_id = ${user.id}
    `;
    
    return c.json({
      success: true,
      data: {
        history: history.map(h => ({
          id: h.id,
          amount: Number(h.amount),
          status: h.status,
          bankAccount: {
            bankCode: h.bank_code,
            accountNumber: h.account_number.replace(/(.{4})/g, '$1 ').trim() // Format account number
          },
          requestedAt: h.requested_at,
          processedAt: h.processed_at,
          notes: h.notes
        })),
        pagination: {
          total: Number(countResult[0]?.count || 0),
          limit,
          offset
        }
      }
    });
  } catch (error) {
    console.error('[Get History] Error:', error);
    return c.json(handlePostgresError(error), 500);
  }
});

// ============================================================
// GET /withdrawals-v2/validate - Validate Withdrawal Amount
// ============================================================

/**
 * Validate if user can withdraw specified amount
 */
withdrawalsV2.get('/validate', async (c) => {
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
    
    const amount = parseInt(c.req.query('amount') || '0');
    
    // ✅ Get user balance and status
    const { data: userData } = await supabase
      .from('users')
      .select('point_balance, account_status')
      .eq('id', user.id)
      .single();
    
    if (!userData) {
      return c.json({
        success: false,
        error: { message: 'User not found' }
      }, 404);
    }
    
    // Validate
    const errors = [];
    
    if (amount < MINIMUM_WITHDRAWAL) {
      errors.push(`最低提領金額為 ${MINIMUM_WITHDRAWAL} 點`);
    }
    
    if (userData.point_balance < amount) {
      errors.push(`餘額不足，目前餘額：${userData.point_balance} 點`);
    }
    
    if (userData.account_status !== 'Active' && userData.account_status !== 'Canceled') {
      errors.push('帳號狀態不符合提領條件');
    }
    
    const isValid = errors.length === 0;
    
    return c.json({
      success: true,
      data: {
        isValid,
        amount,
        currentBalance: userData.point_balance,
        minimumWithdrawal: MINIMUM_WITHDRAWAL,
        errors: isValid ? [] : errors
      }
    });
  } catch (error) {
    console.error('[Validate Withdrawal] Error:', error);
    return c.json({
      success: false,
      error: { message: 'Internal server error' }
    }, 500);
  }
});

// ============================================================
// Health Check
// ============================================================

withdrawalsV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'withdrawals-v2',
    timestamp: new Date().toISOString()
  });
});

export default withdrawalsV2;
