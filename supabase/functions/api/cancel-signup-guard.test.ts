// ============================================================
// DELETE /auth/cancel-signup 的金流稽核守衛：
//   * 已完成付款的會員不得自助刪除帳號——schema 全面 on delete cascade，
//     刪 auth user 會連鎖抹除 payment_orders / withdrawals / referral_edges，
//     金流稽核紀錄與推薦樹對帳從此消失（對照 /auth/reset-registration
//     既有的「已完成付款無法重置」守衛，cancel-signup 必須同等保護）。
//   * 尚未付款的註冊中用戶維持既有行為：可以刪除（「我晚點再填」流程）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

Deno.test('cancel-signup：已完成付款的會員被拒絕，稽核資料完整保留', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Paid Member' });

  try {
    const { error } = await payForUser(client, user.id);
    assertEquals(error, null);

    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/auth/cancel-signup', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 400, await res.clone().text());

    // 帳號與金流紀錄必須原封不動
    const { data: profile } = await client
      .from('profiles').select('id').eq('id', user.id).maybeSingle();
    assert(profile, '已付費會員的 profile 不得被刪除');

    const { data: orders } = await client
      .from('payment_orders').select('id, status').eq('user_id', user.id);
    assertEquals(orders?.length, 1, '已完成的付款訂單必須保留');
    assertEquals(orders?.[0]?.status, 'completed');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('cancel-signup：有提領紀錄的會員被拒絕', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Withdrawing Member' });

  try {
    const { error } = await payForUser(client, user.id);
    assertEquals(error, null);
    await client.from('profiles').update({
      referral_program_joined: true,
      national_id: 'A123456789',
      id_card_front_path: `${user.id}/front.jpg`,
      id_card_back_path: `${user.id}/back.jpg`,
    }).eq('id', user.id);
    await client.from('reward_transactions').insert({
      user_id: user.id, type: 'adjustment', amount: 5000, description: '測試點數',
    });
    const { data: w } = await client.rpc('request_withdrawal', {
      p_user_id: user.id, p_amount: 1000, p_bank_code: '812', p_bank_account: '1234567890123',
    });
    assertEquals(w?.success, true, JSON.stringify(w));

    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/auth/cancel-signup', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 400, await res.clone().text());

    const { data: withdrawals } = await client
      .from('withdrawals').select('id').eq('user_id', user.id);
    assertEquals(withdrawals?.length, 1, '提領單必須保留');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('cancel-signup：未付款的註冊中用戶維持可刪除（characterization）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Unpaid Signup' });
  let deleted = false;

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/auth/cancel-signup', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200, await res.clone().text());
    const body = await res.json();
    assertEquals(body.success, true);

    const { data: profile } = await client
      .from('profiles').select('id').eq('id', user.id).maybeSingle();
    assertEquals(profile, null, '未付款用戶的帳號應已刪除');
    deleted = true;
  } finally {
    if (!deleted) await deleteTestUsers(client, [user.id]);
  }
});
