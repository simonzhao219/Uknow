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
import { Hono } from 'npm:hono@4';
import postgres from 'npm:postgres@3';
import {
  assertShape,
  ReferralInviteAcceptedSchema,
  ReferralInviteAcceptErrorResponseSchema,
  ReferralInviteAcceptResponseSchema,
  ReferralInviteErrorResponseSchema,
} from '../_shared/api-contract.ts';
import {
  decodeReferralInvitePayload,
  REFERRAL_INVITE_CONSENT_VERSION,
  REFERRAL_INVITE_TOKEN_TTL_SECONDS,
} from '../_shared/referral-invite-payload.ts';
import {
  checkInviteEligibility,
  createReferralInviteHandlers,
  type ReferralInviteDeps,
} from './referral-invite.ts';
import { signReferralInviteToken } from './referral-invite-token.ts';
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

const {
  app,
  INVITE_ACCEPT_RATE_MAX,
  REFERRAL_INVITE_DAILY_MAX,
  REFERRAL_INVITE_GLOBAL_HOUR_MAX,
  REFERRAL_INVITE_RATE_MAX,
  referralInviteDeps,
} = await import('./index.ts');

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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
): Promise<
  { id: string; email: string; code: string; token: string; bystander: string; cleanup: string[] }
> {
  const referrer = await createReferrer(client, opts);
  const bystander = await createTestUser(client, { name: '已驗證會員' });
  return {
    id: referrer.id,
    email: referrer.email,
    code: referrer.code,
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

// ------------------------------------------------------------
// POST /referrals/invites（後半：lookup、target／全站窗、寄送、GoTrue 對映、對帳、
// 補償、退額度矩陣）
//
// GoTrue 的失敗以 deps 注入的 client 造（withRestTableFailure 只攔 /rest/v1/）：
// 測試自己組 handlers、掛在只有這條路由的 Hono app 上，auth.admin 的指定方法被換掉，
// 其餘（PostgREST、RPC、真 GoTrue）照常。
// ------------------------------------------------------------

type AdminMethod = 'inviteUserByEmail' | 'updateUserById' | 'deleteUser' | 'generateLink';
// deno-lint-ignore no-explicit-any
type AdminCall = (...args: any[]) => Promise<any>;
type AdminOverride = (args: unknown[], original: AdminCall) => Promise<unknown>;

/** 真 client，可攔 auth.admin 的指定方法；calls 記下每次呼叫的參數。 */
function goTrueSpy(overrides: Partial<Record<AdminMethod, AdminOverride>> = {}) {
  const client = adminClient();
  const admin = client.auth.admin as unknown as Record<AdminMethod, AdminCall>;
  const calls: Record<AdminMethod, unknown[][]> = {
    inviteUserByEmail: [],
    updateUserById: [],
    deleteUser: [],
    generateLink: [],
  };
  for (const name of Object.keys(calls) as AdminMethod[]) {
    const original = admin[name].bind(admin);
    admin[name] = (...args: unknown[]) => {
      calls[name].push(args);
      const override = overrides[name];
      return override ? override(args, original) : original(...args);
    };
  }
  return { client, calls };
}

function goTrueError(status: number, code?: string) {
  return {
    data: { user: null },
    error: { name: 'AuthApiError', message: `stub ${code ?? status}`, status, code },
  };
}

function invitesApp(client: SupabaseClient, extra: Partial<ReferralInviteDeps> = {}) {
  const handlers = createReferralInviteHandlers({
    ...referralInviteDeps(),
    sb: () => client,
    ...extra,
  });
  const testApp = new Hono().basePath('/api');
  testApp.post('/referrals/invites', handlers.invites);
  return (token: string, body: unknown) =>
    Promise.resolve(testApp.request('/api/referrals/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function inviteeEmail(tag: string): string {
  return `invitee-${tag}-${crypto.randomUUID()}@example.invalid`;
}

// deno-lint-ignore no-explicit-any
async function authUser(email: string): Promise<any | null> {
  const sql = postgres(DB_URL);
  try {
    const rows = await sql`
      select id, invited_at, confirmation_token, confirmation_sent_at, email_confirmed_at,
             raw_app_meta_data, raw_user_meta_data
      from auth.users where lower(email) = lower(${email})
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end();
  }
}

async function auditRowsMentioning(email: string): Promise<number> {
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from auth.audit_log_entries
      where strpos(lower(payload::text), lower(${email})) > 0
    `;
    return row.n;
  } finally {
    await sql.end();
  }
}

async function inviteKeys(referrerId: string, email: string) {
  return {
    hour: `referral-invite:${referrerId}`,
    day: `referral-invite-day:${referrerId}`,
    target: `referral-invite-target:${await sha256Hex(email)}`,
  };
}

async function referralAlerts(
  client: SupabaseClient,
): Promise<{ context: Record<string, string> }[]> {
  const { data } = await client.from('system_alerts').select('context')
    .eq('source', 'referral-invite');
  return data ?? [];
}

/** 清掉這次測試建的空殼（purge 的 p_email）、限流鍵、告警與推薦人。 */
async function cleanupInvites(
  client: SupabaseClient,
  referrers: { id: string; cleanup: string[] }[],
  emails: string[],
): Promise<void> {
  for (const email of emails) {
    await client.rpc('purge_stale_referral_invites', { p_email: email });
    await client.from('rate_limits').delete()
      .eq('key', `referral-invite-target:${await sha256Hex(email)}`);
  }
  for (const r of referrers) {
    await client.from('rate_limits').delete().in('key', [
      `referral-invite:${r.id}`,
      `referral-invite-day:${r.id}`,
    ]);
    await deleteTestUsers(client, r.cleanup);
  }
  await client.from('system_alerts').delete().eq('source', 'referral-invite');
}

Deno.test('referrals/invites：信箱不存在 → 新建空殼並寄出，metadata 照規格蓋章', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const email = inviteeEmail('new');
  try {
    await expectAccepted(await inviteRequest(r.token, { email, consent: true }));
    const u = await authUser(email);
    assert(u, '應建立帳號');
    assert(u.invited_at, '應已寄出（invited_at 有值）');
    assertEquals(u.email_confirmed_at, null);

    const stamp = u.raw_app_meta_data.referral_invite;
    assertEquals(Object.keys(stamp).sort(), ['code', 'consent_at', 'consent_version', 'issued_at']);
    assertEquals(stamp.code, r.code);
    assertEquals(stamp.consent_version, REFERRAL_INVITE_CONSENT_VERSION);
    assert(!Number.isNaN(Date.parse(stamp.issued_at)));
    assertEquals(stamp.consent_at, stamp.issued_at);

    // 推薦人 uuid 不進被邀請人可讀之處（兩種 metadata 都進對方 JWT，裁決 H）
    assert(!JSON.stringify(u.raw_app_meta_data).includes(r.id));
    assert(!JSON.stringify(u.raw_user_meta_data).includes(r.id));
    // 不寫 referred_by_code：推薦綁定只走落地 pending code → /auth/register
    assertEquals(u.raw_user_meta_data.referred_by_code, undefined);
    assertEquals(u.raw_user_meta_data.referral_invite_name, '王小明');
    const url = new URL(u.raw_user_meta_data.referral_invite_url);
    assertEquals(`${url.origin}${url.pathname}`, 'https://frontend.test/register');
    const payload = decodeReferralInvitePayload(url.searchParams.get('invite')!);
    assertEquals([payload?.e, payload?.c], [email, r.code]);

    const { data: profile } = await client.from('profiles')
      .select('referred_by_user_id, referred_by_code').eq('id', u.id).single();
    assertEquals(profile, { referred_by_user_id: null, referred_by_code: null });
  } finally {
    await cleanupInvites(client, [r], [email]);
  }
});

Deno.test('referrals/invites：已驗證、自助註冊中、非 R2 待驗證 → 202 且不動對方帳號', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const sql = postgres(DB_URL);
  const selfEmail = inviteeEmail('self');
  const dashEmail = inviteeEmail('dashboard');
  const ids: string[] = [];
  try {
    // 自助註冊進行中：未驗證、沒有 referral_invite；confirmation_token 是對方自己的驗證碼
    const { data: selfSignup } = await client.auth.admin.createUser({
      email: selfEmail,
      password: crypto.randomUUID(),
      email_confirm: false,
    });
    ids.push(selfSignup.user!.id);
    await sql`
      update auth.users set confirmation_token = 'self-signup-token',
        confirmation_sent_at = now() - interval '1 minute'
      where id = ${selfSignup.user!.id}
    `;
    // Dashboard 手動 Invite：有 invited_at、沒有 referral_invite
    const { data: dash } = await client.auth.admin.inviteUserByEmail(dashEmail);
    ids.push(dash.user!.id);

    const globalBefore = await rateCount(client, 'referral-invite-global-hour');
    const { client: spied, calls } = goTrueSpy();
    const send = invitesApp(spied);
    for (const email of [r.bystander, selfEmail, dashEmail]) {
      const before = await authUser(email);
      await expectAccepted(await send(r.token, { email, consent: true }));
      assertEquals(await authUser(email), before, `${email} 的帳號不得被動到`);
      assertEquals(await rateCount(client, (await inviteKeys(r.id, email)).target), null);
    }
    assertEquals(calls.inviteUserByEmail.length, 0);
    assertEquals(calls.updateUserById.length, 0);
    assertEquals(await rateCount(client, 'referral-invite-global-hour'), globalBefore);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
    await cleanupInvites(client, [r], []);
  }
});

Deno.test('referrals/invites：同一信箱 24 小時內第二位推薦人 → 202 不寄、target 鍵不退', async () => {
  const client = adminClient();
  const first = await referrerWithToken(client);
  const second = await referrerWithToken(client, { name: '李小華' });
  const email = inviteeEmail('target');
  try {
    await expectAccepted(await inviteRequest(first.token, { email, consent: true }));
    const stampBefore = (await authUser(email)).raw_app_meta_data.referral_invite;

    const { client: spied, calls } = goTrueSpy();
    await expectAccepted(await invitesApp(spied)(second.token, { email, consent: true }));
    assertEquals(calls.inviteUserByEmail.length, 0, '先到者生效，第二位靜默略過');
    assertEquals((await authUser(email)).raw_app_meta_data.referral_invite, stampBefore);
    // limited 的 target 鍵不退：退了會清掉先到者佔住的名額
    assertEquals(await rateCount(client, (await inviteKeys(second.id, email)).target), 2);
  } finally {
    await cleanupInvites(client, [first, second], [email]);
  }
});

Deno.test('referrals/invites：同一信箱並行兩封 → GoTrue 只被呼叫一次、兩者皆 202', async () => {
  const client = adminClient();
  const a = await referrerWithToken(client);
  const b = await referrerWithToken(client, { name: '李小華' });
  const email = inviteeEmail('race');
  try {
    const { client: spied, calls } = goTrueSpy();
    const send = invitesApp(spied);
    const [ra, rb] = await Promise.all([
      send(a.token, { email, consent: true }),
      send(b.token, { email, consent: true }),
    ]);
    await expectAccepted(ra);
    await expectAccepted(rb);
    assertEquals(calls.inviteUserByEmail.length, 1);
  } finally {
    await cleanupInvites(client, [a, b], [email]);
  }
});

Deno.test('referrals/invites：全站小時窗已滿 → 503，退 target 與 per-user、全站不退', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const email = inviteeEmail('global');
  const { data: saved } = await client.from('rate_limits').select('*')
    .eq('key', 'referral-invite-global-hour');
  try {
    await client.from('rate_limits').upsert({
      key: 'referral-invite-global-hour',
      count: REFERRAL_INVITE_GLOBAL_HOUR_MAX,
      window_start: new Date().toISOString(),
    });
    const { client: spied, calls } = goTrueSpy();
    await expectError(
      await invitesApp(spied)(r.token, { email, consent: true }),
      503,
      'unavailable',
    );
    assertEquals(calls.inviteUserByEmail.length, 0);
    const keys = await inviteKeys(r.id, email);
    assertEquals(await rateCount(client, keys.target), 0);
    assertEquals(await rateCount(client, keys.hour), 0);
    assertEquals(await rateCount(client, keys.day), 0);
    assertEquals(
      await rateCount(client, 'referral-invite-global-hour'),
      REFERRAL_INVITE_GLOBAL_HOUR_MAX + 1,
    );
  } finally {
    await client.from('rate_limits').delete().eq('key', 'referral-invite-global-hour');
    if (saved?.length) await client.from('rate_limits').insert(saved);
    await cleanupInvites(client, [r], [email]);
  }
});

Deno.test('referrals/invites：target 限流 RPC 失敗 → 503 unavailable、不寄（不可 fail-open）', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const email = inviteeEmail('strict-error');
  try {
    // per-user 兩窗 fail-open（放行）；target 是 strict，RPC 出錯 → 503
    const res = await withRestTableFailure(
      ['rpc/bump_rate_limit'],
      () => invitesApp(goTrueSpy().client)(r.token, { email, consent: true }),
    );
    await expectError(res, 503, 'unavailable');
    assertEquals(await authUser(email), null);
  } finally {
    await cleanupInvites(client, [r], [email]);
  }
});

Deno.test('referrals/invites：GoTrue 錯誤依 error_code 對映回應、退額度與告警', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const emails: string[] = [];
  // [GoTrue 狀態, error_code, 預期狀態, 預期 code（null＝202）, 退額度, 告警]
  const table: [number, string | undefined, number, string | null, boolean, boolean][] = [
    [422, 'email_exists', 202, null, true, false],
    [429, 'over_email_send_rate_limit', 503, 'unavailable', true, true],
    [400, 'email_address_invalid', 400, 'invalid_email', true, false],
    [422, 'validation_failed', 400, 'invalid_email', true, false],
    [400, 'email_address_not_authorized', 503, 'unavailable', false, true],
    [403, undefined, 503, 'unavailable', false, true],
  ];
  try {
    for (const [gtStatus, gtCode, status, code, refunded, alerted] of table) {
      const label = `${gtStatus} ${gtCode ?? ''}`;
      const email = inviteeEmail('map');
      emails.push(email);
      await client.from('system_alerts').delete().eq('source', 'referral-invite');
      await client.from('rate_limits').delete().in('key', [
        `referral-invite:${r.id}`,
        `referral-invite-day:${r.id}`,
      ]);
      const { client: spied } = goTrueSpy({
        inviteUserByEmail: () => Promise.resolve(goTrueError(gtStatus, gtCode)),
      });
      const res = await invitesApp(spied)(r.token, { email, consent: true });
      if (code === null) await expectAccepted(res);
      else await expectError(res, status, code);

      const keys = await inviteKeys(r.id, email);
      const expected = refunded ? 0 : 1;
      assertEquals(await rateCount(client, keys.target), expected, `${label} target`);
      assertEquals(await rateCount(client, keys.hour), expected, `${label} 短窗`);
      assertEquals(await rateCount(client, keys.day), expected, `${label} 日窗`);
      const alerts = await referralAlerts(client);
      assertEquals(alerts.length > 0, alerted, `${label} 告警`);
      assert(!JSON.stringify(alerts).includes(email), `${label} 告警不得含 email`);
    }
  } finally {
    await cleanupInvites(client, [r], emails);
  }
});

Deno.test('referrals/invites：GoTrue 5xx 但其實已建帳寄出 → 對帳後補蓋章、202、不退', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const email = inviteeEmail('uncertain-sent');
  try {
    const { client: spied } = goTrueSpy({
      // 交易已提交、信已寄，回應卻在路上丟了
      inviteUserByEmail: async (args, original) => {
        await original(...args);
        return goTrueError(502);
      },
    });
    await expectAccepted(await invitesApp(spied)(r.token, { email, consent: true }));
    assertEquals((await authUser(email)).raw_app_meta_data.referral_invite?.code, r.code);
    assertEquals(await rateCount(client, (await inviteKeys(r.id, email)).target), 1);
  } finally {
    await cleanupInvites(client, [r], [email]);
  }
});

Deno.test('referrals/invites：GoTrue 逾時且查無帳號 → 判定未寄，503、退額度、告警', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const email = inviteeEmail('uncertain-none');
  try {
    const { client: spied } = goTrueSpy({ inviteUserByEmail: () => new Promise(() => {}) });
    await expectError(
      await invitesApp(spied, { gotrueTimeoutMs: 50 })(r.token, { email, consent: true }),
      503,
      'unavailable',
    );
    const keys = await inviteKeys(r.id, email);
    assertEquals(await rateCount(client, keys.target), 0);
    assertEquals(await rateCount(client, keys.hour), 0);
    assert((await referralAlerts(client)).length > 0);
  } finally {
    await cleanupInvites(client, [r], [email]);
  }
});

Deno.test('referrals/invites：新建後蓋章失敗 → 刪帳號與稽核列、退 target、503', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const email = inviteeEmail('compensate');
  try {
    const { client: spied, calls } = goTrueSpy({
      updateUserById: () => Promise.resolve(goTrueError(500, 'unexpected_failure')),
    });
    await expectError(
      await invitesApp(spied)(r.token, { email, consent: true }),
      503,
      'unavailable',
    );
    assertEquals(calls.deleteUser.length, 1);
    assertEquals(await authUser(email), null, '沒蓋章的帳號不是 R2 空殼，要刪掉');
    assertEquals(await auditRowsMentioning(email), 0, '補償也要清 GoTrue 稽核列');
    const keys = await inviteKeys(r.id, email);
    assertEquals(await rateCount(client, keys.target), 0, '補償退 target');
    assertEquals(await rateCount(client, keys.hour), 1, '信多半已寄出，per-user 不退');
  } finally {
    await cleanupInvites(client, [r], [email]);
  }
});

Deno.test('referrals/invites：補償的 deleteUser 也失敗 → 另寫一筆告警', async () => {
  const client = adminClient();
  const r = await referrerWithToken(client);
  const email = inviteeEmail('compensate-fail');
  try {
    const { client: spied } = goTrueSpy({
      updateUserById: () => Promise.resolve(goTrueError(500, 'unexpected_failure')),
      deleteUser: () => Promise.resolve(goTrueError(500, 'unexpected_failure')),
    });
    await expectError(
      await invitesApp(spied)(r.token, { email, consent: true }),
      503,
      'unavailable',
    );
    const kinds = (await referralAlerts(client)).map((a) => a.context.kind);
    assert(kinds.includes('stamp_failed'), JSON.stringify(kinds));
    assert(kinds.includes('compensate_delete_failed'), JSON.stringify(kinds));
  } finally {
    // 帳號沒刪成：清掉（GoTrue 沒蓋章，purge 的 p_email 認不得它）
    const u = await authUser(email);
    if (u) await client.auth.admin.deleteUser(u.id);
    await cleanupInvites(client, [r], [email]);
  }
});

Deno.test('referrals/invites：空殼重寄 → 更新 metadata 與 issued_at 後再寄', async () => {
  const client = adminClient();
  const first = await referrerWithToken(client);
  const second = await referrerWithToken(client, { name: '李小華' });
  const email = inviteeEmail('resend');
  try {
    await expectAccepted(await inviteRequest(first.token, { email, consent: true }));
    const before = await authUser(email);
    // 24 小時後：target 窗已過
    await client.from('rate_limits').delete().eq('key', (await inviteKeys(first.id, email)).target);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expectAccepted(await inviteRequest(second.token, { email, consent: true }));
    const after = await authUser(email);
    assertEquals(after.id, before.id, '同一個空殼，不新建');
    assertEquals(after.raw_app_meta_data.referral_invite.code, second.code);
    assert(
      after.raw_app_meta_data.referral_invite.issued_at >
        before.raw_app_meta_data.referral_invite.issued_at,
      '重寄＝新邀請，issued_at 更新',
    );
    assertEquals(after.raw_user_meta_data.referral_invite_name, '李小華');
    assert(after.confirmation_sent_at > before.confirmation_sent_at, '應重寄');
  } finally {
    await cleanupInvites(client, [first, second], [email]);
  }
});

Deno.test('referrals/invites：空殼重寄失敗 → 以舊 referral_invite 回寫、退額度', async () => {
  const client = adminClient();
  const first = await referrerWithToken(client);
  const second = await referrerWithToken(client, { name: '李小華' });
  const email = inviteeEmail('resend-fail');
  try {
    await expectAccepted(await inviteRequest(first.token, { email, consent: true }));
    const before = await authUser(email);
    await client.from('rate_limits').delete().eq('key', (await inviteKeys(first.id, email)).target);

    const { client: spied } = goTrueSpy({
      inviteUserByEmail: () => Promise.resolve(goTrueError(429, 'over_email_send_rate_limit')),
    });
    await expectError(
      await invitesApp(spied)(second.token, { email, consent: true }),
      503,
      'unavailable',
    );
    const after = await authUser(email);
    // 歸屬與完善資料頁的後備預填不能指向一封沒送達的信
    assertEquals(after.raw_app_meta_data.referral_invite, before.raw_app_meta_data.referral_invite);
    assertEquals(await rateCount(client, (await inviteKeys(second.id, email)).target), 0);
  } finally {
    await cleanupInvites(client, [first, second], [email]);
  }
});

// ------------------------------------------------------------
// POST /auth/invite/accept（公開）：持有簽章＝收到信的人
//
// 硬順序：先 updateUserById({ password })、再 generateLink({ type: 'invite' })——沒密碼的
// 被邀請者在 verify 時會被 GoTrue 塞隨機密碼；設密碼又會清掉既有 confirmation_token，
// 反過來會讓剛產生的 hash 失效（最後一個測試是這件事的 GoTrue 升級 canary）。
// ------------------------------------------------------------

const ACCEPT_SECRET_READ = (k: string) => Deno.env.get(k);

function acceptRequest(body: unknown, ip = uniqueAcceptIp()): Promise<Response> {
  return Promise.resolve(app.request('/api/auth/invite/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

function acceptApp(client: SupabaseClient, extra: Partial<ReferralInviteDeps> = {}) {
  const handlers = createReferralInviteHandlers({
    ...referralInviteDeps(),
    sb: () => client,
    ...extra,
  });
  const testApp = new Hono().basePath('/api');
  testApp.post('/auth/invite/accept', handlers.accept);
  return (body: unknown) =>
    Promise.resolve(testApp.request('/api/auth/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': uniqueAcceptIp() },
      body: JSON.stringify(body),
    }));
}

function uniqueAcceptIp(): string {
  const b = new Uint8Array(2);
  crypto.getRandomValues(b);
  return `198.51.${b[0]}.${b[1]}`;
}

async function expectAcceptError(res: Response, status: number, code: string): Promise<string> {
  const body = await res.json();
  assertEquals(res.status, status, JSON.stringify(body));
  const parsed = assertShape(ReferralInviteAcceptErrorResponseSchema, body, `accept ${status}`);
  assertEquals(parsed.error.code, code);
  return parsed.error.message;
}

async function expectTokenHash(res: Response): Promise<string> {
  const body = await res.json();
  assertEquals(res.status, 200, JSON.stringify(body));
  return assertShape(ReferralInviteAcceptResponseSchema, body, 'accept 200').tokenHash;
}

/** 推薦人寄出一封真的邀請，回傳被邀請人 email 與信中連結的 token。 */
async function invitedShell(
  client: SupabaseClient,
): Promise<
  { referrer: Awaited<ReturnType<typeof referrerWithToken>>; email: string; token: string }
> {
  const referrer = await referrerWithToken(client);
  const email = inviteeEmail('accept');
  await expectAccepted(await inviteRequest(referrer.token, { email, consent: true }));
  const url = new URL((await authUser(email)).raw_user_meta_data.referral_invite_url);
  return { referrer, email, token: url.searchParams.get('invite')! };
}

/** 丟棄式 client 做被邀請人那一側的 verifyOtp／登入，不污染 admin client。 */
async function verifyInvite(tokenHash: string) {
  return await adminClient().auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  const { data, error } = await adminClient().auth.signInWithPassword({ email, password });
  return !error && Boolean(data.session);
}

Deno.test('auth/invite/accept：設密碼並回 tokenHash，verifyOtp 後以該密碼可登入', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const tokenHash = await expectTokenHash(
      await acceptRequest({ token, password: 'Invite-Pass-123' }),
    );
    const { data, error } = await verifyInvite(tokenHash);
    assertEquals(error, null);
    assert(data.session, 'verifyOtp 應回 session');
    const u = await authUser(email);
    assert(u.email_confirmed_at, '應已驗證');
    // 連結用過即從 user_metadata 拿掉（模板只在重寄時才需要它）
    assertEquals(u.raw_user_meta_data.referral_invite_url, undefined);
    assert(await canSignIn(email, 'Invite-Pass-123'), '以 accept 設的密碼應能登入');
  } finally {
    const u = await authUser(email);
    if (u) await client.auth.admin.deleteUser(u.id);
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：同一 token 再打一次 → 重設同一密碼、換新 hash（可重入）', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const first = await expectTokenHash(
      await acceptRequest({ token, password: 'Invite-Pass-123' }),
    );
    const second = await expectTokenHash(
      await acceptRequest({ token, password: 'Invite-Pass-123' }),
    );
    assert(first !== second, '每次換新 hash');
    const { error } = await verifyInvite(second);
    assertEquals(error, null);
    assert(await canSignIn(email, 'Invite-Pass-123'));
  } finally {
    const u = await authUser(email);
    if (u) await client.auth.admin.deleteUser(u.id);
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：簽章不符或格式壞 → 400 invalid_token；過期 → 400 expired', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const [payload, sig] = token.split('.');
    const forgedSig = `${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`;
    for (const bad of [`${payload}.${forgedSig}`, 'garbage', '', 123]) {
      await expectAcceptError(
        await acceptRequest({ token: bad, password: 'Invite-Pass-123' }),
        400,
        'invalid_token',
      );
    }
    const expired = await signReferralInviteToken(
      email,
      referrer.code,
      Date.now() - (REFERRAL_INVITE_TOKEN_TTL_SECONDS + 60) * 1000,
      ACCEPT_SECRET_READ,
    );
    await expectAcceptError(
      await acceptRequest({ token: expired, password: 'Invite-Pass-123' }),
      400,
      'expired',
    );
    assertEquals((await authUser(email)).email_confirmed_at, null, '失敗的 accept 不動帳號');
  } finally {
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：帳號不存在或不是 R2 空殼 → 410 gone', async () => {
  const client = adminClient();
  const selfEmail = inviteeEmail('accept-self');
  const goneEmail = inviteeEmail('accept-gone');
  const { data: selfSignup } = await client.auth.admin.createUser({
    email: selfEmail,
    password: crypto.randomUUID(),
    email_confirm: false,
  });
  try {
    for (const email of [goneEmail, selfEmail]) {
      const token = await signReferralInviteToken(email, '8048876', Date.now(), ACCEPT_SECRET_READ);
      await expectAcceptError(
        await acceptRequest({ token, password: 'Invite-Pass-123' }),
        410,
        'gone',
      );
    }
  } finally {
    await deleteTestUsers(client, [selfSignup.user!.id]);
  }
});

Deno.test('auth/invite/accept：帳號已驗證 → 409 already_accepted', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '已驗證會員' });
  try {
    const token = await signReferralInviteToken(
      member.email,
      '8048876',
      Date.now(),
      ACCEPT_SECRET_READ,
    );
    await expectAcceptError(
      await acceptRequest({ token, password: 'Invite-Pass-123' }),
      409,
      'already_accepted',
    );
  } finally {
    await deleteTestUsers(client, [member.id]);
  }
});

Deno.test('auth/invite/accept：密碼少於 8 字或超過 72 位元組 → 400 weak_password，不呼叫 GoTrue', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const { client: spied, calls } = goTrueSpy();
    const send = acceptApp(spied);
    for (const password of ['short', '密'.repeat(25), 12345678, undefined]) {
      await expectAcceptError(await send({ token, password }), 400, 'weak_password');
    }
    assertEquals(calls.updateUserById.length, 0);
    assertEquals(calls.generateLink.length, 0);
  } finally {
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：GoTrue 回 weak_password → 400 weak_password 並透傳訊息', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const { client: spied } = goTrueSpy({
      updateUserById: () =>
        Promise.resolve({
          data: { user: null },
          error: {
            name: 'AuthWeakPasswordError',
            message: 'Password is known to be weak',
            status: 422,
            code: 'weak_password',
          },
        }),
    });
    const message = await expectAcceptError(
      await acceptApp(spied)({ token, password: 'password123' }),
      400,
      'weak_password',
    );
    assertEquals(message, 'Password is known to be weak');
  } finally {
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：設密碼時帳號已被清除（user_not_found）→ 410 gone', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const { client: spied } = goTrueSpy({
      updateUserById: () => Promise.resolve(goTrueError(404, 'user_not_found')),
    });
    await expectAcceptError(
      await acceptApp(spied)({ token, password: 'Invite-Pass-123' }),
      410,
      'gone',
    );
  } finally {
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：generateLink 回 email_exists（並行 accept 已驗證）→ 409', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const { client: spied } = goTrueSpy({
      generateLink: () => Promise.resolve(goTrueError(422, 'email_exists')),
    });
    await expectAcceptError(
      await acceptApp(spied)({ token, password: 'Invite-Pass-123' }),
      409,
      'already_accepted',
    );
  } finally {
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：generateLink 回的帳號不是原空殼 → 刪掉新帳號、410 gone', async () => {
  // 兩次呼叫之間空殼被 purge，GoTrue 的 generateLink(invite) 會自己建一個空白帳號
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const { client: spied, calls } = goTrueSpy({
      generateLink: () =>
        Promise.resolve({
          data: {
            user: { id: '00000000-0000-0000-0000-00000000dead' },
            properties: { hashed_token: 'x' },
          },
          error: null,
        }),
      deleteUser: () => Promise.resolve({ data: {}, error: null }),
    });
    await expectAcceptError(
      await acceptApp(spied)({ token, password: 'Invite-Pass-123' }),
      410,
      'gone',
    );
    assertEquals(calls.deleteUser.map((args) => args[0]), ['00000000-0000-0000-0000-00000000dead']);
  } finally {
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：只看 secret——kill switch 關著仍可 accept，缺 secret → 503', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  const savedSecret = Deno.env.get('REFERRAL_INVITE_SECRET')!;
  try {
    Deno.env.set('REFERRAL_EMAIL_INVITE_ENABLED', 'false');
    await expectTokenHash(await acceptRequest({ token, password: 'Invite-Pass-123' }));
    Deno.env.set('REFERRAL_INVITE_SECRET', '');
    await expectAcceptError(
      await acceptRequest({ token, password: 'Invite-Pass-123' }),
      503,
      'disabled',
    );
  } finally {
    Deno.env.set('REFERRAL_EMAIL_INVITE_ENABLED', 'true');
    Deno.env.set('REFERRAL_INVITE_SECRET', savedSecret);
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('auth/invite/accept：同一 IP 超過上限 → 429 rate_limited', async () => {
  const ip = uniqueAcceptIp();
  try {
    for (let i = 1; i <= INVITE_ACCEPT_RATE_MAX; i++) {
      const res = await acceptRequest({ token: 'garbage', password: 'x' }, ip);
      assertEquals(res.status, 400, `第 ${i} 次應進到驗簽`);
      await res.body?.cancel();
    }
    await expectAcceptError(
      await acceptRequest({ token: 'garbage', password: 'x' }, ip),
      429,
      'rate_limited',
    );
  } finally {
    await adminClient().from('rate_limits').delete().eq('key', `invite-accept:${ip}`);
  }
});

Deno.test('auth/invite/accept：兩個分頁並行 accept 後，恰好一個密碼能登入', async () => {
  const client = adminClient();
  const { referrer, email, token } = await invitedShell(client);
  try {
    const results = await Promise.all([
      acceptRequest({ token, password: 'Tab-One-Pass-1' }),
      acceptRequest({ token, password: 'Tab-Two-Pass-2' }),
    ]);
    const hashes: string[] = [];
    for (const res of results) {
      const body = await res.json();
      if (res.status === 200) hashes.push(body.tokenHash);
    }
    // 前端 verifyOtp 失敗時以同一 token 重打一次 accept；這裡只要有一個 hash 能換到 session
    let verified = false;
    for (const h of hashes) verified = verified || !(await verifyInvite(h)).error;
    assert(verified, '至少一個分頁能完成驗證');
    const ok = [
      await canSignIn(email, 'Tab-One-Pass-1'),
      await canSignIn(email, 'Tab-Two-Pass-2'),
    ];
    assertEquals(ok.filter(Boolean).length, 1, JSON.stringify(ok));
  } finally {
    const u = await authUser(email);
    if (u) await client.auth.admin.deleteUser(u.id);
    await cleanupInvites(client, [referrer], [email]);
  }
});

Deno.test('GoTrue canary：先 generateLink 再設密碼 → 該 hash 失效（accept 必須先設密碼）', async () => {
  const client = adminClient();
  const { referrer, email } = await invitedShell(client);
  try {
    const u = await authUser(email);
    const { data: link } = await client.auth.admin.generateLink({ type: 'invite', email });
    const hashedToken = link.properties?.hashed_token;
    assert(hashedToken, 'generateLink 應回 hashed_token');
    await client.auth.admin.updateUserById(u.id, { password: 'Reverse-Order-1' });
    const { error } = await verifyInvite(hashedToken);
    assert(error, 'GoTrue 若改成設密碼不清 token，accept 的硬順序理由要重審');
  } finally {
    await cleanupInvites(client, [referrer], [email]);
  }
});
