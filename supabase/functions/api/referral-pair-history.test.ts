// ============================================================
// 推薦王與新約（第 5 波 S6 階段 5；ref P2-2、P2-3；W5-8）。
//
// W5-8：新約後已發的免費續約 credit（含未領）保留；當月從 0 計門檻（再滿一個門檻才發下一張，
// round_ordinal 接續）；當月桶只清計數，配對名單另存在 referral_pair_history——
// 「被推薦人 R 從未出現在上線 U 的歷史」跨新約清空仍成立（§9.2）。
// task_progress.king_round_base[月份] 記新約當下該月已應發的張數（含 reconcile 尚未補發的），
// reconcile 目標＝base＋floor(新約後當月人數／門檻)。門檻一律讀 reward_config。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
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

type Client = ReturnType<typeof adminClient>;
type Sql = postgres.Sql;

let seq = 0;

async function threshold(sql: Sql): Promise<number> {
  const [r] = await sql`
    select coalesce(referral_king_monthly_threshold, 8) as t from public.reward_config where id = true`;
  return r?.t ?? 8;
}

async function downlines(client: Client, ids: string[], uplineCode: string, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = await createTestUser(client, {
      name: `王 下線 ${seq++}`,
      referredByCode: uplineCode,
    });
    ids.push(u.id);
    out.push(u.id);
    assertEquals((await payForUser(client, u.id)).error, null);
  }
  return out;
}

async function expire(sql: Sql, userId: string) {
  await sql`
    update public.subscriptions
    set end_date = now() - interval '10 days', grace_period_end = now() - interval '10 days'
    where user_id = ${userId}`;
}

// 新約付款（填回自己現任推薦人的碼；沒有推薦人就 keep），走 S6 的建單 RPC＋付款。
async function payFresh(sql: Sql, userId: string) {
  const trade = `S6-KING-${Date.now()}-${seq++}`;
  const [r] = await sql`
    select public.prepare_payment_order(
      p_user_id => ${userId}::uuid, p_trade_no => ${trade}, p_renewal_mode => 'fresh',
      p_referrer_user_id => null::uuid, p_referrer_code => null::text,
      p_referrer_source => 'keep') as r`;
  assertEquals(r.r.outcome, 'ok');
  await sql`
    select public.process_successful_payment(${userId}::uuid, ${trade}, ${trade},
      ${sql.json({ Status: 'SUCCESS' })})`;
}

async function credits(sql: Sql, userId: string) {
  return await sql`
    select round_ordinal, status from public.referral_king_rewards
    where user_id = ${userId} order by round_ordinal`;
}

Deno.test('推薦王：同月已有一張 credit 再做新約 → 原 credit 保留、再滿一個門檻才發第 2 張', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const t = await threshold(sql);
    const king = await createTestUser(client, { name: '王 新約' });
    ids.push(king.id);
    assertEquals((await payForUser(client, king.id)).error, null);
    const code = await getActiveReferralCode(client, king.id);

    await downlines(client, ids, code, t);
    assertEquals((await credits(sql, king.id)).length, 1);

    await expire(sql, king.id);
    await payFresh(sql, king.id);
    const after = await credits(sql, king.id);
    assertEquals(after.length, 1, '新約不收回已發的 credit（含未領）');
    assertEquals(after[0].status, 'unclaimed');

    await downlines(client, ids, code, t - 1);
    assertEquals((await credits(sql, king.id)).length, 1, '新約後當月從 0 計：未滿門檻不發');
    await downlines(client, ids, code, 1);
    assertEquals(
      (await credits(sql, king.id)).map((c) => c.round_ordinal),
      [1, 2],
      '新約後再滿一個門檻 → 第 2 張（round_ordinal 接續）',
    );
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('推薦王：連續兩次新約、中間對帳漏發 → 第二次新約不吞掉欠發的 credit', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const t = await threshold(sql);
    const king = await createTestUser(client, { name: '王 兩次新約' });
    ids.push(king.id);
    assertEquals((await payForUser(client, king.id)).error, null);
    const code = await getActiveReferralCode(client, king.id);

    await downlines(client, ids, code, t);
    await expire(sql, king.id);
    await payFresh(sql, king.id); // 第一次新約：已發 1 張

    await downlines(client, ids, code, t);
    // 模擬第 2 張的對帳失敗（reconcile 是可自癒設計，上一輪可能沒發成）。
    await sql`delete from public.referral_king_rewards where user_id = ${king.id} and round_ordinal = 2`;
    assertEquals((await credits(sql, king.id)).length, 1);

    await expire(sql, king.id);
    await payFresh(sql, king.id); // 第二次新約：base 必須記成 2
    await downlines(client, ids, code, 1); // 任何一筆付款都會觸發對帳
    assertEquals(
      (await credits(sql, king.id)).map((c) => c.round_ordinal),
      [1, 2],
      '欠發的第 2 張由下一次對帳補回',
    );
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('推薦王：新約寫 king_round_base 失敗 → 付款完成、帳本照清、清桶照做、error 告警帶應寫的 base', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  const fn = `pg_temp_s6_fail_base_${seq++}`;
  try {
    const t = await threshold(sql);
    const king = await createTestUser(client, { name: '王 base 故障' });
    ids.push(king.id);
    assertEquals((await payForUser(client, king.id)).error, null);
    await downlines(client, ids, await getActiveReferralCode(client, king.id), t);
    await expire(sql, king.id);

    // 故障注入：只擋這位會員的 king_round_base 寫入。
    await sql.unsafe(`
      create function public.${fn}() returns trigger language plpgsql as $f$
      begin
        if new.user_id = '${king.id}'::uuid and new.king_round_base is distinct from old.king_round_base then
          raise exception 'S6 測試：king_round_base 寫入失敗';
        end if;
        return new;
      end $f$;
      create trigger ${fn} before update on public.task_progress
        for each row execute function public.${fn}();`);

    const trade = `S6-KING-FAIL-${Date.now()}-${seq++}`;
    const [r] = await sql`
      select public.prepare_payment_order(
        p_user_id => ${king.id}::uuid, p_trade_no => ${trade}, p_renewal_mode => 'fresh',
        p_referrer_user_id => null::uuid, p_referrer_code => null::text,
        p_referrer_source => 'keep') as r`;
    assertEquals(r.r.outcome, 'ok');
    await sql`
      select public.process_successful_payment(${king.id}::uuid, ${trade}, ${trade},
        ${sql.json({ Status: 'SUCCESS' })})`;

    const [o] = await sql`select status from public.payment_orders where transaction_id = ${trade}`;
    assertEquals(o.status, 'completed');
    const [l] = await sql`
      select count(*)::int as n from public.reward_transactions
      where user_id = ${king.id} and type = 'ledger_reset'`;
    assertEquals(l.n, 1, 'ledger_reset 照清');
    const [tp] = await sql`
      select total_referrals, king_round_base from public.task_progress where user_id = ${king.id}`;
    assertEquals(tp.total_referrals, 0, '清桶照做');
    assertEquals(tp.king_round_base, {}, 'base 沒寫成');
    const [a] = await sql`
      select severity, context from public.system_alerts
      where source = 'king_round_base' and context->>'user_id' = ${king.id}`;
    assertEquals(a.severity, 'error');
    assertEquals(a.context.base, 1, '告警帶應寫的 base，供人工補');
    assertEquals(typeof a.context.month_key, 'string');
  } finally {
    await sql.unsafe(`drop trigger if exists ${fn} on public.task_progress;
      drop function if exists public.${fn}();`);
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('pair-history：當月加入的被推薦人在上線新約後續約 → 上線任務不再 +1', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const u = await createTestUser(client, { name: '配對 上線' });
    ids.push(u.id);
    assertEquals((await payForUser(client, u.id)).error, null);
    const [r] = await downlines(client, ids, await getActiveReferralCode(client, u.id), 1);

    await expire(sql, u.id);
    await payFresh(sql, u.id); // 當月桶清空

    // R 再付一次（同一上線的續約）。
    assertEquals((await payForUser(client, r)).error, null);
    const [tp] = await sql`
      select total_referrals, monthly_referrals from public.task_progress where user_id = ${u.id}`;
    assertEquals(tp.total_referrals, 0, '續約不是新下線，不 +1');
    const all = Object.values(tp.monthly_referrals as Record<string, string[]>).flat();
    assertEquals(all.includes(r), false);
    const [p] = await sql`
      select count(*)::int as n from public.referral_pair_history
      where referrer_user_id = ${u.id} and referee_user_id = ${r}`;
    assertEquals(p.n, 1, '配對名單跨新約保留');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('backfill_referral_pair_history：由月桶與付款 gen1 獎金補回配對、排除任務續約的獎金列', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const u = await createTestUser(client, { name: '回填 上線' });
    const lost = await createTestUser(client, { name: '回填 桶已刪的下線' });
    const claimOnly = await createTestUser(client, { name: '回填 只有任務續約獎金' });
    ids.push(u.id, lost.id, claimOnly.id);
    assertEquals((await payForUser(client, u.id)).error, null);
    const code = await getActiveReferralCode(client, u.id);
    const [inBucket] = await downlines(client, ids, code, 1);

    // lost：有付款的 gen1 獎金、但月桶被（舊版新約）刪掉了。
    await sql`
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, subscription_id, description)
      values (${u.id}, 'referral_reward', 100, 1, ${lost.id},
        (select id from public.subscriptions where user_id = ${u.id} limit 1), '測試')`;
    // claimOnly：只有任務免費續約發的 gen1（source_claim_id 指向一張 credit）。
    const [claim] = await sql`
      insert into public.referral_king_rewards (user_id, month_key, round_ordinal, status)
      values (${claimOnly.id}, '2026-01', 1, 'unclaimed') returning id`;
    await sql`
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, source_claim_id, description)
      values (${u.id}, 'referral_reward', 100, 1, ${claimOnly.id}, ${claim.id}, '測試')`;
    await sql`delete from public.referral_pair_history where referrer_user_id = ${u.id}`;

    await sql`select public.backfill_referral_pair_history()`;
    await sql`select public.backfill_referral_pair_history()`; // 冪等

    const rows = await sql`
      select referee_user_id from public.referral_pair_history where referrer_user_id = ${u.id}`;
    const got = rows.map((x) => x.referee_user_id).sort();
    assertEquals(got, [inBucket, lost.id].sort());
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('GRANT：anon 與 authenticated 都讀不到 referral_pair_history', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    for (const role of ['anon', 'authenticated']) {
      const [r] = await sql`
        select has_table_privilege(${role}, 'public.referral_pair_history', 'select') as ok`;
      assertEquals(r.ok, false, role);
    }
  } finally {
    await sql.end();
  }
});
