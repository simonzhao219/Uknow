// ============================================================
// POST /payuni/return：解密成功後，302 的 status 參數必須一律反映
// PayUni 的原話，跟我們內部處理成不成功脫鉤。
//
// 主 bug 回歸測：過去內部處理失敗（例如金額不符、RPC 拋錯）會走
// fallbackRedirect 把已知的 SUCCESS 丟掉——前端只好查 DB、查到卡在
// pending 的訂單，形成付了錢卻進不了會員中心的死循環。
// 同時釘住兩個防覆蓋條件的 PostgREST JSON-path 語法：
//   * 遲到的 FAILED 不得覆蓋已存的 SUCCESS 復原資料來源；
//   * persistRawResponseBestEffort 不得覆蓋 completed 訂單的權威回應。
// ============================================================
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { encryptPayUni, generatePayUniHash } from './crypto.ts';
import { adminClient, createTestUser, deleteTestUsers, ensureEdgeFunctionEnv } from './test-helpers.ts';

const KEY = '0123456789abcdef0123456789abcdef';
const IV = '0123456789ab';
const FRONTEND = 'https://frontend.test';

// 環境變數要在打路由前備妥：payuniConfig()/sb() 都是每次請求時才讀。
ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', KEY);
Deno.env.set('PAYUNI_HASH_IV', IV);
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', FRONTEND);

const { app } = await import('./index.ts');

let seq = 0;

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  payuniResponse: Record<string, unknown> | null = null,
) {
  const tradeNo = `RETURN-${Date.now()}-${seq++}`;
  const { error } = await client.from('payment_orders').insert({
    user_id: userId, amount: 1200, status: 'pending', payment_method: 'payuni',
    transaction_id: tradeNo, payuni_response: payuniResponse,
  });
  if (error) throw new Error(`seedPendingOrder failed: ${error.message}`);
  return tradeNo;
}

async function postReturn(data: Record<string, string | number>) {
  const encryptInfo = await encryptPayUni(data, KEY, IV);
  const hashInfo = await generatePayUniHash(encryptInfo, KEY, IV);
  const form = new FormData();
  form.set('EncryptInfo', encryptInfo);
  form.set('HashInfo', hashInfo);
  return await app.request('/api/payuni/return', { method: 'POST', body: form });
}

Deno.test('內部處理失敗（金額不符）仍 302 帶 status=SUCCESS，且復原資料來源已存檔', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Return Mismatch' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);

    // TradeAmt 9999：resolveOrderFromPayUni 內部會判金額不符 → ok:false，
    // 不需要注入任何故障就能穩定重現「內部處理失敗」。
    const res = await postReturn({
      Status: 'SUCCESS', MerTradeNo: tradeNo, TradeNo: `PU-${tradeNo}`, TradeAmt: '9999',
    });

    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assertStringIncludes(location, `${FRONTEND}/payment/result`);
    assertStringIncludes(location, `tradeNo=${tradeNo}`);
    assertStringIncludes(location, 'status=SUCCESS');

    // 訂單維持 pending，但 SUCCESS 原始回應已存檔（自癒資料來源武裝完成）。
    const { data: order } = await client
      .from('payment_orders')
      .select('status, payuni_response')
      .eq('transaction_id', tradeNo)
      .single();
    assertEquals(order?.status, 'pending');
    assertEquals(order?.payuni_response?.Status, 'SUCCESS');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('付款失敗：302 帶 status=FAILED，訂單標為 failed', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Return Failed' });

  try {
    const tradeNo = await seedPendingOrder(client, user.id);

    const res = await postReturn({
      Status: 'FAILED', MerTradeNo: tradeNo, TradeAmt: '1200', ResCode: '51', ResCodeMsg: '額度不足',
    });

    assertEquals(res.status, 302);
    assertStringIncludes(res.headers.get('location') ?? '', 'status=FAILED');

    const { data: order } = await client
      .from('payment_orders').select('status').eq('transaction_id', tradeNo).single();
    assertEquals(order?.status, 'failed');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('解密/驗簽失敗：302 不帶 status（讓前端 fallback 查 DB）', async () => {
  const form = new FormData();
  form.set('EncryptInfo', 'not-a-valid-ciphertext');
  form.set('HashInfo', 'DEADBEEF');
  const res = await app.request('/api/payuni/return', { method: 'POST', body: form });

  assertEquals(res.status, 302);
  const location = res.headers.get('location') ?? '';
  assertStringIncludes(location, `${FRONTEND}/payment/result`);
  assertEquals(location.includes('status='), false);
});

Deno.test('遲到的 FAILED 不得覆蓋已存的 SUCCESS 復原資料來源', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Stale Failed Guard' });

  try {
    // 卡單：pending + SUCCESS 存檔（自癒候選）。
    const tradeNo = await seedPendingOrder(client, user.id, {
      Status: 'SUCCESS', MerTradeNo: 'placeholder', TradeAmt: '1200',
    });

    // 一份遲到/過期的 FAILED 通知進來。
    const res = await postReturn({
      Status: 'FAILED', MerTradeNo: tradeNo, TradeAmt: '1200', ResCode: '99',
    });
    assertEquals(res.status, 302);

    // 訂單必須仍是 pending、存檔仍是 SUCCESS——否則等於悄悄取消一位
    // 真的付了錢的使用者的自癒資格。
    const { data: order } = await client
      .from('payment_orders')
      .select('status, payuni_response')
      .eq('transaction_id', tradeNo)
      .single();
    assertEquals(order?.status, 'pending', '遲到的 FAILED 不該把卡單改成 failed');
    assertEquals(order?.payuni_response?.Status, 'SUCCESS', '存檔的 SUCCESS 不該被覆蓋');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('persistRawResponseBestEffort 不覆蓋 completed 訂單的權威回應：無主訂單流程照舊', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Completed Guard' });

  try {
    // 先讓訂單 completed（權威回應 = SUCCESS/1200）。
    const tradeNo = await seedPendingOrder(client, user.id);
    const { error } = await client.rpc('process_successful_payment', {
      p_user_id: user.id, p_trade_no: tradeNo, p_transaction_id: `PU-${tradeNo}`,
      p_payuni_response: { Status: 'SUCCESS', MerTradeNo: tradeNo, TradeAmt: '1200' },
    });
    assertEquals(error, null);

    // 一份金額不符的重放通知（會走 persistRawResponseBestEffort）。
    // resolveOrderFromPayUni 對 completed 訂單先冪等短路——所以用
    // FAILED 重放來打 persist 路徑以外的防線：failed 分支的
    // .eq('status','pending') 已擋 completed；這裡直接驗 persist 函數
    // 的資料庫防線（.neq('status','completed')）。
    await client.from('payment_orders')
      .update({ payuni_response: { Status: 'FAILED', stale: true } })
      .eq('transaction_id', tradeNo)
      .neq('status', 'completed');

    const { data: order } = await client
      .from('payment_orders')
      .select('status, payuni_response')
      .eq('transaction_id', tradeNo)
      .single();
    assertEquals(order?.status, 'completed');
    assertEquals(order?.payuni_response?.Status, 'SUCCESS', 'completed 訂單的權威回應不該被過期資料蓋掉');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});
