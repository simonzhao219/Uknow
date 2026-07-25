// ============================================================
// ETag / 條件請求（stale-while-revalidate 的頻寬優化）：
//   * 讀端點回應帶 ETag + Cache-Control: private, no-cache + Vary
//   * 內容沒變時 If-None-Match 命中 → 304 空 body
//   * 內容變了 → 200 + 新 ETag
// ============================================================
import { assertEquals, assert, assertNotEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

Deno.test('讀端點：ETag + 304 條件請求 + 快取標頭', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'ETag User' });

  try {
    const { error } = await payForUser(client, user.id);
    assertEquals(error, null);
    const token = await getUserAccessToken(client, user.email);

    // 帶 Origin 模擬瀏覽器跨網域呼叫（*.uknow.pages.dev 預覽網域）
    const previewOrigin = 'https://61e6efda.uknow.pages.dev';
    const res1 = await app.request('/api/rewards', {
      headers: { Authorization: `Bearer ${token}`, Origin: previewOrigin },
    });
    assertEquals(res1.status, 200);
    const etag1 = res1.headers.get('ETag');
    assert(etag1, '讀端點應回 ETag');
    assertEquals(res1.headers.get('Cache-Control'), 'private, no-cache');
    assertEquals(res1.headers.get('Access-Control-Allow-Origin'), previewOrigin);
    // 快取必須同時按 Authorization 與 Origin 分片——缺 Origin 會讓瀏覽器把
    // A 預覽網域存的回應（含 A 的 ACAO）拿去回覆 B 網域的請求，CORS 直接失敗
    const vary1 = (res1.headers.get('Vary') ?? '').toLowerCase();
    assert(vary1.includes('authorization') && vary1.includes('origin'),
      `Vary 應含 Authorization 與 Origin，實際：${vary1}`);
    await res1.body?.cancel();

    // 同樣資料 → 同樣 ETag（回應必須是決定性的）
    const res2 = await app.request('/api/rewards', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res2.headers.get('ETag'), etag1);
    await res2.body?.cancel();

    // If-None-Match 命中 → 304 空 body。CORS 標頭必須保留在 304 上——
    // hono/etag 預設會剝掉 ACAO，瀏覽器 revalidate 時就只能沿用快取裡
    // （可能是別的預覽網域的）舊 ACAO，整個讀端點被 CORS 擋下
    const res304 = await app.request('/api/rewards', {
      headers: {
        Authorization: `Bearer ${token}`,
        'If-None-Match': etag1!,
        Origin: previewOrigin,
      },
    });
    assertEquals(res304.status, 304);
    assertEquals(await res304.text(), '');
    assertEquals(res304.headers.get('Access-Control-Allow-Origin'), previewOrigin,
      '304 必須帶本次請求的 ACAO，否則跨預覽網域的快取 revalidation 會被 CORS 擋下');
    assertEquals(res304.headers.get('Access-Control-Allow-Credentials'), 'true');
    const vary304 = (res304.headers.get('Vary') ?? '').toLowerCase();
    assert(vary304.includes('authorization') && vary304.includes('origin'),
      `304 的 Vary 應含 Authorization 與 Origin，實際：${vary304}`);

    // 資料變了 → 200 + 新 ETag
    await client.from('reward_transactions').insert({
      user_id: user.id, type: 'adjustment', amount: 100, description: '測試調整',
    });
    const res3 = await app.request('/api/rewards', {
      headers: { Authorization: `Bearer ${token}`, 'If-None-Match': etag1! },
    });
    assertEquals(res3.status, 200);
    assertNotEquals(res3.headers.get('ETag'), etag1);
    await res3.body?.cancel();
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
