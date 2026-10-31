// ============================================================
// PayUni 商店／設定類拒絕與多使用者連續失敗必須進 system_alerts（error 級，
// 會被 reconcile-payments.yml 的 /internal/system-alerts/recent 推到 LINE）。
//
// 起因：10/28 正式站原商店「網路商店停用」，PayUni 在建單層回 `DEF01006
// 商店狀態不符合`，經 ReturnURL／NotifyURL 回來，resolveOrderFromPayUni 把訂單
// 標 failed 就結束——每個人都付不了，卻零告警。分類判準見
// payuni-rejection.unit.test.ts；本檔釘住 notify／return 兩個入口真的會寫告警。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { encryptPayUni, generatePayUniHash } from './crypto.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
} from './test-helpers.ts';

// 與 payuni-notify-alerts.test.ts 同一組值（模組載入時寫環境變數，值一致才不互踩）。
const KEY = '0123456789abcdef0123456789abcdef';
const IV = '0123456789ab';
const PRICE = 1200;

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', KEY);
Deno.env.set('PAYUNI_HASH_IV', IV);
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

let seq = 0;
const uniqueTradeNo = (tag: string) => `MERCH-${tag}-${Date.now()}-${seq++}`;

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  tradeNo: string,
) {
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: PRICE,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
  });
  if (error) throw new Error(`seedPendingOrder failed: ${error.message}`);
}

async function signedForm(data: Record<string, string>) {
  const encryptInfo = await encryptPayUni(data, KEY, IV);
  const form = new FormData();
  form.set('EncryptInfo', encryptInfo);
  form.set('HashInfo', await generatePayUniHash(encryptInfo, KEY, IV));
  return form;
}

const postNotify = async (data: Record<string, string>) =>
  await app.request('/api/webhooks/payuni/notify', {
    method: 'POST',
    body: await signedForm(data),
  });

const postReturn = async (data: Record<string, string>) =>
  await app.request('/api/payuni/return', { method: 'POST', body: await signedForm(data) });

/** 10/28 實證的 5 鍵短回應形狀（沒有 ResCode = 建單層拒絕）。 */
const shortRejection = (tradeNo: string, Status: string, Message: string) => ({
  MerID: 'TESTMER',
  MerTradeNo: tradeNo,
  Message,
  Status,
  TradeAmt: String(PRICE),
});

async function openAlerts(client: ReturnType<typeof adminClient>, source: string) {
  const { data, error } = await client
    .from('system_alerts')
    .select('severity, context')
    .eq('source', source)
    .is('resolved_at', null);
  if (error) throw new Error(`openAlerts failed: ${error.message}`);
  return (data ?? []) as { severity: string; context: Record<string, unknown> }[];
}

Deno.test('notify DEF01006 商店狀態不符合：一人遇到就留 error 告警，第二人不重複寫', async () => {
  const client = adminClient();
  await client.from('system_alerts').delete().eq('source', 'payuni-merchant');
  const userA = await createTestUser(client, { name: 'Merchant A' });
  const userB = await createTestUser(client, { name: 'Merchant B' });
  try {
    for (const user of [userA, userB]) {
      const tradeNo = uniqueTradeNo('DEF');
      await seedPendingOrder(client, user.id, tradeNo);
      const res = await postNotify(shortRejection(tradeNo, 'DEF01006', '商店狀態不符合'));
      assertEquals(
        (await res.json()).Status,
        'SUCCESS',
        '付款失敗仍是「處理完成」，不得要 PayUni 重送',
      );
    }

    const alerts = (await openAlerts(client, 'payuni-merchant'))
      .filter((a) => a.context.payuniStatus === 'DEF01006');
    assertEquals(alerts.length, 1, '同一組 Status＋Message 只留一筆未解決告警');
    assertEquals(alerts[0].severity, 'error', 'error 級才會被推到 LINE');
    assertEquals(alerts[0].context.payuniMessage, '商店狀態不符合');
  } finally {
    await client.from('system_alerts').delete().eq('source', 'payuni-merchant');
    await deleteTestUsers(client, [userA.id, userB.id]);
  }
});

Deno.test('return UPP02085 商店尚未啟用電子發票：ReturnURL 這一側也要告警，導回照舊', async () => {
  const client = adminClient();
  await client.from('system_alerts').delete().eq('source', 'payuni-merchant');
  const user = await createTestUser(client, { name: 'Merchant Return' });
  try {
    const tradeNo = uniqueTradeNo('UPP');
    await seedPendingOrder(client, user.id, tradeNo);
    const res = await postReturn(shortRejection(tradeNo, 'UPP02085', '商店尚未啟用電子發票'));
    assertEquals(res.status, 302);
    assertEquals(new URL(res.headers.get('location')!).searchParams.get('status'), 'FAILED');

    const alerts = (await openAlerts(client, 'payuni-merchant'))
      .filter((a) => a.context.payuniStatus === 'UPP02085');
    assertEquals(alerts.length, 1);
    assertEquals(alerts[0].severity, 'error');
  } finally {
    await client.from('system_alerts').delete().eq('source', 'payuni-merchant');
    await deleteTestUsers(client, [user.id]);
  }
});

const creditFailure = (tradeNo: string) => ({
  ...shortRejection(tradeNo, 'CREDIT05002', '授權失敗'),
  ResCode: '05',
  ResCodeMsg: '拒絕交易',
  AuthBank: '822',
});

Deno.test('notify 單筆 CREDIT05002 授權失敗：屬持卡人層，不寫商店級告警', async () => {
  const client = adminClient();
  await client.from('system_alerts').delete().eq('source', 'payuni-merchant');
  await client.from('system_alerts').delete().eq('source', 'payuni-failure-burst');
  const user = await createTestUser(client, { name: 'Credit Single' });
  try {
    const tradeNo = uniqueTradeNo('CREDIT');
    await seedPendingOrder(client, user.id, tradeNo);
    await postNotify(creditFailure(tradeNo));
    assertEquals((await openAlerts(client, 'payuni-merchant')).length, 0);
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('notify 三位不同使用者連續授權失敗：留一筆 error 級連續失敗告警', async () => {
  const client = adminClient();
  await client.from('system_alerts').delete().eq('source', 'payuni-failure-burst');
  const users = [];
  try {
    for (let i = 0; i < 3; i++) {
      const user = await createTestUser(client, { name: `Credit Burst ${i}` });
      users.push(user);
      const tradeNo = uniqueTradeNo('BURST');
      await seedPendingOrder(client, user.id, tradeNo);
      await postNotify(creditFailure(tradeNo));
    }

    const alerts = await openAlerts(client, 'payuni-failure-burst');
    assertEquals(alerts.length, 1, '第三位觸發一筆，之後同一小時內不再重寫');
    assertEquals(alerts[0].severity, 'error');
  } finally {
    await client.from('system_alerts').delete().eq('source', 'payuni-failure-burst');
    await deleteTestUsers(client, users.map((u) => u.id));
  }
});

Deno.test('return 驗章失敗：留一筆告警（金鑰設錯時 ReturnURL 也全死），重複不洗版', async () => {
  const client = adminClient();
  await client.from('system_alerts').delete().eq('source', 'payuni-return');
  try {
    const bogus = await encryptPayUni({ Status: 'SUCCESS', MerTradeNo: 'X' }, KEY, IV);
    for (let i = 0; i < 2; i++) {
      const form = new FormData();
      form.set('EncryptInfo', bogus);
      form.set('HashInfo', 'DEADBEEF'.repeat(8));
      const res = await app.request('/api/payuni/return', { method: 'POST', body: form });
      assertEquals(res.status, 302);
    }
    const alerts = await openAlerts(client, 'payuni-return');
    assertEquals(alerts.length, 1);
    assertEquals(alerts[0].severity, 'error');
    assertEquals(alerts[0].context.reason, 'decrypt_failed');
  } finally {
    await client.from('system_alerts').delete().eq('source', 'payuni-return');
  }
});
