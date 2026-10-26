// 紅燈 stub：只求型別過，行為留空（見 referral-invite.test.ts）。
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type InviteEligibility =
  | { ok: true; code: string; name: string }
  | { ok: false; reason: 'not_joined' | 'restricted' | 'unavailable' };

export async function checkInviteEligibility(
  _sb: SupabaseClient,
  _userId: string,
): Promise<InviteEligibility> {
  return await Promise.resolve({ ok: false, reason: 'unavailable' });
}
