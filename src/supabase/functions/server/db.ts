/**
 * Database Access Layer - V2 (Supabase Edge Functions Compatible)
 * 
 * Version: 2.0.0
 * Build Date: 2024-12-21
 * Status: Prisma REMOVED - Using Supabase Client + Postgres SQL
 * 
 * This module provides a unified interface for database operations.
 * 
 * Architecture:
 * - Supabase Client: Simple CRUD, basic JOINs
 * - Postgres SQL: Complex queries, transactions, recursive queries
 * 
 * Why this approach:
 * - Prisma Client does NOT work in Deno/Edge Functions (requires native binaries)
 * - Supabase Client provides type-safe, simple operations
 * - Postgres package provides full SQL control for complex operations
 * 
 * @module db
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.3';

// ============================================================
// Supabase Client (for simple CRUD and basic JOINs)
// ============================================================

/**
 * Supabase Admin Client
 * 
 * Uses SERVICE_ROLE_KEY to bypass Row Level Security (RLS)
 * Use this for admin operations and backend logic
 */
export const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

console.log('[Database] ✅ Supabase Client initialized');

// ============================================================
// Postgres SQL Client (for complex queries and transactions)
// ============================================================

/**
 * Postgres SQL Client
 * 
 * Direct PostgreSQL connection for:
 * - Complex JOIN queries
 * - Transactions (ACID guarantees)
 * - Recursive queries (CTE)
 * - Batch operations
 */
export const sql = postgres(Deno.env.get('DATABASE_URL') || '', {
  max: 10,                    // Max connections in pool
  idle_timeout: 20,           // Close idle connections after 20s
  connect_timeout: 10,        // Connection timeout 10s
  onnotice: () => {},         // Suppress notices
});

console.log('[Database] ✅ Postgres Client initialized');

// ============================================================
// Helper Functions
// ============================================================

/**
 * Handle Supabase errors
 * 
 * @param error - Supabase error object
 * @returns Formatted error response
 */
export function handleSupabaseError(error: any) {
  console.error('[Supabase Error]:', error);
  return {
    success: false,
    error: {
      message: error.message || 'Database operation failed',
      code: error.code,
      details: error.details
    }
  };
}

/**
 * Handle Postgres errors
 * 
 * @param error - Postgres error object
 * @returns Formatted error response
 */
export function handlePostgresError(error: any) {
  console.error('[Postgres Error]:', error);
  return {
    success: false,
    error: {
      message: error.message || 'Database operation failed',
      code: error.code
    }
  };
}

/**
 * Test database connections
 * 
 * @returns {Promise<boolean>} True if both connections work
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    // Test Supabase connection
    const { error: supabaseError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (supabaseError) {
      console.error('[Database Test] Supabase connection failed:', supabaseError);
      return false;
    }
    
    // Test Postgres connection
    await sql`SELECT 1`;
    
    console.log('[Database Test] ✅ All connections successful');
    return true;
  } catch (error) {
    console.error('[Database Test] ❌ Connection test failed:', error);
    return false;
  }
}

/**
 * Close all database connections
 * 
 * Should be called on application shutdown
 */
export async function closeDatabaseConnections(): Promise<void> {
  try {
    await sql.end({ timeout: 5 });
    console.log('[Database] ✅ All connections closed');
  } catch (error) {
    console.error('[Database] ❌ Error closing connections:', error);
  }
}

// ============================================================
// Type Definitions (for TypeScript support)
// ============================================================

/**
 * Database response type
 */
export interface DbResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: string;
  };
}

/**
 * User table type
 */
export interface User {
  id: string;
  email: string;
  realName: string;
  phoneNumber: string;
  referralCode: string;
  referrerId: string | null;
  accountStatus: 'Pending' | 'Active' | 'Canceled' | 'Grace' | 'Fail';
  pointBalance: number;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Listing table type
 */
export interface Listing {
  id: string;
  userId: string;
  category: string;
  city: string;
  district: string;
  serviceDescription: string;
  contactLine: string | null;
  contactPhone: string | null;
  contactWechat: string | null;
  gender: string;
  photos: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Subscription table type
 */
export interface Subscription {
  id: string;
  userId: string;
  status: 'Pending' | 'Active' | 'Canceled' | 'Grace' | 'Fail';
  paidUntil: Date;
  isCanceled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reward schedule table type
 */
export interface RewardSchedule {
  id: string;
  userId: string;
  refereeId: string;
  generation: number;
  monthNumber: number;
  amount: number;
  scheduledDate: Date;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * Reward history table type
 */
export interface RewardHistory {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  createdAt: Date;
}

// ============================================================
// Export default database object (for convenience)
// ============================================================

export const db = {
  supabase,
  sql,
  handleSupabaseError,
  handlePostgresError,
  testDatabaseConnection,
  closeDatabaseConnections
};

export default db;