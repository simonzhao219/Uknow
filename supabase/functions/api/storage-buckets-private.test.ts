// ============================================================
// 私有 bucket 結構守衛:id-cards(身分證)與 referral-signatures(簽名)
//
// 這兩個 bucket 存的是個資,安全模型是「public=false 且 storage.objects 上
// 沒有任何 policy 涉及它們」——於是只有 service_role(Edge Function)能存取,
// anon/authenticated 直連 Storage API 一律被 RLS 擋下。任何一邊被改掉
// (bucket 被設成 public、或有人為了前端直傳加了一條 policy)都是個資外洩。
//
// ⚠️ 範圍刻意只有這兩個私有 bucket。listings-photos 是**公開** bucket
// (public=true,以 getPublicUrl 直出),不在此斷言——不要把這支改寫成
// 「所有 bucket 都 private」。
//
// 同 rls-policies.test.ts:直接問 Postgres,結構來自 migration,各環境相同。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const PRIVATE_BUCKETS = ['id-cards', 'referral-signatures'];

Deno.test('storage.buckets:id-cards 與 referral-signatures 存在且 public=false', async () => {
  const sql = postgres(DB_URL);
  try {
    const rows = await sql<{ id: string; public: boolean }[]>`
      select id, public from storage.buckets where id = any(${PRIVATE_BUCKETS}) order by id`;
    assertEquals(rows.map((r) => r.id), [...PRIVATE_BUCKETS].sort());
    for (const row of rows) {
      assertEquals(row.public, false, `${row.id} 不得是 public bucket`);
    }
  } finally {
    await sql.end();
  }
});

Deno.test('storage.objects:沒有任何 policy 涉及私有 bucket,也沒有不限 bucket 的 policy', async () => {
  const sql = postgres(DB_URL);
  try {
    const policies = await sql<
      { policyname: string; qual: string | null; with_check: string | null }[]
    >`
      select policyname, qual, with_check from pg_policies
      where schemaname = 'storage' and tablename = 'objects'`;
    const exprOf = (p: { qual: string | null; with_check: string | null }) =>
      `${p.qual ?? ''} ${p.with_check ?? ''}`;

    const touching = policies.filter((p) => PRIVATE_BUCKETS.some((id) => exprOf(p).includes(id)));
    assertEquals(
      touching.map((p) => p.policyname),
      [],
      '私有 bucket 不得有任何 storage.objects policy(只准 service_role 存取)',
    );

    // 不限 bucket 的 policy(表達式完全沒提 bucket_id)會一併涵蓋私有 bucket。
    const unscoped = policies.filter((p) => !exprOf(p).includes('bucket_id'));
    assertEquals(
      unscoped.map((p) => p.policyname),
      [],
      'storage.objects 上不得有未以 bucket_id 限縮的 policy',
    );
  } finally {
    await sql.end();
  }
});
