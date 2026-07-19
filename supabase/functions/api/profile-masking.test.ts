// ============================================================
// 敏感欄位遮罩契約：
//   * GET /auth/profile 不得回傳完整身分證字號與銀行帳號——持有 access
//     token 的一方（XSS、被竊 token）不應能拿到完整值，否則「敏感操作
//     需輸入身分證驗證」（verify-id / 提領 / 領獎）形同虛設。
//     遮罩格式：nationalId → A12****789（頭 3 尾 3），bankAccount → 僅末 4 碼。
//   * 伺服器端比對流程不受遮罩影響：POST /rewards/verify-id 用完整字號
//     仍驗證成功（characterization，釘住既有行為）。
//   * PUT /auth/profile 拒絕遮罩值寫入——防止前端誤把遮罩值回填送出，
//     把 profiles.national_id 蓋成星號造成資料損毀。
//   * GET /admin/withdrawals 維持完整值（管理員匯款作業需要，本次不動，
//     characterization 釘住以免遮罩改動誤傷）。
// ============================================================
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
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

const ID_NUMBER = 'A123456789';
const BANK_ACCOUNT = '1234567890123';

async function createMemberWithSensitiveData(client: ReturnType<typeof adminClient>) {
  const user = await createTestUser(client, { name: 'Masked Member' });
  const { error } = await payForUser(client, user.id);
  assertEquals(error, null);
  await client.from('profiles').update({
    national_id: ID_NUMBER,
    bank_code: '812',
    bank_account: BANK_ACCOUNT,
  }).eq('id', user.id);
  return user;
}

Deno.test('GET /auth/profile：nationalId 與 bankAccount 必須遮罩', async () => {
  const client = adminClient();
  const user = await createMemberWithSensitiveData(client);

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200);
    const profile = await res.json();

    // 頭 3 尾 3，中間 4 碼星號；絕不可等於完整字號
    assertMatch(
      profile.nationalId ?? '',
      /^[A-Z]\d{2}\*{4}\d{3}$/,
      `nationalId 未遮罩：${profile.nationalId}`,
    );
    assert(profile.nationalId !== ID_NUMBER, 'nationalId 不得為完整明文');

    // 銀行帳號只露末 4 碼
    assertMatch(
      profile.bankAccount ?? '',
      /^\*+\d{4}$/,
      `bankAccount 未遮罩：${profile.bankAccount}`,
    );
    assert(!String(profile.bankAccount).includes(BANK_ACCOUNT.slice(0, 9)),
      'bankAccount 不得包含完整帳號');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('POST /rewards/verify-id：完整字號的伺服器端比對不受遮罩影響', async () => {
  const client = adminClient();
  const user = await createMemberWithSensitiveData(client);

  try {
    const token = await getUserAccessToken(client, user.email);
    const ok = await app.request('/api/rewards/verify-id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber: ID_NUMBER }),
    });
    assertEquals(ok.status, 200);
    assertEquals((await ok.json()).success, true);

    // 拿遮罩值來驗證必須失敗（遮罩值不是身分證字號）
    const masked = await app.request('/api/rewards/verify-id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNumber: 'A12****789' }),
    });
    assertEquals(masked.status, 400);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('PUT /auth/profile：遮罩值不得寫回 nationalId / bankAccount', async () => {
  const client = adminClient();
  const user = await createMemberWithSensitiveData(client);

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await app.request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nationalId: 'A12****789', bankAccount: '*********0123' }),
    });
    assertEquals(res.status, 400, await res.clone().text());

    // DB 內的原值必須未被污染
    const { data: profile } = await client
      .from('profiles').select('national_id, bank_account').eq('id', user.id).single();
    assertEquals(profile?.national_id, ID_NUMBER);
    assertEquals(profile?.bank_account, BANK_ACCOUNT);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('GET /admin/withdrawals：管理員列表維持完整值（characterization）', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: 'Withdraw Member' });
  const admin = await createTestUser(client, { name: 'Admin User' });

  try {
    const { error } = await payForUser(client, member.id);
    assertEquals(error, null);
    await client.from('profiles').update({
      referral_program_joined: true,
      national_id: ID_NUMBER,
      id_card_front_path: `${member.id}/front.jpg`,
      id_card_back_path: `${member.id}/back.jpg`,
    }).eq('id', member.id);
    await client.from('reward_transactions').insert({
      user_id: member.id, type: 'adjustment', amount: 5000, description: '測試點數',
    });
    const { data: w } = await client.rpc('request_withdrawal', {
      p_user_id: member.id, p_amount: 1000, p_bank_code: '812', p_bank_account: BANK_ACCOUNT,
    });
    assertEquals(w?.success, true, JSON.stringify(w));

    await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
    const adminToken = await getUserAccessToken(client, admin.email);
    const res = await app.request('/api/admin/withdrawals', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    const row = (body.data?.withdrawals ?? []).find((x: any) => x.userId === member.id);
    assert(row, '管理員列表應包含該筆提領單');
    assertEquals(row.idNumber, ID_NUMBER, '匯款作業需要完整身分證字號');
    assertEquals(row.bankAccount, BANK_ACCOUNT, '匯款作業需要完整銀行帳號');
  } finally {
    await deleteTestUsers(client, [member.id, admin.id]);
  }
});
