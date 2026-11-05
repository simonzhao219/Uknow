// ============================================================
// 推薦成環防線（第 5 波 S6 階段 1；稽核 ref P0-2）。
//
// referral_would_cycle(p_referee, p_new_referrer)：p_new_referrer 若在 p_referee 的
// 推薦樹內（任何深度，W5-49③）或就是本人 → true。prepare 與付款換線都用它擋。
// pay_referral_generations：任一代收獎者＝付款人本人 → 該代與其後各代不發、寫 error
// 告警 referral_cycle_detected（縱深；資料已有環時才會發生）。
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

ensureEdgeFunctionEnv();

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// 直接寫推薦邊（child 的推薦人是 parent），profiles.referred_by_user_id 同步，
// 模擬「付款後 apply 建好的邊」。
async function link(sql: postgres.Sql, child: string, parent: string) {
  await sql`
    insert into public.referral_edges (referee_user_id, referrer_user_id)
    values (${child}, ${parent})
    on conflict (referee_user_id) do update set referrer_user_id = excluded.referrer_user_id`;
  await sql`update public.profiles set referred_by_user_id = ${parent} where id = ${child}`;
}

async function wouldCycle(sql: postgres.Sql, referee: string, newReferrer: string) {
  const [row] = await sql`
    select public.referral_would_cycle(${referee}::uuid, ${newReferrer}::uuid) as c`;
  return row.c as boolean;
}

Deno.test('referral_would_cycle：新推薦人在本人一～四代內或就是本人 → true', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const mk = async (name: string) => {
      const u = await createTestUser(client, { name });
      ids.push(u.id);
      return u.id;
    };
    const a = await mk('環檢 A');
    const g1 = await mk('環檢 一代');
    const g2 = await mk('環檢 二代');
    const g3 = await mk('環檢 三代');
    const g4 = await mk('環檢 四代');
    await link(sql, g1, a);
    await link(sql, g2, g1);
    await link(sql, g3, g2);
    await link(sql, g4, g3);

    assertEquals(await wouldCycle(sql, a, g1), true, '一代');
    assertEquals(await wouldCycle(sql, a, g2), true, '二代');
    assertEquals(await wouldCycle(sql, a, g3), true, '三代');
    assertEquals(await wouldCycle(sql, a, g4), true, '四代（W5-49③ 不限深度）');
    assertEquals(await wouldCycle(sql, a, a), true, '自己');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('referral_would_cycle：旁支與本人的推薦人 → false', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const mk = async (name: string) => {
      const u = await createTestUser(client, { name });
      ids.push(u.id);
      return u.id;
    };
    const up = await mk('環檢 推薦人');
    const a = await mk('環檢 本人');
    const sibling = await mk('環檢 旁支');
    const stranger = await mk('環檢 陌生人');
    await link(sql, a, up);
    await link(sql, sibling, up);

    assertEquals(await wouldCycle(sql, a, up), false, '本人的推薦人');
    assertEquals(await wouldCycle(sql, a, sibling), false, '旁支');
    assertEquals(await wouldCycle(sql, a, stranger), false, '無關的人');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('referral_would_cycle：資料已有環時仍會終止 → 不在環上的本人回 false', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const mk = async (name: string) => {
      const u = await createTestUser(client, { name });
      ids.push(u.id);
      return u.id;
    };
    const p = await mk('既有環 P');
    const q = await mk('既有環 Q');
    const a = await mk('既有環 外人');
    await link(sql, p, q);
    await link(sql, q, p);

    // 從 P 往上爬會在 P↔Q 間打轉；union 去重必須讓查詢終止。
    const result = await Promise.race([
      wouldCycle(sql, a, p),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 5000)),
    ]);
    assertEquals(result, false);
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});

Deno.test('pay_referral_generations：資料已成環 → 付款人不領自己的獎金並寫 error 告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const ids: string[] = [];
  try {
    const m = await createTestUser(client, { name: '成環 M' });
    const d = await createTestUser(client, { name: '成環 D' });
    ids.push(m.id, d.id);
    // D 的推薦人是 M；M 又把推薦人換成 D（繞過 prepare 直接造環）。
    await link(sql, d.id, m.id);
    await link(sql, m.id, d.id);

    const { error } = await payForUser(client, m.id);
    assertEquals(error, null);

    const selfRows = await sql`
      select id from public.reward_transactions
      where type = 'referral_reward' and referee_user_id = ${m.id} and user_id = ${m.id}`;
    assertEquals(selfRows.length, 0, '付款人不得領到自己這筆付款的獎金');

    const dRows = await sql`
      select generation from public.reward_transactions
      where type = 'referral_reward' and referee_user_id = ${m.id} and user_id = ${d.id}
      order by generation`;
    assertEquals(dRows.map((r) => r.generation), [1], 'D 只拿第 1 代，環上的第 3 代不再發');

    const alerts = await sql`
      select severity from public.system_alerts
      where source = 'referral_cycle_detected' and context->>'referee' = ${m.id}`;
    assert(alerts.length >= 1, '應寫 referral_cycle_detected 告警');
    assertEquals(alerts[0].severity, 'error');
  } finally {
    await sql.end();
    await deleteTestUsers(client, ids);
  }
});
