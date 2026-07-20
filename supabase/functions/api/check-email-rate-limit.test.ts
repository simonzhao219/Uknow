// ============================================================
// /auth/check-email 是無驗證端點，回傳的 { exists } 本身就是帳號枚舉
// 位元——沒有限流的話，攻擊者可拿外洩 email 清單批量驗證是否為本平台
// 會員（會員資格本身即敏感：這是含身分證/銀行資料的金流平台），
// 每次還以 service role 打一次 auth admin API 形成放大。
// 補上 per-IP 限流（DB 計數表 bump_rate_limit，Edge Function 無內建限流）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { adminClient, ensureEdgeFunctionEnv } from './test-helpers.ts';

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
      p_key: key, p_max: 3, p_window_seconds: 300,
    });
    assertEquals(error, null);
    assertEquals(data, true, `第 ${i} 次應放行`);
  }
  const { data: fourth } = await client.rpc('bump_rate_limit', {
    p_key: key, p_max: 3, p_window_seconds: 300,
  });
  assertEquals(fourth, false, '第 4 次應被拒');

  // 把窗口起點改到過去 → 視為新窗口，重新放行
  await client.from('rate_limits')
    .update({ window_start: new Date(Date.now() - 3600_000).toISOString() })
    .eq('key', key);
  const { data: afterWindow } = await client.rpc('bump_rate_limit', {
    p_key: key, p_max: 3, p_window_seconds: 300,
  });
  assertEquals(afterWindow, true, '窗口過期後應重置放行');

  await client.from('rate_limits').delete().eq('key', key);
});

Deno.test('check-email：同一 IP 連打超過上限回 429，其他 IP 不受影響', async () => {
  const ip = uniqueIp();
  const otherIp = uniqueIp();

  // 上限 10 次（見 index.ts CHECK_EMAIL_RATE_LIMIT）：前 10 次正常
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
