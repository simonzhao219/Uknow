// ============================================================
// TDD（red-first）：任務續約（claim 免費續約 credit）對上線鏈的三代發獎
// 是 warning-only 隔離——若當下失敗，付款路徑有 repair_orphaned_payments
// 補償，claim 路徑卻沒有任何自癒。補上 repair_orphaned_claim_rewards：
// 找「已 claimed 但缺對應 source_claim_id 獎勵」的 credit，冪等補發。
//
// 這支函數修復前不存在，本測試預期 FAIL。
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

Deno.test('repair_orphaned_claim_rewards：補回任務續約缺漏的上線三代獎勵，冪等', async () => {
  const client = adminClient();
  const upline = await createTestUser(client, { name: 'Upline' });
  const created: string[] = [upline.id];

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    const codeUpline = await getActiveReferralCode(client, upline.id);

    // A（claimer）在 upline 底下
    const a = await createTestUser(client, { name: 'Claimer', referredByCode: codeUpline });
    created.push(a.id);
    assertEquals((await payForUser(client, a.id)).error, null);
    const codeA = await getActiveReferralCode(client, a.id);

    // A 招募 8 位新人 → 取得一張未領 credit
    for (let i = 0; i < 8; i++) {
      const u = await createTestUser(client, { name: `sub${i}`, referredByCode: codeA });
      created.push(u.id);
      assertEquals((await payForUser(client, u.id)).error, null);
    }
    const { data: credit } = await client
      .from('referral_king_rewards')
      .select('id')
      .eq('user_id', a.id)
      .eq('status', 'unclaimed')
      .limit(1)
      .single();

    // A 領取 credit → 正常情況會 cascade 發 upline 一筆 gen1
    assertEquals(
      (await client.rpc('claim_referral_king_reward', { p_user_id: a.id, p_reward_id: credit!.id }))
        .error,
      null,
    );

    // 模擬 cascade 當下失敗（warning-only 沒寫成）：直接刪掉那筆續約獎勵。
    await client
      .from('reward_transactions')
      .delete()
      .eq('source_claim_id', credit!.id);

    const gone = await client
      .from('reward_transactions')
      .select('id')
      .eq('source_claim_id', credit!.id);
    assertEquals(gone.data?.length ?? 0, 0, '前置：cascade 獎勵應已被刪');

    // 自癒：repair 應把缺漏的續約獎勵補回。
    const { error: repairErr } = await client.rpc('repair_orphaned_claim_rewards', {
      p_user_id: a.id,
    });
    assertEquals(repairErr, null, `repair 呼叫失敗: ${repairErr?.message}`);

    const after = await client
      .from('reward_transactions')
      .select('amount, generation, source_claim_id')
      .eq('user_id', upline.id)
      .eq('referee_user_id', a.id)
      .eq('source_claim_id', credit!.id);
    assertEquals(after.data?.length, 1, 'repair 應補回 upline 的續約 gen1 獎勵');
    assertEquals(after.data?.[0]?.amount, 100);
    assertEquals(after.data?.[0]?.generation, 1);

    // 冪等：重跑不重複發。
    assertEquals(
      (await client.rpc('repair_orphaned_claim_rewards', { p_user_id: a.id })).error,
      null,
    );
    const after2 = await client
      .from('reward_transactions')
      .select('id')
      .eq('source_claim_id', credit!.id);
    assertEquals(after2.data?.length, 1, '重跑 repair 不得重複發獎');
  } finally {
    await deleteTestUsers(client, created);
  }
});

// ============================================================
// 並行 repair（ref P1-2，第 5 波 S2）：同一會員兩個並行的 /auth/profile 各自
// 觸發 repair_orphaned_claim_rewards。修復前補發前不鎖 profiles，兩邊都通過
// not exists、各插一份 → 上線同一事件拿兩次 100P。
// 決定性重現：連線 1 在交易內跑完 repair（已插入、未 commit）時，連線 2 再跑
// 一次；修復後連線 2 會等連線 1 的 profiles 列鎖，commit 後重查而跳過。
// ============================================================
Deno.test('repair_orphaned_claim_rewards：兩個並行補發 → 每代恰好一列', async () => {
  const client = adminClient();
  const upline = await createTestUser(client, { name: 'Upline Concurrent' });
  const created: string[] = [upline.id];
  const sql1 = postgres(DB_URL, { max: 1 });
  const sql2 = postgres(DB_URL, { max: 1 });

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    const codeUpline = await getActiveReferralCode(client, upline.id);
    const a = await createTestUser(client, {
      name: 'Claimer Concurrent',
      referredByCode: codeUpline,
    });
    created.push(a.id);
    assertEquals((await payForUser(client, a.id)).error, null);
    const codeA = await getActiveReferralCode(client, a.id);
    for (let i = 0; i < 8; i++) {
      const u = await createTestUser(client, { name: `csub${i}`, referredByCode: codeA });
      created.push(u.id);
      assertEquals((await payForUser(client, u.id)).error, null);
    }
    const { data: credit } = await client
      .from('referral_king_rewards')
      .select('id')
      .eq('user_id', a.id)
      .eq('status', 'unclaimed')
      .limit(1)
      .single();
    assertEquals(
      (await client.rpc('claim_referral_king_reward', { p_user_id: a.id, p_reward_id: credit!.id }))
        .error,
      null,
    );
    // 造孤兒：刪掉 cascade 寫成的續約獎勵。
    await client.from('reward_transactions').delete().eq('source_claim_id', credit!.id);

    let second: Promise<{ r: { candidates_found: number; repaired_count: number } }[]> | null =
      null;
    await sql1.begin(async (tx) => {
      await tx`select repair_orphaned_claim_rewards(${a.id}::uuid)`;
      // 連線 1 已插入、尚未 commit：連線 2 此時再跑一次。postgres.js 的查詢是 lazy
      // 的（await／then 才送出），用 .execute() 立刻送，才是真的並行。
      second = sql2<{ r: { candidates_found: number; repaired_count: number } }[]>`
        select repair_orphaned_claim_rewards(${a.id}::uuid) as r`.execute();
      await new Promise((r) => setTimeout(r, 500));
    });
    const [{ r: secondResult }] = await second!;
    // 分辨擋下第二筆的是鎖還是唯一索引：有鎖時第二條連線等到第一條 commit、重查後走
    // 「已補過就跳過」（不計候選、不補發）；只有索引時它會照常呼叫發獎、撞索引被吞，
    // repaired_count 仍是 1——列數一樣是 1，但這條斷言會紅。
    assertEquals(
      secondResult.repaired_count,
      0,
      `第二個補發應在鎖後跳過：${JSON.stringify(secondResult)}`,
    );

    const { data: rows } = await client
      .from('reward_transactions')
      .select('generation')
      .eq('referee_user_id', a.id)
      .eq('source_claim_id', credit!.id);
    assertEquals(rows?.length, 1, `並行 repair 不得重複補發，實得 ${rows?.length} 列`);
  } finally {
    await sql1.end();
    await sql2.end();
    await deleteTestUsers(client, created);
  }
});
