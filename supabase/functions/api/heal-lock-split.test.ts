// ============================================================
// 批次自癒與線上付款互鎖（第 6 波 S1；R5 P2-5；W5-72）。
//
// 拓撲：U1 是 X 的推薦人、X 是 U2 的推薦人。U1、U2 各有一張「已付款待開通」單，
// 排程 heal 跑的同時 X 線上付款。
//
// 修正前：heal 是單一交易（complete_paid_pending_orders 迴圈），處理完 U1 那筆後
// profiles(U1) 的 for update 留到整批結束；處理 U2 發第 1 代給 X 要 KEY SHARE
// profiles(X)，等 X；X 的付款發第 1 代給 U1 要 KEY SHARE profiles(U1)，等 heal → 40P01，
// 被選中的一方該代獎金被 when others 吞掉。
// 修正後：heal 由 Edge 逐筆呼叫單筆 RPC，一筆一個交易，U1 那筆早已 commit。
//
// 編排不靠機率：連線 B 先鎖住 profiles(X)（模擬 X 的付款已過 0b），等 heal 被 B 擋住
// （pg_blocking_pids）後，B 才在同交易內跑 X 的付款。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  payForUser,
} from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let seq = 0;
const tradeNo = (tag: string) => `S1-${tag}-${Date.now()}-${seq++}`;

Deno.test('排程 heal：與線上付款交錯（U1←X←U2）→ 兩筆第 1 代都發、無死鎖', async () => {
  ensureEdgeFunctionEnv();
  const prevSecret = Deno.env.get('RECONCILE_SECRET');
  Deno.env.set('RECONCILE_SECRET', 'test-heal-lock-secret');
  const { app } = await import('./index.ts');
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 2, connection: { statement_timeout: 20_000 } });
  const holder = postgres(DB_URL, { max: 1, connection: { statement_timeout: 20_000 } });
  const ids: string[] = [];
  const startedAt = new Date().toISOString();
  try {
    // 前置：全域掃描是正式路徑，不改它來遷就測試——外來的待開通單會改變處理順序。
    const foreign = await sql`
      select id from public.payment_orders
      where status = 'pending' and payuni_response->>'Status' = 'SUCCESS'`;
    assertEquals(foreign.map((r) => r.id), [], '資料庫裡不該有本測試以外的待開通單');
    const [{ deadlock_timeout }] = await sql`show deadlock_timeout`;
    assertEquals(deadlock_timeout, '1s');

    const u1 = (await createTestUser(client, { name: '互鎖 一' })).id;
    ids.push(u1);
    assertEquals((await payForUser(client, u1)).error, null);
    const x = (await createTestUser(client, { name: '互鎖 叉' })).id;
    ids.push(x);
    await sql`update public.profiles set referred_by_user_id = ${u1} where id = ${x}`;
    assertEquals((await payForUser(client, x)).error, null);
    const u2 = (await createTestUser(client, { name: '互鎖 二' })).id;
    ids.push(u2);
    await sql`update public.profiles set referred_by_user_id = ${x} where id = ${u2}`;
    // 讓 U1、X 不在效期內：避開重複付款判定，這兩筆都是正常續約。
    await sql`
      update public.subscriptions
      set end_date = now() - interval '10 days', grace_period_end = now() - interval '10 days'
      where user_id in (${u1}, ${x})`;

    const paid = { Status: 'SUCCESS', TradeAmt: '1200' };
    const tU1 = tradeNo('U1');
    const tU2 = tradeNo('U2');
    const tX = tradeNo('X');
    await sql`
      insert into public.payment_orders
        (user_id, amount, status, payment_method, transaction_id, renewal_mode, payuni_response, created_at)
      values
        (${u1}, 1200, 'pending', 'payuni', ${tU1}, 'extend', ${
      sql.json(paid)
    }, now() - interval '2 minutes'),
        (${u2}, 1200, 'pending', 'payuni', ${tU2}, null, ${
      sql.json(paid)
    }, now() - interval '1 minute'),
        (${x}, 1200, 'pending', 'payuni', ${tX}, 'extend', null, now())`;

    let releaseB!: () => void;
    const healBlocked = new Promise<void>((r) => (releaseB = r));
    let bPid = 0;
    let bReady!: () => void;
    const bLocked = new Promise<void>((r) => (bReady = r));

    const online = holder.begin(async (tx) => {
      const [{ pid }] = await tx`select pg_backend_pid() as pid`;
      bPid = pid;
      await tx`select 1 from public.profiles where id = ${x} for update`;
      bReady();
      await healBlocked;
      await tx`select public.process_successful_payment(${x}::uuid, ${tX}, ${tX}, ${
        tx.json(paid)
      })`;
    });
    await bLocked;

    const heal = app.request('/api/internal/reconcile-pending-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-heal-lock-secret' },
      body: JSON.stringify({ trigger: 'manual' }),
    });

    // 等 heal 被 B 擋住（處理 U2、發第 1 代給 X）。上限 10 秒；逾時＝編排失敗，不是紅燈。
    let blocked = false;
    for (let i = 0; i < 100 && !blocked; i++) {
      const rows = await sql`
        select 1 from pg_stat_activity where ${bPid}::int = any(pg_blocking_pids(pid))`;
      blocked = rows.length > 0;
      if (!blocked) await new Promise((r) => setTimeout(r, 100));
    }
    releaseB();
    assert(blocked, '編排失敗：heal 沒有在 10 秒內被 profiles(X) 擋住');

    await online.catch(() => {});
    const res = await heal;
    await res.body?.cancel();

    const [xToU1] = await sql`
      select count(*)::int as n from public.reward_transactions
      where referee_user_id = ${x} and generation = 1 and user_id = ${u1}`;
    const [u2ToX] = await sql`
      select count(*)::int as n from public.reward_transactions
      where referee_user_id = ${u2} and generation = 1 and user_id = ${x}`;
    const statuses = await sql`
      select status from public.payment_orders where transaction_id in ${sql([tU1, tU2, tX])}`;
    assertEquals(
      statuses.map((r) => r.status),
      ['completed', 'completed', 'completed'],
      '三筆都開通',
    );
    const deadlocks = await sql`
      select source, message from public.system_alerts
      where created_at >= ${startedAt}
        and (context->>'sqlstate' = '40P01' or message ilike '%deadlock detected%')`;
    assertEquals(
      { xToU1: xToU1.n, u2ToX: u2ToX.n, deadlocks: deadlocks.length },
      { xToU1: 2, u2ToX: 1, deadlocks: 0 },
      'X 的兩次付款各發一筆第 1 代給 U1、U2 發一筆給 X，且沒有死鎖告警',
    );
  } finally {
    if (prevSecret === undefined) Deno.env.delete('RECONCILE_SECRET');
    else Deno.env.set('RECONCILE_SECRET', prevSecret);
    await holder.end();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});
