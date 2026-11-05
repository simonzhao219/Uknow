// ============================================================
// reward_transactions 的冪等唯一索引（ref P2-1，第 5 波 S2）。
//
// 三代獎金、ledger_reset、提領退件退款的冪等原本全靠「not exists＋鎖」；
// 只要有一條路徑沒鎖（ref P1-2 的 repair_orphaned_claim_rewards），就會重複
// 入帳。四組 partial unique index 是 DB 層最後一道：同一事件的第二列存不進去。
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

Deno.test('reward_transactions：四組冪等鍵各有 partial unique index', async () => {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql<{ indexdef: string }[]>`
      select indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'reward_transactions'
        and indexdef ilike 'create unique index%'`;
    const defs = rows.map((r) => r.indexdef.replace(/\s+/g, ' '));
    const has = (cols: string, where: string) =>
      defs.some((d) => d.includes(`(${cols})`) && d.includes(where));
    assert(
      has('referee_user_id, generation, subscription_id', "'referral_reward'"),
      defs.join('\n'),
    );
    assert(
      has('referee_user_id, generation, source_claim_id', "'referral_reward'"),
      defs.join('\n'),
    );
    assert(has('withdrawal_id', "'adjustment'"), defs.join('\n'));
    assert(has('subscription_id', "'ledger_reset'"), defs.join('\n'));
  } finally {
    await sql.end();
  }
});

Deno.test('reward_transactions：同一付款事件的第二筆 gen1 獎金 → 23505', async () => {
  const client = adminClient();
  const upline = await createTestUser(client, { name: 'Unique Upline' });
  const created: string[] = [upline.id];
  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    const code = await getActiveReferralCode(client, upline.id);
    const down = await createTestUser(client, { name: 'Unique Down', referredByCode: code });
    created.push(down.id);
    assertEquals((await payForUser(client, down.id)).error, null);

    const { data: gen1 } = await client
      .from('reward_transactions')
      .select('user_id, amount, generation, referee_user_id, subscription_id')
      .eq('referee_user_id', down.id)
      .eq('generation', 1)
      .single();
    assert(gen1?.subscription_id, '前置：付款應已發 gen1 並帶 subscription_id');

    const { error } = await client.from('reward_transactions').insert({
      ...gen1,
      type: 'referral_reward',
      description: '重複列（測試）',
    });
    assertEquals(error?.code, '23505', `同一事件第二列應被唯一索引擋下，實得 ${error?.code}`);
  } finally {
    await deleteTestUsers(client, created);
  }
});
