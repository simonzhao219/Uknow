// ============================================================
// effective_registration_step / buildProfileResponse 的「4 態契約」測試。
//
// 這是「空白付款確認頁」事故的回歸測試（見 migration
// 20260719000004 與 registrationFlow.ts）。
//
// 事故根因：前端註冊漏斗以 4 態設計並用 step 0 =「基本資料未填」決定
// 「該回完善資料頁」，但後端 effective_registration_step 在「沒有付款訂單」
// 時一律回 1、從不回 0——導致剛註冊、資料全空的使用者被算成 step 1，
// 直接被帶到會顯示空白「註冊資訊確認」的結帳頁，形成死巷。
//
// 過去測試的盲點：前端單元測試「手餵」step 0 驗證導向正確，卻從沒有人
// 驗證「後端真的會產生 0」；後端測試只驗證『有訂單』的 step 2/3。這條縫
// ——後端是否真的吐得出前端所依賴的每一個 step 值——沒有任何測試蓋到。
// 這個檔就是把那條縫釘死：把 profiles 的實際欄位狀態 → step 值的對應，
// 以及它如何一路透傳到 buildProfileResponse（前端唯一讀到的來源）鎖住。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
const { buildProfileResponse } = await import('./index.ts');

let seq = 0;

async function stepOf(client: ReturnType<typeof adminClient>, userId: string): Promise<number> {
  const { data, error } = await client.rpc('effective_registration_step', { p_user_id: userId });
  assertEquals(error, null, `effective_registration_step 出錯：${error?.message}`);
  return data as number;
}

// 把基本資料補齊，等同使用者走完 /auth/register（CompleteProfile 送出）。
async function fillBasicProfile(client: ReturnType<typeof adminClient>, userId: string) {
  const { error } = await client
    .from('profiles')
    .update({ name: '王小明', phone: '0912345678', birth_date: '1990-01-01' })
    .eq('id', userId);
  assertEquals(error, null, `補基本資料失敗：${error?.message}`);
}

async function seedPendingOrder(client: ReturnType<typeof adminClient>, userId: string) {
  const tradeNo = `CONTRACT-${Date.now()}-${seq++}`;
  const { error } = await client.from('payment_orders').insert({
    user_id: userId, amount: 1200, status: 'pending',
    payment_method: 'payuni', transaction_id: tradeNo,
  });
  assertEquals(error, null, `建立 pending 訂單失敗：${error?.message}`);
  return tradeNo;
}

// ---- effective_registration_step：完整階梯 0 → 1 → 2 → 3 ----

Deno.test('契約：剛註冊（有 name、缺 phone/birth）、無訂單 → step 0（前端據此導回完善資料頁）', async () => {
  const client = adminClient();
  // createTestUser 只透過 metadata 帶 name（走 handle_new_user），
  // phone / birth_date 維持 null——這就是「帳號已建立、基本資料未填」的真實形狀。
  const user = await createTestUser(client, { name: '尚未填資料' });
  try {
    assertEquals(await stepOf(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('契約：只缺一欄（有 name、有 phone、缺 birth）仍算未填齊 → step 0', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '缺生日' });
  try {
    await client.from('profiles').update({ phone: '0912345678' }).eq('id', user.id);
    assertEquals(await stepOf(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('契約：name 是空字串（handle_new_user 的 coalesce 預設）也算沒填 → step 0', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '待清空' });
  try {
    // 明確把 name 設為空字串、其餘填齊：驗證 SQL 用的是 `<> ''` 而非只判 null。
    await client
      .from('profiles')
      .update({ name: '', phone: '0912345678', birth_date: '1990-01-01' })
      .eq('id', user.id);
    assertEquals(await stepOf(client, user.id), 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('契約：基本資料填齊、尚無訂單 → step 1（待付款）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '資料填齊' });
  try {
    await fillBasicProfile(client, user.id);
    assertEquals(await stepOf(client, user.id), 1);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('契約：有 pending 訂單 → step 2（付款中）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '付款中' });
  try {
    await fillBasicProfile(client, user.id);
    await seedPendingOrder(client, user.id);
    assertEquals(await stepOf(client, user.id), 2);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('契約：有 completed 訂單 → step 3（完成）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '已完成' });
  try {
    await fillBasicProfile(client, user.id);
    const { error } = await payForUser(client, user.id);
    assertEquals(error, null);
    assertEquals(await stepOf(client, user.id), 3);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

// ---- 接縫測試：step 值要一路透傳到 buildProfileResponse（前端唯一讀到的來源）----
// buildProfileResponse 內部是 `const registrationStep = step ?? 1`——這個測試
// 同時釘住兩件事：(1) 後端算出的 0 不會被 `?? 1` 蓋成 1；(2) 回應裡的 name/
// phone/birthDate 確實是空的，前端 isProfileComplete 這道防線才會生效。

Deno.test('接縫：剛註冊、資料未填的使用者，buildProfileResponse 回 registrationStep 0（不被 ?? 1 蓋掉）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '接縫用戶' });
  try {
    const profile = await buildProfileResponse(client, user.id, user.email);
    assertEquals(profile?.registrationStep, 0, '後端算出的 0 必須原樣透傳，不能退回 1');
    // 前端第二道防線（resolveCheckoutPageRedirect 的 isProfileComplete）依賴這些欄位為空。
    assertEquals(profile?.phone, null);
    assertEquals(profile?.birthDate, null);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('接縫：資料填齊、無訂單的使用者，buildProfileResponse 回 registrationStep 1', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: '填齊用戶' });
  try {
    await fillBasicProfile(client, user.id);
    const profile = await buildProfileResponse(client, user.id, user.email);
    assertEquals(profile?.registrationStep, 1);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
