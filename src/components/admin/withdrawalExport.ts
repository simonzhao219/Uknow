import type { PagedResult } from '../../hooks/usePagedList';

export type ExportCollection<T> =
  | { ok: true; rows: T[] }
  | { ok: false; reason: 'changed' | 'aborted' };

export interface CollectOptions<T> {
  total: number;
  pageSize: number;
  loadPage: (page: { limit: number; offset: number }) => Promise<PagedResult<T>>;
  isMounted: () => boolean;
  onProgress?: (collected: number, total: number) => void;
}

export async function collectExportRows<T extends { id: string }>(
  _options: CollectOptions<T>,
): Promise<ExportCollection<T>> {
  return { ok: true, rows: [] };
}
