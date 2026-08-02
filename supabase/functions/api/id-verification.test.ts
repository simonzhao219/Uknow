// ============================================================
// 證件審核（migration 0802 0001 + /rewards/upload-id-photos）：
//   * 狀態機 none → pending（雙面齊全才進審核佇列）→ approved / rejected
//   * 只上傳單面維持 none——沒交齊卻顯示「審核中」是錯誤訊息，
//     且會讓 admin 佇列出現缺一張圖的送審紀錄
//   * 換照片一律退回 pending，並清掉上一輪的退回理由
//   * backfill：曾有提領實際匯出者視為已審核（admin 當初為了匯款
//     必然看過那些照片）；只上傳過從未成功提領者進佇列待審
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();

const { app } = await import('./index.ts');

/** 最小可上傳的假圖：內容不重要，端點只看 MIME 與大小。 */
function fakeImage(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'id.jpg', { type: 'image/jpeg' });
}

async function uploadPhotos(
  token: string,
  sides: { front?: boolean; back?: boolean },
): Promise<Response> {
  const form = new FormData();
  if (sides.front) form.append('idCardFront', fakeImage());
  if (sides.back) form.append('idCardBack', fakeImage());
  return await app.request('/api/rewards/upload-id-photos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function statusOf(client: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await client
    .from('profiles')
    .select('id_verification_status, id_reject_reason')
    .eq('id', userId)
    .single();
  return data as { id_verification_status: string; id_reject_reason: string | null };
}

Deno.test('profiles.id_verification_status：新使用者預設 none', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Fresh User' });
  try {
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'none');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('upload-id-photos：雙面齊全 → 轉為 pending 進審核佇列', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Both Sides' });
  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await uploadPhotos(token, { front: true, back: true });
    assertEquals(res.status, 200);
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('upload-id-photos：只上傳單面 → 維持 none，不進佇列', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'One Side' });
  try {
    const token = await getUserAccessToken(client, user.email);
    const res = await uploadPhotos(token, { front: true });
    assertEquals(res.status, 200);
    // 沒交齊卻顯示「審核中」是錯誤訊息——會員會以為在等 admin，
    // 實際上是他自己還沒傳完。
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'none');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('upload-id-photos：補齊第二面 → 由 none 轉為 pending', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Complete Later' });
  try {
    const token = await getUserAccessToken(client, user.email);
    await uploadPhotos(token, { front: true });
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'none');
    await uploadPhotos(token, { back: true });
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('upload-id-photos：審核通過後換照片 → 退回 pending', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Reupload After Pass' });
  try {
    const token = await getUserAccessToken(client, user.email);
    await uploadPhotos(token, { front: true, back: true });
    await client.from('profiles')
      .update({ id_verification_status: 'approved', id_verified_at: new Date().toISOString() })
      .eq('id', user.id);

    await uploadPhotos(token, { front: true });
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('upload-id-photos：被退回後重傳 → 回 pending 並清掉退回理由', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Reupload After Reject' });
  try {
    const token = await getUserAccessToken(client, user.email);
    await uploadPhotos(token, { front: true, back: true });
    await client.from('profiles')
      .update({ id_verification_status: 'rejected', id_reject_reason: '正面反光看不清楚' })
      .eq('id', user.id);

    await uploadPhotos(token, { front: true });
    const after = await statusOf(client, user.id);
    assertEquals(after.id_verification_status, 'pending');
    // 舊理由留著會讓會員在「審核中」狀態下仍看到上一輪的退件說明。
    assertEquals(after.id_reject_reason, null);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('backfill_id_verification：曾有提領實際匯出 → 視為 approved', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Backfill Paid' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await client.from('profiles').update({
      id_card_front_path: `${user.id}/front.jpg`,
      id_card_back_path: `${user.id}/back.jpg`,
    }).eq('id', user.id);
    await client.from('withdrawals').insert({
      user_id: user.id,
      amount: 1000,
      fee: 15,
      status: 'awaiting_collection',
      bank_code: '812',
      bank_account: '1234567890123',
    });

    await client.rpc('backfill_id_verification');
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'approved');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('backfill_id_verification：只上傳過從未成功提領 → 進佇列待審', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Backfill Unpaid' });
  try {
    await client.from('profiles').update({
      id_card_front_path: `${user.id}/front.jpg`,
      id_card_back_path: `${user.id}/back.jpg`,
    }).eq('id', user.id);

    await client.rpc('backfill_id_verification');
    // 這批人正是這道關卡本來就該看的對象，不能順手放行。
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('backfill_id_verification：提領只到 rejected → 不視為已審核', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Backfill Rejected' });
  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    await client.from('profiles').update({
      id_card_front_path: `${user.id}/front.jpg`,
      id_card_back_path: `${user.id}/back.jpg`,
    }).eq('id', user.id);
    await client.from('withdrawals').insert({
      user_id: user.id,
      amount: 1000,
      fee: 15,
      status: 'rejected',
      bank_code: '812',
      bank_account: '1234567890123',
    });

    await client.rpc('backfill_id_verification');
    // 退件的原因可能是銀行帳號有誤，不代表 admin 仔細看過證件。
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'pending');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('backfill_id_verification：沒有證件照 → 維持 none', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Backfill No Photo' });
  try {
    await client.rpc('backfill_id_verification');
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'none');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
