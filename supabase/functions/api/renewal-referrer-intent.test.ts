// ============================================================
// 新約換線意圖改存訂單（第 5 波 S6 階段 2；ref P0-1＝pay P0-1、ref P0-2、pay P1-1、
// pay P1-4、W5-49、W5-50、W5-52、W5-56）。全部以 SQL 直接呼叫 RPC（Edge 層歸階段 3）。
//
// prepare_payment_order 六參數版：意圖（被選推薦人、碼、source＝code／default／keep）
// 寫在訂單上，建單不動 profiles；鎖內依序回 not_found → suspended → active →
// paid_pending（帶 trade_no、寫告警）→ mode_required（曾訂閱者不帶模式）→ cycle。
// process_successful_payment：0a′ 曾訂閱者的 fresh 先取全域 advisory（在鎖 profiles 之前）；
// 0d 只有「續費者的 fresh、非重複付款、source 為 code／default」才在付款當下換線，
// 換線前重驗碼（W5-56）與成環（W5-49②），失敗＝不換線、帳本照清、error 告警。
// 付款交易內寫推薦人時 referred_by_changed_at 記付款時點（#167 閘門自洽，W5-52）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  getActiveReferralCode,
  payForUser,
  seedPaidAwaitingActivation,
} from './test-helpers.ts';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Client = ReturnType<typeof adminClient>;
type Sql = postgres.Sql;

let seq = 0;
const tradeNo = (tag: string) => `S6-${tag}-${Date.now()}-${seq++}`;

// 會員（付過一次款＝有訂閱、有自己的推薦碼）；有 upline 時以 upline 為推薦人付款。
async function member(client: Client, sql: Sql, ids: string[], name: string, upline?: string) {
  const u = await createTestUser(client, { name });
  ids.push(u.id);
  if (upline) {
    await sql`update public.profiles set referred_by_user_id = ${upline} where id = ${u.id}`;
  }
  assertEquals((await payForUser(client, u.id)).error, null);
  return u.id;
}

async function expire(sql: Sql, userId: string) {
  await sql`
    update public.subscriptions
    set end_date = now() - interval '10 days', grace_period_end = now() - interval '10 days'
    where user_id = ${userId}`;
}

async function prepare6(
  sql: Sql,
  userId: string,
  trade: string,
  mode: string | null,
  ref: { user: string | null; code: string | null; source: string | null } = {
    user: null,
    code: null,
    source: null,
  },
) {
  const [row] = await sql`
    select public.prepare_payment_order(
      p_user_id => ${userId}::uuid, p_trade_no => ${trade}, p_renewal_mode => ${mode},
      p_referrer_user_id => ${ref.user}::uuid, p_referrer_code => ${ref.code},
      p_referrer_source => ${ref.source}) as r`;
  return row.r as { outcome: string; trade_no?: string };
}

async function complete(sql: Sql, userId: string, trade: string, payTime?: string) {
  const resp = payTime ? { Status: 'SUCCESS', PayTime: payTime } : { Status: 'SUCCESS' };
  await sql`
    select public.process_successful_payment(
      ${userId}::uuid, ${trade}, ${trade}, ${sql.json(resp)})`;
}

async function referrerOf(sql: Sql, userId: string) {
  const [p] = await sql`select referred_by_user_id from public.profiles where id = ${userId}`;
  const [e] = await sql`
    select referrer_user_id from public.referral_edges where referee_user_id = ${userId}`;
  return { profile: p?.referred_by_user_id ?? null, edge: e?.referrer_user_id ?? null };
}

async function alerts(sql: Sql, source: string, userId: string) {
  return await sql`
    select severity, context from public.system_alerts
    where source = ${source}
      and (context->>'user_id' = ${userId} or context->>'referee' = ${userId})`;
}

async function gen1Of(sql: Sql, userId: string, trade: string) {
  const rows = await sql`
    select rt.user_id from public.reward_transactions rt
    join public.subscriptions s on s.id = rt.subscription_id
    where rt.type = 'referral_reward' and rt.generation = 1 and rt.referee_user_id = ${userId}
      and s.payment_transaction_id = ${trade}`;
  return rows[0]?.user_id ?? null;
}

async function ledgerResetCount(sql: Sql, userId: string) {
  const [r] = await sql`
    select count(*)::int as n from public.reward_transactions
    where user_id = ${userId} and type = 'ledger_reset'`;
  return r.n as number;
}

// 台北時間的 PayTime 字串（YYYY-MM-DD HH:MM:SS），minutesAgo 分鐘前。
function payTimeAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000 + 8 * 3600_000).toISOString()
    .slice(0, 19).replace('T', ' ');
}

Deno.test('prepare_payment_order：新約意圖只寫訂單、不動 profiles → 棄單改付續約仍歸原推薦人', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '意圖 原推薦人');
    const x = await member(client, sql, ids, '意圖 新推薦人');
    const m = await member(client, sql, ids, '意圖 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x);

    const fresh = tradeNo('ABANDON');
    assertEquals(
      (await prepare6(sql, m, fresh, 'fresh', { user: x, code: xCode, source: 'code' })).outcome,
      'ok',
    );
    assertEquals((await referrerOf(sql, m)).profile, y, '建單不動 profiles');

    const ext = tradeNo('EXTEND');
    assertEquals((await prepare6(sql, m, ext, 'extend')).outcome, 'ok');
    await complete(sql, m, ext);

    assertEquals(await referrerOf(sql, m), { profile: y, edge: y });
    assertEquals(await gen1Of(sql, m, ext), y, '續約獎金歸原推薦人');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：續費者的新約單付款成功 → 才換線且 profiles 與推薦邊一致', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '換線 原推薦人');
    const x = await member(client, sql, ids, '換線 新推薦人');
    const m = await member(client, sql, ids, '換線 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x);

    const t = tradeNo('FRESH');
    await prepare6(sql, m, t, 'fresh', { user: x, code: xCode, source: 'code' });
    await complete(sql, m, t);

    assertEquals(await referrerOf(sql, m), { profile: x, edge: x });
    assertEquals(await gen1Of(sql, m, t), x);
    const [p] = await sql`
      select referred_by_code, referred_by_is_default from public.profiles where id = ${m}`;
    assertEquals(p.referred_by_code, xCode);
    assertEquals(p.referred_by_is_default, false);
    assertEquals(await ledgerResetCount(sql, m), 1);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：新約換線記付款時點 → 刪掉 gen1 後自癒補得回來', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '時點 原推薦人');
    const x = await member(client, sql, ids, '時點 新推薦人');
    const m = await member(client, sql, ids, '時點 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x);

    const t = tradeNo('CHANGEDAT');
    await prepare6(sql, m, t, 'fresh', { user: x, code: xCode, source: 'code' });
    await complete(sql, m, t, payTimeAgo(60));

    const [r] = await sql`
      select p.referred_by_changed_at = po.completed_at as same
      from public.profiles p join public.payment_orders po on po.user_id = p.id
      where p.id = ${m} and po.transaction_id = ${t}`;
    assertEquals(r.same, true, 'changed_at 應等於付款時點，不是交易的 now()');

    await sql`
      delete from public.reward_transactions
      where referee_user_id = ${m} and generation = 1 and type = 'referral_reward'
        and subscription_id = (select id from public.subscriptions where payment_transaction_id = ${t})`;
    await sql`select public.repair_orphaned_payments(${m}::uuid)`;
    assertEquals(await gen1Of(sql, m, t), x, '#167 閘門放行換線那筆付款的自癒');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('track_referred_by_change：付款交易外改推薦人 → changed_at 仍記 now()', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '觸發器 推薦人');
    const u = await createTestUser(client, { name: '觸發器 會員' });
    ids.push(u.id);
    const [before] = await sql`select now() as t`;
    await sql`update public.profiles set referred_by_user_id = ${y} where id = ${u.id}`;
    const [r] = await sql`
      select referred_by_changed_at >= ${before.t} as fresh from public.profiles where id = ${u.id}`;
    assertEquals(r.fresh, true);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare_payment_order：曾訂閱者不帶續費模式 → mode_required、不建單', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const m = await member(client, sql, ids, '模式 會員');
    await expire(sql, m);
    const t = tradeNo('NOMODE');
    assertEquals((await prepare6(sql, m, t, null)).outcome, 'mode_required');
    const rows = await sql`select 1 from public.payment_orders where transaction_id = ${t}`;
    assertEquals(rows.length, 0);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare_payment_order：舊三參數版也套新檢查 → 曾訂閱者不帶模式回 mode_required', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const m = await member(client, sql, ids, '舊版 會員');
    await expire(sql, m);
    const [r] = await sql`
      select public.prepare_payment_order(${m}::uuid, ${tradeNo('LEGACY')}, null::text) as o`;
    assertEquals(r.o, 'mode_required');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare_payment_order：已付款待開通的單 → paid_pending 帶單號並寫一筆告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    // 續費者與首購者各一（首購者同樣適用：行為變更）。
    const renewer = await member(client, sql, ids, '待開通 續費者');
    await expire(sql, renewer);
    const first = await createTestUser(client, { name: '待開通 首購者' });
    ids.push(first.id);

    for (const uid of [renewer, first.id]) {
      const paid = await seedPaidAwaitingActivation(client, uid);
      const mode = uid === renewer ? 'extend' : null;
      const r1 = await prepare6(sql, uid, tradeNo('PP1'), mode);
      assertEquals(r1, { outcome: 'paid_pending', trade_no: paid });
      await prepare6(sql, uid, tradeNo('PP2'), mode);
      const a = await alerts(sql, 'checkout_blocked_paid_pending', uid);
      assertEquals(a.length, 1, '同一張單去重，只寫一筆');
    }
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare_payment_order：填自己推薦樹內的碼 → cycle；預設推薦人成環則改記 keep', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const m = await member(client, sql, ids, '建單環 會員');
    const d = await member(client, sql, ids, '建單環 一代', m);
    await expire(sql, m);
    const dCode = await getActiveReferralCode(client, d);

    assertEquals(
      (await prepare6(sql, m, tradeNo('CYC'), 'fresh', { user: d, code: dCode, source: 'code' }))
        .outcome,
      'cycle',
    );
    const t = tradeNo('CYCDEF');
    assertEquals(
      (await prepare6(sql, m, t, 'fresh', { user: d, code: dCode, source: 'default' })).outcome,
      'ok',
    );
    const [o] = await sql`
      select fresh_referrer_source from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.fresh_referrer_source, 'keep');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：付款當下才成環 → 不換線、帳本照清、error 告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '付時環 原推薦人');
    const x = await member(client, sql, ids, '付時環 新推薦人');
    const m = await member(client, sql, ids, '付時環 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x);
    const t = tradeNo('LATECYC');
    await prepare6(sql, m, t, 'fresh', { user: x, code: xCode, source: 'code' });
    // 建單後 X 換到 M 底下（X 成了 M 的一代）。
    await sql`
      insert into public.referral_edges (referee_user_id, referrer_user_id) values (${x}, ${m})
      on conflict (referee_user_id) do update set referrer_user_id = excluded.referrer_user_id`;
    await sql`update public.profiles set referred_by_user_id = ${m} where id = ${x}`;
    await complete(sql, m, t);

    assertEquals(await referrerOf(sql, m), { profile: y, edge: y });
    assertEquals(await ledgerResetCount(sql, m), 1, '使用者確認的是新約，帳本照清');
    const a = await alerts(sql, 'fresh_referrer_cycle', m);
    assertEquals(a.length, 1);
    assertEquals(a[0].severity, 'error');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：被選推薦人在付款前停權 → 不換線、帳本照清、error 告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '重驗 原推薦人');
    const x = await member(client, sql, ids, '重驗 新推薦人');
    const m = await member(client, sql, ids, '重驗 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x);
    const t = tradeNo('SUSP');
    await prepare6(sql, m, t, 'fresh', { user: x, code: xCode, source: 'code' });
    await sql`update public.profiles set suspended_at = now() where id = ${x}`;
    await complete(sql, m, t);

    assertEquals(await referrerOf(sql, m), { profile: y, edge: y });
    assertEquals(await ledgerResetCount(sql, m), 1);
    assertEquals((await alerts(sql, 'fresh_referrer_invalid', m)).length, 1);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：被選推薦人帳號已刪 → 不換線、error 告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '已刪 原推薦人');
    const x = await createTestUser(client, { name: '已刪 新推薦人' });
    assertEquals((await payForUser(client, x.id)).error, null);
    const m = await member(client, sql, ids, '已刪 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x.id);
    const t = tradeNo('GONE');
    await prepare6(sql, m, t, 'fresh', { user: x.id, code: xCode, source: 'code' });
    await deleteTestUsers(client, [x.id]);
    await complete(sql, m, t);

    assertEquals(await referrerOf(sql, m), { profile: y, edge: y });
    assertEquals((await alerts(sql, 'fresh_referrer_missing', m)).length, 1);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：換線段例外 → 付款照完成、不換線、error 告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  const fn = `s6_fail_rewire_${Date.now()}`;
  try {
    const y = await member(client, sql, ids, '例外 原推薦人');
    const x = await member(client, sql, ids, '例外 新推薦人');
    const m = await member(client, sql, ids, '例外 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x);
    // 只對這位會員的推薦人變更丟例外，模擬換線段失敗。
    await sql.unsafe(`
      create function public.${fn}() returns trigger language plpgsql as $f$
      begin
        if new.id = '${m}'::uuid and new.referred_by_user_id is distinct from old.referred_by_user_id
        then raise exception 'injected rewire failure'; end if;
        return new;
      end $f$;
      create trigger ${fn} before update on public.profiles
        for each row execute function public.${fn}();`);
    const t = tradeNo('BOOM');
    await prepare6(sql, m, t, 'fresh', { user: x, code: xCode, source: 'code' });
    await complete(sql, m, t);

    const [o] = await sql`select status from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.status, 'completed');
    assertEquals(await referrerOf(sql, m), { profile: y, edge: y });
    assertEquals((await alerts(sql, 'fresh_rewire_failed', m)).length, 1);
    const [g] = await sql`select current_setting('uknow.referred_by_changed_at', true) as v`;
    assert(!g.v, '例外後交易層設定不殘留');
  } finally {
    await sql.unsafe(`drop trigger if exists ${fn} on public.profiles;
      drop function if exists public.${fn}();`);
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：重複付款的新約單 → 不換線、重複告警帶換線意圖', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '重複 原推薦人');
    const x = await member(client, sql, ids, '重複 新推薦人');
    const m = await member(client, sql, ids, '重複 會員', y);
    await expire(sql, m);
    const xCode = await getActiveReferralCode(client, x);
    const first = tradeNo('DUP1');
    const second = tradeNo('DUP2');
    await prepare6(sql, m, first, 'extend');
    await prepare6(sql, m, second, 'fresh', { user: x, code: xCode, source: 'code' });
    await complete(sql, m, first);
    await complete(sql, m, second);

    assertEquals(await referrerOf(sql, m), { profile: y, edge: y });
    const a = await alerts(sql, 'duplicate_payment', m);
    assertEquals(a.length, 1);
    assertEquals(a[0].context.fresh_referrer_user_id, x);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：首購單帶新約意圖 → 不換線', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, sql, ids, '首購 推薦人');
    const x = await member(client, sql, ids, '首購 別人');
    const u = await createTestUser(client, { name: '首購 會員' });
    ids.push(u.id);
    await sql`update public.profiles set referred_by_user_id = ${y} where id = ${u.id}`;
    const xCode = await getActiveReferralCode(client, x);
    const t = tradeNo('FIRSTFRESH');
    await prepare6(sql, u.id, t, 'fresh', { user: x, code: xCode, source: 'code' });
    await complete(sql, u.id, t);
    assertEquals(await referrerOf(sql, u.id), { profile: y, edge: y });
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：曾訂閱者的無模式單走到付款 → 照常開通並寫 error 告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const m = await member(client, sql, ids, '無模式 會員');
    await expire(sql, m);
    const t = tradeNo('NULLPAY');
    await sql`
      insert into public.payment_orders (user_id, amount, status, payment_method, transaction_id)
      values (${m}, 1200, 'pending', 'payuni', ${t})`;
    await complete(sql, m, t);
    const [o] = await sql`select status from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.status, 'completed');
    const a = await alerts(sql, 'renewal_without_mode', m);
    assertEquals(a.length, 1);
    assertEquals(a[0].severity, 'error');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare_payment_order：六參數與三參數版都只給 service_role 執行', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    for (const sig of ['uuid, text, text', 'uuid, text, text, uuid, text, text']) {
      for (const role of ['anon', 'authenticated']) {
        const [r] = await sql`
          select has_function_privilege(${role},
            ${`public.prepare_payment_order(${sig})`}, 'execute') as ok`;
        assertEquals(r.ok, false, `${role} 不得執行 (${sig})`);
      }
    }
    const defaults = await sql`
      select pronargdefaults from pg_proc
      where proname = 'prepare_payment_order' and pronargs = 6`;
    assertEquals(defaults[0].pronargdefaults, 0, '六參數版不得有 default（PostgREST 多載歧義）');
  } finally {
    await sql.end();
  }
});

// ---------------------------------------------------------------
// 併發：第三條連線先持住換線鎖，讓兩筆付款確定地在鎖前排隊，再放鎖。
// ---------------------------------------------------------------
async function waitForAdvisoryWaiters(sql: Sql | postgres.TransactionSql, n: number) {
  for (let i = 0; i < 100; i++) {
    // pg_stat_activity 在同一個交易內只快照一次（stats_fetch_consistency）；持鎖的交易裡
    // 輪詢必須先清快照，否則永遠看不到後來才排隊的人。
    await sql`select pg_stat_clear_snapshot()`;
    const [r] = await sql`
      select count(*)::int as n from pg_stat_activity
      where wait_event_type = 'Lock' and wait_event = 'advisory'`;
    if (r.n >= n) return;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error(`等不到 ${n} 個 advisory 等待者`);
}

async function noAlertsFor(sql: Sql, userIds: string[]) {
  const rows = await sql`
    select source from public.system_alerts
    where context->>'user_id' = any(${userIds}) or context->>'referee' = any(${userIds})`;
  return rows.map((r) => r.source);
}

Deno.test('process_successful_payment：會員與其推薦人同時付新約 → 等鎖時不持 profiles、兩筆都完成', async () => {
  const client = adminClient();
  const holder = postgres(DB_URL, { max: 1 });
  const c1 = postgres(DB_URL, { max: 1 });
  const c2 = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const top = await member(client, c1, ids, '併發 頂層');
    const x = await member(client, c1, ids, '併發 新推薦人');
    const u = await member(client, c1, ids, '併發 推薦人 U', top);
    const a = await member(client, c1, ids, '併發 會員 A', u);
    await expire(c1, u);
    await expire(c1, a);
    const xCode = await getActiveReferralCode(client, x);
    const uCode = await getActiveReferralCode(client, u);
    const ta = tradeNo('CONA');
    const tu = tradeNo('CONU');
    // A 填回現任推薦人 U 的碼（新約照樣清帳本）；U 換到 X。A 的發獎要對 profiles(U)
    // 取 KEY SHARE——若 U 先持 profiles(U) 再等換線鎖，就會與 A 互等（第 2 輪系統 P1）。
    await prepare6(c1, a, ta, 'fresh', { user: u, code: uCode, source: 'code' });
    await prepare6(c1, u, tu, 'fresh', { user: x, code: xCode, source: 'code' });

    let pending: Promise<unknown>[] = [];
    await holder.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('referral_rewire'))`;
      pending = [complete(c1, a, ta), complete(c2, u, tu)];
      await waitForAdvisoryWaiters(tx, 2);
      // 等待方只持有自己的訂單列鎖：holder 鎖得到兩人的 profiles。
      await tx`select 1 from public.profiles where id in (${a}, ${u}) for update nowait`;
    });
    const [ra, ru] = await Promise.allSettled(pending);
    assertEquals(ra.status, 'fulfilled');
    assertEquals(ru.status, 'fulfilled');

    const gens = await c1`
      select referee_user_id, generation from public.reward_transactions
      where type = 'referral_reward' and referee_user_id in (${a}, ${u})
        and subscription_id in (select id from public.subscriptions
                                where payment_transaction_id in (${ta}, ${tu}))`;
    assert(gens.filter((g) => g.referee_user_id === a).length >= 1);
    assert(gens.filter((g) => g.referee_user_id === u).length >= 1);
    assertEquals(await noAlertsFor(c1, [a, u]), [], '不得有靜默吞掉的死鎖或發獎失敗');
  } finally {
    await holder.end();
    await c1.end();
    await c2.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('process_successful_payment：兩人互選對方同時付新約 → 恰一方換線、另一方成環告警', async () => {
  const client = adminClient();
  const holder = postgres(DB_URL, { max: 1 });
  const c1 = postgres(DB_URL, { max: 1 });
  const c2 = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const top = await member(client, c1, ids, '互選 頂層');
    const a = await member(client, c1, ids, '互選 A', top);
    const b = await member(client, c1, ids, '互選 B', top);
    await expire(c1, a);
    await expire(c1, b);
    const aCode = await getActiveReferralCode(client, a);
    const bCode = await getActiveReferralCode(client, b);
    const ta = tradeNo('MUTA');
    const tb = tradeNo('MUTB');
    await prepare6(c1, a, ta, 'fresh', { user: b, code: bCode, source: 'code' });
    await prepare6(c1, b, tb, 'fresh', { user: a, code: aCode, source: 'code' });

    let pending: Promise<unknown>[] = [];
    await holder.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('referral_rewire'))`;
      pending = [complete(c1, a, ta), complete(c2, b, tb)];
      await waitForAdvisoryWaiters(tx, 2);
    });
    const results = await Promise.allSettled(pending);
    assert(results.every((r) => r.status === 'fulfilled'));

    const ra = await referrerOf(c1, a);
    const rb = await referrerOf(c1, b);
    const rewired = [ra.edge === b, rb.edge === a].filter(Boolean).length;
    assertEquals(rewired, 1, '恰一方換線');
    const cyc = [
      ...(await alerts(c1, 'fresh_referrer_cycle', a)),
      ...(await alerts(c1, 'fresh_referrer_cycle', b)),
    ];
    assertEquals(cyc.length, 1);
  } finally {
    await holder.end();
    await c1.end();
    await c2.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('prepare_payment_order：被選推薦人的付款正在等換線鎖 → 建單不被卡住', async () => {
  const client = adminClient();
  const holder = postgres(DB_URL, { max: 1 });
  const c1 = postgres(DB_URL, { max: 1 });
  const c2 = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const y = await member(client, c1, ids, '建單併發 原推薦人');
    const z = await member(client, c1, ids, '建單併發 X 的新推薦人');
    const x = await member(client, c1, ids, '建單併發 X', y);
    const m = await member(client, c1, ids, '建單併發 會員', y);
    await expire(c1, x);
    await expire(c1, m);
    const zCode = await getActiveReferralCode(client, z);
    const xCode = await getActiveReferralCode(client, x);
    const tx1 = tradeNo('XPAY');
    await prepare6(c1, x, tx1, 'fresh', { user: z, code: zCode, source: 'code' });

    let xPay: Promise<unknown> = Promise.resolve();
    await holder.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('referral_rewire'))`;
      xPay = complete(c1, x, tx1);
      await waitForAdvisoryWaiters(tx, 1);
      const r = await Promise.race([
        prepare6(c2, m, tradeNo('MPREP'), 'fresh', { user: x, code: xCode, source: 'code' }),
        new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), 3000)),
      ]);
      assertEquals(r, { outcome: 'ok' });
    });
    await xPay;
  } finally {
    await holder.end();
    await c1.end();
    await c2.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('complete_paid_pending_orders：換線鎖被占用 → 該筆跳過不報錯、鎖釋放後下一輪補完（W5-61）', async () => {
  const client = adminClient();
  const holder = postgres(DB_URL, { max: 1 });
  // statement_timeout：修正前批次會在這裡等鎖，讓紅燈以逾時呈現而不是卡住整套測試。
  const sql = postgres(DB_URL, { max: 1, connection: { statement_timeout: 10_000 } });
  const ids: string[] = [];
  try {
    const m = await member(client, sql, ids, '批次 會員');
    await expire(sql, m);
    const t = tradeNo('BATCH');
    await prepare6(sql, m, t, 'fresh', { user: null, code: null, source: 'keep' });
    await sql`
      update public.payment_orders
      set payuni_response = ${sql.json({ Status: 'SUCCESS', TradeAmt: '1200' })}
      where transaction_id = ${t}`;

    let first: { skipped_locked: number; completed_count: number; failed: unknown[] } | null = null;
    await holder.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('referral_rewire'))`;
      const [r] = await sql`select public.complete_paid_pending_orders(${m}::uuid) as r`;
      first = r.r;
    });
    assertEquals(first!.skipped_locked, 1, '拿不到換線鎖 → 跳過');
    assertEquals(first!.completed_count, 0);
    assertEquals(first!.failed, [], '跳過不是失敗');
    const [o] = await sql`select status from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.status, 'pending');
    const [al] = await sql`
      select count(*)::int as n from public.system_alerts
      where source = 'complete_paid_pending_orders' and context->>'order_id' =
        (select id::text from public.payment_orders where transaction_id = ${t})`;
    assertEquals(al.n, 0, '不寫錯誤告警');

    const [again] = await sql`select public.complete_paid_pending_orders(${m}::uuid) as r`;
    assertEquals(again.r.completed_count, 1, '下一輪補完');
  } finally {
    await holder.end();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});
