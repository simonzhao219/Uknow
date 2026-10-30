// ============================================================
// /payuni/prepare 送給 PayUni UPP 的加密內容（EncryptInfo）。
//
// 解開 EncryptInfo 檢查參數，釘住「靜默掉了也不會報錯」的開關——
// 例如 TradeInvoice（電子發票）：少帶不會讓付款失敗，只會讓 PayUni
// 不開發票，沒有任何訊號，只能由這裡把關。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { decryptPayUni } from './crypto.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
const HASH_KEY = '0123456789abcdef0123456789abcdef';
const HASH_IV = '0123456789ab';
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', HASH_KEY);
Deno.env.set('PAYUNI_HASH_IV', HASH_IV);
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

Deno.test('prepare：組 EncryptInfo → 帶 TradeInvoice=1 啟用電子發票', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Prepare Invoice' });
  try {
    // 先付一次再讓會籍完全過期，才能走 fresh 建出新訂單
    assertEquals((await payForUser(client, user.id)).error, null);
    const past = new Date(Date.now() - 400 * 86400_000).toISOString();
    const { error } = await client
      .from('subscriptions')
      .update({ end_date: past, grace_period_end: past })
      .eq('user_id', user.id);
    assertEquals(error, null);

    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/payuni/prepare', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ renewalMode: 'fresh' }),
    });
    const body = await res.json();
    assertEquals(body.success, true, JSON.stringify(body));

    const payload = JSON.parse(await decryptPayUni(body.data.EncryptInfo, HASH_KEY, HASH_IV));
    assertEquals(payload.TradeInvoice, 1);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
