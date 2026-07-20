// ============================================================
// 零星安全硬化（Wave 5）：
//   * MerTradeNo 亂數段改 CSPRNG 且加長——Math.random 4 碼 base36 在
//     同秒內碰撞機率約 1/168 萬，量大後偶發，碰撞時使用者吃 500。
//   * /internal/reconcile-pending-payments 的密鑰比較改常數時間
//     （SHA-256 摘要等長比對），行為不變：錯誤 401、正確可觸發。
//   * CORS：production 不再放行任意 localhost origin，且
//     startsWith('http://localhost') 可被 localhost.attacker.com 繞過
//     ——改為 URL 解析精確比對 hostname，僅開發旗標下放行。
// ============================================================
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app, generateTradeNo } = await import('./index.ts');

Deno.test('generateTradeNo：14 碼台灣時間戳 + 6 碼 CSPRNG 英數，批量不重複', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const tradeNo = generateTradeNo();
    assertMatch(tradeNo, /^\d{14}[A-Z0-9]{6}$/, `格式不符：${tradeNo}`);
    seen.add(tradeNo);
  }
  assertEquals(seen.size, 500, '同秒批量產生不得重複');
});

Deno.test('internal reconcile：錯誤密鑰 401、未設密鑰 fail-closed', async () => {
  Deno.env.set('RECONCILE_SECRET', 'test-secret-value');
  const wrong = await app.request('/api/internal/reconcile-pending-payments', {
    method: 'POST',
    headers: { 'x-internal-secret': 'wrong-value' },
  });
  assertEquals(wrong.status, 401);

  const missing = await app.request('/api/internal/reconcile-pending-payments', {
    method: 'POST',
  });
  assertEquals(missing.status, 401);

  Deno.env.delete('RECONCILE_SECRET');
  const noSecret = await app.request('/api/internal/reconcile-pending-payments', {
    method: 'POST',
    headers: { 'x-internal-secret': 'anything' },
  });
  assertEquals(noSecret.status, 401, '未設 RECONCILE_SECRET 必須 fail-closed');
});

Deno.test('CORS：非開發模式下不放行 localhost，前綴繞過網域一律拒絕', async () => {
  // 測試環境 PAYUNI_SANDBOX=false 且未設 DEV_CORS → 視同 production
  const attack = await app.request('/api/announcements/active', {
    headers: { Origin: 'http://localhost.attacker.com' },
  });
  assertEquals(attack.headers.get('access-control-allow-origin'), null,
    'localhost.attacker.com 不得拿到 CORS 放行');

  const localhost = await app.request('/api/announcements/active', {
    headers: { Origin: 'http://localhost:3000' },
  });
  assertEquals(localhost.headers.get('access-control-allow-origin'), null,
    'production 不放行 localhost');

  const legit = await app.request('/api/announcements/active', {
    headers: { Origin: 'https://frontend.test' },
  });
  assertEquals(legit.headers.get('access-control-allow-origin'), 'https://frontend.test');

  // 開發旗標開啟時，真正的 localhost 才放行
  Deno.env.set('DEV_CORS', 'true');
  try {
    const dev = await app.request('/api/announcements/active', {
      headers: { Origin: 'http://localhost:3000' },
    });
    assertEquals(dev.headers.get('access-control-allow-origin'), 'http://localhost:3000');

    const devAttack = await app.request('/api/announcements/active', {
      headers: { Origin: 'http://localhost.attacker.com' },
    });
    assertEquals(devAttack.headers.get('access-control-allow-origin'), null,
      '開發模式也不得被前綴網域繞過');
  } finally {
    Deno.env.delete('DEV_CORS');
  }
});
