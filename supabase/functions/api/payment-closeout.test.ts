// ============================================================
// 第 7 波 S4 金流收尾（migration 20261125000001_payment_closeout）：
//   1. drop 單交易 wrapper complete_paid_pending_orders（W6-14→W6-30）
//   2. apply_referral_side_effects 3a-bis／3b／3d 失敗升 error（W7-9、W7-10）
//   3. complete_paid_pending_order 單筆開通失敗告警：message 固定行動句、sqlerrm 只進 context
//   4. repair_orphaned_* 關掉單交易全量路徑（null → U6R02，W7-9 Q1＝A）
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

const BANNED = ['上線', '下線', '傳銷', '直銷'];
let seq = 0;
// 正式單號是 20 碼 MerTradeNo（台灣日期時間 14 碼＋6 碼）：前 60 字的斷言以真實長度為準。
const tradeNo20 = () => `PC${String(Date.now()).slice(-12)}${String(seq++).padStart(6, '0')}`;

// W6-24：LINE 推播每則只取 message 前 60 字。
function assertLine(a: Alert, words: string[]) {
  const line = a.message.slice(0, 60);
  for (const w of ['請開 Claude', ...words]) {
    assert(line.includes(w), `LINE 前 60 字要有「${w}」：${line}`);
  }
}

// 整則 message 不得含原始錯誤、uid、禁用詞（LINE 與後台都看得到全文）。
function assertClean(a: Alert, forbidden: string[]) {
  for (const w of [...forbidden, ...BANNED]) {
    assert(!a.message.includes(w), `message 不得含「${w}」：${a.message}`);
  }
}

async function sideEffectAlerts(sql: Sql, userId: string, step: string): Promise<Alert[]> {
  return (await sql`
    select severity, message, context from public.system_alerts
    where source = 'apply_referral_side_effects' and context->>'user_id' = ${userId}
      and context->>'step' = ${step}
    order by created_at`) as unknown as Alert[];
}

// 以觸發器讓某張表對指定會員的寫入擲錯；回傳拆除函式。
async function failWrite(sql: Sql, table: string, when: string, tag: string, op = 'insert') {
  const fn = `s4_fail_${tag}`;
  await sql.unsafe(`
    create or replace function public.${fn}() returns trigger language plpgsql as $f$
    begin
      if ${when} then raise exception 'injected ${tag} failure'; end if;
      return new;
    end $f$;
    create trigger ${fn} before ${op} on public.${table}
      for each row execute function public.${fn}();`);
  return async () => {
    await sql.unsafe(`drop trigger if exists ${fn} on public.${table};
      drop function if exists public.${fn}();`);
  };
}

// 推薦人 R（已付款、有碼）與被推薦的會員 M（未付款）。
async function referrerAndMember(client: ReturnType<typeof adminClient>, ids: string[]) {
  const r = (await createTestUser(client, { name: '收尾 推薦人' })).id;
  ids.push(r);
  assertEquals((await payForUser(client, r)).error, null);
  const code = await getActiveReferralCode(client, r);
  const m = (await createTestUser(client, { name: '收尾 會員', referredByCode: code })).id;
  ids.push(m);
  return { r, m, code };
}

async function gen1Paid(sql: Sql, m: string, r: string) {
  const rows = await sql`
    select user_id from public.reward_transactions
    where referee_user_id = ${m} and type = 'referral_reward' and generation = 1`;
  return rows.length === 1 && rows[0].user_id === r;
}

const LOG_SIG = 'public.log_referral_side_effect_failure(text, uuid, uuid, uuid, text, text)';

Deno.test('complete_paid_pending_orders：wrapper 已 drop → 函式不存在', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const [r] = await sql`
      select to_regprocedure('public.complete_paid_pending_orders(uuid,int)') is null as gone`;
    assertEquals(r.gone, true, '單交易 wrapper 應已移除，只留逐筆的 complete_paid_pending_order');
  } finally {
    await sql.end();
  }
});
Deno.test('apply_referral_side_effects：3b 寫推薦連結擲錯 → error 告警、付款與第 1 代照常', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  let teardown = async () => {};
  try {
    const { r, m, code } = await referrerAndMember(client, ids);
    teardown = await failWrite(sql, 'referral_edges', `new.referee_user_id = '${m}'::uuid`, 'edge');
    const t = tradeNo20();
    assertEquals((await payForUser(client, m, { tradeNo: t })).error, null);

    const [o] = await sql`select status from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.status, 'completed', '付款開通不受 3b 影響');
    assert(await gen1Paid(sql, m, r), '3c 第 1 代照發');

    const alerts = await sideEffectAlerts(sql, m, 'referral_edge');
    assertEquals(alerts.length, 1, JSON.stringify(alerts));
    const [a] = alerts;
    assertEquals(a.severity, 'error');
    assert(a.message.startsWith('【推薦連結未寫入・請開 Claude 補寫】'), a.message);
    assertLine(a, [t, '二代三代獎金會漏發']);
    assert(a.message.includes(`推薦碼 ${code}`), a.message);
    assert(a.message.includes('〈補寫推薦連結〉'), a.message);
    assertClean(a, ['injected', m, r]);
    assertEquals(
      [a.context.sqlerrm, a.context.trade_no, a.context.referrer_id, a.context.sqlstate],
      ['injected edge failure', t, r, 'P0001'],
    );
  } finally {
    await teardown();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('apply_referral_side_effects：3b 持續失敗重跑 → 只留一筆未處理告警（含無訂閱）', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  let teardown = async () => {};
  try {
    const { m } = await referrerAndMember(client, ids);
    teardown = await failWrite(
      sql,
      'referral_edges',
      `new.referee_user_id = '${m}'::uuid`,
      'edge2',
    );
    for (let i = 0; i < 2; i++) {
      await sql`select public.apply_referral_side_effects(${m}::uuid, null::uuid, now())`;
    }
    const alerts = await sideEffectAlerts(sql, m, 'referral_edge');
    assertEquals(alerts.length, 1, '同會員未處理的同類告警不重複推');
    // 沒有訂閱可反查單號 → 寫「查無單號」，行動與後果仍在前 60 字。
    assertLine(alerts[0], ['（查無單號）', '二代三代獎金會漏發']);
  } finally {
    await teardown();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('apply_referral_side_effects：3d 任務進度擲錯 → error 告警、推薦連結與第 1 代照常', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  let teardown = async () => {};
  try {
    const { r, m } = await referrerAndMember(client, ids);
    teardown = await failWrite(
      sql,
      'referral_pair_history',
      `new.referee_user_id = '${m}'::uuid`,
      'task',
    );
    const t = tradeNo20();
    assertEquals((await payForUser(client, m, { tradeNo: t })).error, null);

    const [o] = await sql`select status from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.status, 'completed');
    assert(await gen1Paid(sql, m, r));
    const [e] = await sql`
      select referrer_user_id from public.referral_edges where referee_user_id = ${m}`;
    assertEquals(e?.referrer_user_id, r, '3b 照寫');

    const alerts = await sideEffectAlerts(sql, m, 'task_king');
    assertEquals(alerts.length, 1, JSON.stringify(alerts));
    const [a] = alerts;
    assertEquals(a.severity, 'error');
    assert(a.message.startsWith('【任務進度未計・請開 Claude 核對】'), a.message);
    assertLine(a, [t, '推薦人任務少計一位']);
    assert(a.message.includes('〈補計任務進度〉'), a.message);
    assertClean(a, ['injected', m, r]);
    assertEquals([a.context.sqlerrm, a.context.trade_no], ['injected task failure', t]);
  } finally {
    await teardown();
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('apply_referral_side_effects：3a-bis 預設推薦人寫入擲錯 → error 告警、付款照常', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  let teardown = async () => {};
  const [cfg] = await sql`select default_referrer_code from public.reward_config where id = true`;
  try {
    const d = (await createTestUser(client, { name: '收尾 預設推薦人' })).id;
    ids.push(d);
    assertEquals((await payForUser(client, d)).error, null);
    const dCode = await getActiveReferralCode(client, d);
    await sql`update public.reward_config set default_referrer_code = ${dCode} where id = true`;
    const m = (await createTestUser(client, { name: '收尾 無碼會員' })).id;
    ids.push(m);
    teardown = await failWrite(
      sql,
      'profiles',
      `new.id = '${m}'::uuid and new.referred_by_is_default`,
      'default',
      'update',
    );
    const t = tradeNo20();
    assertEquals((await payForUser(client, m, { tradeNo: t })).error, null);

    const [o] = await sql`select status from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.status, 'completed', '付款開通不受 3a-bis 影響');

    const alerts = await sideEffectAlerts(sql, m, 'default_referrer');
    assertEquals(alerts.length, 1, JSON.stringify(alerts));
    const [a] = alerts;
    assertEquals(a.severity, 'error');
    assert(a.message.startsWith('【預設推薦人未套用・請開 Claude 補綁】'), a.message);
    assertLine(a, [t, '會員無推薦人、不發獎金']);
    assert(a.message.includes('〈補綁預設推薦人〉'), a.message);
    assertClean(a, ['injected', m, d, dCode]);
    assertEquals([a.context.sqlerrm, a.context.trade_no], ['injected default failure', t]);
  } finally {
    await teardown();
    await sql`
      update public.reward_config set default_referrer_code = ${cfg.default_referrer_code}
      where id = true`;
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

// review P0：告警路徑若在 3b handler 內擲錯，會回滾整個 apply_referral_side_effects 子交易
// （含 3c 三代獎金）。呼叫端必須再包一層，任何告警錯誤都不得連坐。
Deno.test('apply_referral_side_effects：告警函式本身擲錯 → 第 1 代獎金與付款仍完成', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  let teardown = async () => {};
  const [orig] = await sql`
    select case when to_regprocedure(${LOG_SIG}) is null then null
           else pg_get_functiondef(to_regprocedure(${LOG_SIG})) end as def`;
  try {
    await sql.unsafe(`
      create or replace function public.log_referral_side_effect_failure(
        p_step text, p_referee uuid, p_referrer uuid, p_subscription_id uuid,
        p_sqlstate text, p_sqlerrm text)
      returns void language plpgsql as $f$ begin raise exception 'alert broke'; end $f$;`);
    const { r, m } = await referrerAndMember(client, ids);
    teardown = await failWrite(
      sql,
      'referral_edges',
      `new.referee_user_id = '${m}'::uuid`,
      'edge3',
    );
    const t = tradeNo20();
    assertEquals((await payForUser(client, m, { tradeNo: t })).error, null);
    const [o] = await sql`select status from public.payment_orders where transaction_id = ${t}`;
    assertEquals(o.status, 'completed');
    assert(await gen1Paid(sql, m, r), '告警壞掉也不得連坐 3c');
  } finally {
    await teardown();
    if (orig.def) await sql.unsafe(orig.def);
    else await sql.unsafe(`drop function if exists ${LOG_SIG}`);
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('log_referral_side_effect_failure：anon／authenticated 不可執行', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const [r] = await sql`select to_regprocedure(${LOG_SIG}) is not null as present`;
    assertEquals(r.present, true, '函式應存在');
    const rows = await sql`
      select role, has_function_privilege(role, ${LOG_SIG}, 'execute') as can
      from unnest(array['anon', 'authenticated']) as role`;
    assertEquals(rows.map((x) => [x.role, x.can]), [['anon', false], ['authenticated', false]]);
  } finally {
    await sql.end();
  }
});
