// ============================================================
// 後台推薦樹查帳（第 6 波 S3a 階段 1）：referral_award_chain 與發獎同口徑。
//
// referral_award_chain(p_referee) 回傳第 1～3 代「該拿的人」與停止原因，
// 讀法與停止條件必須和 pay_referral_generations 逐字相同（第 1 代讀
// profiles.referred_by_user_id、第 2／3 代讀 referral_edges；收獎者＝付款人
// 即成環，該代與其後各代都不發）。
//
// 本檔的等價測試是防漂移閘門：同一個拓撲下，pay_referral_generations
// 實際寫入的收獎者必須逐代等於 chain 的結果。發獎函式之後若被改動
// （例如同波 S1／S6），只要口徑分岔這裡就紅。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type ChainRow = { generation: number; recipient_id: string | null; stop_reason: string };

// child 的推薦人是 parent：推薦邊與 profiles 同步寫（模擬付款後 apply 建好的邊）。
async function link(sql: postgres.Sql, child: string, parent: string) {
  await sql`
    insert into public.referral_edges (referee_user_id, referrer_user_id)
    values (${child}, ${parent})
    on conflict (referee_user_id) do update set referrer_user_id = excluded.referrer_user_id`;
  await sql`update public.profiles set referred_by_user_id = ${parent} where id = ${child}`;
}

async function chainOf(sql: postgres.Sql, referee: string): Promise<ChainRow[]> {
  const rows = await sql`
    select generation, recipient_id, stop_reason
    from public.referral_award_chain(${referee}::uuid)
    order by generation`;
  return rows.map((r) => ({
    generation: Number(r.generation),
    recipient_id: r.recipient_id as string | null,
    stop_reason: r.stop_reason as string,
  }));
}

// 以「無訂閱、無 claim」的鍵直接呼叫發獎函式，回傳實際寫入的 {代: 收獎者}。
async function paidRecipients(sql: postgres.Sql, referee: string): Promise<Record<number, string>> {
  await sql`select public.pay_referral_generations(${referee}::uuid, 100, null, null, '')`;
  const rows = await sql`
    select generation, user_id from public.reward_transactions
    where type = 'referral_reward' and referee_user_id = ${referee}
      and subscription_id is null and source_claim_id is null
    order by generation`;
  return Object.fromEntries(rows.map((r) => [Number(r.generation), r.user_id as string]));
}

function chainRecipients(chain: ChainRow[]): Record<number, string> {
  return Object.fromEntries(
    chain.filter((r) => r.stop_reason === 'none').map((r) => [r.generation, r.recipient_id!]),
  );
}

async function withUsers(
  fn: (sql: postgres.Sql, mk: (name: string) => Promise<string>) => Promise<void>,
) {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    await fn(sql, async (name) => {
      const u = await createTestUser(client, { name });
      ids.push(u.id);
      return u.id;
    });
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
}

Deno.test('referral_award_chain：完整三代 → 逐代收獎者與實發一致', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 付款人');
    const a = await mk('鏈 一代');
    const b = await mk('鏈 二代');
    const c = await mk('鏈 三代');
    await link(sql, x, a);
    await link(sql, a, b);
    await link(sql, b, c);

    const chain = await chainOf(sql, x);
    assertEquals(chain, [
      { generation: 1, recipient_id: a, stop_reason: 'none' },
      { generation: 2, recipient_id: b, stop_reason: 'none' },
      { generation: 3, recipient_id: c, stop_reason: 'none' },
    ]);
    assertEquals(await paidRecipients(sql, x), chainRecipients(chain));
  });
});

Deno.test('referral_award_chain：沒有推薦人 → 三代皆 no_referrer 且實發為空', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 無推薦人');
    const chain = await chainOf(sql, x);
    assertEquals(chain.map((r) => [r.recipient_id, r.stop_reason]), [
      [null, 'no_referrer'],
      [null, 'no_referrer'],
      [null, 'no_referrer'],
    ]);
    assertEquals(await paidRecipients(sql, x), {});
  });
});

Deno.test('referral_award_chain：缺第 2 代 → 第 2、3 代 no_referrer 且只發第 1 代', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 缺二代 付款人');
    const a = await mk('鏈 缺二代 一代');
    await link(sql, x, a);

    const chain = await chainOf(sql, x);
    assertEquals(chain.map((r) => r.stop_reason), ['none', 'no_referrer', 'no_referrer']);
    assertEquals(await paidRecipients(sql, x), chainRecipients(chain));
  });
});

Deno.test('referral_award_chain：缺第 3 代 → 第 3 代 no_referrer 且只發兩代', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 缺三代 付款人');
    const a = await mk('鏈 缺三代 一代');
    const b = await mk('鏈 缺三代 二代');
    await link(sql, x, a);
    await link(sql, a, b);

    const chain = await chainOf(sql, x);
    assertEquals(chain.map((r) => r.stop_reason), ['none', 'none', 'no_referrer']);
    assertEquals(await paidRecipients(sql, x), chainRecipients(chain));
  });
});

Deno.test('referral_award_chain：第 1 代是付款人本人 → 三代皆 cycle 且不發', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 自己推薦自己');
    // referral_edges 有 check(referee<>referrer)，自己指向自己只可能出現在 profiles。
    await sql`update public.profiles set referred_by_user_id = ${x} where id = ${x}`;

    const chain = await chainOf(sql, x);
    assertEquals(chain.map((r) => [r.recipient_id, r.stop_reason]), [
      [null, 'cycle'],
      [null, 'cycle'],
      [null, 'cycle'],
    ]);
    assertEquals(await paidRecipients(sql, x), {});
  });
});

Deno.test('referral_award_chain：第 2 代回到付款人 → 第 2、3 代 cycle 且只發第 1 代', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 二代成環 付款人');
    const a = await mk('鏈 二代成環 一代');
    await link(sql, x, a);
    await link(sql, a, x);

    const chain = await chainOf(sql, x);
    assertEquals(chain.map((r) => r.stop_reason), ['none', 'cycle', 'cycle']);
    assertEquals(chain[0].recipient_id, a);
    assertEquals(await paidRecipients(sql, x), chainRecipients(chain));
  });
});

Deno.test('referral_award_chain：第 3 代回到付款人 → 第 3 代 cycle 且只發兩代', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 三代成環 付款人');
    const a = await mk('鏈 三代成環 一代');
    const b = await mk('鏈 三代成環 二代');
    await link(sql, x, a);
    await link(sql, a, b);
    await link(sql, b, x);

    const chain = await chainOf(sql, x);
    assertEquals(chain.map((r) => r.stop_reason), ['none', 'none', 'cycle']);
    assertEquals(await paidRecipients(sql, x), chainRecipients(chain));
  });
});

Deno.test('referral_award_chain：profiles 與 edges 不一致 → 第 1 代依 profiles、其後依 edges', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 不一致 付款人');
    const a = await mk('鏈 不一致 profiles 推薦人');
    const z = await mk('鏈 不一致 edges 推薦人');
    const b = await mk('鏈 不一致 a 的推薦人');
    await link(sql, x, z);
    await link(sql, a, b);
    // 只改 profiles：發獎第 1 代讀 profiles（a），第 2 代沿 a 的 edge（b）。
    await sql`update public.profiles set referred_by_user_id = ${a} where id = ${x}`;

    const chain = await chainOf(sql, x);
    assertEquals(chain.slice(0, 2).map((r) => r.recipient_id), [a, b]);
    assertEquals(await paidRecipients(sql, x), chainRecipients(chain));
  });
});

Deno.test('referral_award_chain：第 1 代的 profiles 與 edge 不一致 → 第 2 代依 edge', async () => {
  await withUsers(async (sql, mk) => {
    const x = await mk('鏈 一代不一致 付款人');
    const a = await mk('鏈 一代不一致 第 1 代');
    const p = await mk('鏈 一代不一致 profiles 推薦人');
    const e = await mk('鏈 一代不一致 edge 推薦人');
    await link(sql, x, a);
    await link(sql, a, e);
    // 只改 a 的 profiles：發獎第 2 代沿 a 的 edge（e），不讀 a 的 profiles（p）。
    await sql`update public.profiles set referred_by_user_id = ${p} where id = ${a}`;

    const chain = await chainOf(sql, x);
    assertEquals(chain[1].recipient_id, e);
    assertEquals(await paidRecipients(sql, x), chainRecipients(chain));
  });
});

Deno.test('referral_award_chain：authenticated 與 anon 不得 EXECUTE', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql`
      select
        has_function_privilege('authenticated', 'public.referral_award_chain(uuid)', 'execute') as auth,
        has_function_privilege('anon', 'public.referral_award_chain(uuid)', 'execute') as anon`;
    assertEquals([rows[0].auth, rows[0].anon], [false, false]);
  } finally {
    await sql.end();
  }
});
