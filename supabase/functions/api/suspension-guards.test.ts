// ============================================================
// 停權（profiles.suspended_at）必須擋住資金流出與推薦擴散：
//   * request_withdrawal：被停權會員不得申請提領（error_code: suspended）
//   * validate_referral_code：停權會員的推薦碼不得再被驗證通過
//     （擋住「被停權仍繼續拉下線賺獎金」的漏洞）
// 背景：0718000102 的停權設計只把 suspended_at 接進刊登可見性，
// 提領與推薦完全沒有停權檢查——對推薦獎勵平台，停權卻擋不住
// 資金流出是權限模型的洞。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

async function createWithdrawableUser(client: ReturnType<typeof adminClient>) {
  const user = await createTestUser(client, { name: 'Suspended Withdrawer' });
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
  return user;
}

Deno.test('request_withdrawal：被停權會員不得申請提領', async () => {
  const client = adminClient();
  const user = await createWithdrawableUser(client);

  try {
    await client.from('profiles')
      .update({ suspended_at: new Date().toISOString() })
      .eq('id', user.id);

    const { data, error } = await client.rpc('request_withdrawal', {
      p_user_id: user.id, p_amount: 1000, p_bank_code: '812', p_bank_account: '1234567890123',
    });
    assertEquals(error, null);
    assertEquals(data?.success, false, JSON.stringify(data));
    assertEquals(data?.error_code, 'suspended');

    const { data: rows } = await client.from('withdrawals').select('id').eq('user_id', user.id);
    assertEquals(rows?.length, 0, '不得產生提領單');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('request_withdrawal：解除停權後恢復可提領（characterization）', async () => {
  const client = adminClient();
  const user = await createWithdrawableUser(client);

  try {
    // 未停權（suspended_at 為 null）→ 走原有全部守衛，應成功
    const { data } = await client.rpc('request_withdrawal', {
      p_user_id: user.id, p_amount: 1000, p_bank_code: '812', p_bank_account: '1234567890123',
    });
    assertEquals(data?.success, true, JSON.stringify(data));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('validate_referral_code：停權推薦人的推薦碼不得通過驗證', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: 'Suspended Referrer' });

  try {
    const { error } = await payForUser(client, referrer.id);
    assertEquals(error, null);
    const code = await getActiveReferralCode(client, referrer.id);

    // 停權前：碼有效（characterization）
    const okRes = await app.request(`/api/referrals/validate/${code}`);
    assertEquals(okRes.status, 200);
    assertEquals((await okRes.json()).valid, true);

    // 停權後：同一個碼必須失效
    await client.from('profiles')
      .update({ suspended_at: new Date().toISOString() })
      .eq('id', referrer.id);

    const res = await app.request(`/api/referrals/validate/${code}`);
    const body = await res.json();
    assertEquals(body.valid, false, JSON.stringify(body));
    assert(!body.referrerName, '不得洩漏停權會員資訊');
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});
