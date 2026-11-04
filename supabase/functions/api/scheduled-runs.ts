// 階段 1 stub：只求型別過，行為待綠燈實作。
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

export function parseScheduledTrigger(_body: unknown): ScheduledTrigger {
  return 'pg_cron';
}

export function withScheduledRun(
  _deps: ScheduledRunDeps,
  _job: ScheduledJob,
  _trigger: ScheduledTrigger,
  _fn: () => Promise<ScheduledRunOutcome>,
): Promise<ScheduledRunOutcome['response']> {
  return Promise.resolve({ httpStatus: 0, body: {} });
}
