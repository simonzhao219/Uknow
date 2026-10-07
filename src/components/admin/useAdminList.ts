import { type PagedResult, type UsePagedList, usePagedList } from '../../hooks/usePagedList';
import type { AdminCache, AdminQuery } from './adminCache';

export const SLOW_UPDATE_MS = 15_000;
export const DATA_AGE_TICK_MS = 60_000;
export const STALE_HINT_MINUTES = 10;
export const REVALIDATE_DIM_DELAY_MS = 300;

export interface UseAdminListOptions<T, M, P> {
  cache?: AdminCache;
  query: AdminQuery<P>;
  load: (params: P, page: { limit: number; offset: number }) => Promise<PagedResult<T, M>>;
  pageSize: number;
}

export interface UseAdminList<T, M = unknown> extends UsePagedList<T, M> {
  fetchedAt: number | null;
  now: number;
  dataVersion: number;
  isSlow: boolean;
  loadPage: (page: { limit: number; offset: number }) => Promise<PagedResult<T, M>>;
}

export function useAdminList<T, M = unknown, P = unknown>({
  query,
  load,
  pageSize,
}: UseAdminListOptions<T, M, P>): UseAdminList<T, M> {
  const list = usePagedList<T, M>({
    load: (page) => load(query.params, page),
    pageSize,
    deps: [query.id],
  });
  return {
    ...list,
    fetchedAt: null,
    now: 0,
    dataVersion: 0,
    isSlow: false,
    loadPage: (page) => load(query.params, page),
  };
}
