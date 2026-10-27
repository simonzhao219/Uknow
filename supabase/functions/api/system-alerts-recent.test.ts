// ============================================================
// GET /internal/system-alerts/recent：給排程把「過去 N 分鐘的 error 告警」
// 推到 LINE。契約：x-internal-secret（同 RECONCILE_SECRET）驗證；只回
// error 級；只回 id／source／message／created_at（不洩漏 context）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { adminClient, ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');
Deno.env.set('RECONCILE_SECRET', 'recent-alerts-test-secret');

const { app } = await import('./index.ts');
const headers = { 'x-internal-secret': 'recent-alerts-test-secret' };

Deno.test('system-alerts/recent：缺密鑰或密鑰錯誤回 401', async () => {
  const none = await app.request('/api/internal/system-alerts/recent?minutes=60');
  assertEquals(none.status, 401);
  const wrong = await app.request('/api/internal/system-alerts/recent?minutes=60', {
    headers: { 'x-internal-secret': 'nope' },
  });
  assertEquals(wrong.status, 401);
});

Deno.test('system-alerts/recent：minutes 缺漏、非整數、超界回 400', async () => {
  for (const q of ['', '?minutes=abc', '?minutes=0', '?minutes=1.5', '?minutes=1441']) {
    const res = await app.request(`/api/internal/system-alerts/recent${q}`, { headers });
    assertEquals(res.status, 400, q);
    await res.body?.cancel();
  }
});

Deno.test('system-alerts/recent：只回時間窗內的 error 列，且不含 context', async () => {
  const client = adminClient();
  const marker = `recent-alerts-test-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 3 * 3600_000).toISOString();
  try {
    const { error } = await client.from('system_alerts').insert([
      // 批次 insert 各列鍵集合不同時 PostgREST 會把缺的欄位送成 null，
      // 繞過欄位 default——created_at 每列都明確給。
      {
        source: marker,
        severity: 'error',
        message: 'fresh error',
        context: { secret: 'pii' },
        created_at: now,
      },
      {
        source: marker,
        severity: 'warning',
        message: 'fresh warning',
        context: {},
        created_at: now,
      },
      { source: marker, severity: 'error', message: 'old error', context: {}, created_at: old },
    ]);
    assert(!error, error?.message);

    const res = await app.request('/api/internal/system-alerts/recent?minutes=60', { headers });
    assertEquals(res.status, 200, await res.clone().text());
    const body = await res.json();
    const mine = (body.data.alerts as any[]).filter((a) => a.source === marker);
    assertEquals(mine.length, 1, '只有時間窗內的 error 該被回傳');
    assertEquals(mine[0].message, 'fresh error');
    assertEquals(Object.keys(mine[0]).sort(), ['created_at', 'id', 'message', 'source']);
  } finally {
    await client.from('system_alerts').delete().eq('source', marker);
  }
});
