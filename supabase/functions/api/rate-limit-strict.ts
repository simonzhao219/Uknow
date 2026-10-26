// 紅燈 stub：只求型別過，行為留空（見 rate-limit-strict.test.ts）。
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type StrictRateLimitResult = 'allowed' | 'limited' | 'error';

export async function rateLimitStrict(
  _sb: SupabaseClient,
  _key: string,
  _max: number,
  _windowSeconds: number,
): Promise<StrictRateLimitResult> {
  return await Promise.resolve('allowed');
}

export async function refundRateLimit(_sb: SupabaseClient, _key: string): Promise<void> {
  await Promise.resolve();
}
