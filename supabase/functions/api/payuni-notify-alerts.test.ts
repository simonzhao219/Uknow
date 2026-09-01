// ============================================================
// notify 的失敗出口必須留下 system_alerts —— 觀測性契約。
//
// 由 friction-log 2026-08-17「沒有人反映問題不構成證據」的同類掃描產出。
// `payuni-notify.test.ts` 已經釘住「這些失敗一律不得開通」；本檔釘住的是
// 另一半:**拒絕之後有沒有人會知道**。
//
// 為什麼這四個出口值得告警(判準見 index.ts 的 logSystemAlert 定義處):
// 都是 server-to-server、沒有使用者在看、涉及金錢,而 console.error 只進
// Edge Function log,沒有人主動讀 = 等於靜默。
//
// 為什麼四個出口全部要去重:同一起事故會被重複觸發的機制有兩種——公開端點
// (未過簽章、任何人可打)與**合法寄件者的重送**(PayUni 對非 SUCCESS 回應
// 會無限重送)。無條件寫入會讓真實告警被同一件事洗掉,那正是本次要防的
// 失效模式。範式取自 complete_paid_pending_orders(migration 20260716000007)
// 的「同**訂單**已有未解決告警就不重寫」——重點是**實體鍵**,只用 reason
// 去重會把兩位使用者各自的事故壓成一筆,等於讓其中一個人的錢無聲消失。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { encryptPayUni, generatePayUniHash } from './crypto.ts';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
} from './test-helpers.ts';

// 與 payuni-notify.test.ts / payuni-return-status.test.ts 同一組值:三支都在
// 模組載入時寫環境變數,值一致才不會因為載入順序不同而互相踩到。
const KEY = '0123456789abcdef0123456789abcdef';
const IV = '0123456789ab';
const FRONTEND = 'https://frontend.test';
const PRICE = 1200;

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', KEY);
Deno.env.set('PAYUNI_HASH_IV', IV);
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', FRONTEND);

const { app } = await import('./index.ts');

let seq = 0;

function uniqueTradeNo(tag: string): string {
  return `ALERT-${tag}-${Date.now()}-${seq++}`;
}

async function seedPendingOrder(
  client: ReturnType<typeof adminClient>,
  userId: string,
  tradeNo: string,
): Promise<void> {
  const { error } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: PRICE,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
  });
  if (error) throw new Error(`seedPendingOrder failed: ${error.message}`);
}

async function postRaw(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return await app.request('/api/webhooks/payuni/notify', { method: 'POST', body: form });
}

/** 用正確的 HashKey/IV 簽一份合法 notify(內容可以是壞的)。 */
async function postNotify(data: Record<string, string | number>) {
  const encryptInfo = await encryptPayUni(data, KEY, IV);
  const hashInfo = await generatePayUniHash(encryptInfo, KEY, IV);
  return await postRaw({ EncryptInfo: encryptInfo, HashInfo: hashInfo });
}

/**
 * 取本次情境產生的告警。用 context 裡的識別欄位過濾而不是數總量——
 * 同一個測試資料庫裡別的測試也在寫 system_alerts,數總量會互相干擾。
 */
async function alertsByContext(
  client: ReturnType<typeof adminClient>,
  key: string,
  value: string,
) {
  const { data, error } = await client
    .from('system_alerts')
    .select('source, severity, message, context')
    .eq(`context->>${key}`, value)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`alertsByContext failed: ${error.message}`);
  return data ?? [];
}

// ── 已過簽章驗證的三個出口:只有 PayUni(或持有金鑰者)觸發得到 ──────

Deno.test('notify 找不到訂單：拒絕之外要留一筆 error 級告警(錢已收、會籍沒開)', async () => {
  const client = adminClient();
  const tradeNo = uniqueTradeNo('GHOST');

  const res = await postNotify({
    Status: 'SUCCESS',
    MerTradeNo: tradeNo,
    TradeNo: `PU-${tradeNo}`,
    TradeAmt: String(PRICE),
  });
  assertEquals((await res.json()).Status, 'FAILED');

  const alerts = await alertsByContext(client, 'merTradeNo', tradeNo);
  assertEquals(alerts.length, 1, 'order not found 應留下恰好一筆告警');
  assertEquals(alerts[0].source, 'resolveOrderFromPayUni');
  assertEquals(alerts[0].severity, 'error');
  assertEquals((alerts[0].context as Record<string, unknown>).reason, 'order_not_found');
});

Deno.test('notify 金額不符：拒絕之外要留一筆 error 級告警(靜默拒絕真實付款)', async () => {
  const client = adminClient();
  const user = await createTestUser(client, { name: 'Alert Underpaid' });
  const tradeNo = uniqueTradeNo('AMT');

  try {
    await seedPendingOrder(client, user.id, tradeNo);

    const res = await postNotify({
      Status: 'SUCCESS',
      MerTradeNo: tradeNo,
      TradeNo: `PU-${tradeNo}`,
      TradeAmt: '1',
    });
    assertEquals((await res.json()).Status, 'FAILED');

    const alerts = await alertsByContext(client, 'merTradeNo', tradeNo);
    assertEquals(alerts.length, 1, 'amount mismatch 應留下恰好一筆告警');
    assertEquals(alerts[0].source, 'resolveOrderFromPayUni');
    assertEquals(alerts[0].severity, 'error');
    const ctx = alerts[0].context as Record<string, unknown>;
    assertEquals(ctx.reason, 'amount_mismatch');
    assertEquals(String(ctx.tradeAmt), '1');
  } finally {
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('notify 缺 MerTradeNo 但 Status 為 SUCCESS：錢已收卻無法歸戶,標 error', async () => {
  const client = adminClient();
  // 沒有 MerTradeNo 可當識別鍵,改用 TradeNo——告警的 context 必須帶上它,
  // 否則這種畸形回調除了「有一筆壞掉」之外什麼線索都留不下。
  const tradeNo = uniqueTradeNo('NOMER');

  const res = await postNotify({ Status: 'SUCCESS', TradeNo: tradeNo, TradeAmt: String(PRICE) });
  assertEquals((await res.json()).Status, 'FAILED');

  const alerts = await alertsByContext(client, 'tradeNo', tradeNo);
  assertEquals(alerts.length, 1, 'missing MerTradeNo 應留下恰好一筆告警');
  assertEquals(alerts[0].source, 'resolveOrderFromPayUni');
  const ctx = alerts[0].context as Record<string, unknown>;
  assertEquals(ctx.reason, 'missing_mer_trade_no');
  // Status=SUCCESS 代表 PayUni 說錢收了,但缺 MerTradeNo 就無法歸戶——
  // 財務後果與 order_not_found 同級,不能只標 warning。
  assertEquals(alerts[0].severity, 'error', 'Status=SUCCESS 時財務風險等同查無訂單');
  assertEquals(String(ctx.tradeAmt), String(PRICE), 'context 要帶金額,否則人工比對少一個關鍵欄位');
});

// ── 重送去重:PayUni 對非 SUCCESS 回應會無限重送 ──────────────────────
//
// 既有測試檔 payuni-notify.test.ts 自己寫了兩次:「回錯 PayUni 會無限重送」
// (第 13 行)、「PayUni 在沒收到 SUCCESS 回應時會重送」(第 281 行)。
// 上面那三個出口全部回 Status:'FAILED',所以每一次重送都會再走一次告警。
// 第一版只想到「攻擊者能不能灌爆」,漏了「PayUni 自己的重送也是同一個
// 放大機制」——同一起事故會在 system_alerts 疊出無數列,把其他更急的
// 告警擠出畫面。這正是 logSystemAlertOnce 要防的失效模式。

Deno.test('notify 同一筆查無訂單重送兩次：只留一筆,不因 PayUni 重送而洗版', async () => {
  const client = adminClient();
  const tradeNo = uniqueTradeNo('RETRY');
  const payload = {
    Status: 'SUCCESS',
    MerTradeNo: tradeNo,
    TradeNo: `PU-${tradeNo}`,
    TradeAmt: String(PRICE),
  };

  for (let i = 0; i < 2; i++) {
    const res = await postNotify(payload);
    assertEquals((await res.json()).Status, 'FAILED');
  }

  const alerts = await alertsByContext(client, 'merTradeNo', tradeNo);
  assertEquals(alerts.length, 1, '同一筆訂單重送兩次只該留一筆未解決告警');
});

Deno.test('notify 兩筆不同訂單金額不符：各留一筆,去重鍵必須含 merTradeNo', async () => {
  const client = adminClient();
  const userA = await createTestUser(client, { name: 'Alert DedupeA' });
  const userB = await createTestUser(client, { name: 'Alert DedupeB' });
  const tradeA = uniqueTradeNo('DEDUPA');
  const tradeB = uniqueTradeNo('DEDUPB');

  try {
    await seedPendingOrder(client, userA.id, tradeA);
    await seedPendingOrder(client, userB.id, tradeB);

    for (const t of [tradeA, tradeB]) {
      const res = await postNotify({
        Status: 'SUCCESS',
        MerTradeNo: t,
        TradeNo: `PU-${t}`,
        TradeAmt: '1',
      });
      assertEquals((await res.json()).Status, 'FAILED');
    }

    // 去重只該壓「同一筆訂單的重送」,不該把兩位使用者的獨立事故壓成一筆
    // ——那會讓其中一個人的錢無聲消失。
    assertEquals(
      (await alertsByContext(client, 'merTradeNo', tradeA)).length,
      1,
      'A 應有自己的告警',
    );
    assertEquals(
      (await alertsByContext(client, 'merTradeNo', tradeB)).length,
      1,
      'B 應有自己的告警',
    );
  } finally {
    await deleteTestUsers(client, [userA.id, userB.id]);
  }
});

// ── 簽章驗證之前的出口:公開可觸發,必須去重 ──────────────────────

Deno.test('notify 驗章失敗：留一筆告警,但重複的壞請求不得把告警表灌爆', async () => {
  const client = adminClient();

  // 乾淨起點:這個 source 的未解決告警在別的測試也可能留下(偽造簽章、
  // 竄改密文兩支),先清掉才問得出「兩次壞請求只留一筆」。
  await client.from('system_alerts').delete().eq('source', 'payuni-notify');

  const bogus = await encryptPayUni({ Status: 'SUCCESS', MerTradeNo: 'X' }, KEY, IV);
  for (let i = 0; i < 2; i++) {
    const res = await postRaw({ EncryptInfo: bogus, HashInfo: 'DEADBEEF'.repeat(8) });
    assertEquals((await res.json()).Status, 'FAILED');
  }

  const { data } = await client
    .from('system_alerts')
    .select('source, severity, context, resolved_at')
    .eq('source', 'payuni-notify')
    .is('resolved_at', null);

  assertEquals(
    data?.length,
    1,
    '兩次驗章失敗只該留一筆未解決告警——金鑰錯誤時每一筆回調都會死在這裡,' +
      '真正的訊號是「持續失敗」而不是「某一筆失敗」',
  );
  assertEquals(data?.[0].severity, 'error');
  assertEquals((data?.[0].context as Record<string, unknown>).reason, 'decrypt_failed');
  assert(
    typeof (data?.[0].context as Record<string, unknown>).detail === 'string',
    'context 要帶 detail,否則看得到「驗章失敗」卻查不出是哪一步失敗',
  );

  await client.from('system_alerts').delete().eq('source', 'payuni-notify');
});
