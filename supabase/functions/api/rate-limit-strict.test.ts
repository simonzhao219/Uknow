// ============================================================
// rateLimitStrict／refundRateLimit（api/rate-limit-strict.ts）：Email 邀請的
// target 與全站窗用的限流原語。
//
// 既有 rateLimit() 是 fail-open（`allowed !== false`）：RPC 出錯當成放行。
// 對 per-user 窗沒問題，但 target 窗（同一信箱 24 小時一封）與全站窗（GoTrue
// 寄信上限）放行等於寄信——所以這裡回三態，出錯要讓呼叫端回 503、不寄。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { rateLimitStrict, refundRateLimit } from './rate-limit-strict.ts';
import { adminClient, withRestTableFailure } from './test-helpers.ts';

function uniqueKey(): string {
  return `test:strict:${crypto.randomUUID()}`;
}

Deno.test('rateLimitStrict：窗內未超額 → allowed，超過上限 → limited', async () => {
  const client = adminClient();
  const key = uniqueKey();
  try {
    assertEquals(await rateLimitStrict(client, key, 2, 60), 'allowed');
    assertEquals(await rateLimitStrict(client, key, 2, 60), 'allowed');
    assertEquals(await rateLimitStrict(client, key, 2, 60), 'limited');
  } finally {
    await client.from('rate_limits').delete().eq('key', key);
  }
});

Deno.test('rateLimitStrict：bump RPC 失敗 → error，不可當成放行', async () => {
  const key = uniqueKey();
  // client 要在攔截期間建立：supabase-js 建 client 時才取用全域 fetch
  const result = await withRestTableFailure(
    ['rpc/bump_rate_limit'],
    () => rateLimitStrict(adminClient(), key, 5, 60),
  );
  assertEquals(result, 'error');
});

Deno.test('refundRateLimit：經 refund_rate_limit RPC 把計數退一格', async () => {
  const client = adminClient();
  const key = uniqueKey();
  try {
    assertEquals(await rateLimitStrict(client, key, 1, 60), 'allowed');
    assertEquals(await rateLimitStrict(client, key, 1, 60), 'limited');
    await refundRateLimit(client, key);
    await refundRateLimit(client, key);
    assertEquals(await rateLimitStrict(client, key, 1, 60), 'allowed', '退兩格後應再放行');
  } finally {
    await client.from('rate_limits').delete().eq('key', key);
  }
});

Deno.test('refundRateLimit：RPC 失敗只記 log、不拋例外', async () => {
  // 退額度是「信沒寄出」之後的善後；它失敗不能把已決定的 503／202 改成 500
  await withRestTableFailure(
    ['rpc/refund_rate_limit'],
    () => refundRateLimit(adminClient(), uniqueKey()),
  );
});
