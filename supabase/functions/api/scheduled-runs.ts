// ============================================================
// 排程端點的帳本與租約包裝（對帳、刊登照片清理共用）。
//
// pg_cron 經 pg_net 呼叫端點是非同步的：cron.job_run_details 只記「請求排進
// 佇列」，看不到端點有沒有做完。所以由端點自己寫 scheduled_job_runs
// （migration 20261111000001），GitHub 看門狗與準時度量測都讀它。
//
// 契約（scheduled-runs.unit.test.ts 釘住）：
//   * fn 回傳 ScheduledRunOutcome。業務上的失敗（例如 query_all_failed 的
//     502）是**正常回傳**，不是擲錯——照 fn 給的 status／errorCode 落帳
//   * fn 擲錯 → 落帳 failed／exception，再往上丟給 handler 既有的 catch
//   * 沒拿到租約 → 不呼叫 fn，回 200 {skipped:'concurrent'}
//   * 帳本本身壞了（begin／finish 擲錯）→ 只記 log，照樣執行 fn、照樣回應：
//     帳本是觀測用，不能讓金流安全網因為觀測失敗而停擺。看門狗會因為沒有
//     完成列而補跑並告警，所以這個降級不會靜默
// ============================================================

export type ScheduledJob = 'reconcile' | 'purge-photos';
export type ScheduledTrigger = 'pg_cron' | 'github' | 'manual';

export type ScheduledRunOutcome = {
  status: 'succeeded' | 'failed';
  errorCode?: string;
  summary: Record<string, unknown>;
  response: { httpStatus: number; body: Record<string, unknown> };
};

export type ScheduledRunDeps = {
  begin: (
    job: ScheduledJob,
    trigger: ScheduledTrigger,
  ) => Promise<{ id: number; acquired: boolean }>;
  finish: (
    id: number,
    status: 'succeeded' | 'failed',
    summary: Record<string, unknown>,
    errorCode: string | null,
  ) => Promise<boolean>;
  logError: (message: string, ...detail: unknown[]) => void;
};

/** body.trigger 只認 pg_cron 與 github；缺漏、非字串、其他值一律 manual。 */
export function parseScheduledTrigger(body: unknown): ScheduledTrigger {
  const t = (body as { trigger?: unknown } | null)?.trigger;
  return t === 'pg_cron' || t === 'github' ? t : 'manual';
}

export const SKIPPED_RESPONSE = {
  httpStatus: 200,
  body: { success: true, data: { skipped: 'concurrent' } },
} as const;

export async function withScheduledRun(
  deps: ScheduledRunDeps,
  job: ScheduledJob,
  trigger: ScheduledTrigger,
  fn: () => Promise<ScheduledRunOutcome>,
): Promise<ScheduledRunOutcome['response']> {
  let leaseId: number | null = null;
  try {
    const lease = await deps.begin(job, trigger);
    if (!lease.acquired) {
      return { httpStatus: SKIPPED_RESPONSE.httpStatus, body: { ...SKIPPED_RESPONSE.body } };
    }
    leaseId = lease.id;
  } catch (e) {
    deps.logError(`[scheduled-runs] ${job} 取租約失敗，照樣執行（不落帳）`, e);
  }

  const finish = async (
    status: 'succeeded' | 'failed',
    summary: Record<string, unknown>,
    errorCode: string | null,
  ) => {
    if (leaseId === null) return;
    try {
      await deps.finish(leaseId, status, summary, errorCode);
    } catch (e) {
      deps.logError(`[scheduled-runs] ${job} 寫帳本失敗`, e);
    }
  };

  let outcome: ScheduledRunOutcome;
  try {
    outcome = await fn();
  } catch (e) {
    await finish('failed', {}, 'exception');
    throw e;
  }
  await finish(outcome.status, outcome.summary, outcome.errorCode ?? null);
  return outcome.response;
}
