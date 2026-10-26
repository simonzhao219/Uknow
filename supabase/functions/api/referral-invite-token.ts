import type { ReferralInvitePayload } from '../_shared/referral-invite-payload.ts';

export type VerifyReferralInviteTokenResult =
  | { ok: true; payload: ReferralInvitePayload }
  | { ok: false; reason: 'invalid' | 'expired' };

export async function signReferralInviteToken(
  _email: string,
  _code: string,
  _nowMs: number,
  _read: (key: string) => string | undefined = (k) => Deno.env.get(k),
): Promise<string> {
  return await Promise.resolve('');
}

export async function verifyReferralInviteToken(
  _token: string,
  _nowMs: number,
  _read: (key: string) => string | undefined = (k) => Deno.env.get(k),
): Promise<VerifyReferralInviteTokenResult> {
  return await Promise.resolve({ ok: false, reason: 'invalid' });
}
