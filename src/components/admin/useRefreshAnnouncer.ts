import type { RefreshOutcome } from '../../hooks/usePagedList';

export interface RefreshableList {
  isUpdating: boolean;
  reload: () => Promise<RefreshOutcome>;
  settled: () => Promise<RefreshOutcome>;
}

export function useRefreshAnnouncer(_list: RefreshableList): {
  statusText: string;
  refresh: () => void;
} {
  return { statusText: '', refresh: () => {} };
}
