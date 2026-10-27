// ============================================================
// DELETE /auth/cancel-signup 的金流稽核守衛：
//   * 已完成付款的會員不得自助刪除帳號——schema 全面 on delete cascade，
//     刪 auth user 會連鎖抹除 payment_orders / withdrawals / referral_edges，
//     金流稽核紀錄與推薦樹對帳從此消失（對照 /auth/reset-registration
//     既有的「已完成付款無法重置」守衛，cancel-signup 必須同等保護）。
//   * 已付款待開通（pending 訂單上已存 PayUni SUCCESS）同樣被拒——錢已收，
//     刪帳號會連訂單與 PayUni 回應一起 cascade 抹掉，不可逆。
//   * 尚未付款的註冊中用戶維持既有行為：可以刪除（「我晚點再填」流程）。
//   * 守衛讀不到資料時 fail-closed（500、不刪）——刪除不可逆。三支守衛查詢
//     （completed 訂單、已付款待開通、提領）各自讀取失敗都要擋。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
  seedPaidAwaitingActivation,
  withRestTableFailure,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

async function cancelSignup(token: string) {
  return await app.request('/api/auth/cancel-signup', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// 只讓「已付款待開通」那支查詢失敗（payment_orders 且帶 status=eq.pending），
// completed 訂單與提領查詢照常——withRestTableFailure 以表為單位，分不出
// handler 有沒有檢查這支查詢自己的 error。原理同 withRestTableFailure:
// sb() 每次新建 client。
async function withPaidPendingQueryFailure<T>(run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (/\/rest\/v1\/payment_orders\?/.test(url) && url.includes('status=eq.pending')) {
      return Promise.resolve(
        new Response(JSON.stringify({ code: 'XX000', message: 'injected failure' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return original(input, init);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

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
      user_id: user.id,
      type: 'adjustment',
      amount: 5000,
      description: '測試點數',
    });
    const { data: w } = await client.rpc('request_withdrawal', {
      p_user_id: user.id,
      p_amount: 1000,
      p_bank_code: '812',
      p_bank_account: '1234567890123',
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

Deno.test('cancel-signup：讀不到付款紀錄 → 500，已付款會員不被刪除（fail-closed）', async () => {
  // 讀取失敗若被當成「沒有付款紀錄」,會刪掉已付款會員並連鎖抹除金流稽核資料。
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Paid Member' });

  try {
    const { error } = await payForUser(client, user.id);
    assertEquals(error, null);

    const token = await getUserAccessToken(client, user.email);
    const res = await withRestTableFailure(
      ['payment_orders'],
      async () =>
        await app.request('/api/auth/cancel-signup', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
    );
    assertEquals(res.status, 500, await res.clone().text());

    const { data: profile } = await client
      .from('profiles').select('id').eq('id', user.id).maybeSingle();
    assert(profile, '讀取失敗時不得刪除帳號');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('cancel-signup：已付款待開通（pending + SUCCESS）被拒絕，訂單保留', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Awaiting Member' });

  try {
    const tradeNo = await seedPaidAwaitingActivation(client, user.id);
    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/auth/cancel-signup', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 400, await res.clone().text());

    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', tradeNo).maybeSingle();
    assertEquals(order?.status, 'pending', 'PayUni 已收款的訂單必須保留');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('cancel-signup：讀不到已付款待開通的訂單 → 500，帳號與訂單保留', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Awaiting Member' });

  try {
    const tradeNo = await seedPaidAwaitingActivation(client, user.id);
    const token = await getUserAccessToken(client, user.email);
    const res = await withPaidPendingQueryFailure(async () => await cancelSignup(token));
    assertEquals(res.status, 500, await res.clone().text());

    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', tradeNo).maybeSingle();
    assertEquals(order?.status, 'pending', '讀取失敗時不得刪除帳號與訂單');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('cancel-signup：讀不到提領紀錄 → 500，帳號保留', async () => {
  // 未付款用戶本來可刪；只有提領查詢失敗時也必須擋——確認不了「沒有提領」就不刪。
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Unpaid Signup' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await withRestTableFailure(['withdrawals'], async () => await cancelSignup(token));
    assertEquals(res.status, 500, await res.clone().text());

    const { data: profile } = await client
      .from('profiles').select('id').eq('id', user.id).maybeSingle();
    assert(profile, '讀取失敗時不得刪除帳號');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('cancel-signup：pending 訂單沒有 PayUni SUCCESS（付款未完成）仍可刪除', async () => {
  // 對照組：擋的是「錢已收」，不是「有 pending 訂單」。去過 PayUni 又放棄的人
  // 維持「我晚點再填」可刪。
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Abandoned Checkout' });
  let deleted = false;

  try {
    const { error } = await client.from('payment_orders').insert({
      user_id: user.id,
      amount: 1200,
      status: 'pending',
      payment_method: 'payuni',
      transaction_id: `TEST-ABANDON-${user.id}`,
    });
    assertEquals(error, null);

    const token = await getUserAccessToken(client, user.email);
    const res = await cancelSignup(token);
    assertEquals(res.status, 200, await res.clone().text());

    const { data: profile } = await client
      .from('profiles').select('id').eq('id', user.id).maybeSingle();
    assertEquals(profile, null, '付款未完成的用戶應可刪除');
    deleted = true;
  } finally {
    if (!deleted) await deleteTestUsers(client, [user.id]);
  }
});
