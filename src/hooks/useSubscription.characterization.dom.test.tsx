import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Characterization（Phase 1 護欄）：釘死 useSubscription 的 SWR 對外行為，
// 保護 Phase 3-D（四個 hook 收斂到 useFetchData）不改變契約：
//   1. 無快取時 mount → 呼叫 API、isLoading true→false、拿到 data。
//   2. 有快取時 mount → 秒開快取、仍背景 revalidate。
//   3. refresh() 清快取後重新請求。

const apiRequestJson = vi.fn();

vi.mock('../utils/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/apiClient')>();
  return {
    ...actual,
    apiRequestJson: (...args: any[]) => apiRequestJson(...args),
  };
});

import { UserContext } from '../App';
import { DataCacheProvider } from '../contexts/DataCacheContext';
import { NotificationProvider } from '../components/notifications/NotificationContext';
import { useSubscription } from './useSubscription';

const userValue: any = {
  user: { id: 'u1' },
  setUser: () => {},
  isLoggedIn: true,
  isAdmin: false,
  isLoadingUser: false,
  refreshUser: async () => null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <UserContext.Provider value={userValue}>
      <DataCacheProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </DataCacheProvider>
    </UserContext.Provider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  apiRequestJson.mockReset();
});

describe('useSubscription — SWR 對外行為現況', () => {
  it('無快取 mount：呼叫 API、載入結束後回傳 data', async () => {
    apiRequestJson.mockResolvedValue({ success: true, data: { hasSubscription: true, status: 'active' } });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiRequestJson).toHaveBeenCalledTimes(1);
    expect(result.current.subscriptionData).toEqual({ hasSubscription: true, status: 'active' });
  });

  it('refresh() 清快取後重新請求一次', async () => {
    apiRequestJson.mockResolvedValue({ success: true, data: { hasSubscription: false } });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    apiRequestJson.mockClear();

    await act(async () => {
      await result.current.refresh();
    });
    expect(apiRequestJson).toHaveBeenCalledTimes(1);
  });
});
