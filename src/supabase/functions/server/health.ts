/**
 * Health Check Endpoint
 * 
 * Provides detailed health status including:
 * - Environment variables
 * - Database connections
 * - System info
 * 
 * @module health
 */

import { Hono } from 'npm:hono@4.3.11';

const health = new Hono();

/**
 * GET /health
 * 
 * Returns comprehensive health check information
 */
health.get('/', async (c) => {
  const startTime = Date.now();
  
  // Check environment variables
  const envCheck = {
    SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: !!Deno.env.get('SUPABASE_ANON_KEY'),
    DATABASE_URL: !!Deno.env.get('DATABASE_URL'),
    SUPABASE_DB_URL: !!Deno.env.get('SUPABASE_DB_URL'),
  };
  
  // Check which DATABASE_URL variant is set
  const databaseUrlSource = Deno.env.get('DATABASE_URL') 
    ? 'DATABASE_URL' 
    : Deno.env.get('SUPABASE_DB_URL')
    ? 'SUPABASE_DB_URL'
    : 'none';
  
  // Get database URL (masked)
  const rawDbUrl = Deno.env.get('DATABASE_URL') || Deno.env.get('SUPABASE_DB_URL') || '';
  const maskedDbUrl = rawDbUrl ? rawDbUrl.replace(/:[^:@]+@/, ':****@') : 'NOT_SET';
  
  // Test database connections (optional - can be slow)
  let supabaseConnected = false;
  let postgresConnected = false;
  
  try {
    const { supabase, sql } = await import('./db.ts');
    
    // Test Supabase
    const { error: sbError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    supabaseConnected = !sbError;
    
    // Test Postgres (only if DATABASE_URL is set)
    if (databaseUrlSource !== 'none') {
      try {
        await sql`SELECT 1`;
        postgresConnected = true;
      } catch (sqlError) {
        console.error('[Health] Postgres connection test failed:', sqlError);
        postgresConnected = false;
      }
    }
  } catch (dbError) {
    console.error('[Health] Database module import failed:', dbError);
  }
  
  const responseTime = Date.now() - startTime;
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    responseTime: `${responseTime}ms`,
    environment: {
      variables: envCheck,
      databaseUrlSource,
      databaseUrlMasked: maskedDbUrl,
    },
    connections: {
      supabase: supabaseConnected ? 'connected' : 'disconnected',
      postgres: databaseUrlSource === 'none' 
        ? 'not_configured' 
        : postgresConnected 
        ? 'connected' 
        : 'disconnected',
    },
    warnings: [] as string[],
  };
  
  // Add warnings
  if (!envCheck.DATABASE_URL && !envCheck.SUPABASE_DB_URL) {
    health.warnings.push('DATABASE_URL is not set. Postgres SQL client will not work.');
    health.warnings.push('Please set DATABASE_URL in Edge Function secrets.');
  }
  
  if (!supabaseConnected) {
    health.warnings.push('Supabase client connection failed. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  
  if (databaseUrlSource !== 'none' && !postgresConnected) {
    health.warnings.push('Postgres SQL connection failed. Check DATABASE_URL format and credentials.');
  }
  
  // Determine overall status
  const criticalIssues = !envCheck.SUPABASE_URL || !envCheck.SUPABASE_SERVICE_ROLE_KEY;
  health.status = criticalIssues ? 'error' : health.warnings.length > 0 ? 'warning' : 'ok';
  
  return c.json(health, criticalIssues ? 500 : 200);
});

/**
 * GET /health/quick
 * 
 * Quick health check (no database connection test)
 */
health.get('/quick', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Edge Function is running'
  });
});

export default health;
