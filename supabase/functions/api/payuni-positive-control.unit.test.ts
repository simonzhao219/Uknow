// ============================================================
// W6-36／W7-2：PayUni 查詢正控本身（挑單、判讀、落檔、告警、36 小時窗）。
// 純單元：deps 全部注入，不碰資料庫與網路。
// 03001 改判在對帳迴圈怎麼用這個結果，見 payuni-query-not-found.unit.test.ts。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  CONTROL_ALERT_SOURCE,
  type ControlOutcome,
  type ControlRecord,
  evaluateControlResponse,
  isControlDue,
  isControlFresh,
  type PositiveControlDeps,
  runPositiveControl,
  SAMPLE_MIN_AGE_HOURS,
  SAMPLE_STALE_DAYS,
} from './payuni-positive-control.ts';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
/** 預設樣本：2 小時前付款完成（過了 1 小時下限、遠未滿 14 天）。 */
const SAMPLE_AT = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();

type Alert = { source: string; dedupe: Record<string, string>; message: string; severity: string };

function paidResponse(tradeNo: string) {
  return {
    raw: { Status: 'SUCCESS', EncryptInfo: 'x' },
    decrypted: { Result: JSON.stringify([{ MerTradeNo: tradeNo, TradeStatus: '1' }]) },
  };
}

function harness(over: Partial<PositiveControlDeps> = {}) {
  const records: ControlRecord[] = [];
  const alerts: Alert[] = [];
  const queried: string[] = [];
  const deps: PositiveControlDeps = {
    latest: () => Promise.resolve(null),
    pickSample: () => Promise.resolve({ tradeNo: 'SAMPLE1', completedAt: SAMPLE_AT }),
    query: (no) => {
      queried.push(no);
      return Promise.resolve(paidResponse(no));
    },
    record: (row) => {
      records.push(row);
      return Promise.resolve();
    },
    alertOnce: (source, dedupe, _ctx, message, severity) => {
      alerts.push({ source, dedupe, message, severity });
      return Promise.resolve();
    },
    now: () => NOW,
    ...over,
  };
  return { deps, records, alerts, queried };
}

const errorAlerts = (alerts: Alert[]) => alerts.filter((a) => a.severity === 'error');

// ------------------------------------------------------------
// 正控本身：成功／失敗／無樣本
// ------------------------------------------------------------

Deno.test('正控：查到同號 TradeStatus=1 → 落檔 success、本輪可改判、不告警', async () => {
  const h = harness();
  const s = await runPositiveControl(h.deps);
  assertEquals(s, {
    ran: true,
    outcome: 'success',
    fresh: true,
    error: false,
    sampleCompletedAt: SAMPLE_AT,
  });
  assertEquals(h.queried, ['SAMPLE1']);
  assertEquals(h.records, [
    {
      checkedAt: NOW.toISOString(),
      outcome: 'success',
      tradeNo: 'SAMPLE1',
      sampleCompletedAt: SAMPLE_AT,
      reason: null,
    },
  ]);
  assertEquals(h.alerts, []);
});

Deno.test('正控：已付款的單回 QUERY03001 → 落檔 failed、不可改判、error 告警且前 60 字是行動', async () => {
  const h = harness({
    query: () => Promise.resolve({ raw: { Status: 'QUERY03001', Message: '' }, decrypted: null }),
  });
  const s = await runPositiveControl(h.deps);
  assertEquals(s, {
    ran: true,
    outcome: 'failed',
    fresh: false,
    error: false,
    sampleCompletedAt: SAMPLE_AT,
  });
  assertEquals(h.records[0].outcome, 'failed');
  assertEquals(h.records[0].reason, 'query_status:QUERY03001');
  const errs = errorAlerts(h.alerts);
  assertEquals(errs.length, 1);
  assertEquals(errs[0].source, CONTROL_ALERT_SOURCE);
  assertEquals(errs[0].dedupe, { reason: 'control_failed' });
  const head = errs[0].message.slice(0, 60);
  assert(head.includes('正控失敗') && head.includes('請開Claude'), `前 60 字：${head}`);
});

Deno.test('正控：TradeStatus 不是 1、或只有一筆不帶單號 → failed（比對帳嚴格）', async () => {
  for (
    const [decrypted, reason] of [
      [{ Result: JSON.stringify([{ MerTradeNo: 'SAMPLE1', TradeStatus: '9' }]) }, 'trade_status:9'],
      [
        { Result: JSON.stringify([{ TradeStatus: '1' }]) },
        'no_matching_trade keys=Result Result=array(1):TradeStatus',
      ],
      [
        { Result: JSON.stringify([{ MerTradeNo: 'OTHER', TradeStatus: '1' }]) },
        'no_matching_trade keys=Result Result=array(1):MerTradeNo,TradeStatus',
      ],
      [{ MerTradeNo: 'SAMPLE1', TradeStatus: '1', DataSource: 'B' }, 'data_source_b'],
    ] as [Record<string, string>, string][]
  ) {
    const h = harness({
      query: () => Promise.resolve({ raw: { Status: 'SUCCESS', EncryptInfo: 'x' }, decrypted }),
    });
    const s = await runPositiveControl(h.deps);
    assertEquals(s.outcome, 'failed', JSON.stringify(decrypted));
    assertEquals(s.fresh, false);
    assertEquals(h.records[0].reason, reason);
    assertEquals(errorAlerts(h.alerts).length, 1);
  }
});

Deno.test('正控：平鋪欄位同號 TradeStatus=1 也算成功', () => {
  assertEquals(
    evaluateControlResponse('A1', { Status: 'SUCCESS' }, { MerTradeNo: ' A1 ', TradeStatus: '1' }),
    { ok: true },
  );
  assertEquals(
    evaluateControlResponse('A1', { Status: 'SUCCESS' }, null),
    { ok: false, reason: 'missing_encrypt_info' },
  );
});

Deno.test('正控：查詢擲錯（HTTP 403 等）→ failed、不可改判、error 告警', async () => {
  const h = harness({ query: () => Promise.reject(new Error('PayUni 查詢 HTTP 403')) });
  const s = await runPositiveControl(h.deps);
  assertEquals(s, {
    ran: true,
    outcome: 'failed',
    fresh: false,
    error: false,
    sampleCompletedAt: SAMPLE_AT,
  });
  assert(h.records[0].reason!.startsWith('query_threw'));
  assertEquals(errorAlerts(h.alerts).length, 1);
});

Deno.test('正控：沒有任何 completed 單可查 → 落檔 no_sample、不算成功、不查 PayUni、不推 error', async () => {
  const h = harness({ pickSample: () => Promise.resolve(null) });
  const s = await runPositiveControl(h.deps);
  assertEquals(s, {
    ran: true,
    outcome: 'no_sample',
    fresh: false,
    error: false,
    sampleCompletedAt: null,
  });
  assertEquals(h.queried, []);
  assertEquals(h.records[0].outcome, 'no_sample');
  assertEquals(errorAlerts(h.alerts), []);
});

Deno.test('正控：挑單查詢擲錯 → failed、不可改判、error 告警', async () => {
  const h = harness({ pickSample: () => Promise.reject(new Error('db down')) });
  const s = await runPositiveControl(h.deps);
  assertEquals(s.outcome, 'failed');
  assertEquals(s.fresh, false);
  assertEquals(s.error, true);
  assertEquals(h.queried, []);
  assertEquals(errorAlerts(h.alerts).length, 1);
});

// ------------------------------------------------------------
// 讀寫紀錄失敗（新 Edge 配舊 DB：表還不存在）
// ------------------------------------------------------------

Deno.test('正控：讀不到紀錄 → 不跑正控、不可改判、只寫 warning', async () => {
  const h = harness({ latest: () => Promise.reject(new Error('relation does not exist')) });
  const s = await runPositiveControl(h.deps);
  assertEquals(s, {
    ran: false,
    outcome: null,
    fresh: false,
    error: true,
    sampleCompletedAt: null,
  });
  assertEquals(h.queried, []);
  assertEquals(errorAlerts(h.alerts), []);
  assertEquals(h.alerts.length, 1);
});

Deno.test('正控：寫紀錄失敗 → 以本輪結果判讀（失敗就不改判，不回頭沿用舊 success）', async () => {
  const h = harness({
    latest: () => Promise.resolve({ checkedAt: ago(30 * HOUR), outcome: 'success' }),
    query: () => Promise.resolve({ raw: { Status: 'QUERY03001' }, decrypted: null }),
    record: () => Promise.reject(new Error('insert failed')),
  });
  const s = await runPositiveControl(h.deps);
  assertEquals(s, {
    ran: true,
    outcome: 'failed',
    fresh: false,
    error: true,
    sampleCompletedAt: SAMPLE_AT,
  });
});

// ------------------------------------------------------------
// 頻率與 36 小時窗
// ------------------------------------------------------------

Deno.test('正控：最近一次 success 未滿 23 小時 → 本輪不跑、沿用、可改判', async () => {
  const h = harness({
    latest: () => Promise.resolve({ checkedAt: ago(2 * HOUR), outcome: 'success' }),
  });
  const s = await runPositiveControl(h.deps);
  assertEquals(s, {
    ran: false,
    outcome: 'success',
    fresh: true,
    error: false,
    sampleCompletedAt: null,
  });
  assertEquals(h.queried, []);
  assertEquals(h.records, []);
});

Deno.test('正控：最近一次 success 已滿 23 小時 → 本輪重跑', () => {
  assertEquals(isControlDue({ checkedAt: ago(23 * HOUR - 1), outcome: 'success' }, NOW), false);
  assertEquals(isControlDue({ checkedAt: ago(23 * HOUR), outcome: 'success' }, NOW), true);
});

Deno.test('正控：最近一次 failed／no_sample → 每輪都重試', () => {
  for (const outcome of ['failed', 'no_sample'] as ControlOutcome[]) {
    assertEquals(isControlDue({ checkedAt: ago(10 * 60_000), outcome }, NOW), true, outcome);
  }
  assertEquals(isControlDue(null, NOW), true);
});

Deno.test('36 小時窗：success 在 36 小時整（含）內才可改判，多 1 毫秒就不行', () => {
  assertEquals(isControlFresh({ checkedAt: ago(36 * HOUR), outcome: 'success' }, NOW), true);
  assertEquals(isControlFresh({ checkedAt: ago(36 * HOUR + 1), outcome: 'success' }, NOW), false);
  assertEquals(isControlFresh({ checkedAt: ago(35 * HOUR), outcome: 'success' }, NOW), true);
});

Deno.test('36 小時窗：最近一次是 failed／no_sample、沒有紀錄、時間解析不了 → 不可改判', () => {
  assertEquals(isControlFresh({ checkedAt: ago(HOUR), outcome: 'failed' }, NOW), false);
  assertEquals(isControlFresh({ checkedAt: ago(HOUR), outcome: 'no_sample' }, NOW), false);
  assertEquals(isControlFresh(null, NOW), false);
  assertEquals(isControlFresh({ checkedAt: 'not-a-date', outcome: 'success' }, NOW), false);
});

// ------------------------------------------------------------
// 樣本年齡（獨立審查 P2-1／P2-2，W7-14）
// ------------------------------------------------------------

Deno.test('正控挑單：只挑付款完成至少 1 小時前的單（剛付款的單 PayUni 可能還沒定案）', async () => {
  let cutoff: Date | null = null;
  const h = harness({
    pickSample: (completedBefore) => {
      cutoff = completedBefore;
      return Promise.resolve({ tradeNo: 'SAMPLE1', completedAt: SAMPLE_AT });
    },
  });
  await runPositiveControl(h.deps);
  assertEquals(
    cutoff!.toISOString(),
    new Date(NOW.getTime() - SAMPLE_MIN_AGE_HOURS * HOUR).toISOString(),
  );
  assertEquals(SAMPLE_MIN_AGE_HOURS, 1);
});

Deno.test('正控樣本超過 14 天 → 寫 warning（不推 LINE）、不影響本輪可改判', async () => {
  const old = ago(SAMPLE_STALE_DAYS * 24 * HOUR + 1);
  const h = harness({ pickSample: () => Promise.resolve({ tradeNo: 'OLD1', completedAt: old }) });
  const s = await runPositiveControl(h.deps);
  assertEquals(s.fresh, true);
  assertEquals(s.sampleCompletedAt, old);
  assertEquals(h.records[0].sampleCompletedAt, old);
  assertEquals(errorAlerts(h.alerts), []);
  assertEquals(h.alerts.map((a) => [a.source, a.dedupe.reason, a.severity]), [
    [CONTROL_ALERT_SOURCE, 'sample_stale', 'warning'],
  ]);
  assertEquals(SAMPLE_STALE_DAYS, 14);
});

Deno.test('正控樣本 14 天整（含）以內 → 不寫 warning', async () => {
  const edge = ago(SAMPLE_STALE_DAYS * 24 * HOUR);
  const h = harness({ pickSample: () => Promise.resolve({ tradeNo: 'EDGE1', completedAt: edge }) });
  await runPositiveControl(h.deps);
  assertEquals(h.alerts, []);
});

// ------------------------------------------------------------
// 取證（W7-16）：對不到同號交易時，reason 帶解密後的鍵名與 Result 結構——只有鍵名，
// 不含任何值（單號、交易序號、卡號末碼、授權碼都不得出現）
// ------------------------------------------------------------

/** 官方形狀（W7-16）：解密後的 http_build_query 鍵名是 `Result[i][欄位]`。值已去識別化。 */
function realShape(tradeNo: string, tradeStatus = '1'): Record<string, string> {
  return {
    Status: 'SUCCESS',
    Message: '查詢成功',
    'Result[0][MerTradeNo]': tradeNo,
    'Result[0][TradeNo]': '1700000000000000001',
    'Result[0][TradeAmt]': '1200',
    'Result[0][TradeStatus]': tradeStatus,
    'Result[0][PaymentType]': '1',
    'Result[0][PaymentDay]': '2026-10-28 18:55:30',
    'Result[0][DataSource]': 'A',
    'Result[0][Card4No]': '0001',
    'Result[0][AuthCode]': '000000',
  };
}

Deno.test('正控：官方 Result[0][...] 形狀、同號 TradeStatus=1 → 成功', () => {
  assertEquals(
    evaluateControlResponse('SAMPLE1', { Status: 'SUCCESS' }, realShape('SAMPLE1')),
    { ok: true },
  );
  assertEquals(
    evaluateControlResponse('SAMPLE1', { Status: 'SUCCESS' }, realShape('SAMPLE1', '9')),
    { ok: false, reason: 'trade_status:9' },
  );
});

Deno.test('正控取證：Result[0][...] 對不到同號 → reason 只列鍵名、不含任何值', () => {
  const decrypted = realShape('OTHER');
  const v = evaluateControlResponse('SAMPLE1', { Status: 'SUCCESS' }, decrypted);
  assertEquals(v.ok, false);
  const reason = (v as { reason: string }).reason;
  assertEquals(
    reason,
    'no_matching_trade keys=Message,Result[0][AuthCode],Result[0][Card4No],' +
      'Result[0][DataSource],Result[0][MerTradeNo],Result[0][PaymentDay],Result[0][PaymentType],' +
      'Result[0][TradeAmt],Result[0][TradeNo],Result[0][TradeStatus],Status Result=absent',
  );
  for (
    const value of ['OTHER', '1700000000000000001', '0001', '000000', '2026-10-28', '查詢成功']
  ) {
    assert(!reason.includes(value), `洩漏值 ${value}`);
  }
});

Deno.test('正控取證：Result 不是 JSON → 只記 not-json，不記內容', () => {
  const v = evaluateControlResponse('S1', { Status: 'SUCCESS' }, { Result: 'S1|1|secret' });
  assertEquals(v, { ok: false, reason: 'no_matching_trade keys=Result Result=not-json' });
});

Deno.test('正控取證：鍵名過多時截斷，reason 長度有上限', () => {
  const decrypted: Record<string, string> = {};
  for (let i = 0; i < 200; i++) decrypted[`K${String(i).padStart(3, '0')}`] = 'v';
  const v = evaluateControlResponse('S1', { Status: 'SUCCESS' }, decrypted);
  const reason = (v as { reason: string }).reason;
  assert(reason.length <= 600, `長度 ${reason.length}`);
  assert(reason.includes('…'), reason);
});

Deno.test('正控：同號多列 1＋2 → 成功；2＋3 衝突 → failed multiple_matching_trades', () => {
  const rows = (a: string, b: string) => ({
    'Result[0][MerTradeNo]': 'S1',
    'Result[0][TradeStatus]': a,
    'Result[1][MerTradeNo]': 'S1',
    'Result[1][TradeStatus]': b,
  });
  assertEquals(evaluateControlResponse('S1', { Status: 'SUCCESS' }, rows('2', '1')), { ok: true });
  assertEquals(
    evaluateControlResponse('S1', { Status: 'SUCCESS' }, rows('2', '3')),
    { ok: false, reason: 'multiple_matching_trades' },
  );
});
