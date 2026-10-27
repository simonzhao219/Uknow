// ============================================================
// POST /auth/check-email 的查詢正確性（AuthPage 步驟 1：exists → 2A 登入，
// 否則 → 2B 設定密碼）。
//
// 舊實作打 GoTrue `admin/users?page=1&per_page=50&search=<email>`，再在回傳
// 那一頁裡比對 email。GoTrue 的 list users 不讀 `search`（它讀的是 `filter`），
// 未知參數被忽略，於是永遠只拿到最新建立的 50 位使用者：較早註冊的既有會員
// 被判不存在、被送進 2B 對自己的 email 重跑 signUp。新使用者永遠在最新 50 位
// 之內，所以「剛建立的帳號 → exists:true」這種測試修前修後都綠——第一條必須
// 先在目標帳號之後再建 50 位才釘得住。
//
// 改成 service_role 專用的 find_auth_user_by_email RPC 後多了一條失敗路徑：
// RPC 錯誤必須 503，不能像舊實作 `!res.ok` 那樣回 { exists:false }——那會把
// 暫時性故障變成與本 bug 相同的症狀（既有會員被導去設定密碼）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  withRestTableFailure,
} from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

function uniqueIp(): string {
  // 每次請求用不同 IP，避免撞上 check-email 的 per-IP 限流
  const b = new Uint8Array(2);
  crypto.getRandomValues(b);
  return `198.51.${b[0]}.${b[1]}`;
}

async function checkEmail(email: string): Promise<Response> {
  return await app.request('/api/auth/check-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': uniqueIp() },
    body: JSON.stringify({ email }),
  });
}

Deno.test('check-email：比目標帳號更新的使用者達 50 位 → 仍回 exists:true', async () => {
  const client = adminClient();
  const ids: string[] = [];
  try {
    const target = await createTestUser(client);
    ids.push(target.id);
    // GoTrue list users 預設 created_at desc、舊實作只看第一頁 50 筆：
    // 目標之後再建 50 位，目標就落在第 51 位、掉出那一頁。
    for (let i = 0; i < 50; i++) {
      ids.push((await createTestUser(client)).id);
    }

    const res = await checkEmail(target.email);
    assertEquals(res.status, 200, await res.clone().text());
    assertEquals(await res.json(), { exists: true });
  } finally {
    await deleteTestUsers(client, ids);
  }
});

Deno.test('check-email：不存在的 email → exists:false', async () => {
  const res = await checkEmail(`nobody-${crypto.randomUUID()}@example.invalid`);
  assertEquals(res.status, 200, await res.clone().text());
  assertEquals(await res.json(), { exists: false });
});

Deno.test('check-email：大小寫不同的既有 email → exists:true', async () => {
  const client = adminClient();
  const user = await createTestUser(client);
  try {
    const res = await checkEmail(user.email.toUpperCase());
    assertEquals(res.status, 200, await res.clone().text());
    assertEquals(await res.json(), { exists: true });
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('find_auth_user_by_email：anon、authenticated 不能直接執行，只給 service_role', async () => {
  // 函式回 auth.users 的帳號狀態（是否設過密碼、邀請／驗證時間），對 anon 開放
  // 等於在 PostgREST 上開一個無限流的帳號枚舉入口；反過來 revoke 誤傷
  // service_role 的話，全站登入步驟 1 都會 503。
  const fn = 'public.find_auth_user_by_email(text)';
  const sql = postgres(DB_URL);
  try {
    const [found] = await sql<{ exists: boolean }[]>`
      select to_regprocedure(${fn}) is not null as exists
    `;
    assert(found.exists, `${fn} 不存在`);

    const [row] = await sql<{ anon: boolean; authed: boolean; service: boolean }[]>`
      select
        has_function_privilege('anon', ${fn}, 'EXECUTE') as anon,
        has_function_privilege('authenticated', ${fn}, 'EXECUTE') as authed,
        has_function_privilege('service_role', ${fn}, 'EXECUTE') as service
    `;
    assertEquals(row.anon, false, `anon 不得執行 ${fn}`);
    assertEquals(row.authed, false, `authenticated 不得執行 ${fn}`);
    assertEquals(row.service, true, 'Edge Function 以 service_role 呼叫，不能一起被撤掉');
  } finally {
    await sql.end();
  }
});

Deno.test('check-email：RPC 失敗 → 503，不偽裝成不存在', async () => {
  const res = await withRestTableFailure(
    ['rpc/find_auth_user_by_email'],
    async () => await checkEmail(`any-${crypto.randomUUID()}@example.invalid`),
  );
  assertEquals(res.status, 503, await res.clone().text());
  const body = await res.json();
  assertEquals(body.error, '暫時無法檢查 Email，請稍後再試');
  assert(!('exists' in body), JSON.stringify(body));
});

// ============================================================
// 直接測 find_auth_user_by_email 本身。上面幾條隔著 handler、只用到
// data.length：拿掉 SQL 任一側的 lower()（handler 先把輸入轉小寫）或把比對
// 改成 LIKE，它們照樣綠。7 欄的形狀與內容只能在這裡釘。
// ============================================================

const LOOKUP_COLUMNS = [
  'confirmation_sent_at',
  'email_confirmed_at',
  'has_password',
  'id',
  'invited_at',
  'last_sign_in_at',
  'referral_invite',
];

Deno.test('find_auth_user_by_email：已驗證、有密碼的帳號 → 1 列 7 欄，has_password 為真', async () => {
  const client = adminClient();
  const user = await createTestUser(client);
  try {
    const { data, error } = await client.rpc('find_auth_user_by_email', { p_email: user.email });
    assertEquals(error, null);
    assertEquals(data?.length, 1);
    const row = data![0];
    assertEquals(Object.keys(row).sort(), LOOKUP_COLUMNS);
    assertEquals(row.id, user.id);
    assertEquals(row.has_password, true);
    assert(row.email_confirmed_at !== null, 'createTestUser 帶 email_confirm，應已驗證');
    assertEquals(row.referral_invite, null);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('find_auth_user_by_email：app_metadata 寫入 referral_invite → 回傳該物件', async () => {
  const client = adminClient();
  const user = await createTestUser(client);
  try {
    const invite = { referrer_code: '1000001', sent_at: '2026-10-26T00:00:00Z' };
    const { error: updateErr } = await client.auth.admin.updateUserById(user.id, {
      app_metadata: { referral_invite: invite },
    });
    assertEquals(updateErr, null);

    const { data, error } = await client.rpc('find_auth_user_by_email', { p_email: user.email });
    assertEquals(error, null);
    assertEquals(data?.[0]?.referral_invite, invite);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('find_auth_user_by_email：大寫 email → 1 列；email 子字串 → 0 列', async () => {
  const client = adminClient();
  const user = await createTestUser(client);
  try {
    const upper = await client.rpc('find_auth_user_by_email', {
      p_email: user.email.toUpperCase(),
    });
    assertEquals(upper.error, null);
    assertEquals(upper.data?.length, 1, '比對要不分大小寫');

    const partial = await client.rpc('find_auth_user_by_email', { p_email: user.email.slice(1) });
    assertEquals(partial.error, null);
    assertEquals(partial.data?.length, 0, '只接受完整 email，不做子字串比對');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
