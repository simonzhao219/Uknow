// @vitest-environment jsdom
//
// 同一個 dedupe 請求被兩個實例共用時（同頁兩處、或跨頁接力），後到的實例
// 自己的 fetch 不會跑——請求結束後它必須從快取補上資料，不能永遠停在載入中。
// 這是過去「同一個畫面只准掛一個實例」警語要防的那個餓死。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { DataCacheProvider } from '../contexts/DataCacheContext';
import { apiRequestJson } from '../utils/apiClient';

const { UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { UserCtx: createContext<any>({ user: { id: 'u1' } }) };
});
vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../utils/apiClient', () => ({
  apiRequestJson: vi.fn(),
  buildApiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));
vi.mock('../components/notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

import { useSubscription, type UseSubscriptionResult } from './useSubscription';

const mockRequest = vi.mocked(apiRequestJson);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const seen: Record<string, UseSubscriptionResult> = {};
function Probe({ id }: { id: string }) {
  seen[id] = useSubscription();
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

describe('useSubscription', () => {
  it('同頁兩個實例共用請求時，兩者都拿到會籍狀態', async () => {
    const status = deferred<unknown>();
    mockRequest.mockImplementation((() => status.promise) as never);

    render(<Harness showA showB />);

    await act(async () => {
      status.resolve({ success: true, data: { hasSubscription: true, status: 'active' } });
    });

    await waitFor(() => expect(seen.a.isLoading).toBe(false));
    await waitFor(() => expect(seen.b.isLoading).toBe(false));
    expect(seen.a.subscriptionData?.status).toBe('active');
    expect(seen.b.subscriptionData?.status).toBe('active');
  });

  it('接上的請求失敗時，結束載入並標記抓取失敗', async () => {
    const status = deferred<unknown>();
    mockRequest.mockImplementation((() => status.promise) as never);

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      status.reject(new Error('網路錯誤'));
    });

    await waitFor(() => expect(seen.b.isLoading).toBe(false));
    expect(seen.b.lastFetchFailed).toBe(true);
  });
});
