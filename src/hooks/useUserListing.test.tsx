// @vitest-environment jsdom
//
// 跨頁接力的契約（同 useRewardData.test.tsx）：會員中心的冷啟動查詢還在飛時
// 點「刊登」卡進刊登管理頁，新頁實例接上同一個 dedupe 請求，查詢結束後必須
// 拿到結果或錯誤態，不能永遠停在載入中。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { DataCacheProvider } from '../contexts/DataCacheContext';

const { UserCtx, query } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<any>({ user: { id: 'u1' } }),
    query: { current: null as Promise<unknown> | null },
  };
});
vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => query.current }) }) }),
  }),
}));
vi.mock('../components/notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

import { useUserListing, type UseUserListingResult } from './useUserListing';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const seen: Record<string, UseUserListingResult> = {};
function Probe({ id }: { id: string }) {
  seen[id] = useUserListing();
  return null;
}
function Harness({ showA, showB }: { showA: boolean; showB: boolean }) {
  return (
    <DataCacheProvider>
      {showA && <Probe id="a" />}
      {showB && <Probe id="b" />}
    </DataCacheProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('useUserListing', () => {
  it('接上別頁飛行中的查詢時，查詢完成後拿到刊登', async () => {
    const q = deferred<unknown>();
    query.current = q.promise;

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      q.resolve({ data: { id: 'l1', name: '台北好店' }, error: null });
    });

    await waitFor(() => expect(seen.b.loading).toBe(false));
    expect(seen.b.listing?.name).toBe('台北好店');
    expect(seen.b.error).toBeNull();
  });

  it('接上的查詢失敗時，給錯誤態而不是一直載入', async () => {
    const q = deferred<unknown>();
    query.current = q.promise;

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      q.reject(new Error('網路錯誤'));
    });

    await waitFor(() => expect(seen.b.loading).toBe(false));
    expect(seen.b.error).toBeTruthy();
    expect(seen.b.listing).toBeNull();
  });
});
