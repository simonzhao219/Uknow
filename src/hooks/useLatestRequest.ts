import { useRef } from 'react';

export interface Ticket {
  seq: number;
  stamp: number;
  entityId?: string;
  entityVersion?: number;
}

export interface LatestRequest {
  begin(entityId?: string): Ticket;
  peek(): Ticket;
  isLatest(t: Ticket): boolean;
  markChanged(entityId: string): void;
  changedSince(t: Ticket): boolean;
}

export function nextStamp(): number {
  return 0;
}

export function createLatestRequest(): LatestRequest {
  return {
    begin: () => ({ seq: 0, stamp: 0 }),
    peek: () => ({ seq: -1, stamp: -1 }),
    isLatest: () => true,
    markChanged: () => {},
    changedSince: () => true,
  };
}

export function useLatestRequest(): LatestRequest {
  const ref = useRef<LatestRequest | null>(null);
  if (ref.current === null) ref.current = createLatestRequest();
  return ref.current;
}
