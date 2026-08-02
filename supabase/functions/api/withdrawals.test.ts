// ============================================================
// 提領子系統（migration 0718 0101 + /rewards/withdraw 端點群）：
//   * 帳本語意：申請當下即扣 amount+fee；退件插入補償 adjustment
//   * 生命週期：pending → awaiting_collection → completed / rejected
//   * 業務規則：金額級距、一天一次（台灣日）、餘額、會籍、證件照
// ============================================================
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
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
      user_id: user.id,
      type: 'adjustment',
      amount: balance,
      description: '測試點數',
    });
  }
  return user;
}

async function requestWithdrawal(
  client: ReturnType<typeof adminClient>,
  userId: string,
  amount: number,
) {
  return await client.rpc('request_withdrawal', {
    p_user_id: userId,
    p_amount: amount,
    p_bank_code: '812',
    p_bank_account: '1234567890123',
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
      user_id: user.id,
      type: 'adjustment',
      amount: 1,
      description: '補足邊界',
    });
    r = await requestWithdrawal(client, user.id, 1000);
    assertEquals(r.data?.success, true, JSON.stringify(r.data));

    // 證件照缺失
    const user2 = await createTestUser(client, { name: 'No Photos' });
    await payForUser(client, user2.id);
    await client.from('profiles').update({
      referral_program_joined: true,
      national_id: 'B123456789',
    }).eq('id', user2.id);
    await client.from('reward_transactions').insert({
      user_id: user2.id,
      type: 'adjustment',
      amount: 5000,
      description: '測試點數',
    });
    const r2 = await requestWithdrawal(client, user2.id, 1000);
    assertEquals(r2.data?.error_code, 'missing_id_photos');

    // 會籍過期（expired）不能提領
    await client.from('profiles').update({
      id_card_front_path: 'x/front.jpg',
      id_card_back_path: 'x/back.jpg',
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
      p_user_id: user.id,
      p_withdrawal_id: req!.withdrawal_id,
    });
    assertEquals(early?.error_code, 'invalid_status');

    // admin 標記已匯款
    const { data: marked } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
    });
    assertEquals(marked?.success, true, JSON.stringify(marked));

    // 使用者查收 → completed；重複查收冪等
    const { data: confirmed } = await client.rpc('confirm_withdrawal_collection', {
      p_user_id: user.id,
      p_withdrawal_id: req!.withdrawal_id,
    });
    assertEquals(confirmed?.success, true);
    const { data: again } = await client.rpc('confirm_withdrawal_collection', {
      p_user_id: user.id,
      p_withdrawal_id: req!.withdrawal_id,
    });
    assertEquals(again?.idempotent, true);

    let { data: bal } = await client.from('reward_balances').select('*').eq('user_id', user.id)
      .single();
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
    const balBefore =
      (await client.from('reward_balances').select('*').eq('user_id', user.id).single()).data!;

    const { data: rejected } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'rejected',
      p_note: '銀行帳號有誤',
    });
    assertEquals(rejected?.success, true);

    bal = (await client.from('reward_balances').select('*').eq('user_id', user.id).single()).data!;
    // 退回 2015 → available 恢復；total_earned 不因退件灌水
    assertEquals(bal!.available, balBefore.available + 2015);
    assertEquals(bal!.pending, 0);
    assertEquals(bal!.total_earned, balBefore.total_earned);

    // 重複退件冪等（不會退兩次）
    const { data: rejectAgain } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'rejected',
      p_note: null,
    });
    assertEquals(rejectAgain?.idempotent, true);
    const balAfter =
      (await client.from('reward_balances').select('*').eq('user_id', user.id).single()).data!;
    assertEquals(balAfter.available, bal!.available);

    // 已退件不能再標已匯款
    const { data: invalid } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
    });
    assertEquals(invalid?.error_code, 'invalid_transition');

    // 非管理員被拒
    const { data: forbidden } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: user.id,
      p_withdrawal_id: req3!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
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
      body: JSON.stringify({
        amount: 1000,
        idNumber: ID_NUMBER,
        bankCode: '812',
        bankAccount: '1234-5678-901234',
      }),
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

// ============================================================
// 證件審核與提領的關係（plan 階段 1.2 / 驗收情境 V5、V6）
//
// 需求方裁決:審核結果**只在 rejected 時**阻擋提領。真正的關卡是匯款不是
// 申請——admin 本來就不會在沒核對證件的情況下轉帳,在申請端擋「還沒輪到
// 審核」的人不增加實質保護,只讓每個新會員的首次提領多等三個工作天。
// ============================================================

Deno.test('request_withdrawal：證件被退回 → id_rejected 並附退回理由', async () => {
  const client = adminClient();
  const user = await createWithdrawableUser(client, 5000);

  try {
    await client.from('profiles').update({
      id_verification_status: 'rejected',
      id_reject_reason: '照片反光看不清出生年月日',
    }).eq('id', user.id);

    const { data, error } = await requestWithdrawal(client, user.id, 2000);
    assertEquals(error, null);
    assertEquals(data?.success, false, JSON.stringify(data));
    assertEquals(data?.error_code, 'id_rejected', JSON.stringify(data));
    // 理由必須帶到會員面前——只說「被退回」會讓人重送一模一樣的照片,
    // 然後再被退一次。
    assertStringIncludes(String(data?.message ?? ''), '照片反光看不清出生年月日');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('request_withdrawal：none/pending/approved 三態皆不擋提領', async () => {
  const client = adminClient();

  // none  = 既有會員（本次 migration 之前就上傳過照片的人）,不得因新關卡被擋
  // pending = 審核中,V5 明訂放行
  // approved = 已通過
  for (const status of ['none', 'pending', 'approved'] as const) {
    const user = await createWithdrawableUser(client, 5000);
    try {
      await client.from('profiles')
        .update({ id_verification_status: status })
        .eq('id', user.id);

      const { data, error } = await requestWithdrawal(client, user.id, 2000);
      assertEquals(error, null);
      assertEquals(data?.success, true, `${status}: ${JSON.stringify(data)}`);
    } finally {
      await deleteTestUsers(client, [user.id]);
    }
  }
});

Deno.test('request_withdrawal：證件被退回但照片也沒齊 → 仍回 id_rejected', async () => {
  const client = adminClient();
  const user = await createWithdrawableUser(client, 5000);

  try {
    // 守衛順序:退回狀態(#5a)排在照片存在檢查(#5b)之前。理由是 rejected
    // 帶得出「為什麼」,而 missing_id_photos 只會叫人重傳——對一個已經被
    // admin 看過並退回的人,後者是誤導。
    await client.from('profiles').update({
      id_verification_status: 'rejected',
      id_reject_reason: '姓名與證件不符',
      id_card_back_path: null,
    }).eq('id', user.id);

    const { data } = await requestWithdrawal(client, user.id, 2000);
    assertEquals(data?.success, false, JSON.stringify(data));
    assertEquals(data?.error_code, 'id_rejected', JSON.stringify(data));
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

// ============================================================
// withdrawal_events（plan 階段 2.3 / 審查 P0-1、P1）
//
// 為什麼要事件表而不是在 withdrawals 上加欄位：主表的 note 是單一欄位，
// 舊版 admin_update_withdrawal_status 用 `note = coalesce(p_note, note)`
// 覆寫。新增「代為完成」轉換後，第二次填的理由會蓋掉第一次——金流稽核
// 不能丟歷史。
// ============================================================

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function makeAdmin(client: ReturnType<typeof adminClient>) {
  const admin = await createTestUser(client, { name: 'Ops Admin' });
  await client.from('profiles').update({ is_admin: true }).eq('id', admin.id);
  return admin;
}

function eventsOf(client: ReturnType<typeof adminClient>, withdrawalId: string) {
  return client.from('withdrawal_events')
    .select('*')
    .eq('withdrawal_id', withdrawalId)
    .order('created_at');
}

Deno.test('withdrawal_events：標記已匯款寫一筆事件，帶交易序號與匯款日期', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    const { data: marked } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
      p_bank_ref: 'TXN-20260802-001',
      p_transferred_on: '2026-08-02',
    });
    assertEquals(marked?.success, true, JSON.stringify(marked));

    const { data: evts } = await eventsOf(client, req!.withdrawal_id);
    assertEquals(evts!.length, 1);
    assertEquals(evts![0].from_status, 'pending');
    assertEquals(evts![0].to_status, 'awaiting_collection');
    assertEquals(evts![0].admin_id, admin.id);
    // 交易序號是唯一能跟銀行對帳的錨點——爭議時「某 admin 點過按鈕」不夠。
    assertEquals(evts![0].bank_ref, 'TXN-20260802-001');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('withdrawal_events：退件與代為完成缺理由 → note_required', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);

    // 退件缺理由
    const { data: rej } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'rejected',
      p_note: '   ',
    });
    assertEquals(rej?.error_code, 'note_required', JSON.stringify(rej));

    // 代為完成缺理由（先推到 awaiting_collection）
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
    });
    const { data: done } = await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'completed',
      p_note: null,
    });
    assertEquals(done?.error_code, 'note_required', JSON.stringify(done));
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('withdrawal_events：兩次轉換各留一筆理由，歷史不被覆寫', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: '第一次：已於網銀轉出',
    });
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'completed',
      p_note: '第二次：逾期未確認，管理員代為結案',
    });

    const { data: evts } = await eventsOf(client, req!.withdrawal_id);
    assertEquals(evts!.length, 2);
    // 這正是 v1 方案的缺陷：單一 note 欄位會讓第二次蓋掉第一次。
    assertEquals(evts![0].note, '第一次：已於網銀轉出');
    assertEquals(evts![1].note, '第二次：逾期未確認，管理員代為結案');

    // 主表的 note 欄位停止寫入（保留但 vestigial）
    const { data: w } = await client.from('withdrawals')
      .select('note, status').eq('id', req!.withdrawal_id).single();
    assertEquals(w!.note, null, 'withdrawals.note 不應再被狀態機寫入');
    assertEquals(w!.status, 'completed');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('withdrawal_events：同狀態重入冪等，不重複寫事件', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    for (let i = 0; i < 2; i++) {
      await client.rpc('admin_update_withdrawal_status', {
        p_admin_id: admin.id,
        p_withdrawal_id: req!.withdrawal_id,
        p_status: 'awaiting_collection',
        p_note: null,
      });
    }
    const { data: evts } = await eventsOf(client, req!.withdrawal_id);
    assertEquals(evts!.length, 1, '重入不該多寫一筆事件');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('withdrawal_events：會員自己查收也寫事件，admin_id 為 null', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
    });
    await client.rpc('confirm_withdrawal_collection', {
      p_user_id: user.id,
      p_withdrawal_id: req!.withdrawal_id,
    });

    const { data: evts } = await eventsOf(client, req!.withdrawal_id);
    assertEquals(evts!.length, 2);
    // admin_id 為 null 就是「會員自己按的」——不必另開欄位表達同一件事。
    assertEquals(evts![1].admin_id, null);
    assertEquals(evts![1].to_status, 'completed');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

// 直接問 Postgres 而非以 authenticated 打 PostgREST——理由見
// name-write-paths.test.ts 檔頭：後者的 403 可能來自不相干的權限，
// 即使 REVOKE 沒生效也照樣「被拒」，斷言會失去辨別力。
Deno.test('GRANT：authenticated 與 anon 都不得讀寫 withdrawal_events', async () => {
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql`
      select
        relrowsecurity as rls_enabled,
        has_table_privilege('authenticated', 'public.withdrawal_events', 'SELECT') as auth_select,
        has_table_privilege('authenticated', 'public.withdrawal_events', 'INSERT') as auth_insert,
        has_table_privilege('anon', 'public.withdrawal_events', 'SELECT')          as anon_select
      from pg_class
      where oid = 'public.withdrawal_events'::regclass
    `;
    // 本 repo 每張新表零例外都要 enable RLS + revoke（20260717000001：
    // 不做 blanket grant，預設權限不可依賴）。這張表存 admin_id / bank_ref /
    // note，漏了就是全站提領稽核紀錄外洩。
    assertEquals(row.rls_enabled, true, 'withdrawal_events 應啟用 RLS');
    assertEquals(row.auth_select, false);
    assertEquals(row.auth_insert, false);
    assertEquals(row.anon_select, false);
  } finally {
    await sql.end();
  }
});

// ============================================================
// 批次標記已匯款（plan 階段 2.4 / 驗收情境 W2、審查兩條 P1）
//
// admin 的實際工作型態是「網銀做一批轉帳，回來標記一批」。CSV 匯出的存在
// 本身就證明批次是真的——匯得出去、標不回來，工作流是斷的。
//
// 兩個 P1 都釘在這裡：
//   * 逐筆各自的 bank_ref（單一共用參數達不到 W2「可逐筆填或留空」）
//   * 部分失敗不整批回滾——Postgres 函數預設單一交易，不做 savepoint 隔離
//     的話這個承諾在硬錯誤下是假的
// ============================================================

function batchMarkPaid(
  client: ReturnType<typeof adminClient>,
  adminId: string,
  items: { id: string; bank_ref?: string }[],
  transferredOn = '2026-08-02',
) {
  return client.rpc('admin_batch_mark_paid', {
    p_admin_id: adminId,
    p_items: items,
    p_transferred_on: transferredOn,
    p_note: null,
  });
}

/** 建 n 位各有一筆 pending 提領的使用者。 */
async function pendingWithdrawals(client: ReturnType<typeof adminClient>, n: number) {
  const made: { userId: string; withdrawalId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const u = await createWithdrawableUser(client, 5000);
    const { data } = await requestWithdrawal(client, u.id, 1000);
    made.push({ userId: u.id, withdrawalId: data!.withdrawal_id });
  }
  return made;
}

Deno.test('admin_batch_mark_paid：逐筆各自的交易序號分別落地', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const made = await pendingWithdrawals(client, 2);

  try {
    const { data } = await batchMarkPaid(client, admin.id, [
      { id: made[0].withdrawalId, bank_ref: 'TXN-A' },
      // 第二筆刻意留空：有些網銀批次轉帳不逐筆給號（開放問題 #4 的裁決是選填）
      { id: made[1].withdrawalId },
    ]);
    assertEquals(data?.succeeded?.length, 2, JSON.stringify(data));

    const { data: e0 } = await eventsOf(client, made[0].withdrawalId);
    const { data: e1 } = await eventsOf(client, made[1].withdrawalId);
    assertEquals(e0![0].bank_ref, 'TXN-A');
    assertEquals(e1![0].bank_ref, null);
    // 匯款日期是整批共用的
    assertEquals(e0![0].transferred_on, '2026-08-02');
    assertEquals(e1![0].transferred_on, '2026-08-02');
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(admin.id));
  }
});

Deno.test('admin_batch_mark_paid：狀態不合法的那筆進 failed，其餘照常成功', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const made = await pendingWithdrawals(client, 2);

  try {
    // 先把第二筆退件，讓它在批次裡變成非法轉換（rejected → awaiting_collection
    // 不在轉換表裡）。**不能用 awaiting_collection 當前置狀態**——那會走同狀態
    // 的冪等成功路徑，測不到分流。
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: made[1].withdrawalId,
      p_status: 'rejected',
      p_note: '測試用退件',
    });

    const { data } = await batchMarkPaid(client, admin.id, [
      { id: made[0].withdrawalId },
      { id: made[1].withdrawalId },
    ]);
    assertEquals(data?.succeeded?.length, 1, JSON.stringify(data));
    assertEquals(data?.failed?.length, 1, JSON.stringify(data));
    assertEquals(data.failed[0].id, made[1].withdrawalId);

    // 成功那筆真的落地了——這是「部分失敗不整批回滾」的實質意義
    const { data: w0 } = await client.from('withdrawals')
      .select('status').eq('id', made[0].withdrawalId).single();
    assertEquals(w0!.status, 'awaiting_collection');
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(admin.id));
  }
});

Deno.test('admin_batch_mark_paid：硬錯誤不讓已成功的那幾筆跟著回滾', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const made = await pendingWithdrawals(client, 1);

  try {
    // 壞掉的 uuid 會在 cast 時擲例外（invalid_input_syntax）——這是**硬錯誤**，
    // 不是轉換表擋下的軟錯誤。沒有 savepoint 隔離的話它會讓整個函數的交易
    // rollback，連前一筆已成功的一起消失。
    const { data } = await batchMarkPaid(client, admin.id, [
      { id: made[0].withdrawalId },
      { id: 'not-a-uuid' },
    ]);

    assertEquals(data?.succeeded?.length, 1, JSON.stringify(data));
    assertEquals(data?.failed?.length, 1, JSON.stringify(data));

    const { data: w0 } = await client.from('withdrawals')
      .select('status').eq('id', made[0].withdrawalId).single();
    assertEquals(w0!.status, 'awaiting_collection', '硬錯誤不該回滾已成功的那筆');
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(admin.id));
  }
});

Deno.test('admin_batch_mark_paid：非管理員呼叫 → forbidden', async () => {
  const client = adminClient();
  const notAdmin = await createTestUser(client, { name: 'Not Ops' });
  const made = await pendingWithdrawals(client, 1);

  try {
    const { data } = await batchMarkPaid(client, notAdmin.id, [{ id: made[0].withdrawalId }]);
    assertEquals(data?.success, false, JSON.stringify(data));
    assertEquals(data?.error_code, 'forbidden', JSON.stringify(data));
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(notAdmin.id));
  }
});

Deno.test('GRANT：authenticated 不得 EXECUTE admin_batch_mark_paid', async () => {
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql`
      select has_function_privilege(
        'authenticated',
        to_regprocedure('public.admin_batch_mark_paid(uuid,jsonb,date,text)'),
        'EXECUTE'
      ) as auth_exec
    `;
    // null = 函數不存在。紅燈期會是 null，實作後必須是 false。
    assertEquals(row.auth_exec, false, '批次函數不得對 authenticated 開放');
  } finally {
    await sql.end();
  }
});

// ============================================================
// 提領列表：分頁／彙總／篩選／事件歷史（plan 階段 2.5）
//
// 「不得靜默截斷」是 §7.3 已裁決過的原則：只回前 N 筆而不揭露總數，會讓
// 使用者以為「找不到」等於「不存在」。這裡的代價更高——admin 少看到幾筆
// 就是少匯幾筆錢。
// ============================================================

async function adminGet(client: ReturnType<typeof adminClient>, adminEmail: string, path: string) {
  const token = await getUserAccessToken(client, adminEmail);
  const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}

Deno.test('GET /admin/withdrawals：stats 給出待匯款總額與各狀態筆數', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const made = await pendingWithdrawals(client, 2);

  try {
    // 一筆推成已匯款，另一筆維持 pending
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: made[0].withdrawalId,
      p_status: 'awaiting_collection',
      p_note: null,
    });

    const { status, body } = await adminGet(client, admin.email, '/api/admin/withdrawals');
    assertEquals(status, 200);
    // 待匯款總額是 admin 開網銀前要對的數字，少算一筆就少匯一筆
    assertEquals(typeof body.data.stats.pendingAmount, 'number');
    assertEquals(body.data.stats.byStatus.pending >= 1, true, JSON.stringify(body.data.stats));
    assertEquals(body.data.stats.byStatus.awaiting_collection >= 1, true);
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(admin.id));
  }
});

Deno.test('GET /admin/withdrawals：每筆帶轉換歷史，note 讀自事件表最新一筆', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const made = await pendingWithdrawals(client, 1);

  try {
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: made[0].withdrawalId,
      p_status: 'awaiting_collection',
      p_note: '第一次：已於網銀轉出',
    });
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: made[0].withdrawalId,
      p_status: 'completed',
      p_note: '第二次：逾期未確認，代為結案',
    });

    const { body } = await adminGet(client, admin.email, '/api/admin/withdrawals');
    const row = body.data.withdrawals.find((w: { id: string }) => w.id === made[0].withdrawalId);
    assertEquals(row.events.length, 2, JSON.stringify(row.events));
    // 主表的 note 已 vestigial（20260802000004），讀它只會拿到 null
    assertEquals(row.note, '第二次：逾期未確認，代為結案');
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(admin.id));
  }
});

Deno.test('GET /admin/withdrawals：search 比對會員姓名', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const made = await pendingWithdrawals(client, 1);

  try {
    await client.from('profiles').update({ name: '搜尋目標甲' }).eq('id', made[0].userId);

    const hit = await adminGet(client, admin.email, '/api/admin/withdrawals?search=搜尋目標甲');
    assertEquals(hit.body.data.withdrawals.length, 1, JSON.stringify(hit.body.data));

    const miss = await adminGet(client, admin.email, '/api/admin/withdrawals?search=不存在的人');
    assertEquals(miss.body.data.withdrawals.length, 0);
    // total 要反映篩選後的命中數，不是全表筆數——否則「已顯示 X / Y」會說謊
    assertEquals(miss.body.data.total, 0);
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(admin.id));
  }
});

Deno.test('GET /admin/withdrawals：from 與 to 依申請日篩選', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const made = await pendingWithdrawals(client, 1);

  try {
    await client.from('withdrawals')
      .update({ requested_at: '2026-01-15T00:00:00Z' })
      .eq('id', made[0].withdrawalId);

    const inRange = await adminGet(
      client,
      admin.email,
      '/api/admin/withdrawals?from=2026-01-01&to=2026-01-31',
    );
    assertEquals(
      inRange.body.data.withdrawals.some((w: { id: string }) => w.id === made[0].withdrawalId),
      true,
    );

    const outOfRange = await adminGet(
      client,
      admin.email,
      '/api/admin/withdrawals?from=2026-02-01&to=2026-02-28',
    );
    assertEquals(
      outOfRange.body.data.withdrawals.some((w: { id: string }) => w.id === made[0].withdrawalId),
      false,
    );
  } finally {
    await deleteTestUsers(client, made.map((m) => m.userId).concat(admin.id));
  }
});

Deno.test('GRANT：authenticated 不得 EXECUTE admin_withdrawal_stats', async () => {
  const sql = postgres(DB_URL);
  try {
    const [row] = await sql`
      select has_function_privilege(
        'authenticated',
        to_regprocedure('public.admin_withdrawal_stats(text,date,date,text)'),
        'EXECUTE'
      ) as auth_exec
    `;
    assertEquals(row.auth_exec, false, '彙總函數不得對 authenticated 開放');
  } finally {
    await sql.end();
  }
});

// ============================================================
// 退件理由端到端（plan 階段 2.6）
//
// 整條證件與提領審核的價值都卡在這一句話上：**理由要到得了會員面前**。
// 看不到理由的會員只會重送一模一樣的東西，然後再被退一次——admin 多做一次
// 工、會員多等一輪，兩邊都沒有得到任何資訊。
// ============================================================

async function memberGet(client: ReturnType<typeof adminClient>, email: string, path: string) {
  const token = await getUserAccessToken(client, email);
  const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}

Deno.test('GET /rewards/withdrawals：退件後會員讀得到 admin 填的理由', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'rejected',
      p_note: '收款帳號與身分證姓名不符',
    });

    const { body } = await memberGet(client, user.email, '/api/rewards/withdrawals');
    const row = body.data.withdrawals.find((w: { id: string }) => w.id === req!.withdrawal_id);
    assertEquals(row.status, 'rejected');
    assertEquals(row.note, '收款帳號與身分證姓名不符');
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('GET /rewards/withdrawals：管理員代為結案時標示 completedByAdmin', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
    });
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'completed',
      p_note: '逾期未確認，管理員代為結案',
    });

    const { body } = await memberGet(client, user.email, '/api/rewards/withdrawals');
    const row = body.data.withdrawals.find((w: { id: string }) => w.id === req!.withdrawal_id);
    // 誠實揭露：讓會員以為自己按過查收，是規劃 §6 開放問題 #2 明確否決的做法
    assertEquals(row.completedByAdmin, true, JSON.stringify(row));
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});

Deno.test('GET /rewards/withdrawals：會員自己查收時 completedByAdmin 為 false', async () => {
  const client = adminClient();
  const admin = await makeAdmin(client);
  const user = await createWithdrawableUser(client, 5000);

  try {
    const { data: req } = await requestWithdrawal(client, user.id, 1000);
    await client.rpc('admin_update_withdrawal_status', {
      p_admin_id: admin.id,
      p_withdrawal_id: req!.withdrawal_id,
      p_status: 'awaiting_collection',
      p_note: null,
    });
    await client.rpc('confirm_withdrawal_collection', {
      p_user_id: user.id,
      p_withdrawal_id: req!.withdrawal_id,
    });

    const { body } = await memberGet(client, user.email, '/api/rewards/withdrawals');
    const row = body.data.withdrawals.find((w: { id: string }) => w.id === req!.withdrawal_id);
    assertEquals(row.status, 'completed');
    assertEquals(row.completedByAdmin, false, JSON.stringify(row));
  } finally {
    await deleteTestUsers(client, [admin.id, user.id]);
  }
});
