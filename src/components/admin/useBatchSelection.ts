import { useState } from 'react';

export interface BatchSelection {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  replace: (ids: Iterable<string>) => void;
  clear: () => void;
}

export function useBatchSelection(_version: number): BatchSelection {
  const [ids] = useState<ReadonlySet<string>>(new Set());
  return { selected: ids, toggle: () => {}, replace: () => {}, clear: () => {} };
}
