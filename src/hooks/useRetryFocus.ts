import { useCallback, useRef } from 'react';

export function useRetryFocus(_state: { loading: boolean; failed: boolean }) {
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const retry = useCallback((fn: () => unknown) => fn(), []);
  return { errorRef, headingRef, retry };
}
