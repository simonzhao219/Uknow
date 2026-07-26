// ============================================================
// 姓名寫入路徑收斂的契約(20260726000002,需真 Postgres):
//   * 撤銷 `authenticated` 的 `update (name)` 後,該欄位不再能被自助寫入
//     ——直接以 `has_column_privilege` 問 Postgres(理由見下方那段註解:
//     走 PostgREST 測會因為 SELECT 權限而失去辨別力)。
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
import { assertEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// ============================================================
// GRANT 的效果直接問 Postgres,不透過 PostgREST。
//
// 為什麼不用「以使用者 token 打 PATCH /rest/v1/profiles」來測:
// `authenticated` 對 `profiles` **沒有 table-level SELECT**(migrations 裡從來
// 沒有 `grant select ... on profiles`——前端讀 profile 一律走 Edge Function 的
// service_role)。PostgREST 的 `?id=eq.<uuid>` 過濾條件本身就要讀 `id`,所以
// **任何**欄位的 PATCH 都會回 403 `42501 permission denied for table profiles`。
// 那個 403 來自 SELECT 而非 UPDATE,會讓斷言完全失去辨別力:即使 REVOKE 根本
// 沒生效也照樣「被拒」。CI 連續兩輪紅燈才逼出這個事實(第一輪誤判成
// `Prefer: return=representation` 的副作用,拿掉之後仍紅)。
//
// `has_column_privilege` 問的正是 migration 唯一改動的那件事,中間不隔任何一層。
// ============================================================
Deno.test('GRANT：authenticated 失去 name 的 UPDATE 權限,其餘自助欄位保留', async () => {
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql`
      select
        has_column_privilege('authenticated', 'public.profiles', 'name', 'UPDATE') as name_update,
        has_column_privilege('authenticated', 'public.profiles', 'phone', 'UPDATE') as phone_update,
        has_column_privilege(
          'authenticated', 'public.profiles', 'national_id', 'UPDATE'
        ) as national_id_update,
        has_table_privilege('authenticated', 'public.profiles', 'SELECT') as table_select
    `;

    // 這是 20260726000002 的核心:姓名不再能被自助寫入。
    assertEquals(row.name_update, false, 'name 的 UPDATE 權限應已撤銷');

    // 本次刻意只收 name 一欄。其餘同類繞過面仍在,留待另案——這兩條
    // characterization 存在是為了讓下一個讀者不會誤以為整張表都收乾淨了。
    assertEquals(row.phone_update, true, 'phone 的自助 UPDATE 本次不動');
    assertEquals(row.national_id_update, true, 'national_id 的自助 UPDATE 本次不動');

    // 記錄「沒有 table-level SELECT」這個事實:它是上面那段註解的依據,也讓
    // 日後若有人為了某個讀取功能補上 grant select,這條會紅、迫使重新評估
    // ——因為那會讓帶過濾條件的直寫路徑重新變得可表達。
    assertEquals(row.table_select, false, 'authenticated 不應有 profiles 的 table-level SELECT');
  } finally {
    await sql.end();
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
