// ============================================================
// 「註冊已完成」之後的身分資料寫入守衛(需真 Postgres):
//   * `POST /auth/register` 對已完成付款的會員(effective_registration_step
//     = 3)回 403——身分證字號是經營權與提領身分核對的唯一鍵、推薦人在送出
//     前有「永久綁定」確認框、姓名是提領人工核對的依據。先前這支只有
//     requireAuth,「已付款不可改」只活在前端「先打 reset-registration
//     再導去編輯頁」的呼叫順序裡,直接打 API 就能改寫。
//   * 付款交易進行中送出的 register 也要被擋:檢查與寫入由 register_profile
//     在同一把 profiles 列鎖下完成。只在 Edge Function 先讀後寫時,UPDATE
//     會被付款的列鎖擋住、commit 後照樣寫進去。
//   * 付款前(step 0 首次送出、step 1 編輯模式重送、step 2 付款失敗後
//     重送)維持可寫——CompleteProfile 的編輯模式與推薦碼回填靠它。
//   * register_profile 呼叫失敗時 fail-closed(500、不寫入);遮罩過的身分證
//     字號拒寫。
//   * 身分欄位的 Edge Function 自助寫入口只有 `POST /auth/register`
//     (`PUT /auth/profile` 回 404)。register_profile 是 security definer
//     且以參數指定對象,anon / authenticated 不得執行。
//   * `authenticated` 對 profiles 沒有任何欄位的 UPDATE 權限——否則守衛
//     只擋得住走 Edge Function 的客戶端。用 has_any_column_privilege 直接
//     問 Postgres,理由見 name-write-paths.test.ts 的 GRANT 註解。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
  withRestTableFailure,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const IDENTITY_COLUMNS =
  'name, national_id, phone, birth_date, referred_by_code, referred_by_user_id, referred_by_is_default';

const FIRST_BODY = {
  name: '王小明',
  nationalId: 'A123456789',
  phone: '0933333333',
  birthDate: '2000-01-01',
};

const EDITED_BODY = {
  name: '李大華',
  nationalId: 'B223456789',
  phone: '0944444444',
  birthDate: '1999-12-31',
};

async function registerAs(token: string, body: Record<string, unknown>) {
  return await app.request('/api/auth/register', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readIdentity(client: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await client.from('profiles').select(IDENTITY_COLUMNS).eq('id', userId)
    .single();
  return data;
}

Deno.test('/auth/register：已完成付款的會員 → 403，身分欄位與推薦人不變', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '王小明' });
  const otherReferrer = await createTestUser(client, { name: '陳推薦' });

  try {
    assertEquals((await payForUser(client, otherReferrer.id)).error, null);
    const otherCode = await getActiveReferralCode(client, otherReferrer.id);

    await client.from('profiles').update({
      national_id: FIRST_BODY.nationalId,
      phone: FIRST_BODY.phone,
      birth_date: FIRST_BODY.birthDate,
    }).eq('id', member.id);
    assertEquals((await payForUser(client, member.id)).error, null);
    // 被平台預設推薦人綁定的會員:register 不清 referred_by_is_default,
    // 放行的話旗標會卡在 true、前端連使用者自己選的推薦人也一起隱藏。
    await client.from('profiles').update({ referred_by_is_default: true }).eq('id', member.id);
    const before = await readIdentity(client, member.id);

    const token = await getUserAccessToken(client, member.email);
    const res = await registerAs(token, { ...EDITED_BODY, referralCode: otherCode });

    assertEquals(res.status, 403, await res.clone().text());
    assertEquals((await res.json()).error, '註冊已完成，資料變更請聯繫客服');
    assertEquals(await readIdentity(client, member.id), before);
  } finally {
    await deleteTestUsers(client, [member.id, otherReferrer.id]);
  }
});

Deno.test('/auth/register：未付款的首次送出 → 200 並寫入（characterization）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await registerAs(token, FIRST_BODY);
    assertEquals(res.status, 200, await res.clone().text());

    const profile = await readIdentity(client, user.id);
    assertEquals(profile?.name, FIRST_BODY.name);
    assertEquals(profile?.national_id, FIRST_BODY.nationalId);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('/auth/register：付款前編輯模式重送 → 200，資料與推薦人照新值', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });
  const referrer = await createTestUser(client, { name: '陳推薦' });

  try {
    assertEquals((await payForUser(client, referrer.id)).error, null);
    const code = await getActiveReferralCode(client, referrer.id);

    const token = await getUserAccessToken(client, user.email);
    assertEquals((await registerAs(token, FIRST_BODY)).status, 200);

    const res = await registerAs(token, { ...EDITED_BODY, referralCode: code });
    assertEquals(res.status, 200, await res.clone().text());

    const profile = await readIdentity(client, user.id);
    assertEquals(profile?.name, EDITED_BODY.name);
    assertEquals(profile?.national_id, EDITED_BODY.nationalId);
    assertEquals(profile?.referred_by_code, code);
    assertEquals(profile?.referred_by_user_id, referrer.id);
  } finally {
    await deleteTestUsers(client, [user.id, referrer.id]);
  }
});

Deno.test('/auth/register：付款失敗留下 pending 訂單（step 2）仍可重送', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    const token = await getUserAccessToken(client, user.email);
    assertEquals((await registerAs(token, FIRST_BODY)).status, 200);

    const { error: orderErr } = await client.from('payment_orders').insert({
      user_id: user.id,
      amount: 1200,
      status: 'pending',
      payment_method: 'payuni',
      transaction_id: `TEST-PENDING-${user.id}`,
    });
    assertEquals(orderErr, null);
    const { data: step } = await client.rpc('effective_registration_step', {
      p_user_id: user.id,
    });
    assertEquals(step, 2);

    const res = await registerAs(token, EDITED_BODY);
    assertEquals(res.status, 200, await res.clone().text());
    assertEquals((await readIdentity(client, user.id))?.name, EDITED_BODY.name);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('/auth/register：付款交易持鎖期間送出 → 等付款 commit 後 403，資料不變', async () => {
  // 重現手法:測試自己開交易呼叫 process_successful_payment(它對 profiles
  // 列 for update),不 commit,此時送出 register;確認 register 被鎖擋住,
  // 再 commit。只在 Edge Function 先讀後寫的實作會在這裡回 200 並改寫資料。
  const client = adminClient();
  const user = await createTestUser(client, { name: FIRST_BODY.name });
  const sql = postgres(DB_URL);

  try {
    await client.from('profiles').update({
      national_id: FIRST_BODY.nationalId,
      phone: FIRST_BODY.phone,
      birth_date: FIRST_BODY.birthDate,
    }).eq('id', user.id);
    const tradeNo = `TEST-RACE-${user.id}`;
    const { error: orderErr } = await client.from('payment_orders').insert({
      user_id: user.id,
      amount: 1200,
      status: 'pending',
      payment_method: 'payuni',
      transaction_id: tradeNo,
    });
    assertEquals(orderErr, null);
    const token = await getUserAccessToken(client, user.email);

    let settled = false;
    let pending: Promise<Response> | undefined;
    await sql.begin(async (tx) => {
      await tx`
        select public.process_successful_payment(
          ${user.id}::uuid, ${tradeNo}, ${tradeNo}, '{"Status":"SUCCESS"}'::jsonb
        )
      `;
      pending = registerAs(token, EDITED_BODY).finally(() => (settled = true));
      await new Promise((r) => setTimeout(r, 1500));
      assertEquals(settled, false, 'register 應被付款交易的 profiles 列鎖擋住');
    });

    const res = await pending!;
    assertEquals(res.status, 403, await res.clone().text());
    const { data: order } = await client.from('payment_orders').select('status')
      .eq('transaction_id', tradeNo).single();
    assertEquals(order?.status, 'completed');
    const profile = await readIdentity(client, user.id);
    assertEquals(profile?.name, FIRST_BODY.name);
    assertEquals(profile?.national_id, FIRST_BODY.nationalId);
  } finally {
    await sql.end();
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('/auth/register：register_profile 失敗 → 500 且不寫入（fail-closed）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await withRestTableFailure(
      ['rpc/register_profile'],
      () => registerAs(token, FIRST_BODY),
    );
    assertEquals(res.status, 500, await res.clone().text());
    assertEquals((await readIdentity(client, user.id))?.national_id, null);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('/auth/register：遮罩過的身分證字號 → 400，不寫回 DB', async () => {
  // 編輯模式以 register 的回應(nationalId 已遮罩成 A12****789)回填表單;
  // 前端驗證若被繞過,遮罩值會把 DB 的完整字號蓋成星號。
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    const token = await getUserAccessToken(client, user.email);
    assertEquals((await registerAs(token, FIRST_BODY)).status, 200);

    const res = await registerAs(token, { ...FIRST_BODY, nationalId: 'A12****789' });
    assertEquals(res.status, 400, await res.clone().text());
    assertEquals((await readIdentity(client, user.id))?.national_id, FIRST_BODY.nationalId);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('PUT /auth/profile：無此寫入口 → 404，已付款會員的身分證不變', async () => {
  const client = adminClient();
  const member = await createTestUser(client, { name: '王小明' });

  try {
    await client.from('profiles').update({ national_id: FIRST_BODY.nationalId })
      .eq('id', member.id);
    assertEquals((await payForUser(client, member.id)).error, null);

    const token = await getUserAccessToken(client, member.email);
    const res = await app.request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nationalId: EDITED_BODY.nationalId }),
    });
    assertEquals(res.status, 404, await res.clone().text());
    assertEquals((await readIdentity(client, member.id))?.national_id, FIRST_BODY.nationalId);
  } finally {
    await deleteTestUsers(client, [member.id]);
  }
});

Deno.test('GRANT：authenticated 對 profiles 沒有任何欄位的 UPDATE 權限', async () => {
  // has_any_column_privilege 也涵蓋 table-level UPDATE;日後若有人為新功能
  // 重開任何一欄的自助寫入,這條會紅、迫使重新評估守衛是否被繞過。
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql`
      select has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE') as any_update
    `;
    assertEquals(row.any_update, false, 'authenticated 不應能直連更新 profiles 的任何欄位');
  } finally {
    await sql.end();
  }
});

Deno.test('register_profile：anon 與 authenticated 不得執行', async () => {
  // security definer 且以參數指定 user_id——任何能執行它的角色都能改寫
  // 任何人的身分資料。平台 default privileges 會替新函式多給執行權,
  // 所以要釘「不得有」,不是釘「有什麼」。
  const sql = postgres(DB_URL);
  try {
    const signature = 'public.register_profile(uuid, text, text, date, text, text, uuid)';
    const [row] = await sql`
      select
        has_function_privilege('anon', ${signature}, 'EXECUTE') as anon_exec,
        has_function_privilege('authenticated', ${signature}, 'EXECUTE') as auth_exec
    `;
    assertEquals(row.anon_exec, false);
    assertEquals(row.auth_exec, false);
  } finally {
    await sql.end();
  }
});
