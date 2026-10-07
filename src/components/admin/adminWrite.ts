import type { AdminBusy } from './adminBusy';
import type { AdminCache, AdminMutationEvent } from './adminCache';

export type AdminWriteOutcome<R> =
  | { kind: 'done'; result: R }
  | { kind: 'rejected' | 'unknown'; error: unknown };

export interface AdminWriteOptions<R> {
  busy: AdminBusy;
  cache?: AdminCache;
  event: AdminMutationEvent | null;
  submit: () => Promise<R>;
  committed?: (result: R) => boolean;
  settle: (outcome: AdminWriteOutcome<R>) => void;
  reload: () => unknown;
}

export async function runAdminWrite<R>(
  _options: AdminWriteOptions<R>,
): Promise<AdminWriteOutcome<R>> {
  return { kind: 'unknown', error: null };
}
