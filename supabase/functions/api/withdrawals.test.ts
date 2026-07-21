// ============================================================
// 提領子系統（migration 0718 0101 + /rewards/withdraw 端點群）：
//   * 帳本語意：申請當下即扣 amount+fee；退件插入補償 adjustment
//   * 生命週期：pending → awaiting_collection → completed / rejected
//   * 業務規則：金額級距、一天一次（台灣日）、餘額、會籍、證件照
// ============================================================
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
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

const ID_NUMBER = 'A123456789';

// 建一個「可提領」的使用者：已付款會員 + 已加入推薦計畫 + 身分證 +
// 證件照路徑 + 直接塞 balance 點數。
async function createWithdrawableUser(client: ReturnType<typeof adminClient>, balance: number) {
  const user = await createTestUser(client, { name: 'Withdraw User' });
  const { error } = await payForUser(client, user.id);
  assertEquals(error, null);
  await client.from('profiles').update({
    referral_program_joined: true,
    national_id: ID_NUMBER,
    id_card_front_path: `${user.id}/front.jpg`,
    id_card_back_path: `${user.id}/back.jpg`,
  }).eq('id', user.id);
  if (balance > 0) {
    await client.from('reward_transactions').insert({
      user_id: user.id, type: 'adjustment', amount: balance, description: '測試點數',
    });
  }
  return user;
}

async function requestWithdrawal(client: ReturnType<typeof adminClient>, userId: string, amount: number) {
  return await client.rpc('request_withdrawal', {
    p_user_id: userId, p_amount: amount, p_bank_code: '812', p_bank_account: '1234567890123',
  });
}

Deno.test('request_withdrawal：申請即扣 amount+fee、快照銀行資訊、一天一次', async () => {
  const client = adminClient();
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data, error } = await requestWithdrawal(client, user.id, 2000);
    assertEquals(error, null);
    assertEquals(data?.success, true, JSON.stringify(data));
    assertEquals(data?.fee, 15);

    // 帳本即扣 2015
    const { data: bal } = await client.from('reward_balances')
      .select('*').eq('user_id', user.id).single();
    // 首次付款可能帶推薦獎勵 0（無上線），基準 = 5000 - 2015
    assertEquals(bal!.available, 5000 - 2015);
    assertEquals(bal!.pending, 2015);
    assertEquals(bal!.withdrawn, 0);

    // 銀行資訊快照在提領單上
    const { data: w } = await client.from('withdrawals')
      .select('*').eq('id', data!.withdrawal_id).single();
    assertEquals(w!.bank_code, '812');
    assertEquals(w!.bank_account, '1234567890123');
    assertEquals(w!.status, 'pending');
    assertEquals(w!.fee, 15);

    // 同一天第二次申請被拒
    const { data: second } = await requestWithdrawal(client, user.id, 1000);
    assertEquals(second?.success, false);
    assertEquals(second?.error_code, 'already_withdrawn_today');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('request_withdrawal：驗證規則（金額級距/餘額/證件照/會籍）', async () => {
  const client = adminClient();
  const user = await createWithdrawableUser(client, 1014); // 差 1 點不夠 1000+15

  try {
    // 非 1000 倍數
    let r = await requestWithdrawal(client, user.id, 1500);
    assertEquals(r.data?.error_code, 'invalid_amount');
    // 超過單日上限
    r = await requestWithdrawal(client, user.id, 9000);
    assertEquals(r.data?.error_code, 'invalid_amount');
    // 餘額不足（1014 < 1015）
    r = await requestWithdrawal(client, user.id, 1000);
    assertEquals(r.data?.error_code, 'insufficient_balance');

    // 補 1 點後可提領（邊界 1015）
    await client.from('reward_transactions').insert({
      user_id: user.id, type: 'adjustment', amount: 1, description: '補足邊界',
    });
    r = await requestWithdrawal(client, user.id, 1000);
    assertEquals(r.data?.success, true, JSON.stringify(r.data));

    // 證件照缺失
    const user2 = await createTestUser(client, { name: 'No Photos' });
    await payForUser(client, user2.id);
    await client.from('profiles').update({
      referral_program_joined: true, national_id: 'B123456789',
    }).eq('id', user2.id);
    await client.from('reward_transactions').insert({
      user_id: user2.id, type: 'adjustment', amount: 5000, description: '測試點數',
    });
    const r2 = await requestWithdrawal(client, user2.id, 1000);
    assertEquals(r2.data?.error_code, 'missing_id_photos');

    // 會籍過期（expired）不能提領
    await client.from('profiles').update({
      id_card_front_path: 'x/front.jpg', id_card_back_path: 'x/back.jpg',
    }).eq('id', user2.id);
    await client.from('subscriptions').update({
      end_date: new Date(Date.now() - 86400_000).toISOString(),
    }).eq('user_id', user2.id);
    const r3 = await requestWithdrawal(client, user2.id, 1000);
    assertEquals(r3.data?.error_code, 'subscription_invalid');

    await deleteTestUsers(client, [user2.id]);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('生命週期：已匯款 → 查收完成；退件 → 點數退回（不影響 total_earned）', async () => {
  const client = adminClient();
  const admin = await createTestUser(client, { name: 'Admin User' });
  const user = await createWithdrawableUser(client, 5000);

  try {
    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);

    // -- 完成路徑 --
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    assertEquals(req?.success, true);

    // 非 pending 不能查收
    const { data: early } = await client.rpc('confirm_withdrawal_collection', {
      p_user_id: user.id, p_withdrawal_id: req!.withdrawal_id,
    });
    assertEquals(early?.error_code, 'invalid_status');

    // admin 標記已匯款
    const { data: marked } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id, p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection', p_note: null,
    });
    assertEquals(marked?.success, true, JSON.stringify(marked));

    // 使用者查收 → completed；重複查收冪等
    const { data: confirmed } = await client.rpc('confirm_withdrawal_collection', {
      p_user_id: user.id, p_withdrawal_id: req!.withdrawal_id,
    });
    assertEquals(confirmed?.success, true);
    const { data: again } = await client.rpc('confirm_withdrawal_collection', {
      p_user_id: user.id, p_withdrawal_id: req!.withdrawal_id,
    });
    assertEquals(again?.idempotent, true);

    let { data: bal } = await client.from('reward_balances').select('*').eq('user_id', user.id).single();
    assertEquals(bal!.withdrawn, 1015);
    assertEquals(bal!.pending, 0);

    // -- 退件路徑（改 requested_at 繞過一天一次限制）--
    const { data: req2 } = await requestWithdrawal(client, user.id, 1000);
    assertEquals(req2?.success, false); // 同日已申請
    await client.from('withdrawals').update({
      requested_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
    }).eq('id', req!.withdrawal_id);

    const { data: req3 } = await requestWithdrawal(client, user.id, 2000);
    assertEquals(req3?.success, true, JSON.stringify(req3));
    const balBefore = (await client.from('reward_balances').select('*').eq('user_id', user.id).single()).data!;

    const { data: rejected } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id, p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'rejected', p_note: '銀行帳號有誤',
    });
    assertEquals(rejected?.success, true);

    bal = (await client.from('reward_balances').select('*').eq('user_id', user.id).single()).data!;
    // 退回 2015 → available 恢復；total_earned 不因退件灌水
    assertEquals(bal!.available, balBefore.available + 2015);
    assertEquals(bal!.pending, 0);
    assertEquals(bal!.total_earned, balBefore.total_earned);

    // 重複退件冪等（不會退兩次）
    const { data: rejectAgain } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id, p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'rejected', p_note: null,
    });
    assertEquals(rejectAgain?.idempotent, true);
    const balAfter = (await client.from('reward_balances').select('*').eq('user_id', user.id).single()).data!;
    assertEquals(balAfter.available, bal!.available);

    // 已退件不能再標已匯款
    const { data: invalid } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id, p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'awaiting_collection', p_note: null,
    });
    assertEquals(invalid?.error_code, 'invalid_transition');

    // 非管理員被拒
    const { data: forbidden } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: user.id, p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'awaiting_collection', p_note: null,
    });
    assertEquals(forbidden?.error_code, 'forbidden');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('HTTP 端點：withdraw / points-preview / verify-id / 提領記錄', async () => {
  const client = adminClient();
  const user = await createWithdrawableUser(client, 5000);

  try {
    const token = await getUserAccessToken(client, user.email);

    // verify-id
    const okVerify = await app.request('/api/rewards/verify-id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber: ID_NUMBER }),
    });
    assertEquals((await okVerify.json()).success, true);
    const badVerify = await app.request('/api/rewards/verify-id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber: 'Z999999999' }),
    });
    assertEquals(badVerify.status, 400);

    // points-preview（修：這個端點缺失曾讓領獎 dialog 卡死在第 2 步）
    const preview = await app.request('/api/rewards/points-preview', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const previewBody = await preview.json();
    assertEquals(preview.status, 200);
    assertEquals(previewBody.data.currentAvailable, 5000);

    // withdraw（走完整 HTTP 驗證 + RPC）
    const withdraw = await app.request('/api/rewards/withdraw', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000, idNumber: ID_NUMBER, bankCode: '812', bankAccount: '1234-5678-901234' }),
    });
    const withdrawBody = await withdraw.json();
    assertEquals(withdrawBody.success, true, JSON.stringify(withdrawBody));
    assertEquals(withdrawBody.data.fee, 15);

    // 提領記錄帶真實 fee 與 completed_at 欄位
    const list = await app.request('/api/rewards/withdrawals', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await list.json();
    assertEquals(listBody.data.withdrawals.length, 1);
    assertEquals(listBody.data.withdrawals[0].fee, 15);
    assertEquals(listBody.data.withdrawals[0].status, 'pending');
    assertEquals(listBody.data.withdrawals[0].completedAt, null);

    // /rewards 口徑一致（available 已扣 pending）
    const rewards = await app.request('/api/rewards', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rewardsBody = await rewards.json();
    assertEquals(rewardsBody.data.availableRewards, 5000 - 1015);
    assertEquals(rewardsBody.data.pendingRewards, 1015);
    assertEquals(rewardsBody.data.hasWithdrawnToday, true);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
