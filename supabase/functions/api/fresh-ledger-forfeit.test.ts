// ============================================================
// A13 fresh 清空帳本（renewal-backfill 階段 2）：
//   * fresh 且非首購 → 付款成功當下插入負額沖銷列（type = ledger_reset）、
//     可提領餘額歸零、total_referrals 歸 0、當月任務桶刪除、歷史桶原樣保留
//   * 首購 fresh / extend 完全不觸發
//   * 冪等鍵 = 本次 subscription_id（webhook 重放不重複沖銷）
//   * 清空後歷史桶內的老下線再付款 → 上代照發 100P、任務不 +1（pair-history）
//   * 沖銷失敗走周邊隔離：付款不回滾，告警（source = fresh_ledger_forfeit）
//     的 context 含金額快照 forfeit_amount
//   * repair_orphaned_forfeitures(p_user_id)：補沖金額 = 快照值（不是補沖
//     當下餘額——失敗後新賺的點數必須保留）、冪等；快照遺失 → 沖 0 +
//     升級 error 告警（source = repair_orphaned_forfeitures）
//   * 呼叫點掛在 /auth/profile 的 repairOrphanedPaymentsBestEffort
// ============================================================
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import postgres from 'npm:postgres@3';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
// prepare 路由要加密表單資料（AC-13 那條會走 HTTP prepare）。
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

const DB_URL = Deno.env.get('SUPABASE_DB_URL') ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let seq = 0;

// 台灣時區（UTC+8）的當月 key——與 apply_referral_side_effects 的
// to_char(paid_at at time zone 'Asia/Taipei', 'YYYY-MM') 同一口徑。
function twCurrentMonthKey(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
}

async function expireSubscriptions(
  client: ReturnType<typeof adminClient>,
  userId: string,
  endDaysAgo: number,
) {
  const end = new Date(Date.now() - endDaysAgo * 86400_000).toISOString();
  const grace = new Date(Date.now() - Math.max(endDaysAgo - 60, 1) * 86400_000).toISOString();
  const { error } = await client
    .from('subscriptions')
    .update({ end_date: end, grace_period_end: grace })
    .eq('user_id', userId);
  if (error) throw new Error(`expireSubscriptions failed: ${error.message}`);
}

// 直接塞一筆帶 renewal_mode 的 pending 訂單並驅動付款完成（清空機制是
// SQL 層職責，跳過 HTTP/webhook 層）。回傳 RPC 結果（含 subscription_id）。
async function payWithMode(
  client: ReturnType<typeof adminClient>,
  userId: string,
  renewalMode: 'extend' | 'fresh' | null,
  tradeNo?: string,
) {
  const t = tradeNo ?? `FORFEIT-${Date.now()}-${seq++}`;
  const { error: insertErr } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: t,
    ...(renewalMode ? { renewal_mode: renewalMode } : {}),
  });
  if (insertErr) throw new Error(`payWithMode insert failed: ${insertErr.message}`);
  const { data, error } = await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: t,
    p_transaction_id: `PU-${t}`,
    p_payuni_response: { Status: 'SUCCESS' },
  });
  return { tradeNo: t, data, error };
}

async function forfeitRows(client: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await client
    .from('reward_transactions')
    .select('id, amount, subscription_id')
    .eq('user_id', userId)
    .eq('type', 'ledger_reset')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`forfeitRows failed: ${error.message}`);
  return data ?? [];
}

async function availableOf(client: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await client
    .from('reward_balances').select('available').eq('user_id', userId).single();
  return data?.available;
}

async function taskProgressOf(client: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await client
    .from('task_progress')
    .select('total_referrals, monthly_referrals')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

// 模擬「沖銷 insert 失敗」：只擋指定使用者的 ledger_reset 列，其他測試
// 檔完全不受影響；finally 一定要 remove。
async function installForfeitBlocker(sql: ReturnType<typeof postgres>, userId: string) {
  await sql.unsafe(`
    create or replace function public.test_block_ledger_reset() returns trigger
    language plpgsql as $f$
    begin
      if new.type = 'ledger_reset' and new.user_id = '${userId}'::uuid then
        raise exception 'test_block_ledger_reset：模擬沖銷失敗';
      end if;
      return new;
    end $f$;
    drop trigger if exists test_block_ledger_reset_trg on public.reward_transactions;
    create trigger test_block_ledger_reset_trg
      before insert on public.reward_transactions
      for each row execute function public.test_block_ledger_reset();
  `);
}

async function removeForfeitBlocker(sql: ReturnType<typeof postgres>) {
  await sql.unsafe(`
    drop trigger if exists test_block_ledger_reset_trg on public.reward_transactions;
    drop function if exists public.test_block_ledger_reset();
  `);
}

Deno.test('fresh 非首購：沖銷列入帳、餘額歸零、當月任務桶刪除、歷史桶保留', async () => {
  const client = adminClient();
  const payer = await createTestUser(client, { name: 'Forfeit Payer' });
  let downline: { id: string; email: string } | null = null;

  try {
    // payer 成為會員 → 下線 downline 用 payer 的碼註冊並付款：
    // payer 得 100P、total_referrals=1、當月桶 = [downline]。
    assertEquals((await payForUser(client, payer.id)).error, null);
    const code = await getActiveReferralCode(client, payer.id);
    downline = await createTestUser(client, { name: 'Forfeit Downline', referredByCode: code });
    assertEquals((await payForUser(client, downline.id)).error, null);
    assertEquals(await availableOf(client, payer.id), 100);

    // 手動補一個歷史月份桶（Q14a：歷史桶 = pair-history，清空必須保留）。
    const historyMember = crypto.randomUUID();
    const monthKey = twCurrentMonthKey();
    const tpBefore = await taskProgressOf(client, payer.id);
    assertEquals(tpBefore?.total_referrals, 1);
    const { error: tpErr } = await client
      .from('task_progress')
      .update({
        monthly_referrals: { ...tpBefore!.monthly_referrals, '2025-01': [historyMember] },
      })
      .eq('user_id', payer.id);
    assertEquals(tpErr, null);

    // 過期 → fresh 再付款（非首購）→ 清空發生在付款成功當下。
    await expireSubscriptions(client, payer.id, 90);
    const { tradeNo, data, error } = await payWithMode(client, payer.id, 'fresh');
    assertEquals(error, null);
    const subId = data?.subscription_id;
    assertNotEquals(subId, undefined);

    // 沖銷列：負額、綁本次 subscription_id、分類走專屬 ledger_reset。
    const rows = await forfeitRows(client, payer.id);
    assertEquals(rows.length, 1, `expected 1 ledger_reset row, got ${rows.length}`);
    assertEquals(rows[0].amount, -100);
    assertEquals(rows[0].subscription_id, subId);
    const { data: viewRow } = await client
      .from('reward_transactions_with_balance')
      .select('source_category')
      .eq('id', rows[0].id)
      .single();
    assertEquals(viewRow?.source_category, 'ledger_reset');

    // 餘額歸零；任務歸零；當月桶整個刪掉；歷史桶原樣。
    assertEquals(await availableOf(client, payer.id), 0);
    const tpAfter = await taskProgressOf(client, payer.id);
    assertEquals(tpAfter?.total_referrals, 0);
    assertEquals(tpAfter?.monthly_referrals[monthKey], undefined, '當月桶應被刪除');
    assertEquals(tpAfter?.monthly_referrals['2025-01'], [historyMember], '歷史桶應原樣保留');

    // AC-16：同一筆訂單重放（webhook 重送）→ 冪等短路，不重複沖銷。
    const { error: replayErr } = await client.rpc('process_successful_payment', {
      p_user_id: payer.id,
      p_trade_no: tradeNo,
      p_transaction_id: `PU-${tradeNo}`,
      p_payuni_response: { Status: 'SUCCESS' },
    });
    assertEquals(replayErr, null);
    assertEquals((await forfeitRows(client, payer.id)).length, 1);
  } finally {
    await deleteTestUsers(client, [payer.id, ...(downline ? [downline.id] : [])]);
  }
});

Deno.test('首購 fresh：無沖銷列（付款前不可能有任何入帳）', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'First Fresh' });

  try {
    const { error } = await payWithMode(client, user.id, 'fresh');
    assertEquals(error, null);
    const { data: subs } = await client
      .from('subscriptions').select('id').eq('user_id', user.id);
    assertEquals(subs?.length, 1);
    assertEquals((await forfeitRows(client, user.id)).length, 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('extend：不清空——點數與任務原樣保留、無沖銷列', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Extend Keeps Ledger' });

  try {
    assertEquals((await payForUser(client, user.id)).error, null);
    // 直接入帳 100P（extend 是否清空與點數來源無關）。
    const { error: adjErr } = await client.from('reward_transactions').insert({
      user_id: user.id,
      type: 'adjustment',
      amount: 100,
      description: '測試入帳',
    });
    assertEquals(adjErr, null);
    const { error: tpErr } = await client.from('task_progress').insert({
      user_id: user.id,
      total_referrals: 2,
      monthly_referrals: { '2025-03': [crypto.randomUUID(), crypto.randomUUID()] },
    });
    assertEquals(tpErr, null);

    await expireSubscriptions(client, user.id, 90);
    const { error } = await payWithMode(client, user.id, 'extend');
    assertEquals(error, null);

    assertEquals((await forfeitRows(client, user.id)).length, 0);
    assertEquals(await availableOf(client, user.id), 100);
    const tp = await taskProgressOf(client, user.id);
    assertEquals(tp?.total_referrals, 2);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('prepare：fresh 填現任上代的碼 → 樹不動、帳本照樣清空（S9）', async () => {
  const client = adminClient();
  const upline = await createTestUser(client, { name: 'S9 Upline' });
  let payer: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, upline.id)).error, null);
    const uplineCode = await getActiveReferralCode(client, upline.id);
    payer = await createTestUser(client, { name: 'S9 Payer', referredByCode: uplineCode });
    assertEquals((await payForUser(client, payer.id)).error, null);
    // upline 因 payer 首購得 100P；payer 自己另外入帳 100P 供清空斷言。
    const { error: adjErr } = await client.from('reward_transactions').insert({
      user_id: payer.id,
      type: 'adjustment',
      amount: 100,
      description: '測試入帳',
    });
    assertEquals(adjErr, null);

    await expireSubscriptions(client, payer.id, 90);
    const token = await getUserAccessToken(client, payer.email);
    const res = await app.request('/api/payuni/prepare', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ renewalMode: 'fresh', referredByCode: uplineCode }),
    });
    const body = await res.json();
    assertEquals(body.success, true, JSON.stringify(body));

    const { error: payErr } = await client.rpc('process_successful_payment', {
      p_user_id: payer.id,
      p_trade_no: body.data.tradeNo,
      p_transaction_id: `PU-${body.data.tradeNo}`,
      p_payuni_response: { Status: 'SUCCESS' },
    });
    assertEquals(payErr, null);

    // 樹不動：上代與推薦邊都還是原本的 upline。
    const { data: profile } = await client
      .from('profiles').select('referred_by_user_id').eq('id', payer.id).single();
    assertEquals(profile?.referred_by_user_id, upline.id);
    const { data: edge } = await client
      .from('referral_edges').select('referrer_user_id').eq('referee_user_id', payer.id).single();
    assertEquals(edge?.referrer_user_id, upline.id);

    // 帳本照樣清空（S9 與換線 fresh 同等對待）。
    assertEquals((await forfeitRows(client, payer.id)).length, 1);
    assertEquals(await availableOf(client, payer.id), 0);
  } finally {
    await deleteTestUsers(client, [upline.id, ...(payer ? [payer.id] : [])]);
  }
});

Deno.test('fresh 清空後：歷史桶內老下線再付款 → 上代 +100P、任務不 +1', async () => {
  const client = adminClient();
  const payer = await createTestUser(client, { name: 'Post Reset Upline' });
  let downline: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, payer.id)).error, null);
    const code = await getActiveReferralCode(client, payer.id);
    downline = await createTestUser(client, { name: 'Old Downline', referredByCode: code });
    assertEquals((await payForUser(client, downline.id)).error, null);

    // 把 downline 從當月桶搬進歷史桶（模擬「上個月招募的老下線」）。
    const { error: tpErr } = await client
      .from('task_progress')
      .update({ monthly_referrals: { '2025-01': [downline.id] } })
      .eq('user_id', payer.id);
    assertEquals(tpErr, null);

    // payer 過期 → fresh 清空（點數 100 → 0、total 1 → 0、歷史桶保留）。
    await expireSubscriptions(client, payer.id, 90);
    assertEquals((await payWithMode(client, payer.id, 'fresh')).error, null);
    assertEquals(await availableOf(client, payer.id), 0);

    // 老下線再付款：獎勵照發（每次付款事件都發）、任務不 +1（pair-history
    // 掃全部月份桶，downline 已在 2025-01 桶內）。
    const { error: repayErr } = await payForUser(client, downline.id);
    assertEquals(repayErr, null);
    assertEquals(await availableOf(client, payer.id), 100);
    const tp = await taskProgressOf(client, payer.id);
    assertEquals(tp?.total_referrals, 0);
    assertEquals(tp?.monthly_referrals, { '2025-01': [downline.id] });
  } finally {
    await deleteTestUsers(client, [payer.id, ...(downline ? [downline.id] : [])]);
  }
});

Deno.test('沖銷失敗：付款不回滾、告警含金額快照；repair 補沖=快照額且冪等', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const payer = await createTestUser(client, { name: 'Forfeit Fail Payer' });
  let downline: { id: string; email: string } | null = null;

  try {
    assertEquals((await payForUser(client, payer.id)).error, null);
    const code = await getActiveReferralCode(client, payer.id);
    downline = await createTestUser(client, { name: 'Fail Downline', referredByCode: code });
    assertEquals((await payForUser(client, downline.id)).error, null);
    assertEquals(await availableOf(client, payer.id), 100);

    // 讓 payer 的沖銷 insert 必定失敗 → 走周邊隔離。
    await installForfeitBlocker(sql, payer.id);

    await expireSubscriptions(client, payer.id, 90);
    const { tradeNo, data, error } = await payWithMode(client, payer.id, 'fresh');
    // 付款本身不回滾：RPC 成功、訂單 completed、訂閱建立。
    assertEquals(error, null);
    const subId = data?.subscription_id;
    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', tradeNo).single();
    assertEquals(order?.status, 'completed');
    assertEquals((await forfeitRows(client, payer.id)).length, 0);

    // 告警帶失敗當下的金額快照（repair 的唯一補沖依據）。
    const { data: alerts } = await client
      .from('system_alerts')
      .select('context')
      .eq('source', 'fresh_ledger_forfeit')
      .eq('context->>subscription_id', subId)
      .order('created_at', { ascending: false });
    assertEquals((alerts?.length ?? 0) >= 1, true, 'fresh_ledger_forfeit 告警應存在');
    assertEquals(Number(alerts![0].context.forfeit_amount), 100);

    // 失敗之後下線再入帳 100P——補沖必須用快照額 100，不能沒收這筆新點數。
    assertEquals((await payForUser(client, downline.id)).error, null);
    assertEquals(await availableOf(client, payer.id), 200);

    await removeForfeitBlocker(sql);
    const { error: repairErr } = await client.rpc('repair_orphaned_forfeitures', {
      p_user_id: payer.id,
    });
    assertEquals(repairErr, null);
    const rows = await forfeitRows(client, payer.id);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].amount, -100, '補沖金額必須等於快照值');
    assertEquals(rows[0].subscription_id, subId);
    assertEquals(await availableOf(client, payer.id), 100, '失敗後新賺的 100P 必須保留');

    // 冪等：再跑一次不重複沖銷。
    const { error: repair2Err } = await client.rpc('repair_orphaned_forfeitures', {
      p_user_id: payer.id,
    });
    assertEquals(repair2Err, null);
    assertEquals((await forfeitRows(client, payer.id)).length, 1);
  } finally {
    await removeForfeitBlocker(sql).catch(() => {});
    await sql.end();
    await deleteTestUsers(client, [payer.id, ...(downline ? [downline.id] : [])]);
  }
});

Deno.test('repair_orphaned_forfeitures：快照遺失 → 沖 0 並升級 error 告警', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const payer = await createTestUser(client, { name: 'Snapshot Lost Payer' });

  try {
    assertEquals((await payForUser(client, payer.id)).error, null);
    const { error: adjErr } = await client.from('reward_transactions').insert({
      user_id: payer.id,
      type: 'adjustment',
      amount: 100,
      description: '測試入帳',
    });
    assertEquals(adjErr, null);

    await installForfeitBlocker(sql, payer.id);
    await expireSubscriptions(client, payer.id, 90);
    const { data, error } = await payWithMode(client, payer.id, 'fresh');
    assertEquals(error, null);
    const subId = data?.subscription_id;

    // 快照遺失（告警列被清掉）。
    const { error: delErr } = await client
      .from('system_alerts')
      .delete()
      .eq('source', 'fresh_ledger_forfeit')
      .eq('context->>subscription_id', subId);
    assertEquals(delErr, null);

    await removeForfeitBlocker(sql);
    const { error: repairErr } = await client.rpc('repair_orphaned_forfeitures', {
      p_user_id: payer.id,
    });
    assertEquals(repairErr, null);

    // 寧可少沖交人工：沖 0（餘額原樣），但要有 error 級告警可追。
    const rows = await forfeitRows(client, payer.id);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].amount, 0);
    assertEquals(await availableOf(client, payer.id), 100);
    const { data: alerts } = await client
      .from('system_alerts')
      .select('severity')
      .eq('source', 'repair_orphaned_forfeitures')
      .eq('severity', 'error')
      .eq('context->>subscription_id', subId);
    assertEquals((alerts?.length ?? 0) >= 1, true, '快照遺失應升級為 error 告警');
  } finally {
    await removeForfeitBlocker(sql).catch(() => {});
    await sql.end();
    await deleteTestUsers(client, [payer.id]);
  }
});

Deno.test('/auth/profile：機會性觸發 repair_orphaned_forfeitures 補沖', async () => {
  const client = adminClient();
  const sql = postgres(DB_URL, { max: 1 });
  const payer = await createTestUser(client, { name: 'Profile Repair Payer' });

  try {
    assertEquals((await payForUser(client, payer.id)).error, null);
    const { error: adjErr } = await client.from('reward_transactions').insert({
      user_id: payer.id,
      type: 'adjustment',
      amount: 100,
      description: '測試入帳',
    });
    assertEquals(adjErr, null);

    await installForfeitBlocker(sql, payer.id);
    await expireSubscriptions(client, payer.id, 90);
    assertEquals((await payWithMode(client, payer.id, 'fresh')).error, null);
    assertEquals((await forfeitRows(client, payer.id)).length, 0);
    await removeForfeitBlocker(sql);

    // 使用者讀自己 profile → repairOrphanedPaymentsBestEffort 順帶補沖。
    const token = await getUserAccessToken(client, payer.email);
    const res = await app.request('/api/auth/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200);
    await res.body?.cancel();

    const rows = await forfeitRows(client, payer.id);
    assertEquals(rows.length, 1, '/auth/profile 應機會性補上沖銷列');
    assertEquals(rows[0].amount, -100);
    assertEquals(await availableOf(client, payer.id), 0);
  } finally {
    await removeForfeitBlocker(sql).catch(() => {});
    await sql.end();
    await deleteTestUsers(client, [payer.id]);
  }
});
