export type WriteFailure = 'rejected' | 'unknown';

export function classifyWriteFailure(_err: unknown): WriteFailure {
  return 'rejected';
}
