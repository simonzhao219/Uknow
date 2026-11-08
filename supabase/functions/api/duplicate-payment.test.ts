// ============================================================
// 重複付款的付款時點防線（第 5 波 S2 階段 7；稽核 pay P1-2、裁決 W5-11、W5-13、W5-14）。
//
// prepare 對 active 者回 400，所以「付款當下此人已在效期內」（某筆訂閱 end_date ≥ 付款
// 時點）的成功付款，一定是在變成 active 之前建的單、現在又付了一次（兩分頁各付一張）。
//   * null／fresh：不得從付款日再起算一年（與第一筆重疊）——改以續約錨點接續、不跑
//     fresh 清帳本；三代獎金照發（W5-13）；寫 error 告警 duplicate_payment，context 帶
//     兩筆 trade_no 與該筆發出的獎金列，客服據此個案退款並人工沖銷。
//   * extend：照常串接（預付語意正確），寫 warning 告警讓客服知道。
//   * 告警寫入失敗不得回滾付款（錢收了不開通是最糟結果）。
// 付款途中才被停權（W5-14）：照開通，寫 error 告警 payment_while_suspended。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';
import { twDayOf, twDayPlusDays } from './tw-dates.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Client = ReturnType<typeof adminClient>;

async function insertOrder(client: Client, userId: string, tradeNo: string, mode: string | null) {
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    renewal_mode: mode,
  });
  assertEquals(error, null);
}

async function complete(client: Client, userId: string, tradeNo: string) {
  const { error } = await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_transaction_id: tradeNo,
    p_payuni_response: { Status: 'SUCCESS' },
  });
  assertEquals(error, null);
}

async function subs(client: Client, userId: string) {
  // 依迄日排序：expire() 只把迄日改到過去、起日不動，依起日排會把那筆排到中間。
  const { data } = await client.from('subscriptions')
    .select('id, start_date, end_date, payment_transaction_id')
    .eq('user_id', userId)
    .order('end_date', { ascending: true });
  return data ?? [];
}

async function alertsFor(client: Client, userId: string, source: string) {
  const { data } = await client.from('system_alerts')
    .select('severity, context')
    .eq('source', source)
    .eq('context->>user_id', userId);
  return data ?? [];
}

async function expire(client: Client, userId: string) {
  const past = new Date(Date.now() - 10 * 86400_000).toISOString();
  await client.from('subscriptions').update({ end_date: past, grace_period_end: past })
    .eq('user_id', userId);
}

Deno.test('process_successful_payment：兩分頁各付一張首購單 → 第二筆接續效期、error 告警', async () => {
  const client = adminClient();
  const upline = await createTestUser(client, { name: 'Dup Upline' });
  const created = [upline.id];
  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    const code = await getActiveReferralCode(client, upline.id);
    const user = await createTestUser(client, { name: 'Dup Payer', referredByCode: code });
    created.push(user.id);
    const t1 = `DUP-A-${user.id}`;
    const t2 = `DUP-B-${user.id}`;
    await insertOrder(client, user.id, t1, null);
    await insertOrder(client, user.id, t2, null);
    await complete(client, user.id, t1);
    await complete(client, user.id, t2);

    const rows = await subs(client, user.id);
    assertEquals(rows.length, 2);
    assertEquals(
      twDayOf(rows[1].start_date),
      twDayPlusDays(twDayOf(rows[0].end_date), 1),
      '第二筆必須接在第一筆迄日隔天，不得與第一筆重疊',
    );

    const alerts = await alertsFor(client, user.id, 'duplicate_payment');
    assertEquals(alerts.length, 1, JSON.stringify(alerts));
    assertEquals(alerts[0].severity, 'error');
    const ctx = alerts[0].context as Record<string, unknown>;
    assertEquals(ctx.trade_no, t2);
    assertEquals(ctx.previous_trade_no, t1);
    // W5-13：三代獎金照發，告警附該筆獎金列（客服退款時人工沖銷）。
    const rewards = ctx.rewards as { user_id: string; generation: number }[];
    assert(Array.isArray(rewards) && rewards.length >= 1, JSON.stringify(ctx));
    assertEquals(rewards[0].user_id, upline.id);
  } finally {
    await deleteTestUsers(client, created);
  }
});

Deno.test('process_successful_payment：新約重複付款 → 第二筆不再清空帳本', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Dup Fresh' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await expire(client, user.id);
    const t1 = `DUPF-A-${user.id}`;
    const t2 = `DUPF-B-${user.id}`;
    await insertOrder(client, user.id, t1, 'fresh');
    await insertOrder(client, user.id, t2, 'fresh');
    await complete(client, user.id, t1);
    await client.from('reward_transactions').insert({
      user_id: user.id,
      type: 'adjustment',
      amount: 300,
      description: '第一筆新約之後入帳（測試）',
    });
    await complete(client, user.id, t2);

    const { data: resets } = await client.from('reward_transactions')
      .select('amount').eq('user_id', user.id).eq('type', 'ledger_reset');
    assertEquals(resets?.length, 1, '重複的新約不得再清一次帳本');
    assertEquals((await alertsFor(client, user.id, 'duplicate_payment'))[0]?.severity, 'error');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('process_successful_payment：續約重複付款 → 照常串接成兩年、warning 告警', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Dup Extend' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await expire(client, user.id);
    const t1 = `DUPE-A-${user.id}`;
    const t2 = `DUPE-B-${user.id}`;
    await insertOrder(client, user.id, t1, 'extend');
    await insertOrder(client, user.id, t2, 'extend');
    await complete(client, user.id, t1);
    await complete(client, user.id, t2);

    const rows = await subs(client, user.id);
    assertEquals(rows.length, 3);
    assertEquals(twDayOf(rows[2].start_date), twDayPlusDays(twDayOf(rows[1].end_date), 1));
    const alerts = await alertsFor(client, user.id, 'duplicate_payment');
    assertEquals(alerts.map((a) => a.severity), ['warning']);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('process_successful_payment：兩筆首購單並行完成 → 效期不重疊、恰一則告警', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Dup Concurrent' });
  const sql1 = postgres(DB_URL, { max: 1 });
  const sql2 = postgres(DB_URL, { max: 1 });
  try {
    const t1 = `DUPC-A-${user.id}`;
    const t2 = `DUPC-B-${user.id}`;
    await insertOrder(client, user.id, t1, null);
    await insertOrder(client, user.id, t2, null);
    const ok = JSON.stringify({ Status: 'SUCCESS' });
    const call = (sql: ReturnType<typeof postgres>, t: string) =>
      sql`select process_successful_payment(${user.id}::uuid, ${t}, ${t}, ${ok}::jsonb)`;
    const results = await Promise.allSettled([call(sql1, t1), call(sql2, t2)]);
    assertEquals(results.map((r) => r.status), ['fulfilled', 'fulfilled']);

    const rows = await subs(client, user.id);
    assertEquals(rows.length, 2);
    assertEquals(twDayOf(rows[1].start_date), twDayPlusDays(twDayOf(rows[0].end_date), 1));
    assertEquals((await alertsFor(client, user.id, 'duplicate_payment')).length, 1);
  } finally {
    await sql1.end();
    await sql2.end();
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('process_successful_payment：付款當下未在效期（對帳延遲開通）→ 不判重複', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Dup Late Heal' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await expire(client, user.id);
    const t = `DUPL-${user.id}`;
    await insertOrder(client, user.id, t, 'fresh');
    // 付款在昨天、今天才由對帳開通：付款那一刻已過期，不是重複付款。
    const yesterday = new Date(Date.now() - 86400_000);
    await client.from('payment_orders').update({ created_at: yesterday.toISOString() })
      .eq('transaction_id', t);
    const payTime = new Date(yesterday.getTime() + 8 * 3600_000).toISOString()
      .slice(0, 19).replace('T', ' ');
    const { error } = await client.rpc('process_successful_payment', {
      p_user_id: user.id,
      p_trade_no: t,
      p_transaction_id: t,
      p_payuni_response: { Status: 'SUCCESS', PayTime: payTime },
    });
    assertEquals(error, null);
    assertEquals((await alertsFor(client, user.id, 'duplicate_payment')).length, 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('process_successful_payment：告警寫入失敗時付款仍完成開通', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Dup Alert Fail' });
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const t1 = `DUPX-A-${user.id}`;
    const t2 = `DUPX-B-${user.id}`;
    await insertOrder(client, user.id, t1, null);
    await insertOrder(client, user.id, t2, null);
    await complete(client, user.id, t1);
    const ok = JSON.stringify({ Status: 'SUCCESS' });
    // 同一交易內把 log_system_alert 換成必定擲錯的版本（它本身會吞 insert 錯誤，只擋 insert
    // 測不到外層隔離），交易結束即復原。
    await sql.begin(async (tx) => {
      await tx`create or replace function public.log_system_alert(
        p_source text, p_severity text, p_message text, p_context jsonb default '{}'::jsonb)
        returns void language plpgsql as $f$ begin raise exception 'alert down'; end $f$`;
      await tx`select process_successful_payment(${user.id}::uuid, ${t2}, ${t2}, ${ok}::jsonb)`;
      const [row] = await tx`select status from payment_orders where transaction_id = ${t2}`;
      assertEquals(row.status, 'completed');
      throw new Error('rollback-test-tx');
    }).catch((e) => {
      if (!(e instanceof Error) || e.message !== 'rollback-test-tx') throw e;
    });
  } finally {
    await sql.end();
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('process_successful_payment：付款途中被停權 → 照開通並寫 error 告警', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Pay While Suspended' });
  try {
    const t = `PWS-${user.id}`;
    await insertOrder(client, user.id, t, null);
    await client.from('profiles').update({ suspended_at: new Date().toISOString() })
      .eq('id', user.id);
    await complete(client, user.id, t);

    const { data: order } = await client.from('payment_orders').select('status')
      .eq('transaction_id', t).single();
    assertEquals(order?.status, 'completed');
    const alerts = await alertsFor(client, user.id, 'payment_while_suspended');
    assertEquals(alerts.map((a) => a.severity), ['error']);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('payment_orders：已有未逾期 pending 單時 prepare 仍建新單（現況特徵）', async () => {
  // 舊單的 PayUni 頁在 ExpireDate 前仍可付，作廢擋不住付款、反讓對帳不追——所以不作廢，
  // 防線放在付款時點。S6 改 prepare 時這條會讓變動看得見。
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Two Pending' });
  try {
    for (const t of [`TP-A-${user.id}`, `TP-B-${user.id}`]) {
      const { data } = await client.rpc('prepare_payment_order', {
        p_user_id: user.id,
        p_trade_no: t,
        p_renewal_mode: null,
        p_referrer_user_id: null,
        p_referrer_code: null,
        p_referrer_source: null,
      });
      assertEquals(data?.outcome, 'ok');
    }
    const { count } = await client.from('payment_orders')
      .select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending');
    assertEquals(count, 2);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
