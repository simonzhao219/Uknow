// ============================================================
// /auth/check-email 是無驗證端點，回傳的 { exists } 本身就是帳號枚舉
// 位元——沒有限流的話，攻擊者可拿外洩 email 清單批量驗證是否為本平台
// 會員（會員資格本身即敏感：這是含身分證/銀行資料的金流平台），
// 每次還以 service role 打一次 auth admin API 形成放大。
// 補上 per-IP 限流（DB 計數表 bump_rate_limit，Edge Function 無內建限流）。
//
// 計數表本身的清理（prune_rate_limits＋pg_cron 每小時排程）也在本檔：
// check-email 以 IP 為鍵，不清的話列數只增不減。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { adminClient, ensureEdgeFunctionEnv } from './test-helpers.ts';

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
  // 每次測試用不同 IP，避免跨測試/跨輪次的計數污染
  const b = new Uint8Array(2);
  crypto.getRandomValues(b);
  return `203.0.${b[0]}.${b[1]}`;
}

Deno.test('bump_rate_limit：同一 key 在窗內超過上限即拒絕，窗口過期後重置', async () => {
  const client = adminClient();
  const key = `test:${crypto.randomUUID()}`;

  for (let i = 1; i <= 3; i++) {
    const { data, error } = await client.rpc('bump_rate_limit', {
      p_key: key,
      p_max: 3,
      p_window_seconds: 300,
    });
    assertEquals(error, null);
    assertEquals(data, true, `第 ${i} 次應放行`);
  }
  const { data: fourth } = await client.rpc('bump_rate_limit', {
    p_key: key,
    p_max: 3,
    p_window_seconds: 300,
  });
  assertEquals(fourth, false, '第 4 次應被拒');

  // 把窗口起點改到過去 → 視為新窗口，重新放行
  await client.from('rate_limits')
    .update({ window_start: new Date(Date.now() - 3600_000).toISOString() })
    .eq('key', key);
  const { data: afterWindow } = await client.rpc('bump_rate_limit', {
    p_key: key,
    p_max: 3,
    p_window_seconds: 300,
  });
  assertEquals(afterWindow, true, '窗口過期後應重置放行');

  await client.from('rate_limits').delete().eq('key', key);
});

Deno.test('check-email：同一 IP 連打超過上限回 429，其他 IP 不受影響', async () => {
  const ip = uniqueIp();
  const otherIp = uniqueIp();

  // 上限 10 次（見 index.ts CHECK_EMAIL_RATE_MAX）：前 10 次正常
  for (let i = 1; i <= 10; i++) {
    const res = await app.request('/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: `probe-${i}@example.invalid` }),
    });
    assertEquals(res.status, 200, `第 ${i} 次應放行，實際 ${res.status}`);
  }

  const blocked = await app.request('/api/auth/check-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email: 'probe-11@example.invalid' }),
  });
  assertEquals(blocked.status, 429, await blocked.clone().text());
  const body = await blocked.json();
  assert(body.error, '429 應帶錯誤訊息');

  // 不同 IP 不受影響
  const other = await app.request('/api/auth/check-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': otherIp },
    body: JSON.stringify({ email: 'probe-other@example.invalid' }),
  });
  assertEquals(other.status, 200);
});

Deno.test('check-email：cf-connecting-ip 優先於 x-forwarded-for 作為限流鍵', async () => {
  // x-forwarded-for 的第一段由用戶端自己填：每次換一個值就能繞過 per-IP 限流。
  // cf-connecting-ip 由 Cloudflare 覆寫、用戶端改不動，所以有它就以它為準。
  const ip = uniqueIp();
  for (let i = 1; i <= 10; i++) {
    const res = await app.request('/api/auth/check-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': ip,
        'x-forwarded-for': uniqueIp(),
      },
      body: JSON.stringify({ email: `cf-probe-${i}@example.invalid` }),
    });
    assertEquals(res.status, 200, `第 ${i} 次應放行，實際 ${res.status}`);
    await res.body?.cancel();
  }

  const blocked = await app.request('/api/auth/check-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
      'x-forwarded-for': uniqueIp(),
    },
    body: JSON.stringify({ email: 'cf-probe-11@example.invalid' }),
  });
  assertEquals(blocked.status, 429, '換 x-forwarded-for 不得繞過 cf-connecting-ip 的配額');
  await blocked.body?.cancel();

  await adminClient().from('rate_limits').delete().eq('key', `check-email:${ip}`);
});

// ============================================================
// rate_limits 清理
// ============================================================

Deno.test('prune_rate_limits：刪除超過保留期的計數列，窗內的列保留', async () => {
  const client = adminClient();
  const stale = `test:stale:${crypto.randomUUID()}`;
  const fresh = `test:fresh:${crypto.randomUUID()}`;
  try {
    const { error: insertErr } = await client.from('rate_limits').insert([
      // 3 天前：超過預設保留期（2 天＝最長窗口 1 天的兩倍）
      { key: stale, count: 5, window_start: new Date(Date.now() - 3 * 86400_000).toISOString() },
      { key: fresh, count: 5, window_start: new Date().toISOString() },
    ]);
    assertEquals(insertErr, null);

    const { data: deleted, error } = await client.rpc('prune_rate_limits');
    assertEquals(error, null);
    assert(typeof deleted === 'number' && deleted >= 1, `應回傳刪除筆數，實際 ${deleted}`);

    const { data: left } = await client.from('rate_limits').select('key').in('key', [stale, fresh]);
    assertEquals((left ?? []).map((r) => r.key), [fresh]);
  } finally {
    await client.from('rate_limits').delete().in('key', [stale, fresh]);
  }
});

Deno.test('prune_rate_limits：pg_cron 每小時排程清理一次', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await sql`
      select schedule, command, active from cron.job where jobname = 'prune-rate-limits'
    `;
    assertEquals(rows.length, 1, '應恰好有一個 prune-rate-limits 排程');
    // 「分 * * * *」＝每小時一次；分鐘值刻意不釘（避開整點只是錯峰）。
    assert(/^\d{1,2} \* \* \* \*$/.test(rows[0].schedule), `排程不是每小時：${rows[0].schedule}`);
    assert(rows[0].command.includes('prune_rate_limits'), rows[0].command);
    assertEquals(rows[0].active, true);
  } finally {
    await sql.end();
  }
});
