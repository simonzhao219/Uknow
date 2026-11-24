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
      [{ Result: JSON.stringify([{ TradeStatus: '1' }]) }, 'no_matching_trade'],
      [
        { Result: JSON.stringify([{ MerTradeNo: 'OTHER', TradeStatus: '1' }]) },
        'no_matching_trade',
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
