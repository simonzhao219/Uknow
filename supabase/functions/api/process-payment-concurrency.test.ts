// ============================================================
// 並發呼叫 process_successful_payment 不應該重複建立訂閱/獎勵。
//
// 現況（修復前）：冪等檢查是先 select count(*) 再動作，沒有鎖，
// NotifyURL webhook 跟 return 導回幾乎同時到達時（或 PayUni 對 notify
// 重試、跟還在處理中的第一次呼叫重疊），兩個呼叫都可能在對方 commit
// 前通過檢查，各自建立一筆 subscriptions + 各自發一次 gen1 獎勵。
//
// 這個測試在修復前預期會 FAIL（斷言到重複資料），修復後（在
// process_successful_payment 開頭用 `select ... for update` 鎖住訂單）
// 應該轉綠。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import { adminClient, createTestUser, deleteTestUsers, payForUser, getActiveReferralCode } from './test-helpers.ts';

// 走 PostgREST/.rpc() 的話，兩個 HTTP round-trip 各自的開銷（auth、JSON
// 解析…）反而會把兩個呼叫的實際 DB 執行時間點拉開，很難重現真正的
// race window。直接開兩條原生連線對 Postgres 下 `select
// process_successful_payment(...)`，才能讓兩邊的呼叫真正在資料庫層級
// 同時執行，逼近 webhook / return 導回幾乎同時到達的情境。
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

Deno.test('process_successful_payment is safe under concurrent duplicate calls for the same trade_no', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Referrer' });
  const { error: referrerPayErr } = await payForUser(client, referrer.id);
  assertEquals(referrerPayErr, null);

  const refCode = await getActiveReferralCode(client, referrer.id);
  const payer = await createTestUser(client, { name: 'Payer', referredByCode: refCode });

  const tradeNo = `RACE-${payer.id}`;
  const { error: insertErr } = await client.from('payment_orders').insert({
    user_id: payer.id, amount: 1200, status: 'pending', payment_method: 'payuni', transaction_id: tradeNo,
  });
  assertEquals(insertErr, null);

  // 兩條各自獨立的原生連線，各自呼叫同一筆 trade_no 的 RPC。
  const sql1 = postgres(DB_URL, { max: 1 });
  const sql2 = postgres(DB_URL, { max: 1 });

  try {
    const payuniResponseJson = JSON.stringify({ Status: 'SUCCESS' });
    const call = (sql: ReturnType<typeof postgres>) =>
      sql`select process_successful_payment(
        ${payer.id}::uuid, ${tradeNo}, ${tradeNo}, ${payuniResponseJson}::jsonb
      ) as result`;

    const [r1, r2] = await Promise.allSettled([call(sql1), call(sql2)]);
    // 兩個呼叫至少要有一個成功；就算某個因為鎖等待逾時報錯也不該產生重複資料。
    assertEquals(r1.status === 'fulfilled' || r2.status === 'fulfilled', true);

    const { data: subs } = await client.from('subscriptions').select('id').eq('user_id', payer.id);
    assertEquals(subs?.length, 1, `expected exactly 1 subscription for payer, got ${subs?.length}`);

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('id')
      .eq('referee_user_id', payer.id)
      .eq('generation', 1);
    assertEquals(rewards?.length, 1, `expected exactly 1 gen-1 reward, got ${rewards?.length} (duplicate payout)`);

    const { data: order } = await client
      .from('payment_orders')
      .select('status')
      .eq('transaction_id', tradeNo)
      .single();
    assertEquals(order?.status, 'completed');
  } finally {
    await sql1.end();
    await sql2.end();
    await deleteTestUsers(client, [referrer.id, payer.id]);
  }
});
