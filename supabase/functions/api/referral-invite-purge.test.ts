// ============================================================
// Email 邀請（R2）的空殼帳號清除：purge_stale_referral_invites ＋
// delete_auth_audit_for_users（migration 20261025000011）。
//
// 邀請信建立的 auth.users 列（＋ handle_new_user 建的 profiles 空列）是「代
// 第三人建立的帳號」，信裡承諾 7 天內未透過連結設定密碼即刪除——這支測試釘
// 住承諾真的兌現、而且只刪該刪的：
//   * 計齡看 app_metadata.referral_invite.issued_at（GoTrue 每次 invite 都覆寫
//     invited_at；重寄＝新邀請，issued_at 也一起更新）
//   * GoTrue 每筆帳號事件把 email 寫進 auth.audit_log_entries，刪帳號不連帶
//     刪它——所以對本機 GoTrue 真做一輪 invite／設密碼／generateLink 再
//     purge，斷言 audit 不留任何含該 email 的列，不手造 payload
//   * accept 設密碼的同時驗證 email——從連結設好密碼的人永遠不會被清掉
//   * 已驗證、登入過、付過款、不是 R2 建的、還沒滿 7 天的都不刪
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { REFERRAL_INVITE_TOKEN_TTL_SECONDS } from '../_shared/referral-invite-payload.ts';
import { adminClient, createTestUser, deleteTestUsers } from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DAY_MS = 86_400_000;

function uniqueEmail(tag: string): string {
  return `invite-purge-${tag}-${crypto.randomUUID()}@example.invalid`;
}

/** 走真 GoTrue 建一個 R2 空殼：inviteUserByEmail ＋ app_metadata 蓋章。 */
async function inviteShell(
  client: SupabaseClient,
  opts: { email?: string; issuedAt: string },
): Promise<{ id: string; email: string }> {
  const email = opts.email ?? uniqueEmail('shell');
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
    data: {
      referral_invite_name: '測試推薦人',
      referral_invite_url: 'https://frontend.test/register?invite=x.y',
    },
  });
  if (error || !data.user) throw new Error(`inviteUserByEmail failed: ${error?.message}`);
  const { error: stampErr } = await client.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      referral_invite: {
        code: '8048876',
        consent_at: opts.issuedAt,
        consent_version: 'test',
        issued_at: opts.issuedAt,
      },
    },
  });
  if (stampErr) throw new Error(`stamp failed: ${stampErr.message}`);
  return { id: data.user.id, email };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

async function userExists(client: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await client.auth.admin.getUserById(id);
  return Boolean(data?.user);
}

async function auditRowsMentioning(sql: postgres.Sql, email: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from auth.audit_log_entries
    where strpos(lower(payload::text), lower(${email})) > 0
  `;
  return row.n;
}

Deno.test('purge_stale_referral_invites：issued_at 超過 7 天的空殼被刪，profiles 隨之清除', async () => {
  const client = adminClient();
  const shell = await inviteShell(client, { issuedAt: daysAgo(8) });
  try {
    const { data: deleted, error } = await client.rpc('purge_stale_referral_invites');
    assertEquals(error, null);
    assert(typeof deleted === 'number' && deleted >= 1, `應回刪除筆數，實際 ${deleted}`);
    assertEquals(await userExists(client, shell.id), false);
    const { data: profile } = await client.from('profiles').select('id').eq('id', shell.id);
    assertEquals(profile ?? [], []);
  } finally {
    await deleteTestUsers(client, [shell.id]);
  }
});

Deno.test('purge_stale_referral_invites：accept 設密碼即驗證，超過 7 天也不刪', async () => {
  const client = adminClient();
  const shell = await inviteShell(client, { issuedAt: daysAgo(8) });
  const control = await inviteShell(client, { issuedAt: daysAgo(8) });
  try {
    // accept 一步完成：同一次 updateUserById 設密碼並驗證 email
    const { error: acceptErr } = await client.auth.admin.updateUserById(shell.id, {
      password: 'Accepted-Pass-123',
      email_confirm: true,
    });
    assertEquals(acceptErr, null);

    const { error } = await client.rpc('purge_stale_referral_invites');
    assertEquals(error, null);
    assertEquals(await userExists(client, control.id), false, '對照組（沒點連結）應被刪');
    assertEquals(await userExists(client, shell.id), true, '從連結設好密碼＝已驗證，不刪');
  } finally {
    await deleteTestUsers(client, [shell.id, control.id]);
  }
});

Deno.test('purge_stale_referral_invites：referral_invite 是 JSON null 或字串 → 不當空殼、不刪', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const ids: string[] = [];
  try {
    const asNull = await inviteShell(client, { issuedAt: daysAgo(8) });
    const asString = await inviteShell(client, { issuedAt: daysAgo(8) });
    const control = await inviteShell(client, { issuedAt: daysAgo(8) });
    ids.push(asNull.id, asString.id, control.id);
    // `? 'referral_invite'` 對這兩種也成立；只有 service role 寫得出物件章，才算 R2 建的
    await sql`
      update auth.users
      set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{referral_invite}', 'null'::jsonb)
      where id = ${asNull.id}
    `;
    await sql`
      update auth.users
      set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{referral_invite}', '"8048876"'::jsonb)
      where id = ${asString.id}
    `;

    const { error } = await client.rpc('purge_stale_referral_invites');
    assertEquals(error, null);
    assertEquals(await userExists(client, control.id), false);
    assertEquals(await userExists(client, asNull.id), true, 'JSON null 不刪');
    assertEquals(await userExists(client, asString.id), true, '字串不刪');
  } finally {
    await deleteTestUsers(client, ids);
    await sql.end();
  }
});

Deno.test('purge_stale_referral_invites：真 GoTrue 走完一輪後刪除，audit 不留該 email', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const shell = await inviteShell(client, { issuedAt: daysAgo(8) });
  try {
    await client.auth.admin.updateUserById(shell.id, { password: 'Accepted-Pass-123' });
    await client.auth.admin.generateLink({ type: 'invite', email: shell.email });
    // 前提：GoTrue 確實把 email 寫進了 audit（否則下面的「0 列」是空洞的綠）
    assert(
      (await auditRowsMentioning(sql, shell.email)) > 0,
      'GoTrue 應已寫入含 email 的 audit 列',
    );

    const { error } = await client.rpc('purge_stale_referral_invites');
    assertEquals(error, null);
    assertEquals(await userExists(client, shell.id), false);
    assertEquals(await auditRowsMentioning(sql, shell.email), 0);
  } finally {
    await deleteTestUsers(client, [shell.id]);
    await sql.end();
  }
});

Deno.test('purge_stale_referral_invites：已驗證、登入過、付過款、非 R2、未滿 7 天者都不刪', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const ids: string[] = [];
  try {
    const confirmed = await inviteShell(client, { issuedAt: daysAgo(8) });
    const signedIn = await inviteShell(client, { issuedAt: daysAgo(8) });
    const paid = await inviteShell(client, { issuedAt: daysAgo(8) });
    const recent = await inviteShell(client, { issuedAt: daysAgo(6) });
    const control = await inviteShell(client, { issuedAt: daysAgo(8) });
    ids.push(confirmed.id, signedIn.id, paid.id, recent.id, control.id);

    // 非 R2：自助註冊到一半（未驗證、沒有 referral_invite），建立時間很久以前
    const { data: selfSignup, error: selfErr } = await client.auth.admin.createUser({
      email: uniqueEmail('self'),
      password: crypto.randomUUID(),
      email_confirm: false,
    });
    assertEquals(selfErr, null);
    ids.push(selfSignup.user!.id);

    await sql`update auth.users set email_confirmed_at = now() where id = ${confirmed.id}`;
    await sql`update auth.users set last_sign_in_at = now() where id = ${signedIn.id}`;
    await sql`
      update auth.users set created_at = now() - interval '30 days', invited_at = null
      where id = ${selfSignup.user!.id}
    `;
    const { error: orderErr } = await client.from('payment_orders').insert({
      user_id: paid.id,
      amount: 1200,
      status: 'pending',
      payment_method: 'payuni',
      transaction_id: `TEST-PURGE-${paid.id}`,
    });
    assertEquals(orderErr, null);

    const { error } = await client.rpc('purge_stale_referral_invites');
    assertEquals(error, null);

    assertEquals(await userExists(client, control.id), false, '對照組（符合全部條件）應被刪');
    for (
      const [label, id] of [
        ['已驗證', confirmed.id],
        ['登入過', signedIn.id],
        ['付過款', paid.id],
        ['未滿 7 天', recent.id],
        ['非 R2 自助註冊', selfSignup.user!.id],
      ] as const
    ) {
      assertEquals(await userExists(client, id), true, `${label} 不應被刪`);
    }
  } finally {
    await client.from('payment_orders').delete().in('user_id', ids);
    await deleteTestUsers(client, ids);
    await sql.end();
  }
});

Deno.test('purge_stale_referral_invites：issued_at 壞值的列跳過，不中斷整批', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL);
  const ids: string[] = [];
  try {
    const garbage = await inviteShell(client, { issuedAt: 'garbage' });
    // 形似 ISO-8601、cast 卻會失敗（2 月 30 日）
    const impossible = await inviteShell(client, { issuedAt: '2026-02-30T00:00:00.000Z' });
    const control = await inviteShell(client, { issuedAt: daysAgo(8) });
    ids.push(garbage.id, impossible.id, control.id);

    const { error } = await client.rpc('purge_stale_referral_invites');
    assertEquals(error, null);
    assertEquals(await userExists(client, control.id), false);
    assertEquals(await userExists(client, garbage.id), true);
    assertEquals(await userExists(client, impossible.id), true);
  } finally {
    await deleteTestUsers(client, ids);
    await sql.end();
  }
});

Deno.test('purge_stale_referral_invites：p_email 不套天數，剛建立的空殼立刻刪、回 1', async () => {
  const client = adminClient();
  const shell = await inviteShell(client, { issuedAt: new Date().toISOString() });
  try {
    const { data, error } = await client.rpc('purge_stale_referral_invites', {
      p_email: shell.email.toUpperCase(),
    });
    assertEquals(error, null);
    assertEquals(data, 1);
    assertEquals(await userExists(client, shell.id), false);
  } finally {
    await deleteTestUsers(client, [shell.id]);
  }
});

Deno.test('purge_stale_referral_invites：p_email 指向已驗證會員 → 不刪、回 0', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '既有會員' });
  try {
    const { data, error } = await client.rpc('purge_stale_referral_invites', {
      p_email: member.email,
    });
    assertEquals(error, null);
    assertEquals(data, 0);
    assertEquals(await userExists(client, member.id), true);
  } finally {
    await deleteTestUsers(client, [member.id]);
  }
});

Deno.test('delete_auth_audit_for_users：GoTrue deleteUser 之後呼叫，連 user_deleted 列一起清掉', async () => {
  // 補償路徑（新建後蓋章失敗）走 GoTrue deleteUser，它自己會再寫一筆含 email 的
  // user_deleted 事件；所以清理要在 deleteUser 之後呼叫。
  const client = adminClient();
  const sql = postgres(DB_URL);
  const shell = await inviteShell(client, { issuedAt: new Date().toISOString() });
  try {
    const { error: delErr } = await client.auth.admin.deleteUser(shell.id);
    assertEquals(delErr, null);
    assert(
      (await auditRowsMentioning(sql, shell.email)) > 0,
      'GoTrue 應已寫入含 email 的 audit 列',
    );

    const { data, error } = await client.rpc('delete_auth_audit_for_users', {
      p_user_ids: [shell.id],
    });
    assertEquals(error, null);
    assert(typeof data === 'number' && data >= 1, `應回刪除筆數，實際 ${data}`);
    assertEquals(await auditRowsMentioning(sql, shell.email), 0);
  } finally {
    await sql.end();
  }
});

Deno.test('purge_stale_referral_invites：pg_cron 每天 03:23（UTC）排程一次', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await sql`
      select schedule, command, active from cron.job
      where jobname = 'purge-stale-referral-invites'
    `;
    assertEquals(rows.length, 1, '應恰好有一個 purge-stale-referral-invites 排程');
    assertEquals(rows[0].schedule, '23 3 * * *');
    assert(rows[0].command.includes('purge_stale_referral_invites'), rows[0].command);
    assertEquals(rows[0].active, true);
  } finally {
    await sql.end();
  }
});

Deno.test('purge 與 audit 清理：anon、authenticated 不能執行，只給 service_role', async () => {
  // purge(0) 會刪光所有邀請中的帳號、audit 清理能抹掉任意使用者的稽核紀錄——
  // 兩支都只能由 Edge Function（service_role）與 cron 呼叫，不能經 PostgREST 對外。
  const sql = postgres(DB_URL);
  try {
    for (
      const fn of [
        'public.purge_stale_referral_invites(int, text)',
        'public.delete_auth_audit_for_users(uuid[])',
      ]
    ) {
      const [row] = await sql<{ anon: boolean; authed: boolean; service: boolean }[]>`
        select
          has_function_privilege('anon', ${fn}, 'EXECUTE') as anon,
          has_function_privilege('authenticated', ${fn}, 'EXECUTE') as authed,
          has_function_privilege('service_role', ${fn}, 'EXECUTE') as service
      `;
      assertEquals(row.anon, false, `anon 不得執行 ${fn}`);
      assertEquals(row.authed, false, `authenticated 不得執行 ${fn}`);
      assertEquals(row.service, true, `service_role 要能執行 ${fn}`);
    }
  } finally {
    await sql.end();
  }
});

Deno.test('purge_stale_referral_invites：預設天數不短於連結效期（連結有效時帳號必在）', async () => {
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql<{ args: string }[]>`
      select pg_get_function_arguments('public.purge_stale_referral_invites(int, text)'::regprocedure)
        as args
    `;
    const m = row.args.match(/p_older_than_days integer DEFAULT (\d+)/);
    assert(m, `抽不到 purge 預設天數：${row.args}`);
    const ttlDays = REFERRAL_INVITE_TOKEN_TTL_SECONDS / (24 * 60 * 60);
    assert(ttlDays <= Number(m[1]), `連結效期 ${ttlDays} 天 > purge 預設 ${m[1]} 天`);
  } finally {
    await sql.end();
  }
});
