// ============================================================
// 姓名寫入路徑收斂的契約(20260726000002,需真 Postgres):
//   * 撤銷 `authenticated` 的 `update (name)` 之後,使用者 token 直打
//     PostgREST 改姓名必須被拒。這條路徑是姓名格式驗證最大的繞過面——
//     Edge Function 的驗證對它完全無效。
//   * `handle_new_user()` 不再從 `raw_user_meta_data ->> 'name'` 帶入姓名:
//     帶 `data.name` 呼叫 signup 後 `profiles.name` 必為空字串。那個 metadata
//     是任何人打公開 Auth 端點就能帶入的(只需 anon key、免 OTP),且函式是
//     security definer,不受欄位 GRANT 限制。
//   * **防漏抄**:`create or replace function` 是整段覆蓋,所以要釘住「推薦碼
//     解析邏輯還在」——漏抄會靜默清空日後所有新註冊使用者的
//     `referred_by_user_id`,而且不會有任何錯誤訊息。
//   * 其餘自助欄位(phone 等)的 GRANT 本次刻意不動,characterization 釘住,
//     以免日後有人以為這個 migration 把整張表都收乾淨了。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  patchProfileAsUser,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();

Deno.test('profiles.name：使用者 token 直打 PostgREST 改姓名被拒,DB 原值不變', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '王小明' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await patchProfileAsUser(token, user.id, { name: 'z1234567m' });

    // PostgREST 對缺少欄位權限回 401/403(視版本),總之不得是 2xx。
    assert(!res.ok, `直寫 name 應被拒,實際 ${res.status}:${await res.text()}`);

    const { data: profile } = await client
      .from('profiles').select('name').eq('id', user.id).single();
    assertEquals(profile?.name, '王小明');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('profiles.phone：本次未撤銷的自助欄位仍可直寫(characterization)', async () => {
  // 刻意釘住「只收了 name 一欄」。phone / birth_date / national_id /
  // bank_code / bank_account 的同類繞過面仍在,留待另案——這條測試存在是
  // 為了讓下一個讀者不會誤以為 20260726000002 把整張表都收乾淨了。
  const client = adminClient();
  const user = await createTestUser(client, { name: '王小明' });

  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await patchProfileAsUser(token, user.id, { phone: '0912345678' });
    assert(res.ok, `phone 直寫應仍成功,實際 ${res.status}:${await res.text()}`);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('handle_new_user：signup 帶 data.name 也不會寫進 profiles.name', async () => {
  const client = adminClient();
  const email = `test-hnu-${Date.now()}@example.invalid`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { name: '注入的姓名' },
  });
  assertEquals(error, null, `建立使用者失敗:${error?.message}`);
  const userId = data.user!.id;

  try {
    const { data: profile } = await client
      .from('profiles').select('name').eq('id', userId).single();
    assertEquals(profile?.name, '', 'metadata 的 name 不得被 trigger 帶入');
  } finally {
    await deleteTestUsers(client, [userId]);
  }
});

Deno.test('handle_new_user：推薦碼解析仍在——防 create or replace 漏抄', async () => {
  // 這條是專門的防漏抄驗證。`create or replace function` 整段覆蓋,只改
  // name 那一行時若漏抄 v_ref_code / v_referrer 的解析,日後所有新註冊
  // 使用者的 referred_by_user_id 會靜默變 null,沒有任何錯誤訊息。
  const client = adminClient();
  const referrer = await createTestUser(client, { name: '推薦人' });

  try {
    const { error: payError } = await payForUser(client, referrer.id);
    assertEquals(payError, null, `推薦人付款失敗:${payError?.message}`);
    const code = await getActiveReferralCode(client, referrer.id);

    const referee = await createTestUser(client, { name: '下線', referredByCode: code });
    try {
      const { data: profile } = await client
        .from('profiles')
        .select('referred_by_code, referred_by_user_id')
        .eq('id', referee.id)
        .single();
      assertEquals(profile?.referred_by_code, code);
      assertEquals(
        profile?.referred_by_user_id,
        referrer.id,
        'trigger 內的推薦人解析邏輯不見了——create or replace 漏抄',
      );
    } finally {
      await deleteTestUsers(client, [referee.id]);
    }
  } finally {
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('handle_new_user：phone 與 national_id 仍從 metadata 帶入(characterization)', async () => {
  // 同一支函式的另外兩個 metadata 欄位本次不動(見 migration 檔頭的註)。
  const client = adminClient();
  const email = `test-hnu2-${Date.now()}@example.invalid`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { phone: '0987654321', national_id: 'A123456789' },
  });
  assertEquals(error, null, `建立使用者失敗:${error?.message}`);
  const userId = data.user!.id;

  try {
    const { data: profile } = await client
      .from('profiles').select('phone, national_id').eq('id', userId).single();
    assertEquals(profile?.phone, '0987654321');
    assertEquals(profile?.national_id, 'A123456789');
  } finally {
    await deleteTestUsers(client, [userId]);
  }
});
