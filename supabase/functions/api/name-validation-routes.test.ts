// ============================================================
// 姓名格式驗證接進兩個寫入端點的契約(需真 Postgres):
//   * `POST /auth/register` 與 `PUT /auth/profile` 是 `profiles.name` 唯一的
//     兩條 Edge Function 寫入路徑,兩者都必須擋下不合法姓名——前端 validateName
//     可被直接呼叫 API 繞過,而這個欄位是提領撥款時人工核對身分的依據。
//   * `PUT /auth/profile` 是**逐欄位局部更新**:姓名驗證只在 body 帶 `name`
//     時觸發。不含 `name` 的請求(只改手機/銀行帳號)必須維持既有行為
//     ——無條件檢查會誤擋,或對 undefined 呼叫字串方法而回 500。
//   * 型別混淆值(`null`/數字)回 400 而**不得** 500:`'name' in body` 只檢查
//     鍵存在、不檢查型別。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

const VALID_BODY = {
  name: '王小明',
  nationalId: 'A123456789',
  phone: '0933333333',
  birthDate: '2000-01-01',
};

async function registerAs(token: string, body: Record<string, unknown>) {
  return await app.request('/api/auth/register', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function putProfileAs(token: string, body: Record<string, unknown>) {
  return await app.request('/api/auth/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('POST /auth/register：不合法姓名回 400,合法中文姓名照舊寫入', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    const token = await getUserAccessToken(client, user.email);

    for (const bad of ['z1234567m', 'testuser', '王John', '谷辣斯·尤達卡', '王 小 明']) {
      const res = await registerAs(token, { ...VALID_BODY, name: bad });
      assertEquals(res.status, 400, `「${bad}」應被拒:${await res.clone().text()}`);
    }

    // 合法值仍照舊寫入(characterization,確認新驗證沒把正常路徑打壞)
    const ok = await registerAs(token, VALID_BODY);
    assertEquals(ok.status, 200, await ok.clone().text());
    const { data: profile } = await client
      .from('profiles').select('name').eq('id', user.id).single();
    assertEquals(profile?.name, '王小明');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('POST /auth/register：外文姓名通過——後端採聯集,不認模式旗標', async () => {
  // 前端在中文模式會拒 John Smith,後端不能:它只收到姓名字串,就算前端多送
  // 一個模式旗標,攻擊者也只要宣稱自己是外文模式即可繞過(規劃書 §2.2)。
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await registerAs(token, { ...VALID_BODY, name: 'John Smith' });
    assertEquals(res.status, 200, await res.clone().text());
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('PUT /auth/profile：不合法姓名回 400 且 DB 原值未被污染', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    await client.from('profiles').update({ name: '王小明' }).eq('id', user.id);
    const token = await getUserAccessToken(client, user.email);

    const res = await putProfileAs(token, { name: 'testuser' });
    assertEquals(res.status, 400, await res.clone().text());

    const { data: profile } = await client
      .from('profiles').select('name').eq('id', user.id).single();
    assertEquals(profile?.name, '王小明');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('PUT /auth/profile：不含 name 的請求維持局部更新,不觸發姓名驗證', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    // 刻意讓 DB 裡的既有姓名是不合新規則的值(既有髒資料不回溯校驗),
    // 再送一個只改手機的局部更新——必須成功,不能被姓名規則連坐。
    await client.from('profiles').update({ name: 'legacy_name' }).eq('id', user.id);
    const token = await getUserAccessToken(client, user.email);

    const res = await putProfileAs(token, { phone: '0912345678' });
    assertEquals(res.status, 200, await res.clone().text());

    const { data: profile } = await client
      .from('profiles').select('name, phone').eq('id', user.id).single();
    assertEquals(profile?.phone, '0912345678');
    assertEquals(profile?.name, 'legacy_name'); // 未被動到
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('PUT /auth/profile：型別混淆的 name 回 400 而非 500', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '' });

  try {
    const token = await getUserAccessToken(client, user.email);
    for (const bad of [null, 123, {}, []]) {
      const res = await putProfileAs(token, { name: bad });
      const body = await res.clone().text();
      assertEquals(res.status, 400, `${JSON.stringify(bad)} 應回 400,實際 ${res.status}:${body}`);
      assert(res.status !== 500, '型別混淆值不得把端點打成 500');
    }
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
