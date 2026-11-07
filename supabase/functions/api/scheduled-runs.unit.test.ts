// ============================================================
// withScheduledRun：排程端點的帳本與租約包裝（scheduled-runs.ts）。
//
// 對帳與照片清理兩支 internal 端點都用它包住業務邏輯：先取租約
// （begin_scheduled_run），做完寫結果（finish_scheduled_run）。這支測試只用
// 注入的假 rpc，不碰資料庫（T4）；租約本身的交易語意在
// scheduled-job-runs.test.ts 用真 Postgres 驗。
//
// 契約：
//   * 業務上的失敗（例如 query_all_failed 的 502）是 fn **正常回傳**的結果，
//     照 fn 給的 status／errorCode 落帳，回應照 fn 給的回
//   * fn 擲錯 → 落帳 failed／exception，錯誤照樣往上丟給 handler 的 catch
//   * 沒拿到租約 → 不呼叫 fn，回 200 skipped
//   * 帳本本身壞了（begin 擲錯）→ 照樣執行 fn：帳本是觀測用，不能讓金流
//     安全網因為觀測失敗而停擺
// ============================================================
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  parseScheduledTrigger,
  type ScheduledRunDeps,
  type ScheduledRunOutcome,
  withScheduledRun,
} from './scheduled-runs.ts';

type FinishCall = { id: number; status: string; summary: unknown; errorCode: string | null };

function fakeDeps(
  opts: { acquired?: boolean; beginThrows?: boolean; finishThrows?: boolean } = {},
) {
  const begins: Array<{ job: string; trigger: string }> = [];
  const finishes: FinishCall[] = [];
  const deps: ScheduledRunDeps = {
    begin: (job, trigger) => {
      begins.push({ job, trigger });
      if (opts.beginThrows) return Promise.reject(new Error('db down'));
      return Promise.resolve({ id: 42, acquired: opts.acquired ?? true });
    },
    finish: (id, status, summary, errorCode) => {
      finishes.push({ id, status, summary, errorCode });
      if (opts.finishThrows) return Promise.reject(new Error('db down'));
      return Promise.resolve(true);
    },
    logError: () => {},
  };
  return { deps, begins, finishes };
}

const ok: ScheduledRunOutcome = {
  status: 'succeeded',
  summary: { checked: 1 },
  response: { httpStatus: 200, body: { success: true, data: { checked: 1 } } },
};

Deno.test('withScheduledRun：拿到租約且 fn 成功 → 落帳 succeeded、回 fn 的回應', async () => {
  const { deps, begins, finishes } = fakeDeps();
  const res = await withScheduledRun(deps, 'reconcile', 'pg_cron', () => Promise.resolve(ok));
  assertEquals(begins, [{ job: 'reconcile', trigger: 'pg_cron' }]);
  assertEquals(finishes, [{
    id: 42,
    status: 'succeeded',
    summary: { checked: 1 },
    errorCode: null,
  }]);
  assertEquals(res, ok.response);
});

Deno.test('withScheduledRun：fn 回傳業務失敗（不擲錯）→ 照 fn 的 status 與 errorCode 落帳', async () => {
  const { deps, finishes } = fakeDeps();
  const failed: ScheduledRunOutcome = {
    status: 'failed',
    errorCode: 'query_all_failed',
    summary: { checked: 2, queryErrors: 2 },
    response: { httpStatus: 502, body: { success: false, error: { code: 'query_all_failed' } } },
  };
  const res = await withScheduledRun(deps, 'reconcile', 'github', () => Promise.resolve(failed));
  assertEquals(finishes, [{
    id: 42,
    status: 'failed',
    summary: { checked: 2, queryErrors: 2 },
    errorCode: 'query_all_failed',
  }]);
  assertEquals(res.httpStatus, 502);
});

Deno.test('withScheduledRun：fn 擲錯 → 落帳 failed／exception，錯誤照樣往上丟', async () => {
  const { deps, finishes } = fakeDeps();
  await assertRejects(
    () => withScheduledRun(deps, 'reconcile', 'pg_cron', () => Promise.reject(new Error('boom'))),
    Error,
    'boom',
  );
  assertEquals(finishes.length, 1);
  assertEquals(finishes[0].status, 'failed');
  assertEquals(finishes[0].errorCode, 'exception');
});

Deno.test('withScheduledRun：沒拿到租約 → 不呼叫 fn、不落 finish、回 200 skipped', async () => {
  const { deps, finishes } = fakeDeps({ acquired: false });
  let called = false;
  const res = await withScheduledRun(deps, 'purge-photos', 'pg_cron', () => {
    called = true;
    return Promise.resolve(ok);
  });
  assertEquals(called, false);
  assertEquals(finishes, []);
  assertEquals(res, {
    httpStatus: 200,
    body: { success: true, data: { skipped: 'concurrent' } },
  });
});

Deno.test('withScheduledRun：帳本 begin 擲錯 → 照樣執行 fn（觀測失敗不得停掉安全網）', async () => {
  const { deps, finishes } = fakeDeps({ beginThrows: true });
  let called = false;
  const res = await withScheduledRun(deps, 'reconcile', 'pg_cron', () => {
    called = true;
    return Promise.resolve(ok);
  });
  assert(called);
  assertEquals(finishes, []);
  assertEquals(res, ok.response);
});

Deno.test('withScheduledRun：帳本 finish 擲錯 → 不影響回應', async () => {
  const { deps } = fakeDeps({ finishThrows: true });
  const res = await withScheduledRun(deps, 'reconcile', 'pg_cron', () => Promise.resolve(ok));
  assertEquals(res, ok.response);
});

Deno.test('parseScheduledTrigger：只認 pg_cron 與 github，其餘（含缺漏、非字串）一律 manual', () => {
  assertEquals(parseScheduledTrigger({ trigger: 'pg_cron' }), 'pg_cron');
  assertEquals(parseScheduledTrigger({ trigger: 'github' }), 'github');
  assertEquals(parseScheduledTrigger({ trigger: 'manual' }), 'manual');
  assertEquals(parseScheduledTrigger({ trigger: 'PG_CRON' }), 'manual');
  assertEquals(parseScheduledTrigger({ trigger: 1 }), 'manual');
  assertEquals(parseScheduledTrigger({}), 'manual');
  assertEquals(parseScheduledTrigger(null), 'manual');
});
