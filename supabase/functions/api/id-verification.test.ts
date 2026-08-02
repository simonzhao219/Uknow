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
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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

// ============================================================
// admin 審核端點（plan 階段 1.3）
//
// 合法轉換（plan §2.1）：
//   pending  → approved   核可
//   pending  → rejected   退回，理由必填
//   approved → rejected   事後發現造假可改判
//   rejected → approved   **拒絕**——需會員重新上傳，admin 不能直接翻回
//
// 「不連動既往提領」是刻意設計：守衛只在申請當下檢查，錢的狀態由提領
// 狀態機管，不由證件狀態回溯翻案。
// ============================================================

/** 建一個證件已送審（pending）的使用者。 */
async function createPendingUser(client: ReturnType<typeof adminClient>, name: string) {
  const user = await createTestUser(client, { name });
  const token = await getUserAccessToken(client, user.email);
  await uploadPhotos(token, { front: true, back: true });
  return { user, token };
}

async function createAdmin(client: ReturnType<typeof adminClient>) {
  const admin = await createTestUser(client, { name: 'Review Admin' });
  await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
  return admin;
}

function reviewRpc(
  client: ReturnType<typeof adminClient>,
  adminId: string,
  userId: string,
  approve: boolean,
  reason: string | null = null,
) {
  return client.rpc('admin_review_id', {
    p_admin_id: adminId,
    p_user_id: userId,
    p_approve: approve,
    p_reason: reason,
  });
}

Deno.test('admin_review_id：pending → approved，記錄審核人與時間', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user } = await createPendingUser(client, 'To Approve');

  try {
    const { data } = await reviewRpc(client, admin.id, user.id, true);
    assertEquals(data?.success, true, JSON.stringify(data));

    const { data: p } = await client.from('profiles')
      .select('id_verification_status, id_verified_by, id_verified_at, id_reject_reason')
      .eq('id', user.id).single();
    assertEquals(p!.id_verification_status, 'approved');
    assertEquals(p!.id_verified_by, admin.id);
    assertEquals(p!.id_verified_at !== null, true, '審核時間應寫入');
    // 核可時要清掉上一輪的退回理由，否則會員在「已通過」狀態下還看得到舊說明
    assertEquals(p!.id_reject_reason, null);
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('admin_review_id：pending → rejected，理由落在 id_reject_reason', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user } = await createPendingUser(client, 'To Reject');

  try {
    const { data } = await reviewRpc(client, admin.id, user.id, false, '背面反光看不清');
    assertEquals(data?.success, true, JSON.stringify(data));

    const { data: p } = await client.from('profiles')
      .select('id_verification_status, id_reject_reason, id_verified_by')
      .eq('id', user.id).single();
    assertEquals(p!.id_verification_status, 'rejected');
    assertEquals(p!.id_reject_reason, '背面反光看不清');
    assertEquals(p!.id_verified_by, admin.id);
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('admin_review_id：退回時未填理由 → reason_required', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user } = await createPendingUser(client, 'No Reason');

  try {
    // 空字串與 null 都算沒填——「被退回但不知道為什麼」是這條規則要防的事
    for (const reason of [null, '', '   ']) {
      const { data } = await reviewRpc(client, admin.id, user.id, false, reason);
      assertEquals(data?.success, false, `reason=${JSON.stringify(reason)}`);
      assertEquals(data?.error_code, 'reason_required', JSON.stringify(data));
    }
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'pending');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('admin_review_id：approved → rejected 允許，供事後發現造假時改判', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user } = await createPendingUser(client, 'Flip To Reject');

  try {
    await reviewRpc(client, admin.id, user.id, true);
    const { data } = await reviewRpc(client, admin.id, user.id, false, '與戶政資料不符');
    assertEquals(data?.success, true, JSON.stringify(data));
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'rejected');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('admin_review_id：rejected → approved 被拒，需會員重新上傳', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user } = await createPendingUser(client, 'Cannot Flip Back');

  try {
    await reviewRpc(client, admin.id, user.id, false, '照片模糊');
    const { data } = await reviewRpc(client, admin.id, user.id, true);
    assertEquals(data?.success, false, JSON.stringify(data));
    assertEquals(data?.error_code, 'invalid_transition', JSON.stringify(data));
    // 仍是 rejected：admin 直接翻回等於繞過「重看一次新照片」這件事
    assertEquals((await statusOf(client, user.id)).id_verification_status, 'rejected');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('admin_review_id：非管理員呼叫 → forbidden', async () => {
  const client = adminClient();
  const notAdmin = await createTestUser(client, { name: 'Not Admin' });
  const { user } = await createPendingUser(client, 'Target');

  try {
    const { data } = await reviewRpc(client, notAdmin.id, user.id, true);
    assertEquals(data?.success, false, JSON.stringify(data));
    assertEquals(data?.error_code, 'forbidden', JSON.stringify(data));
  } finally {
    await deleteTestUsers(client, [notAdmin.id, user.id]);
  }
});

Deno.test('admin_review_id：改判 rejected 不連動已送出的提領', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user } = await createPendingUser(client, 'Has Withdrawal');

  try {
    await client.from('profiles').update({
      referral_program_joined: true,
      national_id: 'A123456789',
    }).eq('id', user.id);
    await payForUser(client, user.id);
    await client.from('reward_transactions').insert({
      user_id: user.id,
      type: 'adjustment',
      amount: 5000,
      description: '測試點數',
    });
    await reviewRpc(client, admin.id, user.id, true);

    const { data: req } = await client.rpc('request_withdrawal', {
      p_user_id: user.id,
      p_amount: 1000,
      p_bank_code: '812',
      p_bank_account: '1234567890123',
    });
    assertEquals(req?.success, true, JSON.stringify(req));

    // 事後改判 rejected——守衛只在申請當下檢查，錢的狀態由提領狀態機管，
    // 不由證件狀態回溯翻案。
    await reviewRpc(client, admin.id, user.id, false, '事後查核不符');

    const { data: w } = await client.from('withdrawals')
      .select('status').eq('id', req!.withdrawal_id).single();
    assertEquals(w!.status, 'pending', '既有提領不應被證件改判影響');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('GET /admin/id-reviews：依狀態篩選，回證件照簽名網址', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user } = await createPendingUser(client, 'In Queue');

  try {
    const token = await getUserAccessToken(client, admin.email);
    const res = await app.request('/api/admin/id-reviews?status=pending', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);

    const row = body.data.reviews.find((r: { userId: string }) => r.userId === user.id);
    assertEquals(row !== undefined, true, '送審中的會員應出現在 pending 佇列');
    assertEquals(typeof row.idCardFrontUrl, 'string', '要給得出簽名網址，admin 才看得到照片');
    assertEquals(typeof row.idCardBackUrl, 'string');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('POST /admin/id-reviews/:userId/review：退回理由會員端讀得到', async () => {
  const client = adminClient();
  const admin = await createAdmin(client);
  const { user, token: userToken } = await createPendingUser(client, 'Reads Reason');

  try {
    const adminToken = await getUserAccessToken(client, admin.email);
    const res = await app.request(`/api/admin/id-reviews/${user.id}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve: false, reason: '正面缺角' }),
    });
    assertEquals(res.status, 200);

    // 會員端要看得到理由，否則只會重送一模一樣的照片再被退一次
    const mine = await app.request('/api/rewards/id-photos', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = await mine.json();
    assertEquals(body.data.verificationStatus, 'rejected');
    assertEquals(body.data.rejectReason, '正面缺角');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

// ============================================================
// 提權防線（審查 P0-2）
//
// 直接問 Postgres 而非「以 authenticated 打 rpc 看它被拒」——後者的 403
// 可能來自不相干的權限，斷言會失去辨別力（同 name-write-paths.test.ts
// 檔頭記載的教訓：即使 REVOKE 沒生效也照樣「被拒」）。
//
// 為什麼這條必須存在：PostgREST 的 rpc 端點**不經過** Edge Function 的
// /admin/* middleware，而 security definer 函數執行時 current_user 是函數
// 擁有者，正好滿足 prevent_admin_escalation 的放行條件。漏了 revoke
// execute，任何已登入會員都能直呼這些函數。
// ============================================================
Deno.test('GRANT：authenticated 不得 EXECUTE 證件審核相關函數', async () => {
  const sql = postgres(DB_URL);
  const signatures = [
    'public.admin_review_id(uuid,uuid,boolean,text)',
    'public.admin_list_id_reviews(text,integer,integer)',
    'public.backfill_id_verification()',
    'public.request_withdrawal(uuid,integer,text,text)',
  ];

  try {
    const rows = await sql`
      select
        r.sig,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
        has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec
      from unnest(${signatures}::text[]) as r(sig)
      join pg_proc p on p.oid = to_regprocedure(r.sig)
    `;

    // 先確認四個函數都存在——join 掉的話下面的迴圈會空轉通過
    assertEquals(rows.length, signatures.length, `函數應全部存在，實得 ${rows.length}`);

    for (const row of rows) {
      assertEquals(row.authenticated_exec, false, `${row.sig}：authenticated 不應可執行`);
      assertEquals(row.anon_exec, false, `${row.sig}：anon 不應可執行`);
    }
  } finally {
    await sql.end();
  }
});
