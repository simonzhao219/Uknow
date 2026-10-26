// ============================================================
// Email 邀請（R2）：POST /referrals/invites 與 POST /auth/invite/accept 的處理函式
// （api/referral-invite.ts）與資格判斷。
//
// 資格三項（業主 Q2-13：已加入推薦計畫且未停權即可）：referral_program_joined、
// suspended_at is null、有 active 推薦碼。任一讀取失敗 fail-closed 回 unavailable
// （503）——讀不到不是「沒資格」，回 403 會叫一位合格推薦人去「加入推薦計畫」。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { checkInviteEligibility } from './referral-invite.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  getActiveReferralCode,
  payForUser,
  withRestTableFailure,
} from './test-helpers.ts';

/** 已付款（有 active 碼）、已加入推薦計畫的推薦人。 */
async function createReferrer(
  client: SupabaseClient,
  opts: { name?: string; joined?: boolean } = {},
): Promise<{ id: string; email: string; code: string; name: string }> {
  const name = opts.name ?? '王小明';
  const user = await createTestUser(client, { name });
  const { error } = await payForUser(client, user.id);
  if (error) throw new Error(`payForUser failed: ${error.message}`);
  if (opts.joined ?? true) {
    await client.from('profiles').update({ referral_program_joined: true }).eq('id', user.id);
  }
  return { ...user, code: await getActiveReferralCode(client, user.id), name };
}

// ------------------------------------------------------------
// 資格 helper
// ------------------------------------------------------------

Deno.test('checkInviteEligibility：已加入、未停權、碼 active → ok 並帶碼與姓名', async () => {
  const client = adminClient();
  const referrer = await createReferrer(client);
  try {
    assertEquals(await checkInviteEligibility(client, referrer.id), {
      ok: true,
      code: referrer.code,
      name: referrer.name,
    });
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('checkInviteEligibility：未加入推薦計畫 → not_joined', async () => {
  const client = adminClient();
  const referrer = await createReferrer(client, { joined: false });
  try {
    assertEquals(await checkInviteEligibility(client, referrer.id), {
      ok: false,
      reason: 'not_joined',
    });
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('checkInviteEligibility：已停權 → restricted（不叫停權者去加入計畫）', async () => {
  const client = adminClient();
  const referrer = await createReferrer(client, { joined: false });
  try {
    await client.from('profiles').update({ suspended_at: new Date().toISOString() }).eq(
      'id',
      referrer.id,
    );
    assertEquals(await checkInviteEligibility(client, referrer.id), {
      ok: false,
      reason: 'restricted',
    });
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('checkInviteEligibility：推薦碼不是 active → restricted', async () => {
  const client = adminClient();
  const referrer = await createReferrer(client);
  try {
    await client.from('referral_codes').update({ status: 'inactive' }).eq('user_id', referrer.id);
    assertEquals(await checkInviteEligibility(client, referrer.id), {
      ok: false,
      reason: 'restricted',
    });
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('checkInviteEligibility：profiles 或 referral_codes 讀取失敗 → unavailable', async () => {
  const client = adminClient();
  const referrer = await createReferrer(client);
  try {
    for (const table of ['profiles', 'referral_codes']) {
      const result = await withRestTableFailure(
        [table],
        () => checkInviteEligibility(adminClient(), referrer.id),
      );
      assertEquals(result, { ok: false, reason: 'unavailable' }, `${table} 讀取失敗`);
    }
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('checkInviteEligibility：查無 profile → unavailable（不是 not_joined）', async () => {
  const result = await checkInviteEligibility(adminClient(), crypto.randomUUID());
  assert(!result.ok);
  assertEquals(result.reason, 'unavailable');
});
