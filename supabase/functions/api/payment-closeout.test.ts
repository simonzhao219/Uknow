// ============================================================
// 第 7 波 S4 金流收尾（migration 20261125000001_payment_closeout）：
//   1. drop 單交易 wrapper complete_paid_pending_orders（W6-14→W6-30）
//   2. apply_referral_side_effects 3a-bis／3b／3d 失敗升 error（W7-9、W7-10）
//   3. complete_paid_pending_order 單筆開通失敗告警：message 固定行動句、sqlerrm 只進 context
//   4. repair_orphaned_* 關掉單交易全量路徑（null → U6R02，W7-9 Q1＝A）
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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
