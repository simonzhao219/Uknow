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
import {
  assertShape,
  ReferralInviteAcceptedSchema,
  ReferralInviteErrorResponseSchema,
} from '../_shared/api-contract.ts';
import { checkInviteEligibility } from './referral-invite.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
  withRestTableFailure,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');
Deno.env.set('REFERRAL_EMAIL_INVITE_ENABLED', 'true');
Deno.env.set('REFERRAL_INVITE_SECRET', 'test-referral-invite-secret-0123456789');

const { app, REFERRAL_INVITE_RATE_MAX, REFERRAL_INVITE_DAILY_MAX } = await import('./index.ts');

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

// ------------------------------------------------------------
// POST /referrals/invites（前半：閘門、資格、body、per-user 兩窗）
// ------------------------------------------------------------

function inviteRequest(token: string | null, body: unknown): Promise<Response> {
  return Promise.resolve(app.request('/api/referrals/invites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

async function expectError(res: Response, status: number, code: string): Promise<void> {
  const body = await res.json();
  assertEquals(res.status, status, JSON.stringify(body));
  const parsed = assertShape(ReferralInviteErrorResponseSchema, body, `invites ${status}`);
  assertEquals(parsed.error.code, code);
}

async function expectAccepted(res: Response): Promise<void> {
  const body = await res.json();
  assertEquals(res.status, 202, JSON.stringify(body));
  assertEquals(assertShape(ReferralInviteAcceptedSchema, body, 'invites 202'), { accepted: true });
}

/** 推薦人＋其 access token；收件人用一位已驗證會員（4b 起這條路徑不打 GoTrue）。 */
async function referrerWithToken(
  client: SupabaseClient,
  opts: { name?: string; joined?: boolean } = {},
): Promise<{ id: string; email: string; token: string; bystander: string; cleanup: string[] }> {
  const referrer = await createReferrer(client, opts);
  const bystander = await createTestUser(client, { name: '已驗證會員' });
  return {
    id: referrer.id,
    email: referrer.email,
    token: await getUserAccessToken(client, referrer.email),
    bystander: bystander.email,
    cleanup: [referrer.id, bystander.id],
  };
}

async function rateCount(client: SupabaseClient, key: string): Promise<number | null> {
  const { data } = await client.from('rate_limits').select('count').eq('key', key);
  return data?.[0]?.count ?? null;
}

Deno.test('referrals/invites：未帶 token → 401', async () => {
  const res = await inviteRequest(null, { email: 'x@example.com', consent: true });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('referrals/invites：旗標未開、缺 secret、缺 FRONTEND_URL → 503 disabled', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    for (
      const [key, value] of [
        ['REFERRAL_EMAIL_INVITE_ENABLED', 'false'],
        ['REFERRAL_INVITE_SECRET', ''],
        ['FRONTEND_URL', ''],
      ] as const
    ) {
      const saved = Deno.env.get(key)!;
      Deno.env.set(key, value);
      try {
        await expectError(
          await inviteRequest(r.token, { email: r.bystander, consent: true }),
          503,
          'disabled',
        );
      } finally {
        Deno.env.set(key, saved);
      }
    }
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：未加入推薦計畫 → 403 not_joined', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client, { joined: false });
  try {
    await expectError(
      await inviteRequest(r.token, { email: r.bystander, consent: true }),
      403,
      'not_joined',
    );
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：停權或推薦碼非 active → 403 restricted', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    await client.from('referral_codes').update({ status: 'inactive' }).eq('user_id', r.id);
    await expectError(
      await inviteRequest(r.token, { email: r.bystander, consent: true }),
      403,
      'restricted',
    );
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：資格讀取失敗 → 503 unavailable（不是 403）', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    const res = await withRestTableFailure(
      ['referral_codes'],
      () => inviteRequest(r.token, { email: r.bystander, consent: true }),
    );
    await expectError(res, 503, 'unavailable');
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：推薦人姓名含禁用字樣 → 400 restricted 並寫告警', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client, { name: '王下線' });
  try {
    await expectError(
      await inviteRequest(r.token, { email: r.bystander, consent: true }),
      400,
      'restricted',
    );
    const { data: alerts } = await client.from('system_alerts').select('id')
      .eq('source', 'referral-invite').eq('context->>user_id', r.id);
    assertEquals(alerts?.length, 1);
  } finally {
    await client.from('system_alerts').delete().eq('source', 'referral-invite')
      .eq('context->>user_id', r.id);
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：email 不合文法、超長或型別不對 → 400 invalid_email', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    const bad: unknown[] = [
      '',
      'plainaddress',
      'a@b',
      '"quoted"@example.com',
      'Name <a@example.com>',
      'a,b@example.com',
      'a b@example.com',
      'a@b@example.com',
      `${'a'.repeat(250)}@x.io`,
      123,
      null,
    ];
    for (const email of bad) {
      await expectError(
        await inviteRequest(r.token, { email, consent: true }),
        400,
        'invalid_email',
      );
    }
    await expectError(await inviteRequest(r.token, 'not json'), 400, 'invalid_email');
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：email 等於本人（大小寫、前後空白不同）→ 400 self_invite', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    await expectError(
      await inviteRequest(r.token, { email: `  ${r.email.toUpperCase()} `, consent: true }),
      400,
      'self_invite',
    );
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：consent 不是 true → 400 consent_required', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    for (const consent of [undefined, false, 'true', 1]) {
      await expectError(
        await inviteRequest(r.token, { email: r.bystander, consent }),
        400,
        'consent_required',
      );
    }
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：body 錯誤不扣 per-user 額度', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    await expectError(
      await inviteRequest(r.token, { email: 'nope', consent: true }),
      400,
      'invalid_email',
    );
    assertEquals(await rateCount(client, `referral-invite:${r.id}`), null);
    assertEquals(await rateCount(client, `referral-invite-day:${r.id}`), null);
  } finally {
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：同一推薦人 1 小時第 6 封 → 429 rate_limited_hour，日窗不扣', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    // 收件人大小寫、前後空白不同：正規化後照常受理
    const mixed = `  ${r.bystander.toUpperCase()} `;
    for (let i = 1; i <= REFERRAL_INVITE_RATE_MAX; i++) {
      await expectAccepted(await inviteRequest(r.token, { email: mixed, consent: true }));
    }
    await expectError(
      await inviteRequest(r.token, { email: r.bystander, consent: true }),
      429,
      'rate_limited_hour',
    );
    assertEquals(await rateCount(client, `referral-invite-day:${r.id}`), REFERRAL_INVITE_RATE_MAX);
  } finally {
    await client.from('rate_limits').delete().in('key', [
      `referral-invite:${r.id}`,
      `referral-invite-day:${r.id}`,
    ]);
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referrals/invites：日窗已滿 → 429 rate_limited_day，並退回短窗那一格', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  try {
    await client.from('rate_limits').insert({
      key: `referral-invite-day:${r.id}`,
      count: REFERRAL_INVITE_DAILY_MAX,
    });
    await expectError(
      await inviteRequest(r.token, { email: r.bystander, consent: true }),
      429,
      'rate_limited_day',
    );
    assertEquals(await rateCount(client, `referral-invite:${r.id}`), 0);
  } finally {
    await client.from('rate_limits').delete().in('key', [
      `referral-invite:${r.id}`,
      `referral-invite-day:${r.id}`,
    ]);
    await deleteTestUsers(client, r.cleanup);
  }
});

Deno.test('referral-invite.ts：不 import ./index.ts（依賴只經 deps 注入）', async () => {
  const source = await Deno.readTextFile(new URL('./referral-invite.ts', import.meta.url));
  assert(!/from\s+['"]\.\/index\.ts['"]/.test(source), '反向匯入會把整個 Hono app 拖進來');
});
