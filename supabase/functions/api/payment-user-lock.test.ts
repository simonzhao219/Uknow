// ============================================================
// 同一使用者的兩筆「不同」訂單併發完成,不得算出相同效期。
//
// 現況(修復前):process_successful_payment 只鎖 payment_orders
// (鍵是 transaction_id,兩筆不同訂單各自的列,互不阻擋),算效期錨點時
// 對 subscriptions 是無鎖的 select max(end_date)——兩個並發呼叫都可能
// 讀到同一個 max,各自 insert 出相同效期:使用者付了 2,400 只得一年。
// 觸發面不只雙開分頁:complete_paid_pending_orders 與
// /internal/reconcile-pending-payments 也直接呼叫同一支函數。
//
// 修復:在算錨點前加 user 層級鎖
// (perform 1 from profiles where id = p_user_id for update)。
// 鎖序「先 payment_orders(各筆不同)→ 後 profiles」;
// apply_referral_side_effects 稍後在同一交易內重入同一列鎖,不阻塞。
//
// 本測試在修復前預期 FAIL(兩筆 extend 算出同一個迄日),修復後轉綠。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { adminClient, createTestUser, deleteTestUsers, payForUser } from './test-helpers.ts';
import { twDayOf, twDayPlusYears } from './tw-dates.ts';

// 走 PostgREST/.rpc() 的話,兩個 HTTP round-trip 的開銷會把實際 DB 執行
// 時間點拉開,很難重現 race window。直接開兩條原生連線(同
// process-payment-concurrency.test.ts 的既有先例)。
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

Deno.test('process_successful_payment：兩筆 extend 併發完成不得算出相同效期', async () => {
  const client = adminClient();
  const payer = await createTestUser(client, { name: 'Lock Payer' });

  try {
    // 第一筆付款建立基準訂閱,取其迄日 D1。
    const { error: firstPayErr } = await payForUser(client, payer.id);
    assertEquals(firstPayErr, null);
    const { data: baseSubs } = await client
      .from('subscriptions')
      .select('end_date')
      .eq('user_id', payer.id);
    assertEquals(baseSubs?.length, 1);
    const d1 = twDayOf(baseSubs![0].end_date);

    // 兩筆各自獨立的 extend pending 訂單。
    const t1 = `LOCK-A-${payer.id}`;
    const t2 = `LOCK-B-${payer.id}`;
    for (const tradeNo of [t1, t2]) {
      const { error: insertErr } = await client.from('payment_orders').insert({
        user_id: payer.id,
        amount: 1200,
        status: 'pending',
        payment_method: 'payuni',
        transaction_id: tradeNo,
        renewal_mode: 'extend',
      });
      assertEquals(insertErr, null);
    }

    const sql1 = postgres(DB_URL, { max: 1 });
    const sql2 = postgres(DB_URL, { max: 1 });
    try {
      const payuniResponseJson = JSON.stringify({ Status: 'SUCCESS' });
      const call = (sql: ReturnType<typeof postgres>, tradeNo: string) =>
        sql`select process_successful_payment(
          ${payer.id}::uuid, ${tradeNo}, ${tradeNo}, ${payuniResponseJson}::jsonb
        ) as result`;

      const [r1, r2] = await Promise.allSettled([call(sql1, t1), call(sql2, t2)]);
      assertEquals(r1.status === 'fulfilled' || r2.status === 'fulfilled', true);

      const { data: subs } = await client
        .from('subscriptions')
        .select('end_date')
        .eq('user_id', payer.id);
      assertEquals(subs?.length, 3, `expected 3 subscriptions, got ${subs?.length}`);

      // 核心斷言:三筆迄日互不相同——無 user 級鎖時兩筆 extend 會讀到
      // 同一個 max(end_date),算出同一個迄日(付了兩年只得一年)。
      const endDays = subs!.map((s) => twDayOf(s.end_date)).sort();
      assertEquals(
        new Set(endDays).size,
        3,
        `expected 3 distinct end days, got ${endDays.join(', ')}`,
      );

      // 第二筆正確接續:迄日集合 = { D1, D1+1yr, D1+2yr }。
      assertEquals(endDays, [d1, twDayPlusYears(d1, 1), twDayPlusYears(d1, 2)].sort());
    } finally {
      await sql1.end();
      await sql2.end();
    }
  } finally {
    await deleteTestUsers(client, [payer.id]);
  }
});
