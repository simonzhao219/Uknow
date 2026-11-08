// ============================================================
// 三代獎金沒發出 → error 告警（第 6 波 S1；W6-10、W6-12）。
//
// 修正前：pay_referral_generations 各代的 when others 只寫 warning（推不到 LINE），訊息就是
// sqlerrm，客服看不出哪筆付款、哪一代、該給誰。修正後：除 unique_violation（冪等）外一律
// error；LINE 只帶 message，所以前 200 字要放完結論、單號、第幾代、推薦碼、下一步。
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

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Sql = postgres.Sql;
type Alert = { severity: string; message: string; context: Record<string, unknown> };

let seq = 0;
const tradeNo = (tag: string) => `S1A-${tag}-${Date.now()}-${seq++}`;
const BANNED = ['上線', '下線', '傳銷', '直銷'];

function assertReadable(a: Alert) {
  const head = a.message.slice(0, 200);
  assert(head.includes('下一步'), `前 200 字要有下一步：${a.message}`);
  // W6-23：下一步交給 Claude Code session 照 runbook 處理，不寫「通知工程人員」。
  assert(
    head.includes('下一步：開一個 Claude Code session，請它依 supabase/README〈補發漏發獎金〉核對'),
    `下一步要指向 Claude Code session 與 runbook：${a.message}`,
  );
  assert(!a.message.includes('通知工程人員'), a.message);
  for (const w of BANNED) assert(!a.message.includes(w), `不得出現「${w}」：${a.message}`);
}

async function alertsSince(sql: Sql, since: string, referee: string): Promise<Alert[]> {
  return (await sql`
    select severity, message, context from public.system_alerts
    where source = 'pay_referral_generations' and created_at >= ${since}
      and context->>'referee' = ${referee}
    order by created_at`) as unknown as Alert[];
}

// 以觸發器讓「某位受益人」的獎金插入擲錯；回傳拆除函式。
async function failRewardsFor(sql: Sql, beneficiary: string, tag: string) {
  const fn = `s1_fail_${tag}`;
  await sql.unsafe(`
    create or replace function public.${fn}() returns trigger language plpgsql as $f$
    begin
      if new.user_id = '${beneficiary}'::uuid and new.type = 'referral_reward' then
        raise exception 'injected reward failure';
      end if;
      return new;
    end $f$;
    create trigger ${fn} before insert on public.reward_transactions
      for each row execute function public.${fn}();`);
  return async () => {
    await sql.unsafe(`drop trigger if exists ${fn} on public.reward_transactions;
      drop function if exists public.${fn}();`);
  };
}

Deno.test('pay_referral_generations：第 2 代插入擲錯 → error 告警帶單號／代數／推薦碼、其他代照發', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  let teardown = async () => {};
  try {
    // Z ← A ← B ← C：C 付款時 gen1＝B、gen2＝A、gen3＝Z。推薦邊由各自付款建立。
    const chain: string[] = [];
    for (const name of ['鏈 甲', '鏈 乙', '鏈 丙', '鏈 丁']) {
      const u = (await createTestUser(client, { name })).id;
      ids.push(u);
      const up = chain[chain.length - 1];
      if (up) await sql`update public.profiles set referred_by_user_id = ${up} where id = ${u}`;
      if (chain.length < 3) assertEquals((await payForUser(client, u)).error, null);
      chain.push(u);
    }
    const [z, a, b, c] = chain;
    const aCode = await getActiveReferralCode(client, a);
    teardown = await failRewardsFor(sql, a, 'gen2');
    const since = new Date().toISOString();
    const t = crypto.randomUUID(); // 36 字元：最長單號下前 200 字仍要放得下下一步
    assertEquals((await payForUser(client, c, { tradeNo: t })).error, null);

    const alerts = await alertsSince(sql, since, c);
    assertEquals(alerts.length, 1, JSON.stringify(alerts));
    const [al] = alerts;
    assertEquals(al.severity, 'error');
    assert(al.message.startsWith('【獎金未發】'), al.message);
    assert(al.message.includes(`付款單 ${t}`), al.message);
    assert(al.message.includes('第 2 代'), al.message);
    assert(al.message.includes(`推薦碼 ${aCode}`), al.message);
    assert(al.message.includes('系統錯誤'), al.message);
    assert(
      !al.message.includes('injected reward failure'),
      'LINE 是外部通道：原始錯誤只放 context',
    );
    assertEquals(al.context.sqlerrm, 'injected reward failure');
    assertEquals(al.context.amount, 100);
    assertReadable(al);
    assertEquals(
      {
        generation: al.context.generation,
        beneficiary: al.context.beneficiary,
        trade_no: al.context.trade_no,
        sqlstate: al.context.sqlstate,
      },
      { generation: 2, beneficiary: a, trade_no: t, sqlstate: 'P0001' },
    );

    const paid = await sql`
      select generation, user_id from public.reward_transactions
      where referee_user_id = ${c} and type = 'referral_reward' order by generation`;
    assertEquals(paid.map((r) => [r.generation, r.user_id]), [[1, b], [3, z]]);
  } finally {
    await teardown();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('pay_referral_generations：任務續約路徑失敗 → 訊息寫「任務續約」而非付款單', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  let teardown = async () => {};
  try {
    const up = (await createTestUser(client, { name: '續約 推薦人' })).id;
    ids.push(up);
    assertEquals((await payForUser(client, up)).error, null);
    const me = (await createTestUser(client, { name: '續約 會員' })).id;
    ids.push(me);
    await sql`update public.profiles set referred_by_user_id = ${up} where id = ${me}`;
    teardown = await failRewardsFor(sql, up, 'claim');
    const since = new Date().toISOString();
    const claimId = crypto.randomUUID();
    await sql`select public.pay_referral_generations(${me}::uuid, 100, null, ${claimId}::uuid, '（任務續約）')`;

    const [al] = await alertsSince(sql, since, me);
    assertEquals(al?.severity, 'error');
    assert(al.message.includes(`任務續約 ${claimId.slice(0, 8)}`), al.message);
    assert(!al.message.includes('付款單'), al.message);
    assertReadable(al);
  } finally {
    await teardown();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('pay_referral_generations：查不到付款單號 → 告警照寫、訊息為「查無單號」', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const up = (await createTestUser(client, { name: '查無 推薦人' })).id;
    ids.push(up);
    assertEquals((await payForUser(client, up)).error, null);
    const me = (await createTestUser(client, { name: '查無 會員' })).id;
    ids.push(me);
    await sql`update public.profiles set referred_by_user_id = ${up} where id = ${me}`;
    const since = new Date().toISOString();
    // 不存在的訂閱：插入撞 FK（非預期錯誤），反查單號也查不到。
    await sql`select public.pay_referral_generations(${me}::uuid, 100, ${crypto.randomUUID()}::uuid, null, '')`;

    const [al] = await alertsSince(sql, since, me);
    assertEquals(al?.severity, 'error');
    assert(al.message.includes('付款單（查無單號）'), al.message);
    assertEquals(al.context.sqlstate, '23503');
    assertReadable(al);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('complete_paid_pending_orders：舊 wrapper 與線上付款互鎖 → 受害那代寫 error 帶 40P01', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 2, connection: { statement_timeout: 20_000 } });
  const healConn = postgres(DB_URL, { max: 1, connection: { statement_timeout: 20_000 } });
  const holder = postgres(DB_URL, { max: 1, connection: { statement_timeout: 20_000 } });
  const ids: string[] = [];
  try {
    const foreign = await sql`
      select id from public.payment_orders
      where status = 'pending' and payuni_response->>'Status' = 'SUCCESS'`;
    assertEquals(foreign.map((r) => r.id), [], '資料庫裡不該有本測試以外的待開通單');

    const u1 = (await createTestUser(client, { name: '舊批 一' })).id;
    ids.push(u1);
    assertEquals((await payForUser(client, u1)).error, null);
    const x = (await createTestUser(client, { name: '舊批 叉' })).id;
    ids.push(x);
    await sql`update public.profiles set referred_by_user_id = ${u1} where id = ${x}`;
    assertEquals((await payForUser(client, x)).error, null);
    const u2 = (await createTestUser(client, { name: '舊批 二' })).id;
    ids.push(u2);
    await sql`update public.profiles set referred_by_user_id = ${x} where id = ${u2}`;
    await sql`
      update public.subscriptions
      set end_date = now() - interval '10 days', grace_period_end = now() - interval '10 days'
      where user_id in (${u1}, ${x})`;
    const codes = {
      [u1]: await getActiveReferralCode(client, u1),
      [x]: await getActiveReferralCode(client, x),
    };

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
    const since = new Date().toISOString();

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
    // 舊 Edge 的呼叫方式：一次 RPC＝一個交易跑完整批。
    const heal = healConn`select public.complete_paid_pending_orders(null, 50) as r`.execute();

    let blocked = false;
    for (let i = 0; i < 100 && !blocked; i++) {
      const rows = await sql`
        select 1 from pg_stat_activity where ${bPid}::int = any(pg_blocking_pids(pid))`;
      blocked = rows.length > 0;
      if (!blocked) await new Promise((r) => setTimeout(r, 100));
    }
    releaseB();
    assert(blocked, '編排失敗：wrapper 沒有在 10 秒內被 profiles(X) 擋住');
    await online.catch(() => {});
    await heal.catch(() => {});

    const victims = [
      ...(await alertsSince(sql, since, x)).map((a) => ({ a, trade: tX, beneficiary: u1 })),
      ...(await alertsSince(sql, since, u2)).map((a) => ({ a, trade: tU2, beneficiary: x })),
    ];
    assertEquals(victims.length, 1, JSON.stringify(victims.map((v) => v.a.message)));
    const [{ a, trade, beneficiary }] = victims;
    assertEquals(a.severity, 'error');
    assertEquals(a.context.sqlstate, '40P01');
    assertEquals(a.context.beneficiary, beneficiary);
    assert(a.message.includes(`付款單 ${trade}`), a.message);
    assert(a.message.includes('第 1 代'), a.message);
    assert(a.message.includes(`推薦碼 ${codes[beneficiary]}`), a.message);
    assert(a.message.includes('資料庫互鎖'), a.message);
    assertReadable(a);
  } finally {
    await holder.end();
    await healConn.end();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('apply_referral_side_effects：三代整批發獎擲錯 → error 告警帶第 1 代推薦碼與每代點數', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const up = (await createTestUser(client, { name: '整批 推薦人' })).id;
    ids.push(up);
    assertEquals((await payForUser(client, up)).error, null);
    const upCode = await getActiveReferralCode(client, up);
    const me = (await createTestUser(client, { name: '整批 會員' })).id;
    ids.push(me);
    await sql`update public.profiles set referred_by_user_id = ${up} where id = ${me}`;
    const t = tradeNo('BATCH3C');
    assertEquals((await payForUser(client, me, { tradeNo: t })).error, null);
    const [{ sub }] = await sql`select id as sub from public.subscriptions where user_id = ${me}`;

    // 交易內暫時讓整支發獎函式擲錯，讀完告警就回滾（函式與告警一起還原）。
    let al: Alert | undefined;
    await sql.begin(async (tx) => {
      await tx.unsafe(`
        create or replace function public.pay_referral_generations(
          p_referee uuid, p_amount int, p_subscription_id uuid default null,
          p_claim_id uuid default null, p_description_tag text default '')
        returns text[] language plpgsql as $f$
        begin raise exception 'injected batch failure'; end $f$;`);
      await tx`select public.apply_referral_side_effects(${me}::uuid, ${sub}::uuid, now())`;
      [al] = (await tx`
        select severity, message, context from public.system_alerts
        where source = 'apply_referral_side_effects' and context->>'referee' = ${me}
        order by created_at desc limit 1`) as unknown as Alert[];
      throw new Error('rollback');
    }).catch((e) => {
      if ((e as Error).message !== 'rollback') throw e;
    });

    assertEquals(al?.severity, 'error');
    assert(al!.message.includes(`付款單 ${t}`), al!.message);
    assert(al!.message.includes('三代推薦獎金整批'), al!.message);
    assert(al!.message.includes(`第 1 代推薦人推薦碼 ${upCode}`), al!.message);
    assert(al!.message.includes('每代 100 點'), al!.message);
    assert(al!.message.includes('核對三代並補發'), al!.message);
    assert(!al!.message.includes('injected batch failure'), al!.message);
    assertReadable(al!);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});
